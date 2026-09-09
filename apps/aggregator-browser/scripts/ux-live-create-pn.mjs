#!/usr/bin/env node
/**
 * Create a real pN on live pn.parnoir.com (product path) and save download + keys
 * under .local/test-pn-2/. Secrets only written to keys.env (gitignored).
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'fs';
import { randomBytes, webcrypto } from 'crypto';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = resolve(ROOT, '.local/test-pn-2');
mkdirSync(OUT, { recursive: true });

function strongKey(prefix) {
  const raw = randomBytes(6).toString('base64url');
  // upper+lower+number+special, len >= 8
  return `${prefix}${raw}A1!`;
}

async function typeInto(page, placeholder, value) {
  // Unlock gate stays mounted under the modal — must scope to Create form.
  const input = page
    .locator('form')
    .filter({ hasText: /Step [12]:/ })
    .getByPlaceholder(placeholder)
    .first();
  await input.waitFor({ state: 'visible', timeout: 30_000 });
  await input.evaluate(
    (el, value) => {
      el.scrollIntoView({ block: 'center' });
      const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      proto.set.call(el, value);
      const rk = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
      if (!rk || typeof el[rk].onChange !== 'function') {
        throw new Error('no react onChange');
      }
      el[rk].onChange({
        target: { value },
        currentTarget: { value },
        preventDefault() {},
        stopPropagation() {},
      });
    },
    value
  );
  await page.waitForFunction(
    ({ placeholder, value }) => {
      const forms = [...document.querySelectorAll('form')].filter((f) =>
        /Step [12]:/.test(f.textContent || '')
      );
      for (const form of forms) {
        const el = [...form.querySelectorAll('input')].find((i) => i.placeholder === placeholder);
        if (el && el.value === value) return true;
      }
      return false;
    },
    { placeholder, value },
    { timeout: 10_000 }
  );
}

async function fillReact(page, placeholder, value) {
  await typeInto(page, placeholder, value);
}

const PN_NAME = strongKey('Live');
const PASSCODE = strongKey('Drive');
const RECOVERY_EMAIL = `qa-live-${webcrypto.getRandomValues(new Uint32Array(1))[0]}@example.com`;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();

try {
  await page.goto('https://pn.parnoir.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.getByRole('button', { name: 'Create New pN' }).click();
  await page.getByText('Create New pN').first().waitFor({ state: 'visible', timeout: 15_000 });

  // Step 1
  await fillReact(page, 'Enter Key 1', PN_NAME);
  await fillReact(page, 'Enter Key 2', PASSCODE);
  await fillReact(page, 'Enter recovery email', RECOVERY_EMAIL);

  // Wait until strength rules clear / Next enables
  const next = page.getByRole('button', { name: 'Next' });
  await page.waitForFunction(
    () => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Next');
      return btn && !btn.disabled;
    },
    null,
    { timeout: 30_000 }
  );
  await next.click();

  // Step 2 confirm — keys + recovery (always fill; field may be below fold)
  await page.getByText('Step 2: Confirm Your Information').waitFor({ state: 'visible', timeout: 15_000 });
  await fillReact(page, 'Confirm Key 1', PN_NAME);
  await fillReact(page, 'Confirm Key 2', PASSCODE);
  await fillReact(page, 'Confirm your recovery email', RECOVERY_EMAIL);

  await page.waitForFunction(
    () => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Create pN');
      return btn && !btn.disabled;
    },
    null,
    { timeout: 30_000 }
  );

  const downloadPromise = page.waitForEvent('download', { timeout: 180_000 });
  await page.getByRole('button', { name: 'Create pN' }).click();
  const download = await downloadPromise;
  const suggested = download.suggestedFilename() || 'live-created.pn';
  const destName = suggested.endsWith('.pn') || suggested.endsWith('.json') ? suggested : `${suggested}.pn`;
  const destPath = resolve(OUT, destName);
  await download.saveAs(destPath);

  // Also copy as canonical live-created.pn
  const canonical = resolve(OUT, 'live-created.pn');
  copyFileSync(destPath, canonical);

  writeFileSync(
    resolve(OUT, 'keys.env'),
    [
      '# Live-created on pn.parnoir.com via product Create New pN — never commit',
      `PN_NAME=${PN_NAME}`,
      `PASSCODE=${PASSCODE}`,
      `IDENTITY_FILE=${destName}`,
      `RECOVERY_EMAIL=${RECOVERY_EMAIL}`,
      `CREATED_ON=https://pn.parnoir.com/`,
      `CREATED_AT=${new Date().toISOString()}`,
      '',
    ].join('\n')
  );

  writeFileSync(
    resolve(OUT, 'README.md'),
    [
      '# test-pn-2 (live-created)',
      '',
      'Created on production dashboard Create New pN → auto-download.',
      `File: \`${destName}\` (also \`live-created.pn\`)`,
      'Keys: `keys.env` (Key 1 = PN_NAME, Key 2 = PASSCODE)',
      '',
      'Do not use a filename of literally `identity.pn` on live until nickname fix is deployed.',
      '',
    ].join('\n')
  );

  const raw = JSON.parse(readFileSync(destPath, 'utf8'));
  if (!raw.identities?.[0]?.encryptedData) {
    throw new Error('Downloaded file missing identities[0].encryptedData');
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        outDir: OUT,
        identityFile: destPath,
        canonical,
        keysEnv: resolve(OUT, 'keys.env'),
        suggestedFilename: destName,
        unlockedShell: await page.getByRole('button', { name: /^Lock$/ }).isVisible().catch(() => false),
      },
      null,
      2
    )
  );
} catch (e) {
  console.error('CREATE_FAILED', e?.message || e);
  await page.screenshot({ path: resolve(OUT, 'create-failed.png'), fullPage: false }).catch(() => {});
  process.exit(1);
} finally {
  await browser.close();
}
