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
const NOW = 1_800_000_000_000;

function fakeEl() {
  return {
    style: {}, textContent: '', innerHTML: '', className: '', id: '', children: [],
    classList: { toggle() {}, add() {}, remove() {} },
    appendChild(c) { this.children.push(c); c.parent = this; return c; },
    remove() { if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this); this.parent = null; },
    querySelectorAll() { return []; },
  };
}

function load(opts) {
  opts = opts || {};
  const els = {};
  for (const id of ['prof', 'cpu-t', 'cpu-w', 'fps-row', 'fps-v', 'gpu-t', 'gpu-w', 'fans-row', 'fans-none',
    'cpu-row', 'gpu-row', 'fans-section', 'cpu-label', 'gpu-label', 'fps-label', 'fans-label']) els[id] = fakeEl();
  els['fps-row'].style.display = 'none';
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
    documentElement: { style: { setProperty() {} } },
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
  vm.runInNewContext(SRC, sandbox);
  const mark = () => card.children.find((c) => c.id === 'stale-mark') || null;
  return { doc, els, card, clock, h, intervals, mark, tick: () => intervals.forEach(([fn]) => fn()) };
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

/* FPS ---------------------------------------------------------------------- */
test('FPS: con dato se muestra; sin dato y sin pedirlo la fila se oculta (decisión documentada)', () => {
  const o = load();
  o.h.stats(snap({ fps: 144 }));
  assert.strictEqual(o.els['fps-row'].style.display, '');
  assert.strictEqual(o.els['fps-v'].textContent, '144');
  o.h.stats(snap({ fps: null }));
  assert.strictEqual(o.els['fps-row'].style.display, 'none');
});

test('FPS: 0 es un valor real (no se oculta)', () => {
  const o = load();
  o.h.stats(snap({ fps: 0 }));
  assert.strictEqual(o.els['fps-row'].style.display, '');
  assert.strictEqual(o.els['fps-v'].textContent, '0');
});

test('FPS: si el usuario lo eligió (show.fps === true) y no hay dato => fila visible con N/D', () => {
  const o = load();
  o.h.config({ show: { cpu: true, gpu: true, fans: true, fps: true } });
  o.h.stats(snap({ fps: null }));
  assert.strictEqual(o.els['fps-row'].style.display, '');
  assert.strictEqual(o.els['fps-v'].textContent, 'N/D');
  const en = load({ lang: 'en' });
  en.h.config({ show: { fps: true } });
  en.h.stats(snap({ fps: null }));
  assert.strictEqual(en.els['fps-v'].textContent, 'N/A');
});

test('FPS: show.fps === false oculta la fila aunque haya dato', () => {
  const o = load();
  o.h.config({ show: { fps: false } });
  o.h.stats(snap({ fps: 60 }));
  assert.strictEqual(o.els['fps-row'].style.display, 'none');
});
