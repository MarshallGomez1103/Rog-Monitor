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
from .keys import KeyReader
from .power import BatteryReader, RaplReader, asus_profile, ppd_profile
from .power_control import PowerControl
from .procs import ProcReader
from .sysinfo import SysReader

THEME_CYCLE = list(ui.THEMES)
ERROR_LOG = DATA_DIR / "error.log"


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
        }
        self.theme = self.config["theme"]
        self.help_visible = False
        self.events_visible = False
        self.message = ""
        self._message_until = 0.0
        self._gpu_thread: threading.Thread | None = None
        self._gpu_results: queue.Queue = queue.Queue()
        self._resized = False  # bandera para SIGWINCH

    def flash(self, message: str) -> None:
        self.message = message
        self._message_until = time.monotonic() + 5

    def _log_error(self) -> None:
        try:
            ERROR_LOG.parent.mkdir(parents=True, exist_ok=True)
            with open(ERROR_LOG, "a") as fh:
                fh.write(f"--- {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
                traceback.print_exc(file=fh)
        except OSError:
            pass
        self.flash(self.t("internal_error", path=str(ERROR_LOG)))

    def sample(self) -> dict:
        cpu = self.cpu.read()
        gpu = self.gpu.read()
        active_profile = asus_profile()
        fans = self.fans.read(active_profile)
        watts = self.rapl.read_watts()

        self.series["cpu_temp"].push(cpu["avg"])
        self.series["cpu_power"].push(watts)
        active = gpu.get("active") or {}
        self.series["gpu_temp"].push(active.get("temp"))
        self.series["gpu_power"].push(active.get("power"))

        self.alerts.check(cpu, gpu, fans, watts)
        self._drain_gpu_results()
        if time.monotonic() > self._message_until:
            self.message = ""

        return {
            "cpu": cpu,
            "gpu": gpu,
            "fans": fans,
            "fan_meta": self.fans.meta(),
            "cpu_watts": watts,
            "rapl_available": self.rapl.available,
            "asus_profile": active_profile,
            "ppd_profile": ppd_profile(),
            "battery": self.battery.read(),
            "sys": self.sys.read(),
            "procs": self.procs.read(),
            # Procesos agrupados por núcleo lógico (vista de detalle por núcleo,
            # cores.js). Aditivo y opcional; reusa el ciclo de read() de arriba.
            "procs_by_core": self.procs.by_core(),
            "procs_mem": self.procs.top_memory(),
            "procs_vram": self.gpu.vram_processes(active),
            "aura": self.aura.snapshot(),
            "power_control": self.power.snapshot(),
            "fps": read_fps(),
            "series": self.series,
            "events": self.alerts.events,
            "limits": self.config["temp_colors"],
            "theme": self.theme,
            "help_visible": self.help_visible,
            "events_visible": self.events_visible,
            "message": self.message,
        }

    def snapshot_json(self, state: dict | None = None) -> str:
        """Serializable snapshot for --json / --json-stream (Electron backend)."""
        state = state or self.sample()
        payload = {k: v for k, v in state.items()
                   if k not in ("series", "events", "help_visible",
                                "events_visible", "message", "theme")}
        payload["series"] = {name: serie.values() for name, serie in self.series.items()}
        payload["events"] = [list(e) for e in self.alerts.events]
        payload["version"] = __import__("rog_monitor").__version__
        return json.dumps(payload)

    def handle_key(self, key: str, state: dict) -> bool:
        """Returns False to quit."""
        t = self.t
        if key == "q":
            return False
        if key == "h":
            self.help_visible = not self.help_visible
            self.events_visible = False
        elif key == "v":
            self.events_visible = not self.events_visible
            self.help_visible = False
        elif key == "t":
            self.theme = THEME_CYCLE[(THEME_CYCLE.index(self.theme) + 1) % len(THEME_CYCLE)] \
                if self.theme in THEME_CYCLE else THEME_CYCLE[0]
            self.config.data["theme"] = self.theme
            self.config.save()
        elif key == "p":
            ok, target = actions.cycle_profile(state["ppd_profile"])
            self.flash(t("profile_set", p=target) if ok else t("gpu_mode_err", e=target))
            if ok:
                self.alerts.log(t("profile_set", p=target))
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
                self.alerts.log(message)
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
        try:
            while True:
                print(self.snapshot_json(), flush=True)
                time.sleep(self.interval)
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

        try:
            with KeyReader() as keyboard, Live(
                ui.build(state, self.t, console.width),
                console=console,
                screen=True,
                auto_refresh=False,
            ) as live:
                running = True
                while running:
                    deadline = time.monotonic() + self.interval
                    while running and time.monotonic() < deadline:
                        # Responder a resize antes de esperar la próxima tecla
                        if self._resized:
                            self._resized = False
                            try:
                                live.update(
                                    ui.build(state, self.t, console.width),
                                    refresh=True,
                                )
                            except Exception:
                                self._log_error()
                        key = keyboard.get(timeout=0.1)
                        if not key:
                            continue
                        try:
                            running = self.handle_key(key, state)
                            state = self.sample()
                            live.update(ui.build(state, self.t, console.width),
                                        refresh=True)
                        except Exception:
                            self._log_error()
                    if not running:
                        break
                    if self._resized:
                        self._resized = False
                    try:
                        state = self.sample()
                        live.update(ui.build(state, self.t, console.width), refresh=True)
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
