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

## Current (done)

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
* [x] Safe recovery commands for TTY sessions (`rog-monitor-safe-mode.sh`).
* [x] Advanced documentation panel with vendor/component/model search.

## Next — P1 (adoption blockers; do these first)

* [ ] **Packaging for non-developers**: Flatpak / AppImage, a proper **polkit
  policy** instead of scattered `pkexec` prompts, and **GitHub Actions CI**
  (syntax, JSON validation, read-only sensor smoke tests). This is the single
  biggest barrier to open-source adoption — CoolerControl/LACT already ship Flatpaks.
* [ ] **Per-game / per-application profiles**: auto-apply a bundle of power + fan +
  RGB + overlay settings when a game launches (process/GameMode/MangoHud detection).
  No competitor combines all four — this is our standout feature. (`game_session.py`
  is a starting point.)

## Next — P2 (reach and depth)

* [ ] **Broader hardware**: AMD CPU (ryzenadj/RAPL), AMD GPU (CoreCtrl-style), and
  generic machines degrading to read-only; more ASUS SKUs.
* [ ] **Battery**: charge-limit control in the UI (asusctl exposes it) and wear/health.
* [ ] **CoolerControl-level fans**: multiple temperature sources, mix/function curves,
  and a GPU fan curve.
* [ ] **RGB completion**: finish music/zones, the **Redragon** protocol (BLOCKED until
  a Windows USB capture — Sinowealth family has documented bricks), an OpenRGB bridge
  for non-ASUS peripherals, and an effects library. AniMe Matrix where present.
* [ ] Manual profile beside Ahorro / Balance / Performance.

## Later — P3 (polish and ecosystem)

* [ ] Persistent history in SQLite; long-term thermal panel; optional Prometheus exporter.
* [ ] First-run safety wizard explaining writable controls and recovery.
* [ ] Community device-profile crowdsourcing for `device_profiles.json`; simple website.
* [ ] Broader OEM support (Lenovo Legion, HP Omen, Dell/Alienware, Acer Predator, MSI)
  via a generic `platform_profile` backend.
* [ ] Plasma widget; accessibility pass; community translations.
* [ ] Cross-platform architecture split (shared UI, Linux/Windows backends, common safety model).

## Permanent Safety Rules

* Never change GPU mode automatically from boot, udev, AC/battery events or background services.
* Never raise a value above firmware-reported min/max.
* Never apply GPU core/memory offsets from the smart guardian.
* Prefer read-only behavior over unsupported writes.
* Every privileged helper must have a documented recovery path.
