#!/usr/bin/env node
/**
 * Force-wipe A↔B messaging state on BOTH clouds before a fresh QA run.
 *
 * Uses open CDP Chromium profiles (messaging-a :9333, messaging-b :9334).
 * For each side: delete all DM conversations, disconnect all connections,
 * clear local sealed outbox, soft-drain Requests (acks via app).
 *
 * Does not log secrets.
 *
 *   node apps/aggregator-browser/scripts/ux-messaging-force-wipe.mjs
 */
import { chromium } from 'playwright';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const API = 'https://api.parnoir.com';

const SURFACES = [
  { id: 'messaging-a', port: 9333, origin: 'https://messaging.parnoir.com/' },
  { id: 'messaging-b', port: 9334, origin: 'https://messaging.parnoir.com/' },
];

function slog(...a) {
  process.stderr.write(a.join(' ') + '\n');
}

async function cdpAlive(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(800),
    });
    return res.ok;
  } catch {
    return false;
  }
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
    context.pages()[0] ||
    (await context.newPage());
  if (!page.url().includes(new URL(origin).host)) {
    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  }
  return { browser, page };
}

async function sessionPn(page) {
  return page.evaluate(() => {
    try {
      const raw = sessionStorage.getItem('pn_oauth_session');
      if (!raw) return null;
      const s = JSON.parse(raw);
      return s.pnIdentifier || null;
    } catch {
      return null;
    }
  });
}

async function clearLocalOutbox(page) {
  return page.evaluate(() => {
    const removed = [];
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i) || '';
        if (k.startsWith('pn_sender_outbox_v1:')) {
          localStorage.removeItem(k);
          removed.push(k.slice(0, 28));
        }
      }
    } catch {
      /* ignore */
    }
    return removed.length;
  });
}

async function clickTab(page, name) {
  const tab = page.getByRole('button', { name: new RegExp(`^${name}$`, 'i') }).first();
  if (await tab.isVisible().catch(() => false)) {
    await tab.click();
    await page.waitForTimeout(1500);
    return true;
  }
  return false;
}

/** Capture cloud AT from the next authenticated API response after an action. */
async function withCloudHeader(page, action) {
  let cloud = null;
  let bearer = null;
  const onReq = (req) => {
    try {
      const u = req.url();
      if (!u.includes('api.parnoir.com')) return;
      const h = req.headers();
      cloud = h['x-pn-cloud-access-token'] || h['X-PN-Cloud-Access-Token'] || cloud;
      const auth = h.authorization || h.Authorization;
      if (auth?.startsWith('Bearer ')) bearer = auth.slice(7);
    } catch {
      /* ignore */
    }
  };
  page.on('request', onReq);
  try {
    await action();
    await page.waitForTimeout(2000);
  } finally {
    page.off('request', onReq);
  }
  return { cloud, bearer };
}

