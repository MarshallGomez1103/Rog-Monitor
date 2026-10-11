# Architecture

How ROG Monitor is put together, what crosses which boundary, and why. For the
threat model and verification commands see [SECURITY.md](../SECURITY.md); for
the reasoning behind the main choices see the [decision records](adr/).

## Level 1: system context

```
                      +---------------------------+
   user ------------> |        ROG Monitor        |
   (TUI / desktop)    |  monitor + control center |
                      +-------------+-------------+
                                    |
        reads (no root)             |            writes (root, via pkexec / systemd)
  +---------------------------------+------------------------------------+
  | /sys (hwmon, powercap, DMI,     |  /sys/class/firmware-attributes/   |
  |  PCI power state, battery)      |    asus-armoury (PL1/PL2/boost)    |
  | /proc                           |  fan-curve hwmon, charge limit     |
  | NVML, nvidia-smi (fallback)     |  NVML clock offsets                |
  | D-Bus / CLI: tuned-ppd, asusd,  |  systemd units (rog-*.service)     |
  |  asusctl, supergfxctl           |                                    |
  | MangoHud CSV logs (FPS)         |                                    |
  +---------------------------------+------------------------------------+
```

ROG Monitor opens no network sockets. The only network-capable actions are the
explicit UPDATE button (`git fetch` in your clone) and the report button (opens
a GitHub issue draft in the browser).

## Level 2: containers

```
 +----------------------- user session (no privileges) ------------------------+
 |                                                                              |
 |  +-------------------------+   NDJSON, 1 line per interval   +------------+ |
 |  | Python core             | ------------------------------> | Electron   | |
 |  | python -m rog_monitor   |  stdout of --json-stream        | main.js    | |
 |  |   --json-stream         |                                 | (spawns    | |
 |  |                         | <---- SIGSTOP / SIGCONT ------- |  backend)  | |
 |  | readers: cpu gpu fans   |                                 +-----+------+ |
 |  |  power sysinfo procs    |                                       |        |
 |  |  aura power_control fps |                         webContents.send('stats')
 |  | alerts (event log)      |                         + IPC invoke/handle    |
 |  +-----------+-------------+                                       |        |
 |              |  same core, own process                +------------v------+ |
 |              v                                        | preload.js        | |
 |  +-------------------------+                          | contextBridge ->  | |
 |  | Rich TUI (monitor)      |                          | window.rog        | |
 |  | separate consumer       |                          +------------+------+ |
 |  +-------------------------+                                       |        |
 |                                                         +----------v------+ |
 |                                                         | renderer        | |
 |                                                         | (dashboard,     | |
 |                                                         |  overlay window)| |
 |                                                         +-----------------+ |
 +-------------------------------------+----------------------------------------+
                                       | /usr/bin/pkexec <absolute helper path>
 ======================================|==== privilege boundary ================
                                       v
 +--------------------------- root-owned, installed once ----------------------+
 |  /usr/local/libexec/rog-monitor/   helpers + VERSION      (root:root, 0755)  |
 |  /usr/local/lib/rog-monitor/       Python package copy    (root:root)        |
 |  /etc/systemd/system/rog-*.service units                  (root:root, 0644)  |
 |                                                                              |
 |  rog-profile-sync   fan curves + profile power   (enabled by the installer)  |
 |  rog-thermal-guardian   thermal guardian         (installed, off until the   |
 |                                                   user enables it in the app)|
 |  rog-battery-limit  persist charge limit         (enabled on first use)      |
 |  rog-power-source   AC/battery auto profile      (opt-in, not installed)     |
 +------------------------------------------------------------------------------+
```

The TUI and the desktop app each run their own core process. They are not
meant to be used at the same time, and neither depends on the other.

### Python core (`src/rog_monitor/`)

Standard library plus `rich` for the TUI (see
[ADR-0002](adr/0002-no-new-dependencies.md)). `app.App.sample()` calls every
reader once per tick and returns one dict. `snapshot_json()` serializes it for
`--json` (one snapshot) and `--json-stream` (one line per `--interval`),
dropping TUI-only state and adding `series`, `events`, `version` and `schema`.

