# Changelog

## 19.0.0 — 2026-06-25

Launch-prep release: command transparency, the Diagnostics fix, and P0/Launch
readiness (AppImage, i18n CI, contributor docs).

### Added
- **Command transparency** (Help → System Commands): lists every privileged
  command the app can run with `pkexec`, showing the literal command exactly as
  executed plus *what it does* and *why it needs root*, in all 8 languages. The
  literal command is also shown in the Power confirm dialog and the SMART panel.
- **AppImage packaging** via `electron-builder` (`cd desktop && npm run dist`); the
  Python backend, scripts and VERSION are bundled as `extraResources`.
- **i18n validation in CI** (`scripts/validate-i18n.mjs`): fails on a missing base
  language (en/es), any undefined `data-i18n` in `index.html`, or a transparency
  command without its texts; warns on untranslated non-base languages.
- `docs/TRANSLATING.md` — how to add or fix a language.
- **Keyboard test is now click-to-activate**: keys are captured *only* while the test is
  on (no more background scrolling), and you exit with **Shift+Esc** (so Escape itself can
  be tested).
- **Selection animations**: a lightweight CSS sweep when picking a power profile
  (AHORRO/BALANCED/PERFORMANCE) or GPU mode, plus a subtle glow on the top-bar menus
  (respects `prefers-reduced-motion`).
- **Battery clarity**: hovering WATTS when it reads `0 W` on AC explains it (plugged in,
  battery at/above the charge limit = normal); CYCLES `N/A` keeps its "firmware doesn't
  report it" tooltip.
- Roadmap (P1): **customizable overlay** — themes, per-monitor placement, and a picker for
  which metrics to show (8 languages, in-app and docs).

### Fixed
- **Diagnostics hub opened nothing**: `diagnostics.js` and `roadmap.js` both declared
  a global `_t`, so the browser failed to parse `diagnostics.js` entirely. Renamed the
  diagnostics helper to `_dt`; the button is also wired on the proven path.
- **Dead space bottom-left** on the dashboard: instead of moving blocks between columns
  (reverted), the last block of each column now stretches to fill its height via CSS, so
  no gap remains. A one-time migration corrects layouts touched by the earlier attempt.

## 18.0.0 — 2026-06-24

Hardware diagnostics release. Disk and battery health, a diagnostics hub with
interactive hardware tests, explainable events, and i18n/UI bug fixes.

### Added
- Battery health panel: wear / health %, charge cycles, current vs design
  capacity, live charge and watts (backend fields also surfaced in the TUI).
- Disk panel: live usage, temperature, model, filesystem and read/write I/O
  rates, plus on-demand **SMART** (power-on hours, cycles, SSD wear, reallocated
  sectors) via a single `pkexec smartctl -j` call, cached per session.
  `smartmontools` added to the installer dependencies.
- Diagnostics hub (Tools → Diagnostics): CPU/GPU/iGPU/battery/fans/
  motherboard info cards plus interactive keyboard, speaker (L/R) and display
  (full-screen color) tests. Motherboard info read from DMI without root.
- Events are now clickable and categorized by type, with a per-type explanation
  modal translated into all 8 languages, and a type filter.

### Fixed
- Benchmark detail strings now go through i18n (were hardcoded Spanish).
- Benchmark and event exports are generated in the active language.
- Processes "per-core" (% CORE) column neon now renders like the other columns.

## 17.0.0 — 2026-06-23

Pre-launch polish pass. Stability, modal/auth UX, navigation, widget
interactions, high-zoom layout, and a fully translated roadmap.

### Fixed

- **The freeze is gone.** On window restore under KDE/Wayland the
  `restore`/`show`/`focus` events can arrive out of order, leaving the backend
  stuck in its power-saving `SIGSTOP` so charts froze and the cursor stuck. A
  watchdog now tracks the last stats line and force-`SIGCONT`s (then respawns)
  the backend if it goes silent for >5 s; the UI shows a "reconnecting…" pill
  instead of going mute. `procs.py`'s `/proc` scan is wrapped in
  `signal.alarm(1)` so a D-state process can't hang the stream.
- **Confirm dialogs render above the backdrop.** Chained modals (e.g. GPU
  clock-offset confirm over the Power Center) used to appear *behind* the dim
  layer; the active confirm now uses `.modal-top` (z-index 60, toast 90) and is
  focused.
- **High-zoom layout.** Removed the dark-pink void under LIGHTING (a Neon Nights
  radial bleeding through a flex-stretched block → `main { align-items: start }`)
  and capped the keyboard-detection box (`#peripherals` max-height + scroll) so
  it no longer grows without bound.
- **Core hover no longer reflows the grid.** "Click for details" is now a
  floating tooltip instead of an inline zoom that misaligned every core.

### Added

