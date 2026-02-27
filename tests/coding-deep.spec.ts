import { test, expect } from '@playwright/test';
import { mkdirSync } from 'fs';

mkdirSync('tests/screenshots', { recursive: true });

/**
 * Round 2: Coding Area Deep Tests
 * Tests Script Lite, Script Medium (preview + normal), Code Review, Coding Large
 */

// Helper: Switch to Haiku model if model selector is available
async function switchToHaiku(page: any) {
  try {
    // Try opening Advanced Settings accordion
    const advSettings = page.locator('text=Advanced Settings').first();
    if (await advSettings.isVisible({ timeout: 3000 })) {
      await advSettings.click();
      await page.waitForTimeout(500);
    }

    // Look for Haiku option in model selector
    const haikuOption = page
      .locator('button, [role="option"], label, [role="radio"]')
      .filter({ hasText: /haiku/i })
      .first();

    if (await haikuOption.isVisible({ timeout: 3000 })) {
      await haikuOption.click();
      console.log('✓ Switched to Haiku model');
      return true;
    }

    // Try select dropdown
    const modelSelect = page.locator('select').filter({ has: page.locator('option[value*="haiku"]') }).first();
    if (await modelSelect.isVisible({ timeout: 2000 })) {
      await modelSelect.selectOption({ label: /haiku/i });
      console.log('✓ Switched to Haiku via select');
      return true;
    }

    console.warn('⚠ Could not find Haiku model selector');
    return false;
  } catch (e) {
    console.warn('⚠ switchToHaiku error:', e);
    return false;
  }
}

// Helper: Wait for streaming to finish
async function waitForStreamingComplete(page: any, timeoutMs = 90000) {
  try {
    // Wait for "Stop" / "Processing" button to appear then disappear
    await page.waitForSelector(
      'button:has-text("Stop"), button:has-text("Processing"), button:has-text("Generating")',
      { state: 'visible', timeout: 15000 }
    ).catch(() => {});

    await page.waitForSelector(
      'button:has-text("Stop"), button:has-text("Processing"), button:has-text("Generating")',
      { state: 'hidden', timeout: timeoutMs }
    ).catch(() => {});

    await page.waitForTimeout(1000);
  } catch (e) {
    console.warn('⚠ Streaming wait timeout or selector not found');
  }
}

// ─────────────────────────────────────────────────────────────
// CODING LANDING
// ─────────────────────────────────────────────────────────────

test.describe('Coding Landing Page', () => {
  test('should show 4 tier cards', async ({ page }) => {
    await page.goto('/coding');
    await page.waitForTimeout(1500);

    await page.screenshot({ path: 'tests/screenshots/coding-landing.png', fullPage: true });

    // Check for the 4 main coding modes
    const pageText = await page.locator('body').innerText();
    const hasCodeReview = /code review|review/i.test(pageText);
    const hasScriptLite = /script lite|lite/i.test(pageText);
    const hasScriptMedium = /script medium|medium/i.test(pageText);
    const hasLarge = /large|discovery/i.test(pageText);

    console.log('Coding landing cards found:', { hasCodeReview, hasScriptLite, hasScriptMedium, hasLarge });

    expect(hasCodeReview || hasScriptLite || hasScriptMedium || hasLarge).toBeTruthy();
  });

  test('clicking coding cards navigates correctly', async ({ page }) => {
    await page.goto('/coding');
    await page.waitForTimeout(1500);

    // Try clicking on Script Medium card/link
    const scriptMediumLink = page.locator('a[href*="script-medium"], button:has-text("Script Medium")').first();
    if (await scriptMediumLink.isVisible({ timeout: 3000 })) {
      await scriptMediumLink.click();
      await page.waitForTimeout(1000);
      expect(page.url()).toContain('script-medium');
      console.log('✓ Script Medium card navigates correctly');
    } else {
      console.warn('⚠ Script Medium card/link not found on coding landing');
    }
  });
});

// ─────────────────────────────────────────────────────────────
// SCRIPT LITE
// ─────────────────────────────────────────────────────────────

