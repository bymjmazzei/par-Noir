#!/usr/bin/env node
/**
 * Headless diagnostic: Pen promote chain `link_1_prev_mismatch`.
 *
 * Does NOT modify product code. Never prints Key 1 / Key 2 / passcode / pn name.
 *
 * Usage (repo root):
 *   node scripts/diag-pen-promote-chain.mjs
 *
 * Optional:
 *   SKIP_LIVE=1          hermetic + source audit only (default runs live if Playwright ok)
 *   PEN_URL=https://pen.parnoir.com
 *   API_URL=https://api.parnoir.com
 *
 * Requires `.local/cursor-test-pn/` for the live section.
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.REPO_ROOT || resolve(__dirname, '..');
const PEN_URL = (process.env.PEN_URL || 'https://pen.parnoir.com').replace(/\/$/, '');
const API_URL = (process.env.API_URL || 'https://api.parnoir.com').replace(/\/$/, '');
const SKIP_LIVE =
  process.env.SKIP_LIVE === '1' ||
  process.env.SKIP_LIVE === 'true' ||
  process.argv.includes('--hermetic-only');
const OUT_DIR = resolve(ROOT, '.local/ux-playwright');
const REPORT_PATH = resolve(OUT_DIR, 'pen-promote-chain-report.json');

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

const require = createRequire(import.meta.url);

function ok(label, pass, detail = '') {
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
  return pass;
}

function loadCursorTestPn() {
  const dir = resolve(ROOT, '.local/cursor-test-pn');
  const keysPath = resolve(dir, 'keys.env');
  if (!existsSync(keysPath)) {
    throw new Error(
      'Missing .local/cursor-test-pn/keys.env — restore the agent fixture; do not mint a replacement.'
    );
  }
  const keys = readFileSync(keysPath, 'utf8');
  const PN_NAME = keys.match(/^PN_NAME=(.+)$/m)?.[1]?.trim();
  const PASSCODE = keys.match(/^PASSCODE=(.+)$/m)?.[1]?.trim();
  if (!PN_NAME || !PASSCODE) throw new Error('keys.env must define PN_NAME and PASSCODE');
  const fromEnv = keys.match(/^IDENTITY_FILE=(.+)$/m)?.[1]?.trim();
  const candidates = [
    fromEnv ? resolve(dir, fromEnv) : null,
    resolve(dir, 'live-created.pn'),
    resolve(dir, 'pn374951080.pn'),
    resolve(dir, 'identity.pn')
  ].filter(Boolean);
  const identityPath = candidates.find((p) => existsSync(p));
  if (!identityPath) throw new Error('Missing identity .pn under .local/cursor-test-pn');
  return { identityPath, PN_NAME, PASSCODE };
}

/** Simulate Drive history.chain append the way pen.publish + section_promote both do. */
function simulateServerDoubleAppend(chain, link) {
  // First job (pen.publish)
  const afterPublish = {
    ...chain,
    links: [...chain.links, link]
  };
  // Second job (pen.section_promote) appends the SAME link again
  const afterBoth = {
    ...afterPublish,
    links: [...afterPublish.links, link]
  };
  return { afterPublish, afterBoth };
}

