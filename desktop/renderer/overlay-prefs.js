/* ROG Monitor — preferencias y avisos del overlay (S11 / ADR-0007).
 * Lógica pura del renderer: normaliza las preferencias guardadas (corruptas/antiguas), arma el
 * selector de monitores, decide el aviso honesto por sesión (Wayland nativo / XWayland) y el atajo
 * Ctrl+Shift+O. Registra sus textos (8 idiomas) en window.i18n. app.js solo cablea el DOM.
 * Script clásico: expone window.RogOverlayPrefs y, bajo Node, module.exports. */
(function (root) {
  'use strict';

  const ANCHORS = ['top-left', 'top-center', 'top-right', 'center', 'bottom-left', 'bottom-center', 'bottom-right'];
  const OFFSET_MAX = 2000;

  function defaults() {
    return { v: 2, enabled: false, monitor: null, displayId: null, corner: 'top-right', offsetX: 0, offsetY: 0,
      layout: 'row', show: { cpu: true, gpu: true, fans: true } };
  }

  function offset(v) {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(OFFSET_MAX, Math.max(-OFFSET_MAX, n)) : 0;
  }

  // v1 guardaba displayId (id de Electron, cambia al reconectar) y no tenía offsets: se conserva
  // displayId como pista y main.js lo resuelve; el selector guarda desde ahora el índice estable.
  function normalize(raw) {
    const d = defaults();
    const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const show = { ...d.show };
    for (const k of ['cpu', 'gpu', 'fans', 'fps']) if (r.show && typeof r.show[k] === 'boolean') show[k] = r.show[k];
    return {
      v: 2,
      enabled: r.enabled === true,
      monitor: Number.isInteger(r.monitor) && r.monitor >= 0 ? r.monitor : null,
      displayId: Number.isFinite(r.displayId) ? r.displayId : null,
      corner: ANCHORS.includes(r.corner) ? r.corner : d.corner,
      offsetX: offset(r.offsetX),
      offsetY: offset(r.offsetY),
      layout: r.layout === 'box' ? 'box' : 'row',
      show,
    };
  }

  function parse(json) {
    try { return normalize(JSON.parse(json)); } catch (_) { return defaults(); }
  }

  function monitorOptions(displays, t) {
    return (displays || []).map((d) => ({
      value: String(d.index),
      label: [t('overlay.monitor_n', { n: d.index + 1 }), `${d.width}×${d.height}`, d.name || null,
        d.primary ? t('overlay.primary') : null].filter(Boolean).join(' · '),
    }));
  }

  // mode = { session, xwayland, x11Active, compat } (list-displays de main.js)
  function notice(mode) {
    if (!mode || mode.session !== 'wayland') return null;
    if (mode.x11Active) {
      return mode.compat
        ? { key: 'overlay.notice_compat_on', level: 'ok', action: 'disable' }
        : { key: 'overlay.notice_restart_off', level: 'warn', action: 'restart' };
    }
    if (!mode.xwayland) return { key: 'overlay.notice_no_xwayland', level: 'warn', action: null };
    if (mode.compat) return { key: 'overlay.notice_restart', level: 'warn', action: 'restart' };
    return { key: 'overlay.notice_wayland', level: 'warn', action: 'enable' };
  }

  // res = respuesta de list-displays. `disable` no lleva botón: el modo activo se apaga con la casilla.
  function noticeView(res, t) {
    const mode = (res && res.mode) || {};
    const n = notice(mode);
    const fallback = !!(res && res.fallback);
    const action = n && n.action !== 'disable' ? n.action : '';
    return {
      text: [fallback ? t('overlay.notice_fallback') : '', n ? t(n.key) : ''].filter(Boolean).join(' '),
      level: fallback ? 'warn' : (n ? n.level : ''),
      action,
      actionLabel: t(action === 'restart' ? 'overlay.restart_now' : 'overlay.enable_compat'),
      offerCompat: mode.session === 'wayland' && !!mode.xwayland, // sin XWayland no se ofrece
    };
  }

  function missingText(missing, t) {
    return missing && missing.length
      ? t('overlay.game_missing', { rows: missing.map((r) => t(`overlay.row_${r}`)).join(', ') }) : '';
  }

  function isToggleShortcut(e) {
    return !!(e && e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && (e.code === 'KeyO' || String(e.key).toLowerCase() === 'o'));
  }

  const STRINGS = {
    'overlay.toggle_tip': { es: 'Mostrar u ocultar el overlay (Ctrl+Shift+O)', en: 'Show or hide the overlay (Ctrl+Shift+O)', fr: "Afficher ou masquer l'overlay (Ctrl+Maj+O)", it: "Mostra o nascondi l'overlay (Ctrl+Maiusc+O)", pt: 'Mostrar ou ocultar o overlay (Ctrl+Shift+O)', zh: '显示或隐藏悬浮窗（Ctrl+Shift+O）', ja: 'オーバーレイの表示/非表示（Ctrl+Shift+O）', ko: '오버레이 표시/숨기기 (Ctrl+Shift+O)' },
    'overlay.settings': { es: 'Ajustes del overlay', en: 'Overlay settings', fr: "Réglages de l'overlay", it: "Impostazioni dell'overlay", pt: 'Definições do overlay', zh: '悬浮窗设置', ja: 'オーバーレイ設定', ko: '오버레이 설정' },
    'overlay.shortcut': { es: 'Atajo: Ctrl+Shift+O con la app en primer plano, o el menú del icono de la bandeja mientras juegas.', en: 'Shortcut: Ctrl+Shift+O while the app is focused, or the tray icon menu while you play.', fr: "Raccourci : Ctrl+Maj+O quand l'application est au premier plan, ou le menu de l'icône de la barre système pendant le jeu.", it: "Scorciatoia: Ctrl+Maiusc+O con l'app in primo piano, oppure il menu dell'icona nell'area di notifica mentre giochi.", pt: 'Atalho: Ctrl+Shift+O com a app em primeiro plano, ou o menu do ícone da bandeja enquanto jogas.', zh: '快捷键：应用在前台时按 Ctrl+Shift+O；游戏中可用托盘图标菜单。', ja: 'ショートカット：アプリが前面にあるときは Ctrl+Shift+O、プレイ中はトレイアイコンのメニュー。', ko: '단축키: 앱이 앞에 있을 때 Ctrl+Shift+O, 게임 중에는 트레이 아이콘 메뉴.' },
    'overlay.monitor_n': { es: 'Monitor {n}', en: 'Monitor {n}', fr: 'Moniteur {n}', it: 'Monitor {n}', pt: 'Monitor {n}', zh: '显示器 {n}', ja: 'モニター {n}', ko: '모니터 {n}' },
    'overlay.primary': { es: 'principal', en: 'primary', fr: 'principal', it: 'principale', pt: 'principal', zh: '主显示器', ja: 'メイン', ko: '기본' },
    'overlay.offset_x': { es: 'Desplazamiento horizontal (px)', en: 'Horizontal offset (px)', fr: 'Décalage horizontal (px)', it: 'Spostamento orizzontale (px)', pt: 'Deslocamento horizontal (px)', zh: '水平偏移（像素）', ja: '水平オフセット（px）', ko: '가로 오프셋 (px)' },
    'overlay.offset_y': { es: 'Desplazamiento vertical (px)', en: 'Vertical offset (px)', fr: 'Décalage vertical (px)', it: 'Spostamento verticale (px)', pt: 'Deslocamento vertical (px)', zh: '垂直偏移（像素）', ja: '垂直オフセット（px）', ko: '세로 오프셋 (px)' },
    'overlay.section_window': { es: 'Ventana encima del escritorio y los juegos', en: 'Window above the desktop and games', fr: 'Fenêtre au-dessus du bureau et des jeux', it: 'Finestra sopra il desktop e i giochi', pt: 'Janela por cima do ambiente de trabalho e dos jogos', zh: '桌面和游戏上方的窗口', ja: 'デスクトップとゲームの上に出すウィンドウ', ko: '데스크톱과 게임 위에 뜨는 창' },
    'overlay.section_game': { es: 'Modo juego (MangoHud, dibujado dentro del juego)', en: 'Game mode (MangoHud, drawn inside the game)', fr: 'Mode jeu (MangoHud, dessiné dans le jeu)', it: 'Modalità gioco (MangoHud, disegnato dentro il gioco)', pt: 'Modo jogo (MangoHud, desenhado dentro do jogo)', zh: '游戏模式（MangoHud，在游戏内绘制）', ja: 'ゲームモード（MangoHud、ゲーム内に描画）', ko: '게임 모드 (MangoHud, 게임 안에 그림)' },
    'overlay.notice_wayland': { es: 'Sesión Wayland nativa: KDE no deja elegir monitor ni posición, y un juego a pantalla completa puede tapar el overlay. Activa el modo compatibilidad (XWayland) para que se respeten.', en: 'Native Wayland session: KDE does not let the app choose the monitor or position, and a full-screen game can cover the overlay. Turn on compatibility mode (XWayland) so they are honoured.', fr: "Session Wayland native : KDE ne laisse pas choisir l'écran ni la position, et un jeu en plein écran peut masquer l'overlay. Activez le mode compatibilité (XWayland) pour qu'ils soient respectés.", it: "Sessione Wayland nativa: KDE non permette di scegliere monitor né posizione, e un gioco a schermo intero può coprire l'overlay. Attiva la modalità compatibilità (XWayland) perché vengano rispettati.", pt: 'Sessão Wayland nativa: o KDE não deixa escolher o monitor nem a posição, e um jogo em ecrã inteiro pode tapar o overlay. Ativa o modo de compatibilidade (XWayland) para que sejam respeitados.', zh: '原生 Wayland 会话：KDE 不允许选择显示器和位置，全屏游戏可能遮住悬浮窗。开启兼容模式（XWayland）即可按设置显示。', ja: 'ネイティブ Wayland セッション：KDE ではモニターと位置を指定できず、フルスクリーンのゲームでオーバーレイが隠れることがあります。互換モード（XWayland）を有効にすると指定どおりになります。', ko: '네이티브 Wayland 세션: KDE에서는 모니터와 위치를 지정할 수 없고, 전체 화면 게임이 오버레이를 가릴 수 있습니다. 호환 모드(XWayland)를 켜면 지정한 대로 표시됩니다.' },
    'overlay.notice_restart': { es: 'Modo compatibilidad guardado: reinicia la app para aplicarlo.', en: 'Compatibility mode saved: restart the app to apply it.', fr: "Mode compatibilité enregistré : redémarrez l'application pour l'appliquer.", it: "Modalità compatibilità salvata: riavvia l'app per applicarla.", pt: 'Modo de compatibilidade guardado: reinicia a app para o aplicar.', zh: '兼容模式已保存：重启应用后生效。', ja: '互換モードを保存しました。適用するにはアプリを再起動してください。', ko: '호환 모드를 저장했습니다. 적용하려면 앱을 다시 시작하세요.' },
    'overlay.notice_restart_off': { es: 'Modo compatibilidad desactivado: reinicia la app para volver a Wayland nativo.', en: 'Compatibility mode turned off: restart the app to go back to native Wayland.', fr: "Mode compatibilité désactivé : redémarrez l'application pour revenir à Wayland natif.", it: "Modalità compatibilità disattivata: riavvia l'app per tornare a Wayland nativo.", pt: 'Modo de compatibilidade desativado: reinicia a app para voltar ao Wayland nativo.', zh: '兼容模式已关闭：重启应用以恢复原生 Wayland。', ja: '互換モードをオフにしました。ネイティブ Wayland に戻すにはアプリを再起動してください。', ko: '호환 모드를 껐습니다. 네이티브 Wayland로 돌아가려면 앱을 다시 시작하세요.' },
    'overlay.notice_no_xwayland': { es: 'Sesión Wayland sin XWayland: monitor y posición no garantizados. Para verlo encima del juego usa el modo juego (MangoHud).', en: 'Wayland session without XWayland: monitor and position are not guaranteed. To see it over a game, use game mode (MangoHud).', fr: "Session Wayland sans XWayland : écran et position non garantis. Pour l'afficher au-dessus d'un jeu, utilisez le mode jeu (MangoHud).", it: 'Sessione Wayland senza XWayland: monitor e posizione non garantiti. Per vederlo sopra un gioco usa la modalità gioco (MangoHud).', pt: 'Sessão Wayland sem XWayland: monitor e posição não garantidos. Para o ver por cima de um jogo, usa o modo jogo (MangoHud).', zh: '没有 XWayland 的 Wayland 会话：无法保证显示器和位置。要在游戏上方显示，请使用游戏模式（MangoHud）。', ja: 'XWayland のない Wayland セッション：モニターと位置は保証されません。ゲーム上に表示するにはゲームモード（MangoHud）を使ってください。', ko: 'XWayland가 없는 Wayland 세션: 모니터와 위치를 보장할 수 없습니다. 게임 위에 표시하려면 게임 모드(MangoHud)를 사용하세요.' },
    'overlay.notice_compat_on': { es: 'Modo compatibilidad activo (XWayland): se respetan el monitor y la posición elegidos.', en: 'Compatibility mode on (XWayland): the chosen monitor and position are honoured.', fr: "Mode compatibilité actif (XWayland) : l'écran et la position choisis sont respectés.", it: 'Modalità compatibilità attiva (XWayland): monitor e posizione scelti vengono rispettati.', pt: 'Modo de compatibilidade ativo (XWayland): o monitor e a posição escolhidos são respeitados.', zh: '兼容模式已开启（XWayland）：将按所选显示器和位置显示。', ja: '互換モード有効（XWayland）：選んだモニターと位置で表示します。', ko: '호환 모드 켜짐(XWayland): 선택한 모니터와 위치를 따릅니다.' },
    'overlay.notice_fallback': { es: 'El monitor elegido no está conectado: el overlay se muestra en el principal.', en: 'The chosen monitor is not connected: the overlay is shown on the primary one.', fr: "L'écran choisi n'est pas connecté : l'overlay s'affiche sur l'écran principal.", it: "Il monitor scelto non è collegato: l'overlay viene mostrato su quello principale.", pt: 'O monitor escolhido não está ligado: o overlay aparece no principal.', zh: '所选显示器未连接：悬浮窗显示在主显示器上。', ja: '選んだモニターが接続されていません。メインモニターに表示します。', ko: '선택한 모니터가 연결되어 있지 않아 기본 모니터에 표시합니다.' },
    'overlay.compat': { es: 'Modo compatibilidad del overlay (XWayland)', en: 'Overlay compatibility mode (XWayland)', fr: "Mode compatibilité de l'overlay (XWayland)", it: "Modalità compatibilità dell'overlay (XWayland)", pt: 'Modo de compatibilidade do overlay (XWayland)', zh: '悬浮窗兼容模式（XWayland）', ja: 'オーバーレイ互換モード（XWayland）', ko: '오버레이 호환 모드 (XWayland)' },
    'overlay.compat_hint': { es: 'Toda la app pasa a XWayland para poder colocar el overlay y dejarlo encima de la pantalla completa sin robar el foco. En monitores con escala distinta la ventana principal puede verse algo menos nítida. Requiere reiniciar la app.', en: 'The whole app moves to XWayland so the overlay can be placed and kept above full screen without stealing focus. On monitors with a different scale the main window may look slightly less sharp. Requires restarting the app.', fr: "Toute l'application passe sous XWayland pour pouvoir placer l'overlay et le garder au-dessus du plein écran sans voler le focus. Sur des écrans à échelle différente, la fenêtre principale peut paraître un peu moins nette. Redémarrage nécessaire.", it: "Tutta l'app passa a XWayland per poter posizionare l'overlay e tenerlo sopra lo schermo intero senza rubare il focus. Su monitor con scala diversa la finestra principale può risultare un po' meno nitida. Richiede il riavvio dell'app.", pt: 'Toda a app passa para XWayland para poder colocar o overlay e mantê-lo por cima do ecrã inteiro sem roubar o foco. Em monitores com escala diferente a janela principal pode ficar um pouco menos nítida. Requer reiniciar a app.', zh: '整个应用改用 XWayland 运行，以便放置悬浮窗并让它在全屏上方显示且不抢焦点。在缩放比例不同的显示器上，主窗口可能略显模糊。需要重启应用。', ja: 'アプリ全体を XWayland で動かし、オーバーレイを配置してフォーカスを奪わずにフルスクリーンの上に保ちます。スケールが異なるモニターではメインウィンドウが少しぼやけることがあります。アプリの再起動が必要です。', ko: '앱 전체를 XWayland로 실행해 오버레이를 원하는 곳에 두고 포커스를 빼앗지 않고 전체 화면 위에 유지합니다. 배율이 다른 모니터에서는 메인 창이 조금 덜 선명할 수 있습니다. 앱을 다시 시작해야 합니다.' },
    'overlay.enable_compat': { es: 'Activar modo compatibilidad', en: 'Turn on compatibility mode', fr: 'Activer le mode compatibilité', it: 'Attiva modalità compatibilità', pt: 'Ativar modo de compatibilidade', zh: '开启兼容模式', ja: '互換モードを有効にする', ko: '호환 모드 켜기' },
    'overlay.restart_now': { es: 'Reiniciar ahora', en: 'Restart now', fr: 'Redémarrer maintenant', it: 'Riavvia ora', pt: 'Reiniciar agora', zh: '立即重启', ja: '今すぐ再起動', ko: '지금 다시 시작' },
    'overlay.restart_later': { es: 'Más tarde', en: 'Later', fr: 'Plus tard', it: 'Più tardi', pt: 'Mais tarde', zh: '稍后', ja: '後で', ko: '나중에' },
    'overlay.restart_msg': { es: 'El cambio se aplica al reiniciar ROG Monitor. ¿Reiniciar ahora?', en: 'The change applies when ROG Monitor restarts. Restart now?', fr: 'La modification s’applique au redémarrage de ROG Monitor. Redémarrer maintenant ?', it: 'La modifica si applica al riavvio di ROG Monitor. Riavviare ora?', pt: 'A alteração aplica-se ao reiniciar o ROG Monitor. Reiniciar agora?', zh: '更改将在 ROG Monitor 重启后生效。现在重启吗？', ja: '変更は ROG Monitor の再起動後に反映されます。今すぐ再起動しますか？', ko: '변경 사항은 ROG Monitor를 다시 시작하면 적용됩니다. 지금 다시 시작할까요?' },
    'overlay.compat_failed': { es: 'Esta sesión no tiene XWayland: el modo compatibilidad no está disponible.', en: 'This session has no XWayland: compatibility mode is not available.', fr: "Cette session n'a pas XWayland : le mode compatibilité n'est pas disponible.", it: 'Questa sessione non ha XWayland: la modalità compatibilità non è disponibile.', pt: 'Esta sessão não tem XWayland: o modo de compatibilidade não está disponível.', zh: '此会话没有 XWayland：兼容模式不可用。', ja: 'このセッションには XWayland がないため、互換モードは使えません。', ko: '이 세션에는 XWayland가 없어 호환 모드를 사용할 수 없습니다.' },
    'overlay.game_mode': { es: 'Activar modo juego', en: 'Turn on game mode', fr: 'Activer le mode jeu', it: 'Attiva modalità gioco', pt: 'Ativar modo jogo', zh: '开启游戏模式', ja: 'ゲームモードを有効にする', ko: '게임 모드 켜기' },
    'overlay.game_hint': { es: 'Para juegos donde la ventana no queda encima (pantalla completa exclusiva, gamescope). Añade un bloque propio al final de tu MangoHud.conf con las mismas métricas y posición; tus líneas no se tocan. En Steam: Propiedades → Opciones de lanzamiento → <code>mangohud %command%</code>. Sigue a la ventana del juego (no elige monitor) y «Centro» pasa a «Arriba centro». Mostrar/ocultar en juego: Shift derecho + F12.', en: 'For games where the window does not stay on top (exclusive full screen, gamescope). Adds its own block at the end of your MangoHud.conf with the same metrics and position; your lines are left untouched. In Steam: Properties → Launch options → <code>mangohud %command%</code>. It follows the game window (no monitor choice) and "Center" becomes "Top center". Show/hide in game: Right Shift + F12.', fr: "Pour les jeux où la fenêtre ne reste pas au-dessus (plein écran exclusif, gamescope). Ajoute son propre bloc à la fin de votre MangoHud.conf avec les mêmes métriques et la même position ; vos lignes ne sont pas modifiées. Dans Steam : Propriétés → Options de lancement → <code>mangohud %command%</code>. Il suit la fenêtre du jeu (pas de choix d'écran) et « Centre » devient « En haut au centre ». Afficher/masquer en jeu : Maj droite + F12.", it: 'Per i giochi in cui la finestra non resta sopra (schermo intero esclusivo, gamescope). Aggiunge un proprio blocco alla fine del tuo MangoHud.conf con le stesse metriche e posizione; le tue righe non vengono toccate. In Steam: Proprietà → Opzioni di avvio → <code>mangohud %command%</code>. Segue la finestra del gioco (nessuna scelta del monitor) e «Centro» diventa «In alto al centro». Mostra/nascondi in gioco: Maiusc destro + F12.', pt: 'Para jogos em que a janela não fica por cima (ecrã inteiro exclusivo, gamescope). Acrescenta um bloco próprio no fim do teu MangoHud.conf com as mesmas métricas e posição; as tuas linhas não são alteradas. No Steam: Propriedades → Opções de arranque → <code>mangohud %command%</code>. Segue a janela do jogo (sem escolha de monitor) e «Centro» passa a «Cima centro». Mostrar/ocultar no jogo: Shift direito + F12.', zh: '用于窗口无法保持在上方的游戏（独占全屏、gamescope）。会在你的 MangoHud.conf 末尾添加独立的配置块，使用相同的指标和位置；你自己的配置行不会被修改。Steam 中：属性 → 启动选项 → <code>mangohud %command%</code>。它跟随游戏窗口（不能选择显示器），“中央”会改为“上中”。游戏中显示/隐藏：右 Shift + F12。', ja: 'ウィンドウが最前面に残らないゲーム（排他フルスクリーン、gamescope）向け。MangoHud.conf の末尾に同じ指標と位置の専用ブロックを追加します。あなたの設定行は変更しません。Steam：プロパティ → 起動オプション → <code>mangohud %command%</code>。ゲームウィンドウに追従し（モニターは選べません）、「中央」は「上中央」になります。ゲーム中の表示/非表示：右 Shift + F12。', ko: '창이 위에 남지 않는 게임(독점 전체 화면, gamescope)용입니다. MangoHud.conf 끝에 같은 지표와 위치로 전용 블록을 추가하며, 사용자의 줄은 건드리지 않습니다. Steam: 속성 → 실행 옵션 → <code>mangohud %command%</code>. 게임 창을 따라가며(모니터 선택 불가) "가운데"는 "위 가운데"가 됩니다. 게임 중 표시/숨기기: 오른쪽 Shift + F12.' },
    'overlay.game_missing': { es: 'No disponible en MangoHud: {rows}.', en: 'Not available in MangoHud: {rows}.', fr: 'Non disponible dans MangoHud : {rows}.', it: 'Non disponibile in MangoHud: {rows}.', pt: 'Não disponível no MangoHud: {rows}.', zh: 'MangoHud 中不可用：{rows}。', ja: 'MangoHud では表示できません：{rows}。', ko: 'MangoHud에서 표시할 수 없음: {rows}.' },
    'overlay.row_fans': { es: 'ventiladores (RPM de ASUS)', en: 'fans (ASUS RPM)', fr: 'ventilateurs (tr/min ASUS)', it: 'ventole (RPM ASUS)', pt: 'ventoinhas (RPM da ASUS)', zh: '风扇（ASUS 转速）', ja: 'ファン（ASUS 回転数）', ko: '팬 (ASUS RPM)' },
    'overlay.no_mangohud': { es: 'MangoHud no está instalado: el modo juego y los FPS no están disponibles.', en: 'MangoHud is not installed: game mode and FPS are not available.', fr: "MangoHud n'est pas installé : le mode jeu et les FPS ne sont pas disponibles.", it: 'MangoHud non è installato: modalità gioco e FPS non disponibili.', pt: 'O MangoHud não está instalado: o modo jogo e os FPS não estão disponíveis.', zh: '未安装 MangoHud：游戏模式和 FPS 不可用。', ja: 'MangoHud がインストールされていないため、ゲームモードと FPS は使えません。', ko: 'MangoHud가 설치되어 있지 않아 게임 모드와 FPS를 사용할 수 없습니다.' },
    'overlay.mango_failed': { es: 'No se pudo editar la configuración de MangoHud', en: 'Could not edit the MangoHud configuration', fr: 'Impossible de modifier la configuration de MangoHud', it: 'Impossibile modificare la configurazione di MangoHud', pt: 'Não foi possível editar a configuração do MangoHud', zh: '无法编辑 MangoHud 配置', ja: 'MangoHud の設定を編集できませんでした', ko: 'MangoHud 설정을 편집할 수 없습니다' },
    'overlay.game_on': { es: 'Modo juego activado: lanza el juego con mangohud %command%.', en: 'Game mode on: launch the game with mangohud %command%.', fr: 'Mode jeu activé : lancez le jeu avec mangohud %command%.', it: 'Modalità gioco attiva: avvia il gioco con mangohud %command%.', pt: 'Modo jogo ativado: inicia o jogo com mangohud %command%.', zh: '游戏模式已开启：用 mangohud %command% 启动游戏。', ja: 'ゲームモード有効：mangohud %command% でゲームを起動してください。', ko: '게임 모드 켜짐: mangohud %command%로 게임을 실행하세요.' },
    'overlay.game_off': { es: 'Modo juego desactivado.', en: 'Game mode off.', fr: 'Mode jeu désactivé.', it: 'Modalità gioco disattivata.', pt: 'Modo jogo desativado.', zh: '游戏模式已关闭。', ja: 'ゲームモードを無効にしました。', ko: '게임 모드 꺼짐.' },
    'overlay.fps_on': { es: 'Registro de FPS activado: lanza el juego con MangoHud y el overlay los mostrará.', en: 'FPS logging on: launch the game with MangoHud and the overlay will show them.', fr: "Journal des FPS activé : lancez le jeu avec MangoHud et l'overlay les affichera.", it: "Registro FPS attivo: avvia il gioco con MangoHud e l'overlay li mostrerà.", pt: 'Registo de FPS ativado: inicia o jogo com o MangoHud e o overlay vai mostrá-los.', zh: 'FPS 记录已开启：用 MangoHud 启动游戏，悬浮窗会显示 FPS。', ja: 'FPS 記録を有効にしました。MangoHud でゲームを起動するとオーバーレイに表示されます。', ko: 'FPS 기록 켜짐: MangoHud로 게임을 실행하면 오버레이에 표시됩니다.' },
    'overlay.fps_off': { es: 'Registro de FPS desactivado.', en: 'FPS logging off.', fr: 'Journal des FPS désactivé.', it: 'Registro FPS disattivato.', pt: 'Registo de FPS desativado.', zh: 'FPS 记录已关闭。', ja: 'FPS 記録を無効にしました。', ko: 'FPS 기록 꺼짐.' },
  };

  if (root && root.i18n && typeof root.i18n.register === 'function') root.i18n.register(STRINGS);

  const api = { ANCHORS, STRINGS, defaults, normalize, parse, monitorOptions, notice, noticeView, missingText, isToggleShortcut };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RogOverlayPrefs = api;
})(typeof window !== 'undefined' ? window : null);
