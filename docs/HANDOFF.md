# HANDOFF — memoria compartida entre agentes

> Cada agente actualiza esta sección al terminar. El siguiente la lee primero.

## Última sesión: Claude (Opus 4.8) — 2026-06-10 (v8.2.0)

### Estado: arreglos grandes de ventiladores + Aura + overlay. Commit local, SIN push.

Probado en vivo en el G614JV real (no solo unit): backend `--json`, `aura
apply/state` por CLI, lectura D-Bus de asusd, arranque de la app Electron 9 s
sin errores de JS/python. Lo único SIN clic real: el overlay y el flujo
`GUARDAR Y APLICAR` con pkexec (no tengo su contraseña).

#### 1. VENTILADORES — causa raíz encontrada y corregida
- **El bug real:** el servicio root corría `/usr/local/sbin/rog-profile-sync`
  (copia con topes `255 255` = RPM máximas), pero la app editaba la copia del
  REPO `~/Rog-Monitor-Scripts/scripts/rog-profile-sync.sh`. Estaban
  desincronizadas → el cap NO llegaba al hardware, no persistía y los perfiles
  casi no se diferenciaban a temperatura alta. Verificado leyendo
  `pwm*_auto_point7/8_pwm` = 255 mientras el repo tenía 247.
- **Solución:** las curvas viven ahora en un JSON del USUARIO
  `~/.config/rog-monitor/fan-curves.json` (`{cap_rpm:{cpu,gpu,mid},
  profiles:{performance|balanced|quiet:{cpu|gpu|mid:{temps[8],pwms[8]}}}}`).
  Reescribí `rog-profile-sync.sh`: en cada cambio de perfil localiza ese JSON
  (glob `/var/home/*` y `/home/*`, porque corre como root), lo valida con
  python3 y lo aplica; si falta cae a curvas por defecto. Persiste entre
  reinicios porque el JSON sobrevive. Acepta `SIGHUP` para reaplicar.
- `desktop/main.js`: `get-fan-config` lee del JSON (o defaults del script);
  `set-fan-config` escribe el JSON (sin pkexec) y luego **un solo pkexec**
  `install -m0755 <repo script> /usr/local/sbin/rog-profile-sync && systemctl
  restart`. Reinstalar en cada guardado mantiene root al día con el repo.
- `src/rog_monitor/fans.py`: el `percent` es **relativo al cap** (denominador =
  cap si existe; clamp a 100). Recarga el cap por mtime del JSON.
- Curvas por defecto diferenciadas: performance ~97% tope, balanced ~80%,
  quiet ~67% — cambiar de perfil SÍ baja RPM aun a 90 °C.
- **PENDIENTE de Marshall:** la primera vez hay que aplicar para que el script
  nuevo entre a `/usr/local/sbin`. Abrir Ventiladores → cap → GUARDAR Y APLICAR
  (pide contraseña), o `sudo bash ~/Rog-Monitor-Scripts/install.sh`.

#### 2. AURA — efectos
- **Bug:** `asusctl` devuelve rc=0 aunque el firmware rechace el efecto
  (`laser`, `stars`… no existen en el teclado de 4 zonas). La app decía
  "aplicada ✓" en falso. Verificado: laser → rc0 + "Error: ... not supported".
- **Fix en `aura.py`:** `apply_state` marca fallo si el output trae
  `not supported`/`error:` aunque rc=0, da mensaje claro y recuerda el efecto en
  `unsupported_effects`. `_supported_effect_ids()` lee por D-Bus
  `xyz.ljones.Aura SupportedBasicModes` (= `au 5 0 1 2 3 10`) y mapea con el
  enum de asusctl (orden de subcomandos): **solo se ofrecen los soportados**
  (aquí: static, breathe, rainbow-cycle, rainbow-wave, pulse). breathe SÍ
  aplicaba siempre (lo de "no cambia" era la UI/efectos no soportados).
- UI (`app.js`/`index.html`/`style.css`): chip activo con relleno de acento;
  perfiles guardados ahora son una LISTA interactiva (color + etiqueta + ★inicio
  + APLICAR + 🗑 con confirmación). Quité los botones viejos y sus listeners.

