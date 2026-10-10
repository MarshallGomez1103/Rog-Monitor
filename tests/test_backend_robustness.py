"""Robustez del backend: stream NDJSON, escrituras atómicas, fans, GPU, sesiones."""

import io
import json
import tempfile
import time
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

from rog_monitor import app, aura, config, fans, game_session, gpu_clocks, settings


class StreamLoop(unittest.TestCase):
    def test_stream_survives_exception(self):
        a = object.__new__(app.App)
        a.interval = 0
        a.procs = mock.Mock()
        a.rapl = mock.Mock()
        calls = {"n": 0}

        def snap():
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("boom")
            if calls["n"] == 4:
                raise KeyboardInterrupt
            return '{"ok": %d}' % calls["n"]

        a.snapshot_json = snap
        a._log_error = mock.Mock()
        out = io.StringIO()
        with mock.patch.object(app.time, "sleep"), redirect_stdout(out):
            a.run_json(True)
        self.assertEqual(a._log_error.call_count, 1)
        self.assertEqual(out.getvalue().split(), ['{"ok":', '2}', '{"ok":', '3}'])
        a.procs.read.assert_called_once()  # cebado antes de la primera línea
        a.rapl.read_watts.assert_called_once()


class AtomicWrite(unittest.TestCase):
    def test_no_partial_file_on_failure(self):
        with tempfile.TemporaryDirectory() as d:
            target = Path(d) / "x.json"
            config.write_atomic(target, '{"a": 1}')
            with mock.patch.object(config.os, "replace", side_effect=OSError("disco")):
                with self.assertRaises(OSError):
                    config.write_atomic(target, '{"a": 2')
            self.assertEqual(json.loads(target.read_text()), {"a": 1})
            self.assertEqual([p.name for p in Path(d).iterdir()], ["x.json"])


class FanCurves(unittest.TestCase):
    def test_corrupt_backup_and_merge(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "fan-curves.json"
            with mock.patch.object(fans, "FAN_CURVES_FILE", f):
                f.write_text('{"cap_rpm": {"cpu": 4000},')  # corrupto
                self.assertEqual(fans._load_raw(), {})
                fans._load_raw()  # segunda lectura no duplica el respaldo
                baks = list(Path(d).glob("fan-curves.json.corrupt-*.bak"))
                self.assertEqual(len(baks), 1)
                self.assertIn("4000", baks[0].read_text())

                # JSON válido con claves ajenas: el guardado las conserva
                f.write_text(json.dumps({"calibration": {"cpu": [1]}, "max_rpm": {"cpu": 7000},
                                         "gaming_cap_rpm": 6500, "extra": True}))
                fans.save_all_config({"cap_rpm": {"cpu": 5000}})
                data = json.loads(f.read_text())
                self.assertEqual(data["cap_rpm"], {"cpu": 5000})
                for k in ("calibration", "max_rpm", "gaming_cap_rpm", "extra"):
                    self.assertIn(k, data)

    def test_gaming_cap_only_when_guardian_gaming(self):
        with tempfile.TemporaryDirectory() as d:
            f, g = Path(d) / "fan-curves.json", Path(d) / "guardian.json"
            f.write_text(json.dumps({"cap_rpm": {"cpu": 4000}, "gaming_cap_rpm": 6500}))
            with mock.patch.object(fans, "FAN_CURVES_FILE", f), \
                    mock.patch.object(fans, "GUARDIAN_STATE_FILE", g):
                self.assertEqual(fans.load_caps()["cpu_fan"], 4000)
                g.write_text(json.dumps({"guardian_mode": "gaming", "updated": time.time()}))
                self.assertEqual(fans.load_caps()["cpu_fan"], 6500)
                g.write_text(json.dumps({"guardian_mode": "gaming", "updated": time.time() - 99}))
                self.assertEqual(fans.load_caps()["cpu_fan"], 4000)


class GpuClocks(unittest.TestCase):
    def test_out_of_range_rejected(self):
        for core, mem in ((gpu_clocks.ABS_CORE_MAX_MHZ + 1, 0), (0, gpu_clocks.ABS_MEM_MAX_MHZ + 1),
                          (gpu_clocks.ABS_CORE_MIN_MHZ - 1, 0), (0, gpu_clocks.ABS_MEM_MIN_MHZ - 1)):
            with self.assertRaises(ValueError):
                gpu_clocks.validate_offsets(core, mem)
            with self.assertRaises(ValueError):  # set_offsets rechaza antes de tocar NVML
                gpu_clocks.set_offsets(core, mem)
        self.assertEqual(gpu_clocks.validate_offsets(100, -300), (100, -300))
        # más allá del rango seguro (doble consentimiento en la UI) sigue permitido
        self.assertEqual(gpu_clocks.validate_offsets(500, 3000), (500, 3000))


class Persistence(unittest.TestCase):
    def test_settings_reports_unwritable(self):
        with tempfile.TemporaryDirectory() as d:
            blocker = Path(d) / "archivo"
            blocker.write_text("x")  # el directorio de config cuelga de un archivo -> falla
            cf = blocker / "sub" / "config.json"
            with mock.patch.object(config, "CONFIG_FILE", cf), mock.patch.object(settings, "CONFIG_FILE", cf):
                res = settings.update_settings({"notifications": False})
        self.assertFalse(res["ok"])
        self.assertTrue(res["err"])

    def test_settings_ok_when_writable(self):
        with tempfile.TemporaryDirectory() as d:
            cf = Path(d) / "c" / "config.json"
            with mock.patch.object(config, "CONFIG_FILE", cf), mock.patch.object(settings, "CONFIG_FILE", cf):
                self.assertTrue(settings.update_settings({"notifications": False})["ok"])
            self.assertFalse(json.loads(cf.read_text())["notifications"])

    def test_aura_profile_save_reports_failure_and_backs_up(self):
        with tempfile.TemporaryDirectory() as d:
            af = Path(d) / "aura.json"
            with mock.patch.object(aura, "AURA_FILE", af):
                af.write_text("{roto")
                aura._load_store()
                self.assertEqual(len(list(Path(d).glob("aura.json.corrupt-*.bak"))), 1)
                with mock.patch.object(aura, "write_atomic", side_effect=OSError("ro")):
                    res = aura.save_profile("p", {"effect": "static", "colour": "ff0000"})
                self.assertFalse(res["ok"])

    def test_game_session_samples_append_only(self):
        with tempfile.TemporaryDirectory() as d:
            sd = Path(d) / "sessions"
            with mock.patch.object(game_session, "SESSIONS_DIR", sd):
                sess = {"id": "s1", "started_at": game_session._now_iso(), "ended_at": None,
                        "baseline": False, "game": None, "samples": [], "summary": None}
                game_session._save_session(sess)
                main = sd / "s1.json"
                with open(game_session._samples_path("s1"), "a") as fh:
                    fh.write('{"t": 1, "cpu_temp": 50}\n{"t": 2, "cpu_te')  # última a medias
                self.assertEqual(len(game_session._load_session("s1")["samples"]), 1)
                self.assertEqual(json.loads(main.read_text())["samples"], [])
                res = game_session.cmd_stop(mock.Mock(id="s1"))
                self.assertEqual(len(res["session"]["samples"]), 1)
                self.assertEqual(len(json.loads(main.read_text())["samples"]), 1)
                self.assertFalse(game_session._samples_path("s1").exists())


if __name__ == "__main__":
    unittest.main()
