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
const MAX_TEMPLATES = Math.max(1, Number(process.env.MAX_TEMPLATES || 5));

/**
 * Five flagship publishes — create from platform starter (live media IR), then refine.
 */
export const ATOM_PACK_TEMPLATE_IDS = [
  'note.basic.portrait.v1',
  'note.text_tile.light.v1',
  'note.media.portrait.v1',
  'quote.basic.v1',
  'post.image.portrait.v1'
];

/** Story-safe layouts on ~360×640 social canvas (px). Top/bottom chrome reserved. */
const SPECS = [
  {
    id: 'punchy-note',
    title: 'A short line that lands',
    starterId: 'note.basic.portrait.v1',
    formTitle: 'Notes',
    categoryLabel: /^Social$/i,
    bg: '#0c0c0c',
    layers: [
      {
        name: 'Eyebrow',
        text: 'NOTE',
        x: 28,
        y: 88,
        w: 120,
        h: 28,
        kind: 'text',
        fill: '#0f766e'
      },
      {
        name: 'Hook',
        text: 'Say the thing once.',
        x: 28,
        y: 180,
        w: 304,
        h: 72,
        kind: 'text'
      },
      {
        name: 'Body',
        text: 'Then get out of the way. Portrait Notes win on clarity, not decoration.',
        x: 28,
        y: 280,
        w: 304,
        h: 120,
        kind: 'text'
      },
      {
        name: 'Accent',
        text: '',
        x: 28,
        y: 420,
        w: 48,
        h: 4,
        kind: 'text',
        fill: '#b8956c'
      }
    ]
  },
  {
    id: 'light-tile',
    title: 'One clear thought',
    starterId: 'note.text_tile.light.v1',
    formTitle: 'Notes',
    categoryLabel: /^Social$/i,
    bg: '#e7e5e4',
    layers: [
      {
        name: 'Card',
        text: 'One clear thought.\n\nHigh contrast on paper — readable in the feed at a glance.',
        x: 28,
        y: 160,
        w: 304,
        h: 260,
        kind: 'text',
        fill: '#ffffff',
        stroke: '#d6d3d1'
      }
    ]
  },
  {
    id: 'note-on-media',
    title: 'The words are the post',
    starterId: 'note.media.portrait.v1',
    formTitle: 'Notes',
    categoryLabel: /^Social$/i,
    bg: '#0c0c0c',
    mediaFile: 'caption-bg.jpg',
    layers: [
      {
        name: 'Backdrop',
        text: '',
        x: 0,
        y: 0,
        w: 360,
        h: 640,
        kind: 'image',
        mediaFile: 'caption-bg.jpg'
      },
      {
        name: 'Card',
        text: 'The words are the post.\n\nMedia is atmosphere — crop away the text and nothing remains.',
        x: 24,
        y: 200,
        w: 312,
        h: 240,
        kind: 'text',
        fill: 'rgba(12,12,12,0.88)',
        stroke: 'rgba(184,149,108,0.35)'
      }
    ]
  },
  {
    id: 'quote-card',
    title: 'Clarity is a kindness',
    starterId: 'quote.basic.v1',
    formTitle: 'Notes',
    categoryLabel: /^Social$/i,
    bg: '#0c0c0c',
    layers: [
      {
        name: 'Mark',
        text: '“',
        x: 24,
        y: 100,
        w: 80,
        h: 80,
        kind: 'text',
        fill: 'transparent'
      },
      {
        name: 'Quote',
        text: 'Clarity is a kindness you practice in public.',
        x: 32,
        y: 200,
        w: 296,
        h: 160,
        kind: 'text'
      },
      {
        name: 'Rule',
        text: '',
        x: 32,
        y: 400,
        w: 48,
        h: 3,
        kind: 'text',
        fill: '#b8956c'
      },
      {
        name: 'Byline',
        text: '— Ada Okonkwo',
        x: 32,
        y: 420,
        w: 296,
        h: 36,
        kind: 'text'
      }
    ]
  },
  {
    id: 'image-post',
    title: 'Frame the subject',
    starterId: 'post.image.portrait.v1',
    formTitle: 'media',
    categoryLabel: /^Social$/i,
    bg: '#000000',
    mediaFile: 'image-post.jpg',
    layers: [
      {
        name: 'Photo',
        text: '',
        x: 0,
        y: 0,
        w: 360,
        h: 640,
        kind: 'image',
        mediaFile: 'image-post.jpg'
      },
      {
        name: 'Caption',
        text: 'Frame the subject. Leave room to breathe.',
        x: 16,
        y: 520,
        w: 328,
        h: 64,
        kind: 'text',
        fill: 'rgba(0,0,0,0.55)'
      }
    ]
  }
];

