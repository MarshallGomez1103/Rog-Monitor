"""System info: RAM, swap, network rates, disk usage, NVMe temps, load, uptime."""

import os
import re
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


def _meminfo(proc: str = "/proc") -> dict[str, int]:
    info: dict[str, int] = {}
    try:
        with open(f"{proc}/meminfo") as fh:
            for line in fh:
                key, _, rest = line.partition(":")
                info[key] = int(rest.split()[0])  # kB
    except (OSError, ValueError, IndexError):
        pass
    return info


def _disk_model(block_dev: str, sys_root: str = "/sys") -> str:
    """Read model string from /sys/block/<dev>/device/model (stripped)."""
    try:
        with open(f"{sys_root}/block/{block_dev}/device/model") as fh:
            return fh.read().strip()
    except OSError:
        return ""


def _diskstats(proc: str = "/proc") -> dict[str, tuple]:
    """{dev: (lecturas, sectores_leídos, escrituras, sectores_escritos, io_ticks_ms)}
    desde /proc/diskstats. Los sectores son SIEMPRE de 512 B (el kernel así los
    reporta, sea cual sea el tamaño lógico del disco). io_ticks (ms con E/S en
    curso) es None en kernels viejos que no lo traen."""
    result: dict[str, tuple] = {}
    try:
        with open(f"{proc}/diskstats") as fh:
            for line in fh:
                fields = line.split()
                if len(fields) < 10:
                    continue
                ticks = int(fields[12]) if len(fields) > 12 else None
                result[fields[2]] = (int(fields[3]), int(fields[5]),
                                     int(fields[7]), int(fields[9]), ticks)
    except (OSError, ValueError, IndexError):
        pass
    return result


def _io_rates(prev: tuple | None, cur: tuple | None, dt: float | None) -> dict:
    """Tasas entre dos lecturas de _diskstats. Sin base previa, sin dt fiable o
    con contadores que retroceden (disco reconectado) devuelve ceros, nunca
    negativos. busy_pct = io_ticks / tiempo: actividad, no capacidad."""
    zero = {"read_mbps": 0.0, "write_mbps": 0.0, "read_iops": 0.0,
            "write_iops": 0.0, "busy_pct": 0.0}
    if not prev or not cur or not dt or dt <= 0:
        return zero
    d = [c - p for c, p in zip(cur[:4], prev[:4])]
    if min(d) < 0:
        return zero
    busy = 0.0
    if cur[4] is not None and prev[4] is not None and cur[4] >= prev[4]:
        busy = min(100.0, (cur[4] - prev[4]) / (dt * 10))  # ms / (dt*1000) * 100
    return {
        "read_mbps": round(d[1] * 512 / dt / 1_000_000, 2),
        "write_mbps": round(d[3] * 512 / dt / 1_000_000, 2),
        "read_iops": round(d[0] / dt, 1),
        "write_iops": round(d[2] / dt, 1),
        "busy_pct": round(busy, 1),
    }


# Dispositivos virtuales que no son hardware: no se listan en disk_io
_VIRTUAL_PREFIXES = ("loop", "ram", "zram", "dm-", "md", "sr", "fd", "nbd")


def _whole_disks(sys_root: str = "/sys") -> list[str]:
    """Discos completos (las particiones no aparecen en /sys/block), sin
    loop/ram/zram/dm/md/ópticos."""
    try:
        return [n for n in sorted(os.listdir(f"{sys_root}/block"))
                if not n.startswith(_VIRTUAL_PREFIXES)]
    except OSError:
        return []


def _unescape_mount(path: str) -> str:
    """/proc/mounts escapa espacio, tab, salto y barra como \\NNN (octal)."""
    return re.sub(r"\\([0-7]{3})", lambda m: chr(int(m.group(1), 8)), path)


def _block_device_for_mount(device: str, sys_root: str = "/sys") -> str:
    """Disco físico (nvme0n1, sda, mmcblk0) que respalda un /dev/XXX montado.

    Resuelve vía sysfs: partición -> su disco padre; dm/LUKS (/dev/mapper/x ->
    dm-N) -> primer esclavo, recursivo. Si sysfs no lo sabe, cae a la heurística
    por nombre."""
    name = os.path.basename(os.path.realpath(device))
    for _ in range(4):  # dm sobre dm (LUKS+LVM): tope para no ciclar
        link = os.path.realpath(f"{sys_root}/class/block/{name}")
        if not os.path.isdir(link):
            break
        if os.path.exists(os.path.join(link, "partition")):
            return os.path.basename(os.path.dirname(link))
        try:
            slaves = sorted(os.listdir(os.path.join(link, "slaves")))
        except OSError:
            slaves = []
        if not slaves:
            return name  # ya es un disco completo
        name = slaves[0]  # puede ser partición: otra vuelta la resuelve
    else:
        return name
    # Heurística por nombre (sin sysfs): nvme0n1p1 -> nvme0n1, mmcblk0p1 -> mmcblk0, sda1 -> sda
    m = re.match(r"(nvme\d+n\d+|mmcblk\d+)", name)
    return m.group(1) if m else (name.rstrip("0123456789") or name)


