# Build spec v10 — contrato multiagente (orquestado por Opus)

> Lee también `AGENTS.md` y `docs/HANDOFF.md`. Este archivo es la **fuente de
> verdad** del reparto y los contratos de datos entre agentes. Si algo aquí
> choca con lo que crees, pregunta al orquestador — NO improvises un contrato.

## Reglas de oro (NO romper)

1. **NUNCA `git push`.** Trabajas en TU worktree; `git add -A && git commit` a
   TU rama al terminar. El orquestador fusiona y Marshall pushea. Hay un hook
   `pre-push` que aborta cualquier push: no intentes saltarlo.
2. **No tocar archivos de otro agente.** Cada quien edita SOLO los suyos (tabla
   abajo). Si necesitas algo de otro, úsalo por el contrato, no edites su archivo.
3. **Sudo/root: NO ejecutar.** Si tu feature necesita root, escribe el
   script/servicio y **documenta el comando en `docs/SUDO-PENDIENTE-v10.md`**
   (créalo/añádele) para que Marshall lo corra al final. La app pide root por
   `pkexec` en runtime (como el poder actual), eso sí es válido.
4. **Sin telemetría / sin red nueva.** Única red permitida: botón actualizar
   (git) y reportar (abre GitHub). No agregues fetch/analytics.
5. **No parecer hecho por IA**: tipografía grande y clara, identidad propia,
   paletas neón potentes. Nada de gradientes genéricos morados de plantilla.
6. **Archivar, nunca borrar** archivos preexistentes (renómbralos `.bak` si hay
   que retirarlos). Quitar markup muerto SÍ se puede (p. ej. el selector extra).
7. **Los 4 estados por widget** (con datos / cargando / vacío / error) deben
   seguir funcionando en todo lo que toques. Ver `widget-states.js`.
8. **Multi-idioma**: TODO texto visible nuevo pasa por `window.t('clave')`
   (contrato §A1). No hardcodees strings nuevos en un solo idioma.

## Stack y arranque

- Backend Python `src/rog_monitor/` (lee sysfs, sin root; escribe vía script+pkexec).
- App Electron `desktop/`: `main.js` (IPC), `preload.js` (`window.rog`),
  `renderer/` (index.html + app.js + módulos por feature + styles/).
- `update(stats)` en app.js renderiza 1×/s. `window.rog.onStats(cb)` admite
  **varios suscriptores** (widget-states.js ya es uno) → suscríbete aparte, NO
  metas tu lógica dentro de `update()` salvo hooks mínimos.
- Verifica tu trabajo: `node --check <tus .js>`, `python3 -m py_compile <tus .py>`,
  y prueba el flujo real de tu feature. Reporta qué verificaste.

## Andamiaje ya puesto por el orquestador (NO recrear)

En index.html ya existen, vacíos, para que los llenes por JS/CSS sin pelear por
el head ni por el markup:
- `<link>` a `styles/neon.css` (A4), `styles/dashboard.css` (A3), `styles/extras.css` (A5).
- `<script>` `i18n.js` (A1, **antes** de app.js), `dashboard.js` (A3), `roadmap.js` (A5).
- Botones topbar: `#lang-btn` (A1) y `#roadmap-btn` (A5) — ya en `.controls`.
- Shells de modal: `#lang-modal` (A1), `#roadmap-modal` (A5).
- Cada `<article class="block">` tiene `data-block="cpu|gpu|fans|aura|history|bench|system|events|procs"`
  (clave estable para A3: persistencia/orden/toggle). **No renombres estas claves.**
- Archivos nuevos vacíos creados: `renderer/i18n.js`, `renderer/dashboard.js`,
  `renderer/roadmap.js`, `styles/neon.css`, `styles/dashboard.css`, `styles/extras.css`.

## Convenciones compartidas (contratos transversales)

### i18n (dueño A1; todos lo consumen)
- A1 expone en i18n.js (cargado antes que app.js):
  - `window.t(key, vars?)` → string en el idioma activo; **fallback seguro**:
    si no hay traducción, devuelve el español; si no, la key. Nunca lanza.
  - `window.i18n.register(dict)` donde `dict = { es:{...}, en:{...}, ... }`;
    cada agente registra SUS claves desde su propio módulo (no editan la dict de A1).
  - `window.i18n.apply(root?)` recorre `[data-i18n]` y pone `textContent`;
    `[data-i18n-attr="title:key,placeholder:key2"]` para atributos.
  - `window.i18n.onChange(cb)` se llama al cambiar idioma (re-render tu feature).
