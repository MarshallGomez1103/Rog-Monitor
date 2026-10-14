"""Cached: valor con TTL refrescado en un hilo daemon (el tick nunca espera)."""

import threading
import time


class Cached:
    """get() devuelve siempre el último valor bueno; si está vencido dispara el
    refresco en segundo plano. La primera lectura es síncrona (arranque) salvo
    con sync_first=False: entonces también va en segundo plano y get() devuelve
    `initial` mientras tanto (para lecturas que pueden tardar segundos).

    fn() devuelve None (o lanza) cuando falla: se conserva el valor anterior
    (stale-while-error) y el reintento se espacia ttl*2^fallos hasta backoff_max
    (0 = reintentar cada ttl).
    """

    def __init__(self, fn, ttl: float, backoff_max: float = 0.0,
                 sync_first: bool = True, initial=None):
        self.fn = fn
        self.ttl = ttl
        self.backoff_max = backoff_max
        self.value = initial
        self._due = 0.0
        self._fails = 0
        self._started = not sync_first
        self._busy = False
        self._lock = threading.Lock()

    def refresh_now(self):
        """Refresco síncrono (arranque o force)."""
        try:
            new = self.fn()
        except Exception:
            new = None
        if new is None:
            self._fails += 1
            delay = self.ttl
            if self.backoff_max:
                delay = min(self.ttl * 2 ** self._fails, self.backoff_max)
        else:
            self.value = new
            self._fails = 0
            delay = self.ttl
        self._due = time.monotonic() + delay
        return self.value

    def _bg(self):
        try:
            self.refresh_now()
        finally:
            self._busy = False

    def get(self):
        if not self._started:
            self._started = True
            return self.refresh_now()
        if time.monotonic() >= self._due:
            with self._lock:
                if self._busy:
                    return self.value
                self._busy = True
            threading.Thread(target=self._bg, daemon=True).start()
        return self.value

    def invalidate(self) -> None:
        self._due = 0.0
