# ROG Monitor — lo que falta (insumo para el agente de plan)

Fecha: 2026-10-14 · Autor: sesión Opus que hizo v22 hasta aquí · Para: agente de planificación del propietario (Marshall)

Este documento junta **todo lo pendiente**:
- lo que pidió el propietario hoy, con sus 7 capturas descritas;
- los bugs visuales con su causa raíz;
- la cobertura de tests;
- README y roadmap;
- las funciones nuevas al estilo del Administrador de tareas de Windows;
- lo que queda del plan maestro v22.

El agente de plan debe convertirlo en un plan por etapas, con checkpoints y subagentes. **No se ha empezado nada de lo de abajo.**

---

## 0. Estado actual (verificado hoy)

- **Repo:** `~/MyFiles/Dev/Rog-Monitor`.
  - GitHub: `MarshallGomez1103/Rog-Monitor`, privado, con CI de GitHub Actions.
  - `master` = `45cb9dc`, al día.
  - Rama de trabajo: `feat/v22`, pusheada y limpia. 234 commits en total.
  - No hay PRs abiertos: Dependabot está al día (Electron 44.7.0 y Actions v7).
- **Stack:**
  - Backend Python stdlib + `rich`: `src/rog_monitor/`. Emite NDJSON con `--json-stream`.
  - App Electron: `desktop/main.js` y `desktop/renderer/*`.
  - TUI con `rich`.
  - Scripts root: `scripts/*.sh`, instalados con `sudo bash scripts/install-system.sh` en `/usr/local/libexec/rog-monitor`.
- **Tests de hoy:**
  - Python: 206 OK. Node: 50 OK. E2E Electron: 31/31. i18n: 1026 claves × 8 idiomas.
  - Cobertura en CI: Python 52 % con piso 50; Node 99 % con piso 90 de líneas.
- **Cómo se trabaja (persistencia):**
  - `docs/agent-work/v22/STATUS.md`, `HANDOFF.md`, `DECISIONS.md`, `RISKS.md`.
  - `docs/agent-work/v22/checkpoints/*.md`, una ficha por checkpoint.
  - Plan base: `PLAN_MAESTRO_ROG_MONITOR.md` (100 CP, F0..F9).
- **Herramientas privadas** (ignoradas por git), en `.ai/private/rog-v22/`:
  - `venv-clean`: venv con `coverage` instalado.
  - `tools/cdp.mjs` lanza la app aislada y la maneja por CDP. Incluye `ev`, `shot`, `sleep` y `call`; los `check-*.mjs` sirven de ejemplo.
- **Esperando que el propietario lo pruebe:** el arreglo de ventiladores ya está desplegado (`checkpoints/BUG-fans-reactive.md`). Tras una sesión larga de juego, mirar:
  `journalctl -u rog-profile-sync --since today | grep -i fan`.

---

## 1. Prioridades que pidió el propietario (en este orden)

1. **Bugs visuales y UI/UX:** benchmarks cortados, procesos inconsistentes y editor de gráficas feo. Además, estados vacíos, de carga y de error en toda la app. → Bloque A.
2. **Cobertura Python de 52 % a 80 %**, con más TDD. → Bloque B.
3. **README y roadmap al día** (se pidió desde el 12 de octubre). → Bloque C.
4. **Seguir el plan:** overlay personalizable y benchmarks serios. → Bloque E.
5. **Paridad con el Administrador de tareas de Windows:** gráficas nuevas, detalle de CPU y GPU, procesos agrupados. → Bloque D.

   El propietario lo pidió **"a los planes, más fuerte"**. Va después de 1–4, salvo que el planificador justifique otro orden.

> **Regla del propietario:** primero el plan y después el código, para evitar código espagueti. Si una etapa crece, se parte.

---

## 2. Bloque A — Bugs visuales y UI/UX

### A1. Tarjetas del historial de benchmarks cortadas (captura 1)

