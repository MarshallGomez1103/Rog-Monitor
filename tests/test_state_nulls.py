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


if __name__ == "__main__":
    unittest.main()
