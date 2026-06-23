/* ROG Monitor desktop renderer. Receives one stats object per second. */

const $ = (id) => document.getElementById(id);

function recordLocalError(kind, payload = {}) {
  try {
    if (window.rog && typeof window.rog.recordError === 'function') {
      window.rog.recordError({
        kind,
        url: location.href,
        ...payload,
      });
    }
  } catch (_) { /* logging must never break UI */ }
}

window.addEventListener('error', (event) => {
  recordLocalError('window-error', {
    message: event.message,
    source: event.filename,
    line: event.lineno,
    column: event.colno,
    stack: event.error && event.error.stack,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  recordLocalError('unhandled-rejection', {
    message: reason && reason.message ? reason.message : String(reason),
    stack: reason && reason.stack,
  });
});

/* --------------------------------------------------------------------------
 * i18n long-tail (v16 Fase A): claves para confirmaciones, toasts y estados
 * que v15 dejó en español duro. Registradas aquí (el motor i18n.js ya cargó).
 * Helper confirmT(): traduce y muestra el modal custom de confirmación.
 * -------------------------------------------------------------------------- */
function dialogText(key, fallback, vars) {
  const value = t(key, vars);
  return value === key ? fallback : value;
}

let activeConfirmResolve = null;

function rogChoiceDialog({
  title,
  message,
  okLabel,
  cancelLabel,
  altLabel,
  rememberLabel,
} = {}) {
  if (activeConfirmResolve) {
    return Promise.resolve({ choice: 'cancel', remember: false });
  }
  return new Promise((resolve) => {
    const modal = $('confirm-modal');
    const titleEl = $('confirm-title');
    const messageEl = $('confirm-message');
    const okBtn = $('confirm-ok');
    const cancelBtn = $('confirm-cancel');
    const altBtn = $('confirm-alt');
    const rememberRow = $('confirm-remember-row');
    const remember = $('confirm-remember');
    const rememberText = $('confirm-remember-label');

    activeConfirmResolve = resolve;
    titleEl.textContent = title || dialogText('confirm.title', 'Confirmar');
    messageEl.textContent = message || '';
    okBtn.textContent = okLabel || dialogText('common.ok', 'Aceptar');
    cancelBtn.textContent = cancelLabel || t('common.cancel');
    if (altLabel) {
      altBtn.textContent = altLabel;
      altBtn.classList.remove('hidden');
    } else {
      altBtn.classList.add('hidden');
    }
    if (rememberLabel) {
      remember.checked = false;
      rememberText.textContent = rememberLabel;
      rememberRow.classList.remove('hidden');
    } else {
      remember.checked = false;
      rememberRow.classList.add('hidden');
    }

    const cleanup = (choice) => {
      modal.classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      altBtn.removeEventListener('click', onAlt);
      modal.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      const out = { choice, remember: remember.checked };
      const done = activeConfirmResolve;
      activeConfirmResolve = null;
      done(out);
    };
    const onOk = () => cleanup('ok');
    const onCancel = () => cleanup('cancel');
    const onAlt = () => cleanup('alt');
    const onBackdrop = (event) => { if (event.target === modal) cleanup('cancel'); };
    const onKey = (event) => {
      if (event.key === 'Escape') cleanup('cancel');
      if (event.key === 'Enter') cleanup('ok');
    };

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    altBtn.addEventListener('click', onAlt);
    modal.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
    modal.classList.remove('hidden');
    okBtn.focus();
  });
}

async function rogConfirm(message, options = {}) {
  const res = await rogChoiceDialog({ message, ...options });
  return res.choice === 'ok';
}

async function confirmT(key, vars, options = {}) {
  return rogConfirm(t(key, vars), options);
}

window.rogConfirm = rogConfirm;
window.rogChoiceDialog = rogChoiceDialog;

if (window.rog?.onCloseRequest) {
  window.rog.onCloseRequest(async () => {
    const res = await rogChoiceDialog({
      title: dialogText('close.title', 'Cerrar ROG Monitor'),
      message: dialogText('close.message',
        '¿Qué quieres hacer con ROG Monitor?\n\nSalir detiene el monitor y quita el icono de bandeja. Minimizar lo deja pausado en bandeja para abrirlo rápido después.'),
      okLabel: dialogText('close.quit', 'Salir / Quit'),
      altLabel: dialogText('close.tray', 'Minimizar a bandeja'),
      cancelLabel: t('common.cancel'),
      rememberLabel: dialogText('close.remember', 'Recordar mi elección'),
    });
    const choice = res.choice === 'ok' ? 'quit' : (res.choice === 'alt' ? 'tray' : 'cancel');
    await window.rog.closeChoice({ choice, remember: res.remember });
  });
}

if (window.i18n && window.i18n.register) {
  window.i18n.register({
    /* ---- confirms nativos ---- */
    'confirm.bench_clear_all': { es: '¿Borrar TODOS los benchmarks anteriores? Esta acción no se puede deshacer.', en: 'Delete ALL previous benchmarks? This cannot be undone.', fr: 'Supprimer TOUS les benchmarks précédents ? Action irréversible.', it: 'Eliminare TUTTI i benchmark precedenti? Operazione irreversibile.', pt: 'Apagar TODOS os benchmarks anteriores? Esta ação não pode ser desfeita.', zh: '删除所有以前的基准测试？此操作无法撤销。', ja: '以前のベンチマークをすべて削除しますか？この操作は元に戻せません。', ko: '이전 벤치마크를 모두 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.' },
    'confirm.uninstall_purge': { es: '¿Desinstalar ROG Monitor Y BORRAR tus configuraciones? No se puede deshacer.', en: 'Uninstall ROG Monitor AND DELETE your settings? This cannot be undone.', fr: 'Désinstaller ROG Monitor ET SUPPRIMER vos réglages ? Irréversible.', it: 'Disinstallare ROG Monitor ED ELIMINARE le tue impostazioni? Irreversibile.', pt: 'Desinstalar o ROG Monitor E APAGAR as tuas configurações? Não pode ser desfeito.', zh: '卸载 ROG Monitor 并删除您的配置？此操作无法撤销。', ja: 'ROG Monitor をアンインストールし、設定も削除しますか？元に戻せません。', ko: 'ROG Monitor를 제거하고 설정도 삭제하시겠습니까? 되돌릴 수 없습니다.' },
    'confirm.uninstall_keep': { es: '¿Desinstalar ROG Monitor? (se conservan tus configuraciones)', en: 'Uninstall ROG Monitor? (your settings are kept)', fr: 'Désinstaller ROG Monitor ? (vos réglages sont conservés)', it: 'Disinstallare ROG Monitor? (le impostazioni vengono mantenute)', pt: 'Desinstalar o ROG Monitor? (as tuas configurações são mantidas)', zh: '卸载 ROG Monitor？（保留您的配置）', ja: 'ROG Monitor をアンインストールしますか？（設定は保持されます）', ko: 'ROG Monitor를 제거하시겠습니까? (설정은 유지됩니다)' },
    'confirm.uninstall_pw_note': { es: '\n\nSe pedirá tu contraseña para quitar las integraciones de sistema.', en: '\n\nYour password will be requested to remove system integrations.', fr: '\n\nVotre mot de passe sera demandé pour retirer les intégrations système.', it: '\n\nVerrà richiesta la password per rimuovere le integrazioni di sistema.', pt: '\n\nA tua senha será pedida para remover as integrações do sistema.', zh: '\n\n移除系统集成时将要求输入密码。', ja: '\n\nシステム統合を削除するためにパスワードが要求されます。', ko: '\n\n시스템 통합을 제거하기 위해 비밀번호를 요청합니다.' },
    'confirm.aura_setup': { es: 'Esto configurará y arrancará asusd para Aura sin apagar rog-profile-sync.\n\nPedirá tu contraseña de administrador. ¿Continuar?', en: 'This will set up and start asusd for Aura without turning off rog-profile-sync.\n\nIt will ask for your admin password. Continue?', fr: 'Ceci configurera et démarrera asusd pour Aura sans désactiver rog-profile-sync.\n\nVotre mot de passe administrateur sera demandé. Continuer ?', it: 'Questo configurerà e avvierà asusd per Aura senza disattivare rog-profile-sync.\n\nVerrà richiesta la password di amministratore. Continuare?', pt: 'Isto vai configurar e iniciar o asusd para o Aura sem desligar o rog-profile-sync.\n\nPedirá a tua senha de administrador. Continuar?', zh: '这将配置并启动用于 Aura 的 asusd，不会关闭 rog-profile-sync。\n\n将要求输入管理员密码。是否继续？', ja: 'rog-profile-sync をオフにせず、Aura 用に asusd を設定・起動します。\n\n管理者パスワードが要求されます。続行しますか？', ko: 'rog-profile-sync를 끄지 않고 Aura용 asusd를 설정하고 시작합니다.\n\n관리자 비밀번호를 요청합니다. 계속하시겠습니까?' },
    'confirm.delete_profile': { es: '¿Borrar el perfil "{name}"? Esta acción no se puede deshacer.', en: 'Delete profile "{name}"? This cannot be undone.', fr: 'Supprimer le profil « {name} » ? Action irréversible.', it: 'Eliminare il profilo "{name}"? Operazione irreversibile.', pt: 'Apagar o perfil "{name}"? Esta ação não pode ser desfeita.', zh: '删除配置“{name}”？此操作无法撤销。', ja: 'プロファイル「{name}」を削除しますか？この操作は元に戻せません。', ko: '프로파일 "{name}"을(를) 삭제하시겠습니까? 되돌릴 수 없습니다.' },
    'confirm.fan_calibrate': { es: 'Calibrar ventiladores (medir máximos reales):\n\nLos ventiladores pasarán por 7 velocidades (1-3 min: espera a que\nestabilicen en cada una, va a sonar fuerte) midiendo sus RPM reales.\nCon esa tabla el tope de RPM cae exacto. Al terminar se restaura solo.\nPedirá tu contraseña.\n\n¿Continuar?', en: 'Calibrate fans (measure real maxima):\n\nThe fans will run through 7 speeds (1-3 min: wait for them to\nsettle at each one, it will get loud) measuring their real RPM.\nWith that table the RPM cap lands exact. It restores itself when done.\nIt will ask for your password.\n\nContinue?', fr: 'Calibrer les ventilateurs (mesurer les maxima réels) :\n\nLes ventilateurs passeront par 7 vitesses (1-3 min : attendez qu\'ils\nse stabilisent à chacune, ce sera bruyant) en mesurant leurs RPM réels.\nAvec cette table, la limite RPM est exacte. Tout se restaure à la fin.\nVotre mot de passe sera demandé.\n\nContinuer ?', it: 'Calibrare le ventole (misurare i massimi reali):\n\nLe ventole passeranno per 7 velocità (1-3 min: attendi che\nsi stabilizzino su ciascuna, sarà rumoroso) misurando gli RPM reali.\nCon quella tabella il limite RPM è esatto. Al termine si ripristina da solo.\nVerrà richiesta la password.\n\nContinuare?', pt: 'Calibrar ventoinhas (medir máximos reais):\n\nAs ventoinhas passarão por 7 velocidades (1-3 min: espera que\nestabilizem em cada uma, vai ficar barulhento) medindo as RPM reais.\nCom essa tabela o cap de RPM fica exato. No fim restaura-se sozinho.\nPedirá a tua senha.\n\nContinuar?', zh: '校准风扇（测量真实最大值）：\n\n风扇将经过 7 个速度（1-3 分钟：请等待每个速度\n稳定，声音会很大）测量其真实 RPM。\n有了该表格，RPM 上限将非常精确。完成后会自动恢复。\n将要求输入密码。\n\n是否继续？', ja: 'ファンを校正（実際の最大値を測定）：\n\nファンが 7 段階の速度を通過し（1〜3 分：各段階で安定するまで\n待ってください、大きな音がします）、実際の RPM を測定します。\nその表で RPM 上限が正確になります。終了時に自動で元に戻ります。\nパスワードが要求されます。\n\n続行しますか？', ko: '팬 보정 (실제 최대값 측정):\n\n팬이 7가지 속도를 거치며 (1-3분: 각 속도에서 안정될 때까지\n기다리세요, 소리가 커집니다) 실제 RPM을 측정합니다.\n그 표로 RPM 상한이 정확해집니다. 완료되면 자동으로 복원됩니다.\n비밀번호를 요청합니다.\n\n계속하시겠습니까?' },
    'confirm.fan_risk': { es: 'ADVERTENCIA: dejaste los ventiladores por debajo del 60% en los puntos más calientes en: {labels}.\n\nEsto puede sobrecalentar y dañar tu equipo bajo carga.\n\n¿Entiendes el riesgo y quieres continuar?', en: 'WARNING: you left the fans below 60% at the hottest points in: {labels}.\n\nThis can overheat and damage your machine under load.\n\nDo you understand the risk and want to continue?', fr: 'AVERTISSEMENT : vous avez laissé les ventilateurs sous 60 % aux points les plus chauds dans : {labels}.\n\nCela peut surchauffer et endommager votre machine sous charge.\n\nComprenez-vous le risque et voulez-vous continuer ?', it: 'ATTENZIONE: hai lasciato le ventole sotto il 60% nei punti più caldi in: {labels}.\n\nQuesto può surriscaldare e danneggiare il tuo computer sotto carico.\n\nCapisci il rischio e vuoi continuare?', pt: 'AVISO: deixaste as ventoinhas abaixo de 60% nos pontos mais quentes em: {labels}.\n\nIsto pode sobreaquecer e danificar o teu equipamento sob carga.\n\nCompreendes o risco e queres continuar?', zh: '警告：您在以下配置的最热点将风扇设置低于 60%：{labels}。\n\n这可能在高负载下导致过热并损坏您的设备。\n\n您是否了解风险并希望继续？', ja: '警告：最も高温になる箇所でファンを 60% 未満にしました：{labels}。\n\n高負荷時に過熱し、機器を損傷する可能性があります。\n\nリスクを理解した上で続行しますか？', ko: '경고: 가장 뜨거운 지점에서 팬을 60% 미만으로 설정했습니다: {labels}.\n\n부하 시 과열되어 장비가 손상될 수 있습니다.\n\n위험을 이해하고 계속하시겠습니까?' },
    'confirm.import_config': { es: 'Importar una configuración reemplaza tus curvas, cap, calibración, perfiles Aura y umbrales actuales (se guarda un respaldo .pre-import).\n\n¿Continuar?', en: 'Importing a configuration replaces your current curves, cap, calibration, Aura profiles and thresholds (a .pre-import backup is saved).\n\nContinue?', fr: 'Importer une configuration remplace vos courbes, limite, calibration, profils Aura et seuils actuels (une sauvegarde .pre-import est créée).\n\nContinuer ?', it: 'Importare una configurazione sostituisce le tue curve, cap, calibrazione, profili Aura e soglie attuali (viene salvato un backup .pre-import).\n\nContinuare?', pt: 'Importar uma configuração substitui as tuas curvas, cap, calibração, perfis Aura e limiares atuais (é guardado um backup .pre-import).\n\nContinuar?', zh: '导入配置将替换您当前的曲线、上限、校准、Aura 配置和阈值（会保存 .pre-import 备份）。\n\n是否继续？', ja: '設定をインポートすると、現在のカーブ、上限、校正、Aura プロファイル、しきい値が置き換わります（.pre-import バックアップが保存されます）。\n\n続行しますか？', ko: '구성을 가져오면 현재 커브, 상한, 보정, Aura 프로파일 및 임계값이 대체됩니다 (.pre-import 백업이 저장됩니다).\n\n계속하시겠습니까?' },
    'confirm.kill_proc': { es: '¿Cerrar el proceso "{name}" (PID {pid})?\n\nSe le pedirá terminar de forma ordenada (SIGTERM). Si es una app, perderás lo que no hayas guardado en ella.', en: 'Close the process "{name}" (PID {pid})?\n\nIt will be asked to terminate gracefully (SIGTERM). If it is an app, you will lose anything unsaved in it.', fr: 'Fermer le processus « {name} » (PID {pid}) ?\n\nIl recevra une demande d\'arrêt propre (SIGTERM). Si c\'est une appli, vous perdrez tout ce qui n\'y est pas enregistré.', it: 'Chiudere il processo "{name}" (PID {pid})?\n\nGli verrà chiesto di terminare in modo ordinato (SIGTERM). Se è un\'app, perderai ciò che non hai salvato.', pt: 'Fechar o processo "{name}" (PID {pid})?\n\nSerá pedido para terminar de forma ordenada (SIGTERM). Se for uma app, perderás o que não tiveres guardado nela.', zh: '关闭进程“{name}”（PID {pid}）？\n\n将请求其正常终止（SIGTERM）。如果是应用程序，您将丢失其中未保存的内容。', ja: 'プロセス「{name}」（PID {pid}）を終了しますか？\n\n正常終了（SIGTERM）が要求されます。アプリの場合、保存していない内容が失われます。', ko: '프로세스 "{name}"(PID {pid})을(를) 종료하시겠습니까?\n\n정상 종료(SIGTERM)를 요청합니다. 앱인 경우 저장하지 않은 내용을 잃게 됩니다.' },
    'confirm.kill_proc_short': { es: '¿Cerrar "{name}" (PID {pid})? Perderás lo no guardado en esa app.', en: 'Close "{name}" (PID {pid})? You will lose anything unsaved in that app.', fr: 'Fermer « {name} » (PID {pid}) ? Vous perdrez tout ce qui n\'est pas enregistré dans cette appli.', it: 'Chiudere "{name}" (PID {pid})? Perderai ciò che non hai salvato in quell\'app.', pt: 'Fechar "{name}" (PID {pid})? Perderás o que não tiveres guardado nessa app.', zh: '关闭“{name}”（PID {pid}）？您将丢失该应用中未保存的内容。', ja: '「{name}」（PID {pid}）を終了しますか？そのアプリの未保存の内容が失われます。', ko: '"{name}"(PID {pid})을(를) 종료하시겠습니까? 해당 앱의 저장하지 않은 내용을 잃게 됩니다.' },
    'confirm.bench_cpu': { es: 'La CPU se irá al 100% durante 45 segundos. Puede subir bastante la temperatura. ¿Continuar?', en: 'The CPU will hit 100% for 45 seconds. The temperature may rise quite a bit. Continue?', fr: 'Le CPU passera à 100 % pendant 45 secondes. La température peut beaucoup monter. Continuer ?', it: 'La CPU andrà al 100% per 45 secondi. La temperatura può salire parecchio. Continuare?', pt: 'A CPU irá a 100% durante 45 segundos. A temperatura pode subir bastante. Continuar?', zh: 'CPU 将在 45 秒内达到 100%。温度可能会大幅上升。是否继续？', ja: 'CPU が 45 秒間 100% になります。温度がかなり上昇する可能性があります。続行しますか？', ko: 'CPU가 45초 동안 100%로 작동합니다. 온도가 상당히 오를 수 있습니다. 계속하시겠습니까?' },
    'confirm.bench_gpu': { es: 'La GPU se pondrá al máximo durante 45 segundos (se abrirán varias ventanas de carga que se cierran al terminar). Va a subir la temperatura. ¿Continuar?', en: 'The GPU will run at maximum for 45 seconds (several load windows will open and close when done). The temperature will rise. Continue?', fr: 'Le GPU tournera au maximum pendant 45 secondes (plusieurs fenêtres de charge s\'ouvriront et se fermeront à la fin). La température va monter. Continuer ?', it: 'La GPU andrà al massimo per 45 secondi (si apriranno varie finestre di carico che si chiudono alla fine). La temperatura salirà. Continuare?', pt: 'A GPU irá ao máximo durante 45 segundos (abrir-se-ão várias janelas de carga que fecham no fim). A temperatura vai subir. Continuar?', zh: 'GPU 将在 45 秒内全力运行（会打开多个负载窗口，结束时关闭）。温度将会上升。是否继续？', ja: 'GPU が 45 秒間最大で動作します（複数の負荷ウィンドウが開き、終了時に閉じます）。温度が上昇します。続行しますか？', ko: 'GPU가 45초 동안 최대로 작동합니다 (여러 부하 창이 열렸다가 완료 시 닫힙니다). 온도가 오릅니다. 계속하시겠습니까?' },

    /* ---- gpuSwitchWarning (texto del confirm de cambio de GPU) ---- */
    'gpu.warn_dgpu_name': { es: 'la {name}', en: 'the {name}', fr: 'la {name}', it: 'la {name}', pt: 'a {name}', zh: '{name}', ja: '{name}', ko: '{name}' },
    'gpu.warn_dgpu_generic': { es: 'la GPU dedicada', en: 'the dedicated GPU', fr: 'le GPU dédié', it: 'la GPU dedicata', pt: 'a GPU dedicada', zh: '独立 GPU', ja: '専用 GPU', ko: '전용 GPU' },
    'gpu.warn_mux': { es: 'Modo dGPU (MUX): {gpu} maneja TODO, incluida la pantalla.\n\n✓ Más FPS en juegos\n✗ Mucho más consumo de batería\n✗ Requiere REINICIAR el equipo\n\nGuarda tu trabajo antes de continuar. ¿Solicitar el cambio?', en: 'dGPU mode (MUX): {gpu} drives EVERYTHING, including the display.\n\n✓ More FPS in games\n✗ Much higher battery drain\n✗ Requires a REBOOT\n\nSave your work before continuing. Request the change?', fr: 'Mode dGPU (MUX) : {gpu} gère TOUT, y compris l\'écran.\n\n✓ Plus de FPS en jeu\n✗ Bien plus de consommation de batterie\n✗ Nécessite un REDÉMARRAGE\n\nEnregistrez votre travail avant de continuer. Demander le changement ?', it: 'Modalità dGPU (MUX): {gpu} gestisce TUTTO, incluso lo schermo.\n\n✓ Più FPS nei giochi\n✗ Consumo di batteria molto più alto\n✗ Richiede il RIAVVIO\n\nSalva il tuo lavoro prima di continuare. Richiedere il cambio?', pt: 'Modo dGPU (MUX): {gpu} controla TUDO, incluindo o ecrã.\n\n✓ Mais FPS em jogos\n✗ Muito mais consumo de bateria\n✗ Requer REINICIAR o equipamento\n\nGuarda o teu trabalho antes de continuar. Solicitar a mudança?', zh: 'dGPU 模式（MUX）：{gpu} 处理一切，包括显示。\n\n✓ 游戏中更高的 FPS\n✗ 电池消耗大得多\n✗ 需要重启设备\n\n继续前请保存工作。请求更改？', ja: 'dGPU モード（MUX）：{gpu} がディスプレイを含むすべてを処理します。\n\n✓ ゲームでの FPS 向上\n✗ バッテリー消費が大幅に増加\n✗ 再起動が必要\n\n続行前に作業を保存してください。変更を要求しますか？', ko: 'dGPU 모드(MUX): {gpu}이(가) 디스플레이를 포함한 모든 것을 처리합니다.\n\n✓ 게임에서 더 높은 FPS\n✗ 훨씬 높은 배터리 소모\n✗ 재부팅 필요\n\n계속하기 전에 작업을 저장하세요. 변경을 요청하시겠습니까?' },
    'gpu.warn_igpu': { es: 'Modo iGPU: se apaga {gpu} para ahorrar batería.\n\nEsto puede cerrar tu sesión gráfica o dejar un cambio pendiente hasta cerrar sesión.\nGuarda tu trabajo antes de continuar. ¿Solicitar el cambio?', en: 'iGPU mode: {gpu} is turned off to save battery.\n\nThis may close your graphical session or leave a change pending until log-out.\nSave your work before continuing. Request the change?', fr: 'Mode iGPU : {gpu} est éteint pour économiser la batterie.\n\nCela peut fermer votre session graphique ou laisser un changement en attente jusqu\'à la déconnexion.\nEnregistrez votre travail avant de continuer. Demander le changement ?', it: 'Modalità iGPU: {gpu} viene spenta per risparmiare batteria.\n\nQuesto può chiudere la sessione grafica o lasciare un cambiamento in sospeso fino al logout.\nSalva il tuo lavoro prima di continuare. Richiedere il cambio?', pt: 'Modo iGPU: {gpu} é desligada para poupar bateria.\n\nIsto pode fechar a tua sessão gráfica ou deixar uma mudança pendente até saíres da sessão.\nGuarda o teu trabalho antes de continuar. Solicitar a mudança?', zh: 'iGPU 模式：关闭 {gpu} 以节省电池。\n\n这可能会关闭您的图形会话，或在注销前保留待定更改。\n继续前请保存工作。请求更改？', ja: 'iGPU モード：バッテリー節約のため {gpu} をオフにします。\n\nグラフィカルセッションが閉じる、またはログアウトまで変更が保留される場合があります。\n続行前に作業を保存してください。変更を要求しますか？', ko: 'iGPU 모드: 배터리 절약을 위해 {gpu}을(를) 끕니다.\n\n그래픽 세션이 종료되거나 로그아웃할 때까지 변경이 보류될 수 있습니다.\n계속하기 전에 작업을 저장하세요. 변경을 요청하시겠습니까?' },
    'gpu.warn_hybrid': { es: 'Modo Hybrid: escritorio en iGPU + {gpu} para juegos.\n\nEsto puede cerrar tu sesión gráfica o dejar un cambio pendiente hasta cerrar sesión.\nGuarda tu trabajo antes de continuar. ¿Solicitar el cambio?', en: 'Hybrid mode: desktop on iGPU + {gpu} for games.\n\nThis may close your graphical session or leave a change pending until log-out.\nSave your work before continuing. Request the change?', fr: 'Mode Hybrid : bureau sur iGPU + {gpu} pour les jeux.\n\nCela peut fermer votre session graphique ou laisser un changement en attente jusqu\'à la déconnexion.\nEnregistrez votre travail avant de continuer. Demander le changement ?', it: 'Modalità Hybrid: desktop su iGPU + {gpu} per i giochi.\n\nQuesto può chiudere la sessione grafica o lasciare un cambiamento in sospeso fino al logout.\nSalva il tuo lavoro prima di continuare. Richiedere il cambio?', pt: 'Modo Hybrid: ambiente de trabalho na iGPU + {gpu} para jogos.\n\nIsto pode fechar a tua sessão gráfica ou deixar uma mudança pendente até saíres da sessão.\nGuarda o teu trabalho antes de continuar. Solicitar a mudança?', zh: 'Hybrid 模式：桌面使用 iGPU + 游戏使用 {gpu}。\n\n这可能会关闭您的图形会话，或在注销前保留待定更改。\n继续前请保存工作。请求更改？', ja: 'Hybrid モード：デスクトップは iGPU、ゲームは {gpu}。\n\nグラフィカルセッションが閉じる、またはログアウトまで変更が保留される場合があります。\n続行前に作業を保存してください。変更を要求しますか？', ko: 'Hybrid 모드: 데스크톱은 iGPU + 게임은 {gpu}.\n\n그래픽 세션이 종료되거나 로그아웃할 때까지 변경이 보류될 수 있습니다.\n계속하기 전에 작업을 저장하세요. 변경을 요청하시겠습니까?' },

    /* ---- estados de Aura (setAuraStatus / nota / efecto fallback) ---- */
    'aura.status_music': { es: 'Modo música activo: la iluminación está siendo controlada por el audio.', en: 'Music mode on: the lighting is being driven by the audio.', fr: 'Mode musique activé : l\'éclairage est piloté par l\'audio.', it: 'Modalità musica attiva: l\'illuminazione è guidata dall\'audio.', pt: 'Modo música ativo: a iluminação está a ser controlada pelo áudio.', zh: '音乐模式开启：灯光由音频控制。', ja: 'ミュージックモード：照明が音声によって制御されています。', ko: '음악 모드 켜짐: 조명이 오디오에 의해 제어됩니다.' },
    'aura.status_dirty': { es: 'Tienes cambios sin aplicar.', en: 'You have unapplied changes.', fr: 'Vous avez des modifications non appliquées.', it: 'Hai modifiche non applicate.', pt: 'Tens alterações por aplicar.', zh: '您有未应用的更改。', ja: '未適用の変更があります。', ko: '적용되지 않은 변경 사항이 있습니다.' },
    'aura.status_ready': { es: 'Iluminación aplicada y lista.', en: 'Lighting applied and ready.', fr: 'Éclairage appliqué et prêt.', it: 'Illuminazione applicata e pronta.', pt: 'Iluminação aplicada e pronta.', zh: '灯光已应用并就绪。', ja: '照明が適用され、準備完了です。', ko: '조명이 적용되어 준비되었습니다.' },
    'aura.status_need_setup': { es: 'Primero activa asusd con el botón ACTIVAR AURA.', en: 'First enable asusd with the ENABLE AURA button.', fr: 'Activez d\'abord asusd avec le bouton ACTIVER AURA.', it: 'Prima attiva asusd con il pulsante ATTIVA AURA.', pt: 'Primeiro ativa o asusd com o botão ATIVAR AURA.', zh: '请先用“启用 AURA”按钮启用 asusd。', ja: '先に「AURA を有効化」ボタンで asusd を有効にしてください。', ko: '먼저 "AURA 활성화" 버튼으로 asusd를 활성화하세요.' },
    'aura.status_apply_failed': { es: 'Aura falló al aplicar.', en: 'Aura failed to apply.', fr: 'Échec de l\'application d\'Aura.', it: 'Applicazione di Aura fallita.', pt: 'O Aura falhou ao aplicar.', zh: 'Aura 应用失败。', ja: 'Aura の適用に失敗しました。', ko: 'Aura 적용에 실패했습니다.' },
    'aura.status_enabling': { es: 'Activando asusd para Aura…', en: 'Enabling asusd for Aura…', fr: 'Activation d\'asusd pour Aura…', it: 'Attivazione di asusd per Aura…', pt: 'A ativar o asusd para o Aura…', zh: '正在为 Aura 启用 asusd…', ja: 'Aura 用に asusd を有効化中…', ko: 'Aura용 asusd 활성화 중…' },
    'aura.status_enable_failed': { es: 'No se pudo activar Aura: {err}', en: 'Could not enable Aura: {err}', fr: 'Impossible d\'activer Aura : {err}', it: 'Impossibile attivare Aura: {err}', pt: 'Não foi possível ativar o Aura: {err}', zh: '无法启用 Aura：{err}', ja: 'Aura を有効化できませんでした：{err}', ko: 'Aura를 활성화할 수 없습니다: {err}' },
    'aura.note_ready': { es: 'Aura lista en {path}. Brillo actual: {b}.', en: 'Aura ready at {path}. Current brightness: {b}.', fr: 'Aura prêt à {path}. Luminosité actuelle : {b}.', it: 'Aura pronta in {path}. Luminosità attuale: {b}.', pt: 'Aura pronta em {path}. Brilho atual: {b}.', zh: 'Aura 已就绪：{path}。当前亮度：{b}。', ja: 'Aura 準備完了：{path}。現在の明るさ：{b}。', ko: 'Aura 준비 완료: {path}. 현재 밝기: {b}.' },
    'aura.brightness_unknown': { es: 'desconocido', en: 'unknown', fr: 'inconnu', it: 'sconosciuto', pt: 'desconhecido', zh: '未知', ja: '不明', ko: '알 수 없음' },
    'aura.asusctl_unavailable': { es: 'asusctl no disponible', en: 'asusctl not available', fr: 'asusctl non disponible', it: 'asusctl non disponibile', pt: 'asusctl não disponível', zh: 'asusctl 不可用', ja: 'asusctl は利用できません', ko: 'asusctl를 사용할 수 없습니다' },
    'aura.effect_fallback': { es: 'efecto', en: 'effect', fr: 'effet', it: 'effetto', pt: 'efeito', zh: '效果', ja: 'エフェクト', ko: '효과' },
    'aura.applied_ok': { es: 'Aura aplicada ✓', en: 'Aura applied ✓', fr: 'Aura appliqué ✓', it: 'Aura applicata ✓', pt: 'Aura aplicada ✓', zh: 'Aura 已应用 ✓', ja: 'Aura を適用しました ✓', ko: 'Aura가 적용되었습니다 ✓' },

    /* ---- estados de alertas (setAlertsStatus) ---- */
    'alerts.status_saving': { es: 'Guardando y reiniciando el monitor…', en: 'Saving and restarting the monitor…', fr: 'Enregistrement et redémarrage du moniteur…', it: 'Salvataggio e riavvio del monitor…', pt: 'A guardar e reiniciar o monitor…', zh: '正在保存并重启监视器…', ja: '保存してモニターを再起動中…', ko: '저장하고 모니터를 다시 시작하는 중…' },
    'alerts.status_save_failed': { es: 'No se pudo guardar.', en: 'Could not save.', fr: 'Impossible d\'enregistrer.', it: 'Impossibile salvare.', pt: 'Não foi possível guardar.', zh: '无法保存。', ja: '保存できませんでした。', ko: '저장할 수 없습니다.' },
    'alerts.status_saved': { es: 'Guardado y aplicado ✓', en: 'Saved and applied ✓', fr: 'Enregistré et appliqué ✓', it: 'Salvato e applicato ✓', pt: 'Guardado e aplicado ✓', zh: '已保存并应用 ✓', ja: '保存して適用しました ✓', ko: '저장 및 적용되었습니다 ✓' },

    /* ---- benchmark: resumen, estado inline, estados del modal ---- */
    'bench.summary_none': { es: 'sin resultados', en: 'no results', fr: 'aucun résultat', it: 'nessun risultato', pt: 'sem resultados', zh: '无结果', ja: '結果なし', ko: '결과 없음' },
    'bench.failed': { es: 'benchmark falló', en: 'benchmark failed', fr: 'le benchmark a échoué', it: 'benchmark fallito', pt: 'o benchmark falhou', zh: '基准测试失败', ja: 'ベンチマークに失敗しました', ko: '벤치마크 실패' },
    'bench.no_fan_data': { es: 'sin datos de ventiladores', en: 'no fan data', fr: 'pas de données de ventilateurs', it: 'nessun dato ventole', pt: 'sem dados de ventoinhas', zh: '无风扇数据', ja: 'ファンデータなし', ko: '팬 데이터 없음' },
    'bench.summary_cpu_max': { es: 'CPU máx: {temp}°C · paquete {pkg}°C · {watts} W', en: 'CPU max: {temp}°C · package {pkg}°C · {watts} W', fr: 'CPU max : {temp}°C · package {pkg}°C · {watts} W', it: 'CPU max: {temp}°C · package {pkg}°C · {watts} W', pt: 'CPU máx: {temp}°C · package {pkg}°C · {watts} W', zh: 'CPU 最高：{temp}°C · 封装 {pkg}°C · {watts} W', ja: 'CPU 最大：{temp}°C · パッケージ {pkg}°C · {watts} W', ko: 'CPU 최대: {temp}°C · 패키지 {pkg}°C · {watts} W' },
    'bench.summary_gpu_max': { es: 'GPU máx: {temp}°C · {watts} W · uso {util}%', en: 'GPU max: {temp}°C · {watts} W · usage {util}%', fr: 'GPU max : {temp}°C · {watts} W · utilisation {util}%', it: 'GPU max: {temp}°C · {watts} W · utilizzo {util}%', pt: 'GPU máx: {temp}°C · {watts} W · uso {util}%', zh: 'GPU 最高：{temp}°C · {watts} W · 使用率 {util}%', ja: 'GPU 最大：{temp}°C · {watts} W · 使用率 {util}%', ko: 'GPU 최대: {temp}°C · {watts} W · 사용률 {util}%' },
    'bench.summary_throttle': { es: 'Throttling: {events} eventos · {ms} ms', en: 'Throttling: {events} events · {ms} ms', fr: 'Throttling : {events} événements · {ms} ms', it: 'Throttling: {events} eventi · {ms} ms', pt: 'Throttling: {events} eventos · {ms} ms', zh: '降频：{events} 次事件 · {ms} ms', ja: 'スロットリング：{events} 回 · {ms} ms', ko: '스로틀링: {events}회 · {ms} ms' },
    'bench.summary_fans': { es: 'Ventiladores: {fans}', en: 'Fans: {fans}', fr: 'Ventilateurs : {fans}', it: 'Ventole: {fans}', pt: 'Ventoinhas: {fans}', zh: '风扇：{fans}', ja: 'ファン：{fans}', ko: '팬: {fans}' },
    'bench.summary_cap': { es: 'Tope RPM: {caps} → {result}', en: 'RPM cap: {caps} → {result}', fr: 'Limite RPM : {caps} → {result}', it: 'Limite RPM: {caps} → {result}', pt: 'Cap RPM: {caps} → {result}', zh: 'RPM 上限：{caps} → {result}', ja: 'RPM 上限：{caps} → {result}', ko: 'RPM 상한: {caps} → {result}' },
    'bench.cap_respected': { es: 'respetado ✓', en: 'respected ✓', fr: 'respecté ✓', it: 'rispettato ✓', pt: 'respeitado ✓', zh: '已遵守 ✓', ja: '遵守 ✓', ko: '준수됨 ✓' },
    'bench.cap_exceeded': { es: 'EXCEDIDO ✗', en: 'EXCEEDED ✗', fr: 'DÉPASSÉ ✗', it: 'SUPERATO ✗', pt: 'EXCEDIDO ✗', zh: '已超出 ✗', ja: '超過 ✗', ko: '초과됨 ✗' },
    'bench.inline_empty': { es: 'Sin benchmarks en esta sesión.', en: 'No benchmarks in this session.', fr: 'Aucun benchmark dans cette session.', it: 'Nessun benchmark in questa sessione.', pt: 'Sem benchmarks nesta sessão.', zh: '本次会话没有基准测试。', ja: 'このセッションにベンチマークはありません。', ko: '이 세션에 벤치마크가 없습니다.' },
    'bench.inline_cpu': { es: 'CPU {temp}°C · {watts} W · throttle {events} — {when}', en: 'CPU {temp}°C · {watts} W · throttle {events} — {when}', fr: 'CPU {temp}°C · {watts} W · throttle {events} — {when}', it: 'CPU {temp}°C · {watts} W · throttle {events} — {when}', pt: 'CPU {temp}°C · {watts} W · throttle {events} — {when}', zh: 'CPU {temp}°C · {watts} W · 降频 {events} — {when}', ja: 'CPU {temp}°C · {watts} W · スロットル {events} — {when}', ko: 'CPU {temp}°C · {watts} W · 스로틀 {events} — {when}' },
    'bench.inline_gpu': { es: 'GPU {temp}°C · {watts} W — {when}', en: 'GPU {temp}°C · {watts} W — {when}', fr: 'GPU {temp}°C · {watts} W — {when}', it: 'GPU {temp}°C · {watts} W — {when}', pt: 'GPU {temp}°C · {watts} W — {when}', zh: 'GPU {temp}°C · {watts} W — {when}', ja: 'GPU {temp}°C · {watts} W — {when}', ko: 'GPU {temp}°C · {watts} W — {when}' },
    'bench.running': { es: 'Corriendo benchmark {kind}…', en: 'Running {kind} benchmark…', fr: 'Benchmark {kind} en cours…', it: 'Benchmark {kind} in corso…', pt: 'A correr benchmark {kind}…', zh: '正在运行 {kind} 基准测试…', ja: '{kind} ベンチマークを実行中…', ko: '{kind} 벤치마크 실행 중…' },
    'bench.sampling': { es: 'Tomando muestras térmicas…', en: 'Taking thermal samples…', fr: 'Prise d\'échantillons thermiques…', it: 'Acquisizione campioni termici…', pt: 'A recolher amostras térmicas…', zh: '正在采集热样本…', ja: '熱サンプルを取得中…', ko: '열 샘플 수집 중…' },
    'bench.done_kind': { es: '{kind} terminado.', en: '{kind} finished.', fr: '{kind} terminé.', it: '{kind} terminato.', pt: '{kind} terminado.', zh: '{kind} 已完成。', ja: '{kind} が完了しました。', ko: '{kind} 완료.' },
    'bench.unavailable_kind': { es: 'Benchmark {kind} no disponible.', en: 'Benchmark {kind} not available.', fr: 'Benchmark {kind} non disponible.', it: 'Benchmark {kind} non disponibile.', pt: 'Benchmark {kind} não disponível.', zh: '{kind} 基准测试不可用。', ja: '{kind} ベンチマークは利用できません。', ko: '{kind} 벤치마크를 사용할 수 없습니다.' },
    'bench.done_toast': { es: 'Benchmark {kind} terminado ✓', en: 'Benchmark {kind} finished ✓', fr: 'Benchmark {kind} terminé ✓', it: 'Benchmark {kind} terminato ✓', pt: 'Benchmark {kind} terminado ✓', zh: '{kind} 基准测试已完成 ✓', ja: '{kind} ベンチマークが完了しました ✓', ko: '{kind} 벤치마크 완료 ✓' },
    'bench.failed_toast': { es: 'Benchmark {kind} falló', en: 'Benchmark {kind} failed', fr: 'Le benchmark {kind} a échoué', it: 'Benchmark {kind} fallito', pt: 'O benchmark {kind} falhou', zh: '{kind} 基准测试失败', ja: '{kind} ベンチマークに失敗しました', ko: '{kind} 벤치마크 실패' },
    'bench.exported': { es: 'Benchmark guardado en {path}', en: 'Benchmark saved to {path}', fr: 'Benchmark enregistré dans {path}', it: 'Benchmark salvato in {path}', pt: 'Benchmark guardado em {path}', zh: '基准测试已保存到 {path}', ja: 'ベンチマークを {path} に保存しました', ko: '벤치마크를 {path}에 저장했습니다' },
    'bench.export_failed': { es: 'No se exportó: {err}', en: 'Not exported: {err}', fr: 'Non exporté : {err}', it: 'Non esportato: {err}', pt: 'Não exportado: {err}', zh: '未导出：{err}', ja: 'エクスポートされませんでした：{err}', ko: '내보내지 않음: {err}' },

    /* ---- fan: calibración y guardado ---- */
    'fan.calib_done': { es: 'Calibración lista ✓ Máximos reales: {max} RPM', en: 'Calibration ready ✓ Real maxima: {max} RPM', fr: 'Calibration prête ✓ Maxima réels : {max} RPM', it: 'Calibrazione pronta ✓ Massimi reali: {max} RPM', pt: 'Calibração pronta ✓ Máximos reais: {max} RPM', zh: '校准完成 ✓ 真实最大值：{max} RPM', ja: 'キャリブレーション完了 ✓ 実測最大値：{max} RPM', ko: '캘리브레이션 완료 ✓ 실측 최대값: {max} RPM' },
    'fan.saved_ok': { es: 'Guardado ✓ {labels} — cada perfil con su propio tope (persiste al reiniciar).', en: 'Saved ✓ {labels} — each profile with its own cap (persists across reboots).', fr: 'Enregistré ✓ {labels} — chaque profil avec sa propre limite (persiste au redémarrage).', it: 'Salvato ✓ {labels} — ogni profilo con il proprio limite (persiste al riavvio).', pt: 'Guardado ✓ {labels} — cada perfil com o seu próprio cap (persiste ao reiniciar).', zh: '已保存 ✓ {labels} — 每个配置都有自己的上限（重启后保留）。', ja: '保存しました ✓ {labels} — 各プロファイルに独自の上限（再起動後も保持）。', ko: '저장됨 ✓ {labels} — 각 프로파일마다 고유한 상한 (재부팅 후에도 유지).' },

    /* ---- config export / import (toasts) ---- */
    'config.exported': { es: 'Configuración exportada a {path}\n({items})', en: 'Configuration exported to {path}\n({items})', fr: 'Configuration exportée vers {path}\n({items})', it: 'Configurazione esportata in {path}\n({items})', pt: 'Configuração exportada para {path}\n({items})', zh: '配置已导出到 {path}\n（{items}）', ja: '設定を {path} にエクスポートしました\n（{items}）', ko: '구성을 {path}에 내보냈습니다\n({items})' },
    'config.export_cancelled': { es: 'Exportación cancelada', en: 'Export cancelled', fr: 'Exportation annulée', it: 'Esportazione annullata', pt: 'Exportação cancelada', zh: '导出已取消', ja: 'エクスポートをキャンセルしました', ko: '내보내기 취소됨' },
    'config.export_failed': { es: 'No se exportó: {err}', en: 'Not exported: {err}', fr: 'Non exporté : {err}', it: 'Non esportato: {err}', pt: 'Não exportado: {err}', zh: '未导出：{err}', ja: 'エクスポートされませんでした：{err}', ko: '내보내지 않음: {err}' },
    'config.import_cancelled': { es: 'Importación cancelada', en: 'Import cancelled', fr: 'Importation annulée', it: 'Importazione annullata', pt: 'Importação cancelada', zh: '导入已取消', ja: 'インポートをキャンセルしました', ko: '가져오기 취소됨' },
    'config.import_failed': { es: 'No se importó: {err}', en: 'Not imported: {err}', fr: 'Non importé : {err}', it: 'Non importato: {err}', pt: 'Não importado: {err}', zh: '未导入：{err}', ja: 'インポートされませんでした：{err}', ko: '가져오지 않음: {err}' },
    'config.imported': { es: 'Importado: {items} ✓\nAbre VENTILADORES → GUARDAR Y APLICAR para mandar las curvas al sistema.', en: 'Imported: {items} ✓\nOpen FANS → SAVE & APPLY to push the curves to the system.', fr: 'Importé : {items} ✓\nOuvrez VENTILATEURS → ENREGISTRER & APPLIQUER pour envoyer les courbes au système.', it: 'Importato: {items} ✓\nApri VENTOLE → SALVA E APPLICA per inviare le curve al sistema.', pt: 'Importado: {items} ✓\nAbre VENTOINHAS → GUARDAR E APLICAR para enviar as curvas ao sistema.', zh: '已导入：{items} ✓\n打开“风扇”→“保存并应用”将曲线发送到系统。', ja: 'インポートしました：{items} ✓\n「ファン」→「保存して適用」を開いてカーブをシステムに送信してください。', ko: '가져옴: {items} ✓\n"팬" → "저장 및 적용"을 열어 커브를 시스템에 전송하세요.' },
    'config.current_lang': { es: 'Idioma: {lang}', en: 'Language: {lang}', fr: 'Langue : {lang}', it: 'Lingua: {lang}', pt: 'Idioma: {lang}', zh: '语言：{lang}', ja: '言語：{lang}', ko: '언어: {lang}' },

    /* ---- kill process (toasts) ---- */
    'proc.kill_sent': { es: 'Señal de cierre enviada a {name}', en: 'Close signal sent to {name}', fr: 'Signal de fermeture envoyé à {name}', it: 'Segnale di chiusura inviato a {name}', pt: 'Sinal de fecho enviado para {name}', zh: '已向 {name} 发送关闭信号', ja: '{name} に終了シグナルを送信しました', ko: '{name}에 종료 신호를 보냈습니다' },
    'proc.kill_failed': { es: 'No se pudo: {err}', en: 'Could not: {err}', fr: 'Impossible : {err}', it: 'Impossibile: {err}', pt: 'Não foi possível: {err}', zh: '无法执行：{err}', ja: '実行できませんでした：{err}', ko: '실행할 수 없습니다: {err}' },

    /* ---- export events (toasts) ---- */
    'events.exported': { es: 'Eventos guardados en {path}', en: 'Events saved to {path}', fr: 'Événements enregistrés dans {path}', it: 'Eventi salvati in {path}', pt: 'Eventos guardados em {path}', zh: '事件已保存到 {path}', ja: 'イベントを {path} に保存しました', ko: '이벤트를 {path}에 저장했습니다' },
    'events.export_failed': { es: 'No se exportó: {err}', en: 'Not exported: {err}', fr: 'Non exporté : {err}', it: 'Non esportato: {err}', pt: 'Não exportado: {err}', zh: '未导出：{err}', ja: 'エクスポートされませんでした：{err}', ko: '내보내지 않음: {err}' },
  });
}

let lastStats = null;
let gpuBusy = false;
// Perfil de energía "pendiente": al hacer clic mantenemos resaltado el perfil
// elegido hasta que el stream del sistema confirme el cambio (o expire). Sin
// esto, el refresco 1 Hz pisaba el resaltado con el perfil viejo mientras el
// daemon aplicaba el cambio → el botón "rebotaba" al anterior y luego saltaba.
let pendingProfile = null;
let pendingProfileTs = 0;
let pendingProfileConfirmed = false;  // true cuando el sistema confirmó (busctl read-back)
const PENDING_PROFILE_MS = 8000;
// PowerProfilesDaemon usa power-saver/balanced/performance; algunos equipos
// reportan el perfil ASUS "quiet". Normalizamos para comparar contra los botones.
function normalizeProfile(p) {
  return p === 'quiet' ? 'power-saver' : p;
}
let auraState = null;
let auraBootstrapped = false;
let auraProfileSelection = '';
// Efecto elegido: fuente de verdad en JS. Antes dependía del <select> oculto
// y si el valor no existía como <option> caía en silencio a 'static'.
let auraSelectedEffect = '';
// Firma del último render: el bloque Aura solo se reconstruye cuando cambia
// algo real. Reconstruirlo cada segundo destruía los chips entre el mousedown
// y el mouseup y se comía los clics.
let lastAuraSig = '';
let musicModeActive = false;
let auraDirty = false;
let auraFocused = false;
let benchmarkResult = null;
let benchBusy = false;

// v10: historial completo por corrida (V2). Migra el viejo formato simple.
function _loadBenchmarkHistory() {
  const v2 = localStorage.getItem('benchmarkHistoryV2');
  if (v2) { try { return JSON.parse(v2); } catch (e) { /* fallback */ } }
  // migrar el viejo texto plano → structs mínimos sin samples
  const old = localStorage.getItem('benchmarkHistory');
  if (old) {
    try {
      const arr = JSON.parse(old);
      return arr.map((item) => ({
        id: `legacy-${item.when || Date.now()}`,
        kind: item.kind || 'cpu',
        label: item.label || 'CPU',
        started_at: null,
        when: item.when || '',
        seconds: null,
        tool: null,
        summary: null,
        _legacyText: item.summary || '',
      }));
    } catch (e) { /* ignore */ }
  }
  return [];
}

let benchmarkHistory = _loadBenchmarkHistory();
const AURA_PRIMARY_EFFECTS = ['static', 'breathe', 'rainbow-cycle', 'rainbow-wave', 'stars'];

/* ---------- themes ---------- */

const THEMES = [
  // id, name, description, [dark bg, dark accent], [light bg, light accent]
  ['magma',      'Magma',       'Rojo volcánico — firma ROG',       ['#140d0b', '#f25c3d'], ['#f5e0d6', '#c2401f']],
  ['nebula',     'Nébula',      'Violeta espacial con magenta',     ['#120c1c', '#b07af5'], ['#e8ddf7', '#6f2fd0']],
  ['oceano',     'Océano',      'Teal profundo, calmado',           ['#0a1416', '#2fbfb0'], ['#cde8e4', '#0c7f72']],
  ['glaciar',    'Glaciar',     'Azul hielo sobre azul noche',      ['#0d1420', '#6fb7ff'], ['#d4e6f5', '#1f66b8']],
  ['reactor',    'Reactor',     'Verde fosforescente de máquina',   ['#070d07', '#46e873'], ['#d6edce', '#18843a']],
  ['grafito',    'Grafito',     'Escala de grises, sin ruido',      ['#101113', '#c8cdd4'], ['#e2e5e9', '#2f353b']],
  ['neon',       'Neón',        'Cian y magenta de arcade',         ['#0c0a18', '#2de2e6'], ['#d4edf0', '#067a8c']],
  ['atardecer',  'Atardecer',   'Oro y rosa sobre púrpura',         ['#160f1e', '#ff9d4d'], ['#f9e4cc', '#c45f10']],
  ['neon-nights','Neon Nights', 'Synthwave Miami: magenta y cian',  ['#0d0619', '#f72585'], ['#f0d6f5', '#9b1dbd']],
  ['cyberpunk',  'Cyberpunk',   'Night City: amarillo y cian',      ['#080808', '#f7e02b'], ['#e8e4c8', '#8a7200']],
  ['aurora',     'Aurora',      'Teal boreal virando a violeta',    ['#060d10', '#00d4aa'], ['#cce8e4', '#077a6b']],
  ['alba',       'Alba',        'Marfil cálido con oro y rosa',     ['#13100d', '#d4a017'], ['#f8f2e6', '#9e6a00']],
];

const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

function appearance() {
  return {
    theme: localStorage.getItem('theme') || 'magma',
    mode: localStorage.getItem('mode') || 'dark',
  };
}

function applyAppearance() {
  const { theme, mode } = appearance();
  const real = mode === 'system' ? (prefersDark.matches ? 'dark' : 'light') : mode;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.mode = real;
  document.querySelectorAll('#mode-seg button').forEach((b) =>
    b.classList.toggle('active', b.dataset.mode === mode));
  document.querySelectorAll('.theme-card').forEach((c) => {
    c.classList.toggle('active', c.dataset.theme === theme);
    const def = THEMES.find(([id]) => id === c.dataset.theme);
    if (def) {
      const [bg, accent] = def[real === 'dark' ? 3 : 4];
      const swatch = c.querySelector('.swatch');
      swatch.style.background = bg;
      swatch.querySelectorAll('i').forEach((i, idx) => {
        i.style.background = idx === 0 ? accent : accent + '55';
      });
    }
  });
  if (lastStats) update(lastStats);
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* ---------- helpers ---------- */

function fmt(value, digits = 0, fallback = '--') {
  return (value === null || value === undefined || Number.isNaN(value))
    ? fallback
    : Number(value).toFixed(digits);
}

function fmtGbFromMb(value, digits = 1) {
  return value === null || value === undefined || Number.isNaN(value)
    ? '--'
    : `${fmt(Number(value) / 1024, digits)} G`;
}

function fmtGbPairFromMb(used, total, digits = 1) {
  return total === null || total === undefined || Number.isNaN(total)
    ? '--'
    : `${fmt(Number(used || 0) / 1024, digits)}/${fmt(Number(total) / 1024, digits)} G`;
}

function fmtMb(value) {
  return value === null || value === undefined || Number.isNaN(value)
    ? '--'
    : `${Math.round(Number(value))} MB`;
}

// Contrato con CSS (Agente A2): #cpu-temp/#gpu-temp SIEMPRE deben llevar
// exactamente una de estas 4 clases — el color lo decide el CSS por nivel,
// nunca lo forzamos por JS (ver update()).
//   t-cold      temp < lo
//   t-normal    lo <= temp < mid
//   t-hot       mid <= temp < hi
//   t-critical  temp >= hi
function tempClass(temp, limits) {
  if (temp == null) return '';
  const [lo, mid, hi] = limits || [70, 85, 92];
  if (temp < lo) return 't-cold';
  if (temp < mid) return 't-normal';
  if (temp < hi) return 't-hot';
  return 't-critical';
}

let toastTimer = null;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 5000);
}

/* ---------- charts ---------- */

// Estado por canvas para el hover: la serie dibujada y su mapeo x/y, para
// poder redibujar con crosshair y saber qué valor hay bajo el cursor.
const chartState = new Map();

function drawChart(canvas, values, color, opts = {}) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  // Contrato C2: usa --chart-grid si A-VISUAL lo define; cae a --hair como fallback.
  ctx.strokeStyle = cssVar('--chart-grid') || cssVar('--hair');
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (h / 4) * i);
    ctx.lineTo(w, (h / 4) * i);
    ctx.stroke();
  }

  if (!values || values.length < 2) { chartState.delete(canvas.id); return; }
  const data = values.slice(-Math.max(60, Math.floor(w / 4)));
  // snap the axis to steps of 5 so min/max don't jitter every second
  // fromZero: los watts arrancan en 0 — si no, una bajada de 10→3 W llena
  // toda la altura de la gráfica y parece un desplome dramático
  let lo = opts.fromZero ? 0 : Math.floor(Math.min(...data) / 5) * 5;
  let hi = Math.ceil(Math.max(...data) / 5) * 5;
  if (hi - lo < 10) { hi = lo + 10; }
  const pad = 8;
  const x = (i) => (i / (data.length - 1)) * w;
  const y = (v) => (h - 12) - pad - ((v - lo) / (hi - lo)) * ((h - 12) - pad * 2);
  chartState.set(canvas.id, { data, color, opts, w, h, lo, hi });

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, color + '55');
  grad.addColorStop(1, color + '00');
  ctx.beginPath();
  ctx.moveTo(0, h - 12);
  data.forEach((v, i) => ctx.lineTo(x(i), y(v)));
  ctx.lineTo(w, h - 12);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  data.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  ctx.fillStyle = cssVar('--dim');
  ctx.font = '11px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(hi.toFixed(0), 22, 11);
  ctx.fillText(lo.toFixed(0), 22, h - 14);
  // time axis: one sample per second
  const mins = Math.round(data.length / 60);
  ctx.textAlign = 'left';
  ctx.fillText(mins >= 1 ? `hace ${mins} min` : 'hace <1 min', 2, h - 2);
  ctx.textAlign = 'right';
  ctx.fillText('ahora', w - 2, h - 2);
  const last = data[data.length - 1];
  ctx.fillStyle = color;
  ctx.font = 'bold 13px monospace';
  ctx.fillText(last.toFixed(1), w - 6, 14);
  ctx.textAlign = 'left';

  if (chartHover.canvasId === canvas.id) drawChartCrosshair(canvas);
}

