/* ROG Monitor — Hub de Diagnóstico (v18).
 * Cards de info de hardware + tests interactivos:
 *   - INFO: CPU, GPU, iGPU/superGFX, batería, ventiladores, placa madre
 *   - TECLADO: visual, keydown/keyup, contador de teclas únicas
 *   - SONIDO: Web Audio API (oscilador) L / R / Ambos
 *   - PANTALLA: overlay fullscreen de colores sólidos + gradiente
 *
 * i18n: window.i18n.register() con 8 idiomas.
 * NO edita i18n.js. NO agrega dependencias externas.
 */

/* ============================================================
   i18n registration
   ============================================================ */
if (window.i18n && typeof window.i18n.register === 'function') {
  window.i18n.register({
    /* --- topbar button --- */
    'topbar.diag':        { es: 'DIAGNÓSTICO', en: 'DIAGNOSTICS', fr: 'DIAGNOSTIC', it: 'DIAGNOSTICA', pt: 'DIAGNÓSTICO', zh: '诊断', ja: '診断', ko: '진단' },
    'tip.diag':           { es: 'Hub de diagnóstico: info del hardware y tests de teclado, sonido y pantalla', en: 'Diagnostics hub: hardware info and keyboard, sound and display tests', fr: 'Hub de diagnostic : infos matériel et tests clavier, son et écran', it: 'Hub di diagnostica: info hardware e test tastiera, audio e schermo', pt: 'Hub de diagnóstico: info de hardware e testes de teclado, som e ecrã', zh: '诊断中心：硬件信息及键盘、声音和显示器测试', ja: '診断ハブ：ハードウェア情報とキーボード・サウンド・ディスプレイテスト', ko: '진단 허브: 하드웨어 정보와 키보드, 사운드, 디스플레이 테스트' },

    /* --- modal title & section headings --- */
    'diag.title':         { es: 'Diagnóstico del Hardware', en: 'Hardware Diagnostics', fr: 'Diagnostic matériel', it: 'Diagnostica hardware', pt: 'Diagnóstico de Hardware', zh: '硬件诊断', ja: 'ハードウェア診断', ko: '하드웨어 진단' },
    'diag.info_section':  { es: 'Información del sistema', en: 'System Information', fr: 'Informations système', it: 'Informazioni di sistema', pt: 'Informações do sistema', zh: '系统信息', ja: 'システム情報', ko: '시스템 정보' },
    'diag.test_section':  { es: 'Tests interactivos', en: 'Interactive Tests', fr: 'Tests interactifs', it: 'Test interattivi', pt: 'Testes interativos', zh: '交互测试', ja: 'インタラクティブテスト', ko: '인터랙티브 테스트' },

    /* --- info card labels --- */
    'diag.cpu_model':     { es: 'Modelo CPU', en: 'CPU Model', fr: 'Modèle CPU', it: 'Modello CPU', pt: 'Modelo CPU', zh: 'CPU 型号', ja: 'CPUモデル', ko: 'CPU 모델' },
    'diag.cpu_temp':      { es: 'Temp. CPU', en: 'CPU Temp', fr: 'Temp. CPU', it: 'Temp. CPU', pt: 'Temp. CPU', zh: 'CPU 温度', ja: 'CPU温度', ko: 'CPU 온도' },
    'diag.cpu_freq':      { es: 'Frec. CPU', en: 'CPU Freq', fr: 'Fréq. CPU', it: 'Freq. CPU', pt: 'Freq. CPU', zh: 'CPU 频率', ja: 'CPU周波数', ko: 'CPU 주파수' },
    'diag.gpu_name':      { es: 'GPU (dGPU)', en: 'GPU (dGPU)', fr: 'GPU (dGPU)', it: 'GPU (dGPU)', pt: 'GPU (dGPU)', zh: 'GPU（独显）', ja: 'GPU（dGPU）', ko: 'GPU (dGPU)' },
    'diag.gpu_temp':      { es: 'Temp. GPU', en: 'GPU Temp', fr: 'Temp. GPU', it: 'Temp. GPU', pt: 'Temp. GPU', zh: 'GPU 温度', ja: 'GPU温度', ko: 'GPU 온도' },
    'diag.gpu_util':      { es: 'Uso GPU', en: 'GPU Usage', fr: 'Util. GPU', it: 'Uso GPU', pt: 'Uso GPU', zh: 'GPU 使用率', ja: 'GPU使用率', ko: 'GPU 사용률' },
    'diag.igpu_mode':     { es: 'Modo gráfico', en: 'GPU Mode', fr: 'Mode graphique', it: 'Modalità grafica', pt: 'Modo gráfico', zh: '显卡模式', ja: 'グラフィックモード', ko: '그래픽 모드' },
    'diag.battery':       { es: 'Batería', en: 'Battery', fr: 'Batterie', it: 'Batteria', pt: 'Bateria', zh: '电池', ja: 'バッテリー', ko: '배터리' },
    'diag.fans':          { es: 'Ventiladores', en: 'Fans', fr: 'Ventilateurs', it: 'Ventilatori', pt: 'Ventoinhas', zh: '风扇', ja: 'ファン', ko: '팬' },
    'diag.mb_vendor':     { es: 'Fabricante placa', en: 'Board Vendor', fr: 'Fabricant carte', it: 'Produttore scheda', pt: 'Fabricante placa', zh: '主板厂商', ja: 'マザーボードメーカー', ko: '보드 제조사' },
    'diag.mb_name':       { es: 'Modelo placa', en: 'Board Model', fr: 'Modèle carte', it: 'Modello scheda', pt: 'Modelo placa', zh: '主板型号', ja: 'マザーボードモデル', ko: '보드 모델' },
    'diag.bios':          { es: 'BIOS', en: 'BIOS', fr: 'BIOS', it: 'BIOS', pt: 'BIOS', zh: 'BIOS', ja: 'BIOS', ko: 'BIOS' },
    'diag.no_data':       { es: 'sin datos', en: 'no data', fr: 'pas de données', it: 'nessun dato', pt: 'sem dados', zh: '无数据', ja: 'データなし', ko: '데이터 없음' },

    /* --- keyboard test --- */
    'diag.kb_title':      { es: 'Test de teclado', en: 'Keyboard Test', fr: 'Test du clavier', it: 'Test tastiera', pt: 'Teste de teclado', zh: '键盘测试', ja: 'キーボードテスト', ko: '키보드 테스트' },
    'diag.kb_hint':       { es: 'Pulsa cualquier tecla. Las teclas tocadas se iluminan con neón.', en: 'Press any key. Touched keys light up with neon.', fr: 'Appuyez sur une touche. Les touches pressées s\'allument.', it: 'Premi un tasto. I tasti premuti si illuminano.', pt: 'Carrega numa tecla. As teclas tocadas iluminam-se.', zh: '按下任意键，按过的键会发光。', ja: '任意のキーを押してください。押したキーがネオンで光ります。', ko: '아무 키나 누르세요. 눌린 키가 네온으로 빛납니다.' },
    'diag.kb_count':      { es: 'Teclas únicas pulsadas: {n}', en: 'Unique keys pressed: {n}', fr: 'Touches uniques pressées : {n}', it: 'Tasti unici premuti: {n}', pt: 'Teclas únicas pressionadas: {n}', zh: '按下的唯一按键数：{n}', ja: '押した固有キー数：{n}', ko: '누른 고유 키 수: {n}' },
    'diag.kb_reset':      { es: 'REINICIAR', en: 'RESET', fr: 'RÉINITIALISER', it: 'RESET', pt: 'REINICIAR', zh: '重置', ja: 'リセット', ko: '초기화' },

    /* --- sound test --- */
    'diag.sound_title':   { es: 'Test de sonido', en: 'Sound Test', fr: 'Test audio', it: 'Test audio', pt: 'Teste de som', zh: '声音测试', ja: 'サウンドテスト', ko: '사운드 테스트' },
    'diag.sound_hint':    { es: 'Reproduce un tono en cada canal para verificar los altavoces.', en: 'Plays a tone on each channel to verify speakers.', fr: 'Joue une tonalité sur chaque canal pour vérifier les haut-parleurs.', it: 'Suona un tono su ogni canale per verificare gli altoparlanti.', pt: 'Reproduz um tom em cada canal para verificar as colunas.', zh: '在每个声道播放一个音调以检查扬声器。', ja: '各チャンネルでトーンを再生してスピーカーを確認します。', ko: '각 채널에서 음을 재생하여 스피커를 확인합니다.' },
    'diag.sound_left':    { es: 'IZQUIERDA', en: 'LEFT', fr: 'GAUCHE', it: 'SINISTRA', pt: 'ESQUERDA', zh: '左声道', ja: '左', ko: '왼쪽' },
    'diag.sound_right':   { es: 'DERECHA', en: 'RIGHT', fr: 'DROITE', it: 'DESTRA', pt: 'DIREITA', zh: '右声道', ja: '右', ko: '오른쪽' },
    'diag.sound_both':    { es: 'AMBOS', en: 'BOTH', fr: 'LES DEUX', it: 'ENTRAMBI', pt: 'AMBOS', zh: '两声道', ja: '両方', ko: '양쪽' },

    /* --- display test --- */
    'diag.display_title': { es: 'Test de pantalla', en: 'Display Test', fr: 'Test d\'écran', it: 'Test schermo', pt: 'Teste de ecrã', zh: '屏幕测试', ja: 'ディスプレイテスト', ko: '디스플레이 테스트' },
    'diag.display_hint':  { es: 'Cicla colores sólidos para detectar píxeles muertos. Clic para avanzar, Esc para salir.', en: 'Cycles solid colors to detect dead pixels. Click to advance, Esc to exit.', fr: 'Cycles de couleurs unies pour détecter les pixels morts. Clic pour avancer, Esc pour quitter.', it: 'Cicla colori solidi per rilevare pixel morti. Clic per avanzare, Esc per uscire.', pt: 'Cicla cores sólidas para detetar pixels mortos. Clic para avançar, Esc para sair.', zh: '循环纯色检测坏点。点击前进，Esc 退出。', ja: '単色を循環させて死んだピクセルを検出。クリックで次へ、Escで終了。', ko: '단색을 순환하여 불량 픽셀을 감지합니다. 클릭으로 다음, Esc로 종료.' },
    'diag.display_start': { es: 'INICIAR TEST', en: 'START TEST', fr: 'LANCER TEST', it: 'AVVIA TEST', pt: 'INICIAR TESTE', zh: '开始测试', ja: 'テスト開始', ko: '테스트 시작' },
    'diag.display_click': { es: 'Clic para avanzar · Esc para salir', en: 'Click to advance · Esc to exit', fr: 'Clic pour avancer · Esc pour quitter', it: 'Clic per avanzare · Esc per uscire', pt: 'Clique para avançar · Esc para sair', zh: '点击继续 · Esc 退出', ja: 'クリックで次へ · Esc で終了', ko: '클릭으로 다음 · Esc로 종료' },
  });
}