- Claves con namespace por feature: `aura.*`, `power.*`, `bench.*`, `events.*`,
  `roadmap.*`, `dash.*`, `topbar.*`, `wizard.*`, `common.*`.
- Idiomas: `es en fr it pt zh ja ko`. `es` es la base obligatoria (completa);
  los demás deben existir completos (A1 traduce el core; cada agente da SUS claves
  al menos en es+en y, si puede, en los 8 — si no, A1 completa en integración).

### CSS / neón (dueño A4; todos consumen tokens)
- Variables por tema en `style.css` bajo `html[data-mode][data-theme]`:
  `--bg --panel --hair --accent --accent2 --chip --ink --dim --glow`.
- A4 añade y mantiene tokens de glow neón en `styles/neon.css`:
  `--neon-glow` (sombra de texto fuerte del acento), `--neon-glow-soft`,
  `--neon-box` (box-shadow halo), `--neon-line` (borde que brilla).
  **Funcionan en oscuro Y en claro** (neón de día). Otros: usen
  `text-shadow: var(--neon-glow)` / `box-shadow: var(--neon-box)` y listo.
- No redefinas `--accent` etc. fuera de tu archivo si no eres A4.

### Utilidades existentes en app.js (reutiliza, no dupliques)
- `$(id)`, `fmt(v,d,fb)`, `toast(msg)`, `escapeHtml(s)`, `tempClass(t,limits)`,
  `cssVar(name)`. `window.rog.*` (preload) para IPC.

## Reparto por dueño-de-archivo

| Agente | Python | main.js/preload | renderer |
|---|---|---|---|
| A1 | — | — | **i18n.js** (nuevo), `<header>` de index.html, hooks i18n en app.js, paso idioma en wizard.js |
| A2 | **aura.py** | (los handlers aura ya existen) | bloque `#aura-block` de index.html (quitar extra), sección aura de app.js, `styles/lighting.css` |
| A3 | — | — | `<main>` de index.html (solo contenedor/orden, NO el interior de los bloques), **dashboard.js** (nuevo), `styles/dashboard.css`, puede extender widget-states.js |
| A4 | — | — | array `THEMES` en app.js (solo si ajusta paletas), bloques `html[data-mode...]` de **style.css**, **styles/neon.css** (nuevo) |
| A5 | benchmarks.py (persistencia/fecha) | `benchmark-history` IPC si va por archivo | secciones bench/eventos de app.js, **roadmap.js** (nuevo), `#benchmark-modal`/`#roadmap-modal`, `styles/extras.css` |
| A6 | **power_control.py**, **device_profiles.json**, scripts nuevos | handlers `*-power-control` + offsets/térmico | `power.js`, `styles/power.css` |

Zonas calientes compartidas (edita SOLO tu región, líneas distintas → merge limpio):
- **index.html**: A1=header, A2=interior de #aura-block, A3=contenedor de <main> + handles/toggles por bloque (NO el interior), A5=modales bench/roadmap. Nadie toca el interior de un bloque ajeno.
- **app.js**: A1=hooks i18n + wrap de strings del topbar, A2=funciones `renderAura*`/`syncAuraFields`/`applyAuraState` + sus listeners, A4=`THEMES` + `applyAppearance`, A5=`renderBenchmark*`/`pushBenchmarkHistory`/`benchmarkSummaryText` + render de eventos (líneas ~849-854) + sus handlers del tail.
- **style.css**: A4=bloques de tema/`:root`/glow; A3=reglas estructurales `.block/.col/main` (mejor en dashboard.css).

---

## §A1 — Internacionalización + barra superior + wizard

**Qué entregar**
1. `i18n.js` con el contrato i18n de arriba. Diccionario CORE (es+en+fr+it+pt+zh+ja+ko)
   cubriendo: topbar (perfiles, GPU seg, ACTUALIZAR, REPORTAR, ALERTAS, OVERLAY,
   TEMA, PODER, VER TUTORIAL), títulos de los 9 bloques, labels comunes (Máx/Mín/
   Uso/Watts/etc.), botones de modales. Marca con `data-i18n` los textos estáticos
   de index.html (los `<h2>`, labels, botones) y aplica en arranque + onChange.
