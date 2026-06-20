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
            # Activamos modo ratón X10 (?1000h) + SGR extendido (?1006h).
            # ?1000h captura los eventos de rueda para que el terminal no
            # haga scroll de su propio buffer y descuadre la pantalla alternativa.
            # ?1006h convierte TODOS los reportes a la forma SGR "ESC[<...M/m",
            # que está bien delimitada y es más fácil de drenar por completo.
            sys.stdout.write("\x1b[?1000h\x1b[?1006h")
            sys.stdout.flush()
        return self

    def __exit__(self, *exc):
        if self._saved is not None:
            # Deshabilitar en orden inverso al de activación
            sys.stdout.write("\x1b[?1006l\x1b[?1000l")
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

        # Secuencia de escape: drena sin bloquear y devuelve None.
        # Hay dos formatos principales de reporte de ratón:
        #   - SGR (?1006h):  ESC [ < <nums> M/m   (bien delimitado, preferido)
        #   - Clásico X10:   ESC [ M <3 bytes>     (3 bytes fijos después de 'M')
        # También llegan secuencias CSI de teclas (flechas, F1-F12, etc.).
        # La estrategia: leer byte a byte con timeout muy corto hasta que la
        # secuencia esté completa, sin consumir datos de la próxima tecla real.

        # Esperamos un primer byte tras ESC (distingue ESC solitario de ESC+seq)
        if not select.select([sys.stdin], [], [], 0.05)[0]:
            return None  # ESC solitario — ignorar

        ch2 = sys.stdin.read(1)
        if ch2 != "[":
            # ESC + algo distinto de '[' (p.ej. ESC O para SS3): drenar resto
            while select.select([sys.stdin], [], [], 0.01)[0]:
                sys.stdin.read(1)
            return None

        # Tenemos ESC '[' — leer hasta el byte terminador de la secuencia CSI
        buf = ""
        while True:
            if not select.select([sys.stdin], [], [], 0.05)[0]:
                break  # timeout: secuencia truncada, salir
            c = sys.stdin.read(1)
            buf += c
            # Los terminadores CSI son letras (0x40–0x7E).
            # Para ratón SGR termina en 'M' o 'm'; flechas en 'A'–'D'; etc.
            if c.isalpha() or c == "~":
                # Reporte clásico X10: ESC [ M + 3 bytes de coordenadas
                if c == "M" and not buf[:-1]:
                    # buf es sólo "M" → todavía nos faltan los 3 bytes de coord
                    for _ in range(3):
                        if select.select([sys.stdin], [], [], 0.05)[0]:
                            sys.stdin.read(1)
                break
        return None
