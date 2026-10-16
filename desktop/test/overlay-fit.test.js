'use strict';
// S11: la ventana del overlay mide su tarjeta y pide a main ese tamaño (window.rog.overlayFit), así
// el anclaje (p. ej. arriba-derecha) cae en el borde real del contenido y nada se recorta.
// overlay.js es un script de página: se ejecuta en un contexto vm con un DOM mínimo falso.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'overlay.js'), 'utf8');

function el() {
  return { style: {}, textContent: '', innerHTML: '', children: [], classList: { toggle() {}, add() {}, remove() {} },
    appendChild(c) { this.children.push(c); return c; }, querySelectorAll() { return []; } };
}

function load({ withObserver = true, withFit = true } = {}) {
  const card = el();
  card.rect = { width: 300.2, height: 40.4 };
  card.getBoundingClientRect = () => card.rect;
  const fits = [];
  const observers = [];
  const bodyClasses = new Set();
  const sandbox = {
    document: {
      hidden: false,
      getElementById: () => el(),
      querySelector: (s) => (s === '.card' ? card : null),
      createElement: () => el(),
      addEventListener() {},
      documentElement: { style: { setProperty() {} } },
      body: { classList: { toggle: (c, on) => (on ? bodyClasses.add(c) : bodyClasses.delete(c)) } },
    },
    window: { rog: { onStats() {}, onOverlayConfig(fn) { sandbox.cfg = fn; } } },
    localStorage: { getItem: () => 'es' },
    console: { warn() {} },
    Date,
    setInterval() {},
  };
  // copia JSON: los objetos creados dentro del vm tienen otro Object.prototype
  if (withFit) sandbox.window.rog.overlayFit = (s) => fits.push(JSON.parse(JSON.stringify(s)));
  if (withObserver) {
    sandbox.ResizeObserver = function (cb) { observers.push(cb); this.observe = (t) => { this.target = t; }; };
  }
  vm.runInNewContext(SRC, sandbox);
  return { card, fits, fire: () => observers.forEach((cb) => cb([])), sandbox, bodyClasses };
}

test('overlay-fit: al cambiar la tarjeta pide su tamaño redondeado hacia arriba', () => {
  const o = load();
  o.fire();
  assert.deepStrictEqual(o.fits, [{ width: 301, height: 41 }]);
});

test('overlay-fit: el mismo tamaño no se vuelve a pedir; uno nuevo sí', () => {
  const o = load();
  o.fire(); o.fire();
  assert.strictEqual(o.fits.length, 1);
  o.card.rect = { width: 180, height: 120 };
  o.fire();
  assert.deepStrictEqual(o.fits[1], { width: 180, height: 120 });
});

test('overlay-fit: sin ResizeObserver o sin overlayFit (página abierta suelta) no rompe', () => {
  assert.doesNotThrow(() => load({ withObserver: false }));
  const o = load({ withFit: false });
  assert.doesNotThrow(() => o.fire());
});

test('overlay: layout fila por defecto; cuadro con config layout=box', () => {
  const o = load();
  assert.ok(o.bodyClasses.has('layout-row'));
  o.sandbox.cfg({ layout: 'box', show: { cpu: true } });
  assert.ok(!o.bodyClasses.has('layout-row'));
});
