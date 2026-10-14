"""Ventiladores pegados arriba con la CPU fría (bug 2026-10-12): rog-profile-sync.sh
re-aplica la curva si dura ≥60 s. Árbol sysfs falso; el script se importa con `source`."""
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "rog-profile-sync.sh"
PERF = ([30, 50, 60, 70, 80, 85, 90, 95], [31, 46, 69, 115, 166, 207, 234, 234])
PERF_GPU = ([30, 50, 60, 65, 72, 76, 80, 83], [26, 38, 71, 107, 158, 204, 234, 234])
# calibración real del G614JV (fan-curves.json del propietario)
CALIB = {"cpu": [[90, 3600], [120, 4300], [150, 4800], [180, 5400], [210, 6000], [235, 6600], [255, 7000]],
         "gpu": [[90, 3700], [120, 4300], [150, 4900], [180, 5400], [210, 6100], [235, 6600], [255, 6800]],
         "mid": [[90, 3900], [120, 4600], [150, 5100], [180, 5900], [210, 6600], [235, 7200], [255, 7500]]}


def tree(root: Path, rpm, pkg_c: int, gpu: str = "suspended"):
    """rpm: int (los 3) o tupla (cpu, gpu, mid). gpu: 'suspended' o una temperatura."""
    rpms = rpm if isinstance(rpm, tuple) else (rpm, rpm, rpm)
    hw = root / "sys/class/hwmon"
    curve, asus, core = hw / "hwmon7", hw / "hwmon6", hw / "hwmon10"
    for d, name in ((curve, "asus_custom_fan_curve"), (asus, "asus"), (core, "coretemp")):
        d.mkdir(parents=True)
        (d / "name").write_text(name + "\n")
    for fan in (1, 2, 3):
        (asus / f"fan{fan}_input").write_text(f"{rpms[fan - 1]}\n")
        (curve / f"pwm{fan}_enable").write_text("1\n")
        temps, pwms = PERF_GPU if fan == 2 else PERF
        for i, (t, p) in enumerate(zip(temps, pwms), 1):
            (curve / f"pwm{fan}_auto_point{i}_temp").write_text(f"{t}\n")
            (curve / f"pwm{fan}_auto_point{i}_pwm").write_text(f"{p}\n")
    (core / "temp1_input").write_text(f"{pkg_c * 1000}\n")
    dev = root / "sys/bus/pci/devices/0000:01:00.0"
    (dev / "power").mkdir(parents=True)
    (dev / "vendor").write_text("0x10de\n")
    (dev / "class").write_text("0x030000\n")
    (dev / "power/runtime_status").write_text(("suspended" if gpu == "suspended" else "active") + "\n")
    (root / "fan-curves.json").write_text(json.dumps({"calibration": CALIB}))
    return curve


