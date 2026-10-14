"""Orquestación de app.py (N-B-11) y aislamiento de lectores (N-DEF-03).

Todo con fakes: ningún lector real toca /sys ni /proc, el reloj es falso (nada duerme
de verdad), el log de errores va a un directorio temporal y los hilos/teclado/Live
de la TUI se sustituyen. El contrato `schema: 1` se verifica con la misma
especificación que tests/test_contract.py.
"""

import io
import json
import queue
import tempfile
import types
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

import rog_monitor
from rog_monitor import app
from rog_monitor.i18n import Translator

try:  # `unittest discover -s tests` (raíz = tests/) o `-m unittest tests.…` (raíz = repo)
    from test_contract import REQUIRED, check
except ImportError:  # pragma: no cover - depende de cómo se descubra
    from tests.test_contract import REQUIRED, check


# --------------------------------------------------------------------------- fakes


class FakeClock:
    """Sustituye al módulo `time` dentro de app.py; sleep() solo avanza el reloj."""

    def __init__(self):
        self.now = 1000.0
        self.sleeps: list[float] = []
        self.max_sleeps = 50

    def monotonic(self):
        return self.now

    def time(self):
        return 1_700_000_000.1234 + (self.now - 1000.0)

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        if len(self.sleeps) > self.max_sleeps:
            raise AssertionError("bucle sin fin: demasiados sleeps")
        self.now += seconds

    def strftime(self, fmt):
        return "2026-10-14 10:00:00"


class FakeConfig:
    def __init__(self, **over):
        self.data = {"theme": "rog", "lang": "en", "interval": 2, "history_seconds": 60,
                     "temp_colors": {"cpu": [70, 85], "gpu": [70, 85]}, **over}
        self.saves = 0

    def __getitem__(self, key):
        return self.data[key]

    def get(self, key, default=None):
        return self.data.get(key, default)

    def save(self):
        self.saves += 1
        return True


CPU = {"model": "Fake CPU", "avg": 55.0, "usage": 12.5, "core_grid": []}
GPU = {"mode": "Hybrid", "pending": None, "pending_action": None,
       "supported": ["Hybrid", "Integrated"],
       "active": {"temp": 48.0, "power": 30.5, "util": 7}}
SYS = {"ram_percent": 40, "swap_percent": 10, "ram_used_gb": 6.123456,
       "swap_used_gb": 0.456789, "swap_total_gb": 2.0, "load": [0.1, 0.2, 0.3]}
FANS = [{"label": "cpu_fan", "rpm": 2000, "percent": 50, "cap": None}]
FAN_META = {"schema_version": 2, "active_profile": "performance",
            "guardian": {"mode": "active", "running": True}}
PROCS = [{"pid": 1, "name": "init", "cpu": 1.0, "cpu_core": 0, "mem_mb": 10}]
VRAM = {"available": True, "reason": "", "vendor": "nvidia", "procs": []}
SERIES_NAMES = ("cpu_temp", "gpu_temp", "cpu_power", "gpu_power", "cpu_usage",
                "ram_used", "swap_used", "ram_gb", "swap_gb", "gpu_util")


def reader(**methods):
    """Lector falso: cada método es un Mock que devuelve un valor fijo."""
    obj = mock.Mock()
    for name, value in methods.items():
        setattr(obj, name, mock.Mock(return_value=value))
    return obj


class AppCase(unittest.TestCase):
    """App construida sin __init__ y con lectores falsos; reloj y log aislados."""

    def setUp(self):
        self.clock = FakeClock()
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.log = Path(self.tmp.name) / "data" / "error.log"
        self.asus = mock.Mock(return_value="performance")
        self.ppd = mock.Mock(return_value="balanced")
        self.fps = mock.Mock(return_value=59.5)
        for patcher in (
            mock.patch.object(app, "time", self.clock),
            mock.patch.object(app, "ERROR_LOG", self.log),
            mock.patch.object(app, "asus_profile", self.asus),
            mock.patch.object(app, "ppd_profile", self.ppd),
            mock.patch.object(app, "read_fps", self.fps),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)
        self.app = self.make_app()

    def make_app(self, **config_over):
        a = object.__new__(app.App)
        a.config = FakeConfig(**config_over)
        a.t = Translator("en")
        a.interval = 1.0
        a.cpu = reader(read=dict(CPU))
        a.gpu = reader(read=dict(GPU, active=dict(GPU["active"])),
                       vram_processes=dict(VRAM), invalidate=None)
        a.fans = reader(read=[dict(f) for f in FANS], meta=dict(FAN_META), persist_max=None)
        a.rapl = reader(read_watts=14.5)
        a.rapl.available = True
        a.battery = reader(read={"capacity": 80})
        a.sys = reader(read=dict(SYS))
        a.procs = reader(read=[dict(p) for p in PROCS], by_core={0: [dict(PROCS[0])]},
                         top_memory=[{"pid": 1, "name": "init", "mem_mb": 10}])
        a.alerts = mock.Mock()
        a.alerts.events = [("10:00:00", "warn", "msg", "thermal")]
        a.aura = reader(snapshot={"enabled": True})
        a.power = reader(snapshot={"pl1": 45})
        a.series = {name: app.Series(60) for name in SERIES_NAMES}
        a.theme = a.config["theme"]
        a.help_visible = a.events_visible = False
        a.events_filter = "all"
        a.message = ""
        a._message_until = 0.0
        a._gpu_thread = None
        a._gpu_results = queue.Queue()
        a._resized = False
        a._reader_errors = set()
        return a

    def error_log_text(self):
        return self.log.read_text() if self.log.exists() else ""


