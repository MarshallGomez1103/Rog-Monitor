'use strict';
// N-A3-01: modelo puro del editor de gráficas (orden, toggle, arrastre, presets).
// chart-editor-model.js es un script clásico (window.RogChartEditor) con export CommonJS.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.join(__dirname, '..', 'renderer', 'chart-editor-model.js');
const M = require(file);

const KEYS = ['cpu_temp', 'cpu_power', 'gpu_temp', 'gpu_power', 'cpu_usage', 'ram_gb', 'swap_gb', 'gpu_util'];
const PRESETS = {
  temp: ['cpu_temp', 'cpu_power', 'gpu_temp', 'gpu_power'],
  usage: ['cpu_usage', 'ram_gb', 'swap_gb', 'gpu_util'],
};
const FALLBACK = PRESETS.temp;
const deepFreeze = (a) => Object.freeze(a);

test('normalizeChartList: JSON válido, array y orden conservado', () => {
  assert.deepStrictEqual(M.normalizeChartList('["ram_gb","cpu_temp"]', KEYS, FALLBACK), ['ram_gb', 'cpu_temp']);
  assert.deepStrictEqual(M.normalizeChartList(['gpu_util', 'cpu_usage'], KEYS, FALLBACK), ['gpu_util', 'cpu_usage']);
});

test('normalizeChartList: rechaza claves heredadas de Object.prototype (Hallazgo A)', () => {
  for (const bad of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf', 'length']) {
    assert.deepStrictEqual(M.normalizeChartList([bad, 'ram_gb'], KEYS, FALLBACK), ['ram_gb'], bad);
    assert.deepStrictEqual(M.normalizeChartList([bad], KEYS, FALLBACK), FALLBACK, bad);
    assert.deepStrictEqual(M.normalizeChartList(JSON.stringify([bad]), KEYS, FALLBACK), FALLBACK, bad);
  }
});

test('normalizeChartList: catálogo dado como objeto solo cuenta propiedades propias', () => {
  const catalog = { cpu_temp: [], ram_gb: [] };
  assert.deepStrictEqual(M.normalizeChartList(['constructor', 'ram_gb', '__proto__'], catalog, FALLBACK), ['ram_gb']);
});

test('normalizeChartList: JSON corrupto, vacío y tipos raros vuelven a una copia del fallback', () => {
  for (const bad of ['{no es json', '', '[]', '{}', '"cpu_temp"', 'null', null, undefined, 42, {}, [], [1, null, {}, 'nope']]) {
    const out = M.normalizeChartList(bad, KEYS, FALLBACK);
    assert.deepStrictEqual(out, FALLBACK);
    assert.notStrictEqual(out, FALLBACK, 'debe ser copia');
  }
});

test('normalizeChartList: deduplica, descarta desconocidas y no muta', () => {
  const input = deepFreeze(['cpu_temp', 'zzz', 'cpu_temp', 'ram_gb', 'ram_gb']);
  assert.deepStrictEqual(M.normalizeChartList(input, KEYS, FALLBACK), ['cpu_temp', 'ram_gb']);
  assert.deepStrictEqual(input, ['cpu_temp', 'zzz', 'cpu_temp', 'ram_gb', 'ram_gb']);
});

test('normalizeChartList: catálogo inválido => fallback', () => {
  assert.deepStrictEqual(M.normalizeChartList(['cpu_temp'], null, FALLBACK), FALLBACK);
});

test('toggleChart: añade al final y quita', () => {
  const list = deepFreeze(['cpu_temp', 'ram_gb']);
  assert.deepStrictEqual(M.toggleChart(list, 'gpu_util', KEYS), ['cpu_temp', 'ram_gb', 'gpu_util']);
  assert.deepStrictEqual(M.toggleChart(list, 'cpu_temp', KEYS), ['ram_gb']);
  assert.deepStrictEqual(list, ['cpu_temp', 'ram_gb']);
});

test('toggleChart: la última gráfica no se desmarca (copia sin cambio)', () => {
  const list = deepFreeze(['ram_gb']);
  const out = M.toggleChart(list, 'ram_gb', KEYS);
  assert.deepStrictEqual(out, ['ram_gb']);
  assert.notStrictEqual(out, list);
});

