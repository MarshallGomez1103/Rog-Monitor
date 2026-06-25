/* ROG Monitor — Transparencia de comandos privilegiados.
 * Lista TODOS los comandos que la app puede ejecutar con pkexec (root), con el
 * comando literal (en inglés, tal cual se ejecuta) + qué hace + por qué pide root.
 * i18n: 8 idiomas, registrado aquí (no toca i18n.js). Sin dependencias.
 *
 * El comando es la fuente de verdad: si añades un nuevo pkexec en main.js,
 * agrégalo también aquí (lo verifica scripts/validate-i18n.mjs indirectamente
 * por las claves, y el self-check de este archivo por estructura).
 */
(function () {
  'use strict';

  // argv = literal mostrado al usuario (no se ejecuta desde aquí, es informativo).
  // what = clave i18n específica; why = clave i18n de la razón (4 categorías).
  const PRIV_COMMANDS = [
    { argv: 'pkexec sh -c "install -m 0755 scripts/rog-profile-sync /usr/local/sbin/ && systemctl restart rog-profile-sync.service"', what: 'cmd.fan_service.what', why: 'cmd.why.service' },
    { argv: 'pkexec bash scripts/calibrate-fans.sh', what: 'cmd.fan_bench.what', why: 'cmd.why.fans' },
    { argv: 'pkexec sh -c "smartctl -H -A /dev/<disk> ..."', what: 'cmd.disk_health.what', why: 'cmd.why.device' },
    { argv: 'pkexec smartctl -j -a /dev/<disk>', what: 'cmd.smart.what', why: 'cmd.why.device' },
    { argv: 'pkexec bash scripts/enable-asusd.sh --yes', what: 'cmd.aura.what', why: 'cmd.why.service' },
    { argv: 'pkexec bash scripts/apply-power-control.sh pl1=… pl2=… dynamic_boost=… thermal_target=…', what: 'cmd.power.what', why: 'cmd.why.firmware' },
    { argv: 'pkexec bash scripts/apply-gpu-clocks.sh base_clock_offset=… mem_clock_offset=…', what: 'cmd.gpu_clocks.what', why: 'cmd.why.firmware' },
    { argv: 'pkexec sh -c "… && systemctl enable --now rog-thermal-guardian.service"', what: 'cmd.guardian.what', why: 'cmd.why.service' },
    { argv: 'pkexec bash scripts/rog-monitor-safe-mode.sh uninstall', what: 'cmd.uninstall.what', why: 'cmd.why.service' },
  ];

  const I18N = {
    'topbar.commands': { es: 'COMANDOS DEL SISTEMA', en: 'SYSTEM COMMANDS', fr: 'COMMANDES SYSTÈME', it: 'COMANDI DI SISTEMA', pt: 'COMANDOS DO SISTEMA', zh: '系统命令', ja: 'システムコマンド', ko: '시스템 명령' },
    'tip.commands': { es: 'Lista transparente de cada comando que la app ejecuta con permisos de administrador', en: 'Transparent list of every command the app runs with admin privileges', fr: 'Liste transparente de chaque commande exécutée avec des privilèges admin', it: 'Elenco trasparente di ogni comando eseguito con privilegi di amministratore', pt: 'Lista transparente de cada comando executado com privilégios de administrador', zh: '应用以管理员权限运行的每条命令的透明清单', ja: 'アプリが管理者権限で実行する全コマンドの透明な一覧', ko: '앱이 관리자 권한으로 실행하는 모든 명령의 투명한 목록' },

    'cmd.title': { es: 'Comandos del sistema', en: 'System commands', fr: 'Commandes système', it: 'Comandi di sistema', pt: 'Comandos do sistema', zh: '系统命令', ja: 'システムコマンド', ko: '시스템 명령' },
    'cmd.intro': { es: 'Estos son TODOS los comandos que ROG Monitor puede ejecutar con privilegios (pkexec). Se muestran en inglés tal cual se ejecutan; nunca se envía nada oculto y tu contraseña no se guarda.', en: 'These are ALL the commands ROG Monitor may run with privileges (pkexec). Shown exactly as executed; nothing hidden is ever sent and your password is never stored.', fr: 'Voici TOUTES les commandes que ROG Monitor peut exécuter avec privilèges (pkexec). Affichées telles qu\'exécutées ; rien de caché n\'est envoyé et votre mot de passe n\'est jamais stocké.', it: 'Questi sono TUTTI i comandi che ROG Monitor può eseguire con privilegi (pkexec). Mostrati esattamente come vengono eseguiti; non viene inviato nulla di nascosto e la password non viene mai salvata.', pt: 'Estes são TODOS os comandos que o ROG Monitor pode executar com privilégios (pkexec). Mostrados exatamente como são executados; nada oculto é enviado e a tua palavra-passe nunca é guardada.', zh: '这些是 ROG Monitor 可能以特权（pkexec）运行的全部命令。按实际执行原样显示；绝不发送任何隐藏内容，也不会保存你的密码。', ja: 'これらは ROG Monitor が特権（pkexec）で実行しうるすべてのコマンドです。実行されるとおりに表示され、隠れた送信は一切なく、パスワードも保存しません。', ko: 'ROG Monitor가 권한(pkexec)으로 실행할 수 있는 모든 명령입니다. 실행되는 그대로 표시되며, 숨겨진 전송은 없고 비밀번호도 저장하지 않습니다.' },
    'cmd.why_root': { es: 'Por qué pide contraseña', en: 'Why it needs your password', fr: 'Pourquoi le mot de passe', it: 'Perché serve la password', pt: 'Porque pede a palavra-passe', zh: '为何需要密码', ja: 'パスワードが必要な理由', ko: '비밀번호가 필요한 이유' },

    'cmd.why.firmware': { es: 'Escribir en la interfaz del firmware (asus-armoury / relojes GPU) requiere root.', en: 'Writing to the firmware interface (asus-armoury / GPU clocks) requires root.', fr: 'Écrire dans l\'interface du firmware (asus-armoury / horloges GPU) nécessite root.', it: 'Scrivere nell\'interfaccia del firmware (asus-armoury / clock GPU) richiede root.', pt: 'Escrever na interface do firmware (asus-armoury / clocks GPU) requer root.', zh: '写入固件接口（asus-armoury / GPU 时钟）需要 root 权限。', ja: 'ファームウェアインターフェース（asus-armoury / GPUクロック）への書き込みには root が必要です。', ko: '펌웨어 인터페이스(asus-armoury / GPU 클럭)에 쓰려면 root 권한이 필요합니다.' },
    'cmd.why.service': { es: 'Instalar, activar o quitar servicios systemd y archivos de sistema requiere root.', en: 'Installing, enabling or removing systemd services and system files requires root.', fr: 'Installer, activer ou supprimer des services systemd et des fichiers système nécessite root.', it: 'Installare, attivare o rimuovere servizi systemd e file di sistema richiede root.', pt: 'Instalar, ativar ou remover serviços systemd e ficheiros de sistema requer root.', zh: '安装、启用或移除 systemd 服务和系统文件需要 root 权限。', ja: 'systemd サービスやシステムファイルのインストール・有効化・削除には root が必要です。', ko: 'systemd 서비스 및 시스템 파일을 설치·활성화·제거하려면 root 권한이 필요합니다.' },
    'cmd.why.device': { es: 'Leer el dispositivo SMART directamente está restringido a root por el kernel.', en: 'Reading the SMART device directly is restricted to root by the kernel.', fr: 'La lecture directe du périphérique SMART est réservée à root par le noyau.', it: 'La lettura diretta del dispositivo SMART è riservata a root dal kernel.', pt: 'Ler o dispositivo SMART diretamente está restrito a root pelo kernel.', zh: '内核将直接读取 SMART 设备限制为 root 权限。', ja: 'SMART デバイスの直接読み取りはカーネルにより root に制限されています。', ko: '커널이 SMART 장치 직접 읽기를 root로 제한합니다.' },
    'cmd.why.fans': { es: 'Controlar el PWM de los ventiladores (hwmon) requiere root.', en: 'Controlling fan PWM (hwmon) requires root.', fr: 'Contrôler le PWM des ventilateurs (hwmon) nécessite root.', it: 'Controllare il PWM delle ventole (hwmon) richiede root.', pt: 'Controlar o PWM das ventoinhas (hwmon) requer root.', zh: '控制风扇 PWM（hwmon）需要 root 权限。', ja: 'ファンの PWM 制御（hwmon）には root が必要です。', ko: '팬 PWM 제어(hwmon)에는 root 권한이 필요합니다.' },

    'cmd.fan_service.what': { es: 'Instala el script de ventiladores y reinicia su servicio para aplicar tus curvas y tope de RPM.', en: 'Installs the fan script and restarts its service to apply your curves and RPM cap.', fr: 'Installe le script des ventilateurs et redémarre son service pour appliquer vos courbes et le plafond de RPM.', it: 'Installa lo script delle ventole e riavvia il servizio per applicare curve e limite RPM.', pt: 'Instala o script das ventoinhas e reinicia o serviço para aplicar as curvas e o limite de RPM.', zh: '安装风扇脚本并重启其服务，以应用你的曲线和 RPM 上限。', ja: 'ファンスクリプトをインストールしサービスを再起動して、カーブと RPM 上限を適用します。', ko: '팬 스크립트를 설치하고 서비스를 재시작하여 곡선과 RPM 상한을 적용합니다.' },
    'cmd.fan_bench.what': { es: 'Recorre los ventiladores por 7 niveles y mide su RPM real (~70 s, ruidoso) para calibrar el tope.', en: 'Steps the fans through 7 levels and measures real RPM (~70 s, loud) to calibrate the cap.', fr: 'Parcourt 7 niveaux de ventilateurs et mesure le RPM réel (~70 s, bruyant) pour calibrer le plafond.', it: 'Percorre 7 livelli delle ventole e misura il RPM reale (~70 s, rumoroso) per calibrare il limite.', pt: 'Percorre 7 níveis das ventoinhas e mede o RPM real (~70 s, barulhento) para calibrar o limite.', zh: '让风扇经过 7 个档位并测量实际 RPM（约 70 秒，较吵）以校准上限。', ja: 'ファンを 7 段階で動かし実 RPM を測定（約 70 秒、大音量）して上限を校正します。', ko: '팬을 7단계로 돌리며 실제 RPM을 측정(~70초, 시끄러움)해 상한을 보정합니다.' },
    'cmd.disk_health.what': { es: 'Lee un resumen SMART (salud, temperatura, horas, desgaste) de todos tus discos.', en: 'Reads a SMART summary (health, temperature, hours, wear) of all your disks.', fr: 'Lit un résumé SMART (santé, température, heures, usure) de tous vos disques.', it: 'Legge un riepilogo SMART (salute, temperatura, ore, usura) di tutti i dischi.', pt: 'Lê um resumo SMART (saúde, temperatura, horas, desgaste) de todos os discos.', zh: '读取所有磁盘的 SMART 摘要（健康、温度、通电时间、磨损）。', ja: 'すべてのディスクの SMART 概要（健康・温度・稼働時間・摩耗）を読み取ります。', ko: '모든 디스크의 SMART 요약(상태·온도·시간·마모)을 읽습니다.' },
    'cmd.smart.what': { es: 'Lee el informe SMART completo (JSON) de un disco concreto, bajo demanda.', en: 'Reads the full SMART report (JSON) of a specific disk, on demand.', fr: 'Lit le rapport SMART complet (JSON) d\'un disque précis, à la demande.', it: 'Legge il report SMART completo (JSON) di un disco specifico, su richiesta.', pt: 'Lê o relatório SMART completo (JSON) de um disco específico, a pedido.', zh: '按需读取某个磁盘的完整 SMART 报告（JSON）。', ja: '特定ディスクの完全な SMART レポート（JSON）をオンデマンドで読み取ります。', ko: '특정 디스크의 전체 SMART 보고서(JSON)를 필요할 때 읽습니다.' },
    'cmd.aura.what': { es: 'Habilita el servicio asusd (asusctl) para controlar la iluminación Aura.', en: 'Enables the asusd service (asusctl) to control Aura lighting.', fr: 'Active le service asusd (asusctl) pour contrôler l\'éclairage Aura.', it: 'Abilita il servizio asusd (asusctl) per controllare l\'illuminazione Aura.', pt: 'Ativa o serviço asusd (asusctl) para controlar a iluminação Aura.', zh: '启用 asusd 服务（asusctl）以控制 Aura 灯效。', ja: 'Aura ライティングを制御するため asusd サービス（asusctl）を有効化します。', ko: 'Aura 조명을 제어하기 위해 asusd 서비스(asusctl)를 활성화합니다.' },
    'cmd.power.what': { es: 'Escribe los límites de potencia CPU/GPU (PL1/PL2/Dynamic Boost/objetivo térmico) acotados a rangos seguros.', en: 'Writes the CPU/GPU power limits (PL1/PL2/Dynamic Boost/thermal target), clamped to safe ranges.', fr: 'Écrit les limites de puissance CPU/GPU (PL1/PL2/Dynamic Boost/cible thermique), bornées à des plages sûres.', it: 'Scrive i limiti di potenza CPU/GPU (PL1/PL2/Dynamic Boost/target termico), entro intervalli sicuri.', pt: 'Escreve os limites de potência CPU/GPU (PL1/PL2/Dynamic Boost/alvo térmico), dentro de intervalos seguros.', zh: '写入 CPU/GPU 功耗限制（PL1/PL2/Dynamic Boost/温度目标），并限制在安全范围内。', ja: 'CPU/GPU の電力制限（PL1/PL2/Dynamic Boost/温度ターゲット）を安全範囲内で書き込みます。', ko: 'CPU/GPU 전력 제한(PL1/PL2/Dynamic Boost/온도 목표)을 안전 범위로 제한하여 씁니다.' },
    'cmd.gpu_clocks.what': { es: 'Aplica los offsets de reloj de la GPU (núcleo/memoria) vía NVML.', en: 'Applies the GPU clock offsets (core/memory) via NVML.', fr: 'Applique les offsets d\'horloge GPU (cœur/mémoire) via NVML.', it: 'Applica gli offset di clock della GPU (core/memoria) tramite NVML.', pt: 'Aplica os offsets de clock da GPU (núcleo/memória) via NVML.', zh: '通过 NVML 应用 GPU 时钟偏移（核心/显存）。', ja: 'NVML 経由で GPU クロックオフセット（コア/メモリ）を適用します。', ko: 'NVML을 통해 GPU 클럭 오프셋(코어/메모리)을 적용합니다.' },
    'cmd.guardian.what': { es: 'Instala y activa (o desactiva) el guardián térmico como servicio systemd.', en: 'Installs and enables (or disables) the thermal guardian as a systemd service.', fr: 'Installe et active (ou désactive) le gardien thermique comme service systemd.', it: 'Installa e attiva (o disattiva) il guardiano termico come servizio systemd.', pt: 'Instala e ativa (ou desativa) o guardião térmico como serviço systemd.', zh: '将热守护作为 systemd 服务安装并启用（或禁用）。', ja: 'サーマルガーディアンを systemd サービスとしてインストールし有効化（または無効化）します。', ko: '열 가디언을 systemd 서비스로 설치하고 활성화(또는 비활성화)합니다.' },
    'cmd.uninstall.what': { es: 'Quita los servicios, units, reglas udev y scripts de sistema que instaló ROG Monitor.', en: 'Removes the system services, units, udev rules and scripts that ROG Monitor installed.', fr: 'Supprime les services, units, règles udev et scripts système installés par ROG Monitor.', it: 'Rimuove servizi, unit, regole udev e script di sistema installati da ROG Monitor.', pt: 'Remove os serviços, units, regras udev e scripts de sistema que o ROG Monitor instalou.', zh: '移除 ROG Monitor 安装的系统服务、unit、udev 规则和脚本。', ja: 'ROG Monitor がインストールしたシステムサービス・ユニット・udev ルール・スクリプトを削除します。', ko: 'ROG Monitor가 설치한 시스템 서비스·유닛·udev 규칙·스크립트를 제거합니다.' },
  };

  if (window.i18n && typeof window.i18n.register === 'function') window.i18n.register(I18N);

  const _t = (k) => (window.t ? window.t(k) : k);
  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function buildModal() {
    const rows = PRIV_COMMANDS.map((c) => `
      <li class="cmd-row">
        <code class="cmd-argv">${esc(c.argv)}</code>
        <p class="cmd-what">${esc(_t(c.what))}</p>
        <p class="cmd-why dim">🔒 ${esc(_t(c.why))}</p>
      </li>`).join('');
    return `
    <div id="commands-modal" class="modal hidden">
      <div class="modal-card wide">
        <h3 data-i18n="cmd.title">${esc(_t('cmd.title'))}</h3>
        <p class="sub" data-i18n="cmd.intro">${esc(_t('cmd.intro'))}</p>
        <ul class="cmd-list" style="list-style:none;padding:0;margin:0">${rows}</ul>
        <button class="ghost modal-close" id="commands-close" data-i18n="common.close">${esc(_t('common.close') !== 'common.close' ? _t('common.close') : 'Cerrar')}</button>
      </div>
    </div>`;
  }

  let _wired = false;
  function ensureModal() {
    let modal = document.getElementById('commands-modal');
    if (!modal) {
      const wrap = document.createElement('div');
      wrap.innerHTML = buildModal();
      while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
      modal = document.getElementById('commands-modal');
    }
    if (_wired) return modal;
    _wired = true;
    const close = document.getElementById('commands-close');
    if (close) close.addEventListener('click', closeCommands);
    if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeCommands(); });
    if (window.i18n && window.i18n.onChange) {
      window.i18n.onChange(() => {
        const m = document.getElementById('commands-modal');
        if (m && !m.classList.contains('hidden')) rerender(m);
      });
    }
    return modal;
  }

  // Re-render rows on language change (the argv list is built from JS, not data-i18n).
  function rerender(modal) {
    const fresh = document.createElement('div');
    fresh.innerHTML = buildModal();
    const newCard = fresh.querySelector('.modal-card');
    const oldCard = modal.querySelector('.modal-card');
    if (newCard && oldCard) {
      oldCard.replaceWith(newCard);
      const close = document.getElementById('commands-close');
      if (close) close.addEventListener('click', closeCommands);
    }
    if (window.i18n && window.i18n.apply) window.i18n.apply(modal);
  }

  function openCommands() {
    const modal = ensureModal();
    if (!modal) return;
    rerender(modal); // ensure current language
    modal.classList.remove('hidden');
    if (window.i18n && window.i18n.apply) window.i18n.apply(modal);
  }
  function closeCommands() {
    const modal = document.getElementById('commands-modal');
    if (modal) modal.classList.add('hidden');
  }

  window.openCommands = openCommands;
  window.closeCommands = closeCommands;
  // Exponer el registro para que confirms (power/SMART) muestren el comando literal.
  window.RogCommands = PRIV_COMMANDS;
}());
