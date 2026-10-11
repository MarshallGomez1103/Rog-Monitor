# 15 · Handoff para AEVA

Síntesis para que AEVA o ChatGPT reconstruya el estado real de ROG Monitor sin adivinar. Cada afirmación remite a un informe del paquete (01–16) con la evidencia archivo:línea.

- Leyenda: **PROBADO** = ejecutado en esta auditoría; **OBSERVADO** = leído en el código; **NO PROBADO** = sin evidencia de ejecución.
- Fecha 2026-10-10, HEAD `7d49333`, base `fbfee52` (v20.0.0).

---

### 1. ¿Qué hizo realmente el agente en los 90 checkpoints?
Ejecutó el plan maestro de 9 fases en una sola tarde (2026-10-10, 17:55 → 23:13). Un orquestador Opus coordinó agentes Sonnet, que programaron en worktrees, y Haiku, que auditaron. Lo producido:

- **Seguridad (F1):**
  - Frontera root ADR-0001: los helpers root viven root-owned en `/usr/local/libexec/rog-monitor`, `rog-py.sh` usa `python3 -I` y `rog-ctl.sh` valida el argv.
  - Allowlist en `desktop/priv.js` con comprobación de VERSION.
  - Validación de entradas de poder y ventiladores, hardening de las unidades systemd, desinstalación completa y `docs/RECOVERY.md`.
- **Contratos (F2):** snapshot NDJSON `schema: 1` con contract tests Python↔JS, NVML por ctypes en vez de `nvidia-smi`, cachés TTL y un modelo de eventos unificado con ctx, tipo, cooldown, histéresis y dedup.
- **Métricas (F3):**
  - CPU por deltas de `/proc/stat` sin doble conteo de guest.
  - RAM con MemAvailable; swap.
  - `disk_io` (IOPS, busy), aunque no se muestra.
  - Fixtures de `/proc`, series de uso en %, SMART con caché de 24 h.
- **TUI (F4):** se corrigió el bug "galería". Ya no se re-muestrea al pulsar teclas, el ratón queda desactivado, se lee con `os.read` y hay avisos para terminales pequeñas.
- **Diseño (F5):** tokens CSS sobre los 12 temas, estados de widget, a11y parcial y gráficas con huecos null.
- **Guardián 2.0 (F6):** simulación (`ROG_THERMAL_DRY`), ABI de throttle corregido, restauración gradual y recuperación tras crash, decisiones trazables en el journal.
- **Benchmarks (F7):** warm-up, repeticiones, p50/p95/p99 y export. **Overlay solo parcial.**
- **Calidad (F8):** 162 tests Python, 46 Node, e2e Electron+CDP, CI ampliado, Dependabot, ADR 0001–0005, ARCHITECTURE.md y release 21.0.0.

**Conteo de los 90 CP** (informe 02, ajustado por el orquestador):

| Estado | CP |
|---|---|
| Completados y verificados con test o comprobación | 41 |
| Implementados sin probar | 17 |
| Parciales | 25 (incluye 4.06) |
| Decisión de no implementar | 1 (2.05) |
| Pendientes de hardware o del propietario | 6 (1.09, 7.01, 7.04, 8.05, 6.10, 8.10) |

Solo 21 de los 90 CP tienen archivo de evidencia, y toda esa evidencia está fuera de Git (`.gitignore:29-30`).

### 2. ¿Cuántos commits hay y cuáles están solo en local?
**54 commits, todos solo en local** (34 con contenido y 20 merges), 0 detrás de `origin/master`. Suman 124 archivos y +11 744/−1 598 líneas. No hay commits vacíos, tags ni stash, y el árbol está limpio. Están firmados con la identidad del propietario, con trailer `Co-Authored-By: Claude`. Lista en `evidencia/commits-locales.txt` (informe 01).

### 3. ¿Qué funciona, qué falla, qué es simulación y qué falta probar?
| Funciona (PROBADO en esta auditoría) | Falla o es engañoso (OBSERVADO o PROBADO) | Solo simulación o mock | Falta probar |
|---|---|---|---|
| Suite Python 162/162 | La tarjeta CPU no muestra uso % (GUI-01) | Guardián: tests con sysfs falso (`test_guardian_sim`) | Instalador y recuperación TTY en VM |
| Node 46/46 | RAM y swap solo en %, sin GiB (GUI-02/03) | Instalador: solo `--dry-run` y `ROG_PREFIX` | Overlay en Wayland y sobre juegos |
| e2e Electron 29/29, 0 excepciones | Gráficas % autoescaladas, no 0..100 (GUI-04) | e2e en CI acepta bloques `empty` | Minimizar y restaurar |
| i18n 1009 × 8 | Filtros RAM/Disco sin productor de eventos (GUI-05) | Contrato "live" sin hardware ASUS = degradación | Guardián real; conflicto asusd/profile-sync |
| TUI: 63 eventos basura → 0 muestras, terminal restaurada (pty) | TUI al 94 % de CPU sin TTY (TUI-02) | – | FPS y latencia de UI |
| Backend: spawns de 1.47/s a 0.18/s | CPU del backend sin mejora (3.53 → 3.65 %) y cadencia que deriva +128 ms (TST-03) | – | Suspensión/reanudación |
| `bash -n` de todos los scripts | Tasa de red negativa posible (MET-03) | – | CI en GitHub (nunca corrió) |
| Instalación v21 en el host verificada (root:root, VERSION 21.0.0, profile-sync activo) | AppImage sin `rich` cae en bucle (ARC-01, preexistente) | – | – |