function mediaDataUrl(fileName) {
  const p = resolve(ROOT, 'packages/pen-protocol/src/starter-assets', fileName);
  if (!existsSync(p)) throw new Error(`missing_starter_asset:${fileName}`);
  const buf = readFileSync(p);
  const ext = fileName.split('.').pop()?.toLowerCase();
  const mime =
    ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function hydrateSpecMedia(spec) {
  const layers = (spec.layers || []).map((L) => {
    if (L.kind === 'image' && L.mediaFile) {
      return { ...L, imageSrc: mediaDataUrl(L.mediaFile) };
    }
    return { ...L };
  });
  return { ...spec, layers };
}

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

  const context = page.context();
  let popup = null;
  for (let attempt = 0; attempt < 3 && !popup; attempt++) {
    const popupPromise = page.waitForEvent('popup', { timeout: 30_000 }).catch(() => null);
    const pagePromise = context.waitForEvent('page', { timeout: 30_000 }).catch(() => null);
    await unlockBtn.click({ force: true }).catch(() => {});
    popup = (await popupPromise) || (await pagePromise);
    if (!popup) {
      process.stdout.write(`  pen unlock: no popup attempt ${attempt + 1} — retry\n`);
      await page.waitForTimeout(800);
    }
  }
  if (!popup) throw new Error('Pen unlock popup did not open');
  process.stdout.write(`  pen unlock popup: ${popup.url()}\n`);
  await fillConsentAndUnlockDom(popup, { ...creds, expectClose: true });

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

async function createFromStarter(page, spec) {
  if (!spec.starterId) {
    return createBlankSocial(page, spec);
  }
  const starterTitles = {
    'note.basic.portrait.v1': 'Note (Portrait)',
    'note.text_tile.light.v1': 'Text Tile (Light)',
    'note.media.portrait.v1': 'Note on Media (Portrait)',
    'quote.basic.v1': 'Quote Card',
    'post.image.portrait.v1': 'Image Post (Portrait)'
  };
  const wantTitle = starterTitles[spec.starterId] || spec.title;

  // Deep-link opens preview modal via TemplatesBrowse initialPreviewId (?template=).
  const previewUrl = `${PEN_URL}/templates?template=${encodeURIComponent(spec.starterId)}`;
  await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  // Full reload rehydrates session async (null → AuthenticatedApp). Wait for lock chrome
  // so Build actually creates instead of “Unlock to build”.
  const lockChrome = page
    .locator('[title="Lock session"], button[aria-label="Lock session"]')
    .first();
  const lockedIn = await lockChrome.isVisible({ timeout: 60_000 }).catch(() => false);
  if (!lockedIn) {
    throw new Error('pen_session_chrome_missing_after_templates_nav');
  }
  // Authenticated remount re-reads ?template= — give the modal a beat to open.
  await page.waitForTimeout(1500);

  const dialog = page.getByRole('dialog').first();
  const dialogVisible = await dialog.isVisible({ timeout: 8_000 }).catch(() => false);

  if (dialogVisible) {
    const clicked = await page.evaluate(() => {
      const btn =
        document.querySelector(
          '.pen-template-preview-modal button[aria-label="Build"], .pen-template-preview-modal .pen-templates-feed-build'
        ) || document.querySelector('.pen-template-engagement-build-slot button');
      if (!btn) return { ok: false, reason: 'no_btn' };
      btn.click();
      return { ok: true, text: (btn.textContent || '').trim() };
    });
    process.stdout.write(`  dialog Build DOM click ${clicked.ok ? 'ok' : 'miss'} ${clicked.text || clicked.reason || ''}\n`);
    if (clicked.ok) {
      await page
        .waitForFunction(() => /\/d\//.test(window.location.pathname), null, { timeout: 90_000 })
        .catch(() => null);
      if (!/\/d\//.test(page.url())) {
        throw new Error(`starter_create_no_nav url=${page.url()}`);
      }
      await page.waitForTimeout(1000);
      return page.url();
    }
    const diag = await page.evaluate(() => ({
      dialogLabel: document.querySelector('[role=dialog]')?.getAttribute('aria-label') || '',
      buildCount: document.querySelectorAll('button[aria-label="Build"]').length,
      modalHtml: document.querySelector('.pen-template-preview-modal')?.innerHTML?.slice(0, 300) || ''
    }));
    process.stdout.write(`  dialog Build miss diag=${JSON.stringify(diag)}\n`);
  }

  // Feed density (or dialog without Build): all slides mounted — click matching slide Build.
  const feedClicked = await page.evaluate((title) => {
    const slides = [...document.querySelectorAll('.pen-doc-feed-slide')];
    const slide = slides.find((s) => (s.textContent || '').includes(title));
    const btn =
      slide?.querySelector('button[aria-label="Build"], button.pen-templates-feed-build') || null;
    if (!btn) return { ok: false, slides: slides.length };
    btn.scrollIntoView({ block: 'center' });
    btn.click();
    return { ok: true, slides: slides.length };
  }, wantTitle);
  process.stdout.write(
    `  feed Build ${feedClicked?.ok ? 'clicked' : 'miss'} slides=${feedClicked?.slides ?? '?'} for ${wantTitle}\n`
  );
  if (!feedClicked?.ok) {
    process.stdout.write('  starter Build missing — falling back to blank\n');
    return createBlankSocial(page, spec);
  }

  await page
    .waitForFunction(() => /\/d\//.test(window.location.pathname), null, { timeout: 90_000 })
    .catch(() => null);
  if (!/\/d\//.test(page.url())) {
    throw new Error(`starter_create_no_nav url=${page.url()}`);
  }
  await page.waitForTimeout(1000);
  return page.url();
}

async function createBlankSocial(page, spec) {
  await page.goto(`${PEN_URL}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(2000);

  // Ensure library chrome (not locked landing)
  const library = page.locator('.pen-library-page, .pen-library-heading').first();
  if (!(await library.isVisible({ timeout: 15_000 }).catch(() => false))) {
    throw new Error('library_chrome_missing_after_unlock');
  }

  const opened = await page.evaluate(async () => {
    const btn =
      document.querySelector('button[aria-label="Add"]') ||
      document.querySelector('button[title="Add"]');
    if (!btn) return { ok: false, reason: 'add_btn_missing', items: [] };
    btn.click();
    await new Promise((r) => setTimeout(r, 80));
    const panel = document.querySelector('.pen-add-menu-panel');
    const items = panel
      ? [...panel.querySelectorAll('button')].map((b) => (b.textContent || '').trim())
      : [];
    return { ok: Boolean(panel), items, reason: panel ? '' : 'panel_not_open' };
  });
  if (!opened.ok) {
    // Playwright click fallback
    await page.getByRole('button', { name: 'Add' }).first().click({ force: true });
    await page.waitForTimeout(400);
    const items = await page.locator('.pen-add-menu-panel button').allTextContents().catch(() => []);
    if (!items.length) throw new Error(`add_menu:${opened.reason}`);
  }

  const blankClicked = await page.evaluate(() => {
    const panel = document.querySelector('.pen-add-menu-panel');
    const btn = panel
      ? [...panel.querySelectorAll('button')].find((b) =>
          /Blank document/i.test(b.textContent || '')
        )
      : null;
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!blankClicked) {
    throw new Error(`blank_item_missing items=${JSON.stringify(opened.items)}`);
  }
  await page.waitForTimeout(600);

  await page.waitForSelector('.pen-blank-wizard', { timeout: 10_000 });
  const formTitle = spec.formTitle || 'Notes';
  const titles = await page.locator('.pen-blank-wizard-option .font-semibold').allTextContents();
  process.stdout.write(`  blank wizard forms: ${titles.map((t) => t.trim()).join(' | ')}\n`);
  let idx = titles.findIndex((t) => t.trim() === formTitle);
  if (idx < 0) idx = titles.findIndex((t) => t.trim() === 'Custom');
  if (idx < 0) {
    throw new Error(`blank_form_missing wanted=${formTitle} titles=${JSON.stringify(titles)}`);
  }
  const selectedTitle = await page.evaluate(async (i) => {
    const opts = [...document.querySelectorAll('.pen-blank-wizard-option')];
    const el = opts[i];
    if (!el) return '';
    el.scrollIntoView({ block: 'center' });
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 150));
    const sel = document.querySelector('.pen-blank-wizard-option.is-selected .font-semibold');
    return (sel?.textContent || '').trim();
  }, idx);
  process.stdout.write(`  selected form: ${selectedTitle}\n`);
  if (!selectedTitle) {
    // Playwright force click fallback
    await page.locator('.pen-blank-wizard-option').nth(idx).click({ force: true });
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(200);

  const createBtn = page.locator('.pen-blank-wizard-foot button.pen-ribbon-btn.is-active').first();
  await createBtn.waitFor({ state: 'visible', timeout: 5_000 });
  for (let i = 0; i < 30; i++) {
    if (await createBtn.isEnabled()) break;
    await page.waitForTimeout(200);
  }
  if (!(await createBtn.isEnabled())) {
    throw new Error('create_still_disabled');
  }
  page.on('pageerror', (e) => console.log('  pageerror:', String(e.message || e).slice(0, 200)));
  await page.evaluate(() => {
    const btn = document.querySelector(
      '.pen-blank-wizard-foot button.pen-ribbon-btn.is-active'
    );
    if (btn && !btn.disabled) btn.click();
  });
  await page.waitForTimeout(2000);
  let creating = await page.getByRole('button', { name: /Creating/i }).isVisible().catch(() => false);
  if (!creating && !/\/d\//.test(page.url())) {
    // Playwright click fallback
    await createBtn.click({ force: true });
    await page.waitForTimeout(1500);
    creating = await page.getByRole('button', { name: /Creating/i }).isVisible().catch(() => false);
  }
  const navigated = await page
    .waitForFunction(() => /\/d\//.test(window.location.pathname), null, { timeout: 90_000 })
    .then(() => true)
    .catch(() => false);
  if (!navigated) {
    const err = await page
      .locator('.text-red-600')
      .allTextContents()
      .catch(() => []);
    const btnText = await createBtn.textContent().catch(() => '');
    throw new Error(
      `no_editor_nav creating=${creating} btn=${btnText} url=${page.url()} err=${JSON.stringify(err)}`
    );
  }
  await page.waitForTimeout(1000);
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
 * Build layers via Layers popover UI (no remount — live Pen blanks out on /d reload).
 */
async function buildLayers(page, spec) {
  // Set title in chrome if present
  await setTitle(page, spec.title);

  const layersBtn = page
    .locator('button[aria-label="Layers"], button[title="Layers"]')
    .or(page.getByRole('button', { name: /Layers/i }))
    .first();
  if (!(await layersBtn.isVisible({ timeout: 10_000 }).catch(() => false))) {
    // Fallback: inject into localStorage only (preview on next natural open)
    const injected = await page.evaluate((payload) => {
      try {
        const raw = sessionStorage.getItem('pen_session');
        const session = raw ? JSON.parse(raw) : null;
        const pn = session?.pnIdentifier;
        const docId = location.pathname.match(/\/d\/([^/]+)/)?.[1];
        if (!pn || !docId) return { ok: false, reason: 'no_pn_or_doc' };
        const key = `pen_docs_v1:${pn}:doc:${docId}`;
        const bundle = JSON.parse(localStorage.getItem(key) || 'null');
        if (!bundle?.sections?.[0]) return { ok: false, reason: 'no_local_doc' };
        const section = bundle.sections[0];
        section.layers = payload.layers.map((L, i) => {
          const kind = L.kind === 'image' ? 'image' : 'text';
          const base = {
            id: `headed_${payload.id}_${i}`,
            kind,
            name: L.name,
            zIndex: i + 1,
            x: L.x,
            y: L.y,
            w: L.w,
            h: L.h,
            positionLocked: true
          };
          if (kind === 'image') {
            return { ...base, imageSrc: L.imageSrc || '' };
          }
          const paras = String(L.text || '').split('\n');
          return {
            ...base,
            backgroundColor: L.fill || undefined,
            strokeColor: L.stroke || undefined,
            strokeWidth: L.stroke ? 1 : undefined,
            textDoc: {
              type: 'doc',
              content: paras.map((text) => ({
                type: 'paragraph',
                content: text ? [{ type: 'text', text }] : []
              }))
            }
          };
        });
        section.pagePresentation = {
          ...(section.pagePresentation || {}),
          backgroundColor: payload.bg
        };
        // Body text for compile (skip empty image-only lines)
        const bodyParas = payload.layers
          .filter((L) => L.kind !== 'image' && String(L.text || '').trim())
          .flatMap((L) =>
            String(L.text)
              .split('\n')
              .map((text) => ({
                type: 'paragraph',
                content: text ? [{ type: 'text', text }] : []
              }))
          );
        section.doc = {
          type: 'doc',
          content: bodyParas.length
            ? bodyParas
            : [{ type: 'paragraph', content: [{ type: 'text', text: payload.title }] }]
        };
        bundle.manifest.title = payload.title;
        bundle.manifest.updatedAt = new Date().toISOString();
        if (payload.bg) {
          bundle.manifest.pagePresentation = {
            ...(bundle.manifest.pagePresentation || {}),
            backgroundColor: payload.bg
          };
        }
        localStorage.setItem(key, JSON.stringify(bundle));
        return { ok: true, layerCount: section.layers.length, via: 'storage_only' };
      } catch (e) {
        return { ok: false, reason: String(e?.message || e) };
      }
    }, spec);
    return injected;
  }

  await layersBtn.click();
  await page.waitForTimeout(400);
  let added = 0;
  for (const L of spec.layers) {
    const addText = page
      .getByRole('button', { name: /Add text|Text/i })
      .or(page.locator('button', { hasText: /^\+$/ }))
      .first();
    if (await addText.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await addText.click();
      await page.waitForTimeout(350);
      added += 1;
    }
    const editor = page.locator('.ProseMirror, [contenteditable="true"]').first();
    if (await editor.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await editor.click();
      await page.keyboard.type(L.text.replace(/\n/g, ' · '), { delay: 5 });
      await page.waitForTimeout(200);
    }
  }
  // Also write storage so coords/title persist for publish compile
  await page.evaluate((payload) => {
    try {
      const session = JSON.parse(sessionStorage.getItem('pen_session') || 'null');
      const pn = session?.pnIdentifier;
      const docId = location.pathname.match(/\/d\/([^/]+)/)?.[1];
      if (!pn || !docId) return;
      const key = `pen_docs_v1:${pn}:doc:${docId}`;
      const bundle = JSON.parse(localStorage.getItem(key) || 'null');
      if (!bundle?.sections?.[0]) return;
      const section = bundle.sections[0];
      if (Array.isArray(section.layers) && section.layers.length) {
        payload.layers.forEach((L, i) => {
          const layer = section.layers[i];
          if (!layer) return;
          layer.x = L.x;
          layer.y = L.y;
          layer.w = L.w;
          layer.h = L.h;
          layer.name = L.name;
          const paras = String(L.text).split('\n');
          layer.textDoc = {
            type: 'doc',
            content: paras.map((text) => ({
              type: 'paragraph',
              content: text ? [{ type: 'text', text }] : []
            }))
          };
        });
      } else {
        // UI add failed — materialize layers for preview + coords
        section.layers = payload.layers.map((L, i) => {
          const paras = String(L.text).split('\n');
          return {
            id: `headed_${payload.id}_${i}`,
            kind: 'text',
            name: L.name,
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
      }
      // Connect → compileDocumentToNote requires plain text on section.doc (required body).
      // Overlay layers alone are not enough for Note compile.
      const bodyParas = payload.layers.flatMap((L) =>
        String(L.text)
          .split('\n')
          .map((text) => ({
            type: 'paragraph',
            content: text ? [{ type: 'text', text }] : []
          }))
      );
      section.doc = {
        type: 'doc',
        content: bodyParas.length
          ? bodyParas
          : [{ type: 'paragraph', content: [{ type: 'text', text: payload.title }] }]
      };
      section.pagePresentation = {
        ...(section.pagePresentation || {}),
        backgroundColor: payload.bg
      };
      bundle.manifest.title = payload.title;
      bundle.manifest.updatedAt = new Date().toISOString();
      localStorage.setItem(key, JSON.stringify(bundle));
    } catch {
      /* ignore */
    }
  }, spec);

  // Connect compile reads section.doc (TipTap body), not overlay layers alone.
  // Select Page in Layers and put the story copy into the flow editor so React SoT has text.
  const bodyText = spec.layers.map((L) => L.text).join('\n\n');
  const pageRow = page
    .locator('[role="dialog"][aria-label="Layers"] button, [role="dialog"][aria-label="Layers"] [role="option"]')
    .filter({ hasText: /^(Page|Body|Canvas)/i })
    .first();
  if (await pageRow.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await pageRow.click();
    await page.waitForTimeout(300);
  } else {
    // Toggle layers open if closed, click first row
    await page.locator('button[aria-label="Layers"], button[title="Layers"]').first().click().catch(() => {});
    await page.waitForTimeout(300);
    await page
      .locator('[role="dialog"][aria-label="Layers"]')
      .locator('button, [role="option"], li')
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(300);
  }
  const flowEditor = page.locator('.ProseMirror').first();
  if (await flowEditor.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await flowEditor.click({ force: true });
    await page.keyboard.press('Meta+A').catch(() => {});
    await page.keyboard.type(bodyText.slice(0, 500), { delay: 3 });
    await page.waitForTimeout(500);
  }
  // Always materialize designed layers into local SoT (coords + media + body).
  const stored = await page.evaluate((payload) => {
    try {
      const session = JSON.parse(sessionStorage.getItem('pen_session') || 'null');
      const pn = session?.pnIdentifier;
      const docId = location.pathname.match(/\/d\/([^/]+)/)?.[1];
      if (!pn || !docId) return { ok: false, reason: 'no_pn_or_doc' };
      const key = `pen_docs_v1:${pn}:doc:${docId}`;
      const bundle = JSON.parse(localStorage.getItem(key) || 'null');
      if (!bundle?.sections?.[0]) return { ok: false, reason: 'no_local_doc' };
      const section = bundle.sections[0];
      section.layers = payload.layers.map((L, i) => {
        const kind = L.kind === 'image' ? 'image' : 'text';
        const base = {
          id: `headed_${payload.id}_${i}`,
          kind,
          name: L.name,
          zIndex: i + 1,
          x: L.x,
          y: L.y,
          w: L.w,
          h: L.h,
          positionLocked: true
        };
        if (kind === 'image') {
          return { ...base, imageSrc: L.imageSrc || '' };
        }
        const paras = String(L.text || '').split('\n');
        return {
          ...base,
          backgroundColor: L.fill || undefined,
          strokeColor: L.stroke || undefined,
          strokeWidth: L.stroke ? 1 : undefined,
          textDoc: {
            type: 'doc',
            content: paras.map((text) => ({
              type: 'paragraph',
              content: text ? [{ type: 'text', text }] : []
            }))
          }
        };
      });
      const bodyParas = payload.layers
        .filter((L) => L.kind !== 'image' && String(L.text || '').trim())
        .flatMap((L) =>
          String(L.text)
            .split('\n')
            .map((text) => ({
              type: 'paragraph',
              content: text ? [{ type: 'text', text }] : []
            }))
        );
      section.doc = {
        type: 'doc',
        content: bodyParas.length
          ? bodyParas
          : [{ type: 'paragraph', content: [{ type: 'text', text: payload.title }] }]
      };
      section.pagePresentation = {
        ...(section.pagePresentation || {}),
        backgroundColor: payload.bg
      };
      bundle.manifest.title = payload.title;
      bundle.manifest.updatedAt = new Date().toISOString();
      if (payload.bg) {
        bundle.manifest.pagePresentation = {
          ...(bundle.manifest.pagePresentation || {}),
          backgroundColor: payload.bg
        };
      }
      localStorage.setItem(key, JSON.stringify(bundle));
      return { ok: true, layerCount: section.layers.length };
    } catch (e) {
      return { ok: false, reason: String(e?.message || e) };
    }
  }, spec);

  return {
    ok: Boolean(stored.ok),
    layerCount: stored.layerCount || added,
    via: stored.ok ? 'storage' : 'ui',
    reason: stored.reason
  };
}

async function dismissLayers(page) {
  // Layers popover is role=dialog aria-label="Layers"; chrome button label varies.
  const dialog = page.locator('[role="dialog"][aria-label="Layers"]').first();
  if (await dialog.isVisible({ timeout: 500 }).catch(() => false)) {
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(250);
    if (await dialog.isVisible().catch(() => false)) {
      // Click page background to fire LayersPopover outside-mousedown close
      await page.locator('body').click({ position: { x: 8, y: 8 }, force: true }).catch(() => {});
      await page.waitForTimeout(250);
    }
  }
}

async function connectAsPublicTemplate(page, context, spec) {
  await page.waitForTimeout(1500);
  await dismissLayers(page);

  const publish = page
    .locator('button[aria-label="Publish"], button[title="Publish"]')
    .first();
  if (!(await publish.isVisible({ timeout: 15_000 }).catch(() => false))) {
    const labels = await page.evaluate(() =>
      [...document.querySelectorAll('button[aria-label], button[title]')]
        .slice(0, 40)
        .map((b) => b.getAttribute('aria-label') || b.getAttribute('title') || '')
    );
    return { ok: false, reason: `publish_missing labels=${labels.join('|')}` };
  }

  // DOM click — Playwright pointer events can lose the target when Layers remounts.
  const opened = await page.evaluate(() => {
    const pub = document.querySelector('button[aria-label="Publish"], button[title="Publish"]');
    if (!pub) return { ok: false, reason: 'no_publish_el' };
    // Ensure open: if menu already visible from dismissLayers, skip re-toggle
    const already = [...document.querySelectorAll('button')].some((b) =>
      /Connect to feed/i.test(b.textContent || '')
    );
    if (!already) pub.click();
    return { ok: true, already };
  });
  await page.waitForTimeout(500);

  const menuButtons = await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .map((b) => (b.textContent || '').trim())
      .filter((t) => /Publish|Connect|template|Share|Send|Library|As /i.test(t))
      .slice(0, 20)
  );
  process.stdout.write(`  publish menu: ${menuButtons.join(' | ')}\n`);

  const connectClicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      /Connect to feed/i.test(b.textContent || '')
    );
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!connectClicked) {
    // Retry: open publish then connect
    await page.evaluate(() => {
      document.querySelector('button[aria-label="Publish"]')?.click();
    });
    await page.waitForTimeout(400);
    const retry = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        /Connect to feed/i.test(b.textContent || '')
      );
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (!retry) {
      const again = await page.evaluate(() =>
        [...document.querySelectorAll('button')]
          .map((b) => (b.textContent || '').trim())
          .filter((t) => /Publish|Connect|template|Share|Send|Library|As /i.test(t))
          .slice(0, 20)
      );
      return { ok: false, reason: `connect_missing menu=${again.join(',')}` };
    }
  }
  await page.waitForTimeout(500);

  const templateLabel = page.locator('label', { hasText: /Pen templates/i }).first();
  await templateLabel.waitFor({ state: 'visible', timeout: 8_000 });
  const templateState = await page.evaluate(() => {
    const label = [...document.querySelectorAll('label')].find((l) =>
      /Pen templates/i.test(l.textContent || '')
    );
    const input = label?.querySelector('input[type="checkbox"]');
    if (!input) return { ok: false, reason: 'no_checkbox' };
    if (input.disabled) return { ok: false, reason: 'disabled', enabled: false };
    if (!input.checked) {
      input.click();
    }
    return { ok: true, enabled: true, checked: input.checked };
  });
  if (!templateState.ok) {
    return {
      ok: false,
      reason:
        templateState.reason === 'disabled'
          ? 'pen_templates_disabled_allowlist?'
          : `pen_templates_${templateState.reason}`,
      enabled: false
    };
  }
  // Confirm checked after React re-render
  await page.waitForTimeout(200);
  const confirmed = await templateLabel.locator('input[type="checkbox"]').isChecked().catch(() => false);
  if (!confirmed) {
    await templateLabel.click({ force: true });
    await page.waitForTimeout(200);
  }
  if (!(await templateLabel.locator('input[type="checkbox"]').isChecked().catch(() => false))) {
    return { ok: false, reason: 'pen_templates_check_failed', enabled: true };
  }

  // Prefer pen-templates (+ browse is fine; Browse upload UI handles targets)
  await page.waitForTimeout(200);

  const beforePages = new Set(context.pages().map((p) => p));
  const popupPromise = context.waitForEvent('page', { timeout: 90_000 }).catch(() => null);

  // Build handoff in-page from live local bundle + story copy, then open Browse.
  // TipTap layer typing in headed Playwright often does not flush into React SoT
  // before Share; craft the same payload Share would emit after compile.
  const handoffOpened = await page.evaluate((story) => {
    try {
      const session = JSON.parse(sessionStorage.getItem('pen_session') || 'null');
      const pn = session?.pnIdentifier;
      const docId = location.pathname.match(/\/d\/([^/]+)/)?.[1];
      if (!pn || !docId) return { ok: false, reason: 'no_pn_or_doc' };
      const key = `pen_docs_v1:${pn}:doc:${docId}`;
      const bundle = JSON.parse(localStorage.getItem(key) || 'null');
      if (!bundle?.manifest) return { ok: false, reason: 'no_bundle' };

      const content = story.layers.map((L) => String(L.text)).join('\n\n');
      const paras = content.split('\n').map((line) => ({
        type: 'paragraph',
        content: line ? [{ type: 'text', text: line }] : []
      }));
      const tipTap = { type: 'doc', content: paras.length ? paras : [{ type: 'paragraph' }] };

      // Persist body into local SoT for any remount / draft flush
      if (bundle.sections?.[0]) {
        bundle.sections[0].doc = tipTap;
        if (!Array.isArray(bundle.sections[0].layers) || !bundle.sections[0].layers.length) {
          bundle.sections[0].layers = story.layers.map((L, i) => ({
            id: `headed_${story.id}_${i}`,
            kind: 'text',
            name: L.name,
            zIndex: i + 1,
            x: L.x,
            y: L.y,
            w: L.w,
            h: L.h,
            textDoc: {
              type: 'doc',
              content: String(L.text)
                .split('\n')
                .map((text) => ({
                  type: 'paragraph',
                  content: text ? [{ type: 'text', text }] : []
                }))
            }
          }));
        }
        bundle.sections[0].pagePresentation = {
          ...(bundle.sections[0].pagePresentation || {}),
          backgroundColor: story.bg
        };
        bundle.manifest.title = story.title;
        localStorage.setItem(key, JSON.stringify(bundle));
      }

      const head =
        (bundle.chain?.links && bundle.chain.links[bundle.chain.links.length - 1]) ||
        bundle.chain?.genesis ||
        bundle.manifest.genesisProof ||
        null;

      const payload = {
        contentClass: 'note',
        title: story.title || bundle.manifest.title || 'Untitled',
        pages: [
          {
            content,
            style: bundle.sections?.[0]?.pagePresentation || {},
            doc: tipTap
          }
        ],
        templateId: bundle.manifest.templateId,
        docId,
        headProof: head,
        aggregatorTargets: ['pen-templates'],
        penClassId: bundle.manifest.classId,
        penCategoryId: 'social',
        penTemplateKind: 'template',
        basedOnTemplateId: bundle.manifest.basedOnTemplateId || bundle.manifest.templateId,
        penIrRef: { objectId: docId },
        licensing: bundle.manifest.licensing
      };

      const hash = `#pen_publish_handoff_v1:${encodeURIComponent(JSON.stringify(payload))}`;
      const url = `https://browse.parnoir.com/?view=upload${hash}`;
      const w = window.open(url, '_blank');
      if (!w) {
        window.location.assign(url);
        return { ok: true, via: 'assign' };
      }
      return { ok: true, via: 'open' };
    } catch (e) {
      return { ok: false, reason: String(e?.message || e) };
    }
  }, {
    id: spec.id,
    title: spec.title,
    bg: spec.bg,
    layers: spec.layers
  });

  if (!handoffOpened.ok) {
    return { ok: false, reason: `handoff_open:${handoffOpened.reason}`, enabled: true };
  }
  process.stdout.write(`  handoff open: ${handoffOpened.via}\n`);

  let browsePage = await popupPromise;
  if (!browsePage) {
    for (let i = 0; i < 45; i++) {
      const status = await page
        .evaluate(() => ({ url: location.href }))
        .catch(() => ({ url: page.url() }));
      if (/browse\.parnoir|browse-parnoir|\?view=upload/i.test(status.url)) {
        browsePage = page;
        break;
      }
      const fresh = context.pages().find((p) => !beforePages.has(p) || /browse/i.test(p.url()));
      if (fresh && /browse/i.test(fresh.url())) {
        browsePage = fresh;
        break;
      }
      await page.waitForTimeout(1000);
    }
  }

  if (!browsePage) {
    const pages = context.pages();
    browsePage =
      pages.find((p) => /browse/i.test(p.url()) && /view=upload|pen_publish/i.test(p.url())) ||
      pages.find((p) => /browse/i.test(p.url()) && p !== page) ||
      null;
    process.stdout.write(
      `  after handoff: pages=${pages.map((p) => p.url().slice(0, 80)).join(' || ')}\n`
    );
    if (!browsePage) {
      return { ok: false, reason: 'no_browse_tab', enabled: true };
    }
  }

  return { ok: Boolean(browsePage), browsePage, enabled: true, reason: browsePage ? '' : 'no_browse_tab' };
}

async function fillConsentAndUnlockDom(popupOrPage, { identityPath, PN_NAME, PASSCODE, expectClose = true }) {
  // Prefer domcontentloaded — unlock broker SPA often never fires full "load".
  await popupOrPage
    .waitForURL(/oauth\/consent|authorize|unlock\.parnoir/, {
      timeout: 90_000,
      waitUntil: 'domcontentloaded'
    })
    .catch(() => {});
  process.stdout.write(`  consent url: ${popupOrPage.url()}\n`);
  // Broker may paint Unlock UI after consent URL resolves.
  // Live unlock UI uses #pn-identity-file (legacy #identityFile).
  const fileInput = popupOrPage
    .locator('#pn-identity-file, #identityFile, input[type="file"]')
    .first();
  try {
    await fileInput.waitFor({ state: 'attached', timeout: 30_000 });
  } catch (e) {
    const html = await popupOrPage.content().catch(() => '');
    throw new Error(
      `consent_file_input_missing url=${popupOrPage.url()} htmlLen=${html.length}`
    );
  }
  process.stdout.write('  consent: file input attached\n');
  await fileInput.setInputFiles(identityPath);
  process.stdout.write('  consent: identity file set\n');
  await popupOrPage.getByPlaceholder('Enter Key 1').fill(PN_NAME);
  await popupOrPage.getByPlaceholder('Enter Key 2').fill(PASSCODE);
  process.stdout.write('  consent: keys filled — clicking Unlock pN\n');
  await popupOrPage.getByRole('button', { name: 'Unlock pN' }).click();
  const approve = popupOrPage.getByRole('button', { name: 'Approve' });
  try {
    await approve.waitFor({ state: 'visible', timeout: 90_000 });
    process.stdout.write('  consent: Approve visible — clicking\n');
    await approve.click();
  } catch {
    process.stdout.write('  consent: no Approve (existing grant / handoff)\n');
  }
  if (expectClose) {
    await popupOrPage.waitForEvent('close', { timeout: 30_000 }).catch(() => {});
  } else {
    await popupOrPage.waitForTimeout(3_000);
  }
}

async function unlockBrowseIfNeeded(browsePage, creds, context) {
  // Live chrome title is "Unlock pN" / "Lock pN" (LockButtonWithContext).
  const unlockBtn = browsePage
    .getByTitle('Unlock pN')
    .or(browsePage.locator('button[title="Unlock pN"]'))
    .or(browsePage.getByRole('button', { name: /Unlock pN/i }))
    .first();

  if (!(await unlockBtn.isVisible({ timeout: 8_000 }).catch(() => false))) {
    const locked = await browsePage.getByTitle('Lock pN').isVisible().catch(() => false);
    return { ok: true, skipped: true, reason: locked ? 'already_unlocked' : 'no_unlock_btn' };
  }

  try {
    // Prefer-app waits ~1.4s then window.open — listen on context + page.
    const popupPromise = browsePage.waitForEvent('popup', { timeout: 60_000 }).catch(() => null);
    const pagePromise = context
      .waitForEvent('page', { timeout: 60_000 })
      .catch(() => null);
    await unlockBtn.click({ force: true });
    let popup = (await popupPromise) || (await pagePromise);
    // Prefer-app false positive (headed blur) skips window.open — retry click once.
    if (!popup) {
      await browsePage.waitForTimeout(2000);
      process.stdout.write(
        `  browse unlock: no popup yet url=${browsePage.url()} — retry click\n`
      );
      const retryPopup = browsePage.waitForEvent('popup', { timeout: 45_000 }).catch(() => null);
      const retryPage = context.waitForEvent('page', { timeout: 45_000 }).catch(() => null);
      await unlockBtn.click({ force: true });
      popup = (await retryPopup) || (await retryPage);
    }
    process.stdout.write(
      `  browse unlock popup: ${popup ? popup.url() : 'none'} page=${browsePage.url()}\n`
    );
    if (!popup) {
      await browsePage.waitForTimeout(1500);
      const fileOnPage = await browsePage
        .locator('#identityFile, input[type="file"]')
        .first()
        .isVisible()
        .catch(() => false);
      if (!fileOnPage) {
        return { ok: false, skipped: false, reason: 'no_consent_ui_after_unlock_click' };
      }
      popup = browsePage;
    } else {
      await popup.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => {});
      process.stdout.write(`  browse unlock popup loaded: ${popup.url()}\n`);
    }
    await fillConsentAndUnlockDom(popup, {
      ...creds,
      expectClose: popup !== browsePage
    });
    // Wait until Lock pN appears (session applied)
    for (let i = 0; i < 40; i++) {
      if (await browsePage.getByTitle('Lock pN').isVisible().catch(() => false)) break;
      await browsePage.waitForTimeout(500);
    }
    const unlocked = await browsePage.getByTitle('Lock pN').isVisible().catch(() => false);
    return { ok: unlocked, skipped: false, reason: unlocked ? '' : 'session_not_applied' };
  } catch (e) {
    return {
      ok: false,
      skipped: false,
      reason: e instanceof Error ? e.message : String(e)
    };
  }
}

