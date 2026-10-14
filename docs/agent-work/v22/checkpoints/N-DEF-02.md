# N-DEF-02 — «0 = sin dato» pasa a `null` (backend, S03-1b)
Estado: **TESTED** (2026-10-14) · Base: feat/v22 `c712548` · Autor: Sonnet-StatePython · Schema: **1 intacto** (los tipos de `tests/test_contract.py` ya admitían `num|null` / `bool|null`; ningún REQUIRED cambió). Parte renderer = S03-2 (Sonnet-StateWire).

Regla: `null` = la fuente no se pudo leer / no existe. `0` (o `false`) sigue siendo un valor real cuando el dato existe.

## 1. Campos cambiados (antes → después)
| Campo | Antes (sin dato) | Después (sin dato) | Cuándo es null | 0 legítimo |
|---|---|---|---|---|
| `cpu.hot90` | `0` | `null` | no hay ningún sensor de temperatura de CPU (`cores` vacío) | `0` con sensores y ninguno ≥ 90 °C |
| `cpu.throttle_count` | `0` | `null` | ningún `package_throttle_count` legible (sin sysfs de throttle) | `0` si el kernel reporta 0 |
| `cpu.throttle_ms` | `0` | `null` | ídem con `package_throttle_total_time_ms` | `0` real |
| `cpu.throttle_delta`, `throttle_ms_delta`, `throttled_now` | 0 / 0 / false | **sin cambio** (siempre numéricos; alerts.py los usa) | – | – |
| `battery.on_ac` | `false` (`any([])`) | `null` | no hay `ADP*/AC*` o ninguno es legible | `false` con al menos un adaptador legible y todos a 0; `true` si alguno =1 |
| `sys.ram_total_gb/used_gb/percent/available_gb/buffers_gb/cached_gb` | `0` (percent 0) | `null` | `/proc/meminfo` ilegible o sin `MemTotal` | valores reales |
| `sys.swap_used_gb/total_gb` | `0` | `null` | `/proc/meminfo` ilegible o sin `SwapTotal` | `0` = sin swap real (`swap_percent` sigue `null` sin swap, como antes) |
| `sys.uptime_s`, `sys.uptime_h` | `0.0` | `null` | `/proc/uptime` ilegible | `0.0` real |
| `sys.rx_mbps`, `sys.tx_mbps` | `0.0` | `null` | ver §2 | `0.0` = red quieta o contador que retrocede |

`_cpu_unavailable()` (app.py) alineado: `hot90`, `throttle_count`, `throttle_ms` = `null`. `_sys_unavailable()` ya los tenía en null.

Consumidores internos revisados: `alerts.py` (usa `or 0` / `None` ya tolerados), `benchmarks.py` (`or 0`; ver `power_source` abajo), `ui.py` (TUI ya mostraba N/A para estos null; `on_ac` null ahora no afirma fuente), renderer (`battery.js:228` ya hace `on_ac != null`).

Efectos laterales documentados:
- `benchmarks.py` `conditions.power_source`: `on_ac` null → `null` (antes `"battery"`). Cambio de una línea para no heredar el falso «batería».
- `ui.py` `profile_panel`: con `on_ac` null se muestra capacidad/estado sin rótulo «conectado/en batería».
- `SysReader._net_bytes(path)` ahora respeta `proc_root` (antes leía siempre el `/proc/net/dev` real, aun en tests).

## 2. Decisión: primera muestra de red (`rx/tx_mbps`)
`null` es lo honesto. La tasa es `null` cuando:
1. `/proc/net/dev` no se pudo leer ahora (se conserva la base: al volver a leer se mide sobre el intervalo completo);
2. no hay base todavía (la lectura inicial en `__init__` falló): la lectura actual pasa a ser la base y ese tick es `null`;
3. el intervalo desde la base es < 50 ms (`SysReader.NET_MIN_DT`, igual criterio que `_io_tick`): 1.er tick de la TUI justo tras construir el lector; dividir por unos ms daba picos absurdos. La base **no** avanza, así que el siguiente tick mide sobre el intervalo real.
`--json` / `--json-stream` cebaron antes con `sleep(0.5)`, así que su primera línea ya trae tasa. Un contador que baja (interfaz recreada) sigue dando `0.0`, nunca negativo.

