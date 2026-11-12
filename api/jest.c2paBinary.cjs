/**
 * c2pa-node loads its native addon with createRequire(import.meta.url), which CommonJS Jest
 * cannot parse. Same addon, loaded from CommonJS.
 */
const path = require('path');

let neon = null;

function getNeonBinary() {
  if (neon === null) {
    const dir = path.dirname(require.resolve('@contentauth/c2pa-node/package.json'));
    neon = require(process.env.C2PA_LIBRARY_PATH ?? path.join(dir, 'dist/index.node'));
  }
  return neon;
}

module.exports = { getNeonBinary };
