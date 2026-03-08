# ANTON FCP Workbench — Session Summary
**Date:** 2026-03-07 (overnight + full day session)
**Branch:** `feature/strategic-improvements`
**Final TypeScript status:** 0 errors

---

## Overview

This session implemented three major strategic improvements to the ANTON FCP Workbench:

1. **Compliance Gap Assessor** — 8-step wizard for structured AMLR/DORA/ISO gap assessments
2. **Counsel's Desk** — multi-mode legal research workspace with citation capture and expert role picker
3. **ANTON Orchestrator ("ANTON Prime")** — full AI management layer above all modules, built across 6 implementation sessions plus a 10-expert review

Total new commits on `feature/strategic-improvements`: ~15 commits.

---

## 1. Compliance Gap Assessor

### What it does
Full gap assessment workflow for regulatory frameworks (AMLR 2024, DORA, ISO 27001, Wolfsberg CBDDQ). An FCP consultant picks a framework, scopes it to relevant articles, provides client context, and ANTON runs a batched Claude assessment per article, then synthesises findings into a scoring matrix, capability view, board summary, and implementation roadmap — all in one 8-step wizard.

### Key files
| File | Purpose |
|---|---|
| `src/pages/GapAssessmentHub.tsx` | Framework picker + recent assessments |
| `src/pages/GapAssessmentWizard.tsx` | 8-step wizard (Framework→Scope→Context→Assess→Scoring→Capability→Board→Roadmap) |
| `server/routes/gap-assessments.ts` | REST + SSE batch assessment + synthesis endpoints |
| `server/services/gap-assessment-engine.ts` | Chunked Claude orchestration, DB accumulation |
| `data/frameworks/amlr-2024.json` | 86 articles with metadata |
| `data/frameworks/dora-2022.json` | 64 articles |
| `data/frameworks/iso27001-2022.json` | 93 controls |
| `data/frameworks/wolfsberg-cbddq.json` | 14 sections |

### DB tables added
- `gap_assessments` — assessment header, framework, scope, client context
- `gap_findings` — per-article findings with severity, gap type, effort

---

## 2. Counsel's Desk

### What it does
Multi-tab legal research workspace. Supports 8 research modes (quick question, detailed analysis, IRAC memo, regulatory comparison, risk assessment, policy drafting, training material, client briefing) and 6 expert roles (AML Specialist, Sanctions Expert, DORA Lead, GDPR Counsel, Regulatory Lawyer, Risk Assessor). Auto-captures citations and allows pinning key findings. Knowledge packs (AMLR, EU Sanctions, Wolfsberg etc.) auto-activate on session creation.

### Key files
| File | Purpose |
|---|---|
| `src/pages/CounselsDesk.tsx` | Multi-tab workspace, citation capture, pinned findings, role picker |
| `server/routes/legal-research.ts` | Session CRUD + streaming Claude with legal prompt |
| `server/prompts/counsels-desk.md` | Base legal research system prompt (citation standards, 8 modes) |

### DB tables added
- `legal_research_sessions` — session with active knowledge packs, expert role, mode

### Knowledge pack integration
- 5 priority packs auto-activate: `amlr-2024`, `eu-sanctions`, `amla-amld6`, `wolfsberg-principles`, `abc-anti-bribery`
- Backend injects pack content into system prompt via `buildKnowledgePackLayer()`

---

## 3. ANTON Orchestrator ("ANTON Prime")

This is the largest feature — a full AI management layer that reads signals from all 9 platform subsystems, generates briefings, makes proposals, and (at higher stages) executes workflows with human approval.

### Architecture: 4-Stage Trust Model

```
Stage 1: Observer          — reads signals, generates briefings, no execution
Stage 2: Proposal Manager  — briefings + approve/reject/modify proposals → execution records
Stage 3: Supervised Orch.  — Stage 2 + pattern auto-execution with human oversight
Stage 4: Autonomous Orch.  — Stage 3 + full autonomous operation (future)
```

Stage progression is automatic based on briefing count, proposal rating quality, and time. Stage demotion is also automatic if quality drops below 65% (was 50% — raised after expert review).

