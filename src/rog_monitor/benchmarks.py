"""Synthetic CPU/GPU thermal benchmarks for the desktop app."""

from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import signal
import statistics
import struct
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

from . import __version__
from .config import Config
from .cpu import CpuReader
from .fans import FanReader, guardian_status, load_caps
from .gpu import GpuReader
from .hwmon import read_str, scan
from .power import BatteryReader, RaplReader, asus_profile, ppd_profile


# Versión del esquema del resultado. 1 = solo samples+summary (≤ v20);
# 2 = + conditions, warm-up, repeticiones, stats (p50/p95/p99) y throughput.
SCHEMA_VERSION = 2

# Método de percentil (documentado en docs/BENCHMARKS.md): interpolación lineal
# "inclusive" (tipo 7 de Hyndman-Fan; = statistics.quantiles(method='inclusive')).
PERCENTILE_METHOD = "linear-inclusive"

# Magnitudes con estadística completa (las que existan en las muestras).
STAT_KEYS = (
    "cpu_temp", "cpu_package", "cpu_watts", "cpu_freq_ghz", "cpu_util",
    "gpu_temp", "gpu_watts", "gpu_util", "gpu_clock_mhz",
)

# Condición térmica de partida: solo AVISA (nunca bloquea). Se avisa si la CPU
# arranca por encima de IDLE_BASELINE_C + START_MARGIN_C.
# ponytail: 55 °C ≈ reposo real de este portátil en performance (50-58 °C); con 45 avisaba casi siempre.
IDLE_BASELINE_C = 55.0
START_MARGIN_C = 10.0
WARMUP_S = 5
COOLDOWN_S = 10

# Cada hilo de carga cuenta iteraciones completadas (lotes de CPU_BURN_BATCH) y
# escribe el acumulado en su propio archivo (pwrite de 8 bytes): el padre lo lee
# sin tuberías ni locks. Es la métrica de "rendimiento" (iter/s) del benchmark.
CPU_BURN_BATCH = 100_000
CPU_BURN = (
    "import os, struct, sys\n"
    "fd = os.open(sys.argv[1], os.O_WRONLY | os.O_CREAT, 0o600)\n"
    "value = 0.0001\n"
    "done = 0\n"
    "while True:\n"
    f"    for _ in range({CPU_BURN_BATCH}):\n"
    "        value = (value * 1.00000031) + 3.14159265\n"
    "        if value > 1_000_000:\n"
    "            value = 0.0001\n"
    f"    done += {CPU_BURN_BATCH}\n"
    "    os.pwrite(fd, struct.pack('<Q', done), 0)\n"
)


# ---------------------------------------------------------------- estadística
# Funciones puras (sin hardware): testeadas con series fijas en tests/test_benchmarks.py.

def percentile(values: list[float], q: float) -> float | None:
    """Percentil q (0-100) por interpolación lineal inclusive (tipo 7):
    posición h = (n-1)*q/100 sobre la serie ordenada. None si no hay datos."""
    data = sorted(values)
    if not data:
        return None
    h = (len(data) - 1) * q / 100
    lo = math.floor(h)
    hi = min(lo + 1, len(data) - 1)
    return data[lo] + (h - lo) * (data[hi] - data[lo])


def describe(values: list[float]) -> dict | None:
    """n, mean, min, max, stdev (muestral, n-1; None si n<2) y p50/p95/p99."""
    vals = [v for v in values if v is not None]
    if not vals:
        return None
    return {
        "n": len(vals),
        "mean": round(statistics.fmean(vals), 3),
        "min": round(min(vals), 3),
        "max": round(max(vals), 3),
        "stdev": round(statistics.stdev(vals), 3) if len(vals) > 1 else None,
        "p50": round(percentile(vals, 50), 3),
        "p95": round(percentile(vals, 95), 3),
        "p99": round(percentile(vals, 99), 3),
    }


def cv_percent(values: list[float]) -> float | None:
    """Coeficiente de variación = stdev muestral / media * 100. None si n<2 o media 0."""
    vals = [v for v in values if v is not None]
    if len(vals) < 2:
        return None
    mean = statistics.fmean(vals)
    return round(statistics.stdev(vals) / mean * 100, 3) if mean else None


def sample_stats(samples: list[dict], keys=STAT_KEYS) -> dict:
    """describe() por magnitud presente en las muestras (las ausentes no aparecen)."""
    out = {}
    for key in keys:
        stats = describe([s.get(key) for s in samples])
        if stats:
            out[key] = stats
    return out


