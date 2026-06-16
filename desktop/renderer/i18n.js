/* ROG Monitor — motor i18n del renderer (v10, dueño: Agente A1).
 * Expone window.t / window.i18n. SE CARGA ANTES que app.js.
 * Contrato completo en docs/build-spec-v10.md §A1.
 *
 * Reglas duras:
 *  - window.t(key, vars?) NUNCA lanza; fallback es → key.
 *  - window.i18n.register(dict) registra claves por namespace (cada agente llama esto).
 *  - window.i18n.apply(root?) recorre [data-i18n] y [data-i18n-attr="attr:key,..."].
 *  - window.i18n.onChange(cb) notifica cuando cambia el idioma.
 *  - window.i18n.set(lang) cambia idioma, persiste en localStorage, llama apply().
 *  - window.i18n.get() devuelve el idioma activo.
 *  - LANGS: ['es','en','fr','it','pt','zh','ja','ko'].
 */

(function () {
  'use strict';

  const LANGS = ['es', 'en', 'fr', 'it', 'pt', 'zh', 'ja', 'ko'];

  /* --------------------------------------------------------
   * Diccionario CORE: topbar, títulos de bloques, labels
   * comunes y botones de modales. En los 8 idiomas.
   * -------------------------------------------------------- */
  const CORE = {
    /* ---- topbar ---- */
    'topbar.profiles':       { es: 'Perfil de energía', en: 'Power profile', fr: 'Profil énergie', it: 'Profilo energetico', pt: 'Perfil de energia', zh: '性能配置', ja: 'パワープロファイル', ko: '전원 프로파일' },
    'topbar.gpu_seg':        { es: 'Modo GPU (requiere cerrar sesión)', en: 'GPU mode (requires log-out)', fr: 'Mode GPU (nécessite déconnexion)', it: 'Modalità GPU (richiede disconnessione)', pt: 'Modo GPU (requer logout)', zh: 'GPU模式（需要注销）', ja: 'GPUモード（ログアウト必要）', ko: 'GPU 모드 (로그아웃 필요)' },
    'topbar.update':         { es: 'ACTUALIZAR', en: 'UPDATE', fr: 'METTRE À JOUR', it: 'AGGIORNA', pt: 'ATUALIZAR', zh: '更新', ja: '更新', ko: '업데이트' },
    'topbar.report':         { es: 'REPORTAR ERROR', en: 'REPORT BUG', fr: 'SIGNALER BUG', it: 'SEGNALA BUG', pt: 'REPORTAR ERRO', zh: '报告错误', ja: 'バグ報告', ko: '버그 신고' },
    'topbar.alerts':         { es: 'ALERTAS', en: 'ALERTS', fr: 'ALERTES', it: 'AVVISI', pt: 'ALERTAS', zh: '警报', ja: 'アラート', ko: '알림' },
    'topbar.overlay':        { es: 'OVERLAY', en: 'OVERLAY', fr: 'OVERLAY', it: 'OVERLAY', pt: 'OVERLAY', zh: '游戏悬浮窗', ja: 'オーバーレイ', ko: '오버레이' },
    'topbar.theme':          { es: 'TEMA', en: 'THEME', fr: 'THÈME', it: 'TEMA', pt: 'TEMA', zh: '主题', ja: 'テーマ', ko: '테마' },
    'topbar.power':          { es: 'PODER', en: 'POWER', fr: 'ALIMENTATION', it: 'ALIMENTAZ.', pt: 'ENERGIA', zh: '电源', ja: 'パワー', ko: '전원' },
    'topbar.wizard':         { es: 'VER TUTORIAL', en: 'TUTORIAL', fr: 'TUTORIEL', it: 'TUTORIAL', pt: 'TUTORIAL', zh: '教程', ja: 'チュートリアル', ko: '튜토리얼' },
    'topbar.roadmap':        { es: 'ROADMAP', en: 'ROADMAP', fr: 'FEUILLE DE ROUTE', it: 'ROADMAP', pt: 'ROADMAP', zh: '路线图', ja: 'ロードマップ', ko: '로드맵' },
    'topbar.lang':           { es: 'Idioma', en: 'Language', fr: 'Langue', it: 'Lingua', pt: 'Idioma', zh: '语言', ja: '言語', ko: '언어' },

    /* ---- estado de la batería / fuente de energía (seteado por update()) ---- */
    'topbar.ac':             { es: '⚡ CONECTADO', en: '⚡ AC POWER', fr: '⚡ BRANCHÉ', it: '⚡ CORRENTE', pt: '⚡ LIGADO', zh: '⚡ 已插电', ja: '⚡ 充電中', ko: '⚡ 전원 연결' },
    'topbar.battery':        { es: '🔋 BATERÍA', en: '🔋 BATTERY', fr: '🔋 BATTERIE', it: '🔋 BATTERIA', pt: '🔋 BATERIA', zh: '🔋 电池', ja: '🔋 バッテリー', ko: '🔋 배터리' },

    /* ---- segmentos de perfil ---- */
    'profile.power_saver':   { es: 'AHORRO', en: 'SAVER', fr: 'ÉCONOMIE', it: 'RISPARMIO', pt: 'ECONOMIA', zh: '省电', ja: '省エネ', ko: '절약' },
    'profile.balanced':      { es: 'BALANCED', en: 'BALANCED', fr: 'ÉQUILIBRÉ', it: 'BILANCIATO', pt: 'EQUILIBRADO', zh: '均衡', ja: 'バランス', ko: '균형' },
    'profile.performance':   { es: 'PERFORMANCE', en: 'PERFORMANCE', fr: 'PERFORMANCE', it: 'PRESTAZIONI', pt: 'PERFORMANCE', zh: '性能', ja: 'パフォーマンス', ko: '고성능' },

    /* ---- títulos de los 9 bloques ---- */
    'block.cpu':             { es: 'CPU', en: 'CPU', fr: 'CPU', it: 'CPU', pt: 'CPU', zh: 'CPU', ja: 'CPU', ko: 'CPU' },
    'block.gpu':             { es: 'GPU', en: 'GPU', fr: 'GPU', it: 'GPU', pt: 'GPU', zh: 'GPU', ja: 'GPU', ko: 'GPU' },
    'block.fans':            { es: 'Ventiladores', en: 'Fans', fr: 'Ventilateurs', it: 'Ventilatori', pt: 'Ventoinhas', zh: '风扇', ja: 'ファン', ko: '팬' },
    'block.fans_sub':        { es: 'clic para configurar', en: 'click to configure', fr: 'clic pour configurer', it: 'clic per configurare', pt: 'clique para configurar', zh: '点击配置', ja: 'クリックして設定', ko: '클릭하여 설정' },
    'block.aura':            { es: 'Iluminación', en: 'Lighting', fr: 'Éclairage', it: 'Illuminazione', pt: 'Iluminação', zh: '灯光', ja: 'ライティング', ko: '조명' },
    'block.aura_sub':        { es: 'Aura ASUS y modo música', en: 'Aura ASUS & music mode', fr: 'Aura ASUS & mode musique', it: 'Aura ASUS & modalità musica', pt: 'Aura ASUS & modo música', zh: 'ASUS Aura及音乐模式', ja: 'ASUS Aura & ミュージックモード', ko: 'ASUS Aura & 뮤직 모드' },
    'block.history':         { es: 'Historial', en: 'History', fr: 'Historique', it: 'Cronologia', pt: 'Histórico', zh: '历史', ja: '履歴', ko: '기록' },
    'block.history_sub':     { es: 'pasa el cursor por una gráfica para ver cada punto', en: 'hover a chart to see each point', fr: 'survolez un graphique pour voir chaque point', it: 'passa il cursore per vedere i dati', pt: 'passe o cursor sobre um gráfico', zh: '将鼠标悬停在图表上查看数据', ja: 'グラフにカーソルを合わせてデータ確認', ko: '차트에 마우스를 올려 데이터 확인' },
    'block.bench':           { es: 'Benchmarks', en: 'Benchmarks', fr: 'Benchmarks', it: 'Benchmark', pt: 'Benchmarks', zh: '基准测试', ja: 'ベンチマーク', ko: '벤치마크' },
    'block.bench_sub':       { es: 'carga térmica y resultados', en: 'thermal load & results', fr: 'charge thermique & résultats', it: 'carico termico & risultati', pt: 'carga térmica & resultados', zh: '热负载与结果', ja: '熱負荷とテスト結果', ko: '열 부하 및 결과' },
    'block.system':          { es: 'Sistema', en: 'System', fr: 'Système', it: 'Sistema', pt: 'Sistema', zh: '系统', ja: 'システム', ko: '시스템' },
    'block.events':          { es: 'Eventos', en: 'Events', fr: 'Événements', it: 'Eventi', pt: 'Eventos', zh: '事件', ja: 'イベント', ko: '이벤트' },
    'block.procs':           { es: 'Procesos', en: 'Processes', fr: 'Processus', it: 'Processi', pt: 'Processos', zh: '进程', ja: 'プロセス', ko: '프로세스' },
    'block.procs_sub':       { es: 'top 5 por uso de CPU · clic para cerrar uno', en: 'top 5 by CPU · click to kill', fr: 'top 5 CPU · clic pour fermer', it: 'top 5 CPU · clic per chiudere', pt: 'top 5 CPU · clique para fechar', zh: 'CPU前5 · 点击关闭', ja: 'CPU上位5 · クリックして終了', ko: 'CPU 상위 5 · 클릭하여 종료' },

    /* ---- labels comunes de estadísticas ---- */
    'common.max':            { es: 'Máx', en: 'Max', fr: 'Max', it: 'Max', pt: 'Máx', zh: '最大', ja: '最大', ko: '최대' },
    'common.min':            { es: 'Mín', en: 'Min', fr: 'Min', it: 'Min', pt: 'Mín', zh: '最小', ja: '最小', ko: '최소' },
    'common.package':        { es: 'Package', en: 'Package', fr: 'Package', it: 'Package', pt: 'Package', zh: '封装', ja: 'パッケージ', ko: '패키지' },
    'common.usage':          { es: 'Uso', en: 'Usage', fr: 'Utilisation', it: 'Utilizzo', pt: 'Uso', zh: '使用率', ja: '使用率', ko: '사용률' },
    'common.watts':          { es: 'Watts', en: 'Watts', fr: 'Watts', it: 'Watt', pt: 'Watts', zh: '瓦特', ja: 'ワット', ko: '와트' },
    'common.vram':           { es: 'VRAM', en: 'VRAM', fr: 'VRAM', it: 'VRAM', pt: 'VRAM', zh: '显存', ja: 'VRAM', ko: 'VRAM' },
    'common.mhz':            { es: 'MHz', en: 'MHz', fr: 'MHz', it: 'MHz', pt: 'MHz', zh: 'MHz', ja: 'MHz', ko: 'MHz' },
    'common.throttle':       { es: 'Throttle', en: 'Throttle', fr: 'Throttle', it: 'Throttle', pt: 'Throttle', zh: '降频', ja: 'スロットル', ko: '스로틀' },
    'common.mode':           { es: 'Modo', en: 'Mode', fr: 'Mode', it: 'Modalità', pt: 'Modo', zh: '模式', ja: 'モード', ko: '모드' },
    'common.network':        { es: 'Red', en: 'Network', fr: 'Réseau', it: 'Rete', pt: 'Rede', zh: '网络', ja: 'ネットワーク', ko: '네트워크' },
    'common.load':           { es: 'Carga', en: 'Load', fr: 'Charge', it: 'Carico', pt: 'Carga', zh: '负载', ja: '負荷', ko: '부하' },
    'common.battery':        { es: 'Batería', en: 'Battery', fr: 'Batterie', it: 'Batteria', pt: 'Bateria', zh: '电池', ja: 'バッテリー', ko: '배터리' },
    'common.asus_profile':   { es: 'Perfil ASUS', en: 'ASUS Profile', fr: 'Profil ASUS', it: 'Profilo ASUS', pt: 'Perfil ASUS', zh: 'ASUS配置文件', ja: 'ASUSプロファイル', ko: 'ASUS 프로파일' },
    'common.close':          { es: 'Cerrar', en: 'Close', fr: 'Fermer', it: 'Chiudi', pt: 'Fechar', zh: '关闭', ja: '閉じる', ko: '닫기' },
    'common.cancel':         { es: 'Cancelar', en: 'Cancel', fr: 'Annuler', it: 'Annulla', pt: 'Cancelar', zh: '取消', ja: 'キャンセル', ko: '취소' },
    'common.apply':          { es: 'APLICAR', en: 'APPLY', fr: 'APPLIQUER', it: 'APPLICA', pt: 'APLICAR', zh: '应用', ja: '適用', ko: '적용' },
    'common.save':           { es: 'GUARDAR', en: 'SAVE', fr: 'ENREGISTRER', it: 'SALVA', pt: 'GUARDAR', zh: '保存', ja: '保存', ko: '저장' },
    'common.save_apply':     { es: 'GUARDAR Y APLICAR', en: 'SAVE & APPLY', fr: 'ENREG. & APPLIQUER', it: 'SALVA E APPLICA', pt: 'GUARDAR E APLICAR', zh: '保存并应用', ja: '保存して適用', ko: '저장 및 적용' },
    'common.export':         { es: 'EXPORTAR', en: 'EXPORT', fr: 'EXPORTER', it: 'ESPORTA', pt: 'EXPORTAR', zh: '导出', ja: 'エクスポート', ko: '내보내기' },
    'common.import':         { es: 'IMPORTAR', en: 'IMPORT', fr: 'IMPORTER', it: 'IMPORTA', pt: 'IMPORTAR', zh: '导入', ja: 'インポート', ko: '가져오기' },
    'common.reset_factory':  { es: 'RESET A FÁBRICA', en: 'FACTORY RESET', fr: 'RÉINIT. USINE', it: 'RIPRISTINA', pt: 'RESET FÁBRICA', zh: '恢复出厂设置', ja: '出荷時設定に戻す', ko: '공장 초기화' },

    /* ---- wizard (pasos 0-5) ---- */
    'wizard.title':          { es: 'Asistente de ROG Monitor', en: 'ROG Monitor Setup', fr: 'Assistant ROG Monitor', it: 'Wizard ROG Monitor', pt: 'Assistente ROG Monitor', zh: 'ROG Monitor 向导', ja: 'ROG Monitor セットアップ', ko: 'ROG Monitor 설정' },
    'wizard.step0_title':    { es: 'Elige tu idioma', en: 'Choose your language', fr: 'Choisissez votre langue', it: 'Scegli la tua lingua', pt: 'Escolha o seu idioma', zh: '选择您的语言', ja: '言語を選択', ko: '언어 선택' },
    'wizard.step0_sub':      { es: 'Puedes cambiarlo después con el botón A文 en la barra superior.', en: 'You can change it later via the A文 button in the top bar.', fr: 'Vous pouvez le changer via le bouton A文.', it: 'Puoi cambiarlo dopo con il pulsante A文.', pt: 'Pode alterar depois com o botão A文.', zh: '之后可以通过顶栏的A文按钮更改。', ja: '後でA文ボタンから変更できます。', ko: '나중에 상단 A文 버튼으로 변경할 수 있습니다.' },
    'wizard.skip':           { es: 'SALTAR', en: 'SKIP', fr: 'PASSER', it: 'SALTA', pt: 'SALTAR', zh: '跳过', ja: 'スキップ', ko: '건너뛰기' },
    'wizard.prev':           { es: 'ATRÁS', en: 'BACK', fr: 'RETOUR', it: 'INDIETRO', pt: 'VOLTAR', zh: '上一步', ja: '戻る', ko: '이전' },
    'wizard.next':           { es: 'SIGUIENTE', en: 'NEXT', fr: 'SUIVANT', it: 'AVANTI', pt: 'SEGUINTE', zh: '下一步', ja: '次へ', ko: '다음' },
    'wizard.finish':         { es: 'TERMINAR', en: 'FINISH', fr: 'TERMINER', it: 'FINE', pt: 'CONCLUIR', zh: '完成', ja: '完了', ko: '완료' },

    /* ---- modal de idioma ---- */
    'lang.modal_title':      { es: 'Elige tu idioma', en: 'Choose language', fr: 'Choisissez la langue', it: 'Scegli la lingua', pt: 'Escolha o idioma', zh: '选择语言', ja: '言語を選択', ko: '언어 선택' },

    /* ---- benchmark ---- */
    'bench.open':            { es: 'ABRIR BENCHMARKS', en: 'OPEN BENCHMARKS', fr: 'OUVRIR BENCHMARKS', it: 'APRI BENCHMARK', pt: 'ABRIR BENCHMARKS', zh: '打开基准测试', ja: 'ベンチマークを開く', ko: '벤치마크 열기' },
    'bench.cpu':             { es: 'CPU 45 s', en: 'CPU 45 s', fr: 'CPU 45 s', it: 'CPU 45 s', pt: 'CPU 45 s', zh: 'CPU 45秒', ja: 'CPU 45秒', ko: 'CPU 45초' },
    'bench.gpu':             { es: 'GPU LOCAL 45 s', en: 'GPU LOCAL 45 s', fr: 'GPU LOCAL 45 s', it: 'GPU LOCAL 45 s', pt: 'GPU LOCAL 45 s', zh: 'GPU本地45秒', ja: 'GPUローカル45秒', ko: 'GPU 로컬 45초' },
  };

  /* --------------------------------------------------------
   * Almacenamiento interno de traducciones
   * -------------------------------------------------------- */
  // Diccionario combinado: { key: { lang: string } }
  let _dict = {};

  // Idioma activo
  let _lang = (function () {
    try { return localStorage.getItem('lang') || 'es'; } catch (_) { return 'es'; }
  }());
  if (!LANGS.includes(_lang)) _lang = 'es';

  // Listeners de cambio de idioma
  const _listeners = [];

  /* --------------------------------------------------------
   * Registra el diccionario CORE al arrancar
   * -------------------------------------------------------- */
  function _register(dict) {
    // dict puede ser: { key: { lang: string } }   (formato CORE)
    // o:              { lang: { key: string } }   (formato alternativo que algunos agentes pueden usar)
    // Detectamos el formato inspeccionando el primer valor.
    const firstKey = Object.keys(dict)[0];
    if (!firstKey) return;
    const firstVal = dict[firstKey];

    if (typeof firstVal === 'object' && firstVal !== null && !Array.isArray(firstVal)) {
      const innerKeys = Object.keys(firstVal);
      // Si alguna clave interna es un idioma conocido → formato CORE { key: {lang: str} }
      if (innerKeys.some((k) => LANGS.includes(k))) {
        // Formato CORE
        for (const [key, langs] of Object.entries(dict)) {
          if (!_dict[key]) _dict[key] = {};
          Object.assign(_dict[key], langs);
        }
        return;
      }
      // Formato alternativo: { lang: { key: str } }
      for (const [lang, keys] of Object.entries(dict)) {
        for (const [key, str] of Object.entries(keys)) {
          if (!_dict[key]) _dict[key] = {};
          _dict[key][lang] = str;
        }
      }
    }
  }

  /* --------------------------------------------------------
   * Traducción de una clave con interpolación de variables
   * Formato de variable: {nombre}
   * -------------------------------------------------------- */
  function _t(key, vars) {
    try {
      const entry = _dict[key];
      let str = (entry && (entry[_lang] || entry['es'])) || key;
      if (vars && typeof vars === 'object') {
        str = str.replace(/\{(\w+)\}/g, (_, k) =>
          (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
      }
      return str;
    } catch (_) {
      return key;
    }
  }

  /* --------------------------------------------------------
   * apply(root?) — recorre el DOM buscando data-i18n y
   * data-i18n-attr para actualizar texto y atributos.
   * -------------------------------------------------------- */
  function _apply(root) {
    try {
      const scope = root || document;
      // textContent
      scope.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.dataset.i18n;
        if (key) el.textContent = _t(key);
      });
      // atributos: data-i18n-attr="title:topbar.lang,placeholder:common.save"
      scope.querySelectorAll('[data-i18n-attr]').forEach((el) => {
        const spec = el.dataset.i18nAttr;
        if (!spec) return;
        spec.split(',').forEach((pair) => {
          const idx = pair.indexOf(':');
          if (idx < 0) return;
          const attr = pair.slice(0, idx).trim();
          const key = pair.slice(idx + 1).trim();
          if (attr && key) el.setAttribute(attr, _t(key));
        });
      });
    } catch (_) { /* nunca lanza */ }
  }

  /* --------------------------------------------------------
   * Cambiar idioma
   * -------------------------------------------------------- */
  function _set(lang) {
    if (!LANGS.includes(lang)) return;
    _lang = lang;
    try { localStorage.setItem('lang', lang); } catch (_) {}
    _apply();
    _listeners.forEach((cb) => { try { cb(lang); } catch (_) {} });
  }

  /* --------------------------------------------------------
   * Exponer la API global
   * -------------------------------------------------------- */
  // Registrar el diccionario CORE antes de exponer
  _register(CORE);

  window.t = function (key, vars) { return _t(key, vars); };

  window.i18n = {
    LANGS,
    register: _register,
    apply: _apply,
    set: _set,
    get: function () { return _lang; },
    onChange: function (cb) {
      if (typeof cb === 'function') _listeners.push(cb);
    },
  };

  // Aplicar al DOM cuando esté listo (este script corre antes de app.js)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { _apply(); });
  } else {
    _apply();
  }

}());