/* ============================================================
   DOM helpers
   ============================================================ */
const _$ = (id) => document.getElementById(id);
const _t  = (k, vars) => (window.t ? window.t(k, vars) : k);

/* ============================================================
   INFO CARDS — leer de lastStats (referencia a la var de app.js)
   ============================================================ */
function _diagFmt(v, decimals = 0, unit = '') {
  if (v == null || v !== v) return _t('diag.no_data');
  return (typeof v === 'number' ? v.toFixed(decimals) : v) + (unit ? ' ' + unit : '');
}

function _buildInfoCards(stats) {
  if (!stats) return '<p class="dim" style="padding:0.5rem">Esperando datos del backend…</p>';

  const cpu   = stats.cpu   || {};
  const gpu   = stats.gpu   || {};
  const bat   = stats.battery || {};
  const fans  = stats.fans  || [];
  const sys   = stats.sys   || {};
  const dmi   = sys.dmi     || {};
  const active = gpu.active || {};

  const fanRPMs = fans
    .filter((f) => f && f.rpm != null)
    .map((f) => `${f.label || '?'}: ${f.rpm} RPM`)
    .join(' · ') || _t('diag.no_data');

  const batText = bat.capacity != null
    ? `${bat.capacity}%${bat.on_ac ? ' ⚡' : ' 🔋'}${bat.charge_limit ? ' (lím. ' + bat.charge_limit + '%)' : ''}`
    : _t('diag.no_data');

  const cards = [
    { label: _t('diag.cpu_model'),  value: cpu.model  || _t('diag.no_data') },
    { label: _t('diag.cpu_temp'),   value: _diagFmt(cpu.avg, 1), sub: cpu.package != null ? `pkg ${cpu.package.toFixed(0)}°C` : '' },
    { label: _t('diag.cpu_freq'),   value: _diagFmt(cpu.freq_ghz, 2), sub: 'GHz' },
    { label: _t('diag.gpu_name'),   value: active.name || _t('diag.no_data') },
    { label: _t('diag.gpu_temp'),   value: _diagFmt(active.temp, 1), sub: active.temp != null ? '°C' : '' },
    { label: _t('diag.gpu_util'),   value: active.util != null ? `${active.util.toFixed(0)}%` : _t('diag.no_data') },
    { label: _t('diag.igpu_mode'),  value: gpu.mode   || _t('diag.no_data') },
    { label: _t('diag.battery'),    value: batText },
    { label: _t('diag.fans'),       value: fanRPMs, small: true },
    { label: _t('diag.mb_vendor'),  value: dmi.board_vendor || _t('diag.no_data') },
    { label: _t('diag.mb_name'),    value: dmi.board_name   || _t('diag.no_data') },
    { label: _t('diag.bios'),       value: dmi.bios_version || _t('diag.no_data'), sub: dmi.product_name || '' },
  ];

  return cards.map(({ label, value, sub, small }) => `
    <div class="diag-card-item">
      <span class="diag-card-label">${label}</span>
      <span class="diag-card-value${small ? ' small' : ''}" style="${small ? 'font-size:0.72rem' : ''}">${value}</span>
      ${sub ? `<span class="diag-card-sub">${sub}</span>` : ''}
    </div>`).join('');
}