## 3. `procs_vram.reason_code` (aditivo; `reason` se conserva)
`procs_vram = {available, reason, reason_code, vendor, procs}`. Disponible → `reason: ""`, `reason_code: null`. Tabla única en `gpu.py` (`VRAM_REASONS`; `reader_unavailable` en `app._vram_unavailable`). El renderer debe traducir por **código**, usando `reason` solo como respaldo para código desconocido.

| `reason_code` | Significado | `reason` (es, compat) | Qué decir / acción |
|---|---|---|---|
| `warming_up` | 1.er tick, el hilo aún no leyó | sin datos todavía | estado `loading` (no error) |
| `no_nvidia` | sin `nvidia-smi` y sin dGPU NVIDIA en PCI | nvidia-smi no está disponible | `unsupported` (equipo sin NVIDIA); no atribuir a fallo |
| `dgpu_asleep` | dGPU en runtime-suspend (D3): no se la despierta a propósito | la dGPU NVIDIA no está activa | `empty` informativo («dGPU en reposo»); sin acción de reintento |
| `dgpu_inactive` | hay otra GPU activa (iGPU/AMD), la dGPU no se consultó | la dGPU NVIDIA no está activa | `empty` («GPU activa no es NVIDIA») |
| `nvml_error` | NVML falló (init/símbolo) y nvidia-smi tampoco dio lista | el driver NVIDIA no expuso la lista de procesos | `error` con `retry`/`explain` |
| `smi_error` | NVML no disponible y nvidia-smi sin respuesta | (igual) | `error` con `retry`/`explain` |
| `no_nvidia_tools` | dGPU en PCI pero ni NVML ni nvidia-smi | (igual) | `unsupported` + `install` (solo explicación, ningún comando automático) |
| `reader_unavailable` | el lector entero lanzó (app.py `_safe`) | lector no disponible | `error` del lector; **no** atribuirlo al hardware |

## 4. Otras razones del backend (sin tocar aquí)
`aura.tiles[].reason` y `power_control.*.reason` siguen siendo texto libre en inglés (fuera del alcance de este CP; candidatos a código en un CP aparte).

## 5. Tests (TDD: RED visto antes de cada GREEN)
Nuevo `tests/test_state_nulls.py` (CPU, sys, reason_code, sin `/sys` ni `/proc` reales) + ajustes en `test_power_fake_sysfs.py`, `test_gpu_sleep.py`, `test_metrics.py`, `test_app_orchestration.py`, `test_benchmark_simulation.py`, `test_tui_unavailable.py`.
- RED 1 (cpu): 4 fallos (`hot90`/`throttle_*` = 0, `_cpu_unavailable`). 
- RED 2 (on_ac): 4 fallos (power ×2, TUI, benchmarks).
- RED 3 (sys): 8 fallos (meminfo ×2, uptime, red ×5).
- RED 4 (reason_code): 10 entre `test_gpu_sleep` y `test_state_nulls`.
- Punto 5 (TUI): los tests nuevos de N/A pasaron sin cambio extra de `ui.py` (salvo `on_ac`, ya en el punto 2).
Suite completa verde (983 tests, 1 skip); cobertura 94,90 % → 95,17 % (`--fail-under=80`).

## 6. Para el renderer (S03-2)
Campos que ahora pueden ser `null` y antes eran 0/false: `cpu.hot90`, `cpu.throttle_count`, `cpu.throttle_ms`, `battery.on_ac`, `sys.ram_*_gb`, `sys.ram_percent`, `sys.swap_used_gb`, `sys.swap_total_gb`, `sys.uptime_s`, `sys.uptime_h`, `sys.rx_mbps`, `sys.tx_mbps` (este último también en el 1.er tick). Verificar `fmt()`, `clampPct()` y `fmtUptime()` (`app.js:1979` ya cae a `0` con `?? ... : 0`: mostrará «0» en vez de N/A) con null.
