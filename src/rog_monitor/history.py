"""Timestamped series with rolling statistics and time-window averages."""

import time
from collections import deque


class Series:
    def __init__(self, max_seconds: int = 900):
        self.max_seconds = max_seconds
        self.samples: deque[tuple[float, float | None]] = deque()

    def push(self, value: float | None) -> None:
        # None SE GUARDA como hueco: así todas las series de un snapshot quedan
        # alineadas muestra a muestra (dGPU dormida -> gpu_* con huecos, misma
        # longitud que cpu_*). Consumidores null-safe: avg/min/max (saltan None),
        # graph.render (hueco), actions.export_history (celda vacía) y el
        # drawChart del renderer (corta la línea).
        now = time.monotonic()
        self.samples.append((now, None if value is None else float(value)))
        cutoff = now - self.max_seconds
        while self.samples and self.samples[0][0] < cutoff:
            self.samples.popleft()

    def values(self, last_seconds: float | None = None) -> list[float | None]:
        if last_seconds is None:
            return [v for _, v in self.samples]
        cutoff = time.monotonic() - last_seconds
        return [v for t, v in self.samples if t >= cutoff]

    def _numbers(self, last_seconds: float | None = None) -> list[float]:
        return [v for v in self.values(last_seconds) if v is not None]

    def has_data(self) -> bool:
        return any(v is not None for _, v in self.samples)

    def avg(self, last_seconds: float | None = None) -> float | None:
        vals = self._numbers(last_seconds)
        return round(sum(vals) / len(vals), 1) if vals else None

    def max(self) -> float | None:
        vals = self._numbers()
        return max(vals) if vals else None

    def min(self) -> float | None:
        vals = self._numbers()
        return min(vals) if vals else None

    def last(self) -> float | None:
        """Muestra más reciente; None si la última fue un hueco (no un dato viejo)."""
        return self.samples[-1][1] if self.samples else None
