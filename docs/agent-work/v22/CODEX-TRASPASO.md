# Traspaso Claude → Codex (ROG Monitor v22)

Fecha: 2026-10-15 · Rama: `feat/v22` · HEAD al escribir: `e8d4ce6` (CI remoto verde) · VERSION: **22.0.0**
Autor: Claude (Opus, integrador). Lee esto entero antes de tocar código; después sigue `~/.codex/PLAYBOOK.md` y el `AGENTS.md` local.

## 0. Arranque (cada sesión, también tras un corte)
```bash
cd ~/MyFiles/Dev/Rog-Monitor
git status --short --branch && git log --oneline -5
sed -n 1,25p docs/agent-work/v22/HANDOFF.md
sed -n 1,60p docs/agent-work/v22/STATUS.md
```
Lectura obligatoria: `docs/agent-work/v22/PLAN-SIGUIENTE.md` (plan vigente S00–S18), `DECISIONS.md` (V22-D1..D14), `RISKS.md`, `docs/adr/0005`, `0006`, `0007`, y la ficha del CP que vayas a tocar en `checkpoints/`.
`AGENTS.md` y `CLAUDE.md` están en `.gitignore`: existen solo en este checkout (no en worktrees ni en GitHub).

## 1. Dónde está el proyecto
| Etapa | Estado | Ficha |
|---|---|---|
| S00 reconciliación/baseline | ACCEPTED | S00-BASE.md, F2-01.md |
| S01 tarjetas de benchmark + 3 tablas de procesos | TESTED | S01-A1-A2-CSS.md, S01-WIRING.md |
| S02 editor de gráficas (↑↓, Alt+↑↓, arrastre con Pointer Events) | TESTED; "ampliar" retirado (V22-D8) | S02-EDITOR.md, UIFIX-01.md |
| S03 estados vacío/carga/error/no soportado/stale | TESTED; textos aprobados (V22-D9) | N-A4-01/02, N-DEF-02, S03-STATES.md |
| S04–S06 cobertura Python | **95,2 %**, piso CI **80** | ver STATUS tandas 1–2 |
| S07 README, roadmap doble, CHANGELOG | TESTED (check-docs en CI) | N-C-01-04.md, N-C-02-03.md |
| Versión única 22.0.0 | TESTED | VERSION-01.md |
| S08 extracción modular | **EN CURSO**: hechos charts-catalog.js, fan-curve-model.js (app.js 4066→3886), backend-bridge.js (main.js 1845→1736) | F3-01.md, F3-02.md, F3-03-F3-04.md |
| S10 overlay: spike medido + ADR-0007 | TESTED; ADR-0007 **accepted** | F6-01-F6-02.md |
| S11 + S11b overlay (botón, XWayland A2, monitor/anclaje, estilo MangoHud, S/M/L/XL, métricas elegibles, modo juego) | **TESTED, terminado** (2026-10-16). S12 = solo validación del propietario con juegos (OWNER-03) | S11-OVERLAY.md, S11b-OVERLAY-V2.md |
| S09, S13–S18 (y lo pendiente de S08) | TODO — cola de Codex (§2) | PLAN-SIGUIENTE.md |

Números verificados (2026-10-15): Python 1009+ tests, cobertura 95,2 %; Node 302 tests (≥99 % líneas, piso 90); i18n 1072 claves × 8 idiomas; e2e 31/31; CDP S01/S02/S03 PASS.

## 2. Reparto
**Overlay: TERMINADO** (S10, S11, S11b; ADR-0007 accepted). Solo queda que Marshall lo valide con juegos reales (OWNER-03, pasos en `checkpoints/S11b-OVERLAY-V2.md`). No es trabajo de Codex salvo que Marshall reporte un bug concreto; en ese caso, TDD como siempre y sin reescribir el diseño (`desktop/overlay-window.js`, `desktop/mangohud-block.js`, `desktop/renderer/overlay*.js`, `overlay.html`, `styles/overlay-ui.css`).

