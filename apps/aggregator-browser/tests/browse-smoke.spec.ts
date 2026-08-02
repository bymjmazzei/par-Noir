import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

/**
 * Boot smoke for the aggregator browser (browse.parnoir.com).
 *
 * Runs against a production build over `vite preview`. Two things only exist in a real build:
 * `config/api.ts` throws when `VITE_API_ENDPOINT` is missing, and `vite.config.ts` drops every
 * `console.*` call — which means a crash here surfaces as the ErrorBoundary fallback with no
 * console trace, so the fallback itself has to be asserted against.
 *
 * Hermetic: par Noir API calls are aborted rather than stubbed, which exercises the real
 * "API unreachable" path. No live token, Drive account, or fabricated API payload is involved.
 */

const TDZ_PATTERN = /before initialization|is not defined|is not a function/i;
const ERROR_BOUNDARY_FALLBACK = 'Something went wrong';

/** Storage for this app must go through the par Noir API, never straight to Google. */
const DIRECT_GOOGLE_PATTERN = /googleapis\.com|oauth2\.googleapis\.com|accounts\.google\.com|drive\.google\.com/;

function collectPageFailures(page: Page) {
  const pageErrors: string[] = [];
  const tdzConsoleErrors: string[] = [];

  page.on('pageerror', (error) => {
    pageErrors.push(error.stack || error.message);
  });

  page.on('console', (message: ConsoleMessage) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    // Aborted API requests are expected here; only bundle initialization errors are failures.
    if (TDZ_PATTERN.test(text)) {
      tdzConsoleErrors.push(text);
    }
  });

  return { pageErrors, tdzConsoleErrors };
}

/** Cuts the app off from the network so the suite never depends on a live API. */
async function blockApiTraffic(page: Page) {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  await page.route('**://api.parnoir.com/**', (route) => route.abort());
  return requested;
}

test.describe('aggregator browser smoke', () => {
  test('boots the production bundle without uncaught errors', async ({ page }) => {
    const { pageErrors, tdzConsoleErrors } = collectPageFailures(page);
    await blockApiTraffic(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 30_000 });

    // Let deferred chunks and effects run so late failures surface.
    await page.waitForTimeout(2500);

    await expect(page.getByText(ERROR_BOUNDARY_FALLBACK)).toHaveCount(0);
    expect(pageErrors, `uncaught page errors:\n${pageErrors.join('\n---\n')}`).toEqual([]);
    expect(
      tdzConsoleErrors,
      `bundle initialization errors:\n${tdzConsoleErrors.join('\n---\n')}`
    ).toEqual([]);
  });

  test('renders the signed-out shell with the pN gate closed', async ({ page }) => {
    await blockApiTraffic(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Aggregation chrome must render for a visitor with no pN: feed rail plus bottom nav.
    await expect(page.locator('button[data-feed-id="discovery"]')).toBeVisible({ timeout: 30_000 });
    for (const tab of ['Home', 'Search', 'Upload', 'Me', 'Inbox']) {
      await expect(page.getByTitle(tab, { exact: true })).toBeVisible();
    }

    // Signed out means the lock control offers "Unlock pN", never a connected identity.
    await expect(page.getByTitle('Unlock pN')).toBeVisible();
  });

  test('reaches storage only through the par Noir API', async ({ page }) => {
    const requested = await blockApiTraffic(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('button[data-feed-id="discovery"]')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(2500);

    const directGoogle = requested.filter((url) => DIRECT_GOOGLE_PATTERN.test(url));
    expect(
      directGoogle,
      `browser must not call Google directly:\n${directGoogle.join('\n')}`
    ).toEqual([]);

    // And it does still go somewhere: aggregation reads through the API, not a local shortcut.
    expect(requested.some((url) => url.includes('api.parnoir.com'))).toBe(true);
  });
});
