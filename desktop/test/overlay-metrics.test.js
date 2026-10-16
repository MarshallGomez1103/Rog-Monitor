'use strict';
// S11b: modelo del overlay v2 (desktop/renderer/overlay-metrics.js, UMD): métricas elegibles una a una,
// migración desde las filas antiguas, escala S/M/L/XL, formateo con "—" (nunca 0 falso, S03),
// contraste WCAG de la paleta tipo MangoHud y mapeo a claves de MangoHud.
const test = require('node:test');
const assert = require('node:assert');
const M = require('../renderer/overlay-metrics.js');

const LANGS = ['en', 'es', 'fr', 'it', 'pt', 'zh', 'ja', 'ko'];
const plain = (v) => JSON.parse(JSON.stringify(v));

test('catálogo: 6 filas en orden fijo; CPU y GPU con uso, temperatura, vatios y frecuencia', () => {
  assert.deepStrictEqual(M.ROWS.map((r) => r.id), ['cpu', 'gpu', 'ram', 'vram', 'fps', 'fan']);
  assert.deepStrictEqual(M.ROWS[0].metrics, ['cpu_usage', 'cpu_temp', 'cpu_power', 'cpu_freq']);
  assert.deepStrictEqual(M.ROWS[1].metrics, ['gpu_usage', 'gpu_temp', 'gpu_power', 'gpu_freq']);
  assert.strictEqual(M.METRICS.length, 12);
});

test('defaults: uso+temp+W de CPU y GPU, FPS y FAN; la temperatura y el uso de CPU van activados', () => {
  assert.deepStrictEqual(M.DEFAULT_METRICS,
    ['cpu_usage', 'cpu_temp', 'cpu_power', 'gpu_usage', 'gpu_temp', 'gpu_power', 'fps', 'fan']);
  for (const k of ['cpu_usage', 'cpu_temp', 'gpu_temp']) assert.ok(M.DEFAULT_METRICS.includes(k), k);
});

test('normalizeMetrics: filtra desconocidas y duplicadas, ordena por catálogo; vacío es válido', () => {
  assert.deepStrictEqual(M.normalizeMetrics(['fan', 'cpu_freq', 'evil', 'cpu_freq', 'gpu_temp']), ['cpu_freq', 'gpu_temp', 'fan']);
  assert.deepStrictEqual(M.normalizeMetrics([]), []);
  assert.deepStrictEqual(M.normalizeMetrics('cpu_temp'), M.DEFAULT_METRICS);
  assert.deepStrictEqual(M.normalizeMetrics(null), M.DEFAULT_METRICS);
});

test('migrate: prefs antiguas por filas (show) -> métricas; sin show -> defaults', () => {
  assert.deepStrictEqual(M.migrateShow(undefined), M.DEFAULT_METRICS);
  assert.deepStrictEqual(M.migrateShow({ cpu: true, gpu: false, fans: false }), ['cpu_usage', 'cpu_temp', 'cpu_power', 'fps']);
  assert.deepStrictEqual(M.migrateShow({ fps: false }), ['cpu_usage', 'cpu_temp', 'cpu_power', 'gpu_usage', 'gpu_temp', 'gpu_power', 'fan']);
});

test('escala: S/M/L/XL = 100/125/150/200 %; default M; inválida -> M', () => {
  assert.deepStrictEqual(M.SCALE_IDS, ['S', 'M', 'L', 'XL']);
  assert.deepStrictEqual(M.SCALE_IDS.map(M.scaleFactor), [1, 1.25, 1.5, 2]);
  assert.strictEqual(M.DEFAULT_SCALE, 'M');
  for (const bad of [undefined, null, 'xl', 'XXL', 2, '__proto__']) assert.strictEqual(M.normalizeScale(bad), 'M', String(bad));
  assert.strictEqual(M.scaleFactor('nope'), 1.25);
});

test('fmt: sin dato (null, NaN, texto) -> "—", nunca 0 falso', () => {
  assert.strictEqual(M.fmt(null), '—');
  assert.strictEqual(M.fmt(undefined), '—');
  assert.strictEqual(M.fmt(NaN), '—');
  assert.strictEqual(M.fmt('x'), '—');
  assert.strictEqual(M.fmt(0), '0');
  assert.strictEqual(M.fmt(4.26, 1), '4.3');
});

