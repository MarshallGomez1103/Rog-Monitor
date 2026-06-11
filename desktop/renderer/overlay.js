// Read-only stats overlay. Receives the same per-second 'stats' frames as the
// main window via the shared preload bridge.

const $ = (id) => document.getElementById(id);

function fmt(v, d = 0) {
  return (v === null || v === undefined || Number.isNaN(v)) ? '--' : Number(v).toFixed(d);
}

// thresholds [green<, yellow<, orange<]; at/above last => red
function tempColor(value, stops) {
  if (value == null) return 'var(--dim)';
  const [g, y, o] = stops;
  if (value < g) return 'var(--ok)';
  if (value < y) return 'var(--warn)';
  if (value < o) return 'var(--hot)';
  return 'var(--crit)';
}

// qué filas pintar (lo eligen las casillas del modal OVERLAY)
let show = { cpu: true, gpu: true, fans: true };
let lastStats = null;

function applyShow() {
  $('cpu-row').style.display = show.cpu === false ? 'none' : '';
  $('gpu-row').style.display = show.gpu === false ? 'none' : '';
  $('fans').style.display = show.fans === false ? 'none' : '';
}

function render(stats) {
  lastStats = stats;
  const colors = stats.temp_colors || { cpu: [70, 85, 92], gpu: [60, 75, 83] };

  // promedio de los núcleos (AVG), no el sensor de package que siempre va
  // unos grados arriba y asusta sin razón
  const cpuT = stats.cpu?.avg ?? stats.cpu?.package;
  const cpuEl = $('cpu-t');
  cpuEl.textContent = fmt(cpuT, 0) + '°';
  cpuEl.style.color = tempColor(cpuT, colors.cpu);
  $('cpu-w').textContent =
    (stats.rapl_available ? fmt(stats.cpu_watts, 0) + ' W' : '— W') + ' · AVG';

  // FPS reales (MangoHud logging): la fila solo existe cuando hay dato
  const fpsRow = $('fps-row');
  if (stats.fps != null) {
    fpsRow.style.display = '';
    $('fps-v').textContent = fmt(stats.fps, 0);
  } else {
    fpsRow.style.display = 'none';
  }

  const g = stats.gpu?.active || {};
  const gpuEl = $('gpu-t');
  gpuEl.textContent = g.temp != null ? fmt(g.temp, 0) + '°' : '--';
  gpuEl.style.color = tempColor(g.temp, colors.gpu);
  $('gpu-w').textContent = g.power != null
    ? `${fmt(g.power, 0)} W · ${fmt(g.util, 0)}%`
    : '— W';

  const fans = stats.fans || [];
  $('fans').innerHTML = fans.length
    ? '🌀 ' + fans.map((f) =>
        `<b>${f.label.replace('_fan', '').toUpperCase()}</b> ${f.rpm}` +
        (f.cap ? `<span style="opacity:.6">/${f.percent}%</span>` : '')).join('  ')
    : 'ventiladores --';

  $('prof').textContent = (stats.asus_profile || '').toUpperCase();
}

window.rog.onStats(render);
window.rog.onOverlayConfig((cfg) => {
  show = { ...show, ...cfg };
  applyShow();
  if (lastStats) render(lastStats);
});
applyShow();
