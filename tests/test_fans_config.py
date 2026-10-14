"""fan-curves.json: mezcla con defaults, validación al guardar, caps por perfil y
tope de Gaming. Archivos en un directorio temporal (nunca el ~/.config real)."""

import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from rog_monitor import fans

CURVE = {"temps": [50, 60, 68, 75, 82, 88, 92, 96], "pwms": [20, 36, 56, 82, 112, 143, 168, 184]}


class FansConfig(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.dir = Path(tmp.name)
        self.file = self.dir / "fan-curves.json"
        self.state = self.dir / "guardian.json"
        for name, val in (("FAN_CURVES_FILE", self.file), ("GUARDIAN_STATE_FILE", self.state)):
            p = mock.patch.object(fans, name, val)
            p.start()
            self.addCleanup(p.stop)

    def write(self, data):
        self.file.write_text(json.dumps(data))

    def test_missing_file_gives_defaults(self):
        cfg = fans.load_all_config()
        self.assertEqual(cfg["profiles"], fans.DEFAULT_FAN_CURVES["profiles"])
        self.assertEqual(cfg["version"], fans.FAN_CURVES_SCHEMA_VERSION)

    def test_user_curve_and_calibration_survive_merge(self):
        self.write({"profiles": {"quiet": {"cpu": CURVE, "cap_rpm": {"cpu": 4000}}},
                    "calibration": {"cpu": [[90, 3600]]}})
        cfg = fans.load_all_config()
        self.assertEqual(cfg["profiles"]["quiet"]["cpu"], CURVE)
        self.assertEqual(cfg["profiles"]["quiet"]["cap_rpm"]["cpu"], 4000)
        self.assertEqual(cfg["profiles"]["quiet"]["gpu"], fans.DEFAULT_FAN_CURVES["profiles"]["quiet"]["gpu"])
        self.assertEqual(cfg["calibration"], {"cpu": [[90, 3600]]})

    def test_corrupt_file_is_backed_up(self):
        self.file.write_text("{roto")
        self.assertEqual(fans._load_raw(), {})
        self.assertTrue(any(p.name != "fan-curves.json" and p.name.startswith("fan-curves.json")
                            for p in self.dir.iterdir()))

    def test_save_profiles_validates(self):
        bad_len = {"quiet": {"cpu": {"temps": [50, 60], "pwms": [1, 2]}}}
        bad_temp = {"quiet": {"cpu": {"temps": [50, 50] + CURVE["temps"][2:], "pwms": CURVE["pwms"]}}}
        bad_pwm = {"quiet": {"cpu": {"temps": CURVE["temps"], "pwms": [50, 40] + CURVE["pwms"][2:]}}}
        for bad in (bad_len, bad_temp, bad_pwm):
            with self.assertRaises(ValueError):
                fans.save_profiles(bad)
        self.assertFalse(self.file.exists())          # nada se escribió

    def test_save_profiles_keeps_calibration(self):
        self.write({"calibration": {"cpu": [[90, 3600]]}, "gaming_cap_rpm": 6700})
        fans.save_profiles({"quiet": {"cpu": CURVE}})
        data = json.loads(self.file.read_text())
        self.assertEqual(data["profiles"]["quiet"]["cpu"], CURVE)
        self.assertEqual(data["calibration"], {"cpu": [[90, 3600]]})
        self.assertEqual(data["gaming_cap_rpm"], 6700)

    def test_save_all_config_merges(self):
        self.write({"max_rpm": {"cpu": 7000}})
        fans.save_all_config({"cap_rpm": {"cpu": 5000}})
        data = json.loads(self.file.read_text())
        self.assertEqual(data["max_rpm"], {"cpu": 7000})
        self.assertEqual(data["cap_rpm"], {"cpu": 5000})

    def test_caps_per_profile_override_global(self):
        self.write({"cap_rpm": {"cpu": 6500, "gpu": 6500},
                    "profiles": {"quiet": {"cap_rpm": {"cpu": 4500}}}})
        self.assertEqual(fans.load_caps("quiet"), {"cpu_fan": 4500, "gpu_fan": 6500})
        self.assertEqual(fans.load_caps("performance"), {"cpu_fan": 6500, "gpu_fan": 6500})

    def test_gaming_cap_only_when_guardian_fresh(self):
        self.write({"cap_rpm": {"cpu": 5000}, "gaming_cap_rpm": 6700})
        self.state.write_text(json.dumps({"guardian_mode": "gaming", "updated": time.time()}))
        self.assertEqual(fans.load_caps()["cpu_fan"], 6700)
        self.state.write_text(json.dumps({"guardian_mode": "gaming", "updated": time.time() - 600}))
        self.assertEqual(fans.load_caps()["cpu_fan"], 5000)


if __name__ == "__main__":
    unittest.main()
