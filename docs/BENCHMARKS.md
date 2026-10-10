# Benchmarks reproducibles

Cómo mide ROG Monitor (`src/rog_monitor/benchmarks.py`), qué guarda cada
resultado y cómo comparar dos corridas sin engañarse. Solo biblioteca estándar.

## Método

- **CPU**: N procesos Python (N = hilos lógicos) en un bucle de punto flotante
  al 100 %. Cada uno cuenta iteraciones completadas (lotes de 100 000) y escribe
  el acumulado en un archivo temporal propio; el padre lo lee una vez por
  muestra. **Rendimiento = Δiteraciones / Δt** sobre la fase medida (`iter/s`,
  y por hilo). Es un score sintético para comparar *esta* máquina consigo misma,
  no un benchmark entre equipos.
- **GPU local**: `glmark2`/`vkmark` si existen; si no, 4× `vkcube` en modo
  IMMEDIATE (sin vsync). No expone métrica de trabajo: solo telemetría térmica.
- **Muestreo**: 1 muestra/s con los lectores del monitor (hwmon, RAPL, NVML,
  `/proc/stat`, cpufreq). No se lanza ningún comando externo por muestra.
- **Fases por repetición**: aviso de arranque en caliente → **calentamiento**
  (`--warmup`, por defecto 5 s; sus muestras llevan `warmup: true` y quedan
  **fuera** de toda estadística y del `summary`) → fase **medida** (`--seconds`).
  Entre repeticiones hay una pausa de enfriamiento (`--cooldown`, 10 s).
- **Arranque en caliente**: si la CPU arranca por encima de
  `--idle-baseline + --start-margin` (45 + 10 = 55 °C por defecto) el resultado
  trae `warnings: [{code: "start_hot", ...}]`. **Solo avisa**, nunca bloquea.

```
python3 -m rog_monitor.benchmarks cpu --seconds 45 --warmup 5 --reps 3
python3 -m rog_monitor.benchmarks gpu --seconds 45 --reps 2 --idle-baseline 42 --start-margin 8
```

En la app: Benchmark térmico → Calentamiento (s) y Repeticiones (por defecto
5 s y 1). Al abrir un resultado del historial se ven percentiles y condiciones.

## Métricas

Por magnitud presente (`cpu_temp`, `cpu_package`, `cpu_watts`, `cpu_freq_ghz`,
`cpu_util`, `gpu_temp`, `gpu_watts`, `gpu_util`, `gpu_clock_mhz`): `n`, `mean`,
`min`, `max`, `stdev` y `p50`/`p95`/`p99`. Se calculan **por repetición**
(`runs[i].stats`) y **agregadas** (todas las muestras medidas juntas,
`stats.aggregate`). Con ≥ 2 repeticiones, `stats.cv_across_reps_pct` da el
coeficiente de variación de las medias por repetición y `throughput.cv_pct` el
del score.

### Definición de percentiles

Interpolación lineal **inclusiva** (tipo 7 de Hyndman-Fan; equivale a
`statistics.quantiles(..., method='inclusive')`): con la serie ordenada
`v[0..n-1]`, `h = (n-1)·q/100`, `p = v[⌊h⌋] + (h-⌊h⌋)·(v[⌊h⌋+1] - v[⌊h⌋])`.
Ej.: `1..10` → p50 = 5.5, p95 = 9.55, p99 = 9.91. Con 45 muestras, p99 es casi
el máximo: con series cortas lee p95/p99 como "pico típico", no como cola real.

`stdev` es **muestral** (n-1; `null` con una sola muestra). `CV = stdev/media·100`.
Las funciones puras (`percentile`, `describe`, `cv_percent`, `build_stats`,
`throughput`) tienen tests con series fijas en `tests/test_benchmarks.py`.

## Condiciones guardadas (`conditions`, esquema 2)