| Module | Reads |
| --- | --- |
| `cpu.py`, `hwmon.py` | per-core temperatures, frequency, throttle counters from hwmon / cpufreq / `/proc` |
| `gpu.py`, `gpu_clocks.py` | NVIDIA through NVML (`ctypes`, no pip package) with `nvidia-smi` as fallback, AMD through `amdgpu` hwmon, GPU mode through `supergfxctl` |
| `fans.py` | fan RPM, fan-curve state, guardian status file |
| `power.py` | RAPL package watts, platform / PPD profile, battery |
| `power_control.py` | asus-armoury ranges and current values (reads; writes go through a root helper) |
| `sysinfo.py`, `procs.py` | RAM, disks, network, load; process tables |
| `aura.py` | keyboard lighting state through `asusctl` / D-Bus |
| `fps.py` | last FPS value from the freshest MangoHud CSV log |

### Snapshot contract

One JSON object per line. The envelope carries an integer `"schema"` (currently
`1`), distinct from the app `"version"`. Rules are in
[ADR-0004](adr/0004-ndjson-schema-versioning.md). The contract is checked by
`tests/test_contract.py` (keys the UI actually reads, against
`tests/fixtures/snapshot-v1.json`) and `desktop/test/contract.test.js`.

`events` is a list of `[time, level, message, category, ctx]`. A consumer that
reads only the first four fields keeps working because `ctx` is additive.

### Electron main (`desktop/main.js`)

- Spawns `python -m rog_monitor --json-stream --interval 1`, buffers stdout by
  line, parses each line and forwards it to the main window and, if open, the
  overlay window on the `stats` channel.
- Respawns the backend 3 s after it exits. A watchdog checks every 5 s; if
  stats stop for more than 5 s while a window is visible it sends `SIGCONT`,
  and if nothing arrives within 3 more seconds it respawns the backend.
- When the main window is hidden or minimized and no overlay is open, the
  backend is frozen with `SIGSTOP` and resumed with `SIGCONT`, so an idle app
  costs no sampling.
- All renderer-to-main calls are `ipcMain.handle` handlers (61 at the time of
  writing). `preload.js` exposes them as `window.rog.*` through
  `contextBridge`; the renderer has no direct Node or Electron access.

### Privileged helpers

Everything that runs as root is a root-owned copy installed by
`scripts/install-system.sh`. The app reaches it only through `runPriv()` in
`main.js`, which uses `desktop/priv.js`:

1. the helper name must be in the closed list `HELPERS`;
2. the helper must exist under `/usr/local/libexec/rog-monitor/`, its `VERSION`
   must equal the app's, and the helper and its directory must be owned by
   uid 0 and not group/world-writable; otherwise the call returns
   `needsInstall` and nothing runs;
3. the call is `/usr/bin/pkexec <absolute helper path> <validated args>`; there
   is no `pkexec sh -c`;
4. arguments are validated in `priv.js` (integer ranges, enums, a device
   regex) and again by the helper.

`scripts/rog-ctl.sh` is the multiplexer for small actions (`fans-restart`,
`battery-limit`, `guardian`, `smart-summary`, `smart-json`). Root Python always
starts through `scripts/rog-py.sh` (`python3 -I`, fixed `sys.path`), so it
never imports from the repo or the user's home. The one exception is the
installer itself, run through `pkexec` only after an explicit confirmation.

Root services read a few data files from the user's home (for example the
stored fan curves) and the guardian writes a status JSON there. These are data,
never executed or imported; see SECURITY.md for the hardening applied to those
reads.

### systemd units

| Unit | Role | State after `install-system.sh` |
| --- | --- | --- |
| `rog-profile-sync.service` | applies fan curves, RPM caps and per-profile power | enabled and started |
| `rog-thermal-guardian.service` | fans-first thermal guardian (Protection / Gaming) | installed, not enabled |
| `rog-battery-limit.service` | re-applies the charge limit (plus a resume hook in `system-sleep`) | installed; enabled when the user sets a limit |
| `rog-power-source.service` | applies a profile on AC/battery change | not installed; only refreshed if it already exists |

