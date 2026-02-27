# GUI Testing Briefing — ANTON / openEXPERT

> **For:** A Claude Code session (Sonnet 4.6) tasked with exploratory GUI testing
> **App URL:** http://localhost:5173 (Vite dev) or http://localhost:3001 (production build)
> **Date:** 2026-02-23

---

## YOUR ROLE

You are a **QA tester** for ANTON (openEXPERT), an AI-powered compliance workbench. Your job is to:

1. Navigate every major page and feature in the GUI using Playwright
2. Take screenshots of what you see
3. Report what works, what's broken, and what looks wrong
4. Write your findings as a structured test report

**You are NOT writing production code. You are ONLY testing and reporting.**

---

## TECH SETUP

The project uses **Playwright** (already installed). Chromium browser is installed.

```bash
# Project root
cd C:/FCP_Workbench

# The app should already be running. Verify:
curl -s http://localhost:3001 | head -20

# If NOT running, start it:
pnpm run dev
# This starts: Vite on :5173, Express API on :3001
# The Playwright config uses baseURL: http://localhost:3001

# Run a quick existing test to confirm setup works:
npx playwright test tests/dashboard.spec.ts --headed
```

### Playwright Config

- Config file: `playwright.config.ts`
- Test dir: `./tests/`
- Base URL: `http://localhost:3001`
- Browser: Chromium
- Screenshots: on failure
- Timeout: 60s per test

### Writing & Running Tests

```bash
# Write test files as: tests/[name].spec.ts
# Run all specs:
npx playwright test

# Run a single file:
npx playwright test tests/coding-gui.spec.ts

# Run with visible browser (useful for debugging):
npx playwright test tests/coding-gui.spec.ts --headed

# View HTML report after run:
npx playwright show-report
```

### Screenshot Strategy

Take screenshots liberally. Save them to `tests/screenshots/` so we can review:

```typescript
await page.screenshot({ path: 'tests/screenshots/descriptive-name.png', fullPage: true });
```

---

## TOKEN SAVING: USE HAIKU FOR IN-APP AI CALLS

When you need to test features that call Claude (like generating scripts, getting clarifying questions, code reviews), the app has a **Model Selector** in the UI. Before triggering any AI generation:

1. Look for the "Advanced Settings" accordion or Model Selector dropdown
2. Switch the model to **Haiku** (`claude-haiku-4-5-20251001`)
3. This saves tokens — we're testing the GUI flow, not output quality

If there's no model selector visible on a page, check "Advanced Settings" — it's usually collapsed.

Alternatively, you can make direct API calls with the haiku model:

```bash
curl -X POST http://localhost:3001/api/claude/message \
  -H "Content-Type: application/json" \
  -d '{"message":"test","model":"claude-haiku-4-5-20251001","thinking":"quick"}'
```

---

## WHAT TO TEST — COMPLETE CHECKLIST

### 1. NAVIGATION & LAYOUT (Priority: HIGH)

Test that every page loads without errors.

**Sidebar Navigation:**
- [ ] Sidebar is visible and has navigation links
- [ ] Sidebar can collapse/expand (if applicable)
- [ ] Clicking each nav item navigates to the correct page
- [ ] Active state highlights correctly

**All Routes to Visit:**

```
/                    → Dashboard (main landing)
/brief               → Brief Me
/guide               → Guide Me
/fill                → Fill Form
/challenge           → Challenge This
/dual                → Dual Interpretation
/batch               → Batch Create
/prompt              → Open Chat
/workflows           → Workflows
/workflows/builder   → Workflow Builder
/datasets            → Datasets
/projects            → Projects
/build-module        → Build Your Own Module
/skills              → Skills Library
/audit               → Audit Log
/exchange            → Exchange
/analytics           → Analytics
/insights            → Data Insights
/review              → Review Engine
/sounding-board      → Sounding Board
/ab-test             → A/B Test
/knowledge           → Knowledge
/deadlines           → Deadlines
/radar               → Radar
/coworkers           → Coworker Gallery
/versions            → Version History
/quality             → Quality
/apprentice          → Apprentice
/graph               → Knowledge Graph
/intelligence        → Intelligence Dashboard
/patterns            → Pattern Detection
/compliance          → Compliance
/knowledge-base      → Knowledge Base
/my-work             → My Work / Continue
/discover            → Discover
/coding              → Coding Landing
/coding/review       → Code Review & Explain
/coding/script-lite  → Script Lite
/coding/script-medium→ Script Medium
/coding/large        → Coding Large Discovery
/settings            → Settings
```

