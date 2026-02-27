# openEXPERT — Full Implementation Sprint Plan

**Version:** 1.0
**Date:** 2026-02-18
**Author:** Daniel Bardun & Claude
**Purpose:** Complete, prioritised, executable plan to finish openEXPERT. Reference this at the start of every sprint.
**Source documents:** openEXPERT_Whitepaper.md, openEXPERT_Master_Plan.md, openEXPERT_Complete_Roadmap_v2.md, openEXPERT_ANTON_Blueprint.md, COMPETITIVE_LANDSCAPE_AND_GAPS.md

---

## The Goal

Build the best open-source AI expert platform in the world — better than Harvey.ai for breadth, better than LibreChat/Dify for domain depth, deployable by anyone from a solo consultant on their laptop to a 100-person compliance team at a Nordic bank.

The vision from the Whitepaper is clear: ANTON is the "brilliant, experienced colleague" who has been trained on how work actually happens — not just what the regulation says. The 7-layer prompt system, the expert personas, the guided outputs, the knowledge source modes — all of it serves one goal: professional-grade output accessible to anyone.

---

## Current State Baseline (2026-02-18)

**Core Engine:** Solid. Streaming, session management, multi-LLM adapters, 29 areas, 145+ modules, 7-layer prompt composer.
**Toggles:** Writing tone, emoji, structured reasoning, precision level, model selector — all working.
**Exchange:** .anton export/import with 5-step security validation.
**Audit:** Structured audit log, human review workflow (Draft→Reviewed→Approved).
**Pages:** Home, ModulePage, Brief Me, Guide Me, Batch Create, Share, Exchange, Audit Log, BuildYourOwnModule, Skills, Projects, Workflows, Settings.
**Exports:** docx, xlsx, pdf, pptx — real implementations in place.

**What's NOT done yet (prioritised):**
1. RAG pipeline (Phase 4 of Excel plan) — 0%
2. Authentication + RBAC — 10% (foundation only)
3. Persona depth (named characters, multi-select, thinking styles) — 0%
4. Communication & Branding Hub — 0%
5. Native Reasoning Boost toggle — 0%
6. Domain dashboards per area — 0%
7. "This Is Me" user profile — 0%
8. i18n string extraction + language selector — 10% (library installed)
9. Smart features (model routing, task estimation) — 0%
10. openEXPERT branding (replace Advisense) — 20%
11. GitHub + CI/CD + launch prep — 0%

---

## Sprint Overview

| Sprint | Name | Focus | Agent Count | Estimated Value |
|--------|------|-------|-------------|-----------------|
| **S1** | Solidify & Polish | Fix session persistence, i18n setup, Native Reasoning Boost, Context Budget, "This Is Me" profile | 3 parallel | Removes all known bugs; strengthens foundation |
| **S2** | Persona Depth & Communication Hub | Named personas, multi-select, thinking styles, audience proxy, Communication Hub, "Explain Differently" | 3 parallel | #1 differentiator vs. all competitors |
| **S3** | RAG Pipeline | Vector DB, chunking, embeddings, semantic search, Knowledge Source Mode 5 | 2 sequential | Transforms enterprise capability |
| **S4** | Security & Multi-User | Local auth, session isolation, RBAC, budget caps, prompt caching | 3 parallel | Enables team deployment |
| **S5** | Dashboards & Analytics | Domain dashboards, executive dashboard, ROI tracker, quality indicators, smart model routing | 2 parallel | Completes the platform experience |
| **S6** | Interaction Modes & Integrations | Fill This Form, Sounding Board, Challenge This, EUR-Lex API, automatic workflow execution | 2 parallel | Widens user base dramatically |
| **S7** | Launch Prep | openEXPERT branding, whitepaper finalize, GitHub CI/CD, README, starter packs, pen test prep | 3 parallel | Gets to public release |

---

## SPRINT 1 — Solidify & Polish

**Goal:** Fix known bugs and complete the core engine. After this sprint, everything that exists should work reliably end-to-end.

### S1-A: Session Persistence Fix + Context Budget

**Agent: `engine-agent`**

