'use strict';
// Helpers puros de las gráficas (renderer/app.js, script clásico): se extrae su
// texto y se evalúa aislado, igual que escape.test.js.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');

function grab(re, what) {
  const m = src.match(re);
  assert.ok(m, `${what} no encontrada en app.js`);
  return m[0];
}
const code = [
  grab(/^const CHART_MAX_POINTS = \d+;/m, 'CHART_MAX_POINTS'),
  grab(/^function chartTail\(values, n\) \{[\s\S]*?^\}/m, 'chartTail'),
  grab(/^function chartRange\(data, fromZero, ceil\) \{[\s\S]*?^\}/m, 'chartRange'),
  grab(/^function chartRuns\(data\) \{[\s\S]*?^\}/m, 'chartRuns'),
  grab(/^const CHART_CATALOG = \{[\s\S]*?^\};/m, 'CHART_CATALOG'),
  grab(/^const HIST_PRESETS = \{[\s\S]*?^\};/m, 'HIST_PRESETS'),
  grab(/^function histCharts\(saved\) \{[\s\S]*?^\}/m, 'histCharts'),
  grab(/^function moveChart\(list, key, dir\) \{[\s\S]*?^\}/m, 'moveChart'),
  grab(/^function clampPct\(v\) \{[\s\S]*?^\}/m, 'clampPct'),
].join('\n');
const { CHART_MAX_POINTS, chartTail, chartRange, chartRuns, clampPct, CHART_CATALOG, HIST_PRESETS, histCharts, moveChart } =
  new Function(`${code}; return { CHART_MAX_POINTS, chartTail, chartRange, chartRuns, clampPct, CHART_CATALOG, HIST_PRESETS, histCharts, moveChart };`)();

test('chartRange salta null/NaN y no los trata como 0', () => {
  assert.deepStrictEqual(chartRange([null, 62, null, 71], false), { lo: 60, hi: 75 });
  assert.deepStrictEqual(chartRange([NaN, 62, undefined, 71], false), { lo: 60, hi: 75 });
});

test('chartRange: todo huecos -> null; fromZero ancla en 0; rango mínimo 10', () => {
  assert.strictEqual(chartRange([null, null], false), null);
  assert.strictEqual(chartRange([], false), null);
  assert.deepStrictEqual(chartRange([null, 3, 4], true), { lo: 0, hi: 10 });
  assert.deepStrictEqual(chartRange([50, 50], false), { lo: 50, hi: 60 });
});

test('chartRuns corta la línea en cada hueco', () => {
  assert.deepStrictEqual(chartRuns([1, 2, null, 4, 5, 6, null]), [[0, 1], [3, 5]]);
  assert.deepStrictEqual(chartRuns([null, 7, null]), [[1, 1]]);
  assert.deepStrictEqual(chartRuns([null, null]), []);
  assert.deepStrictEqual(chartRuns([1, 2, 3]), [[0, 2]]);
});

test('chartTail acota el búfer: nunca más de CHART_MAX_POINTS ni menos de 2', () => {
  const big = Array.from({ length: CHART_MAX_POINTS * 3 }, (_, i) => i);
  assert.strictEqual(chartTail(big, 10 ** 9).length, CHART_MAX_POINTS);
  assert.deepStrictEqual(chartTail([1, 2, 3, 4, 5], 3), [3, 4, 5]);
  assert.strictEqual(chartTail([1, 2, 3], 0).length, 2);
});

test('clampPct deja todo en 0-100 y null/NaN en 0', () => {
  assert.strictEqual(clampPct(150), 100);
  assert.strictEqual(clampPct(-5), 0);
  assert.strictEqual(clampPct(null), 0);
  assert.strictEqual(clampPct(undefined), 0);
  assert.strictEqual(clampPct('abc'), 0);
  assert.strictEqual(clampPct(42.5), 42.5);
});

test('histCharts: valida lo guardado (JSON corrupto, claves desconocidas, repetidas, vacío)', () => {
  assert.deepStrictEqual(histCharts(null), HIST_PRESETS.temp);
  assert.deepStrictEqual(histCharts('{basura'), HIST_PRESETS.temp);
  assert.deepStrictEqual(histCharts('[]'), HIST_PRESETS.temp);
  assert.deepStrictEqual(histCharts('["ram_gb","nope","ram_gb","cpu_temp"]'), ['ram_gb', 'cpu_temp']);
  assert.deepStrictEqual(histCharts(['gpu_util']), ['gpu_util']);
});

test('moveChart sube/baja una posición y no se sale de los bordes', () => {
  const l = ['a', 'b', 'c'];
  assert.deepStrictEqual(moveChart(l, 'b', -1), ['b', 'a', 'c']);
  assert.deepStrictEqual(moveChart(l, 'b', 1), ['a', 'c', 'b']);
  assert.deepStrictEqual(moveChart(l, 'a', -1), l);
  assert.deepStrictEqual(moveChart(l, 'c', 1), l);
  assert.deepStrictEqual(l, ['a', 'b', 'c']);   // no muta
});

test('catálogo: preset uso = CPU % (0-100), RAM/swap GiB (0..total), GPU %', () => {
  assert.deepStrictEqual(HIST_PRESETS.usage, ['cpu_usage', 'ram_gb', 'swap_gb', 'gpu_util']);
  assert.deepStrictEqual(HIST_PRESETS.usage.map((k) => CHART_CATALOG[k][1].unit), ['%', 'GiB', 'GiB', '%']);
  assert.strictEqual(CHART_CATALOG.cpu_usage[1].max, 100);
  assert.strictEqual(CHART_CATALOG.gpu_util[1].max, 100);
  assert.strictEqual(CHART_CATALOG.ram_gb[1].maxKey, 'ram_total_gb');
  assert.strictEqual(CHART_CATALOG.swap_gb[1].maxKey, 'swap_total_gb');
  [...HIST_PRESETS.temp, ...HIST_PRESETS.usage].forEach((k) => assert.ok(CHART_CATALOG[k], k));
});

test('chartRange con techo fijo: % siempre 0-100, GiB 0..total (no autoescala)', () => {
  assert.deepStrictEqual(chartRange([30, 30, 30], true, 100), { lo: 0, hi: 100 });
  assert.deepStrictEqual(chartRange([14.6, 14.8], false, 47), { lo: 0, hi: 47 });
  assert.strictEqual(chartRange([null, null], false, 100), null);   // sin datos sigue siendo null
  assert.deepStrictEqual(chartRange([30, 31], true, undefined), { lo: 0, hi: 35 }); // sin techo: como antes
});
