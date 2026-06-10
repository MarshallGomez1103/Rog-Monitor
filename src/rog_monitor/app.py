"""Main application loop: sample sensors, render dashboard, handle keys."""

import time

from rich.console import Console
from rich.live import Live

from . import actions, hwmon, ui
from .alerts import AlertEngine
from .config import Config
from .cpu import CpuReader
from .fans import FanReader
from .gpu import GpuReader
from .history import Series
from .i18n import Translator
from .keys import KeyReader
from .power import BatteryReader, RaplReader, asus_profile, ppd_profile
from .sysinfo import SysReader

THEME_CYCLE = list(ui.THEMES)


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
        self.alerts = AlertEngine(self.config, self.t)

        secs = int(self.config["history_seconds"])
        self.series = {
            "cpu_temp": Series(secs),
            "gpu_temp": Series(secs),
            "cpu_power": Series(secs),
            "gpu_power": Series(secs),
        }
        self.theme = self.config["theme"]
        self.help_visible = False
        self.message = ""
        self._message_until = 0.0

    def flash(self, message: str) -> None:
        self.message = message
        self._message_until = time.monotonic() + 5

    def sample(self) -> dict:
        cpu = self.cpu.read()
        gpu = self.gpu.read()
        fans = self.fans.read()
        watts = self.rapl.read_watts()

        self.series["cpu_temp"].push(cpu["avg"])
        self.series["cpu_power"].push(watts)
        active = gpu.get("active") or {}
        self.series["gpu_temp"].push(active.get("temp"))
        self.series["gpu_power"].push(active.get("power"))

        self.alerts.check(cpu, gpu, fans, watts)
        if time.monotonic() > self._message_until:
            self.message = ""

        return {
            "cpu": cpu,
            "gpu": gpu,
            "fans": fans,
            "cpu_watts": watts,
            "rapl_available": self.rapl.available,
            "asus_profile": asus_profile(),
            "ppd_profile": ppd_profile(),
            "battery": self.battery.read(),
            "sys": self.sys.read(),
            "series": self.series,
            "events": self.alerts.events,
            "theme": self.theme,
            "help_visible": self.help_visible,
            "message": self.message,
        }

    def handle_key(self, key: str, state: dict) -> bool:
        """Returns False to quit."""
        t = self.t
        if key == "q":
            return False
        if key == "h":
            self.help_visible = not self.help_visible
        elif key == "t":
            self.theme = THEME_CYCLE[(THEME_CYCLE.index(self.theme) + 1) % len(THEME_CYCLE)] \
                if self.theme in THEME_CYCLE else THEME_CYCLE[0]
            self.config.data["theme"] = self.theme
            self.config.save()
        elif key == "p":
            ok, target = actions.cycle_profile(state["ppd_profile"])
            self.flash(t("profile_set", p=target) if ok else t("gpu_mode_err"))
            if ok:
                self.alerts.log(t("profile_set", p=target))
        elif key == "g":
            ok, target = actions.toggle_gpu_mode(state["gpu"].get("mode"))
            self.flash(t("gpu_mode_set", m=target) if ok else t("gpu_mode_err"))
            if ok:
                self.alerts.log(t("gpu_mode_set", m=target))
        elif key == "e":
            path = actions.export_history(self.series, self.alerts.events)
            self.flash(t("exported", path=path))
        return True

    def run_once(self) -> None:
        console = Console()
        console.print(ui.build(self.sample(), self.t, console.width))

    def run(self) -> None:
        console = Console()
        state = self.sample()
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
                        key = keyboard.get(timeout=0.1)
                        if key:
                            running = self.handle_key(key, state)
                            live.update(ui.build(self.sample(), self.t, console.width),
                                        refresh=True)
                    if not running:
                        break
                    state = self.sample()
                    live.update(ui.build(state, self.t, console.width), refresh=True)
        except KeyboardInterrupt:
            pass
        finally:
            self.fans.persist_max()
