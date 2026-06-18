# ROG Monitor

Monitor de hardware en tiempo real para portátiles ASUS ROG en Linux — terminal
y app de escritorio. Sin telemetría, sin red, sin root para las funciones
principales.

```
  ╔═ 01 CPU ══════════════════╗  ╔═ 05 Historial ════════════╗
  ║  Avg 58.4 °C  Pkg 69 °C  ║  ║  CPU temp ▁▃▅▇█▇▅▃▁  ▲   ║
  ║  Potencia  28.4 W         ║  ║  GPU temp ▂▄▆▇▇▇▆▄▂  │   ║
  ╚═══════════════════════════╝  ╚═══════════════════════════╝
  ╔═ 02 GPU ══════════════════╗  ╔═ 06 Benchmarks ═══════════╗
  ║  Modo  Hybrid             ║  ║  [BENCHMARK]  [EXPORTAR]  ║
  ║  RTX 4060  51 °C  Use 12% ║  ╚═══════════════════════════╝
  ╚═══════════════════════════╝
  ╔═ 03 Ventiladores ═════════╗
  ║  CPU ████████░  3 300 RPM ║
  ║  GPU ██████░░░  2 600 RPM ║
  ╚═══════════════════════════╝
  ╔═ 04 Iluminación ══════════╗
  ║  [●] Rainbow  [○] Breathe ║
  ║  Brillo ●●●○  [APLICAR]   ║
  ╚═══════════════════════════╝
```

## Características principales

### Sensores (sin root)
- **CPU**: temperatura por núcleo, promedio/máx/mín, temperatura de Package,
  frecuencia, conteo de núcleos >90 °C, contador de thermal throttling.
- **GPU**: NVIDIA (`nvidia-smi`) y AMD (`hwmon/amdgpu`) — temperatura, uso,
  potencia, VRAM, frecuencias de núcleo y memoria. Detecta modo Hybrid /
  Integrated / AsusMuxDgpu (MUX) vía `supergfxctl`; maneja la dGPU apagada.
  Potencia con `power.draw.average` en NVIDIA (no la muestra instantánea que
  cae a 1-3 W al dormir la GPU).
- **Ventiladores**: RPM + barras proporcionales, calibración PWM→RPM real,
  cap de RPM aplicado en runtime por el servicio root.
- **Sistema**: RAM, todos los discos reales (con temperatura NVMe, ostree-aware),
  red, carga, uptime, batería con charge limit.
- **Procesos**: top por CPU (% del total del sistema) y top por memoria;
  cierre con confirmación.
- **Salud SMART**: `smartctl` vía pkexec (un solo clic en Sistema).
- **FPS en overlay**: vía registro de MangoHud (opt-in).

### App de escritorio (Electron + Python)
- 9 bloques numerados: 01 CPU, 02 GPU, 03 Ventiladores, 04 Iluminación,
  05 Historial, 06 Benchmarks, 07 Sistema, 08 Eventos, 09 Procesos.
