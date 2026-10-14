# STATUS v22 — leer PRIMERO
Plan: `docs/agent-work/v22/PLAN_MAESTRO_ROG_MONITOR.md` (histórico) y `PLAN-SIGUIENTE.md` (vigente). Los 90 CP anteriores ya se ejecutaron: no repetir.
Rama de trabajo: `feat/v22` (pusheada; se publica a master por PR con CI verde, con permiso del propietario). 2026-10-14: PR #7/#8 fusionados, 5 PR de Dependabot fusionados (checkout/setup-node/setup-python/upload-artifact v7, Electron 44.7.0 probado local e2e 31/31), PR #9 = arreglo ventiladores.
Respaldo: `~/MyFiles/Backups/rog-monitor/2026-10-11-pre-v22/` (bundle + ignorados + ZIP, SHA256SUMS).

## PLAN VIGENTE: `PLAN-SIGUIENTE.md` (etapas S00–S18). Permisos 2026-10-14: push normal a feat/v22, avanzar S01→S06 (V22-D6).

## S00 — ACCEPTED (2026-10-14, base 10f37eb) · ficha `checkpoints/S00-BASE.md`, contrato `checkpoints/F2-01.md`
Baseline: py 206 OK, cobertura **52.28 %** (2107/4030); node 50/50 (líneas 99.48 %); i18n 1026×8; e2e 31/31; CI feat/v22 y master verdes.
Conciliación de estados (prevalece ficha + git sobre filas antiguas):
| CP | Estado real | Commit |
|---|---|---|
| F2-01 mapa de contrato | TESTED (documental) | este commit |
| F2-08 ts/stale + SIN DATOS | TESTED | 22aed9a |
| F3-06 VRAM por proceso en segundo plano | TESTED | e41b5c4 |
| F4-04/05 editor de gráficas | TESTED | 2227049 |
| F4-06 reordenar | PARTIAL (↑↓ sí, drag no; se amplía en S02) | 2227049 |
| D-01 CI e2e | RESUELTO (CI verde desde 2026-10-12); F9-02 sigue abierto | c878859 |
| BUG-fans-reactive | TESTED con fakes + lectura real; **BLOCKED_OWNER** despliegue sudo | 2b6d9d6, 8e8f523 |
| F1-08, F1-09, F1-10, F6-01, F7-10 | BLOCKED_OWNER (VM / root / Wayland / guardián real) | – |
Defectos nuevos: N-DEF-01..05 (ver S00-BASE.md). Siguiente: **S01** (N-A1-01).

## Tanda 2 (2026-10-14) — S01 cerrado + S04/S05/S06 (prioridad B) · HEAD b5343a3
Cobertura py **94,90 %** (4173 stmts, 213 miss; 951 tests, 1 skip opt-in GPU). **Piso CI 50 → 80** (22171b7; CI remoto 868 tests / 90 % en py3.12, verde). node 84/84; i18n 1029×8; e2e 31/31; CDP S01 check-bench/check-tables PASS sobre HEAD integrado.
| CP | Estado | Commits |
|---|---|---|
| S01 N-A2-01 cableado + N-A1-02 JS (EXPAND botón, aria-label, Deshacer 6 s, aria-sort) | TESTED (CDP RED→GREEN); validación visual 12 temas = OWNER-02 | ver S01-WIRING.md |
| N-B-05/N-B-10/N-B-15 piso CI 80 | ACCEPTED (95 falla rc 2, 80 pasa; CI remoto verde) | 22171b7 |
| N-B-11 app.py 28→99,6 % | TESTED | ver git log |
| N-B-12 aura 24→98,7 % (+ zona validada antes del argv de asusctl) | TESTED | ver git log |
| N-B-13 power_control 45→99 %, actions →100 % | TESTED | ver git log |
| N-B-14 benchmarks 57→99,3 % (NaN/inf ya no rompe el JSON) | TESTED | 3eb4868 |
| N-DEF-03 un lector caído ya no tumba el tick; BrokenPipe sin bucle | FIXED | a4562ee y anterior |
| N-DEF-11 TUI tolera None; getloadavg aislado | FIXED | b5343a3 |
| N-A3-01 modelo chart-editor-model.js (+ claves heredadas rechazadas: localStorage `["constructor"]` tumbaba app.js) | TESTED (módulo); cableado S02 en curso | 2d22a2c |
Huecos registrados (no corregidos, requieren decisión): `scripts/apply-power-control.sh` sin rollback ni reintento EBUSY (root → S18 con permiso); defectos de fans.py (N-DEF-10, permiso del propietario).

