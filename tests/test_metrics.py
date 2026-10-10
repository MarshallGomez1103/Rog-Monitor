"""Métricas de CPU / RAM / discos calculadas desde fixtures de /proc.

Los lectores aceptan una raíz alternativa (proc_root / sys_root / stat_path) y
las pruebas les inyectan tests/fixtures/proc/. Fixtures:
  t0/  stat, meminfo, diskstats, mounts   (muestra base; sistema ostree + USB)
  t1/  stat, diskstats                    (2 s después; cpu2 OFFLINE, nvme0n1 con
                                           contadores reiniciados)
  t2/  stat                               (cpu2 vuelve con contadores más bajos)
  noswap/meminfo                          (sin swap y sin MemAvailable)
"""
import os
import shutil
import tempfile
import unittest
from collections import namedtuple
from pathlib import Path
from unittest import mock

from rog_monitor import cpu, procs, sysinfo

FX = Path(__file__).resolve().parent / "fixtures" / "proc"
Usage = namedtuple("Usage", "total used free")


def merged_proc(tmp: Path, *dirs: str) -> str:
    """Una raíz /proc falsa = fixtures `dirs` superpuestos en orden."""
    for d in dirs:
        shutil.copytree(FX / d, tmp, dirs_exist_ok=True)
    return str(tmp)


class CpuStat(unittest.TestCase):
    def test_read_stat_excludes_guest_from_total(self):
        agg, per = cpu.read_stat(str(FX / "t0" / "stat"))
        # user+nice+system+idle+iowait+irq+softirq+steal; guest (400) ya va en user
        self.assertEqual(agg, (40000, 29000, 2000, 500))
        self.assertEqual(per[3], (10000, 4500, 500, 500))
        self.assertEqual(sorted(per), [0, 1, 2, 3])

    def test_per_core_and_global_usage_exact(self):
        _, p0 = cpu.read_stat(str(FX / "t0" / "stat"))
        a1, p1 = cpu.read_stat(str(FX / "t1" / "stat"))
        a0, _ = cpu.read_stat(str(FX / "t0" / "stat"))
        self.assertEqual(sorted(p1), [0, 1, 3])  # cpu2 offline: no aparece
        pct = {c: cpu.stat_pcts(p0[c], p1[c]) for c in p1}
        self.assertAlmostEqual(pct[0]["usage"], 30.0)
        self.assertAlmostEqual(pct[0]["iowait"], 10.0)
        self.assertAlmostEqual(pct[1]["usage"], 60.0)
        self.assertAlmostEqual(pct[3]["usage"], 50.0)
        self.assertAlmostEqual(pct[3]["steal"], 10.0)  # steal cuenta como ocupado
        g = cpu.stat_pcts(a0, a1)
        self.assertAlmostEqual(g["usage"], 1400 * 100 / 3000)
        self.assertAlmostEqual(g["iowait"], 250 * 100 / 3000)
        self.assertAlmostEqual(g["steal"], 100 * 100 / 3000)

    def test_no_delta_is_none_not_bogus(self):
        _, p0 = cpu.read_stat(str(FX / "t0" / "stat"))
        self.assertIsNone(cpu.stat_pcts(None, p0[0]))      # sin muestra previa
        self.assertIsNone(cpu.stat_pcts(p0[0], p0[0]))     # dt == 0 (1ª lectura)
        _, p2 = cpu.read_stat(str(FX / "t2" / "stat"))
        # cpu2 vuelve con contadores MENORES que en t0 (reinicio/hotplug)
        self.assertIsNone(cpu.stat_pcts(p0[2], p2[2]))
        self.assertIsNone(cpu.stat_pcts((100, 150, 0, 0), (200, 100, 0, 0)))  # idle retrocede

    def test_missing_file_is_empty(self):
        self.assertEqual(cpu.read_stat("/nonexistent/stat"), (None, {}))

    def test_reader_warmup_offline_and_return(self):
        with tempfile.TemporaryDirectory() as tmp:
            stat = Path(tmp) / "stat"
            shutil.copy(FX / "t0" / "stat", stat)
            rd = cpu.CpuReader({}, stat_path=str(stat))
            r = rd.read()  # misma lectura que la base: warm-up
            self.assertIsNone(r["usage"])
            self.assertTrue(all(not c["usage_ok"] and c["usage"] == 0 for c in r["core_grid"]))
            shutil.copy(FX / "t1" / "stat", stat)
            r = rd.read()
            self.assertEqual([c["cpu"] for c in r["core_grid"]], [0, 1, 3])
            self.assertEqual([c["usage"] for c in r["core_grid"]], [30, 60, 50])
            self.assertTrue(all(c["usage_ok"] for c in r["core_grid"]))
            self.assertEqual((r["usage"], r["iowait"], r["steal"]), (46.7, 8.3, 3.3))
            shutil.copy(FX / "t2" / "stat", stat)
            r = rd.read()  # cpu2 reaparece sin base previa: warm-up solo para ella
            by = {c["cpu"]: c for c in r["core_grid"]}
            self.assertFalse(by[2]["usage_ok"])
            self.assertTrue(by[0]["usage_ok"])
            self.assertEqual(by[0]["usage"], 0)  # sin cambios en t1 -> t2

    def test_procs_total_jiffies_ignores_guest(self):
        self.assertEqual(procs._total_jiffies(str(FX / "t0" / "stat")), 40000)
        self.assertEqual(procs._total_jiffies("/nonexistent/stat"), 0)


