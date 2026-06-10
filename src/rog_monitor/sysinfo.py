"""System info: RAM, swap, network rates, disk usage, NVMe temps, load, uptime."""

import os
import shutil
import time

from . import hwmon


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
        }
