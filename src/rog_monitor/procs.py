"""Top processes by instantaneous CPU usage, computed from /proc deltas."""

import os
import signal
from pathlib import Path

PAGE_KB = os.sysconf("SC_PAGE_SIZE") // 1024

# ponytail: signal.alarm is the zero-dep ceiling — 1 s is plenty for /proc;
# this entire module runs in the main Python thread so SIGALRM lands here.
_SCAN_TIMEOUT_S = 1  # hard cap on the full /proc scan


class _Timeout(Exception):
    pass


def _alarm_handler(signum, frame):  # noqa: ARG001
    raise _Timeout


def _total_jiffies() -> int:
    try:
        with open("/proc/stat") as fh:
            return sum(int(x) for x in fh.readline().split()[1:])
    except (OSError, ValueError):
        return 0


class ProcReader:
    def __init__(self):
        self._last: dict[int, int] = {}
        self._last_total = _total_jiffies()
        # Última lista COMPLETA de procesos activos (con last_cpu) del ciclo
        # más reciente. by_core() la reusa para agrupar por núcleo sin volver
        # a recorrer /proc.
        self._last_rows: list[dict] = []

    def read(self, top: int = 5, include_idle: bool = False) -> list[dict]:
        total = _total_jiffies()
        dt = total - self._last_total
        ncpu = os.cpu_count() or 1
        current: dict[int, int] = {}
        rows = []

        old_handler = signal.signal(signal.SIGALRM, _alarm_handler)
        signal.alarm(_SCAN_TIMEOUT_S)
        try:
            for entry in Path("/proc").iterdir():
                if not entry.name.isdigit():
                    continue
                pid = int(entry.name)
                try:
                    stat = (entry / "stat").read_text()
                except OSError:
                    continue
                # comm may contain spaces/parens: split around the last ')'
                rparen = stat.rfind(")")
                comm = stat[stat.find("(") + 1 : rparen]
                fields = stat[rparen + 2 :].split()
                try:
                    jiffies = int(fields[11]) + int(fields[12])  # utime + stime
                    rss_pages = int(fields[21])
                    # field 39 (1-based) = processor: last logical CPU this task ran
                    # on. Index 36 here because fields[] starts after "comm) ".
                    last_cpu = int(fields[36]) if len(fields) > 36 else None
                except (IndexError, ValueError):
                    continue
                current[pid] = jiffies
                prev = self._last.get(pid)
                if prev is None or dt <= 0:
                    continue
                # % of the WHOLE CPU (all cores); cpu_core is the top-style
                # per-core figure (100 = one full core)
                cpu = (jiffies - prev) * 100 / dt
                if cpu <= 0 and not include_idle:
                    continue
                rows.append(
                    {
                        "pid": pid,
                        "name": comm[:24],
                        "cpu": round(cpu, 1),
                        "cpu_core": round(cpu * ncpu, 1),
                        "mem_mb": rss_pages * PAGE_KB // 1024,
                        "last_cpu": last_cpu,
                    }
                )
        except _Timeout:
            # Scan exceeded 1 s — return whatever we managed to collect.
            # State is partially updated; next cycle will re-delta from here.
            pass
        finally:
            signal.alarm(0)
            signal.signal(signal.SIGALRM, old_handler)

        self._last = current
        self._last_total = total
        # cpu desc; mem como desempate para que la lista completa (include_idle)
        # ponga primero lo que más consume y no quede arbitraria entre los idle.
        rows.sort(key=lambda r: (r["cpu"], r["mem_mb"]), reverse=True)
        # by_core() reusa la lista del ciclo normal (top); cuando pedimos la lista
        # completa (one-shot CLI) no contaminamos el estado compartido.
        if not include_idle:
            self._last_rows = rows
        return rows[:top]

    def by_core(self, per_core: int = 5) -> dict[int, list[dict]]:
        """Procesos activos agrupados por núcleo lógico (last_cpu) del último
        ciclo de read(). Devuelve {cpu_logico: [procesos top ...]}.

        Pensado para la vista de detalle por núcleo: cada lista trae hasta
        `per_core` procesos ordenados por uso de CPU. Degrada elegante: si
        last_cpu no está disponible (kernel exótico), simplemente no aparecen.
        """
        out: dict[int, list[dict]] = {}
        for row in self._last_rows:
            cpu = row.get("last_cpu")
            if cpu is None:
                continue
            out.setdefault(cpu, []).append(row)
        for cpu in out:
            out[cpu].sort(key=lambda r: r["cpu"], reverse=True)
            out[cpu] = out[cpu][:per_core]
        return out

    def top_memory(self, top: int = 8) -> list[dict]:
        """Top processes by resident RAM (no deltas needed)."""
        rows = []
        for entry in Path("/proc").iterdir():
            if not entry.name.isdigit():
                continue
            try:
                stat = (entry / "stat").read_text()
            except OSError:
                continue
            rparen = stat.rfind(")")
            comm = stat[stat.find("(") + 1 : rparen]
            fields = stat[rparen + 2 :].split()
            try:
                rss_pages = int(fields[21])
            except (IndexError, ValueError):
                continue
            mem = rss_pages * PAGE_KB // 1024
            if mem > 0:
                rows.append({"pid": int(entry.name), "name": comm[:24], "mem_mb": mem})
        rows.sort(key=lambda r: r["mem_mb"], reverse=True)
        return rows[:top]


if __name__ == "__main__":
    # Minimal self-check: two read() cycles should produce valid dicts without
    # hanging. Run with: python -m rog_monitor.procs
    import time

    reader = ProcReader()
    r1 = reader.read(top=5)
    time.sleep(0.2)
    r2 = reader.read(top=5)
    assert isinstance(r2, list), "read() must return a list"
    for row in r2:
        assert "pid" in row and "cpu" in row and "mem_mb" in row, f"bad row: {row}"
    print(f"OK: {len(r2)} procs, top cpu={r2[0]['cpu'] if r2 else 'n/a'}%")