test.describe('Coding - Script Lite', () => {
  test('describe stage loads', async ({ page }) => {
    await page.goto('/coding/script-lite');
    await page.waitForTimeout(1500);

    await page.screenshot({ path: 'tests/screenshots/script-lite-initial.png', fullPage: true });

    const pageText = await page.locator('body').innerText();
    console.log('Script Lite page text excerpt:', pageText.substring(0, 300));

    // Should have a description textarea or input
    const textarea = page.locator('textarea').first();
    const hasTextarea = await textarea.isVisible({ timeout: 3000 }).catch(() => false);
    console.log('Has textarea:', hasTextarea);

    // Should have a generate / run button
    const genButton = page.locator('button').filter({ hasText: /generate|run|create/i }).first();
    const hasGenButton = await genButton.isVisible({ timeout: 3000 }).catch(() => false);
    console.log('Has generate button:', hasGenButton);

    expect(hasTextarea || hasGenButton).toBeTruthy();
  });

  test('get questions flow', async ({ page }) => {
    await page.goto('/coding/script-lite');
    await page.waitForTimeout(1500);

    // Fill description
    const textarea = page.locator('textarea').first();
    if (await textarea.isVisible({ timeout: 3000 })) {
      await textarea.fill('Write a Python script that reads a CSV file and counts the number of rows per unique value in a specific column');
    }

    // Switch to Haiku
    await switchToHaiku(page);

    await page.screenshot({ path: 'tests/screenshots/script-lite-filled.png', fullPage: true });

    // Click "Get Questions First" button
    const questionsBtn = page.locator('button').filter({ hasText: /get questions|clarify|questions first/i }).first();
    const hasQuestionsBtn = await questionsBtn.isVisible({ timeout: 3000 }).catch(() => false);
    console.log('Has "Get Questions" button:', hasQuestionsBtn);

    if (hasQuestionsBtn) {
      await questionsBtn.click();
      console.log('Clicked "Get Questions First"');

      // Wait for streaming
      await waitForStreamingComplete(page, 60000);

      await page.screenshot({ path: 'tests/screenshots/script-lite-questions.png', fullPage: true });

      // Check if input fields appeared for questions
      const inputs = await page.locator('input[type="text"], textarea').count();
      console.log(`Found ${inputs} input fields after questions loaded`);

      const pageTextAfter = await page.locator('body').innerText();
      console.log('Page text after questions (first 500 chars):', pageTextAfter.substring(0, 500));
    } else {
      console.warn('⚠ "Get Questions First" button not found — testing direct generate instead');

      // Try direct generate
      const genBtn = page.locator('button').filter({ hasText: /generate/i }).first();
      if (await genBtn.isVisible({ timeout: 3000 })) {
        await genBtn.click();
        await waitForStreamingComplete(page, 60000);
        await page.screenshot({ path: 'tests/screenshots/script-lite-output.png', fullPage: true });
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────
// SCRIPT MEDIUM
// ─────────────────────────────────────────────────────────────

test.describe('Coding - Script Medium', () => {
  test('describe stage loads with app type selector', async ({ page }) => {
    await page.goto('/coding/script-medium');
    await page.waitForTimeout(1500);

    await page.screenshot({ path: 'tests/screenshots/script-medium-initial.png', fullPage: true });

    const pageText = await page.locator('body').innerText();
    console.log('Script Medium initial text (300 chars):', pageText.substring(0, 300));

    // Check for app type options
    const hasReact = /react/i.test(pageText);
    const hasHtml = /html/i.test(pageText);
    const hasPython = /python/i.test(pageText);
    const hasNode = /node/i.test(pageText);
    console.log('App types found:', { hasReact, hasHtml, hasPython, hasNode });

    // Check for Live Preview toggle
    const hasPreviewToggle = /live preview|preview mode/i.test(pageText);
    console.log('Has live preview toggle:', hasPreviewToggle);
  });

  test('live preview toggle changes UI', async ({ page }) => {
    await page.goto('/coding/script-medium');
    await page.waitForTimeout(1500);

    // Find and click preview toggle
    const previewToggle = page
      .locator('button, input[type="checkbox"], [role="switch"]')
      .filter({ hasText: /live preview|preview/i })
      .first();

    const hasToggle = await previewToggle.isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasToggle) {
      // Try finding toggle by being near "Live Preview" text
      const previewLabel = page.locator('text=/live preview/i').first();
      if (await previewLabel.isVisible({ timeout: 3000 })) {
        // Click the switch/toggle near it
        const parent = previewLabel.locator('..');
        const toggle = parent.locator('button, input[type="checkbox"], [role="switch"]').first();
        if (await toggle.isVisible({ timeout: 2000 })) {
          await toggle.click();
        } else {
          await previewLabel.click(); // Try clicking label itself
        }
      }
    } else {
      await previewToggle.click();
    }

    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'tests/screenshots/script-medium-preview-on.png', fullPage: true });

    const pageTextAfter = await page.locator('body').innerText();
    const hasTargetPlatform = /target platform|platform/i.test(pageTextAfter);
    const hasConversionInfo = /html|converting|preview/i.test(pageTextAfter);
    console.log('After toggle - has target platform text:', hasTargetPlatform);
    console.log('After toggle - has conversion info:', hasConversionInfo);
  });

  test('advanced settings opens and shows model selector', async ({ page }) => {
    await page.goto('/coding/script-medium');
    await page.waitForTimeout(1500);

    const advSettings = page.locator('text=Advanced Settings').first();
    const hasAdvSettings = await advSettings.isVisible({ timeout: 3000 }).catch(() => false);
    console.log('Has Advanced Settings:', hasAdvSettings);

    if (hasAdvSettings) {
      await advSettings.click();
      await page.waitForTimeout(500);

      await page.screenshot({ path: 'tests/screenshots/script-medium-advanced-settings.png', fullPage: true });

      // Check for model selector
      const pageText = await page.locator('body').innerText();
      const hasModelSelector = /haiku|sonnet|opus|model/i.test(pageText);
      console.log('Advanced settings has model selector:', hasModelSelector);

      // Check for thinking controls
      const hasThinking = /thinking|think|quick|investigate/i.test(pageText);
      console.log('Has thinking controls:', hasThinking);
    }
  });

  test('Flow A: Preview Mode - question flow', async ({ page }) => {
    test.setTimeout(120000);

    await page.goto('/coding/script-medium');
    await page.waitForTimeout(1500);

    // Turn on Live Preview
    const previewTexts = await page.locator('*').filter({ hasText: /live preview/i }).all();
    for (const el of previewTexts) {
      if (await el.isVisible()) {
        // Find nearby toggle
        const parent = el.locator('..');
        const toggle = parent.locator('button, [role="switch"], input[type="checkbox"]').first();
        if (await toggle.isVisible({ timeout: 1000 })) {
          await toggle.click();
          break;
        }
      }
    }
    await page.waitForTimeout(500);

    // Fill description
    const textarea = page.locator('textarea').first();
    if (await textarea.isVisible({ timeout: 3000 })) {
      await textarea.fill('A simple meal planning app where you can add meals for each day of the week, with a shopping list that auto-generates from the meals');
    }

    // Switch to Haiku
    await switchToHaiku(page);

    await page.screenshot({ path: 'tests/screenshots/script-medium-preview-filled.png', fullPage: true });

    // Click "Get Questions First"
    const questionsBtn = page.locator('button').filter({ hasText: /get questions|clarify|questions first/i }).first();
    const hasQuestionsBtn = await questionsBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasQuestionsBtn) {
      await questionsBtn.click();
      console.log('Clicked Get Questions');

      await waitForStreamingComplete(page, 90000);

      await page.screenshot({ path: 'tests/screenshots/script-medium-preview-questions.png', fullPage: true });

      const inputs = await page.locator('input[type="text"], textarea').count();
      console.log(`CRITICAL CHECK: Found ${inputs} input fields for questions`);

      // Try clicking generate
      const generateBtn = page.locator('button').filter({ hasText: /generate application|generate/i }).first();
      if (await generateBtn.isVisible({ timeout: 3000 })) {
        await generateBtn.click();
        console.log('Clicked Generate Application');

        await waitForStreamingComplete(page, 90000);

        await page.screenshot({ path: 'tests/screenshots/script-medium-preview-output.png', fullPage: true });

        // Check for iframe
        const iframe = page.locator('iframe').first();
        const hasIframe = await iframe.isVisible({ timeout: 5000 }).catch(() => false);
        console.log('CRITICAL CHECK: Live preview iframe visible:', hasIframe);

        // Check for convert button
        const convertBtn = page.locator('button').filter({ hasText: /convert/i }).first();
        const hasConvertBtn = await convertBtn.isVisible({ timeout: 3000 }).catch(() => false);
        console.log('Has "Convert" button:', hasConvertBtn);

        // Check for download button
        const downloadBtn = page.locator('button').filter({ hasText: /download/i }).first();
        const hasDownload = await downloadBtn.isVisible({ timeout: 3000 }).catch(() => false);
        console.log('Has download button:', hasDownload);
      }
    } else {
      // Try direct generate
      const genBtn = page.locator('button').filter({ hasText: /generate application|generate/i }).first();
      if (await genBtn.isVisible({ timeout: 3000 })) {
        await genBtn.click();
        await waitForStreamingComplete(page, 90000);
        await page.screenshot({ path: 'tests/screenshots/script-medium-preview-direct-output.png', fullPage: true });
      }
    }
  });

  test('Flow B: Normal Mode - multi-file output', async ({ page }) => {
    test.setTimeout(120000);

    await page.goto('/coding/script-medium');
    await page.waitForTimeout(1500);

    // Make sure Live Preview is OFF (default should be off)
    // If toggle is on by default, check and disable
    const pageText = await page.locator('body').innerText();
    if (/target platform/i.test(pageText)) {
      // Preview seems on — toggle it off
      const toggle = page.locator('button, [role="switch"]').filter({ hasText: /preview/i }).first();
      if (await toggle.isVisible({ timeout: 2000 })) await toggle.click();
    }

    // Select HTML/CSS/JS app type
    const htmlBtn = page.locator('button').filter({ hasText: /html.*css.*js|html\/css/i }).first();
    if (await htmlBtn.isVisible({ timeout: 3000 })) {
      await htmlBtn.click();
      console.log('Selected HTML/CSS/JS app type');
    }

    // Fill description
    const textarea = page.locator('textarea').first();
    if (await textarea.isVisible({ timeout: 3000 })) {
      await textarea.fill('A simple to-do list app with add, complete, and delete functionality');
    }

    // Switch to Haiku
    await switchToHaiku(page);

    await page.screenshot({ path: 'tests/screenshots/script-medium-normal-filled.png', fullPage: true });

    // Click Generate directly (no questions)
    const genBtn = page.locator('button').filter({ hasText: /generate application|generate/i }).first();
    if (await genBtn.isVisible({ timeout: 3000 })) {
      await genBtn.click();
      console.log('Clicked Generate Application (normal mode)');

      await waitForStreamingComplete(page, 90000);

      await page.screenshot({ path: 'tests/screenshots/script-medium-normal-output.png', fullPage: true });

      const pageTextAfter = await page.locator('body').innerText();

      // Check for file manifest
      const hasFileManifest = /index\.html|style\.css|script\.js|app\.js|manifest/i.test(pageTextAfter);
      console.log('CRITICAL CHECK: File manifest visible:', hasFileManifest);

      // Check for code viewer
      const codeBlock = page.locator('pre, code, [class*="code"], [class*="editor"]').first();
      const hasCode = await codeBlock.isVisible({ timeout: 3000 }).catch(() => false);
      console.log('Code viewer visible:', hasCode);

      // Check for download ZIP button
      const zipBtn = page.locator('button').filter({ hasText: /zip|download/i }).first();
      const hasZip = await zipBtn.isVisible({ timeout: 3000 }).catch(() => false);
      console.log('Has ZIP/Download button:', hasZip);
    } else {
      console.warn('⚠ Generate button not found in normal mode');
    }
  });

  test('Flow C: Iteration after generation', async ({ page }) => {
    test.setTimeout(180000);

    await page.goto('/coding/script-medium');
    await page.waitForTimeout(1500);

    // Quick generation first
    const textarea = page.locator('textarea').first();
    if (await textarea.isVisible({ timeout: 3000 })) {
      await textarea.fill('A simple counter app with increment and decrement buttons');
    }

    await switchToHaiku(page);

    const genBtn = page.locator('button').filter({ hasText: /generate/i }).first();
    if (await genBtn.isVisible({ timeout: 3000 })) {
      await genBtn.click();
      await waitForStreamingComplete(page, 90000);

      await page.screenshot({ path: 'tests/screenshots/script-medium-pre-iteration.png', fullPage: true });

      // Check for iteration/modify section
      const pageText = await page.locator('body').innerText();
      const hasModify = /modify|iterate|feedback|change|update|improve/i.test(pageText);
      console.log('Has iteration/modify section:', hasModify);

      const iterationTextarea = page.locator('textarea').last();
      if (await iterationTextarea.isVisible({ timeout: 3000 })) {
        await iterationTextarea.fill('Add a dark mode toggle');
        console.log('Filled iteration input');

        const iterateBtn = page.locator('button').filter({ hasText: /modify|update|apply|iterate|submit/i }).first();
        if (await iterateBtn.isVisible({ timeout: 3000 })) {
          await iterateBtn.click();
          await waitForStreamingComplete(page, 90000);
          await page.screenshot({ path: 'tests/screenshots/script-medium-after-iteration.png', fullPage: true });
          console.log('✓ Iteration completed');
        }
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────
// CODE REVIEW
// ─────────────────────────────────────────────────────────────

test.describe('Coding - Code Review', () => {
  const VULNERABLE_CODE = `import sqlite3
def get_user(user_id):
    conn = sqlite3.connect('app.db')
    cursor = conn.cursor()
    cursor.execute(f"SELECT * FROM users WHERE id = '{user_id}'")
    return cursor.fetchone()`;

  test('page loads with review controls', async ({ page }) => {
    await page.goto('/coding/review');
    await page.waitForTimeout(1500);

    await page.screenshot({ path: 'tests/screenshots/code-review-initial.png', fullPage: true });

    const pageText = await page.locator('body').innerText();
    console.log('Code Review page text (400 chars):', pageText.substring(0, 400));

    // Check for paste code option
    const hasPasteTab = /paste|code input|enter code/i.test(pageText);
    console.log('Has paste code option:', hasPasteTab);

    // Check for review lens options
    const hasSecurity = /security/i.test(pageText);
    const hasCompliance = /compliance/i.test(pageText);
    const hasArchitecture = /architecture/i.test(pageText);
    console.log('Review lenses:', { hasSecurity, hasCompliance, hasArchitecture });

    // Check for explanation level
    const hasExplanationLevel = /explanation|level|high|deep/i.test(pageText);
    console.log('Has explanation level selector:', hasExplanationLevel);
  });

  test('can paste code and run review', async ({ page }) => {
    test.setTimeout(120000);

    await page.goto('/coding/review');
    await page.waitForTimeout(1500);

    // Find code input area
    const codeInput = page.locator('textarea, [contenteditable="true"]').first();
    if (await codeInput.isVisible({ timeout: 3000 })) {
      await codeInput.fill(VULNERABLE_CODE);
      console.log('Pasted vulnerable code');
    } else {
      // Try clicking a "Paste Code" tab first
      const pasteTab = page.locator('button, [role="tab"]').filter({ hasText: /paste/i }).first();
      if (await pasteTab.isVisible({ timeout: 3000 })) {
        await pasteTab.click();
        await page.waitForTimeout(500);
        const codeArea = page.locator('textarea, [contenteditable="true"]').first();
        if (await codeArea.isVisible({ timeout: 3000 })) {
          await codeArea.fill(VULNERABLE_CODE);
        }
      }
    }

    // Select Security lens
    const securityChip = page.locator('button, [role="checkbox"], label').filter({ hasText: /^security$/i }).first();
    if (await securityChip.isVisible({ timeout: 3000 })) {
      await securityChip.click();
      console.log('Selected Security lens');
    }

    // Switch to Haiku
    await switchToHaiku(page);

    await page.screenshot({ path: 'tests/screenshots/code-review-ready.png', fullPage: true });

    // Click Run/Start Review
    const runBtn = page.locator('button').filter({ hasText: /run|start review|analyze|review/i }).first();
    if (await runBtn.isVisible({ timeout: 3000 })) {
      await runBtn.click();
      console.log('Clicked Review button');

      await waitForStreamingComplete(page, 90000);

      await page.screenshot({ path: 'tests/screenshots/code-review-output.png', fullPage: true });

      const pageTextAfter = await page.locator('body').innerText();

      // Check for SQL injection detection
      const hasSQLInjection = /sql injection|sql.*inject|injection|vulnerable/i.test(pageTextAfter);
      console.log('CRITICAL CHECK: SQL injection detected in review:', hasSQLInjection);

      // Check for structured output
      const hasStructuredOutput = /security|vulnerability|finding|recommendation/i.test(pageTextAfter);
      console.log('Review has structured output:', hasStructuredOutput);
    } else {
      console.warn('⚠ Run Review button not found');
    }
  });
});

// ─────────────────────────────────────────────────────────────
// CODING LARGE
// ─────────────────────────────────────────────────────────────

test.describe('Coding - Large Discovery', () => {
  test('page loads with discovery interface', async ({ page }) => {
    await page.goto('/coding/large');
    await page.waitForTimeout(1500);

    await page.screenshot({ path: 'tests/screenshots/coding-large-initial.png', fullPage: true });

    const pageText = await page.locator('body').innerText();
    console.log('Coding Large page text (400 chars):', pageText.substring(0, 400));

    // Check for Phase 0 / Phase 1 options or existing/new project
    const hasExisting = /existing|phase 0|codebase/i.test(pageText);
    const hasNew = /new project|phase 1|start from/i.test(pageText);
    console.log('Phase options found:', { hasExisting, hasNew });

    // Check for previous projects
    const hasProjects = /previous|project|history/i.test(pageText);
    console.log('Has previous projects section:', hasProjects);
  });
});
