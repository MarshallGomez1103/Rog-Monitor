"""SMART sin root: lectura de la caché de la app, edad/stale, capacidad y línea de la TUI."""

import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from rog_monitor import sysinfo, ui
from rog_monitor.i18n import STRINGS, Translator

NOW = 1_760_000_000.0
GOOD = {"ts_epoch": NOW - 7200, "ok": True, "health_passed": True, "temp_c": 48,
        "percentage_used": 3, "power_on_hours": 1234, "media_errors": 0,
        "critical_warning": 0, "err": None}


class Parse(unittest.TestCase):
    def test_age_and_fields(self):
        c = sysinfo.smart_cached(GOOD, NOW)
        self.assertEqual(c["age_s"], 7200)
        self.assertFalse(c["stale"])
        self.assertTrue(c["ok"])
        self.assertIs(c["health_passed"], True)
        self.assertEqual((c["temp_c"], c["percentage_used"], c["power_on_hours"]), (48, 3, 1234))

    def test_stale_after_24h(self):
        self.assertFalse(sysinfo.smart_cached({**GOOD, "ts_epoch": NOW - 86400}, NOW)["stale"])
        self.assertTrue(sysinfo.smart_cached({**GOOD, "ts_epoch": NOW - 86401}, NOW)["stale"])

    def test_future_timestamp_gives_zero_age(self):
        self.assertEqual(sysinfo.smart_cached({**GOOD, "ts_epoch": NOW + 500}, NOW)["age_s"], 0)

    def test_unusable_entries_are_none(self):
        for bad in (None, "x", [], {}, {"ok": True}, {"ts_epoch": "ayer"}, {"ts_epoch": True}):
            with self.subTest(bad=bad):
                self.assertIsNone(sysinfo.smart_cached(bad, NOW))

    def test_garbage_fields_become_none(self):
        c = sysinfo.smart_cached({"ts_epoch": NOW, "ok": "yes", "health_passed": "si",
                                  "temp_c": "caliente", "percentage_used": True, "err": 5}, NOW)
        self.assertFalse(c["ok"])  # sólo `true` estricto cuenta como lectura buena
        self.assertIsNone(c["health_passed"])
        self.assertIsNone(c["temp_c"])
        self.assertIsNone(c["percentage_used"])
        self.assertIsNone(c["err"])

    def test_failed_entry_keeps_error(self):
        c = sysinfo.smart_cached({"ts_epoch": NOW, "ok": False, "err": "sin permiso"}, NOW)
        self.assertFalse(c["ok"])
        self.assertEqual(c["err"], "sin permiso")


class FileAndInfo(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.tmp.name, "smart.json")
        sysinfo._smart_file_memo = (None, None)

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, text):
        Path(self.path).write_text(text)

    def test_missing_corrupt_and_wrong_shape(self):
        self.assertEqual(sysinfo._read_smart_file(self.path), {})
        for text in ("{no json", "[1, 2]", '"x"', ""):
            with self.subTest(text=text):
                self.write(text)
                self.assertEqual(sysinfo._read_smart_file(self.path), {})

    def test_reads_valid_and_follows_changes(self):
        self.write(json.dumps({"/dev/nvme0n1": GOOD}))
        self.assertIn("/dev/nvme0n1", sysinfo._read_smart_file(self.path))
        self.write(json.dumps({"/dev/sda": GOOD, "pad": "x" * 10}))  # otro tamaño -> relee
        self.assertEqual(list(sysinfo._read_smart_file(self.path)), ["/dev/sda", "pad"])

    def test_ignores_file_of_another_user(self):
        self.write(json.dumps({"/dev/nvme0n1": GOOD}))
        with mock.patch.object(sysinfo.os, "getuid", return_value=os.getuid() + 1):
            self.assertEqual(sysinfo._read_smart_file(self.path), {})

    def test_ignores_oversized_file(self):
        self.write(json.dumps({"/dev/nvme0n1": GOOD}))
        with mock.patch.object(sysinfo, "_SMART_MAX_BYTES", 5):
            self.assertEqual(sysinfo._read_smart_file(self.path), {})

    def test_cache_path_honours_xdg(self):
        with mock.patch.dict(os.environ, {"XDG_CACHE_HOME": "/x"}):
            self.assertEqual(sysinfo.smart_cache_path(), "/x/rog-monitor/smart.json")

    def test_smart_info_capability_and_cache(self):
        cache = {"/dev/nvme0n1": GOOD}
        with mock.patch.object(sysinfo, "_smartctl_present", return_value=True):
            hit = sysinfo.smart_info("nvme0n1", cache, NOW)
            miss = sysinfo.smart_info("sda", cache, NOW)
        self.assertEqual(hit["smart"], {"smartctl": True, "type": "nvme", "has_cache": True})
        self.assertEqual(hit["smart_cached"]["age_s"], 7200)
        self.assertEqual(miss["smart"], {"smartctl": True, "type": "sata", "has_cache": False})
        self.assertIsNone(miss["smart_cached"])
        self.assertIsNone(sysinfo._smart_type("mmcblk0"))

    def test_smartctl_presence_is_cached(self):
        sysinfo._smartctl_memo = (-1e9, False)
        with mock.patch.object(sysinfo.shutil, "which", return_value="/usr/sbin/smartctl") as w:
            self.assertTrue(sysinfo._smartctl_present())
            self.assertTrue(sysinfo._smartctl_present())
        self.assertEqual(w.call_count, 1)
        sysinfo._smartctl_memo = (-1e9, False)


