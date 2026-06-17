/* ROG Monitor — Modal de detalle de benchmark (v11.2).
 * Al hacer clic en un benchmark del historial se abre un modal dedicado
 * (estilo NÚCLEOS, con botón Cerrar) en vez de expandir la tarjetita en línea.
 * Muestra:
 *   - Gráficas grandes con ejes: temperatura y consumo a lo largo del run
 *     (CPU: núcleos + paquete + watts; GPU: temp + watts + uso).
 *   - Comparación antes → después (primer vs último sample).
 *   - Lista de eventos importantes (throttling, tope de RPM, picos).
 *   - Grilla de estadísticas.
 * Autocontenido: crea su modal en runtime. Expuesto como window.RogBenchDetail.
 * Reutiliza helpers globales de app.js: cssVar, fmt, escapeHtml. */
(function () {
  'use strict';

  let modal = null;
  let titleEl = null;
  let subEl = null;
  let bodyEl = null;
  let current = null;        // item abierto
  let chartDefs = [];        // [{ id, series, unit }] para redibujar en resize
  let chartSamples = [];     // samples del item abierto

  /* ---- helpers seguros sobre globales de app.js ---- */
  function _cv(name, fb) {
    try { const v = (typeof cssVar === 'function') ? cssVar(name) : ''; return v || fb; }
    catch (_) { return fb; }
  }
  function _fmt(v, d, fb) {
    try { return (typeof fmt === 'function') ? fmt(v, d, fb) : (v == null ? (fb || '--') : v); }
    catch (_) { return v == null ? (fb || '--') : v; }
  }
  function _esc(s) {
    try { return (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s); }
    catch (_) { return String(s == null ? '' : s); }
  }

  /* ============================================================
     MODAL
     ============================================================ */
  function ensureModal() {
    if (modal) return;
    modal = document.createElement('div');
    modal.id = 'bench-detail-modal';
    modal.className = 'modal hidden';
    modal.innerHTML = `
      <div class="modal-card wide benchd-card">
        <h3 id="benchd-title">Benchmark</h3>
        <p class="sub" id="benchd-sub"></p>
        <div class="benchd-body" id="benchd-body"></div>
        <button class="ghost modal-close" id="benchd-close">Cerrar</button>
      </div>`;
    document.body.appendChild(modal);
    titleEl = modal.querySelector('#benchd-title');
    subEl = modal.querySelector('#benchd-sub');
    bodyEl = modal.querySelector('#benchd-body');
    modal.querySelector('#benchd-close').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) close();
    });
    window.addEventListener('resize', () => {
      if (modal && !modal.classList.contains('hidden')) redrawCharts();
    });
  }

  function close() {
    if (modal) modal.classList.add('hidden');
    current = null;
  }

  /* ============================================================
     DIBUJO DE GRÁFICA (multi-serie, con ejes)
     ============================================================ */
  function drawChart(canvas, samples, series, unit) {
    const ctx = canvas.getContext('2d');
    const w = canvas.clientWidth || canvas.width || 280;
    const h = canvas.clientHeight || canvas.height || 150;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const padL = 44, padR = 12, padT = 10, padB = 22;
    const gw = w - padL - padR;
    const gh = h - padT - padB;

    const ts = samples.map((s) => (s.t == null ? 0 : s.t));
    const tMin = ts.length ? Math.min(...ts) : 0;
    const tMax = ts.length ? Math.max(...ts) : 1;
    const tRange = (tMax - tMin) || 1;

    let allVals = [];
    series.forEach((se) => samples.forEach((s) => {
      const v = s[se.key]; if (v != null) allVals.push(v);
    }));

    const dim = _cv('--dim', '#8a8a8a');
    const hair = _cv('--hair', '#333');
    ctx.font = '10px system-ui, sans-serif';

    if (!allVals.length) {
      ctx.fillStyle = dim;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Sin datos para graficar', w / 2, padT + gh / 2);
      return;
    }

    let vMin = Math.min(...allVals);
    let vMax = Math.max(...allVals);
    if (vMin === vMax) { vMin -= 1; vMax += 1; }
    const vPad = (vMax - vMin) * 0.1;
    vMin -= vPad; vMax += vPad;
    const vRange = (vMax - vMin) || 1;

    const X = (t) => padL + ((t - tMin) / tRange) * gw;
    const Y = (v) => padT + gh - ((v - vMin) / vRange) * gh;

    // rejilla Y + etiquetas
    ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    ctx.lineWidth = 1; ctx.strokeStyle = hair;
    for (let i = 0; i <= 4; i++) {
      const v = vMin + (vRange * i) / 4;
      const y = Y(v);
      ctx.globalAlpha = 0.22;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = dim;
      ctx.fillText(Math.round(v) + (unit || ''), padL - 5, y);
    }
    // etiquetas X (inicio … fin)
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = dim;
    ctx.fillText(Math.round(tMin) + 's', padL, h - padB + 5);
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(tMax) + 's', w - padR, h - padB + 5);

    // series (línea + área suave para la primera)
    series.forEach((se, idx) => {
      const pts = [];
      samples.forEach((s) => {
        const v = s[se.key]; if (v == null) return;
        pts.push([X(s.t == null ? 0 : s.t), Y(v)]);
      });
      if (!pts.length) return;
      ctx.beginPath();
      ctx.strokeStyle = se.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
      ctx.stroke();
      if (idx === 0) {
        ctx.lineTo(pts[pts.length - 1][0], padT + gh);
        ctx.lineTo(pts[0][0], padT + gh);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, padT, 0, padT + gh);
        grad.addColorStop(0, se.color + '33');
        grad.addColorStop(1, se.color + '00');
        ctx.fillStyle = grad;
        ctx.fill();
      }
    });
  }

  function redrawCharts() {
    chartDefs.forEach((def) => {
      const c = document.getElementById(def.id);
      if (c) drawChart(c, chartSamples, def.series, def.unit);
    });
  }

  /* ============================================================
     CONSTRUCCIÓN DEL CONTENIDO
     ============================================================ */
  function chartConfigs(isGpu) {
    const accent = _cv('--accent', '#f25c3d');
    const accent2 = _cv('--accent2', '#3da0f2');
    const green = '#4cc38a';
    if (isGpu) {
      return [
        { title: 'GPU · Temperatura', unit: '°C',
          series: [{ key: 'gpu_temp', color: accent, label: 'Temp GPU' }] },
        { title: 'GPU · Consumo', unit: ' W',
          series: [{ key: 'gpu_watts', color: accent2, label: 'Watts' }] },
        { title: 'GPU · Uso', unit: '%',
          series: [{ key: 'gpu_util', color: green, label: 'Uso' }] },
      ];
    }
    return [
      { title: 'CPU · Temperatura', unit: '°C',
        series: [
          { key: 'cpu_temp', color: accent, label: 'Núcleos (avg)' },
          { key: 'cpu_package', color: accent2, label: 'Paquete' },
        ] },
      { title: 'CPU · Consumo', unit: ' W',
        series: [{ key: 'cpu_watts', color: green, label: 'Watts (RAPL)' }] },
    ];
  }

  function buildEvents(item, isGpu, samples) {
    const s = item.summary || {};
    const ev = [];
    const tempKey = isGpu ? 'gpu_temp' : 'cpu_temp';
    const wKey = isGpu ? 'gpu_watts' : 'cpu_watts';

    // throttling
    const thr = s.throttle_events == null ? null : s.throttle_events;
    if (thr != null) {
      if (thr > 0) ev.push({ type: 'crit', text: `Throttling térmico: ${thr} eventos (${s.throttle_ms ?? 0} ms acumulados). La CPU bajó frecuencia por calor.` });
      else ev.push({ type: 'ok', text: 'Sin throttling térmico durante la prueba.' });
    }
    // tope de ventiladores
    if (s.cap_respected === false) ev.push({ type: 'crit', text: 'El tope de RPM de ventiladores fue EXCEDIDO durante la prueba.' });
    else if (s.cap_respected === true) ev.push({ type: 'ok', text: 'Tope de RPM de ventiladores respetado.' });

    if (samples.length > 1) {
      // pico de temperatura
      let peak = null, peakT = null;
      samples.forEach((sm) => { const v = sm[tempKey]; if (v != null && (peak == null || v > peak)) { peak = v; peakT = sm.t; } });
      if (peak != null) {
        ev.push({ type: peak >= 90 ? 'crit' : peak >= 80 ? 'warn' : 'ok',
          text: `Pico de temperatura: ${_fmt(peak, 1)}°C a los ${_fmt(peakT, 0)}s.` });
      }
      // antes → después
      const first = samples[0] || {}, last = samples[samples.length - 1] || {};
      if (first[tempKey] != null && last[tempKey] != null) {
        const d = last[tempKey] - first[tempKey];
        ev.push({ type: 'info', text: `Temperatura: empezó en ${_fmt(first[tempKey], 1)}°C y terminó en ${_fmt(last[tempKey], 1)}°C (${d >= 0 ? '+' : ''}${_fmt(d, 1)}°C).` });
      }
      if (first[wKey] != null && last[wKey] != null) {
        const wmax = isGpu ? s.gpu_watts_max : s.cpu_watts_max;
        ev.push({ type: 'info', text: `Consumo: ${_fmt(first[wKey], 1)} W → ${_fmt(last[wKey], 1)} W (máx ${_fmt(wmax, 1)} W).` });
      }
    }
    return ev;
  }

  function statsGrid(item, isGpu) {
    const s = item.summary || {};
    const cells = isGpu ? [
      { l: 'GPU máx', v: s.gpu_temp_max != null ? `${_fmt(s.gpu_temp_max, 1)} °C` : '--', accent: s.gpu_temp_max >= 85 },
      { l: 'GPU W máx', v: s.gpu_watts_max != null ? `${_fmt(s.gpu_watts_max, 1)} W` : '--' },
      { l: 'GPU uso máx', v: s.gpu_util_max != null ? `${_fmt(s.gpu_util_max, 0)} %` : '--' },
      { l: 'Throttle', v: `${s.throttle_events ?? 0} ev · ${s.throttle_ms ?? 0} ms`, accent: (s.throttle_events ?? 0) > 10 },
      { l: 'Duración', v: item.seconds != null ? `${item.seconds} s` : '--' },
    ] : [
      { l: 'CPU máx', v: s.cpu_temp_max != null ? `${_fmt(s.cpu_temp_max, 1)} °C` : '--', accent: s.cpu_temp_max >= 90 },
      { l: 'CPU paquete', v: s.cpu_package_max != null ? `${_fmt(s.cpu_package_max, 1)} °C` : '--' },
      { l: 'CPU W máx', v: s.cpu_watts_max != null ? `${_fmt(s.cpu_watts_max, 1)} W` : '--' },
      { l: 'Throttle', v: `${s.throttle_events ?? 0} ev · ${s.throttle_ms ?? 0} ms`, accent: (s.throttle_events ?? 0) > 10 },
      { l: 'Duración', v: item.seconds != null ? `${item.seconds} s` : '--' },
    ];
    let grid = `<div class="bench-detail-grid">${cells.map((c) =>
      `<div class="bench-detail-cell"><label>${_esc(c.l)}</label><b${c.accent ? ' class="accent"' : ''}>${_esc(c.v)}</b></div>`).join('')}</div>`;

    const fanEntries = Object.entries(s.fan_rpm_max || {});
    if (fanEntries.length) {
      grid += `<div class="bench-detail-fans">Ventiladores (máx): ${
        fanEntries.map(([k, v]) => `<b>${_esc(k)}: ${v} RPM</b>`).join(' · ')}</div>`;
    }
    return grid;
  }

  /* ============================================================
     OPEN
     ============================================================ */
  function open(item) {
    if (!item) return;
    ensureModal();
    current = item;
    const isGpu = item.kind === 'gpu';
    const samples = Array.isArray(item.samples) ? item.samples : [];
    chartSamples = samples;
    chartDefs = [];

    titleEl.textContent = `${(item.kind || 'cpu').toUpperCase()} · ${item.seconds != null ? item.seconds + ' s' : 'benchmark'}`;
    subEl.textContent = [item.when, item.tool ? 'herramienta: ' + item.tool : ''].filter(Boolean).join(' · ');

    const events = buildEvents(item, isGpu, samples);
    const eventsHtml = events.length
      ? `<ul class="benchd-events">${events.map((e) =>
          `<li class="benchd-ev benchd-ev-${e.type}"><span class="benchd-ev-dot"></span>${_esc(e.text)}</li>`).join('')}</ul>`
      : '';

    let chartsHtml = '';
    if (samples.length > 1) {
      const cfgs = chartConfigs(isGpu);
      chartsHtml = `<div class="benchd-charts">${cfgs.map((cfg, i) => {
        const id = `benchd-chart-${i}`;
        chartDefs.push({ id, series: cfg.series, unit: cfg.unit });
        const legend = cfg.series.map((se) =>
          `<span class="benchd-legend"><i style="background:${se.color}"></i>${_esc(se.label)}</span>`).join('');
        return `<div class="benchd-chart">
            <div class="benchd-chart-head">
              <span class="benchd-chart-title">${_esc(cfg.title)}</span>
              <span class="benchd-legends">${legend}</span>
            </div>
            <canvas id="${id}" class="benchd-canvas"></canvas>
          </div>`;
      }).join('')}</div>`;
    } else {
      chartsHtml = `<p class="benchd-nochart">Este benchmark no guardó la serie de tiempo segundo a segundo (es un resultado antiguo o sin muestras), así que no hay gráficas. Lanza un benchmark nuevo para verlas.</p>`;
    }

    bodyEl.innerHTML = `
      ${eventsHtml}
      ${chartsHtml}
      <h4 class="benchd-h4">Resumen</h4>
      ${statsGrid(item, isGpu)}
    `;

    modal.classList.remove('hidden');
    // dibujar tras el layout para que el canvas tenga tamaño real
    requestAnimationFrame(redrawCharts);
  }

  window.RogBenchDetail = { open, close };
})();
