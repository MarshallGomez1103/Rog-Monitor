# S01-WIRING — cableado de tablas de procesos y JS/i18n de las tarjetas de benchmark

**IDs:** N-A2-01 (cableado, cierra el CP) · N-A1-02 (parte JS/i18n, cierra el CP)
**Agente:** Sonnet-Wiring (worktree aislado) · **Base:** `1f9f53d` (feat/v22) · **Estado:** GREEN / TESTED; validación visual del propietario pendiente (OWNER-02)
**Commits (sin push):** `7394cc5` (N-A2-01 cableado) · `f09bad8` (N-A1-02 JS+i18n) · commit de ficha/evidencias (este).

## Archivos

| Archivo | Cambio |
|---|---|
| `desktop/renderer/app.js` | 4128 -> **4082 líneas (-46)**. Se borran `PROC_COL_CLASS`, `sortProcRows`, `procsSortKey/Dir`, `ramSortKey/Dir`, los 3 `update*SortIndicators` y los 3 bloques if/else de toggle. Entran `applySortIndicators(table, state)` (única), `procsSort`/`ramSort`/`sort` con `createSortState`, `toggleSort`, `sortRows`, `colClass`, `formatMem`. `toast(msg, kind, action)` admite acción opcional; `deleteBenchmarkItem` con deshacer; tarjeta con `<button>`. |
| `desktop/renderer/index.html` | `<script src="procs-table.js">` antes de `app.js`; `#toast` con `role="status" aria-live="polite"` |
| `desktop/renderer/i18n.js` | 3 claves nuevas x 8 idiomas |
| `desktop/renderer/styles/extras.css` | `.bench-card-expand` (reset `background/border/padding/font-family`, `cursor:pointer`) y `#toast .toast-action` |
| `scripts/validate-i18n.mjs` | carga `procs-table.js` antes de los módulos (app.js lo desestructura al cargar; sin esto el validador abortaba app.js a mitad y perdía claves) |
| `docs/agent-work/v22/evidence/S01/` | `check-tables.mjs` y `check-bench.mjs` ampliados + salidas `*-wiring-*.txt` + `bench-toast-undo.png` (sólo fixtures sintéticos) |

`firmas` de `escapeHtml`/helpers de gráficas usadas por `charts.test.js` y `escape.test.js` intactas.

## N-A2-01 cableado
- Las 3 tablas usan un solo modelo; `applySortIndicators` pone `sort-active`, `data-dir` y `aria-sort` (`ascending|descending|none`).
- Cambios intencionales aceptados de la ficha N-A2-01: nulos al final también en asc, `name` nulo = `''`, memoria no numérica = `—`.
- Comportamiento visual idéntico: `check-tables` 0 diferencias entre tablas en 3 temas x 4 órdenes.

## N-A1-02 JS/i18n
- EXPAND: `<button type="button" class="bench-card-expand" aria-label=…>` con el mismo aspecto (medido: sin fondo ni borde, fuente heredada, opacity .9). El `aria-label` empieza por la palabra visible (label-in-name) e incluye tipo y fecha, así que es distinto por tarjeta.
- Borrar: `aria-label` traducido (distinto por tarjeta) además del `title`.
- Borrar ya no es definitivo al instante: toast de 6 s con botón **Deshacer** que restaura el resultado en su posición original (memoria y `localStorage`). Por teclado (`e.detail === 0`) el foco pasa al botón Deshacer.
- Teclado: la tarjeta (`li`) no es un segundo punto de tabulación; el punto de entrada es el botón EXPAND (Enter y Espacio abren el detalle, verificado con teclas reales por CDP). Decisión: dos paradas de Tab para la misma acción sería peor para lectores de pantalla. Si el propietario prefiere `li tabindex=0`, es un cambio de 3 líneas.
- Claves nuevas (8 idiomas, traducciones reales): `bench.expand_aria`, `bench.delete_aria` (con `{kind}`/`{when}`), `toast.undo`. Reusa `toast.bench_cleared` como mensaje.
- validate-i18n: 1026 -> **1029 claves x 8 idiomas**.

## RED (antes de tocar app.js)
Comandos: `ROG_APP_ROOT=<worktree> OUT=<dir> node .ai/private/rog-v22/tools/cdp.mjs <ruta>/check-{bench,tables}.mjs`.
- `check-tables` -> **FAIL (165)**: 138 `aria-sort` ausente/incorrecto en th, 27 por toggle (`RED-wiring-check-tables.txt`).
- `check-bench` -> **FAIL (14)**: EXPAND es SPAN sin aria-label, delete sin aria-label (1 etiqueta distinta), sin acción en el toast, no restaura, Enter/Espacio no abren, botones por tarjeta sólo delete (`RED-wiring-check-bench.txt`).

## GREEN
- `check-tables` -> **PASS (0)**; `check-bench` -> **PASS (0 fallos)**, incluidas las comprobaciones previas de S01-A1 (contrastes, recorte, scroll, hit target) y las nuevas: button/aria-label, look conservado, 8 aria-label distintos, toast con Deshacer, restauración en posición y en `localStorage`, ventana ~6 s (4,5 s sigue / 7 s ya no), foco a Deshacer por teclado, Enter/Espacio en EXPAND (`GREEN-wiring-*.txt`). Ejecutado 3 veces sin flakes tras ajustar los tiempos del test.
- `node --test desktop/test/*.test.js`: 63/63.
- `node scripts/validate-i18n.mjs`: OK, 1029 claves x 8 idiomas.
- e2e-smoke: **31 pass, 0 fail**, 0 excepciones, 0 console.error.
- `node --check desktop/renderer/app.js` OK; `git diff --check` limpio.

## Riesgos
- `app.js` ahora requiere que `procs-table.js` esté cargado antes (desestructura `window.RogProcsTable` al cargar); si se reordena `index.html` fallaría de forma visible. `validate-i18n.mjs` ya lo contempla; `e2e-smoke` lo cubre.
- Los nombres globales `createSortState`, `toggleSort`, `sortRows`, `colClass`, `headerState`, `formatMem`, `applySortIndicators` ya no pueden redeclararse en otros scripts clásicos (verificado: sin colisiones hoy).
- Posición de restauración al deshacer: índice original acotado a la longitud actual (si entre tanto entra un benchmark nuevo, vuelve cerca de su sitio, no exacto).
- Si el propietario no oye/ve el toast en 6 s lo pierde (es el límite acordado); `aria-live` lo anuncia a lectores de pantalla.
- Apariencia: sólo se midió en 3 temas por script; OWNER-02 pendiente.

## Rollback
`git revert <SHA ficha> f09bad8 7394cc5` (en orden inverso). Independientes entre sí salvo que ambos tocan `app.js`/`index.html`.

## Siguiente
Opus integrador: cherry-pick, revisión, STATUS/HANDOFF. Pendientes S01: validación visual del propietario (OWNER-02).
