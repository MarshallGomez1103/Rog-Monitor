/* ===================================================================
   CENTRO DE PODER — power.js
   UI del modal #power-modal: control de potencia CPU/GPU.
   Archivo propio de A-POWER-UI — no tocar app.js ni update().
   =================================================================== */

(function () {
  'use strict';

  /* ---- helpers locales ---- */
  const $ = (id) => document.getElementById(id);

  // window.t/window.i18n SIEMPRE existen (stub seguro de A4 si aún no implementa).
  // tf(): traduce la clave; si todavía no está cableada en i18n.js (devuelve la
  // propia clave), cae al texto español de respaldo. Acepta vars opcionales.
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);
  function tf(key, esFallback, vars) {
    if (typeof window.t !== 'function') {
      return interpolate(esFallback, vars);
    }
    const out = window.t(key, vars);
    // si el motor devolvió la clave intacta, no hay traducción → usar fallback es
    if (out === key) return interpolate(esFallback, vars);
    return out;
  }
  function interpolate(str, vars) {
    if (!vars || typeof vars !== 'object') return str;
    return String(str).replace(/\{(\w+)\}/g, (_, k) =>
      (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
  }

  /* ================================================================
     REGISTRO i18n PROPIO (A-POWER-UI) — formato { clave: { es, en, … } }.
     Registramos aquí TODAS las claves nuevas de este módulo para que la UI
     funcione aunque el orquestador todavía no las consolide en i18n.js.
     El motor cae a 'es' si falta un idioma, así que es+en bastan; añadimos
     traducciones reales donde el texto es corto/visible. NO toca i18n.js.
  ================================================================= */
  (function registerPowerUiKeys() {
    if (!window.i18n || typeof window.i18n.register !== 'function') return;
    const D = {
      // --- cabecera / botón avanzado / rieles ---
      'power.advancedBtn': { es: 'Avanzado', en: 'Advanced', fr: 'Avancé', it: 'Avanzate', pt: 'Avançado', zh: '高级', ja: '詳細設定', ko: '고급' },
      'power.safetyRails': {
        es: 'Tu equipo está protegido: cada valor se recorta al rango seguro de tu dispositivo (doble recorte en la app y de nuevo en el firmware). El firmware impone sus propios topes y nada se aplica sin tu confirmación.',
        en: 'Your machine is protected: every value is clamped to your device’s safe range (double clamp, in the app and again in firmware). The firmware enforces its own limits and nothing is applied without your confirmation.',
      },
      // --- franja de peligro ---
      'power.danger.heading': { es: 'Peligro: revisa qué vas a mover', en: 'Danger: review what you’re about to change' },
      'power.danger.moved': { es: 'Moviste {label} {from}→{to} {unit}', en: 'You moved {label} {from}→{to} {unit}' },
      'power.danger.beyondSafe': {
        es: 'Fuera del rango seguro: requiere confirmación adicional al aplicar.',
        en: 'Outside the safe range: requires extra confirmation when applying.',
      },
      'power.danger.railsNote': {
        es: 'Cada valor se recorta al rango seguro de tu dispositivo y el firmware impone sus propios topes. Si algo falla, reinicia y usa Reset a fábrica.',
        en: 'Every value is clamped to your device’s safe range and the firmware enforces its own caps. If something goes wrong, reboot and use Factory Reset.',
      },
      // consecuencias — subir mucho
      'power.danger.pl1.up': { es: 'PL1 muy alto: la CPU se mantiene caliente bajo carga larga; más calor y ventiladores al máximo. El firmware hará throttling si se pasa.', en: 'PL1 too high: the CPU stays hot under sustained load; more heat and fans at max. The firmware will throttle if it goes too far.' },
      'power.danger.pl2.up': { es: 'PL2 muy alto: picos de temperatura más fuertes que pueden disparar throttling y ruido de ventiladores.', en: 'PL2 too high: sharper temperature spikes that can trigger throttling and fan noise.' },
      'power.danger.dynamic_boost.up': { es: 'Dynamic Boost muy alto: la GPU consume más y se calienta más; en chasis delgados puede activar throttling antes.', en: 'Dynamic Boost too high: the GPU draws more and runs hotter; in thin chassis it may throttle sooner.' },
      'power.danger.thermal_target.up': { es: 'Techo térmico muy alto: la GPU correrá más caliente de forma sostenida; mayor desgaste térmico a largo plazo.', en: 'Thermal ceiling too high: the GPU will run hotter sustained; more long-term thermal wear.' },
      'power.danger.base_clock_offset.up': { es: 'Offset de reloj base muy alto (overclock): inestabilidad, artefactos en pantalla y cuelgues; en casos extremos puede dañar la GPU.', en: 'Base clock offset too high (overclock): instability, on-screen artifacts and crashes; in extreme cases it can damage the GPU.' },
      'power.danger.mem_clock_offset.up': { es: 'Offset de memoria muy alto: errores de textura (artefactos) y cierres de juego si la VRAM no aguanta.', en: 'Memory offset too high: texture errors (artifacts) and game crashes if the VRAM can’t keep up.' },
      // consecuencias — bajar mucho
      'power.danger.pl1.down': { es: 'PL1 muy bajo: la CPU rinde notablemente menos en cargas largas (compilar, render, juegos pesados).', en: 'PL1 too low: the CPU performs noticeably worse on sustained loads (compiling, rendering, heavy games).' },
      'power.danger.pl2.down': { es: 'PL2 muy bajo (por debajo de PL1): la ráfaga deja de tener efecto; aperturas y picos se sienten lentos.', en: 'PL2 too low (below PL1): the burst stops having effect; launches and spikes feel slow.' },
      'power.danger.dynamic_boost.down': { es: 'Dynamic Boost muy bajo: menos FPS en juegos donde la GPU podría tomar vatios extra de la CPU.', en: 'Dynamic Boost too low: fewer FPS in games where the GPU could borrow extra watts from the CPU.' },
      'power.danger.thermal_target.down': { es: 'Techo térmico muy bajo: la GPU hará throttling antes y perderás rendimiento en picos.', en: 'Thermal ceiling too low: the GPU will throttle sooner and you’ll lose performance on spikes.' },
      'power.danger.base_clock_offset.down': { es: 'Offset de reloj base muy bajo (undervolt agresivo): el sistema puede congelarse, apagarse o reiniciarse. Recuperable reiniciando.', en: 'Base clock offset too low (aggressive undervolt): the system may freeze, power off or reboot. Recoverable by rebooting.' },
      'power.danger.mem_clock_offset.down': { es: 'Offset de memoria muy bajo: pérdida de ancho de banda y menos rendimiento en juegos que saturan la VRAM.', en: 'Memory offset too low: bandwidth loss and lower performance in games that saturate the VRAM.' },
      // --- confirmación al aplicar ---
      'power.confirm.title': { es: 'CENTRO DE PODER — Confirmar cambios', en: 'POWER CENTER — Confirm changes' },
      'power.confirm.onlyChanged': { es: 'Vas a aplicar SOLO estos cambios:', en: 'You’re applying ONLY these changes:' },
      'power.confirm.rails': {
        es: 'Los valores van acotados a los rangos seguros de tu dispositivo (doble recorte) y el firmware impone sus propios topes. Si algo falla, reinicia y usa Reset a fábrica; estos cambios no sobreviven a un apagón forzado.',
        en: 'Values are clamped to your device’s safe ranges (double clamp) and the firmware enforces its own caps. If something fails, reboot and use Factory Reset; these changes don’t survive a forced power-off.',
      },
      'power.confirm.question': { es: '¿Aplicar?', en: 'Apply?' },
      'power.confirm.beyondTitle': { es: 'CONFIRMACIÓN ADICIONAL — Fuera del rango seguro', en: 'EXTRA CONFIRMATION — Outside the safe range' },
      'power.confirm.beyondBody': {
        es: 'Estos valores superan el rango seguro recomendado para tu dispositivo. El riesgo de inestabilidad o daño es MAYOR:',
        en: 'These values exceed the recommended safe range for your device. The risk of instability or damage is HIGHER:',
      },
      'power.confirm.beyondQuestion': { es: '¿Aplicar fuera del rango seguro?', en: 'Apply outside the safe range?' },
      // --- panel avanzado ---
      'power.advanced.intro': {
        es: '¿No quieres complicarte? La mayoría solo activa el GUARDIÁN (abajo) y listo. El modo avanzado es para quien quiere afinar a mano: elige marca y componente, busca tu modelo y abre la documentación oficial de undervolt/overclock. Estos límites varían por modelo; consulta siempre la fuente oficial antes de salir del rango seguro.',
        en: 'Don’t want the hassle? Most people just turn on the GUARDIAN (below) and that’s it. Advanced mode is for hand-tuning: pick a brand and component, search your model and open the official undervolt/overclock docs. These limits vary by model; always check the official source before leaving the safe range.',
      },
      'power.advanced.unavailable': {
        es: 'La base de documentación de dispositivos aún no está disponible. Igual puedes ajustar dentro de los rangos seguros detectados para tu equipo.',
        en: 'The device documentation database isn’t available yet. You can still adjust within the safe ranges detected for your machine.',
      },
      'power.advanced.brand': { es: 'Marca', en: 'Brand', fr: 'Marque', it: 'Marca', pt: 'Marca', zh: '品牌', ja: 'メーカー', ko: '브랜드' },
      'power.advanced.component': { es: 'Componente', en: 'Component', fr: 'Composant', it: 'Componente', pt: 'Componente', zh: '组件', ja: 'コンポーネント', ko: '구성요소' },
      'power.advanced.safeRangeRules': { es: 'Rangos seguros', en: 'Safe ranges' },
      'power.advanced.officialDocs': { es: 'Documentación oficial', en: 'Official documentation' },
      'power.advanced.source': { es: 'Fuente', en: 'Source' },
      'power.advanced.ack': { es: 'Entiendo los riesgos', en: 'I understand the risks', fr: 'Je comprends les risques', it: 'Capisco i rischi', pt: 'Entendo os riscos', zh: '我了解风险', ja: 'リスクを理解しました', ko: '위험을 이해합니다' },
      'power.advanced.needAck': { es: 'Marca "Entiendo los riesgos" en el panel Avanzado para aplicar.', en: 'Tick “I understand the risks” in the Advanced panel to apply.' },
      'power.advanced.cc.cpuLaptop': { es: 'CPU (portátil)', en: 'CPU (laptop)' },
      'power.advanced.cc.cpuDesktop': { es: 'CPU (escritorio)', en: 'CPU (desktop)' },
      'power.advanced.cc.gpuLaptop': { es: 'GPU (portátil)', en: 'GPU (laptop)' },
      'power.advanced.cc.gpuDesktop': { es: 'GPU (escritorio)', en: 'GPU (desktop)' },
      'power.advanced.model': { es: 'Modelo / SKU', en: 'Model / SKU' },
      'power.advanced.modelPlaceholder': { es: 'Buscar: RTX 4080, 14900HX, Legion...', en: 'Search: RTX 4080, 14900HX, Legion...' },
      'power.advanced.matches': { es: 'Coincidencias', en: 'Matches' },
      'power.advanced.noMatches': { es: 'Sin coincidencias. Usa marca/componente o agrega una entrada oficial a device_docs.json.', en: 'No matches. Use brand/component or add an official entry to device_docs.json.' },
      'power.advanced.showSupported': { es: 'Ver soportados', en: 'Show supported' },
      'power.advanced.hideSupported': { es: 'Ocultar soportados', en: 'Hide supported' },
      'power.advanced.supportedSummary': { es: '{count} entradas actuales en la base de documentación.', en: '{count} current entries in the documentation database.' },
      'power.advanced.models': { es: 'Modelos / familias', en: 'Models / families' },
      'power.advanced.allVendors': { es: 'Todas las marcas', en: 'All brands' },
      'power.guardian.title': { es: 'GUARDIÁN CPU/GPU', en: 'CPU/GPU GUARDIAN' },
      'power.guardian.desc': {
        es: 'Automático conservador: mantiene CPU y GPU bajo los techos elegidos. Primero sube ventiladores/perfil térmico; si no basta, baja Dynamic Boost y PL2. Respeta el cap de ventiladores configurado en Ventiladores.',
        en: 'Conservative automatic mode: keeps CPU and GPU under your chosen ceilings. It raises fans/thermal profile first; if that is not enough, it lowers Dynamic Boost and PL2. It respects the fan cap configured in Fans.',
      },
      'power.guardian.cpuCeiling': { es: 'Techo CPU', en: 'CPU ceiling' },
      'power.guardian.gpuCeiling': { es: 'Techo GPU', en: 'GPU ceiling' },
      'power.guardian.fanCap': { es: 'Tope de ventiladores', en: 'Fan cap' },
      'power.guardian.fanCapBody': { es: 'El guardián usa el cap global que ya configuraste en Ventiladores. Si quieres menos ruido, baja ese cap; si quieres más protección térmica, súbelo.', en: 'The guardian uses the global cap already configured in Fans. Lower that cap for less noise; raise it for more thermal protection.' },
      'power.guardian.cost': { es: 'Costo estimado', en: 'Estimated cost' },
      'power.guardian.costBody': { es: 'Con los watts actuales del stream, una hora costaría aprox. {cost}. Edita el precio por kWh si tu tarifa es distinta.', en: 'Using the current watts in the stream, one hour would cost about {cost}. Edit the kWh price if your tariff is different.' },
      // --- reset / errores / acciones (fallbacks; pueden ya existir en CORE) ---
      'power.reset.title': { es: 'RESET A FÁBRICA', en: 'FACTORY RESET' },
      'power.reset.body': {
        es: 'Restaura los límites de potencia a los valores con los que vino tu equipo, detectados y guardados la primera vez que abriste la app.',
        en: 'Restores the power limits to the values your machine shipped with, detected and saved the first time you opened the app.',
      },
      'power.reset.question': { es: '¿Continuar?', en: 'Continue?' },
      'power.reset': { es: 'RESET A FÁBRICA', en: 'FACTORY RESET' },
      'power.resetting': { es: 'RESETEANDO…', en: 'RESETTING…' },
      'power.apply': { es: 'APLICAR', en: 'APPLY' },
      'power.applying': { es: 'APLICANDO…', en: 'APPLYING…' },
      'power.err': { es: 'Error', en: 'Error' },
      'power.err_fetch': { es: 'No se pudo obtener el estado de potencia', en: 'Could not read the power state' },
      'power.err_no_response': { es: 'Sin respuesta del backend', en: 'No response from the backend' },
      'power.err_apply': { es: 'No se aplicó', en: 'Not applied' },
      'power.err_reset': { es: 'No se pudo resetear', en: 'Could not reset' },
      'power.err_unknown': { es: 'error desconocido', en: 'unknown error' },
      'power.notAvailableConfig': { es: 'No disponible en esta configuración', en: 'Not available in this configuration' },
      'power.consentRecover': { es: 'Si el sistema se cuelga tras aplicar, reinicia.', en: 'If the system hangs after applying, reboot.' },
    };
    try { window.i18n.register(D); } catch (_) { /* nunca bloquea la UI */ }
  })();

  /* ---- estado del módulo ---- */
  let powerState = null;       // última respuesta de getPowerControl()
  let pendingChanges = {};     // { pl1: 120, pl2: 160, … }
  let activeTab = 'guardian';  // 'guardian' | 'cpu' | 'gpu'
  let advancedConsent = {};    // { base_clock_offset: true, … } — consentimiento avanzado por clave
  let thermalState = null;     // última respuesta de getThermalGuardian()
  let deviceDocs = null;       // device_docs.json cargado (lazy)
  let advancedAck = false;     // check "Entiendo los riesgos" del panel Avanzado
  let latestStats = null;      // última muestra live para costo estimado/guardián

  /* ================================================================
     SUSCRIPTOR LIVE: se registra UNA sola vez y actualiza las cabeceras
     con los valores actuales sin reconstruir los sliders.
  ================================================================= */
  window.rog.onStats((stats) => {
    latestStats = stats;
    if (!stats.power_control) return;
    renderPowerLive(stats.power_control);
  });

  /* ================================================================
     renderPowerLive — actualiza solo los valores "actuales" mientras
     el modal está abierto. No reconstruye los sliders (lo hace
     openPowerModal).
  ================================================================= */
  function renderPowerLive(pc) {
    if (!pc || !pc.controls) return;
    // Si el modal está oculto no hay nada que actualizar en la UI live.
    const modal = $('power-modal');
    if (!modal || modal.classList.contains('hidden')) return;

    const controls = pc.controls;
    for (const [key, ctrl] of Object.entries(controls)) {
      const liveEl = document.querySelector(`[data-power-live="${key}"]`);
      if (!liveEl) continue;
      if (ctrl.value !== undefined && ctrl.value !== null) {
        liveEl.textContent = t('power.current_value', { v: ctrl.value, u: ctrl.unit || '' });
      }
    }
  }

  /* ================================================================
     buildSliders — construye los controles de un tab dado la respuesta
     de getPowerControl(). Devuelve un <div> listo para insertar.
  ================================================================= */
  const CLOCK_OFFSET_KEYS = ['base_clock_offset', 'mem_clock_offset'];

  function buildSliders(controls, tabKeys) {
    const wrap = document.createElement('div');

    tabKeys.forEach((key, idx) => {
      const ctrl = controls[key];
      if (!ctrl) return;

      const isOffset = CLOCK_OFFSET_KEYS.includes(key);
      const isLocked = !ctrl.writable;
      const block = document.createElement('div');
      block.className = 'power-control' + (isLocked ? ' locked' : '') + (isOffset ? ' power-offset' : '');
      block.dataset.key = key;

      // cabecera
      const header = document.createElement('div');
      header.className = 'power-control-header';

      const labelSpan = document.createElement('span');
      labelSpan.className = 'power-control-label';
      labelSpan.textContent = ctrl.label || key;

      const unitSpan = document.createElement('span');
      unitSpan.className = 'power-control-unit';
      unitSpan.textContent = ctrl.unit || '';

      const defaultSpan = document.createElement('span');
      defaultSpan.className = 'power-control-default';
      defaultSpan.textContent = isOffset
        ? t('power.factoryZero')
        : t('power.factory_value', { v: ctrl.default, u: ctrl.unit || '' });

      header.appendChild(labelSpan);
      header.appendChild(unitSpan);
      header.appendChild(defaultSpan);
      block.appendChild(header);

      // live actual value badge
      const liveNote = document.createElement('span');
      liveNote.className = 'power-live-note';
      liveNote.dataset.powerLive = key;
      liveNote.textContent = ctrl.value !== undefined ? t('power.current_value', { v: ctrl.value, u: ctrl.unit || '' }) : '';
      block.appendChild(liveNote);

      // tooltip (descripción Armoury Crate traducida)
      const tooltip = document.createElement('span');
      tooltip.className = 'power-control-tooltip';
      tooltip.textContent = powerTooltip(key);
      block.appendChild(tooltip);

      if (isLocked) {
        // modo bloqueado: solo mostrar el valor y el motivo, sin slider
        const reasonEl = document.createElement('span');
        reasonEl.className = 'power-control-reason';
        reasonEl.textContent = ctrl.reason || (isOffset
          ? t('power.nvmlUnavailable')
          : tf('power.notAvailableConfig', 'No disponible en esta configuración'));
        block.appendChild(reasonEl);

        // slider y numbox deshabilitados para consistencia visual
        const rowEl = document.createElement('div');
        rowEl.className = 'power-control-row';

        const sliderWrap = document.createElement('div');
        sliderWrap.className = 'power-slider-wrap';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'power-slider';
        slider.min = ctrl.min;
        slider.max = ctrl.max;
        slider.value = ctrl.value !== undefined ? ctrl.value : ctrl.default;
        slider.disabled = true;
        sliderWrap.appendChild(slider);
        rowEl.appendChild(sliderWrap);

        const numbox = document.createElement('input');
        numbox.type = 'number';
        numbox.className = 'power-numbox';
        numbox.min = ctrl.min;
        numbox.max = ctrl.max;
        numbox.value = ctrl.value !== undefined ? ctrl.value : ctrl.default;
        numbox.disabled = true;
        rowEl.appendChild(numbox);

        block.appendChild(rowEl);
      } else if (isOffset) {
        // ---- offsets de reloj GPU: slider con rango SEGURO + opción avanzada ----
        buildOffsetControl(block, key, ctrl);
      } else {
        // modo editable: slider + numbox enlazados
        const rowEl = document.createElement('div');
        rowEl.className = 'power-control-row';

        const sliderWrap = document.createElement('div');
        sliderWrap.className = 'power-slider-wrap';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'power-slider';
        slider.min = ctrl.min;
        slider.max = ctrl.max;
        slider.step = 1;
        slider.value = ctrl.value !== undefined ? ctrl.value : ctrl.default;
        slider.dataset.key = key;

        // tick de fábrica
        const tickPct = ((ctrl.default - ctrl.min) / (ctrl.max - ctrl.min)) * 100;
        const tick = document.createElement('span');
        tick.className = 'power-default-tick';
        tick.style.left = `${tickPct}%`;
        tick.title = t('power.factory_value', { v: ctrl.default, u: ctrl.unit || '' });
        tick.textContent = `▲${ctrl.default}`;
        sliderWrap.appendChild(slider);
        sliderWrap.appendChild(tick);
        rowEl.appendChild(sliderWrap);

        const numbox = document.createElement('input');
        numbox.type = 'number';
        numbox.className = 'power-numbox';
        numbox.min = ctrl.min;
        numbox.max = ctrl.max;
        numbox.step = 1;
        numbox.value = slider.value;
        numbox.dataset.key = key;
        rowEl.appendChild(numbox);

        block.appendChild(rowEl);

        // enlace bidireccional slider ↔ numbox
        slider.addEventListener('input', () => {
          numbox.value = slider.value;
          recordChange(key, Number(slider.value));
          checkPlConstraint();
        });
        numbox.addEventListener('input', () => {
          const clamped = Math.max(ctrl.min, Math.min(ctrl.max, Number(numbox.value) || ctrl.default));
          slider.value = clamped;
          recordChange(key, clamped);
          checkPlConstraint();
        });
        numbox.addEventListener('change', () => {
          const clamped = Math.max(ctrl.min, Math.min(ctrl.max, Number(numbox.value) || ctrl.default));
          numbox.value = clamped;
          slider.value = clamped;
          recordChange(key, clamped);
          checkPlConstraint();
        });
      }

      // separador entre grupos (entre CPU y GPU en sus respectivos tabs)
      if (idx > 0) {
        const hr = document.createElement('hr');
        hr.className = 'power-divider';
        wrap.appendChild(hr);
      }

      wrap.appendChild(block);
    });

    return wrap;
  }

  /* ================================================================
     buildOffsetControl — slider de offset de reloj GPU (núcleo/memoria).
     Rango SEGURO por defecto (device_profiles.json min/max); un checkbox
     "modo avanzado" desbloquea el rango absoluto del driver (abs_min/abs_max,
     vía NVML) con una advertencia adicional. Fábrica = 0 MHz siempre.
  ================================================================= */
  function buildOffsetControl(block, key, ctrl) {
    const safeMin = ctrl.min;
    const safeMax = ctrl.max;
    const absMin = ctrl.abs_min !== undefined && ctrl.abs_min !== null ? ctrl.abs_min : safeMin;
    const absMax = ctrl.abs_max !== undefined && ctrl.abs_max !== null ? ctrl.abs_max : safeMax;
    const hasAdvanced = absMin < safeMin || absMax > safeMax;

    let useAdvanced = !!advancedConsent[key];
    const effMin = () => (useAdvanced ? absMin : safeMin);
    const effMax = () => (useAdvanced ? absMax : safeMax);

    const rowEl = document.createElement('div');
    rowEl.className = 'power-control-row';

    const sliderWrap = document.createElement('div');
    sliderWrap.className = 'power-slider-wrap';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'power-slider power-slider-offset';
    slider.min = effMin();
    slider.max = effMax();
    slider.step = 1;
    slider.value = ctrl.value !== undefined ? ctrl.value : 0;
    slider.dataset.key = key;

    // tick de fábrica SIEMPRE en 0 MHz
    const tick = document.createElement('span');
    tick.className = 'power-default-tick power-zero-tick';
    const zeroPct = ((0 - effMin()) / (effMax() - effMin())) * 100;
    tick.style.left = `${Math.max(0, Math.min(100, zeroPct))}%`;
    tick.title = t('power.factoryZero');
    tick.textContent = '▲0';
    sliderWrap.appendChild(slider);
    sliderWrap.appendChild(tick);
    rowEl.appendChild(sliderWrap);

    const numbox = document.createElement('input');
    numbox.type = 'number';
    numbox.className = 'power-numbox';
    numbox.min = effMin();
    numbox.max = effMax();
    numbox.step = 1;
    numbox.value = slider.value;
    numbox.dataset.key = key;
    rowEl.appendChild(numbox);

    block.appendChild(rowEl);

    // rango visible (seguro/avanzado) bajo el slider
    const rangeNote = document.createElement('span');
    rangeNote.className = 'power-range-note';
    function renderRangeNote() {
      rangeNote.textContent = useAdvanced
        ? `${t('power.advancedRange')}: ${absMin}..${absMax} MHz`
        : `${t('power.safeRange')}: ${safeMin}..${safeMax} MHz`;
      rangeNote.classList.toggle('advanced', useAdvanced);
    }
    renderRangeNote();
    block.appendChild(rangeNote);

    function applyClamp(val) {
      const clamped = Math.max(effMin(), Math.min(effMax(), val));
      slider.value = clamped;
      numbox.value = clamped;
      recordChange(key, clamped);
    }

    slider.addEventListener('input', () => applyClamp(Number(slider.value)));
    numbox.addEventListener('input', () => applyClamp(Number(numbox.value) || 0));
    numbox.addEventListener('change', () => applyClamp(Number(numbox.value) || 0));

    // checkbox "modo avanzado" — solo si el rango absoluto excede el seguro
    if (hasAdvanced) {
      const advWrap = document.createElement('label');
      advWrap.className = 'power-advanced-toggle';

      const advCheck = document.createElement('input');
      advCheck.type = 'checkbox';
      advCheck.checked = useAdvanced;

      const advText = document.createElement('span');
      advText.textContent = ` ${t('power.advancedRange')}`;

      advWrap.appendChild(advCheck);
      advWrap.appendChild(advText);
      block.appendChild(advWrap);

      advCheck.addEventListener('change', async () => {
        if (advCheck.checked) {
          // DOBLE CONSENTIMIENTO para exceder el rango seguro hacia el absoluto.
          const ok = await window.rogConfirm(
            `${t('power.consentTitle')}\n\n${t('power.consentAdvanced')}\n\n` +
            `${t('power.consentOverclock')}\n\n${t('power.consentUndervolt')}\n\n` +
            `${t('power.consentRecover')}`,
            { title: t('power.consentTitle') }
          );
          if (!ok) {
            advCheck.checked = false;
            return;
          }
          advancedConsent[key] = true;
          useAdvanced = true;
        } else {
          advancedConsent[key] = false;
          useAdvanced = false;
        }
        // reclamp valor actual al nuevo rango efectivo y refrescar UI
        slider.min = effMin();
        slider.max = effMax();
        numbox.min = effMin();
        numbox.max = effMax();
        applyClamp(Number(slider.value));
        renderRangeNote();
        const zPct = ((0 - effMin()) / (effMax() - effMin())) * 100;
        tick.style.left = `${Math.max(0, Math.min(100, zPct))}%`;
        renderDangerStrip();
      });
    }
  }

  /* ================================================================
     powerTooltip — explicación corta de cada control (i18n, 8 idiomas).
  ================================================================= */
  const EXPLAIN_KEYS = {
    pl1: 'pl1', pl2: 'pl2', dynamic_boost: 'dynamic_boost',
    thermal_target: 'thermal_target',
    base_clock_offset: 'base_clock_offset', mem_clock_offset: 'mem_clock_offset',
  };

  function powerTooltip(key) {
    const ek = EXPLAIN_KEYS[key];
    return ek ? t(`power.explain.${ek}.body`) : '';
  }

  /* ================================================================
     DANGER: consecuencia concreta por control (subir mucho / bajar mucho).
     Texto corto y honesto, distinto del tooltip largo. Vía tf() para que
     funcione aunque la clave aún no esté cableada en i18n.js.
  ================================================================= */
  const DANGER_UP = {
    pl1: ['power.danger.pl1.up', 'PL1 muy alto: la CPU se mantiene caliente bajo carga larga; más calor y ventiladores al máximo. El firmware hará throttling si se pasa.'],
    pl2: ['power.danger.pl2.up', 'PL2 muy alto: picos de temperatura más fuertes que pueden disparar throttling y ruido de ventiladores.'],
    dynamic_boost: ['power.danger.dynamic_boost.up', 'Dynamic Boost muy alto: la GPU consume más y se calienta más; en chasis delgados puede activar throttling antes.'],
    thermal_target: ['power.danger.thermal_target.up', 'Techo térmico muy alto: la GPU correrá más caliente de forma sostenida; mayor desgaste térmico a largo plazo.'],
    base_clock_offset: ['power.danger.base_clock_offset.up', 'Offset de reloj base muy alto (overclock): inestabilidad, artefactos en pantalla y cuelgues; en casos extremos puede dañar la GPU.'],
    mem_clock_offset: ['power.danger.mem_clock_offset.up', 'Offset de memoria muy alto: errores de textura (artefactos) y cierres de juego si la VRAM no aguanta.'],
  };
  const DANGER_DOWN = {
    pl1: ['power.danger.pl1.down', 'PL1 muy bajo: la CPU rinde notablemente menos en cargas largas (compilar, render, juegos pesados).'],
    pl2: ['power.danger.pl2.down', 'PL2 muy bajo (por debajo de PL1): la ráfaga deja de tener efecto; aperturas y picos se sienten lentos.'],
    dynamic_boost: ['power.danger.dynamic_boost.down', 'Dynamic Boost muy bajo: menos FPS en juegos donde la GPU podría tomar vatios extra de la CPU.'],
    thermal_target: ['power.danger.thermal_target.down', 'Techo térmico muy bajo: la GPU hará throttling antes y perderás rendimiento en picos.'],
    base_clock_offset: ['power.danger.base_clock_offset.down', 'Offset de reloj base muy bajo (undervolt agresivo): el sistema puede congelarse, apagarse o reiniciarse. Recuperable reiniciando.'],
    mem_clock_offset: ['power.danger.mem_clock_offset.down', 'Offset de memoria muy bajo: pérdida de ancho de banda y menos rendimiento en juegos que saturan la VRAM.'],
  };

  /* ================================================================
     recordChange — acumula los cambios del usuario en pendingChanges.
  ================================================================= */
  function recordChange(key, value) {
    if (!powerState || !powerState.controls) return;
    const ctrl = powerState.controls[key];
    if (!ctrl) return;
    // si vuelve al valor actual del hardware, lo quitamos de pendientes
    if (value === ctrl.value) {
      delete pendingChanges[key];
    } else {
      pendingChanges[key] = value;
    }
    refreshApplyState();
    renderDangerStrip();
  }

  /* refreshApplyState — habilita/inhabilita APLICAR según haya cambios y,
     si el panel Avanzado está abierto, según el check "Entiendo los riesgos". */
  function refreshApplyState() {
    const applyBtn = $('power-apply');
    if (!applyBtn) return;
    const hasChanges = Object.keys(pendingChanges).length > 0;
    const advOpen = !isAdvancedPanelHidden();
    applyBtn.disabled = !hasChanges || (advOpen && !advancedAck);
  }

  function isAdvancedPanelHidden() {
    const panel = $('power-advanced-panel');
    return !panel || panel.classList.contains('hidden');
  }

  /* ================================================================
     checkPlConstraint — advierte si PL2 < PL1.
  ================================================================= */
  function checkPlConstraint() {
    const warn = $('power-pl-warn');
    if (!warn) return;
    const pl1 = currentValue('pl1');
    const pl2 = currentValue('pl2');
    if (pl1 !== null && pl2 !== null && pl2 < pl1) {
      warn.classList.add('visible');
    } else {
      warn.classList.remove('visible');
    }
  }

  function currentValue(key) {
    if (pendingChanges[key] !== undefined) return pendingChanges[key];
    if (powerState && powerState.controls && powerState.controls[key]) {
      return powerState.controls[key].value;
    }
    return null;
  }

  /* ================================================================
     buildChangeList — DETECCIÓN POR-CAMBIO: compara pendingChanges contra el
     valor leído del hardware y devuelve SOLO lo que se movió, con dirección.
     Cada item: {key, label, unit, from, to, dir:'up'|'down', beyondSafe}.
  ================================================================= */
  function buildChangeList() {
    const out = [];
    if (!powerState || !powerState.controls) return out;
    for (const [key, to] of Object.entries(pendingChanges)) {
      const ctrl = powerState.controls[key];
      if (!ctrl) continue;
      const from = ctrl.value !== undefined && ctrl.value !== null ? ctrl.value : ctrl.default;
      if (to === from) continue;
      const dir = to > from ? 'up' : 'down';
      const safeMin = ctrl.min;
      const safeMax = ctrl.max;
      const beyondSafe =
        (safeMin !== undefined && safeMin !== null && to < safeMin) ||
        (safeMax !== undefined && safeMax !== null && to > safeMax);
      out.push({
        key,
        label: ctrl.label || key,
        unit: ctrl.unit || '',
        from,
        to,
        dir,
        beyondSafe,
      });
    }
    return out;
  }

  /* ================================================================
     renderDangerStrip — pinta la franja de PELIGRO (inline, antes de los
     botones) que lista SOLO los controles cambiados y, por cada uno, la
     consecuencia concreta de moverlo en esa dirección. Si algún cambio
     excede el rango seguro, lo marca y exige doble consentimiento al aplicar.
  ================================================================= */
  function renderDangerStrip() {
    const strip = $('power-danger-strip');
    if (!strip) return;
    const changes = buildChangeList();

    if (changes.length === 0) {
      strip.classList.add('hidden');
      strip.innerHTML = '';
      return;
    }

    strip.classList.remove('hidden');
    strip.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'power-danger-head';
    head.textContent = tf('power.danger.heading', 'Peligro: revisa qué vas a mover');
    strip.appendChild(head);

    const list = document.createElement('ul');
    list.className = 'power-danger-list';

    changes.forEach((c) => {
      const li = document.createElement('li');
      li.className = 'power-danger-item' + (c.beyondSafe ? ' beyond-safe' : '');

      const move = document.createElement('div');
      move.className = 'power-danger-move';
      // "Moviste GPU Dynamic Boost 25→18 W"
      move.textContent = tf('power.danger.moved', 'Moviste {label} {from}→{to} {unit}', {
        label: c.label, from: c.from, to: c.to, unit: c.unit,
      });
      li.appendChild(move);

      const tbl = c.dir === 'up' ? DANGER_UP : DANGER_DOWN;
      const entry = tbl[c.key];
      if (entry) {
        const cons = document.createElement('div');
        cons.className = 'power-danger-consequence';
        cons.textContent = tf(entry[0], entry[1]);
        li.appendChild(cons);
      }

      if (c.beyondSafe) {
        const flag = document.createElement('div');
        flag.className = 'power-danger-beyond';
        flag.textContent = tf('power.danger.beyondSafe',
          'Fuera del rango seguro: requiere confirmación adicional al aplicar.');
        li.appendChild(flag);
      }

      list.appendChild(li);
    });

    strip.appendChild(list);

    // rieles de seguridad (tranquilizador pero honesto)
    const rails = document.createElement('div');
    rails.className = 'power-danger-rails';
    rails.textContent = tf('power.danger.railsNote',
      'Cada valor se recorta al rango seguro de tu dispositivo y el firmware impone sus propios topes. Si algo falla, reinicia y usa Reset a fábrica.');
    strip.appendChild(rails);
  }

  /* ================================================================
     openPowerModal — llama a getPowerControl(), construye los sliders
     y abre el modal.
  ================================================================= */
  async function openPowerModal() {
    const modal = $('power-modal');
    pendingChanges = {};
    modal.classList.remove('hidden');

    // cerrar panel avanzado al (re)abrir
    closeAdvancedPanel();
    renderDangerStrip();

    // mostrar estado de carga
    const cpuPanel = $('power-cpu-panel');
    const gpuPanel = $('power-gpu-panel');
    const guardianPanel = $('power-guardian-panel');
    const unavail = $('power-unavail');
    if (cpuPanel) cpuPanel.innerHTML = `<p class="dim" style="padding:1rem">${t('power.loading')}</p>`;
    if (gpuPanel) gpuPanel.innerHTML = '';
    if (guardianPanel) guardianPanel.innerHTML = '';
    if (unavail) unavail.style.display = 'none';

    let result;
    try {
      result = await window.rog.getPowerControl();
    } catch (err) {
      showPowerError(`${tf('power.err_fetch', 'No se pudo obtener el estado de potencia')}: ${err.message}`);
      return;
    }

    if (!result || result.ok === false) {
      showPowerError(result ? result.err : tf('power.err_no_response', 'Sin respuesta del backend'));
      return;
    }

    powerState = result;

    if (!result.available) {
      showPowerError(t('power.err_unavailable'));
      return;
    }

    const controls = result.controls || {};

    // reconstruir tab CPU
    if (cpuPanel) {
      cpuPanel.innerHTML = '';
      const cpuContent = buildSliders(controls, ['pl1', 'pl2']);
      cpuPanel.appendChild(cpuContent);
    }

    // reconstruir tab GPU
    if (gpuPanel) {
      gpuPanel.innerHTML = '';
      const gpuContent = buildSliders(controls,
        ['dynamic_boost', 'thermal_target', 'base_clock_offset', 'mem_clock_offset']);
      gpuPanel.appendChild(gpuContent);
    }

    // reconstruir tab GUARDIÁN
    if (guardianPanel) {
      guardianPanel.innerHTML = '';
      const guardianSection = document.createElement('div');
      guardianSection.id = 'power-thermal-guardian';
      guardianSection.className = 'power-thermal-guardian';
      guardianSection.innerHTML = `<p class="dim" style="padding:0.5rem 0">${t('power.thermalLoading')}</p>`;
      guardianPanel.appendChild(guardianSection);
      renderThermalGuardian();
    }

    // resetear advertencia PL y botón aplicar
    checkPlConstraint();
    refreshApplyState();

    // activar la pestaña que estaba activa
    switchTab(activeTab);
  }

  /* ================================================================
     renderThermalGuardian — pinta la sección del guardián CPU/GPU.
  ================================================================= */
  async function renderThermalGuardian() {
    const section = $('power-thermal-guardian');
    if (!section) return;

    let result;
    try {
      result = await window.rog.getThermalGuardian();
    } catch (err) {
      section.innerHTML = `<p class="power-control-reason">${t('power.thermalError')}: ${escapeHtmlLocal(err.message)}</p>`;
      return;
    }

    if (!result || result.ok === false) {
      section.innerHTML = `<p class="power-control-reason">${t('power.thermalError')}</p>`;
      return;
    }

    thermalState = result;
    section.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'power-control-header';
    const labelSpan = document.createElement('span');
    labelSpan.className = 'power-control-label';
    labelSpan.textContent = tf('power.guardian.title', 'GUARDIÁN CPU/GPU');
    const statusBadge = document.createElement('span');
    statusBadge.className = 'power-thermal-status' + (result.active ? ' active' : '');
    statusBadge.textContent = result.active ? t('power.thermalActive') : t('power.thermalInactive');
    header.appendChild(labelSpan);
    header.appendChild(statusBadge);
    section.appendChild(header);

    const desc = document.createElement('span');
    desc.className = 'power-control-tooltip';
    desc.textContent = tf('power.guardian.desc',
      'Automático conservador: mantiene CPU y GPU bajo los techos elegidos. Primero sube ventiladores/perfil térmico; si no basta, baja Dynamic Boost y PL2. Respeta el cap de ventiladores configurado en Ventiladores.');
    section.appendChild(desc);

    if (!result.scriptExists) {
      const warn = document.createElement('p');
      warn.className = 'power-control-reason';
      warn.textContent = t('power.thermalNotInstalled');
      section.appendChild(warn);
      return;
    }

    // Selector de modo: Protección (recorta potencia si hace falta) vs
    // Gaming (solo ventiladores, sin throttling — para jugar tranquilo).
    let selectedMode = result.mode === 'gaming' ? 'gaming' : 'protection';
    const modeRow = document.createElement('div');
    modeRow.className = 'power-control-row power-guardian-mode';
    const modeLabel = document.createElement('span');
    modeLabel.className = 'power-control-unit power-guardian-row-label';
    modeLabel.textContent = tf('power.guardian.modeLabel', 'Modo') + ':';
    modeRow.appendChild(modeLabel);
    const modeSeg = document.createElement('div');
    modeSeg.className = 'segment power-guardian-modeseg';
    const modeBtns = {};
    [
      ['protection', tf('power.guardian.modeProtection', 'Protección')],
      ['gaming', tf('power.guardian.modeGaming', 'Gaming')],
    ].forEach(([key, lbl]) => {
      const b = document.createElement('button');
      b.type = 'button';
      if (selectedMode === key) b.classList.add('active');
      b.textContent = lbl;
      b.title = key === 'gaming'
        ? tf('power.guardian.modeGamingTip', 'Solo ventiladores al máximo: nunca recorta potencia, así no hay thermal throttling mientras juegas. Techos altos (95°C/87°C).')
        : tf('power.guardian.modeProtectionTip', 'Sube ventiladores y, si el calor persiste, recorta Dynamic Boost/PL2 para proteger el equipo. Uso general.');
      b.addEventListener('click', () => {
        selectedMode = key;
        Object.values(modeBtns).forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        // En Gaming subimos los techos por defecto si seguían en los de Protección.
        if (key === 'gaming') {
          if (Number(cpuRow.slider.value) <= 92) { cpuRow.slider.value = 95; cpuRow.num.value = 95; }
          if (Number(gpuRow.slider.value) <= 83) { gpuRow.slider.value = 87; gpuRow.num.value = 87; }
        }
        modeDesc.textContent = key === 'gaming' ? b.title : modeBtns.protection.title;
        const gShow = key === 'gaming' ? '' : 'none';
        gamingCapRow.style.display = gShow;
        gamingCapHint.style.display = gShow;
      });
      modeBtns[key] = b;
      modeSeg.appendChild(b);
    });
    modeRow.appendChild(modeSeg);
    section.appendChild(modeRow);
    const modeDesc = document.createElement('span');
    modeDesc.className = 'power-control-tooltip';
    modeDesc.textContent = modeBtns[selectedMode].title;
    section.appendChild(modeDesc);

    const cpuRow = buildGuardianTempRow(
      tf('power.guardian.cpuCeiling', 'Techo CPU'),
      result.cpuCeiling || 92,
      70,
      100
    );
    const gpuRow = buildGuardianTempRow(
      tf('power.guardian.gpuCeiling', 'Techo GPU'),
      result.gpuCeiling || result.ceiling || 83,
      70,
      87
    );
    section.appendChild(cpuRow.row);
    section.appendChild(gpuRow.row);

    // Tope de ventiladores SOLO para Gaming (default = máximo medido).
    const gc = await window.rog.getGamingCap().catch(() => ({}));
    const gamingCapRow = document.createElement('div');
    gamingCapRow.className = 'power-control-row power-guardian-gamingcap';
    const gcLabel = document.createElement('span');
    gcLabel.className = 'power-control-unit power-guardian-row-label';
    gcLabel.textContent = tf('power.guardian.gamingCap', 'Tope ventiladores Gaming') + ':';
    gamingCapRow.appendChild(gcLabel);
    const gcInput = document.createElement('input');
    gcInput.type = 'number';
    gcInput.className = 'power-numbox';
    gcInput.min = 2000;
    gcInput.max = (gc && gc.maxRpm) || 9000;
    gcInput.step = 100;
    gcInput.value = (gc && (gc.rpm || gc.maxRpm)) || '';
    gcInput.placeholder = gc && gc.maxRpm ? String(gc.maxRpm) : t('common.max');
    gamingCapRow.appendChild(gcInput);
    const gcUnit = document.createElement('span');
    gcUnit.className = 'power-control-unit';
    gcUnit.textContent = 'RPM';
    gamingCapRow.appendChild(gcUnit);
    const gamingCapHint = document.createElement('span');
    gamingCapHint.className = 'power-control-tooltip';
    gamingCapHint.textContent = tf('power.guardian.gamingCapHint',
      'Solo en Gaming: los ventiladores pueden subir hasta este tope (default = máximo medido). Súbelo para enfriar más; bájalo por ruido.');
    gcInput.addEventListener('change', async () => {
      const r = await window.rog.setGamingCap(Number(gcInput.value));
      if (r && r.ok) {
        powerToast(tf('power.guardian.gamingCapSaved', 'Tope de Gaming: {v} RPM ✓')
          .replace('{v}', r.rpm || gcInput.value));
      }
    });
    const gShow = selectedMode === 'gaming' ? '' : 'none';
    gamingCapRow.style.display = gShow;
    gamingCapHint.style.display = gShow;
    section.appendChild(gamingCapRow);
    section.appendChild(gamingCapHint);

    const fanNote = document.createElement('p');
    fanNote.className = 'power-guardian-note';
    fanNote.innerHTML = `<b>${tf('power.guardian.fanCap', 'Tope de ventiladores')}:</b> ` +
      escapeHtmlLocal(tf('power.guardian.fanCapBody',
        'El guardián usa el cap global que ya configuraste en Ventiladores. Si quieres menos ruido, baja ese cap; si quieres más protección térmica, súbelo.'));
    section.appendChild(fanNote);

    section.appendChild(renderGuardianCost());

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'ghost power-thermal-toggle';
    toggleBtn.textContent = result.active ? t('power.thermalDisable') : t('power.thermalEnable');
    toggleBtn.addEventListener('click', async () => {
      const enabling = !result.active;
      toggleBtn.disabled = true;
      toggleBtn.textContent = t('power.thermalApplying');
      let res;
      try {
        res = await window.rog.setThermalGuardian({
          enabled: enabling,
          cpuCeiling: Number(cpuRow.slider.value),
          gpuCeiling: Number(gpuRow.slider.value),
          mode: selectedMode,
        });
      } catch (err) {
        powerToast(`${t('power.thermalError')}: ${err.message}`, 'err');
        toggleBtn.disabled = false;
        toggleBtn.textContent = result.active ? t('power.thermalDisable') : t('power.thermalEnable');
        return;
      }
      if (!res || res.ok === false) {
        powerToast(`${t('power.thermalError')}: ${(res && res.err) || tf('power.err_unknown', 'error desconocido')}`, 'err');
        toggleBtn.disabled = false;
        toggleBtn.textContent = result.active ? t('power.thermalDisable') : t('power.thermalEnable');
        return;
      }
      powerToast(enabling ? `${tf('power.guardian.title', 'GUARDIÁN CPU/GPU')}: ${t('power.thermalActive')} ✓` : `${tf('power.guardian.title', 'GUARDIÁN CPU/GPU')}: ${t('power.thermalInactive')} ✓`, 'ok');
      await renderThermalGuardian(); // refresca con el estado real
    });
    section.appendChild(toggleBtn);
  }

  function buildGuardianTempRow(label, value, min, max) {
    const row = document.createElement('div');
    row.className = 'power-control-row power-thermal-row';

    const rowLabel = document.createElement('span');
    rowLabel.className = 'power-control-unit power-guardian-row-label';
    rowLabel.textContent = label + ':';
    row.appendChild(rowLabel);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'power-slider';
    slider.min = min;
    slider.max = max;
    slider.step = 1;
    slider.value = Math.max(min, Math.min(max, Number(value) || Math.round((min + max) / 2)));
    row.appendChild(slider);

    const num = document.createElement('input');
    num.type = 'number';
    num.className = 'power-numbox';
    num.min = min;
    num.max = max;
    num.value = slider.value;
    row.appendChild(num);

    const unit = document.createElement('span');
    unit.className = 'power-control-unit';
    unit.textContent = '°C';
    row.appendChild(unit);

    slider.addEventListener('input', () => { num.value = slider.value; });
    num.addEventListener('input', () => {
      const clamped = Math.max(min, Math.min(max, Number(num.value) || Number(slider.value)));
      num.value = clamped;
      slider.value = clamped;
    });

    return { row, slider, num };
  }

  function renderGuardianCost() {
    const box = document.createElement('div');
    box.className = 'power-guardian-cost';
    const priceKey = 'rogPowerKwhPrice';
    const defaultPrice = 0.18;
    let price = Number(localStorage.getItem(priceKey));
    if (!Number.isFinite(price) || price <= 0) price = defaultPrice;
    const cpuW = Number(latestStats?.cpu_watts || 0);
    const gpuW = Number(latestStats?.gpu?.active?.power || 0);
    const totalW = Math.max(0, cpuW + gpuW);
    const hourly = (totalW / 1000) * price;

    const label = document.createElement('span');
    label.className = 'power-control-label';
    label.textContent = tf('power.guardian.cost', 'Costo estimado');
    box.appendChild(label);

    const row = document.createElement('div');
    row.className = 'power-guardian-cost-row';
    const body = document.createElement('span');
    body.className = 'power-control-tooltip';
    body.textContent = tf('power.guardian.costBody',
      'Con los watts actuales del stream, una hora costaría aprox. {cost}. Edita el precio por kWh si tu tarifa es distinta.',
      { cost: `$${hourly.toFixed(3)}/h` });
    row.appendChild(body);

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'power-numbox';
    input.min = '0.01';
    input.step = '0.01';
    input.value = price.toFixed(2);
    input.title = 'USD/kWh';
    input.addEventListener('change', () => {
      const next = Number(input.value);
      if (Number.isFinite(next) && next > 0) localStorage.setItem(priceKey, String(next));
      renderThermalGuardian();
    });
    row.appendChild(input);
    box.appendChild(row);

    return box;
  }

  function escapeHtmlLocal(s) {
    if (typeof escapeHtml === 'function') return escapeHtml(s);
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function showPowerError(msg) {
    const unavail = $('power-unavail');
    if (unavail) {
      unavail.textContent = msg;
      unavail.style.display = 'block';
    }
    const cpuPanel = $('power-cpu-panel');
    const gpuPanel = $('power-gpu-panel');
    if (cpuPanel) cpuPanel.innerHTML = '';
    if (gpuPanel) gpuPanel.innerHTML = '';
  }

  /* ================================================================
     switchTab — cambia entre CPU y GPU.
  ================================================================= */
  function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll('#power-tabs button').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    const cpuPanel = $('power-cpu-panel');
    const gpuPanel = $('power-gpu-panel');
    const guardianPanel = $('power-guardian-panel');
    if (cpuPanel) cpuPanel.classList.toggle('active', tab === 'cpu');
    if (gpuPanel) gpuPanel.classList.toggle('active', tab === 'gpu');
    if (guardianPanel) guardianPanel.classList.toggle('active', tab === 'guardian');
  }

  /* ================================================================
     closePowerModal
  ================================================================= */
  function closePowerModal() {
    $('power-modal').classList.add('hidden');
  }

  /* ================================================================
     PANEL AVANZADO — marca + componente → docs oficiales + rangos seguros.
     Consume window.rog.getDeviceDocs() si existe; si no, hace fetch del JSON
     (creado por A-POWER-BE). Tolera que el archivo aún no exista.
  ================================================================= */

  // rutas relativas (file://) desde renderer/index.html hacia src/rog_monitor/.
  const DEVICE_DOCS_PATHS = [
    '../../src/rog_monitor/device_docs.json',
    '../src/rog_monitor/device_docs.json',
    'device_docs.json',
  ];

  async function loadDeviceDocs() {
    if (deviceDocs !== null) return deviceDocs;
    // 1) IPC nuevo, si A-POWER-BE/main lo expusieron
    if (window.rog && typeof window.rog.getDeviceDocs === 'function') {
      try {
        const res = await window.rog.getDeviceDocs();
        if (res && (res.vendors || res.docs || Array.isArray(res))) {
          deviceDocs = normalizeDocs(res);
          return deviceDocs;
        }
      } catch (_) { /* cae al fetch */ }
    }
    // 2) fetch directo del JSON (file://). Tolera ausencia.
    for (const p of DEVICE_DOCS_PATHS) {
      try {
        const r = await fetch(p);
        if (r && r.ok) {
          const json = await r.json();
          deviceDocs = normalizeDocs(json);
          return deviceDocs;
        }
      } catch (_) { /* siguiente ruta */ }
    }
    deviceDocs = false; // marcado como "intentado y no disponible"
    return deviceDocs;
  }

  /* normalizeDocs — acepta varias formas posibles del JSON de A-POWER-BE y lo
     reduce a una lista de entradas {vendor, component_class, safe_range_rules,
     official_docs:[{title,url}]}. Robusto ante esquema aún no congelado. */
  function normalizeDocs(json) {
    let entries = [];
    if (Array.isArray(json)) {
      entries = json;
    } else if (json && Array.isArray(json.entries)) {
      entries = json.entries;
    } else if (json && Array.isArray(json.docs)) {
      entries = json.docs;
    } else if (json && json.vendors && typeof json.vendors === 'object') {
      // forma { vendors: { ASUS: { components: { "GPU-laptop": {...} } } } }
      for (const [vendor, vobj] of Object.entries(json.vendors)) {
        const comps = (vobj && (vobj.components || vobj.component_classes)) || {};
        for (const [cc, cobj] of Object.entries(comps)) {
          entries.push(Object.assign({ vendor, component_class: cc }, cobj));
        }
      }
    } else if (json && typeof json === 'object') {
      // forma plana { "ASUS": { "GPU-laptop": {...} } }
      for (const [vendor, vobj] of Object.entries(json)) {
        if (!vobj || typeof vobj !== 'object' || vendor.startsWith('_')) continue;
        for (const [cc, cobj] of Object.entries(vobj)) {
          if (!cobj || typeof cobj !== 'object') continue;
          entries.push(Object.assign({ vendor, component_class: cc }, cobj));
        }
      }
    }
    // normalizar campos por entrada
    return entries.map((e) => ({
      vendor: e.vendor || e.brand || '—',
      component_class: e.component_class || e.component || e.class || '—',
      safe_range_rules: e.safe_range_rules || e.safe_ranges || e.safe_range || e.rules || '',
      official_docs: Array.isArray(e.official_docs) ? e.official_docs
        : (Array.isArray(e.docs) ? e.docs
        : (Array.isArray(e.links) ? e.links : [])),
      models: Array.isArray(e.models) ? e.models : [],
      safe_range_rules_i18n: e.safe_range_rules_i18n || e.i18n || null,
      source: e.source || e.cite || '',
    })).filter((e) => e.vendor && e.component_class);
  }

  async function toggleAdvancedPanel() {
    const panel = $('power-advanced-panel');
    if (!panel) return;
    if (panel.classList.contains('hidden')) {
      await renderAdvancedPanel();
      panel.classList.remove('hidden');
      const btn = $('power-advanced-btn');
      if (btn) btn.classList.add('active');
    } else {
      closeAdvancedPanel();
    }
    refreshApplyState();
  }

  function closeAdvancedPanel() {
    const panel = $('power-advanced-panel');
    if (panel) panel.classList.add('hidden');
    const btn = $('power-advanced-btn');
    if (btn) btn.classList.remove('active');
  }

  async function renderAdvancedPanel() {
    const panel = $('power-advanced-panel');
    if (!panel) return;
    panel.innerHTML = `<p class="dim" style="padding:0.6rem">${t('power.loading')}</p>`;

    const docs = await loadDeviceDocs();
    panel.innerHTML = '';

    // título + intro del panel
    const intro = document.createElement('p');
    intro.className = 'power-advanced-intro';
    intro.textContent = tf('power.advanced.intro',
      'Modo avanzado: elige marca y componente para ver la documentación oficial y los rangos seguros. Estos límites varían por modelo; consulta siempre la fuente oficial antes de salir del rango seguro.');
    panel.appendChild(intro);

    if (!docs || docs.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'power-control-reason';
      empty.textContent = tf('power.advanced.unavailable',
        'La base de documentación de dispositivos aún no está disponible. Igual puedes ajustar dentro de los rangos seguros detectados para tu equipo.');
      panel.appendChild(empty);
      appendAdvancedAck(panel);
      return;
    }

    // selectores marca + componente
    const selRow = document.createElement('div');
    selRow.className = 'power-advanced-selrow';

    const vendors = Array.from(new Set(docs.map((d) => d.vendor))).sort();
    const vendorSel = document.createElement('select');
    vendorSel.className = 'power-advanced-select';
    vendorSel.setAttribute('aria-label', tf('power.advanced.brand', 'Marca'));
    addPlaceholderOption(vendorSel, tf('power.advanced.brand', 'Marca'));
    vendors.forEach((v) => vendorSel.appendChild(option(v, v)));

    const compSel = document.createElement('select');
    compSel.className = 'power-advanced-select';
    compSel.setAttribute('aria-label', tf('power.advanced.component', 'Componente'));
    addPlaceholderOption(compSel, tf('power.advanced.component', 'Componente'));
    compSel.disabled = true;

    const modelInput = document.createElement('input');
    modelInput.className = 'power-advanced-select power-advanced-search';
    modelInput.type = 'search';
    modelInput.placeholder = tf('power.advanced.modelPlaceholder', 'Buscar: RTX 4080, 14900HX, Legion...');
    modelInput.setAttribute('aria-label', tf('power.advanced.model', 'Modelo / SKU'));
    modelInput.setAttribute('list', 'power-advanced-model-list');

    const modelList = document.createElement('datalist');
    modelList.id = 'power-advanced-model-list';
    Array.from(new Set(docs.flatMap((d) => d.models || [])))
      .sort((a, b) => String(a).localeCompare(String(b)))
      .forEach((m) => modelList.appendChild(option(m, m)));

    selRow.appendChild(labeled(tf('power.advanced.brand', 'Marca'), vendorSel));
    selRow.appendChild(labeled(tf('power.advanced.component', 'Componente'), compSel));
    selRow.appendChild(labeled(tf('power.advanced.model', 'Modelo / SKU'), modelInput));
    panel.appendChild(selRow);
    panel.appendChild(modelList);

    const tools = document.createElement('div');
    tools.className = 'power-advanced-tools';
    const supportedBtn = document.createElement('button');
    supportedBtn.type = 'button';
    supportedBtn.className = 'ghost';
    supportedBtn.textContent = tf('power.advanced.showSupported', 'Ver soportados');
    const supportedMeta = document.createElement('span');
    supportedMeta.className = 'power-advanced-supported-meta';
    supportedMeta.textContent = tf('power.advanced.supportedSummary',
      '{count} entradas actuales en la base de documentación.', { count: docs.length });
    tools.appendChild(supportedBtn);
    tools.appendChild(supportedMeta);
    panel.appendChild(tools);

    const result = document.createElement('div');
    result.className = 'power-advanced-result';
    panel.appendChild(result);
    let showSupported = false;

    function refreshComponents() {
      const v = vendorSel.value;
      compSel.innerHTML = '';
      addPlaceholderOption(compSel, tf('power.advanced.component', 'Componente'));
      const comps = Array.from(new Set(
        docs.filter((d) => d.vendor === v).map((d) => d.component_class))).sort();
      comps.forEach((c) => compSel.appendChild(option(c, componentLabel(c))));
      compSel.disabled = !v;
      result.innerHTML = '';
    }

    function refreshResult() {
      const v = vendorSel.value;
      const c = compSel.value;
      const q = modelInput.value.trim();
      result.innerHTML = '';
      const matches = showSupported ? filterDocEntries(docs, v, c, q || '') : filterDocEntries(docs, v, c, q);
      if (!matches.length) {
        if (v || c || q) {
          const empty = document.createElement('p');
          empty.className = 'power-control-reason';
          empty.textContent = tf('power.advanced.noMatches',
            'Sin coincidencias. Usa marca/componente o agrega una entrada oficial a device_docs.json.');
          result.appendChild(empty);
        }
        return;
      }

      const title = document.createElement('div');
      title.className = 'power-advanced-doclabel';
      title.textContent = `${tf('power.advanced.matches', 'Coincidencias')}: ${matches.length}`;
      result.appendChild(title);
      matches.slice(0, 8).forEach((entry) => result.appendChild(renderDocEntry(entry)));
    }

    vendorSel.addEventListener('change', () => { refreshComponents(); refreshResult(); });
    compSel.addEventListener('change', refreshResult);
    modelInput.addEventListener('input', refreshResult);
    supportedBtn.addEventListener('click', () => {
      showSupported = !showSupported;
      supportedBtn.textContent = showSupported
        ? tf('power.advanced.hideSupported', 'Ocultar soportados')
        : tf('power.advanced.showSupported', 'Ver soportados');
      refreshResult();
    });

    appendAdvancedAck(panel);
  }

  function filterDocEntries(docs, vendor, component, query) {
    const q = String(query || '').trim().toLowerCase();
    return docs.filter((entry) => {
      if (vendor && entry.vendor !== vendor) return false;
      if (component && entry.component_class !== component) return false;
      if (!q) return true;
      return docSearchText(entry).includes(q);
    });
  }

  function docSearchText(entry) {
    const parts = [
      entry.vendor,
      entry.component_class,
      entry.source,
      typeof entry.safe_range_rules === 'string'
        ? entry.safe_range_rules
        : JSON.stringify(entry.safe_range_rules || ''),
      ...(entry.models || []),
      ...((entry.official_docs || []).flatMap((d) => [d.title, d.url, d.name])),
    ];
    return parts.filter(Boolean).join(' ').toLowerCase();
  }

  function renderDocEntry(entry) {
    const box = document.createElement('div');
    box.className = 'power-advanced-entry';

    const heading = document.createElement('div');
    heading.className = 'power-advanced-entry-title';
    heading.textContent = `${entry.vendor} · ${componentLabel(entry.component_class)}`;
    box.appendChild(heading);

    if (entry.safe_range_rules) {
      const rules = document.createElement('div');
      rules.className = 'power-advanced-rules';
      const rlabel = document.createElement('strong');
      rlabel.textContent = tf('power.advanced.safeRangeRules', 'Rangos seguros') + ': ';
      rules.appendChild(rlabel);
      const rtext = document.createElement('span');
      rtext.textContent = safeRuleText(entry);
      rules.appendChild(rtext);
      box.appendChild(rules);
    }

    if (entry.models && entry.models.length) {
      const models = document.createElement('div');
      models.className = 'power-advanced-models';
      const label = document.createElement('strong');
      label.textContent = tf('power.advanced.models', 'Modelos / familias') + ': ';
      models.appendChild(label);
      entry.models.slice(0, 18).forEach((m) => {
        const chip = document.createElement('span');
        chip.className = 'power-advanced-model-chip';
        chip.textContent = m;
        models.appendChild(chip);
      });
      if (entry.models.length > 18) {
        const more = document.createElement('span');
        more.className = 'power-advanced-model-chip muted';
        more.textContent = `+${entry.models.length - 18}`;
        models.appendChild(more);
      }
      box.appendChild(models);
    }

    const docs = entry.official_docs || [];
    if (docs.length) {
      const dlabel = document.createElement('div');
      dlabel.className = 'power-advanced-doclabel';
      dlabel.textContent = tf('power.advanced.officialDocs', 'Documentación oficial') + ':';
      box.appendChild(dlabel);

      const ul = document.createElement('ul');
      ul.className = 'power-advanced-links';
      docs.forEach((d) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = d.url || '#';
        a.textContent = d.title || d.url || d.name || '—';
        a.rel = 'noopener noreferrer';
        a.target = '_blank';
        // abrir en el navegador externo del SO en lugar de dentro de Electron
        a.addEventListener('click', (e) => {
          e.preventDefault();
          openExternal(d.url);
        });
        li.appendChild(a);
        ul.appendChild(li);
      });
      box.appendChild(ul);
    }

    if (entry.source) {
      const src = document.createElement('div');
      src.className = 'power-advanced-source';
      src.textContent = tf('power.advanced.source', 'Fuente') + ': ' + entry.source;
      box.appendChild(src);
    }
    return box;
  }

  function currentLang() {
    return window.i18n && typeof window.i18n.get === 'function' ? window.i18n.get() : 'es';
  }

  function safeRuleText(entry) {
    const lang = currentLang();
    const localized = entry.safe_range_rules_i18n;
    if (localized && typeof localized === 'object') {
      return localized[lang] || localized.es || localized.en || '';
    }
    const rules = entry.safe_range_rules;
    if (typeof rules === 'string') return rules;
    if (rules && typeof rules === 'object') {
      return rules[`text_${lang}`] || rules.text_es || rules.text || JSON.stringify(rules);
    }
    return '';
  }

  function openExternal(url) {
    if (!url) return;
    if (window.rog && typeof window.rog.openExternal === 'function') {
      try { window.rog.openExternal(url); return; } catch (_) {}
    }
    try { window.open(url, '_blank', 'noopener'); } catch (_) {}
  }

  function appendAdvancedAck(panel) {
    const ackWrap = document.createElement('label');
    ackWrap.className = 'power-advanced-ack';
    const ack = document.createElement('input');
    ack.type = 'checkbox';
    ack.id = 'power-advanced-ack';
    ack.checked = advancedAck;
    const span = document.createElement('span');
    span.textContent = ' ' + tf('power.advanced.ack', 'Entiendo los riesgos');
    ackWrap.appendChild(ack);
    ackWrap.appendChild(span);
    panel.appendChild(ackWrap);

    ack.addEventListener('change', () => {
      advancedAck = ack.checked;
      refreshApplyState();
    });
  }

  /* helpers DOM del panel avanzado */
  function option(value, label) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    return o;
  }
  function addPlaceholderOption(sel, text) {
    const o = document.createElement('option');
    o.value = '';
    o.textContent = '— ' + text + ' —';
    sel.appendChild(o);
  }
  function labeled(labelText, el) {
    const w = document.createElement('label');
    w.className = 'power-advanced-field';
    const l = document.createElement('span');
    l.className = 'power-advanced-fieldlabel';
    l.textContent = labelText;
    w.appendChild(l);
    w.appendChild(el);
    return w;
  }
  const COMPONENT_LABELS = {
    'CPU-laptop': ['power.advanced.cc.cpuLaptop', 'CPU (portátil)'],
    'CPU-desktop': ['power.advanced.cc.cpuDesktop', 'CPU (escritorio)'],
    'GPU-laptop': ['power.advanced.cc.gpuLaptop', 'GPU (portátil)'],
    'GPU-desktop': ['power.advanced.cc.gpuDesktop', 'GPU (escritorio)'],
  };
  function componentLabel(cc) {
    const e = COMPONENT_LABELS[cc];
    return e ? tf(e[0], e[1]) : cc;
  }

  /* ================================================================
     applyPower — DETECCIÓN POR-CAMBIO + confirmación + setPowerControl.
     El resumen menciona SOLO los controles que se movieron (old→new).
  ================================================================= */
  async function applyPower() {
    if (Object.keys(pendingChanges).length === 0) return;

    // Si el panel avanzado está abierto, exigir el check "Entiendo los riesgos".
    if (!isAdvancedPanelHidden() && !advancedAck) {
      powerToast(tf('power.advanced.needAck',
        'Marca "Entiendo los riesgos" en el panel Avanzado para aplicar.'), 'warn');
      return;
    }

    const changes = buildChangeList();
    if (changes.length === 0) return;

    // resumen: SOLO lo que se movió
    const beyond = changes.filter((c) => c.beyondSafe);

    // Single pre-confirm: shows exactly what changes, warns about beyond-safe values
    // and that pkexec will ask for the user's password — no stacked dialogs.
    const changeLines = changes.map((c) => {
      const flag = c.beyondSafe ? ' ⚠' : '';
      return '  • ' + tf('power.danger.moved', 'Moviste {label} {from}→{to} {unit}', {
        label: c.label, from: c.from, to: c.to, unit: c.unit,
      }) + flag;
    });

    let msg =
      tf('power.confirm.onlyChanged', 'Vas a aplicar SOLO estos cambios:') + '\n' +
      changeLines.join('\n') + '\n\n' +
      tf('power.confirm.rails',
        'Los valores van acotados a los rangos seguros de tu dispositivo (doble recorte) y el firmware impone sus propios topes. Si algo falla, reinicia y usa Reset a fábrica; estos cambios no sobreviven a un apagón forzado.');

    if (beyond.length > 0) {
      msg += '\n\n' + tf('power.confirm.beyondBody',
        'Estos valores superan el rango seguro recomendado para tu dispositivo. El riesgo de inestabilidad o daño es MAYOR — los cambios marcados con ⚠ están fuera de ese rango.');
    }

    msg += '\n\n' + tf('power.confirm.pkexec',
      'Se pedirá tu contraseña de administrador (pkexec) para escribir en el firmware. ROG Monitor no almacena tu contraseña.');

    if (!(await window.rogConfirm(msg, {
      title: tf('power.confirm.title', 'CENTRO DE PODER — Confirmar cambios'),
      okLabel: tf('power.confirm.continueBtn', 'CONTINUAR Y APLICAR'),
    }))) return;

    const applyBtn = $('power-apply');
    if (applyBtn) {
      applyBtn.disabled = true;
      applyBtn.textContent = tf('power.applying', 'APLICANDO…');
    }

    let result;
    try {
      result = await window.rog.setPowerControl(pendingChanges);
    } catch (err) {
      powerToast(`${tf('power.err', 'Error')}: ${err.message}`, 'err');
      if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = tf('power.apply', 'APLICAR'); }
      return;
    }

    if (applyBtn) applyBtn.textContent = tf('power.apply', 'APLICAR');

    if (!result || result.ok === false) {
      powerToast(`${tf('power.err_apply', 'No se aplicó')}: ${(result && result.err) || tf('power.err_unknown', 'error desconocido')}`, 'err');
      if (applyBtn) applyBtn.disabled = false;
      return;
    }

    // actualizar estado local con los valores frescos del hardware
    if (result.controls) {
      powerState.controls = result.controls;
    }

    pendingChanges = {};
    if (applyBtn) applyBtn.disabled = true;

    // refrescar los paneles con los nuevos valores del hardware
    await openPowerModal();
    powerToast(t('power.applied_ok'), 'ok');
  }

  /* ================================================================
     resetPower — restaura todos los valores a fábrica.
  ================================================================= */
  async function resetPower() {
    if (!(await window.rogConfirm(
      tf('power.reset.title', 'RESET A FÁBRICA') + '\n\n' +
      tf('power.reset.body',
        'Restaura los límites de potencia a los valores con los que vino tu equipo, detectados y guardados la primera vez que abriste la app.') + '\n\n' +
      tf('power.reset.question', '¿Continuar?'),
      { title: tf('power.reset.title', 'RESET A FÁBRICA') }
    ))) return;

    const resetBtn = $('power-reset');
    if (resetBtn) { resetBtn.disabled = true; resetBtn.textContent = tf('power.resetting', 'RESETEANDO…'); }

    let result;
    try {
      result = await window.rog.resetPowerControl();
    } catch (err) {
      powerToast(`${tf('power.err_reset', 'Error al resetear')}: ${err.message}`, 'err');
      if (resetBtn) { resetBtn.disabled = false; resetBtn.textContent = tf('power.reset', 'RESET A FÁBRICA'); }
      return;
    }

    if (resetBtn) resetBtn.textContent = tf('power.reset', 'RESET A FÁBRICA');

    if (!result || result.ok === false) {
      powerToast(`${tf('power.err_reset', 'No se pudo resetear')}: ${(result && result.err) || tf('power.err_unknown', 'error desconocido')}`, 'err');
      if (resetBtn) resetBtn.disabled = false;
      return;
    }

    if (resetBtn) resetBtn.disabled = false;
    pendingChanges = {};

    // refrescar toda la UI con los valores de fábrica
    await openPowerModal();
    powerToast(t('power.reset_ok'), 'ok');
  }

  /* ================================================================
     powerToast — usa el toast global si está disponible, o una
     implementación local como fallback.
     kind: 'ok' | 'warn' | 'err' (default 'ok')
  ================================================================= */
  function powerToast(msg, kind) {
    const k = kind || 'ok';
    if (typeof toast === 'function') {
      toast(msg, k);
    } else {
      // fallback: no innerHTML variant support, plain text
      const el = $('toast');
      if (el) {
        el.textContent = msg;
        el.classList.remove('hidden', 'toast-ok', 'toast-warn', 'toast-err');
        el.classList.add('toast-' + k);
        setTimeout(() => el.classList.add('hidden'), 5000);
      }
    }
  }

  /* ================================================================
     INICIALIZACIÓN — wiring de eventos después de que el DOM cargue.
  ================================================================= */
  document.addEventListener('DOMContentLoaded', () => {
    // botón PODER en la topbar
    const powerBtn = $('power-btn');
    if (powerBtn) powerBtn.addEventListener('click', openPowerModal);

    // botón AVANZADO
    const advBtn = $('power-advanced-btn');
    if (advBtn) advBtn.addEventListener('click', toggleAdvancedPanel);

    // pestañas CPU / GPU
    document.querySelectorAll('#power-tabs button').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // botones de acción
    const applyBtn = $('power-apply');
    if (applyBtn) applyBtn.addEventListener('click', applyPower);

    const resetBtn = $('power-reset');
    if (resetBtn) resetBtn.addEventListener('click', resetPower);

    const cancelBtn = $('power-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closePowerModal);

    // cerrar al hacer clic en el fondo (backdrop)
    const modal = $('power-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closePowerModal();
      });
    }

    // hacer arrastrable (como los demás modales — usa el mismo makeDraggable)
    if (typeof makeDraggable === 'function') {
      makeDraggable('power-modal');
    }
  });

})();
