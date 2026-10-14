"""N-B-06: power.py (RAPL, batería, AC, platform_profile, PPD) sobre sysfs falso.

Nada toca /sys real: los glob de power.py se redirigen a un tmpdir y el reloj /
subproceso de busctl se sustituyen por dobles. Sin D-Bus, sin sudo.
"""

from __future__ import annotations

import glob as _glob_mod
import os
import subprocess
import tempfile
import threading
import types
import unittest
from pathlib import Path
from unittest import mock

from rog_monitor import cached, power

_REAL_GLOB = _glob_mod.glob  # antes de que setUp parchee glob.glob


class FakeClock:
    def __init__(self, start: float = 1000.0):
        self.now = start

    def monotonic(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


class FakeSysfsCase(unittest.TestCase):
    """Raíz falsa: cualquier glob que power.py haga sobre /sys cae en tmpdir."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name)

        def fake_glob(pattern):
            self.assertTrue(pattern.startswith("/sys/"), pattern)
            return _REAL_GLOB(str(self.root) + pattern)

        patcher = mock.patch.object(power.glob, "glob", fake_glob)
        patcher.start()
        self.addCleanup(patcher.stop)

    def put(self, rel: str, content: str = "") -> Path:
        path = self.root / rel.lstrip("/")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        return path


class RaplReaderTests(FakeSysfsCase):
    def _rapl(self, energy="5000000", name="package-0", max_range="262143328850"):
        self.put("sys/class/powercap/intel-rapl:0/name", name + "\n")
        if energy is not None:
            self.put("sys/class/powercap/intel-rapl:0/energy_uj", energy + "\n")
        if max_range is not None:
            self.put("sys/class/powercap/intel-rapl:0/max_energy_range_uj", max_range + "\n")

    def test_sin_archivos_no_disponible(self):
        reader = power.RaplReader()
        self.assertFalse(reader.available)
        self.assertIsNone(reader.read_watts())

    def test_dominio_que_no_es_package_se_ignora(self):
        self._rapl(name="core")
        self.assertFalse(power.RaplReader().available)

    def test_package_sin_energy_uj(self):
        self._rapl(energy=None)
        self.assertFalse(power.RaplReader().available)

    def test_energy_uj_ilegible_no_numerico(self):
        self._rapl(energy="no-es-numero")
        self.assertFalse(power.RaplReader().available)

    def test_energy_uj_es_directorio_se_trata_como_denegado(self):
        self._rapl(energy=None)
        (self.root / "sys/class/powercap/intel-rapl:0/energy_uj").mkdir()
        self.assertFalse(power.RaplReader().available)

    @unittest.skipIf(os.geteuid() == 0, "root ignora los permisos de archivo")
    def test_permiso_denegado(self):
        self._rapl()
        energy = self.root / "sys/class/powercap/intel-rapl:0/energy_uj"
        energy.chmod(0o000)
        self.addCleanup(energy.chmod, 0o600)
        reader = power.RaplReader()
        self.assertFalse(reader.available)
        self.assertIsNone(reader.read_watts())

    def test_vatios_entre_dos_lecturas(self):
        self._rapl(energy="5000000")
        clock = FakeClock()
        with mock.patch.object(power, "time", clock):
            reader = power.RaplReader()
            self.assertTrue(reader.available)
            self.assertEqual(reader.max_range, 262143328850)
            self.assertIsNone(reader.read_watts())  # primera muestra: sin delta
            clock.advance(2.0)
            self.put("sys/class/powercap/intel-rapl:0/energy_uj", "35000000")
            # 30 J en 2 s = 15 W
            self.assertEqual(reader.read_watts(), 15.0)

    def test_wrap_de_contador_usa_max_range(self):
        self._rapl(energy="999000000", max_range="1000000000")
        clock = FakeClock()
        with mock.patch.object(power, "time", clock):
            reader = power.RaplReader()
            reader.read_watts()
            clock.advance(1.0)
            # retrocede: 999_000_000 -> 9_000_000 con tope 1_000_000_000
            # delta = 9e6 - 999e6 + 1e9 = 10e6 µJ = 10 J en 1 s
            self.put("sys/class/powercap/intel-rapl:0/energy_uj", "9000000")
            self.assertEqual(reader.read_watts(), 10.0)

    def test_retroceso_sin_max_range_descarta_la_muestra(self):
        self._rapl(energy="900000000", max_range=None)
        clock = FakeClock()
        with mock.patch.object(power, "time", clock):
            reader = power.RaplReader()
            self.assertIsNone(reader.max_range)
            reader.read_watts()
            clock.advance(1.0)
            self.put("sys/class/powercap/intel-rapl:0/energy_uj", "1000000")
            self.assertIsNone(reader.read_watts())
            # y la siguiente muestra ya parte de la nueva base
            clock.advance(1.0)
            self.put("sys/class/powercap/intel-rapl:0/energy_uj", "4000000")
            self.assertEqual(reader.read_watts(), 3.0)

    def test_misma_marca_de_tiempo_no_divide_por_cero(self):
        self._rapl(energy="1000000")
        clock = FakeClock()
        with mock.patch.object(power, "time", clock):
            reader = power.RaplReader()
            reader.read_watts()
            self.put("sys/class/powercap/intel-rapl:0/energy_uj", "9000000")
            self.assertIsNone(reader.read_watts())  # now == last_ts

    def test_lectura_que_falla_despues_devuelve_none(self):
        self._rapl(energy="1000000")
        reader = power.RaplReader()
        self.put("sys/class/powercap/intel-rapl:0/energy_uj", "basura")
        self.assertIsNone(reader.read_watts())


class PlatformProfileTests(unittest.TestCase):
    def test_lee_y_recorta(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "platform_profile"
            path.write_text("balanced\n")
            with mock.patch.object(power, "PLATFORM_PROFILE", path):
                self.assertEqual(power.asus_profile(), "balanced")

    def test_ausente_es_none(self):
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.object(power, "PLATFORM_PROFILE", Path(tmp) / "no-existe"):
                self.assertIsNone(power.asus_profile())


class BatteryReaderTests(FakeSysfsCase):
    BAT = "sys/class/power_supply/BAT0"

    def bat(self, **attrs):
        for name, value in attrs.items():
            self.put(f"{self.BAT}/{name}", f"{value}\n")

    def test_sin_bateria(self):
        reader = power.BatteryReader()
        self.assertIsNone(reader.path)
        self.assertEqual(reader.ac_paths, [])
        self.assertIsNone(reader.read())

    def test_energy_con_potencia_directa(self):
        self.bat(capacity=76, status="Discharging", power_now=18_500_000,
                 charge_control_end_threshold=80, cycle_count=212,
                 energy_full=79_898_000, energy_full_design=90_001_000,
                 energy_now=60_725_000)
        data = power.BatteryReader().read()
        self.assertEqual(data["capacity"], 76)
        self.assertEqual(data["status"], "Discharging")
        self.assertEqual(data["watts"], 18.5)
        self.assertEqual(data["charge_limit"], 80)
        self.assertEqual(data["cycle_count"], 212)
        self.assertEqual(data["energy_full_wh"], 79.9)
        self.assertEqual(data["energy_full_design_wh"], 90.0)
        self.assertEqual(data["energy_now_wh"], 60.73)
        self.assertEqual(data["health_percent"], 88.8)
        self.assertFalse(data["on_ac"])

    def test_potencia_cero_es_valida_no_none(self):
        self.bat(capacity=100, status="Full", power_now=0)
        self.assertEqual(power.BatteryReader().read()["watts"], 0.0)

    def test_potencia_se_deriva_de_corriente_y_voltaje(self):
        self.bat(capacity=50, status="Discharging",
                 current_now=1_500_000, voltage_now=15_000_000)
        # 1.5 A * 15 V = 22.5 W
        self.assertEqual(power.BatteryReader().read()["watts"], 22.5)

    def test_corriente_cero_sin_potencia_da_none(self):
        self.bat(capacity=50, current_now=0, voltage_now=15_000_000)
        self.assertIsNone(power.BatteryReader().read()["watts"])

    def test_sin_ningun_dato_de_potencia(self):
        self.bat(capacity=50)
        self.assertIsNone(power.BatteryReader().read()["watts"])

    def test_atributos_ausentes_son_none(self):
        self.bat(capacity=50)
        data = power.BatteryReader().read()
        for key in ("status", "charge_limit", "cycle_count", "energy_full_wh",
                    "energy_full_design_wh", "energy_now_wh", "health_percent"):
            self.assertIsNone(data[key], key)

    def test_energy_full_design_cero_no_divide(self):
        self.bat(capacity=50, energy_full=50_000_000, energy_full_design=0)
        data = power.BatteryReader().read()
        self.assertIsNone(data["health_percent"])
        self.assertEqual(data["energy_full_wh"], 50.0)

    def test_usa_la_primera_bateria_ordenada(self):
        self.put("sys/class/power_supply/BAT1/capacity", "10\n")
        self.bat(capacity=90)
        reader = power.BatteryReader()
        self.assertEqual(reader.path.name, "BAT0")
        self.assertEqual(reader.read()["capacity"], 90)

    def test_adaptador_ac_presente_online(self):
        self.bat(capacity=90)
        self.put("sys/class/power_supply/ADP1/online", "1\n")
        reader = power.BatteryReader()
        self.assertEqual(len(reader.ac_paths), 1)
        self.assertTrue(reader.read()["on_ac"])

    def test_adaptador_ac_offline(self):
        self.bat(capacity=90)
        self.put("sys/class/power_supply/ADP1/online", "0\n")
        self.assertFalse(power.BatteryReader().read()["on_ac"])

    def test_adaptador_con_nombre_AC(self):
        self.bat(capacity=90)
        self.put("sys/class/power_supply/AC0/online", "1\n")
        self.assertTrue(power.BatteryReader().read()["on_ac"])

    def test_sin_adaptador_ac_no_esta_en_corriente(self):
        self.bat(capacity=90)
        reader = power.BatteryReader()
        self.assertEqual(reader.ac_paths, [])
        self.assertFalse(reader.read()["on_ac"])

    def test_dos_adaptadores_basta_uno_online(self):
        self.bat(capacity=90)
        self.put("sys/class/power_supply/ADP0/online", "0\n")
        self.put("sys/class/power_supply/AC0/online", "1\n")
        self.assertTrue(power.BatteryReader().read()["on_ac"])


class PpdProfileTests(unittest.TestCase):
    """busctl con runner parcheado; reloj y hilo de Cached falsos."""

    def setUp(self):
        self.clock = FakeClock()
        self.calls: list[list[str]] = []

        class SyncThread:
            def __init__(self, target=None, daemon=None):
                self.target = target

            def start(self):
                self.target()

        fake_threading = types.SimpleNamespace(Thread=SyncThread, Lock=threading.Lock)
        for name, obj in (("time", self.clock), ("threading", fake_threading)):
            patcher = mock.patch.object(cached, name, obj)
            patcher.start()
            self.addCleanup(patcher.stop)

    def runner(self, outputs):
        """Devuelve un subprocess.run falso que consume `outputs` en orden.
        Un elemento Exception se lanza; un str es el stdout de busctl."""
        queue = list(outputs)

        def fake_run(cmd, **kwargs):
            self.calls.append(cmd)
            self.assertIs(kwargs.get("stdin"), subprocess.DEVNULL)
            item = queue.pop(0)
            if isinstance(item, Exception):
                raise item
            return subprocess.CompletedProcess(cmd, 0, stdout=item, stderr="")

        return fake_run

    def test_read_ppd_parsea_la_salida_de_busctl(self):
        with mock.patch.object(power.subprocess, "run", self.runner(['s "performance"\n'])):
            self.assertEqual(power._read_ppd(), "performance")
        self.assertEqual(self.calls[0][:3], ["busctl", "--system", "get-property"])
        self.assertEqual(self.calls[0][-1], "ActiveProfile")

    def test_read_ppd_salida_sin_comillas_es_none(self):
        with mock.patch.object(power.subprocess, "run", self.runner(["basura sin comillas\n"])):
            self.assertIsNone(power._read_ppd())

    def test_read_ppd_busctl_ausente(self):
        with mock.patch.object(power.subprocess, "run", self.runner([FileNotFoundError("busctl")])):
            self.assertIsNone(power._read_ppd())

    def test_read_ppd_timeout(self):
        err = subprocess.TimeoutExpired(["busctl"], 1)
        with mock.patch.object(power.subprocess, "run", self.runner([err])):
            self.assertIsNone(power._read_ppd())

    def test_read_ppd_codigo_de_salida_distinto_de_cero(self):
        err = subprocess.CalledProcessError(1, ["busctl"])
        with mock.patch.object(power.subprocess, "run", self.runner([err])):
            self.assertIsNone(power._read_ppd())

    def test_ppd_profile_cache_ttl_y_valor_stale_si_falla(self):
        fresh = cached.Cached(power._read_ppd, ttl=3.0)
        run = self.runner(['s "balanced"\n', 's "power-saver"\n', OSError("dbus caído")])
        with mock.patch.object(power, "_PPD", fresh), \
                mock.patch.object(power.subprocess, "run", run):
            self.assertEqual(power.ppd_profile(), "balanced")
            self.assertEqual(len(self.calls), 1)

            self.clock.advance(2.0)  # dentro del TTL: no relee
            self.assertEqual(power.ppd_profile(), "balanced")
            self.assertEqual(len(self.calls), 1)

            self.clock.advance(1.5)  # vencido: relee (hilo falso síncrono)
            power.ppd_profile()
            self.assertEqual(len(self.calls), 2)
            self.assertEqual(power.ppd_profile(), "power-saver")

            self.clock.advance(3.5)  # busctl falla: se conserva el último bueno
            power.ppd_profile()
            self.assertEqual(len(self.calls), 3)
            self.assertEqual(power.ppd_profile(), "power-saver")


if __name__ == "__main__":
    unittest.main()
