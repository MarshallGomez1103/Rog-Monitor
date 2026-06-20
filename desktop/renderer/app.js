/* ROG Monitor desktop renderer. Receives one stats object per second. */

const $ = (id) => document.getElementById(id);

function recordLocalError(kind, payload = {}) {
  try {
    if (window.rog && typeof window.rog.recordError === 'function') {
      window.rog.recordError({
        kind,
        url: location.href,
        ...payload,
      });
    }
  } catch (_) { /* logging must never break UI */ }
}

window.addEventListener('error', (event) => {
  recordLocalError('window-error', {
    message: event.message,
    source: event.filename,
    line: event.lineno,
    column: event.colno,
    stack: event.error && event.error.stack,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  recordLocalError('unhandled-rejection', {
    message: reason && reason.message ? reason.message : String(reason),
    stack: reason && reason.stack,
  });
});

let lastStats = null;
let gpuBusy = false;
// Perfil de energía "pendiente": al hacer clic mantenemos resaltado el perfil
// elegido hasta que el stream del sistema confirme el cambio (o expire). Sin
// esto, el refresco 1 Hz pisaba el resaltado con el perfil viejo mientras el
// daemon aplicaba el cambio → el botón "rebotaba" al anterior y luego saltaba.
let pendingProfile = null;
let pendingProfileTs = 0;
let pendingProfileConfirmed = false;  // true cuando el sistema confirmó (busctl read-back)
const PENDING_PROFILE_MS = 8000;
// PowerProfilesDaemon usa power-saver/balanced/performance; algunos equipos
// reportan el perfil ASUS "quiet". Normalizamos para comparar contra los botones.
function normalizeProfile(p) {
  return p === 'quiet' ? 'power-saver' : p;
}
let auraState = null;
let auraBootstrapped = false;
let auraProfileSelection = '';
// Efecto elegido: fuente de verdad en JS. Antes dependía del <select> oculto
// y si el valor no existía como <option> caía en silencio a 'static'.
let auraSelectedEffect = '';
// Firma del último render: el bloque Aura solo se reconstruye cuando cambia
// algo real. Reconstruirlo cada segundo destruía los chips entre el mousedown
// y el mouseup y se comía los clics.
let lastAuraSig = '';
let musicModeActive = false;
let auraDirty = false;
let auraFocused = false;
let benchmarkResult = null;
let benchBusy = false;

// v10: historial completo por corrida (V2). Migra el viejo formato simple.
function _loadBenchmarkHistory() {
  const v2 = localStorage.getItem('benchmarkHistoryV2');
  if (v2) { try { return JSON.parse(v2); } catch (e) { /* fallback */ } }
  // migrar el viejo texto plano → structs mínimos sin samples
  const old = localStorage.getItem('benchmarkHistory');
  if (old) {
    try {
      const arr = JSON.parse(old);
      return arr.map((item) => ({
        id: `legacy-${item.when || Date.now()}`,
        kind: item.kind || 'cpu',
        label: item.label || 'CPU',
        started_at: null,
        when: item.when || '',
        seconds: null,
        tool: null,
        summary: null,
        _legacyText: item.summary || '',
      }));
    } catch (e) { /* ignore */ }
  }
  return [];
}

let benchmarkHistory = _loadBenchmarkHistory();
const AURA_PRIMARY_EFFECTS = ['static', 'breathe', 'rainbow-cycle', 'rainbow-wave', 'stars'];

/* ---------- themes ---------- */

const THEMES = [
  // id, name, description, [dark bg, dark accent], [light bg, light accent]
  ['magma',      'Magma',       'Rojo volcánico — firma ROG',       ['#140d0b', '#f25c3d'], ['#f5e0d6', '#c2401f']],
  ['nebula',     'Nébula',      'Violeta espacial con magenta',     ['#120c1c', '#b07af5'], ['#e8ddf7', '#6f2fd0']],
  ['oceano',     'Océano',      'Teal profundo, calmado',           ['#0a1416', '#2fbfb0'], ['#cde8e4', '#0c7f72']],
  ['glaciar',    'Glaciar',     'Azul hielo sobre azul noche',      ['#0d1420', '#6fb7ff'], ['#d4e6f5', '#1f66b8']],
  ['reactor',    'Reactor',     'Verde fosforescente de máquina',   ['#070d07', '#46e873'], ['#d6edce', '#18843a']],
  ['grafito',    'Grafito',     'Escala de grises, sin ruido',      ['#101113', '#c8cdd4'], ['#e2e5e9', '#2f353b']],
  ['neon',       'Neón',        'Cian y magenta de arcade',         ['#0c0a18', '#2de2e6'], ['#d4edf0', '#067a8c']],
  ['atardecer',  'Atardecer',   'Oro y rosa sobre púrpura',         ['#160f1e', '#ff9d4d'], ['#f9e4cc', '#c45f10']],
  ['neon-nights','Neon Nights', 'Synthwave Miami: magenta y cian',  ['#0d0619', '#f72585'], ['#f0d6f5', '#9b1dbd']],
  ['cyberpunk',  'Cyberpunk',   'Night City: amarillo y cian',      ['#080808', '#f7e02b'], ['#e8e4c8', '#8a7200']],
  ['aurora',     'Aurora',      'Teal boreal virando a violeta',    ['#060d10', '#00d4aa'], ['#cce8e4', '#077a6b']],
  ['alba',       'Alba',        'Marfil cálido con oro y rosa',     ['#13100d', '#d4a017'], ['#f8f2e6', '#9e6a00']],
];

const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

function appearance() {
  return {
    theme: localStorage.getItem('theme') || 'magma',
    mode: localStorage.getItem('mode') || 'dark',
  };
}

function applyAppearance() {
  const { theme, mode } = appearance();
  const real = mode === 'system' ? (prefersDark.matches ? 'dark' : 'light') : mode;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.mode = real;
  document.querySelectorAll('#mode-seg button').forEach((b) =>
    b.classList.toggle('active', b.dataset.mode === mode));
  document.querySelectorAll('.theme-card').forEach((c) => {
    c.classList.toggle('active', c.dataset.theme === theme);
    const def = THEMES.find(([id]) => id === c.dataset.theme);
    if (def) {
      const [bg, accent] = def[real === 'dark' ? 3 : 4];
      const swatch = c.querySelector('.swatch');
      swatch.style.background = bg;
      swatch.querySelectorAll('i').forEach((i, idx) => {
        i.style.background = idx === 0 ? accent : accent + '55';
      });
    }
  });
  if (lastStats) update(lastStats);
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* ---------- helpers ---------- */

function fmt(value, digits = 0, fallback = '--') {
  return (value === null || value === undefined || Number.isNaN(value))
    ? fallback
    : Number(value).toFixed(digits);
}

// Contrato con CSS (Agente A2): #cpu-temp/#gpu-temp SIEMPRE deben llevar
// exactamente una de estas 4 clases — el color lo decide el CSS por nivel,
// nunca lo forzamos por JS (ver update()).
//   t-cold      temp < lo
//   t-normal    lo <= temp < mid
//   t-hot       mid <= temp < hi
//   t-critical  temp >= hi
function tempClass(temp, limits) {
  if (temp == null) return '';
  const [lo, mid, hi] = limits || [70, 85, 92];
  if (temp < lo) return 't-cold';
  if (temp < mid) return 't-normal';
  if (temp < hi) return 't-hot';
  return 't-critical';
}

let toastTimer = null;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 5000);
}

/* ---------- charts ---------- */

// Estado por canvas para el hover: la serie dibujada y su mapeo x/y, para
// poder redibujar con crosshair y saber qué valor hay bajo el cursor.
const chartState = new Map();

function drawChart(canvas, values, color, opts = {}) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  // Contrato C2: usa --chart-grid si A-VISUAL lo define; cae a --hair como fallback.
  ctx.strokeStyle = cssVar('--chart-grid') || cssVar('--hair');
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (h / 4) * i);
    ctx.lineTo(w, (h / 4) * i);
    ctx.stroke();
  }

  if (!values || values.length < 2) { chartState.delete(canvas.id); return; }
  const data = values.slice(-Math.max(60, Math.floor(w / 4)));
  // snap the axis to steps of 5 so min/max don't jitter every second
  // fromZero: los watts arrancan en 0 — si no, una bajada de 10→3 W llena
  // toda la altura de la gráfica y parece un desplome dramático
  let lo = opts.fromZero ? 0 : Math.floor(Math.min(...data) / 5) * 5;
  let hi = Math.ceil(Math.max(...data) / 5) * 5;
  if (hi - lo < 10) { hi = lo + 10; }
  const pad = 8;
  const x = (i) => (i / (data.length - 1)) * w;
  const y = (v) => (h - 12) - pad - ((v - lo) / (hi - lo)) * ((h - 12) - pad * 2);
  chartState.set(canvas.id, { data, color, opts, w, h, lo, hi });

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, color + '55');
  grad.addColorStop(1, color + '00');
  ctx.beginPath();
  ctx.moveTo(0, h - 12);
  data.forEach((v, i) => ctx.lineTo(x(i), y(v)));
  ctx.lineTo(w, h - 12);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  data.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  ctx.fillStyle = cssVar('--dim');
  ctx.font = '11px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(hi.toFixed(0), 22, 11);
  ctx.fillText(lo.toFixed(0), 22, h - 14);
  // time axis: one sample per second
  const mins = Math.round(data.length / 60);
  ctx.textAlign = 'left';
  ctx.fillText(mins >= 1 ? `hace ${mins} min` : 'hace <1 min', 2, h - 2);
  ctx.textAlign = 'right';
  ctx.fillText('ahora', w - 2, h - 2);
  const last = data[data.length - 1];
  ctx.fillStyle = color;
  ctx.font = 'bold 13px monospace';
  ctx.fillText(last.toFixed(1), w - 6, 14);
  ctx.textAlign = 'left';

  if (chartHover.canvasId === canvas.id) drawChartCrosshair(canvas);
}

/* hover sobre las gráficas: crosshair + valor y hace cuántos segundos */

const chartHover = { canvasId: null, px: 0 };

function chartIndexAt(state, px) {
  return Math.max(0, Math.min(state.data.length - 1,
    Math.round((px / state.w) * (state.data.length - 1))));
}

function drawChartCrosshair(canvas) {
  const state = chartState.get(canvas.id);
  if (!state) return;
  const { data, color, w, h, lo, hi } = state;
  const i = chartIndexAt(state, chartHover.px);
  const pad = 8;
  const cx = (i / (data.length - 1)) * w;
  const cy = (h - 12) - pad - ((data[i] - lo) / (hi - lo)) * ((h - 12) - pad * 2);
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.strokeStyle = cssVar('--dim');
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, 2);
  ctx.lineTo(cx, h - 12);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = cssVar('--bg');
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function agoText(secondsAgo) {
  if (secondsAgo < 1) return 'ahora';
  if (secondsAgo < 60) return `hace ${secondsAgo} s`;
  return `hace ${Math.floor(secondsAgo / 60)} min ${secondsAgo % 60} s`;
}

function wireChartHover(canvasId, unit) {
  const canvas = $(canvasId);
  const tip = $('chart-tip');
  canvas.addEventListener('mousemove', (e) => {
    const state = chartState.get(canvasId);
    if (!state) return;
    const rect = canvas.getBoundingClientRect();
    chartHover.canvasId = canvasId;
    chartHover.px = e.clientX - rect.left;
    const i = chartIndexAt(state, chartHover.px);
    // una muestra por segundo: la distancia al final ES la antigüedad
    tip.textContent = `${state.data[i].toFixed(1)} ${unit} · ${agoText(state.data.length - 1 - i)}`;
    tip.classList.remove('hidden');
    const tw = tip.offsetWidth;
    const left = Math.min(Math.max(e.clientX - tw / 2, 6), window.innerWidth - tw - 6);
    tip.style.left = `${left}px`;
    tip.style.top = `${rect.top - 30}px`;
    drawChart(canvas, state.data, state.color, state.opts);
  });
  canvas.addEventListener('mouseleave', () => {
    chartHover.canvasId = null;
    tip.classList.add('hidden');
    const state = chartState.get(canvasId);
    if (state) drawChart(canvas, state.data, state.color, state.opts);
  });
}

/* ---------- fans ---------- */

const FAN_SVG = `
<svg viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="29" fill="none" stroke="var(--hair)" stroke-width="2"/>
  <g>
    <path d="M32 32 L32 7 A25 25 0 0 1 49 16 Z" fill="var(--dim)"/>
    <path d="M32 32 L53 22 A25 25 0 0 1 51 46 Z" fill="var(--dim)"/>
    <path d="M32 32 L44 53 A25 25 0 0 1 20 53 Z" fill="var(--dim)"/>
    <path d="M32 32 L13 47 A25 25 0 0 1 11 23 Z" fill="var(--dim)"/>
    <path d="M32 32 L15 13 A25 25 0 0 1 32 7 Z" fill="var(--hair)"/>
  </g>
  <circle cx="32" cy="32" r="6" fill="var(--accent)"/>
</svg>`;

function renderFans(fans) {
  const host = $('fans');
  if (host.childElementCount !== fans.length) {
    host.innerHTML = fans.map((f, i) => `
      <div class="fan" id="fan-${i}">
        ${FAN_SVG}
        <div class="rpm">--</div>
        <label></label>
        <div class="pct"></div>
      </div>`).join('');
  }
  fans.forEach((fan, i) => {
    const el = $(`fan-${i}`);
    el.querySelector('.rpm').textContent = fan.rpm;
    el.querySelector('label').textContent = fan.label.replace('_fan', '').toUpperCase();
    el.querySelector('.pct').textContent = fan.percent + '%';
    const g = el.querySelector('svg g');
    if (fan.rpm > 0) {
      g.style.animationDuration = Math.max(0.15, 60 / (fan.rpm / 25)).toFixed(2) + 's';
      g.style.animationPlayState = 'running';
    } else {
      g.style.animationPlayState = 'paused';
    }
  });
}

/* ---------- aura / rgb ---------- */

function normalizeHex(value, fallback = 'ff5500') {
  const clean = String(value || fallback).replace('#', '').trim().toLowerCase();
  return /^[0-9a-f]{6}$/.test(clean) ? clean : fallback;
}

function auraDraftStorageKey() {
  return 'auraDraft';
}

function saveAuraDraft(state) {
  try { localStorage.setItem(auraDraftStorageKey(), JSON.stringify(state)); } catch (_) {}
}

function loadAuraDraft() {
  try { return JSON.parse(localStorage.getItem(auraDraftStorageKey()) || 'null'); } catch (_) { return null; }
}

function fillSelect(el, items, selectedValue, placeholder = '') {
  const current = items.some((item) => item.value === selectedValue) ? selectedValue : (items[0]?.value || '');
  el.innerHTML = '';
  if (!items.length && placeholder) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = placeholder;
    el.appendChild(option);
    el.disabled = true;
    return;
  }
  el.disabled = false;
  items.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label;
    el.appendChild(option);
  });
  el.value = current;
}

function auraEffects() {
  return auraState?.asus?.effects || [];
}


// Cuadrícula de 9 tiles estilo Armoury Crate.
// Estados de un tile:
//   active    — seleccionado actualmente
//   supported — disponible, no seleccionado
//   disabled  — modo no soportado por este hardware (con tooltip de razón)
//   future    — próximamente (gris claro, sin interacción)
function renderModeGrid(selectedValue) {
  const host = $('aura-mode-grid');
  const tiles = auraState?.mode_grid;
  if (!tiles || !tiles.length) {
    host.innerHTML = '<span class="dim">sin modos detectados</span>';
    return;
  }
  host.innerHTML = tiles.map((tile) => {
    const isActive = tile.id === selectedValue && tile.supported;
    let stateClass;
    if (tile.kind === 'future') {
      stateClass = 'mode-future';
    } else if (!tile.supported) {
      stateClass = 'mode-disabled';
    } else if (isActive) {
      stateClass = 'mode-active';
    } else {
      stateClass = 'mode-idle';
    }
    const title = tile.reason ? escapeHtml(tile.reason) : escapeHtml(tile.label);
    const ariaDisabled = (!tile.supported) ? ' aria-disabled="true"' : '';
    return `<button class="mode-tile ${stateClass}" data-mode="${escapeHtml(tile.id)}" data-kind="${escapeHtml(tile.kind)}" title="${title}"${ariaDisabled}>
      <span class="mode-icon">${escapeHtml(tile.icon)}</span>
      <span class="mode-label">${escapeHtml(tile.label)}</span>
      ${tile.reason && !tile.supported ? `<span class="mode-reason">${escapeHtml(tile.reason)}</span>` : ''}
    </button>`;
  }).join('');
}

