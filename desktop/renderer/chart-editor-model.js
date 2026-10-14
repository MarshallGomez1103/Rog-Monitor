/* ROG Monitor — Modelo puro del editor de gráficas del histórico (N-A3-01).
 * Lista activa y ordenada de gráficas: validación, activar/desactivar, mover
 * (botones y arrastrar y soltar), filas del editor, presets, foco tras mover y
 * estado de «expandir una gráfica». Sin DOM ni localStorage y sin mutar las
 * entradas: app.js guarda la lista y pinta; este módulo solo calcula.
 * Las claves se validan contra una lista/objeto de claves PROPIAS del catálogo
 * (Set), así «constructor», «__proto__» o «toString» nunca cuentan como gráfica.
 * Script clásico: expone window.RogChartEditor y, bajo Node, module.exports. */
(function (root) {
  'use strict';

  /* Set de claves válidas (strings propios) a partir de un array de claves o de
     un objeto-catálogo. Cualquier otra cosa => Set vacío. */
  function keySet(catalog) {
    if (Array.isArray(catalog)) return new Set(catalog.filter((k) => typeof k === 'string'));
    if (catalog !== null && typeof catalog === 'object') return new Set(Object.keys(catalog));
    return new Set();
  }

  /* Orden de catálogo como array de strings. */
  function keyList(catalog) {
    return Array.from(keySet(catalog));
  }

  /* Lista sin repetidas ni claves ajenas al catálogo (conserva el orden). */
  function clean(list, valid) {
    const out = [];
    if (!Array.isArray(list)) return out;
    for (const k of list) if (typeof k === 'string' && valid.has(k) && !out.includes(k)) out.push(k);
    return out;
  }

  /* `saved` puede ser el JSON de localStorage, un array u otra cosa. Corrupto o
     sin ninguna gráfica válida => copia de `fallback`. */
  function normalizeChartList(saved, catalogKeys, fallback) {
    let list = saved;
    if (typeof saved === 'string') {
      try { list = JSON.parse(saved); } catch (_) { list = null; }
    }
    const out = clean(list, keySet(catalogKeys));
    return out.length ? out : Array.from(fallback || []);
  }

  /* Marcar/desmarcar. Añade al final o quita; la última activa no se quita y una
     clave fuera del catálogo no se añade (copia sin cambio en ambos casos). */
  function toggleChart(list, key, catalogKeys) {
    const cur = Array.from(list || []);
    const i = cur.indexOf(key);
    if (i >= 0) {
      if (cur.length === 1) return cur;
      cur.splice(i, 1);
      return cur;
    }
    if (typeof key === 'string' && keySet(catalogKeys).has(key)) cur.push(key);
    return cur;
  }

  /* Mueve `key` a la posición `index` (se trunca y se recorta a [0, n-1]).
     Ausente o índice no numérico => copia sin cambio. */
  function moveChartTo(list, key, index) {
    const cur = Array.from(list || []);
    const i = cur.indexOf(key);
    if (i < 0 || typeof index !== 'number' || Number.isNaN(index)) return cur;
    const j = Math.min(Math.max(Math.trunc(index), 0), cur.length - 1);
    if (j === i) return cur;
    cur.splice(i, 1);
    cur.splice(j, 0, key);
    return cur;
  }

  /* Soltar `key` sobre la fila ACTIVA `targetKey`: queda en la posición del destino.
     Destino ausente/inactivo => sin cambio (moveChartTo con -1 la mandaría al principio). */
  function dropChart(list, key, targetKey) {
    const cur = Array.from(list || []);
    const to = cur.indexOf(targetKey);
    return to < 0 ? cur : moveChartTo(cur, key, to);
  }

  /* Dónde caerá al soltar sobre `targetKey`: 'above' (sube) | 'below' (baja) | null. */
  function dropDirection(list, key, targetKey) {
    if (!Array.isArray(list)) return null;
    const i = list.indexOf(key), j = list.indexOf(targetKey);
    if (i < 0 || j < 0 || i === j) return null;
    return j < i ? 'above' : 'below';
  }

  /* Un paso: dir -1 (arriba) o +1 (abajo). Bordes, ausente o dir distinta => sin cambio. */
  function moveChart(list, key, dir) {
    const cur = Array.from(list || []);
    const i = cur.indexOf(key);
    if (i < 0 || (dir !== -1 && dir !== 1)) return cur;
    return moveChartTo(cur, key, i + dir);
  }

  function canMoveChart(list, key, dir) {
    if (!Array.isArray(list) || (dir !== -1 && dir !== 1)) return false;
    const i = list.indexOf(key);
    return i >= 0 && i + dir >= 0 && i + dir < list.length;
  }

  /* Filas del editor: primero las activas (en su orden) y después el resto del
     catálogo en su orden. canUp/canDown solo valen en filas activas. */
  function editorRows(list, catalogKeys) {
    const valid = keySet(catalogKeys);
    const active = clean(list, valid);
    const rest = keyList(catalogKeys).filter((k) => !active.includes(k));
    return [...active, ...rest].map((key) => {
      const index = active.indexOf(key);
      return {
        key,
        on: index >= 0,
        index,
        canUp: canMoveChart(active, key, -1),
        canDown: canMoveChart(active, key, 1),
      };
    });
  }

  /* 'temp' | 'usage' | null: ¿la lista (orden incluido) es exactamente un preset? */
  function presetOf(list, presets) {
    if (!Array.isArray(list) || presets === null || typeof presets !== 'object') return null;
    for (const name of ['temp', 'usage']) {
      const p = Object.prototype.hasOwnProperty.call(presets, name) ? presets[name] : null;
      if (Array.isArray(p) && p.length === list.length && p.every((k, i) => k === list[i])) return name;
    }
    return null;
  }

  /* Botón rápido: desde «usage» vuelve a «temp»; desde cualquier otra lista va a «usage». */
  function nextPresetList(list, presets) {
    const target = presetOf(list, presets) === 'usage' ? 'temp' : 'usage';
    const p = presets && Object.prototype.hasOwnProperty.call(presets, target) ? presets[target] : null;
    return Array.from(Array.isArray(p) ? p : []);
  }

  /* Tras pulsar ↑/↓ en `key`, ¿qué botón de su fila recibe el foco? El mismo si
     sigue habilitado; si llegó al borde queda disabled y el foco pasa al contrario
     (el foco en un botón disabled se pierde). null si no hay a dónde ir. */
  function focusActAfterMove(list, key, dir) {
    if (!Array.isArray(list) || (dir !== -1 && dir !== 1) || !list.includes(key)) return null;
    const next = moveChart(list, key, dir);
    const same = dir === -1 ? 'up' : 'down';
    const other = dir === -1 ? 'down' : 'up';
    if (canMoveChart(next, key, dir)) return same;
    if (canMoveChart(next, key, -dir)) return other;
    return null;
  }

  /* ---- expandir una gráfica (N-A3-03): estado inmutable {chartId|null} ---- */

  const COLLAPSED = Object.freeze({ chartId: null });

  function createExpandState() {
    return COLLAPSED;
  }

  function collapseExpanded() {
    return COLLAPSED;
  }

  function isExpanded(state, chartId) {
    return !!state && typeof chartId === 'string' && state.chartId === chartId;
  }

  /* Alterna la gráfica expandida: la misma la contrae, otra pasa a ser la
     expandida. Un id fuera del catálogo (o sin catálogo) deja el estado como está. */
  function toggleExpanded(state, chartId, catalogKeys) {
    const cur = state && typeof state.chartId === 'string' ? state.chartId : null;
    if (typeof chartId !== 'string' || !keySet(catalogKeys).has(chartId)) {
      return cur === null ? COLLAPSED : Object.freeze({ chartId: cur });
    }
    return cur === chartId ? COLLAPSED : Object.freeze({ chartId });
  }

  /* Si la gráfica expandida ya no está en la lista visible, se contrae. */
  function reconcileExpanded(state, list) {
    const cur = state && typeof state.chartId === 'string' ? state.chartId : null;
    return cur !== null && Array.isArray(list) && list.includes(cur) ? Object.freeze({ chartId: cur }) : COLLAPSED;
  }

  const api = {
    normalizeChartList, toggleChart, moveChart, moveChartTo, dropChart, dropDirection, canMoveChart, editorRows,
    presetOf, nextPresetList, focusActAfterMove,
    createExpandState, toggleExpanded, collapseExpanded, isExpanded, reconcileExpanded,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RogChartEditor = api;
})(typeof window !== 'undefined' ? window : null);
