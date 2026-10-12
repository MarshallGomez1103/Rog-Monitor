"""Alert engine: thresholds, cooldowns, desktop notifications, event log."""

import shutil
import subprocess
import time
from collections import deque
from datetime import datetime


# Fuente (sensor/subsistema) por categoría, para eventos viejos o logs sin fuente.
SOURCES = ("cpu", "gpu", "fan", "disk", "ram", "power", "system", "guardian")


class AlertEngine:
    def __init__(self, config, translator):
        self.cfg = config["alerts"]
        self.notify_enabled = bool(config.get("notifications", True))
        self.t = translator
        # (hora, nivel, mensaje, categoría, ctx). ctx es aditivo: los consumidores
        # viejos que leen 4 campos (o desempaquetan con *_) siguen funcionando.
        self.events: deque[tuple[str, str, str, str, dict]] = deque(maxlen=60)
        self._last_fired: dict[str, float] = {}
        self._active: set[str] = set()      # claves por encima del umbral (con histéresis)
        self._open: dict[str, tuple] = {}   # clave -> último evento del episodio (dedup)
        self._notify_bin = shutil.which("notify-send")
        self._clock = time.monotonic        # inyectable en tests

    def _over(self, key: str, value, threshold: float, margin: float) -> bool:
        """Histéresis: dispara al llegar al umbral; una vez activa sólo se
        despeja al bajar de umbral - margen (evita parpadeo en el borde)."""
        if value is None:
            return False
        if value >= threshold or (key in self._active and value > threshold - margin):
            return True
        self._active.discard(key)
        self._open.pop(key, None)
        return False

    def _clear(self, key: str) -> None:
        self._active.discard(key)
        self._open.pop(key, None)

    def _fire(self, key: str, message: str, level: str = "warn",
              notify: bool = True, category: str = "info", source: str = "system",
              value=None, threshold=None) -> None:
        now = self._clock()
        cooldown = self.cfg.get("cooldown_seconds", 60)
        last = self._last_fired.get(key)
        if last is not None and now - last < cooldown:
            return
        self._last_fired[key] = now
        # Dedup: mientras el episodio sigue abierto, la misma línea sube su
        # contador (×N) en vez de añadir N líneas idénticas.
        prev = self._open.get(key)
        count = prev[4]["count"] + 1 if prev else 1
        if prev is not None and prev in self.events:
            self.events.remove(prev)
        self.log(message if count == 1 else f"{message} ×{count}", level, category,
                 source=source, etype="alert", value=value, threshold=threshold,
                 count=count, alert_key=key)
        self._open[key] = self.events[-1]
        self._active.add(key)
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

    def log(self, message: str, level: str = "info", key: str = "info", *,
            source: str = "system", etype: str = "telemetry", value=None,
            threshold=None, count: int = 1, alert_key: str | None = None) -> None:
        """Añade un evento. `key` es la categoría (compat). etype: telemetry|alert|action."""
        ctx = {"source": source, "type": etype, "category": key, "value": value,
               "threshold": threshold, "ts_epoch": round(time.time(), 3),
               "count": count, "key": alert_key}
        self.events.append((datetime.now().strftime("%H:%M:%S"), level, message, key, ctx))

    def check(self, cpu: dict, gpu: dict, fan_list: list[dict], cpu_watts: float | None,
              sysd: dict | None = None) -> None:
        t = self.t
        mt = self.cfg.get("hysteresis_temp", 3)
        mp = self.cfg.get("hysteresis_pct", 5)
        avg = cpu.get("avg")
        thr = self.cfg["cpu_temp_warn"]
        if self._over("cpu_temp", avg, thr, mt):
            self._fire("cpu_temp", t("alert_cpu", v=avg), "crit", category="thermal",
                       source="cpu", value=avg, threshold=thr)

        active = gpu.get("active") or {}
        gpu_temp = active.get("temp")
        thr = self.cfg["gpu_temp_warn"]
        if self._over("gpu_temp", gpu_temp, thr, mt):
            self._fire("gpu_temp", t("alert_gpu", v=gpu_temp), "crit", category="thermal",
                       source="gpu", value=gpu_temp, threshold=thr)

        # Micro-throttles (a few ms) are normal on 13th-gen HX; only alert when
        # the package spent real time throttled within this sample.
        ms = cpu.get("throttle_ms_delta") or 0
        count = cpu.get("throttle_delta") or 0
        # throttling goes to the event log only — desktop notifications for it
        # annoy more than they help (the CPU is protecting itself by design)
        min_ms = self.cfg.get("throttle_min_ms", 100)
        if ms >= min_ms or count >= 5:
            self._fire("throttle",
                       t("alert_throttle", n=count, ms=ms,
                         temp=cpu.get("package") or cpu.get("avg") or 0),
                       "warn", notify=False, category="throttle",
                       source="cpu", value=ms, threshold=min_ms)
        else:
            self._clear("throttle")

        thr = self.cfg["fan_stopped_cpu_temp"]
        if avg is not None:
            for fan in fan_list:
                key = f"fan_{fan['label']}"
                if fan["rpm"] == 0 and self._over(key, avg, thr, mt):
                    self._fire(key, t("alert_fan", f=fan["label"], v=avg), "crit",
                               category="fan", source="fan", value=avg, threshold=thr)
                else:
                    self._clear(key)

        thr = self.cfg["cpu_power_warn"]
        if self._over("cpu_power", cpu_watts, thr, thr * mp / 100):
            self._fire("cpu_power", t("alert_power", v=cpu_watts), "warn", category="power",
                       source="power", value=cpu_watts, threshold=thr)

        if sysd:
            self._check_memory_disk(sysd, mp)

    def _check_memory_disk(self, sysd: dict, margin: float) -> None:
        """RAM / swap al registro (sin notificación); disco casi lleno sí notifica."""
        t = self.t
        for key, msg, value in (("ram", "alert_ram", sysd.get("ram_percent")),
                                ("swap", "alert_swap", sysd.get("swap_percent"))):
            thr = self.cfg.get(f"{key}_percent_warn", 90 if key == "ram" else 80)
            if self._over(key, value, thr, margin):
                self._fire(key, t(msg, v=value), "warn", notify=False, category="memory",
                           source="ram", value=value, threshold=thr)
        thr = self.cfg.get("disk_percent_warn", 95)
        for d in sysd.get("disks") or []:
            key = f"disk_{d.get('mount')}"
            if self._over(key, d.get("percent"), thr, margin):
                self._fire(key, t("alert_disk", m=d.get("mount"), v=d.get("percent")), "warn",
                           category="disk", source="disk", value=d.get("percent"), threshold=thr)


if __name__ == "__main__":
    # Self-check: log() must produce a 5-tuple: (hora, nivel, msg, categoría, ctx).
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
    assert len(entry) == 5, f"Expected 5-tuple, got {len(entry)}-tuple: {entry}"
    assert entry[2] == "test message", f"Unexpected message: {entry[2]}"
    assert entry[3] == "thermal", f"Unexpected key: {entry[3]}"

    e.log("plain", "info")  # default key = "info"
    entry2 = e.events[-1]
    assert len(entry2) == 5, f"Expected 5-tuple for default-key call, got {len(entry2)}: {entry2}"
    assert entry2[3] == "info", f"Unexpected default key: {entry2[3]}"

    print("alerts.py self-check PASSED")