/* hover sobre las gráficas: crosshair + valor y hace cuántos segundos */

const chartHover = { canvasId: null, px: 0 };

function chartIndexAt(state, px) {
  return Math.max(0, Math.min(state.data.length - 1,
    Math.round((px / state.w) * (state.data.length - 1))));
}

function drawChartCrosshair(canvas) {
  const state = chartState.get(canvas.id);
  if (!state) return;
  const { data, color, w, h, lo, hi } = state;
  const i = chartIndexAt(state, chartHover.px);
  const pad = 8;
  const cx = (i / (data.length - 1)) * w;
  const cy = (h - 12) - pad - ((data[i] - lo) / (hi - lo)) * ((h - 12) - pad * 2);
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.strokeStyle = cssVar('--dim');
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, 2);
  ctx.lineTo(cx, h - 12);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = cssVar('--bg');
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function agoText(secondsAgo) {
  if (secondsAgo < 1) return 'ahora';
  if (secondsAgo < 60) return `hace ${secondsAgo} s`;
  return `hace ${Math.floor(secondsAgo / 60)} min ${secondsAgo % 60} s`;
}

function wireChartHover(canvasId, unit) {
  const canvas = $(canvasId);
  const tip = $('chart-tip');
  canvas.addEventListener('mousemove', (e) => {
    const state = chartState.get(canvasId);
    if (!state) return;
    const rect = canvas.getBoundingClientRect();
    chartHover.canvasId = canvasId;
    chartHover.px = e.clientX - rect.left;
    const i = chartIndexAt(state, chartHover.px);
    // una muestra por segundo: la distancia al final ES la antigüedad
    tip.textContent = `${state.data[i].toFixed(1)} ${unit} · ${agoText(state.data.length - 1 - i)}`;
    tip.classList.remove('hidden');
    const tw = tip.offsetWidth;
    const left = Math.min(Math.max(e.clientX - tw / 2, 6), window.innerWidth - tw - 6);
    tip.style.left = `${left}px`;
    tip.style.top = `${rect.top - 30}px`;
    drawChart(canvas, state.data, state.color, state.opts);
  });
  canvas.addEventListener('mouseleave', () => {
    chartHover.canvasId = null;
    tip.classList.add('hidden');
    const state = chartState.get(canvasId);
    if (state) drawChart(canvas, state.data, state.color, state.opts);
  });
}

