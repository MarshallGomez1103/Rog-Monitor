"""CPU sensors: temperatures, frequency, governor/EPP, thermal throttling."""

import glob
import re
import statistics
from pathlib import Path

from . import hwmon

CPUFREQ = Path("/sys/devices/system/cpu/cpufreq")
THROTTLE_GLOB = "/sys/devices/system/cpu/cpu*/thermal_throttle/package_throttle_count"
THROTTLE_MS = "package_throttle_total_time_ms"


def khz_to_ghz(khz: float) -> float:
    """sysfs cpufreq expone kHz; la UI usa GHz."""
    return khz / 1_000_000


def read_stat(path: str = "/proc/stat") -> tuple[tuple | None, dict]:
    """(agregado, {cpu_lógica: tupla}) desde /proc/stat; cada tupla es
    (total, idle, iowait, steal) en jiffies.

    total = user+nice+system+idle+iowait+irq+softirq+steal. NO suma guest ni
    guest_nice: el kernel ya los cuenta dentro de user/nice (sumarlos duplicaba
    ese tiempo). idle incluye iowait (como top/htop); steal cuenta como ocupado.
    Una CPU offline no aparece en el archivo."""
    agg, out = None, {}
    try:
        with open(path) as fh:
            for line in fh:
                if not line.startswith("cpu"):
                    continue
                parts = line.split()
                name = parts[0]
                if name != "cpu" and not name[3:].isdigit():
                    continue
                vals = [int(x) for x in parts[1:]]
                if len(vals) < 4:
                    continue
                iowait = vals[4] if len(vals) > 4 else 0
                steal = vals[7] if len(vals) > 7 else 0
                row = (sum(vals[:8]), vals[3] + iowait, iowait, steal)
                if name == "cpu":
                    agg = row
                else:
                    out[int(name[3:])] = row
    except (OSError, ValueError):
        pass
    return agg, out


def stat_pcts(prev: tuple | None, now: tuple | None) -> dict | None:
    """% de uso/iowait/steal entre dos lecturas de read_stat, o None si no hay
    un delta fiable (primera muestra, CPU recién online, contadores que
    retroceden o delta sin ticks). Nunca devuelve un 0/100 inventado."""
    if prev is None or now is None:
        return None
    dt, di = now[0] - prev[0], now[1] - prev[1]
    dio, dst = now[2] - prev[2], now[3] - prev[3]
    if dt <= 0 or not (0 <= di <= dt) or dio < 0 or dst < 0:
        return None
    return {
        "usage": (1 - di / dt) * 100,
        "iowait": dio * 100 / dt,
        "steal": dst * 100 / dt,
    }