2. **Botón selector de idioma** `#lang-btn` en topbar: ícono tipo "A文" / "A あ"
   (letra latina + glifo CJK). Al click → `#lang-modal` con la lista de los 8
   idiomas (bandera/sigla + nombre nativo). Persistir en `localStorage['lang']`
   y aplicar al instante. Default: si no hay guardado, usa el del wizard.
3. **Wizard**: nuevo PASO 0 "Elige tu idioma" (antes que todo) en wizard.js;
   guarda el idioma elegido. El wizard ya existe (5 pasos repetibles); inserta el
   idioma como primer paso y ajusta el contador (ahora 6 pasos) sin romperlo.
4. **Rediseñar el cluster de estado del topbar** (no-IA, premium, consume glow de A4):
   `.brand` tiene `#thermal-lamp` + `#thermal-label` + `#power-source`
   ("⚡ CONECTADO" / "🔋 BATERÍA", lo setea `update()` en app.js ~L845). Hazlo una
   píldora elegante con el neón del tema (borde que brilla, ícono nítido), legible,
   con micro-transición. Mantén los IDs y que `update()` siga funcionando.

**Contrato**: no cambies la firma de `update()`; expón `window.t`/`window.i18n`
ANTES de que app.js corra (por orden de `<script>`). `window.t` jamás lanza.

## §A2 — Aura (causa raíz ya diagnosticada)

