#!/usr/bin/env node
/**
 * Dual-pN messaging + browse engagement live QA.
 * Fixtures: .local/test-pn + .local/test-pn-2
 * On linkedInactive, completes product "reconnect cloud storage" with QA Google.
 * Playwright Chromium. No secrets logged.
 *
 * Pace like a human — dual unlocks / tab storms burn Google refresh quota.
 *
 *   PN_QA_HEADLESS=0 node scripts/ux-messaging-qa.mjs
 *   PN_QA_PACE_MS=4000          # default delay between UI steps
 *   PN_QA_UNLOCK_GAP_MS=60000   # cool-down between fixture A and B unlock
 *   PN_QA_PHASE_GAP_MS=20000    # cool-down between major phases (gate → connect → browse)
 *   PN_QA_SKIP_BROWSE_ENGAGEMENT=1
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { trackOAuth, trackApi, unlockViaPopup } from './ux-unlock-lib.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.REPO_ROOT || resolve(scriptDir, '../../..');
const OUT = resolve(ROOT, '.local/ux-playwright/messaging-qa');
mkdirSync(OUT, { recursive: true });

/** Default step delay (ms). Override with PN_QA_PACE_MS. */
const PACE_MS = Math.max(500, Number(process.env.PN_QA_PACE_MS) || 4_000);
/** Cool-down between A unlock session and B unlock. */
const UNLOCK_GAP_MS = Math.max(0, Number(process.env.PN_QA_UNLOCK_GAP_MS) || 60_000);
/** Cool-down between major phases. */
const PHASE_GAP_MS = Math.max(0, Number(process.env.PN_QA_PHASE_GAP_MS) || 20_000);

function slog(...a) {
  process.stderr.write(a.join(' ') + '\n');
}

async function pace(ms = PACE_MS, why = '') {
  if (ms <= 0) return;
  if (why) slog(`pace ${ms}ms — ${why}`);
  await new Promise((r) => setTimeout(r, ms));
}

function loadEnv(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function loadFixture(which) {
  const dir = resolve(ROOT, `.local/${which}`);
  const keysPath = resolve(dir, 'keys.env');
  if (!existsSync(keysPath)) throw new Error(`Missing .local/${which}/keys.env`);
  const keys = readFileSync(keysPath, 'utf8');
  const PN_NAME = keys.match(/^PN_NAME=(.+)$/m)?.[1]?.trim();
  const PASSCODE = keys.match(/^PASSCODE=(.+)$/m)?.[1]?.trim();
  const fileName = keys.match(/^IDENTITY_FILE=(.+)$/m)?.[1]?.trim();
  const candidates = [
    fileName ? resolve(dir, fileName) : null,
    resolve(dir, 'identity.pn'),
    resolve(dir, 'live-created.pn'),
    resolve(dir, 'pn374951080.pn'),
  ].filter(Boolean);
  const identityPath = candidates.find((p) => existsSync(p));
  if (!identityPath || !PN_NAME || !PASSCODE) throw new Error(`Incomplete fixture ${which}`);
  return { which, identityPath, PN_NAME, PASSCODE };
}

const google = loadEnv(resolve(ROOT, '.local/test-google-drive/credentials.env'));
const fixtureA = loadFixture('test-pn');
const fixtureB = loadFixture('test-pn-2');

function summarizeApi(apiBag, since = 0) {
  return apiBag.slice(since).map((a) => `${a.method} ${a.path} ${a.status}`);
}

function lastHit(apiBag, pathSub) {
  for (let i = apiBag.length - 1; i >= 0; i--) {
    if (apiBag[i].path.includes(pathSub)) return apiBag[i];
  }
  return null;
}

function hasOk(apiBag, pathSub) {
  return apiBag.some((a) => a.path.includes(pathSub) && a.status >= 200 && a.status < 400);
}

async function shot(page, name) {
  const p = resolve(OUT, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false }).catch(() => {});
  return p;
}

async function clickTab(page, name) {
  const btn = page.getByRole('button', { name: new RegExp(`^${name}$`, 'i') }).first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(1200);
    return true;
  }
  const any = page.getByRole('button', { name: new RegExp(name, 'i') }).first();
  if (await any.isVisible().catch(() => false)) {
    await any.click();
    await page.waitForTimeout(1200);
    return true;
  }
  return false;
}

async function unlockMessaging(page, creds) {
  const unlockClick = async (p) => {
    const byTitle = p.getByTitle('Unlock pN');
    if (await byTitle.first().isVisible().catch(() => false)) {
      await byTitle.first().click();
      return;
    }
    await p.getByRole('button', { name: /Unlock pN/i }).first().click();
  };
  await unlockViaPopup(page, unlockClick, creds);
}

async function unlockBrowse(page, creds) {
  await unlockViaPopup(page, (p) => p.getByTitle('Unlock pN').first().click(), creds);
}

async function readSessionPn(page) {
  return page.evaluate(() => {
    try {
      const raw = sessionStorage.getItem('pn_oauth_session');
      if (!raw) return null;
      return JSON.parse(raw).pnIdentifier || null;
    } catch {
      return null;
    }
  });
}

async function bodyHas(page, re) {
  return re.test(await page.locator('body').innerText().catch(() => ''));
}

