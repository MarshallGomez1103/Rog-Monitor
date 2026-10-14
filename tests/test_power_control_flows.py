"""N-B-13: flujos de power_control (snapshot, apply, reset, caché, CLI) sin tocar el sistema.

- Sysfs falso en un tmp (ROG_FW_ATTRS_DIR) y XDG_CONFIG_HOME propio.
- subprocess.run reemplazado por un runner que REGISTRA el argv y no ejecuta nada.
  En modo prueba (ROG_FW_ATTRS_DIR) el runner emula el script de recorte/escritura
  sobre el sysfs falso, para poder leer de vuelta; en modo producción solo devuelve
  respuestas enlatadas (nunca pkexec ni helpers reales).
- Sin NVML real (gpu_clocks.read_offsets / _read_nvml_offsets parcheados) ni DMI real.
"""

from __future__ import annotations

import contextlib
import io
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from rog_monitor import power_control as pc

# attr -> (min, max, default_value de fábrica, current_value actual)
FAKE_ATTRS = {
    "ppt_pl1_spl": (28, 140, 100, 80),
    "ppt_pl2_sppt": (28, 175, 125, 110),
    "nv_dynamic_boost": (5, 25, 20, 15),
    "nv_temp_target": (75, 87, 85, 82),
}
KEY_TO_ATTR = {"pl1": "ppt_pl1_spl", "pl2": "ppt_pl2_sppt",
               "dynamic_boost": "nv_dynamic_boost", "thermal_target": "nv_temp_target"}

NVML_OK = {
    "ok": True,
    "core": {"value": 50, "min": -1000, "max": 1000, "safe_min": -150, "safe_max": 150,
             "unit": "MHz"},
    "mem": {"value": 300, "min": -2000, "max": 6000, "safe_min": -400, "safe_max": 900,
            "unit": "MHz"},
}


def proc(rc=0, out="", err=""):
    return subprocess.CompletedProcess([], rc, stdout=out, stderr=err)


class Runner:
    """subprocess.run falso: registra (argv, kwargs); respuestas enlatadas o handler."""

    def __init__(self):
        self.calls: list[tuple[list, dict]] = []
        self.queue: list = []
        self.handler = None

    def __call__(self, argv, **kwargs):
        self.calls.append((list(argv), kwargs))
        if self.queue:
            item = self.queue.pop(0)
            if isinstance(item, BaseException):
                raise item
            return item
        if self.handler:
            return self.handler(list(argv), kwargs)
        return proc(0)


class FakeClock:
    def __init__(self, t=1000.0):
        self.t = t

    def __call__(self):
        return self.t