**Para Codex — cola priorizada** (cada uno: RED primero, ficha `checkpoints/<ID>.md`, línea en STATUS, HANDOFF al día):
1. **S09 — schema 2 con deltas (F2-08 gate, N-F2-SCHEMA-01/02, F2-10, N-F2-PERF-01).** Protocolo Python (`src/rog_monitor/app.py` + módulo nuevo `telemetry_protocol.py`) y consumidor JS (el parser ya vive en `desktop/backend-bridge.js`). Compatibilidad `schema:1` obligatoria; fixture `tests/fixtures/snapshot-v1.json` sin `ts` ni `ram_gb/swap_gb/gpu_util` (N-DEF-05). Medir bytes/tick antes y después.
2. **S18 seguros, cortos (sin root):**
   - `desktop/smart.js:55` usa su propio writeAtomic sin fsync → usar `desktop/fsutil.js` (CP propio).
   - `kill-process` (main.js) manda SIGTERM a cualquier PID > 1 → revalidar dueño/PID justo antes y exigir confirmación (ver S17 N-D4-04).
   - `aura.tiles[].reason` y `power_control.*.reason` en texto libre inglés → códigos + i18n (como `procs_vram.reason_code`).
   - Tokens CSS `--state-hot/--state-normal/--state-critical/--state-warn` vacíos en `:root` (tokens.css); `cores.css` los usa.
   - Duplicados: escapeHtml ×4, tempClass ×2, lsGet/lsSet ×2, drawChart ×2 (unificar antes de extraer más).
   - Cortes pequeños S08 restantes: `aura-color.js` (main.js hexToRgb/rgbToHex/lerp/brighten), `settings-model.js` (settingsNeedBackendRestart), gpu-pending (cleanGpuPending/Action). **No** extraer handlers privilegiados (esperan ADR de frontera única priv.js ↔ power_control.py).
   - F5 (eventos/alertas restantes), F8 (TUI) solo lo pendiente comprobado.
3. **S15 — detalle de CPU** (`src/rog_monitor/cpu_info.py` + `desktop/renderer/cpu-info.js`, pestaña en el modal de núcleos). Solo lectura, fixtures Intel/AMD/sin cpufreq.
4. **S16 — detalle de GPU** (NVML falso; **jamás despertar la dGPU en D3cold**; vulkaninfo/glxinfo bajo demanda con timeout).
5. **S17 — procesos agrupados** (árbol por PPID, sumas sin doble conteo; terminar grupo solo con botón + diálogo; nunca señales reales en tests).
6. **S13 — benchmarks**: solo la parte simulada (veredicto, protocolo, fixtures). La carga real CPU/GPU es BLOCKED_OWNER (OWNER-04).
UI nueva de Codex: misma regla que Claude — módulo puro + test Node, `app.js` solo cablea, 8 idiomas, CDP con aserciones RED→GREEN.

## 3. Verificación (comandos exactos)
```bash
# Python + cobertura (venv privado; HOME aislado)
HOME="$PWD/.ai/private/rog-v22/logs/home" PYTHONPATH=src \
  .ai/private/rog-v22/venv-clean/bin/python -s -m coverage run --source=src/rog_monitor -m unittest discover -s tests
.ai/private/rog-v22/venv-clean/bin/python -m coverage report --precision=2 --fail-under=80 | tail -1
# Node + docs + i18n + versión
node --test --experimental-test-coverage --test-coverage-lines=90 desktop/test/*.test.js
node scripts/validate-i18n.mjs && node scripts/check-docs.mjs && node scripts/bump-version.mjs --check
# e2e aislado (Electron 44 local)
node scripts/e2e-smoke.mjs --out .ai/private/rog-v22/logs/e2e
# CDP (arnés privado; apunta a un worktree con ROG_APP_ROOT=<ruta>)
node .ai/private/rog-v22/tools/cdp.mjs "$PWD/docs/agent-work/v22/evidence/S02/check-drag-mouse.mjs"
```
Checks CDP versionados (todos con `RESULT: PASS|FAIL`): `evidence/S01/check-bench.mjs`, `check-tables.mjs`, `evidence/S02/check-editor2.mjs`, `check-drag-mouse.mjs`, `evidence/S03/check-states.mjs`, `evidence/VERSION/check-version-visible.mjs`. CI remoto usa Python 3.12; local 3.14 → mira el CI tras cada push.

