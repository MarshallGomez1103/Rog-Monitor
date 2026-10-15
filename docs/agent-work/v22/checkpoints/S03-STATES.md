# S03-STATES — Cableado de estados de panel y cabecera de sensores (S03-2 · N-A4-03 / N-A4-04)
Estado: **TESTED** (unidad + CDP con aserciones + e2e, 2026-10-14) · Base: feat/v22 `781b6c6` · Dueño: Sonnet-StateWire · Rama del worktree: `worktree-agent-a6e17efcaec20e805`
Pendiente de aprobación del propietario: los textos marcados en «Decisiones de texto».

## Qué cambia
| Archivo | Cambio |
|---|---|
| `desktop/renderer/widget-status-view.js` (nuevo, UMD, puro) | `fmtNum/fmtPct/fmtDeg/fmtUptime/uptimeSeconds/fmtNet/fmtLoad/fmtRam/clampPct/pctOrNull` (null ≠ 0), `powerSource` (`on_ac` null ≠ batería), `fanView` (rpm null ≠ PARADO), `vramView` (`reason_code`), `auraView` (null = lector caído), `headerStatus`, `createHeaderSettler` (parcial exige 2 muestras), `createHeaderView` (DOM inyectado) |
| `widget-states.js` | `UNSUPPORTED_AS_EMPTY = false`; `data-action`, `data-partial`, `data-why="diag"`; botón «Ver diagnóstico» (delegado, abre `window.openDiag`, nada privilegiado); antidestello ok→vacío (2 muestras); `aria-busy`; `aria-hidden` dinámico del aviso; instancia expuesta en `RogWidgetStates.wiring` |
| `index.html` | `.widget-empty-msg` (role=note) en CPU/GPU (título+pista+botón) y **en línea** en fans/system/procs; `#backend-state` `role=status aria-live=polite aria-atomic` + `#backend-meta` aparte; `#events role=log aria-live=off`; botón `#vram-retry`; carga `widget-status-view.js` antes de `app.js` |
| `styles/onboarding.css`, `style.css` | `[data-state="unsupported"]` (= empty), aviso en línea/parcial, `.widget-why`, `.fan-no-reading`, icono de GPU neutro sin modo fiable, fundido 180 ms al cambiar de estado, sin doble atenuación en stale, marcador de nivel de la cabecera (forma + color) |
| `app.js` | solo cableado: cabecera (`renderHeader`/`staleTick`/`onBackendDown`), campos con null, ventiladores, aura null, modal de VRAM por código (`fillVramModal`, se refresca solo y botón Reintentar) |
| `battery.js` | `alert()` nativo → `toast(msg, 'err')` |
| `i18n.js` | 36 claves × 8 idiomas (ver abajo) |
| `scripts/validate-i18n.mjs` | precarga `widget-status-view.js`; comprueba que las claves literales de `widget-states.js`/`widget-status-view.js` (y sus `_hint`) existan |
| `desktop/test/charts.test.js` | única edición fuera de la lista de dueño: `clampPct` ya no vive en `app.js` y se importa de `widget-status-view.js` (el test lo extraía por regex) |

