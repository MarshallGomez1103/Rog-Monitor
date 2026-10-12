/* ROG Monitor — panel de discos en vivo + SMART bajo demanda (v18).
 * Renderiza en el bloque dedicado "Discos" (#disks-live) con métricas enriquecidas:
 * barra de uso, %, total/usado, temp NVMe, modelo, fstype, tasas I/O.
 * El botón "Salud SMART" per-disco muestra la caché sin root (smart_cached del backend,
 * con edad y aviso de obsoleto) o, si no hay, llama window.rog.readSmart (pkexec) tras el
 * clic; "Actualizar SMART" repite esa lectura. Presenta: salud, horas, ciclos, desgaste,
 * sectores reasignados, errores de medio, temperatura. Los errores traen su motivo.
 */

(function () {
  'use strict';

  /* ---- i18n ---- */
  const t = (key, vars) => {
    if (!window.t) return key;
    const s = window.t(key);
    if (!s || s === key) return key;
    if (!vars) return s;
    return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : `{${k}}`));
  };

  if (window.i18n && window.i18n.register) {
    window.i18n.register({
      es: {
        'disks.title':          'Discos',
        'disks.used':           'usados',
        'disks.of':             'de',
        'disks.model':          'Modelo',
        'disks.fstype':         'Sistema de archivos',
        'disks.temp':           'Temp',
        'disks.read':           'Lectura',
        'disks.write':          'Escritura',
        'disks.busy':           'ocupado',
        'disks.smart_btn':      'Salud SMART',
        'disks.smart_loading':  'Leyendo SMART…',
        'disks.smart_passed':   'APROBADO',
        'disks.smart_failed':   'FALLIDO',
        'disks.smart_hours':    'Horas encendido',
        'disks.smart_cycles':   'Ciclos de encendido',
        'disks.smart_wear':     'Desgaste',
        'disks.smart_realloc':  'Sectores reasignados',
        'disks.smart_temp':     'Temperatura SMART',
        'disks.smart_na':       'No disponible',
        'disks.smart_err':      'Error SMART',
        'disks.smart_nosmartctl': 'smartmontools no instalado o pkexec cancelado.',
        'disks.smart_ago': 'datos de hace {x}',
        'disks.smart_source': 'origen: smartctl vía pkexec',
        'disks.smart_stale': 'OBSOLETO (>24 h)',
        'disks.smart_refresh': 'Actualizar SMART',
        'disks.smart_cancelled': 'Autorización cancelada: no se leyó SMART.',
        'disks.smart_denied': 'Autorización denegada por pkexec.',
        'disks.smart_missing': 'smartctl no está instalado (instala smartmontools).',
        'disks.smart_needs_install': 'Falta instalar la integración de sistema (Mantenimiento → Reinstalar).',
        'disks.smart_media': 'Errores de medio',
        'disks.smart_age_now': 'unos segundos',
        'disks.smart_age_min': '{n} min',
        'disks.smart_age_h': '{n} h',
        'disks.smart_age_d': '{n} d',
        'disks.no_data':        'Sin datos de disco',
      },
      en: {
        'disks.title':          'Disks',
        'disks.used':           'used',
        'disks.of':             'of',
        'disks.model':          'Model',
        'disks.fstype':         'Filesystem',
        'disks.temp':           'Temp',
        'disks.read':           'Read',
        'disks.write':          'Write',
        'disks.busy':           'busy',
        'disks.smart_btn':      'SMART Health',
        'disks.smart_loading':  'Reading SMART…',
        'disks.smart_passed':   'PASSED',
        'disks.smart_failed':   'FAILED',
        'disks.smart_hours':    'Power-on hours',
        'disks.smart_cycles':   'Power cycles',
        'disks.smart_wear':     'Wear',
        'disks.smart_nosmartctl': 'smartmontools not installed or pkexec cancelled.',
        'disks.smart_ago': 'data from {x} ago',
        'disks.smart_source': 'source: smartctl via pkexec',
        'disks.smart_stale': 'STALE (>24 h)',
        'disks.smart_refresh': 'Refresh SMART',
        'disks.smart_cancelled': 'Authorization cancelled: SMART was not read.',
        'disks.smart_denied': 'Authorization denied by pkexec.',
        'disks.smart_missing': 'smartctl is not installed (install smartmontools).',
        'disks.smart_needs_install': 'System integration is not installed (Maintenance → Reinstall).',
        'disks.smart_media': 'Media errors',
        'disks.smart_age_now': 'a few seconds',
        'disks.smart_age_min': '{n} min',
        'disks.smart_age_h': '{n} h',
        'disks.smart_age_d': '{n} d',
        'disks.smart_realloc':  'Reallocated sectors',
        'disks.smart_temp':     'SMART temp',
        'disks.smart_na':       'N/A',
        'disks.smart_err':      'SMART error',
        'disks.no_data':        'No disk data',
      },
      fr: {
        'disks.title':          'Disques',
        'disks.used':           'utilisés',
        'disks.of':             'de',
        'disks.model':          'Modèle',
        'disks.fstype':         'Système de fichiers',
        'disks.temp':           'Temp',
        'disks.read':           'Lecture',
        'disks.write':          'Écriture',
        'disks.busy':           'occupé',
        'disks.smart_btn':      'Santé SMART',
        'disks.smart_loading':  'Lecture SMART…',
        'disks.smart_passed':   'OK',
        'disks.smart_failed':   'ÉCHEC',
        'disks.smart_hours':    'Heures sous tension',
        'disks.smart_cycles':   'Cycles d\'allumage',
        'disks.smart_wear':     'Usure',
        'disks.smart_realloc':  'Secteurs réaffectés',
        'disks.smart_temp':     'Temp SMART',
        'disks.smart_na':       'N/D',
        'disks.smart_err':      'Erreur SMART',
        'disks.smart_nosmartctl': 'smartmontools absent ou pkexec annulé.',
        'disks.smart_ago': 'données d\'il y a {x}',
        'disks.smart_source': 'source : smartctl via pkexec',
        'disks.smart_stale': 'PÉRIMÉ (>24 h)',
        'disks.smart_refresh': 'Actualiser SMART',
        'disks.smart_cancelled': 'Autorisation annulée : SMART non lu.',
        'disks.smart_denied': 'Autorisation refusée par pkexec.',
        'disks.smart_missing': 'smartctl n\'est pas installé (installez smartmontools).',
        'disks.smart_needs_install': 'Intégration système non installée (Maintenance → Réinstaller).',
        'disks.smart_media': 'Erreurs de média',
        'disks.smart_age_now': 'quelques secondes',
        'disks.smart_age_min': '{n} min',
        'disks.smart_age_h': '{n} h',
        'disks.smart_age_d': '{n} j',
        'disks.no_data':        'Pas de données disque',
      },
      it: {
        'disks.title':          'Dischi',
        'disks.used':           'usati',
        'disks.of':             'di',
        'disks.model':          'Modello',
        'disks.fstype':         'File system',
        'disks.temp':           'Temp',
        'disks.read':           'Lettura',
        'disks.write':          'Scrittura',
        'disks.busy':           'occupato',
        'disks.smart_btn':      'Salute SMART',
        'disks.smart_loading':  'Lettura SMART…',
        'disks.smart_passed':   'OK',
        'disks.smart_failed':   'GUASTO',
        'disks.smart_hours':    'Ore di accensione',
        'disks.smart_cycles':   'Cicli di accensione',
        'disks.smart_wear':     'Usura',
        'disks.smart_realloc':  'Settori riallocati',
        'disks.smart_temp':     'Temp SMART',
        'disks.smart_na':       'N/D',
        'disks.smart_err':      'Errore SMART',
        'disks.smart_nosmartctl': 'smartmontools non installato o pkexec annullato.',
        'disks.smart_ago': 'dati di {x} fa',
        'disks.smart_source': 'origine: smartctl tramite pkexec',
        'disks.smart_stale': 'OBSOLETO (>24 h)',
        'disks.smart_refresh': 'Aggiorna SMART',
        'disks.smart_cancelled': 'Autorizzazione annullata: SMART non letto.',
        'disks.smart_denied': 'Autorizzazione negata da pkexec.',
        'disks.smart_missing': 'smartctl non è installato (installa smartmontools).',
        'disks.smart_needs_install': 'Integrazione di sistema non installata (Manutenzione → Reinstalla).',
        'disks.smart_media': 'Errori del supporto',
        'disks.smart_age_now': 'pochi secondi',
        'disks.smart_age_min': '{n} min',
        'disks.smart_age_h': '{n} h',
        'disks.smart_age_d': '{n} g',
        'disks.no_data':        'Nessun dato disco',
      },
      pt: {
        'disks.title':          'Discos',
        'disks.used':           'usados',
        'disks.of':             'de',
        'disks.model':          'Modelo',
        'disks.fstype':         'Sistema de ficheiros',
        'disks.temp':           'Temp',
        'disks.read':           'Leitura',
        'disks.write':          'Escrita',
        'disks.busy':           'ocupado',
        'disks.smart_btn':      'Saúde SMART',
        'disks.smart_loading':  'A ler SMART…',
        'disks.smart_passed':   'OK',
        'disks.smart_failed':   'FALHA',
        'disks.smart_hours':    'Horas ligado',
        'disks.smart_cycles':   'Ciclos de arranque',
        'disks.smart_wear':     'Desgaste',
        'disks.smart_realloc':  'Setores realocados',
        'disks.smart_temp':     'Temp SMART',
        'disks.smart_na':       'N/D',
        'disks.smart_err':      'Erro SMART',
        'disks.smart_nosmartctl': 'smartmontools não instalado ou pkexec cancelado.',
        'disks.smart_ago': 'dados de há {x}',
        'disks.smart_source': 'origem: smartctl via pkexec',
        'disks.smart_stale': 'DESATUALIZADO (>24 h)',
        'disks.smart_refresh': 'Atualizar SMART',
        'disks.smart_cancelled': 'Autorização cancelada: SMART não foi lido.',
        'disks.smart_denied': 'Autorização negada pelo pkexec.',
        'disks.smart_missing': 'smartctl não está instalado (instale smartmontools).',
        'disks.smart_needs_install': 'Integração de sistema não instalada (Manutenção → Reinstalar).',
        'disks.smart_media': 'Erros de mídia',
        'disks.smart_age_now': 'alguns segundos',
        'disks.smart_age_min': '{n} min',
        'disks.smart_age_h': '{n} h',
        'disks.smart_age_d': '{n} d',
        'disks.no_data':        'Sem dados de disco',
      },
      zh: {
        'disks.title':          '磁盘',
        'disks.used':           '已用',
        'disks.of':             '/',
        'disks.model':          '型号',
        'disks.fstype':         '文件系统',
        'disks.temp':           '温度',
        'disks.read':           '读取',
        'disks.write':          '写入',
        'disks.busy':           '繁忙',
        'disks.smart_btn':      'SMART健康',
        'disks.smart_loading':  '读取SMART…',
        'disks.smart_passed':   '通过',
        'disks.smart_failed':   '失败',
        'disks.smart_hours':    '通电时间',
        'disks.smart_cycles':   '通电次数',
        'disks.smart_wear':     '磨损',
        'disks.smart_realloc':  '重分配扇区',
        'disks.smart_temp':     'SMART温度',
        'disks.smart_na':       '不适用',
        'disks.smart_err':      'SMART错误',
        'disks.smart_nosmartctl': 'smartmontools未安装或pkexec已取消。',
        'disks.smart_ago': '{x}前的数据',
        'disks.smart_source': '来源：smartctl（通过 pkexec）',
        'disks.smart_stale': '已过期（>24 小时）',
        'disks.smart_refresh': '刷新SMART',
        'disks.smart_cancelled': '授权已取消：未读取SMART。',
        'disks.smart_denied': 'pkexec拒绝了授权。',
        'disks.smart_missing': '未安装smartctl（请安装smartmontools）。',
        'disks.smart_needs_install': '未安装系统集成（维护 → 重新安装）。',
        'disks.smart_media': '介质错误',
        'disks.smart_age_now': '几秒',
        'disks.smart_age_min': '{n}分钟',
        'disks.smart_age_h': '{n}小时',
        'disks.smart_age_d': '{n}天',
        'disks.no_data':        '无磁盘数据',
      },
      ja: {
        'disks.title':          'ディスク',
        'disks.used':           '使用済み',
        'disks.of':             '/',
        'disks.model':          'モデル',
        'disks.fstype':         'ファイルシステム',
        'disks.temp':           '温度',
        'disks.read':           '読み込み',
        'disks.write':          '書き込み',
        'disks.busy':           'ビジー',
        'disks.smart_btn':      'SMART健全性',
        'disks.smart_loading':  'SMARTを読み込み中…',
        'disks.smart_passed':   '合格',
        'disks.smart_failed':   '不合格',
        'disks.smart_hours':    '通電時間',
        'disks.smart_cycles':   '起動回数',
        'disks.smart_wear':     '消耗',
        'disks.smart_realloc':  '再割り当てセクタ',
        'disks.smart_temp':     'SMART温度',
        'disks.smart_na':       'N/A',
        'disks.smart_err':      'SMARTエラー',
        'disks.smart_nosmartctl': 'smartmontools未インストールまたはpkexecキャンセル済み。',
        'disks.smart_ago': '{x}前のデータ',
        'disks.smart_source': '取得元: pkexec経由のsmartctl',
        'disks.smart_stale': '古いデータ（24時間超）',
        'disks.smart_refresh': 'SMARTを更新',
        'disks.smart_cancelled': '認証がキャンセルされました。SMARTは読み取られていません。',
        'disks.smart_denied': 'pkexecにより認証が拒否されました。',
        'disks.smart_missing': 'smartctlがインストールされていません（smartmontoolsを導入してください）。',
        'disks.smart_needs_install': 'システム統合が未インストールです（メンテナンス → 再インストール）。',
        'disks.smart_media': 'メディアエラー',
        'disks.smart_age_now': '数秒',
        'disks.smart_age_min': '{n}分',
        'disks.smart_age_h': '{n}時間',
        'disks.smart_age_d': '{n}日',
        'disks.no_data':        'ディスクデータなし',
      },
      ko: {
        'disks.title':          '디스크',
        'disks.used':           '사용됨',
        'disks.of':             '/',
        'disks.model':          '모델',
        'disks.fstype':         '파일 시스템',
        'disks.temp':           '온도',
        'disks.read':           '읽기',
        'disks.write':          '쓰기',
        'disks.busy':           '사용 중',
        'disks.smart_btn':      'SMART 상태',
        'disks.smart_loading':  'SMART 읽는 중…',
        'disks.smart_passed':   '정상',
        'disks.smart_failed':   '불량',
        'disks.smart_hours':    '사용 시간',
        'disks.smart_cycles':   '전원 켠 횟수',
        'disks.smart_wear':     '마모',
        'disks.smart_realloc':  '재할당된 섹터',
        'disks.smart_temp':     'SMART 온도',
        'disks.smart_na':       'N/A',
        'disks.smart_err':      'SMART 오류',
        'disks.smart_nosmartctl': 'smartmontools 미설치 또는 pkexec 취소됨.',
        'disks.smart_ago': '{x} 전 데이터',
        'disks.smart_source': '출처: pkexec를 통한 smartctl',
        'disks.smart_stale': '오래됨 (24시간 초과)',
        'disks.smart_refresh': 'SMART 새로고침',
        'disks.smart_cancelled': '인증이 취소되어 SMART를 읽지 않았습니다.',
        'disks.smart_denied': 'pkexec가 인증을 거부했습니다.',
        'disks.smart_missing': 'smartctl이 설치되어 있지 않습니다 (smartmontools 설치).',
        'disks.smart_needs_install': '시스템 통합이 설치되지 않았습니다 (유지보수 → 재설치).',
        'disks.smart_media': '미디어 오류',
        'disks.smart_age_now': '몇 초',
        'disks.smart_age_min': '{n}분',
        'disks.smart_age_h': '{n}시간',
        'disks.smart_age_d': '{n}일',
        'disks.no_data':        '디스크 데이터 없음',
      },
    });
  }

  /* ---- Estado SMART por dispositivo ----
   * smartCache: última lectura fresca (pkexec) de ESTA sesión; smartErr: motivo del último
   * intento fallido; diskInfo: última fila del backend (trae smart_cached = caché sin root,
   * que dejó una lectura anterior de la app). Leer SMART fresco SIEMPRE lo inicia el usuario. */
  const smartCache = new Map();
  const smartErr = new Map();
  const diskInfo = new Map();
  const smartLoading = new Set();
  const SMART_STALE_S = 24 * 3600;

  /* ---- Parse smartctl -j output into a compact summary ---- */
  function parseSmart(json) {
    const nvmeLog = json.nvme_smart_health_information_log || {};
    const ataAttrs = {};
    ((json.ata_smart_attributes || {}).table || []).forEach((a) => {
      if (a.name && a.raw != null) ataAttrs[a.name] = a.raw.value;
    });

    const status = json.smart_status || {};
    return {
      passed:       !!status.passed,
      power_on_h:   nvmeLog.power_on_hours    != null ? nvmeLog.power_on_hours    : ataAttrs['Power_On_Hours'],
      power_cycles: nvmeLog.power_cycles       != null ? nvmeLog.power_cycles       : ataAttrs['Power_Cycle_Count'],
      percent_used: nvmeLog.percentage_used    != null ? nvmeLog.percentage_used    : null,
      reallocated:  ataAttrs['Reallocated_Sector_Ct'] != null ? ataAttrs['Reallocated_Sector_Ct'] : null,
      media_errors: nvmeLog.media_errors != null ? nvmeLog.media_errors : null,
      temp_c:       (json.temperature || {}).current  != null ? json.temperature.current : null,
    };
  }

  function fmtMbps(v) {
    if (v == null || v < 0.01) return '0';
    if (v >= 100) return v.toFixed(0);
    if (v >= 10) return v.toFixed(1);
    return v.toFixed(2);
  }

  const panelIdFor = (device) => `smart-panel-${device.replace(/\//g, '-').replace(/^-/, '')}`;

  function fmtAge(s) {
    if (s < 60) return t('disks.smart_age_now');
    if (s < 3600) return t('disks.smart_age_min', { n: Math.floor(s / 60) });
    if (s < 86400) return t('disks.smart_age_h', { n: Math.floor(s / 3600) });
    return t('disks.smart_age_d', { n: Math.floor(s / 86400) });
  }

  /* Lo que se muestra: lectura fresca de la sesión, si no la caché del backend, si no null. */
  function smartView(device) {
    const fresh = smartCache.get(device);
    if (fresh && fresh.ok) {
      return { s: parseSmart(fresh), ts: fresh.rog_ts_epoch || Math.floor(Date.now() / 1000), cached: false };
    }
    const c = (diskInfo.get(device) || {}).smart_cached;
    if (c && c.ok && c.ts_epoch != null) {
      return {
        s: {
          passed: c.health_passed === true, power_on_h: c.power_on_hours, power_cycles: null,
          percent_used: c.percentage_used, reallocated: null, media_errors: c.media_errors,
          temp_c: c.temp_c,
        },
        ts: c.ts_epoch, cached: true,
      };
    }
    return null;
  }

  function errMessage(e) {
    switch (e.reason) {
      case 'cancelled':     return t('disks.smart_cancelled');
      case 'denied':        return t('disks.smart_denied');
      case 'no_smartctl':   return t('disks.smart_missing');
      case 'needs_install': return t('disks.smart_needs_install');
      case 'empty':         return t('disks.smart_nosmartctl');
      default:              return `${t('disks.smart_err')}: ${e.err || '?'}`;
    }
  }

  /* "datos de hace 2 h (origen: smartctl vía pkexec)" + insignia si pasó de 24 h */
  function ageLabel(ts) {
    const age = Math.max(0, Date.now() / 1000 - ts);
    const stale = age > SMART_STALE_S
      ? ` <span class="disk-smart-stale">${escapeHtml(t('disks.smart_stale'))}</span>` : '';
    return `${escapeHtml(t('disks.smart_ago', { x: fmtAge(age) }))} (${escapeHtml(t('disks.smart_source'))})${stale}`;
  }

  /* ---- Render SMART result panel below the disk row ---- */
  function renderSmartPanel(device, container) {
    const panel = document.getElementById(panelIdFor(device));
    if (!panel) return; // disk row gone

    if (smartLoading.has(device)) {
      panel.innerHTML = `<span class="disk-smart-loading">${t('disks.smart_loading')}</span>`;
      return;
    }

    const err = smartErr.get(device);
    const view = smartView(device);
    let html = err ? `<div class="disk-smart-err">${escapeHtml(errMessage(err))}</div>` : '';

    if (view) {
      const s = view.s;
      const passedClass = s.passed ? 'disk-smart-ok' : 'disk-smart-fail';
      const passedLabel = s.passed ? t('disks.smart_passed') : t('disks.smart_failed');
      const na = t('disks.smart_na');
      const rows = [
        [`<span class="${passedClass}">${passedLabel}</span>`, ''],
        [t('disks.smart_hours'), s.power_on_h != null ? `${s.power_on_h} h` : na],
      ];
      if (s.power_cycles != null || !view.cached) rows.push([t('disks.smart_cycles'), s.power_cycles != null ? s.power_cycles : na]);
      if (s.percent_used != null) rows.push([t('disks.smart_wear'), `${s.percent_used}%`]);
      if (s.reallocated  != null) rows.push([t('disks.smart_realloc'), s.reallocated]);
      if (s.media_errors != null) rows.push([t('disks.smart_media'), s.media_errors]);
      if (s.temp_c       != null) rows.push([t('disks.smart_temp'),  `${s.temp_c}°C`]);
      // Transparencia: muestra el comando exacto que produjo estos datos.
      const devArg = device.startsWith('/dev/') ? device : `/dev/${device}`;
      html += `<div class="disk-smart-origin"><span class="disk-smart-age" data-ts="${Number(view.ts)}">${ageLabel(view.ts)}</span></div>` +
        `<code class="cmd-argv" style="margin-bottom:8px">pkexec /usr/local/libexec/rog-monitor/rog-ctl.sh smart-json ${escapeHtml(devArg)}</code>` +
        `<table class="disk-smart-table">${
          rows.map(([k, v]) => `<tr><td class="dsk">${k}</td><td>${escapeHtml(v)}</td></tr>`).join('')
        }</table>`;
    } else if (!err) {
      const cap = (diskInfo.get(device) || {}).smart;
      if (cap && cap.smartctl === false) html += `<div class="dim">${escapeHtml(t('disks.smart_missing'))}</div>`;
    }
    html += `<button class="ghost disk-smart-refresh" data-device="${escapeHtml(device)}">${escapeHtml(t('disks.smart_refresh'))}</button>`;
    panel.innerHTML = html;
    const btn = panel.querySelector('.disk-smart-refresh');
    if (btn) btn.addEventListener('click', () => readSmartNow(device, container));
  }

  /* Lectura fresca vía pkexec: sólo tras un clic del usuario (abrir el panel o "Actualizar"). */
  function readSmartNow(device, container) {
    if (smartLoading.has(device)) return;
    if (!window.rog || typeof window.rog.readSmart !== 'function') {
      smartErr.set(device, { reason: 'unavailable', err: 'readSmart not available' });
      renderSmartPanel(device, container);
      return;
    }
    smartLoading.add(device);
    renderSmartPanel(device, container); // shows spinner
    const devArg = device.startsWith('/dev/') ? device : `/dev/${device}`;
    window.rog.readSmart(devArg).then((result) => {
      smartLoading.delete(device);
      if (result && result.ok) { smartCache.set(device, result); smartErr.delete(device); }
      else smartErr.set(device, { reason: result && result.reason, err: result && result.err });
      renderSmartPanel(device, container);
    }).catch((err) => {
      smartLoading.delete(device);
      smartErr.set(device, { reason: 'ipc', err: String(err && err.message ? err.message : err) });
      renderSmartPanel(device, container);
    });
  }

  /* ---- Toggle SMART panel: muestra la caché si existe; si no, lee al primer clic ---- */
  function toggleSmart(device, container) {
    const panel = document.getElementById(panelIdFor(device));
    if (!panel) return;
    const wasHidden = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !wasHidden);
    if (!wasHidden) return; // collapsing, no need to fetch

    if (smartView(device) || smartErr.has(device) || smartLoading.has(device)) {
      renderSmartPanel(device, container);
      return;
    }
    readSmartNow(device, container); // sin datos previos: el clic del usuario pide la lectura
  }

  /* Cada tick: guarda la fila del backend y, con el panel abierto, refresca la edad
   * (sin reconstruir el panel) o lo redibuja si apareció una caché nueva. */
  function syncSmartPanel(device, container) {
    const panel = document.getElementById(panelIdFor(device));
    if (!panel || panel.classList.contains('hidden') || smartLoading.has(device)) return;
    const view = smartView(device);
    const age = panel.querySelector('.disk-smart-age');
    if (!view || !age || Number(age.dataset.ts) !== Number(view.ts)) {
      if (view || age) renderSmartPanel(device, container);
      return;
    }
    age.innerHTML = ageLabel(view.ts);
  }

  /* ---- Main render: called from app.js on each stats tick ---- */
  function renderDisks(disks, nvme_temps) {
    const container = document.getElementById('disks-live');
    if (!container) return;
    if (!disks || !disks.length) {
      container.innerHTML = `<p class="dim">${t('disks.no_data')}</p>`;
      return;
    }

    disks.forEach((d) => diskInfo.set(d.block_dev || d.label, d));

    // Match NVMe temp to disks on root/home mounts (same heuristic as TUI)
    const rootTemp = nvme_temps && nvme_temps.length ? Math.max(...nvme_temps) : null;

    // Build HTML; preserve existing smart panels (by not wiping innerHTML if devices match)
    const existingDevices = new Set(
      Array.from(container.querySelectorAll('.disk-row')).map((el) => el.dataset.device)
    );
    const newDevices = new Set(disks.map((d) => d.block_dev || d.label));
    const devicesMatch = existingDevices.size === newDevices.size &&
      [...existingDevices].every((d) => newDevices.has(d));

    if (!devicesMatch) {
      // Full rebuild (disk list changed)
      container.innerHTML = disks.map((d) => buildDiskHtml(d, rootTemp)).join('');
      // Wire up SMART buttons
      container.querySelectorAll('.disk-smart-btn').forEach((btn) => {
        btn.addEventListener('click', () => toggleSmart(btn.dataset.device, container));
      });
    } else {
      // Incremental update: only update the live metrics, preserve SMART panels
      disks.forEach((d) => {
        const device = d.block_dev || d.label;
        const row = container.querySelector(`.disk-row[data-device="${CSS.escape(device)}"]`);
        if (!row) return;
        const bar = row.querySelector('.disk-bar-fill');
        if (bar) bar.style.width = `${d.percent}%`;
        const pct = row.querySelector('.disk-pct');
        if (pct) pct.textContent = `${d.percent}%`;
        const usage = row.querySelector('.disk-usage');
        if (usage) usage.textContent = `${t('disks.used')}: ${d.used_gb.toFixed(0)} ${t('disks.of')} ${d.total_gb.toFixed(0)} G`;
        const io = row.querySelector('.disk-io');
        if (io) io.textContent = buildIoText(d);
        const temp = row.querySelector('.disk-temp');
        if (temp) {
          const tempVal = getTempForDisk(d, rootTemp);
          temp.textContent = tempVal != null ? `${t('disks.temp')}: ${tempVal}°C` : '';
        }
        syncSmartPanel(device, container);
      });
    }
  }

  function getTempForDisk(d, rootTemp) {
    if (rootTemp != null && d.mount && ['/var/home', '/home', '/'].includes(d.mount)) {
      return Math.round(rootTemp);
    }
    return null;
  }

  function buildIoText(d) {
    if (d.read_mbps == null && d.write_mbps == null) return '';
    const r = fmtMbps(d.read_mbps);
    const w = fmtMbps(d.write_mbps);
    let txt = `${t('disks.read')} ${r} · ${t('disks.write')} ${w} MB/s`;
    // IOPS y % ocupado (io_ticks): actividad real, distinta de la capacidad usada
    if (d.read_iops != null || d.write_iops != null) {
      txt += ` · ${Math.round((d.read_iops || 0) + (d.write_iops || 0))} IOPS`;
    }
    if (d.busy_pct != null) txt += ` · ${t('disks.busy')} ${Math.round(d.busy_pct)}%`;
    return txt;
  }

  function buildDiskHtml(d, rootTemp) {
    const device = d.block_dev || d.label;
    const panelId = panelIdFor(device);
    const tempVal = getTempForDisk(d, rootTemp);
    const tempHtml = tempVal != null
      ? `<span class="disk-temp">${t('disks.temp')}: ${tempVal}°C</span>` : '';
    const modelHtml = d.model ? `<span class="disk-model">${escapeHtml(d.model)}</span>` : '';
    const fstypeHtml = d.fstype ? `<span class="disk-fstype">${escapeHtml(d.fstype)}</span>` : '';
    const ioHtml = `<span class="disk-io">${buildIoText(d)}</span>`;
    return `
<div class="disk-row" data-device="${escapeHtml(device)}">
  <div class="disk-header">
    <span class="disk-label">${escapeHtml(d.label)}</span>
    ${modelHtml}
    ${fstypeHtml}
  </div>
  <div class="disk-bar-track"><div class="disk-bar-fill" style="width:${Number(d.percent) || 0}%"></div></div>
  <div class="disk-meta">
    <span class="disk-pct">${escapeHtml(d.percent)}%</span>
    <span class="disk-usage">${t('disks.used')}: ${d.used_gb.toFixed(0)} ${t('disks.of')} ${d.total_gb.toFixed(0)} G</span>
    ${tempHtml}
    ${ioHtml}
    <button class="ghost disk-smart-btn" data-device="${escapeHtml(device)}">${t('disks.smart_btn')}</button>
  </div>
  <div class="disk-smart-panel hidden" id="${escapeHtml(panelId)}"></div>
</div>`;
  }

  /* ---- Expose ---- */
  window.disksModule = { render: renderDisks };
}());