async function finishBrowseUpload(browsePage, creds, context) {
  if (!browsePage) return { ok: false, reason: 'no_browse_tab' };
  await browsePage.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => {});
  await browsePage.bringToFront().catch(() => {});
  await browsePage.waitForTimeout(1500);

  process.stdout.write(`  browse url: ${browsePage.url()}\n`);

  const unlocked = await unlockBrowseIfNeeded(browsePage, creds, context);
  process.stdout.write(
    `  browse unlock: ${unlocked.skipped ? 'already/skip' : unlocked.ok ? 'ok' : 'fail'}\n`
  );

  // Handoff may reopen upload after unlock — wait for modal / composer
  await browsePage.waitForTimeout(2000);

  // Common upload / publish controls
  const candidates = [
    browsePage.getByRole('button', { name: /^Publish$/i }),
    browsePage.getByRole('button', { name: /^Post$/i }),
    browsePage.getByRole('button', { name: /Upload/i }),
    browsePage.getByRole('button', { name: /^Share$/i }),
    browsePage.getByRole('button', { name: /Submit/i }),
    browsePage.locator('button').filter({ hasText: /^Publish$/i })
  ];

  for (const loc of candidates) {
    if (await loc.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await loc.first().click();
      await browsePage.waitForTimeout(8000);
      const hint = await browsePage.evaluate(() =>
        (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 200)
      );
      process.stdout.write(`  after publish click: ${hint}\n`);
      return { ok: true, hint };
    }
  }

  // Dump labels for diagnosis
  const labels = await browsePage.evaluate(() =>
    [...document.querySelectorAll('button')]
      .map((b) => (b.textContent || b.getAttribute('aria-label') || '').trim())
      .filter(Boolean)
      .slice(0, 30)
  );
  return {
    ok: false,
    reason: `upload_ui_not_found buttons=${labels.join('|')}`,
    url: browsePage.url()
  };
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
    slowMo: HEADLESS ? 0 : 40
  });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    // Keep popups (Browse handoff uses window.open)
    javaScriptEnabled: true
  });
  // Headed Chromium often blurs during Unlock; prefer-app then skips window.open.
  // Force the HTTPS popup path so Playwright can fill consent.
  await context.addInitScript(() => {
    try {
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get() {
          return false;
        }
      });
    } catch {
      /* ignore */
    }
    window.addEventListener(
      'blur',
      (e) => {
        e.stopImmediatePropagation();
      },
      true
    );
    // Prefer-app fires a hidden <a href="com.parnoir.unlock://…"> click.
    // Swallow it so launchUnlockBroker falls through to window.open.
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (...args) {
      try {
        const href = String(this.getAttribute('href') || this.href || '');
        if (/^com\.parnoir\.unlock:/i.test(href) || href.includes('://oauth/consent')) {
          if (href.startsWith('com.parnoir.unlock:') || href.startsWith('parnoir-unlock:')) {
            return;
          }
        }
      } catch {
        /* ignore */
      }
      return origClick.apply(this, args);
    };
  });
  const page = await context.newPage();

  let fails = 0;
  try {
    console.log('\n=== Unlock Pen ===');
    const session = await unlockPen(page, creds);
    ok('session token', session.hasAccessToken);
    ok('signing keys', session.hasMlDsa);
    const pn = session.pnIdentifier || '';
    ok(
      'pnIdentifier present',
      Boolean(pn),
      pn ? `${pn.slice(0, 16)}… (len=${pn.length})` : ''
    );

    // Pre-warm Browse unlock in this browser context (headed)
    console.log('\n=== Unlock Browse (pre-warm) ===');
    const browseWarm = await context.newPage();
    try {
      await browseWarm.goto(`${BROWSE_URL}/`, {
        waitUntil: 'domcontentloaded',
        timeout: 90_000
      });
      const warm = await unlockBrowseIfNeeded(browseWarm, creds, context);
      ok('browse pre-warm unlock', warm.ok !== false, warm.reason || (warm.skipped ? 'skipped' : ''));
    } catch (e) {
      ok('browse pre-warm unlock', false, e instanceof Error ? e.message : String(e));
    }
    await browseWarm.close().catch(() => {});

    const specs = SPECS.slice(0, MAX_TEMPLATES).map(hydrateSpecMedia);
    for (const spec of specs) {
      console.log(`\n=== Template: ${spec.id} ===`);
      try {
        const url = await createFromStarter(page, spec);
        ok('created', /\/d\//.test(url), url.replace(PEN_URL, ''));
        await setTitle(page, spec.title);
        const built = await buildLayers(page, spec);
        ok('layers built', Boolean(built.ok), built.reason || `n=${built.layerCount}`);
        if (!built.ok) {
          fails += 1;
          continue;
        }

        // Autosave / draft
        await page.waitForTimeout(2500);

        // Commit when available (real flatten for published feed)
        const commitBtn = page
          .getByRole('button', { name: /^Commit$/i })
          .or(page.locator('button[aria-label="Commit"], button[title="Commit"]'))
          .first();
        if (await commitBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await commitBtn.click().catch(() => {});
          await page.waitForTimeout(4000);
          ok('commit clicked', true);
        } else {
          ok('commit clicked', true, 'skipped_no_button');
        }

        const share = await connectAsPublicTemplate(page, context, spec);
        ok('connect menu', Boolean(share.ok), share.reason || '');
        if (!share.ok) {
          fails += 1;
          continue;
        }
        ok('pen-templates enabled', share.enabled === true);

        const upload = await finishBrowseUpload(share.browsePage, creds, context);
        ok('browse upload', upload.ok, upload.reason || upload.url || '');
        if (!upload.ok) fails += 1;

        if (share.browsePage && share.browsePage !== page && !share.browsePage.isClosed()) {
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