**Qué se ve:**
- En "Benchmarks & sesión", cada tarjeta (GPU/CPU, fecha, `51.0°C MÁX · 99 % USO · 29.8 W · 0 THROTTLE · 45 S`) sale **cortada abajo**: la línea de valores queda a medias.
- "EXPAND ▸" casi no se lee: es un rosa al 45 % de opacidad con fuente de 0.62rem.
- La "X" de borrar se ve gris tenue.

**Causa raíz:**
- `.bench-history` es una columna flex con `max-height: 340px`; está en `desktop/renderer/styles/extras.css:11-22`.
- Las tarjetas `.bench-card` (`extras.css:29-38`) tienen `overflow:hidden` y el `flex-shrink:1` por defecto.
- Con más de 3 tarjetas, flex las **encoge** en vez de dejar que la lista haga scroll, y el overflow recorta el contenido.

**Arreglo:**
- `.bench-card { flex-shrink: 0 }`.
- Revisar el padding inferior.
- `.bench-card-expand` (`extras.css:84-97`):
  - opacidad mínima 0.8;
  - fuente ≥ 0.72rem;
  - contraste AA contra `--panel`.
- `.bench-card-delete` (`extras.css:99-114`):
  - botón de verdad, con zona de clic ≥ 28 px;
  - `aria-label` en los 8 idiomas;
  - confirmación o deshacer.

**Aceptación:**
- Captura CDP con 5 o más tarjetas: ninguna recortada y la lista hace scroll.
- Expandir y borrar son legibles en los 12 temas: comprobar al menos neón, oscuro y claro.

### A2. Tabla de procesos inconsistente según la columna ordenada (capturas 2–5)

**Qué se ve:**
- **Orden por % CPU** (captura 2): el % CPU sale rosa neón y bien. CORES sale tenue y con fuente pequeña. RAM sale tenue y PROCESS blanco: tres estilos distintos.
- **Orden por CORES** (captura 3): los valores de cores salen rosa, pero **pequeños y con poco brillo**. % CPU queda blanco normal y RAM tenue.
- **Orden por RAM** (captura 4): RAM sale neón, % CPU blanco y cores tenue y pequeño.
- **Modal "Ver todos"** (captura 5, ordenado por cores): el mismo problema; cores es la columna que peor se ve.
- La lista de RAM del modal de RAM se ve mejor, pero sigue el mismo patrón.

**Causa raíz:** cada columna tiene un color y tamaño **base** propios, independientes del orden.
- `style.css:1193-1211`:
  - `td.cpu` usa `--ink`;
  - `td.mem` usa `--dim`;
  - `td.cpu-core` va dentro de `<span class="procs-core">` (`extras.css:1033`) con fuente menor y `--dim`.
- El modal `#allprocs` (`extras.css:1132-1150`) y el de RAM `#ram-procs` (`style.css:1216-1221`) **repiten** las reglas a mano y cada copia ha ido divergiendo.

**Regla a implementar** (pedida por el propietario: "cuando filtre por cualquiera, el resto se vea igual"):
- Todas las columnas numéricas no ordenadas usan el **mismo** color (`--ink`), peso y tamaño (mono, 13.5 px).
- PID va siempre en `--dim`.
- Solo la columna ordenada lleva acento y brillo, con el mismo brillo en cualquier columna.
- Cores sin fuente reducida.
- **Una sola** clase compartida, por ejemplo `.proc-table[data-sort-col]`, usada por `#procs`, `#allprocs` y `#ram-procs` y por cualquier tabla con filtros futura (discos, VRAM). Hay que borrar las copias.

**Aceptación:**
- Test E2E/CDP que ordena por cada columna en las 3 tablas.
- Compara con `getComputedStyle` el color, `font-size`, `font-weight` y `text-shadow` de cada columna.
- Esperado: todas las no ordenadas son iguales entre sí, y la ordenada es igual sin importar cuál sea.

### A3. Editor de gráficas: "se ve un poquito feo" (captura 6)

**Qué se ve:**
- Panel "Tick the charts you want; ↑ ↓ change the order".
- Botones ↑ ↓ pequeños, pegados al borde derecho y con poco contraste; los deshabilitados casi ni se ven.
- Los checkboxes son los nativos del navegador.
- Los botones de conjunto ("Temp/W", "CPU/RAM usage") parecen sueltos.

