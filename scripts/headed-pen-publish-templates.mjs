/**
 * Headed live suite: unlock Pen with cursor-test-pn, build real social templates
 * (blank → layers → copy → arrange → Connect to feed → owner cloud).
 * Template reuse is a second Pen action after the post exists. Browse only aggregates.
 *
 * Usage:
 *   node scripts/headed-pen-publish-templates.mjs
 *   PEN_URL=https://pen.parnoir.com BROWSE_URL=https://browse.parnoir.com HEADLESS=0 node …
 *
 * Never logs Key 1 / Key 2 / passcode / pn name.
 * Layout framework: portrait 9:16 story safe zones (hook / body / CTA in center band).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PEN_URL = (process.env.PEN_URL || 'https://pen.parnoir.com').replace(/\/$/, '');
const BROWSE_URL = (process.env.BROWSE_URL || 'https://browse.parnoir.com').replace(/\/$/, '');
const HEADLESS = process.env.HEADLESS === '1';
const MAX_TEMPLATES = Math.max(1, Number(process.env.MAX_TEMPLATES || 5));
const ONLY_SPEC = (process.env.ONLY_SPEC || '').trim();

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
    bg: '#0c0c0c',
    layers: [
      {
        name: 'Still',
        kind: 'image',
        mediaFile: 'note-hero.jpg',
        x: 0,
        y: 0,
        w: 360,
        h: 640
      },
      {
        name: 'Scrim',
        kind: 'text',
        text: '',
        x: 0,
        y: 0,
        w: 360,
        h: 640,
        gradient: 'linear-gradient(180deg, rgba(12,12,12,0.15) 0%, rgba(12,12,12,0.78) 100%)'
      },
      {
        name: 'Eyebrow',
        kind: 'text',
        text: 'NOTE',
        x: 28,
        y: 360,
        w: 120,
        h: 28,
        fill: '#0f766e'
      },
      {
        name: 'Hook',
        kind: 'text',
        text: 'Say the thing once.',
        x: 28,
        y: 400,
        w: 304,
        h: 72
      },
      {
        name: 'Body',
        kind: 'text',
        text: 'Then get out of the way.',
        x: 28,
        y: 480,
        w: 304,
        h: 80
      }
    ]
  },
  {
    id: 'light-tile',
    title: 'One clear thought',
    starterId: 'note.text_tile.light.v1',
    bg: '#e7e5e4',
    layers: [
      {
        name: 'Photo',
        kind: 'image',
        mediaFile: 'card-note.jpg',
        x: 0,
        y: 0,
        w: 360,
        h: 640
      },
      {
        name: 'Card',
        kind: 'text',
        text: 'One clear thought.\n\nHigh contrast on paper.',
        x: 28,
        y: 180,
        w: 304,
        h: 240,
        fill: '#ffffff',
        stroke: '#d6d3d1'
      }
    ]
  },
  {
    id: 'note-on-media',
    title: 'The words are the post',
    starterId: 'note.media.portrait.v1',
    bg: '#0c0c0c',
    layers: [
      {
        name: 'Backdrop',
        kind: 'image',
        mediaFile: 'caption-bg.jpg',
        x: 0,
        y: 0,
        w: 360,
        h: 640
      },
      {
        name: 'Scrim',
        kind: 'text',
        text: '',
        x: 0,
        y: 280,
        w: 360,
        h: 360,
        gradient: 'linear-gradient(180deg, rgba(12,12,12,0) 0%, rgba(12,12,12,0.88) 40%)'
      },
      {
        name: 'Card',
        kind: 'text',
        text: 'The words are the post.\n\nMedia is atmosphere.',
        x: 24,
        y: 360,
        w: 312,
        h: 180,
        fill: 'rgba(12,12,12,0.88)',
        stroke: 'rgba(184,149,108,0.35)'
      }
    ]
  },
  {
    id: 'quote-card',
    title: 'Clarity is a kindness',
    starterId: 'quote.basic.v1',
    bg: '#0c0c0c',
    layers: [
      {
        name: 'Still',
        kind: 'image',
        mediaFile: 'image-post.jpg',
        x: 0,
        y: 0,
        w: 360,
        h: 640
      },
      {
        name: 'Motion',
        kind: 'video',
        mediaFile: 'video-post-sm.mp4',
        x: 28,
        y: 72,
        w: 304,
        h: 172
      },
      {
        name: 'Quote',
        kind: 'text',
        text: 'Clarity is a kindness you practice in public.',
        x: 28,
        y: 280,
        w: 304,
        h: 160,
        fill: 'rgba(12,12,12,0.82)'
      },
      {
        name: 'Byline',
        kind: 'text',
        text: '— Ada Okonkwo',
        x: 28,
        y: 460,
        w: 304,
        h: 40
      }
    ]
  },
  {
    id: 'image-post',
    title: 'Frame the subject',
    starterId: 'post.image.portrait.v1',
    bg: '#000000',
    layers: [
      {
        name: 'Photo',
        kind: 'image',
        mediaFile: 'image-post.jpg',
        x: 0,
        y: 0,
        w: 360,
        h: 640
      },
      {
        name: 'Caption',
        kind: 'text',
        text: 'Frame the subject. Leave room to breathe.',
        x: 0,
        y: 540,
        w: 360,
        h: 100,
        fill: 'rgba(0,0,0,0.62)'
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
    ext === 'mp4'
      ? 'video/mp4'
      : ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function hydrateSpecMedia(spec) {
  const layers = (spec.layers || []).map((L) => {
    if ((L.kind === 'image' || L.kind === 'video') && L.mediaFile) {
      const src = mediaDataUrl(L.mediaFile);
      return L.kind === 'video' ? { ...L, videoSrc: src } : { ...L, imageSrc: src };
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
 * Arrange a media stack in the live editor.
 * Opens Layers, adds a layer through the Add menu, then writes the stack
 * through that popover's onSectionChange (same persist path as New layer).
 * Autosave migrates data: URLs to penlocal: refs.
 */
