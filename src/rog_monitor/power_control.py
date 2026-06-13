"""Calibrated, firmware-clamped power/clock control backend for ASUS ROG laptops.

Public API
----------
PowerControl().snapshot()   -> dict   (read-only, cached ~5 s, safe at 1 Hz)
PowerControl().state()      -> dict   (force-fresh, no cache)
PowerControl().apply(changes: dict) -> dict   (validates, clamps, calls script)
PowerControl().reset()      -> dict   (writes firmware defaults)

CLI
---
python -m rog_monitor.power_control state
python -m rog_monitor.power_control apply --json '{"pl1": 80, "pl2": 120}'
python -m rog_monitor.power_control reset

The Electron layer (Agent 2) runs WRITES via:
    pkexec bash scripts/apply-power-control.sh key=value [key=value ...]
and then calls `state` to read back.

Design notes
------------
- Writing sysfs current_value requires root -> delegated to the shell script.
- Reads are always unprivileged (sysfs is world-readable).
- ROG_FW_ATTRS_DIR env override lets tests use a fake sysfs.
- Session detection: Wayland -> GPU clock offsets marked writable:false.
- Device detection: product_name DMI string matched against device_profiles.json.
- Fallback: if device not in DB, use 'auto' profile with live sysfs ranges.
- Custom override: ~/.config/rog-monitor/device.json (same structure as DB entry).
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import time
from pathlib import Path

# ---------------------------------------------------------------------------
# Constants / paths
# ---------------------------------------------------------------------------

_REAL_ATTRS_DIR = "/sys/class/firmware-attributes/asus-armoury/attributes"
_DMI_PRODUCT = "/sys/class/dmi/id/product_name"
_PROFILES_JSON = Path(__file__).parent / "device_profiles.json"
_SCRIPT = Path(__file__).parent.parent.parent / "scripts" / "apply-power-control.sh"

# Controls backed by asus-armoury sysfs (writable via script).
# Controls NOT in this map use device_profiles.json for metadata only.
_ATTR_KEYS = ("pl1", "pl2", "dynamic_boost", "thermal_target")

# GPU clock offset keys: read from device_profiles.json, never written here.
_CLOCK_KEYS = ("base_clock_offset", "mem_clock_offset")

# Cache TTL for snapshot().
_CACHE_TTL = 5.0


# ---------------------------------------------------------------------------
# Helpers: sysfs
# ---------------------------------------------------------------------------

def _attrs_dir() -> str:
    return os.environ.get("ROG_FW_ATTRS_DIR", _REAL_ATTRS_DIR)


def _read_attr(attr: str, field: str) -> str | None:
    path = os.path.join(_attrs_dir(), attr, field)
    try:
        return Path(path).read_text().strip()
    except OSError:
        return None


def _read_int_attr(attr: str, field: str) -> int | None:
    raw = _read_attr(attr, field)
    if raw is None:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Helpers: device / session detection
# ---------------------------------------------------------------------------

def _dmi_product() -> str:
    try:
        return Path(_DMI_PRODUCT).read_text().strip()
    except OSError:
        return ""


def _is_wayland() -> bool:
    return bool(os.environ.get("WAYLAND_DISPLAY") or
                os.environ.get("XDG_SESSION_TYPE", "").lower() == "wayland")


def _load_db() -> dict:
    try:
        with open(_PROFILES_JSON) as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return {"devices": []}


def _find_device_profile(product: str, db: dict) -> dict | None:
    """Return the first DB entry whose dmi_match is a substring of product, or None."""
    for entry in db.get("devices", []):
        match = entry.get("dmi_match")
        if match and match in product:
            return entry
    return None


def _load_custom_profile() -> dict | None:
    config_dir = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "rog-monitor"
    custom = config_dir / "device.json"
    try:
        with open(custom) as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return None


def _controls_from_profile(entry: dict, wayland: bool) -> list[dict]:
    """Build the controls list from a device profile entry, merging live sysfs values."""
    controls = []
    for ctrl in entry.get("controls", []):
        key = ctrl["key"]
        attr = ctrl.get("attr")

        # Read live min/max/current from sysfs (always authoritative when available).
        live_min = _read_int_attr(attr, "min_value") if attr else None
        live_max = _read_int_attr(attr, "max_value") if attr else None
        live_default = _read_int_attr(attr, "default_value") if attr else None
        live_current = _read_int_attr(attr, "current_value") if attr else None

        # Merge: live values override profile defaults for range/current.
        c = {
            "key": key,
            "attr": attr,
            "label_es": ctrl.get("label_es", key),
            "label_en": ctrl.get("label_en", key),
            "unit": ctrl.get("unit", ""),
            "value": live_current,
            "min": live_min if live_min is not None else ctrl.get("min"),
            "max": live_max if live_max is not None else ctrl.get("max"),
            "default": live_default if live_default is not None else ctrl.get("default"),
            "writable": ctrl.get("writable", False),
            "reason": ctrl.get("reason"),
        }

        # GPU clock offsets: always non-writable on Wayland (already in DB, but enforce).
        if key in _CLOCK_KEYS:
            c["writable"] = False
            if wayland:
                c["reason"] = ctrl.get("reason") or \
                    "Requiere sesión X11 con Coolbits; no disponible en Wayland"

        controls.append(c)
    return controls


def _auto_profile(db: dict, wayland: bool) -> dict:
    """Build a profile from live sysfs ranges (fallback for unknown hardware)."""
    for entry in db.get("devices", []):
        if entry.get("id") == "auto":
            return entry
    # Ultimate fallback: synthesize from DB structure.
    return {
        "id": "auto",
        "name": "Genérico (auto-detectado)",
        "calibrated": False,
        "controls": [
            {"key": k, "attr": k.replace("pl1", "ppt_pl1_spl")
                                  .replace("pl2", "ppt_pl2_sppt")
                                  .replace("dynamic_boost", "nv_dynamic_boost")
                                  .replace("thermal_target", "nv_temp_target"),
             "label_es": k, "label_en": k, "unit": "", "writable": True, "reason": None}
            for k in _ATTR_KEYS
        ] + [
            {"key": "base_clock_offset", "attr": None, "label_es": "Offset clock base GPU",
             "label_en": "GPU base clock offset", "unit": "MHz", "min": 0, "max": 200,
             "default": 50, "writable": False,
             "reason": "Requiere sesión X11 con Coolbits; no disponible en Wayland"},
            {"key": "mem_clock_offset", "attr": None, "label_es": "Offset clock memoria GPU",
             "label_en": "GPU memory clock offset", "unit": "MHz", "min": 0, "max": 300,
             "default": 100, "writable": False,
             "reason": "Requiere sesión X11 con Coolbits; no disponible en Wayland"},
        ],
    }


# ---------------------------------------------------------------------------
# PowerControl class
# ---------------------------------------------------------------------------

class PowerControl:
    """Read-only sensor + write-via-script power/clock control backend."""

    def __init__(self):
        self._cache: dict | None = None
        self._cache_ts: float = 0.0

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def snapshot(self) -> dict:
        """Cached (~5 s) read-only snapshot. Safe to call at 1 Hz."""
        now = time.monotonic()
        if self._cache is not None and now - self._cache_ts < _CACHE_TTL:
            return dict(self._cache)
        fresh = self._build_snapshot()
        self._cache = fresh
        self._cache_ts = now
        return dict(fresh)

    def state(self) -> dict:
        """Force-fresh snapshot, bypasses cache."""
        fresh = self._build_snapshot()
        self._cache = fresh
        self._cache_ts = time.monotonic()
        return dict(fresh)

    def apply(self, changes: dict) -> dict:
        """Validate, clamp, then write via apply-power-control.sh.

        In production the Electron layer runs:
            pkexec bash scripts/apply-power-control.sh key=val ...
        In test mode (ROG_FW_ATTRS_DIR set), the script is run directly
        without pkexec (fake sysfs is writable by the current user).
        Returns the refreshed state on success, or {"ok": False, "err": ...}.
        """
        if not changes:
            return {"ok": False, "err": "No se enviaron cambios."}

        # Reject unknown or non-writable keys.
        allowed = set(_ATTR_KEYS)
        for key in changes:
            if key not in allowed:
                if key in _CLOCK_KEYS:
                    return {
                        "ok": False,
                        "err": f"'{key}' requiere sesión X11 con Coolbits; no disponible en Wayland.",
                    }
                return {"ok": False, "err": f"Clave no reconocida: '{key}'."}

        # Build argument list: key=value (script will clamp).
        args = [f"{k}={int(round(float(v)))}" for k, v in changes.items()]

        # Decide how to invoke the script.
        test_mode = "ROG_FW_ATTRS_DIR" in os.environ
        script_path = str(_SCRIPT)

        if test_mode:
            cmd = ["bash", script_path] + args
            env = dict(os.environ)
        else:
            cmd = ["pkexec", "bash", script_path] + args
            env = None

        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=10,
                stdin=subprocess.DEVNULL,
                env=env,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            return {"ok": False, "err": f"Error ejecutando el script: {exc}"}

        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or "Error desconocido.").strip()
            return {"ok": False, "err": err}

        # Invalidate cache and return fresh state.
        self._cache = None
        return {"ok": True, "applied": self._parse_script_output(proc.stdout), "state": self.state()}

    def reset(self) -> dict:
        """Write firmware defaults for all writable asus-armoury knobs."""
        db = _load_db()
        product = _dmi_product()
        profile = _find_device_profile(product, db) or _auto_profile(db, _is_wayland())

        defaults = {}
        for ctrl in profile.get("controls", []):
            key = ctrl["key"]
            if key not in _ATTR_KEYS:
                continue
            attr = ctrl.get("attr")
            if not attr:
                continue
            # Read live default.
            live_default = _read_int_attr(attr, "default_value")
            fallback_default = ctrl.get("default")
            val = live_default if live_default is not None else fallback_default
            if val is not None:
                defaults[key] = val

        if not defaults:
            return {"ok": False, "err": "No se encontraron valores por defecto para este hardware."}

        return self.apply(defaults)

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _build_snapshot(self) -> dict:
        """Build the full snapshot dict from live sysfs + device DB."""
        db = _load_db()
        wayland = _is_wayland()
        product = _dmi_product()

        # Check for custom user override first.
        custom = _load_custom_profile()
        if custom:
            profile = custom
            device_info = {
                "id": custom.get("id", "custom"),
                "name": custom.get("name", "Custom"),
                "friendly_name": custom.get("friendly_name", "Custom device"),
                "calibrated": custom.get("calibrated", False),
                "source": "custom",
            }
        else:
            matched = _find_device_profile(product, db)
            if matched:
                profile = matched
                device_info = {
                    "id": matched["id"],
                    "name": matched["name"],
                    "friendly_name": matched.get("friendly_name", matched["name"]),
                    "calibrated": bool(matched.get("calibrated")),
                    "source": "db",
                }
            else:
                profile = _auto_profile(db, wayland)
                device_info = {
                    "id": "auto",
                    "name": profile.get("name", "Genérico"),
                    "friendly_name": profile.get("name", "Genérico"),
                    "calibrated": False,
                    "source": "auto",
                }

        controls = _controls_from_profile(profile, wayland)

        return {
            "device": device_info,
            "session": {
                "wayland": wayland,
                "display": os.environ.get("WAYLAND_DISPLAY") or os.environ.get("DISPLAY"),
            },
            "controls": controls,
        }

    @staticmethod
    def _parse_script_output(stdout: str) -> dict:
        """Parse 'key=value' lines from script output into a dict."""
        result = {}
        for line in stdout.splitlines():
            line = line.strip()
            if "=" in line:
                k, _, v = line.partition("=")
                try:
                    result[k.strip()] = int(v.strip())
                except ValueError:
                    result[k.strip()] = v.strip()
        return result


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m rog_monitor.power_control",
        description="Control de potencia ROG (lectura segura; escritura vía pkexec).",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("state", help="Mostrar estado actual (JSON).")

    apply_p = sub.add_parser("apply", help="Aplicar cambios (JSON).")
    apply_p.add_argument(
        "--json", required=True, metavar="JSON",
        help='Objeto JSON con claves pl1/pl2/dynamic_boost/thermal_target.',
    )

    sub.add_parser("reset", help="Restaurar valores por defecto del firmware.")

    args = parser.parse_args(argv)
    pc = PowerControl()

    if args.cmd == "state":
        print(json.dumps(pc.state(), indent=2))
        return 0

    if args.cmd == "apply":
        try:
            changes = json.loads(args.json)
        except json.JSONDecodeError as exc:
            print(json.dumps({"ok": False, "err": f"JSON inválido: {exc}"}))
            return 1
        result = pc.apply(changes)
        print(json.dumps(result, indent=2))
        return 0 if result.get("ok") else 1

    if args.cmd == "reset":
        result = pc.reset()
        print(json.dumps(result, indent=2))
        return 0 if result.get("ok") else 1

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
