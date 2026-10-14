"""game_session.py: ciclo de vida de una sesión (start/sample/stop/get/list/
note/delete/baseline), procesos que aparecen y desaparecen, resumen y energía,
comparación, estados inválidos y CLI.

Todo en un directorio temporal (SESSIONS_DIR parcheado). Reloj, UUID y lectores
de sensores son falsos: no se lee hardware real, no se lanza ni se mata ningún
proceso y nunca se toca ~/.local/share real.
"""
import contextlib
import io
import json
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from rog_monitor import game_session as gs

T0 = 1_000_000.0
STARTED = datetime.fromtimestamp(T0, timezone.utc).isoformat()


def args(**kw):
    return SimpleNamespace(**kw)


class FakeProcs:
    """ProcReader falso: la 1.ª lectura de cada instancia (calentamiento) es
    vacía; las siguientes sirven los cuadros de `frames` en orden."""

    frames: list = []

    def __init__(self):
        self.calls = 0

    def read(self):
        self.calls += 1
        if self.calls == 1:
            return []
        return FakeProcs.frames.pop(0) if FakeProcs.frames else []


def fake_cpu(avg=55.0):
    return mock.Mock(read=mock.Mock(return_value={"avg": avg}))


class Base(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.dir = Path(tmp.name) / "game-sessions"
        self.clock = [T0]
        FakeProcs.frames = []
        patches = [
            mock.patch.object(gs, "SESSIONS_DIR", self.dir),
            mock.patch.object(gs, "time", SimpleNamespace(time=lambda: self.clock[0])),
            mock.patch.object(gs, "_now_iso", lambda: "2026-10-14T00:00:00+00:00"),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def save(self, sid, **kw):
        s = {"id": sid, "started_at": STARTED, "ended_at": None, "baseline": False,
             "game": None, "samples": [], "summary": None}
        s.update(kw)
        gs._save_session(s)
        return s

    def readers(self, gpu=None, fans=None, watts=12.5, ram=40.0, cpu_avg=55.0):
        """Parchea _Readers' componentes con fakes; devuelve el ExitStack."""
        gpu = gpu if gpu is not None else {"active": {"temp": 60, "power": 80.0, "util": 90}}
        fans = fans if fans is not None else [
            {"label": "cpu_fan", "rpm": 3000}, {"label": "gpu_fan", "rpm": 3100},
            {"label": "mid_fan", "rpm": 3200}]
        stack = contextlib.ExitStack()
        self.addCleanup(stack.close)
        for name, obj in (
            ("scan", mock.Mock(return_value={})),
            ("Config", mock.Mock()),
            ("CpuReader", mock.Mock(return_value=fake_cpu(cpu_avg))),
            ("GpuReader", mock.Mock(return_value=mock.Mock(read=mock.Mock(return_value=gpu)))),
            ("FanReader", mock.Mock(return_value=mock.Mock(read=mock.Mock(return_value=fans)))),
            ("RaplReader", mock.Mock(return_value=mock.Mock(read_watts=mock.Mock(return_value=watts)))),
            ("ProcReader", FakeProcs),
            ("_ram_percent", mock.Mock(return_value=ram)),
        ):
            stack.enter_context(mock.patch.object(gs, name, obj))
        return stack


class RamPercent(unittest.TestCase):
    def meminfo(self, text):
        return mock.patch("builtins.open", mock.mock_open(read_data=text))

    def test_uses_memavailable(self):
        with self.meminfo("MemTotal: 1000 kB\nMemFree: 100 kB\nMemAvailable: 250 kB\n"):
            self.assertEqual(gs._ram_percent(), 75.0)

    def test_falls_back_to_memfree(self):
        with self.meminfo("MemTotal: 1000 kB\nMemFree: 400 kB\n"):
            self.assertEqual(gs._ram_percent(), 60.0)

    def test_zero_total_is_none(self):
        with self.meminfo("MemTotal: 0 kB\nMemFree: 0 kB\n"):
            self.assertIsNone(gs._ram_percent())

    def test_missing_fields_or_garbage_is_none(self):
        with self.meminfo("Cached: 5 kB\n"):
            self.assertIsNone(gs._ram_percent())
        with self.meminfo("MemTotal: mucho kB\nMemFree: 1 kB\n"):
            self.assertIsNone(gs._ram_percent())
        with self.meminfo("MemTotal:\nMemFree: 1 kB\n"):
            self.assertIsNone(gs._ram_percent())

    def test_unreadable_is_none(self):
        with mock.patch("builtins.open", side_effect=PermissionError):
            self.assertIsNone(gs._ram_percent())


class DetectGame(unittest.TestCase):
    def test_skips_system_and_monitor_processes(self):
        procs = [
            {"name": "steamwebhelper", "pid": 1, "cpu": 90},
            {"name": "rog-monitor-helper", "pid": 2, "cpu": 80},
            {"name": "Electron Helper", "pid": 3, "cpu": 70},
            {"name": "", "pid": 4, "cpu": 60},
            {"pid": 5, "cpu": 55},
            {"name": "Cyberpunk2077.exe", "pid": 6, "cpu": 50},
            {"name": "other", "pid": 7, "cpu": 10},
        ]
        self.assertEqual(gs._detect_game(procs),
                         {"name": "Cyberpunk2077.exe", "pid": 6, "cpu": 50})

    def test_none_when_only_system_processes_or_empty(self):
        self.assertIsNone(gs._detect_game([{"name": "bash", "pid": 1, "cpu": 5}]))
        self.assertIsNone(gs._detect_game([]))


class Readers(Base):
    def test_sample_maps_every_metric(self):
        with self.readers():
            FakeProcs.frames = [[{"name": "hl2_linux", "pid": 42, "cpu": 33.0}]]
            s = gs._Readers().sample(12.34)
        self.assertEqual(s["t"], 12.3)
        self.assertEqual(s["ts"], "2026-10-14T00:00:00+00:00")
        self.assertEqual((s["cpu_temp"], s["gpu_temp"], s["gpu_watts"], s["gpu_util"]),
                         (55.0, 60, 80.0, 90))
        self.assertEqual((s["cpu_watts"], s["ram_percent"]), (12.5, 40.0))
        self.assertEqual((s["fan_cpu_rpm"], s["fan_gpu_rpm"], s["fan_mid_rpm"]), (3000, 3100, 3200))
        self.assertEqual(s["game"], {"name": "hl2_linux", "pid": 42, "cpu": 33.0})

    def test_sample_with_gpu_asleep_and_no_fans_yields_nones(self):
        with self.readers(gpu={"active": None}, fans=[], watts=None, ram=None):
            s = gs._Readers().sample(0)
        for key in ("gpu_temp", "gpu_watts", "gpu_util", "fan_cpu_rpm", "fan_gpu_rpm",
                    "fan_mid_rpm", "cpu_watts", "ram_percent", "game"):
            self.assertIsNone(s[key], key)

    def test_constructor_primes_delta_readers(self):
        with self.readers():
            r = gs._Readers()
        self.assertEqual(r.procs.calls, 1)
        r.rapl.read_watts.assert_called_once_with()


class Paths(unittest.TestCase):
    def test_session_path_strips_unsafe_characters(self):
        p = gs._session_path("../../etc/passwd")
        self.assertEqual(p.parent, gs.SESSIONS_DIR)
        self.assertEqual(p.name, "etcpasswd.json")

    def test_session_path_empty_and_long_ids(self):
        self.assertEqual(gs._session_path("!!!").name, "session.json")
        self.assertEqual(len(gs._session_path("a" * 200).stem), 80)

    def test_samples_sidecar_does_not_match_json_glob(self):
        side = gs._samples_path("abc")
        self.assertEqual(side.name, "abc.samples.ndjson")
        self.assertFalse(side.match("*.json"))


class StartSample(Base):
    def test_start_creates_open_baseline_session(self):
        with mock.patch.object(gs.uuid, "uuid4", return_value=SimpleNamespace(hex="abcdef123456")):
            res = gs.cmd_start(args())
        self.assertEqual(res, {"ok": True, "session_id": "1000000-abcdef", "baseline": True})
        saved = json.loads((self.dir / "1000000-abcdef.json").read_text())
        self.assertEqual(saved["started_at"], "2026-10-14T00:00:00+00:00")
        self.assertIsNone(saved["ended_at"])
        self.assertEqual(saved["samples"], [])
        self.assertIsNone(saved["summary"])

    def test_only_first_session_is_baseline(self):
        first = gs.cmd_start(args())
        self.clock[0] += 1
        second = gs.cmd_start(args())
        self.assertTrue(first["baseline"])
        self.assertFalse(second["baseline"])
        self.assertNotEqual(first["session_id"], second["session_id"])

    def test_has_baseline_ignores_corrupt_files(self):
        self.dir.mkdir()
        (self.dir / "bad.json").write_text("{no")
        self.assertFalse(gs._has_baseline())
        self.save("ok", baseline=True)
        self.assertTrue(gs._has_baseline())

    def test_sample_unknown_session(self):
        res = gs.cmd_sample(args(id="nope"))
        self.assertEqual(res, {"ok": False, "err": "sesión nope no encontrada"})

    def test_sample_on_ended_session_is_rejected_and_writes_nothing(self):
        self.save("s", ended_at="2026-10-14T01:00:00+00:00")
        res = gs.cmd_sample(args(id="s"))
        self.assertEqual(res, {"ok": False, "err": "la sesión ya terminó"})
        self.assertFalse(gs._samples_path("s").exists())

    def test_sample_appends_to_sidecar_and_counts(self):
        self.save("s")
        main_before = (self.dir / "s.json").read_text()
        with self.readers():
            self.clock[0] = T0 + 5.04
            r1 = gs.cmd_sample(args(id="s"))
            self.clock[0] = T0 + 6.0
            r2 = gs.cmd_sample(args(id="s"))
        self.assertTrue(r1["ok"] and r2["ok"])
        self.assertEqual((r1["count"], r2["count"]), (1, 2))
        self.assertEqual((r1["sample"]["t"], r2["sample"]["t"]), (5.0, 6.0))
        lines = gs._samples_path("s").read_text().splitlines()
        self.assertEqual([json.loads(x)["t"] for x in lines], [5.0, 6.0])
        # sin juego detectado el JSON principal no se reescribe (O(1) por muestra)
        self.assertEqual((self.dir / "s.json").read_text(), main_before)

    def test_game_appears_and_disappears_is_recorded_once(self):
        self.save("s")
        FakeProcs.frames = [
            [{"name": "bash", "pid": 1, "cpu": 1}],                       # nada aún
            [{"name": "witcher3.exe", "pid": 9, "cpu": 70}],              # aparece
            [{"name": "otro.exe", "pid": 10, "cpu": 60}],                 # otro; no pisa
            [],                                                           # desaparece
        ]
        results = []
        with self.readers():
            for i in range(4):
                self.clock[0] = T0 + i + 1
                results.append(gs.cmd_sample(args(id="s")))
        games = [r["sample"]["game"] for r in results]
        self.assertIsNone(games[0])
        self.assertEqual(games[1]["name"], "witcher3.exe")
        self.assertEqual(games[2]["name"], "otro.exe")
        self.assertIsNone(games[3])
        self.assertEqual(results[3]["count"], 4)
        stored = json.loads((self.dir / "s.json").read_text())["game"]
        self.assertEqual(stored["name"], "witcher3.exe")  # el primero detectado se conserva

    def test_sample_reports_error_when_sidecar_is_unwritable(self):
        self.save("s")
        gs._samples_path("s").mkdir()  # un directorio donde iría el archivo
        with self.readers():
            res = gs.cmd_sample(args(id="s"))
        self.assertFalse(res["ok"])
        self.assertIn("no se pudo guardar la muestra", res["err"])


class StopGetList(Base):
    def run_session(self, sid, n=3, **readers):
        self.save(sid)
        with self.readers(**readers):
            for i in range(n):
                self.clock[0] = T0 + (i + 1) * 10
                gs.cmd_sample(args(id=sid))

    def test_stop_unknown_session(self):
        self.assertEqual(gs.cmd_stop(args(id="x")), {"ok": False, "err": "sesión x no encontrada"})

    def test_stop_summarizes_persists_and_removes_sidecar(self):
        self.run_session("s")
        res = gs.cmd_stop(args(id="s"))
        self.assertTrue(res["ok"])
        sess = res["session"]
        self.assertEqual(sess["ended_at"], "2026-10-14T00:00:00+00:00")
        self.assertEqual(len(sess["samples"]), 3)
        self.assertEqual(sess["summary"]["_sample_count"], 3)
        self.assertEqual(sess["summary"]["_duration_s"], 30.0)
        self.assertEqual(sess["summary"]["cpu_temp"], {"min": 55.0, "max": 55.0, "avg": 55.0})
        # 20 s entre primera y última muestra... 12.5 W * 20 s / 3600
        self.assertEqual(sess["summary"]["_energy_wh"]["cpu"], round(12.5 * 20 / 3600, 4))
        on_disk = json.loads((self.dir / "s.json").read_text())
        self.assertEqual(len(on_disk["samples"]), 3)
        self.assertFalse(gs._samples_path("s").exists())

    def test_stop_twice_is_idempotent(self):
        self.run_session("s", n=2)
        first = gs.cmd_stop(args(id="s"))["session"]
        self.clock[0] += 999
        with mock.patch.object(gs, "_now_iso", lambda: "OTRA-HORA"):
            second = gs.cmd_stop(args(id="s"))["session"]
        self.assertEqual(second["ended_at"], first["ended_at"])
        self.assertEqual(second["summary"], first["summary"])

    def test_stop_with_no_samples_gives_empty_summary(self):
        self.save("s")
        res = gs.cmd_stop(args(id="s"))
        summ = res["session"]["summary"]
        self.assertEqual(summ["_sample_count"], 0)
        self.assertEqual(summ["_duration_s"], 0.0)
        self.assertIsNone(summ["_game"])
        self.assertEqual(summ["_energy_wh"], {"cpu": None, "gpu": None, "total": None})
        self.assertEqual(summ["cpu_temp"], {"min": None, "max": None, "avg": None})

    def test_get_open_session_merges_sidecar_but_ended_does_not(self):
        self.save("s")
        with open(gs._samples_path("s"), "w") as fh:
            fh.write('{"t": 1.0, "cpu_temp": 50}\nbasura\n{"t": 2.0, "cpu_temp": 60}\n')
        res = gs.cmd_get(args(id="s"))
        self.assertEqual([x["t"] for x in res["session"]["samples"]], [1.0, 2.0])
        self.save("e", ended_at="2026-10-14T01:00:00+00:00")
        with open(gs._samples_path("e"), "w") as fh:
            fh.write('{"t": 1.0}\n')
        self.assertEqual(gs.cmd_get(args(id="e"))["session"]["samples"], [])

    def test_get_unknown_and_corrupt(self):
        self.assertFalse(gs.cmd_get(args(id="zzz"))["ok"])
        self.dir.mkdir(parents=True, exist_ok=True)
        (self.dir / "roto.json").write_text("{")
        self.assertEqual(gs.cmd_get(args(id="roto")), {"ok": False, "err": "sesión roto no encontrada"})

    def test_list_empty_dir_missing(self):
        self.assertEqual(gs.cmd_list(args()), {"ok": True, "sessions": []})

    def test_list_orders_newest_first_and_skips_corrupt(self):
        self.save("100-a", note="n1")
        self.save("300-c", baseline=True, game={"name": "g"})
        self.save("200-b")
        (self.dir / "400-roto.json").write_text("{")
        res = gs.cmd_list(args())
        self.assertEqual([s["id"] for s in res["sessions"]], ["300-c", "200-b", "100-a"])
        self.assertTrue(res["sessions"][0]["baseline"])
        self.assertEqual(res["sessions"][0]["game"], {"name": "g"})
        self.assertEqual(res["sessions"][2]["note"], "n1")
        self.assertNotIn("samples", res["sessions"][0])

    def test_baseline_requires_ended_baseline(self):
        self.assertEqual(gs.cmd_baseline(args()), {"ok": True, "session_id": None})
        self.save("1-a", baseline=True)  # sigue abierta
        self.assertIsNone(gs.cmd_baseline(args())["session_id"])
        self.save("2-b", baseline=True, ended_at="x")
        self.assertEqual(gs.cmd_baseline(args())["session_id"], "2-b")

    def test_baseline_skips_corrupt_files(self):
        self.dir.mkdir()
        (self.dir / "0-bad.json").write_text("nada")
        self.save("1-ok", baseline=True, ended_at="x")
        self.assertEqual(gs.cmd_baseline(args())["session_id"], "1-ok")


class NoteDelete(Base):
    def test_note_is_saved_and_truncated(self):
        self.save("s")
        self.assertEqual(gs.cmd_note(args(id="s", text="hola")), {"ok": True, "note": "hola"})
        long = gs.cmd_note(args(id="s", text="x" * 900))
        self.assertEqual(len(long["note"]), 500)
        self.assertEqual(json.loads((self.dir / "s.json").read_text())["note"], "x" * 500)

    def test_note_none_text_and_unknown_session(self):
        self.save("s")
        self.assertEqual(gs.cmd_note(args(id="s", text=None))["note"], "")
        self.assertFalse(gs.cmd_note(args(id="nope", text="a"))["ok"])

    def test_note_on_open_session_keeps_samples_in_sidecar(self):
        self.save("s")
        with open(gs._samples_path("s"), "w") as fh:
            fh.write('{"t": 1.0}\n')
        gs.cmd_note(args(id="s", text="n"))
        self.assertEqual(json.loads((self.dir / "s.json").read_text())["samples"], [])
        self.assertEqual(len(gs._load_session("s")["samples"]), 1)

    def test_delete_removes_session_and_orphan_sidecar(self):
        self.save("s")
        gs._samples_path("s").write_text('{"t": 1}\n')
        self.save("keep")
        self.assertEqual(gs.cmd_delete(args(id="s")), {"ok": True})
        self.assertFalse((self.dir / "s.json").exists())
        self.assertFalse(gs._samples_path("s").exists())
        self.assertTrue((self.dir / "keep.json").exists())

    def test_delete_unknown_session_reports_error(self):
        self.dir.mkdir()
        res = gs.cmd_delete(args(id="fantasma"))
        self.assertFalse(res["ok"])
        self.assertIn("fantasma", res["err"])

    def test_delete_cannot_escape_sessions_dir(self):
        outside = self.dir.parent / "etcpasswd.json"
        outside.write_text("no tocar")
        self.dir.mkdir()
        gs.cmd_delete(args(id="../etc/passwd"))
        self.assertTrue(outside.exists())


class Summary(unittest.TestCase):
    def test_min_max_avg_rounded_and_none_values_skipped(self):
        samples = [
            {"t": 0, "cpu_temp": 50.04, "gpu_temp": None},
            {"t": 1, "cpu_temp": 60.0},
            {"t": 2, "cpu_temp": 70.06, "gpu_temp": 80},
        ]
        s = gs.summarize(samples)
        self.assertEqual(s["cpu_temp"], {"min": 50.0, "max": 70.1, "avg": 60.0})
        self.assertEqual(s["gpu_temp"], {"min": 80, "max": 80, "avg": 80})
        self.assertEqual(s["fan_cpu_rpm"], {"min": None, "max": None, "avg": None})
        self.assertEqual(s["_duration_s"], 2.0)
        self.assertEqual(s["_sample_count"], 3)

    def test_most_frequent_game_wins(self):
        g = lambda n: {"game": {"name": n}}
        samples = [{"t": 0, **g("a")}, {"t": 1, **g("b")}, {"t": 2, **g("b")},
                   {"t": 3, "game": None}]
        self.assertEqual(gs.summarize(samples)["_game"], "b")

    def test_trapezoid_energy(self):
        samples = [{"t": 0, "cpu_watts": 10.0, "gpu_watts": 100.0},
                   {"t": 10, "cpu_watts": 30.0, "gpu_watts": 100.0},
                   {"t": 20, "cpu_watts": 30.0, "gpu_watts": None}]
        e = gs.summarize(samples)["_energy_wh"]
        self.assertEqual(e["cpu"], round((20 * 10 + 30 * 10) / 3600, 4))
        self.assertEqual(e["gpu"], round(100 * 10 / 3600, 4))  # solo 2 pares válidos
        self.assertEqual(e["total"], round(e["cpu"] + e["gpu"], 4))

    def test_energy_skips_non_increasing_time_and_needs_two_points(self):
        self.assertIsNone(gs._integrate_wh([{"t": 0, "cpu_watts": 5}], "cpu_watts"))
        self.assertIsNone(gs._integrate_wh([{"t": None, "cpu_watts": 5},
                                            {"t": 1, "cpu_watts": 5}], "cpu_watts"))
        self.assertEqual(gs._integrate_wh([{"t": 5, "x": 10}, {"t": 5, "x": 10},
                                           {"t": 3, "x": 10}], "x"), 0.0)

    def test_energy_total_with_only_one_component(self):
        e = gs._energy_wh([{"t": 0, "gpu_watts": 36.0}, {"t": 100, "gpu_watts": 36.0}])
        self.assertEqual(e, {"cpu": None, "gpu": 1.0, "total": 1.0})


def closed(sid, **avgs):
    summary = {m: {"min": None, "max": None, "avg": avgs.get(m)} for m in gs.METRICS}
    summary["_energy_wh"] = {"cpu": 1.0, "gpu": 2.0, "total": 3.0}
    summary["_duration_s"] = 60.0
    return {"id": sid, "baseline": sid == "a", "game": {"name": "g"}, "summary": summary,
            "ended_at": "x", "samples": []}


class Compare(Base):
    def test_cooler_run_is_better_with_headline_on_gpu(self):
        a = closed("a", cpu_temp=80.0, gpu_temp=80.0, fan_cpu_rpm=5000.0)
        b = closed("b", cpu_temp=70.0, gpu_temp=60.0, fan_cpu_rpm=4000.0)
        res = gs.compare_sessions(a, b)
        self.assertEqual(res["verdict"], "better")
        self.assertEqual(res["headline_metric"], "gpu_temp")
        self.assertEqual(res["headline_diff_percent"], -25.0)
        self.assertEqual(res["diffs"]["cpu_temp"], {"a_avg": 80.0, "b_avg": 70.0, "diff_percent": -12.5})
        self.assertEqual(res["a"], {"id": "a", "baseline": True, "game": {"name": "g"},
                                    "energy_wh": {"cpu": 1.0, "gpu": 2.0, "total": 3.0},
                                    "duration_s": 60.0})
        self.assertFalse(res["b"]["baseline"])

    def test_hotter_run_is_worse(self):
        res = gs.compare_sessions(closed("a", cpu_temp=60.0, gpu_temp=60.0),
                                  closed("b", cpu_temp=70.0, gpu_temp=75.0))
        self.assertEqual(res["verdict"], "worse")
        self.assertEqual(res["headline_diff_percent"], 25.0)

    def test_gpu_util_higher_is_improvement(self):
        res = gs.compare_sessions(closed("a", gpu_util=50.0), closed("b", gpu_util=80.0))
        self.assertEqual(res["verdict"], "better")

    def test_changes_under_one_percent_are_equal(self):
        res = gs.compare_sessions(closed("a", cpu_temp=100.0), closed("b", cpu_temp=100.5))
        self.assertEqual(res["verdict"], "equal")
        self.assertEqual(res["diffs"]["cpu_temp"]["diff_percent"], 0.5)

    def test_mixed_results_balance_to_equal(self):
        res = gs.compare_sessions(closed("a", cpu_temp=60.0, gpu_temp=60.0),
                                  closed("b", cpu_temp=50.0, gpu_temp=70.0))
        self.assertEqual(res["verdict"], "equal")

    def test_headline_falls_back_to_cpu_and_zero_baseline_has_no_diff(self):
        res = gs.compare_sessions(closed("a", cpu_temp=50.0, gpu_watts=0.0),
                                  closed("b", cpu_temp=40.0, gpu_watts=30.0))
        self.assertEqual(res["headline_metric"], "cpu_temp")
        self.assertEqual(res["headline_diff_percent"], -20.0)
        self.assertIsNone(res["diffs"]["gpu_watts"]["diff_percent"])

    def test_no_comparable_data_is_equal_without_headline(self):
        res = gs.compare_sessions(closed("a"), closed("b"))
        self.assertEqual(res["verdict"], "equal")
        self.assertIsNone(res["headline_diff_percent"])

    def test_pct_diff_edge_cases(self):
        self.assertIsNone(gs._pct_diff(None, 5))
        self.assertIsNone(gs._pct_diff(5, None))
        self.assertIsNone(gs._pct_diff(0, 5))
        self.assertEqual(gs._pct_diff(-10, -5), 50.0)

    def test_cmd_compare_requires_existing_and_closed_sessions(self):
        self.save("a", ended_at="x", summary=closed("a", cpu_temp=60.0)["summary"])
        self.save("open")
        self.assertEqual(gs.cmd_compare(args(a="a", b="nope")),
                         {"ok": False, "err": "una o ambas sesiones no existen"})
        res = gs.cmd_compare(args(a="a", b="open"))
        self.assertFalse(res["ok"])
        self.assertIn("cerradas", res["err"])

    def test_cmd_compare_end_to_end_from_disk(self):
        self.save("a", ended_at="x", summary=closed("a", cpu_temp=80.0)["summary"])
        self.save("b", ended_at="x", summary=closed("b", cpu_temp=60.0)["summary"])
        res = gs.cmd_compare(args(a="a", b="b"))
        self.assertTrue(res["ok"])
        self.assertEqual(res["verdict"], "better")
        self.assertEqual(res["a"]["id"], "a")


class Cli(Base):
    def run_main(self, argv):
        out, err = io.StringIO(), io.StringIO()
        code = None
        with redirect_stdout(out), redirect_stderr(err):
            try:
                code = gs.main(argv)
            except SystemExit as exc:
                code = exc.code
        return code, out.getvalue(), err.getvalue()

    def test_start_list_note_get_delete_roundtrip(self):
        code, out, _ = self.run_main(["start"])
        self.assertEqual(code, 0)
        sid = json.loads(out)["session_id"]
        self.assertEqual(out.count("\n"), 1)  # exactamente UNA línea JSON
        _, out, _ = self.run_main(["note", "--id", sid, "--text", "prueba"])
        self.assertEqual(json.loads(out), {"ok": True, "note": "prueba"})
        _, out, _ = self.run_main(["list"])
        self.assertEqual(json.loads(out)["sessions"][0]["note"], "prueba")
        _, out, _ = self.run_main(["get", "--id", sid])
        self.assertEqual(json.loads(out)["session"]["id"], sid)
        _, out, _ = self.run_main(["stop", "--id", sid])
        self.assertEqual(json.loads(out)["session"]["summary"]["_sample_count"], 0)
        _, out, _ = self.run_main(["baseline"])
        self.assertEqual(json.loads(out)["session_id"], sid)
        _, out, _ = self.run_main(["delete", "--id", sid])
        self.assertEqual(json.loads(out), {"ok": True})
        _, out, _ = self.run_main(["list"])
        self.assertEqual(json.loads(out)["sessions"], [])

    def test_sample_via_cli_uses_fake_readers(self):
        self.save("s")
        self.clock[0] = T0 + 3
        with self.readers():
            _, out, _ = self.run_main(["sample", "--id", "s"])
        res = json.loads(out)
        self.assertTrue(res["ok"])
        self.assertEqual(res["count"], 1)

    def test_compare_via_cli(self):
        self.save("a", ended_at="x", summary=closed("a", cpu_temp=80.0)["summary"])
        self.save("b", ended_at="x", summary=closed("b", cpu_temp=80.0)["summary"])
        _, out, _ = self.run_main(["compare", "--a", "a", "--b", "b"])
        self.assertEqual(json.loads(out)["verdict"], "equal")

    def test_missing_subcommand_or_required_arg_exits_2(self):
        for argv in ([], ["stop"], ["compare", "--a", "x"], ["inexistente"]):
            code, out, err = self.run_main(argv)
            self.assertEqual(code, 2, argv)
            self.assertEqual(out, "")
            self.assertIn("usage", err)


if __name__ == "__main__":
    unittest.main()
