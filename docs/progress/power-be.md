# Progreso — A-POWER-BE (rama `v13/power-be`)

Backend de poder + perfiles↔poder + DB de docs. Estado: **COMPLETO**.

## Qué quedó hecho

### 1. `device_profiles.json` — campo `profile_power` por dispositivo
- Añadido `profile_power` al G614JV con sets `{pl1, pl2, dynamic_boost, thermal_target}`
  para `quiet` / `balanced` / `performance`, todos dentro del rango seguro del
  dispositivo (pl1 28-140, pl2 28-175, dynamic_boost 5-25, thermal_target 75-87).
- Orden garantizado: quiet < balanced < performance en cada perilla que sube calor.
  - quiet: 35/45/5/75 · balanced: 80/110/15/82 · performance: 140/175/25/87
- Cada set documenta `est_thermal` (banda térmica estimada bajo juego sostenido):
  quiet ~60-72 C, balanced ~72-84 C, performance ~85-95 C (CPU). Informativo, no se
  impone.
- Notas `_profile_power_note` explican el doble recorte y el alias power-saver=quiet.

### 2. `power_control.py` — aplicar poder real al cambiar de perfil
- `PowerControl.apply_for_profile(profile)`: resuelve el set, lo pre-recorta al rango
  seguro (primer recorte) y lo enruta por el **mismo** `apply()` → pkexec →
  `apply-power-control.sh` (segundo recorte contra firmware en vivo). NO toca offsets
  de reloj GPU (un cambio de perfil no pisa el OC manual).
- Helpers nuevos: `_canonical_profile` (alias quiet/power-saver/power_saver/powersave,
  balanced, performance), `_active_profile_entry`, `_safe_clamp`, `profile_power_for`.
- Si el dispositivo no trae `profile_power` → retorna `{"ok": True, "skipped": ...}`
  (los fans igual cambian; no aplica poder).
- CLI nuevo: `python -m rog_monitor.power_control apply-profile <quiet|balanced|performance>`.
- No asume sudo: todo write va por pkexec como hoy.

### 3. `fans.py` — curvas por defecto coherentes con `profile_power`
- Retocadas `DEFAULT_FAN_CURVES` (cpu/gpu/mid × 3 perfiles) alineadas al objetivo
  térmico de cada perfil: quiet llega al tope antes de ~75 C y arranca apagado (pwm 0)
  bajo ~42 C; balanced ~82 C; performance ~87-90 C.
- cap_rpm sigue quiet(4500) < balanced(5500) < performance(6500).
- Mantiene contrato de 8 puntos monótonos (validado). La **histéresis** la sigue
  aplicando rog-thermal-guardian.sh (otro repo) — no se tocó.

### 4. `device_docs.json` (NUEVO) — docs oficiales + rangos seguros
- 13 entradas por `vendor` × `component_class`:
  - Silicio: Intel (CPU-laptop, CPU-desktop), AMD (CPU-laptop, CPU-desktop),
    NVIDIA (GPU-laptop, GPU-desktop).
  - Chasis/OEM (chassis-laptop): ASUS, Lenovo, Gigabyte, MSI, HP, Dell, Acer.
- Cada entrada: `vendor`, `component_class`, `safe_range_rules {text, limits}`,
  `official_docs [{title,url}]` a páginas OFICIALES verificadas vía WebSearch/WebFetch.
- Estructura `_schema` documenta el shape y cómo extender (no una fila por SKU).
- Lo consume el panel Avanzado de A-POWER-UI vía `getDeviceDocs()`.

## Decisiones
- **Alias de perfil**: la nomenclatura del bus PPD es `power-saver`; las curvas y
  profile_power usan `quiet`. `_canonical_profile` los unifica (también power_saver,
  powersave). Esto ayuda al fix de rebote de perfiles que hace el orquestador en app.js.
- **GPU clock offsets NO se tocan en cambios de perfil**: el OC de reloj es manual y
  con doble consentimiento; un cambio de perfil no debe pisarlo. profile_power solo
  mueve pl1/pl2/dynamic_boost/thermal_target.
- **Doble recorte preservado**: `profile_power_for` recorta al min/max seguro del
  JSON (1.º) y el script recorta al min/max del firmware en vivo (2.º).
- **URLs Intel**: la forma `ark.intel.com/.../ark/products/...html` 404-redirige para
  crawlers; se usó la canónica `intel.com/.../products/sku/<id>/specifications.html`
  que devuelve la propia búsqueda de Intel (datos 14900HX 55/157 W confirmados).

## Archivos tocados
- `src/rog_monitor/device_profiles.json` (editado — campo profile_power)
- `src/rog_monitor/power_control.py` (editado — apply_for_profile + helpers + CLI)
- `src/rog_monitor/fans.py` (editado — DEFAULT_FAN_CURVES v13)
- `src/rog_monitor/device_docs.json` (NUEVO)
- `docs/progress/power-be.md` (este archivo)

## Verificación
- `python -c "import json;json.load(open('src/rog_monitor/device_docs.json'));json.load(open('src/rog_monitor/device_profiles.json'))"` → OK.
- apply-profile probado end-to-end con sysfs falso (ROG_FW_ATTRS_DIR): quiet/balanced/
  performance escriben los valores correctos recortados; power-saver→quiet; perfil
  inválido rechazado; device sin profile_power → skipped.
- Curvas de fan: 8 puntos monótonos, cap y pwm máximo quiet<balanced<performance.

## Claves i18n nuevas (para que el orquestador cablee en i18n.js, 8 idiomas)
Este backend no expone texto de UI nuevo directamente (los strings de error van por
los mensajes ya existentes en español). La UI (A-POWER-UI) que consume `est_thermal`
y `safe_range_rules.text` deberá registrar sus propias claves; este backend solo
provee datos JSON. No hay claves `t()` nuevas que cablear desde aquí.

## Pendiente / handoff
- A-POWER-UI consumirá `device_docs.json` vía `getDeviceDocs()` (IPC nuevo que main.js/
  preload deben exponer — coordinar). Si no está listo, la UI puede leer el archivo con
  fetch.
- El orquestador (app.js) debe llamar a `apply-profile` cuando el sistema cambie de
  perfil (junto con la curva de fan). El subcomando CLI ya existe.
- Ampliar `device_docs.json` con más SKUs/marcas es trivial: añadir objetos a `entries`.