### Signal sources (9 total)
| Source | Table read | What it detects |
|---|---|---|
| `radar` | `radar_items` | High-urgency new regulatory items |
| `deadline` | `deadlines` | Approaching + overdue deadlines |
| `quality` | `quality_scores` + `quality_baselines` | Module score decline vs baseline |
| `pattern` | `detected_patterns` | Pre-built pattern detections |
| `compliance` | `rule_violations` | Open compliance rule breaches |
| `assignment` | `step_assignments` | Overdue collaborative canvas assignments |
| `workflow` | `workflow_runs` | Failed/stalled workflow runs |
| `apprentice` | `apprentice_profiles` | Stage progressions ready |
| `knowledge_graph` | `entity_nodes` + `entity_relationships` | High-frequency entities (UNION query, not OR JOIN) |
| `proactive` | `proactive_insights` | Unread high-severity proactive insights |

### LLM cost tiers
| Operation | Model | When |
|---|---|---|
| Heartbeat assessment | `claude-haiku-4-5` | Every N minutes — cheap, fast |
| Briefing generation | `claude-sonnet-4-6` | When signals are significant |
| Workflow plan | `claude-opus-4-6` | Per proposal approval (rich plan) |
| Narrative summary | `claude-sonnet-4-6` | Post-briefing async enrichment |
| Management report | `claude-sonnet-4-6` | On-demand weekly/monthly |

### ORCHESTRATOR_HARD_LIMITS (immutable safety caps)
```typescript
MAX_PROPOSALS_PER_BRIEFING:    10
MAX_HEARTBEATS_PER_HOUR:        6
MAX_AUTO_EXECUTIONS_PER_DAY:   20
MAX_CHAIN_DEPTH:                5
MIN_HEARTBEAT_INTERVAL_MINUTES: 10
MAX_TRAIL_ENTRIES:             100
MAX_COST_PER_CYCLE_USD:        2.0
```

### Reasoning Trails
Every orchestrator action creates a structured reasoning trail in the DB:
- `orchestrator_reasoning_trails` — one per heartbeat/approval cycle
- `orchestrator_reasoning_entries` — individual steps (13 entry types)
- Async enrichment: narrative summary (Sonnet) + markdown workspace file (`.anton/orchestrator/trails/YYYY-MM-DD/`)
- Full-page viewer at `/orchestrator/trail/:id` with expand/collapse timeline

### Pattern Recognition Engine
4 pattern detectors run after each briefing (non-blocking):
- `quality_drop` — module score declining consistently over 7 days
- `workflow_recurrence` — same workflow run 3+ times in 30 days with >70% success
- `signal_cluster` — 3+ high-urgency radar items of same type in 3 days
- `deadline_cluster` — 3+ deadlines due within 14 days

Auto-pause: if >65% of recent proposals (min 10 rated) are marked wrong/irrelevant, orchestrator auto-pauses with console warning.

### Demo Mode — Meridian Bank
Synthetic dataset for exploring ANTON without live platform data:

**Meridian Bank profile:** Nordic mid-tier universal bank, 12,000 employees, FIN/SE/LT, recently acquired LitPay (Lithuanian e-money), under AMLR 2024 + DORA implementation pressure, high Baltic sanctions exposure.

**16 synthetic signals across all sources:**
- AMLR Art.42 BWRA overdue 45 days, FIN-FSA response window 12 days
- DORA Art.11 ICT continuity gap in Lithuanian subsidiary
- New EU sanctions package 14a — Baltic entity re-screening required
- KYC refresh for 847 high-risk customers overdue >60 days
- Quality decline: Sanctions Advisory module 8.2 → 6.4 score
- Stalled "DORA ICT Risk Assessment" workflow stuck 9 days
- Pattern: 3 consultants running Sanctions Advisory every Monday
- Post-acquisition CDD: 247 LitPay customers without Meridian KYC (19-day window)
- AML policy consolidation gap (LitPay not aligned to Group Policy)
- Beneficial ownership: 3 shareholders >10% not in FATF registry
- ...and more

**3 modes:**
- `demo` — inject today's signals, generate briefing
- `simulation` — 14-day historical replay with timeline advancement
- `accelerated` — time-compressed trust building

### DB Migrations
| Migration | Tables/Changes |
|---|---|
| `021_orchestrator_base.sql` | `orchestrator_stage`, `orchestrator_config`, `orchestrator_heartbeats`, `orchestrator_briefings`, `orchestrator_proposals` |
| `022_orchestrator_phase2.sql` | `orchestrator_executions` (links proposals to workflow_runs) |
| `023_orchestrator_reasoning_trails.sql` | `orchestrator_reasoning_trails`, `orchestrator_reasoning_entries` (13 entry types) |
| `023b_orchestrator_trail_enrichment.sql` | Adds missing spec fields: evidence, model_used, tokens_used, cost_usd, proposal_ids; Stage 2 metrics on orchestrator_stage |
| `024_orchestrator_demo_patterns.sql` | `orchestrator_patterns`, `orchestrator_pattern_detections`, `demo_state` column on config |
| `025_orchestrator_meta_learning.sql` | `orchestrator_meta_learning`, `orchestrator_stage_demotions`, `orchestrator_workflow_chains` |