def _smart_block_devices(sys_root: str = "/sys") -> list[str]:
    """Return list of /dev/nvme*n* and /dev/sd* block devices, excluding loop/zram/dm."""
    devs = []
    try:
        for name in sorted(os.listdir(f"{sys_root}/block")):
            if name.startswith(("loop", "zram", "dm-")):
                continue
            if re.match(r"nvme\d+n\d+$", name) or re.match(r"sd[a-z]$", name):
                devs.append(f"/dev/{name}")
    except OSError:
        pass
    return devs


class SysReader:
    def __init__(self, chips: dict, proc_root: str = "/proc", sys_root: str = "/sys"):
        # proc_root/sys_root se inyectan en los tests (tests/fixtures/proc/...)
        self.proc, self.sys = proc_root, sys_root
        self.nvme_devs = chips.get("nvme", [])
        self._net_last = self._net_bytes()
        self._net_ts = time.monotonic()
        # I/O rate tracking: {block_dev: (reads, sectors_r, writes, sectors_w, io_ticks)}
        self._io_last = _diskstats(self.proc)
        self._io_ts = time.monotonic()

    REAL_FS = {"ext4", "ext3", "btrfs", "xfs", "f2fs", "vfat", "exfat", "ntfs", "ntfs3"}

    # a device can be mounted many times (ostree: /sysroot, /etc, /var, ...);
    # pick the most user-meaningful mountpoint
    MOUNT_PRIORITY = ["/var/home", "/home", "/", "/var"]

    # sobreescribible en tests (los puntos de montaje de los fixtures no existen)
    _disk_usage = staticmethod(shutil.disk_usage)

    def _io_tick(self) -> tuple[dict, dict, float | None]:
        """(diskstats previo, diskstats actual, segundos entre ambos) con reloj
        monotónico. Si pasó muy poco (<50 ms, p. ej. --json one-shot) dt=None y
        NO avanza la base: así no hay picos absurdos por dividir entre ~0."""
        now = time.monotonic()
        io_now = _diskstats(self.proc)
        prev, dt = self._io_last, now - self._io_ts
        if dt < 0.05:
            return prev, io_now, None
        self._io_last, self._io_ts = io_now, now
        return prev, io_now, dt

    def _nvme_temp_by_ctrl(self) -> dict[str, float]:
        """{'nvme0': °C} desde hwmon (Composite). Un NVMe sin sensor no aparece."""
        out = {}
        for dev in self.nvme_devs:
            temp = hwmon.temps(dev).get("Composite")
            if temp is not None:
                out[os.path.basename(os.path.realpath(dev / "device"))] = temp
        return out

    @staticmethod
    def _temp_for(block_dev: str, temps: dict[str, float]) -> float | None:
        m = re.match(r"(nvme\d+)n\d+$", block_dev)
        return temps.get(m.group(1)) if m else None

    def _removable(self, block_dev: str) -> bool:
        try:
            with open(f"{self.sys}/block/{block_dev}/removable") as fh:
                return fh.read().strip() == "1"
        except OSError:
            return False

    def _disks(self, io: tuple, temps: dict) -> list[dict]:
        """Real mounted filesystems (one per device), largest first, max 4."""
        io_prev, io_now, io_dt = io
        by_device: dict[str, tuple[list[str], str]] = {}  # device real → (mountpoints, fstype)
        try:
            with open(f"{self.proc}/mounts") as fh:
                for line in fh:
                    parts = line.split()
                    if len(parts) < 3:
                        continue
                    device, mountpoint, fstype = parts[0], parts[1], parts[2]
                    if fstype not in self.REAL_FS or not device.startswith("/dev/"):
                        continue
                    mp = _unescape_mount(mountpoint)
                    # subvolúmenes btrfs, bind mounts y alias (/dev/mapper/x vs
                    # /dev/dm-0) comparten dispositivo: una sola fila
                    key = os.path.realpath(device)
                    if key not in by_device:
                        by_device[key] = ([mp], fstype)
                    else:
                        by_device[key][0].append(mp)
        except OSError:
            return []

        disks = []
        for device, (mountpoints, fstype) in by_device.items():
            mountpoint = next(
                (p for p in self.MOUNT_PRIORITY if p in mountpoints),
                min(mountpoints, key=len),
            )
            try:
                usage = self._disk_usage(mountpoint)
            except OSError:
                continue
            if usage.total < 5e9:  # skip ESP and other small partitions
                continue
            label = "home" if mountpoint in ("/var/home", "/home") else (
                "/" if mountpoint == "/" else mountpoint.rstrip("/").split("/")[-1]
            )
            block_dev = _block_device_for_mount(device, self.sys)
            model = _disk_model(block_dev, self.sys)

            # Actividad (E/S) separada de capacidad (used/total)
            rates = _io_rates(io_prev.get(block_dev), io_now.get(block_dev), io_dt)

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
                    "removable": self._removable(block_dev),
                    "temp": self._temp_for(block_dev, temps),
                    **rates,
                }
            )

        disks.sort(key=lambda d: d["total_gb"], reverse=True)
        return disks[:4]

    def _disk_io(self, io: tuple, temps: dict) -> list[dict]:
        """Actividad por disco COMPLETO (montado o no), sin particiones ni
        virtuales. Independiente de la capacidad de _disks()."""
        io_prev, io_now, io_dt = io
        out = []
        for dev in _whole_disks(self.sys):
            if dev not in io_now:
                continue
            out.append({
                "dev": dev,
                "model": _disk_model(dev, self.sys),
                "removable": self._removable(dev),
                "temp": self._temp_for(dev, temps),
                **_io_rates(io_prev.get(dev), io_now[dev], io_dt),
            })
        return out

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
        mem = _meminfo(self.proc)
        total = mem.get("MemTotal", 0)
        buffers = mem.get("Buffers", 0)
        # igual que `free`: caché = Cached + SReclaimable (Buffers aparte)
        cached = mem.get("Cached", 0) + mem.get("SReclaimable", 0)
        # usado = total - DISPONIBLE (no total - libre: la caché es recuperable);
        # kernels sin MemAvailable: estimación libre+buffers+caché
        avail = mem.get("MemAvailable", mem.get("MemFree", 0) + buffers + cached)
        swap_total = mem.get("SwapTotal", 0)
        swap_free = mem.get("SwapFree", 0)

        now = time.monotonic()
        rx, tx = self._net_bytes()
        dt = max(now - self._net_ts, 0.001)
        rx_rate = (rx - self._net_last[0]) / dt
        tx_rate = (tx - self._net_last[1]) / dt
        self._net_last, self._net_ts = (rx, tx), now

        temps = self._nvme_temp_by_ctrl()
        io = self._io_tick()
        disks = self._disks(io, temps)
        disk_io = self._disk_io(io, temps)

        nvme_temps = []
        for dev in self.nvme_devs:
            temp = hwmon.temps(dev).get("Composite")
            if temp is not None:
                nvme_temps.append(temp)

        try:
            with open(f"{self.proc}/uptime") as fh:
                uptime = float(fh.read().split()[0])
        except (OSError, ValueError):
            uptime = 0.0

        return {
            "ram_total_gb": total / 1024 / 1024,
            "ram_used_gb": (total - avail) / 1024 / 1024,
            "ram_percent": round((total - avail) * 100 / total) if total else 0,
            "ram_available_gb": avail / 1024 / 1024,
            "ram_buffers_gb": buffers / 1024 / 1024,
            "ram_cached_gb": cached / 1024 / 1024,
            "swap_used_gb": (swap_total - swap_free) / 1024 / 1024,
            "swap_total_gb": swap_total / 1024 / 1024,
            # None sin swap (0/0 no es un 0 % real)
            "swap_percent": (round((swap_total - swap_free) * 100 / swap_total)
                             if swap_total else None),
            "rx_mbps": rx_rate * 8 / 1_000_000,
            "tx_mbps": tx_rate * 8 / 1_000_000,
            "disks": disks,
            "disk_io": disk_io,
            "nvme_temps": nvme_temps,
            "smart_block_devices": _smart_block_devices(self.sys),
            "load": os.getloadavg(),
            "uptime_s": uptime,
            "uptime_h": uptime / 3600,
            "dmi": get_dmi(),
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

    # (c) DMI getter returns a dict with expected keys; values are str or None.
    _EXPECTED_KEYS = {"board_vendor", "board_name", "bios_version", "product_name"}
    info = get_dmi()
    assert isinstance(info, dict), "dmi_info() must return a dict"
    assert _EXPECTED_KEYS <= info.keys(), f"Missing DMI keys: {_EXPECTED_KEYS - info.keys()}"
    for k, v in info.items():
        assert v is None or isinstance(v, str), f"DMI key {k!r} must be str or None, got {type(v)}"
    print("[OK] DMI info:", info)

    # Check that a missing path returns None (not an exception)
    import rog_monitor.sysinfo as _self  # noqa: F401
    _orig_base = _self._DMI_BASE
    _self._DMI_BASE = "/nonexistent/path/dmi"
    _self._DMI_CACHE = None  # force re-read
    fallback = _self.dmi_info()
    assert all(v is None for v in fallback.values()), "Unreadable paths must return None"
    _self._DMI_BASE = _orig_base
    _self._DMI_CACHE = None
    print("[OK] DMI fallback (all None):", fallback)

    if errors:
        print("FAILED:", errors, file=sys.stderr)
        sys.exit(1)
    print("All self-checks passed.")
