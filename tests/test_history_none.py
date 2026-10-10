"""Series guarda None como hueco y todos sus consumidores lo toleran."""

import csv
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from rog_monitor import actions, graph
from rog_monitor.history import Series


def series_of(*values):
    s = Series(900)
    for v in values:
        s.push(v)
    return s


class SeriesNone(unittest.TestCase):
    def test_none_is_stored_and_series_stay_aligned(self):
        cpu = series_of(50, 51, 52)
        gpu = series_of(None, 40, None)
        self.assertEqual(len(cpu.values()), len(gpu.values()))
        self.assertEqual(gpu.values(), [None, 40.0, None])

    def test_stats_skip_none(self):
        s = series_of(None, 10, None, 20)
        self.assertEqual(s.min(), 10.0)
        self.assertEqual(s.max(), 20.0)
        self.assertEqual(s.avg(), 15.0)
        self.assertEqual(s.avg(60), 15.0)

    def test_all_none_gives_none_stats(self):
        s = series_of(None, None)
        self.assertIsNone(s.min())
        self.assertIsNone(s.max())
        self.assertIsNone(s.avg())
        self.assertFalse(s.has_data())

    def test_last_is_none_after_gap_and_has_data(self):
        s = series_of(30, None)
        self.assertIsNone(s.last())
        self.assertTrue(s.has_data())

    def test_window_trims_old_samples_including_none(self):
        s = Series(10)
        with mock.patch("rog_monitor.history.time.monotonic", side_effect=[0, 1, 100]):
            s.push(None)
            s.push(5)
            s.push(None)
        self.assertEqual(s.values(), [None])  # solo la última cae dentro de 10 s


class GraphNone(unittest.TestCase):
    def test_render_with_gaps_keeps_width_and_marks_gap(self):
        rows = graph.render([1, None, 3, None], 6, height=3)
        self.assertEqual(len(rows), 3)
        self.assertTrue(all(len(r) == 6 for r in rows))
        self.assertEqual(rows[-1][3], graph.GAP)  # columna del primer hueco (pad=2)
        self.assertEqual(rows[0][3], " ")

    def test_render_all_none_is_blank(self):
        self.assertEqual(graph.render([None, None], 4, height=2), ["    "] * 2)

    def test_axis_labels_ignore_none(self):
        self.assertEqual(graph.axis_labels([None, 10, 20, None], 10), ("20", "10"))
        self.assertEqual(graph.axis_labels([None, None], 10), ("", ""))


class ExportNone(unittest.TestCase):
    def test_csv_empty_cell_and_json_null(self):
        series = {"cpu_temp": series_of(50, 51), "gpu_temp": series_of(None, 40)}
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(actions, "DATA_DIR", Path(tmp)):
            out = Path(actions.export_history(series, []))
            rows = list(csv.reader(next(out.glob("*.csv")).read_text().splitlines()))
            data = json.loads(next(out.glob("*.json")).read_text())
        self.assertEqual(rows[0], ["sample", "cpu_temp", "gpu_temp"])
        self.assertEqual(rows[1], ["0", "50.0", ""])
        self.assertEqual(rows[2], ["1", "51.0", "40.0"])
        self.assertEqual(data["gpu_temp"], [None, 40.0])


class TuiRenderNone(unittest.TestCase):
    def test_history_panel_renders_gpu_series_with_gaps(self):
        from tests.test_tui_render import fixture_state, render
        base = render(fixture_state(), 120).count(graph.GAP)
        state = fixture_state()
        for v in (None, 41, None, 43, None):
            state["series"]["gpu_temp"].push(v)
        self.assertEqual(render(state, 120).count(graph.GAP), base + 3)

    def test_history_panel_hides_gpu_graph_when_only_gaps(self):
        from tests.test_tui_render import fixture_state, render
        state = fixture_state()
        state["series"]["gpu_temp"] = Series(900)
        state["series"]["gpu_temp"].push(None)
        state["series"]["gpu_power"] = Series(900)
        render(state, 120)  # no debe lanzar


if __name__ == "__main__":
    unittest.main()