class PcCase(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.attrs = self.root / "attrs"
        self.cfg = self.root / "cfg"
        self.cfg.mkdir()
        for attr, (lo, hi, dflt, cur) in FAKE_ATTRS.items():
            d = self.attrs / attr
            d.mkdir(parents=True)
            (d / "min_value").write_text(f"{lo}\n")
            (d / "max_value").write_text(f"{hi}\n")
            (d / "default_value").write_text(f"{dflt}\n")
            (d / "current_value").write_text(f"{cur}\n")
        env = mock.patch.dict(os.environ, {"ROG_FW_ATTRS_DIR": str(self.attrs),
                                           "XDG_CONFIG_HOME": str(self.cfg)})
        env.start()
        self.addCleanup(env.stop)
        for var in ("WAYLAND_DISPLAY", "XDG_SESSION_TYPE", "DISPLAY"):
            os.environ.pop(var, None)

        self.dmi = "G614JV-XYZ"
        self.nvml = None
        self.fail_at = None  # el script emulado falla al escribir la N-ésima clave
        self.runner = Runner()
        self.runner.handler = self._emulated_script
        for target, kw in (
            (pc, {"_dmi_product": mock.Mock(side_effect=lambda: self.dmi)}),
            (pc, {"_read_nvml_offsets": mock.Mock(side_effect=lambda: self.nvml)}),
            (pc.os, {"geteuid": mock.Mock(return_value=1000)}),
            (pc.subprocess, {"run": self.runner}),
        ):
            p = mock.patch.multiple(target, **kw)
            p.start()
            self.addCleanup(p.stop)

    # -- helpers ----------------------------------------------------------
    def write_attr(self, attr, field, value):
        (self.attrs / attr / field).write_text(f"{value}\n")

    def current(self, key):
        return int((self.attrs / KEY_TO_ATTR[key] / "current_value").read_text())

    def baseline_file(self):
        return self.cfg / "rog-monitor" / "power-baseline.json"

    def _emulated_script(self, argv, kwargs):
        """Emula apply-power-control.sh sobre el sysfs falso (recorta y escribe)."""
        if argv[0] != "bash":
            return proc(0)
        lines = []
        for n, arg in enumerate(argv[2:]):
            key, _, raw = arg.partition("=")
            attr = KEY_TO_ATTR[key]
            lo = int((self.attrs / attr / "min_value").read_text())
            hi = int((self.attrs / attr / "max_value").read_text())
            if self.fail_at is not None and n == self.fail_at:
                return proc(1, "", f"ERROR: No se pudo escribir en {attr}/current_value")
            val = min(max(int(raw), lo), hi)
            self.write_attr(attr, "current_value", val)
            lines.append(f"{key}={val}\n")
        return proc(0, "".join(lines))

    def production_mode(self, root=False):
        """Quita ROG_FW_ATTRS_DIR (ruta pkexec/helper) sin salir del tmp ni del runner."""
        os.environ.pop("ROG_FW_ATTRS_DIR", None)
        patches = {
            "_attrs_dir": mock.Mock(return_value=str(self.attrs)),
            "_helper_problem": mock.Mock(return_value=None),
        }
        p = mock.patch.multiple(pc, **patches)
        p.start()
        self.addCleanup(p.stop)
        s = mock.patch.object(pc.PowerControl, "state", return_value={"ok": True, "tag": "fresh"})
        s.start()
        self.addCleanup(s.stop)
        pc.os.geteuid.return_value = 0 if root else 1000
        self.runner.handler = None
        return patches["_helper_problem"]


class SnapshotFlows(PcCase):
    def test_db_device_merges_live_sysfs_and_baseline(self):
        snap = pc.PowerControl().snapshot()
        self.assertTrue(snap["ok"])
        self.assertEqual(snap["device"], {
            "id": "asus-2023-hx-rtx4060-16",
            "name": "ASUS 2023 16-inch HX/RTX laptop profile",
            "friendly_name": "ASUS calibrated gaming laptop",
            "calibrated": True, "source": "db"})
        self.assertEqual(list(snap["controls"]),
                         ["pl1", "pl2", "dynamic_boost", "thermal_target",
                          "base_clock_offset", "mem_clock_offset"])
        pl1 = snap["controls"]["pl1"]
        self.assertEqual((pl1["value"], pl1["min"], pl1["max"], pl1["default"]),
                         (80, 28, 140, 100))
        self.assertEqual(pl1["label"], "CPU PL1 (sustained)")
        self.assertEqual(snap["baseline"],
                         {"pl1": 100, "pl2": 125, "dynamic_boost": 20, "thermal_target": 85})
        self.assertTrue(snap["available"])

    def test_live_range_overrides_profile_range(self):
        self.write_attr("ppt_pl1_spl", "max_value", 120)
        pl1 = pc.PowerControl().state()["controls"]["pl1"]
        self.assertEqual((pl1["min"], pl1["max"]), (28, 120))

    def test_baseline_is_captured_once_and_persisted(self):
        pc.PowerControl().state()
        saved = json.loads(self.baseline_file().read_text())
        self.assertEqual(saved["values"],
                         {"pl1": 100, "pl2": 125, "dynamic_boost": 20, "thermal_target": 85})
        self.assertIn("captured_at", saved)
        # el firmware cambia su default: la línea base ya guardada NO se reescribe
        self.write_attr("ppt_pl1_spl", "default_value", 60)
        st = pc.PowerControl().state()
        self.assertEqual(st["baseline"]["pl1"], 100)
        self.assertEqual(st["controls"]["pl1"]["default"], 100)

    def test_baseline_falls_back_to_current_when_no_default_value(self):
        (self.attrs / "nv_temp_target" / "default_value").unlink()
        st = pc.PowerControl().state()
        self.assertEqual(st["baseline"]["thermal_target"], 82)

    def test_no_attrs_means_unavailable_empty_baseline_and_no_file(self):
        for attr in FAKE_ATTRS:
            for f in (self.attrs / attr).iterdir():
                f.unlink()
            (self.attrs / attr).rmdir()
        st = pc.PowerControl().state()
        self.assertFalse(st["available"])
        self.assertEqual(st["baseline"], {})
        self.assertIsNone(st["controls"]["pl1"]["value"])
        self.assertFalse(self.baseline_file().exists())

    def test_unwritable_config_dir_is_swallowed(self):
        (self.cfg / "rog-monitor").write_text("soy un archivo, no un directorio")
        st = pc.PowerControl().state()
        self.assertTrue(st["ok"])
        self.assertEqual(st["baseline"]["pl1"], 100)

    def test_unknown_product_uses_auto_profile(self):
        self.dmi = "Some Other Laptop"
        st = pc.PowerControl().state()
        self.assertEqual((st["device"]["id"], st["device"]["source"], st["device"]["calibrated"]),
                         ("auto", "auto", False))
        self.assertEqual(st["controls"]["pl2"]["max"], 175)  # rango vivo

    def test_auto_profile_is_synthesised_when_db_has_none(self):
        self.dmi = "Nada"
        with mock.patch.object(pc, "_load_db", return_value={"devices": []}):
            st = pc.PowerControl().state()
        self.assertEqual(st["device"]["id"], "auto")
        self.assertEqual(st["device"]["name"], "Generic (auto-detected)")
        self.assertEqual(st["controls"]["thermal_target"]["attr"], "nv_temp_target")
        self.assertEqual(st["controls"]["thermal_target"]["value"], 82)
        self.assertEqual(st["controls"]["mem_clock_offset"]["max"], 1000)

    def test_custom_device_json_wins_over_db(self):
        custom = {"id": "mine", "name": "Mine", "friendly_name": "Mi equipo", "calibrated": True,
                  "controls": [{"key": "pl1", "attr": "ppt_pl1_spl", "min": 10, "max": 20,
                                "writable": True}]}
        (self.cfg / "rog-monitor").mkdir()
        (self.cfg / "rog-monitor" / "device.json").write_text(json.dumps(custom))
        st = pc.PowerControl().state()
        self.assertEqual(st["device"], {"id": "mine", "name": "Mine", "friendly_name": "Mi equipo",
                                        "calibrated": True, "source": "custom"})
        self.assertEqual(list(st["controls"]), ["pl1"])
        self.assertEqual(st["controls"]["pl1"]["min"], 28)  # lo vivo manda sobre el 10 declarado

    def test_custom_device_defaults_when_fields_missing(self):
        (self.cfg / "rog-monitor").mkdir()
        (self.cfg / "rog-monitor" / "device.json").write_text('{"controls": []}')
        st = pc.PowerControl().state()
        self.assertEqual(st["device"], {"id": "custom", "name": "Custom",
                                        "friendly_name": "Custom device",
                                        "calibrated": False, "source": "custom"})
        self.assertFalse(st["available"])

    def test_corrupt_custom_device_json_is_ignored(self):
        (self.cfg / "rog-monitor").mkdir()
        (self.cfg / "rog-monitor" / "device.json").write_text("{no es json")
        self.assertEqual(pc.PowerControl().state()["device"]["source"], "db")

    def test_nvml_unavailable_locks_clock_controls_with_reason(self):
        st = pc.PowerControl().state()
        base = st["controls"]["base_clock_offset"]
        self.assertFalse(base["writable"])
        self.assertFalse(base["nvml_ok"])
        self.assertIn("NVML unavailable", base["reason"])
        self.assertFalse(st["session"]["nvml_ok"])

    def test_nvml_data_enables_and_ranges_clock_controls(self):
        self.nvml = NVML_OK
        st = pc.PowerControl().state()
        base, mem = st["controls"]["base_clock_offset"], st["controls"]["mem_clock_offset"]
        self.assertEqual((base["value"], base["min"], base["max"], base["abs_min"], base["abs_max"]),
                         (50, -150, 150, -1000, 1000))
        self.assertEqual((mem["value"], mem["min"], mem["max"]), (300, -400, 900))
        self.assertTrue(base["writable"] and base["nvml_ok"] and mem["nvml_ok"])
        self.assertEqual((base["default"], base["reason"]), (0, None))
        self.assertTrue(st["session"]["nvml_ok"])

    def test_nvml_not_ok_is_treated_as_unavailable(self):
        self.nvml = {"ok": False}
        st = pc.PowerControl().state()
        self.assertFalse(st["controls"]["mem_clock_offset"]["nvml_ok"])
        self.assertFalse(st["session"]["nvml_ok"])

    def test_session_reports_wayland_and_display(self):
        os.environ["WAYLAND_DISPLAY"] = "wayland-0"
        s = pc.PowerControl().state()["session"]
        self.assertEqual((s["wayland"], s["display"]), (True, "wayland-0"))
        del os.environ["WAYLAND_DISPLAY"]
        os.environ["XDG_SESSION_TYPE"] = "Wayland"
        os.environ["DISPLAY"] = ":1"
        s = pc.PowerControl().state()["session"]
        self.assertEqual((s["wayland"], s["display"]), (True, ":1"))
        os.environ["XDG_SESSION_TYPE"] = "x11"
        self.assertFalse(pc.PowerControl().state()["session"]["wayland"])


class ReadNvmlOffsets(unittest.TestCase):
    def test_returns_reader_result(self):
        with mock.patch("rog_monitor.gpu_clocks.read_offsets", return_value=NVML_OK) as rd:
            self.assertEqual(pc._read_nvml_offsets(), NVML_OK)
        rd.assert_called_once_with(0)

    def test_any_exception_becomes_none(self):
        with mock.patch("rog_monitor.gpu_clocks.read_offsets", side_effect=RuntimeError("sin driver")):
            self.assertIsNone(pc._read_nvml_offsets())


class SnapshotCache(PcCase):
    def setUp(self):
        super().setUp()
        self.clock = FakeClock()
        p = mock.patch.object(pc.time, "monotonic", self.clock)
        p.start()
        self.addCleanup(p.stop)

    def test_snapshot_is_cached_for_less_than_five_seconds(self):
        pcl = pc.PowerControl()
        with mock.patch.object(pc.PowerControl, "_build_snapshot",
                               side_effect=[{"n": 1}, {"n": 2}, {"n": 3}]) as build:
            self.assertEqual(pcl.snapshot(), {"n": 1})
            self.clock.t += 4.9
            self.assertEqual(pcl.snapshot(), {"n": 1})
            self.assertEqual(build.call_count, 1)
            self.clock.t += 0.1  # justo 5,0 s: expira
            self.assertEqual(pcl.snapshot(), {"n": 2})
            self.assertEqual(build.call_count, 2)

    def test_state_bypasses_and_refreshes_the_cache(self):
        pcl = pc.PowerControl()
        with mock.patch.object(pc.PowerControl, "_build_snapshot",
                               side_effect=[{"n": 1}, {"n": 2}]) as build:
            pcl.snapshot()
            self.clock.t += 1
            self.assertEqual(pcl.state(), {"n": 2})
            self.clock.t += 3
            self.assertEqual(pcl.snapshot(), {"n": 2})  # sale del caché que state() renovó
            self.assertEqual(build.call_count, 2)

    def test_returned_dict_is_a_copy_of_the_cache(self):
        pcl = pc.PowerControl()
        first = pcl.snapshot()
        first["ok"] = "tocado"
        first.pop("controls")
        again = pcl.snapshot()
        self.assertIs(again["ok"], True)
        self.assertIn("controls", again)

    def test_apply_invalidates_cache_so_next_snapshot_is_fresh(self):
        pcl = pc.PowerControl()
        self.assertEqual(pcl.snapshot()["controls"]["pl1"]["value"], 80)
        self.clock.t += 1
        self.assertTrue(pcl.apply({"pl1": 90})["ok"])
        self.clock.t += 1
        self.assertEqual(pcl.snapshot()["controls"]["pl1"]["value"], 90)


class ApplyRejects(PcCase):
    def assert_refused(self, changes, fragment):
        res = pc.PowerControl().apply(changes)
        self.assertFalse(res["ok"], changes)
        self.assertIn(fragment, res["err"])
        self.assertEqual(self.runner.calls, [], "no debe ejecutarse nada")
        self.assertEqual(self.current("pl1"), 80)

    def test_empty_changes(self):
        self.assert_refused({}, "No se enviaron cambios")
        self.assert_refused(None, "No se enviaron cambios")

    def test_out_of_range_against_live_firmware_range(self):
        self.assert_refused({"pl1": 141}, "fuera del rango seguro [28, 140]")
        self.assert_refused({"pl1": 27.9}, "fuera del rango seguro")
        self.assert_refused({"thermal_target": 100}, "[75, 87]")

    def test_types_are_refused(self):
        for bad in (None, True, "80", [80], float("nan"), float("inf")):
            self.assert_refused({"pl1": bad}, "Valor inválido")

    def test_unknown_key_and_non_dict(self):
        self.assert_refused({"fan_speed": 1}, "Clave no reconocida: 'fan_speed'")
        self.assert_refused([("pl1", 80)], "objeto clave/valor")
        self.assert_refused("pl1=80", "objeto clave/valor")

    def test_one_bad_value_blocks_valid_ones(self):
        self.assert_refused({"pl1": 90, "pl2": 999}, "'pl2'=999")

    def test_gpu_offset_out_of_fallback_range(self):
        self.assert_refused({"base_clock_offset": 201}, "fuera del rango seguro [-200, 200]")
        self.assert_refused({"mem_clock_offset": -501}, "[-500, 1000]")


class ApplyTestMode(PcCase):
    def test_exact_argv_env_and_readback(self):
        res = pc.PowerControl().apply({"pl1": 90, "pl2": 120.6})
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["applied"], {"pl1": 90, "pl2": 121})
        argv, kw = self.runner.calls[0]
        self.assertEqual(argv, ["bash", str(pc._REPO_SCRIPT), "pl1=90", "pl2=121"])
        self.assertIs(kw["stdin"], subprocess.DEVNULL)
        self.assertEqual(kw["timeout"], 10)
        self.assertEqual(kw["env"]["ROG_FW_ATTRS_DIR"], str(self.attrs))
        self.assertEqual((self.current("pl1"), self.current("pl2")), (90, 121))
        self.assertEqual(res["state"]["controls"]["pl2"]["value"], 121)
        self.assertEqual(len(self.runner.calls), 1)

    def test_clock_offsets_are_skipped_in_test_mode(self):
        res = pc.PowerControl().apply({"pl1": 90, "base_clock_offset": 100})
        self.assertTrue(res["ok"])
        self.assertEqual(res["applied"], {"pl1": 90})
        self.assertEqual(len(self.runner.calls), 1)

    def test_only_clock_offsets_in_test_mode_run_nothing(self):
        res = pc.PowerControl().apply({"mem_clock_offset": 100})
        self.assertEqual((res["ok"], res["applied"]), (True, {}))
        self.assertEqual(self.runner.calls, [])

    def test_script_failure_returns_stderr_then_stdout_then_default(self):
        cases = [(proc(1, "salida", "  error de stderr \n"), "error de stderr"),
                 (proc(1, " solo stdout \n", ""), "solo stdout"),
                 (proc(2, "", ""), "Error desconocido.")]
        for result, expected in cases:
            self.runner.queue.append(result)
            res = pc.PowerControl().apply({"pl1": 90})
            self.assertEqual(res, {"ok": False, "err": expected})

    def test_ebusy_is_reported_once_without_retry(self):
        self.runner.queue.append(proc(1, "", "ERROR: Device or resource busy (EBUSY)"))
        res = pc.PowerControl().apply({"pl1": 90})
        self.assertFalse(res["ok"])
        self.assertIn("EBUSY", res["err"])
        self.assertEqual(len(self.runner.calls), 1)  # hoy no hay reintento
        self.assertEqual(self.current("pl1"), 80)

    def test_spawn_errors_become_error_dicts(self):
        for exc in (OSError("sin bash"), subprocess.TimeoutExpired(["bash"], 10)):
            self.runner.queue.append(exc)
            res = pc.PowerControl().apply({"pl1": 90})
            self.assertFalse(res["ok"])
            self.assertTrue(res["err"].startswith("Error ejecutando apply-power-control.sh:"))

    def test_mid_write_failure_leaves_earlier_writes_in_place_known_gap(self):
        # El módulo delega la escritura en el script y no hay rollback: si falla la
        # 2.ª clave, la 1.ª ya quedó escrita y apply() solo informa el error. Este
        # test documenta ese comportamiento (hueco conocido, ver informe).
        self.fail_at = 1
        res = pc.PowerControl().apply({"pl1": 90, "pl2": 120})
        self.assertFalse(res["ok"])
        self.assertIn("ppt_pl2_sppt", res["err"])
        self.assertEqual((self.current("pl1"), self.current("pl2")), (90, 110))
        self.assertNotIn("state", res)

    def test_script_output_is_parsed_into_ints_and_strings(self):
        self.runner.queue.append(proc(0, "pl1=90\nextra=abc\n\nsin igual\n pl2 = 7 \n"))
        res = pc.PowerControl().apply({"pl1": 90})
        self.assertEqual(res["applied"], {"pl1": 90, "extra": "abc", "pl2": 7})

    def test_parse_script_output_directly(self):
        self.assertEqual(pc.PowerControl._parse_script_output("a=1\nb=x=y\n"),
                         {"a": 1, "b": "x=y"})
        self.assertEqual(pc.PowerControl._parse_script_output(""), {})


