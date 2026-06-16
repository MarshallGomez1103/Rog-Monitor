# Changelog

## 10.0.0 — 2026-06-15

> Build multiagente v2: Opus 4.8 orquestó **6 instancias Sonnet en paralelo**
> (cada una en su git worktree). La cuenta volvió a cortar a los 6 a mitad
> (límite de sesión); su trabajo se rescató con commits de respaldo y **2
> agentes finalizadores** (A5-bis Roadmap, A6-bis cableado de poder) lo
> completaron. El orquestador fusionó las 6 ramas, resolvió el conflicto y
> verificó el backend en vivo en el G614JV.

### Added
- **Multi-idioma (8 idiomas)**: es/en/fr/it/pt/zh/ja/ko. Motor `i18n.js`
  (`window.t` / `data-i18n`), botón selector «A文» en la barra, modal de idioma
  y paso de idioma como primer paso del asistente.
- **Tablero arrastrable** tipo sticky-notes: reordenar bloques, activar/desactivar
  widgets, renumeración dinámica sin huecos, layout persistente.
- **Roadmap** (botón `ROADMAP`): línea de tiempo «hecho» (por fechas) y «por hacer».
- **Offsets de reloj GPU por NVML en Wayland** (sin X11): núcleo y memoria, con
  rangos seguros y doble consentimiento; escritura por `pkexec`.
- **Guardián térmico real**: mantiene la GPU bajo el techo elegido subiendo los
  ventiladores primero y, si hace falta, recortando potencia (falla-seguro).

### Changed
- **Neón puro** en los 12 temas: glow fuerte en modo oscuro y «neón de día» en
  modo claro (antes el claro se veía plano).
- **Barra superior** rediseñada: píldora de estado (lámpara + CONECTADO/BATERÍA)
  premium con borde de neón del tema.
- **Benchmarks** rehechos: tarjetas neón con fecha/hora, clickables para ver el
  detalle (antes solo texto plano). **Eventos** clickables con explicación.

### Fixed
- **Aura**: descubrimiento de argumentos por efecto del `asusctl` instalado.
  Arregla el strobing («unrecognised argument speed» → ya no manda `--speed`) y
  quita el color secundario inútil de la respiración (el teclado lo ignora).
  Eliminada la sección «Más efectos» confusa; la cuadrícula de 9 modos es el
  único selector.

### Pendiente (requiere a Marshall)
- Pasos con contraseña en `docs/SUDO-PENDIENTE-v10.md` (instalar el servicio del
  guardián térmico; el SET de offsets ya corre por `pkexec` en runtime).
- Repaso visual / CDP click-through de las superficies nuevas.
- Long-tail de i18n: strings dinámicos de `app.js` y `roadmap.*` en los 6 idiomas
  no-core (A1 dejó el core completo en los 8).

## 9.0.0 — 2026-06-13

> Construido por **6 instancias Sonnet en paralelo** (cada una en su propio
> git worktree) orquestadas por Claude Opus 4.8. La síntesis final fusionó las
> seis ramas y completó el cableado del asistente. Algunas instancias fueron
> cortadas por el límite de sesión de la cuenta a mitad del reporte; su trabajo
> en disco se rescató, se commiteó y se integró.

### Added
- **Centro de Poder** (botón `PODER`): control de límites de potencia y clocks
  CPU/GPU al estilo Armoury Crate (pestañas CPU/GPU), **calibrado para la ASUS
  ROG Strix G16 (G614JV)**. Controles: CPU **PL1** (28–140 W), CPU **PL2**
  (28–175 W), GPU **Dynamic Boost** (5–25 W), GPU **Thermal Target** (75–87 °C)
  vía `asus-armoury` (firmware); GPU **Base/Memory Clock Offset** se muestran
  pero quedan **bloqueados en Wayland** (requieren X11/Coolbits) — nunca se
  fingen. **Seguridad:** cada escritura se recorta dos veces al mín/máx del
  firmware (Python + script con permisos), parte de los valores de fábrica,
  exige diálogo de consentimiento y tiene **RESET A FÁBRICA**. Nada se escribe
  al hardware sin un clic explícito.