class CpuReader:
    def __init__(self, chips: dict, stat_path: str = "/proc/stat"):
        # Intel: coretemp. AMD: k10temp/zenpower (no per-core temps).
        self.dev = hwmon.find(chips, "coretemp", "k10temp", "zenpower")
        self.model = self._model_name()
        self._throttle_files = sorted(glob.glob(THROTTLE_GLOB))[:1]
        self._throttle_ms_files = [
            str(Path(p).with_name(THROTTLE_MS)) for p in self._throttle_files
        ]
        self.last_throttle = self._throttle_count()
        self.last_throttle_ms = self._throttle_ms()
        # Per-core: snapshot inicial de /proc/stat y mapa lógico->core_id (estático)
        self._stat_path = stat_path
        self._agg_prev, self._stat_prev = read_stat(stat_path)
        self._core_id = self._read_topology()

    @staticmethod
    def _read_topology() -> dict:
        """CPU lógica -> core_id físico (para mapear la temp por núcleo)."""
        out = {}
        for p in glob.glob("/sys/devices/system/cpu/cpu[0-9]*/topology/core_id"):
            m = re.search(r"/cpu(\d+)/", p)
            if not m:
                continue
            try:
                with open(p) as fh:
                    out[int(m.group(1))] = int(fh.read().strip())
            except (OSError, ValueError):
                pass
        return out

    @staticmethod
    def _read_per_cpu_freq() -> dict:
        """CPU lógica -> GHz actual."""
        out = {}
        for p in glob.glob("/sys/devices/system/cpu/cpu[0-9]*/cpufreq/scaling_cur_freq"):
            m = re.search(r"/cpu(\d+)/", p)
            if not m:
                continue
            khz = hwmon.read_int(Path(p))
            if khz:
                out[int(m.group(1))] = round(khz_to_ghz(khz), 2)
        return out

    @staticmethod
    def _model_name() -> str:
        try:
            with open("/proc/cpuinfo") as fh:
                for line in fh:
                    if line.startswith("model name"):
                        return line.split(":", 1)[1].strip()
        except OSError:
            pass
        return "CPU"

    @staticmethod
    def _sum_files(paths: list[str]) -> int | None:
        """Suma de enteros sysfs, o None si ningún archivo se pudo leer (N-DEF-02:
        sin sysfs de throttle no hay dato; 0 solo cuando el kernel dice 0)."""
        values = [hwmon.read_int(Path(p)) for p in paths]
        values = [v for v in values if v is not None]
        return sum(values) if values else None

    def _throttle_count(self) -> int | None:
        return self._sum_files(self._throttle_files)

    def _throttle_ms(self) -> int | None:
        return self._sum_files(self._throttle_ms_files)

    def read(self) -> dict:
        cores: list[float] = []
        core_temps_by_id: dict[int, float] = {}
        package = None
        if self.dev is not None:
            for label, temp in hwmon.temps(self.dev).items():
                low = label.lower()
                if low.startswith("core"):
                    cores.append(temp)
                    m = re.search(r"(\d+)", label)
                    if m:
                        core_temps_by_id[int(m.group(1))] = temp
                elif "package" in low or low in ("tctl", "tdie", "temp1"):
                    package = package if package is not None else temp

        if not cores and package is not None:
            cores = [package]

        freqs = []
        for path in CPUFREQ.glob("policy*/scaling_cur_freq"):
            khz = hwmon.read_int(path)
            if khz:
                freqs.append(khz_to_ghz(khz))

        policy0 = CPUFREQ / "policy0"
        throttle = self._throttle_count()
        throttle_ms = self._throttle_ms()
        # Deltas siempre numéricos (alerts.py): sin dato en alguna de las dos
        # lecturas no hay evento que contar.
        throttle_delta = (throttle - self.last_throttle
                          if throttle is not None and self.last_throttle is not None else 0)
        throttle_ms_delta = (throttle_ms - self.last_throttle_ms
                             if throttle_ms is not None and self.last_throttle_ms is not None
                             else 0)
        self.last_throttle = throttle
        self.last_throttle_ms = throttle_ms

        # Grid por núcleo lógico: uso% (delta /proc/stat), GHz y temp del core físico
        agg_now, stat_now = read_stat(self._stat_path)
        per_cpu_freq = self._read_per_cpu_freq()
        core_grid = []
        for cpu in sorted(stat_now):
            # None = sin delta fiable (arranque o CPU recién online): `usage`
            # queda en 0 para el renderer y `usage_ok` avisa que no es medida.
            pct = stat_pcts(self._stat_prev.get(cpu), stat_now[cpu])
            cid = self._core_id.get(cpu)
            core_grid.append({
                "cpu": cpu,
                "usage": max(0, min(100, round(pct["usage"]))) if pct else 0,
                "usage_ok": pct is not None,
                "ghz": per_cpu_freq.get(cpu),
                "temp": core_temps_by_id.get(cid) if cid is not None else None,
                "core_id": cid,
            })
        total_pct = stat_pcts(self._agg_prev, agg_now)
        self._agg_prev, self._stat_prev = agg_now, stat_now

        return {
            "model": self.model,
            "cores": cores,
            "core_grid": core_grid,
            # Uso global (None en la 1ª muestra); iowait/steal ya van dentro de
            # idle / de usage respectivamente, se exponen aparte para diagnóstico.
            "usage": round(total_pct["usage"], 1) if total_pct else None,
            "iowait": round(total_pct["iowait"], 1) if total_pct else None,
            "steal": round(total_pct["steal"], 1) if total_pct else None,
            "avg": round(statistics.mean(cores), 1) if cores else None,
            "max": round(max(cores), 1) if cores else None,
            "min": round(min(cores), 1) if cores else None,
            "package": package,
            # None sin sensores (N-DEF-02): 0 núcleos calientes solo si se midió
            "hot90": sum(1 for c in cores if c >= 90) if cores else None,
            "freq_ghz": round(statistics.mean(freqs), 2) if freqs else None,
            "governor": hwmon.read_str(policy0 / "scaling_governor"),
            "driver": hwmon.read_str(policy0 / "scaling_driver"),
            "epp": hwmon.read_str(policy0 / "energy_performance_preference"),
            "throttle_count": throttle,
            "throttle_ms": throttle_ms,
            "throttle_delta": throttle_delta,
            "throttle_ms_delta": throttle_ms_delta,
            "throttled_now": throttle_delta > 0,
        }
