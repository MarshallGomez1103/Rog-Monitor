"""CP-3.03/3.05: series de uso (CPU %, RAM %, swap %) con huecos, límites y export."""

import csv
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from rog_monitor import actions
from rog_monitor.history import Series


def usage_series():
    # mismas claves/orden que App.series (uso en % 0-100)
    return {name: Series(900) for name in ("cpu_temp", "cpu_usage", "ram_used", "swap_used")}


class UsageSeries(unittest.TestCase):
    def test_push_sequence_with_none_keeps_alignment(self):
        s = usage_series()
        # 1ª muestra: cpu.usage None; sin swap: swap_percent None siempre
        for cpu, ram in ((None, 40), (12.5, 41), (80.0, 41)):
            s["cpu_temp"].push(50)
            s["cpu_usage"].push(cpu)
            s["ram_used"].push(ram)
            s["swap_used"].push(None)
        self.assertEqual(s["cpu_usage"].values(), [None, 12.5, 80.0])
        self.assertEqual(s["ram_used"].values(), [40.0, 41.0, 41.0])
        self.assertEqual(s["swap_used"].values(), [None, None, None])
        self.assertFalse(s["swap_used"].has_data())
        self.assertEqual({len(x.values()) for x in s.values()}, {3})
        self.assertEqual(s["cpu_usage"].max(), 80.0)
        self.assertEqual(s["cpu_usage"].last(), 80.0)

    def test_series_are_time_bounded(self):
        s = Series(10)
        with mock.patch("rog_monitor.history.time.monotonic", side_effect=[0, 5, 11, 30]):
            for v in (1, 2, 3, 4):
                s.push(v)
        # cutoff en t=30 -> 20: sólo sobrevive la última
        self.assertEqual(s.values(), [4.0])

    def test_export_has_new_columns_and_blank_gaps(self):
        s = usage_series()
        for cpu, ram, swap in ((None, 40, None), (10, 41, 0)):
            s["cpu_temp"].push(50)
            s["cpu_usage"].push(cpu)
            s["ram_used"].push(ram)
            s["swap_used"].push(swap)
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.object(actions, "DATA_DIR", Path(tmp)):
                out = Path(actions.export_history(s, []))
            with open(next(out.glob("*.csv"))) as fh:
                rows = list(csv.reader(fh))
            with open(next(out.glob("*.json"))) as fh:
                data = json.load(fh)
        self.assertEqual(rows[0], ["sample", "cpu_temp", "cpu_usage", "ram_used", "swap_used"])
        self.assertEqual(rows[1], ["0", "50.0", "", "40.0", ""])
        self.assertEqual(rows[2], ["1", "50.0", "10.0", "41.0", "0.0"])
        self.assertEqual(data["cpu_usage"], [None, 10.0])


if __name__ == "__main__":
    unittest.main()
