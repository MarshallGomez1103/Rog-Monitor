# Changelog

## 6.0.0 — 2026-06-10

### Added
- **Electron desktop app** (`desktop/`): instrument-panel design, animated
  fans at real RPM, canvas history charts, power-profile and GPU-mode buttons,
  one-click repo updater, auto-recovering Python backend over `--json-stream`.
- `monitor --desktop` flag and "ROG Monitor" application-menu entry
  (`scripts/install-desktop.sh`).
- `--json` / `--json-stream` machine-readable output (NDJSON API).
- Top-processes panel (instantaneous CPU% from /proc deltas).
- All real disks shown (one per device, ostree-aware mount dedup).
- Full event log view (`v` key) and key bar pinned under the title with
  theme-colored keys.
- User-customizable temperature color limits (`temp_colors` in config).
- GPU mode panel now shows supported modes and pending changes
  ("Hybrid → Integrated, log out to apply"); pressing `g` during a pending
  change cancels it.
- MIT LICENSE file; proposed v8/v9 roadmap.

### Fixed
- GPU toggle no longer requests the mode you are already in after a transient
  supergfxctl read failure (failures are no longer cached).
- GPU mode changes run in a worker thread — the UI no longer freezes (and
  could previously appear to hang) while supergfxd is mid-transition.
- Child processes (supergfxctl, busctl, notify-send) no longer inherit the
  terminal stdin, which could swallow keystrokes (the "t crashed it" bug).
- Crash-proof render loop: unexpected errors are logged to
  `~/.local/share/rog-monitor/error.log` and shown as a flash message instead
  of killing the app.
- VRAM display no longer crashes on `[N/A]` values during GPU transitions.

## 5.0.0 — 2026-06-10

Complete rewrite: single script → modular Python package (`src/rog_monitor/`).

### Added
- Flicker-free dashboard (Rich `Live` with alternate screen).
- CPU package power via Intel RAPL with rolling history and graceful fallback
  (`scripts/enable-cpu-power.sh` grants non-root read access).
- Thermal throttling detection (package throttle counter + events).
- 1m / 5m / 15m temperature and power averages.
- Multi-row history graphs (CPU °C, GPU °C, CPU W) with axis labels.
- Alert system with configurable thresholds, desktop notifications and event log
  (CPU/GPU temp, throttling, stopped fans, abnormal power).
- GPU mode detection (Hybrid / Integrated / Dedicated via supergfxctl) and AMD
  GPU support; dGPU power-off handled with backoff instead of stalls.
- Interactive keys: cycle power profile, toggle iGPU/dGPU, themes, JSON/CSV
  export, help.
- System panel: RAM, disk + NVMe temp, network rate, load, uptime, battery with
  charge limit.
- Persistent config (`~/.config/rog-monitor/config.json`), auto-calibrating fan
  maximums, Spanish/English UI.
- Sensor layer reads sysfs directly (no `sensors` subprocess, no error spam),
  with generic hwmon discovery for non-ROG hardware.
- EPP / P-state display that explains the `powersave` governor confusion.
- `--once`, `--interval`, `--no-gpu`, `--theme`, `--lang`, `--version` flags.
- Installer (`scripts/install.sh`) creating the `monitor` command.

### Changed
- Old v2 script preserved as `src/legacy/rog_monitor_v2.py`.

## 2.x — 2026-06-08

- Bash → Python migration, Rich output, thermal history sparklines.
