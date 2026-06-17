/* ROG Monitor — Grid de núcleos (v11.2).
 * Botón "NÚCLEOS" en el topbar -> modal con una rejilla de todos los hilos de
 * la CPU: uso%, frecuencia y temperatura por núcleo, con tooltip descriptivo.
 * Autocontenido: crea su botón y su modal en runtime (no toca index.html).
 * Lee stats.cpu.core_grid del stream existente (window.rog.onStats). Solo
 * redibuja cuando el modal está abierto, para no gastar CPU de fondo. */
(function () {
  'use strict';

  const t = (k, fb) => (window.t ? (window.t(k) || fb || k) : (fb || k));

  if (window.i18n && typeof window.i18n.register === 'function') {
    window.i18n.register({
      es: {
        'cores.btn': 'NÚCLEOS',
        'cores.title': 'Núcleos de la CPU',
        'cores.subtitle': '{model} · {threads} hilos ({phys} núcleos) · uso {use}% · máx {max}°C',
        'cores.ptype': 'Núcleo de rendimiento (P)',
        'cores.etype': 'Núcleo de eficiencia (E)',
        'cores.tip': 'CPU {cpu} · {type}\nUso {usage}%  ·  {ghz} GHz  ·  {temp}°C',
        'cores.legend': 'Color = temperatura. Barra = uso. P = rendimiento, E = eficiencia.',
        'cores.none': 'Sin datos de núcleos todavía…',
        'common.close': 'Cerrar',
      },
      en: {
        'cores.btn': 'CORES',
        'cores.title': 'CPU cores',
        'cores.subtitle': '{model} · {threads} threads ({phys} cores) · {use}% used · max {max}°C',
        'cores.ptype': 'Performance core (P)',
        'cores.etype': 'Efficiency core (E)',
        'cores.tip': 'CPU {cpu} · {type}\nUsage {usage}%  ·  {ghz} GHz  ·  {temp}°C',
        'cores.legend': 'Color = temperature. Bar = usage. P = performance, E = efficiency.',
        'cores.none': 'No core data yet…',
        'common.close': 'Close',
      },
    });
  }

  let modal = null;
  let gridEl = null;
  let subEl = null;
  let isOpen = false;
  let latest = null;

  function tempClass(temp) {
    if (temp == null) return 'c-na';
    if (temp < 60) return 'c-cold';
    if (temp < 78) return 'c-normal';
    if (temp < 90) return 'c-hot';
    return 'c-crit';
  }

  // P-core si su core_id aparece en 2 hilos (HyperThreading); E-core si en 1.
  function typeMap(grid) {
    const count = {};
    grid.forEach((c) => { count[c.core_id] = (count[c.core_id] || 0) + 1; });
    return count;
  }

  function build() {
    if (document.getElementById('cores-btn')) return;

    const controls = document.querySelector('#topbar .controls')
      || document.querySelector('.controls')
      || document.querySelector('header .controls');
    const btn = document.createElement('button');
    btn.id = 'cores-btn';
    btn.className = 'ghost';
    btn.textContent = t('cores.btn', 'NÚCLEOS');
    btn.title = t('cores.title', 'Núcleos de la CPU');
    btn.setAttribute('data-i18n', 'cores.btn');
    btn.addEventListener('click', openModal);
    if (controls) {
      const lang = document.getElementById('lang-btn');
      controls.insertBefore(btn, lang || null);
    } else {
      document.body.appendChild(btn);
    }

    modal = document.createElement('div');
    modal.id = 'cores-modal';
    modal.className = 'modal hidden';
    modal.innerHTML = `
      <div class="modal-card cores-card">
        <h3 data-i18n="cores.title">${t('cores.title', 'Núcleos de la CPU')}</h3>
        <p class="sub" id="cores-sub"></p>
        <div class="cores-grid" id="cores-grid"></div>
        <p class="cores-legend" data-i18n="cores.legend">${t('cores.legend', '')}</p>
        <div class="cores-close-row">
          <button class="ghost modal-close" id="cores-close" data-i18n="common.close">${t('common.close', 'Cerrar')}</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    gridEl = modal.querySelector('#cores-grid');
    subEl = modal.querySelector('#cores-sub');

    modal.querySelector('#cores-close').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  }

  function openModal() {
    if (!modal) return;
    modal.classList.remove('hidden');
    isOpen = true;
    render();
  }
  function closeModal() {
    if (modal) modal.classList.add('hidden');
    isOpen = false;
  }

  function render() {
    if (!isOpen || !gridEl) return;
    const grid = latest && latest.core_grid;
    if (!grid || !grid.length) {
      gridEl.innerHTML = `<p class="sub">${t('cores.none', '')}</p>`;
      return;
    }
    const counts = typeMap(grid);
    const temps = grid.map((c) => c.temp).filter((x) => x != null);
    const uses = grid.map((c) => c.usage);
    const maxT = temps.length ? Math.max(...temps) : null;
    const avgU = uses.length ? Math.round(uses.reduce((a, b) => a + b, 0) / uses.length) : 0;
    const phys = Object.keys(counts).length;

    if (subEl) {
      subEl.textContent = t('cores.subtitle', '')
        .replace('{model}', latest.model || 'CPU')
        .replace('{threads}', grid.length)
        .replace('{phys}', phys)
        .replace('{use}', avgU)
        .replace('{max}', maxT != null ? maxT : '--');
    }

    gridEl.innerHTML = grid.map((c) => {
      const isP = (counts[c.core_id] || 1) >= 2;
      const typeLabel = isP ? t('cores.ptype', 'P') : t('cores.etype', 'E');
      const tip = t('cores.tip', '')
        .replace('{cpu}', c.cpu)
        .replace('{type}', typeLabel)
        .replace('{usage}', c.usage)
        .replace('{ghz}', c.ghz != null ? c.ghz : '--')
        .replace('{temp}', c.temp != null ? c.temp : '--');
      return `
        <div class="core-tile ${tempClass(c.temp)}" title="${tip.replace(/"/g, '&quot;')}">
          <span class="core-badge">${isP ? 'P' : 'E'}</span>
          <span class="core-temp">${c.temp != null ? c.temp + '°' : '--'}</span>
          <span class="core-num">cpu ${c.cpu}</span>
          <div class="core-bar"><div class="core-bar-fill" style="width:${c.usage}%"></div></div>
          <span class="core-usage">${c.usage}%</span>
        </div>`;
    }).join('');
  }

  function onStats(stats) {
    if (stats && stats.cpu && stats.cpu.core_grid) latest = stats.cpu;
    if (isOpen) render();
  }

  function init() {
    build();
    if (window.rog && typeof window.rog.onStats === 'function') {
      window.rog.onStats(onStats);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.RogCores = { init, open: openModal };
})();
