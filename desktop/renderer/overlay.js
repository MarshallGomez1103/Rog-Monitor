/* ROG Monitor — overlay.js (S11b: estilo MangoHud)
   Overlay siempre encima, click-through. Recibe stats del preload bridge y pinta, en vertical, una
   fila por componente con las métricas elegidas (modelo en overlay-metrics.js, cargado antes).
   Fondo casi negro, números blancos en negrita, etiqueta de color por fila; sin dato -> "—".
*/

'use strict';

const OM = window.RogOverlayMetrics;
const $ = (id) => document.getElementById(id);

/* ---- i18n mínimo: las etiquetas (CPU, GPU, RAM, VRAM, FPS, FAN) son iguales en todos los idiomas ---- */
const OVERLAY_STRINGS = {
  es: 'SIN DATOS', en: 'NO DATA', fr: 'PAS DE DONNÉES', it: 'NESSUN DATO',
  pt: 'SEM DADOS', zh: '无数据', ja: 'データなし', ko: '데이터 없음',
};

function getLang() {
  try { return localStorage.getItem('lang') || 'es'; } catch (_) { return 'es'; }
}

function noDataText() {
  return OVERLAY_STRINGS[getLang()] || OVERLAY_STRINGS.es;
}

/* ---- estado ---- */
let metrics = OM.DEFAULT_METRICS.slice();
let lastStats = null;
// Umbrales [lo, mid, hi] que manda main.js vía overlay-config (mismos que el dashboard).
let tempLimits = null;

/* ---- datos viejos (N-A4-02) ----
   Mismo umbral que widget-states.js / app.js (F2-08). overlay.html no carga ese módulo,
   así que la regla se repite aquí: >6 s sin muestras => tarjeta atenuada + marca
   "SIN DATOS · N s". Se prefiere stats.ts (hora de la muestra); ventana oculta = backend
   pausado a propósito, no cuenta; volver a ser visible reinicia el reloj. */
const STALE_MS = 6000;
let lastRxAt = 0;       // 0 = aún no llegó ninguna muestra (no es stale)
let resumedAt = 0;
let backendDown = false;
let staleShown = false;

function sampleAgeMs() {
  if (!lastStats) return null;
  const ts = Number(lastStats.ts);
  let ref = Number.isFinite(ts) && ts > 0 ? ts * 1000 : lastRxAt;
  if (resumedAt > ref) ref = resumedAt;
  return Math.max(0, Date.now() - ref);
}

function findStaleMark(card) {
  return card && card.children ? Array.prototype.find.call(card.children, (c) => c.id === 'stale-mark') : null;
}

function setStale(on, ageMs) {
  const card = document.querySelector('.card');
  if (!card) { staleShown = on; return; }
  card.style.opacity = on ? '0.4' : '';
  let mark = findStaleMark(card);
  if (on) {
    if (!mark) {
      mark = document.createElement('div');
      mark.id = 'stale-mark';
      card.appendChild(mark);
    }
    mark.textContent = noDataText() + (ageMs != null ? ' · ' + Math.round(ageMs / 1000) + ' s' : '');
  } else if (mark) {
    mark.remove();
  }
  staleShown = on;
}

function checkStale() {
  if (!lastStats || document.hidden) return;
  const age = sampleAgeMs();
  if (backendDown || (age != null && age > STALE_MS)) setStale(true, age);
}

/* ---- renderizado ---- */
function span(cls, text) {
  const el = document.createElement('span');
  el.className = cls;
  el.textContent = text;
  return el;
}

// Una fila por componente: etiqueta de color + una celda (valor blanco + unidad) por métrica.
// ponytail: se reconstruye la lista entera en cada muestra (1 Hz, < 15 nodos); si algún día hay
// muchas más métricas, actualizar solo los textos.
function paintRows(stats) {
  const host = $('rows');
  if (!host) return;
  const limits = tempLimits || stats.limits || stats.temp_colors || OM.DEFAULT_LIMITS;
  host.replaceChildren(...OM.rows(stats, metrics, limits).map((r) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.dataset.row = r.id;
    const label = span('row-label', r.label);
    label.style.color = r.color;
    row.appendChild(label);
    for (const c of r.cells) {
      const cell = document.createElement('span');
      cell.className = 'cell';
      cell.dataset.metric = c.metric;
      if (c.key) cell.appendChild(span('k', c.key));
      const v = span('v', c.text);
      if (c.level && c.level !== 'ok') v.style.color = OM.PALETTE.levels[c.level];
      cell.appendChild(v);
      cell.appendChild(span('u', c.unit));
      row.appendChild(cell);
    }
    return row;
  }));
}

function render(stats) {
  lastStats = stats;
  lastRxAt = Date.now();
  backendDown = false;
  if (staleShown) setStale(false);
  const prof = $('prof');
  if (prof) prof.textContent = stats.asus_profile ? String(stats.asus_profile).toUpperCase() : '—';
  paintRows(stats);
}

/* ---- tamaño S/M/L/XL: toda la tarjeta escala con --scale (CSS) ---- */
function applyScale(scale) {
  document.documentElement.style.setProperty('--scale', String(OM.scaleFactor(scale)));
}

/* ---- tamaño (S11): la ventana se ajusta a la tarjeta ----
   main.js ancla la VENTANA; si fuera más grande que la tarjeta, "arriba-derecha" dejaría hueco
   transparente al borde. Se informa el tamaño real (redondeado hacia arriba) cada vez que cambia. */
let lastFit = '';
function reportFit() {
  const card = document.querySelector('.card');
  if (!card || !window.rog || !window.rog.overlayFit) return;
  const r = card.getBoundingClientRect();
  const size = { width: Math.ceil(r.width), height: Math.ceil(r.height) };
  const sig = size.width + 'x' + size.height;
  if (sig === lastFit) return;
  lastFit = sig;
  window.rog.overlayFit(size);
}

/* ---- inicialización ---- */
applyScale(OM.DEFAULT_SCALE);
if (typeof ResizeObserver !== 'undefined' && document.querySelector('.card')) {
  new ResizeObserver(reportFit).observe(document.querySelector('.card'));
}

/* v17-D: guard against preload not being available (dev/open file mode) */
if (window.rog && window.rog.onStats) {
  window.rog.onStats(render);
} else {
  console.warn('[overlay] window.rog.onStats not available — no live data');
}

if (window.rog && window.rog.onBackendDown) {
  window.rog.onBackendDown(() => { backendDown = true; checkStale(); });
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) resumedAt = Date.now(); });
setInterval(checkStale, 1000);

if (window.rog && window.rog.onOverlayConfig) {
  window.rog.onOverlayConfig((cfg) => {
    if (Array.isArray(cfg.metrics)) metrics = OM.normalizeMetrics(cfg.metrics);
    if (cfg.temp_colors) tempLimits = cfg.temp_colors;
    if ('scale' in cfg) applyScale(cfg.scale);
    if (lastStats) render(lastStats);
  });
}
