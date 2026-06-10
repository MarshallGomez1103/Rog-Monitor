"""GPU sensors: NVIDIA via nvidia-smi, AMD via hwmon, supergfx mode detection."""

import shutil
import subprocess
import time

from . import hwmon

NVIDIA_QUERY = (
    "name,temperature.gpu,utilization.gpu,power.draw,memory.used,memory.total"
)


def _run(cmd: list[str], timeout: float = 2.0) -> str | None:
    try:
        return subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout, check=True
        ).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None


class GpuReader:
    def __init__(self, chips: dict, enabled: bool = True):
        self.enabled = enabled
        self.has_nvidia_smi = shutil.which("nvidia-smi") is not None
        self.has_supergfx = shutil.which("supergfxctl") is not None
        self.amd = hwmon.find(chips, "amdgpu")
        self._mode: str | None = None
        self._mode_ts = 0.0
        self._nvidia_dead_until = 0.0

    def mode(self) -> str | None:
        """Hybrid / Integrated / Dedicated via supergfxctl, cached 10s."""
        if not self.has_supergfx:
            return None
        now = time.monotonic()
        if now - self._mode_ts > 10:
            self._mode = _run(["supergfxctl", "-g"])
            self._mode_ts = now
        return self._mode

    def _read_nvidia(self) -> dict | None:
        if not self.has_nvidia_smi or time.monotonic() < self._nvidia_dead_until:
            return None
        out = _run(
            ["nvidia-smi", f"--query-gpu={NVIDIA_QUERY}", "--format=csv,noheader,nounits"]
        )
        if not out:
            # dGPU off or driver asleep: back off to avoid 2s stalls every tick
            self._nvidia_dead_until = time.monotonic() + 15
            return None

        parts = [p.strip() for p in out.splitlines()[0].split(",")]
        if len(parts) < 6:
            return None

        def num(value: str) -> float | None:
            try:
                return float(value)
            except ValueError:
                return None

        return {
            "vendor": "nvidia",
            "name": parts[0],
            "temp": num(parts[1]),
            "util": num(parts[2]),
            "power": num(parts[3]),
            "vram_used": num(parts[4]),
            "vram_total": num(parts[5]),
        }

    def _read_amd(self) -> dict | None:
        if self.amd is None:
            return None
        temps = hwmon.temps(self.amd)
        power = hwmon.read_int(self.amd / "power1_average")
        busy = hwmon.read_int(self.amd.parent.parent / "gpu_busy_percent")
        return {
            "vendor": "amd",
            "name": "AMD GPU",
            "temp": temps.get("edge") or next(iter(temps.values()), None),
            "util": busy,
            "power": round(power / 1_000_000, 1) if power else None,
            "vram_used": None,
            "vram_total": None,
        }

    def read(self) -> dict:
        info = {"mode": self.mode(), "active": None}
        if not self.enabled:
            return info
        gpu = self._read_nvidia() or self._read_amd()
        info["active"] = gpu
        return info
