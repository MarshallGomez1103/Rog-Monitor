# 03 · Inventario del repositorio (ROG Monitor, rama master, HEAD 7d49333)

Auditoría post-v21.0.0 · solo lectura · generado por el auditor INV (Haiku 5.5) sobre `~/MyFiles/Dev/Rog-Monitor`.
Base del plan: `fbfee52` (v20.0.0). Commits locales sin push: 54 (`git log fbfee52..HEAD`).

**Leyenda de etiquetas**: OBSERVADO (leí el código) · PROBADO (ejecuté y vi el resultado) · NO PROBADO · HIPÓTESIS.
**Estado de implementación**: implementado · parcial · muerto (sin consumidor) · dato.

**Notas de método**
- `git ls-files` = 166 archivos. Líneas con `wc -l`. Binarios (10): PNG/GIF/icono PNG, sin líneas.
- Entrantes/salientes: derivados de `grep` por ruta/basename sobre archivos de código (docs excluidos), verificados a mano para los casos que importan.
- No se ejecutó Electron (GUI), ni AppImage, ni instaladores, ni `systemctl`, ni nada que escriba en sistema. Todo lo ejecutado es test puro o lectura (ver §5).
- Efecto colateral mío corregido: `py_compile` creó `src/rog_monitor/__pycache__/` (27 `.pyc` con marca de 23:35). Lo eliminé. Los `__pycache__` de `tests/`, `scripts/`, `src/legacy/` y `desktop/dist/` ya existían (18:xx y jun), no los toqué.

---

## 1. Resumen cuantitativo

| Componente | Archivos | Líneas (texto) | Notas |
|---|---|---|---|
| Backend Python `src/rog_monitor/` | 29 (27 `.py` + 2 `.json`) | 8 573 (8 041 `.py` + 532 `.json`) | `i18n.py` 999, `aura.py` 784, `power_control.py` 818 |
| Electron núcleo `desktop/*.js`, `start.sh`, `package*.json` | 7 | 5 883 (incl. lock 3 588) | `main.js` 1 841 |
| Renderer `desktop/renderer/` (JS + HTML) | 19 (17 JS + 2 HTML) | 15 777 JS + 1 097 HTML | `app.js` 3 993, `roadmap.js` 2 518 |
| Renderer CSS `desktop/renderer/style.css` + `styles/` | 14 | 6 753 | 26 `!important` |
| Scripts `scripts/` | 22 | 3 671 (sh 2 866, py 266, mjs 539) | `rog-thermal-guardian.sh` 949 |
| systemd / instaladores raíz | 8 | 214 | 5 unidades + 1 regla udev (`systemd/`), `install.sh`, `uninstall.sh` |
| Tests Python `tests/` | 16 `.py` + 9 fixtures | 2 766 (`.py`) + 1 014 (fixtures, incl. snapshot 947) | 162 casos |
| Tests Node `desktop/test/` | 7 | 591 | 46 casos |
| CI y dependabot | 2 | 110 | `ci.yml` 95, `dependabot.yml` 15 (plantillas de issue: 55 líneas, ver §2.8) |
| Documentación (`docs/`, raíz, plantillas) | 18 md | 2 274 (`docs/` 1 165, raíz 1 054, plantillas 55) | ADR x5, ARCHITECTURE 248 |
| Assets | 10 (binarios) + 1 SVG | — | 7 capturas + GIF demo + icono |
| i18n (dentro de los anteriores) | — | `i18n.py` 999 + `i18n.js` 757 + ~870 entradas inline en el renderer | ver §2.9 |

Total texto: 48 776 líneas (incluye `package-lock.json` 3 588 y `snapshot-v1.json` 947).

---

## 2. Inventario por componente

Columnas: **Ruta** · **Lenguaje** · **Líneas** · **Responsabilidad** · **Dependencias (salientes)** · **Llamadas entrantes** · **Entrypoint** · **Estado** · **Evidencia de ejecución**.

### 2.1 Backend Python (`src/rog_monitor/`)

