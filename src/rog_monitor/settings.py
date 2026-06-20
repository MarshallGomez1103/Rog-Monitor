"""Editable settings surface for the desktop app (alert thresholds, colors).

The Electron app reads the current config with ``settings get`` and writes a
validated subset with ``settings update --json '{...}'``. After writing, the
app restarts the JSON-stream backend so AlertEngine picks up the new values.

Only a safe, bounded subset of config.json is writable from here; everything
is clamped to sane ranges so a bad value can never make the monitor unusable.
"""

from __future__ import annotations

import argparse
import json

from .config import CONFIG_FILE, Config

# key -> (min, max) allowed range for the numeric alert thresholds
ALERT_BOUNDS = {
    "cpu_temp_warn": (50, 110),
    "gpu_temp_warn": (45, 105),
    "cpu_power_warn": (20, 300),
    "fan_stopped_cpu_temp": (30, 100),
    "cooldown_seconds": (10, 3600),
    "throttle_min_ms": (0, 5000),
}
# temp_colors lists [green_below, yellow_below, orange_below] bounded here
COLOR_BOUNDS = {
    "cpu": (40, 110),
    "gpu": (40, 105),
}


def _clamp(value, low, high):
    return max(low, min(high, value))


def get_settings() -> dict:
    cfg = Config()
    return {
        "ok": True,
        "alerts": dict(cfg.get("alerts", {})),
        "temp_colors": dict(cfg.get("temp_colors", {})),
        "notifications": bool(cfg.get("notifications", True)),
        "config_path": str(CONFIG_FILE),
    }


def update_settings(raw: dict) -> dict:
    cfg = Config()
    alerts = dict(cfg.get("alerts", {}))
    colors = dict(cfg.get("temp_colors", {}))

    in_alerts = raw.get("alerts") or {}
    for key, (low, high) in ALERT_BOUNDS.items():
        if key in in_alerts and in_alerts[key] is not None:
            try:
                alerts[key] = _clamp(int(round(float(in_alerts[key]))), low, high)
            except (TypeError, ValueError):
                return {"ok": False, "err": f"Valor inválido para {key}: {in_alerts[key]!r}"}

    in_colors = raw.get("temp_colors") or {}
    for key, (low, high) in COLOR_BOUNDS.items():
        if key in in_colors and in_colors[key] is not None:
            seq = in_colors[key]
            if not isinstance(seq, (list, tuple)) or len(seq) != 3:
                return {"ok": False, "err": f"{key} debe ser una lista de 3 valores [verde, amarillo, naranja]."}
            try:
                vals = [_clamp(int(round(float(v))), low, high) for v in seq]
            except (TypeError, ValueError):
                return {"ok": False, "err": f"Valores de color inválidos para {key}: {seq!r}"}
            if not (vals[0] < vals[1] < vals[2]):
                return {"ok": False, "err": f"Los umbrales de {key} deben ir en aumento (verde < amarillo < naranja)."}
            colors[key] = vals

    cfg.data["alerts"] = alerts
    cfg.data["temp_colors"] = colors
    if "notifications" in raw:
        cfg.data["notifications"] = bool(raw["notifications"])
    # lang: persist so the backend re-emits new events in the chosen language
    if raw.get("lang") in ("auto", "es", "en", "fr", "it", "pt", "zh", "ja", "ko"):
        cfg.data["lang"] = raw["lang"]
    cfg.save()
    return {"ok": True, "alerts": alerts, "temp_colors": colors,
            "notifications": bool(cfg.get("notifications", True)), "lang": cfg.get("lang", "auto")}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="python -m rog_monitor.settings")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("get")
    upd = sub.add_parser("update")
    upd.add_argument("--json", required=True)

    args = parser.parse_args(argv)
    if args.cmd == "get":
        print(json.dumps(get_settings()))
        return 0
    if args.cmd == "update":
        print(json.dumps(update_settings(json.loads(args.json))))
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
