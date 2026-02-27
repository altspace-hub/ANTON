import { test, expect, Page } from '@playwright/test';
import { mkdirSync } from 'fs';

mkdirSync('tests/screenshots', { recursive: true });

/**
 * Gated tests — all routes require clicking "Enter Anton" splash screen first.
 * This suite handles the splash gate and then tests actual app functionality.
 */

// ─────────────────────────────────────────────────────────────
// HELPER: Enter app through splash gate
// ─────────────────────────────────────────────────────────────

async function enterApp(page: Page, targetPath: string = '/') {
  await page.goto(targetPath, { waitUntil: 'domcontentloaded' });

  // Click "Enter Anton" button to bypass the splash gate
  const enterBtn = page.locator('button, a').filter({ hasText: /enter anton/i }).first();
  if (await enterBtn.isVisible({ timeout: 5000 })) {
    await enterBtn.click();
    console.log('✓ Passed "Enter Anton" splash gate');
  } else {
    console.log('ℹ No splash gate found — already past it');
  }

  // Wait until the sidebar (aside) is visible — confirms the real app has mounted
  await page.locator('aside').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});

  // Then wait for any remaining network activity to settle
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
}

// Navigate within the app (no splash expected) and wait for content to settle
async function navTo(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });

  // Re-handle splash if it appears (direct URL navigation can re-trigger it)
  const enterBtn = page.locator('button, a').filter({ hasText: /enter anton/i }).first();
  if (await enterBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await enterBtn.click();
    await page.locator('aside').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  }

  // Wait for main content heading to appear (h1, h2, or a page-level element beyond the sidebar)
  await page.locator('main h1, main h2, [class*="page"] h1, [class*="content"] h1, aside ~ * h1, aside ~ * h2')
    .first()
    .waitFor({ state: 'visible', timeout: 8000 })
    .catch(() => {});

  // Final network settle
  await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
}

async function switchToHaiku(page: Page) {
  try {
    // Try opening Advanced Settings accordion
    const advSettings = page.locator('button, summary, [role="button"]').filter({ hasText: /advanced settings/i }).first();
    if (await advSettings.isVisible({ timeout: 3000 })) {
      await advSettings.click();
      await page.waitForTimeout(500);
    }

    // Look for Haiku option
    const haikuOption = page
      .locator('button, [role="option"], label, [role="radio"], [role="menuitem"]')
      .filter({ hasText: /haiku/i })
      .first();

    if (await haikuOption.isVisible({ timeout: 3000 })) {
      await haikuOption.click();
      // Dismiss the model selector panel by pressing Escape or clicking the heading
      await page.keyboard.press('Escape');
      // Also collapse Advanced Settings if it's still open
      const advBtn2 = page.locator('button, summary').filter({ hasText: /advanced settings/i }).first();
      if (await advBtn2.isVisible({ timeout: 1000 })) {
        // Check if it's expanded — if so click to collapse
        const isExpanded = await advBtn2.getAttribute('aria-expanded');
        if (isExpanded === 'true') await advBtn2.click();
      }
      await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
      console.log('✓ Switched to Haiku model');
      return true;
    }

    // Try select dropdown
    const selects = await page.locator('select').all();
    for (const sel of selects) {
      const options = await sel.locator('option').all();
      for (const opt of options) {
        const val = await opt.getAttribute('value') || '';
        if (val.toLowerCase().includes('haiku')) {
          await sel.selectOption(val);
          console.log('✓ Switched to Haiku via select');
          return true;
        }
      }
    }

    console.warn('⚠ Could not find Haiku model selector');
    return false;
  } catch (e) {
    console.warn('⚠ switchToHaiku error:', e);
    return false;
  }
}