| Ruta | Lenguaje | Líneas | Responsabilidad | Dependencias (salientes) | Llamadas entrantes | Entrypoint | Estado | Evidencia de ejecución |
|---|---|---|---|---|---|---|---|---|
| `src/rog_monitor/__init__.py` | Python | 24 | `__version__` desde `VERSION` o env `ROG_MONITOR_VERSION` | os, pathlib | todos los módulos | no | implementado | indirecta (importado por tests) |
| `src/rog_monitor/__main__.py` | Python | 6 | `python -m rog_monitor` → `cli.main` | cli | interpreter, `main.js:151` | sí | implementado | PROBADO (stream y `--json` en esta sesión; CI snapshot) |
| `src/rog_monitor/cli.py` | Python | 71 | Argumentos; `--procs-all`, `--desktop` (lanza `desktop/start.sh`), `--json`, `--json-stream`, `--once`; TUI por defecto | `__init__`, `procs` y `app` (import diferido), subprocess | `__main__.py` | sí (dispatch) | implementado | `test_tui_input.py` (pty) PROBADO |
| `src/rog_monitor/app.py` | Python | 346 | `App`: `sample()` (un tick), `snapshot_json()` (schema 1), `run()` TUI, `run_json()` NDJSON, `handle_key`, GPU toggle en hilo | rich (Console, Live), ui, actions, alerts, aura, config, cpu, fans, fps, gpu, history, i18n, keys, power, power_control, procs, sysinfo | `cli.py:62,64` | no (lo llama cli) | implementado | `test_contract`, `test_tui_render`, `test_tui_input`, `test_backend_robustness` PROBADO |
| `src/rog_monitor/actions.py` | Python | 90 | Acciones de usuario: ciclar perfil PPD (busctl), cambiar modo GPU (supergfxctl), exportar historial | csv, json, subprocess, config, power | `app.py` | no | implementado | `test_series`, `test_history_none` (indirecto) PROBADO |
| `src/rog_monitor/alerts.py` | Python | 166 | `AlertEngine`: umbrales, histéresis, cooldown, dedupe, `deque(maxlen=60)` de eventos, `notify-send` | shutil, subprocess, deque, config, i18n | `app.py` (`alerts.check` cada tick) | sí (bloque `__main__` de autotest) | implementado | `test_alerts` (11) y `test_ui_events` (2) PROBADO |
| `src/rog_monitor/aura.py` | Python | 784 | Iluminación ASUS: asusctl/busctl, efectos, perfiles, sonda OpenRGB `127.0.0.1:6742` | cached, config, socket, subprocess, copy | `app.py:56`; CLI `python -m rog_monitor.aura` (main.js) | sí (CLI) | implementado | `test_backend_robustness`, `test_contract` PROBADO (parcial) |
| `src/rog_monitor/benchmarks.py` | Python | 554 | Benchmarks CPU/GPU reproducibles: warm-up, repeticiones, p50/p95/p99, export | cpu, fans, gpu, hwmon, power, config | `main.js:327` vía `runBenchmarkModule` | sí (CLI) | implementado | `test_benchmarks` (13) PROBADO |
| `src/rog_monitor/cached.py` | Python | 64 | `Cached(fn, ttl, backoff_max)`: último valor bueno, refresco en hilo daemon, backoff exponencial | threading, time | `aura.py`, `gpu.py`, `power.py` | no | implementado | `test_gpu_perf` (9), `test_smart_cache` PROBADO |
| `src/rog_monitor/config.py` | Python | 124 | `DEFAULTS`, `_merge`, `Config.save` (atómico), `write_atomic`, `backup_corrupt`; rutas XDG | json, os, shutil, tempfile, pathlib | `actions`, `settings`, `app`, `benchmarks`, `aura`, `fans`, `game_session` | no | implementado | `test_backend_robustness` PROBADO |
| `src/rog_monitor/cpu.py` | Python | 216 | Temperatura por núcleo, frecuencia (kHz→GHz, `cpu.py:17`), throttling, uso total | glob, re, statistics, hwmon | `app.py`, `benchmarks.py`, `game_session.py` | no | implementado | `test_metrics`, `test_alerts`, `test_series` PROBADO |
| `src/rog_monitor/device_docs.json` | JSON | 328 | Docs por marca/componente (Centro de Poder, modo avanzado) | — | `main.js:1628` (`get-device-docs`) | dato | dato | Sin validación en CI (solo `device_profiles.json` se valida) |
| `src/rog_monitor/device_profiles.json` | JSON | 204 | Perfiles de potencia por modelo (asus-armoury) | — | `power_control.py:53` | dato | dato | CI: `json.load` PROBADO |
| `src/rog_monitor/fans.py` | Python | 514 | `FanReader`: RPM, estado de curvas (`fan-curves.json` schema 2), cap RPM, `persist_max`, estado del guardián | copy, json, sys, time, hwmon, config | `app.py`, `benchmarks.py`, `game_session.py`; `rog-profile-sync.sh` lee el JSON | sí (CLI `python -m rog_monitor.fans`) | implementado | `test_power_validation`, `test_alerts`, `test_contract` PROBADO |
| `src/rog_monitor/fps.py` | Python | 94 | FPS desde el CSV de MangoHud más reciente (≤5 s) | os, time, pathlib | `app.py` (`read_fps`) | sí (`__main__`) | implementado | `test_tui_render`, `test_contract` PROBADO |
| `src/rog_monitor/game_session.py` | Python | 489 | Sesiones de juego: muestreo, baseline, comparación, notas en `~/.local/share/rog-monitor/game-sessions` | config, cpu, fans, gpu, hwmon, power, procs | `main.js:1204-1220` (`game-session-*`) | sí (CLI) | implementado | `test_backend_robustness` (parcial) PROBADO |
| `src/rog_monitor/gpu.py` | Python | 328 | GPU: NVML (vía `gpu_clocks`), `nvidia-smi` de respaldo, AMD hwmon, guarda dGPU suspendida, lista VRAM por proceso | cached, gpu_clocks, hwmon, subprocess, shutil | `app.py:49,97,133`, `benchmarks.py`, `game_session.py` | no | implementado | `test_gpu_perf`, `test_guardian_sim`, `test_tui_render` PROBADO |
| `src/rog_monitor/gpu_clocks.py` | Python | 406 | NVML por ctypes: telemetría y offsets (lectura; escritura solo root vía `apply-gpu-clocks.sh`) | ctypes, json, os, sys | `gpu.py`, `power_control.py` | sí (CLI) | implementado | `test_gpu_perf`, `test_backend_robustness` PROBADO |
| `src/rog_monitor/graph.py` | Python | 41 | Gráfica de texto para TUI | — | `ui.py` | no | implementado | `test_history_none` PROBADO |
| `src/rog_monitor/history.py` | Python | 50 | `Series`: ventana temporal (900 s por defecto), `avg/min/max`, `values()` | time, collections | `app.py:60-70` | no | implementado | `test_series`, `test_history_none` PROBADO |
| `src/rog_monitor/hwmon.py` | Python | 63 | Lectura sysfs hwmon (`read_int`, `read_str`, `scan`) | pathlib | `cpu`, `gpu`, `power`, `fans`, `sysinfo`, `app`, `benchmarks`, `game_session` | no | implementado | `test_metrics`, `test_gpu_perf` PROBADO |
| `src/rog_monitor/i18n.py` | Python | 999 | Traductor TUI, 8 idiomas (`STRINGS` en líneas 8, 131, 253, 375, 497, 619, 740, 862) | os | `app.py:23,45` | no | implementado | `test_tui_render` (indirecto) PROBADO |
| `src/rog_monitor/keys.py` | Python | 111 | `KeyReader` en cbreak, parser de teclas; descarta ratón SGR/X10 (ADR-0003) | os, select, sys, termios, tty | `app.py:24` | no | implementado | `test_tui_input` (6) PROBADO |
| `src/rog_monitor/power.py` | Python | 158 | RAPL en W (µJ delta, `power.py:49`), perfil PPD (busctl, `Cached` 3 s), batería | glob, subprocess, time, hwmon, cached | `app.py:25`, `actions.py`, `benchmarks.py`, `game_session.py` | sí (`__main__`) | implementado | `test_power_validation`, `test_alerts`, `test_guardian_sim` PROBADO |
| `src/rog_monitor/power_control.py` | Python | 818 | Centro de Poder: lectura de firmware-attributes; escritura vía `pkexec` a `apply-power-control.sh` / `apply-gpu-clocks.sh`; perfiles | json, os, subprocess, time, gpu_clocks | `app.py:26`, `main.js:1691`, `rog-profile-sync.sh:116` (como root) | sí (CLI) | implementado | `test_power_validation` (16), `test_install_dryrun` PROBADO |
| `src/rog_monitor/procs.py` | Python | 175 | Procesos: top CPU (delta), por núcleo (`last_cpu`), top memoria; tope de 1 s con SIGALRM (`procs.py:24-33`) | contextlib, os, signal, pathlib, time | `app.py:27`, `cli.py:43` (`--procs-all`), `game_session.py` | sí (`__main__`) | implementado | `test_metrics`, `test_tui_render` PROBADO |
| `src/rog_monitor/settings.py` | Python | 221 | CLI de ajustes (`get`, `update --json`) para la UI | argparse, json, re, config | `main.js:922,930` | sí (CLI) | implementado | `test_backend_robustness` (indirecto) PROBADO |
| `src/rog_monitor/sysinfo.py` | Python | 591 | RAM/swap, disco (lee caché SMART sin root `~/.cache/rog-monitor/smart.json`), red, carga, DMI | json, os, re, shutil, time, hwmon, sys | `app.py:28` | sí (`__main__`) | implementado | `test_metrics`, `test_smart_cache` PROBADO |
| `src/rog_monitor/ui.py` | Python | 538 | Render Rich del TUI (paneles, tablas, 3 temas `rog`/`ice`/`matrix`) | rich (align, console, panel, table, text), graph | `app.py:14` | no | implementado | `test_tui_render` (10), `test_ui_events` PROBADO |

### 2.2 Electron núcleo (`desktop/`)

| Ruta | Lenguaje | Líneas | Responsabilidad | Dependencias (salientes) | Llamadas entrantes | Entrypoint | Estado | Evidencia de ejecución |
|---|---|---|---|---|---|---|---|---|
| `desktop/main.js` | JavaScript | 1 841 | Proceso principal: ciclo del backend (spawn, SIGSTOP/SIGCONT, watchdog, respawn), 61 `ipcMain.handle`, overlay, bandeja, música (pw-record), benchmarks, guardián, actualizaciones, config | electron, child_process, `priv.js`, `smart.js`, fs, os, path; python; pkexec (vía priv); supergfxctl, busctl, git, systemctl | `preload.js` (61 invoke), `package.json` `main` | sí (`main`) | implementado, monolítico (ver ARC-06) | node --check PROBADO; sin test unitario; E2E solo en CI (NO PROBADO aquí) |
| `desktop/preload.js` | JavaScript | 94 | `contextBridge.exposeInMainWorld('rog', …)`: 69 claves (61 invoke, 6 suscripciones `on*`, `zoom`, `zoomTo`) | electron (contextBridge, ipcRenderer, webFrame), localStorage | `BrowserWindow` (preload en `main.js:1423,1505`) | sí (preload) | implementado | node --check PROBADO; cruce invoke↔handle 61/61 PROBADO |
| `desktop/priv.js` | JavaScript | 199 | Frontera de privilegios: `HELPERS` (lista cerrada, 18-25), `resolveHelper` (VERSION, uid 0, sin escritura de otros), `pkexecArgv`, validadores de batería, ventiladores, potencia, guardián | fs, path | `main.js` (runPriv, privHelper, validaciones) | no | implementado | `desktop/test/priv.test.js` (21) PROBADO |
| `desktop/smart.js` | JavaScript | 106 | Caché SMART: `buildEntry`, `writeAtomic` (0600 + rename), `classifyFailure` | fs, os, path | `main.js:10,905,912,915` | no | implementado | `desktop/test/smart.test.js` (8) PROBADO |
| `desktop/start.sh` | Bash | 20 | Arranque del binario Electron; `npm install` si falta `node_modules` | npm, electron | `cli.py:57` (`monitor --desktop`), `scripts/install-desktop.sh` | sí | implementado | `bash -n` PROBADO; ejecución NO PROBADA (abre GUI) |
| `desktop/package.json` | JSON | 35 | Manifiesto: `electron ^42.5.0`, `electron-builder ^26.15.3`, build AppImage, `extraResources` (src, scripts, systemd, VERSION, requirements) | — | `npm ci` (CI), `start.sh` | sí | implementado | CI `npm ci` y `electron-builder --linux dir` (solo en CI) |
| `desktop/package-lock.json` | JSON | 3 588 | Lockfile v3, 284 entradas | — | `npm ci` | dato | dato | verificado (ver §3) |
| `desktop/assets/icon.png` | binario | — | Icono de la app (`main.js` createWindow, electron-builder) | — | `main.js:1503`, `package.json` | dato | dato | — |
| `desktop/assets/icon.svg` | SVG | 14 | Fuente vectorial del icono | — | ninguna | dato | dato | — |