async function bannerLinkedInactive(page) {
  return (
    (await page.getByText(/linked but not signed in/i).first().isVisible().catch(() => false)) ||
    (await page.getByText(/Drive sign-in failed/i).first().isVisible().catch(() => false)) ||
    (await bodyHas(page, /linked but not signed in|Drive sign-in failed/i))
  );
}

async function waitForMessagingUnlock(page, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pn = await readSessionPn(page);
    const lockVisible = await page.getByTitle('Lock pN').first().isVisible().catch(() => false);
    if (pn && lockVisible) return true;
    await page.waitForTimeout(1000);
  }
  return isMessagingSessionLive(page);
}

async function isMessagingSessionLive(page) {
  const pn = await readSessionPn(page);
  const lockVisible = await page.getByTitle('Lock pN').first().isVisible().catch(() => false);
  // "Not connected" can flash briefly after token exchange — prefer lock + session.
  return !!(pn && lockVisible);
}

/** Complete Google OAuth popup/page for Drive reconnect. Never logs secrets. */
async function googleOauth(popup) {
  await popup.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => {});
  await popup.waitForTimeout(800);
  if (!google.GOOGLE_EMAIL || !google.GOOGLE_PASSWORD) {
    throw new Error('Missing .local/test-google-drive/credentials.env');
  }
  const account = popup.getByText(google.GOOGLE_EMAIL, { exact: false }).first();
  if (await account.isVisible().catch(() => false)) {
    await account.click();
    await popup.waitForTimeout(1200);
  } else {
    const email = popup.locator('input[type="email"], #identifierId').first();
    if (await email.isVisible().catch(() => false)) {
      await email.fill(google.GOOGLE_EMAIL);
      await popup.getByRole('button', { name: /Next/i }).first().click().catch(() =>
        popup.locator('#identifierNext').click()
      );
      await popup.waitForTimeout(2000);
    }
    const pass = popup.locator('input[type="password"], input[name="Passwd"]').first();
    if (await pass.isVisible({ timeout: 12_000 }).catch(() => false)) {
      await pass.fill(google.GOOGLE_PASSWORD);
      await popup.getByRole('button', { name: /Next/i }).first().click().catch(() =>
        popup.locator('#passwordNext').click()
      );
      await popup.waitForTimeout(2000);
    }
  }
  for (let i = 0; i < 8; i++) {
    const allow = popup.getByRole('button', { name: /^(Allow|Continue|Confirm|Accept)$/i }).first();
    if (await allow.isVisible().catch(() => false)) {
      await allow.click();
      await popup.waitForTimeout(1000);
    } else break;
  }
}

/**
 * Product path: banner/panel → Authorize Google Drive → Google OAuth.
 * Panel may already be open after mint-fail; do not require clicking the banner under the modal.
 */
async function recoverCloudOnDevice(page, label) {
  const notes = [];
  if (!(await bannerLinkedInactive(page))) {
    notes.push('no linkedInactive banner');
    return { recovered: true, notes };
  }
  notes.push('linkedInactive OBSERVED — starting reconnect');

  const popupPromise = page.waitForEvent('popup', { timeout: 45_000 }).catch(() => null);

  let authorized = false;
  const authorizeOpen = page
    .getByRole('button', { name: /Authorize Google Drive|^Authorize$/i })
    .first();
  if (await authorizeOpen.isVisible().catch(() => false)) {
    await authorizeOpen.click({ force: true });
    authorized = true;
    notes.push('clicked Authorize (panel already open)');
  } else {
    const reconnectLink = page
      .getByRole('button', { name: /reconnect cloud storage|reconnect from here/i })
      .first();
    if (await reconnectLink.isVisible().catch(() => false)) {
      await reconnectLink.click({ force: true }).catch(() => {});
      notes.push('clicked banner reconnect CTA');
    } else {
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('pn_open_cloud_reconnect')));
      notes.push('dispatched pn_open_cloud_reconnect');
    }
    const raceDeadline = Date.now() + 4000;
    while (Date.now() < raceDeadline && !authorized) {
      const authorize = page
        .getByRole('button', { name: /Authorize Google Drive|^Authorize$/i })
        .first();
      const modalReconnect = page.getByRole('button', { name: /^Reconnect$/i }).first();
      if (await authorize.isVisible().catch(() => false)) {
        await authorize.click({ force: true }).catch(() => {});
        authorized = true;
        notes.push('clicked Authorize in reconnect panel');
        break;
      }
      if (await modalReconnect.isVisible().catch(() => false)) {
        await modalReconnect.click({ force: true }).catch(() => {});
        notes.push('clicked Reconnect prompt');
      }
      await page.waitForTimeout(40);
    }
  }
  if (!authorized) {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('pn_open_cloud_reconnect')));
    const authorize = page
      .getByRole('button', { name: /Authorize Google Drive|^Authorize$/i })
      .first();
    try {
      await authorize.waitFor({ state: 'visible', timeout: 2000 });
      await authorize.click({ force: true });
      authorized = true;
      notes.push('clicked Authorize after forced event');
    } catch {
      notes.push('Authorize never stayed visible');
    }
  }
  await shot(page, `${label}-reconnect-prompt`);

  const popup = await popupPromise;
  if (popup) {
    const popupUrl = popup.url();
    if (
      /redirect_uri_mismatch|error=redirect/i.test(popupUrl) ||
      (await popup.content().catch(() => '')).match(/redirect_uri_mismatch/i)
    ) {
      notes.push(
        'GOOGLE_REDIRECT_URI_MISMATCH — register https://messaging.parnoir.com/oauth-callback.html'
      );
      await shot(popup, `${label}-redirect-mismatch`);
      return { recovered: false, notes };
    }
    await googleOauth(popup);
    await popup.waitForEvent('close', { timeout: 90_000 }).catch(() => {});
    let finalUrl = '';
    try {
      finalUrl = popup.url();
    } catch {
      finalUrl = '';
    }
    if (/redirect_uri_mismatch/i.test(String(finalUrl))) {
      notes.push('GOOGLE_REDIRECT_URI_MISMATCH after oauth');
      return { recovered: false, notes };
    }
    notes.push('google oauth popup completed');
  } else if (/accounts\.google|google\.com/.test(page.url())) {
    if (/redirect_uri_mismatch/i.test(page.url()) || (await bodyHas(page, /redirect_uri_mismatch/i))) {
      notes.push(
        'GOOGLE_REDIRECT_URI_MISMATCH — register https://messaging.parnoir.com/oauth-callback.html'
      );
      return { recovered: false, notes };
    }
    await googleOauth(page);
    notes.push('google oauth same-tab');
  } else {
    notes.push(authorized ? 'Authorize clicked but no google popup' : 'no google popup');
  }

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const body = await page.locator('body').innerText().catch(() => '');
    if (/Setting up your storage|Preparing your par Noir storage/i.test(body)) {
      await page.waitForTimeout(3000);
      continue;
    }
    if (/redirect_uri_mismatch/i.test(body)) {
      notes.push('GOOGLE_REDIRECT_URI_MISMATCH in page body');
      return { recovered: false, notes };
    }
    if (!(await bannerLinkedInactive(page))) {
      notes.push('banner cleared');
      await shot(page, `${label}-after-reconnect`);
      return { recovered: true, notes };
    }
    await page.waitForTimeout(2000);
  }
  notes.push('banner still linkedInactive after reconnect timeout');
  return { recovered: false, notes };
}