def build_stats(reps: list[list[dict]], keys=STAT_KEYS) -> dict:
    """Estadística por repetición + agregada (todas las muestras medidas juntas)
    + CV entre repeticiones de la media de cada magnitud (None con 1 repetición)."""
    per_rep = [sample_stats(r, keys) for r in reps]
    pooled = [s for r in reps for s in r]
    cv = {}
    if len(reps) > 1:
        for key in keys:
            means = [st[key]["mean"] for st in per_rep if key in st]
            value = cv_percent(means)
            if value is not None:
                cv[key] = value
    return {
        "percentile_method": PERCENTILE_METHOD,
        "aggregate": sample_stats(pooled, keys),
        "per_rep": per_rep,
        "cv_across_reps_pct": cv or None,
    }


def throughput(samples: list[dict]) -> float | None:
    """Iteraciones/s totales = Δwork / Δt entre la primera y la última muestra medida."""
    pts = [(s["t"], s["work"]) for s in samples if s.get("work") is not None]
    if len(pts) < 2 or pts[-1][0] <= pts[0][0]:
        return None
    return round((pts[-1][1] - pts[0][1]) / (pts[-1][0] - pts[0][0]), 1)


def _collect_sample(cpu: CpuReader, gpu: GpuReader, fans: FanReader, rapl: RaplReader, started: float,
                    profile: str | None = None) -> dict:
    cpu_state = cpu.read()
    gpu_state = gpu.read()
    fan_state = fans.read(profile)
    return {
        "t": round(time.monotonic() - started, 3),
        "cpu_temp": cpu_state.get("avg"),
        "cpu_package": cpu_state.get("package"),
        "cpu_watts": rapl.read_watts(),
        "cpu_freq_ghz": cpu_state.get("freq_ghz"),
        "cpu_util": cpu_state.get("usage"),
        "cpu_throttle_count": cpu_state.get("throttle_count"),
        "cpu_throttle_ms": cpu_state.get("throttle_ms"),
        "gpu_temp": (gpu_state.get("active") or {}).get("temp"),
        "gpu_watts": (gpu_state.get("active") or {}).get("power"),
        "gpu_util": (gpu_state.get("active") or {}).get("util"),
        "gpu_clock_mhz": (gpu_state.get("active") or {}).get("clock_mhz"),
        "fans": {fan["label"]: fan["rpm"] for fan in fan_state},
    }


def _summarize(samples: list[dict], profile: str | None = None) -> dict:
    def max_of(key: str):
        values = [sample.get(key) for sample in samples if sample.get(key) is not None]
        return max(values) if values else None

    first = samples[0] if samples else {}
    last = samples[-1] if samples else {}
    fan_max = {}
    for sample in samples:
        for label, rpm in sample.get("fans", {}).items():
            fan_max[label] = max(fan_max.get(label, 0), rpm)

    # verdict: did every capped fan stay at/under its cap? (±75 RPM jitter)
    caps = load_caps(profile)
    cap_check = {
        label: {"cap": cap, "max": fan_max.get(label), "ok": fan_max.get(label, 0) <= cap + 75}
        for label, cap in caps.items()
        if label in fan_max
    }

    return {
        "fan_cap": cap_check or None,
        "cap_respected": all(c["ok"] for c in cap_check.values()) if cap_check else None,
        "cpu_temp_max": max_of("cpu_temp"),
        "cpu_package_max": max_of("cpu_package"),
        "cpu_watts_max": max_of("cpu_watts"),
        "gpu_temp_max": max_of("gpu_temp"),
        "gpu_watts_max": max_of("gpu_watts"),
        "gpu_util_max": max_of("gpu_util"),
        "throttle_events": (
            (last.get("cpu_throttle_count") or 0) - (first.get("cpu_throttle_count") or 0)
        ),
        "throttle_ms": (
            (last.get("cpu_throttle_ms") or 0) - (first.get("cpu_throttle_ms") or 0)
        ),
        "fan_rpm_max": fan_max,
    }


def _terminate_process(proc: subprocess.Popen) -> None:
    if proc.poll() is not None:
        return
    proc.send_signal(signal.SIGTERM)
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=5)


