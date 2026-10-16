'use strict';
// Overlay (S11 / ADR-0007): geometría, opciones de ventana y decisión XWayland.
// Lógica pura y sin Electron: main.js le pasa screen.getAllDisplays(), process.env y process.argv.
//
// Por qué así (medido en S10, ver docs/adr/0007-overlay-strategy.md):
// - Wayland nativo ignora setPosition y no deja elegir monitor; XWayland sí (8/8).
// - workArea no es fiable en Wayland (igual a bounds aunque haya panel): se usa bounds + margen.
// - app.commandLine.appendSwitch('ozone-platform','x11') desde main.js NO cambia la plataforma
//   en Electron 44 (la ozone ya está elegida; además tumba el proceso GPU). Por eso el modo
//   compatibilidad relanza el proceso con la bandera en la línea de órdenes (needsX11Relaunch).

const ANCHORS = ['top-left', 'top-center', 'top-right', 'center', 'bottom-left', 'bottom-center', 'bottom-right'];
const DEFAULT_ANCHOR = 'top-right';
const MARGIN = 18;
const X11_FLAG = '--ozone-platform=x11';
const DEFAULT_SIZE = { row: { width: 420, height: 44 }, box: { width: 220, height: 150 } };
const MIN_SIZE = { width: 80, height: 24 };
const MAX_SIZE = { width: 1200, height: 600 };

// Orden estable de monitores: por x y luego y (el "Monitor 1" es el de más a la izquierda).
function sortDisplays(displays) {
  return (displays || []).slice().sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
}

// cfg.monitor = índice estable; cfg.displayId = preferencia antigua (id de Electron, cambia al
// reconectar). Si el elegido no existe (desconectado) se cae al primario y se marca fallback.
function pickDisplay(displays, cfg, primaryId) {
  const list = sortDisplays(displays);
  if (!list.length) return null;
  const c = cfg || {};
  let index = -1;
  const wanted = Number.isInteger(c.monitor) || c.displayId != null;
  if (Number.isInteger(c.monitor)) index = c.monitor < list.length ? c.monitor : -1;
  else if (c.displayId != null) index = list.findIndex((d) => d.id === c.displayId);
  const fallback = wanted && index < 0;
  if (index < 0) index = Math.max(0, list.findIndex((d) => d.id === primaryId));
  return { display: list[index], index, fallback };
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clamp(v, lo, hi) {
  return hi < lo ? lo : Math.min(hi, Math.max(lo, v));
}

// Posición (DIP) del overlay en `bounds` para un anclaje + offset; nunca fuera del monitor.
function overlayPosition(bounds, size, anchor, offset, margin = MARGIN) {
  const b = bounds;
  const { width: w, height: h } = size;
  const a = ANCHORS.includes(anchor) ? anchor : DEFAULT_ANCHOR;
  const [v, hz] = a === 'center' ? ['middle', 'center'] : a.split('-');
  const x = { left: b.x + margin, center: b.x + Math.round((b.width - w) / 2), right: b.x + b.width - w - margin }[hz];
  const y = { top: b.y + margin, middle: b.y + Math.round((b.height - h) / 2), bottom: b.y + b.height - h - margin }[v];
  const o = offset || {};
  return {
    x: clamp(Math.round(x + num(o.x)), b.x, b.x + b.width - w),
    y: clamp(Math.round(y + num(o.y)), b.y, b.y + b.height - h),
  };
}

// Tamaño que pide el overlay (medido de su tarjeta), acotado; sin dato válido, el del layout.
function fitSize(req, layout) {
  const w = req ? Number(req.width) : NaN;
  const h = req ? Number(req.height) : NaN;
  if (!Number.isFinite(w) || !Number.isFinite(h)) return { ...(DEFAULT_SIZE[layout] || DEFAULT_SIZE.row) };
  return {
    width: clamp(Math.ceil(w), MIN_SIZE.width, MAX_SIZE.width),
    height: clamp(Math.ceil(h), MIN_SIZE.height, MAX_SIZE.height),
  };
}

// Lista para el selector de la UI (el texto lo arma el renderer con i18n).
function displaySummary(displays, primaryId) {
  return sortDisplays(displays).map((d, index) => ({
    index,
    id: d.id,
    width: d.size ? d.size.width : d.bounds.width,
    height: d.size ? d.size.height : d.bounds.height,
    primary: d.id === primaryId,
    name: d.label || '',
  }));
}

function windowOptions(size, preload) {
  return {
    width: size.width,
    height: size.height,
    title: 'ROG Overlay',
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false },
  };
}

