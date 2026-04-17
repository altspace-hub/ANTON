# ANTON Missions — Canonical Specification v2.0

**Version:** 2.0.0
**Date:** 2026-04-17
**Status:** Authoritative — supersedes the four prior documents
**Target:** v0.8.0 (Phase 1) → v1.0.0 (Phase 5)
**Pillar:** Work (primary), Life (secondary)

---

## 0. SUPERSEDES

This document supersedes:

- `ANTON_MISSIONS_SPEC_AND_CLAUDE_CODE_BRIEF.md` (v1.0.0, 2026-04-15) — base spec
- `ANTON_MISSIONS_DB_ARCHITECTURE_ADR.md` (v1.0.0, 2026-04-17) — ADR for PostgreSQL schema separation
- `ANTON_MISSIONS_ADDENDUM_GAPS_AND_HYPE.md` (v1.1.0, 2026-04-15) — 11 gap items + 7 use cases
- `ANTON_SERVICE_PACK_TARGET_MAP.md` — 182-service catalog

The originals are preserved for historical reference but **no longer authoritative**. When they conflict with this document, this document wins.

### Corrections rolled in

| Was | Now | Why |
|---|---|---|
| SQLite-compatible DDL with `AUTOINCREMENT`, `DATETIME DEFAULT CURRENT_TIMESTAMP`, `INTEGER DEFAULT 0` | PostgreSQL-only with `BIGSERIAL`, `TIMESTAMPTZ DEFAULT NOW()`, `BOOLEAN DEFAULT FALSE`, `JSONB`, `UUID` | Codebase is PG-only (memory feedback); ADR mandates it |
| Single `public` schema, no prefixes | Dedicated `missions` schema with cross-schema FKs to `public` | ADR; clean namespace + future physical separation |
| Phase 1 = v0.7.0, Phase 5 = v0.9.0 | Phase 1 = v0.8.0, Phase 5 = v1.0.0 | ANTON is at v0.7.5; old phasing is stale |
| No mention of BEEHIVE / Specialized Agents / Grow / Procure / Civic / App Gateway | Explicit integration boundaries — see §13 | Those pillars all shipped after April 15 |
| Addendum's `parallel_review` checkpoint as a Canvas session | `parallel_review` checkpoint creates a BEEHIVE session | BEEHIVE is the right primitive (multi-party signed convergence) |
| Addendum's `leads` data table as standalone | Sales-style missions write to Grow CRM tables; `mission_data_rows` is the GENERIC fallback for ad-hoc structured storage | Grow ships with the schema we'd otherwise duplicate |
| Mission Controller as an autonomous agent (overlapped with Specialized Agents) | Missions = proactive long-running work; Specialized Agents = reactive query handlers; **kept distinct** | They serve different patterns; merging would be premature |
| Single-instance assumption | Phase 5 wires multi-instance via AAP, but Phase 1 is local-only with identity binding (community_identity) | Same identity-binding pattern as BEEHIVE Phase 1 |
| `mission_event_queue` as a new table | Reused — but acknowledged that it's distinct from `event-workflow-processor.ts` (which handles internal triggers, not external inbound) | They're complementary, not duplicates |

---

## 1. EXECUTIVE SUMMARY

ANTON Missions introduces a persistent, self-directing autonomous agent mode. Unlike sessions (synchronous, single-topic, human-driven), missions are:

- **Asynchronous** — run in the background, wake and sleep
- **Multi-step** — decompose into a directed-acyclic task graph executed over hours/days
- **Self-directing** — ANTON decides what to do next based on progress and findings
- **Accumulative** — every step produces knowledge atoms that inform subsequent steps
- **Governed** — subject to budgets, compliance rules, quality thresholds, and human checkpoints

**Tagline:** *"Brief it. Trust it. Review the results."*

This is the bridge between Layer 2 (Intelligent ANTON) and Layer 3 (The Network) of the six-layer vision. An ANTON that can execute missions independently is an ANTON that can accept missions from other ANTONs via AAP — which is the prerequisite for the marketplace and the economy.

---

## 2. SCOPE

### 2.1 In scope (v1)

- Mission lifecycle: create → brief → active → review → completed (or paused / aborted)
- Task graph DAG with sequential and parallel execution
- LLM-driven task decomposition (with human review at Check-in autonomy)
- Earned autonomy per mission TYPE (not per individual mission)
- Token + time budget tracking with hard stops
- Mission-scoped data isolation
- Failure recovery with self-correction loop
- Mission Dashboard with live task graph + activity feed + budget monitor
- Mission templates (importable/exportable as `.anton` packages)
- Multi-model architecture via existing `unified-llm-client.ts`
- EU AI Act compliance (disclosure, audit trail, high-risk classification)

### 2.2 Out of scope (v1) — deferred

- Action Layer (Playwright browser automation, Credential Vault, Service Packs) → **Phase 2**
- Multi-track missions, hot-context interactive mode → **Phase 2**
- Inbound event queue for external triggers → **Phase 2**
- Stage-and-hold browser transactions → **Phase 2**
- Web change monitor (snapshot + diff) → **Phase 2**
- Multi-person checkpoints (BEEHIVE-backed) → **Phase 3**
- Document intake pipeline → **Phase 3**
- Document template assembly → **Phase 3**
- Output delivery channels (Slack, Drive, SharePoint, etc.) → **Phase 3**
- Email sequence engine → **Phase 3**
- Multi-mission Control Centre → **Phase 3**
- Financial budget + FutureChain wallet → **Phase 4**
- AAP-based mission delegation across ANTON instances → **Phase 5**

### 2.3 Phased rollout

| Phase | Version | Scope |
|---|---|---|
| **Phase 1: Foundation** | v0.8.0 | Mission Controller, Task Decomposition, Dashboard, basic lifecycle, context reconstruction, resource budgeting, ONE working starter template |
| **Phase 2: Action Layer** | v0.8.5 | Credential Vault, Playwright, LLM-guided browser, Service Packs (5 priority packs), web change monitor, stage-and-hold, multi-track missions, event queue, hot context |
| **Phase 3: Intelligence + Delivery** | v0.9.0 | Self-correction loop, mission-scoped isolation, EU AI Act enforcement, output delivery channels, document intake, template assembly, multi-person checkpoints (BEEHIVE-backed), Mission Control Centre, email sequences |
| **Phase 4: Financial** | v0.9.5 | FutureChain wallet integration, financial budgeting, payment actions with approval workflows |
| **Phase 5: Network** | v1.0.0 | AAP-based mission delegation (ANTON-to-ANTON), sub-mission assignment, cross-instance coordination |

---

## 3. STRATEGIC POSITION

### 3.1 Why ANTON Missions is differentiated

The autonomous agent space (Devin, OpenAI Operator, Salesforce Agentforce, CrewAI, LangChain) is the dominant 2026 AI hype cycle. Every existing system has at least one of these gaps:

- **Domain-locked** (Devin = coding only, Agentforce = Salesforce only)
- **No professional governance** (no quality scoring, no compliance rails, no audit trails)
- **No institutional learning** (every mission starts from zero context)
- **No earned autonomy** (binary: either fully autonomous or fully manual)
- **No professional knowledge architecture** (no 7-layer prompts, no knowledge atoms, no personas)

ANTON Missions is the **first professional knowledge work autonomous agent** with built-in quality governance, compliance rails, earned autonomy, institutional memory, and a payment system (FutureChain).

### 3.2 Position in the six-layer vision

```
Layer 1: Individual ANTON       ← shipped (v0.5–v0.7.5)
Layer 2: Intelligent ANTON      ← MISSIONS LIVE HERE (v0.8.0)
Layer 3: The Network            ← Missions + AAP = network-delegated work
Layer 4: Collaborative Intel.   ← BEEHIVE shipped; Mission checkpoints can use BEEHIVE in Phase 3
Layer 5: The Marketplace        ← Mission templates as marketplace products
Layer 6: The Economy            ← FutureChain-funded missions
```

---

## 4. CORE CONCEPTS

### 4.1 Mission

A persistent, goal-oriented work assignment that ANTON executes autonomously over time. Created from a `MissionBrief`, decomposed into a `TaskGraph`, executed against the Mission Lifecycle state machine, governed by budgets + compliance + earned autonomy.

### 4.2 Mission Brief

The human input that starts a mission:

| Field | Required | Type | Description |
|---|---|---|---|
| `title` | Yes | string | Short human-readable name |
| `objective` | Yes | string | Natural-language description of what to achieve |
| `success_criteria` | Yes | string | How completion is measured |
| `context` | No | string | Background info, constraints, preferences |
| `autonomy_level` | Yes | enum | `check_in` / `briefing` / `full_autonomy` (see §4.4) |
| `budget` | Yes | object | Token + time + financial budget (see §5) |
| `data_scope` | No | object | Modules, knowledge sources, atom scopes (see §6) |
| `model_strategy` | No | object | Per-tier model selection (see §10) |
| `notification_preferences` | No | object | When and how to notify |
| `template_id` | No | string | Start from a pre-built mission template |
| `deadline` | No | timestamp | When must the mission be complete |

