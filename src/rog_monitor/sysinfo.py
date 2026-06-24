"""System info: RAM, swap, network rates, disk usage, NVMe temps, load, uptime."""

import os
import shutil
import time

from . import hwmon

# ---------------------------------------------------------------------------
# DMI / motherboard info (root-free, /sys/class/dmi/id/)
# ---------------------------------------------------------------------------
_DMI_BASE = "/sys/class/dmi/id"
_DMI_FIELDS = {
    "board_vendor": "board_vendor",
    "board_name":   "board_name",
    "bios_version": "bios_version",
    "product_name": "product_name",
}


def dmi_info() -> dict[str, str | None]:
    """Return a dict with motherboard DMI fields; values are None when unreadable."""
    result: dict[str, str | None] = {}
    for key, filename in _DMI_FIELDS.items():
        path = f"{_DMI_BASE}/{filename}"
        try:
            with open(path) as fh:
                value = fh.read().strip()
            result[key] = value or None
        except OSError:
            result[key] = None
    return result


# Cache DMI at import-time (it never changes at runtime)
_DMI_CACHE: dict[str, str | None] | None = None


def get_dmi() -> dict[str, str | None]:
    global _DMI_CACHE
    if _DMI_CACHE is None:
        _DMI_CACHE = dmi_info()
    return _DMI_CACHE


def _meminfo() -> dict[str, int]:
    info: dict[str, int] = {}
    try:
        with open("/proc/meminfo") as fh:
            for line in fh:
                key, _, rest = line.partition(":")
                info[key] = int(rest.split()[0])  # kB
    except (OSError, ValueError, IndexError):
        pass
    return info


class SysReader:
    def __init__(self, chips: dict):
        self.nvme_devs = chips.get("nvme", [])
        self._net_last = self._net_bytes()
        self._net_ts = time.monotonic()

    REAL_FS = {"ext4", "ext3", "btrfs", "xfs", "f2fs", "vfat", "exfat", "ntfs", "ntfs3"}

    # a device can be mounted many times (ostree: /sysroot, /etc, /var, ...);
    # pick the most user-meaningful mountpoint
    MOUNT_PRIORITY = ["/var/home", "/home", "/", "/var"]

    def _disks(self) -> list[dict]:
        """Real mounted filesystems (one per device), largest first, max 4."""
        by_device: dict[str, list[str]] = {}
        try:
            with open("/proc/mounts") as fh:
                for line in fh:
                    device, mountpoint, fstype = line.split()[:3]
                    if fstype not in self.REAL_FS or not device.startswith("/dev/"):
                        continue
                    by_device.setdefault(device, []).append(mountpoint.replace("\\040", " "))
        except OSError:
            return []

        disks = []
        for device, mountpoints in by_device.items():
            mountpoint = next(
                (p for p in self.MOUNT_PRIORITY if p in mountpoints),
                min(mountpoints, key=len),
            )
            try:
                usage = shutil.disk_usage(mountpoint)
            except OSError:
                continue
            if usage.total < 5e9:  # skip ESP and other small partitions
                continue
            label = "home" if mountpoint in ("/var/home", "/home") else (
                "/" if mountpoint == "/" else mountpoint.rstrip("/").split("/")[-1]
            )
            disks.append(
                {
                    "mount": mountpoint,
                    "label": label[:14],
                    "used_gb": usage.used / 1e9,
                    "total_gb": usage.total / 1e9,
                    "percent": round(usage.used * 100 / usage.total),
                }
            )
        disks.sort(key=lambda d: d["total_gb"], reverse=True)
        return disks[:4]

    @staticmethod
    def _net_bytes() -> tuple[int, int]:
        rx = tx = 0
        try:
            with open("/proc/net/dev") as fh:
                for line in fh.readlines()[2:]:
                    iface, _, data = line.partition(":")
                    if iface.strip() == "lo":
                        continue
                    fields = data.split()
                    rx += int(fields[0])
                    tx += int(fields[8])
        except (OSError, ValueError, IndexError):
            pass
        return rx, tx

    def read(self) -> dict:
        mem = _meminfo()
        total = mem.get("MemTotal", 0)
        avail = mem.get("MemAvailable", 0)
        swap_total = mem.get("SwapTotal", 0)
        swap_free = mem.get("SwapFree", 0)

        now = time.monotonic()
        rx, tx = self._net_bytes()
        dt = max(now - self._net_ts, 0.001)
        rx_rate = (rx - self._net_last[0]) / dt
        tx_rate = (tx - self._net_last[1]) / dt
        self._net_last, self._net_ts = (rx, tx), now

        disks = self._disks()

        nvme_temps = []
        for dev in self.nvme_devs:
            temp = hwmon.temps(dev).get("Composite")
            if temp is not None:
                nvme_temps.append(temp)

        try:
            with open("/proc/uptime") as fh:
                uptime = float(fh.read().split()[0])
        except (OSError, ValueError):
            uptime = 0.0

        return {
            "ram_total_gb": total / 1024 / 1024,
            "ram_used_gb": (total - avail) / 1024 / 1024,
            "ram_percent": round((total - avail) * 100 / total) if total else 0,
            "swap_used_gb": (swap_total - swap_free) / 1024 / 1024,
            "swap_total_gb": swap_total / 1024 / 1024,
            "rx_mbps": rx_rate * 8 / 1_000_000,
            "tx_mbps": tx_rate * 8 / 1_000_000,
            "disks": disks,
            "nvme_temps": nvme_temps,
            "load": os.getloadavg(),
            "uptime_h": uptime / 3600,
            "dmi": get_dmi(),
        }


if __name__ == "__main__":
    # Self-check: DMI getter returns a dict with expected keys; values are str or None.
    _EXPECTED_KEYS = {"board_vendor", "board_name", "bios_version", "product_name"}
    info = get_dmi()
    assert isinstance(info, dict), "dmi_info() must return a dict"
    assert _EXPECTED_KEYS <= info.keys(), f"Missing DMI keys: {_EXPECTED_KEYS - info.keys()}"
    for k, v in info.items():
        assert v is None or isinstance(v, str), f"DMI key {k!r} must be str or None, got {type(v)}"
    print("DMI info:", info)

    # Check that a missing path returns None (not an exception)
    import tempfile as _tmp, os as _os
    _saved = _os.environ.get("_DMI_BASE_OVERRIDE")
    # Patch the module-level cache and call dmi_info() directly with a non-existent path
    import importlib as _il
    import rog_monitor.sysinfo as _self  # noqa: F401
    _orig_base = _self._DMI_BASE
    _self._DMI_BASE = "/nonexistent/path/dmi"
    _self._DMI_CACHE = None  # force re-read
    fallback = _self.dmi_info()
    assert all(v is None for v in fallback.values()), "Unreadable paths must return None"
    _self._DMI_BASE = _orig_base
    _self._DMI_CACHE = None
    print("Fallback (all None):", fallback)
    print("sysinfo self-check PASSED")