- **Centro de Poder**: control calibrado de límites de potencia CPU/GPU,
  con doble recorte contra firmware — ver [sección más abajo](#centro-de-poder).
- **12 temas** × claro/oscuro con identidad visual propia (Magma, Nébula,
  Océano, Glaciar, Reactor, Grafito, Neón, Atardecer, Neon Nights, Cyberpunk,
  Aurora, Alba). Sin tarjetas genéricas: esquinas cortadas, números en placas
  inclinadas, fondos con brillo del acento.
- **Historial** con gráficas canvas interactivas: hover muestra el valor
  exacto y hace cuántos segundos fue. CPU temp y W arriba, GPU temp y W abajo.
- **Overlay para juegos**: ventana sin marco, transparente, siempre encima,
  click-through, para cualquier monitor y esquina.
- **Wizard de primera vez** (v9): detecta ventiladores → calibra con pkexec →
  benchmark CPU/GPU → tour de funciones. Nunca dice "medido" sin medir.
- **UX de 4 estados por widget** (v9): con datos / cargando / sin datos /
  error (ej.: ventilador dañado → icono quieto, no spinner de carga).
- Modales arrastrables; exportar/importar toda la configuración en un JSON.
- Tamaño de letra configurable (A−/Normal/A+/A++).

### Iluminación RGB (Aura + periféricos)
- Grid de 9 modos Aura: modos hardware detectados cuando el firmware los expone
  (Estático, Respirar, Rainbow Cycle, Rainbow Wave, Pulso) + Música funcional
  + 3 modos visibles pero honestos sobre su estado de soporte.
- **Modo Música**: captura el audio del sistema (PipeWire, `pw-record --target
  <sink>`) y ajusta brillo/color de Aura en tiempo real.
- Perfiles de Aura guardados en `~/.config/rog-monitor/aura.json`.
- Detección de teclados RGB USB de terceros; el control por OpenRGB llegará
  cuando el protocolo del periférico esté verificado.

### Centro de Poder

> ROG Monitor lee los rangos seguros directamente desde `asus-armoury` en
> sysfs o desde un perfil de dispositivo (`~/.config/rog-monitor/device.json`).
> Nunca escribe un valor fuera de los mínimos y máximos que el firmware declara.

Parámetros controlables cuando el firmware ASUS los expone:

| Parámetro            | Sysfs (`asus-armoury`)        |
|----------------------|-------------------------------|
| CPU PL1 (sostenido)  | `ppt_pl1_spl`                 |
| CPU PL2 (ráfaga)     | `ppt_pl2_sppt`                |
| GPU Dynamic Boost    | `nv_dynamic_boost`            |
| Thermal Target       | `nv_temp_target`              |

**Garantías de seguridad:**
1. Cada escritura se valida contra los `_max` / `_min` que el firmware declara
   en sysfs; nunca se envía un valor fuera de ese rango.
2. Al abrir el Centro de Poder, la app muestra los valores actuales (los que ya
   estaban, no los que escribe) y requiere un diálogo de consentimiento antes
   de cualquier cambio.
3. El botón **RESET A FÁBRICA** restaura todos los valores al stock del firmware.
4. Por defecto, la app no toca nada y arranca con los valores que el firmware
   ya tiene.

GPU Base Clock Offset y Memory Clock Offset se aplican por NVML cuando el driver
lo permite. Requieren confirmación adicional porque pueden causar inestabilidad.

Para agregar tu propio equipo o ajustar rangos, ver
[docs/supported-devices.md](docs/supported-devices.md).

### TUI (terminal)
- Gráficas Rich sin parpadeos, actualización 1/s.
- Colores semánticos consistentes con la app: azul = frío, verde = normal,
  naranja = cerca del límite, rojo = crítico.
- Mouse tracking correcto (la rueda no descuadra la pantalla).

---

## Instalación

```bash
git clone https://github.com/<tu-usuario>/Rog-Monitor
cd Rog-Monitor
bash scripts/install.sh      # venv + dependencias + comando `monitor` en ~/.local/bin
monitor
```

La potencia del CPU (Intel RAPL) requiere un cambio de permisos en `/proc`
(restringido desde CVE-2020-8694):

```bash
sudo bash scripts/enable-cpu-power.sh
```

App de escritorio (requiere Node.js/npm):

```bash
bash scripts/install-all.sh      # terminal + escritorio si npm está disponible
bash scripts/install-desktop.sh   # dependencias npm + entrada en el menú de apps
monitor --desktop                 # o lanzar desde el menú
```

### Rescate / desinstalación segura

Si algo del stack de servicios root causa problemas y solo puedes entrar por
TTY (`Ctrl+Alt+F3`), desactiva todo lo automático con:

```bash
cd ~/MyFiles/Dev/Rog-Monitor
sudo bash scripts/rog-monitor-safe-mode.sh disable
sudo reboot
```

Para quitar las integraciones root instaladas sin borrar tu configuración de
usuario:

```bash
sudo bash scripts/rog-monitor-safe-mode.sh uninstall
```

Para quitar solo lanzadores de usuario:

```bash
bash scripts/uninstall.sh
```

---

## Teclas (TUI)

| Tecla | Acción |
|-------|--------|
| `q` | Salir |
| `p` | Ciclar perfil de energía (power-saver → balanced → performance) |
| `g` | Cambiar modo GPU (Hybrid ↔ Integrated); pulsar de nuevo durante cambio pendiente = cancelar |
| `t` | Ciclar tema de color |
| `v` | Ver log de eventos completo |
| `e` | Exportar historial como JSON + CSV |
| `h` | Ayuda |

---

## CLI

```
monitor [--once] [--json] [--json-stream] [--desktop] [--interval S]
        [--no-gpu] [--theme TEMA] [--lang es|en] [--version]
```

`--json` / `--json-stream` emiten NDJSON con todos los sensores — es la API
que consume la app de escritorio y el punto de integración para widgets o
scripts externos.

---

## Configuración

`~/.config/rog-monitor/config.json` (se crea al hacer el primer guardado):

```json
{
  "lang": "auto",
  "theme": "rog",
  "interval": 1.0,
  "history_seconds": 900,
  "notifications": true,
  "alerts": {
    "cpu_temp_warn": 92,
    "gpu_temp_warn": 85,
    "cpu_power_warn": 140,
    "fan_stopped_cpu_temp": 60,
    "cooldown_seconds": 120,
    "throttle_min_ms": 100
  },
  "temp_colors": {
    "cpu": [70, 85, 92],
    "gpu": [60, 75, 83]
  }
}
```

`temp_colors` define tus límites personales `[verde_antes, amarillo_antes,
naranja_antes]` — por encima del último valor todo aparece en rojo.

Todos estos valores son editables directamente desde el modal **ALERTAS** de
la app de escritorio.

---

## Hardware soportado

### Perfiles calibrados

El repo incluye perfiles calibrados comunitarios y también puede leer rangos en
vivo desde sysfs. Para publicar un perfil nuevo, evita datos personales y usa
solo identificadores técnicos de firmware cuando sean necesarios para detectar
el dispositivo.

### Sensores genéricos

La capa de sensores enumera hwmon directamente; cualquier equipo con los
chips estándar funciona sin configuración extra:

- **CPU**: `coretemp` (Intel), `k10temp` / `zenpower` (AMD)
- **GPU**: NVIDIA vía `nvidia-smi`; AMD vía `amdgpu` hwmon
- **Ventiladores**: cualquier chip que exponga `fan*_input` (el chip `asus`
  da los tres ventiladores del ROG etiquetados cpu/gpu/mid)
- **Perfiles de energía**: `asus-wmi` / `asus-armoury`, con fallback a
  `platform_profile` genérico cuando no hay `asus-wmi`

Los sensores que falten degradan a `N/A` en silencio, sin spam de errores.

### Cómo agregar tu equipo

Ver [docs/supported-devices.md](docs/supported-devices.md) para:
- Cómo leer tus rangos seguros desde `asus-armoury` en sysfs (o desde
  Armoury Crate en Windows).
- El esquema del archivo `src/rog_monitor/device_profiles.json`.
- Cómo crear un perfil personalizado en
  `~/.config/rog-monitor/device.json`.
- La lista de modelos con perfiles ya incluidos.

---

## Sin telemetría, sin red

No se envía ningún dato a ningún servidor. El único uso de red permitido
es el botón de actualización (un `git fetch` sobre tu propio clon) y el
botón de reportar error (abre GitHub en el navegador con información del
sistema prellenada). Nunca se hace `git push` automáticamente.

---

## Licencia

MIT