## Tanda 1 (2026-10-14) — S01 CSS + adelanto S04/S05 · HEAD 1f9f53d
Cobertura py 52,28 → **74,23 %** (504 tests, 1 skip opt-in GPU); node 63/63; i18n 1026×8; e2e 31/31.
| CP | Estado | Commits |
|---|---|---|
| N-A1-01 tarjetas sin recorte + scroll | TESTED (CDP RED→GREEN, 3 temas) | a76b699 |
| N-A1-02 EXPAND/borrar (CSS) | TESTED; JS/i18n en tanda S01-2 | a50bc5b |
| N-A2-01 modelo procs-table.js | TESTED (módulo); cableado en S01-2 | 49ef464 |
| N-A2-02 regla única .proc-table | TESTED (CDP 0 diferencias, 3 temas × 4 órdenes) | d7944ae |
| N-B-01 cli/__main__ 0→100 % | TESTED | 751919e |
| N-B-02 procs 21→90 % | TESTED | 1d2da1d |
| N-B-03 fps 20→99 % | TESTED | 0dc62f8 |
| N-B-04 settings 30→99 % | TESTED | 8fc146f |
| N-B-06 power 27→90 % | TESTED | d2bad06 |
| N-B-07 gpu/gpu_clocks →100/99 % | TESTED (guard anti-NVML real) | 4903554 |
| N-B-08 fans 52→99 % (solo tests) | TESTED | ver git log |
| N-B-09 game_session 36→99 % | TESTED | ver git log |
| N-DEF-01 batería charge_* mostrada como Wh | FIXED | 37356f0 |
| N-DEF-06/07/08 fps, config, settings | FIXED | b94771e, dae1295, 4a54ad5 |
| N-DEF-09 PID reutilizado → CPU negativa | FIXED | 405d1f3 |
| game_session: desempate y JSON ajeno | FIXED | ver git log |
| test_live_shape tocaba NVML real | opt-in ROG_LIVE_GPU=1 | e89e1f6 |
Piso CI sigue en 50: se sube en N-B-05/N-B-10/N-B-15 (CI serial) cuando cierre S06.
Defectos de fans.py SOLO registrados (regla del propietario, sin tocar): N-DEF-10 `updated` futuro en guardian_status/_gaming_cap (fans.py:324, 253) da guardián "vivo"; `fan_max_rpm` no-dict (fans.py:359); `True` aceptado como cap (fans.py:207, 225); docstring de load_schema_version (fans.py:303).
Pendiente S01: cableado app.js + aria/deshacer + i18n (Sonnet-Wiring, en curso). S06 en curso: aura/benchmarks, power_control/actions.

## Fase actual: F0 cerrada; el propietario autorizó seguir arreglando (2026-10-11). En curso: F1/F2/F3/F5/F8 por prioridad visible
| CP | Estado | Nota |
|---|---|---|
| F0-01 | ACCEPTED | snapshot Git = informe 01 |
| F0-02 | ACCEPTED | bundle verificado y restaurado en scratch |
| F0-03 | ACCEPTED | remoto sin avances; push v21 autorizado; CI rojo solo en e2e (D-01) |
| F0-04 | ACCEPTED | feat/v22, plan versionado, .gitignore v22 |
| F0-05 | ACCEPTED | requirements-lock.txt, venv limpio |
| F0-06 | ACCEPTED | 162 OK sin user site |
| F0-07 | ACCEPTED | node 46/46, i18n, sintaxis |
| F0-08 | TESTED | local 29/29; CI remoto rojo (D-01) |
| F0-09 | TESTED | backend 4.03 % media, TUI ~4.5 %, app visible 25–52 % (D-02 nuevo) |
| F0-10 | ACCEPTED | matriz de defectos + ADR-0006 |