/* ---------- fans ---------- */

const FAN_SVG = `
<svg viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="29" fill="none" stroke="var(--hair)" stroke-width="2"/>
  <g>
    <path d="M32 32 L32 7 A25 25 0 0 1 49 16 Z" fill="var(--dim)"/>
    <path d="M32 32 L53 22 A25 25 0 0 1 51 46 Z" fill="var(--dim)"/>
    <path d="M32 32 L44 53 A25 25 0 0 1 20 53 Z" fill="var(--dim)"/>
    <path d="M32 32 L13 47 A25 25 0 0 1 11 23 Z" fill="var(--dim)"/>
    <path d="M32 32 L15 13 A25 25 0 0 1 32 7 Z" fill="var(--hair)"/>
  </g>
  <circle cx="32" cy="32" r="6" fill="var(--accent)"/>
</svg>`;

function renderFans(fans) {
  const host = $('fans');
  if (host.childElementCount !== fans.length) {
    host.innerHTML = fans.map((f, i) => `
      <div class="fan" id="fan-${i}">
        ${FAN_SVG}
        <div class="rpm">--</div>
        <label></label>
        <div class="pct"></div>
      </div>`).join('');
  }
  fans.forEach((fan, i) => {
    const el = $(`fan-${i}`);
    el.querySelector('.rpm').textContent = fan.rpm;
    el.querySelector('label').textContent = fan.label.replace('_fan', '').toUpperCase();
    el.querySelector('.pct').textContent = fan.percent + '%';
    const g = el.querySelector('svg g');
    if (fan.rpm > 0) {
      g.style.animationDuration = Math.max(0.15, 60 / (fan.rpm / 25)).toFixed(2) + 's';
      g.style.animationPlayState = 'running';
    } else {
      g.style.animationPlayState = 'paused';
    }
  });
}

/* ---------- aura / rgb ---------- */

function normalizeHex(value, fallback = 'ff5500') {
  const clean = String(value || fallback).replace('#', '').trim().toLowerCase();
  return /^[0-9a-f]{6}$/.test(clean) ? clean : fallback;
}

function auraDraftStorageKey() {
  return 'auraDraft';
}

function saveAuraDraft(state) {
  try { localStorage.setItem(auraDraftStorageKey(), JSON.stringify(state)); } catch (_) {}
}

function loadAuraDraft() {
  try { return JSON.parse(localStorage.getItem(auraDraftStorageKey()) || 'null'); } catch (_) { return null; }
}

function fillSelect(el, items, selectedValue, placeholder = '') {
  const current = items.some((item) => item.value === selectedValue) ? selectedValue : (items[0]?.value || '');
  el.innerHTML = '';
  if (!items.length && placeholder) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = placeholder;
    el.appendChild(option);
    el.disabled = true;
    return;
  }
  el.disabled = false;
  items.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label;
    el.appendChild(option);
  });
  el.value = current;
}

function auraEffects() {
  return auraState?.asus?.effects || [];
}


// Cuadrícula de 9 tiles estilo Armoury Crate.
// Estados de un tile:
//   active    — seleccionado actualmente
//   supported — disponible, no seleccionado
//   disabled  — modo no soportado por este hardware (con tooltip de razón)
//   future    — próximamente (gris claro, sin interacción)
function renderModeGrid(selectedValue) {
  const host = $('aura-mode-grid');
  const tiles = auraState?.mode_grid;
  if (!tiles || !tiles.length) {
    host.innerHTML = '<span class="dim">sin modos detectados</span>';
    return;
  }
  host.innerHTML = tiles.map((tile) => {
    const isActive = tile.id === selectedValue && tile.supported;
    let stateClass;
    if (tile.kind === 'future') {
      stateClass = 'mode-future';
    } else if (!tile.supported) {
      stateClass = 'mode-disabled';
    } else if (isActive) {
      stateClass = 'mode-active';
    } else {
      stateClass = 'mode-idle';
    }
    const title = tile.reason ? escapeHtml(tile.reason) : escapeHtml(tile.label);
    const ariaDisabled = (!tile.supported) ? ' aria-disabled="true"' : '';
    return `<button class="mode-tile ${stateClass}" data-mode="${escapeHtml(tile.id)}" data-kind="${escapeHtml(tile.kind)}" title="${title}"${ariaDisabled}>
      <span class="mode-icon">${escapeHtml(tile.icon)}</span>
      <span class="mode-label">${escapeHtml(tile.label)}</span>
      ${tile.reason && !tile.supported ? `<span class="mode-reason">${escapeHtml(tile.reason)}</span>` : ''}
    </button>`;
  }).join('');
}

function renderAuraEffectControls(selectedValue) {
  const selected = selectedValue || auraSelectedEffect || $('aura-effect').value || 'static';
  renderModeGrid(selected);
  // La cuadrícula de 9 modos (#aura-mode-grid) es el ÚNICO selector de efectos.
  // La sección "Mas efectos ASUS" (#aura-extra-wrap) fue eliminada en v10 (A2).
}

function currentAuraFormState() {
  return {
    driver: 'asus',
    effect: auraSelectedEffect || $('aura-effect').value || 'static',
    colour: normalizeHex($('aura-colour').value),
    colour2: normalizeHex($('aura-colour2').value, '000000'),
    speed: $('aura-speed').value || 'med',
    direction: $('aura-direction').value || 'right',
    brightness: $('aura-brightness').value || 'high',
  };
}

function setAuraStatus(message, kind = '') {
  const el = $('aura-status');
  if (!message) {
    el.textContent = '';
    el.className = 'note hidden';
    return;
  }
  el.textContent = message;
  el.className = `note ${kind}`.trim();
}

function markAuraDirty(dirty, reason = '') {
  auraDirty = dirty;
  if (musicModeActive) {
    setAuraStatus(t('aura.status_music'), 'status-live');
    return;
  }
  if (dirty) setAuraStatus(reason || t('aura.status_dirty'), 'status-dirty');
  else if (auraState?.current) setAuraStatus(t('aura.status_ready'), 'status-ok');
  else setAuraStatus('');
}

function setAuraForm(state) {
  if (!state) return;
  if (state.effect) {
    auraSelectedEffect = state.effect;
    $('aura-effect').value = state.effect;
  }
  $('aura-colour').value = '#' + normalizeHex(state.colour);
  $('aura-colour2').value = '#' + normalizeHex(state.colour2, '000000');
  if (state.speed) $('aura-speed').value = state.speed;
  if (state.direction) $('aura-direction').value = state.direction;
  if (state.brightness) $('aura-brightness').value = state.brightness;
  renderAuraEffectControls($('aura-effect').value);
  saveAuraDraft(currentAuraFormState());
  syncAuraFields();
}

function selectedAuraMeta() {
  const id = auraSelectedEffect || $('aura-effect').value;
  return auraState?.asus?.effects?.find((fx) => fx.id === id) || null;
}

function syncAuraFields() {
  const meta = selectedAuraMeta();
  $('aura-colour2-wrap').classList.toggle('hidden', !(meta?.colours >= 2));
  $('aura-speed-wrap').classList.toggle('hidden', !meta?.speed);
  $('aura-direction-wrap').classList.toggle('hidden', !meta?.direction);
}

function auraSignature(aura) {
  return JSON.stringify({
    available: aura?.available,
    asus: aura?.asus?.available,
    fx: (aura?.asus?.effects || []).map((f) => f.id),
    basic: (aura?.asus?.basic_effects || []).map((f) => f.id),
    extra: (aura?.asus?.extra_effects || []).map((f) => f.id),
    levels: aura?.asus?.brightness_levels,
    brightness: aura?.asus?.current_brightness,
    profiles: (aura?.profiles || []).map((p) => [p.name, p.state?.effect, p.state?.colour]),
    startup: [aura?.apply_on_startup, aura?.startup_profile],
    setup: aura?.setup?.needsSetup,
    openrgb: [aura?.openrgb?.available, aura?.openrgb?.sdk_reachable],
    music: aura?.music?.available,
    periph: (aura?.peripherals || []).map((p) => [p.name, p.link, p.supported]),
    grid: (aura?.mode_grid || []).map((t) => [t.id, t.supported]),
  });
}

function renderPeripherals(peripherals) {
  const host = $('peripherals');
  if (!peripherals?.length) { host.classList.add('hidden'); host.innerHTML = ''; return; }
  host.classList.remove('hidden');
  host.innerHTML = peripherals.map((p) => `
    <div class="periph${p.supported ? '' : ' pending'}">
      <span class="periph-dot"></span>
      <span class="periph-name">${escapeHtml(p.name)}</span>
      <span class="periph-link">${escapeHtml(p.link)} · ${escapeHtml(p.vid_pid)}</span>
      <span class="periph-note">${p.supported ? 'listo' : escapeHtml(p.note || '')}</span>
    </div>`).join('');
}

function renderAura(aura, resetForm = false) {
  // Solo reconstruir el DOM cuando cambió algo real: el stream manda un
  // snapshot por segundo y rehacer los chips destruía el botón a mitad de
  // clic (por eso "elegía Rainbow y quedaba Static").
  const sig = auraSignature(aura);
  auraState = aura;
  if (!resetForm && sig === lastAuraSig) return;
  lastAuraSig = sig;
  const effectSel = $('aura-effect');
  const profileSel = $('aura-profile-select');
  const note = $('aura-note');
  const openrgb = $('openrgb-note');

  if (!aura?.available) {
    note.textContent = 'No encontré controladores RGB disponibles. Instala asusctl/asusd para Aura.';
    $('aura-apply').disabled = true;
    $('aura-music').disabled = true;
    fillSelect(effectSel, [], '', 'Sin efectos detectados');
    return;
  }

  fillSelect(
    effectSel,
    auraEffects().map((fx) => ({ value: fx.id, label: fx.label })),
    auraSelectedEffect || effectSel.value || aura.current?.effect || 'static',
    'Sin efectos detectados',
  );
  auraSelectedEffect = effectSel.value || auraSelectedEffect;
  renderAuraEffectControls(auraSelectedEffect);
  fillSelect(
    $('aura-brightness'),
    (aura.asus?.brightness_levels || ['off', 'low', 'med', 'high']).map((level) => ({ value: level, label: level })),
    $('aura-brightness').value || aura.current?.brightness || 'high',
  );

  const profiles = aura.profiles || [];
  const selected = profiles.some((p) => p.name === auraProfileSelection)
    ? auraProfileSelection
    : (aura.startup_profile || profiles[0]?.name || '');
  auraProfileSelection = selected;
  profileSel.innerHTML = ['<option value="">perfiles guardados…</option>']
    .concat(profiles.map((p) => `<option value="${p.name}">${p.name}</option>`))
    .join('');
  profileSel.value = selected;
  if (document.activeElement !== $('aura-profile-name')) {
    $('aura-profile-name').value = selected || '';
  }
  renderAuraProfileList(profiles, selected, aura.startup_profile);
  $('aura-startup').checked = !!(aura.apply_on_startup && selected && selected === aura.startup_profile);

  if ((!auraBootstrapped || resetForm) && !auraFocused && !auraDirty) {
    const draft = loadAuraDraft();
    setAuraForm(draft || aura.current || profiles.find((p) => p.name === selected)?.state || {
      effect: 'static', colour: 'ff5500', colour2: '000000', brightness: 'high', speed: 'med', direction: 'right',
    });
    auraBootstrapped = true;
  }

  note.textContent = aura.asus?.available
    ? t('aura.note_ready', { path: aura.config_path, b: aura.asus.current_brightness || t('aura.brightness_unknown') })
    : (aura.asus?.hint || t('aura.asusctl_unavailable'));
  const setupBtn = $('aura-setup');
  if (aura.setup?.needsSetup) {
    setupBtn.classList.remove('hidden');
    note.textContent = `${note.textContent} ${aura.setup.statusHint}`;
  } else {
    setupBtn.classList.add('hidden');
  }
  openrgb.textContent = aura.openrgb?.available
    ? `OpenRGB detectado${aura.openrgb.sdk_reachable ? ' con SDK local activo' : ', pero su SDK local no responde aún'}.`
    : aura.openrgb?.hint || '';
  openrgb.classList.toggle('hidden', !openrgb.textContent);
  renderPeripherals(aura.peripherals);

  $('aura-apply').disabled = !aura.asus?.available;
  $('aura-music').disabled = !(aura.music?.available && aura.asus?.available);
  syncAuraFields();
  if (!musicModeActive && !auraDirty) {
    setAuraStatus(aura.current ? t('aura.status_ready') : '', aura.current ? 'status-ok' : '');
  }
}

