#!/usr/bin/env node
/**
 * Live group messaging QA (assumes messaging-a/b CDP unlocked + A↔B connected).
 *
 *   node apps/aggregator-browser/scripts/ux-messaging-group-qa.mjs
 *
 * Steps: A creates group with B → B drains → A sends → B sees plaintext →
 * B sends → A sees plaintext.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(scriptDir, '../../..');
const OUT = resolve(ROOT, '.local/ux-playwright/messaging-qa');
mkdirSync(OUT, { recursive: true });

const MARKER_A = `grp-a-${Date.now().toString(36)}`;
const MARKER_B = `grp-b-${Date.now().toString(36)}`;

function slog(...a) {
  process.stderr.write(a.join(' ') + '\n');
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
  return { browser, page };
}

async function clickTab(page, name) {
  const tab = page.getByRole('button', { name: new RegExp(`^${name}$`, 'i') }).first();
  if (await tab.isVisible().catch(() => false)) {
    await tab.click();
    await page.waitForTimeout(1200);
  }
}

async function softDrain(page) {
  await clickTab(page, 'Requests');
  await page.waitForTimeout(2500);
  await clickTab(page, 'Messages');
  await page.waitForTimeout(1500);
}

async function bodyHas(page, re) {
  const t = await page.locator('body').innerText().catch(() => '');
  return re.test(t);
}

const report = { generatedAt: new Date().toISOString(), markerA: MARKER_A, markerB: MARKER_B, notes: [], ok: false };

try {
  const a = await attach(9333, 'https://messaging.parnoir.com/');
  const b = await attach(9334, 'https://messaging.parnoir.com/');
  const pageA = a.page;
  const pageB = b.page;

  await softDrain(pageA);
  await softDrain(pageB);

  // Open New group from messaging chrome
  const newGroup = pageA.getByRole('button', { name: /New group|Create group/i }).first();
  if (!(await newGroup.isVisible().catch(() => false))) {
    // Try overflow / Connections area
    await clickTab(pageA, 'Messages');
    const alt = pageA.getByRole('button', { name: /group/i }).first();
    if (await alt.isVisible().catch(() => false)) await alt.click();
  } else {
    await newGroup.click();
  }
  await pageA.waitForTimeout(1000);

  const titleInput = pageA.getByPlaceholder(/group|title|name/i).first();
  if (!(await titleInput.isVisible().catch(() => false))) {
    report.notes.push('BLOCKED: New group UI not found');
    throw new Error(report.notes[0]);
  }
  const title = `QA ${MARKER_A}`;
  await titleInput.fill(title);

  // Pick first available member checkbox / row (B)
  const memberToggle = pageA
    .locator('input[type="checkbox"], button')
    .filter({ hasText: /pn-|PLATFORM|Member/i })
    .first();
  // Prefer checkboxes next to connection rows
  const checks = pageA.locator('input[type="checkbox"]');
  const nCheck = await checks.count();
  report.notes.push(`member_checkboxes=${nCheck}`);
  if (nCheck > 0) {
    await checks.first().check({ force: true }).catch(async () => {
      await checks.first().click({ force: true });
    });
  } else {
    // Click a connection row to add
    const row = pageA.locator('[role="dialog"] button, [role="dialog"] label').nth(1);
    if (await row.isVisible().catch(() => false)) await row.click();
  }

  const createBtn = pageA.getByRole('button', { name: /^(Create|Create group)$/i }).first();
  const createWait = pageA
    .waitForResponse(
      (r) => r.request().method() === 'POST' && /\/api\/groups$/.test(new URL(r.url()).pathname),
      { timeout: 60_000 }
    )
    .catch(() => null);
  await createBtn.click();
  const createRes = await createWait;
  report.notes.push(
    createRes ? `POST /api/groups ${createRes.status()}` : 'create=no_response'
  );
  if (!createRes || !createRes.ok()) {
    throw new Error('Group create failed');
  }

  await pageA.waitForTimeout(2000);
  await softDrain(pageB);
  await softDrain(pageA);

  // Open group thread on A (Messages list)
  await clickTab(pageA, 'Messages');
  await pageA.waitForTimeout(1500);
  const groupRowA = pageA.getByRole('button').filter({ hasText: new RegExp(title.slice(0, 12), 'i') }).first();
  if (!(await groupRowA.isVisible().catch(() => false))) {
    // fallback: any group-looking row
    const any = pageA.locator('button.w-full.p-4').filter({ hasText: /QA |Group/i }).first();
    if (await any.isVisible().catch(() => false)) await any.click();
    else throw new Error('Group thread not in A inbox');
  } else {
    await groupRowA.click();
  }
  await pageA.waitForTimeout(1500);

  const composerA = pageA.getByPlaceholder(/Type a message/i).first();
  await composerA.fill(MARKER_A);
  const sendWaitA = pageA
    .waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        /\/api\/groups\/[^/]+\/messages/.test(new URL(r.url()).pathname),
      { timeout: 60_000 }
    )
    .catch(() => null);
  await pageA.getByRole('button', { name: /^Send$/i }).first().click().catch(async () => {
    await pageA.keyboard.press('Enter');
  });
  const sendResA = await sendWaitA;
  report.notes.push(sendResA ? `A_send ${sendResA.status()}` : 'A_send=no_response');
  if (!sendResA || !sendResA.ok()) {
    const body = sendResA ? await sendResA.text().catch(() => '') : '';
    throw new Error(`A group send failed ${body.slice(0, 200)}`);
  }

  // Promote apply may also fire
  await pageA.waitForTimeout(3000);
  await softDrain(pageB);
  await pageB.waitForTimeout(2000);
  await clickTab(pageB, 'Messages');
  const groupRowB = pageB.getByRole('button').filter({ hasText: new RegExp(title.slice(0, 12), 'i') }).first();
  if (await groupRowB.isVisible().catch(() => false)) await groupRowB.click();
  else {
    const any = pageB.locator('button.w-full.p-4').filter({ hasText: /QA |Group/i }).first();
    if (await any.isVisible().catch(() => false)) await any.click();
  }
  await pageB.waitForTimeout(2500);
  const bHas = await bodyHas(pageB, new RegExp(MARKER_A));
  report.notes.push(`B_has_A_marker=${bHas}`);
  if (!bHas) throw new Error('B did not show A group plaintext');

  // Reverse: B sends
  const composerB = pageB.getByPlaceholder(/Type a message/i).first();
  await composerB.fill(MARKER_B);
  const sendWaitB = pageB
    .waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        /\/api\/groups\/[^/]+\/messages/.test(new URL(r.url()).pathname),
      { timeout: 60_000 }
    )
    .catch(() => null);
  await pageB.getByRole('button', { name: /^Send$/i }).first().click().catch(async () => {
    await pageB.keyboard.press('Enter');
  });
  const sendResB = await sendWaitB;
  report.notes.push(sendResB ? `B_send ${sendResB.status()}` : 'B_send=no_response');
  if (!sendResB || !sendResB.ok()) {
    throw new Error('B group send failed');
  }
  await pageB.waitForTimeout(3000);
  await softDrain(pageA);
  await pageA.waitForTimeout(2000);
  const aHas = await bodyHas(pageA, new RegExp(MARKER_B));
  report.notes.push(`A_has_B_marker=${aHas}`);
  if (!aHas) throw new Error('A did not show B group plaintext');

  report.ok = true;
  report.label = 'LIVE_REAL';
  slog('GROUP QA SUCCESS', MARKER_A, MARKER_B);
  await a.browser.close().catch(() => {});
  await b.browser.close().catch(() => {});
} catch (e) {
  report.ok = false;
  report.label = 'BLOCKED';
  report.notes.push(String(e?.message || e).slice(0, 300));
  slog('GROUP QA FAIL', e?.message || e);
}

const outPath = resolve(OUT, 'group-qa-report.json');
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ outPath, ...report }, null, 2));
process.exit(report.ok ? 0 : 1);
