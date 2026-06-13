# HANDOFF — memoria compartida entre agentes

> Cada agente actualiza esta sección al terminar. El siguiente la lee primero.

## Última sesión: Claude (Opus 4.8, orquestador) — 2026-06-13 (v9.0.0)

### Estado: v9.0.0 — Centro de Poder + 12 temas + rejilla Aura + wizard + 4 estados. Commit local, SIN push.

**Workflow multiagente (lo pidió Marshall):** Opus orquestó, **6 instancias
Sonnet en paralelo** programaron, cada una en su propio git worktree. Yo escribí
el spec/contrato (`docs/build-spec-v9.md`), repartí por dueño-de-archivo +
anclas + contratos (IPC, `onStats` multi-suscriptor, CSS por feature), fusioné
las 6 ramas y sinteticé. Reparto: A1 backend poder, A2 UI poder+IPC, A3 temas,
A4 iluminación, A5 wizard+estados, A6 docs.

**OJO — límite de sesión de la cuenta:** a mitad del run, 4 instancias (A1, A4,
A5, A6) fueron cortadas por el límite de la cuenta (reset 2am Bogotá) y su
*reporte* final se perdió, pero su **trabajo en disco quedó intacto** (sin
commit). Lo rescaté con `git -C <worktree> add -A && commit` y lo fusioné. A2 y
A3 sí alcanzaron a commitear solas. Por eso las ramas worktree nacieron de
737d6fc (pre-spec) — el merge preserva `build-spec-v9.md` igual.

#### Hecho y verificado
- **Backend poder (A1)**: `power_control.py` + `device_profiles.json` +
  `scripts/apply-power-control.sh`. Lee mín/máx EN VIVO de
  `/sys/class/firmware-attributes/asus-armoury/attributes/` (PL1 28-140, PL2
  28-175, boost 5-25, temp 75-87 — calzan con las capturas). Allowlist de 4
  attrs, doble recorte (python + script), `ROG_FW_ATTRS_DIR` para test con
  sysfs falso. **Verificado**: `power_control state` y el stream `--json` traen
  `power_control` correcto (device G614JV, 4 writable, los 2 offsets NVIDIA
  `writable:false` por Wayland). Línea read-only en `ui.py` (paridad TUI).
- **UI poder (A2)**: botón `PODER` → `#power-modal` (tabs CPU/GPU, sliders
  topados, marca de fábrica, consentimiento, RESET). IPC `get/set/reset-power-
  control` en main.js (set = pkexec al script + relee `state`), preload listo.
- **Temas (A3)**: 12 paletas (8 rehechas + Neon Nights/Cyberpunk/Aurora/Alba),
  modos claros con contraste real (AA verificado por el agente).
- **Iluminación (A4)**: `aura.py` devuelve lista de 9 modos con `supported`/
  `reason`; rejilla honesta (5 HW + Música funcionan, resto inertes con motivo).
- **Wizard + 4 estados (A5)**: `wizard.js` (5 pasos, repetible) + `widget-
  states.js` (suscriptor propio de onStats/onBackendDown, `data-state` por
  bloque). **El orquestador completó el cableado** que A5 no alcanzó: agregó el
  shell `#wizard-modal` (clases que esperan wizard.js y onboarding.css) y los
  `<script>` de wizard.js/widget-states.js.
- **Docs (A6)**: README + roadmap actualizados (la sesión los rescató). El
  orquestador escribió CHANGELOG 9.0.0, este HANDOFF, y `supported-devices.md` /
  `CONTRIBUTING.md` / `.github/` (templates + ci.yml).
- **Verificación**: `py_compile` todo OK; `node --check` los 6 JS OK; HTML
  parsea; los 8 assets referenciados existen; todos los `getElementById` de
  power.js/widget-states.js resuelven contra ids reales del HTML; stream `--json`
  end-to-end OK. **NO se hizo click-through CDP completo** (límite de cuenta) —
  recomendado un repaso visual o una pasada CDP la próxima sesión.

### Pendiente para la siguiente sesión
1. **Marshall**: el GUARDAR Y APLICAR pendiente (script de ventiladores
   blindado); el **primer APLICAR real** del Centro de Poder cuando quiera
   probarlo en vivo; la **captura USB del Redragon** (docs/redragon-protocol.md).
2. **CDP click-through** de las superficies nuevas (modal poder ambas pestañas,
   12 temas claro+oscuro, rejilla de luces, wizard, 4 estados).
