# Changelog

## Unreleased (v22)

After the post-90 audit (`docs/audits/post90/`). **Root-side scripts changed without a
`VERSION` bump** (`rog-profile-sync.sh`, `rog-ctl.sh` paths and the fan watchdog), so the
app cannot detect old installed copies: run `sudo bash scripts/install-system.sh` once
after updating (`--dry-run` first). `VERSION` is still 21.0.0 on purpose; the release
number is the owner's decision. Short SHAs below point at a representative commit; the
full list is `git log 7d49333..HEAD`.

### Security
- The Python path to `pkexec` now verifies `VERSION` and root ownership of the helper,
  like `desktop/priv.js` already did (`c0ca804`). Running as root from the installed
  copy no longer compares `VERSION` against the user's checkout, which had made
  per-profile power limits fail with "needs install" (`14da3e4`).
- Recovery: uninstall and `docs/RECOVERY.md` use the root-owned safe-mode script, and
  power is restored through the calibrated profile (`335aa55`). ADR-0006 (host safety)
  documents the rules for testing on a real machine.
- The known `npm audit` finding in `electron-builder` (no patch available, only affects
  packaging) is recorded instead of ignored (`067bda7`).

### Fixed
- **Fans stuck high after the machine cooled down** (the firmware kept the old speed until
  the curve was rewritten). The `rog-profile-sync` watchdog now covers all three profiles:
  it looks at fans spinning at **3000 rpm or more** and compares each with what its own
  curve asks for at the **hottest** of CPU package and dGPU temperature (dGPU read without
  waking it), using the calibrated PWM-to-RPM table. A fan is "stuck" when it is above that
  by more than `max(900 rpm, 25 %)` for **60 s**; then all curves of the active profile are
  re-applied, with a **180 s** cooldown and a journal line saying whether the fans came back
  (`34f710d`, `15cf096`, `2b6d9d6`). An earlier iteration of the watchdog only looked at
  fans at >=4500 rpm, so quiet and balanced never triggered. The firmware behavior was observed on one ROG laptop; the
  watchdog logic is unit-tested with a fake sysfs but **not yet validated on real hardware**.
- Curve comparison covers all 8 points (a change in the low part of a curve was not
  applied until the next profile switch), and enabling a curve retries once on `EINVAL`
  (race with `asusd`) (`2b6d9d6`).
- The quiet profile never received its PL1/PL2: Dynamic Boost is now clamped to the live
  firmware range (quiet allows 0..0) instead of refusing the whole set (`2b6d9d6`).
- **Per-profile power limits almost never applied**: the firmware answers EBUSY right after
  a profile switch; the service now retries every <=30 s (5 tries) (`2fede12`).
- Values with no source no longer pretend to be `0`: `cpu.hot90`, `cpu.throttle_count`,
  `battery.on_ac`, RAM and swap, `uptime` and the network rate are `null` when `/proc` or
  sysfs cannot be read, and the TUI shows `N/A` (`4fe4693`, `884b3de`, `a1cecf9`,
  `3747691`). `procs_vram` carries a stable `reason_code` (`c90c80c`). Schema stays 1.
- Battery `charge_*` (uAh) was reported as Wh (`37356f0`). A reused PID could give negative
  CPU in the full process list (`405d1f3`). Network rate could go negative after a counter
  reset; TUI spun at ~94 % CPU with no terminal; a paused backend could be left stopped
  (state T) on restart (`5b0052f`, `58cee5e`).
- Robustness against malformed files and readers that fail: a bad `config.json`,
  `device.json`, `power-baseline.json`, `aura.json`, MangoHud CSV, game-session JSON or
  settings payload (NaN, Infinity, wrong types) no longer produces a traceback or breaks
  snapshots (`dae1295`, `4a54ad5`, `b94771e`, `ed2d6d8`, `41e9691`, `c8bc6af`, `1f9f53d`).
  A NaN/inf reading no longer contaminates benchmark maxima and the result JSON
  (`3eb4868`). Each reader in a sampling tick is isolated: one failing reader no longer
  discards the whole tick, and `BrokenPipeError` ends `--json-stream` cleanly
  (`8762d8c`, `a4562ee`, `fc80a33`, `b5343a3`).
- Desktop: benchmark cards were clipped and the list did not scroll (`a76b699`); EXPAND was
  too faint (`a50bc5b`); E-core usage bars were invisible in the CPU cores view; EPP text
  overlapped Uptime (`17cb34d`).
- CI: the Electron binary is downloaded explicitly and the job uses Node 22, so the E2E
  smoke runs green on GitHub (`c878859`).

### Changed
- **Electron 44.7.0** (from 42.11.12) and GitHub Actions bumped to `checkout` 7,
  `setup-python` 7, `setup-node` 7 and `upload-artifact` 7 (Dependabot, `9d1a483`,
  `d1733b1`).
- Default fan curves start at **50 C** and are identical in the service and the app; the
  editor axis spans 40-105 C (`2b6d9d6`).
