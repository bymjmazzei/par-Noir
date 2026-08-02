import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config for the dashboard.
 *
 * Runs against a production build served by `vite preview` (port 4173), not the dev
 * server: the chunking and minification in `vite.config.ts` are what produce the TDZ
 * crashes the smoke suite guards against, and those only exist in a real build.
 *
 * CI runs chromium only to keep the job short; locally the full matrix is available.
 */
const PORT = Number(process.env.PW_PORT || 4173);
const BASE_URL = process.env.PW_BASE_URL || `http://localhost:${PORT}`;

const localProjects = [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  { name: 'Mobile Chrome', use: { ...devices['Pixel 5'], hasTouch: true } },
  { name: 'Mobile Safari', use: { ...devices['iPhone 12'], hasTouch: true } },
];

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'html',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: process.env.CI ? [localProjects[0]] : localProjects,
  // Assumes `dist/` is already built (see `npm run build:e2e`), so CI can reuse the
  // build it already produced instead of building twice.
  webServer: process.env.PW_BASE_URL
    ? undefined
    : {
        command: `npm run preview -- --port ${PORT} --strictPort`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
