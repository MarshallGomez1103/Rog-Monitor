'use strict';
// S11: preferencias y avisos del overlay en el renderer (desktop/renderer/overlay-prefs.js, UMD).
// app.js solo cablea: aquí se prueba la lógica (prefs corruptas/antiguas, selector de monitor,
// aviso honesto por sesión, atajo de teclado) y que los textos nuevos existan en los 8 idiomas.
const test = require('node:test');
const assert = require('node:assert');
const P = require('../renderer/overlay-prefs.js');

const LANGS = ['en', 'es', 'fr', 'it', 'pt', 'zh', 'ja', 'ko'];
const t = (k, v) => (v ? `${k}${JSON.stringify(v)}` : k);

const OM = require('../renderer/overlay-metrics.js');
const DEF = { v: 2, enabled: false, monitor: null, displayId: null, corner: 'top-right', offsetX: 0, offsetY: 0,
  metrics: OM.DEFAULT_METRICS, scale: 'M' };

test('parse: JSON corrupto o vacío -> defaults seguros (arriba-derecha, métricas por defecto, tamaño M)', () => {
  for (const raw of [null, '', '{', '[]', '42', '"x"']) assert.deepStrictEqual(P.parse(raw), DEF, String(raw));
});

test('parse: preferencias antiguas (v1/S11: displayId, layout, show por filas, sin escala) se migran sin perder lo elegido', () => {
  const old = JSON.stringify({ enabled: true, displayId: 22, corner: 'top-center', layout: 'box', show: { fans: false }, accent: '#fff' });
  assert.deepStrictEqual(P.parse(old), { ...DEF, enabled: true, displayId: 22, corner: 'top-center',
    metrics: ['cpu_usage', 'cpu_temp', 'cpu_power', 'gpu_usage', 'gpu_temp', 'gpu_power', 'fps'] });
  // S11 v2 sin escala -> M; layout viejo se ignora (siempre vertical)
  const v2 = P.parse(JSON.stringify({ v: 2, layout: 'row', show: { cpu: true, gpu: false, fans: true } }));
  assert.strictEqual(v2.scale, 'M');
  assert.strictEqual('layout' in v2, false);
  assert.strictEqual('show' in v2, false);
  assert.deepStrictEqual(v2.metrics, ['cpu_usage', 'cpu_temp', 'cpu_power', 'fps', 'fan']);
});

test('normalize: valores fuera de rango o de tipo incorrecto se corrigen', () => {
  const p = P.normalize({ enabled: 'yes', monitor: 2.5, corner: 'middle', offsetX: 99999, offsetY: '-12', scale: 'XXL', metrics: ['gpu_freq', 'evil', 'cpu_freq'] });
  assert.strictEqual(p.enabled, false);
  assert.strictEqual(p.monitor, null);
  assert.strictEqual(p.corner, 'top-right');
  assert.strictEqual(p.offsetX, 2000);
  assert.strictEqual(p.offsetY, -12);
  assert.strictEqual(p.scale, 'M');
  assert.deepStrictEqual(p.metrics, ['cpu_freq', 'gpu_freq']);
  assert.strictEqual(P.normalize({ monitor: 1 }).monitor, 1);
  assert.strictEqual(P.normalize({ scale: 'XL' }).scale, 'XL');
  assert.deepStrictEqual(P.normalize({ metrics: [] }).metrics, [], 'todo apagado es una elección válida');
  // las métricas guardadas mandan sobre un show viejo que quedara al lado
  assert.deepStrictEqual(P.normalize({ metrics: ['ram'], show: { cpu: true } }).metrics, ['ram']);
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

test('noticeView: lo que pinta el modal (texto, nivel, acción, si ofrece compatibilidad)', () => {
  const W = { session: 'wayland', xwayland: true, x11Active: false, compat: false };
  assert.deepStrictEqual(P.noticeView({ mode: W, fallback: false }, t), {
    text: 'overlay.notice_wayland', level: 'warn', action: 'enable', actionLabel: 'overlay.enable_compat', offerCompat: true });
  assert.deepStrictEqual(P.noticeView({ mode: { ...W, compat: true }, fallback: true }, t), {
    text: 'overlay.notice_fallback overlay.notice_restart', level: 'warn', action: 'restart', actionLabel: 'overlay.restart_now', offerCompat: true });
  assert.deepStrictEqual(P.noticeView({ mode: { ...W, x11Active: true, compat: true } }, t), {
    text: 'overlay.notice_compat_on', level: 'ok', action: '', actionLabel: 'overlay.enable_compat', offerCompat: true });
  assert.deepStrictEqual(P.noticeView({ mode: { ...W, xwayland: false } }, t).offerCompat, false);
  assert.deepStrictEqual(P.noticeView({ mode: { session: 'x11' } }, t), {
    text: '', level: '', action: '', actionLabel: 'overlay.enable_compat', offerCompat: false });
  assert.strictEqual(P.noticeView({}, t).text, '');
});

test('missingText: filas que MangoHud no muestra, traducidas; vacío si no falta nada', () => {
  assert.strictEqual(P.missingText(['fans'], t), 'overlay.game_missing{"rows":"overlay.row_fans"}');
  assert.strictEqual(P.missingText([], t), '');
  assert.strictEqual(P.missingText(undefined, t), '');
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