- **Base de datos de dispositivos** (`device_profiles.json`) + lectura de rangos
  en vivo desde sysfs → funciona en cualquier portátil con `asus-armoury`; con
  override de usuario en `~/.config/rog-monitor/device.json`. Lista de
  dispositivos soportados para la publicación pública (ver
  `docs/supported-devices.md`).
- **Cuatro temas nuevos** (12 en total): **Neon Nights** (synthwave Miami),
  **Cyberpunk** (Night City), **Aurora** (boreal teal→violeta) y **Alba** (tema
  CLARO premium). Todos los modos claros rehechos para verse imponentes.
- **Cuadrícula de 9 modos de iluminación** estilo Aura Sync: los 5 que soporta
  el teclado interno (Static, Breathing, Color Cycle, Rainbow, Strobing/Pulse) +
  Música funcionan; el resto (Starry Night, Smart, Adaptive) se muestran pero
  honestamente marcados como no soportados — **cero comandos adivinados** al
  hardware (regla anti-brickeo, ver `docs/redragon-protocol.md`).
- **Asistente de primera vez** (wizard de 5 pasos, repetible con `VER TUTORIAL`):
  bienvenida → ventiladores detectados → permisos/calibración → benchmarks →
  tour de bloques.
- **Cuatro estados por widget** (con datos / cargando / sin datos / error):
  skeleton al cargar, placeholder "sin datos" (p. ej. dGPU apagada), chip de
  error si el backend se cae, y un ventilador detenido se muestra **PARADO**
  explícito en vez de en blanco.
- **Paridad TUI**: línea de solo-lectura con PL1/PL2/Boost/Térmico actuales.

### Changed
- `power_control` viaja en el stream `--json` (lo consumen la app y la TUI).
- Modo claro de las 8 paletas existentes rehecho (paneles tintados, contraste
  real, sin blancos planos).

### Notas de seguridad
- Se **revierte** la decisión "undervolt/overclock DESCARTADO" (10 jun) ahora
  que se cumplen sus tres condiciones: modelo exacto, límites seguros (los
  mín/máx del firmware, verificados contra las capturas de Armoury Crate y
  `asus-armoury` en vivo) y doble consentimiento. Decisión del dueño, 12 jun.

## 8.4.0 — 2026-06-12

### Added
- **Hover en las 4 gráficas del historial**: al pasar el cursor aparece un
  crosshair punteado con el punto marcado y un tooltip con el valor exacto y
  hace cuántos segundos fue ("70.1 °C · hace 9 s").
- **Dos temas nuevos**: Neón (cian y magenta de arcade) y Atardecer (oro y
  rosa sobre púrpura). Ya son 8 paletas × claro/oscuro.
- **Redragon K734WCG-RGB-PRO detectado** (cable 258a:010c y dongle 3554:fa09)
  por lectura de sysfs; aparece en el bloque Iluminación. El control real está
  bloqueado a propósito hasta tener capturas USB del software oficial — los
  teclados Sinowealth/BY Tech se han brickeado con comandos adivinados (por eso
  OpenRGB deshabilitó su controlador). Protocolo documentado en
  `docs/redragon-protocol.md` con guía de captura para Windows.

### Changed
- **Identidad visual propia** (que no parezca "hecha por IA"): esquinas
  cortadas en diagonal con franja de acento, números de bloque en placas
  inclinadas, fondo con brillo del acento + rayado diagonal sutil, línea de
  acento bajo la barra superior, botones angulares y glow en la temperatura
  grande. Sin tarjetas redondeadas genéricas.
- **Bloques renumerados en orden visual**: izquierda 01 CPU → 04 Iluminación,
  derecha 05 Historial → 09 Procesos (antes: 1,2,3,8 / 4,9,5,6,7).
- **Sin hueco abajo a la izquierda**: las columnas ahora miden lo mismo y el
  último bloque de cada una crece para rellenar.
- **Modo claro con identidad real**: paneles y fondos tintados por paleta
  (antes todas eran "panel blanco + pastel" y apenas se diferenciaban).
- Las gráficas de consumo (W) arrancan en 0: una bajada de 10→3 W ya no llena
  toda la altura como si fuera un desplome.

