#!/usr/bin/env node
/**
 * Fail-soft prepare: build dist when typescript is resolvable.
 * Never fails npm install (Railway uses --ignore-scripts; build:deps builds packages).
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function findTsc() {
  const local = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
  if (fs.existsSync(local)) return local;
  try {
    return require.resolve('typescript/bin/tsc', { paths: [root, path.join(root, '../..'), path.join(root, '../../api')] });
  } catch {
    return null;
  }
}

const tsc = findTsc();
if (!tsc) {
  console.warn('[standard-data-points] prepare: tsc not found — skip (api: npm run build:deps)');
  process.exit(0);
}

const result = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.json'], {
  cwd: root,
  stdio: 'inherit',
});
if (result.status !== 0) {
  console.warn('[standard-data-points] prepare: build failed — skip (api: npm run build:deps)');
}
process.exit(0);