**Dónde:**
- `style.css:1552-1559` (`.hist-editor*`).
- `renderHistEditor()` en `desktop/renderer/app.js`.

**Pedido del propietario:**
- Flechas más claras para mover; puede ser también arrastrar y soltar con alternativa de teclado (CP F4-06).
- Poder **expandir o contraer cada gráfica**, a tamaño completo o en un modal grande.

**Sugerencia:**
- Fila completa clicable, con un asa ⋮⋮ para arrastrar.
- Botones ↑ ↓ de 28 px con iconos SVG.
- Checkbox con el estilo del tema.
- Vista previa en miniatura.

**Aceptación:**
- CDP: reordenar con teclado y ratón.
- El orden persiste tras recargar; ya existe `check-editor.mjs` como base.

### A4. Estados de UX en toda la app (pedido explícito)

El propietario pidió revisar qué se muestra en cada uno de estos casos:
- **vacío:** "no aparece nada";
- **cargando:** "se está cargando";
- **error;**
- **sin soporte:** sensor inexistente.

**Hacer un inventario por panel:** CPU, GPU, ventiladores, historial, benchmarks, procesos, sistema, discos/SMART, batería, eventos, overlay, Aura y modales.

**Estado actual:**
- Ya existe `desktop/renderer/widget-states.js`; partir de ahí.
- Hoy algunos paneles muestran "—", otros texto suelto y otros nada.

**Criterio:** un solo componente con los cuatro estados, en 8 idiomas, y cada estado con una acción posible ("reintentar", "instalar X", "por qué").

**Nota (F2-08, ya hecho):**
- Si el backend deja de mandar muestras durante 6 s, se ve "SIN DATOS · N s" y los paneles se atenúan.
- Hay que reutilizar ese patrón.

**Skills de UI/UX disponibles en la sesión** (el propietario pidió usarlas):
- `design-everyday-things`: affordances, signifiers, feedback y modelos mentales.
- `microinteractions`: estados de carga, feedback de botones y transiciones.
- `design-taste-frontend`: anti-genérico, pensado para auditorías de rediseño.
- `refactoring-ui` no está instalada; no inventarla.
- **Gustos del propietario:** estilo Carbon cuadrado, nada genérico de IA, 12 temas existentes que hay que respetar, sin frameworks nuevos.

---

## 3. Bloque B — Cobertura Python de 52 % a ≥ 80 %

**Medido hoy** con `coverage run --source=src/rog_monitor -m unittest discover -s tests`:

| Módulo | Sentencias | Cobertura | Qué falta probar (orientativo) |
|---|---|---|---|
| `cli.py`, `__main__.py` | 45 | 0 % | parseo de argumentos y modos `--json`, `--json-stream` |
| `fps.py` | 65 | 20 % | lectura de logs de MangoHud |
| `procs.py` | 112 | 21 % | `/proc` falso: top, cores y RSS |
| `aura.py` | 405 | 24 % | validación de payloads y construcción de comandos (sin ejecutarlos) |
| `app.py` | 247 | 25 % | `sample()`, `snapshot_json()`, `handle_key()` y la cadencia |
| `power.py` | 94 | 27 % | RAPL con sysfs falso |
| `settings.py` | 147 | 30 % | update/validate y límites |
| `game_session.py` | 275 | 36 % | detección, estados y export |
| `gpu.py`, `gpu_clocks.py` | 395 | 43–45 % | NVML simulado, fallback a nvidia-smi y dGPU dormida |
| `power_control.py` | 406 | 45 % | rutas de `apply`, baseline/reset y CLI |
| `fans.py` | 230 | 52 % | `FanReader`, `guardian_status` y CLI |
| `benchmarks.py` | 269 | 57 % | `_run_repetitions` y `_summarize` con carga simulada |
| (el resto) | — | 75–100 % | — |
| **TOTAL** | **4032** | **52 %** | **meta ≥ 80 %, es decir unas 1200 líneas más cubiertas** |

