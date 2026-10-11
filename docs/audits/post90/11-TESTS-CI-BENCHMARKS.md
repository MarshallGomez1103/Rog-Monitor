# 11 · Pruebas, rendimiento y CI/CD

Todo lo de esta sección se ejecutó en la auditoría (**PROBADO**), salvo lo marcado como NO PROBADO.

- cwd: `~/MyFiles/Dev/Rog-Monitor`, HEAD `7d49333`.
- Logs completos en `evidencia/test-*.log`; resumen en `evidencia/test-resumen.txt`.

## Comandos ejecutados y resultados

| # | Comando | Duración | Exit | Resultado |
|---|---|---|---|---|
| 1 | `python3 -m py_compile src/rog_monitor/*.py` | 0.1 s | 0 | 27 módulos compilan |
| 2a | `PYTHONPATH=src HOME=<tmp> python3 -m unittest discover -s tests -v` | 29 s | **1** | 125 corridos, 5 failures y 6 errors. Causa: `ModuleNotFoundError: No module named 'rich'`, porque el `HOME` aislado oculta `~/.local/lib/python3.14/site-packages`. **Artefacto del entorno**, ver 2b |
| 2b | Igual que 2a + `PYTHONUSERBASE=$HOME/.local` | 48.2 s | **0** | **Ran 162 tests, OK** |
| 3 | `node --check` en `desktop/*.js`, `desktop/renderer/*.js` y `scripts/*.mjs` | 0.4 s | 0 | Sin errores de sintaxis |
| 4a | `node --test desktop/test` | 0.1 s | 0 | **21 tests**, pass 21. Solo carga `priv.test.js`, ver TST-01 |
| 4b | `node --test desktop/test/*.test.js` (lo que usan CI y CONTRIBUTING) | <1 s | 0 | **46 tests, pass 46** |
| 5 | `node scripts/validate-i18n.mjs` | <0.1 s | 0 | `i18n OK — 1009 claves × 8 idiomas; 262 refs en index.html; 11 comandos` |
| 6 | `bash -n` en install.sh, uninstall.sh y scripts/*.sh | <0.1 s | 0 | Sin errores de sintaxis |
| 7 | `git diff --check fbfee52 HEAD` | <0.1 s | 0 | Limpio |
| 8 | `node scripts/e2e-smoke.mjs --out evidencia/e2e` (Electron real, perfil y HOME aislados, CDP, sin clics privilegiados) | 12 s (7.4 s internos) | 0 | **29 pass, 0 fail, 0 excepciones, 0 console.error**. Captura: `evidencia/e2e/e2e-smoke.png` |
| 9 | `scripts/measure.py --cmd "python3 -m rog_monitor --json-stream --interval 1" --duration 45` | 45 s | 0 | Ver tabla de rendimiento |

### Tests Python por archivo (162 en total)
| Archivo | Tests | Qué ejerce |
|---|---|---|
| test_metrics.py | 22 | CPU/RAM/disco con fixtures `/proc` (t0/t1/t2/noswap) |
| test_install_dryrun.py | 21 | `install-system.sh --dry-run` y `ROG_PREFIX` sin root (se salta si corre como root) |
| test_smart_cache.py | 20 | Caché SMART y TTL |
| test_power_validation.py | 16 | Validación de entradas de poder y ventiladores |
| test_benchmarks.py | 13 | Percentiles y descripción de benchmarks |
| test_history_none.py / test_alerts.py | 11 / 11 | Huecos `None` en series; eventos, cooldown e histéresis |
| test_tui_render.py | 10 | Render TUI en varios tamaños |
| test_gpu_perf.py / test_backend_robustness.py | 9 / 9 | NVML/TTL (se salta sin nvidia-smi/NVML); stream resiliente |
| test_tui_input.py | 6 | pty real: ruido de ratón y teclas, Esc, SIGTERM, SIGWINCH |
| test_guardian_sim.py | 5 | Guardián en **simulación** (`ROG_THERMAL_DRY`), sin hardware |
| test_contract.py / test_series.py / test_ui_events.py | 4 / 3 / 2 | Contrato del snapshot schema 1; series; eventos en la UI |

### Tests Node (46)
priv.test.js 25, smart.test.js 8, bench.test.js 7, charts.test.js 7, contract.test.js 5, escape.test.js 3. La cuenta se hizo con `grep test(`; el runner reporta 46.

## Calidad de las pruebas (OBSERVADO)
- **Puntos fuertes:**
  - Hay contratos Python↔JS reales (`tests/test_contract.py` y `desktop/test/contract.test.js` sobre el mismo fixture saneado).
  - Hay pty real para la TUI.
  - Hay fixtures deterministas de `/proc`.
  - Hay tests negativos de la allowlist de pkexec (`priv.test.js`, rutas como `/dev/../etc/passwd`).
  - Hay dry-run del instalador.
- **Límites:**
  - El guardián solo se prueba en simulación. No hay escritura real de sysfs con fakes de `/sys` montados ni contrato con asusctl.
  - El instalador real (root, systemd) nunca se probó en VM.
  - El overlay no tiene test automatizado.
  - No hay test de minimizar/restaurar.
  - **No se midió cobertura** (no hay `coverage` instalado). No se afirma ningún porcentaje.
- `test_contract.test_live_producer_matches_spec` ejecuta el backend vivo. En un runner sin hardware ASUS valida la degradación, no los valores.
- El e2e acepta `ok|empty` por bloque. En CI pasa aunque no haya datos, así que demuestra arranque y ausencia de excepciones, no la exactitud de las métricas.

## CI (`.github/workflows/ci.yml`)
- **Pasos:** py_compile → unittest → JSON de device_profiles → smoke `--json` → `npm ci` → `node --check` → `node --test *.test.js` → validate-i18n → `electron-builder --linux dir` → `bash -n` → `install-system.sh --dry-run` → e2e con xvfb (Node 22) → subir la captura.
- **NO PROBADO en GitHub:** los commits que cambiaron el CI (`4791866`, `602c280`) nunca se han subido.
- **Diferencias de entorno:** CI usa Python 3.12 y Node 20 (el e2e usa 22); local usa 3.14 y 22. El paso e2e instala xvfb con `sudo apt-get`, lo normal en runners.
- **Dependabot:** npm semanal, pip mensual, actions mensual (`.github/dependabot.yml`).

## Dependencias, licencias y supply chain
- **Python:** `requirements.txt` = `rich>=13.0`, sin pin ni lock. El resto es stdlib; NVML va por `ctypes` y es opcional.
- **Node:** `electron@42.11.12` y `electron-builder@26.17.0` (devDependencies con `^`). Lock de 283 paquetes.
- **Licencias del lock:**
  - MIT 212, ISC 36, BSD-3 9, BlueOak 8, BSD-2 6, Apache-2.0 6.
  - Un paquete Python-2.0, dos WTFPL / WTFPL-dual, uno 0BSD, uno MIT/CC0.
  - Ninguna copyleft fuerte. El proyecto es MIT.
- **`npm audit` NO se ejecutó en esta auditoría** porque envía el árbol de dependencias al registro. El agente anterior hizo `npm audit fix` (commit `4791866`).
- **Secretos:** ninguno en el diff base..HEAD (ver 01).

## Rendimiento: overhead real del monitor
Hay dos mediciones. El agente anterior midió la base (`fbfee52`, `docs/agent-work/BASELINE.md`, no versionado). En esta auditoría se midió HEAD con el mismo script, el mismo intervalo de 1 s y la misma máquina. **Ojo:** la app real del propietario estaba abierta en ambos casos (ruido).

| Caso (backend `--json-stream --interval 1`) | CPU% media | p95 | max | RSS MB | PSS MB | ctx/s | spawns en 60 s | gap medio / p95 ms |
|---|---|---|---|---|---|---|---|---|
| fbfee52 (BASELINE, 60 s) | 3.53 | 6.97 | 8.14 | 50.7 | 40.2 | 31.8 | 88 (1.47/s) | 1127.6 / 1190.4 |
| **HEAD 7d49333 (auditoría, 45 s)** | **3.65** | 5.95 | 6.94 | 50.8 | 39.6 | 47.7 | **8 en 45 s (0.18/s)** | **1128.1 / 1171.4** |

Lectura:
- Los subprocesos bajaron unas 8 veces: ya no se lanza `nvidia-smi`, gracias a NVML por ctypes (`89d4719`). Quedan `busctl` de UPower, `asusctl leds get` y `busctl tree xyz.ljones.Asusd`.
- **La CPU media no bajó** (3.53 → 3.65 %, dentro del ruido) y los ctx-switch/s subieron (31.8 → 47.7). Hipótesis: hilos de caché TTL en segundo plano (`cached.py`). **No verificado.**
- **La deriva de cadencia sigue igual:** el gap medio es de 1128 ms con 1 s pedido. El tiempo de recolección (~130 ms) se suma al sleep en vez de descontarse. Esto ya figuraba en BASELINE y no se corrigió.
- Electron completo (BASELINE): PSS 406.7 MB, RSS 850 MB, 110 hilos, ~4 % CPU. **No se re-midió.** No hay medición de FPS ni de latencia de UI (CP-5.10 parcial).

### Benchmarks reproducibles propuestos (NO EJECUTADOS; requieren aprobación)
| Métrica | Herramienta | Condiciones | Separación |
|---|---|---|---|
| CPU media/p95, RSS/PSS, ctx/s, spawns | `scripts/measure.py --cmd/--pid`, 3 corridas de 120 s | AC, perfil fijo, ventana visible vs minimizada vs oculta, sin otras apps | backend solo / Electron completo / TUI / overlay abierto / Guardián en simulación |
| Wakeups | `perf stat -e sched:sched_wakeup -p PID` o `powertop --csv` (necesitan permisos; **pedir autorización**) | Reposo 5 min | por proceso |
| Cadencia real | `measure.py` (gap p50/p95) a 0.5/1/2/5 s | – | backend |
| Latencia UI y FPS de render | CDP `Performance.getMetrics` + `requestAnimationFrame` durante 60 s | ventana visible | renderer |
| Arranque | tiempo de `spawn` a primer snapshot pintado (marca CDP) | en frío y en caliente | Electron |
| Overhead sobre carga | `measure.py --bench-overhead --reps 3` (CPU sostenida, **calienta el equipo, requiere permiso**) | AC y temperatura inicial < 55 °C | backend on/off |

## Hallazgos
| ID | Severidad | Estado | Componente | Archivo:línea | Commit(s) | Evidencia/comando | Resultado | Impacto | Recomendación | Prueba de aceptación |
|---|---|---|---|---|---|---|---|---|---|---|
| TST-01 | P3 | verificado | Tests Node | `desktop/test/index.js:2-3` | 602c280/anteriores | `node --test desktop/test` → 21; con el glob → 46 | El índice solo carga `priv.test.js` | Quien corra la forma corta cree que pasó todo y se salta 25 tests | Que el índice cargue todos los `*.test.js`, o borrarlo y usar solo el glob | Ambas formas reportan 46 |
| TST-02 | P2 | verificado | CI | `.github/workflows/ci.yml` | 4791866, 602c280 | Sin push | CI nuevo jamás ejecutado en GitHub | El verde no está demostrado; el e2e con xvfb puede fallar en el runner | Push a una rama de PR y revisar el run | Run verde en la rama |
| TST-03 | P2 | verificado | Rendimiento | `scripts/measure.py`, backend | 89d4719 | Tabla de arriba | Spawns −90 %, pero CPU media sin cambio (3.53 → 3.65 %) y ctx/s +50 % | La mejora de rendimiento prometida no se refleja en CPU | Perfilar hilos de `cached.py` y el bucle de muestreo; descontar el tiempo de recolección del sleep | CPU media < 2.5 % a 1 s y gap medio < 1030 ms, 3 corridas |
| TST-04 | P2 | verificado | Cobertura | – | – | No hay `coverage` | Cobertura no medida | Huecos desconocidos | Medir con `coverage.py` en un venv (sin añadirlo al runtime) | Informe de cobertura adjunto |
| TST-05 | P2 | no verificado | Guardián/instalador | tests/test_guardian_sim.py, test_install_dryrun.py | 74fc4ff, 531ec9e | Leído | Solo simulación o dry-run; nada con systemd/sysfs reales | Los riesgos reales siguen sin cubrir | Pruebas en VM con snapshot (ver 10) | Checklist de VM firmada |
| TST-06 | P3 | verificado | Entorno | requirements.txt:1 | – | Corrida 2a | Tests dependientes del `site-packages` de usuario | No reproducible | venv documentado | Suite verde en venv limpio |
| TST-07 | P2 | no verificado | UI | – | – | No existe medición | FPS y latencia de UI sin medir (CP-5.10 parcial) | No se sabe el costo de render | Medir con CDP (tabla de arriba) | Informe con p95 de frame time |
