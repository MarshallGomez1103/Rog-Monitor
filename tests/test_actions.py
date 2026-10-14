"""actions.py: perfil, modo de GPU y exportación, con runner falso (nada se ejecuta)."""

from __future__ import annotations

import csv
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from rog_monitor import actions
from rog_monitor.power import PPD_BUS


def proc(rc=0, out="", err=""):
    return subprocess.CompletedProcess([], rc, stdout=out, stderr=err)


class FakeSeries:
    def __init__(self, vals):
        self._v = list(vals)

    def values(self):
        return list(self._v)


class RunHelper(unittest.TestCase):
    def test_success_joins_stdout_and_stderr_stripped(self):
        with mock.patch.object(actions.subprocess, "run",
                               return_value=proc(0, "out\n", "warn\n")) as run:
            self.assertEqual(actions._run(["x", "y"]), (True, "out\nwarn"))
        run.assert_called_once_with(["x", "y"], capture_output=True, text=True,
                                    timeout=5.0, stdin=subprocess.DEVNULL)

    def test_nonzero_exit_is_failure_with_output(self):
        with mock.patch.object(actions.subprocess, "run",
                               return_value=proc(3, "", "boom\n")):
            self.assertEqual(actions._run(["x"]), (False, "boom"))

    def test_timeout_is_failure_not_exception(self):
        exc = subprocess.TimeoutExpired(["x"], 5)
        with mock.patch.object(actions.subprocess, "run", side_effect=exc):
            ok, msg = actions._run(["x"])
        self.assertFalse(ok)
        self.assertIn("timed out", msg)

    def test_missing_binary_is_failure_with_message(self):
        with mock.patch.object(actions.subprocess, "run",
                               side_effect=FileNotFoundError("no busctl")):
            self.assertEqual(actions._run(["busctl"]), (False, "no busctl"))

    def test_custom_timeout_is_forwarded(self):
        with mock.patch.object(actions.subprocess, "run", return_value=proc()) as run:
            actions._run(["x"], timeout=90)
        self.assertEqual(run.call_args.kwargs["timeout"], 90)

    def test_unexpected_exception_type_propagates(self):
        with mock.patch.object(actions.subprocess, "run", side_effect=ValueError("x")):
            with self.assertRaises(ValueError):
                actions._run(["x"])


class CycleProfile(unittest.TestCase):
    def cycle(self, current, rc=0):
        with mock.patch.object(actions.subprocess, "run", return_value=proc(rc)) as run:
            res = actions.cycle_profile(current)
        return res, run

    def test_order_is_saver_balanced_performance_and_wraps(self):
        self.assertEqual(self.cycle("power-saver")[0], (True, "balanced"))
        self.assertEqual(self.cycle("balanced")[0], (True, "performance"))
        self.assertEqual(self.cycle("performance")[0], (True, "power-saver"))

    def test_none_counts_as_balanced(self):
        self.assertEqual(self.cycle(None)[0], (True, "performance"))

    def test_unknown_profile_restarts_from_the_first_next(self):
        # idx=0 (power-saver) -> el siguiente es balanced
        self.assertEqual(self.cycle("turbo")[0], (True, "balanced"))

    def test_exact_argv_and_stdin_devnull(self):
        _, run = self.cycle("balanced")
        self.assertEqual(run.call_args[0][0],
                         ["busctl", "--system", "set-property", *PPD_BUS,
                          "ActiveProfile", "s", "performance"])
        self.assertIs(run.call_args.kwargs["stdin"], subprocess.DEVNULL)
        self.assertEqual(run.call_args.kwargs["timeout"], 5.0)

    def test_failure_reports_not_ok_but_still_the_target(self):
        self.assertEqual(self.cycle("balanced", rc=1)[0], (False, "performance"))

    def test_missing_busctl_is_not_ok(self):
        with mock.patch.object(actions.subprocess, "run", side_effect=OSError("x")):
            self.assertEqual(actions.cycle_profile("balanced"), (False, "performance"))


class GpuToggleTarget(unittest.TestCase):
    def test_hybrid_goes_to_integrated_case_insensitive(self):
        self.assertEqual(actions.gpu_toggle_target("Hybrid", None), ("Integrated", False))
        self.assertEqual(actions.gpu_toggle_target("hybrid", None), ("Integrated", False))

    def test_anything_else_goes_to_hybrid(self):
        for cur in ("Integrated", "Dedicated", "", None, "weird"):
            self.assertEqual(actions.gpu_toggle_target(cur, None), ("Hybrid", False), cur)

    def test_pending_different_from_current_cancels_back_to_current(self):
        self.assertEqual(actions.gpu_toggle_target("Hybrid", "Integrated"), ("Hybrid", True))

    def test_pending_equal_to_current_is_not_a_cancel(self):
        self.assertEqual(actions.gpu_toggle_target("Hybrid", "Hybrid"), ("Integrated", False))

    def test_pending_without_current_is_not_a_cancel(self):
        self.assertEqual(actions.gpu_toggle_target(None, "Integrated"), ("Hybrid", False))


