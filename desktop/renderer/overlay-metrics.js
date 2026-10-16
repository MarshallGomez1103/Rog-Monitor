/* ROG Monitor — modelo del overlay v2 (S11b): estilo MangoHud, tamaños S/M/L/XL, métricas elegibles.
 * Lógica pura compartida por la ventana del overlay (overlay.js), el editor (overlay-prefs.js /
 * overlay-editor.js) y main (overlay-window.js valida, mangohud-block.js traduce a MangoHud.conf).
 * Solo usa campos que ya existen en el contrato (F2-01); sin dato -> "—", nunca 0 falso (S03).
 * Script clásico: expone window.RogOverlayMetrics y, bajo Node, module.exports. */
(function (root) {
  'use strict';

  // Una fila por componente, una métrica por celda (orden fijo, como MangoHud). Colores de etiqueta
  // fijos por fila, legibles sobre negro (ver contraste en el test).
  const ROWS = [
    { id: 'cpu', label: 'CPU', color: '#4fb3ff', metrics: ['cpu_usage', 'cpu_temp', 'cpu_power', 'cpu_freq'] },
    { id: 'gpu', label: 'GPU', color: '#42d77d', metrics: ['gpu_usage', 'gpu_temp', 'gpu_power', 'gpu_freq'] },
    { id: 'ram', label: 'RAM', color: '#ff85c0', metrics: ['ram'] },
    { id: 'vram', label: 'VRAM', color: '#c4a1ff', metrics: ['vram'] },
    { id: 'fps', label: 'FPS', color: '#ffd84d', metrics: ['fps'] },
    { id: 'fan', label: 'FAN', color: '#4fe3e8', metrics: ['fan'] },
  ];
  const METRICS = ROWS.flatMap((r) => r.metrics);
  const DEFAULT_METRICS = ['cpu_usage', 'cpu_temp', 'cpu_power', 'gpu_usage', 'gpu_temp', 'gpu_power', 'fps', 'fan'];
  const SCALES = { S: 1, M: 1.25, L: 1.5, XL: 2 };
  const SCALE_IDS = Object.keys(SCALES);
  const DEFAULT_SCALE = 'M';

  // Fondo casi negro (85 %), valores blanco puro, unidades claras; niveles de temperatura solo para
  // el valor de temperatura (mismos umbrales que el dashboard).
  const PALETTE = {
    bg: '#000000', bgAlpha: 0.85, value: '#ffffff', unit: '#d0d0d0', profile: '#ffab5c',
    levels: { warn: '#f1c21b', hot: '#ff832b', crit: '#ff6b6b' },
  };
  const DEFAULT_LIMITS = { cpu: [70, 85, 92], gpu: [60, 75, 83] };

  // MangoHud: clave equivalente de cada métrica (no tiene RPM de ventiladores ASUS).
  const MANGO_KEYS = {
    cpu_usage: 'cpu_stats', cpu_temp: 'cpu_temp', cpu_power: 'cpu_power', cpu_freq: 'cpu_mhz',
    gpu_usage: 'gpu_stats', gpu_temp: 'gpu_temp', gpu_power: 'gpu_power', gpu_freq: 'gpu_core_clock',
    ram: 'ram', vram: 'vram', fps: 'fps', fan: null,
  };

  function normalizeMetrics(list) {
    if (!Array.isArray(list)) return DEFAULT_METRICS.slice();
    return METRICS.filter((m) => list.includes(m));
  }

  // Prefs anteriores a S11b guardaban filas enteras (show.cpu/gpu/fans/fps): se parte de los defaults
  // y se quitan las filas que el usuario había apagado.
  function migrateShow(show) {
    const s = show && typeof show === 'object' ? show : {};
    const off = { cpu: s.cpu === false, gpu: s.gpu === false, fan: s.fans === false, fps: s.fps === false };
    return DEFAULT_METRICS.filter((m) => !off[m.split('_')[0]]);
  }

  function normalizeScale(s) {
    return typeof s === 'string' && SCALE_IDS.includes(s) ? s : DEFAULT_SCALE;
  }

  function scaleFactor(s) {
    return SCALES[normalizeScale(s)];
  }

  function fmt(v, d) {
    if (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) return '—';
    return Number(v).toFixed(d || 0);
  }

  function tempLevel(v, stops) {
    if (v == null || !Number.isFinite(Number(v))) return null;
    const [g, y, o] = stops;
    return v < g ? 'ok' : v < y ? 'warn' : v < o ? 'hot' : 'crit';
  }

  const pos = (v) => (Number(v) > 0 ? v : null); // schema 1 manda 0 cuando no hay dato de RAM

  // Valor de cada métrica (sin formatear) + unidad y decimales.
  function reading(m, s) {
    const cpu = s.cpu || {};
    const g = (s.gpu && s.gpu.active) || {};
    switch (m) {
      case 'cpu_usage': return [cpu.usage, '%', 0];
      case 'cpu_temp': return [cpu.avg != null ? cpu.avg : cpu.package, '°C', 0];
      case 'cpu_power': return [s.rapl_available ? s.cpu_watts : null, 'W', 0];
      case 'cpu_freq': return [cpu.freq_ghz, 'GHz', 1];
      case 'gpu_usage': return [g.util, '%', 0];
      case 'gpu_temp': return [g.temp, '°C', 0];
      case 'gpu_power': return [g.power, 'W', 0];
      case 'gpu_freq': return [g.clock_mhz, 'MHz', 0];
      case 'ram': return [pos((s.sys || {}).ram_used_gb), 'GB', 1];
      case 'vram': return [g.vram_used != null ? g.vram_used / 1024 : null, 'GB', 1]; // MiB -> GB (GiB)
      default: return [s.fps, '', 0]; // fps
    }
  }

  // Filas a pintar: solo las que tienen alguna métrica elegida; una celda por métrica.
  function rows(stats, metrics, limits) {
    const s = stats || {};
    const lim = limits || DEFAULT_LIMITS;
    const on = normalizeMetrics(metrics);
    const out = [];
    for (const r of ROWS) {
      const cells = [];
      for (const m of r.metrics.filter((x) => on.includes(x))) {
        if (m === 'fan') {
          const fans = Array.isArray(s.fans) ? s.fans : [];
          if (!fans.length) cells.push({ metric: m, text: '—', unit: 'RPM', level: null, key: '' });
          for (const f of fans) {
            cells.push({ metric: m, text: fmt(f.rpm), unit: 'RPM', level: null,
              key: String(f.label || '').replace('_fan', '').toUpperCase().slice(0, 3) });
          }
          continue;
        }
        const [v, unit, d] = reading(m, s);
        const level = m.endsWith('_temp') ? tempLevel(v, lim[r.id] || DEFAULT_LIMITS[r.id]) : null;
        cells.push({ metric: m, text: fmt(v, d), unit, level });
      }
      if (cells.length) out.push({ id: r.id, label: r.label, color: r.color, cells });
    }
    return out;
  }

  // ---- contraste WCAG 2.x ----
  function rgb(hex) {
    const h = String(hex).replace('#', '');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  function luminance(hex) {
    const [r, g, b] = rgb(hex).map((c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }
  // Color resultante de `fg` con opacidad `alpha` sobre `under` (el fondo del overlay sobre el juego).
  function composite(fg, alpha, under) {
    const f = rgb(fg);
    const u = rgb(under);
    return '#' + f.map((c, i) => Math.round(c * alpha + u[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('');
  }

  function metricKey(m) {
    const kind = m.includes('_') ? m.split('_')[1] : m;
    return `overlay.m_${kind}`;
  }

  const STRINGS = {
    'overlay.m_usage': { es: 'Uso %', en: 'Usage %', fr: 'Utilisation %', it: 'Utilizzo %', pt: 'Uso %', zh: '占用率 %', ja: '使用率 %', ko: '사용률 %' },
    'overlay.m_temp': { es: 'Temperatura', en: 'Temperature', fr: 'Température', it: 'Temperatura', pt: 'Temperatura', zh: '温度', ja: '温度', ko: '온도' },
    'overlay.m_power': { es: 'Vatios (W)', en: 'Watts (W)', fr: 'Watts (W)', it: 'Watt (W)', pt: 'Watts (W)', zh: '功耗 (W)', ja: '消費電力 (W)', ko: '전력 (W)' },
    'overlay.m_freq': { es: 'Frecuencia', en: 'Clock', fr: 'Fréquence', it: 'Frequenza', pt: 'Frequência', zh: '频率', ja: 'クロック', ko: '클럭' },
    'overlay.m_ram': { es: 'RAM usada (GB)', en: 'RAM used (GB)', fr: 'RAM utilisée (Go)', it: 'RAM usata (GB)', pt: 'RAM usada (GB)', zh: '已用内存 (GB)', ja: '使用中の RAM (GB)', ko: '사용 중인 RAM (GB)' },
    'overlay.m_vram': { es: 'VRAM usada (GB)', en: 'VRAM used (GB)', fr: 'VRAM utilisée (Go)', it: 'VRAM usata (GB)', pt: 'VRAM usada (GB)', zh: '已用显存 (GB)', ja: '使用中の VRAM (GB)', ko: '사용 중인 VRAM (GB)' },
    'overlay.m_fps': { es: 'FPS del juego (MangoHud)', en: 'Game FPS (MangoHud)', fr: 'FPS du jeu (MangoHud)', it: 'FPS del gioco (MangoHud)', pt: 'FPS do jogo (MangoHud)', zh: '游戏 FPS（MangoHud）', ja: 'ゲームの FPS（MangoHud）', ko: '게임 FPS (MangoHud)' },
    'overlay.m_fan': { es: 'Ventiladores (RPM)', en: 'Fans (RPM)', fr: 'Ventilateurs (tr/min)', it: 'Ventole (RPM)', pt: 'Ventoinhas (RPM)', zh: '风扇（转速）', ja: 'ファン（回転数）', ko: '팬 (RPM)' },
    'overlay.size': { es: 'Tamaño', en: 'Size', fr: 'Taille', it: 'Dimensione', pt: 'Tamanho', zh: '大小', ja: 'サイズ', ko: '크기' },
    'overlay.size_tip': { es: 'Tamaño {pct} %', en: 'Size {pct}%', fr: 'Taille {pct} %', it: 'Dimensione {pct}%', pt: 'Tamanho {pct}%', zh: '大小 {pct}%', ja: 'サイズ {pct}%', ko: '크기 {pct}%' },
    'overlay.metrics_hint': { es: 'Activa cada dato por separado. Una fila sin datos activos no se muestra; si un dato no está disponible se ve «—».', en: 'Turn each reading on or off on its own. A row with nothing turned on is hidden; a reading that is not available shows "—".', fr: "Activez chaque mesure séparément. Une ligne sans mesure active n'est pas affichée ; une mesure indisponible affiche « — ».", it: 'Attiva ogni dato separatamente. Una riga senza dati attivi non viene mostrata; un dato non disponibile mostra «—».', pt: 'Ativa cada dado em separado. Uma linha sem dados ativos não aparece; um dado indisponível mostra «—».', zh: '每项数据可单独开关。没有开启任何数据的行不显示；无法获取的数据显示“—”。', ja: '各項目を個別にオン/オフできます。オンの項目がない行は表示されません。取得できない値は「—」と表示されます。', ko: '각 항목을 따로 켜고 끌 수 있습니다. 켜진 항목이 없는 줄은 표시되지 않으며, 값을 얻을 수 없으면 "—"로 표시됩니다.' },
    'overlay.fps_logging': { es: 'Registrar FPS con MangoHud (necesario para ver los FPS)', en: 'Log FPS with MangoHud (needed to see FPS)', fr: 'Enregistrer les FPS avec MangoHud (nécessaire pour voir les FPS)', it: 'Registra gli FPS con MangoHud (necessario per vedere gli FPS)', pt: 'Registar FPS com o MangoHud (necessário para ver os FPS)', zh: '用 MangoHud 记录 FPS（显示 FPS 所必需）', ja: 'MangoHud で FPS を記録（FPS の表示に必要）', ko: 'MangoHud로 FPS 기록 (FPS 표시에 필요)' },
  };

  if (root && root.i18n && typeof root.i18n.register === 'function') root.i18n.register(STRINGS);

  const api = {
    ROWS, METRICS, DEFAULT_METRICS, SCALES, SCALE_IDS, DEFAULT_SCALE, PALETTE, DEFAULT_LIMITS, MANGO_KEYS, STRINGS,
    normalizeMetrics, migrateShow, normalizeScale, scaleFactor, fmt, tempLevel, rows, luminance, contrast, composite, metricKey,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RogOverlayMetrics = api;
})(typeof window !== 'undefined' ? window : null);
