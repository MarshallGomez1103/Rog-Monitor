"""Non-blocking single-key reader for the terminal (POSIX)."""

import select
import sys

try:
    import termios
    import tty
except ImportError:  # non-POSIX fallback
    termios = None


class KeyReader:
    def __init__(self):
        self.fd = None
        self._saved = None

    def __enter__(self):
        if termios is not None and sys.stdin.isatty():
            self.fd = sys.stdin.fileno()
            self._saved = termios.tcgetattr(self.fd)
            tty.setcbreak(self.fd)
            # claim mouse events: otherwise the terminal scrolls its own
            # buffer on wheel input and the alternate-screen UI "se descuadra"
            sys.stdout.write("\x1b[?1000h")
            sys.stdout.flush()
        return self

    def __exit__(self, *exc):
        if self._saved is not None:
            sys.stdout.write("\x1b[?1000l")
            sys.stdout.flush()
            termios.tcsetattr(self.fd, termios.TCSADRAIN, self._saved)
        return False

    def get(self, timeout: float = 0.0) -> str | None:
        if self.fd is None:
            return None
        ready, _, _ = select.select([sys.stdin], [], [], timeout)
        if not ready:
            return None
        ch = sys.stdin.read(1)
        if ch != "\x1b":
            return ch
        # escape sequence (mouse/arrows): drain and ignore it
        while select.select([sys.stdin], [], [], 0.01)[0]:
            sys.stdin.read(1)
        return None