### 4.3 Task Graph

The Mission Controller decomposes the objective into a **directed acyclic graph (DAG)** of tasks. Each task:

- Maps to one or more ANTON module invocations (or external action — Phase 2+)
- Has explicit dependencies (which tasks must complete first)
- Has a priority and estimated effort (tokens + time)
- Can spawn sub-tasks dynamically based on findings
- Produces typed outputs: knowledge atoms, documents, decisions, data

**Example task graph (AMLR Readiness Assessment):**

```
Mission: "Prepare AMLR Readiness Assessment for Client X"
│
├─ Task 1: Research current AMLR requirements [Module: Regulatory Monitor]
│   ├─ Task 1.1: Fetch latest AMLR text from EUR-Lex
│   └─ Task 1.2: Extract key compliance requirements
│
├─ Task 2: Gather client context
│   ├─ Task 2.1: Load client profile from knowledge atoms
│   └─ Task 2.2: Identify client's current compliance posture
│
├─ Task 3: Run gap analysis [depends: Task 1, Task 2]
│   ├─ Task 3.1: Map requirements to client controls
│   ├─ Task 3.2: Score each gap by severity + effort
│   └─ Task 3.3: Generate remediation roadmap
│
├─ Task 4: Produce deliverables [depends: Task 3]
│   ├─ Task 4.1: Draft executive summary
│   ├─ Task 4.2: Generate detailed gap matrix
│   └─ Task 4.3: Create presentation deck
│
├─ ★ CHECKPOINT: Human review of deliverables
│
└─ Task 5: Finalise and deliver [depends: checkpoint approval]
    ├─ Task 5.1: Apply review feedback
    └─ Task 5.2: Export final package (.anton bundle)
```

### 4.4 Autonomy Levels

Aligned with the existing Apprentice Model — trust is earned, not granted.

| Level | Name | Behaviour | Human Role | When to Use |
|---|---|---|---|---|
| 1 | **Check-in** | Proposes each next action, waits for approval before executing | Approves every step | New mission types, high-risk work, financial actions |
| 2 | **Briefing** | Works autonomously, sends periodic progress summaries, pauses at defined checkpoints | Reviews summaries, approves at checkpoints | Established mission patterns, moderate risk |
| 3 | **Full Autonomy** | Works independently, human reviews final output only | Reviews completed deliverables | Proven mission types with consistent quality history |

**Autonomy progression:** A mission *type* (not individual mission) earns autonomy through the same criteria as the Apprentice Model — number of successful completions, override rate, quality scores. A "Monthly Compliance Report" mission that has run successfully 10 times with <5% override rate can be promoted from Check-in to Briefing.

**Autonomy overrides — these always trigger human escalation regardless of earned level:**
- Quality Ratchet score drops below configured threshold
- Compliance-as-Code violation detected
- Financial action exceeds pre-approved category/limit
- Mission encounters a situation not covered by the task graph
- Confidence score on any output falls below 0.6

### 4.5 Mission Lifecycle

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  DRAFT   │───▶│ BRIEFED  │───▶│  ACTIVE  │───▶│ REVIEW   │
│ Human    │    │ ANTON    │    │ ANTON    │    │ Human    │
│ writes   │    │ proposes │    │ executes │    │ reviews  │
│ brief    │    │ task DAG │    │ tasks    │    │ outputs  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                                     │               │
                                     ▼               ▼
                                ┌──────────┐    ┌──────────┐
                                │  PAUSED  │    │COMPLETED │
                                │ Waiting  │    │ Archived │
                                │ for human│    │ with all │
                                │ or event │    │ artifacts│
                                └──────────┘    └──────────┘
                                     │
                                     ▼
                                ┌──────────┐
                                │ ABORTED  │
                                │ Budget   │
                                │ exceeded │
                                │ or human │
                                │ cancelled│
                                └──────────┘
```

**States:** `draft` → `briefed` → `active` → `paused` | `review` → `completed` | `aborted`

### 4.6 Mission Context Reconstruction

**The core technical challenge.** LLMs have no native memory between API calls. Every wake-up reconstructs context.

**Protocol:**
1. Load mission header — objective, success criteria, autonomy level, budgets consumed
2. Load task graph state — which tasks are complete / in progress / blocked, with outputs
3. Load accumulated knowledge atoms (mission-scoped)
4. Load decision log (compressed)
5. Load last N activity entries — recent actions for continuity
6. Compute "mission summary" — LLM-generated compression of the above

**Token budget for reconstruction:** Maximum 20% of available context window.

| Provider / Model | Context Window | Reconstruction Budget (20%) | Working Budget (80%) |
|---|---|---|---|
| Anthropic Opus 4.7 | 1,000,000 | 200,000 | 800,000 |
| Anthropic Sonnet 4.6 | 1,000,000 | 200,000 | 800,000 |
| Anthropic Sonnet 4.5 | 200,000 | 40,000 | 160,000 |
| Anthropic Haiku 4.5 | 200,000 | 40,000 | 160,000 |
| Mistral Large | 128,000 | 25,600 | 102,400 |
| OpenAI GPT-4 Turbo | 128,000 | 25,600 | 102,400 |
| Gemini 2.0 Flash | 1,000,000 | 200,000 | 800,000 |
| Ollama (varies) | model-dependent | model-dependent | model-dependent |

**Mission summary compression target: <25K tokens** to ensure compatibility with all supported models (128K context window minus 80% working budget = ~25K reconstruction headroom).

**Compaction integration:** Use `compact-2026-01-12` beta header for Anthropic. For non-Anthropic providers, the Mission Controller implements its own compaction.

**Model-aware reconstruction:** `mission-context.ts` calls `getPromptTier()` and adjusts:
- **Large-context models** (Opus, Sonnet 4.6, Gemini Flash): Full task outputs, detailed decision reasoning, broader atom context
- **Medium-context models** (Mistral Large, GPT-4 Turbo, Sonnet 4.5): Summarised task outputs, compressed decision log, most relevant atoms only
- **Small-context models** (Haiku, Ollama small): Mission summary only, minimal history, current task context

---

## 5. RESOURCE BUDGETING

Every mission has three budgets with hard stops.

### 5.1 Token Budget

| Parameter | Default | Description |
|---|---|---|
| `max_tokens_total` | 5,000,000 | Maximum tokens across all API calls |
| `max_tokens_per_task` | 500,000 | Maximum for any single task |
| `warning_threshold` | 80% | Alert human when this % consumed |
| `hard_stop` | 100% | Mission pauses (not aborts) |

### 5.2 Time Budget

| Parameter | Default | Description |
|---|---|---|
| `max_duration` | 7 days | Maximum wall-clock time start to completion |
| `max_active_time` | 24 hours | Maximum cumulative active processing time |
| `wake_interval_min` | 5 minutes | Minimum between wake cycles |
| `wake_interval_max` | 24 hours | Maximum between wake cycles (prevents abandonment) |

### 5.3 Financial Budget (Phase 4 — opt-in)

| Parameter | Default | Description |
|---|---|---|
| `max_spend_total` | 0 (disabled) | Maximum total spend from FutureChain wallet |
| `max_spend_per_transaction` | 0 (disabled) | Maximum single transaction |
| `approved_spend_categories` | [] | Pre-approved categories (e.g., "advertising", "subscriptions") |
| `approval_delay_seconds` | 900 (15 min) | Delay before financial action executes (cancel window) |
| `requires_human_approval` | true | Financial actions always need human sign-off |

**Important:** Financial budget is **disabled by default** and requires explicit opt-in. The autonomous-work capability ships first; financial autonomy is Phase 4.

---

## 6. MISSION-SCOPED DATA ISOLATION

Missions operate in data-scoped sandboxes to prevent information leakage between sensitive workstreams.

### 6.1 Isolation model

```
┌─ Mission A: "HR Recruitment Drive" ─────────────────────┐
│  Can access: HR modules, public knowledge, job-market    │
│  Cannot access: Finance data, client confidential        │
│  Atoms produced: Tagged mission_id=A, scope=hr           │
└──────────────────────────────────────────────────────────┘