function renderAuraEffectControls(selectedValue) {
  const selected = selectedValue || auraSelectedEffect || $('aura-effect').value || 'static';
  renderModeGrid(selected);
  // La cuadrícula de 9 modos (#aura-mode-grid) es el ÚNICO selector de efectos.
  // La sección "Mas efectos ASUS" (#aura-extra-wrap) fue eliminada en v10 (A2).
}

function currentAuraFormState() {
  return {
    driver: 'asus',
    effect: auraSelectedEffect || $('aura-effect').value || 'static',
    colour: normalizeHex($('aura-colour').value),
    colour2: normalizeHex($('aura-colour2').value, '000000'),
    speed: $('aura-speed').value || 'med',
    direction: $('aura-direction').value || 'right',
    brightness: $('aura-brightness').value || 'high',
  };
}

function setAuraStatus(message, kind = '') {
  const el = $('aura-status');
  if (!message) {
    el.textContent = '';
    el.className = 'note hidden';
    return;
  }
  el.textContent = message;
  el.className = `note ${kind}`.trim();
}

function markAuraDirty(dirty, reason = '') {
  auraDirty = dirty;
  if (musicModeActive) {
    setAuraStatus('Modo música activo: la iluminación está siendo controlada por el audio.', 'status-live');
    return;
  }
  if (dirty) setAuraStatus(reason || 'Tienes cambios sin aplicar.', 'status-dirty');
  else if (auraState?.current) setAuraStatus('Iluminación aplicada y lista.', 'status-ok');
  else setAuraStatus('');
}

function setAuraForm(state) {
  if (!state) return;
  if (state.effect) {
    auraSelectedEffect = state.effect;
    $('aura-effect').value = state.effect;
  }
  $('aura-colour').value = '#' + normalizeHex(state.colour);
  $('aura-colour2').value = '#' + normalizeHex(state.colour2, '000000');
  if (state.speed) $('aura-speed').value = state.speed;
  if (state.direction) $('aura-direction').value = state.direction;
  if (state.brightness) $('aura-brightness').value = state.brightness;
  renderAuraEffectControls($('aura-effect').value);
  saveAuraDraft(currentAuraFormState());
  syncAuraFields();
}

function selectedAuraMeta() {
  const id = auraSelectedEffect || $('aura-effect').value;
  return auraState?.asus?.effects?.find((fx) => fx.id === id) || null;
}

function syncAuraFields() {
  const meta = selectedAuraMeta();
  $('aura-colour2-wrap').classList.toggle('hidden', !(meta?.colours >= 2));
  $('aura-speed-wrap').classList.toggle('hidden', !meta?.speed);
  $('aura-direction-wrap').classList.toggle('hidden', !meta?.direction);
}

function auraSignature(aura) {
  return JSON.stringify({
    available: aura?.available,
    asus: aura?.asus?.available,
    fx: (aura?.asus?.effects || []).map((f) => f.id),
    basic: (aura?.asus?.basic_effects || []).map((f) => f.id),
    extra: (aura?.asus?.extra_effects || []).map((f) => f.id),
    levels: aura?.asus?.brightness_levels,
    brightness: aura?.asus?.current_brightness,
    profiles: (aura?.profiles || []).map((p) => [p.name, p.state?.effect, p.state?.colour]),
    startup: [aura?.apply_on_startup, aura?.startup_profile],
    setup: aura?.setup?.needsSetup,
    openrgb: [aura?.openrgb?.available, aura?.openrgb?.sdk_reachable],
    music: aura?.music?.available,
    periph: (aura?.peripherals || []).map((p) => [p.name, p.link, p.supported]),
    grid: (aura?.mode_grid || []).map((t) => [t.id, t.supported]),
  });
}

function renderPeripherals(peripherals) {
  const host = $('peripherals');
  if (!peripherals?.length) { host.classList.add('hidden'); host.innerHTML = ''; return; }
  host.classList.remove('hidden');
  host.innerHTML = peripherals.map((p) => `
    <div class="periph${p.supported ? '' : ' pending'}">
      <span class="periph-dot"></span>
      <span class="periph-name">${escapeHtml(p.name)}</span>
      <span class="periph-link">${escapeHtml(p.link)} · ${escapeHtml(p.vid_pid)}</span>
      <span class="periph-note">${p.supported ? 'listo' : escapeHtml(p.note || '')}</span>
    </div>`).join('');
}

function renderAura(aura, resetForm = false) {
  // Solo reconstruir el DOM cuando cambió algo real: el stream manda un
  // snapshot por segundo y rehacer los chips destruía el botón a mitad de
  // clic (por eso "elegía Rainbow y quedaba Static").
  const sig = auraSignature(aura);
  auraState = aura;
  if (!resetForm && sig === lastAuraSig) return;
  lastAuraSig = sig;
  const effectSel = $('aura-effect');
  const profileSel = $('aura-profile-select');
  const note = $('aura-note');
  const openrgb = $('openrgb-note');

  if (!aura?.available) {
    note.textContent = 'No encontré controladores RGB disponibles. Instala asusctl/asusd para Aura.';
    $('aura-apply').disabled = true;
    $('aura-music').disabled = true;
    fillSelect(effectSel, [], '', 'Sin efectos detectados');
    return;
  }

  fillSelect(
    effectSel,
    auraEffects().map((fx) => ({ value: fx.id, label: fx.label })),
    auraSelectedEffect || effectSel.value || aura.current?.effect || 'static',
    'Sin efectos detectados',
  );
  auraSelectedEffect = effectSel.value || auraSelectedEffect;
  renderAuraEffectControls(auraSelectedEffect);
  fillSelect(
    $('aura-brightness'),
    (aura.asus?.brightness_levels || ['off', 'low', 'med', 'high']).map((level) => ({ value: level, label: level })),
    $('aura-brightness').value || aura.current?.brightness || 'high',
  );

  const profiles = aura.profiles || [];
  const selected = profiles.some((p) => p.name === auraProfileSelection)
    ? auraProfileSelection
    : (aura.startup_profile || profiles[0]?.name || '');
  auraProfileSelection = selected;
  profileSel.innerHTML = ['<option value="">perfiles guardados…</option>']
    .concat(profiles.map((p) => `<option value="${p.name}">${p.name}</option>`))
    .join('');
  profileSel.value = selected;
  if (document.activeElement !== $('aura-profile-name')) {
    $('aura-profile-name').value = selected || '';
  }
  renderAuraProfileList(profiles, selected, aura.startup_profile);
  $('aura-startup').checked = !!(aura.apply_on_startup && selected && selected === aura.startup_profile);

  if ((!auraBootstrapped || resetForm) && !auraFocused && !auraDirty) {
    const draft = loadAuraDraft();
    setAuraForm(draft || aura.current || profiles.find((p) => p.name === selected)?.state || {
      effect: 'static', colour: 'ff5500', colour2: '000000', brightness: 'high', speed: 'med', direction: 'right',
    });
    auraBootstrapped = true;
  }

  note.textContent = aura.asus?.available
    ? `Aura lista en ${aura.config_path}. Brillo actual: ${aura.asus.current_brightness || 'desconocido'}.`
    : (aura.asus?.hint || 'asusctl no disponible');
  const setupBtn = $('aura-setup');
  if (aura.setup?.needsSetup) {
    setupBtn.classList.remove('hidden');
    note.textContent = `${note.textContent} ${aura.setup.statusHint}`;
  } else {
    setupBtn.classList.add('hidden');
  }
  openrgb.textContent = aura.openrgb?.available
    ? `OpenRGB detectado${aura.openrgb.sdk_reachable ? ' con SDK local activo' : ', pero su SDK local no responde aún'}.`
    : aura.openrgb?.hint || '';
  openrgb.classList.toggle('hidden', !openrgb.textContent);
  renderPeripherals(aura.peripherals);

  $('aura-apply').disabled = !aura.asus?.available;
  $('aura-music').disabled = !(aura.music?.available && aura.asus?.available);
  syncAuraFields();
  if (!musicModeActive && !auraDirty) {
    setAuraStatus(aura.current ? 'Iluminación aplicada y lista.' : '', aura.current ? 'status-ok' : '');
  }
}

async function refreshAuraState(resetForm = false) {
  const res = await window.rog.getAuraState();
  if (!res.ok) { toast(`Aura: ${res.err}`); return; }
  renderAura(res.aura, resetForm);
}

function selectedAuraProfile() {
  const name = $('aura-profile-select').value;
  return auraState?.profiles?.find((p) => p.name === name) || null;
}

function effectLabel(id) {
  return auraState?.asus?.effects?.find((fx) => fx.id === id)?.label || id || 'efecto';
}

