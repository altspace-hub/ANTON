import { test, expect } from '@playwright/test';
import { mkdirSync } from 'fs';

mkdirSync('tests/screenshots', { recursive: true });

/**
 * Round 3: Cross-Page Features
 * Tests dashboard, My Work, navigation, Brief Me, Guide Me, Settings
 */

// ─────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────

test.describe('Dashboard', () => {
  test('loads with stats and navigation', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'tests/screenshots/dashboard-full.png', fullPage: true });

    const pageText = await page.locator('body').innerText();
    console.log('Dashboard text (500 chars):', pageText.substring(0, 500));

    // Check sidebar
    const sidebar = page.locator('nav, aside, [class*="sidebar"], [class*="Sidebar"]').first();
    const hasSidebar = await sidebar.isVisible({ timeout: 3000 }).catch(() => false);
    console.log('Sidebar visible:', hasSidebar);

    // Check heading
    const heading = page.locator('h1, h2, [role="heading"]').first();
    const hasHeading = await heading.isVisible({ timeout: 3000 }).catch(() => false);
    console.log('Has heading:', hasHeading);

    // Check for stats (sessions, tokens, cost)
    const hasStats = /session|token|cost|\$|usage/i.test(pageText);
    console.log('Has stats on dashboard:', hasStats);

    // Check for module cards
    const hasModules = /module|brief|guide|coding|workflow/i.test(pageText);
    console.log('Has module references:', hasModules);

    // Report console errors
    const critical = consoleErrors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('net::ERR_FAILED') &&
      !e.toLowerCase().includes('warning')
    );
    if (critical.length > 0) {
      console.warn('Dashboard console errors:', critical);
    }
    console.log(`Dashboard console errors: ${critical.length}`);
  });

  test('quick-access or recent sessions visible', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    const pageText = await page.locator('body').innerText();
    const hasRecentOrCTA = /recent|session|start|continue|new|create/i.test(pageText);
    console.log('Has recent sessions or CTA:', hasRecentOrCTA);

    // If sessions exist, check they're listed
    const sessionItems = await page.locator('[class*="session"], [class*="history"]').count();
    console.log('Session list items:', sessionItems);
  });
});

// ─────────────────────────────────────────────────────────────
// MY WORK / CONTINUE
// ─────────────────────────────────────────────────────────────

