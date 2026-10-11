"""Contract test: the NDJSON snapshot (`python -m rog_monitor --json`) must keep
the keys the Electron renderer / main.js actually read.

WHERE TO UPDATE WHEN THE SCHEMA CHANGES (breaking change = key removed/renamed
or unit changed):
  1. bump `"schema"` in src/rog_monitor/app.py (snapshot_json) and EXPECTED_SCHEMA here;
  2. edit REQUIRED below (keys consumers read; NOT every key) and the matching
     list in desktop/test/contract.test.js;
  3. re-record tests/fixtures/snapshot-v<N>.json
     (`PYTHONPATH=src python3 -m rog_monitor --json`, then sanitize names/paths).
Source of the key list: the snapshot keys each renderer file / ui.py actually reads (grep desktop/renderer and src/rog_monitor/ui.py).

Spec syntax: path -> "type|type"; types: num (int/float, not bool), str, bool,
list, dict, null. `[]` = first element of a list (skipped when the list is empty);
a path under a null parent (e.g. gpu.active when the dGPU is off) is skipped.
"""
import json
import os
import subprocess
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURE = os.path.join(ROOT, "tests", "fixtures", "snapshot-v1.json")
EXPECTED_SCHEMA = 1

REQUIRED = {
    "schema": "num",
    "version": "str",
    # cpu (app.js, overlay.js, diagnostics.js, widget-states.js, cores.js)
    "cpu": "dict",
    "cpu.avg": "num|null", "cpu.package": "num|null", "cpu.max": "num|null",
    "cpu.min": "num|null", "cpu.hot90": "num|null", "cpu.freq_ghz": "num|null",
    "cpu.throttle_count": "num|null", "cpu.epp": "str|null", "cpu.model": "str|null",
    "cpu.core_grid": "list",
    "cpu.core_grid[].cpu": "num", "cpu.core_grid[].usage": "num|null",
    "cpu.core_grid[].usage_ok": "bool",
    "cpu.usage": "num|null", "cpu.iowait": "num|null", "cpu.steal": "num|null",
    "limits": "dict", "limits.cpu": "list", "limits.gpu": "list",
    # gpu (active is null when the dGPU is off)
    "gpu": "dict", "gpu.active": "dict|null", "gpu.mode": "str|null",
    "gpu.pending": "str|null", "gpu.pending_action": "str|null",
    "gpu.active.name": "str|null", "gpu.active.temp": "num|null",
    "gpu.active.util": "num|null", "gpu.active.power": "num|null",
    "gpu.active.clock_mhz": "num|null", "gpu.active.vram_clock_mhz": "num|null",
    "gpu.active.vram_total": "num|null", "gpu.active.vram_used": "num|null",
    # profiles / power / fps
    "ppd_profile": "str|null", "asus_profile": "str|null",
    "rapl_available": "bool", "cpu_watts": "num|null", "fps": "num|null",
    "power_control": "dict|null",
    # fans
    "fans": "list", "fans[].label": "str", "fans[].rpm": "num|null",
    "fans[].percent": "num|null",
    # battery (null when absent)
    "battery": "dict|null", "battery.capacity": "num|null",
    "battery.status": "str|null", "battery.watts": "num|null",
    "battery.charge_limit": "num|null", "battery.on_ac": "bool|null",
    "battery.health_percent": "num|null", "battery.cycle_count": "num|null",
    "battery.energy_full_wh": "num|null", "battery.energy_full_design_wh": "num|null",
    "battery.energy_now_wh": "num|null",
    # sys
    "sys": "dict", "sys.uptime_s": "num|null", "sys.ram_used_gb": "num|null",
    "sys.ram_total_gb": "num|null", "sys.ram_percent": "num|null",
    "sys.rx_mbps": "num|null", "sys.tx_mbps": "num|null", "sys.load": "list|null",
    "sys.nvme_temps": "list", "sys.disks": "list",
    "sys.disks[].mount": "str", "sys.disks[].label": "str|null",
    "sys.disks[].percent": "num", "sys.disks[].used_gb": "num",
    "sys.disks[].total_gb": "num", "sys.disks[].block_dev": "str|null",
    "sys.disks[].read_mbps": "num|null", "sys.disks[].write_mbps": "num|null",
    "sys.disks[].read_iops": "num|null", "sys.disks[].write_iops": "num|null",
    "sys.disks[].busy_pct": "num|null", "sys.disks[].removable": "bool",
    "sys.disks[].temp": "num|null",
    "sys.ram_available_gb": "num|null", "sys.ram_cached_gb": "num|null",
    "sys.ram_buffers_gb": "num|null", "sys.swap_used_gb": "num|null",
    "sys.swap_total_gb": "num|null", "sys.swap_percent": "num|null",
    "sys.disk_io": "list", "sys.disk_io[].dev": "str", "sys.disk_io[].busy_pct": "num",
    "sys.disk_io[].read_mbps": "num", "sys.disk_io[].write_mbps": "num",
    "sys.disk_io[].read_iops": "num", "sys.disk_io[].write_iops": "num",
    # SMART sin root (aditivo): capacidad + último resultado de la caché de la app
    "sys.disks[].smart": "dict", "sys.disks[].smart.smartctl": "bool",
    "sys.disks[].smart.type": "str|null", "sys.disks[].smart.has_cache": "bool",
    "sys.disks[].smart_cached": "dict|null", "sys.disks[].smart_cached.age_s": "num",
    "sys.disks[].smart_cached.stale": "bool", "sys.disks[].smart_cached.ok": "bool",
    "sys.disks[].smart_cached.health_passed": "bool|null",
    "sys.disks[].smart_cached.temp_c": "num|null",
    "sys.disks[].smart_cached.percentage_used": "num|null",
    "sys.disk_io[].smart": "dict", "sys.disk_io[].smart_cached": "dict|null",
    # processes
    "procs": "list", "procs[].pid": "num", "procs[].name": "str",
    "procs[].cpu": "num", "procs[].cpu_core": "num", "procs[].mem_mb": "num",
    "procs_by_core": "dict", "procs_mem": "list", "procs_vram": "dict",
    # aura
    "aura": "dict|null",
    # history + events (series alineadas; huecos = null desde que Series.push guarda None)
    "series": "dict", "series.cpu_temp": "list", "series.gpu_temp": "list",
    "series.cpu_power": "list", "series.gpu_power": "list",
    "series.cpu_usage": "list", "series.ram_used": "list", "series.swap_used": "list",
    "events": "list",
}


