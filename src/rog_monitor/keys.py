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
        return self

    def __exit__(self, *exc):
        if self._saved is not None:
            termios.tcsetattr(self.fd, termios.TCSADRAIN, self._saved)
        return False

    def get(self, timeout: float = 0.0) -> str | None:
        if self.fd is None:
            return None
        ready, _, _ = select.select([sys.stdin], [], [], timeout)
        if ready:
            return sys.stdin.read(1)
        return None