# --------------------------------------------------------------------------- cadencia


class NextDeadline(unittest.TestCase):
    def test_descuenta_el_tiempo_de_muestreo(self):
        self.assertEqual(app._next_deadline(10.0, 1.0, 10.25), 11.0)

    def test_si_se_pasa_un_periodo_entero_reancla_sin_rafaga(self):
        self.assertEqual(app._next_deadline(10.0, 1.0, 13.0), 14.0)

    def test_justo_en_el_limite_tambien_reancla(self):
        self.assertEqual(app._next_deadline(10.0, 1.0, 11.0), 12.0)


# --------------------------------------------------------------------------- __init__


class AppInit(unittest.TestCase):
    NAMES = ("CpuReader", "GpuReader", "FanReader", "RaplReader", "BatteryReader",
             "SysReader", "ProcReader", "AlertEngine", "AuraManager", "PowerControl")

    def build(self, config, **args):
        defaults = dict(theme=None, lang=None, interval=None, no_gpu=False)
        ns = types.SimpleNamespace(**{**defaults, **args})
        patches = {n: mock.patch.object(app, n) for n in self.NAMES}
        patches["Config"] = mock.patch.object(app, "Config", return_value=config)
        patches["Translator"] = mock.patch.object(app, "Translator")
        patches["scan"] = mock.patch.object(app.hwmon, "scan", return_value=["chipA"])
        started = {}
        for name, p in patches.items():
            started[name] = p.start()
            self.addCleanup(p.stop)
        return app.App(ns), started

    def test_defaults_de_configuracion(self):
        a, m = self.build(FakeConfig())
        self.assertEqual(a.interval, 2.0)
        self.assertEqual(a.theme, "rog")
        m["Translator"].assert_called_once_with("en")
        self.assertEqual(set(a.series), set(SERIES_NAMES))
        self.assertTrue(all(s.max_seconds == 60 for s in a.series.values()))
        m["scan"].assert_called_once_with()
        m["CpuReader"].assert_called_once_with(["chipA"])
        m["GpuReader"].assert_called_once_with(["chipA"], enabled=True)
        self.assertFalse(a.help_visible or a.events_visible)
        self.assertEqual((a.events_filter, a.message), ("all", ""))
        self.assertEqual(a._reader_errors, set())

    def test_args_pisan_la_configuracion(self):
        cfg = FakeConfig()
        a, m = self.build(cfg, theme="midnight", lang="fr", interval=0.5, no_gpu=True)
        self.assertEqual(a.interval, 0.5)
        self.assertEqual(cfg.data["theme"], "midnight")
        self.assertEqual(a.theme, "midnight")
        m["Translator"].assert_called_once_with("fr")
        m["GpuReader"].assert_called_once_with(["chipA"], enabled=False)

    def test_lang_auto_deja_que_el_traductor_detecte(self):
        _, m = self.build(FakeConfig(lang="auto"))
        m["Translator"].assert_called_once_with(None)


# --------------------------------------------------------------------------- sample


class Sample(AppCase):
    def test_devuelve_las_claves_del_estado_con_los_valores_de_los_lectores(self):
        s = self.app.sample()
        self.assertEqual(set(s), {
            "cpu", "gpu", "fans", "fan_meta", "cpu_watts", "rapl_available",
            "asus_profile", "ppd_profile", "battery", "sys", "procs", "procs_by_core",
            "procs_mem", "procs_vram", "aura", "power_control", "fps", "series", "events",
            "limits", "theme", "help_visible", "events_visible", "events_filter", "message"})
        self.assertEqual(s["cpu"]["avg"], 55.0)
        self.assertEqual(s["cpu_watts"], 14.5)
        self.assertIs(s["rapl_available"], True)
        self.assertEqual((s["asus_profile"], s["ppd_profile"], s["fps"]),
                         ("performance", "balanced", 59.5))
        self.assertEqual(s["fan_meta"], FAN_META)
        self.assertEqual(s["limits"], {"cpu": [70, 85], "gpu": [70, 85]})
        self.assertEqual(s["theme"], "rog")
        self.assertIs(s["series"], self.app.series)
        self.assertEqual(s["events"], self.app.alerts.events)

    def test_pasa_el_perfil_asus_al_lector_de_fans_y_top_a_procesos(self):
        self.app.sample()
        self.app.fans.read.assert_called_once_with("performance")
        self.app.procs.read.assert_called_once_with(top=app.PROCS_TOP)
        self.app.gpu.vram_processes.assert_called_once_with(GPU["active"])

    def test_empuja_una_muestra_a_cada_serie(self):
        self.app.sample()
        got = {n: s.values() for n, s in self.app.series.items()}
        self.assertEqual(got, {
            "cpu_temp": [55.0], "gpu_temp": [48.0], "cpu_power": [14.5],
            "gpu_power": [30.5], "cpu_usage": [12.5], "ram_used": [40.0],
            "swap_used": [10.0], "ram_gb": [6.12], "swap_gb": [0.46], "gpu_util": [7.0]})

    def test_sin_swap_la_serie_swap_gb_queda_en_hueco(self):
        self.app.sys.read.return_value = dict(SYS, swap_total_gb=0, swap_used_gb=0.0,
                                              swap_percent=None)
        self.app.sample()
        self.assertEqual(self.app.series["swap_gb"].values(), [None])
        self.assertEqual(self.app.series["swap_used"].values(), [None])

    def test_dgpu_dormida_deja_huecos_en_las_series_gpu(self):
        self.app.gpu.read.return_value = dict(GPU, active=None)
        s = self.app.sample()
        self.assertIsNone(s["gpu"]["active"])
        for name in ("gpu_temp", "gpu_power", "gpu_util"):
            self.assertEqual(self.app.series[name].values(), [None])

    def test_series_se_acumulan_alineadas_tick_a_tick(self):
        for _ in range(3):
            self.app.sample()
        self.assertEqual({len(s.values()) for s in self.app.series.values()}, {3})

    def test_alertas_reciben_los_datos_del_tick(self):
        s = self.app.sample()
        self.app.alerts.check.assert_called_once_with(s["cpu"], s["gpu"], s["fans"], 14.5, s["sys"])

    def test_mensaje_caduca_a_los_5_segundos(self):
        self.app.flash("hola")
        self.assertEqual(self.app.sample()["message"], "hola")
        self.clock.now += 5.0
        self.assertEqual(self.app.sample()["message"], "hola")  # justo en el límite
        self.clock.now += 0.01
        self.assertEqual(self.app.sample()["message"], "")

    def test_sample_drena_los_resultados_del_cambio_de_gpu(self):
        self.app._gpu_results.put((True, "Integrated", False, ""))
        s = self.app.sample()
        self.app.alerts.log.assert_called_once_with(
            "GPU mode requested: Integrated (log out to apply)", source="gpu", etype="action")
        self.app.gpu.invalidate.assert_called_once_with()
        self.assertEqual(s["message"], "GPU mode requested: Integrated (log out to apply)")