┌─ Mission B: "Client X Compliance Review" ───────────────┐
│  Can access: Compliance modules, Client X data, regulatory│
│  Cannot access: HR data, other client data                │
│  Atoms produced: Tagged mission_id=B, scope=client_x      │
└──────────────────────────────────────────────────────────┘
```

### 6.2 Data scope configuration

Each mission brief includes `data_scope`:

```json
{
  "data_scope": {
    "modules_allowed": ["fcp/*", "regulatory/*", "reporting/*"],
    "modules_denied": ["hr/*", "finance/personal"],
    "knowledge_sources": ["web", "local:/compliance-docs"],
    "atom_read_scopes": ["global", "client_x"],
    "atom_write_scope": "mission_b",
    "inherit_atoms_from_missions": ["mission_a_id"],
    "external_services_allowed": ["eur-lex", "company-registry"],
    "external_services_denied": ["social-media", "payment-*"]
  }
}
```

### 6.3 Cross-mission intelligence

While missions are isolated by default, the 5-layer intelligence funnel can detect patterns **across** missions (with appropriate permissions). Example: "Pattern detected: Client X compliance gaps are similar to patterns seen in Client Y (anonymised)" — surfaced to the human, never leaked between mission contexts directly.

---

## 7. FAILURE RECOVERY & ESCALATION

**Design principle:** ANTON should never "push forward on impossible tasks." It should recognise when stuck and escalate intelligently.

### 7.1 Failure taxonomy

| Type | Detection | Response |
|---|---|---|
| **Transient** | API timeout, rate limit, network | Auto-retry with exponential backoff (max 3) |
| **Quality** | Output below Quality Ratchet threshold | Re-attempt with different approach; if still below, escalate |
| **Compliance** | Compliance-as-Code violation | Halt task immediately, log violation, notify human |
| **Knowledge Gap** | Cannot find sufficient information | Pause task, notify human with specific question, continue others |
| **Ambiguity** | Task requirements unclear/contradictory | Pause task, present options for clarification |
| **Scope Creep** | Decomposition reveals mission is larger than expected | Pause, present revised graph + budget, await approval |
| **Budget** | Token/time/financial threshold reached | Pause mission, present progress + remaining-work estimate |
| **Unexpected** | Any unclassified error | Log full context, pause mission, notify human with diagnostic |

### 7.2 Escalation protocol

```
Failure detected
    │
    ├─ Transient? → Retry (max 3x) → still failing → Escalate
    │
    ├─ Other tasks can continue? → Yes → Park failed task, continue others
    │                              → No  → Pause entire mission
    │
    ├─ Human reachable? → Check notification preferences
    │   ├─ Urgent channel available → Send immediate notification
    │   └─ No urgent channel → Queue for next check-in, continue safe tasks
    │
    └─ Log everything → Full failure context for debugging
```

### 7.3 Self-correction loop (before escalating)

1. Re-read the mission brief — did I misinterpret the objective?
2. Check knowledge atoms — do I have information I haven't used?
3. Try alternative module — is there a different ANTON module that could handle this?
4. Try alternative approach — can I break this task into smaller sub-tasks?
5. Search for guidance — web search for how-to / best practices?
6. Only then escalate — with a clear description of what was tried and why it failed

---

## 8. OBSERVABILITY: MISSION DASHBOARD

**Design principle:** Solve the "anxiety of absence" — the user should always feel informed and in control even when ANTON works autonomously.

### 8.1 Dashboard components

**Mission Overview Panel:**
```
┌────────────────────────────────────────────────────────────┐
│ Mission: AMLR Readiness Assessment — Client X              │
│ Status: ● Active    Autonomy: Briefing    Started: Apr 12  │
│ Progress: ████████░░ 73%    Budget: 2.1M / 5M tokens       │
│ Tasks: 8/12 complete  |  2 active  |  2 queued             │
│ Next checkpoint: Task 4 deliverable review (est. 2 hours)  │
│ Health: 🟢 On Track                                        │
├────────────────────────────────────────────────────────────┤
│ [Pause] [View Task Graph] [Peek] [Budget Details] [Abort] │
└────────────────────────────────────────────────────────────┘
```

**Live Task Graph** — Visual DAG with task states (✅ complete, 🔄 active, ⏳ queued, 🚫 blocked, ❌ failed) and dependency arrows.

**Activity Feed** — Rolling log of actions with timestamps, knowledge atoms produced, quality scores.

**Peek Function** — Inspect what ANTON is currently processing without interrupting.

**Budget Monitor** — Real-time consumption with burn-rate projection.

### 8.2 Notification tiers

| Tier | When | Channel | Examples |
|---|---|---|---|
| **FYI** | Routine progress | Batched daily/weekly email or in-app | "Mission 73% complete. 8/12 tasks done." |
| **Review** | Output ready for approval | Push + email | "Gap analysis ready for your review." |
| **Urgent** | Blocked, budget warning, compliance violation | Push + SMS (if configured) | "Mission paused: compliance violation in Task 3.2" |

Notification preferences are per-mission configurable, with sensible defaults per autonomy level.

---

## 9. MISSION TEMPLATES

Pre-built mission configurations that lower the barrier to entry and serve as marketplace products.

### 9.1 Template structure

A mission template is an `.anton` package (type: `mission_template`):

```json
{
  "template_id": "amlr-readiness-assessment-v1",
  "name": "AMLR Readiness Assessment",
  "description": "Comprehensive gap analysis against AMLR requirements",
  "version": "1.0.0",
  "author": "Advisense / Daniel Bardun",
  "pillar": "work",
  "category": "compliance",
  "estimated_duration": "4-8 hours",
  "estimated_tokens": "3,000,000-5,000,000",
  "parameters": [
    { "key": "client_name", "label": "Client Name", "type": "string", "required": true },
    { "key": "jurisdiction", "label": "Primary Jurisdiction", "type": "select",
      "options": ["EU", "Sweden", "UK", "Multi-jurisdiction"], "default": "EU" },
    { "key": "entity_type", "label": "Entity Type", "type": "select",
      "options": ["Credit Institution", "Payment Institution", "Investment Firm"], "required": true }
  ],
  "task_graph_template": { ... },
  "default_data_scope": { ... },
  "default_budget": { ... },
  "required_modules": ["fcp/gap-analysis", "fcp/regulatory-monitor", "reporting/executive-summary"],
  "success_criteria_template": "Deliver a complete gap analysis report with severity ratings for all applicable AMLR articles, a prioritised remediation roadmap, and an executive summary suitable for board presentation."
}
```

### 9.2 v1 starter templates

**Phase 1 ships with ONE template:** `Knowledge Synthesis` — a generic objective → research → synthesise → deliver flow that uses Knowledge Sources + the existing module library. Demonstrates the full pipeline without needing the Action Layer.

**Phase 2-3 add (Work pillar):**

| Template | Description | Est. Duration |
|---|---|---|
| AMLR Readiness Assessment | Full gap analysis against AMLR requirements | 4-8 hours |
| Monthly Compliance Monitor | Scan regulatory radar, assess impact, produce summary | 1-2 hours/month |
| Policy Review & Update | Review policy suite against regulatory changes | 6-12 hours |
| Competitor Intelligence Report | Research and analyse competitor landscape | 3-6 hours |
| Client Onboarding Analysis | Assess new client risk profile and DD needs | 2-4 hours |
| Recruitment Pipeline | Research market, draft job ads, screen applications | Ongoing |
| Online Marketing Campaign | Content strategy, create posts, schedule, track | Ongoing |
| Internal Audit Preparation | Prepare documentation and gap analysis for audit | 8-16 hours |
| Consultant on Retainer | Standing brief for proactive analysis and updates | Ongoing |
| HR On Demand | Onboarding workflows, policy maintenance, training | Ongoing |

**Life pillar (Phase 3):**

| Template | Description |
|---|---|
| Personal Finance Review | Analyse spending, investment performance, suggest adjustments |
| Travel Planner | Research, plan, optimise itinerary for a trip |
| News Intelligence Briefing | Daily/weekly curated news with bias analysis |

---

## 10. MULTI-MODEL ARCHITECTURE

### 10.1 The Unified Adapter Contract

The Mission Controller interacts with LLMs **exclusively** through `unified-llm-client.ts` and `provider-router.ts`. It NEVER imports provider-specific SDKs or constructs provider-specific payloads.

This means:
- A mission that works on Claude Opus also works on Mistral Large, GPT-4, Gemini Flash, or any Ollama model
- The 7-layer prompt system assembles prompts identically for all providers — the adapter layer handles translation
- `getPromptTier()` auto-detects model size and adjusts prompt verbosity (not capability) — smaller models get more concise prompts, not degraded prompts

### 10.2 Model selection per task

```
Mission Brief
  └─ model_strategy.planning_model = "auto"
  └─ model_strategy.execution_model = "auto"
  └─ model_strategy.utility_model = "auto"
  └─ model_strategy.provider_preference = "any"