## Reglas aplicadas (por defecto del inventario N-A4-01)
1. **Cabecera** (antes «sensores OK» fijo): OK / sin datos recientes (stale > 6 s) / backend caído / reconectando / sensores parciales (`CPU, GPU…`). Hardware ausente legítimo (dGPU apagada por modo, sin ventiladores, sin batería) **no** cuenta como parcial. Región viva: el texto solo cambia al cambiar de estado; reloj, versión y segundos de stale van en `#backend-meta` (no anunciado). `down` + `reconnecting` seguidos = un solo anuncio. Antes `status.reconnecting` **no existía** y la barra mostraba la clave cruda: corregido.
2. **Null ≠ 0**: `hot90`, `throttle_count`, RAM, uptime (ya no cae a 0), red por sentido, carga (`--`, antes en blanco), `on_ac` (`—`), `cpu.max/min/package` (`--`, antes `--°`), VRAM usada. 0 real se muestra (`0%`, `0`, `0m`, `↓0.0`) y no cambia el estado del panel.
3. **Atribución**: GPU con `mode` vacío/null/`error` → «Sin datos de GPU», icono neutro; solo `Integrated`/`Hybrid` dicen apagada/en reposo. Aura `null` → «no se pudo leer… no significa que falte asusctl»; `{available:false}` conserva el mensaje de instalación (solo texto). CPU: lector caído («Lector de CPU no disponible» + Ver diagnóstico) distinto de «Sin sensor de temperatura» (aviso en línea, el uso sigue visible).
4. **VRAM** `procs_vram.reason_code` → texto traducido + pista; el `reason` español del backend es solo respaldo de código desconocido. Acciones: `retry` = botón «Reintentar» (relee la última muestra; el modal además se refresca cada segundo); `install` = solo explica (ver wording).
5. **Aria**: `#events` role=log; error/stale anunciados UNA vez (cabecera); chips de error siguen `aria-hidden`; avisos «vacío» visibles para lectores de pantalla.
6. **Sin parpadeo**: stale→ok y error→ok no pasan por loading/empty (secuencia exacta comprobada con MutationObserver); un vacío suelto tras «ok» se retiene 1 muestra (widget y cabecera); fundido CSS de 180 ms (`a11y.css` lo anula con reduced-motion).

## Claves i18n nuevas (36, es/en/fr/it/pt/zh/ja/ko con traducción real)
`widget.cpu_reader(_hint)`, `widget.cpu_notemp(_hint)`, `widget.fans_none(_hint)`, `widget.fans_noreading(_hint)`, `widget.sys_reader(_hint)`, `widget.procs_none(_hint)`, `widget.fan_stopped`, `widget.fan_nodata`, `widget.why`, `widget.why_title`, `status.ok`, `status.partial` (`{list}`), `status.stale`, `status.reconnecting`, `vram.warming_up(_hint)`, `vram.no_nvidia(_hint)`, `vram.dgpu_asleep(_hint)`, `vram.dgpu_inactive(_hint)`, `vram.driver_error(_hint)`, `vram.no_tools(_hint)`, `vram.reader(_hint)`, `vram.retry`, `aura.reader_error`. Total del diccionario: 1034 → 1070.

## Decisiones de texto para el propietario (wording de instalación/permisos)
- `vram.no_tools_hint` (único texto de «instalar»): «Hay una GPU NVIDIA, pero no se encontró NVML ni nvidia-smi. Instala el driver propietario desde tu distribución; ROG Monitor no instala nada por ti.» Sin comando, sin botón.
- `aura.reader_error`: «No se pudo leer el estado de Aura ahora mismo; reintenta solo. Esto no significa que falte asusctl.» (el `aura.no_rgb` con «Instala asusctl/asusd» queda solo para `available:false`).
- Botón `widget.why` = «Ver diagnóstico» (abre el hub de diagnóstico existente; solo aparece en lector caído / sin lectura / GPU sin modo fiable; no en hardware ya explicado, ni sin temperatura, ni procesos vacíos ni fans ausentes).
- `status.partial` = «Sensores parciales: CPU, GPU…»; `status.stale` = «Sin datos recientes» (segundos en la meta: «SIN DATOS · N s»).
- `vram.driver_error_hint` promete reintento cada segundo («si persiste, revisa el diagnóstico»).
- `#events` usa `aria-live="off"` a propósito: la lista se reconstruye entera y una región viva leería los 30 eventos en cada cambio. Alternativa: anunciar solo el último evento nuevo (requiere tocar `event-detail.js`).

