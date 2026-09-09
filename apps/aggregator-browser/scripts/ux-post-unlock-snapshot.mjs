#!/usr/bin/env node
/**
 * Post-unlock UX snapshot via Playwright Chromium (not Cursor browser).
 * Writes screenshots under .local/ux-playwright/ (gitignored via .local/).
 */
import { chromium } from 'playwright';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.REPO_ROOT || resolve(scriptDir, '../../..');
const BROWSE_URL = process.env.BROWSE_URL || 'https://browse.parnoir.com';
const OUT = resolve(ROOT, '.local/ux-playwright');
mkdirSync(OUT, { recursive: true });

const identityPath = resolve(ROOT, '.local/test-pn/identity.pn');
const keysPath = resolve(ROOT, '.local/test-pn/keys.env');
const keys = readFileSync(keysPath, 'utf8');
const PN_NAME = keys.match(/^PN_NAME=(.+)$/m)?.[1]?.trim();
const PASSCODE = keys.match(/^PASSCODE=(.+)$/m)?.[1]?.trim();

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();

const report = {
  unlocked: false,
  oauth: { challenge: false, authenticate: false },
  chrome: {},
  notes: [],
};

page.on('request', (req) => {
  const u = req.url();
  if (u.includes('/oauth/authorize/challenge') && req.method() === 'POST') report.oauth.challenge = true;
  if (u.includes('/oauth/authorize/authenticate') && req.method() === 'POST') report.oauth.authenticate = true;
});

await page.goto(`${BROWSE_URL}/?view=feed`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.screenshot({ path: resolve(OUT, '01-locked.png'), fullPage: false });

const popupPromise = page.waitForEvent('popup', { timeout: 15_000 });
await page.getByTitle('Unlock pN').click();
const popup = await popupPromise;
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
  report.notes.push('Approve step skipped (existing grant)');
}
await popup.waitForEvent('close', { timeout: 120_000 }).catch(() => {});
await page.waitForTimeout(8_000);

const unlockBtn = page.getByTitle('Unlock pN');
const lockBtn = page.getByTitle('Lock pN');
report.unlocked = !(await unlockBtn.isVisible().catch(() => false)) || (await lockBtn.isVisible().catch(() => false));
report.chrome.lockControl = (await lockBtn.isVisible().catch(() => false)) ? 'Lock pN' : ((await unlockBtn.isVisible().catch(() => false)) ? 'Unlock pN' : 'missing');

const railLabels = ['DISCOVER', 'pN', 'MEDIA', 'THOUGHTS', 'COLLECTIONS'];
report.chrome.feedRail = {};
for (const label of railLabels) {
  report.chrome.feedRail[label] = await page.getByRole('button', { name: label }).isVisible().catch(() => false);
}

const bottom = ['Home', 'Search', 'Upload', 'Me', 'Inbox'];
report.chrome.bottomNav = {};
for (const label of bottom) {
  report.chrome.bottomNav[label] = await page.getByRole('button', { name: label }).isVisible().catch(() => false);
}

await page.screenshot({ path: resolve(OUT, '02-unlocked-feed.png'), fullPage: false });

// Collections tab
const collections = page.getByRole('button', { name: 'COLLECTIONS' });
if (await collections.isVisible().catch(() => false)) {
  await collections.click();
  await page.waitForTimeout(1500);
  report.chrome.collectionsUrl = page.url();
  await page.screenshot({ path: resolve(OUT, '03-collections.png'), fullPage: false });
}

// Try open Upload / TextPostEditor for emoji railway (may need unlock)
const upload = page.getByRole('button', { name: 'Upload' });
if (await upload.isVisible().catch(() => false)) {
  await upload.click();
  await page.waitForTimeout(2000);
  const emojiRailway = await page.locator('text=😀').first().isVisible().catch(() => false);
  report.chrome.uploadEmojiRailway = emojiRailway;
  await page.screenshot({ path: resolve(OUT, '04-upload.png'), fullPage: false });
  await page.keyboard.press('Escape').catch(() => {});
}

// Messaging host quick check with same storage? separate origin — skip session share
await page.goto('https://messaging.parnoir.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.waitForTimeout(3000);
report.messaging = {
  url: page.url(),
  unlockVisible: await page.getByTitle('Unlock pN').isVisible().catch(() => false),
  lockVisible: await page.getByTitle('Lock pN').isVisible().catch(() => false),
  messagesTab: await page.getByRole('button', { name: 'Messages' }).isVisible().catch(() => false),
};
await page.screenshot({ path: resolve(OUT, '05-messaging.png'), fullPage: false });

writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log('WROTE', OUT);

await browser.close();
process.exit(report.unlocked && report.oauth.challenge && report.oauth.authenticate ? 0 : 1);
