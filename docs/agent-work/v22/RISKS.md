# RISKS v22
| ID | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | master público con CI rojo (e2e) | cierto | bajo (resto verde) | D-01 en F9-02 o adelantado con permiso |
| R2 | Conflicto asusd/profile-sync/guardián cambia perfil o ventiladores | media | medio | No activar guardián real (ADR-0006); F7-01/02 |
| R3 | Cambios de instalador sin VM | – | alto (arranque) | F1-08/09 obligatorios antes de release |
| R4 | Mediciones con ruido (Chrome, ChatGPT, KDE) | alta | bajo | 3 corridas, registrar load y perfil |
| R5 | Dependabot PRs (electron 44, actions v7) mezclados con v22 | media | medio | No fusionar sin revisión; electron 44 requiere su propia validación |

## 2026-10-14 — npm audit: 8 moderadas (aceptado)
Todas por `sprintf-js@1.1.3` (GHSA-hp3w-g68c-fv3c, DoS con especificadores de precisión) vía
electron-builder → app-builder-lib → @electron/get → global-agent → roarr. No hay versión parcheada (1.1.3 es la última);
el `npm audit fix` sugerido BAJA electron-builder 26.17 → 26.5. Solo corre al empaquetar (descarga de Electron) con
cadenas de log propias: no llega a la app ni a datos de terceros. Revisar cuando roarr/global-agent cambien de dependencia.
| R6 | CI corre Python 3.12 y local 3.14.8: un test podría pasar en uno y fallar en otro | baja | bajo | Mirar CI remoto tras cada push; si diverge, matriz 3.12/3.14 |
| R7 | Cobertura 52.28 → 80 % exige ~1117 sentencias nuevas cubiertas; tentación de tests triviales | media | medio | Revisión Opus por tanda: cada test afirma resultado; nunca bajar piso ni excluir |
