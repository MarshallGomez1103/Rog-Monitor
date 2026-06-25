/* ROG Monitor — Battery health/statistics panel (v18).
 * Renders live battery data into #battery-block each 1-Hz tick.
 * i18n: 8 languages. Registered here (not i18n.js) per task constraints.
 */

(function () {
  'use strict';

  /* ---- i18n registration (do NOT touch i18n.js) ---- */
  if (window.i18n && window.i18n.register) {
    window.i18n.register({
      es: {
        'block.battery':           'Batería',
        'battery.charge':          'Carga',
        'battery.status':          'Estado',
        'battery.watts':           'Watts',
        'battery.health':          'Salud (desgaste)',
        'battery.cycles':          'Ciclos',
        'battery.limit':           'Límite carga',
        'battery.capacity_now':    'Energía actual',
        'battery.capacity_design': 'Diseño',
        'battery.na':              'N/D',
        'battery.no_data':         'Sin datos de batería',
        'battery.on_ac':           'Conectado',
        'battery.on_bat':          'Batería',
      },
      en: {
        'block.battery':           'Battery',
        'battery.charge':          'Charge',
        'battery.status':          'Status',
        'battery.watts':           'Watts',
        'battery.health':          'Health (wear)',
        'battery.cycles':          'Cycles',
        'battery.limit':           'Charge limit',
        'battery.capacity_now':    'Energy now',
        'battery.capacity_design': 'Design',
        'battery.na':              'N/A',
        'battery.no_data':         'No battery data',
        'battery.on_ac':           'Plugged in',
        'battery.on_bat':          'On battery',
      },
      fr: {
        'block.battery':           'Batterie',
        'battery.charge':          'Charge',
        'battery.status':          'État',
        'battery.watts':           'Watts',
        'battery.health':          'Santé (usure)',
        'battery.cycles':          'Cycles',
        'battery.limit':           'Limite de charge',
        'battery.capacity_now':    'Énergie actuelle',
        'battery.capacity_design': 'Conception',
        'battery.na':              'N/D',
        'battery.no_data':         'Aucune donnée de batterie',
        'battery.on_ac':           'Branché',
        'battery.on_bat':          'Sur batterie',
      },
      it: {
        'block.battery':           'Batteria',
        'battery.charge':          'Carica',
        'battery.status':          'Stato',
        'battery.watts':           'Watt',
        'battery.health':          'Salute (usura)',
        'battery.cycles':          'Cicli',
        'battery.limit':           'Limite di carica',
        'battery.capacity_now':    'Energia attuale',
        'battery.capacity_design': 'Progetto',
        'battery.na':              'N/D',
        'battery.no_data':         'Nessun dato batteria',
        'battery.on_ac':           'Collegato',
        'battery.on_bat':          'A batteria',
      },
      pt: {
        'block.battery':           'Bateria',
        'battery.charge':          'Carga',
        'battery.status':          'Estado',
        'battery.watts':           'Watts',
        'battery.health':          'Saúde (desgaste)',
        'battery.cycles':          'Ciclos',
        'battery.limit':           'Limite de carga',
        'battery.capacity_now':    'Energia atual',
        'battery.capacity_design': 'Design',
        'battery.na':              'N/D',
        'battery.no_data':         'Sem dados de bateria',
        'battery.on_ac':           'Ligado',
        'battery.on_bat':          'Na bateria',
      },
      zh: {
        'block.battery':           '电池',
        'battery.charge':          '电量',
        'battery.status':          '状态',
        'battery.watts':           '瓦特',
        'battery.health':          '健康（损耗）',
        'battery.cycles':          '循环次数',
        'battery.limit':           '充电限制',
        'battery.capacity_now':    '当前电量',
        'battery.capacity_design': '设计容量',
        'battery.na':              '不可用',
        'battery.no_data':         '无电池数据',
        'battery.on_ac':           '已插电',
        'battery.on_bat':          '使用电池',
      },
      ja: {
        'block.battery':           'バッテリー',
        'battery.charge':          '充電',
        'battery.status':          '状態',
        'battery.watts':           'ワット',
        'battery.health':          '健康度（劣化）',
        'battery.cycles':          'サイクル数',
        'battery.limit':           '充電制限',
        'battery.capacity_now':    '現在の電力量',
        'battery.capacity_design': '設計容量',
        'battery.na':              'N/A',
        'battery.no_data':         'バッテリーデータなし',
        'battery.on_ac':           '接続中',
        'battery.on_bat':          'バッテリー駆動',
      },
      ko: {
        'block.battery':           '배터리',
        'battery.charge':          '충전',
        'battery.status':          '상태',
        'battery.watts':           '와트',
        'battery.health':          '건강도 (마모)',
        'battery.cycles':          '사이클 수',
        'battery.limit':           '충전 제한',
        'battery.capacity_now':    '현재 에너지',
        'battery.capacity_design': '설계 용량',
        'battery.na':              'N/A',
        'battery.no_data':         '배터리 데이터 없음',
        'battery.on_ac':           '연결됨',
        'battery.on_bat':          '배터리 사용 중',
      },
    });
  }

  /* ---- helpers ---- */
  const $ = (id) => document.getElementById(id);
  const t = (key) => (window.t ? window.t(key) || key : key);
  const na = () => t('battery.na');
  const fmt = (v, suffix = '') => (v != null ? `${v}${suffix}` : na());

  /* health color class */
  function healthClass(pct) {
    if (pct == null) return '';
    if (pct >= 80) return 'bat-health-good';
    if (pct >= 60) return 'bat-health-warn';
    return 'bat-health-crit';
  }

  /* ---- render ---- */
  function render(bat) {
    const block = $('battery-block');
    if (!block) return;

    if (!bat || bat.capacity == null) {
      const nodata = $('bat-no-data');
      if (nodata) nodata.classList.remove('hidden');
      ['bat-charge', 'bat-status', 'bat-watts', 'bat-health',
       'bat-cycles', 'bat-limit', 'bat-cap-now', 'bat-cap-design'].forEach((id) => {
        const el = $(id);
        if (el) el.textContent = na();
      });
      return;
    }

    const nodata = $('bat-no-data');
    if (nodata) nodata.classList.add('hidden');

    // Charge %
    const chargeEl = $('bat-charge');
    if (chargeEl) chargeEl.textContent = fmt(bat.capacity, '%');

    // Status + AC indicator
    const statusEl = $('bat-status');
    if (statusEl) {
      let s = bat.status || na();
      if (bat.on_ac != null) {
        s = bat.on_ac ? t('battery.on_ac') : t('battery.on_bat');
      }
      statusEl.textContent = s;
    }

    // Watts (draw or charge rate)
    const wattsEl = $('bat-watts');
    if (wattsEl) wattsEl.textContent = fmt(bat.watts, ' W');

    // Health %
    const healthEl = $('bat-health');
    if (healthEl) {
      healthEl.textContent = fmt(bat.health_percent, '%');
      healthEl.className = healthClass(bat.health_percent);
    }

    // Cycle count — 0 en sysfs casi siempre = "no reportado por el firmware"
    // (típico en ASUS), no cero real; lo mostramos como N/D con explicación.
    const cyclesEl = $('bat-cycles');
    if (cyclesEl) {
      if (bat.cycle_count) {
        cyclesEl.textContent = bat.cycle_count;
        cyclesEl.removeAttribute('title');
      } else {
        cyclesEl.textContent = na();
        cyclesEl.title = (window.t ? window.t('battery.cycles_unreported') : '');
      }
    }

    // Charge limit
    const limitEl = $('bat-limit');
    if (limitEl) limitEl.textContent = fmt(bat.charge_limit, '%');

    // Current vs design capacity
    const capNowEl = $('bat-cap-now');
    if (capNowEl) capNowEl.textContent = bat.energy_now_wh != null ? `${bat.energy_now_wh} Wh` : na();

    const capDesignEl = $('bat-cap-design');
    if (capDesignEl) {
      const now = bat.energy_full_wh != null ? `${bat.energy_full_wh} Wh` : na();
      const design = bat.energy_full_design_wh != null ? `${bat.energy_full_design_wh} Wh` : na();
      capDesignEl.textContent = `${now} / ${design}`;
    }
  }

  /* ---- public API ---- */
  window.RogBattery = { render };
}());
