#!/usr/bin/env node
/**
 * Live group messaging QA (CDP messaging-a :9333 / messaging-b :9334).
 *
 * Reuses live sessions when Lock pN is present; otherwise unlocks via fixtures.
 * Requires A↔B already connected (run ux-messaging-qa.mjs Connect phase first).
 *
 *   node apps/aggregator-browser/scripts/ux-messaging-group-qa.mjs
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { unlockViaPopup } from './ux-unlock-lib.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(scriptDir, '../../..');
const OUT = resolve(ROOT, '.local/ux-playwright/messaging-qa');
mkdirSync(OUT, { recursive: true });

const MARKER_A = `gmsg-a-${Date.now().toString(36)}`;
const MARKER_B = `gmsg-b-${Date.now().toString(36)}`;

function slog(...a) {
  process.stderr.write(a.join(' ') + '\n');
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
  ].filter(Boolean);
  const identityPath = candidates.find((p) => existsSync(p));
  if (!identityPath || !PN_NAME || !PASSCODE) throw new Error(`Incomplete fixture ${which}`);
  return { identityPath, PN_NAME, PASSCODE };
}

async function attach(port, origin) {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0] || (await browser.newContext());
  let page =
    context.pages().find((p) => {
      try {
        return p.url().includes(new URL(origin).host);
      } catch {
        return false;
      }
    }) ||
    context.pages()[0];
  if (!page) throw new Error(`No page on :${port}`);
  if (!page.url().includes(new URL(origin).host)) {
    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  }
  return { browser, page };
}

async function isLive(page) {
  const lock = await page.getByTitle('Lock pN').first().isVisible().catch(() => false);
  const pn = await page.evaluate(() => {
    try {
      const raw = sessionStorage.getItem('pn_oauth_session');
      return raw ? JSON.parse(raw).pnIdentifier || null : null;
    } catch {
      return null;
    }
  });
  return !!(lock && pn);
}

async function ensureUnlocked(page, creds, label) {
  if (await isLive(page)) {
    slog(`[${label}] session live — skip unlock`);
    return;
  }
  slog(`[${label}] unlock…`);
  const unlockClick = async (p) => {
    const byTitle = p.getByTitle('Unlock pN');
    if (await byTitle.first().isVisible().catch(() => false)) {
      await byTitle.first().click();
      return;
    }
    await p.getByRole('button', { name: /Unlock pN/i }).first().click();
  };
  await unlockViaPopup(page, unlockClick, creds);
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await isLive(page)) return;
    await page.waitForTimeout(1000);
  }
  throw new Error(`${label} unlock did not establish Lock pN + session`);
}

/**
 * Messaging silo (MESSAGING_ONLY) has no bottom nav — Inbox is the root.
 * Leave any open thread first so the list + "New group" chrome is visible.
 */
async function dismissOverlays(page) {
  for (let i = 0; i < 6; i++) {
    const overlay = page.locator('.fixed.inset-0').first();
    if (!(await overlay.isVisible().catch(() => false))) break;
    const heading = page.getByRole('heading', { name: /^New group$/i });
    if (await heading.isVisible().catch(() => false)) {
      await overlay.locator('button').first().click({ force: true }).catch(() => {});
    } else {
      await page.keyboard.press('Escape').catch(() => {});
    }
    await page.waitForTimeout(350);
  }
}

async function openInbox(page) {
  await dismissOverlays(page);
  for (let i = 0; i < 4; i++) {
    const back = page.getByLabel('Back').first();
    if (!(await back.isVisible().catch(() => false))) break;
    await back.click({ force: true }).catch(() => {});
    await page.waitForTimeout(600);
  }
  await dismissOverlays(page);
  const messagesIcon = page.getByLabel('Messages').first();
  if (await messagesIcon.isVisible().catch(() => false)) {
    await messagesIcon.click({ force: true });
    await page.waitForTimeout(800);
  }
}

async function softDrain(page) {
  await openInbox(page);
  const requests = page.getByLabel('Requests').first();
  if (await requests.isVisible().catch(() => false)) {
    await requests.click({ force: true });
    await page.waitForTimeout(2500);
  }
  const messages = page.getByLabel('Messages').first();
  if (await messages.isVisible().catch(() => false)) {
    await messages.click({ force: true });
    await page.waitForTimeout(1500);
  }
}