function renderAuraProfileList(profiles, selected, startupProfile) {
  const list = $('aura-profile-list');
  const empty = $('aura-profile-empty');
  empty.classList.toggle('hidden', profiles.length > 0);
  list.innerHTML = profiles.map((p) => {
    const colour = '#' + normalizeHex(p.state?.colour);
    const isStartup = p.name === startupProfile;
    const active = p.name === selected;
    return `
      <li class="profile-item${active ? ' active' : ''}" data-name="${escapeHtml(p.name)}">
        <span class="pswatch" style="background:${colour}"></span>
        <span class="pname" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span>
        ${isStartup ? '<span class="pstar" title="Se aplica al abrir la app">★</span>' : ''}
        <span class="ptag">${escapeHtml(effectLabel(p.state?.effect))}</span>
        <button class="pbtn papply" data-act="apply" title="Cargar y aplicar ya">APLICAR</button>
        <button class="pbtn pdelete" data-act="delete" title="Borrar este perfil">🗑</button>
      </li>`;
  }).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function applyAuraState(state, successMessage = 'Aura aplicada ✓') {
  if (auraState?.setup?.needsSetup) {
    setAuraStatus('Primero activa asusd con el botón ACTIVAR AURA.', 'status-dirty');
    toast(t('toast.aura_not_ready'));
    return null;
  }
  if (musicModeActive) {
    const off = await window.rog.setMusicMode({ enabled: false, state });
    if (!off.ok) {
      toast(`No se pudo apagar música: ${off.err}`);
      return null;
    }
    musicModeActive = false;
    $('aura-music').textContent = 'MODO MÚSICA';
  }
  const res = await window.rog.applyAura(state);
  if (!res.ok) {
    setAuraStatus(res.err || 'Aura falló al aplicar.', 'status-dirty');
    toast(`Aura: ${res.err}`);
    return null;
  }
  // reflect EXACTLY what was applied; never let a stale snapshot undo it
  setAuraForm(res.state || state);
  saveAuraDraft(res.state || state);
  markAuraDirty(false);
  toast(successMessage);
  await refreshAuraState(true);
  return res;
}

function benchmarkSummaryText(result) {
  if (!result) return 'sin resultados';
  if (!result.ok) return result.err || 'benchmark falló';
  const s = result.summary || {};
  const fanText = Object.entries(s.fan_rpm_max || {})
    .map(([k, v]) => `${k}: ${v} RPM`).join(' · ') || 'sin datos de ventiladores';
  const lines = [
    `${result.kind.toUpperCase()} · ${result.tool} · ${result.seconds}s`,
    `CPU máx: ${fmt(s.cpu_temp_max, 1)}°C · paquete ${fmt(s.cpu_package_max, 1)}°C · ${fmt(s.cpu_watts_max, 1)} W`,
    `GPU máx: ${fmt(s.gpu_temp_max, 1)}°C · ${fmt(s.gpu_watts_max, 1)} W · uso ${fmt(s.gpu_util_max, 0)}%`,
    `Throttling: ${s.throttle_events ?? 0} eventos · ${s.throttle_ms ?? 0} ms`,
    `Ventiladores: ${fanText}`,
  ];
  if (s.fan_cap) {
    const capText = Object.entries(s.fan_cap).map(([k, c]) =>
      `${k.replace('_fan', '').toUpperCase()} ${c.max ?? '--'}/${c.cap}`).join(' · ');
    lines.push(`Tope RPM: ${capText} → ${s.cap_respected ? 'respetado ✓' : 'EXCEDIDO ✗'}`);
  }
  return lines.join('\n');
}


/* Dibuja una mini-gráfica de sparkline de temperatures en un canvas */
function _unitForKey(key) {
  const k = (key || '').toLowerCase();
  if (k.includes('temp')) return '°C';
  if (k.includes('watt') || k.includes('power')) return ' W';
  if (k.includes('util') || k.includes('usage') || k.includes('percent')) return '%';
  if (k.includes('rpm') || k.includes('fan')) return '';
  return '';
}

function _drawSparkline(canvas, samples, key, color) {
  if (!samples || !samples.length) return;
  const vals = samples.map((s) => s[key]).filter((v) => v != null);
  if (!vals.length) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.offsetWidth || canvas.width;
  const h = canvas.offsetHeight || canvas.height;
  canvas.width = w;
  canvas.height = h;
  // Márgenes para ejes: izquierda (valores), abajo (segundos)
  const padL = 34, padB = 14, padT = 6, padR = 4;
  const gw = w - padL - padR;
  const gh = h - padT - padB;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const xStep = gw / Math.max(vals.length - 1, 1);
  const col = color || '#f25c3d';
  const ink = cssVar('--dim') || '#888';
  ctx.clearRect(0, 0, w, h);

  // rejilla + etiquetas Y (máx arriba, mín abajo) y X (0s … Ns)
  const unit = _unitForKey(key);
  ctx.font = '9px system-ui, sans-serif';
  ctx.fillStyle = ink;
  ctx.strokeStyle = (cssVar('--hair') || '#333');
  ctx.lineWidth = 1;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  [max, (max + min) / 2, min].forEach((val, i) => {
    const y = padT + (gh * i) / 2;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.globalAlpha = 0.25; ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillText(Math.round(val) + unit, padL - 4, y);
  });
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('0s', padL, h - padB + 3);
  ctx.textAlign = 'right';
  ctx.fillText(Math.max(vals.length - 1, 0) + 's', w - padR, h - padB + 3);

  // línea de datos
  ctx.beginPath();
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  vals.forEach((v, i) => {
    const x = padL + i * xStep;
    const y = padT + gh - ((v - min) / range) * gh;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
  // área bajo la curva
  ctx.lineTo(padL + (vals.length - 1) * xStep, padT + gh);
  ctx.lineTo(padL, padT + gh);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, padT, 0, padT + gh);
  grad.addColorStop(0, col + '44');
  grad.addColorStop(1, col + '00');
  ctx.fillStyle = grad;
  ctx.fill();
}

/* Clase de color por severidad de temperatura (reusa los umbrales de los badges) */
function _tempLvl(v) {
  if (v == null) return '';
  return v >= 95 ? 'lvl-crit' : v >= 85 ? 'lvl-hot' : v >= 70 ? 'lvl-warn' : 'lvl-ok';
}

/* Construye la línea de resumen legible de una bench-card.
 * GPU:  71.0°C máx · 33.8 W · uso 99% · 0 throttle · 45 s
 * CPU:  89.0°C máx · pkg 82°C · 65 W · 12 throttle · 45 s */
function _benchStatLine(item, s, isCpu, label) {
  // Todos los valores comparten el mismo tratamiento neón (.bench-stat-val);
  // la temperatura máx es la principal (más grande + color por severidad).
  const val = (v, unit, cls) =>
    `<b class="bench-stat-val${cls ? ' ' + cls : ''}">${v}</b><span class="bench-stat-unit">${unit}</span>`;
  const parts = [];
  const tMax = isCpu ? s.cpu_temp_max : s.gpu_temp_max;
  if (tMax != null) {
    parts.push(`<b class="bench-stat-main ${_tempLvl(tMax)}">${fmt(tMax, 1)}°C</b><span class="bench-stat-unit">máx</span>`);
  }
  if (isCpu && s.cpu_package_max != null) parts.push(val(fmt(s.cpu_package_max, 1), '°C pkg'));
  if (!isCpu && s.gpu_util_max != null) parts.push(val(fmt(s.gpu_util_max, 0), '% uso'));
  const w = isCpu ? s.cpu_watts_max : s.gpu_watts_max;
  if (w != null) parts.push(val(fmt(w, 1), 'W'));
  const thr = s.throttle_events;
  if (thr != null) {
    const cls = thr > 10 ? 'lvl-hot' : thr > 0 ? 'lvl-warn' : 'lvl-ok';
    parts.push(val(thr, 'throttle', cls));
  }
  if (item.seconds != null) parts.push(val(item.seconds, 's'));
  if (!parts.length) parts.push(`<span>${escapeHtml(item._legacyText || label)}</span>`);
  return parts.join('<i class="bench-stat-dot">·</i>');
}

/* Genera el HTML interior de una bench-card */
function _benchCardHtml(item) {
  const s = item.summary || {};
  const kind = (item.kind || 'cpu').toUpperCase();
  const label = item.label || kind;
  const isCpu = item.kind === 'cpu';

  // Línea de resumen LEGIBLE y SIEMPRE visible (sin clic): la métrica principal
  // grande y con color por severidad, las secundarias en gris. Reemplaza los
  // chips diminutos que no se leían.
  const statLine = _benchStatLine(item, s, isCpu, label);

  // detalle de texto: grid de valores
  let detailGrid = '';
  if (item.summary) {
    const cells = [
      { l: 'CPU máx', v: s.cpu_temp_max != null ? `${fmt(s.cpu_temp_max, 1)} °C` : '--', accent: s.cpu_temp_max >= 90 },
      { l: 'CPU pkg', v: s.cpu_package_max != null ? `${fmt(s.cpu_package_max, 1)} °C` : '--' },
      { l: 'CPU W máx', v: s.cpu_watts_max != null ? `${fmt(s.cpu_watts_max, 1)} W` : '--' },
      { l: 'GPU máx', v: s.gpu_temp_max != null ? `${fmt(s.gpu_temp_max, 1)} °C` : '--', accent: s.gpu_temp_max >= 85 },
      { l: 'GPU W máx', v: s.gpu_watts_max != null ? `${fmt(s.gpu_watts_max, 1)} W` : '--' },
      { l: 'GPU uso', v: s.gpu_util_max != null ? `${fmt(s.gpu_util_max, 0)} %` : '--' },
      { l: 'Throttle', v: `${s.throttle_events ?? 0} ev · ${s.throttle_ms ?? 0} ms`, accent: (s.throttle_events ?? 0) > 10 },
      { l: 'Duración', v: item.seconds != null ? `${item.seconds} s` : '--' },
    ];
    detailGrid = `<div class="bench-detail-grid">${cells.map((c) =>
      `<div class="bench-detail-cell">
         <label>${escapeHtml(c.l)}</label>
         <b${c.accent ? ' class="accent"' : ''}>${escapeHtml(c.v)}</b>
       </div>`).join('')}</div>`;

    // fan rpms
    const fanEntries = Object.entries(s.fan_rpm_max || {});
    if (fanEntries.length) {
      detailGrid += `<div class="bench-detail-fans">Ventiladores: ${
        fanEntries.map(([k, v]) => `<b>${escapeHtml(k)}: ${v} RPM</b>`).join(' · ')
      }</div>`;
    }
    // cap verdict
    if (s.fan_cap) {
      const capText = Object.entries(s.fan_cap).map(([k, c]) =>
        `${k.replace('_fan', '').toUpperCase()} ${c.max ?? '--'}/${c.cap}`).join(' · ');
      detailGrid += `<div class="bench-detail-fans">Tope: ${escapeHtml(capText)}</div>`;
    }
  } else if (item._legacyText) {
    detailGrid = `<div class="bench-detail-fans">${escapeHtml(item._legacyText)}</div>`;
  }

  // sparkline placeholder (se rellena en JS después de insertar al DOM)
  const hasSparkline = Array.isArray(item.samples) && item.samples.length > 1;
  const sparklineId = `spark-${item.id}`;
  const sparkHtml = hasSparkline
    ? `<canvas class="bench-sparkline" id="${sparklineId}" width="280" height="96"></canvas>`
    : '';

  // mini-sparkline SIEMPRE visible en el cuerpo de la tarjeta: la curva térmica
  // de un vistazo, sin tener que abrir el detalle. Si no hay samples, se muestra
  // una franja informativa para que la tarjeta nunca quede vacía.
  const miniSparkId = `mspark-${item.id}`;
  const miniBody = hasSparkline
    ? `<canvas class="bench-mini-spark" id="${miniSparkId}" height="56"></canvas>`
    : `<div class="bench-mini-empty">${escapeHtml(item._legacyText || 'sin curva registrada')}</div>`;

  // tool info
  const toolHtml = item.tool
    ? `<div class="bench-detail-tool">Herramienta: ${escapeHtml(item.tool)}</div>`
    : '';

  return `
    <div class="bench-card-header">
      <span class="bench-card-kind kind-${escapeHtml((item.kind || 'cpu'))}">${escapeHtml(kind)}</span>
      <span class="bench-card-when">${escapeHtml(item.when || '')}</span>
      <span class="bench-card-expand">ampliar ▸</span>
      <button type="button" class="bench-card-delete" data-bid-del="${escapeHtml(item.id || '')}" title="Borrar este benchmark">&#10005;</button>
    </div>
    <div class="bench-card-statline">${statLine}</div>
    <div class="bench-card-body">
      ${miniBody}
    </div>
    <div class="bench-card-detail">
      ${sparkHtml}
      ${detailGrid}
      ${toolHtml}
    </div>`;
}

/* Mini-sparkline limpia (sin ejes) para el cuerpo siempre-visible de la tarjeta.
 * Línea neón + relleno degradado + punto final marcado. */
function _drawMiniSparkline(canvas, samples, key, color) {
  if (!samples || !samples.length) return;
  const vals = samples.map((s) => s[key]).filter((v) => v != null);
  if (!vals.length) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.offsetWidth || canvas.parentElement?.offsetWidth || 240;
  const h = canvas.offsetHeight || 56;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.scale(dpr, dpr);
  const padT = 5, padB = 5, padX = 2;
  const gh = h - padT - padB;
  const gw = w - padX * 2;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const xStep = gw / Math.max(vals.length - 1, 1);
  const col = color || '#f25c3d';
  ctx.clearRect(0, 0, w, h);
  const pt = (i, v) => [padX + i * xStep, padT + gh - ((v - min) / range) * gh];
  // relleno degradado
  ctx.beginPath();
  vals.forEach((v, i) => { const [x, y] = pt(i, v); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
  ctx.lineTo(padX + (vals.length - 1) * xStep, padT + gh);
  ctx.lineTo(padX, padT + gh);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, padT, 0, padT + gh);
  grad.addColorStop(0, col + '55');
  grad.addColorStop(1, col + '00');
  ctx.fillStyle = grad;
  ctx.fill();
  // línea neón con glow
  ctx.beginPath();
  vals.forEach((v, i) => { const [x, y] = pt(i, v); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.8;
  ctx.lineJoin = 'round';
  ctx.shadowColor = col;
  ctx.shadowBlur = 6;
  ctx.stroke();
  ctx.shadowBlur = 0;
  // punto final
  const [ex, ey] = pt(vals.length - 1, vals[vals.length - 1]);
  ctx.beginPath();
  ctx.arc(ex, ey, 2.6, 0, Math.PI * 2);
  ctx.fillStyle = col;
  ctx.fill();
}

function renderBenchmarkHistory() {
  const host = $('bench-history');
  if (!benchmarkHistory.length) {
    host.innerHTML = '<li class="bench-empty">sin historial</li>';
    $('bench-inline-status').textContent = 'Sin benchmarks en esta sesión.';
    updateBenchClearAllVisibility();
    return;
  }

  const items = benchmarkHistory.slice(0, 8);
  host.innerHTML = items.map((item) =>
    `<li class="bench-card" data-bid="${escapeHtml(item.id || '')}">${_benchCardHtml(item)}</li>`
  ).join('');

  // dibujar sparklines después de que los elementos estén en el DOM
  items.forEach((item) => {
    if (!Array.isArray(item.samples) || item.samples.length < 2) return;
    const key = item.kind === 'gpu' ? 'gpu_temp' : 'cpu_temp';
    const color = cssVar('--accent');
    // sparkline del detalle (al expandir/fallback)
    const canvas = document.getElementById(`spark-${item.id}`);
    if (canvas) _drawSparkline(canvas, item.samples, key, color);
    // mini-sparkline SIEMPRE visible en el cuerpo de la tarjeta
    const mini = document.getElementById(`mspark-${item.id}`);
    if (mini) _drawMiniSparkline(mini, item.samples, key, color);
  });

  // borrar un benchmark individual
  host.querySelectorAll('.bench-card-delete').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteBenchmarkItem(btn.dataset.bidDel);
    });
  });

  updateBenchClearAllVisibility();

  // click en la tarjeta → abrir el modal de detalle dedicado (gráficas grandes,
  // eventos, antes→después). Fallback al viejo expandir-en-línea si el modal
  // no estuviera disponible por algún motivo.
  host.querySelectorAll('.bench-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.bench-card-delete')) return; // borrar no abre
      const bid = card.dataset.bid;
      const item = benchmarkHistory.find((i) => i.id === bid);
      if (item && window.RogBenchDetail && typeof window.RogBenchDetail.open === 'function') {
        window.RogBenchDetail.open(item);
        return;
      }
      // fallback: comportamiento previo de expandir en línea
      if (e.target.closest('.bench-card-detail')) return;
      card.classList.toggle('open');
      if (card.classList.contains('open') && item?.samples?.length > 1) {
        const canvas = card.querySelector('.bench-sparkline');
        if (canvas) {
          const key = item.kind === 'gpu' ? 'gpu_temp' : 'cpu_temp';
          _drawSparkline(canvas, item.samples, key, cssVar('--accent'));
        }
      }
    });
  });

  // inline status: texto del último item
  const first = items[0];
  const s = first.summary || {};
  const statusText = first.kind === 'cpu'
    ? `CPU ${fmt(s.cpu_temp_max, 1)}°C · ${fmt(s.cpu_watts_max, 1)} W · throttle ${s.throttle_events ?? 0} — ${first.when}`
    : first._legacyText
      ? first._legacyText
      : `GPU ${fmt(s.gpu_temp_max, 1)}°C · ${fmt(s.gpu_watts_max, 1)} W — ${first.when}`;
  $('bench-inline-status').textContent = statusText;
}

function pushBenchmarkHistory(result) {
  if (!result?.ok) return;
  const s = result.summary || {};
  const label = result.kind === 'cpu' ? 'CPU' : 'GPU LOCAL';
  const now = new Date();
  const record = {
    id: `bench-${result.kind}-${now.getTime()}`,
    kind: result.kind,
    label,
    started_at: result.started_at || null,
    when: now.toLocaleString(),
    seconds: result.seconds || null,
    tool: result.tool || null,
    summary: s,
    samples: result.samples || null,
  };
  benchmarkHistory = [record, ...benchmarkHistory].slice(0, 20);
  localStorage.setItem('benchmarkHistoryV2', JSON.stringify(benchmarkHistory));
  renderBenchmarkHistory();
}

/* ---- borrar historial de benchmarks (persistencia legible en localStorage) ---- */
function _saveBenchmarkHistory() {
  localStorage.setItem('benchmarkHistoryV2', JSON.stringify(benchmarkHistory));
}

function deleteBenchmarkItem(id) {
  if (!id) return;
  const before = benchmarkHistory.length;
  benchmarkHistory = benchmarkHistory.filter((i) => i.id !== id);
  if (benchmarkHistory.length === before) return;
  _saveBenchmarkHistory();
  renderBenchmarkHistory();
  toast(t('toast.bench_cleared'));
}

function clearAllBenchmarkHistory() {
  if (!benchmarkHistory.length) return;
  if (!window.confirm('¿Borrar TODOS los benchmarks anteriores? Esta acción no se puede deshacer.')) return;
  benchmarkHistory = [];
  _saveBenchmarkHistory();
  renderBenchmarkHistory();
  toast(t('toast.bench_hist_cleared'));
}

/* Inyecta el botón "Borrar todos" en el bloque inline si todavía no existe */
function _ensureBenchClearAllButton() {
  const actions = document.querySelector('#bench-block .bench-actions');
  if (actions && !document.getElementById('bench-clear-all-btn')) {
    const btn = document.createElement('button');
    btn.className = 'ghost';
    btn.id = 'bench-clear-all-btn';
    btn.textContent = 'BORRAR TODOS LOS ANTERIORES';
    btn.title = 'Borra todo el historial de benchmarks guardado';
    btn.addEventListener('click', clearAllBenchmarkHistory);
    actions.appendChild(btn);
  }
  const modalActions = document.querySelector('#benchmark-modal .mode-row');
  if (modalActions && !document.getElementById('bench-clear-all-modal-btn')) {
    const btn = document.createElement('button');
    btn.className = 'ghost';
    btn.id = 'bench-clear-all-modal-btn';
    btn.textContent = 'BORRAR TODOS';
    btn.title = 'Borra todo el historial de benchmarks guardado';
    btn.addEventListener('click', clearAllBenchmarkHistory);
    modalActions.appendChild(btn);
  }
}

function updateBenchClearAllVisibility() {
  _ensureBenchClearAllButton();
  const inlineBtn = document.getElementById('bench-clear-all-btn');
  const modalBtn = document.getElementById('bench-clear-all-modal-btn');
  const has = benchmarkHistory.length > 0;
  if (inlineBtn) inlineBtn.classList.toggle('hidden', !has);
  if (modalBtn) modalBtn.classList.toggle('hidden', !has);
}

/* ---------- main update ---------- */

const LAMP_STATES = [
  ['cold', 'FRÍO'], ['normal', 'NORMAL'], ['hot', 'CALIENTE'], ['critical', 'CRÍTICO'],
];

// Nombre corto de la dGPU detectada (p. ej. "RTX 4060"); se recuerda para que
// los tooltips sigan diciendo el modelo real aun en modo Integrated (dGPU off).
let dgpuName = localStorage.getItem('dgpuName') || '';

function shortGpuName(full) {
  return String(full || '')
    .replace(/NVIDIA |GeForce |AMD |Radeon\(TM\) | Laptop GPU| Graphics/g, '')
    .trim();
}

function refreshGpuTooltips(active) {
  const detected = active?.vendor !== 'intel' ? shortGpuName(active?.name) : '';
  if (detected && detected !== dgpuName) {
    dgpuName = detected;
    localStorage.setItem('dgpuName', dgpuName);
  }
  const gpu = dgpuName ? `la ${dgpuName}` : 'la GPU dedicada';
  const seg = $('gpu-seg');
  if (seg.dataset.tipFor === dgpuName) return;
  seg.dataset.tipFor = dgpuName;
  seg.querySelector('[data-gpu="Integrated"]').title =
    `Solo gráficos integrados: máxima batería, ${gpu} queda apagada`;
  seg.querySelector('[data-gpu="Hybrid"]').title =
    `Integrados para el escritorio + ${gpu} para juegos (recomendado)`;
  seg.querySelector('[data-gpu="AsusMuxDgpu"]').title =
    `MUX: solo ${gpu} para todo. Más FPS pero gasta más batería. Requiere REINICIAR`;
}

function gpuPendingActionText(action, mode) {
  const raw = String(action || '').toLowerCase();
  if (mode === 'AsusMuxDgpu' || raw.includes('reboot') || raw.includes('restart')) {
    return 'reinicia el equipo para aplicar';
  }
  return 'cierra sesión y vuelve a iniciar para aplicar';
}

function gpuSwitchWarning(mode) {
  const gpu = dgpuName ? `la ${dgpuName}` : 'la GPU dedicada';
  if (mode === 'AsusMuxDgpu') {
    return `Modo dGPU (MUX): ${gpu} maneja TODO, incluida la pantalla.\n\n` +
      '✓ Más FPS en juegos\n' +
      '✗ Mucho más consumo de batería\n' +
      '✗ Requiere REINICIAR el equipo\n\n' +
      'Guarda tu trabajo antes de continuar. ¿Solicitar el cambio?';
  }
  if (mode === 'Integrated') {
    return `Modo iGPU: se apaga ${gpu} para ahorrar batería.\n\n` +
      'Esto puede cerrar tu sesión gráfica o dejar un cambio pendiente hasta cerrar sesión.\n' +
      'Guarda tu trabajo antes de continuar. ¿Solicitar el cambio?';
  }
  return `Modo Hybrid: escritorio en iGPU + ${gpu} para juegos.\n\n` +
    'Esto puede cerrar tu sesión gráfica o dejar un cambio pendiente hasta cerrar sesión.\n' +
    'Guarda tu trabajo antes de continuar. ¿Solicitar el cambio?';
}