**Reglas para los tests:**
- Solo stdlib `unittest` y `mock`.
- Nada de root, nada de `/sys` real, nada de `pkexec` (ADR-0006).
- Para el hardware se usan árboles sysfs falsos (`ROG_SYSFS_ROOT`, `ROG_FW_ATTRS_DIR`) y runners simulados.
- `tests/test_fan_stuck.py` y `tests/test_power_validation.py` sirven de patrón.

**Trinquete de CI:** subir el piso `--fail-under` en `.github/workflows/ci.yml` en cada etapa (50 → 60 → 70 → 80) para que nunca baje.

**Los scripts bash root** (`rog-profile-sync.sh`, `apply-power-control.sh` y similares) **no salen en coverage.py**. Se prueban haciendo `source` con fakes, como en `test_fan_stuck.py`. El planificador debe listar sus funciones sin test.

**Node:**
- Los módulos con test ya están al 99 %.
- El hueco real es `desktop/renderer/app.js` (4128 líneas, sin tests unitarios) y `desktop/main.js` (1846 líneas).
- Solución: extraer lógica pura a módulos testeables (ver Bloque F).

---

## 4. Bloque C — README y roadmap

- **README.md:** se actualizó el 12 de octubre (captura principal, Highlights). Falta añadir:
  - ventiladores reactivos en los 3 perfiles;
  - curvas desde 50 °C;
  - vigilante del bug de firmware;
  - editor de gráficas;
  - aviso SIN DATOS;
  - cobertura;
  - Electron 44.
  
  Revisar que las capturas sean actuales.
- **Roadmap en dos lugares, siempre sincronizados:**
  - `docs/roadmap.md`, con la sección "In progress — v22";
  - `desktop/renderer/roadmap.js`, el roadmap de la app **en 8 idiomas**.

  Marcar lo hecho desde el 12 de octubre y mantener la honestidad: overlay y benchmarks siguen **PARCIALES**, con lo que falta listado. Guardian 2.0 y el helper único quedan "para futuro" por decisión del propietario.
- **CHANGELOG.md:** completar "Unreleased (v22)".
- **Aceptación:**
  - `node scripts/validate-i18n.mjs` en verde;
  - captura CDP del modal de roadmap (`tools/check-roadmap.mjs`).

---

## 5. Bloque D — Paridad con el Administrador de tareas de Windows (funciones nuevas)

### D1. Gráficas del historial: expandir y series nuevas

**Hoy existen 8 series:** temperatura y potencia de CPU y GPU, uso de CPU, RAM GiB, swap GiB y uso de GPU (`CHART_CATALOG` en `app.js`).

**Agregar:**
- Expandir o contraer cada gráfica.
- **VRAM usada** (GiB).
- **Red** de entrada y salida (Mb/s, dos líneas).
- **Load average** (1, 5 y 15).
- **Disco** en lectura y escritura (MB/s) y % ocupado.
- **Velocidad de cada ventilador** (rpm), con la curva objetivo como referencia, para ver en vivo si siguen la curva.
- **Frecuencia de la CPU** (GHz).

El backend ya recoge casi todo en el snapshot, así que solo faltan las series del historial (`app.py`, `series`) y su entrada en el catálogo.

**Ojo con el coste:**
- Cada serie suma unos KB por tick al NDJSON; la historia completa va en cada línea (deuda ARC-08).
- Conviene hacer antes **F2-09** (snapshot inicial + deltas). Si no, más series = más CPU.

### D2. Detalle de CPU (clic en la tarjeta CPU)

**Mostrar:** modelo, velocidad base y máxima, sockets, núcleos (P y E), procesadores lógicos, virtualización (VT-x activada o no), cachés L1/L2/L3, uptime y microcódigo.

**Fuentes, sin root:**
- `/proc/cpuinfo`;
- `/sys/devices/system/cpu/cpu*/cache/index*/{level,size,type,shared_cpu_list}`;
- `/sys/devices/system/cpu/cpu*/cpufreq/{base_frequency,cpuinfo_max_freq}`;
- los flags `vmx` y `svm`;
- `/sys/module/kvm_intel/parameters/nested`.

