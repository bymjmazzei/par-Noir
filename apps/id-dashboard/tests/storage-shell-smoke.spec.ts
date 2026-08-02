import { expect, test, type Page } from '@playwright/test';

/**
 * Pre-unlock smoke for the storage surface.
 *
 * Scope, and why it is this narrow: the Storage tab lives inside `AuthenticatedShell`, which
 * only renders once `authenticatedUser` is set by a real three-factor unlock. The dashboard
 * deliberately refuses to shortcut that — `useAppBootstrapEffects` clears any restored session
 * on boot ("user must unlock their ID each time"), so there is no seeded-localStorage or
 * deep-link path that mounts the storage shell without a real pn file, pn name, and passcode.
 * Driving a real unlock would mean shipping a fixture identity and its secrets, which the
 * no-plaintext-secrets rule forbids.
 *
 * So instead of mounting the storage UI, this pins the invariant that makes that gate
 * meaningful: before unlock the dashboard must not touch Drive, storage, or the par Noir API,
 * and the storage surface must not be reachable. Every outbound call is intercepted, so the
 * suite stays hermetic and never uses a live Google or par Noir token.
 */

/** Google Fonts is a static stylesheet, not identity or Drive traffic. */
const ALLOWED_THIRD_PARTY = [/^https:\/\/fonts\.googleapis\.com\//, /^https:\/\/fonts\.gstatic\.com\//];

/** Anything that could carry identity, Drive, or storage data off the page. */
const FORBIDDEN_BEFORE_UNLOCK = [
  /googleapis\.com/,
  /oauth2\.googleapis\.com/,
  /accounts\.google\.com/,
  /drive\.google\.com/,
  /\/api\//,
];

function isFirstPartyAsset(url: string, baseURL: string) {
  return url.startsWith(baseURL) && !url.includes('/api/');
}

function collectPageErrors(page: Page) {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.stack || error.message));
  return pageErrors;
}

test.describe('storage surface pre-unlock smoke', () => {
  test('makes no Drive, storage, or API request before unlock', async ({ page, baseURL }) => {
    const offending: string[] = [];

    // Fail closed: intercept everything, so a regression that starts calling Drive on boot is
    // recorded here instead of quietly succeeding against the network.
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      const allowed =
        isFirstPartyAsset(url, baseURL!) || ALLOWED_THIRD_PARTY.some((pattern) => pattern.test(url));

      if (!allowed && FORBIDDEN_BEFORE_UNLOCK.some((pattern) => pattern.test(url))) {
        offending.push(url);
        await route.abort();
        return;
      }
      await route.continue();
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByPlaceholder('Enter your pN Name')).toBeVisible({ timeout: 30_000 });

    // Let deferred effects run; a boot-time Drive call would fire in this window.
    await page.waitForTimeout(3000);

    expect(offending, `requests made before unlock:\n${offending.join('\n')}`).toEqual([]);
  });

  test('stays gated and usable when every API call fails', async ({ page }) => {
    const pageErrors = collectPageErrors(page);

    // The API being down must degrade the dashboard, not break it: the unlock gate is local-first
    // and needs no server to render.
    await page.route('**/api/**', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"unavailable"}' })
    );

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.getByPlaceholder('Enter your pN Name')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Unlock pN' })).toBeEnabled();

    await page.waitForTimeout(2000);

    // The storage surface belongs to the authenticated shell; a failing API must not leak it.
    await expect(page.getByRole('button', { name: 'Storage', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Lock', exact: true })).toHaveCount(0);

    expect(pageErrors, `uncaught page errors:\n${pageErrors.join('\n---\n')}`).toEqual([]);
  });
});