### Fixed
- **Consumo GPU "plano en 10 que se desploma"**: nvidia-smi `power.draw` es la
  muestra instantánea y cae a ~1-3 W cuando la GPU duerme un instante. Ahora se
  usa `power.draw.average` si el driver lo soporta (se detecta una vez con
  `--help-query-gpu`, sin despertar la GPU).
- **"RTX 4060" ya no está hardcodeada**: los tooltips de iGPU/HYBRID/dGPU y la
  confirmación del modo MUX usan el nombre real detectado por nvidia-smi (se
  recuerda para mostrarlo incluso con la dGPU apagada). En otro portátil dirá
  el modelo de esa máquina.

## 8.3.0 — 2026-06-10

### Fixed
- **El cap ya no se "hornea" en la curva.** APLICAR CAP hacía `min(curva, cap)`
  sobre los puntos y eso quedaba guardado: bajar el cap recortaba la curva para
  siempre y subirlo no la liberaba (un `min()` nunca sube valores). Por eso con
  cap 6500 el ventilador se quedaba en ~85% y la CPU llegaba a 96 °C con miles
  de eventos de throttling. Ahora la curva se guarda **prístina** y el servicio
  root aplica el cap al escribirla al hardware: subirlo o quitarlo (botón
  QUITAR CAP) libera los ventiladores al instante.
- **El cap cae EN el cap, no 200-400 RPM arriba.** PWM→RPM no es lineal, así
  que la regla de tres se pasaba. Nuevo `calibrate-fans.sh`: mide las RPM
  reales de cada ventilador en 7 escalones de PWM (~70 s) y el cap se traduce
  interpolando esa tabla (con margen del 1.5% para quedar en o bajo el tope).
- **Aura: elegir Rainbow/Breathe/Colorcycle ya no selecciona Static.** Dos
  causas reales, verificadas con clics automatizados (CDP) en la app corriendo:
  (1) los chips vivían dentro de un `<label>` sin `for`, y el control asociado
  de un label es su primer elemento *labelable* — ¡los `<button>` lo son! — así
  que cada clic se reenviaba como clic sintético al primer chip (Static), que
  pisaba la selección; ahora es un `<div>`. (2) el bloque se reconstruía con
  cada tick del stream (1/s) y los chips morían entre mousedown y mouseup;
  ahora solo se reconstruye cuando cambia algo real (firma del estado) y el
  efecto elegido vive en una variable, no en un `<select>` oculto.
  Probado contra el hardware: rainbow-wave→LedMode 3, rainbow-cycle→2,
  breathe→1 ✓.
- **Los modales de ALERTAS y OVERLAY aparecían abajo del todo** (en el flujo
  del documento, debajo de la barra de estado) porque no tenían CSS de modal.
  Ahora los seis modales comparten la clase `.modal` (position fixed, centrado).
- **El botón de perfil responde al primer clic.** Resaltado optimista
  inmediato + el backend confirma leyendo `ActiveProfile` de vuelta.

### Added
- **Los "máximos medidos" ahora son medidos de verdad.** Antes salían de
  constantes en localStorage (7000/6900/7500) aunque dijera "medidos". La
  calibración los guarda en `fan-curves.json` (compartidos por servicio,
  backend y UI), el modal dice claramente "ESTIMADOS (sin medir)" hasta que
  calibres, y hay banner de primera vez. Soporta 1-N ventiladores: todo se
  enumera del hwmon (`calibrate-fans.sh`, servicio root, editor de curvas).
- **El benchmark verifica el cap.** El resumen incluye `Tope RPM: CPU max/cap …
  → respetado ✓ / EXCEDIDO ✗` comparando las RPM máximas medidas contra el
  cap activo (tolerancia ±75 RPM de jitter).
- **Overlay: temperatura promedio (AVG) y FPS.** La CPU muestra el promedio de
  núcleos con etiqueta AVG (el package siempre va unos grados arriba y asusta).
  FPS reales vía registro de MangoHud (opt-in en el modal OVERLAY: configura
  `output_folder`/`autostart_log` y el backend lee el CSV más fresco; la fila
  FPS solo aparece cuando hay dato).