Gate F0: F0-08 queda TESTED con excepción D-01 registrada (no se corrige en F0). Abrir F1 requiere aprobación del propietario.

## Hecho tras F0 (rama feat/v22, sin push)
| CP / bug | Estado | Commit |
|---|---|---|
| D-01 CI e2e (Node 22 + binario electron) + índice node tests | TESTED (CI remoto se verá al publicar la rama) | ver git log |
| F2-02 uso % en tarjeta CPU | TESTED | 563cf4c |
| F2-03..05 RAM/swap GiB, ejes fijos, GPU % | F2-05 TESTED; F2-03/04 PARTIAL (modo % en F4-07) | 563cf4c |
| F2-06 IOPS/ocupado en discos | TESTED | 00d00a5 |
| F2-07 red ≥ 0 | TESTED | 5b0052f |
| F8-02 TUI sin TTY | TESTED | 5b0052f |
| F5-02..04 alertas RAM/swap/disco | TESTED | 95810a1 |
| F1-06/07 escritura atómica + timeouts | TESTED | 6b89e8d |
| F1-04/05 RECOVERY + uninstall copia root | TESTED | 335aa55 |
| F1-02 verificación VERSION/dueño en Python | TESTED | c0ca804 |
| F1-03 profile-sync | ACCEPTED (propietario 2026-10-12: sigue activo por defecto; ver ficha) | – |
| F3-05 SIGCONT antes de matar backend | TESTED | 58cee5e |
| F3-07 cadencia monotónica (1128→1002 ms) | TESTED | a8f68cd |
| D-02 animaciones a saltos (app visible 30-60 % → 11-19 %) | TESTED | 77885ea |
| BUG ventiladores pegados a 6000 rpm con CPU fría | TESTED con fakes; requiere sudo install-system.sh | 34f710d |
| BUG límites de potencia EBUSY sin reintento | TESTED con fakes; requiere sudo install-system.sh | 2fede12 |
| GPU "Mode --" → "Modo GPU" oculto sin supergfxd | TESTED | ver git log |

Pendiente del propietario: `sudo bash scripts/install-system.sh` (despliega rog-profile-sync nuevo) + reiniciar la app; probar: jugar → salir → 2 min en performance → ventiladores deben bajar solos.
Siguientes candidatos: F2-08 (ts/stale), F2-09 schema 2 deltas, F3-06 timeout VRAM NVML, F4 (editor de gráficas, duplicación), F6 overlay, F7 dueño único (asusd escribe curvas en cada cambio de perfil).

## 2026-10-12 (tarde)
- 17cb34d: barras núcleos E visibles, procesos en "núcleos" (2.35), EPP corto.
- 15cf096: detector de ventiladores revisado (regla propietario: frío baja todo / caliente sube todo; 3 ventiladores vs su curva y calibración, 60 s, cooldown 5 min). **Requiere sudo install-system.sh.**
- 14da3e4: regresión F1-02 como root corregida (límites ya se aplican: PL1 140 / PL2 175 / DB 25 verificado).
- 98f1883: roadmap v21/v22, P1 parciales honestos.
- 2dd4f66: procesos que caben (hasta 25), ventiladores fluidos por defecto + modo ahorro.
- **feat/v22 pusheado a origin (2026-10-12, orden del propietario "commit y push")**; CI remoto run 38300860771 VERDE completo (incl. e2e: D-01 resuelto). master sigue en v21 (7d49333). Siguiente: PR feat/v22 → master cuando el propietario lo pida.
| BUG ventiladores no reactivos en quiet/balanced + curva no aplicada fuera del punto 8 + quiet sin PL1/PL2 | TESTED (196+8 py, prueba térmica real); requiere sudo install-system.sh | 2b6d9d6, 8e8f523 |
| Cobertura en CI (py ≥50 %, node ≥90 % líneas) | TESTED | 2b6d9d6 |