class CpuFreq(unittest.TestCase):
    def test_khz_to_ghz(self):
        self.assertAlmostEqual(cpu.khz_to_ghz(2_400_000), 2.4)   # 2.4 GHz
        self.assertAlmostEqual(cpu.khz_to_ghz(800_000), 0.8)
        self.assertAlmostEqual(cpu.khz_to_ghz(4_830_000), 4.83)


class Memory(unittest.TestCase):
    def make(self, proc):
        with mock.patch.object(sysinfo.SysReader, "_net_bytes", return_value=(0, 0)):
            return sysinfo.SysReader({}, proc_root=str(proc), sys_root="/nonexistent")

    def read(self, rd):
        with mock.patch.object(sysinfo.SysReader, "_net_bytes", return_value=(0, 0)):
            return rd.read()

    def test_used_is_total_minus_available(self):
        r = self.read(self.make(FX / "t0"))
        gb = 1024 * 1024
        # total - available = 8_000_000 kB (total - free daría 14_000_000)
        self.assertAlmostEqual(r["ram_used_gb"], 8_000_000 / gb)
        self.assertEqual(r["ram_percent"], 50)
        self.assertAlmostEqual(r["ram_total_gb"], 16_000_000 / gb)
        self.assertAlmostEqual(r["ram_available_gb"], 8_000_000 / gb)
        self.assertAlmostEqual(r["ram_buffers_gb"], 500_000 / gb)
        self.assertAlmostEqual(r["ram_cached_gb"], 6_000_000 / gb)  # Cached+SReclaimable
        self.assertAlmostEqual(r["swap_total_gb"], 4_000_000 / gb)
        self.assertAlmostEqual(r["swap_used_gb"], 1_000_000 / gb)
        self.assertEqual(r["swap_percent"], 25)

    def test_no_swap_and_no_memavailable(self):
        r = self.read(self.make(FX / "noswap"))
        gb = 1024 * 1024
        self.assertEqual(r["swap_total_gb"], 0)
        self.assertEqual(r["swap_used_gb"], 0)
        self.assertIsNone(r["swap_percent"])  # 0/0 no es "0 %"
        # sin MemAvailable: estimado = libre + buffers + caché = 3_500_000 kB
        self.assertAlmostEqual(r["ram_available_gb"], 3_500_000 / gb)
        self.assertAlmostEqual(r["ram_used_gb"], 4_500_000 / gb)
        self.assertEqual(r["ram_percent"], 56)

    def test_unreadable_meminfo_does_not_crash(self):
        r = self.read(self.make("/nonexistent"))
        self.assertEqual((r["ram_total_gb"], r["ram_percent"]), (0, 0))
        self.assertIsNone(r["swap_percent"])


class IoRates(unittest.TestCase):
    def test_exact_rates(self):
        prev = (1000, 200000, 500, 100000, 5000)
        cur = (1400, 240000, 600, 108000, 6000)
        r = sysinfo._io_rates(prev, cur, 2.0)
        self.assertEqual(r, {"read_mbps": 10.24, "write_mbps": 2.05,
                             "read_iops": 200.0, "write_iops": 50.0, "busy_pct": 50.0})

    def test_counter_reset_new_device_and_no_dt_give_zero(self):
        zero = sysinfo._io_rates(None, None, None)
        self.assertEqual(set(zero.values()), {0.0})
        self.assertEqual(sysinfo._io_rates((10, 100, 10, 100, 9), (1, 5, 1, 5, 1), 1.0), zero)
        self.assertEqual(sysinfo._io_rates(None, (1, 5, 1, 5, 1), 1.0), zero)
        self.assertEqual(sysinfo._io_rates((1, 5, 1, 5, 1), (2, 6, 2, 6, 2), None), zero)

    def test_busy_clamped_and_optional(self):
        self.assertEqual(sysinfo._io_rates((0, 0, 0, 0, 0), (0, 0, 0, 0, 5000), 1.0)["busy_pct"], 100.0)
        # kernel sin io_ticks
        self.assertEqual(sysinfo._io_rates((0, 0, 0, 0, None), (1, 1, 1, 1, None), 1.0)["busy_pct"], 0.0)

    def test_diskstats_parse(self):
        ds = sysinfo._diskstats(str(FX / "t0"))
        self.assertEqual(ds["nvme1n1"], (1000, 200000, 500, 100000, 5000))
        self.assertEqual(ds["sda"], (100, 10000, 20, 4000, 800))
        self.assertEqual(sysinfo._diskstats("/nonexistent"), {})


