'use strict';
// Escritura atómica (F1-06): tmp en el mismo directorio + fsync + rename.
// Un corte a mitad (crash, apagón, disco lleno) deja el archivo anterior intacto, nunca uno truncado.
const fs = require('node:fs');
const path = require('node:path');

function writeAtomic(file, data, opts) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  const fd = fs.openSync(tmp, 'w', opts && opts.mode);
  try {
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
  } catch (e) {
    fs.closeSync(fd);
    try { fs.unlinkSync(tmp); } catch (_) {}
    throw e;
  }
  fs.closeSync(fd);
  fs.renameSync(tmp, file);
}

module.exports = { writeAtomic };
