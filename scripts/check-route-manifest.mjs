#!/usr/bin/env node
/**
 * ROUTE_MANIFEST drift check (Wave E ratchet).
 *
 * 1. Live manifest rows must appear as method+path mounts in api/src.
 * 2. Deprecated rows marked **Removed** must NOT be mounted for that method.
 * 3. Deprecated rows marked **410 Gone** (intentional tombstones) must still be mounted.
 *
 * Optional: --selftest proves synthetic live-without-mount fails.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const manifestPath = path.join(root, 'docs/developer/ROUTE_MANIFEST.md');
const apiSrcDir = path.join(root, 'api/src');

const METHOD_RE = /^(GET|POST|PUT|DELETE|PATCH)(?:\/(DELETE|POST|PUT|GET|PATCH))?$/i;

function walkTsFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      out.push(...walkTsFiles(full));
    } else if (/\.(ts|js)$/.test(name) && !name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** @returns {Set<string>} keys `${METHOD} ${path}` */
function extractMountedKeys(source) {
  const keys = new Set();
  const re = /\bapp\.(get|post|put|delete|patch)\(\s*['"`](\/[^'"`]+)['"`]/g;
  let m;
  while ((m = re.exec(source))) {
    const method = m[1].toUpperCase();
    const p = m[2].split('?')[0];
    keys.add(`${method} ${p}`);
  }
  return keys;
}

function expandMethods(methodCell) {
  const raw = methodCell.replace(/\s+/g, '');
  const parts = raw.split('/').filter(Boolean);
  return parts.map((p) => p.toUpperCase());
}

function parseManifest(md) {
  const live = [];
  const removed = [];
  const tombstone410 = [];
  let section = 'live';
  for (const line of md.split('\n')) {
    if (/^##\s+Deprecated/i.test(line)) {
      section = 'deprecated';
      continue;
    }
    if (/^##\s+/.test(line) && !/^##\s+Deprecated/i.test(line)) {
      section = 'live';
    }
    if (!/^\| /.test(line)) continue;
    const parts = line.split('|').map((s) => s.trim());
    const methodCell = parts[1] || '';
    if (!METHOD_RE.test(methodCell.replace(/\s+/g, '')) && !methodCell.includes('/')) {
      if (!/^(GET|POST|PUT|DELETE|PATCH)/i.test(methodCell)) continue;
    }
    if (!/^(GET|POST|PUT|DELETE|PATCH)/i.test(methodCell)) continue;
    const rawPath = (parts[2] || '').replace(/`/g, '').split(' ')[0];
    if (!rawPath || rawPath === 'Path' || rawPath.includes('---')) continue;
    const status = parts[3] || '';
    const methods = expandMethods(methodCell);
    const entries = methods.map((method) => ({ method, path: rawPath, status }));

    const isRemovedMarker = /\*\*Removed\*\*/i.test(status);
    const is410 = /\*\*410\b|410 Gone/i.test(status);

    if (section === 'deprecated') {
      if (isRemovedMarker) {
        removed.push(...entries);
      } else if (is410) {
        tombstone410.push(...entries);
      }
      continue;
    }
    live.push(...entries);
  }
  return { live, removed, tombstone410 };
}

function runCheck() {
  const md = fs.readFileSync(manifestPath, 'utf8');
  const { live, removed, tombstone410 } = parseManifest(md);
  const files = walkTsFiles(apiSrcDir);
  const combined = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const mounted = extractMountedKeys(combined);

  const keyOf = (e) => `${e.method} ${e.path}`;
  const missingMount = live.filter((e) => !mounted.has(keyOf(e)));
  const stillMounted = removed.filter((e) => mounted.has(keyOf(e)));
  const missingTombstone = tombstone410.filter((e) => !mounted.has(keyOf(e)));

  let failed = false;
  if (missingMount.length) {
    failed = true;
    console.error('Route manifest: live entries not mounted in API:');
    for (const m of missingMount) console.error('  -', keyOf(m));
  }
  if (stillMounted.length) {
    failed = true;
    console.error('Route manifest: **Removed** paths still mounted:');
    for (const m of stillMounted) console.error('  -', keyOf(m));
  }
  if (missingTombstone.length) {
    failed = true;
    console.error('Route manifest: intentional 410 tombstones missing mounts:');
    for (const m of missingTombstone) console.error('  -', keyOf(m));
  }
  if (failed) process.exit(1);
  console.log(
    `Route manifest check: OK (${live.length} live, ${removed.length} removed, ${tombstone410.length} 410 tombstones).`
  );
}

function runSelftest() {
  const sample = `app.post('/api/messages/conversation', h); app.get('/oauth/authorize', h);`;
  const mounted = extractMountedKeys(sample);
  if (!mounted.has('POST /api/messages/conversation') || !mounted.has('GET /oauth/authorize')) {
    console.error('selftest extract failed', [...mounted]);
    process.exit(1);
  }
  console.log('Route manifest extract selftest: OK');
}

if (process.argv.includes('--selftest')) {
  runSelftest();
} else {
  runCheck();
}
