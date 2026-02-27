# openEXPERT by ANTON — Complete Implementation Roadmap

**Version:** 2.0 — Definitive Edition  
**Date:** February 17, 2026  
**Author:** Daniel Bardun / FutureChain AB  
**Purpose:** The single source of truth for everything that needs to be built, fixed, and delivered. Every item from the Whitepaper, Blueprint, Deep Dive, Persona Validation, and Codebase State is accounted for here.

---

## How This Document Is Structured

**Part 1** — Complete Feature Inventory: Every feature mapped against current state  
**Part 2** — Work Packages: Every item that needs building, grouped into executable units  
**Part 3** — Tiered Roadmap: What to build when, with clear rationale  
**Part 4** — Architecture Decisions: Technical decisions required before/during implementation  
**Part 5** — Area Expansion Plan: The phased rollout of all 30+ areas  
**Part 6** — Content Assets Already Written: What exists in docs and can be deployed immediately once the architecture supports it

---

## PART 1: COMPLETE FEATURE INVENTORY

### 1.1 Core Engine

| # | Feature | Source | Status | Detail |
|---|---------|--------|--------|--------|
| 1 | Claude API integration (streaming, 3 models, thinking controls) | Codebase | ✅ Built & Working | Express proxy, SSE streaming, model selection. |
| 2 | Session management (create, persist, resume) | Codebase | 🔨 Partial | DB schema exists, CRUD endpoints work. **Bug:** messages never saved to DB. Dashboard/sidebar show hardcoded "No sessions." No resume capability. |
| 3 | Chat interface (markdown rendering, streaming, thinking display) | Codebase | ✅ Built & Working | react-markdown + remark-gfm + rehype-highlight. |
| 4 | Opus thinking config | Codebase | 🐛 Bug | Uses `{ type: 'enabled', budget_tokens: 10000 }` instead of `{ type: 'adaptive' }` as spec requires. |
| 5 | Pre-run token counting | Codebase | 🔲 Not Wired | `token-estimator.ts` exists but not called. No MAX_CONTEXT_TOKENS enforcement. |
| 6 | Pre-run cost estimation | Persona Val | 🔲 Not Started | Show estimated cost before running (model + tokens + thinking level). |
| 7 | API retry logic | Codebase | 🔲 Not Started | No exponential backoff. Single try/catch. |
| 8 | Prompt caching | Codebase | 🔲 Not Started | Anthropic API supports it; would reduce cost for repeated system prompts. |
| 9 | Settings page functional | Codebase | 🔲 Not Started | Currently read-only. Can't change defaults. |
| 10 | Default model from .env | Codebase | 🔲 Not Wired | DEFAULT_MODEL env var exists but frontend ignores it. |
| 11 | Loading states for async operations | Codebase | 🔲 Not Started | Folder browsing/indexing hangs without feedback. |

### 1.2 Seven-Layer Prompt Builder

| # | Feature | Source | Status | Detail |
|---|---------|--------|--------|--------|
| 12 | Layer 1: ANTON Ground Work Prompt | Deep Dive | 🔲 Not Started | Full ~700-token prompt is written in Deep Dive §1.3. Fallback in code is `'You are a helpful compliance assistant.'` |
| 13 | Layer 2: Area Context | Whitepaper | 🔲 Not Started | No area system exists. |
| 14 | Layer 3: Module Expertise (system prompts) | Codebase | ✅ Built | 12 prompts in `server/prompts/*.md`. **Bug:** Frontend uses hardcoded `defaultPrompts` instead of fetching from server. Server prompts unused. |
| 15 | Layer 4: Persona Injection | Codebase | ✅ Built & Working | 9 role-based personas. `getExpertRoleInstruction()` injected server-side. |
| 16 | Layer 5: Skills Attachment | Whitepaper | 🔲 Not Started | No skills system. |
| 17 | Layer 6: Knowledge Source Integration | Codebase | 🔨 Partial | Web search works. URL fetch, folder text extraction, combined mode = UI-only. |
| 18 | Layer 7: Transparency & Reasoning | Codebase | 🔨 Partial | Binary on/off toggle. Missing 3-level system (Off/Summary/Detailed). Level 1 and Level 2 prompt templates written in Deep Dive §1.10. |
| 19 | Unified prompt composition (PromptComposer) | Deep Dive | ⚠️ Critical Bug | Assembly split across client/server. Output format instructions, creativity instructions, planning instructions are coded but NEVER reach Claude. Complete assembly spec with token estimates in Deep Dive §1.11. |
| 20 | Creativity as prompt injection | Codebase | ⚠️ Critical Bug | `getCreativityInstruction()` exists but never called. Three instruction texts (strict/balanced/creative) written in Deep Dive §1.2. |
| 21 | Planning instruction | Codebase | ⚠️ Critical Bug | `getPlanningInstruction()` exists but never called. |

### 1.3 Knowledge Source System

| # | Feature | Source | Status | Detail |
|---|---------|--------|--------|--------|
| 22 | Mode 1: Claude's knowledge + web search | Codebase | ✅ Built & Working | Web search tool added to API request. |
| 23 | Mode 2: Online regulation links (URL fetch + extract) | Whitepaper | 🔨 UI Only | URL input UI works. No server-side fetch/extract service. |
| 24 | Mode 3: Local folder integration (read + extract + inject) | Whitepaper | 🔨 UI Only | Folder browse/register UI + server endpoints exist. No text extraction. `mammoth`, `pdf-parse` not installed. |
| 25 | Mode 4: Combined (all sources with priority) | Whitepaper | 🔨 UI Only | Priority selector exists. Nothing to combine since modes 2–3 don't work. |

### 1.4 Output Format System

| # | Feature | Source | Status | Detail |
|---|---------|--------|--------|--------|
| 26 | Format selector UI (27 formats, 6 categories) | Codebase | ✅ Built & Working | Beautiful multi-select chips. |
| 27 | Format instructions → Claude | Codebase | ⚠️ Critical Bug | `buildOutputInstruction()` generates correct text but is never injected. |
| 28 | Area-specific output formats | Blueprint | 🔲 Not Started | e.g., "Legal Brief" for Legal, "Audit Report" for Audit. |

### 1.5 Area & Module System

| # | Feature | Source | Status | Detail |
|---|---------|--------|--------|--------|
| 29 | Area Navigator (30 areas, colour-coded, domain clusters) | Whitepaper | 🔲 Not Started | No area concept in codebase. Flat module list. |
| 30 | Module configs as JSON + markdown prompt | Blueprint | 🔨 Partial | Modules in `constants.ts` array. Adding a module requires code in 3+ places. Not truly config-driven. |
| 31 | Dynamic module rendering from JSON config (DynamicModule) | Blueprint | 🔲 Not Started | Guided inputs are hardcoded React components per module. |
| 32 | Module loader service (scan dirs, load, validate, serve) | Blueprint | 🔲 Not Started | — |
| 33 | Server-side prompt loading (replace hardcoded defaultPrompts) | Codebase | 🔲 Not Wired | Server endpoint exists (`GET /api/modules/:id/prompt`). Frontend never calls it. |

### 1.6 Expert Personas

