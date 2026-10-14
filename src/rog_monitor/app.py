"""Main application loop: sample sensors, render dashboard, handle keys."""

import json
import queue
import signal
import sys
import threading
import time
import traceback

from rich.console import Console
from rich.live import Live

from . import actions, hwmon, ui
from .alerts import AlertEngine
from .aura import AuraManager
from .config import DATA_DIR, Config
from .cpu import CpuReader
from .fans import FanReader
from .fps import read_fps
from .gpu import GpuReader
from .history import Series
from .i18n import Translator
from .keys import ESC, KeyReader
from .power import BatteryReader, RaplReader, asus_profile, ppd_profile
from .power_control import PowerControl
from .procs import ProcReader
from .sysinfo import SysReader

THEME_CYCLE = list(ui.THEMES)
ERROR_LOG = DATA_DIR / "error.log"
# El escritorio muestra los procesos que quepan en su bloque (hasta PROCS_TOP); la TUI, 5.
PROCS_TOP = 25
BOUND_KEYS = frozenset("qhvtpgef")  # teclas con acción; cualquier otra se ignora
EVENT_FILTERS = ("all", "warn", "crit")  # filtro de severidad del panel de eventos (f)


def _next_deadline(prev: float, interval: float, now: float) -> float:
    """Cadencia por reloj monotónico (F3-07): el tiempo de muestreo se descuenta del
    sleep en vez de sumarse. Si una muestra se pasó de un periodo entero, no se
    recupera en ráfaga: se reancla en `now`."""
    nxt = prev + interval
    return nxt if nxt > now else now + interval


def _gib(v):
    return None if v is None else round(v, 2)


# Valores de "lector no disponible" (N-DEF-03). Misma forma y tipos que devuelven los
# lectores y que fija tests/test_contract.py (huecos = None / listas vacías): si un
# lector lanza, solo su campo queda así y el resto del snapshot sale normal.
def _cpu_unavailable() -> dict:
    return {
        "model": None, "cores": [], "core_grid": [],
        "usage": None, "iowait": None, "steal": None,
        "avg": None, "max": None, "min": None, "package": None, "hot90": None,
        "freq_ghz": None, "governor": None, "driver": None, "epp": None,
        "throttle_count": None, "throttle_ms": None, "throttle_delta": 0,
        "throttle_ms_delta": 0, "throttled_now": False,
    }


def _gpu_unavailable() -> dict:
    return {"mode": None, "pending": None, "pending_action": None,
            "supported": [], "active": None}


def _sys_unavailable() -> dict:
    return {
        "ram_total_gb": None, "ram_used_gb": None, "ram_percent": None,
        "ram_available_gb": None, "ram_buffers_gb": None, "ram_cached_gb": None,
        "swap_used_gb": None, "swap_total_gb": None, "swap_percent": None,
        "rx_mbps": None, "tx_mbps": None,
        "disks": [], "disk_io": [], "nvme_temps": [], "smart_block_devices": [],
        "load": None, "uptime_s": None, "uptime_h": None, "dmi": {},
    }


def _fan_meta_unavailable() -> dict:
    return {"schema_version": None, "active_profile": None,
            "guardian": {"mode": None, "running": False}}


def _vram_unavailable() -> dict:
    return {"available": False, "reason": "lector no disponible",
            "vendor": None, "procs": []}