async function buildLayers(page, spec) {
  await setTitle(page, spec.title);

  const layersBtn = page.getByRole('button', { name: 'Layers' }).first();
  if (!(await layersBtn.isVisible({ timeout: 15_000 }).catch(() => false))) {
    return { ok: false, reason: 'layers_button_missing' };
  }
  await layersBtn.click();
  const dialog = page.locator('[role="dialog"][aria-label="Layers"]');
  if (!(await dialog.isVisible({ timeout: 8_000 }).catch(() => false))) {
    return { ok: false, reason: 'layers_dialog_missing' };
  }

  const addBtn = dialog.getByRole('button', { name: 'Add' }).first();
  if (await addBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await addBtn.click();
    const newLayer = dialog.getByRole('menuitem', { name: 'New layer' });
    if (await newLayer.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await newLayer.click();
      await page.waitForTimeout(400);
    }
  }

  const pushed = await page.evaluate((payload) => {
    const dialogEl = document.querySelector('[role="dialog"][aria-label="Layers"]');
    if (!dialogEl) return { ok: false, reason: 'no_dialog' };
    const fiberKey = Object.keys(dialogEl).find((k) => k.startsWith('__reactFiber$'));
    if (!fiberKey) return { ok: false, reason: 'no_react_fiber' };
    let fiber = dialogEl[fiberKey];
    let props = null;
    for (let i = 0; fiber && i < 50; i += 1, fiber = fiber.return) {
      const candidate = fiber.memoizedProps;
      if (
        candidate &&
        typeof candidate.onSectionChange === 'function' &&
        candidate.section &&
        Array.isArray(candidate.section.layers)
      ) {
        props = candidate;
        break;
      }
    }
    if (!props) return { ok: false, reason: 'no_onSectionChange' };

    const tipTap = (text) => ({
      type: 'doc',
      content: String(text || '')
        .split('\n')
        .map((line) => ({
          type: 'paragraph',
          content: line ? [{ type: 'text', text: line }] : []
        }))
    });

    const layers = payload.layers.map((L, i) => {
      const base = {
        id: `headed_${payload.id}_${i}`,
        kind: L.kind === 'video' ? 'video' : L.kind === 'image' ? 'image' : 'text',
        name: L.name,
        zIndex: i + 1,
        x: L.x,
        y: L.y,
        w: L.w,
        h: L.h,
        visible: true,
        positionLocked: true
      };
      if (base.kind === 'image') return { ...base, imageSrc: L.imageSrc || '' };
      if (base.kind === 'video') return { ...base, videoSrc: L.videoSrc || '' };
      return {
        ...base,
        backgroundColor: L.fill || undefined,
        backgroundGradient: L.gradient || undefined,
        strokeColor: L.stroke || undefined,
        strokeWidth: L.stroke ? 1 : undefined,
        textDoc: tipTap(L.text || '')
      };
    });

    const bodyParas = payload.layers
      .filter((L) => L.kind === 'text' && String(L.text || '').trim())
      .flatMap((L) =>
        String(L.text)
          .split('\n')
          .map((line) => ({
            type: 'paragraph',
            content: line ? [{ type: 'text', text: line }] : []
          }))
      );
    const next = {
      ...props.section,
      layers,
      doc: {
        type: 'doc',
        content: bodyParas.length
          ? bodyParas
          : [{ type: 'paragraph', content: [{ type: 'text', text: payload.title }] }]
      }
    };
    props.onSectionChange(next);
    const media = layers.filter((l) => l.kind === 'image' || l.kind === 'video').length;
    return { ok: true, layerCount: layers.length, media };
  }, spec);

  if (!pushed?.ok) return pushed;

  // Idle autosave migrates inline media into penlocal: refs.
  const mediaNeeded = (spec.layers || []).filter((L) => L.kind === 'image' || L.kind === 'video').length;
  const migrated = await page
    .waitForFunction(
      (need) => {
        try {
          const session = JSON.parse(sessionStorage.getItem('pen_session') || 'null');
          const pn = session?.pnIdentifier;
          const docId = location.pathname.match(/\/d\/([^/]+)/)?.[1];
          if (!pn || !docId) return null;
          const bundle = JSON.parse(localStorage.getItem(`pen_docs_v1:${pn}:doc:${docId}`) || 'null');
          const layers = bundle?.sections?.[0]?.layers || [];
          const refs = layers.filter((l) =>
            String(l.imageSrc || l.videoSrc || '').startsWith('penlocal:')
          );
          if (refs.length < need) return null;
          return { refs: refs.length, kinds: layers.map((l) => l.kind).join(',') };
        } catch {
          return null;
        }
      },
      mediaNeeded,
      { timeout: 25_000, polling: 500 }
    )
    .then((h) => h.jsonValue())
    .catch(() => null);

  if (!migrated) {
    return {
      ok: false,
      reason: `media_not_migrated need=${mediaNeeded}`,
      layerCount: pushed.layerCount
    };
  }
  process.stdout.write(`  media migrated penlocal=${migrated.refs} kinds=${migrated.kinds}\n`);
  return { ok: true, layerCount: pushed.layerCount, media: migrated.refs, via: 'editor' };
}