**Files to fix:**
- `src/stores/useSessionStore.ts` — verify `saveMessages()` is called after every send
- `server/routes/sessions.ts` — verify message CRUD endpoints work correctly
- `server/services/prompt-composer.ts` — wire `token-estimator.ts` before send; enforce MAX_CONTEXT_TOKENS
- `src/pages/ModulePage.tsx` — show live token count as user types; warn at 80% of model's context window
- Context budget panel: show breakdown (system prompt: Xk, documents: Xk, history: Xk, message: Xk)

**Deliverable:** Resume any previous session; see token budget live; get warning before hitting limits.

### S1-B: Native Reasoning Boost Toggle (Toggle 5)

**Agent: `toggles-agent`**

This is the last of the 6 toggles from the Excel plan. Most impactful for users who want Claude's full extended thinking capability exposed with one click.

**Files:**
- `src/components/shared/SessionTogglesPanel.tsx` — add "Native Reasoning Boost" toggle at bottom of Reasoning section
  - When Off: prompt-based structured reasoning only (current state)
  - When On: activate Claude extended thinking (adaptive + effort=max) + show cost warning modal
  - Cost warning: "Native Reasoning uses Claude's full extended thinking. Estimated +3-10x cost per query. Continue?"
- `src/stores/useSessionStore.ts` — add `nativeReasoningEnabled: boolean`, `setNativeReasoningEnabled()`
- `server/routes/claude.ts` — when `nativeReasoningEnabled=true`, pass `thinking: { type: 'adaptive' }, effort: 'max'` to Anthropic; for non-Claude providers show "not available" toast
- `server/types/modelAdapter.ts` — add `supportsNativeReasoning: boolean` to `ModelConfig`, set true for claude-opus-4-6 and claude-sonnet-4-5-20250929 only

**Deliverable:** One toggle activates Claude's full reasoning power with clear cost feedback.

### S1-C: "This Is Me" User Profile

**Agent: `profile-agent`**

**What it does (from Blueprint):** User fills in their professional identity once. This gets injected into every session as Layer 0 of the prompt, personalising all output to their context.

**Fields:**
- Name (used in outputs)
- Role/title (e.g., "Chief Compliance Officer")
- Organisation (e.g., "Nordea Bank")
- Industry/sector
- Country/jurisdiction
- Experience level (Junior / Mid / Senior / Expert)
- Primary language for output (English / Swedish / Finnish / Danish / Norwegian)
- Current focus areas (multi-select chips from AREAS)
- Organisation size (Solo / SME / Mid-market / Enterprise)
- Key documents upload (org chart, brand guide, style guide — stored as profile docs)

**Layer 0 injection text** (assembled from profile):
```
## YOUR PROFILE
You are assisting: [Name], [Role] at [Organisation], a [Size] organisation in [Industry] operating in [Jurisdiction].
Experience level: [Level]. Output language: [Language].
Current focus areas: [Areas].
[If documents uploaded]: Reference the attached organisational context documents when relevant.
```

**Files:**
- `src/pages/Settings.tsx` — add "My Profile" tab at top (currently has General, API Keys, Appearance, Notifications)
- `server/routes/profile.ts` — already exists, extend to handle profile doc uploads
- `server/services/prompt-composer.ts` — add Layer 0: loadUserProfile() before Layer 1
- `src/components/shared/ProfilePanel.tsx` — mini profile summary shown in Sidebar above nav (avatar initial, name, role)

**Deliverable:** Fill profile once → every session knows who you are → personalised output.

### S1-D: i18n Infrastructure + Language Selector

**Part of `engine-agent` or standalone:**

**What:** Extract all static UI strings from the 5 most-used components. Create en.json and sv.json. Add language dropdown in Settings → Appearance.

**Scope for this sprint:** Only Sidebar, Header, Dashboard, Settings, and ModulePage labels. Module content stays English.