class DrainGpuResults(AppCase):
    def test_cancelacion(self):
        self.app._gpu_results.put((True, "Hybrid", True, ""))
        self.app._drain_gpu_results()
        self.assertEqual(self.app.message, "GPU change cancelled, staying on Hybrid")
        self.app.alerts.log.assert_called_once_with(
            "GPU change cancelled, staying on Hybrid", source="gpu", etype="action")

    def test_error_se_trunca_a_60_y_no_registra_accion(self):
        self.app._gpu_results.put((False, "Hybrid", False, "x" * 100))
        self.app._drain_gpu_results()
        self.assertEqual(self.app.message, "Could not change GPU mode: " + "x" * 60)
        self.app.alerts.log.assert_not_called()
        self.app.gpu.invalidate.assert_called_once_with()

    def test_error_sin_texto_muestra_interrogante(self):
        self.app._gpu_results.put((False, "Hybrid", False, None))
        self.app._drain_gpu_results()
        self.assertEqual(self.app.message, "Could not change GPU mode: ?")

    def test_drena_todos_los_pendientes(self):
        self.app._gpu_results.put((True, "Integrated", False, ""))
        self.app._gpu_results.put((True, "Hybrid", False, ""))
        self.app._drain_gpu_results()
        self.assertEqual(self.app.gpu.invalidate.call_count, 2)
        self.assertTrue(self.app._gpu_results.empty())
        self.assertEqual(self.app.message, "GPU mode requested: Hybrid (log out to apply)")


# --------------------------------------------------------------------------- snapshot_json


class SnapshotJson(AppCase):
    EXPECTED_KEYS = {
        "cpu", "gpu", "fans", "fan_meta", "cpu_watts", "rapl_available", "asus_profile",
        "ppd_profile", "battery", "sys", "procs", "procs_by_core", "procs_mem",
        "procs_vram", "aura", "power_control", "fps", "series", "events", "limits",
        "version", "ts", "schema"}

    def test_claves_schema_version_ts(self):
        data = json.loads(self.app.snapshot_json())
        self.assertEqual(set(data), self.EXPECTED_KEYS)
        self.assertEqual(data["schema"], 1)
        self.assertIs(type(data["schema"]), int)
        self.assertEqual(data["version"], rog_monitor.__version__)
        self.assertEqual(data["ts"], round(self.clock.time(), 3))

    def test_no_filtra_estado_de_la_tui(self):
        data = json.loads(self.app.snapshot_json())
        for key in ("help_visible", "events_visible", "events_filter", "message", "theme"):
            self.assertNotIn(key, data)

    def test_series_y_eventos_serializados(self):
        self.app.sample()
        data = json.loads(self.app.snapshot_json())
        self.assertEqual(set(data["series"]), set(SERIES_NAMES))
        self.assertEqual(data["series"]["cpu_temp"][-1], 55.0)
        self.assertEqual(data["events"], [["10:00:00", "warn", "msg", "thermal"]])
        self.assertEqual(data["fans"][0]["rpm"], 2000)
        self.assertEqual(data["procs_by_core"], {"0": [PROCS[0]]})  # claves JSON = str

    def test_usa_el_estado_dado_sin_volver_a_muestrear(self):
        self.app.sample = mock.Mock(side_effect=AssertionError("no debe muestrear"))
        state = {"cpu": {"avg": 1}, "series": {}, "events": []}
        data = json.loads(self.app.snapshot_json(state))
        self.assertEqual(data["cpu"], {"avg": 1})
        self.assertEqual(data["schema"], 1)

    def test_sin_estado_muestrea_una_vez(self):
        self.app.sample = mock.Mock(wraps=self.app.sample)
        self.app.snapshot_json()
        self.app.sample.assert_called_once_with()

    def test_ts_avanza_con_el_reloj(self):
        first = json.loads(self.app.snapshot_json())["ts"]
        self.clock.now += 2.0
        second = json.loads(self.app.snapshot_json())["ts"]
        self.assertAlmostEqual(second - first, 2.0, places=3)