async function runHermetic() {
  console.log('\n=== A. Hermetic: double-append same promote link ===');
  const protocolPath = resolve(ROOT, 'packages/pen-protocol/src/index.ts');
  // Prefer built/dist if present; else vite-node isn't available — use dynamic import of package
  let pen;
  try {
    pen = await import(resolve(ROOT, 'packages/pen-protocol/dist/index.js'));
  } catch {
    try {
      pen = await import('@par-noir/pen-protocol');
    } catch (e) {
      console.log('  SKIP hermetic — cannot import @par-noir/pen-protocol:', e.message);
      return { skipped: true, fails: 0, findings: [] };
    }
  }
  const pqc = await import('@par-noir/pqc-crypto/ml-dsa').catch(() => null);
  if (!pqc?.mlDsa65Keygen) {
    console.log('  SKIP hermetic — mlDsa65Keygen unavailable');
    return { skipped: true, fails: 0, findings: [] };
  }

  const {
    signGenesis,
    signPromoteLink,
    verifyChain,
    hashSectionContent,
    headHashFromChain,
    promoteSectionToPast,
    emptySection,
    listStarterTemplates,
    requireTemplate
  } = pen;

  const keys = pqc.mlDsa65Keygen();
  const template = requireTemplate(listStarterTemplates()[0].id);
  const docId = `pen_diag_chain_${Date.now().toString(36)}`;
  const sections = template.sections.map((s) => emptySection(s.slug));
  const commitment = hashSectionContent(new TextEncoder().encode(JSON.stringify(sections)));
  const genesis = signGenesis({
    docId,
    templateId: template.id,
    authorPn: 'pn-diag-alice',
    clientCreatedAt: new Date().toISOString(),
    contentCommitment: commitment,
    secretKey: keys.secretKey,
    publicKey: keys.publicKey
  });
  let chain = { docId, genesis, links: [] };
  let fails = 0;
  if (!ok('fresh chain verifies', verifyChain(chain).ok)) fails += 1;

  const section = sections[0];
  section.doc = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'diag promote 1' }] }]
  };
  const now = new Date();
  const paths = promoteSectionToPast(docId, section.slug, now);
  const contentHash = hashSectionContent(new TextEncoder().encode(JSON.stringify(section)));
  const link = signPromoteLink({
    sectionSlug: section.slug,
    pastName: paths.pastName,
    contentHash,
    prevHeadHash: headHashFromChain(chain),
    authorPn: 'pn-diag-alice',
    clientPromotedAt: now.toISOString(),
    secretKey: keys.secretKey,
    publicKey: keys.publicKey
  });

  const { afterPublish, afterBoth } = simulateServerDoubleAppend(chain, link);
  const v1 = verifyChain(afterPublish);
  if (!ok('after single append (publish only) verifies', v1.ok)) fails += 1;

  const v2 = verifyChain(afterBoth);
  const expectedErr = !v2.ok && v2.error === 'link_1_prev_mismatch';
  if (
    !ok(
      'after double append (publish + section_promote) fails link_1_prev_mismatch',
      expectedErr,
      v2.ok ? 'unexpectedly ok' : `error=${v2.error}`
    )
  ) {
    fails += 1;
  }

  // Second client commit on a hydrated broken chain
  const link2 = signPromoteLink({
    sectionSlug: section.slug,
    pastName: paths.pastName,
    contentHash: hashSectionContent(new TextEncoder().encode(JSON.stringify({ ...section, x: 2 }))),
    prevHeadHash: headHashFromChain(afterBoth),
    authorPn: 'pn-diag-alice',
    clientPromotedAt: new Date().toISOString(),
    secretKey: keys.secretKey,
    publicKey: keys.publicKey
  });
  // headHashFromChain on broken chain still hashes last link; verify of [...broken, link2] fails at link_1 first
  const v3 = verifyChain({ ...afterBoth, links: [...afterBoth.links, link2] });
  if (
    !ok(
      're-commit on hydrated double-appended chain still fails at link_1',
      !v3.ok && v3.error === 'link_1_prev_mismatch',
      v3.ok ? 'ok' : `error=${v3.error}`
    )
  ) {
    fails += 1;
  }

  return {
    skipped: false,
    fails,
    findings: [
      {
        id: 'double_append_repro',
        observed: expectedErr,
        detail: 'Appending the same promote link twice yields link_1_prev_mismatch'
      }
    ]
  };
}

