"""Simulación del guardián térmico 2.0 (CP-6.07/6.09).

Ejecuta `scripts/rog-thermal-guardian.sh` COMO USUARIO NORMAL contra un árbol
sysfs falso (ROG_SYSFS_ROOT) con temperaturas guionizadas (ROG_THERMAL_FAKE_TEMPS)
y un lanzador python falso. Nunca toca /sys real. Intervalos de décimas de
segundo para que todo dure < 60 s.
"""
import json
import os
import re
import signal
import subprocess
import tempfile
import time
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SCRIPT = REPO / "scripts" / "rog-thermal-guardian.sh"

# Perfil → objetivo calibrado que devolvería `profile-limits`.
LAUNCHER = """#!/usr/bin/env bash
# lanzador falso: rog-py.sh rog_monitor.power_control profile-limits <perfil>
[[ "$2" == profile-limits ]] || exit 2
case "$3" in
    performance) echo "pl2=100 dynamic_boost=25" ;;
    balanced)    echo "pl2=58 dynamic_boost=20" ;;
    quiet)       echo "pl2=45 dynamic_boost=5" ;;
    *)           exit 1 ;;
esac
"""


class Rig:
    """Árbol falso + proceso del guardián."""

    def __init__(self, test: unittest.TestCase):
        self.tmp = tempfile.TemporaryDirectory()
        test.addCleanup(self.tmp.cleanup)
        test.addCleanup(self.stop)
        self.root = Path(self.tmp.name) / "root"
        base = self.root / "sys/class/firmware-attributes/asus-armoury/attributes"
        for attr, lo, hi, cur in (("nv_dynamic_boost", 5, 25, 25), ("ppt_pl2_sppt", 28, 175, 60)):
            d = base / attr
            d.mkdir(parents=True)
            for name, v in (("min_value", lo), ("max_value", hi), ("current_value", cur), ("default_value", hi)):
                (d / name).write_text(f"{v}\n")
        self.base = base
        self.profile = self.root / "sys/firmware/acpi/platform_profile"
        self.profile.parent.mkdir(parents=True)
        self.profile.write_text("balanced\n")
        self.marker = self.root / "run/rog-monitor/guardian-precut"
        self.state_dir = Path(self.tmp.name) / "state"
        self.state_dir.mkdir()
        self.temps = Path(self.tmp.name) / "temps"
        self.temps.write_text("60 60\n")
        self.launcher = Path(self.tmp.name) / "rog-py.sh"
        self.launcher.write_text(LAUNCHER)
        self.launcher.chmod(0o755)
        self.logfile = Path(self.tmp.name) / "guardian.log"
        self.proc = None
        self.addfh = lambda fh: test.addCleanup(fh.close)

    def env(self, dry: int) -> dict:
        e = dict(os.environ)
        e.update({
            "ROG_SYSFS_ROOT": str(self.root),
            "ROG_THERMAL_DRY": str(dry),
            "ROG_THERMAL_FAKE_TEMPS": str(self.temps),
            "ROG_THERMAL_STATE_DIR": str(self.state_dir),
            "ROG_PY_LAUNCHER": str(self.launcher),
            "ROG_THERMAL_INTERVAL": "0.2",
            "ROG_THERMAL_OVER_GRACE": "2",
            "ROG_THERMAL_CUT_INTERVAL": "1",
            "ROG_THERMAL_RESTORE_HOLD": "2",
            "ROG_THERMAL_RESTORE_MARGIN": "4",
            "ROG_THERMAL_DB_STEP": "5",
            "ROG_THERMAL_PL2_STEP": "4",
            "ROG_THERMAL_CPU_CEILING": "92",
            "ROG_THERMAL_GPU_CEILING": "83",
            "ROG_THERMAL_MODE": "protection",
        })
        return e

    def _err(self):
        fh = open(self.logfile, "a")
        self.addfh(fh)
        return fh

    def start(self, dry: int = 0):
        self.logfile.touch()
        self.proc = subprocess.Popen(
            ["bash", str(SCRIPT)], env=self.env(dry),
            stdout=subprocess.DEVNULL, stderr=self._err(),
        )

    def stop(self):
        p, self.proc = self.proc, None
        if p and p.poll() is None:
            p.send_signal(signal.SIGTERM)
            try:
                p.wait(5)
            except subprocess.TimeoutExpired:
                p.kill()
                p.wait()
        return p.returncode if p else None

    def set_temps(self, cpu, gpu):
        tmp = self.temps.with_suffix(".new")
        tmp.write_text(f"{cpu} {gpu}\n")
        os.replace(tmp, self.temps)

    def val(self, attr: str) -> int:
        return int((self.base / attr / "current_value").read_text())

    @property
    def db(self):
        return self.val("nv_dynamic_boost")

    @property
    def pl2(self):
        return self.val("ppt_pl2_sppt")

    def prof(self) -> str:
        return self.profile.read_text().strip()

    def log(self) -> str:
        return self.logfile.read_text()

    def lines(self, decision: str, reason: str = ""):
        pat = re.compile(rf"decision={decision} reason=({reason}[^ ]*) .*")
        return [l for l in self.log().splitlines() if pat.search(l)]

    def wait(self, cond, what: str, timeout: float = 15.0):
        end = time.time() + timeout
        while time.time() < end:
            if cond():
                return
            if self.proc and self.proc.poll() is not None:
                break
            time.sleep(0.05)
        raise AssertionError(f"timeout esperando: {what}\n--- log ---\n{self.log()}")

    def state(self) -> dict:
        return json.loads((self.state_dir / "thermal-guardian-state.json").read_text())


