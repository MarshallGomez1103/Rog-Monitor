'use strict';
// N-A2-01: modelo puro de orden/cabeceras de las 3 tablas de procesos (#procs, #ram-procs, #allprocs).
// procs-table.js es un script clásico (window.RogProcsTable) con export CommonJS para testear sin Electron.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.join(__dirname, '..', 'renderer', 'procs-table.js');
const PT = require(file);

const P = (pid, name, cpu, cpu_core, mem_mb) => ({ pid, name, cpu, cpu_core, mem_mb });
const pids = (rows) => rows.map((r) => r.pid);

const ROWS = () => [
  P(1, 'zsh', 5, 0.05, 100),
  P(2, 'firefox', 40, 0.4, 2048),
  P(3, 'Xorg', 12, 0.12, 300),
  P(4, 'code', 40, 1.5, 900),
  P(5, 'bash', 0, 0, 20),
];

test('exporta la API mínima y se expone como window.RogProcsTable', () => {
  for (const k of ['createSortState', 'toggleSort', 'sortRows', 'colClass', 'headerState', 'formatMem']) {
    assert.strictEqual(typeof PT[k], 'function', k);
  }
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox);
  assert.deepStrictEqual(Object.keys(sandbox.window.RogProcsTable).sort(), Object.keys(PT).sort());
});

test('createSortState: valores dados, dir inválido cae a desc, estado inmutable', () => {
  assert.deepStrictEqual({ ...PT.createSortState('cpu', 'desc') }, { key: 'cpu', dir: 'desc' });
  assert.deepStrictEqual({ ...PT.createSortState('name', 'asc') }, { key: 'name', dir: 'asc' });
  assert.strictEqual(PT.createSortState('cpu', 'raro').dir, 'desc');
  assert.strictEqual(PT.createSortState('cpu').dir, 'desc');
  assert.ok(Object.isFrozen(PT.createSortState('cpu', 'desc')));
});

test('toggleSort: misma columna invierte; columna nueva = desc (name = asc); no muta', () => {
  const s0 = PT.createSortState('cpu', 'desc');
  const s1 = PT.toggleSort(s0, 'cpu');
  assert.deepStrictEqual({ ...s1 }, { key: 'cpu', dir: 'asc' });
  assert.deepStrictEqual({ ...s0 }, { key: 'cpu', dir: 'desc' });
  assert.deepStrictEqual({ ...PT.toggleSort(s1, 'cpu') }, { key: 'cpu', dir: 'desc' });
  assert.deepStrictEqual({ ...PT.toggleSort(s0, 'name') }, { key: 'name', dir: 'asc' });
  assert.deepStrictEqual({ ...PT.toggleSort(s0, 'mem_mb') }, { key: 'mem_mb', dir: 'desc' });
  assert.deepStrictEqual({ ...PT.toggleSort(s0, 'pid') }, { key: 'pid', dir: 'desc' });
  // name->name invierte a desc
  const n = PT.toggleSort(s0, 'name');
  assert.strictEqual(PT.toggleSort(n, 'name').dir, 'desc');
  assert.ok(Object.isFrozen(s1));
  // estado ausente: arranca la columna pedida
  assert.deepStrictEqual({ ...PT.toggleSort(undefined, 'name') }, { key: 'name', dir: 'asc' });
});

test('sortRows: cpu_core / mem_mb / pid / cpu en desc y asc', () => {
  const r = ROWS();
  assert.deepStrictEqual(pids(PT.sortRows(r, { key: 'cpu_core', dir: 'desc' })), [4, 2, 3, 1, 5]);
  assert.deepStrictEqual(pids(PT.sortRows(r, { key: 'cpu_core', dir: 'asc' })), [5, 1, 3, 2, 4]);
  assert.deepStrictEqual(pids(PT.sortRows(r, { key: 'mem_mb', dir: 'desc' })), [2, 4, 3, 1, 5]);
  assert.deepStrictEqual(pids(PT.sortRows(r, { key: 'mem_mb', dir: 'asc' })), [5, 1, 3, 4, 2]);
  assert.deepStrictEqual(pids(PT.sortRows(r, { key: 'pid', dir: 'desc' })), [5, 4, 3, 2, 1]);
  assert.deepStrictEqual(pids(PT.sortRows(r, { key: 'pid', dir: 'asc' })), [1, 2, 3, 4, 5]);
  assert.deepStrictEqual(pids(PT.sortRows(r, { key: 'cpu', dir: 'desc' })), [2, 4, 3, 1, 5]);
  assert.deepStrictEqual(pids(PT.sortRows(r, { key: 'cpu', dir: 'asc' })), [5, 1, 3, 2, 4]);
});

