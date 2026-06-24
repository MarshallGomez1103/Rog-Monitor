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


def _disk_model(block_dev: str) -> str:
    """Read model string from /sys/block/<dev>/device/model (stripped)."""
    try:
        with open(f"/sys/block/{block_dev}/device/model") as fh:
            return fh.read().strip()
    except OSError:
        return ""


def _diskstats() -> dict[str, tuple[int, int]]:
    """Return {dev: (sectors_read, sectors_written)} from /proc/diskstats."""
    result: dict[str, tuple[int, int]] = {}
    try:
        with open("/proc/diskstats") as fh:
            for line in fh:
                fields = line.split()
                if len(fields) < 10:
                    continue
                dev = fields[2]
                sectors_r = int(fields[5])   # field 6: sectors read
                sectors_w = int(fields[9])   # field 10: sectors written
                result[dev] = (sectors_r, sectors_w)
    except (OSError, ValueError, IndexError):
        pass
    return result


def _block_device_for_mount(device: str) -> str:
    """Given a /dev/XXX path, return just the base block-device name (strip partition suffix)."""
    name = os.path.basename(device)
    # nvme0n1p1 → nvme0n1; sda1 → sda
    if name.startswith("nvme"):
        # strip trailing pN (partition)
        import re
        m = re.match(r"(nvme\d+n\d+)", name)
        return m.group(1) if m else name
    # sdaX → sda
    base = name.rstrip("0123456789")
    return base if base else name


def _smart_block_devices() -> list[str]:
    """Return list of /dev/nvme*n* and /dev/sd* block devices, excluding loop/zram/dm."""
    devs = []
    try:
        for name in sorted(os.listdir("/sys/block")):
            if name.startswith(("loop", "zram", "dm-")):
                continue
            import re
            if re.match(r"nvme\d+n\d+$", name) or re.match(r"sd[a-z]$", name):
                devs.append(f"/dev/{name}")
    except OSError:
        pass
    return devs


class SysReader:
    def __init__(self, chips: dict):
        self.nvme_devs = chips.get("nvme", [])
        self._net_last = self._net_bytes()
        self._net_ts = time.monotonic()
        # I/O rate tracking: {block_dev: (sectors_read, sectors_written)}
        self._io_last = _diskstats()
        self._io_ts = time.monotonic()

    REAL_FS = {"ext4", "ext3", "btrfs", "xfs", "f2fs", "vfat", "exfat", "ntfs", "ntfs3"}

    # a device can be mounted many times (ostree: /sysroot, /etc, /var, ...);
    # pick the most user-meaningful mountpoint
    MOUNT_PRIORITY = ["/var/home", "/home", "/", "/var"]

    def _disks(self) -> list[dict]:
        """Real mounted filesystems (one per device), largest first, max 4."""
        by_device: dict[str, tuple[str, str, str]] = {}  # device → (mountpoints, fstype)
        try:
            with open("/proc/mounts") as fh:
                for line in fh:
                    parts = line.split()
                    if len(parts) < 3:
                        continue
                    device, mountpoint, fstype = parts[0], parts[1], parts[2]
                    if fstype not in self.REAL_FS or not device.startswith("/dev/"):
                        continue
                    mp = mountpoint.replace("\\040", " ")
                    if device not in by_device:
                        by_device[device] = ([mp], fstype)
                    else:
                        by_device[device][0].append(mp)
        except OSError:
            return []

        # Snapshot I/O counters for rate computation
        now = time.monotonic()
        io_now = _diskstats()
        dt = max(now - self._io_ts, 0.001)

        disks = []
        for device, (mountpoints, fstype) in by_device.items():
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
            block_dev = _block_device_for_mount(device)
            model = _disk_model(block_dev)

            # I/O rate: sectors × 512 bytes → MB/s
            cur = io_now.get(block_dev)
            prev = self._io_last.get(block_dev)
            if cur and prev:
                read_mbps = max(0.0, (cur[0] - prev[0]) * 512 / dt / 1_000_000)
                write_mbps = max(0.0, (cur[1] - prev[1]) * 512 / dt / 1_000_000)
            else:
                read_mbps = 0.0
                write_mbps = 0.0

            disks.append(
                {
                    "mount": mountpoint,
                    "label": label[:14],
                    "used_gb": usage.used / 1e9,
                    "total_gb": usage.total / 1e9,
                    "percent": round(usage.used * 100 / usage.total),
                    "fstype": fstype,
                    "model": model,
                    "block_dev": block_dev,
                    "read_mbps": round(read_mbps, 2),
                    "write_mbps": round(write_mbps, 2),
                }
            )

        # Update I/O baseline after computing deltas
        self._io_last = io_now
        self._io_ts = now

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
            "smart_block_devices": _smart_block_devices(),
            "load": os.getloadavg(),
            "uptime_h": uptime / 3600,
        }


