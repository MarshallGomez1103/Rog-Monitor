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

function render(stats) {
  const colors = stats.temp_colors || { cpu: [70, 85, 92], gpu: [60, 75, 83] };

  const cpuT = stats.cpu?.package ?? stats.cpu?.avg;
  const cpuEl = $('cpu-t');
  cpuEl.textContent = fmt(cpuT, 0) + '°';
  cpuEl.style.color = tempColor(cpuT, colors.cpu);
  $('cpu-w').textContent = stats.rapl_available ? fmt(stats.cpu_watts, 0) + ' W' : '— W';

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