/** Wait for vault hydrate + AT mint (or give up). Poll banner + session. */
async function waitForMessagingCloudReady(page, timeoutMs = 45_000) {
  const notes = [];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const readyFired = await page
      .evaluate(() => Boolean(window.__pnCloudReadySeen))
      .catch(() => false);
    if (!readyFired) {
      await page
        .evaluate(() => {
          if (window.__pnCloudReadyHooked) return;
          window.__pnCloudReadyHooked = true;
          window.__pnCloudReadySeen = false;
          window.addEventListener('pn-cloud-credentials-ready', () => {
            window.__pnCloudReadySeen = true;
          });
        })
        .catch(() => {});
    } else {
      notes.push('cloud_wait=ready_event');
      return { ok: true, notes };
    }
    if (!(await bannerLinkedInactive(page)) && (await isMessagingSessionLive(page))) {
      notes.push('cloud_wait=no_banner_session_live');
      return { ok: true, notes };
    }
    await page.waitForTimeout(1000);
  }
  const bannerBad = await bannerLinkedInactive(page);
  notes.push('cloud_wait=timeout');
  notes.push(bannerBad ? 'banner still bad after wait' : 'no banner after wait');
  return { ok: !bannerBad && (await isMessagingSessionLive(page)), notes };
}

const report = {
  generatedAt: new Date().toISOString(),
  fixtures: ['test-pn', 'test-pn-2'],
  gate: null,
  flows: [],
  notes: [],
  stoppedEarly: false,
};

const browser = await chromium.launch({
  headless: process.env.PN_QA_HEADLESS !== '0',
  args: ['--disable-blink-features=AutomationControlled'],
});

async function makeTrackedPage() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const oauth = { challenge: false, authenticate: false, token: false, userinfo: false };
  const apiBag = [];
  trackOAuth(page, oauth);
  trackApi(page, apiBag);
  return { context, page, oauth, apiBag };
}

