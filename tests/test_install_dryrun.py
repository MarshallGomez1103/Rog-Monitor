"""scripts/install-system.sh sin root: --dry-run y ROG_PREFIX (CP-1.07).

Nunca toca el sistema vivo: el instalador real solo corre contra un prefijo
temporal o en modo --dry-run.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
INSTALLER = REPO / "scripts" / "install-system.sh"
ROOT_SCRIPTS = ["rog-profile-sync.sh", "rog-power-source.sh", "apply-gpu-clocks.sh",
                "apply-power-control.sh", "rog-ctl.sh"]
SAFE_MODE = REPO / "scripts" / "rog-monitor-safe-mode.sh"

# Lo que instalan install-system.sh, enable-asusd.sh y enable-cpu-power.sh (relativo al prefijo).
INSTALLED_FILES = [
    "etc/systemd/system/rog-profile-sync.service",
    "etc/systemd/system/rog-thermal-guardian.service",
    "etc/systemd/system/rog-battery-limit.service",
    "etc/systemd/system/rog-power-source.service",
    "etc/systemd/system-sleep/rog-battery-limit",
    "etc/udev/rules.d/99-rog-power-source.rules",
    "etc/tmpfiles.d/rog-monitor-rapl.conf",
    "etc/profile.d/rog-aura-only.sh",
    "usr/local/bin/asusd",
    "usr/local/sbin/rog-profile-sync",
    "usr/local/share/asusd/aura_support.ron",
    "usr/local/share/dbus-1/system.d/asusd.conf",
    "etc/dbus-1/system.d/asusd.conf",
    "etc/systemd/system/rog-thermal-guardian.service.d/override.conf",
    "usr/local/libexec/rog-monitor/rog-ctl.sh",
    "usr/local/lib/rog-monitor/rog_monitor/power_control.py",
    "run/rog-monitor/calibrating",
]
KEPT_CONFIG = ["etc/rog-monitor/battery.conf", "etc/asusd/asusd.env"]


def run_installer(*args: str, prefix: str | None = None) -> subprocess.CompletedProcess:
    env = {k: v for k, v in os.environ.items() if k != "ROG_PREFIX"}
    if prefix:
        env["ROG_PREFIX"] = prefix
    return subprocess.run(["bash", str(INSTALLER), *args], capture_output=True, text=True,
                          stdin=subprocess.DEVNULL, env=env, timeout=60)


class InstallDryRun(unittest.TestCase):
    def test_dry_run_prints_and_changes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            r = run_installer("--dry-run", prefix=tmp)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertIn("[dry-run] install", r.stdout)
            self.assertIn("/usr/local/libexec/rog-monitor/rog-ctl.sh", r.stdout)
            self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_dry_run_without_prefix_runs_as_normal_user(self):
        r = run_installer("--dry-run")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("DRY-RUN", r.stdout)

    def test_refuses_without_root_and_without_prefix(self):
        if os.geteuid() == 0:
            self.skipTest("corre como root")
        r = run_installer()
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("root", r.stderr)

    def test_unknown_option_rejected(self):
        self.assertEqual(run_installer("--nope").returncode, 2)


class InstallIntoPrefix(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory()
        cls.prefix = Path(cls._tmp.name)
        cls.result = run_installer(prefix=str(cls.prefix))
        cls.libexec = cls.prefix / "usr/local/libexec/rog-monitor"
        cls.pylib = cls.prefix / "usr/local/lib/rog-monitor"

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def test_exit_ok(self):
        self.assertEqual(self.result.returncode, 0, self.result.stderr)

    def test_helpers_and_version(self):
        for name in ["rog-py.sh", "rog-ctl.sh", "apply-power-control.sh", "apply-gpu-clocks.sh",
                     "calibrate-fans.sh", "enable-asusd.sh", "rog-profile-sync.sh",
                     "rog-thermal-guardian.sh", "rog-battery-limit.sh", "rog-monitor-safe-mode.sh"]:
            p = self.libexec / name
            self.assertTrue(p.is_file(), name)
            self.assertEqual(p.stat().st_mode & 0o777, 0o755, name)
        self.assertEqual((self.libexec / "VERSION").read_text().strip(),
                         (REPO / "VERSION").read_text().strip())

    def test_python_package_copied_clean(self):
        pkg = self.pylib / "rog_monitor"
        self.assertTrue((pkg / "power_control.py").is_file())
        self.assertTrue((pkg / "device_profiles.json").is_file())
        files = [p for p in pkg.rglob("*") if p.is_file()]
        self.assertFalse([p for p in files if "__pycache__" in p.parts or p.suffix == ".pyc"])
        self.assertTrue(all(p.stat().st_mode & 0o777 == 0o644 for p in files))
        self.assertTrue(all(d.stat().st_mode & 0o777 == 0o755 for d in pkg.rglob("*") if d.is_dir()))
        self.assertFalse((self.pylib / ".rog_monitor.new").exists())

    def test_units_point_to_libexec_not_repo(self):
        units = self.prefix / "etc/systemd/system"
        for name in ["rog-profile-sync.service", "rog-thermal-guardian.service",
                     "rog-battery-limit.service"]:
            text = (units / name).read_text()
            self.assertIn("ExecStart=", text)
            self.assertIn("/usr/local/libexec/rog-monitor/", text, name)
            self.assertNotIn("__ROG_MONITOR_REPO__", text, name)
            self.assertNotIn(str(REPO), text, name)
        # el auto-perfil por fuente de poder sigue siendo opt-in
        self.assertFalse((units / "rog-power-source.service").exists())
        self.assertFalse((self.prefix / "etc/udev").exists())

    def test_isolated_python_imports_only_the_system_copy(self):
        code = ("import sys; sys.path.insert(0, sys.argv[1]);"
                "import rog_monitor.power_control as pc, rog_monitor.gpu_clocks as gc;"
                "print(pc.__file__); print(gc.__file__)")
        env = {"PATH": os.environ.get("PATH", ""), "PYTHONPATH": str(REPO / "src")}
        r = subprocess.run([sys.executable, "-I", "-B", "-c", code, str(self.pylib)], capture_output=True,
                           text=True, stdin=subprocess.DEVNULL, env=env, cwd=str(REPO), timeout=30)
        self.assertEqual(r.returncode, 0, r.stderr)
        for line in r.stdout.split():
            self.assertTrue(line.startswith(str(self.pylib)), line)


class RootScriptsDoNotTrustTheRepo(unittest.TestCase):
    def test_no_repo_lookup_in_root_scripts(self):
        for name in ROOT_SCRIPTS:
            text = (REPO / "scripts" / name).read_text()
            for bad in ("find_rog_monitor_repo", ".venv", "PYTHONPATH", "ROG_MONITOR_REPO"):
                self.assertNotIn(bad, text, f"{name}: {bad}")

    def test_guardian_unit_has_no_repo_substitution(self):
        text = (REPO / "systemd" / "rog-thermal-guardian.service").read_text()
        self.assertNotIn("__ROG_MONITOR_REPO__", text)


class SafeModeUninstall(unittest.TestCase):
    """rog-monitor-safe-mode.sh uninstall contra un prefijo falso (sin root ni systemd)."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.prefix = Path(self._tmp.name)
        for rel in INSTALLED_FILES + KEPT_CONFIG:
            f = self.prefix / rel
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text("x\n")
        # el asusd que instaló enable-asusd.sh apunta a /usr/local/bin
        (self.prefix / "etc/systemd/system/asusd.service").write_text(
            "[Service]\nExecStart=/usr/local/bin/asusd\n")

    def tearDown(self):
        self._tmp.cleanup()

    def run_safe(self, *args: str) -> subprocess.CompletedProcess:
        env = {k: v for k, v in os.environ.items() if k != "ROG_PREFIX"}
        env["ROG_PREFIX"] = str(self.prefix)
        return subprocess.run(["bash", str(SAFE_MODE), *args], capture_output=True, text=True,
                              stdin=subprocess.DEVNULL, env=env, timeout=60)

    def exists(self, rel: str) -> bool:
        return (self.prefix / rel).exists()

    def test_dry_run_prints_and_changes_nothing(self):
        r = self.run_safe("uninstall", "--dry-run")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("[dry-run] rm", r.stdout)
        for rel in INSTALLED_FILES + KEPT_CONFIG + ["etc/systemd/system/asusd.service"]:
            self.assertTrue(self.exists(rel), rel)

    def test_dry_run_needs_no_root_on_the_live_system(self):
        env = {k: v for k, v in os.environ.items() if k != "ROG_PREFIX"}
        r = subprocess.run(["bash", str(SAFE_MODE), "--dry-run", "uninstall"], capture_output=True,
                           text=True, stdin=subprocess.DEVNULL, env=env, timeout=60)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("DRY-RUN", r.stdout)

    def test_uninstall_removes_everything_installed_and_keeps_config(self):
        r = self.run_safe("uninstall")
        self.assertEqual(r.returncode, 0, r.stderr)
        for rel in INSTALLED_FILES + ["etc/systemd/system/asusd.service"]:
            self.assertFalse(self.exists(rel), rel)
        self.assertFalse(self.exists("usr/local/libexec/rog-monitor"))
        self.assertFalse(self.exists("usr/local/lib/rog-monitor"))
        for rel in KEPT_CONFIG:
            self.assertTrue(self.exists(rel), rel)

    def test_uninstall_is_idempotent(self):
        self.assertEqual(self.run_safe("uninstall").returncode, 0)
        r = self.run_safe("uninstall")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(self.run_safe("uninstall", "--purge").returncode, 0)

    def test_purge_removes_root_config(self):
        r = self.run_safe("uninstall", "--purge")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertFalse(self.exists("etc/rog-monitor"))
        self.assertFalse(self.exists("etc/asusd/asusd.env"))

    def test_foreign_asusd_unit_is_left_alone(self):
        unit = self.prefix / "etc/systemd/system/asusd.service"
        unit.write_text("[Service]\nExecStart=/usr/bin/asusd\n")
        self.assertEqual(self.run_safe("uninstall", "--purge").returncode, 0)
        self.assertTrue(unit.exists())
        self.assertTrue(self.exists("etc/asusd/asusd.env"))

    def test_bad_arguments(self):
        self.assertEqual(self.run_safe("nope").returncode, 2)
        self.assertEqual(self.run_safe("uninstall", "--bogus").returncode, 2)