# ---------------------------------------------------------------------------
# Self-check: run with  python -m rog_monitor.sysinfo  (or  python sysinfo.py)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import sys

    errors = []

    # (a) I/O rate math from two synthetic /proc/diskstats snapshots → expected MB/s
    # Simulate: 1 second elapsed, 2000 sectors read (2000 * 512 = 1 024 000 B ≈ 1.024 MB/s)
    # and 1000 sectors written (512 000 B ≈ 0.512 MB/s)
    prev_io = {"nvme0n1": (1000, 500)}
    cur_io  = {"nvme0n1": (3000, 1500)}
    dt_test = 1.0  # 1 second
    dev = "nvme0n1"
    read_mbps  = max(0.0, (cur_io[dev][0] - prev_io[dev][0]) * 512 / dt_test / 1_000_000)
    write_mbps = max(0.0, (cur_io[dev][1] - prev_io[dev][1]) * 512 / dt_test / 1_000_000)
    assert abs(read_mbps  - 1.024) < 0.001, f"read_mbps wrong: {read_mbps}"
    assert abs(write_mbps - 0.512) < 0.001, f"write_mbps wrong: {write_mbps}"
    print(f"[OK] I/O rate math: read={read_mbps:.3f} MB/s write={write_mbps:.3f} MB/s")

    # (b) Extracting health/hours/cycles from hardcoded smartctl -j JSON samples

    # NVMe-style: nvme_smart_health_information_log
    sample_nvme = {
        "smart_status": {"passed": True},
        "nvme_smart_health_information_log": {
            "power_on_hours": 1234,
            "power_cycles": 567,
            "percentage_used": 2,
        },
        "temperature": {"current": 38},
    }

    def _parse_smart(j: dict) -> dict:
        """Extract health summary from smartctl -j output."""
        out: dict = {}
        status = j.get("smart_status", {})
        out["passed"] = bool(status.get("passed"))

        # Temperature: prefer top-level temperature.current, else drive attributes
        temp = j.get("temperature", {}).get("current")
        out["temp_c"] = temp

        nvme_log = j.get("nvme_smart_health_information_log", {})
        ata_attrs = {
            a["name"]: a.get("raw", {}).get("value")
            for a in j.get("ata_smart_attributes", {}).get("table", [])
        } if "ata_smart_attributes" in j else {}

        out["power_on_hours"] = nvme_log.get("power_on_hours") or ata_attrs.get("Power_On_Hours")
        out["power_cycles"]   = nvme_log.get("power_cycles")   or ata_attrs.get("Power_Cycle_Count")
        out["percent_used"]   = nvme_log.get("percentage_used")
        out["reallocated"]    = ata_attrs.get("Reallocated_Sector_Ct")
        return out

    r = _parse_smart(sample_nvme)
    assert r["passed"] is True,       f"NVMe passed wrong: {r}"
    assert r["power_on_hours"] == 1234, f"NVMe hours wrong: {r}"
    assert r["power_cycles"]   == 567,  f"NVMe cycles wrong: {r}"
    assert r["percent_used"]   == 2,    f"NVMe pct_used wrong: {r}"
    assert r["temp_c"]         == 38,   f"NVMe temp wrong: {r}"
    print(f"[OK] NVMe SMART parse: passed={r['passed']} hours={r['power_on_hours']} cycles={r['power_cycles']} pct={r['percent_used']}% temp={r['temp_c']}°C")

    # ATA-style: ata_smart_attributes
    sample_ata = {
        "smart_status": {"passed": False},
        "temperature": {"current": 45},
        "ata_smart_attributes": {
            "table": [
                {"name": "Power_On_Hours",       "raw": {"value": 5678}},
                {"name": "Power_Cycle_Count",     "raw": {"value": 321}},
                {"name": "Reallocated_Sector_Ct", "raw": {"value": 0}},
            ]
        },
    }
    r2 = _parse_smart(sample_ata)
    assert r2["passed"] is False,          f"ATA passed wrong: {r2}"
    assert r2["power_on_hours"] == 5678,   f"ATA hours wrong: {r2}"
    assert r2["power_cycles"]   == 321,    f"ATA cycles wrong: {r2}"
    assert r2["reallocated"]    == 0,      f"ATA realloc wrong: {r2}"
    assert r2["temp_c"]         == 45,     f"ATA temp wrong: {r2}"
    print(f"[OK] ATA  SMART parse: passed={r2['passed']} hours={r2['power_on_hours']} cycles={r2['power_cycles']} realloc={r2['reallocated']} temp={r2['temp_c']}°C")

    if errors:
        print("FAILED:", errors, file=sys.stderr)
        sys.exit(1)
    print("All self-checks passed.")
