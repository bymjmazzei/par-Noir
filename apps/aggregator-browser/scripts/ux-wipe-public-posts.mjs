#!/usr/bin/env node
/**
 * Wipe public aggregator posts for BOTH test fixtures (user asked):
 *   .local/test-pn + .local/cursor-test-pn
 *
 * Unlocks browse for each, then:
 * 1) Lists that owner's public rows via Me/creator filter on metadata-index pages
 * 2) DELETE /api/aggregator/metadata-index/:fileId for each (Drive + index cleanup)
 * 3) DELETE /api/aggregator/metadata-index/user/:pn as a final aggregator purge
 *
 * Does not log secrets / pn names / passcodes.
 *
 *   node apps/aggregator-browser/scripts/ux-wipe-public-posts.mjs
 */
import { chromium } from 'playwright';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadPnFixture, unlockViaPopup } from './ux-unlock-lib.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.REPO_ROOT || resolve(scriptDir, '../../..');
const BROWSE = process.env.BROWSE_URL || 'https://browse.parnoir.com';
const API = process.env.API_ENDPOINT || 'https://api.parnoir.com';

const FIXTURES = ['test-pn', 'cursor-test-pn'];

function slog(...a) {
  process.stderr.write(a.join(' ') + '\n');
}

function hashHint(pn) {
  if (!pn || typeof pn !== 'string') return 'none';
  const bare = pn.startsWith('pn-') ? pn.slice(3) : pn;
  return `${bare.slice(0, 6)}…${bare.slice(-4)} (len=${bare.length})`;
}

async function waitForSession(page, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await page.evaluate(() => {
      try {
        const raw = sessionStorage.getItem('pn_oauth_session');
        if (!raw) return null;
        const j = JSON.parse(raw);
        return {
          pn: j.pnIdentifier || null,
          hasToken: typeof j.accessToken === 'string' && j.accessToken.length > 10,
        };
      } catch {
        return null;
      }
    });
    if (s?.pn && s.hasToken) return s.pn;
    await page.waitForTimeout(500);
  }
  return null;
}