async function refreshAuraState(resetForm = false) {
  const res = await window.rog.getAuraState();
  if (!res.ok) { toast(`Aura: ${res.err}`); return; }
  renderAura(res.aura, resetForm);
}

function selectedAuraProfile() {
  const name = $('aura-profile-select').value;
  return auraState?.profiles?.find((p) => p.name === name) || null;
}

function effectLabel(id) {
  return auraState?.asus?.effects?.find((fx) => fx.id === id)?.label || id || t('aura.effect_fallback');
}

function renderAuraProfileList(profiles, selected, startupProfile) {
  const list = $('aura-profile-list');
  const empty = $('aura-profile-empty');
  empty.classList.toggle('hidden', profiles.length > 0);
  list.innerHTML = profiles.map((p) => {
    const colour = '#' + normalizeHex(p.state?.colour);
    const isStartup = p.name === startupProfile;
    const active = p.name === selected;
    return `
      <li class="profile-item${active ? ' active' : ''}" data-name="${escapeHtml(p.name)}">
        <span class="pswatch" style="background:${colour}"></span>
        <span class="pname" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span>
        ${isStartup ? '<span class="pstar" title="Se aplica al abrir la app">★</span>' : ''}
        <span class="ptag">${escapeHtml(effectLabel(p.state?.effect))}</span>
        <button class="pbtn papply" data-act="apply" title="Cargar y aplicar ya">APLICAR</button>
        <button class="pbtn pdelete" data-act="delete" title="Borrar este perfil">🗑</button>
      </li>`;
  }).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function applyAuraState(state, successMessage) {
  if (successMessage === undefined) successMessage = t('aura.applied_ok');
  if (auraState?.setup?.needsSetup) {
    setAuraStatus(t('aura.status_need_setup'), 'status-dirty');
    toast(t('toast.aura_not_ready'));
    return null;
  }
  if (musicModeActive) {
    const off = await window.rog.setMusicMode({ enabled: false, state });
    if (!off.ok) {
      toast(`No se pudo apagar música: ${off.err}`);
      return null;
    }
    musicModeActive = false;
    $('aura-music').textContent = 'MODO MÚSICA';
  }
  const res = await window.rog.applyAura(state);
  if (!res.ok) {
    setAuraStatus(res.err || t('aura.status_apply_failed'), 'status-dirty');
    toast(`Aura: ${res.err}`);
    return null;
  }
  // reflect EXACTLY what was applied; never let a stale snapshot undo it
  setAuraForm(res.state || state);
  saveAuraDraft(res.state || state);
  markAuraDirty(false);
  toast(successMessage);
  await refreshAuraState(true);
  return res;
}

function benchmarkSummaryText(result) {
  if (!result) return t('bench.summary_none');
  if (!result.ok) return result.err || t('bench.failed');
  const s = result.summary || {};
  const fanText = Object.entries(s.fan_rpm_max || {})
    .map(([k, v]) => `${k}: ${v} RPM`).join(' · ') || t('bench.no_fan_data');
  const lines = [
    `${result.kind.toUpperCase()} · ${result.tool} · ${result.seconds}s`,
    t('bench.summary_cpu_max', { temp: fmt(s.cpu_temp_max, 1), pkg: fmt(s.cpu_package_max, 1), watts: fmt(s.cpu_watts_max, 1) }),
    t('bench.summary_gpu_max', { temp: fmt(s.gpu_temp_max, 1), watts: fmt(s.gpu_watts_max, 1), util: fmt(s.gpu_util_max, 0) }),
    t('bench.summary_throttle', { events: s.throttle_events ?? 0, ms: s.throttle_ms ?? 0 }),
    t('bench.summary_fans', { fans: fanText }),
  ];
  if (s.fan_cap) {
    const capText = Object.entries(s.fan_cap).map(([k, c]) =>
      `${k.replace('_fan', '').toUpperCase()} ${c.max ?? '--'}/${c.cap}`).join(' · ');
    lines.push(t('bench.summary_cap', { caps: capText, result: s.cap_respected ? t('bench.cap_respected') : t('bench.cap_exceeded') }));
  }
  return lines.join('\n');
}


/* Dibuja una mini-gráfica de sparkline de temperatures en un canvas */
function _unitForKey(key) {
  const k = (key || '').toLowerCase();
  if (k.includes('temp')) return '°C';
  if (k.includes('watt') || k.includes('power')) return ' W';
  if (k.includes('util') || k.includes('usage') || k.includes('percent')) return '%';
  if (k.includes('rpm') || k.includes('fan')) return '';
  return '';
}

function _drawSparkline(canvas, samples, key, color) {
  if (!samples || !samples.length) return;
  const vals = samples.map((s) => s[key]).filter((v) => v != null);
  if (!vals.length) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.offsetWidth || canvas.width;
  const h = canvas.offsetHeight || canvas.height;
  canvas.width = w;
  canvas.height = h;
  // Márgenes para ejes: izquierda (valores), abajo (segundos)
  const padL = 34, padB = 14, padT = 6, padR = 4;
  const gw = w - padL - padR;
  const gh = h - padT - padB;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const xStep = gw / Math.max(vals.length - 1, 1);
  const col = color || '#f25c3d';
  const ink = cssVar('--dim') || '#888';
  ctx.clearRect(0, 0, w, h);

  // rejilla + etiquetas Y (máx arriba, mín abajo) y X (0s … Ns)
  const unit = _unitForKey(key);
  ctx.font = '9px system-ui, sans-serif';
  ctx.fillStyle = ink;
  ctx.strokeStyle = (cssVar('--hair') || '#333');
  ctx.lineWidth = 1;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  [max, (max + min) / 2, min].forEach((val, i) => {
    const y = padT + (gh * i) / 2;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.globalAlpha = 0.25; ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillText(Math.round(val) + unit, padL - 4, y);
  });
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('0s', padL, h - padB + 3);
  ctx.textAlign = 'right';
  ctx.fillText(Math.max(vals.length - 1, 0) + 's', w - padR, h - padB + 3);

  // línea de datos
  ctx.beginPath();
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  vals.forEach((v, i) => {
    const x = padL + i * xStep;
    const y = padT + gh - ((v - min) / range) * gh;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
  // área bajo la curva
  ctx.lineTo(padL + (vals.length - 1) * xStep, padT + gh);
  ctx.lineTo(padL, padT + gh);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, padT, 0, padT + gh);
  grad.addColorStop(0, col + '44');
  grad.addColorStop(1, col + '00');
  ctx.fillStyle = grad;
  ctx.fill();
}

/* Clase de color por severidad de temperatura (reusa los umbrales de los badges) */
function _tempLvl(v) {
  if (v == null) return '';
  return v >= 95 ? 'lvl-crit' : v >= 85 ? 'lvl-hot' : v >= 70 ? 'lvl-warn' : 'lvl-ok';
}

/* Construye la línea de resumen legible de una bench-card.
 * GPU:  71.0°C máx · 33.8 W · uso 99% · 0 throttle · 45 s
 * CPU:  89.0°C máx · pkg 82°C · 65 W · 12 throttle · 45 s */
function _benchStatLine(item, s, isCpu, label) {
  // Todos los valores comparten el mismo tratamiento neón (.bench-stat-val);
  // la temperatura máx es la principal (más grande + color por severidad).
  const val = (v, unit, cls) =>
    `<b class="bench-stat-val${cls ? ' ' + cls : ''}">${v}</b><span class="bench-stat-unit">${unit}</span>`;
  const parts = [];
  const tMax = isCpu ? s.cpu_temp_max : s.gpu_temp_max;
  if (tMax != null) {
    parts.push(`<b class="bench-stat-main ${_tempLvl(tMax)}">${fmt(tMax, 1)}°C</b><span class="bench-stat-unit">máx</span>`);
  }
  if (isCpu && s.cpu_package_max != null) parts.push(val(fmt(s.cpu_package_max, 1), '°C pkg'));
  if (!isCpu && s.gpu_util_max != null) parts.push(val(fmt(s.gpu_util_max, 0), '% uso'));
  const w = isCpu ? s.cpu_watts_max : s.gpu_watts_max;
  if (w != null) parts.push(val(fmt(w, 1), 'W'));
  const thr = s.throttle_events;
  if (thr != null) {
    const cls = thr > 10 ? 'lvl-hot' : thr > 0 ? 'lvl-warn' : 'lvl-ok';
    parts.push(val(thr, 'throttle', cls));
  }
  if (item.seconds != null) parts.push(val(item.seconds, 's'));
  if (!parts.length) parts.push(`<span>${escapeHtml(item._legacyText || label)}</span>`);
  return parts.join('<i class="bench-stat-dot">·</i>');
}

/* Genera el HTML interior de una bench-card */
function _benchCardHtml(item) {
  const s = item.summary || {};
  const kind = (item.kind || 'cpu').toUpperCase();
  const label = item.label || kind;
  const isCpu = item.kind === 'cpu';

  // Línea de resumen LEGIBLE y SIEMPRE visible (sin clic): la métrica principal
  // grande y con color por severidad, las secundarias en gris. Reemplaza los
  // chips diminutos que no se leían.
  const statLine = _benchStatLine(item, s, isCpu, label);

  // detalle de texto: grid de valores
  let detailGrid = '';
  if (item.summary) {
    const cells = [
      { l: 'CPU máx', v: s.cpu_temp_max != null ? `${fmt(s.cpu_temp_max, 1)} °C` : '--', accent: s.cpu_temp_max >= 90 },
      { l: 'CPU pkg', v: s.cpu_package_max != null ? `${fmt(s.cpu_package_max, 1)} °C` : '--' },
      { l: 'CPU W máx', v: s.cpu_watts_max != null ? `${fmt(s.cpu_watts_max, 1)} W` : '--' },
      { l: 'GPU máx', v: s.gpu_temp_max != null ? `${fmt(s.gpu_temp_max, 1)} °C` : '--', accent: s.gpu_temp_max >= 85 },
      { l: 'GPU W máx', v: s.gpu_watts_max != null ? `${fmt(s.gpu_watts_max, 1)} W` : '--' },
      { l: 'GPU uso', v: s.gpu_util_max != null ? `${fmt(s.gpu_util_max, 0)} %` : '--' },
      { l: 'Throttle', v: `${s.throttle_events ?? 0} ev · ${s.throttle_ms ?? 0} ms`, accent: (s.throttle_events ?? 0) > 10 },
      { l: 'Duración', v: item.seconds != null ? `${item.seconds} s` : '--' },
    ];
    detailGrid = `<div class="bench-detail-grid">${cells.map((c) =>
      `<div class="bench-detail-cell">
         <label>${escapeHtml(c.l)}</label>
         <b${c.accent ? ' class="accent"' : ''}>${escapeHtml(c.v)}</b>
       </div>`).join('')}</div>`;

    // fan rpms
    const fanEntries = Object.entries(s.fan_rpm_max || {});
    if (fanEntries.length) {
      detailGrid += `<div class="bench-detail-fans">Ventiladores: ${
        fanEntries.map(([k, v]) => `<b>${escapeHtml(k)}: ${v} RPM</b>`).join(' · ')
      }</div>`;
    }
    // cap verdict
    if (s.fan_cap) {
      const capText = Object.entries(s.fan_cap).map(([k, c]) =>
        `${k.replace('_fan', '').toUpperCase()} ${c.max ?? '--'}/${c.cap}`).join(' · ');
      detailGrid += `<div class="bench-detail-fans">Tope: ${escapeHtml(capText)}</div>`;
    }
  } else if (item._legacyText) {
    detailGrid = `<div class="bench-detail-fans">${escapeHtml(item._legacyText)}</div>`;
  }

  // sparkline placeholder (se rellena en JS después de insertar al DOM)
  const hasSparkline = Array.isArray(item.samples) && item.samples.length > 1;
  const sparklineId = `spark-${item.id}`;
  const sparkHtml = hasSparkline
    ? `<canvas class="bench-sparkline" id="${sparklineId}" width="280" height="96"></canvas>`
    : '';

  // mini-sparkline SIEMPRE visible en el cuerpo de la tarjeta: la curva térmica
  // de un vistazo, sin tener que abrir el detalle. Si no hay samples, se muestra
  // una franja informativa para que la tarjeta nunca quede vacía.
  const miniSparkId = `mspark-${item.id}`;
  const miniBody = hasSparkline
    ? `<canvas class="bench-mini-spark" id="${miniSparkId}" height="56"></canvas>`
    : `<div class="bench-mini-empty">${escapeHtml(item._legacyText || 'sin curva registrada')}</div>`;

  // tool info
  const toolHtml = item.tool
    ? `<div class="bench-detail-tool">Herramienta: ${escapeHtml(item.tool)}</div>`
    : '';

  return `
    <div class="bench-card-header">
      <span class="bench-card-kind kind-${escapeHtml((item.kind || 'cpu'))}">${escapeHtml(kind)}</span>
      <span class="bench-card-when">${escapeHtml(item.when || '')}</span>
      <span class="bench-card-expand">ampliar ▸</span>
      <button type="button" class="bench-card-delete" data-bid-del="${escapeHtml(item.id || '')}" title="Borrar este benchmark">&#10005;</button>
    </div>
    <div class="bench-card-statline">${statLine}</div>
    <div class="bench-card-body">
      ${miniBody}
    </div>
    <div class="bench-card-detail">
      ${sparkHtml}
      ${detailGrid}
      ${toolHtml}
    </div>`;
}

/* Mini-sparkline limpia (sin ejes) para el cuerpo siempre-visible de la tarjeta.
 * Línea neón + relleno degradado + punto final marcado. */
function _drawMiniSparkline(canvas, samples, key, color) {
  if (!samples || !samples.length) return;
  const vals = samples.map((s) => s[key]).filter((v) => v != null);
  if (!vals.length) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.offsetWidth || canvas.parentElement?.offsetWidth || 240;
  const h = canvas.offsetHeight || 56;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.scale(dpr, dpr);
  const padT = 5, padB = 5, padX = 2;
  const gh = h - padT - padB;
  const gw = w - padX * 2;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const xStep = gw / Math.max(vals.length - 1, 1);
  const col = color || '#f25c3d';
  ctx.clearRect(0, 0, w, h);
  const pt = (i, v) => [padX + i * xStep, padT + gh - ((v - min) / range) * gh];
  // relleno degradado
  ctx.beginPath();
  vals.forEach((v, i) => { const [x, y] = pt(i, v); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
  ctx.lineTo(padX + (vals.length - 1) * xStep, padT + gh);
  ctx.lineTo(padX, padT + gh);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, padT, 0, padT + gh);
  grad.addColorStop(0, col + '55');
  grad.addColorStop(1, col + '00');
  ctx.fillStyle = grad;
  ctx.fill();
  // línea neón con glow
  ctx.beginPath();
  vals.forEach((v, i) => { const [x, y] = pt(i, v); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.8;
  ctx.lineJoin = 'round';
  ctx.shadowColor = col;
  ctx.shadowBlur = 6;
  ctx.stroke();
  ctx.shadowBlur = 0;
  // punto final
  const [ex, ey] = pt(vals.length - 1, vals[vals.length - 1]);
  ctx.beginPath();
  ctx.arc(ex, ey, 2.6, 0, Math.PI * 2);
  ctx.fillStyle = col;
  ctx.fill();
}

function renderBenchmarkHistory() {
  const host = $('bench-history');
  if (!benchmarkHistory.length) {
    host.innerHTML = '<li class="bench-empty">sin historial</li>';
    $('bench-inline-status').textContent = t('bench.inline_empty');
    updateBenchClearAllVisibility();
    return;
  }

  const items = benchmarkHistory.slice(0, 8);
  host.innerHTML = items.map((item) =>
    `<li class="bench-card" data-bid="${escapeHtml(item.id || '')}">${_benchCardHtml(item)}</li>`
  ).join('');

  // dibujar sparklines después de que los elementos estén en el DOM
  items.forEach((item) => {
    if (!Array.isArray(item.samples) || item.samples.length < 2) return;
    const key = item.kind === 'gpu' ? 'gpu_temp' : 'cpu_temp';
    const color = cssVar('--accent');
    // sparkline del detalle (al expandir/fallback)
    const canvas = document.getElementById(`spark-${item.id}`);
    if (canvas) _drawSparkline(canvas, item.samples, key, color);
    // mini-sparkline SIEMPRE visible en el cuerpo de la tarjeta
    const mini = document.getElementById(`mspark-${item.id}`);
    if (mini) _drawMiniSparkline(mini, item.samples, key, color);
  });

  // borrar un benchmark individual
  host.querySelectorAll('.bench-card-delete').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteBenchmarkItem(btn.dataset.bidDel);
    });
  });

  updateBenchClearAllVisibility();

  // click en la tarjeta → abrir el modal de detalle dedicado (gráficas grandes,
  // eventos, antes→después). Fallback al viejo expandir-en-línea si el modal
  // no estuviera disponible por algún motivo.
  host.querySelectorAll('.bench-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.bench-card-delete')) return; // borrar no abre
      const bid = card.dataset.bid;
      const item = benchmarkHistory.find((i) => i.id === bid);
      if (item && window.RogBenchDetail && typeof window.RogBenchDetail.open === 'function') {
        window.RogBenchDetail.open(item);
        return;
      }
      // fallback: comportamiento previo de expandir en línea
      if (e.target.closest('.bench-card-detail')) return;
      card.classList.toggle('open');
      if (card.classList.contains('open') && item?.samples?.length > 1) {
        const canvas = card.querySelector('.bench-sparkline');
        if (canvas) {
          const key = item.kind === 'gpu' ? 'gpu_temp' : 'cpu_temp';
          _drawSparkline(canvas, item.samples, key, cssVar('--accent'));
        }
      }
    });
  });

  // inline status: texto del último item
  const first = items[0];
  const s = first.summary || {};
  const statusText = first.kind === 'cpu'
    ? t('bench.inline_cpu', { temp: fmt(s.cpu_temp_max, 1), watts: fmt(s.cpu_watts_max, 1), events: s.throttle_events ?? 0, when: first.when })
    : first._legacyText
      ? first._legacyText
      : t('bench.inline_gpu', { temp: fmt(s.gpu_temp_max, 1), watts: fmt(s.gpu_watts_max, 1), when: first.when });
  $('bench-inline-status').textContent = statusText;
}

function pushBenchmarkHistory(result) {
  if (!result?.ok) return;
  const s = result.summary || {};
  const label = result.kind === 'cpu' ? 'CPU' : 'GPU LOCAL';
  const now = new Date();
  const record = {
    id: `bench-${result.kind}-${now.getTime()}`,
    kind: result.kind,
    label,
    started_at: result.started_at || null,
    when: now.toLocaleString(),
    seconds: result.seconds || null,
    tool: result.tool || null,
    summary: s,
    samples: result.samples || null,
  };
  benchmarkHistory = [record, ...benchmarkHistory].slice(0, 20);
  localStorage.setItem('benchmarkHistoryV2', JSON.stringify(benchmarkHistory));
  renderBenchmarkHistory();
}

/* ---- borrar historial de benchmarks (persistencia legible en localStorage) ---- */
function _saveBenchmarkHistory() {
  localStorage.setItem('benchmarkHistoryV2', JSON.stringify(benchmarkHistory));
}

function deleteBenchmarkItem(id) {
  if (!id) return;
  const before = benchmarkHistory.length;
  benchmarkHistory = benchmarkHistory.filter((i) => i.id !== id);
  if (benchmarkHistory.length === before) return;
  _saveBenchmarkHistory();
  renderBenchmarkHistory();
  toast(t('toast.bench_cleared'));
}

async function clearAllBenchmarkHistory() {
  if (!benchmarkHistory.length) return;
  if (!(await confirmT('confirm.bench_clear_all'))) return;
  benchmarkHistory = [];
  _saveBenchmarkHistory();
  renderBenchmarkHistory();
  toast(t('toast.bench_hist_cleared'));
}

/* Inyecta el botón "Borrar todos" en el bloque inline si todavía no existe */
function _ensureBenchClearAllButton() {
  const actions = document.querySelector('#bench-block .bench-actions');
  if (actions && !document.getElementById('bench-clear-all-btn')) {
    const btn = document.createElement('button');
    btn.className = 'ghost';
    btn.id = 'bench-clear-all-btn';
    btn.textContent = 'BORRAR TODOS LOS ANTERIORES';
    btn.title = 'Borra todo el historial de benchmarks guardado';
    btn.addEventListener('click', clearAllBenchmarkHistory);
    actions.appendChild(btn);
  }
  const modalActions = document.querySelector('#benchmark-modal .mode-row');
  if (modalActions && !document.getElementById('bench-clear-all-modal-btn')) {
    const btn = document.createElement('button');
    btn.className = 'ghost';
    btn.id = 'bench-clear-all-modal-btn';
    btn.textContent = 'BORRAR TODOS';
    btn.title = 'Borra todo el historial de benchmarks guardado';
    btn.addEventListener('click', clearAllBenchmarkHistory);
    modalActions.appendChild(btn);
  }
}

function updateBenchClearAllVisibility() {
  _ensureBenchClearAllButton();
  const inlineBtn = document.getElementById('bench-clear-all-btn');
  const modalBtn = document.getElementById('bench-clear-all-modal-btn');
  const has = benchmarkHistory.length > 0;
  if (inlineBtn) inlineBtn.classList.toggle('hidden', !has);
  if (modalBtn) modalBtn.classList.toggle('hidden', !has);
}

/* ---------- main update ---------- */

const LAMP_STATES = [
  ['cold', 'FRÍO'], ['normal', 'NORMAL'], ['hot', 'CALIENTE'], ['critical', 'CRÍTICO'],
];

// Nombre corto de la dGPU detectada (p. ej. "RTX 4060"); se recuerda para que
// los tooltips sigan diciendo el modelo real aun en modo Integrated (dGPU off).
let dgpuName = localStorage.getItem('dgpuName') || '';

function shortGpuName(full) {
  return String(full || '')
    .replace(/NVIDIA |GeForce |AMD |Radeon\(TM\) | Laptop GPU| Graphics/g, '')
    .trim();
}