/* ============================================================
   KEYBOARD TEST
   Layout: 5 rows (ESC/F-keys, numbers, QWERTY, ASDF, ZXCV + nav)
   Keys are mapped via data-key attribute (KeyboardEvent.code)
   ============================================================ */
const _KB_ROWS = [
  // [label, code, width-class?]
  [
    ['Esc','Escape'], ['F1','F1'], ['F2','F2'], ['F3','F3'], ['F4','F4'],
    ['F5','F5'], ['F6','F6'], ['F7','F7'], ['F8','F8'],
    ['F9','F9'], ['F10','F10'], ['F11','F11'], ['F12','F12'],
    ['PrtSc','PrintScreen'], ['ScrLk','ScrollLock'], ['Pause','Pause'],
  ],
  [
    ['`','Backquote'], ['1','Digit1'], ['2','Digit2'], ['3','Digit3'], ['4','Digit4'],
    ['5','Digit5'], ['6','Digit6'], ['7','Digit7'], ['8','Digit8'], ['9','Digit9'],
    ['0','Digit0'], ['-','Minus'], ['=','Equal'], ['←','Backspace','wide-20'],
    ['Ins','Insert'], ['Hm','Home'], ['PgUp','PageUp'],
  ],
  [
    ['Tab','Tab','wide-15'], ['Q','KeyQ'], ['W','KeyW'], ['E','KeyE'], ['R','KeyR'],
    ['T','KeyT'], ['Y','KeyY'], ['U','KeyU'], ['I','KeyI'], ['O','KeyO'], ['P','KeyP'],
    ['[','BracketLeft'], [']','BracketRight'], ['\\','Backslash','wide-15'],
    ['Del','Delete'], ['End','End'], ['PgDn','PageDown'],
  ],
  [
    ['Caps','CapsLock','wide-20'], ['A','KeyA'], ['S','KeyS'], ['D','KeyD'], ['F','KeyF'],
    ['G','KeyG'], ['H','KeyH'], ['J','KeyJ'], ['K','KeyK'], ['L','KeyL'],
    [';','Semicolon'], ["'",'Quote'], ['Enter','Enter','wide-25'],
  ],
  [
    ['Shift','ShiftLeft','wide-25'], ['Z','KeyZ'], ['X','KeyX'], ['C','KeyC'], ['V','KeyV'],
    ['B','KeyB'], ['N','KeyN'], ['M','KeyM'], [',','Comma'], ['.','Period'], ['/','Slash'],
    ['Shift','ShiftRight','wide-30'],
    ['↑','ArrowUp'],
  ],
  [
    ['Ctrl','ControlLeft','wide-20'], ['Meta','MetaLeft','wide-15'], ['Alt','AltLeft','wide-15'],
    ['Space','Space','wide-55'],
    ['Alt','AltRight','wide-15'], ['Fn','Fn','wide-15'], ['Ctrl','ControlRight','wide-20'],
    ['←','ArrowLeft'], ['↓','ArrowDown'], ['→','ArrowRight'],
  ],
];

