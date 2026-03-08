# ANTON FCP Workbench — Strategic Improvements: Complete Implementation Statement

**Branch:** `feature/strategic-improvements`
**Date:** March 7, 2026
**Status:** All planned improvements complete. Several areas exceeded original spec scope.

This document provides a full technical account of everything built and improved across this development cycle — for review, handover, and onboarding purposes.

---

## Part 1: Six Strategic Improvements (ANTON_Strategic_Improvements_ClaudeCode_Spec.md)

These six improvements were designed to close the gap between ANTON and OpenAI's Stateful Runtime, positioning ANTON as a proactive professional intelligence layer rather than a reactive chat tool.

### Improvement 1: Session Resume — First-Class Context Reconstruction

**What it does:** When a user returns to a session after hours or days, ANTON reconstructs the full working context — what was accomplished, key decisions made, open questions, and suggested next steps — and offers to resume with that context injected into the next message.

**What was built:**
- `server/services/session-resume.ts` — core service that generates AI summaries of sessions using Claude Haiku, stores them in `session_snapshots`, and builds the resume context block
- `server/routes/session-resume.ts` — REST endpoints: `GET /api/sessions/:id/resume`, `POST /api/sessions/:id/snapshot`, `PUT /api/sessions/:id/status`, `GET /api/sessions/resumable`
- `src/components/shared/ResumePanel.tsx` — non-blocking collapsible panel shown at session open when previous context exists; two actions: "Resume with context" (injects prompt) or "Start fresh"
- `session_snapshots` DB table — stores: context_summary, key_decisions (JSON), open_questions (JSON), next_steps (JSON), message_count, token_count_total
- **Prompt builder integration:** `buildResumeContextLayer(db, sessionId)` — Layer 4a in the 10-layer prompt composition system; injected automatically when resuming

---

### Improvement 2: Engagement-Scoped Memory

**What it does:** Consulting engagements span weeks and dozens of ANTON sessions. Engagement-Scoped Memory maintains a persistent, AI-refreshed context that covers all sessions in an engagement — key findings, decisions, risks, open actions, stakeholders, and current phase. Every new session within an engagement automatically draws on this accumulated context.

**What was built:**
- `server/routes/engagements.ts` — full CRUD + context refresh + prompt-block endpoints
- `src/pages/EngagementListPage.tsx` — engagement list with status, phase indicator, session count, last activity
- `src/pages/EngagementWorkspacePage.tsx` — engagement detail with: AI context summary, sessions list, knowledge board (Findings | Decisions | Risks | Actions), stakeholders, phase progress
- Full engagement component suite: `EngagementSetup`, `EngagementExecution`, `EngagementQualityGate`, `EngagementReview`, `EngagementExpertConfig`, `EngagementTeamPanel`, `EngagementWorkstreamPlanning`, `EngagementClientIntelligence`, `EngagementPeerBenchmarks`, `EngagementScopeAgreement`, `EngagementResourceCollection`, `EngagementGoodExample`
- DB tables: `engagements`, `engagement_sessions`, `engagement_knowledge`
- **Prompt builder integration:** Engagement context is injected as an optional layer between Area Context and Module Methodology

---

### Improvement 3: Proactive Intelligence

**What it does:** Rather than waiting for users to ask, ANTON monitors patterns across sessions and surfaces actionable insights — cross-engagement findings, quality trends, knowledge gaps, continuity risks, and regulatory alerts — proactively via an `InsightsBell` notification in the nav bar.

**What was built:**
- `server/services/proactive-intelligence.ts` — orchestrator that runs detection functions: `detectCrossEngagementPatterns`, `detectQualityTrends`, `detectKnowledgeGaps`, `detectContinuityRisks`, `checkRegulatoryAlerts`
- `server/services/insights-generator.ts` — supporting service for AI-powered pattern synthesis
- `server/routes/insights.ts` — endpoints: `GET /api/insights`, `GET /api/insights/count`, `PUT /api/insights/:id/status`, `POST /api/insights/analyse`
- `src/components/shared/InsightsBell.tsx` — notification bell in top nav with count badge (red = critical/warning, blue = info); dropdown with insight cards; actions: view related session, run suggested module, dismiss
- `src/features/intelligence/InsightsTab.tsx` — full feed view in Intelligence Dashboard with filtering, grouping, trend charts
- `src/features/intelligence/PatternCard.tsx` — insight card component with evidence display and action buttons
- DB tables: `knowledge_atoms`, `proactive_insights`

