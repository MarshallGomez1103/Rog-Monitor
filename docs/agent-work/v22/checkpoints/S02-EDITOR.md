# S02-EDITOR — cableado del editor de gráficas, aspecto, reordenar, expandir y Escape

**IDs:** N-A3-01 (cableado + aspecto) · N-A3-02 (reordenar ratón/teclado) · N-A3-03 (expandir) · F4-09 (corte editor)
**Agente:** Sonnet-ChartWiring (S02-2, worktree aislado) · **Base:** `2d22a2c` (feat/v22) · **Estado:** GREEN / TESTED; validación visual del propietario pendiente (OWNER-02)
**Commits (sin push):** `5d26598` cableado del modelo · `3c73a8e` aspecto + teclado/arrastre · `07ae761` expandir · `46167d6` Escape/foco · commit de ficha y evidencias (este).

## Archivos

| Archivo | Cambio |
|---|---|
| `desktop/renderer/chart-editor-model.js` (+ test) | `dropChart(list, key, targetKey)` y `dropDirection(list, key, targetKey)` (lógica pura del arrastre: destino inactivo/ausente/heredado no mueve; indicador `above`/`below`). Test del modelo 21 -> 24 (RED 3 fallos antes). |
| `desktop/renderer/chart-editor-ui.js` (**nuevo**, 218 líneas) | Capa de interfaz: pinta el editor, eventos (clic, teclado, arrastrar), modal ampliado, Escape/foco. Toda la lógica de lista sigue en el modelo. Se carga **después** de `app.js` (usa sus globales como `bench-detail.js`). |
| `desktop/renderer/app.js` | **4082 -> 4036 líneas (-46)**. Se borran `moveChart`, el cuerpo de `histCharts`, `renderHistEditor` y los handlers de `#hist-edit`/`#hist-editor`. Entran `CE`/`CHART_KEYS`, `drawHistChart` (compartido por tarjetas y modal), el botón expandir en la plantilla de la tarjeta y 2 ganchos (`RogChartEditorUI?.sync()` / `?.draw()`). |
| `desktop/renderer/index.html` | `chart-editor-model.js` antes de `app.js`, `chart-editor-ui.js` después; `#chart-modal` (role=dialog, aria-modal). |
| `desktop/renderer/style.css` | Sustituye `.hist-editor*` (1523-1531) por el editor nuevo; `.chart-head`, `.chart-expand`, `.modal-card.chart-modal-card`, `#chart-big`; `#chart-tip` z-index 25 -> 31 (sobre `.modal`). `extras.css` sin cambios. |
| `desktop/renderer/i18n.js` | ver claves abajo. |
| `desktop/test/charts.test.js` | quita los grab de `histCharts`/`moveChart`; sus casos viven en el test del modelo; añade contrato con el catálogo real (incluye `["constructor"]`) y comprueba orden de scripts. |
| `scripts/validate-i18n.mjs` | `run('chart-editor-model.js')` (app.js lo usa al cargar). |
| `docs/agent-work/v22/evidence/S02/` | `check-editor2.mjs`, `RED-`/`GREEN-check-editor2.txt`, capturas recortadas (sólo el bloque Historial o la tarjeta del modal: series de CPU/GPU, sin rutas ni hostname). |

## Aspecto (N-A3-01)
- Filas: asa ⋮⋮ (SVG, `aria-hidden`, fuera del Tab) · casilla **cuadrada** propia (`appearance:none`, borde con el acento, relleno `--accent` al marcar) · nombre (toda la fila-etiqueta es clicable, 36 px) · ↑ ↓ **SVG** de 30x30 (borde con acento, esquina cortada como `.ghost`).
- Sin recorrido: `aria-disabled="true"` (no `disabled`, no ocultas): mismo tamaño, color `mix(--dim 55 %, --ink)`, fondo plano y borde **discontinuo**; contraste >= 4.5:1 medido en 12 temas x 2 modos (en la 1ª versión `--dim` puro daba 4,20 en cyberpunk/oscuro y 4,26 en alba/oscuro). El `opacity: .3` de antes daba 2,2:1 (RED).
- Presets como segmento con título «Conjuntos», `aria-pressed` en el activo (ninguno si el orden es personalizado).
- `aria-label` de ↑/↓ con el nombre: «Subir «CPU · Temperatura °C»» (`{chart}`).

## N-A3-02 reordenar
- Ratón: DnD HTML5 nativo sobre las filas activas -> `CE.dropChart`; indicador de caída (línea arriba/abajo) con `CE.dropDirection`; soltar sobre una fila inactiva no cambia nada.
- Teclado: ↑/↓ y **Alt+↑/Alt+↓** con el foco en cualquier control de la fila. Tras cada re-render se re-enfoca el mismo control (clave + acto); ↑/↓ usan `CE.focusActAfterMove` (en el borde pasa al botón contrario). Región `aria-live` anuncia «posición n de total».
- Persistencia: `localStorage.histCharts`; recarga -> mismo orden, sin duplicados (comprobado tras arrastre y tras teclado, 3 temas).

## N-A3-03 expandir
- Botón (30x30, esquina superior derecha de cada tarjeta, `aria-label` «Ampliar «nombre»»). Abre `#chart-modal` (patrón `.modal` + `.modal-card.wide`, ancho `min(1500px, 94vw)`, canvas `clamp(240px, 56vh, 640px)`): su propio canvas `#chart-big`, dibujado por el bucle de `update()` con `drawHistChart` y con hover propio (crosshair + tip). Se redibuja al cambiar el tamaño.
- Escape, botón «Cerrar vista ampliada» o clic en el fondo cierran y devuelven el foco al botón de esa gráfica; Tab queda dentro del modal; si la gráfica se quita de la lista, `CE.reconcileExpanded` cierra el modal.
- Medido: 1280x720 canvas ~1157x403 dentro de la ventana; 1920x1080 canvas ~1454x605.