async function commitCurrentVersion(page) {
  const more = page.getByRole('button', { name: 'More save options' }).first();
  if (!(await more.isVisible({ timeout: 8_000 }).catch(() => false))) {
    return { ok: false, reason: 'save_menu_missing' };
  }
  await more.click();
  const item = page.getByRole('button', { name: 'Commit to current version' }).first();
  if (!(await item.isVisible({ timeout: 5_000 }).catch(() => false))) {
    return { ok: false, reason: 'commit_item_missing' };
  }
  await item.click();
  const hasVideo = await page.evaluate(() => {
    try {
      const session = JSON.parse(sessionStorage.getItem('pen_session') || 'null');
      const pn = session?.pnIdentifier;
      const docId = location.pathname.match(/\/d\/([^/]+)/)?.[1];
      const bundle = JSON.parse(localStorage.getItem(`pen_docs_v1:${pn}:doc:${docId}`) || 'null');
      const layers = bundle?.sections?.[0]?.layers || [];
      return layers.some((l) => l.kind === 'video' && l.videoSrc);
    } catch {
      return false;
    }
  });
  const result = await page
    .waitForFunction(
      () => {
        try {
          const session = JSON.parse(sessionStorage.getItem('pen_session') || 'null');
          const pn = session?.pnIdentifier;
          const docId = location.pathname.match(/\/d\/([^/]+)/)?.[1];
          if (!pn || !docId) return null;
          const bundle = JSON.parse(
            localStorage.getItem(`pen_docs_v1:${pn}:doc:${docId}`) || 'null'
          );
          const ref = bundle?.manifest?.galleryPreviewRef;
          const status = (document.body?.innerText || '').slice(0, 800);
          if (ref) {
            return {
              ok: true,
              ref: String(ref).slice(0, 40),
              kind: bundle.manifest.galleryPreviewKind || ''
            };
          }
          if (/gallery preview skipped/i.test(status)) {
            return { ok: false, reason: 'gallery_preview_skipped' };
          }
          return null;
        } catch {
          return null;
        }
      },
      null,
      { timeout: hasVideo ? 360_000 : 180_000, polling: 1000 }
    )
    .then((h) => h.jsonValue())
    .catch(async () => {
      const status = await page
        .evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 180))
        .catch(() => '');
      return { ok: false, reason: `commit_timeout status=${status}` };
    });
  return result || { ok: false, reason: 'commit_timeout' };
}

