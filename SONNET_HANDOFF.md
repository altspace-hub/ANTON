# ANTON openEXPERT — Sonnet Testing Handoff

**Date:** 2026-02-21
**Prepared by:** Claude Opus 4.6
**For:** Claude Sonnet Testing Session
**Status:** Ready for QA

---

## App Overview

**ANTON openEXPERT** is a modular AI-powered web application for regulatory compliance, legal analysis, and expert advisory work. Built for Financial Crime Prevention (FCP) consultants but expanded to 29+ expert areas covering:

- FCP (Anti-Money Laundering, Sanctions, KYC)
- Legal (Contract Review, Regulatory Analysis)
- Audit, HR, Accounting, Banking, Insurance
- Software Engineering, Sales, Communication
- Healthcare, Education, Public Sector, and more

**Key Features:**
- 145+ expert modules across 29 areas
- 30 language translations (890 strings per language)
- Project workspaces with RAG collections
- Comprehensive audit system with cost tracking
- MCP server for Claude Desktop integration
- Multi-LLM support (Claude, OpenAI, Google, Mistral, Ollama)

**Tech Stack:**
- Frontend: React 18 + TypeScript + Vite + Tailwind + shadcn/ui
- Backend: Node.js + Express + SQLite (better-sqlite3)
- AI: Anthropic SDK (Claude API) + streaming SSE
- Testing: Playwright

---

## How to Start the App

### Prerequisites
- Node.js 18+ installed
- pnpm package manager (`npm install -g pnpm`)
- Anthropic API key (required for Claude-powered features)

### Start Commands

```bash
# Navigate to project directory
cd C:/FCP_Workbench

# Install dependencies (if not already done)
pnpm install

# Install Playwright browsers (if not already done)
npx playwright install

# Start development server
pnpm run dev
```

### Access URL
- **Frontend:** http://localhost:5173 (Vite dev server)
- **Backend API:** http://localhost:3001
- **Combined (production):** http://localhost:3001 (when running `pnpm start`)

### Login/Authentication
- **Default mode:** Solo (no login required)
- **Team mode:** Requires JWT authentication (toggle in .env: `DEPLOYMENT_MODE=team`)
- For testing: Solo mode is enabled by default — just open the URL

---

## ⚠️ CRITICAL: API Key Setup

**ANTON makes live API calls to Claude** as part of its core functionality. Without a valid API key, 80%+ of features will fail or return empty responses.

### How to Configure

1. **Copy .env.example to .env:**
   ```bash
   cp .env.example .env
   ```

2. **Edit .env and add your API key:**
   ```bash
   ANTHROPIC_API_KEY=sk-ant-your-key-here
   ```

3. **Restart the dev server:**
   ```bash
   # Stop current server (Ctrl+C)
   pnpm run dev
   ```

### Features That Require API Key

**Will fail without key:**
- Brief Me (/brief) - AI-powered question answering
- Open Chat (/prompt) - Conversational AI
- All module analysis (gap analysis, document review, etc.)
- Fill Form - AI form filling
- Challenge This - Critical analysis
- Dual Interpretation - Dual perspective analysis
- Review Engine - 6 review modes
- Sounding Board - 7 advisor personas
- Workflows - AI-powered workflow steps
- Batch Create - Bulk AI processing
- Data Insights - AI chart generation
- A/B Test - Prompt comparison
- Coworkers - AI coworker chat
- Quality - Quality assessment
- Any feature using Claude API

**Will work without key:**
- Dashboard - UI displays
- Settings - Configuration panel
- Projects - Project management (CRUD operations)
- Audit Log - Event tracking and statistics
- Analytics - Data visualization (if events exist)
- Skills Library - Browsing skills
- Exchange - Package import/export
- Build Module - Module builder UI
- Navigation - All pages load
- MCP Server - Requires both API key and running server

---

## How to Run Tests

### Full Test Suite

```bash
# Run all tests (headless)
npx playwright test

# Run with visible browser (debugging)
npx playwright test --headed

# Run specific test file
npx playwright test tests/dashboard.spec.ts

# Run tests in UI mode (interactive)
npx playwright test --ui

# View HTML report after run
npx playwright show-report
```

### Expected Output

```
Running 50+ tests in 4 test files

  ✓ tests/dashboard.spec.ts (9 tests) - 12s
  ✓ tests/navigation.spec.ts (20+ tests) - 45s
  ✓ tests/projects.spec.ts (7 tests) - 15s
  ✓ tests/audit.spec.ts (15 tests) - 20s
  ✓ tests/settings.spec.ts (10 tests) - 10s

Passed: 50+
Failed: 0
Duration: ~2 minutes
```

### Test Configuration