### 4. ¿Cómo se obtienen y visualizan las métricas? (informe 05)
| Métrica | Fuente y fórmula | Visualización |
|---|---|---|
| CPU uso total y por núcleo | Deltas de `/proc/stat` (`cpu.py`; `usage` en `cpu.py:199`) | **No está en la tarjeta CPU.** Sale en el subtítulo de núcleos (`cores.js`) y en la gráfica "CPU usage" detrás del toggle `#hist-mode` |
| CPU temperatura, frecuencia, potencia | hwmon (coretemp, package), `scaling_cur_freq`, RAPL `energy_uj` (lectura sin root gracias a `enable-cpu-power.sh`) | Tarjeta CPU (°C grande, GHz, W) y gráficas de temperatura y potencia |
| RAM | `/proc/meminfo`: usada = MemTotal − MemAvailable (`sysinfo.py:426,461`); caché = Cached + SReclaimable | Medidor en System "14.8/47 GiB". La historia se guarda en **% entero** (`app.py:109-110`) y la gráfica es % autoescalada |
| Swap | SwapTotal − SwapFree (`sysinfo.py:466-469`) | Solo la curva % detrás del toggle; `swap_used_gb` no se usa en el escritorio |
| Discos | `statvfs` (capacidad), `/proc/diskstats` (throughput, IOPS, busy), SMART con `smartctl` vía pkexec y caché de 24 h | Panel de discos: capacidad y throughput. IOPS y busy no se muestran |
| GPU | NVML por ctypes (uso, VRAM, temperatura, potencia, clocks); no despierta la dGPU dormida (runtime PM) | Tarjeta GPU (uso %, W, VRAM, MHz) y gráficas |
| Ventiladores, batería, red | hwmon asus, `/sys/class/power_supply`, `/sys/class/net/*/statistics` | Bloque de ventiladores (RPM, %), System |

### 5. ¿Cuál es la arquitectura actual y qué refactors se justifican? (informe 04)
- **Flujo:** backend Python (`python -m rog_monitor --json-stream --interval 1`) → muestreo de sensores con cachés TTL en hilos → snapshot JSON `schema: 1` **con toda la historia en cada línea** → stdout → `desktop/main.js` (Electron main), que parsea y reenvía por IPC (`preload.js`, contextIsolation) → `renderer/app.js`, que pinta las tarjetas y las gráficas canvas, y el overlay (otra BrowserWindow).
- **TUI:** el mismo backend con `rich.Live`.
- **Privilegios:** `priv.js` (allowlist) → `/usr/bin/pkexec` → `/usr/local/libexec/rog-monitor/rog-ctl.sh` → helpers root.
- **Servicios systemd:**
  - `rog-profile-sync`, activo; aplica PL y curvas al arrancar y cada ≤30 s.
  - `rog-thermal-guardian`, opt-in.
  - `rog-battery-limit` y `rog-power-source`, opt-in.
- **Refactors justificados (incrementales):**
  1. Partir `renderer/app.js` (3993 l.) y `main.js` (1841 l.) por panel o dominio.
  2. Schema 2 con deltas de historia, para menos CPU y IPC.
  3. Descontar el tiempo de recolección del sleep.
  4. Escrituras atómicas y timeouts en `spawnSync`.
  5. Un solo dueño por atributo de hardware.

  **No se justifica una reescritura**, y la capa de puertos genérica se descartó con razón (ADR-0002).

### 6. ¿Cómo están la GUI, la TUI, el overlay, el Guardián 2.0 y los eventos?
- **GUI (06):**
  - Arranca y no tiene errores (e2e 29/29).
  - Tiene 11 bloques, 16 modales, 12 temas × 2 modos y 8 idiomas.
  - Faltan los requisitos explícitos del propietario: uso % en la tarjeta CPU, RAM y swap en GiB, escalas correctas y editor de gráficas.
  - Hay duplicación History/System/tarjetas.
  - A11y parcial: 13 de 16 modales sin Escape ni focus trap.