function sessionInfo(env, argv) {
  const e = env || {};
  const type = String(e.XDG_SESSION_TYPE || '').toLowerCase();
  const session = type === 'x11' ? 'x11' : (type === 'wayland' || e.WAYLAND_DISPLAY ? 'wayland' : 'unknown');
  return {
    session,
    xwayland: session === 'wayland' && !!e.DISPLAY,
    x11Active: session === 'x11' || (argv || []).includes(X11_FLAG),
  };
}

// Preferencia `overlay_xwayland` (config.json) activa en una sesión Wayland con XWayland y este
// proceso aún sin la bandera -> hay que relanzar con relaunchArgs(argv, true).
function needsX11Relaunch(config, env, argv, platform) {
  if (platform !== 'linux' || !config || config.overlay_xwayland !== true) return false;
  const s = sessionInfo(env, argv);
  return s.session === 'wayland' && s.xwayland && !s.x11Active;
}

function relaunchArgs(argv, x11) {
  const rest = (argv || []).filter((a) => a !== X11_FLAG);
  return x11 ? rest.concat(X11_FLAG) : rest;
}

const DEFAULT_CFG = {
  enabled: false, monitor: null, displayId: null, corner: DEFAULT_ANCHOR, offsetX: 0, offsetY: 0,
  show: { cpu: true, gpu: true, fans: true }, layout: 'row', accent: null,
};
const SHOW_KEYS = ['cpu', 'gpu', 'fans', 'fps'];
const OFFSET_MAX = 2000;
// el acento acaba en style.setProperty del overlay: solo hex o rgb()/rgba() numéricos
const ACCENT_RE = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\))$/i;

// Preferencias del overlay que llegan por IPC: se valida campo a campo; lo inválido conserva `prev`.
function normalizeCfg(cfg, prev) {
  const p = prev || DEFAULT_CFG;
  const c = cfg || {};
  const offset = (v, old) => (Number.isFinite(Number(v)) && v !== null && v !== ''
    ? clamp(Math.round(Number(v)), -OFFSET_MAX, OFFSET_MAX) : old);
  const show = { ...p.show };
  for (const k of SHOW_KEYS) if (c.show && typeof c.show[k] === 'boolean') show[k] = c.show[k];
  let monitor = p.monitor;
  if (c.monitor === null) monitor = null;
  else if (Number.isInteger(c.monitor) && c.monitor >= 0) monitor = c.monitor;
  return {
    enabled: !!c.enabled,
    monitor,
    displayId: Number.isFinite(c.displayId) ? c.displayId : p.displayId,
    corner: ANCHORS.includes(c.corner) ? c.corner : p.corner,
    offsetX: offset(c.offsetX, p.offsetX),
    offsetY: offset(c.offsetY, p.offsetY),
    show,
    layout: c.layout === 'box' || c.layout === 'row' ? c.layout : p.layout,
    accent: typeof c.accent === 'string' && ACCENT_RE.test(c.accent.trim()) ? c.accent.trim() : p.accent,
  };
}

module.exports = {
  ANCHORS, DEFAULT_ANCHOR, MARGIN, X11_FLAG, DEFAULT_SIZE, DEFAULT_CFG,
  normalizeCfg, sortDisplays, pickDisplay, overlayPosition, fitSize, displaySummary, windowOptions,
  sessionInfo, needsX11Relaunch, relaunchArgs,
};
