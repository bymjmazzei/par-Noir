#!/usr/bin/env node
/** Repo-root entry → apps/aggregator-browser deep flow map. */
import { spawnSync } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = resolve(root, 'apps/aggregator-browser/scripts/ux-deep-flow-map.mjs');
const r = spawnSync(process.execPath, [script, ...process.argv.slice(2)], {
  cwd: resolve(root, 'apps/aggregator-browser'),
  stdio: 'inherit',
  env: { ...process.env, REPO_ROOT: root },
});
process.exit(r.status ?? 1);