- Fan animation is smooth by default; Configuration -> "Fan animation in saver mode"
  switches it to stepped frames (`2dd4f66`).
- Process tables (`#procs`, `#ram-procs`, `#allprocs`) share one sort model and one style
  rule, and expose `aria-sort` (`49ef464`, `d322915`, `d7944ae`).
- Benchmark delete no longer destroys the result immediately (see **Added**), and EXPAND and
  delete are real buttons with their own `aria-label` (`5715ea9`).
- The history chart editor was rebuilt on a pure model (`chart-editor-model.js`); legacy
  chart keys are rejected instead of shown (`2d22a2c`, `e67f82e`).
- The sampling cadence follows the monotonic clock (1.00 s instead of ~1.13 s) (`a8f68cd`).

### Added
- **Chart editor** (History -> Charts): choose which charts show, reorder them with the
  arrow buttons, Up/Down or Alt+Up/Down, or drag by the handle; quick presets; Escape
  closes the editor and returns focus to its button (`2227049`, `521b6b4`, `9cae37e`).
- **`NO DATA · N s` notice** and dimmed panels when the backend stops sending samples
  (threshold 6 s, visible window only); every snapshot carries `ts` (`22aed9a`). The gaming
  overlay dims too, and shows FPS as N/A when it was requested (`8a30bc4`).
- **Six panel states** (`loading`, `ok`, `empty`, `unsupported`, `error`, `stale`) as a pure
  model in `desktop/renderer/widget-states.js`, replacing the old four (`3f04ff5`). The
  `unsupported` state is still drawn like `empty` until the CSS supports it.
- **Undo** (6 s toast) when deleting a benchmark result (`5715ea9`).
- CPU card shows **usage %**; processes show **cores used** (2.35) instead of "235 %" and
  fill the available space (up to 25 in the desktop app; the TUI keeps 5) (`563cf4c`,
  `2dd4f66`).
- History usage mode: CPU % and GPU % on 0-100, **RAM and swap in GiB on 0..total**.
- **RAM, swap and disk-full alerts** (the RAM/Disk event filters now have producers)
  (`95810a1`). IOPS and % busy in the disk panel (`00d00a5`).
- "GPU mode" explained and hidden when `supergfxd` does not report it (`d38c191`).
- `README.md`: Requirements, widget states, chart editor, fan watchdog, opt-in thermal
  guardian, quality gates and an honest note on which screenshots are old.
  `scripts/check-docs.mjs` fails if those facts drift.

### Tests & CI
- **Python coverage 52.28 % -> about 90 %**: CI floor raised **50 -> 80 %** (`22171b7`,
  measured 90.54 % on Python 3.12 in CI when the floor was raised). New suites exercise
  `cli`, `procs`, `fps`, `settings`, `gpu`/NVML, `power`, `power_control`, `fans`,
  `game_session`, `aura`, `benchmarks` and `app` orchestration with fake sysfs, clocks and
  runners (`751919e` ... `e491ee2`). The live-GPU shape test is now opt-in
  (`ROG_LIVE_GPU=1`) because it could wake the dGPU (`e89e1f6`).
- **Node coverage** floor 90 % of lines (CI: `node --test --experimental-test-coverage`);
  `desktop/test/*.test.js` also covers the pure models for processes, chart editor,
  widget states, the overlay stale state, benchmarks and this docs checker.
- `scripts/check-docs.mjs` (README/CHANGELOG facts, personal paths, relative links) runs
  with `node scripts/check-docs.mjs`; it is **not wired into CI yet**.
- Baseline before the v22 work: 162 Python tests, 46 Node tests, E2E 29/29; dependency
  versions pinned in `requirements-lock.txt` (`4c49a4d`).

### Performance
- Exact sampling cadence (1.00 s instead of ~1.13 s).
- Atomic writes for config, fan curves and autostart; timeouts on blocking calls (`6b89e8d`).
- The per-process VRAM list refreshes in the background: the tick no longer waits up to
  6.5 s for `nvidia-smi` (`e41b5c4`).
- Measured with the app visible on the maintainer's machine (Wayland, one machine, not a
  general benchmark): smooth fan animation ~58 % CPU, stepped "saver" animation ~18 %, no
  animation ~11 % (`2dd4f66`, `77885ea`). Smooth is the default.

### Docs
- Roadmap: v21 current, v22 in progress, overlay and benchmarks marked **partial** with
  what is done and what is missing; Guardian 2.0 and the single privileged helper stay
  future work. The unproven promise of an overlay over KDE/Wayland was removed (`98f1883`).
- `docs/RECOVERY.md` uses the root-owned safe-mode and restores power through the
  calibrated profile. ADR-0006 (host safety). The v22 plan, status and checkpoint notes
  live in `docs/agent-work/v22/`.

### Known limits / pending validation
- **Wayland overlay not validated**: the gaming overlay has not been verified over
  fullscreen games on KDE Wayland.
- **Installer in a clean VM not validated**: `install-system.sh` was only exercised with
  `--dry-run` and on the maintainer's machine, not on a fresh VM.
