'use strict';
// Contrato de renderer/app.js (script clásico) con el catálogo y el modelo de gráficas.
// La lógica pura vive en charts-catalog.js (charts-catalog.test.js) y chart-editor-model.js.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');
const { CHART_CATALOG, HIST_PRESETS } = require('../renderer/charts-catalog.js');
// clampPct vive ahora en widget-status-view.js (S03-2); app.js lo desestructura de window.RogStatusView
const { clampPct } = require('../renderer/widget-status-view.js');
const CE = require('../renderer/chart-editor-model.js');

test('clampPct deja todo en 0-100 y null/NaN en 0', () => {
  assert.strictEqual(clampPct(150), 100);
  assert.strictEqual(clampPct(-5), 0);
  assert.strictEqual(clampPct(null), 0);
  assert.strictEqual(clampPct(undefined), 0);
  assert.strictEqual(clampPct('abc'), 0);
  assert.strictEqual(clampPct(42.5), 42.5);
});

// histCharts/moveChart salieron de app.js (N-A3-01) y catálogo/helpers (F3-02 corte 1): su lógica y
// sus pruebas viven en chart-editor-model.js y charts-catalog.js. Aquí se comprueba el cableado.
test('app.js usa modelo y catálogo (sin copias locales) y se cargan antes que app.js', () => {
  assert.ok(!/^function moveChart\(/m.test(src), 'moveChart duplicada en app.js');
  assert.ok(!/^const CHART_CATALOG = /m.test(src) && !/^function chartRange\(/m.test(src), 'catálogo/helpers duplicados en app.js');
  assert.match(src, /= window\.RogChartsCatalog;/);
  assert.match(src, /CE\.normalizeChartList\(saved, CHART_KEYS, HIST_PRESETS\.temp\)/);
  assert.match(src, /CE\.nextPresetList\(histList, HIST_PRESETS\)/);
  const html = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  const app = scripts.indexOf('app.js');
  assert.ok(scripts.indexOf('charts-catalog.js') >= 0 && scripts.indexOf('charts-catalog.js') < app);
  assert.ok(scripts.indexOf('chart-editor-model.js') >= 0 && scripts.indexOf('chart-editor-model.js') < app);
  assert.ok(scripts.indexOf('chart-editor-ui.js') > app);
});

test('catálogo real + modelo: JSON corrupto/heredado vuelve a temperatura y lo válido conserva el orden', () => {
  const keys = Object.keys(CHART_CATALOG);
  const norm = (v) => CE.normalizeChartList(v, keys, HIST_PRESETS.temp);
  assert.deepStrictEqual(norm(null), HIST_PRESETS.temp);
  assert.deepStrictEqual(norm('{basura'), HIST_PRESETS.temp);
  assert.deepStrictEqual(norm('["constructor"]'), HIST_PRESETS.temp);   // Hallazgo A: antes tumbaba la app
  assert.deepStrictEqual(norm('["ram_gb","nope","ram_gb","cpu_temp"]'), ['ram_gb', 'cpu_temp']);
  assert.deepStrictEqual(norm(HIST_PRESETS.usage), HIST_PRESETS.usage);
});
