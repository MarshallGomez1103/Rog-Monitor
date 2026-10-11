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
        'gamesession.minimize_hint': 'Grabando ✓ — puedes minimizar la app: sigue grabando y, oculta, casi no consume.',
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
        'gamesession.minimize_hint': 'Recording ✓ — you can minimize the app: it keeps recording and, hidden, it barely uses any resources.',
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
      fr: {
        'gamesession.minimize_hint': 'Enregistrement en cours ✓ — vous pouvez réduire l’application : elle continue d’enregistrer et, masquée, elle consomme presque rien.',
        'gamesession.onboarding_hint': 'Astuce : enregistrez une session AVANT d’optimiser la machine. Cette session servira de référence « originale » pour comparer chaleur, bruit et consommation avant et après chaque réglage.',
        'gamesession.loading_samples': 'Chargement des données de la session…',
        'gamesession.no_samples': 'Cette session ne contient aucun échantillon enregistré (elle a peut-être été interrompue).',
        'gamesession.compare_select_a': 'Session A (référence)',
        'gamesession.compare_select_b': 'Session B (nouvelle)',
        'gamesession.compare_run': 'Comparer',
        'gamesession.game_a': 'Jeu A',
        'gamesession.game_b': 'Jeu B',
        'gamesession.samples_count': '{n} échantillons',
        'gamesession.chart_hint': 'Cliquez sur un graphique pour l’ouvrir en grand avec zoom',
        'gamesession.chart_zoom_title': 'Molette de la souris pour zoomer · glissez pour faire défiler la chronologie',
        'gamesession.zoom_in': 'Zoom avant',
        'gamesession.zoom_out': 'Zoom arrière',
        'gamesession.zoom_reset': 'Tout afficher',
        'gamesession.cost_title': 'Coût énergétique',
        'gamesession.cost_hint': 'Estimé à partir de la puissance CPU+GPU intégrée dans le temps. À titre indicatif uniquement.',
        'gamesession.cost_energy': 'Énergie consommée',
        'gamesession.cost_price_label': 'Prix de l’électricité',
        'gamesession.cost_per_kwh': 'par kWh',
        'gamesession.cost_total': 'Coût de la session',
        'gamesession.cost_cpu': 'CPU',
        'gamesession.cost_gpu': 'GPU',
        'gamesession.cost_show_cop': 'Afficher aussi en COP',
        'gamesession.cost_cop_rate': 'Tarif COP par kWh',
        'gamesession.cost_no_data': 'Pas assez de données de puissance pour estimer le coût.',
        'gamesession.note_title': 'Notes de la session',
        'gamesession.note_placeholder': 'Notez les réglages essayés (p. ex. profil silencieux, undervolt…)',
        'gamesession.note_saved': 'Note enregistrée',
        'gamesession.compare_panels_title': 'Comparaison de sessions',
        'gamesession.compare_panel_original': 'Originale (référence)',
        'gamesession.compare_panel_new': 'Nouvelle (après réglages)',
        'gamesession.compare_panel_table': 'Différences',
        'gamesession.compare_overlay_hint': 'Cliquez sur une métrique pour superposer les deux sessions',
        'gamesession.compare_overlay_title': 'Superposition',
        'gamesession.compare_legend_a': 'Originale',
        'gamesession.compare_legend_b': 'Nouvelle',
        'gamesession.cooler_short': '{pct}% plus fraîche',
        'gamesession.hotter_short': '{pct}% plus chaude',
        'gamesession.more_short': '{pct}% de plus',
        'gamesession.less_short': '{pct}% de moins',
        'gamesession.compare_energy': 'Énergie',
        'gamesession.compare_saved_energy': '{pct}% d’énergie en moins',
        'gamesession.compare_more_energy': '{pct}% d’énergie en plus',
      },
      it: {
        'gamesession.minimize_hint': 'Registrazione in corso ✓ — puoi ridurre a icona l’app: continua a registrare e, in background, consuma quasi nulla.',
        'gamesession.onboarding_hint': 'Suggerimento: registra una sessione PRIMA di ottimizzare il computer. Quella sessione diventerà il riferimento «originale» per confrontare calore, rumore e consumo prima e dopo ogni modifica.',
        'gamesession.loading_samples': 'Caricamento dei dati della sessione…',
        'gamesession.no_samples': 'Questa sessione non ha campioni registrati (potrebbe essere stata interrotta).',
        'gamesession.compare_select_a': 'Sessione A (riferimento)',
        'gamesession.compare_select_b': 'Sessione B (nuova)',
        'gamesession.compare_run': 'Confronta',
        'gamesession.game_a': 'Gioco A',
        'gamesession.game_b': 'Gioco B',
        'gamesession.samples_count': '{n} campioni',
        'gamesession.chart_hint': 'Clicca su un grafico per aprirlo in grande con lo zoom',
        'gamesession.chart_zoom_title': 'Rotellina del mouse per ingrandire · trascina per spostare la timeline',
        'gamesession.zoom_in': 'Ingrandisci',
        'gamesession.zoom_out': 'Riduci',
        'gamesession.zoom_reset': 'Mostra tutto',
        'gamesession.cost_title': 'Costo energetico',
        'gamesession.cost_hint': 'Stimato dalla potenza di CPU+GPU integrata nel tempo. Solo a scopo indicativo.',
        'gamesession.cost_energy': 'Energia consumata',
        'gamesession.cost_price_label': 'Prezzo dell’elettricità',
        'gamesession.cost_per_kwh': 'per kWh',
        'gamesession.cost_total': 'Costo della sessione',
        'gamesession.cost_cpu': 'CPU',
        'gamesession.cost_gpu': 'GPU',
        'gamesession.cost_show_cop': 'Mostra anche in COP',
        'gamesession.cost_cop_rate': 'Tariffa COP per kWh',
        'gamesession.cost_no_data': 'Dati di potenza insufficienti per stimare il costo.',
        'gamesession.note_title': 'Note della sessione',
        'gamesession.note_placeholder': 'Annota quali modifiche hai provato (es. profilo silenzioso, undervolt…)',
        'gamesession.note_saved': 'Nota salvata',
        'gamesession.compare_panels_title': 'Confronto tra sessioni',
        'gamesession.compare_panel_original': 'Originale (riferimento)',
        'gamesession.compare_panel_new': 'Nuova (dopo le modifiche)',
        'gamesession.compare_panel_table': 'Differenze',
        'gamesession.compare_overlay_hint': 'Clicca su una metrica per sovrapporre le due sessioni',
        'gamesession.compare_overlay_title': 'Sovrapposizione',
        'gamesession.compare_legend_a': 'Originale',
        'gamesession.compare_legend_b': 'Nuova',
        'gamesession.cooler_short': '{pct}% più fredda',
        'gamesession.hotter_short': '{pct}% più calda',
        'gamesession.more_short': '{pct}% in più',
        'gamesession.less_short': '{pct}% in meno',
        'gamesession.compare_energy': 'Energia',
        'gamesession.compare_saved_energy': '{pct}% di energia in meno',
        'gamesession.compare_more_energy': '{pct}% di energia in più',
      },
      pt: {
        'gamesession.minimize_hint': 'Gravando ✓ — você pode minimizar o app: ele continua gravando e, oculto, quase não consome recursos.',
        'gamesession.onboarding_hint': 'Dica: grave uma sessão ANTES de otimizar o equipamento. Essa sessão ficará como referência «original» para comparar calor, ruído e consumo antes e depois de cada ajuste.',
        'gamesession.loading_samples': 'Carregando os dados da sessão…',
        'gamesession.no_samples': 'Esta sessão não tem amostras gravadas (pode ter sido interrompida).',
        'gamesession.compare_select_a': 'Sessão A (referência)',
        'gamesession.compare_select_b': 'Sessão B (nova)',
        'gamesession.compare_run': 'Comparar',
        'gamesession.game_a': 'Jogo A',
        'gamesession.game_b': 'Jogo B',
        'gamesession.samples_count': '{n} amostras',
        'gamesession.chart_hint': 'Clique em um gráfico para abri-lo em tamanho grande com zoom',
        'gamesession.chart_zoom_title': 'Roda do mouse para ampliar · arraste para deslocar a linha de tempo',
        'gamesession.zoom_in': 'Aumentar zoom',
        'gamesession.zoom_out': 'Diminuir zoom',
        'gamesession.zoom_reset': 'Ver tudo',
        'gamesession.cost_title': 'Custo de energia',
        'gamesession.cost_hint': 'Estimado a partir da potência de CPU+GPU integrada ao longo do tempo. Apenas como referência.',
        'gamesession.cost_energy': 'Energia consumida',
        'gamesession.cost_price_label': 'Preço da eletricidade',
        'gamesession.cost_per_kwh': 'por kWh',
        'gamesession.cost_total': 'Custo da sessão',
        'gamesession.cost_cpu': 'CPU',
        'gamesession.cost_gpu': 'GPU',
        'gamesession.cost_show_cop': 'Mostrar também em COP',
        'gamesession.cost_cop_rate': 'Tarifa COP por kWh',
        'gamesession.cost_no_data': 'Não há dados de potência suficientes para estimar o custo.',
        'gamesession.note_title': 'Notas da sessão',
        'gamesession.note_placeholder': 'Anote os ajustes que você testou (ex.: perfil silencioso, undervolt…)',
        'gamesession.note_saved': 'Nota salva',
        'gamesession.compare_panels_title': 'Comparação de sessões',
        'gamesession.compare_panel_original': 'Original (referência)',
        'gamesession.compare_panel_new': 'Nova (após os ajustes)',
        'gamesession.compare_panel_table': 'Diferenças',
        'gamesession.compare_overlay_hint': 'Clique em uma métrica para sobrepor as duas sessões',
        'gamesession.compare_overlay_title': 'Sobreposição',
        'gamesession.compare_legend_a': 'Original',
        'gamesession.compare_legend_b': 'Nova',
        'gamesession.cooler_short': '{pct}% mais fria',
        'gamesession.hotter_short': '{pct}% mais quente',
        'gamesession.more_short': '{pct}% a mais',
        'gamesession.less_short': '{pct}% a menos',
        'gamesession.compare_energy': 'Energia',
        'gamesession.compare_saved_energy': '{pct}% menos energia',
        'gamesession.compare_more_energy': '{pct}% mais energia',
      },
      zh: {
        'gamesession.minimize_hint': '正在录制 ✓ — 可以最小化应用：它会继续录制，隐藏时几乎不占用资源。',
        'gamesession.onboarding_hint': '提示：请在调校设备之前先录制一次会话。该会话将作为“原始”基准，方便您对比每次调整前后的发热、噪音和功耗。',
        'gamesession.loading_samples': '正在加载会话数据…',
        'gamesession.no_samples': '此会话没有已录制的采样数据（可能已被中断）。',
        'gamesession.compare_select_a': '会话 A（基准）',
        'gamesession.compare_select_b': '会话 B（新）',
        'gamesession.compare_run': '对比',
        'gamesession.game_a': '游戏 A',
        'gamesession.game_b': '游戏 B',
        'gamesession.samples_count': '{n} 个采样',
        'gamesession.chart_hint': '点击图表可放大查看并缩放',
        'gamesession.chart_zoom_title': '滚动鼠标滚轮缩放 · 拖动平移时间轴',
        'gamesession.zoom_in': '放大',
        'gamesession.zoom_out': '缩小',
        'gamesession.zoom_reset': '显示全部',
        'gamesession.cost_title': '电费成本',
        'gamesession.cost_hint': '根据 CPU+GPU 功率随时间积分估算，仅供参考。',
        'gamesession.cost_energy': '耗电量',
        'gamesession.cost_price_label': '电价',
        'gamesession.cost_per_kwh': '每 kWh',
        'gamesession.cost_total': '会话成本',
        'gamesession.cost_cpu': 'CPU',
        'gamesession.cost_gpu': 'GPU',
        'gamesession.cost_show_cop': '同时以 COP 显示',
        'gamesession.cost_cop_rate': '每 kWh 的 COP 费率',
        'gamesession.cost_no_data': '功率数据不足，无法估算成本。',
        'gamesession.note_title': '会话备注',
        'gamesession.note_placeholder': '记录你尝试过的调整（例如静音模式、降压…）',
        'gamesession.note_saved': '备注已保存',
        'gamesession.compare_panels_title': '会话对比',
        'gamesession.compare_panel_original': '原始（基准）',
        'gamesession.compare_panel_new': '新（调整后）',
        'gamesession.compare_panel_table': '差异',
        'gamesession.compare_overlay_hint': '点击某项指标可叠加显示两个会话',
        'gamesession.compare_overlay_title': '叠加',
        'gamesession.compare_legend_a': '原始',
        'gamesession.compare_legend_b': '新',
        'gamesession.cooler_short': '温度低 {pct}%',
        'gamesession.hotter_short': '温度高 {pct}%',
        'gamesession.more_short': '多 {pct}%',
        'gamesession.less_short': '少 {pct}%',
        'gamesession.compare_energy': '能耗',
        'gamesession.compare_saved_energy': '节能 {pct}%',
        'gamesession.compare_more_energy': '多耗能 {pct}%',
      },
      ja: {
        'gamesession.minimize_hint': '記録中 ✓ — アプリを最小化しても記録は続きます。非表示の間はほとんどリソースを使いません。',
        'gamesession.onboarding_hint': 'ヒント：本体をチューニングする前にセッションを記録しておきましょう。そのセッションが「元」の基準となり、調整の前後で発熱・騒音・消費電力を比較できます。',
        'gamesession.loading_samples': 'セッションデータを読み込み中…',
        'gamesession.no_samples': 'このセッションには記録されたサンプルがありません（中断された可能性があります）。',
        'gamesession.compare_select_a': 'セッション A（基準）',
        'gamesession.compare_select_b': 'セッション B（新規）',
        'gamesession.compare_run': '比較',
        'gamesession.game_a': 'ゲーム A',
        'gamesession.game_b': 'ゲーム B',
        'gamesession.samples_count': '{n} サンプル',
        'gamesession.chart_hint': 'グラフをクリックすると拡大表示してズームできます',
        'gamesession.chart_zoom_title': 'マウスホイールでズーム · ドラッグでタイムラインを移動',
        'gamesession.zoom_in': 'ズームイン',
        'gamesession.zoom_out': 'ズームアウト',
        'gamesession.zoom_reset': 'すべて表示',
        'gamesession.cost_title': 'エネルギーコスト',
        'gamesession.cost_hint': 'CPU+GPUの電力を時間で積分して推定した値です。参考値としてご利用ください。',
        'gamesession.cost_energy': '消費電力量',
        'gamesession.cost_price_label': '電気料金',
        'gamesession.cost_per_kwh': '1kWhあたり',
        'gamesession.cost_total': 'セッションのコスト',
        'gamesession.cost_cpu': 'CPU',
        'gamesession.cost_gpu': 'GPU',
        'gamesession.cost_show_cop': 'COP でも表示',
        'gamesession.cost_cop_rate': '1kWhあたりのCOPレート',
        'gamesession.cost_no_data': '電力データが不足しているため、コストを推定できません。',
        'gamesession.note_title': 'セッションのメモ',
        'gamesession.note_placeholder': '試した設定をメモしてください（例：静音プロファイル、アンダーボルト…）',
        'gamesession.note_saved': 'メモを保存しました',
        'gamesession.compare_panels_title': 'セッション比較',
        'gamesession.compare_panel_original': '元（基準）',
        'gamesession.compare_panel_new': '新規（調整後）',
        'gamesession.compare_panel_table': '差分',
        'gamesession.compare_overlay_hint': '指標をクリックすると、両方のセッションを重ねて表示します',
        'gamesession.compare_overlay_title': '重ね合わせ',
        'gamesession.compare_legend_a': '元',
        'gamesession.compare_legend_b': '新規',
        'gamesession.cooler_short': '{pct}% 低温',
        'gamesession.hotter_short': '{pct}% 高温',
        'gamesession.more_short': '{pct}% 増',
        'gamesession.less_short': '{pct}% 減',
        'gamesession.compare_energy': 'エネルギー',
        'gamesession.compare_saved_energy': 'エネルギー {pct}% 削減',
        'gamesession.compare_more_energy': 'エネルギー {pct}% 増',
      },
      ko: {
        'gamesession.minimize_hint': '기록 중 ✓ — 앱을 최소화해도 계속 기록되며, 숨겨진 상태에서는 리소스를 거의 사용하지 않습니다.',
        'gamesession.onboarding_hint': '팁: 기기를 튜닝하기 전에 먼저 세션을 기록하세요. 이 세션이 "원본" 기준이 되어 조정 전후의 발열, 소음, 전력 소모를 비교할 수 있습니다.',
        'gamesession.loading_samples': '세션 데이터를 불러오는 중…',
        'gamesession.no_samples': '이 세션에는 기록된 샘플이 없습니다(중단되었을 수 있습니다).',
        'gamesession.compare_select_a': '세션 A (기준)',
        'gamesession.compare_select_b': '세션 B (새 세션)',
        'gamesession.compare_run': '비교',
        'gamesession.game_a': '게임 A',
        'gamesession.game_b': '게임 B',
        'gamesession.samples_count': '샘플 {n}개',
        'gamesession.chart_hint': '그래프를 클릭하면 확대하여 줌 기능으로 볼 수 있습니다',
        'gamesession.chart_zoom_title': '마우스 휠로 확대/축소 · 드래그하여 타임라인 이동',
        'gamesession.zoom_in': '확대',
        'gamesession.zoom_out': '축소',
        'gamesession.zoom_reset': '전체 보기',
        'gamesession.cost_title': '에너지 비용',
        'gamesession.cost_hint': 'CPU+GPU 전력을 시간에 대해 적분하여 추정한 값입니다. 참고용입니다.',
        'gamesession.cost_energy': '소비 에너지',
        'gamesession.cost_price_label': '전기 요금',
        'gamesession.cost_per_kwh': 'kWh당',
        'gamesession.cost_total': '세션 비용',
        'gamesession.cost_cpu': 'CPU',
        'gamesession.cost_gpu': 'GPU',
        'gamesession.cost_show_cop': 'COP로도 표시',
        'gamesession.cost_cop_rate': 'kWh당 COP 요율',
        'gamesession.cost_no_data': '전력 데이터가 부족하여 비용을 추정할 수 없습니다.',
        'gamesession.note_title': '세션 메모',
        'gamesession.note_placeholder': '시도한 조정 사항을 적어 두세요(예: 저소음 프로파일, 언더볼트…)',
        'gamesession.note_saved': '메모가 저장되었습니다',
        'gamesession.compare_panels_title': '세션 비교',
        'gamesession.compare_panel_original': '원본 (기준)',
        'gamesession.compare_panel_new': '신규 (조정 후)',
        'gamesession.compare_panel_table': '차이',
        'gamesession.compare_overlay_hint': '지표를 클릭하면 두 세션을 겹쳐서 볼 수 있습니다',
        'gamesession.compare_overlay_title': '겹쳐 보기',
        'gamesession.compare_legend_a': '원본',
        'gamesession.compare_legend_b': '신규',
        'gamesession.cooler_short': '{pct}% 더 시원함',
        'gamesession.hotter_short': '{pct}% 더 뜨거움',
        'gamesession.more_short': '{pct}% 증가',
        'gamesession.less_short': '{pct}% 감소',
        'gamesession.compare_energy': '에너지',
        'gamesession.compare_saved_energy': '에너지 {pct}% 절감',
        'gamesession.compare_more_energy': '에너지 {pct}% 증가',
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
       window.rog.gameSessionNote(id, text)     -> {ok, note}
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
      // mantener el muestreo vivo aunque se minimice
      try { if (api.setRecording) api.setRecording(true); } catch (_) { /* noop */ }
      // recomendar minimizar para casi no consumir mientras juega
      try { if (typeof toast === 'function') toast(t('gamesession.minimize_hint')); } catch (_) { /* noop */ }
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
    // Se construye UNA vez y luego solo se actualizan los textos que cambiaron:
    // reconstruir el innerHTML cada segundo recreaba el botón DETENER (un clic
    // podía perderse entre el mousedown y el mouseup) y metía trabajo inútil.
    const txt = {
      badge: `● ${t('gamesession.recording')} ${mins}:${secs}`,
      hint: t('gamesession.baseline_hint'),
      gameLbl: `${t('gamesession.detected_game')}:`,
      game: (gameProcs && gameProcs.name) || t('gamesession.no_game_detected'),
      cpu: `${fmt(cpu.avg)} °C`,
      gpu: `${fmt(gpuActive.temp)} °C`,
      gpuw: `${fmt(gpuActive.power)} W`,
      gpuu: `${fmt(gpuActive.util)} %`,
      stop: t('gamesession.stop_btn'),
    };
    if (!body.querySelector('[data-rec]')) {
      body.innerHTML = `
      <p class="gs-recording-badge" data-rec="badge"></p>
      ${active && active.baseline ? '<p class="gs-baseline-hint" data-rec="hint"></p>' : ''}
      <p><span data-rec="gameLbl"></span> <strong data-rec="game"></strong></p>
      <div class="gs-live-grid">
        <div class="gs-live-item"><span>CPU</span><b data-rec="cpu"></b></div>
        <div class="gs-live-item"><span>GPU</span><b data-rec="gpu"></b></div>
        <div class="gs-live-item"><span>GPU W</span><b data-rec="gpuw"></b></div>
        <div class="gs-live-item"><span>GPU %</span><b data-rec="gpuu"></b></div>
      </div>
      <button class="primary gs-stop-btn" id="gs-stop" data-rec="stop"></button>
    `;
      body.querySelector('#gs-stop').addEventListener('click', stopSession);
    }
    body.querySelectorAll('[data-rec]').forEach((el) => {
      const v = txt[el.dataset.rec];
      if (el.textContent !== v) el.textContent = v;
    });
  }

  async function stopSession() {
    const api = bridge();
    if (!api || !active) return;
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    try { if (api.setRecording) api.setRecording(false); } catch (_) { /* noop */ }
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

    const samples = lastSession.samples || [];
    const times = samples.map((s) => s.t);

    body.innerHTML = `
      <div class="gs-summary-head">
        <strong>${escapeHtml(gameName)}</strong>
        ${lastSession.baseline ? `<span class="gs-badge">${t('gamesession.baseline_badge')}</span>` : ''}
        <span class="gs-summary-meta">${t('gamesession.duration')}: <b>${mins}m ${secs}s</b></span>
        ${sampleCount ? `<span class="gs-summary-meta gs-dim">${t('gamesession.samples_count', { n: sampleCount })}</span>` : ''}
      </div>
      ${!sampleCount ? `<p class="gs-warning">${t('gamesession.no_samples')}</p>` : ''}
      ${sampleCount > 1 ? `<p class="gs-chart-hint">${t('gamesession.chart_hint')}</p>` : ''}
      <div class="gs-metric-grid" id="gs-metric-grid"></div>
      <div id="gs-cost"></div>
      <div id="gs-note"></div>
      <button class="ghost gs-back-btn" id="gs-back">${t('gamesession.back')}</button>
    `;

    const grid = body.querySelector('#gs-metric-grid');
    if (!grid) return; // defensa: no debería ocurrir si el HTML está bien

    METRICS.forEach((metric) => {
      const stat = summary[metric] || {};
      const hasData = stat.min !== null && stat.min !== undefined;
      const unit = METRIC_UNIT[metric] || '';
      const values = samples.map((s) => s[metric]);
      const canDraw = values.filter((v) => v != null).length > 1;
      const card = document.createElement('div');
      card.className = 'gs-metric-card' + (canDraw ? ' gs-clickable' : '');
      card.innerHTML = `
        <h5>${t('gamesession.metric_' + metric)}</h5>
        <canvas class="gs-chart" data-metric="${metric}"></canvas>
        <div class="gs-metric-stats">
          <span class="gs-stat-item"><span class="gs-stat-label">${t('gamesession.metric_min')}</span><b>${hasData ? fmt(stat.min) + ' ' + unit : '—'}</b></span>
          <span class="gs-stat-item gs-stat-avg"><span class="gs-stat-label">${t('gamesession.metric_avg')}</span><b>${hasData ? fmt(stat.avg) + ' ' + unit : '—'}</b></span>
          <span class="gs-stat-item"><span class="gs-stat-label">${t('gamesession.metric_max')}</span><b>${hasData ? fmt(stat.max) + ' ' + unit : '—'}</b></span>
        </div>
        <div class="gs-tip hidden"></div>
      `;
      grid.appendChild(card);
      const canvas = card.querySelector('canvas');
      canvas._gsRedraw = () => { canvas._gsChart = drawSessionChart(canvas, times, values, metric, unit); };
      canvas._gsRedraw();
      wireSessionChartHover(canvas, card.querySelector('.gs-tip'),
        () => canvas._gsChart, () => canvas._gsRedraw());
      if (canDraw) {
        canvas.addEventListener('click', () => openZoomModal({
          title: t('gamesession.metric_' + metric),
          times,
          series: [{ values, color: metricColor(metric), unit }],
        }));
      }
    });

    renderCost(body.querySelector('#gs-cost'), summary);
    renderNote(body.querySelector('#gs-note'), lastSession);
    // redibujar tras el layout: el canvas necesita su tamaño real (DPR)
    requestAnimationFrame(() => {
      grid.querySelectorAll('.gs-chart').forEach((c) => { if (c._gsRedraw) c._gsRedraw(); });
    });
    body.querySelector('#gs-back').addEventListener('click', () => { view = 'start'; render(); });
  }

  /* ================================================================
     COSTO EN $ — ∫ potencia CPU+GPU dt (Wh, viene del backend) × $/kWh
  ================================================================= */
  const COST_KWH_KEY = 'gs_cost_per_kwh';      // USD/kWh (persistido)
  const COST_COP_KEY = 'gs_cost_cop_per_kwh';  // COP/kWh (persistido)
  const COST_DEFAULT_USD = 0.15;
  const COST_DEFAULT_COP = 850;                // tasa COP/kWh orientativa, editable

  function lsGet(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : v; }
    catch (_) { return fallback; }
  }
  function lsSet(key, val) { try { localStorage.setItem(key, String(val)); } catch (_) { /* noop */ } }

  function isColombiaLocale() {
    try {
      const l = (navigator.language || '') + ' ' + (navigator.languages || []).join(' ');
      return /es-CO/i.test(l);
    } catch (_) { return false; }
  }

  function fmtMoney(amount, currency) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency', currency, maximumFractionDigits: currency === 'COP' ? 0 : 4,
      }).format(amount);
    } catch (_) {
      return (currency === 'COP' ? '$' : 'US$') + amount.toFixed(currency === 'COP' ? 0 : 4);
    }
  }

  function renderCost(host, summary) {
    if (!host) return;
    const energy = (summary && summary._energy_wh) || {};
    const totalWh = energy.total;
    if (totalWh == null) {
      host.innerHTML = `<div class="gs-cost"><h5>${t('gamesession.cost_title')}</h5>
        <p class="gs-cost-nodata">${t('gamesession.cost_no_data')}</p></div>`;
      return;
    }
    const kwh = totalWh / 1000;
    const showCop = isColombiaLocale();
    const priceUsd = parseFloat(lsGet(COST_KWH_KEY, COST_DEFAULT_USD)) || COST_DEFAULT_USD;
    const rateCop = parseFloat(lsGet(COST_COP_KEY, COST_DEFAULT_COP)) || COST_DEFAULT_COP;

    function totalText(usdPrice, copRate) {
      let txt = fmtMoney(kwh * usdPrice, 'USD');
      if (showCop) txt += ` · ${fmtMoney(kwh * copRate, 'COP')}`;
      return txt;
    }

    host.innerHTML = `
      <div class="gs-cost">
        <h5>${t('gamesession.cost_title')}</h5>
        <p class="gs-cost-hint">${t('gamesession.cost_hint')}</p>
        <div class="gs-cost-grid">
          <div class="gs-cost-cell"><span>${t('gamesession.cost_cpu')}</span><b>${energy.cpu == null ? '—' : fmt(energy.cpu) + ' Wh'}</b></div>
          <div class="gs-cost-cell"><span>${t('gamesession.cost_gpu')}</span><b>${energy.gpu == null ? '—' : fmt(energy.gpu) + ' Wh'}</b></div>
          <div class="gs-cost-cell"><span>${t('gamesession.cost_energy')}</span><b>${fmt(totalWh)} Wh</b></div>
          <div class="gs-cost-cell gs-cost-total"><span>${t('gamesession.cost_total')}</span><b id="gs-cost-amount">${totalText(priceUsd, rateCop)}</b></div>
        </div>
        <div class="gs-cost-price">
          <label>${t('gamesession.cost_price_label')}</label>
          <span class="gs-cost-money">US$</span>
          <input type="number" min="0" step="0.01" id="gs-kwh" class="gs-cost-input" value="${priceUsd}">
          <span class="gs-cost-unit">${t('gamesession.cost_per_kwh')}</span>
        </div>
        ${showCop ? `
        <div class="gs-cost-price">
          <label>${t('gamesession.cost_cop_rate')}</label>
          <span class="gs-cost-money">COP</span>
          <input type="number" min="0" step="1" id="gs-cop" class="gs-cost-input" value="${rateCop}">
          <span class="gs-cost-unit">${t('gamesession.cost_per_kwh')}</span>
        </div>` : ''}
      </div>
    `;

    const amountEl = host.querySelector('#gs-cost-amount');
    function recompute() {
      let p = parseFloat(host.querySelector('#gs-kwh').value);
      if (Number.isNaN(p) || p < 0) p = priceUsd; else lsSet(COST_KWH_KEY, p);
      let r = rateCop;
      const copInput = host.querySelector('#gs-cop');
      if (showCop && copInput) {
        const rv = parseFloat(copInput.value);
        if (!Number.isNaN(rv) && rv >= 0) { r = rv; lsSet(COST_COP_KEY, rv); }
      }
      amountEl.textContent = totalText(p, r);
    }
    host.querySelector('#gs-kwh').addEventListener('input', recompute);
    if (showCop) host.querySelector('#gs-cop')?.addEventListener('input', recompute);
  }

  /* ================================================================
     NOTAS por sesión (persistidas vía backend `note`)
  ================================================================= */
  let noteTimer = null;
  function renderNote(host, session) {
    if (!host) return;
    const note = (session && session.note) || '';
    host.innerHTML = `
      <div class="gs-note">
        <h5>${t('gamesession.note_title')}</h5>
        <textarea id="gs-note-text" class="gs-note-input" rows="2"
          placeholder="${escapeHtml(t('gamesession.note_placeholder'))}">${escapeHtml(note)}</textarea>
        <span class="gs-note-status" id="gs-note-status"></span>
      </div>`;
    const ta = host.querySelector('#gs-note-text');
    const status = host.querySelector('#gs-note-status');
    ta.addEventListener('input', () => {
      if (noteTimer) clearTimeout(noteTimer);
      status.textContent = '…';
      noteTimer = setTimeout(async () => {
        const api = bridge();
        if (!api || !api.gameSessionNote || !session) { status.textContent = ''; return; }
        try {
          await api.gameSessionNote(session.id, ta.value);
          if (lastSession && lastSession.id === session.id) lastSession.note = ta.value;
          status.textContent = t('gamesession.note_saved');
          setTimeout(() => { status.textContent = ''; }, 1500);
        } catch (_) { status.textContent = ''; }
      }, 600);
    });
  }

  /* ================================================================
     MODAL DE ZOOM — gráfica sola, grande, con zoom (rueda) y scroll (arrastre)
     Estilo NÚCLEOS: modal-card propio sobre <body>.
  ================================================================= */
  let zoomModal = null;
  let zoomState = null; // { times, series, title, view, geom, tFull0, tFull1 }

  function ensureZoomModal() {
    if (zoomModal) return zoomModal;
    const div = document.createElement('div');
    div.id = 'gs-zoom-modal';
    div.className = 'modal hidden';
    div.innerHTML = `
      <div class="modal-card wide gs-zoom-card">
        <h3 id="gs-zoom-title"></h3>
        <p class="gs-zoom-hint" id="gs-zoom-hint"></p>
        <div class="gs-zoom-wrap">
          <canvas id="gs-zoom-canvas" class="gs-zoom-canvas"></canvas>
          <div class="gs-tip hidden" id="gs-zoom-tip"></div>
        </div>
        <div class="gs-zoom-controls">
          <button class="ghost small" id="gs-zoom-out" title="${escapeHtml(t('gamesession.zoom_out'))}">−</button>
          <button class="ghost small" id="gs-zoom-reset">${t('gamesession.zoom_reset')}</button>
          <button class="ghost small" id="gs-zoom-in" title="${escapeHtml(t('gamesession.zoom_in'))}">+</button>
        </div>
        <button class="ghost modal-close" id="gs-zoom-close">${t('gamesession.close')}</button>
      </div>`;
    document.body.appendChild(div);
    const close = () => { div.classList.add('hidden'); zoomState = null; };
    div.querySelector('#gs-zoom-close').addEventListener('click', close);
    div.addEventListener('click', (e) => { if (e.target === div) close(); });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !div.classList.contains('hidden')) close();
    });
    const canvas = div.querySelector('#gs-zoom-canvas');
    const tip = div.querySelector('#gs-zoom-tip');

    div.querySelector('#gs-zoom-in').addEventListener('click', () => zoomBy(0.66, 0.5));
    div.querySelector('#gs-zoom-out').addEventListener('click', () => zoomBy(1.5, 0.5));
    div.querySelector('#gs-zoom-reset').addEventListener('click', () => {
      if (!zoomState) return;
      zoomState.view = { t0: zoomState.tFull0, t1: zoomState.tFull1 };
      drawZoom();
    });

    // rueda = zoom centrado en el cursor
    canvas.addEventListener('wheel', (e) => {
      if (!zoomState) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const frac = (e.clientX - rect.left) / rect.width;
      zoomBy(e.deltaY > 0 ? 1.2 : 0.83, Math.max(0, Math.min(1, frac)));
    }, { passive: false });

    // arrastre = pan del eje del tiempo
    let dragX = null, dragView = null;
    canvas.addEventListener('mousedown', (e) => {
      if (!zoomState) return;
      dragX = e.clientX; dragView = { t0: zoomState.view.t0, t1: zoomState.view.t1 };
      canvas.classList.add('gs-dragging');
    });
    window.addEventListener('mouseup', () => { dragX = null; canvas.classList.remove('gs-dragging'); });
    canvas.addEventListener('mousemove', (e) => {
      if (dragX == null || !zoomState) return;
      const rect = canvas.getBoundingClientRect();
      const span = dragView.t1 - dragView.t0;
      const dt = -((e.clientX - dragX) / rect.width) * span;
      let t0 = dragView.t0 + dt, t1 = dragView.t1 + dt;
      if (t0 < zoomState.tFull0) { t1 += (zoomState.tFull0 - t0); t0 = zoomState.tFull0; }
      if (t1 > zoomState.tFull1) { t0 -= (t1 - zoomState.tFull1); t1 = zoomState.tFull1; }
      zoomState.view = { t0: Math.max(zoomState.tFull0, t0), t1: Math.min(zoomState.tFull1, t1) };
      drawZoom();
    });

    // hover tooltip + crosshair (reusa el geom recalculado en drawZoom)
    wireSessionChartHover(canvas, tip, () => zoomState && zoomState.geom, () => {
      if (zoomState) drawZoom();
    });

    window.addEventListener('resize', () => {
      if (!div.classList.contains('hidden')) drawZoom();
    });
    zoomModal = div;
    return div;
  }

  function zoomBy(factor, anchorFrac) {
    if (!zoomState) return;
    const { view, tFull0, tFull1 } = zoomState;
    const span = view.t1 - view.t0;
    const anchor = view.t0 + span * anchorFrac;
    const newSpan = Math.min(tFull1 - tFull0, Math.max(span * factor, 5)); // mín 5 s
    let t0 = anchor - newSpan * anchorFrac;
    let t1 = t0 + newSpan;
    if (t0 < tFull0) { t0 = tFull0; t1 = t0 + newSpan; }
    if (t1 > tFull1) { t1 = tFull1; t0 = t1 - newSpan; }
    zoomState.view = { t0: Math.max(tFull0, t0), t1: Math.min(tFull1, t1) };
    drawZoom();
  }

  function drawZoom() {
    if (!zoomState) return;
    const canvas = zoomModal.querySelector('#gs-zoom-canvas');
    zoomState.geom = drawNeonChart(canvas, zoomState.times, zoomState.series,
      { view: zoomState.view, grid: true, big: true });
  }

  function openZoomModal(cfg) {
    ensureZoomModal();
    const times = cfg.times.filter((tt) => tt != null);
    const tFull0 = times.length ? Math.min(...times) : 0;
    const tFull1 = times.length ? Math.max(...times) : 1;
    zoomState = {
      times: cfg.times, series: cfg.series, title: cfg.title,
      tFull0, tFull1, view: { t0: tFull0, t1: tFull1 }, geom: null,
    };
    zoomModal.querySelector('#gs-zoom-title').textContent = cfg.title;
    const legend = cfg.series.length > 1
      ? cfg.series.map((s) => `<span class="gs-legend"><i style="background:${s.color}"></i>${escapeHtml(s.label || '')}</span>`).join(' ')
      : '';
    zoomModal.querySelector('#gs-zoom-hint').innerHTML =
      (legend ? legend + ' · ' : '') + escapeHtml(t('gamesession.chart_zoom_title'));
    zoomModal.classList.remove('hidden');
    requestAnimationFrame(drawZoom);
  }

  /* ================================================================
     MOTOR DE GRÁFICA NEÓN (igual calidad que bench-detail.js)
     Soporta una o varias series, viewport (zoom/scroll en X), grilla
     `--chart-grid`, degradado bajo la curva y autoescalado en Y.
       series: [{ values:[…], color:'#hex', label, unit }]
       opts:   { view:{t0,t1} | null, grid:true, dpr:true }
     Devuelve la geometría para el hover.
  ================================================================= */
  function drawNeonChart(canvas, times, series, opts) {
    opts = opts || {};
    const ctx = canvas.getContext('2d');
    // Tamaño real (CSS px) con soporte DPR para que se vea nítido.
    const cssW = canvas.clientWidth || canvas.width || 400;
    const cssH = canvas.clientHeight || canvas.height || 90;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const dim = cv('--dim', '#8a8a8a');
    const grid = cv('--chart-grid', cv('--hair', '#333'));
    ctx.font = '10px var(--mono, ui-monospace, monospace)';

    // dominio X (viewport o rango completo)
    const allT = times.filter((t) => t != null);
    const tFull0 = allT.length ? Math.min(...allT) : 0;
    const tFull1 = allT.length ? Math.max(...allT) : 1;
    const view = opts.view || { t0: tFull0, t1: tFull1 };
    const xMin = view.t0, xMax = view.t1;
    const xSpan = (xMax - xMin) || 1;

    // valores visibles (dentro del viewport) para autoescalar Y
    let vis = [];
    series.forEach((se) => {
      se.values.forEach((v, i) => {
        const t = times[i];
        if (v == null || t == null) return;
        if (t < xMin - xSpan * 0.02 || t > xMax + xSpan * 0.02) return;
        vis.push(v);
      });
    });
    if (!vis.length) series.forEach((se) => se.values.forEach((v) => { if (v != null) vis.push(v); }));

    const big = opts.big;
    const padL = big ? 52 : 34, padR = big ? 14 : 8, padT = big ? 14 : 8, padB = big ? 26 : 18;
    const plotW = cssW - padL - padR;
    const plotH = cssH - padT - padB;

    if (vis.length < 2) {
      ctx.fillStyle = dim; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('—', cssW / 2, padT + plotH / 2);
      return null;
    }

    let yMin = Math.min(...vis), yMax = Math.max(...vis);
    if (yMin === yMax) { yMin -= 1; yMax += 1; }
    const yPad = (yMax - yMin) * 0.1; yMin -= yPad; yMax += yPad;
    const ySpan = (yMax - yMin) || 1;

    const toX = (t) => padL + ((t - xMin) / xSpan) * plotW;
    const toY = (v) => padT + plotH - ((v - yMin) / ySpan) * plotH;

    // grilla Y + etiquetas
    ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    ctx.lineWidth = 1; ctx.strokeStyle = grid;
    const rows = big ? 5 : 4;
    for (let i = 0; i <= rows; i++) {
      const v = yMin + (ySpan * i) / rows;
      const y = toY(v);
      ctx.globalAlpha = 0.22;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(cssW - padR, y); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = dim;
      ctx.fillText(fmt(v), padL - 5, y);
    }
    // etiquetas X (inicio … fin del viewport)
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    ctx.fillStyle = dim;
    ctx.fillText(formatDuration(xMin), padL, cssH - padB + 5);
    ctx.textAlign = 'right';
    ctx.fillText(formatDuration(xMax), cssW - padR, cssH - padB + 5);
    if (big) {
      // marcas X intermedias para sesiones largas
      ctx.textAlign = 'center';
      for (let i = 1; i < 4; i++) {
        const t = xMin + (xSpan * i) / 4;
        ctx.fillText(formatDuration(t), toX(t), cssH - padB + 5);
      }
    }

    // series: degradado bajo la curva (1ª serie) + línea neón
    series.forEach((se, idx) => {
      const pts = [];
      se.values.forEach((v, i) => {
        const t = times[i];
        if (v == null || t == null) return;
        pts.push([toX(t), toY(v)]);
      });
      if (pts.length < 2) return;
      // área bajo la curva con degradado (solo 1ª serie o serie única)
      if (idx === 0 || series.length === 1) {
        ctx.beginPath();
        pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
        ctx.lineTo(pts[pts.length - 1][0], padT + plotH);
        ctx.lineTo(pts[0][0], padT + plotH);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, padT, 0, padT + plotH);
        g.addColorStop(0, withAlpha(se.color, 0.32));
        g.addColorStop(1, withAlpha(se.color, 0));
        ctx.fillStyle = g;
        ctx.fill();
      }
      // línea
      ctx.beginPath();
      ctx.strokeStyle = se.color;
      ctx.lineWidth = big ? 2.2 : 1.8;
      ctx.lineJoin = 'round';
      ctx.shadowColor = withAlpha(se.color, 0.5);
      ctx.shadowBlur = big ? 8 : 4;
      pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
      ctx.stroke();
      ctx.shadowBlur = 0;
    });

    return { times, series, toX, toY, xMin, xMax, yMin, yMax, padL, padR, padT, padB, plotW, plotH };
  }

  /* Gráfica del resumen: una sola métrica, color resuelto del tema. */
  function drawSessionChart(canvas, times, values, metric, unit) {
    const color = metricColor(metric);
    return drawNeonChart(canvas, times, [{ values, color, label: '', unit }], { grid: true });
  }

  /* Hover: tooltip con valor + tiempo del punto más cercano dentro del viewport.
     Escala coordenadas de pantalla→CSS px (el canvas usa DPR internamente, pero
     getBoundingClientRect ya está en px CSS, así que basta con restar el rect). */
  /* Crosshair (rayita vertical + punto) sobre la gráfica, dibujado en las
     mismas coords CSS-px que drawNeonChart (el contexto ya tiene el transform
     DPR aplicado tras el último redraw). */
  function overlayGsCrosshair(canvas, chart, tSec, color) {
    if (!chart) return;
    const ctx = canvas.getContext('2d');
    const cx = chart.toX(tSec);
    ctx.save();
    ctx.strokeStyle = cv('--dim', '#8a8a8a');
    ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, chart.padT); ctx.lineTo(cx, chart.padT + chart.plotH); ctx.stroke();
    ctx.setLineDash([]);
    // un punto por cada serie en ese instante
    chart.series.forEach((se) => {
      let bv = null, bd = Infinity;
      se.values.forEach((v, i) => {
        const t = chart.times[i];
        if (v == null || t == null) return;
        const d = Math.abs(t - tSec);
        if (d < bd) { bd = d; bv = v; }
      });
      if (bv == null) return;
      const cy = chart.toY(bv);
      ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = se.color || color; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = cv('--bg', '#0b0d10'); ctx.stroke();
    });
    ctx.restore();
  }

  function wireSessionChartHover(canvas, tipEl, geomGetter, redrawFn) {
    // Coalescer por frame: los eventos mousemove disparan más rápido que el
    // refresco de pantalla; redibujar la gráfica neón en cada uno la dejaba
    // lenta. Guardamos solo las últimas coords y procesamos 1 vez por frame.
    let pendingX = null, rafId = 0;

    function process() {
      rafId = 0;
      if (pendingX == null) return;
      const clientX = pendingX; pendingX = null;
      let chart = geomGetter ? geomGetter() : canvas._gsChart;
      if (!chart) { tipEl.classList.add('hidden'); return; }
      const rect = canvas.getBoundingClientRect();
      const mx = clientX - rect.left;
      if (mx < chart.padL || mx > chart.padL + chart.plotW) {
        tipEl.classList.add('hidden');
        if (redrawFn) redrawFn();
        return;
      }
      // serie principal: punto más cercano en X dentro del viewport
      const se = chart.series[0];
      let nearest = null, best = Infinity;
      se.values.forEach((v, i) => {
        const t = chart.times[i];
        if (v == null || t == null || t < chart.xMin || t > chart.xMax) return;
        const d = Math.abs(chart.toX(t) - mx);
        if (d < best) { best = d; nearest = [t, v]; }
      });
      if (!nearest) { tipEl.classList.add('hidden'); return; }
      const [tSec, val] = nearest;
      // redibujar base + crosshair (como en el historial)
      if (redrawFn) { redrawFn(); chart = geomGetter ? geomGetter() : canvas._gsChart; }
      overlayGsCrosshair(canvas, chart, tSec, se.color);
      const u = se.unit || '';
      tipEl.classList.remove('hidden');
      tipEl.textContent = `${fmt(val)}${u ? ' ' + u : ''} · ${formatDuration(tSec)}`;
      // posicionar el tooltip JUNTO al punto (no pegado arriba)
      const tipX = canvas.offsetLeft + chart.toX(tSec);
      const tipTop = canvas.offsetTop + chart.toY(val) - 26;
      const maxLeft = canvas.offsetLeft + rect.width - 8;
      tipEl.style.left = Math.min(maxLeft, Math.max(canvas.offsetLeft + 8, tipX)) + 'px';
      tipEl.style.top = Math.max(2, tipTop) + 'px';
    }

    canvas.addEventListener('mousemove', (e) => {
      pendingX = e.clientX;
      if (!rafId) rafId = requestAnimationFrame(process);
    });
    canvas.addEventListener('mouseleave', () => {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      pendingX = null;
      tipEl.classList.add('hidden');
      if (redrawFn) redrawFn();
    });
  }

  function formatDuration(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  /* ---- comparar ---- */
  /* Pide al backend el diff Y las dos sesiones completas (con samples) para
     poder dibujar los 3 paneles con gráficas neón y la superposición. */
  async function runCompare(idA, idB) {
    const api = bridge();
    if (!api) return;
    try {
      const [res, sa, sb] = await Promise.all([
        api.gameSessionCompare(idA, idB),
        api.gameSessionGet(idA),
        api.gameSessionGet(idB),
      ]);
      if (!res || !res.ok) { flashError(res); return; }
      renderCompareResult(res, (sa && sa.session) || null, (sb && sb.session) || null);
    } catch (_) {
      flashError(null);
    }
  }

  async function compareWithBaseline(sessionId) {
    const api = bridge();
    if (!api) return;
    try {
      const baseRes = await api.gameSessionBaseline();
      const baselineId = baseRes && baseRes.session_id;
      if (!baselineId) { flashError({ err: t('gamesession.no_sessions') }); return; }
      await runCompare(baselineId, sessionId);
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
      if (a === b) { flashError({ err: t('gamesession.pick_two') }); return; }
      await runCompare(a, b);
    });
    body.querySelector('#gs-back').addEventListener('click', () => { view = 'start'; render(); });
  }

  /* Métricas destacadas en los paneles de comparación (las más útiles para
     ver el efecto de un tweak). Todas siguen disponibles en la tabla. */
  const COMPARE_PANEL_METRICS = ['cpu_temp', 'gpu_temp', 'cpu_watts', 'gpu_watts'];

  /* Frase corta del % por métrica, p. ej. "15% más fría". */
  function diffPhrase(metric, pct) {
    if (pct == null) return '—';
    const abs = Math.abs(pct);
    const lowerBetter = !['gpu_util'].includes(metric);
    const isTemp = metric === 'cpu_temp' || metric === 'gpu_temp';
    if (isTemp) {
      return t(pct < 0 ? 'gamesession.cooler_short' : 'gamesession.hotter_short', { pct: abs });
    }
    // potencia / RPM / RAM: menos es mejor → "X% menos / más"
    void lowerBetter;
    return t(pct < 0 ? 'gamesession.less_short' : 'gamesession.more_short', { pct: abs });
  }

  function renderCompareResult(result, sessA, sessB) {
    buildModal();
    const body = $('gs-body');
    if (!body) return;
    const verdictText = verdictHeadline(result);
    const recs = recommendations(result);

    const samplesA = (sessA && sessA.samples) || [];
    const samplesB = (sessB && sessB.samples) || [];
    const timesA = samplesA.map((s) => s.t);
    const timesB = samplesB.map((s) => s.t);
    const canChart = samplesA.length > 1 && samplesB.length > 1;

    const gameA = (result.a && result.a.game && result.a.game.name) || t('gamesession.compare_legend_a');
    const gameB = (result.b && result.b.game && result.b.game.name) || t('gamesession.compare_legend_b');
    const colorA = cv('--dim', '#8a8a8a');         // referencia: tenue
    const colorB = cv('--accent', '#f25c3d');      // nueva: acento

    // mini-paneles por métrica (gráfica + frase de diferencia)
    function panelCharts(samples, times, side) {
      if (!canChart) return `<p class="gs-cmp-nochart">${t('gamesession.no_samples')}</p>`;
      return `<div class="gs-cmp-charts">${COMPARE_PANEL_METRICS.map((m) => `
        <div class="gs-cmp-mini gs-clickable" data-metric="${m}" data-side="${side}">
          <span class="gs-cmp-mini-label">${t('gamesession.metric_' + m)}</span>
          <canvas class="gs-cmp-canvas" data-metric="${m}" data-side="${side}"></canvas>
        </div>`).join('')}</div>`;
    }

    // tabla de diferencias en % con frase corta por métrica
    const rowsHtml = METRICS.map((m) => {
      const d = result.diffs[m] || {};
      const pct = d.diff_percent;
      const isTemp = m === 'cpu_temp' || m === 'gpu_temp';
      const good = pct != null && (isTemp ? pct < 0 : pct < 0);
      const cls = pct == null ? '' : (good ? 'gs-diff-down' : pct > 0 ? 'gs-diff-up' : '');
      return `<tr class="gs-clickable gs-cmp-row" data-metric="${m}">
        <td>${t('gamesession.metric_' + m)}</td>
        <td>${fmt(d.a_avg)}</td>
        <td>${fmt(d.b_avg)}</td>
        <td class="${cls}">${pct == null ? '—' : (pct > 0 ? '+' : '') + pct + '%'}</td>
        <td class="gs-cmp-phrase ${cls}">${diffPhrase(m, pct)}</td>
      </tr>`;
    }).join('');

    // fila de energía (costo/consumo) si el backend la trae
    const eA = (result.a && result.a.energy_wh && result.a.energy_wh.total);
    const eB = (result.b && result.b.energy_wh && result.b.energy_wh.total);
    let energyRow = '';
    if (eA != null && eB != null && eA > 0) {
      const ePct = Math.round((eB - eA) * 100 / Math.abs(eA));
      const cls = ePct < 0 ? 'gs-diff-down' : ePct > 0 ? 'gs-diff-up' : '';
      const phrase = ePct < 0
        ? t('gamesession.compare_saved_energy', { pct: Math.abs(ePct) })
        : t('gamesession.compare_more_energy', { pct: Math.abs(ePct) });
      energyRow = `<tr>
        <td>${t('gamesession.compare_energy')}</td>
        <td>${fmt(eA)} Wh</td>
        <td>${fmt(eB)} Wh</td>
        <td class="${cls}">${ePct > 0 ? '+' : ''}${ePct}%</td>
        <td class="gs-cmp-phrase ${cls}">${phrase}</td>
      </tr>`;
    }

    body.innerHTML = `
      <h4>${t('gamesession.compare_panels_title')}</h4>
      <p class="gs-verdict gs-verdict-${result.verdict}">${verdictText}</p>
      ${canChart ? `<p class="gs-chart-hint">${t('gamesession.compare_overlay_hint')}</p>` : ''}
      <div class="gs-cmp-panels">
        <div class="gs-cmp-panel">
          <h5 class="gs-cmp-head"><span class="gs-cmp-dot" style="background:${colorA}"></span>${t('gamesession.compare_panel_original')}<small>${escapeHtml(gameA)}</small></h5>
          ${panelCharts(samplesA, timesA, 'a')}
        </div>
        <div class="gs-cmp-panel">
          <h5 class="gs-cmp-head"><span class="gs-cmp-dot" style="background:${colorB}"></span>${t('gamesession.compare_panel_new')}<small>${escapeHtml(gameB)}</small></h5>
          ${panelCharts(samplesB, timesB, 'b')}
        </div>
        <div class="gs-cmp-panel gs-cmp-panel-table">
          <h5 class="gs-cmp-head">${t('gamesession.compare_panel_table')}</h5>
          <table class="gs-compare-table">
            <thead><tr>
              <th></th>
              <th>${t('gamesession.compare_legend_a')}</th>
              <th>${t('gamesession.compare_legend_b')}</th>
              <th>%</th>
              <th></th>
            </tr></thead>
            <tbody>${rowsHtml}${energyRow}</tbody>
          </table>
        </div>
      </div>
      <div class="gs-recommend">
        <h5>${t('gamesession.recommend_title')}</h5>
        <ul>${recs.map((r) => `<li>${r}</li>`).join('')}</ul>
      </div>
      <button class="ghost gs-back-btn" id="gs-back">${t('gamesession.back')}</button>
    `;

    // dibujar mini-gráficas neón de cada panel
    if (canChart) {
      requestAnimationFrame(() => {
        body.querySelectorAll('.gs-cmp-canvas').forEach((c) => {
          const m = c.getAttribute('data-metric');
          const side = c.getAttribute('data-side');
          const samples = side === 'a' ? samplesA : samplesB;
          const times = side === 'a' ? timesA : timesB;
          const vals = samples.map((s) => s[m]);
          drawNeonChart(c, times, [{ values: vals, color: side === 'a' ? colorA : colorB, unit: METRIC_UNIT[m] || '' }], { grid: true });
        });
      });
    }

    // clic en métrica (mini-panel o fila de tabla) → superposición de ambas
    function openOverlay(metric) {
      if (!canChart) return;
      const u = METRIC_UNIT[metric] || '';
      openZoomModal({
        title: t('gamesession.metric_' + metric) + ' — ' + t('gamesession.compare_overlay_title'),
        // dos series sobre el mismo eje de tiempo: usamos el eje de A como base
        times: timesA.length >= timesB.length ? timesA : timesB,
        series: [
          { values: padSeries(samplesA, (timesA.length >= timesB.length ? timesA : timesB), metric), color: colorA, label: t('gamesession.compare_legend_a'), unit: u },
          { values: padSeries(samplesB, (timesA.length >= timesB.length ? timesA : timesB), metric), color: colorB, label: t('gamesession.compare_legend_b'), unit: u },
        ],
      });
    }
    body.querySelectorAll('.gs-cmp-mini').forEach((el) =>
      el.addEventListener('click', () => openOverlay(el.getAttribute('data-metric'))));
    body.querySelectorAll('.gs-cmp-row').forEach((el) =>
      el.addEventListener('click', () => openOverlay(el.getAttribute('data-metric'))));

    body.querySelector('#gs-back').addEventListener('click', () => { view = 'start'; render(); });
    view = 'compare-result';
  }

  /* Remuestrea una serie sobre un eje de tiempo de referencia, tomando el
     valor de la muestra más cercana en el tiempo (vecino más próximo). Así
     dos sesiones de distinta duración se pueden superponer sobre un eje común. */
  function padSeries(samples, refTimes, metric) {
    const pts = samples.map((s) => [s.t, s[metric]]).filter(([tt, v]) => tt != null && v != null);
    if (!pts.length) return refTimes.map(() => null);
    return refTimes.map((rt) => {
      if (rt == null) return null;
      let best = null, bestD = Infinity;
      for (const [tt, v] of pts) {
        const d = Math.abs(tt - rt);
        if (d < bestD) { bestD = d; best = v; }
      }
      return best;
    });
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
