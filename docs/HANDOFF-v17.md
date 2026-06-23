# HANDOFF v17 — pulido pre-lanzamiento (build multiagente)

Base: `db08249` (v16.0.0). 6 worktrees `v17-a..f` en `../rog-v17-wt/`, ramas `v17-a..f`.
**No push** (lo hace Marshall).

## ESTADO: ✅ CONSOLIDADO EN master (v17.0.0) — falta solo la prueba viva de Marshall
- A→C→E→B→D mergeados en master sin conflictos; F ejecutado directo en master.
- `/ponytail` aplicado; bump v17.0.0 en los 3 sitios; worktrees eliminados.
- **No pusheado** (lo hace Marshall) y **sin prueba en pantalla** (la hace Marshall).
- Orden de merge usado: A → C → E → B → D (auto-merge limpio) → F (roadmap+versión).

## A — Estabilidad/perf (P0) 🔴  [v17-a · 1fb7d74] ✅
- [x] Freeze: causa raíz = race SIGCONT al restaurar (KDE/Wayland, eventos restore/show/focus
      desordenados → mainVisible queda false → backend congelado). Watchdog 5s fuerza SIGCONT y
      respawnea si sigue mudo. (main.js, preload.js, app.js)
- [x] Estado "reconectando…" via IPC backend-reconnecting
- [x] procs.py read() con signal.alarm(1) anti-cuelgue /proc + self-check __main__
- [x] Resume backend tras salir/reentrar (reset lastStatsAt en SIGCONT)
- [x] Histories acotadas confirmadas (deque). Nota: top_memory() sin guard SIGALRM = ponytail debt

## B — Modales/toasts/auth  [v17-b · cec5999] ✅
- [x] Confirm encima del backdrop: clase `.modal-top` z-index 60 (toast z-index 90)
- [x] Toasts ok/warn/err (`toast(msg, kind)`, default ok; powerToast pasa kind)
- [x] Pre-confirm temática única antes de pkexec (lista valores + aviso contraseña firmware)
- [x] Save&Apply / Close misma fila (alerts + maintenance → `.confirm-actions`)

## C — Nav/Config/idioma  [v17-c · 7d4c67d] ✅
- [x] CONFIG tab de primer nivel (1 clic)
- [x] 🌐 idioma siempre visible; ELIMINADO duplicado #config-lang-grid (fuente única #lang-modal)
- [x] Flecha colapsar nav + localStorage (`initNavCollapse`)
- [x] TOOLS reordenado (PODER › ALERTAS › OVERLAY); maintenance footer ya estaba bien
- [x] Report bug: cuerpo limpio (markdown + system info)

## D — Widgets/interacciones  [v17-d · d107b1b] ✅
- [x] Power profiles: transición slide + tooltips por botón (tip.profile_*)
- [x] Fans grab-to-pause (`_fanGrabbed`, mousedown/mouseup)
- [x] Cores hover → tooltip absoluto (sin reflow); overflow visible
- [x] Quitar "Live": lámpara sin blink + cd-pulse eliminado
- [x] VRAM (i) modos C/G/CG (tip.vram_modes, 8 langs)
- [x] RAM ordenable (renderRamProcs reusa sortProcRows; modal.ram_sort_*)
- [x] Overlay null-guards (window.rog)
- Nuevas claves i18n (8 langs): tip.profile_saver/balanced/perf, tip.vram_modes,
  modal.ram_sort_pid/name/mem

## E — Layout/zoom  [v17-e · 536906e] ✅
- [x] Void rosa = radial Neon Nights `::after` al estirarse aura-block → `main{align-items:start}`
      + quitado `.col > :last-child{flex:1 0 auto}`. ⚠ no re-añadir ese flex ni align-items:stretch.
- [x] Caja teclado infinita: `#peripherals{max-height:220px;overflow-y:auto}`
- [x] Reflow zoom (CSS-only en style.css)

## F — Roadmap/i18n/versiones/README/seguridad  [ejecutado en master] ✅
- [x] Roadmap 100% 8 idiomas: 115 strings sueltos (9 features + 16 títulos + 90 puntos) → mapas
      {es..ko}; ROADMAP_TODO ya estaba traducido. Auditado: 0 strings sueltos en DONE.
- [x] v3/v4 ya documentado (nota "iteraciones internas" v5). Bump v17.0.0 en package.json +
      roadmap.js (ROADMAP_CURRENT.version) + CHANGELOG. Hito v17 añadido a ROADMAP_DONE.
- [x] README: bloque "Seguridad de un vistazo" (sintetiza SECURITY.md); one-liners ya existían y
      verificados (install.sh/uninstall.sh presentes).
- [x] Roadmap competitivo + charge limit/battery health: ya presentes en ROADMAP_TODO (8 idiomas).

## Consolidación (Opus) ✅
- [x] Merge A→C→E→B→D en master + F directo; sin conflictos; sin duplicados de función/selector.
- [x] /ponytail: procs.py top_memory() ahora bajo guard SIGALRM (contextmanager `_scan_alarm`
      deduplica read()+top_memory); quitadas refs muertas `animation: blink` en neon.css (el
      @keyframes ya no existía → el "Live" no titilaba pero quedaba código colgante).
- [x] Bump v17.0.0 coherente en package.json + roadmap.js + CHANGELOG.
- [x] Validación CI-equivalente: node --check (todo JS) + py_compile + self-check procs.py OK.
- [ ] PRUEBA VIVA EN PANTALLA → **Marshall** (start.sh: sin freeze al minimizar/restaurar y salir/reentrar).
- [x] Worktrees eliminados; solo queda master.