### 2.3 Renderer (`desktop/renderer/`)

Orden de carga real (`index.html:846-860`): `i18n.js`, `battery.js`, `disks.js`, `app.js`, `power.js`, `widget-states.js`, `wizard.js`, `dashboard.js`, `roadmap.js`, `game-session.js`, `cores.js`, `bench-detail.js`, `diagnostics.js`, `event-detail.js`, `commands.js`. El overlay carga solo `overlay.js` (`overlay.html:233`).

| Ruta | Lenguaje | Líneas | Responsabilidad | Dependencias (salientes) | Llamadas entrantes | Entrypoint | Estado | Evidencia de ejecución |
|---|---|---|---|---|---|---|---|---|
| `desktop/renderer/index.html` | HTML | 862 | Ventana principal: CSP (`index.html:5`, `script-src 'self'`), 14 `<link>` CSS, 15 `<script>` | — | `main.js` (`loadFile`) | sí | implementado | validate-i18n recorre `data-i18n` (CI) PROBADO |
| `desktop/renderer/overlay.html` | HTML | 235 | Overlay siempre encima y click-through; CSP `default-src 'self'` (`overlay.html:5`); CSS inline | — | `main.js:1420-1440` (`createOverlay`) | sí | implementado | sin test |
| `desktop/renderer/overlay.js` | JavaScript | 204 | Pinta stats en el overlay (`onStats` línea 187, `onOverlayConfig` línea 193) | window.rog | `overlay.html:233` | sí | implementado | sin test; comentario `overlay.js:3` menciona `onOverlayLang` inexistente |
| `desktop/renderer/i18n.js` | JavaScript | 757 | `window.i18n`/`window.t`: `register`, `apply`, `onChange`, `set`, `get`; persiste idioma en localStorage; 487 entradas inline | localStorage | `index.html:846` (primero) | sí | implementado | `validate-i18n.mjs` (CI) PROBADO: 1 009 claves × 8 |
| `desktop/renderer/battery.js` | JavaScript | 281 | Panel de batería y límite de carga | window.rog (setBatteryLimit) | `index.html:847` | sí | implementado | sin test directo |
| `desktop/renderer/disks.js` | JavaScript | 594 | Panel de discos y SMART (readSmart, disk-health); usa `escapeHtml` global de app.js | window.rog (readSmart), escapeHtml | `index.html:848` | sí | implementado | sin test directo |
| `desktop/renderer/app.js` | JavaScript | 3 993 | Núcleo UI: `update(stats)` (línea 1838), dashboard, perfiles, ventiladores y curvas, Aura, benchmarks, procesos, ajustes, eventos; 147 funciones de nivel superior | window.rog (~100 llamadas), window.i18n, módulos `Rog*` | `index.html:849` | sí | implementado, monolítico (ver ARC-07) | `escape.test.js`, `charts.test.js` por regex PROBADO (parcial) |
| `desktop/renderer/power.js` | JavaScript | 1 839 | Centro de Poder: PL1/PL2/boost, offsets GPU, docs de dispositivo | window.rog (get/set-power-control, docs), i18n | `index.html:850` | sí | implementado | sin test directo; sí validate-i18n |
| `desktop/renderer/widget-states.js` | JavaScript | 175 | Estado de widgets (suscriptor independiente de stats y backend-down) | window.rog | `index.html:851` | sí | implementado | sin test |
| `desktop/renderer/wizard.js` | JavaScript | 306 | Asistente de primer arranque; detecta ventiladores con `onStats` (`wizard.js:229-238`, una sola suscripción) | window.rog | `index.html:852` | sí | implementado | sin test |
| `desktop/renderer/dashboard.js` | JavaScript | 841 | Tablero arrastrable; preferencias en `window.rogPrefs` | localStorage | `index.html:853` | sí | implementado | sin test |
| `desktop/renderer/roadmap.js` | JavaScript | 2 518 | Contenido de roadmap (`ROADMAP_CURRENT/DONE/TODO`, `roadmap.js:1685`) y su render | i18n | `index.html:854` | sí | implementado; contenido de producto dentro de la UI | sin test |
| `desktop/renderer/game-session.js` | JavaScript | 1 716 | Sesión de juego en UI (grabar, resumen, comparar); puente `window.rog.gameSession*` y `setRecording` | window.rog, escapeHtml (global de app.js, sin guard en `game-session.js:665-668`) | `index.html:855` | sí | implementado | sin test; E2E (CI) |
| `desktop/renderer/cores.js` | JavaScript | 616 | Detalle por núcleo con `procs_by_core` | window.rog (onStats), escapeHtml | `index.html:856` | sí | implementado | sin test |
| `desktop/renderer/bench-detail.js` | JavaScript | 697 | Detalle de benchmarks (`window.RogBenchDetail`) | window.t, window.rog (exportBenchmark) | `index.html:857` | sí | implementado | `desktop/test/bench.test.js` (vm) PROBADO |
| `desktop/renderer/diagnostics.js` | JavaScript | 524 | Modal de diagnóstico (solo UI, sin puente IPC propio) | — | `index.html:858` | sí | implementado | sin test |
| `desktop/renderer/event-detail.js` | JavaScript | 404 | Detalle de eventos (`window.RogEventDetail`) | — | `index.html:859` | sí | implementado | sin test |
| `desktop/renderer/commands.js` | JavaScript | 133 | Lista transparente de comandos pkexec (`cmd.intro`) | i18n | `index.html:860` | sí | implementado | validate-i18n (CI) PROBADO |
| `desktop/renderer/__selfcheck_bench_i18n.js` | JavaScript | 179 | Self-check Node de claves i18n de bench (usa un shim propio, no el real) | — | manual (`node …`); no cargado por index.html | no | implementado; huérfano en CI | ejecutado aquí: 42 OK, 0 fallos PROBADO; no está en CI; viaja en el AppImage |
| `desktop/renderer/style.css` | CSS | 1 539 | Capa base de estilos | — | `index.html:8` | sí | implementado | sin test |
| `desktop/renderer/styles/tokens.css` | CSS | 129 | Tokens (`:root`), 5 marcas TODO (INV-07) | — | `index.html:7` | sí | implementado | `contrast-check.mjs` lo cita; no se ejecuta |
| `desktop/renderer/styles/neon.css` | CSS | 659 | Tema neón por nivel | — | `index.html:9` | sí | implementado | sin test |
| `desktop/renderer/styles/power.css` | CSS | 743 | Centro de Poder | — | `index.html:10` | sí | implementado | sin test |
| `desktop/renderer/styles/lighting.css` | CSS | 164 | Iluminación Aura | — | `index.html:11` | sí | implementado | sin test |
| `desktop/renderer/styles/onboarding.css` | CSS | 471 | Asistente | — | `index.html:12` | sí | implementado | sin test |
| `desktop/renderer/styles/dashboard.css` | CSS | 277 | Tablero | — | `index.html:13` | sí | implementado | sin test |
| `desktop/renderer/styles/extras.css` | CSS | 1 238 | Parches y ajustes posteriores (mayor de la cascada) | — | `index.html:14` | sí | implementado | sin test |
| `desktop/renderer/styles/game-session.css` | CSS | 623 | Sesión de juego | — | `index.html:15` | sí | implementado | sin test |
| `desktop/renderer/styles/cores.css` | CSS | 367 | Núcleos | — | `index.html:16` | sí | implementado | sin test |
| `desktop/renderer/styles/battery.css` | CSS | 89 | Batería | — | `index.html:17` | sí | implementado | sin test |
| `desktop/renderer/styles/disks.css` | CSS | 169 | Discos | — | `index.html:18` | sí | implementado | sin test |
| `desktop/renderer/styles/diagnostics.css` | CSS | 246 | Diagnóstico | — | `index.html:19` | sí | implementado | sin test |
| `desktop/renderer/styles/a11y.css` | CSS | 39 | Accesibilidad | — | `index.html:20` | sí | implementado | sin test |

