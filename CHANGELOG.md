# Changelog

## 14.0.0 — 2026-06-20

### Added

- **Guardian modes: Protection and Gaming.** Gaming keeps fans-first only and
  never trims Dynamic Boost/PL2, so there is no thermal throttling while you
  play (high ceilings, 95 °C CPU / 87 °C GPU). Protection keeps the previous
  conservative power-cutting behaviour. Selectable from the Guardian panel.
- **Autostart (minimized).** Optional "start with the system" setting that adds
  an XDG autostart entry launching the app minimized. The Python backend stays
  frozen (SIGSTOP, 0 % CPU) until you open the window, so it does not steal
  performance.
- **One-line install / uninstall.** `bash install.sh` does all user-level setup
  without sudo, creates a desktop shortcut, and only then — after printing
  exactly what it needs — asks once for sudo for the optional system
  integration. `bash uninstall.sh [--purge]` removes everything (configs kept by
  default). In-app **Maintenance** wizard for update / reinstall / uninstall.
- **Fan curve editor: hover tooltips** showing °C / % on each point (also while
  dragging) and a sticky "unsaved changes — scroll down to SAVE & APPLY" banner
  that jumps to the save button.

### Changed

- **Single folder.** Fan/profile scripts and their systemd units moved from the
  separate `~/Rog-Monitor-Scripts` into the main repo (`scripts/`, `systemd/`),
  so everything ships and uninstalls from one place.
- Profile selection no longer reverts: once the system confirms (busctl
  read-back) the chosen profile stays highlighted regardless of stream lag.

### Fixed

- **No more profile drift / battery-boot brick.** The automatic profile switch
  by power source (`rog-power-source` + udev rule) is now opt-in and no longer
  installed/enabled by default. Disable it on an existing system with
  `sudo bash scripts/rog-monitor-safe-mode.sh no-auto-profile`. GPU mode is
  never changed automatically.
- **Terminal UI** no longer breaks on mouse-wheel/scroll/zoom/resize (SIGWINCH
  refresh + robust SGR mouse drain) and exits cleanly ("Saliendo…", no
  tracebacks).

### Removed

- Dead `src/legacy/` module. Internal multi-agent handoff docs are no longer
  tracked in git (kept locally, ignored).

## 13.1.0 — 2026-06-18

### Added

- Unified **Guardian** tab in the Power Center for CPU and GPU thermal ceilings.
- Smart guardian backend with separate CPU/GPU ceilings, fan-first response,
  then conservative Dynamic Boost / PL2 reductions when temperatures stay high.
- Estimated hourly energy cost in the guardian panel using live CPU/GPU watts
  and a configurable electricity price.
- Model/SKU search in the Advanced documentation panel.
- Safe recovery script:
  `sudo bash scripts/rog-monitor-safe-mode.sh disable`.
- `SECURITY.md` with privileged-action scope, hardware safety rules and TTY
  recovery commands.

### Changed

- Removed the old GPU-only guardian block from the GPU tab; GPU now keeps GPU
  tuning controls, while automation lives under Guardian.
- The guardian does not apply GPU core or memory clock offsets automatically.
- Public docs were reduced to generic open-source documentation. Private/local
  calibration belongs in `~/.config/rog-monitor/device.json`.
- The systemd guardian unit allows writing the UI state JSON so the app can show
  live guardian status.

### Fixed

- CPU/GPU/Guardian Power Center tabs now share the same neon active state.
- The guardian service no longer crash-loops when publishing state from a
  systemd service.
- Public runtime files no longer include local machine names, personal names or
  home paths.

## 13.0.0 — 2026-06-18

### Added

- Safer Power Center controls with visible change summaries and double consent
  for advanced ranges.
- Advanced vendor/component documentation panel using official vendor links.
- Game session and benchmark improvements: summaries, comparisons, cost notes
  and clearer charts.
- Full process list modal and per-core CPU details.

### Fixed

- Profile selection no longer bounces visually while waiting for system
  confirmation.
- GPU mode changes are manual only; automatic AC/battery and boot paths no
  longer switch graphics mode.

## 12.0.0 — 2026-06-17

### Added

- Fan curves by profile, fan caps and guardian state JSON.
- Expanded themes, dashboard polish and multi-language UI coverage.

### Fixed

- Guardian hysteresis now cools down gradually instead of dropping fan
  aggression too quickly.
- Benchmark summaries handle larger JSON payloads.

## 11.0.0 — 2026-06-16

### Added

- Smarter fan behavior based on load, temperature and cooldown.
- Game session recording and comparison.
- Dashboard editing mode and improved theme system.

## 10.0.0 — 2026-06-15

### Added

- Multi-language desktop UI.
- Power Center foundation for PL1, PL2, Dynamic Boost, GPU thermal ceiling and
  GPU clock offset controls where supported.
- First version of the thermal guardian.