**Ya existe un modal de núcleos** (`cores.js`): extenderlo con una pestaña "Info", no crear otro.

### D3. Detalle de GPU (clic en la tarjeta GPU)

**Gráficas por motor, como en Windows:**
- 3D (`nvmlDeviceGetUtilizationRates`);
- codificación de vídeo (`nvmlDeviceGetEncoderUtilization`);
- decodificación de vídeo (`nvmlDeviceGetDecoderUtilization`);
- copia y memoria.

**Información:**
- versión del driver (`nvmlSystemGetDriverVersion`) y de CUDA;
- **Vulkan y OpenGL** en lugar de DirectX, que no existe en Linux: `vulkaninfo --summary` y `glxinfo -B` si están, con caché porque son lentos;
- enlace PCIe (gen y ancho, actual y máximo);
- VRAM total y usada;
- límite de potencia.

**Fuente:** NVML ya se carga en `gpu_clocks.py`.

**Restricción dura:** **no despertar la dGPU** si está en D3cold (`runtime_status=suspended`). El código actual ya lo respeta (`_dgpu_asleep`).

### D4. Procesos agrupados como en Windows (captura 7)

Referencia del propietario: Windows muestra "Google Chrome (24)" con una flecha para desplegar sus procesos, y la suma de CPU y memoria del grupo.

**Propuesta:**
- Agrupar por aplicación usando el árbol `ppid` (`/proc/<pid>/stat`).
- Nombre del grupo: el proceso raíz de ese árbol por debajo del de la sesión, o `comm`/`exe` como alternativa.
- Fila de grupo con ▸, número de procesos y la suma de % CPU, cores y RAM.
- Al desplegar, se ven los hijos.

**Matar un grupo:** con confirmación explícita, porque implica varias señales. Hoy, un clic en una fila mata un proceso.

**Dónde va:** en el modal "Ver todos" y, opcionalmente, en la tarjeta. El backend ya entrega `procs` (`procs.py`, `PROCS_TOP=25` en `app.py`); para agrupar hace falta `ppid`.

**Tests:** árbol `/proc` falso y agregación correcta.

---

## 6. Bloque E — Plan maestro v22: qué queda

**Hecho:**
- F0 completo;
- F1-02 a F1-07 (F1-03 queda como decisión del propietario: profile-sync se queda activo por defecto);
- F2-02 a F2-08;
- F3-05 a F3-07;
- F4-04 a F4-06 (editor básico);
- F5-02 a F5-04;
- F8-02;
- bugs de ventiladores y potencia.

El detalle está en `docs/agent-work/v22/STATUS.md`.

**Lo que pidió el propietario para ahora: overlay personalizable y benchmarks serios.**

- **F6, overlay** (`desktop/renderer/overlay.js` y `overlay.html`; `main.js` gestiona la ventana):
  - **Hecho:** clic que atraviesa, fila o caja, selector de monitor, 7 anclajes, y CPU, GPU, ventiladores y FPS (vía MangoHud).
  - **Falta:**
    - F6-01: matriz Wayland/X11. KDE Wayland puede ignorar la posición; probarlo sobre un juego a pantalla completa, lo que requiere al propietario.
    - F6-03: editor único.
    - F6-04: métricas nuevas: RAM, VRAM, discos, batería y uso de CPU.
    - F6-05: orden de las métricas.
    - F6-06: posición libre y arrastre.
    - F6-07: vista previa en vivo.
    - Temas o skins.
    - F6-08 y F6-09: persistencia y tolerancia a fallos.
    - F6-10: tests.
  - **Restricción:** debe seguir siendo ligero (el overlay recibe las mismas stats del backend).
