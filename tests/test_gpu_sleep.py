"""N-B-07: gpu.py y gpu_clocks.py sin GPU: NVML simulado, D3cold, nvidia-smi falso.

Reglas: nunca se carga libnvidia-ml real, nunca se ejecuta nvidia-smi ni
supergfxctl, nunca se lee el /sys real (PCI/hwmon van a un tmpdir) y una dGPU
en runtime-suspend no se despierta (los dobles fallan si alguien los llama).
"""

from __future__ import annotations

import contextlib
import ctypes
import glob as _glob_mod
import io
import json
import subprocess
import tempfile
import threading
import types
import unittest
from pathlib import Path
from unittest import mock

from rog_monitor import cached, gpu, gpu_clocks

_REAL_GLOB = _glob_mod.glob  # antes de que ningún setUp parchee glob.glob
_REAL_LOAD_NVML = gpu_clocks._load_nvml  # el guard de módulo lo sustituye

SMI_LINE = "NVIDIA GeForce RTX 4060 Laptop GPU, 54, 31, 3.65, 82, 8188, 240, 405, 3.60"


class FakeClock:
    def __init__(self, start: float = 5000.0):
        self.now = start

    def monotonic(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


class SyncThread:
    """Hilo falso que ejecuta el objetivo en start(): Cached determinista."""

    def __init__(self, target=None, daemon=None):
        self.target = target

    def start(self):
        self.target()


def fake_cached_env(case: unittest.TestCase, clock: FakeClock) -> None:
    ns = types.SimpleNamespace(Thread=SyncThread, Lock=threading.Lock)
    for name, obj in (("time", clock), ("threading", ns)):
        patcher = mock.patch.object(cached, name, obj)
        patcher.start()
        case.addCleanup(patcher.stop)


def make_reader(which=(), pci=(), chips=None, enabled=True, run=None):
    """GpuReader sin tocar el sistema: which, PCI y _run quedan falsos."""
    with mock.patch.object(gpu.shutil, "which", lambda n: n if n in which else None), \
            mock.patch.object(gpu, "_nvidia_pci", lambda: list(pci)), \
            mock.patch.object(gpu, "_run", run or (lambda *a, **k: None)):
        return gpu.GpuReader(chips or {}, enabled=enabled)


_GUARDS = []


def setUpModule():
    """Red de seguridad: ningún test puede cargar la libnvidia-ml real ni lanzar
    subprocesos; los tests que los necesitan los parchean explícitamente."""
    for target, name in ((gpu_clocks, "_load_nvml"), (gpu.subprocess, "run"),
                         (gpu.subprocess, "Popen")):
        patcher = mock.patch.object(target, name, forbid(f"{name} real"))
        patcher.start()
        _GUARDS.append(patcher)


def tearDownModule():
    while _GUARDS:
        _GUARDS.pop().stop()


def forbid(name):
    def boom(*args, **kwargs):
        raise AssertionError(f"{name} no debe llamarse aquí (dGPU dormida o test aislado)")
    return boom


# ---------------------------------------------------------------------------
# gpu.py
# ---------------------------------------------------------------------------


class RunHelperTests(unittest.TestCase):
    def test_devuelve_stdout_recortado_y_cierra_stdin(self):
        seen = {}

        def fake_run(cmd, **kwargs):
            seen.update(kwargs, cmd=cmd)
            return subprocess.CompletedProcess(cmd, 0, stdout="  Hybrid\n", stderr="")

        with mock.patch.object(gpu.subprocess, "run", fake_run):
            self.assertEqual(gpu._run(["supergfxctl", "-g"], timeout=1.5), "Hybrid")
        self.assertIs(seen["stdin"], subprocess.DEVNULL)
        self.assertEqual(seen["timeout"], 1.5)
        self.assertTrue(seen["check"])

    def test_timeout_oserror_y_rc_distinto_de_cero_dan_none(self):
        for exc in (subprocess.TimeoutExpired(["x"], 2), FileNotFoundError("x"),
                    subprocess.CalledProcessError(1, ["x"])):
            with mock.patch.object(gpu.subprocess, "run", side_effect=exc):
                self.assertIsNone(gpu._run(["x"]), type(exc).__name__)

    def test_num(self):
        self.assertEqual(gpu._num("54"), 54.0)
        self.assertEqual(gpu._num(" 3.65 "), 3.65)
        for bad in ("[N/A]", "", None, "abc"):
            self.assertIsNone(gpu._num(bad), repr(bad))


class FakePciCase(unittest.TestCase):
    """Árbol /sys/bus/pci/devices falso en tmpdir (glob redirigido)."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name)

        def fake_glob(pattern):
            self.assertTrue(pattern.startswith("/sys/"), pattern)
            return _REAL_GLOB(str(self.root) + pattern)

        patcher = mock.patch.object(gpu.glob, "glob", fake_glob)
        patcher.start()
        self.addCleanup(patcher.stop)

    def pci(self, addr, vendor, klass, runtime=None) -> Path:
        base = self.root / "sys/bus/pci/devices" / addr
        (base / "power").mkdir(parents=True, exist_ok=True)
        (base / "vendor").write_text(vendor + "\n")
        (base / "class").write_text(klass + "\n")
        if runtime is not None:
            (base / "power/runtime_status").write_text(runtime + "\n")
        return base

    def set_runtime(self, base: Path, status: str) -> None:
        (base / "power/runtime_status").write_text(status + "\n")


class NvidiaPciScanTests(FakePciCase):
    def test_solo_nvidia_de_clase_display(self):
        gpu_fn = self.pci("0000:01:00.0", "0x10de", "0x030000")
        self.pci("0000:01:00.1", "0x10de", "0x040300")   # audio HDMI de la dGPU
        self.pci("0000:00:02.0", "0x8086", "0x030000")   # iGPU Intel
        found = gpu._nvidia_pci()
        self.assertEqual(found, [Path(str(gpu_fn))])

    def test_sin_dispositivos(self):
        self.assertEqual(gpu._nvidia_pci(), [])


class SleepingDgpuNeverWakes(FakePciCase):
    """D3cold / runtime-suspend: ni NVML ni nvidia-smi ni subprocess alguno."""

    def setUp(self):
        super().setUp()
        self.dev = self.pci("0000:01:00.0", "0x10de", "0x030000", runtime="suspended")
        with mock.patch.object(gpu.shutil, "which",
                               lambda n: n if n == "nvidia-smi" else None), \
                mock.patch.object(gpu, "_run", lambda *a, **k: None):
            self.reader = gpu.GpuReader({})
        for target, name in ((gpu_clocks, "read_telemetry"),
                             (gpu_clocks, "read_vram_processes"),
                             (gpu_clocks, "_load_nvml"),
                             (gpu_clocks, "_session"),
                             (gpu, "_run"),
                             (gpu.subprocess, "run"),
                             (gpu.subprocess, "Popen"),
                             (ctypes, "CDLL")):
            patcher = mock.patch.object(target, name, forbid(name))
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_el_reader_detecta_la_dgpu_dormida(self):
        self.assertEqual(self.reader._nvidia_pci, [Path(str(self.dev))])
        self.assertTrue(self.reader._dgpu_asleep())

    def test_read_completo_no_toca_nada(self):
        for status in ("suspended", "suspending"):
            self.set_runtime(self.dev, status)
            info = self.reader.read()
            self.assertIsNone(info["active"], status)
            self.assertEqual(info["mode"], None)

    def test_read_nvidia_y_vram_no_la_despiertan(self):
        self.assertIsNone(self.reader._read_nvidia())
        out = self.reader.vram_processes({"vendor": "nvidia"})
        self.assertFalse(out["available"])
        self.assertEqual(out["procs"], [])
        self.assertEqual(out["vendor"], "nvidia")
        self.assertIn("no está activa", out["reason"])
        # y tampoco con active=None
        self.assertFalse(self.reader.vram_processes()["available"])

    def test_al_despertar_si_se_lee_nvml(self):
        self.set_runtime(self.dev, "active")
        telemetry = {"name": "RTX", "temp": 50.0, "util": 1.0, "power": 5.0,
                     "vram_used": 10.0, "vram_total": 8000.0,
                     "clock_mhz": 210.0, "vram_clock_mhz": 405.0}
        with mock.patch.object(gpu_clocks, "read_telemetry", return_value=telemetry) as nvml:
            out = self.reader._read_nvidia()
        nvml.assert_called_once_with()
        self.assertEqual(out["vendor"], "nvidia")
        self.assertEqual(out["name"], "RTX")

    def test_runtime_status_ausente_o_ilegible_no_cuenta_como_dormida(self):
        (self.dev / "power/runtime_status").unlink()
        self.assertFalse(self.reader._dgpu_asleep())


class ReadNvidiaPathsTests(unittest.TestCase):
    NVML = {"name": "RTX", "temp": 54.0, "util": 31.0, "power": 3.6,
            "vram_used": 82.0, "vram_total": 8188.0,
            "clock_mhz": 240.0, "vram_clock_mhz": 405.0}

    def setUp(self):
        self.clock = FakeClock()
        patcher = mock.patch.object(gpu, "time", self.clock)
        patcher.start()
        self.addCleanup(patcher.stop)

    def smi_runner(self, *, avg=True, line=SMI_LINE, calls=None):
        def run(cmd, timeout=4.0):
            if calls is not None:
                calls.append((cmd, timeout))
            if "--help-query-gpu" in cmd:
                return "power.draw.average" if avg else "power.draw"
            return line
        return run

    def test_nvml_ok_prefijo_vendor(self):
        r = make_reader(which=("nvidia-smi",))
        with mock.patch.object(gpu_clocks, "read_telemetry", return_value=self.NVML), \
                mock.patch.object(gpu, "_run", forbid("nvidia-smi")):
            out = r._read_nvidia()
        self.assertEqual(out, {"vendor": "nvidia", **self.NVML})

    def test_sin_nvml_cae_a_smi_y_deja_de_reintentar_nvml(self):
        r = make_reader(which=("nvidia-smi",))
        telemetry = mock.Mock(side_effect=OSError("sin libnvidia-ml"))
        with mock.patch.object(gpu_clocks, "read_telemetry", telemetry), \
                mock.patch.object(gpu, "_run", self.smi_runner()):
            first = r._read_nvidia()
            second = r._read_nvidia()
        self.assertEqual(first["power"], 3.6)       # power.draw.average (col. 8)
        self.assertEqual(first["name"], "NVIDIA GeForce RTX 4060 Laptop GPU")
        self.assertEqual(first["vram_total"], 8188.0)
        self.assertEqual(first["clock_mhz"], 240.0)
        self.assertEqual(first["vram_clock_mhz"], 405.0)
        self.assertEqual(second["power"], 3.6)
        self.assertFalse(r._nvml_ok)
        telemetry.assert_called_once_with()          # NVML ya no se reintenta

    def test_nvml_error_de_init_prueba_smi_sin_desactivar_nvml(self):
        r = make_reader(which=("nvidia-smi",))
        with mock.patch.object(gpu_clocks, "read_telemetry",
                               side_effect=gpu_clocks.NvmlError(999, "init")), \
                mock.patch.object(gpu, "_run", self.smi_runner()):
            self.assertEqual(r._read_nvidia()["temp"], 54.0)
        self.assertTrue(r._nvml_ok)

    def test_atributeerror_de_simbolo_tambien_cae_a_smi(self):
        r = make_reader(which=("nvidia-smi",))
        with mock.patch.object(gpu_clocks, "read_telemetry", side_effect=AttributeError("sym")), \
                mock.patch.object(gpu, "_run", self.smi_runner()):
            self.assertIsNotNone(r._read_nvidia())
        self.assertFalse(r._nvml_ok)

    def test_sin_nvml_ni_smi_backoff_15s_con_reloj_falso(self):
        r = make_reader()
        telemetry = mock.Mock(side_effect=OSError("sin lib"))
        with mock.patch.object(gpu_clocks, "read_telemetry", telemetry):
            self.assertIsNone(r._read_nvidia())
            self.assertEqual(r._nvidia_dead_until, self.clock.now + 15)
            self.clock.advance(14.9)
            self.assertIsNone(r._read_nvidia())
            self.assertEqual(r._nvidia_dead_until, 5015.0)  # no se reprogramó
        telemetry.assert_called_once_with()  # _nvml_ok quedó False tras el primer OSError

    def test_en_backoff_no_se_llama_a_nada(self):
        r = make_reader(which=("nvidia-smi",))
        r._nvidia_dead_until = self.clock.now + 10
        with mock.patch.object(gpu_clocks, "read_telemetry", forbid("nvml")), \
                mock.patch.object(gpu, "_run", forbid("nvidia-smi")):
            self.assertIsNone(r._read_nvidia())

    def test_smi_vacio_o_timeout_activa_backoff_y_expira(self):
        r = make_reader(which=("nvidia-smi",))
        r._nvml_ok = False
        calls = []
        # _run devuelve None cuando nvidia-smi hace timeout
        with mock.patch.object(gpu, "_run", lambda cmd, timeout=4.0:
                               calls.append((cmd, timeout)) and None):
            self.assertIsNone(r._read_nvidia())
        self.assertEqual(r._nvidia_dead_until, self.clock.now + 15)
        n = len(calls)
        with mock.patch.object(gpu, "_run", forbid("nvidia-smi")):
            self.assertIsNone(r._read_nvidia())     # aún en backoff
        self.clock.advance(15.0)
        with mock.patch.object(gpu, "_run", self.smi_runner()):
            self.assertEqual(r._read_nvidia()["temp"], 54.0)  # recuperada
        self.assertGreaterEqual(n, 1)

    def test_timeout_real_de_run_con_runner_falso(self):
        """nvidia-smi que expira: subprocess.run lanza TimeoutExpired (timeout=2.0)."""
        r = make_reader(which=("nvidia-smi",))
        r._nvml_ok = False
        r._power_avg = True
        seen = []

        def fake_run(cmd, **kwargs):
            seen.append((cmd[0], kwargs["timeout"], kwargs["stdin"]))
            raise subprocess.TimeoutExpired(cmd, kwargs["timeout"])

        with mock.patch.object(gpu.subprocess, "run", fake_run):
            self.assertIsNone(r._read_nvidia())
        self.assertEqual(seen, [("nvidia-smi", 2.0, subprocess.DEVNULL)])
        self.assertEqual(r._nvidia_dead_until, self.clock.now + 15)

    def test_salida_corta_corrupta_da_none_sin_backoff(self):
        r = make_reader(which=("nvidia-smi",))
        r._nvml_ok = False
        with mock.patch.object(gpu, "_run", self.smi_runner(line="RTX, 54, 31")):
            self.assertIsNone(r._read_nvidia())
        self.assertEqual(r._nvidia_dead_until, 0.0)

    def test_valores_na_quedan_en_none(self):
        r = make_reader(which=("nvidia-smi",))
        r._nvml_ok = False
        line = "RTX 4060, [N/A], [N/A], [N/A], 82, 8188, [N/A], [N/A], [N/A]"
        with mock.patch.object(gpu, "_run", self.smi_runner(line=line)):
            out = r._read_nvidia()
        self.assertEqual(out["name"], "RTX 4060")
        self.assertIsNone(out["temp"])
        self.assertIsNone(out["util"])
        self.assertIsNone(out["power"])
        self.assertEqual(out["vram_used"], 82.0)
        self.assertIsNone(out["clock_mhz"])

    def test_power_avg_cero_cae_a_instantaneo(self):
        r = make_reader(which=("nvidia-smi",))
        r._nvml_ok = False
        line = "RTX, 50, 5, 12.5, 80, 8000, 210, 405, 0"
        with mock.patch.object(gpu, "_run", self.smi_runner(line=line)):
            self.assertEqual(r._read_nvidia()["power"], 12.5)

    def test_driver_sin_power_average_usa_consulta_corta_y_detecta_una_vez(self):
        r = make_reader(which=("nvidia-smi",))
        r._nvml_ok = False
        calls = []
        line = "RTX, 50, 5, 12.5, 80, 8000, 210, 405"
        with mock.patch.object(gpu, "_run", self.smi_runner(avg=False, line=line, calls=calls)):
            first = r._read_nvidia()
            second = r._read_nvidia()
        self.assertEqual(first["power"], 12.5)
        self.assertEqual(second["power"], 12.5)
        queries = [c[0][1] for c in calls if "--query-gpu" in c[0][1]]
        self.assertEqual(queries, [f"--query-gpu={gpu.NVIDIA_QUERY}"] * 2)
        helps = [c for c in calls if "--help-query-gpu" in c[0]]
        self.assertEqual(len(helps), 1)
        self.assertFalse(r._power_avg)

    def test_con_power_average_la_consulta_la_incluye(self):
        r = make_reader(which=("nvidia-smi",))
        r._nvml_ok = False
        calls = []
        with mock.patch.object(gpu, "_run", self.smi_runner(calls=calls)):
            r._read_nvidia()
        query = [c for c in calls if "--query-gpu" in c[0][1]][0]
        self.assertEqual(query[0][1], f"--query-gpu={gpu.NVIDIA_QUERY_AVG}")
        self.assertEqual(query[1], 2.0)


class AmdHwmonTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        # device/hwmon/hwmon3 : _read_amd sube dos niveles para gpu_busy_percent
        self.device = Path(self._tmp.name) / "device"
        self.hw = self.device / "hwmon/hwmon3"
        self.hw.mkdir(parents=True)

    def w(self, rel, text):
        (self.hw / rel).write_text(text + "\n")

    def reader(self, **kw):
        return make_reader(chips={"amdgpu": [self.hw]}, **kw)

    def test_lectura_completa(self):
        self.w("temp1_input", "61000")
        self.w("temp1_label", "edge")
        self.w("temp2_input", "70000")
        self.w("temp2_label", "junction")
        self.w("power1_average", "23500000")
        self.w("freq1_input", "1800000000")
        self.w("freq2_input", "1000000000")
        (self.device / "gpu_busy_percent").write_text("42\n")
        with mock.patch.object(gpu.GpuReader, "_read_nvidia", return_value=None):
            out = self.reader().read()["active"]
        self.assertEqual(out["vendor"], "amd")
        self.assertEqual(out["temp"], 61.0)          # prefiere "edge"
        self.assertEqual(out["util"], 42)
        self.assertEqual(out["power"], 23.5)
        self.assertEqual(out["clock_mhz"], 1800)
        self.assertEqual(out["vram_clock_mhz"], 1000)
        self.assertIsNone(out["vram_used"])

    def test_sin_edge_usa_primer_sensor_y_faltantes_son_none(self):
        self.w("temp1_input", "55000")
        self.w("temp1_label", "junction")
        out = self.reader()._read_amd()
        self.assertEqual(out["temp"], 55.0)
        self.assertIsNone(out["util"])
        self.assertIsNone(out["power"])
        self.assertIsNone(out["clock_mhz"])
        self.assertIsNone(out["vram_clock_mhz"])

    def test_sin_sensores_temp_none(self):
        self.assertIsNone(self.reader()._read_amd()["temp"])

    def test_sin_amd_none(self):
        r = make_reader()
        self.assertIsNone(r.amd)
        self.assertIsNone(r._read_amd())
        with mock.patch.object(gpu.GpuReader, "_read_nvidia", return_value=None):
            self.assertIsNone(r.read()["active"])

    def test_gpu_deshabilitada_no_lee_nada(self):
        self.w("temp1_input", "55000")
        r = self.reader(enabled=False)
        with mock.patch.object(gpu_clocks, "read_telemetry", forbid("nvml")):
            self.assertIsNone(r.read()["active"])

    def test_read_prefiere_nvidia_y_cae_a_amd(self):
        self.w("temp1_input", "55000")
        r = self.reader()
        with mock.patch.object(gpu.GpuReader, "_read_nvidia", return_value={"vendor": "nvidia"}):
            self.assertEqual(r.read()["active"], {"vendor": "nvidia"})
        with mock.patch.object(gpu.GpuReader, "_read_nvidia", return_value=None):
            self.assertEqual(r.read()["active"]["vendor"], "amd")


class SupergfxTests(unittest.TestCase):
    def setUp(self):
        self.clock = FakeClock()
        fake_cached_env(self, self.clock)
        patcher = mock.patch.object(gpu, "time", self.clock)
        patcher.start()
        self.addCleanup(patcher.stop)

    @staticmethod
    def sg_runner(answers, log=None):
        def run(cmd, timeout=4.0):
            if log is not None:
                log.append(cmd)
            value = answers.get(cmd[-1], None)
            return value() if callable(value) else value
        return run

    def build(self, answers, log=None):
        return make_reader(which=("supergfxctl",), run=self.sg_runner(answers, log))

    def test_ausente_sin_modos_ni_spawn(self):
        r = make_reader(run=forbid("supergfxctl"))
        self.assertFalse(r.has_supergfx)
        self.assertIsNone(r._sg)
        self.assertEqual(r.supported, [])
        with mock.patch.object(gpu, "_run", forbid("supergfxctl")):
            info = r.mode_info()
            r.invalidate()  # sin _sg: no explota
        self.assertEqual(info, {"mode": None, "pending": None,
                                "pending_action": None, "supported": []})

    def test_modos_soportados_y_lectura(self):
        answers = {"-s": "[Integrated, Hybrid, AsusMuxDgpu]", "-g": "Hybrid",
                   "-P": "None", "-p": "NoAction"}
        r = self.build(answers)
        self.assertEqual(r.supported, ["Integrated", "Hybrid", "AsusMuxDgpu"])
        with mock.patch.object(gpu, "_run", self.sg_runner(answers)):
            info = r.mode_info()
        self.assertEqual(info["mode"], "Hybrid")
        self.assertIsNone(info["pending"])
        self.assertIsNone(info["pending_action"])
        self.assertEqual(info["supported"], ["Integrated", "Hybrid", "AsusMuxDgpu"])

    def test_modo_pendiente_y_accion(self):
        answers = {"-s": "[Integrated, Hybrid]", "-g": "Hybrid",
                   "-P": "Integrated", "-p": "Logout required"}
        r = self.build(answers)
        with mock.patch.object(gpu, "_run", self.sg_runner(answers)):
            info = r.mode_info()
        self.assertEqual(info["pending"], "Integrated")
        self.assertEqual(info["pending_action"], "Logout required")

    def test_pendiente_igual_al_modo_actual_se_ignora(self):
        answers = {"-s": "[Hybrid]", "-g": "Hybrid", "-P": "hybrid", "-p": "Unknown"}
        r = self.build(answers)
        with mock.patch.object(gpu, "_run", self.sg_runner(answers)):
            info = r.mode_info()
        self.assertIsNone(info["pending"])
        self.assertIsNone(info["pending_action"])

    def test_supergfx_con_timeout_al_arrancar_no_da_modos(self):
        err = subprocess.TimeoutExpired(["supergfxctl"], 4)
        with mock.patch.object(gpu.shutil, "which",
                               lambda n: n if n == "supergfxctl" else None), \
                mock.patch.object(gpu, "_nvidia_pci", lambda: []), \
                mock.patch.object(gpu.subprocess, "run", side_effect=err):
            r = gpu.GpuReader({})
            self.assertTrue(r.has_supergfx)
            self.assertEqual(r.supported, [])
            self.assertIsNone(r.mode_info()["mode"])

    def test_cache_ttl_10s_sin_nuevos_spawns(self):
        log = []
        answers = {"-s": "[Hybrid]", "-g": "Hybrid", "-P": "None", "-p": "None"}
        r = self.build(answers, log)
        with mock.patch.object(gpu, "_run", self.sg_runner(answers, log)):
            r.mode_info()
            n = len(log)
            self.clock.advance(9.0)
            r.mode_info()
            self.assertEqual(len(log), n)
            self.clock.advance(1.5)           # TTL vencido: refresca
            r.mode_info()
            self.assertGreater(len(log), n)

    def test_fallo_conserva_modo_y_backoff_exponencial_con_tope(self):
        state = {"mode": "Hybrid"}
        answers = {"-s": "[Hybrid]", "-g": lambda: state["mode"], "-P": "None", "-p": "None"}
        r = self.build(answers)
        with mock.patch.object(gpu, "_run", self.sg_runner(answers)):
            self.assertEqual(r.mode_info()["mode"], "Hybrid")
            state["mode"] = None                       # supergfxctl -g se cuelga
            expected_delay = [20.0, 40.0, 80.0, 120.0, 120.0]  # 10*2^n, tope 120
            for delay in expected_delay:
                self.clock.advance(1000.0)             # siempre vencido
                info = r.mode_info()
                self.assertEqual(info["mode"], "Hybrid")       # último valor bueno
                self.assertEqual(r._sg._due, self.clock.now + delay)
            state["mode"] = "Integrated"               # se recupera
            self.clock.advance(1000.0)
            r.mode_info()
            self.assertEqual(r.mode_info()["mode"], "Integrated")
            self.assertEqual(r._sg._due, self.clock.now + 10.0)

    def test_invalidate_fuerza_relectura(self):
        log = []
        answers = {"-s": "[Hybrid]", "-g": "Hybrid", "-P": "None", "-p": "None"}
        r = self.build(answers, log)
        with mock.patch.object(gpu, "_run", self.sg_runner(answers, log)):
            r.mode_info()
            n = len(log)
            r.mode_info()
            self.assertEqual(len(log), n)
            r.invalidate()
            r.mode_info()
            self.assertGreater(len(log), n)


class VramProcessTests(unittest.TestCase):
    def setUp(self):
        self.clock = FakeClock()
        fake_cached_env(self, self.clock)
        patcher = mock.patch.object(gpu.GpuReader, "_proc_name",
                                    staticmethod(lambda pid, fallback="":
                                                 (Path(fallback).name if fallback else str(pid))))
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_sin_nvidia_no_disponible(self):
        out = make_reader().vram_processes()
        self.assertEqual(out, {"available": False,
                               "reason": "nvidia-smi no está disponible",
                               "vendor": None, "procs": []})

    def test_otra_gpu_activa_no_consulta(self):
        r = make_reader(which=("nvidia-smi",))
        out = r.vram_processes({"vendor": "amd"})
        self.assertFalse(out["available"])
        self.assertEqual(out["reason"], "la dGPU NVIDIA no está activa")

    def test_top_recorta_la_lista(self):
        r = make_reader(which=("nvidia-smi",))
        procs = [{"pid": i, "name": "p", "vram_mb": 100 - i, "type": "G"} for i in range(20)]
        r._vram = mock.Mock(get=lambda: {"available": True, "reason": "",
                                         "vendor": "nvidia", "procs": procs})
        out = r.vram_processes({"vendor": "nvidia"}, top=3)
        self.assertEqual([p["pid"] for p in out["procs"]], [0, 1, 2])
        self.assertTrue(out["available"])

    def test_valor_inicial_y_luego_datos_de_nvml(self):
        r = make_reader(which=("nvidia-smi",))
        self.assertEqual(r._vram.value["reason"], "sin datos todavía")
        self.assertFalse(r._vram.value["available"])
        rows = [{"pid": 7, "vram_mb": 512, "type": "G"}]
        with mock.patch.object(gpu_clocks, "read_vram_processes", return_value=rows):
            out = r.vram_processes({"vendor": "nvidia"})  # refresco (hilo síncrono falso)
        self.assertTrue(out["available"])
        self.assertEqual(out["procs"],
                         [{"pid": 7, "name": "7", "vram_mb": 512, "type": "G"}])

    def test_nvml_listo_no_llama_a_smi(self):
        r = make_reader(which=("nvidia-smi",))
        rows = [{"pid": 1, "vram_mb": 100, "type": "C"},
                {"pid": 1, "vram_mb": 300, "type": "G"}]
        with mock.patch.object(gpu_clocks, "read_vram_processes", return_value=rows), \
                mock.patch.object(gpu, "_run", forbid("nvidia-smi")):
            out = r._read_vram_procs()
        self.assertTrue(out["available"])
        self.assertEqual(out["procs"], [{"pid": 1, "name": "1", "vram_mb": 300, "type": "C+G"}])

    def test_nvml_oserror_desactiva_nvml_y_usa_smi(self):
        r = make_reader(which=("nvidia-smi",))

        def run(cmd, timeout=4.0):
            if len(cmd) > 1 and cmd[1].startswith("--query-compute-apps"):
                return "4242, /usr/bin/game, 2048"
            return None  # tabla sin salida

        with mock.patch.object(gpu_clocks, "read_vram_processes", side_effect=OSError("lib")), \
                mock.patch.object(gpu, "_run", run):
            out = r._read_vram_procs()
        self.assertFalse(r._nvml_ok)
        self.assertEqual(out["procs"], [{"pid": 4242, "name": "game", "vram_mb": 2048, "type": "C"}])

    def test_nvml_error_pasa_a_smi_sin_desactivar(self):
        r = make_reader(which=("nvidia-smi",))
        with mock.patch.object(gpu_clocks, "read_vram_processes",
                               side_effect=gpu_clocks.NvmlError(1)), \
                mock.patch.object(gpu, "_run", lambda cmd, timeout=4.0: None):
            out = r._read_vram_procs()
        self.assertTrue(r._nvml_ok)
        self.assertFalse(out["available"])
        self.assertEqual(out["reason"], "el driver NVIDIA no expuso la lista de procesos")

    def test_sin_nvml_ni_smi_no_expuso_lista(self):
        r = make_reader()
        r._nvml_ok = False
        out = r._read_vram_procs()
        self.assertFalse(out["available"])
        self.assertEqual(out["procs"], [])

    def test_consulta_prueba_segundo_nombre_de_campo(self):
        r = make_reader(which=("nvidia-smi",))
        seen = []

        def run(cmd, timeout=4.0):
            seen.append(cmd[1])
            if "used_memory" in cmd[1] and "used_gpu_memory" not in cmd[1]:
                return None  # driver viejo: no conoce used_memory
            return "10, /opt/app, 300 MiB"

        with mock.patch.object(gpu, "_run", run):
            rows = r._read_nvidia_vram_query()
        self.assertEqual(len(seen), 2)
        self.assertIn("used_gpu_memory", seen[1])
        self.assertEqual(rows, [{"pid": 10, "name": "app", "vram_mb": 300, "type": "C"}])

    def test_consulta_ambos_campos_fallan_none(self):
        r = make_reader(which=("nvidia-smi",))
        with mock.patch.object(gpu, "_run", lambda cmd, timeout=4.0: None):
            self.assertIsNone(r._read_nvidia_vram_query())

    def test_consulta_filtra_lineas_corruptas_y_memoria_cero(self):
        r = make_reader(which=("nvidia-smi",))
        out = "\n".join([
            "11, good, 100",
            "no-es-pid, bad, 50",
            "12, bad2, [N/A]",
            "13, zero, 0",
            "solo,dos",
            "",
        ])
        with mock.patch.object(gpu, "_run", lambda cmd, timeout=4.0: out):
            rows = r._read_nvidia_vram_query()
        self.assertEqual([(x["pid"], x["vram_mb"]) for x in rows], [(11, 100)])

    def test_tabla_de_nvidia_smi(self):
        r = make_reader(which=("nvidia-smi",))
        table = "\n".join([
            "+-----------------------------------------------------------------------------+",
            "| Processes:                                                                  |",
            "|    0   N/A  N/A      1234      G   /usr/bin/game              2048MiB |",
            "|    0   N/A  N/A      1300    C+G   /opt/steam/app               64MiB |",
            "|    0   N/A  N/A      1400      G   /usr/bin/idle                 0MiB |",
            "| linea corrupta |",
        ])
        with mock.patch.object(gpu, "_run", lambda cmd, timeout=4.0: table):
            rows = r._read_nvidia_vram_table()
        self.assertEqual(rows, [
            {"pid": 1234, "name": "game", "vram_mb": 2048, "type": "G"},
            {"pid": 1300, "name": "app", "vram_mb": 64, "type": "C+G"},
        ])

    def test_tabla_sin_salida_none(self):
        r = make_reader(which=("nvidia-smi",))
        with mock.patch.object(gpu, "_run", lambda cmd, timeout=4.0: None):
            self.assertIsNone(r._read_nvidia_vram_table())

    def test_merge_dedup_orden_y_basura(self):
        rows = [
            {"pid": 1, "name": "a", "vram_mb": 100, "type": "C"},
            {"pid": 1, "name": "a", "vram_mb": 500, "type": "G"},
            {"pid": 1, "name": "a", "vram_mb": 50, "type": "G"},
            {"pid": 2, "name": "b", "vram_mb": 900, "type": "G"},
            {"pid": "x", "name": "bad", "vram_mb": 1, "type": "G"},
            {"pid": 3, "name": "bad", "vram_mb": "1", "type": "G"},
        ]
        merged = gpu.GpuReader._merge_vram_rows(rows)
        self.assertEqual(merged, [
            {"pid": 2, "name": "b", "vram_mb": 900, "type": "G"},
            {"pid": 1, "name": "a", "vram_mb": 500, "type": "C+G"},
        ])


class ProcNameTests(unittest.TestCase):
    def test_lee_comm_y_recorta_a_48(self):
        with tempfile.TemporaryDirectory() as tmp:
            comm = Path(tmp) / "comm"
            comm.write_text("x" * 60 + "\n")
            with mock.patch.object(gpu, "Path", lambda p: comm):
                self.assertEqual(gpu.GpuReader._proc_name(1, "/bin/fallback"), "x" * 48)

    def test_sin_comm_usa_basename_o_pid(self):
        with tempfile.TemporaryDirectory() as tmp:
            missing = Path(tmp) / "no-existe"
            with mock.patch.object(gpu, "Path", lambda p: missing if str(p).startswith("/proc") else Path(p)):
                self.assertEqual(gpu.GpuReader._proc_name(9, "/usr/bin/game"), "game")
                self.assertEqual(gpu.GpuReader._proc_name(9, ""), "9")


# ---------------------------------------------------------------------------
# gpu_clocks.py — libnvidia-ml falsa (nunca se carga la real)
# ---------------------------------------------------------------------------


class FakeNvml:
    """Imita lo justo de ctypes.CDLL('libnvidia-ml'): cada función devuelve el
    código nvmlReturn_t y escribe en los byref que recibe."""

    def __init__(self, **overrides):
        self.calls: list[str] = []
        self.shutdowns = 0
        self.rc: dict[str, int] = {}
        self.vf = {"core": 50, "core_min": -300, "core_max": 300,
                   "mem": 100, "mem_min": -500, "mem_max": 1500}
        self.set_calls: list[tuple[str, int]] = []
        self.compute = [(100, 512 << 20), (101, 0)]
        self.graphics = [(200, 2048 << 20), (201, 2 ** 64 - 1)]
        self.field_power_mw = 15000
        self.__dict__.update(overrides)

        def error_string(code):  # función plana: ctypes le asigna .restype
            return f"error-{code}".encode()

        self.nvmlErrorString = error_string

    def _rc(self, name):
        self.calls.append(name)
        return self.rc.get(name, 0)

    # init / shutdown
    def nvmlInit_v2(self):
        return self._rc("nvmlInit_v2")

    def nvmlShutdown(self):
        self.shutdowns += 1
        return 0

    def nvmlDeviceGetHandleByIndex_v2(self, idx, ref):
        return self._rc("nvmlDeviceGetHandleByIndex_v2")

    # telemetría
    def nvmlDeviceGetName(self, dev, buf, size):
        rc = self._rc("nvmlDeviceGetName")
        buf.value = b"NVIDIA GeForce RTX 4060 Laptop GPU"
        return rc

    def nvmlDeviceGetUtilizationRates(self, dev, ref):
        rc = self._rc("nvmlDeviceGetUtilizationRates")
        ref._obj.gpu, ref._obj.memory = 31, 10
        return rc

    def nvmlDeviceGetMemoryInfo_v2(self, dev, ref):
        rc = self._rc("nvmlDeviceGetMemoryInfo_v2")
        ref._obj.total, ref._obj.used = 8188 << 20, 82 << 20
        return rc

    def nvmlDeviceGetFieldValues(self, dev, count, ref):
        rc = self._rc("nvmlDeviceGetFieldValues")
        ref._obj.nvmlReturn = self.rc.get("field_value", 0)
        ref._obj.value = self.field_power_mw
        return rc

    def nvmlDeviceGetPowerUsage(self, dev, ref):
        rc = self._rc("nvmlDeviceGetPowerUsage")
        ref._obj.value = 3600
        return rc

    def nvmlDeviceGetTemperature(self, dev, kind, ref):
        rc = self._rc("nvmlDeviceGetTemperature")
        ref._obj.value = 54
        return rc

    def nvmlDeviceGetClockInfo(self, dev, kind, ref):
        rc = self._rc(f"nvmlDeviceGetClockInfo{kind}")
        ref._obj.value = 240 if kind == 0 else 405
        return rc

    def _procs(self, name, rows, count_ref, arr):
        rc = self._rc(name)
        count_ref._obj.value = len(rows)
        for i, (pid, mem) in enumerate(rows):
            arr[i].pid, arr[i].mem = pid, mem
        return rc

    def nvmlDeviceGetComputeRunningProcesses_v3(self, dev, count_ref, arr):
        return self._procs("compute", self.compute, count_ref, arr)

    def nvmlDeviceGetGraphicsRunningProcesses_v3(self, dev, count_ref, arr):
        return self._procs("graphics", self.graphics, count_ref, arr)

    # offsets
    def _get(self, name, key, ref):
        rc = self._rc(name)
        ref._obj.value = self.vf[key]
        return rc

    def nvmlDeviceGetGpcClkVfOffset(self, dev, ref):
        return self._get("get_core", "core", ref)

    def nvmlDeviceGetMemClkVfOffset(self, dev, ref):
        return self._get("get_mem", "mem", ref)

    def nvmlDeviceGetGpcClkMinMaxVfOffset(self, dev, rmin, rmax):
        rc = self._rc("minmax_core")
        rmin._obj.value, rmax._obj.value = self.vf["core_min"], self.vf["core_max"]
        return rc

    def nvmlDeviceGetMemClkMinMaxVfOffset(self, dev, rmin, rmax):
        rc = self._rc("minmax_mem")
        rmin._obj.value, rmax._obj.value = self.vf["mem_min"], self.vf["mem_max"]
        return rc

    def nvmlDeviceSetGpcClkVfOffset(self, dev, value):
        self.set_calls.append(("core", value.value))
        return self._rc("set_core")

    def nvmlDeviceSetMemClkVfOffset(self, dev, value):
        self.set_calls.append(("mem", value.value))
        return self._rc("set_mem")


class NvmlCase(unittest.TestCase):
    def use(self, lib: FakeNvml) -> FakeNvml:
        for patcher in (mock.patch.object(gpu_clocks, "_LIB", None),
                        mock.patch.object(gpu_clocks, "_load_nvml", lambda: lib)):
            patcher.start()
            self.addCleanup(patcher.stop)
        return lib


class ReadTelemetryTests(NvmlCase):
    def test_telemetria_completa_y_shutdown(self):
        lib = self.use(FakeNvml())
        out = gpu_clocks.read_telemetry()
        self.assertEqual(out, {
            "name": "NVIDIA GeForce RTX 4060 Laptop GPU",
            "temp": 54.0, "util": 31.0,
            "power": 15.0,             # FieldValues (media), no GetPowerUsage
            "vram_used": 82.0, "vram_total": 8188.0,
            "clock_mhz": 240.0, "vram_clock_mhz": 405.0,
        })
        self.assertEqual(lib.shutdowns, 1)
        self.assertNotIn("nvmlDeviceGetPowerUsage", lib.calls)

    def test_potencia_cae_a_instantanea_si_field_value_falla(self):
        lib = self.use(FakeNvml())
        lib.rc["field_value"] = 3  # nvmlReturn del campo = NOT_SUPPORTED
        self.assertEqual(gpu_clocks.read_telemetry()["power"], 3.6)

    def test_potencia_cae_a_instantanea_si_field_values_devuelve_error(self):
        lib = self.use(FakeNvml())
        lib.rc["nvmlDeviceGetFieldValues"] = 3
        self.assertEqual(gpu_clocks.read_telemetry()["power"], 3.6)

    def test_potencia_cero_en_ambos_da_none(self):
        lib = self.use(FakeNvml(field_power_mw=0))
        lib.rc["nvmlDeviceGetPowerUsage"] = 3
        self.assertIsNone(gpu_clocks.read_telemetry()["power"])

    def test_campos_no_soportados_quedan_none(self):
        lib = self.use(FakeNvml())
        for name in ("nvmlDeviceGetName", "nvmlDeviceGetUtilizationRates",
                     "nvmlDeviceGetMemoryInfo_v2", "nvmlDeviceGetTemperature",
                     "nvmlDeviceGetClockInfo0", "nvmlDeviceGetClockInfo2"):
            lib.rc[name] = 3
        out = gpu_clocks.read_telemetry()
        self.assertEqual(out["name"], "")
        for key in ("temp", "util", "vram_used", "vram_total", "clock_mhz", "vram_clock_mhz"):
            self.assertIsNone(out[key], key)
        self.assertEqual(out["power"], 15.0)

    def test_init_falla_lanza_nvmlerror_con_mensaje(self):
        lib = self.use(FakeNvml())
        lib.rc["nvmlInit_v2"] = 9
        with self.assertRaises(gpu_clocks.NvmlError) as ctx:
            gpu_clocks.read_telemetry()
        self.assertEqual(ctx.exception.code, 9)
        self.assertIn("nvmlInit", str(ctx.exception))
        self.assertIn("error-9", str(ctx.exception))

    def test_handle_falla_hace_shutdown_y_lanza(self):
        lib = self.use(FakeNvml())
        lib.rc["nvmlDeviceGetHandleByIndex_v2"] = 2
        with self.assertRaises(gpu_clocks.NvmlError):
            gpu_clocks.read_telemetry()
        self.assertEqual(lib.shutdowns, 1)

    def test_nvml_ausente_lanza_oserror(self):
        with mock.patch.object(gpu_clocks, "_LIB", None), \
                mock.patch.object(gpu_clocks, "_load_nvml", _REAL_LOAD_NVML), \
                mock.patch.object(gpu_clocks.ctypes, "CDLL", side_effect=OSError("no lib")):
            with self.assertRaises(OSError) as ctx:
                gpu_clocks.read_telemetry()
        self.assertIn("libnvidia-ml", str(ctx.exception))

    def test_init_sin_v2_usa_nvmlinit(self):
        class Legacy:
            def __init__(self):
                self.used = None

            def nvmlInit(self):
                self.used = "nvmlInit"
                return 0

        lib = Legacy()
        gpu_clocks._nvml_init(lib)
        self.assertEqual(lib.used, "nvmlInit")

    def test_chk_sin_errorstring(self):
        with self.assertRaises(gpu_clocks.NvmlError) as ctx:
            gpu_clocks._chk(types.SimpleNamespace(), 15, "op")
        self.assertEqual(ctx.exception.code, 15)
        self.assertIn("código 15", str(ctx.exception))

    def test_shutdown_traga_excepciones(self):
        class Boom:
            def nvmlShutdown(self):
                raise RuntimeError("x")

        gpu_clocks._nvml_shutdown(Boom())  # no debe lanzar


class LoadNvmlTests(unittest.TestCase):
    def test_prueba_candidatos_hasta_uno_valido(self):
        sentinel = object()
        tried = []

        def fake_cdll(name):
            tried.append(name)
            if name == "libnvidia-ml.so":
                return sentinel
            raise OSError(name)

        with mock.patch.object(gpu_clocks.ctypes, "CDLL", fake_cdll):
            self.assertIs(_REAL_LOAD_NVML(), sentinel)
        self.assertEqual(tried, ["libnvidia-ml.so.1", "libnvidia-ml.so"])

    def test_ninguno_lanza_oserror(self):
        with mock.patch.object(gpu_clocks.ctypes, "CDLL", side_effect=OSError("nope")):
            with self.assertRaises(OSError):
                _REAL_LOAD_NVML()


class ReadVramProcessesTests(NvmlCase):
    def test_compute_y_graficos_filtrando_cero_y_na(self):
        lib = self.use(FakeNvml())
        self.assertEqual(gpu_clocks.read_vram_processes(), [
            {"pid": 100, "vram_mb": 512, "type": "C"},
            {"pid": 200, "vram_mb": 2048, "type": "G"},
        ])
        self.assertEqual(lib.shutdowns, 1)

    def test_una_lista_con_error_se_omite(self):
        lib = self.use(FakeNvml())
        lib.rc["compute"] = 3
        self.assertEqual([r["pid"] for r in gpu_clocks.read_vram_processes()], [200])

    def test_init_falla(self):
        lib = self.use(FakeNvml())
        lib.rc["nvmlInit_v2"] = 12
        with self.assertRaises(gpu_clocks.NvmlError):
            gpu_clocks.read_vram_processes()


class OffsetsTests(NvmlCase):
    def test_read_offsets(self):
        lib = self.use(FakeNvml())
        with mock.patch.object(gpu_clocks, "_load_nvml", lambda: lib):
            out = gpu_clocks.read_offsets()
        self.assertTrue(out["ok"])
        self.assertEqual(out["core"], {"value": 50, "min": -300, "max": 300,
                                       "safe_min": -200, "safe_max": 200, "unit": "MHz"})
        self.assertEqual(out["mem"], {"value": 100, "min": -500, "max": 1500,
                                      "safe_min": -500, "safe_max": 1000, "unit": "MHz"})
        self.assertEqual(lib.shutdowns, 1)

    def test_read_offsets_error_intermedio(self):
        lib = self.use(FakeNvml())
        lib.rc["minmax_mem"] = 3
        with self.assertRaises(gpu_clocks.NvmlError) as ctx:
            gpu_clocks.read_offsets()
        self.assertEqual(ctx.exception.code, 3)
        self.assertEqual(lib.shutdowns, 1)

    def test_validate_offsets_rechaza_fuera_de_tope_sin_recortar(self):
        self.assertEqual(gpu_clocks.validate_offsets("100", 500), (100, 500))
        for core, mem in ((1001, 0), (-1001, 0), (0, 6001), (0, -2001)):
            with self.assertRaises(ValueError, msg=(core, mem)):
                gpu_clocks.validate_offsets(core, mem)

    def test_set_offsets_recorta_al_rango_del_driver(self):
        lib = self.use(FakeNvml())
        out = gpu_clocks.set_offsets(900, -400)
        self.assertEqual(out, {"ok": True, "core_applied": 300, "mem_applied": -400,
                               "core_requested": 900, "mem_requested": -400})
        self.assertEqual(lib.set_calls, [("core", 300), ("mem", -400)])

    def test_set_offsets_invalido_no_toca_nvml(self):
        with mock.patch.object(gpu_clocks, "_load_nvml", forbid("_load_nvml")):
            with self.assertRaises(ValueError):
                gpu_clocks.set_offsets(5000, 0)

    def test_set_offsets_error_al_escribir(self):
        lib = self.use(FakeNvml())
        lib.rc["set_mem"] = 15  # NO_PERMISSION
        with self.assertRaises(gpu_clocks.NvmlError) as ctx:
            gpu_clocks.set_offsets(10, 10)
        self.assertEqual(ctx.exception.code, gpu_clocks.NVML_ERROR_NO_PERMISSION)
        self.assertEqual(lib.set_calls, [("core", 10), ("mem", 10)])


class CliTests(unittest.TestCase):
    def run_main(self, argv):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            rc = gpu_clocks.main(argv)
        return rc, out.getvalue(), err.getvalue()

    def test_read_imprime_json(self):
        with mock.patch.object(gpu_clocks, "read_offsets", return_value={"ok": True, "device_index": 1}) as ro:
            rc, out, _ = self.run_main(["--device", "1", "read"])
        ro.assert_called_once_with(1)
        self.assertEqual(rc, 0)
        self.assertEqual(json.loads(out), {"ok": True, "device_index": 1})

    def test_read_nvmlerror_y_oserror(self):
        with mock.patch.object(gpu_clocks, "read_offsets",
                               side_effect=gpu_clocks.NvmlError(3, "no soportado")):
            rc, _, err = self.run_main(["read"])
        self.assertEqual(rc, 1)
        self.assertEqual(json.loads(err), {"ok": False, "err": "no soportado", "nvml_code": 3})
        with mock.patch.object(gpu_clocks, "read_offsets", side_effect=OSError("sin lib")):
            rc, _, err = self.run_main(["read"])
        self.assertEqual(rc, 1)
        self.assertIn("NVML no disponible", json.loads(err)["err"])

    def test_set_sin_root_se_rechaza_sin_llamar_a_nvml(self):
        with mock.patch.object(gpu_clocks.os, "geteuid", return_value=1000), \
                mock.patch.object(gpu_clocks, "set_offsets", forbid("set_offsets")):
            rc, _, err = self.run_main(["set", "--core", "10", "--mem", "10"])
        self.assertEqual(rc, 1)
        self.assertIn("requiere root", json.loads(err)["err"])

    def test_set_como_root_simulado(self):
        result = {"ok": True, "core_applied": 10, "mem_applied": 20,
                  "core_requested": 10, "mem_requested": 20}
        with mock.patch.object(gpu_clocks.os, "geteuid", return_value=0), \
                mock.patch.object(gpu_clocks, "set_offsets", return_value=result) as so:
            rc, out, _ = self.run_main(["set", "--core", "10", "--mem", "20"])
        so.assert_called_once_with(10, 20, 0)
        self.assertEqual(rc, 0)
        self.assertEqual(json.loads(out), result)

    def test_set_errores_mapean_a_rc1(self):
        cases = (ValueError("fuera de tope"), gpu_clocks.NvmlError(15, "perm"), OSError("lib"))
        for exc in cases:
            with mock.patch.object(gpu_clocks.os, "geteuid", return_value=0), \
                    mock.patch.object(gpu_clocks, "set_offsets", side_effect=exc):
                rc, _, err = self.run_main(["set", "--core", "1", "--mem", "1"])
            self.assertEqual(rc, 1, type(exc).__name__)
            self.assertFalse(json.loads(err)["ok"])


if __name__ == "__main__":
    unittest.main()