class _CpuLoad:
    """N procesos Python al 100%; cada uno publica sus iteraciones en un archivo."""

    def __init__(self, workers: int):
        self.workers = workers
        self.procs: list[subprocess.Popen] = []
        self.dir = ""

    def start(self) -> None:
        self.dir = tempfile.mkdtemp(prefix="rog-bench-")
        self.procs = [
            subprocess.Popen(
                [sys.executable, "-c", CPU_BURN, os.path.join(self.dir, str(i))],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            for i in range(self.workers)
        ]

    def alive(self) -> bool:
        return True  # la carga de CPU dura lo que pida el bucle

    def work(self) -> int:
        total = 0
        for i in range(self.workers):
            try:
                with open(os.path.join(self.dir, str(i)), "rb") as fh:
                    raw = fh.read(8)
                if len(raw) == 8:
                    total += struct.unpack("<Q", raw)[0]
            except OSError:
                pass  # el worker aún no creó su archivo
        return total

    def stop(self) -> None:
        for proc in self.procs:
            if proc.poll() is None:
                proc.terminate()
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=2)
        if self.dir:
            shutil.rmtree(self.dir, ignore_errors=True)  # dir propio de mkdtemp
            self.dir = ""


def _nvidia_driver() -> str | None:
    """Versión del driver NVIDIA desde sysfs (sin lanzar nvidia-smi)."""
    return read_str(Path("/sys/module/nvidia/version")) or read_str(Path("/sys/module/amdgpu/version"))


def _conditions(cpu_state: dict, gpu_state: dict, params: dict) -> dict:
    """Condiciones del run (CP-7.05), leídas de los lectores ya existentes."""
    bat = BatteryReader().read()
    active = gpu_state.get("active") or {}
    guardian = guardian_status()
    profile = asus_profile()
    return {
        "app_version": __version__,
        "schema": SCHEMA_VERSION,
        "kernel": os.uname().release,
        "cpu_model": cpu_state.get("model"),
        "gpu_name": active.get("name"),
        "gpu_driver": _nvidia_driver(),
        "power_source": None if bat is None else ("ac" if bat.get("on_ac") else "battery"),
        "asus_profile": profile,
        "ppd_profile": ppd_profile(),
        "epp": cpu_state.get("epp"),
        "governor": cpu_state.get("governor"),
        "fan_caps": load_caps(profile) or None,
        "guardian": {"mode": guardian.get("mode"), "thermal_state": guardian.get("thermal_state")},
        "ambient_start": {"cpu_temp": cpu_state.get("avg"), "gpu_temp": active.get("temp")},
        **params,
    }


def _run_repetitions(load, seconds: int, warmup: int, reps: int, cooldown: int,
                     idle_baseline: float, margin: float, params: dict) -> dict:
    """Bucle común CPU/GPU: por repetición, aviso de arranque en caliente,
    warm-up (muestras con warmup=True, fuera de stats) y fase medida."""
    chips = scan()
    cfg = Config()
    cpu = CpuReader(chips)
    gpu = GpuReader(chips)
    fans = FanReader(chips, cfg)
    rapl = RaplReader()
    profile = asus_profile()

    # prime the RAPL delta calculation before the hot loop starts
    rapl.read_watts()
    time.sleep(0.5)
    conditions = _conditions(cpu.read(), gpu.read(), params)

    started = time.monotonic()
    wall_started = datetime.now(timezone.utc).isoformat()
    samples: list[dict] = []
    runs: list[dict] = []
    warnings: list[dict] = []
    for rep in range(1, reps + 1):
        if rep > 1 and cooldown > 0:
            time.sleep(cooldown)
        start = _collect_sample(cpu, gpu, fans, rapl, started, profile)
        hot = start["cpu_temp"] is not None and start["cpu_temp"] > idle_baseline + margin
        if hot:
            warnings.append({"code": "start_hot", "rep": rep, "cpu_temp": start["cpu_temp"],
                             "limit": idle_baseline + margin})
        load.start()
        rep_samples: list[dict] = []
        try:
            for phase_s, is_warm in ((warmup, True), (seconds, False)):
                deadline = time.monotonic() + phase_s
                while time.monotonic() < deadline and load.alive():
                    rep_samples.append(_tag(_collect_sample(cpu, gpu, fans, rapl, started, profile),
                                            load, rep, is_warm))
                    time.sleep(1)
            rep_samples.append(_tag(_collect_sample(cpu, gpu, fans, rapl, started, profile), load, rep, False))
        finally:
            load.stop()
        samples += rep_samples
        measured = [s for s in rep_samples if not s["warmup"]]
        runs.append({
            "rep": rep,
            "start": {"cpu_temp": start["cpu_temp"], "gpu_temp": start["gpu_temp"]},
            "hot_start": hot,
            "score_ips": throughput(measured),
        })

    measured_reps = [[s for s in samples if s["rep"] == r["rep"] and not s["warmup"]] for r in runs]
    return {
        "samples": samples,
        "measured": [s for rep in measured_reps for s in rep],
        "measured_reps": measured_reps,
        "runs": runs,
        "warnings": warnings,
        "conditions": conditions,
        "started_at": wall_started,
        "profile": profile,
    }


