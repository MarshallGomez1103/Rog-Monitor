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

The Electron layer runs WRITES via:
- For pl1/pl2/dynamic_boost/thermal_target:
    pkexec bash scripts/apply-power-control.sh key=value [key=value ...]
- For base_clock_offset/mem_clock_offset (GPU, NVML, requires root):
    pkexec bash scripts/apply-gpu-clocks.sh set --core <MHz> --mem <MHz>
and then calls `state` to read back.

Design notes
------------
- Writing sysfs current_value requires root -> delegated to the shell scripts.
- GPU clock offset READ is unprivileged (NVML, libnvidia-ml.so.1). SET needs root.
- Reads are always unprivileged (sysfs / NVML are world-readable).
- ROG_FW_ATTRS_DIR env override lets tests use a fake sysfs.
- GPU clock offsets: NO LONGER blocked by Wayland. NVML works in Wayland on
  supported NVIDIA drivers. SET still needs root (pkexec).
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
_GPU_CLOCKS_SCRIPT = Path(__file__).parent.parent.parent / "scripts" / "apply-gpu-clocks.sh"

# Controls backed by asus-armoury sysfs (writable via apply-power-control.sh).
_ATTR_KEYS = ("pl1", "pl2", "dynamic_boost", "thermal_target")

# Canonical system profiles and the aliases we accept for each. The PPD bus
# calls the low-power profile "power-saver"; the fan curves call it "quiet".
# Both map to the same profile_power set in device_profiles.json.
_PROFILE_ALIASES = {
    "quiet": "quiet",
    "power-saver": "quiet",
    "power_saver": "quiet",
    "powersave": "quiet",
    "balanced": "balanced",
    "performance": "performance",
}

# GPU clock offset keys: read live from NVML (gpu_clocks.py); written via
# apply-gpu-clocks.sh (pkexec). These are NOT passed through apply-power-control.sh.
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


def _read_nvml_offsets() -> dict | None:
    """Try to read GPU clock offsets from NVML (gpu_clocks.py). Returns None on failure.

    NVML works unprivileged in Wayland on supported NVIDIA drivers.
    This is read-only and never raises — failures are silently ignored for resilience.
    """
    try:
        from rog_monitor.gpu_clocks import read_offsets, NvmlError
        return read_offsets(0)
    except Exception:
        return None


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


def _canonical_profile(profile: str | None) -> str | None:
    """Map any accepted profile name/alias to its canonical key, or None."""
    if not profile:
        return None
    return _PROFILE_ALIASES.get(str(profile).strip().lower())


def _active_profile_entry() -> dict | None:
    """Return the active device profile entry (custom override > DB match)."""
    custom = _load_custom_profile()
    if custom:
        return custom
    db = _load_db()
    return _find_device_profile(_dmi_product(), db)


def _safe_clamp(value: int, lo, hi) -> int:
    """Clamp value to [lo, hi] when both bounds are known (UI-side first clamp).

    This is the FIRST of the double clamp; apply-power-control.sh applies the
    SECOND clamp against the live firmware min/max. Missing bounds pass through
    unchanged so the script (and firmware) remain the final authority.
    """
    if lo is not None and value < lo:
        value = lo
    if hi is not None and value > hi:
        value = hi
    return value


def profile_power_for(profile: str | None,
                      entry: dict | None = None) -> dict | None:
    """Resolve the {pl1, pl2, dynamic_boost, thermal_target} set for a profile.

    Looks up `profile_power[<canonical profile>]` in the active device entry,
    pre-clamps each value to that control's safe min/max declared in the same
    file (first clamp), and returns only the _ATTR_KEYS. Returns None when the
    device has no profile_power table or the profile is unknown — in that case
    the caller should leave power untouched (fan curve still changes).
    """
    canon = _canonical_profile(profile)
    if canon is None:
        return None
    if entry is None:
        entry = _active_profile_entry()
    if not entry:
        return None
    table = entry.get("profile_power")
    if not isinstance(table, dict):
        return None
    pset = table.get(canon)
    if not isinstance(pset, dict):
        return None

    # Build a lookup of safe min/max per control key from the entry's controls.
    bounds: dict[str, tuple] = {}
    for ctrl in entry.get("controls", []):
        bounds[ctrl.get("key")] = (ctrl.get("min"), ctrl.get("max"))

    out: dict[str, int] = {}
    for key in _ATTR_KEYS:
        if key not in pset:
            continue
        try:
            val = int(round(float(pset[key])))
        except (TypeError, ValueError):
            continue
        lo, hi = bounds.get(key, (None, None))
        out[key] = _safe_clamp(val, lo, hi)
    return out or None