test('sortRows: empates desempatan por cpu desc (como app.js); cpu empatado conserva orden de entrada', () => {
  // empate en otra columna: desempata por cpu descendente, sea cual sea la dirección
  const t = [P(1, 'a', 1, 0, 50), P(2, 'b', 9, 0, 50), P(3, 'c', 5, 0, 50), P(4, 'd', 7, 0, 10)];
  assert.deepStrictEqual(pids(PT.sortRows(t, { key: 'mem_mb', dir: 'desc' })), [2, 3, 1, 4]);
  assert.deepStrictEqual(pids(PT.sortRows(t, { key: 'mem_mb', dir: 'asc' })), [4, 2, 3, 1]);
  // cpu ausente en el desempate cuenta como 0
  const u = [{ pid: 1, mem_mb: 5 }, { pid: 2, mem_mb: 5, cpu: 3 }];
  assert.deepStrictEqual(pids(PT.sortRows(u, { key: 'mem_mb', dir: 'desc' })), [2, 1]);
  // cpu totalmente empatado: estable
  const e = [P(7, 'x', 3), P(8, 'y', 3), P(9, 'z', 3)];
  assert.deepStrictEqual(pids(PT.sortRows(e, { key: 'cpu', dir: 'desc' })), [7, 8, 9]);
});

test('sortRows: name con mayúsculas/acentos vía localeCompare; sin desempate extra', () => {
  const r = [P(1, 'zsh', 1), P(2, 'Éclair', 1), P(3, 'apple', 1), P(4, 'Banana', 1), P(5, 'eclair', 1)];
  const asc = PT.sortRows(r, { key: 'name', dir: 'asc' }).map((x) => x.name);
  assert.deepStrictEqual(asc, ['apple', 'Banana', 'eclair', 'Éclair', 'zsh']);
  const desc = PT.sortRows(r, { key: 'name', dir: 'desc' }).map((x) => x.name);
  assert.deepStrictEqual(desc, ['zsh', 'Éclair', 'eclair', 'Banana', 'apple']);
  // nombres repetidos: estable (orden de entrada), igual que hoy
  const same = [P(1, 'chrome', 1), P(2, 'chrome', 90), P(3, 'chrome', 20)];
  assert.deepStrictEqual(pids(PT.sortRows(same, { key: 'name', dir: 'asc' })), [1, 2, 3]);
  // nombre ausente se trata como cadena vacía
  const nn = [P(1, 'b'), { pid: 2, name: null }, { pid: 3 }];
  assert.deepStrictEqual(pids(PT.sortRows(nn, { key: 'name', dir: 'asc' })), [2, 3, 1]);
});

test('sortRows: null/undefined/NaN al final en ambas direcciones', () => {
  const r = [P(1, 'a', 10, null, 1), P(2, 'b', 20, 0.5, 2), P(3, 'c', 5, undefined, 3), P(4, 'd', 7, NaN, 4), P(5, 'e', 1, 0.1, 5)];
  // los vacíos (1, 4, 3) van al final, entre sí por cpu desc (10, 7, 5)
  assert.deepStrictEqual(pids(PT.sortRows(r, { key: 'cpu_core', dir: 'desc' })), [2, 5, 1, 4, 3]);
  assert.deepStrictEqual(pids(PT.sortRows(r, { key: 'cpu_core', dir: 'asc' })), [5, 2, 1, 4, 3]);
  // clave desconocida: todos vacíos -> solo desempate por cpu desc
  assert.deepStrictEqual(pids(PT.sortRows(ROWS(), { key: 'nope', dir: 'asc' })), [2, 4, 3, 1, 5]);
  assert.deepStrictEqual(pids(PT.sortRows(ROWS(), {})), [2, 4, 3, 1, 5]);
});