class EnableAsusdRefusesUserOwnedSource(unittest.TestCase):
    def test_flag_exists_and_app_does_not_pass_it(self):
        text = (REPO / "scripts" / "enable-asusd.sh").read_text()
        self.assertIn("--i-understand-user-owned-source", text)
        main_js = (REPO / "desktop" / "main.js").read_text()
        self.assertNotIn("i-understand-user-owned-source", main_js)
        self.assertIn("'enable-asusd.sh', ['--yes']", main_js)

    def test_unknown_option_rejected_before_anything_else(self):
        r = subprocess.run(["bash", str(REPO / "scripts" / "enable-asusd.sh"), "--nope"],
                           capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=30)
        self.assertEqual(r.returncode, 2)


class RootScriptsStrictMode(unittest.TestCase):
    def test_root_scripts_set_strict_mode(self):
        # -e va en los scripts lineales; los dos bucles de servicio usan -uo pipefail a propósito.
        for name in ROOT_SCRIPTS + ["calibrate-fans.sh", "rog-thermal-guardian.sh", "rog-battery-limit.sh",
                                    "enable-asusd.sh", "rog-monitor-safe-mode.sh"]:
            text = (REPO / "scripts" / name).read_text()
            self.assertRegex(text, r"(?m)^set -(euo|uo) pipefail$", name)


if __name__ == "__main__":
    unittest.main()
