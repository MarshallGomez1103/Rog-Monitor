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

## Estado final: TODO FUSIONADO ✅ (v13.0.0)

## Worktrees / ramas
| Tarea | Rama | Worktree | Estado |
|---|---|---|---|
| A-POWER-UI | `v13/power-ui` | `../rogmon-wt/power-ui` | FUSIONADO (2dffed7) |
| A-POWER-BE | `v13/power-be` | `../rogmon-wt/power-be` | FUSIONADO (5190033) |
| A-GAME | `v13/game` | `../rogmon-wt/game` | FUSIONADO (515d627) |
| A-CORES | `v13/cores` | `../rogmon-wt/cores` | FUSIONADO (09dff6b) |
| INTEGRACIÓN (app.js/i18n/neon/roadmap/versión/scrub) | `master` | (raíz) | LISTO |
| Seguridad GPU/AC-batería (Codex) | `master` | (raíz) | LISTO (3ca8785) |
| Pulido post-uso (tarjetas bench, ver-todos procesos, neón) | `master` | (raíz) | LISTO (0a8b20c) |

Estados: TODO · LANZADO · EN CURSO · CORTADO · LISTO · FUSIONADO.

> Las ramas `v13/*` y sus worktrees pueden archivarse: su trabajo ya vive en
> `master`. `git worktree remove ../rogmon-wt/<tarea>` (conserva la rama).

## Checklist por tarea (todo cumplido)
### A-POWER-UI (prioridad 1)
- [x] Aplicar detecta solo lo cambiado · [x] franja de peligro con consecuencias
- [x] mensaje de rieles de seguridad · [x] doble consentimiento fuera de rango
- [x] modo Avanzado (marca+componente+links+rangos) con check "entiendo riesgos"

### A-POWER-BE (prioridad 1)
- [x] perfiles aplican poder real con recorte seguro (Ahorro topa más bajo)
- [x] curvas default coherentes por perfil · [x] device_docs.json válido y con links reales

### A-GAME (prioridad 1)
- [x] gráficas sesión = neón · [x] clic abre grande con zoom
- [x] comparación original/nueva/% · [x] costo $ configurable · [x] notas
- [x] cuadritos de benchmark no desbordan

### A-CORES (prioridad 2)
- [x] P vs E cores distintos · [x] GHz inline (sin toast) · [x] detalle por núcleo
- [x] traducible

### INTEGRACIÓN (orquestador)
- [x] fix rebote perfiles · [x] procesos 2 columnas · [x] alertas estandarizadas
- [x] nitidez neón números · [x] data-i18n en headers de bloque
- [x] i18n de todas las claves nuevas (8 idiomas) · [x] timeline roadmap centrado
- [x] roadmap real + idea multi-equipo · [x] versión unificada v13.0.0
- [x] scrub Marshall/Redragon/modelo personal · [x] README/CHANGELOG/HANDOFF

### Pulido post-uso (sesión Opus 2026-06-18)
- [x] tarjetas de benchmark muestran resumen (chips a la izquierda + mini-curva)
- [x] VER TODOS los procesos (modal, filtro, refresco vivo, --procs-all)
- [x] núcleos con halo neón por temperatura · [x] botones .ghost más visibles
- [x] integrado el fix de seguridad GPU/AC-batería de Codex (anti-login-gris)

## Pendiente real (no bloquea v13; documentado)
- Auto-aplicar poder por perfil SIN pedir contraseña: lo resuelve el servicio
  root externo `rog-profile-sync` (Codex ya lo dejó aplicando límites en cada
  cambio PPD). Verlo en `docs/HANDOFF.md` (sesión Codex).
- Monitoreo multi-equipo / centro de datos: sigue siendo visión de roadmap (SSH
  y backend remoto NO implementados a propósito).

## Bitácora
- 2026-06-17: spec + tracker creados; worktrees y ramas v13/* creados; 4
  instancias lanzadas en background; orquestador arranca INTEGRACIÓN.
  IDs de agente (para retomar/continuar con SendMessage):
  A-POWER-UI=ada59c449edcabb73 · A-POWER-BE=afbb6f5b0322cfd6b ·
  A-GAME=a3e6f97a9c4d72a77 · A-CORES=adf2f1368b7a91cb3.
- 2026-06-17/18: las 4 ramas fusionadas a master; INTEGRACIÓN completa; scrub
  personal hecho. Corte de cuenta a mitad → trabajo rescatado de los worktrees
  (checkpoints) y fusionado. App verificada: arranca limpia, NDJSON válido.
- 2026-06-18: Codex resolvió el login-gris (GPU no se toca en AC/batería) y dejó
  los servicios root aplicando poder por perfil; Opus integró ese commit.
  Pulido post-uso de Marshall (tarjetas bench + ver-todos procesos + neón).
  v13.0.0 cerrado.