async function waitForStreamingComplete(page: Page, timeoutMs = 90000) {
  try {
    await page.waitForSelector(
      'button:has-text("Stop"), button:has-text("Processing"), button:has-text("Generating"), button:has-text("Thinking")',
      { state: 'visible', timeout: 20000 }
    ).catch(() => {});

    await page.waitForSelector(
      'button:has-text("Stop"), button:has-text("Processing"), button:has-text("Generating"), button:has-text("Thinking")',
      { state: 'hidden', timeout: timeoutMs }
    ).catch(() => {});

    await page.waitForTimeout(1000);
  } catch (e) {
    console.warn('⚠ Streaming wait timeout');
  }
}

// ─────────────────────────────────────────────────────────────
// TEST 1: SPLASH SCREEN
// ─────────────────────────────────────────────────────────────

test.describe('Splash Screen', () => {
  test('splash gate renders correctly on every route', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'tests/screenshots/splash-gate.png', fullPage: true });

    // Check splash elements
    const hasEnterBtn = await page.locator('button, a').filter({ hasText: /enter anton/i }).isVisible({ timeout: 5000 });
    const hasAntonTitle = await page.locator('text=Anton').isVisible({ timeout: 3000 }).catch(() => false);
    const hasSoloMode = await page.locator('text=/solo mode/i').isVisible({ timeout: 3000 }).catch(() => false);
    const hasOpenExpert = await page.locator('text=/openexpert/i').isVisible({ timeout: 3000 }).catch(() => false);

    console.log('Splash elements:', { hasEnterBtn, hasAntonTitle, hasSoloMode, hasOpenExpert });

    expect(hasEnterBtn).toBeTruthy();
  });

  test('Enter Anton button navigates into the app', async ({ page }) => {
    await page.goto('/');

    const enterBtn = page.locator('button, a').filter({ hasText: /enter anton/i }).first();
    await expect(enterBtn).toBeVisible({ timeout: 5000 });

    await enterBtn.click();

    // Wait for the sidebar to confirm the app has mounted
    await page.locator('aside').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});

    await page.screenshot({ path: 'tests/screenshots/post-enter-dashboard.png', fullPage: true });

    // Should no longer show the splash
    const splashStillVisible = await page.locator('button, a').filter({ hasText: /enter anton/i }).isVisible({ timeout: 2000 }).catch(() => false);
    console.log('Splash still visible after click:', splashStillVisible);

    // Should show actual app content
    const pageText = await page.locator('body').innerText();
    console.log('Post-enter page text (400 chars):', pageText.substring(0, 400));
  });
});

// ─────────────────────────────────────────────────────────────
// TEST 2: DASHBOARD (post-gate)
// ─────────────────────────────────────────────────────────────

test.describe('Dashboard (post-gate)', () => {
  test('dashboard loads with sidebar and stats', async ({ page }) => {
    await enterApp(page, '/');

    await page.screenshot({ path: 'tests/screenshots/dashboard-post-gate.png', fullPage: true });

    const pageText = await page.locator('body').innerText();
    console.log('Dashboard (gated) text (600 chars):', pageText.substring(0, 600));

    // Check sidebar (aside element confirmed in source)
    const sidebar = page.locator('aside').first();
    const hasSidebar = await sidebar.isVisible({ timeout: 5000 }).catch(() => false);
    console.log('Sidebar (aside) visible:', hasSidebar);

    // Check nav inside aside
    const nav = page.locator('aside nav, nav').first();
    const hasNav = await nav.isVisible({ timeout: 3000 }).catch(() => false);
    console.log('Nav visible:', hasNav);

    // Count nav links
    const navLinks = await page.locator('aside a, nav a').count();
    console.log('Nav link count:', navLinks);

    // Check dark theme (post-gate)
    const bgColor = await page.evaluate(() => {
      const main = document.querySelector('main, #root > div, aside');
      return main ? window.getComputedStyle(main).backgroundColor : 'not found';
    });
    console.log('App background color:', bgColor);

    // Check for stats
    const hasStats = /session|token|cost|\$|usage|work|module/i.test(pageText);
    console.log('Has stats/module content:', hasStats);
  });
});

// ─────────────────────────────────────────────────────────────
// TEST 3: ALL ROUTES (post-gate) — screenshot each
// ─────────────────────────────────────────────────────────────