def run(root: Path, curve: Path, steps, gpu_c=None):
    """steps: instantes (s) en los que corre check_stuck_fans. Devuelve (salida, nº re-aplicaciones)."""
    calls = " ".join(f"STUCK_NOW={t} check_stuck_fans performance;" for t in steps)
    gpu_stub = f'gpu_smi_temp() {{ echo {gpu_c}; }}' if gpu_c is not None else ''
    script = f'''
source "{SCRIPT}"
CURVE_HWMON="{curve}"
STUCK_TOGGLE_S=0
STUCK_LAST_FIX=-100000
find_curves_json() {{ echo "{root}/fan-curves.json"; }}
{gpu_stub}
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

    def test_expected_rpm_uses_calibration(self):
        with tempfile.TemporaryDirectory() as d:
            tree(Path(d), 3000, 60)
            r = subprocess.run(["bash", "-c", f'source "{SCRIPT}"; expected_rpm cpu 135 "{d}/fan-curves.json"'],
                               capture_output=True, text=True, stdin=subprocess.DEVNULL)
            self.assertEqual(r.stdout.strip(), "4550")      # entre (120,4300) y (150,4800)

    def test_cold_cpu_and_fans_at_6000_reapplies_after_60s(self):
        with tempfile.TemporaryDirectory() as d:
            curve = tree(Path(d), 6000, 60)
            self.assertEqual(run(Path(d), curve, [1000, 1030])[1], 0)       # 30 s: todavía no
            out, n = run(Path(d), curve, [1000, 1030, 1061])               # ≥60 s: re-aplica
            self.assertEqual(n, 1, out)
            self.assertIn("APPLIED performance 2", out)                     # pasó por enable=2
            self.assertIn("re-applying performance fan curves", out)

    def test_screenshot_case_74c_cpu_and_mid_6000_gpu_low(self):
        # captura del propietario: CPU 6100 / GPU 2700 / MID 6000 con la CPU ~74 °C
        with tempfile.TemporaryDirectory() as d:
            curve = tree(Path(d), (6100, 2700, 6000), 74)
            out, n = run(Path(d), curve, [0, 30, 61])
            self.assertEqual(n, 1, out)

    def test_hot_machine_is_left_alone(self):
        with tempfile.TemporaryDirectory() as d:
            curve = tree(Path(d), (6600, 6000, 7000), 92, gpu="active")
            self.assertEqual(run(Path(d), curve, [0, 100, 200], gpu_c=80)[1], 0)

    def test_gpu_fan_high_with_hot_gpu_is_left_alone(self):
        with tempfile.TemporaryDirectory() as d:
            curve = tree(Path(d), (3200, 6500, 3500), 60, gpu="active")   # juego que carga la GPU
            self.assertEqual(run(Path(d), curve, [0, 30, 90], gpu_c=82)[1], 0)

    def test_gpu_fan_stuck_with_gpu_asleep_is_fixed(self):
        with tempfile.TemporaryDirectory() as d:
            curve = tree(Path(d), (3200, 6000, 3500), 55)                  # dGPU suspendida = fría
            self.assertEqual(run(Path(d), curve, [0, 30, 90])[1], 1)

    def test_normal_rpm_for_the_curve_is_left_alone(self):
        with tempfile.TemporaryDirectory() as d:
            curve = tree(Path(d), (4600, 3800, 4900), 74)                  # lo que pide la curva a 74 °C
            self.assertEqual(run(Path(d), curve, [0, 100, 200])[1], 0)

    def test_episode_resets_when_fans_drop(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            curve = tree(root, 6000, 60)
            run(root, curve, [0])
            for f in (1, 2, 3):
                (root / f"sys/class/hwmon/hwmon6/fan{f}_input").write_text("3000\n")
            self.assertEqual(run(root, curve, [0, 30, 90])[1], 0)

    def test_cooldown_after_a_fix(self):
        with tempfile.TemporaryDirectory() as d:
            curve = tree(Path(d), 6000, 60)
            out, n = run(Path(d), curve, [0, 61, 91, 122, 152])            # sigue pegado: no re-aplica cada minuto
            self.assertEqual(n, 1, out)

    def test_stuck_below_4500_is_caught(self):
        # quiet/balanced (cap 4500/5500): antes solo se miraba ≥4500 rpm y nunca saltaba
        with tempfile.TemporaryDirectory() as d:
            curve = tree(Path(d), 4300, 55)
            out, n = run(Path(d), curve, [0, 30, 61])
            self.assertEqual(n, 1, out)

    def test_reports_whether_the_fix_worked(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            curve = tree(root, 6000, 60)
            out, _ = run(root, curve, [0, 30, 61, 91])
            self.assertIn("still high right after re-apply", out)
            drop = " ".join(f'echo 2500 > "{root}/sys/class/hwmon/hwmon6/fan{f}_input";' for f in (1, 2, 3))
            r = subprocess.run(["bash", "-c", f'''
