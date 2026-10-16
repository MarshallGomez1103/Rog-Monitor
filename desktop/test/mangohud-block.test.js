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

test('gameModeLines: cada métrica elegida -> su clave; las no elegidas se apagan (=0); vertical; anclaje mapeado', () => {
  const lines = M.gameModeLines({ corner: 'center', metrics: ['cpu_usage', 'cpu_temp', 'cpu_power', 'gpu_usage', 'gpu_temp', 'gpu_power', 'fps', 'fan'], scale: 'M' });
  assert.strictEqual(lines[0], 'position=top-center');
  for (const k of ['cpu_stats', 'cpu_temp', 'cpu_power', 'cpu_mhz=0', 'gpu_stats', 'gpu_temp', 'gpu_power', 'gpu_core_clock=0',
    'ram=0', 'vram=0', 'fps', 'frametime', 'round_corners=0']) assert.ok(lines.includes(k), k);
  assert.ok(!lines.includes('horizontal'), 'disposición vertical como el overlay');
  const all = M.gameModeLines({ metrics: ['cpu_freq', 'gpu_freq', 'ram', 'vram'] });
  for (const k of ['cpu_mhz', 'gpu_core_clock', 'ram', 'vram', 'fps=0', 'frametime=0', 'cpu_temp=0', 'gpu_power=0']) assert.ok(all.includes(k), k);
  // MangoHud solo dibuja la fila CPU/GPU con cpu_stats/gpu_stats: una métrica suelta la necesita
  assert.ok(all.includes('cpu_stats') && all.includes('gpu_stats'));
  const none = M.gameModeLines({ metrics: [] });
  for (const k of ['cpu_stats=0', 'gpu_stats=0', 'fps=0']) assert.ok(none.includes(k), k);
  assert.deepStrictEqual(M.gameModeLines(null)[0], 'position=top-right');
  assert.ok(M.gameModeLines(null).includes('cpu_temp'), 'sin prefs: métricas por defecto (temperatura incluida)');
});

test('gameModeLines: escala -> font_size (24 x escala) y look MangoHud de alto contraste con los colores del overlay', () => {
  const size = (scale) => M.gameModeLines({ scale }).find((l) => l.startsWith('font_size='));
  assert.deepStrictEqual(['S', 'M', 'L', 'XL', 'nope'].map(size), ['font_size=24', 'font_size=30', 'font_size=36', 'font_size=48', 'font_size=30']);
  const l = M.gameModeLines({});
  for (const k of ['background_alpha=0.85', 'background_color=000000', 'text_color=FFFFFF', 'text_outline=1',
    'cpu_color=4FB3FF', 'gpu_color=42D77D', 'ram_color=FF85C0', 'vram_color=C4A1FF']) assert.ok(l.includes(k), k);
});

test('gameModeLines: nunca exec= ni saltos de línea inyectados; solo claves conocidas', () => {
  const evil = M.gameModeLines({ corner: 'top-left\nexec=rm -rf ~', scale: 'M\nexec=x', metrics: ['cpu_temp\nexec=y', 'exec'] });
  for (const l of evil) {
    assert.match(l, /^[a-z_]+(=[A-Za-z0-9.-]+)?$/, l);
    assert.ok(!l.startsWith('exec'), l);
  }
});

test('missingRows: lo que MangoHud no puede mostrar (ventiladores ASUS) se dice, no se inventa', () => {
  assert.deepStrictEqual(M.missingRows(['cpu_temp', 'fan']), ['fans']);
  assert.deepStrictEqual(M.missingRows(['cpu_temp']), []);
  assert.deepStrictEqual(M.missingRows(null), ['fans'], 'sin prefs: defaults (incluyen FAN)');
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