- **Mouse drag in the chart editor** was validated only with synthetic events, not with a
  physical mouse.
- **Real thermal test of the fan watchdog pending**: the owner still has to run a heat and
  cool-down test on hardware after installing the new root scripts
  (`journalctl -u rog-profile-sync | grep -i fan`).
- Overlay (opt-in) and benchmarks are **partial**; the roadmap lists what is missing in each
  (for benchmarks: the extra GPU stress test, a per-core CPU split and a stable /
  throttling verdict). Guardian 2.0 and a single polkit helper are future work, not shipped.
- Screenshots `01`-`07` and the demo GIF in the README predate v22.

## 21.0.0 — 2026-10-10

Hardening release from a full audit (security, correctness, performance, tests).
**Breaking for system integration:** root helpers moved to root-owned locations —
run `sudo bash scripts/install-system.sh` once (`--dry-run` first). Until then the
app reports "system components missing" for privileged actions.

### Security
- **Privilege boundary:** root never executes or imports user-writable code. Helpers
  are installed root-owned in `/usr/local/libexec/rog-monitor`, the Python package in
  `/usr/local/lib/rog-monitor`, root Python runs isolated (`python3 -I`). The app only
  `pkexec`s those helpers (`desktop/priv.js` allowlist, owner/version checks); every
  `pkexec sh -c "<string>"` was replaced by `rog-ctl.sh` with validated argv.
- Input validation: power limits refused out of range / non-numeric; fan curves
  validated (8 points, increasing temps, PWM floor when hot) in the app and again as root.
- Root reads of user JSON refuse symlinks/FIFOs and cap size; guardian state writes
  no longer follow symlinks. Root units: `NoNewPrivileges`, `ProtectSystem=full`, `PrivateTmp`.
- `enable-asusd.sh` refuses user-owned binaries (Homebrew) unless explicitly overridden.
- User PATH dirs appended, never prepended, for spawned commands; HTML escaping of
  process/disk names in the renderer.
- Complete, idempotent uninstall (`--dry-run`, `--purge`) and `docs/RECOVERY.md`.

### Fixed
- **TUI:** mouse clicks, wheel and unbound keys no longer make the screen "jump"
  (escape sequences were leaking as keys and every key re-sampled the history).
  Mouse tracking is off; Esc closes overlays; small-terminal notice; N/A with reasons;
  the TUI no longer freezes after the first alert.
- **Desktop:** the backend now resumes after minimizing (it stayed frozen).
- **Thermal guardian 2.0:** never writes `throttle_thermal_policy` (it set *silent*
  when meaning performance); restores to the current profile's limits instead of a
  stale value; recovers after a crash mid-cut; hysteresis + gradual restore;
  **simulation mode** (on by default for the first enable) and one traceable
  `decision=… reason=…` log line per decision.
- CPU usage double-counted guest time; warm-up samples no longer report 0 %.
- Corrupt `fan-curves.json` is backed up instead of losing calibration; atomic config writes.
- NDJSON stream survives a failing sample; first line is primed.

### Changed
- GPU telemetry via NVML instead of spawning `nvidia-smi` every second (subprocess
  churn 1.5/s → 0.13/s) and the dGPU is **not woken** when runtime-suspended
  ("dGPU asleep" state in the UI). Slow probes cached with TTL/backoff.
- Snapshot carries `schema: 1`; series stay aligned (gaps are `null`, charts break lines).
- Events: context (`source/type/value/threshold`), combinable filters (desktop) and a
  severity filter key `f` (TUI), per-key cooldown, hysteresis and `×N` dedup.
- Benchmarks: recorded conditions, warm-up, repetitions, p50/p95/p99, CPU throughput,
  JSON+CSV export (`docs/BENCHMARKS.md`).
- Metrics: RAM available/cache, swap %, disk IOPS and busy %, NVMe temperature, LUKS/dm
  and removable disks resolved correctly.
- Design tokens, stale/loading/error states, visible keyboard focus, dialog roles,
  contrast fixes, reduced-motion; memory shown in GiB/MiB.
- Electron 42.11.12.
- SMART: no-root capability per disk, cached last reading (`~/.cache/rog-monitor/smart.json`,
  stale after 24 h) with age/origin in the app and a SMART line in the TUI; fresh
  readings stay a user-initiated pkexec action.
- History: CPU %, RAM % and swap % series; desktop history toggle "Temp/W ↔ CPU/RAM usage";
  extra TUI sparklines when the terminal is wide enough.
- Translations completed for fr/it/pt/zh/ja/ko (power, game session, cores: 720 strings).

### Tests & CI
- New stdlib suites: unit, contract (Python↔JS), PTY TUI, guardian simulation,
  installer dry-run; `node:test` suites; CI runs them all plus an Electron E2E smoke
  (`scripts/e2e-smoke.mjs`) under xvfb, `bash -n` on every script, Dependabot.
- `scripts/measure.py` measures the monitor's own CPU/RAM/subprocess cost.
- Docs: `docs/ARCHITECTURE.md`, ADRs 0001-0005, compatibility matrix.

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