source "{SCRIPT}"; CURVE_HWMON="{curve}"; STUCK_TOGGLE_S=0; STUCK_LAST_FIX=-100000
find_curves_json() {{ echo "{root}/fan-curves.json"; }}
apply_curves() {{ :; }}
for t in 0 30 61; do STUCK_NOW=$t check_stuck_fans performance; done
{drop}
STUCK_NOW=91 check_stuck_fans performance'''], capture_output=True, text=True,
                               env={**os.environ, "ROG_SYSFS_ROOT": str(root)}, stdin=subprocess.DEVNULL)
            self.assertIn("Fans back on their curve", r.stderr)


class SetCurveRetry(unittest.TestCase):
    def test_enable_is_retried_once(self):
        # EINVAL del primer enable (asusd escribiendo a la vez): un reintento y sigue
        with tempfile.TemporaryDirectory() as d:
            hw = Path(d)
            r = subprocess.run(["bash", "-c", f'''
source "{SCRIPT}"; CURVE_RETRY_S=0; n=0
printf() {{ if [[ "$1" == '1\\n' && $((n++)) -eq 0 ]]; then return 1; fi; builtin printf "$@"; }}
set_curve "{hw}" 1 "50 60 68 75 82 88 92 96" "20 36 56 82 112 143 168 184" && echo OK n=$n'''],
                               capture_output=True, text=True, stdin=subprocess.DEVNULL)
            self.assertIn("OK n=2", r.stdout, r.stderr)
            self.assertEqual((hw / "pwm1_enable").read_text(), "1\n")
            self.assertEqual((hw / "pwm1_auto_point8_pwm").read_text(), "184\n")


class PowerLimitRetry(unittest.TestCase):
    """Límites de potencia: EBUSY tras cambiar de perfil -> reintentar en las vueltas siguientes."""

    def run_steps(self, fail_first: int, steps: int, target="performance"):
        with tempfile.TemporaryDirectory() as d:
            fake = Path(d) / "rog-py.sh"
            cnt = Path(d) / "n"
            cnt.write_text("0")
            fake.write_text(f'#!/bin/bash\nn=$(( $(cat {cnt}) + 1 )); echo $n > {cnt}\n'
                            f'(( n > {fail_first} )) || {{ echo "Device or resource busy" >&2; exit 1; }}\n')
            fake.chmod(0o755)
            calls = "".join(f'sync_power {target}; echo "last=${{LAST_POWER_PROFILE:-}}";\n' for _ in range(steps))
            r = subprocess.run(["bash", "-c", f'source "{SCRIPT}"; ROG_PY="{fake}"\n{calls}'],
                               capture_output=True, text=True, stdin=subprocess.DEVNULL)
            return r.stdout.split(), r.stderr, int(cnt.read_text())

    def test_busy_then_ok_is_retried(self):
        last, err, tries = self.run_steps(fail_first=2, steps=4)
        self.assertEqual(last, ["last=", "last=", "last=performance", "last=performance"])
        self.assertEqual(tries, 3)                      # no reintenta tras el éxito
        self.assertIn("Applied performance power limits", err)

    def test_gives_up_after_five(self):
        last, err, tries = self.run_steps(fail_first=99, steps=7)
        self.assertEqual(tries, 5)
        self.assertIn("Giving up", err)
        self.assertEqual(last[-1], "last=performance")


class CurvesMatch(unittest.TestCase):
    def check(self, temps, pwms):
        with tempfile.TemporaryDirectory() as d:
            curve = tree(Path(d), 3000, 60)
            r = subprocess.run(["bash", "-c", f'source "{SCRIPT}"; curves_match "{curve}" 1 '
                                f'"{" ".join(map(str, temps))}" "{" ".join(map(str, pwms))}" && echo SAME'],
                               capture_output=True, text=True, stdin=subprocess.DEVNULL)
            return "SAME" in r.stdout

    def test_all_points_are_compared(self):
        t, p = PERF
        self.assertTrue(self.check(t, p))
        self.assertTrue(self.check(t, [v + 1 for v in p]))           # redondeo del driver
        self.assertFalse(self.check([50] + t[1:], p))                 # cambia solo el punto 1
        self.assertFalse(self.check(t, [p[0] + 20] + p[1:]))
