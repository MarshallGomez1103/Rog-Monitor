# ROG Monitor Roadmap

ROG Monitor aims to be a safe Linux control center for laptop thermals, power,
fans, lighting and gaming overlays. The project should stay useful even when a
machine is only partially supported: unsupported write controls must degrade to
read-only instead of guessing.

## Current

* [x] Unified CPU/GPU smart guardian with separate thermal ceilings.
* [x] Guardian policy: fans and firmware thermal profile first, then Dynamic
  Boost and PL2 reductions if the machine is still too hot.
* [x] Safe recovery command for TTY sessions:
  `sudo bash scripts/rog-monitor-safe-mode.sh disable`.
* [x] Public security notes in `SECURITY.md`.
* [x] Advanced documentation panel with vendor/component/model search.
* [x] Local private calibration through `~/.config/rog-monitor/device.json`.
* [x] Guardian modes: **Protection** and **Gaming** (fans-only, no throttling). *(v14)*
* [x] Autostart minimized without stealing performance (backend frozen until shown). *(v14)*
* [x] Packaging: one-line install, one-line disable, one-line uninstall + in-app
  maintenance wizard; everything in a single folder. *(v14)*
* [x] Profile no longer drifts by power source (auto-switch is opt-in). *(v14)*

## Next

* [ ] Manual profile beside Ahorro, Balance and Performance.
* [ ] Larger official-doc catalog by exact model/SKU.
* [ ] First-run safety wizard that explains writable controls and recovery.
* [ ] GitHub Actions for syntax checks, JSON validation and read-only sensor smoke tests.
* [ ] Windows feasibility prototype: same ROG Monitor UX backed by Windows
  sensors/vendor APIs where available, strictly read-only first.

## Later

* [ ] Broader OEM support: Lenovo Legion, HP Omen, Dell/Alienware, Acer Predator and MSI.
* [ ] Generic `platform_profile` backend when OEM-specific controls are absent.
* [ ] AMD CPU/GPU telemetry and safe tuning support.
* [ ] Persistent history in SQLite.
* [ ] Plasma widget and optional local Prometheus exporter.
* [ ] Per-application policies for games and creative workloads.
* [ ] Cross-platform architecture split: shared UI concepts, Linux backend,
  Windows backend, common safety model.

## Permanent Safety Rules

* Never change GPU mode automatically from boot, udev, AC/battery events or
  background services.
* Never raise a value above firmware-reported min/max.
* Never apply GPU core/memory offsets from the smart guardian.
* Prefer read-only behavior over unsupported writes.
* Every privileged helper must have a documented recovery path.