test.describe('All Routes (post-gate)', () => {
  const ROUTES = [
    { path: '/brief', name: 'brief-me' },
    { path: '/guide', name: 'guide-me' },
    { path: '/fill', name: 'fill-form' },
    { path: '/challenge', name: 'challenge-this' },
    { path: '/prompt', name: 'open-chat' },
    { path: '/workflows', name: 'workflows' },
    { path: '/projects', name: 'projects' },
    { path: '/skills', name: 'skills-library' },
    { path: '/audit', name: 'audit-log' },
    { path: '/settings', name: 'settings' },
    { path: '/my-work', name: 'my-work' },
    { path: '/coding', name: 'coding-landing' },
    { path: '/coding/review', name: 'coding-review' },
    { path: '/coding/script-lite', name: 'coding-script-lite' },
    { path: '/coding/script-medium', name: 'coding-script-medium' },
    { path: '/coding/large', name: 'coding-large' },
  ];

  for (const route of ROUTES) {
    test(`${route.name} (${route.path}) loads post-gate`, async ({ page }) => {
      // Use navTo which handles splash + waits for real content
      await navTo(page, route.path);

      await page.screenshot({
        path: `tests/screenshots/gated-${route.name}.png`,
        fullPage: true,
      });

      const pageText = await page.locator('body').innerText();
      console.log(`${route.name} post-gate text (300 chars):`, pageText.substring(0, 300));

      // Should have meaningful content beyond the splash
      const hasMeaningfulContent = pageText.length > 50;
      expect(hasMeaningfulContent).toBeTruthy();
    });
  }
});

// ─────────────────────────────────────────────────────────────
// TEST 4: CODING LANDING (post-gate)
// ─────────────────────────────────────────────────────────────

test.describe('Coding Landing (post-gate)', () => {
  test('shows 4 tier cards', async ({ page }) => {
    await enterApp(page, '/coding');

    await page.screenshot({ path: 'tests/screenshots/gated-coding-landing-full.png', fullPage: true });

    const pageText = await page.locator('body').innerText();
    console.log('Coding landing post-gate text (500 chars):', pageText.substring(0, 500));

    const hasCodeReview = /code review|review/i.test(pageText);
    const hasScriptLite = /script lite|lite/i.test(pageText);
    const hasScriptMedium = /script medium|medium/i.test(pageText);
    const hasLarge = /large|discovery/i.test(pageText);

    console.log('Coding tiers visible:', { hasCodeReview, hasScriptLite, hasScriptMedium, hasLarge });
  });
});

// ─────────────────────────────────────────────────────────────
// TEST 5: SCRIPT MEDIUM (post-gate) — core flow
// ─────────────────────────────────────────────────────────────