async function bodyHas(page, re) {
  const t = await page.locator('body').innerText().catch(() => '');
  return re.test(t);
}

const report = {
  generatedAt: new Date().toISOString(),
  markerA: MARKER_A,
  markerB: MARKER_B,
  notes: [],
  ok: false,
};

try {
  const fixtureA = loadFixture('test-pn');
  const fixtureB = loadFixture('test-pn-2');
  const a = await attach(9333, 'https://messaging.parnoir.com/');
  const b = await attach(9334, 'https://messaging.parnoir.com/');
  const pageA = a.page;
  const pageB = b.page;

  await ensureUnlocked(pageA, fixtureA, 'A');
  await ensureUnlocked(pageB, fixtureB, 'B');

  await softDrain(pageA);
  await softDrain(pageB);

  await openInbox(pageA);
  const newGroup = pageA.getByRole('button', { name: /^New group$/i }).first();
  if (!(await newGroup.isVisible().catch(() => false))) {
    report.notes.push('BLOCKED: New group button missing (open Inbox?)');
    await pageA.screenshot({ path: resolve(OUT, 'group-qa-no-new-group.png') }).catch(() => {});
    throw new Error(report.notes[0]);
  }
  await newGroup.click();
  await pageA.waitForTimeout(800);

  const titleInput = pageA.getByPlaceholder('Group title').first();
  if (!(await titleInput.isVisible().catch(() => false))) {
    report.notes.push('BLOCKED: New group modal not open');
    throw new Error(report.notes[0]);
  }
  const title = `QA Group ${Date.now().toString(36)}`;
  await titleInput.fill(title);

  const checks = pageA.locator('input[type="checkbox"]');
  // Connections load async after modal mount — wait before counting.
  try {
    await checks.first().waitFor({ state: 'visible', timeout: 30_000 });
  } catch {
    report.notes.push('BLOCKED: no connections to add (run Connect QA first)');
    await pageA.screenshot({ path: resolve(OUT, 'group-qa-no-members.png') }).catch(() => {});
    throw new Error(report.notes[report.notes.length - 1]);
  }
  const nCheck = await checks.count();
  report.notes.push(`member_checkboxes=${nCheck}`);
  await checks.first().check({ force: true }).catch(async () => {
    await checks.first().click({ force: true });
  });

  const createBtn = pageA.getByRole('button', { name: /^Create group$/i }).first();
  const createWait = pageA
    .waitForResponse(
      (r) => r.request().method() === 'POST' && /\/api\/groups$/.test(new URL(r.url()).pathname),
      { timeout: 90_000 }
    )
    .catch(() => null);
  await createBtn.click();
  const createRes = await createWait;
  report.notes.push(createRes ? `POST /api/groups ${createRes.status()}` : 'create=no_response');
  if (!createRes || !createRes.ok()) {
    const body = createRes ? await createRes.text().catch(() => '') : '';
    throw new Error(`Group create failed ${body.slice(0, 200)}`);
  }

  // CreateGroupModal onCreated opens the group thread immediately — do not Back out.
  await pageA.waitForTimeout(2000);
  let composerA = pageA.getByPlaceholder(/Type a message/i).first();
  if (!(await composerA.isVisible().catch(() => false))) {
    await softDrain(pageA);
    await openInbox(pageA);
    const groupRowA = pageA
      .getByRole('button')
      .filter({ hasText: new RegExp(title.slice(0, 16).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })
      .first();
    if (await groupRowA.isVisible().catch(() => false)) await groupRowA.click();
    else throw new Error('Group thread not open after create and not in A inbox');
    await pageA.waitForTimeout(1500);
    composerA = pageA.getByPlaceholder(/Type a message/i).first();
  }

  // Peer must drain group_inbox_update before they can open/send.
  await softDrain(pageB);

  await composerA.fill(MARKER_A);
  const sendWaitA = pageA
    .waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        /\/api\/groups\/[^/]+\/messages/.test(new URL(r.url()).pathname),
      { timeout: 90_000 }
    )
    .catch(() => null);
  await pageA
    .getByRole('button', { name: /^Send$/i })
    .first()
    .click()
    .catch(async () => {
      await pageA.keyboard.press('Enter');
    });
  const sendResA = await sendWaitA;
  report.notes.push(sendResA ? `A_send ${sendResA.status()}` : 'A_send=no_response');
  if (!sendResA || !sendResA.ok()) {
    const body = sendResA ? await sendResA.text().catch(() => '') : '';
    throw new Error(`A group send failed ${body.slice(0, 200)}`);
  }

  await pageA.waitForTimeout(4000);
  await softDrain(pageB);
  await pageB.waitForTimeout(2500);

  async function openGroupThread(page) {
    await openInbox(page);
    const row = page
      .getByRole('button')
      .filter({ hasText: new RegExp(title.slice(0, 16).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })
      .first();
    if (await row.isVisible().catch(() => false)) {
      await row.click({ force: true });
    }
    await page.waitForTimeout(1500);
    return page.getByPlaceholder(/Type a message/i).first();
  }

  let composerB = await openGroupThread(pageB);
  // Poll for plaintext inside an open thread (composer must be present).
  let bHas = false;
  for (let i = 0; i < 15; i++) {
    if (!(await composerB.isVisible().catch(() => false))) {
      composerB = await openGroupThread(pageB);
    }
    bHas = await bodyHas(pageB, new RegExp(MARKER_A));
    if (bHas && (await composerB.isVisible().catch(() => false))) break;
    await softDrain(pageB);
    composerB = await openGroupThread(pageB);
    await pageB.waitForTimeout(2000);
  }
  report.notes.push(`B_has_A_marker=${bHas}`);
  if (!bHas || !(await composerB.isVisible().catch(() => false))) {
    await pageB.screenshot({ path: resolve(OUT, 'group-qa-b-missing.png') }).catch(() => {});
    throw new Error('B did not show A group plaintext in open thread');
  }

  await composerB.fill(MARKER_B);
  const sendWaitB = pageB
    .waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        /\/api\/groups\/[^/]+\/messages/.test(new URL(r.url()).pathname),
      { timeout: 90_000 }
    )
    .catch(() => null);
  await pageB
    .getByRole('button', { name: /^Send$/i })
    .first()
    .click()
    .catch(async () => {
      await pageB.keyboard.press('Enter');
    });
  const sendResB = await sendWaitB;
  report.notes.push(sendResB ? `B_send ${sendResB.status()}` : 'B_send=no_response');
  if (!sendResB || !sendResB.ok()) {
    const body = sendResB ? await sendResB.text().catch(() => '') : '';
    throw new Error(`B group send failed ${body.slice(0, 200)}`);
  }
  await pageB.waitForTimeout(4000);
  let aHas = false;
  for (let i = 0; i < 30; i++) {
    const composerStill = pageA.getByPlaceholder(/Type a message/i).first();
    if (!(await composerStill.isVisible().catch(() => false))) {
      await openGroupThread(pageA);
    }
    aHas = await bodyHas(pageA, new RegExp(MARKER_B));
    if (aHas) break;
    await softDrain(pageA);
    await openGroupThread(pageA);
    await pageA.waitForTimeout(2500);
  }
  report.notes.push(`A_has_B_marker=${aHas}`);
  if (!aHas) {
    await pageA.screenshot({ path: resolve(OUT, 'group-qa-a-missing.png') }).catch(() => {});
    throw new Error('A did not show B group plaintext');
  }

  report.ok = true;
  report.label = 'LIVE_REAL';
  slog('GROUP QA SUCCESS', MARKER_A, MARKER_B);
  await a.browser.close().catch(() => {});
  await b.browser.close().catch(() => {});
} catch (e) {
  report.ok = false;
  report.label = 'BLOCKED';
  report.notes.push(String(e?.message || e).slice(0, 300));
  slog('GROUP QA FAIL', String(e?.message || e).slice(0, 200));
}

const outPath = resolve(OUT, 'group-qa-report.json');
writeFileSync(outPath, JSON.stringify({ outPath, ...report }, null, 2));
console.log(JSON.stringify({ outPath, ...report }, null, 2));
process.exit(report.ok ? 0 : 1);