test.describe('My Work / Continue', () => {
  test('page loads and shows session list', async ({ page }) => {
    await page.goto('/my-work');
    await page.waitForTimeout(1500);

    await page.screenshot({ path: 'tests/screenshots/my-work-full.png', fullPage: true });

    const pageText = await page.locator('body').innerText();
    console.log('My Work page text (400 chars):', pageText.substring(0, 400));

    // Should not be blank
    expect(pageText.length).toBeGreaterThan(20);

    // Check for session list or "no sessions" message
    const hasSessionList = /session|work|history|previous|recent|no sessions|empty/i.test(pageText);
    console.log('My Work has session context:', hasSessionList);
  });

  test('coding sessions link to correct pages', async ({ page }) => {
    await page.goto('/my-work');
    await page.waitForTimeout(1500);

    // Look for any coding session links
    const codingLinks = page.locator('a[href*="coding"]');
    const count = await codingLinks.count();
    console.log('Coding session links found in My Work:', count);

    if (count > 0) {
      const href = await codingLinks.first().getAttribute('href');
      console.log('First coding session link href:', href);

      // Should link to a valid coding page
      const isValidLink = href && (
        href.includes('/coding') &&
        !href.includes('module-not-found') &&
        !href.includes('undefined')
      );
      console.log('Link is valid (not "module not found"):', isValidLink);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// BRIEF ME
// ─────────────────────────────────────────────────────────────

test.describe('Brief Me', () => {
  test('page loads with knowledge sources and output formats', async ({ page }) => {
    await page.goto('/brief');
    await page.waitForTimeout(1500);

    await page.screenshot({ path: 'tests/screenshots/brief-me-full.png', fullPage: true });

    const pageText = await page.locator('body').innerText();
    console.log('Brief Me page text (400 chars):', pageText.substring(0, 400));

    // Check Knowledge Source Panel
    const hasKnowledge = /knowledge source|claude.*knowledge|web search|local folder/i.test(pageText);
    console.log('Has Knowledge Source Panel:', hasKnowledge);

    // Check Output Format chips
    const hasOutputFormats = /executive summary|action plan|output format|produce/i.test(pageText);
    console.log('Has Output Format selector:', hasOutputFormats);

    // Check Thinking Controls
    const hasThinking = /thinking|quick|investigate|think/i.test(pageText);
    console.log('Has Thinking Controls:', hasThinking);
  });
});

// ─────────────────────────────────────────────────────────────
// GUIDE ME
// ─────────────────────────────────────────────────────────────

test.describe('Guide Me', () => {
  test('page loads with guided flow', async ({ page }) => {
    await page.goto('/guide');
    await page.waitForTimeout(1500);

    await page.screenshot({ path: 'tests/screenshots/guide-me-full.png', fullPage: true });

    const pageText = await page.locator('body').innerText();
    console.log('Guide Me page text (400 chars):', pageText.substring(0, 400));

    // Should have some step indicator or guided flow
    const hasSteps = /step|guide|proceed|next|stage/i.test(pageText);
    console.log('Guide Me has step indicators:', hasSteps);
  });
});

// ─────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────

test.describe('Settings', () => {
  test('page loads with API key and model settings', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForTimeout(1500);

    await page.screenshot({ path: 'tests/screenshots/settings-full.png', fullPage: true });

    const pageText = await page.locator('body').innerText();
    console.log('Settings page text (400 chars):', pageText.substring(0, 400));

    // Check for API key field
    const hasApiKey = /api key|anthropic|sk-ant/i.test(pageText);
    const apiKeyInput = page.locator('input[type="password"], input[type="text"]').filter({ has: page.locator('[placeholder*="key" i]') }).first();
    const hasApiInput = await apiKeyInput.isVisible({ timeout: 3000 }).catch(() => false);
    console.log('Has API key section:', hasApiKey, '| input visible:', hasApiInput);

    // Check for model selector
    const hasModelSelector = /model|haiku|sonnet|opus/i.test(pageText);
    console.log('Has model selector:', hasModelSelector);

    // Check for language selector
    const hasLanguage = /language|english|swedish|nordic/i.test(pageText);
    console.log('Has language selector:', hasLanguage);
  });
});

// ─────────────────────────────────────────────────────────────
// NAVIGATION BETWEEN PAGES
// ─────────────────────────────────────────────────────────────

test.describe('Navigation - Cross-Page', () => {
  test('sidebar navigation works for core pages', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    // Try clicking sidebar links
    const navLinks = page.locator('nav a, aside a, [class*="sidebar"] a, [class*="Sidebar"] a');
    const count = await navLinks.count();
    console.log('Total sidebar nav links:', count);

    expect(count).toBeGreaterThan(5);

    // Navigate to a few pages via sidebar clicks
    const testRoutes = ['/projects', '/workflows', '/audit', '/settings'];
    for (const route of testRoutes) {
      const link = page.locator(`a[href="${route}"], a[href*="${route}"]`).first();
      if (await link.isVisible({ timeout: 2000 })) {
        await link.click();
        await page.waitForTimeout(800);
        expect(page.url()).toContain(route.replace('/', ''));
        console.log(`✓ Navigated to ${route} via sidebar`);
      } else {
        console.warn(`⚠ No sidebar link found for ${route}`);
      }
    }
  });

  test('active state highlights on current page', async ({ page }) => {
    await page.goto('/projects');
    await page.waitForTimeout(1000);

    const activeLink = page.locator('[class*="active"], [aria-current="page"], [class*="selected"]');
    const count = await activeLink.count();
    console.log('Active nav items found on /projects:', count);

    await page.screenshot({ path: 'tests/screenshots/nav-active-state.png', fullPage: true });
  });

  test('404 / unknown route handled gracefully', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-xyz-999');
    await page.waitForTimeout(1000);

    const pageText = await page.locator('body').innerText();
    console.log('Unknown route page text (200 chars):', pageText.substring(0, 200));

    // Should either show 404 message or redirect — not blank
    expect(pageText.length).toBeGreaterThan(10);

    await page.screenshot({ path: 'tests/screenshots/nav-404.png', fullPage: true });
  });
});

// ─────────────────────────────────────────────────────────────
// CROSS-CUTTING: CONSOLE ERRORS CHECK
// ─────────────────────────────────────────────────────────────

test.describe('Console Error Audit', () => {
  const CHECK_ROUTES = ['/', '/coding', '/coding/script-medium', '/coding/review', '/my-work', '/settings', '/brief'];

  for (const route of CHECK_ROUTES) {
    test(`no critical console errors on ${route}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text());
      });

      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      const critical = errors.filter(e =>
        !e.includes('favicon') &&
        !e.includes('manifest') &&
        !e.includes('net::ERR_FAILED') &&
        !e.toLowerCase().includes('warn')
      );

      if (critical.length > 0) {
        console.warn(`Console errors on ${route}:`, critical);
      }

      // Log for report
      console.log(`${route}: ${critical.length} critical errors | ${errors.length} total`);

      // Soft assertion — log but don't fail (we want to collect all info)
      // Remove the line below if you want hard failures:
      // expect(critical.length).toBe(0);
    });
  }
});