---

### Improvement 4: Organisational Context Layer

**What it does:** A persistently maintained unified view of the organisation — entity landscape, regulatory state, capability map, risk landscape — automatically synthesised from all sessions, engagements, and connections. Every module invocation can draw from this always-on context without users having to re-explain their organisation each time.

**What was built:**
- `server/services/org-context.ts` — background synthesis service with six context types: `entity_map`, `regulatory_state`, `capability_map`, `risk_landscape`, `knowledge_index`, `tool_connections`
- `server/routes/org-context.ts` — endpoints: `GET /api/org-context`, `GET /api/org-context/:type`, `POST /api/org-context/refresh`, `GET /api/org-context/prompt-block`
- `src/components/shared/OrgContextPanel.tsx` — settings panel showing per-type cards with last refresh time, confidence level, word count, expand to see full synthesis, refresh button, history viewer
- **Prompt builder integration:** `buildOrgContextLayer(db, userId)` — Layer 2a in the prompt composition system; injected into every module invocation, Counsel's Desk, and Gap Assessment batch calls

---

### Improvement 5: Organisational Continuity (Key-Person Risk)

**What it does:** Captures and analyses the judgment patterns embedded in every human override decision — the institutional memory that would be lost if a senior person left. Surfaces this as an organisational continuity capability with per-user knowledge profiles, risk assessment, and knowledge transfer briefs.

**What was built:**
- `server/routes/continuity.ts` — endpoints: profiles, build, report, risk-assessment, transfer, dashboard
- `server/services/institutional-memory.ts` — pattern analysis and profile generation
- `src/features/intelligence/InstitutionalMemoryTab.tsx` — full UI within Intelligence Dashboard
- `src/features/intelligence/CheckpointMemoryPanel.tsx` — decision capture and override logging
- DB tables: `checkpoint_decisions`, `continuity_profiles`

---

### Improvement 6: Orchestration Dashboard ("The Brain")

**What it does:** A visual positioning statement — when users open ANTON, they immediately see it as the intelligence layer above their tool stack. Shows: proactive insights requiring attention, active engagements with phase progress, resumable recent sessions, org context health meters, connected systems, and an intelligence summary ("ANTON has learned from X sessions across Y domains").

**What was built:**
- `src/pages/OrchestrationDashboard.tsx` — aggregates data from all six improvements: insights feed, engagement cards, session resume list, org context health, connected systems graph, intelligence metrics

---

## Part 2: Event-Driven Workflow Triggers (EVENT_DRIVEN_WORKFLOW_TRIGGERS_SPEC.md)

**Strategic context:** Built in response to Cursor's March 2026 "Automations" launch. ANTON's workflow engine is architecturally more sophisticated (12 step types, expert persona injection, compliance-as-code, governance audit trails) — this adds the event trigger layer that makes workflows reactive rather than scheduled.

**What was built:**

Five new trigger types added to the existing workflow engine:
1. `webhook` — any inbound HTTP POST from external systems
2. `git_push` — triggered on commits to monitored repositories
3. `slack_event` — triggered by messages/reactions in Slack channels
4. `teams_event` — triggered by messages in Microsoft Teams channels
5. `mcp_event` — triggered by events from MCP connections (PagerDuty, Jira, ServiceNow)

**Infrastructure:**
- `server/services/webhook-listener.ts` — single inbound service handling reception, HMAC validation, event filtering, payload-to-variable mapping, and handoff to the existing workflow engine
- `server/services/event-emitter.ts` — internal event bus for ANTON-generated events (Regulatory Radar changes, Compliance Rule violations, file watcher)
- `server/services/event-workflow-processor.ts` — matches events to trigger configurations, transforms payloads, starts workflow runs
- `server/routes/triggers.ts` — trigger CRUD and management endpoints
- `server/routes/webhooks.ts` — inbound webhook receiver: `POST /api/webhooks/inbound/:trigger_id`
- `server/services/integrations/slack-webhook.ts` + `teams-webhook.ts` — platform-specific event validation and formatting
- `src/pages/EventTriggersPage.tsx` — full trigger management UI: create triggers, configure filtering, map payload fields, view event log, test fire
- DB tables: `webhook_triggers`, `webhook_events`, `webhook_trigger_metrics`

