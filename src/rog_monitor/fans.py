"""Fan RPM reading with percentages relative to the user's RPM cap."""

import json

from . import hwmon
from .config import CONFIG_DIR

# Sensible startup maximums for ROG Strix; auto-raised when exceeded.
DEFAULT_MAX = {"cpu_fan": 7100, "gpu_fan": 7000, "mid_fan": 7600}
FALLBACK_MAX = 6000
FAN_CURVES_FILE = CONFIG_DIR / "fan-curves.json"
# JSON cap keys (cpu/gpu/mid) → hwmon fan labels.
CAP_KEY = {"cpu_fan": "cpu", "gpu_fan": "gpu", "mid_fan": "mid"}


def load_caps() -> dict:
    """RPM cap per fan label from fan-curves.json (empty if none set)."""
    try:
        with open(FAN_CURVES_FILE) as fh:
            cap = (json.load(fh) or {}).get("cap_rpm") or {}
    except (OSError, ValueError):
        return {}
    out = {}
    for label, key in CAP_KEY.items():
        value = cap.get(key)
        if isinstance(value, (int, float)) and value > 0:
            out[label] = int(value)
    return out


class FanReader:
    def __init__(self, chips: dict, config):
        self.config = config
        # asus chip exposes cpu_fan/gpu_fan/mid_fan; otherwise use any chip with fans
        self.devs = []
        preferred = hwmon.find(chips, "asus")
        if preferred is not None:
            self.devs = [preferred]
        else:
            self.devs = [
                dev
                for paths in chips.values()
                for dev in paths
                if any(dev.glob("fan*_input"))
            ]
        stored = config.get("fan_max_rpm") or {}
        self.max_rpm = {**DEFAULT_MAX, **stored}
        self.caps = load_caps()
        self._caps_mtime = self._curves_mtime()
        self._dirty = False

    @staticmethod
    def _curves_mtime() -> float:
        try:
            return FAN_CURVES_FILE.stat().st_mtime
        except OSError:
            return 0.0

    def _maybe_reload_caps(self) -> None:
        mtime = self._curves_mtime()
        if mtime != self._caps_mtime:
            self.caps = load_caps()
            self._caps_mtime = mtime

    def read(self) -> list[dict]:
        self._maybe_reload_caps()
        out = []
        for dev in self.devs:
            for label, rpm in hwmon.fans(dev).items():
                top = self.max_rpm.get(label, FALLBACK_MAX)
                if rpm > top:
                    self.max_rpm[label] = top = rpm
                    self._dirty = True
                # Percent is relative to the user's RPM cap when one is set,
                # so 100% means "at the cap". Above the cap is clamped to 100.
                ref = self.caps.get(label) or top
                out.append(
                    {
                        "label": label,
                        "rpm": rpm,
                        "percent": min(100, round(rpm * 100 / ref)) if ref else 0,
                        "cap": self.caps.get(label),
                    }
                )
        return out

    def persist_max(self) -> None:
        if self._dirty:
            self.config.data["fan_max_rpm"] = self.max_rpm
            self.config.save()
            self._dirty = False
