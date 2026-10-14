/* ROG Monitor — Modelo puro de las tablas de procesos (N-A2-01).
 * Orden, estado de cabeceras (flecha + aria-sort), clase de columna y formato de
 * memoria compartidos por #procs (top-5), #ram-procs (modal RAM) y #allprocs
 * (modal «ver todos»). Sin DOM ni estado propio: app.js guarda el {key, dir} y
 * pinta; este módulo solo calcula. Script clásico: expone window.RogProcsTable
 * y, bajo Node, module.exports (para tests sin Electron). */
(function (root) {
  'use strict';

  /* clave de orden -> clase de columna que usa el CSS ([data-sort-col]) */
  const COL_CLASS = { pid: 'pid', name: 'pname', cpu: 'cpu', cpu_core: 'cpu-core', mem_mb: 'mem' };

  const normDir = (dir) => (dir === 'asc' ? 'asc' : 'desc');

  /* Estado inmutable {key, dir}. Cualquier dir distinto de 'asc' es 'desc'. */
  function createSortState(key, dir) {
    return Object.freeze({ key, dir: normDir(dir) });
  }

  /* Clic en una cabecera: misma columna invierte; columna nueva = mayor→menor
     (texto `name`: A→Z). Devuelve un estado nuevo, no muta el anterior. */
  function toggleSort(state, key) {
    if (state && state.key === key) return createSortState(key, state.dir === 'desc' ? 'asc' : 'desc');
    return createSortState(key, key === 'name' ? 'asc' : 'desc');
  }

  const field = (row, key) => (row == null ? undefined : row[key]);

  /* número válido o null (null/undefined/''/NaN/no numérico => null) */
  function num(v) {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isNaN(n) ? null : n;
  }

  /* Copia ordenada y estable. name: localeCompare (mayúsculas/acentos), sin
     desempate extra. Numéricas: empate => mayor cpu primero; valores ausentes
     (null/undefined/NaN) siempre al final, también en ascendente. */
  function sortRows(rows, state) {
    if (!Array.isArray(rows)) return [];
    const key = state && state.key;
    const dir = state && state.dir === 'asc' ? 1 : -1;
    const byCpu = (a, b) => (num(field(b, 'cpu')) || 0) - (num(field(a, 'cpu')) || 0);
    return rows.slice().sort((a, b) => {
      if (key === 'name') {
        const an = field(a, 'name');
        const bn = field(b, 'name');
        return String(an == null ? '' : an).localeCompare(String(bn == null ? '' : bn)) * dir;
      }
      const av = num(field(a, key));
      const bv = num(field(b, key));
      if (av === null && bv === null) return byCpu(a, b);
      if (av === null) return 1;
      if (bv === null) return -1;
      if (av === bv) return byCpu(a, b);
      return (av - bv) * dir;
    });
  }

  /* clase de columna para `table.dataset.sortCol` ('' si la clave no es de columna) */
  function colClass(key) {
    return Object.prototype.hasOwnProperty.call(COL_CLASS, key) ? COL_CLASS[key] : '';
  }

  /* Estado visual de un <th>: sort-active, data-dir, flecha y aria-sort. */
  function headerState(state, key) {
    if (!state || state.key !== key) return { active: false, dir: '', arrow: '', ariaSort: 'none' };
    const asc = state.dir === 'asc';
    return {
      active: true,
      dir: asc ? 'asc' : 'desc',
      arrow: asc ? '▲' : '▼',
      ariaSort: asc ? 'ascending' : 'descending',
    };
  }

  /* Memoria visible: 'MiB' (por defecto) tal cual «N MiB»; 'GiB' => «x.xx GiB». */
  function formatMem(mb, unit) {
    const n = num(mb);
    if (n === null) return '—';
    return unit === 'GiB' ? `${(n / 1024).toFixed(2)} GiB` : `${n} MiB`;
  }

  const api = { createSortState, toggleSort, sortRows, colClass, headerState, formatMem };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RogProcsTable = api;
})(typeof window !== 'undefined' ? window : null);
