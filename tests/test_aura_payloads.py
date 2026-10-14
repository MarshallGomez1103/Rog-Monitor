"""N-B-12: payloads de Aura (aura.py) sin ejecutar nada real.

Todo comando (asusctl, busctl) pasa por un runner capturador que registra el
argv y devuelve respuestas guiadas; subprocess.run queda sustituido por una
trampa que falla el test si algo intenta ejecutar de verdad. Los perfiles se
guardan en un directorio temporal y /sys y el socket de OpenRGB están falsos.
"""

import contextlib
import io
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from rog_monitor import aura

ASUSCTL = "/fake/bin/asusctl"

EFFECT_LIST_HELP = """Usage: asusctl aura effect [COMMAND]

Commands:
  static         Set a static colour
  breathe        Breathing
  rainbow-cycle  Cycle
  rainbow-wave   Wave
  stars          Stars
  pulse          Pulse
  bogus          not an effect we know
  help           Print this message

Options:
  -h, --help  Print help
"""

EFFECT_HELP = {
    "static": "Options:\n  -c, --colour <COLOUR>\n",
    "breathe": "Options:\n  --colour <C>\n  --colour2 <C>\n  --speed <S>\n",
    "rainbow-cycle": "Options:\n  --speed <S>\n",
    "rainbow-wave": "Options:\n  --speed <S>\n  --direction <D>\n",
    "stars": "Options:\n  --colour <C>\n  --colour2 <C>\n  --speed <S>\n",
    "pulse": "Options:\n  --colour <C>\n",
}


class Capture:
    """Sustituto de aura._run: registra (argv, timeout) y responde sin ejecutar."""

    def __init__(self):
        self.calls: list[list[str]] = []
        self.timeouts: list[float] = []
        self.overrides: list[tuple] = []  # (predicado, (ok, salida))
        self.busctl_ids = "au 5 0 1 2 3 10"
        self.leds_get = "Current keyboard led brightness: Med"

    def on(self, predicate, result):
        self.overrides.insert(0, (predicate, result))

    def __call__(self, cmd, timeout=5.0):
        cmd = list(cmd)
        self.calls.append(cmd)
        self.timeouts.append(timeout)
        for predicate, result in self.overrides:
            if predicate(cmd):
                return result
        if cmd[0] == "busctl":
            if "tree" in cmd:
                return True, "└─/xyz/ljones/aura/aura_0123\n"
            return (True, self.busctl_ids) if self.busctl_ids is not None else (False, "boom")
        if cmd[:3] == [ASUSCTL, "aura", "effect"] and cmd[-1] == "--help":
            if len(cmd) == 4:
                return True, EFFECT_LIST_HELP
            return True, EFFECT_HELP.get(cmd[3], "")
        if cmd[:3] == [ASUSCTL, "leds", "get"]:
            return True, self.leds_get
        return True, ""

    def applied(self) -> list[list[str]]:
        """Solo los comandos que cambian el teclado (sin descubrimiento ni lecturas)."""
        return [c for c in self.calls
                if c[0] == ASUSCTL and not c[-1] == "--help" and c[1:3] != ["leds", "get"]]


def _no_real_exec(*args, **kwargs):
    raise AssertionError(f"intento de ejecutar un subproceso real: {args!r}")


