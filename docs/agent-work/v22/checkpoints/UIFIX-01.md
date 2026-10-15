# UIFIX-01 — feedback del propietario sobre el editor de gráficas y la barra de estado

**Agente:** Sonnet-UIFix (worktree aislado) · **Base:** `d1fe76b` (feat/v22) · **Estado:** GREEN / TESTED; validación visual del propietario pendiente
**Commits (sin push):** `e1986a6` quitar expandir · `aab62fe` arrastre con Pointer Events · `2a1985b` barra de estado vacía en OK · (esta ficha).
**Origen:** el propietario probó la app: (1) arrastrar gráficas en Historial no funciona con el ratón; (2) «Ampliar CPU» no le gusta: quitarlo; (3) «Sensores OK» abajo a la izquierda «se ve muy de IA».

## 1. Quitar «Ampliar» (N-A3-03 retirado)
Borrado: botón por tarjeta y su `.chart-head`, `#chart-modal` / `#chart-big` / `#chart-modal-close`, el estado de expandir del modelo (`createExpandState`, `toggleExpanded`, `collapseExpanded`, `isExpanded`, `reconcileExpanded`), el gancho `RogChartEditorUI.draw`, el CSS (`.chart-head`, `.chart-expand`, `.chart-modal-card`, `#chart-big`; `#chart-tip` vuelve a z-index 25) y las claves `chart.expand` / `chart.collapse` en las 8 lenguas. Las tarjetas vuelven a ser etiqueta + canvas.
Docs: README (editor), CHANGELOG, `docs/roadmap.md` y la regla `readme-chart-editor` de `scripts/check-docs.mjs` ya no mencionan expandir.
**RED:** `node --test desktop/test/chart-editor-model.test.js` -> 21 pass / 1 fail (el modelo aún exponía el estado); `check-editor2.mjs` actualizado contra la base -> **153 PASS / 9 FAIL** (`evidence/S02/RED-uifix-expandir.txt`: botón/modal/claves presentes).
**GREEN:** `check-editor2.mjs` 162/162 en neón-oscuro, magma-oscuro, magma-claro (`GREEN-uifix-expandir.txt`).

## 2. Arrastre que funciona con un ratón real (Pointer Events)
Causa: el DnD nativo HTML5 solo se había probado con `DragEvent` sintéticos; con un ratón real (CDP `Input.dispatchMouseEvent`) no arrancaba (la fila quedaba `.dragging` sin destino y no se movía nada).
Solución (`chart-editor-ui.js`, lógica pura en `chart-editor-model.js`):
- `pointerdown` en el asa o en el nombre de una fila activa (botones y casillas no inician; con táctil solo el asa, que lleva `touch-action:none`).
- `CE.createPointerDrag(4)`: umbral de 4 px; **`setPointerCapture` solo al superar el umbral**, para que un clic en el nombre siga alternando la casilla (la captura redirige el `click` a la fila).
- Línea de destino `drop-above/below` con `CE.dropDirection`; destino = fila activa bajo el puntero (`CE.dropTargetAt`, solo si está dentro del editor en horizontal); fila desactivada o fuera = sin cambio.
- `pointerup` -> `CE.dropChart` -> `setHistCharts` (persiste en `localStorage.histCharts`); el clic posterior al arrastre se traga.
- Cursor `grab` en el asa, `grabbing` en todo el documento mientras se arrastra (`body.hist-dragging`); filas sin `draggable`.
- Escape cancela el arrastre sin cerrar el editor; `pointercancel` y `lostpointercapture` también. ↑/↓ y Alt+↑/↓ sin cambios.
**RED con ratón real** (`evidence/S02/check-drag-mouse.mjs`, solo `Input.dispatchMouseEvent`/`dispatchKeyEvent`, coordenadas de `getBoundingClientRect()`; contra la base `d1fe76b`): **6 PASS / 12 FAIL de 18** (`RED-uifix-drag-mouse.txt`). Los fallos clave: arrastrar el asa o el nombre no cambia el orden (`["cpu_temp","cpu_power","gpu_temp","gpu_power"]`), no hay línea de destino, no hay cursor grabbing, Escape no limpia, 4 filas `draggable`. (Parte de los fallos posteriores del RED son en cascada: el orden nunca cambió.)
**GREEN:** `check-drag-mouse.mjs` **20/20** (asa, nombre, indicador y cursor durante el arrastre, Escape, soltar en fila desactivada / fuera, clic con temblor de 2 px en casilla y en nombre, clic en ↓, sin `draggable`, persistencia tras recargar). `check-editor2.mjs` ahora usa también ratón real en su sección C: 162/162. Unitario: `RED-uifix-pointer-unit.txt` 22 pass / 7 fail -> 29/29 (umbral, clic != arrastre, cancelar, coordenadas no finitas, destino por posición, flujo completo). Captura a mitad de arrastre: `evidence/S02/GREEN-uifix-arrastrando.png`.

