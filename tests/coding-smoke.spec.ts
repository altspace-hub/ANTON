import { test, expect } from '@playwright/test';
import { mkdirSync } from 'fs';

mkdirSync('tests/screenshots', { recursive: true });

/**
 * Round 1: Smoke Test — Visit every route, screenshot, check for load errors
 */

const ALL_ROUTES = [
  { path: '/', name: 'dashboard' },
  { path: '/brief', name: 'brief-me' },
  { path: '/guide', name: 'guide-me' },
  { path: '/fill', name: 'fill-form' },
  { path: '/challenge', name: 'challenge-this' },
  { path: '/dual', name: 'dual-interpretation' },
  { path: '/batch', name: 'batch-create' },
  { path: '/prompt', name: 'open-chat' },
  { path: '/workflows', name: 'workflows' },
  { path: '/workflows/builder', name: 'workflow-builder' },
  { path: '/datasets', name: 'datasets' },
  { path: '/projects', name: 'projects' },
  { path: '/build-module', name: 'build-module' },
  { path: '/skills', name: 'skills-library' },
  { path: '/audit', name: 'audit-log' },
  { path: '/exchange', name: 'exchange' },
  { path: '/analytics', name: 'analytics' },
  { path: '/insights', name: 'data-insights' },
  { path: '/review', name: 'review-engine' },
  { path: '/sounding-board', name: 'sounding-board' },
  { path: '/ab-test', name: 'ab-test' },
  { path: '/knowledge', name: 'knowledge' },
  { path: '/deadlines', name: 'deadlines' },
  { path: '/radar', name: 'radar' },
  { path: '/coworkers', name: 'coworkers' },
  { path: '/versions', name: 'versions' },
  { path: '/quality', name: 'quality' },
  { path: '/apprentice', name: 'apprentice' },
  { path: '/graph', name: 'knowledge-graph' },
  { path: '/intelligence', name: 'intelligence-dashboard' },
  { path: '/patterns', name: 'pattern-detection' },
  { path: '/compliance', name: 'compliance' },
  { path: '/knowledge-base', name: 'knowledge-base' },
  { path: '/my-work', name: 'my-work' },
  { path: '/discover', name: 'discover' },
  { path: '/coding', name: 'coding-landing' },
  { path: '/coding/review', name: 'coding-review' },
  { path: '/coding/script-lite', name: 'coding-script-lite' },
  { path: '/coding/script-medium', name: 'coding-script-medium' },
  { path: '/coding/large', name: 'coding-large' },
  { path: '/settings', name: 'settings' },
];

test.describe('Round 1: Smoke Test — All Routes', () => {
  for (const route of ALL_ROUTES) {
    test(`[smoke] ${route.name} (${route.path}) loads`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      const response = await page.goto(route.path, { waitUntil: 'domcontentloaded' });

      // HTTP response should be 200 (SPA handles routing internally)
      expect(response?.status()).toBeLessThan(400);

      // Wait for React to mount
      await page.waitForTimeout(1500);

      // Take screenshot
      await page.screenshot({
        path: `tests/screenshots/smoke-${route.name}.png`,
        fullPage: true,
      });

      // Page should have content (not blank)
      const bodyText = await page.locator('body').innerText();
      expect(bodyText.length).toBeGreaterThan(10);

      // No critical runtime errors
      const criticalErrors = consoleErrors.filter(e =>
        !e.includes('favicon') &&
        !e.includes('404') &&
        !e.includes('net::ERR') &&
        !e.includes('hydration') &&
        !e.toLowerCase().includes('warning')
      );

      if (criticalErrors.length > 0) {
        console.warn(`⚠ Console errors on ${route.path}:`, criticalErrors);
      }

      // Log findings
      console.log(`✓ ${route.name} loaded | console errors: ${criticalErrors.length}`);
    });
  }

  test('[smoke] sidebar is visible on dashboard', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    const sidebar = page.locator('nav, aside, [class*="sidebar"], [class*="Sidebar"]').first();
    await expect(sidebar).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/smoke-sidebar.png', fullPage: true });
  });

  test('[smoke] dark theme applied', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    // Check background is dark (adv-dark: #0B1426 or similar)
    const bodyBg = await page.evaluate(() => {
      const body = document.body;
      const style = window.getComputedStyle(body);
      return style.backgroundColor;
    });

    console.log('Body background color:', bodyBg);

    // The body/root should not be plain white
    expect(bodyBg).not.toBe('rgb(255, 255, 255)');

    await page.screenshot({ path: 'tests/screenshots/smoke-dark-theme.png', fullPage: true });
  });

  test('[smoke] responsive at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'tests/screenshots/smoke-responsive-1280.png', fullPage: true });

    const root = page.locator('#root > *').first();
    await expect(root).toBeVisible();
  });

  test('[smoke] responsive at 768px', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'tests/screenshots/smoke-responsive-768.png', fullPage: true });

    const root = page.locator('#root > *').first();
    await expect(root).toBeVisible();
  });
});
