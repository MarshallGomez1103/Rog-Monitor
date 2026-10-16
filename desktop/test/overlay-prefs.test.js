'use strict';
// S11: preferencias y avisos del overlay en el renderer (desktop/renderer/overlay-prefs.js, UMD).
// app.js solo cablea: aquí se prueba la lógica (prefs corruptas/antiguas, selector de monitor,
// aviso honesto por sesión, atajo de teclado) y que los textos nuevos existan en los 8 idiomas.
const test = require('node:test');
const assert = require('node:assert');
const P = require('../renderer/overlay-prefs.js');

const LANGS = ['en', 'es', 'fr', 'it', 'pt', 'zh', 'ja', 'ko'];
const t = (k, v) => (v ? `${k}${JSON.stringify(v)}` : k);

test('parse: JSON corrupto o vacío -> defaults seguros (anclaje arriba-derecha, fila, todo visible)', () => {
  for (const raw of [null, '', '{', '[]', '42', '"x"']) {
    assert.deepStrictEqual(P.parse(raw), { v: 2, enabled: false, monitor: null, displayId: null, corner: 'top-right',
      offsetX: 0, offsetY: 0, layout: 'row', show: { cpu: true, gpu: true, fans: true } }, String(raw));
  }
});

test('parse: preferencias antiguas (v1: displayId, sin offsets) se migran sin perder lo elegido', () => {
  const old = JSON.stringify({ enabled: true, displayId: 22, corner: 'top-center', layout: 'box', show: { fans: false }, accent: '#fff' });
  assert.deepStrictEqual(P.parse(old), { v: 2, enabled: true, monitor: null, displayId: 22, corner: 'top-center',
    offsetX: 0, offsetY: 0, layout: 'box', show: { cpu: true, gpu: true, fans: false } });
});

test('normalize: valores fuera de rango o de tipo incorrecto se corrigen', () => {
  const p = P.normalize({ enabled: 'yes', monitor: 2.5, corner: 'middle', offsetX: 99999, offsetY: '-12', layout: 'grid', show: { cpu: 0, gpu: false } });
  assert.strictEqual(p.enabled, false);
  assert.strictEqual(p.monitor, null);
  assert.strictEqual(p.corner, 'top-right');
  assert.strictEqual(p.offsetX, 2000);
  assert.strictEqual(p.offsetY, -12);
  assert.strictEqual(p.layout, 'row');
  assert.deepStrictEqual(p.show, { cpu: true, gpu: false, fans: true });
  assert.strictEqual(P.normalize({ monitor: 1 }).monitor, 1);
  assert.strictEqual(P.normalize({ show: { fps: true } }).show.fps, true);
});

test('monitorOptions: "Monitor N" por índice estable, tamaño, conector y principal', () => {
  const opts = P.monitorOptions([
    { index: 0, width: 1600, height: 1000, primary: false, name: 'eDP-1' },
    { index: 1, width: 1920, height: 1080, primary: true, name: '' },
  ], t);
  assert.deepStrictEqual(opts, [
    { value: '0', label: 'overlay.monitor_n{"n":1} · 1600×1000 · eDP-1' },
    { value: '1', label: 'overlay.monitor_n{"n":2} · 1920×1080 · overlay.primary' },
  ]);
  assert.deepStrictEqual(P.monitorOptions(null, t), []);
});

test('notice: aviso honesto según sesión y modo compatibilidad', () => {
  const W = { session: 'wayland', xwayland: true, x11Active: false, compat: false };
  assert.deepStrictEqual(P.notice(W), { key: 'overlay.notice_wayland', level: 'warn', action: 'enable' });
  assert.deepStrictEqual(P.notice({ ...W, compat: true }), { key: 'overlay.notice_restart', level: 'warn', action: 'restart' });
  assert.deepStrictEqual(P.notice({ ...W, xwayland: false }), { key: 'overlay.notice_no_xwayland', level: 'warn', action: null });
  assert.deepStrictEqual(P.notice({ ...W, x11Active: true, compat: true }), { key: 'overlay.notice_compat_on', level: 'ok', action: 'disable' });
  assert.deepStrictEqual(P.notice({ ...W, x11Active: true, compat: false }), { key: 'overlay.notice_restart_off', level: 'warn', action: 'restart' });
  assert.strictEqual(P.notice({ session: 'x11', xwayland: false, x11Active: true }), null);
  assert.strictEqual(P.notice(null), null);
});

test('isToggleShortcut: Ctrl+Shift+O (sin Alt/Meta), tecla o código', () => {
  assert.strictEqual(P.isToggleShortcut({ ctrlKey: true, shiftKey: true, key: 'O' }), true);
  assert.strictEqual(P.isToggleShortcut({ ctrlKey: true, shiftKey: true, key: 'x', code: 'KeyO' }), true);
  assert.strictEqual(P.isToggleShortcut({ ctrlKey: true, shiftKey: false, key: 'o' }), false);
  assert.strictEqual(P.isToggleShortcut({ ctrlKey: true, shiftKey: true, altKey: true, key: 'O' }), false);
  assert.strictEqual(P.isToggleShortcut({ ctrlKey: true, shiftKey: true, metaKey: true, key: 'O' }), false);
  assert.strictEqual(P.isToggleShortcut(null), false);
});

test('STRINGS: cada clave nueva tiene los 8 idiomas, sin vacíos', () => {
  const keys = Object.keys(P.STRINGS);
  assert.ok(keys.length >= 20);
  for (const k of keys) {
    for (const L of LANGS) assert.ok(String(P.STRINGS[k][L] || '').trim(), `${k} [${L}]`);
  }
  for (const k of ['overlay.notice_wayland', 'overlay.notice_restart', 'overlay.notice_restart_off', 'overlay.notice_no_xwayland',
    'overlay.notice_compat_on', 'overlay.monitor_n', 'overlay.primary']) assert.ok(P.STRINGS[k], k);
});
