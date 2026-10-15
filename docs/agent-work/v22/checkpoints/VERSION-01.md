# VERSION-01 — versión 22.0.0, una sola fuente y visible solo en Ayuda > Acerca de (V22-D10)

**Agente:** Sonnet-Version (worktree aislado) · **Base:** `5eb8899` (feat/v22) · **Estado:** GREEN / TESTED, sin push
**Commits:** `15188f3` script + tests · `5d36cd0` quitar literales y versión de la UI · `6eeff6d` bump 22.0.0 · (esta ficha).

## Cómo subir de versión
```
node scripts/bump-version.mjs X.Y.Z          # escribe VERSION, desktop/package.json, desktop/package-lock.json (raíz y packages[""])
node scripts/bump-version.mjs X.Y.Z --dry-run # no escribe
node scripts/bump-version.mjs --check         # exit 1 si alguna copia difiere de VERSION
```
El script edita solo la línea `"version"` (1 línea en package.json, 2 en el lock; no reformatea el JSON) y verifica el
resultado antes de escribir. Checklist manual que imprime (el script no inventa texto):
1. `CHANGELOG.md`: encabezado `## X.Y.Z — AAAA-MM-DD` (`scripts/check-docs.mjs` exige que coincida con `VERSION`; la sección debe cumplir las reglas del Changelog).
2. `desktop/renderer/roadmap.js`: nueva entrada `vX.Y.Z` al final de `ROADMAP_DONE`, 8 idiomas (un test exige que la última sea `v` + `VERSION`).
3. `docs/roadmap.md`: `## Current (done) — through vN` (mayor) y la lista de lo nuevo.
4. `README.md`: nota de actualización si cambian scripts root (la app pedirá reinstalar porque `VERSION` cambia).
5. `node scripts/bump-version.mjs --check && node --test desktop/test/*.test.js`.
6. `sudo bash scripts/install-system.sh` (copia `VERSION` al helper root; sin ello la app dice «necesita reinstalar»).

## Qué cambió
- **Fuente única `VERSION`.** Lectores: `src/rog_monitor/__init__.py` (sin `ROG_MONITOR_VERSION`), `desktop/main.js` `readVersion()` (solo `VERSION`; sin `ROG_MONITOR_VERSION` ni fallback a `package.json`; el AppImage ya lo lleva en `extraResources`), `export-config` usa `APP_VERSION`, IPC `app-info`, informe de error (`stats.version`, se mantiene), cabecera de la TUI (se mantiene), `priv.js` (compara con la copia root).
- **Copias literales que quedan** (las comprueba `--check` y los tests): `package.json`, `package-lock.json` (2 campos), última entrada del historial en `roadmap.js`, primera versión publicada del CHANGELOG, `through vN` de `docs/roadmap.md`. Borradas: `ROADMAP_CURRENT.version` y su comentario de sincronía.
- **UI: la versión solo en Ayuda > Acerca de.** Nuevo botón `ACERCA DE` en el menú Ayuda y modal `#about-modal`: «ROG Monitor 22.0.0 · núcleo 22.0.0» + «Carpeta: …» (8 idiomas, `about.*`, `topbar.about`, `tip.about`; se cierra con botón, clic fuera y Escape; se repinta al cambiar de idioma). Quitada del pie (`#versions` eliminado: la carpeta pasó al modal), de `#backend-meta` (ya solo la hora) y del pill del roadmap (solo la etiqueta). Nota: el historial del roadmap (modal) sigue listando sus entradas `v22.0.0`, `v21.0.0`… porque es el registro de cambios, no «la versión de la app».
- **CHANGELOG** `## 22.0.0 — 2026-10-14`; **check-docs** parametrizado (`releaseSection(changelog, version)`, regla `changelog-current`); roadmap «v22 (dev)» -> `v22.0.0`, línea de v22 en `ROADMAP_CURRENT` (8 idiomas), `docs/roadmap.md` «Done — v22.0.0».
- **Efecto deseado:** al subir `VERSION` a 22.0.0 la app pide reinstalar los scripts root (`priv.js` compara con `/usr/local/libexec/rog-monitor/VERSION`). No se tocó la rama `check_version=False` de `power_control.py`. El propietario debe ejecutar `sudo bash scripts/install-system.sh` una vez.

## Evidencia
- **RED:** `node --test desktop/test/version.test.js` sin el script -> `ERR_MODULE_NOT_FOUND` (todo el archivo); `tests/test_version.py` -> 2 fallos (`ROG_MONITOR_VERSION` en `__init__.py`); guardias de `main.js`/`ROADMAP_CURRENT` -> 2 fallos; `check-docs.test.js` -> 4 fallos (`releaseSection`/`changelog-current`); `roadmap.test.js` -> 14 fallos (sección «Done — v22.0.0», última entrada = `VERSION`); formato: «cambia solo la línea de versión» falló con `JSON.stringify` (reformateaba `files: [...]`). CDP `evidence/VERSION/check-version-visible.mjs` contra la base: **0/21** (`RED-version-visible-base.txt`: «core v21.0.0 · hora» en `#backend-meta`, «ROG Monitor v21.0.0 · ruta» en el pie).
- **GREEN:** `node --test desktop/test/*.test.js` **236 pass / 0 fail**; `validate-i18n` OK (1072 claves × 8); `check-docs` OK (36 reglas); `bump-version --check` OK; Python **1009 tests OK**, cobertura **95,20 %**; e2e `31 pass, 0 fail, 0 exceptions, 0 console.error`; CDP S03 `check-states.mjs` **156/156**; CDP `check-version-visible.mjs` **21/21** (`GREEN-version-visible.txt`): con todos los modales cerrados 0 apariciones de `22.0.0` en `document.body.innerText`, con Acerca de abierto 1 línea (y menú Ayuda abierto sin entrar: 0), 8 idiomas, cierre con botón y Escape, pill del roadmap sin versión.
- `S03/check-states.mjs` no comprobaba «core v» (solo recorta `#backend-state|#backend-meta`); su comentario sobre `#versions` quedó obsoleto pero no afecta.

## Pendiente / decisión del propietario
- `sudo bash scripts/install-system.sh` (ahora la app lo pedirá). La validación visual de Acerca de es suya.
- Si prefiere que la versión salga también en otro sitio (p. ej. título de ventana), es una línea.