function refreshGpuTooltips(active) {
  const detected = active?.vendor !== 'intel' ? shortGpuName(active?.name) : '';
  if (detected && detected !== dgpuName) {
    dgpuName = detected;
    localStorage.setItem('dgpuName', dgpuName);
  }
  const gpu = dgpuName ? `la ${dgpuName}` : 'la GPU dedicada';
  const seg = $('gpu-seg');
  if (seg.dataset.tipFor === dgpuName) return;
  seg.dataset.tipFor = dgpuName;
  seg.querySelector('[data-gpu="Integrated"]').title =
    `Solo gráficos integrados: máxima batería, ${gpu} queda apagada`;
  seg.querySelector('[data-gpu="Hybrid"]').title =
    `Integrados para el escritorio + ${gpu} para juegos (recomendado)`;
  seg.querySelector('[data-gpu="AsusMuxDgpu"]').title =
    `MUX: solo ${gpu} para todo. Más FPS pero gasta más batería. Requiere REINICIAR`;
}

function gpuPendingActionText(action, mode) {
  const raw = String(action || '').toLowerCase();
  if (mode === 'AsusMuxDgpu' || raw.includes('reboot') || raw.includes('restart')) {
    return 'reinicia el equipo para aplicar';
  }
  return 'cierra sesión y vuelve a iniciar para aplicar';
}

function gpuSwitchWarning(mode) {
  const gpu = dgpuName ? t('gpu.warn_dgpu_name', { name: dgpuName }) : t('gpu.warn_dgpu_generic');
  if (mode === 'AsusMuxDgpu') return t('gpu.warn_mux', { gpu });
  if (mode === 'Integrated') return t('gpu.warn_igpu', { gpu });
  return t('gpu.warn_hybrid', { gpu });
}

function gpuRequestToast(mode, res) {
  const action = gpuPendingActionText(res.pending_action, res.pending || mode);
  if (res.pending) return `Modo ${mode} solicitado — ${action}`;
  if (res.mode === mode) return `Modo ${mode} activo`;
  return `Modo ${mode} solicitado`;
}

/* Mapa clave-de-orden → clase de la celda que se resalta en neón (compartido
   por la tabla #procs y el modal #allprocs). El atributo data-sort-col del
   <table> lleva esta clase y el CSS resalta SOLO esa columna. */
const PROC_COL_CLASS = { pid: 'pid', name: 'pname', cpu: 'cpu', cpu_core: 'cpu-core', mem_mb: 'mem' };

function sortProcRows(rows, sortKey, sortDir) {
  const dir = sortDir === 'asc' ? 1 : -1;
  return rows.slice().sort((a, b) => {
    let av = a[sortKey], bv = b[sortKey];
    if (sortKey === 'name') return String(av).localeCompare(String(bv)) * dir;
    av = av == null ? -Infinity : av;
    bv = bv == null ? -Infinity : bv;
    if (av === bv) return (b.cpu || 0) - (a.cpu || 0);
    return (av - bv) * dir;
  });
}

/* estado de orden de la tabla #procs (top-5 del dashboard) */
let procsSortKey = 'cpu';
let procsSortDir = 'desc';

function updateProcsSortIndicators() {
  document.querySelectorAll('#procs th.sortable').forEach((th) => {
    const active = th.dataset.sort === procsSortKey;
    th.classList.toggle('sort-active', active);
    th.dataset.dir = active ? procsSortDir : '';
  });
}

function update(stats) {
  lastStats = stats;
  const cpu = stats.cpu || {};
  const limits = stats.limits || {};

  /* lamp — usa nombres "bare" propios (cold/normal/hot/critical) que ya
   * existen en el CSS de la lámpara; very-hot de tempClass() mapea a critical
   * aquí para no romper ese contrato previo (la lámpara no es #cpu-temp/#gpu-temp). */
  const lamp = $('thermal-lamp');
  const rawCls = tempClass(cpu.avg, limits.cpu).replace('t-', '') || '';
  const cls = rawCls === 'very-hot' ? 'critical' : rawCls;
  lamp.className = 'lamp ' + cls;
  const lampIdx = { cold: 0, normal: 1, hot: 2, critical: 3 }[cls];
  const label = $('thermal-label');
  label.textContent = lampIdx != null ? LAMP_STATES[lampIdx][1] : '—';
  label.className = 'lamp-label ' + cls;

  /* cpu */
  $('cpu-model').textContent = cpu.model || '';
  const cpuTemp = $('cpu-temp');
  cpuTemp.textContent = fmt(cpu.avg, 1);
  cpuTemp.className = tempClass(cpu.avg, limits.cpu);
  $('cpu-max').textContent = fmt(cpu.max, 0) + '°';
  $('cpu-min').textContent = fmt(cpu.min, 0) + '°';
  $('cpu-pkg').textContent = fmt(cpu.package, 0) + '°';
  $('cpu-hot').textContent = cpu.hot90 ?? '--';
  $('cpu-freq').textContent = fmt(cpu.freq_ghz, 2);
  const cpuWatts = $('cpu-watts');
  cpuWatts.textContent = stats.rapl_available ? fmt(stats.cpu_watts, 1) : 'root';
  // only flag power that is actually abnormal, not just "is a number"
  cpuWatts.className = (stats.cpu_watts ?? 0) >= 140 ? 'accent' : '';
  $('cpu-throttle').textContent = cpu.throttle_count ?? '--';
  $('cpu-epp').textContent = cpu.epp || '--';

  /* gpu */
  const gpu = stats.gpu || {};
  const active = gpu.active;
  refreshGpuTooltips(active);
  $('gpu-mode').textContent = (gpu.mode || '--') + (gpu.pending ? ` → ${gpu.pending}` : '');
  if (active) {
    $('gpu-off-note').classList.add('hidden');
    $('gpu-name').textContent = active.name || '';
    const gt = $('gpu-temp');
    gt.textContent = fmt(active.temp, 0);
    gt.className = tempClass(active.temp, limits.gpu);
    $('gpu-util').textContent = fmt(active.util, 0) + '%';
    $('gpu-watts').textContent = fmt(active.power, 1);
    $('gpu-clock').textContent = fmt(active.clock_mhz, 0);
    $('gpu-vram-clock').textContent = fmt(active.vram_clock_mhz, 0);
    $('gpu-vram').textContent = active.vram_total
      ? fmtGbPairFromMb(active.vram_used, active.vram_total) : '--';
  } else {
    $('gpu-off-note').classList.remove('hidden');
    $('gpu-temp').textContent = '--';
    $('gpu-util').textContent = $('gpu-watts').textContent = $('gpu-vram').textContent = '--';
    $('gpu-clock').textContent = $('gpu-vram-clock').textContent = '--';
  }

  /* pending banner */
  const banner = $('pending-banner');
  if (gpu.pending) {
    $('pending-mode').textContent = `${gpu.mode || '?'} → ${gpu.pending}`;
    $('pending-action').textContent = gpuPendingActionText(gpu.pending_action, gpu.pending);
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }

  /* segmented controls */
  const sysProfile = normalizeProfile(stats.ppd_profile);
  let shownProfile = sysProfile;
  if (pendingProfile) {
    if (sysProfile === pendingProfile) {
      pendingProfile = null;            // el sistema ya reporta el perfil elegido
    } else if (pendingProfileConfirmed) {
      // El sistema confirmó el cambio (busctl read-back). El perfil ES el que
      // el usuario eligió; si el stream 1 Hz aún reporta el viejo es solo
      // rezago. NO revertimos: el usuario manda, se queda donde lo puso.
      shownProfile = pendingProfile;
    } else if (Date.now() - pendingProfileTs > PENDING_PROFILE_MS) {
      pendingProfile = null;            // nunca se confirmó y expiró: reflejar realidad
    } else {
      shownProfile = pendingProfile;    // mantener el elegido mientras se aplica
    }
  }
  document.querySelectorAll('#profile-seg button').forEach((b) =>
    b.classList.toggle('active', b.dataset.profile === shownProfile));
  document.querySelectorAll('#gpu-seg button').forEach((b) => {
    b.classList.toggle('active', b.dataset.gpu === gpu.mode);
    b.classList.toggle('busy', gpuBusy);
  });

  /* fans */
  renderFans(stats.fans || []);
  if (stats.aura && !musicModeActive && !auraDirty && !auraFocused) renderAura(stats.aura);

  /* charts */
  const series = stats.series || {};
  drawChart($('chart-cpu'), series.cpu_temp, cssVar('--cold'));
  drawChart($('chart-gpu'), series.gpu_temp, cssVar('--okstate'));
  drawChart($('chart-power'), series.cpu_power, cssVar('--accent'), { fromZero: true });
  drawChart($('chart-gpu-power'), series.gpu_power, cssVar('--hot'), { fromZero: true });

  $('rapl-note').classList.toggle('hidden', !!stats.rapl_available);

  /* system */
  const sys = stats.sys || {};
  $('ram-label').textContent = `${fmt(sys.ram_used_gb, 1)}/${fmt(sys.ram_total_gb, 0)} G`;
  $('ram-bar').style.width = (sys.ram_percent || 0) + '%';
  const vramTotal = active?.vram_total;
  const vramUsed = active?.vram_used;
  const vramPercent = vramTotal ? Math.max(0, Math.min(100, Math.round((vramUsed || 0) * 100 / vramTotal))) : 0;
  $('vram-label').textContent = vramTotal ? fmtGbPairFromMb(vramUsed, vramTotal) : '--';
  $('vram-bar').style.width = `${vramPercent}%`;
  $('vram-meter').classList.toggle('disabled', !vramTotal);

  const disks = $('disks');
  disks.innerHTML = (sys.disks || []).map((d) => `
    <div class="meter">
      <label>${d.label} <b>${fmt(d.used_gb, 0)}/${fmt(d.total_gb, 0)} G</b></label>
      <div class="track"><div style="width:${d.percent}%"></div></div>
    </div>`).join('');

  $('net').textContent = `↓${fmt(sys.rx_mbps, 1)} ↑${fmt(sys.tx_mbps, 1)} Mb/s`;
  $('load').textContent = (sys.load || []).map((l) => l.toFixed(2)).join(' ');
  const bat = stats.battery;
  $('battery').textContent = bat && bat.capacity != null
    ? `${bat.capacity}%${bat.charge_limit ? ' (límite ' + bat.charge_limit + '%)' : ''}`
    : '--';
  $('asus-profile').textContent = stats.asus_profile || '--';

  /* power source */
  const src = $('power-source');
  if (bat) {
    src.textContent = bat.on_ac ? '⚡ CONECTADO' : '🔋 BATERÍA';
    src.className = 'power-source ' + (bat.on_ac ? 'ac' : 'bat');
  }

  /* events */
  const events = (stats.events || []).slice(-30).reverse();
  $('events').innerHTML = events.length
    ? events.map(([ts, level, msg]) =>
        `<li class="${level}"><time>${ts}</time>${msg}</li>`).join('')
    : '<li class="dim">sin eventos</li>';

  /* processes — DOS columnas separadas: % CPU total (todos los núcleos) y
     % NÚCLEO (uso de un solo núcleo, estilo `top`). Antes iban pegados. */
  const procsTable = $('procs');
  if (procsTable) procsTable.dataset.sortCol = PROC_COL_CLASS[procsSortKey] || '';
  $('procs-body').innerHTML = sortProcRows(stats.procs || [], procsSortKey, procsSortDir).map((p) => {
    const core = p.cpu_core != null
      ? `<span class="procs-core" title="${p.cpu_core >= 100
            ? Math.floor(p.cpu_core / 100) + ' núcleo(s) completo(s)'
            : 'fracción de un núcleo'}">${p.cpu_core.toFixed(0)}%</span>`
      : '<span class="dim">—</span>';
    return `<tr data-pid="${p.pid}" data-name="${p.name}" title="${t('procs.kill', { name: p.name })}">
        <td class="pid">${p.pid}</td><td class="pname">${p.name}</td>
        <td class="cpu r">${p.cpu.toFixed(1)}%</td>
        <td class="cpu-core r">${core}</td>
        <td class="mem r">${p.mem_mb} MB</td></tr>`;
  }).join('');
  updateProcsSortIndicators();

  $('backend-state').textContent =
    `sensores OK · core v${stats.version || '?'} · ${new Date().toLocaleTimeString()}`;
}

/* ---------- actions ---------- */

function closeControlMenus(except = '') {
  document.querySelectorAll('[data-menu-panel]').forEach((panel) => {
    const name = panel.dataset.menuPanel;
    panel.classList.toggle('hidden', name !== except);
  });
  document.querySelectorAll('[data-menu-toggle]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.menuToggle === except);
  });
}

document.querySelectorAll('[data-menu-toggle]').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const name = btn.dataset.menuToggle;
    const panel = document.querySelector(`[data-menu-panel="${name}"]`);
    closeControlMenus(panel && panel.classList.contains('hidden') ? name : '');
  });
});
document.querySelectorAll('[data-menu-panel]').forEach((panel) => {
  panel.addEventListener('click', (e) => {
    if (e.target.closest('button')) closeControlMenus();
  });
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.control-menu')) closeControlMenus();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeControlMenus();
});

const PROFILE_KEY = {
  'power-saver': 'profile.power_saver',
  'balanced':    'profile.balanced',
  'performance': 'profile.performance',
};
document.querySelectorAll('#profile-seg button').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const profile = btn.dataset.profile;
    // Marcar como PENDIENTE: el resaltado se mantiene en este perfil hasta que el
    // sistema lo confirme (ver bloque en update()). Esto elimina el "rebote" que
    // ocurría cuando el refresco 1 Hz pisaba el resaltado con el perfil viejo.
    pendingProfile = profile;
    pendingProfileTs = Date.now();
    pendingProfileConfirmed = false;
    document.querySelectorAll('#profile-seg button').forEach((b) =>
      b.classList.toggle('active', b === btn));
    const label = t(PROFILE_KEY[profile] || 'profile.balanced');
    const res = await window.rog.setProfile(profile);
    if (!res.ok) {
      pendingProfile = null;            // falló: volver a reflejar la realidad
      toast(t('profile.error', { e: res.err }));
      if (lastStats) update(lastStats);
      return;
    }
    // applied === true → busctl confirmó que el perfil realmente quedó. A
    // partir de aquí el resaltado se queda fijo en lo que elegiste (no rebota).
    if (res.applied && pendingProfile === profile) pendingProfileConfirmed = true;
    toast(res.applied
      ? t('profile.changed', { p: label })
      : t('profile.requested', { p: label }));
  });
});

document.querySelectorAll('#gpu-seg button').forEach((btn) => {
  btn.addEventListener('click', async () => {
    if (gpuBusy) return;
    const mode = btn.dataset.gpu;
    if (lastStats?.gpu?.mode === mode && !lastStats?.gpu?.pending) {
      toast(`Ya estás en modo ${mode}`);
      return;
    }
    if (!(await rogConfirm(gpuSwitchWarning(mode), { title: t('topbar.gpu_seg') }))) return;
    gpuBusy = true;
    toast(`Solicitando modo ${mode}… (puede tardar)`);
    const res = await window.rog.setGpuMode(mode);
    gpuBusy = false;
    toast(res.ok ? gpuRequestToast(mode, res) : `No se pudo: ${res.err || res.out}`);
  });
});

// El botón ACTUALIZAR del menú SISTEMA se removió (vive en MANTENIMIENTO). El
// handler se conserva guardado por si vuelve a existir.
$('update-btn')?.addEventListener('click', async () => {
  const label = $('update-label');
  const btn = $('update-btn');
  if (btn.dataset.ready === '1') {
    label.textContent = 'ACTUALIZANDO…';
    const res = await window.rog.doUpdate();
    btn.dataset.ready = '';
    btn.classList.remove('attention');
    label.textContent = 'ACTUALIZAR';
    toast(res.ok ? 'Actualizado y backend reiniciado ✓' : `Error: ${res.err}`);
    return;
  }
  label.textContent = 'BUSCANDO…';
  const res = await window.rog.checkUpdate();
  if (!res.ok) {
    label.textContent = 'ACTUALIZAR';
    toast(`No se pudo verificar: ${res.err}`);
  } else if (res.behind > 0) {
    btn.dataset.ready = '1';
    btn.classList.add('attention');
    label.textContent = `INSTALAR ${res.behind} CAMBIO${res.behind > 1 ? 'S' : ''}`;
    toast(`Actualizaciones disponibles:\n${res.log}`);
  } else {
    label.textContent = 'AL DÍA ✓';
    setTimeout(() => { label.textContent = 'ACTUALIZAR'; }, 4000);
  }
});

/* ---------- mantenimiento (actualizar / reinstalar / desinstalar) ---------- */
function maintStatus(msg) {
  const el = $('maint-status');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('hidden', !msg);
}
$('maintenance-btn')?.addEventListener('click', () => {
  maintStatus('');
  $('maintenance-modal').classList.remove('hidden');
});
$('maint-close')?.addEventListener('click', () => $('maintenance-modal').classList.add('hidden'));
$('maintenance-modal')?.addEventListener('click', (e) => {
  if (e.target === $('maintenance-modal')) $('maintenance-modal').classList.add('hidden');
});
$('maint-update')?.addEventListener('click', async () => {
  maintStatus('Buscando actualización…');
  const res = await window.rog.checkUpdate();
  if (!res.ok) { maintStatus(`No se pudo verificar: ${res.err}`); return; }
  if (res.behind > 0) {
    maintStatus(`Hay ${res.behind} cambio(s). Instalando…`);
    const up = await window.rog.doUpdate();
    maintStatus(up.ok ? 'Actualizado y backend reiniciado ✓' : `Error: ${up.err}`);
  } else {
    maintStatus('Ya estás al día ✓');
  }
});
$('maint-reinstall')?.addEventListener('click', async () => {
  maintStatus('Reinstalando dependencias…');
  const res = await window.rog.reinstallApp();
  maintStatus(res.ok ? 'Reinstalado y backend reiniciado ✓' : `Error: ${res.err || res.out}`);
});
$('maint-uninstall')?.addEventListener('click', async () => {
  const purge = $('maint-purge').checked;
  const msg = purge
    ? t('confirm.uninstall_purge')
    : t('confirm.uninstall_keep');
  if (!(await rogConfirm(msg + t('confirm.uninstall_pw_note'), { title: t('maint.uninstall_title') }))) return;
  maintStatus('Desinstalando… (puede pedir contraseña)');
  const res = await window.rog.uninstallApp({ purge });
  if (res.ok) {
    maintStatus('Desinstalado. La app se cerrará…');
  } else {
    maintStatus(`Error: ${res.err || 'no se pudo desinstalar'}`);
  }
});

/* ---------- wiring ---------- */

wireChartHover('chart-cpu', '°C');
wireChartHover('chart-gpu', '°C');
wireChartHover('chart-power', 'W');
wireChartHover('chart-gpu-power', 'W');

window.rog.onStats(update);
window.rog.onBackendDown(() => {
  $('backend-state').textContent = 'backend caído — reiniciando…';
  recordLocalError('backend-down', { message: 'backend caído — reiniciando' });
});
// Watchdog / exit handler emits this before auto-recover fires so the pill
// shows feedback immediately instead of freezing silently.
if (window.rog.onBackendReconnecting) {
  window.rog.onBackendReconnecting(() => {
    $('backend-state').textContent = t('status.reconnecting') || 'reconectando…';
  });
}
window.rog.onMusicStopped(() => {
  musicModeActive = false;
  $('aura-music').textContent = 'MODO MÚSICA';
  markAuraDirty(false);
  refreshAuraState();
});
window.rog.appInfo().then((info) => {
  $('versions').textContent = `ROG Monitor v${info.appVersion} · ${info.repo}`;
});
window.addEventListener('resize', () => lastStats && update(lastStats));

/* ---------- zoom (ctrl+wheel, ctrl +/-/0) ---------- */

window.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  window.rog.zoom(e.deltaY < 0 ? 0.5 : -0.5);
}, { passive: false });
window.addEventListener('keydown', (e) => {
  if (!e.ctrlKey) return;
  if (e.key === '+' || e.key === '=') { e.preventDefault(); window.rog.zoom(0.5); }
  if (e.key === '-') { e.preventDefault(); window.rog.zoom(-0.5); }
  if (e.key === '0') { e.preventDefault(); window.rog.zoom(null); }
});

/* ---------- i18n / idioma ---------- */

// Idiomas con nombres nativos (en sincronía con i18n.js)
// Sin banderas/emojis: el selector usa LANG_META (i18n.js) con nombre nativo
// y una insignia con el código de idioma. Fallback local por si i18n no cargó.
const LANG_FALLBACK = [
  { code: 'es', native: 'Español'  },
  { code: 'en', native: 'English'  },
  { code: 'fr', native: 'Français' },
  { code: 'it', native: 'Italiano' },
  { code: 'pt', native: 'Português' },
  { code: 'zh', native: '中文'      },
  { code: 'ja', native: '日本語'    },
  { code: 'ko', native: '한국어'    },
];

function buildLangGrid() {
  const grid = $('lang-grid');
  if (!grid) return;
  const active = window.i18n ? window.i18n.get() : 'es';
  const langs = (window.i18n && window.i18n.LANG_META) || LANG_FALLBACK;
  grid.innerHTML = langs.map((l) => `
    <button class="lang-option${l.code === active ? ' active' : ''}" data-lang="${l.code}" type="button">
      <span class="lang-flag">${l.code.toUpperCase()}</span>
      <span class="lang-name">${l.native || l.label}</span>
    </button>`).join('');
  grid.querySelectorAll('.lang-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (window.i18n) window.i18n.set(btn.dataset.lang);
      // Actualizar estado activo en el grid sin reconstruir
      grid.querySelectorAll('.lang-option').forEach((b) =>
        b.classList.toggle('active', b.dataset.lang === btn.dataset.lang));
    });
  });
}

$('lang-btn').addEventListener('click', () => {
  buildLangGrid();
  $('lang-modal').classList.remove('hidden');
});

if ($('lang-close')) {
  $('lang-close').addEventListener('click', () => $('lang-modal').classList.add('hidden'));
}
$('lang-modal').addEventListener('click', (e) => {
  if (e.target === $('lang-modal')) $('lang-modal').classList.add('hidden');
});

// Cuando cambia el idioma: re-aplica data-i18n al DOM, regenera el grid y
// persiste el idioma en el backend (reinicia el monitor para que los eventos
// NUEVOS salgan en el idioma elegido; el historial viejo se queda como está).
if (window.i18n) {
  let langSaveTimer = null;
  window.i18n.onChange((lang) => {
    window.i18n.apply();
    buildLangGrid();
    // Re-pintar contenido dinámico ya visible (estados que no son data-i18n).
    // Cada llamada va protegida: un elemento/estado ausente nunca debe lanzar.
    try { if (typeof auraState !== 'undefined' && auraState) renderAura(auraState); } catch (_) {}
    try { if (typeof renderBenchmarkHistory === 'function') renderBenchmarkHistory(); } catch (_) {}
    try {
      // Modal de benchmark abierto: re-pinta resumen y estado del último resultado.
      const bm = $('benchmark-modal');
      if (bm && !bm.classList.contains('hidden') && typeof benchmarkResult !== 'undefined' && benchmarkResult) {
        $('bench-output').textContent = benchmarkSummaryText(benchmarkResult);
      }
    } catch (_) {}
    try { if (typeof lastStats !== 'undefined' && lastStats) update(lastStats); } catch (_) {}
    if (window.rog?.saveSettings) {
      clearTimeout(langSaveTimer); // ponytail: debounce — reinicia el backend una sola vez
      langSaveTimer = setTimeout(() => window.rog.saveSettings({ lang }), 400);
    }
  });
}

