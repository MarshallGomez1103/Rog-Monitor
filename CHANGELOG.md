# Changelog

## 7.0.0 — 2026-06-10 · "Centro de Control"

### Added
- **Fan control center**: click the Fans panel to open it. Per-profile RPM
  cap (recalculates the hot end of the curves), full 8-point curve editor
  for the three fans, and a 60-second max-RPM benchmark (runs the fans at
  100% via pkexec and measures the real maximums). Dangerous curves (fans
  under 60% at the hottest points) require explicit consent. Changes are
  written to `Rog-Monitor-Scripts/scripts/rog-profile-sync.sh` (with a
  `.bak` backup) and applied by restarting the root service via pkexec.
- Live clocks: GPU core and VRAM frequency in MHz (NVIDIA and AMD), in the
  app and the TUI.
- GPU power history chart (app and TUI).
- Six original theme palettes replacing the previous set: Magma, Nébula,
  Océano, Glaciar, Reactor, Grafito — each with light and dark variants.

### Fixed
- The app now shows up in the taskbar as "ROG Monitor" with its icon instead
  of a generic "Electron" window (app name, desktopName, --class flag and
  StartupWMClass in the desktop entry).

### Changed
- Roadmap restructured: v7 = Control Center (done), v8 = universal laptop
  support, v9 = power-user tools, v10 = open-source release (last, on
  Marshall's go-ahead).

## 6.2.0 — 2026-06-10

### Added
- **Theme system in the desktop app**: 6 palettes (Ember, Midnight, Nous,
  Mono, Cyber, Slate) × light/dark/system mode, with a visual picker
  (TEMA button). Saved automatically.
- Click a process to terminate it (SIGTERM) with a confirmation dialog.
- Export the event log to a `.txt` file (EXPORTAR button, save dialog).
- Working zoom: Ctrl+wheel and Ctrl +/-/0; the layout is responsive and
  reflows instead of breaking.
- Missing-sensor guidance: when CPU power is not readable the app explains
  the exact command and what it does, instead of just saying "root".

### Changed
- Semantic temperature colors everywhere (app and TUI): blue = cold,
  green = normal, orange = near your limits, red = critical.
- Bigger, clearer typography; system sans for labels, monospace for numbers.
- Thermal-throttling alerts go to the event log only — no more desktop
  notifications for them (the CPU protecting itself is not an emergency).
- Fan curves capped at ~6800 RPM in the system scripts
  (`Rog-Monitor-Scripts/scripts/rog-profile-sync.sh`) to reduce bearing wear.

## 6.1.0 — 2026-06-10

### Added
- Power-source indicator (⚡ plugged in / 🔋 on battery) in the desktop app
  top bar and in the TUI battery line.
- dGPU (AsusMuxDgpu / MUX) button in the desktop app with confirmation dialog
  — the RTX drives everything, more FPS, more battery use, requires a reboot.
- Process table headers with explanations (% CPU where 100 = 1 core; RAM is
  resident memory), in both the app and the TUI.
- `alerts.throttle_min_ms` config (default 100 ms).

### Changed
- Thermal-throttling notifications are explicit (how many times, for how many
  ms, at what package temperature) and only fire when real throttle time
  accumulates — micro-blips of a few ms, normal on 13th-gen HX CPUs, no longer
  spam notifications.
- Desktop notifications auto-dismiss after 5 seconds (normal urgency — KDE
  pins critical ones forever).
- CPU/GPU watts are no longer painted red by default; red now only means
  abnormal power. The CPU W chart is amber instead of alarm-red.
- Chart min/max axis labels snap to steps of 5 so they stop jittering.

### Fixed
- Ctrl+mouse-wheel no longer zooms/breaks the desktop app layout (zoom locked).

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