async function apiDelete(page, path, { cloud, bearer, body }) {
  const headers = {
    Accept: 'application/json',
    Origin: 'https://messaging.parnoir.com',
  };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  if (cloud) headers['X-PN-Cloud-Access-Token'] = cloud;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await page.request.fetch(`${API}${path}`, {
    method: 'DELETE',
    headers,
    data: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status(), ok: res.ok() };
}

async function wipeSide(label, page) {
  const notes = [];
  const pn = await sessionPn(page);
  if (!pn) {
    notes.push('no_session');
    return notes;
  }
  notes.push(`pn=${pn.slice(0, 12)}…`);

  const outboxN = await clearLocalOutbox(page);
  notes.push(`outbox_cleared=${outboxN}`);

  const creds = await withCloudHeader(page, async () => {
    await clickTab(page, 'Messages');
    await clickTab(page, 'Connections');
  });
  if (!creds.cloud) {
    notes.push('no_cloud_at — UI wipe only');
  }

  // Delete every DM conversation visible in Messages (menu → Delete).
  await clickTab(page, 'Messages');
  await page.waitForTimeout(2000);
  for (let pass = 0; pass < 15; pass++) {
    const menus = page.locator('button[aria-label="Menu"]');
    const n = await menus.count();
    if (n === 0) break;
    await menus.first().click();
    await page.waitForTimeout(400);
    const del = page.getByRole('button', { name: /Delete/i }).first();
    if (!(await del.isVisible().catch(() => false))) {
      await page.keyboard.press('Escape').catch(() => {});
      break;
    }
    const delPromise = page
      .waitForResponse(
        (r) => r.request().method() === 'DELETE' && /\/api\/messages\/conversation\//.test(r.url()),
        { timeout: 20_000 }
      )
      .catch(() => null);
    await del.click();
    const confirm = page.getByRole('button', { name: /^(Delete|Confirm|Yes)$/i }).first();
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    const res = await delPromise;
    notes.push(
      res
        ? `delete_conversation=${res.status()}`
        : 'delete_conversation=clicked_no_response'
    );
    await page.waitForTimeout(1500);
  }

  // Also DELETE via API for every connection peer (covers empty inbox / missed UI).
  if (creds.cloud && creds.bearer) {
    const listRes = await page.request.get(
      `${API}/api/connections?userPnIdentifier=${encodeURIComponent(pn)}`,
      {
        headers: {
          Authorization: `Bearer ${creds.bearer}`,
          'X-PN-Cloud-Access-Token': creds.cloud,
          Origin: 'https://messaging.parnoir.com',
          Accept: 'application/json',
        },
      }
    );
    const listBody = await listRes.json().catch(() => ({}));
    const rows = Array.isArray(listBody.connections)
      ? listBody.connections
      : Array.isArray(listBody)
        ? listBody
        : [];
    notes.push(`connections_listed=${listRes.status()}:n=${rows.length}`);
    for (const row of rows) {
      const peer = row.userPnIdentifier || row.participantPnIdentifier;
      const connectionId = row.connectionId;
      if (peer) {
        const d = await apiDelete(
          page,
          `/api/messages/conversation/${encodeURIComponent(peer)}?userPnIdentifier=${encodeURIComponent(pn)}`,
          { cloud: creds.cloud, bearer: creds.bearer }
        );
        notes.push(`api_del_conv=${d.status}`);
      }
      if (connectionId) {
        const d = await apiDelete(page, `/api/connections/${encodeURIComponent(connectionId)}`, {
          cloud: creds.cloud,
          bearer: creds.bearer,
          body: { userPnIdentifier: pn },
        });
        notes.push(`api_del_conn=${d.status}`);
      }
    }
  }

  // UI Disconnect leftovers
  await clickTab(page, 'Connections');
  await page.waitForTimeout(1000);
  for (let i = 0; i < 10; i++) {
    const btn = page.getByRole('button', { name: /^Disconnect$/i }).first();
    if (!(await btn.isVisible().catch(() => false))) break;
    const delPromise = page
      .waitForResponse(
        (r) => r.request().method() === 'DELETE' && /\/api\/connections\//.test(r.url()),
        { timeout: 15_000 }
      )
      .catch(() => null);
    await btn.click();
    const res = await delPromise;
    notes.push(res ? `ui_disconnect=${res.status()}` : 'ui_disconnect=clicked');
    await page.waitForTimeout(1500);
  }

  // Soft drain Requests so pending mailbox jobs get a chance to ack/fail visibly
  await clickTab(page, 'Requests');
  await page.waitForTimeout(2500);
  notes.push('requests_drained');

  return notes;
}

async function main() {
  slog('=== Force wipe A↔B messaging (both clouds) ===');
  for (const s of SURFACES) {
    if (!(await cdpAlive(s.port))) {
      slog(`[${s.id}] CDP :${s.port} not up — start messaging QA once first, or unlock manually`);
      process.exit(2);
    }
  }

  const report = { wipedAt: new Date().toISOString(), sides: {} };
  for (const s of SURFACES) {
    slog(`[${s.id}] wiping…`);
    const { browser, page } = await attach(s.port, s.origin);
    try {
      const notes = await wipeSide(s.id, page);
      report.sides[s.id] = notes;
      slog(`[${s.id}]`, notes.join('; '));
    } finally {
      await browser.close().catch(() => {});
    }
  }

  console.log(JSON.stringify(report, null, 2));
  slog('Wipe done. Re-run ux-messaging-qa.mjs — it must Connect→Accept→DM from empty state.');
}

main().catch((e) => {
  slog('wipe failed:', e?.message || e);
  process.exit(1);
});
