"""Power: Intel RAPL CPU package power, platform profile, PPD profile, battery."""

import glob
import subprocess
import time
from pathlib import Path

from . import hwmon
from .cached import Cached

PLATFORM_PROFILE = Path("/sys/firmware/acpi/platform_profile")


class RaplReader:
    """CPU package power from /sys/class/powercap (needs readable energy_uj)."""

    def __init__(self):
        self.path = None
        self.max_range = None
        self._last_energy = None
        self._last_ts = None
        for candidate in sorted(glob.glob("/sys/class/powercap/intel-rapl:*")):
            base = Path(candidate)
            name = hwmon.read_str(base / "name") or ""
            if name.startswith("package"):
                energy = base / "energy_uj"
                if hwmon.read_int(energy) is not None:
                    self.path = energy
                    self.max_range = hwmon.read_int(base / "max_energy_range_uj")
                break

    @property
    def available(self) -> bool:
        return self.path is not None

    def read_watts(self) -> float | None:
        if self.path is None:
            return None
        energy = hwmon.read_int(self.path)
        now = time.monotonic()
        if energy is None:
            return None
        watts = None
        if self._last_energy is not None and now > self._last_ts:
            delta = energy - self._last_energy
            if delta < 0 and self.max_range:
                delta += self.max_range
            if delta >= 0:
                watts = round(delta / 1_000_000 / (now - self._last_ts), 1)
        self._last_energy = energy
        self._last_ts = now
        return watts


PPD_BUS = (
    "org.freedesktop.UPower.PowerProfiles",
    "/org/freedesktop/UPower/PowerProfiles",
    "org.freedesktop.UPower.PowerProfiles",
)


def _read_ppd() -> str | None:
    # powerprofilesctl is not present everywhere (Bazzite uses tuned-ppd),
    # but both implement the same D-Bus interface.
    try:
        out = subprocess.run(
            ["busctl", "--system", "get-property", *PPD_BUS, "ActiveProfile"],
            capture_output=True, text=True, timeout=1, check=True,
            stdin=subprocess.DEVNULL,
        ).stdout.strip()
        return out.split('"')[1] if '"' in out else None
    except (OSError, subprocess.SubprocessError, IndexError):
        return None


# El perfil cambia rara vez: TTL 3 s, refresco en segundo plano y, si busctl
# falla, se conserva el último valor bueno en vez de parpadear a N/A.
_PPD = Cached(_read_ppd, ttl=3.0)


def ppd_profile() -> str | None:
    return _PPD.get()


def asus_profile() -> str | None:
    return hwmon.read_str(PLATFORM_PROFILE)


class BatteryReader:
    def __init__(self):
        bats = sorted(glob.glob("/sys/class/power_supply/BAT*"))
        self.path = Path(bats[0]) if bats else None
        self.ac_paths = [
            Path(p)
            for p in glob.glob("/sys/class/power_supply/ADP*/online")
            + glob.glob("/sys/class/power_supply/AC*/online")
        ]

    def _on_ac(self) -> bool | None:
        """True/False según los adaptadores ADP*/AC* legibles; None si no hay ninguno
        o ninguno se pudo leer (N-DEF-02: «sin adaptador» no equivale a «en batería»)."""
        states = [hwmon.read_int(p) for p in self.ac_paths]
        states = [v for v in states if v is not None]
        if not states:
            return None
        return any(v == 1 for v in states)

    def read(self) -> dict | None:
        if self.path is None:
            return None
        power_uw = hwmon.read_int(self.path / "power_now")
        if power_uw is None:
            current = hwmon.read_int(self.path / "current_now")
            voltage = hwmon.read_int(self.path / "voltage_now")
            if current and voltage:
                power_uw = current * voltage // 1_000_000
        on_ac = self._on_ac()

        # Battery health fields — root-free, all in /sys/class/power_supply/BAT*
        energy_full = hwmon.read_int(self.path / "energy_full")
        energy_full_design = hwmon.read_int(self.path / "energy_full_design")
        energy_now = hwmon.read_int(self.path / "energy_now")

        # Some laptops use charge_* (µAh) instead of energy_* (µWh). Wh = µAh·µV/1e12,
        # con voltage_min_design (o voltage_now de respaldo); sin voltaje no hay Wh
        # fiables y se devuelve None (la salud sigue siendo una proporción válida).
        mul, div = 1, 1_000_000  # energy_*: µWh -> Wh
        if energy_full is None:
            energy_full = hwmon.read_int(self.path / "charge_full")
            energy_full_design = hwmon.read_int(self.path / "charge_full_design")
            energy_now = hwmon.read_int(self.path / "charge_now")
            mul, div = 0, 1  # sin voltaje no hay Wh
            for name in ("voltage_min_design", "voltage_now"):
                volt = hwmon.read_int(self.path / name)
                if volt:
                    mul, div = volt, 1_000_000_000_000
                    break

        def to_wh(raw):
            return round(raw * mul / div, 2) if raw is not None and mul else None

        energy_full_wh = to_wh(energy_full)
        energy_full_design_wh = to_wh(energy_full_design)
        energy_now_wh = to_wh(energy_now)

        health_percent = None
        if energy_full is not None and energy_full_design:
            health_percent = round(energy_full * 100 / energy_full_design, 1)

        return {
            "capacity": hwmon.read_int(self.path / "capacity"),
            "status": hwmon.read_str(self.path / "status"),
            # 0 es válido (enchufado y sin cargar = 0 W); solo None si no se pudo leer.
            "watts": round(power_uw / 1_000_000, 1) if power_uw is not None else None,
            "charge_limit": hwmon.read_int(self.path / "charge_control_end_threshold"),
            "on_ac": on_ac,
            "energy_full_wh": energy_full_wh,
            "energy_full_design_wh": energy_full_design_wh,
            "energy_now_wh": energy_now_wh,
            "health_percent": health_percent,
            "cycle_count": hwmon.read_int(self.path / "cycle_count"),
        }


if __name__ == "__main__":
    # Self-check: verify health_percent math
    full = 79898000
    design = 90001000
    expected = round(full * 100 / design, 1)
    assert abs(expected - 88.8) < 0.1, f"health_percent math failed: got {expected}"
    print(f"health_percent self-check OK: {full}/{design} = {expected}%")

    # Live read
    reader = BatteryReader()
    data = reader.read()
    if data:
        print("Live battery:", data)
    else:
        print("No battery found (OK in CI/desktop without battery)")
