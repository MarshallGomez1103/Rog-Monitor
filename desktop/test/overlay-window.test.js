'use strict';
// S11 / ADR-0007: geometría y arranque del overlay (desktop/overlay-window.js).
// Lógica pura: displays, anclajes, tamaño y decisión XWayland; main.js solo cablea Electron.
const test = require('node:test');
const assert = require('node:assert');
const W = require('../overlay-window.js');

// Medido en S10: eDP-1 0,0 1600x1000 (escala 1.2) y HDMI-A-3 1600,0 1920x1080 (primario).
const EDP = { id: 11, bounds: { x: 0, y: 0, width: 1600, height: 1000 }, workArea: { x: 0, y: 0, width: 1600, height: 1000 }, size: { width: 1600, height: 1000 }, label: 'eDP-1' };
const HDMI = { id: 22, bounds: { x: 1600, y: 0, width: 1920, height: 1080 }, workArea: { x: 1600, y: 0, width: 1920, height: 952 }, size: { width: 1920, height: 1080 }, label: '' };
const ABOVE = { id: 33, bounds: { x: 0, y: -1080, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 } };

test('ANCHORS: los 7 anclajes de la UI, en orden estable', () => {
  assert.deepStrictEqual(W.ANCHORS, ['top-left', 'top-center', 'top-right', 'center', 'bottom-left', 'bottom-center', 'bottom-right']);
});

test('sortDisplays: orden estable por x y luego y, sin mutar la entrada', () => {
  const input = [HDMI, EDP, ABOVE];
  assert.deepStrictEqual(W.sortDisplays(input).map((d) => d.id), [33, 11, 22]);
  assert.deepStrictEqual(input.map((d) => d.id), [22, 11, 33]);
  assert.deepStrictEqual(W.sortDisplays(null), []);
});

test('pickDisplay: por índice estable; legado por id; si no existe, el primario (fallback marcado)', () => {
  const ds = [HDMI, EDP];
  assert.strictEqual(W.pickDisplay(ds, { monitor: 0 }, 22).display.id, 11); // monitor 1 = el de la izquierda
  assert.deepStrictEqual(W.pickDisplay(ds, { monitor: 1 }, 22), { display: HDMI, index: 1, fallback: false });
  assert.deepStrictEqual(W.pickDisplay(ds, { displayId: 11 }, 22), { display: EDP, index: 0, fallback: false });
  // monitor desconectado (había 3, ahora 2) -> primario, marcado como fallback
  assert.deepStrictEqual(W.pickDisplay(ds, { monitor: 2 }, 22), { display: HDMI, index: 1, fallback: true });
  assert.deepStrictEqual(W.pickDisplay(ds, { displayId: 999 }, 22), { display: HDMI, index: 1, fallback: true });
  // sin preferencia -> primario, no es fallback
  assert.deepStrictEqual(W.pickDisplay(ds, {}, 22), { display: HDMI, index: 1, fallback: false });
  // primario desconocido -> el primero
  assert.strictEqual(W.pickDisplay(ds, { monitor: 9 }, 777).display.id, 11);
  assert.strictEqual(W.pickDisplay([], { monitor: 0 }, 1), null);
});

test('overlayPosition: los 7 anclajes usan bounds + margen (no workArea)', () => {
  const b = HDMI.bounds; const size = { width: 300, height: 40 };
  const at = (a) => W.overlayPosition(b, size, a);
  assert.deepStrictEqual(at('top-left'), { x: 1618, y: 18 });
  assert.deepStrictEqual(at('top-center'), { x: 1600 + 810, y: 18 });
  assert.deepStrictEqual(at('top-right'), { x: 1600 + 1920 - 300 - 18, y: 18 });
  assert.deepStrictEqual(at('center'), { x: 2410, y: 520 });
  assert.deepStrictEqual(at('bottom-left'), { x: 1618, y: 1080 - 40 - 18 });
  assert.deepStrictEqual(at('bottom-center'), { x: 2410, y: 1022 });
  assert.deepStrictEqual(at('bottom-right'), { x: 3202, y: 1022 });
  // anclaje desconocido -> top-right (lo que pide el propietario)
  assert.deepStrictEqual(at('nope'), at('top-right'));
});

