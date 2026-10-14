"""N-B-02: ProcReader (procs.py) sobre un árbol /proc falso en un tmpdir.

procs.py tiene /proc fijo (``Path("/proc")``) y ``_total_jiffies`` lee
``/proc/stat``, así que los tests parchean ``procs.Path`` (solo la raíz
"/proc" se redirige al tmpdir) y ``procs._total_jiffies``. No se lee el /proc
real, ni se necesitan privilegios.
"""

import contextlib
import os
import signal
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from rog_monitor import procs


def stat_line(pid, comm, utime=0, stime=0, rss=0, cpu=3, state="S"):
    """Contenido de /proc/<pid>/stat con los campos que procs.py consume.

    Tras ") ": idx0=state, idx11=utime, idx12=stime, idx21=rss (páginas),
    idx36=processor. ``cpu=None`` acorta la línea (kernel sin campo processor).
    """
    tail = [state, "1"] + ["0"] * 9 + [str(utime), str(stime)] + ["0"] * 8
    tail += [str(rss)]
    if cpu is not None:
        tail += ["0"] * 14 + [str(cpu)] + ["0"] * 10
    return f"{pid} ({comm}) " + " ".join(tail) + "\n"


class FakeProc:
    """Árbol /proc falso + parches. Úsese como context manager."""

    def __init__(self, ncpu=4, page_kb=4):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.total = 1000
        self.ncpu = ncpu
        self.page_kb = page_kb
        self._stack = contextlib.ExitStack()

    def __enter__(self):
        real_path = Path
        root = self.root

        def fake_path(p, *a):
            return root if p == "/proc" else real_path(p, *a)

        self._stack.enter_context(mock.patch.object(procs, "Path", fake_path))
        self._stack.enter_context(
            mock.patch.object(procs, "_total_jiffies", lambda *a: self.total))
        self._stack.enter_context(mock.patch.object(procs, "PAGE_KB", self.page_kb))
        self._stack.enter_context(
            mock.patch.object(procs.os, "cpu_count", lambda: self.ncpu))
        self._stack.callback(self._tmp.cleanup)
        return self

    def __exit__(self, *exc):
        self._stack.close()

    def put(self, pid, comm="proc", **kw):
        d = self.root / str(pid)
        d.mkdir(exist_ok=True)
        (d / "stat").write_text(stat_line(pid, comm, **kw))
        return d

    def remove(self, pid):
        d = self.root / str(pid)
        (d / "stat").unlink()
        d.rmdir()


class TotalJiffies(unittest.TestCase):
    def _read(self, content):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "stat"
            if content is not None:
                p.write_text(content)
            return procs._total_jiffies(str(p))

    def test_sums_only_first_eight_fields_excluding_guest(self):
        # user nice system idle iowait irq softirq steal | guest guest_nice
        line = "cpu  1 2 3 4 5 6 7 8 900 1000\ncpu0 9 9 9 9 9 9 9 9 9 9\n"
        self.assertEqual(self._read(line), 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8)

    def test_short_line_sums_what_is_there(self):
        self.assertEqual(self._read("cpu 10 20 30\n"), 60)

    def test_missing_file_is_zero(self):
        self.assertEqual(self._read(None), 0)

    def test_garbage_is_zero(self):
        self.assertEqual(self._read("cpu abc def\n"), 0)

    def test_empty_file_is_zero(self):
        self.assertEqual(self._read(""), 0)