**Files:**
- `src/i18n/locales/en.json` — all English UI strings
- `src/i18n/locales/sv.json` — Swedish translations (auto-generate with Claude, human-review later)
- `src/i18n/index.ts` — already set up from previous sprint, just needs strings loaded
- `src/components/layout/Sidebar.tsx`, `Header.tsx`, `src/pages/Dashboard.tsx`, `Settings.tsx` — replace hardcoded strings with `t('key')` calls

---

## SPRINT 2 — Persona Depth & Communication Hub

**Goal:** The deepest competitive moat. No competitor has a structured, multi-layered persona system. This sprint completes what the Blueprint defines and adds features no other platform has.

### S2-A: Named Character Personas + Multi-Select

**Agent: `persona-agent`**

From Blueprint §5, the persona system has 4 categories:

**Category 1: Domain Experts** (already have 9, expand to cover all 30 areas)
- Already built. Need to add area-specific personas for new areas.

**Category 2: Named Characters** (NEW — biggest differentiator)
These are "colleagues" with distinct communication styles and perspectives:

| Name | Role | Personality | Specialty |
|------|------|-------------|-----------|
| Helena | Senior Partner | Direct, no-fluff, board-room tested | Governance, strategy |
| Erik | Regulatory specialist | Forensically precise, citation-heavy | Regulatory interpretation |
| Sofia | Change management lead | People-first, implementation-focused | Adoption, training |
| Marcus | Data architect | Technical, structured, system-thinker | Data, technology |
| Petra | Communications director | Accessible, story-driven | Stakeholder comms |
| Lars | Risk manager | Conservative, scenario-focused | Risk assessment |
| Ana | External auditor | Sceptical, evidence-demanding | Audit, assurance |
| David | Startup advisor | Fast, pragmatic, opportunity-focused | Strategy, innovation |

**Category 3: Thinking Styles** (NEW)
- Skeptic: "Challenge every assumption. What could go wrong?"
- Optimist: "Find the opportunity in this challenge."
- Devil's Advocate: "Build the strongest counter-argument."
- Simplifier: "Explain this as if to a smart non-specialist."
- Synthesiser: "Find the pattern across all the evidence."

**Category 4: Audience Proxies** (NEW)
- Board Member: "How does this land with a board member who has 5 minutes?"
- Regulator: "How would a supervisor read this?"
- Front-line staff: "Is this understandable by someone on their first week?"
- Journalist: "What's the headline here? What's the risk?"

**Multi-select implementation:**
- Persona selector becomes a multi-panel (max 3 personas at once)
- Personas can be from different categories (e.g., Domain Expert + Thinking Style + Audience Proxy)
- Combined instruction: "You have three expert perspectives contributing to this analysis: [A], [B], and [C]. Integrate their viewpoints..."

**Files:**
- `src/lib/constants.ts` — add `NAMED_PERSONAS`, `THINKING_STYLE_PERSONAS`, `AUDIENCE_PROXY_PERSONAS` arrays
- `src/components/shared/PersonaPanel.tsx` — rewrite to multi-category tabs + multi-select chips
- `server/services/prompt-composer.ts` Layer 4 — handle multi-persona injection
- `src/pages/ModulePage.tsx` — update PersonaPanel wiring

### S2-B: Communication & Branding Hub

**Agent: `comms-agent`**

From Blueprint §8: A platform-level feature that transforms any output for different audiences and channels.

**What it does:**
- **Audience Selector** — who will read this? Board / Regulator / Customer / Employee / Media / Investor / Public / Technical team
- **Channel Selector** — how will it be delivered? Email / Presentation / Report / Intranet / Social media / Press release / Meeting briefing
- **Tone Calibration** — slider from "Highly technical" to "Plain language" + slider from "Formal" to "Conversational" (different from Writing Tone toggle — these are output-level, not session-level)
- **Brand Voice Upload** — upload company brand guide → Claude follows it for comms output
- **"Explain This Differently" button** — appears in ExportBar after any output; one click → reframes the output for a different audience without re-running the analysis
- **"Message Testing"** — run any comms output through 3 audience personas to check if landing