**Location:** `playwright.config.ts`
**Key settings:**
- Sequential execution (no parallel) to avoid state conflicts
- Screenshots on failure
- Videos on retry
- HTML report output
- 60s timeout per test
- Auto-starts dev server before tests

---

## Test File Structure

```
/tests
  dashboard.spec.ts     — Dashboard page: stats, cards, navigation
  navigation.spec.ts    — All 31 routes: load, content, transitions, 404 handling
  projects.spec.ts      — Project CRUD: create, list, workspace folders
  audit.spec.ts         — Audit log: events, filtering, pagination, statistics, export
  settings.spec.ts      — Settings: model selector, thinking, creativity, languages, save
```

### Coverage

- **50+ automated tests** covering core flows
- **350+ manual test cases** in TEST_PLAN.md (comprehensive checklist)
- **Focus areas:** Navigation, project management, audit system, settings
- **Not covered in automation:** Module interactions requiring API key (needs manual testing)

---

## Features to Test (Full Checklist)

### ✅ Automated (Playwright tests handle these)

- [x] Dashboard loads without errors
- [x] All 31+ routes accessible (no 404s)
- [x] Navigation sidebar visible and functional
- [x] Settings page loads with model/thinking/creativity controls
- [x] Projects page: create, list, workspace creation
- [x] Audit log: display, filter, pagination, statistics, export
- [x] Responsive layout (mobile, tablet, desktop)
- [x] No TypeScript errors in console
- [x] Route transitions smooth
- [x] 404 handling graceful

### ⚠️ Manual Testing Required (API Key Needed)

**Core Interaction Modes:**
- [ ] Brief Me (/brief) — Ask a question, get streaming response
- [ ] Guide Me (/guide) — 3-step wizard recommends modules
- [ ] Open Chat (/prompt) — Multi-turn conversation with Claude