class ReadDeltas(unittest.TestCase):
    def test_first_read_has_no_rows_without_previous_sample(self):
        with FakeProc() as fp:
            fp.put(10, "a", utime=50, rss=1024)
            reader = procs.ProcReader()
            self.assertEqual(reader.read(top=5), [])

    def test_two_samples_compute_cpu_percent_and_core_percent(self):
        with FakeProc(ncpu=4, page_kb=4) as fp:
            fp.put(10, "worker", utime=100, stime=0, rss=2560, cpu=1)
            reader = procs.ProcReader()
            reader.read()
            fp.put(10, "worker", utime=130, stime=10, rss=2560, cpu=2)
            fp.total = 1200  # dt = 200 jiffies
            rows = reader.read()
        self.assertEqual(len(rows), 1)
        r = rows[0]
        self.assertEqual(r["pid"], 10)
        self.assertEqual(r["name"], "worker")
        self.assertEqual(r["cpu"], 20.0)        # (40 jiffies)*100/200
        self.assertEqual(r["cpu_core"], 80.0)   # 20 * 4 núcleos
        self.assertEqual(r["mem_mb"], 10)       # 2560 pág * 4 KiB // 1024 = 10 MiB
        self.assertEqual(r["last_cpu"], 2)

    def test_values_are_rounded_to_one_decimal(self):
        with FakeProc(ncpu=1) as fp:
            fp.put(1, "x", utime=0)
            reader = procs.ProcReader()
            reader.read()
            fp.put(1, "x", utime=1)
            fp.total = 1003  # 100/3 = 33.333...
            r = reader.read()[0]
        self.assertEqual(r["cpu"], 33.3)
        self.assertEqual(r["cpu_core"], 33.3)

    def test_top_selects_highest_cpu_with_mem_as_tiebreaker(self):
        with FakeProc() as fp:
            for pid, ut, rss in [(1, 0, 256), (2, 0, 512), (3, 0, 1024), (4, 0, 100)]:
                fp.put(pid, f"p{pid}", utime=ut, rss=rss)
            reader = procs.ProcReader()
            reader.read()
            fp.put(1, "p1", utime=10, rss=256)    # 10 %
            fp.put(2, "p2", utime=10, rss=512)    # 10 %, más RAM que p1
            fp.put(3, "p3", utime=50, rss=1024)   # 50 %
            fp.put(4, "p4", utime=0, rss=100)     # idle
            fp.total = 1100
            rows = reader.read(top=2)
        self.assertEqual([r["pid"] for r in rows], [3, 2])

    def test_top_limits_row_count(self):
        with FakeProc() as fp:
            for pid in range(1, 8):
                fp.put(pid, f"p{pid}", utime=0)
            reader = procs.ProcReader()
            reader.read()
            for pid in range(1, 8):
                fp.put(pid, f"p{pid}", utime=pid)
            fp.total = 1100
            self.assertEqual(len(reader.read(top=3)), 3)
            self.assertEqual(len(reader.read(top=100)), 0)  # 2ª lectura sin delta

    def test_idle_processes_excluded_unless_include_idle(self):
        with FakeProc() as fp:
            fp.put(1, "busy", utime=0)
            fp.put(2, "idle", utime=5)
            reader = procs.ProcReader()
            reader.read()
            fp.put(1, "busy", utime=10)
            fp.total = 1100
            only_active = reader.read()
            self.assertEqual([r["pid"] for r in only_active], [1])
            # tercer ciclo: ahora sin avance ninguno; include_idle los lista a todos
            fp.total = 1200
            everything = reader.read(include_idle=True)
        self.assertEqual({r["pid"]: r["cpu"] for r in everything}, {1: 0.0, 2: 0.0})

    def test_zero_or_negative_total_delta_yields_no_rows(self):
        with FakeProc() as fp:
            fp.put(1, "x", utime=0)
            reader = procs.ProcReader()
            reader.read()
            fp.put(1, "x", utime=99)
            # fp.total no avanza: dt == 0
            self.assertEqual(reader.read(include_idle=True), [])
            fp.total = 900  # retrocede (contador reiniciado): dt < 0
            self.assertEqual(reader.read(include_idle=True), [])

    def test_new_pid_appearing_between_samples_is_skipped_until_next_cycle(self):
        with FakeProc() as fp:
            fp.put(1, "old", utime=0)
            reader = procs.ProcReader()
            reader.read()
            fp.put(1, "old", utime=10)
            fp.put(2, "new", utime=500)
            fp.total = 1100
            rows = reader.read()
            self.assertEqual([r["pid"] for r in rows], [1])
            fp.put(2, "new", utime=520)
            fp.total = 1200
            rows = reader.read()
        self.assertEqual([(r["pid"], r["cpu"]) for r in rows], [(2, 20.0)])

    def test_cpu_count_none_falls_back_to_one_core(self):
        with FakeProc() as fp:
            fp.put(1, "x", utime=0)
            reader = procs.ProcReader()
            reader.read()
            fp.put(1, "x", utime=10)
            fp.total = 1100
            with mock.patch.object(procs.os, "cpu_count", lambda: None):
                r = reader.read()[0]
        self.assertEqual(r["cpu"], 10.0)
        self.assertEqual(r["cpu_core"], 10.0)

    def test_cpu_core_scales_with_core_count(self):
        for ncpu in (1, 8, 16):
            with self.subTest(ncpu=ncpu), FakeProc(ncpu=ncpu) as fp:
                fp.put(1, "x", utime=0)
                reader = procs.ProcReader()
                reader.read()
                fp.put(1, "x", utime=25)
                fp.total = 1100
                r = reader.read()[0]
                self.assertEqual(r["cpu"], 25.0)
                self.assertEqual(r["cpu_core"], 25.0 * ncpu)


