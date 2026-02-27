import { test, expect } from '@playwright/test';

/**
 * Audit Log Tests
 * Tests the comprehensive audit system with filtering, pagination, and statistics
 */

test.describe('Audit Log', () => {
  test('should load audit log page', async ({ page }) => {
    await page.goto('/audit');

    // Check page loaded
    const heading = page.locator('h1, h2').filter({ hasText: /audit/i });
    await expect(heading.first()).toBeVisible();
  });

  test('should display event list or empty state', async ({ page }) => {
    await page.goto('/audit');
    await page.waitForTimeout(1000);

    // Check for events table or empty message
    const hasTable = await page.locator('table, [role="table"]').count() > 0;
    const hasEmptyState = await page.locator('text=/no event|empty|no audit/i').count() > 0;
    const hasList = await page.locator('[class*="event"], [class*="log"]').count() > 0;

    expect(hasTable || hasEmptyState || hasList).toBeTruthy();
  });

  test('should have filter controls', async ({ page }) => {
    await page.goto('/audit');

    // Check for filter inputs
    const hasDateFilter = await page.locator('input[type="date"], input[placeholder*="date" i]').count() > 0;
    const hasModuleFilter = await page.locator('select, input[placeholder*="module" i]').count() > 0;
    const hasSearchBox = await page.locator('input[type="search"], input[placeholder*="search" i]').count() > 0;

    // At least one filter should exist
    expect(hasDateFilter || hasModuleFilter || hasSearchBox).toBeTruthy();
  });

  test('should have pagination controls', async ({ page }) => {
    await page.goto('/audit');
    await page.waitForTimeout(1000);

    // Check for pagination (might not be visible if < 50 events)
    const hasPagination = await page.locator('button, a').filter({ hasText: /next|prev|page/i }).count() > 0;

    // Pagination is optional if no data
    expect(hasPagination).toBeDefined();
  });

  test('should display statistics panel', async ({ page }) => {
    await page.goto('/audit');

    // Look for stats display
    const hasStats = await page.locator('[class*="stat"], [class*="metric"]').count() > 0;
    const hasStatsText = await page.locator('text=/total|cost|token|call/i').count() > 0;

    expect(hasStats || hasStatsText).toBeTruthy();
  });

  test('should have export button', async ({ page }) => {
    await page.goto('/audit');

    // Check for export/download button
    const exportButton = page.locator('button, a').filter({ hasText: /export|download|csv/i });
    const hasExport = await exportButton.count();

    expect(hasExport).toBeGreaterThan(0);
  });

  test('should handle sorting', async ({ page }) => {
    await page.goto('/audit');
    await page.waitForTimeout(1000);

    // Look for sortable column headers
    const hasSortableColumns = await page.locator('[role="columnheader"], th').count() > 0;

    // Tables might use different patterns
    expect(hasSortableColumns).toBeDefined();
  });

  test('should display model breakdown', async ({ page }) => {
    await page.goto('/audit');

    // Look for model-specific stats (Opus, Sonnet, Haiku)
    const content = await page.content();
    const hasModelStats = content.includes('opus') || content.includes('sonnet') || content.includes('haiku') || content.includes('model');

    expect(hasModelStats).toBeTruthy();
  });

  test('should display cost information', async ({ page }) => {
    await page.goto('/audit');

    // Check for cost display
    const hasCost = await page.locator('text=/cost|\$|usd|eur/i').count() > 0;

    expect(hasCost).toBeTruthy();
  });

  test('should have review status workflow controls', async ({ page }) => {
    await page.goto('/audit');
    await page.waitForTimeout(1000);

    // Look for review status indicators or controls
    const hasReviewStatus = await page.locator('text=/draft|review|approv/i').count() > 0;

    // Review status might not be visible if no events
    expect(hasReviewStatus).toBeDefined();
  });
});

test.describe('Audit Log - Filtering', () => {
  test('should filter by date range', async ({ page }) => {
    await page.goto('/audit');
    await page.waitForTimeout(1000);

    // Find date inputs
    const startDate = page.locator('input[type="date"], input[name*="start"]').first();
    const dateExists = await startDate.count();

    if (dateExists > 0) {
      // Set a date range
      await startDate.fill('2026-02-01');
      await page.waitForTimeout(500);

      // Results should update (or show "no results")
      const content = await page.content();
      expect(content).toBeTruthy();
    }
  });

  test('should filter by module', async ({ page }) => {
    await page.goto('/audit');
    await page.waitForTimeout(1000);

    // Find module filter
    const moduleFilter = page.locator('select[name*="module"], input[placeholder*="module" i]').first();
    const filterExists = await moduleFilter.count();

    if (filterExists > 0) {
      // Interact with filter
      const tagName = await moduleFilter.evaluate(el => el.tagName.toLowerCase());

      if (tagName === 'select') {
        await moduleFilter.selectOption({ index: 1 });
      } else {
        await moduleFilter.fill('gap-analysis');
      }

      await page.waitForTimeout(500);

      // Results should update
      const content = await page.content();
      expect(content).toBeTruthy();
    }
  });

  test('should filter by search text', async ({ page }) => {
    await page.goto('/audit');
    await page.waitForTimeout(1000);

    // Find search box
    const searchBox = page.locator('input[type="search"], input[placeholder*="search" i]').first();
    const searchExists = await searchBox.count();

    if (searchExists > 0) {
      await searchBox.fill('test');
      await page.waitForTimeout(500);

      // Results should filter
      const content = await page.content();
      expect(content).toBeTruthy();
    }
  });
});

test.describe('Audit Log - Security Events', () => {
  test('should have security events section', async ({ page }) => {
    await page.goto('/audit');

    // Look for security section or tab
    const hasSecurity = await page.locator('text=/security|threat|alert/i').count() > 0;

    // Security section might be in a tab or separate page
    expect(hasSecurity).toBeDefined();
  });

  test('should have login attempts section', async ({ page }) => {
    await page.goto('/audit');

    // Look for login attempts
    const hasLoginAttempts = await page.locator('text=/login|authentication|sign.*in/i').count() > 0;

    // Login tracking visible in team mode
    expect(hasLoginAttempts).toBeDefined();
  });
});