function gpuRequestToast(mode, res) {
  const action = gpuPendingActionText(res.pending_action, res.pending || mode);
  if (res.pending) return `Modo ${mode} solicitado — ${action}`;
  if (res.mode === mode) return `Modo ${mode} activo`;
  return `Modo ${mode} solicitado`;
}

function update(stats) {
  lastStats = stats;
  const cpu = stats.cpu || {};
  const limits = stats.limits || {};

  /* lamp — usa nombres "bare" propios (cold/normal/hot/critical) que ya
   * existen en el CSS de la lámpara; very-hot de tempClass() mapea a critical
   * aquí para no romper ese contrato previo (la lámpara no es #cpu-temp/#gpu-temp). */
  const lamp = $('thermal-lamp');
  const rawCls = tempClass(cpu.avg, limits.cpu).replace('t-', '') || '';
  const cls = rawCls === 'very-hot' ? 'critical' : rawCls;
  lamp.className = 'lamp ' + cls;
  const lampIdx = { cold: 0, normal: 1, hot: 2, critical: 3 }[cls];
  const label = $('thermal-label');
  label.textContent = lampIdx != null ? LAMP_STATES[lampIdx][1] : '—';
  label.className = 'lamp-label ' + cls;

  /* cpu */
  $('cpu-model').textContent = cpu.model || '';
  const cpuTemp = $('cpu-temp');
  cpuTemp.textContent = fmt(cpu.avg, 1);
  cpuTemp.className = tempClass(cpu.avg, limits.cpu);
  $('cpu-max').textContent = fmt(cpu.max, 0) + '°';
  $('cpu-min').textContent = fmt(cpu.min, 0) + '°';
  $('cpu-pkg').textContent = fmt(cpu.package, 0) + '°';
  $('cpu-hot').textContent = cpu.hot90 ?? '--';
  $('cpu-freq').textContent = fmt(cpu.freq_ghz, 2);
  const cpuWatts = $('cpu-watts');
  cpuWatts.textContent = stats.rapl_available ? fmt(stats.cpu_watts, 1) : 'root';
  // only flag power that is actually abnormal, not just "is a number"
  cpuWatts.className = (stats.cpu_watts ?? 0) >= 140 ? 'accent' : '';
  $('cpu-throttle').textContent = cpu.throttle_count ?? '--';
  $('cpu-epp').textContent = cpu.epp || '--';

  /* gpu */
  const gpu = stats.gpu || {};
  const active = gpu.active;
  refreshGpuTooltips(active);
  $('gpu-mode').textContent = (gpu.mode || '--') + (gpu.pending ? ` → ${gpu.pending}` : '');
  if (active) {
    $('gpu-off-note').classList.add('hidden');
    $('gpu-name').textContent = active.name || '';
    const gt = $('gpu-temp');
    gt.textContent = fmt(active.temp, 0);
    gt.className = tempClass(active.temp, limits.gpu);
    $('gpu-util').textContent = fmt(active.util, 0) + '%';
    $('gpu-watts').textContent = fmt(active.power, 1);
    $('gpu-clock').textContent = fmt(active.clock_mhz, 0);
    $('gpu-vram-clock').textContent = fmt(active.vram_clock_mhz, 0);
    $('gpu-vram').textContent = active.vram_total
      ? `${fmt(active.vram_used, 0)}/${fmt(active.vram_total, 0)}M` : '--';
  } else {
    $('gpu-off-note').classList.remove('hidden');
    $('gpu-temp').textContent = '--';
    $('gpu-util').textContent = $('gpu-watts').textContent = $('gpu-vram').textContent = '--';
    $('gpu-clock').textContent = $('gpu-vram-clock').textContent = '--';
  }

  /* pending banner */
  const banner = $('pending-banner');
  if (gpu.pending) {
    $('pending-mode').textContent = `${gpu.mode || '?'} → ${gpu.pending}`;
    $('pending-action').textContent = gpuPendingActionText(gpu.pending_action, gpu.pending);
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }

  /* segmented controls */
  const sysProfile = normalizeProfile(stats.ppd_profile);
  let shownProfile = sysProfile;
  if (pendingProfile) {
    if (sysProfile === pendingProfile) {
      pendingProfile = null;            // el sistema ya reporta el perfil elegido
    } else if (pendingProfileConfirmed) {
      // El sistema confirmó el cambio (busctl read-back). El perfil ES el que
      // el usuario eligió; si el stream 1 Hz aún reporta el viejo es solo
      // rezago. NO revertimos: el usuario manda, se queda donde lo puso.
      shownProfile = pendingProfile;
    } else if (Date.now() - pendingProfileTs > PENDING_PROFILE_MS) {
      pendingProfile = null;            // nunca se confirmó y expiró: reflejar realidad
    } else {
      shownProfile = pendingProfile;    // mantener el elegido mientras se aplica
    }
  }
  document.querySelectorAll('#profile-seg button').forEach((b) =>
    b.classList.toggle('active', b.dataset.profile === shownProfile));
  document.querySelectorAll('#gpu-seg button').forEach((b) => {
    b.classList.toggle('active', b.dataset.gpu === gpu.mode);
    b.classList.toggle('busy', gpuBusy);
  });

  /* fans */
  renderFans(stats.fans || []);
  if (stats.aura && !musicModeActive && !auraDirty && !auraFocused) renderAura(stats.aura);

  /* charts */
  const series = stats.series || {};
  drawChart($('chart-cpu'), series.cpu_temp, cssVar('--cold'));
  drawChart($('chart-gpu'), series.gpu_temp, cssVar('--okstate'));
  drawChart($('chart-power'), series.cpu_power, cssVar('--accent'), { fromZero: true });
  drawChart($('chart-gpu-power'), series.gpu_power, cssVar('--hot'), { fromZero: true });

  $('rapl-note').classList.toggle('hidden', !!stats.rapl_available);

  /* system */
  const sys = stats.sys || {};
  $('ram-label').textContent = `${fmt(sys.ram_used_gb, 1)}/${fmt(sys.ram_total_gb, 0)} G`;
  $('ram-bar').style.width = (sys.ram_percent || 0) + '%';

  const disks = $('disks');
  disks.innerHTML = (sys.disks || []).map((d) => `
    <div class="meter">
      <label>${d.label} <b>${fmt(d.used_gb, 0)}/${fmt(d.total_gb, 0)} G</b></label>
      <div class="track"><div style="width:${d.percent}%"></div></div>
    </div>`).join('');

  $('net').textContent = `↓${fmt(sys.rx_mbps, 1)} ↑${fmt(sys.tx_mbps, 1)} Mb/s`;
  $('load').textContent = (sys.load || []).map((l) => l.toFixed(2)).join(' ');
  const bat = stats.battery;
  $('battery').textContent = bat && bat.capacity != null
    ? `${bat.capacity}%${bat.charge_limit ? ' (límite ' + bat.charge_limit + '%)' : ''}`
    : '--';
  $('asus-profile').textContent = stats.asus_profile || '--';

  /* power source */
  const src = $('power-source');
  if (bat) {
    src.textContent = bat.on_ac ? '⚡ CONECTADO' : '🔋 BATERÍA';
    src.className = 'power-source ' + (bat.on_ac ? 'ac' : 'bat');
  }

  /* events */
  const events = (stats.events || []).slice(-30).reverse();
  $('events').innerHTML = events.length
    ? events.map(([ts, level, msg]) =>
        `<li class="${level}"><time>${ts}</time>${msg}</li>`).join('')
    : '<li class="dim">sin eventos</li>';

  /* processes — DOS columnas separadas: % CPU total (todos los núcleos) y
     % NÚCLEO (uso de un solo núcleo, estilo `top`). Antes iban pegados. */
  $('procs-body').innerHTML = (stats.procs || []).map((p) => {
    const core = p.cpu_core != null
      ? `<span class="procs-core" title="${p.cpu_core >= 100
            ? Math.floor(p.cpu_core / 100) + ' núcleo(s) completo(s)'
            : 'fracción de un núcleo'}">${p.cpu_core.toFixed(0)}%</span>`
      : '<span class="dim">—</span>';
    return `<tr data-pid="${p.pid}" data-name="${p.name}" title="${t('procs.kill', { name: p.name })}">
        <td class="pid">${p.pid}</td><td>${p.name}</td>
        <td class="cpu r">${p.cpu.toFixed(1)}%</td>
        <td class="cpu-core r">${core}</td>
        <td class="mem r">${p.mem_mb} MB</td></tr>`;
  }).join('');

  $('backend-state').textContent =
    `sensores OK · core v${stats.version || '?'} · ${new Date().toLocaleTimeString()}`;
}

/* ---------- actions ---------- */

function closeControlMenus(except = '') {
  document.querySelectorAll('[data-menu-panel]').forEach((panel) => {
    const name = panel.dataset.menuPanel;
    panel.classList.toggle('hidden', name !== except);
  });
  document.querySelectorAll('[data-menu-toggle]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.menuToggle === except);
  });
}

document.querySelectorAll('[data-menu-toggle]').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const name = btn.dataset.menuToggle;
    const panel = document.querySelector(`[data-menu-panel="${name}"]`);
    closeControlMenus(panel && panel.classList.contains('hidden') ? name : '');
  });
});
document.querySelectorAll('[data-menu-panel]').forEach((panel) => {
  panel.addEventListener('click', (e) => {
    if (e.target.closest('button')) closeControlMenus();
  });
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.control-menu')) closeControlMenus();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeControlMenus();
});

const PROFILE_KEY = {
  'power-saver': 'profile.power_saver',
  'balanced':    'profile.balanced',
  'performance': 'profile.performance',
};
document.querySelectorAll('#profile-seg button').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const profile = btn.dataset.profile;
    // Marcar como PENDIENTE: el resaltado se mantiene en este perfil hasta que el
    // sistema lo confirme (ver bloque en update()). Esto elimina el "rebote" que
    // ocurría cuando el refresco 1 Hz pisaba el resaltado con el perfil viejo.
    pendingProfile = profile;
    pendingProfileTs = Date.now();
    pendingProfileConfirmed = false;
    document.querySelectorAll('#profile-seg button').forEach((b) =>
      b.classList.toggle('active', b === btn));
    const label = t(PROFILE_KEY[profile] || 'profile.balanced');
    const res = await window.rog.setProfile(profile);
    if (!res.ok) {
      pendingProfile = null;            // falló: volver a reflejar la realidad
      toast(t('profile.error', { e: res.err }));
      if (lastStats) update(lastStats);
      return;
    }
    // applied === true → busctl confirmó que el perfil realmente quedó. A
    // partir de aquí el resaltado se queda fijo en lo que elegiste (no rebota).
    if (res.applied && pendingProfile === profile) pendingProfileConfirmed = true;
    toast(res.applied
      ? t('profile.changed', { p: label })
      : t('profile.requested', { p: label }));
  });
});

document.querySelectorAll('#gpu-seg button').forEach((btn) => {
  btn.addEventListener('click', async () => {
    if (gpuBusy) return;
    const mode = btn.dataset.gpu;
    if (lastStats?.gpu?.mode === mode && !lastStats?.gpu?.pending) {
      toast(`Ya estás en modo ${mode}`);
      return;
    }
    if (!window.confirm(gpuSwitchWarning(mode))) return;
    gpuBusy = true;
    toast(`Solicitando modo ${mode}… (puede tardar)`);
    const res = await window.rog.setGpuMode(mode);
    gpuBusy = false;
    toast(res.ok ? gpuRequestToast(mode, res) : `No se pudo: ${res.err || res.out}`);
  });
});

// El botón ACTUALIZAR del menú SISTEMA se removió (vive en MANTENIMIENTO). El
// handler se conserva guardado por si vuelve a existir.
$('update-btn')?.addEventListener('click', async () => {
  const label = $('update-label');
  const btn = $('update-btn');
  if (btn.dataset.ready === '1') {
    label.textContent = 'ACTUALIZANDO…';
    const res = await window.rog.doUpdate();
    btn.dataset.ready = '';
    btn.classList.remove('attention');
    label.textContent = 'ACTUALIZAR';
    toast(res.ok ? 'Actualizado y backend reiniciado ✓' : `Error: ${res.err}`);
    return;
  }
  label.textContent = 'BUSCANDO…';
  const res = await window.rog.checkUpdate();
  if (!res.ok) {
    label.textContent = 'ACTUALIZAR';
    toast(`No se pudo verificar: ${res.err}`);
  } else if (res.behind > 0) {
    btn.dataset.ready = '1';
    btn.classList.add('attention');
    label.textContent = `INSTALAR ${res.behind} CAMBIO${res.behind > 1 ? 'S' : ''}`;
    toast(`Actualizaciones disponibles:\n${res.log}`);
  } else {
    label.textContent = 'AL DÍA ✓';
    setTimeout(() => { label.textContent = 'ACTUALIZAR'; }, 4000);
  }
});

/* ---------- mantenimiento (actualizar / reinstalar / desinstalar) ---------- */
function maintStatus(msg) {
  const el = $('maint-status');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('hidden', !msg);
}
$('maintenance-btn')?.addEventListener('click', () => {
  maintStatus('');
  $('maintenance-modal').classList.remove('hidden');
});
$('maint-close')?.addEventListener('click', () => $('maintenance-modal').classList.add('hidden'));
$('maintenance-modal')?.addEventListener('click', (e) => {
  if (e.target === $('maintenance-modal')) $('maintenance-modal').classList.add('hidden');
});
$('maint-update')?.addEventListener('click', async () => {
  maintStatus('Buscando actualización…');
  const res = await window.rog.checkUpdate();
  if (!res.ok) { maintStatus(`No se pudo verificar: ${res.err}`); return; }
  if (res.behind > 0) {
    maintStatus(`Hay ${res.behind} cambio(s). Instalando…`);
    const up = await window.rog.doUpdate();
    maintStatus(up.ok ? 'Actualizado y backend reiniciado ✓' : `Error: ${up.err}`);
  } else {
    maintStatus('Ya estás al día ✓');
  }
});
$('maint-reinstall')?.addEventListener('click', async () => {
  maintStatus('Reinstalando dependencias…');
  const res = await window.rog.reinstallApp();
  maintStatus(res.ok ? 'Reinstalado y backend reiniciado ✓' : `Error: ${res.err || res.out}`);
});
$('maint-uninstall')?.addEventListener('click', async () => {
  const purge = $('maint-purge').checked;
  const msg = purge
    ? '¿Desinstalar ROG Monitor Y BORRAR tus configuraciones? No se puede deshacer.'
    : '¿Desinstalar ROG Monitor? (se conservan tus configuraciones)';
  if (!window.confirm(msg + '\n\nSe pedirá tu contraseña para quitar las integraciones de sistema.')) return;
  maintStatus('Desinstalando… (puede pedir contraseña)');
  const res = await window.rog.uninstallApp({ purge });
  if (res.ok) {
    maintStatus('Desinstalado. La app se cerrará…');
  } else {
    maintStatus(`Error: ${res.err || 'no se pudo desinstalar'}`);
  }
});

/* ---------- wiring ---------- */

wireChartHover('chart-cpu', '°C');
wireChartHover('chart-gpu', '°C');
wireChartHover('chart-power', 'W');
wireChartHover('chart-gpu-power', 'W');

window.rog.onStats(update);
window.rog.onBackendDown(() => {
  $('backend-state').textContent = 'backend caído — reiniciando…';
  recordLocalError('backend-down', { message: 'backend caído — reiniciando' });
});
window.rog.onMusicStopped(() => {
  musicModeActive = false;
  $('aura-music').textContent = 'MODO MÚSICA';
  markAuraDirty(false);
  refreshAuraState();
});
window.rog.appInfo().then((info) => {
  $('versions').textContent = `ROG Monitor v${info.appVersion} · ${info.repo}`;
});
window.addEventListener('resize', () => lastStats && update(lastStats));