**Key architectural principle:** The trigger layer is thin — receive, validate, match, transform, hand off. All intelligence (personas, compliance checking, quality scoring, branching) lives in the unchanged existing workflow engine.

---

## Part 3: Regulatory Knowledge Packs (REGULATORY_KNOWLEDGE_PACK_SPEC.md)

**What it does:** Pre-built, structured regulatory datasets that seed the knowledge graph on day one — eliminating the "empty graph on first use" problem. Instead of waiting weeks for entities to accumulate through use, users activate a pack and immediately have a dense, cross-referenced map of the regulatory framework they work with.

### Infrastructure Built

- `server/services/knowledge-pack-service.ts` — full lifecycle management: import, validate, activate, deactivate, delete; entity/relationship bulk insert with deduplication; merge logic for pack-seeded vs. workflow-extracted entities
- `server/routes/knowledge-packs.ts` — 7 endpoints: list, get, entities (preview), import, activate, deactivate, delete, meta/active-summary
- `server/services/anton-bundler.ts` — `.anton` bundle format with `regulatory-knowledge-pack` bundle type
- Migration `006_add_knowledge_packs.sql` — `knowledge_packs` table + `source` and `pack_id` columns on `entity_nodes`, `entity_relationships`, `entity_aliases`
- `src/pages/KnowledgeBasePage.tsx` — "Regulatory Packs" tab showing pack cards with Install/Activate/Deactivate/Preview actions, entity/relationship counts, preview modal (entities, relationships, stats)
- `data/knowledge-packs/build-pack.mjs` — build tool: `node build-pack.mjs <dir>` creates `.anton` bundle from source JSON files
- `data/knowledge-packs/build-all.mjs` — batch build all packs
- `data/knowledge-packs/validate-all.mjs` — validation runner across all packs

**Phase 2 pack-to-prompt injection (originally deferred, implemented ahead of schedule):**
- `buildKnowledgePackLayer(db)` in `server/services/prompt-builder.ts` — Layer 2b in the 10-layer prompt system; injected into every module invocation, Counsel's Desk sessions, and Gap Assessment batch calls

### 23 Knowledge Packs Built

The spec required 5 Tier 1 packs. 23 packs were delivered:

**AML/CFT & Financial Crime Prevention:**
| Pack slug | Coverage |
|-----------|----------|
| `amlr-2024` | AMLR Regulation 2024/1624 — 86 articles, full cross-reference map |
| `amla-amld6` | AMLA Regulation 2024/1620 + AMLD6 Directive 2024/1640 |
| `amla-rts-tracker` | All planned AMLA RTS/ITS deliverables with timeline metadata |
| `eba-aml-guidelines` | EBA AML/CFT Guidelines including Risk Factors Guidelines |
| `fatf-recommendations` | FATF 40 Recommendations + Interpretive Notes |
| `wolfsberg-principles` | Wolfsberg Group AML Principles and CBDDQ |
| `cbr-derisking` | Correspondent Banking de-risking frameworks |
| `nordic-aml-laws` | SE, FI, DK, NO, IS national AML/CFT legislation |
| `nordic-supervisors` | Finansinspektionen, Finanstilsynet, FIVA supervisory guidance |
| `swift-standards` | SWIFT messaging standards relevant to AML screening |

**Sanctions & ABC:**
| Pack slug | Coverage |
|-----------|----------|
| `eu-sanctions` | EU sanctions framework — designation, screening, licensing |
| `unscr-sanctions` | UN Security Council Resolutions sanctions regime |
| `mar-csmad` | Market Abuse Regulation + CSMAD Directive |
| `abc-anti-bribery` | UKBA, FCPA, OECD Anti-Bribery Convention, UNCAC |

**Banking, Finance & Markets:**
| Pack slug | Coverage |
|-----------|----------|
| `crr-crd-mica` | CRR/CRD prudential framework + MiCA crypto regulation |
| `mifid-mifir` | MiFID II / MiFIR markets regulation |
| `emir-sftr` | EMIR + SFTR derivatives and reporting |
| `funds-aifmd-ucits` | AIFMD + UCITS fund management regulation |
| `psd3-psr` | PSD3 + Payment Services Regulation |

