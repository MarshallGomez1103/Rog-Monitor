---
name: Device request
about: Request calibrated laptop support for the Power Center
title: "[device] "
labels: device
---

**Model**
- `cat /sys/class/dmi/id/product_name`:
- Marketing name, for example "ROG Zephyrus G14 2024":
- CPU:
- GPU:
- Distro + session (X11/Wayland):

**Firmware ranges** (paste exactly):
```bash
# Output of:
for a in ppt_pl1_spl ppt_pl2_sppt nv_dynamic_boost nv_temp_target; do
  d=/sys/class/firmware-attributes/asus-armoury/attributes/$a
  echo "$a: current=$(cat "$d/current_value") min=$(cat "$d/min_value") max=$(cat "$d/max_value")"
done
```

**If you do NOT have `asus-armoury`**, paste the min/max values from Armoury
Crate manual mode on Windows: PL1, PL2, Dynamic Boost, Thermal Target, and
Base/Memory Clock Offset.

> With this data, maintainers can add an entry to `device_profiles.json`.
> See `docs/supported-devices.md`.
