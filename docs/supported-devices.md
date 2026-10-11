# Supported Devices

ROG Monitor prefers live firmware data over hard-coded model assumptions.
Power controls are enabled only when the machine exposes safe writable limits
through supported Linux interfaces.

## Detection Order

1. `~/.config/rog-monitor/device.json`
   Optional local override. Use this for private calibration that should not be
   committed to the public repo.
2. `src/rog_monitor/device_profiles.json`
   Public profiles reviewed by maintainers. These must contain only verified,
   model-safe ranges.
3. Live firmware ranges
   On compatible ASUS laptops, ROG Monitor reads
   `/sys/class/firmware-attributes/asus-armoury/attributes/` for each supported
   control and clamps writes to the firmware's own min/max.

## Current Public Support

| Platform | Status | Notes |
|---|---|---|
| ASUS laptops with `asus-armoury` sysfs | Supported | PL1, PL2, Dynamic Boost and GPU thermal ceiling are read live from firmware. |
| Generic Linux laptops/desktops | Read-only monitor | Sensors, fans and GPU telemetry depend on kernel/driver support. |
| NVIDIA GPUs | Partial | Telemetry uses NVML, with `nvidia-smi` as a fallback; clock offsets require driver support and are never applied automatically by the guardian. |
| Other OEMs | Documentation only | Advanced docs can link official vendor guidance, but hardware writes remain disabled until a safe backend exists. |

## Compatibility Matrix

What each feature needs on the machine. A feature whose requirement is missing
degrades to read-only or hidden; it does not guess.

| Feature | Requires | Without it |
|---|---|---|
| CPU temperatures, fans (RPM), RAM, disks, network | Standard hwmon / `/proc` (`coretemp`, `k10temp`, any `fan*_input`) | The missing value shows `N/A` |
| CPU package watts | Intel RAPL: `/sys/class/powercap/intel-rapl:*/energy_uj` readable by your user. The kernel restricts it to root by default; `scripts/enable-cpu-power.sh` (part of the system integration) adds a tmpfiles rule. | Watts show `N/A` |
| GPU telemetry (NVIDIA) | `libnvidia-ml.so.1` (NVML), or `nvidia-smi` as a fallback | No GPU data. While the dGPU is runtime-suspended the app does not query it. |
| GPU telemetry (AMD) | `amdgpu` hwmon | No GPU data |
| GPU mode (Hybrid / Integrated / MUX) display and manual switch | `supergfxctl` | Mode is not shown and cannot be changed from the app |
| CPU/GPU power limits (PL1, PL2, Dynamic Boost, thermal target) | `asus-armoury` firmware attributes under `/sys/class/firmware-attributes/asus-armoury/attributes/`, plus the root helpers from `scripts/install-system.sh` | Read-only |
| GPU clock offsets | NVIDIA driver whose NVML exposes the VF-offset calls, plus the root helpers. Uses NVML, not the X server. | Controls disabled |
| Fan curves and RPM caps | The `asus_custom_fan_curve` hwmon device, plus the `rog-profile-sync` service from the system integration | RPM display only |
| Thermal guardian | Fan-curve and power-limit support above, plus the `rog-thermal-guardian` unit from the system integration | Not available |
| Battery charge limit | `charge_control_end_threshold` on the battery (`asusctl battery limit` is also used when `asusctl` exists), plus the system integration to persist it | Cannot be changed from the app |
| Power profile | `tuned-ppd` or `power-profiles-daemon` (D-Bus `org.freedesktop.UPower.PowerProfiles`); ASUS `platform_profile` where present | Profile not shown or not changeable |
| Keyboard lighting (Aura) | `asusd` and `asusctl` | Aura control unavailable. The in-app enable button needs a root-owned `asusd` payload (see SECURITY.md). |
| FPS in the overlay | MangoHud with logging enabled and an `output_folder` (the app can write the setting) | Overlay hides the FPS row |
| Disk health (SMART) | `smartmontools` and the system integration | Panel unavailable |
| Desktop notifications | `notify-send` | Events are still logged |
| Gaming overlay (transparent, click-through window) | Electron always-on-top window | See the notes below |

### Wayland and X11

- Monitoring, power, fans, GPU clock offsets and Aura do not depend on the
  display server.
- **Overlay positioning on Wayland is unverified.** The overlay is placed with
  Electron's window position and bounds API. Wayland compositors may ignore
  client-side positioning and always-on-top hints, so the overlay may not land
  in the chosen corner or stay above fullscreen games. Reports are welcome.
- No overlay testing on X11 is recorded either.

### Tested hardware

| Status | Hardware / software |
|---|---|
| Tested | ASUS ROG Strix G614JV (2023, 16-inch), Intel Core i7-13650HX, NVIDIA GeForce RTX 4060 Laptop GPU, Bazzite (Fedora atomic) |
| Should work | Other ASUS ROG/TUF laptops whose kernel exposes `asus-armoury`, with the same sensors and tools. Power ranges are read live from firmware, but no calibrated profile exists, so verify them before applying. |
| Should work (read-only) | Any Linux laptop or desktop with standard hwmon sensors; AMD CPUs (`k10temp`) and AMD GPUs (`amdgpu`) are handled in the code but have not been run on real hardware by the maintainers |
| Unknown | Other distributions (Ubuntu, Arch, openSUSE), non-atomic Fedora, Wayland overlay behaviour, X11 overlay behaviour, laptops from other vendors, older ASUS models without `asus-armoury` |

If you run it on something in the last two rows, please open an issue with what
worked and what did not (the in-app report button pre-fills system details).

## Local Calibration

Create `~/.config/rog-monitor/device.json` with this shape:

```json
{
  "id": "custom",
  "name": "Local calibrated profile",
  "friendly_name": "Local calibrated profile",
  "calibrated": true,
  "controls": [
    {
      "key": "pl1",
      "attr": "ppt_pl1_spl",
      "label_es": "CPU PL1 (sostenida)",
      "label_en": "CPU PL1 (sustained)",
      "unit": "W",
      "min": 28,
      "max": 140,
      "default": 80,
      "writable": true,
      "reason": null
    }
  ]
}
```

Use only values reported by firmware or by the vendor's official tuning tool.
If a value is uncertain, leave the control read-only.

## Adding a Public Profile

1. Get the model identifier with:
   ```bash
   cat /sys/class/dmi/id/product_name
   ```
2. Read live firmware ranges when available:
   ```bash
   for a in ppt_pl1_spl ppt_pl2_sppt nv_dynamic_boost nv_temp_target; do
     d=/sys/class/firmware-attributes/asus-armoury/attributes/$a
     echo "$a: current=$(cat "$d/current_value") min=$(cat "$d/min_value") max=$(cat "$d/max_value")"
   done
   ```
3. Add a profile only if every writable range is verified on that exact model.
4. Do not include personal names, home paths, serial numbers or screenshots with
   private information.

## Safety Rules

ROG Monitor writes only allowlisted controls:

`ppt_pl1_spl`, `ppt_pl2_sppt`, `nv_dynamic_boost`, `nv_temp_target`

Every value is clamped in the UI and again in the privileged helper before it
touches hardware. GPU core and memory clock offsets are separate controls that
go through NVML (`apply-gpu-clocks.sh`) with their own limits and an extra
confirmation. The smart guardian may lower power automatically, but it does not
apply GPU core or memory clock offsets automatically.