**ESG, Cyber & Other:**
| Pack slug | Coverage |
|-----------|----------|
| `esg-csrd-sfdr` | CSRD, EU Taxonomy, SFDR, CSDDD sustainability framework |
| `dora-nis2` | DORA + NIS2 digital operational resilience |
| `gdpr-ai-act` | GDPR + EU AI Act |
| `solvency-ii-insurance-aml` | Solvency II + insurance-specific AML provisions |

---

## Part 4: Counsel's Desk (New Feature)

**What it does:** A multi-tab legal research workspace within ANTON — purpose-built for FCP lawyers and compliance counsel. Combines eight structured research modes with six specialist expert roles, streaming Claude with extended thinking, knowledge pack injection, org context awareness, and session-scoped pinned findings and auto-citation capture.

### Architecture

**Backend:**
- `server/routes/legal-research.ts` — session CRUD + streaming Claude message endpoint
- `server/prompts/counsels-desk.md` — base legal research system prompt (citation standards, IRAC structure, uncertainty flagging, 8-mode behavioural guidance)
- 8 interaction modes with configurable thinking budgets:
  - `deep-dive` (16k tokens thinking) — Regulatory Deep-Dive
  - `hypothetical` (16k tokens) — Hypothetical / Test Case
  - `comparison` (8k tokens) — Regulation Comparison
  - `case-law` (web search, no thinking) — Case Law Explorer
  - `opinion` (24k tokens) — Legal Opinion Draft
  - `gap-spotter` (16k tokens) — Regulatory Gap Spotter
  - `comparative-jurisdiction` (16k tokens) — Comparative Jurisdiction
  - `rapid-risk` (4k tokens) — Legal Risk Rapid
- 6 expert roles: EU Regulatory Lawyer, Sanctions Lawyer, Anti-Bribery Counsel, Nordic Compliance Counsel, Financial Crime Barrister, Regulatory Affairs Advisor
- DB table: `legal_research_sessions` with fields: mode, expert_role, research_questions, pinned_findings, citations, active_knowledge_packs

**Frontend:**
- `src/pages/CounselsDesk.tsx` — ~1,500-line multi-tab workspace with: chat interface with streaming, mode selector, expert role picker, thinking indicator, pinned findings sidebar, citations sidebar, knowledge packs sidebar

**Knowledge pack integration (added this session):**
- 5 default packs auto-activated on session creation: `amlr-2024`, `eu-sanctions`, `amla-amld6`, `wolfsberg-principles`, `abc-anti-bribery`
- Per-session pack toggle sidebar: users can enable/disable individual packs; state persisted to DB
- Backend injection: active pack content appended to system prompt as `## ACTIVE KNOWLEDGE PACKS` section for every message
- Org context injection: `buildOrgContextLayer` result prepended to system prompt

---

## Part 5: Compliance Gap Assessor (New Feature)

**What it does:** A wizard-driven, framework-by-framework structured compliance gap assessment. Users select regulatory frameworks, define scope and context, and Claude performs article-level RAG scoring across all articles in batches. The wizard then synthesises a Capability View, generates a Board Summary, and produces a remediation Roadmap.

### Architecture

**Backend:**
- `server/routes/gap-assessments.ts` — REST + SSE endpoints for the full 8-step workflow
- `server/services/gap-assessment-engine.ts` — chunked Claude orchestration: sends articles in batches of 12 to Claude with structured JSON output, accumulates RAG-scored findings in DB, exposes synthesis and generation functions
- Four framework data files in `data/frameworks/`:
  - `amlr-2024.json` — 86 articles across 10 chapters
  - `dora-2022.json` — 64 articles
  - `iso27001-2022.json` — 93 controls across 11 domains
  - `wolfsberg-cbddq.json` — 14 sections
- DB tables: `gap_assessments`, `gap_findings`
- Streaming endpoints (SSE): `POST /api/gap-assessments/:id/run` — streams batch progress events as articles are assessed
- Synthesis endpoints: `/synthesise` (Step 6 Capability View), `/board-summary` (Step 7), `/roadmap` (Step 8)