test('toggleChart: clave heredada o desconocida no se añade', () => {
  const list = ['cpu_temp'];
  for (const bad of ['constructor', '__proto__', 'toString', 'nope', undefined, 7]) {
    assert.deepStrictEqual(M.toggleChart(list, bad, KEYS), ['cpu_temp'], String(bad));
  }
});

test('moveChart: sube, baja, bordes y ausente sin cambio, sin mutar', () => {
  const list = deepFreeze(['a', 'b', 'c']);
  assert.deepStrictEqual(M.moveChart(list, 'b', -1), ['b', 'a', 'c']);
  assert.deepStrictEqual(M.moveChart(list, 'b', 1), ['a', 'c', 'b']);
  assert.deepStrictEqual(M.moveChart(list, 'a', -1), ['a', 'b', 'c']);
  assert.deepStrictEqual(M.moveChart(list, 'c', 1), ['a', 'b', 'c']);
  assert.deepStrictEqual(M.moveChart(list, 'zz', 1), ['a', 'b', 'c']);
  assert.deepStrictEqual(M.moveChart(list, 'b', 0), ['a', 'b', 'c']);
  assert.notStrictEqual(M.moveChart(list, 'a', -1), list);
});

test('moveChartTo: mueve a un índice, clamp fuera de rango, sin mutar', () => {
  const list = deepFreeze(['a', 'b', 'c', 'd']);
  assert.deepStrictEqual(M.moveChartTo(list, 'a', 2), ['b', 'c', 'a', 'd']);
  assert.deepStrictEqual(M.moveChartTo(list, 'd', 0), ['d', 'a', 'b', 'c']);
  assert.deepStrictEqual(M.moveChartTo(list, 'a', 99), ['b', 'c', 'd', 'a']);
  assert.deepStrictEqual(M.moveChartTo(list, 'd', -5), ['d', 'a', 'b', 'c']);
  assert.deepStrictEqual(M.moveChartTo(list, 'b', 1), ['a', 'b', 'c', 'd']);
  assert.deepStrictEqual(M.moveChartTo(list, 'zz', 1), ['a', 'b', 'c', 'd']);
  assert.deepStrictEqual(M.moveChartTo(list, 'a', NaN), ['a', 'b', 'c', 'd']);
  assert.deepStrictEqual(M.moveChartTo(list, 'a', '2'), ['a', 'b', 'c', 'd']);
  assert.deepStrictEqual(M.moveChartTo(list, 'a', 1.9), ['b', 'a', 'c', 'd'], 'se trunca');
  assert.deepStrictEqual(list, ['a', 'b', 'c', 'd']);
});

test('dropChart: soltar sobre una fila activa deja la gráfica en la posición del destino', () => {
  const list = deepFreeze(['a', 'b', 'c', 'd']);
  assert.deepStrictEqual(M.dropChart(list, 'a', 'c'), ['b', 'c', 'a', 'd']);
  assert.deepStrictEqual(M.dropChart(list, 'd', 'a'), ['d', 'a', 'b', 'c']);
  assert.deepStrictEqual(M.dropChart(list, 'b', 'b'), ['a', 'b', 'c', 'd'], 'sobre sí misma: sin cambio');
  assert.deepStrictEqual(list, ['a', 'b', 'c', 'd']);
});

test('dropChart: destino inactivo, ausente o heredado NO mueve (nunca al principio)', () => {
  const list = deepFreeze(['a', 'b', 'c']);
  for (const target of ['zz', 'constructor', '__proto__', undefined, null, 3]) {
    assert.deepStrictEqual(M.dropChart(list, 'c', target), ['a', 'b', 'c'], String(target));
  }
  assert.deepStrictEqual(M.dropChart(list, 'zz', 'a'), ['a', 'b', 'c'], 'origen ausente');
  assert.deepStrictEqual(M.dropChart(null, 'a', 'b'), []);
});

test('dropDirection: marca dónde caerá (above/below) o null si no hay movimiento', () => {
  const list = deepFreeze(['a', 'b', 'c', 'd']);
  assert.strictEqual(M.dropDirection(list, 'd', 'a'), 'above');
  assert.strictEqual(M.dropDirection(list, 'a', 'd'), 'below');
  assert.strictEqual(M.dropDirection(list, 'b', 'b'), null);
  assert.strictEqual(M.dropDirection(list, 'b', 'zz'), null);
  assert.strictEqual(M.dropDirection(list, 'zz', 'a'), null);
  assert.strictEqual(M.dropDirection(null, 'a', 'b'), null);
});

