# STATUS v22 — leer PRIMERO
Plan: `PLAN_MAESTRO_ROG_MONITOR.md` (raíz). Los 90 CP anteriores ya se ejecutaron: no repetir.
Rama de trabajo: `feat/v22` (pusheada; se publica a master por PR con CI verde, con permiso del propietario). 2026-10-14: PR #7/#8 fusionados, 5 PR de Dependabot fusionados (checkout/setup-node/setup-python/upload-artifact v7, Electron 44.7.0 probado local e2e 31/31), PR #9 = arreglo ventiladores.
Respaldo: `~/MyFiles/Backups/rog-monitor/2026-10-11-pre-v22/` (bundle + ignorados + ZIP, SHA256SUMS).

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
| F2-03..05 RAM/swap GiB, ejes fijos, GPU % | TESTED (modo % alternativo en F4-07) | 563cf4c |
| F2-06 IOPS/ocupado en discos | TESTED | 00d00a5 |
| F2-07 red ≥ 0 | TESTED | 5b0052f |
| F8-02 TUI sin TTY | TESTED | 5b0052f |
| F5-02..04 alertas RAM/swap/disco | TESTED | 95810a1 |
| F1-06/07 escritura atómica + timeouts | TESTED | 6b89e8d |
| F1-04/05 RECOVERY + uninstall copia root | TESTED | 335aa55 |
| F1-02 verificación VERSION/dueño en Python | TESTED | c0ca804 |
| F1-03 profile-sync opt-in | BLOCKED (decisión propietario) | – |
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