**Frontend:**
- `src/pages/GapAssessmentHub.tsx` — framework picker, framework → knowledge pack suggestion banner, recent assessments list
- `src/pages/GapAssessmentWizard.tsx` — 8-step wizard:
  - Step 1: Framework Selection
  - Step 2: Scope (select themes/articles to include)
  - Step 3: Context (entity type, jurisdiction, risk appetite) — pre-filled from Org Context
  - Step 4: Assessment (live streaming progress with batch-by-batch updates)
  - Step 5: Article Scoring (RAG-scored findings per article)
  - Step 6: Capability View (AI-synthesised capability map)
  - Step 7: Board Summary (executive narrative)
  - Step 8: Roadmap (prioritised remediation plan)

**Org context + knowledge pack integration (added this session):**
- `buildOrgContextLayer` and `buildKnowledgePackLayer` injected into every batch call as `extraSystemContext`
- Gap Assessment Wizard Step 3 pre-fills entity type, jurisdiction, and concerns from Org Context for fresh assessments (skips pre-fill if user has already saved context)
- GapAssessmentHub shows a knowledge pack suggestion banner when frameworks are selected (e.g., selecting AMLR suggests the `amlr-2024`, `amla-amld6`, and `eba-aml-guidelines` packs)

---

## Part 6: AI-Assist Endpoints for Non-Module Pages (New Feature)

**What it does:** 14 lightweight Claude endpoints that bring AI assistance to functional pages outside the module system — skills drafting, deadline prioritisation, quality coaching, analytics narratives, workflow diagnosis, and more.

**File:** `server/routes/ai-assist.ts`

| Endpoint | Page | Function |
|----------|------|----------|
| `POST /api/ai-assist/skill-draft` | Skills Library | Draft a skill prompt from intent + category + description |
| `POST /api/ai-assist/deadline-prioritise` | Deadlines | Prioritise a list of deadlines with rationale |
| `POST /api/ai-assist/quality-coaching` | Quality Page | Generate coaching tips from a quality score |
| `POST /api/ai-assist/analytics-narrative` | Analytics | Narrative summary from usage metrics |
| `POST /api/ai-assist/workflow-diagnose` | Workflow Monitor | Diagnose a failed or stalled workflow |
| `POST /api/ai-assist/project-brief` | Projects | Generate a project brief from title + description |
| `POST /api/ai-assist/compliance-explain` | Compliance | Explain a compliance rule in plain language |
| `POST /api/ai-assist/violation-remediation` | Compliance | Suggest remediation for a compliance violation |
| `POST /api/ai-assist/apprentice-hint` | Apprentice | Generate a Socratic hint for a learning challenge |
| `POST /api/ai-assist/version-summary` | Version History | Summarise what changed between two versions |
| `POST /api/ai-assist/pattern-explain` | Intelligence | Explain a detected pattern in plain language |
| `POST /api/ai-assist/insight-action` | Intelligence | Suggest concrete actions for a proactive insight |
| `POST /api/ai-assist/build-module-help` | Build Your Own Module | Help refine a module description into a structured prompt |
| `POST /api/ai-assist/build-workflow-help` | Build Your Own Workflow | Help design a workflow from a goal description |

---

## Part 7: FCP Specialist Skills (New Content)

8 new specialist skills added to the Skills Library with smart auto-attach:

| Skill | Category | Auto-attaches to |
|-------|----------|-----------------|
| AMLR Article Navigator | Regulatory Analysis | `gap-analysis`, `regulatory-monitor` modules |
| BWRA Architect | Risk Assessment | `risk-assessment` module |
| EDD Structurer | Customer Due Diligence | `gap-analysis`, `investigation-support` modules |
| SAR Narrative Builder | Investigations | `investigation-support` module |
| Sanctions Screener | Sanctions | `sanctions-advisory` module |
| AMLA Data Mapper | Data Management | `data-management` module |
| Regulatory Gap Finder | Gap Analysis | `gap-analysis` module |
| FCP Training Designer | Training | `training-content` module |

5 existing FCP skills upgraded with richer prompt instructions.

Smart auto-attach: when a module is opened, the Skills Library checks which skills have `autoAttach` set for that `moduleId` and pre-activates them — no manual selection required.