class AuraCase(unittest.TestCase):
    with_asusctl = True
    music_binary = None  # p.ej. "/fake/bin/pw-record"

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="aura-test-"))
        self.addCleanup(lambda: __import__("shutil").rmtree(self.tmp, ignore_errors=True))
        self.cap = Capture()
        self.aura_file = self.tmp / "cfg" / "aura.json"

        def find(candidates):
            return ASUSCTL if (candidates is aura.ASUSCTL_CANDIDATES and self.with_asusctl) else None

        def which(name):
            return self.music_binary if name == "pw-record" else None

        patches = [
            mock.patch.object(aura, "AURA_FILE", self.aura_file),
            mock.patch.object(aura, "_run", self.cap),
            mock.patch.object(aura, "_find_binary", find),
            mock.patch.object(aura.shutil, "which", which),
            mock.patch.object(aura.subprocess, "run", _no_real_exec),
            mock.patch.object(aura.subprocess, "Popen", _no_real_exec),
            mock.patch.object(aura.AuraManager, "_detect_peripherals", staticmethod(lambda: [])),
            mock.patch.object(aura.AuraManager, "_openrgb_sdk_available", staticmethod(lambda: False)),
            mock.patch.dict(aura._CAPS_CACHE, {}, clear=True),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def store(self) -> dict:
        return json.loads(self.aura_file.read_text())


# ------------------------------------------------------------ colores / estado

class NormalizeColour(unittest.TestCase):
    def test_accepts_hash_case_and_spaces(self):
        self.assertEqual(aura._normalize_colour("#FF00aa"), "ff00aa")
        self.assertEqual(aura._normalize_colour("  00FF7f "), "00ff7f")

    def test_none_and_empty_use_fallback(self):
        self.assertEqual(aura._normalize_colour(None), "ff5500")
        self.assertEqual(aura._normalize_colour("", "000000"), "000000")

    def test_rejects_out_of_range_and_hostile_values(self):
        hostile = ["ggg000", "12345", "1234567", "ff00ff;rm -rf ~", "--colour", "ff0000 --zone x",
                   "ff00\nff", "ff00ff\x00", "ＦＦ００ＦＦ", "0xff0000", "../../etc"]
        for value in hostile:
            with self.subTest(value=value), self.assertRaises(ValueError):
                aura._normalize_colour(value)


class NormalizeState(unittest.TestCase):
    def setUp(self):
        p = mock.patch.dict(aura._CAPS_CACHE, {}, clear=True)
        p.start()
        self.addCleanup(p.stop)

    def test_defaults(self):
        st = aura._normalize_state({})
        self.assertEqual(st, {
            "driver": "asus", "effect": "static", "brightness": "high", "colour": "ff5500",
            "colour2": None, "speed": None, "direction": None, "zone": None,
        })

    def test_strips_args_the_static_table_says_effect_lacks(self):
        raw = {"effect": "pulse", "colour": "#00ff00", "colour2": "0000ff", "speed": "high", "direction": "up"}
        st = aura._normalize_state(raw)
        self.assertEqual((st["colour"], st["colour2"], st["speed"], st["direction"]),
                         ("00ff00", None, None, None))

    def test_keeps_args_the_effect_supports(self):
        st = aura._normalize_state({"effect": "rainbow-wave", "speed": "LOW", "direction": "Left"})
        self.assertEqual((st["speed"], st["direction"]), ("low", "left"))
        st = aura._normalize_state({"effect": "stars", "colour2": "#112233"})
        self.assertEqual(st["colour2"], "112233")

    def test_discovered_caps_win_over_static_table(self):
        aura._CAPS_CACHE["static"] = {"colours": 2, "speed": True, "direction": True}
        st = aura._normalize_state({"effect": "static", "colour2": "123456", "speed": "high", "direction": "down"})
        self.assertEqual((st["colour2"], st["speed"], st["direction"]), ("123456", "high", "down"))

    def test_invalid_values_raise_value_error_with_the_field(self):
        cases = [
            ({"effect": "disco"}, "unsupported effect"),
            ({"effect": "../../bin/sh"}, "unsupported effect"),
            ({"brightness": "max"}, "invalid brightness"),
            ({"brightness": "11"}, "invalid brightness"),
            ({"driver": "razer"}, "unsupported driver"),
            ({"effect": "rainbow-wave", "speed": "turbo"}, "invalid speed"),
            ({"effect": "rainbow-wave", "direction": "sideways"}, "invalid direction"),
            ({"colour": "red"}, "invalid color"),
            ({"colour2": "zzzzzz"}, "invalid color"),
        ]
        for raw, text in cases:
            with self.subTest(raw=raw), self.assertRaises(ValueError) as ctx:
                aura._normalize_state(raw)
            self.assertIn(text, str(ctx.exception))

    def test_driver_openrgb_accepted_and_case_folded(self):
        self.assertEqual(aura._normalize_state({"driver": " OpenRGB "})["driver"], "openrgb")

    def test_blank_zone_becomes_none(self):
        self.assertIsNone(aura._normalize_state({"zone": "   "})["zone"])
        self.assertEqual(aura._normalize_state({"zone": " Key1 "})["zone"], "Key1")



class NormalizeStateDefects(unittest.TestCase):
    """Defectos reales: la validación explícita debe fallar siempre con ValueError
    y la zona no puede colar opciones ni metacaracteres en el argv de asusctl."""

    def setUp(self):
        p = mock.patch.dict(aura._CAPS_CACHE, {}, clear=True)
        p.start()
        self.addCleanup(p.stop)

    def test_non_string_fields_raise_value_error_not_attribute_error(self):
        bad = [{"brightness": 5}, {"colour": 123456}, {"colour2": ["ff0000"]}, {"effect": ["static"]},
               {"driver": 1}, {"effect": "rainbow-wave", "speed": 3},
               {"effect": "rainbow-wave", "direction": {"x": 1}}, {"zone": 7}]
        for raw in bad:
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                aura._normalize_state(raw)

    def test_non_dict_payload_raises_value_error(self):
        for raw in ([], "static", 3, None):
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                aura._normalize_state(raw)

    def test_zone_cannot_smuggle_options_or_metacharacters(self):
        for zone in ("--help", "-x", "key1 --colour ff0000", "a;b", "key1\nkey2", "../../x", "$(id)", "a" * 65):
            with self.subTest(zone=zone), self.assertRaises(ValueError):
                aura._normalize_state({"zone": zone})

    def test_plain_zone_names_still_valid(self):
        for zone in ("Key1", "logo", "lightbar-left", "zone_2"):
            self.assertEqual(aura._normalize_state({"zone": zone})["zone"], zone)


# --------------------------------------------------------- helpers puros / _run

class ParseCaps(unittest.TestCase):
    def test_parse_flags(self):
        self.assertEqual(aura._parse_effect_caps(EFFECT_HELP["breathe"]),
                         {"colours": 2, "speed": True, "direction": False})
        self.assertEqual(aura._parse_effect_caps(EFFECT_HELP["static"]),
                         {"colours": 1, "speed": False, "direction": False})
        self.assertEqual(aura._parse_effect_caps(EFFECT_HELP["rainbow-wave"]),
                         {"colours": 0, "speed": True, "direction": True})

    def test_empty_or_unrelated_help_is_conservative(self):
        self.assertEqual(aura._parse_effect_caps(""), {"colours": 0, "speed": False, "direction": False})
        self.assertEqual(aura._parse_effect_caps("unrecognized subcommand"),
                         {"colours": 0, "speed": False, "direction": False})


class MergeAndClean(unittest.TestCase):
    def test_merge_is_recursive_and_does_not_mutate_base(self):
        base = {"a": {"x": 1, "y": 2}, "b": 1}
        out = aura._merge(base, {"a": {"y": 9}, "c": 3})
        self.assertEqual(out, {"a": {"x": 1, "y": 9}, "b": 1, "c": 3})
        self.assertEqual(base, {"a": {"x": 1, "y": 2}, "b": 1})

    def test_clean_error_skips_asusctl_banner(self):
        out = "[ERROR] x\nSoftware version: 6\nProduct family: ROG\nBoard name: G16\nSupported: yes\nreal problem\nmore"
        self.assertEqual(aura._clean_error(out), "real problem")
        self.assertEqual(aura._clean_error(""), "")
        self.assertEqual(aura._clean_error(None), "")
        self.assertEqual(aura._clean_error("[a]\nSoftware version: 1"), "[a]")


class RunWrapper(unittest.TestCase):
    def test_run_uses_devnull_stdin_no_shell_and_joins_output(self):
        seen = {}

        def fake_run(cmd, **kw):
            seen["cmd"], seen["kw"] = cmd, kw
            return subprocess.CompletedProcess(cmd, 0, stdout=" out \n", stderr=" warn ")

        with mock.patch.object(aura.subprocess, "run", fake_run):
            ok, out = aura._run(["asusctl", "leds", "get"], timeout=1.5)
        self.assertTrue(ok)
        self.assertEqual(out, "out\nwarn")
        self.assertEqual(seen["cmd"], ["asusctl", "leds", "get"])
        self.assertIs(seen["kw"]["stdin"], subprocess.DEVNULL)
        self.assertEqual(seen["kw"]["timeout"], 1.5)
        self.assertFalse(seen["kw"].get("shell", False))

    def test_run_nonzero_and_errors(self):
        with mock.patch.object(aura.subprocess, "run",
                               lambda c, **k: subprocess.CompletedProcess(c, 2, stdout="", stderr="bad")):
            self.assertEqual(aura._run(["x"]), (False, "bad"))

        def boom(*a, **k):
            raise subprocess.TimeoutExpired("x", 1)

        with mock.patch.object(aura.subprocess, "run", boom):
            ok, out = aura._run(["x"])
        self.assertFalse(ok)
        self.assertIn("timed out", out)

        def missing(*a, **k):
            raise FileNotFoundError("no asusctl")

        with mock.patch.object(aura.subprocess, "run", missing):
            self.assertEqual(aura._run(["x"]), (False, "no asusctl"))


class FindBinary(unittest.TestCase):
    def test_absolute_path_and_path_lookup(self):
        with tempfile.TemporaryDirectory() as d:
            real = Path(d) / "asusctl"
            real.write_text("")
            with mock.patch.object(aura.shutil, "which", lambda n: None):
                self.assertEqual(aura._find_binary(["/nonexistent/x", str(real)]), str(real))
                self.assertIsNone(aura._find_binary(["/nonexistent/x", "nada"]))
            with mock.patch.object(aura.shutil, "which", lambda n: "/usr/bin/" + n if n == "openrgb" else None):
                self.assertEqual(aura._find_binary(["openrgb"]), "/usr/bin/openrgb")
                # una ruta absoluta inexistente no se resuelve por which
                self.assertIsNone(aura._find_binary(["/nonexistent/openrgb"]))


# ----------------------------------------------------------------- almacén

class Store(AuraCase):
    def test_missing_file_gives_independent_defaults(self):
        a = aura._load_store()
        self.assertEqual(a, aura.DEFAULTS)
        a["profiles"].append({"name": "x"})
        self.assertEqual(aura._load_store()["profiles"], [])
        self.assertEqual(aura.DEFAULTS["profiles"], [])

    def test_partial_file_merged_over_defaults(self):
        self.aura_file.parent.mkdir(parents=True)
        self.aura_file.write_text(json.dumps({"apply_on_startup": True}))
        st = aura._load_store()
        self.assertTrue(st["apply_on_startup"])
        self.assertEqual(st["unsupported_effects"], [])

    def test_corrupt_json_is_backed_up_and_defaults_returned(self):
        self.aura_file.parent.mkdir(parents=True)
        self.aura_file.write_text("{roto")
        self.assertEqual(aura._load_store(), aura.DEFAULTS)
        baks = list(self.aura_file.parent.glob("aura.json.corrupt-*.bak"))
        self.assertEqual(len(baks), 1)
        self.assertEqual(baks[0].read_text(), "{roto")

    def test_save_store_writes_sorted_json_and_reports_failure(self):
        self.assertTrue(aura._save_store({"b": 1, "a": 2}))
        self.assertEqual(self.aura_file.read_text(), '{\n  "a": 2,\n  "b": 1\n}\n')
        with mock.patch.object(aura, "write_atomic", side_effect=OSError("ro")):
            self.assertFalse(aura._save_store({"a": 1}))


# --------------------------------------------------------- descubrimiento/caché

class Discovery(AuraCase):
    def test_effects_discovered_with_real_caps_and_hardware_override(self):
        mgr = aura.AuraManager()
        by_id = {fx["id"]: fx for fx in mgr._effects}
        self.assertEqual(list(by_id), ["static", "breathe", "rainbow-cycle", "rainbow-wave", "stars", "pulse"])
        self.assertNotIn("bogus", by_id)
        # breathe anuncia --colour2 pero el firmware lo ignora: se fuerza 1
        self.assertEqual(by_id["breathe"]["colours"], 1)
        self.assertTrue(by_id["breathe"]["speed"])
        self.assertEqual(by_id["stars"]["colours"], 2)
        self.assertTrue(by_id["rainbow-wave"]["direction"])
        self.assertEqual(by_id["pulse"], {"label": "Pulse", "colours": 1, "id": "pulse",
                                          "speed": False, "direction": False})
        self.assertEqual(mgr.asusctl, ASUSCTL)

    def test_caps_are_cached_across_managers(self):
        aura.AuraManager()
        aura.AuraManager()
        probes = [c for c in self.cap.calls if c == [ASUSCTL, "aura", "effect", "static", "--help"]]
        self.assertEqual(len(probes), 1)

    def test_listing_failure_falls_back_to_static_table(self):
        self.cap.on(lambda c: c == [ASUSCTL, "aura", "effect", "--help"], (False, "no daemon"))
        mgr = aura.AuraManager()
        self.assertEqual([fx["id"] for fx in mgr._effects], list(aura.EFFECT_META))

    def test_listing_without_known_commands_falls_back_to_static_table(self):
        self.cap.on(lambda c: c == [ASUSCTL, "aura", "effect", "--help"], (True, "Commands:\n  weird  x\n"))
        mgr = aura.AuraManager()
        self.assertEqual([fx["id"] for fx in mgr._effects], list(aura.EFFECT_META))

    def test_failed_effect_help_uses_static_meta(self):
        self.cap.on(lambda c: c == [ASUSCTL, "aura", "effect", "rainbow-wave", "--help"], (False, "err"))
        mgr = aura.AuraManager()
        wave = next(fx for fx in mgr._effects if fx["id"] == "rainbow-wave")
        # EFFECT_META: speed y direction, sin color
        self.assertEqual((wave["colours"], wave["speed"], wave["direction"]), (0, True, True))

    def test_without_asusctl_nothing_is_executed(self):
        self.with_asusctl = False
        mgr = aura.AuraManager()
        self.assertEqual(mgr._effects, [])
        self.assertIsNone(mgr._brightness())
        self.assertEqual(self.cap.calls, [])
        self.assertEqual(mgr._probe_effect_caps("static"), {"colours": 0, "speed": False, "direction": False})

    def test_supported_effect_ids_parsing(self):
        mgr = aura.AuraManager()
        self.assertEqual(mgr._supported_effect_ids(),
                         {"static", "breathe", "rainbow-cycle", "rainbow-wave", "pulse"})
        self.cap.busctl_ids = "au 1 9"  # 9 no existe en MODE_NUM_TO_ID
        self.assertIsNone(mgr._supported_effect_ids())
        self.cap.busctl_ids = "au"
        self.assertIsNone(mgr._supported_effect_ids())
        self.cap.busctl_ids = None  # get-property falla
        self.assertIsNone(mgr._supported_effect_ids())

    def test_supported_effect_ids_without_aura_path_or_tree(self):
        mgr = aura.AuraManager()
        self.cap.on(lambda c: c[0] == "busctl" and "tree" in c, (True, "sin rutas aqui"))
        self.assertIsNone(mgr._supported_effect_ids())
        self.cap.on(lambda c: c[0] == "busctl" and "tree" in c, (False, "no bus"))
        self.assertIsNone(mgr._supported_effect_ids())

    def test_brightness_read(self):
        mgr = aura.AuraManager()
        self.assertEqual(mgr._brightness(), "med")
        self.cap.leds_get = "Current keyboard led brightness: High"
        self.assertEqual(mgr._brightness(), "high")
        self.cap.leds_get = "algo ininteligible"
        self.assertIsNone(mgr._brightness())
        self.cap.on(lambda c: c[1:3] == ["leds", "get"], (False, "err"))
        self.assertIsNone(mgr._brightness())


# ------------------------------------------------------------------- apply

class ApplyState(AuraCase):
    def test_static_argv_is_exact(self):
        res = aura.apply_state({"effect": "static", "colour": "#00FF00", "brightness": "low"})
        self.assertTrue(res["ok"])
        self.assertEqual(self.cap.applied(), [
            [ASUSCTL, "leds", "set", "low"],
            [ASUSCTL, "aura", "effect", "static", "--colour", "00ff00"],
        ])
        self.assertEqual(self.store()["last_applied"]["colour"], "00ff00")

    def test_breathe_never_sends_colour2_even_if_requested(self):
        aura.apply_state({"effect": "breathe", "colour": "ff0000", "colour2": "0000ff", "speed": "high"})
        self.assertEqual(self.cap.applied()[1],
                         [ASUSCTL, "aura", "effect", "breathe", "--colour", "ff0000", "--speed", "high"])

    def test_stars_sends_both_colours(self):
        aura.apply_state({"effect": "stars", "colour": "ff0000", "colour2": "0000ff"})
        self.assertEqual(self.cap.applied()[1], [ASUSCTL, "aura", "effect", "stars", "--colour", "ff0000",
                                                 "--colour2", "0000ff", "--speed", "med"])

    def test_rainbow_wave_speed_and_direction_without_colour(self):
        aura.apply_state({"effect": "rainbow-wave", "colour": "ff0000", "speed": "low", "direction": "up"})
        self.assertEqual(self.cap.applied()[1],
                         [ASUSCTL, "aura", "effect", "rainbow-wave", "--speed", "low", "--direction", "up"])

    def test_pulse_rejects_speed_even_when_sent(self):
        aura.apply_state({"effect": "pulse", "speed": "high", "colour": "010203"})
        self.assertEqual(self.cap.applied()[1], [ASUSCTL, "aura", "effect", "pulse", "--colour", "010203"])

    def test_zone_is_appended_as_separate_argv_item(self):
        aura.apply_state({"effect": "static", "zone": "Key1"})
        self.assertEqual(self.cap.applied()[1][-2:], ["--zone", "Key1"])

    def test_openrgb_driver_is_refused_without_running_anything(self):
        res = aura.apply_state({"driver": "openrgb"})
        self.assertFalse(res["ok"])
        self.assertIn("OpenRGB", res["err"])
        self.assertEqual(self.cap.applied(), [])

    def test_missing_asusctl(self):
        self.with_asusctl = False
        res = aura.apply_state({"effect": "static"})
        self.assertEqual(res, {"ok": False, "err": "asusctl was not found on this system."})
        self.assertEqual(self.cap.calls, [])

    def test_brightness_failure_stops_before_effect(self):
        self.cap.on(lambda c: c[1:3] == ["leds", "set"], (False, "Error: permission denied"))
        res = aura.apply_state({"effect": "static"})
        self.assertFalse(res["ok"])
        self.assertEqual(res["command"], [ASUSCTL, "leds", "set", "high"])
        self.assertEqual(res["err"], "Error: permission denied")
        self.assertEqual(len(self.cap.applied()), 1)
        self.assertFalse(self.aura_file.exists())

    def test_exit_zero_with_failure_marker_is_a_failure(self):
        for text in ("Error: bad", "command failed", "no such zone", "NOT SUPPORTED somewhere?"):
            self.cap.on(lambda c: c[1:3] == ["aura", "effect"] and "--help" not in c, (True, text))
            res = aura.apply_state({"effect": "static"})
            self.assertFalse(res["ok"], text)
        self.assertEqual(aura._load_store()["last_applied"], {})  # nunca se guarda un estado fallido

    def test_not_supported_effect_is_remembered_and_hidden_afterwards(self):
        self.cap.on(lambda c: c[1:4] == ["aura", "effect", "stars"] and "--help" not in c,
                    (True, "Effect not supported by this keyboard"))
        res = aura.apply_state({"effect": "stars"})
        self.assertFalse(res["ok"])
        self.assertIn("Starry Night", res["err"])
        self.assertEqual(self.store()["unsupported_effects"], ["stars"])
        # idempotente
        aura.apply_state({"effect": "stars"})
        self.assertEqual(self.store()["unsupported_effects"], ["stars"])
        snap = aura.AuraManager().snapshot(force=True)
        self.assertNotIn("stars", [fx["id"] for fx in snap["asus"]["effects"]])
        self.assertEqual(snap["asus"]["unsupported_effects"], ["stars"])

    def test_probe_on_demand_when_cache_empty(self):
        aura._CAPS_CACHE.clear()
        aura.apply_state({"effect": "rainbow-cycle", "speed": "high"})
        self.assertEqual(self.cap.applied()[1], [ASUSCTL, "aura", "effect", "rainbow-cycle", "--speed", "high"])

    def test_success_output_is_joined(self):
        self.cap.on(lambda c: c[1:3] == ["leds", "set"], (True, "brillo ok"))
        res = aura.apply_state({"effect": "static"})
        self.assertEqual(res["out"], "brillo ok")
        self.assertEqual(res["state"]["effect"], "static")

    def test_timeouts_are_bounded(self):
        aura.apply_state({"effect": "static"})
        cmds = [c for c in zip(self.cap.calls, self.cap.timeouts) if c[0] in self.cap.applied()]
        self.assertTrue(cmds and all(t == 6.0 for _, t in cmds))

    def test_invalid_payloads_run_nothing_and_do_not_touch_the_store(self):
        bad = [{"effect": "rm"}, {"brightness": "blinding"}, {"colour": "ff0000;reboot"},
               {"colour": "--zone"}, {"zone": "--help"}, {"zone": "a b"}, {"colour": 255}, {"effect": ["static"]}]
        for raw in bad:
            with self.subTest(raw=raw):
                res = aura.apply_state(raw)
                self.assertFalse(res["ok"])
                self.assertTrue(res["err"])
        self.assertEqual(self.cap.applied(), [])
        self.assertFalse(self.aura_file.exists())

    def test_non_dict_payload_is_rejected(self):
        for raw in ([], None, "static"):
            with self.subTest(raw=raw):
                self.assertFalse(aura.apply_state(raw)["ok"])
        self.assertEqual(self.cap.applied(), [])


# ----------------------------------------------------------------- perfiles

class Profiles(AuraCase):
    def test_save_replaces_same_name_case_insensitively(self):
        aura.save_profile("Gaming", {"effect": "static", "colour": "ff0000"})
        res = aura.save_profile("gaming", {"effect": "static", "colour": "00ff00"})
        self.assertTrue(res["ok"])
        profiles = self.store()["profiles"]
        self.assertEqual(len(profiles), 1)
        self.assertEqual(profiles[0]["name"], "gaming")
        self.assertEqual(profiles[0]["state"]["colour"], "00ff00")

    def test_blank_name_rejected(self):
        for name in ("", "   ", None):
            self.assertEqual(aura.save_profile(name, {"effect": "static"}),
                             {"ok": False, "err": "El perfil necesita un nombre."})
        self.assertFalse(self.aura_file.exists())

    def test_startup_flags_saved_and_blank_startup_clears(self):
        aura.save_profile("a", {"effect": "static"}, apply_on_startup=True, startup_profile="a")
        st = self.store()
        self.assertTrue(st["apply_on_startup"])
        self.assertEqual(st["startup_profile"], "a")
        aura.save_profile("b", {"effect": "static"}, startup_profile="")
        self.assertIsNone(self.store()["startup_profile"])

    def test_save_failure_reports_path(self):
        with mock.patch.object(aura, "write_atomic", side_effect=OSError("ro")):
            res = aura.save_profile("a", {"effect": "static"})
        self.assertFalse(res["ok"])
        self.assertIn(str(self.aura_file), res["err"])

    def test_delete_profile_and_startup_cleanup(self):
        aura.save_profile("A", {"effect": "static"}, apply_on_startup=True, startup_profile="A")
        aura.save_profile("B", {"effect": "static"})
        res = aura.delete_profile(" a ")
        self.assertTrue(res["ok"])
        self.assertEqual([p["name"] for p in res["profiles"]], ["B"])
        st = self.store()
        self.assertIsNone(st["startup_profile"])
        self.assertFalse(st["apply_on_startup"])

    def test_delete_missing_or_blank(self):
        self.assertEqual(aura.delete_profile(""), {"ok": False, "err": "Profile name is empty."})
        res = aura.delete_profile("nada")
        self.assertFalse(res["ok"])
        self.assertEqual(res["err"], "Profile not found.")

    def test_delete_failure(self):
        aura.save_profile("A", {"effect": "static"})
        with mock.patch.object(aura, "write_atomic", side_effect=OSError("ro")):
            self.assertFalse(aura.delete_profile("A")["ok"])

    def test_set_startup_profile_validation(self):
        aura.save_profile("Luz", {"effect": "static"})
        res = aura.set_startup_profile("Fantasma", True)
        self.assertEqual(res, {"ok": False, "err": 'Profile "Fantasma" does not exist.'})
        self.assertEqual(aura.set_startup_profile("Luz", True),
                         {"ok": True, "apply_on_startup": True, "startup_profile": "Luz"})
        self.assertEqual(aura.set_startup_profile("Luz", False),
                         {"ok": True, "apply_on_startup": False, "startup_profile": None})
        # habilitar sin nombre no activa nada
        self.assertEqual(aura.set_startup_profile("", True),
                         {"ok": True, "apply_on_startup": False, "startup_profile": None})

    def test_set_startup_write_failure(self):
        with mock.patch.object(aura, "write_atomic", side_effect=OSError("ro")):
            self.assertFalse(aura.set_startup_profile(None, False)["ok"])

    def test_invalid_state_does_not_save(self):
        res = aura.save_profile("malo", {"effect": "static", "colour": "nope"})
        self.assertFalse(res["ok"])
        self.assertIn("color", res["err"])
        self.assertFalse(self.aura_file.exists())

    def test_profile_with_hostile_stored_state_is_not_applied(self):
        # un aura.json editado a mano con un perfil de arranque envenenado
        self.aura_file.parent.mkdir(parents=True)
        self.aura_file.write_text(json.dumps({
            "apply_on_startup": True, "startup_profile": "x",
            "profiles": [{"name": "x", "state": {"effect": "static", "colour": "ff0000 --zone Key1"}}],
        }))
        res = aura.apply_startup_profile()
        self.assertFalse(res["ok"])
        self.assertEqual(self.cap.applied(), [])


class StartupProfile(AuraCase):
    def test_nothing_to_apply(self):
        self.assertEqual(aura.apply_startup_profile(), {"ok": True, "skipped": True})
        self.assertEqual(self.cap.applied(), [])

    def test_named_profile_applied(self):
        aura.save_profile("Rojo", {"effect": "static", "colour": "ff0000"}, apply_on_startup=True,
                          startup_profile="Rojo")
        res = aura.apply_startup_profile()
        self.assertTrue(res["ok"])
        self.assertEqual(res["source"], "startup_profile")
        self.assertEqual(self.cap.applied()[1], [ASUSCTL, "aura", "effect", "static", "--colour", "ff0000"])

    def test_named_profile_missing(self):
        self.aura_file.parent.mkdir(parents=True)
        self.aura_file.write_text(json.dumps({"apply_on_startup": True, "startup_profile": "Z"}))
        res = aura.apply_startup_profile()
        self.assertEqual(res, {"ok": False, "err": 'Startup profile "Z" was not found.'})

    def test_last_applied_fallback(self):
        aura.apply_state({"effect": "rainbow-cycle", "speed": "low"})
        self.cap.calls.clear()
        res = aura.apply_startup_profile()
        self.assertTrue(res["ok"])
        self.assertEqual(res["source"], "last_applied")
        self.assertEqual(self.cap.applied()[1], [ASUSCTL, "aura", "effect", "rainbow-cycle", "--speed", "low"])


# ------------------------------------------------------------------ snapshot

class Snapshot(AuraCase):
    def test_mode_grid_reflects_hardware_and_music_source(self):
        self.music_binary = "/fake/bin/pw-record"
        snap = aura.AuraManager().snapshot(force=True)
        grid = {t["id"]: t for t in snap["mode_grid"]}
        self.assertEqual(list(grid), ["static", "breathe", "pulse", "rainbow-cycle", "rainbow-wave",
                                      "music", "stars", "smart", "adaptive"])
        for tid in ("static", "breathe", "pulse", "rainbow-cycle", "rainbow-wave"):
            self.assertTrue(grid[tid]["supported"], tid)
            self.assertIsNone(grid[tid]["reason"])
        # asusd no lo anuncia (mode 4 no está en "0 1 2 3 10")
        self.assertFalse(grid["stars"]["supported"])
        self.assertIn("not supported", grid["stars"]["reason"])
        self.assertTrue(grid["music"]["supported"])
        self.assertEqual(grid["music"]["kind"], "software")
        for tid in ("smart", "adaptive"):
            self.assertFalse(grid[tid]["supported"])
            self.assertIn("coming later", grid[tid]["reason"])
        self.assertEqual(snap["music"], {"available": True, "source": "pw-record"})

    def test_music_unavailable_without_audio_source(self):
        snap = aura.AuraManager().snapshot(force=True)
        music = next(t for t in snap["mode_grid"] if t["id"] == "music")
        self.assertFalse(music["supported"])
        self.assertEqual(music["reason"], "PipeWire / pw-record unavailable")
        self.assertEqual(snap["music"], {"available": False, "source": None})

    def test_asusd_unreachable_keeps_all_effects_and_flags_unknown(self):
        self.cap.busctl_ids = None
        self.aura_file.parent.mkdir(parents=True)
        self.aura_file.write_text(json.dumps({"unsupported_effects": ["static"]}))
        snap = aura.AuraManager().snapshot(force=True)
        ids = [fx["id"] for fx in snap["asus"]["effects"]]
        self.assertNotIn("static", ids)
        self.assertIn("stars", ids)
        static = next(t for t in snap["mode_grid"] if t["id"] == "static")
        self.assertFalse(static["supported"])
        self.assertIn("asusctl is not responding", static["reason"])

    def test_basic_and_extra_effects_split(self):
        snap = aura.AuraManager().snapshot(force=True)
        self.assertEqual([fx["id"] for fx in snap["asus"]["basic_effects"]],
                         ["static", "breathe", "rainbow-cycle", "rainbow-wave"])
        self.assertEqual([fx["id"] for fx in snap["asus"]["extra_effects"]], ["pulse"])
        self.assertEqual(snap["asus"]["current_brightness"], "med")
        self.assertEqual(snap["config_path"], str(self.aura_file))

    def test_without_any_tool(self):
        self.with_asusctl = False
        snap = aura.AuraManager().snapshot(force=True)
        self.assertFalse(snap["available"])
        self.assertIn("asusctl", snap["asus"]["hint"])
        self.assertIn("OpenRGB", snap["openrgb"]["hint"])
        self.assertFalse(snap["openrgb"]["sdk_reachable"])
        self.assertEqual(snap["asus"]["effects"], [])
        self.assertIsNone(snap["asus"]["current_brightness"])

    def test_current_state_from_last_applied_and_invalid_last_applied(self):
        aura.apply_state({"effect": "static", "colour": "123456"})
        snap = aura.AuraManager().snapshot(force=True)
        self.assertEqual(snap["current"]["colour"], "123456")
        st = self.store()
        st["last_applied"] = {"effect": "disco"}
        aura._save_store(st)
        self.assertIsNone(aura.AuraManager().snapshot(force=True)["current"])

    def test_cache_ttl_and_deep_copy(self):
        mgr = aura.AuraManager()
        first = mgr.snapshot()
        busctl_before = sum(1 for c in self.cap.calls if c[0] == "busctl")
        first["asus"]["effects"].clear()  # mutar la copia no contamina la caché
        again = mgr.snapshot()
        self.assertEqual(sum(1 for c in self.cap.calls if c[0] == "busctl"), busctl_before)
        self.assertTrue(again["asus"]["effects"])
        mgr.snapshot(force=True)
        self.assertGreater(sum(1 for c in self.cap.calls if c[0] == "busctl"), busctl_before)

    def test_profiles_and_startup_in_snapshot(self):
        aura.save_profile("P", {"effect": "static"}, apply_on_startup=True, startup_profile="P")
        snap = aura.AuraManager().snapshot(force=True)
        self.assertEqual([p["name"] for p in snap["profiles"]], ["P"])
        self.assertTrue(snap["apply_on_startup"])
        self.assertEqual(snap["startup_profile"], "P")


class FakeSocket:
    def __init__(self, code=0, boom=False):
        self.code, self.boom, self.closed, self.addr = code, boom, False, None

    def settimeout(self, t):
        self.timeout = t

    def connect_ex(self, addr):
        self.addr = addr
        if self.boom:
            raise OSError("net down")
        return self.code

    def close(self):
        self.closed = True


class Peripherals(unittest.TestCase):
    def test_openrgb_sdk_probe_uses_localhost_only_and_closes(self):
        for code, boom, expected in ((0, False, True), (111, False, False), (0, True, False)):
            sock = FakeSocket(code, boom)
            fake_mod = mock.Mock(AF_INET=2, SOCK_STREAM=1)
            fake_mod.socket.return_value = sock
            with mock.patch.object(aura, "socket", fake_mod):
                self.assertIs(aura.AuraManager._openrgb_sdk_available(), expected)
            self.assertEqual(sock.addr, ("127.0.0.1", 6742))
            self.assertTrue(sock.closed)

    def test_detect_known_peripherals_from_fake_sysfs(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d) / "hidraw"
            entries = {
                "hidraw0": "DRIVER=hid\nHID_ID=0003:0000258A:0000010C\n",   # conocido (cable)
                "hidraw1": "HID_ID=0003:00003554:0000FA09\n",                # conocido (dongle)
                "hidraw2": "HID_ID=0003:00001234:00005678\n",                # desconocido
                "hidraw3": "sin hid id\n",
            }
            for name, text in entries.items():
                (root / name / "device").mkdir(parents=True)
                (root / name / "device" / "uevent").write_text(text)
            (root / "hidraw4" / "device").mkdir(parents=True)  # uevent ausente
            with mock.patch.object(aura, "Path", lambda p: root if p == "/sys/class/hidraw" else Path(p)):
                found = aura.AuraManager._detect_peripherals()
        found.sort(key=lambda f: f["vid_pid"])  # mismo nombre: el orden de glob no es estable
        self.assertEqual([(f["link"], f["vid_pid"], f["hidraw"], f["supported"]) for f in found], [
            ("cable", "258a:010c", "hidraw0", False),
            ("dongle 2.4G", "3554:fa09", "hidraw1", False),
        ])
        self.assertTrue(all(f["name"] == "Unsupported Sinowealth RGB keyboard" for f in found))


# ----------------------------------------------------------------------- CLI

class Cli(AuraCase):
    def call(self, argv):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = aura.main(argv)
        return rc, json.loads(buf.getvalue())

    def test_state_command(self):
        rc, out = self.call(["state"])
        self.assertEqual(rc, 0)
        self.assertTrue(out["available"])
        self.assertEqual(out["asus"]["binary"], ASUSCTL)

    def test_apply_command_runs_only_expected_argv(self):
        rc, out = self.call(["apply", "--json", json.dumps({"effect": "static", "colour": "0a0b0c"})])
        self.assertEqual((rc, out["ok"]), (0, True))
        self.assertEqual(self.cap.applied()[1], [ASUSCTL, "aura", "effect", "static", "--colour", "0a0b0c"])

    def test_unknown_or_missing_command_exits_via_argparse(self):
        for argv in ([], ["explota"], ["apply"]):
            with self.subTest(argv=argv), contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as ctx:
                    aura.main(argv)
                self.assertEqual(ctx.exception.code, 2)

    def test_apply_invalid_state_prints_json_error_instead_of_traceback(self):
        rc, out = self.call(["apply", "--json", json.dumps({"effect": "static", "colour": "zz"})])
        self.assertEqual(rc, 0)
        self.assertFalse(out["ok"])
        self.assertIn("color", out["err"])
        self.assertEqual(self.cap.applied(), [])

    def test_apply_malformed_or_non_object_json_prints_json_error(self):
        for text in ("{no json", "[1, 2]", "null", '"x"'):
            with self.subTest(text=text):
                rc, out = self.call(["apply", "--json", text])
                self.assertEqual(rc, 0)
                self.assertFalse(out["ok"])
        self.assertEqual(self.cap.applied(), [])

    def test_profile_commands(self):
        rc, out = self.call(["save-profile", "--name", "CLI", "--json", json.dumps({"effect": "static"})])
        self.assertTrue(out["ok"])
        rc, out = self.call(["save-profile", "--name", "mal", "--json", json.dumps({"effect": "x"})])
        self.assertFalse(out["ok"])
        rc, out = self.call(["set-startup", "--name", "CLI", "--enabled"])
        self.assertEqual(out, {"ok": True, "apply_on_startup": True, "startup_profile": "CLI"})
        rc, out = self.call(["apply-startup"])
        self.assertEqual(out["source"], "startup_profile")
        rc, out = self.call(["delete-profile", "--name", "CLI"])
        self.assertTrue(out["ok"])
        rc, out = self.call(["delete-profile", "--name", "CLI"])
        self.assertFalse(out["ok"])


if __name__ == "__main__":
    unittest.main()