## 4. Reglas y permisos vigentes
- **Git:** commits pequeños en español con el ID. Push normal a `feat/v22` fue autorizado a Claude (V22-D6) con suite local verde; el playbook pide permiso por acción → **confirma con Marshall antes de tu primer push**. Nunca `--force`, nunca `master` (solo PR con CI verde y su aprobación).
- **Nada privilegiado:** sin `sudo`, `pkexec`, `systemctl` con cambios, `/sys` real, instalador, Guardian real (ADR-0005/0006). Tests con fakes (`ROG_SYSFS_ROOT`, `ROG_FW_ATTRS_DIR`, runner inyectado).
- **Ventiladores:** no tocar curvas por defecto ni el vigilante root (`scripts/rog-profile-sync.sh`) sin prueba térmica real y permiso. Pendiente con permiso: `rog-profile-sync.sh:294` acepta un `updated` futuro (mismo fallo arreglado en fans.py).
- **Versión:** única fuente `VERSION`; subir con `node scripts/bump-version.mjs X.Y.Z` y seguir su checklist (encabezado CHANGELOG `## X.Y.Z — fecha`, entrada del roadmap). Subir versión en cada release. En la UI se ve solo en Ayuda > Acerca de.
- **UI:** Carbon/ROG cuadrado, nada "de IA" (p. ej. se quitó "Sensores OK"); 12 temas; 8 idiomas con traducciones reales; `app.js` no crece con lógica.
- **Cobertura:** piso 80 irreversible; nada de tests import-only ni exclusiones para inflar.

## 5. Trampas aprendidas en esta sesión
- Si la sesión muere, los worktrees sin commit **se pierden**: commit por avance.
- El DnD nativo HTML5 pasaba tests sintéticos y **no funcionaba con ratón real**. Verifica UI con `Input.dispatchMouseEvent`/`dispatchKeyEvent` reales de CDP, no con eventos JS.
- Los CDP que leen estilos fallaban de forma intermitente por `transition` CSS: los checks inyectan un estilo `NOANIM`; respétalo.
- `.ai/private/rog-v22/tools/check-stale.mjs` hace `pgrep -n` no aislado y puede mandar SIGSTOP al backend real: **no usarlo**.
- `tests/test_gpu_perf.py::test_live_shape` toca NVML real: solo con `ROG_LIVE_GPU=1`. Ningún test debe despertar la dGPU (`tests/test_gpu_sleep.py` tiene un guard de módulo).
- En KDE Wayland nativo `setPosition` se ignora; en Chromium `--display=` se interpreta como display X11.
- `app.js` y módulos del renderer son scripts clásicos (globales compartidos). Los módulos nuevos son UMD (`window.RogX` + `module.exports`), se cargan en `index.html` **antes** de `app.js` y, si app.js los usa al cargar, también en `scripts/validate-i18n.mjs`.
- Los hooks de los worktrees bloquean `HOME=… cmd` en línea: usar un script.
- `power_control.py` corre como root con `check_version=False`: no tocar esa rama al tocar versiones.

## 6. Bloqueos de Marshall (BLOCKED_OWNER)
- `sudo bash scripts/install-system.sh` tras subir a 22.0.0 (la app lo pedirá).
- Validar a mano: arrastre de gráficas en Historial, Ayuda > Acerca de, minimizar/restaurar (Python pasa a `T` y vuelve a `S`; lista en `checkpoints/F3-03-F3-04.md`).
- Ventiladores: sigue probando en juego (V22-D13), reportar fallos.
- Overlay con juegos reales (pasos en `checkpoints/S11b-OVERLAY-V2.md`).
- VM para instalador/recovery (F1-08/09), carga térmica de benchmarks (OWNER-04), merge a master/tag (OWNER-10).
