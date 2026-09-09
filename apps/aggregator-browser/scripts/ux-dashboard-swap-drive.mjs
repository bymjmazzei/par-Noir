#!/usr/bin/env node
/**
 * Dashboard: disconnect prior Drive, connect .local/test-google-drive account
 * for one or both test pNs. Secrets stay under .local/ — never logged.
 *
 *   node scripts/ux-dashboard-swap-drive.mjs            # both
 *   node scripts/ux-dashboard-swap-drive.mjs test-pn-2  # one
 *
 * Uses a persistent Chromium profile so Google login can stick across pNs.
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
mkdirSync(PROFILE, { recursive: true });

function slog(...a) {
  process.stderr.write(a.join(' ') + '\n');
}

function loadEnvFile(path) {
  if (!existsSync(path)) throw new Error(`Missing ${path}`);
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
    const alt = resolve(dir, which === 'test-pn-2' ? 'live-created.pn' : 'identity.pn');
    if (!existsSync(alt)) throw new Error(`No identity file in ${dir}`);
    identityPath = alt;
  }
  if (!keys.PN_NAME || !keys.PASSCODE) throw new Error(`${which} keys.env incomplete`);
  return { which, identityPath, PN_NAME: keys.PN_NAME, PASSCODE: keys.PASSCODE };
}

const google = loadEnvFile(resolve(ROOT, '.local/test-google-drive/credentials.env'));
if (!google.GOOGLE_EMAIL || !google.GOOGLE_PASSWORD) {
  throw new Error('Missing GOOGLE_EMAIL/GOOGLE_PASSWORD in .local/test-google-drive/credentials.env');
}

const whichArg = process.argv[2];
const fixtures = whichArg
  ? [loadPnFixture(whichArg)]
  : [loadPnFixture('test-pn'), loadPnFixture('test-pn-2')];

async function shot(page, name) {
  const p = resolve(OUT, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false }).catch(() => {});
  return p;
}

async function goStorage(page) {
  const storageTab = page.getByRole('button', { name: /^Storage$/i }).or(page.getByText(/^Storage$/i)).first();
  if (await storageTab.isVisible().catch(() => false)) {
    await storageTab.click();
    await page.waitForTimeout(1500);
    return true;
  }
  // Fallback: nav link / tab text
  const any = page.locator('button, a, [role="tab"]').filter({ hasText: /^Storage$/i }).first();
  if (await any.isVisible().catch(() => false)) {
    await any.click();
    await page.waitForTimeout(1500);
    return true;
  }
  return false;
}

async function disconnectAllGoogle(page, label) {
  let rounds = 0;
  while (rounds < 8) {
    // Prefer explicit Disconnect on Google Drive rows; also MultiCloud "Disconnect"
    const disconnect = page.getByRole('button', { name: /^Disconnect$/i });
    const count = await disconnect.count();
    if (count === 0) {
      // Sometimes only "Remove" / trash
      const remove = page.getByRole('button', { name: /^Remove$/i });
      if ((await remove.count()) === 0) break;
      await remove.first().click();
    } else {
      slog(label, `Disconnect click #${rounds + 1} (of ${count})`);
      await disconnect.first().click();
    }
    const confirm = page.getByRole('button', { name: /Confirm|Yes|Disconnect|Remove|OK/i }).last();
    if (await confirm.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirm.click().catch(() => {});
    }
    await page.waitForTimeout(2500);
    rounds++;
  }
  await shot(page, `${label}-after-disconnect`);
  return rounds;
}

/** After connect, drop any Drive that is not the QA Gmail. */
async function pruneNonQaGoogle(page, label) {
  let pruned = 0;
  for (let i = 0; i < 6; i++) {
    const body = await page.locator('body').innerText().catch(() => '');
    // If only QA email (or no second account), stop
    const hasQa = body.toLowerCase().includes(google.GOOGLE_EMAIL.toLowerCase());
    const disconnects = page.getByRole('button', { name: /^Disconnect$/i });
    const n = await disconnects.count();
    if (n <= 1 && hasQa) break;
    if (n === 0) break;

    // Prefer disconnecting a row that does not mention QA email
    let clicked = false;
    for (let j = 0; j < n; j++) {
      const btn = disconnects.nth(j);
      const row = btn.locator('xpath=ancestor::*[self::li or self::div][1]');
      const rowText = ((await row.innerText().catch(() => '')) || '').toLowerCase();
      if (rowText.includes(google.GOOGLE_EMAIL.toLowerCase())) continue;
      slog(label, `Prune non-QA Drive row #${j}`);
      await btn.click();
      const confirm = page.getByRole('button', { name: /Confirm|Yes|Disconnect|Remove|OK/i }).last();
      if (await confirm.isVisible({ timeout: 2000 }).catch(() => false)) await confirm.click().catch(() => {});
      await page.waitForTimeout(2500);
      pruned++;
      clicked = true;
      break;
    }
    if (!clicked) {
      // Can't tell rows apart — disconnect first remaining if >1
      if (n > 1) {
        await disconnects.first().click();
        await page.waitForTimeout(2500);
        pruned++;
      } else break;
    }
  }
  await shot(page, `${label}-after-prune`);
  return pruned;
}

