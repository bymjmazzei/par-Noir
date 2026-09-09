#!/usr/bin/env node
/**
 * Fully unlink Google Drive from test pN(s) on the dashboard.
 * Google Drive "Disconnect" only appears after this-device connect — so we
 * briefly reconnect, click Disconnect as soon as it appears, and do NOT wait
 * for layout setup to finish.
 *
 *   node scripts/ux-dashboard-unlink-drive.mjs
 *   node scripts/ux-dashboard-unlink-drive.mjs test-pn
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

const google = (() => {
  const t = readFileSync(resolve(ROOT, '.local/test-google-drive/credentials.env'), 'utf8');
  return {
    email: t.match(/^GOOGLE_EMAIL=(.+)$/m)?.[1]?.trim(),
    password: t.match(/^GOOGLE_PASSWORD=(.+)$/m)?.[1]?.trim(),
  };
})();

function slog(...a) {
  process.stderr.write(a.join(' ') + '\n');
}

function loadPn(which) {
  const dir = resolve(ROOT, `.local/${which}`);
  const keys = readFileSync(resolve(dir, 'keys.env'), 'utf8');
  const PN_NAME = keys.match(/^PN_NAME=(.+)$/m)[1].trim();
  const PASSCODE = keys.match(/^PASSCODE=(.+)$/m)[1].trim();
  const fileName = keys.match(/^IDENTITY_FILE=(.+)$/m)?.[1]?.trim();
  let identityPath = resolve(dir, fileName || 'identity.pn');
  if (!existsSync(identityPath)) {
    identityPath = resolve(dir, which === 'test-pn-2' ? 'live-created.pn' : 'identity.pn');
  }
  return { which, identityPath, PN_NAME, PASSCODE };
}

const whichArg = process.argv[2];
const fixtures = whichArg ? [loadPn(whichArg)] : [loadPn('test-pn'), loadPn('test-pn-2')];

async function shot(page, name) {
  await page.screenshot({ path: resolve(OUT, `${name}.png`), fullPage: false }).catch(() => {});
}

async function goStorage(page) {
  await page.getByRole('button', { name: /^Storage$/i }).or(page.getByText(/^Storage$/i)).first().click();
  await page.waitForTimeout(1500);
}

async function lock(page) {
  const b = page.getByRole('button', { name: /^Lock$/i }).first();
  if (await b.isVisible().catch(() => false)) {
    await b.click();
    await page.waitForTimeout(1200);
  }
}

async function completeGoogleOauth(popup) {
  await popup.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => {});
  await popup.waitForTimeout(1000);
  const account = popup.getByText(google.email, { exact: false }).first();
  if (await account.isVisible().catch(() => false)) {
    await account.click();
    await popup.waitForTimeout(1500);
  } else {
    const email = popup.locator('input[type="email"], #identifierId').first();
    if (await email.isVisible().catch(() => false)) {
      await email.fill(google.email);
      await popup.getByRole('button', { name: /Next/i }).first().click().catch(async () => {
        await popup.locator('#identifierNext').click();
      });
      await popup.waitForTimeout(2000);
    }
    const pass = popup.locator('input[type="password"], input[name="Passwd"]').first();
    if (await pass.isVisible({ timeout: 12_000 }).catch(() => false)) {
      await pass.fill(google.password);
      await popup.getByRole('button', { name: /Next/i }).first().click().catch(async () => {
        await popup.locator('#passwordNext').click();
      });
      await popup.waitForTimeout(2500);
    }
  }
  for (let i = 0; i < 6; i++) {
    const allow = popup.getByRole('button', { name: /^(Allow|Continue|Confirm|Accept)$/i }).first();
    if (await allow.isVisible().catch(() => false)) {
      await allow.click();
      await popup.waitForTimeout(1500);
    } else break;
  }
}

async function connectGoogleBrief(page, label) {
  const btn = page.getByRole('button', { name: /Connect Google Drive|add or re-authenticate/i }).first();
  if (!(await btn.isVisible().catch(() => false))) {
    slog(label, 'no Connect Google button');
    return false;
  }
  const popupPromise = page.waitForEvent('popup', { timeout: 25_000 }).catch(() => null);
  await btn.click();
  const popup = await popupPromise;
  if (!popup) {
    slog(label, 'no OAuth popup');
    return false;
  }
  slog(label, 'OAuth…');
  await completeGoogleOauth(popup);
  await popup.waitForEvent('close', { timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(3000);
  return true;
}

/** Click red Disconnect as soon as DriveFilesListSection shows it (before setup finishes). */
async function clickDisconnectWhenReady(page, label, timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (page.isClosed()) return { ok: false, reason: 'closed' };
    const disc = page.locator('button').filter({ hasText: /^Disconnect$/i });
    const n = await disc.count();
    if (n > 0) {
      slog(label, `Disconnect visible (${n}) — clicking`);
      await disc.first().click();
      await page.waitForTimeout(2500);
      return { ok: true, reason: 'clicked' };
    }
    await page.waitForTimeout(2000);
  }
  return { ok: false, reason: 'timeout_no_disconnect' };
}

