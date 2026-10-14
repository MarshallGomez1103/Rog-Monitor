# N-A3-01 (parte modelo) — Modelo puro del editor de gráficas
Estado: READY-FOR-WIRING
Agente: Sonnet-Model (S02-1) | Base: feat/v22 (22171b7)
Objetivo: extraer de `desktop/renderer/app.js` la lógica de lista/orden/toggle/presets del editor a `desktop/renderer/chart-editor-model.js` (puro, sin DOM ni localStorage) y corregir el Hallazgo A.

## Hallazgo A (corregido en el modelo)
`histCharts` valida con `CHART_CATALOG[k]`: `"constructor"`, `"toString"`, `"__proto__"` (heredados de `Object.prototype`) pasan, y luego `setHistCharts` revienta con `TypeError` (`CHART_CATALOG[k][2]` no es un array de gráfica) al iniciar: un `localStorage.histCharts` envenenado tumba la app. El modelo valida contra un `Set` de claves propias (`Array` de claves u objeto con `Object.keys`), así que las heredadas nunca entran. Pruebas: `constructor`, `toString`, `__proto__`, `hasOwnProperty`, `valueOf`, `length`, como JSON y como array, en `normalizeChartList`, `toggleChart` y `toggleExpanded`.

## RED / GREEN
- RED: `node --test desktop/test/chart-editor-model.test.js` => `MODULE_NOT_FOUND` (módulo inexistente), 0 pass / 1 fail.
- GREEN: `node --test --experimental-test-coverage desktop/test/*.test.js` => 84 pass / 0 fail; `chart-editor-model.js` 100 % líneas, 91,89 % ramas, 100 % funciones. `node --check` OK en módulo y test.

## API (`window.RogChartEditor` / `module.exports`)
Ninguna función muta sus entradas; las listas devueltas son copias nuevas. `catalogKeys` = array de claves (`Object.keys(CHART_CATALOG)`) o el propio objeto-catálogo.

| Función | Contrato |
|---|---|
| `normalizeChartList(saved, catalogKeys, fallback)` | `saved`: JSON string, array u otro. Dedupe, descarta desconocidas/heredadas; corrupto o sin válidas => copia de `fallback`. |
| `toggleChart(list, key, catalogKeys)` | Quita si está; añade al final si no está y es del catálogo. La última activa no se quita; clave ajena no se añade (copia sin cambio). |
| `moveChart(list, key, dir)` | `dir` -1 / +1. Bordes, ausente o dir distinta => copia sin cambio. |
| `moveChartTo(list, key, index)` | Para arrastrar y soltar. `index` se trunca y se recorta a [0, n-1]; no numérico/NaN o ausente => sin cambio. |
| `canMoveChart(list, key, dir)` | boolean (false en bordes, ausente, dir inválida). |
| `editorRows(list, catalogKeys)` | `{key, on, index, canUp, canDown}[]`: activas en su orden y luego el resto del catálogo. Inactivas: `index -1`, `canUp/canDown` false. Ignora claves ajenas de `list`. |
| `presetOf(list, presets)` | `'temp'` / `'usage'` / `null` (orden exacto, propiedades propias). |
| `nextPresetList(list, presets)` | Copia de `presets.temp` si ahora es `usage`; si no, de `presets.usage` (el botón `#hist-mode`). |
| `focusActAfterMove(list, key, dir)` | `'up'` / `'down'` / `null`: el botón que seguirá habilitado tras el movimiento (el mismo si puede; si llegó al borde, el contrario). |
| `createExpandState()` | `{chartId: null}` congelado. |
| `toggleExpanded(state, chartId, catalogKeys)` | Misma id contrae; otra pasa a expandida; id no string, ajena/heredada o sin `catalogKeys` => estado sin cambio. **Tercer argumento obligatorio para validar** (la firma del encargo tenía 2). |
| `collapseExpanded()` / `isExpanded(state, chartId)` | Estado contraído / boolean. |
| `reconcileExpanded(state, list)` | Contrae si la gráfica expandida ya no está en la lista visible (llamar tras `setHistCharts`). |

## Qué líneas de `app.js` reemplazar (cableado, a cargo de Sonnet-ChartWiring)
Cargar el script antes de `app.js` en `index.html` (`<script src="chart-editor-model.js">`) y usar `const CE = window.RogChartEditor;`.

| app.js (base feat/v22) | Reemplazo |
|---|---|
| 656-663 `histCharts(saved)` | `CE.normalizeChartList(saved, Object.keys(CHART_CATALOG), HIST_PRESETS.temp)` (conserva el nombre como envoltorio de una línea). |
| 666-672 `moveChart` | `CE.moveChart` (borrar la función local). |
| 674 `histList = histCharts(lsGet(...) \|\| ...)` | sin cambio de forma; ya queda blindado por el punto anterior. |
| 684 y 2340 `isUsage` / `histList.join()===HIST_PRESETS.usage.join()` | `CE.presetOf(histList, HIST_PRESETS) === 'usage'` y, en el click de `#hist-mode`, `setHistCharts(CE.nextPresetList(histList, HIST_PRESETS))`. |
| 690-705 `renderHistEditor` (claves `[...histList, ...resto]`, `on`, `i`, disabled) | `CE.editorRows(histList, Object.keys(CHART_CATALOG))`; `disabled` de ↑/↓ = `!row.canUp` / `!row.canDown` (`row.on` ya incluido). |
| 2353-2357 toggle con guarda «al menos una» | `setHistCharts(CE.toggleChart(histList, key, Object.keys(CHART_CATALOG)))`; si el resultado no cambia (última activa) restaurar `el.checked = true`. |
| 2358-2359 `setHistCharts(moveChart(...))` + foco | `setHistCharts(CE.moveChart(histList, key, dir))`, y foco con `const act2 = CE.focusActAfterMove(histList, key, dir)` calculado ANTES del movimiento (sobre la lista previa) -> `querySelector('[data-key="..."] [data-act="'+act2+'"]')?.focus()`; resuelve el foco perdido en el borde. |
| Nuevo (N-A3-02/03) | arrastre: `CE.moveChartTo(histList, key, dropIndex)`; expandir: estado `CE.createExpandState()`, `CE.toggleExpanded(st, id, keys)`, `CE.reconcileExpanded(st, histList)`. |

Nota para el cableador: `focusActAfterMove` toma la lista de ANTES de mover y devuelve el botón correcto para la fila tras re-renderizar (la fila conserva `data-key`).

## Criterios de aceptación
[x] RED anotado [x] GREEN 84/84 [x] módulo >= 95 % líneas (100 %) [x] Hallazgo A con pruebas [x] solo 3 archivos tocados (módulo, test, ficha) [x] sin DOM/localStorage (test lo verifica sobre el código sin comentarios)
Riesgos y rollback: archivos nuevos sin consumidores; revertir el commit no afecta a la app.
Limitaciones: no cableado todavía; `app.js`, `index.html`, `i18n.js`, CSS y `charts.test.js` intactos.
Siguiente: Sonnet-ChartWiring (cableado) -> N-A3-02.
