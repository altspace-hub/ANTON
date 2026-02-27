# GUI Test Report — ANTON / openEXPERT

**Date:** 2026-02-23
**Tester:** Claude Sonnet 4.6 (automated Playwright)
**App Version:** v0.2.0 · localhost:3001
**Test Files:** `coding-smoke.spec.ts`, `coding-deep.spec.ts`, `features.spec.ts`, `app-gated.spec.ts`

---

## Summary

| Metric | Count |
|---|---|
| Total tests run | 110 |
| Passed | 110 |
| Real bugs confirmed | 1 critical, 2 medium |
| Routes tested | 41 / 41 |
| Screenshots captured | 75+ |

> **Key setup finding:** All routes show an "Enter Anton" splash gate before the app renders. Tests must click the button before interacting with any page content. Direct URL navigation also triggers the splash — deep links work but always via the gate.
>
> **Key tooling lesson:** Screenshots must be taken *after* `waitForLoadState('networkidle')` + waiting for a visible heading. Fixed-timeout waits produced blank/partial screens on data-fetching pages like Audit Log.

---

## Critical Issues

### 1. Script Medium — "Get Questions First" shows questions but provides no way to answer them

**Severity:** CRITICAL
**URL:** `/coding/script-medium`

When "Get Questions First" is clicked in Script Medium, the AI generates well-structured clarifying questions (5 numbered sections with sub-bullet options). These display correctly as formatted text. However:

- There is **no "Your Answers" input section** below the questions — users have no way to type answers before generating
- The system incorrectly shows an orange banner: **"No specific questions were generated. You can proceed directly to application generation."** — this is plainly wrong; 5 question sections are visible above it
- The "0% incomplete" completion badge exists but tracks nothing (no inputs to fill)
- Users can only click "Back" or "Generate Application" — skipping the entire clarification step

**Compare with Script Lite** which correctly shows a "Your Answers" section below the questions with one input field per question, allowing users to type answers before generating. Script Lite's question flow works as designed. Script Medium's does not.

**Steps to reproduce:**
1. Go to `/coding/script-medium` (past splash gate)
2. Type: "A simple counter app with increment and decrement buttons"
3. Click "Get Questions First"
4. Observe: questions appear in numbered sections, but no answer input fields exist

**Screenshot:** `tests/screenshots/gated-script-medium-questions.png`

---

## Medium Issues

### 2. Model selector panel stays open after model switch in Script Medium

**Severity:** MEDIUM
**URL:** `/coding/script-medium` → Advanced Settings

After opening "Advanced Settings" and selecting a model (e.g. Haiku), the model selector panel does **not automatically close**. It remains open overlaying the main content area. Users must manually dismiss it by pressing Escape or clicking elsewhere before they can interact with the page. This caused all initial automation screenshots of Script Medium output to capture the model list instead of the generated code.

**Steps to reproduce:**
1. Go to Script Medium
2. Open "Advanced Settings"
3. Click any model option (e.g. Claude Haiku 4.5)
4. Observe: the model panel stays open, covering most of the screen

**Screenshot:** Previous run's `gated-script-medium-output.png` (before fix) showed the model list instead of generated files.

---

### 3. CSP error blocks Google Fonts on every page

**Severity:** MEDIUM
**Affects:** All 41 routes

Every page produces a browser console error on load:
```
Loading the stylesheet 'https://fonts.googleapis.com/...' violates CSP:
"style-src 'self' 'unsafe-inline'" — the action has been blocked.
```
The app falls back to system fonts instead of Inter/Montserrat. Visually the app still renders but not with the intended typography. Affects professional appearance.

**Fix:** Add `https://fonts.googleapis.com` and `https://fonts.gstatic.com` to the `style-src` and `font-src` CSP directives in the server's Content-Security-Policy header.

---

## Low Issues / UI Polish

### 4. Settings not in sidebar — only accessible via header gear icon

**Severity:** LOW

The sidebar (63 links!) does not contain a "Settings" entry. The only way to reach `/settings` is via the ⚙ gear icon in the top-right header. Some users may not find it.

### 5. Splash gate resets on direct URL navigation

**Severity:** LOW

Navigating directly to any bookmarked URL (e.g. `/coding/script-medium`) shows the "Enter Anton" splash every time rather than remembering the session. Once inside, SPA navigation works fine without re-triggering the splash.

---

## Retracted Issues (Were Timing Bugs, Not App Bugs)

### ~~Audit Log page blank~~ — RETRACTED

The initial test run captured a completely black screenshot for `/audit`. This was a **timing bug in the test** — the screenshot was taken before the data-fetch API call completed. After adding `waitForLoadState('networkidle')`, the page renders correctly with a full compliance log table.

