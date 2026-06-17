"""Sesión de juego: grabar una serie temporal de sensores mientras Marshall
juega, resumir (mín/máx/promedio), guardar en disco y comparar dos sesiones.

Diseño: módulo CLI autónomo (igual que benchmarks.py) para que la app de
escritorio lo invoque vía `python -m rog_monitor.game_session <subcomando>`
sin que este agente necesite tocar main.js/preload.js (fuera de su dueño).
Cada subcomando imprime UNA línea JSON a stdout.

Subcomandos:
  start                         -> crea sesión, devuelve {ok, session_id}
  sample --id ID                -> toma 1 muestra y la añade a la sesión activa
  stop --id ID                  -> cierra la sesión, calcula resumen, guarda
  list                           -> lista sesiones guardadas (resumen corto)
  get --id ID                   -> sesión completa (samples + summary)
  compare --a ID --b ID         -> diff %, veredicto, ambas sesiones
  baseline                      -> devuelve el id de la sesión baseline (si hay)
  delete --id ID                -> borra una sesión guardada

Persistencia: ~/.local/share/rog-monitor/game-sessions/<id>.json
(respeta XDG_DATA_HOME vía config.DATA_DIR, como el resto de la app).
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from .config import Config, DATA_DIR
from .cpu import CpuReader
from .fans import FanReader
from .gpu import GpuReader
from .hwmon import scan
from .power import RaplReader
from .procs import ProcReader

SESSIONS_DIR = DATA_DIR / "game-sessions"

# Métricas grabadas en cada muestra y cómo se resumen (mín/máx/avg).
METRICS = (
    "cpu_temp",
    "gpu_temp",
    "cpu_watts",
    "gpu_watts",
    "gpu_util",
    "ram_percent",
    "fan_cpu_rpm",
    "fan_gpu_rpm",
    "fan_mid_rpm",
)

# Para el veredicto de comparación: True = "menor es mejor" (más fría/silenciosa).
LOWER_IS_BETTER = {
    "cpu_temp": True,
    "gpu_temp": True,
    "cpu_watts": True,
    "gpu_watts": True,
    "gpu_util": False,
    "ram_percent": True,
    "fan_cpu_rpm": True,
    "fan_gpu_rpm": True,
    "fan_mid_rpm": True,
}

# Procesos del propio escritorio/sistema que nunca deberían reportarse como
# "el juego en ejecución" aunque encabecen el top de CPU.
NON_GAME_PROCESSES = {
    "rog-monitor", "python3", "python", "electron", "kwin_wayland", "kwin_x11",
    "plasmashell", "Xwayland", "gamescope", "steam", "steamwebhelper",
    "gnome-shell", "code", "node", "bash", "sh", "systemd", "Xorg",
    "pipewire", "pipewire-pulse", "wireplumber", "konsole",
}

GAME_HINT_DIRS = ("/steamapps/common/", "/.steam/", "/lutris/", "/heroic/",
                   "/games/", "/proton", "/compatdata/")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ram_percent() -> float | None:
    try:
        with open("/proc/meminfo") as fh:
            info = {}
            for line in fh:
                key, _, rest = line.partition(":")
                info[key] = rest.strip().split()[0]
        total = int(info["MemTotal"])
        avail = int(info.get("MemAvailable", info["MemFree"]))
        if total <= 0:
            return None
        return round((total - avail) * 100 / total, 1)
    except (OSError, KeyError, ValueError, IndexError):
        return None


def _detect_game(procs: list[dict]) -> dict | None:
    """Heurística simple: el proceso de mayor uso de CPU que no sea del
    propio sistema/escritorio/monitor. No es perfecto pero es honesto:
    siempre se etiqueta como 'detectado' (nunca como certeza absoluta)."""
    for proc in procs:
        name = proc.get("name", "")
        if not name or name in NON_GAME_PROCESSES:
            continue
        if name.startswith("rog-monitor") or name.startswith("Electron"):
            continue
        return {"name": name, "pid": proc.get("pid"), "cpu": proc.get("cpu")}
    return None


class _Readers:
    """Agrupa los lectores de sensores (mismo patrón que benchmarks.py)."""

    def __init__(self):
        chips = scan()
        self.cpu = CpuReader(chips)
        self.gpu = GpuReader(chips)
        self.fans = FanReader(chips, Config())
        self.rapl = RaplReader()
        self.procs = ProcReader()
        # primer tick para que las lecturas delta (CPU%, watts) no salgan nulas
        self.procs.read()
        self.rapl.read_watts()

    def sample(self, t_offset: float) -> dict:
        cpu_state = self.cpu.read()
        gpu_state = self.gpu.read()
        active = gpu_state.get("active") or {}
        fans = {f["label"]: f["rpm"] for f in self.fans.read()}
        procs = self.procs.read()
        return {
            "t": round(t_offset, 1),
            "ts": _now_iso(),
            "cpu_temp": cpu_state.get("avg"),
            "gpu_temp": active.get("temp"),
            "cpu_watts": self.rapl.read_watts(),
            "gpu_watts": active.get("power"),
            "gpu_util": active.get("util"),
            "ram_percent": _ram_percent(),
            "fan_cpu_rpm": fans.get("cpu_fan"),
            "fan_gpu_rpm": fans.get("gpu_fan"),
            "fan_mid_rpm": fans.get("mid_fan"),
            "game": _detect_game(procs),
        }


def _session_path(session_id: str) -> Path:
    safe = re.sub(r"[^a-zA-Z0-9_-]", "", session_id)[:80] or "session"
    return SESSIONS_DIR / f"{safe}.json"


def _load_session(session_id: str) -> dict | None:
    path = _session_path(session_id)
    try:
        with open(path) as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def _save_session(session: dict) -> None:
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    path = _session_path(session["id"])
    with open(path, "w") as fh:
        json.dump(session, fh, indent=2, sort_keys=False)
        fh.write("\n")


def _has_baseline() -> bool:
    for path in SESSIONS_DIR.glob("*.json"):
        try:
            with open(path) as fh:
                if (json.load(fh) or {}).get("baseline"):
                    return True
        except (OSError, ValueError):
            continue
    return False


def summarize(samples: list[dict]) -> dict:
    """mín/máx/promedio por métrica, redondeados a 1 decimal."""
    out = {}
    for metric in METRICS:
        values = [s.get(metric) for s in samples if s.get(metric) is not None]
        if not values:
            out[metric] = {"min": None, "max": None, "avg": None}
            continue
        out[metric] = {
            "min": round(min(values), 1),
            "max": round(max(values), 1),
            "avg": round(statistics.mean(values), 1),
        }
    # juego más visto durante la sesión (modo simple: primer detectado no vacío
    # que más se repite por nombre)
    names = [s["game"]["name"] for s in samples if s.get("game")]
    game_name = max(set(names), key=names.count) if names else None
    out["_game"] = game_name
    out["_duration_s"] = round(samples[-1]["t"], 1) if samples else 0.0
    out["_sample_count"] = len(samples)
    return out


def cmd_start(_args) -> dict:
    session_id = f"{int(time.time())}-{uuid.uuid4().hex[:6]}"
    session = {
        "id": session_id,
        "started_at": _now_iso(),
        "ended_at": None,
        "baseline": not _has_baseline(),
        "game": None,
        "samples": [],
        "summary": None,
    }
    _save_session(session)
    return {"ok": True, "session_id": session_id, "baseline": session["baseline"]}


# El proceso CLI no persiste estado de readers entre llamadas `sample`
# (cada invocación es un proceso nuevo), así que cada `sample` crea sus
# propios lectores. Es más caro que mantener un proceso vivo, pero es
# robusto y simple: la app llama `sample` ~1/s mientras el modal está
# abierto, igual de barato que el resto de los IPC de esta app.
def cmd_sample(args) -> dict:
    session = _load_session(args.id)
    if session is None:
        return {"ok": False, "err": f"sesión {args.id} no encontrada"}
    if session.get("ended_at"):
        return {"ok": False, "err": "la sesión ya terminó"}

    started = datetime.fromisoformat(session["started_at"]).timestamp()
    t_offset = time.time() - started

    readers = _Readers()
    sample = readers.sample(t_offset)
    session["samples"].append(sample)
    if sample.get("game") and not session.get("game"):
        session["game"] = sample["game"]
    _save_session(session)
    return {"ok": True, "sample": sample, "count": len(session["samples"])}


def cmd_stop(args) -> dict:
    session = _load_session(args.id)
    if session is None:
        return {"ok": False, "err": f"sesión {args.id} no encontrada"}
    if not session.get("ended_at"):
        session["ended_at"] = _now_iso()
        session["summary"] = summarize(session["samples"])
        _save_session(session)
    return {"ok": True, "session": session}


def cmd_list(_args) -> dict:
    out = []
    for path in sorted(SESSIONS_DIR.glob("*.json"), reverse=True):
        try:
            with open(path) as fh:
                data = json.load(fh)
        except (OSError, ValueError):
            continue
        out.append({
            "id": data.get("id"),
            "started_at": data.get("started_at"),
            "ended_at": data.get("ended_at"),
            "baseline": bool(data.get("baseline")),
            "game": data.get("game"),
            "summary": data.get("summary"),
        })
    return {"ok": True, "sessions": out}


def cmd_get(args) -> dict:
    session = _load_session(args.id)
    if session is None:
        return {"ok": False, "err": f"sesión {args.id} no encontrada"}
    return {"ok": True, "session": session}


def cmd_baseline(_args) -> dict:
    for path in sorted(SESSIONS_DIR.glob("*.json")):
        try:
            with open(path) as fh:
                data = json.load(fh)
        except (OSError, ValueError):
            continue
        if data.get("baseline") and data.get("ended_at"):
            return {"ok": True, "session_id": data["id"]}
    return {"ok": True, "session_id": None}


def cmd_delete(args) -> dict:
    path = _session_path(args.id)
    try:
        path.unlink()
        return {"ok": True}
    except OSError as exc:
        return {"ok": False, "err": str(exc)}


def _pct_diff(a: float | None, b: float | None) -> float | None:
    """% de cambio de A (baseline/anterior) a B (nueva), positivo = B subió."""
    if a is None or b is None or a == 0:
        return None
    return round((b - a) * 100 / abs(a), 1)


def compare_sessions(a: dict, b: dict) -> dict:
    """Compara b (nueva) contra a (referencia/baseline). Devuelve diff %
    por métrica y un veredicto en lenguaje natural."""
    sa = a.get("summary") or {}
    sb = b.get("summary") or {}
    diffs = {}
    weighted = []  # (peso, +1 si b mejoró / -1 si empeoró) para el veredicto global
    for metric in METRICS:
        avg_a = (sa.get(metric) or {}).get("avg")
        avg_b = (sb.get(metric) or {}).get("avg")
        diff = _pct_diff(avg_a, avg_b)
        diffs[metric] = {
            "a_avg": avg_a, "b_avg": avg_b, "diff_percent": diff,
        }
        if diff is None or abs(diff) < 1:
            continue
        lower_better = LOWER_IS_BETTER.get(metric, True)
        improved = (diff < 0) if lower_better else (diff > 0)
        weighted.append(1 if improved else -1)

    if not weighted:
        verdict = "equal"
    else:
        score = sum(weighted) / len(weighted)
        if score > 0.25:
            verdict = "better"
        elif score < -0.25:
            verdict = "worse"
        else:
            verdict = "equal"

    # headline basado en la métrica más representativa disponible (gpu_temp,
    # si no cpu_temp): "esta sesión fue N% más fría/caliente"
    headline_metric = "gpu_temp" if diffs.get("gpu_temp", {}).get("diff_percent") is not None else "cpu_temp"
    headline_diff = diffs.get(headline_metric, {}).get("diff_percent")

    return {
        "ok": True,
        "a": {"id": a.get("id"), "baseline": bool(a.get("baseline")), "game": a.get("game")},
        "b": {"id": b.get("id"), "baseline": bool(b.get("baseline")), "game": b.get("game")},
        "diffs": diffs,
        "verdict": verdict,
        "headline_metric": headline_metric,
        "headline_diff_percent": headline_diff,
    }


def cmd_compare(args) -> dict:
    a = _load_session(args.a)
    b = _load_session(args.b)
    if a is None or b is None:
        return {"ok": False, "err": "una o ambas sesiones no existen"}
    if not a.get("summary") or not b.get("summary"):
        return {"ok": False, "err": "ambas sesiones deben estar cerradas (con resumen) para comparar"}
    return compare_sessions(a, b)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="python -m rog_monitor.game_session")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("start")

    p_sample = sub.add_parser("sample")
    p_sample.add_argument("--id", required=True)

    p_stop = sub.add_parser("stop")
    p_stop.add_argument("--id", required=True)

    sub.add_parser("list")

    p_get = sub.add_parser("get")
    p_get.add_argument("--id", required=True)

    sub.add_parser("baseline")

    p_delete = sub.add_parser("delete")
    p_delete.add_argument("--id", required=True)

    p_compare = sub.add_parser("compare")
    p_compare.add_argument("--a", required=True)
    p_compare.add_argument("--b", required=True)

    args = parser.parse_args(argv)
    handlers = {
        "start": cmd_start,
        "sample": cmd_sample,
        "stop": cmd_stop,
        "list": cmd_list,
        "get": cmd_get,
        "baseline": cmd_baseline,
        "delete": cmd_delete,
        "compare": cmd_compare,
    }
    print(json.dumps(handlers[args.cmd](args)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