function _buildKeyboard() {
  return `<div class="diag-kb">` +
    _KB_ROWS.map((row) =>
      `<div class="diag-kb-row">` +
      row.map(([label, code, cls = '']) =>
        `<span class="diag-key ${cls}" data-kcode="${code}">${label}</span>`
      ).join('') +
      `</div>`
    ).join('') +
    `</div>`;
}

/* ============================================================
   MODAL HTML
   ============================================================ */
function _buildDiagModal() {
  return `
  <div id="diag-modal" class="modal hidden">
    <div class="modal-card diag-card">
      <h3 data-i18n="diag.title">${_t('diag.title')}</h3>

      <p class="diag-section-title" data-i18n="diag.info_section">${_t('diag.info_section')}</p>
      <div class="diag-cards-grid" id="diag-info-grid"></div>

      <p class="diag-section-title" data-i18n="diag.test_section">${_t('diag.test_section')}</p>

      <!-- Keyboard test -->
      <p class="sub" style="font-weight:700;margin:0 0 0.25rem" data-i18n="diag.kb_title">${_t('diag.kb_title')}</p>
      <p class="sub dim" style="margin:0 0 0.4rem" data-i18n="diag.kb_hint">${_t('diag.kb_hint')}</p>
      <div class="diag-kb-wrap">
        ${_buildKeyboard()}
      </div>
      <div class="diag-kb-counter">
        <span data-i18n="diag.kb_count" data-i18n-vars='{"n":0}'>${_t('diag.kb_count', { n: 0 })}</span>
        &nbsp;&nbsp;
        <button class="ghost" id="diag-kb-reset" style="font-size:0.7rem;padding:0.15rem 0.6rem" data-i18n="diag.kb_reset">${_t('diag.kb_reset')}</button>
      </div>

      <!-- Sound test -->
      <p class="sub" style="font-weight:700;margin:1rem 0 0.25rem" data-i18n="diag.sound_title">${_t('diag.sound_title')}</p>
      <p class="sub dim" style="margin:0 0 0.25rem" data-i18n="diag.sound_hint">${_t('diag.sound_hint')}</p>
      <div class="diag-sound-btns">
        <button class="ghost" id="diag-snd-left"  data-i18n="diag.sound_left">${_t('diag.sound_left')}</button>
        <button class="ghost" id="diag-snd-right" data-i18n="diag.sound_right">${_t('diag.sound_right')}</button>
        <button class="ghost" id="diag-snd-both"  data-i18n="diag.sound_both">${_t('diag.sound_both')}</button>
      </div>

      <!-- Display test -->
      <p class="sub" style="font-weight:700;margin:1rem 0 0.25rem" data-i18n="diag.display_title">${_t('diag.display_title')}</p>
      <p class="sub dim" style="margin:0 0 0.25rem" data-i18n="diag.display_hint">${_t('diag.display_hint')}</p>
      <div class="diag-display-btns">
        <button class="ghost" id="diag-display-start" data-i18n="diag.display_start">${_t('diag.display_start')}</button>
      </div>

      <button class="ghost modal-close" id="diag-close" style="margin-top:1.2rem" data-i18n="common.close">${_t('common.close') !== 'common.close' ? _t('common.close') : 'Cerrar'}</button>
    </div>
  </div>

  <!-- Display test fullscreen overlay (outside modal-card to cover everything) -->
  <div id="diag-display-overlay" class="hidden">
    <span class="diag-display-hint" id="diag-display-hint" data-i18n="diag.display_click">${_t('diag.display_click')}</span>
  </div>`;
}

