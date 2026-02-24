import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for openEXPERT testing
 * Run tests: npx playwright test
 * View report: npx playwright show-report
 */
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts', // Only run .spec.ts files (ignore .test.ts Vitest files)

  // Run tests sequentially (not parallel) to avoid state conflicts
  fullyParallel: false,
  workers: 1,

  // Fail fast on CI, retry locally
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,

  // Reporter options
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],

  // Shared settings for all tests
  use: {
    // Base URL for testing
    baseURL: 'http://localhost:3001',

    // Capture screenshots on failure
    screenshot: 'only-on-failure',

    // Capture videos on first retry
    video: 'retain-on-failure',

    // Capture trace for debugging
    trace: 'on-first-retry',

    // Timeouts
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },

  // Configure projects for different browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Uncomment to test on Firefox and WebKit
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // Start dev server before running tests
  webServer: {
    command: 'pnpm run dev',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },

  // Test timeout
  timeout: 60000,

  // Global timeout for the entire test run
  globalTimeout: 600000, // 10 minutes

  // Expect timeout
  expect: {
    timeout: 10000,
  },
});
