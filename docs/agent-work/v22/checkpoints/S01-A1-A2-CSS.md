# S01 — A1 + A2 (parte CSS): tarjetas de benchmark y 3 tablas de procesos

**IDs:** N-A1-01 · N-A1-02 (solo parte CSS) · N-A2-02
**Agente:** Sonnet-Visual (worktree aislado) · **Base HEAD:** `32c35b6` (feat/v22) · **Estado:** GREEN / TESTED (CDP + suites); validación visual del propietario pendiente (OWNER-02)
**Commits:** `1f4636a` (N-A1-01) · `df36fb5` (N-A1-02 css) · `82df1da` (N-A2-02). Sin push.

## Archivos y líneas (dueño único en esta tanda)

| Archivo | Cambio |
|---|---|
| `desktop/renderer/styles/extras.css` | `.bench-history` (l.11-27, comentario corregido + padding), `.bench-card` `flex-shrink:0` (l.32-), `.bench-history > .dim`, `.bench-card-header` padding, `.bench-card-expand` (l.95-109), `.bench-card-delete` (l.113-), `#allprocs` reducido a lo propio (sticky + anchos) |
| `desktop/renderer/style.css` | se eliminan `.bench-history`, `li`, `li b`, `li span`, `li.dim` (antes l.1110-1135); nueva regla compartida `.proc-table` (l.~1160-1215) que sustituye a `#procs*` y al bloque v17-D de `#ram-procs`; `#ram-procs` sale del bloque combinado con `#vram-procs` (éste conserva sus reglas) |
| `desktop/renderer/styles/neon.css` | se eliminan `html[data-mode] .bench-history li` (l.451-457) que anulaban el glow hover de la tarjeta |
| `desktop/renderer/index.html` | solo `class="proc-table"` en `#procs`, `#ram-procs`, `#allprocs` |

No se tocó `app.js`, `main.js`, `i18n.js`, `src/` ni se creó `procs-table.js`.

## Causa raíz confirmada

- **Recorte (A1):** `.bench-history` es flex-column con `max-height:340px`; `.bench-card` tiene `overflow:hidden` y no `flex-shrink:0`, así que cada tarjeta se aplastaba a ~36 px (`scrollHeight 142 > clientHeight 34`) y la lista nunca scrolleaba (`scrollHeight == clientHeight`).
- **Conflicto de especificidad:** `style.css` `.bench-history li span{color:var(--dim)}` (0,1,2) pisaba `.bench-card-expand/-kind/-when`; `li{border,padding,background,font-size}` pisaba `.bench-card`; `neon.css` `.bench-history li{box-shadow}` pisaba el glow hover. Se resolvió eliminando las reglas pisadoras (una sola fuente de verdad: extras.css), no subiendo especificidad.
- **Tablas (A2):** tres definiciones independientes (13.5 / 13 / 13.5 px; th 600 vs 700, 10.5 vs 10.56 px, padding 0 6 6 vs 8 9.6; td.mem dim / dim / ink; PID; `.procs-core` 10.9 px gris sin resaltar en `#allprocs`).

## RED (antes de tocar CSS)

Herramienta: `docs/agent-work/v22/evidence/S01/check-bench.mjs` y `check-tables.mjs` (arnés `cdp.mjs` privado, `ROG_APP_ROOT=<worktree>`).

```
ROG_APP_ROOT=<worktree> OUT=<dir> node .ai/private/rog-v22/tools/cdp.mjs <ruta>/check-bench.mjs
ROG_APP_ROOT=<worktree> OUT=<dir> node .ai/private/rog-v22/tools/cdp.mjs <ruta>/check-tables.mjs
```

- `check-bench` → **RESULT: FAIL (23)** (`evidence/S01/RED-check-bench.txt`): 8 tarjetas de 36 px recortadas (`142>34`) en los 3 temas, lista sin scroll, expand `opacity .45 / .62rem / contraste 2.14-2.18`, mín. 12 temas x 2 modos: **1,91 (neon/light)**, `when` mín. 2,95; delete 19,9x18,6 px.
- `check-tables` → **RESULT: FAIL (300)** (`RED-check-tables.txt`): 210 diferencias entre tablas + 90 expectativas absolutas (td.mem dim vs ink, font-size 13 vs 13.5, th peso/tamaño/padding, `.procs-core` sin heredar color/tamaño en `#allprocs`).

## GREEN (estado HEAD `82df1da`)

