/* ROG Monitor — interfaz del editor de gráficas del historial (S02-2).
 * N-A3-01 aspecto · N-A3-02 reordenar con ratón (arrastrar) y teclado (↑/↓, Alt+↑/↓)
 * (N-A3-03 expandir y F4-09 Escape/foco llegan en commits siguientes).
 * Script clásico cargado DESPUÉS de app.js: usa sus globales (histList, setHistCharts,
 * CHART_CATALOG, HIST_PRESETS, t, $, escapeHtml…).
 * Toda la lógica de lista/orden/expandir vive en chart-editor-model.js (puro, con tests);
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

  let dragKey = null;
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
    return `<div class="hist-edit-row${r.on ? '' : ' off'}" data-key="${r.key}"${r.on ? ' draggable="true"' : ''}>
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
    if (open) render();
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

  /* ---------- arrastrar y soltar (HTML5 nativo) ---------- */

  const clearDrop = () => box.querySelectorAll('.dragging,.drop-above,.drop-below').forEach((r) => r.classList.remove('dragging', 'drop-above', 'drop-below'));
  const rowOf = (e) => e.target.closest?.('.hist-edit-row[data-key]');

  box.addEventListener('dragstart', (e) => {
    const r = rowOf(e);
    if (!r || !histList.includes(r.dataset.key)) return e.preventDefault();
    dragKey = r.dataset.key;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragKey);
    r.classList.add('dragging');
  });
  box.addEventListener('dragover', (e) => {
    const r = rowOf(e);
    if (!dragKey || !r || !histList.includes(r.dataset.key)) return;
    e.preventDefault();                                        // fila activa = destino válido
    e.dataTransfer.dropEffect = 'move';
    box.querySelectorAll('.drop-above,.drop-below').forEach((x) => x.classList.remove('drop-above', 'drop-below'));
    const dir = CE.dropDirection(histList, dragKey, r.dataset.key);
    if (dir) r.classList.add('drop-' + dir);
  });
  box.addEventListener('drop', (e) => {
    const r = rowOf(e);
    if (!dragKey || !r) return;
    e.preventDefault();
    const key = dragKey;
    clearDrop();
    apply(CE.dropChart(histList, key, r.dataset.key), key);
  });
  box.addEventListener('dragend', () => { dragKey = null; clearDrop(); });

  /* ---------- enlace con app.js ---------- */

  window.RogChartEditorUI = {
    /* La lista cambió (setHistCharts): repinta el editor. */
    sync() { render(); },
  };
  if (window.i18n) window.i18n.onChange(render);
  window.RogChartEditorUI.sync();
})();