### 2.4 Scripts (`scripts/`)

Columnas adaptadas: los scripts de root no tienen "llamadas salientes" de app; se indica quién los invoca.

| Ruta | Lenguaje | Líneas | Responsabilidad | Dependencias (salientes) | Llamadas entrantes | Entrypoint | Estado | Evidencia de ejecución |
|---|---|---|---|---|---|---|---|---|
| `scripts/install.sh` | Bash | 44 | Instalador de usuario sin sudo: `.venv`, `rich`, comando `monitor` en `~/.local/bin` | pip, python3 | `install.sh:19`, `install-all.sh:11`, CONTRIBUTING:28 | sí | implementado | `bash -n` (CI). No ejecutado |
| `scripts/install-desktop.sh` | Bash | 32 | Dependencias npm de la app de escritorio | npm | `install.sh:23`, `install-all.sh:14` | sí | implementado | `bash -n` (CI). No ejecutado |
| `scripts/install-all.sh` | Bash | 26 | Duplica el flujo de `install.sh` raíz (ver INV-05) | install.sh, install-desktop.sh | ninguna (manual) | sí | implementado; duplicado | `bash -n` (CI). No ejecutado |
| `scripts/install-system.sh` | Bash | 179 | Instalador root: `/usr/local/libexec/rog-monitor`, `/usr/local/lib/rog-monitor`, units, udev, hook de suspensión; `--dry-run`, `--prefix` | install, systemctl (solo con root) | `main.js:298,316` (pkexec, con confirmación), CI `--dry-run`, `install.sh` | sí (root) | implementado | `test_install_dryrun` (21, con prefijo) PROBADO; CI `--dry-run` |
| `scripts/uninstall.sh` | Bash | 60 | Desinstalación de la integración de usuario (`--purge` borra config root) | — | `uninstall.sh:raíz`, README | sí | implementado | `bash -n`. Sin test directo |
| `scripts/rog-ctl.sh` | Bash | 116 | Multiplexor root (lista cerrada): `fans-restart`, `battery-limit`, `guardian`, `smart-summary`, `smart-json` | install, systemctl | `main.js` vía `runPriv` (priv.js HELPERS) | sí (root) | implementado | `test_install_dryrun`, `priv.test.js`, `smart.test.js` (estructura y validación). No ejecutado como root |
| `scripts/rog-py.sh` | Bash | 17 | Lanzador `/usr/bin/python3 -I` con `sys.path` fijo a `/usr/local/lib/rog-monitor` | python3 | `rog-profile-sync.sh`, `rog-thermal-guardian.sh`, `rog-power-source.sh`, `apply-gpu-clocks.sh` | sí (root) | implementado | referencia en `test_guardian_sim` y `test_install_dryrun`. Aislamiento de imports PROBADO (`test_isolated_python_imports`) |
| `scripts/rog-profile-sync.sh` | Bash | 490 | Servicio root: aplica curvas de ventiladores (`fan-curves.json`) y potencia por perfil; regla de curvas duplicada en `priv.js` (ver ARC-16) | rog-py.sh, calibrate-fans, python (embebido) | `rog-profile-sync.service`, `main.js:442` (`--defaults`, sin root) | sí (unit) | implementado | `test_power_validation` ejecuta el script como proceso normal PROBADO (parcial) |
| `scripts/rog-thermal-guardian.sh` | Bash | 949 | Guardián térmico root: ventiladores primero, luego PL2/Dynamic Boost; `hw_write` único (`:196-210`); simulación `ROG_THERMAL_DRY=1` | rog-py.sh, nvidia-smi (timeout 3 s), sysfs | `rog-thermal-guardian.service` | sí (unit) | implementado | `test_guardian_sim` (5) PROBADO en simulación |
| `scripts/rog-battery-limit.sh` | Bash | 46 | Aplica el límite de carga (`charge_control_end_threshold`) leyendo `/etc/rog-monitor/battery.conf` (`:7`) | install | `rog-ctl.sh battery-limit`, unit `rog-battery-limit.service` | sí (root) | implementado | `test_install_dryrun` (referencia). No ejecutado |
| `scripts/rog-battery-limit-resume.sh` | Bash | 7 | Hook `systemd-sleep` que reaplica el límite tras suspender | rog-battery-limit.sh | `install-system.sh:124` (copia a `system-sleep`) | sí (hook) | implementado | NINGUNA (ni test ni CI) |
| `scripts/rog-power-source.sh` | Bash | 103 | Perfil por AC/batería (opt-in, no instalado por defecto) | rog-py.sh, powerprofiles | `rog-power-source.service`, `install-system.sh:126-127` (condicional), regla udev | sí (opt-in) | implementado | referencia en `test_install_dryrun`. No ejecutado |
| `scripts/rog-power-notify.sh` | Bash | 54 | Notificación AC/batería como servicio de usuario | notify-send | `systemd/rog-power-notify.service` (con placeholder, INV-04) | sí (unit de usuario) | muerto: sin instalador | NINGUNA |
| `scripts/rog-monitor-safe-mode.sh` | Bash | 188 | Modo seguro y desinstalación de integración root | systemctl (solo con root) | `main.js:1314` (`uninstall-app` vía `runPriv`), `install.sh`, `install-all.sh`, `uninstall.sh` | sí (root) | implementado | `test_install_dryrun` (uninstall con prefijo) PROBADO |
| `scripts/apply-power-control.sh` | Bash | 116 | Escribe atributos asus-armoury (`pl1`, `pl2`, `dynamic_boost`, `thermal_target`) con rangos del firmware | sysfs | `power_control.py:57` (`_SCRIPT`), `priv.js` HELPERS | sí (root) | implementado | `test_install_dryrun` (lectura). No ejecutado |
| `scripts/apply-gpu-clocks.sh` | Bash | 103 | Offsets de reloj NVML (root) | rog-py.sh, NVML | `power_control.py:58`, `gpu_clocks.py` | sí (root) | implementado | `test_install_dryrun` (lectura). No ejecutado |
| `scripts/calibrate-fans.sh` | Bash | 160 | Calibración PWM→RPM de ventiladores | sysfs | `main.js:659` (`fan-benchmark`, vía runPriv), `fans.py` | sí (root) | implementado | `test_power_validation:213` lee el texto; no ejecutado |
| `scripts/enable-asusd.sh` | Bash | 141 | Habilita `asusd` (root) | systemctl | `main.js:444` (solo informativo), `rog-monitor-safe-mode.sh` | sí (root, manual) | implementado | `test_install_dryrun` (referencia). No ejecutado |
| `scripts/enable-cpu-power.sh` | Bash | 35 | Permiso de solo lectura para RAPL; se pide con `sudo` manual (documentado en la UI) | sudo (manual) | `index.html:136`, `i18n.js`, `roadmap.js` | sí (manual) | implementado | `test_install_dryrun` (referencia). No ejecutado |
| `scripts/validate-i18n.mjs` | JavaScript (ESM) | 155 | Valida i18n del renderer: 8 idiomas, `data-i18n` existentes, textos de comandos | node, DOM mínimo propio | CI (`ci.yml`), `commands.js`, `i18n.js` (menciones) | sí (CI) | implementado | CI PROBADO; ejecutado aquí: "1009 claves × 8 idiomas" OK |
| `scripts/e2e-smoke.mjs` | JavaScript (ESM) | 295 | Smoke E2E de Electron con CDP bajo xvfb | node ≥22, electron, xvfb | CI (`ci.yml`) | sí (CI) | implementado | NO PROBADO aquí (sin xvfb-run; no se lanza GUI) |
| `scripts/contrast-check.mjs` | JavaScript (ESM) | 89 | Verifica contraste de tokens | node | solo se cita en `tokens.css` | sí (manual) | huérfano (no en CI) | NINGUNA |
| `scripts/measure.py` | Python | 266 | Mide coste de CPU/RSS del stream y overhead de benchmarks | python3, subprocess | `CONTRIBUTING.md:78-79`, `docs/BENCHMARKS.md:81,95` | sí (CLI manual) | implementado | NINGUNA (ni test ni CI) |