### Fixed (segunda tanda, mismo día)
- **El cap se violaba jugando (GPU a ~6800 con tope 6500).** Dos causas:
  la calibración medía con sleep fijo y estos ventiladores aceleran/desaceleran
  más lento que eso (la GPU "estabilizaba" en falso), y nada protegía las
  curvas si el firmware/asusd las reseteaba al cambiar de perfil. Ahora la
  calibración espera estabilización real (dos lecturas seguidas con delta
  < 75 RPM, hasta 24 s por escalón) y el servicio verifica cada ≤30 s que el
  hardware tenga la curva esperada (punto 8) y la reaplica si alguien la pisó.
  Verificado con benchmark de 90 s al 100% de CPU: máximas 6400/5100/6300 RPM
  con cap 6500 → **cap respetado** ✓.
- **Modo música: capturaba el MICRÓFONO, no la música.** `pw-record --target
  "<sink>.monitor"` no matchea ningún nodo PipeWire (ese nombre solo existe en
  la capa Pulse) y caía en silencio a la fuente por defecto = micro — por eso
  reaccionaba a la voz. Verificado con `pw-link -l`: la captura colgaba de
  `alsa_input`. Ahora: `pw-record -P '{ stream.capture.sink = true }' --target
  <sink>` (verificado: cuelga de `monitor_FL/FR`). Además el brillo del pulso
  va por D-Bus directo (~20 ms) en vez de spawnear asusctl (~1 s): la música
  ahora sí se siente.

### Added (segunda tanda)
- **Modales arrastrables** (benchmark, ventiladores, alertas, overlay): agarra
  el título y muévelo para ver los sensores mientras corre un benchmark.
- **Overlay personalizable:** casillas para elegir qué ver (CPU, GPU,
  ventiladores, FPS) y explicación de MangoHud para quien no lo conozca.
- **ALERTAS más intuitivo:** iconos y borde de color por tipo de campo
  (🌡 temperatura, ⚡ potencia, 🌀 ventilador, ⏱ tiempos) y puntos de color
  verde/amarillo/naranja/rojo junto a cada umbral de color.
- **EXPORTAR/IMPORTAR CONFIG** (en el modal de ventiladores): toda la
  configuración (curvas, cap, calibración, perfiles Aura, umbrales) en un solo
  JSON para respaldar o llevar a otro equipo; al importar se respalda lo
  actual como `.pre-import`.
- **Eventos:** nota fija explicando qué es el thermal throttling y qué hacer
  cuando hay muchos eventos.

### Changed
- `rog-profile-sync.sh --defaults <perfil>` imprime las curvas por defecto en
  JSON; la app las lee de ahí (antes parseaba el script con regex).
- `test-max-fans.sh` queda archivado; lo reemplaza `calibrate-fans.sh`.

## 8.2.0 — 2026-06-10

### Fixed
- **El TOPE (cap) de RPM ahora SÍ limita y persiste entre reinicios.** La causa
  raíz: el servicio root corría `/usr/local/sbin/rog-profile-sync` (copia con
  los topes en `255 255` = RPM máximas), mientras la app editaba la copia del
  repo, así que ningún cambio llegaba al hardware. Ahora las curvas viven en un
  JSON del usuario (`~/.config/rog-monitor/fan-curves.json`) que el servicio lee
  en cada cambio de perfil; el cap queda guardado ahí y sobrevive reinicios. Al
  GUARDAR Y APLICAR la app reinstala el script (un solo `pkexec`) y reaplica.
- **El % de cada ventilador es relativo al cap.** Si pones el tope en 6000 RPM
  y el ventilador llega a 6000, marca 100% (por encima se mantiene en 100, ya no
  se pasa). Antes el denominador era el máximo medido y siempre daba ~99%.
- **Cambiar de perfil sí baja las RPM.** Las curvas por defecto de `balanced`
  (~80% del tope) y `quiet` (~67%) ahora se diferencian de verdad de
  `performance`; antes los tres tenían el mismo tope alto y a temperaturas altas
  giraban casi igual.
- **Aura: efectos que el teclado no soporta.** `asusctl` devolvía código 0
  aunque el firmware rechazara el efecto (p. ej. `laser` en el G614JV), así que
  la app decía "aplicada ✓" en falso. Ahora detecta el error real, lo reporta y
  recuerda el efecto como no soportado. Además se leen por D-Bus los
  `SupportedBasicModes` de asusd y **solo se ofrecen los efectos que el teclado
  acepta de verdad** (en este equipo: static, breathe, rainbow-cycle,
  rainbow-wave y pulse; `stars`/`laser`/etc. dejaron de aparecer).