class ApplyProduction(PcCase):
    def test_non_root_goes_through_pkexec_with_version_check(self):
        helper = self.production_mode()
        self.runner.queue.append(proc(0, "pl1=90\n"))
        res = pc.PowerControl().apply({"pl1": 90})
        self.assertEqual(res, {"ok": True, "applied": {"pl1": 90},
                               "state": {"ok": True, "tag": "fresh"}})
        argv, kw = self.runner.calls[0]
        self.assertEqual(argv, [pc._PKEXEC, str(pc._SCRIPT), "pl1=90"])
        self.assertIsNone(kw["env"])
        self.assertIs(kw["stdin"], subprocess.DEVNULL)
        helper.assert_called_once_with(pc._SCRIPT, check_version=True)

    def test_root_runs_installed_script_directly_without_version_check(self):
        helper = self.production_mode(root=True)
        self.runner.queue.append(proc(0, "pl2=120\n"))
        pc.PowerControl().apply({"pl2": 120})
        self.assertEqual(self.runner.calls[0][0], [str(pc._SCRIPT), "pl2=120"])
        helper.assert_called_once_with(pc._SCRIPT, check_version=False)

    def test_helper_problem_is_returned_and_nothing_runs(self):
        helper = self.production_mode()
        problem = {"ok": False, "needsInstall": True, "err": "falta instalar"}
        helper.return_value = problem
        self.assertEqual(pc.PowerControl().apply({"pl1": 90}), problem)
        self.assertEqual(self.runner.calls, [])

    def test_gpu_clocks_both_offsets_use_gpu_helper(self):
        helper = self.production_mode()
        self.runner.queue.append(proc(0, json.dumps(
            {"ok": True, "core_applied": 100, "mem_applied": 400})))
        res = pc.PowerControl().apply({"base_clock_offset": 100, "mem_clock_offset": 400})
        self.assertEqual(res["applied"], {"base_clock_offset": 100, "mem_clock_offset": 400})
        argv, kw = self.runner.calls[0]
        self.assertEqual(argv, [pc._PKEXEC, str(pc._GPU_CLOCKS_SCRIPT),
                                "set", "--core", "100", "--mem", "400"])
        self.assertEqual(kw["timeout"], 15)
        self.assertIs(kw["stdin"], subprocess.DEVNULL)
        helper.assert_called_once_with(pc._GPU_CLOCKS_SCRIPT, check_version=True)

    def test_gpu_clocks_root_has_no_pkexec(self):
        self.production_mode(root=True)
        self.runner.queue.append(proc(0, '{"ok": true}'))
        res = pc.PowerControl().apply({"base_clock_offset": 100, "mem_clock_offset": 400})
        self.assertEqual(self.runner.calls[0][0][:2], [str(pc._GPU_CLOCKS_SCRIPT), "set"])
        # sin core_applied/mem_applied en la salida, cae a lo pedido
        self.assertEqual(res["applied"], {"base_clock_offset": 100, "mem_clock_offset": 400})

    def test_gpu_clocks_missing_offset_is_filled_from_nvml(self):
        self.production_mode()
        self.nvml = NVML_OK
        self.runner.queue.append(proc(0, '{"ok": true}'))
        pc.PowerControl().apply({"mem_clock_offset": 500})
        self.assertEqual(self.runner.calls[0][0][-4:], ["--core", "50", "--mem", "500"])
        self.runner.queue.append(proc(0, '{"ok": true}'))
        pc.PowerControl().apply({"base_clock_offset": -20})
        self.assertEqual(self.runner.calls[1][0][-4:], ["--core", "-20", "--mem", "300"])

    def test_gpu_clocks_missing_offset_without_nvml_fails_before_running(self):
        self.production_mode()
        res = pc.PowerControl().apply({"base_clock_offset": 10})
        self.assertEqual(res["ok"], False)
        self.assertIn("Could not read current NVML offsets", res["err"])
        self.assertEqual(self.runner.calls, [])

    def test_gpu_clocks_helper_problem(self):
        helper = self.production_mode()
        helper.return_value = {"ok": False, "err": "no es de root"}
        res = pc.PowerControl().apply({"base_clock_offset": 1, "mem_clock_offset": 2})
        self.assertEqual(res, {"ok": False, "err": "no es de root"})
        self.assertEqual(self.runner.calls, [])

    def test_gpu_clocks_failure_modes(self):
        self.production_mode()
        changes = {"base_clock_offset": 1, "mem_clock_offset": 2}
        self.runner.queue.append(proc(1, "", "denegado\n"))
        self.assertEqual(pc.PowerControl().apply(changes),
                         {"ok": False, "err": "GPU clocks: denegado"})
        self.runner.queue.append(proc(1, "", ""))
        self.assertEqual(pc.PowerControl().apply(changes),
                         {"ok": False, "err": "GPU clocks: Unknown error."})
        self.runner.queue.append(proc(0, "no es json"))
        self.assertEqual(pc.PowerControl().apply(changes),
                         {"ok": False, "err": "GPU clocks: Unknown error while applying GPU clocks."})
        self.runner.queue.append(proc(0, '{"ok": false, "err": "NVML_ERROR_NO_PERMISSION"}'))
        self.assertEqual(pc.PowerControl().apply(changes),
                         {"ok": False, "err": "GPU clocks: NVML_ERROR_NO_PERMISSION"})
        self.runner.queue.append(proc(0, ""))
        self.assertFalse(pc.PowerControl().apply(changes)["ok"])
        self.runner.queue.append(OSError("pkexec ausente"))
        res = pc.PowerControl().apply(changes)
        self.assertEqual(res, {"ok": False, "err": "Error running apply-gpu-clocks.sh: pkexec ausente"})
        self.runner.queue.append(subprocess.TimeoutExpired(["x"], 15))
        self.assertTrue(pc.PowerControl().apply(changes)["err"].startswith("Error running"))

    def test_mixed_attrs_then_gpu_failure_keeps_power_written_known_gap(self):
        # Sin transacción entre ambos scripts: si los relojes de GPU fallan, los
        # límites de potencia ya se aplicaron y apply() devuelve ok=False sin revertir.
        self.production_mode()
        self.runner.queue.extend([proc(0, "pl1=90\n"), proc(1, "", "fallo gpu")])
        res = pc.PowerControl().apply({"pl1": 90, "base_clock_offset": 1, "mem_clock_offset": 2})
        self.assertEqual(res, {"ok": False, "err": "GPU clocks: fallo gpu"})
        self.assertEqual([c[0][1] for c in self.runner.calls],
                         [str(pc._SCRIPT), str(pc._GPU_CLOCKS_SCRIPT)])
        self.assertEqual(len(self.runner.calls), 2)

    def test_mixed_success_merges_both_applied_maps(self):
        self.production_mode()
        self.runner.queue.extend([proc(0, "pl1=90\n"),
                                  proc(0, '{"ok": true, "core_applied": 5, "mem_applied": 6}')])
        res = pc.PowerControl().apply({"pl1": 90, "base_clock_offset": 1, "mem_clock_offset": 2})
        self.assertEqual(res["applied"],
                         {"pl1": 90, "base_clock_offset": 5, "mem_clock_offset": 6})


