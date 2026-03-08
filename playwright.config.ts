import { defineConfig, devices } from '@playwright/test';

/**
 * TEST-07: Playwright cross-browser matrix — Chrome, Firefox, WebKit (Safari)
 * Runs nightly via CI; can also be run locally with `pnpm test:e2e`.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter */
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  /* Shared settings for all projects */
  use: {
    /* Base URL — assumes `pnpm run dev` is running on :5173 */
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',
    /* Capture screenshot on failure */
    screenshot: 'only-on-failure',
    /* Record video on retry */
    video: 'retry-with-video',
    /* Trace on first retry */
    trace: 'on-first-retry',
    /* Timeout */
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  /* TEST-07: Cross-browser matrix */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    /* Mobile viewports — important for responsive layout checks */
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  /* Global test timeout */
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
});
