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
import re

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
APPEARANCE_THEMES = {
    "magma", "nebula", "oceano", "glaciar", "reactor", "grafito",
    "neon", "atardecer", "neon-nights", "cyberpunk", "aurora", "alba",
}
APPEARANCE_MODES = {"light", "dark", "system"}
BOARD_COLS = {"left", "right"}
SAFE_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,48}$")
HEX_RE = re.compile(r"^[0-9a-fA-F]{6}$")


def _clamp(value, low, high):
    return max(low, min(high, value))


def _valid_id(value) -> bool:
    return isinstance(value, str) and bool(SAFE_ID_RE.fullmatch(value))


def _normalize_dashboard_layout(raw) -> dict | None:
    if not isinstance(raw, dict):
        return None
    order_raw = raw.get("order")
    hidden_raw = raw.get("hidden")
    if not isinstance(order_raw, list) or not isinstance(hidden_raw, list):
        return None

    order = []
    seen = set()
    for item in order_raw[:80]:
        if not isinstance(item, dict):
            return None
        key = item.get("key")
        col = item.get("col")
        if not _valid_id(key) or col not in BOARD_COLS:
            return None
        if key in seen:
            continue
        order.append({"key": key, "col": col})
        seen.add(key)

    hidden = []
    for key in hidden_raw[:80]:
        if not _valid_id(key):
            return None
        if key not in hidden:
            hidden.append(key)
    return {"order": order, "hidden": hidden}


def _normalize_appearance(raw) -> dict | None:
    if not isinstance(raw, dict):
        return None
    out = {}
    theme = raw.get("theme")
    mode = raw.get("mode")
    if theme in APPEARANCE_THEMES:
        out["theme"] = theme
    if mode in APPEARANCE_MODES:
        out["mode"] = mode
    if "zoom_level" in raw:
        try:
            out["zoom_level"] = _clamp(float(raw["zoom_level"]), -3, 4)
        except (TypeError, ValueError):
            return None
    return out


def _normalize_aura_draft(raw) -> dict | None:
    if not isinstance(raw, dict):
        return None
    out = {}
    for key in ("driver", "effect", "speed", "direction", "brightness"):
        value = raw.get(key)
        if isinstance(value, str) and len(value) <= 48:
            out[key] = value.strip()
    for key in ("colour", "colour2"):
        value = str(raw.get(key) or "").strip().lstrip("#")
        if HEX_RE.fullmatch(value):
            out[key] = value.lower()
    return out


def get_settings() -> dict:
    cfg = Config()
    return {
        "ok": True,
        "alerts": dict(cfg.get("alerts", {})),
        "temp_colors": dict(cfg.get("temp_colors", {})),
        "notifications": bool(cfg.get("notifications", True)),
        "close_action": cfg.get("close_action", "quit"),
        "lang": cfg.get("lang", "en"),
        "appearance": dict(cfg.get("appearance", {})),
        "dashboard_layout": dict(cfg.get("dashboard_layout", {})),
        "dashboard_edit_mode": bool(cfg.get("dashboard_edit_mode", False)),
        "aura_draft": dict(cfg.get("aura_draft", {})),
        "ui_prefs_migrated": bool(cfg.get("ui_prefs_migrated", False)),
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
    if raw.get("close_action") in ("quit", "tray", "ask"):
        cfg.data["close_action"] = raw["close_action"]
    # lang: persist so the backend re-emits new events in the chosen language
    if raw.get("lang") in ("auto", "es", "en", "fr", "it", "pt", "zh", "ja", "ko"):
        cfg.data["lang"] = raw["lang"]
    if "appearance" in raw:
        appearance = _normalize_appearance(raw.get("appearance"))
        if appearance is None:
            return {"ok": False, "err": "Apariencia inválida."}
        current = dict(cfg.get("appearance", {}))
        current.update(appearance)
        cfg.data["appearance"] = current
    if "dashboard_layout" in raw:
        layout = _normalize_dashboard_layout(raw.get("dashboard_layout"))
        if layout is None:
            return {"ok": False, "err": "Layout del tablero inválido."}
        cfg.data["dashboard_layout"] = layout
    if "dashboard_edit_mode" in raw:
        cfg.data["dashboard_edit_mode"] = bool(raw.get("dashboard_edit_mode"))
    if "aura_draft" in raw:
        draft = _normalize_aura_draft(raw.get("aura_draft"))
        if draft is None:
            return {"ok": False, "err": "Borrador Aura inválido."}
        cfg.data["aura_draft"] = draft
    if "ui_prefs_migrated" in raw:
        cfg.data["ui_prefs_migrated"] = bool(raw.get("ui_prefs_migrated"))
    cfg.save()
    return {"ok": True, "alerts": alerts, "temp_colors": colors,
            "notifications": bool(cfg.get("notifications", True)),
            "close_action": cfg.get("close_action", "quit"),
            "lang": cfg.get("lang", "en"),
            "appearance": dict(cfg.get("appearance", {})),
            "dashboard_layout": dict(cfg.get("dashboard_layout", {})),
            "dashboard_edit_mode": bool(cfg.get("dashboard_edit_mode", False)),
            "aura_draft": dict(cfg.get("aura_draft", {})),
            "ui_prefs_migrated": bool(cfg.get("ui_prefs_migrated", False))}


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