3. **Offsets GPU base/mem**: hoy bloqueados en Wayland; explorar ruta NVML/X11.
4. v9 grande aún sin tocar: AMD, historial SQLite, empaquetado, DB comunitaria.

## Última sesión: Claude (Fable 5) — 2026-06-12 (v8.4.0)

### Estado: rediseño visual + hover en gráficas + GPU power estable + Redragon detectado. Commit local, SIN push.

Pedidos de Marshall (audio 3): acabar roadmap, Redragon propio, UI que no
parezca de IA, numeración desordenada (1,2,3 → 4 → "9"), hueco abajo a la
izquierda, hover con valor+hace-cuánto en las 4 gráficas, consumo GPU raro,
¿RTX 4060 hardcodeada?, 2 temas nuevos, modo claro muy tenue.

**Verificado con la app real por CDP** (cliente reescrito en /tmp/cdp.py, el
de la otra vez se borró con /tmp; OJO: lanzar la app con el run_in_background
del harness — un `nohup &` en Bash muere con SIGTERM al cerrar el comando).
Marshall estuvo jugando con la app EN VIVO durante la sesión (cambió temas
mientras yo media — buena señal 😄).

#### 1. UI v8.4 (todo verificado con screenshots por CDP)
- **Renumeración**: izquierda 01 CPU, 02 GPU, 03 Ventiladores, 04 Iluminación;
  derecha 05 Historial, 06 Benchmarks, 07 Sistema, 08 Eventos, 09 Procesos.
- **Hueco inferior izquierdo**: quité `align-items:start` del grid de main y
  `.col > :last-child { flex: 1 0 auto }` — ambas columnas terminan parejas
  (verificado: mismos bottom px).
- **Identidad visual** (regla de oro 7): esquinas superiores derechas cortadas
  con clip-path + franja de acento diagonal (.block::before), números en
  placas skewX(-12°), fondo con radial del acento + rayado diagonal 2.5%,
  border-image de acento bajo el topbar, botones con corte inferior derecho,
  glow en .bignum. Electron 33 = Chromium 130: color-mix OK.
- **Temas**: +Neón (cian/magenta) y +Atardecer (oro/rosa) = 8 paletas. Modo
  claro REHECHO: paneles tintados por paleta (antes panel #fff en todas y no
  se diferenciaban). El array THEMES de app.js lleva los swatches del picker.
- **Hover en las 4 gráficas**: chartState (Map por canvas) guarda data/escala;
  crosshair punteado + punto; tooltip #chart-tip fijo ("70.1 °C · hace 9 s").
  1 muestra/s ⇒ antigüedad = distancia al final. wireChartHover() por canvas.

#### 2. Backend
- **Consumo GPU raro (plano en 10 y desplomes)**: era real — `power.draw` de
  nvidia-smi es muestra instantánea y cae a ~1-3 W en micro-sueños de la GPU.
  gpu.py ahora consulta `power.draw.average` (parts[8], fallback a parts[3]);
  soporte detectado UNA vez con `--help-query-gpu` (no despierta la GPU).
  Además las gráficas de W van desde 0 (fromZero) para no dramatizar.
- **"RTX 4060" hardcodeada**: SÍ lo estaba en los title de iGPU/HYBRID/dGPU y
  en el confirm del MUX. El bloque 02 siempre fue detectado. Ahora
  refreshGpuTooltips() usa el nombre del stream acortado ("RTX 4060"),
  recordado en localStorage('dgpuName') para modo Integrated.

#### 3. Redragon K734WCG (¡LEER docs/redragon-protocol.md ANTES de tocar!)
- OpenRGB 1.0rc2 flatpak instalado y probado: NO detecta 010c (sí el teclado
  ASUS interno). hidraw0/1 son rw para el usuario en Bazzite (ACL) — no se
  necesita root cuando tengamos protocolo.
- **Detección YA en la app**: aura.py `_detect_peripherals()` (sysfs read-only,
  KNOWN_PERIPHERALS con cable+dongle) → snapshot["peripherals"] → fila en el
  bloque Iluminación (renderPeripherals; está en auraSignature).
- Protocolo mapeado en estático: BYCOMBO4/OemDrv.exe (innoextract del exe de
  Downloads, re-extraíble en /tmp/redragon-exe), clase CDevG5KB (KB.ini Fw=24),
  feature 0x05 de 5 bytes = comandos (cmd id en Buffer[2], eco + CRC en la
  respuesta), feature 0x06 de 1794 bytes = datos paginados (LEDs/macros).
