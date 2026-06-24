/* ROG Monitor — panel de discos en vivo + SMART bajo demanda (v18).
 * Reemplaza el bloque <div id="disks"> del bloque sistema con métricas enriquecidas:
 * barra de uso, %, total/usado, temp NVMe, modelo, fstype, tasas I/O.
 * El botón "Salud SMART" per-disco llama window.rog.readSmart (pkexec), muestra
 * spinner, cachea resultado en sesión y presenta: salud, horas, ciclos, desgaste,
 * sectores reasignados, temperatura.
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
        'disks.smart_btn':      'SMART Health',
        'disks.smart_loading':  'Reading SMART…',
        'disks.smart_passed':   'PASSED',
        'disks.smart_failed':   'FAILED',
        'disks.smart_hours':    'Power-on hours',
        'disks.smart_cycles':   'Power cycles',
        'disks.smart_wear':     'Wear',
        'disks.smart_nosmartctl': 'smartmontools not installed or pkexec cancelled.',
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
        'disks.no_data':        '디스크 데이터 없음',
      },
    });
  }

  /* ---- SMART cache: device → parsed result (session-lived) ---- */
  const smartCache = new Map();
  // Track which devices are currently loading (to show spinner, avoid duplicate calls)
  const smartLoading = new Set();

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
      temp_c:       (json.temperature || {}).current  != null ? json.temperature.current : null,
    };
  }

  function fmtMbps(v) {
    if (v == null || v < 0.01) return '0';
    if (v >= 100) return v.toFixed(0);
    if (v >= 10) return v.toFixed(1);
    return v.toFixed(2);
  }

  /* ---- Render SMART result panel below the disk row ---- */
  function renderSmartPanel(device, container) {
    const panelId = `smart-panel-${device.replace(/\//g, '-').replace(/^-/, '')}`;
    let panel = document.getElementById(panelId);
    if (!panel) return; // disk row gone

    if (smartLoading.has(device)) {
      panel.innerHTML = `<span class="disk-smart-loading">${t('disks.smart_loading')}</span>`;
      return;
    }

    const cached = smartCache.get(device);
    if (!cached) return;

    if (!cached.ok) {
      const msg = cached.err && cached.err.toLowerCase().includes('cancel')
        ? t('disks.smart_nosmartctl')
        : `${t('disks.smart_err')}: ${cached.err || '?'}`;
      panel.innerHTML = `<span class="disk-smart-err">${msg}</span>`;
      return;
    }

    const s = parseSmart(cached);
    const passedClass = s.passed ? 'disk-smart-ok' : 'disk-smart-fail';
    const passedLabel = s.passed ? t('disks.smart_passed') : t('disks.smart_failed');
    const na = t('disks.smart_na');

    const rows = [
      [`<span class="${passedClass}">${passedLabel}</span>`, ''],
      [t('disks.smart_hours'),  s.power_on_h   != null ? `${s.power_on_h} h` : na],
      [t('disks.smart_cycles'), s.power_cycles  != null ? s.power_cycles      : na],
    ];
    if (s.percent_used != null) rows.push([t('disks.smart_wear'), `${s.percent_used}%`]);
    if (s.reallocated  != null) rows.push([t('disks.smart_realloc'), s.reallocated]);
    if (s.temp_c       != null) rows.push([t('disks.smart_temp'),  `${s.temp_c}°C`]);

    panel.innerHTML = `<table class="disk-smart-table">${
      rows.map(([k, v]) => `<tr><td class="dsk">${k}</td><td>${v}</td></tr>`).join('')
    }</table>`;
  }

  /* ---- Toggle SMART panel: read on first click, show/hide after ---- */
  function toggleSmart(device, container) {
    const panelId = `smart-panel-${device.replace(/\//g, '-').replace(/^-/, '')}`;
    let panel = document.getElementById(panelId);

    if (!panel) return;
    const wasHidden = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !wasHidden);
    if (!wasHidden) return; // collapsing, no need to fetch

    if (smartCache.has(device)) {
      renderSmartPanel(device, container);
      return;
    }
    if (smartLoading.has(device)) return;

    // First read: fetch from backend via pkexec
    if (!window.rog || typeof window.rog.readSmart !== 'function') {
      smartCache.set(device, { ok: false, err: 'readSmart not available' });
      renderSmartPanel(device, container);
      return;
    }
    smartLoading.add(device);
    renderSmartPanel(device, container); // shows spinner
    window.rog.readSmart(device).then((result) => {
      smartLoading.delete(device);
      smartCache.set(device, result);
      renderSmartPanel(device, container);
    }).catch((err) => {
      smartLoading.delete(device);
      smartCache.set(device, { ok: false, err: String(err && err.message ? err.message : err) });
      renderSmartPanel(device, container);
    });
  }

  /* ---- Main render: called from app.js on each stats tick ---- */
  function renderDisks(disks, nvme_temps) {
    const container = document.getElementById('disks');
    if (!container) return;
    if (!disks || !disks.length) {
      container.innerHTML = `<p class="dim">${t('disks.no_data')}</p>`;
      return;
    }

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
    return `${t('disks.read')} ${r} · ${t('disks.write')} ${w} MB/s`;
  }

  function buildDiskHtml(d, rootTemp) {
    const device = d.block_dev || d.label;
    const panelId = `smart-panel-${device.replace(/\//g, '-').replace(/^-/, '')}`;
    const tempVal = getTempForDisk(d, rootTemp);
    const tempHtml = tempVal != null
      ? `<span class="disk-temp">${t('disks.temp')}: ${tempVal}°C</span>` : '';
    const modelHtml = d.model ? `<span class="disk-model">${d.model}</span>` : '';
    const fstypeHtml = d.fstype ? `<span class="disk-fstype">${d.fstype}</span>` : '';
    const ioHtml = `<span class="disk-io">${buildIoText(d)}</span>`;
    const smartDevArg = device.startsWith('/dev/') ? device : `/dev/${device}`;
    return `
<div class="disk-row" data-device="${device}">
  <div class="disk-header">
    <span class="disk-label">${d.label}</span>
    ${modelHtml}
    ${fstypeHtml}
  </div>
  <div class="disk-bar-track"><div class="disk-bar-fill" style="width:${d.percent}%"></div></div>
  <div class="disk-meta">
    <span class="disk-pct">${d.percent}%</span>
    <span class="disk-usage">${t('disks.used')}: ${d.used_gb.toFixed(0)} ${t('disks.of')} ${d.total_gb.toFixed(0)} G</span>
    ${tempHtml}
    ${ioHtml}
    <button class="ghost disk-smart-btn" data-device="${smartDevArg}">${t('disks.smart_btn')}</button>
  </div>
  <div class="disk-smart-panel hidden" id="${panelId}"></div>
</div>`;
  }

  /* ---- Expose ---- */
  window.disksModule = { render: renderDisks };
}());
