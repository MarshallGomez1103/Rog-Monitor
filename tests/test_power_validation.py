"""CP-1.06: validación de rangos de power_control.apply() y piso de curvas en root.

Sin root ni hardware: sysfs falso (ROG_FW_ATTRS_DIR) y el Python embebido de
scripts/rog-profile-sync.sh ejecutado como proceso normal.
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from rog_monitor import power_control as pc

REPO = Path(__file__).resolve().parents[1]
SYNC = REPO / "scripts" / "rog-profile-sync.sh"

ENTRY = {
    "controls": [
        {"key": "pl1", "attr": "ppt_pl1_spl", "min": 28, "max": 140},
        {"key": "pl2", "attr": "ppt_pl2_sppt", "min": 28, "max": 175},
        {"key": "dynamic_boost", "attr": "nv_dynamic_boost", "min": 5, "max": 25},
        {"key": "thermal_target", "attr": "nv_temp_target", "min": 75, "max": 87},
        {"key": "base_clock_offset", "attr": None, "min": -200, "max": 200},
        {"key": "mem_clock_offset", "attr": None, "min": -500, "max": 1000},
    ]
}


class ValidateChanges(unittest.TestCase):
    def setUp(self):
        # sysfs falso vacío: solo cuentan los rangos del perfil.
        self._tmp = tempfile.TemporaryDirectory()
        patcher = mock.patch.dict(os.environ, {"ROG_FW_ATTRS_DIR": self._tmp.name})
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self._tmp.cleanup)

    def ok(self, changes, entry=ENTRY):
        clean, err = pc.validate_changes(changes, entry)
        self.assertIsNone(err, err)
        return clean

    def bad(self, changes, entry=ENTRY):
        clean, err = pc.validate_changes(changes, entry)
        self.assertIsNone(clean)
        self.assertTrue(err)
        return err

    def test_in_range_values_pass_and_are_integers(self):
        self.assertEqual(self.ok({"pl1": 100, "pl2": 140.4, "thermal_target": 87}),
                         {"pl1": 100, "pl2": 140, "thermal_target": 87})
        self.assertEqual(self.ok({"base_clock_offset": -200, "mem_clock_offset": 1000}),
                         {"base_clock_offset": -200, "mem_clock_offset": 1000})

    def test_out_of_range_is_refused_not_clamped(self):
        for key, val in [("pl1", 141), ("pl1", 27), ("dynamic_boost", 26), ("thermal_target", 88),
                         ("thermal_target", 0), ("base_clock_offset", 201), ("mem_clock_offset", -501)]:
            self.assertIn("fuera del rango", self.bad({key: val}), (key, val))

    def test_null_bool_string_nan_are_refused(self):
        for val in (None, True, False, "80", "", [], {}, float("nan"), float("inf"), float("-inf")):
            self.assertIn("Valor inválido", self.bad({"pl1": val}), repr(val))

    def test_unknown_key_and_non_dict(self):
        self.assertIn("no reconocida", self.bad({"fan_speed": 1}))
        self.assertIn("objeto", self.bad([("pl1", 1)]))

    def test_one_bad_value_blocks_the_whole_batch(self):
        self.bad({"pl1": 100, "pl2": 9999})

    def test_live_sysfs_range_overrides_profile(self):
        d = Path(os.environ["ROG_FW_ATTRS_DIR"]) / "ppt_pl1_spl"
        d.mkdir()
        (d / "min_value").write_text("30\n")
        (d / "max_value").write_text("90\n")
        self.assertEqual(self.ok({"pl1": 90}), {"pl1": 90})
        self.assertIn("fuera del rango", self.bad({"pl1": 100}))  # perfil dice 140, firmware 90

    def test_unknown_bounds_pass_through_for_the_root_script(self):
        entry = {"controls": [{"key": "pl1", "attr": "ppt_pl1_spl"}]}
        self.assertEqual(self.ok({"pl1": 123}, entry), {"pl1": 123})
        # los offsets de GPU siempre tienen rango de respaldo
        self.assertIn("fuera del rango", self.bad({"base_clock_offset": 5000}, entry))


class ApplyRefusesBeforeAnyWrite(unittest.TestCase):
    def test_apply_does_not_spawn_anything_when_invalid(self):
        pcl = pc.PowerControl()
        with mock.patch.object(pc, "_active_profile_entry", return_value=ENTRY), \
                mock.patch.object(pc.subprocess, "run", side_effect=AssertionError("no debe ejecutar")):
            for changes in ({"pl1": 9999}, {"pl1": None}, {"pl1": True}, {"pl1": 100, "pl2": ""}):
                res = pcl.apply(changes)
                self.assertFalse(res["ok"], changes)
                self.assertTrue(res["err"])

    def test_valid_apply_reaches_the_script_with_integer_args(self):
        proc = subprocess.CompletedProcess([], 0, stdout="pl1=100\n", stderr="")
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.dict(os.environ, {"ROG_FW_ATTRS_DIR": tmp}), \
                mock.patch.object(pc, "_active_profile_entry", return_value=ENTRY), \
                mock.patch.object(pc.subprocess, "run", return_value=proc) as run, \
                mock.patch.object(pc.PowerControl, "state", return_value={"ok": True}):
            res = pc.PowerControl().apply({"pl1": 100.0})
        self.assertTrue(res["ok"], res)
        self.assertEqual(run.call_args[0][0][-1], "pl1=100")


def sync_python() -> str:
    """Extrae el Python embebido (heredoc 'PY') de json_curve() en rog-profile-sync.sh."""
    out, inside = [], False
    for line in SYNC.read_text().splitlines():
        if line.rstrip().endswith("<<'PY'"):
            inside = True
        elif inside and line == "PY":
            break
        elif inside:
            out.append(line)
    return "\n".join(out) + "\n"


class ProfileSyncRootSide(unittest.TestCase):
    D_TEMPS = "30 50 60 70 80 85 90 95"
    D_PWMS = "20 36 56 92 138 173 205 205"

    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory()
        cls.dir = Path(cls._tmp.name)
        cls.script = cls.dir / "curve.py"
        cls.script.write_text(sync_python())

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def run_curve(self, path: Path, profile="balanced", fan="cpu"):
        r = subprocess.run(
            ["python3", "-I", str(self.script), str(path), profile, fan, self.D_TEMPS, self.D_PWMS],
            capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=10)
        self.assertEqual(r.returncode, 0, r.stderr)
        temps, pwms = r.stdout.strip().split("|")
        return temps.split(), pwms.split(), r.stderr

    def write(self, name: str, curve: dict) -> Path:
        p = self.dir / name
        p.write_text(json.dumps({"profiles": {"balanced": {"cpu": curve}}}))
        return p

    def test_valid_saved_curve_is_used(self):
        t = [30, 45, 60, 70, 80, 85, 90, 95]
        p = [10, 20, 30, 40, 50, 60, 170, 200]
        temps, pwms, _ = self.run_curve(self.write("ok.json", {"temps": t, "pwms": p}))
        self.assertEqual(temps, [str(x) for x in t])
        self.assertEqual(pwms, [str(x) for x in p])

    def test_hot_points_and_last_point_are_raised_to_floor(self):
        t = [30, 45, 60, 70, 80, 85, 90, 95]
        p = [0, 0, 0, 0, 0, 0, 0, 0]
        _, pwms, _ = self.run_curve(self.write("off.json", {"temps": t, "pwms": p}))
        self.assertEqual(pwms, ["0", "0", "0", "0", "0", "0", "150", "150"])

    def test_structurally_bad_curve_falls_back_to_defaults(self):
        ok_t = [30, 45, 60, 70, 80, 85, 90, 95]
        bad = {
            "temp0": {"temps": [0, 45, 60, 70, 80, 85, 90, 95], "pwms": [20] * 8},
            "dup": {"temps": [30, 30, 60, 70, 80, 85, 90, 95], "pwms": [20] * 8},
            "short": {"temps": [30, 45, 60], "pwms": [20, 30, 40]},
            "pwm300": {"temps": ok_t, "pwms": [20] * 7 + [300]},
            "bool": {"temps": [True, 45, 60, 70, 80, 85, 90, 95], "pwms": [20] * 8},
            "str": {"temps": [30, 45, 60, 70, 80, 85, 90, "95"], "pwms": [20] * 8},
        }
        for name, curve in bad.items():
            temps, pwms, err = self.run_curve(self.write(f"{name}.json", curve))
            self.assertEqual(temps, self.D_TEMPS.split(), name)
            self.assertEqual(pwms, self.D_PWMS.split(), name)
            self.assertIn("rejected", err, name)

    def test_symlink_and_oversize_are_ignored(self):
        good = self.write("target.json", {"temps": [30, 45, 60, 70, 80, 85, 90, 95],
                                          "pwms": [1] * 6 + [160, 160]})
        link = self.dir / "link.json"
        link.symlink_to(good)
        _, pwms, err = self.run_curve(link)
        self.assertEqual(pwms, self.D_PWMS.split())
        self.assertIn("ignored", err)
        big = self.dir / "big.json"
        big.write_text("{" + " " * (300 * 1024) + "}")
        _, pwms, err = self.run_curve(big)
        self.assertEqual(pwms, self.D_PWMS.split())
        self.assertIn("ignored", err)

    def test_fifo_does_not_hang(self):
        fifo = self.dir / "fifo.json"
        os.mkfifo(fifo)
        _, pwms, err = self.run_curve(fifo)
        self.assertEqual(pwms, self.D_PWMS.split())
        self.assertIn("ignored", err)


class ScriptShape(unittest.TestCase):
    def test_find_curves_json_refuses_symlinks_and_big_files(self):
        text = SYNC.read_text()
        self.assertIn("! -L", text)
        self.assertIn("MAX_JSON_BYTES=262144", text)
        self.assertIn("O_NOFOLLOW", text)

    def test_calibrate_traps_signals_and_writes_marker(self):
        text = (REPO / "scripts" / "calibrate-fans.sh").read_text()
        for sig in ("INT", "TERM", "HUP", "EXIT"):
            self.assertRegex(text, rf"trap .* {sig}\b")
        self.assertIn("/run/rog-monitor/calibrating", text)
        self.assertIn("/run/rog-monitor/calibrating", SYNC.read_text())


if __name__ == "__main__":
    unittest.main()


class HelperTrust(unittest.TestCase):
    """F1-02: la ruta Python a pkexec aplica la misma regla que priv.js."""

    def setUp(self):
        import tempfile
        from pathlib import Path
        from rog_monitor import power_control as pc
        self.pc, self.tmp = pc, tempfile.TemporaryDirectory()
        self.lib = Path(self.tmp.name)
        self.script = self.lib / "apply-power-control.sh"

    def tearDown(self):
        self.tmp.cleanup()

    def test_missing_helper_needs_install(self):
        r = self.pc._helper_problem(self.script, self.lib)
        self.assertTrue(r["needsInstall"])

    def test_version_mismatch_needs_install(self):
        self.script.write_text("#!/bin/bash\n")
        (self.lib / "VERSION").write_text("0.0.1\n")
        r = self.pc._helper_problem(self.script, self.lib)
        self.assertTrue(r["needsInstall"])
        self.assertIn("0.0.1", r["err"])

    def test_user_owned_helper_is_refused(self):
        import os
        if os.geteuid() == 0:
            self.skipTest("corre como root")
        from rog_monitor import __version__
        self.script.write_text("#!/bin/bash\n")
        (self.lib / "VERSION").write_text(__version__)
        r = self.pc._helper_problem(self.script, self.lib)
        self.assertFalse(r["ok"])
        self.assertNotIn("needsInstall", r)


class HelperTrustAsRoot(unittest.TestCase):
    """Regresión 2026-10-12: como root (rog-profile-sync -> copia instalada, sin VERSION
    propio = 0.0.0-dev) la comprobación de versión daba needsInstall y los límites no se aplicaban."""

    def test_root_path_skips_version_but_keeps_owner_check(self):
        import os, tempfile
        from pathlib import Path
        from rog_monitor import power_control as pc
        with tempfile.TemporaryDirectory() as d:
            lib = Path(d); script = lib / "apply-power-control.sh"
            script.write_text("#!/bin/bash\n")
            (lib / "VERSION").write_text("21.0.0\n")
            r = pc._helper_problem(script, lib, check_version=False)
            if os.geteuid() != 0:   # dueño del usuario: sigue rechazado, pero NO por versión
                self.assertFalse(r["ok"]); self.assertNotIn("needsInstall", r)
        real = Path("/usr/local/libexec/rog-monitor/apply-power-control.sh")
        if real.exists() and real.stat().st_uid == 0:
            self.assertIsNone(pc._helper_problem(real, real.parent, check_version=False))
