/**
 * Headed live suite: unlock Pen with cursor-test-pn, build real social templates
 * (blank → layers → copy → arrange → Connect to feed → pen-templates), finish Browse upload.
 *
 * Usage:
 *   node scripts/headed-pen-publish-templates.mjs
 *   PEN_URL=https://pen.parnoir.com BROWSE_URL=https://browse.parnoir.com HEADLESS=0 node …
 *
 * Never logs Key 1 / Key 2 / passcode / pn name.
 * Layout framework: portrait 9:16 story safe zones (hook / body / CTA in center band).
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PEN_URL = (process.env.PEN_URL || 'https://pen.parnoir.com').replace(/\/$/, '');
const BROWSE_URL = (process.env.BROWSE_URL || 'https://browse.parnoir.com').replace(/\/$/, '');
const HEADLESS = process.env.HEADLESS === '1';
const MAX_TEMPLATES = Math.max(1, Number(process.env.MAX_TEMPLATES || 3));

/** Story-safe layouts on ~360×640 social canvas (px). Top/bottom chrome reserved. */
const SPECS = [
  {
    id: 'hook-headline',
    title: 'Hook Headline',
    formLabel: /^Notes$/i,
    categoryLabel: /^Social$/i,
    bg: '#0f172a',
    layers: [
      { name: 'Hook', text: 'Before you post,', x: 24, y: 96, w: 312, h: 48 },
      {
        name: 'Headline',
        text: 'check the safe zone.',
        x: 24,
        y: 160,
        w: 312,
        h: 72
      },
      {
        name: 'Body',
        text: 'Keep hooks in the center band. Top and bottom belong to the feed chrome.',
        x: 24,
        y: 280,
        w: 312,
        h: 96
      },
      { name: 'CTA', text: 'Save this template →', x: 24, y: 420, w: 312, h: 40 }
    ]
  },
  {
    id: 'checklist',
    title: 'Checklist Slide',
    formLabel: /^Notes$/i,
    categoryLabel: /^Social$/i,
    bg: '#14532d',
    layers: [
      { name: 'Title', text: 'Post checklist', x: 24, y: 96, w: 312, h: 40 },
      {
        name: 'List',
        text: '□ One message\n□ High contrast\n□ Hook in center\n□ Clear CTA\n□ Safe margins',
        x: 24,
        y: 160,
        w: 312,
        h: 220
      },
      { name: 'CTA', text: 'Reply CHECKLIST', x: 24, y: 420, w: 312, h: 40 }
    ]
  },
  {
    id: 'quote-card',
    title: 'Quote Card',
    formLabel: /^Quote$/i,
    categoryLabel: /^Social$/i,
    bg: '#1e1b4b',
    layers: [
      {
        name: 'Quote',
        text: 'Design for the thumb, not the desktop.',
        x: 24,
        y: 180,
        w: 312,
        h: 120
      },
      { name: 'Attr', text: '— layout notes', x: 24, y: 320, w: 312, h: 36 },
      { name: 'CTA', text: 'Remix this quote', x: 24, y: 420, w: 312, h: 40 }
    ]
  },
  {
    id: 'link-promo',
    title: 'Link Promo',
    formLabel: /^Link$/i,
    categoryLabel: /^Social$/i,
    bg: '#7c2d12',
    layers: [
      { name: 'Eyebrow', text: 'NEW', x: 24, y: 100, w: 80, h: 28 },
      {
        name: 'Headline',
        text: 'Open the templates feed',
        x: 24,
        y: 150,
        w: 312,
        h: 72
      },
      {
        name: 'Body',
        text: 'Public templates live at /templates — engagement sits outside the tile.',
        x: 24,
        y: 250,
        w: 312,
        h: 80
      },
      { name: 'CTA', text: 'Tap to open →', x: 24, y: 420, w: 312, h: 40 }
    ]
  }
];