Mission Controller resolves "auto" at runtime:
  └─ Planning tasks → highest available model
  └─ Analysis tasks → user's default or highest available
  └─ Research tasks → mid-tier model
  └─ Summarisation → cheapest available model
```

### 10.3 Provider-specific capabilities matrix

| Capability | Anthropic | Mistral | OpenAI | Gemini | Ollama |
|---|---|---|---|---|---|
| Max context window | 1M (Opus 4.7 / Sonnet 4.6) | 128K | 128K | 1M | Model-dependent |
| Native web search | Yes (tool) | No | No | Yes (grounding) | No |
| Prompt caching | Yes (90% savings) | No | No | Yes (context caching) | No |
| Streaming | Yes | Yes | Yes | Yes | Yes |
| Seed/reproducibility | No | Yes | Yes | No | Model-dependent |
| Extended thinking | Yes (effort param) | No | No | Yes (thinking) | No |
| EU data residency | No (US-based) | Yes (EU-based) | No (US-based) | No (US-based) | Yes (local) |
| Air-gapped operation | No | No | No | No | Yes |
| Native compaction | Yes (beta header) | No | No | No | No |

**How the Mission Controller uses this:**
- **Web search tasks:** If active provider doesn't support native web search, route through MCP web search or fall back to a provider that does
- **Context reconstruction:** Adapt compression aggressiveness based on context window
- **Compaction:** Use native compaction for Anthropic; ANTON-managed for all others
- **EU data residency:** If `provider_preference: "mistral"` or `"ollama"`, all LLM calls stay within EU/local infrastructure
- **Air-gapped:** If `provider_preference: "ollama"`, disable all web search and external URL fetching

### 10.4 Provider fallback chain

```
Primary provider (user configured)
  │ fails → log, check fallback_enabled
  ▼
Fallback #1 (next in preference chain)
  │ fails → log, try next
  ▼
Fallback #2 → ... → all exhausted
  ▼
Pause mission, escalate:
  "All configured LLM providers unavailable.
   Last error: ...
   Mission paused at task: ..."
```

Default fallback chain: User's preferred → Anthropic → Mistral → OpenAI → Gemini → Ollama

Fallback respects data residency. EU-only missions: Mistral + Ollama only. Air-gapped: Ollama only.

### 10.5 Cost estimation per provider

Mission templates include estimated costs **per provider**:

```json
{
  "cost_estimates": {
    "anthropic_opus": { "estimated_tokens": 3000000, "estimated_cost_usd": 52.50 },
    "anthropic_sonnet": { "estimated_tokens": 3000000, "estimated_cost_usd": 12.00 },
    "mistral_large": { "estimated_tokens": 3000000, "estimated_cost_usd": 16.00 },
    "openai_gpt4": { "estimated_tokens": 3000000, "estimated_cost_usd": 40.00 },
    "gemini_flash": { "estimated_tokens": 3000000, "estimated_cost_usd": 0.75 },
    "ollama_local": { "estimated_tokens": 3000000, "estimated_cost_usd": 0.00, "note": "GPU power cost only" }
  }
}
```

The Mission Creator UI shows a cost comparison when the user selects a provider/model.

---

## 11. EU AI ACT COMPLIANCE

### 11.1 External communication disclosure

When a mission involves external-facing communication (emails, social media posts, chat messages, candidate correspondence), ANTON **always** identifies itself as an AI system.

**Implementation:** Every external-facing output includes a configurable disclosure:
- Default: "This communication was prepared by ANTON, an AI-powered professional assistant, and reviewed by [human name]."
- Per-mission customisable but **cannot be removed** — hard compliance requirement.

### 11.2 EU AI Act Annex III — high-risk classifications

Missions involving the following are automatically classified high-risk:

| Use Case | AI Act Category | Additional Requirements |
|---|---|---|
| Recruitment / CV screening | Employment (Annex III §4) | Dual-model bias audit, human review mandatory, discrimination testing |
| Credit assessment | Financial services (Annex III §5b) | Explainability logs, human decision authority, adverse action logging |
| Regulatory compliance assessment | Indirect: affects regulatory outcomes | Full audit trail, confidence scoring, human accountability |

High-risk missions **cannot** operate at Full Autonomy. Maximum: Briefing with mandatory human checkpoints.

### 11.3 Audit trail for autonomous decisions

Every decision logged:

```json
{
  "decision_id": "d-2026-04-15-001",
  "mission_id": "m-amlr-readiness-x",
  "task_id": "t-3.2",
  "timestamp": "2026-04-15T14:42:00Z",
  "decision_type": "approach_selection",
  "description": "Selected severity rating methodology",
  "options_considered": [
    { "option": "AMLA 5-level scale", "score": 0.82, "reasoning": "..." },
    { "option": "Client's existing 3-level scale", "score": 0.71, "reasoning": "..." }
  ],
  "selected": "AMLA 5-level scale",
  "confidence": 0.82,
  "overridden_by_human": false,
  "compliance_check_passed": true
}
```

---

## 12. ARCHITECTURAL DECISIONS (ADR)

### 12.1 PostgreSQL with `missions` schema (no SQLite)

**Decision:** ANTON Missions requires **PostgreSQL** as its database. No fallback to any other engine. Mission-specific tables live in a dedicated `missions` schema within the same PostgreSQL instance as the platform core.

**Rationale:**
1. **Logical separation without operational overhead** — one DB instance, one connection string, one backup procedure
2. **Cross-schema intelligence preserved** — FKs from `missions.*` to `public.knowledge_atoms`, `public.users`, `public.audit_log` work natively
3. **Independent lifecycle management** — mission tables can have different retention policies, vacuum schedules, partitioning without affecting platform tables
4. **Future physical separation is clean** — if enterprise deployments need to move missions to a separate database, the schema boundary makes that migration well-defined
5. **Permission scoping** — PostgreSQL roles can be granted schema-level permissions

**PG-native types used everywhere:**
- `JSONB` instead of `TEXT DEFAULT '{}'` (better indexing, querying, validation)
- `TIMESTAMPTZ DEFAULT NOW()` instead of `DATETIME` (timezone-aware)
- `BIGSERIAL` for high-growth auto-increment columns
- `UUID` for IDs that may cross instances via AAP (Phase 5)
- Native `CHECK` constraints for enums; `ENUM` types only when frequently queried

### 12.2 Cross-schema patterns

**Direction of dependency:** `missions` depends on `public`, never the reverse. The `public` schema has zero awareness of `missions`.

| `missions` table | Column | References | `public` table |
|---|---|---|---|
| `missions.missions` | `created_by` | → | `public.users(id)` |
| `missions.credential_vault` | `created_by` | → | `public.users(id)` |
| `missions.mission_decisions` | — | writes to → | `public.audit_log` (service call, not FK) |
| `missions.mission_tasks` | — | invokes → | `public.compliance_rules` (service call) |
| `missions.mission_tasks` | — | produces → | `public.knowledge_atoms` (atoms tagged with mission_id) |
| `missions.mission_tasks` | — | contributes → | `public.entity_nodes` |
| `missions.missions` | — | checked against → | `public.apprentice_stages` |
| `missions.mission_templates` | — | may reference → | `public.workflows` |

**Knowledge atoms stay in `public.knowledge_atoms`** (not duplicated to `missions`). Mission writes are tagged with `mission_id` and `mission_scope` columns added to the public table. This is intentional — atoms from missions and from interactive sessions must be queryable together for the intelligence funnel.

**Application code pattern:** Always use fully-qualified table names (`missions.tasks`, `public.users`) in queries. Never rely on `search_path`. This is unambiguous and audit-friendly.

### 12.3 Identity binding (Phase 1 local-only)

**Decision:** Mirror the BEEHIVE identity-binding pattern. Every operation that names a "who" (mission `created_by`, task `assigned_to`, decision `decided_by`) is bound to the locally activated `community_identity`.

The client MAY supply the hash for UX clarity, but the server always validates against `community_identity` and rejects mismatches with 403. Phase 5 will replace this with Ed25519 signature verification on AAP messages.

### 12.4 LLM access — `unified-llm-client.ts` ONLY

**Decision:** All Mission code calls LLMs through `provider-router.ts` (`callChat`, `streamChat`). No direct provider SDK imports. This guarantees model-agnostic behaviour.

### 12.5 Filesystem layout (non-database storage)

```
data/
  ├── missions/
  │   ├── screenshots/          ← browser action screenshots (Phase 2)
  │   │   └── {mission_id}/{task_id}/{action_id}_{before|after}.png
  │   ├── snapshots/            ← web monitor screenshots (Phase 2)
  │   │   └── {mission_id}/{url_hash}_{timestamp}.png
  │   ├── documents/            ← intake pipeline downloaded files (Phase 3)
  │   │   └── {mission_id}/{intake_id}_{filename}
  │   ├── deliverables/         ← generated outputs (DOCX, XLSX, PPTX, PDF)
  │   │   └── {mission_id}/{task_id}_{filename}
  │   └── templates/            ← document assembly templates (Phase 3)