test('canMoveChart: bordes, ausente, dir inválida', () => {
  const list = deepFreeze(['a', 'b', 'c']);
  assert.strictEqual(M.canMoveChart(list, 'a', -1), false);
  assert.strictEqual(M.canMoveChart(list, 'a', 1), true);
  assert.strictEqual(M.canMoveChart(list, 'c', 1), false);
  assert.strictEqual(M.canMoveChart(list, 'c', -1), true);
  assert.strictEqual(M.canMoveChart(list, 'zz', 1), false);
  assert.strictEqual(M.canMoveChart(list, 'b', 0), false);
  assert.strictEqual(M.canMoveChart(['a'], 'a', 1), false);
});

test('editorRows: activas en orden, luego el resto del catálogo en orden de catálogo', () => {
  const list = deepFreeze(['ram_gb', 'cpu_temp', 'gpu_util']);
  const rows = M.editorRows(list, KEYS);
  assert.deepStrictEqual(rows.map((r) => r.key), ['ram_gb', 'cpu_temp', 'gpu_util', 'cpu_power', 'gpu_temp', 'gpu_power', 'cpu_usage', 'swap_gb']);
  assert.deepStrictEqual(rows[0], { key: 'ram_gb', on: true, index: 0, canUp: false, canDown: true });
  assert.deepStrictEqual(rows[1], { key: 'cpu_temp', on: true, index: 1, canUp: true, canDown: true });
  assert.deepStrictEqual(rows[2], { key: 'gpu_util', on: true, index: 2, canUp: true, canDown: false });
  assert.deepStrictEqual(rows[3], { key: 'cpu_power', on: false, index: -1, canUp: false, canDown: false });
  assert.strictEqual(rows.filter((r) => r.on).length, 3);
  assert.deepStrictEqual(list, ['ram_gb', 'cpu_temp', 'gpu_util']);
});

test('editorRows: lista con una sola gráfica no puede moverse; lista con claves ajenas las ignora', () => {
  const one = M.editorRows(['ram_gb'], KEYS)[0];
  assert.deepStrictEqual(one, { key: 'ram_gb', on: true, index: 0, canUp: false, canDown: false });
  const rows = M.editorRows(['constructor', 'ram_gb'], KEYS);
  assert.strictEqual(rows.length, KEYS.length);
  assert.ok(!rows.some((r) => r.key === 'constructor'));
  assert.strictEqual(rows[0].index, 0);
});

test('presetOf / nextPresetList', () => {
  assert.strictEqual(M.presetOf(deepFreeze([...PRESETS.temp]), PRESETS), 'temp');
  assert.strictEqual(M.presetOf([...PRESETS.usage], PRESETS), 'usage');
  assert.strictEqual(M.presetOf([...PRESETS.usage].reverse(), PRESETS), null, 'el orden importa');
  assert.strictEqual(M.presetOf(['cpu_temp'], PRESETS), null);
  assert.strictEqual(M.presetOf(null, PRESETS), null);
  assert.strictEqual(M.presetOf(['cpu_temp'], null), null);
  assert.deepStrictEqual(M.nextPresetList(PRESETS.usage, PRESETS), PRESETS.temp);
  assert.deepStrictEqual(M.nextPresetList(PRESETS.temp, PRESETS), PRESETS.usage);
  assert.deepStrictEqual(M.nextPresetList(['ram_gb'], PRESETS), PRESETS.usage);
  const out = M.nextPresetList(PRESETS.temp, PRESETS);
  assert.notStrictEqual(out, PRESETS.usage, 'copia');
});

