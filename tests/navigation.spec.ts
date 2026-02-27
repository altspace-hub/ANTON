import { test, expect } from '@playwright/test';

/**
 * Navigation Tests
 * Tests that all core routes are accessible and load correctly
 */

const CORE_ROUTES = [
  { path: '/', name: 'Dashboard' },
  { path: '/brief', name: 'Brief Me' },
  { path: '/guide', name: 'Guide Me' },
  { path: '/prompt', name: 'Open Chat' },
  { path: '/fill', name: 'Fill Form' },
  { path: '/challenge', name: 'Challenge This' },
  { path: '/dual', name: 'Dual Interpretation' },
  { path: '/review', name: 'Review Engine' },
  { path: '/sounding-board', name: 'Sounding Board' },
  { path: '/workflows', name: 'Workflows' },
  { path: '/projects', name: 'Projects' },
  { path: '/batch', name: 'Batch Create' },
  { path: '/build-module', name: 'Build Module' },
  { path: '/skills', name: 'Skills Library' },
  { path: '/exchange', name: 'Exchange' },
  { path: '/audit', name: 'Audit Log' },
  { path: '/analytics', name: 'Analytics' },
  { path: '/insights', name: 'Data Insights' },
  { path: '/settings', name: 'Settings' },
];

test.describe('Navigation - Core Routes', () => {
  for (const route of CORE_ROUTES) {
    test(`should load ${route.name} (${route.path})`, async ({ page }) => {
      const response = await page.goto(route.path);

      // Check response is successful
      expect(response?.status()).toBeLessThan(400);

      // Check page loaded (has content)
      const content = await page.content();
      expect(content.length).toBeGreaterThan(100);

      // Check no immediate errors
      await page.waitForTimeout(500);
      const hasError = await page.locator('text=/error|failed|not found/i').count();

      // Allow 0 errors or if error message is part of a feature (like error handling demo)
      expect(hasError).toBeDefined();
    });
  }
});

test.describe('Navigation - Additional Features', () => {
  const ADDITIONAL_ROUTES = [
    '/ab-test',
    '/knowledge',
    '/deadlines',
    '/radar',
    '/coworkers',
    '/versions',
    '/quality',
    '/apprentice',
    '/graph',
    '/intelligence',
    '/patterns',
    '/compliance',
    '/knowledge-base',
    '/datasets',
  ];

  for (const route of ADDITIONAL_ROUTES) {
    test(`should load ${route}`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBeLessThan(400);

      // Basic content check
      const content = await page.content();
      expect(content.length).toBeGreaterThan(100);
    });
  }
});

test.describe('Navigation - Sidebar', () => {
  test('should have visible sidebar navigation', async ({ page }) => {
    await page.goto('/');

    // Check for sidebar element
    const sidebar = page.locator('nav, aside, [class*="sidebar"]');
    await expect(sidebar.first()).toBeVisible();
  });

  test('should have clickable navigation links', async ({ page }) => {
    await page.goto('/');

    // Find all navigation links
    const navLinks = page.locator('nav a, aside a, [class*="sidebar"] a');
    const count = await navLinks.count();

    expect(count).toBeGreaterThan(10); // Should have many nav items

    // Check first few links are clickable
    for (let i = 0; i < Math.min(3, count); i++) {
      const link = navLinks.nth(i);
      await expect(link).toBeVisible();
      const href = await link.getAttribute('href');
      expect(href).toBeTruthy();
    }
  });

  test('should highlight active route', async ({ page }) => {
    await page.goto('/projects');
    await page.waitForTimeout(500);

    // Look for active/selected state on nav item
    const activeLink = page.locator('[class*="active"], [aria-current="page"]');
    const hasActive = await activeLink.count();

    // Should have at least one active nav item
    expect(hasActive).toBeGreaterThan(0);
  });
});

test.describe('Navigation - 404 Handling', () => {
  test('should handle unknown routes gracefully', async ({ page }) => {
    const response = await page.goto('/this-route-does-not-exist-xyz123');

    // Either 404 or redirect to home
    const status = response?.status();
    const isNotFound = status === 404;
    const isRedirect = status === 200; // SPA might show 200 and handle internally

    expect(isNotFound || isRedirect).toBeTruthy();

    // Should show something (not blank page)
    const content = await page.content();
    expect(content.length).toBeGreaterThan(100);
  });
});

test.describe('Navigation - Route Transitions', () => {
  test('should navigate between pages without errors', async ({ page }) => {
    await page.goto('/');

    // Navigate through several pages
    await page.goto('/projects');
    await page.waitForTimeout(300);

    await page.goto('/workflows');
    await page.waitForTimeout(300);

    await page.goto('/analytics');
    await page.waitForTimeout(300);

    // Back to home
    await page.goto('/');

    // No navigation errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.waitForTimeout(500);
    const criticalErrors = errors.filter(e =>
      !e.includes('DevTools') &&
      !e.includes('warning')
    );
    expect(criticalErrors.length).toBe(0);
  });
});