### Changed
- **Perfiles de Aura más interactivos.** Se reemplazó el `<select>` + botón
  BORRAR por una lista: cada perfil es una fila con su color, etiqueta de efecto,
  estrella si es el de inicio, botón APLICAR y un botón de borrar (🗑) con
  confirmación. Clic en la fila lo carga en el formulario.
- El chip del efecto seleccionado ahora se resalta claramente (relleno con el
  color de acento), para que se note cuál está activo.

### Added (v10 — overlay)
- **Overlay para juegos.** Ventana sin marco, transparente y siempre encima
  (sobre pantalla completa), click-through para no robar el foco del juego.
  Muestra temperatura/vatios de CPU y GPU y las RPM de los tres ventiladores.
  Botón `OVERLAY` en la barra superior: elige monitor y esquina, y enciéndelo o
  apágalo. La preferencia se recuerda. **Se quitó undervolt/overclock del plan**
  (riesgo real al equipo) — el overlay es read-only.

## 8.1.0 — 2026-06-10

### Fixed
- **Modo música ahora sí funciona.** Capturaba con `parec` (devolvía 0 bytes
  en este PipeWire) y, en el fallback, `pw-cat` grababa el micrófono por no
  pasar `--target`. Ahora resuelve el monitor del sink por defecto
  (`<sink>.monitor`) y prefiere `pw-record`/`pw-cat --record --raw --target`,
  con `parec` solo como último recurso. Además el brillo nunca baja a `off`
  en silencio (piso en `low`) para que no parezca apagado.
- **Benchmark GPU local más exigente.** Una sola instancia de `vkcube` se
  quedaba ~7-50% (vsync + geometría trivial). Ahora lanza 4 instancias en
  modo IMMEDIATE a 1080p sin vsync y satura la dGPU al ~99%
  (sigue prefiriendo `glmark2`/`vkmark` si están instalados).

### Removed
- **Benchmark "GPU WEB" (VSBM).** Mandaba a un navegador externo; se eliminó
  por completo (UI, IPC, preload y código de lanzamiento). El benchmark de
  GPU es 100% local.

### Changed
- Bloque `08 Iluminación` reorganizado: `APLICAR` pasa a ser la acción
  principal y los perfiles quedan en una sección propia, con encabezado y
  filas separadas para guardar vs. cargar/borrar.

### Added (v9 — primer ítem)
- **Umbrales y colores editables desde la app.** Nuevo botón `ALERTAS` con un
  modal para ajustar temperaturas/potencia de alerta, cooldown, throttle
  mínimo, notificaciones y los colores de temperatura. Backend nuevo en
  `src/rog_monitor/settings.py` (valida y acota rangos); al guardar reinicia
  el backend para que `AlertEngine` tome los valores al instante.

## 8.0.0 — 2026-06-10

### Added
- **Aura / RGB control** in the desktop app: new `08 Iluminación` block with
  ASUS Aura effect, colour, speed, direction and brightness controls.
- Aura setup assistance in the app: if `asusd` is missing/stopped, the UI now
  exposes an action to configure/start it with the existing system script.
- Saved Aura profiles in `~/.config/rog-monitor/aura.json`, including an
  option to re-apply one automatically when the app starts.
- Aura backend layer in `src/rog_monitor/aura.py`: detects `asusctl`,
  enumerates supported effects from the local install, reports OpenRGB and
  PipeWire availability, and centralises Aura profile persistence.
- Music mode: captures system audio (`parec` / `pw-cat`) and maps amplitude
  to Aura brightness/colour in real time.
- Thermal benchmark modal: CPU synthetic load benchmark (no dependencies),
  GPU benchmark hook via `glmark2` with fallback to `vkcube` / `glxgears`,
  and JSON export.

### Changed
- `Rog-Monitor-Scripts/scripts/enable-asusd.sh` now enables `asusd` for Aura
  without disabling `rog-profile-sync.service`; profiles and fan curves stay
  under ROG Monitor control.