- **Benchmarks serios** (`src/rog_monitor/benchmarks.py`; UI en `bench-detail.js`):
  - **Hecho (v21):** CPU y GPU local reproducibles, calentamiento, repeticiones, p50/p95/p99, throughput, throttle, veredicto del cap y export.
  - **Falta:**
    - estrés de GPU con Path Tracing en Vulkan (BVH en CPU; que degrade bien sin RT cores; **no asumir RTX**);
    - CPU con desglose AVX, entero y flotante por P-core y E-core;
    - un veredicto claro;
    - F9-03: benchmark reproducible.

**Resto del plan:**

| Fase | Pendiente |
|---|---|
| **F1** | F1-01 (auditar el helper root), F1-08 y F1-09 (VM con snapshot y recuperación por TTY: **requiere VM o al propietario**), F1-10 (revisión humana de los diffs root) |
| **F2** | F2-01 (mapa de métricas), **F2-09 (snapshot + deltas: hacerlo ANTES de D1)**, F2-10 (backpressure y reconexión) |
| **F3** | F3-01 (ADR de límites), **F3-02 y F3-03 (partir `app.js` de 4128 líneas y `main.js` de 1846)**, F3-04 (DI mínima), F3-08 (TTL e hilos), F3-09 (errores y logs), F3-10 (docs de arquitectura) |
| **F4** | F4-01, F4-02 y F4-03 (jerarquía de las tarjetas), F4-07 (escala GiB o %), F4-08 (topbar), F4-09 (accesibilidad de los modales: Escape, focus trap, teclado), F4-10 (tokens y regresión visual) |
| **F5** | F5-01 y F5-05 a F5-10 (modelo y panel de eventos, eventos de CPU/GPU, SMART, historial de disco) |
| **F7** | Guardian 2.0: **"para futuro"** por el propietario. **No activar el modo real.** Solo F7-01 y F7-07 si hace falta: hoy asusd escribe curvas en cada cambio de perfil y hay que decidir quién manda en cada atributo |
| **F8** | TUI: F8-01 y F8-03 a F8-10 (acciones async, tabla de teclas, ratón, export CSV, sensores ausentes, recuperación de la terminal) |
| **F9** | F9-01 (cobertura: ver Bloque B), F9-03 a F9-06 (bench de overhead y prueba larga), F9-07 (docs), F9-08 (supply chain: `npm audit` registrado en RISKS), F9-09 y F9-10 (gate de release y publicación) |

---

## 7. Bloque F — Arquitectura, para no seguir metiendo todo en `app.js`

- `desktop/renderer/app.js` tiene **4128 líneas** y no tiene tests unitarios; `main.js` tiene 1846.
- Toda función nueva de los bloques A, D y E debe nacer en su **propio módulo** con lógica pura testeable con `node --test`, como ya se hizo con `priv.js`, `smart.js` y `fsutil.js`.

  Ejemplos: `procs-table.js` (orden, estilo y agrupado), `charts-catalog.js` y `cpu-info.js`.
- `app.js` solo cablea el DOM.
- Hacer F3-02 por cortes pequeños (extraer, test, commit), no como una reescritura.
- Hay estilos duplicados (`style.css` y `styles/extras.css` repiten reglas de tablas): consolidarlos en tokens (F4-10).
- **Contrato Python↔JS:** `tests/test_contract.py` y `desktop/test/contract.test.js`, con `schema: 1`. Si F2-09 cambia el formato, se sube el schema y se actualizan ambos y los fixtures.

---

## 8. Reglas innegociables (para cualquier agente)

1. **Nada privilegiado sin permiso explícito en cada acción:** sudo, pkexec, `systemctl`, escrituras en `/sys` e instaladores. El propietario corre él mismo `sudo bash scripts/install-system.sh` cuando cambia algo root.
2. **Guardian:** jamás en modo real. El simulado es el de por defecto (ADR-0005 y ADR-0006).
3. **Push:**
   - El propietario autorizó commit y push del trabajo terminado a `feat/v22`, y llevarlo a `master` por PR con la CI en verde.
   - Nunca forzar push.
   - Nunca publicar secretos ni datos personales.
