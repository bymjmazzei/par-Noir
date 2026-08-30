import { defineConfig, devices } from '@playwright/test';

/**
 * Messaging-mode host smoke (dist-messaging / messaging.parnoir.com).
 * Separate from browse playwright.config so preview serves the messaging outDir.
 */
const PORT = Number(process.env.PW_PORT || 4175);
const BASE_URL = process.env.PW_BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests',
  testMatch: /messaging-smoke\.spec\.ts/,
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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.PW_BASE_URL
    ? undefined
    : {
        command: `npx vite preview --outDir dist-messaging --port ${PORT} --strictPort`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
