#!/usr/bin/env node
/**
 * Full live-apps diagnostic (Playwright Chromium only).
 * Unlock with .local/test-pn; write report to .local/ux-playwright/live-apps-report.json.
 *
 * Usage (from apps/aggregator-browser or repo root scripts/ux-live-apps-diagnostic.mjs):
 *   node scripts/ux-live-apps-diagnostic.mjs
 *   node scripts/ux-live-apps-diagnostic.mjs --only=dashboard
 */
import { chromium } from 'playwright';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.REPO_ROOT || resolve(scriptDir, '../../..');
const OUT = resolve(ROOT, '.local/ux-playwright');
mkdirSync(OUT, { recursive: true });

const identityPath = resolve(ROOT, '.local/test-pn/identity.pn');
const keysPath = resolve(ROOT, '.local/test-pn/keys.env');
if (!existsSync(identityPath) || !existsSync(keysPath)) {
  console.error('Missing .local/test-pn fixture');
  process.exit(2);
}
const keys = readFileSync(keysPath, 'utf8');
const PN_NAME = keys.match(/^PN_NAME=(.+)$/m)?.[1]?.trim();
const PASSCODE = keys.match(/^PASSCODE=(.+)$/m)?.[1]?.trim();
if (!PN_NAME || !PASSCODE) {
  console.error('keys.env must define PN_NAME and PASSCODE');
  process.exit(2);
}

const ALL_APPS = [
  {
    id: 'browse',
    url: 'https://browse.parnoir.com/?view=feed',
    unlock: 'popup',
    unlockClick: async (page) => page.getByTitle('Unlock pN').first().click(),
  },
  {
    id: 'messaging',
    url: 'https://messaging.parnoir.com/',
    unlock: 'popup',
    unlockClick: async (page) => {
      const byTitle = page.getByTitle('Unlock pN');
      if (await byTitle.first().isVisible().catch(() => false)) {
        await byTitle.first().click();
        return;
      }
      await page.getByRole('button', { name: /Unlock pN/i }).first().click();
    },
  },
  {
    id: 'dashboard',
    url: process.env.DASHBOARD_URL || 'https://pn.parnoir.com/',
    unlock: 'dashboard',
  },
  {
    id: 'prism',
    url: 'https://prism.parnoir.com/',
    unlock: 'popup',
    unlockClick: async (page) => page.getByTitle('Unlock pN').first().click(),
  },
  {
    id: 'licensing',
    url: 'https://licensing.parnoir.com/',
    unlock: 'popup',
    unlockClick: async (page) =>
      page.getByRole('button', { name: /Sign in with pN/i }).first().click(),
  },
  {
    id: 'developer',
    url: 'https://developers.parnoir.com/',
    unlock: 'redirect', // UnlockButton forceRedirect — same-window consent
    unlockClick: async (page) =>
      page.getByRole('button', { name: /Unlock pN/i }).first().click(),
  },
];

