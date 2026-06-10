# Changelog

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
