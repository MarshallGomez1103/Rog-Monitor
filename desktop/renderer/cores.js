/* ROG Monitor — Grid de núcleos (v13).
 * Botón "NÚCLEOS" (dentro del bloque de Procesos) -> modal con una rejilla de
 * todos los hilos de la CPU: uso%, frecuencia (GHz inline) y temperatura por
 * núcleo. Distingue núcleos de Rendimiento (P, estética deportiva) de los de
 * Eficiencia (E, estética ecológica) cuando el hardware lo permite; si la CPU
 * es homogénea degrada a un estilo neutro.
 *
 * Clic en un núcleo -> modal de detalle: procesos que corren en ese núcleo,
 * uso%, frecuencia y temperatura. Se refresca cada segundo SIN toast (ambos
 * modales se redibujan desde el mismo stream window.rog.onStats).
 *
 * Autocontenido: crea su DOM en runtime (no toca index.html). Lee
 * stats.cpu.core_grid y stats.procs[].last_cpu del stream existente. Solo
 * redibuja cuando hay un modal abierto, para no gastar CPU de fondo. */
(function () {
  'use strict';

  const t = (k, fb, vars) => {
    if (window.t) {
      const out = window.t(k, vars);
      return out && out !== k ? out : (fb || k);
    }
    return fb || k;
  };

  if (window.i18n && typeof window.i18n.register === 'function') {
    window.i18n.register({
      es: {
        'cores.btn': 'NÚCLEOS',
        'cores.title': 'Núcleos de la CPU',
        'cores.subtitle': '{model} · {threads} hilos ({phys} núcleos) · uso {use}% · máx {max}°C',
        'cores.ptype': 'Núcleo de rendimiento (P)',
        'cores.etype': 'Núcleo de eficiencia (E)',
        'cores.type': 'Núcleo',
        'cores.legend': 'Color = temperatura · barra = uso · P = rendimiento (deportivo) · E = eficiencia (ecológico) · clic en un núcleo para ver su detalle.',
        'cores.legend.flat': 'Color = temperatura · barra = uso · clic en un núcleo para ver su detalle.',
        'cores.none': 'Sin datos de núcleos todavía…',
        'cores.ghz': 'GHz',
        'cores.usage': 'uso',
        'cores.hint': 'Clic para ver detalle',
        // --- modal de detalle ---
        'cores.detail.title': 'Núcleo {cpu}',
        'cores.detail.ptype': 'Rendimiento (P)',
        'cores.detail.etype': 'Eficiencia (E)',
        'cores.detail.usage': 'Uso',
        'cores.detail.freq': 'Frecuencia',
        'cores.detail.temp': 'Temperatura',
        'cores.detail.procs': 'Procesos en este núcleo',
        'cores.detail.procs.none': 'Sin procesos activos detectados en este núcleo ahora mismo.',
        'cores.detail.live': 'En vivo · actualiza cada segundo',
        'cores.detail.col.proc': 'Proceso',
        'cores.detail.col.cpu': '% CPU',
        'common.close': 'Cerrar',
      },
      en: {
        'cores.btn': 'CORES',
        'cores.title': 'CPU cores',
        'cores.subtitle': '{model} · {threads} threads ({phys} cores) · {use}% used · max {max}°C',
        'cores.ptype': 'Performance core (P)',
        'cores.etype': 'Efficiency core (E)',
        'cores.type': 'Core',
        'cores.legend': 'Color = temperature · bar = usage · P = performance (sporty) · E = efficiency (eco) · click a core for details.',
        'cores.legend.flat': 'Color = temperature · bar = usage · click a core for details.',
        'cores.none': 'No core data yet…',
        'cores.ghz': 'GHz',
        'cores.usage': 'usage',
        'cores.hint': 'Click for details',
        'cores.detail.title': 'Core {cpu}',
        'cores.detail.ptype': 'Performance (P)',
        'cores.detail.etype': 'Efficiency (E)',
        'cores.detail.usage': 'Usage',
        'cores.detail.freq': 'Frequency',
        'cores.detail.temp': 'Temperature',
        'cores.detail.procs': 'Processes on this core',
        'cores.detail.procs.none': 'No active processes detected on this core right now.',
        'cores.detail.live': 'Live · updates every second',
        'cores.detail.col.proc': 'Process',
        'cores.detail.col.cpu': 'CPU %',
        'common.close': 'Close',
      },
    });
  }

  let modal = null;
  let gridEl = null;
  let subEl = null;
  let legendEl = null;
  let isOpen = false;
  let latest = null;          // stats.cpu del último frame
  let latestProcs = null;     // stats.procs del último frame (top global)
  let latestByCore = null;    // stats.procs_by_core: {cpuLogico: [procs...]}
  // Huella de la última estructura pintada en la rejilla. Si no cambia (mismos
  // cpus + mismo modo hetero), parcheamos las celdas EN SITIO en vez de
  // reconstruir innerHTML cada segundo: así no se pierde el hover/foco ni
  // reaparece el "hint", y gastamos menos CPU.
  let gridKey = '';

  // --- modal de detalle por núcleo ---
  let detail = null;
  let detailOpen = false;
  let detailCpu = null;       // cpu lógico que se está inspeccionando

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function tempClass(temp) {
    if (temp == null) return 'c-na';
    if (temp < 60) return 'c-cold';
    if (temp < 78) return 'c-normal';
    if (temp < 90) return 'c-hot';
    return 'c-crit';
  }

  // core_id que aparece en >=2 hilos => P-core (HyperThreading); 1 hilo => E-core.
  function typeMap(grid) {
    const count = {};
    grid.forEach((c) => { count[c.core_id] = (count[c.core_id] || 0) + 1; });
    return count;
  }

  function isPCore(counts, coreId) {
    return (counts[coreId] || 1) >= 2;
  }

  // Heterogénea = hay P-cores Y E-cores (la CPU distingue tipos). Si todos son
  // iguales, no pintamos badges P/E (degradación elegante).
  function isHetero(grid, counts) {
    let hasP = false;
    let hasE = false;
    grid.forEach((c) => {
      if (isPCore(counts, c.core_id)) hasP = true; else hasE = true;
    });
    return hasP && hasE;
  }

  function ghzText(c) {
    return c.ghz != null ? Number(c.ghz).toFixed(2) : '--';
  }

  function build() {
    if (document.getElementById('cores-modal')) return; // ya construido

    modal = document.createElement('div');
    modal.id = 'cores-modal';
    modal.className = 'modal hidden';
    modal.innerHTML = `
      <div class="modal-card cores-card">
        <h3 data-i18n="cores.title">${t('cores.title', 'Núcleos de la CPU')}</h3>
        <p class="sub" id="cores-sub"></p>
        <div class="cores-grid" id="cores-grid"></div>
        <p class="cores-legend" id="cores-legend"></p>
        <div class="cores-close-row">
          <button class="ghost modal-close" id="cores-close" data-i18n="common.close">${t('common.close', 'Cerrar')}</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    gridEl = modal.querySelector('#cores-grid');
    subEl = modal.querySelector('#cores-sub');
    legendEl = modal.querySelector('#cores-legend');

    modal.querySelector('#cores-close').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    // Delegación: clic (o Enter/Espacio con foco) en una celda abre el detalle.
    gridEl.addEventListener('click', (e) => {
      const tile = e.target.closest('.core-tile');
      if (!tile) return;
      const cpu = parseInt(tile.dataset.cpu, 10);
      if (!Number.isNaN(cpu)) openDetail(cpu);
    });
    gridEl.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      const tile = e.target.closest('.core-tile');
      if (!tile) return;
      e.preventDefault();
      const cpu = parseInt(tile.dataset.cpu, 10);
      if (!Number.isNaN(cpu)) openDetail(cpu);
    });

    // --- modal de detalle por núcleo ---
    detail = document.createElement('div');
    detail.id = 'core-detail-modal';
    detail.className = 'modal hidden';
    detail.innerHTML = `
      <div class="modal-card core-detail-card">
        <h3 id="core-detail-title"></h3>
        <p class="sub core-detail-live" id="core-detail-live"></p>
        <div class="core-detail-stats" id="core-detail-stats"></div>
        <h4 class="core-detail-h4" id="core-detail-procs-h" data-i18n="cores.detail.procs">${t('cores.detail.procs', 'Procesos en este núcleo')}</h4>
        <div class="core-detail-procs" id="core-detail-procs"></div>
        <div class="cores-close-row">
          <button class="ghost modal-close" id="core-detail-close" data-i18n="common.close">${t('common.close', 'Cerrar')}</button>
        </div>
      </div>`;
    document.body.appendChild(detail);
    detail.querySelector('#core-detail-close').addEventListener('click', closeDetail);
    detail.addEventListener('click', (e) => { if (e.target === detail) closeDetail(); });
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
    closeDetail();
  }

  function openDetail(cpu) {
    if (!detail) return;
    detailCpu = cpu;
    detail.classList.remove('hidden');
    detailOpen = true;
    renderDetail();
  }
  function closeDetail() {
    if (detail) detail.classList.add('hidden');
    detailOpen = false;
    detailCpu = null;
  }

  function render() {
    if (!isOpen || !gridEl) return;
    const grid = latest && latest.core_grid;
    if (!grid || !grid.length) {
      gridEl.innerHTML = `<p class="sub">${t('cores.none', 'Sin datos de núcleos todavía…')}</p>`;
      gridKey = '';
      if (legendEl) legendEl.textContent = '';
      return;
    }
    const counts = typeMap(grid);
    const hetero = isHetero(grid, counts);
    const temps = grid.map((c) => c.temp).filter((x) => x != null);
    const uses = grid.map((c) => c.usage);
    const maxT = temps.length ? Math.max(...temps) : null;
    const avgU = uses.length ? Math.round(uses.reduce((a, b) => a + b, 0) / uses.length) : 0;
    const phys = Object.keys(counts).length;

    if (subEl) {
      subEl.textContent = t('cores.subtitle', '', {
        model: latest.model || 'CPU',
        threads: grid.length,
        phys: phys,
        use: avgU,
        max: maxT != null ? maxT : '--',
      });
    }
    if (legendEl) {
      legendEl.textContent = hetero
        ? t('cores.legend', '')
        : t('cores.legend.flat', '');
    }

    // ¿Cambió la estructura (cpus o modo hetero)? Solo entonces reconstruimos.
    const key = (hetero ? 'h:' : 'f:') + grid.map((c) => c.cpu).join(',');
    if (key !== gridKey) {
      gridEl.innerHTML = grid.map((c) => {
        const isP = isPCore(counts, c.core_id);
        // Clase de tipo solo si la CPU distingue (degradación elegante).
        const typeClass = hetero ? (isP ? 'core-p' : 'core-e') : 'core-flat';
        const badge = hetero
          ? `<span class="core-badge ${isP ? 'badge-p' : 'badge-e'}" aria-hidden="true">${isP ? '⚡' : '🌿'}<i>${isP ? 'P' : 'E'}</i></span>`
          : '';
        return `
          <div class="core-tile ${typeClass}" data-cpu="${c.cpu}" role="button" tabindex="0">
            ${badge}
            <span class="core-temp"></span>
            <span class="core-num">cpu ${c.cpu}</span>
            <div class="core-bar"><div class="core-bar-fill"></div></div>
            <div class="core-foot">
              <span class="core-usage"></span>
              <span class="core-ghz"><b></b><small>${t('cores.ghz', 'GHz')}</small></span>
            </div>
            <span class="core-hint">${t('cores.hint', 'Clic para ver detalle')}</span>
          </div>`;
      }).join('');
      gridKey = key;
    }

    // Parcheo EN SITIO de los valores dinámicos (no destruye hover/foco).
    const tiles = gridEl.children;
    for (let i = 0; i < grid.length; i++) {
      const c = grid[i];
      const tile = tiles[i];
      if (!tile || tile.dataset.cpu !== String(c.cpu)) { gridKey = ''; return render(); }
      const tc = tempClass(c.temp);
      tile.classList.remove('c-cold', 'c-normal', 'c-hot', 'c-crit', 'c-na');
      tile.classList.add(tc);
      tile.querySelector('.core-temp').textContent = c.temp != null ? c.temp + '°' : '--';
      tile.querySelector('.core-bar-fill').style.width = c.usage + '%';
      tile.querySelector('.core-usage').textContent = c.usage + '%';
      tile.querySelector('.core-ghz b').textContent = ghzText(c);
    }
  }

  function renderDetail() {
    if (!detailOpen || !detail || detailCpu == null) return;
    const grid = (latest && latest.core_grid) || [];
    const c = grid.find((x) => x.cpu === detailCpu);
    const counts = typeMap(grid);
    const hetero = isHetero(grid, counts);
    const isP = c ? isPCore(counts, c.core_id) : false;

    const titleEl = detail.querySelector('#core-detail-title');
    const liveEl = detail.querySelector('#core-detail-live');
    const statsEl = detail.querySelector('#core-detail-stats');
    const procsEl = detail.querySelector('#core-detail-procs');

    const card = detail.querySelector('.core-detail-card');
    if (card) {
      card.classList.remove('core-p', 'core-e', 'core-flat');
      card.classList.add(hetero ? (isP ? 'core-p' : 'core-e') : 'core-flat');
    }

    if (titleEl) {
      const typeTag = hetero
        ? ` · ${isP ? t('cores.detail.ptype', 'Rendimiento (P)') : t('cores.detail.etype', 'Eficiencia (E)')}`
        : '';
      titleEl.textContent = t('cores.detail.title', 'Núcleo {cpu}', { cpu: detailCpu }) + typeTag;
    }
    if (liveEl) liveEl.textContent = t('cores.detail.live', 'En vivo · actualiza cada segundo');

    if (statsEl) {
      const usage = c ? c.usage : null;
      const ghz = c ? ghzText(c) : '--';
      const temp = c && c.temp != null ? c.temp + '°C' : '--';
      const tc = tempClass(c ? c.temp : null);
      statsEl.innerHTML = `
        <div class="cd-stat">
          <span class="cd-k">${t('cores.detail.usage', 'Uso')}</span>
          <span class="cd-v">${usage != null ? usage + '%' : '--'}</span>
          <div class="cd-bar"><div class="cd-bar-fill" style="width:${usage != null ? usage : 0}%"></div></div>
        </div>
        <div class="cd-stat">
          <span class="cd-k">${t('cores.detail.freq', 'Frecuencia')}</span>
          <span class="cd-v">${ghz} <small>${t('cores.ghz', 'GHz')}</small></span>
        </div>
        <div class="cd-stat ${tc}">
          <span class="cd-k">${t('cores.detail.temp', 'Temperatura')}</span>
          <span class="cd-v cd-temp">${temp}</span>
        </div>`;
    }

    if (procsEl) {
      // Preferimos procs_by_core (agrupado en backend sobre TODOS los procesos
      // activos). Si el backend no lo emite (contrato viejo), degradamos a
      // filtrar la lista top global por last_cpu. Las claves JSON son strings.
      let procs = null;
      if (latestByCore) {
        procs = latestByCore[detailCpu] || latestByCore[String(detailCpu)] || [];
      } else {
        procs = (latestProcs || []).filter((p) => p.last_cpu === detailCpu);
      }
      procs = procs.slice().sort((a, b) => (b.cpu || 0) - (a.cpu || 0));
      if (!procs.length) {
        procsEl.innerHTML = `<p class="sub cd-empty">${t('cores.detail.procs.none', 'Sin procesos activos detectados en este núcleo ahora mismo.')}</p>`;
      } else {
        const head = `
          <div class="cd-prow cd-phead">
            <span class="cd-ppid">PID</span>
            <span class="cd-pname">${t('cores.detail.col.proc', 'Proceso')}</span>
            <span class="cd-pcpu">${t('cores.detail.col.cpu', '% CPU')}</span>
          </div>`;
        const rows = procs.map((p) => `
          <div class="cd-prow">
            <span class="cd-ppid">${escapeHtml(p.pid)}</span>
            <span class="cd-pname">${escapeHtml(p.name)}</span>
            <span class="cd-pcpu">${(p.cpu != null ? p.cpu : 0).toFixed(1)}%</span>
          </div>`).join('');
        procsEl.innerHTML = head + rows;
      }
    }
  }

  function onStats(stats) {
    if (stats && stats.cpu && stats.cpu.core_grid) latest = stats.cpu;
    if (stats && stats.procs) latestProcs = stats.procs;
    if (stats && stats.procs_by_core) latestByCore = stats.procs_by_core;
    if (isOpen) render();
    if (detailOpen) renderDetail();
  }

  // Re-traducir textos estáticos al cambiar idioma con un modal abierto.
  // Forzamos rebuild de la rejilla (gridKey='') para re-traducir las etiquetas
  // estáticas de cada celda (unidad GHz, hint), no solo los valores dinámicos.
  function onLangChange() {
    gridKey = '';
    if (isOpen) render();
    if (detailOpen) renderDetail();
  }

  function init() {
    build();
    if (window.rog && typeof window.rog.onStats === 'function') {
      window.rog.onStats(onStats);
    }
    if (window.i18n && typeof window.i18n.onChange === 'function') {
      window.i18n.onChange(onLangChange);
    }
    // Escape: cierra primero el detalle, luego la rejilla. Sin tocar app.js.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (detailOpen) { closeDetail(); return; }
      if (isOpen) closeModal();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.RogCores = { init, open: openModal };
})();