**What Audit Log actually shows (confirmed via user screenshot + re-test):**
- Stats: Calls Today, Cost This Month ($6.98), Total Calls (28)
- Filter bar: Start Date, End Date, Module (free text), Status (All/Draft/Reviewed)
- Full table: Timestamp, Module, Model, Tokens (IN/OUT), Cost, Status, Actions (Mark Reviewed / Approve)
- All historical sessions visible with correct data

**Screenshot:** `tests/screenshots/gated-audit-log.png` (corrected, now shows full page)

---

## Working Features — Confirmed ✓

### Splash Gate
- ✅ "Enter Anton" splash renders on all routes with robot photo, teal CTA, "Running in solo mode"
- ✅ Clicking "Enter Anton" correctly bypasses gate and loads the real app
- ✅ Splash does not re-appear during SPA navigation within the app

### Dashboard
- ✅ Dark theme confirmed on all surfaces: body `oklch(0.15 0.02 250)`, sidebar `oklch(0.18 0.02 250)`
- ✅ Stats cards: Sessions, AI Responses, Output Tokens, This Week, This Month
- ✅ ROI widget: estimated hours saved, value in €, API cost, ROI ratio
- ✅ "Continue Your Work" — recent session cards with title, module, tokens, time ago
- ✅ "Today's Brief" with urgent item indicators
- ✅ "Regulatory Radar" with live compliance news items

### Navigation
- ✅ Sidebar (`<aside>`) with **63 navigation links**, FAVORITES section, active state highlighting
- ✅ All **41 routes** return HTTP 200 with non-blank content
- ✅ Sidebar links navigate correctly (Projects → `/projects`, Audit Log → `/audit`, etc.)
- ✅ Responsive at 1280px and 768px — content visible at both breakpoints
- ✅ Breadcrumbs visible (e.g. `>_ Coding › Script Medium`)
- ✅ Sidebar collapse/expand toggle (← chevron)

### Audit Log (`/audit`) ✓
- ✅ Stats: Calls Today, Cost This Month, Total Calls
- ✅ Filters: date range, module name, status dropdown
- ✅ Full audit table with timestamp, module, model, token counts (IN/OUT), cost, status, Mark Reviewed / Approve actions

### Coding Landing (`/coding`)
- ✅ 4 tier cards with correct labels and feature tags:
  - **Tier 1 — Code Review & Explain** (Multi-lens review, Security analysis, Dependency audit, Diff comparison)
  - **Tier 2 — Script Lite** (Python scripts, Guided questions, Sandbox preview, Copy & download)
  - **Tier 3 — Script Medium** (Multi-file apps, Live preview, React/HTML/Python/Node, Iterative refinement)
  - **Tier 4 — Coding Large** (7-phase lifecycle, Expert panels, Release planning, Cost tracking)
- ✅ "Get started →" links on all 4 cards navigate to correct sub-pages

### Script Medium (`/coding/script-medium`)
- ✅ 3-step flow indicator: **1. Describe** → 2. Clarify → 3. Output
- ✅ 4 app type cards: React SPA, HTML/CSS/JS, Python CLI, Node.js API (all selectable)
- ✅ "Live Preview Mode" toggle — clicking it shows "Target Platform" label ✓
- ✅ Description textarea + optional Constraints textarea
- ✅ "Advanced Settings" accordion expands revealing:
  - Thinking Depth: Quick / Think / **Think Hard** (default) / Investigate / Plan First
  - Model selector defaulting to Claude Opus 4.6 (Recommended)
- ✅ "Generate Application" + "Get Questions First" buttons both present and functional
- ✅ **Generation output (3-panel layout):**
  - Left: **Files (12)** — file manifest (package.json, index.html, vite.config.js, src/, README.md, etc.) with "Modified" badges
  - Centre: **Code viewer** — syntax-highlighted code, language label, Copy button
  - Right: **Architecture Notes** — app description, project structure tree, build instructions, Conversation thread
