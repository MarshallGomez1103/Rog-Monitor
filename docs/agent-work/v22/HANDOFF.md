# HANDOFF v22
Actualizado: 2026-10-15 · **Traspaso Claude → Codex**: leer `docs/agent-work/v22/CODEX-TRASPASO.md` primero.
- Rama `feat/v22`, HEAD `e8d4ce6` + commit de traspaso, CI remoto verde. VERSION 22.0.0. origin/master = 45cb9dc.
- Último CP hecho: S08 F3-02 (charts-catalog, fan-curve-model) y F3-03/04 (backend-bridge); S10 spike + ADR-0007 (proposed).
- CP en curso: ninguno. Archivos sin commit: ninguno. Worktrees: ninguno.
- Siguiente para Codex: S09 schema 2 (F2-08 gate → N-F2-SCHEMA-01). Cola completa en CODEX-TRASPASO.md §2.
- Reservado a Claude: overlay (ADR-0007 A2 vs A3, implementación, overlay-window.js, S11/S12).
- Calientes: app.js, main.js, style.css, i18n.js, src/rog_monitor/app.py — un solo dueño por tanda.
- Bloqueos de Marshall: sudo install-system.sh (22.0.0); validar arrastre, Acerca de, minimizar/restaurar; overlay con juegos; VM; carga térmica.
- Push: confirmar con Marshall (V22-D6 autorizó a Claude; el playbook pide permiso por acción). Nunca force ni master.
- Siguiente comando seguro:
  `cd ~/MyFiles/Dev/Rog-Monitor && git status --short --branch && sed -n 1,80p docs/agent-work/v22/CODEX-TRASPASO.md`

## Historial
Actualizado: 2026-10-15 (S08 cortes F3-02 y F3-03/04 integrados; S10 spike + ADR-0007 propuesto).
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
