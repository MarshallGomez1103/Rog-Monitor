"""fans.py: regresiones de los 4 defectos de N-DEF-10 (v22).

1. Un `updated` del guardián en el futuro (reloj movido / NTP) no debe
   contar como fresco indefinidamente (guardian_status y _gaming_cap).
2. load_schema_version: contrato con archivo ausente/corrupto.
3. fan_max_rpm de config.json inválido no debe lanzar TypeError.
4. Caps booleanos / NaN / inf / negativos se rechazan.

Todo en tmpdirs; reloj falso; sin /sys ni ~/.config reales.
"""
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from rog_monitor import fans, hwmon

NOW = 1_000_000.0


class FakeConfig:
    def __init__(self, data=None):
        self.data = dict(data or {})

    def get(self, key, default=None):
        return self.data.get(key, default)

    def save(self):
        return True


class Base(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.dir = Path(tmp.name)
        self.hw = self.dir / "hwmon"
        self.hw.mkdir()
        self.curves = self.dir / "fan-curves.json"
        self.state = self.dir / "guardian.json"
        for p in (
            mock.patch.object(hwmon, "HWMON_ROOT", self.hw),
            mock.patch.object(fans, "FAN_CURVES_FILE", self.curves),
            mock.patch.object(fans, "GUARDIAN_STATE_FILE", self.state),
            mock.patch.object(fans, "time", SimpleNamespace(time=lambda: NOW)),
        ):
            p.start()
            self.addCleanup(p.stop)

    def put_curves(self, data):
        self.curves.write_text(json.dumps(data))

    def put_state(self, data):
        self.state.write_text(json.dumps(data))


class FutureTimestamp(Base):
    """N-DEF-10: tolerancia pequeña a deriva de reloj, no futuro indefinido."""

    def test_guardian_future_updated_is_not_alive(self):
        self.put_state({"mode": "gaming", "updated": NOW + 3600})
        self.assertEqual(fans.guardian_status(), {"mode": None, "running": False})

    def test_guardian_small_skew_within_tolerance_is_alive(self):
        self.put_state({"mode": "normal", "updated": NOW + fans.GUARDIAN_CLOCK_SKEW})
        self.assertTrue(fans.guardian_status()["running"])

    def test_guardian_just_beyond_tolerance_is_not_alive(self):
        self.put_state({"mode": "normal", "updated": NOW + fans.GUARDIAN_CLOCK_SKEW + 1})
        self.assertFalse(fans.guardian_status()["running"])

    def test_guardian_boundaries_of_max_age(self):
        # Misma semántica estricta (< MAX_AGE) que rog-profile-sync.sh.
        self.put_state({"mode": "normal", "updated": NOW - fans.GUARDIAN_STATE_MAX_AGE + 1})
        self.assertTrue(fans.guardian_status()["running"])
        self.put_state({"mode": "normal", "updated": NOW - fans.GUARDIAN_STATE_MAX_AGE})
        self.assertFalse(fans.guardian_status()["running"])

    def test_guardian_bool_and_nan_updated_not_alive(self):
        self.state.write_text('{"mode": "normal", "updated": true}')
        self.assertFalse(fans.guardian_status()["running"])
        self.state.write_text('{"mode": "normal", "updated": NaN}')
        self.assertFalse(fans.guardian_status()["running"])

    def test_gaming_cap_future_updated_ignored(self):
        self.put_curves({"gaming_cap_rpm": 4000, "cap_rpm": {"cpu": 6000}})
        self.put_state({"guardian_mode": "gaming", "updated": NOW + 3600})
        self.assertIsNone(fans._gaming_cap())
        self.assertEqual(fans.load_caps(), {"cpu_fan": 6000})

    def test_gaming_cap_applies_when_fresh_and_within_skew(self):
        self.put_curves({"gaming_cap_rpm": 4000})
        for upd in (NOW - 1, NOW + fans.GUARDIAN_CLOCK_SKEW):
            self.put_state({"guardian_mode": "gaming", "updated": upd})
            self.assertEqual(fans._gaming_cap(), 4000)

    def test_gaming_cap_stale_ignored(self):
        self.put_curves({"gaming_cap_rpm": 4000})
        self.put_state({"guardian_mode": "gaming",
                        "updated": NOW - fans.GUARDIAN_STATE_MAX_AGE - 1})
        self.assertIsNone(fans._gaming_cap())


class SchemaVersionContract(Base):
    """Archivo ausente/corrupto = esquema vigente (v2: lo que se creará al
    primer guardado); v1 solo si el archivo existe sin "version" válida."""

    def test_missing_file_is_current_schema(self):
        self.assertEqual(fans.load_schema_version(), fans.FAN_CURVES_SCHEMA_VERSION)

    def test_corrupt_file_is_current_schema(self):
        self.curves.write_text("{{{")
        self.assertEqual(fans.load_schema_version(), fans.FAN_CURVES_SCHEMA_VERSION)

    def test_existing_file_without_version_is_v1(self):
        self.put_curves({"cap_rpm": {"cpu": 5000}})
        self.assertEqual(fans.load_schema_version(), 1)

    def test_bool_or_nan_version_is_v1_and_never_raises(self):
        for raw in ('{"version": true}', '{"version": NaN}', '{"version": Infinity}'):
            self.curves.write_text(raw)
            self.assertEqual(fans.load_schema_version(), 1, raw)

    def test_docstring_matches_behaviour(self):
        self.assertNotIn("1 si falta", fans.load_schema_version.__doc__)


class InvalidStoredMax(Base):
    def reader(self, stored):
        return fans.FanReader(hwmon.scan(), FakeConfig({"fan_max_rpm": stored}))

    def test_non_dict_stored_uses_defaults(self):
        for bad in ([1, 2], "7000", 7000, True):
            r = self.reader(bad)
            self.assertEqual(r.max_rpm, fans.DEFAULT_MAX, bad)

    def test_non_numeric_entries_dropped(self):
        r = self.reader({"cpu_fan": "alto", "gpu_fan": True, "mid_fan": -5,
                         "extra": 4000.0})
        self.assertEqual(r.max_rpm["cpu_fan"], fans.DEFAULT_MAX["cpu_fan"])
        self.assertEqual(r.max_rpm["gpu_fan"], fans.DEFAULT_MAX["gpu_fan"])
        self.assertEqual(r.max_rpm["mid_fan"], fans.DEFAULT_MAX["mid_fan"])
        self.assertEqual(r.max_rpm["extra"], 4000)

    def test_valid_stored_still_wins_over_defaults(self):
        r = self.reader({"cpu_fan": 8000})
        self.assertEqual(r.max_rpm["cpu_fan"], 8000)


class CapRejectsNonRpm(Base):
    def test_bool_caps_rejected(self):
        self.put_curves({"cap_rpm": {"cpu": True, "gpu": 5000}})
        self.assertEqual(fans.load_caps(), {"gpu_fan": 5000})

    def test_nan_inf_negative_caps_rejected(self):
        self.curves.write_text(
            '{"cap_rpm": {"cpu": NaN, "gpu": Infinity, "mid": -3}, '
            '"max_rpm": {"cpu": -Infinity, "gpu": NaN, "mid": 6800}}')
        self.assertEqual(fans.load_caps(), {})
        self.assertEqual(fans.load_measured_max(), {"mid_fan": 6800})

    def test_bool_profile_override_rejected(self):
        self.put_curves({"cap_rpm": {"cpu": 6000},
                         "profiles": {"quiet": {"cap_rpm": {"cpu": True}}}})
        # el override inválido se ignora: rige el cap global
        self.assertEqual(fans.load_caps("quiet"), {"cpu_fan": 6000})

    def test_bool_gaming_cap_rejected(self):
        self.put_curves({"gaming_cap_rpm": True, "cap_rpm": {"cpu": 6000}})
        self.put_state({"guardian_mode": "gaming", "updated": NOW})
        self.assertIsNone(fans._gaming_cap())
        self.assertEqual(fans.load_caps(), {"cpu_fan": 6000})

    def test_inf_gaming_cap_rejected(self):
        self.curves.write_text('{"gaming_cap_rpm": Infinity}')
        self.put_state({"guardian_mode": "gaming", "updated": NOW})
        self.assertIsNone(fans._gaming_cap())


if __name__ == "__main__":
    unittest.main()
