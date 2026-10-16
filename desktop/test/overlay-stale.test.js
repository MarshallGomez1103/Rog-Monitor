'use strict';
// N-A4-02: el overlay no presenta números congelados como vivos (stale 6 s, mismo umbral que
// widget-states.js / app.js) y el FPS sin dato es "N/D" si el usuario lo pidió (show.fps === true).
// overlay.js es un script de página sin exports: se ejecuta en un contexto vm con un DOM mínimo falso.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'overlay.js'), 'utf8');
const METRICS_SRC = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'overlay-metrics.js'), 'utf8');
const NOW = 1_800_000_000_000;

function fakeEl() {
  return {
    style: {}, textContent: '', innerHTML: '', className: '', id: '', children: [], dataset: {},
    classList: { toggle() {}, add() {}, remove() {} },
    appendChild(c) { this.children.push(c); c.parent = this; return c; },
    replaceChildren(...cs) { this.children = []; cs.forEach((c) => this.appendChild(c)); },
    remove() { if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this); this.parent = null; },
    querySelectorAll() { return []; },
  };
}

function load(opts) {
  opts = opts || {};
  const els = {};
  for (const id of ['prof', 'rows']) els[id] = fakeEl();
  const card = fakeEl();
  const clock = { t: NOW };
  const h = {};
  const intervals = [];
  const doc = {
    hidden: false,
    getElementById: (id) => els[id] || null,
    querySelector: (sel) => (sel === '.card' ? card : null),
    createElement: () => fakeEl(),
    addEventListener: (ev, fn) => { h[ev] = fn; },
    documentElement: { style: { props: {}, setProperty(k, v) { this.props[k] = v; } } },
    body: { classList: { toggle() {} } },
  };
  const rog = {
    onStats: (fn) => { h.stats = fn; },
    onOverlayConfig: (fn) => { h.config = fn; },
  };
  if (opts.backendDown !== false) rog.onBackendDown = (fn) => { h.down = fn; };
  const sandbox = {
    document: doc,
    window: { rog },
    localStorage: { getItem: (k) => (k === 'lang' ? (opts.lang || 'es') : null) },
    console: { warn() {} },
    Date: { now: () => clock.t },
    setInterval: (fn, ms) => { intervals.push([fn, ms]); },
  };
  vm.createContext(sandbox);
  vm.runInContext(METRICS_SRC, sandbox);
  vm.runInContext(SRC, sandbox);
  const mark = () => card.children.find((c) => c.id === 'stale-mark') || null;
  // filas pintadas: [[fila, color, [[métrica, valor, unidad, color del valor], ...]], ...]
  const painted = () => els.rows.children.map((r) => [r.dataset.row, r.children[0].style.color,
    r.children.slice(1).map((c) => [c.dataset.metric, c.children.at(-2).textContent, c.children.at(-1).textContent, c.children.at(-2).style.color || ''])]);
  const cell = (m) => painted().flatMap((r) => r[2]).find((c) => c[0] === m) || null;
  return { doc, els, card, clock, h, intervals, mark, painted, cell, tick: () => intervals.forEach(([fn]) => fn()) };
}

const snap = (extra) => Object.assign({
  ts: NOW / 1000, asus_profile: 'balanced', cpu: { avg: 55 }, gpu: { active: { temp: 50, util: 3, power: 9 } },
  fans: [], fps: null, rapl_available: false,
}, extra);

test('overlay: un tick de 1 s para vigilar datos viejos', () => {
  const o = load();
  assert.ok(o.intervals.some(([, ms]) => ms === 1000));
});

test('overlay: 5,9 s no es stale; 6,1 s atenúa la tarjeta y muestra la marca SIN DATOS', () => {
  const o = load();
  o.h.stats(snap());
  assert.strictEqual(o.mark(), null);
  o.clock.t = NOW + 5900; o.tick();
  assert.strictEqual(o.mark(), null);
  assert.notStrictEqual(o.card.style.opacity, '0.4');
  o.clock.t = NOW + 6100; o.tick();
  assert.ok(o.mark(), 'falta la marca');
  assert.match(o.mark().textContent, /^SIN DATOS · 6 s$/);
  assert.strictEqual(o.card.style.opacity, '0.4');
});

test('overlay: la marca sigue el idioma y la edad crece', () => {
  const o = load({ lang: 'en' });
  o.h.stats(snap());
  o.clock.t = NOW + 12000; o.tick();
  assert.strictEqual(o.mark().textContent, 'NO DATA · 12 s');
});

test('overlay: la primera muestra nueva quita la marca y la opacidad', () => {
  const o = load();
  o.h.stats(snap());
  o.clock.t = NOW + 9000; o.tick();
  assert.ok(o.mark());
  o.h.stats(snap({ ts: (NOW + 9100) / 1000 }));
  assert.strictEqual(o.mark(), null);
  assert.strictEqual(o.card.style.opacity, '');
  o.tick(); // y no vuelve a aparecer
  assert.strictEqual(o.mark(), null);
});

test('overlay: sin muestra nunca es stale; con la ventana oculta tampoco', () => {
  const o = load();
  o.clock.t = NOW + 60000; o.tick();
  assert.strictEqual(o.mark(), null);
  o.h.stats(snap({ ts: (NOW + 60000) / 1000 }));
  o.doc.hidden = true; o.clock.t = NOW + 200000; o.tick();   // oculta: backend pausado a propósito
  assert.strictEqual(o.mark(), null);
  o.doc.hidden = false; o.h.visibilitychange(); o.tick();     // vuelve: el reloj se reinicia
  assert.strictEqual(o.mark(), null);
  o.clock.t += 6100; o.tick();                                 // y si de verdad no llegan muestras, sí
  assert.ok(o.mark());
  o.doc.hidden = true; o.h.visibilitychange();                 // ocultar no reinicia nada
});

