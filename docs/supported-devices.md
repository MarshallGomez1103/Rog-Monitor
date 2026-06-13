# Dispositivos soportados y cómo agregar el tuyo

El **Centro de Poder** (control de PL1/PL2, Dynamic Boost, techo térmico y
offsets de clock GPU) necesita conocer los **rangos seguros** de tu equipo.
ROG Monitor los obtiene de dos formas, en este orden:

1. **En vivo desde `asus-armoury`** (lo más seguro y universal). Si tu portátil
   ASUS expone `/sys/class/firmware-attributes/asus-armoury/attributes/`, la app
   lee `min_value` / `max_value` / `current_value` de cada knob en tiempo real.
   El firmware **ya recorta** cualquier valor fuera de rango, así que esto
   funciona en muchos ROG (Strix, Zephyrus, TUF) sin perfil previo.
2. **Perfil de dispositivo** (`src/rog_monitor/device_profiles.json`): da el
   nombre bonito, marca el modelo como *calibrado*, y aporta los rangos de los
   offsets de clock GPU (que NO viven en sysfs).

## Equipos calibrados

| Modelo | DMI `product_name` | CPU PL1 | CPU PL2 | Dynamic Boost | Techo térmico GPU |
|---|---|---|---|---|---|
| **ASUS ROG Strix G16 (G614JV)** — *referencia calibrada* | `G614JV` | 28–140 W (def 140) | 28–175 W (def 175) | 5–25 W (def 25) | 75–87 °C (def 87) |
| Genérico ASUS (`auto`) | — | leído en vivo de sysfs | leído en vivo | leído en vivo | leído en vivo |

> Offsets de clock GPU (base 0–200 MHz, memoria 0–300 MHz) se muestran pero
> quedan **bloqueados en Wayland** (requieren X11 con Coolbits). Es una
> limitación del driver NVIDIA, no de la app — nunca se fingen aplicados.

## Esquema de un perfil (`device_profiles.json`)

```jsonc
{
  "id": "asus-rog-strix-g16-g614jv",   // id único; o "custom"
  "name": "ASUS ROG Strix G16 (G614JV)",
  "friendly_name": "ROG Strix G16 2023",
  "dmi_match": "G614JV",               // subcadena de product_name para autodetectar
  "dmi_field": "/sys/class/dmi/id/product_name",
  "calibrated": true,
  "controls": [
    {
      "key": "pl1",                    // pl1 | pl2 | dynamic_boost | thermal_target | base_clock_offset | mem_clock_offset
      "attr": "ppt_pl1_spl",           // nombre del attr en asus-armoury (null si no aplica)
      "label_es": "CPU PL1 (sostenida)",
      "unit": "W",
      "min": 28, "max": 140, "default": 140,
      "writable": true,
      "reason": null                   // si writable:false, por qué
    }
    // … pl2, dynamic_boost, thermal_target, base_clock_offset, mem_clock_offset
  ]
}
```

Solo estos cuatro `attr` se escriben nunca (lista blanca, recorte doble):
`ppt_pl1_spl`, `ppt_pl2_sppt`, `nv_dynamic_boost`, `nv_temp_target`.

## Cómo agregar tu equipo

### Opción A — override personal (no toca el repo)
Crea `~/.config/rog-monitor/device.json` con la misma estructura de un perfil y
`"id": "custom"`. Tiene prioridad sobre la autodetección.

### Opción B — aportar tu modelo al proyecto (pull request)
1. Averigua tu modelo: `cat /sys/class/dmi/id/product_name`.
2. Lee tus rangos seguros. Lo ideal es directamente del firmware:
   ```bash
   for a in ppt_pl1_spl ppt_pl2_sppt nv_dynamic_boost nv_temp_target; do
     d=/sys/class/firmware-attributes/asus-armoury/attributes/$a
     echo "$a: current=$(cat $d/current_value) min=$(cat $d/min_value) max=$(cat $d/max_value)"
   done
   ```
   Si no tienes `asus-armoury`, toma los rangos del modo manual de **Armoury
   Crate** en Windows (los mín/máx de cada slider) — así se calibró el G614JV.
3. Agrega tu entrada al arreglo `devices` de `device_profiles.json` y abre un PR
   (o usa la plantilla de issue **"Solicitud de dispositivo"**). Marca
   `"calibrated": true` solo si verificaste los valores en tu equipo.

> ⚠️ **Seguridad:** nunca pongas rangos mayores a los que reporta tu firmware /
> Armoury Crate. La app recorta dos veces, pero un perfil mal hecho podría
> ocultar el recorte real. Ante la duda, deja los controles en solo lectura
> (`"writable": false`).
