#!/usr/bin/env node
/**
 * Complete OAuth consent unlock (identity file + keys) in Playwright.
 * Used when Cursor browser MCP cannot drive file inputs.
 */
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.REPO_ROOT || resolve(scriptDir, '../../..');
const consentUrl = process.argv[2];
if (!consentUrl) {
  console.error('Usage: node complete-consent-unlock.mjs <consent-url>');
  process.exit(2);
}

const identityPath = resolve(ROOT, '.local/test-pn/identity.pn');
const keysPath = resolve(ROOT, '.local/test-pn/keys.env');
if (!existsSync(identityPath) || !existsSync(keysPath)) {
  console.error('Missing .local/test-pn fixture');
  process.exit(2);
}

const keys = readFileSync(keysPath, 'utf8');
const PN_NAME = keys.match(/^PN_NAME=(.+)$/m)?.[1]?.trim();
const PASSCODE = keys.match(/^PASSCODE=(.+)$/m)?.[1]?.trim();
if (!PN_NAME || !PASSCODE) process.exit(2);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(consentUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.locator('#identityFile').setInputFiles(identityPath);
await page.getByPlaceholder('Enter Key 1').fill(PN_NAME);
await page.getByPlaceholder('Enter Key 2').fill(PASSCODE);
await page.getByRole('button', { name: 'Unlock pN' }).click();

const approve = page.getByRole('button', { name: 'Approve' });
try {
  await approve.waitFor({ state: 'visible', timeout: 90_000 });
  await approve.click();
} catch {
  /* existing-grant skip */
}

await page.waitForEvent('close', { timeout: 120_000 }).catch(() => {});
await browser.close();
console.log('CONSENT_UNLOCK_DONE');
