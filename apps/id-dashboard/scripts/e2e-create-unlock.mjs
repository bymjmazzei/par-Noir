import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const pnName = `test${Date.now().toString(36).slice(-6)}`;
const passcode = 'TestPass123!@#';
const recoveryEmail = 'test@example.com';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));

  await page.goto('https://par-noir-dashboard.web.app/', { waitUntil: 'networkidle' });

  await page.getByRole('button', { name: 'Create New pN' }).click();

  // Step 1
  await page.getByPlaceholder('Enter pN Name').fill(pnName);
  await page.getByPlaceholder('Enter passcode').fill(passcode);
  await page.getByPlaceholder('Enter recovery email').fill(recoveryEmail);
  await page.getByRole('button', { name: 'Next' }).click();

  // Step 2
  await page.getByPlaceholder('Confirm your pN Name').fill(pnName);
  await page.getByPlaceholder('Confirm your passcode').fill(passcode);
  await page.getByPlaceholder('Confirm your recovery email').fill(recoveryEmail);

  const downloadPromise = page.waitForEvent('download', { timeout: 120_000 });
  await page.getByRole('button', { name: 'Create pN' }).click();

  let download;
  try {
    download = await downloadPromise;
  } catch (e) {
    console.log('NO DOWNLOAD', e.message);
  }

  await page.waitForTimeout(5000);

  const bodyText = await page.locator('body').innerText();
  const unlocked = bodyText.includes('Privacy') || bodyText.includes('Devices') || bodyText.includes('Storage');

  let filePath;
  let fileContent = '';
  if (download) {
    filePath = join(tmpdir(), `pn-test-${Date.now()}.pn`);
    await download.saveAs(filePath);
    fileContent = await download.createReadStream().then(async (s) => {
      const chunks = [];
      for await (const c of s) chunks.push(c);
      return Buffer.concat(chunks).toString('utf8');
    }).catch(async () => {
      const fs = await import('fs');
      return fs.readFileSync(filePath, 'utf8');
    });
  }

  console.log('PN_NAME', pnName);
  console.log('UNLOCKED_AFTER_CREATE', unlocked);
  console.log('BODY_SNIPPET', bodyText.slice(0, 800));
  console.log('DOWNLOAD_SIZE', fileContent.length);
  if (fileContent) {
    console.log('FILE_RAW', fileContent);
    const parsed = JSON.parse(fileContent);
    const id = parsed.identities?.[0];
    console.log('FILE_KEYS', id ? Object.keys(id) : Object.keys(parsed));
    console.log('HAS_ENCRYPTED', !!(id?.encryptedData && id?.iv && id?.salt));
  }

  // Try unlock in fresh page if we have file
  if (filePath) {
    const page2 = await context.newPage();
    await page2.goto('https://par-noir-dashboard.web.app/', { waitUntil: 'networkidle' });
    await page2.locator('input[type="file"]').first().setInputFiles(filePath);
    await page2.getByPlaceholder('Enter your pN Name').fill(pnName);
    await page2.getByPlaceholder('Enter your passcode').fill(passcode);
    await page2.getByRole('button', { name: 'Unlock pN' }).click();
    await page2.waitForTimeout(5000);
    const body2 = await page2.locator('body').innerText();
    console.log('UNLOCKED_AFTER_FILE', body2.includes('Privacy') || body2.includes('Devices'));
    console.log('UNLOCK_BODY', body2.slice(0, 800));
  }

  console.log('LOGS', logs.slice(-30).join('\n'));
  await browser.close();
}

main().catch((e) => {
  console.error('FAILED', e);
  process.exit(1);
});