# --------------------------------------------------------------------------- N-DEF-03


# (lector que falla, clave del estado, subconjunto esperado de ese campo)
READER_FAILURES = [
    ("cpu.read", "cpu", {"avg": None, "usage": None, "package": None, "core_grid": [],
                         "cores": [], "hot90": None, "throttled_now": False}),
    ("gpu.read", "gpu", {"active": None, "mode": None, "pending": None,
                         "pending_action": None}),
    ("fans.read", "fans", []),
    ("rapl.read_watts", "cpu_watts", None),
    ("sys.read", "sys", {"ram_percent": None, "load": None, "rx_mbps": None,
                         "swap_percent": None, "uptime_s": None, "disks": [],
                         "disk_io": [], "nvme_temps": []}),
    ("fans.meta", "fan_meta", {"schema_version": None, "active_profile": None,
                               "guardian": {"mode": None, "running": False}}),
    ("battery.read", "battery", None),
    ("procs.read", "procs", []),
    ("procs.by_core", "procs_by_core", {}),
    ("procs.top_memory", "procs_mem", []),
    ("gpu.vram_processes", "procs_vram", {"available": False, "vendor": None, "procs": []}),
    ("aura.snapshot", "aura", None),
    ("power.snapshot", "power_control", None),
    ("<asus>", "asus_profile", None),
    ("<ppd>", "ppd_profile", None),
    ("<fps>", "fps", None),
]


class ReaderIsolation(AppCase):
    def arm(self, a, path, exc):
        if path == "<asus>":
            self.asus.side_effect = exc
        elif path == "<ppd>":
            self.ppd.side_effect = exc
        elif path == "<fps>":
            self.fps.side_effect = exc
        else:
            obj, meth = path.split(".")
            getattr(getattr(a, obj), meth).side_effect = exc

    def test_un_lector_que_lanza_solo_apaga_su_campo(self):
        baseline = self.make_app().sample()
        for path, key, expected in READER_FAILURES:
            with self.subTest(reader=path):
                for shared in (self.asus, self.ppd, self.fps):
                    shared.side_effect = None
                a = self.make_app()
                self.arm(a, path, OSError(f"{path} roto"))
                snap = a.sample()  # RED: hoy propaga la excepción y no hay snapshot
                got = snap[key]
                if isinstance(expected, dict) and isinstance(got, dict):
                    self.assertEqual({k: got[k] for k in expected}, expected)
                else:
                    self.assertEqual(got, expected)
                rest = {k: v for k, v in snap.items() if k not in (key, "message")}
                base = {k: v for k, v in baseline.items() if k not in (key, "message")}
                # las series sí cambian (hueco) cuando el lector alimenta una; lo demás no
                rest.pop("series"), base.pop("series")
                self.assertEqual(rest, base)
                self.assertEqual(json.loads(a.snapshot_json(snap))["schema"], 1)

    def test_getloadavg_roto_no_descarta_el_tick(self):
        self.app.sys.read.side_effect = OSError("getloadavg: no disponible")
        data = json.loads(self.app.snapshot_json())
        self.assertIsNone(data["sys"]["load"])
        self.assertEqual(data["cpu"]["avg"], 55.0)
        self.assertEqual(data["series"]["cpu_temp"], [55.0])
        self.assertEqual(data["series"]["ram_used"], [None])

    def test_cpu_caido_deja_huecos_alineados_en_las_series(self):
        self.app.cpu.read.side_effect = RuntimeError("hwmon")
        for _ in range(2):
            self.app.sample()
        series = {n: s.values() for n, s in self.app.series.items()}
        self.assertEqual(series["cpu_temp"], [None, None])
        self.assertEqual(series["cpu_usage"], [None, None])
        self.assertEqual(series["cpu_power"], [14.5, 14.5])
        self.assertEqual({len(v) for v in series.values()}, {2})

    def test_alertas_rotas_no_descartan_el_tick(self):
        self.app.alerts.check.side_effect = KeyError("cfg")
        snap = self.app.sample()
        self.assertEqual(snap["cpu"]["avg"], 55.0)
        self.assertIn("[lector alerts]", self.error_log_text())

    def test_drenado_gpu_roto_no_descarta_el_tick(self):
        self.app._gpu_results.put((True, "Integrated", False, ""))
        self.app.gpu.invalidate.side_effect = RuntimeError("x")
        snap = self.app.sample()
        self.assertEqual(snap["cpu"]["avg"], 55.0)

    def test_todos_los_lectores_caidos_siguen_cumpliendo_el_contrato(self):
        a = self.app
        for obj, meths in (("cpu", ["read"]), ("gpu", ["read", "vram_processes"]),
                           ("fans", ["read", "meta"]), ("rapl", ["read_watts"]),
                           ("battery", ["read"]), ("sys", ["read"]),
                           ("procs", ["read", "by_core", "top_memory"]),
                           ("aura", ["snapshot"]), ("power", ["snapshot"])):
            for meth in meths:
                getattr(getattr(a, obj), meth).side_effect = OSError("caído")
        for mocked in (self.asus, self.ppd, self.fps):
            mocked.side_effect = OSError("caído")
        data = json.loads(a.snapshot_json())
        self.assertEqual(check(data, REQUIRED), [])
        self.assertEqual(data["schema"], 1)
        self.assertEqual((data["fans"], data["procs"], data["procs_mem"]), ([], [], []))
        self.assertIsNone(data["battery"])
        self.assertIsNone(data["fps"])

    def test_error_se_registra_una_sola_vez_por_racha(self):
        self.app.sys.read.side_effect = OSError("getloadavg")
        for _ in range(4):
            self.app.sample()
        text = self.error_log_text()
        self.assertEqual(text.count("[lector sys]"), 1)
        self.assertIn("OSError: getloadavg", text)
        self.assertIn("Internal error", self.app.message)

    def test_dos_lectores_distintos_se_registran_cada_uno(self):
        self.app.sys.read.side_effect = OSError("a")
        self.app.battery.read.side_effect = OSError("b")
        for _ in range(3):
            self.app.sample()
        text = self.error_log_text()
        self.assertEqual((text.count("[lector sys]"), text.count("[lector battery]")), (1, 1))

    def test_al_recuperarse_se_rearma_el_registro(self):
        self.app.sys.read.side_effect = OSError("a")
        self.app.sample()
        self.app.sys.read.side_effect = None
        self.app.sys.read.return_value = dict(SYS)
        self.assertEqual(self.app.sample()["sys"]["ram_percent"], 40)
        self.assertEqual(self.app._reader_errors, set())
        self.app.sys.read.side_effect = OSError("b")
        self.app.sample()
        self.assertEqual(self.error_log_text().count("[lector sys]"), 2)

    def test_lector_sano_no_deja_rastro_de_errores(self):
        self.app.sample()
        self.assertEqual(self.error_log_text(), "")
        self.assertEqual(self.app._reader_errors, set())


