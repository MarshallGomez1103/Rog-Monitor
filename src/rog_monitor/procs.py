"""Top processes by instantaneous CPU usage, computed from /proc deltas."""

import os
from pathlib import Path

PAGE_KB = os.sysconf("SC_PAGE_SIZE") // 1024


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

    def read(self, top: int = 5) -> list[dict]:
        total = _total_jiffies()
        dt = total - self._last_total
        ncpu = os.cpu_count() or 1
        current: dict[int, int] = {}
        rows = []

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
            if cpu <= 0:
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

        self._last = current
        self._last_total = total
        rows.sort(key=lambda r: r["cpu"], reverse=True)
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