- The app JSON stream now includes Aura capability/state metadata so the
  desktop UI can degrade gracefully when ASUS/OpenRGB tooling is missing.

### Notes
- OpenRGB is detected and explained when absent, but this environment still
  lacks the binary/SDK, so Redragon live control remains pending installation.
- GPU benchmark support is wired, but requires `glmark2` to be present.

## 7.1.0 — 2026-06-10

### Added
- Process CPU% is now over the TOTAL CPU by default (per-core figure kept as
  `cpu_core` in the JSON API).
- Click the RAM bar: modal with the top memory consumers (click to close one).
- Disk health button (SMART via pkexec + smartctl) in the System block.
- REPORT ERROR button: opens a pre-filled GitHub issue on the repo.
- Time axis on every chart ("hace N min" / "ahora"); history reorganized 2x2:
  CPU temp|watts on top, GPU temp|watts below.
- Font-size options (A-/Normal/A+/A++) in the TEMA modal; zoom persists.
- Fan curves edited in % of each fan's maximum instead of raw PWM, with
  per-fan individual adjustment and clearer explanations.
- AGENTS.md + docs/HANDOFF.md: shared memory so any agent (Claude/Codex/...)
  can continue the work with full context.

### Fixed
- TUI no longer breaks when scrolling the mouse wheel (mouse tracking claimed,
  escape sequences discarded).
- Thin themed scrollbars; the ugly default body scrollbar is gone.

## 7.0.0 — 2026-06-10 · "Centro de Control"

### Added
- **Fan control center**: click the Fans panel to open it. Per-profile RPM
  cap (recalculates the hot end of the curves), full 8-point curve editor
  for the three fans, and a 60-second max-RPM benchmark (runs the fans at
  100% via pkexec and measures the real maximums). Dangerous curves (fans
  under 60% at the hottest points) require explicit consent. Changes are
  written to `Rog-Monitor-Scripts/scripts/rog-profile-sync.sh` (with a
  `.bak` backup) and applied by restarting the root service via pkexec.
- Live clocks: GPU core and VRAM frequency in MHz (NVIDIA and AMD), in the
  app and the TUI.
- GPU power history chart (app and TUI).
- Six original theme palettes replacing the previous set: Magma, Nébula,
  Océano, Glaciar, Reactor, Grafito — each with light and dark variants.

### Fixed
- The app now shows up in the taskbar as "ROG Monitor" with its icon instead
  of a generic "Electron" window (app name, desktopName, --class flag and
  StartupWMClass in the desktop entry).