class LogError(AppCase):
    def test_escribe_traza_y_avisa(self):
        try:
            raise ValueError("boom")
        except ValueError:
            self.app._log_error("lector x")
        text = self.error_log_text()
        self.assertIn("--- 2026-10-14 10:00:00 [lector x]", text)
        self.assertIn("ValueError: boom", text)
        self.assertEqual(self.app.message, f"Internal error (logged to {self.log})")
        self.assertEqual(self.app._message_until, self.clock.now + 5)

    def test_sin_etiqueta_el_encabezado_no_lleva_corchetes(self):
        try:
            raise ValueError("boom")
        except ValueError:
            self.app._log_error()
        self.assertEqual(self.error_log_text().splitlines()[0], "--- 2026-10-14 10:00:00")

    def test_si_no_se_puede_escribir_el_log_igual_avisa(self):
        blocker = Path(self.tmp.name) / "archivo"
        blocker.write_text("x")
        with mock.patch.object(app, "ERROR_LOG", blocker / "sub" / "error.log"):
            try:
                raise ValueError("boom")
            except ValueError:
                self.app._log_error("lector x")  # no debe propagar OSError
        self.assertIn("Internal error", self.app.message)


# --------------------------------------------------------------------------- handle_key


class HandleKey(AppCase):
    def state(self):
        return {"ppd_profile": "balanced", "gpu": {"mode": "Hybrid", "pending": None}}

    def test_q_pide_salir_y_el_resto_continua(self):
        self.assertFalse(self.app.handle_key("q", self.state()))
        for key in ("h", "v", "f", "t", app.ESC, "z"):
            with mock.patch.object(self.app.config, "save"):
                self.assertTrue(self.app.handle_key(key, self.state()), key)

    def test_h_alterna_ayuda_y_cierra_eventos(self):
        a = self.app
        a.events_visible = True
        a.handle_key("h", self.state())
        self.assertEqual((a.help_visible, a.events_visible), (True, False))
        a.handle_key("h", self.state())
        self.assertFalse(a.help_visible)

    def test_v_alterna_eventos_y_cierra_ayuda(self):
        a = self.app
        a.help_visible = True
        a.handle_key("v", self.state())
        self.assertEqual((a.events_visible, a.help_visible), (True, False))
        a.handle_key("v", self.state())
        self.assertFalse(a.events_visible)

    def test_esc_cierra_ambos_overlays(self):
        a = self.app
        a.help_visible = a.events_visible = True
        a.handle_key(app.ESC, self.state())
        self.assertEqual((a.help_visible, a.events_visible), (False, False))
        a.handle_key(app.ESC, self.state())  # sin overlay: no hace nada
        self.assertEqual((a.help_visible, a.events_visible), (False, False))

    def test_f_cicla_el_filtro_de_severidad(self):
        a = self.app
        seen = []
        for _ in range(4):
            a.handle_key("f", self.state())
            seen.append(a.events_filter)
        self.assertEqual(seen, ["warn", "crit", "all", "warn"])

    def test_t_cicla_tema_y_persiste(self):
        a = self.app
        cycle = app.THEME_CYCLE
        a.theme = cycle[0]
        a.handle_key("t", self.state())
        self.assertEqual(a.theme, cycle[1])
        self.assertEqual(a.config.data["theme"], cycle[1])
        self.assertEqual(a.config.saves, 1)

    def test_t_da_la_vuelta_y_un_tema_desconocido_vuelve_al_primero(self):
        a = self.app
        a.theme = app.THEME_CYCLE[-1]
        a.handle_key("t", self.state())
        self.assertEqual(a.theme, app.THEME_CYCLE[0])
        a.theme = "no-existe"
        a.handle_key("t", self.state())
        self.assertEqual(a.theme, app.THEME_CYCLE[0])

    def test_p_exito_cambia_perfil_avisa_y_registra(self):
        with mock.patch.object(app.actions, "cycle_profile",
                               return_value=(True, "performance")) as cycle:
            self.app.handle_key("p", self.state())
        cycle.assert_called_once_with("balanced")
        self.assertEqual(self.app.message, "Profile set to performance")
        self.app.alerts.log.assert_called_once_with(
            "Profile set to performance", source="power", etype="action")

    def test_p_fallo_avisa_sin_registrar(self):
        with mock.patch.object(app.actions, "cycle_profile", return_value=(False, "performance")):
            self.app.handle_key("p", self.state())
        self.assertEqual(self.app.message, "Could not change GPU mode: performance")
        self.app.alerts.log.assert_not_called()

    def test_e_exporta_historial(self):
        with mock.patch.object(app.actions, "export_history",
                               return_value="/fake/exports") as export:
            self.app.handle_key("e", self.state())
        export.assert_called_once_with(self.app.series, self.app.alerts.events)
        self.assertEqual(self.app.message, "Exported to /fake/exports")

    def test_tecla_sin_accion_no_cambia_nada(self):
        a = self.app
        before = (a.theme, a.help_visible, a.events_visible, a.events_filter, a.message)
        self.assertTrue(a.handle_key("z", self.state()))
        self.assertEqual(before, (a.theme, a.help_visible, a.events_visible,
                                  a.events_filter, a.message))


