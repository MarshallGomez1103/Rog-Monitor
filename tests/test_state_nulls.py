"""N-DEF-02 (S03-1b): un dato que no se pudo leer es `null`, nunca un `0`/`False`
que se confunde con una medida real (schema 1 intacto: los tipos de
tests/test_contract.py ya admiten null). 0 sigue siendo 0 cuando el dato existe.

Todo con árboles falsos en tmpdir; nada lee /sys ni /proc reales."""

import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from rog_monitor import app, cpu, power, sysinfo


def put(root: Path, rel: str, text: str) -> Path:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    return path


class CpuUnknownTests(unittest.TestCase):
    """cpu.hot90 / cpu.throttle_count: null sin sensores / sin sysfs de throttle."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name)
        self.throttle_files: list[str] = []

        def fake_glob(pattern, *a, **kw):  # nunca el /sys real
            return list(self.throttle_files) if pattern == cpu.THROTTLE_GLOB else []

        for patcher in (
            mock.patch.object(cpu.glob, "glob", fake_glob),
            mock.patch.object(cpu, "CPUFREQ", self.root / "cpufreq"),
            mock.patch.object(cpu.CpuReader, "_model_name", staticmethod(lambda: "CPU")),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

    def reader(self, chips=None):
        return cpu.CpuReader(chips or {}, stat_path=str(self.root / "no-stat"))

    def chip(self, temps_c):
        dev = self.root / "hwmon0"
        for i, c in enumerate(temps_c, 1):
            put(dev, f"temp{i}_input", f"{int(c * 1000)}\n")
            put(dev, f"temp{i}_label", f"Core {i - 1}\n")
        return {"coretemp": [dev]}

    def throttle(self, count, ms):
        d = self.root / "cpu0" / "thermal_throttle"
        files = []
        if count is not None:
            files.append(str(put(d, "package_throttle_count", f"{count}\n")))
        if ms is not None:
            put(d, cpu.THROTTLE_MS, f"{ms}\n")
        self.throttle_files = files or [str(d / "package_throttle_count")]

    def test_sin_sensores_hot90_es_null(self):
        r = self.reader().read()
        self.assertIsNone(r["hot90"])
        self.assertIsNone(r["avg"])

    def test_con_sensores_frios_hot90_cero_es_cero(self):
        r = self.reader(self.chip([55.0, 60.0])).read()
        self.assertEqual(r["hot90"], 0)
        self.assertIsNot(r["hot90"], None)

    def test_con_sensores_calientes_cuenta(self):
        r = self.reader(self.chip([95.0, 91.0, 70.0])).read()
        self.assertEqual(r["hot90"], 2)

    def test_sin_sysfs_de_throttle_es_null(self):
        r = self.reader().read()
        self.assertIsNone(r["throttle_count"])
        self.assertIsNone(r["throttle_ms"])
        # los deltas (alertas) siguen siendo numéricos: sin dato no hay evento
        self.assertEqual(r["throttle_delta"], 0)
        self.assertEqual(r["throttle_ms_delta"], 0)
        self.assertFalse(r["throttled_now"])

    def test_throttle_cero_legitimo_es_cero(self):
        self.throttle(0, 0)
        r = self.reader().read()
        self.assertEqual(r["throttle_count"], 0)
        self.assertEqual(r["throttle_ms"], 0)

    def test_throttle_con_dato_y_delta(self):
        self.throttle(5, 120)
        rd = self.reader()
        self.throttle(8, 300)
        r = rd.read()
        self.assertEqual((r["throttle_count"], r["throttle_ms"]), (8, 300))
        self.assertEqual((r["throttle_delta"], r["throttle_ms_delta"]), (3, 180))
        self.assertTrue(r["throttled_now"])

    def test_archivo_de_throttle_ilegible_es_null(self):
        path = put(self.root, "cpu0/thermal_throttle/package_throttle_count", "basura\n")
        self.throttle_files = [str(path)]
        self.assertIsNone(self.reader().read()["throttle_count"])

    def test_cpu_unavailable_usa_null(self):
        u = app._cpu_unavailable()
        self.assertIsNone(u["hot90"])
        self.assertIsNone(u["throttle_count"])
        self.assertIsNone(u["throttle_ms"])
        self.assertEqual((u["throttle_delta"], u["throttle_ms_delta"]), (0, 0))


NET_DEV = """Inter-|   Receive                            |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 9999999 10 0 0 0 0 0 0 9999999 10 0 0 0 0 0 0
  eth0: {rx} 10 0 0 0 0 0 0 {tx} 10 0 0 0 0 0 0
