#!/usr/bin/env node
// Comprobador documental (N-C-01 / N-C-04): README.md y CHANGELOG.md deben seguir
// diciendo la verdad sobre v22. Sin dependencias. Exit code 1 si falla algo.
//
//   node scripts/check-docs.mjs
//
// Cada regla es {id, file, ok(texto, ctx) -> boolean, why}. "file" es README o CHANGELOG;
// la sección del CHANGELOG cuyo encabezado es la versión actual (`## 22.0.0 — fecha`, la del
// archivo VERSION) se extrae aparte para no condenar la historia (21.0.0 sí usó Electron 42).
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const readVersion = () => { try { return readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim(); } catch (_) { return ''; } };

const has = (re) => (t) => re.test(t);
const lacks = (re) => (t) => !re.test(t);

/** Texto de la sección `## <version> — fecha` del CHANGELOG hasta el siguiente `## `; '' si no existe. */
export function releaseSection(changelog, version) {
  if (!/^\d+\.\d+\.\d+$/.test(String(version || ''))) return '';
  const m = new RegExp(`^## ${version.replace(/\./g, '\\.')}(?:\\s.*)?$`, 'm').exec(changelog);
  if (!m) return '';
  const rest = changelog.slice(m.index + m[0].length);
  const next = /^## /m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

/** Contenido de una sección `### <título>` dentro de `text`; '' si no existe. */
function subsection(text, title) {
  const re = new RegExp(`^### ${title}\\s*$`, 'm');
  const m = re.exec(text);
  if (!m) return '';
  const rest = text.slice(m.index + m[0].length);
  const next = /^###? /m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

export const RULES = [
  // ---------------------------------------------------------------- README
  { id: 'readme-requirements', file: 'README', ok: has(/^## Requirements\s*$/m), why: 'falta la sección "## Requirements"' },
  { id: 'readme-req-python-rich', file: 'README', ok: (t) => /Python/.test(t) && /\brich\b/i.test(t), why: 'Requirements debe nombrar Python y rich' },
  { id: 'readme-req-node22', file: 'README', ok: has(/Node(\.js)? 22/), why: 'Requirements debe nombrar Node 22' },
  { id: 'readme-electron44', file: 'README', ok: has(/Electron 44/), why: 'falta "Electron 44"' },
  { id: 'readme-no-electron42', file: 'README', ok: lacks(/Electron 42/), why: '"Electron 42" ya no es la versión actual' },
  { id: 'readme-six-states', file: 'README', ok: (t) => /\bsix widget states\b/i.test(t)
      && ['loading', 'ok', 'empty', 'unsupported', 'error', 'stale'].every((s) => new RegExp(`\\b${s}\\b`, 'i').test(t)),
    why: 'debe decir "six widget states" y nombrar loading/ok/empty/unsupported/error/stale' },
  { id: 'readme-no-four-states', file: 'README', ok: lacks(/Four widget states/i), why: 'quedó "Four widget states"' },
  { id: 'readme-no-data-notice', file: 'README', ok: (t) => /NO DATA/.test(t) && /\b6 s\b/.test(t), why: 'falta el aviso NO DATA (SIN DATOS) y sus 6 s' },
  { id: 'readme-chart-editor', file: 'README', ok: (t) => /chart editor/i.test(t) && /Alt\+/.test(t) && /drag/i.test(t),
    why: 'falta el editor de gráficas (↑↓, Alt+↑↓, arrastrar)' },
  { id: 'readme-coverage', file: 'README', ok: (t) => /\b80 ?%/.test(t) && /\b90 ?%/.test(t) && /coverage/i.test(t), why: 'falta la cobertura (Python 80 %, Node 90 %)' },
  { id: 'readme-undo', file: 'README', ok: has(/\bUndo\b/), why: 'falta Deshacer (Undo) al borrar un benchmark' },
  { id: 'readme-fan-watchdog', file: 'README', ok: (t) => /3000 rpm/.test(t) && /60 s/.test(t) && /180 s/.test(t) && /50 °C/.test(t) && /three profiles|all three profiles/i.test(t),
    why: 'falta el vigilante de atasco (3000 rpm, 60 s, 180 s), curvas desde 50 °C y los tres perfiles' },
  { id: 'readme-guardian', file: 'README', ok: (t) => /^#{2,3} Thermal guardian/m.test(t) && /simulation/i.test(t) && /ADR-0005|0005-guardian-simulation-first/.test(t)
      && /nv_dynamic_boost/.test(t) && /PL2/.test(t) && /opt-in|off by default|not enabled/i.test(t),
    why: 'falta la sección del Guardián (simulación primero, ADR-0005, recorte de nv_dynamic_boost/PL2, opt-in)' },
  { id: 'readme-tui-key-f', file: 'README', ok: has(/^\| `f` \|/m), why: 'la tabla de teclas TUI no tiene `f` (filtro de severidad)' },
  { id: 'readme-tui-themes', file: 'README', ok: (t) => /\brog\b/.test(t) && /\bice\b/.test(t) && /\bmatrix\b/.test(t) && /three (color )?themes|3 (color )?themes/i.test(t),
    why: 'debe decir que la TUI tiene 3 temas (rog/ice/matrix) frente a 12 del escritorio' },
  { id: 'readme-processes-25', file: 'README', ok: has(/up to 25/), why: 'procesos: "up to 25"' },
  { id: 'readme-config-keys', file: 'README', ok: (t) => ['close_action', 'ram_percent_warn', 'swap_percent_warn', 'disk_percent_warn', 'hysteresis_temp', 'hysteresis_pct', 'appearance'].every((k) => t.includes(`"${k}"`)),
    why: 'el ejemplo de config.json no incluye las claves de config.py' },
  { id: 'readme-loopback', file: 'README', ok: has(/127\.0\.0\.1/), why: 'debe matizar la sonda loopback a OpenRGB (127.0.0.1)' },
  { id: 'readme-no-no-sockets', file: 'README', ok: lacks(/opens no outgoing sockets/i), why: 'afirmación absoluta "opens no outgoing sockets"' },
  { id: 'readme-no-any-machine', file: 'README', ok: lacks(/Any machine exposing/), why: '"Any machine exposing standard chips works" es demasiado absoluto' },
  { id: 'readme-asus-only', file: 'README', ok: (t) => /ASUS-only|only on ASUS|ASUS-specific/i.test(t), why: 'debe separar hwmon genérico de funciones solo ASUS' },
  { id: 'readme-hybrid-pe', file: 'README', ok: has(/hybrid/i), why: 'P/E cores solo en CPU híbridas' },
  { id: 'readme-calibrated-user', file: 'README', ok: has(/(after|once) (you run|running) (the )?(fan )?calibration/i), why: '"calibrated" depende de que el usuario calibre' },
  { id: 'readme-reinstall-v22', file: 'README', ok: (t) => /v22/.test(t) && /without a `?VERSION`? bump/i.test(t) && /install-system\.sh/.test(t),
    why: 'falta la nota: en v22 los scripts root cambiaron sin subir VERSION; ejecutar install-system.sh' },
  { id: 'readme-old-screenshots', file: 'README', ok: has(/have\s+not\s+been\s+refreshed|older\s+than\s+v22/i), why: 'debe decir en texto que las capturas 01-07/demo son anteriores a v22' },
  { id: 'readme-no-powers-claim', file: 'README', ok: lacks(/the app does not change power or GPU mode\s+on its own/i), why: '"no cambia la potencia por sí misma" debe matizarse con el Guardián opt-in' },
  { id: 'readme-no-path-tracing', file: 'README', ok: lacks(/path.?tracing/i), why: 'Path Tracing no está verificado: no anunciarlo' },
  // ------------------------------------------------------------- CHANGELOG
  { id: 'changelog-current', file: 'CHANGELOG', ok: (t, c) => releaseSection(t, c.version) !== '', why: 'falta el encabezado "## <VERSION> — fecha" que coincide con el archivo VERSION' },
  { id: 'changelog-sections', file: 'CHANGELOG', ok: (t, c) => {
      const u = releaseSection(t, c.version);
      return ['Security', 'Fixed', 'Changed', 'Added', 'Tests & CI', 'Performance', 'Docs'].every((s) => subsection(u, s).trim() !== '');
    }, why: 'la sección de la versión actual debe tener Security/Fixed/Changed/Added/Tests & CI/Performance/Docs con contenido' },
  { id: 'changelog-electron44', file: 'CHANGELOG', ok: (t, c) => /Electron 44/.test(releaseSection(t, c.version)) && !/Electron 42/.test(releaseSection(t, c.version)),
    why: 'la versión actual debe decir Electron 44 y no "Electron 42"' },
  { id: 'changelog-watchdog-criterion', file: 'CHANGELOG', ok: (t, c) => { const u = releaseSection(t, c.version); return /3000 rpm/.test(u) && /25 ?%/.test(u) && !/1200 ?RPM/i.test(u); },
    why: 'criterio del vigilante: ≥3000 rpm y margen max(900 rpm, 25 %), no ">1200 RPM"' },
  { id: 'changelog-states-stale', file: 'CHANGELOG', ok: (t, c) => { const u = releaseSection(t, c.version); return /NO DATA/.test(u) && /stale/i.test(u); },
    why: 'falta el aviso NO DATA / estado stale' },
  { id: 'changelog-coverage', file: 'CHANGELOG', ok: (t, c) => { const u = releaseSection(t, c.version); return /80 ?%/.test(u) && /90 ?%/.test(u); }, why: 'falta la cobertura (80 % / 90 %)' },
  { id: 'changelog-known-limits', file: 'CHANGELOG', ok: (t, c) => {
      const u = subsection(releaseSection(t, c.version), 'Known limits / pending validation');
      return /Wayland/.test(u) && /installer/i.test(u) && /(thermal|heat)/i.test(u);
    }, why: 'falta "Known limits / pending validation" (Wayland, VM instalador, prueba térmica)' },
  { id: 'changelog-no-path-tracing', file: 'CHANGELOG', ok: lacks(/path.?tracing/i), why: 'Path Tracing no está verificado: no anunciarlo' },
  { id: 'changelog-partial-honest', file: 'CHANGELOG', ok: (t, c) => { const u = releaseSection(t, c.version); return /partial/i.test(u) && /future/i.test(u); },
    why: 'debe nombrar overlay/benchmarks como parciales y Guardián 2.0/helper único como futuro' },
];

const PRIVATE_PATHS = [/\/home\//, /\/var\/home\//, /MyFiles/, /\/Users\//];

/** Enlaces markdown e <img src> relativos del texto (sin ancla ni esquema). */
export function relativeLinks(text) {
  const out = [];
  const re = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\bsrc="([^"]+)"|\bhref="([^"]+)"/g;
  let m;
  while ((m = re.exec(text))) {
    const raw = m[1] || m[2] || m[3];
    if (!raw || /^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(raw)) continue;
    const p = raw.split('#')[0].split('?')[0];
    if (p) out.push(p);
  }
  return out;
}

/**
 * @param {{README: string, CHANGELOG: string}} docs  textos
 * @param {{exists?: (relPath: string) => boolean, version?: string}} [env]  inyectables para tests (version: por defecto, el archivo VERSION)
 * @returns {{id: string, why: string}[]} fallos (vacío = verde)
 */
export function checkDocs(docs, env = {}) {
  const exists = env.exists || ((p) => existsSync(path.join(ROOT, p)));
  const ctx = { version: env.version !== undefined ? env.version : readVersion() };
  const failures = [];
  for (const r of RULES) {
    if (!r.ok(docs[r.file], ctx)) failures.push({ id: r.id, why: r.why });
  }
  for (const [name, text] of Object.entries(docs)) {
    for (const re of PRIVATE_PATHS) {
      if (re.test(text)) failures.push({ id: `${name.toLowerCase()}-private-path`, why: `${name} contiene una ruta personal (${re})` });
    }
    for (const link of relativeLinks(text)) {
      if (!exists(link)) failures.push({ id: `${name.toLowerCase()}-broken-link`, why: `${name}: el enlace relativo "${link}" no existe` });
    }
  }
  return failures;
}

export function main(out = console, read = (f) => readFileSync(path.join(ROOT, f), 'utf8')) {
  const failures = checkDocs({ README: read('README.md'), CHANGELOG: read('CHANGELOG.md') }, { version: read('VERSION').trim() });
  if (failures.length === 0) {
    out.log(`check-docs: OK (${RULES.length} reglas + rutas privadas + enlaces relativos)`);
    return 0;
  }
  for (const f of failures) out.error(`FAIL ${f.id}: ${f.why}`);
  out.error(`check-docs: ${failures.length} fallo(s)`);
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