function linkedSnippet(body) {
  return body
    .split('\n')
    .filter((l) => /drive|Disconnect|Connect Google|storage provider|Social cloud|Linked|No storage/i.test(l))
    .slice(0, 16);
}

function isFullyUnlinked(body) {
  const linked =
    /Social cloud linked on this pN/i.test(body) ||
    /Linked — reconnect on this device/i.test(body) ||
    /Google Drive connected \([1-9]/i.test(body);
  const hasDisconnect = /^Disconnect$/m.test(body) || /\nDisconnect\n/.test(body);
  return !linked && !hasDisconnect;
}

const report = { generatedAt: new Date().toISOString(), mode: 'unlink', results: [] };
const context = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  viewport: { width: 1280, height: 900 },
  args: ['--disable-blink-features=AutomationControlled'],
});
const page = context.pages()[0] || (await context.newPage());

try {
  for (const fix of fixtures) {
    const label = fix.which;
    const entry = { fixture: label, error: null };
    slog('=== UNLINK', label, '===');
    try {
      await page.goto('https://pn.parnoir.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      if (await page.getByRole('button', { name: /^Lock$/i }).first().isVisible().catch(() => false)) {
        await lock(page);
        await page.goto('https://pn.parnoir.com/', { waitUntil: 'domcontentloaded' });
      }
      await unlockDashboard(page, [], fix);
      await goStorage(page);
      await shot(page, `${label}-unlink-before`);

      let body = await page.locator('body').innerText();
      entry.before = linkedSnippet(body);

      if (isFullyUnlinked(body)) {
        slog(label, 'already unlinked');
        entry.alreadyUnlinked = true;
        entry.unlinked = true;
      } else {
        // Need device connect to reveal Disconnect
        const connected = await connectGoogleBrief(page, label);
        entry.reconnected = connected;
        if (connected) {
          const disc = await clickDisconnectWhenReady(page, label);
          entry.disconnect = disc;
          // Keep clicking while Disconnect remains
          for (let i = 0; i < 5; i++) {
            const more = page.locator('button').filter({ hasText: /^Disconnect$/i });
            if ((await more.count()) === 0) break;
            await more.first().click();
            await page.waitForTimeout(2000);
          }
        }
        await page.waitForTimeout(3000);
        body = await page.locator('body').innerText();
        entry.after = linkedSnippet(body);
        entry.unlinked = isFullyUnlinked(body);
        if (!entry.unlinked) {
          // One more connect+disconnect pass
          slog(label, 'still linked — second pass');
          await connectGoogleBrief(page, label);
          await clickDisconnectWhenReady(page, label);
          await page.waitForTimeout(3000);
          body = await page.locator('body').innerText();
          entry.after2 = linkedSnippet(body);
          entry.unlinked = isFullyUnlinked(body);
        }
      }

      await shot(page, `${label}-unlink-after`);
      if (!entry.unlinked) entry.error = 'still_linked_after_disconnect';
      await lock(page);
      slog(label, 'unlinked=', entry.unlinked);
    } catch (e) {
      entry.error = String(e?.message || e).slice(0, 400);
      slog(label, 'ERROR', entry.error);
      await shot(page, `${label}-unlink-error`);
    }
    report.results.push(entry);
  }
} finally {
  writeFileSync(resolve(OUT, 'unlink-report.json'), JSON.stringify(report, null, 2));
  await context.close().catch(() => {});
}

console.log(JSON.stringify(report, null, 2));
process.exit(report.results.some((r) => r.error || !r.unlinked) ? 1 : 0);