/* ---------- zoom (ctrl+wheel, ctrl +/-/0) ---------- */

window.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  window.rog.zoom(e.deltaY < 0 ? 0.5 : -0.5);
}, { passive: false });
window.addEventListener('keydown', (e) => {
  if (!e.ctrlKey) return;
  if (e.key === '+' || e.key === '=') { e.preventDefault(); window.rog.zoom(0.5); }
  if (e.key === '-') { e.preventDefault(); window.rog.zoom(-0.5); }
  if (e.key === '0') { e.preventDefault(); window.rog.zoom(null); }
});

/* ---------- i18n / idioma ---------- */

// Idiomas con nombres nativos (en sincronía con i18n.js)
// Sin banderas/emojis: el selector usa LANG_META (i18n.js) con nombre nativo
// y una insignia con el código de idioma. Fallback local por si i18n no cargó.
const LANG_FALLBACK = [
  { code: 'es', native: 'Español'  },
  { code: 'en', native: 'English'  },
  { code: 'fr', native: 'Français' },
  { code: 'it', native: 'Italiano' },
  { code: 'pt', native: 'Português' },
  { code: 'zh', native: '中文'      },
  { code: 'ja', native: '日本語'    },
  { code: 'ko', native: '한국어'    },
];

function buildLangGrid() {
  const grid = $('lang-grid');
  if (!grid) return;
  const active = window.i18n ? window.i18n.get() : 'es';
  const langs = (window.i18n && window.i18n.LANG_META) || LANG_FALLBACK;
  grid.innerHTML = langs.map((l) => `
    <button class="lang-option${l.code === active ? ' active' : ''}" data-lang="${l.code}" type="button">
      <span class="lang-flag">${l.code.toUpperCase()}</span>
      <span class="lang-name">${l.native || l.label}</span>
    </button>`).join('');
  grid.querySelectorAll('.lang-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (window.i18n) window.i18n.set(btn.dataset.lang);
      // Actualizar estado activo en el grid sin reconstruir
      grid.querySelectorAll('.lang-option').forEach((b) =>
        b.classList.toggle('active', b.dataset.lang === btn.dataset.lang));
    });
  });
}

$('lang-btn').addEventListener('click', () => {
  buildLangGrid();
  $('lang-modal').classList.remove('hidden');
});

if ($('lang-close')) {
  $('lang-close').addEventListener('click', () => $('lang-modal').classList.add('hidden'));
}
$('lang-modal').addEventListener('click', (e) => {
  if (e.target === $('lang-modal')) $('lang-modal').classList.add('hidden');
});

// Cuando cambia el idioma: re-aplica data-i18n al DOM, regenera el grid y
// persiste el idioma en el backend (reinicia el monitor para que los eventos
// NUEVOS salgan en el idioma elegido; el historial viejo se queda como está).
if (window.i18n) {
  let langSaveTimer = null;
  window.i18n.onChange((lang) => {
    window.i18n.apply();
    buildLangGrid();
    if (window.rog?.saveSettings) {
      clearTimeout(langSaveTimer); // ponytail: debounce — reinicia el backend una sola vez
      langSaveTimer = setTimeout(() => window.rog.saveSettings({ lang }), 400);
    }
  });
}

/* ---------- theme picker ---------- */

$('theme-grid').innerHTML = THEMES.map(([id, name, desc]) => `
  <button class="theme-card" data-theme="${id}">
    <span class="swatch"><i class="a"></i><i></i><i></i></span>
    <span class="name">${name}</span>
    <span class="desc">${desc}</span>
  </button>`).join('');

document.querySelectorAll('.theme-card').forEach((card) => {
  card.addEventListener('click', () => {
    localStorage.setItem('theme', card.dataset.theme);
    applyAppearance();
  });
});

document.querySelectorAll('#mode-seg button').forEach((btn) => {
  btn.addEventListener('click', () => {
    localStorage.setItem('mode', btn.dataset.mode);
    applyAppearance();
  });
});
prefersDark.addEventListener('change', applyAppearance);

$('theme-btn').addEventListener('click', () => $('theme-modal').classList.remove('hidden'));
$('theme-close').addEventListener('click', () => $('theme-modal').classList.add('hidden'));
$('theme-modal').addEventListener('click', (e) => {
  if (e.target === $('theme-modal')) $('theme-modal').classList.add('hidden');
});

/* ---------- alert thresholds / colors ---------- */

function setAlertsStatus(message, kind = '') {
  const el = $('alerts-status');
  if (!message) { el.textContent = ''; el.className = 'note hidden'; return; }
  el.textContent = message;
  el.className = `note ${kind}`.trim();
}

function fillAlertsForm(s) {
  const a = s.alerts || {};
  const c = s.temp_colors || {};
  $('set-cpu-temp-warn').value = a.cpu_temp_warn ?? '';
  $('set-gpu-temp-warn').value = a.gpu_temp_warn ?? '';
  $('set-cpu-power-warn').value = a.cpu_power_warn ?? '';
  $('set-fan-stopped').value = a.fan_stopped_cpu_temp ?? '';
  $('set-cooldown').value = a.cooldown_seconds ?? '';
  $('set-throttle-ms').value = a.throttle_min_ms ?? '';
  const cpu = c.cpu || [];
  const gpu = c.gpu || [];
  $('set-cpu-c0').value = cpu[0] ?? '';
  $('set-cpu-c1').value = cpu[1] ?? '';
  $('set-cpu-c2').value = cpu[2] ?? '';
  $('set-gpu-c0').value = gpu[0] ?? '';
  $('set-gpu-c1').value = gpu[1] ?? '';
  $('set-gpu-c2').value = gpu[2] ?? '';
  $('set-notifications').checked = s.notifications !== false;
}

const numOrNull = (id) => {
  const v = $(id).value.trim();
  return v === '' ? null : Number(v);
};

async function openAlertsModal() {
  setAlertsStatus('');
  const res = await window.rog.getSettings();
  if (!res.ok) { toast(`No pude leer ajustes: ${res.err}`); return; }
  fillAlertsForm(res);
  // Autoarranque: estado independiente (no va en settings.json, es una entrada
  // .desktop en ~/.config/autostart). Se aplica al instante al marcar/desmarcar.
  try {
    const a = await window.rog.getAutostart();
    if (a && a.ok) $('set-autostart').checked = !!a.enabled;
  } catch (_) { /* no crítico */ }
  $('alerts-modal').classList.remove('hidden');
}

$('set-autostart').addEventListener('change', async (e) => {
  const res = await window.rog.setAutostart(e.target.checked);
  if (!res || res.ok === false) {
    toast(`No pude cambiar el autoarranque: ${(res && res.err) || '?'}`);
    e.target.checked = !e.target.checked; // revertir el visual
    return;
  }
  toast(e.target.checked
    ? 'Autoarranque activado: la app abrirá minimizada al iniciar sesión.'
    : 'Autoarranque desactivado.');
});

$('alerts-btn').addEventListener('click', openAlertsModal);
$('alerts-close').addEventListener('click', () => $('alerts-modal').classList.add('hidden'));
$('alerts-modal').addEventListener('click', (e) => {
  if (e.target === $('alerts-modal')) $('alerts-modal').classList.add('hidden');
});
$('alerts-save').addEventListener('click', async () => {
  const payload = {
    alerts: {
      cpu_temp_warn: numOrNull('set-cpu-temp-warn'),
      gpu_temp_warn: numOrNull('set-gpu-temp-warn'),
      cpu_power_warn: numOrNull('set-cpu-power-warn'),
      fan_stopped_cpu_temp: numOrNull('set-fan-stopped'),
      cooldown_seconds: numOrNull('set-cooldown'),
      throttle_min_ms: numOrNull('set-throttle-ms'),
    },
    temp_colors: {
      cpu: [numOrNull('set-cpu-c0'), numOrNull('set-cpu-c1'), numOrNull('set-cpu-c2')],
      gpu: [numOrNull('set-gpu-c0'), numOrNull('set-gpu-c1'), numOrNull('set-gpu-c2')],
    },
    notifications: $('set-notifications').checked,
  };
  setAlertsStatus('Guardando y reiniciando el monitor…', 'status-live');
  const res = await window.rog.saveSettings(payload);
  if (!res.ok) {
    setAlertsStatus(res.err || 'No se pudo guardar.', 'status-dirty');
    toast(`Ajustes: ${res.err}`);
    return;
  }
  fillAlertsForm(res);
  setAlertsStatus('Guardado y aplicado ✓', 'status-ok');
  toast(t('toast.thresholds_saved'));
});

applyAppearance();
refreshAuraState(true);
renderBenchmarkHistory();

$('aura-effect').addEventListener('change', syncAuraFields);

// Cuadrícula de 9 tiles Armoury-style.
// Tiles con aria-disabled="true" son visuales (no interactivos).
// El tile Music no cambia auraSelectedEffect: activa el botón MODO MÚSICA.
$('aura-mode-grid').addEventListener('click', (e) => {
  const btn = e.target.closest('.mode-tile');
  if (!btn) return;
  if (btn.getAttribute('aria-disabled') === 'true') return;
  const modeId = btn.dataset.mode;
  const kind = btn.dataset.kind;

  if (kind === 'software' && modeId === 'music') {
    // El tile Music activa directamente el modo música (igual que el botón MODO MÚSICA).
    $('aura-music').click();
    return;
  }

  auraSelectedEffect = modeId;
  $('aura-effect').value = modeId;
  renderAuraEffectControls(modeId);
  syncAuraFields();
  saveAuraDraft(currentAuraFormState());
  markAuraDirty(true, 'Efecto cambiado. Falta aplicar.');
});
$('aura-block').addEventListener('focusin', () => { auraFocused = true; });
$('aura-block').addEventListener('focusout', () => {
  setTimeout(() => {
    auraFocused = $('aura-block').contains(document.activeElement);
  }, 0);
});
$('aura-effect').addEventListener('change', () => {
  auraSelectedEffect = $('aura-effect').value;
  renderAuraEffectControls(auraSelectedEffect);
  saveAuraDraft(currentAuraFormState());
  markAuraDirty(true, 'Efecto cambiado. Falta aplicar.');
});
// Nota: el listener de #aura-extra-effect fue eliminado en v10 (A2).
// La cuadrícula #aura-mode-grid es el único selector de efectos.
$('aura-colour').addEventListener('input', () => {
  saveAuraDraft(currentAuraFormState());
  markAuraDirty(true, 'Color cambiado. Falta aplicar.');
});
$('aura-colour2').addEventListener('input', () => {
  saveAuraDraft(currentAuraFormState());
  markAuraDirty(true, 'Color secundario cambiado. Falta aplicar.');
});
$('aura-speed').addEventListener('change', () => {
  saveAuraDraft(currentAuraFormState());
  markAuraDirty(true, 'Velocidad cambiada. Falta aplicar.');
});
$('aura-direction').addEventListener('change', () => {
  saveAuraDraft(currentAuraFormState());
  markAuraDirty(true, 'Dirección cambiada. Falta aplicar.');
});
$('aura-brightness').addEventListener('change', () => {
  saveAuraDraft(currentAuraFormState());
  markAuraDirty(true, 'Brillo cambiado. Falta aplicar.');
});
$('aura-profile-select').addEventListener('change', () => {
  auraProfileSelection = $('aura-profile-select').value;
  $('aura-profile-name').value = auraProfileSelection;
  $('aura-startup').checked = !!(auraState?.apply_on_startup && auraProfileSelection === auraState?.startup_profile);
});

$('aura-setup').addEventListener('click', async () => {
  if (!window.confirm(
    'Esto configurará y arrancará asusd para Aura sin apagar rog-profile-sync.\n\n' +
    'Pedirá tu contraseña de administrador. ¿Continuar?')) return;
  setAuraStatus('Activando asusd para Aura…', 'status-live');
  const res = await window.rog.enableAuraService();
  if (!res.ok) {
    setAuraStatus(`No se pudo activar Aura: ${res.err}`, 'status-dirty');
    toast(`Aura: ${res.err}`);
    return;
  }
  toast(t('toast.asusd_on'));
  await refreshAuraState(true);
});

$('aura-apply').addEventListener('click', async () => {
  await applyAuraState(currentAuraFormState(), 'Aura aplicada ✓');
});

$('aura-save-profile').addEventListener('click', async () => {
  const name = $('aura-profile-name').value.trim() || auraProfileSelection;
  if (!name) { toast(t('toast.write_profile_name')); return; }
  const res = await window.rog.saveAuraProfile({ name, state: currentAuraFormState() });
  if (!res.ok) { toast(`No se guardó: ${res.err}`); return; }
  auraProfileSelection = name;
  $('aura-profile-name').value = name;
  toast(`Perfil "${name}" guardado ✓`);
  await refreshAuraState();
});

function selectAuraProfileByName(name) {
  const profile = auraState?.profiles?.find((p) => p.name === name);
  if (!profile) return null;
  auraProfileSelection = profile.name;
  $('aura-profile-select').value = profile.name;
  $('aura-profile-name').value = profile.name;
  document.querySelectorAll('#aura-profile-list .profile-item').forEach((li) =>
    li.classList.toggle('active', li.dataset.name === name));
  return profile;
}

$('aura-profile-list').addEventListener('click', async (e) => {
  const row = e.target.closest('.profile-item');
  if (!row) return;
  const name = row.dataset.name;
  const action = e.target.closest('[data-act]')?.dataset.act;

  if (action === 'delete') {
    if (!window.confirm(`¿Borrar el perfil "${name}"? Esta acción no se puede deshacer.`)) return;
    const res = await window.rog.deleteAuraProfile(name);
    if (!res.ok) { toast(`No se borró: ${res.err}`); return; }
    if (auraProfileSelection === name) auraProfileSelection = '';
    toast(`Perfil "${name}" borrado`);
    await refreshAuraState(true);
    return;
  }

  const profile = selectAuraProfileByName(name);
  if (!profile) { toast(t('toast.profile_gone')); return; }

  if (action === 'apply') {
    setAuraForm(profile.state);
    markAuraDirty(true, `Perfil "${name}" cargado. Aplicando…`);
    await applyAuraState(profile.state, `Perfil "${name}" aplicado ✓`);
  } else {
    // click on the row body: load into the form (no apply yet)
    setAuraForm(profile.state);
    markAuraDirty(true, `Perfil "${name}" cargado. Falta aplicar.`);
    toast(`Perfil "${name}" cargado en el formulario`);
  }
});

$('aura-startup').addEventListener('change', async (e) => {
  const name = $('aura-profile-select').value;
  if (e.target.checked && !name) {
    e.target.checked = false;
    toast(t('toast.save_select_first'));
    return;
  }
  const res = await window.rog.setAuraStartup({ name, enabled: e.target.checked });
  if (!res.ok) {
    e.target.checked = !e.target.checked;
    toast(`No se pudo: ${res.err}`);
    return;
  }
  toast(res.apply_on_startup ? `Perfil ${name} marcado para inicio` : 'Inicio automático de Aura desactivado');
  await refreshAuraState();
});

$('aura-music').addEventListener('click', async () => {
  if (musicModeActive) {
    const res = await window.rog.setMusicMode({ enabled: false, state: currentAuraFormState() });
  if (!res.ok) { toast(`No se pudo apagar: ${res.err}`); return; }
  musicModeActive = false;
  $('aura-music').textContent = 'MODO MÚSICA';
  markAuraDirty(false);
  toast(t('toast.music_off'));
  await refreshAuraState();
  return;
  }
  const res = await window.rog.setMusicMode({ enabled: true, state: currentAuraFormState() });
  if (!res.ok) { toast(`No se pudo activar: ${res.err}`); return; }
  musicModeActive = true;
  $('aura-music').textContent = 'PARAR MÚSICA';
  markAuraDirty(false);
  toast(t('toast.music_on'));
});

/* ---------- kill process ---------- */

$('procs-body').addEventListener('click', async (e) => {
  const row = e.target.closest('tr[data-pid]');
  if (!row) return;
  const { pid, name } = row.dataset;
  if (!window.confirm(
    `¿Cerrar el proceso "${name}" (PID ${pid})?\n\n` +
    'Se le pedirá terminar de forma ordenada (SIGTERM). ' +
    'Si es una app, perderás lo que no hayas guardado en ella.')) return;
  const res = await window.rog.killProcess(pid);
  toast(res.ok ? `Señal de cierre enviada a ${name}` : `No se pudo: ${res.err}`);
});

