#!/usr/bin/env node
/**
 * Live diagnostic: unlock → Upload accounts banner → Home → Upload again.
 * Captures /storage/accounts, 429, 409. Fixture: .local/cursor-test-pn only.
 *
 *   node apps/aggregator-browser/scripts/ux-upload-accounts-diag.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, writeSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadTestPn, trackOAuth, trackApi, fillConsentAndUnlock } from './ux-unlock-lib.mjs';

function slog(...a) {
  writeSync(2, a.join(' ') + '\n');
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.REPO_ROOT || resolve(scriptDir, '../../..');
const OUT = resolve(ROOT, '.local/ux-playwright/upload-accounts-diag');
mkdirSync(OUT, { recursive: true });
const creds = loadTestPn(ROOT);

const apiBag = [];
const oauth = { challenge: false, authenticate: false, token: false, userinfo: false };
const interesting = [];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
trackOAuth(page, oauth);
trackApi(page, apiBag);

page.on('response', async (res) => {
  try {
    const u = res.url();
    if (!u.includes('api.parnoir.com')) return;
    const path = new URL(u).pathname;
    const status = res.status();
    const keep =
      status === 429 ||
      status === 409 ||
      path.includes('/storage/accounts') ||
      path.includes('storage-tier') ||
      path.includes('/drive/files') ||
      path.includes('cloud_token');
    if (!keep) return;
    let bodySnippet = '';
    try {
      bodySnippet = (await res.text()).slice(0, 240);
    } catch {
      /* ignore */
    }
    interesting.push({
      t: Date.now(),
      method: res.request().method(),
      path,
      status,
      cloudHeader: Boolean(
        res.request().headers()['x-pn-cloud-access-token'] ||
          res.request().headers()['X-PN-Cloud-Access-Token']
      ),
      bodySnippet,
    });
    slog(`[api] ${status} ${res.request().method()} ${path} cloud=${interesting[interesting.length - 1].cloudHeader}`);
  } catch {
    /* ignore */
  }
});

async function shot(id) {
  const p = resolve(OUT, `${id}.png`);
  await page.screenshot({ path: p, fullPage: false }).catch(() => {});
  slog('shot', p);
}

const report = {
  generatedAt: new Date().toISOString(),
  unlocked: false,
  noCloudFirst: null,
  noCloudAfterRoundTrip: null,
  accountPanelVisible: null,
  oauth,
  interesting: [],
  accountsCalls: [],
  counts: {},
  notes: [],
  error: null,
};

