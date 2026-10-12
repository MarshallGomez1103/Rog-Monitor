"""Non-blocking single-key reader for the terminal (POSIX)."""

import os
import select
import time
import sys

try:
    import termios
    import tty
except ImportError:  # non-POSIX fallback
    termios = None

ESC = "\x1b"  # tecla Esc (ESC solitario) tal como la entrega KeyReader.get()
_ESC_BYTE = 0x1B


def _parse(buf: bytes) -> tuple[list[str], bytes]:
    """Separa `buf` en teclas imprimibles. Toda secuencia de escape (CSI,
    ratón SGR/X10, SS3, Alt+tecla, ESC solitario) se descarta entera.
    Devuelve (teclas, resto_incompleto)."""
    keys: list[str] = []
    i, n = 0, len(buf)
    while i < n:
        b = buf[i]
        if b != _ESC_BYTE:
            if 0x20 <= b < 0x7F:  # sólo ASCII imprimible; el resto se ignora
                keys.append(chr(b))
            i += 1
            continue
        if i + 1 >= n:
            return keys, buf[i:]  # ESC al final: ¿solitario o inicio de secuencia?
        nxt = buf[i + 1]
        if nxt == ord("["):
            if i + 2 >= n:
                return keys, buf[i:]
            if buf[i + 2] == ord("M"):  # ratón X10: ESC [ M + 3 bytes
                if i + 6 > n:
                    return keys, buf[i:]
                i += 6
                continue
            j = i + 2  # CSI: parámetros 0x30-0x3F, intermedios 0x20-0x2F, final 0x40-0x7E
            while j < n and 0x20 <= buf[j] <= 0x3F:
                j += 1
            if j >= n:
                return keys, buf[i:]
            i = j + 1 if 0x40 <= buf[j] <= 0x7E else j  # malformada: tirar sólo el prefijo
        elif nxt == ord("O"):  # SS3: ESC O x
            if i + 3 > n:
                return keys, buf[i:]
            i += 3
        elif nxt == _ESC_BYTE:
            i += 1  # ESC suelto seguido de otra secuencia
        else:
            i += 2  # Alt+tecla
    return keys, b""


class KeyReader:
    def __init__(self, fd: int | None = None):
        self.fd = fd  # None -> stdin; se resuelve en __enter__
        self._saved = None
        self._queue: list[str] = []

    def __enter__(self):
        if termios is not None:
            fd = sys.stdin.fileno() if self.fd is None else self.fd
            if os.isatty(fd):
                self.fd = fd
                self._saved = termios.tcgetattr(fd)
                tty.setcbreak(fd)
                # ponytail: ratón desactivado a propósito (CP-4.02); la TUI no lo usa
                # y los reportes de clic/rueda se colaban como teclas. Para activarlo:
                # escribir "\x1b[?1000h\x1b[?1006h" aquí y "\x1b[?1006l\x1b[?1000l"
                # en __exit__; _parse() ya descarta esos reportes.
                return self
        self.fd = None
        return self

    def __exit__(self, *exc):
        if self._saved is not None:
            termios.tcsetattr(self.fd, termios.TCSADRAIN, self._saved)
            self._saved = None
        return False

    def _read(self, timeout: float) -> bytes:
        # os.read sobre el fd: sin el buffer de sys.stdin que escondía bytes a select()
        if not select.select([self.fd], [], [], timeout)[0]:
            return b""
        try:
            return os.read(self.fd, 1024)
        except OSError:
            return b""

    def get(self, timeout: float = 0.0) -> str | None:
        if self.fd is None:
            # sin TTY no hay teclas: respetar el timeout (si no, el bucle de la TUI gira al 100 %)
            time.sleep(timeout)
            return None
        if not self._queue:
            chunk = self._read(timeout)
            keys, rest = _parse(chunk)
            for _ in range(3):  # secuencia partida entre lecturas: esperar el resto
                if not rest:
                    break
                more = self._read(0.05)
                if not more:
                    if rest == b"\x1b":
                        keys.append(ESC)  # ESC solitario = tecla Esc; secuencia truncada: se descarta
                    break
                more_keys, rest = _parse(rest + more)
                keys += more_keys
            self._queue = keys
        return self._queue.pop(0) if self._queue else None
