"""N-B-04: validación, límites, migración y escritura atómica de settings.

Todo ocurre en un directorio temporal: se parchea CONFIG_FILE tanto en
rog_monitor.config (lo usa Config) como en rog_monitor.settings (lo muestra).
Nunca se toca ~/.config real; settings.py no llama a subprocess ni pkexec.
"""

import contextlib
import io
import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from rog_monitor import config, settings


class SettingsBase(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="rogset-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.cfg_dir = self.tmp / "rog-monitor"
        self.cfg_file = self.cfg_dir / "config.json"
        for mod in (config, settings):
            p = mock.patch.object(mod, "CONFIG_FILE", self.cfg_file)
            p.start()
            self.addCleanup(p.stop)

    def write(self, obj_or_text):
        self.cfg_dir.mkdir(parents=True, exist_ok=True)
        text = obj_or_text if isinstance(obj_or_text, str) else json.dumps(obj_or_text)
        self.cfg_file.write_text(text)

    def on_disk(self):
        return json.loads(self.cfg_file.read_text())


class GetSettings(SettingsBase):
    def test_defaults_without_file(self):
        out = settings.get_settings()
        self.assertTrue(out["ok"])
        self.assertEqual(out["alerts"], config.DEFAULTS["alerts"])
        self.assertEqual(out["temp_colors"], {"cpu": [70, 85, 92], "gpu": [60, 75, 83]})
        self.assertEqual(out["close_action"], "quit")
        self.assertEqual(out["lang"], "en")
        self.assertIs(out["ui_prefs_migrated"], False)
        self.assertEqual(out["config_path"], str(self.cfg_file))
        self.assertFalse(self.cfg_file.exists(), "get no debe crear el archivo")

    def test_get_returns_copies_not_defaults(self):
        out = settings.get_settings()
        out["alerts"]["cpu_temp_warn"] = 1
        self.assertEqual(config.DEFAULTS["alerts"]["cpu_temp_warn"], 92)

    def test_partial_legacy_file_is_merged_with_defaults(self):
        # migración implícita: un config antiguo sin claves nuevas las recibe por defecto
        self.write({"lang": "es", "alerts": {"cpu_temp_warn": 80}})
        out = settings.get_settings()
        self.assertEqual(out["lang"], "es")
        self.assertEqual(out["alerts"]["cpu_temp_warn"], 80)
        self.assertEqual(out["alerts"]["gpu_temp_warn"], 85)
        self.assertEqual(out["appearance"], {"theme": "magma", "mode": "dark", "zoom_level": 0})
        self.assertEqual(out["dashboard_layout"], {})
        self.assertEqual(out["aura_draft"], {})
        self.assertIs(out["ui_prefs_migrated"], False)

    def test_unknown_keys_in_file_survive_a_settings_update(self):
        self.write({"clave_futura": {"x": 1}, "interval": 2.5})
        res = settings.update_settings({"lang": "fr"})
        self.assertTrue(res["ok"])
        disk = self.on_disk()
        self.assertEqual(disk["clave_futura"], {"x": 1})
        self.assertEqual(disk["interval"], 2.5)
        self.assertEqual(disk["lang"], "fr")


class CorruptConfig(SettingsBase):
    def test_invalid_json_falls_back_to_defaults_and_keeps_backup(self):
        self.write("{esto no es json")
        out = settings.get_settings()
        self.assertEqual(out["alerts"], config.DEFAULTS["alerts"])
        backups = list(self.cfg_dir.glob("config.json.corrupt-*.bak"))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_text(), "{esto no es json")

    def test_update_after_corrupt_file_writes_valid_json_and_keeps_backup(self):
        self.write("{truncado")
        res = settings.update_settings({"close_action": "tray"})
        self.assertTrue(res["ok"])
        self.assertEqual(self.on_disk()["close_action"], "tray")
        backups = list(self.cfg_dir.glob("config.json.corrupt-*.bak"))
        self.assertEqual([b.read_text() for b in backups], ["{truncado"])

    def test_same_corrupt_content_is_backed_up_only_once(self):
        self.write("{roto")
        config.Config()
        config.Config()
        self.assertEqual(len(list(self.cfg_dir.glob("config.json.corrupt-*.bak"))), 1)

    def test_valid_json_that_is_not_an_object_is_treated_as_corrupt(self):
        for text in ("[]", "[1, 2]", "null", "5", '"hola"', "true"):
            with self.subTest(text=text):
                for old in self.cfg_dir.glob("*.bak") if self.cfg_dir.exists() else []:
                    old.unlink()
                self.write(text)
                out = settings.get_settings()
                self.assertEqual(out["alerts"], config.DEFAULTS["alerts"])
                backups = list(self.cfg_dir.glob("config.json.corrupt-*.bak"))
                self.assertEqual([b.read_text() for b in backups], [text])

    def test_update_over_non_object_config_writes_a_valid_object(self):
        self.write("[]")
        res = settings.update_settings({"lang": "es"})
        self.assertTrue(res["ok"])
        self.assertEqual(self.on_disk()["lang"], "es")
        self.assertEqual([b.read_text() for b in self.cfg_dir.glob("*.bak")], ["[]"])

    def test_empty_file_is_treated_as_corrupt_json(self):
        self.write("")
        self.assertEqual(settings.get_settings()["lang"], "en")