"""


class SysUnknownTests(unittest.TestCase):
    """sys.ram_*, uptime_*, rx/tx_mbps: null si la fuente /proc no se pudo leer."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.proc = Path(self._tmp.name) / "proc"
        self.proc.mkdir()
        self.clock = [100.0]
        patcher = mock.patch.object(sysinfo.time, "monotonic", lambda: self.clock[0])
        patcher.start()
        self.addCleanup(patcher.stop)
        # sin SMART real, DMI real ni loadavg real
        for obj, target, value in ((sysinfo, "_read_smart_file", {}), (sysinfo, "get_dmi", {}),
                                   (sysinfo.os, "getloadavg", (0.0, 0.0, 0.0))):
            p = mock.patch.object(obj, target, return_value=value)
            p.start()
            self.addCleanup(p.stop)

    def reader(self):
        return sysinfo.SysReader({}, proc_root=str(self.proc), sys_root=str(self.proc / "sys"))

    def write(self, name, text):
        put(self.proc, name, text)

    def meminfo(self, total=16_000_000, avail=8_000_000, swap_total=4_000_000, swap_free=3_000_000):
        self.write("meminfo",
                   f"MemTotal: {total} kB\nMemFree: 1000 kB\nMemAvailable: {avail} kB\n"
                   f"Buffers: 100 kB\nCached: 200 kB\nSwapTotal: {swap_total} kB\n"
                   f"SwapFree: {swap_free} kB\n")

    def test_meminfo_ilegible_ram_y_swap_son_null(self):
        r = self.reader().read()
        for key in ("ram_total_gb", "ram_used_gb", "ram_percent", "ram_available_gb",
                    "ram_buffers_gb", "ram_cached_gb", "swap_used_gb", "swap_total_gb",
                    "swap_percent"):
            self.assertIsNone(r[key], key)

    def test_meminfo_basura_es_null(self):
        self.write("meminfo", "MemTotal: nada kB\n")
        r = self.reader().read()
        self.assertIsNone(r["ram_total_gb"])
        self.assertIsNone(r["ram_percent"])

    def test_meminfo_legible_conserva_valores(self):
        self.meminfo()
        r = self.reader().read()
        self.assertEqual(r["ram_percent"], 50)
        self.assertAlmostEqual(r["ram_total_gb"], 16_000_000 / 1048576)
        self.assertEqual(r["swap_percent"], 25)

    def test_sin_swap_es_cero_real_no_null(self):
        self.meminfo(swap_total=0, swap_free=0)
        r = self.reader().read()
        self.assertEqual(r["swap_total_gb"], 0)
        self.assertEqual(r["swap_used_gb"], 0)
        self.assertIsNone(r["swap_percent"])

    def test_uptime_ilegible_es_null(self):
        r = self.reader().read()
        self.assertIsNone(r["uptime_s"])
        self.assertIsNone(r["uptime_h"])
        self.write("uptime", "basura\n")
        r = self.reader().read()
        self.assertIsNone(r["uptime_s"])
        self.assertIsNone(r["uptime_h"])

    def test_uptime_legible_y_cero_es_cero(self):
        self.write("uptime", "7200.5 100.0\n")
        r = self.reader().read()
        self.assertEqual(r["uptime_s"], 7200.5)
        self.assertAlmostEqual(r["uptime_h"], 7200.5 / 3600)
        self.write("uptime", "0.0 0.0\n")
        self.assertEqual(self.reader().read()["uptime_s"], 0.0)

    def test_red_sin_proc_net_dev_es_null(self):
        rd = self.reader()
        self.clock[0] += 2
        r = rd.read()
        self.assertIsNone(r["rx_mbps"])
        self.assertIsNone(r["tx_mbps"])

    def test_red_con_delta_real(self):
        self.write("net/dev", NET_DEV.format(rx=1_000_000, tx=0))
        rd = self.reader()
        self.write("net/dev", NET_DEV.format(rx=3_500_000, tx=250_000))
        self.clock[0] += 2
        r = rd.read()
        self.assertAlmostEqual(r["rx_mbps"], 2_500_000 * 8 / 1e6 / 2)
        self.assertAlmostEqual(r["tx_mbps"], 250_000 * 8 / 1e6 / 2)

    def test_red_quieta_es_cero_real(self):
        self.write("net/dev", NET_DEV.format(rx=500, tx=500))
        rd = self.reader()
        self.clock[0] += 2
        r = rd.read()
        self.assertEqual((r["rx_mbps"], r["tx_mbps"]), (0.0, 0.0))

    def test_red_primera_muestra_sin_dt_util_es_null_y_no_avanza_la_base(self):
        """Lectura casi inmediata al construir (TUI): un delta en ~ms daría picos
        absurdos; null y la base se conserva para el siguiente tick."""
        self.write("net/dev", NET_DEV.format(rx=0, tx=0))
        rd = self.reader()
        self.write("net/dev", NET_DEV.format(rx=4_000_000, tx=0))
        self.clock[0] += 0.001
        r = rd.read()
        self.assertIsNone(r["rx_mbps"])
        self.assertIsNone(r["tx_mbps"])
        self.clock[0] += 1.999
        r = rd.read()
        self.assertAlmostEqual(r["rx_mbps"], 4_000_000 * 8 / 1e6 / 2)

    def test_red_sin_base_inicial_arranca_en_la_segunda_lectura(self):
        rd = self.reader()                       # /proc/net/dev ilegible al construir
        self.write("net/dev", NET_DEV.format(rx=1_000_000, tx=1_000_000))
        self.clock[0] += 2
        r = rd.read()                            # hay lectura pero no base: sin delta
        self.assertIsNone(r["rx_mbps"])
        self.write("net/dev", NET_DEV.format(rx=2_000_000, tx=1_000_000))
        self.clock[0] += 1
        r = rd.read()
        self.assertAlmostEqual(r["rx_mbps"], 8.0)
        self.assertEqual(r["tx_mbps"], 0.0)

    def test_red_contador_que_baja_es_cero_no_negativo(self):
        self.write("net/dev", NET_DEV.format(rx=5_000_000, tx=5_000_000))
        rd = self.reader()
        self.write("net/dev", NET_DEV.format(rx=10, tx=10))
        self.clock[0] += 2
        r = rd.read()
        self.assertEqual((r["rx_mbps"], r["tx_mbps"]), (0.0, 0.0))

    def test_red_se_cae_a_mitad_es_null_y_recupera(self):
        self.write("net/dev", NET_DEV.format(rx=1_000_000, tx=0))
        rd = self.reader()
        (self.proc / "net" / "dev").unlink()
        self.clock[0] += 2
        self.assertIsNone(rd.read()["rx_mbps"])
        self.write("net/dev", NET_DEV.format(rx=3_000_000, tx=0))
        self.clock[0] += 2
        self.assertAlmostEqual(rd.read()["rx_mbps"], 2_000_000 * 8 / 1e6 / 4)


class ReasonCodeTests(unittest.TestCase):
    def test_lector_de_vram_caido_tiene_codigo_estable(self):
        u = app._vram_unavailable()
        self.assertEqual(u["reason_code"], "reader_unavailable")
        self.assertEqual(u["reason"], "lector no disponible")   # compatibilidad
        self.assertFalse(u["available"])

    def test_contrato_procs_vram_es_aditivo(self):
        """schema 1: `reason` se conserva; `reason_code` es una clave nueva (str|null)."""
        u = app._vram_unavailable()
        self.assertEqual(set(u), {"available", "reason", "reason_code", "vendor", "procs"})


if __name__ == "__main__":
    unittest.main()