---

## Part 8: Bug Fixes and Integration Improvements (This Session)

### Bug Fix 1: Duplicate `legal-brief` Output Format

**File:** `src/lib/output-format-definitions.ts`
**Problem:** The `legal-brief` format was defined twice in the `OUTPUT_FORMATS` array — a short version at line ~68 (category: `strategic`, basic IRAC) and a full enterprise version at line ~1458 (category: `analytical`, full IRAC with uncertainty flags, bibliography, and citation standards). The second shadowed the first but both were in the array, causing unpredictable behaviour in format pickers.
**Fix:** Removed the first, shorter entry. Kept only the full enterprise IRAC version.

### Bug Fix 2: Duplicate Migration File Numbers

**Directory:** `server/db/migrations/`
**Problem:** `003_add_session_note.sql` and `003_strategic_improvements.sql` both used the `003_` prefix. Same for `004_quality_reasoning.sql` and `004_radar_cron_schedule.sql`. The DB init hard-codes `003_strategic_improvements.sql` by name, so it ran correctly — but the naming conflict created confusion and risked future errors.
**Fix:** Renamed the non-critical files:
- `003_add_session_note.sql` → `003b_add_session_note.sql`
- `004_radar_cron_schedule.sql` → `004b_radar_cron_schedule.sql`

### Bug Fix 3: Skills Library AI Draft Field Name Mismatch

**File:** `src/pages/SkillsLibrary.tsx`
**Problem:** The `draftWithAI` function was sending `{ name: name.trim(), ... }` in the request body, but the `/api/ai-assist/skill-draft` route expects `{ intent: ... }`. This caused silent 400 errors — every AI draft request failed.
**Fix:** Changed request body key from `name` to `intent`.

### Enhancement 4: Skills Library — Module Quick-Actions

**File:** `src/pages/SkillsLibrary.tsx`
**Added:**
- `TAG_TO_MODULE` map — maps skill tags (e.g., `amlr`, `bwra`, `sanctions`) to module paths
- `TAG_TO_PACKS` map — maps skill tags to related knowledge pack IDs and labels
- `resolveSkillModule(tags)` helper — returns the most relevant module for a skill's tags
- `resolveSkillPacks(tags)` helper — returns deduplicated list of related pack suggestions
- In expanded skill cards: "Open in [Module]" button (teal bordered, routes to module page)
- In expanded skill cards: "Related packs" badge row showing which knowledge packs complement this skill

### Enhancement 5: Counsel's Desk — Knowledge Pack Defaults + Toggle UI

**File:** `src/pages/CounselsDesk.tsx`
**Added:**
- 5 FCP-priority packs auto-activated on every new session: `amlr-2024`, `eu-sanctions`, `amla-amld6`, `wolfsberg-principles`, `abc-anti-bribery`
- Knowledge Packs sidebar panel (third panel in right sidebar) with teal dot indicators for active packs, toggle buttons to enable/disable individual packs, state persisted immediately to DB

### Enhancement 6: Counsel's Desk Backend — System Prompt Enrichment

**File:** `server/routes/legal-research.ts`
**Added:**
- `buildOrgContextLayer(db, uid)` — org context injected into every system prompt
- Active knowledge pack content injection — queries DB for session's `active_knowledge_packs` names, retrieves display names, regulatory areas, entity counts, and regulation coverage, appends as `## ACTIVE KNOWLEDGE PACKS` section
- Full system prompt assembly: `basePrompt + modeInstruction + roleInstruction + orgContextSection + knowledgePackSection`

### Enhancement 7: Gap Assessment — Org Context + Knowledge Pack Injection

**Files:** `server/routes/gap-assessments.ts`, `server/services/gap-assessment-engine.ts`
**Added:**
- Pre-batch context assembly: `buildOrgContextLayer(db, uid)` + `buildKnowledgePackLayer(db)` combined into `extraSystemContext` string
- `runAssessmentBatch` extended with optional `extraSystemContext?: string` parameter — prepended to the batch system prompt so Claude scores articles with full org and regulatory context
- Every article batch call now benefits from the user's org profile and any active regulatory knowledge packs

### Enhancement 8: Gap Assessment Wizard — Org Context Pre-Fill