Versión de la app y del esquema, kernel, modelo de CPU, nombre y driver de la
GPU, fuente de energía (AC/batería), perfil ASUS y PPD, EPP y governor, topes de
ventiladores del perfil, estado del guardián térmico, temperaturas de arranque
(CPU/GPU), hilos de carga, duración, calentamiento, repeticiones y los umbrales
de arranque. Se leen una vez al inicio de los lectores existentes (el perfil PPD
usa `busctl` una sola vez). Resultados anteriores al esquema 2 no las tienen.

## Exportar

Botón EXPORTAR (ventana de benchmark = último resultado; detalle de un
resultado = ese resultado). Un diálogo de guardado escribe:

- `*.json`: `export_schema` (`rog-monitor-benchmark-export/1`), `exported_at`,
  `schema`, `app_version` y el resultado completo (condiciones, stats, runs,
  warnings, throughput, muestras).
- `*.csv` junto al JSON (mismo nombre): líneas `# clave: valor` con esquema,
  versión y condiciones, luego una fila por muestra (`t, rep, warmup, cpu_*,
  gpu_*, work, fan_*`). Con pandas: `read_csv(f, comment='#')`. Las filas con
  `warmup=true` deben excluirse al analizar.

## Costo del monitor sobre la carga (CP-7.08)

```
python3 scripts/measure.py --bench-overhead --duration 12 --reps 3
```

Corre el benchmark de CPU con un backend extra `--json-stream` apagado y
encendido, alternando el orden (off,on / on,off / off,on) para repartir la
deriva térmica, y compara el score (iter/s). Si `|delta| < CV` es ruido.

Medición real (20 hilos, i7-13650HX, perfil performance, AC, 12 s + 3 s de
calentamiento, 3 pares): score medio **142 210 447 iter/s sin backend vs
141 580 849 con backend, delta -0.44 %** (CV 1.94 % sin, 0.97 % con). Es decir:
indistinguible del ruido. Honestidad sobre el montaje: la app de escritorio y su
backend ya corrían en la máquina en ambos brazos, así que esto mide el costo de
**un backend adicional**, no de "monitor vs. nada"; y las temperaturas de
arranque variaron 60-64 °C. Para el costo propio del backend (CPU %, RSS,
ctx/s, procesos lanzados) usa `scripts/measure.py --cmd "python3 -m rog_monitor
--json-stream --interval 1" --duration 60`.

## Limitaciones

- **Deriva térmica**: el score baja y las temperaturas suben durante el run
  (saturación del disipador, throttling). Dos corridas solo son comparables con
  la misma duración, el mismo calentamiento y temperatura de arranque parecida;
  mira `ambient_start` y los avisos `start_hot`.
- **Carga de fondo**: cualquier otro proceso (juegos, navegador, IA local)
  roba ciclos y calor. Cierra lo demás; `cpu_util` < 100 % durante la fase
  medida delata interferencia.
- **Estados de energía del portátil**: AC vs batería, perfil ASUS/PPD, EPP,
  topes de ventilador y el guardián cambian PL1/PL2 y la curva térmica. Se
  registran, pero **no se igualan**: compara con las mismas condiciones.
- Muestreo de 1 Hz: no ve picos de milisegundos. RAPL mide el paquete (no la
  pared). El score es una carga Python sintética: sirve para tendencia, no para
  comparar contra otras CPUs.
- Una sola repetición no tiene CV: usa `--reps 3` o más para saber cuánto vale
  una diferencia.

## Cómo comparar dos corridas

1. Verifica en `conditions` que coincidan: versión, kernel, fuente de energía,
   perfil, EPP, topes de ventilador, guardián, hilos, `seconds`/`warmup`.
2. Descarta o anota las que tengan `warnings` de arranque en caliente.
3. Compara **medianas (p50) y p95** y el score por repetición, no un solo máximo.
4. Con ≥ 3 repeticiones por lado, una diferencia solo es real si supera el
   mayor de los dos `cv_across_reps_pct`/`throughput.cv_pct`.
5. Si las temperaturas de arranque difieren > 5 °C, repite tras enfriar.