class SetGpuMode(unittest.TestCase):
    def test_argv_timeout_and_stdin(self):
        with mock.patch.object(actions.subprocess, "run",
                               return_value=proc(0, "ok\n")) as run:
            self.assertEqual(actions.set_gpu_mode("Integrated"), (True, "ok"))
        self.assertEqual(run.call_args[0][0], ["supergfxctl", "--mode", "Integrated"])
        self.assertEqual(run.call_args.kwargs["timeout"], 90)
        self.assertIs(run.call_args.kwargs["stdin"], subprocess.DEVNULL)

    def test_daemon_error_text_is_returned(self):
        with mock.patch.object(actions.subprocess, "run",
                               return_value=proc(1, "", "busy\n")):
            self.assertEqual(actions.set_gpu_mode("Hybrid"), (False, "busy"))

    def test_timeout_after_90_s_is_not_ok(self):
        exc = subprocess.TimeoutExpired(["supergfxctl"], 90)
        with mock.patch.object(actions.subprocess, "run", side_effect=exc):
            ok, msg = actions.set_gpu_mode("Hybrid")
        self.assertFalse(ok)
        self.assertIn("90", msg)

    def test_not_installed(self):
        with mock.patch.object(actions.subprocess, "run",
                               side_effect=FileNotFoundError("supergfxctl")):
            self.assertEqual(actions.set_gpu_mode("Hybrid"), (False, "supergfxctl"))


class ExportHistory(unittest.TestCase):
    def export(self, series, events):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        with mock.patch.object(actions, "DATA_DIR", Path(tmp.name)):
            out = Path(actions.export_history(series, events))
        return out

    def test_returns_exports_dir_and_writes_json_and_csv(self):
        out = self.export({"cpu": FakeSeries([1, 2])}, [])
        self.assertEqual(out.name, "exports")
        self.assertEqual(len(list(out.glob("rog-monitor-*.json"))), 1)
        self.assertEqual(len(list(out.glob("rog-monitor-*.csv"))), 1)

    def test_no_events_means_no_events_file(self):
        out = self.export({"cpu": FakeSeries([1])}, [])
        self.assertEqual(list(out.glob("*-events.csv")), [])
        data = json.loads(next(out.glob("*.json")).read_text())
        self.assertEqual(data["events"], [])

    def test_columns_of_different_length_pad_with_empty_cells(self):
        out = self.export({"a": FakeSeries([1, 2, 3]), "b": FakeSeries([9])}, [])
        csv_file = next(p for p in out.glob("*.csv") if not p.name.endswith("-events.csv"))
        rows = list(csv.reader(csv_file.read_text().splitlines()))
        self.assertEqual(rows, [["sample", "a", "b"], ["0", "1", "9"],
                                ["1", "2", ""], ["2", "3", ""]])

    def test_no_series_writes_header_only(self):
        out = self.export({}, [])
        csv_file = next(out.glob("*.csv"))
        self.assertEqual(csv_file.read_text().strip(), "sample")

    def test_events_csv_flattens_context_and_tolerates_old_events(self):
        events = [
            ("12:00:00", "warn", "CPU caliente", "temp",
             {"source": "cpu", "type": "hot", "value": 95, "threshold": 90, "count": 2}),
            ("12:00:05", "info", "viejo"),                      # 3 campos
            ("12:00:06", "info", "sin ctx", "power", "no-dict"),  # ctx no dict
            ("12:00:07", "crit", "valor cero", "temp",
             {"value": 0, "threshold": None}),
        ]
        out = self.export({"cpu": FakeSeries([1])}, events)
        data = json.loads(next(out.glob("*.json")).read_text())
        self.assertEqual(data["events"][1], ["12:00:05", "info", "viejo"])
        ev_file = next(out.glob("*-events.csv"))
        rows = list(csv.reader(ev_file.read_text().splitlines()))
        self.assertEqual(rows[0], ["time", "level", "category", "source", "type",
                                   "value", "threshold", "count", "message"])
        self.assertEqual(rows[1], ["12:00:00", "warn", "temp", "cpu", "hot",
                                   "95", "90", "2", "CPU caliente"])
        self.assertEqual(rows[2], ["12:00:05", "info", "", "", "", "", "", "", "viejo"])
        self.assertEqual(rows[3], ["12:00:06", "info", "power", "", "", "", "", "", "sin ctx"])
        self.assertEqual(rows[4], ["12:00:07", "crit", "temp", "", "",
                                   "0", "", "", "valor cero"])


if __name__ == "__main__":
    unittest.main()