/**
 * Complete Google account chooser / login / consent in a popup or same page.
 * Does not log email/password.
 */
async function completeGoogleOauth(popupOrPage) {
  const page = popupOrPage;
  await page.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // Already signed in — account chooser
  const account = page.getByText(google.GOOGLE_EMAIL, { exact: false }).first();
  if (await account.isVisible().catch(() => false)) {
    slog('Google: pick existing account');
    await account.click();
    await page.waitForTimeout(2000);
  } else {
    // Email step
    const email = page.locator('input[type="email"], #identifierId').first();
    if (await email.isVisible().catch(() => false)) {
      slog('Google: email step');
      await email.fill(google.GOOGLE_EMAIL);
      await page.getByRole('button', { name: /Next/i }).first().click().catch(async () => {
        await page.locator('#identifierNext').click();
      });
      await page.waitForTimeout(2500);
    }

    // Password step
    const pass = page.locator('input[type="password"], input[name="Passwd"]').first();
    if (await pass.isVisible({ timeout: 15_000 }).catch(() => false)) {
      slog('Google: password step');
      await pass.fill(google.GOOGLE_PASSWORD);
      await page.getByRole('button', { name: /Next/i }).first().click().catch(async () => {
        await page.locator('#passwordNext').click();
      });
      await page.waitForTimeout(3000);
    }
  }

  // "This browser may not be secure" / try another way — stop and report
  const blocked = await page.getByText(/may not be secure|couldn't sign you in|Verify it'?s you/i).first().isVisible().catch(() => false);
  if (blocked) {
    await shot(page, 'google-blocked');
    throw new Error('Google blocked automated sign-in (secure browser / verify)');
  }

  // OAuth consent — Allow / Continue
  for (let i = 0; i < 6; i++) {
    const allow = page.getByRole('button', { name: /^(Allow|Continue|Confirm|Accept)$/i }).first();
    if (await allow.isVisible().catch(() => false)) {
      slog('Google: consent', await allow.textContent().catch(() => ''));
      await allow.click();
      await page.waitForTimeout(2000);
    } else {
      break;
    }
  }

  // Advanced → Go to app (unverified app)
  const advanced = page.getByRole('button', { name: /Advanced/i }).or(page.getByText(/Advanced/i)).first();
  if (await advanced.isVisible().catch(() => false)) {
    await advanced.click();
    await page.waitForTimeout(500);
    const go = page.getByText(/Go to|Continue to/i).first();
    if (await go.isVisible().catch(() => false)) await go.click();
    await page.waitForTimeout(2000);
  }
}

