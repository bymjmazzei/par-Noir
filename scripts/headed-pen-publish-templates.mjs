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
    formTitle: 'Notes',
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
    formTitle: 'Notes',
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
    formTitle: 'Quote',
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
    formTitle: 'Link',
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
        section.pagePresentation = {
          ...(section.pagePresentation || {}),
          backgroundColor: payload.bg
        };
        bundle.manifest.title = payload.title;
        bundle.manifest.updatedAt = new Date().toISOString();
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
        });
      }
      section.pagePresentation = {
        ...(section.pagePresentation || {}),
        backgroundColor: payload.bg
      };
      bundle.manifest.title = payload.title;
      localStorage.setItem(key, JSON.stringify(bundle));
    } catch {
      /* ignore */
    }
  }, spec);

  return { ok: added > 0, layerCount: added, via: 'ui' };
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

async function connectAsPublicTemplate(page, context) {
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
  await page.evaluate(() => {
    /* leave browse checked — unchecking can leave submitShare with edge cases */
  });
  await page.waitForTimeout(200);

  const beforePages = new Set(context.pages().map((p) => p));
  const popupPromise = context.waitForEvent('page', { timeout: 90_000 }).catch(() => null);

  const shareClicked = await page.evaluate(() => {
    // Share inside Connect submenu (next to Pen templates label)
    const labels = [...document.querySelectorAll('label')].filter((l) =>
      /Pen templates/i.test(l.textContent || '')
    );
    const root =
      labels[0]?.closest('.absolute, [class*="shadow"]') ||
      labels[0]?.parentElement?.parentElement;
    const share =
      (root &&
        [...root.querySelectorAll('button')].find((b) =>
          /^Share$/i.test((b.textContent || '').trim())
        )) ||
      [...document.querySelectorAll('button')].find((b) =>
        /^Share$/i.test((b.textContent || '').trim())
      );
    if (!share) return { ok: false, reason: 'share_btn_missing' };
    share.click();
    return { ok: true };
  });
  if (!shareClicked.ok) {
    return { ok: false, reason: shareClicked.reason, enabled: true };
  }

  let browsePage = await popupPromise;
  if (!browsePage) {
    // Poll for new pages / same-tab navigation
    for (let i = 0; i < 45; i++) {
      const status = await page
        .evaluate(() => {
          const err = document.querySelector('.text-red-600');
          const statusEl = [...document.querySelectorAll('span')].find((s) =>
            /Opened Browse|Encoding|feed_connect|template/i.test(s.textContent || '')
          );
          return {
            err: (err?.textContent || '').trim().slice(0, 160),
            status: (statusEl?.textContent || '').trim().slice(0, 160),
            url: location.href
          };
        })
        .catch(() => ({ err: '', status: '', url: page.url() }));
      if (/browse\.parnoir|browse-parnoir|\?view=upload/i.test(status.url)) {
        browsePage = page;
        break;
      }
      const fresh = context.pages().find((p) => !beforePages.has(p) || /browse/i.test(p.url()));
      if (fresh && /browse/i.test(fresh.url())) {
        browsePage = fresh;
        break;
      }
      if (status.err) {
        process.stdout.write(`  share error: ${status.err}\n`);
        return { ok: false, reason: `share_error:${status.err}`, enabled: true };
      }
      if (/Opened Browse/i.test(status.status)) {
        process.stdout.write(`  share status: ${status.status} (waiting for tab)\n`);
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
    const ui = await page
      .evaluate(() => ({
        err: (document.querySelector('.text-red-600')?.textContent || '').trim().slice(0, 120),
        body: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 240)
      }))
      .catch(() => ({ err: '', body: '' }));
    process.stdout.write(`  after share: err=${ui.err} pages=${pages.map((p) => p.url()).join(' || ')}\n`);
    if (!browsePage) {
      return {
        ok: false,
        reason: `no_browse_tab err=${ui.err}`,
        enabled: true
      };
    }
  }

  return { ok: Boolean(browsePage), browsePage, enabled: true, reason: browsePage ? '' : 'no_browse_tab' };
}

async function fillConsentAndUnlockDom(popupOrPage, { identityPath, PN_NAME, PASSCODE, expectClose = true }) {
  // Prefer domcontentloaded — unlock broker SPA often never fires full "load".
  await popupOrPage
    .waitForURL(/oauth\/consent|authorize|unlock/, {
      timeout: 60_000,
      waitUntil: 'domcontentloaded'
    })
    .catch(() => {});
  const fileInput = popupOrPage.locator('#identityFile, input[type="file"]').first();
  await fileInput.waitFor({ state: 'attached', timeout: 45_000 });
  await fileInput.setInputFiles(identityPath);
  await popupOrPage.getByPlaceholder('Enter Key 1').fill(PN_NAME);
  await popupOrPage.getByPlaceholder('Enter Key 2').fill(PASSCODE);
  await popupOrPage.getByRole('button', { name: 'Unlock pN' }).click();
  const approve = popupOrPage.getByRole('button', { name: 'Approve' });
  try {
    await approve.waitFor({ state: 'visible', timeout: 90_000 });
    await approve.click();
  } catch {
    /* existing grant / handoff-done UI */
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