test('sortRows: entradas vacías o inválidas', () => {
  const s = { key: 'cpu', dir: 'desc' };
  assert.deepStrictEqual(PT.sortRows([], s), []);
  assert.deepStrictEqual(PT.sortRows(null, s), []);
  assert.deepStrictEqual(PT.sortRows(undefined, s), []);
  assert.deepStrictEqual(PT.sortRows('x', s), []);
  assert.strictEqual(PT.sortRows([P(1, 'a', 1)], undefined).length, 1);
});

test('sortRows: no muta el array de entrada ni sus filas; devuelve copia', () => {
  const r = ROWS();
  const snap = JSON.stringify(r);
  const out = PT.sortRows(r, { key: 'mem_mb', dir: 'asc' });
  assert.notStrictEqual(out, r);
  assert.strictEqual(JSON.stringify(r), snap);
  assert.strictEqual(out[0], r[4]); // mismas referencias de fila, no clones
  const f = Object.freeze(ROWS().map(Object.freeze));
  assert.doesNotThrow(() => PT.sortRows(f, { key: 'name', dir: 'desc' }));
});

test('sortRows: acepta el objeto de createSortState/toggleSort directamente', () => {
  let s = PT.createSortState('cpu', 'desc');
  assert.deepStrictEqual(pids(PT.sortRows(ROWS(), s)), [2, 4, 3, 1, 5]);
  s = PT.toggleSort(s, 'name');
  assert.deepStrictEqual(PT.sortRows(ROWS(), s).map((x) => x.name), ['bash', 'code', 'firefox', 'Xorg', 'zsh']);
});

test('colClass: mapa de columnas de app.js (PROC_COL_CLASS)', () => {
  assert.strictEqual(PT.colClass('pid'), 'pid');
  assert.strictEqual(PT.colClass('name'), 'pname');
  assert.strictEqual(PT.colClass('cpu'), 'cpu');
  assert.strictEqual(PT.colClass('cpu_core'), 'cpu-core');
  assert.strictEqual(PT.colClass('mem_mb'), 'mem');
  assert.strictEqual(PT.colClass('otra'), '');
  assert.strictEqual(PT.colClass(undefined), '');
  assert.strictEqual(PT.colClass('constructor'), '');
  assert.strictEqual(PT.colClass('toString'), '');
});

test('headerState: columna activa pinta flecha y aria-sort; el resto none', () => {
  const desc = { key: 'cpu', dir: 'desc' };
  const asc = { key: 'cpu', dir: 'asc' };
  assert.deepStrictEqual(PT.headerState(desc, 'cpu'), { active: true, dir: 'desc', arrow: '▼', ariaSort: 'descending' });
  assert.deepStrictEqual(PT.headerState(asc, 'cpu'), { active: true, dir: 'asc', arrow: '▲', ariaSort: 'ascending' });
  assert.deepStrictEqual(PT.headerState(desc, 'name'), { active: false, dir: '', arrow: '', ariaSort: 'none' });
  assert.deepStrictEqual(PT.headerState(undefined, 'name'), { active: false, dir: '', arrow: '', ariaSort: 'none' });
  // dir raro = desc, como `sortDir === 'asc' ? 1 : -1` en app.js
  assert.strictEqual(PT.headerState({ key: 'pid', dir: 'x' }, 'pid').ariaSort, 'descending');
});

test('formatMem: MiB tal cual (entero sin redondear) y GiB con 2 decimales', () => {
  assert.strictEqual(PT.formatMem(512, 'MiB'), '512 MiB');
  assert.strictEqual(PT.formatMem(0, 'MiB'), '0 MiB');
  assert.strictEqual(PT.formatMem(2048, 'GiB'), '2.00 GiB');
  assert.strictEqual(PT.formatMem(1536, 'GiB'), '1.50 GiB');
  assert.strictEqual(PT.formatMem(100, 'GiB'), '0.10 GiB');
  assert.strictEqual(PT.formatMem(300), '300 MiB'); // MiB por defecto
  assert.strictEqual(PT.formatMem(null, 'MiB'), '—');
  assert.strictEqual(PT.formatMem(undefined, 'GiB'), '—');
  assert.strictEqual(PT.formatMem(NaN), '—');
});