#### 3. OVERLAY (v10) — nuevo
- Ventana Electron extra (`overlay.html`/`overlay.js`): frameless, transparent,
  alwaysOnTop('screen-saver'), visibleOnFullScreen, click-through, skipTaskbar,
  no-focusable. Temp/W CPU+GPU + RPM de los 3 ventiladores. `main.js`: IPC
  `list-displays`/`set-overlay`, posiciona por monitor+esquina, recibe el mismo
  stream `stats`. Botón `OVERLAY` + modal; preferencia en localStorage.
  **Falta clic real** para confirmar que flota sobre el juego en KDE/Wayland.
- Undervolt/overclock: **DESCARTADO** (decisión de Marshall). Roadmap v10 marcado.

### Pendiente para la siguiente sesión
1. Clic real: GUARDAR Y APLICAR de ventiladores (pkexec) y ver el cap limitando;
   overlay sobre un juego; lista de perfiles Aura (borrar/aplicar).
2. v9 grande sin tocar: AMD, historial SQLite, autodetección de plataforma,
   empaquetado, DB comunitaria de máximos de fan.
3. (Opcional) usar también `SupportedBasicZones`/brightness por D-Bus.

---

## Sesión previa: Claude (Opus 4.8) — 2026-06-10 (v8.1.0)

### Estado: arreglos de Aura + benchmarks + primer ítem de v9. Commiteado, SIN push.

Probado con `node --check` (main/preload/app.js), `py_compile` de los módulos
nuevos y pruebas en vivo de CLI/audio/GPU en esta máquina real (G614JV).

Hecho:
- **Modo música ARREGLADO (era el bug real).** `parec` devolvía 0 bytes aquí
  (probado en vivo) y el fallback `pw-cat` no pasaba `--target`, así que
  grababa el micrófono. Ahora `main.js` resuelve `<sink-por-defecto>.monitor`
  con `pactl get-default-sink` y usa `pw-record`/`pw-cat --record --raw
  --target` (verificado: PCM crudo sin header WAV, ~61 KB en 1.4 s con audio).
  `parec` queda de último recurso. Selección de binario con `spawnSync which`
  (antes el `for` con `spawn` siempre elegía el primero porque el error de
  spawn es asíncrono). Brillo en silencio = `low`, nunca `off`.
- **Aura efectos**: el backend YA aplicaba bien breathe/rainbow-*/static
  (probado `asusctl aura effect ... ` y `python -m rog_monitor.aura apply`
  con rc=0 y luz cambiando). Lo que estaba mal era la **UI**: reorganicé el
  bloque 08 (APLICAR como acción primaria `.aura-primary`; perfiles en
  sección propia con encabezado y filas separadas guardar / cargar).
- **Benchmark GPU local**: 1× vkcube se quedaba 7-50% (vsync). Ahora
  `benchmarks.py` lanza `GPU_LOAD_INSTANCES=4` vkcube en IMMEDIATE 1080p sin
  vsync (`vblank_mode=0`, `__GL_SYNC_TO_VBLANK=0`) → **99% medido**. Prefiere
  glmark2/vkmark si existen. Quité el mensaje que mandaba a "modo web VSBM".
- **GPU WEB eliminado** por completo (botones, IPC `gpu-web-benchmark`,
  `gpuWebBenchmark` del preload, `VSBM_URL`, helpers `resolveWebGpuBenchmark
  Command`/`hasFlatpakApp`/`collectLiveBenchmarkSample`/`summarizeLiveSamples`/
  `terminateSpawned`/`sleep`, var `lastBackendStats`).
- **v9 primer ítem: umbrales editables.** Nuevo `src/rog_monitor/settings.py`
  (`get`/`update --json`, valida y acota). Botón `ALERTAS` + modal en la app;
  IPC `get-settings`/`save-settings` (al guardar hace `startBackend()` para
  recargar AlertEngine). Verificado: el JSON stream refleja los nuevos
  `temp_colors` tras update.

### Pendiente / OJO para la siguiente sesión
1. **Falta prueba con clics reales en la app Electron** (no pude abrir GUI
   interactiva). Validar: APLICAR con breathe/rainbow desde los chips, MODO
   MÚSICA reaccionando a audio real, GUARDAR/CARGAR perfiles, y el modal
   ALERTAS guardando + reinicio del backend sin parpadeo molesto.
2. **v9 restante** (grande, no lo toqué): soporte AMD, historial persistente
   (SQLite en `~/.local/share/rog-monitor`), autodetección de plataforma,
   empaquetado (PyPI/Flatpak/AUR/COPR), DB comunitaria de máximos de fan.
