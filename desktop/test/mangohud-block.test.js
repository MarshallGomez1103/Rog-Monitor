'use strict';
// S11 capa B (ADR-0007): bloques marcados propios en MangoHud.conf (desktop/mangohud-block.js).
// Nunca se reescriben las líneas del usuario, nunca `exec=`. Escritura solo en carpetas temporales.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const M = require('../mangohud-block.js');

const USER = [
  '# mi config',
  'position=top-right',
  'fps_limit=144   # con espacios al final   ',
  '',
  'font_size=18',
].join('\n') + '\n';

function tmpConf(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rog-mango-test-'));
  const file = path.join(dir, 'MangoHud', 'MangoHud.conf');
  if (content != null) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return { dir, file, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

const userLinesKept = (out) => {
  const outLines = out.split('\n');
  let i = 0;
  for (const l of USER.split('\n').filter((x) => x.trim())) {
    i = outLines.indexOf(l, i);
    if (i < 0) return false;
    i += 1;
  }
  return true;
};

test('marcadores: el bloque FPS conserva sus marcas históricas; el modo juego tiene las suyas', () => {
  assert.strictEqual(M.FPS_MARKERS.start, '# --- ROG Monitor FPS (autogenerado, no editar) ---');
  assert.strictEqual(M.FPS_MARKERS.end, '# --- /ROG Monitor FPS ---');
  assert.ok(M.GAME_MARKERS.start.startsWith('# --- ROG Monitor'));
  assert.notStrictEqual(M.GAME_MARKERS.start, M.FPS_MARKERS.start);
});

test('mergeBlock: añade al final sin tocar las líneas del usuario y reemplaza su propio bloque', () => {
  const once = M.mergeBlock(USER, M.GAME_MARKERS, ['position=top-left', 'fps']);
  assert.ok(once.startsWith(USER.trimEnd()));
  assert.ok(once.endsWith(`${M.GAME_MARKERS.start}\nposition=top-left\nfps\n${M.GAME_MARKERS.end}\n`));
  assert.ok(userLinesKept(once));
  const twice = M.mergeBlock(once, M.GAME_MARKERS, ['position=bottom-left']);
  assert.strictEqual(twice.split(M.GAME_MARKERS.start).length, 2, 'un solo bloque');
  assert.ok(!twice.includes('position=top-left'));
  assert.ok(userLinesKept(twice));
});

test('mergeBlock: quitar deja el archivo del usuario como estaba; los dos bloques conviven', () => {
  const both = M.mergeBlock(M.mergeBlock(USER, M.FPS_MARKERS, ['autostart_log=1']), M.GAME_MARKERS, ['fps']);
  assert.ok(M.hasBlock(both, M.FPS_MARKERS) && M.hasBlock(both, M.GAME_MARKERS));
  const noGame = M.mergeBlock(both, M.GAME_MARKERS, null);
  assert.ok(!M.hasBlock(noGame, M.GAME_MARKERS));
  assert.ok(M.hasBlock(noGame, M.FPS_MARKERS));
  assert.strictEqual(M.mergeBlock(noGame, M.FPS_MARKERS, null), USER.trimEnd() + '\n');
  assert.strictEqual(M.mergeBlock('', M.GAME_MARKERS, null), '');
  assert.strictEqual(M.mergeBlock(undefined, M.GAME_MARKERS, ['fps']), `${M.GAME_MARKERS.start}\nfps\n${M.GAME_MARKERS.end}\n`);
});

test('mergeBlock: un bloque sin marca de cierre (editado a mano) se quita hasta el final, no se duplica', () => {
  const broken = USER + M.GAME_MARKERS.start + '\nfps\n';
  const out = M.mergeBlock(broken, M.GAME_MARKERS, ['fps']);
  assert.strictEqual(out.split(M.GAME_MARKERS.start).length, 2);
  assert.ok(userLinesKept(out));
});

test('mapAnchor: los 6 anclajes de MangoHud pasan igual; center -> top-center; desconocido -> top-right', () => {
  for (const a of ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right']) assert.strictEqual(M.mapAnchor(a), a);
  assert.strictEqual(M.mapAnchor('center'), 'top-center');
  assert.strictEqual(M.mapAnchor('x'), 'top-right');
});

test('gameModeLines: métricas equivalentes, anclaje mapeado, look legible y acento del tema', () => {
  const lines = M.gameModeLines({ corner: 'center', show: { cpu: true, gpu: true, fans: true }, layout: 'row', accent: '#ff5a1f' });
  assert.strictEqual(lines[0], 'position=top-center');
  for (const k of ['fps', 'cpu_stats', 'cpu_temp', 'cpu_power', 'gpu_stats', 'gpu_temp', 'gpu_power', 'horizontal', 'round_corners=0', 'cpu_color=FF5A1F', 'gpu_color=FF5A1F']) {
    assert.ok(lines.includes(k), k);
  }
  const box = M.gameModeLines({ corner: 'top-right', show: { cpu: false, gpu: true }, layout: 'box', accent: 'rgb(1,2,3)' });
  assert.ok(!box.includes('horizontal'));
  assert.ok(!box.some((l) => l.startsWith('cpu_')));
  assert.ok(!box.some((l) => l.endsWith('_color=')));
  assert.ok(box.includes('gpu_temp'));
  assert.deepStrictEqual(M.gameModeLines(null)[0], 'position=top-right');
});

test('gameModeLines: nunca exec= ni saltos de línea inyectados; solo claves conocidas', () => {
  const evil = M.gameModeLines({ corner: 'top-left\nexec=rm -rf ~', accent: '#ffffff\nexec=x', layout: 'row\nexec=y', show: { cpu: true } });
  for (const l of evil) {
    assert.match(l, /^[a-z_]+(=[A-Za-z0-9.-]+)?$/, l);
    assert.ok(!l.startsWith('exec'), l);
  }
});

test('missingRows: lo que MangoHud no puede mostrar (ventiladores ASUS) se dice, no se inventa', () => {
  assert.deepStrictEqual(M.missingRows({ cpu: true, gpu: true, fans: true }), ['fans']);
  assert.deepStrictEqual(M.missingRows({ fans: false }), []);
  assert.deepStrictEqual(M.missingRows(null), ['fans']);
});

test('writeBlock: crea la carpeta, escribe atómico, conserva al usuario y quitar no crea archivo', () => {
  const fresh = tmpConf(null);
  try {
    assert.deepStrictEqual(M.writeBlock(fresh.file, M.GAME_MARKERS, null), { ok: true, enabled: false });
    assert.strictEqual(fs.existsSync(fresh.file), false);
    assert.deepStrictEqual(M.writeBlock(fresh.file, M.GAME_MARKERS, ['fps']), { ok: true, enabled: true });
    assert.strictEqual(fs.readFileSync(fresh.file, 'utf8'), `${M.GAME_MARKERS.start}\nfps\n${M.GAME_MARKERS.end}\n`);
    assert.strictEqual(M.readEnabled(fresh.file, M.GAME_MARKERS), true);
  } finally { fresh.done(); }

  const user = tmpConf(USER);
  try {
    M.writeBlock(user.file, M.GAME_MARKERS, ['fps']);
    assert.ok(userLinesKept(fs.readFileSync(user.file, 'utf8')));
    M.writeBlock(user.file, M.GAME_MARKERS, null);
    assert.strictEqual(fs.readFileSync(user.file, 'utf8'), USER.trimEnd() + '\n');
    assert.strictEqual(M.readEnabled(user.file, M.GAME_MARKERS), false);
    assert.deepStrictEqual(fs.readdirSync(path.dirname(user.file)), ['MangoHud.conf'], 'sin temporales sueltos');
  } finally { user.done(); }
});

test('writeBlock/readEnabled: errores de E/S se devuelven con código estable, sin lanzar', () => {
  const t = tmpConf(null);
  try {
    // el "directorio" padre es un archivo -> mkdir falla
    fs.writeFileSync(path.join(t.dir, 'MangoHud'), 'x');
    const res = M.writeBlock(t.file, M.GAME_MARKERS, ['fps']);
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.code, 'mangohud_write_failed');
    assert.strictEqual(M.readEnabled(t.file, M.GAME_MARKERS), false);
  } finally { t.done(); }
});
