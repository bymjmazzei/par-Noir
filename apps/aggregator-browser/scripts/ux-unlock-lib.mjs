/**
 * Shared Playwright unlock helpers for live UX diagnostics.
 * Secrets loaded from .local/test-pn — never log Key 1 / Key 2 / passcode / pn name.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export function loadTestPn(root) {
  const identityPath = resolve(root, '.local/test-pn/identity.pn');
  const keysPath = resolve(root, '.local/test-pn/keys.env');
  if (!existsSync(identityPath) || !existsSync(keysPath)) {
    throw new Error('Missing .local/test-pn fixture');
  }
  const keys = readFileSync(keysPath, 'utf8');
  const PN_NAME = keys.match(/^PN_NAME=(.+)$/m)?.[1]?.trim();
  const PASSCODE = keys.match(/^PASSCODE=(.+)$/m)?.[1]?.trim();
  if (!PN_NAME || !PASSCODE) throw new Error('keys.env must define PN_NAME and PASSCODE');
  return { identityPath, PN_NAME, PASSCODE };
}

export function trackOAuth(page, bag) {
  page.on('request', (req) => {
    const u = req.url();
    const m = req.method();
    if (!u.includes('api.parnoir.com') && !u.includes('/oauth/')) return;
    if (u.includes('/oauth/authorize/challenge') && m === 'POST') bag.challenge = true;
    if (u.includes('/oauth/authorize/authenticate') && m === 'POST') bag.authenticate = true;
    if (u.includes('/oauth/token') && m === 'POST') bag.token = true;
    if (u.includes('/oauth/userinfo') && m === 'GET') bag.userinfo = true;
  });
}

/** Capture api.parnoir.com calls (method, pathname, status) — no bodies/secrets. */
export function trackApi(page, bag) {
  page.on('response', async (res) => {
    try {
      const u = res.url();
      if (!u.includes('api.parnoir.com')) return;
      const url = new URL(u);
      bag.push({
        method: res.request().method(),
        path: url.pathname,
        status: res.status(),
      });
    } catch {
      /* ignore */
    }
  });
}

export async function fillConsentAndUnlock(popupOrPage, { identityPath, PN_NAME, PASSCODE, expectClose = true }) {
  await popupOrPage.waitForURL(/oauth\/consent|authorize/, { timeout: 30_000 });
  const fileInput = popupOrPage.locator('#identityFile, input[type="file"]').first();
  await fileInput.setInputFiles(identityPath);
  await popupOrPage.getByPlaceholder('Enter Key 1').fill(PN_NAME);
  await popupOrPage.getByPlaceholder('Enter Key 2').fill(PASSCODE);
  await popupOrPage.getByRole('button', { name: 'Unlock pN' }).click();
  const approve = popupOrPage.getByRole('button', { name: 'Approve' });
  try {
    await approve.waitFor({ state: 'visible', timeout: 60_000 });
    await approve.click();
  } catch {
    /* existing grant */
  }
  if (expectClose) {
    await popupOrPage.waitForEvent('close', { timeout: 20_000 }).catch(() => {});
  } else {
    await popupOrPage.waitForTimeout(3_000);
  }
}

export async function unlockViaPopup(page, unlockClick, creds) {
  const popupPromise = page.waitForEvent('popup', { timeout: 20_000 });
  await unlockClick(page);
  const popup = await popupPromise;
  await fillConsentAndUnlock(popup, { ...creds, expectClose: true });
  await page.waitForTimeout(2_000);
}

export async function fillReactControlled(page, placeholder, value) {
  await page.getByPlaceholder(placeholder).first().waitFor({ state: 'visible', timeout: 30_000 });
  const result = await page.evaluate(
    ({ placeholder, value }) => {
      const el = [...document.querySelectorAll('input')].find((i) => i.placeholder === placeholder);
      if (!el) return { ok: false, reason: 'missing-el' };
      const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      proto?.set?.call(el, value);
      const reactKey = Object.keys(el).find(
        (k) => k.startsWith('__reactProps$') || k.startsWith('__reactEventHandlers$')
      );
      const props = reactKey ? el[reactKey] : null;
      if (typeof props?.onChange !== 'function') {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: el.value === value, via: 'dom-event', valueLen: el.value.length };
      }
      props.onChange({
        target: el,
        currentTarget: el,
        bubbles: true,
        preventDefault() {},
        stopPropagation() {},
        nativeEvent: new Event('input', { bubbles: true }),
      });
      return { ok: true, via: 'reactProps', valueLen: el.value.length };
    },
    { placeholder, value }
  );
  if (!result?.ok) throw new Error(`Could not set React input ${placeholder}: ${JSON.stringify(result)}`);
  if (result.via !== 'reactProps') {
    throw new Error(`React onChange missing for ${placeholder} (got ${result.via})`);
  }
}

export function identityUploadPayload(identityPath) {
  return {
    name: 'test-pn.pn',
    mimeType: 'application/json',
    buffer: readFileSync(identityPath),
  };
}

export async function unlockDashboard(page, notes, { identityPath, PN_NAME, PASSCODE }) {
  await page.getByRole('button', { name: 'Unlock pN' }).waitFor({ state: 'visible', timeout: 30_000 });
  const fileInput = page.locator('#file-upload-web, #file-upload-pwa, #file-upload').first();
  await fileInput.setInputFiles(identityUploadPayload(identityPath));
  await page.getByText('test-pn.pn', { exact: false }).first().waitFor({ state: 'visible', timeout: 15_000 });
  await fillReactControlled(page, 'Enter Key 1', PN_NAME);
  await fillReactControlled(page, 'Enter Key 2', PASSCODE);
  notes.push('reactProps onChange applied for Key 1/2');
  await page.getByRole('button', { name: 'Unlock pN' }).click();
  const started = await page
    .getByRole('button', { name: 'Unlocking...' })
    .waitFor({ state: 'visible', timeout: 8_000 })
    .then(() => true)
    .catch(() => false);
  if (!started) throw new Error('Dashboard unlock did not start (React state or submit)');
  notes.push('Unlocking... visible');
  await Promise.race([
    page.getByRole('button', { name: 'Create New pN' }).waitFor({ state: 'hidden', timeout: 60_000 }),
    page.getByRole('button', { name: /^Lock$/ }).waitFor({ state: 'visible', timeout: 60_000 }),
    page.getByText(/pN file unlocked successfully/i).waitFor({ state: 'visible', timeout: 60_000 }),
  ]);
  await page.waitForTimeout(1_000);
}