class ResetFlows(PcCase):
    def test_reset_restores_the_captured_factory_baseline(self):
        res = pc.PowerControl().reset()
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["applied"],
                         {"pl1": 100, "pl2": 125, "dynamic_boost": 20, "thermal_target": 85})
        self.assertEqual([self.current(k) for k in KEY_TO_ATTR], [100, 125, 20, 85])
        self.assertEqual(self.runner.calls[0][0][2:],
                         ["pl1=100", "pl2=125", "dynamic_boost=20", "thermal_target=85"])

    def test_reset_after_change_goes_back_to_baseline_not_to_last_value(self):
        pcl = pc.PowerControl()
        pcl.state()  # captura la línea base
        self.assertTrue(pcl.apply({"pl1": 60})["ok"])
        self.assertEqual(self.current("pl1"), 60)
        self.assertTrue(pcl.reset()["ok"])
        self.assertEqual(self.current("pl1"), 100)

    def test_reset_without_baseline_fails_without_running(self):
        for attr in FAKE_ATTRS:
            for f in (self.attrs / attr).iterdir():
                f.unlink()
            (self.attrs / attr).rmdir()
        res = pc.PowerControl().reset()
        self.assertEqual(res, {"ok": False,
                               "err": "Factory values for this machine were not found."})
        self.assertEqual(self.runner.calls, [])

    def test_reset_ignores_non_power_keys_in_baseline_file(self):
        self.baseline_file().parent.mkdir()
        self.baseline_file().write_text(json.dumps(
            {"values": {"pl1": 90, "base_clock_offset": 50, "bogus": 1}}))
        res = pc.PowerControl().reset()
        self.assertTrue(res["ok"])
        self.assertEqual(self.runner.calls[0][0][2:], ["pl1=90"])

    def test_reset_with_out_of_range_baseline_is_refused_not_clamped(self):
        self.baseline_file().parent.mkdir()
        self.baseline_file().write_text(json.dumps({"values": {"pl1": 999}}))
        res = pc.PowerControl().reset()
        self.assertFalse(res["ok"])
        self.assertIn("fuera del rango", res["err"])
        self.assertEqual(self.runner.calls, [])

    def test_reset_propagates_script_failure(self):
        self.runner.queue.append(proc(1, "", "no se pudo"))
        self.assertEqual(pc.PowerControl().reset(), {"ok": False, "err": "no se pudo"})


