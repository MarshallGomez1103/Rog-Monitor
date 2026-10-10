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

  /* ---- i18n: namespace bench.detail.* ---- */
  if (window.i18n && typeof window.i18n.register === 'function') {
    window.i18n.register({
      'bench.detail.close':          { es: 'Cerrar',      en: 'Close',     fr: 'Fermer',     it: 'Chiudi',    pt: 'Fechar',    zh: '关闭',   ja: '閉じる',         ko: '닫기' },
      'bench.detail.tool_label':     { es: 'herramienta', en: 'tool',      fr: 'outil',      it: 'strumento', pt: 'ferramenta', zh: '工具',  ja: 'ツール',         ko: '도구' },
      'bench.detail.summary_h4':     { es: 'Resumen',     en: 'Summary',   fr: 'Résumé',     it: 'Riepilogo', pt: 'Resumo',    zh: '摘要',   ja: 'サマリー',       ko: '요약' },
      'bench.detail.nochart':        { es: 'Este benchmark no guardó la serie de tiempo segundo a segundo (es un resultado antiguo o sin muestras), así que no hay gráficas. Lanza un benchmark nuevo para verlas.',
                                       en: 'This benchmark did not save a second-by-second time series (it is an old result or has no samples), so there are no charts. Run a new benchmark to see them.',
                                       fr: 'Ce benchmark n\'a pas enregistré la série temporelle seconde par seconde (c\'est un ancien résultat ou sans échantillons), donc il n\'y a pas de graphiques. Lancez un nouveau benchmark pour les voir.',
                                       it: 'Questo benchmark non ha salvato la serie temporale secondo per secondo (è un risultato vecchio o senza campioni), quindi non ci sono grafici. Avvia un nuovo benchmark per vederli.',
                                       pt: 'Este benchmark não guardou a série de tempo segundo a segundo (é um resultado antigo ou sem amostras), por isso não há gráficos. Lance um benchmark novo para os ver.',
                                       zh: '该基准测试未保存逐秒时间序列（是旧结果或无样本），因此没有图表。运行新的基准测试来查看图表。',
                                       ja: 'このベンチマークは秒ごとの時系列を保存しませんでした（古い結果またはサンプルなし）。グラフはありません。新しいベンチマークを実行して確認してください。',
                                       ko: '이 벤치마크는 초 단위 시계열을 저장하지 않았습니다(이전 결과이거나 샘플이 없음). 차트가 없습니다. 새 벤치마크를 실행하여 확인하세요.' },
      'bench.detail.ev_throttle_yes':{ es: 'Throttling térmico: {count} eventos ({ms} ms acumulados). La CPU bajó frecuencia por calor.',
                                       en: 'Thermal throttling: {count} events ({ms} ms accumulated). The CPU reduced frequency due to heat.',
                                       fr: 'Throttling thermique : {count} événements ({ms} ms accumulés). Le CPU a réduit la fréquence en raison de la chaleur.',
                                       it: 'Throttling termico: {count} eventi ({ms} ms accumulati). La CPU ha ridotto la frequenza per il calore.',
                                       pt: 'Throttling térmico: {count} eventos ({ms} ms acumulados). A CPU baixou a frequência por causa do calor.',
                                       zh: '热降频：{count} 次事件（累计 {ms} ms）。CPU因过热降低了频率。',
                                       ja: 'サーマルスロットリング：{count} 回のイベント（累計 {ms} ms）。CPUは熱により周波数を下げました。',
                                       ko: '열 스로틀링: {count}회 이벤트 ({ms} ms 누적). CPU가 열로 인해 주파수를 낮췄습니다.' },
      'bench.detail.ev_throttle_no': { es: 'Sin throttling térmico durante la prueba.',
                                       en: 'No thermal throttling during the test.',
                                       fr: 'Pas de throttling thermique pendant le test.',
                                       it: 'Nessun throttling termico durante il test.',
                                       pt: 'Sem throttling térmico durante o teste.',
                                       zh: '测试期间无热降频。',
                                       ja: 'テスト中にサーマルスロットリングはありませんでした。',
                                       ko: '테스트 중 열 스로틀링 없음.' },
      'bench.detail.ev_cap_exceeded':{ es: 'El tope de RPM de ventiladores fue EXCEDIDO durante la prueba.',
                                       en: 'The fan RPM cap was EXCEEDED during the test.',
                                       fr: 'La limite de RPM des ventilateurs a été DÉPASSÉE pendant le test.',
                                       it: 'Il limite RPM dei ventilatori è stato SUPERATO durante il test.',
                                       pt: 'O topo de RPM de ventoinhas foi EXCEDIDO durante o teste.',
                                       zh: '测试期间风扇转速上限被超出。',
                                       ja: 'テスト中にファンのRPM上限が超過されました。',
                                       ko: '테스트 중 팬 RPM 상한이 초과되었습니다.' },
      'bench.detail.ev_cap_ok':      { es: 'Tope de RPM de ventiladores respetado.',
                                       en: 'Fan RPM cap respected.',
                                       fr: 'Limite de RPM des ventilateurs respectée.',
                                       it: 'Limite RPM dei ventilatori rispettato.',
                                       pt: 'Topo de RPM de ventoinhas respeitado.',
                                       zh: '风扇转速上限已遵守。',
                                       ja: 'ファンのRPM上限が遵守されました。',
                                       ko: '팬 RPM 상한 준수.' },
      'bench.detail.ev_peak_temp':   { es: 'Pico de temperatura: {peak}°C a los {t}s.',
                                       en: 'Temperature peak: {peak}°C at {t}s.',
                                       fr: 'Pic de température : {peak}°C à {t}s.',
                                       it: 'Picco di temperatura: {peak}°C a {t}s.',
                                       pt: 'Pico de temperatura: {peak}°C aos {t}s.',
                                       zh: '温度峰值：{t}s 时 {peak}°C。',
                                       ja: '温度ピーク：{t}秒で {peak}°C。',
                                       ko: '온도 최고점: {t}초에 {peak}°C.' },
      'bench.detail.ev_temp_trend':  { es: 'Temperatura: empezó en {from}°C y terminó en {to}°C ({delta}°C).',
                                       en: 'Temperature: started at {from}°C and ended at {to}°C ({delta}°C).',
                                       fr: 'Température : a commencé à {from}°C et s\'est terminée à {to}°C ({delta}°C).',
                                       it: 'Temperatura: iniziata a {from}°C e terminata a {to}°C ({delta}°C).',
                                       pt: 'Temperatura: começou em {from}°C e terminou em {to}°C ({delta}°C).',
                                       zh: '温度：从 {from}°C 开始，到 {to}°C 结束（{delta}°C）。',
                                       ja: '温度：{from}°C から始まり {to}°C で終了（{delta}°C）。',
                                       ko: '온도: {from}°C에서 시작하여 {to}°C로 종료 ({delta}°C).' },
      'bench.detail.ev_watts_trend': { es: 'Consumo: {from} W → {to} W (máx {max} W).',
                                       en: 'Power: {from} W → {to} W (max {max} W).',
                                       fr: 'Consommation : {from} W → {to} W (max {max} W).',
                                       it: 'Consumo: {from} W → {to} W (max {max} W).',
                                       pt: 'Consumo: {from} W → {to} W (máx {max} W).',
                                       zh: '功耗：{from} W → {to} W（最大 {max} W）。',
                                       ja: '電力：{from} W → {to} W（最大 {max} W）。',
                                       ko: '전력: {from} W → {to} W (최대 {max} W).' },
      'bench.detail.chart_gpu_temp': { es: 'GPU · Temperatura', en: 'GPU · Temperature', fr: 'GPU · Température', it: 'GPU · Temperatura', pt: 'GPU · Temperatura', zh: 'GPU · 温度', ja: 'GPU · 温度', ko: 'GPU · 온도' },
      'bench.detail.chart_gpu_power':{ es: 'GPU · Consumo', en: 'GPU · Power', fr: 'GPU · Puissance', it: 'GPU · Consumo', pt: 'GPU · Consumo', zh: 'GPU · 功耗', ja: 'GPU · 電力', ko: 'GPU · 전력' },
      'bench.detail.chart_gpu_util': { es: 'GPU · Uso', en: 'GPU · Usage', fr: 'GPU · Utilisation', it: 'GPU · Uso', pt: 'GPU · Uso', zh: 'GPU · 使用率', ja: 'GPU · 使用率', ko: 'GPU · 사용량' },
      'bench.detail.chart_cpu_temp': { es: 'CPU · Temperatura', en: 'CPU · Temperature', fr: 'CPU · Température', it: 'CPU · Temperatura', pt: 'CPU · Temperatura', zh: 'CPU · 温度', ja: 'CPU · 温度', ko: 'CPU · 온도' },
      'bench.detail.chart_cpu_power':{ es: 'CPU · Consumo', en: 'CPU · Power', fr: 'CPU · Puissance', it: 'CPU · Consumo', pt: 'CPU · Consumo', zh: 'CPU · 功耗', ja: 'CPU · 電力', ko: 'CPU · 전력' },
      'bench.detail.series_gpu_temp':{ es: 'Temp GPU', en: 'GPU Temp', fr: 'Temp GPU', it: 'Temp GPU', pt: 'Temp GPU', zh: 'GPU 温度', ja: 'GPU 温度', ko: 'GPU 온도' },
      'bench.detail.series_watts':   { es: 'Vatios', en: 'Watts', fr: 'Watts', it: 'Watt', pt: 'Watts', zh: '瓦特', ja: 'ワット', ko: '와트' },
      'bench.detail.series_gpu_util':{ es: 'Uso', en: 'Usage', fr: 'Utilisation', it: 'Uso', pt: 'Uso', zh: '使用率', ja: '使用率', ko: '사용량' },
      'bench.detail.series_cpu_avg': { es: 'Núcleos (prom.)', en: 'Cores (avg)', fr: 'Cœurs (moy.)', it: 'Core (media)', pt: 'Núcleos (méd.)', zh: '核心（平均）', ja: 'コア（平均）', ko: '코어(평균)' },
      'bench.detail.series_cpu_pkg': { es: 'Paquete', en: 'Package', fr: 'Paquet', it: 'Pacchetto', pt: 'Pacote', zh: '封装', ja: 'パッケージ', ko: '패키지' },
      'bench.detail.series_rapl':    { es: 'Vatios (RAPL)', en: 'Watts (RAPL)', fr: 'Watts (RAPL)', it: 'Watt (RAPL)', pt: 'Watts (RAPL)', zh: '瓦特 (RAPL)', ja: 'ワット (RAPL)', ko: '와트 (RAPL)' },
      'bench.detail.stat_gpu_temp_max': { es: 'GPU máx', en: 'GPU max', fr: 'GPU max', it: 'GPU max', pt: 'GPU máx', zh: 'GPU 最大', ja: 'GPU 最大', ko: 'GPU 최대' },
      'bench.detail.stat_gpu_watts_max':{ es: 'GPU W máx', en: 'GPU W max', fr: 'GPU W max', it: 'GPU W max', pt: 'GPU W máx', zh: 'GPU W 最大', ja: 'GPU W 最大', ko: 'GPU W 최대' },
      'bench.detail.stat_gpu_util_max': { es: 'GPU uso máx', en: 'GPU usage max', fr: 'Util. GPU max', it: 'Uso GPU max', pt: 'Uso GPU máx', zh: 'GPU 使用率最大', ja: 'GPU 使用率最大', ko: 'GPU 사용량 최대' },
      'bench.detail.stat_cpu_temp_max': { es: 'CPU máx', en: 'CPU max', fr: 'CPU max', it: 'CPU max', pt: 'CPU máx', zh: 'CPU 最大', ja: 'CPU 最大', ko: 'CPU 최대' },
      'bench.detail.stat_cpu_package':  { es: 'CPU paquete', en: 'CPU package', fr: 'Package CPU', it: 'Package CPU', pt: 'CPU pacote', zh: 'CPU 封装', ja: 'CPU パッケージ', ko: 'CPU 패키지' },
      'bench.detail.stat_cpu_watts_max':{ es: 'CPU W máx', en: 'CPU W max', fr: 'CPU W max', it: 'CPU W max', pt: 'CPU W máx', zh: 'CPU W 最大', ja: 'CPU W 最大', ko: 'CPU W 최대' },
      'bench.detail.stat_throttle':  { es: 'Throttle', en: 'Throttle', fr: 'Throttle', it: 'Throttle', pt: 'Throttle', zh: '降频', ja: 'スロットル', ko: '스로틀' },
      'bench.detail.stat_duration':  { es: 'Duración', en: 'Duration', fr: 'Durée', it: 'Durata', pt: 'Duração', zh: '时长', ja: '時間', ko: '시간' },
      'bench.detail.throttle_value': { es: '{count} ev · {ms} ms', en: '{count} ev · {ms} ms', fr: '{count} év · {ms} ms', it: '{count} ev · {ms} ms', pt: '{count} ev · {ms} ms', zh: '{count} 次 · {ms} ms', ja: '{count} 件 · {ms} ms', ko: '{count}회 · {ms} ms' },
      'bench.detail.fans_max':       { es: 'Ventiladores (máx): {fans}', en: 'Fans (max): {fans}', fr: 'Ventilateurs (max) : {fans}', it: 'Ventole (max): {fans}', pt: 'Ventoinhas (máx): {fans}', zh: '风扇（最大）：{fans}', ja: 'ファン（最大）: {fans}', ko: '팬(최대): {fans}' },
      'bench.tool_cpu':              { es: 'CPU al 100% (carga sintética)',
                                       en: 'CPU at 100% (synthetic load)',
                                       fr: 'CPU à 100% (charge synthétique)',
                                       it: 'CPU al 100% (carico sintetico)',
                                       pt: 'CPU a 100% (carga sintética)',
                                       zh: 'CPU 100%（合成负载）',
                                       ja: 'CPU 100%（合成負荷）',
                                       ko: 'CPU 100% (합성 부하)' },
      'bench.tool_gpu':              { es: 'GPU al 100% (carga sintética)',
                                       en: 'GPU at 100% (synthetic load)',
                                       fr: 'GPU à 100% (charge synthétique)',
                                       it: 'GPU al 100% (carico sintetico)',
                                       pt: 'GPU a 100% (carga sintética)',
                                       zh: 'GPU 100%（合成负载）',
                                       ja: 'GPU 100%（合成負荷）',
                                       ko: 'GPU 100% (합성 부하)' },
      'bench.detail.header':         { es: 'ROG Monitor — registro de eventos ({date})',
                                       en: 'ROG Monitor — event log ({date})',
                                       fr: 'ROG Monitor — journal des événements ({date})',
                                       it: 'ROG Monitor — registro degli eventi ({date})',
                                       pt: 'ROG Monitor — registo de eventos ({date})',
                                       zh: 'ROG Monitor — 事件日志（{date}）',
                                       ja: 'ROG Monitor — イベントログ（{date}）',
                                       ko: 'ROG Monitor — 이벤트 로그 ({date})' },
    });
  }

  /* ---- CP-7.05..7.09: condiciones, estadística y exportación (bloque contiguo) ---- */
  if (window.i18n && typeof window.i18n.register === 'function') {
    window.i18n.register({
      'bench.detail.stats_h4': { es: 'Estadísticas (sin calentamiento)', en: 'Statistics (warm-up excluded)', fr: 'Statistiques (hors préchauffage)', it: 'Statistiche (riscaldamento escluso)', pt: 'Estatísticas (sem aquecimento)', zh: '统计（不含预热）', ja: '統計（ウォームアップ除外）', ko: '통계 (워밍업 제외)' },
      'bench.detail.col_metric': { es: 'Métrica', en: 'Metric', fr: 'Métrique', it: 'Metrica', pt: 'Métrica', zh: '指标', ja: '指標', ko: '지표' },
      'bench.detail.col_mean': { es: 'Media', en: 'Mean', fr: 'Moyenne', it: 'Media', pt: 'Média', zh: '平均', ja: '平均', ko: '평균' },
      'bench.detail.col_min': { es: 'Mín', en: 'Min', fr: 'Min', it: 'Min', pt: 'Mín', zh: '最小', ja: '最小', ko: '최소' },
      'bench.detail.col_max': { es: 'Máx', en: 'Max', fr: 'Max', it: 'Max', pt: 'Máx', zh: '最大', ja: '最大', ko: '최대' },
      'bench.detail.col_sd': { es: 'Desv.', en: 'SD', fr: 'Éc.-type', it: 'Dev. st.', pt: 'Desv.', zh: '标准差', ja: '標準偏差', ko: '표준편차' },
      'bench.detail.stats_note': { es: 'Percentiles por interpolación lineal inclusiva (tipo 7). {n} muestras medidas, {warm} s de calentamiento excluidos.', en: 'Percentiles use inclusive linear interpolation (type 7). {n} measured samples, {warm} s of warm-up excluded.', fr: 'Percentiles par interpolation linéaire inclusive (type 7). {n} échantillons mesurés, {warm} s de préchauffage exclues.', it: 'Percentili con interpolazione lineare inclusiva (tipo 7). {n} campioni misurati, {warm} s di riscaldamento esclusi.', pt: 'Percentis por interpolação linear inclusiva (tipo 7). {n} amostras medidas, {warm} s de aquecimento excluídos.', zh: '百分位数采用包含式线性插值（类型 7）。{n} 个有效样本，已排除 {warm} 秒预热。', ja: 'パーセンタイルは包含的線形補間（タイプ7）。測定サンプル {n} 件、ウォームアップ {warm} 秒を除外。', ko: '백분위수는 포함형 선형 보간(유형 7). 측정 샘플 {n}개, 워밍업 {warm}초 제외.' },
      'bench.detail.m_cpu_temp': { es: 'Temp. CPU (°C)', en: 'CPU temp (°C)', fr: 'Temp. CPU (°C)', it: 'Temp. CPU (°C)', pt: 'Temp. CPU (°C)', zh: 'CPU 温度 (°C)', ja: 'CPU 温度 (°C)', ko: 'CPU 온도 (°C)' },
      'bench.detail.m_cpu_package': { es: 'Paquete CPU (°C)', en: 'CPU package (°C)', fr: 'Package CPU (°C)', it: 'Package CPU (°C)', pt: 'Package CPU (°C)', zh: 'CPU 封装 (°C)', ja: 'CPU パッケージ (°C)', ko: 'CPU 패키지 (°C)' },
      'bench.detail.m_cpu_watts': { es: 'Consumo CPU (W)', en: 'CPU power (W)', fr: 'Conso CPU (W)', it: 'Consumo CPU (W)', pt: 'Consumo CPU (W)', zh: 'CPU 功耗 (W)', ja: 'CPU 電力 (W)', ko: 'CPU 전력 (W)' },
      'bench.detail.m_cpu_freq': { es: 'Frecuencia CPU (GHz)', en: 'CPU clock (GHz)', fr: 'Fréquence CPU (GHz)', it: 'Frequenza CPU (GHz)', pt: 'Frequência CPU (GHz)', zh: 'CPU 频率 (GHz)', ja: 'CPU クロック (GHz)', ko: 'CPU 클럭 (GHz)' },
      'bench.detail.m_cpu_util': { es: 'Uso CPU (%)', en: 'CPU load (%)', fr: 'Charge CPU (%)', it: 'Carico CPU (%)', pt: 'Uso da CPU (%)', zh: 'CPU 占用 (%)', ja: 'CPU 使用率 (%)', ko: 'CPU 사용률 (%)' },
      'bench.detail.m_gpu_temp': { es: 'Temp. GPU (°C)', en: 'GPU temp (°C)', fr: 'Temp. GPU (°C)', it: 'Temp. GPU (°C)', pt: 'Temp. GPU (°C)', zh: 'GPU 温度 (°C)', ja: 'GPU 温度 (°C)', ko: 'GPU 온도 (°C)' },
      'bench.detail.m_gpu_watts': { es: 'Consumo GPU (W)', en: 'GPU power (W)', fr: 'Conso GPU (W)', it: 'Consumo GPU (W)', pt: 'Consumo GPU (W)', zh: 'GPU 功耗 (W)', ja: 'GPU 電力 (W)', ko: 'GPU 전력 (W)' },
      'bench.detail.m_gpu_util': { es: 'Uso GPU (%)', en: 'GPU load (%)', fr: 'Charge GPU (%)', it: 'Carico GPU (%)', pt: 'Uso da GPU (%)', zh: 'GPU 占用 (%)', ja: 'GPU 使用率 (%)', ko: 'GPU 사용률 (%)' },
      'bench.detail.m_gpu_clock': { es: 'Reloj GPU (MHz)', en: 'GPU clock (MHz)', fr: 'Fréquence GPU (MHz)', it: 'Frequenza GPU (MHz)', pt: 'Clock GPU (MHz)', zh: 'GPU 频率 (MHz)', ja: 'GPU クロック (MHz)', ko: 'GPU 클럭 (MHz)' },
      'bench.detail.cond_h4': { es: 'Condiciones del run', en: 'Run conditions', fr: 'Conditions du test', it: 'Condizioni del test', pt: 'Condições do teste', zh: '运行条件', ja: '実行条件', ko: '실행 조건' },
      'bench.detail.cond_none': { es: 'Este resultado es anterior al esquema 2: no guardó las condiciones del run.', en: 'This result predates schema 2: run conditions were not saved.', fr: 'Ce résultat précède le schéma 2 : les conditions du test n\'ont pas été enregistrées.', it: 'Questo risultato è precedente allo schema 2: le condizioni del test non sono state salvate.', pt: 'Este resultado é anterior ao esquema 2: as condições do teste não foram guardadas.', zh: '此结果早于架构 2：未保存运行条件。', ja: 'この結果はスキーマ2より前のため、実行条件は保存されていません。', ko: '이 결과는 스키마 2 이전 것이라 실행 조건이 저장되지 않았습니다.' },
      'bench.detail.c_app': { es: 'App / esquema', en: 'App / schema', fr: 'App / schéma', it: 'App / schema', pt: 'App / esquema', zh: '应用 / 架构', ja: 'アプリ / スキーマ', ko: '앱 / 스키마' },
      'bench.detail.c_cpu': { es: 'CPU', en: 'CPU', fr: 'CPU', it: 'CPU', pt: 'CPU', zh: 'CPU', ja: 'CPU', ko: 'CPU' },
      'bench.detail.c_gpu': { es: 'GPU / driver', en: 'GPU / driver', fr: 'GPU / driver', it: 'GPU / driver', pt: 'GPU / driver', zh: 'GPU / driver', ja: 'GPU / driver', ko: 'GPU / driver' },
      'bench.detail.c_kernel': { es: 'Kernel', en: 'Kernel', fr: 'Kernel', it: 'Kernel', pt: 'Kernel', zh: 'Kernel', ja: 'Kernel', ko: 'Kernel' },
      'bench.detail.c_power': { es: 'Alimentación', en: 'Power source', fr: 'Alimentation', it: 'Alimentazione', pt: 'Alimentação', zh: '供电', ja: '電源', ko: '전원' },
      'bench.detail.c_power_ac': { es: 'Corriente (AC)', en: 'AC power', fr: 'Secteur (AC)', it: 'Rete (AC)', pt: 'Tomada (AC)', zh: '交流电 (AC)', ja: 'AC電源', ko: 'AC 전원' },
      'bench.detail.c_power_bat': { es: 'Batería', en: 'Battery', fr: 'Batterie', it: 'Batteria', pt: 'Bateria', zh: '电池', ja: 'バッテリー', ko: '배터리' },
      'bench.detail.c_profile': { es: 'Perfil ASUS / PPD', en: 'ASUS / PPD profile', fr: 'Profil ASUS / PPD', it: 'Profilo ASUS / PPD', pt: 'Perfil ASUS / PPD', zh: 'ASUS / PPD 配置', ja: 'ASUS / PPD プロファイル', ko: 'ASUS / PPD 프로필' },
      'bench.detail.c_epp': { es: 'EPP / governor', en: 'EPP / governor', fr: 'EPP / governor', it: 'EPP / governor', pt: 'EPP / governor', zh: 'EPP / governor', ja: 'EPP / governor', ko: 'EPP / governor' },
      'bench.detail.c_fan': { es: 'Tope de ventiladores', en: 'Fan cap', fr: 'Limite ventilateurs', it: 'Limite ventole', pt: 'Limite das ventoinhas', zh: '风扇转速上限', ja: 'ファン上限', ko: '팬 상한' },
      'bench.detail.c_guardian': { es: 'Guardián', en: 'Guardian', fr: 'Gardien', it: 'Guardiano', pt: 'Guardião', zh: '守护', ja: 'ガーディアン', ko: '가디언' },
      'bench.detail.c_ambient': { es: 'Temp. al iniciar', en: 'Start temp', fr: 'Temp. au départ', it: 'Temp. iniziale', pt: 'Temp. inicial', zh: '起始温度', ja: '開始温度', ko: '시작 온도' },
      'bench.detail.c_threads': { es: 'Hilos de carga', en: 'Load threads', fr: 'Threads de charge', it: 'Thread di carico', pt: 'Threads de carga', zh: '负载线程', ja: '負荷スレッド', ko: '부하 스레드' },
      'bench.detail.c_timing': { es: 'Duración', en: 'Duration', fr: 'Durée', it: 'Durata', pt: 'Duração', zh: '时长', ja: '時間', ko: '지속 시간' },
      'bench.detail.timing_value': { es: '{seconds} s medidos + {warmup} s calentamiento × {reps}', en: '{seconds} s measured + {warmup} s warm-up × {reps}', fr: '{seconds} s mesurées + {warmup} s préchauffage × {reps}', it: '{seconds} s misurati + {warmup} s riscaldamento × {reps}', pt: '{seconds} s medidos + {warmup} s aquecimento × {reps}', zh: '测量 {seconds} 秒 + 预热 {warmup} 秒 × {reps}', ja: '測定 {seconds} 秒 + ウォームアップ {warmup} 秒 × {reps}', ko: '측정 {seconds}초 + 워밍업 {warmup}초 × {reps}' },
      'bench.detail.stat_score': { es: 'Rendimiento', en: 'Throughput', fr: 'Débit', it: 'Throughput', pt: 'Desempenho', zh: '吞吐量', ja: 'スループット', ko: '처리량' },
      'bench.detail.score_value': { es: '{score} iter/s ({per} por hilo)', en: '{score} iter/s ({per} per thread)', fr: '{score} iter/s ({per} par thread)', it: '{score} iter/s ({per} per thread)', pt: '{score} iter/s ({per} por thread)', zh: '{score} iter/s（每线程 {per}）', ja: '{score} iter/s（スレッドあたり {per}）', ko: '{score} iter/s (스레드당 {per})' },
      'bench.detail.stat_cv': { es: 'CV entre repeticiones', en: 'CV across repetitions', fr: 'CV entre répétitions', it: 'CV tra ripetizioni', pt: 'CV entre repetições', zh: '重复间变异系数', ja: '反復間CV', ko: '반복 간 CV' },
      'bench.detail.warn_start_hot': { es: 'Arranque en caliente en la repetición {rep}: CPU a {temp}°C (límite {limit}°C). El resultado puede salir peor de lo normal.', en: 'Hot start in repetition {rep}: CPU at {temp}°C (limit {limit}°C). The result may be worse than normal.', fr: 'Démarrage à chaud à la répétition {rep} : CPU à {temp}°C (limite {limit}°C). Le résultat peut être moins bon que d\'habitude.', it: 'Avvio a caldo nella ripetizione {rep}: CPU a {temp}°C (limite {limit}°C). Il risultato potrebbe essere peggiore del normale.', pt: 'Arranque a quente na repetição {rep}: CPU a {temp}°C (limite {limit}°C). O resultado pode ficar pior do que o normal.', zh: '第 {rep} 次重复起始温度偏高：CPU {temp}°C（上限 {limit}°C）。结果可能低于正常水平。', ja: '反復 {rep} は高温で開始：CPU {temp}°C（上限 {limit}°C）。結果が通常より低くなる可能性があります。', ko: '반복 {rep} 시작 시 온도가 높음: CPU {temp}°C (한계 {limit}°C). 결과가 평소보다 나쁠 수 있습니다.' },
      'bench.detail.opt_warmup': { es: 'Calentamiento (s)', en: 'Warm-up (s)', fr: 'Préchauffage (s)', it: 'Riscaldamento (s)', pt: 'Aquecimento (s)', zh: '预热 (秒)', ja: 'ウォームアップ (秒)', ko: '워밍업 (초)' },
      'bench.detail.opt_reps': { es: 'Repeticiones', en: 'Repetitions', fr: 'Répétitions', it: 'Ripetizioni', pt: 'Repetições', zh: '重复次数', ja: '反復回数', ko: '반복 횟수' },
      'bench.detail.exported_csv': { es: 'Benchmark guardado en {path} y {csv}', en: 'Benchmark saved to {path} and {csv}', fr: 'Benchmark enregistré dans {path} et {csv}', it: 'Benchmark salvato in {path} e {csv}', pt: 'Benchmark guardado em {path} e {csv}', zh: '基准测试已保存到 {path} 和 {csv}', ja: 'ベンチマークを {path} と {csv} に保存しました', ko: '벤치마크를 {path} 및 {csv}에 저장했습니다' },
    });
  }

  /* ---- local t() shim ---- */
  function _t(key, vars) {
    try { return (typeof window.t === 'function') ? window.t(key, vars) : key; }
    catch (_) { return key; }
  }

  let modal = null;
  let titleEl = null;
  let subEl = null;
  let bodyEl = null;
  let tipEl = null;          // tooltip de hover (compartido por las gráficas)
  let current = null;        // item abierto
  let chartDefs = [];        // [{ id, series, unit }] para redibujar en resize
  let chartSamples = [];     // samples del item abierto
  const chartGeom = new Map(); // id canvas -> geometría para el crosshair/hover

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
        <div class="benchd-foot">
          <button class="ghost" id="benchd-export" data-i18n="common.export">EXPORTAR</button>
          <button class="ghost modal-close" id="benchd-close" data-i18n="bench.detail.close">Cerrar</button>
        </div>
      </div>
      <div class="benchd-tip hidden" id="benchd-tip"></div>`;
    document.body.appendChild(modal);
    titleEl = modal.querySelector('#benchd-title');
    subEl = modal.querySelector('#benchd-sub');
    bodyEl = modal.querySelector('#benchd-body');
    tipEl = modal.querySelector('#benchd-tip');
    modal.querySelector('#benchd-close').addEventListener('click', close);
    modal.querySelector('#benchd-export').addEventListener('click', () => exportItem(current));
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

    // guardar geometría para el hover (crosshair + tooltip como en el historial)
    if (canvas.id) {
      chartGeom.set(canvas.id, {
        samples, series, unit, X, Y, padL, padR, padT, gw, gh, w, h, tMin, tMax,
      });
    }
  }

  function redrawCharts() {
    chartDefs.forEach((def) => {
      const c = document.getElementById(def.id);
      if (c) drawChart(c, chartSamples, def.series, def.unit);
    });
  }

  /* Crosshair + tooltip: punto más cercano en X de la 1ª serie. Igual que el
     hover del historial — flechita/crosshair, rayita vertical y valor+tiempo. */
  function overlayCrosshair(canvas, g, sIdx, color) {
    const s = g.samples[sIdx];
    const t = s.t == null ? 0 : s.t;
    const ctx = canvas.getContext('2d');
    const cx = g.X(t);
    ctx.save();
    ctx.strokeStyle = _cv('--dim', '#8a8a8a');
    ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, g.padT); ctx.lineTo(cx, g.padT + g.gh); ctx.stroke();
    ctx.setLineDash([]);
    g.series.forEach((se) => {
      const v = s[se.key]; if (v == null) return;
      const cy = g.Y(v);
      ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = se.color; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = _cv('--bg', '#0b0d10'); ctx.stroke();
    });
    ctx.restore();
  }

  function wireChartHover(canvas) {
    canvas.addEventListener('mousemove', (e) => {
      const g = chartGeom.get(canvas.id);
      if (!g || !g.samples.length) { if (tipEl) tipEl.classList.add('hidden'); return; }
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      if (mx < g.padL || mx > g.padL + g.gw) { tipEl.classList.add('hidden'); return; }
      // muestra más cercana en X
      let best = Infinity, bi = 0;
      g.samples.forEach((s, i) => {
        const t = s.t == null ? 0 : s.t;
        const d = Math.abs(g.X(t) - mx);
        if (d < best) { best = d; bi = i; }
      });
      drawChart(canvas, chartSamples, g.series, g.unit); // redibuja base
      const g2 = chartGeom.get(canvas.id);
      overlayCrosshair(canvas, g2, bi, null);
      // tooltip: tiempo + cada serie
      const s = g2.samples[bi];
      const tSec = s.t == null ? 0 : s.t;
      const vals = g2.series
        .filter((se) => s[se.key] != null)
        .map((se) => `${_fmt(s[se.key], 1)}${g2.unit || ''}`)
        .join(' · ');
      tipEl.textContent = `${Math.round(tSec)}s · ${vals}`;
      tipEl.classList.remove('hidden');
      const tw = tipEl.offsetWidth;
      const cx = rect.left + g2.X(tSec);
      tipEl.style.left = Math.min(Math.max(cx - tw / 2, 8), window.innerWidth - tw - 8) + 'px';
      tipEl.style.top = (rect.top - 30) + 'px';
    });
    canvas.addEventListener('mouseleave', () => {
      if (tipEl) tipEl.classList.add('hidden');
      const g = chartGeom.get(canvas.id);
      if (g) drawChart(canvas, chartSamples, g.series, g.unit);
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
        { title: _t('bench.detail.chart_gpu_temp'), unit: '°C',
          series: [{ key: 'gpu_temp', color: accent, label: _t('bench.detail.series_gpu_temp') }] },
        { title: _t('bench.detail.chart_gpu_power'), unit: ' W',
          series: [{ key: 'gpu_watts', color: accent2, label: _t('bench.detail.series_watts') }] },
        { title: _t('bench.detail.chart_gpu_util'), unit: '%',
          series: [{ key: 'gpu_util', color: green, label: _t('bench.detail.series_gpu_util') }] },
      ];
    }
    return [
      { title: _t('bench.detail.chart_cpu_temp'), unit: '°C',
        series: [
          { key: 'cpu_temp', color: accent, label: _t('bench.detail.series_cpu_avg') },
          { key: 'cpu_package', color: accent2, label: _t('bench.detail.series_cpu_pkg') },
        ] },
      { title: _t('bench.detail.chart_cpu_power'), unit: ' W',
        series: [{ key: 'cpu_watts', color: green, label: _t('bench.detail.series_rapl') }] },
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
      if (thr > 0) ev.push({ type: 'crit', text: _t('bench.detail.ev_throttle_yes', { count: thr, ms: s.throttle_ms ?? 0 }) });
      else ev.push({ type: 'ok', text: _t('bench.detail.ev_throttle_no') });
    }
    // tope de ventiladores
    if (s.cap_respected === false) ev.push({ type: 'crit', text: _t('bench.detail.ev_cap_exceeded') });
    else if (s.cap_respected === true) ev.push({ type: 'ok', text: _t('bench.detail.ev_cap_ok') });

    if (samples.length > 1) {
      // pico de temperatura
      let peak = null, peakT = null;
      samples.forEach((sm) => { const v = sm[tempKey]; if (v != null && (peak == null || v > peak)) { peak = v; peakT = sm.t; } });
      if (peak != null) {
        ev.push({ type: peak >= 90 ? 'crit' : peak >= 80 ? 'warn' : 'ok',
          text: _t('bench.detail.ev_peak_temp', { peak: _fmt(peak, 1), t: _fmt(peakT, 0) }) });
      }
      // antes → después
      const first = samples[0] || {}, last = samples[samples.length - 1] || {};
      if (first[tempKey] != null && last[tempKey] != null) {
        const d = last[tempKey] - first[tempKey];
        ev.push({ type: 'info', text: _t('bench.detail.ev_temp_trend', { from: _fmt(first[tempKey], 1), to: _fmt(last[tempKey], 1), delta: (d >= 0 ? '+' : '') + _fmt(d, 1) }) });
      }
      if (first[wKey] != null && last[wKey] != null) {
        const wmax = isGpu ? s.gpu_watts_max : s.cpu_watts_max;
        ev.push({ type: 'info', text: _t('bench.detail.ev_watts_trend', { from: _fmt(first[wKey], 1), to: _fmt(last[wKey], 1), max: _fmt(wmax, 1) }) });
      }
    }
    (item.warnings || []).forEach((w) => {
      if (w.code === 'start_hot') {
        ev.push({ type: 'warn', text: _t('bench.detail.warn_start_hot', { rep: w.rep, temp: _fmt(w.cpu_temp, 1), limit: _fmt(w.limit, 0) }) });
      }
    });
    return ev;
  }

  function statsGrid(item, isGpu) {
    const s = item.summary || {};
    const cells = isGpu ? [
      { l: _t('bench.detail.stat_gpu_temp_max'), v: s.gpu_temp_max != null ? `${_fmt(s.gpu_temp_max, 1)} °C` : '--', accent: s.gpu_temp_max >= 85 },
      { l: _t('bench.detail.stat_gpu_watts_max'), v: s.gpu_watts_max != null ? `${_fmt(s.gpu_watts_max, 1)} W` : '--' },
      { l: _t('bench.detail.stat_gpu_util_max'), v: s.gpu_util_max != null ? `${_fmt(s.gpu_util_max, 0)} %` : '--' },
      { l: _t('bench.detail.stat_throttle'), v: _t('bench.detail.throttle_value', { count: s.throttle_events ?? 0, ms: s.throttle_ms ?? 0 }), accent: (s.throttle_events ?? 0) > 10 },
      { l: _t('bench.detail.stat_duration'), v: item.seconds != null ? `${item.seconds} s` : '--' },
    ] : [
      { l: _t('bench.detail.stat_cpu_temp_max'), v: s.cpu_temp_max != null ? `${_fmt(s.cpu_temp_max, 1)} °C` : '--', accent: s.cpu_temp_max >= 90 },
      { l: _t('bench.detail.stat_cpu_package'), v: s.cpu_package_max != null ? `${_fmt(s.cpu_package_max, 1)} °C` : '--' },
      { l: _t('bench.detail.stat_cpu_watts_max'), v: s.cpu_watts_max != null ? `${_fmt(s.cpu_watts_max, 1)} W` : '--' },
      { l: _t('bench.detail.stat_throttle'), v: _t('bench.detail.throttle_value', { count: s.throttle_events ?? 0, ms: s.throttle_ms ?? 0 }), accent: (s.throttle_events ?? 0) > 10 },
      { l: _t('bench.detail.stat_duration'), v: item.seconds != null ? `${item.seconds} s` : '--' },
    ];
    let grid = `<div class="bench-detail-grid">${cells.map((c) =>
      `<div class="bench-detail-cell"><label>${_esc(c.l)}</label><b${c.accent ? ' class="accent"' : ''}>${_esc(c.v)}</b></div>`).join('')}</div>`;

    const fanEntries = Object.entries(s.fan_rpm_max || {});
    if (fanEntries.length) {
      const fans = fanEntries.map(([k, v]) => `<b>${_esc(k)}: ${v} RPM</b>`).join(' · ');
      grid += `<div class="bench-detail-fans">${_t('bench.detail.fans_max', { fans })}</div>`;
    }
    return grid;
  }

  /* ============================================================
     CP-7.05..7.09 — estadística, condiciones y exportación
     ============================================================ */
  const STAT_I18N = {
    cpu_temp: 'm_cpu_temp', cpu_package: 'm_cpu_package', cpu_watts: 'm_cpu_watts',
    cpu_freq_ghz: 'm_cpu_freq', cpu_util: 'm_cpu_util', gpu_temp: 'm_gpu_temp',
    gpu_watts: 'm_gpu_watts', gpu_util: 'm_gpu_util', gpu_clock_mhz: 'm_gpu_clock',
  };

  /* Tabla de percentiles del agregado (muestras medidas; el warm-up ya viene fuera). */
  function statsTable(item, isGpu) {
    const agg = item.stats && item.stats.aggregate;
    if (!agg) return '';
    const keys = Object.keys(STAT_I18N).filter((k) => agg[k] &&
      (isGpu ? (k.startsWith('gpu_') || k === 'cpu_temp' || k === 'cpu_watts') : k.startsWith('cpu_')));
    if (!keys.length) return '';
    keys.sort((a, b) => (isGpu ? (b.startsWith('gpu_') - a.startsWith('gpu_')) : 0));
    const th = ['col_metric', 'col_mean', 'col_min', 'p50', 'p95', 'p99', 'col_max', 'col_sd']
      .map((k) => `<th>${_esc(k.startsWith('col_') ? _t('bench.detail.' + k) : k)}</th>`).join('');
    const rows = keys.map((k) => {
      const st = agg[k]; const d = k === 'cpu_freq_ghz' ? 2 : 1;
      const cells = [st.mean, st.min, st.p50, st.p95, st.p99, st.max, st.stdev]
        .map((v) => `<td>${_esc(v == null ? '--' : _fmt(v, d))}</td>`).join('');
      return `<tr><th scope="row">${_esc(_t('bench.detail.' + STAT_I18N[k]))}</th>${cells}</tr>`;
    }).join('');
    const n = agg[keys[0]].n;
    return `<h4 class="benchd-h4">${_esc(_t('bench.detail.stats_h4'))}</h4>
      <div class="benchd-table-wrap"><table class="benchd-table"><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table></div>
      <p class="benchd-note">${_esc(_t('bench.detail.stats_note', { n, warm: item.warmup_seconds || 0 }))}</p>`;
  }

  /* Rendimiento (iter/s) y CV entre repeticiones, si el run los trae. */
  function scoreGrid(item) {
    const cells = [];
    const th = item.throughput;
    if (th && th.score_ips != null) {
      cells.push([_t('bench.detail.stat_score'), _t('bench.detail.score_value', {
        score: Math.round(th.score_ips).toLocaleString(), per: Math.round(th.per_thread_ips).toLocaleString() })]);
      if (th.cv_pct != null) cells.push([_t('bench.detail.stat_cv') + ' · iter/s', `${_fmt(th.cv_pct, 2)} %`]);
    }
    const cv = (item.stats && item.stats.cv_across_reps_pct) || {};
    Object.keys(cv).filter((k) => STAT_I18N[k] && (item.kind === 'gpu' ? k.startsWith('gpu_') : k.startsWith('cpu_')))
      .forEach((k) => cells.push([_t('bench.detail.stat_cv') + ' · ' + _t('bench.detail.' + STAT_I18N[k]), `${_fmt(cv[k], 2)} %`]));
    if (!cells.length) return '';
    return `<div class="bench-detail-grid">${cells.map(([l, v]) =>
      `<div class="bench-detail-cell wide"><label>${_esc(l)}</label><b>${_esc(v)}</b></div>`).join('')}</div>`;
  }

  /* Condiciones del run (hardware, energía, perfiles, térmica de arranque). */
  function conditionsBlock(item) {
    const c = item.conditions;
    const h = `<h4 class="benchd-h4">${_esc(_t('bench.detail.cond_h4'))}</h4>`;
    if (!c) return `${h}<p class="benchd-nochart">${_esc(_t('bench.detail.cond_none'))}</p>`;
    const dash = (v) => (v == null || v === '' ? '--' : v);
    const caps = Object.entries(c.fan_caps || {}).map(([k, v]) => `${k.replace('_fan', '')} ${v}`).join(' · ');
    const g = c.guardian || {}; const amb = c.ambient_start || {};
    const cells = [
      ['c_app', `${dash(c.app_version)} · schema ${dash(c.schema || item.schema)}`],
      ['c_cpu', dash(c.cpu_model), 1],
      ['c_gpu', `${dash(c.gpu_name)} · ${dash(c.gpu_driver)}`, 1],
      ['c_kernel', dash(c.kernel)],
      ['c_power', c.power_source === 'ac' ? _t('bench.detail.c_power_ac')
        : c.power_source === 'battery' ? _t('bench.detail.c_power_bat') : '--'],
      ['c_profile', `${dash(c.asus_profile)} / ${dash(c.ppd_profile)}`],
      ['c_epp', `${dash(c.epp)} / ${dash(c.governor)}`],
      ['c_fan', dash(caps)],
      ['c_guardian', `${dash(g.mode)}${g.thermal_state ? ' · ' + g.thermal_state : ''}`],
      ['c_ambient', `CPU ${amb.cpu_temp != null ? _fmt(amb.cpu_temp, 1) : '--'} °C · GPU ${amb.gpu_temp != null ? _fmt(amb.gpu_temp, 1) : '--'} °C`],
      ['c_threads', dash(c.threads)],
      ['c_timing', _t('bench.detail.timing_value', { seconds: dash(c.seconds), warmup: dash(c.warmup_seconds), reps: dash(c.repetitions) }), 1],
    ];
    return `${h}<div class="bench-detail-grid">${cells.map(([k, v, wide]) =>
      `<div class="bench-detail-cell${wide ? ' wide' : ''}"><label>${_esc(_t('bench.detail.' + k))}</label><b>${_esc(v)}</b></div>`).join('')}</div>`;
  }

  /* ---- exportación: JSON completo + CSV de la serie, ambos con esquema, versión y condiciones ---- */
  const CSV_COLS = ['t', 'rep', 'warmup', 'cpu_temp', 'cpu_package', 'cpu_watts', 'cpu_freq_ghz', 'cpu_util',
    'cpu_throttle_count', 'cpu_throttle_ms', 'gpu_temp', 'gpu_watts', 'gpu_util', 'gpu_clock_mhz', 'work'];
  const EXPORT_SCHEMA = 'rog-monitor-benchmark-export/1';

  function csvCell(v) {
    if (v == null) return '';
    const s = String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /* Devuelve { kind, text, csv } para el IPC export-benchmark. Puro: sin DOM ni IPC. */
  function buildExport(item) {
    const c = item.conditions || {};
    const meta = { export_schema: EXPORT_SCHEMA, exported_at: new Date().toISOString(),
      schema: item.schema || 1, app_version: c.app_version || null };
    const obj = Object.assign(meta, item);
    const head = ['# ' + EXPORT_SCHEMA, '# schema: ' + meta.schema, '# app_version: ' + (meta.app_version || ''),
      '# kind: ' + (item.kind || ''), '# started_at: ' + (item.started_at || '')];
    Object.keys(c).forEach((k) => {
      const v = c[k];
      head.push(`# ${k}: ${v != null && typeof v === 'object' ? JSON.stringify(v) : (v == null ? '' : v)}`.replace(/[\r\n]+/g, ' '));
    });
    const samples = Array.isArray(item.samples) ? item.samples : [];
    const fanLabels = [];
    samples.forEach((sm) => Object.keys(sm.fans || {}).forEach((l) => { if (!fanLabels.includes(l)) fanLabels.push(l); }));
    const cols = CSV_COLS.concat(fanLabels.map((l) => 'fan_' + l));
    const lines = samples.map((sm) => cols.map((col) =>
      csvCell(col.startsWith('fan_') ? (sm.fans || {})[col.slice(4)] : sm[col])).join(','));
    return { kind: item.kind, text: JSON.stringify(obj, null, 2),
      csv: head.join('\n') + '\n' + cols.join(',') + '\n' + lines.join('\n') + '\n' };
  }

  async function exportItem(item) {
    if (!item || !window.rog || !window.rog.exportBenchmark) return;
    const res = await window.rog.exportBenchmark(buildExport(item));
    if (typeof toast !== 'function') return;
    toast(!res.ok ? _t('bench.export_failed', { err: res.err })
      : res.csvPath ? _t('bench.detail.exported_csv', { path: res.path, csv: res.csvPath })
      : _t('bench.exported', { path: res.path }));
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
    const toolLabel = item.kind === 'gpu' ? _t('bench.tool_gpu') : _t('bench.tool_cpu');
    subEl.textContent = [item.when, item.tool ? _t('bench.detail.tool_label') + ': ' + toolLabel : ''].filter(Boolean).join(' · ');

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
      chartsHtml = `<p class="benchd-nochart">${_esc(_t('bench.detail.nochart'))}</p>`;
    }

    bodyEl.innerHTML = `
      ${eventsHtml}
      ${chartsHtml}
      <h4 class="benchd-h4">${_esc(_t('bench.detail.summary_h4'))}</h4>
      ${statsGrid(item, isGpu)}
      ${scoreGrid(item)}
      ${statsTable(item, isGpu)}
      ${conditionsBlock(item)}
    `;

    modal.classList.remove('hidden');
    // dibujar tras el layout para que el canvas tenga tamaño real, y cablear
    // el hover (crosshair + tooltip) en cada gráfica recién creada.
    requestAnimationFrame(() => {
      redrawCharts();
      chartDefs.forEach((def) => {
        const c = document.getElementById(def.id);
        if (c && !c._hoverWired) { wireChartHover(c); c._hoverWired = true; }
      });
    });
  }

  window.RogBenchDetail = { open, close, buildExport, exportItem };
})();