**For each page, check:**
- Does it load without console errors?
- Is there a visible heading or title?
- Does the layout look reasonable (not blank, not broken)?
- Take a screenshot

---

### 2. CODING AREA — LANDING PAGE (Priority: HIGH)

**URL:** `/coding`

- [ ] Page loads with 4 tier cards visible
- [ ] Cards show: Code Review, Script Lite, Script Medium, Coding Large
- [ ] Each card is clickable and navigates to correct sub-page
- [ ] Breadcrumb shows "Coding"
- [ ] Take screenshot of landing page

---

### 3. CODING — SCRIPT LITE (Priority: HIGH)

**URL:** `/coding/script-lite`

**Stage 1: Describe**
- [ ] Page loads with description textarea
- [ ] "Data Sample" textarea exists
- [ ] "Get Questions First" button exists
- [ ] "Generate Script" button exists
- [ ] ThinkingControls visible (or in Advanced Settings)
- [ ] Screenshot: describe stage

**Stage 2: Clarify (Question Flow)**
- [ ] Enter a simple description: "Write a Python script that reads a CSV file and counts the number of rows per unique value in a specific column"
- [ ] Switch model to Haiku in Advanced Settings
- [ ] Click "Get Questions First"
- [ ] Wait for streaming to complete
- [ ] **CRITICAL TEST:** Do clarifying questions appear as input fields?
- [ ] Can you type answers into the question fields?
- [ ] "Generate Script" button appears after questions load
- [ ] Screenshot: clarify stage with questions visible

**Stage 3: Output**
- [ ] After answering questions (or direct generate), script output streams
- [ ] Code viewer shows syntax-highlighted Python
- [ ] Copy button works
- [ ] Download .py button works
- [ ] Export bar is visible
- [ ] Screenshot: output stage

---

### 4. CODING — SCRIPT MEDIUM (Priority: CRITICAL)

**URL:** `/coding/script-medium`

**Stage 1: Describe**
- [ ] App Type selector shows 4 options: React SPA, HTML/CSS/JS, Python CLI, Node.js API
- [ ] Clicking app types highlights them
- [ ] Live Preview toggle exists and is clickable
- [ ] **When Live Preview is ON:** App type label changes to "Target Platform" with explanation text
- [ ] **When Live Preview is ON:** Info box mentions converting to target platform
- [ ] Description textarea works
- [ ] Constraints textarea works
- [ ] Advanced Settings expands with ThinkingControls + ModelSelector
- [ ] Screenshot: describe stage with preview OFF
- [ ] Screenshot: describe stage with preview ON

**Test Flow A: Preview Mode (HTML)**
- [ ] Toggle Live Preview ON
- [ ] Select a target platform (e.g., React SPA)
- [ ] Enter description: "A simple meal planning app where you can add meals for each day of the week, with a shopping list that auto-generates from the meals"
- [ ] Switch model to Haiku in Advanced Settings
- [ ] Click "Get Questions First"
- [ ] **CRITICAL:** Do questions render as fillable input fields?
- [ ] Answer a few questions, click "Generate Application"
- [ ] Wait for streaming to complete
- [ ] **CRITICAL:** Does the Live Preview iframe show the rendered app?
- [ ] Can you interact with the preview (click buttons, type in fields)?
- [ ] "Convert to React SPA" button appears
- [ ] "Download Preview HTML" button works
- [ ] Screenshot: preview mode with working iframe
- [ ] Screenshot: convert button area

**Test Flow B: Normal Mode (Multi-file)**
- [ ] Toggle Live Preview OFF
- [ ] Select HTML/CSS/JS as app type
- [ ] Enter description: "A simple to-do list app with add, complete, and delete functionality"
- [ ] Click "Generate Application" directly (skip questions)
- [ ] Wait for streaming to complete
- [ ] File manifest (left panel) shows generated files
- [ ] Code viewer (center) shows file contents
- [ ] Architecture notes (right panel) shows explanation
- [ ] Clicking files in manifest switches the code viewer
- [ ] Download ZIP button works
- [ ] Copy All button works
- [ ] Screenshot: multi-file output view

**Test Flow C: Iteration**
- [ ] After generation completes, "Modify" / iterate section appears
- [ ] Type feedback: "Add a dark mode toggle"
- [ ] Submit iteration
- [ ] New output streams with modifications
- [ ] Screenshot: iteration flow

---