**Files:**
- `src/components/shared/CommunicationsPanel.tsx` — collapsible panel below Output Formats
- `src/pages/ModulePage.tsx` — add CommunicationsPanel to config sidebar
- `src/components/shared/ExportBar.tsx` — add "Explain Differently" button (opens audience picker → triggers reframe call)
- `server/routes/claude.ts` — add `POST /api/claude/reframe` endpoint (takes existing output + new audience/channel → returns reframed version)
- `server/services/prompt-composer.ts` Layer 1b — communications layer injection

### S2-C: Content Memory + Output Language Selector

**Agent: `comms-agent` (same agent)**

**Content Memory:** After 10+ sessions with a user, ANTON starts learning their preferences (from profile + session patterns):
- Preferred output length (brief vs. detailed)
- Preferred writing style
- Frequently used areas/modules
- Commonly applied personas

Implemented as a simple `user_preferences` JSON blob in the profile table, updated after each session.

**Output Language Selector:** Independent from UI language.
- Dropdown in ModulePage config panel: English / Swedish / Finnish / Danish / Norwegian / German / French / Polish / Czech / Spanish
- Injected into system prompt: "Respond entirely in [language]. Use professional terminology appropriate for that language's legal and business context."
- Stored per session.

---

## SPRINT 3 — RAG Pipeline

**Goal:** Handle enterprises with hundreds of documents. This is the most technically complex sprint but also the most transformative for power users.

### S3-A: Vector Database + Chunking Engine

**Agent: `rag-core-agent`**

**Decision: SQLite-vec** (keeps everything in one SQLite database, no external service dependency, perfectly aligned with our "local-first" architecture)

**What to build:**
1. Install `sqlite-vec` as SQLite extension OR use `@xenova/transformers` for embeddings + raw SQLite for vector storage
2. Document chunking service:
   - Chunk PDFs/DOCX/TXT into ~1000-token segments with 200-token overlap
   - Preserve document structure (section headers become chunk metadata)
   - Store: chunk_id, document_id, document_name, chunk_index, text, embedding, token_count
3. Embedding generation:
   - Primary: Use Claude's API for embeddings (`text-embedding-3-small` fallback via OpenAI)
   - Preferred: Local model via `@xenova/transformers` (sentence-transformers/all-MiniLM-L6-v2) — no API cost, works offline
4. Vector search: cosine similarity across stored embeddings, return top-k chunks

**DB schema additions:**
```sql
CREATE TABLE document_embeddings (
  id TEXT PRIMARY KEY,
  folder_path TEXT NOT NULL,
  document_name TEXT NOT NULL,
  chunk_index INTEGER,
  chunk_text TEXT NOT NULL,
  embedding BLOB,  -- float32 array, serialised
  token_count INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE indexed_folders (
  path TEXT PRIMARY KEY,
  last_indexed DATETIME,
  document_count INTEGER,
  chunk_count INTEGER,
  embedding_model TEXT
);
```

**Files:**
- `server/services/rag/chunker.ts` — document → chunks
- `server/services/rag/embedder.ts` — text → embedding vector (local model preferred)
- `server/services/rag/vectorStore.ts` — store/retrieve embeddings in SQLite
- `server/services/rag/retriever.ts` — semantic search: query → top-k relevant chunks
- `server/routes/rag.ts` — REST endpoints for indexing and searching
  - `POST /api/rag/index` — index a folder
  - `GET /api/rag/index/status` — indexing progress
  - `POST /api/rag/search` — semantic search (used internally)

### S3-B: Knowledge Source Mode 5 UI + Integration

**Agent: `rag-ui-agent`**

**UI: "Indexed Knowledge Base" mode** (Knowledge Source Panel, 5th mode after Combined):

```
┌─────────────────────────────────────────────────────────────┐
│ ☑ 🔍 Indexed Knowledge Base                               │
│   Semantic search across your indexed document library.   │
│   Finds the most relevant sections, not whole documents.  │
│                                                           │
│   📚 My Regulations/  — 847 chunks, last indexed 2h ago  │
│   📁 Client/Nordea/   — 234 chunks, indexed 3 days ago   │
│                                                           │
│   Retrieve: [● Top 10 chunks] [○ Top 20] [○ Top 30]      │
│   Min. relevance: [████░░] 65%                            │
│                                                           │
│   [+ Index New Folder]   [↻ Reindex]                      │
│                                                           │
│   Show retrieved chunks in context panel ☑               │
└─────────────────────────────────────────────────────────────┘
```

