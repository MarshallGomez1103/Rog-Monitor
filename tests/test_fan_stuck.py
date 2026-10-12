"""Ventiladores pegados arriba con la CPU fría (bug 2026-10-12): rog-profile-sync.sh
re-aplica la curva si dura ≥60 s. Árbol sysfs falso; el script se importa con `source`."""
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "rog-profile-sync.sh"
PERF = ([30, 50, 60, 70, 80, 85, 90, 95], [31, 46, 69, 115, 166, 207, 234, 234])


def tree(root: Path, rpm: int, pkg_c: int):
    hw = root / "sys/class/hwmon"
    curve, asus, core = hw / "hwmon7", hw / "hwmon6", hw / "hwmon10"
    for d, name in ((curve, "asus_custom_fan_curve"), (asus, "asus"), (core, "coretemp")):
        d.mkdir(parents=True)
        (d / "name").write_text(name + "\n")
    for fan in (1, 2, 3):
        (asus / f"fan{fan}_input").write_text(f"{rpm}\n")
        (curve / f"pwm{fan}_enable").write_text("1\n")
        for i, (t, p) in enumerate(zip(*PERF), 1):
            (curve / f"pwm{fan}_auto_point{i}_temp").write_text(f"{t}\n")
            (curve / f"pwm{fan}_auto_point{i}_pwm").write_text(f"{p}\n")
    (core / "temp1_input").write_text(f"{pkg_c * 1000}\n")
    return curve


def run(root: Path, curve: Path, steps):
    """steps: lista de instantes (s) en los que corre check_stuck_fans. Devuelve (salida, nº re-aplicaciones)."""
    calls = " ".join(f"STUCK_NOW={t} check_stuck_fans performance;" for t in steps)
    script = f'''
source "{SCRIPT}"
CURVE_HWMON="{curve}"
STUCK_TOGGLE_S=0
apply_curves() {{ echo APPLIED "$1" "$(cat "$CURVE_HWMON/pwm1_enable")"; }}
{calls}
'''
    r = subprocess.run(["bash", "-c", script], capture_output=True, text=True,
                       env={**os.environ, "ROG_SYSFS_ROOT": str(root)}, stdin=subprocess.DEVNULL)
    return r.stdout + r.stderr, r.stdout.count("APPLIED")


class FanStuck(unittest.TestCase):
    def test_curve_interpolation(self):
        with tempfile.TemporaryDirectory() as d:
            curve = tree(Path(d), 3000, 60)
            for temp, want in ((20, 31), (60, 69), (65, 92), (95, 234), (120, 234)):
                r = subprocess.run(["bash", "-c", f'source "{SCRIPT}"; curve_pwm_at "{curve}" 1 {temp}'],
                                   capture_output=True, text=True, stdin=subprocess.DEVNULL)
                self.assertEqual(r.stdout.strip(), str(want), temp)

    def test_cold_cpu_and_fans_at_6000_reapplies_after_60s(self):
        with tempfile.TemporaryDirectory() as d:
            curve = tree(Path(d), 6000, 60)
            out, n = run(Path(d), curve, [1000, 1030])        # 30 s: todavía no
            self.assertEqual(n, 0, out)
            out, n = run(Path(d), curve, [1000, 1030, 1061])  # ≥60 s: re-aplica
            self.assertEqual(n, 1, out)
            self.assertIn("APPLIED performance 2", out)       # pasó por enable=2 antes de la curva
            self.assertIn("re-applying performance fan curves", out)

    def test_hot_cpu_is_left_alone(self):
        with tempfile.TemporaryDirectory() as d:
            curve = tree(Path(d), 6000, 85)                   # jugando: 6000 rpm es lo correcto
            self.assertEqual(run(Path(d), curve, [0, 100, 200])[1], 0)

    def test_normal_rpm_for_the_curve_is_left_alone(self):
        with tempfile.TemporaryDirectory() as d:
            curve = tree(Path(d), 4200, 68)                   # 68 °C pide ~105/255 ≈ 4000 rpm
            self.assertEqual(run(Path(d), curve, [0, 100, 200])[1], 0)

    def test_episode_resets_when_fans_drop(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            curve = tree(root, 6000, 60)
            script_steps = [0]
            out, _ = run(root, curve, script_steps)
            for f in (1, 2, 3):
                (root / f"sys/class/hwmon/hwmon6/fan{f}_input").write_text("3000\n")
            self.assertEqual(run(root, curve, [0, 30, 90])[1], 0)


class GpuFanHighWithColdCpu(unittest.TestCase):
    def test_only_gpu_fan_high_is_not_stuck(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            curve = tree(root, 3200, 60)
            (root / "sys/class/hwmon/hwmon6/fan2_input").write_text("6500\n")  # GPU caliente, juego
            self.assertEqual(run(root, curve, [0, 30, 90])[1], 0)