### 2.5 systemd, instaladores raíz y udev

| Ruta | Lenguaje | Líneas | Responsabilidad | Dependencias (salientes) | Llamadas entrantes | Entrypoint | Estado | Evidencia de ejecución |
|---|---|---|---|---|---|---|---|---|
| `systemd/rog-profile-sync.service` | systemd unit | 25 | Servicio root `rog-profile-sync` (`Restart=always`, `NoNewPrivileges`, `ProtectSystem=full`, `PrivateTmp`); habilitado por el instalador | `/usr/local/libexec/rog-monitor/rog-profile-sync.sh` | `install-system.sh:120,140-141` | sí (unit) | implementado | `test_install_dryrun` (contenido) PROBADO |
| `systemd/rog-thermal-guardian.service` | systemd unit | 58 | Guardián root, `User=root`; instalado sin habilitar | `/usr/bin/bash …/rog-thermal-guardian.sh` | `install-system.sh:121`, `rog-ctl.sh guardian` (drop-in) | sí (unit) | implementado | `test_install_dryrun` PROBADO (contenido) |
| `systemd/rog-battery-limit.service` | systemd unit | 23 | Reaplica límite de carga al arrancar | `/usr/local/libexec/rog-monitor/rog-battery-limit.sh` | `install-system.sh:122`, `rog-ctl.sh battery-limit` | sí (unit) | implementado | `test_install_dryrun` PROBADO (contenido) |
| `systemd/rog-power-source.service` | systemd unit | 23 | Perfil AC/batería (opt-in) | `rog-power-source.sh` | `install-system.sh:126` (condicional) | sí (opt-in) | implementado (no instalado por defecto) | `test_install_dryrun` (ausencia) PROBADO |
| `systemd/rog-power-notify.service` | systemd unit (usuario) | 13 | Notificaciones AC/batería | `__ROG_MONITOR_REPO__/scripts/rog-power-notify.sh` (placeholder sin sustituir, línea 8) | ninguna (ningún instalador la instala) | no | muerto (INV-04) | NINGUNA |
| `systemd/99-rog-power-source.rules` | udev rules | 2 | Dispara `rog-power-source` al cambiar AC | — | `rog-monitor-safe-mode.sh` (quitar) | no | opt-in | `test_install_dryrun` (ausencia) PROBADO |
| `install.sh` (raíz) | Bash | 63 | Instalador de una línea: llama a `scripts/install.sh`, `install-desktop.sh` | — | README, CONTRIBUTING | sí | implementado | `bash -n` (CI) |
| `uninstall.sh` (raíz) | Bash | 7 | Envoltura de `scripts/uninstall.sh` | — | README | sí | implementado | `bash -n` (CI) |

### 2.6 Tests Python (`tests/`) y fixtures

| Ruta | Lenguaje | Líneas | Qué ejerce | Casos | Estado | Evidencia |
|---|---|---|---|---|---|---|
| `tests/__init__.py` | Python | 0 | Paquete vacío | — | — | — |
| `tests/test_alerts.py` | Python | 154 | `alerts`, `cpu`, `gpu`, `fans`, `power` | 11 | implementado | PROBADO OK |
| `tests/test_backend_robustness.py` | Python | 149 | Robustez del backend (config, `game_session`, `settings`) | 9 | implementado | PROBADO OK |
| `tests/test_benchmarks.py` | Python | 200 | `benchmarks` (reps, p50/p95/p99, export) | 13 | implementado | PROBADO OK |
| `tests/test_contract.py` | Python | 181 | Contrato schema 1 contra `tests/fixtures/snapshot-v1.json` y producción en vivo | 4 | implementado | PROBADO OK (incluye `--json` real) |
| `tests/test_gpu_perf.py` | Python | 145 | `Cached` (backoff, TTL), `gpu`, `gpu_clocks` | 9 | implementado | PROBADO OK |
| `tests/test_guardian_sim.py` | Python | 394 | Simulación del guardián (`ROG_THERMAL_DRY`), `rog-py.sh`, CLI de límites | 5 | implementado | PROBADO OK |
| `tests/test_history_none.py` | Python | 105 | `Series` con huecos (`None`) | 11 | implementado | PROBADO OK |
| `tests/test_install_dryrun.py` | Python | 249 | Instalador y desinstalador con prefijo y `--dry-run` | 21 | implementado | PROBADO OK |
| `tests/test_metrics.py` | Python | 306 | Lectores sobre `tests/fixtures/proc/*` | 22 | implementado | PROBADO OK |
| `tests/test_power_validation.py` | Python | 221 | Validación de potencia y curvas en `rog-profile-sync.sh` | 16 | implementado | PROBADO OK |
| `tests/test_series.py` | Python | 65 | `Series` (ventana y promedio) | 3 | implementado | PROBADO OK |
| `tests/test_smart_cache.py` | Python | 182 | Caché SMART (lectura sin root) | 20 | implementado | PROBADO OK |
| `tests/test_tui_input.py` | Python | 243 | TUI en pty: teclas, SIGWINCH, SIGTERM, ratón descartado | 6 | implementado | PROBADO OK (ver INV-14 sobre aislamiento) |
| `tests/test_tui_render.py` | Python | 142 | Render Rich del TUI | 10 | implementado | PROBADO OK |
| `tests/test_ui_events.py` | Python | 30 | Eventos del panel | 2 | implementado | PROBADO OK |
| `tests/fixtures/snapshot-v1.json` | JSON | 947 | Snapshot de referencia del contrato | — | dato | usado por `test_contract` y `contract.test.js` |
| `tests/fixtures/proc/t0/{stat,meminfo,mounts,diskstats}`, `t1/{stat,diskstats}`, `t2/stat`, `noswap/meminfo` | texto | 5–11 c/u | Fixtures de `/proc` simulado | — | dato | usados por `test_metrics` |

### 2.7 Tests Node (`desktop/test/`)