class FakeThread:
    """Ejecuta el worker al instante: sin hilos reales."""

    started: list = []

    def __init__(self, target=None, daemon=None):
        self.target, self.daemon = target, daemon

    def start(self):
        FakeThread.started.append(self)
        self.target()

    def is_alive(self):
        return False


class GpuToggle(AppCase):
    def setUp(self):
        super().setUp()
        FakeThread.started = []
        patcher = mock.patch.object(app.threading, "Thread", FakeThread)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_g_hybrid_solicita_integrated_en_segundo_plano(self):
        state = {"gpu": {"mode": "Hybrid", "pending": None}}
        with mock.patch.object(app.actions, "set_gpu_mode", return_value=(True, "")) as setter:
            self.app.handle_key("g", state)
        setter.assert_called_once_with("Integrated")
        self.assertEqual(self.app.message, "Requesting Integrated mode…")
        self.assertTrue(FakeThread.started[0].daemon)
        self.assertEqual(self.app._gpu_results.get_nowait(), (True, "Integrated", False, ""))

    def test_g_con_cambio_pendiente_lo_cancela(self):
        state = {"gpu": {"mode": "Hybrid", "pending": "Integrated"}}
        with mock.patch.object(app.actions, "set_gpu_mode", return_value=(True, "")) as setter:
            self.app.handle_key("g", state)
        setter.assert_called_once_with("Hybrid")
        self.assertEqual(self.app._gpu_results.get_nowait(), (True, "Hybrid", True, ""))

    def test_g_ocupado_no_lanza_otro_hilo(self):
        self.app._gpu_thread = mock.Mock(is_alive=mock.Mock(return_value=True))
        with mock.patch.object(app.actions, "set_gpu_mode") as setter:
            self.app.handle_key("g", {"gpu": {"mode": "Hybrid", "pending": None}})
        setter.assert_not_called()
        self.assertEqual(FakeThread.started, [])
        self.assertEqual(self.app.message, "GPU change in progress, hold on…")

    def test_fallo_del_worker_llega_al_siguiente_tick(self):
        state = {"gpu": {"mode": "Integrated", "pending": None}}
        with mock.patch.object(app.actions, "set_gpu_mode", return_value=(False, "denegado")):
            self.app.handle_key("g", state)
        self.app.sample()
        self.assertEqual(self.app.message, "Could not change GPU mode: denegado")
        self.app.gpu.invalidate.assert_called_once_with()


# --------------------------------------------------------------------------- run_once / run_json


class RunOnce(AppCase):
    def test_ceba_lectores_espera_y_pinta_una_muestra(self):
        console = mock.Mock(width=123)
        with mock.patch.object(app, "Console", return_value=console), \
                mock.patch.object(app.ui, "build", return_value="PANEL") as build:
            self.app.run_once()
        # primer read() = cebado de deltas; el segundo es el de sample()
        self.assertEqual(self.app.procs.read.call_args_list,
                         [mock.call(), mock.call(top=app.PROCS_TOP)])
        self.assertEqual(self.app.rapl.read_watts.call_count, 2)
        self.assertEqual(self.clock.sleeps, [0.5])
        state, translator, width = build.call_args.args
        self.assertEqual((state["cpu"]["avg"], width), (55.0, 123))
        self.assertIs(translator, self.app.t)
        console.print.assert_called_once_with("PANEL")


class StdoutBroken:
    def write(self, _):
        raise BrokenPipeError(32, "Broken pipe")

    def flush(self):
        raise BrokenPipeError(32, "Broken pipe")