const FULL = {
  cpu: { usage: 37.4, avg: 61.6, package: 70, freq_ghz: 4.234 },
  rapl_available: true, cpu_watts: 28.4,
  gpu: { active: { util: 55, temp: 71, power: 95.2, clock_mhz: 1830, vram_used: 3584 } },
  sys: { ram_used_gb: 11.46 },
  fps: 143.7,
  fans: [{ label: 'cpu_fan', rpm: 3200 }, { label: 'gpu_fan', rpm: 0 }],
};
const cellsOf = (rows, id) => (rows.find((r) => r.id === id) || { cells: [] }).cells.map((c) => [c.text, c.unit]);

test('rows: cada métrica elegida es una celda con su unidad; valores del contrato F2-01', () => {
  const rows = plain(M.rows(FULL, M.METRICS));
  assert.deepStrictEqual(rows.map((r) => r.id), ['cpu', 'gpu', 'ram', 'vram', 'fps', 'fan']);
  assert.deepStrictEqual(cellsOf(rows, 'cpu'), [['37', '%'], ['62', '°C'], ['28', 'W'], ['4.2', 'GHz']]);
  assert.deepStrictEqual(cellsOf(rows, 'gpu'), [['55', '%'], ['71', '°C'], ['95', 'W'], ['1830', 'MHz']]);
  assert.deepStrictEqual(cellsOf(rows, 'ram'), [['11.5', 'GB']]);
  assert.deepStrictEqual(cellsOf(rows, 'vram'), [['3.5', 'GB']]);
  assert.deepStrictEqual(cellsOf(rows, 'fps'), [['144', '']]);
  assert.deepStrictEqual(cellsOf(rows, 'fan'), [['3200', 'RPM'], ['0', 'RPM']]);
  assert.deepStrictEqual(rows.find((r) => r.id === 'fan').cells.map((c) => c.key), ['CPU', 'GPU']);
  assert.deepStrictEqual(rows[0].cells.map((c) => c.metric), ['cpu_usage', 'cpu_temp', 'cpu_power', 'cpu_freq']);
});

test('rows: una fila sin métricas elegidas no se pinta; solo la métrica elegida aparece', () => {
  const rows = plain(M.rows(FULL, ['cpu_freq', 'gpu_freq']));
  assert.deepStrictEqual(rows.map((r) => r.id), ['cpu', 'gpu']);
  assert.deepStrictEqual(cellsOf(rows, 'cpu'), [['4.2', 'GHz']]);
  assert.deepStrictEqual(plain(M.rows(FULL, [])), []);
});

test('rows: sin dato -> "—" (no 0); RAM 0 del schema 1 es sin dato; sin RAPL no hay vatios de CPU', () => {
  const rows = plain(M.rows({ cpu: {}, gpu: {}, sys: { ram_used_gb: 0 }, fans: [], rapl_available: false, cpu_watts: 12 }, M.METRICS));
  for (const r of rows) for (const c of r.cells) assert.strictEqual(c.text, '—', `${r.id}/${c.metric}`);
  assert.deepStrictEqual(cellsOf(rows, 'fan'), [['—', 'RPM']]);
  assert.deepStrictEqual(plain(M.rows(null, ['cpu_temp']))[0].cells[0].text, '—');
  // temperatura: package si falta avg
  assert.strictEqual(M.rows({ cpu: { package: 80 } }, ['cpu_temp'])[0].cells[0].text, '80');
});