try {
  slog('goto browse…');
  await page.goto('https://browse.parnoir.com/?view=feed', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await shot('01-locked');

  // Feed brand splash / first-paint gate intercepts clicks until it clears
  slog('wait for splash to clear…');
  await page
    .locator('div.fixed.inset-0.z-\\[150\\][aria-busy]')
    .waitFor({ state: 'detached', timeout: 90_000 })
    .catch(async () => {
      // Force-hide if stuck
      await page.evaluate(() => {
        document.querySelectorAll('div.fixed.inset-0').forEach((el) => {
          const z = window.getComputedStyle(el).zIndex;
          if (Number(z) >= 150) {
            el.style.pointerEvents = 'none';
            el.style.display = 'none';
          }
        });
      });
    });
  await page.waitForTimeout(500);

  slog('unlock popup…');
  const popupPromise = page.waitForEvent('popup', { timeout: 45_000 });
  await page.getByTitle('Unlock pN').first().click({ force: true, timeout: 15_000 });
  const popup = await popupPromise;
  slog('popup url', popup.url());
  try {
    await popup.waitForURL(/oauth\/consent|authorize/, { timeout: 45_000 });
  } catch (e) {
    slog('waitForURL fail', String(e).slice(0, 120));
  }
  // Wait for real consent DOM (popup can open on about:blank / empty shell)
  try {
    await popup.locator('#identityFile').waitFor({ state: 'attached', timeout: 60_000 });
  } catch {
    await popup.waitForTimeout(2_000);
    await popup.screenshot({ path: resolve(OUT, '01b-consent-fail.png') }).catch(() => {});
    const consentHints = await popup.evaluate(() => ({
      url: location.href,
      title: document.title,
      bodyText: (document.body?.innerText || '').slice(0, 400),
      inputs: [...document.querySelectorAll('input')].map((i) => ({
        id: i.id,
        type: i.type,
        placeholder: i.placeholder,
      })),
      htmlLen: document.documentElement?.outerHTML?.length || 0,
    }));
    slog('consentHints-fail', JSON.stringify(consentHints));
    writeFileSync(resolve(OUT, 'consent-hints.json'), JSON.stringify(consentHints, null, 2));
    throw new Error('consent #identityFile never attached');
  }
  slog('popup url2', popup.url());
  await popup.screenshot({ path: resolve(OUT, '01b-consent.png') }).catch(() => {});

  await fillConsentAndUnlock(popup, { ...creds, expectClose: true });
  await page.waitForTimeout(5_000);
  report.unlocked = await page.getByTitle('Lock pN').first().isVisible().catch(() => false);
  slog(`unlocked=${report.unlocked}`);
  await shot('02-unlocked');
  if (!report.unlocked) throw new Error('unlock failed — Lock pN not visible');

  // Wait briefly for vault / prefetch
  slog('wait 8s for prefetch…');
  await page.waitForTimeout(8_000);

  slog('open Upload…');
  await page.getByRole('button', { name: 'Upload' }).click();
  await page.waitForTimeout(5_000);
  await shot('03-upload-first');
  report.noCloudFirst = await page
    .getByText('No cloud storage accounts connected')
    .isVisible()
    .catch(() => false);
  report.accountPanelVisible = await page
    .locator('text=/Drive|Add Content|Add Thought/i')
    .first()
    .isVisible()
    .catch(() => false);
  slog(`noCloudFirst=${report.noCloudFirst} accountPanel=${report.accountPanelVisible}`);

  slog('Home then Upload again…');
  // Dismiss stuck brand splash if it remounts over Home (blocks bottom nav)
  await page.evaluate(() => {
    document.querySelectorAll('div.fixed.inset-0').forEach((el) => {
      const z = Number(window.getComputedStyle(el).zIndex);
      if (z >= 150) {
        el.style.pointerEvents = 'none';
        el.style.display = 'none';
      }
    });
  });
  await page.getByRole('button', { name: 'Home' }).click({ force: true });
  await page.waitForTimeout(2_000);
  await page.evaluate(() => {
    document.querySelectorAll('div.fixed.inset-0').forEach((el) => {
      const z = Number(window.getComputedStyle(el).zIndex);
      if (z >= 150) {
        el.style.pointerEvents = 'none';
        el.style.display = 'none';
      }
    });
  });
  await page.getByRole('button', { name: 'Upload' }).click({ force: true });
  await page.waitForTimeout(5_000);
  await shot('04-upload-second');
  report.noCloudAfterRoundTrip = await page
    .getByText('No cloud storage accounts connected')
    .isVisible()
    .catch(() => false);
  slog(`noCloudAfterRoundTrip=${report.noCloudAfterRoundTrip}`);

  // Probe accounts body + any 429/409 after round trip
  const accountsAfter = interesting.filter((r) => r.path.includes('/storage/accounts'));
  slog('accountsCalls', accountsAfter.length, 'last', JSON.stringify(accountsAfter[accountsAfter.length - 1]));

  // Hard reload
  slog('hard reload…');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(3_000);
  await page.evaluate(() => {
    document.querySelectorAll('div.fixed.inset-0').forEach((el) => {
      const z = Number(window.getComputedStyle(el).zIndex);
      if (z >= 150) {
        el.style.pointerEvents = 'none';
        el.style.display = 'none';
      }
    });
  });
  const stillLocked = await page.getByTitle('Unlock pN').first().isVisible().catch(() => false);
  report.notes.push(`afterReloadStillLocked=${stillLocked}`);
  if (!stillLocked) {
    await page.getByRole('button', { name: 'Upload' }).click({ force: true });
    await page.waitForTimeout(5_000);
    await shot('05-upload-after-reload');
    const noCloudReload = await page
      .getByText('No cloud storage accounts connected')
      .isVisible()
      .catch(() => false);
    report.notes.push(`noCloudAfterReload=${noCloudReload}`);
    slog(`noCloudAfterReload=${noCloudReload}`);
  } else {
    slog('session lost after reload — need unlock again');
  }
} catch (e) {
  report.error = e instanceof Error ? e.message : String(e);
  slog('ERROR', report.error);
  await shot('99-error');
} finally {
  report.interesting = interesting;
  report.accountsCalls = interesting.filter((r) => r.path.includes('/storage/accounts'));
  report.counts = {
    totalTracked: apiBag.length,
    interesting: interesting.length,
    status429: interesting.filter((r) => r.status === 429).length,
    status409: interesting.filter((r) => r.status === 409).length,
    accounts: report.accountsCalls.length,
  };
  const outPath = resolve(OUT, 'report.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  slog('wrote', outPath);
  await browser.close();
}

if (report.error) process.exit(1);
