"""N-B-01: CLI (cli.py / __main__.py) con App, lectores y subprocess falsos.

Nada lee /sys ni /proc reales, no se lanza Electron y no hace falta TTY.
"""

import contextlib
import io
import json
import runpy
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from rog_monitor import __version__, cli


def run_main(argv):
    """Ejecuta cli.main(argv) capturando stdout/stderr; devuelve (rc, out, err)."""
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        rc = cli.main(argv)
    return rc, out.getvalue(), err.getvalue()


def parse_fail(argv):
    """parse_args que debe terminar con SystemExit; devuelve (code, stderr)."""
    err = io.StringIO()
    with contextlib.redirect_stderr(err), contextlib.redirect_stdout(io.StringIO()):
        try:
            cli.parse_args(argv)
        except SystemExit as exc:
            return exc.code, err.getvalue()
    raise AssertionError(f"parse_args({argv}) no terminó con SystemExit")


class ParseArgs(unittest.TestCase):
    def test_defaults(self):
        a = cli.parse_args([])
        self.assertFalse(a.once)
        self.assertFalse(a.desktop)
        self.assertFalse(a.json)
        self.assertFalse(a.json_stream)
        self.assertFalse(a.procs_all)
        self.assertFalse(a.no_gpu)
        self.assertIsNone(a.interval)
        self.assertIsNone(a.theme)
        self.assertIsNone(a.lang)

    def test_each_boolean_flag_sets_only_itself(self):
        flags = {
            "--once": "once", "--desktop": "desktop", "--json": "json",
            "--json-stream": "json_stream", "--procs-all": "procs_all",
            "--no-gpu": "no_gpu",
        }
        for flag, attr in flags.items():
            with self.subTest(flag=flag):
                ns = vars(cli.parse_args([flag]))
                self.assertTrue(ns[attr])
                others = [k for k in flags.values() if k != attr]
                self.assertFalse(any(ns[k] for k in others))

    def test_interval_is_float(self):
        self.assertEqual(cli.parse_args(["--interval", "2.5"]).interval, 2.5)
        self.assertEqual(cli.parse_args(["--interval", "3"]).interval, 3.0)
        self.assertIsInstance(cli.parse_args(["--interval", "3"]).interval, float)

    def test_interval_invalid_exits_2_with_message(self):
        code, err = parse_fail(["--interval", "abc"])
        self.assertEqual(code, 2)
        self.assertIn("--interval", err)
        self.assertIn("invalid float value", err)

    def test_interval_missing_value_exits_2(self):
        code, err = parse_fail(["--interval"])
        self.assertEqual(code, 2)
        self.assertIn("expected one argument", err)

    def test_theme_choices(self):
        for theme in ("rog", "ice", "matrix"):
            self.assertEqual(cli.parse_args(["--theme", theme]).theme, theme)
        code, err = parse_fail(["--theme", "rainbow"])
        self.assertEqual(code, 2)
        self.assertIn("invalid choice", err)

    def test_lang_choices(self):
        for lang in ("es", "en"):
            self.assertEqual(cli.parse_args(["--lang", lang]).lang, lang)
        code, _ = parse_fail(["--lang", "fr"])
        self.assertEqual(code, 2)

    def test_unknown_flag_exits_2(self):
        code, err = parse_fail(["--nope"])
        self.assertEqual(code, 2)
        self.assertIn("unrecognized arguments", err)

    def test_version_prints_and_exits_0(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            with self.assertRaises(SystemExit) as cm:
                cli.parse_args(["--version"])
        self.assertEqual(cm.exception.code, 0)
        self.assertEqual(out.getvalue().strip(), f"rog-monitor {__version__}")

    def test_help_exits_0_and_lists_flags(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            with self.assertRaises(SystemExit) as cm:
                cli.parse_args(["--help"])
        self.assertEqual(cm.exception.code, 0)
        for flag in ("--once", "--json-stream", "--procs-all", "--desktop", "--interval"):
            self.assertIn(flag, out.getvalue())

    def test_combined_flags(self):
        a = cli.parse_args(["--json-stream", "--interval", "0.5", "--no-gpu",
                            "--theme", "ice", "--lang", "en"])
        self.assertTrue(a.json_stream)
        self.assertEqual((a.interval, a.no_gpu, a.theme, a.lang), (0.5, True, "ice", "en"))


def make_fake_app_class():
    """App falso: reutiliza los run_* reales de App pero sin construir lectores.

    Los lectores (procs, rapl) son Mocks y snapshot_json devuelve JSON fijo,
    así que run_json/run_once ejecutan su lógica real sin tocar el sistema.
    """
    from rog_monitor.app import App

    class FakeApp(App):
        instances = []
        snapshots = None  # iterador de líneas o excepciones

        def __init__(self, args):
            self.args = args
            self.interval = args.interval or 1.0
            self.procs = mock.Mock()
            self.rapl = mock.Mock()
            self.t = lambda key, **kw: key
            self.calls = []
            self.log_errors = 0
            FakeApp.instances.append(self)

        def snapshot_json(self):
            item = next(FakeApp.snapshots)
            if isinstance(item, BaseException):
                raise item
            return item

        def sample(self):
            return {"fake": True}

        def _log_error(self):
            self.log_errors += 1

        def run(self):
            self.calls.append("run")

    return FakeApp


class MainModes(unittest.TestCase):
    def setUp(self):
        self.FakeApp = make_fake_app_class()
        self.FakeApp.instances = []
        self.FakeApp.snapshots = iter(())
        p = mock.patch("rog_monitor.app.App", self.FakeApp)
        p.start()
        self.addCleanup(p.stop)
        # nunca dormir de verdad
        sp = mock.patch("time.sleep")
        self.sleep = sp.start()
        self.addCleanup(sp.stop)

    def test_json_prints_one_valid_snapshot_rc0(self):
        snap = {"schema": 1, "cpu": {"load": 12.5}, "gpu": None}
        self.FakeApp.snapshots = iter([json.dumps(snap)])
        rc, out, _ = run_main(["--json"])
        self.assertEqual(rc, 0)
        self.assertEqual(json.loads(out), snap)
        self.assertEqual(out.count("\n"), 1)
        app = self.FakeApp.instances[0]
        # prime de lectores por delta antes de la foto
        app.procs.read.assert_called_once_with()
        app.rapl.read_watts.assert_called_once_with()
        self.sleep.assert_called_once_with(0.5)

    def test_json_passes_parsed_args_to_app(self):
        self.FakeApp.snapshots = iter(["{}"])
        run_main(["--json", "--no-gpu", "--interval", "2", "--theme", "matrix", "--lang", "es"])
        a = self.FakeApp.instances[0].args
        self.assertTrue(a.json and a.no_gpu)
        self.assertEqual((a.interval, a.theme, a.lang), (2.0, "matrix", "es"))

    def test_once_renders_through_ui_build_rc0(self):
        with mock.patch("rog_monitor.app.ui.build", return_value="ONCE-RENDERED") as build:
            rc, out, _ = run_main(["--once"])
        self.assertEqual(rc, 0)
        self.assertIn("ONCE-RENDERED", out)
        build.assert_called_once()
        self.assertEqual(build.call_args.args[0], {"fake": True})
        self.sleep.assert_called_once_with(0.5)
        self.assertEqual(self.FakeApp.instances[0].calls, [])  # no entró al bucle TUI

    def test_no_flags_runs_interactive_loop(self):
        rc, out, _ = run_main([])
        self.assertEqual(rc, 0)
        self.assertEqual(out, "")
        self.assertEqual(self.FakeApp.instances[0].calls, ["run"])

    def test_json_stream_emits_ndjson_until_interrupt(self):
        lines = [json.dumps({"n": i}) for i in range(3)]
        self.FakeApp.snapshots = iter(lines + [KeyboardInterrupt()])
        rc, out, _ = run_main(["--json-stream", "--interval", "0.25"])
        self.assertEqual(rc, 0)
        parsed = [json.loads(line) for line in out.splitlines()]
        self.assertEqual(parsed, [{"n": 0}, {"n": 1}, {"n": 2}])

    def test_json_stream_survives_a_failing_snapshot(self):
        self.FakeApp.snapshots = iter(
            ['{"n": 0}', RuntimeError("boom"), '{"n": 2}', KeyboardInterrupt()])
        rc, out, _ = run_main(["--json-stream"])
        self.assertEqual(rc, 0)
        self.assertEqual([json.loads(x) for x in out.splitlines()], [{"n": 0}, {"n": 2}])
        self.assertEqual(self.FakeApp.instances[0].log_errors, 1)

    def test_json_stream_closed_pipe_ends_cleanly_rc0(self):
        """Consumidor que cierra el pipe (p. ej. `| head -1`): salida limpia."""
        class ClosedPipe:
            def write(self, _):
                raise BrokenPipeError

            def flush(self):
                raise BrokenPipeError

        self.FakeApp.snapshots = iter(['{"n": 0}'] * 5)
        with mock.patch.object(sys, "stdout", ClosedPipe()):
            rc = cli.main(["--json-stream"])
        self.assertEqual(rc, 0)
        # se detuvo en la primera línea: quedan 4 sin consumir
        self.assertEqual(len(list(self.FakeApp.snapshots)), 4)

    def test_json_stream_primes_readers_and_paces_with_interval(self):
        self.FakeApp.snapshots = iter(['{"n": 0}', KeyboardInterrupt()])
        run_main(["--json-stream", "--interval", "4"])
        app = self.FakeApp.instances[0]
        app.procs.read.assert_called_once_with()
        app.rapl.read_watts.assert_called_once_with()
        self.assertEqual(self.sleep.call_args_list[0], mock.call(0.5))
        pacing = self.sleep.call_args_list[1].args[0]
        self.assertTrue(0.0 <= pacing <= 4.0)

    def test_json_takes_precedence_over_once(self):
        self.FakeApp.snapshots = iter(['{"x": 1}'])
        rc, out, _ = run_main(["--json", "--once"])
        self.assertEqual(rc, 0)
        self.assertEqual(json.loads(out), {"x": 1})


def _stat_line(pid, comm, utime, stime, rss, cpu=3):
    """Línea /proc/<pid>/stat mínima válida (52 campos)."""
    tail = ["S", "1"] + ["0"] * 9 + [str(utime), str(stime)] + ["0"] * 8
    tail += [str(rss)] + ["0"] * 14 + [str(cpu)] + ["0"] * 10
    return f"{pid} ({comm}) " + " ".join(tail)


class ProcsAll(unittest.TestCase):
    def test_procs_all_json_with_fake_reader(self):
        rows = [{"pid": 7, "name": "a", "cpu": 1.5, "cpu_core": 12.0,
                 "mem_mb": 3, "last_cpu": 2},
                {"pid": 9, "name": "b", "cpu": 0.0, "cpu_core": 0.0,
                 "mem_mb": 1, "last_cpu": None}]
        reader = mock.Mock()
        reader.read.side_effect = [[], rows]
        with mock.patch("rog_monitor.procs.ProcReader", return_value=reader), \
                mock.patch("time.sleep") as sleep:
            rc, out, _ = run_main(["--procs-all"])
        self.assertEqual(rc, 0)
        self.assertEqual(json.loads(out), {"procs": rows, "count": 2})
        self.assertEqual(reader.read.call_args_list, [
            mock.call(top=1, include_idle=True),
            mock.call(top=100000, include_idle=True),
        ])
        sleep.assert_called_once_with(0.5)

    def test_procs_all_does_not_build_app(self):
        reader = mock.Mock()
        reader.read.return_value = []
        with mock.patch("rog_monitor.procs.ProcReader", return_value=reader), \
                mock.patch("time.sleep"), \
                mock.patch("rog_monitor.app.App") as app:
            rc, out, _ = run_main(["--procs-all"])
        self.assertEqual(rc, 0)
        self.assertEqual(json.loads(out), {"procs": [], "count": 0})
        app.assert_not_called()

    def test_procs_all_end_to_end_on_fake_proc_tree(self):
        """ProcReader real sobre un /proc falso: JSON válido y deltas correctos."""
        from rog_monitor import procs

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "42").mkdir()
            (root / "42" / "stat").write_text(_stat_line(42, "busy", 10, 0, 256))
            totals = iter([1000, 1000, 1100])  # ctor, 1ª lectura, 2ª lectura
            real_path = Path

            def fake_path(p):
                return root if p == "/proc" else real_path(p)

            def bump(*_):
                (root / "42" / "stat").write_text(_stat_line(42, "busy", 30, 0, 256))

            with mock.patch.object(procs, "Path", fake_path), \
                    mock.patch.object(procs, "_total_jiffies", lambda: next(totals)), \
                    mock.patch("time.sleep", side_effect=bump):
                rc, out, _ = run_main(["--procs-all"])
        self.assertEqual(rc, 0)
        data = json.loads(out)
        self.assertEqual(data["count"], 1)
        row = data["procs"][0]
        self.assertEqual((row["pid"], row["name"], row["last_cpu"]), (42, "busy", 3))
        self.assertEqual(row["cpu"], 20.0)  # (30-10)*100/(1100-1000)


class Desktop(unittest.TestCase):
    def test_desktop_spawns_start_sh_detached_and_returns_0(self):
        with mock.patch("subprocess.Popen") as popen, \
                mock.patch("rog_monitor.app.App") as app:
            rc, out, _ = run_main(["--desktop"])
        self.assertEqual(rc, 0)
        self.assertEqual(out, "")
        app.assert_not_called()
        popen.assert_called_once()
        argv = popen.call_args.args[0]
        self.assertEqual(argv[0], "bash")
        script = Path(argv[1])
        self.assertEqual(script.name, "start.sh")
        self.assertEqual(script.parent.name, "desktop")
        self.assertTrue(script.is_absolute())
        kw = popen.call_args.kwargs
        self.assertTrue(kw["start_new_session"])
        self.assertEqual(kw["stdin"], subprocess.DEVNULL)
        self.assertEqual(kw["stdout"], subprocess.DEVNULL)
        self.assertEqual(kw["stderr"], subprocess.DEVNULL)

    def test_desktop_script_directory_exists_in_repo_layout(self):
        with mock.patch("subprocess.Popen") as popen:
            run_main(["--desktop"])
        self.assertTrue(Path(popen.call_args.args[0][1]).parent.is_dir())

    def test_procs_all_wins_over_desktop(self):
        reader = mock.Mock()
        reader.read.return_value = []
        with mock.patch("rog_monitor.procs.ProcReader", return_value=reader), \
                mock.patch("time.sleep"), mock.patch("subprocess.Popen") as popen:
            rc, out, _ = run_main(["--procs-all", "--desktop"])
        self.assertEqual(rc, 0)
        popen.assert_not_called()
        self.assertEqual(json.loads(out)["count"], 0)


class ModuleEntryPoint(unittest.TestCase):
    def test_python_m_rog_monitor_exits_with_main_rc(self):
        for rc in (0, 3):
            with self.subTest(rc=rc), \
                    mock.patch("rog_monitor.cli.main", return_value=rc) as main, \
                    mock.patch.object(sys, "argv", ["rog-monitor"]):
                with self.assertRaises(SystemExit) as cm:
                    runpy.run_module("rog_monitor.__main__", run_name="__main__")
                self.assertEqual(cm.exception.code, rc)
                main.assert_called_once_with()

    def test_import_of_main_module_does_not_run_cli(self):
        with mock.patch("rog_monitor.cli.main") as main:
            ns = runpy.run_module("rog_monitor.__main__", run_name="not_main")
        main.assert_not_called()
        self.assertIn("main", ns)


if __name__ == "__main__":
    unittest.main()
