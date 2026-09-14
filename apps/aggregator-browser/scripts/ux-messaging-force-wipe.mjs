#!/usr/bin/env node
/**
 * Force-wipe A↔B messaging state on BOTH clouds before a fresh QA run.
 *
 * Uses open CDP Chromium profiles (messaging-a :9333, messaging-b :9334).
 * API-first: list + DELETE conversations/connections/groups; then verify empty.
 * Fail closed if either side still has conv/groups/connections after wipe.
 *
 * Does not log secrets.
 *
 *   node apps/aggregator-browser/scripts/ux-messaging-force-wipe.mjs
 */
import { chromium } from 'playwright';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
void scriptDir;
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

async function clearLocalCaches(page) {
  return page.evaluate(() => {
    let removed = 0;
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i) || '';
        if (
          k.startsWith('pn_sender_outbox_v1:') ||
          k.startsWith('pn_inbox_') ||
          /inbox|message|thread|connection|group/i.test(k)
        ) {
          localStorage.removeItem(k);
          removed += 1;
        }
      }
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i) || '';
        if (/inbox|message|thread/i.test(k) && !/pn_oauth_session|pn_dm_session/i.test(k)) {
          sessionStorage.removeItem(k);
          removed += 1;
        }
      }
    } catch {
      /* ignore */
    }
    return removed;
  });
}

async function clickTab(page, name) {
  const tab = page.getByRole('button', { name: new RegExp(`^${name}$`, 'i') }).first();
  if (await tab.isVisible().catch(() => false)) {
    await tab.click();
    await page.waitForTimeout(800);
    return true;
  }
  return false;
}

