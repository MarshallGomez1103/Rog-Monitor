# DECISIONS v22
- V22-D1 (2026-10-11, propietario): push de los 54 commits v21 a master antes de empezar v22 ("para tener una versión estable"). Ejecutado tras el bundle (F0-02/F0-03). Excepción explícita a CLAUDE.md "nunca push"; para v22 vuelve a regir: sin push sin permiso.
- V22-D2: solo `docs/agent-work/v22/` se versiona; los 90 CP históricos siguen internos (respaldados en el tar de F0-02). Logs pesados en `.ai/private/rog-v22/` (ignorado).
- V22-D3: informes post-90 sanitizados versionados en `docs/audits/post90/` (plan §11); ZIP original fuera del repo con su sha256.
- V22-D4: ADR-0006 reglas de host (sin acciones privilegiadas sin permiso por acción; tests sin /sys ni pkexec real; guardián solo simulación).
- V22-D5: el fix del CI e2e (D-01) se hará en su checkpoint (F9-02) salvo que el propietario pida adelantarlo.
- V22-D6 (2026-10-14, propietario por cuestionario): push normal (sin --force) a `feat/v22` tras cada tanda con suite local verde; master solo por PR con CI verde y aprobación. Excepción explícita a AGENTS.md/CLAUDE.md "nunca push" limitada a feat/v22. Avanzar S01→S06 sin aprobación por etapa; parar en gates de propietario.
- V22-D7 (2026-10-14, propietario): los planes viven juntos y versionados en `docs/agent-work/v22/`: `PLAN_MAESTRO_ROG_MONITOR.md` (histórico, movido desde la raíz), `PLAN-SIGUIENTE.md` (vigente) e `INSUMO-PROPIETARIO-2026-10-14.md` (copia del pedido; el original sigue en el Escritorio). Las fichas F0-0x conservan la ruta antigua como registro histórico.
