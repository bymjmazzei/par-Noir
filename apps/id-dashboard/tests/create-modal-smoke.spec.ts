import { expect, test, type Page } from '@playwright/test';

/**
 * Deep-link smoke for the "Create New pN" entry point.
 *
 * `?create=1` is how the marketing site and onboarding links drop a visitor straight into
 * identity creation, so it is a public URL contract: the modal must open on first paint and
 * the parameter must be stripped afterwards, otherwise a refresh or a shared URL reopens the
 * modal on top of whatever the user was doing.
 *
 * Hermetic: creation is never submitted, so no key derivation, API call, or Drive access runs.
 */

const CREATE_MODAL = 'Create New pN';

function collectPageErrors(page: Page) {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.stack || error.message));
  return pageErrors;
}

/** `vite preview` can resolve `/` to `/index.html`; both mean "no route left over". */
function normalizedPathname(url: string) {
  return new URL(url).pathname.replace(/\/index\.html$/, '/');
}

test.describe('create pN deep link smoke', () => {
  test('opens the create modal and strips only the create parameter', async ({ page }) => {
    const pageErrors = collectPageErrors(page);

    await page.goto('/?create=1&ref=landing', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: CREATE_MODAL })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Step 1: Enter Your Information')).toBeVisible();

    const url = new URL(page.url());
    expect(url.searchParams.get('create')).toBeNull();
    expect(url.searchParams.get('ref')).toBe('landing');
    expect(normalizedPathname(page.url())).toBe('/');

    expect(pageErrors, `uncaught page errors:\n${pageErrors.join('\n---\n')}`).toEqual([]);
  });

  test('renders the create form with both secrets masked and empty', async ({ page }) => {
    await page.goto('/?create=1', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: CREATE_MODAL })).toBeVisible({ timeout: 30_000 });

    // pn name and passcode are the two factors the user chooses here. Both are secrets: they
    // must start masked and empty, never seeded from a previous session or the URL.
    const pnName = page.getByPlaceholder('Enter pN Name');
    const passcode = page.getByPlaceholder('Enter passcode');

    await expect(pnName).toHaveAttribute('type', 'password');
    await expect(passcode).toHaveAttribute('type', 'password');
    await expect(pnName).toHaveValue('');
    await expect(passcode).toHaveValue('');
  });

  test('leaves the unlock gate alone when the deep link is disabled', async ({ page }) => {
    await page.goto('/?create=0', { waitUntil: 'domcontentloaded' });

    await expect(page.getByPlaceholder('Enter your pN Name')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: CREATE_MODAL })).toHaveCount(0);
  });
});
