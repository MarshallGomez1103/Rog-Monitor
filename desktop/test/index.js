'use strict';
// Node >= 22 no expande directorios en `node --test desktop/test`: este índice carga todos los *.test.js.
const fs = require('node:fs');
for (const f of fs.readdirSync(__dirname).sort()) if (f.endsWith('.test.js')) require('./' + f);
