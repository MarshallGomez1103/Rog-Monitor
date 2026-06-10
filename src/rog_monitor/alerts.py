"""Alert engine: thresholds, cooldowns, desktop notifications, event log."""

import shutil
import subprocess
import time
from collections import deque
from datetime import datetime


class AlertEngine:
    def __init__(self, config, translator):
        self.cfg = config["alerts"]
        self.notify_enabled = bool(config.get("notifications", True))
        self.t = translator
        self.events: deque[tuple[str, str, str]] = deque(maxlen=60)
        self._last_fired: dict[str, float] = {}
        self._notify_bin = shutil.which("notify-send")

    def _fire(self, key: str, message: str, level: str = "warn") -> None:
        now = time.monotonic()
        cooldown = self.cfg.get("cooldown_seconds", 120)
        if now - self._last_fired.get(key, -cooldown) < cooldown:
            return
        self._last_fired[key] = now
        self.log(message, level)
        if self.notify_enabled and self._notify_bin:
            try:
                subprocess.Popen(
                    [self._notify_bin, "--app-name=ROG Monitor",
                     "--urgency=critical" if level == "crit" else "--urgency=normal",
                     "ROG Monitor", message],
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                )
            except OSError:
                pass

    def log(self, message: str, level: str = "info") -> None:
        self.events.append((datetime.now().strftime("%H:%M:%S"), level, message))

    def check(self, cpu: dict, gpu: dict, fan_list: list[dict], cpu_watts: float | None) -> None:
        t = self.t
        avg = cpu.get("avg")
        if avg is not None and avg >= self.cfg["cpu_temp_warn"]:
            self._fire("cpu_temp", t("alert_cpu", v=avg), "crit")

        active = gpu.get("active") or {}
        gpu_temp = active.get("temp")
        if gpu_temp is not None and gpu_temp >= self.cfg["gpu_temp_warn"]:
            self._fire("gpu_temp", t("alert_gpu", v=gpu_temp), "crit")

        if cpu.get("throttled_now"):
            self._fire("throttle", t("alert_throttle"), "crit")

        if avg is not None and avg >= self.cfg["fan_stopped_cpu_temp"]:
            for fan in fan_list:
                if fan["rpm"] == 0:
                    self._fire(f"fan_{fan['label']}", t("alert_fan", f=fan["label"], v=avg), "crit")

        if cpu_watts is not None and cpu_watts >= self.cfg["cpu_power_warn"]:
            self._fire("cpu_power", t("alert_power", v=cpu_watts), "warn")
