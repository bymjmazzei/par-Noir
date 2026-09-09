#!/usr/bin/env node
/**
 * Disconnect Google Drive only (no reconnect) for test pN fixtures.
 *   node scripts/ux-dashboard-disconnect-drive.mjs
 *   node scripts/ux-dashboard-disconnect-drive.mjs test-pn-2
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

function loadEnvFile(path) {
  const text = readFileSync(path, 'utf8');
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function loadPnFixture(which) {
  const dir = resolve(ROOT, `.local/${which}`);
  const keys = loadEnvFile(resolve(dir, 'keys.env'));
  const fileName = keys.IDENTITY_FILE || (which === 'test-pn-2' ? 'pn374951080.pn' : 'identity.pn');
  let identityPath = resolve(dir, fileName);
  if (!existsSync(identityPath)) {
    identityPath = resolve(dir, which === 'test-pn-2' ? 'live-created.pn' : 'identity.pn');
  }
  return { which, identityPath, PN_NAME: keys.PN_NAME, PASSCODE: keys.PASSCODE };
}

const whichArg = process.argv[2];
const fixtures = whichArg
  ? [loadPnFixture(whichArg)]
  : [loadPnFixture('test-pn'), loadPnFixture('test-pn-2')];

async function shot(page, name) {
  await page.screenshot({ path: resolve(OUT, `${name}.png`), fullPage: false }).catch(() => {});
}

async function goStorage(page) {
  const storageTab = page.getByRole('button', { name: /^Storage$/i }).or(page.getByText(/^Storage$/i)).first();
  if (await storageTab.isVisible().catch(() => false)) {
    await storageTab.click();
    await page.waitForTimeout(1500);
    return true;
  }
  const any = page.locator('button, a, [role="tab"]').filter({ hasText: /^Storage$/i }).first();
  if (await any.isVisible().catch(() => false)) {
    await any.click();
    await page.waitForTimeout(1500);
    return true;
  }
  return false;
}

async function disconnectAll(page, label) {
  let rounds = 0;
  while (rounds < 10) {
    const disconnect = page.getByRole('button', { name: /^Disconnect$/i });
    const n = await disconnect.count();
    if (n === 0) break;
    slog(label, `Disconnect #${rounds + 1} (of ${n})`);
    await disconnect.first().click();
    const confirm = page.getByRole('button', { name: /Confirm|Yes|Disconnect|Remove|OK/i }).last();
    if (await confirm.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirm.click().catch(() => {});
    }
    await page.waitForTimeout(2500);
    rounds++;
  }
  return rounds;
}

async function lockDashboard(page) {
  const lock = page.getByRole('button', { name: /^Lock$/i }).first();
  if (await lock.isVisible().catch(() => false)) {
    await lock.click();
    await page.waitForTimeout(1500);
  }
}

const report = { generatedAt: new Date().toISOString(), mode: 'disconnect-only', results: [] };
const context = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  viewport: { width: 1280, height: 900 },
  args: ['--disable-blink-features=AutomationControlled'],
});
const page = context.pages()[0] || (await context.newPage());

try {
  for (const fix of fixtures) {
    const label = fix.which;
    const entry = { fixture: label, unlocked: false, disconnected: 0, stillConnected: null, error: null };
    slog('=== DISCONNECT', label, '===');
    try {
      await page.goto('https://pn.parnoir.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      if (await page.getByRole('button', { name: /^Lock$/i }).first().isVisible().catch(() => false)) {
        await lockDashboard(page);
        await page.goto('https://pn.parnoir.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      }
      const notes = [];
      await unlockDashboard(page, notes, fix);
      entry.unlocked = true;
      if (!(await goStorage(page))) throw new Error('Storage tab not found');
      await shot(page, `${label}-before-disconnect`);
      entry.disconnected = await disconnectAll(page, label);
      // Second pass if UI still shows connected
      const body = await page.locator('body').innerText().catch(() => '');
      if (/Google Drive connected \(\d+\)|Disconnect/i.test(body)) {
        entry.disconnected += await disconnectAll(page, `${label}-pass2`);
      }
      await page.waitForTimeout(2000);
      const finalBody = await page.locator('body').innerText().catch(() => '');
      entry.stillConnected =
        /Google Drive connected \([1-9]/i.test(finalBody) ||
        (await page.getByRole('button', { name: /^Disconnect$/i }).count()) > 0;
      entry.snippet = finalBody
        .split('\n')
        .filter((l) => /drive|google|connect|disconnect|storage provider/i.test(l))
        .slice(0, 12);
      await shot(page, `${label}-after-disconnect-only`);
      await lockDashboard(page);
      slog(label, 'done disconnected=', entry.disconnected, 'stillConnected=', entry.stillConnected);
    } catch (e) {
      entry.error = String(e?.message || e).slice(0, 400);
      slog(label, 'ERROR', entry.error);
      await shot(page, `${label}-disconnect-error`);
    }
    report.results.push(entry);
  }
} finally {
  writeFileSync(resolve(OUT, 'disconnect-only-report.json'), JSON.stringify(report, null, 2));
  await context.close().catch(() => {});
}

console.log(JSON.stringify(report, null, 2));
const bad = report.results.some((r) => r.error || r.stillConnected);
process.exit(bad ? 1 : 0);