class BaselineFile(PcCase):
    def write(self, text):
        self.baseline_file().parent.mkdir(exist_ok=True)
        self.baseline_file().write_text(text)

    def test_missing_file_is_empty(self):
        self.assertEqual(pc._load_baseline(), {})

    def test_numbers_are_coerced_to_int_and_non_numbers_dropped(self):
        self.write(json.dumps({"values": {"pl1": 90.7, "pl2": "x", "dynamic_boost": 12}}))
        self.assertEqual(pc._load_baseline(), {"pl1": 90, "dynamic_boost": 12})

    def test_invalid_json_and_wrong_top_level_are_empty(self):
        for text in ("{roto", "[1, 2]", '"texto"', "null", "{}", '{"values": null}'):
            self.write(text)
            self.assertEqual(pc._load_baseline(), {}, text)

    def test_values_that_are_not_a_dict_are_empty(self):
        for text in ('{"values": [1, 2]}', '{"values": "x"}', '{"values": 5}'):
            self.write(text)
            self.assertEqual(pc._load_baseline(), {}, text)

    def test_infinite_value_does_not_crash(self):
        self.write('{"values": {"pl1": 1e999, "pl2": 125}}')
        self.assertEqual(pc._load_baseline().get("pl2"), 125)

    def test_snapshot_survives_a_hand_broken_baseline(self):
        self.write('{"values": [1, 2]}')
        st = pc.PowerControl().state()
        self.assertTrue(st["ok"])
        self.assertEqual(st["baseline"]["pl1"], 100)  # se recaptura de fábrica

    def test_save_baseline_empty_writes_nothing(self):
        pc._save_baseline({})
        self.assertFalse(self.baseline_file().exists())


