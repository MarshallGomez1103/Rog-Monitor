# STATUS v22 — leer PRIMERO
Plan: `PLAN_MAESTRO_ROG_MONITOR.md` (raíz). Los 90 CP anteriores ya se ejecutaron: no repetir.
Rama de trabajo: `feat/v22` (sin upstream, sin push). master = origin/master = 7d49333 (v21, pusheado por orden del propietario 2026-10-11).
Respaldo: `~/MyFiles/Backups/rog-monitor/2026-10-11-pre-v22/` (bundle + ignorados + ZIP, SHA256SUMS).

## Fase actual: F0 CERRADA (con excepciones D-01 CI e2e y D-02 coste de la app visible) — esperando aprobación para F1
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