All root units use `NoNewPrivileges=yes`, `ProtectSystem=full` and
`PrivateTmp=yes`. `rog-power-notify.service` is a user unit and runs as the
user.

## Data flow and cadence

```
 sysfs / procfs / NVML / D-Bus
        |   (one sample per tick)
        v
 App.sample() --> AlertEngine.check() --> events (deque, 60 entries)
        |
        v
 snapshot_json() --> stdout line --> main.js --> 'stats' --> renderer widgets
```

- **Tick**: 1 s by default (`interval` in `config.json`, `--interval`). The
  desktop app passes `--interval 1`.
- **First line**: delta-based readers (process CPU %, RAPL watts) are primed
  and the stream waits 0.5 s before the first snapshot, so it does not start
  with empty values.
- **A failing tick does not kill the stream**: the exception is logged to
  `error.log` and the loop continues.

### Caching (`cached.py`)

Slow or flaky sources are wrapped in `Cached(fn, ttl, backoff_max)`. `get()`
always returns the last good value and never blocks the tick: when the value is
stale it refreshes on a daemon thread. The first read is synchronous. If `fn`
returns `None` or raises, the previous value is kept and the retry delay grows
as `ttl * 2^failures` up to `backoff_max`.

| Source | TTL | Notes |
| --- | --- | --- |
| `supergfxctl` GPU mode | 10 s | backoff up to 120 s; a call can take up to 4 s |
| PPD profile (`busctl`) | 3 s | keeps the last profile if `busctl` fails |
| Aura snapshot (`asusctl` / `busctl`) | 15 s | build can take seconds |

The NVIDIA process list (VRAM per process) is cached for 5 s inside `gpu.py`.

### dGPU sleep guard (`gpu.py`)

Querying NVML or `nvidia-smi` wakes a runtime-suspended NVIDIA GPU, which costs
power and can stall the tick. Before any NVIDIA query, `_dgpu_asleep()` reads
`power/runtime_status` of the NVIDIA PCI function (vendor `0x10de`, display
class) from sysfs, which does not wake it. If the status is `suspended` or
`suspending` the reader returns no GPU data for that tick (`gpu.active` is
`null`) and the VRAM process list is skipped. If the NVIDIA query fails, the
reader backs off for 15 s before trying again. NVML failing to load switches
permanently to `nvidia-smi` for that process.

### Events model (`alerts.py`)

`AlertEngine.check()` compares each sample with the thresholds in
`config.json -> alerts` and appends events. Each event is
`(time, level, message, category, ctx)` where `ctx` has:

- `source`: `cpu`, `gpu`, `fan`, `disk`, `ram`, `power`, `system`, `guardian`;
- `type`: `alert` (threshold crossed), `action` (the user changed something),
  or `telemetry`;
- `category`, `value`, `threshold`, `ts_epoch`, `count`, `key`.

Noise control:

- **Hysteresis**: an alert fires at the threshold and clears only after the
  value drops below `threshold - margin` (`hysteresis_temp`, default 3 degrees C;
  `hysteresis_pct`, default 5 %, for power).
- **Cooldown**: the same alert key cannot fire again within
  `cooldown_seconds` (default 60).
- **Dedup**: while an episode is open, repeats update one line with a counter
  instead of adding new lines.
- Throttling is logged but does not raise a desktop notification; it also has
  a minimum duration (`throttle_min_ms`).
- Desktop notifications use `notify-send` when it is installed and
  `notifications` is true.

### Thermal guardian

`scripts/rog-thermal-guardian.sh` runs as a root systemd unit, fans first:
raise fan aggression near the ceiling, and only after a sustained excess trim
GPU Dynamic Boost and PL2 in small steps, restoring them as the machine cools.
It has two modes: Protection (fans, then power) and Gaming (fans only, never
trims power). It never applies GPU clock offsets and never calls `supergfxctl`.
It publishes its state to a JSON file in the user's data directory that the
core reads for the UI. Its writes and the simulation-first rollout are covered
in [ADR-0005](adr/0005-guardian-simulation-first.md).

## Tests

Standard library only: `unittest` for Python and `node:test` for the desktop
code. See [CONTRIBUTING.md](../CONTRIBUTING.md#running-tests).
