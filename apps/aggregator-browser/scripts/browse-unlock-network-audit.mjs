#!/usr/bin/env node
/**
 * Live browse unlock network audit.
 *
 * Requires `.local/test-pn/identity.pn` + `keys.env` and Playwright chromium.
 * Usage (from repo root or apps/aggregator-browser):
 *   node apps/aggregator-browser/scripts/browse-unlock-network-audit.mjs
 *
 * Optional env:
 *   BROWSE_URL=https://browse.parnoir.com
 *   REPO_ROOT=/path/to/par-Noir
 */

import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.REPO_ROOT || resolve(scriptDir, '../../..');
const BROWSE_URL = process.env.BROWSE_URL || 'https://browse.parnoir.com';

const identityPath = resolve(ROOT, '.local/test-pn/identity.pn');
const keysPath = resolve(ROOT, '.local/test-pn/keys.env');

if (!existsSync(identityPath) || !existsSync(keysPath)) {
  console.error('Missing .local/test-pn fixture (identity.pn + keys.env)');
  process.exit(2);
}

const keys = readFileSync(keysPath, 'utf8');
const PN_NAME = keys.match(/^PN_NAME=(.+)$/m)?.[1]?.trim();
const PASSCODE = keys.match(/^PASSCODE=(.+)$/m)?.[1]?.trim();
if (!PN_NAME || !PASSCODE) {
  console.error('keys.env must define PN_NAME and PASSCODE');
  process.exit(2);
}

/** Post-unlock solo-path targets from dedupe plan. */
const CONSENT_MAX = {
  'POST /oauth/authorize/challenge': 1,
  'POST /oauth/authorize/authenticate': 1,
  'GET /oauth/existing-grant': 4,
};

/** Post-unlock solo-path targets from dedupe plan. */
const BROWSE_MAX = {
  'POST /oauth/token': 1,
  'GET /oauth/userinfo': 1,
  'GET /api/storage/accounts': 1,
  'POST /api/engagement/bulk-stats': 1,
  'GET /api/aggregator/metadata-index': 4,
  'GET /api/aggregator/public-content/:id': 8,
  'GET /api/connections': 1,
  'GET /api/connections/:other/status': 0
};

const requests = [];
let consentPhaseEnded = false;
const seenRequests = new WeakSet();

function track(target) {
  target.on('request', (req) => {
    if (seenRequests.has(req)) return;
    seenRequests.add(req);
    const u = req.url();
    if (u.includes('api.parnoir.com')) {
      requests.push({ method: req.method(), url: u, phase: consentPhaseEnded ? 'browse' : 'consent' });
    }
  });
}

function summarize(list, phaseFilter) {
  const filtered = phaseFilter ? list.filter((r) => r.phase === phaseFilter) : list;
  const byPath = new Map();
  for (const r of filtered) {
    try {
      const u = new URL(r.url);
      let p = u.pathname;
      if (p.startsWith('/api/aggregator/metadata-index/') && p !== '/api/aggregator/metadata-index') {
        p = '/api/aggregator/metadata-index/:id';
      } else if (p === '/api/aggregator/metadata-index') {
        p = '/api/aggregator/metadata-index';
      }
      if (p.includes('/public-content/')) p = '/api/aggregator/public-content/:id';
      if (p.startsWith('/api/storage/accounts/')) p = '/api/storage/accounts';
      if (p === '/api/connections') p = '/api/connections';
      if (/\/connections\/[^/]+\/status$/.test(p)) p = '/api/connections/:other/status';
      const key = `${r.method} ${p}`;
      byPath.set(key, (byPath.get(key) || 0) + 1);
    } catch {
      /* ignore malformed URLs */
    }
  }
  return [...byPath.entries()].sort((a, b) => b[1] - a[1]);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
track(context);

const page = await context.newPage();

await page.goto(`${BROWSE_URL}/?view=feed&qa=solo-path-audit`, {
  waitUntil: 'domcontentloaded',
  timeout: 60_000
});

const popupPromise = page.waitForEvent('popup', { timeout: 15_000 });
await page.getByTitle('Unlock pN').click();
const popup = await popupPromise;

await popup.waitForURL(/oauth\/consent/, { timeout: 30_000 });
await popup.locator('#identityFile').setInputFiles(identityPath);
await popup.getByPlaceholder('Enter Key 1').fill(PN_NAME);
await popup.getByPlaceholder('Enter Key 2').fill(PASSCODE);
await popup.getByRole('button', { name: 'Unlock pN' }).click();

// Step 2 consent appears for new grants; existing-grant flows may skip Approve.
const approve = popup.getByRole('button', { name: 'Approve' });
try {
  await approve.waitFor({ state: 'visible', timeout: 90_000 });
  await approve.click();
} catch {
  /* redirecting without second consent step */
}

popup.waitForURL(/oauth-callback\.html/, { timeout: 120_000 }).then(() => {
  consentPhaseEnded = true;
}).catch(() => {});

await popup.waitForEvent('close', { timeout: 120_000 }).catch(() => {});
consentPhaseEnded = true;
await page.waitForTimeout(15_000);

const unlockVisible = await page.getByTitle('Unlock pN').isVisible().catch(() => false);
const consentSummary = summarize(requests, 'consent');
const browseSummary = summarize(requests, 'browse');
const fullSummary = summarize(requests);
const consentCounts = Object.fromEntries(consentSummary);
const browseCounts = Object.fromEntries(browseSummary);
const fullCounts = Object.fromEntries(fullSummary);

console.log('UNLOCKED', !unlockVisible);
console.log('TOTAL_API_REQUESTS', requests.length);
console.log('CONSENT_PHASE_START');
for (const [k, c] of consentSummary) console.log(`${c}x ${k}`);
console.log('CONSENT_PHASE_END');
console.log('BROWSE_PHASE_START');
for (const [k, c] of browseSummary) console.log(`${c}x ${k}`);
console.log('BROWSE_PHASE_END');
console.log('SUMMARY_START');
for (const [k, c] of fullSummary) console.log(`${c}x ${k}`);
console.log('SUMMARY_END');

const violations = [];
for (const [pattern, max] of Object.entries(CONSENT_MAX)) {
  const actual = consentCounts[pattern] ?? 0;
  if (actual > max) {
    violations.push(`consent ${pattern}: ${actual} > max ${max}`);
  }
}
for (const [pattern, max] of Object.entries(BROWSE_MAX)) {
  const actual = fullCounts[pattern] ?? 0;
  if (actual > max) {
    violations.push(`${pattern}: ${actual} > max ${max}`);
  }
}

await browser.close();

if (unlockVisible) {
  console.error('FAIL: unlock did not complete');
  process.exit(1);
}

if (violations.length > 0) {
  console.error('FAIL: solo-path limits exceeded');
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log('PASS: solo-path network audit within limits');
process.exit(0);
