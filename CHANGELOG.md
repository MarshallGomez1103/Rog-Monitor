# Changelog

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
