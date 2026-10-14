"""fans.py: lectura de ventiladores (0/1/3), RPM ausente o no numérico, máximo
observado, porcentaje con y sin cap, estado stale del guardián y CLI del módulo.

Todo ocurre en un directorio temporal: hwmon falso (HWMON_ROOT parcheado),
fan-curves.json y thermal-guardian-state.json falsos. No se toca /sys ni
~/.config reales y no se importa ni se lanza el servicio/guardián.
"""
import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from rog_monitor import fans, hwmon

NOW = 1_000_000.0


class FakeConfig:
    """Mismo contrato mínimo que config.Config (get / data / save)."""

    def __init__(self, data=None):
        self.data = dict(data or {})
        self.saves = 0

    def get(self, key, default=None):
        return self.data.get(key, default)

    def save(self):
        self.saves += 1
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
        patches = [
            mock.patch.object(hwmon, "HWMON_ROOT", self.hw),
            mock.patch.object(fans, "FAN_CURVES_FILE", self.curves),
            mock.patch.object(fans, "GUARDIAN_STATE_FILE", self.state),
            mock.patch.object(fans, "time", SimpleNamespace(time=lambda: NOW)),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def chip(self, name, fan_values, labels=True, idx=0):
        """Crea hwmon<idx> con fan<N>_input; fan_values: lista de str/int/None
        (None = sin archivo de entrada)."""
        dev = self.hw / f"hwmon{idx}"
        dev.mkdir()
        (dev / "name").write_text(name + "\n")
        names = ["cpu_fan", "gpu_fan", "mid_fan"]
        for i, val in enumerate(fan_values, 1):
            if val is None:
                continue
            (dev / f"fan{i}_input").write_text(f"{val}\n")
            if labels:
                (dev / f"fan{i}_label").write_text(names[i - 1] + "\n")
        return dev

    def reader(self, cfg=None):
        return fans.FanReader(hwmon.scan(), cfg or FakeConfig())

    def put_curves(self, data):
        self.curves.write_text(json.dumps(data))

    def put_state(self, data):
        self.state.write_text(json.dumps(data))


class FanCount(Base):
    def test_no_hwmon_chips_gives_empty_reading(self):
        r = self.reader()
        self.assertEqual(r.devs, [])
        self.assertEqual(r.read(), [])

    def test_chip_without_fans_is_ignored(self):
        self.chip("coretemp", [])
        r = self.reader()
        self.assertEqual(r.devs, [])
        self.assertEqual(r.read(), [])

    def test_single_fan_on_generic_chip(self):
        self.chip("nct6775", [2400], labels=False)
        out = self.reader().read()
        self.assertEqual(len(out), 1)
        # sin label el nombre es el índice del archivo
        self.assertEqual(out[0]["label"], "fan1")
        self.assertEqual(out[0]["rpm"], 2400)
        # sin cap ni max conocido usa FALLBACK_MAX (6000): 2400/6000 = 40 %
        self.assertEqual(out[0]["percent"], 40)
        self.assertIsNone(out[0]["cap"])

    def test_three_fans_on_asus_chip(self):
        self.chip("asus", [3500, 3500, 3800])
        out = self.reader().read()
        self.assertEqual([f["label"] for f in out], ["cpu_fan", "gpu_fan", "mid_fan"])
        self.assertEqual([f["rpm"] for f in out], [3500, 3500, 3800])
        # DEFAULT_MAX: 3500/7100=49.3, 3500/7000=50, 3800/7600=50
        self.assertEqual([f["percent"] for f in out], [49, 50, 50])

    def test_asus_chip_wins_over_other_fan_chips(self):
        self.chip("nct6775", [1000], labels=False, idx=0)
        self.chip("asus", [3000, 3000, 3000], idx=1)
        r = self.reader()
        self.assertEqual(len(r.devs), 1)
        self.assertEqual(r.devs[0].name, "hwmon1")
        self.assertEqual(len(r.read()), 3)

    def test_fans_from_several_non_asus_chips_are_merged(self):
        self.chip("nct6775", [1200], labels=False, idx=0)
        self.chip("it8628", [900], labels=False, idx=1)
        r = self.reader()
        self.assertEqual(len(r.devs), 2)
        self.assertEqual(sorted(f["rpm"] for f in r.read()), [900, 1200])


class RpmParsing(Base):
    def test_missing_input_file_skips_that_fan_only(self):
        self.chip("asus", [3000, None, 3200])
        out = self.reader().read()
        self.assertEqual([f["label"] for f in out], ["cpu_fan", "mid_fan"])

    def test_non_numeric_rpm_is_skipped(self):
        self.chip("asus", ["N/A", 3000, ""])
        out = self.reader().read()
        self.assertEqual([(f["label"], f["rpm"]) for f in out], [("gpu_fan", 3000)])

    def test_zero_rpm_is_a_valid_stopped_fan(self):
        self.chip("asus", [0, 0, 0])
        out = self.reader().read()
        self.assertEqual([f["rpm"] for f in out], [0, 0, 0])
        self.assertEqual([f["percent"] for f in out], [0, 0, 0])

    def test_negative_value_does_not_become_new_max(self):
        self.chip("asus", [-1, 3000, 3000])
        r = self.reader()
        r.read()
        self.assertEqual(r.max_rpm["cpu_fan"], fans.DEFAULT_MAX["cpu_fan"])
        self.assertFalse(r._dirty)


class MaxObserved(Base):
    def test_rpm_above_known_max_raises_max_and_clamps_to_100(self):
        dev = self.chip("asus", [8000, 3500, 3800])
        r = self.reader()
        out = r.read()
        self.assertEqual(r.max_rpm["cpu_fan"], 8000)
        self.assertEqual(out[0]["percent"], 100)
        self.assertTrue(r._dirty)
        # una lectura más baja no baja el máximo observado
        (dev / "fan1_input").write_text("4000\n")
        out = r.read()
        self.assertEqual(r.max_rpm["cpu_fan"], 8000)
        self.assertEqual(out[0]["percent"], 50)

    def test_persist_max_writes_once_and_clears_dirty(self):
        self.chip("asus", [8000, 3500, 3800])
        cfg = FakeConfig()
        r = self.reader(cfg)
        r.read()
        r.persist_max()
        self.assertEqual(cfg.saves, 1)
        self.assertEqual(cfg.data["fan_max_rpm"]["cpu_fan"], 8000)
        r.persist_max()  # ya limpio: no vuelve a guardar
        self.assertEqual(cfg.saves, 1)

    def test_persist_max_without_new_peak_does_not_save(self):
        self.chip("asus", [3000, 3000, 3000])
        cfg = FakeConfig()
        r = self.reader(cfg)
        r.read()
        r.persist_max()
        self.assertEqual(cfg.saves, 0)
        self.assertNotIn("fan_max_rpm", cfg.data)

    def test_stored_max_beats_defaults_and_measured_beats_stored(self):
        self.put_curves({"max_rpm": {"cpu": 5000}})
        r = self.reader(FakeConfig({"fan_max_rpm": {"cpu_fan": 4000, "gpu_fan": 4500}}))
        self.assertEqual(r.max_rpm["cpu_fan"], 5000)  # calibrado gana
        self.assertEqual(r.max_rpm["gpu_fan"], 4500)  # guardado gana a default
        self.assertEqual(r.max_rpm["mid_fan"], fans.DEFAULT_MAX["mid_fan"])

    def test_unknown_label_uses_fallback_max(self):
        self.chip("nct6775", [3000], labels=False)
        r = self.reader()
        self.assertEqual(r.read()[0]["percent"], 50)  # 3000 / FALLBACK_MAX
        self.assertNotIn("fan1", r.max_rpm)  # sin pico nuevo no se registra

    def test_unknown_label_above_fallback_registers_new_max(self):
        self.chip("nct6775", [9000], labels=False)
        r = self.reader()
        out = r.read()
        self.assertEqual(r.max_rpm["fan1"], 9000)
        self.assertEqual(out[0]["percent"], 100)


class PercentWithCap(Base):
    def test_percent_is_relative_to_cap(self):
        self.chip("asus", [3250, 3250, 3250])
        self.put_curves({"cap_rpm": {"cpu": 6500, "gpu": 6500, "mid": 6500}})
        out = self.reader().read()
        self.assertEqual([f["percent"] for f in out], [50, 50, 50])
        self.assertEqual([f["cap"] for f in out], [6500, 6500, 6500])

    def test_rpm_above_cap_is_clamped_to_100(self):
        self.chip("asus", [7000, 3000, 3000])
        self.put_curves({"cap_rpm": {"cpu": 5000}})
        out = self.reader().read()
        self.assertEqual(out[0]["percent"], 100)
        self.assertEqual(out[0]["cap"], 5000)
        # solo cpu tiene cap: gpu cae al máximo (3000/7000 = 42.86)
        self.assertEqual(out[1]["percent"], 43)
        self.assertIsNone(out[1]["cap"])

    def test_invalid_caps_are_ignored(self):
        self.put_curves({"cap_rpm": {"cpu": 0, "gpu": -5, "mid": "alto"}})
        self.assertEqual(fans.load_caps(), {})

    def test_profile_change_reloads_caps_on_next_read(self):
        self.chip("asus", [2500, 2500, 2500])
        self.put_curves({"cap_rpm": {"cpu": 5000, "gpu": 5000, "mid": 5000},
                         "profiles": {"quiet": {"cap_rpm": {"cpu": 2500}}}})
        r = self.reader()
        self.assertEqual(r.read()[0]["percent"], 50)
        out = r.read("quiet")
        self.assertEqual(out[0]["percent"], 100)
        self.assertEqual(out[0]["cap"], 2500)
        self.assertEqual(out[1]["cap"], 5000)  # gpu sin override: global
        self.assertEqual(r.meta()["active_profile"], "quiet")

    def test_curves_file_change_is_picked_up(self):
        self.chip("asus", [3000, 3000, 3000])
        self.put_curves({"cap_rpm": {"cpu": 6000}})
        r = self.reader()
        self.assertEqual(r.read()[0]["percent"], 50)
        self.put_curves({"cap_rpm": {"cpu": 3000}})
        mtime = self.curves.stat().st_mtime + 5
        os.utime(self.curves, (mtime, mtime))
        self.assertEqual(r.read()[0]["percent"], 100)

    def test_gaming_cap_applies_only_with_fresh_state_and_follows_it(self):
        self.chip("asus", [3000, 3000, 3000])
        self.put_curves({"cap_rpm": {"cpu": 6000, "gpu": 6000, "mid": 6000},
                         "gaming_cap_rpm": 3000})
        r = self.reader()
        self.assertEqual(r.read()[0]["percent"], 50)  # sin estado: cap normal
        self.put_state({"guardian_mode": "gaming", "updated": NOW - 5})
        out = r.read()  # sin tocar el JSON de curvas
        self.assertEqual([f["cap"] for f in out], [3000, 3000, 3000])
        self.assertEqual(out[0]["percent"], 100)
        self.put_state({"guardian_mode": "gaming", "updated": NOW - 600})
        self.assertEqual(r.read()[0]["cap"], 6000)

    def test_missing_curves_file_mtime_is_zero(self):
        self.assertEqual(fans.FanReader._curves_mtime(), 0.0)


class GuardianStatus(Base):
    OFF = {"mode": None, "running": False}

    def test_missing_state_file(self):
        self.assertEqual(fans.guardian_status(), self.OFF)

    def test_corrupt_state_file(self):
        self.state.write_text("{no es json")
        self.assertEqual(fans.guardian_status(), self.OFF)

    def test_empty_json_object_has_no_timestamp(self):
        self.put_state({})
        self.assertEqual(fans.guardian_status(), self.OFF)

    def test_null_json_document(self):
        self.state.write_text("null")
        self.assertEqual(fans.guardian_status(), self.OFF)

    def test_non_numeric_timestamp_is_stale(self):
        self.put_state({"mode": "gaming", "updated": "ahora"})
        self.assertEqual(fans.guardian_status(), self.OFF)

    def test_old_state_is_unknown_not_silence(self):
        self.put_state({"mode": "gaming", "updated": NOW - fans.GUARDIAN_STATE_MAX_AGE - 1})
        self.assertEqual(fans.guardian_status(), self.OFF)

    def test_boundary_age_exactly_max_is_stale(self):
        self.put_state({"mode": "gaming", "updated": NOW - fans.GUARDIAN_STATE_MAX_AGE})
        self.assertFalse(fans.guardian_status()["running"])

    def test_valid_state_maps_every_field(self):
        self.put_state({
            "mode": "gaming", "updated": NOW - 2, "reason": "gpu 80C",
            "aggression": 2, "thermal_state": "hot", "cooldown_remaining": 12,
            "interventions": 3, "configured_mode": "auto", "dry": 1,
            "last_decision": "raise",
        })
        self.assertEqual(fans.guardian_status(), {
            "mode": "gaming", "running": True, "reason": "gpu 80C",
            "aggression": 2, "thermal_state": "hot", "cooldown_remaining": 12,
            "interventions": 3, "configured_mode": "auto", "dry": True,
            "last_decision": "raise",
        })

    def test_minimal_valid_state_uses_defaults(self):
        self.put_state({"mode": "idle", "updated": NOW})
        st = fans.guardian_status()
        self.assertTrue(st["running"])
        self.assertEqual(st["cooldown_remaining"], 0)
        self.assertEqual(st["interventions"], 0)
        self.assertFalse(st["dry"])
        self.assertIsNone(st["reason"])


class MetaAndSchema(Base):
    def test_meta_without_any_file(self):
        meta = self.reader().meta()
        self.assertIsNone(meta["active_profile"])
        self.assertEqual(meta["guardian"], {"mode": None, "running": False})
        self.assertEqual(meta["schema_version"], fans.FAN_CURVES_SCHEMA_VERSION)

    def test_meta_reports_v1_file_and_fresh_guardian(self):
        self.put_curves({"cap_rpm": {"cpu": 6000}})  # sin "version" = v1
        self.put_state({"mode": "normal", "updated": NOW - 1})
        meta = self.reader().meta()
        self.assertEqual(meta["schema_version"], 1)
        self.assertEqual(meta["guardian"]["mode"], "normal")

    def test_schema_version_numeric_and_corrupt(self):
        self.put_curves({"version": 2})
        self.assertEqual(fans.load_schema_version(), 2)
        self.put_curves({"version": "dos"})
        self.assertEqual(fans.load_schema_version(), 1)
        self.curves.write_text("[[[")
        self.assertEqual(fans.load_schema_version(), fans.FAN_CURVES_SCHEMA_VERSION)

    def test_measured_max_only_positive_numbers(self):
        self.put_curves({"max_rpm": {"cpu": 6800, "gpu": 0, "mid": "x"}})
        self.assertEqual(fans.load_measured_max(), {"cpu_fan": 6800})

    def test_raw_non_object_json_is_backed_up_and_ignored(self):
        self.curves.write_text("[1, 2]")
        self.assertEqual(fans.load_profiles(), fans.DEFAULT_FAN_CURVES["profiles"])
        self.assertEqual(len(list(self.dir.glob("fan-curves.json.corrupt-*.bak"))), 1)


class CliModule(Base):
    def run_cli(self, argv, stdin=""):
        out = io.StringIO()
        code = None
        with redirect_stdout(out), mock.patch.object(fans.sys, "stdin", io.StringIO(stdin)):
            try:
                fans.main(argv)
            except SystemExit as exc:
                code = exc.code
        return code, out.getvalue()

    def test_no_args_prints_usage_and_exits_1(self):
        code, out = self.run_cli([])
        self.assertEqual(code, 1)
        self.assertIn("Uso:", out)

    def test_unknown_subcommand(self):
        code, out = self.run_cli(["boom"])
        self.assertEqual(code, 1)
        self.assertEqual(json.loads(out), {"error": "Subcomando desconocido: boom"})

    def test_defaults_prints_default_curves(self):
        code, out = self.run_cli(["defaults"])
        self.assertIsNone(code)
        self.assertEqual(json.loads(out), fans.DEFAULT_FAN_CURVES)

    def test_all_config_without_file_equals_defaults(self):
        _, out = self.run_cli(["all-config"])
        self.assertEqual(json.loads(out), fans.DEFAULT_FAN_CURVES)

    def test_profiles_all_and_filtered(self):
        _, out = self.run_cli(["profiles"])
        self.assertEqual(set(json.loads(out)), {"performance", "balanced", "quiet"})
        _, out = self.run_cli(["profiles", "--profile", "quiet"])
        self.assertEqual(json.loads(out), {"quiet": fans.DEFAULT_FAN_CURVES["profiles"]["quiet"]})

    def test_profiles_unknown_profile_exits_1(self):
        code, out = self.run_cli(["profiles", "--profile", "turbo"])
        self.assertEqual(code, 1)
        self.assertEqual(json.loads(out), {"error": "Perfil desconocido: turbo"})

    def test_profiles_dangling_flag_is_ignored(self):
        _, out = self.run_cli(["profiles", "--profile"])
        self.assertEqual(set(json.loads(out)), {"performance", "balanced", "quiet"})

    def test_write_profiles_from_arg_persists_in_tmp_file(self):
        curve = {"temps": [50, 60, 68, 75, 82, 88, 92, 96],
                 "pwms": [20, 36, 56, 82, 112, 143, 168, 184]}
        payload = json.dumps({"quiet": {"cpu": curve}})
        code, out = self.run_cli(["write-profiles", payload])
        self.assertIsNone(code)
        self.assertEqual(json.loads(out), {"ok": True, "saved_profiles": ["quiet"]})
        self.assertEqual(json.loads(self.curves.read_text())["profiles"]["quiet"]["cpu"], curve)

    def test_write_profiles_reads_stdin_when_no_arg(self):
        code, out = self.run_cli(["write-profiles"], stdin="{}")
        self.assertIsNone(code)
        self.assertEqual(json.loads(out), {"ok": True, "saved_profiles": []})

    def test_write_profiles_invalid_json(self):
        code, out = self.run_cli(["write-profiles", "{nope"])
        self.assertEqual(code, 1)
        self.assertIn("JSON inválido", json.loads(out)["error"])
        self.assertFalse(self.curves.exists())

    def test_write_profiles_non_object(self):
        code, out = self.run_cli(["write-profiles", "[1]"])
        self.assertEqual(code, 1)
        self.assertEqual(json.loads(out), {"error": "Se espera un objeto JSON con perfiles"})

    def test_write_profiles_rejects_bad_curve_without_writing(self):
        bad = {"quiet": {"cpu": {"temps": [50, 60], "pwms": [1, 2]}}}
        code, out = self.run_cli(["write-profiles", json.dumps(bad)])
        self.assertEqual(code, 1)
        self.assertIn("exactamente 8 puntos", json.loads(out)["error"])
        self.assertFalse(self.curves.exists())

    def test_write_profiles_rejects_non_monotonic_temps(self):
        temps = [50, 60, 60, 75, 82, 88, 92, 96]
        bad = {"quiet": {"gpu": {"temps": temps, "pwms": [1, 2, 3, 4, 5, 6, 7, 8]}}}
        code, out = self.run_cli(["write-profiles", json.dumps(bad)])
        self.assertEqual(code, 1)
        self.assertIn("temps no monótonas en pos 2", json.loads(out)["error"])

    def test_write_profiles_rejects_decreasing_pwm(self):
        temps = [50, 60, 68, 75, 82, 88, 92, 96]
        bad = {"quiet": {"mid": {"temps": temps, "pwms": [1, 2, 3, 4, 5, 6, 7, 3]}}}
        code, out = self.run_cli(["write-profiles", json.dumps(bad)])
        self.assertEqual(code, 1)
        self.assertIn("pwms no monótonas en pos 7", json.loads(out)["error"])


if __name__ == "__main__":
    unittest.main()
