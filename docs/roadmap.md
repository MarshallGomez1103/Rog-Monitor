# ROG Monitor Roadmap

ROG Monitor aims to be the **safe, beautiful "Armoury Crate for Linux"**: a single
control center for laptop thermals, power, fans, lighting and a gaming overlay —
with no telemetry, no automatic dangerous changes, and a recovery path for every
privileged action. It should stay useful even when a machine is only partially
supported: unsupported write controls degrade to read-only instead of guessing.

## Where we stand vs. the Linux competition

ROG Monitor already overlaps — in one polished app — with tools that are usually
separate:

| Area | Typical Linux tool(s) | ROG Monitor today |
| --- | --- | --- |
| System monitoring | Mission Center, Resources, btop | Full dashboard, history, per-core grid |
| Fan curves | CoolerControl | Per-profile 8-point curves + RPM cap + calibration |
| Power / undervolt / OC | LACT, CoreCtrl, TuxClocker, ryzenadj | Power Center: PL1/PL2/Dynamic Boost/thermal, double-clamp |
| RGB | OpenRGB, asusctl, Polychromatic | Aura grid + music mode (+ Redragon planned) |
| Gaming overlay | MangoHud | Click-through overlay (row/box), FPS via MangoHud |
| Thermal automation | (mostly DIY scripts) | **Smart guardian** (Protection / Gaming) — unique |

The differentiator is the **combination + safety + UX**: everything in one place,
English-first public docs and an 8-language UI, with a guardian nobody else ships.

## Current (done) — through v21

* [x] Unified CPU/GPU smart guardian with separate thermal ceilings.
* [x] Guardian modes: **Protection** and **Gaming** (fans-only, no throttling). *(v14)*
* [x] Guardian Gaming: **configurable fan cap** (default = measured max). *(v15)*
* [x] Per-profile fan caps that actually persist independently. *(v15 — bug fix)*
* [x] Autostart minimized without stealing performance (backend frozen until shown). *(v14)*
* [x] Packaging: one-line install / disable / uninstall + in-app maintenance wizard;
  everything in a single folder. *(v14–v15)*
* [x] Profile no longer drifts by power source (auto-switch is opt-in). *(v14)*
* [x] Overlay redesign: thin single-row top-center layout, theme-aware. *(v15)*
* [x] Full UI internationalization across all 8 languages, incl. new events. *(v15)*
* [x] **Competitive, multilingual in-app roadmap** (8 languages), aligned to the phases
  below; timeline titles aligned in one column. *(v16)*
* [x] Safe recovery commands for TTY sessions (`rog-monitor-safe-mode.sh`).
* [x] Advanced documentation panel with vendor/component/model search.
* [x] **Battery health panel**: wear / health %, charge cycles, current vs design
  capacity, live charge / watts. *(v18)*
* [x] **Disk health panel**: live usage, temperature, model, filesystem and read/write
  I/O rates, plus on-demand **SMART** (power-on hours, cycles, SSD wear, reallocated
  sectors) via a single `pkexec .../rog-ctl.sh smart-json` call (validated device, root-owned helper). *(v18)*
* [x] **Hardware diagnostics hub**: one place with CPU/GPU/iGPU/battery/fans/motherboard
  info cards plus interactive **keyboard, speaker and display** tests. *(v18)*
* [x] **Clickable, categorized events** with a per-type explanation modal in all 8
  languages. *(v18)*
* [x] Benchmark detail fully internationalized; benchmark / event exports now generated
  in the active language; process "per-core" column neon fixed. *(v18)*
* [x] **Privileged-command transparency**: Help → System Commands lists every
  `pkexec` command with the literal command + what it does + why it needs root, in all
  8 languages; the literal command also shows in the Power confirm and SMART panel. *(v19)*
* [x] **AppImage packaging** via electron-builder (`npm run dist`), Python backend
  bundled as resources. *(v19 — Flatpak is P2 below)*
* [x] **CI i18n validation** (`scripts/validate-i18n.mjs`) + **`TRANSLATING.md`**
  contributor guide. *(v19)*
* [x] Diagnostics hub open bug fixed (global `_t` collision with roadmap.js); dashboard
  bottom-left dead space rebalanced. *(v19)*
* [x] **Public README media**: screenshots plus short GIF demo are in place. *(v20)*
* [x] **Public roadmap cleanup**: v19 restored in the timeline, the launch checklist
  retired from the pending list, and Flatpak moved to the longer-horizon packaging track. *(v20)*
* [x] **i18n long-tail polish**: history-chart hover text, fan-curve generated labels,
  and Power Center Guardian labels now follow the active UI language. *(v20)*

* [x] **v21 — hardening release** (full audit, 90 checkpoints): root only runs root-owned
  copies (`/usr/local/libexec/rog-monitor`, ADR-0001), validated power/fan inputs, hardened
  systemd units, complete uninstall + `docs/RECOVERY.md`, NDJSON contract `schema: 1` with
  contract tests, NVML instead of `nvidia-smi` per tick, dGPU no longer woken by the monitor,
  TUI "gallery" scroll bug fixed, unified events (cooldown / hysteresis / dedup), Guardian
  simulation mode + safe restore, reproducible benchmarks, SMART cache, CI with 160+ tests and
  an Electron E2E smoke. *(v21)*

## In progress — v22 (branch `feat/v22`, not released yet)

* [x] CPU card shows **usage %** next to the temperature; per-process load shown as **cores
  used** (2.35) instead of a confusing "235 %".
* [x] History "usage" mode: CPU % and GPU % on a fixed 0–100 axis, **RAM and swap in GiB on a
  0..total axis**, "no swap" label when there is none.
