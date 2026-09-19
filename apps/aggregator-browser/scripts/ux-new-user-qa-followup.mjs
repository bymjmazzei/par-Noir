#!/usr/bin/env node
/**
 * Follow-up: browse upload via Add Content menu, then OAuth authorize+revoke.
 * Uses cursor-test-pn. No Drive reconnect. No fixture overwrite.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, writeSync, readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  loadTestPn,
  trackOAuth,
  trackApi,
  unlockViaPopup,
  unlockDashboard,
  fillConsentAndUnlock,
} from './ux-unlock-lib.mjs';

function slog(...a) {
  writeSync(2, a.join(' ') + '\n');
}
const scriptDir = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.REPO_ROOT || resolve(scriptDir, '../../..');
const OUT = resolve(ROOT, '.local/ux-playwright/new-user');
mkdirSync(OUT, { recursive: true });
const creds = loadTestPn(ROOT);
const COOLDOWN = Number(process.env.PN_QA_UNLOCK_COOLDOWN_MS || 90_000);
const MARKER = `QA cursor thought ${Date.now().toString(36)}`;
const CLIENT_ID = process.env.QA_OAUTH_CLIENT_ID || 'qa-cursor-mu4c45j9';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function shot(page, id) {
  const path = resolve(OUT, `${id}.png`);
  await page.screenshot({ path, fullPage: false }).catch(() => {});
  return path;
}

const rows = [];
function row(id, label, observed, extra = {}) {
  const r = { id, label, observed, evidence: 'OBSERVED', ...extra };
  rows.push(r);
  slog(`  ${id} → ${label} | ${String(observed).slice(0, 140)}`);
  return r;
}

const browser = await chromium.launch({ headless: true });

/* ---- browse upload + me + engage ---- */
{
  const apiBag = [];
  const oauth = { challenge: false, authenticate: false, token: false, userinfo: false };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  trackOAuth(page, oauth);
  trackApi(page, apiBag);
  try {
    await page.goto('https://browse.parnoir.com/?view=feed', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await unlockViaPopup(page, () => page.getByTitle('Unlock pN').first().click(), creds);
    await page.waitForTimeout(2_000);
    const lock = await page.getByTitle('Lock pN').first().isVisible().catch(() => false);
    row('browse.unlock.followup', lock ? 'LIVE_REAL' : 'BLOCKED', lock ? 'relocked session' : 'unlock failed');
    slog(`COOLDOWN ${COOLDOWN}ms`);
    await sleep(COOLDOWN);

    await page.getByTitle('Upload').first().click();
    await page.waitForTimeout(2_500);
    const addContent = page.getByTitle('Add Content');
    const plusVisible = await addContent.first().isVisible().catch(() => false);
    if (plusVisible) await addContent.first().click();
    await page.waitForTimeout(800);
    const thought = page.getByRole('button', { name: /Add Thought/i });
    const thoughtVisible = await thought.first().isVisible().catch(() => false);
    if (thoughtVisible) await thought.first().click();
    await page.waitForTimeout(1_200);
    await shot(page, 'browse.upload.add-content');

    const editor = page.getByPlaceholder(/Type your thought/i);
    const editorVis = await editor.first().isVisible().catch(() => false);
    if (editorVis) {
      await editor.first().fill(`${MARKER}. Live QA — ignore.`);
      const send = editor.locator('xpath=following-sibling::button[1]');
      if (await send.isVisible().catch(() => false)) await send.click();
      await page.waitForTimeout(1_200);
      const cat = page.getByRole('button', { name: /Art|Music|General|Other|News|Tech/i }).first();
      if (await cat.isVisible().catch(() => false)) await cat.click();
      const save = page.getByRole('button', { name: /Save Changes|Save|Post|Publish/i });
      if (await save.first().isVisible().catch(() => false)) await save.first().click();
      await page.waitForTimeout(8_000);
    }
    const body = await page.locator('body').innerText().catch(() => '');
    const posted = /queued|complete|upload|thought/i.test(body) && editorVis;
    row(
      'browse.upload.thought.followup',
      posted ? 'LIVE_REAL' : thoughtVisible ? 'LIVE_UNFINISHED' : 'BLOCKED',
      `plus=${plusVisible} addThought=${thoughtVisible} editor=${editorVis} body=${body.slice(0, 160).replace(/\s+/g, ' ')}`,
      { api: apiBag.slice(-12) }
    );
    await shot(page, 'browse.upload.after-thought');

    await page.getByTitle('Me').first().click();
    await page.waitForTimeout(2_500);
    const meText = await page.locator('body').innerText().catch(() => '');
    const meChrome = /likes|comments|shares|saved|connections|all\b/i.test(meText) && !/DISCOVER/.test(meText);
    const meHasMarker = meText.includes(MARKER.split(' ')[0]) || /thought/i.test(meText);
    row(
      'browse.me.followup',
      meChrome ? 'LIVE_REAL' : 'LIVE_UNFINISHED',
      meChrome ? `Me profile chrome; marker=${meHasMarker}` : meText.slice(0, 180).replace(/\s+/g, ' ')
    );
    await shot(page, 'browse.me.followup');

    await page.getByTitle('Home').first().click();
    await page.waitForTimeout(1_500);
    const like = page.getByTitle('Like').first();
    const likeVis = await like.isVisible().catch(() => false);
    if (likeVis) {
      await like.click();
      await page.waitForTimeout(1_000);
    }
    row(
      'browse.engage.like.followup',
      likeVis ? 'LIVE_REAL' : 'LIVE_UNFINISHED',
      likeVis ? 'clicked Like after upload attempt' : 'Like still not on home (empty public feed)'
    );
    await shot(page, 'browse.engage.followup');
  } catch (e) {
    row('browse.followup', 'BLOCKED', String(e?.message || e).slice(0, 280));
  } finally {
    await ctx.close().catch(() => {});
  }
}

/* ---- OAuth authorize throwaway client ---- */
{
  slog(`COOLDOWN ${COOLDOWN}ms before oauth authorize`);
  await sleep(COOLDOWN);
  const apiBag = [];
  const oauth = { challenge: false, authenticate: false, token: false, userinfo: false };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  trackOAuth(page, oauth);
  trackApi(page, apiBag);
  try {
    const redirect = 'https://localhost/oauth-callback.html';
    const url =
      `https://api.parnoir.com/oauth/authorize?response_type=code&client_id=${encodeURIComponent(CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(redirect)}&scope=${encodeURIComponent('openid profile cloud:app')}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await fillConsentAndUnlock(page, { ...creds, expectClose: false });
    await page.waitForTimeout(4_000);
    const loc = page.url();
    const hasCode = /[?&]code=/.test(loc);
    const err = /error=/i.test(loc);
    row(
      'developer.oauth.authorize.followup',
      hasCode ? 'LIVE_REAL' : err ? 'BLOCKED' : 'LIVE_UNFINISHED',
      `url_host=${(() => { try { return new URL(loc).host + new URL(loc).pathname; } catch { return 'unparseable'; } })()} code=${hasCode} err=${err}`,
      { api: apiBag.slice(-10) }
    );
    await shot(page, 'developer.oauth.authorize.followup');
  } catch (e) {
    row('developer.oauth.authorize.followup', 'BLOCKED', String(e?.message || e).slice(0, 280));
  } finally {
    await ctx.close().catch(() => {});
  }
}

/* ---- dashboard revoke ---- */
{
  slog(`COOLDOWN ${COOLDOWN}ms before dashboard revoke`);
  await sleep(COOLDOWN);
  const apiBag = [];
  const notes = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  trackApi(page, apiBag);
  try {
    await page.goto('https://pn.parnoir.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await unlockDashboard(page, notes, creds);
    await page.waitForTimeout(2_000);
    await page.getByRole('button', { name: 'Privacy & Sharing' }).click();
    await page.waitForTimeout(2_000);
    const revoke = page.getByRole('button', { name: /Revoke Access/i });
    const hasRevoke = await revoke.first().isVisible().catch(() => false);
    if (hasRevoke) {
      await revoke.first().click();
      await page.waitForTimeout(1_500);
    }
    const text = await page.locator('body').innerText().catch(() => '');
    row(
      'developer.oauth.revoke.followup',
      hasRevoke ? 'LIVE_REAL' : 'LIVE_UNFINISHED',
      hasRevoke ? 'clicked Revoke Access' : 'no Revoke Access on Privacy after authorize attempt',
      { api: apiBag.slice(-12) }
    );
    await shot(page, 'dashboard.privacy.revoke.followup');
  } catch (e) {
    row('developer.oauth.revoke.followup', 'BLOCKED', String(e?.message || e).slice(0, 280));
  } finally {
    await ctx.close().catch(() => {});
  }
}

await browser.close();
const followPath = resolve(OUT, 'followup-report.json');
writeFileSync(followPath, JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));
console.log(JSON.stringify({ followPath, rows }, null, 2));
void existsSync;
void readFileSync;
