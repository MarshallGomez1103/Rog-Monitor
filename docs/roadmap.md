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
Spanish-first and 8-language, with a guardian nobody else ships.

## Current (done) — through v18

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
  sectors) via a single `pkexec smartctl` call. *(v18)*
* [x] **Hardware diagnostics hub**: one place with CPU/GPU/iGPU/battery/fans/motherboard
  info cards plus interactive **keyboard, speaker and display** tests. *(v18)*
* [x] **Clickable, categorized events** with a per-type explanation modal in all 8
  languages. *(v18)*
* [x] Benchmark detail fully internationalized; benchmark / event exports now generated
  in the active language; process "per-core" column neon fixed. *(v18)*

## P0 — LAUNCH (open the repo to the public)

The essentials so anyone can install it and trust it.

* [ ] **Packaging for non-developers**: Flatpak / AppImage installable without a
  terminal or manual dependencies — CoolerControl/LACT already ship Flatpaks.
* [ ] **Single polkit privileged helper** instead of scattered `pkexec` prompts.
* [ ] **GitHub Actions CI**: `node --check`, `py_compile`, JSON + i18n validation,
  and a read-only sensor smoke test.
* [ ] **Launch polish**: README with screenshots + GIF, a short video, current
  LICENSE / CONTRIBUTING / SECURITY, a simple GitHub Pages site, and graceful
  degradation verified on non-ASUS / AMD machines.
* [ ] **Community i18n**: base is ready; document how to contribute translations.

## P1 — DIFFERENTIATORS (what nobody else bundles)

The standout features that make ROG Monitor unique.

* [ ] **Per-game / per-application profiles**: on game launch, auto-apply power +
  fan curve + RGB + overlay. Detect via process / GameMode / MangoHud — nobody
  bundles all four. (`game_session.py` is the base.)
* [ ] **Serious benchmarks (true torture)**: a GPU Path Tracing stress in Vulkan that
  truly saturates the GPU and stresses the CPU via BVH build. Must degrade gracefully
  if the GPU has no RT cores — do **not** assume RTX. CPU split AVX / int / float,
  true multi-thread, reported per P-core / E-core, with a clear verdict:
  stable / throttling / headroom.
* [ ] **Guardian 2.0**: local telemetry of what it throttled and when, a scheduled
  "silent" mode, and configurable response curves.

## P2 — REACH (more hardware, more depth)

* [ ] **AMD**: CPU via ryzenadj / RAPL, CoreCtrl-style amdgpu, more ASUS SKUs, and a
  generic read-only fallback.
* [ ] **Battery**: charge-limit control in the UI (asusctl exposes it). *(wear / health done in v18)*
* [ ] **Disk depth**: SMART self-tests, predictive-failure alerts and per-disk temperature
  history (live read-only stats + on-demand SMART shipped in v18).
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

## Permanent Safety Rules

* Never change GPU mode automatically from boot, udev, AC/battery events or background services.
* Never raise a value above firmware-reported min/max.
* Never apply GPU core/memory offsets from the smart guardian.
* Prefer read-only behavior over unsupported writes.
* Every privileged helper must have a documented recovery path.