- **Themed pre-confirm before pkexec.** A single ROG-styled dialog lists the
  exact values about to be written (PL1/PL2, GPU TGP, clock offsets…) and notes
  a password will be asked. The password stays with `pkexec` — never handled
  in-app.
- **Redesigned toasts** with ok / warn / error variants (color + icon).
- **CONFIGURATION is a first-level button** (one click, no longer nested in
  Tools) and a 🌐 language globe is always visible; the duplicate in-Config
  language grid was removed (single source). The top nav bar collapses with a
  chevron (state persisted).
- **Power profiles** animate on switch and carry per-button tooltips
  (Saver / Balanced / Performance).
- **Grab a fan to pause its spin** animation; it resumes on release.
- **(i) info on VRAM modes** explaining C = compute, G = graphics, CG = both;
  the RAM process list is sortable by RAM / name / PID like the CPU one.
- **Roadmap fully translated.** The whole timeline — current capabilities and
  the complete v1→v17 history, not just the future phases — now renders in all
  8 languages and re-paints on language change.

### Removed

- The blinking "Live" indicator (over-animated; replaced with a calm lamp).

## 16.0.0 — 2026-06-20

### Fixed

- **i18n now covers the whole app, live.** Changing language translates everything
  visible without reopening modals — including the text shown in native system
  `window.confirm()` dialogs, toasts/status with interpolated values, Aura status,
  and the benchmark buttons/labels. The language-change hook now re-paints already
  visible dynamic content (Aura state, open benchmark modal, inline history, process
  table). 67 new keys across all 8 languages.
- **Process table: the highlighted column follows the sort.** The CPU column was
  always neon regardless of sort order; now only the actively-sorted column is
  highlighted (`data-sort-col` + scoped CSS), and the `cpu_core` → `cpu-core` cell
  desync was fixed so "Core" highlights the real core column.
- **Type the fan cap with the keyboard.** The cap input no longer rewrites its own
  value on every keystroke (which erased partial numbers like `4500`); it commits on
  `change`/blur with clamping intact. Same fix for the per-fan inputs.

### Added

- **Main process table is sortable** (CPU / RAM / Core / Name), reusing the existing
  `#allprocs` sort pattern.
- **Overlay temps colored by level.** Temperatures use the dashboard's thresholds
  (passed main→overlay via `pushOverlayConfig`), labels are legible light-gray, and
  the numbers are larger. Degrades to static colors if thresholds are absent.
- **Settings split into CONFIGURATION and ALERTS / THRESHOLDS.** New `#config-modal`
  groups language, appearance (mode/theme/size, moved out of the old theme modal),
  autostart and notifications; the alerts modal now holds only thresholds + colors.
  Tools menu is `Power · Overlay · Alerts · Configuration`.
- **System tray + real Quit (Steam-style).** Closing the window minimizes to tray
  (backend stays SIGSTOP-suspended); a tray menu and a **Quit** item in the System
  menu fully quit — closing the overlay and killing the backend.
- **One dashboard button.** Layout and edit-mode merged into a single `#dash-btn`
  with the edit-mode toggle inside the dashboard modal.
- **Power button** now carries the neon accent matching the Tools toggle.
- **Roadmap: aligned, multilingual, competitive.** Timeline titles align in one
  column (grid layout); content is translatable in all 8 languages and re-renders on
  language change; phases reframed as the launch-oriented P0–P3 roadmap, with
  `docs/roadmap.md` synced.

## 15.0.0 — 2026-06-20

### Fixed

- **Per-profile fan caps now persist independently.** Setting a different RPM cap
  for Saver / Balanced / Performance no longer collapses all three to the last one
  saved. The global `cap_rpm` mirror (the contamination source) was removed; each
  profile keeps its own cap. Editing several profiles and saving once now persists
  them all in a single privileged step.

### Added

- **Guardian Gaming: configurable fan cap.** A "Gaming cap (RPM)" field (default
  = measured maximum) lets fans climb above the normal cap while gaming, enforced by
  the fan service only when the guardian is in active Gaming mode (decoupled, no extra
  password prompt).
- **Overlay redesign.** New default is a thin single **row** anchored **top-center**
  (with box mode still available); new **top-center / center / bottom-center**
  positions; the overlay now follows the active theme accent; the cryptic "AVG" label
  was clarified (CPU shows average-of-cores temperature + package watts).
- **Full internationalization.** The whole UI — Fans modal, modal titles, tooltips,
  toasts and newly generated events — now translates across all 8 languages; the
  backend re-localizes new events when the UI language changes.

### Changed

- **Maintenance/Settings cleanup.** The duplicate "Update" button was removed from the
  System menu (it lives in **Maintenance** now: Update / Reinstall-Repair / Uninstall);
  the uninstall button is visually uniform with the others; "Alerts" became
  **"Configuration"** grouping autostart, notifications, thresholds and colors.
- **README**: one-line install and one-line uninstall up top, with a clear note about
  what the single sudo step does.

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
