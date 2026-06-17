/* ===================================================================
   CENTRO DE PODER — power.js
   UI del modal #power-modal: control de potencia CPU/GPU.
   Archivo propio de Agent 2 — no tocar app.js ni update().
   =================================================================== */

(function () {
  'use strict';

  /* ---- helpers locales ---- */
  const $ = (id) => document.getElementById(id);
  // window.t/window.i18n SIEMPRE existen (stub seguro de A1 si aún no implementa).
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);

  /* ---- i18n: claves power.* viven ahora en i18n.js CORE (8 idiomas, dueño A4) ---- */

  /* ---- estado del módulo ---- */
  let powerState = null;       // última respuesta de getPowerControl()
  let pendingChanges = {};     // { pl1: 120, pl2: 160, … }
  let activeTab = 'cpu';       // 'cpu' | 'gpu'
  let advancedConsent = {};    // { base_clock_offset: true, … } — consentimiento avanzado por clave
  let thermalState = null;     // última respuesta de getThermalGuardian()

  /* ================================================================
     SUSCRIPTOR LIVE: se registra UNA sola vez y actualiza las cabeceras
     con los valores actuales sin reconstruir los sliders.
  ================================================================= */
  window.rog.onStats((stats) => {
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
        reasonEl.textContent = ctrl.reason || (isOffset ? t('power.nvmlUnavailable') : 'No disponible en esta configuración');
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

      advCheck.addEventListener('change', () => {
        if (advCheck.checked) {
          const ok = window.confirm(
            `${t('power.consentTitle')}\n\n${t('power.consentAdvanced')}\n\n` +
            `${t('power.consentOverclock')}\n\n${t('power.consentUndervolt')}\n\n` +
            `${t('power.consentRecover')}`
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
      });
    }
  }

  /* ================================================================
     powerTooltip — explicación corta de cada control (i18n, 8 idiomas).
     La explicación larga (rango seguro + efecto) vive en power.explain.<key>.body
     y se usa en el modal de detalle (ver explainKeyTitle/explainKeyBody).
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

  function explainKeyTitle(key) {
    const ek = EXPLAIN_KEYS[key];
    return ek ? t(`power.explain.${ek}.title`) : '';
  }

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
    // activar/desactivar botón APLICAR según si hay cambios
    const applyBtn = $('power-apply');
    if (applyBtn) applyBtn.disabled = Object.keys(pendingChanges).length === 0;
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
     openPowerModal — llama a getPowerControl(), construye los sliders
     y abre el modal.
  ================================================================= */
  async function openPowerModal() {
    const modal = $('power-modal');
    pendingChanges = {};
    modal.classList.remove('hidden');

    // mostrar estado de carga
    const cpuPanel = $('power-cpu-panel');
    const gpuPanel = $('power-gpu-panel');
    const unavail = $('power-unavail');
    if (cpuPanel) cpuPanel.innerHTML = '<p class="dim" style="padding:1rem">Cargando…</p>';
    if (gpuPanel) gpuPanel.innerHTML = '';
    if (unavail) unavail.style.display = 'none';

    let result;
    try {
      result = await window.rog.getPowerControl();
    } catch (err) {
      showPowerError(`No se pudo obtener el estado de potencia: ${err.message}`);
      return;
    }

    if (!result || result.ok === false) {
      showPowerError(result ? result.err : 'Sin respuesta del backend');
      return;
    }

    powerState = result;

    if (!result.available) {
      showPowerError('Control de potencia no disponible en este equipo.');
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

      // separador + sección del guardián térmico (debajo de los sliders GPU)
      const hr = document.createElement('hr');
      hr.className = 'power-divider';
      gpuPanel.appendChild(hr);

      const guardianSection = document.createElement('div');
      guardianSection.id = 'power-thermal-guardian';
      guardianSection.className = 'power-thermal-guardian';
      guardianSection.innerHTML = `<p class="dim" style="padding:0.5rem 0">${t('power.thermalLoading')}</p>`;
      gpuPanel.appendChild(guardianSection);
      renderThermalGuardian(); // async, pinta cuando llegue la respuesta
    }

    // resetear advertencia PL y botón aplicar
    checkPlConstraint();
    const applyBtn = $('power-apply');
    if (applyBtn) applyBtn.disabled = true;

    // activar la pestaña que estaba activa
    switchTab(activeTab);
  }

  /* ================================================================
     renderThermalGuardian — pinta la sección del guardián térmico GPU
     dentro del tab GPU (4 estados: cargando / activo / inactivo / error).
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
    labelSpan.textContent = t('power.thermalGuardian');
    const statusBadge = document.createElement('span');
    statusBadge.className = 'power-thermal-status' + (result.active ? ' active' : '');
    statusBadge.textContent = result.active ? t('power.thermalActive') : t('power.thermalInactive');
    header.appendChild(labelSpan);
    header.appendChild(statusBadge);
    section.appendChild(header);

    const desc = document.createElement('span');
    desc.className = 'power-control-tooltip';
    desc.textContent = t('power.thermalGuardianDesc');
    section.appendChild(desc);

    if (!result.scriptExists) {
      const warn = document.createElement('p');
      warn.className = 'power-control-reason';
      warn.textContent = t('power.thermalNotInstalled');
      section.appendChild(warn);
      return;
    }

    // fila: techo (slider) + botón activar/desactivar
    const rowEl = document.createElement('div');
    rowEl.className = 'power-control-row power-thermal-row';

    const ceilLabel = document.createElement('span');
    ceilLabel.className = 'power-control-unit';
    ceilLabel.textContent = t('power.thermalCeiling') + ':';
    rowEl.appendChild(ceilLabel);

    const ceilSlider = document.createElement('input');
    ceilSlider.type = 'range';
    ceilSlider.className = 'power-slider';
    ceilSlider.min = 75;
    ceilSlider.max = 87;
    ceilSlider.step = 1;
    ceilSlider.value = result.ceiling || 83;
    rowEl.appendChild(ceilSlider);

    const ceilNum = document.createElement('input');
    ceilNum.type = 'number';
    ceilNum.className = 'power-numbox';
    ceilNum.min = 75;
    ceilNum.max = 87;
    ceilNum.value = ceilSlider.value;
    rowEl.appendChild(ceilNum);

    const ceilUnit = document.createElement('span');
    ceilUnit.className = 'power-control-unit';
    ceilUnit.textContent = '°C';
    rowEl.appendChild(ceilUnit);

    ceilSlider.addEventListener('input', () => { ceilNum.value = ceilSlider.value; });
    ceilNum.addEventListener('input', () => {
      const clamped = Math.max(75, Math.min(87, Number(ceilNum.value) || 83));
      ceilNum.value = clamped;
      ceilSlider.value = clamped;
    });

    section.appendChild(rowEl);

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
          ceiling: Number(ceilSlider.value),
        });
      } catch (err) {
        powerToast(`${t('power.thermalError')}: ${err.message}`);
        toggleBtn.disabled = false;
        toggleBtn.textContent = result.active ? t('power.thermalDisable') : t('power.thermalEnable');
        return;
      }
      if (!res || res.ok === false) {
        powerToast(`${t('power.thermalError')}: ${(res && res.err) || 'error desconocido'}`);
        toggleBtn.disabled = false;
        toggleBtn.textContent = result.active ? t('power.thermalDisable') : t('power.thermalEnable');
        return;
      }
      powerToast(enabling ? `${t('power.thermalGuardian')}: ${t('power.thermalActive')} ✓` : `${t('power.thermalGuardian')}: ${t('power.thermalInactive')} ✓`);
      await renderThermalGuardian(); // refresca con el estado real
    });
    section.appendChild(toggleBtn);
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
    if (cpuPanel) cpuPanel.classList.toggle('active', tab === 'cpu');
    if (gpuPanel) gpuPanel.classList.toggle('active', tab === 'gpu');
  }

  /* ================================================================
     closePowerModal
  ================================================================= */
  function closePowerModal() {
    $('power-modal').classList.add('hidden');
  }

  /* ================================================================
     applyPower — muestra confirmación y llama a setPowerControl.
  ================================================================= */
  async function applyPower() {
    if (Object.keys(pendingChanges).length === 0) return;

    const lines = Object.entries(pendingChanges).map(([key, val]) => {
      const ctrl = powerState && powerState.controls && powerState.controls[key];
      const label = ctrl ? (ctrl.label || key) : key;
      const unit = ctrl ? (ctrl.unit || '') : '';
      return `  • ${label}: ${val} ${unit}`;
    });

    const msg =
      '⚠ CENTRO DE PODER — Confirmar cambios\n\n' +
      lines.join('\n') +
      '\n\n' +
      'Esto escribe límites de potencia y térmicos en el firmware. Leélo:\n\n' +
      '• Subir clocks o potencia (overclock) puede causar cuelgues, artefactos y, ' +
      'en casos extremos, DAÑAR tu equipo de forma permanente.\n' +
      '• Bajar demasiado la potencia (estilo undervolt) puede volver el equipo ' +
      'INESTABLE: puede congelarse, apagarse o reiniciarse solo.\n' +
      '• Si algo sale mal, REINICIA el equipo y usa RESET A FÁBRICA para volver ' +
      'a como vino. Estos cambios no sobreviven un apagón forzado.\n\n' +
      'Los valores van acotados a los rangos seguros de tu firmware, pero la ' +
      'decisión de aplicarlos es tuya.\n\n' +
      '¿Aplicar?';

    if (!window.confirm(msg)) return;

    const applyBtn = $('power-apply');
    if (applyBtn) {
      applyBtn.disabled = true;
      applyBtn.textContent = 'APLICANDO…';
    }

    let result;
    try {
      result = await window.rog.setPowerControl(pendingChanges);
    } catch (err) {
      powerToast(`Error: ${err.message}`);
      if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = 'APLICAR'; }
      return;
    }

    if (applyBtn) applyBtn.textContent = 'APLICAR';

    if (!result || result.ok === false) {
      powerToast(`No se aplicó: ${(result && result.err) || 'error desconocido'}`);
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
    powerToast('Límites de potencia aplicados ✓');
  }

  /* ================================================================
     resetPower — restaura todos los valores a fábrica.
  ================================================================= */
  async function resetPower() {
    if (!window.confirm(
      'RESET A FÁBRICA\n\nRestaura los límites de potencia a los valores con los que ' +
      'vino TU equipo — detectados y guardados la primera vez que abriste la app ' +
      '(no los de las fotos).\n\n¿Continuar?'
    )) return;

    const resetBtn = $('power-reset');
    if (resetBtn) { resetBtn.disabled = true; resetBtn.textContent = 'RESETEANDO…'; }

    let result;
    try {
      result = await window.rog.resetPowerControl();
    } catch (err) {
      powerToast(`Error al resetear: ${err.message}`);
      if (resetBtn) { resetBtn.disabled = false; resetBtn.textContent = 'RESET A FÁBRICA'; }
      return;
    }

    if (resetBtn) resetBtn.textContent = 'RESET A FÁBRICA';

    if (!result || result.ok === false) {
      powerToast(`No se pudo resetear: ${(result && result.err) || 'error desconocido'}`);
      if (resetBtn) resetBtn.disabled = false;
      return;
    }

    if (resetBtn) resetBtn.disabled = false;
    pendingChanges = {};

    // refrescar toda la UI con los valores de fábrica
    await openPowerModal();
    powerToast('Valores de fábrica restaurados ✓');
  }

  /* ================================================================
     powerToast — usa el toast global si está disponible, o una
     implementación local como fallback.
  ================================================================= */
  function powerToast(msg) {
    if (typeof toast === 'function') {
      toast(msg);
    } else {
      const el = $('toast');
      if (el) {
        el.textContent = msg;
        el.classList.remove('hidden');
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