## 3. Barra de estado vacía cuando todo va bien
`headerStatus` devuelve `key: null` en OK y `createHeaderView` escribe `''`; `#backend-state[data-level=ok]` queda **fuera del flujo (1 px), sin marcador**, así la hora y versión (`#backend-meta`) ocupan la izquierda de la barra y la región viva (`role=status`, `aria-live=polite`, `aria-atomic`) sigue en el DOM. Texto solo ante problema real: sin datos recientes, backend caído, reconectando, sensores parciales (cada uno con su aria-live y anuncio único). Se borra `status.ok` (8 lenguas). No hay otro «sensores OK»/«sensors OK» en cabecera ni pie (grep sobre el repo y aserción CDP en 8 idiomas).
**Decisión para el propietario:** «conectando con sensores…» se mantiene mientras no ha llegado la primera muestra (es transitorio y no es «OK»). Si prefiere vacío también ahí, es una línea (`connecting` con `key: null`). La hora/versión de `#backend-meta` se conserva (no es estado).
**RED:** `widget-status-view.test.js` 21 pass / 4 fail (`RED-uifix-statusbar-unit.txt`); `check-states.mjs` actualizado contra la base -> **150/156** (`RED-uifix-check-states.txt`: texto «Sensores OK», clave presente). **GREEN:** unitario 221/221; `check-states.mjs` **156/156** en 3 temas (`GREEN-uifix-check-states.txt`); captura `GREEN-uifix-ok-barra-vacia.png` (solo la zona izquierda de la barra).

## Gate final
- `node --test desktop/test/*.test.js` -> **221 pass, 0 fail** (base 215: -3 tests de expandir, +1 ausencia del estado, +7 de puntero, +1 de la barra).
- `node scripts/validate-i18n.mjs` -> OK, **1067 claves x 8** (1070 - chart.expand - chart.collapse - status.ok). `node scripts/check-docs.mjs` -> OK.
- e2e: `ROG_ELECTRON=... node scripts/e2e-smoke.mjs --out <scratch>/e2e` -> **31 pass, 0 fail**, 0 excepciones, 0 console.error.
- CDP versionados en PASS: `S01/check-bench`, `S01/check-tables`, `S02/check-editor2` (162/162), `S02/check-drag-mouse` (20/20), `S03/check-states` (156/156). `check-stale.mjs` no se ejecutó. Los check conservan el estilo que anula transiciones.
- `git diff --check` limpio en cada commit.
- `wc -l desktop/renderer/app.js`: **4055 -> 4054** (-1). `chart-editor-ui.js` 218 -> 196 líneas.

## Archivos fuera de la lista de dueño tocados (mínimos, necesarios)
`scripts/check-docs.mjs` (regla `readme-chart-editor` ya no pide «modal»; `changelog-known-limits` ya no pide «synthetic» porque ese límite se cerró) + `desktop/test/check-docs.test.js` (fixture), `CHANGELOG.md` (entrada Fixed, se quita el límite del arrastre sintético y la mención de expandir), `docs/roadmap.md` (mención de expandir). Sin cambios en `main.js`, `overlay.*` ni `src/`.

## Riesgos y rollback
Tres commits independientes, `git revert 2a1985b aab62fe e1986a6`. Las capturas `GREEN-modal-*` de S02-EDITOR quedan como historia de la función retirada. Las fichas S02-EDITOR / S03-STATES no se reescriben (describen su estado en su momento).
Límite: el arrastre automatizado usa el ratón real de CDP en Chromium/Electron; táctil y lápiz solo por el asa (sin prueba automatizada en táctil). Probar a mano con el ratón.

## Siguiente
Opus integrador: cherry-pick de los 3 commits, revisión, `STATUS`/`HANDOFF`; el propietario valida arrastre y barra a mano.