# Evento = [hora, nivel, mensaje, categoría, ctx]; ctx es aditivo (los 4 primeros
# campos son el contrato original, ctx puede faltar en productores viejos).
EVENT_CTX = {"source": "str", "type": "str", "category": "str", "value": "num|null",
             "threshold": "num|null", "ts_epoch": "num", "count": "num", "key": "str|null"}


def _is(val, tname):
    if tname == "null":
        return val is None
    if tname == "bool":
        return isinstance(val, bool)
    if tname == "num":
        return isinstance(val, (int, float)) and not isinstance(val, bool)
    return isinstance(val, {"str": str, "list": list, "dict": dict}[tname])


def check(doc, spec):
    """Return a list of human-readable violations of `spec` against `doc`."""
    errors = []
    for path, types in spec.items():
        nodes = [doc]
        for part in path.split("."):
            is_list = part.endswith("[]")
            key = part[:-2] if is_list else part
            nxt = []
            for node in nodes:
                if not isinstance(node, dict):
                    continue  # parent null/non-dict: path not applicable
                if key not in node:
                    errors.append(f"{path}: missing key '{key}'")
                    continue
                child = node[key]
                if is_list:
                    child = child[0] if isinstance(child, list) and child else None
                    if child is None:
                        continue
                nxt.append(child)
            nodes = nxt
        for val in nodes:
            if not any(_is(val, t) for t in types.split("|")):
                errors.append(f"{path}: {type(val).__name__} not in {types}")
    return errors


class SnapshotContract(unittest.TestCase):
    def test_fixture_matches_spec(self):
        with open(FIXTURE) as fh:
            fixture = json.load(fh)
        self.assertEqual(check(fixture, REQUIRED), [])
        self.assertEqual(fixture["schema"], EXPECTED_SCHEMA)

    def test_fixture_events_carry_ctx(self):
        with open(FIXTURE) as fh:
            events = json.load(fh)["events"]
        self.assertTrue(events)
        for ev in events:
            self.assertGreaterEqual(len(ev), 4)
            self.assertEqual(check(dict(zip(("t", "lvl", "msg", "cat"), ev[:4])),
                                   {"t": "str", "lvl": "str", "msg": "str", "cat": "str"}), [])
            if len(ev) > 4:
                self.assertEqual(check(ev[4], EVENT_CTX), [])

    def test_live_producer_matches_spec(self):
        env = dict(os.environ, PYTHONPATH=os.path.join(ROOT, "src"))
        proc = subprocess.run([sys.executable, "-m", "rog_monitor", "--json"],
                              capture_output=True, text=True, timeout=60, env=env)
        self.assertEqual(proc.returncode, 0, proc.stderr[-500:])
        live = json.loads(proc.stdout.strip().splitlines()[-1])
        self.assertEqual(live["schema"], EXPECTED_SCHEMA)
        self.assertEqual(check(live, REQUIRED), [])

    def test_checker_catches_breakage(self):
        self.assertTrue(check({"a": {}}, {"a.b": "num"}))           # missing key
        self.assertTrue(check({"a": {"b": "x"}}, {"a.b": "num"}))    # wrong type
        self.assertTrue(check({"a": {"b": True}}, {"a.b": "num"}))   # bool != num
        self.assertEqual(check({"a": None}, {"a.b": "num"}), [])     # null parent


if __name__ == "__main__":
    unittest.main()
