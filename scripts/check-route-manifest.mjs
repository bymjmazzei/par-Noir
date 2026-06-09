#!/usr/bin/env node
/**
 * Lightweight drift check: ROUTE_MANIFEST path strings should appear in server sources.
 * Does not parse Express; false positives/negatives possible — intent is CI signal only.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const manifestPath = path.join(root, 'docs/developer/ROUTE_MANIFEST.md');
const sources = [
  path.join(root, 'api/src/server.ts'),
  path.join(root, 'api/src/server/modules/apiRoutes.ts'),
  path.join(root, 'api/src/server/modules/feedRoutes.ts'),
  path.join(root, 'api/src/server/modules/adminDeveloperRoutes.ts'),
  path.join(root, 'api/src/server/modules/developerSelfServiceRoutes.ts'),
  path.join(root, 'api/src/server/modules/integratorRoutes.ts'),
  path.join(root, 'api/src/server/modules/identityMigrationService.ts')
];

const md = fs.readFileSync(manifestPath, 'utf8');
const rows = md.split('\n').filter((line) => /^\| (GET|POST|PUT|DELETE|PATCH) \|/.test(line));

const paths = rows
  .map((line) => {
    const parts = line.split('|').map((s) => s.trim());
    return parts[2] || '';
  })
  .filter((p) => p && !p.includes('---') && p !== 'Path');

const combined = sources
  .filter((f) => fs.existsSync(f))
  .map((f) => fs.readFileSync(f, 'utf8'))
  .join('\n');

let missing = [];
for (const p of paths) {
  const normalized = p.replace(/`/g, '').split(' ')[0];
  if (!normalized) continue;
  if (!combined.includes(normalized)) {
    missing.push(normalized);
  }
}

if (missing.length) {
  console.error('Route manifest drift: these entries were not found as substrings in server sources:');
  for (const m of missing) console.error('  -', m);
  process.exit(1);
}

console.log('Route manifest drift check: OK (' + paths.length + ' paths checked).');