test('overlayPosition: offset desplaza y nunca saca la ventana del monitor', () => {
  const b = EDP.bounds; const size = { width: 200, height: 50 };
  assert.deepStrictEqual(W.overlayPosition(b, size, 'top-right', { x: -40, y: 10 }), { x: 1600 - 200 - 18 - 40, y: 28 });
  assert.deepStrictEqual(W.overlayPosition(b, size, 'top-right', { x: 5000, y: 5000 }), { x: 1400, y: 950 });
  assert.deepStrictEqual(W.overlayPosition(b, size, 'top-left', { x: -5000, y: -5000 }), { x: 0, y: 0 });
  assert.deepStrictEqual(W.overlayPosition(b, size, 'top-left', { x: 'x', y: null }), { x: 18, y: 18 });
  // ventana más ancha que el monitor -> pegada al borde izquierdo (el alto sí cabe)
  assert.deepStrictEqual(W.overlayPosition({ x: 10, y: 20, width: 100, height: 100 }, size, 'center'), { x: 10, y: 45 });
  // monitor con origen negativo
  assert.deepStrictEqual(W.overlayPosition(ABOVE.bounds, size, 'top-left'), { x: 18, y: -1062 });
});

test('fitSize: tamaño pedido por el overlay redondeado y acotado', () => {
  assert.deepStrictEqual(W.fitSize({ width: 312.4, height: 41.6 }), { width: 313, height: 42 });
  assert.deepStrictEqual(W.fitSize({ width: 5, height: 5 }), { width: 80, height: 24 });
  assert.deepStrictEqual(W.fitSize({ width: 9000, height: 9000 }), { width: 1200, height: 600 });
  assert.deepStrictEqual(W.fitSize(null), W.DEFAULT_SIZE.row);
  assert.deepStrictEqual(W.fitSize({ width: NaN, height: 30 }, 'box'), W.DEFAULT_SIZE.box);
});

test('displaySummary: índice estable, tamaño, primario y nombre del conector si existe', () => {
  assert.deepStrictEqual(W.displaySummary([HDMI, EDP], 22), [
    { index: 0, id: 11, width: 1600, height: 1000, primary: false, name: 'eDP-1' },
    { index: 1, id: 22, width: 1920, height: 1080, primary: true, name: '' },
  ]);
});

test('windowOptions: transparente, sin foco, sin barra de tareas, siempre encima; preload dado', () => {
  const o = W.windowOptions({ width: 300, height: 40 }, '/x/preload.js');
  assert.strictEqual(o.width, 300);
  assert.strictEqual(o.height, 40);
  for (const k of ['transparent', 'skipTaskbar', 'alwaysOnTop']) assert.strictEqual(o[k], true, k);
  for (const k of ['frame', 'focusable', 'resizable', 'movable', 'hasShadow']) assert.strictEqual(o[k], false, k);
  assert.strictEqual(o.title, 'ROG Overlay');
  assert.strictEqual(o.webPreferences.preload, '/x/preload.js');
  assert.strictEqual(o.webPreferences.contextIsolation, true);
  assert.strictEqual(o.webPreferences.nodeIntegration, false);
});

