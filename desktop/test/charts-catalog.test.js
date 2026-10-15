'use strict';
// Catálogo y helpers puros de las gráficas (renderer/charts-catalog.js, F3-02 corte 1).
const test = require('node:test');
const assert = require('node:assert');
const C = require('../renderer/charts-catalog.js');

const { CHART_CATALOG, HIST_PRESETS, CHART_MAX_POINTS, chartTail, chartRange, chartRuns, chartIndexAt, agoText } = C;

test('catálogo: las 8 series actuales con IDs estables y en orden', () => {
  assert.deepStrictEqual(Object.keys(CHART_CATALOG),
    ['cpu_temp', 'cpu_power', 'gpu_temp', 'gpu_power', 'cpu_usage', 'ram_gb', 'swap_gb', 'gpu_util']);
});

test('catálogo: unidades, colores e i18n por serie', () => {
  const units = Object.fromEntries(Object.entries(CHART_CATALOG).map(([k, v]) => [k, v[1].unit]));
  assert.deepStrictEqual(units, {
    cpu_temp: '°C', cpu_power: 'W', gpu_temp: '°C', gpu_power: 'W',
    cpu_usage: '%', ram_gb: 'GiB', swap_gb: 'GiB', gpu_util: '%',
  });
  for (const [k, [color, opts, i18n]] of Object.entries(CHART_CATALOG)) {
    assert.match(color, /^--[a-z]+$/, k);
    assert.match(i18n, /^chart\./, k);
    assert.strictEqual(typeof opts, 'object', k);
  }
  assert.strictEqual(CHART_CATALOG.cpu_power[1].fromZero, true);
  assert.strictEqual(CHART_CATALOG.gpu_power[1].fromZero, true);
  assert.strictEqual(CHART_CATALOG.cpu_usage[1].max, 100);
  assert.strictEqual(CHART_CATALOG.gpu_util[1].max, 100);
  assert.strictEqual(CHART_CATALOG.ram_gb[1].maxKey, 'ram_total_gb');
  assert.strictEqual(CHART_CATALOG.swap_gb[1].maxKey, 'swap_total_gb');
});

test('presets: temperatura y uso, todo apunta al catálogo', () => {
  assert.deepStrictEqual(HIST_PRESETS.temp, ['cpu_temp', 'cpu_power', 'gpu_temp', 'gpu_power']);
  assert.deepStrictEqual(HIST_PRESETS.usage, ['cpu_usage', 'ram_gb', 'swap_gb', 'gpu_util']);
  [...HIST_PRESETS.temp, ...HIST_PRESETS.usage].forEach((k) => assert.ok(CHART_CATALOG[k], k));
});

test('chartRange: huecos no cuentan, % 0-100, GiB 0..total, autoescala en pasos de 5', () => {
  assert.deepStrictEqual(chartRange([null, 62, NaN, 71], false), { lo: 60, hi: 75 });
  assert.strictEqual(chartRange([null, null], false), null);
  assert.strictEqual(chartRange([], false), null);
  assert.deepStrictEqual(chartRange([null, 3, 4], true), { lo: 0, hi: 10 });
  assert.deepStrictEqual(chartRange([50, 50], false), { lo: 50, hi: 60 });
  assert.deepStrictEqual(chartRange([30, 30], true, 100), { lo: 0, hi: 100 });
  assert.deepStrictEqual(chartRange([14.6, 14.8], false, 47), { lo: 0, hi: 47 });
  assert.strictEqual(chartRange([null], false, 100), null);
  assert.deepStrictEqual(chartRange([30, 31], true, 0), { lo: 0, hi: 35 });   // techo 0 no es techo
  assert.deepStrictEqual(chartRange([30, 31], true, undefined), { lo: 0, hi: 35 });
});

test('chartRuns: tramos contiguos, con null/NaN cortando', () => {
  assert.deepStrictEqual(chartRuns([1, 2, null, 4, 5, 6, null]), [[0, 1], [3, 5]]);
  assert.deepStrictEqual(chartRuns([null, 7, NaN]), [[1, 1]]);
  assert.deepStrictEqual(chartRuns([null, null]), []);
  assert.deepStrictEqual(chartRuns([]), []);
  assert.deepStrictEqual(chartRuns([1, 2, 3]), [[0, 2]]);
});

test('chartTail: acotado entre 2 y CHART_MAX_POINTS', () => {
  assert.strictEqual(CHART_MAX_POINTS, 1200);
  const big = Array.from({ length: CHART_MAX_POINTS * 3 }, (_, i) => i);
  assert.strictEqual(chartTail(big, 10 ** 9).length, CHART_MAX_POINTS);
  assert.deepStrictEqual(chartTail([1, 2, 3, 4, 5], 3), [3, 4, 5]);
  assert.strictEqual(chartTail([1, 2, 3], 0).length, 2);
});

test('chartIndexAt: píxel -> índice, acotado a [0, n-1]', () => {
  const st = { w: 100, data: [0, 1, 2, 3, 4] };
  assert.strictEqual(chartIndexAt(st, 0), 0);
  assert.strictEqual(chartIndexAt(st, 50), 2);
  assert.strictEqual(chartIndexAt(st, 100), 4);
  assert.strictEqual(chartIndexAt(st, -30), 0);
  assert.strictEqual(chartIndexAt(st, 999), 4);
});

test('agoText: ahora / segundos / minutos+segundos con el traductor recibido', () => {
  const tr = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key);
  assert.strictEqual(agoText(0, tr), 'chart.now');
  assert.strictEqual(agoText(5, tr), 'chart.ago_seconds:{"s":5}');
  assert.strictEqual(agoText(59, tr), 'chart.ago_seconds:{"s":59}');
  assert.strictEqual(agoText(125, tr), 'chart.ago_minutes_seconds:{"m":2,"s":5}');
});

test('agoText sin traductor explícito usa window.t', () => {
  global.window = { t: (k) => `W:${k}` };
  try { assert.strictEqual(agoText(0), 'W:chart.now'); } finally { delete global.window; }
});