**Integration with prompt-composer.ts:**
- Mode 5 enabled → before sending, run retriever.search(userMessage, k=10)
- Retrieved chunks injected as a dedicated section: `## RETRIEVED RELEVANT PASSAGES\n[chunks with source attribution]`
- Token estimate includes retrieved chunks

**Files:**
- `src/components/shared/KnowledgeSourcePanel.tsx` — add Mode 5 section
- `server/services/knowledge-resolver.ts` — add `ragMode` handling
- `src/components/shared/ContextPanel.tsx` — show retrieved chunks with document/page attribution

---

## SPRINT 4 — Security & Multi-User

**Goal:** Deploy openEXPERT to a team of 10 compliance officers at a bank. Everyone has their own account, their own sessions, and the admin has full oversight.

### S4-A: Authentication System

**Agent: `auth-agent`**

**Architecture:** Local-first. No cloud auth. Users and passwords stored in SQLite (bcrypt hashed). JWT tokens for session management. Simple but secure.

**Solo mode** (DEPLOYMENT_MODE=solo): No login. Skip auth entirely. Already works.

**Team mode** (DEPLOYMENT_MODE=team):
- Login screen on first load
- JWT stored in localStorage
- All API calls include Authorization header
- Default admin user created on first launch: admin / [auto-generated password shown once]

**User roles:**
- `admin` — full access, user management, budget management, audit log, all settings
- `analyst` — full access to all modules/areas, own sessions/projects, no admin settings
- `viewer` — read-only, can view sessions/outputs/projects, cannot send API requests

**Files:**
- `server/db/init.ts` — add `users` table, `user_sessions` table
- `server/middleware/auth.ts` — JWT verification middleware
- `server/routes/auth.ts` — POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me
- `src/pages/LoginPage.tsx` — clean login form (no signup — admin creates users)
- `src/stores/useAuthStore.ts` — auth state (user, token, role)
- `src/App.tsx` — wrap routes in auth check when DEPLOYMENT_MODE=team
- All existing routes in server — add auth middleware when team mode

### S4-B: Session Isolation + Budget Caps

**Agent: `auth-agent` (same agent)**

**Session isolation:** In team mode, every session has a `user_id`. Users can only see their own sessions (unless admin).

**Budget cap system:**
- Admin can set per-user monthly token budget (unlimited by default)
- Track: tokens used this month per user in `user_monthly_usage` table
- Before each API call: check if user is within budget
- If at 80%: warning notification in ModulePage
- If at 100%: API calls blocked, user shown "Monthly budget reached — contact admin"
- Admin dashboard shows usage per user

**Files:**
- `server/db/init.ts` — add `user_monthly_usage` table
- `server/routes/claude.ts` — add budget check before API call (team mode only)
- `src/pages/Settings.tsx` — add "User Management" tab (admin only): list users, create user, set budgets, reset passwords
- `server/routes/admin.ts` — user management CRUD, budget management

### S4-C: Prompt Caching + Security Hardening

**Agent: `security-agent`**

**Prompt caching for Claude:**
- System prompts are assembled the same way for the same module + settings combination
- Enable Anthropic's prompt caching by adding `"cache_control": {"type": "ephemeral"}` to the static system prompt portions
- This reduces API cost by up to 90% for repeated system prompts
- Implementation: in prompt-composer.ts, mark Layer 0-4 (static) with cache_control; Layer 5-7 (dynamic per session) not cached
- Estimated savings: ~60-70% cost reduction for power users running same module repeatedly

**Security hardening:**
- `npm audit` — fix all high/critical vulnerabilities
- Input sanitisation: ensure all user-provided strings are sanitised before DB insertion
- Path traversal: double-check folder path validation (prevent `../../` attacks)
- Rate limiting: tighten per-IP limits in team mode
- CSP headers: configure helmet CSP for production
- Dependency license check: ensure no GPL-incompatible licenses in production deps
- Create `SECURITY.md` with responsible disclosure policy

