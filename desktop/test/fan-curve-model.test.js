'use strict';
// Matemática de la UI del editor de curvas (renderer/fan-curve-model.js, F3-02 corte «fan math»).
// Solo presentación: las reglas de validación/servicio viven en priv.js y en el vigilante.
const test = require('node:test');
const assert = require('node:assert');
const M = require('../renderer/fan-curve-model.js');

const CAL = { calibration: { cpu: [[50, 1000], [100, 3000], [255, 6000]] } };

test('fanKeys: claves de las curvas del perfil o, sin perfil, los 3 ventiladores', () => {
  assert.deepStrictEqual(M.fanKeys(null), ['cpu', 'gpu', 'mid']);
  assert.deepStrictEqual(M.fanKeys({}), ['cpu', 'gpu', 'mid']);
  assert.deepStrictEqual(M.fanKeys({ curves: { cpu: [], gpu: [] } }), ['cpu', 'gpu']);
});

test('fanCalibrated: exige al menos 2 puntos de calibración', () => {
  assert.strictEqual(M.fanCalibrated(null, 'cpu'), false);
  assert.strictEqual(M.fanCalibrated({ calibration: { cpu: [[50, 1000]] } }, 'cpu'), false);
  assert.strictEqual(M.fanCalibrated(CAL, 'cpu'), true);
  assert.strictEqual(M.fanCalibrated(CAL, 'gpu'), false);
});

test('fanMaxRpm: medido > por defecto del ventilador > 6000; 0 no cuenta', () => {
  assert.strictEqual(M.fanMaxRpm(null, 'cpu'), 7000);
  assert.strictEqual(M.fanMaxRpm(null, 'gpu'), 6900);
  assert.strictEqual(M.fanMaxRpm(null, 'mid'), 7500);
  assert.strictEqual(M.fanMaxRpm(null, 'otro'), 6000);
  assert.strictEqual(M.fanMaxRpm({ max_rpm: { cpu: 5000 } }, 'cpu'), 5000);
  assert.strictEqual(M.fanMaxRpm({ max_rpm: { cpu: 0 } }, 'cpu'), 7000);
});

test('capToPwm sin calibración: regla de tres con el máximo estimado (tope 255)', () => {
  assert.strictEqual(M.capToPwm(null, 5500, 'cpu'), 197);
  assert.strictEqual(M.capToPwm(null, 99999, 'cpu'), 255);
  assert.strictEqual(M.capToPwm({ max_rpm: { cpu: 0 } }, 7000, 'cpu'), 251);   // max 0 = por defecto 7000
  assert.strictEqual(M.capToPwm({ calibration: { cpu: [[50, 1000]] } }, 5500, 'cpu'), 197);   // 1 punto no basta
});

test('capToPwm con calibración: interpola, ancla en el primer punto y satura en 255', () => {
  assert.strictEqual(M.capToPwm(CAL, 2000, 'cpu'), 74);
  assert.strictEqual(M.capToPwm(CAL, 3040, 'cpu'), 100);     // 0.985 * 3040 ≈ 2994 -> justo bajo el punto 100
  assert.strictEqual(M.capToPwm(CAL, 500, 'cpu'), 25);       // entre (0,0) y (50,1000)
  assert.strictEqual(M.capToPwm(CAL, 6100, 'cpu'), 255);
  const flat = { calibration: { cpu: [[50, 1000], [60, 1000], [255, 6000]] } };
  assert.strictEqual(M.capToPwm(flat, 1015, 'cpu'), 50);     // tramo plano: devuelve el primer pwm
});

test('capToPwm ignora puntos con rpm 0 y los ordena por pwm', () => {
  const cfg = { calibration: { cpu: [[255, 6000], [0, 0], [50, 1000], [100, 3000]] } };
  assert.strictEqual(M.capToPwm(cfg, 2000, 'cpu'), 74);
});