```

### 12.6 Retention & growth management

| Table | Growth Pattern | Estimated Rows/Month | Retention |
|---|---|---|---|
| `missions.missions` | Slow | 5-20 | Permanent |
| `missions.mission_tasks` | Moderate | 50-1,000 | Permanent |
| `missions.mission_activity` | Fast | 5,000-50,000 | **90 days active, then archive** |
| `missions.mission_decisions` | Moderate | 50-500 | Permanent (audit) |
| `missions.browser_actions` (Phase 2) | Fast | 1,000-20,000 | **30 days, then summary only** |
| `missions.web_snapshots` (Phase 2) | Moderate | 200-2,000 | **Text 180 days, screenshots 30 days** |
| `missions.mission_data_rows` (Phase 2) | Variable | 100-50,000 | Mission lifetime |
| `missions.mission_event_queue` (Phase 2) | Fast | 500-10,000 | **7 days after processing** |
| `missions.credential_access_log` (Phase 2) | Moderate | 100-1,000 | **1 year (compliance)** |

**Partitioning** (Phase 2+) for `mission_activity` and `browser_actions`: PG native `PARTITION BY RANGE (timestamp)` monthly. Use `pg_partman` extension if available, otherwise scheduled task creates next month's partition.

**Cleanup service** runs daily via CRON: archives old activity, purges processed events, deletes old screenshots, vacuums after bulk deletions.

---

## 13. INTEGRATION WITH EXISTING ANTON (boundary decisions)

The base spec was written before BEEHIVE / Specialized Agents / Grow / Procure / Civic / App Gateway / Markets shipped. These are explicit boundary decisions for v2.

### 13.1 Specialized Agents (migration 111) — KEEP SEPARATE

| Specialized Agents | Missions |
|---|---|
| Reactive — handle inbound queries | Proactive — execute outbound autonomous work |
| Stateless per conversation | Stateful, accumulate over hours/days |
| Single-conversation focus | Multi-task, multi-step DAG |
| Configured by `agent_profiles` | Configured by `mission_brief` + `mission_templates` |
| Uses `agent_connectors` for tool calls | Uses Action Layer (Phase 2) for browser/API/MCP |

**Decision:** Don't merge. They serve different patterns. A Mission MAY invoke a Specialized Agent as one of its task execution strategies (e.g. a recruitment mission delegates candidate-screening Q&A to the "Recruitment Assistant" agent). Document this as a Phase 3+ integration.

### 13.2 BEEHIVE (just shipped) — used for parallel-review checkpoints

The Addendum's A10 `parallel_review` checkpoint creates a multi-reviewer signed deliberation. That's exactly what BEEHIVE is.

**Decision:** Phase 3 will implement the `parallel_review` checkpoint by **creating a BEEHIVE session** of type `review` with the configured reviewers. The session ID is stored on the mission task. Mission progresses when BEEHIVE concludes (or SLA expires).

For Phase 1, checkpoints are simple single-human approvals.

### 13.3 Grow (CRM, migration 093) — preferred over `mission_data_rows` for sales

The Addendum's B2 "AI Sales Rep" describes a `leads` data table. That's literally Grow CRM's domain.

**Decision:** Sales-style missions write to **Grow tables** (`grow_contacts`, `grow_opportunities`, `grow_signals`) — not to a parallel `mission_data_rows` table. The Mission Controller passes `mission_id` as metadata so Grow rows can be filtered by mission later.

`mission_data_rows` (Phase 2) remains as the **GENERIC fallback** for ad-hoc structured storage where no domain-specific table exists (e.g., custom analytics tables for unique mission types).

**Same principle applies to Procure (091) and Civic (092).** Domain-specific writes preferred.

### 13.4 Workflow Engine (existing) — primitive layer

The Workflow Engine (`workflow-executor.ts`, `workflow_schedules`, node-cron) provides step types: `llm`, `script`, `parallel`, `http`, `db`, `email`, etc.

**Decision:** Mission tasks ORCHESTRATE workflow steps. A `mission_task` of type `llm` is a coarse orchestration unit; the underlying execution may delegate to one or more workflow steps. The Mission Controller does not duplicate workflow execution logic.

**Templates** can reference an existing workflow id (`workflow_template_id` on `mission_templates.task_graph_template`) so a task can simply "execute workflow X with these parameters."

### 13.5 Knowledge Atoms (existing) — mission_id tagging

**Decision:** Mission task outputs flow through the existing atom-extractor. The new columns `public.knowledge_atoms.mission_id` and `public.knowledge_atoms.mission_scope` tag which atoms came from missions. Tagging happens at insertion time; no separate write path.

### 13.6 Apprentice Model (existing) — mission_type autonomy

**Decision:** Mission template autonomy progresses using the existing apprentice-style metrics (completions, override rate, quality). New tables `missions.mission_type_autonomy` and `missions.mission_type_autonomy_history` track per-template state. The existing apprentice service handles the promotion logic; a new `mission_type` apprentice category extends it.

### 13.7 Quality Ratchet + Compliance-as-Code — invoked per task output

**Decision:** Every mission task output runs through:
1. `quality-ratchet.ts` → `quality_score` stored on `mission_tasks`
2. `compliance-rules.ts` → violations halt the task (per failure taxonomy §7.1)

No new code; just integration points in the executor.

### 13.8 Event triggers (existing event-workflow-processor.ts)

The Addendum's A7 `mission_event_queue` is for INBOUND external events (webhook, MCP event, email received).

**Decision:** Phase 2 introduces `missions.mission_event_queue` as a NEW table for inbound mission events. The existing `event-workflow-processor.ts` handles internal/timed triggers (cron, schedules) — that layer is reused for mission scheduled wake-ups (`mission_wake` schedule type).

---

## 14. ACTION LAYER (Phase 2)

A mission that can only think is a report generator. A mission that can act is a worker.

### 14.1 Three interaction channels

```
┌─────────────────────────────────────────────────────────────┐
│                    MISSION CONTROLLER                        │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐    │
│  │  API Layer   │  │ Browser Layer│  │   MCP Layer      │    │
│  │  (existing)  │  │ (NEW)       │  │   (existing)     │    │
│  │ REST/DB/etc  │  │ Playwright  │  │ Tool protocol    │    │
│  └──────┬──────┘  └──────┬──────┘  └────────┬─────────┘    │
│         └────────────────┼───────────────────┘               │
│                 ┌────────▼────────┐                          │
│                 │ Credential Vault │                          │
│                 │ OAuth, API keys │                          │
│                 │ Encrypted store │                          │
│                 └─────────────────┘                          │
└─────────────────────────────────────────────────────────────┘
```

### 14.2 Browser automation (Playwright)

**Why Playwright:** Industry-standard Node.js browser automation — cross-browser (Chromium, Firefox, WebKit), headless by default, built-in wait/retry logic, network interception, screenshot/PDF capture, strong TypeScript support. It's what Devin and OpenAI Operator use.

**Note:** `@playwright/test` is already installed in `package.json` (E2E test usage). Phase 2 adds production server-side Playwright as a new dependency surface.

**Service surface:** `BrowserAutomationService` — session management, navigation, click/fill/select/upload, extraction (text/structured/table/screenshot/PDF), waiting, LLM-guided fallback, Service Pack execution.

**LLM-guided interaction:** When no Service Pack covers the page, the LLM receives screenshot + DOM summary and decides the next action. Same pattern as OpenAI Operator. Vision-capable models (Claude, GPT-4 Turbo, Gemini) work best; non-vision falls back to DOM-only.

### 14.3 Service Packs — "Knowledge Packs for the Web"

**Insight:** LLM-guided Playwright is powerful but slow, expensive, and brittle. On familiar services (LinkedIn, EUR-Lex), pre-built selectors are faster + cheaper + more reliable.

A **Service Pack** is a pre-built, structured description of how a specific website/app/service works — navigation, page layouts, form fields, selectors, API endpoints, auth flow, common workflows.

**Interaction hierarchy (fast → slow, cheap → expensive):**
```
Priority 1: Service Pack + direct execution
            ↓ Pack exists, selectors valid → Execute immediately
            ↓ Pack exists, selectors broken → Fall through

Priority 2: API connector (if available)
            ↓ Structured API call → Execute via connector
            ↓ No API or insufficient → Fall through

Priority 3: MCP tool (if available)
            ↓ MCP server for this service → Execute via MCP
            ↓ No MCP server → Fall through

