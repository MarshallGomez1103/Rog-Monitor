# HANDOFF v19.0.0 — 2026-06-25

Launch-prep release. Three asks: command transparency, fix Diagnostics, finish P0/Launch.
Plus a dashboard layout fix.

## What shipped

### Command transparency (B)
- `desktop/renderer/commands.js` (new): registry of the 9 real `pkexec` commands with the
  literal command + `what` (per command) + `why` (4 shared reasons), all in 8 languages.
  Modal "Comandos del sistema". `window.openCommands` / `window.RogCommands`.
- Button `#commands-btn` in the AYUDA menu (`index.html`), wired in `app.js`, styled in
  `style.css` (`.cmd-*`).
- Literal command also surfaced in the Power confirm (`power.js`) and the SMART panel
  (`disks.js`).

### Diagnostics fix (A) — real root cause found
- `diagnostics.js` (global `const _t`) and `roadmap.js` (global `function _t`) **both
  declared `_t`** → the browser failed to parse `diagnostics.js` (loaded second) entirely,
  so nothing in it ran. Renamed diagnostics' helper to `_dt`. Also exposed
  `window.openDiag/closeDiag` and wired `#diag-btn` in `app.js` (proven path).

### Dashboard layout
- `dashboard.js`: rebalanced `DEFAULT_ORDER` (battery + disks under Lighting) to fill the
  bottom-left dead space, with a one-time `localStorage` migration so existing layouts pick
  it up.

### P0 / Launch (C)
- **AppImage**: `desktop/package.json` electron-builder `build` block + `npm run dist`;
  Python backend bundled as `extraResources`; `main.js` resolves paths from
  `process.resourcesPath` when `app.isPackaged`. `desktop/dist/` gitignored.
- **CI i18n**: `scripts/validate-i18n.mjs` (+ `dump()` hook in `i18n.js`) wired into
  `.github/workflows/ci.yml`. Fails on missing base lang / undefined `data-i18n` / missing
  command texts; warns on untranslated non-base langs.
- **Docs**: `docs/TRANSLATING.md` (new); CONTRIBUTING, README (AppImage + screenshots
  slots), SECURITY (transparency pointer + reporting section) updated.
- **Roadmap**: `docs/roadmap.md` and in-app `roadmap.js` marked P0 done as v19 (8 langs),
  TODO reduced to residuals.
- VERSION + `desktop/package.json` → 19.0.0; CHANGELOG entry.

## Known debt / pending (needs Marshall or GUI)
- **Translation debt**: `power` (360), `game-session` (264), `cores` (144) keys are es/en
  only and fall back. Run `node scripts/validate-i18n.mjs` for live counts. Not blocking.
- **Media**: README screenshots + GIF/video (needs GUI) → `assets/screenshots/`.
- **Flatpak**, **single polkit helper** (→ P1), **GitHub Pages** toggle.
- **Build/verify**: `cd desktop && npm install && npm run dist` on the real machine.

## Live-test checklist (Marshall)
1. Herramientas → **DIAGNÓSTICO** opens (the real fix).
2. AYUDA → **COMANDOS DEL SISTEMA** lists all commands in the active language.
3. Power confirm and SMART panel show the literal command.
4. Dashboard: no big empty gap bottom-left.
5. `npm run dist` produces a runnable AppImage.

Nothing pushed — Marshall pushes (AGENTS.md #1).
