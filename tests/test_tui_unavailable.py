"""N-DEF-11: la TUI tolera el snapshot "todo no disponible" (lectores caídos) y
campos sueltos en None (sin 0 falsos ni excepciones). El aislamiento de
`os.getloadavg` vive en tests/test_metrics.py."""

import io
import unittest

from rich.console import Console

from rog_monitor import app, ui
from rog_monitor.history import Series
from rog_monitor.i18n import STRINGS, Translator

from tests.test_tui_render import fixture_state, render


def unavailable_state() -> dict:
    """Lo que produce App.sample() cuando fallan todos los lectores (_safe)."""
    state = fixture_state()
    state.update(
        cpu=app._cpu_unavailable(), gpu=app._gpu_unavailable(), fans=[],
        fan_meta=app._fan_meta_unavailable(), cpu_watts=None,
        asus_profile=None, ppd_profile=None, battery=None,
        sys=app._sys_unavailable(), procs=[], procs_by_core={}, procs_mem=[],
        procs_vram=app._vram_unavailable(), aura=None, power_control=None, fps=None,
    )
    state["series"] = {name: Series(900) for name in state["series"]}
    for serie in state["series"].values():
        serie.push(None)
    return state


def draw(renderable, width=100) -> str:
    console = Console(width=width, file=io.StringIO(), force_terminal=False)
    console.print(renderable)
    return console.file.getvalue()


class TuiAllUnavailable(unittest.TestCase):
    def test_build_does_not_raise_any_size_lang_theme(self):
        for lang in STRINGS:
            for theme in ui.THEMES:
                for width in (60, 100, 200):
                    with self.subTest(lang=lang, theme=theme, width=width):
                        state = unavailable_state()
                        state["theme"] = theme
                        out = render(state, width, lang=lang)
                        self.assertNotIn("None", out)
                        self.assertNotIn("nan", out)

    def test_each_panel_does_not_raise(self):
        t, th, state = Translator("es"), ui.THEMES["rog"], unavailable_state()
        for name in ("cpu_panel", "gpu_panel", "fans_panel", "profile_panel",
                     "system_panel", "processes_panel", "events_panel"):
            with self.subTest(panel=name):
                draw(getattr(ui, name)(state, t, th))
        draw(ui.history_panel(state, t, th, 120))

    def test_system_panel_shows_na_not_fake_zero(self):
        t = Translator("es")
        out = draw(ui.system_panel(unavailable_state(), t, ui.THEMES["rog"]))
        self.assertIn("N/A", out)
        self.assertNotIn("0.00", out)       # carga falsa
        self.assertNotIn("0.0h", out)       # uptime falso
        self.assertNotIn("0.0/0G", out)     # RAM falsa
        self.assertNotIn("↓0.0", out)       # red falsa

    def test_partial_sys_fields_none(self):
        """Solo `load` caído (el caso getloadavg): el resto del panel sigue real."""
        state = fixture_state()
        state["sys"]["load"] = None
        t = Translator("es")
        out = draw(ui.system_panel(state, t, ui.THEMES["rog"]))
        self.assertIn(f"{state['sys']['uptime_h']:.1f}h", out)
        self.assertIn(f"{state['sys']['ram_total_gb']:.0f}G", out)
        self.assertIn("N/A", out)

    def test_battery_on_ac_null_no_afirma_fuente(self):
        """N-DEF-02: on_ac null (sin adaptador ADP*/AC*) no se pinta como «en batería»."""
        state = fixture_state()
        state["battery"] = {**(state["battery"] or {}), "capacity": 80, "status": "Unknown",
                            "on_ac": None, "watts": None}
        t = Translator("es")
        out = draw(ui.profile_panel(state, t, ui.THEMES["rog"]))
        self.assertIn("80%", out)
        self.assertNotIn(t("on_battery"), out)
        self.assertNotIn(t("on_ac"), out)
        state["battery"]["on_ac"] = False
        out = draw(ui.profile_panel(state, t, ui.THEMES["rog"]))
        self.assertIn(t("on_battery"), out)

    def test_cpu_hot90_throttle_null_son_na(self):
        state = fixture_state()
        state["cpu"].update(hot90=None, throttle_count=None)
        t = Translator("es")
        out = draw(ui.cpu_panel(state, t, ui.THEMES["rog"]))
        self.assertNotIn(f"0 {t('cores_suffix')}", out)
        self.assertNotIn(f"0 {t('events_suffix')}", out)
        self.assertIn(t("na_sensor"), out)
        state["cpu"].update(hot90=0, throttle_count=0)
        out = draw(ui.cpu_panel(state, t, ui.THEMES["rog"]))
        self.assertIn(f"0 {t('cores_suffix')}", out)
        self.assertIn(f"0 {t('events_suffix')}", out)

    def test_disk_proc_and_fan_entries_with_none_fields(self):
        state = fixture_state()
        state["sys"]["disks"][0].update(used_gb=None, total_gb=None, percent=None)
        state["procs"][0].update(cpu=None, mem_mb=None)
        state["fans"] = [{"label": None, "rpm": None, "percent": None}]
        out = render(state, 120)
        self.assertNotIn("None", out)


if __name__ == "__main__":
    unittest.main()
