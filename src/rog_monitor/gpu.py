"""GPU sensors: NVIDIA via NVML (nvidia-smi de respaldo), AMD via hwmon, supergfx."""

import glob
import re
import shutil
import subprocess
import time
from pathlib import Path

from . import gpu_clocks, hwmon
from .cached import Cached

NVIDIA_QUERY = (
    "name,temperature.gpu,utilization.gpu,power.draw,memory.used,memory.total,"
    "clocks.gr,clocks.mem"
)
# power.draw devuelve la muestra INSTANTÁNEA: en las RTX 40 cae a ~1-3 W cada
# vez que la GPU entra un instante a un estado de sueño y la gráfica se ve
# "desplomándose". power.draw.average es el valor estable; se usa si el driver
# lo soporta (se detecta una sola vez, sin despertar la GPU).
NVIDIA_QUERY_AVG = NVIDIA_QUERY + ",power.draw.average"


def _run(cmd: list[str], timeout: float = 4.0) -> str | None:
    try:
        return subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout, check=True,
            stdin=subprocess.DEVNULL,  # never let children steal terminal keys
        ).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None


def _num(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _nvidia_pci() -> list[Path]:
    """Funciones PCI de la dGPU NVIDIA (vendor 0x10de, clase display)."""
    out = []
    for dev in sorted(glob.glob("/sys/bus/pci/devices/*")):
        base = Path(dev)
        if (hwmon.read_str(base / "vendor") == "0x10de"
                and (hwmon.read_str(base / "class") or "").startswith("0x03")):
            out.append(base)
    return out


class GpuReader:
    def __init__(self, chips: dict, enabled: bool = True):
        self.enabled = enabled
        self.has_nvidia_smi = shutil.which("nvidia-smi") is not None
        self._power_avg: bool | None = None  # solo para el respaldo nvidia-smi
        self._nvml_ok = True  # False si no hay libnvidia-ml: todo vía nvidia-smi
        self._nvidia_pci = _nvidia_pci()
        self.has_supergfx = shutil.which("supergfxctl") is not None
        self.amd = hwmon.find(chips, "amdgpu")
        self._nvidia_dead_until = 0.0
        self._vram_proc_ts = 0.0
        self._vram_proc_cache: dict = {
            "available": False,
            "reason": "sin datos todavía",
            "vendor": "nvidia" if self.has_nvidia_smi or self._nvidia_pci else None,
            "procs": [],
        }
        self.supported: list[str] = self._supported_modes()
        # supergfxctl tarda hasta 4 s por llamada: TTL 10 s en segundo plano y
        # backoff exponencial (hasta 120 s) si falla; el tick lee el último valor.
        self._sg = Cached(self._read_supergfx, ttl=10.0, backoff_max=120.0) \
            if self.has_supergfx else None

    def _supported_modes(self) -> list[str]:
        if not self.has_supergfx:
            return []
        out = _run(["supergfxctl", "-s"])
        if not out:
            return []
        return [m.strip() for m in out.strip("[]").split(",") if m.strip()]

    def invalidate(self) -> None:
        """Force a fresh supergfx read soon (after a mode change)."""
        if self._sg:
            self._sg.invalidate()

    def _read_supergfx(self) -> tuple | None:
        mode = _run(["supergfxctl", "-g"])
        if mode is None:
            return None  # fallo transitorio: Cached conserva el último modo
        pending = (_run(["supergfxctl", "-P"]) or "").strip()
        pending = None if pending.lower() in ("", "none", "unknown", mode.lower()) else pending
        action = (_run(["supergfxctl", "-p"]) or "").strip()
        action = None if action.lower() in ("", "none", "noaction", "unknown") else action
        return mode, pending, action

    def mode_info(self) -> dict:
        mode, pending, action = (self._sg.get() if self._sg else None) or (None, None, None)
        return {
            "mode": mode,
            "pending": pending,
            "pending_action": action,
            "supported": self.supported,
        }

    def _dgpu_asleep(self) -> bool:
        """True si la dGPU está en runtime-suspend (D3). Leer sysfs no la despierta;
        nvidia-smi / nvmlInit sí, así que en ese caso no se la toca."""
        return any(
            hwmon.read_str(p / "power/runtime_status") in ("suspended", "suspending")
            for p in self._nvidia_pci
        )

    def _read_nvidia(self) -> dict | None:
        if time.monotonic() < self._nvidia_dead_until or self._dgpu_asleep():
            return None
        if self._nvml_ok:
            try:
                return {"vendor": "nvidia", **gpu_clocks.read_telemetry()}
            except (OSError, AttributeError):
                self._nvml_ok = False  # sin libnvidia-ml / símbolo: respaldo nvidia-smi
            except gpu_clocks.NvmlError:
                pass  # init falló (dGPU apagada/driver dormido): prueba nvidia-smi
        if not self.has_nvidia_smi:
            self._nvidia_dead_until = time.monotonic() + 15
            return None
        if self._power_avg is None:
            self._power_avg = "power.draw.average" in (
                _run(["nvidia-smi", "--help-query-gpu"], timeout=4.0) or "")
        query = NVIDIA_QUERY_AVG if self._power_avg else NVIDIA_QUERY
        out = _run(
            ["nvidia-smi", f"--query-gpu={query}", "--format=csv,noheader,nounits"],
            timeout=2.0,
        )
        if not out:
            # dGPU off or driver asleep: back off to avoid 2s stalls every tick
            self._nvidia_dead_until = time.monotonic() + 15
            return None

        parts = [p.strip() for p in out.splitlines()[0].split(",")]
        if len(parts) < 6:
            return None

        power = _num(parts[3])
        if len(parts) > 8:
            power = _num(parts[8]) or power

        return {
            "vendor": "nvidia",
            "name": parts[0],
            "temp": _num(parts[1]),
            "util": _num(parts[2]),
            "power": power,
            "vram_used": _num(parts[4]),
            "vram_total": _num(parts[5]),
            "clock_mhz": _num(parts[6]) if len(parts) > 6 else None,
            "vram_clock_mhz": _num(parts[7]) if len(parts) > 7 else None,
        }

    @staticmethod
    def _proc_name(pid: int, fallback: str = "") -> str:
        try:
            name = Path(f"/proc/{pid}/comm").read_text().strip()
            if name:
                return name[:48]
        except OSError:
            pass
        base = Path(fallback).name if fallback else ""
        return (base or str(pid))[:48]

    @staticmethod
    def _merge_vram_rows(rows: list[dict]) -> list[dict]:
        by_pid: dict[int, dict] = {}
        for row in rows:
            pid = row.get("pid")
            mem = row.get("vram_mb")
            if not isinstance(pid, int) or not isinstance(mem, (int, float)):
                continue
            current = by_pid.setdefault(pid, {
                "pid": pid,
                "name": row.get("name") or str(pid),
                "vram_mb": 0,
                "type": row.get("type") or "",
            })
            current["vram_mb"] = max(int(current["vram_mb"]), int(mem))
            if row.get("type") and row["type"] not in current["type"]:
                current["type"] = (current["type"] + "+" + row["type"]).strip("+")
        out = list(by_pid.values())
        out.sort(key=lambda r: r["vram_mb"], reverse=True)
        return out

    def _read_nvidia_vram_query(self) -> list[dict] | None:
        # Driver versions disagree on the field name, so try both.
        for mem_field in ("used_memory", "used_gpu_memory"):
            out = _run([
                "nvidia-smi",
                f"--query-compute-apps=pid,process_name,{mem_field}",
                "--format=csv,noheader,nounits",
            ], timeout=2.0)
            if out is None:
                continue
            rows = []
            for line in out.splitlines():
                parts = [p.strip() for p in line.split(",")]
                if len(parts) < 3:
                    continue
                try:
                    pid = int(parts[0])
                    mem = int(float(parts[2].replace("MiB", "").strip()))
                except (TypeError, ValueError):
                    continue
                if mem <= 0:
                    continue
                rows.append({
                    "pid": pid,
                    "name": self._proc_name(pid, parts[1]),
                    "vram_mb": mem,
                    "type": "C",
                })
            return rows
        return None

    def _read_nvidia_vram_table(self) -> list[dict] | None:
        out = _run(["nvidia-smi"], timeout=2.5)
        if not out:
            return None
        rows = []
        # Example process row:
        # |    0   N/A  N/A      1234      G   /usr/bin/game              2048MiB |
        row_re = re.compile(
            r"^\|\s*\d+\s+\S+\s+\S+\s+(\d+)\s+([A-Z+]+)\s+(.+?)\s+(\d+)\s*MiB\s*\|"
        )
        for line in out.splitlines():
            match = row_re.match(line)
            if not match:
                continue
            pid = int(match.group(1))
            kind = match.group(2)
            name = match.group(3).strip()
            mem = int(match.group(4))
            if mem <= 0:
                continue
            rows.append({
                "pid": pid,
                "name": self._proc_name(pid, name),
                "vram_mb": mem,
                "type": kind,
            })
        return rows

    def vram_processes(self, active: dict | None = None, top: int = 12) -> dict:
        if not self.has_nvidia_smi and not self._nvidia_pci:
            return {
                "available": False,
                "reason": "nvidia-smi no está disponible",
                "vendor": None,
                "procs": [],
            }
        if self._dgpu_asleep() or (active is not None and active.get("vendor") != "nvidia"):
            return {
                "available": False,
                "reason": "la dGPU NVIDIA no está activa",
                "vendor": "nvidia",
                "procs": [],
            }
        now = time.monotonic()
        if now - self._vram_proc_ts < 5:
            return self._vram_proc_cache

        query_rows = table_rows = None
        if self._nvml_ok:
            try:
                query_rows = [
                    {**r, "name": self._proc_name(r["pid"])}
                    for r in gpu_clocks.read_vram_processes()
                ]
            except (OSError, AttributeError):
                self._nvml_ok = False
            except gpu_clocks.NvmlError:
                pass
        if query_rows is None and self.has_nvidia_smi:
            query_rows = self._read_nvidia_vram_query()
            table_rows = self._read_nvidia_vram_table()
        if query_rows is None and table_rows is None:
            self._vram_proc_cache = {
                "available": False,
                "reason": "el driver NVIDIA no expuso la lista de procesos",
                "vendor": "nvidia",
                "procs": [],
            }
        else:
            rows = (query_rows or []) + (table_rows or [])
            self._vram_proc_cache = {
                "available": True,
                "reason": "",
                "vendor": "nvidia",
                "procs": self._merge_vram_rows(rows)[:top],
            }
        self._vram_proc_ts = now
        return self._vram_proc_cache

    def _read_amd(self) -> dict | None:
        if self.amd is None:
            return None
        temps = hwmon.temps(self.amd)
        power = hwmon.read_int(self.amd / "power1_average")
        busy = hwmon.read_int(self.amd.parent.parent / "gpu_busy_percent")
        sclk = hwmon.read_int(self.amd / "freq1_input")
        mclk = hwmon.read_int(self.amd / "freq2_input")
        return {
            "vendor": "amd",
            "name": "AMD GPU",
            "temp": temps.get("edge") or next(iter(temps.values()), None),
            "util": busy,
            "power": round(power / 1_000_000, 1) if power else None,
            "vram_used": None,
            "vram_total": None,
            "clock_mhz": round(sclk / 1_000_000) if sclk else None,
            "vram_clock_mhz": round(mclk / 1_000_000) if mclk else None,
        }

    def read(self) -> dict:
        info = dict(self.mode_info())
        info["active"] = None
        if self.enabled:
            info["active"] = self._read_nvidia() or self._read_amd()
        return info
