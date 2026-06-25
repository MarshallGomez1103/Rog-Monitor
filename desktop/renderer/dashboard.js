/* ROG Monitor — tablero arrastrable tipo sticky-notes (v10, dueño: Agente A3).
 * Reordenar/ocultar/renumerar los bloques [data-block], persistir en
 * localStorage['dashboardLayout']. Se carga DESPUÉS de app.js.
 * Contrato en docs/build-spec-v10.md §A3.
 *
 * UX de arrastre:
 *   - Dos columnas (col-left / col-right) con los bloques actuales.
 *   - El handle (≡) aparece al hacer hover sobre el bloque.
 *   - Arrastrando con el handle se puede reordenar dentro de una columna
 *     O mover a la otra columna: el indicador de inserción sigue al cursor.
 *   - Al soltar, el bloque se inserta antes del bloque más cercano al cursor.
 *   - Grid-snap natural del flujo de documento (flex column → sin posiciones absolutas).
 *
 * Contrato con widget-states.js:
 *   - NO duplicamos el suscriptor onStats; widget-states.js tiene el suyo.
 *   - Los 4 estados (data-state) siguen funcionando porque solo movemos el
 *     elemento DOM completo — los overlays skeleton/empty/error van con él.
 */

(function () {
  'use strict';

  /* ---- i18n seguro ---- */
  const t = (key, fb) => (window.t ? window.t(key) || fb || key : fb || key);

  /* Registrar nuestras claves */
  if (window.i18n && window.i18n.register) {
    window.i18n.register({
      es: {
        'dash.handle_title':    'Arrastrar para mover',
        'dash.hide_title':      'Ocultar este bloque',
        'dash.panel_title':     'Configuración del tablero',
        'dash.panel_sub':       'Activa o desactiva bloques y restáblece el orden original.',
        'dash.reset_btn':       'Restablecer tablero',
        'dash.show_hidden':     'Bloques ocultos',
        'dash.no_hidden':       'Todos los bloques están visibles.',
        'dash.close':           'Cerrar',
        'dash.btn_topbar':      'TABLERO',
        'dash.col_left':        'Columna izquierda',
        'dash.col_right':       'Columna derecha',
        'dash.drag_here':       'Suelta aquí',
        'dash.edit_on':         'MODO EDICIÓN: ACTIVO',
        'dash.edit_off':        'MODO EDICIÓN',
        'dash.edit_title_on':   'Modo edición activo: arrastra, oculta o reordena bloques. Clic para salir.',
        'dash.edit_title_off':  'Activa el modo edición para poder arrastrar/ocultar/reordenar bloques.',
      },
      en: {
        'dash.handle_title':    'Drag to move',
        'dash.hide_title':      'Hide this block',
        'dash.panel_title':     'Dashboard settings',
        'dash.panel_sub':       'Show or hide blocks and reset to default order.',
        'dash.reset_btn':       'Reset dashboard',
        'dash.show_hidden':     'Hidden blocks',
        'dash.no_hidden':       'All blocks are visible.',
        'dash.close':           'Close',
        'dash.btn_topbar':      'LAYOUT',
        'dash.col_left':        'Left column',
        'dash.col_right':       'Right column',
        'dash.drag_here':       'Drop here',
        'dash.edit_on':         'EDIT MODE: ON',
        'dash.edit_off':        'EDIT MODE',
        'dash.edit_title_on':   'Edit mode active: drag, hide or reorder blocks. Click to exit.',
        'dash.edit_title_off':  'Turn on edit mode to drag/hide/reorder blocks.',
      },
    });
  }

  /* ---- constantes ---- */
  const STORAGE_KEY = 'dashboardLayout';
  const EDIT_MODE_KEY = 'dashboardEditMode';

  /* Orden y columna por defecto (data-block → columna) */
  // Izquierda = hardware + iluminación; derecha = datos/listas. El hueco de abajo
  // se cierra por CSS dejando que el último bloque de cada columna llene su altura
  // (ver style.css main/.col), no moviendo bloques de columna.
  const DEFAULT_ORDER = [
    { key: 'cpu',     col: 'left'  },
    { key: 'gpu',     col: 'left'  },
    { key: 'fans',    col: 'left'  },
    { key: 'aura',    col: 'left'  },
    { key: 'history', col: 'right' },
    { key: 'bench',   col: 'right' },
    { key: 'system',  col: 'right' },
    { key: 'battery', col: 'right' },
    { key: 'disks',   col: 'right' },
    { key: 'events',  col: 'right' },
    { key: 'procs',   col: 'right' },
  ];

  /* Títulos legibles por bloque (para el panel de configuración) */
  const BLOCK_LABELS = {
    cpu:     'CPU',
    gpu:     'GPU',
    fans:    'Ventiladores',
    aura:    'Iluminación',
    history: 'Historial',
    bench:   'Benchmarks',
    system:  'Sistema',
    battery: 'Batería',
    disks:   'Discos',
    events:  'Eventos',
    procs:   'Procesos',
  };

  /* ---- estado ---- */
  let layout = loadLayout();   // { order: [{key, col}], hidden: Set<key> }
  let dragSrc = null;          // article siendo arrastrado
  let dropIndicator = null;    // div línea de inserción
  let editMode = loadEditMode(); // true: se puede arrastrar/ocultar/reordenar

  /* ---- modo edición: persistencia ---- */
  function loadEditMode() {
    try { return localStorage.getItem(EDIT_MODE_KEY) === '1'; }
    catch (_) { return false; }
  }

  function saveEditMode() {
    try { localStorage.setItem(EDIT_MODE_KEY, editMode ? '1' : '0'); }
    catch (_) { /* ignorar */ }
  }

  /* ---- persistencia ---- */
  // ponytail: corrección única de columnas. La V1 (battery/disks a la izquierda) fue
  // un error; esta V2 reasigna las columnas al default bueno una sola vez para deshacerla
  // en instalaciones que ya la aplicaron. (Sobrescribe columnas movidas a mano: aceptable
  // por ser un parche puntual; el orden dentro de cada columna se conserva.)
  const COLS_RESET_KEY = 'dashboardLayout.colsResetV2';
  function loadLayout() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (raw && Array.isArray(raw.order) && Array.isArray(raw.hidden)) {
        let order = raw.order;
        if (!localStorage.getItem(COLS_RESET_KEY)) {
          const colByKey = Object.fromEntries(DEFAULT_ORDER.map((d) => [d.key, d.col]));
          order = order.map((o) => (colByKey[o.key] ? { ...o, col: colByKey[o.key] } : o));
          try { localStorage.setItem(COLS_RESET_KEY, '1'); } catch (_) {}
        }
        return { order, hidden: new Set(raw.hidden) };
      }
    } catch (_) { /* ignorar */ }
    return { order: DEFAULT_ORDER.map((d) => ({ ...d })), hidden: new Set() };
  }

  function saveLayout() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      order:  layout.order,
      hidden: [...layout.hidden],
    }));
  }

  /* ---- DOM helpers ---- */
  function colEl(side) {
    return document.querySelector(side === 'left' ? '.col-left' : '.col-right');
  }

  function blockEl(key) {
    return document.querySelector(`[data-block="${key}"]`);
  }

  /* ---- renumeración ---- */
  function renumber() {
    /* Recorre el orden actual; solo los visibles reciben número consecutivo */
    let n = 0;
    layout.order.forEach(({ key }) => {
      const el = blockEl(key);
      if (!el) return;
      const numEl = el.querySelector('h2 > i.dash-num');
      if (layout.hidden.has(key)) {
        /* oculto: sin número */
        if (numEl) numEl.textContent = '';
      } else {
        n++;
        const pad = n < 10 ? '0' + n : String(n);
        if (numEl) numEl.textContent = pad;
      }
    });
  }

  /* ---- inyectar controles a cada bloque ---- */
  function injectBlockControls() {
    document.querySelectorAll('[data-block]').forEach((art) => {
      /* Evitar doble inyección */
      if (art.querySelector('.dash-handle')) return;

      const key = art.dataset.block;
      const h2 = art.querySelector('h2');
      if (!h2) return;

      /* Envolver el número en <i class="dash-num"> si ya existe un <i> */
      const existingI = h2.querySelector('i');
      if (existingI && !existingI.classList.contains('dash-num')) {
        existingI.classList.add('dash-num');
      } else if (!existingI) {
        /* Crear el <i> si no existe */
        const iEl = document.createElement('i');
        iEl.className = 'dash-num';
        h2.insertBefore(iEl, h2.firstChild);
      }

      /* Handle de arrastre (≡) */
      const handle = document.createElement('span');
      handle.className = 'dash-handle';
      handle.setAttribute('title', t('dash.handle_title', 'Arrastrar para mover'));
      handle.setAttribute('aria-label', t('dash.handle_title', 'Arrastrar para mover'));
      handle.innerHTML = '&#9776;'; /* ≡ */
      handle.addEventListener('mousedown', () => {
        if (!editMode) return; // sin modo edición, el handle no arrastra nada
        art.draggable = true;
      });

      /* Botón ocultar (×) */
      const hideBtn = document.createElement('button');
      hideBtn.className = 'dash-hide-btn';
      hideBtn.setAttribute('title', t('dash.hide_title', 'Ocultar este bloque'));
      hideBtn.setAttribute('aria-label', t('dash.hide_title', 'Ocultar este bloque'));
      hideBtn.innerHTML = '&#10005;'; /* × */
      hideBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!editMode) return;
        hideBlock(key);
      });

      /* Controles contenedor */
      const ctrl = document.createElement('div');
      ctrl.className = 'dash-block-ctrl';
      ctrl.appendChild(handle);
      ctrl.appendChild(hideBtn);
      art.appendChild(ctrl);
    });
  }

  /* ---- aplicar layout al DOM ---- */
  function applyLayout() {
    const leftCol  = colEl('left');
    const rightCol = colEl('right');
    if (!leftCol || !rightCol) return;

    /* Manejar el <div class="split"> que contiene events+procs */
    let splitDiv = rightCol.querySelector('.split');

    layout.order.forEach(({ key, col }) => {
      const el = blockEl(key);
      if (!el) return;

      const target = col === 'left' ? leftCol : rightCol;

      /* Mover el bloque al contenedor correcto (si no está ya ahí) */
      if (el.parentElement !== target) {
        /* Si el bloque estaba en split, el split se queda en right */
        target.appendChild(el);
      } else {
        /* Ya en el contenedor correcto: reordenar al final */
        target.appendChild(el);
      }

      /* Visibilidad */
      el.classList.toggle('dash-hidden', layout.hidden.has(key));
    });

    /* Eliminar el split vacío o recrearlo si es necesario para events+procs */
    manageSplitDiv(rightCol, splitDiv);

    renumber();
    updateConfigPanel();
  }

  /* El split-div contenía events y procs en la columna derecha.
   * Si ambos están en right, los envolvemos en el split (maqueta original).
   * Si uno se movió a left, el split se disuelve y cada uno queda suelto en right. */
  function manageSplitDiv(rightCol, splitDiv) {
    const eventsEl = blockEl('events');
    const procsEl  = blockEl('procs');
    const leftCol  = colEl('left');

    /* ¿En qué columna están según el layout? */
    const eventsInRight = eventsEl && layout.order.find((o) => o.key === 'events')?.col === 'right';
    const procsInRight  = procsEl  && layout.order.find((o) => o.key === 'procs')?.col  === 'right';

    if (eventsInRight && procsInRight) {
      /* Ambos en right → envolver en split */
      if (!splitDiv || !splitDiv.parentElement) {
        splitDiv = document.createElement('div');
        splitDiv.className = 'split';
        rightCol.appendChild(splitDiv);
      }
      /* Moverlos dentro del split en el orden correcto */
      const evIdx = layout.order.findIndex((o) => o.key === 'events');
      const prIdx = layout.order.findIndex((o) => o.key === 'procs');
      if (evIdx < prIdx) {
        splitDiv.appendChild(eventsEl);
        splitDiv.appendChild(procsEl);
      } else {
        splitDiv.appendChild(procsEl);
        splitDiv.appendChild(eventsEl);
      }
      /* El split va al final de rightCol (los bloques ya están antes) */
      rightCol.appendChild(splitDiv);
    } else {
      /* Al menos uno en left → disolver split */
      if (splitDiv && splitDiv.parentElement) {
        /* Sacar del split hacia la columna correcta */
        if (eventsEl && eventsEl.parentElement === splitDiv) {
          const targetCol = eventsInRight ? rightCol : leftCol;
          targetCol.appendChild(eventsEl);
        }
        if (procsEl && procsEl.parentElement === splitDiv) {
          const targetCol = procsInRight ? rightCol : leftCol;
          targetCol.appendChild(procsEl);
        }
        if (!splitDiv.children.length) {
          splitDiv.remove();
        }
      }
    }
  }

  /* ---- ocultar / mostrar ---- */
  function hideBlock(key) {
    layout.hidden.add(key);
    saveLayout();
    applyLayout();
    renumber();
    updateConfigPanel();
  }

  function showBlock(key) {
    layout.hidden.delete(key);
    saveLayout();
    applyLayout();
    renumber();
    updateConfigPanel();
  }

  /* ---- restablecer ---- */
  function resetLayout() {
    layout = { order: DEFAULT_ORDER.map((d) => ({ ...d })), hidden: new Set() };
    saveLayout();
    applyLayout();
    renumber();
    updateConfigPanel();
    if (typeof toast === 'function') {
      toast('Tablero restablecido');
    }
  }

  /* ---- drag & drop ---- */
  function initDragAndDrop() {
    /* Indicador visual de inserción */
    dropIndicator = document.createElement('div');
    dropIndicator.className = 'dash-drop-indicator';
    dropIndicator.style.display = 'none';
    document.body.appendChild(dropIndicator);

    document.querySelectorAll('[data-block]').forEach((art) => {
      art.addEventListener('dragstart', onDragStart);
      art.addEventListener('dragend',   onDragEnd);
    });

    ['.col-left', '.col-right'].forEach((sel) => {
      const col = document.querySelector(sel);
      if (!col) return;
      col.addEventListener('dragover',  onDragOver);
      col.addEventListener('drop',      onDrop);
      col.addEventListener('dragleave', onDragLeave);
    });
  }

  function onDragStart(e) {
    if (!editMode) { e.preventDefault(); return; }
    dragSrc = this;
    dragSrc.classList.add('dash-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragSrc.dataset.block);

    /* Imagen fantasma personalizada: el bloque mismo pero con opacidad */
    try {
      e.dataTransfer.setDragImage(dragSrc, 24, 24);
    } catch (_) { /* ignorar en navegadores que no lo soportan */ }
  }

  function onDragEnd() {
    if (dragSrc) {
      dragSrc.classList.remove('dash-dragging');
      dragSrc.draggable = false;
      dragSrc = null;
    }
    hideDropIndicator();
    document.querySelectorAll('[data-block]').forEach((a) =>
      a.classList.remove('dash-drag-over'));
  }

  function onDragOver(e) {
    if (!dragSrc) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const col = this;
    const colSide = col.classList.contains('col-left') ? 'left' : 'right';
    const blocks  = [...col.querySelectorAll('[data-block]:not(.dash-dragging)')];

    /* Encontrar el bloque más cercano al cursor */
    let insertBefore = null;
    let minDist = Infinity;

    blocks.forEach((b) => {
      const rect = b.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const dist = e.clientY - midY;
      if (dist < 0 && Math.abs(dist) < minDist) {
        minDist = Math.abs(dist);
        insertBefore = b;
      }
    });

    /* Mostrar indicador */
    showDropIndicator(col, insertBefore);
    col.dataset.dropTarget = colSide;
  }

  function onDragLeave(e) {
    /* Solo ocultar si realmente salimos del col (no hacia un hijo) */
    if (!this.contains(e.relatedTarget)) {
      hideDropIndicator();
      delete this.dataset.dropTarget;
    }
  }

  function onDrop(e) {
    e.preventDefault();
    if (!dragSrc) return;

    const col = this;
    const colSide  = col.classList.contains('col-left') ? 'left' : 'right';
    const srcKey   = dragSrc.dataset.block;
    const blocks   = [...col.querySelectorAll('[data-block]:not(.dash-dragging)')];

    /* Insertar antes del bloque más cercano al cursor */
    let insertBefore = null;
    let minDist = Infinity;
    blocks.forEach((b) => {
      const rect = b.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const dist = e.clientY - midY;
      if (dist < 0 && Math.abs(dist) < minDist) {
        minDist = Math.abs(dist);
        insertBefore = b;
      }
    });

    /* Actualizar layout.order */
    const idx = layout.order.findIndex((o) => o.key === srcKey);
    if (idx !== -1) {
      layout.order.splice(idx, 1);
    }

    if (insertBefore) {
      const targetKey = insertBefore.dataset.block;
      const targetIdx = layout.order.findIndex((o) => o.key === targetKey);
      layout.order.splice(targetIdx, 0, { key: srcKey, col: colSide });
    } else {
      /* Soltar al final de la columna */
      const lastInCol = [...layout.order].reverse().findIndex((o) => o.col === colSide);
      if (lastInCol === -1) {
        layout.order.push({ key: srcKey, col: colSide });
      } else {
        const insertAt = layout.order.length - lastInCol;
        layout.order.splice(insertAt, 0, { key: srcKey, col: colSide });
      }
    }

    saveLayout();
    applyLayout();
    hideDropIndicator();
  }

  function showDropIndicator(col, beforeEl) {
    if (!dropIndicator) return;

    dropIndicator.style.display = 'block';

    if (beforeEl) {
      const rect = beforeEl.getBoundingClientRect();
      dropIndicator.style.top    = (rect.top   + window.scrollY - 2) + 'px';
      dropIndicator.style.left   = (rect.left  + window.scrollX) + 'px';
      dropIndicator.style.width  = rect.width + 'px';
    } else {
      /* Al final de la columna */
      const colRect = col.getBoundingClientRect();
      dropIndicator.style.top    = (colRect.bottom + window.scrollY - 2) + 'px';
      dropIndicator.style.left   = (colRect.left   + window.scrollX) + 'px';
      dropIndicator.style.width  = colRect.width + 'px';
    }
  }

  function hideDropIndicator() {
    if (dropIndicator) dropIndicator.style.display = 'none';
    document.querySelectorAll('.col-left, .col-right').forEach((c) =>
      delete c.dataset.dropTarget);
  }

  /* ---- panel de configuración del tablero ---- */
  function buildConfigPanel() {
    /* Buscar o crear el modal #dashboard-modal */
    let modal = document.getElementById('dashboard-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'dashboard-modal';
      modal.className = 'modal hidden';
      modal.innerHTML = `
        <div class="modal-card">
          <h3 data-i18n="dash.panel_title">${t('dash.panel_title', 'Configuración del tablero')}</h3>
          <p class="sub" data-i18n="dash.panel_sub">${t('dash.panel_sub', 'Activa o desactiva bloques y restablece el orden original.')}</p>
          <label class="check-row" id="dash-edit-row" for="dash-edit-toggle"
                 title="${t('dash.edit_title_off', 'Activa el modo edición para arrastrar/ocultar/reordenar bloques.')}">
            <input type="checkbox" id="dash-edit-toggle">
            <span id="dash-edit-label" data-i18n="dash.edit_off">${t('dash.edit_off', 'MODO EDICIÓN')}</span>
          </label>
          <div id="dash-config-body"></div>
          <div class="mode-row" style="margin-top:1rem">
            <button class="ghost" id="dash-reset-btn" data-i18n="dash.reset_btn">${t('dash.reset_btn', 'Restablecer tablero')}</button>
            <button class="ghost modal-close" id="dash-config-close" data-i18n="dash.close">${t('dash.close', 'Cerrar')}</button>
          </div>
        </div>`;
      document.body.appendChild(modal);

      /* Cerrar con clic en fondo */
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
      });
      document.getElementById('dash-config-close').addEventListener('click', () =>
        modal.classList.add('hidden'));
      document.getElementById('dash-reset-btn').addEventListener('click', () => {
        resetLayout();
      });
      /* Interruptor de modo edición DENTRO del modal (v16: fusión Layout∪Edit) */
      document.getElementById('dash-edit-toggle').addEventListener('change', (e) => {
        setEditMode(e.target.checked);
      });
    }
    updateConfigPanel();
  }

  function updateConfigPanel() {
    const body = document.getElementById('dash-config-body');
    if (!body) return;

    const hiddenList = layout.order.filter((o) => layout.hidden.has(o.key));

    if (!hiddenList.length) {
      body.innerHTML = `<p class="dim" style="margin:.5rem 0" data-i18n="dash.no_hidden">${t('dash.no_hidden', 'Todos los bloques están visibles.')}</p>`;
      return;
    }

    const title = document.createElement('p');
    title.className = 'sub';
    title.setAttribute('data-i18n', 'dash.show_hidden');
    title.textContent = t('dash.show_hidden', 'Bloques ocultos');

    const list = document.createElement('ul');
    list.className = 'dash-hidden-list';

    hiddenList.forEach(({ key }) => {
      const li = document.createElement('li');
      const label = BLOCK_LABELS[key] || key;
      li.innerHTML = `<span>${label}</span>`;
      const btn = document.createElement('button');
      btn.className = 'ghost dash-show-btn';
      btn.textContent = '+ Mostrar';
      btn.addEventListener('click', () => showBlock(key));
      li.appendChild(btn);
      list.appendChild(li);
    });

    body.innerHTML = '';
    body.appendChild(title);
    body.appendChild(list);
  }

  /* ---- modo edición: aplicar / alternar ---- */
  function applyEditModeVisual() {
    /* Contrato CSS con A2: data-edit-mode="on|off" en <html>.
     * Cuando está "off", .dash-block-ctrl debe permanecer oculta SIEMPRE
     * (sin importar :hover) y los bloques no deben mostrar cursor de arrastre. */
    document.documentElement.dataset.editMode = editMode ? 'on' : 'off';
    /* v16: el toggle vive DENTRO del modal del tablero (no en la topbar). */
    const toggle = document.getElementById('dash-edit-toggle');
    if (toggle) toggle.checked = editMode;
    const label = document.getElementById('dash-edit-label');
    if (label) {
      label.setAttribute('data-i18n', editMode ? 'dash.edit_on' : 'dash.edit_off');
      label.textContent = t(editMode ? 'dash.edit_on' : 'dash.edit_off',
        editMode ? 'MODO EDICIÓN: ACTIVO' : 'MODO EDICIÓN');
    }
    const row = document.getElementById('dash-edit-row');
    if (row) {
      row.title = t(editMode ? 'dash.edit_title_on' : 'dash.edit_title_off',
        editMode ? 'Modo edición activo' : 'Activa el modo edición');
    }
  }

  function setEditMode(on) {
    editMode = !!on;
    saveEditMode();
    applyEditModeVisual();
    if (!editMode) {
      /* Salir de edición: cancelar cualquier draggable pendiente */
      document.querySelectorAll('[data-block]').forEach((a) => { a.draggable = false; });
      hideDropIndicator();
    }
  }

  /* v16: el botón de modo edición de la topbar (#edit-mode-btn) se eliminó.
     Ahora el modo edición es un interruptor DENTRO del modal del tablero. */

  /* ---- botón en topbar ---- */
  function addTopbarButton() {
    /* El botón #dash-btn lo añadimos al principio de .controls */
    if (document.getElementById('dash-btn')) return;
    const controls = document.querySelector('.controls');
    if (!controls) return;

    const btn = document.createElement('button');
    btn.id = 'dash-btn';
    btn.className = 'ghost';
    btn.setAttribute('title', t('dash.panel_title', 'Configuración del tablero'));
    btn.setAttribute('data-i18n', 'dash.btn_topbar');
    btn.textContent = t('dash.btn_topbar', 'TABLERO');

    btn.addEventListener('click', () => {
      updateConfigPanel();
      document.getElementById('dashboard-modal').classList.toggle('hidden');
    });

    /* Insertar antes del primer botón de .controls */
    controls.insertBefore(btn, controls.firstChild);
  }

  /* ---- escuchar cambios de idioma ---- */
  function setupI18nHook() {
    if (window.i18n && window.i18n.onChange) {
      window.i18n.onChange(() => {
        /* Actualizar títulos de controles ya inyectados */
        document.querySelectorAll('.dash-handle').forEach((h) =>
          h.setAttribute('title', t('dash.handle_title', 'Arrastrar para mover')));
        document.querySelectorAll('.dash-hide-btn').forEach((b) =>
          b.setAttribute('title', t('dash.hide_title', 'Ocultar este bloque')));
        /* Re-renderizar panel */
        updateConfigPanel();
        applyEditModeVisual();
      });
    }
  }

  /* ---- validar que el layout guardado tenga todas las claves ---- */
  function sanitizeLayout() {
    const known = new Set(DEFAULT_ORDER.map((d) => d.key));

    /* Quitar claves que ya no existen */
    layout.order = layout.order.filter((o) => known.has(o.key));
    layout.hidden.forEach((k) => { if (!known.has(k)) layout.hidden.delete(k); });

    /* Añadir claves que faltan al final de la columna por defecto */
    DEFAULT_ORDER.forEach((def) => {
      if (!layout.order.find((o) => o.key === def.key)) {
        layout.order.push({ ...def });
      }
    });
  }

  /* ---- punto de entrada ---- */
  function init() {
    sanitizeLayout();
    injectBlockControls();
    addTopbarButton();
    buildConfigPanel();
    applyLayout();
    renumber();
    initDragAndDrop();
    setupI18nHook();
    applyEditModeVisual();
  }

  /* Esperar a que el DOM esté listo */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}());