class AlertBounds(SettingsBase):
    def test_every_bound_clamps_low_and_high(self):
        for key, (low, high) in settings.ALERT_BOUNDS.items():
            with self.subTest(key=key):
                lo = settings.update_settings({"alerts": {key: low - 1000}})
                self.assertEqual(lo["alerts"][key], low)
                hi = settings.update_settings({"alerts": {key: high + 1000}})
                self.assertEqual(hi["alerts"][key], high)
                self.assertEqual(self.on_disk()["alerts"][key], high)

    def test_in_range_value_is_kept_and_rounded(self):
        res = settings.update_settings({"alerts": {"cpu_temp_warn": 88.6}})
        self.assertEqual(res["alerts"]["cpu_temp_warn"], 89)

    def test_numeric_string_is_accepted(self):
        res = settings.update_settings({"alerts": {"gpu_temp_warn": "70"}})
        self.assertEqual(res["alerts"]["gpu_temp_warn"], 70)

    def test_none_value_is_ignored(self):
        res = settings.update_settings({"alerts": {"cpu_temp_warn": None}})
        self.assertEqual(res["alerts"]["cpu_temp_warn"], 92)

    def test_non_numeric_value_is_rejected_and_not_written(self):
        res = settings.update_settings({"alerts": {"cpu_temp_warn": "caliente"}})
        self.assertFalse(res["ok"])
        self.assertIn("cpu_temp_warn", res["err"])
        self.assertFalse(self.cfg_file.exists())

    def test_wrong_type_value_is_rejected(self):
        res = settings.update_settings({"alerts": {"cpu_temp_warn": [1, 2]}})
        self.assertFalse(res["ok"])
        self.assertFalse(self.cfg_file.exists())

    def test_nan_is_rejected(self):
        res = settings.update_settings({"alerts": {"cpu_temp_warn": float("nan")}})
        self.assertFalse(res["ok"])

    def test_infinity_is_rejected_not_crashed(self):
        for bad in (float("inf"), float("-inf"), float("nan")):
            with self.subTest(bad=bad):
                res = settings.update_settings({"alerts": {"cpu_temp_warn": bad}})
                self.assertFalse(res["ok"])
                self.assertIn("cpu_temp_warn", res["err"])
        self.assertFalse(self.cfg_file.exists())

    def test_huge_integer_is_rejected_not_crashed(self):
        res = settings.update_settings({"alerts": {"cpu_temp_warn": 10 ** 400}})
        self.assertFalse(res["ok"])

    def test_json_infinity_literal_payload_is_rejected(self):
        raw = json.loads('{"alerts": {"cpu_temp_warn": Infinity}}')
        self.assertFalse(settings.update_settings(raw)["ok"])

    def test_alerts_that_is_not_a_dict_is_a_clean_error(self):
        for bad in (["cpu_temp_warn"], "cpu_temp_warn", 7, True):
            with self.subTest(bad=bad):
                res = settings.update_settings({"alerts": bad})
                self.assertEqual(res["ok"], False)
                self.assertIn("alerts", res["err"])
        self.assertFalse(self.cfg_file.exists())

    def test_falsy_alerts_is_ignored(self):
        for empty in (None, {}, [], "", 0):
            with self.subTest(empty=empty):
                self.assertTrue(settings.update_settings({"alerts": empty})["ok"])

    def test_payload_that_is_not_a_dict_is_a_clean_error(self):
        for bad in ([], "x", None, 3):
            with self.subTest(bad=bad):
                self.assertFalse(settings.update_settings(bad)["ok"])

    def test_unknown_alert_keys_are_not_added(self):
        res = settings.update_settings({"alerts": {"hysteresis_temp": 99, "inventada": 5}})
        self.assertTrue(res["ok"])
        self.assertEqual(res["alerts"]["hysteresis_temp"], 3)
        self.assertNotIn("inventada", res["alerts"])
        self.assertNotIn("inventada", self.on_disk()["alerts"])

    def test_unknown_top_level_keys_are_ignored(self):
        res = settings.update_settings({"rm_rf": True, "interval": 0.001})
        self.assertTrue(res["ok"])
        disk = self.on_disk()
        self.assertNotIn("rm_rf", disk)
        self.assertEqual(disk["interval"], 1.0)

    def test_other_alerts_are_preserved(self):
        settings.update_settings({"alerts": {"cpu_temp_warn": 70}})
        res = settings.update_settings({"alerts": {"gpu_temp_warn": 60}})
        self.assertEqual(res["alerts"]["cpu_temp_warn"], 70)
        self.assertEqual(res["alerts"]["gpu_temp_warn"], 60)