test('sessionInfo: Wayland/X11, XWayland disponible y si este proceso ya corre en X11', () => {
  assert.deepStrictEqual(W.sessionInfo({ XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-0', DISPLAY: ':0' }, ['.']),
    { session: 'wayland', xwayland: true, x11Active: false });
  assert.deepStrictEqual(W.sessionInfo({ WAYLAND_DISPLAY: 'wayland-0', DISPLAY: '' }, ['.']),
    { session: 'wayland', xwayland: false, x11Active: false });
  assert.deepStrictEqual(W.sessionInfo({ XDG_SESSION_TYPE: 'wayland', DISPLAY: ':0' }, ['.', '--ozone-platform=x11']),
    { session: 'wayland', xwayland: true, x11Active: true });
  assert.deepStrictEqual(W.sessionInfo({ XDG_SESSION_TYPE: 'x11', DISPLAY: ':0' }, []),
    { session: 'x11', xwayland: false, x11Active: true });
  assert.deepStrictEqual(W.sessionInfo({}, undefined), { session: 'unknown', xwayland: false, x11Active: false });
});

test('needsX11Relaunch: solo Linux + Wayland + XWayland + preferencia activa + aún sin la bandera', () => {
  const env = { XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-0', DISPLAY: ':0' };
  assert.strictEqual(W.needsX11Relaunch({ overlay_xwayland: true }, env, ['.'], 'linux'), true);
  assert.strictEqual(W.needsX11Relaunch({ overlay_xwayland: true }, env, ['.', '--ozone-platform=x11'], 'linux'), false);
  assert.strictEqual(W.needsX11Relaunch({ overlay_xwayland: false }, env, ['.'], 'linux'), false);
  assert.strictEqual(W.needsX11Relaunch({ overlay_xwayland: 'yes' }, env, ['.'], 'linux'), false);
  assert.strictEqual(W.needsX11Relaunch({ overlay_xwayland: true }, { ...env, DISPLAY: '' }, ['.'], 'linux'), false);
  assert.strictEqual(W.needsX11Relaunch({ overlay_xwayland: true }, { DISPLAY: ':0', XDG_SESSION_TYPE: 'x11' }, ['.'], 'linux'), false);
  assert.strictEqual(W.needsX11Relaunch({ overlay_xwayland: true }, env, ['.'], 'darwin'), false);
  assert.strictEqual(W.needsX11Relaunch(null, env, ['.'], 'linux'), false);
});

test('normalizeCfg: valida lo que llega por IPC y conserva lo anterior si falta o es inválido', () => {
  const d = W.normalizeCfg(undefined);
  assert.deepStrictEqual(d, { enabled: false, monitor: null, displayId: null, corner: 'top-right', offsetX: 0, offsetY: 0,
    show: { cpu: true, gpu: true, fans: true }, layout: 'row', accent: null });
  const a = W.normalizeCfg({ enabled: 1, monitor: 1, corner: 'bottom-left', offsetX: 12.6, offsetY: -9000, show: { cpu: false, fps: true, evil: 'x' }, layout: 'box', accent: '#ff5a1f' }, d);
  assert.deepStrictEqual(a, { enabled: true, monitor: 1, displayId: null, corner: 'bottom-left', offsetX: 13, offsetY: -2000,
    show: { cpu: false, gpu: true, fans: true, fps: true }, layout: 'box', accent: '#ff5a1f' });
  const b = W.normalizeCfg({ enabled: false, monitor: -1, corner: 'x', layout: 'grid', accent: 'red;background:url(x)', offsetX: 'a' }, a);
  assert.deepStrictEqual(b, { ...a, enabled: false, offsetX: 13 });
  assert.strictEqual(W.normalizeCfg({ accent: 'rgb(10, 20, 30)' }).accent, 'rgb(10, 20, 30)');
  assert.strictEqual(W.normalizeCfg({ displayId: 22 }).displayId, 22);
  assert.strictEqual(W.normalizeCfg({ monitor: null }, a).monitor, null, 'null explícito = primario');
});

test('relaunchArgs: añade o quita la bandera sin tocar los demás argumentos', () => {
  assert.deepStrictEqual(W.relaunchArgs(['.', '--minimized'], true), ['.', '--minimized', '--ozone-platform=x11']);
  assert.deepStrictEqual(W.relaunchArgs(['.', '--ozone-platform=x11', '--minimized'], true), ['.', '--minimized', '--ozone-platform=x11']);
  assert.deepStrictEqual(W.relaunchArgs(['.', '--ozone-platform=x11', '--minimized'], false), ['.', '--minimized']);
  assert.deepStrictEqual(W.relaunchArgs(undefined, false), []);
});