/* ---------- fan control center — con selector de perfil (Task 1 / C3) ---------- */

const FAN_NAMES = { cpu: 'CPU', gpu: 'GPU', mid: 'MID (central)' };
const FAN_MAX_DEFAULT = { cpu: 7000, gpu: 6900, mid: 7500 };
// fanCfgByProfile: caché de los 3 perfiles cargados (carga bajo demanda)
let fanCfg = null;          // perfil actualmente en el formulario
let fanActiveProfile = '';  // perfil de energia activo (ppd_profile -> quiet/balanced/performance)
let fanEditingProfile = '';  // perfil que se está editando en el modal
let fanCapDraft = {};       // cap_rpm por ventilador para el perfil en edición
const fanCfgByProfile = {}; // { quiet: res, balanced: res, performance: res }
const fanDirtyProfiles = new Set(); // perfiles con cambios sin guardar (edición multi-perfil)

const FAN_PROFILE_RECOMMENDED_CAP = {
  quiet: 4500,
  balanced: 5500,
  performance: 6500,
};
const FAN_GRAPH = {
  tempMin: 30,
  tempMax: 105,
  x0: 42,
  x1: 520,
  yTop: 36,
  yBottom: 204,
  ticks: [30, 45, 60, 75, 90, 105],
};

localStorage.removeItem('fanMax'); // legado: vivía aquí y nunca era real

function fanName(fan) {
  return FAN_NAMES[fan] || fan.toUpperCase();
}

function normalizeFanProfile(profile) {
  const p = normalizeProfile(profile || '');
  if (p === 'power-saver') return 'quiet';
  if (['quiet', 'balanced', 'performance'].includes(p)) return p;
  return 'quiet';
}

function fanProfileLabel(profile) {
  const p = normalizeFanProfile(profile);
  const key = p === 'quiet' ? 'power-saver' : p;
  return t(PROFILE_KEY[key] || 'profile.power_saver');
}

function fanKeys(cfg = fanCfg) {
  return Object.keys(cfg?.curves || FAN_NAMES);
}

function fanCalibrated(fan) {
  return (fanCfg?.calibration?.[fan] || []).length >= 2;
}

function fanMaxRpm(fan) {
  return fanCfg?.max_rpm?.[fan] || FAN_MAX_DEFAULT[fan] || 6000;
}

// PWM límite para un cap en RPM: interpola la calibración medida (igual que
// el servicio root); sin calibración, regla de tres con el máximo estimado.
function capToPwm(cap, fan) {
  const target = cap * 0.985;
  const pts = (fanCfg?.calibration?.[fan] || [])
    .filter(([p, r]) => r > 0).sort((a, b) => a[0] - b[0]);
  if (pts.length >= 2) {
    if (target >= pts[pts.length - 1][1]) return 255;
    let prev = [0, 0];
    for (const [p, r] of pts) {
      if (r >= target) {
        if (r === prev[1]) return p;
        return Math.round(prev[0] + ((target - prev[1]) / (r - prev[1])) * (p - prev[0]));
      }
      prev = [p, r];
    }
  }
  return Math.min(255, Math.round(target * 255 / fanMaxRpm(fan)));
}

function pwmToRpm(pwm, fan) {
  const pts = (fanCfg?.calibration?.[fan] || [])
    .filter(([p, r]) => r > 0).sort((a, b) => a[0] - b[0]);
  if (pts.length >= 2) {
    if (pwm <= pts[0][0]) return Math.round(pts[0][1] * (pwm / Math.max(1, pts[0][0])));
    let prev = pts[0];
    for (const point of pts.slice(1)) {
      const [p, r] = point;
      if (pwm <= p) {
        const frac = (pwm - prev[0]) / Math.max(1, p - prev[0]);
        return Math.round(prev[1] + frac * (r - prev[1]));
      }
      prev = point;
    }
    return pts[pts.length - 1][1];
  }
  return Math.round((pwm / 255) * fanMaxRpm(fan));
}

function estimateFanDba(fan, rpm) {
  const max = Math.max(1, fanMaxRpm(fan));
  const ratio = Math.max(0, Math.min(1, rpm / max));
  return 24 + 24 * Math.pow(ratio, 2.15);
}

function combinedDba(values) {
  const valid = values.filter((v) => Number.isFinite(v) && v > 0);
  if (!valid.length) return null;
  const power = valid.reduce((sum, db) => sum + Math.pow(10, db / 10), 0);
  return 10 * Math.log10(power);
}

function capMapFromSource(caps, keys = fanKeys()) {
  const out = {};
  for (const fan of keys) {
    const raw = caps?.[fan];
    const cap = Math.round(+raw);
    if (Number.isFinite(cap) && cap >= 2000) out[fan] = cap;
  }
  return out;
}

function capValues(caps = fanCapDraft) {
  return Object.values(caps || {}).filter((v) => Number.isFinite(+v) && +v >= 2000).map((v) => Math.round(+v));
}

function fanCapDisplay(caps = fanCapDraft) {
  const values = capValues(caps);
  if (!values.length) return t('fan.no_cap');
  const unique = [...new Set(values)];
  if (unique.length === 1) return `${unique[0]} RPM`;
  return Object.entries(caps)
    .filter(([, v]) => Number.isFinite(+v) && +v >= 2000)
    .map(([fan, v]) => `${fanName(fan)} ${Math.round(+v)}`)
    .join(' · ');
}

function syncFanCapInput() {
  const input = $('fan-cap');
  if (!input) return;
  const values = capValues();
  const unique = [...new Set(values)];
  input.value = unique.length === 1 ? unique[0] : '';
  input.placeholder = unique.length > 1
    ? t('fan.cap_mixed')
    : t('fan.recommended', { n: FAN_PROFILE_RECOMMENDED_CAP[fanEditingProfile] || 5500 });
}

function updateFanCapPanelText() {
  const label = fanProfileLabel(fanEditingProfile);
  const title = $('fan-cap-title');
  const state = $('fan-cap-state');
  if (title) title.textContent = label;
  if (state) state.textContent = fanCapDisplay();
  if ($('fan-cap-label')) $('fan-cap-label').textContent = label;
}

function renderFanCapEditor() {
  const host = $('fan-cap-per-fan');
  if (!host || !fanCfg) return;
  host.innerHTML = fanKeys().map((fan) => `
    <label>
      <span>${fanName(fan)}</span>
      <input type="number" min="2000" max="8000" step="100" data-fan-cap="${fan}"
        value="${capForFan(fan) || ''}" placeholder="${t('fan.no_cap')}">
    </label>`).join('');
  host.querySelectorAll('[data-fan-cap]').forEach((input) => {
    input.addEventListener('input', () => {
      const fan = input.dataset.fanCap;
      const next = currentCapMap();
      const value = Math.round(+input.value);
      if (Number.isFinite(value) && value >= 2000) next[fan] = value;
      else delete next[fan];
      fanCapDraft = next;
      syncFanCapInput();
      updateFanCapPanelText();
      updateCapPreview({ skipEditor: true });
      markFanDirty();
    });
  });
}

function setFanCapAll(cap) {
  const value = Math.round(+cap);
  fanCapDraft = {};
  if (Number.isFinite(value) && value >= 2000) {
    for (const fan of fanKeys()) fanCapDraft[fan] = value;
  }
  syncFanCapInput();
}

function setFanCapDraft(caps) {
  fanCapDraft = capMapFromSource(caps || {});
  syncFanCapInput();
}

function currentCapMap() {
  return capMapFromSource(fanCapDraft || {});
}

function capForFan(fan) {
  const cap = Math.round(+fanCapDraft?.[fan]);
  return Number.isFinite(cap) && cap >= 2000 ? cap : null;
}

function currentCap() {
  const values = capValues();
  if (!values.length) return null;
  return values[0];
}

// La curva guardada queda PRISTINA: el cap se aplica al escribir al hardware.
function updateCapPreview(options = {}) {
  const note = $('fan-cap-preview');
  const caps = currentCapMap();
  const hasCap = Object.keys(caps).length > 0;
  if (!fanCfg) return;
  updateFanCapPanelText();
  if (!options.skipEditor && !$('fan-cap-editor')?.classList.contains('hidden')) {
    renderFanCapEditor();
  }
  if (!hasCap) {
    note.textContent = t('fan.cap_none_note');
    updateFanAcousticNote();
    document.querySelectorAll('.curve-fan').forEach(updateFanCurveCard);
    return;
  }
  const parts = Object.keys(fanCfg.curves).map((fan) => {
    const cap = caps[fan];
    if (!cap) return t('fan.fan_no_cap', { fan: fanName(fan) });
    const pct = Math.round(capToPwm(cap, fan) / 255 * 100);
    return `${fanName(fan)} ${cap} RPM ≤${pct}%`;
  });
  note.textContent =
    t('fan.caps_active_pre') +
    parts.join(' · ') + (Object.keys(fanCfg.curves).some(fanCalibrated)
      ? t('fan.with_calib') : t('fan.estimated_suffix'));
  updateFanAcousticNote();
  document.querySelectorAll('.curve-fan').forEach(updateFanCurveCard);
}

function renderCurves() {
  $('fan-curves').innerHTML = Object.entries(fanCfg.curves).map(([fan, c]) => {
    const maxPwm = Math.max(...c.pwms);
    const maxRpm = pwmToRpm(maxPwm, fan);
    const dba = estimateFanDba(fan, maxRpm);
    return `
      <div class="curve-fan" data-fan="${fan}">
        <div class="fan-curve-head">
          <div>
            <h4>${fanName(fan)}</h4>
            <span>${fanCalibrated(fan) ? t('fan.max_measured') : t('fan.max_estimated')} ${fanMaxRpm(fan)} RPM</span>
          </div>
          <div class="fan-curve-metrics">
            <b class="fan-curve-rpm">${maxRpm} RPM</b>
            <b class="fan-curve-dba">${dba.toFixed(1)} dBA est.</b>
          </div>
        </div>
        <div class="fan-curve-graph">${renderFanCurveSvg(fan, c)}</div>
        <div class="curve-table">
          <span title="A esta temperatura…">°C</span>
          ${c.temps.map((v, i) => `<input type="number" min="0" max="105" data-kind="temps" data-i="${i}" value="${Math.min(105, v)}">`).join('')}
          <span title="…el ventilador gira a este porcentaje de su máximo">% vel</span>
          ${c.pwms.map((v, i) => `<input type="number" min="0" max="100" data-kind="pwms" data-i="${i}" value="${Math.round(v / 255 * 100)}">`).join('')}
        </div>
      </div>`;
  }).join('');
  document.querySelectorAll('.curve-fan input').forEach((input) => {
    input.addEventListener('input', () => {
      updateFanCurveCard(input.closest('.curve-fan'));
      markFanDirty();
    });
  });
  document.querySelectorAll('.curve-fan').forEach(attachFanGraphDrag);
}

function renderFanCurveSvg(fan, curve) {
  const temps = curve.temps || [];
  const pwms = curve.pwms || [];
  const points = temps.map((temp, i) => {
    const x = tempToGraphX(temp);
    const y = pwmToGraphY(pwms[i] || 0);
    return [x, y];
  });
  const poly = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const cap = capForFan(fan);
  const capPct = cap ? Math.min(100, capToPwm(cap, fan) / 255 * 100) : null;
  const capY = capPct === null ? null : FAN_GRAPH.yBottom - capPct / 100 * (FAN_GRAPH.yBottom - FAN_GRAPH.yTop);
  const pointEls = points.map(([x, y], i) =>
    `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" data-i="${i}"></circle>`).join('');
  const tempTicks = FAN_GRAPH.ticks.map((t) => {
    const x = tempToGraphX(t);
    return `<text x="${x}" y="232">${t}</text>`;
  }).join('');
  const speedTicks = [0, 25, 50, 75, 100].map((s) => {
    const y = FAN_GRAPH.yBottom - s / 100 * (FAN_GRAPH.yBottom - FAN_GRAPH.yTop);
    return `<text x="8" y="${y + 4}">${s}</text>`;
  }).join('');
  return `
    <svg viewBox="0 0 560 245" role="img" aria-label="Curva de ventilador ${fanName(fan)}">
      <g class="fan-grid">
        ${[0, 25, 50, 75, 100].map((s) => {
          const y = FAN_GRAPH.yBottom - s / 100 * (FAN_GRAPH.yBottom - FAN_GRAPH.yTop);
          return `<line x1="${FAN_GRAPH.x0}" y1="${y}" x2="${FAN_GRAPH.x1}" y2="${y}"></line>`;
        }).join('')}
        ${FAN_GRAPH.ticks.map((t) => {
          const x = tempToGraphX(t);
          return `<line x1="${x}" y1="${FAN_GRAPH.yTop}" x2="${x}" y2="${FAN_GRAPH.yBottom}"></line>`;
        }).join('')}
      </g>
      ${capY === null ? '' : `<line class="fan-cap-line" x1="${FAN_GRAPH.x0}" y1="${capY.toFixed(1)}" x2="${FAN_GRAPH.x1}" y2="${capY.toFixed(1)}"></line>`}
      <polyline class="fan-curve-line" points="${poly}"></polyline>
      <g class="fan-curve-points">${pointEls}</g>
      <g class="fan-axis">${tempTicks}${speedTicks}<text x="533" y="232">°C</text><text x="8" y="25">%</text></g>
    </svg>`;
}

function tempToGraphX(temp) {
  const t = Math.max(FAN_GRAPH.tempMin, Math.min(FAN_GRAPH.tempMax, Number(temp) || FAN_GRAPH.tempMin));
  return FAN_GRAPH.x0 + ((t - FAN_GRAPH.tempMin) / (FAN_GRAPH.tempMax - FAN_GRAPH.tempMin)) * (FAN_GRAPH.x1 - FAN_GRAPH.x0);
}

function pwmToGraphY(pwm) {
  const p = Math.max(0, Math.min(255, Number(pwm) || 0));
  return FAN_GRAPH.yBottom - (p / 255) * (FAN_GRAPH.yBottom - FAN_GRAPH.yTop);
}

function graphXToTemp(x, pointIndex, tempInputs) {
  const ratio = (x - FAN_GRAPH.x0) / (FAN_GRAPH.x1 - FAN_GRAPH.x0);
  let temp = Math.round(FAN_GRAPH.tempMin + ratio * (FAN_GRAPH.tempMax - FAN_GRAPH.tempMin));
  const prev = pointIndex > 0 ? Math.round(+tempInputs[pointIndex - 1].value) + 1 : FAN_GRAPH.tempMin;
  const next = pointIndex < tempInputs.length - 1 ? Math.round(+tempInputs[pointIndex + 1].value) - 1 : FAN_GRAPH.tempMax;
  return Math.max(prev, Math.min(next, temp));
}

