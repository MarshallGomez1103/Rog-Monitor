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
        # El guardián escribe con `printf > fichero` (truncar + escribir): una
        # lectura intercalada puede ver el fichero vacío. Se reintenta.
        f = self.base / attr / "current_value"
        for _ in range(100):
            try:
                return int(f.read_text())
            except ValueError:
                time.sleep(0.01)
        return int(f.read_text())

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

    def wait(self, cond, what: str, nominal: float = 1.5):
        """Sondea cada 50 ms hasta que `cond()` sea cierta. El plazo es 10× la
        espera nominal: holgado bajo carga de CPU, y sin coste si todo va bien."""
        end = time.time() + 10 * nominal
        while True:
            try:
                if cond():
                    return
            except (ValueError, KeyError, OSError):
                pass   # lectura intercalada con una escritura del guardián: reintentar
            if time.time() >= end or (self.proc and self.proc.poll() is not None):
                break
            time.sleep(0.05)
        raise AssertionError(f"timeout esperando: {what}\n--- log ---\n{self.log()}")

    def wait_state(self, cond, what: str, nominal: float = 1.5):
        """Espera a que el JSON de estado (publicado AL FINAL de cada ciclo, es
        decir, un poco DESPUÉS de las escrituras y del journal) cumpla `cond(st)`."""
        self.wait(lambda: cond(self.state()), what, nominal)

    def cycles(self) -> int:
        """Cuenta ciclos del guardián observando cambios del mtime del JSON."""
        try:
            return (self.state_dir / "thermal-guardian-state.json").stat().st_mtime_ns
        except OSError:
            return 0

    def settle(self, seconds: float, cycles: int = 3):
        """Ventana para aserciones NEGATIVAS ("no pasa nada"): al menos `seconds`
        y al menos `cycles` ciclos completos del guardián, aunque la CPU vaya
        cargada (plazo máx. 10×). Así la ausencia de cambios es significativa."""
        start = time.time()
        seen, last = 0, self.cycles()
        while time.time() - start < 10 * max(seconds, 0.5):
            cur = self.cycles()
            if cur != last:
                seen, last = seen + 1, cur
            if time.time() - start >= seconds and seen >= cycles:
                return
            if self.proc and self.proc.poll() is not None:
                return
            time.sleep(0.05)

    def state(self) -> dict:
        f = self.state_dir / "thermal-guardian-state.json"
        for _ in range(100):
            try:
                return json.loads(f.read_text())
            except (ValueError, OSError):
                time.sleep(0.01)
        return json.loads(f.read_text())