**File:** `src/pages/GapAssessmentWizard.tsx`
**Added:**
- On Step 3 open, fetches `/api/org-context` and pre-fills `entityType`, `jurisdiction`, and `concerns` from org context settings if the assessment is fresh (skips pre-fill if user has already saved custom context)
- "Pre-filled from Org Context" indicator shown in Step 3 when values were auto-populated

### Enhancement 9: Gap Assessment Hub — Knowledge Pack Suggestion Banner

**File:** `src/pages/GapAssessmentHub.tsx`
**Added:**
- `FRAMEWORK_PACK_SUGGESTIONS` map — maps each framework ID to the most relevant knowledge packs
- When frameworks are selected in the new assessment panel, a teal banner appears listing recommended packs as chips, with a link to Knowledge Base → Regulatory Packs to activate them

---

## Summary Statistics

| Category | Count |
|----------|-------|
| New React pages | 4 (CounselsDesk, GapAssessmentHub, GapAssessmentWizard, OrchestrationDashboard) |
| New React components | 3 (ResumePanel, InsightsBell, OrgContextPanel) |
| New server routes | 5 (legal-research, gap-assessments, ai-assist, session-resume, triggers/webhooks) |
| New server services | 7 (session-resume, proactive-intelligence, org-context, webhook-listener, event-emitter, event-workflow-processor, gap-assessment-engine) |
| New DB tables | 11 (session_snapshots, engagements, engagement_sessions, engagement_knowledge, knowledge_atoms, proactive_insights, org_context, org_context_history, checkpoint_decisions, continuity_profiles, gap_assessments, gap_findings, legal_research_sessions, webhook_triggers, webhook_events, webhook_trigger_metrics) |
| Knowledge packs built | 23 (vs. 5 Tier 1 required) |
| New FCP skills | 8 new + 5 updated |
| AI-assist endpoints | 14 |
| Bug fixes | 3 |
| Integration enhancements | 6 |
| TypeScript errors | 0 |

---

## Prompt Layer Architecture (Current State)

The 10-layer system prompt now assembles as follows for every Claude invocation:

```
Layer 0:  User Profile (creativity/tone instruction)
Layer 1:  Foundation (ANTON system identity)
Layer 2:  Area Context (expert area background)
Layer 2a: Org Context (buildOrgContextLayer — persistent org state)
Layer 2b: Knowledge Packs (buildKnowledgePackLayer — active regulatory packs)
Layer 3:  Module Methodology (module system prompt from server/prompts/)
Layer 4:  Module Prompt (user-editable system prompt)
Layer 4a: Resume Context (buildResumeContextLayer — session resumption)
Layer 5:  Expert Personas (persona injection)
Layer 6:  Skills (active skills from SkillAttacher)
Layer 7:  Output Format + Reasoning (format instructions + thinking level)
Layer 8:  Knowledge Documents (uploaded files, folder contents)
Layer 9:  RAG / Vector Search Results
```

Specialised routes (Counsel's Desk, Gap Assessment) use a subset of this architecture, injecting Layers 2a and 2b directly into their system prompts.

---

## Files Modified in This Session (Current Branch Diff)

| File | Change |
|------|--------|
| `src/lib/output-format-definitions.ts` | Removed duplicate `legal-brief` entry |
| `server/db/migrations/003b_add_session_note.sql` | Renamed from `003_` |
| `server/db/migrations/004b_radar_cron_schedule.sql` | Renamed from `004_` |
| `server/routes/legal-research.ts` | Added org context + knowledge pack injection |
| `src/pages/CounselsDesk.tsx` | Default pack IDs on session create + pack toggle sidebar |
| `server/services/gap-assessment-engine.ts` | Added `extraSystemContext` param to `runAssessmentBatch` |
| `server/routes/gap-assessments.ts` | Org context + knowledge pack injection into batch runs |
| `src/pages/GapAssessmentWizard.tsx` | Org context pre-fill in Step 3 |
| `src/pages/GapAssessmentHub.tsx` | Framework → pack suggestion banner |
| `src/pages/SkillsLibrary.tsx` | Bug fix (intent field), module quick-action, related packs badges |
| Multiple pages (AnalyticsPage, ApprenticePage, etc.) | AI-assist integrations |
