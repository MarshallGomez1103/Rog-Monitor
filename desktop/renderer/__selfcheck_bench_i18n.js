/* Self-check: verifies that bench.detail.* and bench.tool_* i18n keys
   registered in bench-detail.js resolve to non-empty strings in 'es' and 'en',
   and that they are different from the key name itself.
   Run with: node desktop/renderer/__selfcheck_bench_i18n.js */

'use strict';

// ---- Minimal i18n shim (mirrors i18n.js _register / _t logic) ----
const LANGS = ['es', 'en', 'fr', 'it', 'pt', 'zh', 'ja', 'ko'];
const _dict = {};

function register(dict) {
  const firstKey = Object.keys(dict)[0];
  if (!firstKey) return;
  const firstVal = dict[firstKey];
  if (typeof firstVal === 'object' && firstVal !== null && !Array.isArray(firstVal)) {
    const innerKeys = Object.keys(firstVal);
    if (innerKeys.some((k) => LANGS.includes(k))) {
      // CORE format: { key: { lang: str } }
      for (const [key, langs] of Object.entries(dict)) {
        if (!_dict[key]) _dict[key] = {};
        Object.assign(_dict[key], langs);
      }
      return;
    }
    // Alt format: { lang: { key: str } }
    for (const [lang, keys] of Object.entries(dict)) {
      for (const [key, str] of Object.entries(keys)) {
        if (!_dict[key]) _dict[key] = {};
        _dict[key][lang] = str;
      }
    }
  }
}

function t(key, lang) {
  const entry = _dict[key];
  return (entry && (entry[lang] || entry['en'] || entry['es'])) || null;
}

// ---- Paste the registration dict from bench-detail.js ----
register({
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

// ---- Assert helpers ----
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  OK  ${msg}`);
    passed++;
  } else {
    console.error(`FAIL  ${msg}`);
    failed++;
  }
}

function checkKey(key) {
  const es = t(key, 'es');
  const en = t(key, 'en');
  assert(es !== null && es !== '' && es !== key, `${key} [es] is non-empty and not the key`);
  assert(en !== null && en !== '' && en !== key, `${key} [en] is non-empty and not the key`);
  assert(es !== en, `${key} [es] !== [en]`);
}

// Keys introduced by this agent
const NEW_KEYS = [
  'bench.detail.close',
  'bench.detail.tool_label',
  'bench.detail.summary_h4',
  'bench.detail.nochart',
  'bench.detail.ev_throttle_yes',
  'bench.detail.ev_throttle_no',
  'bench.detail.ev_cap_exceeded',
  'bench.detail.ev_cap_ok',
  'bench.detail.ev_peak_temp',
  'bench.detail.ev_temp_trend',
  'bench.detail.ev_watts_trend',
  'bench.tool_cpu',
  'bench.tool_gpu',
  'bench.detail.header',
];

console.log('=== bench i18n self-check ===');
NEW_KEYS.forEach(checkKey);
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
