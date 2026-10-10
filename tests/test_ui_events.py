import unittest

from rog_monitor import ui


class EventsPanelTest(unittest.TestCase):
    def test_four_field_events_render(self):
        # alerts.log() guarda (hora, nivel, mensaje, clave); antes ui.py esperaba 3 → ValueError
        state = {"events": [("12:00:00", "crit", "CPU 95°C", "cpu_temp")]}
        th = ui.THEMES[next(iter(ui.THEMES))]
        ui.events_panel(state, lambda k, **kw: k, th)
        ui.events_panel(state, lambda k, **kw: k, th, full=True)

    def test_severity_filter_and_ctx_tuple(self):
        from io import StringIO
        from rich.console import Console
        evs = [("12:00:00", "info", "solo-info", "info", {}),
               ("12:00:01", "warn", "solo-warn", "power", {}),
               ("12:00:02", "crit", "solo-crit", "thermal", {})]
        th = ui.THEMES[next(iter(ui.THEMES))]
        tr = lambda k, **kw: k
        for flt, want in (("all", 3), ("warn", 2), ("crit", 1)):
            buf = StringIO()
            Console(file=buf, width=100).print(
                ui.events_panel({"events": evs, "events_filter": flt}, tr, th, full=True))
            self.assertEqual(sum(w in buf.getvalue() for w in ("solo-info", "solo-warn", "solo-crit")), want)


if __name__ == "__main__":
    unittest.main()