# ---------------------------------------------------------------------------
# Factory baseline ("como viene el equipo")
# ---------------------------------------------------------------------------
# RESET A FÁBRICA must restore how THIS machine shipped, not the photo/DB
# values. We capture it ONCE on first run — from the firmware's own
# `default_value` (the truest factory state; falls back to the current value at
# first launch) — and save it locally. From then on, reset returns here.

def _baseline_path() -> Path:
    config_dir = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "rog-monitor"
    return config_dir / "power-baseline.json"


def _load_baseline() -> dict:
    try:
        with open(_baseline_path()) as fh:
            data = json.load(fh)
        vals = data.get("values", {}) if isinstance(data, dict) else {}
        return {k: int(v) for k, v in vals.items() if isinstance(v, (int, float))}
    except (OSError, json.JSONDecodeError, ValueError):
        return {}


def _save_baseline(values: dict) -> None:
    if not values:
        return
    path = _baseline_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as fh:
            json.dump({
                "_comment": "Factory values detected on THIS machine at first launch. "
                            "RESET TO FACTORY restores these values, not photo/DB values.",
                "captured_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                "values": values,
            }, fh, indent=2)
    except OSError:
        pass


def _controls_from_profile(entry: dict, wayland: bool,
                            nvml_data: dict | None = None) -> list[dict]:
    """Build the controls list from a device profile entry, merging live sysfs values.

    For base_clock_offset and mem_clock_offset, NVML data (from gpu_clocks.py)
    takes precedence over the profile DB values. NVML works in Wayland — these
    controls are now writable:True regardless of session type.
    """
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
            "unit": ctrl.get("unit", "MHz"),
            "value": live_current,
            "min": live_min if live_min is not None else ctrl.get("min"),
            "max": live_max if live_max is not None else ctrl.get("max"),
            "default": live_default if live_default is not None else ctrl.get("default"),
            "writable": ctrl.get("writable", False),
            "reason": ctrl.get("reason"),
        }

        # GPU clock offsets: inject NVML-live data and enable writable.
        # NVML works in Wayland (verified driver 610.43.02, RTX 4060).
        # SET requires root (pkexec → apply-gpu-clocks.sh), not Coolbits.
        if key in _CLOCK_KEYS:
            nvml_key = "core" if key == "base_clock_offset" else "mem"
            if nvml_data and nvml_data.get("ok") and nvml_key in nvml_data:
                nd = nvml_data[nvml_key]
                c["value"] = nd.get("value", 0)
                c["min"] = nd.get("safe_min", nd.get("min", -200))
                c["max"] = nd.get("safe_max", nd.get("max", 200))
                c["abs_min"] = nd.get("min")       # driver-reported absolute min
                c["abs_max"] = nd.get("max")       # driver-reported absolute max
                c["default"] = 0                    # factory = 0 MHz offset
                c["writable"] = True
                c["reason"] = None
                c["nvml_ok"] = True
                c["unit"] = nd.get("unit", "MHz")
            else:
                # NVML unavailable: show locked with explanation
                c["writable"] = False
                c["nvml_ok"] = False
                c["reason"] = (
                    "NVML unavailable (is the NVIDIA driver loaded?). "
                    "Restart the app when the driver is active."
                )

        controls.append(c)
    return controls