| Ruta | Lenguaje | Líneas | Qué ejerce | Casos | Estado | Evidencia |
|---|---|---|---|---|---|---|
| `desktop/test/priv.test.js` | JavaScript | 218 | `desktop/priv.js` (HELPERS, VERSION, owner, validadores) | 21 | implementado | PROBADO OK |
| `desktop/test/smart.test.js` | JavaScript | 100 | `desktop/smart.js` | 8 | implementado | PROBADO OK |
| `desktop/test/contract.test.js` | JavaScript | 108 | Contrato schema 1 contra el fixture | 4 | implementado | PROBADO OK |
| `desktop/test/bench.test.js` | JavaScript | 58 | `bench-detail.js` cargado en `vm` | 3 | implementado | PROBADO OK |
| `desktop/test/charts.test.js` | JavaScript | 77 | Helpers de gráficas: extrae funciones de `app.js` por regex (`charts.test.js:9`) | 7 | frágil | PROBADO OK; no ejecuta el módulo real |
| `desktop/test/escape.test.js` | JavaScript | 27 | `escapeHtml` extraída de `app.js` por regex (`escape.test.js:8-9`) | 3 | frágil | PROBADO OK; no ejecuta el módulo real |
| `desktop/test/index.js` | JavaScript | 3 | Índice que carga solo `priv.test.js` (comentario sobre Node ≥22 obsoleto) | — | huérfano | no usado por CI |

### 2.8 CI, plantillas, assets, documentación y raíz

| Ruta | Lenguaje | Líneas | Responsabilidad | Llamadas entrantes | Estado | Evidencia |
|---|---|---|---|---|---|---|
| `.github/workflows/ci.yml` | YAML | 95 | Job `lint-and-smoke`: py_compile, unittest, JSON, snapshot, `node --check`, node:test, i18n, electron-builder dir, `bash -n`, dry-run, E2E xvfb | GitHub | implementado | solo en CI (Python 3.12 en `ci.yml:15`; Node 20 en `:46`, 22 en `:82`) |
| `.github/dependabot.yml` | YAML | 15 | Actualizaciones: npm semanal, pip y github-actions mensual | GitHub | implementado | — |
| `.github/ISSUE_TEMPLATE/bug_report.md` | Markdown | 26 | Plantilla de bug | GitHub | dato | — |
| `.github/ISSUE_TEMPLATE/device_request.md` | Markdown | 29 | Plantilla de soporte de equipo | GitHub | dato | — |
| `.gitignore` | texto | 30 | Excluye `node_modules`, `.venv`, `__pycache__`, `docs/agent-work` (verificado con `git check-ignore`) | git | dato | — |
| `VERSION` | texto | 1 | `21.0.0` (fuente de versión de Python, Electron y helpers) | `__init__.py`, `main.js:41-51`, `install-system.sh` | dato | coherente (ver INV-09) |
| `LICENSE` | texto | 21 | MIT | — | dato | — |
| `README.md` | Markdown | 339 | Instalación, uso, AppImage (`README.md:192-206`) | — | dato | afirma que AppImage "necesita python3" (ver ARC-01) |
| `CONTRIBUTING.md` | Markdown | 168 | Reglas para contribuir, tests, privilegios | — | dato | — |
| `SECURITY.md` | Markdown | 174 | Modelo de amenazas y verificación | — | dato | — |
| `CHANGELOG.md` | Markdown | 373 | Historial de versiones (`## 21.0.0` línea 3) | — | dato | coherente con VERSION |
| `docs/ARCHITECTURE.md` | Markdown | 248 | Arquitectura declarada (ver `04-REAL-ARCHITECTURE.md`) | — | dato | — |
| `docs/adr/0001-privilege-boundary.md` | Markdown | 53 | ADR-0001 | — | dato | cumplimiento: parcial (ARC-04, ARC-05) |
| `docs/adr/0002-no-new-dependencies.md` | Markdown | 37 | ADR-0002 | — | dato | cumple (solo `rich`) |
| `docs/adr/0003-tui-mouse-off.md` | Markdown | 28 | ADR-0003 | — | dato | cumple (`keys.py` no activa ratón) |
| `docs/adr/0004-ndjson-schema-versioning.md` | Markdown | 36 | ADR-0004 | — | dato | cumple (contratos PROBADOS) |
| `docs/adr/0005-guardian-simulation-first.md` | Markdown | 42 | ADR-0005 | — | dato | cumple (`hw_write` único, `rog-thermal-guardian.sh:196`) |
| `docs/BENCHMARKS.md` | Markdown | 124 | Metodología de benchmarks | — | dato | — |
| `docs/RECOVERY.md` | Markdown | 175 | Recuperación ante fallos | — | dato | — |
| `docs/TRANSLATING.md` | Markdown | 57 | Guía para traducir (8 idiomas) | — | dato | — |
| `docs/roadmap.md` | Markdown | 138 | Hoja de ruta | — | dato | — |
| `docs/redragon-protocol.md` | Markdown | 95 | Protocolo de teclado Redragon (investigación) | — | dato | — |
| `docs/supported-devices.md` | Markdown | 132 | Matriz de equipos | — | dato | — |
| `assets/demo.gif` | binario | — | GIF de demo (README) | README | dato | — |
| `assets/screenshots/01-dashboard.png` … `07-tui.png` (7 archivos) | binario | — | Capturas de README | README | dato | — |

### 2.9 Internacionalización (cruce de componentes)

| Parte | Ubicación | Tamaño | Cobertura de validación |
|---|---|---|---|
| Traductor TUI | `src/rog_monitor/i18n.py` | 999 líneas, 8 idiomas | Solo tests de TUI (indirecto); **sin validador de claves** |
| Puente UI | `desktop/renderer/i18n.js` | 757 líneas, 487 entradas inline `{ es: … }` | `validate-i18n.mjs` (CI) |
| Diccionarios inline | `app.js` (159), `bench-detail.js` (75), `power.js` (73), `diagnostics.js` (37), `commands.js` (20), `event-detail.js` (17) | ~381 | `validate-i18n.mjs` vía `register()` |
| Self-check | `__selfcheck_bench_i18n.js` (14 diccionarios) | 179 líneas | no está en CI |

---

## 3. Dependencias

### 3.1 Python (`requirements.txt`)
- Única línea: `rich>=13.0` (`requirements.txt:1`). Sin tope superior ni lockfile. Versión local instalada: `rich 15.0.0` (PROBADO por `importlib.metadata`).
- CI: `pip install -r requirements.txt` con Python **3.12** (`ci.yml:15`). Esta sesión ejecutó Python **3.14.7** (ver §5).
- Nota ADR-0002: `rich` es la única dependencia de runtime. NVML va por `ctypes`. Confirmado por imports (`grep`): solo `app.py`, `ui.py` importan `rich`.

### 3.2 Node (`desktop/package.json`, `desktop/package-lock.json`)

| Paquete | Rango declarado (`package.json`) | Versión en lock | Licencia declarada (package.json / lock) |
|---|---|---|---|
| `electron` (devDependency) | `^42.5.0` | `42.11.12` | MIT (lock) |
| `electron-builder` (devDependency) | `^26.15.3` | `26.17.0` | MIT (lock) |
| Transitivos | — | 284 entradas en total (`lockfileVersion 3`) | ver tabla de licencias abajo |

Licencias en el lock (PROBADO con un recuento sobre `package-lock.json`):

| Licencia | Paquetes |
|---|---|
| MIT | 212 |
| ISC | 36 |
| BlueOak-1.0.0 | 8 |
| BSD-3-Clause | 9 |
| BSD-2-Clause | 6 |
| Apache-2.0 | 6 |
| Python-2.0 | 1 |
| WTFPL OR ISC / WTFPL / WTFPL OR MIT | 3 |
| 0BSD | 1 |
| (MIT OR CC0-1.0) | 1 |

Ninguna licencia copyleft (GPL/AGPL/LGPL) en el lock. Ninguna entrada sin licencia.
Existencia: `desktop/node_modules/` (411 MB, ignorado por git). No se volcó su contenido.