### Changed
- Roadmap restructured: v7 = Control Center (done), v8 = universal laptop
  support, v9 = power-user tools, v10 = open-source release (last, on
  Marshall's go-ahead).

## 6.2.0 — 2026-06-10

### Added
- **Theme system in the desktop app**: 6 palettes (Ember, Midnight, Nous,
  Mono, Cyber, Slate) × light/dark/system mode, with a visual picker
  (TEMA button). Saved automatically.
- Click a process to terminate it (SIGTERM) with a confirmation dialog.
- Export the event log to a `.txt` file (EXPORTAR button, save dialog).
- Working zoom: Ctrl+wheel and Ctrl +/-/0; the layout is responsive and
  reflows instead of breaking.
- Missing-sensor guidance: when CPU power is not readable the app explains
  the exact command and what it does, instead of just saying "root".

### Changed
- Semantic temperature colors everywhere (app and TUI): blue = cold,
  green = normal, orange = near your limits, red = critical.
- Bigger, clearer typography; system sans for labels, monospace for numbers.
- Thermal-throttling alerts go to the event log only — no more desktop
  notifications for them (the CPU protecting itself is not an emergency).
- Fan curves capped at ~6800 RPM in the system scripts
  (`Rog-Monitor-Scripts/scripts/rog-profile-sync.sh`) to reduce bearing wear.

## 6.1.0 — 2026-06-10

### Added
- Power-source indicator (⚡ plugged in / 🔋 on battery) in the desktop app
  top bar and in the TUI battery line.
- dGPU (AsusMuxDgpu / MUX) button in the desktop app with confirmation dialog
  — the RTX drives everything, more FPS, more battery use, requires a reboot.
- Process table headers with explanations (% CPU where 100 = 1 core; RAM is
  resident memory), in both the app and the TUI.
- `alerts.throttle_min_ms` config (default 100 ms).

### Changed
- Thermal-throttling notifications are explicit (how many times, for how many
  ms, at what package temperature) and only fire when real throttle time
  accumulates — micro-blips of a few ms, normal on 13th-gen HX CPUs, no longer
  spam notifications.
- Desktop notifications auto-dismiss after 5 seconds (normal urgency — KDE
  pins critical ones forever).
- CPU/GPU watts are no longer painted red by default; red now only means
  abnormal power. The CPU W chart is amber instead of alarm-red.
- Chart min/max axis labels snap to steps of 5 so they stop jittering.

### Fixed
- Ctrl+mouse-wheel no longer zooms/breaks the desktop app layout (zoom locked).

## 6.0.0 — 2026-06-10

### Added
- **Electron desktop app** (`desktop/`): instrument-panel design, animated
  fans at real RPM, canvas history charts, power-profile and GPU-mode buttons,
  one-click repo updater, auto-recovering Python backend over `--json-stream`.
- `monitor --desktop` flag and "ROG Monitor" application-menu entry
  (`scripts/install-desktop.sh`).
- `--json` / `--json-stream` machine-readable output (NDJSON API).
- Top-processes panel (instantaneous CPU% from /proc deltas).
- All real disks shown (one per device, ostree-aware mount dedup).
- Full event log view (`v` key) and key bar pinned under the title with
  theme-colored keys.
- User-customizable temperature color limits (`temp_colors` in config).
- GPU mode panel now shows supported modes and pending changes
  ("Hybrid → Integrated, log out to apply"); pressing `g` during a pending
  change cancels it.
- MIT LICENSE file; proposed v8/v9 roadmap.

### Fixed
- GPU toggle no longer requests the mode you are already in after a transient
  supergfxctl read failure (failures are no longer cached).
- GPU mode changes run in a worker thread — the UI no longer freezes (and
  could previously appear to hang) while supergfxd is mid-transition.
- Child processes (supergfxctl, busctl, notify-send) no longer inherit the
  terminal stdin, which could swallow keystrokes (the "t crashed it" bug).
- Crash-proof render loop: unexpected errors are logged to
  `~/.local/share/rog-monitor/error.log` and shown as a flash message instead
  of killing the app.
- VRAM display no longer crashes on `[N/A]` values during GPU transitions.

## 5.0.0 — 2026-06-10

Complete rewrite: single script → modular Python package (`src/rog_monitor/`).

### Added
- Flicker-free dashboard (Rich `Live` with alternate screen).
- CPU package power via Intel RAPL with rolling history and graceful fallback
  (`scripts/enable-cpu-power.sh` grants non-root read access).
- Thermal throttling detection (package throttle counter + events).
- 1m / 5m / 15m temperature and power averages.
- Multi-row history graphs (CPU °C, GPU °C, CPU W) with axis labels.
- Alert system with configurable thresholds, desktop notifications and event log
  (CPU/GPU temp, throttling, stopped fans, abnormal power).
- GPU mode detection (Hybrid / Integrated / Dedicated via supergfxctl) and AMD
  GPU support; dGPU power-off handled with backoff instead of stalls.
- Interactive keys: cycle power profile, toggle iGPU/dGPU, themes, JSON/CSV
  export, help.
- System panel: RAM, disk + NVMe temp, network rate, load, uptime, battery with
  charge limit.
- Persistent config (`~/.config/rog-monitor/config.json`), auto-calibrating fan
  maximums, Spanish/English UI.
- Sensor layer reads sysfs directly (no `sensors` subprocess, no error spam),
  with generic hwmon discovery for non-ROG hardware.
- EPP / P-state display that explains the `powersave` governor confusion.
- `--once`, `--interval`, `--no-gpu`, `--theme`, `--lang`, `--version` flags.
- Installer (`scripts/install.sh`) creating the `monitor` command.

### Changed
- Old v2 script preserved as `src/legacy/rog_monitor_v2.py`.

## 2.x — 2026-06-08

- Bash → Python migration, Rich output, thermal history sparklines.
