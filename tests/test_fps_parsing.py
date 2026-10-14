"""N-B-03: parseo de logs CSV de MangoHud (rog_monitor.fps).

Regla de oro: ante cualquier falta de dato (archivo ausente, truncado, basura,
log viejo) el resultado es None; nunca se inventa un FPS. Todo vive en
directorios temporales; HOME, la ruta de MangoHud.conf y el reloj se inyectan.
"""

import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from rog_monitor import fps

NOW = 1_800_000_000.0
# Preámbulo de info de sistema + cabecera + filas, como escribe MangoHud.
PREAMBLE = "os,cpu,gpu,ram,kernel,driver,cpuscheduler\nBazzite,i9,RTX,32000,7.2,595,bore\n"
HEADER = "fps,frametime,cpu_load,gpu_load\n"


class FpsBase(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="rogfps-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.logs = self.tmp / "logs"
        self.logs.mkdir()
        self.conf = self.tmp / "MangoHud.conf"
        self.default_dir = self.tmp / "default-logs"
        for target, value in (
            ("MANGOHUD_CONF", self.conf),
            ("DEFAULT_LOG_DIR", self.default_dir),
        ):
            p = mock.patch.object(fps, target, value)
            p.start()
            self.addCleanup(p.stop)
        clock = mock.patch.object(fps.time, "time", return_value=NOW)
        clock.start()
        self.addCleanup(clock.stop)

    def write_csv(self, name, text, age=0.0, folder=None):
        path = (folder or self.logs) / name
        path.write_text(text)
        os.utime(path, (NOW - age, NOW - age))
        return path


class LastFps(FpsBase):
    def test_valid_log_returns_last_row(self):
        p = self.write_csv("a.csv", PREAMBLE + HEADER + "60.2,16.6,10,50\n143.46,7.0,12,60\n")
        self.assertEqual(fps._last_fps(p), 143.5)

    def test_header_without_preamble(self):
        p = self.write_csv("a.csv", HEADER + "75,13.3,1,2\n")
        self.assertEqual(fps._last_fps(p), 75.0)

    def test_fps_column_not_first(self):
        p = self.write_csv("a.csv", "frametime, FPS ,gpu\n16.6,59.94,1\n8.3,120.04,2\n")
        self.assertEqual(fps._last_fps(p), 120.0)

    def test_missing_file_is_none(self):
        self.assertIsNone(fps._last_fps(self.logs / "no-existe.csv"))

    def test_empty_file_is_none(self):
        self.assertIsNone(fps._last_fps(self.write_csv("e.csv", "")))

    def test_header_only_is_none(self):
        p = self.write_csv("h.csv", PREAMBLE + HEADER)
        self.assertIsNone(fps._last_fps(p))

    def test_no_fps_header_is_none(self):
        p = self.write_csv("x.csv", "a,b,c\n1,2,3\n4,5,6\n")
        self.assertIsNone(fps._last_fps(p))

    def test_truncated_last_row_falls_back_to_previous_complete_row(self):
        # la última fila quedó cortada: faltan columnas -> se descarta
        p = self.write_csv("t.csv", "frametime,cpu,fps\n16.6,10,60.0\n8.3,11,")
        self.assertEqual(fps._last_fps(p), 60.0)

    def test_garbage_lines_are_skipped(self):
        p = self.write_csv("g.csv", HEADER + "90,11,1,2\nxx,yy\n\x00\x01basura\n,,,\nabc,def,ghi,jkl\n")
        self.assertEqual(fps._last_fps(p), 90.0)

    def test_only_garbage_after_header_is_none(self):
        p = self.write_csv("g.csv", HEADER + "abc,1,2,3\n???\n\n")
        self.assertIsNone(fps._last_fps(p))

    def test_only_tail_of_big_file_is_read(self):
        rows = "".join(f"{30 + i % 10},16,1,1\n" for i in range(5000))
        p = self.write_csv("big.csv", HEADER + rows + "121.0,8,1,1\n")
        self.assertGreater(p.stat().st_size, fps._TAIL_BYTES * 2)
        self.assertEqual(fps._last_fps(p), 121.0)

    def test_unreadable_path_directory_is_none(self):
        d = self.logs / "dir.csv"
        d.mkdir()
        self.assertIsNone(fps._last_fps(d))


class FreshestCsv(FpsBase):
    def test_picks_newest_by_mtime(self):
        self.write_csv("old.csv", HEADER + "1,1,1,1\n", age=3.0)
        new = self.write_csv("new.csv", HEADER + "2,1,1,1\n", age=1.0)
        self.assertEqual(fps._freshest_csv(self.logs), new)

    def test_empty_folder_is_none(self):
        self.assertIsNone(fps._freshest_csv(self.logs))

    def test_missing_folder_is_none(self):
        self.assertIsNone(fps._freshest_csv(self.tmp / "nada"))

    def test_ignores_non_csv(self):
        (self.logs / "log.txt").write_text("fps\n60\n")
        self.assertIsNone(fps._freshest_csv(self.logs))

    def test_stale_log_is_none(self):
        self.write_csv("old.csv", HEADER + "60,1,1,1\n", age=fps.FRESH_SECONDS + 1)
        self.assertIsNone(fps._freshest_csv(self.logs))

    def test_log_exactly_at_threshold_is_still_fresh(self):
        p = self.write_csv("edge.csv", HEADER + "60,1,1,1\n", age=fps.FRESH_SECONDS)
        self.assertEqual(fps._freshest_csv(self.logs), p)

    def test_glob_oserror_is_none(self):
        with mock.patch.object(Path, "glob", side_effect=PermissionError("denegado")):
            self.assertIsNone(fps._freshest_csv(self.logs))


class ConfiguredLogDir(FpsBase):
    def test_no_conf_file(self):
        self.assertIsNone(fps._configured_log_dir())

    def test_conf_without_output_folder(self):
        self.conf.write_text("fps\ncpu_stats\n# output_folder=/tmp/x\n")
        self.assertIsNone(fps._configured_log_dir())

    def test_conf_with_empty_output_folder(self):
        self.conf.write_text("output_folder=\n")
        self.assertIsNone(fps._configured_log_dir())

    def test_conf_with_output_folder(self):
        self.conf.write_text(f"fps\n  output_folder = ignorado\noutput_folder={self.logs}\n")
        # la 2.ª línea tiene espacios alrededor del '=' y no cuenta como clave válida
        self.assertEqual(fps._configured_log_dir(), self.logs)

    def test_output_folder_expands_home(self):
        self.conf.write_text("output_folder=~/mi-log\n")
        with mock.patch.dict(os.environ, {"HOME": str(self.tmp)}):
            self.assertEqual(fps._configured_log_dir(), self.tmp / "mi-log")

    def test_conf_unreadable_is_none(self):
        self.conf.mkdir()  # read_text sobre un directorio -> OSError
        self.assertIsNone(fps._configured_log_dir())


class ReadFps(FpsBase):
    def test_reads_from_configured_folder(self):
        self.conf.write_text(f"output_folder={self.logs}\n")
        self.write_csv("run.csv", PREAMBLE + HEADER + "59.96,16.7,1,1\n")
        self.assertEqual(fps.read_fps(), 60.0)

    def test_falls_back_to_default_folder_without_conf(self):
        self.default_dir.mkdir()
        self.write_csv("run.csv", HEADER + "144,6.9,1,1\n", folder=self.default_dir)
        self.assertEqual(fps.read_fps(), 144.0)

    def test_configured_folder_wins_over_default(self):
        self.default_dir.mkdir()
        self.write_csv("d.csv", HEADER + "10,1,1,1\n", folder=self.default_dir)
        self.write_csv("c.csv", HEADER + "99,1,1,1\n")
        self.conf.write_text(f"output_folder={self.logs}\n")
        self.assertEqual(fps.read_fps(), 99.0)

    def test_no_logs_anywhere_is_none(self):
        self.assertIsNone(fps.read_fps())

    def test_stale_log_is_none_never_last_known_value(self):
        self.conf.write_text(f"output_folder={self.logs}\n")
        self.write_csv("run.csv", HEADER + "144,6.9,1,1\n", age=60)
        self.assertIsNone(fps.read_fps())

    def test_fresh_but_truncated_log_is_none(self):
        self.conf.write_text(f"output_folder={self.logs}\n")
        self.write_csv("run.csv", PREAMBLE)  # sin cabecera fps ni filas
        self.assertIsNone(fps.read_fps())

    def test_configured_folder_missing_does_not_fall_back_to_default(self):
        self.default_dir.mkdir()
        self.write_csv("d.csv", HEADER + "10,1,1,1\n", folder=self.default_dir)
        self.conf.write_text(f"output_folder={self.tmp / 'borrada'}\n")
        self.assertIsNone(fps.read_fps())


if __name__ == "__main__":
    unittest.main()