test('focusActAfterMove: sigue al botón; en el borde pasa al contrario; sin opción => null', () => {
  const list = deepFreeze(['a', 'b', 'c']);
  assert.strictEqual(M.focusActAfterMove(list, 'c', -1), 'up', 'c sube a medio: «up» sigue habilitado');
  assert.strictEqual(M.focusActAfterMove(list, 'b', -1), 'down', 'b llega arriba: «up» queda disabled');
  assert.strictEqual(M.focusActAfterMove(list, 'b', 1), 'up', 'b llega abajo: «down» queda disabled');
  assert.strictEqual(M.focusActAfterMove(['a', 'b', 'c', 'd'], 'd', -1), 'up');
  assert.strictEqual(M.focusActAfterMove(['a', 'b', 'c', 'd'], 'a', 1), 'down');
  assert.strictEqual(M.focusActAfterMove(list, 'a', -1), 'down', 'ya arriba, no se mueve');
  assert.strictEqual(M.focusActAfterMove(['a'], 'a', 1), null);
  assert.strictEqual(M.focusActAfterMove(list, 'zz', 1), null);
  assert.strictEqual(M.focusActAfterMove(list, 'a', 0), null);
});

test('entradas congeladas: ninguna función lanza ni muta', () => {
  const list = deepFreeze(['cpu_temp', 'ram_gb', 'gpu_util']);
  const cat = deepFreeze([...KEYS]);
  assert.doesNotThrow(() => {
    M.normalizeChartList(list, cat, list);
    M.toggleChart(list, 'swap_gb', cat);
    M.toggleChart(list, 'ram_gb', cat);
    M.moveChart(list, 'ram_gb', 1);
    M.moveChartTo(list, 'ram_gb', 0);
    M.editorRows(list, cat);
    M.focusActAfterMove(list, 'ram_gb', 1);
    M.nextPresetList(list, PRESETS);
  });
});

test('script clásico: expone window.RogChartEditor en un contexto de navegador y no usa DOM/localStorage', () => {
  const src = fs.readFileSync(file, 'utf8');
  const win = {};
  vm.runInNewContext(src, { window: win });
  assert.strictEqual(typeof win.RogChartEditor.normalizeChartList, 'function');
  assert.deepStrictEqual(Object.keys(win.RogChartEditor).sort(), Object.keys(M).sort());
  assert.ok(!/\b(document|localStorage|querySelector)\b/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));
});

test('el modelo ya no expone el estado de «expandir» (función retirada)', () => {
  for (const k of ['createExpandState', 'toggleExpanded', 'collapseExpanded', 'isExpanded', 'reconcileExpanded']) assert.strictEqual(M[k], undefined, k);
});

/* ---- arrastre con Pointer Events (UIFIX-01): máquina de estados pura y destino por posición ---- */
test('createPointerDrag: no arranca hasta superar el umbral (4 px por defecto) y entonces fija el origen', () => {
  const d = M.createPointerDrag();
  assert.deepStrictEqual(d.state(), { phase: 'idle', key: null });
  assert.deepStrictEqual(d.down('cpu_power', 10, 100), { phase: 'pending', key: 'cpu_power' });
  assert.strictEqual(d.move(12, 102).phase, 'pending', '2,8 px < 4');
  assert.strictEqual(d.move(10, 103).phase, 'pending', '3 px < 4');
  assert.deepStrictEqual(d.move(10, 104), { phase: 'dragging', key: 'cpu_power' }, 'exactamente 4 px arranca');
  assert.strictEqual(d.move(10, 100).phase, 'dragging', 'ya arrancado, volver al origen no lo anula');
});

test('createPointerDrag: umbral configurable, diagonal por distancia euclídea', () => {
  const d = M.createPointerDrag(10);
  d.down('a', 0, 0);
  assert.strictEqual(d.move(7, 7).phase, 'pending', '9,9 px < 10');
  assert.strictEqual(d.move(8, 7).phase, 'dragging');
});

test('createPointerDrag: up devuelve si hubo arrastre real (un clic no es arrastre) y deja el estado en reposo', () => {
  const d = M.createPointerDrag();
  d.down('a', 5, 5);
  d.move(6, 6);
  assert.deepStrictEqual(d.up(), { dragged: false, key: 'a' });
  assert.deepStrictEqual(d.state(), { phase: 'idle', key: null });
  d.down('b', 5, 5);
  d.move(5, 50);
  assert.deepStrictEqual(d.up(), { dragged: true, key: 'b' });
  assert.deepStrictEqual(d.state(), { phase: 'idle', key: null });
  assert.deepStrictEqual(d.up(), { dragged: false, key: null }, 'up sin down: nada');
});