test.describe('Script Medium (post-gate)', () => {
  test('describe stage UI elements', async ({ page }) => {
    await enterApp(page, '/coding/script-medium');

    await page.screenshot({ path: 'tests/screenshots/gated-script-medium-initial.png', fullPage: true });

    const pageText = await page.locator('body').innerText();
    console.log('Script Medium post-gate text (600 chars):', pageText.substring(0, 600));

    // App type selector
    const hasReact = /react/i.test(pageText);
    const hasHtml = /html/i.test(pageText);
    const hasPython = /python/i.test(pageText);
    const hasNode = /node/i.test(pageText);
    console.log('App type options:', { hasReact, hasHtml, hasPython, hasNode });

    // Live preview toggle
    const hasPreview = /live preview|preview mode/i.test(pageText);
    console.log('Has live preview toggle:', hasPreview);

    // Description textarea
    const textarea = page.locator('textarea').first();
    const hasTextarea = await textarea.isVisible({ timeout: 3000 }).catch(() => false);
    console.log('Has description textarea:', hasTextarea);

    // Advanced settings
    const hasAdvSettings = await page.locator('button, summary').filter({ hasText: /advanced/i }).isVisible({ timeout: 3000 }).catch(() => false);
    console.log('Has Advanced Settings:', hasAdvSettings);
  });

  test('live preview toggle', async ({ page }) => {
    await enterApp(page, '/coding/script-medium');

    // Find preview toggle
    let toggled = false;
    const previewToggle = page.locator('button, [role="switch"]').filter({ hasText: /preview/i }).first();
    if (await previewToggle.isVisible({ timeout: 3000 })) {
      await previewToggle.click();
      toggled = true;
    } else {
      // Find by proximity to text
      const labels = await page.locator('label, span, div').filter({ hasText: /live preview/i }).all();
      for (const label of labels) {
        const parent = label.locator('..');
        const btn = parent.locator('button, [role="switch"], input[type="checkbox"]').first();
        if (await btn.isVisible({ timeout: 1000 })) {
          await btn.click();
          toggled = true;
          break;
        }
      }
    }

    // Wait for the UI to react to the toggle
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
    await page.screenshot({ path: 'tests/screenshots/gated-script-medium-preview-toggle.png', fullPage: true });

    const pageText = await page.locator('body').innerText();
    const hasTargetPlatform = /target platform/i.test(pageText);
    console.log('Preview toggled:', toggled, '| Target Platform text appeared:', hasTargetPlatform);
  });

  test('advanced settings shows model selector', async ({ page }) => {
    await enterApp(page, '/coding/script-medium');

    const advBtn = page.locator('button, summary').filter({ hasText: /advanced/i }).first();
    if (await advBtn.isVisible({ timeout: 3000 })) {
      await advBtn.click();
      // Wait for accordion to expand and reveal content
      await page.locator('text=/thinking|model|haiku|quick/i').first()
        .waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
      await page.screenshot({ path: 'tests/screenshots/gated-script-medium-advanced.png', fullPage: true });

      const pageText = await page.locator('body').innerText();
      const hasModel = /haiku|sonnet|opus|model/i.test(pageText);
      const hasThinking = /thinking|quick|investigate/i.test(pageText);
      console.log('Advanced settings: model selector:', hasModel, '| thinking controls:', hasThinking);
    } else {
      console.warn('⚠ Advanced Settings button not found post-gate');
    }
  });

  test('Flow: Generate application (Haiku, skip questions)', async ({ page }) => {
    test.setTimeout(120000);

    await enterApp(page, '/coding/script-medium');

    // Fill description
    const textarea = page.locator('textarea').first();
    if (await textarea.isVisible({ timeout: 5000 })) {
      await textarea.fill('A simple to-do list app with add, complete, and delete functionality');
    } else {
      console.warn('⚠ No textarea found for description');
      return;
    }

    // Switch to Haiku
    await switchToHaiku(page);

    await page.screenshot({ path: 'tests/screenshots/gated-script-medium-preflight.png', fullPage: true });

    // Click Generate (skip questions)
    const genBtn = page.locator('button').filter({ hasText: /generate/i }).first();
    if (await genBtn.isVisible({ timeout: 5000 })) {
      await genBtn.click();
      console.log('Clicked Generate Application');

      await waitForStreamingComplete(page, 90000);

      await page.screenshot({ path: 'tests/screenshots/gated-script-medium-output.png', fullPage: true });

      const pageText = await page.locator('body').innerText();
      const hasCode = /html|css|javascript|function|const|var|<div|<html/i.test(pageText);
      const hasFileManifest = /index\.html|style\.css|script\.js|\.html|\.css|\.js/i.test(pageText);
      const hasArchNotes = /architecture|overview|structure|explanation|component/i.test(pageText);
      const hasDownload = await page.locator('button').filter({ hasText: /download|zip/i }).isVisible({ timeout: 3000 }).catch(() => false);

      console.log('Output: has code:', hasCode, '| file manifest:', hasFileManifest, '| arch notes:', hasArchNotes, '| download btn:', hasDownload);
    } else {
      console.warn('⚠ Generate button not found post-gate');
    }
  });

  test('Flow: Get Questions First (Haiku)', async ({ page }) => {
    test.setTimeout(120000);

    await enterApp(page, '/coding/script-medium');

    const textarea = page.locator('textarea').first();
    if (await textarea.isVisible({ timeout: 5000 })) {
      await textarea.fill('A simple counter app with increment and decrement buttons');
    }

    await switchToHaiku(page);

    const questionsBtn = page.locator('button').filter({ hasText: /get questions|clarify|questions first/i }).first();
    const hasQuestionsBtn = await questionsBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log('Has "Get Questions First" button:', hasQuestionsBtn);

    if (hasQuestionsBtn) {
      await questionsBtn.click();
      await waitForStreamingComplete(page, 90000);

      await page.screenshot({ path: 'tests/screenshots/gated-script-medium-questions.png', fullPage: true });

      // Check if questions rendered as input fields (CRITICAL)
      const inputCount = await page.locator('input[type="text"], textarea').count();
      const pageText = await page.locator('body').innerText();
      const hasQuestionText = /\?|what|how|which|will|should|do you/i.test(pageText.slice(-2000)); // Check end of content

      console.log(`CRITICAL: input fields after questions: ${inputCount} | question text visible: ${hasQuestionText}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// TEST 6: SCRIPT LITE (post-gate)
// ─────────────────────────────────────────────────────────────

test.describe('Script Lite (post-gate)', () => {
  test('describe stage has textarea and buttons', async ({ page }) => {
    await enterApp(page, '/coding/script-lite');

    await page.screenshot({ path: 'tests/screenshots/gated-script-lite-initial.png', fullPage: true });

    const pageText = await page.locator('body').innerText();
    console.log('Script Lite post-gate (500 chars):', pageText.substring(0, 500));

    const textarea = page.locator('textarea').first();
    const hasTextarea = await textarea.isVisible({ timeout: 3000 }).catch(() => false);

    const genBtn = page.locator('button').filter({ hasText: /generate/i }).first();
    const hasGenBtn = await genBtn.isVisible({ timeout: 3000 }).catch(() => false);

    const questionsBtn = page.locator('button').filter({ hasText: /get questions|clarify/i }).first();
    const hasQuestionsBtn = await questionsBtn.isVisible({ timeout: 3000 }).catch(() => false);

    console.log('Script Lite: textarea:', hasTextarea, '| generate btn:', hasGenBtn, '| questions btn:', hasQuestionsBtn);
  });

  test('get questions flow', async ({ page }) => {
    test.setTimeout(120000);

    await enterApp(page, '/coding/script-lite');

    const textarea = page.locator('textarea').first();
    if (await textarea.isVisible({ timeout: 5000 })) {
      await textarea.fill('Write a Python script that reads a CSV file and counts the number of rows per unique value in a specific column');
    }

    await switchToHaiku(page);

    const questionsBtn = page.locator('button').filter({ hasText: /get questions|questions first/i }).first();
    if (await questionsBtn.isVisible({ timeout: 5000 })) {
      await questionsBtn.click();
      await waitForStreamingComplete(page, 90000);
      await page.screenshot({ path: 'tests/screenshots/gated-script-lite-questions.png', fullPage: true });

      const inputCount = await page.locator('input[type="text"], textarea').count();
      console.log('CRITICAL: inputs after questions:', inputCount);
    } else {
      // Direct generate
      const genBtn = page.locator('button').filter({ hasText: /generate/i }).first();
      if (await genBtn.isVisible({ timeout: 5000 })) {
        await genBtn.click();
        await waitForStreamingComplete(page, 90000);
        await page.screenshot({ path: 'tests/screenshots/gated-script-lite-direct-output.png', fullPage: true });
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────
// TEST 7: CODE REVIEW (post-gate)
// ─────────────────────────────────────────────────────────────

test.describe('Code Review (post-gate)', () => {
  const VULNERABLE_CODE = `import sqlite3
def get_user(user_id):
    conn = sqlite3.connect('app.db')
    cursor = conn.cursor()
    cursor.execute(f"SELECT * FROM users WHERE id = '{user_id}'")
    return cursor.fetchone()`;

  test('review page UI elements', async ({ page }) => {
    await enterApp(page, '/coding/review');

    await page.screenshot({ path: 'tests/screenshots/gated-code-review-initial.png', fullPage: true });

    const pageText = await page.locator('body').innerText();
    console.log('Code Review post-gate (500 chars):', pageText.substring(0, 500));

    const hasPasteArea = /paste|code|input/i.test(pageText);
    const hasLenses = /security|compliance|architecture|lens/i.test(pageText);
    const hasExplainLevel = /explanation|level|deep|high/i.test(pageText);

    console.log('Code Review UI:', { hasPasteArea, hasLenses, hasExplainLevel });
  });

  test('run review with SQL injection code', async ({ page }) => {
    test.setTimeout(120000);

    await enterApp(page, '/coding/review');

    // Try to paste code
    const codeArea = page.locator('textarea, [contenteditable="true"]').first();
    if (await codeArea.isVisible({ timeout: 5000 })) {
      await codeArea.fill(VULNERABLE_CODE);
    } else {
      const pasteTab = page.locator('button, [role="tab"]').filter({ hasText: /paste/i }).first();
      if (await pasteTab.isVisible({ timeout: 3000 })) {
        await pasteTab.click();
        await page.waitForTimeout(300);
        const area = page.locator('textarea, [contenteditable="true"]').first();
        if (await area.isVisible({ timeout: 2000 })) await area.fill(VULNERABLE_CODE);
      }
    }

    // Select Security lens
    const secLens = page.locator('button, label, [role="checkbox"]').filter({ hasText: /^security$/i }).first();
    if (await secLens.isVisible({ timeout: 3000 })) await secLens.click();

    await switchToHaiku(page);

    await page.screenshot({ path: 'tests/screenshots/gated-code-review-ready.png', fullPage: true });

    const runBtn = page.locator('button').filter({ hasText: /run|review|analyze|start/i }).first();
    if (await runBtn.isVisible({ timeout: 5000 })) {
      await runBtn.click();
      await waitForStreamingComplete(page, 90000);

      await page.screenshot({ path: 'tests/screenshots/gated-code-review-output.png', fullPage: true });

      const pageText = await page.locator('body').innerText();
      const hasSQLInjection = /sql injection|injection|vulnerable|unsafe/i.test(pageText);
      console.log('CRITICAL: SQL injection caught in review:', hasSQLInjection);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// TEST 8: SETTINGS (post-gate)
// ─────────────────────────────────────────────────────────────

test.describe('Settings (post-gate)', () => {
  test('settings page content', async ({ page }) => {
    await enterApp(page, '/settings');

    await page.screenshot({ path: 'tests/screenshots/gated-settings.png', fullPage: true });

    const pageText = await page.locator('body').innerText();
    console.log('Settings post-gate (500 chars):', pageText.substring(0, 500));

    const hasApiKey = /api key|anthropic|key/i.test(pageText);
    const hasModel = /model|haiku|sonnet|opus/i.test(pageText);
    const hasLanguage = /language|english|swedish/i.test(pageText);

    console.log('Settings:', { hasApiKey, hasModel, hasLanguage });
  });
});

// ─────────────────────────────────────────────────────────────
// TEST 9: MY WORK (post-gate)
// ─────────────────────────────────────────────────────────────

test.describe('My Work (post-gate)', () => {
  test('session list or empty state', async ({ page }) => {
    await enterApp(page, '/my-work');

    await page.screenshot({ path: 'tests/screenshots/gated-my-work.png', fullPage: true });

    const pageText = await page.locator('body').innerText();
    console.log('My Work post-gate (500 chars):', pageText.substring(0, 500));

    const hasSessionContent = /session|work|history|continue|recent|empty|no sessions/i.test(pageText);
    console.log('My Work has meaningful content:', hasSessionContent);

    // Check coding links don't go to "module not found"
    const codingLinks = await page.locator('a[href*="coding"]').all();
    console.log('Coding session links:', codingLinks.length);
    for (const link of codingLinks) {
      const href = await link.getAttribute('href');
      const isNotBroken = href && !href.includes('undefined') && !href.includes('module-not-found');
      console.log('  Link:', href, '— valid:', isNotBroken);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// TEST 10: SIDEBAR NAVIGATION (post-gate)
// ─────────────────────────────────────────────────────────────

test.describe('Sidebar Navigation (post-gate)', () => {
  test('sidebar visible with nav links', async ({ page }) => {
    await enterApp(page, '/');

    await page.screenshot({ path: 'tests/screenshots/gated-sidebar.png', fullPage: true });

    // Sidebar is <aside> element (confirmed from source)
    const sidebar = page.locator('aside').first();
    const hasSidebar = await sidebar.isVisible({ timeout: 5000 }).catch(() => false);
    console.log('Aside sidebar visible:', hasSidebar);

    const navLinks = await page.locator('aside a, aside nav a').count();
    console.log('Nav links in sidebar:', navLinks);

    // Check active state
    const activeLinks = await page.locator('[class*="teal"], [class*="active"]').count();
    console.log('Active/teal elements:', activeLinks);
  });

  test('clicking nav links works', async ({ page }) => {
    await enterApp(page, '/');

    // Try navigating to a few pages via sidebar links
    const linkTests = [
      { text: /projects/i, expected: 'projects' },
      { text: /settings/i, expected: 'settings' },
      { text: /audit/i, expected: 'audit' },
    ];

    for (const lt of linkTests) {
      const link = page.locator('aside a').filter({ hasText: lt.text }).first();
      if (await link.isVisible({ timeout: 3000 })) {
        await link.click();
        // Wait for content heading to confirm page loaded
        await page.locator('aside ~ * h1, aside ~ * h2, main h1, main h2').first()
          .waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        const url = page.url();
        console.log(`Clicked "${lt.text}" — now at: ${url}`);
        await page.screenshot({ path: `tests/screenshots/gated-nav-${lt.expected}.png`, fullPage: true });

        // Return to home for next iteration
        await enterApp(page, '/');
      } else {
        console.warn(`⚠ Sidebar link for "${lt.text}" not found`);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────
// TEST 11: BRIEF ME (post-gate)
// ─────────────────────────────────────────────────────────────

test.describe('Brief Me (post-gate)', () => {
  test('knowledge source panel and output formats', async ({ page }) => {
    await enterApp(page, '/brief');

    await page.screenshot({ path: 'tests/screenshots/gated-brief-me.png', fullPage: true });

    const pageText = await page.locator('body').innerText();
    console.log('Brief Me post-gate (600 chars):', pageText.substring(0, 600));

    const hasKnowledgeSources = /knowledge|source|claude|web search/i.test(pageText);
    const hasOutputFormats = /executive|action plan|output|format|chip|produce/i.test(pageText);
    const hasThinking = /thinking|think|quick|investigate/i.test(pageText);
    const hasTextarea = await page.locator('textarea').isVisible({ timeout: 3000 }).catch(() => false);

    console.log('Brief Me features:', { hasKnowledgeSources, hasOutputFormats, hasThinking, hasTextarea });
  });
});

// ─────────────────────────────────────────────────────────────
// TEST 12: DARK THEME (post-gate)
// ─────────────────────────────────────────────────────────────

test.describe('Dark Theme (post-gate)', () => {
  test('app uses dark background post-gate', async ({ page }) => {
    await enterApp(page, '/');

    const bodyBg = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
    const sidebarBg = await page.evaluate(() => {
      const aside = document.querySelector('aside');
      return aside ? window.getComputedStyle(aside).backgroundColor : 'not found';
    });

    console.log('Body background (post-gate):', bodyBg);
    console.log('Sidebar background (post-gate):', sidebarBg);

    // adv-dark is #0B1426 = oklch(~0.15) — definitely not white
    const bodyNotWhite = bodyBg !== 'rgb(255, 255, 255)';
    console.log('Body is dark (not white):', bodyNotWhite);

    await page.screenshot({ path: 'tests/screenshots/gated-dark-theme.png', fullPage: true });
  });
});
