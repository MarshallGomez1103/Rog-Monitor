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
| NVIDIA GPUs | Partial | Telemetry uses `nvidia-smi`; clock offsets require driver support and are never applied automatically by the guardian. |
| Other OEMs | Documentation only | Advanced docs can link official vendor guidance, but hardware writes remain disabled until a safe backend exists. |

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
touches hardware. The smart guardian may lower power automatically, but it does
not apply GPU core or memory clock offsets automatically.
