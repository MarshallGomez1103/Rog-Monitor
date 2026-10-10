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


if __name__ == "__main__":
    unittest.main()