4. **i18n:** 8 idiomas (es, en, fr, it, pt, zh, ja, ko) para todo texto visible, con `node scripts/validate-i18n.mjs` en verde.
5. **Paridad TUI/desktop** cuando aplique.
6. **Sin dependencias nuevas** salvo que se justifiquen; `coverage` solo como herramienta de CI.
7. **Ventiladores:** la regla del propietario es "frío → bajan todos; caliente → suben todos". No tocar el vigilante sin una prueba térmica real (ver `checkpoints/BUG-fans-reactive.md`).
8. **Commits:**
   - pequeños, en español, uno por checkpoint;
   - firma `Co-Authored-By` del modelo;
   - cada checkpoint con su ficha en `docs/agent-work/v22/checkpoints/`, y STATUS/HANDOFF actualizados **tras cada tanda**, no al final.
9. **Nunca inventar** resultados de tests, mediciones ni capturas.

## 9. Verificación estándar (cada tanda)

```bash
cd ~/MyFiles/Dev/Rog-Monitor
HOME=$PWD/.ai/private/rog-v22/logs/home PYTHONPATH=src .ai/private/rog-v22/venv-clean/bin/python -s -m coverage run --source=src/rog_monitor -m unittest discover -s tests
.ai/private/rog-v22/venv-clean/bin/python -m coverage report --sort=cover
node --test --experimental-test-coverage desktop/test/*.test.js
node scripts/validate-i18n.mjs
for f in install.sh uninstall.sh scripts/*.sh; do bash -n "$f"; done
node scripts/e2e-smoke.mjs --out /tmp/e2e        # Electron + CDP; debe dar 31+/0
node .ai/private/rog-v22/tools/cdp.mjs ./check-XXX.mjs   # capturas de lo visual
```

## 10. Orden sugerido (el planificador decide el final)

| Etapa | Contenido | Por qué en ese lugar |
|---|---|---|
| E1 | A1, A2 y A3: bugs visuales | Rápidos, muy visibles y con test CDP |
| E2 | Cobertura de 52 a 65 %, con piso en CI | Red de seguridad antes de refactorizar |
| E3 | C: README, roadmap (2 lugares) y CHANGELOG | Pedido desde el 12 de octubre |
| E4 | F3-02 parcial: extraer `procs-table.js` y `charts-catalog.js` | Prepara el terreno para D |
| E5 | F2-09: snapshot + deltas | Necesario antes de añadir series |
| E6 | A4: estados vacío, carga, error y sin soporte | — |
| E7 | F6: overlay | Pedido "para ahora" |
| E8 | Benchmarks serios | Pedido "para ahora" |
| E9 | D1 a D4: paridad con el Administrador de tareas | — |
| E10 | Cobertura de 65 a 80 % | Va subiendo junto con cada etapa |
| E11 | Resto del plan: F4, F5, F8 y F9 | Release cuando el propietario lo pida |

Cada etapa:
- abre su checkpoint;
- usa subagentes con archivos disjuntos (nunca dos sobre `app.js` o `style.css` a la vez);
- verifica, hace commit y push a `feat/v22`;
- abre un PR a `master` cuando la CI esté verde.

## Anexo — las 7 capturas del propietario (2026-10-14)

1. Historial de benchmarks: 5 tarjetas cortadas abajo; "EXPAND ▸" y "X" casi invisibles. → A1
2. Procesos ordenados por % CPU: CPU en neón; cores en tenue y pequeño; RAM en tenue; PROCESS en blanco. → A2
3. Procesos ordenados por CORES: cores en rosa pero pequeño y sin brillo; % CPU en blanco; RAM en tenue. → A2
4. Procesos ordenados por RAM: RAM en neón; % CPU en blanco; cores en tenue y pequeño. → A2
5. Modal "All processes" (613 procesos) ordenado por cores: el mismo problema. → A2
6. Editor de gráficas con checkboxes nativos y botones ↑ ↓ pequeños. → A3. El propietario pide además expandir y contraer gráficas. → D1
7. Referencia de Windows: "Google Chrome (24)" agrupado y desplegable, con suma de CPU y memoria. → D4
