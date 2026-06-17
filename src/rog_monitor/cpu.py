"""CPU sensors: temperatures, frequency, governor/EPP, thermal throttling."""

import glob
import re
import statistics
from pathlib import Path

from . import hwmon

CPUFREQ = Path("/sys/devices/system/cpu/cpufreq")
THROTTLE_GLOB = "/sys/devices/system/cpu/cpu*/thermal_throttle/package_throttle_count"
THROTTLE_MS = "package_throttle_total_time_ms"


class CpuReader:
    def __init__(self, chips: dict):
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
        self._stat_prev = self._read_stat()
        self._core_id = self._read_topology()

    @staticmethod
    def _read_stat() -> dict:
        """(busy_total, idle) en jiffies por CPU lógica desde /proc/stat."""
        out = {}
        try:
            with open("/proc/stat") as fh:
                for line in fh:
                    if not line.startswith("cpu"):
                        continue
                    parts = line.split()
                    name = parts[0]
                    if name == "cpu" or not name[3:].isdigit():
                        continue
                    vals = [int(x) for x in parts[1:]]
                    idle = vals[3] + (vals[4] if len(vals) > 4 else 0)  # idle+iowait
                    out[int(name[3:])] = (sum(vals), idle)
        except (OSError, ValueError):
            pass
        return out

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
                out[int(m.group(1))] = round(khz / 1_000_000, 2)
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

    def _throttle_count(self) -> int:
        total = 0
        for path in self._throttle_files:
            value = hwmon.read_int(Path(path))
            if value:
                total += value
        return total

    def _throttle_ms(self) -> int:
        total = 0
        for path in self._throttle_ms_files:
            value = hwmon.read_int(Path(path))
            if value:
                total += value
        return total

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
                freqs.append(khz / 1_000_000)

        policy0 = CPUFREQ / "policy0"
        throttle = self._throttle_count()
        throttle_ms = self._throttle_ms()
        throttle_delta = throttle - self.last_throttle
        throttle_ms_delta = throttle_ms - self.last_throttle_ms
        self.last_throttle = throttle
        self.last_throttle_ms = throttle_ms

        # Grid por núcleo lógico: uso% (delta /proc/stat), GHz y temp del core físico
        stat_now = self._read_stat()
        per_cpu_freq = self._read_per_cpu_freq()
        core_grid = []
        for cpu in sorted(stat_now):
            tot, idl = stat_now[cpu]
            ptot, pidl = self._stat_prev.get(cpu, (tot, idl))
            dt, di = tot - ptot, idl - pidl
            usage = (1 - di / dt) * 100 if dt > 0 else 0
            cid = self._core_id.get(cpu)
            core_grid.append({
                "cpu": cpu,
                "usage": max(0, min(100, round(usage))),
                "ghz": per_cpu_freq.get(cpu),
                "temp": core_temps_by_id.get(cid) if cid is not None else None,
                "core_id": cid,
            })
        self._stat_prev = stat_now

        return {
            "model": self.model,
            "cores": cores,
            "core_grid": core_grid,
            "avg": round(statistics.mean(cores), 1) if cores else None,
            "max": round(max(cores), 1) if cores else None,
            "min": round(min(cores), 1) if cores else None,
            "package": package,
            "hot90": sum(1 for c in cores if c >= 90),
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