* [x] **RAM, swap and disk-full alerts**: the RAM / Disk event filters finally have producers.
* [x] Disk panel shows IOPS and % busy.
* [x] **Fans that stay stuck high after the machine cools down** are detected and the profile
  curves are re-applied (each fan vs its own curve, calibrated RPM, 60 s hold).
* [x] Per-profile power limits are retried when the firmware answers "busy" right after a
  profile switch (they almost never applied before).
* [x] App with the window open: ~30–60 % → ~11–19 % CPU (animations stepped); exact 1.00 s
  sampling cadence; atomic config writes; TUI no longer spins without a terminal.

## P1 — DIFFERENTIATORS (what nobody else bundles)

The standout features that make ROG Monitor unique.

* [~] **Customizable overlay** — *partial*. **Done:** opt-in click-through overlay, thin row
  or box layout, monitor picker, 7 anchor positions, choose CPU / GPU / fans / FPS (FPS via
  MangoHud). **Missing:** themes/skins, free drag placement, RAM / VRAM / disks / battery and
  CPU-usage metrics, metric order, live preview, and a real test on KDE Wayland over a
  fullscreen game (not verified yet — Wayland may ignore positioning). Must stay lightweight.
* [ ] **Per-game / per-application profiles**: on game launch, auto-apply power +
  fan curve + RGB + overlay. Detect via process / GameMode / MangoHud — nobody
  bundles all four. (`game_session.py` is the base.)
* [~] **Serious benchmarks** — *partial*. **Done (v21):** reproducible CPU and local-GPU
  load tests with recorded conditions, warm-up, repetitions, p50 / p95 / p99, throughput,
  throttle events, fan-cap verdict and export. **Missing:** the GPU Path Tracing stress in
  Vulkan (BVH build on the CPU, graceful without RT cores — do **not** assume RTX), the CPU
  AVX / int / float split reported per P-core / E-core, and a clear verdict:
  stable / throttling / headroom.
* [~] **Guardian 2.0** — *partial*. **Done (v21):** simulation mode (on by default the first
  time), every decision logged with its reason, gradual and crash-safe power restore.
  **Missing:** one owner per fan/power attribute (asusd also writes curves), a scheduled
  "silent" mode and configurable response curves.
* [~] **Single privileged helper** — *partial*. **Done (v21):** one root-owned entry point
  (`rog-ctl.sh`) with validated arguments and an allowlist in the app. **Missing:** a real
  polkit policy so each action does not need its own password prompt.

## P2 — REACH (more hardware, more depth)

* [ ] **AMD**: CPU via ryzenadj / RAPL, CoreCtrl-style amdgpu, more ASUS SKUs, and a
  generic read-only fallback.
* [ ] **Packaging — Flatpak**: optional package format. Needs real hardware testing
  because Flatpak's sandbox conflicts with direct `/sys`, udev, `pkexec`, and systemd
  workflows unless permissions/portals are designed carefully.
* [ ] **Battery**: charge-limit control in the UI (asusctl exposes it). *(wear / health done in v18)*
* [ ] **Disk depth**: SMART self-tests, predictive-failure alerts and per-disk temperature
  history (live read-only stats + on-demand SMART shipped in v18).
* [ ] **System provenance / anti-scam report**: a new **My System Info** view that
  collects hardware-reported usage signals in one place: disk/NVMe power-on hours,
  battery cycles and wear, BIOS/DMI model and date, and any CPU/GPU/fan/runtime
  counters exposed by firmware, drivers or the kernel. Every field must show its
  source and confidence (`hardware-reported`, `kernel-estimated`, or `not exposed`)
  so we help buyers spot suspicious "new" machines without pretending every
  component exposes lifetime hours.
* [ ] **Driver manager**: detect installed GPU/Wi-Fi/chipset drivers and their versions,
  flag outdated ones, and offer safe updates (NVIDIA/Mesa/firmware) via the distro's
  package manager — read-only inventory first, guided updates with a recovery path.
* [ ] **Smarter, space-aware layout**: auto-fill empty areas (e.g. the gap left when the
  Lighting block is short), denser cards on small windows, and a tidy default arrangement
  so no large dead space remains.
* [ ] **CoolerControl-level fans**: multiple temperature sources, mixed / function
  curves, and a GPU fan curve.
* [ ] **Full RGB**: music-by-zone, an OpenRGB bridge for non-ASUS peripherals, and
  AniMe Matrix where present. **Redragon** stays BLOCKED until a Windows USB capture
  (Sinowealth family, documented brick risk) — never send blind commands.

## P3 — ECOSYSTEM (community and long term)

* [ ] **Persistent history**: SQLite, a long-term thermal panel + export, and an
  optional Prometheus / Grafana exporter.
* [ ] **Crowdsourced device profiles**: community `device_profiles.json` plus a simple
  web to share calibrated profiles.
* [ ] **Plasma widget**, an accessibility pass, and broader OEM support
  (Lenovo Legion, HP Omen, Acer Predator, MSI) via a generic `platform_profile` backend.
* [ ] **Windows app**: a companion build for Windows to control the same machine
  (power / fans / RGB / overlay) where the vendor tools are heavy or intrusive —
  reusing the Python sensor core and the desktop UI, with a Windows-native privileged
  helper in place of `pkexec`. Linux stays the focus; this is a long-term direction.

## Permanent Safety Rules

* Never change GPU mode automatically from boot, udev, AC/battery events or background services.
* Never raise a value above firmware-reported min/max.
* Never apply GPU core/memory offsets from the smart guardian.
* Prefer read-only behavior over unsupported writes.
* Every privileged helper must have a documented recovery path.
