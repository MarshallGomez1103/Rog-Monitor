# HANDOFF v22
Actualizado: 2026-10-15 (v22.0.0 en VERSION; S00–S07 cerrados; S08 en curso; HEAD 1a64414).
- Plan vigente: `docs/agent-work/v22/PLAN-SIGUIENTE.md` (S00–S18). Plan maestro histórico movido a esta carpeta (V22-D7).
- Rama `feat/v22`; origin/master = 45cb9dc (PR #9). Push normal a feat/v22 autorizado (V22-D6).
- S00 ACCEPTED: baseline py 206 OK / 52.28 %, node 50/50, i18n 1026×8, e2e 31/31. Fichas: checkpoints/S00-BASE.md, F2-01.md.
- Archivos calientes: todos libres.
- Bloqueos humanos: sudo install-system.sh (ventiladores), F1-08/09 VM, F6-01 Wayland, F7-10.
- En curso (2026-10-15, relanzados tras corte por límite; los worktrees anteriores se perdieron sin commits): S08 F3-02 (charts-catalog + fan-curve-model, dueño app.js), S08 F3-03/04 (backend-bridge, dueño main.js), S10 spike overlay (ADR-0007, sin archivos de producto). Después: implementación overlay (botón visible, anclaje/monitor real, rediseño, modo MangoHud) + corte overlay-window.js. Propietario: sudo bash scripts/install-system.sh tras 22.0.0; validar arrastre de gráficas y Acerca de.
  `cd ~/MyFiles/Dev/Rog-Monitor && git status --short --branch && sed -n 1,40p docs/agent-work/v22/STATUS.md`

## Historial
Actualizado: 2026-10-15 (v22.0.0 en VERSION; S00–S07 cerrados; S08 en curso; HEAD 1a64414).
- Rama: `feat/v22` (base master 7d49333 = origin/master), pusheada a origin/feat/v22 el 2026-10-12 con permiso; CI verde.
- Último CP completado: F0-10. F0 cerrada con excepciones D-01 (CI e2e) y D-02 (app visible 25–52 % CPU).
- Tests ejecutados (rc): unittest 162 OK (0), node 46/46 (0), i18n (0), node --check/bash -n (0), e2e 29/29 local (0). CI remoto master: rojo solo en e2e (D-01).
- Decisiones: DECISIONS.md V22-D1..D5; ADR-0006.
- Riesgos: RISKS.md. Bloqueos humanos: F1-08/09 (VM), F1-10, F6-01, F7-10.
- Siguiente comando seguro al retomar:
  `cd ~/MyFiles/Dev/Rog-Monitor && git status --short --branch && cat docs/agent-work/v22/STATUS.md`
- 2026-10-12: avance post-F0 en STATUS.md (tabla 'Hecho tras F0'). Último commit: ver `git log -1`. Suite: py OK, node 49/49, e2e 31/31.
- Siguiente paso: propietario corre `sudo bash scripts/install-system.sh` y confirma ventiladores; luego F2-08/F2-09/F3-06/F4.
- 2026-10-14: arreglo de ventiladores (checkpoints/BUG-fans-reactive.md) en PR #9; Dependabot al día; curvas del propietario migradas a 50 °C (backup fan-curves.json.pre-50c.bak).
  PENDIENTE propietario: `sudo bash scripts/install-system.sh` (vigilante nuevo + PL1/PL2 en quiet) y `cd desktop && npm ci` (Electron 44 local).
  Siguiente: F2-08 (ts/stale), F2-09 (deltas), F3-06 (timeout VRAM), F4; subir cobertura de power_control/app.py.

- 2026-10-14 (cierre): pedidos nuevos del propietario (bugs visuales benchmarks/procesos/editor, cobertura 80 %, README/roadmap, overlay, benchmarks, paridad Administrador de tareas) consolidados en ~/Desktop/ROG-Monitor-Siguiente-Plan.md para su agente de plan. NADA de eso empezado.