---

## SPRINT 5 — Dashboards, Analytics & Smart Features

**Goal:** Transform openEXPERT from a module runner into a professional workspace with real-time insights.

### S5-A: Domain Dashboards Per Area

**Agent: `dashboard-agent`**

From Blueprint §6: Each area has its own dashboard panel visible when you click the area header in Sidebar.

**Structure of a Domain Dashboard:**
- **Regulatory Feed** — 5 most recent regulatory developments in this area (web search on load, cached 4h)
- **Benchmark Indicators** — key metrics for this domain (e.g., for FCP: EU AMLR implementation timeline; for HR: hiring trend; for Finance: key interest rates)
- **Your Activity** — sessions, modules used, outputs created this month in this area
- **Recommended Modules** — "Based on your recent work, you might need..."
- **Quick Start** — most popular module in this area

**Implementation approach:**
- Domain dashboard is a collapsible panel at the top of each area's module list
- Regulatory feed: cached `GET /api/areas/:areaId/news` → uses Claude web search to generate brief
- Data cached in SQLite `area_cache` table (refresh on demand or TTL)

**Files:**
- `src/components/layout/AreaDashboard.tsx` — the domain dashboard panel
- `src/components/layout/Sidebar.tsx` — render AreaDashboard when area is expanded
- `server/routes/areas.ts` — `GET /api/areas/:id/news` endpoint

### S5-B: Executive Dashboard + ROI Tracker

**Agent: `dashboard-agent` (same)**

**Executive Dashboard** (main Home page evolution):
- Total sessions this week/month
- Total tokens used + estimated cost
- Most-used areas + modules
- Recent outputs (with quick-open)
- Productivity streak (days active)
- "What's new" for updated modules

**ROI Tracker:**
- User sets their hourly rate (or use default: €250/hour consulting rate)
- Each session records: start time, end time
- System estimates: without openEXPERT, this task would have taken X hours (based on module type + output length)
- Running total: "openEXPERT has saved you ~47 hours this month (estimated value: €11,750)"
- Shown on Home dashboard and in a dedicated ROI tab in Settings

### S5-C: Smart Model Routing + Quality Indicators

**Agent: `smart-agent`**

**Smart Model Routing:** Before running a query, analyse it and suggest a cheaper model if appropriate:
- Short questions / quick lookups → suggest Haiku
- Standard analysis → suggest Sonnet (default)
- Complex multi-document analysis with structured reasoning → suggest Opus
- Show as a dismissable banner: "This looks like a quick question. Switch to Haiku (€€€ → €) and save ~90%? [Keep Opus] [Switch to Haiku]"

**Quality Indicators:** After any output is generated, run a background quality check:
- Word count, section count
- Regulatory citation count (if FCP/Legal module)
- Estimated reading time
- Completeness score (how many of the required sections from the output format are present)
- Show as a compact row below the output: "12 sections · 3,400 words · 12 min read · 9/10 required sections covered · 4 regulatory citations"

**Task Estimation panel:** Before running, show:
- Estimated tokens (system + history + message)
- Estimated cost (€X.XX)
- Estimated time (X–X seconds based on model)
- Recommended thinking level based on query complexity

---

## SPRINT 6 — Interaction Modes & External Integrations

**Goal:** Widen the user base by adding modes for non-standard use cases and connect to external data sources.

### S6-A: Additional Interaction Modes

**Agent: `modes-agent`**

**"Fill This Form" mode** (`/fill`) — Upload or paste any form/questionnaire → ANTON fills it field by field with guidance, citations, and flags uncertain fields.

**"Sounding Board" mode** — Conversational, Socratic mode. ANTON asks clarifying questions rather than jumping to conclusions. Good for: early-stage thinking, complex dilemmas, exploring options.

**"Challenge This" mode** — User pastes any document, plan, or argument → ANTON plays devil's advocate: strongest counter-arguments, weakest assumptions, regulatory risks, things the author didn't consider.