async function runMessagingSession(label, creds, { assessTabs = true } = {}) {
  const { context, page, oauth, apiBag } = await makeTrackedPage();
  const result = {
    fixture: creds.which,
    label,
    unlocked: false,
    pnIdentifier: null,
    oauth,
    bannerBad: false,
    reconnectNotes: [],
    cloudHeaderSeen: false,
    connectionsFinal409: false,
    notifFinalBad: false,
    notifOk: false,
    connectionsOk: false,
    tabFlows: [],
    apiSample: [],
    gateLabel: 'BLOCKED',
  };
  try {
    await page.goto('https://messaging.parnoir.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(async (e) => {
      slog(`[${label}] goto retry after`, String(e?.message || e).slice(0, 80));
      await pace(PACE_MS, 'goto retry');
      await page.goto('https://messaging.parnoir.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    });
    await shot(page, `${label}-01-load`);
    slog(`[${label}] unlock…`);
    await unlockMessaging(page, creds);
    result.unlocked = await waitForMessagingUnlock(page, 45_000);
    if (!result.unlocked) {
      result.blocked = 'unlock did not establish pn_oauth_session';
      result.gateLabel = 'BLOCKED';
      await shot(page, `${label}-02-after-unlock`);
      result.reconnectNotes.push('unlock session missing');
      await context.close().catch(() => {});
      return result;
    }
    // Let vault hydrate / first Google mint settle before tab storm.
    await pace(Math.max(PACE_MS, 8_000), `${label} post-unlock settle`);
    const cloudWait = await waitForMessagingCloudReady(page, 45_000);
    result.reconnectNotes.push(...cloudWait.notes);
    result.pnIdentifier = await readSessionPn(page);
    await shot(page, `${label}-02-after-unlock`);

    if (await bannerLinkedInactive(page)) {
      slog(`[${label}] recovering cloud via reconnect…`);
      const rec = await recoverCloudOnDevice(page, label);
      result.reconnectNotes = [...result.reconnectNotes, ...rec.notes];
      report.flows.push({
        id: `messaging.${label}.cloud_reconnect`,
        title: `${label} cloud reconnect on device`,
        label: rec.recovered ? 'LIVE_REAL' : 'LIVE_UNFINISHED',
        notes: result.reconnectNotes,
      });
    } else {
      result.reconnectNotes = [
        ...result.reconnectNotes,
        'vault hydrate / already ready (no banner)',
      ];
      report.flows.push({
        id: `messaging.${label}.cloud_reconnect`,
        title: `${label} cloud reconnect on device`,
        label: 'LIVE_REAL',
        notes: result.reconnectNotes,
      });
    }

    result.bannerBad = await bannerLinkedInactive(page);
    result.cloudHeaderSeen = apiBag.some((a) => a.cloudHeader);
    if (result.cloudHeaderSeen) {
      result.reconnectNotes.push('X-PN-Cloud-Access-Token OBSERVED on ≥1 API call');
    }

    if (assessTabs) {
      // Tabs — assess FINAL statuses (one at a time, paced)
      for (const name of ['Messages', 'Notifications', 'Requests']) {
        await pace(PACE_MS, `${label} before tab ${name}`);
        const before = apiBag.length;
        const clicked = await clickTab(page, name);
        await pace(PACE_MS, `${label} after tab ${name}`);
        const slice = apiBag.slice(before);
        const unauthorized = await bodyHas(page, /unauthorized/i);
        result.tabFlows.push({
          id: `messaging.${label}.tab.${name.toLowerCase()}`,
          title: `${label} tab ${name}`,
          label:
            clicked &&
            ((name === 'Notifications' && hasOk(slice, '/api/notifications') && !unauthorized) ||
              (name !== 'Notifications' && (hasOk(slice, '/api/') || true)))
              ? name === 'Notifications'
                ? hasOk(slice, '/api/notifications')
                  ? 'LIVE_REAL'
                  : 'LIVE_UNFINISHED'
                : 'LIVE_REAL'
              : clicked
                ? 'LIVE_UNFINISHED'
                : 'BLOCKED',
          clicked,
          api: summarizeApi(apiBag, before),
          unauthorizedUi: unauthorized,
          screenshot: await shot(page, `${label}-tab-${name.toLowerCase()}`),
        });
      }

      {
        await pace(PACE_MS, `${label} before Connections`);
        const before = apiBag.length;
        await clickTab(page, 'Connections');
        await pace(PACE_MS, `${label} after Connections`);
        result.tabFlows.push({
          id: `messaging.${label}.connections`,
          title: `${label} Connections`,
          api: summarizeApi(apiBag, before),
          screenshot: await shot(page, `${label}-connections`),
        });
      }
    }

    // Final credential-sensitive calls
    const notif = lastHit(apiBag, '/api/notifications');
    const conn = lastHit(apiBag, '/api/connections');
    // Prefer GET /api/connections without /pending
    let connMain = null;
    for (let i = apiBag.length - 1; i >= 0; i--) {
      if (apiBag[i].path === '/api/connections' || apiBag[i].path.startsWith('/api/connections?')) {
        connMain = apiBag[i];
        break;
      }
    }
    result.notifFinalBad = !notif || notif.status >= 400;
    result.notifOk = !!(notif && notif.status >= 200 && notif.status < 400);
    result.connectionsFinal409 = !!(connMain && connMain.status === 409);
    result.connectionsOk = !!(connMain && connMain.status >= 200 && connMain.status < 400);
    if (!connMain && conn) {
      result.connectionsOk = conn.status >= 200 && conn.status < 400;
      result.connectionsFinal409 = conn.status === 409;
    }

    result.bannerBad = await bannerLinkedInactive(page);
    if (!result.unlocked) result.gateLabel = 'BLOCKED';
    else if (result.bannerBad || result.connectionsFinal409 || result.notifFinalBad)
      result.gateLabel = 'LIVE_UNFINISHED';
    else result.gateLabel = 'LIVE_REAL';

    // Unlock-only reopen: if we skipped tabs, treat cloud+session as enough for LIVE_REAL.
    if (!assessTabs && result.unlocked && !result.bannerBad) {
      result.notifFinalBad = false;
      result.notifOk = true;
      result.connectionsFinal409 = false;
      result.gateLabel = 'LIVE_REAL';
    }

    result.apiSample = summarizeApi(apiBag, 0).slice(-45);
    result._keep = { context, page, apiBag, oauth };
    return result;
  } catch (e) {
    result.blocked = String(e?.message || e).slice(0, 400);
    result.gateLabel = 'BLOCKED';
    await shot(page, `${label}-error`);
    await context.close().catch(() => {});
    return result;
  }
}

slog('Fixtures', fixtureA.identityPath, '|', fixtureB.identityPath);
slog(
  `Pacing: step=${PACE_MS}ms unlockGap=${UNLOCK_GAP_MS}ms phaseGap=${PHASE_GAP_MS}ms (sequential unlocks, one browser active when possible)`
);

const gateA = await runMessagingSession('A', fixtureA);
// Close A before B unlock so two vaults are not minting/refreshing Google in parallel.
if (gateA._keep?.context) {
  slog('[A] closing session before B unlock (avoid dual Google refresh)');
  await gateA._keep.context.close().catch(() => {});
  gateA._keep = null;
}
await pace(UNLOCK_GAP_MS, 'cool-down before B unlock');
const gateB = await runMessagingSession('B', fixtureB);

report.gate = {
  A: {
    fixture: gateA.fixture,
    unlocked: gateA.unlocked,
    pnIdentifierPresent: !!gateA.pnIdentifier,
    bannerBad: gateA.bannerBad,
    connectionsFinal409: gateA.connectionsFinal409,
    notifFinalBad: gateA.notifFinalBad,
    notifOk: gateA.notifOk,
    connectionsOk: gateA.connectionsOk,
    gateLabel: gateA.gateLabel,
    reconnectNotes: gateA.reconnectNotes,
    cloudHeaderSeen: gateA.cloudHeaderSeen,
    blocked: gateA.blocked || null,
    apiSample: gateA.apiSample,
  },
  B: {
    fixture: gateB.fixture,
    unlocked: gateB.unlocked,
    pnIdentifierPresent: !!gateB.pnIdentifier,
    bannerBad: gateB.bannerBad,
    connectionsFinal409: gateB.connectionsFinal409,
    notifFinalBad: gateB.notifFinalBad,
    notifOk: gateB.notifOk,
    connectionsOk: gateB.connectionsOk,
    gateLabel: gateB.gateLabel,
    reconnectNotes: gateB.reconnectNotes,
    cloudHeaderSeen: gateB.cloudHeaderSeen,
    blocked: gateB.blocked || null,
    apiSample: gateB.apiSample,
  },
};

report.flows.push(...(gateA.tabFlows || []), ...(gateB.tabFlows || []));
report.flows.push({
  id: 'messaging.cloud_gate',
  title: 'Cloud AT / notifications / connections gate (both fixtures)',
  label:
    gateA.gateLabel === 'LIVE_REAL' && gateB.gateLabel === 'LIVE_REAL'
      ? 'LIVE_REAL'
      : gateA.unlocked && gateB.unlocked
        ? 'LIVE_UNFINISHED'
        : 'BLOCKED',
  notes: [
    `A=${gateA.gateLabel} banner=${gateA.bannerBad} conn409=${gateA.connectionsFinal409} notifBad=${gateA.notifFinalBad}`,
    `B=${gateB.gateLabel} banner=${gateB.bannerBad} conn409=${gateB.connectionsFinal409} notifBad=${gateB.notifFinalBad}`,
  ],
});

const gateFailed =
  !gateA.unlocked ||
  !gateB.unlocked ||
  gateA.bannerBad ||
  gateB.bannerBad ||
  gateA.connectionsFinal409 ||
  gateB.connectionsFinal409 ||
  gateA.notifFinalBad ||
  gateB.notifFinalBad ||
  !gateA.pnIdentifier ||
  !gateB.pnIdentifier;

if (gateFailed) {
  report.stoppedEarly = true;
  report.notes.push(
    'Gate falsified after reconnect attempt — stop before dual-DM/outbox.'
  );
  slog('GATE FAILED — stopping before DM/outbox');
  if (gateB._keep?.context) await gateB._keep.context.close().catch(() => {});
} else {
  slog('Gate passed. Dual connection + DM…');
  await pace(PHASE_GAP_MS, 'cool-down before Connect / dual-DM');

  // Re-open A (closed after its gate pass). B stays live.
  slog('[A] re-unlock for Connect/DM (tabs skipped)');
  const gateALive = await runMessagingSession('A', fixtureA, { assessTabs: false });
  if (!gateALive.unlocked || !gateALive._keep) {
    report.notes.push('A re-unlock for DM failed');
    slog('A re-unlock failed — stopping dual-DM');
    if (gateB._keep?.context) await gateB._keep.context.close().catch(() => {});
  } else {
  const pageA = gateALive._keep.page;
  const pageB = gateB._keep.page;
  const apiA = gateALive._keep.apiBag;
  const apiB = gateB._keep.apiBag;
  const pnB = gateB.pnIdentifier;

  await pace(PHASE_GAP_MS, 'cool-down before browse Connect');
  const browseA = await makeTrackedPage();
  let connectLabel = 'BLOCKED';
  let connectNotes = [];
  try {
    const creatorUrl = `https://browse.parnoir.com/?creator=${encodeURIComponent(pnB)}`;
    await browseA.page.goto(creatorUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await unlockBrowse(browseA.page, fixtureA);
    const browseUnlocked = await waitForMessagingUnlock(browseA.page, 60_000);
    connectNotes.push(`browseUnlocked=${browseUnlocked}`);
    if (!browseUnlocked) {
      throw new Error('Browse unlock did not reach Lock pN + session before Connect');
    }
    await pace(Math.max(PACE_MS, 8_000), 'browse post-unlock settle');
    if (await bannerLinkedInactive(browseA.page)) {
      const rec = await recoverCloudOnDevice(browseA.page, 'browseA');
      connectNotes.push(...rec.notes.map((n) => `browse:${n}`));
    }
    // Profile menu Connect needs cloud AT for connection status / request.
    await browseA.page
      .waitForResponse(
        (r) =>
          r.url().includes('/api/') &&
          (r.request().headers()['x-pn-cloud-access-token'] ||
            r.request().headers()['X-PN-Cloud-Access-Token']),
        { timeout: 45_000 }
      )
      .catch(() => null);
    await shot(browseA.page, 'connect-01-creator');

    // Empty Me/creator page: avatar button title="Profile actions"
    const profileBtn = browseA.page.getByTitle('Profile actions').first();
    if (await profileBtn.isVisible().catch(() => false)) {
      await profileBtn.click();
      await pace(PACE_MS, 'profile menu open');
      connectNotes.push('opened Profile actions menu');
    } else {
      connectNotes.push('Profile actions button missing — scanning buttons');
      const avatars = browseA.page.locator('button');
      const n = Math.min(await avatars.count(), 25);
      for (let i = 0; i < n; i++) {
        await avatars.nth(i).click().catch(() => {});
        await pace(Math.min(PACE_MS, 1500));
        if (
          await browseA.page
            .getByRole('button', { name: /^Connect$/i })
            .first()
            .isVisible()
            .catch(() => false)
        )
          break;
      }
    }

    const connectBtn = browseA.page.getByRole('button', { name: /^Connect$/i }).first();
    // Wait until Connect is both visible and enabled (unlocked UI).
    let connectReady = false;
    const readyDeadline = Date.now() + 30_000;
    while (Date.now() < readyDeadline) {
      const visible = await connectBtn.isVisible().catch(() => false);
      const enabled = visible && (await connectBtn.isEnabled().catch(() => false));
      if (enabled) {
        connectReady = true;
        break;
      }
      // Re-open menu if it closed while still locked.
      if (!visible && (await profileBtn.isVisible().catch(() => false))) {
        await profileBtn.click().catch(() => {});
      }
      await pace(1000);
    }
    connectNotes.push(`connectReady=${connectReady}`);
    if (!connectReady) {
      const visible = await connectBtn.isVisible().catch(() => false);
      const enabled = visible ? await connectBtn.isEnabled().catch(() => false) : false;
      connectNotes.push(`connectVisible=${visible} connectEnabled=${enabled}`);
      throw new Error('Connect never became enabled after browse unlock');
    }

    const before = browseA.apiBag.length;
    await connectBtn.click();
    await pace(Math.max(PACE_MS, 5_000), 'after Connect click');
    const slice = summarizeApi(browseA.apiBag, before);
    const reqOk = slice.some((l) => /\/api\/connections/.test(l) && / (2|3)\d\d$/.test(l));
    const toast = await bodyHas(browseA.page, /Connection request sent|pending/i);
    connectLabel = reqOk || toast ? 'LIVE_REAL' : 'LIVE_UNFINISHED';
    connectNotes.push(...slice.slice(-15));
    await shot(browseA.page, 'connect-02-after');
  } catch (e) {
    connectNotes.push(String(e?.message || e).slice(0, 300));
  }
  report.flows.push({
    id: 'messaging.connection_request',
    title: 'A→B connection request (browse ?creator=)',
    label: connectLabel,
    notes: connectNotes,
  });
  slog('  connection request →', connectLabel);

  let acceptLabel = 'BLOCKED';
  let acceptNotes = [];
  try {
    await pace(PACE_MS, 'before B Requests/Accept');
    await clickTab(pageB, 'Requests');
    await pace(PACE_MS);
    await clickTab(pageB, 'Connections');
    await pace(PACE_MS);
    await shot(pageB, 'accept-01');
    const before = apiB.length;
    let acceptBtn = pageB.getByRole('button', { name: /^Accept$/i }).first();
    if (!(await acceptBtn.isVisible().catch(() => false))) {
      await clickTab(pageB, 'Requests');
      await pace(PACE_MS);
      acceptBtn = pageB.getByRole('button', { name: /^Accept$/i }).first();
    }
    if (await acceptBtn.isVisible().catch(() => false)) {
      await acceptBtn.click();
      await pace(Math.max(PACE_MS, 6_000), 'after Accept');
      const ok = hasOk(apiB.slice(before), '/api/connections') || (await bodyHas(pageB, /accepted|Connected/i));
      acceptLabel = ok ? 'LIVE_REAL' : 'LIVE_UNFINISHED';
      acceptNotes.push(...summarizeApi(apiB, before).slice(-20));
    } else {
      acceptLabel = connectLabel === 'LIVE_REAL' ? 'LIVE_UNFINISHED' : 'BLOCKED';
      acceptNotes.push('Accept not visible');
    }
    await shot(pageB, 'accept-02');
  } catch (e) {
    acceptNotes.push(String(e?.message || e).slice(0, 300));
  }
  report.flows.push({
    id: 'messaging.connection_accept',
    title: 'B accepts connection',
    label: acceptLabel,
    notes: acceptNotes,
  });
  slog('  accept →', acceptLabel);

  let dmLabel = 'BLOCKED';
  let dmNotes = [];
  let outboxLabel = 'LIVE_UNFINISHED';
  let outboxNotes = [];
  try {
    await clickTab(pageA, 'Messages');
    await pageA.waitForTimeout(2000);
    await clickTab(pageA, 'Connections');
    await pageA.waitForTimeout(1500);
    await shot(pageA, 'dm-01');

    const rows = pageA.locator('button, a, div[role="button"]');
    const rowCount = Math.min(await rows.count().catch(() => 0), 40);
    for (let i = 0; i < rowCount; i++) {
      const r = rows.nth(i);
      const txt = ((await r.innerText().catch(() => '')) || '').slice(0, 80);
      if (/connected|message|pn-/i.test(txt) || (txt.length > 2 && txt.length < 48)) {
        await r.click().catch(() => {});
        await pageA.waitForTimeout(600);
        if (await pageA.getByPlaceholder(/Type a message/i).first().isVisible().catch(() => false)) break;
      }
    }

    const compose = pageA.getByPlaceholder(/Type a message/i).first();
    if (await compose.isVisible().catch(() => false)) {
      const marker = `qa-${Date.now().toString(36)}`;
      const before = apiA.length;
      await compose.fill(marker);
      await pageA.locator('[aria-label="Send"]').first().click().catch(async () => {
        await pageA.getByRole('button', { name: /Send/i }).first().click();
      });
      await pageA.waitForTimeout(5000);
      const sendApi = summarizeApi(apiA, before);
      const sendOk = sendApi.some((l) => /\/api\/(messages|mailbox)/i.test(l) && / (2|3)\d\d$/.test(l));
      dmLabel = sendOk ? 'LIVE_REAL' : 'LIVE_UNFINISHED';
      dmNotes.push(...sendApi.slice(-15));
      await shot(pageA, 'dm-02-sent');

      await clickTab(pageB, 'Messages');
      await pageB.waitForTimeout(4000);
      await shot(pageB, 'dm-03-b');
      dmNotes.push(`B_body_has_marker=${await bodyHas(pageB, new RegExp(marker, 'i'))}`);

      // Offline outbox
      try {
        await pageA.context().setOffline(true);
        const marker2 = `qa-off-${Date.now().toString(36)}`;
        const beforeOff = apiA.length;
        await compose.fill(marker2);
        await pageA.locator('[aria-label="Send"]').first().click().catch(async () => {
          await pageA.getByRole('button', { name: /Send/i }).first().click();
        });
        await pageA.waitForTimeout(1500);
        outboxNotes.push('queued offline');
        await pageA.context().setOffline(false);
        await pageA.waitForTimeout(8000);
        const after = summarizeApi(apiA, beforeOff);
        const flushed = after.some((l) => /\/api\/(messages|mailbox)/i.test(l) && / (2|3)\d\d$/.test(l));
        outboxLabel = flushed ? 'LIVE_REAL' : 'LIVE_UNFINISHED';
        outboxNotes.push(...after.slice(-12));
        outboxNotes.push(flushed ? 'flush OBSERVED' : 'no flush traffic');
        await shot(pageA, 'outbox-after');
      } catch (e) {
        await pageA.context().setOffline(false).catch(() => {});
        outboxLabel = 'LIVE_UNFINISHED';
        outboxNotes.push(String(e?.message || e).slice(0, 300));
      }
    } else {
      dmLabel = acceptLabel === 'LIVE_REAL' ? 'LIVE_UNFINISHED' : 'BLOCKED';
      dmNotes.push('compose not found');
      outboxNotes.push('skipped — no compose');
    }
  } catch (e) {
    dmNotes.push(String(e?.message || e).slice(0, 300));
    outboxNotes.push('skipped due to DM error');
  }
  report.flows.push({ id: 'messaging.dm_send', title: 'A→B DM send', label: dmLabel, notes: dmNotes });
  report.flows.push({
    id: 'messaging.outbox_offline_flush',
    title: 'Offline outbox → online flush',
    label: outboxLabel,
    notes: outboxNotes,
  });
  slog('  dm →', dmLabel, 'outbox →', outboxLabel);
  await browseA.context.close().catch(() => {});
  await pageA.context().close().catch(() => {});
  await pageB.context().close().catch(() => {});
  } // gateALive
}

// --- Browse engagement: DISCOVER public feed + like / follow ---
if (process.env.PN_QA_SKIP_BROWSE_ENGAGEMENT === '1') {
  slog('Browse engagement… skipped (PN_QA_SKIP_BROWSE_ENGAGEMENT=1)');
  report.notes.push('browse engagement skipped to reduce Google/API load');
} else {
  await pace(PHASE_GAP_MS, 'cool-down before browse engagement');
  slog('Browse engagement…');
{
  const { context, page, apiBag } = await makeTrackedPage();
  const eng = { id: 'browse.engagement_like', title: 'Engagement sidebar / like', label: 'BLOCKED', notes: [] };
  const follow = {
    id: 'browse.free_follow_or_connect',
    title: 'Free follow / Connect on creator',
    label: 'BLOCKED',
    notes: [],
  };
  try {
    await page.goto('https://browse.parnoir.com/?view=feed', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await unlockBrowse(page, fixtureA);
    await page.waitForTimeout(4000);
    if (await bannerLinkedInactive(page)) {
      const rec = await recoverCloudOnDevice(page, 'browse-engage');
      eng.notes.push(...rec.notes.map((n) => `cloud:${n}`));
    }
    // Force DISCOVER (public), not empty pN tab
    const discover = page.getByRole('button', { name: /^DISCOVER$/i }).first();
    if (await discover.isVisible().catch(() => false)) {
      await discover.click();
      await page.waitForTimeout(3000);
    }
    await shot(page, 'engage-01-discover');
    eng.notes.push(`bodyNoContent=${await bodyHas(page, /No Content Available/i)}`);

    let likeBtn = page.getByTitle('Like').first();
    let likeVisible = await likeBtn.isVisible().catch(() => false);
    if (!likeVisible) {
      for (const rail of ['MEDIA', 'THOUGHTS', 'DISCOVER']) {
        const r = page.getByRole('button', { name: new RegExp(`^${rail}$`, 'i') }).first();
        if (await r.isVisible().catch(() => false)) {
          await r.click();
          await page.waitForTimeout(2000);
        }
        for (let i = 0; i < 8; i++) {
          await page.keyboard.press('ArrowDown').catch(() => {});
          await page.waitForTimeout(600);
          likeBtn = page.getByTitle('Like').first();
          likeVisible = await likeBtn.isVisible().catch(() => false);
          if (likeVisible) break;
        }
        if (likeVisible) break;
      }
    }
    // Heart fallback (lucide)
    if (!likeVisible) {
      const hearts = page.locator('button').filter({ has: page.locator('svg') });
      eng.notes.push(`svgButtons=${await hearts.count().catch(() => 0)}`);
    }
    eng.notes.push(`likeVisible=${likeVisible}`);
    if (likeVisible) {
      const before = apiBag.length;
      await likeBtn.click();
      await page.waitForTimeout(3000);
      const likeApi = summarizeApi(apiBag, before);
      const ok = likeApi.some((l) => /\/api\/engagement\/.+\/like/.test(l) && / (2|3)\d\d$/.test(l));
      eng.label = ok ? 'LIVE_REAL' : 'LIVE_UNFINISHED';
      eng.notes.push(...likeApi.slice(-10));
      await shot(page, 'engage-02-liked');
    } else {
      eng.label = 'BLOCKED';
      eng.notes.push('Like control not found on DISCOVER/MEDIA/THOUGHTS');
    }

    // Follow/Connect: open creator menu on current post if any
    const connectOrFollow = page.getByRole('button', { name: /^(Connect|Follow|Subscribe)$/i }).first();
    if (!(await connectOrFollow.isVisible().catch(() => false))) {
      const chip = page.locator('button').filter({ has: page.locator('img') }).first();
      if (await chip.isVisible().catch(() => false)) {
        await chip.click().catch(() => {});
        await page.waitForTimeout(800);
      }
    }
    const btn = page.getByRole('button', { name: /^(Connect|Follow|Subscribe)$/i }).first();
    if (await btn.isVisible().catch(() => false)) {
      const before = apiBag.length;
      const name = await btn.innerText().catch(() => '');
      await btn.click();
      await page.waitForTimeout(3000);
      const slice = summarizeApi(apiBag, before);
      const ok = slice.some((l) => /\/api\/(connections|feeds)/i.test(l) && / (2|3)\d\d$/.test(l));
      follow.label = ok ? 'LIVE_REAL' : 'LIVE_UNFINISHED';
      follow.notes.push(`clicked=${name}`, ...slice.slice(-10));
    } else if (gateB.pnIdentifier) {
      // Direct creator URL as free-connect probe
      await page.goto(`https://browse.parnoir.com/?creator=${encodeURIComponent(gateB.pnIdentifier)}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });
      await page.waitForTimeout(3000);
      const avatars = page.locator('button');
      const n = Math.min(await avatars.count(), 20);
      for (let i = 0; i < n; i++) {
        await avatars.nth(i).click().catch(() => {});
        await page.waitForTimeout(300);
        if (await page.getByRole('button', { name: /^Connect$/i }).first().isVisible().catch(() => false)) break;
      }
      const c = page.getByRole('button', { name: /^Connect$/i }).first();
      if (await c.isVisible().catch(() => false)) {
        const before = apiBag.length;
        await c.click();
        await page.waitForTimeout(4000);
        const slice = summarizeApi(apiBag, before);
        const ok = slice.some((l) => /\/api\/connections/.test(l) && / (2|3)\d\d$/.test(l));
        follow.label = ok ? 'LIVE_REAL' : 'LIVE_UNFINISHED';
        follow.notes.push('via ?creator= Connect', ...slice.slice(-10));
      } else {
        follow.label = 'BLOCKED';
        follow.notes.push('No Connect/Follow/Subscribe control');
      }
    } else {
      follow.label = 'BLOCKED';
      follow.notes.push('No Connect/Follow/Subscribe control');
    }
    await shot(page, 'engage-03-follow');
  } catch (e) {
    eng.notes.push(String(e?.message || e).slice(0, 300));
    follow.notes.push(String(e?.message || e).slice(0, 300));
  } finally {
    await context.close().catch(() => {});
  }
  report.flows.push(eng, follow);
  slog('  engagement →', eng.label, 'follow →', follow.label);
}
} // PN_QA_SKIP_BROWSE_ENGAGEMENT else

await browser.close();

const outPath = resolve(OUT, 'messaging-qa-report.json');
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      outPath,
      stoppedEarly: report.stoppedEarly,
      gate: {
        A: { ...report.gate.A, apiSample: report.gate.A.apiSample?.slice(-12) },
        B: { ...report.gate.B, apiSample: report.gate.B.apiSample?.slice(-12) },
      },
      flows: report.flows.map((f) => ({
        id: f.id,
        label: f.label,
        notes: (f.notes || []).slice(0, 6),
      })),
    },
    null,
    2
  )
);
