"""AlertEngine: cruce de umbral, dedup (×N), histéresis, cooldown y ctx del evento.

Reloj inyectable (engine._clock) y notify-send simulado: nada de notificaciones reales.
"""
import unittest
from unittest import mock

from rog_monitor.alerts import AlertEngine

CFG = {
    "alerts": {
        "cpu_temp_warn": 90, "gpu_temp_warn": 85, "cpu_power_warn": 100,
        "fan_stopped_cpu_temp": 60, "cooldown_seconds": 60, "throttle_min_ms": 100,
        "hysteresis_temp": 3, "hysteresis_pct": 5,
    },
    "notifications": True,
}
CTX_KEYS = {"source", "type", "category", "value", "threshold", "ts_epoch", "count", "key"}


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def make():
    eng = AlertEngine(CFG, lambda k, **kw: f"{k}:{kw.get('v', '')}")
    eng._notify_bin = "/usr/bin/notify-send"
    eng._clock = Clock()
    return eng


def tick(eng, avg=50, gpu=None, fans=(), watts=None, dt=1):
    eng._clock.now += dt
    eng.check({"avg": avg}, {"active": {"temp": gpu} if gpu is not None else None},
              list(fans), watts)


class AlertEngineTest(unittest.TestCase):
    def setUp(self):
        p = mock.patch("rog_monitor.alerts.subprocess.Popen")
        self.popen = p.start()
        self.addCleanup(p.stop)

    def test_crossing_fires_once_with_ctx(self):
        e = make()
        tick(e, 80)
        self.assertEqual(len(e.events), 0)
        tick(e, 95)
        self.assertEqual(len(e.events), 1)
        stamp, level, msg, cat, ctx = e.events[-1]
        self.assertEqual((level, cat), ("crit", "thermal"))
        self.assertEqual(set(ctx), CTX_KEYS)
        self.assertEqual((ctx["source"], ctx["type"], ctx["value"], ctx["threshold"], ctx["count"]),
                         ("cpu", "alert", 95, 90, 1))
        self.assertEqual(ctx["category"], "thermal")
        self.assertEqual(ctx["key"], "cpu_temp")
        self.assertIsInstance(ctx["ts_epoch"], float)
        self.assertEqual(self.popen.call_count, 1)
        argv = self.popen.call_args[0][0]
        self.assertIn("--urgency=normal", argv)
        self.assertIn("--expire-time=5000", argv)

    def test_staying_above_does_not_spam(self):
        e = make()
        for _ in range(30):  # 30 s < cooldown de 60 s
            tick(e, 95)
        self.assertEqual(len(e.events), 1)
        self.assertEqual(self.popen.call_count, 1)

    def test_cooldown_refire_dedups_into_counter(self):
        e = make()
        tick(e, 95)
        tick(e, 95, dt=61)
        tick(e, 96, dt=61)
        self.assertEqual(len(e.events), 1)  # una sola línea, con contador
        msg, ctx = e.events[-1][2], e.events[-1][4]
        self.assertTrue(msg.endswith("×3"), msg)
        self.assertEqual((ctx["count"], ctx["value"]), (3, 96))
        self.assertEqual(self.popen.call_count, 3)  # notificación limitada por el mismo cooldown
        # la notificación no lleva el sufijo ×N
        self.assertNotIn("×", self.popen.call_args[0][0][-1])

    def test_drop_within_margin_does_not_clear(self):
        e = make()
        tick(e, 95)
        tick(e, 88)            # 88 > 90 - 3: sigue activa
        tick(e, 95, dt=61)     # mismo episodio -> ×2, no línea nueva
        self.assertEqual(len(e.events), 1)
        self.assertEqual(e.events[-1][4]["count"], 2)

    def test_drop_below_margin_clears_and_can_fire_again(self):
        e = make()
        tick(e, 95)
        tick(e, 80)            # < 87: despeja
        self.assertNotIn("cpu_temp", e._active)
        tick(e, 95)            # dentro del cooldown: aún no
        self.assertEqual(len(e.events), 1)
        tick(e, 95, dt=61)     # tras el cooldown: episodio nuevo, línea nueva (count 1)
        self.assertEqual(len(e.events), 2)
        self.assertEqual(e.events[-1][4]["count"], 1)
        self.assertFalse(e.events[-1][2].endswith("×2"))

    def test_cooldown_is_per_key(self):
        e = make()
        tick(e, 95, gpu=90)
        self.assertEqual([ev[4]["source"] for ev in e.events], ["cpu", "gpu"])

    def test_power_uses_percent_margin(self):
        e = make()
        tick(e, watts=110)
        self.assertEqual(len(e.events), 1)
        tick(e, watts=96)      # > 100 - 5 %: activa
        self.assertIn("cpu_power", e._active)
        tick(e, watts=94)      # < 95: despeja
        self.assertNotIn("cpu_power", e._active)

    def test_throttle_logs_without_notification(self):
        e = make()
        e.check({"avg": 70, "throttle_ms_delta": 250, "throttle_delta": 1}, {}, [], None)
        self.assertEqual(e.events[-1][3], "throttle")
        self.assertEqual(e.events[-1][4]["source"], "cpu")
        self.popen.assert_not_called()

    def test_stopped_fan_needs_hot_cpu(self):
        e = make()
        tick(e, 50, fans=[{"label": "cpu", "rpm": 0}])
        self.assertEqual(len(e.events), 0)
        tick(e, 70, fans=[{"label": "cpu", "rpm": 0}])
        self.assertEqual(e.events[-1][4]["source"], "fan")

    def test_log_action_ctx_and_four_field_compat(self):
        e = make()
        e.log("Perfil", source="power", etype="action")
        ev = e.events[-1]
        self.assertEqual(len(ev), 5)
        stamp, level, msg, *_ = ev  # consumidores viejos
        self.assertEqual((level, msg), ("info", "Perfil"))
        self.assertEqual((ev[4]["type"], ev[4]["source"]), ("action", "power"))
        e.log("x")  # defaults
        self.assertEqual((e.events[-1][4]["type"], e.events[-1][4]["source"]), ("telemetry", "system"))

    def test_notifications_disabled(self):
        e = make()
        e.notify_enabled = False
        tick(e, 95)
        self.popen.assert_not_called()


if __name__ == "__main__":
    unittest.main()
