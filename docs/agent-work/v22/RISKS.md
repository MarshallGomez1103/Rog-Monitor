# RISKS v22
| ID | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | master público con CI rojo (e2e) | cierto | bajo (resto verde) | D-01 en F9-02 o adelantado con permiso |
| R2 | Conflicto asusd/profile-sync/guardián cambia perfil o ventiladores | media | medio | No activar guardián real (ADR-0006); F7-01/02 |
| R3 | Cambios de instalador sin VM | – | alto (arranque) | F1-08/09 obligatorios antes de release |
| R4 | Mediciones con ruido (Chrome, ChatGPT, KDE) | alta | bajo | 3 corridas, registrar load y perfil |
| R5 | Dependabot PRs (electron 44, actions v7) mezclados con v22 | media | medio | No fusionar sin revisión; electron 44 requiere su propia validación |
