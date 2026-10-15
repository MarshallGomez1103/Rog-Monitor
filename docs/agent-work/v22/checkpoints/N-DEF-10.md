# N-DEF-10 — 4 defectos de `src/rog_monitor/fans.py`
Estado: PENDIENTE DE INTEGRACIÓN (Opus)
Agente: Sonnet-Fans | Base: d1fe76b (feat/v22) | Rama: worktree-agent-aa7d7d26f770608e4
Autorización: propietario, 2026-10-14. Sin tocar curvas por defecto, `scripts/rog-profile-sync.sh`, guardián ni scripts/servicios root.
Archivos: `src/rog_monitor/fans.py`, `tests/test_fans_defects.py` (nuevo). Sin /sys real: tmpdirs, `hwmon.HWMON_ROOT`, `fans.FAN_CURVES_FILE`, `fans.GUARDIAN_STATE_FILE` y reloj falso parcheados.

| # | Defecto | SHA | RED (solo `test_fans_defects.py`, antes del arreglo) | GREEN |
|---|---|---|---|---|
| 1 | `updated` futuro => guardián "vivo" / tope Gaming indefinido (`guardian_status`, `_gaming_cap`) | bada8b3 | 2 FAIL + 3 ERROR (falta `GUARDIAN_CLOCK_SKEW`) | 67/67 |
| 2 | `load_schema_version`: docstring "1 si falta" vs código 2 | d1e0a13 | 1 FAIL (docstring) + 1 ERROR (`version: NaN/Infinity` lanzaba) | 72/72 |
| 3 | `{**DEFAULT_MAX, **stored}` con `fan_max_rpm` no dict => TypeError | 41b6f3c | 1 ERROR (TypeError) + 1 FAIL (entradas no numéricas) | 75/75 |
| 4 | `isinstance(v,(int,float))` acepta `True` (1 rpm); NaN/inf/negativos | f2c1fc0 | 3 FAIL + 2 ERROR (OverflowError con `Infinity`) | 80/80 |

## Decisiones
- 1: `_state_is_fresh`: `-GUARDIAN_CLOCK_SKEW (5 s) <= edad < GUARDIAN_STATE_MAX_AGE (30 s)`. El límite superior sigue **estricto** (`<`), como `rog-profile-sync.sh:294`; `bool`/NaN/no numérico => no fresco.
- 2: consumidor único `FanReader.meta()` (stream NDJSON); `test_meta_without_any_file` ya fijaba 2 (el primer guardado crea un v2). Se conserva el 2 y se corrige el docstring. Extra: `version` NaN/inf/bool => 1 (antes `int()` lanzaba).
- 3: se usa `fan_max_rpm` solo si es dict y solo sus entradas con RPM válido.
- 4: `_valid_rpm` (finito, > 0, no bool) en `_store_section` y `_gaming_cap`. Un override por perfil inválido se ignora y rige el cap global.

## Regresión
`HOME=<tmp> COVERAGE_FILE=<tmp>/.coverage PYTHONPATH=src …/venv-clean/bin/python -s -m coverage run --source=src/rog_monitor -m unittest discover -s tests`
=> Ran 1004, OK (skipped=1). Cobertura `fans.py` 99.17 % (2 líneas sin cubrir), TOTAL 95.18 % (gate 80).

## Riesgo abierto (fuera de alcance)
`scripts/rog-profile-sync.sh:294` (vigilante, root) aplica el mismo criterio con `< 30` sin cota inferior: un `updated` futuro sigue dándole el tope Gaming allí. Requiere decisión/ejecución del propietario.

Rollback: `git revert f2c1fc0 41b6f3c d1e0a13 bada8b3`.