class RunJson(AppCase):
    def run_stream(self, snapshot, stdout=None):
        self.app.snapshot_json = snapshot
        out = io.StringIO()
        with redirect_stdout(stdout or out):
            self.app.run_json(True)
        return out.getvalue()

    def test_no_stream_imprime_un_snapshot_tras_cebar(self):
        self.app.snapshot_json = mock.Mock(return_value='{"a": 1}')
        out = io.StringIO()
        with redirect_stdout(out):
            self.app.run_json(False)
        self.assertEqual(out.getvalue(), '{"a": 1}\n')
        self.app.procs.read.assert_called_once_with()
        self.app.rapl.read_watts.assert_called_once_with()
        self.assertEqual(self.clock.sleeps, [0.5])

    def test_no_stream_es_un_snapshot_json_valido_con_schema_1(self):
        out = io.StringIO()
        with redirect_stdout(out):
            self.app.run_json(False)
        self.assertEqual(json.loads(out.getvalue())["schema"], 1)

    def test_stream_cadencia_monotonica_descuenta_el_muestreo(self):
        calls = {"n": 0}

        def snap():
            calls["n"] += 1
            if calls["n"] == 4:
                raise KeyboardInterrupt
            self.clock.now += 0.25  # coste del muestreo
            return f'{{"n": {calls["n"]}}}'

        out = self.run_stream(snap)
        self.assertEqual(out.splitlines(), ['{"n": 1}', '{"n": 2}', '{"n": 3}'])
        # warmup 0.5 y luego 1.0 de periodo menos 0.25 de muestreo
        self.assertEqual(self.clock.sleeps, [0.5, 0.75, 0.75, 0.75])

    def test_stream_ceba_una_sola_vez_antes_de_la_primera_linea(self):
        order = []
        self.app.procs.read.side_effect = lambda *a, **k: order.append("procs")
        self.app.rapl.read_watts.side_effect = lambda: order.append("rapl")

        def snap():
            order.append("snap")
            raise KeyboardInterrupt

        self.run_stream(snap)
        self.assertEqual(order, ["procs", "rapl", "snap"])

    def test_stream_muestra_atrasada_reancla_sin_rafaga(self):
        calls = {"n": 0}

        def snap():
            calls["n"] += 1
            if calls["n"] == 3:
                raise KeyboardInterrupt
            self.clock.now += 2.5  # se pasa de un periodo entero
            return "{}"

        self.run_stream(snap)
        self.assertEqual(self.clock.sleeps, [0.5, 1.0, 1.0])

    def test_stream_un_fallo_puntual_se_registra_y_sigue(self):
        calls = {"n": 0}

        def snap():
            calls["n"] += 1
            if calls["n"] == 2:
                raise RuntimeError("boom")
            if calls["n"] == 4:
                raise KeyboardInterrupt
            return f'{{"n": {calls["n"]}}}'

        out = self.run_stream(snap)
        self.assertEqual(out.splitlines(), ['{"n": 1}', '{"n": 3}'])
        self.assertEqual(self.error_log_text().count("RuntimeError: boom"), 1)
        self.assertEqual(len(self.clock.sleeps), 4)  # warmup + 3 ticks (con sleep, sin bucle caliente)

    def test_stream_con_un_lector_roto_sigue_emitiendo_lineas_validas(self):
        self.app.sys.read.side_effect = OSError("getloadavg")
        original = self.app.snapshot_json
        calls = {"n": 0}

        def snap():
            calls["n"] += 1
            if calls["n"] == 4:
                raise KeyboardInterrupt
            return original()

        out = self.run_stream(snap)
        lines = [json.loads(line) for line in out.splitlines()]
        self.assertEqual(len(lines), 3)
        self.assertTrue(all(d["schema"] == 1 and d["sys"]["load"] is None for d in lines))
        self.assertTrue(all(d["cpu"]["avg"] == 55.0 for d in lines))
        self.assertEqual(self.error_log_text().count("[lector sys]"), 1)

    def test_broken_pipe_al_escribir_termina_limpio(self):
        snap = mock.Mock(return_value="{}")
        self.run_stream(snap, stdout=StdoutBroken())
        self.assertEqual(snap.call_count, 1)
        self.assertEqual(self.clock.sleeps, [0.5])

    def test_broken_pipe_dentro_de_snapshot_termina_limpio(self):
        # RED hoy: el `except Exception` interno lo trata como fallo puntual y vuelve a
        # girar el bucle (aquí lo corta max_sleeps) en vez de terminar.
        snap = mock.Mock(side_effect=BrokenPipeError(32, "Broken pipe"))
        self.run_stream(snap)
        self.assertEqual(snap.call_count, 1)
        self.assertEqual(self.clock.sleeps, [0.5])
        self.assertEqual(self.error_log_text(), "")

    def test_stopiteration_en_snapshot_es_un_fallo_puntual_con_sleep(self):
        calls = {"n": 0}

        def snap():
            calls["n"] += 1
            if calls["n"] == 1:
                raise StopIteration
            raise KeyboardInterrupt

        self.run_stream(snap)
        self.assertEqual(calls["n"], 2)
        self.assertEqual(self.clock.sleeps, [0.5, 1.0])  # sin bucle caliente
        self.assertIn("StopIteration", self.error_log_text())


# --------------------------------------------------------------------------- run (TUI)


class FakeKeyReader:
    """Context manager de teclado: `script()` decide la tecla; get() avanza el reloj."""

    clock = None
    script = None
    gets = 0

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def get(self, timeout=0):
        FakeKeyReader.gets += 1
        if FakeKeyReader.gets > 500:
            raise AssertionError("bucle sin fin en run()")
        FakeKeyReader.clock.now += timeout
        return FakeKeyReader.script()


class FakeLive:
    instances: list = []

    def __init__(self, renderable, **kwargs):
        self.renderable, self.kwargs, self.updates = renderable, kwargs, []
        FakeLive.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def update(self, renderable, refresh=False):
        self.updates.append((renderable, refresh))


class TtyStringIO(io.StringIO):
    def isatty(self):
        return True