def parse_line(line: str) -> dict:
    kv = dict(re.findall(r"(\w+)=(\S+)", line))
    kv["pl2_new"] = int(kv["pl2"].split("->")[1])
    kv["db_new"] = int(kv["db"].split("->")[1])
    return kv


class GuardianSim(unittest.TestCase):
    def test_full_scenario(self):
        g = Rig(self)
        g.start(dry=0)
        # 1) normal: no toca nada
        g.wait(lambda: (g.state_dir / "thermal-guardian-state.json").exists(), "estado JSON")
        time.sleep(0.6)
        self.assertEqual((g.db, g.pl2, g.prof()), (25, 60, "balanced"))
        self.assertEqual(g.state()["thermal_state"], "normal")
        self.assertFalse(g.marker.exists())

        # 2) sobre el techo: ventiladores YA, corte solo tras la gracia
        g.set_temps(95, 60)
        g.wait(lambda: g.prof() == "performance", "ventiladores a performance")
        self.assertEqual((g.db, g.pl2), (25, 60), "no hay corte antes de la gracia")
        g.wait(lambda: g.lines("boost"), "decisión boost en el journal")
        g.wait(lambda: g.lines("cut"), "primer corte tras la gracia", 8)
        self.assertEqual((g.db, g.pl2), (20, 60), "1.er escalón: solo dynamic boost")
        self.assertTrue(g.marker.exists(), "marcador pre-recorte persistido")
        mk = g.marker.read_text()
        self.assertIn("profile=balanced", mk)
        self.assertIn("db=25", mk)
        self.assertIn("pl2=60", mk)
        grace_holds = len(g.lines("hold", "gracia-antes-de-recortar"))
        self.assertEqual(grace_holds, 1)

        # 3) meseta en banda de alerta (89-91): la gracia NO se reinicia
        g.set_temps(90, 60)
        time.sleep(1.5)
        g.set_temps(95, 60)
        g.wait(lambda: len(g.lines("cut")) >= 2, "2.º corte sin nueva gracia", 4)
        self.assertEqual(len(g.lines("hold", "gracia-antes-de-recortar")), grace_holds,
                         "volver al techo desde la banda no reinicia la gracia")
        self.assertEqual((g.db, g.pl2), (15, 56))
        g.wait(lambda: len(g.lines("cut")) >= 3, "3.er corte", 4)
        self.assertEqual((g.db, g.pl2), (10, 52))
        last_cut = parse_line(g.lines("cut")[-1])
        self.assertEqual(last_cut["sim"], "0")
        self.assertEqual(last_cut["ceiling"], "92/83")
        self.assertEqual(g.state()["last_decision"]["decision"], "cut")
        self.assertLessEqual(len(g.state()["history"]), 20)

        # 4) enfriar: restauración gradual, jamás por encima del perfil actual
        #    (balanced → pl2 58 / db 20; el valor previo era pl2 60 / db 25)
        g.set_temps(70, 60)
        g.wait(lambda: g.lines("restore"), "primer escalón de restauración", 10)
        self.assertEqual(g.prof(), "performance", "ventiladores no bajan hasta terminar")
        g.wait(lambda: g.prof() == "balanced" and not g.marker.exists(), "restauración completa", 12)
        self.assertEqual((g.db, g.pl2), (20, 58))
        news = [parse_line(l) for l in g.lines("restore")]
        self.assertGreaterEqual(len(news), 2, "restauración en varios escalones")
        self.assertTrue(all(n["pl2_new"] <= 58 and n["db_new"] <= 20 for n in news))
        self.assertIn(56, [n["pl2_new"] for n in news], "pasó por un escalón intermedio")
        self.assertTrue(g.lines("unboost"))
        self.assertEqual(g.state()["thermal_state"], "normal")

        # 5) sensor ausente: nunca corta ni restaura potencia; ventiladores arriba
        before = len(g.lines("cut"))
        g.set_temps("-", "-")
        g.wait(lambda: g.prof() == "performance", "failsafe: ventiladores arriba")
        time.sleep(2.5)
        self.assertEqual((g.db, g.pl2), (20, 58))
        self.assertEqual(len(g.lines("cut")), before)
        self.assertTrue(g.lines("hold", "sensor-ausente-ambos-failsafe"))
        g.set_temps("-", 60)   # solo falta uno, el otro frío: sigue sin tocar potencia
        time.sleep(1.0)
        self.assertEqual((g.db, g.pl2, g.prof()), (20, 58, "performance"))
        g.set_temps(70, 60)    # vuelven ambos: tras la retención, perfil original
        g.wait(lambda: g.prof() == "balanced", "ventiladores vuelven al original", 10)
        self.assertEqual((g.db, g.pl2), (20, 58))

        # 6) SIGKILL a mitad de un recorte → el siguiente arranque restaura
        g.set_temps(95, 60)
        g.wait(lambda: g.db == 15, "corte nuevo", 8)
        self.assertTrue(g.marker.exists())
        g.proc.kill()
        g.proc.wait()
        g.proc = None
        self.assertEqual(g.db, 15, "tras el crash el límite queda reducido")
        g.set_temps(70, 60)
        g.start(dry=0)
        g.wait(lambda: g.db == 20 and not g.marker.exists() and g.prof() == "balanced",
               "restauración desde el marcador al arrancar", 8)
        self.assertEqual(g.pl2, 58)
        self.assertIn("Marcador pre-recorte encontrado", g.log())
        self.assertEqual(g.stop(), 0)

    def test_profile_change_is_not_overwritten(self):
        """H2: si el usuario cambia de perfil durante un recorte, el guardián ni
        sube límites por encima del nuevo perfil ni pisa su perfil."""
        g = Rig(self)
        g.start(dry=0)
        g.set_temps(95, 60)
        g.wait(lambda: g.db == 20, "primer corte", 10)
        g.profile.write_text("quiet\n")          # el usuario/PPD cambia de perfil
        g.set_temps(70, 60)
        g.wait(lambda: not g.marker.exists(), "fin de episodio", 12)
        self.assertEqual(g.prof(), "quiet", "no se pisa el perfil del usuario")
        self.assertEqual(g.pl2, 60, "no se sube ni se baja PL2 (objetivo quiet 45 < actual)")
        self.assertEqual(g.db, 20)
        self.assertEqual(g.stop(), 0)

    def test_dry_run_changes_nothing(self):
        g = Rig(self)
        g.start(dry=1)
        g.set_temps(95, 60)
        g.wait(lambda: len(g.lines("cut")) >= 2, "dos cortes simulados", 12)
        g.set_temps(70, 60)
        g.wait(lambda: g.lines("restore"), "restauración simulada", 12)
        log = g.log()
        self.assertIn("[SIM] would write", log)
        self.assertRegex(log, r"decision=cut .* sim=1")
        # la simulación sí ve su propia rampa...
        self.assertEqual(parse_line(g.lines("cut")[0])["db_new"], 20)
        self.assertEqual(parse_line(g.lines("cut")[1])["db_new"], 15)
        # ...pero el árbol falso NO cambió
        self.assertEqual((g.db, g.pl2, g.prof()), (25, 60, "balanced"))
        self.assertFalse(g.marker.exists())
        self.assertEqual(g.state()["dry"], 1)
        self.assertEqual(g.state()["last_decision"]["values"]["sim"], 1)
        self.assertEqual(g.stop(), 0)
        self.assertEqual((g.db, g.pl2, g.prof()), (25, 60, "balanced"))

    def test_gaming_cap_only_when_active(self):
        """M5: guardian_mode=gaming solo mientras hay calor, no permanente."""
        g = Rig(self)
        env = g.env(0)
        env["ROG_THERMAL_MODE"] = "gaming"
        g.logfile.touch()
        g.proc = subprocess.Popen(["bash", str(SCRIPT)], env=env,
                                  stdout=subprocess.DEVNULL, stderr=g._err())
        g.wait(lambda: (g.state_dir / "thermal-guardian-state.json").exists(), "estado")
        time.sleep(0.5)
        st = g.state()
        self.assertEqual((st["configured_mode"], st["guardian_mode"]), ("gaming", "protection"))
        g.set_temps(95, 60)
        g.wait(lambda: g.state()["guardian_mode"] == "gaming", "gaming efectivo con calor")
        time.sleep(2.5)
        self.assertEqual((g.db, g.pl2), (25, 60), "gaming nunca recorta potencia")
        self.assertEqual(g.stop(), 0)


class ProfileLimitsCli(unittest.TestCase):
    def test_profile_limits_read_only(self):
        import io
        from contextlib import redirect_stdout
        from rog_monitor import power_control as pc
        entry = {"profile_power": {"quiet": {"pl2": 45, "dynamic_boost": 5}},
                 "controls": []}
        orig = pc._active_profile_entry
        pc._active_profile_entry = lambda: entry
        try:
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = pc.main(["profile-limits", "power-saver"])
            self.assertEqual((rc, buf.getvalue().strip()), (0, "pl2=45 dynamic_boost=5"))
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = pc.main(["profile-limits", "turbo"])
            self.assertEqual((rc, buf.getvalue()), (1, ""))
        finally:
            pc._active_profile_entry = orig


if __name__ == "__main__":
    unittest.main()
