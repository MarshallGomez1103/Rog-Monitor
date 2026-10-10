import unittest

from rog_monitor import ui


class EventsPanelTest(unittest.TestCase):
    def test_four_field_events_render(self):
        # alerts.log() guarda (hora, nivel, mensaje, clave); antes ui.py esperaba 3 → ValueError
        state = {"events": [("12:00:00", "crit", "CPU 95°C", "cpu_temp")]}
        th = ui.THEMES[next(iter(ui.THEMES))]
        ui.events_panel(state, lambda k, **kw: k, th)
        ui.events_panel(state, lambda k, **kw: k, th, full=True)


if __name__ == "__main__":
    unittest.main()