All migrations use PRAGMA table_info guards in init.ts (SQLite doesn't support `IF NOT EXISTS` on ALTER TABLE).

### API Endpoints (35+)
```
GET  /orchestrator/status                    — stage, config, last heartbeat, unread count
GET  /orchestrator/stage                     — stage + progression metrics
GET  /orchestrator/briefings                 — paginated briefing list
GET  /orchestrator/briefings/:id             — single briefing + proposals (marks as read)
POST /orchestrator/briefings/generate        — manual heartbeat trigger
GET  /orchestrator/proposals                 — filtered proposal list
PATCH /orchestrator/proposals/:id           — rate + feedback
POST /orchestrator/proposals/:id/approve     — Stage 2+: creates execution + workflow_run
POST /orchestrator/proposals/:id/reject      — updates proposal + stage metrics
POST /orchestrator/proposals/:id/modify      — adjusts scope, creates trail, returns redirect URL
GET  /orchestrator/executions                — paginated execution log
GET  /orchestrator/executions/:id            — single execution
PATCH /orchestrator/executions/:id/outcome  — record success/failure/partial
GET  /orchestrator/trails                    — paginated reasoning trail list
GET  /orchestrator/trails/:id               — trail + entries (paginated, max 200)
GET  /orchestrator/heartbeats                — heartbeat log
GET  /orchestrator/config                    — current config
PATCH /orchestrator/config                  — update config (admin)
POST /orchestrator/pause                     — pause heartbeat
POST /orchestrator/resume                    — resume heartbeat
POST /orchestrator/disable                  — full irreversible disable (admin role check)
POST /orchestrator/reset                     — reset to Stage 1 Observer
GET  /orchestrator/limits                    — expose ORCHESTRATOR_HARD_LIMITS (read-only)
GET  /orchestrator/report                    — weekly/monthly management report (AI-generated)
POST /orchestrator/demotion-check            — trigger stage demotion evaluation on demand
GET  /orchestrator/demotions                 — demotion history
GET  /orchestrator/patterns                  — patterns + recent detections
PATCH /orchestrator/patterns/:id            — toggle auto_execute (Stage 3+)
POST /orchestrator/patterns/detect           — trigger pattern scan on demand
GET  /orchestrator/demo                      — demo state + persona context
POST /orchestrator/demo/activate             — activate demo/simulation/accelerated mode
POST /orchestrator/demo/deactivate           — remove all synthetic signals (transactional)
POST /orchestrator/demo/advance              — advance simulation timeline day
```

### Frontend pages
| Page | Route |
|---|---|
| `OrchestratorDashboard.tsx` | `/orchestrator` |
| `OrchestratorTrailViewer.tsx` | `/orchestrator/trail/:id` |

**Dashboard features:**
- Stage card with progression bar and criteria
- Latest briefing with proposal cards (Approve/Modify/Reject at Stage 2+, Rate at Stage 1)
- Briefing history list
- Execution log (collapsible)
- Reasoning trails list with "View" links to full viewer
- Demo Mode panel (3 activation buttons, active banner at page top)
- Kill switch (pause/resume/disable/reset)
- Config editor

**Trail Viewer features:**
- Timeline layout with vertical connector line + step dots per entry type
- Colour-coded entry types (13 types with distinct icons)
- Expand/collapse per entry (auto-expand key types)
- Confidence bar per step
- Evidence inspector, metadata pill display
- Model/token/cost footer per entry
- Narrative summary panel (AI-generated plain English)
- Breadcrumb links back to dashboard

### System prompt
`server/prompts/orchestrator-briefing.md` — Full ANTON Prime briefing prompt with:
- 5-section output format (Headline, Signal Analysis, Proposals, Patterns, Risk Register)
- FCP Domain Requirements section: MUST/SHOULD/COULD obligation levels, mandatory regulatory citations, governance flags, conflict detection, conservative proposal guidance

---

## 10-Expert Review Findings & Fixes

Two parallel expert agent panels (5 experts each) reviewed the full implementation. Key fixes applied:

### Security
- **`/disable` auth guard** was bypassable when `user=undefined`. Fixed: `if (user && user.role && user.role !== 'admin')` — solo mode passes, authenticated non-admins are blocked.

### Performance
- **Knowledge Graph OR JOIN** replaced with UNION subquery — allows SQLite to use indexes on `from_id` and `to_id` separately instead of O(n²) full table scan.
- **Trail entries pagination** — `GET /orchestrator/trails/:id` now accepts `?limit=100&offset=0` (max 200). Prevents 10MB+ responses on complex trails.

### Reliability
- **`enrichTrailAsync` silent catch** — `.catch(() => {})` changed to `.catch(err => console.error(...))`. Silent trail enrichment failures are now visible.
- **Pattern engine catches** — all bare `catch {}` blocks now distinguish "no such table" (expected on fresh DB) from real SQL errors (logged as warnings).
- **Demo cleanup transaction** — `deactivateDemoMode()` wraps both DELETE operations in `BEGIN/COMMIT` so partial cleanup is impossible. Includes ROLLBACK on failure.

### Domain
- **Stage demotion threshold** raised from 0.50 → 0.65 (FCP expert recommendation — compliance AI needs room for conservative proposals that get rated "wrong" but aren't true failures).
- **`generateNarrativeSummary` 0-entries guard** returns meaningful string instead of empty string.
- **3 post-acquisition signals** added to Meridian Bank demo: post-acquisition CDD (247 LitPay customers), AML policy consolidation gap, beneficial ownership verification — the highest compliance priority after any M&A.
- **FCP domain framing** added to `orchestrator-briefing.md`: MUST/SHOULD/COULD obligation levels, mandatory regulatory citations, governance flags, conflict detection.

### UX
- **Demo Mode active banner** added at page top (gold background, signal count, "Exit Demo Mode" button). Replaces subtle status badge — consultants won't accidentally forget they're in demo mode.

---

## Commit History (feature/strategic-improvements)

```
06e274a fix(orchestrator): 10-expert review — critical + high severity fixes
7ec5dad feat(orchestrator): Session E — Phase 4 platform integration + meta-learning
2bb3da0 feat(orchestrator): Session D — Phase 3 pattern recognition engine + auto-pause
b3c5174 feat(orchestrator): Session C — Demo Mode, Simulation Mode, Meridian Bank synthetic signals
7113935 feat(orchestrator): Session B — hard limits, full disable, trail viewer page
ecabc47 feat(orchestrator): Session A — workflow integration, modify flow, reasoning trail enrichment
e8b743c feat(orchestrator): Phase 2 — Proposal Manager + Reasoning Trails
4d195e7 feat(orchestrator): Phase 1 — ANTON Orchestrator Observer stage
1be786a feat(data-partnerships): Roaring + Dow Jones connector services
40b6cd7 feat(strategic-improvements): Counsel's Desk + Gap Assessor + Data Partnerships
c0ac406 fix(data-partnerships): agent-review fixes
...
```

---

## What's Not Yet Done (Future Sessions)

| Item | Priority | Complexity |
|---|---|---|
| Modify flow — replace `window.prompt()` with modal dialog | High | Low |
| Stage progression badge in UI (criteria + progress bar) | High | Medium |
| "View Reasoning" button on each proposal card | High | Low (trail viewer already exists) |
| Stage 4 (Autonomous Orchestrator) — full auto-execution | Medium | High |
| Management report — scheduled delivery + PDF export | Medium | Medium |
| Cost estimation before LLM calls (enforce MAX_COST_PER_CYCLE_USD) | Medium | Medium |
| `orchestrator_meta_learning` write path — record learning from each rated proposal | Medium | Medium |
| Workflow chain execution (orchestrator_workflow_chains table exists, logic not built) | Low | High |
| `/orchestrator/health` endpoint for operations monitoring | Low | Low |
| Audit log schema + RBAC for compliance reporting | Low | Medium |

---

## Environment Notes

- **Node.js:** v22.20.0 | **pnpm:** v10.29.3
- **Dev:** `pnpm run dev` → Vite :5173 + Express API :3001
- **SQLite DB:** `./data/workbench.sqlite` (init.ts runs all migrations on startup)
- **Orchestrator workspace files:** `.anton/orchestrator/trails/YYYY-MM-DD/` (auto-created)
- All new server files use `.js` extension in imports (ESM)
- All migrations are PRAGMA-guarded (SQLite doesn't support `IF NOT EXISTS` on ALTER TABLE)

---

## 4. ANTON Task Agent

**Date added:** 2026-03-07 (follow-on session)
**Branch:** `feature/strategic-improvements`
**TypeScript status:** 0 errors

### What it does

ANTON Task Agent is a conversational task intake and execution-tracking layer. An FCP consultant describes a task in natural language (or it arrives via Jira/Slack webhook). ANTON consults its Self-Knowledge DB — a structured registry of its own capabilities and approach templates — proposes 2–3 concrete execution paths, the human picks one, and ANTON guides execution and tracks progress through a status lifecycle.

**Status lifecycle:** `intake → proposing → awaiting_selection → clarifying → executing → completed | cancelled | failed`

### Architecture

#### Self-Knowledge DB (Migration 026)

Three tables make up ANTON's self-awareness layer:

| Table | Purpose |
|---|---|
| `anton_capabilities` | Every module, tool, workflow, or interaction ANTON can invoke — 19 seeded entries |
| `anton_approaches` | Reusable execution templates ANTON proposes when it receives a task — 10 seeded entries |
| `anton_tasks` | Persistent task queue from intake to completion |

**Capabilities seeded (19):** gap-analysis, gap-assessor, counsels-desk, doc-creation, sanctions-advisory, risk-assessment, regulatory-monitor, training-content, investigation, data-management, open-chat, brief-me, workflow, orchestrator, dj-screening, roaring, radar, sanctions-module, wolfsberg-cbddq

**Approach templates seeded (10):**
- `app-amlr-readiness` — AMLR readiness assessment via Gap Assessor wizard
- `app-quick-legal` — Quick legal research via Counsel's Desk
- `app-compliance-doc` — Draft compliance document via Document Creation module
- `app-sar-investigation` — SAR investigation support via Investigation module
- `app-risk-assessment` — Business-Wide Risk Assessment (BWRA)
- `app-regulatory-briefing` — Regulatory change briefing + impact assessment
- `app-training-module` — AML/CFT training content creation
- `app-dora-gap` — DORA gap assessment via Gap Assessor (73 articles)
- `app-sanctions-review` — Sanctions programme review via Sanctions Advisory
- `app-kyc-cdd-refresh` — KYC/CDD periodic review planning

Each approach template includes: `task_pattern` (keyword matching), `capability_ids` (execution order), `execution_steps` (step-by-step JSON with `{step, name, capability_id, description}`), `effort`, `outcome`, `required_inputs`, `confidence_threshold`.

**Indexes:**
```sql
idx_anton_tasks_user_status   — (user_id, status) for task list queries
idx_anton_tasks_created       — (created_at DESC) for ordering
idx_anton_tasks_due_date      — (due_date) WHERE due_date IS NOT NULL
idx_anton_approaches_confidence — (confidence_threshold) for filtering
idx_anton_capabilities_area   — (area) for capability lookup by domain
```

#### Backend: `server/routes/task-agent.ts`

11 endpoints registered at `/api/task-agent`:

```
GET  /capabilities              — capabilities + approaches for system prompt
GET  /tasks                     — paginated task list (max limit: 100)
POST /tasks                     — create task, auto-triggers first Claude message
GET  /tasks/:id                 — single task with full conversation + proposals
POST /tasks/:id/message         — SSE streaming Claude response
POST /tasks/:id/select-approach — lock in approach, increment times_used counter
POST /tasks/:id/complete        — mark task completed with optional summary
PATCH /tasks/:id                — update title/description/priority/due_date/tags
DELETE /tasks/:id               — soft delete (user_id guard)
POST /ingest                    — external webhook (Jira/Slack) — secured with X-ANTON-Token
GET  /stats                     — aggregate counts per status + priority
```

**Security measures:**
- All endpoints filter by `user_id` (from `getUserId(req)`) — no cross-user data access
- `/ingest` requires `X-ANTON-Token` header matching `TASK_AGENT_WEBHOOK_SECRET` env var
- Input length bounds: title ≤200 chars, description ≤4000 chars, message content ≤2000 chars
- Query limit capped at 100 (`Math.min(parseInt(limit) || 20, 100)`)

**Claude configuration:**
- Model: `claude-sonnet-4-6` (upgraded from Haiku — proposal quality demands it)
- Conversation history truncated to last 30 messages to prevent context blowout
- System prompt includes full self-knowledge context (`buildSelfKnowledgeContext()`) + explicit DECISION LOGIC block:
  - Clear task → propose approaches immediately (no unnecessary questions)
  - Vague task → ask 2–3 targeted clarifying questions first
  - CRITICAL instruction: approach_id must be from the registered list, never invented

**Structured output parsing:**
Claude wraps structured output in XML tags (`<approaches>`, `<clarifying>`, `<execution>`). The frontend strips these from the visible chat with `stripStructuredBlocks()`. Backend parses them via regex + `parseJson()` with silent fallbacks.

#### Frontend: `src/pages/AntonTaskAgentPage.tsx`

Two-panel layout:
- **Left panel (w-80):** Task queue with status badges, search/filter, priority indicators, "New Task" button
- **Right panel:** Full chat workspace for the selected task

**Key components:**
| Component | Purpose |
|---|---|
| `StatusBadge` | Colour-coded lifecycle status (adv-teal/gold/green/red) |
| `ConversationBubble` | User/assistant message rendering with Markdown support |
| `ProposalCard` | Approach proposal cards — expandable, selectable, confirm button |
| `NewTaskModal` | Title + description + priority + due date form |
| `TaskChatPanel` | Full chat + streaming + proposal selection + execution tracking |

**UX features:**
- Optimistic user message rendering during SSE stream
- Error recovery: failed sends show dismissable red banner + revert optimistic message
- `?task=ID` URL state (useSearchParams) — links to specific tasks work
- Delete with `window.confirm()` guard
- "Mark Complete" button appears when status is `executing`
- Executing status shows chosen approach name + execution steps list

### Wiring
| File | Change |
|---|---|
| `server/db/migrations/026_anton_self_knowledge.sql` | New migration (tables + seed data + indexes) |
| `server/db/init.ts` | Migration 026 sentinel check (checks if `anton_capabilities` table exists) |
| `server/index.ts` | `app.use('/api/task-agent', createTaskAgentRoutes(db, anthropic))` |
| `src/App.tsx` | Lazy import + `/task-agent` route |
| `src/components/layout/Sidebar.tsx` | NavLinkWithStar entry + navConfig map entry |
| `src/components/layout/NavItemConfig.tsx` | `{ id: 'task-agent', label: 'ANTON Task Agent', category: 'intelligence' }` |

### 10-Expert Review + Post-Review Fixes

A 10-expert agent panel (Project Lead, UX, Backend Engineer, FCP Consultant, Engineering Manager, Security Engineer, AI Engineer, Product Manager, DB Architect, Compliance Consultant) reviewed the full Task Agent implementation. Fixes applied from their findings:

| Fix | Area |
|---|---|
| User isolation: all endpoints now filter by `user_id` | Security |
| `/ingest` secured with `X-ANTON-Token` webhook secret | Security |
| Input length bounds on all POST endpoints | Security |
| Conversation history truncated to last 30 messages | Reliability |
| Query `limit` capped at 100 | Reliability |
| Model upgraded to `claude-sonnet-4-6` | Quality |
| System prompt rewritten with explicit DECISION LOGIC | Quality |
| Hallucination guard: CRITICAL instruction on approach_id | Quality |
| Delete confirmation `window.confirm()` added | UX |
| "Mark Complete" button added for executing status | UX |
| Error banner + message revert on SSE failure | UX |
| 6 missing capabilities added (DJ Screening, Roaring, Radar, Sanctions Module, Wolfsberg CBDDQ, Orchestrator) | Coverage |
| 2 missing approaches added (Sanctions Review, KYC/CDD Refresh) | Coverage |
| 3 missing DB indexes added (due_date, confidence, area) | Performance |
| DORA article count corrected: 64 → 73 | Accuracy |

### What's Not Yet Done (Task Agent)

| Item | Priority | Complexity |
|---|---|---|
| Quality rating widget (stars or RAG) at task completion | High | Low |
| Module navigation banner: "Next Step: Open [Module]" after approach selected | High | Low |
| Render clarifying questions as structured form fields, not plain chat | Medium | Medium |
| Expand capability coverage: 14 FCP-legal modules from `fcp-legal-patch.ts` | Medium | Low |
| Quality score write-back to `avg_quality_score` on approaches (learning loop) | Medium | Medium |
| Jira OAuth integration for `/ingest` (currently token-only) | Low | High |
| Kanban view (drag-to-status) as alternative to list view | Low | Medium |