### 5. CODING — CODE REVIEW (Priority: HIGH)

**URL:** `/coding/review`

- [ ] Page loads with setup view
- [ ] Input method tabs visible (Paste Code / Select Folder / etc.)
- [ ] Explanation level cards visible (High/Medium/Deep)
- [ ] Review lens chips visible (Security, Compliance, Architecture, etc.)
- [ ] Paste a simple code snippet:

```python
import sqlite3
def get_user(user_id):
    conn = sqlite3.connect('app.db')
    cursor = conn.cursor()
    cursor.execute(f"SELECT * FROM users WHERE id = '{user_id}'")
    return cursor.fetchone()
```

- [ ] Select "Security" and "Developer" lenses
- [ ] Switch model to Haiku
- [ ] Click Run/Start Review
- [ ] Output streams with structured review sections
- [ ] **Check:** Does it catch the SQL injection vulnerability?
- [ ] Screenshot: review output

---

### 6. CODING — LARGE (Priority: MEDIUM)

**URL:** `/coding/large`

- [ ] Page loads with discovery interface
- [ ] Phase 0 (existing codebase) and Phase 1 (new project) options visible
- [ ] Previous projects list section exists
- [ ] Screenshot: coding large landing

---

### 7. DASHBOARD (Priority: HIGH)

**URL:** `/`

- [ ] Main dashboard loads with stats
- [ ] Module cards or quick-access tiles visible
- [ ] Recent sessions / "Continue My Work" section visible
- [ ] Stats cards show (sessions, tokens, etc.)
- [ ] Screenshot: dashboard

---

### 8. CORE FEATURES — BRIEF ME (Priority: MEDIUM)

**URL:** `/brief`

- [ ] Page loads with module selector or description input
- [ ] Knowledge Source Panel visible (Claude Knowledge, Online, Local Folders, Combined)
- [ ] Output Format selector visible (chips)
- [ ] ThinkingControls visible
- [ ] Screenshot: brief me page

---

### 9. CORE FEATURES — GUIDE ME (Priority: MEDIUM)

**URL:** `/guide`

- [ ] Page loads with guided flow
- [ ] Step indicators visible
- [ ] Screenshot: guide me page

---

### 10. SETTINGS (Priority: LOW)

**URL:** `/settings`

- [ ] Page loads
- [ ] API key field visible (masked)
- [ ] Model default selector visible
- [ ] Language selector visible
- [ ] Screenshot: settings page

---

### 11. MY WORK / CONTINUE (Priority: HIGH)

**URL:** `/my-work`

- [ ] Page loads with list of previous sessions
- [ ] If coding sessions exist from earlier tests, they should appear
- [ ] Clicking a coding session should redirect to the correct coding page (not "module not found")
- [ ] Screenshot: my work page

---

### 12. CROSS-CUTTING CHECKS