test('pwmToRpm sin calibración: lineal 0..max', () => {
  assert.strictEqual(M.pwmToRpm(null, 0, 'cpu'), 0);
  assert.strictEqual(M.pwmToRpm(null, 255, 'cpu'), 7000);
  assert.strictEqual(M.pwmToRpm(null, 255, 'otro'), 6000);   // ventilador desconocido
  assert.strictEqual(M.pwmToRpm({ max_rpm: { cpu: 0 } }, 255, 'cpu'), 7000);
});

test('pwmToRpm con calibración: bajo el primer punto escala, entre puntos interpola, tras el último satura', () => {
  assert.strictEqual(M.pwmToRpm(CAL, 25, 'cpu'), 500);
  assert.strictEqual(M.pwmToRpm(CAL, 0, 'cpu'), 0);
  assert.strictEqual(M.pwmToRpm(CAL, 50, 'cpu'), 1000);
  assert.strictEqual(M.pwmToRpm(CAL, 75, 'cpu'), 2000);
  assert.strictEqual(M.pwmToRpm(CAL, 255, 'cpu'), 6000);
  assert.strictEqual(M.pwmToRpm(CAL, 300, 'cpu'), 6000);
});

test('capToPwm y pwmToRpm son aproximadamente inversas con calibración', () => {
  for (const cap of [1500, 2500, 4000, 5500]) {
    const rpm = M.pwmToRpm(CAL, M.capToPwm(CAL, cap, 'cpu'), 'cpu');
    assert.ok(Math.abs(rpm - cap * 0.985) < 60, `${cap} -> ${rpm}`);
  }
});

test('estimateFanDba: 24 dBA parado, 48 al máximo, acotado y sin NaN con max 0', () => {
  assert.strictEqual(M.estimateFanDba(null, 'cpu', 0), 24);
  assert.strictEqual(M.estimateFanDba(null, 'cpu', 7000), 48);
  assert.strictEqual(M.estimateFanDba(null, 'cpu', 99999), 48);
  assert.strictEqual(M.estimateFanDba(null, 'cpu', -50), 24);
  assert.strictEqual(M.estimateFanDba({ max_rpm: { cpu: 0 } }, 'cpu', 7000), 48);
  const mid = M.estimateFanDba(null, 'cpu', 3500);
  assert.ok(mid > 24 && mid < 48);
  assert.ok(M.estimateFanDba(null, 'cpu', 4000) > mid);
});

test('combinedDba: suma energética; ignora no finitos y <= 0; sin válidos = null', () => {
  assert.strictEqual(M.combinedDba([]), null);
  assert.strictEqual(M.combinedDba([NaN, 0, -3, undefined]), null);
  assert.ok(Math.abs(M.combinedDba([40]) - 40) < 1e-9);
  assert.ok(Math.abs(M.combinedDba([40, 40]) - 43.0103) < 1e-3);
  assert.ok(Math.abs(M.combinedDba([40, NaN, 40]) - 43.0103) < 1e-3);
});

test('capMapFromSource: solo caps numéricos >= 2000, redondeados y de las claves dadas', () => {
  assert.deepStrictEqual(M.capMapFromSource({ cpu: '5500', gpu: 1999, mid: 'x' }, ['cpu', 'gpu', 'mid']), { cpu: 5500 });
  assert.deepStrictEqual(M.capMapFromSource({ cpu: 5500.4, gpu: 6000 }, ['cpu']), { cpu: 5500 });
  assert.deepStrictEqual(M.capMapFromSource(null, ['cpu']), {});
  assert.deepStrictEqual(M.capMapFromSource({ cpu: null }, ['cpu']), {});
});

test('capValues: lista redondeada de caps válidos', () => {
  assert.deepStrictEqual(M.capValues({ cpu: 5500, gpu: '4500.6', mid: 100 }), [5500, 4501]);
  assert.deepStrictEqual(M.capValues(null), []);
  assert.deepStrictEqual(M.capValues(), []);
});

