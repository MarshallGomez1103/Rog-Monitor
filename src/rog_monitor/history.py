"""Timestamped series with rolling statistics and time-window averages."""

import time
from collections import deque


class Series:
    def __init__(self, max_seconds: int = 900):
        self.max_seconds = max_seconds
        self.samples: deque[tuple[float, float]] = deque()

    def push(self, value: float | None) -> None:
        if value is None:
            return
        now = time.monotonic()
        self.samples.append((now, float(value)))
        cutoff = now - self.max_seconds
        while self.samples and self.samples[0][0] < cutoff:
            self.samples.popleft()

    def values(self, last_seconds: float | None = None) -> list[float]:
        if last_seconds is None:
            return [v for _, v in self.samples]
        cutoff = time.monotonic() - last_seconds
        return [v for t, v in self.samples if t >= cutoff]

    def avg(self, last_seconds: float | None = None) -> float | None:
        vals = self.values(last_seconds)
        return round(sum(vals) / len(vals), 1) if vals else None

    def max(self) -> float | None:
        vals = self.values()
        return max(vals) if vals else None

    def min(self) -> float | None:
        vals = self.values()
        return min(vals) if vals else None

    def last(self) -> float | None:
        return self.samples[-1][1] if self.samples else None
