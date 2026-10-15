/* ROG Monitor — interfaz del editor de gráficas del historial (S02-2).
 * N-A3-01 aspecto · N-A3-02 reordenar con ratón (arrastrar con Pointer Events) y teclado (↑/↓, Alt+↑/↓)
 * · F4-09 (corte editor): Escape, foco al abrir/cerrar y orden de Tab.
 * Script clásico cargado DESPUÉS de app.js: usa sus globales (histList, setHistCharts,
 * CHART_CATALOG, HIST_PRESETS, t, $, escapeHtml…).
 * Toda la lógica de lista/orden vive en chart-editor-model.js (puro, con tests);
 * aquí solo se pinta y se cablean eventos. app.js lo avisa con RogChartEditorUI.sync()
 * al cambiar la lista. */
(function () {
  'use strict';
  const CE = window.RogChartEditor;
  const box = $('hist-editor'), editBtn = $('hist-edit');
  if (!CE || !box || !editBtn) return;

  const KEYS = Object.keys(CHART_CATALOG);
  const svg = (d, extra = '') => `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"${extra}>${d}</svg>`;
  const line = (d) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter"/>`;
  const ICON = {
    up: svg(line('M8 13.5V3M3.5 7.5 8 3l4.5 4.5')),
    down: svg(line('M8 2.5V13M3.5 8.5 8 13l4.5-4.5')),
    grip: svg([4.5, 8, 11.5].map((y) => `<circle cx="6" cy="${y}" r="1.25" fill="currentColor"/><circle cx="10" cy="${y}" r="1.25" fill="currentColor"/>`).join('')),
  };

  let forceAct = null;          // botón que debe recibir el foco tras un movimiento (CE.focusActAfterMove)

  const nameOf = (k) => t(CHART_CATALOG[k][2]);
  const live = document.createElement('div');
  live.className = 'hist-edit-live';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  box.insertAdjacentElement('afterend', live);

  /* ---------- editor ---------- */

  function rowHtml(r) {
    const name = escapeHtml(nameOf(r.key));
    const mv = (act, can, lblKey) => `<button type="button" class="hist-btn" data-act="${act}" aria-disabled="${!can}" aria-label="${escapeHtml(t(lblKey, { chart: nameOf(r.key) }))}">${ICON[act]}</button>`;
    return `<div class="hist-edit-row${r.on ? '' : ' off'}" data-key="${r.key}">
      <span class="hist-edit-grip" aria-hidden="true" title="${escapeHtml(t('chart.drag_title'))}">${ICON.grip}</span>
      <label class="hist-edit-check"><input type="checkbox" data-act="toggle"${r.on ? ' checked' : ''}><span>${name}</span></label>
      <span class="hist-edit-btns">${mv('up', r.canUp, 'chart.move_up')}${mv('down', r.canDown, 'chart.move_down')}</span></div>`;
  }

  /* Pinta el editor conservando el foco: se recuerda el control activo (fila + acto, o
     el botón de preset) y se re-enfoca tras reconstruir el HTML. */
  function render() {
    if (box.classList.contains('hidden')) return;
    const a = box.contains(document.activeElement) ? document.activeElement : null;
    const want = a && { key: a.closest('[data-key]')?.dataset.key, act: forceAct || a.dataset.act, preset: a.dataset.preset };
    const pre = CE.presetOf(histList, HIST_PRESETS);
    const seg = (name, key) => `<button type="button" class="hist-seg-btn" data-act="preset" data-preset="${name}" aria-pressed="${pre === name}">${escapeHtml(t(key))}</button>`;
    box.innerHTML = `<p class="note">${escapeHtml(t('chart.editor_hint'))}</p>`
      + CE.editorRows(histList, KEYS).map(rowHtml).join('')
      + `<div class="hist-edit-presets" role="group" aria-labelledby="hist-presets-title"><span id="hist-presets-title" class="hist-edit-legend">${escapeHtml(t('chart.presets'))}</span>`
      + `<div class="hist-seg">${seg('temp', 'chart.mode_temp')}${seg('usage', 'chart.mode_usage')}</div></div>`;
    if (!want) return;
    const sel = want.preset ? `[data-act="preset"][data-preset="${want.preset}"]` : `[data-key="${want.key}"] [data-act="${want.act}"]`;
    (box.querySelector(sel) || box.querySelector('[data-act="toggle"]'))?.focus();
  }

  function setOpen(open) {
    box.classList.toggle('hidden', !open);
    editBtn.setAttribute('aria-expanded', String(open));
    if (open) { render(); box.querySelector('input,button')?.focus(); } else editBtn.focus();
  }

  function announce(key) {
    const n = histList.indexOf(key) + 1;
    live.textContent = n ? t('chart.moved_to', { chart: nameOf(key), n, total: histList.length }) : '';
  }

  /* Aplica una lista nueva (setHistCharts la guarda, repinta y vuelve a llamar a sync). */
  function apply(list, key, act) {
    forceAct = act || null;
    setHistCharts(list);
    forceAct = null;
    if (key) announce(key);
  }

  editBtn.addEventListener('click', () => setOpen(box.classList.contains('hidden')));

  box.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const key = el.closest('[data-key]')?.dataset.key, act = el.dataset.act;
    if (act === 'preset') return apply(HIST_PRESETS[el.dataset.preset]);
    if (act === 'toggle') {
      const next = CE.toggleChart(histList, key, KEYS);
      if (next.length === histList.length && next.every((k, i) => k === histList[i])) { el.checked = histList.includes(key); return; }
      return apply(next);                                      // la última activa no se quita
    }
    if (el.getAttribute('aria-disabled') === 'true') return;   // flecha sin recorrido: sigue enfocable
    const dir = act === 'up' ? -1 : 1;
    apply(CE.moveChart(histList, key, dir), key, CE.focusActAfterMove(histList, key, dir));
  });

  box.addEventListener('keydown', (e) => {                     // alternativa de teclado al arrastre
    const key = e.target.closest?.('.hist-edit-row[data-key]')?.dataset.key;
    if (!e.altKey || !key || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const dir = e.key === 'ArrowUp' ? -1 : 1;
    if (CE.canMoveChart(histList, key, dir)) apply(CE.moveChart(histList, key, dir), key);
  });

  /* ---------- arrastrar con el puntero (Pointer Events) ----------
     El DnD nativo de HTML5 no arrancaba con un ratón real en la app. Aquí: pointerdown en el
     asa o en el nombre de una fila activa -> pointermove (umbral de 4 px en CE.createPointerDrag;
     solo entonces se captura el puntero, así un clic normal en la etiqueta sigue alternando la
     casilla) -> línea de destino -> pointerup mueve con CE.dropChart. Escape o pointercancel
     cancelan. Botones y casillas no inician arrastre; con táctil solo el asa (el resto desplaza). */

  const drag = CE.createPointerDrag(4);
  let cap = null;                 // {el, id}: fila con el puntero capturado (solo durante el arrastre)
  let swallowClick = false;       // el clic que sigue a un arrastre no debe activar nada

  const clearDrop = () => box.querySelectorAll('.dragging,.drop-above,.drop-below').forEach((r) => r.classList.remove('dragging', 'drop-above', 'drop-below'));
  const rowOf = (e) => e.target.closest?.('.hist-edit-row[data-key]');
  const rowRects = () => [...box.querySelectorAll('.hist-edit-row[data-key]')].map((r) => { const b = r.getBoundingClientRect(); return { key: r.dataset.key, top: b.top, bottom: b.bottom }; });
  /* Fila activa bajo el puntero; fuera del editor (en horizontal) no hay destino. */
  function targetAt(e) {
    const b = box.getBoundingClientRect();
    return e.clientX >= b.left && e.clientX <= b.right ? CE.dropTargetAt(histList, rowRects(), e.clientY) : null;
  }
  function endDrag() {
    if (cap) { try { cap.el.releasePointerCapture(cap.id); } catch (_) { /* ya liberado */ } }
    cap = null;
    drag.cancel();
    clearDrop();
    document.body.classList.remove('hist-dragging');
  }

  box.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !e.isPrimary) return;
    const r = rowOf(e);
    if (!r || !histList.includes(r.dataset.key) || e.target.closest('button, input')) return;
    if (e.pointerType !== 'mouse' && !e.target.closest('.hist-edit-grip')) return;
    drag.down(r.dataset.key, e.clientX, e.clientY);
  });

  box.addEventListener('pointermove', (e) => {
    if (!e.isPrimary || drag.state().phase === 'idle') return;
    const st = drag.move(e.clientX, e.clientY);
    if (st.phase !== 'dragging') return;
    const src = box.querySelector(`.hist-edit-row[data-key="${st.key}"]`);
    if (!src) return endDrag();
    if (!cap) {                                              // primer movimiento tras el umbral
      cap = { el: src, id: e.pointerId };
      try { src.setPointerCapture(e.pointerId); } catch (_) { /* puntero ya inactivo */ }
      src.classList.add('dragging');
      document.body.classList.add('hist-dragging');
    }
    box.querySelectorAll('.drop-above,.drop-below').forEach((x) => x.classList.remove('drop-above', 'drop-below'));
    const target = targetAt(e);
    const dir = target && CE.dropDirection(histList, st.key, target);
    if (dir) box.querySelector(`.hist-edit-row[data-key="${target}"]`)?.classList.add('drop-' + dir);
  });

  box.addEventListener('pointerup', (e) => {
    if (!e.isPrimary) return;
    const target = targetAt(e);
    const end = drag.up();
    const was = cap;
    endDrag();
    if (!end.dragged || !was) return;
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 30);
    const next = target ? CE.dropChart(histList, end.key, target) : null;
    if (next && next.some((k, i) => k !== histList[i])) apply(next, end.key);
  });

  box.addEventListener('pointercancel', endDrag);
  box.addEventListener('lostpointercapture', () => { if (cap) endDrag(); });   // fila reconstruida o puntero perdido
  box.addEventListener('click', (e) => {                       // el soltar no cuenta como clic
    if (swallowClick) { swallowClick = false; e.stopPropagation(); e.preventDefault(); }
  }, true);
  box.addEventListener('selectstart', (e) => { if (drag.state().phase !== 'idle') e.preventDefault(); });

  /* Escape cancela un arrastre en curso o, si no, cierra el editor (solo si el foco está en él o en su botón y no hay otro diálogo). */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (drag.state().phase !== 'idle') { e.preventDefault(); e.stopPropagation(); endDrag(); return; }   // cancela el arrastre, no cierra el editor
    if (box.classList.contains('hidden') || !(box.contains(e.target) || e.target === editBtn)) return;
    if (document.querySelector('.modal:not(.hidden)')) return;   // otro diálogo manda
    e.preventDefault();
    setOpen(false);
  }, true);

  /* ---------- enlace con app.js ---------- */

  window.RogChartEditorUI = {
    /* La lista cambió (setHistCharts): repinta el editor. */
    sync() { render(); },
  };
  if (window.i18n) window.i18n.onChange(render);
  window.RogChartEditorUI.sync();
})();