/* ============================================================
   SOUND TEST — Web Audio API
   ============================================================ */
let _diagAudioCtx = null;

function _playTone(pan, durationMs = 500, freq = 440) {
  try {
    if (!_diagAudioCtx) {
      _diagAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = _diagAudioCtx;
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner();

    osc.type = 'sine';
    osc.frequency.value = freq;
    panner.pan.value = pan; // -1 = left, 0 = both, 1 = right

    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.4, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);

    osc.connect(panner);
    panner.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationMs / 1000 + 0.05);
  } catch (e) {
    // AudioContext not available (unlikely in Electron)
    console.warn('[diag] Audio error:', e);
  }
}

/* ============================================================
   DISPLAY TEST
   ============================================================ */
const _DISPLAY_COLORS = [
  '#000000', // Black — lit pixel detection
  '#ffffff', // White — backlight bleed / uniformity
  '#ff0000', // Red   — dead pixel / stuck green/blue
  '#00ff00', // Green
  '#0000ff', // Blue
  '#888888', // Gray  — mid uniformity
  'gradient',// Gradient grid (last step)
];

let _diagDisplayIdx = -1;
let _diagDisplayEl  = null;

function _advanceDisplayColor() {
  if (!_diagDisplayEl) return;
  _diagDisplayIdx = (_diagDisplayIdx + 1) % _DISPLAY_COLORS.length;
  const c = _DISPLAY_COLORS[_diagDisplayIdx];
  if (c === 'gradient') {
    _diagDisplayEl.style.background = '#000';
    // Show gradient grid child
    let grid = _diagDisplayEl.querySelector('.diag-display-grid-pattern');
    if (!grid) {
      grid = document.createElement('div');
      grid.className = 'diag-display-grid-pattern';
      _diagDisplayEl.insertBefore(grid, _diagDisplayEl.firstChild);
    }
    grid.style.display = 'block';
  } else {
    const grid = _diagDisplayEl.querySelector('.diag-display-grid-pattern');
    if (grid) grid.style.display = 'none';
    _diagDisplayEl.style.background = c;
  }
}

