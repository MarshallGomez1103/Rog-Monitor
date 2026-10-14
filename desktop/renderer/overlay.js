/* ROG Monitor — overlay.js (v12, dueño A-I18N)
   Overlay siempre encima, click-through. Recibe stats del preload bridge.
   i18n: usa window.rog.onOverlayLang() si existe; sino detecta localStorage.
   Diseño: jerarquía clara, colores por nivel de alerta, fuente monoespaciada.
*/

'use strict';

/* ---- helpers ---- */
const $ = (id) => document.getElementById(id);

function fmt(v, d) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '--';
  return Number(v).toFixed(d !== undefined ? d : 0);
}

/* Devuelve el CSS color apropiado para una temperatura según umbrales */
function tempColor(value, stops) {
  if (value == null || Number.isNaN(value)) return 'var(--dim)';
  const [g, y, o] = stops;
  if (value < g) return 'var(--ok)';
  if (value < y) return 'var(--warn)';
  if (value < o) return 'var(--hot)';
  return 'var(--crit)';
}

/* ---- i18n mínimo para el overlay (sin cargar el i18n.js completo) ---- */
const OVERLAY_STRINGS = {
  es: { cpu: 'CPU', gpu: 'GPU', fps: 'FPS', fans: 'Fans', avg: 'AVG', na: '—', nodata: 'SIN DATOS', nd: 'N/D', profile: '' },
  en: { cpu: 'CPU', gpu: 'GPU', fps: 'FPS', fans: 'Fans', avg: 'AVG', na: '—', nodata: 'NO DATA', nd: 'N/A', profile: '' },
  fr: { cpu: 'CPU', gpu: 'GPU', fps: 'FPS', fans: 'Vents', avg: 'MOY', na: '—', nodata: 'PAS DE DONNÉES', nd: 'N/D', profile: '' },
  it: { cpu: 'CPU', gpu: 'GPU', fps: 'FPS', fans: 'Vent.', avg: 'MED', na: '—', nodata: 'NESSUN DATO', nd: 'N/D', profile: '' },
  pt: { cpu: 'CPU', gpu: 'GPU', fps: 'FPS', fans: 'Fans', avg: 'MÉD', na: '—', nodata: 'SEM DADOS', nd: 'N/D', profile: '' },
  zh: { cpu: 'CPU', gpu: 'GPU', fps: 'FPS', fans: '风扇', avg: '均', na: '—', nodata: '无数据', nd: 'N/A', profile: '' },
  ja: { cpu: 'CPU', gpu: 'GPU', fps: 'FPS', fans: 'ファン', avg: '平均', na: '—', nodata: 'データなし', nd: 'N/A', profile: '' },
  ko: { cpu: 'CPU', gpu: 'GPU', fps: 'FPS', fans: '팬', avg: '평균', na: '—', nodata: '데이터 없음', nd: 'N/A', profile: '' },
};

function getLang() {
  try { return localStorage.getItem('lang') || 'es'; } catch (_) { return 'es'; }
}

function s(key) {
  const lang = getLang();
  return (OVERLAY_STRINGS[lang] || OVERLAY_STRINGS.es)[key] || key;
}

function applyLabels() {
  const cpuLabel = $('cpu-label');
  const gpuLabel = $('gpu-label');
  const fpsLabel = $('fps-label');
  const fansLabel = $('fans-label');
  if (cpuLabel) cpuLabel.textContent = s('cpu');
  if (gpuLabel) gpuLabel.textContent = s('gpu');
  if (fpsLabel) fpsLabel.textContent = s('fps');
  if (fansLabel) fansLabel.textContent = s('fans');
}

/* ---- estado ---- */
// fps: NO está en el default a propósito. La fila FPS es opcional (solo MangoHud): se muestra
// cuando hay dato y se oculta si no lo hay (no prometer FPS sin MangoHud, F6-04). Solo
// show.fps === true la fuerza visible con "N/D"; show.fps === false la oculta siempre.
let show = { cpu: true, gpu: true, fans: true };
let lastStats = null;
let lastFansSig = null;
let currentLang = getLang();
// Umbrales [lo, mid, hi] que manda main.js vía overlay-config (mismos que el
// dashboard). Null hasta el primer config → se usan los defaults estáticos.
let tempLimits = null;

/* ---- aplicar visibilidad ---- */
function applyShow() {
  const cpuRow = $('cpu-row');
  const gpuRow = $('gpu-row');
  const fansSection = $('fans-section');
  if (cpuRow) cpuRow.style.display = show.cpu === false ? 'none' : '';
  if (gpuRow) gpuRow.style.display = show.gpu === false ? 'none' : '';
  if (fansSection) fansSection.style.display = show.fans === false ? 'none' : '';
}

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
      mark = document.createElement('span');
      mark.id = 'stale-mark';
      mark.style.color = 'var(--warn)';
      mark.style.fontSize = '9px';
      mark.style.fontWeight = '700';
      mark.style.letterSpacing = '1px';
      mark.style.whiteSpace = 'nowrap';
      card.appendChild(mark);
    }
    mark.textContent = s('nodata') + (ageMs != null ? ' · ' + Math.round(ageMs / 1000) + ' s' : '');
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