- [ ] **Console Errors:** On every page, check `page.on('console')` for errors
- [ ] **Responsive:** Test at 1280px and 768px widths — does the layout break?
- [ ] **Dark Theme:** Verify all pages use dark background (adv-dark: #0B1426)
- [ ] **No Blank Pages:** Every route should render meaningful content, never just white/empty

---

## HOW TO WRITE YOUR TESTS

Create test files in `tests/`. Follow this pattern:

```typescript
import { test, expect } from '@playwright/test';
import { mkdirSync } from 'fs';

// Ensure screenshot directory exists
mkdirSync('tests/screenshots', { recursive: true });

test.describe('Coding - Script Medium', () => {
  test('should load describe stage', async ({ page }) => {
    await page.goto('/coding/script-medium');

    // Check page loaded
    await expect(page.locator('h1')).toContainText('Script Medium');

    // Check app type selector has 4 options
    const appTypeButtons = page.locator('button:has-text("React SPA"), button:has-text("HTML/CSS/JS"), button:has-text("Python CLI"), button:has-text("Node.js API")');
    await expect(appTypeButtons).toHaveCount(4);

    // Check preview toggle exists
    await expect(page.locator('text=Live Preview Mode')).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/script-medium-describe.png', fullPage: true });
  });

  test('preview toggle switches to HTML mode', async ({ page }) => {
    await page.goto('/coding/script-medium');

    // Click preview toggle
    await page.locator('text=Live Preview Mode').locator('..').locator('button').click();

    // Should show "Target Platform" label
    await expect(page.locator('text=Target Platform')).toBeVisible();

    // Should show conversion info
    await expect(page.locator('text=Preview will be generated as HTML')).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/script-medium-preview-on.png', fullPage: true });
  });

  test('question flow works for Script Medium', async ({ page }) => {
    await page.goto('/coding/script-medium');

    // Fill description
    await page.locator('textarea').first().fill('A simple counter app with increment and decrement buttons');

    // Open advanced settings and switch to Haiku
    await page.locator('text=Advanced Settings').click();
    // ... find and switch model selector to haiku ...

    // Click "Get Questions First"
    await page.locator('button:has-text("Get Questions First")').click();

    // Wait for questions to appear (streaming completes)
    await page.waitForTimeout(15000); // Allow time for AI response

    // Check that input fields appeared for questions
    const questionInputs = page.locator('textarea, input[type="text"]');
    const count = await questionInputs.count();

    await page.screenshot({ path: 'tests/screenshots/script-medium-questions.png', fullPage: true });

    // Report findings
    console.log(`Found ${count} question input fields`);
  });
});
```

### Important Playwright Patterns

```typescript
// Wait for streaming to complete (watch for the stop button to disappear)
await page.waitForSelector('button:has-text("Processing")', { state: 'hidden', timeout: 60000 });

// Or wait for the generate/action button to reappear
await page.waitForSelector('button:has-text("Generate")', { timeout: 60000 });

// Check console errors on a page
const errors: string[] = [];
page.on('console', msg => {
  if (msg.type() === 'error') errors.push(msg.text());
});
await page.goto('/some-page');
await page.waitForTimeout(2000);
console.log('Console errors:', errors);

// Switch to Haiku model (look for model selector)
// The model selector might be a dropdown or radio buttons in Advanced Settings
await page.locator('text=Advanced Settings').click();
// Look for model options — may be buttons, dropdowns, or radio inputs
const haikuOption = page.locator('text=Haiku').or(page.locator('[value*="haiku"]'));
if (await haikuOption.isVisible()) await haikuOption.click();

// Take full-page screenshot with descriptive name
await page.screenshot({
  path: `tests/screenshots/${testName}.png`,
  fullPage: true
});
```

---

## TEST EXECUTION PLAN

Run tests in this order:

### Round 1: Smoke Test (all pages load)
```bash
npx playwright test tests/coding-smoke.spec.ts
```
Write a spec that visits every route and checks it loads. Report any that fail.

### Round 2: Coding Area Deep Test
```bash
npx playwright test tests/coding-deep.spec.ts
```
Test the full flows for Script Lite, Script Medium (both preview and normal mode), and Code Review.

### Round 3: Cross-Page Features
```bash
npx playwright test tests/features.spec.ts
```
Test My Work page, session resume, navigation between pages.

---

## OUTPUT FORMAT — YOUR REPORT

After testing, produce a report in this format:

```markdown
# GUI Test Report — ANTON / openEXPERT
**Date:** [date]
**Tester:** Claude Sonnet 4.6 (automated Playwright)
**App Version:** localhost

## Summary
- Total pages tested: X
- Passed: X
- Issues found: X
- Critical: X | Medium: X | Low: X

## Critical Issues
1. **[Page/Feature]** — Description of what's broken
   - Steps to reproduce
   - Screenshot: [path]

## Medium Issues
1. **[Page/Feature]** — Description
   - Screenshot: [path]

## Low Issues / UI Polish
1. **[Page/Feature]** — Description

## Working Features (Confirmed)
- [List of everything that works correctly]

## Screenshots Index
- tests/screenshots/dashboard.png
- tests/screenshots/coding-landing.png
- ...
```

Save the report as `tests/GUI_TEST_REPORT.md`.

---

## IMPORTANT REMINDERS

1. **Use Haiku for all AI calls** — switch the model before triggering any generation
2. **Take screenshots of EVERYTHING** — save to `tests/screenshots/`
3. **Don't fix bugs** — just document them clearly with steps to reproduce
4. **Test the actual user flows** — don't just check if pages load, actually click buttons, fill forms, trigger actions
5. **The app runs on localhost:3001** (Express serves both API and static). Vite dev may be on :5173 with proxy to :3001
6. **If the server isn't running**, start it with `pnpm run dev` and wait for it to be ready
7. **Timeout patience** — AI-powered features (clarify, generate) may take 10-30s to stream. Set adequate timeouts.
8. **The question parser was recently fixed** — `**1. Bold question**` format should now work. Verify this!
9. **The preview iframe was recently fixed** — HTML/CSS/JS inlining should work. Verify this!
