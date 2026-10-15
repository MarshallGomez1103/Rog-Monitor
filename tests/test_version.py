"""V22-D10: una sola fuente de versión (el archivo VERSION).

Falla si `rog_monitor.__version__`, desktop/package.json o package-lock.json (raíz y
packages[""]) divergen de VERSION.
"""

import json
import os
import shutil
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = (ROOT / "VERSION").read_text(encoding="utf-8").strip()


class VersionSingleSourceTests(unittest.TestCase):
    def test_version_file_is_semver(self):
        self.assertRegex(VERSION, r"^\d+\.\d+\.\d+$")

    def test_package_version_equals_version_file(self):
        # Subproceso limpio: nada en el entorno que enmascare la lectura de VERSION.
        env = {k: v for k, v in os.environ.items() if k != "ROG_MONITOR_VERSION"}
        env["PYTHONPATH"] = str(ROOT / "src")
        out = subprocess.run(
            [sys.executable, "-s", "-c", "import rog_monitor; print(rog_monitor.__version__)"],
            capture_output=True, text=True, env=env, check=True,
        ).stdout.strip()
        self.assertEqual(out, VERSION)

    def test_no_env_override_for_version(self):
        src = (ROOT / "src" / "rog_monitor" / "__init__.py").read_text(encoding="utf-8")
        self.assertNotIn("ROG_MONITOR_VERSION", src)

    def test_node_package_files_equal_version_file(self):
        pkg = json.loads((ROOT / "desktop" / "package.json").read_text(encoding="utf-8"))
        lock = json.loads((ROOT / "desktop" / "package-lock.json").read_text(encoding="utf-8"))
        self.assertEqual(pkg["version"], VERSION)
        self.assertEqual(lock["version"], VERSION)
        self.assertEqual(lock["packages"][""]["version"], VERSION)

    def test_bump_script_check_passes(self):
        node = shutil.which("node")
        if node is None:
            self.skipTest("node no disponible")
        r = subprocess.run([node, str(ROOT / "scripts" / "bump-version.mjs"), "--check"],
                           capture_output=True, text=True, cwd=ROOT)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("OK", r.stdout)


if __name__ == "__main__":
    unittest.main()