class ProfilePowerFlows(PcCase):
    ENTRY_BASE = {"controls": [{"key": "pl1", "attr": "ppt_pl1_spl", "min": 28, "max": 140}]}

    def entry(self, **extra):
        return {**self.ENTRY_BASE, **extra}

    def test_unknown_profile_or_none_gives_none(self):
        e = self.entry(profile_power={"balanced": {"pl1": 80}})
        for prof in (None, "", "turbo", 5):
            self.assertIsNone(pc.profile_power_for(prof, e), prof)

    def test_aliases_resolve_to_quiet(self):
        e = self.entry(profile_power={"quiet": {"pl1": 35}})
        for alias in ("quiet", "power-saver", "POWER_SAVER", " powersave "):
            self.assertEqual(pc.profile_power_for(alias, e), {"pl1": 35}, alias)

    def test_entry_defaults_to_active_profile(self):
        self.assertEqual(pc.profile_power_for("performance"),
                         {"pl1": 140, "pl2": 175, "dynamic_boost": 25, "thermal_target": 87})

    def test_missing_table_or_entry_gives_none(self):
        self.assertIsNone(pc.profile_power_for("balanced", {}))
        self.assertIsNone(pc.profile_power_for("balanced", self.entry()))
        self.assertIsNone(pc.profile_power_for("balanced", self.entry(profile_power=[1])))
        self.assertIsNone(pc.profile_power_for("balanced", self.entry(profile_power={"balanced": 5})))
        with mock.patch.object(pc, "_active_profile_entry", return_value=None):
            self.assertIsNone(pc.profile_power_for("balanced"))

    def test_bad_values_are_skipped_and_empty_result_is_none(self):
        e = self.entry(profile_power={"balanced": {"pl1": "x", "pl2": None, "extra": 3}})
        self.assertIsNone(pc.profile_power_for("balanced", e))
        e = self.entry(profile_power={"balanced": {"pl1": "x", "pl2": "110.4"}})
        self.assertEqual(pc.profile_power_for("balanced", e), {"pl2": 110})

    def test_values_are_preclamped_to_live_range(self):
        self.write_attr("ppt_pl1_spl", "max_value", 90)
        e = self.entry(profile_power={"performance": {"pl1": 140}})
        self.assertEqual(pc.profile_power_for("performance", e), {"pl1": 90})

    def test_apply_for_profile_applies_and_tags_profile(self):
        res = pc.PowerControl().apply_for_profile("power-saver")
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["profile"], "quiet")
        self.assertEqual(res["applied"],
                         {"pl1": 35, "pl2": 45, "dynamic_boost": 5, "thermal_target": 75})
        self.assertEqual([self.current(k) for k in KEY_TO_ATTR], [35, 45, 5, 75])
        # nunca toca los relojes de GPU
        self.assertNotIn("base_clock_offset", self.runner.calls[0][0])

    def test_apply_for_profile_unknown(self):
        self.assertEqual(pc.PowerControl().apply_for_profile("turbo"),
                         {"ok": False, "err": "Unknown profile: 'turbo'."})
        self.assertEqual(self.runner.calls, [])

    def test_apply_for_profile_skips_device_without_table(self):
        self.dmi = "Otro equipo"
        res = pc.PowerControl().apply_for_profile("balanced")
        self.assertEqual(res, {"ok": True, "profile": "balanced",
                               "skipped": "device-sin-profile_power"})
        self.assertEqual(self.runner.calls, [])

    def test_apply_for_profile_write_failure_has_no_profile_key(self):
        self.runner.queue.append(proc(1, "", "fallo"))
        res = pc.PowerControl().apply_for_profile("performance")
        self.assertEqual(res, {"ok": False, "err": "fallo"})