test('nivel de temperatura: umbrales del dashboard; solo la temperatura lleva nivel', () => {
  const lim = { cpu: [70, 85, 92], gpu: [60, 75, 83] };
  const lv = (c, g) => M.rows({ cpu: { avg: c }, gpu: { active: { temp: g } } }, ['cpu_temp', 'gpu_temp'], lim).map((r) => r.cells[0].level);
  assert.deepStrictEqual(lv(50, 50), ['ok', 'ok']);
  assert.deepStrictEqual(lv(75, 70), ['warn', 'warn']);
  assert.deepStrictEqual(lv(90, 80), ['hot', 'hot']);
  assert.deepStrictEqual(lv(95, 90), ['crit', 'crit']);
  assert.deepStrictEqual(lv(null, null), [null, null]);
  assert.strictEqual(M.rows(FULL, ['cpu_usage'], lim)[0].cells[0].level, null);
  assert.strictEqual(M.rows({ cpu: { avg: 75 } }, ['cpu_temp'])[0].cells[0].level, 'warn'); // defaults
});

test('contraste WCAG: valores, unidades, etiquetas y niveles >= 4.5:1 sobre el fondo 85 % negro, incluso con un juego blanco detrás', () => {
  assert.strictEqual(M.PALETTE.bg, '#000000');
  assert.strictEqual(M.PALETTE.bgAlpha, 0.85);
  assert.strictEqual(M.PALETTE.value, '#ffffff');
  assert.ok(Math.abs(M.contrast('#ffffff', '#000000') - 21) < 1e-9);
  assert.ok(Math.abs(M.contrast('#777777', '#ffffff') - 4.48) < 0.01);
  const worst = M.composite(M.PALETTE.bg, M.PALETTE.bgAlpha, '#ffffff'); // fondo sobre escena blanca
  assert.strictEqual(worst, '#262626');
  const fgs = { value: M.PALETTE.value, unit: M.PALETTE.unit, ...M.PALETTE.levels };
  for (const r of M.ROWS) fgs[`label ${r.id}`] = r.color;
  fgs['label profile'] = M.PALETTE.profile;
  const colors = new Set(M.ROWS.map((r) => r.color.toLowerCase()));
  assert.strictEqual(colors.size, M.ROWS.length, 'cada fila tiene su color');
  for (const [name, fg] of Object.entries(fgs)) {
    const ratio = M.contrast(fg, worst);
    assert.ok(ratio >= 4.5, `${name} ${fg}: ${ratio.toFixed(2)}:1`);
  }
});

test('MangoHud: cada métrica tiene su clave equivalente (FAN no existe en MangoHud)', () => {
  assert.deepStrictEqual(plain(M.MANGO_KEYS), {
    cpu_usage: 'cpu_stats', cpu_temp: 'cpu_temp', cpu_power: 'cpu_power', cpu_freq: 'cpu_mhz',
    gpu_usage: 'gpu_stats', gpu_temp: 'gpu_temp', gpu_power: 'gpu_power', gpu_freq: 'gpu_core_clock',
    ram: 'ram', vram: 'vram', fps: 'fps', fan: null,
  });
});

test('toggleMetric (editor): activa/desactiva una métrica suelta sin tocar las demás; orden del catálogo', () => {
  assert.deepStrictEqual(M.toggleMetric(['cpu_temp', 'fan'], 'cpu_usage', true), ['cpu_usage', 'cpu_temp', 'fan']);
  assert.deepStrictEqual(M.toggleMetric(['cpu_temp', 'fan'], 'cpu_temp', false), ['fan']);
  assert.deepStrictEqual(M.toggleMetric(['fan'], 'fan', true), ['fan']);
  assert.deepStrictEqual(M.toggleMetric(['fan'], 'evil', true), ['fan']);
});

test('scaleOptions (editor): S/M/L/XL con su porcentaje', () => {
  assert.deepStrictEqual(plain(M.scaleOptions()), [{ id: 'S', pct: 100 }, { id: 'M', pct: 125 }, { id: 'L', pct: 150 }, { id: 'XL', pct: 200 }]);
});

test('i18n: los textos nuevos existen en los 8 idiomas', () => {
  assert.ok(Object.keys(M.STRINGS).length >= 10);
  for (const [k, v] of Object.entries(M.STRINGS)) {
    for (const L of LANGS) assert.ok(v[L] && String(v[L]).trim(), `${k} [${L}]`);
  }
  for (const r of M.ROWS) for (const m of r.metrics) assert.ok(M.STRINGS[M.metricKey(m)], m);
});