const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const onlyIds = (onlyArg?.slice('--only='.length) || process.env.UX_ONLY || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const APPS = onlyIds.length ? ALL_APPS.filter((a) => onlyIds.includes(a.id)) : ALL_APPS;
if (!APPS.length) {
  console.error(`No apps matched --only=${onlyIds.join(',')}`);
  process.exit(2);
}

function trackOAuth(page, bag) {
  page.on('request', (req) => {
    const u = req.url();
    const m = req.method();
    if (!u.includes('api.parnoir.com') && !u.includes('/oauth/')) return;
    if (u.includes('/oauth/authorize/challenge') && m === 'POST') bag.challenge = true;
    if (u.includes('/oauth/authorize/authenticate') && m === 'POST') bag.authenticate = true;
    if (u.includes('/oauth/token') && m === 'POST') bag.token = true;
    if (u.includes('/oauth/userinfo') && m === 'GET') bag.userinfo = true;
  });
}

async function fillConsentAndUnlock(popupOrPage, { expectClose = true } = {}) {
  await popupOrPage.waitForURL(/oauth\/consent|authorize/, { timeout: 45_000 });
  const fileInput = popupOrPage.locator('#identityFile, input[type="file"]').first();
  await fileInput.setInputFiles(identityPath);
  await popupOrPage.getByPlaceholder('Enter Key 1').fill(PN_NAME);
  await popupOrPage.getByPlaceholder('Enter Key 2').fill(PASSCODE);
  await popupOrPage.getByRole('button', { name: 'Unlock pN' }).click();
  const approve = popupOrPage.getByRole('button', { name: 'Approve' });
  try {
    await approve.waitFor({ state: 'visible', timeout: 90_000 });
    await approve.click();
  } catch {
    /* existing grant */
  }
  if (expectClose) {
    await popupOrPage.waitForEvent('close', { timeout: 120_000 }).catch(() => {});
  } else {
    await popupOrPage.waitForTimeout(3_000);
  }
}

async function unlockViaPopup(page, unlockClick) {
  const popupPromise = page.waitForEvent('popup', { timeout: 20_000 });
  await unlockClick(page);
  const popup = await popupPromise;
  await fillConsentAndUnlock(popup);
  await page.waitForTimeout(6_000);
}

/**
 * Drive React controlled inputs. Playwright fill/pressSequentially can leave DOM values
 * while mainForm.pnName/passcode stay empty — submit then early-returns with no loading.
 * Calls the React onChange prop directly (required for UnlockGate controlled fields).
 */
async function fillReactControlled(page, placeholder, value) {
  await page.getByPlaceholder(placeholder).first().waitFor({ state: 'visible', timeout: 30_000 });

  const result = await page.evaluate(
    ({ placeholder, value }) => {
      const el = [...document.querySelectorAll('input')].find((i) => i.placeholder === placeholder);
      if (!el) return { ok: false, reason: 'missing-el' };
      const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      proto?.set?.call(el, value);
      const reactKey = Object.keys(el).find(
        (k) => k.startsWith('__reactProps$') || k.startsWith('__reactEventHandlers$')
      );
      const props = reactKey ? el[reactKey] : null;
      if (typeof props?.onChange !== 'function') {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: el.value === value, via: 'dom-event', valueLen: el.value.length };
      }
      props.onChange({
        target: el,
        currentTarget: el,
        bubbles: true,
        preventDefault() {},
        stopPropagation() {},
        nativeEvent: new Event('input', { bubbles: true }),
      });
      return { ok: true, via: 'reactProps', valueLen: el.value.length };
    },
    { placeholder, value }
  );

  if (!result?.ok) {
    throw new Error(`Could not set React input ${placeholder}: ${JSON.stringify(result)}`);
  }
  if (result.via !== 'reactProps') {
    throw new Error(
      `React onChange missing for ${placeholder} (got ${result.via}) — controlled state will not update`
    );
  }
}

/** Upload payload — avoid filename identity.pn (prod nickname path crashed on that name). */
function identityUploadPayload() {
  return {
    name: 'test-pn.pn',
    mimeType: 'application/json',
    buffer: readFileSync(identityPath),
  };
}

/**
 * Dashboard unlock is in-page (UnlockGate → IdentityCrypto.authenticateIdentity).
 * Wait on gate exit / Lock — decrypt is seconds, not minutes.
 */
async function unlockDashboard(page, notes) {
  const pageErrors = [];
  const consoleErrors = [];
  const onPageError = (err) => pageErrors.push(String(err?.message || err));
  const onConsole = (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  };
  page.on('pageerror', onPageError);
  page.on('console', onConsole);

  try {
    await page.getByRole('button', { name: 'Unlock pN' }).waitFor({ state: 'visible', timeout: 45_000 });

    const fileInput = page.locator('#file-upload-web, #file-upload-pwa, #file-upload').first();
    await fileInput.setInputFiles(identityUploadPayload());
    await page.getByText('test-pn.pn', { exact: false }).first().waitFor({
      state: 'visible',
      timeout: 15_000,
    });

    await fillReactControlled(page, 'Enter Key 1', PN_NAME);
    await fillReactControlled(page, 'Enter Key 2', PASSCODE);
    notes.push('reactProps onChange applied for Key 1/2');

    await page.getByRole('button', { name: 'Unlock pN' }).click();

    const unlocking = page.getByRole('button', { name: 'Unlocking...' });
    const unlockedSoon = await unlocking
      .waitFor({ state: 'visible', timeout: 8_000 })
      .then(() => true)
      .catch(() => false);

    if (!unlockedSoon) {
      const errBanner = await page
        .locator('.text-red-700, [role="alert"]')
        .first()
        .innerText()
        .catch(() => '');
      const bodyErr = await page
        .locator('body')
        .innerText()
        .then((t) => {
          const m = t.match(
            /Please enter both[^\n]{0,80}|Please (select|enter|upload)[^\n]{0,120}|Failed to unlock[^\n]{0,160}/i
          );
          return m?.[0] || '';
        })
        .catch(() => '');
      notes.push(
        `Unlocking... never appeared; banner=${errBanner || 'none'}; bodyErr=${bodyErr || 'none'}`
      );
      throw new Error(
        `Dashboard unlock did not start (React state or submit). ${errBanner || bodyErr || ''}`.trim()
      );
    }
    notes.push('Unlocking... visible (submit + React state OK)');

    // Decrypt is fast; 60s is generous for post-decrypt shell paint.
    const gateGone = page.getByRole('button', { name: 'Create New pN' }).waitFor({
      state: 'hidden',
      timeout: 60_000,
    });
    const lockVisible = page.getByRole('button', { name: /^Lock$/ }).waitFor({
      state: 'visible',
      timeout: 60_000,
    });
    const successToast = page.getByText(/pN file unlocked successfully/i).waitFor({
      state: 'visible',
      timeout: 60_000,
    });

    await Promise.race([gateGone, lockVisible, successToast]);
    await page.waitForTimeout(1_000);
  } finally {
    page.off('pageerror', onPageError);
    page.off('console', onConsole);
    if (pageErrors.length) notes.push(`pageerror: ${pageErrors.slice(0, 3).join(' | ')}`);
    if (consoleErrors.length) notes.push(`console.error: ${consoleErrors.slice(0, 5).join(' | ')}`);
  }
}