function _closeDisplayTest() {
  if (_diagDisplayEl) {
    _diagDisplayEl.classList.add('hidden');
    _diagDisplayEl.style.background = '';
    const grid = _diagDisplayEl.querySelector('.diag-display-grid-pattern');
    if (grid) grid.style.display = 'none';
  }
  document.removeEventListener('keydown', _onDisplayKey);
  _diagDisplayIdx = -1;
}

function _onDisplayKey(e) {
  if (e.key === 'Escape') { _closeDisplayTest(); return; }
}

function _startDisplayTest() {
  _diagDisplayEl = _$('diag-display-overlay');
  if (!_diagDisplayEl) return;
  _diagDisplayEl.classList.remove('hidden');
  _diagDisplayIdx = -1;
  _advanceDisplayColor();
  document.addEventListener('keydown', _onDisplayKey);
}

/* ============================================================
   KEYBOARD TEST — event handlers
   ============================================================ */
let _diagKbPressed  = new Set(); // currently held
let _diagKbTouched  = new Set(); // ever pressed since reset
let _diagKbActive   = false;     // modal open?

function _onDiagKeyDown(e) {
  if (!_diagKbActive) return;
  const code = e.code;
  _diagKbPressed.add(code);
  _diagKbTouched.add(code);
  const el = document.querySelector(`.diag-key[data-kcode="${code}"]`);
  if (el) el.classList.add('pressed');
  _updateKbCounter();
}

function _onDiagKeyUp(e) {
  if (!_diagKbActive) return;
  const code = e.code;
  _diagKbPressed.delete(code);
  const el = document.querySelector(`.diag-key[data-kcode="${code}"]`);
  if (el) el.classList.remove('pressed');
}

function _updateKbCounter() {
  const span = document.querySelector('.diag-kb-counter span');
  if (span) span.textContent = _t('diag.kb_count', { n: _diagKbTouched.size });
}

function _resetKbTest() {
  _diagKbPressed.clear();
  _diagKbTouched.clear();
  document.querySelectorAll('.diag-key.pressed').forEach((el) => el.classList.remove('pressed'));
  _updateKbCounter();
}