async function waitForCloudHeader(page, timeoutMs = 60_000) {
  let cloud = null;
  const onReq = (req) => {
    try {
      const u = req.url();
      if (!u.includes('api.parnoir.com')) return;
      const h = req.headers();
      const c = h['x-pn-cloud-access-token'] || h['X-PN-Cloud-Access-Token'];
      if (c) cloud = c;
    } catch {
      /* ignore */
    }
  };
  page.on('request', onReq);
  // Nudge owner path
  await page.getByTitle('Upload').first().click({ timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(2_000);
  await page.getByRole('button', { name: /^Home$/i }).first().click({ timeout: 5_000 }).catch(() => {});
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !cloud) {
    await page.waitForTimeout(500);
  }
  page.off('request', onReq);
  return cloud;
}

async function wipeFixture(browser, which) {
  const creds = loadPnFixture(ROOT, which);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const result = {
    fixture: which,
    unlocked: false,
    pnHint: null,
    listed: 0,
    deleted: 0,
    deleteFails: 0,
    purgedUserRows: null,
    error: null,
  };

  try {
    slog(`[${which}] goto browse…`);
    await page.goto(`${BROWSE}/?view=feed`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    slog(`[${which}] unlock…`);
    await unlockViaPopup(page, () => page.getByTitle('Unlock pN').first().click(), creds);
    await page.waitForTimeout(2_500);
    result.unlocked = await page.getByTitle('Lock pN').first().isVisible().catch(() => false);
    if (!result.unlocked) throw new Error('unlock failed');

    const pn = await waitForSession(page);
    if (!pn) throw new Error('no pn_oauth_session');
    result.pnHint = hashHint(pn);
    slog(`[${which}] session pn=${result.pnHint}`);

    slog(`[${which}] wait cloud AT…`);
    const cloud = await waitForCloudHeader(page, 75_000);
    if (!cloud) {
      slog(`[${which}] WARN: no cloud AT observed — owner deletes may 409`);
    } else {
      slog(`[${which}] cloud AT observed`);
    }

    // Cool-down: unlock storms rate-limit owner routes
    slog(`[${which}] cooldown 8s`);
    await page.waitForTimeout(8_000);

    const wipe = await page.evaluate(
      async ({ api, pn, cloud }) => {
        const raw = sessionStorage.getItem('pn_oauth_session');
        const session = raw ? JSON.parse(raw) : null;
        const token = session?.accessToken;
        if (!token) return { error: 'no_access_token' };

        const headers = {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        };
        if (cloud) headers['X-PN-Cloud-Access-Token'] = cloud;

        const norm = (id) => {
          if (!id) return '';
          return String(id).startsWith('pn-') ? String(id).slice(3) : String(id);
        };
        const me = norm(pn);

        const fileIds = new Set();
        for (const contentClass of ['media', 'thought', 'collection']) {
          for (let offset = 0; offset < 500; offset += 50) {
            const url = `${api}/api/aggregator/metadata-index?contentClass=${contentClass}&limit=50&offset=${offset}`;
            const res = await fetch(url, { headers: { Accept: 'application/json' } });
            if (!res.ok) break;
            const body = await res.json();
            const files = Array.isArray(body.files) ? body.files : [];
            if (files.length === 0) break;
            for (const f of files) {
              const owner =
                f.pnIdentifier ||
                f.metadata?.creator?.identifier?.value ||
                f.metadata?.creator?.['@id'] ||
                f.metadata?.author?.did ||
                '';
              if (norm(owner) === me) {
                const id = f.metadata?.fileId || f.fileId;
                if (id) fileIds.add(id);
              }
            }
            if (files.length < 50) break;
          }
        }

        let deleted = 0;
        let deleteFails = 0;
        const failSamples = [];
        for (const fileId of fileIds) {
          const res = await fetch(
            `${api}/api/aggregator/metadata-index/${encodeURIComponent(fileId)}`,
            { method: 'DELETE', headers }
          );
          if (res.ok) deleted += 1;
          else {
            deleteFails += 1;
            if (failSamples.length < 5) failSamples.push({ fileIdLen: fileId.length, status: res.status });
          }
        }

        const purgeRes = await fetch(
          `${api}/api/aggregator/metadata-index/user/${encodeURIComponent(pn)}`,
          { method: 'DELETE', headers }
        );
        let purgedUserRows = null;
        if (purgeRes.ok) {
          const body = await purgeRes.json().catch(() => ({}));
          purgedUserRows = typeof body.removedCount === 'number' ? body.removedCount : true;
        } else {
          purgedUserRows = { status: purgeRes.status };
        }

        return {
          listed: fileIds.size,
          deleted,
          deleteFails,
          failSamples,
          purgedUserRows,
        };
      },
      { api: API, pn, cloud }
    );

    if (wipe?.error) throw new Error(wipe.error);
    result.listed = wipe.listed ?? 0;
    result.deleted = wipe.deleted ?? 0;
    result.deleteFails = wipe.deleteFails ?? 0;
    result.purgedUserRows = wipe.purgedUserRows;
    slog(
      `[${which}] listed=${result.listed} deleted=${result.deleted} fails=${result.deleteFails} purge=${JSON.stringify(result.purgedUserRows)}`
    );
  } catch (e) {
    result.error = String(e?.message || e).slice(0, 240);
    slog(`[${which}] ERROR ${result.error}`);
  } finally {
    await ctx.close().catch(() => {});
  }
  return result;
}

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const which of FIXTURES) {
    results.push(await wipeFixture(browser, which));
    slog('gap 12s between fixtures…');
    await new Promise((r) => setTimeout(r, 12_000));
  }
} finally {
  await browser.close().catch(() => {});
}

const ok = results.every((r) => r.unlocked && !r.error);
console.log(JSON.stringify({ ok, results }, null, 2));
process.exit(ok ? 0 : 1);
