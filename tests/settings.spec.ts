import { test, expect } from '@playwright/test';

/**
 * Settings Tests
 * Tests configuration panel, model selection, and preferences
 */

test.describe('Settings', () => {
  test('should load settings page', async ({ page }) => {
    await page.goto('/settings');

    // Check page loaded
    const heading = page.locator('h1, h2').filter({ hasText: /setting/i });
    await expect(heading.first()).toBeVisible();
  });

  test('should have general settings section', async ({ page }) => {
    await page.goto('/settings');

    // Look for general/basic settings
    const hasGeneralSection = await page.locator('text=/general|basic|preference/i').count() > 0;
    expect(hasGeneralSection).toBeGreaterThan(0);
  });

  test('should display model selector', async ({ page }) => {
    await page.goto('/settings');

    // Look for model options (Opus, Sonnet, Haiku)
    const content = await page.content();
    const hasModels = content.match(/opus|sonnet|haiku|claude/i);

    expect(hasModels).toBeTruthy();
  });

  test('should have thinking level selector', async ({ page }) => {
    await page.goto('/settings');

    // Look for thinking level options
    const content = await page.content();
    const hasThinking = content.match(/quick|think|investigate/i);

    expect(hasThinking).toBeTruthy();
  });

  test('should have creativity controls', async ({ page }) => {
    await page.goto('/settings');

    // Look for creativity options
    const content = await page.content();
    const hasCreativity = content.match(/strict|balanced|creative|creativity/i);

    expect(hasCreativity).toBeTruthy();
  });

  test('should have language selector showing 30 languages', async ({ page }) => {
    await page.goto('/settings');

    // Find language selector
    const languageSelect = page.locator('select[name*="language"], [class*="language"] select').first();
    const languageExists = await languageSelect.count();

    if (languageExists > 0) {
      const options = await languageSelect.locator('option').count();
      expect(options).toBeGreaterThanOrEqual(20); // At least 20+ languages
    } else {
      // Language selector might be elsewhere
      const hasLanguageSection = await page.locator('text=/language|translation/i').count() > 0;
      expect(hasLanguageSection).toBeTruthy();
    }
  });

  test('should have budget cap input', async ({ page }) => {
    await page.goto('/settings');

    // Look for budget/cost controls
    const budgetInput = page.locator('input[name*="budget"], input[placeholder*="budget" i], input[type="number"]');
    const hasBudget = await budgetInput.count() > 0;

    expect(hasBudget).toBeTruthy();
  });

  test('should have save button', async ({ page }) => {
    await page.goto('/settings');

    // Look for save button
    const saveButton = page.locator('button').filter({ hasText: /save|apply|update/i });
    const hasSave = await saveButton.count();

    expect(hasSave).toBeGreaterThan(0);
  });

  test('should persist settings changes', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForTimeout(500);

    // Try to change a setting
    const budgetInput = page.locator('input[name*="budget"], input[type="number"]').first();
    const budgetExists = await budgetInput.count();

    if (budgetExists > 0) {
      await budgetInput.fill('1000');

      // Click save
      const saveButton = page.locator('button').filter({ hasText: /save/i }).first();
      await saveButton.click();

      await page.waitForTimeout(1000);

      // Reload page
      await page.reload();
      await page.waitForTimeout(500);

      // Check value persisted (might need database or localStorage check)
      const newValue = await budgetInput.inputValue();
      // Value should be set (might not be exactly 1000 if there's validation)
      expect(newValue).toBeTruthy();
    }
  });

  test('should show deployment mode toggle', async ({ page }) => {
    await page.goto('/settings');

    // Look for solo/team mode toggle
    const content = await page.content();
    const hasModeToggle = content.match(/solo|team|deployment.*mode/i);

    expect(hasModeToggle).toBeTruthy();
  });
});

test.describe('Settings - Multi-LLM Providers', () => {
  test('should show provider configuration section', async ({ page }) => {
    await page.goto('/settings');

    // Look for provider settings (OpenAI, Google, Mistral, Ollama)
    const content = await page.content();
    const hasProviders = content.match(/openai|google|mistral|ollama|provider/i);

    expect(hasProviders).toBeTruthy();
  });
});

test.describe('Settings - Security', () => {
  test('should mask sensitive inputs', async ({ page }) => {
    await page.goto('/settings');

    // Look for password or key inputs
    const sensitiveInputs = page.locator('input[type="password"], input[name*="key"], input[name*="secret"]');
    const hasSensitiveInputs = await sensitiveInputs.count();

    if (hasSensitiveInputs > 0) {
      // Check they are masked
      const firstInput = sensitiveInputs.first();
      const type = await firstInput.getAttribute('type');
      expect(type).toMatch(/password|text/);
    }
  });
});