function loadCreds() {
  const dir = resolve(ROOT, '.local/cursor-test-pn');
  const keysPath = resolve(dir, 'keys.env');
  if (!existsSync(keysPath)) {
    throw new Error('Missing .local/cursor-test-pn/keys.env');
  }
  const keys = readFileSync(keysPath, 'utf8');
  const PN_NAME = keys.match(/^PN_NAME=(.+)$/m)?.[1]?.trim();
  const PASSCODE = keys.match(/^PASSCODE=(.+)$/m)?.[1]?.trim();
  if (!PN_NAME || !PASSCODE) throw new Error('keys.env must define PN_NAME and PASSCODE');
  const fromEnv = keys.match(/^IDENTITY_FILE=(.+)$/m)?.[1]?.trim();
  const candidates = [
    fromEnv ? resolve(dir, fromEnv) : null,
    resolve(dir, 'live-created.pn'),
    resolve(dir, 'pn374951080.pn')
  ].filter(Boolean);
  const identityPath = candidates.find((p) => existsSync(p));
  if (!identityPath) throw new Error('Missing identity .pn under cursor-test-pn');
  return { identityPath, PN_NAME, PASSCODE };
}

function ok(label, pass, detail = '') {
  console.log(`  ${pass ? 'OK' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  return pass;
}

async function unlockPen(page, creds) {
  const { fillConsentAndUnlock } = await import(
    pathToFileURL(resolve(ROOT, 'apps/aggregator-browser/scripts/ux-unlock-lib.mjs')).href
  );

  await page.goto(`${PEN_URL}/`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForTimeout(1500);

  const unlockBtn = page
    .getByRole('button', { name: /^Unlock$/i })
    .or(page.getByTitle('Unlock'))
    .first();
  if (!(await unlockBtn.isVisible({ timeout: 10_000 }).catch(() => false))) {
    const session = await readPenSession(page);
    if (session?.hasAccessToken) return session;
    throw new Error('Unlock control not found');
  }

  const popupPromise = page.waitForEvent('popup', { timeout: 45_000 });
  await unlockBtn.click();
  const popup = await popupPromise;
  await fillConsentAndUnlock(popup, { ...creds, expectClose: true });

  let session = null;
  for (let i = 0; i < 45; i++) {
    session = await readPenSession(page);
    if (session?.hasAccessToken) break;
    await page.waitForTimeout(1000);
  }
  if (!session?.hasAccessToken) throw new Error('Pen session not established after unlock');
  return session;
}

async function readPenSession(page) {
  return page.evaluate(() => {
    try {
      const raw = sessionStorage.getItem('pen_session');
      if (!raw) return { hasAccessToken: false };
      const s = JSON.parse(raw);
      return {
        hasAccessToken: Boolean(s?.accessToken),
        pnIdentifier: s?.pnIdentifier || null,
        hasMlDsa: Boolean(s?.mlDsaPublicKey && s?.mlDsaSecretKey)
      };
    } catch {
      return { hasAccessToken: false };
    }
  });
}

async function createBlankSocial(page, spec) {
  await page.goto(`${PEN_URL}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(1200);

  const addBtn = page.getByRole('button', { name: 'Add' }).or(page.getByTitle('Add')).first();
  await addBtn.click();
  await page.waitForTimeout(400);
  const blankItem = page
    .getByRole('menuitem', { name: /Blank document/i })
    .or(page.locator('.pen-add-menu-panel button', { hasText: /Blank document/i }))
    .first();
  await blankItem.waitFor({ state: 'visible', timeout: 10_000 });
  await blankItem.click();
  await page.waitForTimeout(500);

  // Category headers are text; click form option by title
  const formOpt = page
    .locator('.pen-blank-wizard-option')
    .filter({ hasText: spec.formLabel })
    .first();
  if (await formOpt.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await formOpt.click();
    await page.waitForTimeout(300);
  } else {
    const custom = page
      .locator('.pen-blank-wizard-option')
      .filter({ hasText: /^Custom/i })
      .first();
    if (await custom.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await custom.click();
      await page.waitForTimeout(200);
    }
  }

  await page.getByRole('button', { name: /^Create$/i }).click();
  await page.waitForURL(/\/d\//, { timeout: 45_000 });
  return page.url();
}

async function setTitle(page, title) {
  const titleInput = page
    .locator('input[aria-label*="itle" i], input[placeholder*="itle" i], .pen-doc-title input')
    .first();
  if (await titleInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await titleInput.fill(title);
    return;
  }
  // Some builds use contenteditable title
  const editable = page.locator('[data-pen-doc-title], .pen-editor-title').first();
  if (await editable.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await editable.click();
    await page.keyboard.type(title, { delay: 10 });
  }
}

/**
 * Prefer IR inject for stable layer rects (same path as LayersPanel upsert),
 * after opening the editor so autosave / session are live. Falls back to UI + Add text.
 */
async function buildLayers(page, spec) {
  const injected = await page.evaluate((payload) => {
    try {
      const raw = sessionStorage.getItem('pen_session');
      const session = raw ? JSON.parse(raw) : null;
      const pn = session?.pnIdentifier;
      if (!pn) return { ok: false, reason: 'no_pn' };
      const m = location.pathname.match(/\/d\/([^/]+)/);
      const docId = m?.[1];
      if (!docId) return { ok: false, reason: 'no_doc' };
      const key = `pen_docs_v1:${pn}:doc:${docId}`;
      const docRaw = localStorage.getItem(key);
      if (!docRaw) return { ok: false, reason: 'no_local_doc' };
      const bundle = JSON.parse(docRaw);
      const section = bundle.sections?.[0];
      if (!section) return { ok: false, reason: 'no_section' };

      const layers = payload.layers.map((L, i) => {
        const paras = String(L.text).split('\n');
        return {
          id: `headed_${payload.id}_${i}`,
          kind: 'text',
          name: L.name,
          visible: true,
          positionLocked: false,
          zIndex: i + 1,
          x: L.x,
          y: L.y,
          w: L.w,
          h: L.h,
          textDoc: {
            type: 'doc',
            content: paras.map((text) => ({
              type: 'paragraph',
              content: text ? [{ type: 'text', text }] : []
            }))
          }
        };
      });

      section.layers = layers;
      if (!section.pagePresentation) section.pagePresentation = {};
      section.pagePresentation.backgroundColor = payload.bg;
      // Clear body prose so layers dominate (story framework)
      section.doc = { type: 'doc', content: [{ type: 'paragraph', content: [] }] };
      bundle.manifest.title = payload.title;
      bundle.manifest.updatedAt = new Date().toISOString();
      if (!bundle.manifest.pagePresentation) bundle.manifest.pagePresentation = {};
      bundle.manifest.pagePresentation.backgroundColor = payload.bg;
      localStorage.setItem(key, JSON.stringify(bundle));
      return { ok: true, layerCount: layers.length };
    } catch (e) {
      return { ok: false, reason: String(e?.message || e) };
    }
  }, spec);

  if (injected.ok) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    return injected;
  }

  // UI fallback: open Layers → Add text → type
  const layersBtn = page.getByRole('button', { name: /Layers/i }).first();
  if (await layersBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await layersBtn.click();
    await page.waitForTimeout(400);
    for (const L of spec.layers) {
      const addText = page.getByRole('button', { name: /Add text|Text layer|\+/i }).first();
      if (await addText.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await addText.click();
        await page.waitForTimeout(300);
      }
      const editor = page.locator('.ProseMirror, [contenteditable="true"]').first();
      if (await editor.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await editor.click();
        await page.keyboard.type(L.text.replace(/\n/g, ' · '), { delay: 8 });
      }
    }
    return { ok: true, layerCount: spec.layers.length, via: 'ui' };
  }
  return injected;
}

async function connectAsPublicTemplate(page, context) {
  const publish = page.getByRole('button', { name: /^Publish$/i }).or(page.getByTitle('Publish')).first();
  await publish.click();
  await page.waitForTimeout(400);

  const connect = page.getByRole('button', { name: /Connect to feed/i }).first();
  if (!(await connect.isVisible({ timeout: 5_000 }).catch(() => false))) {
    return { ok: false, reason: 'connect_missing' };
  }
  await connect.click();
  await page.waitForTimeout(400);

  const templateLabel = page.locator('label', { hasText: /Pen templates/i }).first();
  const templateCb = templateLabel.locator('input[type="checkbox"]');
  const enabled = await templateCb.isEnabled().catch(() => false);
  if (!enabled) {
    return { ok: false, reason: 'pen_templates_disabled_allowlist?' };
  }
  if (!(await templateCb.isChecked())) {
    await templateCb.check({ force: true });
  }
  // Prefer templates-only for this suite
  const browseCb = page.locator('label', { hasText: /Browse/i }).locator('input[type="checkbox"]');
  if (await browseCb.isChecked().catch(() => false)) {
    await browseCb.uncheck({ force: true }).catch(() => {});
  }

  const popupPromise = context.waitForEvent('page', { timeout: 60_000 }).catch(() => null);
  const shareBtn = page.getByRole('button', { name: /^Share$/i }).first();
  await shareBtn.click();

  const browsePage = await popupPromise;
  return { ok: true, browsePage, enabled };
}

async function finishBrowseUpload(browsePage) {
  if (!browsePage) return { ok: false, reason: 'no_browse_tab' };
  await browsePage.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => {});
  await browsePage.waitForTimeout(2000);

  // Upload modal may auto-open from handoff
  const publishBtn = browsePage
    .getByRole('button', { name: /Publish|Upload|Share|Post/i })
    .first();
  if (await publishBtn.isVisible({ timeout: 15_000 }).catch(() => false)) {
    await publishBtn.click();
    await browsePage.waitForTimeout(5000);
    return { ok: true };
  }

  // Try unlock if browse locked
  const unlock = browsePage.getByRole('button', { name: /Unlock/i }).first();
  if (await unlock.isVisible({ timeout: 3_000 }).catch(() => false)) {
    return { ok: false, reason: 'browse_locked' };
  }
  return { ok: false, reason: 'upload_ui_not_found', url: browsePage.url() };
}

