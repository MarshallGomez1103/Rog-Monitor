"""La TUI debe ignorar ratón/escapes/teclas sin acción y no remuestrear por tecla."""

import fcntl
import os
import select
import signal
import struct
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

try:
    import termios
except ImportError:  # non-POSIX
    termios = None

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"

# SGR: clic izq. (press/release), rueda, clic der.; X10; flecha, SS3 y ESC solitario
CLICK = b"\x1b[<0;10;5M\x1b[<0;10;5m"
WHEEL = b"\x1b[<64;10;5M"
RIGHT = b"\x1b[<2;10;5M\x1b[<2;10;5m"
X10 = b"\x1b[M #!"
ARROW = b"\x1b[A\x1bOP"

LAUNCHER = """
import sys
sys.path.insert(0, {src!r})
from rog_monitor import app as app_mod, cli
calls = [0]
orig = app_mod.App.sample
def counted(self):
    calls[0] += 1
    return orig(self)
app_mod.App.sample = counted
try:
    cli.main(["--interval", "1.0", "--no-gpu"])
finally:
    open({out!r}, "w").write(str(calls[0]))
"""


def _pump(master, out, seconds):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if select.select([master], [], [], 0.05)[0]:
            try:
                out.append(os.read(master, 65536))
            except OSError:
                return


@unittest.skipUnless(os.name == "posix" and termios, "requiere POSIX/termios")
class KeyReaderParser(unittest.TestCase):
    def test_only_real_keys_survive(self):
        from rog_monitor.keys import KeyReader

        master, slave = os.openpty()
        try:
            with KeyReader(fd=slave) as kr:
                n = 30
                os.write(master, (CLICK + b"x" + WHEEL + RIGHT + X10 + ARROW) * n + b"\x1b")
                keys = []
                self.assertEqual(kr.get(timeout=0.2), "x")  # ESC solitario al final: se descarta
                keys.append("x")
                while (k := kr.get(timeout=0.2)) is not None:
                    keys.append(k)
                os.write(master, b"q")
                keys.append(kr.get(timeout=0.2))
            self.assertEqual(keys, ["x"] * n + ["q"])
        finally:
            os.close(master)
            os.close(slave)

    def test_sequence_split_across_reads(self):
        from rog_monitor.keys import KeyReader

        master, slave = os.openpty()
        try:
            with KeyReader(fd=slave) as kr:
                os.write(master, b"a\x1b[<0;1")
                threading.Timer(0.01, os.write, (master, b"2;5Mb")).start()
                self.assertEqual(kr.get(timeout=0.2), "a")
                self.assertEqual(kr.get(timeout=0.2), "b")
                self.assertIsNone(kr.get(timeout=0.1))
        finally:
            os.close(master)
            os.close(slave)


@unittest.skipUnless(os.name == "posix" and termios, "requiere POSIX/termios")
class TuiPty(unittest.TestCase):
    def test_noise_does_not_resample_and_exit_is_clean(self):
        with tempfile.TemporaryDirectory() as tmp:
            out_file = os.path.join(tmp, "calls")
            env = dict(os.environ, TERM="xterm-256color", PYTHONPATH=str(SRC),
                       XDG_CONFIG_HOME=tmp, XDG_DATA_HOME=tmp)
            master, slave = os.openpty()
            fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 120, 0, 0))
            started = time.monotonic()
            proc = subprocess.Popen(
                [sys.executable, "-c", LAUNCHER.format(src=str(SRC), out=out_file)],
                stdin=slave, stdout=slave, stderr=slave, env=env, cwd=tmp,
                start_new_session=True)
            os.close(slave)
            out = []
            try:
                _pump(master, out, 2.5)
                for burst in (CLICK * 3, WHEEL * 20, RIGHT, b"x1;", ARROW):
                    os.write(master, burst)
                    _pump(master, out, 0.1)
                _pump(master, out, 2.5)
                os.write(master, b"q")
                elapsed = time.monotonic() - started
                end = time.monotonic() + 8
                while proc.poll() is None and time.monotonic() < end:
                    _pump(master, out, 0.1)
                code = proc.poll()
                if code is None:
                    proc.kill()
                self.assertEqual(code, 0, "la TUI no salió con 0 tras 'q': "
                                 + b"".join(out)[-600:].decode(errors="replace"))
                _pump(master, out, 0.2)
            finally:
                os.close(master)
                if proc.poll() is None:
                    proc.kill()
                proc.wait()
            calls = int(Path(out_file).read_text())
            data = b"".join(out)
            # 1 muestra inicial + una por intervalo (1 s); ~35 eventos inyectados no cuentan
            self.assertLessEqual(calls, elapsed / 1.0 + 3,
                                 f"sample() llamado {calls} veces en {elapsed:.1f}s")
            self.assertIn(b"\x1b[?1049l", data, "no salió de la pantalla alterna")
            self.assertNotIn(b"?1000h", data, "no debe activar seguimiento de ratón")


    def test_sigterm_restores_terminal(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = dict(os.environ, TERM="xterm-256color", PYTHONPATH=str(SRC),
                       XDG_CONFIG_HOME=tmp, XDG_DATA_HOME=tmp)
            master, slave = os.openpty()
            proc = subprocess.Popen(
                [sys.executable, "-m", "rog_monitor", "--no-gpu"],
                stdin=slave, stdout=slave, stderr=slave, env=env, cwd=tmp,
                start_new_session=True)
            os.close(slave)
            out = []
            try:
                _pump(master, out, 2.5)
                proc.send_signal(signal.SIGTERM)
                end = time.monotonic() + 8
                while proc.poll() is None and time.monotonic() < end:
                    _pump(master, out, 0.1)
                code = proc.poll()
                if code is None:
                    proc.kill()
                self.assertEqual(code, 0)
                _pump(master, out, 0.2)
            finally:
                os.close(master)
                if proc.poll() is None:
                    proc.kill()
                proc.wait()
            self.assertIn(b"\x1b[?1049l", b"".join(out))


if __name__ == "__main__":
    unittest.main()