def _auto_profile(db: dict, wayland: bool) -> dict:
    """Build a profile from live sysfs ranges (fallback for unknown hardware)."""
    for entry in db.get("devices", []):
        if entry.get("id") == "auto":
            return entry
    # Ultimate fallback: synthesize from DB structure.
    # GPU clock offsets: writable=True stub; _controls_from_profile will inject
    # the NVML-live values. writable=False only if NVML is missing (handled there).
    return {
        "id": "auto",
        "name": "Generic (auto-detected)",
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
             "label_en": "GPU base clock offset", "unit": "MHz", "min": -200, "max": 200,
             "default": 0, "writable": True, "reason": None},
            {"key": "mem_clock_offset", "attr": None, "label_es": "Offset clock memoria GPU",
             "label_en": "GPU memory clock offset", "unit": "MHz", "min": -500, "max": 1000,
             "default": 0, "writable": True, "reason": None},
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
        """Validate, clamp, then write via the appropriate script.

        Routing:
        - pl1/pl2/dynamic_boost/thermal_target → apply-power-control.sh (pkexec)
        - base_clock_offset/mem_clock_offset    → apply-gpu-clocks.sh (pkexec)
          (NVML, works in Wayland; SET needs root)

        In test mode (ROG_FW_ATTRS_DIR set), power script is run directly
        without pkexec (fake sysfs is writable by the current user). GPU clock
        changes are SKIPPED in test mode (no fake NVML).

        Returns the refreshed state on success, or {"ok": False, "err": ...}.
        """
        if not changes:
            return {"ok": False, "err": "No se enviaron cambios."}

        # Split changes into two buckets.
        attr_changes: dict[str, float] = {}
        clock_changes: dict[str, int] = {}

        for key, val in changes.items():
            if key in _ATTR_KEYS:
                attr_changes[key] = val
            elif key in _CLOCK_KEYS:
                clock_changes[key] = int(round(float(val)))
            else:
                return {"ok": False, "err": f"Clave no reconocida: '{key}'."}

        test_mode = "ROG_FW_ATTRS_DIR" in os.environ
        run_as_root = hasattr(os, "geteuid") and os.geteuid() == 0
        direct_write = test_mode or run_as_root
        applied: dict = {}

        # --- apply asus-armoury attrs via apply-power-control.sh ---
        if attr_changes:
            args = [f"{k}={int(round(float(v)))}" for k, v in attr_changes.items()]
            script_path = str(_SCRIPT)
            if direct_write:
                cmd = ["bash", script_path] + args
                env: dict | None = dict(os.environ) if test_mode else None
            else:
                cmd = ["pkexec", "bash", script_path] + args
                env = None
            try:
                proc = subprocess.run(
                    cmd, capture_output=True, text=True, timeout=10,
                    stdin=subprocess.DEVNULL, env=env,
                )
            except (OSError, subprocess.SubprocessError) as exc:
                return {"ok": False, "err": f"Error ejecutando apply-power-control.sh: {exc}"}
            if proc.returncode != 0:
                err = (proc.stderr or proc.stdout or "Error desconocido.").strip()
                return {"ok": False, "err": err}
            applied.update(self._parse_script_output(proc.stdout))

        # --- apply GPU clock offsets via apply-gpu-clocks.sh (NVML, pkexec) ---
        if clock_changes and not test_mode:
            core_mhz = clock_changes.get("base_clock_offset")
            mem_mhz = clock_changes.get("mem_clock_offset")

            # If only one offset was sent, read the current value for the other.
            if core_mhz is None or mem_mhz is None:
                nvml = _read_nvml_offsets()
                if nvml and nvml.get("ok"):
                    if core_mhz is None:
                        core_mhz = nvml["core"]["value"]
                    if mem_mhz is None:
                        mem_mhz = nvml["mem"]["value"]
                else:
                    return {
                        "ok": False,
                        "err": "Could not read current NVML offsets to fill the missing value.",
                    }

            gpu_script_path = str(_GPU_CLOCKS_SCRIPT)
            if not Path(gpu_script_path).exists():
                return {
                    "ok": False,
                    "err": f"Script not found: {gpu_script_path}",
                }

            gpu_cmd = ["bash", gpu_script_path] if run_as_root else ["pkexec", "bash", gpu_script_path]
            gpu_cmd += [
                "set",
                "--core", str(core_mhz),
                "--mem", str(mem_mhz),
            ]
            try:
                gpu_proc = subprocess.run(
                    gpu_cmd, capture_output=True, text=True, timeout=15,
                    stdin=subprocess.DEVNULL,
                )
            except (OSError, subprocess.SubprocessError) as exc:
                return {"ok": False, "err": f"Error running apply-gpu-clocks.sh: {exc}"}
            if gpu_proc.returncode != 0:
                err = (gpu_proc.stderr or gpu_proc.stdout or "Unknown error.").strip()
                return {"ok": False, "err": f"GPU clocks: {err}"}
            # Parse JSON output from gpu_clocks.py
            try:
                gpu_result = json.loads(gpu_proc.stdout.strip() or '{}')
            except json.JSONDecodeError:
                gpu_result = {}
            if gpu_result.get("ok"):
                applied["base_clock_offset"] = gpu_result.get("core_applied", core_mhz)
                applied["mem_clock_offset"] = gpu_result.get("mem_applied", mem_mhz)
            else:
                err = gpu_result.get("err", "Unknown error while applying GPU clocks.")
                return {"ok": False, "err": f"GPU clocks: {err}"}

        # Invalidate cache and return fresh state.
        self._cache = None
        return {"ok": True, "applied": applied, "state": self.state()}

    def reset(self) -> dict:
        """Restore the machine's OWN factory values — the baseline captured
        locally on first run (firmware default_value) — never the photo/DB
        values. state() ensures the baseline exists before we read it."""
        st = self.state()  # captures + returns "baseline"
        baseline = st.get("baseline") or {}
        values = {k: int(v) for k, v in baseline.items() if k in _ATTR_KEYS}
        if not values:
            return {"ok": False, "err": "Factory values for this machine were not found."}
        return self.apply(values)

    def apply_for_profile(self, profile: str | None) -> dict:
        """Apply the calibrated power limits bound to a system profile.

        Called when the system switches between quiet/balanced/performance
        (alongside the fan curve). Resolves `profile_power` for the active
        device, pre-clamps to the safe range (first clamp), then routes the
        CPU/GPU power limits through the SAME pkexec path as manual changes
        (apply-power-control.sh), which re-clamps to the live firmware min/max
        (second clamp). GPU clock offsets are intentionally NOT touched here —
        a profile change never overrides the user's manual overclock.

        Returns:
          {"ok": True, "profile": <canon>, "applied": {...}, "state": {...}}
          {"ok": True, "skipped": "<reason>"} when this device has no
            profile_power table (power left untouched; fans still change).
          {"ok": False, "err": ...} on a write failure.
        """
        canon = _canonical_profile(profile)
        if canon is None:
            return {"ok": False, "err": f"Unknown profile: '{profile}'."}

        values = profile_power_for(canon, _active_profile_entry())
        if not values:
            return {
                "ok": True,
                "profile": canon,
                "skipped": "device-sin-profile_power",
            }

        result = self.apply(values)
        if result.get("ok"):
            result["profile"] = canon
        return result

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _build_snapshot(self) -> dict:
        """Build the full snapshot dict from live sysfs + device DB + NVML."""
        db = _load_db()
        wayland = _is_wayland()
        product = _dmi_product()

        # Read NVML offsets once (unprivileged; works in Wayland).
        nvml_data = _read_nvml_offsets()

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
                    "name": profile.get("name", "Generic"),
                    "friendly_name": profile.get("name", "Generic"),
                    "calibrated": False,
                    "source": "auto",
                }

        controls_list = _controls_from_profile(profile, wayland, nvml_data)

        # Factory baseline: capture once (firmware default_value, else current),
        # save locally; RESET TO FACTORY restores it. `default` shown in the UI is
        # this baseline, so "factory: N" reflects how THIS machine shipped.
        baseline = _load_baseline()
        if not baseline:
            for c in controls_list:
                if c["key"] in _ATTR_KEYS and c.get("attr"):
                    fav = _read_int_attr(c["attr"], "default_value")
                    if fav is None:
                        fav = c.get("value")
                    if fav is not None:
                        baseline[c["key"]] = int(fav)
            _save_baseline(baseline)

        # Emit controls as an OBJECT keyed by control id (the UI contract) with an
        # English base `label`; default = local factory baseline when known.
        controls: dict[str, dict] = {}
        for c in controls_list:
            c["label"] = c.get("label_en") or c.get("label_es") or c["key"]
            if c["key"] in baseline:
                c["default"] = baseline[c["key"]]
            controls[c["key"]] = c

        # available = at least one knob is writable with a real value+range
        # (asus-armoury OR NVML GPU clocks present and readable on this machine).
        available = any(
            c.get("writable") and c.get("value") is not None
            and c.get("min") is not None and c.get("max") is not None
            for c in controls.values()
        )

        return {
            "ok": True,
            "available": available,
            "device": device_info,
            "session": {
                "wayland": wayland,
                "display": os.environ.get("WAYLAND_DISPLAY") or os.environ.get("DISPLAY"),
                "nvml_ok": bool(nvml_data and nvml_data.get("ok")),
            },
            "controls": controls,
            "baseline": baseline,
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
        description="ROG power control (safe reads; writes through pkexec).",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("state", help="Show current state (JSON).")

    apply_p = sub.add_parser("apply", help="Apply changes (JSON).")
    apply_p.add_argument(
        "--json", required=True, metavar="JSON",
        help='JSON object with keys pl1/pl2/dynamic_boost/thermal_target/'
             'base_clock_offset/mem_clock_offset.',
    )

    sub.add_parser("reset", help="Restore firmware default values.")

    prof_p = sub.add_parser(
        "apply-profile",
        help="Apply calibrated power limits for a profile "
             "(quiet/balanced/performance).",
    )
    prof_p.add_argument(
        "profile", metavar="PROFILE",
        help="quiet | balanced | performance (accepts power-saver = quiet).",
    )

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

    if args.cmd == "apply-profile":
        result = pc.apply_for_profile(args.profile)
        print(json.dumps(result, indent=2))
        return 0 if result.get("ok") else 1

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
