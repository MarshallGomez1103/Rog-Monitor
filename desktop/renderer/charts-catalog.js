/* ROG Monitor — Catálogo y helpers puros de las gráficas (F3-02 corte 1).
 * Series del historial (CHART_CATALOG), presets, y utilidades sin DOM: recorte
 * del búfer, rango del eje, tramos contiguos, índice bajo el cursor y texto
 * «hace N s». La serie puede traer null = hueco (dGPU dormida): no es 0, no
 * entra en min/max y corta la línea. Script clásico: expone
 * window.RogChartsCatalog y, bajo Node, module.exports (tests sin Electron). */
(function (root) {
  'use strict';

  /* Historial configurable (F4-04..06). Cada entrada: key de la serie del snapshot ->
     [color CSS, opts de drawChart, clave i18n]. opts.max fija el techo del eje (% → 100);
     opts.maxKey lo toma de stats.sys (RAM/swap en GiB → 0..total). */
  const CHART_CATALOG = {
    cpu_temp: ['--cold', { unit: '°C' }, 'chart.cpu_temp'],
    cpu_power: ['--accent', { fromZero: true, unit: 'W' }, 'chart.cpu_power'],
    gpu_temp: ['--okstate', { unit: '°C' }, 'chart.gpu_temp'],
    gpu_power: ['--hot', { fromZero: true, unit: 'W' }, 'chart.gpu_power'],
    cpu_usage: ['--cold', { max: 100, unit: '%' }, 'chart.cpu_usage'],
    ram_gb: ['--accent', { maxKey: 'ram_total_gb', unit: 'GiB' }, 'chart.ram_gib'],
    swap_gb: ['--ink', { maxKey: 'swap_total_gb', unit: 'GiB' }, 'chart.swap_gib'],
    gpu_util: ['--hot', { max: 100, unit: '%' }, 'chart.gpu_usage'],
  };
  const HIST_PRESETS = {
    temp: ['cpu_temp', 'cpu_power', 'gpu_temp', 'gpu_power'],
    usage: ['cpu_usage', 'ram_gb', 'swap_gb', 'gpu_util'],
  };

  const CHART_MAX_POINTS = 1200; // tope duro del búfer dibujado (el backend manda ≤900)

  function chartTail(values, n) {
    return values.slice(-Math.min(CHART_MAX_POINTS, Math.max(2, n)));
  }

  function chartRange(data, fromZero, ceil) {
    let min = Infinity, max = -Infinity;
    for (const v of data) {
      if (!Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (min === Infinity) return null;      // todo huecos: nada que escalar
    // techo fijo (% → 100, GiB → total): la escala no salta con los datos
    if (Number.isFinite(ceil) && ceil > 0) return { lo: 0, hi: ceil };
    // snap the axis to steps of 5 so min/max don't jitter every second
    // fromZero: los watts arrancan en 0 — si no, una bajada de 10→3 W llena
    // toda la altura de la gráfica y parece un desplome dramático
    const lo = fromZero ? 0 : Math.floor(min / 5) * 5;
    let hi = Math.ceil(max / 5) * 5;
    if (hi - lo < 10) hi = lo + 10;
    return { lo, hi };
  }

  /* Tramos contiguos de datos válidos: [[i0, i1], ...] (inclusive). */
  function chartRuns(data) {
    const runs = [];
    let start = -1;
    for (let i = 0; i <= data.length; i++) {
      const ok = i < data.length && Number.isFinite(data[i]);
      if (ok && start < 0) start = i;
      else if (!ok && start >= 0) { runs.push([start, i - 1]); start = -1; }
    }
    return runs;
  }

  function chartIndexAt(state, px) {
    return Math.max(0, Math.min(state.data.length - 1,
      Math.round((px / state.w) * (state.data.length - 1))));
  }

  /* «hace N s»; `tr` es el traductor (por defecto window.t, resuelto al llamar). */
  function agoText(secondsAgo, tr) {
    const t = tr || (typeof window !== 'undefined' ? window.t : null);
    if (secondsAgo < 1) return t('chart.now');
    if (secondsAgo < 60) return t('chart.ago_seconds', { s: secondsAgo });
    return t('chart.ago_minutes_seconds', {
      m: Math.floor(secondsAgo / 60),
      s: secondsAgo % 60,
    });
  }

  const api = { CHART_CATALOG, HIST_PRESETS, CHART_MAX_POINTS, chartTail, chartRange, chartRuns, chartIndexAt, agoText };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RogChartsCatalog = api;
})(typeof window !== 'undefined' ? window : null);