async function connectGoogleDrive(page, label) {
  // Ensure Google Drive provider selected if multi-cloud tabs exist
  const gdTab = page.getByRole('button', { name: /Google Drive/i }).first();
  if (await gdTab.isVisible().catch(() => false)) {
    await gdTab.click().catch(() => {});
    await page.waitForTimeout(500);
  }

  const connectBtn = page
    .getByRole('button', { name: /Connect Google Drive|add or re-authenticate|Google Drive connected/i })
    .first();
  if (!(await connectBtn.isVisible().catch(() => false))) {
    await shot(page, `${label}-no-connect-btn`);
    throw new Error('Connect Google Drive button not found');
  }

  const popupPromise = page.waitForEvent('popup', { timeout: 25_000 }).catch(() => null);
  await connectBtn.click();
  let popup = await popupPromise;

  // Sometimes OAuth is same-window redirect
  if (!popup) {
    slog(label, 'No popup — waiting for Google URL on main page');
    await page.waitForURL(/accounts\.google\.com|google\.com\/o\/oauth/, { timeout: 20_000 }).catch(() => {});
    popup = page;
  }

  slog(label, 'Completing Google OAuth…');
  await completeGoogleOauth(popup);

  // Wait for popup close or return to dashboard
  if (popup !== page) {
    await popup.waitForEvent('close', { timeout: 90_000 }).catch(() => {});
  }
  await page.waitForTimeout(5000);
  await shot(page, `${label}-after-connect`);

  // Success signals
  const body = await page.locator('body').innerText().catch(() => '');
  const ok =
    /Google Drive connected|parnoirbrowser|Drive setup|root|connected \(/i.test(body) ||
    (await page.getByRole('button', { name: /Disconnect/i }).count()) > 0;
  return { ok, snippet: body.split('\n').filter((l) => /drive|google|connected|disconnect|error/i.test(l)).slice(0, 15) };
}

async function waitForStorageSetup(page, label, { timeoutMs = 15 * 60_000 } = {}) {
  const started = Date.now();
  let lastPct = -1;
  let sawSetupUi = false;
  slog(label, 'Waiting for Drive layout to finish — do not close the Chromium window…');

  // First: wait until setup UI appears OR Disconnect is already present (already populated)
  while (Date.now() - started < 90_000) {
    if (page.isClosed()) {
      return { ok: false, reason: 'browser_closed', elapsedMs: Date.now() - started };
    }
    const body = await page.locator('body').innerText().catch(() => '');
    if (/Setting up your storage/i.test(body)) {
      sawSetupUi = true;
      slog(label, 'setup UI appeared');
      break;
    }
    if (
      (await page.locator('button').filter({ hasText: /^Disconnect$/i }).count()) > 0 &&
      /parnoirbrowser@gmail\.com/i.test(body) &&
      !/Preparing your par Noir storage/i.test(body)
    ) {
      await shot(page, `${label}-setup-done`);
      slog(label, 'Already populated (Disconnect + QA email, no setup banner)');
      return { ok: true, reason: 'already_populated', elapsedMs: Date.now() - started };
    }
    await page.waitForTimeout(2000);
  }

  while (Date.now() - started < timeoutMs) {
    if (page.isClosed()) {
      return { ok: false, reason: 'browser_closed', elapsedMs: Date.now() - started };
    }
    let body = '';
    try {
      body = await page.locator('body').innerText();
    } catch (e) {
      return { ok: false, reason: 'browser_closed', elapsedMs: Date.now() - started, detail: String(e.message || e).slice(0, 120) };
    }
    const settingUp = /Setting up your storage|Preparing your par Noir storage/i.test(body);
    if (settingUp) sawSetupUi = true;
    const failed = /Drive setup failed|setup failed/i.test(body);
    const pctMatch = body.match(/(\d+)\s*%/);
    const pct = pctMatch ? Number(pctMatch[1]) : null;
    if (pct != null && pct !== lastPct) {
      slog(label, `setup ${pct}%`);
      lastPct = pct;
      await shot(page, `${label}-setup-${pct}`);
    }
    if (failed) {
      await shot(page, `${label}-setup-failed`);
      return { ok: false, reason: 'setup_failed', elapsedMs: Date.now() - started };
    }
    if (sawSetupUi && !settingUp) {
      await page.waitForTimeout(3000);
      const body2 = await page.locator('body').innerText().catch(() => '');
      if (!/Setting up your storage|Preparing your par Noir storage/i.test(body2)) {
        await shot(page, `${label}-setup-done`);
        slog(label, 'Setup finished after', Math.round((Date.now() - started) / 1000), 's');
        return {
          ok: true,
          reason: 'setup_ui_cleared',
          elapsedMs: Date.now() - started,
          snippet: body2
            .split('\n')
            .filter((l) => /drive|google|file|folder|empty|connected|par Noir|Disconnect/i.test(l))
            .slice(0, 20),
        };
      }
    }
    await page.waitForTimeout(5000);
  }
  await shot(page, `${label}-setup-timeout`);
  return { ok: false, reason: sawSetupUi ? 'timeout' : 'setup_never_appeared', elapsedMs: Date.now() - started };
}

async function lockDashboard(page) {
  const lock = page.getByRole('button', { name: /^Lock$/i }).first();
  if (await lock.isVisible().catch(() => false)) {
    await lock.click();
    await page.waitForTimeout(1500);
  }
}

const report = { generatedAt: new Date().toISOString(), results: [] };
const KEEP_OPEN = process.env.KEEP_OPEN === '1';

const context = await chromium.launchPersistentContext(PROFILE, {
  headless: false, // Google often blocks headless
  viewport: { width: 1280, height: 900 },
  args: ['--disable-blink-features=AutomationControlled'],
});
const page = context.pages()[0] || (await context.newPage());

try {
  for (const fix of fixtures) {
    const label = fix.which;
    const entry = { fixture: label, unlocked: false, disconnected: 0, connected: false, notes: [], error: null };
    slog('===', label, '===');
    try {
      await page.goto('https://pn.parnoir.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      // If already unlocked from prior pN, lock first
      if (await page.getByRole('button', { name: /^Lock$/i }).first().isVisible().catch(() => false)) {
        await lockDashboard(page);
        await page.goto('https://pn.parnoir.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      }

      const notes = [];
      await unlockDashboard(page, notes, fix);
      entry.unlocked = true;
      entry.notes.push(...notes);
      await shot(page, `${label}-unlocked`);

      const storageOk = await goStorage(page);
      if (!storageOk) throw new Error('Storage tab not found');
      await shot(page, `${label}-storage`);

      entry.disconnected = await disconnectAllGoogle(page, label);
      const stillConnected =
        (await page.getByRole('button', { name: /^Disconnect$/i }).count()) > 0 ||
        /Google Drive connected \(\d+\)/i.test(await page.locator('body').innerText().catch(() => ''));
      if (stillConnected) {
        entry.notes.push('pre-connect still had Drive — disconnect retry');
        entry.disconnected += await disconnectAllGoogle(page, `${label}-retry`);
      }

      // Brief pause so operator can finish deleting Drive folders if needed
      if (process.env.PRE_CONNECT_WAIT_MS) {
        const w = Number(process.env.PRE_CONNECT_WAIT_MS) || 0;
        if (w > 0) {
          slog(label, `Waiting ${w}ms before connect (PRE_CONNECT_WAIT_MS)…`);
          await page.waitForTimeout(w);
        }
      }

      const connectResult = await connectGoogleDrive(page, label);
      entry.connected = connectResult.ok;
      entry.notes.push(...(connectResult.snippet || []));
      entry.pruned = await pruneNonQaGoogle(page, label);
      if (!connectResult.ok) entry.error = 'Connect did not show success UI';

      const setup = await waitForStorageSetup(page, label);
      entry.setup = setup;
      if (!setup.ok) {
        entry.error = entry.error || `layout_setup_${setup.reason}`;
      } else if (setup.snippet) {
        entry.notes.push(...setup.snippet);
      }

      const finalBody = await page.locator('body').innerText().catch(() => '');
      entry.qaEmailVisible = finalBody.toLowerCase().includes(google.GOOGLE_EMAIL.toLowerCase());
      entry.disconnectCount = await page.getByRole('button', { name: /^Disconnect$/i }).count();
      await shot(page, `${label}-final`);

      // Only lock after setup finished (or timed out) so init isn't killed mid-flight
      await lockDashboard(page);
    } catch (e) {
      entry.error = String(e?.message || e).slice(0, 500);
      slog(label, 'ERROR', entry.error);
      await shot(page, `${label}-error`);
    }
    report.results.push(entry);
  }
} finally {
  writeFileSync(resolve(OUT, 'drive-swap-report.json'), JSON.stringify(report, null, 2));
  if (KEEP_OPEN) {
    slog('KEEP_OPEN=1 — leaving browser open 2 minutes for inspection…');
    await page.waitForTimeout(120_000);
  }
  await context.close().catch(() => {});
}

const failed = report.results.some((r) => r.error || !r.connected || (r.setup && !r.setup.ok));
console.log(JSON.stringify(report, null, 2));
if (failed) {
  process.stderr.write('DRIVE_SWAP_FAILED\n');
  process.exit(1);
}
process.exit(0);