## TDD
**RED unitario** (`evidence/S03/RED-unit.txt`): `node --test desktop/test/widget-status-view.test.js desktop/test/widget-states.test.js` → 39 tests, 32 pasan, **7 fallan** (módulo inexistente + 6 de cableado: unsupported, partial, why, click, antidestello, `wiring`). Después `fmtDeg` y `createHeaderView` (5 tests) también se escribieron en rojo antes.
**GREEN unitario**: `node --test desktop/test/*.test.js` → **162 pasan, 0 fallan** (antes 132). Cobertura: `widget-status-view.js` 100 % líneas, `widget-states.js` 96,76 % (solo el autoarranque del navegador).
**RED CDP** (`evidence/S03/RED-check-states.txt`): `check-states.mjs` contra una copia de la base `781b6c6` → **26/133 OK, 107 FAIL** (cabecera fija, sin aviso por motivo, sin role/aria, 0 falsos, etc.). Aviso honesto: en la base no existe `RogWidgetStates.wiring`, así que las aserciones de data-state por bloque fallan también por no poder inyectar en esa suscripción; las de cabecera, `--°`, carga en blanco, `status.reconnecting` crudo, VRAM y aura son RED de comportamiento.
**GREEN CDP** (`evidence/S03/GREEN-check-states.txt`): `check-states.mjs` → **150/150, RESULT: PASS** en neón-oscuro, magma-oscuro y magma-claro. Cubre: arranque (loading→ok), sin muestra, todo-null (forma de `_cpu_unavailable`/`_sys_unavailable`), 0 legítimo, stale 5,9 s/6,1 s, backend caído y reconexión, stale→ok, antidestello, texto/data-state/role/aria-live, ningún «0» falso, VRAM por código (8 códigos + desconocido), aura, claves en 8 idiomas, contraste ≥ 4,5 en 12 temas × 2 modos (mín. 5,08 la pista atenuada), clic real en «Ver diagnóstico» abre el diagnóstico. Inyección síncrona (`RogWidgetStates.wiring.onStats` + `update` en una sola evaluación): no se envían señales a procesos ni se ejecutó `check-stale.mjs`.
**Regresión**: `check-bench.mjs`, `check-tables.mjs`, `check-editor2.mjs` → RESULT: PASS (logs `GREEN-regresion-*.txt`). e2e `scripts/e2e-smoke.mjs` → **31 pass, 0 fail, 0 exceptions, 0 console.error**. `node scripts/validate-i18n.mjs` → OK, 1070 claves × 8 idiomas.
Capturas recortadas (solo el elemento; la barra se recorta a estado+meta porque `#versions` muestra rutas locales): `evidence/S03/*.png`.

## `wc -l desktop/renderer/app.js`
Antes **4036** → después **4055** (+19 netos). Lógica nueva en módulos puros con tests; se retiraron `fmtUptime`/`clampPct`/lógica de la cabecera inline.

## Hallazgos y límites
- `--state-hot/--state-normal/--state-critical` de `tokens.css` **no resuelven** en `:root` (getPropertyValue = vacío); `onboarding.css` (insignia stale) y mi nuevo marcador los usaban. Se cambiaron a `--hot/--okstate/--crit`. Causa de fondo sin investigar (no bloquea).
- `aura.tiles[].reason` y `power_control.*.reason` siguen siendo texto libre en inglés (N-DEF-02 §4).
- `battery` null sigue sin distinguir «sin batería» de «lector caído» (contrato).
- `cores.js` y `disks.js` ya mostraban su mensaje vacío; sin cambios. Overlay no tocado (hecho en S03-1a).
- Retry de backend caído: no hay acción (el reinicio es automático); el chip dice «Reconectando con los sensores…».

## Riesgos y rollback
Cada tema es un commit independiente (`git revert` en orden inverso): módulo+wiring `7ee27e1`, i18n `20d3748`, markup/CSS `3c199ee`, app.js `c042846`. Interruptor de rollback visual: `UNSUPPORTED_AS_EMPTY = true`.

## Siguiente
S04 (cobertura Python 60 %). Para el propietario: aprobar los textos de arriba; decidir si se quiere anunciar el último evento nuevo en una región viva dedicada.