class CliFlows(PcCase):
    def run_cli(self, *argv):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            rc = pc.main(list(argv))
        return rc, out.getvalue()

    def test_state_prints_json(self):
        rc, out = self.run_cli("state")
        self.assertEqual(rc, 0)
        data = json.loads(out)
        self.assertEqual(data["controls"]["pl1"]["value"], 80)
        self.assertEqual(self.runner.calls, [])

    def test_apply_ok_and_readback(self):
        rc, out = self.run_cli("apply", "--json", '{"pl1": 95}')
        self.assertEqual(rc, 0)
        self.assertEqual(json.loads(out)["applied"], {"pl1": 95})
        self.assertEqual(self.current("pl1"), 95)
        self.assertEqual(self.runner.calls[0][0][2:], ["pl1=95"])

    def test_apply_invalid_json(self):
        rc, out = self.run_cli("apply", "--json", "{roto")
        self.assertEqual(rc, 1)
        res = json.loads(out)
        self.assertFalse(res["ok"])
        self.assertTrue(res["err"].startswith("JSON inválido:"))
        self.assertEqual(self.runner.calls, [])

    def test_apply_out_of_range_and_wrong_json_shape(self):
        rc, out = self.run_cli("apply", "--json", '{"pl1": 500}')
        self.assertEqual(rc, 1)
        self.assertIn("fuera del rango", json.loads(out)["err"])
        rc, out = self.run_cli("apply", "--json", "[1]")
        self.assertEqual(rc, 1)
        self.assertIn("objeto", json.loads(out)["err"])
        rc, out = self.run_cli("apply", "--json", "{}")
        self.assertEqual(rc, 1)
        self.assertEqual(self.runner.calls, [])

    def test_reset(self):
        rc, out = self.run_cli("reset")
        self.assertEqual(rc, 0)
        self.assertTrue(json.loads(out)["ok"])
        self.assertEqual(self.current("pl2"), 125)

    def test_reset_failure_exit_code(self):
        self.runner.queue.append(proc(1, "", "no"))
        rc, out = self.run_cli("reset")
        self.assertEqual(rc, 1)
        self.assertEqual(json.loads(out), {"ok": False, "err": "no"})

    def test_apply_profile(self):
        rc, out = self.run_cli("apply-profile", "balanced")
        self.assertEqual(rc, 0)
        data = json.loads(out)
        self.assertEqual((data["profile"], data["applied"]["pl1"]), ("balanced", 80))
        rc, out = self.run_cli("apply-profile", "nope")
        self.assertEqual(rc, 1)
        self.assertIn("Unknown profile", json.loads(out)["err"])

    def test_profile_limits_is_read_only(self):
        rc, out = self.run_cli("profile-limits", "performance")
        self.assertEqual((rc, out), (0, "pl2=175 dynamic_boost=25\n"))
        rc, out = self.run_cli("profile-limits", "power-saver")
        self.assertEqual((rc, out), (0, "pl2=45 dynamic_boost=5\n"))
        rc, out = self.run_cli("profile-limits", "nope")
        self.assertEqual((rc, out), (1, ""))
        self.dmi = "Otro"
        rc, out = self.run_cli("profile-limits", "balanced")
        self.assertEqual((rc, out), (1, ""))
        self.assertEqual(self.runner.calls, [])
        self.assertEqual(self.current("pl1"), 80)

    def test_subcommand_is_required(self):
        with contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as cm:
                pc.main([])
        self.assertEqual(cm.exception.code, 2)


