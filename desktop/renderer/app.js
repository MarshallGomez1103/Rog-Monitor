/* ROG Monitor desktop renderer. Receives one stats object per second. */

const $ = (id) => document.getElementById(id);

let lastStats = null;
let gpuBusy = false;

/* ---------- themes ---------- */

const THEMES = [
  // id, name, description, [dark bg, dark accent], [light bg, light accent]
  ['magma',   'Magma',   'Rojo volcánico — firma ROG',     ['#140d0b', '#f25c3d'], ['#fbf2ec', '#c44a26']],
  ['nebula',  'Nébula',  'Violeta espacial con magenta',   ['#120c1c', '#b07af5'], ['#f6f2fb', '#7b3fd4']],
  ['oceano',  'Océano',  'Teal profundo, calmado',         ['#0a1416', '#2fbfb0'], ['#eef7f6', '#0f8a7d']],
  ['glaciar', 'Glaciar', 'Azul hielo sobre azul noche',    ['#0d1420', '#6fb7ff'], ['#f0f5fb', '#2670c2']],
  ['reactor', 'Reactor', 'Verde fosforescente de máquina', ['#070d07', '#46e873'], ['#f0f8f0', '#1c8a3f']],
  ['grafito', 'Grafito', 'Escala de grises, sin ruido',    ['#101113', '#c8cdd4'], ['#f5f6f7', '#3c4248']],
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

function drawChart(canvas, values, color) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = cssVar('--hair');
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (h / 4) * i);
    ctx.lineTo(w, (h / 4) * i);
    ctx.stroke();
  }

  if (!values || values.length < 2) return;
  const data = values.slice(-Math.max(60, Math.floor(w / 4)));
  // snap the axis to steps of 5 so min/max don't jitter every second
  let lo = Math.floor(Math.min(...data) / 5) * 5;
  let hi = Math.ceil(Math.max(...data) / 5) * 5;
  if (hi - lo < 10) { hi = lo + 10; }
  const pad = 8;
  const x = (i) => (i / (data.length - 1)) * w;
  const y = (v) => h - pad - ((v - lo) / (hi - lo)) * (h - pad * 2);

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, color + '55');
  grad.addColorStop(1, color + '00');
  ctx.beginPath();
  ctx.moveTo(0, h);
  data.forEach((v, i) => ctx.lineTo(x(i), y(v)));
  ctx.lineTo(w, h);
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
  ctx.fillText(lo.toFixed(0), 22, h - 3);
  const last = data[data.length - 1];
  ctx.fillStyle = color;
  ctx.font = 'bold 13px monospace';
  ctx.fillText(last.toFixed(1), w - 6, 14);
  ctx.textAlign = 'left';
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

/* ---------- main update ---------- */

const LAMP_STATES = [
  ['cold', 'FRÍO'], ['normal', 'NORMAL'], ['hot', 'CALIENTE'], ['critical', 'CRÍTICO'],
];

function update(stats) {
  lastStats = stats;
  const cpu = stats.cpu || {};
  const limits = stats.limits || {};

  /* lamp */
  const lamp = $('thermal-lamp');
  const cls = tempClass(cpu.avg, limits.cpu).replace('t-', '') || '';
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
    $('pending-mode').textContent = gpu.pending;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }

  /* segmented controls */
  document.querySelectorAll('#profile-seg button').forEach((b) =>
    b.classList.toggle('active', b.dataset.profile === stats.ppd_profile));
  document.querySelectorAll('#gpu-seg button').forEach((b) => {
    b.classList.toggle('active', b.dataset.gpu === gpu.mode);
    b.classList.toggle('busy', gpuBusy);
  });

  /* fans */
  renderFans(stats.fans || []);

  /* charts */
  const series = stats.series || {};
  drawChart($('chart-cpu'), series.cpu_temp, cssVar('--cold'));
  drawChart($('chart-gpu'), series.gpu_temp, cssVar('--okstate'));
  drawChart($('chart-power'), series.cpu_power, cssVar('--accent'));
  drawChart($('chart-gpu-power'), series.gpu_power, cssVar('--hot'));

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

  /* processes */
  $('procs-body').innerHTML = (stats.procs || []).map((p) => `
    <tr data-pid="${p.pid}" data-name="${p.name}" title="Clic para cerrar ${p.name}">
        <td class="pid">${p.pid}</td><td>${p.name}</td>
        <td class="cpu">${p.cpu.toFixed(1)}%</td><td class="mem">${p.mem_mb} MB</td></tr>`).join('');

  $('backend-state').textContent =
    `sensores OK · core v${stats.version || '?'} · ${new Date().toLocaleTimeString()}`;
}

