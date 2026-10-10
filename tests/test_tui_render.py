"""build() sobre el fixture a varios anchos, estado 'sin sensores' y terminal pequeña."""

import copy
import io
import json
import time
import unittest
from pathlib import Path

from rich.cells import cell_len
from rich.console import Console

from rog_monitor import ui
from rog_monitor.app import BOUND_KEYS
from rog_monitor.history import Series
from rog_monitor.i18n import STRINGS, Translator

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "snapshot-v1.json"


def fixture_state() -> dict:
    """Snapshot v1 + las claves que sólo existen en la TUI (Series, tema, overlays)."""
    state = json.loads(FIXTURE.read_text())
    series = {}
    for name, values in state["series"].items():
        series[name] = Series(900)
        for v in values:
            series[name].push(v)
    state.update(series=series, theme="rog", help_visible=False,
                 events_visible=False, message="")
    return state


def render(state, width, height=40, lang="es") -> str:
    console = Console(width=width, height=height, file=io.StringIO(), force_terminal=False)
    console.print(ui.build(state, Translator(lang), width, height))
    return console.file.getvalue()


class BuildSizes(unittest.TestCase):
    def test_widths_do_not_raise_and_show_sections(self):
        t = Translator("es")
        for width in (60, 80, 120, 200):
            with self.subTest(width=width):
                out = render(fixture_state(), width)
                for key in ("cpu", "gpu", "fans", "profile", "history", "system", "processes"):
                    self.assertIn(t(key), out)

    def test_every_theme_and_overlay(self):
        for theme in ui.THEMES:
            for overlay in ("help_visible", "events_visible"):
                state = fixture_state()
                state.update(theme=theme, **{overlay: True})
                render(state, 80)

    def test_small_terminal_message_only(self):
        t = Translator("es")
        for width, height in ((40, 40), (80, 10), (59, 20), (60, 19), (34, 3)):
            with self.subTest(size=(width, height)):
                out = render(fixture_state(), width, height)
                self.assertIn("Terminal muy pequeña", out)
                self.assertIn("60x20", out)
                self.assertNotIn(t("processes"), out)  # sin paneles
                self.assertNotIn("ROG MONITOR", out)
        ok = render(fixture_state(), 60, 20)
        self.assertNotIn("Terminal muy pequeña", ok)

    def test_cjk_process_names_do_not_raise(self):
        state = fixture_state()
        state["procs"][0]["name"] = "日本語のプロセス名とても長い名前" * 3
        state["procs"][1]["name"] = "한국어-프로세스"
        state["procs"][2]["name"] = "ñandú-😀-proc"
        for width in (60, 80, 120):
            lines = render(state, width).splitlines()
            self.assertTrue(lines)
            self.assertTrue(all(cell_len(line) <= width for line in lines))

    def test_render_time(self):
        state = fixture_state()
        t0 = time.perf_counter()
        for _ in range(10):
            render(state, 120)
        ms = (time.perf_counter() - t0) / 10 * 1000
        self.assertLess(ms, 250, f"build+print tardó {ms:.1f} ms")


class MissingEverything(unittest.TestCase):
    def state(self):
        state = fixture_state()
        state["gpu"] = {"mode": "Hybrid", "pending": None, "supported": [], "active": None}
        state["battery"] = None
        state["cpu_watts"] = None
        state["rapl_available"] = False
        state["fans"] = []
        state["fps"] = None
        state["asus_profile"] = state["ppd_profile"] = None
        state["cpu"].update(avg=None, max=None, min=None, package=None, freq_ghz=None,
                            hot90=None, throttle_count=None, epp=None, governor=None,
                            model=None)
        return state

    def test_na_with_reasons(self):
        t = Translator("es")
        out = render(self.state(), 160)
        self.assertNotIn("None", out)
        self.assertNotIn("null", out)
        for key in ("power_na_hint", "fans_none", "battery_none", "gpu_suspended",
                    "na_sensor", "na_unavail"):
            self.assertIn(t(key), out, key)
        self.assertIn("N/A (" + t("power_na_hint") + ")", out)

    def test_integrated_gpu_off_reason(self):
        state = self.state()
        state["gpu"]["mode"] = "Integrated"
        out = render(state, 160)
        self.assertIn(Translator("es")("gpu_off"), out)

    def test_missing_state_in_every_language(self):
        for lang in STRINGS:
            with self.subTest(lang=lang):
                out = render(self.state(), 160, lang=lang)
                self.assertNotIn("None", out)


class I18nKeys(unittest.TestCase):
    def test_all_languages_have_same_keys(self):
        base = set(STRINGS["es"])
        for lang, strings in STRINGS.items():
            self.assertEqual(base, set(strings), lang)

    def test_help_lists_exactly_bound_keys(self):
        for lang, strings in STRINGS.items():
            with self.subTest(lang=lang):
                listed = [line[0] for line in strings["help_body"].split("\n")
                          if line[:2].strip() and line[1:3] == "  "]
                self.assertEqual(sorted(listed), sorted(BOUND_KEYS))
                self.assertEqual(sorted(k for k, _ in strings["keys_pairs"]),
                                 sorted(BOUND_KEYS))


if __name__ == "__main__":
    unittest.main()
