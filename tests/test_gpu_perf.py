"""CP-2.06/2.08: NVML en vez de nvidia-smi, dGPU dormida intacta, cachés con TTL."""

import shutil
import threading
import time
import unittest
from pathlib import Path
from unittest import mock

from rog_monitor import gpu, gpu_clocks, power
from rog_monitor.cached import Cached

SMI_LINE = "NVIDIA GeForce RTX 4060 Laptop GPU, 54, 31, 3.65, 82, 8188, 240, 405, 3.60"
NVML_DICT = {
    "name": "NVIDIA GeForce RTX 4060 Laptop GPU", "temp": 54.0, "util": 31.0,
    "power": 3.6, "vram_used": 82.0, "vram_total": 8188.0,
    "clock_mhz": 240.0, "vram_clock_mhz": 405.0,
}


def _reader(which=("nvidia-smi",), pci=()):
    with mock.patch.object(gpu.shutil, "which", lambda n: n if n in which else None), \
            mock.patch.object(gpu, "_nvidia_pci", lambda: list(pci)), \
            mock.patch.object(gpu, "_run", return_value=None):
        return gpu.GpuReader({})


def _smi_run(cmd, timeout=4.0):
    if "--help-query-gpu" in cmd:
        return "power.draw.average"
    return SMI_LINE


def _shape(d):
    return {k: type(v).__name__ for k, v in d.items()}


class NvmlVsSmi(unittest.TestCase):
    def test_same_keys_and_types(self):
        r = _reader()
        with mock.patch.object(gpu_clocks, "read_telemetry", return_value=NVML_DICT):
            via_nvml = r._read_nvidia()
        r2 = _reader()
        r2._nvml_ok = False
        with mock.patch.object(gpu, "_run", _smi_run):
            via_smi = r2._read_nvidia()
        self.assertEqual(list(via_nvml), list(via_smi))
        self.assertEqual(_shape(via_nvml), _shape(via_smi))

    def test_fallback_to_smi_without_nvml(self):
        r = _reader()
        with mock.patch.object(gpu_clocks, "read_telemetry", side_effect=OSError("no lib")), \
                mock.patch.object(gpu, "_run", _smi_run):
            self.assertEqual(r._read_nvidia()["power"], 3.6)
        self.assertFalse(r._nvml_ok)

    @unittest.skipUnless(shutil.which("nvidia-smi"), "sin nvidia-smi")
    def test_live_shape(self):
        try:
            live = gpu_clocks.read_telemetry()
        except (OSError, gpu_clocks.NvmlError):
            self.skipTest("NVML no disponible")
        r = _reader()
        r._nvml_ok = False
        smi = r._read_nvidia()
        if smi is None:
            self.skipTest("nvidia-smi no respondió")
        self.assertEqual(_shape(live), _shape({k: v for k, v in smi.items() if k != "vendor"}))


class SleepingDgpu(unittest.TestCase):
    def test_runtime_suspended_is_not_touched(self):
        with mock.patch.object(gpu.hwmon, "read_str", return_value="suspended"):
            r = _reader(pci=[Path("/sys/bus/pci/devices/0000:01:00.0")])
            with mock.patch.object(gpu_clocks, "read_telemetry") as nvml, \
                    mock.patch.object(gpu, "_run") as run:
                self.assertIsNone(r._read_nvidia())
                self.assertFalse(r.vram_processes({"vendor": "nvidia"})["available"])
        nvml.assert_not_called()
        run.assert_not_called()

    def test_active_is_read(self):
        with mock.patch.object(gpu.hwmon, "read_str", return_value="active"):
            r = _reader(pci=[Path("/x")])
            with mock.patch.object(gpu_clocks, "read_telemetry", return_value=NVML_DICT):
                self.assertEqual(r._read_nvidia()["vendor"], "nvidia")


class CachedTtl(unittest.TestCase):
    def test_stale_while_error_and_backoff(self):
        vals = iter(["a", None, None, None])
        c = Cached(lambda: next(vals), ttl=0.01, backoff_max=0.04)
        self.assertEqual(c.get(), "a")
        for _ in range(3):
            time.sleep(0.06)
            c.get()
            time.sleep(0.02)
        self.assertEqual(c.get(), "a")  # el valor viejo sobrevive a los fallos
        self.assertEqual(c._fails, 3)
        self.assertLessEqual(c._due - time.monotonic(), 0.04)

    def test_get_never_blocks_after_first(self):
        gate = threading.Event()
        calls = []

        def slow():
            calls.append(1)
            if len(calls) > 1:
                gate.wait(2)
            return len(calls)

        c = Cached(slow, ttl=0)
        self.assertEqual(c.get(), 1)
        t0 = time.monotonic()
        self.assertEqual(c.get(), 1)  # lanza refresco lento en hilo y devuelve ya
        self.assertEqual(c.get(), 1)  # no apila un segundo refresco
        self.assertLess(time.monotonic() - t0, 0.2)
        gate.set()
        time.sleep(0.1)
        self.assertEqual(len(calls), 2)

    def test_ppd_busctl_ttl(self):
        out = mock.Mock(stdout='s "performance"\n')
        with mock.patch.object(power, "_PPD", Cached(power._read_ppd, ttl=3.0)), \
                mock.patch.object(power.subprocess, "run", return_value=out) as run:
            for _ in range(5):
                self.assertEqual(power.ppd_profile(), "performance")
        self.assertEqual(run.call_count, 1)

    def test_supergfx_ttl_and_backoff(self):
        with mock.patch.object(gpu.shutil, "which", lambda n: n if n == "supergfxctl" else None), \
                mock.patch.object(gpu, "_nvidia_pci", lambda: []), \
                mock.patch.object(gpu, "_run", return_value=None):
            r = gpu.GpuReader({})
        self.assertEqual((r._sg.ttl, r._sg.backoff_max), (10.0, 120.0))
        with mock.patch.object(gpu, "_run", return_value="Hybrid") as run:
            self.assertEqual(r.mode_info()["mode"], "Hybrid")
            n = run.call_count
            for _ in range(5):
                r.mode_info()
            self.assertEqual(run.call_count, n)  # dentro del TTL no hay spawns


if __name__ == "__main__":
    unittest.main()