function graphYToPercent(y) {
  const ratio = (FAN_GRAPH.yBottom - y) / (FAN_GRAPH.yBottom - FAN_GRAPH.yTop);
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

// Tooltip singleton para los puntos de las curvas (mismo gesto que el resto de
// la app: pasas el mouse y ves el valor). Muestra "°C / %vel" sobre el punto.
let fanPointTip = null;
function fanTooltipEl() {
  if (!fanPointTip) {
    fanPointTip = document.createElement('div');
    fanPointTip.className = 'fan-curve-tooltip hidden';
    document.body.appendChild(fanPointTip);
  }
  return fanPointTip;
}
function showFanPointTip(clientX, clientY, temp, pct) {
  const el = fanTooltipEl();
  el.textContent = `${temp}°C · ${pct}%`;
  el.style.left = `${clientX}px`;
  el.style.top = `${clientY - 34}px`;
  el.classList.remove('hidden');
}
function hideFanPointTip() {
  if (fanPointTip) fanPointTip.classList.add('hidden');
}

function attachFanGraphDrag(box) {
  const graph = box.querySelector('.fan-curve-graph');
  if (!graph) return;

  // Hover: al pasar el mouse por un punto (sin arrastrar) se ve su valor.
  graph.addEventListener('pointermove', (event) => {
    if (box.classList.contains('dragging')) return;
    const point = event.target.closest('circle[data-i]');
    if (!point) { hideFanPointTip(); return; }
    const i = Number(point.dataset.i);
    const temps = [...box.querySelectorAll('input[data-kind="temps"]')];
    const pwms = [...box.querySelectorAll('input[data-kind="pwms"]')];
    showFanPointTip(event.clientX, event.clientY,
      Math.round(+temps[i].value), Math.round(+pwms[i].value));
  });
  graph.addEventListener('pointerleave', hideFanPointTip);

  graph.addEventListener('pointerdown', (event) => {
    const point = event.target.closest('circle[data-i]');
    if (!point) return;
    event.preventDefault();
    const pointIndex = Number(point.dataset.i);
    const tempInputs = [...box.querySelectorAll('input[data-kind="temps"]')];
    const pwmInputs = [...box.querySelectorAll('input[data-kind="pwms"]')];
    box.classList.add('dragging');

    const move = (moveEvent) => {
      const svg = graph.querySelector('svg');
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = ((moveEvent.clientX - rect.left) / Math.max(1, rect.width)) * 560;
      const y = ((moveEvent.clientY - rect.top) / Math.max(1, rect.height)) * 245;
      tempInputs[pointIndex].value = graphXToTemp(x, pointIndex, tempInputs);
      pwmInputs[pointIndex].value = graphYToPercent(y);
      updateFanCurveCard(box);
      // Tooltip vivo mientras arrastras: ves el °C/% exacto del punto.
      showFanPointTip(moveEvent.clientX, moveEvent.clientY,
        Math.round(+tempInputs[pointIndex].value),
        Math.round(+pwmInputs[pointIndex].value));
      markFanDirty();
    };
    const up = () => {
      box.classList.remove('dragging');
      hideFanPointTip();
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    move(event);
  });
}

// Marca el PERFIL ACTUAL como "con cambios sin aplicar". El aviso sticky lleva
// al botón GUARDAR Y APLICAR, que persiste TODOS los perfiles editados a la vez.
function markFanDirty() {
  if (fanEditingProfile) fanDirtyProfiles.add(fanEditingProfile);
  refreshFanDirtyBanner();
}
function refreshFanDirtyBanner() {
  $('fan-dirty-banner')?.classList.toggle('hidden', fanDirtyProfiles.size === 0);
}
function clearFanDirty() {
  fanDirtyProfiles.clear();
  $('fan-dirty-banner')?.classList.add('hidden');
}

// Guarda en la caché lo que hay AHORA en el formulario (curvas + cap) para el
// perfil en edición, de modo que cambiar de pestaña no pierda lo editado.
function stageCurrentFan() {
  const cached = fanCfgByProfile[fanEditingProfile];
  if (!cached) return;
  cached.curves = readCurvesFromForm();
  cached.cap = currentCapMap();
}

function singleCurveFromBox(box) {
  const curve = { temps: Array(8).fill(0), pwms: Array(8).fill(0) };
  box.querySelectorAll('input').forEach((inp) => {
    const raw = Math.round(+inp.value);
    curve[inp.dataset.kind][+inp.dataset.i] =
      inp.dataset.kind === 'pwms'
        ? Math.round(Math.max(0, Math.min(100, raw)) * 255 / 100)
        : Math.max(0, Math.min(105, raw));
  });
  return curve;
}

function updateFanCurveCard(box) {
  if (!box) return;
  const fan = box.dataset.fan;
  const curve = singleCurveFromBox(box);
  const maxPwm = Math.max(...curve.pwms);
  const maxRpm = pwmToRpm(maxPwm, fan);
  const dba = estimateFanDba(fan, maxRpm);
  const graph = box.querySelector('.fan-curve-graph');
  if (graph) graph.innerHTML = renderFanCurveSvg(fan, curve);
  const rpm = box.querySelector('.fan-curve-rpm');
  const noise = box.querySelector('.fan-curve-dba');
  if (rpm) rpm.textContent = `${maxRpm} RPM`;
  if (noise) noise.textContent = `${dba.toFixed(1)} dBA est.`;
  updateFanAcousticNote();
}

function updateFanAcousticNote() {
  const note = $('fan-acoustic-note');
  if (!note || !fanCfg) return;
  const hasForm = document.querySelectorAll('.curve-fan').length > 0;
  const curves = hasForm ? readCurvesFromForm() : fanCfg.curves;
  const dbas = Object.entries(curves).map(([fan, curve]) => {
    const maxCurvePwm = Math.max(...curve.pwms);
    const cap = capForFan(fan);
    const effectivePwm = cap ? Math.min(maxCurvePwm, capToPwm(cap, fan)) : maxCurvePwm;
    return estimateFanDba(fan, pwmToRpm(effectivePwm, fan));
  });
  const total = combinedDba(dbas);
  note.textContent = total === null
    ? 'Acústica: sin estimación disponible.'
    : `Acústica estimada del perfil editado: ${total.toFixed(1)} dBA. Si el firmware expone un sensor real de ruido, esta lectura puede reemplazar la estimación.`;
}

function readCurvesFromForm() {
  const curves = {};
  document.querySelectorAll('.curve-fan').forEach((box) => {
    const fan = box.dataset.fan;
    curves[fan] = { temps: Array(8).fill(0), pwms: Array(8).fill(0) };
    box.querySelectorAll('input').forEach((inp) => {
      const raw = Math.round(+inp.value);
      curves[fan][inp.dataset.kind][+inp.dataset.i] =
        inp.dataset.kind === 'pwms'
          ? Math.round(Math.max(0, Math.min(100, raw)) * 255 / 100)
          : Math.max(0, Math.min(105, raw));
    });
  });
  return curves;
}

function fanMaxSummary() {
  if (!fanCfg) return '';
  return Object.keys(fanCfg.curves)
    .map((fan) => `${fanName(fan)} ${fanMaxRpm(fan)}`).join(' · ');
}

function refreshFanNotes() {
  const calibrated = Object.keys(fanCfg.curves).some(fanCalibrated);
  const editLabel = fanProfileLabel(fanEditingProfile);
  $('fan-max-note').textContent =
    `Curvas ${fanCfg.source} (perfil ${editLabel}). ` +
    `Máximos ${calibrated ? 'medidos ✓' : 'ESTIMADOS (sin medir)'}: ` +
    `${fanMaxSummary()} RPM · ${Object.keys(fanCfg.curves).length} ventiladores detectados.`;
  $('fan-calib-banner').classList.toggle('hidden', calibrated);
  $('fan-benchmark').classList.toggle('attention', !calibrated);
  updateCapPreview();
}

/* Carga fanCfg para el perfil dado y actualiza el formulario */
async function loadFanProfile(profile) {
  profile = normalizeFanProfile(profile);
  // Usar caché si ya se cargó y no cambió calibración
  let res = fanCfgByProfile[profile];
  if (!res) {
    res = await window.rog.getFanConfig(profile);
    if (!res.ok) { toast(res.err); return false; }
    fanCfgByProfile[profile] = res;
  }
  fanCfg = res;
  fanEditingProfile = profile;
  // Sincronizar etiquetas
  const editLabel = fanProfileLabel(profile);
  $('fan-editing-label').textContent = editLabel;
  if ($('fan-cap-label')) $('fan-cap-label').textContent = editLabel;
  // Indicador si es el perfil activo del sistema
  const isActive = profile === fanActiveProfile;
  const indicator = $('fan-active-indicator');
  if (indicator) indicator.classList.toggle('hidden', !isActive);
  setFanCapDraft(res.cap || {});
  // Resaltar tab activa
  document.querySelectorAll('.fan-ptab').forEach((t) => {
    const tabProfile = t.dataset.pfan;
    t.classList.toggle('active', tabProfile === profile);
  });
  renderCurves();
  refreshFanNotes();
  refreshFanDirtyBanner();   // mantiene el aviso si OTRO perfil sigue con cambios
  return true;
}

/* Abrir el modal de ventiladores: siempre carga los 3 perfiles en caché */
$('fans-block').addEventListener('click', async () => {
  const sysProfile = lastStats?.ppd_profile || lastStats?.asus_profile;
  if (!sysProfile) { toast(t('toast.profile_unknown')); return; }
  fanActiveProfile = normalizeFanProfile(sysProfile);
  $('fan-profile').textContent = fanProfileLabel(fanActiveProfile);
  // Elegir qué perfil mostrar primero: el perfil de energía real, no platform_profile.
  const startProfile = fanActiveProfile;
  // Invalidar caché para asegurar datos frescos al abrir el modal
  Object.keys(fanCfgByProfile).forEach((k) => delete fanCfgByProfile[k]);
  const ok = await loadFanProfile(startProfile);
  if (!ok) return;
  // Mostrar la ruta con ~ en vez del home absoluto (privacidad + repo público).
  if (fanCfg?.path) {
    $('fan-script-path').textContent = String(fanCfg.path)
      .replace(/^\/home\/[^/]+\//, '~/')
      .replace(/^\/root\//, '~/');
  }
  $('fan-modal').classList.remove('hidden');
});

/* Selector de perfil: tabs AHORRO / BALANCED / PERFORMANCE */
$('fan-profile-tabs').addEventListener('click', async (e) => {
  const tab = e.target.closest('.fan-ptab');
  if (!tab) return;
  const profile = tab.dataset.pfan;
  if (profile === fanEditingProfile) return; // ya estamos aquí
  stageCurrentFan();   // no perder lo editado en este perfil al cambiar de pestaña
  await loadFanProfile(profile);
});

$('fan-cap-adjust').addEventListener('click', () => {
  const editor = $('fan-cap-editor');
  const opening = editor.classList.contains('hidden');
  editor.classList.toggle('hidden', !opening);
  if (opening) {
    renderFanCapEditor();
    $('fan-cap')?.focus();
  }
});

$('fan-close').addEventListener('click', () => $('fan-modal').classList.add('hidden'));
$('fan-modal').addEventListener('click', (e) => {
  if (e.target === $('fan-modal')) $('fan-modal').classList.add('hidden');
});

$('fan-cap').addEventListener('input', () => {
  setFanCapAll($('fan-cap').value);
  updateCapPreview();
  markFanDirty();
});
$('fan-clear-cap').addEventListener('click', () => {
  setFanCapDraft({});
  updateCapPreview();
  markFanDirty();
  toast(t('toast.cap_removed'));
});

// "Ir a guardar": lleva el foco/scroll al botón GUARDAR Y APLICAR (abajo).
$('fan-dirty-jump').addEventListener('click', () => {
  $('fan-save')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('fan-save')?.classList.add('pulse');
  setTimeout(() => $('fan-save')?.classList.remove('pulse'), 1200);
});

$('fan-benchmark').addEventListener('click', async () => {
  if (!window.confirm(
    'Calibrar ventiladores (medir máximos reales):\n\n' +
    'Los ventiladores pasarán por 7 velocidades (1-3 min: espera a que\n' +
    'estabilicen en cada una, va a sonar fuerte) midiendo sus RPM reales.\n' +
    'Con esa tabla el tope de RPM cae exacto. Al terminar se restaura solo.\n' +
    'Pedirá tu contraseña.\n\n¿Continuar?')) return;
  toast(t('toast.calibrating'));
  const res = await window.rog.fanBenchmark();
  if (!res.ok) { toast(`No se pudo: ${res.err}`); return; }
  fanCfg.max_rpm = res.max;
  fanCfg.calibration = res.calibration;
  // Propagar calibración a todos los perfiles en caché
  Object.values(fanCfgByProfile).forEach((c) => {
    c.max_rpm = res.max;
    c.calibration = res.calibration;
  });
  renderCurves();
  refreshFanNotes();
  toast(`Calibración lista ✓ Máximos reales: ${fanMaxSummary()} RPM`);
});

$('fan-save').addEventListener('click', async () => {
  stageCurrentFan();   // volcar lo que hay en el formulario a la caché del perfil
  // Perfiles a guardar: todos los editados; si no hubo cambios, al menos el actual.
  const profiles = fanDirtyProfiles.size
    ? [...fanDirtyProfiles]
    : [fanEditingProfile];

  // Consentimiento: ventiladores muy lentos en los puntos calientes son peligrosos.
  // Se revisa CADA perfil que se va a guardar (no solo el visible).
  const riskyLabels = [];
  for (const p of profiles) {
    const curves = fanCfgByProfile[p]?.curves || {};
    const caps = fanCfgByProfile[p]?.cap || {};
    const risky = Object.entries(curves).some(([fan, c]) => {
      const limit = caps[fan] ? capToPwm(caps[fan], fan) : 255;
      return Math.min(c.pwms[6], limit) < 150 || Math.min(c.pwms[7], limit) < 150;
    });
    if (risky) riskyLabels.push(fanProfileLabel(p));
  }
  if (riskyLabels.length && !window.confirm(
    'ADVERTENCIA: dejaste los ventiladores por debajo del 60% en los puntos ' +
    'más calientes en: ' + riskyLabels.join(', ') + '.\n\n' +
    'Esto puede sobrecalentar y dañar tu equipo bajo carga.\n\n' +
    '¿Entiendes el riesgo y quieres continuar?')) return;

  // Un solo guardado (un solo pkexec) con todos los perfiles editados, cada
  // uno con su propio tope independiente.
  const payload = profiles.map((p) => ({
    profile: p,
    curves: fanCfgByProfile[p]?.curves || {},
    capByFan: fanCfgByProfile[p]?.cap || {},
  }));
  const res = await window.rog.setFanConfigMulti({ profiles: payload });
  if (!res.ok) { toast(`Error: ${res.err}`); return; }

  $('fan-modal').classList.add('hidden');
  clearFanDirty();
  const labels = profiles.map(fanProfileLabel).join(', ');
  toast(res.warn ? res.warn
    : `Guardado ✓ ${labels} — cada perfil con su propio tope (persiste al reiniciar).`);
});

/* ---------- config export / import ---------- */

$('config-export').addEventListener('click', async () => {
  const res = await window.rog.exportConfig();
  toast(res.ok
    ? `Configuración exportada a ${res.path}\n(${res.items.join(', ')})`
    : (res.err === 'cancelado' ? 'Exportación cancelada' : `No se exportó: ${res.err}`));
});

$('config-import').addEventListener('click', async () => {
  if (!window.confirm(
    'Importar una configuración reemplaza tus curvas, cap, calibración, perfiles ' +
    'Aura y umbrales actuales (se guarda un respaldo .pre-import).\n\n¿Continuar?')) return;
  const res = await window.rog.importConfig();
  if (!res.ok) {
    toast(res.err === 'cancelado' ? 'Importación cancelada' : `No se importó: ${res.err}`);
    return;
  }
  toast(`Importado: ${res.items.join(', ')} ✓\nAbre VENTILADORES → GUARDAR Y APLICAR para mandar las curvas al sistema.`);
  $('fan-modal').classList.add('hidden');
  await refreshAuraState(true);
});

/* ---------- gaming overlay ---------- */

const overlayPrefs = JSON.parse(localStorage.getItem('overlayPrefs') || 'null')
  || { enabled: false, displayId: null, corner: 'top-center', layout: 'row' };
// qué muestra el overlay (personalizable desde el modal)
overlayPrefs.show = { cpu: true, gpu: true, fans: true, ...(overlayPrefs.show || {}) };
if (!overlayPrefs.layout) overlayPrefs.layout = 'row';
if (!overlayPrefs.corner) overlayPrefs.corner = 'top-center';

function saveOverlayPrefs() {
  try { localStorage.setItem('overlayPrefs', JSON.stringify(overlayPrefs)); } catch (_) {}
}

async function pushOverlay() {
  // El overlay sigue el acento del tema activo.
  overlayPrefs.accent = cssVar('--accent');
  const res = await window.rog.setOverlay(overlayPrefs);
  if (!res.ok) toast(t('toast.overlay_failed'));
}

async function openOverlayModal() {
  const res = await window.rog.listDisplays();
  const sel = $('overlay-display');
  if (res.ok) {
    sel.innerHTML = res.displays.map((d) =>
      `<option value="${d.id}">${d.label}</option>`).join('');
    // default to the primary display the first time
    if (overlayPrefs.displayId == null) {
      overlayPrefs.displayId = (res.displays.find((d) => d.primary) || res.displays[0])?.id ?? null;
    }
    if (overlayPrefs.displayId != null) sel.value = String(overlayPrefs.displayId);
  }
  $('overlay-enabled').checked = !!overlayPrefs.enabled;
  $('overlay-corner').value = overlayPrefs.corner;
  if ($('overlay-layout')) $('overlay-layout').value = overlayPrefs.layout || 'row';
  $('ov-show-cpu').checked = overlayPrefs.show.cpu !== false;
  $('ov-show-gpu').checked = overlayPrefs.show.gpu !== false;
  $('ov-show-fans').checked = overlayPrefs.show.fans !== false;
  const fps = await window.rog.getFpsLogging();
  $('fps-logging').checked = !!fps.enabled;
  $('fps-logging').disabled = !fps.mangohud;
  if (!fps.mangohud) {
    $('fps-note').textContent = 'MangoHud no está instalado, así que no hay FPS disponibles.';
  }
  $('overlay-modal').classList.remove('hidden');
}

$('overlay-btn').addEventListener('click', openOverlayModal);
$('overlay-close').addEventListener('click', () => $('overlay-modal').classList.add('hidden'));
$('overlay-modal').addEventListener('click', (e) => {
  if (e.target === $('overlay-modal')) $('overlay-modal').classList.add('hidden');
});
$('overlay-enabled').addEventListener('change', (e) => {
  overlayPrefs.enabled = e.target.checked;
  saveOverlayPrefs();
  pushOverlay();
});
$('overlay-display').addEventListener('change', (e) => {
  overlayPrefs.displayId = Number(e.target.value);
  saveOverlayPrefs();
  pushOverlay();
});
$('overlay-corner').addEventListener('change', (e) => {
  overlayPrefs.corner = e.target.value;
  saveOverlayPrefs();
  pushOverlay();
});
$('overlay-layout').addEventListener('change', (e) => {
  overlayPrefs.layout = e.target.value;
  saveOverlayPrefs();
  pushOverlay();
});
['cpu', 'gpu', 'fans'].forEach((part) => {
  $(`ov-show-${part}`).addEventListener('change', (e) => {
    overlayPrefs.show[part] = e.target.checked;
    saveOverlayPrefs();
    pushOverlay();
  });
});
$('fps-logging').addEventListener('change', async (e) => {
  const res = await window.rog.setFpsLogging(e.target.checked);
  if (!res.ok) {
    e.target.checked = !e.target.checked;
    toast(`FPS: ${res.err}`);
    return;
  }
  toast(res.enabled
    ? 'Registro de FPS activado: lanza el juego con MangoHud y el overlay los mostrará.'
    : 'Registro de FPS desactivado.');
});

// restore the overlay on launch if it was on
if (overlayPrefs.enabled) {
  window.addEventListener('DOMContentLoaded', pushOverlay);
  pushOverlay();
}

// game session (v11): game-session.js loads after app.js, so init on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  window.RogGameSession && window.RogGameSession.init();
});

/* ---------- report issue ---------- */

$('report-btn').addEventListener('click', async () => {
  const s = lastStats || {};
  const body = [
    '**Describe el problema:**', '', '_(escribe aquí)_', '',
    '---', '**Información del sistema (autogenerada):**',
    `- ROG Monitor: v${s.version || '?'}`,
    `- CPU: ${s.cpu?.model || '?'}`,
    `- GPU: ${s.gpu?.active?.name || 'N/A'} (modo ${s.gpu?.mode || '?'})`,
    `- Perfil: ${s.asus_profile || '?'} / ${s.ppd_profile || '?'}`,
  ].join('\n');
  const res = await window.rog.reportIssue(body);
  toast(res.ok
    ? `Abriendo GitHub para crear el issue… TXT local: ${res.logPath || 'generado'}`
    : `No se pudo: ${res.err}`);
});

/* ---------- RAM detail ---------- */

$('ram-meter').addEventListener('click', () => {
  const procs = lastStats?.procs_mem || [];
  $('ram-procs-body').innerHTML = procs.map((p) => `
    <tr data-pid="${p.pid}" data-name="${p.name}" title="Clic para cerrar ${p.name}">
      <td class="pid">${p.pid}</td><td>${p.name}</td>
      <td class="mem">${(p.mem_mb / 1024).toFixed(2)} GB</td></tr>`).join('');
  $('ram-modal').classList.remove('hidden');
});
$('ram-close').addEventListener('click', () => $('ram-modal').classList.add('hidden'));
$('ram-modal').addEventListener('click', (e) => {
  if (e.target === $('ram-modal')) $('ram-modal').classList.add('hidden');
});
$('ram-procs-body').addEventListener('click', async (e) => {
  const row = e.target.closest('tr[data-pid]');
  if (!row) return;
  const { pid, name } = row.dataset;
  if (!window.confirm(`¿Cerrar "${name}" (PID ${pid})? Perderás lo no guardado en esa app.`)) return;
  const res = await window.rog.killProcess(pid);
  toast(res.ok ? `Señal de cierre enviada a ${name}` : `No se pudo: ${res.err}`);
});

/* ---------- disk health ---------- */

$('disk-health-btn').addEventListener('click', async () => {
  toast(t('toast.reading_smart'));
  const res = await window.rog.diskHealth();
  const out = $('disk-health-out');
  if (!res.ok) { toast(`No se pudo: ${res.err}`); return; }
  out.innerHTML = res.disks.map((d) =>
    `<b>${d.device}</b><br>${d.info.join('<br>') || 'sin datos SMART'}`).join('<br><br>');
  out.classList.remove('hidden');
});

/* ---------- draggable modals ---------- */

// Arrastra la tarjeta del modal desde su título — útil para correr la
// ventana del benchmark y ver los sensores debajo mientras trabaja.
function makeDraggable(modalId) {
  const modal = $(modalId);
  const card = modal.querySelector('.modal-card');
  const handle = card.querySelector('h3');
  handle.classList.add('drag-handle');
  let startX = 0, startY = 0, baseLeft = 0, baseTop = 0;
  const onMove = (e) => {
    card.style.left = `${baseLeft + e.clientX - startX}px`;
    card.style.top = `${baseTop + e.clientY - startY}px`;
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  handle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const rect = card.getBoundingClientRect();
    card.classList.add('dragged');
    card.style.left = `${rect.left}px`;
    card.style.top = `${rect.top}px`;
    baseLeft = rect.left; baseTop = rect.top;
    startX = e.clientX; startY = e.clientY;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
  });
  // al cerrar/reabrir vuelve centrado
  const observer = new MutationObserver(() => {
    if (modal.classList.contains('hidden')) {
      card.classList.remove('dragged');
      card.style.left = card.style.top = '';
    }
  });
  observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
}

['benchmark-modal', 'fan-modal', 'alerts-modal', 'overlay-modal'].forEach(makeDraggable);

/* ---------- thermal benchmarks ---------- */

function openBenchmarkModal() {
  $('benchmark-modal').classList.remove('hidden');
}

function closeBenchmarkModal() {
  $('benchmark-modal').classList.add('hidden');
}

async function runBenchmark(kind) {
  if (benchBusy) return;
  const warning = kind === 'cpu'
    ? 'La CPU se irá al 100% durante 45 segundos. Puede subir bastante la temperatura. ¿Continuar?'
    : 'La GPU se pondrá al máximo durante 45 segundos (se abrirán varias ventanas de carga que se cierran al terminar). Va a subir la temperatura. ¿Continuar?';
  if (!window.confirm(warning)) return;
  benchBusy = true;
  $('bench-status').textContent = `Corriendo benchmark ${kind.toUpperCase()}…`;
  $('bench-output').textContent = 'Tomando muestras térmicas…';
  const res = kind === 'cpu'
    ? await window.rog.cpuBenchmark(45)
    : await window.rog.gpuBenchmark(45);
  benchBusy = false;
  benchmarkResult = res;
  $('bench-status').textContent = res.ok
    ? `${kind.toUpperCase()} terminado.`
    : `Benchmark ${kind.toUpperCase()} no disponible.`;
  $('bench-output').textContent = benchmarkSummaryText(res);
  if (res.ok) {
    pushBenchmarkHistory(res);
    toast(`Benchmark ${kind.toUpperCase()} terminado ✓`);
  } else {
    toast(res.err || `Benchmark ${kind.toUpperCase()} falló`);
  }
}

$('benchmark-btn').addEventListener('click', openBenchmarkModal);
$('bench-run-cpu-quick').addEventListener('click', () => {
  openBenchmarkModal();
  runBenchmark('cpu');
});
$('bench-run-gpu-quick').addEventListener('click', () => {
  openBenchmarkModal();
  runBenchmark('gpu');
});
$('benchmark-close').addEventListener('click', closeBenchmarkModal);
$('benchmark-modal').addEventListener('click', (e) => {
  if (e.target === $('benchmark-modal')) closeBenchmarkModal();
});
$('bench-cpu').addEventListener('click', () => runBenchmark('cpu'));
$('bench-gpu').addEventListener('click', () => runBenchmark('gpu'));
$('bench-export').addEventListener('click', async () => {
  if (!benchmarkResult) { toast(t('toast.no_bench_export')); return; }
  const text = JSON.stringify(benchmarkResult, null, 2);
  const res = await window.rog.exportBenchmark({ kind: benchmarkResult.kind, text });
  toast(res.ok ? `Benchmark guardado en ${res.path}` : `No se exportó: ${res.err}`);
});

/* ---------- size / zoom persistence ---------- */

const savedZoom = parseFloat(localStorage.getItem('zoomLevel') || '0');
if (savedZoom) window.rog.zoomTo(savedZoom);
document.querySelectorAll('#size-seg button').forEach((btn) => {
  btn.addEventListener('click', () => {
    window.rog.zoomTo(parseFloat(btn.dataset.zoom));
    toast(t('toast.size_applied'));
  });
});

/* ---------- sesión de juego integrada en bench-block (Task 4) ---------- */
// game-session.js añade su botón a la topbar (#game-session-btn). Ocultamos ese
// botón sobrante via CSS (extras.css) y re-exponemos la función desde el bloque
// de Benchmarks (#bench-game-session-btn, en index.html).
(function wireBenchGameSessionBtn() {
  function tryWire() {
    const btn = document.getElementById('bench-game-session-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      // Delegar al botón original de game-session.js (display:none pero funcional).
      // Esto asegura que la lógica interna de game-session.js (crear modal, render,
      // estado de la sesión) se ejecuta correctamente.
      const topBtn = document.getElementById('game-session-btn');
      if (topBtn) {
        topBtn.click();
      } else {
        // Si el botón aún no fue inyectado, abrir el modal directamente
        const gsModal = document.getElementById('game-session-modal');
        if (gsModal) gsModal.classList.remove('hidden');
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryWire);
  } else {
    tryWire();
  }
})();

/* ---------- enlace NÚCLEOS dentro del panel de procesos ---------- */
// El botón #procs-cores-btn (en el h2 del bloque procs) abre el modal de núcleos.
// Esto evita tener un botón suelto extra en la topbar: la conciencia por núcleo
// vive dentro del contexto de Procesos, que es donde tiene sentido (Task 3+4).
(function wireProcsCoreBtns() {
  function tryWire() {
    const btn = document.getElementById('procs-cores-btn');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // cores.js expone window.RogCores.open() cuando está listo
      if (window.RogCores && typeof window.RogCores.open === 'function') {
        window.RogCores.open();
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryWire);
  } else {
    tryWire();
  }
})();

/* ---------- VER TODOS los procesos (modal ampliado) ---------- */
(function wireAllProcs() {
  const modal = $('allprocs-modal');
  if (!modal) return;
  const body = $('allprocs-body');
  const filterEl = $('allprocs-filter');
  const countEl = $('allprocs-count');
  let allRows = [];
  let timer = null;
  let sortKey = 'cpu';   // por defecto: mayor uso de CPU primero
  let sortDir = 'desc';

  function sortRows(rows) {
    const dir = sortDir === 'asc' ? 1 : -1;
    return rows.slice().sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (sortKey === 'name') {
        return String(av).localeCompare(String(bv)) * dir;
      }
      av = av == null ? -Infinity : av;
      bv = bv == null ? -Infinity : bv;
      if (av === bv) return (b.cpu || 0) - (a.cpu || 0); // desempate estable por CPU
      return (av - bv) * dir;
    });
  }

  function updateSortIndicators() {
    modal.querySelectorAll('#allprocs th.sortable').forEach((th) => {
      const active = th.dataset.sort === sortKey;
      th.classList.toggle('sort-active', active);
      th.dataset.dir = active ? sortDir : '';
    });
  }

  function rowHtml(p) {
    const core = p.cpu_core != null
      ? `<span class="procs-core">${p.cpu_core.toFixed(0)}%</span>`
      : '<span class="dim">—</span>';
    return `<tr data-pid="${p.pid}" data-name="${escapeHtml(p.name)}" title="${t('procs.kill', { name: p.name })}">
        <td class="pid">${p.pid}</td><td>${escapeHtml(p.name)}</td>
        <td class="cpu r">${p.cpu.toFixed(1)}%</td>
        <td class="cpu-core r">${core}</td>
        <td class="mem r">${p.mem_mb} MB</td></tr>`;
  }

  function render() {
    const q = (filterEl.value || '').trim().toLowerCase();
    let rows = q
      ? allRows.filter((p) => p.name.toLowerCase().includes(q) || String(p.pid).includes(q))
      : allRows;
    rows = sortRows(rows);
    body.innerHTML = rows.length
      ? rows.map(rowHtml).join('')
      : `<tr><td colspan="5" class="dim">${t('procs.all_none')}</td></tr>`;
    countEl.textContent = t('procs.all_count', { shown: rows.length, total: allRows.length });
    updateSortIndicators();
  }

  async function refresh() {
    const res = await window.rog.listAllProcs();
    if (res && res.ok !== false && Array.isArray(res.procs)) {
      allRows = res.procs;
      render();
    } else if (!allRows.length) {
      body.innerHTML = `<tr><td colspan="5" class="dim">${escapeHtml((res && res.err) || 'sin datos')}</td></tr>`;
    }
  }

  function open() {
    modal.classList.remove('hidden');
    body.innerHTML = `<tr><td colspan="5" class="dim">${t('procs.all_loading')}</td></tr>`;
    countEl.textContent = '';
    refresh();
    // refresco en vivo mientras el modal está abierto (cada 3 s)
    clearInterval(timer);
    timer = setInterval(() => {
      if (!modal.classList.contains('hidden') && !document.hidden) refresh();
    }, 3000);
  }

  function close() {
    modal.classList.add('hidden');
    clearInterval(timer);
    timer = null;
  }

  const btn = $('procs-all-btn');
  if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); open(); });
  $('allprocs-close').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) close();
  });
  filterEl.addEventListener('input', render);

  // Ordenar al hacer clic en la cabecera: 1er clic = mayor→menor (texto: A→Z),
  // 2º clic en la misma columna invierte el sentido.
  modal.querySelectorAll('#allprocs th.sortable').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (sortKey === key) {
        sortDir = sortDir === 'desc' ? 'asc' : 'desc';
      } else {
        sortKey = key;
        sortDir = key === 'name' ? 'asc' : 'desc';
      }
      render();
    });
  });

  body.addEventListener('click', async (e) => {
    const row = e.target.closest('tr[data-pid]');
    if (!row) return;
    const { pid, name } = row.dataset;
    if (!window.confirm(
      `¿Cerrar el proceso "${name}" (PID ${pid})?\n\n` +
      'Se le pedirá terminar de forma ordenada (SIGTERM). ' +
      'Si es una app, perderás lo que no hayas guardado en ella.')) return;
    const res = await window.rog.killProcess(pid);
    toast(res.ok ? `Señal de cierre enviada a ${name}` : `No se pudo: ${res.err}`);
    if (res.ok) { allRows = allRows.filter((p) => String(p.pid) !== String(pid)); render(); }
  });
})();

/* ---------- export events ---------- */

$('export-events').addEventListener('click', async (e) => {
  e.stopPropagation();
  const events = lastStats?.events || [];
  if (!events.length) { toast(t('toast.no_events_export')); return; }
  const today = new Date().toLocaleDateString();
  const text = `ROG Monitor — registro de eventos (${today})\n\n`
    + events.map(([ts, level, msg]) => `${ts}  [${level.toUpperCase()}]  ${msg}`).join('\n') + '\n';
  const res = await window.rog.exportEvents(text);
  toast(res.ok ? `Eventos guardados en ${res.path}` : `No se exportó: ${res.err}`);
});