class SmallHelpers(unittest.TestCase):
    def test_load_db_bad_file_falls_back_to_empty(self):
        with mock.patch.object(pc, "_PROFILES_JSON", Path("/nonexistent/x.json")):
            self.assertEqual(pc._load_db(), {"devices": []})
        with tempfile.TemporaryDirectory() as tmp:
            bad = Path(tmp) / "p.json"
            bad.write_text("{roto")
            with mock.patch.object(pc, "_PROFILES_JSON", bad):
                self.assertEqual(pc._load_db(), {"devices": []})

    def test_find_device_profile_substring_and_none_match(self):
        db = {"devices": [{"id": "a", "dmi_match": None}, {"id": "b", "dmi_match": "G614"},
                          {"id": "c"}]}
        self.assertEqual(pc._find_device_profile("ROG G614JV", db)["id"], "b")
        self.assertIsNone(pc._find_device_profile("Otro", db))
        self.assertIsNone(pc._find_device_profile("", {}))

    def test_safe_clamp(self):
        self.assertEqual(pc._safe_clamp(5, 10, 20), 10)
        self.assertEqual(pc._safe_clamp(25, 10, 20), 20)
        self.assertEqual(pc._safe_clamp(15, 10, 20), 15)
        self.assertEqual(pc._safe_clamp(500, None, None), 500)
        self.assertEqual(pc._safe_clamp(-5, None, 0), -5)

    def test_canonical_profile(self):
        self.assertEqual(pc._canonical_profile(" Power-Saver "), "quiet")
        self.assertEqual(pc._canonical_profile("BALANCED"), "balanced")
        self.assertIsNone(pc._canonical_profile("x"))
        self.assertIsNone(pc._canonical_profile(None))

    def test_read_attr_helpers(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "a").mkdir()
            (Path(tmp) / "a" / "f").write_text(" 12 \n")
            (Path(tmp) / "a" / "g").write_text("doce")
            with mock.patch.dict(os.environ, {"ROG_FW_ATTRS_DIR": tmp}):
                self.assertEqual(pc._read_attr("a", "f"), "12")
                self.assertEqual(pc._read_int_attr("a", "f"), 12)
                self.assertIsNone(pc._read_int_attr("a", "g"))
                self.assertIsNone(pc._read_attr("a", "nope"))
                self.assertIsNone(pc._read_int_attr("zzz", "f"))

    def test_attrs_dir_default_is_the_real_path_string_only(self):
        with mock.patch.dict(os.environ, clear=False):
            os.environ.pop("ROG_FW_ATTRS_DIR", None)
            self.assertEqual(pc._attrs_dir(), pc._REAL_ATTRS_DIR)

    def test_dmi_product_missing_file_is_empty(self):
        with mock.patch.object(pc, "_DMI_PRODUCT", "/nonexistent/product_name"):
            self.assertEqual(pc._dmi_product(), "")


if __name__ == "__main__":
    unittest.main()