class TempColors(SettingsBase):
    def test_valid_sequence_saved(self):
        res = settings.update_settings({"temp_colors": {"cpu": [60, 75, 90]}})
        self.assertEqual(res["temp_colors"]["cpu"], [60, 75, 90])
        self.assertEqual(res["temp_colors"]["gpu"], [60, 75, 83])
        self.assertEqual(self.on_disk()["temp_colors"]["cpu"], [60, 75, 90])

    def test_values_are_clamped_to_bounds(self):
        res = settings.update_settings({"temp_colors": {"cpu": [10, 80, 500]}})
        self.assertEqual(res["temp_colors"]["cpu"], [40, 80, 110])
        res = settings.update_settings({"temp_colors": {"gpu": [10, 80, 500]}})
        self.assertEqual(res["temp_colors"]["gpu"], [40, 80, 105])

    def test_wrong_length_rejected(self):
        for bad in ([70, 85], [1, 2, 3, 4], "abc", 5, {"a": 1}):
            with self.subTest(bad=bad):
                res = settings.update_settings({"temp_colors": {"cpu": bad}})
                self.assertFalse(res["ok"])
        self.assertFalse(self.cfg_file.exists())

    def test_non_numeric_rejected(self):
        res = settings.update_settings({"temp_colors": {"cpu": [70, "x", 90]}})
        self.assertFalse(res["ok"])
        self.assertIn("cpu", res["err"])

    def test_infinity_in_colors_is_rejected_not_crashed(self):
        for bad in (float("inf"), float("-inf"), float("nan")):
            with self.subTest(bad=bad):
                res = settings.update_settings({"temp_colors": {"cpu": [70, 85, bad]}})
                self.assertFalse(res["ok"])
        self.assertFalse(self.cfg_file.exists())

    def test_temp_colors_that_is_not_a_dict_is_a_clean_error(self):
        for bad in (["cpu"], "cpu", 7):
            with self.subTest(bad=bad):
                res = settings.update_settings({"temp_colors": bad})
                self.assertFalse(res["ok"])
                self.assertIn("temp_colors", res["err"])

    def test_non_increasing_rejected(self):
        for bad in ([80, 80, 90], [90, 80, 70], [70, 85, 85]):
            with self.subTest(bad=bad):
                res = settings.update_settings({"temp_colors": {"cpu": bad}})
                self.assertFalse(res["ok"])
                self.assertIn("aumento", res["err"])

    def test_clamping_that_collapses_order_is_rejected(self):
        # 100 y 200 se acotan a 110 y 110 -> ya no es estrictamente creciente
        res = settings.update_settings({"temp_colors": {"cpu": [50, 200, 300]}})
        self.assertFalse(res["ok"])

    def test_rejection_leaves_earlier_valid_config_untouched(self):
        settings.update_settings({"alerts": {"cpu_temp_warn": 77}})
        before = self.cfg_file.read_text()
        res = settings.update_settings({"alerts": {"cpu_temp_warn": 60}, "temp_colors": {"cpu": [9, 9]}})
        self.assertFalse(res["ok"])
        self.assertEqual(self.cfg_file.read_text(), before)


