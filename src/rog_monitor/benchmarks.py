"""Synthetic CPU/GPU thermal benchmarks for the desktop app."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone

from .cpu import CpuReader
from .fans import FanReader
from .gpu import GpuReader
from .hwmon import scan
from .power import RaplReader
from .config import Config


CPU_BURN = (
    "value = 0.0001\n"
    "while True:\n"
    "    value = (value * 1.00000031) + 3.14159265\n"
    "    if value > 1_000_000:\n"
    "        value = 0.0001\n"
)


def _collect_sample(cpu: CpuReader, gpu: GpuReader, fans: FanReader, rapl: RaplReader, started: float) -> dict:
    cpu_state = cpu.read()
    gpu_state = gpu.read()
    fan_state = fans.read()
    return {
        "t": round(time.monotonic() - started, 1),
        "cpu_temp": cpu_state.get("avg"),
        "cpu_package": cpu_state.get("package"),
        "cpu_watts": rapl.read_watts(),
        "cpu_throttle_count": cpu_state.get("throttle_count"),
        "cpu_throttle_ms": cpu_state.get("throttle_ms"),
        "gpu_temp": (gpu_state.get("active") or {}).get("temp"),
        "gpu_watts": (gpu_state.get("active") or {}).get("power"),
        "gpu_util": (gpu_state.get("active") or {}).get("util"),
        "fans": {fan["label"]: fan["rpm"] for fan in fan_state},
    }


def _summarize(samples: list[dict]) -> dict:
    def max_of(key: str):
        values = [sample.get(key) for sample in samples if sample.get(key) is not None]
        return max(values) if values else None

    first = samples[0] if samples else {}
    last = samples[-1] if samples else {}
    fan_max = {}
    for sample in samples:
        for label, rpm in sample.get("fans", {}).items():
            fan_max[label] = max(fan_max.get(label, 0), rpm)

    return {
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


def _spawn_cpu_workers(count: int) -> list[subprocess.Popen]:
    return [
        subprocess.Popen(
            [sys.executable, "-c", CPU_BURN],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        for _ in range(count)
    ]


def run_cpu_benchmark(seconds: int = 45, workers: int | None = None) -> dict:
    chips = scan()
    cfg = Config()
    cpu = CpuReader(chips)
    gpu = GpuReader(chips)
    fans = FanReader(chips, cfg)
    rapl = RaplReader()

    workers = workers or max(1, os.cpu_count() or 1)
    # prime the RAPL delta calculation before the hot loop starts
    rapl.read_watts()
    time.sleep(0.5)

    started = time.monotonic()
    wall_started = datetime.now(timezone.utc).isoformat()
    procs = _spawn_cpu_workers(workers)

    samples = []
    try:
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            samples.append(_collect_sample(cpu, gpu, fans, rapl, started))
            time.sleep(1)
        samples.append(_collect_sample(cpu, gpu, fans, rapl, started))
    finally:
        for proc in procs:
            if proc.poll() is None:
                proc.terminate()
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=2)

    return {
        "ok": True,
        "kind": "cpu",
        "seconds": seconds,
        "tool": f"python busy-loop x{workers}",
        "started_at": wall_started,
        "samples": samples,
        "summary": _summarize(samples),
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


def run_gpu_benchmark(seconds: int = 45) -> dict:
    plan = _gpu_load_plan()
    if not plan:
        return {
            "ok": False,
            "kind": "gpu",
            "err": "No encontré glmark2, vkmark, vkcube ni glxgears. Instala una de esas herramientas para habilitar el benchmark de GPU.",
        }
    commands, label = plan

    chips = scan()
    cfg = Config()
    cpu = CpuReader(chips)
    gpu = GpuReader(chips)
    fans = FanReader(chips, cfg)
    rapl = RaplReader()
    rapl.read_watts()
    time.sleep(0.5)

    load_env = dict(os.environ, **GPU_LOAD_ENV)
    procs = [
        subprocess.Popen(
            command,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
            env=load_env,
        )
        for command in commands
    ]

    started = time.monotonic()
    wall_started = datetime.now(timezone.utc).isoformat()
    samples = []
    try:
        deadline = time.monotonic() + seconds
        # mientras quede al menos un proceso de carga vivo
        while time.monotonic() < deadline and any(p.poll() is None for p in procs):
            samples.append(_collect_sample(cpu, gpu, fans, rapl, started))
            time.sleep(1)
        samples.append(_collect_sample(cpu, gpu, fans, rapl, started))
    finally:
        for proc in procs:
            _terminate_process(proc)

    if not samples:
        return {"ok": False, "kind": "gpu", "err": "No pude capturar muestras del benchmark GPU."}

    summary = _summarize(samples)
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

    return {
        "ok": True,
        "kind": "gpu",
        "seconds": seconds,
        "tool": label,
        "instances": len(commands),
        "started_at": wall_started,
        "samples": samples,
        "summary": summary,
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="python -m rog_monitor.benchmarks")
    sub = parser.add_subparsers(dest="cmd", required=True)

    cpu_p = sub.add_parser("cpu")
    cpu_p.add_argument("--seconds", type=int, default=45)
    cpu_p.add_argument("--workers", type=int, default=None)

    gpu_p = sub.add_parser("gpu")
    gpu_p.add_argument("--seconds", type=int, default=45)

    args = parser.parse_args(argv)
    if args.cmd == "cpu":
        print(json.dumps(run_cpu_benchmark(seconds=args.seconds, workers=args.workers)))
        return 0
    if args.cmd == "gpu":
        print(json.dumps(run_gpu_benchmark(seconds=args.seconds)))
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