class VanishingAndHostileEntries(unittest.TestCase):
    def test_pid_vanishes_between_samples(self):
        with FakeProc() as fp:
            fp.put(1, "stays", utime=0)
            fp.put(2, "gone", utime=0)
            reader = procs.ProcReader()
            reader.read()
            fp.put(1, "stays", utime=10)
            fp.remove(2)
            fp.total = 1100
            rows = reader.read(include_idle=True)
            self.assertEqual([r["pid"] for r in rows], [1])
            self.assertNotIn(2, reader._last)
            # el pid ya no está en el estado: si reaparece (reuso) se trata como nuevo
            fp.put(2, "reborn", utime=7)
            fp.put(1, "stays", utime=20)
            fp.total = 1200
            rows = reader.read(include_idle=True)
        self.assertEqual([r["pid"] for r in rows], [1])

    def test_reused_pid_never_reports_negative_cpu(self):
        """N-DEF-09: PID reutilizado (jiffies actuales < previos) se trata como nuevo."""
        for include_idle in (False, True):
            with self.subTest(include_idle=include_idle), FakeProc() as fp:
                fp.put(1, "stable", utime=0)
                fp.put(2, "oldproc", utime=500)
                reader = procs.ProcReader()
                reader.read()
                fp.put(1, "stable", utime=10)
                fp.put(2, "newproc", utime=3)   # mismo PID, proceso distinto
                fp.total = 1100
                rows = reader.read(include_idle=include_idle)
                self.assertTrue(all(r["cpu"] >= 0 and r["cpu_core"] >= 0 for r in rows), rows)
                self.assertEqual([r["pid"] for r in rows], [1])
                # el siguiente ciclo ya usa los jiffies nuevos como base
                fp.put(2, "newproc", utime=13)
                fp.total = 1200
                rows = reader.read()
                self.assertEqual({r["pid"]: r["cpu"] for r in rows}.get(2), 10.0)

    def test_pid_dir_without_stat_file_is_skipped(self):
        """El proceso muere entre iterdir() y read_text(): FileNotFoundError."""
        with FakeProc() as fp:
            fp.put(1, "ok", utime=0)
            (fp.root / "2").mkdir()
            reader = procs.ProcReader()
            reader.read()
            fp.put(1, "ok", utime=10)
            fp.total = 1100
            rows = reader.read()
        self.assertEqual([r["pid"] for r in rows], [1])

    @unittest.skipIf(os.geteuid() == 0, "root ignora los permisos de archivo")
    def test_permission_denied_on_stat_is_skipped(self):
        with FakeProc() as fp:
            fp.put(1, "ok", utime=0, rss=512)
            fp.put(2, "secret", utime=0, rss=512)
            reader = procs.ProcReader()
            reader.read()
            fp.put(1, "ok", utime=10, rss=512)
            fp.put(2, "secret", utime=10, rss=512)
            denied = fp.root / "2" / "stat"
            denied.chmod(0)
            try:
                fp.total = 1100
                rows = reader.read(include_idle=True)
                mem = reader.top_memory()
            finally:
                denied.chmod(0o644)
        self.assertEqual([r["pid"] for r in rows], [1])
        self.assertEqual([m["pid"] for m in mem], [1])

    def test_oserror_from_read_text_is_skipped_for_any_errno(self):
        """Variante determinista (vale como root): PermissionError simulado."""
        with FakeProc() as fp:
            fp.put(1, "ok", utime=0, rss=512)
            fp.put(2, "secret", utime=0, rss=512)
            real_read_text = Path.read_text

            def fake_read_text(self, *a, **kw):
                if self.parent.name == "2":
                    raise PermissionError(13, "Permission denied")
                return real_read_text(self, *a, **kw)

            reader = procs.ProcReader()
            with mock.patch.object(Path, "read_text", fake_read_text):
                reader.read()
                fp.put(1, "ok", utime=10, rss=512)
                fp.total = 1100
                rows = reader.read(include_idle=True)
                mem = reader.top_memory()
        self.assertEqual([r["pid"] for r in rows], [1])
        self.assertEqual([m["pid"] for m in mem], [1])

    def test_stat_that_is_a_directory_is_skipped(self):
        with FakeProc() as fp:
            fp.put(1, "ok", utime=0, rss=512)
            (fp.root / "2").mkdir()
            (fp.root / "2" / "stat").mkdir()   # IsADirectoryError (OSError)
            reader = procs.ProcReader()
            reader.read()
            self.assertEqual([m["pid"] for m in reader.top_memory()], [1])

    def test_non_numeric_entries_are_ignored(self):
        with FakeProc() as fp:
            fp.put(1, "ok", utime=0, rss=512)
            for name in ("self", "thread-self", "12abc", "-5"):
                (fp.root / name).mkdir()
                (fp.root / name / "stat").write_text(stat_line(99, "bogus", rss=9999))
            (fp.root / "cpuinfo").write_text("model name : fake\n")
            reader = procs.ProcReader()
            reader.read()
            fp.put(1, "ok", utime=10, rss=512)
            fp.total = 1100
            rows = reader.read()
            mem = reader.top_memory()
        self.assertEqual([r["pid"] for r in rows], [1])
        self.assertEqual([m["pid"] for m in mem], [1])

    def test_malformed_stat_files_are_skipped(self):
        bad = {
            11: "garbage without parens\n",
            12: "12 (short) S 1 2 3\n",                    # pocos campos
            13: stat_line(13, "nan", utime="x", rss=5),    # utime no numérico
            14: stat_line(14, "nan2", rss="y"),            # rss no numérico
            15: "",                                        # vacío
        }
        with FakeProc() as fp:
            fp.put(1, "ok", utime=0, rss=512)
            for pid, content in bad.items():
                (fp.root / str(pid)).mkdir()
                (fp.root / str(pid) / "stat").write_text(content)
            reader = procs.ProcReader()
            reader.read()
            fp.put(1, "ok", utime=10, rss=512)
            fp.total = 1100
            rows = reader.read(include_idle=True)
            mem = reader.top_memory(top=50)
        self.assertEqual([r["pid"] for r in rows], [1])
        self.assertEqual([m["pid"] for m in mem], [1])

    def test_scan_timeout_keeps_partial_rows(self):
        """Si el escaneo excede el tope, read()/top_memory() devuelven lo reunido."""
        with FakeProc() as fp:
            fp.put(1, "first", utime=0, rss=512)
            fp.put(2, "second", utime=0, rss=512)
            reader = procs.ProcReader()
            reader.read()
            fp.put(1, "first", utime=10, rss=512)
            fp.put(2, "second", utime=10, rss=512)
            fp.total = 1100

            class TimingOutRoot:
                def iterdir(_self):
                    yield fp.root / "1"
                    raise procs._Timeout

            with mock.patch.object(procs, "Path",
                                   lambda p, *a: TimingOutRoot() if p == "/proc" else Path(p, *a)):
                rows = reader.read()
                mem = reader.top_memory()
        self.assertEqual([r["pid"] for r in rows], [1])
        self.assertEqual([m["pid"] for m in mem], [1])
        # el estado quedó parcial pero coherente: el siguiente ciclo re-deltea
        self.assertEqual(set(reader._last), {1})