async function visibleButtons(page, names) {
  const out = {};
  for (const name of names) {
    out[name] = await page.getByRole('button', { name }).first().isVisible().catch(() => false);
  }
  return out;
}

async function runApp(browser, app) {
  const result = {
    id: app.id,
    url: app.url,
    status: 'UNKNOWN',
    unlocked: false,
    blocked: null,
    oauth: { challenge: false, authenticate: false, token: false, userinfo: false },
    chrome: {},
    surfaces: [],
    screenshots: [],
    notes: [],
  };

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  trackOAuth(page, result.oauth);

  try {
    await page.goto(app.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const shotLocked = resolve(OUT, `${app.id}-01-load.png`);
    await page.screenshot({ path: shotLocked, fullPage: false });
    result.screenshots.push(shotLocked);
    result.surfaces.push({ name: 'load', observed: true, url: page.url() });

    if (app.unlock === 'dashboard') {
      try {
        await unlockDashboard(page, result.notes);
        const createVisible = await page
          .getByRole('button', { name: 'Create New pN' })
          .isVisible()
          .catch(() => false);
        const key1Visible = await page.getByPlaceholder('Enter Key 1').isVisible().catch(() => false);
        const lockVisible = await page.getByRole('button', { name: /^Lock$/ }).isVisible().catch(() => false);
        const stillGate = createVisible && key1Visible;
        result.unlocked = lockVisible || !stillGate;
        if (stillGate && !lockVisible) {
          const errText = await page
            .locator('body')
            .innerText()
            .then((t) => {
              const m = t.match(/Failed to unlock[^\n]{0,200}|Please (select|enter|upload)[^\n]{0,120}|Invalid file[^\n]{0,120}/i);
              return m?.[0] || null;
            })
            .catch(() => null);
          if (errText) result.notes.push(`gate error text: ${errText}`);
          result.notes.push('dashboard unlock gate still visible');
          result.blocked = result.blocked || 'dashboard unlock gate still visible after wait';
        } else {
          result.notes.push(lockVisible ? 'dashboard Lock visible' : 'dashboard past unlock gate');
        }
      } catch (e) {
        result.blocked = String(e?.message || e);
        result.notes.push('dashboard unlock failed');
        const errText = await page
          .locator('body')
          .innerText()
          .then((t) => {
            const m = t.match(/Failed to unlock[^\n]{0,200}|Please (select|enter|upload)[^\n]{0,120}|Invalid file[^\n]{0,120}/i);
            return m?.[0] || null;
          })
          .catch(() => null);
        if (errText) result.notes.push(`gate error text: ${errText}`);
      }
    } else if (app.unlock === 'redirect') {
      try {
        await app.unlockClick(page);
        await fillConsentAndUnlock(page, { expectClose: false });
        await page.waitForURL(/developers\.parnoir\.com/, { timeout: 120_000 }).catch(() => {});
        await page.waitForTimeout(5_000);
        result.unlocked = result.oauth.token || result.oauth.userinfo || result.oauth.authenticate;
        result.notes.push('same-window redirect unlock');
      } catch (e) {
        result.blocked = String(e?.message || e);
        result.notes.push('redirect unlock failed');
      }
    } else if (app.unlock === 'popup') {
      try {
        await unlockViaPopup(page, app.unlockClick);
        const unlockVisible = await page.getByTitle('Unlock pN').first().isVisible().catch(() => false);
        const lockVisible = await page.getByTitle('Lock pN').first().isVisible().catch(() => false);
        const signInVisible = await page
          .getByRole('button', { name: /Sign in with pN/i })
          .first()
          .isVisible()
          .catch(() => false);
        result.unlocked =
          lockVisible ||
          result.oauth.token ||
          result.oauth.userinfo ||
          (!unlockVisible && !signInVisible && (result.oauth.authenticate || result.oauth.challenge));
        if (!result.unlocked && (result.oauth.authenticate || result.oauth.token)) {
          result.unlocked = true;
          result.notes.push('unlocked inferred from oauth network');
        }
      } catch (e) {
        result.blocked = String(e?.message || e);
        result.notes.push('popup unlock failed');
      }
    }

    const shotAfter = resolve(OUT, `${app.id}-02-after-unlock.png`);
    await page.screenshot({ path: shotAfter, fullPage: false });
    result.screenshots.push(shotAfter);

    // App-specific chrome probes (read-only)
    if (app.id === 'browse') {
      result.chrome.feedRail = await visibleButtons(page, [
        'DISCOVER',
        'pN',
        'MEDIA',
        'THOUGHTS',
        'COLLECTIONS',
      ]);
      result.chrome.bottomNav = await visibleButtons(page, ['Home', 'Search', 'Upload', 'Inbox']);
      result.chrome.lockControl = (await page.getByTitle('Lock pN').isVisible().catch(() => false))
        ? 'Lock pN'
        : (await page.getByTitle('Unlock pN').isVisible().catch(() => false))
          ? 'Unlock pN'
          : 'missing';
      const col = page.getByRole('button', { name: 'COLLECTIONS' });
      if (await col.isVisible().catch(() => false)) {
        await col.click();
        await page.waitForTimeout(1000);
        result.surfaces.push({ name: 'collections', observed: true, url: page.url() });
      }
      const upload = page.getByRole('button', { name: 'Upload' });
      if (await upload.isVisible().catch(() => false)) {
        await upload.click();
        await page.waitForTimeout(1500);
        result.chrome.uploadEmojiVisible = await page.locator('text=😀').first().isVisible().catch(() => false);
        await page.screenshot({ path: resolve(OUT, `${app.id}-03-upload.png`), fullPage: false });
        await page.keyboard.press('Escape').catch(() => {});
      }
    }

    if (app.id === 'messaging') {
      result.chrome.tabs = await visibleButtons(page, ['Messages', 'Notifications', 'Requests']);
      result.chrome.lockControl = (await page.getByTitle('Lock pN').isVisible().catch(() => false))
        ? 'Lock pN'
        : 'Unlock or other';
    }

    if (app.id === 'dashboard' && result.unlocked) {
      const body = await page.locator('body').innerText().catch(() => '');
      result.chrome.hasVerificationCue = /verif|Veriff|Identity Verification/i.test(body);
      result.chrome.hasMonetizationCue = /Monetiz|Stripe|Creator Fund/i.test(body);
      // Try open common shell affordances without submitting
      for (const label of ['Storage', 'Verify', 'Verification', 'Monetization', 'Settings', 'Privacy']) {
        const btn = page.getByRole('button', { name: new RegExp(label, 'i') }).first();
        if (await btn.isVisible().catch(() => false)) {
          result.surfaces.push({ name: `btn:${label}`, observed: true });
        }
        const link = page.getByRole('link', { name: new RegExp(label, 'i') }).first();
        if (await link.isVisible().catch(() => false)) {
          result.surfaces.push({ name: `link:${label}`, observed: true });
        }
      }
    }

    if (app.id === 'prism') {
      const body = await page.locator('body').innerText().catch(() => '');
      result.chrome.hasPrism = /Prism|Auditor|Ray/i.test(body);
      result.chrome.applyVisible = await page.getByRole('button', { name: /Apply/i }).first().isVisible().catch(() => false);
    }

    if (app.id === 'licensing') {
      result.chrome.signInVisible = await page
        .getByRole('button', { name: /Sign in with pN/i })
        .first()
        .isVisible()
        .catch(() => false);
      const body = await page.locator('body').innerText().catch(() => '');
      result.chrome.landingCopy = /License your music|Earn from usage/i.test(body);
    }

    if (app.id === 'developer') {
      result.chrome.nav = {};
      for (const name of [
        'Home',
        'Credentials',
        'Data points',
        'Guides',
        'Layer 5',
        'API reference',
        'Proposals',
      ]) {
        result.chrome.nav[name] = await page.getByRole('link', { name }).first().isVisible().catch(() => false);
      }
    }

    result.status = result.blocked ? 'BLOCKED' : result.unlocked ? 'UNLOCKED' : 'LOADED';
  } catch (e) {
    result.status = 'BLOCKED';
    result.blocked = String(e?.message || e);
  } finally {
    await context.close().catch(() => {});
  }

  return result;
}

const browser = await chromium.launch({ headless: true });
const report = {
  generatedAt: new Date().toISOString(),
  tool: 'playwright-chromium',
  apps: [],
};

for (const app of APPS) {
  console.error(`RUN ${app.id}...`);
  const r = await runApp(browser, app);
  report.apps.push(r);
  console.error(`  status=${r.status} unlocked=${r.unlocked} blocked=${r.blocked || 'none'}`);
}

await browser.close();

const outPath = resolve(OUT, 'live-apps-report.json');
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ outPath, summary: report.apps.map((a) => ({ id: a.id, status: a.status, unlocked: a.unlocked, oauth: a.oauth })) }, null, 2));