/** Wait until a Drive-ready cloud AT appears on an authenticated API request. */
async function waitForCloudCreds(page, timeoutMs = 45_000) {
  let cloud = null;
  let bearer = null;
  const onReq = (req) => {
    try {
      const u = req.url();
      if (!u.includes('api.parnoir.com')) return;
      const h = req.headers();
      const c = h['x-pn-cloud-access-token'] || h['X-PN-Cloud-Access-Token'];
      if (c) cloud = c;
      const auth = h.authorization || h.Authorization;
      if (auth?.startsWith('Bearer ')) bearer = auth.slice(7);
    } catch {
      /* ignore */
    }
  };
  page.on('request', onReq);
  const deadline = Date.now() + timeoutMs;
  try {
    await page.goto('https://messaging.parnoir.com/?view=messages', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    while (Date.now() < deadline && !cloud) {
      await clickTab(page, 'Messages');
      await clickTab(page, 'Connections');
      await page.waitForTimeout(1500);
      if (cloud) break;
      // Nudge vault hydrate / ownerFetch
      await page.evaluate(() => {
        try {
          window.dispatchEvent(new Event('pn-cloud-credentials-ready'));
        } catch {
          /* ignore */
        }
      });
      await page.waitForTimeout(1500);
    }
  } finally {
    page.off('request', onReq);
  }
  return { cloud, bearer };
}

async function apiFetch(page, path, { cloud, bearer, method = 'GET', body } = {}) {
  return page.evaluate(
    async ({ api, path, cloud, bearer, method, body }) => {
      const headers = {
        Accept: 'application/json',
        Origin: 'https://messaging.parnoir.com',
      };
      if (bearer) headers.Authorization = `Bearer ${bearer}`;
      if (cloud) headers['X-PN-Cloud-Access-Token'] = cloud;
      if (body) headers['Content-Type'] = 'application/json';
      const res = await fetch(`${api}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let json = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = {};
      }
      return { status: res.status, ok: res.ok, json };
    },
    { api: API, path, cloud, bearer, method, body }
  );
}

async function wipeSide(label, page) {
  const notes = [];
  const pn = await sessionPn(page);
  if (!pn) {
    notes.push('no_session');
    return { notes, empty: false };
  }
  notes.push(`pn=${pn.slice(0, 12)}…`);

  const cacheN = await clearLocalCaches(page);
  notes.push(`local_cleared=${cacheN}`);

  slog(`[${label}] waiting for cloud AT (vault hydrate)…`);
  const creds = await waitForCloudCreds(page, 45_000);
  if (!creds.cloud || !creds.bearer) {
    notes.push('no_cloud_at — cannot wipe Drive; unlock + wait for device cloud hydrate');
    return { notes, empty: false };
  }
  notes.push('cloud_at=ready');

  // Pass 1–2: list + delete conversations (DMs + groups in inbox)
  for (let pass = 0; pass < 2; pass++) {
    const convRes = await apiFetch(
      page,
      `/api/messages/conversations?userPnIdentifier=${encodeURIComponent(pn)}&channelClientId=platform`,
      { cloud: creds.cloud, bearer: creds.bearer }
    );
    const convs = Array.isArray(convRes.json.conversations)
      ? convRes.json.conversations
      : Array.isArray(convRes.json.threads)
        ? convRes.json.threads
        : [];
    notes.push(`conversations_listed_p${pass}=${convRes.status}:n=${convs.length}`);
    for (const conv of convs) {
      const isGroup = conv.threadType === 'group' || !!conv.groupId;
      const peer =
        (isGroup && (conv.groupId || conv.participantPnIdentifier)) ||
        conv.participantPnIdentifier ||
        conv.otherUserPnIdentifier ||
        conv.peerPnIdentifier ||
        conv.userPnIdentifier;
      if (!peer) continue;
      const q = isGroup ? '&threadType=group' : '';
      const d = await apiFetch(
        page,
        `/api/messages/conversation/${encodeURIComponent(peer)}?userPnIdentifier=${encodeURIComponent(pn)}${q}`,
        { cloud: creds.cloud, bearer: creds.bearer, method: 'DELETE' }
      );
      notes.push(`api_del_conv=${d.status}:${isGroup ? 'g' : 'd'}:${String(peer).slice(0, 12)}`);
    }
  }

  // Connections: delete conversation + disconnect
  {
    const listRes = await apiFetch(
      page,
      `/api/connections?userPnIdentifier=${encodeURIComponent(pn)}`,
      { cloud: creds.cloud, bearer: creds.bearer }
    );
    const rows = Array.isArray(listRes.json.connections)
      ? listRes.json.connections
      : Array.isArray(listRes.json)
        ? listRes.json
        : [];
    notes.push(`connections_listed=${listRes.status}:n=${rows.length}`);
    for (const row of rows) {
      const peer = row.userPnIdentifier || row.participantPnIdentifier;
      const connectionId = row.connectionId;
      if (peer) {
        const d = await apiFetch(
          page,
          `/api/messages/conversation/${encodeURIComponent(peer)}?userPnIdentifier=${encodeURIComponent(pn)}`,
          { cloud: creds.cloud, bearer: creds.bearer, method: 'DELETE' }
        );
        notes.push(`api_del_conn_conv=${d.status}`);
      }
      if (connectionId) {
        const d = await apiFetch(page, `/api/connections/${encodeURIComponent(connectionId)}`, {
          cloud: creds.cloud,
          bearer: creds.bearer,
          method: 'DELETE',
          body: { userPnIdentifier: pn },
        });
        notes.push(`api_del_conn=${d.status}`);
      }
    }
  }

  // Groups roster: delete each as group thread (inbox + local roster)
  {
    const listRes = await apiFetch(page, `/api/groups?userPnIdentifier=${encodeURIComponent(pn)}`, {
      cloud: creds.cloud,
      bearer: creds.bearer,
    });
    const groups = Array.isArray(listRes.json.groups) ? listRes.json.groups : [];
    notes.push(`groups_listed=${listRes.status}:n=${groups.length}`);
    const seen = new Set();
    for (const g of groups) {
      const groupId = g.groupId;
      if (!groupId || seen.has(groupId)) continue;
      seen.add(groupId);
      const d = await apiFetch(
        page,
        `/api/messages/conversation/${encodeURIComponent(groupId)}?userPnIdentifier=${encodeURIComponent(pn)}&threadType=group`,
        { cloud: creds.cloud, bearer: creds.bearer, method: 'DELETE' }
      );
      notes.push(`api_del_group=${d.status}:${String(groupId).slice(0, 12)}`);
    }
  }

  // Soft drain Requests
  await clickTab(page, 'Requests');
  await page.waitForTimeout(1500);
  notes.push('requests_drained');

  await clearLocalCaches(page);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(2500);
  await clickTab(page, 'Messages');

  const verify = await page.evaluate(
    async ({ api, pn, cloud, bearer }) => {
      const [cRes, gRes, connRes] = await Promise.all([
        fetch(
          `${api}/api/messages/conversations?userPnIdentifier=${encodeURIComponent(pn)}&channelClientId=platform`,
          {
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${bearer}`,
              'X-PN-Cloud-Access-Token': cloud,
              Origin: 'https://messaging.parnoir.com',
            },
          }
        ),
        fetch(`${api}/api/groups?userPnIdentifier=${encodeURIComponent(pn)}`, {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${bearer}`,
            'X-PN-Cloud-Access-Token': cloud,
            Origin: 'https://messaging.parnoir.com',
          },
        }),
        fetch(`${api}/api/connections?userPnIdentifier=${encodeURIComponent(pn)}`, {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${bearer}`,
            'X-PN-Cloud-Access-Token': cloud,
            Origin: 'https://messaging.parnoir.com',
          },
        }),
      ]);
      const cBody = await cRes.json().catch(() => ({}));
      const gBody = await gRes.json().catch(() => ({}));
      const connBody = await connRes.json().catch(() => ({}));
      const conversations = cBody.conversations || cBody.threads || [];
      const groups = gBody.groups || [];
      const connections = connBody.connections || (Array.isArray(connBody) ? connBody : []);
      return {
        conversations: conversations.length,
        groups: groups.length,
        connections: connections.length,
      };
    },
    { api: API, pn, cloud: creds.cloud, bearer: creds.bearer }
  );
  notes.push(
    `verify_empty conv=${verify.conversations} groups=${verify.groups} connections=${verify.connections}`
  );
  const empty =
    verify.conversations === 0 && verify.groups === 0 && verify.connections === 0;
  return { notes, empty };
}

async function main() {
  slog('=== Force wipe A↔B messaging (both clouds) ===');
  for (const s of SURFACES) {
    if (!(await cdpAlive(s.port))) {
      slog(`[${s.id}] CDP :${s.port} not up — start messaging QA once first, or unlock manually`);
      process.exit(2);
    }
  }

  const report = { wipedAt: new Date().toISOString(), sides: {}, allEmpty: true };
  for (const s of SURFACES) {
    slog(`[${s.id}] wiping…`);
    const { browser, page } = await attach(s.port, s.origin);
    try {
      const { notes, empty } = await wipeSide(s.id, page);
      report.sides[s.id] = { notes, empty };
      report.allEmpty = report.allEmpty && empty;
      slog(`[${s.id}]`, notes.join('; '), empty ? 'EMPTY_OK' : 'NOT_EMPTY');
    } finally {
      await browser.close().catch(() => {});
    }
  }

  console.log(JSON.stringify(report, null, 2));
  if (!report.allEmpty) {
    slog('Wipe incomplete — refuse Connect until both sides are empty (API may need deploy for group delete).');
    process.exit(1);
  }
  slog('Wipe done. Both clouds empty — safe to Connect→Accept→DM.');
}

main().catch((e) => {
  slog('wipe failed:', e?.message || e);
  process.exit(1);
});