class CommParsing(unittest.TestCase):
    def test_comm_with_spaces_and_parentheses(self):
        weird = "my (weird) app)"
        with FakeProc() as fp:
            fp.put(5, weird, utime=0, rss=1024)
            reader = procs.ProcReader()
            reader.read()
            fp.put(5, weird, utime=10, rss=1024, cpu=7)
            fp.total = 1100
            r = reader.read()[0]
            mem = reader.top_memory()
        self.assertEqual(r["name"], weird)
        self.assertEqual(r["cpu"], 10.0)
        self.assertEqual(r["last_cpu"], 7)     # campos correctos pese a los paréntesis
        self.assertEqual(r["mem_mb"], 4)
        self.assertEqual(mem[0]["name"], weird)

    def test_comm_is_truncated_to_24_chars(self):
        long_name = "a" * 15 + " " + "b" * 15   # 31 caracteres
        with FakeProc() as fp:
            fp.put(5, long_name, utime=0, rss=1024)
            reader = procs.ProcReader()
            reader.read()
            fp.put(5, long_name, utime=10, rss=1024)
            fp.total = 1100
            r = reader.read()[0]
            mem = reader.top_memory()
        self.assertEqual(r["name"], long_name[:24])
        self.assertEqual(len(r["name"]), 24)
        self.assertEqual(mem[0]["name"], long_name[:24])

    def test_empty_comm(self):
        with FakeProc() as fp:
            fp.put(5, "", utime=0, rss=1024)
            self.assertEqual(procs.ProcReader().top_memory()[0]["name"], "")