- **PELIGRO REAL**: OpenRGB deshabilitó su controlador Sinowealth por BRICKEOS
  con estos VID:PID reutilizados. KB.ini trae CmdReset/IC2481. Por eso NO se
  manda NADA al teclado sin capturas USB del software oficial. Marshall tiene
  dual boot Win11: guía de captura de 10 min en docs/redragon-protocol.md.

### Pendiente para la siguiente sesión
1. **Marshall**: captura USB en Windows (guía en docs/redragon-protocol.md)
   → con eso escribir src/rog_monitor/redragon.py (ioctl HIDIOC*FEATURE,
   lista blanca de comandos vistos en captura, verificar eco+CRC).
2. Sigue pendiente de v8.3: un GUARDAR Y APLICAR de Marshall para instalar el
   rog-profile-sync blindado; probar modo música con música real.
3. Wizard de primera vez (pedido #1 del audio 2) y UX de 4 estados por widget.
4. v9 grande sin tocar: AMD, historial SQLite, empaquetado, DB comunitaria.
5. Idea para Iluminación: Marshall pidió "más cosas" — cuando esté el Redragon,
   música por zonas (graves/medios/agudos); el teclado interno no tiene zonas.

---

## Sesión previa: Claude (Fable 5) — 2026-06-10 (v8.3.0)

### Estado: cap de verdad + Aura arreglado de raíz + modales + overlay AVG/FPS. Commit local, SIN push.

**Probado con CLICS REALES** por primera vez: lancé la app Electron con
`--remote-debugging-port` y la manejé por CDP (cliente WebSocket stdlib en
`/tmp/cdp.py`, patrón reutilizable). Marshall escribió su contraseña en los
pkexec en vivo. Verificado contra hardware (LedMode por D-Bus, pwm points del
hwmon, RPM reales).

#### 1. VENTILADORES — el cap ya no se hornea (causa raíz de v8.2 reabierta)
- **Bug:** APLICAR CAP hacía `min(curva, cap)` EN los puntos y los guardaba
  así. Bajar el cap recortaba para siempre; subirlo no liberaba nada (un min
  nunca sube). El JSON de Marshall tenía los topes en 181/186/171 PWM = el cap
  de 5000 de una prueba vieja → benchmark con "cap 6500" se quedaba en ~85% y
  96 °C con ~9500 eventos de throttle.
- **Fix:** curva guardada SIEMPRE prístina; el cap lo aplica
  `rog-profile-sync.sh` al escribir al hardware (json_curve recibe también los
  defaults y aplica el cap a lo que vaya a usar). QUITAR CAP en la UI manda
  `cap: null` → borra `cap_rpm` del JSON.
- **Cap exacto:** PWM→RPM no es lineal (por eso quedaba 200-400 arriba). Nuevo
  `calibrate-fans.sh`: 7 escalones de PWM × 9 s, mide RPM por ventilador,
  guarda `calibration` y `max_rpm` en fan-curves.json. El cap se interpola en
  esa tabla con margen 1.5% (target = cap*0.985, floor). Sin calibrar cae a
  regla de tres con FALLBACK_MAX (cpu 7000/gpu 6900/mid 7500 — ¡ojo, ese
  fallback vive también dentro del python del script root!).
- **N ventiladores:** todo enumera el hwmon (script root `seq 1..6` sobre
  `pwmN_auto_point1_pwm`, main.js `detectFanKeys()`, calibrate-fans.sh).
  Mapeo: 1=cpu 2=gpu 3=mid 4+=fanN (extras usan curva default de cpu).
- `--defaults <perfil>` en el sync script imprime las curvas default como
  JSON; main.js las lee así (antes regex frágil sobre el case de bash).
- Los "máximos medidos" de antes eran FALSOS (constantes en localStorage).
  Ahora viven en fan-curves.json, la UI dice "ESTIMADOS (sin medir)" hasta
  calibrar, banner de primera vez, y `fans.py` los usa como denominador.
- benchmarks.py: summary trae `fan_cap` y `cap_respected` (±75 RPM) y la UI
  lo muestra ("Tope RPM: … respetado ✓ / EXCEDIDO ✗").
- Reparé el fan-curves.json de Marshall (curvas horneadas fuera; cap 6500 se
  conservó; backup en fan-curves.json.corrupto.bak).

#### 2. AURA — POR FIN la causa raíz real (dos bugs apilados)
- **(a) El `<label>` asesino:** los chips estaban dentro de
  `<label class="aura-effect-box">` sin `for`. El control asociado de un label
  es su PRIMER elemento labelable descendiente — **los `<button>` son
  labelables** — o sea el chip Static. Cada clic en cualquier chip se
  reenviaba como clic sintético al chip Static, el handler corría dos veces y
  la segunda pisaba todo con static. Por eso "elijo Rainbow y queda Static" y
  el toast decía "aplicada ✓" (aplicaba static de verdad). Fix: `<div>` (hay
  nota en style.css para que nadie lo "arregle" de vuelta).
- **(b) Rebuild cada segundo:** update() llamaba renderAura con cada tick del
  stream y reconstruía los chips (innerHTML) — clics reales mueren si el botón
  se destruye entre mousedown y mouseup. Ahora renderAura calcula una firma
  (auraSignature) y retorna temprano si nada cambió. El efecto elegido vive en
  `auraSelectedEffect` (variable), no en el `<select>` oculto.
- **Verificado en hardware:** clic en cada chip + APLICAR → LedMode D-Bus
  cambió a 3 (rainbow-wave), 2 (rainbow-cycle), 1 (breathe) y de vuelta a
  static d400ff (el morado de Marshall quedó restaurado).

#### 3. UI / overlay
- Modales ALERTAS y OVERLAY salían abajo del todo: no tenían CSS (solo 4 de 6
  ids estaban en style.css). Ahora todos llevan `class="modal"` y una sola
  regla compartida. Verificado por CDP: position fixed, centrados.
- Overlay: CPU muestra **promedio (AVG)**, no package. Fila **FPS** vía
  MangoHud logging (opt-in en modal OVERLAY → escribe bloque marcado en
  `~/.config/MangoHud/MangoHud.conf` con output_folder/autostart_log/
  log_interval=500; `src/rog_monitor/fps.py` tail-ea el CSV más fresco <5 s;
  `fps` va en el stream; la fila solo aparece con dato).
- Botones de perfil: resaltado optimista + set-profile confirma leyendo
  ActiveProfile de vuelta (antes parecía que el clic no hacía nada).

#### Límites de potencia: NO había nada que "liberar"
asus-armoury (sysfs) ya está al máximo del firmware: PL1 140 W, PL2 175 W,
nv_dynamic_boost 25 W, nv_temp_target 87 °C. Lo que frenaba el rendimiento
era el throttling térmico por el cap horneado. No tocar PLs.

### Segunda mitad de la sesión (feedback en vivo de Marshall)

**Cap violado jugando → arreglado y verificado.** Con cap 6500 la GPU llegó a
~6800 en juego. Causas: (1) la calibración con sleep fijo medía mal — estos
ventiladores aceleran/desaceleran MÁS LENTO que 9-10 s (la GPU "estabilizó" en
falso a 6000 y el cap le quedó en 255 = sin tope); (2) nada reaplicaba las
curvas si el firmware/asusd las pisaba. Fixes:
- `calibrate-fans.sh`: espera estabilización real (2 lecturas seguidas con
  delta <75 RPM, máx 24 s/escalón, +14 s extra el primero). main.js filtra
  monotonicidad (descarta puntos donde RPM no baja al bajar PWM).
- `rog-profile-sync.sh`: `apply_curves … check-only` compara el punto 8 del
  hardware contra lo esperado en CADA iteración del loop (≤30 s) y reaplica si
  alguien lo pisó. Probado con hwmon falso (pisotón detectado y corregido).
- La calibración de la GPU en fan-curves.json quedó FUSIONADA a mano de las
  dos corridas reales (bajos de la descendente + altos de la ascendente):
  [[90,3700]…[255,6800]], max 6800. CPU y MID calibraron limpio solos.
- **PRUEBA FINAL: benchmark 90 s CPU 100% con cap 6500 → RPM máx 6400 (cpu) /
  5100 (gpu) / 6300 (mid) → `cap_respected: true`** ✓. El summary del
  benchmark ya trae el veredicto.
- OJO: el script de /usr/local/sbin instalado NO tiene aún el check-only ni
  FALLBACK_MAX (es de la primera instalación de hoy). **Falta un GUARDAR Y
  APLICAR de Marshall** (o sudo bash ~/Rog-Monitor-Scripts/install.sh) para
  instalar la versión blindada. El cap YA funciona porque max_rpm/calibration
  están en el JSON.

**Modo música: capturaba el MICRÓFONO.** `pw-record --target <sink>.monitor`
no matchea nodo PipeWire (nombre de la capa Pulse) → caía a la fuente default
= micro (verificado con `pw-link -l`: colgaba de alsa_input). Fix:
`pw-record -P '{ stream.capture.sink = true }' --target <sink>` (verificado:
cuelga de monitor_FL/FR del sink). Brillo del pulso por busctl set-property
directo (~20 ms vs ~1 s de asusctl); color cuantizado a 5 niveles para no
spamear asusctl. Falta probar con música real sonando.

**UI nueva:** modales arrastrables (drag por el título: benchmark/fan/alerts/
overlay, vuelven centrados al cerrar), ALERTAS con iconos + bordes de color +
puntos de color en umbrales, overlay personalizable (casillas qué mostrar +
copy de MangoHud para no-expertos), EXPORTAR/IMPORTAR CONFIG (bundle JSON de
fan-curves+aura+config, respaldo .pre-import al importar), nota explicando
thermal throttling en Eventos. Todo verificado por CDP con la app corriendo
(dots=7, drag handles=4, overlay AVG en vivo con % relativo al cap).

**Redragon K734WCG-RGB-PRO (pedido nuevo):** el exe de Windows
(~/Downloads/Redragon_K734WCG-RGB-PRO_Software.exe) es Inno Setup; extraído
con innoextract (instalado por brew): software "BYCOMBO4" de BY Tech.
**VID/PID: cable 0x258a:0x010c (Sinowealth/BY Tech — lsusb lo ve AHORA
conectado), dongle 0x3554:0xfa09 (CompX).** Plan: instalar OpenRGB (flatpak) y
probar detección; 0x258a es el VID clásico Redragon en OpenRGB pero 010c puede
no estar soportado → en ese caso, protocolo HID propio (python hidapi) mirando
app/Dev/kb/KB.ini del exe extraído (/tmp/redragon-exe, re-extraíble). NO usar
Proton/Wine para el driver (frágil); interop nativo.

### Pedidos NUEVOS de Marshall (audio 2, prioridad para próximas sesiones)
1. **Wizard de primera vez / setup**: al abrir por primera vez, guiar:
   detectar ventiladores → calibrar (pidiendo permisos con explicación) →
   benchmark CPU + GPU → guardar todo → tour de qué hace cada cosa. Nada de
   "máximos medidos" sin medir (eso ya quedó: dice ESTIMADOS hasta calibrar).
2. **UX de 4 estados por widget**: con datos / cargando / sin datos / error
   (ej.: RAM que no carga; ventilador dañado → ícono quieto, ya pausa en 0
   RPM pero hay que mostrarlo explícito).
3. **Multi-distro y multi-marca**: nada atado a Bazzite ni al G614JV en docs/
   UI (ya auditado: solo queda 1 mención válida a Bazzite en el copy de
   MangoHud). Meta a largo plazo: Armoury Crate de Linux, también Legion etc.
4. **Música por zonas**: graves/medios/agudos en distintas zonas del teclado.
   OJO: el teclado interno reporta SupportedBasicZones=0 (sin zonas); esto es
   para el Redragon vía OpenRGB cuando esté.
5. **Alertas aún más visuales** (hecho parcial: colores/iconos).
6. La ventanita de benchmarks desplazable (HECHO), explicar throttling en
   eventos (HECHO), export/import de config (HECHO).

### Pendiente para la siguiente sesión
1. Marshall: un GUARDAR Y APLICAR para instalar el script blindado (ver
   arriba). Probar modo música con una canción de verdad.
2. Wizard de primera vez (pedido #1 de arriba).
3. OpenRGB + Redragon 258a:010c (plan arriba).
4. GPU benchmark podría exigir más W (vkcube es geometría trivial; glmark2
   no está instalado). Idea: probar `brew install glmark2` o flatpak.
5. v9 grande sigue sin tocar: AMD, historial SQLite, empaquetado, DB
   comunitaria de máximos.

---

## Sesión previa: Claude (Opus 4.8) — 2026-06-10 (v8.2.0)

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
