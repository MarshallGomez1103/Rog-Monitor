"""Fan RPM reading with auto-calibrating maximums for percentage bars."""

from . import hwmon

# Sensible startup maximums for ROG Strix; auto-raised when exceeded.
DEFAULT_MAX = {"cpu_fan": 7100, "gpu_fan": 7000, "mid_fan": 7600}
FALLBACK_MAX = 6000


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
        self._dirty = False

    def read(self) -> list[dict]:
        out = []
        for dev in self.devs:
            for label, rpm in hwmon.fans(dev).items():
                top = self.max_rpm.get(label, FALLBACK_MAX)
                if rpm > top:
                    self.max_rpm[label] = top = rpm
                    self._dirty = True
                out.append(
                    {
                        "label": label,
                        "rpm": rpm,
                        "percent": min(100, round(rpm * 100 / top)) if top else 0,
                    }
                )
        return out

    def persist_max(self) -> None:
        if self._dirty:
            self.config.data["fan_max_rpm"] = self.max_rpm
            self.config.save()
            self._dirty = False