## F4-09 (corte editor)
Escape cierra el editor y enfoca `#hist-edit` (sólo con el foco dentro del editor o en el botón, y si no hay otro `.modal` abierto); al abrir, foco en el primer control; Tab/Shift+Tab recorren los 26 controles en el orden del DOM (sin `tabindex` positivo) y Shift+Tab desde el primero sale a `#hist-edit`. **No** se afirma F4-09 completo para los demás modales.

## i18n (8 idiomas, traducciones reales; 1029 -> **1034 claves x 8**)
Modificadas (texto): `chart.editor_hint` (menciona asa y Alt+↑/↓), `chart.move_up`, `chart.move_down` (ahora con `{chart}`). Nuevas: `chart.drag_title`, `chart.presets`, `chart.moved_to` (`{chart}`,`{n}`,`{total}`), `chart.expand` (`{chart}`), `chart.collapse`.

## RED (antes de tocar código; contra `git archive 2d22a2c`)
`ROG_APP_ROOT=<export de la base> OUT=<evidence/S02> TAG=RED node .ai/private/rog-v22/tools/cdp.mjs <ruta>/check-editor2.mjs`
- `check-editor2` -> **FAIL: 70 PASS / 173 FAIL de 243** (`RED-check-editor2.txt`). Sin `.chart-expand`, `#chart-modal`, asa, `aria-disabled`, `aria-pressed`, presets agrupados; casilla nativa; ↑/↓ con `disabled` + `opacity .3` (contraste 2,2:1) y `aria-label` sin nombre; sin Alt+flechas ni arrastre; Escape no cierra; Tab en orden distinto al visual.
- **Hallazgo A reproducido en la app real:** con `localStorage.histCharts = ["constructor"]` (y `["__proto__","toString"]`, etc.) la app no arranca (sin gráficas ni `lastStats`).
- Modelo: `node --test desktop/test/chart-editor-model.test.js` -> 21 pass / **3 fail** (`dropChart`, `dropChart` inactivo, `dropDirection`).

## GREEN
- `check-editor2` en neón/oscuro, magma/oscuro y magma/claro -> **PASS: 243 / 0 fallos** (`GREEN-check-editor2.txt`), incluido el barrido de contraste en 12 temas x 2 modos y el localStorage envenenado (`["constructor"]`, `["__proto__","toString"]`, `["constructor","ram_gb","hasOwnProperty"]`, `{"a":1}`).
- `node --test desktop/test/*.test.js`: **87/87**. `node scripts/validate-i18n.mjs`: OK, 1034 claves x 8 idiomas, 265 refs. `e2e-smoke`: **31 pass, 0 fail**, 0 excepciones, 0 console.error. `node --check` OK en app.js, UI, modelo, validador y check. `git diff --check` limpio en cada commit.
- `wc -l app.js`: 4082 -> **4036** (-46). `chart-editor-ui.js` +218, modelo +16.

## Limitaciones conocidas
- El arrastre automatizado usa `DragEvent` sintéticos con `DataTransfer` (el DnD nativo del SO no es automatizable de forma fiable por CDP): probar a mano con el ratón.
- HTML5 DnD no funciona en táctil: la alternativa son ↑/↓ y Alt+flechas (obligatoria y cubierta).
- Sin miniaturas en el editor (sugerencia del insumo, fuera del CP). El modal no añade series ni zoom.
- El modal usa el mismo `drawChart` (fuentes 11/13 px): ampliado, los rótulos del eje quedan pequeños respecto al área.

## Riesgos y rollback
- `app.js` requiere `chart-editor-model.js` antes (desestructura `window.RogChartEditor` al cargar); `validate-i18n` y `e2e-smoke` lo cubren. `chart-editor-ui.js` es opcional para el arranque (`?.`): sin él la app arranca pero sin editor/expandir.
- `#chart-tip` pasa a z-index 31: sólo hay tip con el cursor sobre una gráfica, y los modales 40-60 siguen por encima.
- Globales nuevos en `app.js`: `CE`, `CHART_KEYS`, `drawHistChart` (sin colisiones hoy).
- Rollback: `git revert 46167d6 07ae761 3c73a8e 5d26598` (en ese orden); los commits son acumulativos.

## Decisiones abiertas para el propietario
1. **Dónde va «expandir»:** hoy en la esquina de cada tarjeta (descubrible sin abrir el editor). Alternativa: también en cada fila del editor.
2. **Tamaño del modal:** `min(1500px, 94vw)` x `clamp(240px, 56vh, 640px)`. Si prefiere «a tamaño completo» en lugar de modal, es otra variante del mismo estado `{chartId}`.
3. **Flechas sin recorrido:** se ven (borde discontinuo, mismo tamaño). Alternativa: ocultarlas, a costa de que las filas «salten».
4. **Escape del editor:** sólo actúa con el foco dentro del editor o en `#hist-edit` (no secuestra Escape en el resto de la app).
5. **Archivo nuevo** `chart-editor-ui.js` (no estaba en la lista de archivos del encargo) para que `app.js` baje en vez de crecer; si se prefiere dentro de `app.js`, +~200 líneas.
6. Validación visual (OWNER-02): capturas en `evidence/S02/` (neón/oscuro, magma/oscuro, magma/claro; editor antes/después y modal 1280x720 y 1920x1080).

## Siguiente
Opus integrador: cherry-pick de los 5 commits, revisión, `STATUS`/`HANDOFF`. Siguiente CP del plan: S03 (A4 estados UX).