- **TUI (08):** el bug "galería" está corregido y probado en pty. La terminal se restaura bien y aguanta 20×5 y resizes rápidos. Queda el busy-loop sin TTY y las acciones `p`/`e` síncronas.
- **Overlay (07):**
  - BrowserWindow transparente, sin foco, click-through y `alwaysOnTop('screen-saver')`. Es opt-in.
  - Las preferencias solo se guardan en localStorage, con filas fijas y sin orden. El FPS solo existe si MangoHud está registrando.
  - **Sin flags Wayland, sin tests y sin prueba en un juego.** El roadmap interno lo anuncia como entregado.
- **Guardián 2.0 (09):**
  - Código completo con simulación, que la app activa por defecto la primera vez.
  - Bug del ABI de throttle corregido.
  - **Hoy está desactivado en el host.**
  - Riesgos antes de pasarlo a modo real: conflicto con asusd (activo) y con profile-sync, y restauración incompleta si falla `profile-limits` (GRD-03).
- **Eventos (06/09):** el modelo con ctx/cooldown/histéresis y los tipos telemetry/alert/action existen en el backend, pero la UI no filtra por tipo. Solo se emiten eventos de CPU, GPU, ventiladores y potencia, no de RAM ni disco, y no hay filtro por núcleo.

### 7. ¿Qué riesgos hay para el arranque de Linux y la instalación? (informe 10)
- **No se encontró ninguna unidad ni script que toque** display-manager, graphical.target, kargs, initramfs, GRUB ni modprobe. Todas las unidades son `WantedBy=multi-user.target` y no bloquean el login. **NO PROBADO en VM.**
- `install-system.sh` activa siempre `rog-profile-sync`, que escribe PL y curvas de ventiladores en cada arranque, y la regla RAPL.
- La recuperación existe (`safe-mode disable`, `RECOVERY.md`), pero la documentación tiene pasos incorrectos:
  - Un `safe-mode` sin acción solo muestra el estado.
  - "Bad power limit" restaura `default_value`, que en este equipo es el máximo.
  - Usa la copia del repo, no la de libexec.
- Bazzite es inmutable: `/usr/local` es `/var/usrlocal`, por eso el diseño usa `/usr/local`. No se usa rpm-ostree.
- El host del propietario tiene hoy v21 instalada. Lo verificado de solo lectura: profile-sync enabled/active; guardian, battery-limit y power-source disabled; asusd activo.

### 8. ¿Qué tests pasaron, fallaron o no se pudieron ejecutar? (informe 11)
- **Pasaron:**
  - py_compile.
  - unittest 162/162 (con `rich` visible; con HOME aislado fallan 11 por `ModuleNotFoundError: rich`, artefacto del entorno).
  - Node 46/46. Ojo: `node --test desktop/test` solo corre 21.
  - validate-i18n, `bash -n` y `git diff --check`.
  - e2e 29/29.
  - Medición del backend de 45 s.
- **No ejecutados:**
  - CI en GitHub, `electron-builder` y AppImage.
  - Instalador real, guardián real y SMART real.
  - `npm audit`, cobertura y FPS.
  - Benchmark de overhead con carga.

### 9. ¿Qué pasos faltan antes de publicar en GitHub? (informe 14)
1. Bundle de respaldo.
2. `git fetch` de solo lectura y revisar la divergencia.
3. Revisión humana de los 4 commits que tocan root.
4. Pruebas manuales del propietario: TUI, minimizar, overlay en Wayland, batería y guardián en simulación.
5. Instalador y recuperación en VM.
6. Actualizar `docs/roadmap.md` (dice "through v20") y quitar "KDE/Wayland" si el overlay no pasa.
7. Push a `release/v21` y PR, con el CI de GitHub en verde.
8. Merge y tag `v21.0.0`.

**Nada de esto se hizo. No hubo push.**

### 10. ¿Qué prioridades debe considerar AEVA para el siguiente roadmap? (informes 12, 13)
1. **Validar antes de construir:** CI remoto, VM y checklist manual.
2. **Métricas visibles correctas:** uso % en la tarjeta CPU; RAM y swap en GiB con eje 0..total y modo % 0..100; clamp de red.
3. **Simplificar la UI:**
   - Un lugar principal por dato.
   - Unidades coherentes.
   - Editor de gráficas (agregar, quitar, reordenar y persistir).
   - Filtros de eventos solo para fuentes reales.
4. **Overlay:**
   - Editor simple (diseño en 07 §4).
   - Prueba Wayland/X11.
   - Decidir XWayland, MangoHud o widget de Plasma (16, Q5).
5. **Hardware con un solo dueño por atributo** (asusd / profile-sync / guardián) y corregir GRD-03 antes del modo real.
6. **Rendimiento del backend:** schema 2 con deltas, cadencia exacta y CPU < 2.5 % a 1 s.
7. **Partir `app.js` y `main.js`** con el e2e como red de seguridad.
8. **Proceso:** versionar la evidencia, tags, venv y empaquetar `rich` en el AppImage.