/* ---------- actions ---------- */

document.querySelectorAll('#profile-seg button').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const res = await window.rog.setProfile(btn.dataset.profile);
    toast(res.ok ? `Perfil cambiado a ${btn.dataset.profile}` : `Error: ${res.err}`);
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
    if (mode === 'AsusMuxDgpu' && !window.confirm(
      'Modo dGPU (MUX): la RTX 4060 maneja TODO, incluida la pantalla.\n\n' +
      '✓ Más FPS en juegos (sin pasar por la Intel)\n' +
      '✗ Mucho más consumo de batería\n' +
      '✗ Requiere REINICIAR el equipo (no basta cerrar sesión)\n\n' +
      '¿Continuar?')) return;
    gpuBusy = true;
    toast(`Solicitando modo ${mode}… (puede tardar)`);
    const res = await window.rog.setGpuMode(mode);
    gpuBusy = false;
    toast(res.ok
      ? (mode === 'AsusMuxDgpu'
          ? 'Modo dGPU solicitado — REINICIA el equipo para aplicar'
          : `Modo ${mode} solicitado — cierra sesión para aplicar`)
      : `No se pudo: ${res.err || res.out}`);
  });
});

$('update-btn').addEventListener('click', async () => {
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

/* ---------- wiring ---------- */

window.rog.onStats(update);
window.rog.onBackendDown(() => {
  $('backend-state').textContent = 'backend caído — reiniciando…';
});
window.rog.appInfo().then((info) => {
  $('versions').textContent = `app v${info.appVersion} · ${info.repo}`;
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

applyAppearance();

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

/* ---------- fan control center ---------- */

const FAN_NAMES = { cpu: 'CPU', gpu: 'GPU', mid: 'MID (central)' };
const FAN_MAX_DEFAULT = { cpu: 7000, gpu: 6900, mid: 7500 };
let fanMax = JSON.parse(localStorage.getItem('fanMax') || 'null') || { ...FAN_MAX_DEFAULT };
let fanCfg = null;

function renderCurves() {
  $('fan-curves').innerHTML = Object.entries(fanCfg.curves).map(([fan, c]) => `
    <div class="curve-fan" data-fan="${fan}">
      <h4>${FAN_NAMES[fan]} — máx estimado ${fanMax[fan]} RPM</h4>
      <div class="curve-table">
        <span>°C</span>
        ${c.temps.map((v, i) => `<input type="number" min="0" max="110" data-kind="temps" data-i="${i}" value="${v}">`).join('')}
        <span title="0 = apagado, 255 = 100%">PWM</span>
        ${c.pwms.map((v, i) => `<input type="number" min="0" max="255" data-kind="pwms" data-i="${i}" value="${v}">`).join('')}
      </div>
    </div>`).join('');
}

function readCurvesFromForm() {
  const curves = {};
  document.querySelectorAll('.curve-fan').forEach((box) => {
    const fan = box.dataset.fan;
    curves[fan] = { temps: Array(8).fill(0), pwms: Array(8).fill(0) };
    box.querySelectorAll('input').forEach((inp) => {
      curves[fan][inp.dataset.kind][+inp.dataset.i] = Math.round(+inp.value);
    });
  });
  return curves;
}

$('fans-block').addEventListener('click', async () => {
  const profile = lastStats?.asus_profile;
  if (!profile) { toast('Aún no conozco el perfil ASUS activo'); return; }
  const res = await window.rog.getFanConfig(profile);
  if (!res.ok) { toast(res.err); return; }
  fanCfg = res;
  $('fan-profile').textContent = profile;
  $('fan-script-path').textContent = res.path;
  $('fan-max-note').textContent =
    `Máximos estimados: CPU ${fanMax.cpu} · GPU ${fanMax.gpu} · MID ${fanMax.mid} RPM (mide los reales con el botón).`;
  renderCurves();
  $('fan-modal').classList.remove('hidden');
});

$('fan-close').addEventListener('click', () => $('fan-modal').classList.add('hidden'));
$('fan-modal').addEventListener('click', (e) => {
  if (e.target === $('fan-modal')) $('fan-modal').classList.add('hidden');
});

$('fan-apply-cap').addEventListener('click', () => {
  const cap = Math.round(+$('fan-cap').value);
  if (!cap || cap < 2000) { toast('Cap inválido (mínimo 2000 RPM)'); return; }
  const curves = readCurvesFromForm();
  for (const fan of Object.keys(curves)) {
    const maxPwm = Math.min(255, Math.round((cap / fanMax[fan]) * 255));
    curves[fan].pwms = curves[fan].pwms.map((v) => Math.min(v, maxPwm));
  }
  fanCfg.curves = curves;
  renderCurves();
  toast(`Cap de ${cap} RPM aplicado a las curvas del perfil ${fanCfg.profile}.\nRevisa y oprime GUARDAR Y APLICAR.`);
});

$('fan-benchmark').addEventListener('click', async () => {
  if (!window.confirm(
    'Medir máximos reales:\n\n' +
    'Los 3 ventiladores irán al 100% durante 60 segundos (va a sonar fuerte).\n' +
    'Al terminar todo se restaura solo. Pedirá tu contraseña.\n\n¿Continuar?')) return;
  toast('Midiendo máximos… 60 segundos al 100%');
  const res = await window.rog.fanBenchmark();
  if (!res.ok) { toast(`No se pudo: ${res.err}`); return; }
  fanMax = res.max;
  localStorage.setItem('fanMax', JSON.stringify(fanMax));
  $('fan-max-note').textContent =
    `Máximos medidos: CPU ${fanMax.cpu} · GPU ${fanMax.gpu} · MID ${fanMax.mid} RPM ✓`;
  renderCurves();
  toast(`Máximos reales: CPU ${fanMax.cpu} · GPU ${fanMax.gpu} · MID ${fanMax.mid} RPM`);
});

$('fan-save').addEventListener('click', async () => {
  const curves = readCurvesFromForm();
  // consent gate: slow fans at the two hottest points are dangerous
  const risky = Object.entries(curves).filter(([, c]) =>
    c.pwms[6] < 150 || c.pwms[7] < 150);
  if (risky.length && !window.confirm(
    'ADVERTENCIA: dejaste los ventiladores por debajo del 60% en los puntos ' +
    'más calientes de la curva (' + risky.map(([f]) => FAN_NAMES[f]).join(', ') + ').\n\n' +
    'Esto puede sobrecalentar y dañar tu equipo bajo carga.\n\n' +
    'Escribe OK en el siguiente paso… ¿Entiendes el riesgo y quieres continuar?')) return;
  const res = await window.rog.setFanConfig({ profile: fanCfg.profile, curves });
  if (res.ok) {
    $('fan-modal').classList.add('hidden');
    toast(`Curvas del perfil ${fanCfg.profile} guardadas y aplicadas ✓`);
  } else {
    toast(`Error: ${res.err}`);
  }
});

/* ---------- export events ---------- */

$('export-events').addEventListener('click', async (e) => {
  e.stopPropagation();
  const events = lastStats?.events || [];
  if (!events.length) { toast('No hay eventos para exportar'); return; }
  const today = new Date().toLocaleDateString();
  const text = `ROG Monitor — registro de eventos (${today})\n\n`
    + events.map(([ts, level, msg]) => `${ts}  [${level.toUpperCase()}]  ${msg}`).join('\n') + '\n';
  const res = await window.rog.exportEvents(text);
  toast(res.ok ? `Eventos guardados en ${res.path}` : `No se exportó: ${res.err}`);
});