Priority 4: LLM-guided Playwright (fallback)
            ↓ Screenshot + DOM → LLM decides → Execute
            ↓ "Figure it out" mode
```

**Service Pack structure:** `.anton` package, type `service_pack`. Contains `service_info`, `pages`, `workflows`, `known_issues`, `fallback_hints`. Health-tracked with `selectors_health` (healthy/degraded/broken) and auto-heal proposals when LLM fallback finds a working selector.

### 14.4 Credential Vault

**Decision:** New `missions.credential_vault` table (Phase 2). Encrypted with AES-256-GCM via the existing `credential-vault.ts` infrastructure (which currently encrypts X25519 keys). Extended to support: API keys, OAuth 2.0 + refresh tokens, username/password, client certificates, cookie jars, bearer tokens.

**Critical security primitive:** Credentials NEVER touch the LLM. The LLM decides *what* to do; the execution layer handles *how* to authenticate. Verified by audit. Credentials never stored in knowledge atoms. Credentials never logged in plain text.

OAuth tokens auto-refresh. Access logged to `missions.credential_access_log`. Per-mission/per-template scoping (`allowed_mission_templates`, `allowed_services`).

### 14.5 Service Pack target catalog (Phase 2 build waves)

182 services across 16 categories. Country-specific variants for SE/FR/DE/IT/GB/JP/ES/NL/IN.

**Wave 1 (v0.8.5 — first 5 packs):**
| Pack | Category | Interaction | Rationale |
|---|---|---|---|
| LinkedIn | Social/Recruitment | Browser + API | Recruitment + Marketing |
| EUR-Lex | Government/Regulatory | API + Browser | Compliance |
| Google Search | Search | API | Every research task |
| Google Ads | Advertising | API + Browser | Marketing |
| HubSpot | CRM | API | Sales/marketing |

**Wave 2 (v0.9.0 — 10 more):**
Instagram, X (Twitter), Meta Business Suite, Indeed, Booking.com, Wikipedia, YouTube, Gmail (MCP), Slack (MCP), Companies House (UK).

**Wave 3 (community-driven, ongoing — 15 country-specific):**
SE: Bolagsverket, Aftonbladet, Blocket, Avanza
FR: Leboncoin
DE: Kleinanzeigen, BaFin
IT: Subito
GB: FCA
EU: EBA
NL: Marktplaats, Bol.com
IN: Flipkart
JP: Rakuten
ES: Wallapop

**Wave 4+ (community expansion):** Country-specific rail services, national news sites, banking portals, local job boards.

Full catalog preserved in `ANTON_SERVICE_PACK_TARGET_MAP.md` (kept for reference).

---

## 15. DATABASE SCHEMA

### 15.1 Schema bootstrap (Migration 115)

```sql
-- Phase 1 — Foundation: missions schema + 6 core tables.
-- Cross-schema FKs to public.users.

CREATE SCHEMA IF NOT EXISTS missions;

-- Add mission tagging columns to public.knowledge_atoms (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'knowledge_atoms' AND column_name = 'mission_id') THEN
    ALTER TABLE public.knowledge_atoms ADD COLUMN mission_id TEXT;
    ALTER TABLE public.knowledge_atoms ADD COLUMN mission_scope TEXT;
    CREATE INDEX IF NOT EXISTS idx_knowledge_atoms_mission ON public.knowledge_atoms(mission_id);
  END IF;
END
$$;

