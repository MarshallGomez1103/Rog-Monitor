---
name: Solicitud de dispositivo
about: Pide soporte calibrado para tu portátil (Centro de Poder)
title: "[device] "
labels: device
---

**Modelo**
- `cat /sys/class/dmi/id/product_name`:
- Nombre comercial (ej. "ROG Zephyrus G14 2024"):
- CPU:
- GPU:
- Distro + sesión (X11/Wayland):

**Rangos del firmware** (pégalos tal cual):
```
# Salida de:
for a in ppt_pl1_spl ppt_pl2_sppt nv_dynamic_boost nv_temp_target; do
  d=/sys/class/firmware-attributes/asus-armoury/attributes/$a
  echo "$a: current=$(cat $d/current_value) min=$(cat $d/min_value) max=$(cat $d/max_value)"
done
```

**Si NO tienes `asus-armoury`**, pega los mín/máx de cada slider del modo
manual de Armoury Crate (Windows): PL1, PL2, Dynamic Boost, Thermal Target,
Base/Memory Clock Offset.

> Con esos datos armamos tu entrada en `device_profiles.json`.
> Ver `docs/supported-devices.md`.