class ByCore(unittest.TestCase):
    def _prime(self, fp, layout):
        """layout: {pid: (cpu_logica, jiffies_delta, rss)}; devuelve reader tras 2 ciclos."""
        for pid, (core, _, rss) in layout.items():
            fp.put(pid, f"p{pid}", utime=0, rss=rss, cpu=core)
        reader = procs.ProcReader()
        reader.read()
        for pid, (core, dj, rss) in layout.items():
            fp.put(pid, f"p{pid}", utime=dj, rss=rss, cpu=core)
        fp.total = 1100
        reader.read()
        return reader

    def test_empty_before_any_read(self):
        with FakeProc():
            self.assertEqual(procs.ProcReader().by_core(), {})

    def test_groups_by_last_cpu_sorted_by_cpu_desc(self):
        layout = {1: (0, 5, 256), 2: (0, 30, 256), 3: (2, 10, 256), 4: (0, 15, 256)}
        with FakeProc() as fp:
            grouped = self._prime(fp, layout).by_core()
        self.assertEqual(set(grouped), {0, 2})
        self.assertEqual([r["pid"] for r in grouped[0]], [2, 4, 1])
        self.assertEqual([r["pid"] for r in grouped[2]], [3])

    def test_per_core_limit(self):
        layout = {pid: (1, pid, 256) for pid in range(1, 9)}
        with FakeProc() as fp:
            reader = self._prime(fp, layout)
            self.assertEqual([r["pid"] for r in reader.by_core(per_core=3)[1]], [8, 7, 6])
            self.assertEqual(len(reader.by_core()[1]), 5)   # por defecto 5

    def test_rows_without_last_cpu_field_are_left_out(self):
        with FakeProc() as fp:
            fp.put(1, "modern", utime=0, cpu=3)
            fp.put(2, "exotic", utime=0, cpu=None)
            reader = procs.ProcReader()
            reader.read()
            fp.put(1, "modern", utime=10, cpu=3)
            fp.put(2, "exotic", utime=10, cpu=None)
            fp.total = 1100
            rows = reader.read()
            grouped = reader.by_core()
        self.assertEqual({r["pid"]: r["last_cpu"] for r in rows}, {1: 3, 2: None})
        self.assertEqual({k: [r["pid"] for r in v] for k, v in grouped.items()}, {3: [1]})

    def test_full_list_read_does_not_overwrite_by_core_state(self):
        layout = {1: (0, 10, 256)}
        with FakeProc() as fp:
            reader = self._prime(fp, layout)
            before = reader.by_core()
            fp.put(1, "p1", utime=10, rss=256, cpu=0)
            fp.put(9, "other", utime=0, rss=256, cpu=5)
            fp.total = 1200
            reader.read(top=100000, include_idle=True)   # lo que hace --procs-all
            after = reader.by_core()
        self.assertEqual(before, after)
        self.assertNotIn(5, after)


