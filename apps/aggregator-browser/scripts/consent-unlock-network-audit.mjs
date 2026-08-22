#!/usr/bin/env node
/**
 * Consent-phase network audit: counts API calls during popup unlock until callback navigation.
 *
 * Requires `.local/test-pn/identity.pn` + `keys.env` and Playwright chromium.
 * Usage:
 *   node apps/aggregator-browser/scripts/consent-unlock-network-audit.mjs
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

const CONSENT_MAX = {
  'POST /oauth/authorize/challenge': 1,
  'POST /oauth/authorize/authenticate': 1,
  'GET /oauth/existing-grant': 4,
};

const consentRequests = [];

function trackConsent(target) {
  target.on('request', (req) => {
    const u = req.url();
    if (!u.includes('api.parnoir.com')) return;
    try {
      const path = new URL(u).pathname;
      if (
        path === '/oauth/authorize/challenge' ||
        path === '/oauth/authorize/authenticate' ||
        path === '/oauth/existing-grant' ||
        path === '/oauth/consent'
      ) {
        consentRequests.push({ method: req.method(), path });
      }
    } catch {
      /* ignore */
    }
  });
}

function summarizeConsent(list) {
  const byPath = new Map();
  for (const r of list) {
    const key = `${r.method} ${r.path}`;
    byPath.set(key, (byPath.get(key) || 0) + 1);
  }
  return [...byPath.entries()].sort((a, b) => b[1] - a[1]);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
trackConsent(page);

await page.goto(`${BROWSE_URL}/?view=feed&qa=consent-audit`, {
  waitUntil: 'domcontentloaded',
  timeout: 60_000,
});

const popupPromise = page.waitForEvent('popup', { timeout: 15_000 });
await page.getByTitle('Unlock pN').click();
const popup = await popupPromise;
trackConsent(popup);

await popup.waitForURL(/oauth\/consent/, { timeout: 30_000 });
await popup.locator('#identityFile').setInputFiles(identityPath);
await popup.getByPlaceholder('Enter Key 1').fill(PN_NAME);
await popup.getByPlaceholder('Enter Key 2').fill(PASSCODE);
await popup.getByRole('button', { name: 'Unlock pN' }).click();

const approve = popup.getByRole('button', { name: 'Approve' });
try {
  await approve.waitFor({ state: 'visible', timeout: 90_000 });
  await approve.click();
} catch {
  /* existing-grant fast path */
}

await popup.waitForURL(/oauth-callback\.html|browse\.parnoir|127\.0\.0\.1/, { timeout: 120_000 }).catch(() => {});

const summary = summarizeConsent(consentRequests);
const counts = Object.fromEntries(summary);

console.log('CONSENT_PHASE_START');
console.log('TOTAL_CONSENT_API_REQUESTS', consentRequests.length);
for (const [k, c] of summary) console.log(`${c}x ${k}`);
console.log('CONSENT_PHASE_END');

const violations = [];
for (const [pattern, max] of Object.entries(CONSENT_MAX)) {
  const actual = counts[pattern] ?? 0;
  if (actual > max) {
    violations.push(`${pattern}: ${actual} > max ${max}`);
  }
}

await browser.close();

if (violations.length > 0) {
  console.error('FAIL: consent-phase limits exceeded');
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log('PASS: consent-phase network audit within limits');
process.exit(0);