/* ---------- theme picker ---------- */

$('theme-grid').innerHTML = THEMES.map(([id, name, desc]) => `
  <button class="theme-card" data-theme="${id}">
    <span class="swatch"><i class="a"></i><i></i><i></i></span>
    <span class="name">${name}</span>
    <span class="desc">${desc}</span>
  </button>`).join('');

document.querySelectorAll('.theme-card').forEach((card) => {
  card.addEventListener('click', () => {
    localStorage.setItem('theme', card.dataset.theme);
    applyAppearance();
  });
});

document.querySelectorAll('#mode-seg button').forEach((btn) => {
  btn.addEventListener('click', () => {
    localStorage.setItem('mode', btn.dataset.mode);
    applyAppearance();
  });
});
prefersDark.addEventListener('change', applyAppearance);

/* v16: el tema/modo/tamaño viven ahora dentro de #config-modal (ver región
   v16 Agente4 más abajo). El antiguo #theme-modal / #theme-btn ya no existen. */

/* ---------- alert thresholds / colors ---------- */

function setAlertsStatus(message, kind = '') {
  const el = $('alerts-status');
  if (!message) { el.textContent = ''; el.className = 'note hidden'; return; }
  el.textContent = message;
  el.className = `note ${kind}`.trim();
}

function fillAlertsForm(s) {
  const a = s.alerts || {};
  const c = s.temp_colors || {};
  $('set-cpu-temp-warn').value = a.cpu_temp_warn ?? '';
  $('set-gpu-temp-warn').value = a.gpu_temp_warn ?? '';
  $('set-cpu-power-warn').value = a.cpu_power_warn ?? '';
  $('set-fan-stopped').value = a.fan_stopped_cpu_temp ?? '';
  $('set-cooldown').value = a.cooldown_seconds ?? '';
  $('set-throttle-ms').value = a.throttle_min_ms ?? '';
  const cpu = c.cpu || [];
  const gpu = c.gpu || [];
  $('set-cpu-c0').value = cpu[0] ?? '';
  $('set-cpu-c1').value = cpu[1] ?? '';
  $('set-cpu-c2').value = cpu[2] ?? '';
  $('set-gpu-c0').value = gpu[0] ?? '';
  $('set-gpu-c1').value = gpu[1] ?? '';
  $('set-gpu-c2').value = gpu[2] ?? '';
  $('set-notifications').checked = s.notifications !== false;
}

const numOrNull = (id) => {
  const v = $(id).value.trim();
  return v === '' ? null : Number(v);
};

async function openAlertsModal() {
  setAlertsStatus('');
  const res = await window.rog.getSettings();
  if (!res.ok) { toast(`No pude leer ajustes: ${res.err}`); return; }
  fillAlertsForm(res);
  // v16: autoarranque y notificaciones se gestionan en #config-modal.
  $('alerts-modal').classList.remove('hidden');
}

$('alerts-btn').addEventListener('click', openAlertsModal);
$('alerts-close').addEventListener('click', () => $('alerts-modal').classList.add('hidden'));
$('alerts-modal').addEventListener('click', (e) => {
  if (e.target === $('alerts-modal')) $('alerts-modal').classList.add('hidden');
});
$('alerts-save').addEventListener('click', async () => {
  const payload = {
    alerts: {
      cpu_temp_warn: numOrNull('set-cpu-temp-warn'),
      gpu_temp_warn: numOrNull('set-gpu-temp-warn'),
      cpu_power_warn: numOrNull('set-cpu-power-warn'),
      fan_stopped_cpu_temp: numOrNull('set-fan-stopped'),
      cooldown_seconds: numOrNull('set-cooldown'),
      throttle_min_ms: numOrNull('set-throttle-ms'),
    },
    temp_colors: {
      cpu: [numOrNull('set-cpu-c0'), numOrNull('set-cpu-c1'), numOrNull('set-cpu-c2')],
      gpu: [numOrNull('set-gpu-c0'), numOrNull('set-gpu-c1'), numOrNull('set-gpu-c2')],
    },
    // v16: notificaciones se gestionan ahora en #config-modal (merge en backend).
  };
  setAlertsStatus(t('alerts.status_saving'), 'status-live');
  const res = await window.rog.saveSettings(payload);
  if (!res.ok) {
    setAlertsStatus(res.err || t('alerts.status_save_failed'), 'status-dirty');
    toast(`Ajustes: ${res.err}`);
    return;
  }
  fillAlertsForm(res);
  setAlertsStatus(t('alerts.status_saved'), 'status-ok');
  toast(t('toast.thresholds_saved'));
});

/* ===== v16 Agente4: config/salir/layout handlers (no tocar otras regiones) ===== */
(function v16ConfigSalir() {
  /* --- i18n: claves nuevas en los 8 idiomas --- */
  if (window.i18n && window.i18n.register) {
    window.i18n.register({
      'topbar.alerts_title':  { es:'Alertas / Umbrales: avisos y colores por temperatura y potencia', en:'Alerts / Thresholds: warnings and colors by temperature and power', fr:'Alertes / Seuils : avertissements et couleurs par température et puissance', it:'Avvisi / Soglie: avvisi e colori per temperatura e potenza', pt:'Alertas / Limiares: avisos e cores por temperatura e potência', zh:'警报/阈值：按温度和功率的提醒与颜色', ja:'アラート / しきい値：温度と電力による警告と色', ko:'경고 / 임계값: 온도 및 전력별 알림과 색상' },
      'topbar.config':        { es:'CONFIGURACIÓN', en:'CONFIGURATION', fr:'CONFIGURATION', it:'CONFIGURAZIONE', pt:'CONFIGURAÇÃO', zh:'配置', ja:'設定', ko:'구성' },
      'topbar.config_title':  { es:'Configuración: idioma, apariencia, autoarranque y notificaciones', en:'Configuration: language, appearance, autostart and notifications', fr:'Configuration : langue, apparence, démarrage automatique et notifications', it:'Configurazione: lingua, aspetto, avvio automatico e notifiche', pt:'Configuração: idioma, aparência, início automático e notificações', zh:'配置：语言、外观、开机启动和通知', ja:'設定：言語、外観、自動起動、通知', ko:'구성: 언어, 모양, 자동 시작 및 알림' },
      'topbar.quit':          { es:'SALIR', en:'QUIT', fr:'QUITTER', it:'ESCI', pt:'SAIR', zh:'退出', ja:'終了', ko:'종료' },
      'topbar.quit_title':    { es:'Cerrar ROG Monitor por completo (sale de la bandeja y detiene el monitor)', en:'Quit ROG Monitor completely (leaves the tray and stops the monitor)', fr:'Quitter complètement ROG Monitor (quitte la zone de notification et arrête le moniteur)', it:'Chiudi completamente ROG Monitor (esce dalla tray e ferma il monitor)', pt:'Fechar o ROG Monitor por completo (sai da bandeja e para o monitor)', zh:'完全退出 ROG Monitor（离开托盘并停止监控）', ja:'ROG Monitor を完全に終了（トレイから抜けてモニターを停止）', ko:'ROG Monitor 완전히 종료 (트레이에서 나가고 모니터 중지)' },
      'config.title':         { es:'Configuración', en:'Configuration', fr:'Configuration', it:'Configurazione', pt:'Configuração', zh:'配置', ja:'設定', ko:'구성' },
      'config.sub':           { es:'Idioma, apariencia, autoarranque y notificaciones. Todo se guarda automáticamente.', en:'Language, appearance, autostart and notifications. Everything is saved automatically.', fr:'Langue, apparence, démarrage automatique et notifications. Tout est enregistré automatiquement.', it:'Lingua, aspetto, avvio automatico e notifiche. Tutto viene salvato automaticamente.', pt:'Idioma, aparência, início automático e notificações. Tudo é salvo automaticamente.', zh:'语言、外观、开机启动和通知。所有内容都会自动保存。', ja:'言語、外観、自動起動、通知。すべて自動的に保存されます。', ko:'언어, 모양, 자동 시작 및 알림. 모든 것이 자동으로 저장됩니다.' },
      'config.lang_title':    { es:'Idioma', en:'Language', fr:'Langue', it:'Lingua', pt:'Idioma', zh:'语言', ja:'言語', ko:'언어' },
      'config.system_title':  { es:'Sistema', en:'System', fr:'Système', it:'Sistema', pt:'Sistema', zh:'系统', ja:'システム', ko:'시스템' },
      'config.close_action':  { es:'Al cerrar la ventana', en:'When closing the window', fr:'À la fermeture de la fenêtre', it:'Alla chiusura della finestra', pt:'Ao fechar a janela', zh:'关闭窗口时', ja:'ウィンドウを閉じるとき', ko:'창을 닫을 때' },
      'config.close_quit':    { es:'Salir completo', en:'Quit completely', fr:'Quitter complètement', it:'Esci completamente', pt:'Sair por completo', zh:'完全退出', ja:'完全に終了', ko:'완전히 종료' },
      'config.close_tray':    { es:'Minimizar a bandeja', en:'Minimize to tray', fr:'Réduire dans la zone de notification', it:'Riduci nella tray', pt:'Minimizar para a bandeja', zh:'最小化到托盘', ja:'トレイに最小化', ko:'트레이로 최소화' },
      'config.close_ask':     { es:'Preguntar cada vez', en:'Ask every time', fr:'Demander à chaque fois', it:'Chiedi ogni volta', pt:'Perguntar sempre', zh:'每次询问', ja:'毎回確認', ko:'매번 묻기' },
    });
    window.i18n.apply();
  }

  /* --- selector de idioma dentro de #config-modal --- */
  const LANG_FB = (window.i18n && window.i18n.LANG_META) || [
    { code:'es', native:'Español' }, { code:'en', native:'English' },
    { code:'fr', native:'Français' }, { code:'it', native:'Italiano' },
    { code:'pt', native:'Português' }, { code:'zh', native:'中文' },
    { code:'ja', native:'日本語' }, { code:'ko', native:'한국어' },
  ];
  function buildConfigLangGrid() {
    const grid = $('config-lang-grid');
    if (!grid) return;
    const active = window.i18n ? window.i18n.get() : 'es';
    const langs = (window.i18n && window.i18n.LANG_META) || LANG_FB;
    grid.innerHTML = langs.map((l) => `
      <button class="lang-option${l.code === active ? ' active' : ''}" data-lang="${l.code}" type="button">
        <span class="lang-flag">${l.code.toUpperCase()}</span>
        <span class="lang-name">${l.native || l.label}</span>
      </button>`).join('');
    grid.querySelectorAll('.lang-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (window.i18n) window.i18n.set(btn.dataset.lang);
        grid.querySelectorAll('.lang-option').forEach((b) =>
          b.classList.toggle('active', b.dataset.lang === btn.dataset.lang));
      });
    });
  }
  if (window.i18n && window.i18n.onChange) {
    window.i18n.onChange(() => { if ($('config-lang-grid')) buildConfigLangGrid(); });
  }

  /* --- abrir/cerrar #config-modal y cargar estados --- */
  async function openConfigModal() {
    buildConfigLangGrid();
    try {
      const a = await window.rog.getAutostart();
      if (a && a.ok) $('set-autostart').checked = !!a.enabled;
    } catch (_) { /* no crítico */ }
    try {
      const s = await window.rog.getSettings();
      if (s && s.ok) {
        $('set-notifications').checked = s.notifications !== false;
        if ($('set-close-action')) {
          $('set-close-action').value = s.close_action || 'quit';
          $('set-close-action').dataset.previous = $('set-close-action').value;
        }
      }
    } catch (_) { /* no crítico */ }
    $('config-modal').classList.remove('hidden');
  }
  if ($('config-btn')) $('config-btn').addEventListener('click', openConfigModal);
  if ($('config-close')) $('config-close').addEventListener('click', () =>
    $('config-modal').classList.add('hidden'));
  $('config-modal').addEventListener('click', (e) => {
    if (e.target === $('config-modal')) $('config-modal').classList.add('hidden');
  });

  /* --- autoarranque: estado independiente (.desktop en autostart) --- */
  $('set-autostart').addEventListener('change', async (e) => {
    const res = await window.rog.setAutostart(e.target.checked);
    if (!res || res.ok === false) {
      toast(`No pude cambiar el autoarranque: ${(res && res.err) || '?'}`);
      e.target.checked = !e.target.checked;
      return;
    }
    toast(e.target.checked
      ? 'Autoarranque activado: la app abrirá minimizada al iniciar sesión.'
      : 'Autoarranque desactivado.');
  });

  /* --- notificaciones: merge en settings.json (no reinicia perfiles) --- */
  $('set-notifications').addEventListener('change', async (e) => {
    const res = await window.rog.saveSettings({ notifications: e.target.checked });
    if (!res || res.ok === false) {
      toast(`No pude guardar notificaciones: ${(res && res.err) || '?'}`);
      e.target.checked = !e.target.checked;
    }
  });

  if ($('set-close-action')) $('set-close-action').addEventListener('change', async (e) => {
    const previous = e.target.dataset.previous || 'quit';
    const res = await window.rog.saveSettings({ close_action: e.target.value });
    if (!res || res.ok === false) {
      toast(`No pude guardar el cierre de ventana: ${(res && res.err) || '?'}`);
      e.target.value = previous;
      return;
    }
    e.target.dataset.previous = e.target.value;
    toast(e.target.value === 'quit'
      ? 'El botón X ahora cierra ROG Monitor por completo.'
      : e.target.value === 'tray'
        ? 'El botón X ahora minimiza ROG Monitor a la bandeja.'
        : 'El botón X preguntará qué hacer.');
  });

  /* --- SALIR (tipo Steam): cierra de verdad la app --- */
  if ($('quit-btn')) $('quit-btn').addEventListener('click', () => {
    if (window.rog && window.rog.appQuit) window.rog.appQuit();
  });
}());
/* ===== /v16 Agente4 ===== */

applyAppearance();
refreshAuraState(true);
renderBenchmarkHistory();

$('aura-effect').addEventListener('change', syncAuraFields);

// Cuadrícula de 9 tiles Armoury-style.
// Tiles con aria-disabled="true" son visuales (no interactivos).
// El tile Music no cambia auraSelectedEffect: activa el botón MODO MÚSICA.
$('aura-mode-grid').addEventListener('click', (e) => {
  const btn = e.target.closest('.mode-tile');
  if (!btn) return;
  if (btn.getAttribute('aria-disabled') === 'true') return;
  const modeId = btn.dataset.mode;
  const kind = btn.dataset.kind;

  if (kind === 'software' && modeId === 'music') {
    // El tile Music activa directamente el modo música (igual que el botón MODO MÚSICA).
    $('aura-music').click();
    return;
  }

  auraSelectedEffect = modeId;
  $('aura-effect').value = modeId;
  renderAuraEffectControls(modeId);
  syncAuraFields();
  saveAuraDraft(currentAuraFormState());
  markAuraDirty(true, 'Efecto cambiado. Falta aplicar.');
});
$('aura-block').addEventListener('focusin', () => { auraFocused = true; });
$('aura-block').addEventListener('focusout', () => {
  setTimeout(() => {
    auraFocused = $('aura-block').contains(document.activeElement);
  }, 0);
});
$('aura-effect').addEventListener('change', () => {
  auraSelectedEffect = $('aura-effect').value;
  renderAuraEffectControls(auraSelectedEffect);
  saveAuraDraft(currentAuraFormState());
  markAuraDirty(true, 'Efecto cambiado. Falta aplicar.');
});
// Nota: el listener de #aura-extra-effect fue eliminado en v10 (A2).
// La cuadrícula #aura-mode-grid es el único selector de efectos.
$('aura-colour').addEventListener('input', () => {
  saveAuraDraft(currentAuraFormState());
  markAuraDirty(true, 'Color cambiado. Falta aplicar.');
});
$('aura-colour2').addEventListener('input', () => {
  saveAuraDraft(currentAuraFormState());
  markAuraDirty(true, 'Color secundario cambiado. Falta aplicar.');
});
$('aura-speed').addEventListener('change', () => {
  saveAuraDraft(currentAuraFormState());
  markAuraDirty(true, 'Velocidad cambiada. Falta aplicar.');
});
$('aura-direction').addEventListener('change', () => {
  saveAuraDraft(currentAuraFormState());
  markAuraDirty(true, 'Dirección cambiada. Falta aplicar.');
});
$('aura-brightness').addEventListener('change', () => {
  saveAuraDraft(currentAuraFormState());
  markAuraDirty(true, 'Brillo cambiado. Falta aplicar.');
});
$('aura-profile-select').addEventListener('change', () => {
  auraProfileSelection = $('aura-profile-select').value;
  $('aura-profile-name').value = auraProfileSelection;
  $('aura-startup').checked = !!(auraState?.apply_on_startup && auraProfileSelection === auraState?.startup_profile);
});

$('aura-setup').addEventListener('click', async () => {
  if (!(await confirmT('confirm.aura_setup'))) return;
  setAuraStatus(t('aura.status_enabling'), 'status-live');
  const res = await window.rog.enableAuraService();
  if (!res.ok) {
    setAuraStatus(t('aura.status_enable_failed', { err: res.err }), 'status-dirty');
    toast(`Aura: ${res.err}`);
    return;
  }
  toast(t('toast.asusd_on'));
  await refreshAuraState(true);
});

$('aura-apply').addEventListener('click', async () => {
  await applyAuraState(currentAuraFormState(), t('aura.applied_ok'));
});

$('aura-save-profile').addEventListener('click', async () => {
  const name = $('aura-profile-name').value.trim() || auraProfileSelection;
  if (!name) { toast(t('toast.write_profile_name')); return; }
  const res = await window.rog.saveAuraProfile({ name, state: currentAuraFormState() });
  if (!res.ok) { toast(`No se guardó: ${res.err}`); return; }
  auraProfileSelection = name;
  $('aura-profile-name').value = name;
  toast(`Perfil "${name}" guardado ✓`);
  await refreshAuraState();
});

function selectAuraProfileByName(name) {
  const profile = auraState?.profiles?.find((p) => p.name === name);
  if (!profile) return null;
  auraProfileSelection = profile.name;
  $('aura-profile-select').value = profile.name;
  $('aura-profile-name').value = profile.name;
  document.querySelectorAll('#aura-profile-list .profile-item').forEach((li) =>
    li.classList.toggle('active', li.dataset.name === name));
  return profile;
}

$('aura-profile-list').addEventListener('click', async (e) => {
  const row = e.target.closest('.profile-item');
  if (!row) return;
  const name = row.dataset.name;
  const action = e.target.closest('[data-act]')?.dataset.act;

  if (action === 'delete') {
    if (!(await confirmT('confirm.delete_profile', { name }))) return;
    const res = await window.rog.deleteAuraProfile(name);
    if (!res.ok) { toast(`No se borró: ${res.err}`); return; }
    if (auraProfileSelection === name) auraProfileSelection = '';
    toast(`Perfil "${name}" borrado`);
    await refreshAuraState(true);
    return;
  }

  const profile = selectAuraProfileByName(name);
  if (!profile) { toast(t('toast.profile_gone')); return; }

  if (action === 'apply') {
    setAuraForm(profile.state);
    markAuraDirty(true, `Perfil "${name}" cargado. Aplicando…`);
    await applyAuraState(profile.state, `Perfil "${name}" aplicado ✓`);
  } else {
    // click on the row body: load into the form (no apply yet)
    setAuraForm(profile.state);
    markAuraDirty(true, `Perfil "${name}" cargado. Falta aplicar.`);
    toast(`Perfil "${name}" cargado en el formulario`);
  }
});

$('aura-startup').addEventListener('change', async (e) => {
  const name = $('aura-profile-select').value;
  if (e.target.checked && !name) {
    e.target.checked = false;
    toast(t('toast.save_select_first'));
    return;
  }
  const res = await window.rog.setAuraStartup({ name, enabled: e.target.checked });
  if (!res.ok) {
    e.target.checked = !e.target.checked;
    toast(`No se pudo: ${res.err}`);
    return;
  }
  toast(res.apply_on_startup ? `Perfil ${name} marcado para inicio` : 'Inicio automático de Aura desactivado');
  await refreshAuraState();
});

$('aura-music').addEventListener('click', async () => {
  if (musicModeActive) {
    const res = await window.rog.setMusicMode({ enabled: false, state: currentAuraFormState() });
  if (!res.ok) { toast(`No se pudo apagar: ${res.err}`); return; }
  musicModeActive = false;
  $('aura-music').textContent = 'MODO MÚSICA';
  markAuraDirty(false);
  toast(t('toast.music_off'));
  await refreshAuraState();
  return;
  }
  const res = await window.rog.setMusicMode({ enabled: true, state: currentAuraFormState() });
  if (!res.ok) { toast(`No se pudo activar: ${res.err}`); return; }
  musicModeActive = true;
  $('aura-music').textContent = 'PARAR MÚSICA';
  markAuraDirty(false);
  toast(t('toast.music_on'));
});

/* ---------- kill process ---------- */

$('procs-body').addEventListener('click', async (e) => {
  const row = e.target.closest('tr[data-pid]');
  if (!row) return;
  const { pid, name } = row.dataset;
  if (!(await confirmT('confirm.kill_proc', { name, pid }))) return;
  const res = await window.rog.killProcess(pid);
  toast(res.ok ? t('proc.kill_sent', { name }) : t('proc.kill_failed', { err: res.err }));
});

/* ---------- fan control center — con selector de perfil (Task 1 / C3) ---------- */

const FAN_NAMES = { cpu: 'CPU', gpu: 'GPU', mid: 'MID (central)' };
const FAN_MAX_DEFAULT = { cpu: 7000, gpu: 6900, mid: 7500 };
// fanCfgByProfile: caché de los 3 perfiles cargados (carga bajo demanda)
let fanCfg = null;          // perfil actualmente en el formulario
let fanActiveProfile = '';  // perfil de energia activo (ppd_profile -> quiet/balanced/performance)
let fanEditingProfile = '';  // perfil que se está editando en el modal
let fanCapDraft = {};       // cap_rpm por ventilador para el perfil en edición
const fanCfgByProfile = {}; // { quiet: res, balanced: res, performance: res }
const fanDirtyProfiles = new Set(); // perfiles con cambios sin guardar (edición multi-perfil)

const FAN_PROFILE_RECOMMENDED_CAP = {
  quiet: 4500,
  balanced: 5500,
  performance: 6500,
};
const FAN_GRAPH = {
  tempMin: 30,
  tempMax: 105,
  x0: 42,
  x1: 520,
  yTop: 36,
  yBottom: 204,
  ticks: [30, 45, 60, 75, 90, 105],
};

localStorage.removeItem('fanMax'); // legado: vivía aquí y nunca era real

function fanName(fan) {
  return FAN_NAMES[fan] || fan.toUpperCase();
}

function normalizeFanProfile(profile) {
  const p = normalizeProfile(profile || '');
  if (p === 'power-saver') return 'quiet';
  if (['quiet', 'balanced', 'performance'].includes(p)) return p;
  return 'quiet';
}

function fanProfileLabel(profile) {
  const p = normalizeFanProfile(profile);
  const key = p === 'quiet' ? 'power-saver' : p;
  return t(PROFILE_KEY[key] || 'profile.power_saver');
}

function fanKeys(cfg = fanCfg) {
  return Object.keys(cfg?.curves || FAN_NAMES);
}

function fanCalibrated(fan) {
  return (fanCfg?.calibration?.[fan] || []).length >= 2;
}

function fanMaxRpm(fan) {
  return fanCfg?.max_rpm?.[fan] || FAN_MAX_DEFAULT[fan] || 6000;
}

