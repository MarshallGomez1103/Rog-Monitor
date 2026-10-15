/* ROG Monitor — widget-status-view.js  (N-A4-03 / N-A4-04)
   Presentador PURO de estados: formatos que no inventan ceros, estado de la cabecera
   "sensores OK", razones de VRAM por código y vista de ventiladores.

   Regla de oro (N-DEF-02): `null` = la fuente no se pudo leer; `0` es un valor real.
   Nada de este archivo toca el DOM ni el reloj: app.js solo cablea (lee el resultado y
   pinta). Script clásico (patrón UMD de procs-table.js): window.RogStatusView y, bajo
   Node, module.exports para `node --test` sin Electron.

   Acciones: solo explicar / reintentar / enlazar al diagnóstico. 'install' significa
   "explicar qué falta"; nunca instala ni ejecuta nada. */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /*  Números: null/''/NaN/no numérico => sin dato; 0 SÍ es dato         */
  /* ------------------------------------------------------------------ */
  const isNum = (v) => (typeof v === 'number' && Number.isFinite(v)) ||
    (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));
  const isObj = (v) => v != null && typeof v === 'object';

  function fmtNum(v, digits = 0, fallback = '--') {
    return isNum(v) ? Number(v).toFixed(digits) : fallback;
  }

  /* Porcentaje 0-100 o null (sin dato). Para texto. */
  function pctOrNull(v) {
    return isNum(v) ? Math.max(0, Math.min(100, Number(v))) : null;
  }

  /* Porcentaje para BARRAS: sin dato => 0 (la barra vacía + el texto "--" lo aclaran). */
  function clampPct(v) {
    const p = pctOrNull(v);
    return p == null ? 0 : p;
  }

  function fmtPct(v, digits = 0) {
    const p = pctOrNull(v);
    return p == null ? '--' : `${p.toFixed(digits)}%`;
  }

  function fmtDeg(v, digits = 0) {
    return isNum(v) ? `${Number(v).toFixed(digits)}°` : '--';
  }

  function fmtUptime(seconds) {
    if (!isNum(seconds) || Number(seconds) < 0) return '--';
    const total = Math.floor(Number(seconds));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
    return `${minutes}m`;
  }

  /* uptime_s manda; cae a uptime_h; ninguno => null (antes caía a 0 y se veía "0"). */
  function uptimeSeconds(sys) {
    if (!isObj(sys)) return null;
    if (isNum(sys.uptime_s)) return Number(sys.uptime_s);
    if (isNum(sys.uptime_h)) return Number(sys.uptime_h) * 3600;
    return null;
  }

  function fmtNet(sys) {
    const s = isObj(sys) ? sys : {};
    return `↓${fmtNum(s.rx_mbps, 1)} ↑${fmtNum(s.tx_mbps, 1)} Mb/s`;
  }

  function fmtLoad(load) {
    if (!Array.isArray(load) || !load.length) return '--';
    return load.map((l) => fmtNum(l, 2)).join(' ');
  }

  function fmtRam(sys) {
    const s = isObj(sys) ? sys : {};
    return `${fmtNum(s.ram_used_gb, 1)}/${fmtNum(s.ram_total_gb, 0)} GiB`;
  }

  /* Fuente de energía: on_ac null (sin adaptador legible) NO es "batería". */
  function powerSource(bat) {
    const b = isObj(bat) ? bat : {};
    const kind = b.on_ac === true ? 'ac' : (b.on_ac === false ? 'battery' : 'unknown');
    return { kind, pct: isNum(b.capacity) ? Number(b.capacity) : '--' };
  }

  /* Ventilador: rpm null = sin lectura (no PARADO); rpm 0 = parado de verdad. */
  function fanView(fan) {
    const f = isObj(fan) ? fan : {};
    if (!isNum(f.rpm)) return { rpm: '--', pct: fmtPct(f.percent), state: 'nodata' };
    const rpm = Number(f.rpm);
    return { rpm: String(rpm), pct: fmtPct(f.percent), state: rpm === 0 ? 'stopped' : 'spinning' };
  }

  /* ------------------------------------------------------------------ */
  /*  VRAM: procs_vram.reason_code (N-DEF-02 §3) -> estado + clave i18n   */
  /* ------------------------------------------------------------------ */
  const VRAM = {
    warming_up: ['loading', 'vram.warming_up', null],
    no_nvidia: ['unsupported', 'vram.no_nvidia', null],
    dgpu_asleep: ['empty', 'vram.dgpu_asleep', null],
    dgpu_inactive: ['empty', 'vram.dgpu_inactive', null],
    nvml_error: ['error', 'vram.driver_error', 'retry'],
    smi_error: ['error', 'vram.driver_error', 'retry'],
    no_nvidia_tools: ['unsupported', 'vram.no_tools', 'install'],
    reader_unavailable: ['error', 'vram.reader', 'retry'],
  };

  function vramView(info) {
    const generic = { state: 'empty', code: null, key: 'modal.vram_none', hintKey: null, action: null, fallback: '' };
    if (!isObj(info)) return generic;
    if (info.available === true || (Array.isArray(info.procs) && info.procs.length)) {
      return { state: 'ok', code: null, key: null, hintKey: null, action: null, fallback: '' };
    }
    const code = typeof info.reason_code === 'string' ? info.reason_code : null;
    const row = code ? VRAM[code] : null;
    if (row) return { state: row[0], code, key: row[1], hintKey: `${row[1]}_hint`, action: row[2], fallback: '' };
    // código desconocido o backend viejo: el `reason` del backend solo es respaldo
    const reason = typeof info.reason === 'string' ? info.reason : '';
    if (!reason) return generic;
    return { state: 'empty', code, key: null, hintKey: null, action: null, fallback: reason };
  }

  /* aura: null/undefined = el lector falló; {available:false} = no hay controladores. */
  function auraView(aura) {
    if (!isObj(aura)) return 'reader';
    return aura.available ? 'ok' : 'none';
  }

  /* ------------------------------------------------------------------ */
  /*  Cabecera "sensores OK" a partir del modelo de widget-states         */
  /* ------------------------------------------------------------------ */
  const HEADER_PANELS = Object.freeze(['cpu', 'gpu', 'fans', 'system', 'procs']);
  /* "vacío" que NO es un fallo: el equipo simplemente no tiene ese hardware / no hay nada que listar */
  const NOT_A_FAILURE = Object.freeze(['no_fans', 'no_events']);

  function partialPanels(models) {
    if (!isObj(models)) return [];
    return HEADER_PANELS.filter((p) => {
      const m = models[p];
      return isObj(m) && m.state === 'empty' && !NOT_A_FAILURE.includes(m.reason);
    });
  }

  /* -> {kind, level, key, list, sig}. `sig` = identidad del estado SIN reloj ni segundos:
     la región viva solo anuncia cuando cambia (sin spam). down gana a reconnecting porque
     main manda ambos seguidos y sería un solo suceso para quien escucha. */
  function headerStatus(o) {
    const { models, down, reconnecting } = o || {};
    let kind; let level; let key; let list = [];
    if (down) { kind = 'down'; level = 'error'; key = 'status.backend_down'; }
    else if (reconnecting) { kind = 'reconnecting'; level = 'warn'; key = 'status.reconnecting'; }
    else if (!isObj(models) || !isObj(models.cpu) || models.cpu.state === 'loading') {
      kind = 'connecting'; level = 'info'; key = 'status.connecting';
    } else if (models.cpu.state === 'stale') { kind = 'stale'; level = 'warn'; key = 'status.stale'; }
    else {
      list = partialPanels(models);
      if (list.length) { kind = 'partial'; level = 'warn'; key = 'status.partial'; }
      else { kind = 'ok'; level = 'ok'; key = 'status.ok'; }
    }
    return { kind, level, key, list, sig: list.length ? `${kind}:${list.join(',')}` : kind };
  }

  /* Anti-destello: «parcial» solo se muestra tras 2 muestras seguidas (un lector que falla
     un tick no enciende y apaga la cabecera). Todo lo demás (caído, stale, recuperar) es inmediato. */
  function createHeaderSettler(minPartialTicks = 2) {
    let shown = null;
    let streak = 0;
    return (h) => {
      if (h.kind === 'partial' && shown && shown.kind === 'ok') {
        streak += 1;
        if (streak < minPartialTicks) return shown;
      } else {
        streak = 0;
      }
      shown = h;
      return h;
    };
  }

  /* Vista de la cabecera (DOM inyectado: $, t, ws = () => RogWidgetStates). Devuelve render(stats, st) con
     st = {now, lastRxAt, resumedAt, backendDown, backendReconnecting, hidden}. El texto de #backend-state-text
     (región viva) solo se reescribe cuando cambia el estado; reloj/versión/segundos van en #backend-meta. */
  function createHeaderView(env) {
    const settle = createHeaderSettler();
    return function render(stats, st) {
      const WS = env.ws && env.ws();
      const ctx = { now: st.now, lastRxAt: st.lastRxAt, resumedAt: st.resumedAt, backendDown: st.backendDown, hidden: st.hidden };
      const models = WS && stats ? WS.evaluateAll(stats, ctx) : null;
      const h = settle(headerStatus({ models, down: st.backendDown, reconnecting: st.backendReconnecting }));
      const txt = env.$('backend-state-text');
      txt.removeAttribute('data-i18n');   // el texto lo manda el estado, no el idioma estático
      const text = env.t(h.key, { list: h.list.map((p) => env.t(`block.${p}`)).join(', ') });
      if (txt.textContent !== text) txt.textContent = text;
      env.$('backend-state').dataset.level = h.level;
      let meta = '';
      if (h.kind === 'ok' || h.kind === 'partial') meta = `core v${(stats && stats.version) || '?'} · ${new Date().toLocaleTimeString()}`;
      else if (h.kind === 'stale') meta = env.t('thermal.stale', { v: Math.round((WS.sampleAgeMs(stats, ctx) || 0) / 1000) });
      const m = env.$('backend-meta');
      if (m.textContent !== meta) m.textContent = meta;
    };
  }

  const api = {
    isNum, fmtNum, pctOrNull, clampPct, fmtPct, fmtDeg, fmtUptime, uptimeSeconds, fmtNet, fmtLoad, fmtRam,
    powerSource, fanView, vramView, auraView, partialPanels, headerStatus, createHeaderSettler, createHeaderView,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RogStatusView = api;
})(typeof window !== 'undefined' ? window : null);