test('createPointerDrag: cancel (Escape) vuelve a reposo; move sin down no hace nada; un segundo down reinicia', () => {
  const d = M.createPointerDrag();
  assert.deepStrictEqual(d.move(1, 100), { phase: 'idle', key: null });
  d.down('a', 0, 0);
  d.move(0, 40);
  assert.strictEqual(d.state().phase, 'dragging');
  assert.deepStrictEqual(d.cancel(), { phase: 'idle', key: null });
  assert.deepStrictEqual(d.up(), { dragged: false, key: null }, 'tras cancelar, el up no suelta nada');
  d.down('a', 0, 0);
  d.down('b', 9, 9);
  assert.deepStrictEqual(d.state(), { phase: 'pending', key: 'b' });
  assert.deepStrictEqual(d.move(9, 9), { phase: 'pending', key: 'b' }, 'el umbral cuenta desde el último down');
});

test('createPointerDrag: coordenadas no finitas se ignoran (no arrancan ni lanzan)', () => {
  const d = M.createPointerDrag();
  d.down('a', 0, 0);
  assert.strictEqual(d.move(NaN, 100).phase, 'pending');
  assert.strictEqual(d.move(undefined, undefined).phase, 'pending');
  const bad = M.createPointerDrag();
  bad.down('a', NaN, 0);
  assert.strictEqual(bad.state().phase, 'idle');
  bad.down('', 0, 0);
  assert.strictEqual(bad.state().phase, 'idle', 'clave vacía no es válida');
});

test('dropTargetAt: fila ACTIVA bajo la posición vertical; inactivas, huecos y fuera => null', () => {
  const rects = deepFreeze([
    { key: 'a', top: 0, bottom: 40 }, { key: 'b', top: 40, bottom: 80 }, { key: 'c', top: 80, bottom: 120 }, { key: 'x', top: 120, bottom: 160 },
  ]);
  const list = deepFreeze(['a', 'b', 'c']);
  assert.strictEqual(M.dropTargetAt(list, rects, 0), 'a');
  assert.strictEqual(M.dropTargetAt(list, rects, 39.9), 'a');
  assert.strictEqual(M.dropTargetAt(list, rects, 40), 'b', 'el borde pertenece a la fila de abajo');
  assert.strictEqual(M.dropTargetAt(list, rects, 119.9), 'c');
  assert.strictEqual(M.dropTargetAt(list, rects, 130), null, 'x está desactivada');
  assert.strictEqual(M.dropTargetAt(list, rects, -1), null);
  assert.strictEqual(M.dropTargetAt(list, rects, 500), null);
  assert.strictEqual(M.dropTargetAt(list, rects, NaN), null);
  assert.strictEqual(M.dropTargetAt(list, null, 10), null);
  assert.strictEqual(M.dropTargetAt(null, rects, 10), null);
  assert.strictEqual(M.dropTargetAt(['constructor'], [{ key: 'constructor', top: 0, bottom: 10 }], 5), 'constructor', 'sólo cuenta si está en la lista dada');
  assert.strictEqual(M.dropTargetAt(list, [{ key: 'a', top: 'x', bottom: 10 }, null, 3], 5), null, 'rects malformados se ignoran');
});

test('arrastre de punta a punta: down -> move -> dropTargetAt -> dropChart (mismo resultado que el DnD anterior)', () => {
  const list = ['cpu_temp', 'cpu_power', 'gpu_temp', 'gpu_power'];
  const rects = list.map((key, i) => ({ key, top: i * 40, bottom: i * 40 + 40 }));
  const d = M.createPointerDrag();
  d.down('cpu_temp', 20, 20);
  d.move(20, 60);
  d.move(20, 150);
  const end = d.up();
  assert.strictEqual(end.dragged, true);
  const target = M.dropTargetAt(list, rects, 150);
  assert.strictEqual(target, 'gpu_power');
  assert.deepStrictEqual(M.dropChart(list, end.key, target), ['cpu_power', 'gpu_temp', 'gpu_power', 'cpu_temp']);
  assert.strictEqual(M.dropDirection(list, 'cpu_temp', target), 'below');
});