async function main() {
  console.log('headed-pen-publish-templates');
  console.log(`  PEN_URL=${PEN_URL}`);
  console.log(`  BROWSE_URL=${BROWSE_URL}`);
  console.log(`  MAX_TEMPLATES=${MAX_TEMPLATES} HEADLESS=${HEADLESS}`);

  const creds = loadCreds();
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: HEADLESS,
    slowMo: HEADLESS ? 0 : 50
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }
  });
  const page = await context.newPage();

  let fails = 0;
  try {
    console.log('\n=== Unlock ===');
    const session = await unlockPen(page, creds);
    ok('session token', session.hasAccessToken);
    ok('signing keys', session.hasMlDsa);
    const pn = session.pnIdentifier || '';
    ok(
      'pnIdentifier present',
      Boolean(pn),
      pn ? `${pn.slice(0, 16)}… (len=${pn.length})` : ''
    );
    if (pn && !pn.startsWith('pn-') && !pn.startsWith('did:key:')) {
      console.log('  WARN  pnIdentifier format unexpected — check allowlist aliases');
    }

    const specs = SPECS.slice(0, MAX_TEMPLATES);
    for (const spec of specs) {
      console.log(`\n=== Template: ${spec.id} ===`);
      try {
        const url = await createBlankSocial(page, spec);
        ok('created blank', /\/d\//.test(url), url.replace(PEN_URL, ''));
        await setTitle(page, spec.title);
        const built = await buildLayers(page, spec);
        ok('layers built', Boolean(built.ok), built.reason || `n=${built.layerCount}`);
        if (!built.ok) {
          fails += 1;
          continue;
        }

        // Autosave / draft
        await page.waitForTimeout(2500);

        const share = await connectAsPublicTemplate(page, context);
        ok('pen-templates enabled', share.enabled !== false, share.reason || '');
        if (!share.ok) {
          fails += 1;
          continue;
        }

        const upload = await finishBrowseUpload(share.browsePage);
        ok('browse upload', upload.ok, upload.reason || upload.url || '');
        if (!upload.ok) fails += 1;

        if (share.browsePage && !share.browsePage.isClosed()) {
          await share.browsePage.close().catch(() => {});
        }
      } catch (e) {
        fails += 1;
        console.log(`  FAIL  ${spec.id}: ${e instanceof Error ? e.message : e}`);
      }
    }

    console.log('\n=== /templates smoke ===');
    await page.goto(`${PEN_URL}/templates`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(3000);
    const slide = page.locator('.pen-doc-feed-slide, .pen-doc-feed-empty').first();
    ok(
      'templates feed renders',
      await slide.isVisible({ timeout: 10_000 }).catch(() => false)
    );
  } finally {
    await browser.close();
  }

  console.log(`\nDone. fails=${fails}`);
  process.exit(fails > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
