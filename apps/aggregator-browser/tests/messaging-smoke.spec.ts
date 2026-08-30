import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

/**
 * Boot smoke for the messaging-only host (messaging.parnoir.com / dist-messaging).
 * Same hermetic rules as browse-smoke: no live API, no direct Google.
 */

const TDZ_PATTERN = /before initialization|is not defined|is not a function/i;
const ERROR_BOUNDARY_FALLBACK = 'Something went wrong';
const DIRECT_GOOGLE_PATTERN =
  /googleapis\.com|oauth2\.googleapis\.com|accounts\.google\.com|drive\.google\.com/;

function collectPageFailures(page: Page) {
  const pageErrors: string[] = [];
  const tdzConsoleErrors: string[] = [];

  page.on('pageerror', (error) => {
    pageErrors.push(error.stack || error.message);
  });

  page.on('console', (message: ConsoleMessage) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (TDZ_PATTERN.test(text)) {
      tdzConsoleErrors.push(text);
    }
  });

  return { pageErrors, tdzConsoleErrors };
}

async function blockApiTraffic(page: Page) {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  await page.route('**://api.parnoir.com/**', (route) => route.abort());
  return requested;
}

test.describe('messaging-mode smoke', () => {
  test('boots the messaging production bundle without uncaught errors', async ({ page }) => {
    const { pageErrors, tdzConsoleErrors } = collectPageFailures(page);
    const requested = await blockApiTraffic(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 30_000 });
    await page.waitForTimeout(2500);

    await expect(page.getByText(ERROR_BOUNDARY_FALLBACK)).toHaveCount(0);
    expect(pageErrors, `uncaught page errors:\n${pageErrors.join('\n---\n')}`).toEqual([]);
    expect(
      tdzConsoleErrors,
      `bundle initialization errors:\n${tdzConsoleErrors.join('\n---\n')}`
    ).toEqual([]);

    const directGoogle = requested.filter((u) => DIRECT_GOOGLE_PATTERN.test(u));
    expect(directGoogle, `direct Google requests:\n${directGoogle.join('\n')}`).toEqual([]);
  });
});