// PWM límite para un cap en RPM: interpola la calibración medida (igual que
// el servicio root); sin calibración, regla de tres con el máximo estimado.
function capToPwm(cap, fan) {
  const target = cap * 0.985;
  const pts = (fanCfg?.calibration?.[fan] || [])
    .filter(([p, r]) => r > 0).sort((a, b) => a[0] - b[0]);
  if (pts.length >= 2) {
    if (target >= pts[pts.length - 1][1]) return 255;
    let prev = [0, 0];
    for (const [p, r] of pts) {
      if (r >= target) {
        if (r === prev[1]) return p;
        return Math.round(prev[0] + ((target - prev[1]) / (r - prev[1])) * (p - prev[0]));
      }
      prev = [p, r];
    }
  }
  return Math.min(255, Math.round(target * 255 / fanMaxRpm(fan)));
}

function pwmToRpm(pwm, fan) {
  const pts = (fanCfg?.calibration?.[fan] || [])
    .filter(([p, r]) => r > 0).sort((a, b) => a[0] - b[0]);
  if (pts.length >= 2) {
    if (pwm <= pts[0][0]) return Math.round(pts[0][1] * (pwm / Math.max(1, pts[0][0])));
    let prev = pts[0];
    for (const point of pts.slice(1)) {
      const [p, r] = point;
      if (pwm <= p) {
        const frac = (pwm - prev[0]) / Math.max(1, p - prev[0]);
        return Math.round(prev[1] + frac * (r - prev[1]));
      }
      prev = point;
    }
    return pts[pts.length - 1][1];
  }
  return Math.round((pwm / 255) * fanMaxRpm(fan));
}

function estimateFanDba(fan, rpm) {
  const max = Math.max(1, fanMaxRpm(fan));
  const ratio = Math.max(0, Math.min(1, rpm / max));
  return 24 + 24 * Math.pow(ratio, 2.15);
}

function combinedDba(values) {
  const valid = values.filter((v) => Number.isFinite(v) && v > 0);
  if (!valid.length) return null;
  const power = valid.reduce((sum, db) => sum + Math.pow(10, db / 10), 0);
  return 10 * Math.log10(power);
}

function capMapFromSource(caps, keys = fanKeys()) {
  const out = {};
  for (const fan of keys) {
    const raw = caps?.[fan];
    const cap = Math.round(+raw);
    if (Number.isFinite(cap) && cap >= 2000) out[fan] = cap;
  }
  return out;
}

function capValues(caps = fanCapDraft) {
  return Object.values(caps || {}).filter((v) => Number.isFinite(+v) && +v >= 2000).map((v) => Math.round(+v));
}

function fanCapDisplay(caps = fanCapDraft) {
  const values = capValues(caps);
  if (!values.length) return t('fan.no_cap');
  const unique = [...new Set(values)];
  if (unique.length === 1) return `${unique[0]} RPM`;
  return Object.entries(caps)
    .filter(([, v]) => Number.isFinite(+v) && +v >= 2000)
    .map(([fan, v]) => `${fanName(fan)} ${Math.round(+v)}`)
    .join(' · ');
}

function syncFanCapInput() {
  const input = $('fan-cap');
  if (!input) return;
  const values = capValues();
  const unique = [...new Set(values)];
  input.value = unique.length === 1 ? unique[0] : '';
  input.placeholder = unique.length > 1
    ? t('fan.cap_mixed')
    : t('fan.recommended', { n: FAN_PROFILE_RECOMMENDED_CAP[fanEditingProfile] || 5500 });
}

function updateFanCapPanelText() {
  const label = fanProfileLabel(fanEditingProfile);
  const title = $('fan-cap-title');
  const state = $('fan-cap-state');
  if (title) title.textContent = label;
  if (state) state.textContent = fanCapDisplay();
  if ($('fan-cap-label')) $('fan-cap-label').textContent = label;
}

function renderFanCapEditor() {
  const host = $('fan-cap-per-fan');
  if (!host || !fanCfg) return;
  host.innerHTML = fanKeys().map((fan) => `
    <label>
      <span>${fanName(fan)}</span>
      <input type="number" min="2000" max="8000" step="100" data-fan-cap="${fan}"
        value="${capForFan(fan) || ''}" placeholder="${t('fan.no_cap')}">
    </label>`).join('');
  host.querySelectorAll('[data-fan-cap]').forEach((input) => {
    // Commit en change/blur (no en cada tecla): syncFanCapInput() reescribe el
    // input maestro y un re-render en pleno tecleo borraría parciales. Validamos
    // y clamplamos al confirmar, dejando teclear libremente mientras tanto.
    input.addEventListener('change', () => {
      const fan = input.dataset.fanCap;
      const next = currentCapMap();
      const value = Math.round(+input.value);
      if (Number.isFinite(value) && value >= 2000) next[fan] = value;
      else delete next[fan];
      fanCapDraft = next;
      syncFanCapInput();
      updateFanCapPanelText();
      updateCapPreview({ skipEditor: true });
      markFanDirty();
    });
  });
}

function setFanCapAll(cap) {
  const value = Math.round(+cap);
  fanCapDraft = {};
  if (Number.isFinite(value) && value >= 2000) {
    for (const fan of fanKeys()) fanCapDraft[fan] = value;
  }
  syncFanCapInput();
}

function setFanCapDraft(caps) {
  fanCapDraft = capMapFromSource(caps || {});
  syncFanCapInput();
}

function currentCapMap() {
  return capMapFromSource(fanCapDraft || {});
}

function capForFan(fan) {
  const cap = Math.round(+fanCapDraft?.[fan]);
  return Number.isFinite(cap) && cap >= 2000 ? cap : null;
}

function currentCap() {
  const values = capValues();
  if (!values.length) return null;
  return values[0];
}

// La curva guardada queda PRISTINA: el cap se aplica al escribir al hardware.
function updateCapPreview(options = {}) {
  const note = $('fan-cap-preview');
  const caps = currentCapMap();
  const hasCap = Object.keys(caps).length > 0;
  if (!fanCfg) return;
  updateFanCapPanelText();
  if (!options.skipEditor && !$('fan-cap-editor')?.classList.contains('hidden')) {
    renderFanCapEditor();
  }
  if (!hasCap) {
    note.textContent = t('fan.cap_none_note');
    updateFanAcousticNote();
    document.querySelectorAll('.curve-fan').forEach(updateFanCurveCard);
    return;
  }
  const parts = Object.keys(fanCfg.curves).map((fan) => {
    const cap = caps[fan];
    if (!cap) return t('fan.fan_no_cap', { fan: fanName(fan) });
    const pct = Math.round(capToPwm(cap, fan) / 255 * 100);
    return `${fanName(fan)} ${cap} RPM ≤${pct}%`;
  });
  note.textContent =
    t('fan.caps_active_pre') +
    parts.join(' · ') + (Object.keys(fanCfg.curves).some(fanCalibrated)
      ? t('fan.with_calib') : t('fan.estimated_suffix'));
  updateFanAcousticNote();
  document.querySelectorAll('.curve-fan').forEach(updateFanCurveCard);
}

function renderCurves() {
  $('fan-curves').innerHTML = Object.entries(fanCfg.curves).map(([fan, c]) => {
    const maxPwm = Math.max(...c.pwms);
    const maxRpm = pwmToRpm(maxPwm, fan);
    const dba = estimateFanDba(fan, maxRpm);
    return `
      <div class="curve-fan" data-fan="${fan}">
        <div class="fan-curve-head">
          <div>
            <h4>${fanName(fan)}</h4>
            <span>${fanCalibrated(fan) ? t('fan.max_measured') : t('fan.max_estimated')} ${fanMaxRpm(fan)} RPM</span>
          </div>
          <div class="fan-curve-metrics">
            <b class="fan-curve-rpm">${maxRpm} RPM</b>
            <b class="fan-curve-dba">${dba.toFixed(1)} dBA est.</b>
          </div>
        </div>
        <div class="fan-curve-graph">${renderFanCurveSvg(fan, c)}</div>
        <div class="curve-table">
          <span title="A esta temperatura…">°C</span>
          ${c.temps.map((v, i) => `<input type="number" min="0" max="105" data-kind="temps" data-i="${i}" value="${Math.min(105, v)}">`).join('')}
          <span title="…el ventilador gira a este porcentaje de su máximo">% vel</span>
          ${c.pwms.map((v, i) => `<input type="number" min="0" max="100" data-kind="pwms" data-i="${i}" value="${Math.round(v / 255 * 100)}">`).join('')}
        </div>
      </div>`;
  }).join('');
  document.querySelectorAll('.curve-fan input').forEach((input) => {
    input.addEventListener('input', () => {
      updateFanCurveCard(input.closest('.curve-fan'));
      markFanDirty();
    });
  });
  document.querySelectorAll('.curve-fan').forEach(attachFanGraphDrag);
}

function renderFanCurveSvg(fan, curve) {
  const temps = curve.temps || [];
  const pwms = curve.pwms || [];
  const points = temps.map((temp, i) => {
    const x = tempToGraphX(temp);
    const y = pwmToGraphY(pwms[i] || 0);
    return [x, y];
  });
  const poly = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const cap = capForFan(fan);
  const capPct = cap ? Math.min(100, capToPwm(cap, fan) / 255 * 100) : null;
  const capY = capPct === null ? null : FAN_GRAPH.yBottom - capPct / 100 * (FAN_GRAPH.yBottom - FAN_GRAPH.yTop);
  const pointEls = points.map(([x, y], i) =>
    `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" data-i="${i}"></circle>`).join('');
  const tempTicks = FAN_GRAPH.ticks.map((t) => {
    const x = tempToGraphX(t);
    return `<text x="${x}" y="232">${t}</text>`;
  }).join('');
  const speedTicks = [0, 25, 50, 75, 100].map((s) => {
    const y = FAN_GRAPH.yBottom - s / 100 * (FAN_GRAPH.yBottom - FAN_GRAPH.yTop);
    return `<text x="8" y="${y + 4}">${s}</text>`;
  }).join('');
  return `
    <svg viewBox="0 0 560 245" role="img" aria-label="Curva de ventilador ${fanName(fan)}">
      <g class="fan-grid">
        ${[0, 25, 50, 75, 100].map((s) => {
          const y = FAN_GRAPH.yBottom - s / 100 * (FAN_GRAPH.yBottom - FAN_GRAPH.yTop);
          return `<line x1="${FAN_GRAPH.x0}" y1="${y}" x2="${FAN_GRAPH.x1}" y2="${y}"></line>`;
        }).join('')}
        ${FAN_GRAPH.ticks.map((t) => {
          const x = tempToGraphX(t);
          return `<line x1="${x}" y1="${FAN_GRAPH.yTop}" x2="${x}" y2="${FAN_GRAPH.yBottom}"></line>`;
        }).join('')}
      </g>
      ${capY === null ? '' : `<line class="fan-cap-line" x1="${FAN_GRAPH.x0}" y1="${capY.toFixed(1)}" x2="${FAN_GRAPH.x1}" y2="${capY.toFixed(1)}"></line>`}
      <polyline class="fan-curve-line" points="${poly}"></polyline>
      <g class="fan-curve-points">${pointEls}</g>
      <g class="fan-axis">${tempTicks}${speedTicks}<text x="533" y="232">°C</text><text x="8" y="25">%</text></g>
    </svg>`;
}

function tempToGraphX(temp) {
  const t = Math.max(FAN_GRAPH.tempMin, Math.min(FAN_GRAPH.tempMax, Number(temp) || FAN_GRAPH.tempMin));
  return FAN_GRAPH.x0 + ((t - FAN_GRAPH.tempMin) / (FAN_GRAPH.tempMax - FAN_GRAPH.tempMin)) * (FAN_GRAPH.x1 - FAN_GRAPH.x0);
}

function pwmToGraphY(pwm) {
  const p = Math.max(0, Math.min(255, Number(pwm) || 0));
  return FAN_GRAPH.yBottom - (p / 255) * (FAN_GRAPH.yBottom - FAN_GRAPH.yTop);
}

function graphXToTemp(x, pointIndex, tempInputs) {
  const ratio = (x - FAN_GRAPH.x0) / (FAN_GRAPH.x1 - FAN_GRAPH.x0);
  let temp = Math.round(FAN_GRAPH.tempMin + ratio * (FAN_GRAPH.tempMax - FAN_GRAPH.tempMin));
  const prev = pointIndex > 0 ? Math.round(+tempInputs[pointIndex - 1].value) + 1 : FAN_GRAPH.tempMin;
  const next = pointIndex < tempInputs.length - 1 ? Math.round(+tempInputs[pointIndex + 1].value) - 1 : FAN_GRAPH.tempMax;
  return Math.max(prev, Math.min(next, temp));
}

