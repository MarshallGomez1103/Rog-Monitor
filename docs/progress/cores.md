# Progreso — A-CORES (rama `v13/cores`)

Núcleos + datos por núcleo. Dueño de: `desktop/renderer/cores.js`,
`desktop/renderer/styles/cores.css`, `src/rog_monitor/procs.py`.

## Estado: COMPLETO (listo para fusionar)

## Hecho

1. **Más neón** en el modal de núcleos: título con glow de `--accent`, botón
   Cerrar con borde neón, GHz y temperatura con `text-shadow` por nivel, barra
   de uso con glow. Celdas/botones legibles.
2. **P-cores vs E-cores distintos**:
   - Detección por `core_id`: un `core_id` que aparece en ≥2 hilos lógicos =
     P-core (HyperThreading); 1 hilo = E-core.
   - P = estética **deportiva** (rojo/naranja `--p-core`, ícono ⚡, letra P,
     borde superior y barra de uso tintados en rojo).
   - E = estética **ecológica** (verde `--e-core`, ícono 🌿, letra E, borde y
     barra tintados en verde).
   - **Degradación elegante**: si la CPU es homogénea (no hay ambos tipos) se
     usa `.core-flat` sin badges ni tinte, y la leyenda cambia a `cores.legend.flat`.
3. **GHz inline en la celda** (pie de cada tile, junto al uso%). **Toast/title
   eliminado**: el WIP ya había quitado el `title=` nativo que parpadeaba cada
   segundo; ahora hay un `.core-hint` CSS (aparece solo en hover/focus, no es un
   toast que se recrea). Además la rejilla ahora se **parchea en sitio** cada
   segundo (no se reconstruye el innerHTML), así el hover/foco no se pierde y
   el hint no reaparece — esto era la causa raíz del parpadeo.
4. **Clic en un núcleo → modal de detalle**: uso%, frecuencia (GHz), temperatura
   (tarjeta tintada por nivel) y **procesos en ese núcleo**. Se actualiza cada
   segundo SIN toast (indicador "En vivo" con punto que late).
   - Datos de procesos por núcleo: nuevo `procs_by_core` aditivo en el stream
     (`app.py` → `ProcReader.by_core()`), que agrupa TODOS los procesos activos
     por `last_cpu`. Fallback: si el backend no lo emite, filtra `stats.procs`
     (top global) por `last_cpu`.
5. **Todo texto vía `t()`** + `window.i18n.register({es,en})` en cores.js.
   `cores.btn` se mantiene = NÚCLEOS/CORES (lo usa index.html).

## Extras de calidad

- Accesibilidad: tiles con `role="button"`/`tabindex`; **Enter/Espacio** abren
  el detalle; **Escape** cierra (detalle primero, luego la rejilla). Sin tocar
  app.js.
- Render eficiente: solo redibuja con modal abierto; parcheo en sitio salvo
  cambio estructural (cpus o modo hetero) o cambio de idioma.

## Archivos tocados

- `desktop/renderer/cores.js` — registro i18n, grid, detalle, render en sitio,
  teclado/Escape, consumo de `procs_by_core`.
- `desktop/renderer/styles/cores.css` — neón título/botón, tinte P/E en barra,
  estilos de detalle.
- `src/rog_monitor/procs.py` — `last_cpu` por proceso + `by_core()` (ya en WIP).
- `src/rog_monitor/app.py` — campo aditivo `procs_by_core` en el stream.
  (NOTA: `app.py` Python NO está en la lista de prohibidos; el prohibido es
  `desktop/renderer/app.js`, que NO se tocó.)

## NO tocado (según reglas)

- `desktop/renderer/app.js` (incluye la tabla de procesos en 2 columnas y el
  wireo del botón `#procs-cores-btn` → `window.RogCores.open()`).
- `i18n.js`, `neon.css`, `roadmap.js`, `package.json`, README, CHANGELOG,
  HANDOFF, roadmap.md, `index.html`.

## Contrato de datos (ya provisto por cpu.py / app.py)

- `stats.cpu.core_grid`: `[{cpu, usage, ghz, temp, core_id}, ...]` (cpu.py:140).
- `stats.cpu.model`.
- `stats.procs`: top global con `{pid, name, cpu, last_cpu, ...}`.
- `stats.procs_by_core`: `{ "<cpuLogico>": [{pid,name,cpu,...}, ...] }` (claves
  string por JSON). **Aditivo** — degrada si ausente.

## Claves i18n nuevas (para cablear en los 8 idiomas)

| clave | es | en |
|---|---|---|
| `cores.btn` | NÚCLEOS | CORES |
| `cores.title` | Núcleos de la CPU | CPU cores |
| `cores.subtitle` | `{model} · {threads} hilos ({phys} núcleos) · uso {use}% · máx {max}°C` | `{model} · {threads} threads ({phys} cores) · {use}% used · max {max}°C` |
| `cores.ptype` | Núcleo de rendimiento (P) | Performance core (P) |
| `cores.etype` | Núcleo de eficiencia (E) | Efficiency core (E) |
| `cores.type` | Núcleo | Core |
| `cores.legend` | Color = temperatura · barra = uso · P = rendimiento (deportivo) · E = eficiencia (ecológico) · clic en un núcleo para ver su detalle. | Color = temperature · bar = usage · P = performance (sporty) · E = efficiency (eco) · click a core for details. |
| `cores.legend.flat` | Color = temperatura · barra = uso · clic en un núcleo para ver su detalle. | Color = temperature · bar = usage · click a core for details. |
| `cores.none` | Sin datos de núcleos todavía… | No core data yet… |
| `cores.ghz` | GHz | GHz |
| `cores.usage` | uso | usage |
| `cores.hint` | Clic para ver detalle | Click for details |
| `cores.detail.title` | Núcleo {cpu} | Core {cpu} |
| `cores.detail.ptype` | Rendimiento (P) | Performance (P) |
| `cores.detail.etype` | Eficiencia (E) | Efficiency (E) |
| `cores.detail.usage` | Uso | Usage |
| `cores.detail.freq` | Frecuencia | Frequency |
| `cores.detail.temp` | Temperatura | Temperature |
| `cores.detail.procs` | Procesos en este núcleo | Processes on this core |
| `cores.detail.procs.none` | Sin procesos activos detectados en este núcleo ahora mismo. | No active processes detected on this core right now. |
| `cores.detail.live` | En vivo · actualiza cada segundo | Live · updates every second |
| `cores.detail.col.proc` | Proceso | Process |
| `cores.detail.col.cpu` | % CPU | CPU % |
| `common.close` | Cerrar | Close |

> `cores.btn` y `common.close` quizá ya existan en i18n.js; si chocan, prevalece
> el valor de i18n.js (cores.js solo registra como respaldo).

## Checklist de aceptación §A-CORES

- [x] Más neón en el modal (botones/celdas legibles).
- [x] P-cores deportivos / E-cores ecológicos visualmente distintos.
- [x] Degrada elegante si la CPU no distingue tipos (`.core-flat`).
- [x] GHz en la propia celda; toast de hover por segundo eliminado.
- [x] Clic en núcleo → modal de detalle (procesos/uso/freq/temp), refresca cada
      segundo sin toast.
- [x] Todo texto traducible vía `t()` + register en cores.js.
- [x] No se tocó la tabla de procesos en app.js.

## Verificación

- `node --check desktop/renderer/cores.js` → OK
- `python -c "import ast;ast.parse(open('src/rog_monitor/procs.py').read())"` → OK
- `python -c "import ast;ast.parse(open('src/rog_monitor/app.py').read())"` → OK