test('fanCapDisplay: sin cap, un valor común o desglose por ventilador', () => {
  const name = (f) => f.toUpperCase();
  assert.strictEqual(M.fanCapDisplay({}, name, 'SIN'), 'SIN');
  assert.strictEqual(M.fanCapDisplay({ cpu: 100 }, name, 'SIN'), 'SIN');
  assert.strictEqual(M.fanCapDisplay({ cpu: 5500, gpu: 5500 }, name, 'SIN'), '5500 RPM');
  assert.strictEqual(M.fanCapDisplay({ cpu: 5500, gpu: 4500, mid: 100 }, name, 'SIN'), 'CPU 5500 · GPU 4500');
});

test('geometría: extremos de tempToGraphX / pwmToGraphY con saturación y valores raros', () => {
  const G = M.FAN_GRAPH;
  assert.strictEqual(M.tempToGraphX(G.tempMin), G.x0);
  assert.strictEqual(M.tempToGraphX(G.tempMax), G.x1);
  assert.strictEqual(M.tempToGraphX(-50), G.x0);
  assert.strictEqual(M.tempToGraphX(500), G.x1);
  assert.strictEqual(M.tempToGraphX('abc'), G.x0);
  assert.strictEqual(M.tempToGraphX(undefined), G.x0);
  assert.strictEqual(M.pwmToGraphY(0), G.yBottom);
  assert.strictEqual(M.pwmToGraphY(255), G.yTop);
  assert.strictEqual(M.pwmToGraphY(-9), G.yBottom);
  assert.strictEqual(M.pwmToGraphY(999), G.yTop);
  assert.strictEqual(M.pwmToGraphY(null), G.yBottom);
});

test('ida y vuelta temp <-> x en todo el rango', () => {
  const G = M.FAN_GRAPH;
  for (let temp = G.tempMin; temp <= G.tempMax; temp++) {
    assert.strictEqual(M.graphXToTemp(M.tempToGraphX(temp), 0, [{ value: String(temp) }]), temp, `temp ${temp}`);
  }
});

test('graphXToTemp respeta a los vecinos (temperaturas estrictamente crecientes)', () => {
  const G = M.FAN_GRAPH;
  const inputs = [{ value: '50' }, { value: '60' }, { value: '70' }];
  assert.strictEqual(M.graphXToTemp(G.x1, 1, inputs), 69);
  assert.strictEqual(M.graphXToTemp(G.x0, 1, inputs), 51);
  assert.strictEqual(M.graphXToTemp(G.x0 - 100, 0, inputs), G.tempMin);
  assert.strictEqual(M.graphXToTemp(G.x1 + 100, 2, inputs), G.tempMax);
});

test('ida y vuelta pwm <-> y (porcentaje entero 0..100)', () => {
  const G = M.FAN_GRAPH;
  for (let pct = 0; pct <= 100; pct++) {
    assert.strictEqual(M.graphYToPercent(M.pwmToGraphY(pct * 255 / 100)), pct, `pct ${pct}`);
  }
  assert.strictEqual(M.graphYToPercent(G.yBottom + 50), 0);
  assert.strictEqual(M.graphYToPercent(G.yTop - 50), 100);
});

test('app.js solo cablea el modelo (sin copias de la matemática) y este se carga antes', () => {
  const fs = require('node:fs');
  const nodePath = require('node:path');
  const rend = nodePath.join(__dirname, '..', 'renderer');
  const src = fs.readFileSync(nodePath.join(rend, 'app.js'), 'utf8');
  assert.match(src, /= window\.RogFanCurveModel;/);
  for (const fn of ['capToPwm', 'pwmToRpm', 'estimateFanDba', 'tempToGraphX', 'graphYToPercent']) {
    assert.ok(!new RegExp(`^function ${fn}\\(`, 'm').test(src), `${fn} duplicada en app.js`);
  }
  const html = fs.readFileSync(nodePath.join(rend, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(scripts.indexOf('fan-curve-model.js') >= 0 && scripts.indexOf('fan-curve-model.js') < scripts.indexOf('app.js'));
});
