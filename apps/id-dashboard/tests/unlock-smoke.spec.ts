import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

/**
 * Boot smoke test for the production bundle.
 *
 * The unlock screen has repeatedly broken on temporal dead zone errors ("Cannot access
 * X before initialization") introduced by chunk splitting and terser mangling in
 * `vite.config.ts`. Those never reproduce in dev, so this runs against `vite preview`
 * over a real build and fails on any uncaught exception during first paint.
 *
 * Hermetic: no identity is unlocked and no Drive, Stripe, or Veriff call is made. Only
 * the pre-auth screen is exercised.
 */

const TDZ_PATTERN = /before initialization|is not defined|is not a function/i;

function collectPageFailures(page: Page) {
  const pageErrors: string[] = [];
  const tdzConsoleErrors: string[] = [];

  page.on('pageerror', (error) => {
    pageErrors.push(error.stack || error.message);
  });

  page.on('console', (message: ConsoleMessage) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    // Network failures against the real API are expected offline in CI; only bundle
    // initialization errors are treated as failures here.
    if (TDZ_PATTERN.test(text)) {
      tdzConsoleErrors.push(text);
    }
  });

  return { pageErrors, tdzConsoleErrors };
}

test.describe('unlock screen smoke', () => {
  test('boots the production bundle without uncaught errors', async ({ page }) => {
    const { pageErrors, tdzConsoleErrors } = collectPageFailures(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 30_000 });

    // Let deferred chunks and effects run so late TDZ errors surface.
    await page.waitForTimeout(1500);

    expect(pageErrors, `uncaught page errors:\n${pageErrors.join('\n---\n')}`).toEqual([]);
    expect(
      tdzConsoleErrors,
      `bundle initialization errors:\n${tdzConsoleErrors.join('\n---\n')}`
    ).toEqual([]);
  });

  test('renders the three-factor unlock form', async ({ page }) => {
    const { pageErrors } = collectPageFailures(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // pn file + pn name + passcode: all three unlock factors must be reachable.
    await expect(page.getByPlaceholder('Enter your pN Name')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByPlaceholder('Enter your passcode')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Unlock pN' })).toBeVisible();
    await expect(page.locator('input[type="file"]').first()).toBeAttached();

    expect(pageErrors, `uncaught page errors:\n${pageErrors.join('\n---\n')}`).toEqual([]);
  });

  test('keeps the unlock factors masked and never prefilled', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const pnName = page.getByPlaceholder('Enter your pN Name');
    const passcode = page.getByPlaceholder('Enter your passcode');
    await expect(pnName).toBeVisible({ timeout: 30_000 });

    // pn name and passcode are both secrets: masked by default, never pre-populated.
    await expect(pnName).toHaveAttribute('type', 'password');
    await expect(passcode).toHaveAttribute('type', 'password');
    await expect(pnName).toHaveValue('');
    await expect(passcode).toHaveValue('');
  });

  test('does not navigate away from the unlock gate on load', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByPlaceholder('Enter your pN Name')).toBeVisible({ timeout: 30_000 });

    // A stale session or bad redirect would drop us somewhere other than the gate.
    expect(new URL(page.url()).pathname.replace(/\/index\.html$/, '/')).toBe('/');
  });
});
