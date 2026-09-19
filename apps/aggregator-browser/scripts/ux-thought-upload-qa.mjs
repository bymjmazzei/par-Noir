#!/usr/bin/env node
/**
 * Live: unlock browse → Add Thought → Submit metadata → assert feed-media + metadata index.
 * Fixture: .local/cursor-test-pn only.
 *
 *   node apps/aggregator-browser/scripts/ux-thought-upload-qa.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, writeSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadTestPn, trackOAuth, trackApi, unlockViaPopup } from './ux-unlock-lib.mjs';

function slog(...a) {
  writeSync(2, a.join(' ') + '\n');
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.REPO_ROOT || resolve(scriptDir, '../../..');
const OUT = resolve(ROOT, '.local/ux-playwright/thought-upload');
mkdirSync(OUT, { recursive: true });
const creds = loadTestPn(ROOT);
const MARKER =
  process.env.THOUGHT_TEXT?.trim() ||
  `QA thought ${Date.now().toString(36)} — live CDN check`;

const apiBag = [];
const oauth = { challenge: false, authenticate: false, token: false, userinfo: false };
const notes = [];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
trackOAuth(page, oauth);
trackApi(page, apiBag);

page.on('dialog', async (d) => {
  notes.push(`dialog: ${d.message().slice(0, 200)}`);
  await d.accept().catch(() => {});
});

async function shot(id) {
  const path = resolve(OUT, `${id}.png`);
  await page.screenshot({ path, fullPage: false }).catch(() => {});
  return path;
}

const report = {
  generatedAt: new Date().toISOString(),
  marker: MARKER,
  unlocked: false,
  steps: [],
  api: [],
  notes,
};

try {
  await page.goto('https://browse.parnoir.com/?view=feed', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  slog('unlock…');
  // Empty public feed can leave brand splash covering chrome — hide it for unlock.
  await page.evaluate(() => {
    document.querySelectorAll('[aria-busy="true"]').forEach((el) => {
      const node = el;
      if (node instanceof HTMLElement) {
        node.style.pointerEvents = 'none';
        node.style.display = 'none';
      }
    });
  });
  await unlockViaPopup(page, () => page.getByTitle('Unlock pN').first().click(), creds);
  await page.waitForTimeout(2_500);
  report.unlocked = await page.getByTitle('Lock pN').first().isVisible().catch(() => false);
  report.steps.push({ id: 'unlock', ok: report.unlocked });
  slog(`unlocked=${report.unlocked}`);
  if (!report.unlocked) throw new Error('unlock failed');

  slog('COOLDOWN 90s after unlock');
  await page.waitForTimeout(90_000);

  const apiBefore = apiBag.length;
  await page.getByTitle('Upload').first().click();
  await page.waitForTimeout(2_500);
  await page.getByTitle('Add Content').first().click({ timeout: 10_000 });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /Add Thought/i }).first().click({ timeout: 10_000 });
  await page.waitForTimeout(1_000);

  const editor = page.getByPlaceholder(/Type your thought/i);
  await editor.first().waitFor({ state: 'visible', timeout: 20_000 });
  await editor.first().fill(MARKER);
  const sendBtn = editor.locator('xpath=following-sibling::button[1]');
  await sendBtn.click({ timeout: 10_000 });
  await page.waitForTimeout(1_500);

  // Metadata modal: pick a category, then Submit
  const cat = page.getByRole('button', { name: /News|Art|Community|Lifestyle/i }).first();
  if (await cat.isVisible().catch(() => false)) await cat.click();
  const submit = page.getByRole('button', { name: /^Submit$/i });
  await submit.first().waitFor({ state: 'visible', timeout: 15_000 });
  await submit.first().click();
  report.steps.push({ id: 'metadata_submit', ok: true });
  await shot('after-submit');

  // Wait for upload queue / feed-media / metadata
  const deadline = Date.now() + 120_000;
  let done = false;
  while (Date.now() < deadline) {
    const slice = apiBag.slice(apiBefore);
    const presign = slice.filter((a) => a.path.includes('/feed-media/presign-upload'));
    const confirm = slice.filter((a) => a.path.includes('/feed-media/confirm-upload'));
    const metaPut = slice.filter(
      (a) => a.method === 'PUT' && a.path.includes('/api/aggregator/metadata-index/')
    );
    const body = await page.locator('body').innerText().catch(() => '');
    const failed =
      /Failed to create thought|feed_poster_required|Invalid URL|presign_failed|feed_r2/i.test(body) ||
      notes.some((n) => /Failed to create thought|Invalid URL|feed_poster/i.test(n));
    if (failed) {
      report.steps.push({
        id: 'outcome',
        ok: false,
        reason: 'error UI or dialog',
        body: body.slice(0, 240).replace(/\s+/g, ' '),
        notes: [...notes],
      });
      done = true;
      break;
    }
    const presignOk = presign.some((a) => a.status >= 200 && a.status < 300);
    const confirmOk = confirm.some((a) => a.status >= 200 && a.status < 300);
    const metaOk = metaPut.some((a) => a.status >= 200 && a.status < 300);
    if (presignOk && confirmOk && metaOk) {
      report.steps.push({
        id: 'outcome',
        ok: true,
        reason: 'presign+confirm+metadata 2xx',
      });
      done = true;
      break;
    }
    const bad =
      presign.some((a) => a.status >= 400) ||
      confirm.some((a) => a.status >= 400) ||
      metaPut.some((a) => a.status >= 400);
    if (bad) {
      report.steps.push({
        id: 'outcome',
        ok: false,
        reason: '4xx on feed-media or metadata',
        presign,
        confirm,
        metaPut,
      });
      done = true;
      break;
    }
    await page.waitForTimeout(2_000);
  }
  if (!done) {
    report.steps.push({
      id: 'outcome',
      ok: false,
      reason: 'timeout waiting for feed-media/metadata',
      apiTail: apiBag.slice(apiBefore).slice(-20),
    });
  }

  await shot('final');
  // Me / own profile check
  await page.getByTitle('Me').first().click().catch(() => {});
  await page.waitForTimeout(3_000);
  const meText = await page.locator('body').innerText().catch(() => '');
  report.steps.push({
    id: 'me_after',
    ok: /thought|QA|likes|all/i.test(meText),
    observed: meText.slice(0, 200).replace(/\s+/g, ' '),
  });
  await shot('me');
} catch (e) {
  report.steps.push({ id: 'fatal', ok: false, error: String(e?.message || e).slice(0, 400) });
  await shot('fatal');
} finally {
  report.api = apiBag.filter(
    (a) =>
      a.path.includes('feed-media') ||
      a.path.includes('metadata-index') ||
      a.path.includes('/api/drive/') ||
      a.path.includes('google-oauth')
  );
  report.oauth = oauth;
  await ctx.close().catch(() => {});
  await browser.close().catch(() => {});
}

const outPath = resolve(OUT, 'report.json');
writeFileSync(outPath, JSON.stringify(report, null, 2));
const outcome = report.steps.find((s) => s.id === 'outcome') || report.steps[report.steps.length - 1];
console.log(JSON.stringify({ outPath, unlocked: report.unlocked, outcome, notes, oauth }, null, 2));
process.exit(outcome?.ok ? 0 : 1);