- `check-bench` → **RESULT: PASS (0 fallos)**, 30 comprobaciones `ok` (`GREEN-check-bench.txt`): 8 tarjetas de 126 px sin recorte, `.bench-history` scrollea (`scrollHeight 1074 > 340`), expand `opacity .9 / .72rem`, delete 28x28, foco visible.
- `check-tables` → **RESULT: PASS (0 diferencias, 0 expectativas fallidas)** en 3 temas x 4 órdenes (cpu, cpu_core, mem_mb, name) x 3 tablas (`GREEN-check-tables.txt`). Sólo clicks en `<th>`.
- `node --test desktop/test/*.test.js` → 50 pass / 0 fail.
- `node scripts/validate-i18n.mjs` → OK, 1026 claves x 8 idiomas.
- `ROG_ELECTRON=... node scripts/e2e-smoke.mjs --out <scratch>/e2e` → **31 pass, 0 fail**, 0 excepciones, 0 console.error.
- `git diff --check` limpio antes de cada commit.

## Contraste medido (texto compuesto con opacidad sobre el fondo real, WCAG)

| Elemento | RED neon/dark · magma/dark · magma/light | GREEN neon/dark · magma/dark · magma/light | Mín. 12 temas x 2 modos GREEN |
|---|---|---|---|
| `.bench-card-expand` | 2,16 · 2,14 · 2,18 (mín. 1,91 neon/light) | 10,05 · 6,30 · 8,58 | **5,68** (neon-nights/dark) |
| `.bench-card-when` | 3,43 · 3,39 · 3,73 (mín. 2,95) | 7,68 · 7,61 · 7,22 | 6,64 (oceano/light) |
| `.bench-card-delete` | 5,65 · 5,54 · 7,67 | 6,09 · 5,99 · 9,12 | 5,08 (alba/dark) |

Hit target delete: 19,9x18,6 → **28x28**. Foco: anillo global de `a11y.css` (2 px, offset -2) visible tras pulsación de teclado real.

## Capturas (`evidence/S01/`)

`bench-RED-{neon-dark,magma-dark,magma-light}.png` y `bench-GREEN-*.png` (8 tarjetas inyectadas con datos sintéticos; sin nombres de usuario/hostname/rutas). **No se versionan capturas de las tablas** porque muestran la lista real de procesos del usuario (apps instaladas); se regeneran con `check-tables.mjs`.

## Decisiones de diseño y notas

- PID se mantiene a 12 px (igual en las 3 tablas; la petición hablaba de 13.5 px para el resto de numéricos).
- th unificados: 600 / 10.5 px / 1 px de espaciado / padding `4px 6px 6px`. En el dashboard la cabecera gana 4 px de alto (la lista de filas se reajusta sola con `fitProcsRows`). `#allprocs` pasa de 13 → 13.5 px y td de 4 → 5 px: la lista larga es algo más alta.
- `#vram-procs` NO se unifica (no es ordenable, mem siempre neón) y conserva sus reglas.
- `.bench-card-expand` usa `color-mix(accent 65%, ink)` en lugar de `--accent` puro: se eligió por margen: acento puro sobre `--panel` no se midió pero el color real tras el mix da mín. 5,68:1; así AA no depende de cada acento de tema.

## Riesgos

- Cambio de apariencia en 12 temas: sólo se midieron por script 24 combinaciones de contraste y capturas de 3 temas; el propietario valida el aspecto (OWNER-02).
- Las tarjetas ya no heredan `border-left:3px` / `padding` / `background:var(--chip)` de `.bench-history li`: ahora se ven como diseñó extras.css (borde acento fino con glow). Es el cambio visible esperado.
- Si algún otro módulo inyecta `<li>` dentro de `#bench-history` sin clase `bench-card`, ya no heredará el estilo de caja antiguo (grep: sólo `app.js` y el placeholder `.dim`/`.bench-empty`).
- Para correr CDP en un worktree hace falta enlazar `.venv` (el HOME aislado oculta `~/.local`); es un symlink sin trackear, no se versiona.

## Pendiente para otros dueños (no hecho aquí)

- **app.js (Sonnet-Wiring):** `aria-label` del botón borrar (hoy sólo `title`); `EXPAND` como `<button type="button">` (hoy `<span>`, no enfocable por teclado) con aria-expanded/labelledby; confirmación o deshacer al borrar un resultado; tecla Enter/Espacio en la tarjeta. El CSS de `.bench-card-expand` ya está listo para un `<button>` salvo `background:none;border:0;font:inherit` (añadir cuando exista).
- **i18n (Sonnet-I18N):** claves `bench.delete_one` (aria/title), `bench.expand`, nuevo `bench.undo_delete` / toast de deshacer en los 8 idiomas.
- **N-A2-01 (Sonnet-Logic/Wiring):** el modelo `procs-table.js` puede apoyarse en `table.proc-table[data-sort-col]`; ya no hay reglas por id que mantener.

## Rollback

`git revert 82df1da df36fb5 1f4636a` (independientes entre sí salvo que N-A1-02 parte de las clases de N-A1-01; revertir en orden inverso).

## SHAs / aprobación / siguiente

SHAs: `1f4636a`, `df36fb5`, `82df1da` (+ commit de ficha/evidencia). Aprobación: pendiente de Opus integrador. Siguiente: N-A2-01 (modelo + wiring) y N-A1-02 parte JS/i18n.