class RunTui(AppCase):
    def setUp(self):
        super().setUp()
        FakeKeyReader.clock, FakeKeyReader.gets = self.clock, 0
        FakeKeyReader.script = lambda: None
        FakeLive.instances = []
        console = mock.Mock(width=100, height=30)
        self.build = mock.Mock(return_value="RENDER")
        self.signals = {}
        for patcher in (
            mock.patch.object(app, "Console", return_value=console),
            mock.patch.object(app, "Live", FakeLive),
            mock.patch.object(app, "KeyReader", FakeKeyReader),
            mock.patch.object(app.ui, "build", self.build),
            mock.patch.object(app.signal, "signal",
                              side_effect=lambda n, h: self.signals.__setitem__(n, h)),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

    def keys(self, *seq):
        it = iter(seq)
        FakeKeyReader.script = lambda: next(it, None)

    def run_app(self, stdout=None):
        out = stdout or io.StringIO()
        with redirect_stdout(out):
            self.app.run()
        return out.getvalue()

    def test_q_sale_persiste_fans_y_se_despide(self):
        self.keys("q")
        out = self.run_app()
        self.assertEqual(out, "Saliendo…\n")
        self.app.fans.persist_max.assert_called_once_with()
        live = FakeLive.instances[0]
        self.assertEqual(live.kwargs, {"console": mock.ANY, "screen": True,
                                       "auto_refresh": False})
        self.assertEqual(live.updates, [])

    def test_tecla_sin_accion_se_ignora_y_h_refresca_sin_muestrear(self):
        self.app.sample = mock.Mock(wraps=self.app.sample)
        self.keys("z", "h", "q")
        self.run_app()
        self.assertEqual(self.app.sample.call_count, 1)  # solo la muestra inicial
        self.assertTrue(self.app.help_visible)
        live = FakeLive.instances[0]
        self.assertEqual(live.updates, [("RENDER", True)])
        state = self.build.call_args.args[0]
        self.assertIs(state["help_visible"], True)

    def test_tick_por_cadencia_muestrea_y_repinta(self):
        sample_times = []
        real = self.app.sample

        def sample():
            sample_times.append(self.clock.now)
            return real()

        self.app.sample = sample
        FakeKeyReader.script = lambda: "q" if len(sample_times) >= 3 else None
        self.run_app()
        self.assertEqual(len(sample_times), 3)
        self.assertGreaterEqual(sample_times[1] - sample_times[0], 1.0)
        self.assertGreaterEqual(sample_times[2] - sample_times[1], 1.0)
        self.assertEqual(len(FakeLive.instances[0].updates), 2)
        self.assertEqual(self.clock.sleeps, [])  # la espera es keyboard.get(timeout), no sleep

    def test_fallo_en_el_tick_se_registra_y_el_bucle_sigue(self):
        first = self.app.sample()
        self.app.sample = mock.Mock(side_effect=[first, RuntimeError("tick")])
        self.app._log_error = mock.Mock()
        FakeKeyReader.script = lambda: "q" if self.app.sample.call_count >= 2 else None
        self.run_app()
        self.app._log_error.assert_called_once_with()
        self.app.fans.persist_max.assert_called_once_with()

    def test_fallo_en_handle_key_se_registra_y_sigue(self):
        self.app.handle_key = mock.Mock(side_effect=[RuntimeError("tecla"), False])
        self.app._log_error = mock.Mock()
        self.keys("h", "h")
        self.run_app()
        self.assertEqual(self.app.handle_key.call_count, 2)
        self.app._log_error.assert_called_once_with()

    def test_resize_repinta_con_el_ancho_nuevo_y_baja_la_bandera(self):
        self.app._resized = True
        self.keys("q")
        self.run_app()
        self.assertFalse(self.app._resized)
        self.assertEqual(FakeLive.instances[0].updates, [("RENDER", True)])

    def test_resize_con_error_de_render_se_registra(self):
        self.app._resized = True
        self.build.side_effect = ["RENDER", RuntimeError("render")]
        self.app._log_error = mock.Mock()
        self.keys("q")
        self.run_app()
        self.app._log_error.assert_called_once_with()

    def test_ctrl_c_sale_igual_que_q(self):
        def interrupt():
            raise KeyboardInterrupt

        FakeKeyReader.script = interrupt
        out = self.run_app()
        self.assertEqual(out, "Saliendo…\n")
        self.app.fans.persist_max.assert_called_once_with()

    def test_en_terminal_real_restaura_el_cursor(self):
        self.keys("q")
        out = self.run_app(stdout=TtyStringIO())
        self.assertEqual(out, "\x1b[?25hSaliendo…\n")

    def test_ctrl_c_en_terminal_real_restaura_el_cursor(self):
        def interrupt():
            raise KeyboardInterrupt

        FakeKeyReader.script = interrupt
        out = self.run_app(stdout=TtyStringIO())
        self.assertEqual(out, "\x1b[?25hSaliendo…\n")

    def test_senales_resize_y_term(self):
        self.keys("q")
        self.run_app()
        import signal as real_signal
        self.assertEqual(set(self.signals), {real_signal.SIGWINCH, real_signal.SIGTERM,
                                             real_signal.SIGHUP})
        self.signals[real_signal.SIGWINCH](real_signal.SIGWINCH, None)
        self.assertTrue(self.app._resized)
        with self.assertRaises(KeyboardInterrupt):
            self.signals[real_signal.SIGTERM](real_signal.SIGTERM, None)

    def test_run_arranca_aunque_un_lector_este_caido(self):
        self.app.sys.read.side_effect = OSError("getloadavg")
        self.keys("q")
        self.assertEqual(self.run_app(), "Saliendo…\n")
        self.assertEqual(self.build.call_args_list[0].args[0]["sys"]["load"], None)


if __name__ == "__main__":
    unittest.main()