class SimpleFields(SettingsBase):
    def test_close_action_whitelist(self):
        self.assertEqual(settings.update_settings({"close_action": "tray"})["close_action"], "tray")
        self.assertEqual(settings.update_settings({"close_action": "ask"})["close_action"], "ask")
        res = settings.update_settings({"close_action": "formatear"})
        self.assertEqual(res["close_action"], "ask")

    def test_lang_whitelist(self):
        self.assertEqual(settings.update_settings({"lang": "ja"})["lang"], "ja")
        self.assertEqual(settings.update_settings({"lang": "auto"})["lang"], "auto")
        self.assertEqual(settings.update_settings({"lang": "klingon"})["lang"], "auto")
        self.assertEqual(settings.update_settings({"lang": None})["lang"], "auto")

    def test_notifications_coerced_to_bool(self):
        self.assertIs(settings.update_settings({"notifications": 0})["notifications"], False)
        self.assertIs(settings.update_settings({"notifications": "si"})["notifications"], True)

    def test_dashboard_edit_mode_and_migrated_flag(self):
        res = settings.update_settings({"dashboard_edit_mode": 1, "ui_prefs_migrated": True})
        self.assertIs(res["dashboard_edit_mode"], True)
        self.assertIs(res["ui_prefs_migrated"], True)
        disk = self.on_disk()
        self.assertIs(disk["dashboard_edit_mode"], True)
        self.assertIs(disk["ui_prefs_migrated"], True)
        # el flag de migración se puede apagar de nuevo
        self.assertIs(settings.update_settings({"ui_prefs_migrated": False})["ui_prefs_migrated"], False)


class Appearance(SettingsBase):
    def test_valid_theme_mode_zoom(self):
        res = settings.update_settings({"appearance": {"theme": "aurora", "mode": "light", "zoom_level": 1.5}})
        self.assertEqual(res["appearance"], {"theme": "aurora", "mode": "light", "zoom_level": 1.5})

    def test_unknown_theme_and_mode_are_dropped_keeping_current(self):
        settings.update_settings({"appearance": {"theme": "aurora"}})
        res = settings.update_settings({"appearance": {"theme": "arcoiris", "mode": "sepia"}})
        self.assertTrue(res["ok"])
        self.assertEqual(res["appearance"]["theme"], "aurora")
        self.assertEqual(res["appearance"]["mode"], "dark")

    def test_zoom_clamped(self):
        self.assertEqual(settings.update_settings({"appearance": {"zoom_level": 99}})["appearance"]["zoom_level"], 4)
        self.assertEqual(settings.update_settings({"appearance": {"zoom_level": -99}})["appearance"]["zoom_level"], -3)

    def test_invalid_zoom_rejected(self):
        for bad in ("grande", None, [1]):
            with self.subTest(bad=bad):
                res = settings.update_settings({"appearance": {"zoom_level": bad}})
                self.assertEqual(res, {"ok": False, "err": "Apariencia inválida."})

    def test_nan_and_infinite_zoom_rejected_and_not_written(self):
        for bad in (float("nan"), float("inf"), float("-inf")):
            with self.subTest(bad=bad):
                res = settings.update_settings({"appearance": {"zoom_level": bad}})
                self.assertEqual(res, {"ok": False, "err": "Apariencia inválida."})
        self.assertFalse(self.cfg_file.exists())

    def test_non_dict_appearance_rejected(self):
        for bad in ("oscuro", 3, None, ["magma"]):
            with self.subTest(bad=bad):
                self.assertFalse(settings.update_settings({"appearance": bad})["ok"])
        self.assertFalse(self.cfg_file.exists())


