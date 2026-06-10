/* ROG Monitor desktop renderer. Receives one stats object per second. */

const $ = (id) => document.getElementById(id);

let lastStats = null;
let gpuBusy = false;

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

  ctx.strokeStyle = '#161b22';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (h / 4) * i);
    ctx.lineTo(w, (h / 4) * i);
    ctx.stroke();
  }

  if (!values || values.length < 2) return;
  const data = values.slice(-Math.max(60, Math.floor(w / 4)));
  let lo = Math.min(...data), hi = Math.max(...data);
  if (hi - lo < 4) { const m = (hi + lo) / 2; lo = m - 2; hi = m + 2; }
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

  ctx.fillStyle = '#6b7480';
  ctx.font = '10px monospace';
  ctx.fillText(hi.toFixed(0), 4, 11);
  ctx.fillText(lo.toFixed(0), 4, h - 3);
  const last = data[data.length - 1];
  ctx.fillStyle = color;
  ctx.font = 'bold 13px monospace';
  ctx.fillText(last.toFixed(1), w - 44, 14);
}

/* ---------- fans ---------- */

const FAN_SVG = `
<svg viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="29" fill="none" stroke="#1d232b" stroke-width="2"/>
  <g>
    <path d="M32 32 L32 7 A25 25 0 0 1 49 16 Z" fill="#39424e"/>
    <path d="M32 32 L53 22 A25 25 0 0 1 51 46 Z" fill="#39424e"/>
    <path d="M32 32 L44 53 A25 25 0 0 1 20 53 Z" fill="#39424e"/>
    <path d="M32 32 L13 47 A25 25 0 0 1 11 23 Z" fill="#39424e"/>
    <path d="M32 32 L15 13 A25 25 0 0 1 32 7 Z" fill="#2c343f"/>
  </g>
  <circle cx="32" cy="32" r="6" fill="#e63946"/>
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
  $('thermal-label').textContent = lampIdx != null ? LAMP_STATES[lampIdx][1] : '—';

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
  $('cpu-watts').textContent = stats.rapl_available ? fmt(stats.cpu_watts, 1) : 'root';
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
    $('gpu-vram').textContent = active.vram_total
      ? `${fmt(active.vram_used, 0)}/${fmt(active.vram_total, 0)}M` : '--';
  } else {
    $('gpu-off-note').classList.remove('hidden');
    $('gpu-temp').textContent = '--';
    $('gpu-util').textContent = $('gpu-watts').textContent = $('gpu-vram').textContent = '--';
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
  drawChart($('chart-cpu'), series.cpu_temp, '#4cc9f0');
  drawChart($('chart-gpu'), series.gpu_temp, '#2a9d8f');
  drawChart($('chart-power'), series.cpu_power, '#e63946');

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

  /* events */
  const events = (stats.events || []).slice(-30).reverse();
  $('events').innerHTML = events.length
    ? events.map(([ts, level, msg]) =>
        `<li class="${level}"><time>${ts}</time>${msg}</li>`).join('')
    : '<li class="dim">sin eventos</li>';

  /* processes */
  $('procs').innerHTML = (stats.procs || []).map((p) => `
    <tr><td class="pid">${p.pid}</td><td>${p.name}</td>
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
    gpuBusy = true;
    toast(`Solicitando modo ${mode}… (puede tardar)`);
    const res = await window.rog.setGpuMode(mode);
    gpuBusy = false;
    toast(res.ok
      ? `Modo ${mode} solicitado — cierra sesión para aplicar`
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