class App:
    def __init__(self, args):
        self.config = Config()
        if args.theme:
            self.config.data["theme"] = args.theme
        if args.lang:
            self.config.data["lang"] = args.lang
        self.interval = args.interval or float(self.config["interval"])
        lang = self.config["lang"]
        self.t = Translator(None if lang == "auto" else lang)

        chips = hwmon.scan()
        self.cpu = CpuReader(chips)
        self.gpu = GpuReader(chips, enabled=not args.no_gpu)
        self.fans = FanReader(chips, self.config)
        self.rapl = RaplReader()
        self.battery = BatteryReader()
        self.sys = SysReader(chips)
        self.procs = ProcReader()
        self.alerts = AlertEngine(self.config, self.t)
        self.aura = AuraManager()
        self.power = PowerControl()

        secs = int(self.config["history_seconds"])
        self.series = {
            "cpu_temp": Series(secs),
            "gpu_temp": Series(secs),
            "cpu_power": Series(secs),
            "gpu_power": Series(secs),
            # Uso en % (0-100) para compartir escala en las gráficas; huecos = None
            # (cpu.usage en la 1ª muestra; swap_percent sin swap).
            "cpu_usage": Series(secs),
            "ram_used": Series(secs),
            "swap_used": Series(secs),
            # GiB reales para graficar con eje 0..total (F2-03/04) y uso de GPU en %.
            "ram_gb": Series(secs),
            "swap_gb": Series(secs),
            "gpu_util": Series(secs),
        }
        self.theme = self.config["theme"]
        self.help_visible = False
        self.events_visible = False
        self.events_filter = "all"
        self.message = ""
        self._message_until = 0.0
        self._gpu_thread: threading.Thread | None = None
        self._gpu_results: queue.Queue = queue.Queue()
        self._resized = False  # bandera para SIGWINCH
        self._reader_errors: set[str] = set()  # lectores que fallan ahora (log único)

    def flash(self, message: str) -> None:
        self.message = message
        self._message_until = time.monotonic() + 5

    def _log_error(self, what: str = "") -> None:
        try:
            ERROR_LOG.parent.mkdir(parents=True, exist_ok=True)
            with open(ERROR_LOG, "a") as fh:
                fh.write(f"--- {time.strftime('%Y-%m-%d %H:%M:%S')}"
                         f"{' [' + what + ']' if what else ''}\n")
                traceback.print_exc(file=fh)
        except OSError:
            pass
        self.flash(self.t("internal_error", path=str(ERROR_LOG)))

    def _safe(self, name: str, read, fallback):
        """Ejecuta un lector aislado (N-DEF-03): si lanza, el campo queda con su valor
        de «no disponible» (`fallback` o su fábrica) y el tick sigue. El fallo se
        registra una vez por racha (sin spam por tick); al recuperarse se rearma."""
        try:
            value = read()
        except Exception:
            if name not in self._reader_errors:
                self._reader_errors.add(name)
                self._log_error(f"lector {name}")
            return fallback() if callable(fallback) else fallback
        self._reader_errors.discard(name)
        return value

    def sample(self) -> dict:
        safe = self._safe
        cpu = safe("cpu", self.cpu.read, _cpu_unavailable)
        gpu = safe("gpu", self.gpu.read, _gpu_unavailable)
        active_profile = safe("asus_profile", asus_profile, None)
        fans = safe("fans", lambda: self.fans.read(active_profile), list)
        watts = safe("rapl", self.rapl.read_watts, None)

        self.series["cpu_temp"].push(cpu.get("avg"))
        self.series["cpu_power"].push(watts)
        active = gpu.get("active") or {}
        self.series["gpu_temp"].push(active.get("temp"))
        self.series["gpu_power"].push(active.get("power"))
        # una sola lectura por ciclo (deltas de red/disco)
        sysd = safe("sys", self.sys.read, _sys_unavailable)
        self.series["cpu_usage"].push(cpu.get("usage"))
        self.series["ram_used"].push(sysd.get("ram_percent"))
        self.series["swap_used"].push(sysd.get("swap_percent"))
        self.series["ram_gb"].push(_gib(sysd.get("ram_used_gb")))
        # sin swap -> hueco, no un 0 GiB falso
        self.series["swap_gb"].push(_gib(sysd.get("swap_used_gb")) if sysd.get("swap_total_gb") else None)
        self.series["gpu_util"].push(active.get("util"))

        safe("alerts", lambda: self.alerts.check(cpu, gpu, fans, watts, sysd), None)
        safe("gpu_results", self._drain_gpu_results, None)
        if time.monotonic() > self._message_until:
            self.message = ""

        return {
            "cpu": cpu,
            "gpu": gpu,
            "fans": fans,
            "fan_meta": safe("fan_meta", self.fans.meta, _fan_meta_unavailable),
            "cpu_watts": watts,
            "rapl_available": self.rapl.available,
            "asus_profile": active_profile,
            "ppd_profile": safe("ppd_profile", ppd_profile, None),
            "battery": safe("battery", self.battery.read, None),
            "sys": sysd,
            "procs": safe("procs", lambda: self.procs.read(top=PROCS_TOP), list),
            # Procesos agrupados por núcleo lógico (vista de detalle por núcleo,
            # cores.js). Aditivo y opcional; reusa el ciclo de read() de arriba.
            "procs_by_core": safe("procs_by_core", self.procs.by_core, dict),
            "procs_mem": safe("procs_mem", self.procs.top_memory, list),
            "procs_vram": safe("procs_vram", lambda: self.gpu.vram_processes(active),
                               _vram_unavailable),
            "aura": safe("aura", self.aura.snapshot, None),
            "power_control": safe("power_control", self.power.snapshot, None),
            "fps": safe("fps", read_fps, None),
            "series": self.series,
            "events": self.alerts.events,
            "limits": self.config["temp_colors"],
            "theme": self.theme,
            "help_visible": self.help_visible,
            "events_visible": self.events_visible,
            "events_filter": self.events_filter,
            "message": self.message,
        }

    def snapshot_json(self, state: dict | None = None) -> str:
        """Serializable snapshot for --json / --json-stream (Electron backend)."""
        state = state or self.sample()
        payload = {k: v for k, v in state.items()
                   if k not in ("series", "events", "help_visible",
                                "events_visible", "events_filter", "message", "theme")}
        payload["series"] = {name: serie.values() for name, serie in self.series.items()}
        payload["events"] = [list(e) for e in self.alerts.events]
        payload["version"] = __import__("rog_monitor").__version__
        payload["ts"] = round(time.time(), 3)   # F2-08: hora de la muestra (exportes/latencia)
        # Envelope schema (integer, distinct from the app `version`). Bump ONLY on
        # breaking changes: a key removed/renamed or a unit changed. Adding keys
        # is not breaking. When bumping, update tests/test_contract.py (REQUIRED)
        # and desktop/test/contract.test.js, and re-record tests/fixtures/.
        payload["schema"] = 1
        return json.dumps(payload)

    def handle_key(self, key: str, state: dict) -> bool:
        """Returns False to quit."""
        t = self.t
        if key == "q":
            return False
        if key == ESC:  # Esc cierra ayuda/eventos (no hace nada si no hay overlay)
            self.help_visible = self.events_visible = False
        elif key == "h":
            self.help_visible = not self.help_visible
            self.events_visible = False
        elif key == "v":
            self.events_visible = not self.events_visible
            self.help_visible = False
        elif key == "f":  # filtro de severidad: todos -> warn+ -> crit
            self.events_filter = EVENT_FILTERS[(EVENT_FILTERS.index(self.events_filter) + 1)
                                               % len(EVENT_FILTERS)]
        elif key == "t":
            self.theme = THEME_CYCLE[(THEME_CYCLE.index(self.theme) + 1) % len(THEME_CYCLE)] \
                if self.theme in THEME_CYCLE else THEME_CYCLE[0]
            self.config.data["theme"] = self.theme
            self.config.save()
        elif key == "p":
            ok, target = actions.cycle_profile(state["ppd_profile"])
            self.flash(t("profile_set", p=target) if ok else t("gpu_mode_err", e=target))
            if ok:
                self.alerts.log(t("profile_set", p=target), source="power", etype="action")
        elif key == "g":
            self._request_gpu_toggle(state)
        elif key == "e":
            path = actions.export_history(self.series, self.alerts.events)
            self.flash(t("exported", path=path))
        return True

    def _request_gpu_toggle(self, state: dict) -> None:
        """Mode changes can block for a long time inside supergfxd; run them
        in a worker thread so the UI keeps refreshing."""
        if self._gpu_thread and self._gpu_thread.is_alive():
            self.flash(self.t("gpu_mode_busy"))
            return
        gpu = state["gpu"]
        target, cancelling = actions.gpu_toggle_target(gpu.get("mode"), gpu.get("pending"))

        def worker():
            ok, err = actions.set_gpu_mode(target)
            self._gpu_results.put((ok, target, cancelling, err))

        self._gpu_thread = threading.Thread(target=worker, daemon=True)
        self._gpu_thread.start()
        self.flash(self.t("gpu_mode_sent", m=target))

    def _drain_gpu_results(self) -> None:
        t = self.t
        while True:
            try:
                ok, target, cancelling, err = self._gpu_results.get_nowait()
            except queue.Empty:
                return
            if ok:
                message = t("gpu_mode_cancel", m=target) if cancelling \
                    else t("gpu_mode_set", m=target)
                self.alerts.log(message, source="gpu", etype="action")
            else:
                message = t("gpu_mode_err", e=(err or "?")[:60])
            self.flash(message)
            self.gpu.invalidate()

    def run_once(self) -> None:
        console = Console()
        # prime delta-based readers (process CPU%, RAPL watts)
        self.procs.read()
        self.rapl.read_watts()
        time.sleep(0.5)
        console.print(ui.build(self.sample(), self.t, console.width))

    def run_json(self, stream: bool) -> None:
        if not stream:
            self.procs.read()
            self.rapl.read_watts()
            time.sleep(0.5)
            print(self.snapshot_json())
            return
        # Cebar lectores por delta (CPU% de procesos, vatios RAPL) como en el
        # camino no-stream, para que la primera línea no salga vacía.
        self.procs.read()
        self.rapl.read_watts()
        time.sleep(0.5)
        next_tick = time.monotonic()
        try:
            while True:
                try:
                    line = self.snapshot_json()
                except BrokenPipeError:
                    raise  # el lector de la tubería se fue: terminar limpio, no reintentar
                except Exception:
                    # Un fallo puntual no debe matar al productor NDJSON: se
                    # registra y se sigue (con sleep, sin bucle caliente).
                    self._log_error()
                else:
                    print(line, flush=True)
                next_tick = _next_deadline(next_tick, self.interval, time.monotonic())
                time.sleep(max(0.0, next_tick - time.monotonic()))
        except (KeyboardInterrupt, BrokenPipeError):
            pass

    def run(self) -> None:
        console = Console()
        state = self.sample()

        # Manejador de SIGWINCH: sólo activa la bandera (reentrancy-safe).
        # El bucle principal detecta _resized y re-renderiza con el ancho nuevo.
        def _on_resize(signum, frame):
            self._resized = True

        if hasattr(signal, "SIGWINCH"):
            signal.signal(signal.SIGWINCH, _on_resize)

        # SIGTERM/SIGHUP salen como Ctrl-C: la excepción atraviesa el `with`
        # y restaura pantalla alternativa y termios.
        def _on_term(signum, frame):
            raise KeyboardInterrupt

        for name in ("SIGTERM", "SIGHUP"):
            if hasattr(signal, name):
                signal.signal(getattr(signal, name), _on_term)

        try:
            with KeyReader() as keyboard, Live(
                ui.build(state, self.t, console.width, console.height),
                console=console,
                screen=True,
                auto_refresh=False,
            ) as live:
                running = True
                deadline = time.monotonic()
                while running:
                    deadline = _next_deadline(deadline, self.interval, time.monotonic())
                    while running and time.monotonic() < deadline:
                        # Responder a resize antes de esperar la próxima tecla
                        if self._resized:
                            self._resized = False
                            try:
                                live.update(
                                    ui.build(state, self.t, console.width, console.height),
                                    refresh=True,
                                )
                            except Exception:
                                self._log_error()
                        key = keyboard.get(timeout=0.1)
                        if key not in BOUND_KEYS and key != ESC:
                            continue  # tecla sin acción: no tocar nada
                        try:
                            running = self.handle_key(key, state)
                            if not running:
                                break
                            # Sin sample(): sólo se refresca lo que cambió la tecla.
                            # Muestrear aquí avanzaba las gráficas y rompía los deltas.
                            state.update(theme=self.theme,
                                         help_visible=self.help_visible,
                                         events_visible=self.events_visible,
                                         events_filter=self.events_filter,
                                         message=self.message)
                            live.update(ui.build(state, self.t, console.width, console.height),
                                        refresh=True)
                        except Exception:
                            self._log_error()
                    if not running:
                        break
                    if self._resized:
                        self._resized = False
                    try:
                        state = self.sample()
                        live.update(ui.build(state, self.t, console.width, console.height), refresh=True)
                    except Exception:
                        self._log_error()
            # El bloque `with` ya salió: pantalla alternativa restaurada,
            # modos de ratón desactivados, termios restaurado.
            # Ahora es seguro escribir al terminal normal.
            self.fans.persist_max()
            if sys.stdout.isatty():
                sys.stdout.write("\x1b[?25h")  # asegurar cursor visible
                sys.stdout.flush()
            print("Saliendo…")
        except KeyboardInterrupt:
            # Ctrl-C: salida limpia igual que 'q'
            self.fans.persist_max()
            if sys.stdout.isatty():
                sys.stdout.write("\x1b[?25h")
                sys.stdout.flush()
            print("Saliendo…")