class Disks(unittest.TestCase):
    """Inventario sin doble conteo + actividad separada de capacidad."""

    USAGE = {
        "/var/home": Usage(1_000_000_000_000, 400_000_000_000, 0),
        "/run/media/system/2nd": Usage(500_000_000_000, 100_000_000_000, 0),
        "/run/media/marshall/USB STICK": Usage(32_000_000_000, 8_000_000_000, 0),
        "/boot": Usage(1_000_000_000, 100_000_000, 0),
        "/boot/efi": Usage(300_000_000, 10_000_000, 0),
    }

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        tmp = Path(self._tmp.name)
        self.proc = merged_proc(tmp / "proc", "t0")
        self.proc1 = merged_proc(tmp / "proc1", "t0", "t1")
        self.sys = tmp / "sys"
        # /sys falso: discos con `removable`, modelo y particiones enlazadas
        dev = self.sys / "devices"
        for name, removable, model in (("nvme0n1", "0", "ADATA"), ("nvme1n1", "0", "Micron"),
                                       ("sda", "1", "USB DISK")):
            (dev / name / "device").mkdir(parents=True)
            (dev / name / "removable").write_text(removable + "\n")
            (dev / name / "device" / "model").write_text(model + "\n")
            (self.sys / "block").mkdir(exist_ok=True)
            (self.sys / "block" / name).symlink_to(dev / name)
            (self.sys / "class" / "block").mkdir(parents=True, exist_ok=True)
            (self.sys / "class" / "block" / name).symlink_to(dev / name)
        for part, disk in (("nvme1n1p6", "nvme1n1"), ("nvme1n1p5", "nvme1n1"),
                           ("nvme1n1p1", "nvme1n1"), ("nvme0n1p1", "nvme0n1"), ("sda1", "sda")):
            (dev / disk / part).mkdir()
            (dev / disk / part / "partition").write_text("1\n")
            (self.sys / "class" / "block" / part).symlink_to(dev / disk / part)
        for virt in ("loop0", "zram0", "dm-0"):  # virtuales: top-level pero no hardware
            (self.sys / "block" / virt).mkdir()
        # hwmon falso: nvme1 (root) con temperatura; nvme0 sin sensor Composite
        hw = tmp / "hw"
        for h, ctrl, temp in (("hwmon3", "nvme1", "52850"), ("hwmon4", "nvme0", None)):
            (hw / ctrl).mkdir(parents=True)
            (hw / h).mkdir()
            (hw / h / "device").symlink_to(hw / ctrl)
            (hw / h / "name").write_text("nvme\n")
            if temp:
                (hw / h / "temp1_input").write_text(temp + "\n")
                (hw / h / "temp1_label").write_text("Composite\n")
        self.chips = {"nvme": [hw / "hwmon3", hw / "hwmon4"]}

    def reader(self):
        clock = mock.Mock(side_effect=[100.0, 100.0, 102.0, 102.0])  # init(net, io), read(net, io)
        with mock.patch.object(sysinfo.time, "monotonic", clock), \
                mock.patch.object(sysinfo.SysReader, "_net_bytes", return_value=(0, 0)):
            rd = sysinfo.SysReader(self.chips, proc_root=self.proc, sys_root=str(self.sys))
        rd._disk_usage = lambda mp: self.USAGE[mp]
        return rd, clock

    def sample(self):
        rd, clock = self.reader()
        rd.proc = self.proc1
        with mock.patch.object(sysinfo.time, "monotonic", clock), \
                mock.patch.object(sysinfo.SysReader, "_net_bytes", return_value=(0, 0)):
            return rd.read()

    def test_inventory_without_double_counting(self):
        disks = self.sample()["disks"]
        self.assertEqual([d["mount"] for d in disks],
                         ["/var/home", "/run/media/system/2nd", "/run/media/marshall/USB STICK"])
        # ostree: 5 montajes de nvme1n1p6 (/etc, /sysroot, /var, /var/home, bind) -> 1 fila
        home = disks[0]
        self.assertEqual((home["label"], home["fstype"], home["percent"]), ("home", "btrfs", 40))
        self.assertEqual(home["block_dev"], "nvme1n1")
        self.assertEqual(home["model"], "Micron")
        # ESP (<5 GB) y /boot pequeños fuera; tmpfs/sysfs fuera
        self.assertNotIn("/boot/efi", [d["mount"] for d in disks])

    def test_removable_usb_with_escaped_mountpoint(self):
        usb = self.sample()["disks"][2]
        self.assertEqual((usb["label"], usb["fstype"], usb["block_dev"]), ("USB STICK", "exfat", "sda"))
        self.assertTrue(usb["removable"])
        self.assertFalse(self.sample()["disks"][0]["removable"])
        self.assertIsNone(usb["temp"])  # un SATA/USB no tiene sensor NVMe

    def test_activity_exact_values(self):
        disks = {d["block_dev"]: d for d in self.sample()["disks"]}
        h = disks["nvme1n1"]
        self.assertEqual((h["read_mbps"], h["write_mbps"]), (10.24, 2.05))
        self.assertEqual((h["read_iops"], h["write_iops"], h["busy_pct"]), (200.0, 50.0, 50.0))
        u = disks["sda"]
        self.assertEqual((u["read_mbps"], u["write_mbps"], u["read_iops"], u["busy_pct"]),
                         (0.52, 0.0, 5.0, 5.0))
        # contadores reiniciados (nvme0n1: t1 < t0) -> ceros, no negativos
        n0 = disks["nvme0n1"]
        self.assertEqual((n0["read_mbps"], n0["write_iops"], n0["busy_pct"]), (0.0, 0.0, 0.0))

    def test_disk_io_whole_devices_only(self):
        io = {d["dev"]: d for d in self.sample()["disk_io"]}
        # solo discos completos: sin particiones, loop, zram ni dm
        self.assertEqual(sorted(io), ["nvme0n1", "nvme1n1", "sda"])
        self.assertEqual(io["nvme1n1"]["read_mbps"], 10.24)
        self.assertTrue(io["sda"]["removable"])

    def test_nvme_without_temperature(self):
        s = self.sample()
        io = {d["dev"]: d for d in s["disk_io"]}
        self.assertEqual(io["nvme1n1"]["temp"], 52.85)
        self.assertIsNone(io["nvme0n1"]["temp"])      # nvme0 sin Composite
        self.assertEqual(s["nvme_temps"], [52.85])    # la lista antigua solo trae los que tienen sensor

    def test_first_sample_has_no_rate_spike(self):
        # 2 lecturas con <50 ms de por medio (one-shot --json): ceros, base intacta
        rd, _ = self.reader()
        rd.proc = self.proc1
        clock = mock.Mock(side_effect=[100.01, 100.01])
        with mock.patch.object(sysinfo.time, "monotonic", clock), \
                mock.patch.object(sysinfo.SysReader, "_net_bytes", return_value=(0, 0)):
            r = rd.read()
        self.assertEqual({d["read_mbps"] for d in r["disks"]}, {0.0})

    def test_block_device_resolution(self):
        f = sysinfo._block_device_for_mount
        s = str(self.sys)
        self.assertEqual(f("/dev/nvme1n1p6", s), "nvme1n1")
        self.assertEqual(f("/dev/sda1", s), "sda")
        # LUKS/dm: dm-0 -> esclavo nvme1n1p6 -> disco nvme1n1
        dm = self.sys / "devices" / "dm-0"
        (dm / "slaves" / "nvme1n1p6").mkdir(parents=True)
        (self.sys / "class" / "block" / "dm-0").symlink_to(dm)
        self.assertEqual(f("/dev/dm-0", s), "nvme1n1")
        # sin sysfs: heurística por nombre (incluye mmcblk, que antes salía "mmcblk")
        self.assertEqual(f("/dev/mmcblk0p1", "/nonexistent"), "mmcblk0")
        self.assertEqual(f("/dev/nvme0n1p2", "/nonexistent"), "nvme0n1")
        self.assertEqual(f("/dev/sdb3", "/nonexistent"), "sdb")

    def test_unescape_mount(self):
        self.assertEqual(sysinfo._unescape_mount(r"/a\040b\011c"), "/a b\tc")


if __name__ == "__main__":
    unittest.main()