def log_secs(line: str) -> int:
    h, m, sec = re.match(r"\[ROG-THERMAL (\d+):(\d+):(\d+)\]", line).groups()
    return int(h) * 3600 + int(m) * 60 + int(sec)


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
        g.settle(0.6)
        self.assertEqual((g.db, g.pl2, g.prof()), (25, 60, "balanced"))
        self.assertEqual(g.state()["thermal_state"], "normal")
        self.assertFalse(g.marker.exists())

        # 2) sobre el techo: ventiladores YA, corte solo tras la gracia
        g.set_temps(95, 60)
        g.wait(lambda: g.prof() == "performance", "ventiladores a performance")
        g.wait(lambda: g.lines("boost"), "decisión boost en el journal")
        g.wait(lambda: g.lines("cut"), "primer corte tras la gracia", 3)
        # Sin corte antes de la gracia: el journal es el testigo (los valores en
        # vivo pueden haber avanzado si el test se retrasó bajo carga).
        holds = g.lines("hold", "gracia-antes-de-recortar")
        cuts = g.lines("cut")
        self.assertEqual(len(holds), 1)
        self.assertLess(g.log().index(holds[0]), g.log().index(cuts[0]),
                        "la espera de gracia precede al primer corte")
        self.assertGreaterEqual(log_secs(cuts[0]) - log_secs(holds[0]), 1,
                                "no hay corte antes de transcurrida la gracia")
        first = parse_line(cuts[0])
        self.assertEqual((first["db_new"], first["pl2_new"]), (20, 60),
                         "1.er escalón: solo dynamic boost")
        self.assertTrue(g.marker.exists(), "marcador pre-recorte persistido")
        mk = g.marker.read_text()
        self.assertIn("profile=balanced", mk)
        self.assertIn("db=25", mk)
        self.assertIn("pl2=60", mk)
        grace_holds = len(holds)

        # 3) meseta en banda de alerta (89-91): la gracia NO se reinicia
        g.set_temps(90, 60)
        g.settle(1.5)
        g.set_temps(95, 60)
        g.wait(lambda: len(g.lines("cut")) >= 2, "2.º corte sin nueva gracia", 4)
        self.assertEqual(len(g.lines("hold", "gracia-antes-de-recortar")), grace_holds,
                         "volver al techo desde la banda no reinicia la gracia")
        second = parse_line(g.lines("cut")[1])
        self.assertEqual((second["db_new"], second["pl2_new"]), (15, 56))
        g.wait(lambda: len(g.lines("cut")) >= 3, "3.er corte", 4)
        third = parse_line(g.lines("cut")[2])
        self.assertEqual((third["db_new"], third["pl2_new"]), (10, 52))
        self.assertLessEqual((g.db, g.pl2), (10, 52), "los valores reales siguen la rampa")
        last_cut = parse_line(g.lines("cut")[-1])
        self.assertEqual(last_cut["sim"], "0")
        self.assertEqual(last_cut["ceiling"], "92/83")
        # el JSON se publica al final del ciclo, tras el journal: esperar
        g.wait_state(lambda st: st["last_decision"]["decision"] == "cut", "último evento = cut")
        self.assertLessEqual(len(g.state()["history"]), 20)

        # 4) enfriar: restauración gradual, jamás por encima del perfil actual
        #    (balanced → pl2 58 / db 20; el valor previo era pl2 60 / db 25)
        g.set_temps(70, 60)
        g.wait(lambda: g.lines("restore"), "primer escalón de restauración", 4)
        prof_now = g.prof()
        if not g.lines("unboost"):   # (leído después del perfil → el perfil aún era el de emergencia)
            self.assertEqual(prof_now, "performance", "ventiladores no bajan hasta terminar")
        g.wait(lambda: g.prof() == "balanced" and not g.marker.exists(), "restauración completa", 6)
        g.wait(lambda: (g.db, g.pl2) == (20, 58), "valores restaurados al perfil", 2)
        news = [parse_line(l) for l in g.lines("restore")]
        self.assertGreaterEqual(len(news), 2, "restauración en varios escalones")
        self.assertTrue(all(n["pl2_new"] <= 58 and n["db_new"] <= 20 for n in news))
        self.assertIn(56, [n["pl2_new"] for n in news], "pasó por un escalón intermedio")
        g.wait(lambda: g.lines("unboost"), "decisión unboost en el journal")
        g.wait_state(lambda st: st["thermal_state"] == "normal", "estado vuelve a normal")

        # 5) sensor ausente: nunca corta ni restaura potencia; ventiladores arriba
        before = len(g.lines("cut"))
        g.set_temps("-", "-")
        g.wait(lambda: g.prof() == "performance", "failsafe: ventiladores arriba")
        g.wait(lambda: g.lines("hold", "sensor-ausente-ambos-failsafe"), "hold failsafe en el journal")
        g.settle(2.5)
        self.assertEqual((g.db, g.pl2), (20, 58))
        self.assertEqual(len(g.lines("cut")), before)
        g.set_temps("-", 60)   # solo falta uno, el otro frío: sigue sin tocar potencia
        g.wait(lambda: g.lines("hold", "sensor-ausente-failsafe"), "hold de un solo sensor ausente")
        g.settle(1.0)
        self.assertEqual((g.db, g.pl2, g.prof()), (20, 58, "performance"))
        g.set_temps(70, 60)    # vuelven ambos: tras la retención, perfil original
        g.wait(lambda: g.prof() == "balanced", "ventiladores vuelven al original", 4)
        self.assertEqual((g.db, g.pl2), (20, 58))

        # 6) SIGKILL a mitad de un recorte → el siguiente arranque restaura
        g.set_temps(95, 60)
        g.wait(lambda: g.marker.exists() and g.db < 20, "corte nuevo", 4)
        g.proc.kill()
        g.proc.wait()
        g.proc = None
        self.assertTrue(g.marker.exists())
        self.assertLess(g.db, 20, "tras el crash el límite queda reducido")
        g.set_temps(70, 60)
        g.start(dry=0)
        g.wait(lambda: g.db == 20 and not g.marker.exists() and g.prof() == "balanced",
               "restauración desde el marcador al arrancar", 4)
        g.wait(lambda: g.pl2 == 58, "PL2 restaurado desde el marcador", 2)
        self.assertIn("Marcador pre-recorte encontrado", g.log())
        self.assertEqual(g.stop(), 0)

    def test_profile_change_is_not_overwritten(self):
        """H2: si el usuario cambia de perfil durante un recorte, el guardián ni
        sube límites por encima del nuevo perfil ni pisa su perfil."""
        g = Rig(self)
        g.start(dry=0)
        g.set_temps(95, 60)
        g.wait(lambda: g.db <= 20, "primer corte", 3)
        # escritura atómica (como un cambio de perfil real): el guardián nunca
        # ve el fichero vacío entre truncar y escribir
        newp = g.profile.with_suffix(".new")
        newp.write_text("quiet\n")
        os.replace(newp, g.profile)              # el usuario/PPD cambia de perfil
        g.set_temps(70, 60)
        g.wait(lambda: not g.marker.exists(), "fin de episodio", 3)
        self.assertEqual(g.prof(), "quiet", "no se pisa el perfil del usuario")
        self.assertEqual(g.pl2, 60, "no se sube ni se baja PL2 (objetivo quiet 45 < actual)")
        self.assertEqual(g.db, 20)
        self.assertEqual(g.stop(), 0)

    def test_dry_run_changes_nothing(self):
        g = Rig(self)
        g.start(dry=1)
        g.set_temps(95, 60)
        g.wait(lambda: len(g.lines("cut")) >= 2, "dos cortes simulados", 3)
        g.set_temps(70, 60)
        g.wait(lambda: g.lines("restore"), "restauración simulada", 3)
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
        # el JSON se publica tras el journal: esperar al ciclo que lo refleja
        g.wait_state(lambda st: st["last_decision"]["values"]["sim"] == 1, "last_decision sim=1")
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
        g.settle(0.5)
        st = g.state()
        self.assertEqual((st["configured_mode"], st["guardian_mode"]), ("gaming", "protection"))
        g.set_temps(95, 60)
        g.wait_state(lambda st: st["guardian_mode"] == "gaming", "gaming efectivo con calor")
        g.wait(lambda: g.lines("hold", "gaming-solo-ventiladores"), "hold gaming en el journal")
        g.settle(2.5)
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