test('overlay: sin snapshot.ts usa la hora de llegada', () => {
  const o = load();
  const s = snap(); delete s.ts;
  o.h.stats(s);
  o.clock.t = NOW + 6100; o.tick();
  assert.ok(o.mark());
});

test('overlay: backend caído marca SIN DATOS al instante y se recupera con la muestra siguiente', () => {
  const o = load();
  o.h.stats(snap());
  o.h.down();
  assert.ok(o.mark());
  assert.strictEqual(o.card.style.opacity, '0.4');
  o.h.stats(snap());
  assert.strictEqual(o.mark(), null);
});

test('overlay: sin onBackendDown en el preload no rompe', () => {
  const o = load({ backendDown: false });
  o.h.stats(snap());
  assert.strictEqual(o.h.down, undefined);
});

test('overlay: la marca no se duplica en ticks sucesivos', () => {
  const o = load();
  o.h.stats(snap());
  o.clock.t = NOW + 7000; o.tick(); o.clock.t = NOW + 8000; o.tick();
  assert.strictEqual(o.card.children.filter((c) => c.id === 'stale-mark').length, 1);
  assert.match(o.mark().textContent, /8 s$/);
});

/* S11b: métricas elegibles, vertical, "—" sin dato --------------------------- */
test('S11b: por defecto CPU (uso, temp, W) y GPU (uso, temp, W), FPS y FAN; una fila por componente', () => {
  const o = load();
  o.h.stats(snap({ cpu: { usage: 37.4, avg: 55 }, rapl_available: true, cpu_watts: 21.6, fans: [{ label: 'cpu_fan', rpm: 3100 }] }));
  assert.deepStrictEqual(o.painted().map((r) => r[0]), ['cpu', 'gpu', 'fps', 'fan']);
  assert.deepStrictEqual(o.painted()[0][2].map((c) => c.slice(0, 3)), [['cpu_usage', '37', '%'], ['cpu_temp', '55', '°C'], ['cpu_power', '22', 'W']]);
  assert.deepStrictEqual(o.cell('fan').slice(1, 3), ['3100', 'RPM']);
  assert.strictEqual(o.painted()[0][1], '#4fb3ff', 'etiqueta CPU con su color fijo');
  assert.strictEqual(o.els.prof.textContent, 'BALANCED');
});

test('S11b: sin dato se ve "—" (nunca 0 falso), también FPS sin MangoHud', () => {
  const o = load();
  o.h.stats(snap({ cpu: {}, gpu: { active: {} }, fps: null, asus_profile: null }));
  for (const m of ['cpu_usage', 'cpu_temp', 'cpu_power', 'gpu_usage', 'gpu_temp', 'gpu_power', 'fps', 'fan']) {
    assert.strictEqual(o.cell(m)[1], '—', m);
  }
  assert.strictEqual(o.els.prof.textContent, '—');
});

test('S11b: la config elige métricas sueltas; una fila sin métricas no se pinta', () => {
  const o = load();
  o.h.stats(snap({ cpu: { freq_ghz: 4.21, usage: 9 }, gpu: { active: { clock_mhz: 1830, temp: 50 } } }));
  o.h.config({ metrics: ['cpu_freq', 'gpu_freq'] });
  assert.deepStrictEqual(o.painted().map((r) => [r[0], r[2].map((c) => c.slice(0, 3))]),
    [['cpu', [['cpu_freq', '4.2', 'GHz']]], ['gpu', [['gpu_freq', '1830', 'MHz']]]]);
  o.h.config({ metrics: ['ram', 'vram'] });
  o.h.stats(snap({ sys: { ram_used_gb: 7.25 }, gpu: { active: { vram_used: 2048 } } }));
  assert.deepStrictEqual(o.painted().map((r) => r[0]), ['ram', 'vram']);
  assert.deepStrictEqual(o.cell('vram').slice(1, 3), ['2.0', 'GB']);
});

test('S11b: temperatura blanca en rango normal; color de nivel solo por encima del umbral del dashboard', () => {
  const o = load();
  o.h.config({ temp_colors: { cpu: [70, 85, 92], gpu: [60, 75, 83] } });
  o.h.stats(snap({ cpu: { avg: 50 }, gpu: { active: { temp: 90 } } }));
  assert.strictEqual(o.cell('cpu_temp')[3], '');
  assert.strictEqual(o.cell('gpu_temp')[3], '#ff6b6b');
});

test('S11b: escala S/M/L/XL -> variable CSS --scale; default M (1.25) sin reiniciar', () => {
  const o = load();
  assert.strictEqual(o.doc.documentElement.style.props['--scale'], '1.25');
  o.h.config({ scale: 'XL' });
  assert.strictEqual(o.doc.documentElement.style.props['--scale'], '2');
  o.h.config({ scale: 'S' });
  assert.strictEqual(o.doc.documentElement.style.props['--scale'], '1');
  o.h.config({ scale: 'bogus' });
  assert.strictEqual(o.doc.documentElement.style.props['--scale'], '1.25');
});

test('FPS: 0 es un valor real (no "—")', () => {
  const o = load();
  o.h.stats(snap({ fps: 0 }));
  assert.strictEqual(o.cell('fps')[1], '0');
  o.h.stats(snap({ fps: 143.6 }));
  assert.strictEqual(o.cell('fps')[1], '144');
});
