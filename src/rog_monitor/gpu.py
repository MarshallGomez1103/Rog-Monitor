"""GPU sensors: NVIDIA via nvidia-smi, AMD via hwmon, supergfx mode detection."""

import shutil
import subprocess
import time

from . import hwmon

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


class GpuReader:
    def __init__(self, chips: dict, enabled: bool = True):
        self.enabled = enabled
        self.has_nvidia_smi = shutil.which("nvidia-smi") is not None
        self.has_power_avg = self.has_nvidia_smi and "power.draw.average" in (
            _run(["nvidia-smi", "--help-query-gpu"], timeout=4.0) or ""
        )
        self.has_supergfx = shutil.which("supergfxctl") is not None
        self.amd = hwmon.find(chips, "amdgpu")
        self._mode: str | None = None
        self._pending: str | None = None
        self._mode_ts = 0.0
        self._nvidia_dead_until = 0.0
        self.supported: list[str] = self._supported_modes()

    def _supported_modes(self) -> list[str]:
        if not self.has_supergfx:
            return []
        out = _run(["supergfxctl", "-s"])
        if not out:
            return []
        return [m.strip() for m in out.strip("[]").split(",") if m.strip()]

    def invalidate(self) -> None:
        """Force a fresh supergfx read on the next tick (after a mode change)."""
        self._mode_ts = 0.0

    def _refresh_supergfx(self) -> None:
        if not self.has_supergfx:
            return
        now = time.monotonic()
        if now - self._mode_ts < 10:
            return
        mode = _run(["supergfxctl", "-g"])
        if mode is None:
            # transient failure: keep the last known mode, retry next tick
            return
        self._mode = mode
        pending = _run(["supergfxctl", "-P"]) or ""
        self._pending = None if pending.lower() in ("", "none", mode.lower()) else pending
        self._mode_ts = now

    def mode_info(self) -> dict:
        self._refresh_supergfx()
        return {
            "mode": self._mode,
            "pending": self._pending,
            "supported": self.supported,
        }

    def _read_nvidia(self) -> dict | None:
        if not self.has_nvidia_smi or time.monotonic() < self._nvidia_dead_until:
            return None
        query = NVIDIA_QUERY_AVG if self.has_power_avg else NVIDIA_QUERY
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