3. **v10**: OJO — undervolt/overclock NO se debe hacer a ciegas (riesgo real
   al equipo de Marshall). Requiere su visto bueno, detección exacta del
   modelo, límites seguros y doble consentimiento. Lo dejé sin tocar a
   propósito. MangoHud/plasmoide/Prometheus sí son seguros pero grandes.
4. **v11 (open source / publicar): NO hacer.** Regla del dueño: no publicar
   nada aún y NUNCA `git push`. Solo dejé commit local.

## Última sesión: Claude (Fable 5) — 2026-06-10

### Estado: v7.1.0 lista y commiteada (sin push, como siempre)

Hecho en esta sesión (todo probado con `--once`, `--json` y `node --check`):
- Procesos: % del **CPU total** por defecto (`procs.py` también expone
  `cpu_core` estilo top por si se quiere un toggle en la UI).
- `procs.top_memory()` + clic en la barra de RAM → modal con top consumo
  de memoria y cierre de procesos.
- Historial 2×2 con eje de tiempo ("hace N min" → "ahora") en `drawChart`.
- Botón REPORTAR ERROR → `report-issue` IPC → abre GitHub issue con info
  del sistema precargada (deriva la URL del remote origin).
- SALUD DE DISCOS en Sistema → `disk-health` IPC → pkexec + smartctl -H -A,
  filtra líneas clave (result, percentage used, temperature, spare, wear).
- Editor de curvas ahora en **% del máximo** (convierte a PWM 0-255 al
  guardar); texto explicativo; cap individual editando la fila de cada fan.
- Tamaño de letra en modal TEMA (A−/Normal/A+/A++) con zoom persistido
  (`zoomLevel` en localStorage, aplicado al arrancar vía webFrame).
