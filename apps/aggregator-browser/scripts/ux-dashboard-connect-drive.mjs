#!/usr/bin/env node
/**
 * Connect QA Google Drive to test pN(s). Wait only while setup UI is active.
 *
 *   node scripts/ux-dashboard-connect-drive.mjs
 *   node scripts/ux-dashboard-connect-drive.mjs cursor-test-pn
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { unlockDashboard } from './ux-unlock-lib.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.REPO_ROOT || resolve(scriptDir, '../../..');
const OUT = resolve(ROOT, '.local/ux-playwright/drive-swap');
const PROFILE = resolve(ROOT, '.local/ux-playwright/google-chrome-profile');
mkdirSync(OUT, { recursive: true });

function slog(...a) {
  process.stderr.write(a.join(' ') + '\n');
}

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function loadPn(which) {
  const dir = resolve(ROOT, `.local/${which}`);
  const keys = loadEnv(resolve(dir, 'keys.env'));
  const fileName = keys.IDENTITY_FILE || (which === 'cursor-test-pn' ? 'pn374951080.pn' : 'identity.pn');
  let identityPath = resolve(dir, fileName);
  if (!existsSync(identityPath)) {
    identityPath = resolve(dir, which === 'cursor-test-pn' ? 'live-created.pn' : 'identity.pn');
  }
  return { which, identityPath, PN_NAME: keys.PN_NAME, PASSCODE: keys.PASSCODE };
}

const google = loadEnv(resolve(ROOT, '.local/test-google-drive/credentials.env'));
const whichArg = process.argv[2];
const fixtures = whichArg ? [loadPn(whichArg)] : [loadPn('test-pn'), loadPn('cursor-test-pn')];

async function shot(page, name) {
  await page.screenshot({ path: resolve(OUT, `${name}.png`), fullPage: false }).catch(() => {});
}

async function goStorage(page) {
  await page.getByRole('button', { name: /^Storage$/i }).or(page.getByText(/^Storage$/i)).first().click();
  await page.waitForTimeout(1000);
}

async function lock(page) {
  const b = page.getByRole('button', { name: /^Lock$/i }).first();
  if (await b.isVisible().catch(() => false)) {
    await b.click();
    await page.waitForTimeout(800);
  }
}

async function googleOauth(popup) {
  await popup.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => {});
  await popup.waitForTimeout(800);
  const account = popup.getByText(google.GOOGLE_EMAIL, { exact: false }).first();
  if (await account.isVisible().catch(() => false)) {
    await account.click();
    await popup.waitForTimeout(1200);
  } else {
    const email = popup.locator('input[type="email"], #identifierId').first();
    if (await email.isVisible().catch(() => false)) {
      await email.fill(google.GOOGLE_EMAIL);
      await popup.getByRole('button', { name: /Next/i }).first().click().catch(() => popup.locator('#identifierNext').click());
      await popup.waitForTimeout(2000);
    }
    const pass = popup.locator('input[type="password"], input[name="Passwd"]').first();
    if (await pass.isVisible({ timeout: 12_000 }).catch(() => false)) {
      await pass.fill(google.GOOGLE_PASSWORD);
      await popup.getByRole('button', { name: /Next/i }).first().click().catch(() => popup.locator('#passwordNext').click());
      await popup.waitForTimeout(2000);
    }
  }
  for (let i = 0; i < 6; i++) {
    const allow = popup.getByRole('button', { name: /^(Allow|Continue|Confirm|Accept)$/i }).first();
    if (await allow.isVisible().catch(() => false)) {
      await allow.click();
      await popup.waitForTimeout(1000);
    } else break;
  }
}

function isSettingUp(body) {
  return /Setting up your storage|Preparing your par Noir storage/i.test(body);
}

/** Wait only while setup banner is on screen. */
async function waitWhileSettingUp(page, label, maxMs = 8 * 60_000) {
  const t0 = Date.now();
  let lastPct = -1;
  let saw = false;

  // Brief window for setup UI to appear after connect (not idle padding)
  while (Date.now() - t0 < 20_000) {
    if (page.isClosed()) return { ok: false, reason: 'closed' };
    const body = await page.locator('body').innerText().catch(() => '');
    if (isSettingUp(body)) {
      saw = true;
      slog(label, 'setup started');
      break;
    }
    // Already done: connected + Disconnect, no setup banner
    if (
      (await page.locator('button').filter({ hasText: /^Disconnect$/i }).count()) > 0 &&
      /connected on this device|Google Drive connected/i.test(body)
    ) {
      slog(label, 'already populated (no setup banner)');
      return { ok: true, reason: 'ready_no_setup', elapsedMs: Date.now() - t0 };
    }
    await page.waitForTimeout(1000);
  }

  if (!saw) {
    const body = await page.locator('body').innerText().catch(() => '');
    if ((await page.locator('button').filter({ hasText: /^Disconnect$/i }).count()) > 0) {
      slog(label, 'Disconnect present — treating as done');
      return { ok: true, reason: 'disconnect_present', elapsedMs: Date.now() - t0 };
    }
    return { ok: false, reason: 'setup_never_appeared', elapsedMs: Date.now() - t0, snippet: body.slice(0, 200) };
  }

  while (Date.now() - t0 < maxMs) {
    if (page.isClosed()) return { ok: false, reason: 'closed' };
    let body = '';
    try {
      body = await page.locator('body').innerText();
    } catch {
      return { ok: false, reason: 'closed' };
    }
    if (/Drive setup failed|setup failed/i.test(body)) {
      await shot(page, `${label}-setup-failed`);
      return { ok: false, reason: 'failed', elapsedMs: Date.now() - t0 };
    }
    const pct = body.match(/(\d+)\s*%/);
    if (pct && Number(pct[1]) !== lastPct) {
      lastPct = Number(pct[1]);
      slog(label, `setup ${lastPct}%`);
    }
    if (!isSettingUp(body)) {
      await shot(page, `${label}-setup-done`);
      slog(label, `setup done (${Math.round((Date.now() - t0) / 1000)}s)`);
      return { ok: true, reason: 'setup_cleared', elapsedMs: Date.now() - t0 };
    }
    await page.waitForTimeout(2000);
  }
  await shot(page, `${label}-setup-timeout`);
  return { ok: false, reason: 'timeout', elapsedMs: Date.now() - t0 };
}