class DashboardLayout(SettingsBase):
    def test_valid_layout_dedups_order_and_hidden(self):
        raw = {
            "order": [{"key": "cpu", "col": "left"}, {"key": "gpu", "col": "right"}, {"key": "cpu", "col": "right"}],
            "hidden": ["ram", "ram", "disk"],
        }
        res = settings.update_settings({"dashboard_layout": raw})
        self.assertEqual(res["dashboard_layout"], {
            "order": [{"key": "cpu", "col": "left"}, {"key": "gpu", "col": "right"}],
            "hidden": ["ram", "disk"],
        })
        self.assertEqual(self.on_disk()["dashboard_layout"], res["dashboard_layout"])

    def test_order_and_hidden_are_capped_at_80(self):
        raw = {
            "order": [{"key": f"k{i}", "col": "left"} for i in range(120)],
            "hidden": [f"h{i}" for i in range(120)],
        }
        out = settings.update_settings({"dashboard_layout": raw})["dashboard_layout"]
        self.assertEqual(len(out["order"]), 80)
        self.assertEqual(len(out["hidden"]), 80)

    def test_invalid_layouts_rejected(self):
        bad_layouts = [
            "no-dict",
            None,
            {"order": [], "hidden": "x"},
            {"order": "x", "hidden": []},
            {"order": []},
            {"order": ["cpu"], "hidden": []},
            {"order": [{"key": "cpu", "col": "centro"}], "hidden": []},
            {"order": [{"key": "../etc/passwd", "col": "left"}], "hidden": []},
            {"order": [{"key": "a" * 49, "col": "left"}], "hidden": []},
            {"order": [{"key": 5, "col": "left"}], "hidden": []},
            {"order": [], "hidden": ["ok", "mal id"]},
            {"order": [], "hidden": [None]},
        ]
        for bad in bad_layouts:
            with self.subTest(bad=bad):
                res = settings.update_settings({"dashboard_layout": bad})
                self.assertEqual(res, {"ok": False, "err": "Layout del tablero inválido."})
        self.assertFalse(self.cfg_file.exists())

    def test_empty_layout_is_valid(self):
        res = settings.update_settings({"dashboard_layout": {"order": [], "hidden": []}})
        self.assertTrue(res["ok"])
        self.assertEqual(res["dashboard_layout"], {"order": [], "hidden": []})

    def test_valid_id_helper(self):
        self.assertTrue(settings._valid_id("cpu_temp-1"))
        self.assertFalse(settings._valid_id(""))
        self.assertFalse(settings._valid_id("a b"))
        self.assertFalse(settings._valid_id(None))
        self.assertFalse(settings._valid_id("x\n"))


class AuraDraft(SettingsBase):
    def test_valid_draft_normalized(self):
        raw = {"driver": " openrgb ", "effect": "static", "speed": "med", "colour": "#FF00aa", "colour2": "00FF00"}
        res = settings.update_settings({"aura_draft": raw})
        self.assertEqual(res["aura_draft"], {
            "driver": "openrgb", "effect": "static", "speed": "med",
            "colour": "ff00aa", "colour2": "00ff00",
        })

    def test_bad_colour_and_oversized_strings_are_dropped(self):
        raw = {"colour": "rojo", "colour2": "#12345", "effect": "x" * 49, "driver": 7, "extra": "z"}
        res = settings.update_settings({"aura_draft": raw})
        self.assertTrue(res["ok"])
        self.assertEqual(res["aura_draft"], {})

    def test_non_dict_draft_rejected(self):
        res = settings.update_settings({"aura_draft": "rojo"})
        self.assertEqual(res, {"ok": False, "err": "Borrador Aura inválido."})
        self.assertFalse(self.cfg_file.exists())


class AtomicWrite(SettingsBase):
    def test_write_atomic_creates_parent_and_0644(self):
        target = self.tmp / "a" / "b" / "x.json"
        config.write_atomic(target, "hola")
        self.assertEqual(target.read_text(), "hola")
        self.assertEqual(target.stat().st_mode & 0o777, 0o644)
        self.assertEqual([p.name for p in target.parent.iterdir()], ["x.json"])

    def test_saved_file_is_sorted_indented_json_with_newline(self):
        settings.update_settings({"lang": "es"})
        text = self.cfg_file.read_text()
        self.assertTrue(text.endswith("}\n"))
        self.assertEqual(text, json.dumps(json.loads(text), indent=2, sort_keys=True) + "\n")

    def test_replace_failure_keeps_old_config_and_cleans_tmp(self):
        settings.update_settings({"alerts": {"cpu_temp_warn": 70}})
        before = self.cfg_file.read_text()
        with mock.patch.object(config.os, "replace", side_effect=OSError("disco lleno")):
            res = settings.update_settings({"alerts": {"cpu_temp_warn": 100}})
        self.assertFalse(res["ok"])
        self.assertIn(str(self.cfg_file), res["err"])
        self.assertEqual(self.cfg_file.read_text(), before)
        self.assertEqual(self.on_disk()["alerts"]["cpu_temp_warn"], 70)
        self.assertEqual([p.name for p in self.cfg_dir.iterdir()], ["config.json"])

    def test_failure_while_writing_content_keeps_old_config_and_cleans_tmp(self):
        settings.update_settings({"lang": "es"})
        before = self.cfg_file.read_text()
        real_fdopen = os.fdopen

        def boom(fd, *a, **kw):
            fh = real_fdopen(fd, *a, **kw)
            fh.write = mock.Mock(side_effect=OSError("EIO a mitad de escritura"))
            return fh

        with mock.patch.object(config.os, "fdopen", side_effect=boom):
            res = settings.update_settings({"lang": "fr"})
        self.assertFalse(res["ok"])
        self.assertEqual(self.cfg_file.read_text(), before)
        self.assertEqual(self.on_disk()["lang"], "es")
        self.assertEqual([p.name for p in self.cfg_dir.iterdir()], ["config.json"])

    def test_chmod_failure_before_replace_does_not_publish_partial_file(self):
        with mock.patch.object(config.os, "chmod", side_effect=PermissionError("no")):
            res = settings.update_settings({"lang": "fr"})
        self.assertFalse(res["ok"])
        self.assertFalse(self.cfg_file.exists())
        self.assertEqual(list(self.cfg_dir.iterdir()), [])

    def test_non_oserror_during_write_is_reraised_and_cleans_tmp(self):
        with mock.patch.object(config.os, "replace", side_effect=KeyboardInterrupt):
            with self.assertRaises(KeyboardInterrupt):
                config.write_atomic(self.cfg_file, "x")
        self.assertEqual(list(self.cfg_dir.iterdir()), [])

    def test_unwritable_directory_returns_error_not_exception(self):
        with mock.patch.object(config.tempfile, "mkstemp", side_effect=PermissionError("ro")):
            res = settings.update_settings({"lang": "fr"})
        self.assertEqual(res["ok"], False)
        self.assertTrue(res["err"].startswith("No se pudo escribir"))

    def test_config_save_returns_bool(self):
        cfg = config.Config()
        self.assertTrue(cfg.save())
        with mock.patch.object(config.os, "replace", side_effect=OSError):
            self.assertFalse(cfg.save())