**Causa raíz**: `EFFECT_META` en aura.py asume estáticamente qué args acepta cada
efecto. El `asusctl` instalado NO acepta `--speed` en `pulse` (→ "unrecognised
argument speed") ni usa `--colour2` en `breathe` (color secundario inútil).

**Qué entregar (aura.py)**
1. **Descubrir args por efecto**: para cada efecto soportado, parsear
   `asusctl aura effect <id> --help` UNA vez (cachear) y detectar si acepta
   `--colour`, `--colour2`, `--speed`, `--direction`. Construir el comando en
   `apply_state` SOLO con los args realmente soportados. Reportar en el snapshot
   `effects[].{colours, speed, direction}` con lo DESCUBIERTO (no lo asumido), para
   que `syncAuraFields()` muestre/oculte color2/velocidad/dirección correctamente.
   - Si `--help` no se puede parsear, cae al comportamiento actual pero **sin**
     mandar args que produzcan error (mejor de menos que romper).
2. Strobing (`pulse`): que aplique sin `--speed` si no lo soporta. Respiración
   (`breathe`): sin `--colour2` si no lo soporta (y el snapshot diga `colours:1`).
3. Verifica `rainbow-wave`/`rainbow-cycle` (Marshall dice que a veces fallan):
   confirma que aplican por D-Bus/asusctl y que la UI no los pisa.

**Qué entregar (renderer)**
4. **Quitar la sección "Mas efectos ASUS"**: en index.html borra `#aura-extra-wrap`
   (líneas ~143-146) y en app.js elimina `auraExtraEffects()`, el render del extra
   en `renderAuraEffectControls`, y el listener de `#aura-extra-effect`. La
   cuadrícula de 9 modos (`#aura-mode-grid`) queda como ÚNICO selector. `effects`
   sigue informando flags por efecto.
5. `styles/lighting.css`: pulir la cuadrícula con el neón de A4 (usa tokens, no
   colores fijos). Estados de tile: active/idle/disabled/future ya existen.

**Verifica**: `python3 -m py_compile`, `asusctl aura effect pulse --help` /
`breathe --help` para confirmar el parseo, y que la UI ya no mande args inválidos.

## §A3 — Dashboard tipo sticky-notes (4 estados)

**Qué entregar** (en `dashboard.js` + `styles/dashboard.css`, mínimos toques a `<main>`):
1. **Arrastrar y reordenar** los 9 bloques (`[data-block]`) por bloques (grid-snap,
   no posición absoluta caótica). Handle visible al hover (≡) por bloque. Suelta →
   reordena. Usa HTML5 drag&drop o pointer events; respeta ambas columnas o permite
   mover entre columnas (elige una UX limpia y explícala).
2. **Activar/desactivar** cada widget: una X/ojo por bloque lo oculta; un panel de
   "configuración del tablero" (engranaje en topbar o dentro del modal TEMA, coordina
   con A1 por `data-i18n`) lista los ocultos para re-activarlos.
3. **Renumeración dinámica**: los números `<i>NN</i>` de cada `<h2>` se recalculan
   según el orden VISIBLE (sin huecos: si ocultas el #6, no queda 1,2,3,4,_,6…).
   Hoy el número está hardcodeado en el HTML; pásalo a que lo ponga dashboard.js.
4. **Persistir** orden + ocultos en `localStorage['dashboardLayout']`. Botón
   "restablecer tablero".
5. **4 estados**: respeta `widget-states.js`; el drag/hide no debe romper los
   overlays skeleton/empty/error. Coordina (no dupliques su suscriptor onStats).

**Contrato**: NO edites el interior de los bloques (eso es de A2/A5/A6); solo el
contenedor, el orden, los handles/toggles y la numeración. Mantén los `data-block`.

## §A4 — Temas neón puro (oscuro fuerte + neón de día)

Marshall quiere **neón de verdad** (Cyberpunk 2077 / foto Liam Wong: las cosas
*brillan*), no el glow tímido actual. Y en **modo claro**, "neón de día":
acentos saturados que brillan sobre fondo claro, manteniendo contraste legible.

**Qué entregar** (en `styles/neon.css` + bloques de tema de `style.css`):
1. Tokens de glow potentes por tema/modo: `--neon-glow` (text-shadow multicapa del
   `--accent`), `--neon-glow-soft`, `--neon-box` (box-shadow halo), `--neon-line`.
   Aplícalos a: `.bignum`, números de bloque, `.brand-mark`, bordes de `.block`
   (línea que brilla), botones activos, chips/tiles activos, la lámpara térmica.
2. **Oscuro**: sube el bloom — los acentos deben *irradiar* (varias capas de
   shadow con alpha decreciente), como letreros de neón de noche. Sin lavar el texto.
3. **Claro ("neón de día")**: NO dejes `--glow: transparent`. Diseña glow que se vea
   sobre fondo claro: halos saturados alrededor de acentos/números/bordes, fondo
   claro con tinte del tema, texto oscuro legible (contraste AA ≥ 4.5:1 en texto
   normal). Que el claro deje de verse "flojito".
4. Aplica a los **12 temas** (oscuro y claro). Cuida rendimiento (no animes 200
   sombras a 60fps; glow estático + alguna transición puntual).

**Verifica**: abre cada tema en ambos modos (CDP o describe), comprueba AA del
texto principal, y que no quede ilegible. No rompas variables que otros usan.

## §A5 — Benchmarks + Eventos + Roadmap (neón, clickable, fechas)

**Benchmarks**
1. Persistir el resultado COMPLETO por corrida (no solo el texto). Registro:
   `{ id, kind, label, started_at (ISO), when (local legible), seconds, tool,
   summary{...}, samples?[] }`. Guarda en `localStorage['benchmarkHistoryV2']`
   (mantén compatibilidad / migra el viejo) o, si prefieres archivo, añade IPC
   `save/list-benchmark` en main.js escribiendo a `~/.local/share/rog-monitor/benchmarks/`.
   `benchmarks.py` ya devuelve `started_at` y `samples` — úsalos.
2. **Tarjetas de resultado neón** (en `#bench-history` y el inline), con fecha/hora
   visible, veredicto con color de tema (no "sí/no" pelado): temp/W/throttle/cap
   con badges. **Clickable**: al abrir una tarjeta despliega los dígitos/detalle
   (mini-gráfica de samples o tabla de máximos). Usa `styles/extras.css`.
3. Estados: sin historial (vacío), corriendo (cargando), error (mensaje claro).

**Eventos**
4. Cada evento (`<li>` de `#events`, datos `[ts, level, msg]`) **clickable** →
   panel/tooltip con explicación en lenguaje claro: qué pasó y por qué (mapa de
   explicación por tipo: throttling, ventilador parado, potencia anómala, temp
   alta…). Reusa el copy de throttling que ya existe. Neón acorde al tema.

**Roadmap**
5. `#roadmap-btn` (ya en topbar) → `#roadmap-modal`: una línea de tiempo con
   **"Hecho"** (por fechas, derivado de los commits / CHANGELOG / HANDOFF) hacia
   arriba y **"Por hacer"** (de `docs/roadmap.md` + pendientes de HANDOFF) hacia
   abajo, con una flechita para expandir cada sección. Texto vía `window.t` con
   namespace `roadmap.*` (el contenido puede venir de un JSON que generes en build
   o embebido en roadmap.js; mantenlo actualizable). Estado actual arriba del todo.

**Verifica**: corre un CPU 45s real, confirma que persiste con fecha y que el
detalle se abre; click en un evento muestra explicación; roadmap abre y despliega.

## §A6 — Centro de Poder: offsets GPU (Wayland/NVML) + techo térmico real

**NOTICIA**: NVML SÍ permite offsets en Wayland (driver 610.43.02, RTX 4060).
Lectura unprivileged ya verificada: núcleo `[-1000,+1000]` MHz, memoria
`[-2000,+6000]` MHz, símbolos `nvmlDevice(Get|Set)(Gpc|Mem)ClkVfOffset` y
`...MinMaxVfOffset` presentes en `libnvidia-ml.so.1`. **El SET necesita root.**

**Qué entregar**
1. **Helper NVML** (Python, ctypes a `libnvidia-ml.so.1`, sin pip): `read` (offset
   actual + min/max de núcleo y memoria, unprivileged) y `set` (escribe offsets,
   requiere root). Ej. `src/rog_monitor/gpu_clocks.py` + `scripts/apply-gpu-clocks.sh`
   que lo invoca como root vía `pkexec` (igual patrón que apply-power-control.sh).
2. **power_control.py**: para `base_clock_offset`/`mem_clock_offset`, dejar
   `writable: true` (NO bloquear por Wayland), con `min/max/value` REALES de NVML
   (no los 0-200/0-300 viejos). Rango seguro recomendado en UI con doble
   consentimiento (overclock puede DAÑAR; el firmware/driver puede colgar →
   recuperable reiniciando). `apply()` enruta estos dos por el helper NVML
   (pkexec), los otros 4 siguen por apply-power-control.sh. Corrige device_profiles.json.
3. **Techo térmico REAL — guardián (Marshall eligió: VENTILADORES PRIMERO)**:
   un servicio root en loop (~1-2 s) que lee la temp de la GPU y, si se acerca al
   techo fijado (`nv_temp_target`/UI), **sube los ventiladores primero**; si aún
   sube, **recorta potencia** (baja `nv_dynamic_boost` y si hace falta PL); al
   enfriar, revierte suavemente. Base de inspiración:
   `~/.hermes/skills/devops/asus-rog-thermal-control/references/rog-thermal-enforcer-daemon.sh`
   y la skill (mapping throttle_thermal_policy 0/1/2; en Bazzite reaplicar curvas
   DESPUÉS de tocar policy; no pelear con tuned/coolercontrol). Integra con las
   curvas existentes (`rog-profile-sync`/fan-curves.json) — NO crees una pelea de
   daemons por el mismo sysfs. El instalar el servicio es **sudo → documéntalo en
   `docs/SUDO-PENDIENTE-v10.md`** (no lo ejecutes). La UI (power.js) ofrece
   activar/desactivar el guardián y elegir el techo; explica en lenguaje claro qué
   hace ("mantengo la GPU bajo X °C subiendo ventiladores y, si toca, bajando
   potencia").
4. **Coolbits**: solo respaldo. Deja una nota/cómo en `docs/SUDO-PENDIENTE-v10.md`
   (config `/etc/X11/xorg.conf.d/`), pero el camino principal es NVML/Wayland.
5. `power.js` + `styles/power.css`: pestaña GPU con los 2 sliders de offset
   activos (con marca de fábrica 0, rango seguro, consentimiento) y el control del
   guardián térmico. 4 estados. Sigue el contrato canónico actual de
   power_control (controls dict por clave + `ok`/`available` + `label`).

**Seguridad (regla del dueño)**: la app PROTEGE el equipo. Doble recorte (python +
script), allowlist, consentimiento con advertencias de daño/colgado, rangos
acotados, y el guardián térmico debe FALLAR-SEGURO (si no puede leer temp, sube
ventiladores y no toca potencia hacia arriba). Nada destructivo a ciegas.

**Verifica**: `python3 -m py_compile`; `read` de NVML imprime offsets/min/max;
el `set` lo deja LISTO pero su prueba real es con la clave de Marshall (documenta).
NO toques el teclado Redragon (peligro de brick — bloqueado).