-- ── missions.missions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS missions.missions (
  id                          TEXT PRIMARY KEY,
  title                       TEXT NOT NULL,
  objective                   TEXT NOT NULL,
  context                     TEXT,
  success_criteria            TEXT NOT NULL,
  autonomy_level              TEXT NOT NULL DEFAULT 'check_in'
    CHECK (autonomy_level IN ('check_in', 'briefing', 'full_autonomy')),
  status                      TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'briefed', 'active', 'paused', 'review', 'completed', 'aborted')),
  priority                    TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'critical')),

  -- Budget
  token_budget_max            BIGINT NOT NULL DEFAULT 5000000,
  token_budget_consumed       BIGINT NOT NULL DEFAULT 0,
  time_budget_max_seconds     INTEGER NOT NULL DEFAULT 604800,   -- 7 days
  time_active_max_seconds     INTEGER NOT NULL DEFAULT 86400,    -- 24 h active
  time_active_consumed_seconds INTEGER NOT NULL DEFAULT 0,
  financial_budget_max        NUMERIC(12,2) NOT NULL DEFAULT 0,
  financial_budget_consumed   NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Configuration (JSONB)
  data_scope                  JSONB NOT NULL DEFAULT '{}',
  notification_preferences    JSONB NOT NULL DEFAULT '{}',
  model_strategy              JSONB NOT NULL DEFAULT
    '{"planning_model":"auto","execution_model":"auto","utility_model":"auto","provider_preference":"any","fallback_enabled":true,"cost_optimise":false}',

  -- Metadata
  template_id                 TEXT,
  created_by                  TEXT NOT NULL REFERENCES public.users(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at                  TIMESTAMPTZ,
  completed_at                TIMESTAMPTZ,
  deadline                    TIMESTAMPTZ,

  -- Compressed context for fast wake-up
  mission_summary             TEXT,
  mission_summary_updated_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_missions_status     ON missions.missions(status);
CREATE INDEX IF NOT EXISTS idx_missions_created_by ON missions.missions(created_by);
CREATE INDEX IF NOT EXISTS idx_missions_template   ON missions.missions(template_id);
CREATE INDEX IF NOT EXISTS idx_missions_created_at ON missions.missions(created_at DESC);

-- ── missions.mission_tasks ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS missions.mission_tasks (
  id                          TEXT PRIMARY KEY,
  mission_id                  TEXT NOT NULL REFERENCES missions.missions(id) ON DELETE CASCADE,
  parent_task_id              TEXT,                              -- for sub-tasks
  title                       TEXT NOT NULL,
  description                 TEXT,
  task_type                   TEXT NOT NULL
    CHECK (task_type IN ('llm', 'research', 'analysis', 'export', 'review', 'notification',
                          'checkpoint', 'conditional', 'parallel_group', 'browser', 'api_call', 'database_query')),
  status                      TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'active', 'completed', 'failed', 'skipped', 'blocked', 'paused')),
  priority                    INTEGER NOT NULL DEFAULT 0,

  -- Module mapping
  module_id                   TEXT,
  area_id                     TEXT,
  module_config               JSONB NOT NULL DEFAULT '{}',

  -- Model used at execution
  provider                    TEXT,
  model                       TEXT,
  model_tier                  TEXT,                              -- planning/execution/utility

  -- Effort + execution
  estimated_tokens            INTEGER,
  actual_tokens_consumed      INTEGER NOT NULL DEFAULT 0,
  estimated_duration_seconds  INTEGER,
  actual_duration_seconds     INTEGER,

  -- Results
  output_summary              TEXT,
  output_full                 TEXT,
  quality_score               NUMERIC(4,3),
  confidence_score            NUMERIC(4,3),
  atoms_produced              INTEGER NOT NULL DEFAULT 0,

  -- Error handling
  retry_count                 INTEGER NOT NULL DEFAULT 0,
  max_retries                 INTEGER NOT NULL DEFAULT 3,
  last_error                  TEXT,

  -- Ordering
  sort_order                  INTEGER NOT NULL DEFAULT 0,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at                  TIMESTAMPTZ,
  completed_at                TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mission_tasks_mission ON missions.mission_tasks(mission_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_mission_tasks_status  ON missions.mission_tasks(mission_id, status);
CREATE INDEX IF NOT EXISTS idx_mission_tasks_parent  ON missions.mission_tasks(parent_task_id);

-- ── missions.mission_task_dependencies (DAG edges) ────────────────────────
CREATE TABLE IF NOT EXISTS missions.mission_task_dependencies (
  id                          BIGSERIAL PRIMARY KEY,
  task_id                     TEXT NOT NULL REFERENCES missions.mission_tasks(id) ON DELETE CASCADE,
  depends_on_task_id          TEXT NOT NULL REFERENCES missions.mission_tasks(id) ON DELETE CASCADE,
  dependency_type             TEXT NOT NULL DEFAULT 'blocking'
    CHECK (dependency_type IN ('blocking', 'informational')),
  UNIQUE (task_id, depends_on_task_id)
);

-- ── missions.mission_activity (audit trail) ───────────────────────────────
CREATE TABLE IF NOT EXISTS missions.mission_activity (
  id                          BIGSERIAL,
  mission_id                  TEXT NOT NULL REFERENCES missions.missions(id) ON DELETE CASCADE,
  task_id                     TEXT REFERENCES missions.mission_tasks(id) ON DELETE SET NULL,
  timestamp                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activity_type               TEXT NOT NULL,
  description                 TEXT,
  details                     JSONB NOT NULL DEFAULT '{}',
  tokens_consumed             INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
);
-- Phase 2 will partition this by month (PARTITION BY RANGE (timestamp))

CREATE INDEX IF NOT EXISTS idx_mission_activity_mission ON missions.mission_activity(mission_id, timestamp DESC);

-- ── missions.mission_decisions (autonomous decision audit) ────────────────
CREATE TABLE IF NOT EXISTS missions.mission_decisions (
  id                          TEXT PRIMARY KEY,
  mission_id                  TEXT NOT NULL REFERENCES missions.missions(id) ON DELETE CASCADE,
  task_id                     TEXT REFERENCES missions.mission_tasks(id) ON DELETE SET NULL,
  timestamp                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decision_type               TEXT NOT NULL
    CHECK (decision_type IN ('approach_selection', 'module_selection', 'data_source_selection',
                              'quality_tradeoff', 'priority_adjustment', 'scope_adjustment',
                              'escalation_decision', 'self_correction', 'task_spawn', 'plan_decomposition')),
  description                 TEXT NOT NULL,
  options_considered          JSONB NOT NULL DEFAULT '[]',
  selected_option             TEXT NOT NULL,
  confidence                  NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  reasoning                   TEXT,
  overridden_by_human         BOOLEAN NOT NULL DEFAULT FALSE,
  override_reasoning          TEXT,
  compliance_check_passed     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_mission_decisions_mission ON missions.mission_decisions(mission_id, timestamp DESC);

-- ── missions.mission_templates ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS missions.mission_templates (
  id                          TEXT PRIMARY KEY,
  name                        TEXT NOT NULL,
  description                 TEXT,
  pillar                      TEXT NOT NULL CHECK (pillar IN ('work', 'life', 'school')),
  category                    TEXT,
  version                     TEXT NOT NULL DEFAULT '1.0.0',
  author                      TEXT,

  -- Template content (JSONB)
  parameters_schema           JSONB NOT NULL DEFAULT '[]',
  task_graph_template         JSONB NOT NULL DEFAULT '{}',
  default_data_scope          JSONB NOT NULL DEFAULT '{}',
  default_budget              JSONB NOT NULL DEFAULT '{}',
  default_autonomy_level      TEXT NOT NULL DEFAULT 'check_in',
  success_criteria_template   TEXT,
  required_modules            JSONB NOT NULL DEFAULT '[]',

  -- Metrics
  times_used                  INTEGER NOT NULL DEFAULT 0,
  avg_completion_time_seconds INTEGER,
  avg_quality_score           NUMERIC(4,3),
  avg_token_consumption       BIGINT,

  -- Metadata
  is_builtin                  BOOLEAN NOT NULL DEFAULT FALSE,
  is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mission_templates_active ON missions.mission_templates(is_active, pillar, category);

-- FK from missions.missions → missions.mission_templates (deferred reference)
ALTER TABLE missions.missions
  ADD CONSTRAINT fk_missions_template FOREIGN KEY (template_id) REFERENCES missions.mission_templates(id) ON DELETE SET NULL;
```

### 15.2 Phase 2 — Action Layer + Service Packs (additional tables)

```
missions.credential_vault              -- encrypted credential storage
missions.credential_access_log         -- access audit
missions.browser_sessions              -- Playwright sessions
missions.browser_actions               -- per-action audit + screenshots (PARTITIONED)
missions.service_packs                 -- pack registry
missions.service_pack_health           -- selector health + auto-heal proposals
```

### 15.3 Phase 2 — Mission tracks + events + structured storage

```
missions.mission_tracks                -- multi-track sub-missions (A6)
missions.mission_scheduled_tasks       -- one-off timed tasks (A2)
missions.mission_event_queue           -- inbound external events (A7)
missions.mission_data_tables           -- generic structured storage (A4)
missions.mission_data_rows             -- rows of generic structured storage
missions.mission_document_intake       -- document intake pipeline (A3)
missions.web_snapshots                 -- web change monitor (A9)
missions.web_snapshot_diffs            -- diffs between snapshots
```

### 15.4 Phase 3 — Delivery + templates

```
missions.mission_deliveries            -- output delivery tracking (A1)
missions.document_templates            -- document assembly templates (A11)
```

### 15.5 Phase 1 — apprentice/autonomy tracking

```
missions.mission_type_autonomy         -- per-template earned autonomy state
missions.mission_type_autonomy_history -- autonomy promotion history
```

These are introduced in Phase 1 alongside the core 6 to support earned-autonomy from day one.

---

## 16. SERVICE ARCHITECTURE (file-by-file)

### 16.1 New backend files

**Phase 1:**
```
server/services/missions/types.ts                  -- shared TS interfaces
server/services/missions/mission-identity.ts       -- local identity resolution (mirrors beehive-identity)
server/services/missions/mission-state.ts          -- pure DAL with row hydration
server/services/missions/mission-controller.ts     -- lifecycle: create/start/pause/resume/abort/complete
server/services/missions/mission-decomposition.ts  -- LLM-driven task graph generation
server/services/missions/mission-executor.ts       -- per-task execution loop
server/services/missions/mission-context.ts        -- context reconstruction (model-aware)
server/routes/missions.ts                          -- REST API
server/db/migrations-pg/115_missions_foundation.sql -- schema bootstrap
```

**Phase 2 (Action Layer):**
```
server/services/missions/browser-automation.ts     -- Playwright session mgmt + LLM-guided
server/services/missions/credential-vault.ts       -- (extends existing) OAuth + token refresh + audit
server/services/missions/service-connectors.ts     -- connector registry + base interface
server/services/missions/connectors/linkedin.ts    -- LinkedIn API (Wave 1)
server/services/missions/connectors/eur-lex.ts     -- EUR-Lex API
server/services/missions/connectors/hubspot.ts     -- HubSpot
server/services/missions/connectors/google-ads.ts  -- Google Ads
server/services/missions/connectors/google-search.ts -- Google Search
server/services/missions/service-pack-manager.ts   -- pack load/validate/execute, health
server/services/missions/service-pack-fallback.ts  -- LLM-guided fallback + auto-heal
server/services/missions/mission-scheduler.ts      -- wake/sleep cycle (CRON + event)
server/services/missions/mission-data-store.ts     -- generic structured storage CRUD (A4)
server/services/missions/document-intake.ts        -- inbound document pipeline (A3)
server/services/missions/web-monitor.ts            -- snapshot + diff (A9)
server/routes/credentials.ts                       -- credential vault API
server/routes/browser.ts                           -- browser session admin/debug
server/routes/service-packs.ts                     -- pack CRUD + health
server/db/migrations-pg/120_missions_action_layer.sql
server/db/migrations-pg/121_missions_tracks.sql
```

**Phase 3 (Delivery + Intelligence):**
```
server/services/missions/mission-delivery.ts       -- output delivery routing (A1)
server/services/missions/email-sequence.ts         -- multi-step email sequences (B2)
server/services/missions/content-adapter.ts        -- single content idea → platform variants (B1)
server/services/missions/mission-checkpoint.ts     -- BEEHIVE-backed parallel review (A10)
server/db/migrations-pg/130_missions_delivery.sql
```

### 16.2 New frontend files

**Phase 1:**
```
src/pages/missions/MissionsPage.tsx                -- list grouped by status
src/pages/missions/MissionCreatorPage.tsx          -- brief form + template picker
src/pages/missions/MissionDashboardPage.tsx        -- live task graph + activity feed
src/components/missions/TaskGraphView.tsx          -- visual DAG component
src/components/missions/ActivityFeed.tsx           -- rolling activity log
src/components/missions/BudgetMonitor.tsx          -- budget consumption display
src/components/missions/MissionCard.tsx            -- summary card for lists
src/components/missions/MissionBriefForm.tsx       -- brief form
```

**Phase 2:**
```
src/pages/missions/MissionTemplatesPage.tsx        -- template browser
src/pages/missions/CredentialVaultPage.tsx         -- credential management UI
src/pages/missions/ServicePacksPage.tsx            -- pack browser + health
src/components/missions/PeekPanel.tsx              -- live execution peek
src/components/missions/BrowserPreview.tsx         -- Playwright session viewer
src/components/missions/ActionLog.tsx              -- action-level audit
src/components/missions/StageApproval.tsx          -- stage-and-hold approval UI (A5)
src/components/missions/ServicePackStatus.tsx      -- pack health indicator
```

**Phase 3:**
```
src/pages/missions/MissionControlCentrePage.tsx    -- multi-mission overview (B5)
src/pages/missions/MissionReviewPage.tsx           -- checkpoint review with feedback
src/components/missions/DataTableView.tsx          -- mission structured data view (A4)
src/components/missions/ContentCalendar.tsx        -- visual calendar (B1)
src/components/missions/MissionAnalytics.tsx       -- business metrics
```

### 16.3 Existing files extended (small additions)

```
server/index.ts                          -- mount missions router
src/App.tsx                              -- lazy missions routes
src/components/layout/Sidebar.tsx        -- nav entry under Work pillar
public.knowledge_atoms (table)           -- mission_id + mission_scope columns (added by migration 115)
server/services/anton-bundler.ts         -- new bundle types: mission_template, service_pack (Phase 2+)
server/services/apprentice.ts            -- new mission_type apprentice category (Phase 1)
```

---

## 17. API SURFACE

### 17.1 Phase 1 routes

```
POST   /api/missions                              -- create a mission
GET    /api/missions                              -- list (filters: status, pillar, category)
GET    /api/missions/:id                          -- mission details + task graph
PUT    /api/missions/:id                          -- update brief (only draft/paused)
POST   /api/missions/:id/start                    -- start a mission (briefed → active)
POST   /api/missions/:id/pause                    -- pause
POST   /api/missions/:id/resume                   -- resume
POST   /api/missions/:id/abort                    -- abort
POST   /api/missions/:id/decompose                -- (re)generate proposed task graph (Queen/owner)
POST   /api/missions/:id/approve-plan             -- approve proposed task graph (briefed → active)
GET    /api/missions/:id/tasks                    -- task graph with current states
GET    /api/missions/:id/tasks/:taskId            -- task details + output
POST   /api/missions/:id/tasks/:taskId/approve    -- approve a checkpoint task
POST   /api/missions/:id/tasks/:taskId/reject     -- reject a checkpoint (with feedback)
GET    /api/missions/:id/activity                 -- activity feed (paginated)
GET    /api/missions/:id/decisions                -- autonomous decision log
GET    /api/missions/:id/budget                   -- budget consumption
GET    /api/missions/:id/atoms                    -- knowledge atoms produced
GET    /api/missions/:id/peek                     -- live execution peek
SSE    /api/missions/:id/stream                   -- real-time dashboard updates

GET    /api/mission-templates                     -- list available templates
GET    /api/mission-templates/:id                 -- template details
POST   /api/mission-templates                     -- create custom template
PUT    /api/mission-templates/:id                 -- update template

GET    /api/missions/identity                     -- local Queen-equivalent identity
```

### 17.2 Phase 2 additions

```
GET    /api/missions/:id/data/:tableName          -- query mission structured storage
POST   /api/missions/:id/data/:tableName          -- insert row
POST   /api/missions/:id/events                   -- inbound event webhook (external systems)
GET    /api/missions/:id/snapshots                -- web snapshots
POST   /api/missions/:id/deliver                  -- manually trigger delivery

GET    /api/credentials                           -- list credentials (masked)
POST   /api/credentials                           -- create credential
DELETE /api/credentials/:id                       -- revoke
POST   /api/credentials/:id/rotate                -- rotate

GET    /api/service-packs                         -- list installed packs
POST   /api/service-packs                         -- import .anton package
GET    /api/service-packs/:id/health              -- selector health report
POST   /api/service-packs/:id/test/:workflowId    -- smoke-test a pack workflow
```

### 17.3 Phase 3 additions

```
GET    /api/missions/overview                     -- multi-mission control centre
POST   /api/missions/:id/checkpoint/parallel-review -- create BEEHIVE-backed review checkpoint
```

---

## 18. PHASE 1 ACCEPTANCE CRITERIA

### 18.1 Must-have

- [ ] User can create a mission from the UI with objective, success criteria, budget
- [ ] ANTON decomposes the objective into a proposed task graph
- [ ] Human can review proposed graph and approve before mission starts
- [ ] Mission executes tasks sequentially, invoking LLM via `unified-llm-client.ts`
- [ ] Task graph visualisation shows real-time state (complete/active/queued)
- [ ] Activity feed shows rolling log of actions
- [ ] Budget tracking shows token consumption vs. limit
- [ ] Mission pauses when budget exceeded or checkpoint reached
- [ ] Human can approve/reject checkpoint outputs
- [ ] All decisions logged in `missions.mission_decisions`
- [ ] Mission summary generated at sleep for context reconstruction
- [ ] At least ONE working starter template ("Knowledge Synthesis")
- [ ] Mission context reconstruction works — pause and resume with continuity
- [ ] Mission runs successfully on Anthropic Claude (Opus 4.7 or Sonnet 4.6)
- [ ] Migration 115 creates `missions` schema + 6 core tables on a fresh PG database
- [ ] Migration 115 is idempotent (safe to re-run)
- [ ] Identity binding: server resolves Queen from `community_identity`, rejects mismatched claims (403)
- [ ] CSRF + userLimiter middleware applies (inherited from `/api` global)

### 18.2 Should-have (Phase 1.5)

- [ ] Quality Ratchet runs on every task output
- [ ] Compliance-as-Code checks run on every task output
- [ ] Knowledge atoms extracted from task outputs are tagged with `mission_id`
- [ ] Mission runs successfully on Mistral Large + at least one Ollama model
- [ ] Model selection per task (planning = highest available; utility = cheapest)
- [ ] Provider fallback: if primary fails, mission continues on fallback
- [ ] Cost tracking per provider in Budget Monitor
- [ ] Context reconstruction adapts to model context window (128K vs 1M)

---

## 19. SECURITY CONSIDERATIONS

### 19.1 Identity & authorization
- All mutations identity-bound to `public.community_identity` (Phase 1) → AAP signature verified (Phase 5)
- 403 on mismatched claims; 409 if identity not activated

### 19.2 CSRF
- Inherited from `app.use('/api', csrfProtection)` global middleware

### 19.3 Rate limiting
- `userLimiter` global on `/api`
- `claudeLimiter` on LLM-heavy endpoints (decomposition, synthesis, summary generation)

### 19.4 Credential boundary (Phase 2)
- AES-256-GCM encryption at rest
- OAuth access tokens auto-refresh
- **Credentials NEVER in LLM prompts** — verified by audit
- All credential reads logged to `missions.credential_access_log`
- Per-mission/per-template scoping

### 19.5 Browser automation safety (Phase 2)
- Domain allow-list per mission
- Form submission blocked unless explicitly allowed
- Stage-and-hold for high-impact actions (booking, payment, regulatory submission)
- Air-gapped mode (Ollama-only) cannot launch browser sessions or call external APIs

### 19.6 Audit trail
- Every autonomous decision in `missions.mission_decisions`
- Every action in `missions.mission_activity`
- (Phase 2) Every browser action in `missions.browser_actions` with before/after screenshots
- (Phase 2) Every credential access in `missions.credential_access_log`

---

## 20. KEY DESIGN PRINCIPLES (repeat for emphasis)

1. **Extend, don't duplicate.** The Mission Controller orchestrates existing ANTON services. It does not re-implement quality scoring, compliance checking, knowledge extraction, or prompt building.
2. **Earned autonomy, not granted autonomy.** Missions start conservative (check_in) and earn the right to more independence through demonstrated performance.
3. **Never push forward on impossible tasks.** If ANTON is stuck, it escalates. The self-correction loop is best-effort, not infinite retry.
4. **The human is always accountable.** Autonomous does not mean unreviewed. Even at Full Autonomy, the human reviews the final deliverable.
5. **Every decision is logged.** No autonomous decision goes unrecorded. Compliance requirement and trust-building feature.
6. **Budget hard stops, not budget warnings.** When a budget is exceeded, the mission pauses. It does not continue and apologise later.
7. **Model-agnostic by default, model-aware by design.** Every mission must work on any supported provider. The Mission Controller adapts to model capabilities (context window, tools, thinking) but never depends on a specific provider. `unified-llm-client.ts` is the only way to call an LLM — no provider-specific imports in mission code.
8. **Credentials never touch the LLM.** API keys, passwords, OAuth tokens, and session cookies are injected at the execution layer only. They are never included in prompts, never logged in plain text, never stored in knowledge atoms, and never surfaced in the Mission Dashboard. The LLM decides *what* to do; the execution layer handles *how* to authenticate.
9. **PostgreSQL only.** No SQLite, no dual-engine compatibility shims. PG-native types throughout: JSONB, TIMESTAMPTZ, BIGSERIAL, UUID. Schema separation (`missions` schema) from day one.
10. **Identity binding from day one.** Mirrors BEEHIVE: server resolves identity from `community_identity`, rejects spoofing attempts. Phase 5 swaps in Ed25519 signature verification on AAP messages.

---

**END OF CANONICAL SPECIFICATION v2.0**