### 3.3 Coherencia de versiones (PROBADO)
- `VERSION` = `21.0.0`; `desktop/package.json:3` = `21.0.0`; `desktop/package-lock.json` raíz = `21.0.0`; `CHANGELOG.md:3` = `## 21.0.0 — 2026-10-10`.

---

## 4. TODO / FIXME / XXX (`git grep -n -E "TODO|FIXME|XXX"`)

Resultado bruto: 36 aciertos. Clasificación:

| Clase | Recuento | Detalle |
|---|---|---|
| Marcas de trabajo reales | **5** | `desktop/renderer/styles/tokens.css:25`, `:42`, `:45`, `:53`, `:59` (`TODO`: duplicar `--accent`, unificar sombras, convergir tamaños, migrar escala de espacio). Línea 45 remite a "lista TODO en el informe de la fase 5", documento que no está en el repo. |
| Palabra "TODO/TODOS" en español o inglés (falso positivo) | 31 | Textos de UI, comentarios de prosa y claves como `procs.view_all`, `ROADMAP_TODO`, etc. |
| Binarios (falso positivo) | 4 | Coincidencias dentro de PNG. |

Ningún `FIXME` ni `XXX` en el repo.

---

## 5. Ejecución y verificación (este informe)

| Verificación | Comando (resumen) | Resultado | Etiqueta |
|---|---|---|---|
| Tests Python | `PYTHONPATH=src PYTHONUSERBASE=~/.local HOME=<tmp> python3 -m unittest discover -s tests` | 162 OK, 47,5 s | PROBADO (Python 3.14.7, no 3.12) |
| Tests Node | `node --test desktop/test/*.test.js` (Node 22.22.3) | 46 pass, 0 fail | PROBADO (CI usa Node 20) |
| Sintaxis JS | `node --check` a `main.js`, `preload.js`, `priv.js`, `smart.js`, `renderer/*.js` | sin errores | PROBADO |
| Sintaxis shell | `bash -n` a `install.sh uninstall.sh scripts/*.sh desktop/start.sh` (22 archivos) | sin errores | PROBADO |
| Compilación Python | `python3 -m py_compile src/rog_monitor/*.py` | OK (generó `__pycache__`, eliminado) | PROBADO |
| i18n | `node scripts/validate-i18n.mjs` | "1009 claves × 8 idiomas; 262 refs en index.html; 11 comandos" | PROBADO |
| Self-check bench | `node desktop/renderer/__selfcheck_bench_i18n.js` | 42 passed, 0 failed | PROBADO |
| Stream NDJSON 53 s | `python3 -m rog_monitor --json-stream --interval 1` | 53 líneas, 13–14,5 KB c/u, `schema` 1, `version` 21.0.0, 22 claves | PROBADO |
| Electron GUI, AppImage, E2E xvfb | — | no se ejecutó | NO PROBADO |

---

## 6. Hallazgos

Formato obligatorio. Severidad: P0 rompe arranque/datos/seguridad · P1 función principal rota o engañosa · P2 deuda/UX importante · P3 menor.