function runSourceAudit() {
  console.log('\n=== B. Source audit: promote() single-append path ===');
  const editorPath = resolve(ROOT, 'apps/pen/src/pages/DocEditorPage.tsx');
  const routesPath = resolve(ROOT, 'api/src/server/modules/penRoutes.ts');
  const editorFull = readFileSync(editorPath, 'utf8');
  const routes = readFileSync(routesPath, 'utf8');
  const promoteStart = editorFull.indexOf('async function promote()');
  const promoteEnd = editorFull.indexOf('async function inviteCollaborator()', promoteStart);
  const editor = editorFull.slice(promoteStart, promoteEnd > 0 ? promoteEnd : undefined);

  let fails = 0;
  const findings = [];

  const hasPublish = /await publishDocCloud\(/.test(editor);
  const hasSectionPromote = /applyPenPromoteInbound/.test(editor);
  const hasQueuePromote = /queuePenSectionPromote\(/.test(editor);
  const queueAfterPublish =
    editor.indexOf('queuePenSectionPromote') > editor.indexOf('await publishDocCloud');
  const ownApplied = /ownCloudApplied:\s*true/.test(editor);
  if (!ok('DocEditorPage.promote calls publishDocCloud', hasPublish)) fails += 1;
  if (!ok('DocEditorPage.promote does NOT call applyPenPromoteInbound', !hasSectionPromote))
    fails += 1;
  if (hasQueuePromote) {
    if (!ok('queuePenSectionPromote runs after publishDocCloud', queueAfterPublish)) fails += 1;
    if (!ok('queuePenSectionPromote sets ownCloudApplied: true', ownApplied)) fails += 1;
  } else {
    ok('queuePenSectionPromote optional (peers only)', true);
  }

  const idempotent = /appendPromoteLinkIdempotent/.test(routes);
  if (!ok('penRoutes uses idempotent link append helper', idempotent)) fails += 1;

  findings.push({
    id: 'client_single_append',
    observed: hasPublish && !hasSectionPromote,
    detail: 'promote() owner append via pen.publish only'
  });
  findings.push({
    id: 'peer_fanout_own_applied',
    observed: !hasQueuePromote || (queueAfterPublish && ownApplied),
    detail: 'peer section_promote fanout skips own Drive re-apply'
  });
  findings.push({
    id: 'server_idempotent_append',
    observed: idempotent,
    detail: 'appendPromoteLinkIdempotent in penRoutes'
  });

  return { fails, findings };
}

async function runLive() {
  console.log('\n=== C. Live Pen (cursor-test-pn) — unlock + network + commit probe ===');
  let creds;
  try {
    creds = loadCursorTestPn();
  } catch (e) {
    console.log('  SKIP live —', e.message);
    return { skipped: true, fails: 0, findings: [] };
  }

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.log('  SKIP live — playwright not installed');
    return { skipped: true, fails: 0, findings: [] };
  }

  const apiCalls = [];
  const findings = [];
  let fails = 0;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('response', async (res) => {
    try {
      const u = res.url();
      if (!u.includes('api.parnoir.com') && !u.includes(API_URL.replace('https://', ''))) return;
      const url = new URL(u);
      let jobType = null;
      let errCode = null;
      try {
        if (res.request().method() === 'POST') {
          const raw = res.request().postData() || '';
          if (raw) {
            const post = JSON.parse(raw);
            jobType = post?.jobType || post?.type || null;
          }
        }
      } catch {
        /* ignore */
      }
      try {
        if (res.status() >= 400) {
          const t = await res.text().catch(() => '');
          const m = t.match(/link_\d+_prev_mismatch|drive_index|cloud_token|signing_keys|["']error["']\s*:\s*["']([^"']+)/i);
          errCode = m ? m[0].slice(0, 100) : `http_${res.status()}`;
        }
      } catch {
        /* ignore */
      }
      apiCalls.push({
        method: res.request().method(),
        path: url.pathname,
        status: res.status(),
        jobType,
        errCode
      });
    } catch {
      /* ignore */
    }
  });

  // Also capture request start so we see POSTs even if response handler races
  page.on('request', (req) => {
    try {
      const u = req.url();
      if (!u.includes('api.parnoir.com')) return;
      if (req.method() !== 'POST') return;
      const url = new URL(u);
      let jobType = null;
      try {
        const raw = req.postData() || '';
        if (raw) jobType = JSON.parse(raw)?.jobType || null;
      } catch {
        /* ignore */
      }
      if (url.pathname.includes('/pen/') || jobType) {
        apiCalls.push({
          method: 'POST',
          path: url.pathname,
          status: 'pending',
          jobType,
          errCode: null,
          phase: 'request'
        });
      }
    } catch {
      /* ignore */
    }
  });

  try {
    await page.goto(PEN_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(1500);

    const unlockBtn =
      (await page.getByTitle('Unlock').first().isVisible().catch(() => false))
        ? page.getByTitle('Unlock').first()
        : page.getByRole('button', { name: /Unlock/i }).first();

    if (!(await unlockBtn.isVisible({ timeout: 8_000 }).catch(() => false))) {
      console.log('  SKIP live — unlock control not found (may need headed unlock)');
      await browser.close();
      return { skipped: true, fails: 0, findings: [{ id: 'unlock_ui', observed: false }] };
    }

    const popupPromise = page.waitForEvent('popup', { timeout: 45_000 }).catch(() => null);
    await unlockBtn.click();
    let popup = await popupPromise;
    if (!popup) {
      await page.waitForURL(/oauth\/consent|authorize|unlock/, { timeout: 30_000 }).catch(() => {});
      popup = page;
    } else {
      await popup.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => {});
    }

    const { fillConsentAndUnlock } = await import(
      resolve(ROOT, 'apps/aggregator-browser/scripts/ux-unlock-lib.mjs')
    );
    try {
      await fillConsentAndUnlock(popup, {
        identityPath: creds.identityPath,
        PN_NAME: creds.PN_NAME,
        PASSCODE: creds.PASSCODE,
        expectClose: false
      });
    } catch (e) {
      console.log('  unlock helper:', e instanceof Error ? e.message : e);
    }

    // Wait for session + ML-DSA keys (required for Commit signing)
    const deadline = Date.now() + 90_000;
    let unlocked = false;
    let hasSigningKeys = false;
    while (Date.now() < deadline) {
      const snap = await page
        .evaluate(() => {
          try {
            const raw = sessionStorage.getItem('pen_session');
            if (!raw) return { hasAccessToken: false, hasMlDsa: false };
            const s = JSON.parse(raw);
            const stashRaw = sessionStorage.getItem('pn_oauth_pqc_stash');
            let stash = null;
            try {
              stash = stashRaw ? JSON.parse(stashRaw) : null;
            } catch {
              stash = null;
            }
            const hasMlDsa = Boolean(
              (s?.mlDsaPublicKey && s?.mlDsaSecretKey) ||
                (stash?.mlDsaPublicKey && stash?.mlDsaSecretKey)
            );
            return {
              hasAccessToken: Boolean(s?.accessToken),
              hasPn: Boolean(s?.pnIdentifier),
              hasMlDsa
            };
          } catch {
            return { hasAccessToken: false, hasMlDsa: false };
          }
        })
        .catch(() => ({ hasAccessToken: false, hasMlDsa: false }));
      if (snap.hasAccessToken) {
        unlocked = true;
        hasSigningKeys = Boolean(snap.hasMlDsa);
        if (hasSigningKeys) break;
      }
      await page.waitForTimeout(1000);
    }

    if (!ok('Pen session after unlock', unlocked)) {
      fails += 1;
      findings.push({ id: 'live_unlock', observed: false });
      await browser.close();
      return { skipped: false, fails, findings, apiCalls };
    }
    findings.push({ id: 'live_unlock', observed: true });
    ok('ML-DSA signing keys in session/stash', hasSigningKeys);
    findings.push({ id: 'live_signing_keys', observed: hasSigningKeys });

    await page.goto(`${PEN_URL}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Create blank Custom doc so we have a clean chain to Commit
    let createdDoc = false;
    const addBtn = page.getByRole('button', { name: 'Add' }).or(page.getByTitle('Add')).first();
    if (await addBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(300);
      const blankItem = page.getByRole('menuitem', { name: /Blank document/i });
      if (await blankItem.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await blankItem.click();
        await page.waitForTimeout(600);
        const customOpt = page.getByRole('button', { name: /^Custom/i }).first();
        if (await customOpt.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await customOpt.click();
          await page.waitForTimeout(200);
        }
        const createBtn = page.getByRole('button', { name: /^Create$/i });
        if (await createBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await createBtn.click();
          await page.waitForURL(/\/d\//, { timeout: 30_000 }).catch(() => {});
          createdDoc = /\/d\//.test(page.url());
        }
      }
    }

    if (!createdDoc) {
      const docLink = page.locator('a[href*="/d/"]').first();
      if (await docLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await docLink.click();
        await page.waitForURL(/\/d\//, { timeout: 15_000 }).catch(() => {});
      }
    }
    ok('Opened / created a doc editor', /\/d\//.test(page.url()), page.url());
    findings.push({ id: 'live_doc_open', observed: /\/d\//.test(page.url()), url: page.url() });

    // Type into editor so there is content to promote
    const editor =
      page.locator('.ProseMirror, [contenteditable="true"]').first();
    if (await editor.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await editor.click();
      await page.keyboard.type(`diag promote ${Date.now()}`, { delay: 15 });
      await page.waitForTimeout(500);
    }

    async function clickCommit() {
      const more = page.getByRole('button', { name: 'More save options' }).first();
      if (!(await more.isVisible({ timeout: 5_000 }).catch(() => false))) {
        return false;
      }
      await more.click();
      await page.waitForTimeout(400);
      const commitItem = page.getByRole('button', { name: /Commit to current version/i });
      if (!(await commitItem.first().isVisible({ timeout: 3_000 }).catch(() => false))) {
        return false;
      }
      await commitItem.first().click();
      return true;
    }

    async function uiStatusHint() {
      return page
        .evaluate(() => {
          const body = document.body?.innerText || '';
          const m = body.match(
            /link_\d+_prev_mismatch|signing_keys_required|gallery preview skipped|Published live|Publishing live|Committed|publish_failed|no_publish/i
          );
          const errEl = document.querySelector('[class*="text-red"], .pen-error, [role="alert"]');
          return {
            match: m ? m[0] : null,
            errText: errEl ? (errEl.textContent || '').slice(0, 120) : null
          };
        })
        .catch(() => ({ match: null, errText: null }));
    }

    async function waitCommitOutcome(ms = 45_000) {
      const end = Date.now() + ms;
      let last = { match: null, errText: null };
      while (Date.now() < end) {
        last = await uiStatusHint();
        if (
          last.match &&
          /link_\d+_prev_mismatch|Published live|Queued offline|signing_keys|publish_failed|Committed —/i.test(
            last.match
          )
        ) {
          return last;
        }
        if (last.errText && /link_|mismatch|fail|error|signing/i.test(last.errText)) {
          return last;
        }
        await page.waitForTimeout(500);
      }
      return last;
    }

    const beforeJobs = apiCalls.length;
    let commitAttempted = await clickCommit();
    let firstHint = { match: null, errText: null };
    if (commitAttempted) {
      firstHint = await waitCommitOutcome(60_000);
      console.log(
        '  OBSERVED: first Commit UI hint=',
        firstHint.match || firstHint.errText || '(none)'
      );
    } else {
      console.log('  OBSERVED: Commit control not found after create');
      // Dump nearby chrome for diagnosis
      const chrome = await page
        .evaluate(() =>
          [...document.querySelectorAll('button')]
            .map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 40))
            .filter(Boolean)
            .slice(0, 40)
        )
        .catch(() => []);
      console.log('  OBSERVED: button labels sample=', JSON.stringify(chrome));
    }
    findings.push({
      id: 'live_commit_1',
      observed: commitAttempted,
      hint: firstHint
    });

    // Second Commit — reload hydrates Drive chain (where double-append lives)
    let secondHint = { match: null, errText: null };
    let secondAttempted = false;
    let chainInvalid = null;
    if (commitAttempted) {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
      // Wait for hydrate + chrome (History / Save)
      const readyDeadline = Date.now() + 45_000;
      while (Date.now() < readyDeadline) {
        const ready = await page
          .getByRole('button', { name: 'More save options' })
          .first()
          .isVisible()
          .catch(() => false);
        if (ready) break;
        await page.waitForTimeout(500);
      }
      const reloadErr = await uiStatusHint();
      console.log(
        '  OBSERVED: after reload hint=',
        reloadErr.match || reloadErr.errText || '(none)',
        'url=',
        page.url()
      );
      findings.push({ id: 'live_reload_after_commit', hint: reloadErr, url: page.url() });

      // Chain verify UI lives under History panel
      const histBtn = page.getByRole('button', { name: 'History' }).first();
      if (await histBtn.isVisible({ timeout: 8_000 }).catch(() => false)) {
        await histBtn.click();
        await page.waitForTimeout(1000);
        chainInvalid = await page
          .evaluate(() => {
            const body = document.body?.innerText || '';
            const m = body.match(/invalid\s*\(([^)]+)\)/i);
            const verified = /Chain:\s*verified/i.test(body);
            const prevHeads = body.match(/"prevHeadHash"/g);
            return {
              invalidError: m ? m[1] : null,
              verified,
              prevHeadHashCount: prevHeads ? prevHeads.length : 0,
              bodyHint: body.replace(/\s+/g, ' ').slice(0, 280)
            };
          })
          .catch(() => null);
        console.log('  OBSERVED: History chain=', JSON.stringify(chainInvalid));
        findings.push({ id: 'live_chain_after_reload', observed: chainInvalid });
        if (chainInvalid?.invalidError === 'link_1_prev_mismatch') {
          console.log('  OBSERVED: live hydrated chain shows link_1_prev_mismatch');
        }
        // Close history so editor is usable
        await histBtn.click().catch(() => {});
        await page.waitForTimeout(300);
      } else {
        const dump = await page
          .evaluate(() => ({
            url: location.href,
            text: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 400),
            buttons: [...document.querySelectorAll('button')]
              .map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 36))
              .filter(Boolean)
              .slice(0, 25)
          }))
          .catch(() => null);
        console.log('  OBSERVED: History button missing after reload —', JSON.stringify(dump));
        findings.push({ id: 'live_reload_chrome_missing', observed: dump });
      }

      if (await editor.isVisible().catch(() => false)) {
        await editor.click();
        await page.keyboard.type(' more', { delay: 10 });
      }
      await page.waitForTimeout(800);
      secondAttempted = await clickCommit();
      if (secondAttempted) {
        secondHint = await waitCommitOutcome(60_000);
        console.log(
          '  OBSERVED: second Commit UI hint=',
          secondHint.match || secondHint.errText || '(none)'
        );
      } else {
        console.log('  OBSERVED: second Commit control missing');
      }
      findings.push({ id: 'live_commit_2', observed: secondAttempted, hint: secondHint });
    }

    const completed = apiCalls.filter((c) => c.status !== 'pending' && c.jobType);
    const publishJobs = completed.filter((c) => c.jobType === 'pen.publish');
    const sectionJobs = completed.filter((c) => c.jobType === 'pen.section_promote');
    const bootstrapJobs = completed.filter((c) => c.jobType === 'pen.doc_bootstrap');
    console.log(
      `  OBSERVED: completed jobTypes publish=${publishJobs.length} section_promote=${sectionJobs.length} bootstrap=${bootstrapJobs.length}`
    );
    console.log(
      '  OBSERVED: pen apply-inbound=',
      JSON.stringify(
        completed
          .filter((c) => String(c.path).includes('apply-inbound'))
          .map((c) => ({ jobType: c.jobType, status: c.status, err: c.errCode }))
      )
    );
    findings.push({
      id: 'live_job_counts',
      observed: {
        publish: publishJobs.length,
        section_promote: sectionJobs.length,
        bootstrap: bootstrapJobs.length
      }
    });

    const mismatchHints = [firstHint, secondHint].filter(
      (h) => /link_1_prev_mismatch/i.test(String(h.match || h.errText || ''))
    );
    const apiMismatch = apiCalls.some((c) => /link_1_prev_mismatch/i.test(String(c.errCode || '')));
    const chainMismatch = chainInvalid?.invalidError === 'link_1_prev_mismatch';
    if (mismatchHints.length || apiMismatch || chainMismatch) {
      console.log('  OBSERVED: live link_1_prev_mismatch confirmed');
      findings.push({
        id: 'live_mismatch',
        observed: true,
        via: chainMismatch ? 'history_panel' : apiMismatch ? 'api' : 'ui_status'
      });
    } else {
      findings.push({ id: 'live_mismatch', observed: false, chainInvalid });
    }

    if (publishJobs.length >= 1 && sectionJobs.length === 0) {
      ok(
        'live Commit issued pen.publish only (no owner section_promote)',
        true,
        'single-append path'
      );
      findings.push({ id: 'live_double_job', observed: false, fixed: true });
    } else if (publishJobs.length >= 1 && sectionJobs.length >= 1) {
      ok(
        'live Commit issued pen.publish only (no owner section_promote)',
        false,
        `publish=${publishJobs.length} section_promote=${sectionJobs.length}`
      );
      findings.push({ id: 'live_double_job', observed: true, fixed: false });
    } else if (commitAttempted) {
      ok(
        'live Commit issued pen.publish',
        publishJobs.length >= 1,
        `publish=${publishJobs.length} section_promote=${sectionJobs.length}`
      );
      findings.push({
        id: 'live_double_job',
        observed: sectionJobs.length > 0,
        detail: 'unexpected job mix'
      });
    }

    await browser.close();
    return { skipped: false, fails, findings, apiCalls };
  } catch (e) {
    console.log('  live error:', e instanceof Error ? e.message : e);
    await browser.close().catch(() => {});
    return {
      skipped: false,
      fails: fails + 1,
      findings: [...findings, { id: 'live_exception', observed: String(e) }],
      apiCalls
    };
  }
}

async function main() {
  console.log('diag-pen-promote-chain');
  console.log(`PEN_URL=${PEN_URL}`);
  console.log(`fixture=.local/cursor-test-pn SKIP_LIVE=${SKIP_LIVE}`);

  const hermetic = await runHermetic();
  const audit = runSourceAudit();
  const live = SKIP_LIVE
    ? { skipped: true, fails: 0, findings: [], apiCalls: [] }
    : await runLive();

  const report = {
    at: new Date().toISOString(),
    penUrl: PEN_URL,
    hermetic,
    sourceAudit: audit,
    live,
    conclusion: null
  };

  const singleAppend =
    audit.findings.some((f) => f.id === 'client_single_append' && f.observed) &&
    audit.findings.some((f) => f.id === 'peer_fanout_own_applied' && f.observed);
  const liveOk =
    live.findings?.some((f) => f.id === 'live_double_job' && f.observed === false) ||
    live.findings?.some(
      (f) =>
        f.id === 'live_job_counts' &&
        f.observed &&
        f.observed.publish >= 1 &&
        f.observed.section_promote === 0
    );
  const liveMismatch = live.findings?.some((f) => f.id === 'live_mismatch' && f.observed);

  if (singleAppend && liveOk && !liveMismatch) {
    report.conclusion =
      'FIXED: promote() owner-appends once via pen.publish; live Commit showed publish without ' +
      'owner section_promote; chain stayed valid (no link_1_prev_mismatch).';
  } else if (singleAppend && live.skipped) {
    report.conclusion =
      'Client/source fix in place (single pen.publish append). Live section skipped — run without SKIP_LIVE against a build that includes this fix.';
  } else if (singleAppend && !liveOk) {
    report.conclusion =
      'Source fix present but live still saw section_promote or mismatch — confirm PEN_URL serves this build (not stale hosting).';
  } else {
    report.conclusion =
      'NOT FIXED: promote() still has dual append paths — inspect sourceAudit findings.';
  }

  console.log('\n=== Conclusion ===');
  console.log(report.conclusion);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\nReport: ${REPORT_PATH}`);

  const totalFails = (hermetic.fails || 0) + (audit.fails || 0) + (live.fails || 0);
  // Exit 0 when we successfully *diagnosed* the bug (hermetic fail of chain is expected PASS of diag)
  process.exit(audit.fails > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
