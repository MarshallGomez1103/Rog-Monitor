# S00 — Reconciliación, baseline y corte de seguridad (N-BASE-01/02/03)
Estado: **ACCEPTED** (2026-10-14) · Base HEAD: `10f37eb` · Dueño: Opus (integrador); auditoría Haiku read-only. Sin cambios de código.

## N-BASE-01 — Git
| Ref | SHA | Nota |
|---|---|---|
| `feat/v22` local | 10f37eb | = `origin/feat/v22`; árbol limpio salvo PLAN-SIGUIENTE.md sin versionar y PLAN_MAESTRO borrado por el propietario (ya restaurado) |
| `origin/master` | 45cb9dc | merge PR #9 (2026-10-14). feat/v22 va 2 commits por delante (22aed9a F2-08, 10f37eb docs) y 1 detrás (el merge) |
| `master` local | 7d49333 | 48 detrás de origin/master: obsoleto, inofensivo (no se usa) |
| Worktrees/stash | ninguno | |
Commits totales HEAD: 235 (el insumo decía 234; el delta es 10f37eb).

CI remoto: run 38609315405 (feat/v22, 10f37eb) **verde**; master 38606286096 (45cb9dc) **verde**. PR #7/#8/#9 fusionados.
Discrepancia: CI usa Python 3.12, local 3.14.8 (venv-clean creado con 3.14.7). Riesgo bajo; registrado.

## N-BASE-02 — Inventario de checkpoints y permisos
Matriz completa F0-01..F9-10 (Haiku, verificada por muestreo): 33 IDs con registro, 67 sin registro, 0 duplicados.
Discrepancias corregidas en STATUS.md en esta tanda:
1. F1-03: STATUS decía BLOCKED, ficha ACCEPTED (decisión del propietario 2026-10-12: profile-sync activo por defecto). Prevalece la ficha.
2. F2-03/F2-04: TESTED pero la ficha dice modo % PARTIAL → **PARTIAL** (cierra en F4-07).
3. F2-08 (22aed9a), F3-06 (e41b5c4), F4-04/05/06 (2227049) tienen ficha TESTED y commit pero STATUS los listaba como "siguientes candidatos" → filas añadidas. F4-06: sin drag (solo ↑↓) → PARTIAL, se amplía en S02.
4. F0-08/D-01: la ficha dice CI rojo; desde 2026-10-12 CI verde con e2e (c878859). D-01 = resuelto; F9-02 sigue abierto como checkpoint (CI real completo).
5. BUG-fans-reactive: la ficha dice despliegue root PENDIENTE; STATUS decía "prueba térmica real" → la prueba fue de lectura; se marca TESTED (fakes) + BLOCKED_OWNER (sudo install-system.sh).
6. Bloqueos humanos F1-08/09/10, F6-01, F7-10 sin fila → añadidos como BLOCKED_OWNER.

Permisos vigentes (propietario, 2026-10-14, cuestionario de esta sesión):
- **Push normal a `feat/v22`** tras cada tanda con suite local verde. Nunca `--force`, nunca master (solo PR con CI verde y aprobación). Excepción explícita a AGENTS.md regla 1 → DECISIONS V22-D6.
- Avanzar **S01→S06** sin pedir aprobación por etapa; detenerse en gates de propietario.
- Planes: mover PLAN_MAESTRO a `docs/agent-work/v22/` junto a PLAN-SIGUIENTE e insumo, versionados → V22-D7.

## N-BASE-03 / F9-01 — Baseline (logs en `.ai/private/rog-v22/logs/S00/`)
| Suite | Comando | rc | Resultado |
|---|---|---|---|
| Python | `coverage run --source=src/rog_monitor -m unittest discover -s tests` (venv-clean, HOME aislado) | 0 | 206 tests OK, 49.2 s |
| Cobertura Py | `coverage report --precision=2` | 0 | **52.28 %** (4030 stmts, 1923 miss → 2107 cubiertas). 80 % = 3224 → faltan 1117 |
| Node | `node --test --experimental-test-coverage desktop/test/*.test.js` | 0 | 50/50; líneas 99.48 %, ramas 93.96 %, funciones 100 % |
| i18n | `node scripts/validate-i18n.mjs` | 0 | 1026 claves × 8 idiomas; 264 refs; 11 comandos |
| Shell | `bash -n` install/uninstall/scripts | 0 | sin errores |
| e2e | `node scripts/e2e-smoke.mjs --out …/S00/e2e` (HOME/XDG aislados) | 0 | 31/31, 0 excepciones, 8.7 s |
Entorno: Node 22.22.3, Electron 44.7.0 local (`npm ci` del propietario ya hecho), Python 3.14.8.
Coincide con el insumo (206/50/31/1026×8/≈52 %). Sin regresión inicial → no se abre N-REG.

Cobertura por módulo (base del trinquete, más bajos primero): `__main__` 0, `cli` 0, `fps` 20, `procs` 21, `aura` 24, `app` 25, `power` 27, `settings` 30, `game_session` 36, `gpu` 44, `gpu_clocks` 45, `power_control` 45, `actions` 51, `hwmon` 51, `fans` 52, `benchmarks` 57; resto ≥75.

Archivos calientes (líneas): app.js 4128, main.js 1846, style.css 1559, i18n.js 770, app.py 372. Ningún dueño asignado (todos libres).

## Defectos nuevos detectados (priorizados)
| ID | Defecto | Evidencia | Etapa |
|---|---|---|---|
| N-DEF-01 | Batería: si el firmware solo expone `charge_*` (µAh) se muestra como Wh (son Ah) | `src/rog_monitor/power.py:115-123` | S05 (N-B-06, test RED con fake sysfs) |
| N-DEF-02 | 0 que significa "sin dato": `cpu.hot90`, `throttle_count`, `core_grid[].usage` (usage_ok sin consumidor), tasas de disco, `ram_*`, `uptime_s`, `rx/tx`, `battery.on_ac=false` sin adaptador | ver F2-01 §3.1 | S03 (A4 estados) |
| N-DEF-03 | Una excepción en un lector descarta el tick entero sin señal al renderer | `app.py:113-167`, `276-281` | S06 (N-B-11) |
| N-DEF-04 | Coste por tick: 2 escaneos de /proc, NVML init/shutdown por tick, fan-curves/guardian leídos 2-3 veces | F2-01 §2 | S09 / F3-08 |
| N-DEF-05 | Fixture `snapshot-v1.json` sin `ts` ni series `ram_gb/swap_gb/gpu_util` que el renderer sí lee | `tests/fixtures/snapshot-v1.json` | S09 (F2-08 gate) |

Rollback: solo documentos; `git revert` del commit de S00.
Siguiente: S01 — primer test RED N-A1-01 (CDP, 5 tarjetas de benchmark, detectar recorte).