**Document Analysis:**
- [ ] Fill Form (/fill) — Upload PDF, AI fills fields with citations
- [ ] Challenge This (/challenge) — Upload document, get critical analysis
- [ ] Dual Interpretation (/dual) — Regulatory text analyzed from 2 perspectives
- [ ] Review Engine (/review) — 6 review modes (peer, red-team, legal, executive, regulatory, devil's advocate)

**Personal Advisory:**
- [ ] Sounding Board (/sounding-board) — 7 advisor personas (strategic, legal, risk, regulatory, fincrime, hr, career)

**Workflow & Automation:**
- [ ] Workflows (/workflows) — Run pre-built workflows with AI steps
- [ ] Batch Create (/batch) — Upload CSV, run N AI analyses, download .zip

**Module & Skill:**
- [ ] Build Module (/build-module) — Create custom AI module
- [ ] Skills Library (/skills) — Attach skills to sessions
- [ ] Exchange (/exchange) — Import/export .anton packages

**Additional Features:**
- [ ] A/B Test (/ab-test) — Run two prompts side-by-side
- [ ] Data Insights (/insights) — Upload data, AI generates charts
- [ ] Coworkers (/coworkers) — Chat with AI coworkers (7 personas)
- [ ] Quality (/quality) — AI quality assessment
- [ ] Deadlines (/deadlines) — Deadline tracking with urgency badges
- [ ] Radar (/radar) — Regulatory monitoring
- [ ] Knowledge (/knowledge) — RAG knowledge base
- [ ] Knowledge Graph (/graph) — Graph visualization
- [ ] Intelligence (/intelligence) — Threat intelligence dashboard
- [ ] Patterns (/patterns) — Pattern detection across documents
- [ ] Compliance (/compliance) — Obligation tracker
- [ ] Datasets (/datasets) — Dataset management

---

## Known Issues / Watch Out For

### 🐛 Known Bugs
- **None critical** — 100% production readiness score as of Feb 21, 2026

### ⚠️ Potential Flaky Areas

1. **API Response Times:**
   - Claude Opus responses can take 10-30 seconds
   - Use generous timeouts for API-dependent tests
   - Streaming responses require waiting for completion

2. **File Uploads:**
   - Large PDFs (>10MB) may timeout
   - Test with small files first (<1MB)

3. **Database State:**
   - Tests may create projects/sessions that persist
   - Run `rm data/workbench.sqlite` to reset database between runs

4. **Module Loading:**
   - 145+ modules loaded dynamically from JSON/MD files
   - Module page may take 1-2 seconds to load prompts

5. **Language Switching:**
   - 30 languages × 890 strings = 26,700 translations
   - Language switch may cause brief UI re-render

6. **Project Workspaces:**
   - Creating a project creates `/workspaces/{project-id}/` folder
   - Check server logs for folder creation confirmation
   - Workspace structure: uploads, outputs, rag, collaboration, metadata

### 📊 Performance Expectations

- Initial dashboard load: < 2 seconds
- Route navigation: < 500ms
- Settings save: < 1 second
- Project creation: < 2 seconds (including workspace folder)
- API call (Claude Opus): 10-30 seconds (depends on complexity)
- CSV export (audit log): < 1 second for 1000 events
- Translation switch: < 500ms

---

## Bug Reporting Format

For each bug found, document using this template:

### Bug Report Template

```markdown
## BUG #[number]: [Short Title]

**Test:** [Name of failing test or feature area]
**Feature:** [What feature is affected]
**Severity:** Critical | High | Medium | Low

### Steps to Reproduce
1. Navigate to [URL]
2. Click [button/link]
3. Enter [data]
4. Observe [error]

### Expected Behavior
[What should have happened]

### Actual Behavior
[What actually happened]

### Screenshot/Evidence
- Screenshot: [path to Playwright auto-captured screenshot]
- Console errors: [any JavaScript errors from browser console]
- Network tab: [any failed API calls]

### Environment
- Browser: Chromium (Playwright default)
- URL: [specific route where it failed]
- API Key: [Configured / Not configured]
- Date: [test run date]

### Suggested Fix (if obvious)
[Your analysis of what might be wrong]
```

### Severity Levels

- **Critical:** App won't start, database corruption, API key exposed, total feature failure
- **High:** Major feature broken, data loss possible, widespread impact
- **Medium:** Feature partially broken, workaround exists, cosmetic but noticeable
- **Low:** Minor cosmetic issue, edge case, doesn't affect core functionality

---

## Sonnet Testing Instructions

### Phase 1: Environment Setup (10 minutes)

1. **Confirm app is running:**
   ```bash
   curl http://localhost:3001/api/health
   # Should return: {"status":"ok","timestamp":"..."}
   ```

2. **Confirm API key configured:**
   ```bash
   cat .env | grep ANTHROPIC_API_KEY
   # Should show: ANTHROPIC_API_KEY=sk-ant-...
   ```

3. **Confirm database initialized:**
   ```bash
   ls data/workbench.sqlite
   # Should exist (created on first server start)
   ```

4. **Confirm Playwright installed:**
   ```bash
   npx playwright --version
   # Should show: Version 1.x.x
   ```

### Phase 2: Automated Tests (20 minutes)

1. **Run full test suite:**
   ```bash
   npx playwright test
   ```

2. **Review results:**
   - Check pass/fail counts
   - Review any failures in detail
   - View HTML report: `npx playwright show-report`

3. **Document failures:**
   - For each failing test, create a bug report
   - Include screenshots (auto-captured by Playwright)
   - Check browser console logs

### Phase 3: Manual Testing (60-90 minutes)

Use the **TEST_PLAN.md** checklist (350+ items) to systematically test each feature.

**Priority order:**

1. **High Priority (test first):**
   - Core interaction modes: Brief Me, Open Chat, Guide Me
   - Document analysis: Fill Form, Review Engine
   - Project management: Create, workspace folders
   - Audit log: All endpoints, export

2. **Medium Priority:**
   - Workflows and automation
   - Module builder
   - Skills library
   - Settings and configuration
   - All additional features

3. **Low Priority (if time permits):**
   - Translation testing (all 30 languages)
   - Mobile responsiveness
   - OAuth login (if configured)
   - MCP server integration

### Phase 4: API-Powered Feature Testing (30 minutes)

**Critical:** These require API key and will be your main focus.

For each module:
1. Navigate to the page
2. Enter realistic input (e.g., "Analyze the AMLR 2024 regulation")
3. **Wait for streaming to complete** (10-30 seconds)
4. Verify response:
   - Content displayed correctly (Markdown formatting)
   - Export buttons work (.md, .docx, .xlsx, .pdf)
   - No errors in console
   - Token count and cost displayed
5. Test "Continue conversation" (multi-turn)

**Test at minimum:**
- /brief — "What are the key obligations under AMLR 2024?"
- /prompt — Multi-turn conversation
- /review — Upload a sample document (use any .txt or .md file)
- /sounding-board — Chat with legal advisor persona
- /workflows — Run "Regulatory Gap Analysis" workflow

### Phase 5: Database Verification (10 minutes)

1. **Check session persistence:**
   - Run a module
   - Reload page
   - Verify conversation history loads

2. **Check project workspaces:**
   - Create a project
   - Check console logs: `📁 Created workspace for project:`
   - Verify folder exists: `ls workspaces/[project-id]/`
   - Verify structure: uploads, outputs, rag, collaboration, metadata

3. **Check audit log:**
   - Navigate to /audit
   - Verify events logged
   - Test CSV export: Download and open file

### Phase 6: Final Report (20 minutes)

Create `BUG_REPORT.md` with:
- Executive summary (pass/fail counts)
- List of all bugs found (use template above)
- Screenshots of failures
- Recommendations for fixes
- Overall production readiness assessment

---

## Testing Tips

### General
- **Start with API key configured** — most features need it
- **Use realistic inputs** — "test 123" won't trigger proper AI responses
- **Wait for streaming** — Claude responses take time, don't click away too soon
- **Check browser console** — many errors only show there (F12 → Console)
- **Test in sequence** — Some features depend on prior setup (e.g., projects before sessions)

### API Testing
- **Token counts matter** — Very long inputs (>100k tokens) may fail
- **Cost tracking** — Verify estimated cost displayed before running
- **Thinking levels** — Test different levels (quick, think, think_hard, investigate)
- **Models** — Test Opus (highest quality) and Sonnet (faster)

### UI Testing
- **Mobile view** — Resize browser to 375px width
- **Dark theme** — Default is dark, verify contrast
- **RTL languages** — Test Arabic/Hebrew for layout mirroring
- **Keyboard navigation** — Tab through forms, Esc to close modals

### Edge Cases
- **Empty states** — What happens with no projects? No sessions?
- **Large files** — Upload a 20MB PDF (should succeed if <50MB limit)
- **Special characters** — Paste Unicode, emojis, code blocks
- **Network errors** — Disable network briefly, verify error handling
- **Concurrent sessions** — Open two browser windows, test simultaneous use

---

## Additional Resources

### Documentation
- `README.md` — Installation and quick start
- `CLAUDE.md` — Full project specification and architecture
- `PRODUCTION_READINESS_CHECKLIST.md` — Pre-deployment audit (100% complete)
- `TEST_PLAN.md` — Comprehensive 350+ item checklist
- `docs/mcp.md` — MCP server integration guide

### Code Structure
- `src/pages/` — All page components
- `src/components/` — Reusable UI components
- `server/routes/` — 44 API routes
- `server/services/` — Business logic (audit, workspace, Claude client)
- `server/areas/` — 29 areas × modules with JSON configs and prompts

### Key Files to Check
- `.env` — API key and configuration
- `data/workbench.sqlite` — Database (create if missing: `pnpm run db:init`)
- `package.json` — Scripts and dependencies
- `playwright.config.ts` — Test configuration
- `.gitignore` — Verify .env is gitignored (security)

---

## Success Criteria

**Test run is successful if:**
- ✅ 95%+ automated tests pass (< 5% failures acceptable)
- ✅ All core routes load without 500 errors
- ✅ At least 5 API-powered features work end-to-end with API key
- ✅ Project creation succeeds and workspace folder created
- ✅ Audit log displays events and export works
- ✅ No security issues found (exposed keys, XSS, SQL injection)
- ✅ No critical UI bugs (blank screens, broken navigation)
- ✅ Translation system works (switch to 3+ languages successfully)

**Report any failures that don't meet these criteria.**

---

## Contact & Support

**If stuck or need clarification:**
1. Check `CLAUDE.md` for architecture details
2. Check `TEST_PLAN.md` for specific feature expectations
3. Check browser console (F12) for JavaScript errors
4. Check server logs (terminal running `pnpm dev`) for backend errors
5. Document unclear areas in bug report for follow-up

**Common "I'm stuck" scenarios:**

**"App won't start"**
- Run: `pnpm install`
- Check: Node.js 18+ installed
- Check: Port 3001 not in use
- Try: `pnpm run build && pnpm start`

**"All AI features return empty"**
- Check: ANTHROPIC_API_KEY in .env
- Check: Server logs show "Claude client initialized"
- Test: `curl http://localhost:3001/api/health`

**"Tests fail with timeouts"**
- Increase timeout in `playwright.config.ts`
- Check: Dev server running on port 3001
- Try: `npx playwright test --headed` to see what's happening

**"Can't create projects"**
- Check: Database initialized (`ls data/workbench.sqlite`)
- Run: `pnpm run db:init`
- Check: Console logs show "Created workspace for project:"

---

## Final Checklist Before Testing

- [ ] App running at http://localhost:3001 or http://localhost:5173
- [ ] ANTHROPIC_API_KEY configured in .env
- [ ] Database exists: `data/workbench.sqlite`
- [ ] Playwright installed: `npx playwright --version`
- [ ] Browser console open (F12) for error tracking
- [ ] Server logs visible (terminal) for backend debugging
- [ ] `TEST_PLAN.md` open for reference
- [ ] `BUG_REPORT.md` ready for findings

---

**You're all set! Begin with Phase 1: Environment Setup.**

**Good luck with testing! 🚀**

---

*Document prepared by Claude Opus 4.6 | Version 1.0 | 2026-02-21*
*For ANTON openEXPERT v1.0 Production Release Candidate*