**"Dual Interpretation" mode** — Upload a legal/regulatory text → ANTON interprets it from two angles simultaneously: "How would a regulator read this?" vs "How would a regulated entity argue the opposite?"

**Automatic Workflow Execution:**
- WorkflowBuilder already has manual step-by-step execution
- Add "Run All" / pipeline mode: steps execute automatically, output of each step fed as input to next
- With approval gate option: pause between steps for human review

**Files:**
- `src/pages/FillFormPage.tsx` + route `/fill`
- `src/pages/SoundingBoardPage.tsx` + route `/sounding-board`
- Sidebar: add both under "Modes" section
- `src/pages/WorkflowBuilder.tsx` — add "Run All" button + pipeline execution logic
- `server/routes/claude.ts` — no new endpoints needed; modes are client-side orchestration

### S6-B: EUR-Lex API + External Data Integrations

**Agent: `integrations-agent`**

**EUR-Lex API** (free, no auth required):
- URL: `https://eur-lex.europa.eu/api/`
- Use case: When user mentions a regulation by number (AMLR, DORA, MiCA, etc.), auto-fetch the official text
- Integration point: Knowledge Source Panel Mode 2 (Online Links) — add "Auto-fetch from EUR-Lex" button
- Also: in FCP area modules, show "Quick load: AMLR 2024/1624" pre-populated link

**MCP (Model Context Protocol) Investigation:**
- openEXPERT should be an MCP server — exposing its module system as MCP tools so external clients (Claude Desktop, etc.) can call openEXPERT modules
- Also investigate MCP client — connect to external MCP servers (GitHub, databases, etc.) as additional knowledge sources
- Create `server/mcp/` directory, implement basic MCP server spec
- This is investigation + prototype, not full production implementation

---

## SPRINT 7 — Launch Prep

**Goal:** Everything needed for a clean, professional public release on GitHub.

### S7-A: openEXPERT Branding

**Agent: `brand-agent`**

- Replace all "Advisense FCP Workbench" / "FCP Workbench" references with "openEXPERT by ANTON"
- Create openEXPERT logo (SVG) — clean, modern, uses adv-teal colour
- Update `public/advisense-logo.svg` → `public/openexpert-logo.svg`
- Update `package.json` name/description
- Update `CLAUDE.md` project identity section
- Update `README.md` with correct project name, logo, and badges
- Update `vite.config.ts` title
- Update all page titles (HTML `<title>` tags)
- Dark/light mode proper — ensure light mode toggle in Settings actually works
- Mobile-responsive: add responsive breakpoints so it's usable on tablet

### S7-B: GitHub + CI/CD

**Agent: `devops-agent`**

- `LICENSE` file (MIT)
- `.github/workflows/ci.yml` — TypeScript check + build on PR
- `.github/ISSUE_TEMPLATE/` — bug report, feature request, module submission templates
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/CONTRIBUTING.md`
- `.env.example` — complete and accurate
- `docker-compose.yml` — verify working end-to-end
- Add `CHANGELOG.md` with v1.0.0 entry
- Add GitHub badges to README (CI status, license, version)

### S7-C: Documentation + Security Report

**Agent: `docs-agent`**

- Finalise `openEXPERT_Whitepaper.md` — fill any TODO sections, verify all claims match implementation
- Create `SECURITY.md` — security architecture overview, responsible disclosure
- Create `docs/deployment.md` — local, Docker, and team deployment guides
- Create `docs/adding-modules.md` — step-by-step guide: how to add a new area/module (15-minute process)
- Create `docs/api-reference.md` — all REST endpoints
- Update `README.md` — comprehensive: quick start, features, architecture diagram, contributing
- Run `npm audit` — fix all high/critical issues, document medium ones

### S7-D: Performance + Final Polish

**Agent: `qa-agent`**

- Load testing: simulate 10 concurrent users; measure response times
- Bundle size analysis: `vite build --report`; optimise if >5MB
- Database performance: add indexes on heavily-queried columns (sessions.module_id, audit_log.created_at, etc.)
- First-load optimisation: lazy-load heavy pages (Audit Log, Exchange)
- Final TypeScript strict mode check — upgrade to `"strict": true` if not already
- Final end-to-end smoke test: follow the "Getting Started" guide from scratch on a clean machine
- Update `openEXPERT_Master_Plan.md` and this document with final completion status

---

## Dependencies & Critical Path

```
S1 (Foundation fixes)
  │
  ├─→ S2 (Personas) ─────────────────────────┐
  │                                          │
  ├─→ S3 (RAG) ──────────────────────────────┤
  │                                          │
  ├─→ S4 (Auth/Security) ────────────────────┤
  │                                          ↓
  ├─→ S5 (Dashboards) ────────────── S7 (Launch Prep)
  │
  └─→ S6 (Modes/Integrations) ───────────────┘