async function verifyPublishedTitles(titles) {
  const apiRes = await fetch(
    'https://api.parnoir.com/api/aggregator/metadata-index?limit=200'
  );
  if (!apiRes.ok) return { ok: false, reason: `index_${apiRes.status}`, found: [] };
  const data = await apiRes.json();
  const files = Array.isArray(data.files) ? data.files : [];
  const templates = files.filter((f) => f?.metadata?.penTemplateKind);
  const blob = JSON.stringify(templates);
  const found = titles.filter((t) => blob.includes(t));
  return { ok: found.length === titles.length, found, scanned: templates.length };
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

async function exportCommittedGallery(page, spec) {
  const b64 = await page
    .evaluate(async () => {
      try {
        const session = JSON.parse(sessionStorage.getItem('pen_session') || 'null');
        const pn = session?.pnIdentifier;
        const docId = location.pathname.match(/\/d\/([^/]+)/)?.[1];
        if (!pn || !docId) return null;
        const bundle = JSON.parse(localStorage.getItem(`pen_docs_v1:${pn}:doc:${docId}`) || 'null');
        const ref = String(bundle?.manifest?.galleryPreviewRef || '');
        const fileId = ref.startsWith('penmedia:') ? ref.slice('penmedia:'.length) : '';
        if (!fileId || bundle?.manifest?.galleryPreviewKind === 'video') return null;
        const db = await new Promise((resolve, reject) => {
          const req = indexedDB.open('pen_media_v1', 1);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        const rec = await new Promise((resolve, reject) => {
          const tx = db.transaction('blobs', 'readonly');
          const q = tx.objectStore('blobs').index('driveFileId').get(fileId);
          q.onsuccess = () => resolve(q.result || null);
          q.onerror = () => reject(q.error);
        });
        const bytes = rec?.bytes;
        if (!bytes) return null;
        const u8 = new Uint8Array(bytes);
        let s = '';
        for (let i = 0; i < u8.length; i += 0x8000) {
          s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
        }
        return btoa(s);
      } catch {
        return null;
      }
    })
    .catch(() => null);
  if (!b64) return null;
  const dir = resolve(tmpdir(), 'pen-gallery-publish');
  mkdirSync(dir, { recursive: true });
  const out = resolve(dir, `${spec.id}.jpg`);
  writeFileSync(out, Buffer.from(b64, 'base64'));
  process.stdout.write(`  gallery jpeg ${out} bytes=${Buffer.from(b64, 'base64').length}\n`);
  return out;
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

  const makePublic = page.locator('select[aria-label="Where this post is aggregated"]');
  await makePublic.waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {});

  // Share writes the post to the owner cloud. Make public is the default.
  await page.waitForTimeout(200);

  const galleryPath = await exportCommittedGallery(page, spec);

  await page.evaluate((title) => {
    const input = document.querySelector('input.font-bold');
    if (!input) return;
    const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value');
    desc?.set?.call(input, title);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, spec.title);
  await page.waitForTimeout(400);

  const shareWaitMs = (spec.layers || []).some((l) => l.kind === 'video') ? 360_000 : 90_000;

  const shared = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) => (b.textContent || '').trim() === 'Share'
    );
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!shared) {
    return { ok: false, reason: 'share_button_missing', enabled: true };
  }
  process.stdout.write('  clicked Share\n');

  const started = Date.now();
  let published = false;
  let failReason = '';
  while (Date.now() - started < shareWaitMs) {
    const status = await page
      .evaluate(() => (document.body?.innerText || '').slice(0, 400))
      .catch(() => '');
    if (/Published to your cloud/i.test(status)) {
      published = true;
      break;
    }
    if (/feed_connect_failed|compose_export_root_missing|gallery_video_not_ready|drive_upload_failed|metadata_index_/i.test(status)) {
      failReason = status.slice(0, 180);
      break;
    }
    const pages = context.pages();
    if (pages.some((p) => p !== page && /browse/i.test(p.url()) && /view=upload|pen_publish/i.test(p.url()))) {
      return { ok: false, reason: 'opened_browse', enabled: true, galleryPath };
    }
    await page.waitForTimeout(1000);
  }
  if (!published) {
    return { ok: false, reason: failReason || 'cloud_publish_timeout', enabled: true, galleryPath };
  }

  return {
    ok: true,
    enabled: true,
    galleryPath,
    reason: ''
  };
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
    // Keep popups (unlock consent uses window.open)
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

    const specs = SPECS.slice(0, MAX_TEMPLATES)
      .filter((s) => !ONLY_SPEC || s.id === ONLY_SPEC)
      .map(hydrateSpecMedia);
    const publishedTitles = [];
    for (const spec of specs) {
      console.log(`\n=== Template: ${spec.id} ===`);
      try {
        const url = await createFromStarter(page, spec);
        ok('created', /\/d\//.test(url), url.replace(PEN_URL, ''));
        await setTitle(page, spec.title);
        const built = await buildLayers(page, spec);
        ok('layers built', Boolean(built.ok), built.reason || `n=${built.layerCount} media=${built.media || 0}`);
        if (!built.ok) {
          fails += 1;
          continue;
        }

        await page.waitForTimeout(1500);
        const committed = await commitCurrentVersion(page);
        ok(
          'commit flatten',
          Boolean(committed.ok),
          committed.ok ? `${committed.kind || 'preview'} ${committed.ref || ''}` : committed.reason || ''
        );
        if (!committed.ok) {
          fails += 1;
          continue;
        }

        const share = await connectAsPublicTemplate(page, context, spec);
        ok('connect menu', Boolean(share.ok), share.reason || '');
        if (!share.ok) {
          fails += 1;
          continue;
        }
        ok('published to owner cloud', share.ok === true, share.reason || '');
        if (share.ok) publishedTitles.push(spec.title);
        else fails += 1;
        await page.waitForTimeout(4000);
      } catch (e) {
        fails += 1;
        console.log(`  FAIL  ${spec.id}: ${e instanceof Error ? e.message : e}`);
      }
    }

    console.log('\n=== public pen-templates index ===');
    const verified = await verifyPublishedTitles(publishedTitles);
    ok(
      'published titles on index',
      verified.ok,
      `found=${(verified.found || []).join(' | ') || 'none'} scanned=${verified.scanned ?? ''} ${verified.reason || ''}`
    );
    if (!verified.ok) fails += 1;

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