def _tag(sample: dict, load, rep: int, warm: bool) -> dict:
    sample["rep"] = rep
    sample["warmup"] = warm
    work = load.work()
    if work is not None:
        sample["work"] = work
    return sample


def _finish(kind: str, label: str, seconds: int, warmup: int, reps: int, run: dict, extra: dict) -> dict:
    """Arma el resultado v2: stats por repetición/agregadas, throughput y condiciones."""
    stats = build_stats(run["measured_reps"])
    for r, per in zip(run["runs"], stats["per_rep"]):
        r["stats"] = per
    result = {
        "ok": True,
        "schema": SCHEMA_VERSION,
        "kind": kind,
        "seconds": seconds,
        "warmup_seconds": warmup,
        "repetitions": reps,
        "tool": label,
        "started_at": run["started_at"],
        "samples": run["samples"],
        "summary": _summarize(run["measured"], run["profile"]),
        "stats": {k: v for k, v in stats.items() if k != "per_rep"},
        "runs": run["runs"],
        "warnings": run["warnings"],
        "conditions": run["conditions"],
        **extra,
    }
    scores = [r["score_ips"] for r in run["runs"] if r["score_ips"] is not None]
    if scores:
        threads = run["conditions"].get("threads") or 1
        result["throughput"] = {
            "unit": "iter/s",
            "score_ips": round(statistics.fmean(scores), 1),
            "per_thread_ips": round(statistics.fmean(scores) / threads, 1),
            "per_rep": scores,
            "cv_pct": cv_percent(scores),
        }
    return result


def run_cpu_benchmark(seconds: int = 45, workers: int | None = None, warmup: int = WARMUP_S,
                      reps: int = 1, cooldown: int = COOLDOWN_S,
                      idle_baseline: float = IDLE_BASELINE_C, margin: float = START_MARGIN_C) -> dict:
    workers = workers or max(1, os.cpu_count() or 1)
    params = {"threads": workers, "seconds": seconds, "warmup_seconds": warmup, "repetitions": reps,
              "idle_baseline_c": idle_baseline, "start_margin_c": margin}
    run = _run_repetitions(_CpuLoad(workers), seconds, warmup, reps, cooldown,
                           idle_baseline, margin, params)
    return _finish("cpu", f"CPU al 100% · {workers} hilos en paralelo", seconds, warmup, reps, run, {})


# Cuántas instancias paralelas lanzar cuando la carga es un demo "ligero"
# (vkcube/glxgears). Una sola instancia se queda ~7% de uso porque está
# limitada por vsync y geometría trivial; 4 en modo IMMEDIATE saturan la
# dGPU al ~99% en la RTX 4060.
GPU_LOAD_INSTANCES = 4

# Mesa y NVIDIA usan variables distintas para desactivar el vsync; ponemos
# ambas para uncapear el framerate y exigir de verdad la GPU.
GPU_LOAD_ENV = {
    "vblank_mode": "0",            # Mesa
    "__GL_SYNC_TO_VBLANK": "0",    # NVIDIA
}


