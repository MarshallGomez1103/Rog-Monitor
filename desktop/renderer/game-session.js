/* ===================================================================
   SESIÓN DE JUEGO — game-session.js
   Archivo propio del Agente A5. No tocar app.js/main.js/preload.js/index.html
   (son de otros dueños). Este módulo es 100% autocontenido: construye su
   propio botón en el topbar, su propio modal en <body>, y solo necesita
   que el orquestador añada al final de app.js:

       window.RogGameSession && window.RogGameSession.init();

   y que main.js/preload.js expongan los 4 puentes IPC descritos en
   docs/HANDOFF.md (sección A5). Si esos puentes NO existen todavía
   (window.rog.gameSession* es undefined), el módulo se degrada con un
   aviso claro en vez de romper nada — así no bloquea el arranque normal
   de la app aunque el cableado de IPC llegue en otra sesión.

   Qué hace:
   - Botón "SESIÓN DE JUEGO" en el topbar.
   - Modal con 3 vistas: inicio (detectar juego + empezar), grabando
     (lectura en vivo vía window.rog.onStats + sondeo del backend),
     resumen (mín/máx/promedio + 4 gráficas con hover), comparar (dos
     sesiones lado a lado, % diff y veredicto en lenguaje natural).
   - Backend real: src/rog_monitor/game_session.py (start/sample/stop/
     list/get/compare/baseline/delete), guarda en
     ~/.local/share/rog-monitor/game-sessions/*.json.
   =================================================================== */

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);

  /* ---- i18n: namespace gamesession.* (es/en aquí; A4 añade el resto) ---- */
  if (window.i18n && typeof window.i18n.register === 'function') {
    window.i18n.register({
      es: {
        'gamesession.topbar_btn': 'SESIÓN DE JUEGO',
        'gamesession.topbar_title': 'Grabar temperaturas, RPM, watts y uso mientras juegas',
        'gamesession.modal_title': 'SESIÓN DE JUEGO',
        'gamesession.intro': 'Grabo CPU/GPU temp, RPM de ventiladores, RAM, watts y uso mientras juegas. Al terminar verás un resumen con gráficas.',
        'gamesession.start_btn': 'INICIAR SESIÓN',
        'gamesession.stop_btn': 'TERMINAR SESIÓN',
        'gamesession.recording': 'Grabando…',
        'gamesession.detected_game': 'Juego detectado',
        'gamesession.no_game_detected': 'Sin un juego claro detectado todavía',
        'gamesession.duration': 'Duración',
        'gamesession.baseline_badge': 'BASELINE (original)',
        'gamesession.baseline_hint': 'Esta es tu primera sesión: quedará como referencia "original" para comparar futuras sesiones.',
        'gamesession.summary_title': 'Resumen de la sesión',
        'gamesession.metric_min': 'Mín',
        'gamesession.metric_max': 'Máx',
        'gamesession.metric_avg': 'Prom',
        'gamesession.metric_cpu_temp': 'Temp. CPU (°C)',
        'gamesession.metric_gpu_temp': 'Temp. GPU (°C)',
        'gamesession.metric_cpu_watts': 'Potencia CPU (W)',
        'gamesession.metric_gpu_watts': 'Potencia GPU (W)',
        'gamesession.metric_gpu_util': 'Uso GPU (%)',
        'gamesession.metric_ram_percent': 'RAM usada (%)',
        'gamesession.metric_fan_cpu_rpm': 'Ventilador CPU (RPM)',
        'gamesession.metric_fan_gpu_rpm': 'Ventilador GPU (RPM)',
        'gamesession.metric_fan_mid_rpm': 'Ventilador medio (RPM)',
        'gamesession.save_close': 'Guardar y cerrar',
        'gamesession.list_title': 'Sesiones guardadas',
        'gamesession.no_sessions': 'Todavía no hay sesiones guardadas.',
        'gamesession.compare_btn': 'COMPARAR',
        'gamesession.compare_with_baseline': 'Comparar con baseline',
        'gamesession.compare_title': 'Comparar sesiones',
        'gamesession.pick_two': 'Elige dos sesiones para comparar.',
        'gamesession.verdict_better': 'esta sesión fue mejor (más fría/silenciosa) que la de referencia',
        'gamesession.verdict_worse': 'esta sesión fue peor (más caliente/cargada) que la de referencia',
        'gamesession.verdict_equal': 'esta sesión quedó prácticamente igual a la de referencia',
        'gamesession.verdict_cooler': 'esta sesión fue {pct}% más fría que la de referencia',
        'gamesession.verdict_hotter': 'esta sesión fue {pct}% más caliente que la de referencia',
        'gamesession.recommend_title': 'Tweaks sugeridos',
        'gamesession.recommend_fans': 'Las RPM de ventilador subieron mucho respecto al baseline: revisa el perfil de ventiladores o el cap de RPM.',
        'gamesession.recommend_power': 'El consumo de CPU/GPU subió bastante: si buscas silencio, prueba un perfil de energía más conservador.',
        'gamesession.recommend_temp': 'Las temperaturas subieron bastante respecto al baseline: vigila el throttling en Eventos.',
        'gamesession.recommend_none': 'No hay diferencias grandes que sugieran un ajuste — todo se mantuvo parecido al baseline.',
        'gamesession.delete_btn': 'Borrar',
        'gamesession.close': 'Cerrar',
        'gamesession.back': 'Volver',
        'gamesession.pending_wiring': 'El backend de sesión de juego aún no está conectado en esta build (falta el cableado IPC). Pide al orquestador completar docs/HANDOFF.md §A5.',
        'gamesession.error_generic': 'No se pudo completar la operación de sesión de juego.',
        'gamesession.session_label': 'Sesión',
        'gamesession.vs': 'vs',
      },
      en: {
        'gamesession.topbar_btn': 'GAME SESSION',
        'gamesession.topbar_title': 'Record temps, fan RPM, watts and usage while you play',
        'gamesession.modal_title': 'GAME SESSION',
        'gamesession.intro': 'I record CPU/GPU temp, fan RPM, RAM, watts and usage while you play. When you finish you get a summary with charts.',
        'gamesession.start_btn': 'START SESSION',
        'gamesession.stop_btn': 'END SESSION',
        'gamesession.recording': 'Recording…',
        'gamesession.detected_game': 'Detected game',
        'gamesession.no_game_detected': 'No clear game detected yet',
        'gamesession.duration': 'Duration',
        'gamesession.baseline_badge': 'BASELINE (original)',
        'gamesession.baseline_hint': 'This is your first session: it will be kept as the "original" reference to compare future sessions against.',
        'gamesession.summary_title': 'Session summary',
        'gamesession.metric_min': 'Min',
        'gamesession.metric_max': 'Max',
        'gamesession.metric_avg': 'Avg',
        'gamesession.metric_cpu_temp': 'CPU temp (°C)',
        'gamesession.metric_gpu_temp': 'GPU temp (°C)',
        'gamesession.metric_cpu_watts': 'CPU power (W)',
        'gamesession.metric_gpu_watts': 'GPU power (W)',
        'gamesession.metric_gpu_util': 'GPU usage (%)',
        'gamesession.metric_ram_percent': 'RAM used (%)',
        'gamesession.metric_fan_cpu_rpm': 'CPU fan (RPM)',
        'gamesession.metric_fan_gpu_rpm': 'GPU fan (RPM)',
        'gamesession.metric_fan_mid_rpm': 'Mid fan (RPM)',
        'gamesession.save_close': 'Save and close',
        'gamesession.list_title': 'Saved sessions',
        'gamesession.no_sessions': 'No saved sessions yet.',
        'gamesession.compare_btn': 'COMPARE',
        'gamesession.compare_with_baseline': 'Compare with baseline',
        'gamesession.compare_title': 'Compare sessions',
        'gamesession.pick_two': 'Pick two sessions to compare.',
        'gamesession.verdict_better': 'this session was better (cooler/quieter) than the reference',
        'gamesession.verdict_worse': 'this session was worse (hotter/more loaded) than the reference',
        'gamesession.verdict_equal': 'this session was practically the same as the reference',
        'gamesession.verdict_cooler': 'this session was {pct}% cooler than the reference',
        'gamesession.verdict_hotter': 'this session was {pct}% hotter than the reference',
        'gamesession.recommend_title': 'Suggested tweaks',
        'gamesession.recommend_fans': 'Fan RPM rose a lot compared to baseline: check the fan profile or the RPM cap.',
        'gamesession.recommend_power': 'CPU/GPU power draw rose a lot: if you want quiet, try a more conservative power profile.',
        'gamesession.recommend_temp': 'Temperatures rose a lot compared to baseline: watch throttling in Events.',
        'gamesession.recommend_none': 'No large differences that suggest a tweak — everything stayed close to baseline.',
        'gamesession.delete_btn': 'Delete',
        'gamesession.close': 'Close',
        'gamesession.back': 'Back',
        'gamesession.pending_wiring': 'The game session backend is not wired up in this build yet (missing IPC). Ask the orchestrator to finish docs/HANDOFF.md §A5.',
        'gamesession.error_generic': 'Could not complete the game session operation.',
        'gamesession.session_label': 'Session',
        'gamesession.vs': 'vs',
      },
    });
  }

  /* ---- estado del módulo ---- */
  let active = null;          // { id, baseline, startedAt } | null
  let pollTimer = null;
  let lastLiveSample = null;  // último stats.* recibido por onStats (para vivo)
  let view = 'start';         // 'start' | 'recording' | 'summary' | 'compare'
  let lastSession = null;     // sesión recién cerrada (para la vista resumen)
  let sessionsCache = [];

  const METRICS = [
    'cpu_temp', 'gpu_temp', 'cpu_watts', 'gpu_watts',
    'gpu_util', 'ram_percent', 'fan_cpu_rpm', 'fan_gpu_rpm', 'fan_mid_rpm',
  ];

  /* ---- puente al backend: window.rog.gameSession* (lo añade main.js/preload.js) ----
     Contrato esperado (ver HANDOFF.md):
       window.rog.gameSessionStart()            -> {ok, session_id, baseline}
       window.rog.gameSessionSample(id)         -> {ok, sample, count}
       window.rog.gameSessionStop(id)           -> {ok, session}
       window.rog.gameSessionList()             -> {ok, sessions}
       window.rog.gameSessionGet(id)            -> {ok, session}
       window.rog.gameSessionCompare(a, b)      -> {ok, diffs, verdict, ...}
       window.rog.gameSessionBaseline()         -> {ok, session_id}
       window.rog.gameSessionDelete(id)         -> {ok}
  */
  function bridge() {
    return (window.rog && window.rog.gameSessionStart) ? window.rog : null;
  }

  /* ================================================================
     MODAL: construido en runtime (no tocamos index.html)
  ================================================================= */
  let modalEl = null;

  function buildModal() {
    if (modalEl) return modalEl;
    const div = document.createElement('div');
    div.id = 'game-session-modal';
    div.className = 'modal hidden';
    div.innerHTML = `
      <div class="modal-card wide gs-card">
        <h3 data-i18n="gamesession.modal_title">SESIÓN DE JUEGO</h3>
        <div id="gs-body"></div>
        <button class="ghost modal-close" id="gs-close" data-i18n="gamesession.close">Cerrar</button>
      </div>`;
    document.body.appendChild(div);
    div.querySelector('#gs-close').addEventListener('click', closeModal);
    div.addEventListener('click', (e) => { if (e.target === div) closeModal(); });
    modalEl = div;
    if (window.i18n && window.i18n.apply) window.i18n.apply(div);
    return div;
  }

  function openModal() {
    buildModal();
    modalEl.classList.remove('hidden');
    render();
  }

  function closeModal() {
    if (modalEl) modalEl.classList.add('hidden');
    if (view === 'recording') {
      // no perdemos la grabación al cerrar el modal: sigue en background
      return;
    }
    view = 'start';
  }

  /* ================================================================
     TOPBAR BUTTON
  ================================================================= */
  function injectTopbarButton() {
    if ($('game-session-btn')) return;
    const controls = document.querySelector('#topbar .controls');
    if (!controls) return;
    const btn = document.createElement('button');
    btn.id = 'game-session-btn';
    btn.className = 'ghost';
    btn.setAttribute('data-i18n', 'gamesession.topbar_btn');
    btn.setAttribute('data-i18n-attr', 'title:gamesession.topbar_title');
    btn.title = 'Grabar temperaturas, RPM, watts y uso mientras juegas';
    btn.textContent = 'SESIÓN DE JUEGO';
    btn.addEventListener('click', openModal);
    controls.appendChild(btn);
    if (window.i18n && window.i18n.apply) window.i18n.apply(controls);
  }

  /* ================================================================
     RENDER por vista
  ================================================================= */
  function render() {
    const body = $('gs-body');
    if (!body) return;
    if (!bridge()) {
      body.innerHTML = `<p class="gs-warning">${t('gamesession.pending_wiring')}</p>`;
      return;
    }
    if (view === 'start') renderStart(body);
    else if (view === 'recording') renderRecording(body);
    else if (view === 'summary') renderSummary(body);
    else if (view === 'compare') renderCompare(body);
  }

  function renderStart(body) {
    body.innerHTML = `
      <p class="gs-intro">${t('gamesession.intro')}</p>
      <button class="primary gs-start-btn" id="gs-start">${t('gamesession.start_btn')}</button>
      <h4 class="gs-subhead">${t('gamesession.list_title')}</h4>
      <div id="gs-list" class="gs-list"></div>
    `;
    body.querySelector('#gs-start').addEventListener('click', startSession);
    refreshList();
  }

  async function refreshList() {
    const api = bridge();
    const list = $('gs-list');
    if (!api || !list) return;
    try {
      const res = await api.gameSessionList();
      sessionsCache = (res && res.sessions) || [];
    } catch (_) {
      sessionsCache = [];
    }
    if (!sessionsCache.length) {
      list.innerHTML = `<p class="gs-empty">${t('gamesession.no_sessions')}</p>`;
      return;
    }
    list.innerHTML = sessionsCache.map((s) => rowHtml(s)).join('');
    sessionsCache.forEach((s) => {
      const row = list.querySelector(`[data-sid="${cssEscape(s.id)}"]`);
      if (!row) return;
      row.querySelector('.gs-row-open')?.addEventListener('click', () => openSavedSession(s.id));
      row.querySelector('.gs-row-compare')?.addEventListener('click', () => compareWithBaseline(s.id));
      row.querySelector('.gs-row-delete')?.addEventListener('click', () => deleteSession(s.id));
    });
  }

  function rowHtml(s) {
    const when = s.started_at ? new Date(s.started_at).toLocaleString() : '?';
    const gameName = (s.game && s.game.name) || '—';
    const baselineTag = s.baseline ? `<span class="gs-badge">${t('gamesession.baseline_badge')}</span>` : '';
    return `
      <div class="gs-row" data-sid="${escapeHtml(s.id)}">
        <div class="gs-row-main">
          <strong>${escapeHtml(gameName)}</strong> ${baselineTag}
          <div class="gs-row-sub">${escapeHtml(when)}</div>
        </div>
        <div class="gs-row-actions">
          <button class="ghost small gs-row-open">${t('gamesession.summary_title')}</button>
          ${s.baseline ? '' : `<button class="ghost small gs-row-compare">${t('gamesession.compare_with_baseline')}</button>`}
          <button class="ghost small danger gs-row-delete">${t('gamesession.delete_btn')}</button>
        </div>
      </div>`;
  }

  /* ---- iniciar / grabar ---- */
  async function startSession() {
    const api = bridge();
    if (!api) return;
    try {
      const res = await api.gameSessionStart();
      if (!res || !res.ok) { flashError(res); return; }
      active = { id: res.session_id, baseline: !!res.baseline, startedAt: Date.now() };
      view = 'recording';
      render();
      pollTimer = setInterval(pollSample, 1000);
      pollSample();
    } catch (_) {
      flashError(null);
    }
  }

  async function pollSample() {
    const api = bridge();
    if (!api || !active) return;
    try {
      await api.gameSessionSample(active.id);
    } catch (_) { /* un sample fallido no detiene la sesión */ }
  }

  if (typeof window.addEventListener === 'function') {
    window.addEventListener('beforeunload', () => {
      if (pollTimer) clearInterval(pollTimer);
    });
  }

  function renderRecording(body) {
    const elapsed = active ? Math.round((Date.now() - active.startedAt) / 1000) : 0;
    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');
    const live = lastLiveSample || {};
    const gpuActive = (live.gpu && live.gpu.active) || {};
    const cpu = live.cpu || {};
    const gameProcs = (live.procs || []).find((p) => p && p.name);
    body.innerHTML = `
      <p class="gs-recording-badge">● ${t('gamesession.recording')} ${mins}:${secs}</p>
      ${active && active.baseline ? `<p class="gs-baseline-hint">${t('gamesession.baseline_hint')}</p>` : ''}
      <p>${t('gamesession.detected_game')}: <strong>${escapeHtml((gameProcs && gameProcs.name) || t('gamesession.no_game_detected'))}</strong></p>
      <div class="gs-live-grid">
        <div class="gs-live-item"><span>CPU</span><b>${fmt(cpu.avg)} °C</b></div>
        <div class="gs-live-item"><span>GPU</span><b>${fmt(gpuActive.temp)} °C</b></div>
        <div class="gs-live-item"><span>GPU W</span><b>${fmt(gpuActive.power)} W</b></div>
        <div class="gs-live-item"><span>GPU %</span><b>${fmt(gpuActive.util)} %</b></div>
      </div>
      <button class="primary gs-stop-btn" id="gs-stop">${t('gamesession.stop_btn')}</button>
    `;
    body.querySelector('#gs-stop').addEventListener('click', stopSession);
  }

  async function stopSession() {
    const api = bridge();
    if (!api || !active) return;
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    try {
      const res = await api.gameSessionStop(active.id);
      if (!res || !res.ok) { flashError(res); view = 'start'; render(); return; }
      lastSession = res.session;
      active = null;
      view = 'summary';
      render();
    } catch (_) {
      flashError(null);
      view = 'start';
      render();
    }
  }

  /* ---- resumen + gráficas ---- */
  async function openSavedSession(id) {
    const api = bridge();
    if (!api) return;
    try {
      const res = await api.gameSessionGet(id);
      if (!res || !res.ok) { flashError(res); return; }
      lastSession = res.session;
      view = 'summary';
      render();
    } catch (_) {
      flashError(null);
    }
  }

  async function deleteSession(id) {
    const api = bridge();
    if (!api) return;
    try {
      await api.gameSessionDelete(id);
      refreshList();
    } catch (_) { /* noop */ }
  }

  const METRIC_COLOR = {
    cpu_temp: 'var(--cold)',
    gpu_temp: 'var(--hot)',
    cpu_watts: 'var(--accent)',
    gpu_watts: 'var(--accent2)',
    gpu_util: 'var(--okstate)',
    ram_percent: 'var(--okstate)',
    fan_cpu_rpm: 'var(--cold)',
    fan_gpu_rpm: 'var(--hot)',
    fan_mid_rpm: 'var(--accent)',
  };

  function renderSummary(body) {
    if (!lastSession) { view = 'start'; render(); return; }
    const summary = lastSession.summary || {};
    const game = lastSession.game;
    const duration = summary._duration_s || 0;
    const mins = Math.floor(duration / 60);
    const secs = Math.round(duration % 60);
    body.innerHTML = `
      <p class="gs-summary-head">
        <strong>${escapeHtml((game && game.name) || t('gamesession.no_game_detected'))}</strong>
        ${lastSession.baseline ? `<span class="gs-badge">${t('gamesession.baseline_badge')}</span>` : ''}
      </p>
      <p>${t('gamesession.duration')}: <strong>${mins}m ${secs}s</strong></p>
      <div class="gs-metric-grid" id="gs-metric-grid"></div>
      <button class="ghost gs-back-btn" id="gs-back">${t('gamesession.back')}</button>
    `;
    const grid = body.querySelector('#gs-metric-grid');
    METRICS.forEach((metric) => {
      const stat = summary[metric] || {};
      const card = document.createElement('div');
      card.className = 'gs-metric-card';
      card.innerHTML = `
        <h5>${t('gamesession.metric_' + metric)}</h5>
        <canvas class="gs-chart" data-metric="${metric}" width="320" height="90"></canvas>
        <div class="gs-metric-stats">
          <span>${t('gamesession.metric_min')}: <b>${fmt(stat.min)}</b></span>
          <span>${t('gamesession.metric_avg')}: <b>${fmt(stat.avg)}</b></span>
          <span>${t('gamesession.metric_max')}: <b>${fmt(stat.max)}</b></span>
        </div>
        <div class="gs-tip hidden"></div>
      `;
      grid.appendChild(card);
      const canvas = card.querySelector('canvas');
      const values = (lastSession.samples || []).map((s) => s[metric]);
      const times = (lastSession.samples || []).map((s) => s.t);
      drawSessionChart(canvas, times, values, METRIC_COLOR[metric] || 'var(--accent)');
      wireSessionChartHover(canvas, times, values, card.querySelector('.gs-tip'));
    });
    body.querySelector('#gs-back').addEventListener('click', () => { view = 'start'; render(); });
  }

  /* mini chart propio (no depende de app.js): eje X = tiempo real de la
     sesión (segundos desde el inicio), eje Y autoescalado. */
  function drawSessionChart(canvas, times, values, color) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const pts = values.map((v, i) => [times[i], v]).filter(([, v]) => v !== null && v !== undefined);
    if (pts.length < 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = '11px sans-serif';
      ctx.fillText('—', w / 2 - 4, h / 2);
      return;
    }
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const xSpan = xMax - xMin || 1;
    const ySpan = (yMax - yMin) || 1;
    const pad = 6;
    const toX = (x) => pad + ((x - xMin) / xSpan) * (w - pad * 2);
    const toY = (y) => h - pad - ((y - yMin) / ySpan) * (h - pad * 2);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      const px = toX(x), py = toY(y);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();

    canvas._gsChart = { pts, toX, toY, xMin, xMax, yMin, yMax };
  }

  function wireSessionChartHover(canvas, times, values, tipEl) {
    canvas.addEventListener('mousemove', (e) => {
      const chart = canvas._gsChart;
      if (!chart || !chart.pts.length) return;
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
      // encuentra el punto más cercano en X
      let nearest = chart.pts[0];
      let best = Infinity;
      chart.pts.forEach((p) => {
        const d = Math.abs(chart.toX(p[0]) - mx);
        if (d < best) { best = d; nearest = p; }
      });
      const [tSec, val] = nearest;
      tipEl.classList.remove('hidden');
      tipEl.textContent = `${fmt(val)} · ${formatDuration(tSec)}`;
      tipEl.style.left = Math.min(canvas.width - 60, Math.max(0, chart.toX(tSec))) + 'px';
    });
    canvas.addEventListener('mouseleave', () => tipEl.classList.add('hidden'));
  }

  function formatDuration(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  /* ---- comparar ---- */
  async function compareWithBaseline(sessionId) {
    const api = bridge();
    if (!api) return;
    try {
      const baseRes = await api.gameSessionBaseline();
      const baselineId = baseRes && baseRes.session_id;
      if (!baselineId) { flashError({ err: t('gamesession.no_sessions') }); return; }
      const res = await api.gameSessionCompare(baselineId, sessionId);
      if (!res || !res.ok) { flashError(res); return; }
      renderCompareResult(res);
    } catch (_) {
      flashError(null);
    }
  }

  function renderCompare(body) {
    body.innerHTML = `<p>${t('gamesession.pick_two')}</p>`;
  }

  function renderCompareResult(result) {
    buildModal();
    const body = $('gs-body');
    if (!body) return;
    const verdictText = verdictHeadline(result);
    const recs = recommendations(result);
    const rowsHtml = METRICS.map((m) => {
      const d = result.diffs[m] || {};
      const pct = d.diff_percent;
      const cls = pct == null ? '' : (pct < 0 ? 'gs-diff-down' : pct > 0 ? 'gs-diff-up' : '');
      return `<tr>
        <td>${t('gamesession.metric_' + m)}</td>
        <td>${fmt(d.a_avg)}</td>
        <td>${fmt(d.b_avg)}</td>
        <td class="${cls}">${pct == null ? '—' : (pct > 0 ? '+' : '') + pct + '%'}</td>
      </tr>`;
    }).join('');

    body.innerHTML = `
      <h4>${t('gamesession.compare_title')}</h4>
      <p class="gs-verdict gs-verdict-${result.verdict}">${verdictText}</p>
      <table class="gs-compare-table">
        <thead><tr>
          <th></th>
          <th>${t('gamesession.session_label')} A</th>
          <th>${t('gamesession.session_label')} B</th>
          <th>%</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="gs-recommend">
        <h5>${t('gamesession.recommend_title')}</h5>
        <ul>${recs.map((r) => `<li>${r}</li>`).join('')}</ul>
      </div>
      <button class="ghost gs-back-btn" id="gs-back">${t('gamesession.back')}</button>
    `;
    body.querySelector('#gs-back').addEventListener('click', () => { view = 'start'; render(); });
    view = 'compare-result';
  }

  function verdictHeadline(result) {
    const pct = result.headline_diff_percent;
    if (pct != null && Math.abs(pct) >= 3) {
      const key = pct < 0 ? 'gamesession.verdict_cooler' : 'gamesession.verdict_hotter';
      return t(key, { pct: Math.abs(pct) });
    }
    if (result.verdict === 'better') return t('gamesession.verdict_better');
    if (result.verdict === 'worse') return t('gamesession.verdict_worse');
    return t('gamesession.verdict_equal');
  }

  function recommendations(result) {
    const recs = [];
    const fanUp = ['fan_cpu_rpm', 'fan_gpu_rpm', 'fan_mid_rpm']
      .some((m) => (result.diffs[m] || {}).diff_percent > 10);
    const powerUp = ['cpu_watts', 'gpu_watts']
      .some((m) => (result.diffs[m] || {}).diff_percent > 10);
    const tempUp = ['cpu_temp', 'gpu_temp']
      .some((m) => (result.diffs[m] || {}).diff_percent > 8);
    if (fanUp) recs.push(t('gamesession.recommend_fans'));
    if (powerUp) recs.push(t('gamesession.recommend_power'));
    if (tempUp) recs.push(t('gamesession.recommend_temp'));
    if (!recs.length) recs.push(t('gamesession.recommend_none'));
    return recs;
  }

  /* ---- helpers ---- */
  function fmt(v) {
    if (v === null || v === undefined) return '—';
    return typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : String(v);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function cssEscape(s) {
    return String(s).replace(/"/g, '\\"');
  }

  function flashError(res) {
    const msg = (res && res.err) ? res.err : t('gamesession.error_generic');
    if (typeof window.flash === 'function') window.flash(msg);
    else console.warn('[game-session]', msg);
  }

  /* ================================================================
     INIT — única entrada pública. La llama app.js (o el orquestador)
     una sola vez tras cargar el DOM.
  ================================================================= */
  function init() {
    injectTopbarButton();
    if (window.rog && typeof window.rog.onStats === 'function') {
      window.rog.onStats((stats) => {
        lastLiveSample = stats;
        if (view === 'recording' && modalEl && !modalEl.classList.contains('hidden')) {
          renderRecording($('gs-body'));
        }
      });
    }
  }

  window.RogGameSession = { init };
})();