async function connectGoogle(page, label) {
  const btn = page.getByRole('button', { name: /Connect Google Drive|add or re-authenticate/i }).first();
  if (!(await btn.isVisible().catch(() => false))) throw new Error('Connect Google Drive button missing');
  // Already connected?
  const body0 = await page.locator('body').innerText();
  if (
    /Google Drive connected \([1-9]/i.test(body0) &&
    (await page.locator('button').filter({ hasText: /^Disconnect$/i }).count()) > 0 &&
    !isSettingUp(body0)
  ) {
    slog(label, 'already connected');
    return { already: true };
  }
  const popupPromise = page.waitForEvent('popup', { timeout: 25_000 });
  await btn.click();
  const popup = await popupPromise;
  slog(label, 'Google OAuth…');
  await googleOauth(popup);
  await popup.waitForEvent('close', { timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  return { already: false };
}

const report = { generatedAt: new Date().toISOString(), results: [] };
const context = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  viewport: { width: 1280, height: 900 },
  args: ['--disable-blink-features=AutomationControlled'],
});
const page = context.pages()[0] || (await context.newPage());

try {
  for (const fix of fixtures) {
    const label = fix.which;
    const entry = { fixture: label };
    slog('===', label, '===');
    try {
      await page.goto('https://pn.parnoir.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      if (await page.getByRole('button', { name: /^Lock$/i }).first().isVisible().catch(() => false)) {
        await lock(page);
        await page.goto('https://pn.parnoir.com/', { waitUntil: 'domcontentloaded' });
      }
      await unlockDashboard(page, [], fix);
      await goStorage(page);
      await shot(page, `${label}-before-connect`);

      entry.connect = await connectGoogle(page, label);
      entry.setup = entry.connect.already
        ? { ok: true, reason: 'already_connected' }
        : await waitWhileSettingUp(page, label);

      const body = await page.locator('body').innerText();
      entry.qaEmail = body.toLowerCase().includes((google.GOOGLE_EMAIL || '').toLowerCase());
      entry.disconnectVisible =
        (await page.locator('button').filter({ hasText: /^Disconnect$/i }).count()) > 0;
      entry.ok = !!(entry.setup?.ok && entry.disconnectVisible);
      await shot(page, `${label}-final`);
      slog(label, entry.ok ? 'OK' : 'FAIL', entry.setup?.reason);

      await lock(page);
    } catch (e) {
      entry.ok = false;
      entry.error = String(e?.message || e).slice(0, 400);
      slog(label, 'ERROR', entry.error);
      await shot(page, `${label}-error`);
    }
    report.results.push(entry);
  }
} finally {
  writeFileSync(resolve(OUT, 'connect-drive-report.json'), JSON.stringify(report, null, 2));
  await context.close().catch(() => {});
}

console.log(JSON.stringify(report, null, 2));
process.exit(report.results.some((r) => !r.ok) ? 1 : 0);