def smart_text(disk, lang="es") -> str:
    line = ui.smart_line(disk, Translator(lang))
    return line.plain if line is not None else ""


class TuiLine(unittest.TestCase):
    def disk(self, smartctl=True, cached=None):
        return {"smart": {"smartctl": smartctl, "type": "nvme", "has_cache": cached is not None},
                "smart_cached": cached}

    def test_good_line(self):
        c = sysinfo.smart_cached(GOOD, NOW)
        self.assertEqual(smart_text(self.disk(cached=c)), "SMART ✓ 3% usado · 48°C · hace 2 h")

    def test_no_data_and_no_tool(self):
        self.assertEqual(smart_text(self.disk()),
                         "SMART: sin datos (ábrelo desde la app; requiere root)")
        self.assertEqual(smart_text(self.disk(smartctl=False)), "SMART: smartctl no instalado")

    def test_cache_wins_over_missing_tool(self):
        c = sysinfo.smart_cached(GOOD, NOW)
        self.assertTrue(smart_text(self.disk(smartctl=False, cached=c)).startswith("SMART ✓"))

    def test_stale_failed_and_sata_variants(self):
        old = sysinfo.smart_cached({**GOOD, "ts_epoch": NOW - 3 * 86400, "health_passed": False,
                                    "percentage_used": None}, NOW)
        self.assertEqual(smart_text(self.disk(cached=old)), "SMART ✗ 48°C · hace 3 d · antiguo")
        failed = sysinfo.smart_cached({"ts_epoch": NOW - 60, "ok": False, "err": "x"}, NOW)
        self.assertEqual(smart_text(self.disk(cached=failed)),
                         "SMART: última lectura falló · hace 1 min")

    def test_old_backend_has_no_line(self):
        self.assertIsNone(ui.smart_line({"label": "home"}, Translator("es")))

    def test_every_language_has_the_keys_and_formats(self):
        c = sysinfo.smart_cached({**GOOD, "ts_epoch": NOW - 90000}, NOW)
        for lang in STRINGS:
            with self.subTest(lang=lang):
                for d in (self.disk(cached=c), self.disk(), self.disk(smartctl=False)):
                    out = smart_text(d, lang)
                    self.assertTrue(out.startswith("SMART"))
                    self.assertNotIn("{", out)
                    self.assertNotIn("None", out)


class SnapshotKeys(unittest.TestCase):
    def test_read_adds_keys_from_the_user_cache(self):
        with tempfile.TemporaryDirectory() as home:
            cache = Path(home, "rog-monitor", "smart.json")
            cache.parent.mkdir()
            cache.write_text(json.dumps({"/dev/nvme0n1": {**GOOD, "ts_epoch": time.time() - 60}}))
            sysinfo._smart_file_memo = (None, None)
            r = sysinfo.SysReader({}, sys_root="/nonexistent")
            disk = {"block_dev": "nvme0n1"}
            with mock.patch.dict(os.environ, {"XDG_CACHE_HOME": home}), \
                    mock.patch.object(r, "_disks", return_value=[disk]), \
                    mock.patch.object(r, "_disk_io", return_value=[{"dev": "sda"}]):
                snap = r.read()
        self.assertEqual(set(snap["disks"][0]["smart"]), {"smartctl", "type", "has_cache"})
        self.assertTrue(snap["disks"][0]["smart"]["has_cache"])
        self.assertAlmostEqual(snap["disks"][0]["smart_cached"]["age_s"], 60, delta=5)
        self.assertIsNone(snap["disk_io"][0]["smart_cached"])
        self.assertEqual(snap["disk_io"][0]["smart"]["type"], "sata")
        json.dumps(snap)  # serializable (el contrato es JSON)


if __name__ == "__main__":
    unittest.main()
