# PROGRESS v13 — tablero del orquestador (Opus)

Fuente de verdad para retomar tras un corte de sesión. El orquestador actualiza
esto en `master`. Cada rama lleva su propio `docs/progress/<id>.md` (memoria
durable de esa instancia, aunque no se vea su mensaje final).

**Spec:** `docs/build-spec-v13.md` · **Regla:** nunca push.

## Cómo retomar (para una sesión futura de Opus)
1. Lee este archivo y `docs/build-spec-v13.md`.
2. `git worktree list` y `git log --oneline <rama>` por cada rama `v13/*` para
   ver qué commiteó cada instancia; lee su `docs/progress/<id>.md`.
3. Fusiona a `master` las ramas marcadas LISTO que falten; relanza las que
   quedaron EN CURSO/CORTADO con el mismo prompt (apuntando a su worktree).
4. Haz el bloque INTEGRACIÓN (app.js / i18n / neon / roadmap / versión / scrub).
5. Verifica y actualiza este tablero + HANDOFF.

## Worktrees / ramas
| Tarea | Rama | Worktree | Estado |
|---|---|---|---|
| A-POWER-UI | `v13/power-ui` | `../rogmon-wt/power-ui` | LANZADO |
| A-POWER-BE | `v13/power-be` | `../rogmon-wt/power-be` | LANZADO |
| A-GAME | `v13/game` | `../rogmon-wt/game` | LANZADO |
| A-CORES | `v13/cores` | `../rogmon-wt/cores` | LANZADO |
| INTEGRACIÓN (app.js/i18n/neon/roadmap/versión/scrub) | `master` | (raíz) | EN CURSO |

Estados: TODO · LANZADO · EN CURSO · CORTADO · LISTO · FUSIONADO.

## Checklist por tarea (marca al fusionar)
### A-POWER-UI (prioridad 1)
- [ ] Aplicar detecta solo lo cambiado · [ ] franja de peligro con consecuencias
- [ ] mensaje de rieles de seguridad · [ ] doble consentimiento fuera de rango
- [ ] modo Avanzado (marca+componente+links+rangos) con check "entiendo riesgos"

### A-POWER-BE (prioridad 1)
- [ ] perfiles aplican poder real con recorte seguro (Ahorro topa más bajo)
- [ ] curvas default coherentes por perfil · [ ] device_docs.json válido y con links reales

### A-GAME (prioridad 1)
- [ ] gráficas sesión = neón · [ ] clic abre grande con zoom
- [ ] comparación original/nueva/% · [ ] costo $ configurable · [ ] notas
- [ ] cuadritos de benchmark no desbordan

### A-CORES (prioridad 2)
- [ ] P vs E cores distintos · [ ] GHz inline (sin toast) · [ ] detalle por núcleo
- [ ] traducible

### INTEGRACIÓN (orquestador)
- [ ] fix rebote perfiles · [ ] procesos 2 columnas · [ ] alertas estandarizadas
- [ ] nitidez neón números · [ ] data-i18n en headers de bloque
- [ ] i18n de todas las claves nuevas (8 idiomas) · [ ] timeline roadmap centrado
- [ ] roadmap real + idea multi-equipo · [ ] versión unificada v13.0.0
- [ ] scrub Marshall/Redragon/modelo personal · [ ] README/CHANGELOG/HANDOFF

## Bitácora
- 2026-06-17: spec + tracker creados; worktrees y ramas v13/* creados; 4
  instancias lanzadas en background; orquestador arranca INTEGRACIÓN.
  IDs de agente (para retomar/continuar con SendMessage):
  A-POWER-UI=ada59c449edcabb73 · A-POWER-BE=afbb6f5b0322cfd6b ·
  A-GAME=a3e6f97a9c4d72a77 · A-CORES=adf2f1368b7a91cb3.
