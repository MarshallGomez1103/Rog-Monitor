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
        'gamesession.onboarding_hint': 'Consejo: graba una sesión ANTES de tunear el equipo. Esa sesión quedará como "original" y podrás comparar el calor, ruido y consumo antes y después de cada ajuste.',
        'gamesession.loading_samples': 'Cargando datos de la sesión…',
        'gamesession.no_samples': 'Esta sesión no tiene muestras grabadas (la sesión puede haber sido interrumpida).',
        'gamesession.compare_select_a': 'Sesión A (referencia)',
        'gamesession.compare_select_b': 'Sesión B (nueva)',
        'gamesession.compare_run': 'Comparar',
        'gamesession.game_a': 'Juego A',
        'gamesession.game_b': 'Juego B',
        'gamesession.samples_count': '{n} muestras',
        'gamesession.chart_hint': 'Clic en una gráfica para verla grande con zoom',
        'gamesession.chart_zoom_title': 'Rueda del ratón para acercar · arrastra para desplazar el tiempo',
        'gamesession.zoom_in': 'Acercar',
        'gamesession.zoom_out': 'Alejar',
        'gamesession.zoom_reset': 'Ver todo',
        'gamesession.cost_title': 'Costo de energía',
        'gamesession.cost_hint': 'Estimado a partir de la potencia de CPU+GPU integrada en el tiempo. Es solo de referencia.',
        'gamesession.cost_energy': 'Energía consumida',
        'gamesession.cost_price_label': 'Precio de la electricidad',
        'gamesession.cost_per_kwh': 'por kWh',
        'gamesession.cost_total': 'Costo de la sesión',
        'gamesession.cost_cpu': 'CPU',
        'gamesession.cost_gpu': 'GPU',
        'gamesession.cost_show_cop': 'Mostrar también en COP',
        'gamesession.cost_cop_rate': 'Tasa COP por kWh',
        'gamesession.cost_no_data': 'No hay datos de potencia suficientes para estimar el costo.',
        'gamesession.note_title': 'Notas de la sesión',
        'gamesession.note_placeholder': 'Anota qué ajustes probaste (ej. perfil silencioso, undervolt…)',
        'gamesession.note_saved': 'Nota guardada',
        'gamesession.compare_panels_title': 'Comparación de sesiones',
        'gamesession.compare_panel_original': 'Original (referencia)',
        'gamesession.compare_panel_new': 'Nueva (tras ajustes)',
        'gamesession.compare_panel_table': 'Diferencias',
        'gamesession.compare_overlay_hint': 'Clic en una métrica para superponer ambas sesiones',
        'gamesession.compare_overlay_title': 'Superposición',
        'gamesession.compare_legend_a': 'Original',
        'gamesession.compare_legend_b': 'Nueva',
        'gamesession.cooler_short': '{pct}% más fría',
        'gamesession.hotter_short': '{pct}% más caliente',
        'gamesession.more_short': '{pct}% más',
        'gamesession.less_short': '{pct}% menos',
        'gamesession.compare_energy': 'Energía',
        'gamesession.compare_saved_energy': '{pct}% menos energía',
        'gamesession.compare_more_energy': '{pct}% más energía',
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
        'gamesession.onboarding_hint': 'Tip: record a session BEFORE tuning the machine. That session becomes the "original" reference so you can compare heat, noise and power draw before and after each tweak.',
        'gamesession.loading_samples': 'Loading session data…',
        'gamesession.no_samples': 'This session has no recorded samples (it may have been interrupted).',
        'gamesession.compare_select_a': 'Session A (reference)',
        'gamesession.compare_select_b': 'Session B (new)',
        'gamesession.compare_run': 'Compare',
        'gamesession.game_a': 'Game A',
        'gamesession.game_b': 'Game B',
        'gamesession.samples_count': '{n} samples',
        'gamesession.chart_hint': 'Click a chart to open it large with zoom',
        'gamesession.chart_zoom_title': 'Mouse wheel to zoom · drag to pan the timeline',
        'gamesession.zoom_in': 'Zoom in',
        'gamesession.zoom_out': 'Zoom out',
        'gamesession.zoom_reset': 'Fit all',
        'gamesession.cost_title': 'Energy cost',
        'gamesession.cost_hint': 'Estimated from CPU+GPU power integrated over time. For reference only.',
        'gamesession.cost_energy': 'Energy used',
        'gamesession.cost_price_label': 'Electricity price',
        'gamesession.cost_per_kwh': 'per kWh',
        'gamesession.cost_total': 'Session cost',
        'gamesession.cost_cpu': 'CPU',
        'gamesession.cost_gpu': 'GPU',
        'gamesession.cost_show_cop': 'Also show in COP',
        'gamesession.cost_cop_rate': 'COP rate per kWh',
        'gamesession.cost_no_data': 'Not enough power data to estimate the cost.',
        'gamesession.note_title': 'Session notes',
        'gamesession.note_placeholder': 'Note which tweaks you tried (e.g. quiet profile, undervolt…)',
        'gamesession.note_saved': 'Note saved',
        'gamesession.compare_panels_title': 'Session comparison',
        'gamesession.compare_panel_original': 'Original (reference)',
        'gamesession.compare_panel_new': 'New (after tweaks)',
        'gamesession.compare_panel_table': 'Differences',
        'gamesession.compare_overlay_hint': 'Click a metric to overlay both sessions',
        'gamesession.compare_overlay_title': 'Overlay',
        'gamesession.compare_legend_a': 'Original',
        'gamesession.compare_legend_b': 'New',
        'gamesession.cooler_short': '{pct}% cooler',
        'gamesession.hotter_short': '{pct}% hotter',
        'gamesession.more_short': '{pct}% more',
        'gamesession.less_short': '{pct}% less',
        'gamesession.compare_energy': 'Energy',
        'gamesession.compare_saved_energy': '{pct}% less energy',
        'gamesession.compare_more_energy': '{pct}% more energy',
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
    // El hint de onboarding se muestra cuando aún no hay sesiones grabadas
    const hasNoSessions = sessionsCache.length === 0;
    const canCompare = sessionsCache.length >= 2;
    const onboardingHtml = hasNoSessions
      ? `<p class="gs-onboarding-hint">${t('gamesession.onboarding_hint')}</p>` : '';
    const compareBtn = canCompare
      ? `<button class="ghost gs-compare-btn" id="gs-open-compare" style="margin-bottom:12px;width:100%;">${t('gamesession.compare_btn')}</button>` : '';
    body.innerHTML = `
      <p class="gs-intro">${t('gamesession.intro')}</p>
      ${onboardingHtml}
      <button class="primary gs-start-btn" id="gs-start">${t('gamesession.start_btn')}</button>
      ${compareBtn}
      <h4 class="gs-subhead">${t('gamesession.list_title')}</h4>
      <div id="gs-list" class="gs-list"></div>
    `;
    body.querySelector('#gs-start').addEventListener('click', startSession);
    if (canCompare) {
      body.querySelector('#gs-open-compare').addEventListener('click', () => { view = 'compare'; render(); });
    }
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
    // Actualizar el hint de onboarding si existe en el DOM
    const hint = $('gs-body') && $('gs-body').querySelector('.gs-onboarding-hint');
    if (hint) {
      hint.style.display = sessionsCache.length ? 'none' : '';
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

  /* Color por métrica: NOMBRE de variable CSS (sin envolver en var()), para
     poder resolverlo a un color real con cv() — canvas no entiende var(). */
  const METRIC_COLOR = {
    cpu_temp: '--cold',
    gpu_temp: '--hot',
    cpu_watts: '--accent',
    gpu_watts: '--accent2',
    gpu_util: '--okstate',
    ram_percent: '--okstate',
    fan_cpu_rpm: '--cold',
    fan_gpu_rpm: '--hot',
    fan_mid_rpm: '--accent',
  };

  /* ---- color real desde una CSS var (canvas no resuelve var()) ---- */
  function cv(name, fb) {
    try {
      const v = (typeof window.cssVar === 'function')
        ? window.cssVar(name)
        : getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fb;
    } catch (_) { return fb; }
  }
  function metricColor(metric) {
    return cv(METRIC_COLOR[metric] || '--accent', '#f25c3d');
  }
  /* Aplica alfa a un color #rrggbb / #rgb. Si no es hex, devuelve color-mix. */
  function withAlpha(color, alpha) {
    const hex = color && color[0] === '#' ? color : null;
    if (hex) {
      let h = hex.slice(1);
      if (h.length === 3) h = h.split('').map((c) => c + c).join('');
      if (h.length === 6) {
        const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
          .toString(16).padStart(2, '0');
        return '#' + h + a;
      }
    }
    return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
  }

  // Unidades por métrica (para mostrar en el tooltip de hover)
  const METRIC_UNIT = {
    cpu_temp: '°C', gpu_temp: '°C',
    cpu_watts: 'W', gpu_watts: 'W',
    gpu_util: '%', ram_percent: '%',
    fan_cpu_rpm: 'RPM', fan_gpu_rpm: 'RPM', fan_mid_rpm: 'RPM',
  };

  function renderSummary(body) {
    if (!lastSession) { view = 'start'; render(); return; }
    const summary = lastSession.summary || {};
    const game = lastSession.game;
    const duration = summary._duration_s || 0;
    const mins = Math.floor(duration / 60);
    const secs = Math.round(duration % 60);
    const sampleCount = (lastSession.samples || []).length;
    const gameName = (game && game.name) || t('gamesession.no_game_detected');

    body.innerHTML = `
      <div class="gs-summary-head">
        <strong>${escapeHtml(gameName)}</strong>
        ${lastSession.baseline ? `<span class="gs-badge">${t('gamesession.baseline_badge')}</span>` : ''}
        <span class="gs-summary-meta">${t('gamesession.duration')}: <b>${mins}m ${secs}s</b></span>
        ${sampleCount ? `<span class="gs-summary-meta gs-dim">${sampleCount} muestras</span>` : ''}
      </div>
      ${!sampleCount ? `<p class="gs-warning">${t('gamesession.no_samples')}</p>` : ''}
      <div class="gs-metric-grid" id="gs-metric-grid"></div>
      <button class="ghost gs-back-btn" id="gs-back">${t('gamesession.back')}</button>
    `;

    const grid = body.querySelector('#gs-metric-grid');
    if (!grid) return; // defensa: no debería ocurrir si el HTML está bien

    METRICS.forEach((metric) => {
      const stat = summary[metric] || {};
      const hasData = stat.min !== null && stat.min !== undefined;
      const unit = METRIC_UNIT[metric] || '';
      const card = document.createElement('div');
      card.className = 'gs-metric-card';
      card.innerHTML = `
        <h5>${t('gamesession.metric_' + metric)}</h5>
        <canvas class="gs-chart" data-metric="${metric}" width="400" height="90"></canvas>
        <div class="gs-metric-stats">
          <span class="gs-stat-item"><span class="gs-stat-label">${t('gamesession.metric_min')}</span><b>${hasData ? fmt(stat.min) + ' ' + unit : '—'}</b></span>
          <span class="gs-stat-item gs-stat-avg"><span class="gs-stat-label">${t('gamesession.metric_avg')}</span><b>${hasData ? fmt(stat.avg) + ' ' + unit : '—'}</b></span>
          <span class="gs-stat-item"><span class="gs-stat-label">${t('gamesession.metric_max')}</span><b>${hasData ? fmt(stat.max) + ' ' + unit : '—'}</b></span>
        </div>
        <div class="gs-tip hidden"></div>
      `;
      grid.appendChild(card);
      const canvas = card.querySelector('canvas');
      const values = (lastSession.samples || []).map((s) => s[metric]);
      const times = (lastSession.samples || []).map((s) => s.t);
      drawSessionChart(canvas, times, values, METRIC_COLOR[metric] || 'var(--accent)', unit);
      wireSessionChartHover(canvas, times, values, card.querySelector('.gs-tip'), unit);
    });
    body.querySelector('#gs-back').addEventListener('click', () => { view = 'start'; render(); });
  }

  /* mini chart propio (no depende de app.js): eje X = tiempo real de la
     sesión (segundos desde el inicio), eje Y autoescalado con etiquetas
     mín/máx en el margen izquierdo. color = CSS var string del tema. */
  function drawSessionChart(canvas, times, values, color, unit) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const pts = values.map((v, i) => [times[i], v]).filter(([, v]) => v !== null && v !== undefined);
    if (pts.length < 2) {
      ctx.fillStyle = 'rgba(128,128,128,0.5)';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('—', w / 2, h / 2 + 4);
      return;
    }
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const xSpan = xMax - xMin || 1;
    const ySpan = (yMax - yMin) || 1;
    // margen izquierdo para etiquetas del eje Y
    const padL = 30, padR = 6, padT = 6, padB = 18;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const toX = (x) => padL + ((x - xMin) / xSpan) * plotW;
    const toY = (y) => padT + plotH - ((y - yMin) / ySpan) * plotH;

    // área de la gráfica: fondo sutil
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(padL, padT, plotW, plotH);

    // línea de la gráfica con fill suave debajo
    ctx.save();
    // Obtener el color real computado del CSS variable si es posible
    const lineColor = color;
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      const px = toX(x), py = toY(y);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
    // fill bajo la curva
    ctx.lineTo(toX(xs[xs.length - 1]), padT + plotH);
    ctx.lineTo(toX(xs[0]), padT + plotH);
    ctx.closePath();
    ctx.fillStyle = lineColor.replace(')', ', 0.12)').replace('var(', 'rgba(0,0,0,');
    // fallback: solo aplica si el color es una cadena rgba() directa
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = lineColor;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    // etiquetas eje Y
    ctx.fillStyle = 'rgba(180,180,180,0.7)';
    ctx.font = '9px var(--mono, monospace)';
    ctx.textAlign = 'right';
    ctx.fillText(fmt(yMax), padL - 2, padT + 8);
    ctx.fillText(fmt(yMin), padL - 2, padT + plotH);

    // etiquetas eje X (inicio y fin de sesión)
    ctx.textAlign = 'left';
    ctx.fillText(formatDuration(xMin), padL, h - 2);
    ctx.textAlign = 'right';
    ctx.fillText(formatDuration(xMax), w - padR, h - 2);

    canvas._gsChart = { pts, toX, toY, xMin, xMax, yMin, yMax, padL, padR, padT, padB, plotW, plotH };
  }

  /* Hover sobre la gráfica: crosshair punteado + tooltip con valor y tiempo.
     BUG FIX: el left del tooltip debe escalarse con el ratio CSS/canvas,
     porque el canvas tiene width="400" (canvas coords) pero width:100% CSS.
     Si no se escala, el tooltip aparece desplazado en pantallas densas. */
  function wireSessionChartHover(canvas, times, values, tipEl, unit) {
    canvas.addEventListener('mousemove', (e) => {
      const chart = canvas._gsChart;
      if (!chart || !chart.pts.length) return;
      const rect = canvas.getBoundingClientRect();
      // Convertir coordenadas de pantalla a coordenadas del canvas
      const scaleX = canvas.width / rect.width;
      const mx = (e.clientX - rect.left) * scaleX;
      // Ignora el mousemove fuera del área de datos
      if (mx < chart.padL || mx > chart.padL + chart.plotW) {
        tipEl.classList.add('hidden');
        return;
      }
      // encuentra el punto más cercano en X
      let nearest = chart.pts[0];
      let best = Infinity;
      chart.pts.forEach((p) => {
        const d = Math.abs(chart.toX(p[0]) - mx);
        if (d < best) { best = d; nearest = p; }
      });
      const [tSec, val] = nearest;
      tipEl.classList.remove('hidden');
      tipEl.textContent = `${fmt(val)}${unit ? ' ' + unit : ''} · ${formatDuration(tSec)}`;
      // Posición del tooltip en píxeles CSS (dividir por scaleX)
      const tipX = chart.toX(tSec) / scaleX;
      const maxLeft = rect.width - 80;
      tipEl.style.left = Math.min(maxLeft, Math.max(4, tipX - 30)) + 'px';
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

  /* Vista de comparación manual: dos <select> con las sesiones disponibles */
  function renderCompare(body) {
    if (!sessionsCache.length) {
      body.innerHTML = `<p class="gs-empty">${t('gamesession.no_sessions')}</p>
        <button class="ghost gs-back-btn" id="gs-back">${t('gamesession.back')}</button>`;
      body.querySelector('#gs-back').addEventListener('click', () => { view = 'start'; render(); });
      return;
    }
    const optHtml = sessionsCache.map((s) => {
      const when = s.started_at ? new Date(s.started_at).toLocaleString() : '?';
      const game = (s.game && s.game.name) ? s.game.name : '—';
      const bl = s.baseline ? ' [BASELINE]' : '';
      return `<option value="${escapeHtml(s.id)}">${escapeHtml(game + bl + ' · ' + when)}</option>`;
    }).join('');
    body.innerHTML = `
      <h4>${t('gamesession.compare_title')}</h4>
      <p class="gs-intro">${t('gamesession.pick_two')}</p>
      <div class="gs-compare-pickers">
        <div class="gs-picker-group">
          <label class="gs-picker-label">${t('gamesession.compare_select_a')}</label>
          <select id="gs-pick-a" class="gs-select">${optHtml}</select>
        </div>
        <div class="gs-picker-group">
          <label class="gs-picker-label">${t('gamesession.compare_select_b')}</label>
          <select id="gs-pick-b" class="gs-select">${optHtml}</select>
        </div>
      </div>
      <button class="primary gs-compare-run-btn" id="gs-compare-run">${t('gamesession.compare_run')}</button>
      <button class="ghost gs-back-btn" id="gs-back">${t('gamesession.back')}</button>
    `;
    // Pre-seleccionar: A = baseline (si existe), B = segunda sesión
    const baselineIdx = sessionsCache.findIndex((s) => s.baseline);
    if (baselineIdx >= 0) {
      body.querySelector('#gs-pick-a').selectedIndex = baselineIdx;
      const bIdx = sessionsCache.length > 1 ? (baselineIdx === 0 ? 1 : 0) : 0;
      body.querySelector('#gs-pick-b').selectedIndex = bIdx;
    } else if (sessionsCache.length > 1) {
      body.querySelector('#gs-pick-b').selectedIndex = 1;
    }
    body.querySelector('#gs-compare-run').addEventListener('click', async () => {
      const a = body.querySelector('#gs-pick-a').value;
      const b = body.querySelector('#gs-pick-b').value;
      if (a === b) { flashError({ err: 'Elige dos sesiones distintas para comparar.' }); return; }
      const api = bridge();
      if (!api) return;
      try {
        const res = await api.gameSessionCompare(a, b);
        if (!res || !res.ok) { flashError(res); return; }
        renderCompareResult(res);
      } catch (_) { flashError(null); }
    });
    body.querySelector('#gs-back').addEventListener('click', () => { view = 'start'; render(); });
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
