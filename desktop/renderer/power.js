/* ===================================================================
   CENTRO DE PODER — power.js
   UI del modal #power-modal: control de potencia CPU/GPU.
   Archivo propio de Agent 2 — no tocar app.js ni update().
   =================================================================== */

(function () {
  'use strict';

  /* ---- helpers locales ---- */
  const $ = (id) => document.getElementById(id);

  /* ---- estado del módulo ---- */
  let powerState = null;       // última respuesta de getPowerControl()
  let pendingChanges = {};     // { pl1: 120, pl2: 160, … }
  let activeTab = 'cpu';       // 'cpu' | 'gpu'

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
        liveEl.textContent = `actual: ${ctrl.value} ${ctrl.unit || ''}`;
      }
    }
  }

  /* ================================================================
     buildSliders — construye los controles de un tab dado la respuesta
     de getPowerControl(). Devuelve un <div> listo para insertar.
  ================================================================= */
  function buildSliders(controls, tabKeys) {
    const wrap = document.createElement('div');

    tabKeys.forEach((key, idx) => {
      const ctrl = controls[key];
      if (!ctrl) return;

      const isLocked = !ctrl.writable;
      const block = document.createElement('div');
      block.className = 'power-control' + (isLocked ? ' locked' : '');
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
      defaultSpan.textContent = `fábrica: ${ctrl.default} ${ctrl.unit || ''}`;

      header.appendChild(labelSpan);
      header.appendChild(unitSpan);
      header.appendChild(defaultSpan);
      block.appendChild(header);

      // live actual value badge
      const liveNote = document.createElement('span');
      liveNote.className = 'power-live-note';
      liveNote.dataset.powerLive = key;
      liveNote.textContent = ctrl.value !== undefined ? `actual: ${ctrl.value} ${ctrl.unit || ''}` : '';
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
        reasonEl.textContent = ctrl.reason || 'No disponible en esta configuración';
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
        tick.title = `fábrica: ${ctrl.default} ${ctrl.unit || ''}`;
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
     powerTooltip — descripción Armoury Crate traducida al español.
  ================================================================= */
  function powerTooltip(key) {
    return {
      pl1: 'Límite de potencia CPU sostenible: el procesador intenta mantenerse en este tope durante uso prolongado.',
      pl2: 'Límite de potencia CPU en ráfaga (máx. 2 min): permite picos de rendimiento cortos antes de caer al PL1.',
      dynamic_boost: 'Pasa vatios de CPU a la GPU cuando la carga gráfica lo demanda, hasta este máximo.',
      thermal_target: 'La GPU se mantiene en o por debajo de esta temperatura ajustando su potencia automáticamente.',
      base_clock_offset: 'Desplazamiento de frecuencia base del núcleo gráfico. Requiere sesión X11 con Coolbits.',
      mem_clock_offset: 'Desplazamiento de frecuencia de la memoria de video. Requiere sesión X11 con Coolbits.',
    }[key] || '';
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
    }

    // resetear advertencia PL y botón aplicar
    checkPlConstraint();
    const applyBtn = $('power-apply');
    if (applyBtn) applyBtn.disabled = true;

    // activar la pestaña que estaba activa
    switchTab(activeTab);
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