/* ============================================================
   UPDATE INFO CARDS (called from app.js update hook)
   ============================================================ */
function diagUpdateInfo(stats) {
  const grid = _$('diag-info-grid');
  if (!grid) return;
  // Only repaint if modal is visible (avoid unnecessary DOM work)
  const modal = _$('diag-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  grid.innerHTML = _buildInfoCards(stats);
  if (window.i18n && window.i18n.apply) window.i18n.apply(grid);
}

/* ============================================================
   INIT — inject modal HTML, wire events
   ============================================================ */
// Build + wire the modal lazily (idempotent). Robust: if anything in the
// DOMContentLoaded init failed before, the modal is still built on first click.
let _diagModalWired = false;
function _ensureDiagModal() {
  let modal = _$('diag-modal');
  if (modal) return modal;
  const wrap = document.createElement('div');
  wrap.innerHTML = _buildDiagModal();
  while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
  modal = _$('diag-modal');
  if (_diagModalWired) return modal;
  _diagModalWired = true;

  const closeBtn = _$('diag-close');
  if (closeBtn) closeBtn.addEventListener('click', closeDiag);
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeDiag(); });

  const kbResetBtn = _$('diag-kb-reset');
  if (kbResetBtn) kbResetBtn.addEventListener('click', _resetKbTest);

  const sndLeft  = _$('diag-snd-left');
  const sndRight = _$('diag-snd-right');
  const sndBoth  = _$('diag-snd-both');
  if (sndLeft)  sndLeft.addEventListener('click',  () => _playTone(-1));
  if (sndRight) sndRight.addEventListener('click', () => _playTone(1));
  if (sndBoth)  sndBoth.addEventListener('click',  () => _playTone(0));

  const dispStart = _$('diag-display-start');
  if (dispStart) dispStart.addEventListener('click', _startDisplayTest);
  const overlay = _$('diag-display-overlay');
  if (overlay) overlay.addEventListener('click', _advanceDisplayColor);

  return modal;
}

function openDiag() {
  const modal = _ensureDiagModal();
  if (!modal) return;
  modal.classList.remove('hidden');
  _diagKbActive = true;
  try { if (typeof lastStats !== 'undefined' && lastStats) diagUpdateInfo(lastStats); } catch (_) {}
  if (window.i18n && window.i18n.apply) window.i18n.apply(modal);
}

function closeDiag() {
  const modal = _$('diag-modal');
  if (modal) modal.classList.add('hidden');
  _diagKbActive = false;
}

function initDiagnostics() {
  try {
    // Topbar button: wired first and independently of the modal build, so it
    // always opens even if something else throws.
    const diagBtn = _$('diag-btn');
    if (diagBtn) diagBtn.addEventListener('click', () => {
      try { if (typeof closeControlMenus === 'function') closeControlMenus(); } catch (_) {}
      openDiag();
    });

    // Keyboard test: global keydown/keyup while active
    document.addEventListener('keydown', _onDiagKeyDown);
    document.addEventListener('keyup',   _onDiagKeyUp);

    // Escape closes modal (unless the display overlay is active)
    document.addEventListener('keydown', (e) => {
      const modal = _$('diag-modal');
      if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
        const overlay = _$('diag-display-overlay');
        if (overlay && !overlay.classList.contains('hidden')) return;
        closeDiag();
      }
    });

    // Re-apply i18n inside the modal when language changes
    if (window.i18n && window.i18n.onChange) {
      window.i18n.onChange(() => {
        const modal = _$('diag-modal');
        if (modal && !modal.classList.contains('hidden')) {
          if (window.i18n.apply) window.i18n.apply(modal);
          _updateKbCounter();
        }
      });
    }

    // Build the modal up front too (so first click is instant); harmless if it
    // fails — openDiag() will rebuild lazily.
    try { _ensureDiagModal(); } catch (e) { console.warn('[diag] modal build deferred:', e); }

    window.diagUpdateInfo = diagUpdateInfo;
  } catch (e) {
    console.error('[diag] init failed:', e);
  }
}

// Auto-init when the DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDiagnostics);
} else {
  initDiagnostics();
}