| # | Feature | Source | Status | Detail |
|---|---------|--------|--------|--------|
| 34 | "Add Expert" persona selector | Codebase | ✅ Built & Working | Dropdown with 9 role-based personas. |
| 35 | "This Is Me" personal profile | Blueprint | 🔲 Not Started | No profile UI, storage, or injection. |
| 36 | Named character personas (Daniel, Amanda, Oscar, etc.) | Blueprint | 🔲 Not Started | Blueprint defines 12 characters with JSON structure and perspective descriptions. |
| 37 | Multi-persona selection (combine 2–3) | Blueprint | 🔲 Not Started | Current UI is single-select dropdown. |
| 38 | Persona categories: Domain Experts, Functional Roles, Thinking Styles, Audience Proxies | Blueprint | 🔲 Not Started | Current personas are domain experts only. Missing: Thinking Styles (Skeptic, Optimist, Devil's Advocate, Simplifier), Audience Proxies ("Explain as if I'm a board member"). |
| 39 | Content Memory (learned preferences across sessions) | Persona Val | 🔲 Not Started | Persistent learned preferences for brand voice, company context, output style. |

### 1.7 Review Engine

| # | Feature | Source | Status | Detail |
|---|---------|--------|--------|--------|
| 40 | Multi-perspective review workflow | Blueprint | 🔲 Not Started | — |
| 41 | Review modes: Quality, Regulatory, Technical, Communication, Red Team, Plain Language | Blueprint | 🔲 Not Started | Blueprint §7 defines 6 review modes with output structure. |
| 42 | Audience Accessibility Check | Blueprint | 🔲 Not Started | — |
| 43 | Review output format (🟢🟡🔴 + comments + improvements + missing + strengths) | Blueprint | 🔲 Not Started | — |
| 44 | Citation verification layer | Persona Val | 🔲 Not Started | Post-processing check that legal/regulatory citations exist. |

### 1.8 Skills Repository

| # | Feature | Source | Status | Detail |
|---|---------|--------|--------|--------|
| 45 | Skill pack structure (skill.json + system-prompt.md + knowledge/ + examples/) | Blueprint | 🔲 Not Started | Structure defined in Blueprint §3.3. |
| 46 | Skill attachment to sessions | Whitepaper | 🔲 Not Started | — |
| 47 | Pre-built skills (12 defined) | Blueprint | 🔲 Not Started | Blueprint §10 defines 12 skill packs. Deep Dive has full prompt text for "Swedish Regulatory Language" and "Board-Ready Communication". |
| 48 | Domain-specific skills: Swedish Employment Law, Startup Mode, "I'm not a specialist" mode, Swedish Personal Finance | Persona Val | 🔲 Not Started | Identified as critical for specific personas. |
| 49 | Skill version control | Whitepaper | 🔲 Not Started | — |
| 50 | Skill sharing (team → org → public) | Whitepaper | 🔲 Not Started | — |

### 1.9 Project System

| # | Feature | Source | Status | Detail |
|---|---------|--------|--------|--------|
| 51 | Project CRUD (name, description, team, timeline) | Blueprint | 🔲 Not Started | No DB table, no UI. |
| 52 | Session-to-project linking | Blueprint | 🔲 Not Started | — |
| 53 | Cross-area session grouping | Whitepaper | 🔲 Not Started | — |
| 54 | Project-level knowledge sources (always loaded) | Blueprint | 🔲 Not Started | — |
| 55 | Project templates (AMLR Implementation, Startup Launch, etc.) | Whitepaper | 🔲 Not Started | — |
| 56 | Project dashboard (progress, sessions, deliverables, next deadline) | Blueprint | 🔲 Not Started | — |
| 57 | Export entire project as bundled deliverable | Blueprint | 🔲 Not Started | — |
| 58 | Version history across all project documents | Blueprint | 🔲 Not Started | — |

### 1.10 Dashboard & Analytics

| # | Feature | Source | Status | Detail |
|---|---------|--------|--------|--------|
| 59 | Personal Dashboard (usage stats, recent sessions, favourites) | Blueprint | 🔲 Not Started | Dashboard shows hardcoded "No sessions yet." |
| 60 | Domain Dashboards per Area (news, benchmarking, regulatory timeline, charts) | Blueprint | 🔲 Not Started | — |
| 61 | Executive Dashboard (cross-area view, team productivity, risk indicators) | Blueprint | 🔲 Not Started | — |
| 62 | ROI Tracker (estimated time/cost savings vs. consulting rates) | Blueprint | 🔲 Not Started | — |

### 1.11 Build Your Own Module

| # | Feature | Source | Status | Detail |
|---|---------|--------|--------|--------|
| 63 | "Save as Module" from session | Blueprint | 🔲 Not Started | Blueprint §11 defines the 7-step extraction flow. |
| 64 | "Build From Scratch" 8-step wizard | Blueprint | 🔲 Not Started | Blueprint §11 defines the wizard steps. |
| 65 | Module test playground | Blueprint | 🔲 Not Started | — |
| 66 | Module version history | Blueprint | 🔲 Not Started | — |
| 67 | A/B testing (two prompt versions, same input) | Blueprint | 🔲 Not Started | — |

### 1.12 Open Chat / Free-Form Mode

| # | Feature | Source | Status | Detail |
|---|---------|--------|--------|--------|
| 68 | Free-form chat | Codebase | ✅ Built & Working | `PromptPage.tsx` with streaming. |
| 69 | Prompt improvement loop (3-phase) | Codebase | ✅ Built & Working | Analyse → clarify → improve. |
| 70 | Full capability settings in open chat | Whitepaper | 🔨 Partial | Has model + thinking. Missing: creativity, output formats, knowledge sources, personas, skills, project linking. |

### 1.13 Workflow Builder

| # | Feature | Source | Status | Detail |
|---|---------|--------|--------|--------|
| 71 | Pre-built workflow templates (10) | Codebase | ✅ Built & Working | — |
| 72 | Visual workflow builder (form-based) | Codebase | ✅ Built & Working | — |
| 73 | Guided execution (step-by-step) | Codebase | ✅ Built & Working | — |
| 74 | Automatic execution (pipeline) | Whitepaper | 🔲 Not Started | — |
| 75 | Cross-area workflow steps (step in Area 2 feeds step in Area 11) | Whitepaper | 🔲 Not Started | Current workflows are FCP-only. |
| 76 | Workflow from project history (extract successful sequence as template) | Whitepaper | 🔲 Not Started | — |

### 1.14 Export Pipeline

| # | Feature | Source | Status | Detail |
|---|---------|--------|--------|--------|
| 77 | Markdown (.md) export | Codebase | ✅ Built & Working | — |
| 78 | PowerPoint (.pptx) export | Codebase | ✅ Built & Working | Real slide generation with pptxgenjs. |
| 79 | Word (.docx) export | Codebase | 🐛 Placeholder | Returns `.docx.md`. `docx` package not installed. |
| 80 | Excel (.xlsx) export | Codebase | 🐛 Placeholder | Returns `.xlsx.md`. `exceljs` not installed. |
| 81 | PDF (.pdf) export | Codebase | 🐛 Placeholder | Returns `.pdf.md`. No PDF library installed. |
| 82 | Brand Template System (upload company templates, export into them) | Persona Val | 🔲 Not Started | Critical for Big4/consulting users. |

### 1.15 Communication & Branding Hub

| # | Feature | Source | Status | Detail |
|---|---------|--------|--------|--------|
| 83 | Audience Selector (Board, Regulator, Customer, Employee, etc.) | Blueprint | 🔲 Not Started | Platform-level feature spanning all areas. |
| 84 | Channel Selector (Email, Presentation, Report, Social media, etc.) | Blueprint | 🔲 Not Started | — |
| 85 | Tone Calibration (Formal↔Casual, Technical↔Accessible) | Blueprint | 🔲 Not Started | — |
| 86 | Brand Voice Check (upload brand guide) | Blueprint | 🔲 Not Started | — |
| 87 | Message Testing (run through audience personas) | Blueprint | 🔲 Not Started | — |
| 88 | "Explain This Differently" button (reframe for different audience) | Blueprint | 🔲 Not Started | One-click output reframing. |

### 1.16 Interaction Modes (Beyond Standard)

| # | Feature | Source | Status | Detail |
|---|---------|--------|--------|--------|
| 89 | Standard mode (select module → configure → run) | Codebase | ✅ Built & Working | Current architecture. |
| 90 | "Brief Me" quick access (one question → focused answer, no module selection) | Persona Val | 🔲 Not Started | For executives. Lightweight panel, auto-selects best module. |
| 91 | "Guide Me" wizard (interview-style, simple questions one at a time) | Persona Val | 🔲 Not Started | For non-specialists. ANTON builds context incrementally. |
| 92 | "Batch Create" (template + variables → N variations) | Persona Val | 🔲 Not Started | For content creators. 20 social posts, content calendar, etc. |
| 93 | "Fill This Form" (upload form → field-by-field guidance) | Persona Val | 🔲 Not Started | For anyone with forms (farmers, parents, consumers). |
| 94 | "Sounding Board" conversational mode | Persona Val | 🔲 Not Started | More Socratic, less deliverable-focused. Thinking partner. |
| 95 | "Challenge This" / "Dual Interpretation" mode | Persona Val | 🔲 Not Started | Deliberately sceptical mode for business plans / legal texts. |

### 1.17 Smart Features

| # | Feature | Source | Status | Detail |
|---|---------|--------|--------|--------|
| 96 | Smart Model Routing (auto-suggest cheaper model for simple tasks) | Persona Val | 🔲 Not Started | With cost estimate + user override. |
| 97 | Task Estimation (time, tokens, cost, recommended model before running) | Persona Val | 🔲 Not Started | — |
| 98 | "Regulatory Authority" perspective mode | Persona Val | 🔲 Not Started | Think like a supervisor, not a supervised entity. |

### 1.18 Branding & Identity

| # | Feature | Source | Status | Detail |
|---|---------|--------|--------|--------|
| 99 | Rename to openEXPERT / ANTON throughout | Codebase | 🔨 Partial | Still "fcp-workbench" / "Advisense" in many places. |
| 100 | openEXPERT visual identity (logo, colours, typography) | Whitepaper | 🔲 Not Started | Need to replace Advisense branding. |

### 1.19 Internationalisation & Accessibility

| # | Feature | Source | Status | Detail |
|---|---------|--------|--------|--------|
| 101 | i18n infrastructure (externalisable strings, locale files) | Whitepaper | 🔲 Not Started | All strings hardcoded in JSX. No i18n framework. |
| 102 | UI language selector | Persona Val | 🔲 Not Started | Swedish, Finnish, Danish, Norwegian, English. |
| 103 | Output language selector (independent from UI) | Persona Val | 🔲 Not Started | — |
| 104 | Responsive mobile design | Persona Val | 🔲 Not Started | — |

### 1.20 Deployment & Security

| # | Feature | Source | Status | Detail |
|---|---------|--------|--------|--------|
| 105 | One-click installer / Docker container | Persona Val | 🔲 Not Started | Critical for non-technical users. |
| 106 | Cloud/SaaS deployment | Whitepaper | 🔲 Not Started | Persona Val argues move to Phase 3–4 from Phase 6. |
| 107 | Security hardening (CORS, input sanitisation, HTTPS) | Codebase | 🔲 Not Started | CORS wide open. Basic path traversal protection only. |
| 108 | User authentication | Codebase | 🔲 Not Started | API key is only auth. No user isolation. |
| 109 | Offline capability (file mgmt, projects, sessions work without internet) | Blueprint | 🔲 Not Started | — |
| 110 | Enterprise features (RBAC, SSO, audit trails, multi-tenant) | Whitepaper | 🔲 Not Started | — |

### 1.21 External Integrations

| # | Feature | Source | Status | Detail |
|---|---------|--------|--------|--------|
| 111 | EUR-Lex API integration | Persona Val | 🔲 Not Started | Free API for real-time EU regulation text. |
| 112 | CVE/NVD vulnerability database | Persona Val | 🔲 Not Started | Auto-fetch vulnerability details from CVE number. |
| 113 | Threat intelligence feeds (MITRE, CISA, CERT-EU) | Persona Val | 🔲 Not Started | — |
| 114 | Salary benchmarking data (SCB, Glassdoor) | Persona Val | 🔲 Not Started | — |
| 115 | Grant database knowledge (SIDA, EU funds, foundations) | Persona Val | 🔲 Not Started | — |
| 116 | Voice input (speech-to-text) | Persona Val | 🔲 Not Started | — |

### 1.22 Version History & Audit

| # | Feature | Source | Status | Detail |
|---|---------|--------|--------|--------|
| 117 | Version history on prompts | Blueprint | 🔲 Not Started | — |
| 118 | Version history on modules | Blueprint | 🔲 Not Started | — |
| 119 | Version history on deliverables | Blueprint | 🔲 Not Started | — |
| 120 | Version history on reviews | Blueprint | 🔲 Not Started | — |

### Summary: 120 line items total

| Status | Count | % |
|--------|-------|---|
| ✅ Built & Working | 16 | 13% |
| 🔨 Partial / UI Only | 10 | 8% |
| 🐛 Bug / Placeholder | 5 | 4% |
| ⚠️ Critical Bug | 4 | 3% |
| 🔲 Not Started / Not Wired | 85 | 71% |

---

## PART 2: WORK PACKAGES

Every item from Part 1 assigned to a work package. Work packages are ordered for execution.

### WP-01: Fix Prompt Assembly Pipeline ⚡ CRITICAL

**Items covered:** #12, #14, #19, #20, #21, #27, #33  
**Complexity:** L | **Stack:** Full-stack

**What to build:**
- Create `server/services/prompt-composer.ts` — single service that assembles all 7 layers
- Create `server/prompts/_foundation.md` — ANTON Ground Work Prompt (copy from Deep Dive §1.3, lines 75–145)
- Move ALL prompt assembly server-side. Client sends structured config, server builds prompt.
- Wire `buildOutputInstruction()` into composed prompt
- Wire `getCreativityInstruction()` into composed prompt  
- Wire `getPlanningInstruction()` into composed prompt
- Make `ModulePage.tsx` fetch prompts from `GET /api/modules/:id/prompt`
- Delete `defaultPrompts` object from `ModulePage.tsx`

**Files to create:** `server/services/prompt-composer.ts`, `server/prompts/_foundation.md`  
**Files to modify:** `server/routes/claude.ts`, `src/hooks/useClaude.ts`, `src/pages/ModulePage.tsx`, `server/services/prompt-builder.ts`

**Acceptance criteria:**
1. Output format selections appear in system prompt sent to Claude
2. Creativity slider changes the prompt instruction
3. Planning toggle injects planning instruction
4. ANTON Ground Work Prompt present in every request
5. Module prompts load from `.md` files on server
6. All existing capabilities (personas, meta-cognitive, structure reference) still work

---

### WP-02: Fix Session Persistence

**Items covered:** #2  
**Complexity:** M | **Stack:** Full-stack

**What to build:**
- Save user messages to `messages` table before streaming starts
- Save assistant messages after streaming completes (with token_count, cost)
- Make `Dashboard.tsx` query real sessions from `GET /api/sessions`
- Make `Sidebar.tsx` show 5 most recent sessions
- Add session resume flow: click session → load config + messages → continue conversation

**Files to modify:** `server/routes/claude.ts`, `server/routes/sessions.ts`, `src/pages/Dashboard.tsx`, `src/components/layout/Sidebar.tsx`, `src/pages/ModulePage.tsx`

---

### WP-03: Fix Remaining Engine Bugs

**Items covered:** #4, #5, #10, #11  
**Complexity:** S | **Stack:** Full-stack

**What to fix:**
- Change Opus thinking config from `{ type: 'enabled', budget_tokens: 10000 }` to `{ type: 'adaptive' }`
- Wire `token-estimator.ts` into request flow. Warn when context exceeds MAX_CONTEXT_TOKENS
- Make frontend read DEFAULT_MODEL from server config endpoint
- Add loading states for folder browsing/indexing operations

---

### WP-04: Knowledge Source Pipeline

**Items covered:** #23, #24, #25  
**Complexity:** L | **Stack:** Backend

**New packages:** `mammoth`, `pdf-parse`

**What to build:**
- `server/services/text-extractor.ts` — Extract text from PDF, DOCX, XLSX, TXT, MD, CSV
- `server/services/url-fetcher.ts` — Fetch URLs, strip HTML, return readable text
- `server/services/knowledge-resolver.ts` — Takes knowledge config, calls extractors, estimates tokens, truncates if needed, returns assembled context string
- Wire into PromptComposer as Layer 6

**Acceptance criteria:**
1. Upload PDF → text appears in Claude's context → Claude references specific content
2. Paste URL → page content fetched and included
3. Register folder → files read and included
4. Combined mode merges all sources
5. Token budget prevents overflow

---

### WP-05: DOCX Export

**Items covered:** #79  
**Complexity:** L | **Stack:** Backend

**New package:** `docx` (npm, use docx-js per SKILL.md)

**What to build:**
- `server/services/export-docx.ts` — Parse markdown → docx-js Document. Handle: headings H1–H4, paragraphs, bullet/numbered lists, tables, bold/italic, code blocks. A4 page size. Professional typography. openEXPERT branding in header/footer.

---

### WP-06: XLSX Export

**Items covered:** #80  
**Complexity:** M | **Stack:** Backend

**New package:** `exceljs`

**What to build:**
- `server/services/export-xlsx.ts` — Parse markdown tables into Excel sheets. Headers with fill colour. Auto-column-width. Conditional formatting for RAG (🟢🟡🟠🔴) scores. openEXPERT branding sheet.

---

### WP-07: PDF Export

**Items covered:** #81  
**Complexity:** M | **Stack:** Backend

**What to build:**
- `server/services/export-pdf.ts` — Recommended approach: generate DOCX first (WP-05), then convert to PDF via LibreOffice headless (`soffice --headless --convert-to pdf`). Requires LibreOffice installed. Alternative: `pdfkit` for direct generation.

---

### WP-08: Rebrand to openEXPERT / ANTON

**Items covered:** #99, #100  
**Complexity:** M | **Stack:** Full-stack

**What to do:**
- `package.json` name → `openexpert`
- `index.html` title → `openEXPERT by ANTON`
- All UI components: replace "Advisense FCP Workbench" with "openEXPERT by ANTON"
- `src/theme/advisense.ts` → `src/theme/openexpert.ts` with new brand colours
- `public/advisense-logo.svg` → replace with openEXPERT logo
- All 12 module prompts in `server/prompts/`: remove Advisense references
- Export services: update branding (PPTX, DOCX when built)
- `CLAUDE.md`: update project description

---

### WP-09: Area & Module Config System

**Items covered:** #29, #30, #31, #32, #33  
**Complexity:** XL | **Stack:** Full-stack

**What to build:**

Backend:
- `server/types/area-config.ts` — TypeScript interfaces: `AreaConfig`, `ModuleConfig`, `GuidedInputField`
- `server/services/module-loader.ts` — Scans `server/areas/*/` directories, loads JSON configs + prompt files, validates, caches, serves via API
- `server/routes/areas.ts` — `GET /api/areas`, `GET /api/areas/:id`, `GET /api/areas/:id/modules/:moduleId`
- `server/areas/fcp/area.json` — FCP area config (reference implementation)
- `server/areas/fcp/area-context.md` — FCP area context prompt (Layer 2)
- `server/areas/fcp/modules/[module-id]/module.json` + `system-prompt.md` for all 12 existing modules

Frontend:
- `src/components/platform/AreaNavigator.tsx` — Left sidebar with areas grouped by domain cluster, colour-coded, expandable to show modules. Search/filter.
- `src/components/modules/DynamicModule.tsx` — Renders guided inputs from JSON config. Field type → component mapping: text, textarea, select, multi-select, chips, boolean, file, number.

Migration:
- Move all 12 hardcoded module components + prompts into `server/areas/fcp/modules/` structure
- Remove hardcoded `moduleComponents` map, `defaultPrompts`, module list from `constants.ts`
- Verify FCP area works identically through new system

**Acceptance criteria:**
1. `GET /api/areas` returns all configured areas with modules
2. Adding a new module = create `module.json` + `system-prompt.md` → appears in API and UI
3. Zero code changes required to add modules
4. All 12 FCP modules work identically through DynamicModule
5. Area Navigator shows areas with correct colours and icons

---

### WP-10: Three-Level Transparency Toggle

**Items covered:** #18  
**Complexity:** S | **Stack:** Full-stack

**What to build:**
- Update `WritingStylePanel.tsx`: replace binary toggle with 3-option selector (Off / Summary / Detailed)
- Create transparency prompt templates from Deep Dive §1.10 (both Level 1 and Level 2 already written)
- Wire through PromptComposer: `transparencyLevel` → appropriate template

---

### WP-11: "This Is Me" Personal Profile

**Items covered:** #35, #39  
**Complexity:** M | **Stack:** Full-stack

**What to build:**
- `src/components/platform/IdentityPanel.tsx` — Form: name, role, company, industry, expertise areas, experience level, communication preferences, team context, current focus
- Add `user_profiles` table to SQLite
- Auto-inject profile into PromptComposer as self-persona in Layer 4
- Profile persists across sessions

---

### WP-12: Named Character Personas + Multi-Select

**Items covered:** #36, #37, #38  
**Complexity:** M | **Stack:** Full-stack

**What to build:**
- Move personas from `constants.ts` to JSON files in `server/personas/`
- Create 12 character personas (Daniel, Amanda, Oscar, Fredrik, Sara, Björn, Adrian, Hugo, Maria, Erik, Li, Nadia) from Blueprint §5
- Add persona categories: Domain Experts, Functional Roles, Thinking Styles (Skeptic, Optimist, Devil's Advocate, Simplifier), Audience Proxies
- Replace single-select dropdown with multi-select UI (combine 2–3 personas)
- Update PromptComposer to inject multiple persona perspectives (using integration instruction from Deep Dive §1.6)

---

### WP-13: Pre-Run Cost Estimation + Smart Model Routing

**Items covered:** #6, #96, #97  
**Complexity:** M | **Stack:** Full-stack

**What to build:**
- Before "Run": estimate input tokens (system prompt + knowledge sources + user message), estimate output tokens by format, calculate cost per model
- Display: "Estimated cost: ~$0.85 with Opus / ~$0.12 with Sonnet"
- Smart suggestion: "This task is straightforward — Sonnet can handle it for 85% less"
- User can accept suggestion or override

---

### WP-14: Dashboard with Real Data

**Items covered:** #59  
**Complexity:** M | **Stack:** Full-stack

**What to build:**
- Query sessions, messages, token counts, costs from DB
- Personal Dashboard: recent sessions (with resume links), total sessions by module/area, total tokens used, total estimated cost
- Basic charts with recharts (sessions over time, token usage, module popularity)
- Favourited / pinned modules

---

### WP-15: Settings Page Functional

**Items covered:** #9  
**Complexity:** S | **Stack:** Full-stack

**What to build:**
- Make settings editable: default model, default thinking level, default creativity, API key management
- Persist to SQLite or `.env` / localStorage
- Theme selection (existing dark/light/corporate)

---

### WP-16: Review Engine v1

**Items covered:** #40, #41, #42, #43  
**Complexity:** L | **Stack:** Full-stack

**What to build:**
- `src/components/platform/ReviewLauncher.tsx` — Select review mode(s), trigger review
- `server/services/review-engine.ts` — Takes session output + review mode → runs second Claude call with review-specific system prompt → returns structured review
- 6 review modes from Blueprint §7: Expert Panel, Audience Accessibility, Regulatory Compliance, Quality Assurance, Red Team, Plain Language
- Review output format: Overall assessment (🟢🟡🔴) + specific comments + suggested improvements + missing elements + strengths
- Display review findings alongside original output

---

### WP-17: Skills Repository v1

**Items covered:** #45, #46, #47, #48, #49  
**Complexity:** L | **Stack:** Full-stack

**What to build:**
- Skill pack file structure: `server/skills/[skill-id]/skill.json` + `system-prompt.md` + optional `knowledge/`
- `server/services/skills-manager.ts` — Load, validate, list, resolve skills
- `src/components/platform/SkillAttacher.tsx` — Browse and attach skills to session
- Wire into PromptComposer Layer 5
- Create 5 starter skills:
  1. Swedish Regulatory Language (prompt text in Deep Dive §1.7)
  2. Board-Ready Communication (prompt text in Deep Dive §1.7)
  3. EU Regulatory Navigator
  4. Academic Rigour
  5. Startup Mode (from Persona Val persona 3)
- Add `skills` table to DB
- Version number per skill

---

### WP-18: Project System v1

**Items covered:** #51, #52, #53, #54, #55, #56  
**Complexity:** L | **Stack:** Full-stack

**What to build:**
- Add `projects` table + `project_id` on sessions
- `src/components/platform/ProjectManager.tsx` — Create/edit/delete projects
- Project view showing linked sessions across areas
- Project-level knowledge sources (always loaded in member sessions)
- Basic project dashboard: progress tracking, deliverables list
- 2–3 project templates (AMLR Implementation, Startup Launch)

---

### WP-19: i18n Infrastructure

**Items covered:** #101  
**Complexity:** L | **Stack:** Frontend

**What to build:**
- Install `react-i18next` + `i18next`
- Create `src/i18n/locales/en.json` with all user-facing strings
- Extract every hardcoded string from every component to locale keys
- Module configs support locale-specific labels/descriptions (structure ready, content English-only)
- Don't translate — just make it possible for community

---

### WP-20: Open Chat Full Capabilities

**Items covered:** #70  
**Complexity:** M | **Stack:** Frontend

**What to build:**
- Add to PromptPage: creativity slider, output format selector, knowledge source panel, persona selector, skills attacher, project linking
- Essentially give Open Chat the same capability panel as ModulePage
- Maintain the prompt improvement loop alongside full capabilities

---

### WP-21: API Resilience

**Items covered:** #7, #8  
**Complexity:** M | **Stack:** Backend

**What to build:**
- Exponential backoff with retry on 429/500/503 errors (max 3 retries)
- Anthropic prompt caching for system prompts (ANTON foundation + area context are constant per area — cache them)
- Proper error categorisation: user-facing messages for different failure types

---

### WP-22: Docker / Easy Install

**Items covered:** #105  
**Complexity:** M | **Stack:** DevOps

**What to build:**
- `Dockerfile` with multi-stage build (Node for build, slim for runtime)
- `docker-compose.yml` with single service + volume for SQLite
- One-command install: `docker compose up`
- Documentation: README with install instructions for Docker, native (pnpm), and manual

---

### WP-23: Security Hardening

**Items covered:** #107  
**Complexity:** M | **Stack:** Backend

**What to build:**
- Restrict CORS to localhost only (configurable)
- Input sanitisation on all user inputs (folder paths, file uploads, URLs)
- Rate limiting on API routes
- Optional HTTPS via self-signed cert for network deployments
- Content Security Policy headers

---

### WP-24: Communication & Branding Hub

**Items covered:** #83, #84, #85, #86, #87, #88  
**Complexity:** L | **Stack:** Full-stack

**What to build:**
- Platform-level feature (not an area — accessible from any area)
- Audience Selector dropdown that modifies output instructions
- Channel Selector that adjusts format/tone
- Tone Calibration slider (Formal↔Casual, Technical↔Accessible)
- Brand Voice Check: upload brand guide → inject into prompt → Claude checks alignment
- "Explain This Differently" button: one-click to reframe output for different audience (re-runs with modified audience prompt)

---

### WP-25: Workflow Enhancements

**Items covered:** #74, #75, #76  
**Complexity:** L | **Stack:** Full-stack

**What to build:**
- Automatic execution mode: run all steps sequentially, present complete output at end
- Cross-area workflow steps: step 1 in Area 2 (Legal) → step 2 in Area 1 (FCP) → step 3 in Area 11 (PM)
- Extract workflow from project history: "This project followed a successful sequence — save as template?"

---

### WP-26: Build Your Own Module v1

**Items covered:** #63, #64, #65  
**Complexity:** L | **Stack:** Full-stack

**What to build:**
- "Save as Module" button on session output: extracts system prompt, knowledge config, output formats, persona config → generates module.json + system-prompt.md
- User edits/names/categorises → saves to personal module library
- "Build From Scratch" 8-step wizard (per Blueprint §11)
- Test playground: run test input against module draft, see output, iterate

---

### WP-27: Additional Interaction Modes

**Items covered:** #90, #91, #92, #93, #94, #95  
**Complexity:** XL | **Stack:** Full-stack

**What to build (each is a sub-package):**
- **Brief Me:** Lightweight panel. One question → auto-detect best area/module → focused answer. Minimal UI.
- **Guide Me:** Interview wizard. ANTON asks simple questions one at a time, builds understanding, produces output. For non-specialists.
- **Batch Create:** Template + variables → N variations. "Generate 20 headline options" or "Create a 5-day content calendar."
- **Fill This Form:** Upload/link a form → ANTON walks through field by field with guidance.
- **Sounding Board:** More conversational, Socratic mode. Asks probing questions, helps think through decisions.
- **Challenge This / Dual Interpretation:** Deliberately sceptical mode. Find flaws, present alternatives.

---

### WP-28: Brand Template System

**Items covered:** #82  
**Complexity:** L | **Stack:** Full-stack

**What to build:**
- Upload company Word/PPT templates
- Store templates per user/organisation
- Export pipeline generates content, then injects into user's template (merge fields)
- For DOCX: parse user template structure, inject content into correct sections
- For PPTX: use user's master slides, inject content into layouts

---

### WP-29: Version History

**Items covered:** #117, #118, #119, #120, #58  
**Complexity:** L | **Stack:** Full-stack

**What to build:**
- `versions` table: entity_type (prompt/module/deliverable/review), entity_id, version_number, content, created_at, created_by
- Version diff view: compare two versions side-by-side
- Restore previous version capability
- Covers: module prompts, deliverables/exports, review outputs, project documents

---

### WP-30: External Integrations

**Items covered:** #111, #112, #113, #114, #115  
**Complexity:** L | **Stack:** Backend

**What to build (modular — each as independent integration):**
- EUR-Lex API: fetch regulation text by celex number. Inject into knowledge sources.
- NVD/CVE API: fetch vulnerability details by CVE ID. Auto-enrich security module outputs.
- Open-source threat intel feeds (CISA, CERT-EU): periodic fetch, available as knowledge source.
- Salary data integration (SCB API): market rate data for HR modules.
- Grant database: structured knowledge of major funder requirements.

---

### WP-31: Area-Specific Output Formats

**Items covered:** #28  
**Complexity:** M | **Stack:** Backend

**What to build:**
- Extend output format system to allow area-specific formats
- Create formats: Legal Brief, Audit Report, Pentest Report, Clinical Trial Summary, Board Pack, Investment Memo
- Area configs specify which additional formats are available

---

### WP-32: Citation Verification Layer

**Items covered:** #44  
**Complexity:** M | **Stack:** Backend

**What to build:**
- Post-processing step: after Claude produces output with citations, run a second call: "Verify that all article/paragraph references in this text actually exist in the cited regulation"
- Flag unverified citations with ⚠️
- Optionally auto-fix by looking up correct references via web search or EUR-Lex

---

### WP-33: Mobile Responsive Design

**Items covered:** #104  
**Complexity:** L | **Stack:** Frontend

**What to build:**
- Responsive breakpoints for all layouts (sidebar collapses to bottom nav on mobile)
- Touch-friendly controls
- Optimised rendering for smaller screens
- Test across iOS Safari, Android Chrome

---

### WP-34: Cloud/SaaS Architecture

**Items covered:** #106, #108, #110  
**Complexity:** XL | **Stack:** Full-stack + Infrastructure

**What to build:**
- User authentication (email/password + OAuth)
- Multi-tenant database (user isolation)
- Deployment to cloud provider (Railway, Fly.io, or AWS)
- Usage-based billing integration
- SSO for enterprise
- RBAC (admin, editor, viewer roles)
- Audit trail logging
- Data encryption at rest

---

### WP-35: Voice Input

**Items covered:** #116  
**Complexity:** M | **Stack:** Frontend

**What to build:**
- Speech-to-text on message input field (Web Speech API or Whisper API)
- Works in Open Chat and module pages
- Microphone button with real-time transcription

---

### WP-36: Offline Capability

**Items covered:** #109  
**Complexity:** M | **Stack:** Full-stack

**What to build:**
- Service worker for offline access
- Cache: UI assets, saved sessions, project files, module configs
- Offline-available: file management, project browsing, session history, export from cache
- Online-required: Claude API calls (obviously), web search, URL fetch
- Clear offline/online indicator in UI

---

### WP-37: Additional Areas (31–34)

**Items covered:** Persona Val new areas  
**Complexity:** M per area | **Stack:** Config

**What to build (config-only once WP-09 is complete):**
- Area 31: Agriculture & Primary Industries (6 modules)
- Area 32: Community & Association Management (6 modules)
- Area 33: Translation & Localisation (6 modules)
- Area 34: Consumer Protection & Personal Safety (6 modules)

Each area = `area.json` + `area-context.md` + `module.json` + `system-prompt.md` per module.

---

## PART 3: TIERED ROADMAP

### Tier 1: MVP for Open Source Release (Weeks 1–6)

**Goal:** A working product that is genuinely useful and differentiated from talking to Claude directly. FCP area fully functional with professional output.

| Order | WP | Item | Complexity | Why Tier 1 |
|-------|-----|------|-----------|------------|
| 1 | WP-01 | Fix Prompt Assembly Pipeline | L | Everything depends on this. Without it, the product is broken. |
| 2 | WP-02 | Fix Session Persistence | M | Users can't lose work. |
| 3 | WP-03 | Fix Engine Bugs (Opus config, token counting, loading states) | S | Quality and correctness. |
| 4 | WP-04 | Knowledge Source Pipeline | L | The killer feature that differentiates from raw Claude. |
| 5 | WP-05 | DOCX Export | L | Professionals deliver Word documents. |
| 6 | WP-08 | Rebrand to openEXPERT | M | Can't release as "fcp-workbench". |
| 7 | WP-09 | Area & Module Config System + FCP Migration | XL | The architectural foundation for everything. Includes AreaNavigator + DynamicModule. |
| 8 | WP-10 | Three-Level Transparency | S | Key differentiator, small effort. |
| 9 | WP-22 | Docker / Easy Install | M | Community needs easy setup. |
| 10 | WP-23 | Security Hardening | M | Can't release with CORS wide open. |

**Tier 1 outcome:** Install openEXPERT → select FCP module → upload documents → select output formats → get ANTON-quality analysis → export to .docx. Sessions persist. Transparency explains reasoning. Knowledge sources work. Adding new modules is a JSON file + markdown prompt.

---

### Tier 2: Fast Follow (Weeks 7–12)

**Goal:** Platform feels like a platform. Multiple areas live. Key differentiating features active.

| Order | WP | Item | Complexity |
|-------|-----|------|-----------|
| 1 | WP-06 | XLSX Export | M |
| 2 | WP-07 | PDF Export | M |
| 3 | WP-11 | "This Is Me" Profile | M |
| 4 | WP-12 | Named Character Personas + Multi-Select | M |
| 5 | WP-14 | Dashboard with Real Data | M |
| 6 | WP-15 | Settings Page Functional | S |
| 7 | WP-13 | Pre-Run Cost Estimation + Smart Model Routing | M |
| 8 | WP-20 | Open Chat Full Capabilities | M |
| 9 | WP-21 | API Resilience (retry, prompt caching) | M |
| 10 | — | **Area Wave 1 launch** (Areas 2, 3, 4, 5, 8) | Config |

---

### Tier 3: Platform Maturity (Weeks 13–20)

**Goal:** Full feature set that matches the whitepaper vision. Community can contribute.

| Order | WP | Item | Complexity |
|-------|-----|------|-----------|
| 1 | WP-16 | Review Engine v1 | L |
| 2 | WP-17 | Skills Repository v1 (5 starter skills) | L |
| 3 | WP-18 | Project System v1 | L |
| 4 | WP-19 | i18n Infrastructure | L |
| 5 | WP-24 | Communication & Branding Hub | L |
| 6 | WP-25 | Workflow Enhancements (auto-execute, cross-area) | L |
| 7 | WP-31 | Area-Specific Output Formats | M |
| 8 | WP-29 | Version History | L |
| 9 | — | **Area Wave 2 launch** (Areas 6, 9, 10, 11, 12, 13, 15, 16, 17, 18) | Config |

---

### Tier 4: Advanced Features (Weeks 21–30)

**Goal:** Power-user features, interaction modes, integrations.

| Order | WP | Item | Complexity |
|-------|-----|------|-----------|
| 1 | WP-26 | Build Your Own Module v1 | L |
| 2 | WP-27 | Additional Interaction Modes (Brief Me, Guide Me, Batch, Fill Form, Sounding Board) | XL |
| 3 | WP-28 | Brand Template System | L |
| 4 | WP-30 | External Integrations (EUR-Lex, NVD, threat intel) | L |
| 5 | WP-32 | Citation Verification Layer | M |
| 6 | WP-33 | Mobile Responsive Design | L |
| 7 | WP-35 | Voice Input | M |
| 8 | WP-36 | Offline Capability | M |
| 9 | — | **Area Wave 3 launch** (remaining Areas 7, 14, 19–30) | Config |
| 10 | WP-37 | Additional Areas 31–34 | M |

---

### Tier 5: Scale & Ecosystem (Week 30+)

**Goal:** Cloud deployment, enterprise, marketplace.

| Order | WP | Item | Complexity |
|-------|-----|------|-----------|
| 1 | WP-34 | Cloud/SaaS Architecture (auth, multi-tenant, billing, SSO, RBAC) | XL |
| 2 | — | Module & skill marketplace | XL |
| 3 | — | Mobile companion app | XL |
| 4 | — | Multi-provider AI support (OpenAI, Mistral, local models) | L |
| 5 | — | Advanced analytics & benchmarking | L |
| 6 | — | API for third-party integrations | L |
| 7 | — | Partner programme (domain experts contribute modules) | — |

---

## PART 4: ARCHITECTURE DECISIONS

### Decision 1: Prompt assembly location → Server-only

All prompt assembly happens in `server/services/prompt-composer.ts`. Client sends structured config. Server builds prompt. Rationale: single source of truth, easier debugging, prompt content doesn't traverse the network unnecessarily.

### Decision 2: Area/module config on disk

```
server/areas/[area-id]/
├── area.json              # Area metadata (id, name, colour, icon, domain cluster)
├── area-context.md        # Layer 2 area prompt
└── modules/
    └── [module-id]/
        ├── module.json    # Config (guidedInputs, defaults, personas, skills)
        └── system-prompt.md  # Layer 3 module prompt
```

### Decision 3: Module config JSON schema

See Part 1 of the original alignment document for the full schema. Key fields: `id`, `name`, `icon`, `defaults` (thinking, creativity, model, outputFormats, transparencyLevel), `guidedInputs[]` (id, type, label, options, required, placeholder), `systemPrompt` path, `recommendedPersonas[]`, `recommendedSkills[]`.

### Decision 4: Guided input field types

```typescript
type FieldType = 'text' | 'textarea' | 'select' | 'multi-select' | 'chips' | 'boolean' | 'file' | 'number';
```

DynamicModule maps each type to a React component. Unknown types render as text fallback.

### Decision 5: PromptComposer assembly order

```
1. Creativity instruction (since no temperature with extended thinking)
2. ANTON Ground Work Prompt (_foundation.md)
3. Area Context (area-context.md)
4. Module System Prompt (system-prompt.md)
5. Output Format Instructions (from selected formats)
6. Persona Injection (user profile + selected expert personas)
7. Skills (attached skill prompts)
8. Transparency instruction (level 0/1/2)
---
User message includes: guided input values + free-text + knowledge source content
---
API params: model, thinking, max_tokens, stream, tools (web search if enabled)
```

Total overhead: ~2,700 tokens (per Deep Dive §1.11), leaving ~177K for documents in Opus 200K context.

### Decision 6: Database schema additions

```sql
-- New tables (add incrementally per WP)

CREATE TABLE IF NOT EXISTS user_profiles (
  id TEXT PRIMARY KEY DEFAULT 'default',
  name TEXT, role TEXT, company TEXT, industry TEXT,
  expertise TEXT, communication_preferences TEXT,
  context TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
  template_id TEXT, status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
  version TEXT DEFAULT '1.0.0', author TEXT,
  category TEXT, config TEXT DEFAULT '{}',
  prompt_path TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS session_skills (
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  skill_id TEXT REFERENCES skills(id),
  PRIMARY KEY (session_id, skill_id)
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY, session_id TEXT REFERENCES sessions(id),
  review_mode TEXT NOT NULL, overall_rating TEXT,
  content TEXT NOT NULL, reviewer_persona TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  version_number INTEGER NOT NULL, content TEXT NOT NULL,
  created_by TEXT, created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS custom_modules (
  id TEXT PRIMARY KEY, area_id TEXT, name TEXT NOT NULL,
  description TEXT, config TEXT NOT NULL, prompt TEXT NOT NULL,
  created_by TEXT, is_shared INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Modify existing tables
ALTER TABLE sessions ADD COLUMN project_id TEXT REFERENCES projects(id);
ALTER TABLE sessions ADD COLUMN area_id TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_area ON sessions(area_id);
CREATE INDEX IF NOT EXISTS idx_versions_entity ON versions(entity_type, entity_id);
```

---

## PART 5: AREA EXPANSION PLAN

### Wave 1 (Tier 2 — Weeks 7–12): 5 Areas

Areas chosen for proximity to FCP expertise and Advisense consulting practice:

| Area | Modules | Prompts Written? |
|------|---------|-----------------|
| Area 2: Legal & Regulatory | 10 | ✅ Full configs + prompts in Deep Dive |
| Area 3: Audit & Assurance | 10 | ✅ Full configs + prompts in Deep Dive |
| Area 4: Client Engagement & Consulting | 8 | ✅ Full configs + prompts in Deep Dive |
| Area 5: Banking & Financial Services | 10 | ✅ Full configs + prompts in Deep Dive |
| Area 8: Risk Management (Enterprise) | 8 | ✅ Full configs + prompts in Deep Dive |

**Total Wave 1: 46 modules.** All prompts already written — deployment is config copy once WP-09 is complete.

### Wave 2 (Tier 3 — Weeks 13–20): 10 Areas

| Area | Modules | Prompts Written? |
|------|---------|-----------------|
| Area 6: Investment & Asset Management | 8 | ✅ Deep Dive |
| Area 9: Cybersecurity & Information Security | 8 | ✅ Deep Dive |
| Area 10: Data & Analytics | 8 | ✅ Deep Dive |
| Area 11: Project Management & Delivery | 10 | ✅ Deep Dive |
| Area 12: Education & Teaching | 8 | ✅ Deep Dive |
| Area 13: Accounting & Tax | 7 | Partial (configs in Blueprint, prompts need writing) |
| Area 15: Branding & Creative | 8 | ✅ Deep Dive |
| Area 16: Software Engineering & Code | 10 | ✅ Deep Dive |
| Area 17: Strategy & Business Development | 8 | ✅ Deep Dive |
| Area 18: Environment, Sustainability & ESG | 8 | ✅ Deep Dive |

**Total Wave 2: 83 modules.**

### Wave 3 (Tier 4 — Weeks 21–30): 15 Areas

| Area | Modules | Prompts Written? |
|------|---------|-----------------|
| Area 7: Insurance | 7 | Configs in Blueprint, prompts need writing |
| Area 14: Human Resources & People | 8 | Configs in Blueprint |
| Area 19: Procurement & Supply Chain | 6 | Configs in Blueprint |
| Area 20: Operations & Process Improvement | 6 | Configs in Blueprint |
| Area 21: Sales & Customer Success | 6 | Configs in Blueprint |
| Area 22: Communication & Stakeholder Mgmt | 7 | Configs in Blueprint |
| Area 23: Personal Finance & Wealth | 6 | Configs in Blueprint |
| Area 24: Real Estate & Property | 5 | Configs in Blueprint |
| Area 25: Healthcare & Life Sciences | 6 | Configs in Blueprint |
| Area 26: Nonprofit & Social Impact | 6 | Configs in Blueprint |
| Area 27: Government & Public Sector | 6 | Configs in Blueprint |
| Area 28: Entrepreneurship & Startups | 6 | Configs in Blueprint |
| Area 29: Academic & Research | 7 | Configs in Blueprint |
| Area 30: Personal Development & Career | 7 | Configs in Blueprint |
| Areas 31–34 (new) | ~24 | Need full authoring |

**Total Wave 3: ~119 modules.**

### Grand Total: ~260 modules across 34 areas

---

## PART 6: CONTENT ASSETS ALREADY WRITTEN

These are ready to deploy once the architecture supports them. This is a massive head start.

| Asset | Location | Status | Deploy When |
|-------|----------|--------|-------------|
| ANTON Ground Work Prompt (~700 tokens) | Deep Dive §1.3 | ✅ Written | WP-01 |
| Creativity instructions (strict/balanced/creative) | Deep Dive §1.2 | ✅ Written | WP-01 |
| Transparency Level 1 prompt template | Deep Dive §1.10 | ✅ Written | WP-10 |
| Transparency Level 2 prompt template | Deep Dive §1.10 | ✅ Written | WP-10 |
| Multi-persona integration instruction | Deep Dive §1.6 | ✅ Written | WP-12 |
| Complete prompt assembly example with token estimates | Deep Dive §1.11 | ✅ Written | WP-01 (reference) |
| Swedish Regulatory Language skill prompt | Deep Dive §1.7 | ✅ Written | WP-17 |
| Board-Ready Communication skill prompt | Deep Dive §1.7 | ✅ Written | WP-17 |
| Module prompt template (standard structure) | Deep Dive §1.4 | ✅ Written | WP-09 (template) |
| 12 FCP module prompts | server/prompts/*.md | ✅ Written | WP-01 (fix loading) |
| Area 2: Legal — full module configs + system prompts | Deep Dive Part 2 | ✅ Written | Wave 1 |
| Area 3: Audit — full module configs + system prompts | Deep Dive Part 2 | ✅ Written | Wave 1 |
| Area 4: Client Engagement — full configs + prompts | Deep Dive Part 2 | ✅ Written | Wave 1 |
| Area 5: Banking — full configs + prompts | Deep Dive Part 2 | ✅ Written | Wave 1 |
| Area 6: Investment — full configs + prompts | Deep Dive Part 2 | ✅ Written | Wave 2 |
| Area 8: Risk Management — full configs + prompts | Deep Dive Part 2 | ✅ Written | Wave 1 |
| Area 9: Cybersecurity — full configs + prompts | Deep Dive Part 2 | ✅ Written | Wave 2 |
| Area 10: Data & Analytics — full configs + prompts | Deep Dive Part 2 | ✅ Written | Wave 2 |
| Area 11: Project Management — full configs + prompts | Deep Dive Part 2 | ✅ Written | Wave 2 |
| Area 12: Education — full configs + prompts | Deep Dive Part 2 | ✅ Written | Wave 2 |
| Area 15: Branding — full configs + prompts | Deep Dive Part 2 | ✅ Written | Wave 2 |
| Area 16: Software Engineering — full configs + prompts | Deep Dive Part 2 | ✅ Written | Wave 2 |
| Area 17: Strategy — full configs + prompts | Deep Dive Part 2 | ✅ Written | Wave 2 |
| Area 18: ESG — full configs + prompts | Deep Dive Part 2 | ✅ Written | Wave 2 |
| Areas 7, 13, 14, 19–30 module configs (no prompts) | Blueprint §4 | ✅ Configs only | Wave 3 |
| 12 named persona definitions (JSON) | Blueprint §5 | ✅ Written | WP-12 |
| 12 skill pack descriptions | Blueprint §10 | ✅ Defined | WP-17 |
| 10 pre-built workflow templates | Codebase | ✅ Working | Already deployed |
| 20 persona use case validations | Persona Validation | ✅ Written | Reference doc |
| Whitepaper (public-facing) | Whitepaper | ✅ Written | Launch day |

---

## COMPLETENESS CHECKLIST

Every item from every source document is accounted for:

| Source | Total Items Identified | Covered in Roadmap | Missing |
|--------|----------------------|-------------------|---------|
| Whitepaper (14 sections, 12 platform features) | All features | ✅ All 12 features mapped | 0 |
| Blueprint (14 sections, 30 areas, 235 modules) | All features + all areas | ✅ All features mapped, all areas in expansion plan | 0 |
| Deep Dive (prompt architecture + 15 area specs) | All prompts + specs | ✅ All listed as deploy-ready assets | 0 |
| Persona Validation (20 personas, gaps, new features) | All gaps + new features | ✅ All interaction modes, smart features, integrations, new areas | 0 |
| Codebase State (24 known issues, 5 critical bugs) | All issues | ✅ All bugs + tech debt in WP-01 through WP-03 | 0 |

**Total work packages: 37**  
**Total line items tracked: 120**  
**Total modules planned: ~260 across 34 areas**  
**Content assets ready to deploy: 26**

---

> *"The hardest work — the prompt design, the architecture thinking, the module content, the market validation — is already done. What remains is engineering execution. And that's the part AI is really good at helping with."*
>
> — openEXPERT by ANTON, February 2026

---

*Document version: 2.0 — Definitive Edition*  
*Created: February 17, 2026*  
*Project: openEXPERT by ANTON*  
*Author: Daniel Bardun / FutureChain AB*
