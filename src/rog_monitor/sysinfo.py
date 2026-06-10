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

        # On image-based distros (Bazzite/Silverblue) "/" is a tiny composefs;
        # the real data lives in /var/home.
        disk = None
        for mount in ("/var/home", "/home", "/"):
            try:
                disk = shutil.disk_usage(mount)
                if disk.total > 1e9:
                    break
            except OSError:
                continue

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
            "disk_used_gb": (disk.used / 1e9) if disk else None,
            "disk_total_gb": (disk.total / 1e9) if disk else None,
            "disk_percent": round(disk.used * 100 / disk.total) if disk else None,
            "nvme_temps": nvme_temps,
            "load": os.getloadavg(),
            "uptime_h": uptime / 3600,
        }