- Scrollbars finas con color de tema; sin barra fea del body.
- TUI: mouse tracking (ESC[?1000h) en `keys.py` — la rueda ya no descuadra;
  las secuencias escape se descartan en `get()`.

### Pendiente INMEDIATO (siguiente sesión — Codex puedes arrancar aquí)

1. **v8 RGB/Aura**: plan paso a paso en `docs/roadmap.md` sección v8.
   Empezar por verificar asusd vs rog-profile-sync (paso 1). No saltarse el
   orden. El hardware de prueba: G614JV con teclado RGB + periférico Redragon.
2. Benchmarks térmicos CPU/GPU (paso 6 del plan v8).
3. Umbrales de alertas editables desde la app (quedó en v9 pero es corto:
   editar config.json vía IPC y recargar AlertEngine).
4. Probar en vivo: el botón de salud de discos y el editor de curvas en %
   (solo se probaron por unidad, no con clics reales).

### Decisiones tomadas (no re-litigar sin Marshall)

- Open source es LO ÚLTIMO (v11). No publicar nada aún.
- Temas: paletas propias, no copiar las de otras apps.
- Throttling: solo log de eventos, nunca notificación de escritorio.
- Caps de ventiladores actuales: ~6800 RPM (PWM 248/251/231) en los tres,
  aplicados en el repo de scripts del sistema.

### Contexto del sistema de Marshall

- Bazzite (ostree), KDE Wayland, sin sudo sin clave (usar pkexec).
- Repo de scripts del sistema: `~/Rog-Monitor-Scripts` (servicios
  rog-profile-sync, rog-power-source, rog-power-notify ya activos).
- supergfxctl modos: Integrated / Hybrid / AsusMuxDgpu (este último = reinicio).
- Máximos reales de ventiladores aún sin medir con el benchmark de la app
  (estimados: CPU 7000 / GPU 6900 / MID 7500).

---

## Última sesión: Codex (GPT-5) — 2026-06-10

### Estado: v8.0.0 implementada en código, con dos pendientes de prueba viva

Hecho en esta sesión:
- **Paso 1 v8**: revisado el conflicto `asusd` vs `rog-profile-sync`.
  `~/Rog-Monitor-Scripts/scripts/enable-asusd.sh` ya NO deshabilita
  `rog-profile-sync.service`; deja `asusd` para Aura y conserva perfiles +
  curvas en nuestro stack.
- **Paso 2 v8**: nuevo backend `src/rog_monitor/aura.py`.
  Detecta `asusctl`, lista efectos disponibles desde la instalación local,
  expone brillo/effects/OpenRGB/PipeWire en el JSON stream y guarda perfiles
  en `~/.config/rog-monitor/aura.json`.
- **Paso 3 v8**: nuevo bloque **08 Iluminación** en la app Electron.
  Tiene efecto, color, color secundario, velocidad, dirección, brillo,
  perfiles guardados, borrar/cargar, y toggle para aplicar al abrir la app.
- **Paso 4 v8 (parcial)**: detección de **OpenRGB** y mensaje de instalación
  si falta. En este equipo NO está instalado, así que no se pudo probar ni
  terminar el control real del Redragon.
- **Paso 5 v8**: modo música implementado en Electron (`parec`/`pw-cat`).
  Captura audio del sistema y ajusta brillo/color de Aura en vivo.
- **Paso 6 v8 (parcial)**: benchmark térmico integrado.
  - CPU: implementado en `src/rog_monitor/benchmarks.py` con workers Python
    por `subprocess` (evité `multiprocessing` porque falló con Python 3.14 en
    sandbox/forkserver).
  - GPU: hook listo vía `glmark2`, con fallback claro si no está instalado.
  - UI: modal BENCHMARK + exportación JSON.

### Probado en esta sesión

- `python3 -m py_compile src/rog_monitor/aura.py src/rog_monitor/benchmarks.py src/rog_monitor/app.py`
- `node --check desktop/main.js`
- `node --check desktop/preload.js`
- `node --check desktop/renderer/app.js`
- `PYTHONPATH=src python3 -m rog_monitor --json`
- `XDG_CONFIG_HOME=/tmp/rog-aura-test PYTHONPATH=src python3 -m rog_monitor.aura state`
- `XDG_CONFIG_HOME=/tmp/rog-aura-test PYTHONPATH=src python3 -m rog_monitor.aura save-profile ...`
- `XDG_CONFIG_HOME=/tmp/rog-aura-test PYTHONPATH=src python3 -m rog_monitor.aura set-startup ...`
- `PYTHONPATH=src python3 -m rog_monitor.benchmarks cpu --seconds 2 --workers 1`
- `PYTHONPATH=src python3 -m rog_monitor.benchmarks gpu --seconds 2`
  devolvió el fallback esperado: falta `glmark2`.

### Ojo / pendiente inmediato

1. **Prueba viva de Aura en escritorio real**:
   desde el sandbox no pude validar `asusctl leds set` / `asusctl aura effect`
   contra `asusd` en el bus del sistema. El código está cableado, pero falta
   abrir la app en la sesión real de Marshall y confirmar:
   - que el bloque 08 aplica cambios;
   - que modo música responde;
   - que `asusd` no pisa `rog-profile-sync`.
2. **OpenRGB / Redragon**:
   instalar OpenRGB y decidir si seguir por CLI o por SDK 6742. Ahora mismo la
   app solo detecta ausencia y muestra la instrucción de instalación.
3. **Benchmark GPU real**:
   instalar `glmark2` o cambiar la carga a otra herramienta disponible.
4. **Actualizar `docs/roadmap.md`**:
   el texto todavía menciona brillo con `asusctl -k`; en esta máquina real el
   comando válido es `asusctl leds set <off|low|med|high>`.

### Seguimiento corto (misma sesión, ajustes tras prueba manual)

- El problema real de iluminación no era solo UI: `asusctl` estaba instalado
  pero **no existía `asusd.service`** en el sistema. Se añadió detección de
  setup en la app y botón `ACTIVAR AURA` que llama
  `~/Rog-Monitor-Scripts/scripts/enable-asusd.sh --yes` por `pkexec`.
- En esta misma máquina quedó **reparado y arrancado**:
  - `asusd` ahora se instala desde el payload Homebrew hacia `/usr/local/bin`
    y `/usr/local/share`, no desde `/home/linuxbrew/...` ni `/opt/...`.
  - Se verificó con `systemctl status asusd.service`: quedó `active (running)`.
  - Se verificó con `asusctl leds get` y `asusctl aura effect static --colour ff5500`.
- El selector nativo de efectos se reemplazó en práctica por un grid de chips
  visibles porque en la prueba manual no estaba mostrando opciones de forma
  usable en Electron/KDE.
- Benchmark GPU ya no depende solo de `glmark2`: ahora cae a `vkcube` y luego
  a `glxgears`. En este entorno devolvió `tool: vkcube`.
