#!/usr/bin/env node
/**
 * Messaging workflow QA with .local/test-pn-2 (Drive-connected live-created pN).
 * Playwright Chromium only. No secrets logged.
 *
 *   node scripts/ux-messaging-qa.mjs
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

// Prefer test-pn-2 (Drive-connected)
const PN2 = resolve(ROOT, '.local/test-pn-2');
function loadPn2() {
  const keysPath = resolve(PN2, 'keys.env');
  if (!existsSync(keysPath)) throw new Error('Missing .local/test-pn-2/keys.env');
  const keys = readFileSync(keysPath, 'utf8');
  const PN_NAME = keys.match(/^PN_NAME=(.+)$/m)?.[1]?.trim();
  const PASSCODE = keys.match(/^PASSCODE=(.+)$/m)?.[1]?.trim();
  const fileName = keys.match(/^IDENTITY_FILE=(.+)$/m)?.[1]?.trim() || 'live-created.pn';
  const identityPath = resolve(PN2, fileName);
  if (!existsSync(identityPath)) {
    const alt = resolve(PN2, 'live-created.pn');
    if (!existsSync(alt)) throw new Error('Missing test-pn-2 identity file');
    return { identityPath: alt, PN_NAME, PASSCODE };
  }
  if (!PN_NAME || !PASSCODE) throw new Error('keys.env incomplete');
  return { identityPath, PN_NAME, PASSCODE };
}

const creds = loadPn2();

function slog(...a) {
  process.stderr.write(a.join(' ') + '\n');
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

function summarizeApi(apiBag, since) {
  return apiBag.slice(since).map((a) => `${a.method} ${a.path} ${a.status}`);
}

function hasOk(apiSlice, pathSub) {
  return apiSlice.some((a) => a.path.includes(pathSub) && a.status >= 200 && a.status < 400);
}

const browser = await chromium.launch({ headless: true });
const report = {
  generatedAt: new Date().toISOString(),
  fixture: 'test-pn-2',
  identityFile: creds.identityPath,
  apps: [],
};

async function unlockMessaging(page, oauth) {
  const unlockClick = async (p) => {
    const byTitle = p.getByTitle('Unlock pN');
    if (await byTitle.first().isVisible().catch(() => false)) {
      await byTitle.first().click();
      return;
    }
    await p.getByRole('button', { name: /Unlock pN/i }).first().click();
  };
  await unlockViaPopup(page, unlockClick, creds);
  return (
    oauth.token ||
    oauth.userinfo ||
    (await page.getByTitle('Lock pN').first().isVisible().catch(() => false))
  );
}

async function runMessaging() {
  const oauth = { challenge: false, authenticate: false, token: false, userinfo: false };
  const apiBag = [];
  const flows = [];
  const notes = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  trackOAuth(page, oauth);
  trackApi(page, apiBag);

  const result = {
    app: 'messaging',
    url: 'https://messaging.parnoir.com/',
    unlocked: false,
    oauth,
    flows,
    notes,
    blocked: null,
  };

  try {
    await page.goto(result.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await shot(page, '01-load');
    slog('UNLOCK messaging…');
    result.unlocked = !!(await unlockMessaging(page, oauth));
    slog('unlocked=', result.unlocked, 'oauth=', JSON.stringify(oauth));
    await shot(page, '02-after-unlock');
    if (!result.unlocked) {
      result.blocked = 'unlock failed';
      return result;
    }

    // Wait for any post-unlock bootstrap (cloud headers, mailbox)
    await page.waitForTimeout(4000);
    const afterUnlockApi = summarizeApi(apiBag, 0);
    flows.push({
      id: 'messaging.unlock_bootstrap',
      title: 'Post-unlock API bootstrap',
      label: hasOk(apiBag, '/oauth/') || hasOk(apiBag, '/api/')
        ? 'LIVE_REAL'
        : 'LIVE_UNFINISHED',
      api: afterUnlockApi.slice(-25),
      notes: [],
    });

    const tabs = [
      ['Messages', 'tab.messages', ['/api/messages', '/api/mailbox']],
      ['Notifications', 'tab.notifications', ['/api/notifications']],
      ['Requests', 'tab.requests', ['/api/messages', '/api/connections']],
    ];
    for (const [name, id, pathHints] of tabs) {
      const before = apiBag.length;
      const clicked = await clickTab(page, name);
      await page.waitForTimeout(1500);
      const slice = apiBag.slice(before);
      const body = await page.locator('body').innerText().catch(() => '');
      const empty = /no (messages|notifications|requests)|empty|inbox/i.test(body);
      const hit = pathHints.some((h) => slice.some((a) => a.path.includes(h)));
      const ok = slice.some((a) => a.status >= 200 && a.status < 500);
      let label = 'BLOCKED';
      if (clicked && (hit || ok || empty)) label = hit && slice.some((a) => a.status < 400) ? 'LIVE_REAL' : 'LIVE_UNFINISHED';
      if (!clicked) label = 'BLOCKED';
      flows.push({
        id: `messaging.${id}`,
        title: `Inbox tab ${name}`,
        label,
        visible: clicked,
        api: summarizeApi(apiBag, before),
        notes: [empty ? 'empty-state UI' : 'content or chrome present'],
        screenshot: await shot(page, `tab-${name.toLowerCase()}`),
      });
      slog(`  ${name} → ${label}`);
    }

    // Connections / followers
    {
      const before = apiBag.length;
      const clicked =
        (await clickTab(page, 'Connections')) ||
        (await page.getByRole('button', { name: /Followers|Following/i }).first().isVisible().catch(() => false));
      if (clicked && (await page.getByRole('button', { name: /Followers|Following|Connections/i }).first().isVisible())) {
        await page.getByRole('button', { name: /Connections|Followers|Following/i }).first().click().catch(() => {});
      }
      await page.waitForTimeout(1500);
      const slice = apiBag.slice(before);
      const hit = slice.some((a) => a.path.includes('/api/connections'));
      flows.push({
        id: 'messaging.connections',
        title: 'Connections',
        label: hit ? 'LIVE_REAL' : clicked ? 'LIVE_UNFINISHED' : 'BLOCKED',
        api: summarizeApi(apiBag, before),
        screenshot: await shot(page, 'connections'),
      });
      slog('  Connections →', flows[flows.length - 1].label);
    }

    // New group modal open-only
    {
      const before = apiBag.length;
      const opened =
        (await page.getByRole('button', { name: /New group|Create group/i }).first().isVisible().catch(() => false)) &&
        (await page.getByRole('button', { name: /New group|Create group/i }).first().click().then(() => true).catch(() => false));
      await page.waitForTimeout(800);
      flows.push({
        id: 'messaging.group_create_open',
        title: 'New group modal (open only)',
        label: opened ? 'LIVE_REAL' : 'BLOCKED',
        api: summarizeApi(apiBag, before),
        notes: ['no submit'],
        screenshot: await shot(page, 'group-modal'),
      });
      await page.keyboard.press('Escape').catch(() => {});
      slog('  group modal →', flows[flows.length - 1].label);
    }

    // Compose / send affordance (do not send without peer)
    {
      const compose =
        (await page.getByPlaceholder(/message|type|write/i).first().isVisible().catch(() => false)) ||
        (await page.getByRole('textbox').first().isVisible().catch(() => false));
      flows.push({
        id: 'messaging.compose_affordance',
        title: 'Message compose affordance',
        label: compose ? 'LIVE_REAL' : 'LIVE_UNFINISHED',
        notes: ['no send — no second peer in this pass'],
        screenshot: await shot(page, 'compose'),
      });
      slog('  compose →', flows[flows.length - 1].label);
    }

    // Cloud / custody signals in network for this session
    const cloudPaths = apiBag.filter(
      (a) =>
        a.path.includes('cloud-vault') ||
        a.path.includes('/storage/credentials') ||
        a.path.includes('layout') ||
        a.path.includes('mailbox')
    );
    flows.push({
      id: 'messaging.cloud_custody_traffic',
      title: 'Cloud custody / mailbox API during session',
      label: cloudPaths.some((a) => a.status >= 200 && a.status < 400)
        ? 'LIVE_REAL'
        : cloudPaths.length
          ? 'LIVE_UNFINISHED'
          : 'BLOCKED',
      api: cloudPaths.slice(-20).map((a) => `${a.method} ${a.path} ${a.status}`),
      notes: [
        cloudPaths.length
          ? `${cloudPaths.length} custody/mailbox calls`
          : 'no cloud-vault/credentials/mailbox traffic observed',
      ],
    });

    // Lock control
    flows.push({
      id: 'messaging.lock',
      title: 'Lock pN',
      label: (await page.getByTitle('Lock pN').isVisible().catch(() => false)) ? 'LIVE_REAL' : 'BLOCKED',
    });

    result.apiSample = apiBag.slice(-40);
  } catch (e) {
    result.blocked = String(e?.message || e).slice(0, 400);
    notes.push(result.blocked);
    await shot(page, 'error');
  } finally {
    await context.close().catch(() => {});
  }
  return result;
}

async function runBrowseSpotCheck() {
  // Light check: unlock browse with same pN — feed/inbox with custody
  const oauth = { challenge: false, authenticate: false, token: false, userinfo: false };
  const apiBag = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  trackOAuth(page, oauth);
  trackApi(page, apiBag);
  const result = { app: 'browse', url: 'https://browse.parnoir.com/?view=feed', unlocked: false, flows: [], oauth };
  try {
    await page.goto(result.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await unlockViaPopup(page, (p) => p.getByTitle('Unlock pN').first().click(), creds);
    result.unlocked =
      oauth.token ||
      oauth.userinfo ||
      (await page.getByTitle('Lock pN').first().isVisible().catch(() => false));
    await page.waitForTimeout(3000);
    const inbox = await page.getByTitle('Inbox').isVisible().catch(() => false);
    if (inbox) {
      await page.getByTitle('Inbox').click();
      await page.waitForTimeout(2000);
    }
    result.flows.push({
      id: 'browse.unlock_inbox',
      title: 'Browse unlock + open Inbox',
      label: result.unlocked ? 'LIVE_REAL' : 'BLOCKED',
      api: summarizeApi(apiBag, 0).slice(-20),
      screenshot: await shot(page, 'browse-inbox'),
    });
  } catch (e) {
    result.blocked = String(e?.message || e).slice(0, 300);
  } finally {
    await context.close().catch(() => {});
  }
  return result;
}

slog('Using fixture', creds.identityPath);
report.apps.push(await runMessaging());
report.apps.push(await runBrowseSpotCheck());
await browser.close();

const outPath = resolve(OUT, 'messaging-qa-report.json');
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      outPath,
      summary: report.apps.map((a) => ({
        app: a.app,
        unlocked: a.unlocked,
        flows: (a.flows || []).map((f) => ({ id: f.id, label: f.label })),
      })),
    },
    null,
    2
  )
);
