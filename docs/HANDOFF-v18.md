# HANDOFF v18.0.0 — Diagnóstico de hardware + arreglos i18n/UI

**Estado:** consolidado en la rama local **`v18-diagnostics`** (NO en master, NO
pusheado — Marshall revisa, fusiona a master y pushea él mismo). Falta la
**prueba en vivo en pantalla** (Marshall).

## Qué se hizo (build multiagente: Opus orquesta + 5 Sonnet en worktrees)

Cada feature en su rama, fusionadas secuencialmente A→E en `v18-diagnostics`:

- **v18-a-bugs** — Neón de la columna `% NÚCLEO` (faltaba color base en `td.cpu-core`).
  Benchmarks: 14 claves i18n × 8 idiomas (estaban hardcodeadas en español en
  `bench-detail.js`). Exports (benchmark/eventos) en el idioma activo.
- **v18-b-battery** — `power.py`: `health_percent`, `cycle_count`, `energy_*_wh`
  (root-free, fallback charge_* µAh). Panel `battery.js` + bloque + TUI (salud/ciclos).
- **v18-c-disks** — `sysinfo.py`: `fstype`, `model`, `block_dev`, `read_mbps`,
  `write_mbps` (delta /proc/diskstats) + `smart_block_devices`. **SMART bajo demanda**
  con `pkexec smartctl -j -a <dev>` (IPC `readSmart` en main.js/preload, cacheado por
  sesión, botón por disco). `smartmontools` agregado al instalador. TUI: temp/IO.
- **v18-d-diag** — Hub "Diagnóstico" (HERRAMIENTAS → DIAGNÓSTICO): tarjetas
  CPU/GPU/iGPU/batería/ventiladores/placa madre (DMI root-free en `sysinfo.py`) +
  pruebas teclado / sonido (Web Audio L/R) / pantalla (colores fullscreen).
- **v18-e-events** — Eventos 4-tupla `(time, level, msg, key)` en `alerts.py`
  (tolera 3-tupla viejas). `event-detail.js`: clic → modal explicativo por tipo en
  8 idiomas, filtro por categoría.

Consolidación: roadmap (`docs/roadmap.md` + `roadmap.js` con hito v18 en 8 idiomas),
`VERSION`/`desktop/package.json`/`ROADMAP_CURRENT` → **18.0.0**, CHANGELOG.

## Verificación hecha (automática)
- `node --check` de todos los JS del renderer + main.js/preload.js — OK.
- `python -m py_compile src/rog_monitor/*.py` — OK.
- Self-checks: bench i18n 42/42; `power.py` (88.8%); `alerts.py` (4-tupla);
  `sysinfo.py` (I/O math + parseo SMART NVMe/ATA + DMI fallback) — todos OK.
- `--json-stream` real en este equipo: `version 18.0.0`, `battery.health_percent 88.8`,
  `cycle_count 0`, `sys.dmi` poblado, `smart_block_devices` = 2 NVMe, discos con
  campos nuevos.

## Pendiente para Marshall
1. Probar en vivo (`desktop/start.sh`): neón núcleo, cambio de idioma en benchmarks/
   sesión + export, panel batería, panel disco + botón SMART (pide contraseña 1 vez),
   hub Diagnóstico (teclado/sonido/pantalla), eventos clic + filtro.
2. Fusionar `v18-diagnostics` → master y **push** (yo no pusheo).
3. Borrar ramas de agentes (`v18-a-bugs`…`v18-e-events`) y worktrees `.claude/worktrees/*`.