def _gpu_load_plan() -> tuple[list[list[str]], str] | None:
    """Devuelve (lista de comandos a lanzar en paralelo, etiqueta).

    Prefiere benchmarks reales (glmark2/vkmark). Si solo hay demos ligeros
    (vkcube/glxgears) lanza varias instancias sin vsync para saturar la GPU.
    """
    glmark2 = shutil.which("glmark2")
    if glmark2:
        return [[glmark2, "--off-screen"]], "glmark2 --off-screen"
    vkmark = shutil.which("vkmark")
    if vkmark:
        return [[vkmark]], "vkmark"
    vkcube = shutil.which("vkcube")
    if vkcube:
        cmd = [vkcube, "--present_mode", "0", "--width", "1920", "--height", "1080"]
        return [list(cmd) for _ in range(GPU_LOAD_INSTANCES)], f"vkcube ×{GPU_LOAD_INSTANCES} (immediate 1080p)"
    glxgears = shutil.which("glxgears")
    if glxgears:
        return [[glxgears, "-fullscreen"] for _ in range(GPU_LOAD_INSTANCES)], f"glxgears ×{GPU_LOAD_INSTANCES}"
    return None


class _GpuLoad:
    """Instancias paralelas de glmark2/vkmark/vkcube/glxgears (sin métrica de trabajo)."""

    def __init__(self, commands: list[list[str]]):
        self.commands = commands
        self.procs: list[subprocess.Popen] = []

    def start(self) -> None:
        load_env = dict(os.environ, **GPU_LOAD_ENV)
        self.procs = [
            subprocess.Popen(
                command,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
                env=load_env,
            )
            for command in self.commands
        ]

    def alive(self) -> bool:
        # mientras quede al menos un proceso de carga vivo
        return any(p.poll() is None for p in self.procs)

    def work(self) -> None:
        return None

    def stop(self) -> None:
        for proc in self.procs:
            _terminate_process(proc)


def run_gpu_benchmark(seconds: int = 45, warmup: int = WARMUP_S, reps: int = 1,
                      cooldown: int = COOLDOWN_S, idle_baseline: float = IDLE_BASELINE_C,
                      margin: float = START_MARGIN_C) -> dict:
    plan = _gpu_load_plan()
    if not plan:
        return {
            "ok": False,
            "kind": "gpu",
            "err": "No encontré glmark2, vkmark, vkcube ni glxgears. Instala una de esas herramientas para habilitar el benchmark de GPU.",
        }
    commands, label = plan
    params = {"threads": len(commands), "seconds": seconds, "warmup_seconds": warmup, "repetitions": reps,
              "idle_baseline_c": idle_baseline, "start_margin_c": margin}
    run = _run_repetitions(_GpuLoad(commands), seconds, warmup, reps, cooldown, idle_baseline, margin, params)

    if not run["measured"]:
        return {"ok": False, "kind": "gpu", "err": "No pude capturar muestras del benchmark GPU."}

    summary = _summarize(run["measured"], run["profile"])
    if (
        summary.get("gpu_temp_max") is None
        and summary.get("gpu_watts_max") is None
        and summary.get("gpu_util_max") is None
    ):
        return {
            "ok": False,
            "kind": "gpu",
            "err": (
                f"La carga local ({label}) corrió, pero no vi telemetría real de la GPU. "
                "Probablemente no enganchó la dGPU. Cambia a modo Hybrid/dGPU e inténtalo de nuevo."
            ),
        }

    return _finish("gpu", label, seconds, warmup, reps, run, {"instances": len(commands)})


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="python -m rog_monitor.benchmarks")
    sub = parser.add_subparsers(dest="cmd", required=True)

    for name in ("cpu", "gpu"):
        p = sub.add_parser(name)
        p.add_argument("--seconds", type=int, default=45, help="duración medida por repetición")
        p.add_argument("--warmup", type=int, default=WARMUP_S, help="segundos de calentamiento excluidos de stats")
        p.add_argument("--reps", type=int, default=1, help="repeticiones")
        p.add_argument("--cooldown", type=int, default=COOLDOWN_S, help="pausa entre repeticiones (s)")
        p.add_argument("--idle-baseline", type=float, default=IDLE_BASELINE_C,
                       help="°C de CPU en reposo; con --start-margin define el aviso de arranque en caliente")
        p.add_argument("--start-margin", type=float, default=START_MARGIN_C)
        if name == "cpu":
            p.add_argument("--workers", type=int, default=None)

    args = parser.parse_args(argv)
    common = dict(seconds=args.seconds, warmup=max(0, args.warmup), reps=max(1, args.reps),
                  cooldown=max(0, args.cooldown), idle_baseline=args.idle_baseline, margin=args.start_margin)
    if args.cmd == "cpu":
        print(json.dumps(run_cpu_benchmark(workers=args.workers, **common)))
        return 0
    if args.cmd == "gpu":
        print(json.dumps(run_gpu_benchmark(**common)))
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