class TopMemory(unittest.TestCase):
    def test_sorted_by_rss_and_limited(self):
        with FakeProc(page_kb=4) as fp:
            fp.put(1, "small", rss=256)      # 1 MiB
            fp.put(2, "big", rss=51200)      # 200 MiB
            fp.put(3, "mid", rss=5120)       # 20 MiB
            fp.put(4, "tiny", rss=10)        # 0 MiB -> excluido
            fp.put(5, "zero", rss=0)
            reader = procs.ProcReader()
            top = reader.top_memory(top=2)
            full = reader.top_memory(top=50)
        self.assertEqual([(m["pid"], m["name"], m["mem_mb"]) for m in top],
                         [(2, "big", 200), (3, "mid", 20)])
        self.assertEqual([m["pid"] for m in full], [2, 3, 1])
        self.assertEqual(set(full[0]), {"pid", "name", "mem_mb"})

    def test_page_size_is_applied(self):
        with FakeProc(page_kb=64) as fp:   # p. ej. kernels con páginas de 64 KiB
            fp.put(1, "x", rss=32)         # 32 * 64 KiB = 2 MiB
            self.assertEqual(procs.ProcReader().top_memory()[0]["mem_mb"], 2)

    def test_needs_no_previous_sample(self):
        with FakeProc() as fp:
            fp.put(1, "x", rss=1024)
            reader = procs.ProcReader()
            self.assertEqual(reader.top_memory(), reader.top_memory())
            self.assertEqual(len(reader._last), 0)   # top_memory no toca el estado delta

    def test_empty_proc_tree(self):
        with FakeProc():
            reader = procs.ProcReader()
            self.assertEqual(reader.top_memory(), [])
            self.assertEqual(reader.read(), [])


class ScanAlarm(unittest.TestCase):
    def test_alarm_handler_raises_timeout(self):
        with self.assertRaises(procs._Timeout):
            procs._alarm_handler(signal.SIGALRM, None)

    def test_scan_alarm_installs_then_restores_handler_and_cancels_alarm(self):
        sentinel = lambda *a: None  # noqa: E731
        old = signal.signal(signal.SIGALRM, sentinel)
        try:
            with procs._scan_alarm():
                self.assertIs(signal.getsignal(signal.SIGALRM), procs._alarm_handler)
                self.assertGreaterEqual(signal.alarm(0), 0)  # había alarma armada
            self.assertIs(signal.getsignal(signal.SIGALRM), sentinel)
            self.assertEqual(signal.alarm(0), 0)             # y quedó cancelada
        finally:
            signal.signal(signal.SIGALRM, old)

    def test_scan_alarm_restores_handler_when_body_raises(self):
        sentinel = lambda *a: None  # noqa: E731
        old = signal.signal(signal.SIGALRM, sentinel)
        try:
            with self.assertRaises(ValueError):
                with procs._scan_alarm():
                    raise ValueError
            self.assertIs(signal.getsignal(signal.SIGALRM), sentinel)
            self.assertEqual(signal.alarm(0), 0)
        finally:
            signal.signal(signal.SIGALRM, old)

    def test_scan_alarm_uses_one_second_cap(self):
        self.assertEqual(procs._SCAN_TIMEOUT_S, 1)
        with mock.patch.object(procs.signal, "alarm") as alarm:
            with procs._scan_alarm():
                pass
        self.assertEqual(alarm.call_args_list, [mock.call(1), mock.call(0)])


if __name__ == "__main__":
    unittest.main()