```

S1 must complete first (fixes the foundation).
S2, S3, S4, S5, S6 can run in parallel (different file sets).
S7 waits for all others.

---

## Definitions of Done

Each sprint is complete when:
1. `npx tsc --noEmit` — 0 errors
2. `npx tsc -p tsconfig.node.json --noEmit` — 0 errors
3. App starts cleanly (`pnpm run dev`)
4. All new routes navigable without error
5. All new features smoke-tested (described in sprint deliverables above)
6. `openEXPERT_Master_Plan.md` progress tracker updated

---

## Progress Log

| Sprint | Started | Completed | Lead Dev | Notes |
|--------|---------|-----------|----------|-------|
| S1 | 2026-02-18 | 2026-02-18 | Daniel/Claude | ✅ All 4 items complete. 0 TS errors. Context budget bar, Native Reasoning Boost (Toggle 6), This Is Me profile (Layer 0), i18n EN+SV + language selector. |
| S2 | 2026-02-18 | 2026-02-18 | Daniel/Claude | ✅ 36 personas (4 categories, max-3 enforced), CommunicationsPanel (audience+channel+language), Explain Differently button, output language → prompt Layer 1c/1d. 0 TS errors. |
| S3 | 2026-02-18 | 2026-02-18 | Daniel/Claude | ✅ BM25 RAG pipeline: chunker, indexer, retriever, REST API (5 endpoints), Knowledge Source Mode 5 UI (IndexedFoldersList, topK slider), knowledge-resolver.ts Mode 5 injection. 0 TS errors. |
| S4 | 2026-02-18 | 2026-02-18 | Daniel/Claude | ✅ Full auth system: bcrypt+JWT, users/sessions/usage tables, auth middleware, login page, RBAC (admin/analyst/viewer), budget caps (402 at 100%, warning at 80%), Settings Team tab, SECURITY.md, path traversal fixes. 0 TS errors. |
| S5 | 2026-02-18 | 2026-02-18 | Daniel/Claude | ✅ AreaDashboard (domain panels in sidebar), ROI tracker (hourly rate × sessions × 2.5h/session), sessions/stats enhanced (week/month/recent), SmartModelBanner (Opus→Haiku/Sonnet suggestion), QualityIndicatorBar (word count, read time, citations, completeness). 0 TS errors. |
| S6 | 2026-02-18 | 2026-02-18 | Daniel/Claude | ✅ FillFormPage, ChallengeThisPage, DualInterpretationPage (+routes+nav), EUR-Lex API (14 regulation shortcuts, quick-load buttons in KnowledgeSourcePanel), Workflow Run All. 0 TS errors. |
| S7 | 2026-02-18 | 2026-02-18 | Daniel/Claude | ✅ LICENSE (MIT), CHANGELOG.md, .github/workflows/ci.yml, issue templates (bug/feature/module), CONTRIBUTING.md, PULL_REQUEST_TEMPLATE.md, docs/deployment.md, docs/adding-modules.md, .env.example updated. Lazy loading (748kB→254kB main bundle). DB performance indexes. SECURITY.md. |

---

*Reference this document at the start of every sprint. Update the Progress Log when sprints complete.*
*Source truth: openEXPERT_Whitepaper.md + openEXPERT_Master_Plan.md + openEXPERT_ANTON_Blueprint.md*