function graphYToPercent(y) {
  const ratio = (FAN_GRAPH.yBottom - y) / (FAN_GRAPH.yBottom - FAN_GRAPH.yTop);
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

// Tooltip singleton para los puntos de las curvas (mismo gesto que el resto de
// la app: pasas el mouse y ves el valor). Muestra "°C / %vel" sobre el punto.
let fanPointTip = null;
function fanTooltipEl() {
  if (!fanPointTip) {
    fanPointTip = document.createElement('div');
    fanPointTip.className = 'fan-curve-tooltip hidden';
    document.body.appendChild(fanPointTip);
  }
  return fanPointTip;
}
function showFanPointTip(clientX, clientY, temp, pct) {
  const el = fanTooltipEl();
  el.textContent = `${temp}°C · ${pct}%`;
  el.style.left = `${clientX}px`;
  el.style.top = `${clientY - 34}px`;
  el.classList.remove('hidden');
}
function hideFanPointTip() {
  if (fanPointTip) fanPointTip.classList.add('hidden');
}

function attachFanGraphDrag(box) {
  const graph = box.querySelector('.fan-curve-graph');
  if (!graph) return;

  // Hover: al pasar el mouse por un punto (sin arrastrar) se ve su valor.
  graph.addEventListener('pointermove', (event) => {
    if (box.classList.contains('dragging')) return;
    const point = event.target.closest('circle[data-i]');
    if (!point) { hideFanPointTip(); return; }
    const i = Number(point.dataset.i);
    const temps = [...box.querySelectorAll('input[data-kind="temps"]')];
    const pwms = [...box.querySelectorAll('input[data-kind="pwms"]')];
    showFanPointTip(event.clientX, event.clientY,
      Math.round(+temps[i].value), Math.round(+pwms[i].value));
  });
  graph.addEventListener('pointerleave', hideFanPointTip);

  graph.addEventListener('pointerdown', (event) => {
    const point = event.target.closest('circle[data-i]');
    if (!point) return;
    event.preventDefault();
    const pointIndex = Number(point.dataset.i);
    const tempInputs = [...box.querySelectorAll('input[data-kind="temps"]')];
    const pwmInputs = [...box.querySelectorAll('input[data-kind="pwms"]')];
    box.classList.add('dragging');

    const move = (moveEvent) => {
      const svg = graph.querySelector('svg');
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = ((moveEvent.clientX - rect.left) / Math.max(1, rect.width)) * 560;
      const y = ((moveEvent.clientY - rect.top) / Math.max(1, rect.height)) * 245;
      tempInputs[pointIndex].value = graphXToTemp(x, pointIndex, tempInputs);
      pwmInputs[pointIndex].value = graphYToPercent(y);
      updateFanCurveCard(box);
      // Tooltip vivo mientras arrastras: ves el °C/% exacto del punto.
      showFanPointTip(moveEvent.clientX, moveEvent.clientY,
        Math.round(+tempInputs[pointIndex].value),
        Math.round(+pwmInputs[pointIndex].value));
      markFanDirty();
    };
    const up = () => {
      box.classList.remove('dragging');
      hideFanPointTip();
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    move(event);
  });
}

// Marca el PERFIL ACTUAL como "con cambios sin aplicar". El aviso sticky lleva
// al botón GUARDAR Y APLICAR, que persiste TODOS los perfiles editados a la vez.
function markFanDirty() {
  if (fanEditingProfile) fanDirtyProfiles.add(fanEditingProfile);
  refreshFanDirtyBanner();
}
function refreshFanDirtyBanner() {
  $('fan-dirty-banner')?.classList.toggle('hidden', fanDirtyProfiles.size === 0);
}
function clearFanDirty() {
  fanDirtyProfiles.clear();
  $('fan-dirty-banner')?.classList.add('hidden');
}

// Guarda en la caché lo que hay AHORA en el formulario (curvas + cap) para el
// perfil en edición, de modo que cambiar de pestaña no pierda lo editado.
function stageCurrentFan() {
  const cached = fanCfgByProfile[fanEditingProfile];
  if (!cached) return;
  cached.curves = readCurvesFromForm();
  cached.cap = currentCapMap();
}

function singleCurveFromBox(box) {
  const curve = { temps: Array(8).fill(0), pwms: Array(8).fill(0) };
  box.querySelectorAll('input').forEach((inp) => {
    const raw = Math.round(+inp.value);
    curve[inp.dataset.kind][+inp.dataset.i] =
      inp.dataset.kind === 'pwms'
        ? Math.round(Math.max(0, Math.min(100, raw)) * 255 / 100)
        : Math.max(0, Math.min(105, raw));
  });
  return curve;
}

function updateFanCurveCard(box) {
  if (!box) return;
  const fan = box.dataset.fan;
  const curve = singleCurveFromBox(box);
  const maxPwm = Math.max(...curve.pwms);
  const maxRpm = pwmToRpm(maxPwm, fan);
  const dba = estimateFanDba(fan, maxRpm);
  const graph = box.querySelector('.fan-curve-graph');
  if (graph) graph.innerHTML = renderFanCurveSvg(fan, curve);
  const rpm = box.querySelector('.fan-curve-rpm');
  const noise = box.querySelector('.fan-curve-dba');
  if (rpm) rpm.textContent = `${maxRpm} RPM`;
  if (noise) noise.textContent = `${dba.toFixed(1)} dBA est.`;
  updateFanAcousticNote();
}

function updateFanAcousticNote() {
  const note = $('fan-acoustic-note');
  if (!note || !fanCfg) return;
  const hasForm = document.querySelectorAll('.curve-fan').length > 0;
  const curves = hasForm ? readCurvesFromForm() : fanCfg.curves;
  const dbas = Object.entries(curves).map(([fan, curve]) => {
    const maxCurvePwm = Math.max(...curve.pwms);
    const cap = capForFan(fan);
    const effectivePwm = cap ? Math.min(maxCurvePwm, capToPwm(cap, fan)) : maxCurvePwm;
    return estimateFanDba(fan, pwmToRpm(effectivePwm, fan));
  });
  const total = combinedDba(dbas);
  note.textContent = total === null
    ? 'Acústica: sin estimación disponible.'
    : `Acústica estimada del perfil editado: ${total.toFixed(1)} dBA. Si el firmware expone un sensor real de ruido, esta lectura puede reemplazar la estimación.`;
}

function readCurvesFromForm() {
  const curves = {};
  document.querySelectorAll('.curve-fan').forEach((box) => {
    const fan = box.dataset.fan;
    curves[fan] = { temps: Array(8).fill(0), pwms: Array(8).fill(0) };
    box.querySelectorAll('input').forEach((inp) => {
      const raw = Math.round(+inp.value);
      curves[fan][inp.dataset.kind][+inp.dataset.i] =
        inp.dataset.kind === 'pwms'
          ? Math.round(Math.max(0, Math.min(100, raw)) * 255 / 100)
          : Math.max(0, Math.min(105, raw));
    });
  });
  return curves;
}

function fanMaxSummary() {
  if (!fanCfg) return '';
  return Object.keys(fanCfg.curves)
    .map((fan) => `${fanName(fan)} ${fanMaxRpm(fan)}`).join(' · ');
}

function refreshFanNotes() {
  const calibrated = Object.keys(fanCfg.curves).some(fanCalibrated);
  const editLabel = fanProfileLabel(fanEditingProfile);
  $('fan-max-note').textContent =
    `Curvas ${fanCfg.source} (perfil ${editLabel}). ` +
    `Máximos ${calibrated ? 'medidos ✓' : 'ESTIMADOS (sin medir)'}: ` +
    `${fanMaxSummary()} RPM · ${Object.keys(fanCfg.curves).length} ventiladores detectados.`;
  $('fan-calib-banner').classList.toggle('hidden', calibrated);
  $('fan-benchmark').classList.toggle('attention', !calibrated);
  updateCapPreview();
}

/* Carga fanCfg para el perfil dado y actualiza el formulario */
async function loadFanProfile(profile) {
  profile = normalizeFanProfile(profile);
  // Usar caché si ya se cargó y no cambió calibración
  let res = fanCfgByProfile[profile];
  if (!res) {
    res = await window.rog.getFanConfig(profile);
    if (!res.ok) { toast(res.err); return false; }
    fanCfgByProfile[profile] = res;
  }
  fanCfg = res;
  fanEditingProfile = profile;
  // Sincronizar etiquetas
  const editLabel = fanProfileLabel(profile);
  $('fan-editing-label').textContent = editLabel;
  if ($('fan-cap-label')) $('fan-cap-label').textContent = editLabel;
  // Indicador si es el perfil activo del sistema
  const isActive = profile === fanActiveProfile;
  const indicator = $('fan-active-indicator');
  if (indicator) indicator.classList.toggle('hidden', !isActive);
  setFanCapDraft(res.cap || {});
  // Resaltar tab activa
  document.querySelectorAll('.fan-ptab').forEach((t) => {
    const tabProfile = t.dataset.pfan;
    t.classList.toggle('active', tabProfile === profile);
  });
  renderCurves();
  refreshFanNotes();
  refreshFanDirtyBanner();   // mantiene el aviso si OTRO perfil sigue con cambios
  return true;
}

/* Abrir el modal de ventiladores: siempre carga los 3 perfiles en caché */
$('fans-block').addEventListener('click', async () => {
  const sysProfile = lastStats?.ppd_profile || lastStats?.asus_profile;
  if (!sysProfile) { toast(t('toast.profile_unknown')); return; }
  fanActiveProfile = normalizeFanProfile(sysProfile);
  $('fan-profile').textContent = fanProfileLabel(fanActiveProfile);
  // Elegir qué perfil mostrar primero: el perfil de energía real, no platform_profile.
  const startProfile = fanActiveProfile;
  // Invalidar caché para asegurar datos frescos al abrir el modal
  Object.keys(fanCfgByProfile).forEach((k) => delete fanCfgByProfile[k]);
  const ok = await loadFanProfile(startProfile);
  if (!ok) return;
  // Mostrar la ruta con ~ en vez del home absoluto (privacidad + repo público).
  if (fanCfg?.path) {
    $('fan-script-path').textContent = String(fanCfg.path)
      .replace(/^\/home\/[^/]+\//, '~/')
      .replace(/^\/root\//, '~/');
  }
  $('fan-modal').classList.remove('hidden');
});

/* Selector de perfil: tabs AHORRO / BALANCED / PERFORMANCE */
$('fan-profile-tabs').addEventListener('click', async (e) => {
  const tab = e.target.closest('.fan-ptab');
  if (!tab) return;
  const profile = tab.dataset.pfan;
  if (profile === fanEditingProfile) return; // ya estamos aquí
  stageCurrentFan();   // no perder lo editado en este perfil al cambiar de pestaña
  await loadFanProfile(profile);
});

$('fan-cap-adjust').addEventListener('click', () => {
  const editor = $('fan-cap-editor');
  const opening = editor.classList.contains('hidden');
  editor.classList.toggle('hidden', !opening);
  if (opening) {
    renderFanCapEditor();
    $('fan-cap')?.focus();
  }
});

$('fan-close').addEventListener('click', () => $('fan-modal').classList.add('hidden'));
$('fan-modal').addEventListener('click', (e) => {
  if (e.target === $('fan-modal')) $('fan-modal').classList.add('hidden');
});

// Aplicamos el cap al CONFIRMAR (change/blur), no en cada tecla: si lo
// aplicáramos en 'input', syncFanCapInput() reescribiría el .value en cada
// pulsación y borraría números parciales (<2000) → imposible teclear "4500".
$('fan-cap').addEventListener('change', () => {
  setFanCapAll($('fan-cap').value);
  updateCapPreview();
  markFanDirty();
});
$('fan-clear-cap').addEventListener('click', () => {
  setFanCapDraft({});
  updateCapPreview();
  markFanDirty();
  toast(t('toast.cap_removed'));
});

// "Ir a guardar": lleva el foco/scroll al botón GUARDAR Y APLICAR (abajo).
$('fan-dirty-jump').addEventListener('click', () => {
  $('fan-save')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('fan-save')?.classList.add('pulse');
  setTimeout(() => $('fan-save')?.classList.remove('pulse'), 1200);
});

$('fan-benchmark').addEventListener('click', async () => {
  if (!(await confirmT('confirm.fan_calibrate'))) return;
  toast(t('toast.calibrating'));
  const res = await window.rog.fanBenchmark();
  if (!res.ok) { toast(`No se pudo: ${res.err}`); return; }
  fanCfg.max_rpm = res.max;
  fanCfg.calibration = res.calibration;
  // Propagar calibración a todos los perfiles en caché
  Object.values(fanCfgByProfile).forEach((c) => {
    c.max_rpm = res.max;
    c.calibration = res.calibration;
  });
  renderCurves();
  refreshFanNotes();
  toast(t('fan.calib_done', { max: fanMaxSummary() }));
});

$('fan-save').addEventListener('click', async () => {
  stageCurrentFan();   // volcar lo que hay en el formulario a la caché del perfil
  // Perfiles a guardar: todos los editados; si no hubo cambios, al menos el actual.
  const profiles = fanDirtyProfiles.size
    ? [...fanDirtyProfiles]
    : [fanEditingProfile];

  // Consentimiento: ventiladores muy lentos en los puntos calientes son peligrosos.
  // Se revisa CADA perfil que se va a guardar (no solo el visible).
  const riskyLabels = [];
  for (const p of profiles) {
    const curves = fanCfgByProfile[p]?.curves || {};
    const caps = fanCfgByProfile[p]?.cap || {};
    const risky = Object.entries(curves).some(([fan, c]) => {
      const limit = caps[fan] ? capToPwm(caps[fan], fan) : 255;
      return Math.min(c.pwms[6], limit) < 150 || Math.min(c.pwms[7], limit) < 150;
    });
    if (risky) riskyLabels.push(fanProfileLabel(p));
  }
  if (riskyLabels.length && !(await confirmT('confirm.fan_risk', { labels: riskyLabels.join(', ') }))) return;

  // Un solo guardado (un solo pkexec) con todos los perfiles editados, cada
  // uno con su propio tope independiente.
  const payload = profiles.map((p) => ({
    profile: p,
    curves: fanCfgByProfile[p]?.curves || {},
    capByFan: fanCfgByProfile[p]?.cap || {},
  }));
  const res = await window.rog.setFanConfigMulti({ profiles: payload });
  if (!res.ok) { toast(`Error: ${res.err}`); return; }

  $('fan-modal').classList.add('hidden');
  clearFanDirty();
  const labels = profiles.map(fanProfileLabel).join(', ');
  toast(res.warn ? res.warn : t('fan.saved_ok', { labels }));
});

/* ---------- config export / import ---------- */

$('config-export').addEventListener('click', async () => {
  const res = await window.rog.exportConfig();
  toast(res.ok
    ? t('config.exported', { path: res.path, items: res.items.join(', ') })
    : (res.err === 'cancelado' ? t('config.export_cancelled') : t('config.export_failed', { err: res.err })));
});

$('config-import').addEventListener('click', async () => {
  if (!(await confirmT('confirm.import_config'))) return;
  const res = await window.rog.importConfig();
  if (!res.ok) {
    toast(res.err === 'cancelado' ? t('config.import_cancelled') : t('config.import_failed', { err: res.err }));
    return;
  }
  toast(t('config.imported', { items: res.items.join(', ') }));
  $('fan-modal').classList.add('hidden');
  await refreshAuraState(true);
});

/* ---------- gaming overlay ---------- */

const overlayPrefs = JSON.parse(localStorage.getItem('overlayPrefs') || 'null')
  || { enabled: false, displayId: null, corner: 'top-center', layout: 'row' };
// qué muestra el overlay (personalizable desde el modal)
overlayPrefs.show = { cpu: true, gpu: true, fans: true, ...(overlayPrefs.show || {}) };
if (!overlayPrefs.layout) overlayPrefs.layout = 'row';
if (!overlayPrefs.corner) overlayPrefs.corner = 'top-center';

function saveOverlayPrefs() {
  try { localStorage.setItem('overlayPrefs', JSON.stringify(overlayPrefs)); } catch (_) {}
}

async function pushOverlay() {
  // El overlay sigue el acento del tema activo.
  overlayPrefs.accent = cssVar('--accent');
  const res = await window.rog.setOverlay(overlayPrefs);
  if (!res.ok) toast(t('toast.overlay_failed'));
}

async function openOverlayModal() {
  const res = await window.rog.listDisplays();
  const sel = $('overlay-display');
  if (res.ok) {
    sel.innerHTML = res.displays.map((d) =>
      `<option value="${d.id}">${d.label}</option>`).join('');
    // default to the primary display the first time
    if (overlayPrefs.displayId == null) {
      overlayPrefs.displayId = (res.displays.find((d) => d.primary) || res.displays[0])?.id ?? null;
    }
    if (overlayPrefs.displayId != null) sel.value = String(overlayPrefs.displayId);
  }
  $('overlay-enabled').checked = !!overlayPrefs.enabled;
  $('overlay-corner').value = overlayPrefs.corner;
  if ($('overlay-layout')) $('overlay-layout').value = overlayPrefs.layout || 'row';
  $('ov-show-cpu').checked = overlayPrefs.show.cpu !== false;
  $('ov-show-gpu').checked = overlayPrefs.show.gpu !== false;
  $('ov-show-fans').checked = overlayPrefs.show.fans !== false;
  const fps = await window.rog.getFpsLogging();
  $('fps-logging').checked = !!fps.enabled;
  $('fps-logging').disabled = !fps.mangohud;
  if (!fps.mangohud) {
    $('fps-note').textContent = 'MangoHud no está instalado, así que no hay FPS disponibles.';
  }
  $('overlay-modal').classList.remove('hidden');
}

$('overlay-btn').addEventListener('click', openOverlayModal);
$('overlay-close').addEventListener('click', () => $('overlay-modal').classList.add('hidden'));
$('overlay-modal').addEventListener('click', (e) => {
  if (e.target === $('overlay-modal')) $('overlay-modal').classList.add('hidden');
});
$('overlay-enabled').addEventListener('change', (e) => {
  overlayPrefs.enabled = e.target.checked;
  saveOverlayPrefs();
  pushOverlay();
});
$('overlay-display').addEventListener('change', (e) => {
  overlayPrefs.displayId = Number(e.target.value);
  saveOverlayPrefs();
  pushOverlay();
});
$('overlay-corner').addEventListener('change', (e) => {
  overlayPrefs.corner = e.target.value;
  saveOverlayPrefs();
  pushOverlay();
});
$('overlay-layout').addEventListener('change', (e) => {
  overlayPrefs.layout = e.target.value;
  saveOverlayPrefs();
  pushOverlay();
});
['cpu', 'gpu', 'fans'].forEach((part) => {
  $(`ov-show-${part}`).addEventListener('change', (e) => {
    overlayPrefs.show[part] = e.target.checked;
    saveOverlayPrefs();
    pushOverlay();
  });
});
$('fps-logging').addEventListener('change', async (e) => {
  const res = await window.rog.setFpsLogging(e.target.checked);
  if (!res.ok) {
    e.target.checked = !e.target.checked;
    toast(`FPS: ${res.err}`);
    return;
  }
  toast(res.enabled
    ? 'Registro de FPS activado: lanza el juego con MangoHud y el overlay los mostrará.'
    : 'Registro de FPS desactivado.');
});

// restore the overlay on launch if it was on
if (overlayPrefs.enabled) {
  window.addEventListener('DOMContentLoaded', pushOverlay);
  pushOverlay();
}

// game session (v11): game-session.js loads after app.js, so init on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  window.RogGameSession && window.RogGameSession.init();
});

/* ---------- report issue ---------- */

$('report-btn').addEventListener('click', async () => {
  const s = lastStats || {};
  const body = [
    '**Describe el problema:**', '', '_(escribe aquí)_', '',
    '---', '**Información del sistema (autogenerada):**',
    `- ROG Monitor: v${s.version || '?'}`,
    `- CPU: ${s.cpu?.model || '?'}`,
    `- GPU: ${s.gpu?.active?.name || 'N/A'} (modo ${s.gpu?.mode || '?'})`,
    `- Perfil: ${s.asus_profile || '?'} / ${s.ppd_profile || '?'}`,
  ].join('\n');
  const res = await window.rog.reportIssue(body);
  toast(res.ok
    ? `Abriendo GitHub para crear el issue… TXT local: ${res.logPath || 'generado'}`
    : `No se pudo: ${res.err}`);
});

/* ---------- RAM detail ---------- */

$('ram-meter').addEventListener('click', () => {
  const procs = lastStats?.procs_mem || [];
  $('ram-procs-body').innerHTML = procs.map((p) => `
    <tr data-pid="${p.pid}" data-name="${p.name}" title="Clic para cerrar ${p.name}">
      <td class="pid">${p.pid}</td><td>${p.name}</td>
      <td class="mem">${(p.mem_mb / 1024).toFixed(2)} GB</td></tr>`).join('');
  $('ram-modal').classList.remove('hidden');
});
$('ram-close').addEventListener('click', () => $('ram-modal').classList.add('hidden'));
$('ram-modal').addEventListener('click', (e) => {
  if (e.target === $('ram-modal')) $('ram-modal').classList.add('hidden');
});
$('ram-procs-body').addEventListener('click', async (e) => {
  const row = e.target.closest('tr[data-pid]');
  if (!row) return;
  const { pid, name } = row.dataset;
  if (!(await confirmT('confirm.kill_proc_short', { name, pid }))) return;
  const res = await window.rog.killProcess(pid);
  toast(res.ok ? t('proc.kill_sent', { name }) : t('proc.kill_failed', { err: res.err }));
});

/* ---------- VRAM detail ---------- */

function openVramModal() {
  const info = lastStats?.procs_vram || {};
  const procs = info.procs || [];
  const note = $('vram-procs-note');
  note.textContent = info.available === false
    ? (info.reason || t('modal.vram_none'))
    : t('modal.vram_sub');
  $('vram-procs-body').innerHTML = procs.length
    ? procs.map((p) => `
      <tr data-pid="${p.pid}" data-name="${p.name}" title="${t('procs.kill', { name: p.name })}">
        <td class="pid">${p.pid}</td><td>${p.name}</td>
        <td class="mem r">${fmtMb(p.vram_mb)}</td>
        <td class="r">${p.type || '—'}</td></tr>`).join('')
    : `<tr><td colspan="4" class="dim">${info.reason || t('modal.vram_none')}</td></tr>`;
  $('vram-modal').classList.remove('hidden');
}

$('vram-meter')?.addEventListener('click', openVramModal);
$('gpu-vram-stat')?.addEventListener('click', openVramModal);
$('vram-close').addEventListener('click', () => $('vram-modal').classList.add('hidden'));
$('vram-modal').addEventListener('click', (e) => {
  if (e.target === $('vram-modal')) $('vram-modal').classList.add('hidden');
});
$('vram-procs-body').addEventListener('click', async (e) => {
  const row = e.target.closest('tr[data-pid]');
  if (!row) return;
  const { pid, name } = row.dataset;
  if (!(await confirmT('confirm.kill_proc_short', { name, pid }))) return;
  const res = await window.rog.killProcess(pid);
  toast(res.ok ? t('proc.kill_sent', { name }) : t('proc.kill_failed', { err: res.err }));
});

/* ---------- disk health ---------- */

$('disk-health-btn').addEventListener('click', async () => {
  toast(t('toast.reading_smart'));
  const res = await window.rog.diskHealth();
  const out = $('disk-health-out');
  if (!res.ok) { toast(`No se pudo: ${res.err}`); return; }
  out.innerHTML = res.disks.map((d) =>
    `<b>${d.device}</b><br>${d.info.join('<br>') || 'sin datos SMART'}`).join('<br><br>');
  out.classList.remove('hidden');
});

/* ---------- draggable modals ---------- */

// Arrastra la tarjeta del modal desde su título — útil para correr la
// ventana del benchmark y ver los sensores debajo mientras trabaja.
function makeDraggable(modalId) {
  const modal = $(modalId);
  const card = modal.querySelector('.modal-card');
  const handle = card.querySelector('h3');
  handle.classList.add('drag-handle');
  let startX = 0, startY = 0, baseLeft = 0, baseTop = 0;
  const onMove = (e) => {
    card.style.left = `${baseLeft + e.clientX - startX}px`;
    card.style.top = `${baseTop + e.clientY - startY}px`;
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  handle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const rect = card.getBoundingClientRect();
    card.classList.add('dragged');
    card.style.left = `${rect.left}px`;
    card.style.top = `${rect.top}px`;
    baseLeft = rect.left; baseTop = rect.top;
    startX = e.clientX; startY = e.clientY;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
  });
  // al cerrar/reabrir vuelve centrado
  const observer = new MutationObserver(() => {
    if (modal.classList.contains('hidden')) {
      card.classList.remove('dragged');
      card.style.left = card.style.top = '';
    }
  });
  observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
}

['benchmark-modal', 'fan-modal', 'alerts-modal', 'overlay-modal'].forEach(makeDraggable);

/* ---------- thermal benchmarks ---------- */

function openBenchmarkModal() {
  $('benchmark-modal').classList.remove('hidden');
}

function closeBenchmarkModal() {
  $('benchmark-modal').classList.add('hidden');
}

async function runBenchmark(kind) {
  if (benchBusy) return;
  if (!(await confirmT(kind === 'cpu' ? 'confirm.bench_cpu' : 'confirm.bench_gpu'))) return;
  benchBusy = true;
  $('bench-status').textContent = t('bench.running', { kind: kind.toUpperCase() });
  $('bench-output').textContent = t('bench.sampling');
  const res = kind === 'cpu'
    ? await window.rog.cpuBenchmark(45)
    : await window.rog.gpuBenchmark(45);
  benchBusy = false;
  benchmarkResult = res;
  $('bench-status').textContent = res.ok
    ? t('bench.done_kind', { kind: kind.toUpperCase() })
    : t('bench.unavailable_kind', { kind: kind.toUpperCase() });
  $('bench-output').textContent = benchmarkSummaryText(res);
  if (res.ok) {
    pushBenchmarkHistory(res);
    toast(t('bench.done_toast', { kind: kind.toUpperCase() }));
  } else {
    toast(res.err || t('bench.failed_toast', { kind: kind.toUpperCase() }));
  }
}

$('benchmark-btn').addEventListener('click', openBenchmarkModal);
$('bench-run-cpu-quick').addEventListener('click', () => {
  openBenchmarkModal();
  runBenchmark('cpu');
});
$('bench-run-gpu-quick').addEventListener('click', () => {
  openBenchmarkModal();
  runBenchmark('gpu');
});
$('benchmark-close').addEventListener('click', closeBenchmarkModal);
$('benchmark-modal').addEventListener('click', (e) => {
  if (e.target === $('benchmark-modal')) closeBenchmarkModal();
});
$('bench-cpu').addEventListener('click', () => runBenchmark('cpu'));
$('bench-gpu').addEventListener('click', () => runBenchmark('gpu'));
$('bench-export').addEventListener('click', async () => {
  if (!benchmarkResult) { toast(t('toast.no_bench_export')); return; }
  const text = JSON.stringify(benchmarkResult, null, 2);
  const res = await window.rog.exportBenchmark({ kind: benchmarkResult.kind, text });
  toast(res.ok ? t('bench.exported', { path: res.path }) : t('bench.export_failed', { err: res.err }));
});

/* ---------- size / zoom persistence ---------- */

const savedZoom = parseFloat(localStorage.getItem('zoomLevel') || '0');
if (savedZoom) window.rog.zoomTo(savedZoom);
document.querySelectorAll('#size-seg button').forEach((btn) => {
  btn.addEventListener('click', () => {
    window.rog.zoomTo(parseFloat(btn.dataset.zoom));
    toast(t('toast.size_applied'));
  });
});

/* ---------- sesión de juego integrada en bench-block (Task 4) ---------- */
// game-session.js añade su botón a la topbar (#game-session-btn). Ocultamos ese
// botón sobrante via CSS (extras.css) y re-exponemos la función desde el bloque
// de Benchmarks (#bench-game-session-btn, en index.html).
(function wireBenchGameSessionBtn() {
  function tryWire() {
    const btn = document.getElementById('bench-game-session-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      // Delegar al botón original de game-session.js (display:none pero funcional).
      // Esto asegura que la lógica interna de game-session.js (crear modal, render,
      // estado de la sesión) se ejecuta correctamente.
      const topBtn = document.getElementById('game-session-btn');
      if (topBtn) {
        topBtn.click();
      } else {
        // Si el botón aún no fue inyectado, abrir el modal directamente
        const gsModal = document.getElementById('game-session-modal');
        if (gsModal) gsModal.classList.remove('hidden');
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryWire);
  } else {
    tryWire();
  }
})();

/* ---------- enlace NÚCLEOS dentro del panel de procesos ---------- */
// El botón #procs-cores-btn (en el h2 del bloque procs) abre el modal de núcleos.
// Esto evita tener un botón suelto extra en la topbar: la conciencia por núcleo
// vive dentro del contexto de Procesos, que es donde tiene sentido (Task 3+4).
(function wireProcsCoreBtns() {
  function tryWire() {
    const btn = document.getElementById('procs-cores-btn');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // cores.js expone window.RogCores.open() cuando está listo
      if (window.RogCores && typeof window.RogCores.open === 'function') {
        window.RogCores.open();
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryWire);
  } else {
    tryWire();
  }
})();

/* ---------- ordenar la tabla #procs (top-5) al clic en su cabecera ---------- */
(function wireProcsSort() {
  document.querySelectorAll('#procs th.sortable').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (procsSortKey === key) {
        procsSortDir = procsSortDir === 'desc' ? 'asc' : 'desc';
      } else {
        procsSortKey = key;
        procsSortDir = key === 'name' ? 'asc' : 'desc';
      }
      if (lastStats) update(lastStats);
    });
  });
})();

/* ---------- VER TODOS los procesos (modal ampliado) ---------- */
(function wireAllProcs() {
  const modal = $('allprocs-modal');
  if (!modal) return;
  const body = $('allprocs-body');
  const filterEl = $('allprocs-filter');
  const countEl = $('allprocs-count');
  let allRows = [];
  let timer = null;
  let sortKey = 'cpu';   // por defecto: mayor uso de CPU primero
  let sortDir = 'desc';

  function updateSortIndicators() {
    modal.querySelectorAll('#allprocs th.sortable').forEach((th) => {
      const active = th.dataset.sort === sortKey;
      th.classList.toggle('sort-active', active);
      th.dataset.dir = active ? sortDir : '';
    });
  }

  function rowHtml(p) {
    const core = p.cpu_core != null
      ? `<span class="procs-core">${p.cpu_core.toFixed(0)}%</span>`
      : '<span class="dim">—</span>';
    return `<tr data-pid="${p.pid}" data-name="${escapeHtml(p.name)}" title="${t('procs.kill', { name: p.name })}">
        <td class="pid">${p.pid}</td><td class="pname">${escapeHtml(p.name)}</td>
        <td class="cpu r">${p.cpu.toFixed(1)}%</td>
        <td class="cpu-core r">${core}</td>
        <td class="mem r">${p.mem_mb} MB</td></tr>`;
  }

  function render() {
    const q = (filterEl.value || '').trim().toLowerCase();
    let rows = q
      ? allRows.filter((p) => p.name.toLowerCase().includes(q) || String(p.pid).includes(q))
      : allRows;
    rows = sortProcRows(rows, sortKey, sortDir);
    const table = $('allprocs');
    if (table) table.dataset.sortCol = PROC_COL_CLASS[sortKey] || '';
    body.innerHTML = rows.length
      ? rows.map(rowHtml).join('')
      : `<tr><td colspan="5" class="dim">${t('procs.all_none')}</td></tr>`;
    countEl.textContent = t('procs.all_count', { shown: rows.length, total: allRows.length });
    updateSortIndicators();
  }

  async function refresh() {
    const res = await window.rog.listAllProcs();
    if (res && res.ok !== false && Array.isArray(res.procs)) {
      allRows = res.procs;
      render();
    } else if (!allRows.length) {
      body.innerHTML = `<tr><td colspan="5" class="dim">${escapeHtml((res && res.err) || 'sin datos')}</td></tr>`;
    }
  }

  function open() {
    modal.classList.remove('hidden');
    body.innerHTML = `<tr><td colspan="5" class="dim">${t('procs.all_loading')}</td></tr>`;
    countEl.textContent = '';
    refresh();
    // refresco en vivo mientras el modal está abierto (cada 3 s)
    clearInterval(timer);
    timer = setInterval(() => {
      if (!modal.classList.contains('hidden') && !document.hidden) refresh();
    }, 3000);
  }

  function close() {
    modal.classList.add('hidden');
    clearInterval(timer);
    timer = null;
  }

  const btn = $('procs-all-btn');
  if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); open(); });
  $('allprocs-close').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) close();
  });
  filterEl.addEventListener('input', render);

  // Ordenar al hacer clic en la cabecera: 1er clic = mayor→menor (texto: A→Z),
  // 2º clic en la misma columna invierte el sentido.
  modal.querySelectorAll('#allprocs th.sortable').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (sortKey === key) {
        sortDir = sortDir === 'desc' ? 'asc' : 'desc';
      } else {
        sortKey = key;
        sortDir = key === 'name' ? 'asc' : 'desc';
      }
      render();
    });
  });

  body.addEventListener('click', async (e) => {
    const row = e.target.closest('tr[data-pid]');
    if (!row) return;
    const { pid, name } = row.dataset;
    if (!(await confirmT('confirm.kill_proc', { name, pid }))) return;
    const res = await window.rog.killProcess(pid);
    toast(res.ok ? t('proc.kill_sent', { name }) : t('proc.kill_failed', { err: res.err }));
    if (res.ok) { allRows = allRows.filter((p) => String(p.pid) !== String(pid)); render(); }
  });
})();

/* ---------- export events ---------- */

$('export-events').addEventListener('click', async (e) => {
  e.stopPropagation();
  const events = lastStats?.events || [];
  if (!events.length) { toast(t('toast.no_events_export')); return; }
  const today = new Date().toLocaleDateString();
  const text = `ROG Monitor — registro de eventos (${today})\n\n`
    + events.map(([ts, level, msg]) => `${ts}  [${level.toUpperCase()}]  ${msg}`).join('\n') + '\n';
  const res = await window.rog.exportEvents(text);
  toast(res.ok ? t('events.exported', { path: res.path }) : t('events.export_failed', { err: res.err }));
});