class MainCli(SettingsBase):
    def run_main(self, argv):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = settings.main(argv)
        return rc, buf.getvalue()

    def test_get_prints_json(self):
        rc, out = self.run_main(["get"])
        self.assertEqual(rc, 0)
        data = json.loads(out)
        self.assertTrue(data["ok"])
        self.assertEqual(data["config_path"], str(self.cfg_file))

    def test_update_prints_json_and_persists(self):
        rc, out = self.run_main(["update", "--json", '{"alerts": {"cpu_temp_warn": 55}, "lang": "it"}'])
        self.assertEqual(rc, 0)
        data = json.loads(out)
        self.assertEqual(data["alerts"]["cpu_temp_warn"], 55)
        self.assertEqual(self.on_disk()["lang"], "it")

    def test_update_with_invalid_values_prints_error_json(self):
        rc, out = self.run_main(["update", "--json", '{"alerts": {"cpu_temp_warn": "x"}}'])
        self.assertEqual(rc, 0)
        self.assertFalse(json.loads(out)["ok"])
        self.assertFalse(self.cfg_file.exists())

    def test_invalid_json_argument_is_clean_message_and_nonzero_exit(self):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            rc = settings.main(["update", "--json", "{no es json"])
        self.assertEqual(rc, 2)
        self.assertEqual(out.getvalue(), "")
        self.assertIn("JSON inválido", err.getvalue())
        self.assertNotIn("Traceback", err.getvalue())
        self.assertFalse(self.cfg_file.exists())

    def test_json_that_is_not_an_object_is_clean_error(self):
        rc, out = self.run_main(["update", "--json", "[1, 2]"])
        self.assertEqual(rc, 0)
        self.assertFalse(json.loads(out)["ok"])

    def test_missing_subcommand_exits_with_usage_error(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as cm:
            settings.main([])
        self.assertEqual(cm.exception.code, 2)

    def test_update_requires_json_argument(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as cm:
            settings.main(["update"])
        self.assertEqual(cm.exception.code, 2)


class NormalizerHelpers(unittest.TestCase):
    def test_clamp(self):
        self.assertEqual(settings._clamp(5, 1, 3), 3)
        self.assertEqual(settings._clamp(-5, 1, 3), 1)
        self.assertEqual(settings._clamp(2, 1, 3), 2)

    def test_merge_is_recursive_and_does_not_mutate_base(self):
        base = {"a": {"x": 1, "y": 2}, "b": 1}
        out = config._merge(base, {"a": {"y": 9}, "c": 3})
        self.assertEqual(out, {"a": {"x": 1, "y": 9}, "b": 1, "c": 3})
        self.assertEqual(base, {"a": {"x": 1, "y": 2}, "b": 1})


if __name__ == "__main__":
    unittest.main()