/* ---- renderizado principal ---- */
function render(stats) {
  lastStats = stats;
  lastRxAt = Date.now();
  backendDown = false;
  if (staleShown) setStale(false);
  // Prioridad: umbrales del config (main.js, idénticos al dashboard) > los que
  // pudiera traer el stream > defaults estáticos. Degrada con gracia.
  const colors = tempLimits || stats.limits || stats.temp_colors || { cpu: [70, 85, 92], gpu: [60, 75, 83] };

  /* perfil activo */
  const prof = $('prof');
  if (prof) prof.textContent = (stats.asus_profile || '').toUpperCase();

  /* CPU — promedio de núcleos (AVG), no package (que es siempre más alto) */
  const cpuT = stats.cpu?.avg ?? stats.cpu?.package;
  const cpuEl = $('cpu-t');
  if (cpuEl) {
    cpuEl.textContent = cpuT != null ? fmt(cpuT, 0) : '--';
    cpuEl.style.color = tempColor(cpuT, colors.cpu);
  }
  const cpuW = $('cpu-w');
  if (cpuW) {
    // Watts del paquete CPU (la temperatura ya es el promedio de núcleos; el
    // viejo sufijo "· AVG" confundía, se quitó — se explica en el menú).
    cpuW.textContent = stats.rapl_available && stats.cpu_watts != null
      ? fmt(stats.cpu_watts, 0) + ' W'
      : s('na') + ' W';
  }

  /* FPS (MangoHud) */
  const fpsRow = $('fps-row');
  const fpsV = $('fps-v');
  if (fpsRow && fpsV) {
    if (show.fps === false) {
      fpsRow.style.display = 'none';
    } else if (stats.fps != null) {
      fpsRow.style.display = '';
      fpsV.textContent = fmt(stats.fps, 0);
    } else if (show.fps === true) {
      // el usuario la eligió: sin MangoHud/dato se dice "N/D", no se esconde la fila
      fpsRow.style.display = '';
      fpsV.textContent = s('nd');
    } else {
      fpsRow.style.display = 'none';
    }
  }

  /* GPU */
  const g = stats.gpu?.active || {};
  const gpuEl = $('gpu-t');
  if (gpuEl) {
    gpuEl.textContent = g.temp != null ? fmt(g.temp, 0) : '--';
    gpuEl.style.color = tempColor(g.temp, colors.gpu);
  }
  const gpuW = $('gpu-w');
  if (gpuW) {
    if (g.power != null) {
      gpuW.textContent = fmt(g.power, 0) + ' W · ' + fmt(g.util, 0) + '%';
    } else {
      gpuW.textContent = s('na') + ' W';
    }
  }

  /* Ventiladores — chips compactos */
  const fansRow = $('fans-row');
  const fansNone = $('fans-none');
  if (fansRow && fansNone) {
    const fans = stats.fans || [];
    // Firma de lo pintado: si no cambió ningún rpm/label no se recrean los chips cada segundo
    const fansSig = fans.map((f) => `${f.label}:${f.rpm}:${f.cap && f.percent}`).join('|');
    if (fansSig === lastFansSig) { /* igual que el tick anterior */ }
    else if (fans.length > 0) {
      lastFansSig = fansSig;
      fansNone.style.display = 'none';
      /* Eliminar chips viejos (mantener el label) */
      fansRow.querySelectorAll('.fan-chip').forEach((el) => el.remove());
      fans.forEach((f) => {
        const chip = document.createElement('span');
        chip.className = 'fan-chip';
        const key = f.label.replace('_fan', '').toUpperCase().slice(0, 3);
        const rpmStr = f.rpm != null ? String(f.rpm) : '--';
        chip.innerHTML = `<span class="fan-key">${key}</span>&nbsp;${rpmStr}`;
        if (f.cap && f.percent != null) {
          chip.innerHTML += `&nbsp;<span class="fan-pct">${fmt(f.percent, 0)}%</span>`;
        }
        fansRow.appendChild(chip);
      });
    } else {
      lastFansSig = fansSig;
      fansNone.style.display = '';
      fansRow.querySelectorAll('.fan-chip').forEach((el) => el.remove());
    }
  }

  /* Re-detectar idioma y actualizar labels si cambió */
  const newLang = getLang();
  if (newLang !== currentLang) {
    currentLang = newLang;
    applyLabels();
  }
}

/* ---- layout (fila / cuadro) + acento del tema ---- */
function applyLayout(layout) {
  // Default = fila (una línea, estorba menos). 'box' = el cuadro clásico.
  document.body.classList.toggle('layout-row', layout !== 'box');
}
function applyAccent(accent) {
  if (accent) document.documentElement.style.setProperty('--accent', accent);
}

/* ---- inicialización ---- */
applyLabels();
applyShow();
applyLayout('row');   // por defecto, fila

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
    if (cfg.show) show = { ...show, ...cfg.show };
    else show = { ...show, ...cfg };   // compat: config viejo mandaba show plano
    // Umbrales de color por nivel (cpu/gpu) que vienen del dashboard.
    if (cfg.temp_colors) tempLimits = cfg.temp_colors;
    if (cfg.layout) applyLayout(cfg.layout);
    applyAccent(cfg.accent);
    applyShow();
    if (lastStats) render(lastStats);
  });
}