| ID | Severidad | Estado | Componente | Archivo:línea | Commit(s) | Evidencia/comando | Resultado | Impacto | Recomendación | Prueba de aceptación |
|---|---|---|---|---|---|---|---|---|---|---|
| INV-01 | P2 | verificado | Tests · Electron | `desktop/main.js` (1 841 l.), `desktop/preload.js` (94 l.) | 228218c9 (main), 228218c9 (preload) · último cambio c4bb0d6 / 4262a1d | `grep -l main.js\|preload.js desktop/test tests` → sin resultados | 0 tests unitarios para 61 IPC handlers, ciclo del backend, overlay y bandeja | Regresiones en el ciclo de vida y en la frontera IPC sin detección local | Extraer lógica pura (backend-lifecycle, registro IPC) a módulos testeables con `node:test` | `node --test desktop/test/*.test.js` incluye al menos 1 test por handler de `set-*`/`get-*` y del respawn |
| INV-02 | P2 | verificado | Tests · Renderer | `desktop/test/escape.test.js:8-9`, `desktop/test/charts.test.js:9`; 12 de 16 módulos de `desktop/renderer/` sin ninguna prueba (battery, cores, dashboard, diagnostics, disks, event-detail, game-session, overlay, power, roadmap, widget-states, wizard) | 60910be (escape.test), ed7151f (charts.test), 4262a1d (bench.test) | `grep -l <módulo>.js desktop/test/*.js` | Solo `bench-detail.js` tiene test ejecutable (vm); `escape` y `charts` extraen funciones de `app.js` por regex; el resto sin test | Cambios de render en 13 módulos sin red de seguridad; tests que pasan aunque el código real cambie | Cargar módulos reales en `vm` con DOM mínimo (como `bench.test.js`) | Renombrar `escapeHtml` en `app.js` hace fallar un test real |
| INV-03 | P2 | verificado | Scripts · Instalación | `install.sh:1`, `uninstall.sh:1`, `scripts/install.sh`, `scripts/install-desktop.sh`, `scripts/install-all.sh`, `scripts/rog-battery-limit-resume.sh`, `scripts/rog-power-notify.sh`, `scripts/measure.py`, `scripts/contrast-check.mjs` | 48bde60 (V14), 531ec9e (CP-0) | `git grep -l` por nombre en `tests/` y `desktop/test/` → vacío; CI solo `bash -n` | 9 scripts sin ejecución en ningún test; `contrast-check.mjs` no entra en CI | Un instalador roto llega a usuarios sin aviso | Añadir `--dry-run` de `install.sh` y `uninstall.sh` a `test_install_dryrun` y `contrast-check.mjs` a CI | CI falla si `install.sh --dry-run` o `contrast-check.mjs` fallan |
| INV-04 | P2 | verificado | systemd · Notificaciones | `systemd/rog-power-notify.service:8` | 48bde60 (V14) | `git grep -n ROG_MONITOR_REPO__` → solo la unidad y los tests que comprueban su ausencia en las unidades root | `ExecStart` contiene un placeholder sin sustituir; ningún instalador la copia ni la habilita; `rog-monitor-safe-mode.sh:70,157` solo la desactiva | Unidad muerta que la documentación presenta como activa (ARC-22) | Eliminar la unidad y el script, o añadir su instalación con `sed` del repo y un test | `git grep __ROG_MONITOR_REPO__` vacío, o `test_install_dryrun` instala y verifica la unidad |
| INV-05 | P3 | verificado | Repo · Duplicados | `scripts/install-all.sh` (26 l.) vs `install.sh` (63 l.); `desktop/test/index.js:2-3`; `desktop/renderer/__selfcheck_bench_i18n.js` | 1f13f33 (selfcheck), 531ec9e (index.js) | `cat` de ambos; `desktop/package.json` `build.files` = `**/*` | Dos instaladores con el mismo flujo; un índice de tests que solo carga 1 archivo; un self-check empaquetado en el AppImage y fuera de CI | Confusión sobre el punto de entrada; ruido en el paquete | Un solo instalador documentado; mover el self-check a `desktop/test/` y ejecutarlo en CI; borrar `index.js` | `git ls-files` sin los duplicados y CI ejecuta el self-check |
| INV-06 | P3 | verificado | IPC · Superficie | `desktop/main.js:874-878` (`get-error-log`), `:880-890` (`disk-health`), `:543-584` (`set-fan-config`); `desktop/preload.js:38,42,43` | f5a1815, 82aa423, 03dda5a8 | `grep -n "getErrorLog\|diskHealth\|setFanConfig" desktop/renderer/*.js` → 0 llamadas (solo `setFanConfigMulti`) | 3 canales expuestos sin consumidor | Superficie de ataque y mantenimiento sin uso | Retirar los 3 canales o usarlos; el `preload` debe exponer solo lo que consume la UI | Un script `scripts/validate-ipc.mjs` (sin dependencias) falla si un `window.rog.X` no existe o si un método expuesto no tiene llamadas |
| INV-07 | P3 | verificado | CSS · Tokens | `desktop/renderer/styles/tokens.css:25,42,45,53,59` | bdb2a6a | `git grep -n -E "TODO" -- desktop/renderer/styles/tokens.css` | 5 TODO reales; `:45` remite a un informe fuera del repo | Deuda de diseño sin dueño | Convertir a issues o resolver; quitar la referencia a "fase 5" | `git grep -n TODO -- desktop/renderer/styles/tokens.css` vacío |
| INV-08 | P2 | verificado | Electron · Arranque | `desktop/start.sh:8-11`; `src/rog_monitor/cli.py:57-59` | 228218c9 (start.sh), 228218c9 (cli.py) | `sed -n 8,11p desktop/start.sh`; `cli.py:57-59` (stdout/err → DEVNULL) | Primer arranque hace `npm install` (no `npm ci`), en silencio cuando se lanza con `monitor --desktop`; puede reescribir `package-lock.json` | Red y dependencias no reproducibles; fallos invisibles al usuario | Usar `npm ci` con lock; no silenciar la salida de `cli --desktop` (o registrarla en el log) | Primer arranque sin red falla con mensaje visible; `git status` limpio tras `start.sh` |
| INV-09 | P3 | verificado | Dependencias · Licencias | `desktop/package-lock.json` (284 entradas); `VERSION`, `desktop/package.json:3`, `CHANGELOG.md:3` | fbfee52…HEAD (ver `git log -- desktop/package.json`) | Recuento de licencias sobre el lock; comparación de versiones | Licencias 100 % permisivas (MIT, ISC, BSD, Apache-2.0, BlueOak, 0BSD, WTFPL, CC0); versiones 21.0.0 coherentes | Sin riesgo de copyleft; informativo | Mantener; añadir `license-checker` no es necesario (ADR-0002) | — |
| INV-10 | P3 | verificado | Python · Dependencias | `requirements.txt:1` (`rich>=13.0`) | 228218c9 | `python3 -c "importlib.metadata…"` → `rich 15.0.0` | Sin tope ni lock; CI instala la última compatible | Cambios de `rich` pueden romper la TUI sin aviso | Añadir tope `rich>=13,<16` y probar en CI | CI con `rich` mínimo y máximo verde |
| INV-11 | P2 | verificado | i18n · Mantenimiento | `src/rog_monitor/i18n.py:8,131,253,375,497,619,740,862`; `desktop/renderer/i18n.js` (757 l.); diccionarios inline en 8 archivos del renderer | 1d2e7d7 (i18n.py), c392ebaa (i18n.js), 6110015 (power/gamesession/cores) | `grep -c "{ es:"` por archivo: 868 entradas fuera de i18n.js y 487 dentro | Dos sistemas de traducción y ~870 entradas inline; el validador no cubre `i18n.py` | Claves huérfanas o sin traducir en la TUI sin detección | Un solo catálogo por idioma (JSON) para TUI y UI; ampliar `validate-i18n.mjs` a `i18n.py` | Una prueba que cuenta claves por idioma en ambas fuentes y falla si difieren |
| INV-12 | P3 | verificado | CLI · Idioma | `src/rog_monitor/cli.py:30` | 1d2e7d7 | `grep -n "choices=\[\"es\", \"en\"\]"` | `--lang` acepta solo `es` y `en`; la TUI tiene 8 idiomas | Usuarios de otros idiomas no pueden forzar la TUI desde CLI | Usar la lista de `i18n.py` | `monitor --lang fr --once` no falla por argumento |
| INV-13 | P2 | verificado | CI · Calidad | `.github/workflows/ci.yml` (95 l.) | 0439655 (ADRs), c4bb0d6 (SMART) | Lectura del workflow completo | Sin linter ni análisis estático (ni ruff/flake8 para Python, ni eslint/shellcheck para JS y shell); solo `py_compile` y `node --check` | Errores de estilo y de shell solo aparecen en runtime | Añadir `shellcheck` (binario, sin dependencias de runtime) y `python -m pyflakes` como paso de CI | El paso de CI falla ante un `$var` sin comillas en `scripts/*.sh` |
| INV-14 | P3 | parcial | Tests · Aislamiento | `tests/test_tui_input.py:102,146,174` (env heredado), `tests/test_contract.py:165` | 4a65b870 (TUI), 303b145b | Ejecutado con `HOME=<tmp>` y sin `PYTHONUSERBASE`: 5 fallos y 6 errores; los procesos hijos fallan con `No module named 'rich'` (`cli.py:62` → `app.py:11`). Con `PYTHONUSERBASE=~/.local`: 162 OK | Los tests dependen del site-packages del usuario; en CI (Python 3.12) no se ejecutó localmente | Falsos rojos en entornos limpios; no reproducible fuera de este equipo | Crear un venv en `.venv` de CI y ejecutar tests con `-I` salvo los que lo necesiten | CI con `python -I -m unittest` y `rich` instalado solo en el venv |
| INV-15 | P3 | verificado | Repo · Artefactos no versionados | `desktop/node_modules/` (411 MB), `desktop/dist/` (build previo, `linux-unpacked`), `.venv/`, `docs/agent-work/`, `src/legacy/__pycache__/` (vacío, jun) | — | `git check-ignore -v` (todos ignorados) | Artefactos locales presentes, todos ignorados por git; `src/legacy/` es un directorio residual sin archivos versionados | Ruido y confusión; `desktop/dist` puede contener una build vieja | Limpiar `src/legacy/` y `desktop/dist/` cuando no se usen | `git status --ignored` solo lista lo esperado |
| INV-16 | P3 | verificado | Repo · Consistencia (OK) | `VERSION`, `desktop/package.json:3`, `desktop/package-lock.json` raíz, `CHANGELOG.md:3` | 500c7d9 (release 21.0.0) | Comparación directa | Versiones coherentes en 4 sitios | Ninguno; registro de control | — | — |
| INV-17 | P3 | verificado | Tests · Estado (OK) | `tests/`, `desktop/test/`, `scripts/validate-i18n.mjs`, `desktop/renderer/__selfcheck_bench_i18n.js` | HEAD 7d49333 | Ejecuciones de §5 | 162 Python + 46 Node + i18n + self-check en verde | Ninguno; base sólida para las recomendaciones | — | — |
| INV-18 | P3 | verificado | IPC · Cruce (OK) | `desktop/preload.js` ↔ `desktop/main.js` | 228218c9 | Script de cruce: 61 `ipcRenderer.invoke` ↔ 61 `ipcMain.handle`, 6 `on*` ↔ `webContents.send` | Ningún canal huérfano en ningún sentido | Ninguno; control | — | — |
| INV-19 | P3 | verificado | Dependabot · Cobertura (OK) | `.github/dependabot.yml:1-15` | c4bb0d6 | Lectura | Actualizaciones para npm (semanal), pip y github-actions (mensual) | Ninguno | — | — |

---

## 7. Lo que no pude verificar

- Electron en GUI: no se lanzó (la app abre ventanas y puede escribir en `~/.config`). Sandbox por defecto de Electron 42 sin confirmar (ver ARC-12).
- AppImage: no se construyó (`npm run dist`). Hallazgo ARC-01 y ARC-02 se basan en leer `extraResources` y el código.
- Python 3.12 (CI): no instalado aquí. Las pruebas corrieron en 3.14.7.
- E2E `scripts/e2e-smoke.mjs`: requiere `xvfb-run` (no disponible) y Electron.
- Instaladores root (`install-system.sh` sin `--dry-run`), `systemctl`, sysfs, NVML, AMD: fuera de alcance por la regla de solo lectura del brief.
- Latencia real del NDJSON en un equipo con 900 s de historial: calculada a partir de 53 muestras reales y una simulación de 900 valores; no medida en vivo.