- ❌ "Get Questions First" clarify stage — no answer inputs (Critical Issue #1)

### Script Lite (`/coding/script-lite`)
- ✅ Description textarea visible
- ✅ "Get Questions First" button present
- ✅ Questions render as formatted text AND the **"Your Answers"** section appears below with one input per question
- ✅ "0% incomplete" badge correctly tracks answer completion
- ✅ 5 inputs found after question generation (description + 4 answer fields)

### Code Review & Explain (`/coding/review`)
- ✅ Input tabs: **Paste Code** (active), Local Folder, Repository
- ✅ Code textarea with placeholder
- ✅ Review Lenses panel: Developer Quality (default), Security, Compliance, Product, Architecture, Dependency Audit
- ✅ Depth selector: Overview / **Standard** (default) / Deep Dive
- ✅ **SQL injection vulnerability in vulnerable Python code was detected** — the security review correctly identified the flaw
- ✅ Structured review output with findings

### Model Selector (accessible from Advanced Settings on all coding pages)
- ✅ Claude Opus 4.6 (Recommended, $15/M·$75/M output)
- ✅ Claude Sonnet 4.6 (Recommended, $3/M·$15/M)
- ✅ Claude Sonnet 4.5 Legacy
- ✅ Claude Haiku 4.5 ($1/M·$5/M) — successfully switched during all AI generation tests
- ✅ GPT-4o, GPT-4o Mini, Gemini 2.0 Flash
- ✅ Mistral Large, Mistral 7B (Local/Ollama), Mistral 16B (Local/Ollama)
- ✅ Llama 3.3 70B (Local/Ollama), Qwen 2.5 32B (Local/Ollama)

### My Work (`/my-work`)
- ✅ "Pick up where you left off" with search bar
- ✅ Filters: All Modules, All/Today/This Week/This Month, Most Recent sort
- ✅ Session cards show title, module (script-lite / script-medium), tokens, cost, message preview
- ✅ Session links are valid (no "module-not-found" or "undefined" in hrefs)

### Settings (`/settings`)
- ✅ 4 tabs: My Profile, General, Navigation, Connections
- ✅ My Profile: Name, Role/Title, Organisation, Industry, Jurisdiction, Experience Level (Junior/Mid/Senior/Expert), Hourly Rate
- ✅ Model and Language selectors available
- ✅ "API Connected" indicator in header when key is configured

### Brief Me (`/brief`)
- ✅ Chat-style interface: "What do you need help with?"
- ✅ Pre-made compliance question chips (AMLR, risk appetite, Solvency II, DORA, GDPR, beneficial ownership fraud)
- ✅ Plain text input with "Ask Anton" button
- ✅ Knowledge source references detected in page content

---

## Screenshots Index

### Splash & Dashboard
| File | Description |
|---|---|
| `splash-gate.png` | "Enter Anton" splash landing screen |
| `post-enter-dashboard.png` | Dashboard immediately after clicking Enter |
| `dashboard-post-gate.png` | Dashboard with stats, ROI, sidebar |

### Coding Area
| File | Description |
|---|---|
| `gated-coding-landing-full.png` | 4 tier cards with feature tags |
| `gated-script-medium-initial.png` | Script Medium Describe stage (4 app types, textarea, preview toggle) |
| `gated-script-medium-advanced.png` | Advanced Settings expanded (Thinking Depth + Model) |
| `gated-script-medium-preview-toggle.png` | After toggling Live Preview (Target Platform label appears) |
| `gated-script-medium-questions.png` | ⚠ Script Medium clarify stage — questions displayed, no answer inputs, incorrect banner |
| `gated-script-medium-output.png` | ✅ Script Medium 3-panel output — 12 files, code viewer, architecture notes |
| `gated-script-lite-initial.png` | Script Lite describe stage |
| `gated-script-lite-questions.png` | ✅ Script Lite clarify — questions + "Your Answers" input section working |
| `gated-code-review-initial.png` | Code Review — paste tab, lenses panel, depth selector |
| `gated-code-review-ready.png` | Code Review with code pasted, Security lens selected |
| `gated-code-review-output.png` | Code Review output (SQL injection detected) |
| `coding-large-initial.png` | Coding Large discovery interface |

### Pages
| File | Description |
|---|---|
| `gated-audit-log.png` | ✅ Audit Log with stats + full compliance table |
| `gated-brief-me.png` | Brief Me chat interface |
| `gated-settings.png` | Settings My Profile tab |
| `gated-my-work.png` | My Work session list |
| `gated-sidebar.png` | Sidebar with 63 nav links |
| `gated-nav-projects.png` | Projects page via sidebar click |
| `gated-nav-audit.png` | Audit page via sidebar click |

### Smoke (all 41 routes — splash state)
`smoke-*.png` — 41 screenshots, all showing the "Enter Anton" splash correctly

### Responsive
| File | Description |
|---|---|
| `smoke-responsive-1280.png` | 1280px viewport — layout intact |
| `smoke-responsive-768.png` | 768px viewport — layout intact |
| `smoke-dark-theme.png` | Dark theme verification |

---

## Recommended Fixes (Priority Order)

| # | Issue | Severity | Effort |
|---|---|---|---|
| 1 | Script Medium clarify stage: add "Your Answers" input fields below questions (match Script Lite pattern) | **CRITICAL** | Medium |
| 2 | Script Medium: fix incorrect orange banner "No specific questions were generated" (questions clearly exist) | **CRITICAL** | Low |
| 3 | Model selector panel: auto-close after model selection (or add a "Done" / close button) | Medium | Low |
| 4 | Fix CSP header to allow Google Fonts (`style-src`, `font-src`) | Medium | Low |
| 5 | Add Settings link to sidebar navigation | Low | Low |
| 6 | Consider session persistence for splash gate (remember "entered" via localStorage) | Low | Low |
