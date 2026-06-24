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
        self.events: deque[tuple[str, str, str, str]] = deque(maxlen=60)
        self._last_fired: dict[str, float] = {}
        self._notify_bin = shutil.which("notify-send")

    def _fire(self, key: str, message: str, level: str = "warn",
              notify: bool = True, category: str = "info") -> None:
        now = time.monotonic()
        cooldown = self.cfg.get("cooldown_seconds", 120)
        if now - self._last_fired.get(key, -cooldown) < cooldown:
            return
        self._last_fired[key] = now
        self.log(message, level, category)
        if notify and self.notify_enabled and self._notify_bin:
            try:
                # urgency=normal on purpose: KDE keeps critical notifications
                # on screen forever; normal + expire-time auto-dismisses.
                subprocess.Popen(
                    [self._notify_bin, "--app-name=ROG Monitor",
                     "--urgency=normal", "--expire-time=5000",
                     "ROG Monitor", message],
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                )
            except OSError:
                pass

    def log(self, message: str, level: str = "info", key: str = "info") -> None:
        self.events.append((datetime.now().strftime("%H:%M:%S"), level, message, key))

    def check(self, cpu: dict, gpu: dict, fan_list: list[dict], cpu_watts: float | None) -> None:
        t = self.t
        avg = cpu.get("avg")
        if avg is not None and avg >= self.cfg["cpu_temp_warn"]:
            self._fire("cpu_temp", t("alert_cpu", v=avg), "crit", category="thermal")

        active = gpu.get("active") or {}
        gpu_temp = active.get("temp")
        if gpu_temp is not None and gpu_temp >= self.cfg["gpu_temp_warn"]:
            self._fire("gpu_temp", t("alert_gpu", v=gpu_temp), "crit", category="thermal")

        # Micro-throttles (a few ms) are normal on 13th-gen HX; only alert when
        # the package spent real time throttled within this sample.
        ms = cpu.get("throttle_ms_delta") or 0
        count = cpu.get("throttle_delta") or 0
        # throttling goes to the event log only — desktop notifications for it
        # annoy more than they help (the CPU is protecting itself by design)
        if ms >= self.cfg.get("throttle_min_ms", 100) or count >= 5:
            self._fire("throttle",
                       t("alert_throttle", n=count, ms=ms,
                         temp=cpu.get("package") or cpu.get("avg") or 0),
                       "warn", notify=False, category="throttle")

        if avg is not None and avg >= self.cfg["fan_stopped_cpu_temp"]:
            for fan in fan_list:
                if fan["rpm"] == 0:
                    self._fire(f"fan_{fan['label']}", t("alert_fan", f=fan["label"], v=avg), "crit",
                               category="fan")

        if cpu_watts is not None and cpu_watts >= self.cfg["cpu_power_warn"]:
            self._fire("cpu_power", t("alert_power", v=cpu_watts), "warn", category="power")


if __name__ == "__main__":
    # Self-check: log() must produce a 4-tuple whose last element is the key.
    from collections import deque
    class _FakeCfg:
        pass

    class _FakeTranslator:
        def __call__(self, k, **kw):
            return k

    class _Stub(AlertEngine):
        def __init__(self):
            self.cfg = {"cooldown_seconds": 0}
            self.notify_enabled = False
            self.t = _FakeTranslator()
            self.events = deque(maxlen=60)
            self._last_fired = {}
            self._notify_bin = None

    e = _Stub()
    e.log("test message", "warn", "thermal")
    entry = e.events[-1]
    assert len(entry) == 4, f"Expected 4-tuple, got {len(entry)}-tuple: {entry}"
    assert entry[2] == "test message", f"Unexpected message: {entry[2]}"
    assert entry[3] == "thermal", f"Unexpected key: {entry[3]}"

    e.log("plain", "info")  # default key = "info"
    entry2 = e.events[-1]
    assert len(entry2) == 4, f"Expected 4-tuple for default-key call, got {len(entry2)}: {entry2}"
    assert entry2[3] == "info", f"Unexpected default key: {entry2[3]}"

    print("alerts.py self-check PASSED")
