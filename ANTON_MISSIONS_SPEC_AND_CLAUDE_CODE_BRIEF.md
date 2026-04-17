# ANTON Missions — Feature Specification & Claude Code Brief

**Version:** 1.0.0  
**Date:** April 15, 2026  
**Author:** Daniel Bardun / Claude (Strategic Partner)  
**Status:** Specification — Ready for Implementation  
**Target Version:** v0.7.0  
**Pillar:** Work (primary), Life (secondary), School (future)

---

## PART 1: FEATURE SPECIFICATION

---

### 1. Executive Summary

ANTON Missions introduces a persistent, self-directing autonomous agent mode to the ANTON platform. Unlike the existing session-based interaction model (human asks → ANTON responds), Missions allow users to assign ANTON a high-level objective — a "mission brief" — and ANTON decomposes it into tasks, executes them autonomously across modules, manages its own workflow over hours or days, populates knowledge atoms along the way, and reports back when done or when it needs a human decision.

This is the bridge between Layer 2 (Intelligent ANTON) and Layer 3 (The Network) of the six-layer vision. An ANTON that can execute missions independently is an ANTON that can accept missions from other ANTONs via AAP — which is the prerequisite for the marketplace and the economy.

**Tagline:** *"Brief it. Trust it. Review the results."*

---

### 2. Strategic Context

#### 2.1 Why Now

The autonomous agent space is the dominant AI hype cycle in 2026. Devin ($20/mo + ACU), OpenAI Operator, Salesforce Agentforce, CrewAI, and LangChain agents have established the category. Gartner predicts 40% of enterprise applications will feature task-specific AI agents by end of 2026.

However, every existing autonomous agent suffers from at least one of these limitations:

- **Domain-locked** (Devin = coding only, Agentforce = Salesforce only)
- **No professional governance** (no quality scoring, no compliance rails, no audit trails)
- **No institutional learning** (every mission starts from zero context)
- **No earned autonomy** (binary: either fully autonomous or fully manual)
- **No professional knowledge architecture** (no 7-layer prompts, no knowledge atoms, no personas)

ANTON Missions would be the **first professional knowledge work autonomous agent** with built-in quality governance, compliance rails, earned autonomy, institutional memory, and a payment system (FutureChain). This is a genuinely unique competitive position.

#### 2.2 What Already Exists (Leverage, Don't Rebuild)

| Existing Component | How Missions Use It |
|---|---|
| 12-step Workflow Engine | Task execution backbone — LLM, wait, approval, webhook, conditional, parallel, loop steps |
| CRON Scheduling | Mission wake-up triggers and recurring mission patterns |
| 4-Mode Knowledge Sources | Research capability — web search, local docs, URLs, combined |
| Knowledge Atom Extraction | Every mission step produces atoms; mission accumulates institutional knowledge |
| 5-Layer Intelligence Funnel | Cross-mission pattern detection and strategic intelligence |
| Apprentice Model (4 stages) | Trust progression governs mission autonomy level |
| Quality Ratchet (6 dimensions) | Self-assessment on every output; below-threshold triggers escalation |
| Compliance-as-Code | Automated rule checking on every mission output |
| Time Intelligence | Deadline awareness, smart buffering, dependency mapping |
| Regulatory Radar | Trigger source for compliance monitoring missions |
| Collaborative Canvas | Multi-human review for mission outputs |
| Audit Logging | Extended to cover autonomous decision chains |
| .anton Package Format | Mission templates as exportable/importable packages |
| AAP (Agent Protocol) | Future: ANTON-to-ANTON mission delegation |

#### 2.3 Position in the Six-Layer Vision

```
Layer 1: Individual ANTON        ← Current (v0.5–v0.6)
Layer 2: Intelligent ANTON       ← MISSIONS LIVE HERE (v0.7)
Layer 3: The Network             ← Missions + AAP = network-delegated work
Layer 4: Collaborative Intelligence
Layer 5: The Marketplace         ← Mission templates as marketplace products
Layer 6: The Economy             ← FutureChain-funded missions
```

---

### 3. Core Concepts

#### 3.1 Mission

A Mission is a persistent, goal-oriented work assignment that ANTON executes autonomously over time. Unlike a session (synchronous, single-topic, human-driven), a mission is:

- **Asynchronous** — runs in the background, wakes and sleeps
- **Multi-step** — decomposes into a task graph executed over hours/days
- **Self-directing** — ANTON decides what to do next based on progress and findings
- **Accumulative** — every step produces knowledge atoms that inform subsequent steps
- **Governed** — subject to budget limits, compliance rules, quality thresholds, and human checkpoints

#### 3.2 Mission Brief

The human input that starts a mission. Contains:

| Field | Required | Description |
|---|---|---|
| `objective` | Yes | What should ANTON achieve? Natural language description. |
| `context` | No | Background information, constraints, preferences. |
| `success_criteria` | Yes | How will completion be measured? |
| `autonomy_level` | Yes | Check-in / Briefing / Full Autonomy (see §3.4) |
| `budget` | Yes | Token budget, time budget, financial budget (if wallet connected) |
| `deadline` | No | When must the mission be complete? |
| `modules_allowed` | No | Restrict which ANTON modules can be used (default: all accessible) |
| `data_scope` | No | Which knowledge sources, areas, and data the mission can access |
| `notification_preferences` | No | How and when to notify the human |
| `template_id` | No | Start from a pre-built mission template |
| `model_strategy` | No | Model selection strategy — planning model, execution model, provider preference, fallback behaviour (see §9A). Default: auto-select best available. |

#### 3.3 Task Graph

The Mission Controller decomposes a mission brief into a **directed acyclic graph (DAG)** of tasks. Each task:

- Maps to one or more ANTON module invocations
- Has explicit dependencies (which tasks must complete first)
- Has a priority and estimated effort (tokens + time)
- Can spawn sub-tasks dynamically based on findings
- Produces typed outputs: knowledge atoms, documents, decisions, data

```
Mission: "Prepare AMLR Readiness Assessment for Client X"
│
├─ Task 1: Research current AMLR requirements [Module: Regulatory Monitor]
│   ├─ Task 1.1: Fetch latest AMLR text from EUR-Lex [Knowledge Source: Web]
│   └─ Task 1.2: Extract key compliance requirements [Module: Regulatory Analysis]
│
├─ Task 2: Gather client context [depends: none]
│   ├─ Task 2.1: Load client profile from knowledge atoms
│   └─ Task 2.2: Identify client's current compliance posture [Module: Gap Analysis]
│
├─ Task 3: Run gap analysis [depends: Task 1, Task 2]
│   ├─ Task 3.1: Map requirements to client controls
│   ├─ Task 3.2: Score each gap by severity and remediation effort
│   └─ Task 3.3: Generate remediation roadmap [Module: Action Planning]
│
├─ Task 4: Produce deliverables [depends: Task 3]
│   ├─ Task 4.1: Draft executive summary [Module: Report Writing]
│   ├─ Task 4.2: Generate detailed gap matrix [Module: Gap Analysis → Export XLSX]
│   └─ Task 4.3: Create presentation deck [Module: Presentation Builder]
│
├─ ★ CHECKPOINT: Human review of deliverables
│
└─ Task 5: Finalise and deliver [depends: checkpoint approval]
    ├─ Task 5.1: Apply review feedback
    └─ Task 5.2: Export final package (.anton bundle)
```

#### 3.4 Mission Autonomy Levels

Aligned with the existing Apprentice Model philosophy — trust is earned, not granted.

| Level | Name | Behaviour | Human Role | When to Use |
|---|---|---|---|---|
| 1 | **Check-in** | Proposes each next action, waits for approval before executing | Approves every step | New mission types, high-risk work, financial actions |
| 2 | **Briefing** | Works autonomously, sends periodic progress summaries, pauses at defined checkpoints | Reviews summaries, approves at checkpoints | Established mission patterns, moderate risk |
| 3 | **Full Autonomy** | Works independently, human reviews final output only | Reviews completed deliverables | Proven mission types with consistent quality history |

**Autonomy progression:** A mission *type* (not individual mission) earns autonomy through the same criteria as the Apprentice Model — number of successful completions, override rate, quality scores. A "Monthly Compliance Report" mission that has run successfully 10 times with <5% override rate can be promoted from Check-in to Briefing.

**Autonomy overrides:** Regardless of earned level, certain events always trigger human escalation:
- Quality Ratchet score drops below configured threshold
- Compliance-as-Code violation detected
- Financial action exceeds pre-approved category/limit
- Mission encounters an unexpected situation not covered by the task graph
- Confidence score on any output falls below 0.6

#### 3.5 Mission Lifecycle

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  DRAFT   │───▶│ BRIEFED  │───▶│  ACTIVE  │───▶│ REVIEW   │
│          │    │          │    │          │    │          │
│ Human    │    │ ANTON    │    │ ANTON    │    │ Human    │
│ writes   │    │ decomposes│   │ executes │    │ reviews  │
│ brief    │    │ into DAG │    │ tasks    │    │ outputs  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                                     │               │
                                     ▼               ▼
                                ┌──────────┐    ┌──────────┐
                                │  PAUSED  │    │COMPLETED │
                                │          │    │          │
                                │ Waiting  │    │ Archived │
                                │ for human│    │ with all │
                                │ or event │    │ artifacts│
                                └──────────┘    └──────────┘
                                     │
                                     ▼
                                ┌──────────┐
                                │ ABORTED  │
                                │          │
                                │ Budget   │
                                │ exceeded │
                                │ or human │
                                │ cancelled│
                                └──────────┘
```

States: `draft` → `briefed` → `active` → `paused` | `review` → `completed` | `aborted`

#### 3.6 Mission Context Reconstruction

**The core technical challenge.** LLMs have no native memory between API calls. Every time a mission wakes up, ANTON must reconstruct the mission context efficiently.

**Protocol:**

1. **Load mission header** — objective, success criteria, autonomy level, budgets consumed
2. **Load task graph state** — which tasks are complete, in progress, blocked, with outputs
3. **Load accumulated knowledge atoms** — all atoms produced by this mission (mission-scoped)
4. **Load decision log** — key decisions made, with reasoning (compressed)
5. **Load last N activity entries** — recent actions for continuity
6. **Compute "mission summary"** — LLM-generated compression of the above into a concise briefing (generated at each sleep, stored for fast wake-up)

**Token budget for reconstruction:** Maximum 20% of available context window. The exact headroom depends on the active model:

| Provider / Model | Context Window | Reconstruction Budget (20%) | Working Budget (80%) |
|---|---|---|---|
| Anthropic Opus 4.6 | 1,000,000 | 200,000 | 800,000 |
| Anthropic Sonnet 4.6 | 1,000,000 | 200,000 | 800,000 |
| Anthropic Sonnet 4.5 | 200,000 | 40,000 | 160,000 |
| Anthropic Haiku 4.5 | 200,000 | 40,000 | 160,000 |
| Mistral Large | 128,000 | 25,600 | 102,400 |
| OpenAI GPT-4 Turbo | 128,000 | 25,600 | 102,400 |
| Gemini 2.0 Flash | 1,000,000 | 200,000 | 800,000 |
| Ollama (varies) | model-dependent | model-dependent | model-dependent |

The "mission summary" compression is critical — it must capture the essential state in **<25K tokens** to ensure compatibility with all supported models (Mistral Large and GPT-4 Turbo at 128K being the binding constraint). For complex missions running on smaller-context models, aggressive summarisation is required — the mission context service must be aware of the target model's window size and compress accordingly.

**Compaction integration (Anthropic only):** Use the `compact-2026-01-12` beta header for Anthropic-powered missions that accumulate more context than fits in a single window. For non-Anthropic providers, the Mission Controller must implement its own compaction — summarising completed task outputs and compressing the decision log before each wake-up cycle. The Orchestrator's existing compaction logic should be extended to mission-aware compaction, with a provider-agnostic interface that delegates to native compaction (Anthropic) or ANTON-managed compaction (all others).

**Model-aware reconstruction:** The `mission-context.ts` service must call `getPromptTier()` to detect the active model's capabilities and adjust the reconstruction strategy:
- **Large-context models** (Opus, Sonnet 4.6, Gemini Flash): Include full task outputs, detailed decision reasoning, and broader atom context
- **Medium-context models** (Mistral Large, GPT-4 Turbo, Sonnet 4.5): Include summarised task outputs, compressed decision log, most relevant atoms only
- **Small-context models** (Haiku, Ollama small models): Include mission summary only, minimal history, current task context only

---

### 4. Resource Budgeting

Every mission has three budgets with hard stops.

#### 4.1 Token Budget

| Parameter | Description | Default |
|---|---|---|
| `max_tokens_total` | Maximum tokens across all API calls for this mission | 5,000,000 |
| `max_tokens_per_task` | Maximum tokens for any single task | 500,000 |
| `warning_threshold` | Alert human when this % of budget consumed | 80% |
| `hard_stop` | Mission pauses (not aborts) when budget exhausted | 100% |

#### 4.2 Time Budget

| Parameter | Description | Default |
|---|---|---|
| `max_duration` | Maximum wall-clock time from start to completion | 7 days |
| `max_active_time` | Maximum cumulative active processing time | 24 hours |
| `wake_interval_min` | Minimum time between wake cycles | 5 minutes |
| `wake_interval_max` | Maximum time between wake cycles (prevents abandonment) | 24 hours |

#### 4.3 Financial Budget (FutureChain Wallet)

| Parameter | Description | Default |
|---|---|---|
| `max_spend_total` | Maximum total spend from wallet | 0 (disabled) |
| `max_spend_per_transaction` | Maximum single transaction | 0 (disabled) |
| `approved_spend_categories` | Pre-approved categories (e.g., "advertising", "subscriptions") | [] |
| `approval_delay_seconds` | Delay before financial action executes (cancel window) | 900 (15 min) |
| `requires_human_approval` | Financial actions always need human sign-off | true |

**Important:** Financial budget is **disabled by default** and requires explicit opt-in. The "autonomous work" capability ships first; financial autonomy is a later unlock (see §10.2 phased rollout).

---

### 5. Mission-Scoped Data Isolation

Missions operate in data-scoped sandboxes to prevent information leakage between sensitive workstreams.

#### 5.1 Isolation Model

```
┌─ Mission A: "HR Recruitment Drive" ─────────────────────┐
│  Can access: HR modules, public knowledge, job market data │
│  Cannot access: Finance data, client confidential data     │
│  Atoms produced: Tagged mission_id=A, scope=hr             │
└────────────────────────────────────────────────────────────┘

┌─ Mission B: "Client X Compliance Review" ───────────────┐
│  Can access: Compliance modules, Client X data, regulatory │
│  Cannot access: HR data, other client data                  │
│  Atoms produced: Tagged mission_id=B, scope=client_x        │
└────────────────────────────────────────────────────────────┘
```

#### 5.2 Data Scope Configuration

Each mission brief includes a `data_scope` object:

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

#### 5.3 Cross-Mission Intelligence

While missions are isolated by default, the 5-layer intelligence funnel can detect patterns **across** missions (with appropriate permissions). For example: "Pattern detected: Client X compliance gaps are similar to patterns seen in Client Y review (anonymised)" — surfaced to the human, never leaked between mission contexts directly.

---

### 6. Failure Recovery & Intelligent Escalation

**Design principle:** ANTON should never "push forward on impossible tasks" (the #1 Devin criticism). Instead, ANTON should recognise when it's stuck and escalate intelligently.

#### 6.1 Failure Taxonomy

| Failure Type | Detection | Response |
|---|---|---|
| **Transient** | API timeout, rate limit, network error | Auto-retry with exponential backoff (max 3 retries) |
| **Quality** | Output below Quality Ratchet threshold | Re-attempt with different approach; if still below, escalate to human |
| **Compliance** | Compliance-as-Code violation detected | Halt task immediately, log violation, notify human |
| **Knowledge Gap** | ANTON cannot find sufficient information to complete task | Pause task, notify human with specific question, continue other tasks |
| **Ambiguity** | Task requirements are unclear or contradictory | Pause task, present options to human for clarification |
| **Scope Creep** | Task decomposition reveals the mission is larger than expected | Pause, present revised task graph and budget estimate, await approval |
| **Budget** | Token/time/financial budget threshold reached | Pause mission, present progress summary and remaining work estimate |
| **Unexpected** | Any unclassified error | Log full context, pause mission, notify human with diagnostic info |

#### 6.2 Escalation Protocol

```
Failure detected
    │
    ├─ Is it transient? → Retry (max 3x) → If still failing → Escalate
    │
    ├─ Can other tasks continue? → Yes → Park failed task, continue others
    │                             → No  → Pause entire mission
    │
    ├─ Is human reachable? → Check notification preferences
    │   ├─ Urgent channel available → Send immediate notification
    │   └─ No urgent channel → Queue for next check-in, continue safe tasks
    │
    └─ Log everything → Full failure context saved for debugging
```

#### 6.3 Self-Correction Loop

Before escalating to human, ANTON attempts self-correction:

1. **Re-read the mission brief** — did I misinterpret the objective?
2. **Check knowledge atoms** — do I have information I haven't used?
3. **Try alternative module** — is there a different ANTON module that could handle this?
4. **Try alternative approach** — can I break this task into smaller sub-tasks?
5. **Search for guidance** — web search for how-to / best practices?
6. **Only then escalate** — with a clear description of what was tried and why it failed

---

### 7. Observability: The Mission Dashboard

**Design principle:** Solve the "anxiety of absence" — the user should always feel informed and in control, even when ANTON is working autonomously.

#### 7.1 Dashboard Components

**Mission Overview Panel**
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

**Live Task Graph** — Visual DAG showing task states (complete ✅, active 🔄, queued ⏳, blocked 🚫, failed ❌) with dependency arrows.

**Activity Feed** — Rolling log of actions:
```
14:42 — Completed web search for AMLR Article 8 requirements
         → Extracted 7 knowledge atoms
14:40 — Started Task 3.1: Map requirements to client controls
         → Using module: FCP > Gap Analysis
         → Confidence: 0.85
14:38 — Task 2.2 complete: Client compliance posture identified
         → Quality score: 88/100
         → 12 knowledge atoms produced
```

**Peek Function** — Inspect what ANTON is currently processing without interrupting execution. Shows: current task, current module, current prompt (summarised), current output (streaming).

**Budget Monitor** — Real-time consumption of token, time, and financial budgets with burn-rate projection and estimated completion cost.

#### 7.2 Notification Tiers

| Tier | When | Channel | Examples |
|---|---|---|---|
| **FYI** | Routine progress | Batched daily/weekly email or in-app | "Mission 73% complete. 8/12 tasks done." |
| **Review** | Output ready for approval | Push notification + email | "Gap analysis report ready for your review." |
| **Urgent** | Blocked, budget warning, compliance violation | Push + SMS (if configured) | "Mission paused: compliance violation in Task 3.2" |

Notification preferences are per-mission configurable, with sensible defaults per autonomy level.

---

### 8. Mission Templates

Pre-built mission configurations that lower the barrier to entry and serve as marketplace products.

#### 8.1 Template Structure

A mission template is an `.anton` package (type: `mission_template`) containing:

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
    {
      "key": "client_name",
      "label": "Client Name",
      "type": "string",
      "required": true
    },
    {
      "key": "jurisdiction",
      "label": "Primary Jurisdiction",
      "type": "select",
      "options": ["EU", "Sweden", "UK", "Multi-jurisdiction"],
      "default": "EU"
    },
    {
      "key": "entity_type",
      "label": "Entity Type",
      "type": "select",
      "options": ["Credit Institution", "Payment Institution", "Investment Firm"],
      "required": true
    }
  ],
  "task_graph_template": { ... },
  "default_data_scope": { ... },
  "default_budget": { ... },
  "required_modules": ["fcp/gap-analysis", "fcp/regulatory-monitor", "reporting/executive-summary"],
  "success_criteria_template": "Deliver a complete gap analysis report with severity ratings for all applicable AMLR articles, a prioritised remediation roadmap, and an executive summary suitable for board presentation."
}
```

#### 8.2 Starter Templates (Ship with v0.7.0)

**Work Pillar:**

| Template | Description | Est. Duration |
|---|---|---|
| AMLR Readiness Assessment | Full gap analysis against AMLR requirements | 4-8 hours |
| Monthly Compliance Monitor | Scan regulatory radar, assess impact, produce summary | 1-2 hours/month |
| Policy Review & Update | Review policy suite against regulatory changes | 6-12 hours |
| Competitor Intelligence Report | Research and analyse competitor landscape | 3-6 hours |
| Client Onboarding Analysis | Assess new client risk profile and due diligence needs | 2-4 hours |
| Recruitment Pipeline | Research market, draft job ads (3 variants), screen applications | Ongoing |
| Online Marketing Campaign | Content strategy, create posts, schedule, track engagement | Ongoing |
| Internal Audit Preparation | Prepare documentation and gap analysis for upcoming audit | 8-16 hours |
| Consultant on Retainer | Standing brief for proactive analysis and updates | Ongoing |
| HR On Demand | Onboarding workflows, policy maintenance, training coordination | Ongoing |

**Life Pillar:**

| Template | Description | Est. Duration |
|---|---|---|
| Personal Finance Review | Analyse spending, investment performance, suggest adjustments | 2-4 hours/month |
| Travel Planner | Research, plan, optimise itinerary for a trip | 4-8 hours |
| News Intelligence Briefing | Daily/weekly curated news with bias analysis | 30 min/day |

---

### 9. Multi-Model Mission Architecture

**Design principle:** Missions are model-agnostic by default — they run on whatever the user has configured. But they are also model-*aware* — they adapt their behaviour based on the active model's capabilities.

#### 9.1 The Unified Adapter Contract

The Mission Controller interacts with LLMs **exclusively** through `unified-llm-client.ts`. It never imports provider-specific SDKs or constructs provider-specific payloads. This means:

- A mission that works on Claude Opus also works on Mistral Large, GPT-4, Gemini Flash, or any Ollama model
- The 7-layer prompt system assembles prompts identically for all providers — the adapter layer handles translation
- `getPromptTier()` auto-detects model size and adjusts prompt verbosity (not capability) — smaller models get more concise prompts, not degraded prompts

#### 9.2 Model Selection per Task

Not all tasks in a mission require the same model capability. The Mission Controller selects models per task based on the `model_strategy` configuration:

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

**Per-task model override:** Individual tasks in the task graph can specify a model requirement if needed (e.g., a task that requires web search capability must use a provider that supports it — currently Anthropic Claude with native web search, or any provider with MCP web search integration).

#### 9.3 Provider-Specific Capabilities Matrix

The Mission Controller must be aware of provider differences that affect mission execution:

| Capability | Anthropic | Mistral | OpenAI | Gemini | Ollama |
|---|---|---|---|---|---|
| Max context window | 1M (Opus/Sonnet 4.6) | 128K | 128K | 1M | Model-dependent |
| Native web search | Yes (tool) | No | No | Yes (grounding) | No |
| Prompt caching | Yes (90% savings) | No | No | Yes (context caching) | No |
| Streaming | Yes | Yes | Yes | Yes | Yes |
| Seed/reproducibility | No | Yes | Yes | No | Model-dependent |
| Extended thinking | Yes (effort param) | No | No | Yes (thinking) | No |
| EU data residency | No (US-based) | Yes (EU-based) | No (US-based) | No (US-based) | Yes (local) |
| Air-gapped operation | No | No | No | No | Yes |
| Native compaction | Yes (beta header) | No | No | No | No |

**How the Mission Controller uses this matrix:**

- **Web search tasks:** If the active provider doesn't support native web search, the Mission Controller routes the search through MCP web search integration or falls back to a provider that does
- **Context reconstruction:** Adapts compression aggressiveness based on the provider's context window (see §3.6)
- **Compaction:** Uses native compaction for Anthropic; implements ANTON-managed compaction for all others
- **EU data residency missions:** If `provider_preference: "mistral"` or `provider_preference: "ollama"`, all LLM calls stay within EU/local infrastructure
- **Air-gapped missions:** If `provider_preference: "ollama"`, the mission disables all web search and external URL fetching — pure local operation

#### 9.4 Provider Fallback Chain

When a provider fails during mission execution:

```
Primary provider (user configured)
  │ fails → log failure, check fallback_enabled
  ▼
Fallback provider #1 (next in preference chain)
  │ fails → log, try next
  ▼
Fallback provider #2
  │ fails → log, try next
  ▼
...
  │ all providers exhausted
  ▼
Pause mission, escalate to human:
  "All configured LLM providers are unavailable.
   Last error: [error details]
   Mission paused at task: [task name]"
```

Default fallback chain: User's preferred → Anthropic → Mistral → OpenAI → Gemini → Ollama

**Important:** Fallback respects data residency constraints. If the mission is configured for EU-only providers, the fallback chain is limited to Mistral and Ollama. If air-gapped, only Ollama.

#### 9.5 Cost Estimation per Provider

Mission templates include estimated costs **per provider** so users can make informed choices:

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

This enables the Mission Creator UI to show a cost comparison when the user selects a provider/model.

---

### 10. EU AI Act & Transparency Compliance

#### 10.1 External Communication Disclosure

When a mission involves external-facing communication (emails, social media posts, chat messages, candidate correspondence), ANTON **always** identifies itself as an AI system.

**Implementation:** Every external-facing output includes a configurable disclosure:
- Default: "This communication was prepared by ANTON, an AI-powered professional assistant, and reviewed by [human name]."
- Per-mission customisable but **cannot be removed** — this is a hard compliance requirement.

#### 10.2 EU AI Act Annex III — High-Risk Classifications

Missions involving the following are automatically classified as high-risk and subject to additional governance:

| Use Case | AI Act Category | Additional Requirements |
|---|---|---|
| Recruitment / CV screening | Employment (Annex III, §4) | Dual-model bias audit, human review mandatory, discrimination testing |
| Credit assessment | Financial services (Annex III, §5b) | Explainability logs, human decision authority, adverse action logging |
| Regulatory compliance assessment | Indirect: affects regulatory outcomes | Full audit trail, confidence scoring, human accountability |

High-risk missions **cannot** operate at Full Autonomy level. Maximum: Briefing with mandatory human checkpoints.

#### 10.3 Audit Trail for Autonomous Decisions

Every decision made during a mission is logged:

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

### 11. Implementation Strategy

#### 11.1 Phased Rollout

| Phase | Scope | Target Version |
|---|---|---|
| **Phase 1: Foundation** | Mission Controller, Task Decomposition Engine, Mission Dashboard, basic mission lifecycle (draft → active → completed), mission context reconstruction, resource budgeting | v0.7.0 |
| **Phase 2: Intelligence** | Failure recovery & self-correction, mission-scoped data isolation, mission templates (5 starter templates), notification system, earned autonomy for mission types | v0.7.5 |
| **Phase 2.5: Action Layer** | Credential Vault, Playwright browser automation (headless), LLM-guided browser interaction, browser action audit trail with screenshots, API connector base framework, 3 priority connectors (LinkedIn, EUR-Lex, HubSpot), action governance (allow-lists, risk classification) | v0.7.5 |
| **Phase 3: External** | External communication with AI disclosure, EU AI Act high-risk classification, recruitment and compliance mission templates with governance, additional connectors (Google Ads, Slack, Jira) | v0.8.0 |
| **Phase 4: Financial** | FutureChain wallet integration, financial budgeting, payment actions with approval workflows | v0.8.5 |
| **Phase 5: Network** | AAP-based mission delegation (ANTON-to-ANTON), sub-mission assignment, cross-instance mission coordination | v0.9.0 |

#### 11.2 Separation of Concerns

**"Autonomous work" ships first. "Financial autonomy" ships later.**

The first release (Phase 1-2) demonstrates ANTON working autonomously on knowledge work — research, analysis, report writing, monitoring. This is impressive and safe. It generates hype without risk.

Financial capabilities (Phase 4) are unlocked only after the autonomous work pattern has been proven and the earned autonomy system is battle-tested. This mirrors the Apprentice Model philosophy at the feature level.

AAP integration (Phase 5) is the capstone — it turns autonomous missions into network-delegatable work, which is the foundation for the marketplace economy.

---

### 12. Demo Story (The Hype Vehicle)

**3-minute demo script for launch:**

1. **0:00-0:30** — "I'm going to give ANTON a mission: prepare an AMLR readiness assessment for a fictional bank." Show the mission brief being filled in.
2. **0:30-1:00** — "ANTON has decomposed this into 12 tasks across 5 phases." Show the task graph appearing. "Watch it work."
3. **1:00-2:00** — Time-lapse of the Mission Dashboard: tasks completing, knowledge atoms being extracted, quality scores appearing, activity feed scrolling. Highlight: "ANTON just found a regulatory update it hadn't seen before and adjusted its analysis."
4. **2:00-2:30** — "ANTON hit a quality threshold it wasn't happy with, so it re-ran the analysis with a different approach. It didn't just push forward — it self-corrected." Show the self-correction in the activity feed.
5. **2:30-3:00** — "Four hours later, here's the result." Show the completed deliverables: executive summary, gap matrix, presentation deck. "Professional-grade output. Fully audited. Every decision logged."

**Closing line:** "This is what happens when you give AI a proper professional education. ANTON doesn't just generate — it works."

---

### 13. Action Layer: How Missions Interact with the Real World

A mission that can only *think* is a report generator. A mission that can *act* is a worker. The Action Layer gives ANTON the ability to interact with websites, APIs, and external services during autonomous mission execution.

#### 13.1 Three Interaction Channels

ANTON Missions interact with the real world through three channels, layered from simplest to most powerful:

```
┌─────────────────────────────────────────────────────────────┐
│                    MISSION CONTROLLER                        │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐   │
│  │  API Layer   │  │ Browser Layer│  │   MCP Layer      │   │
│  │  (existing)  │  │ (NEW)       │  │   (existing)     │   │
│  │             │  │             │  │                  │   │
│  │ REST calls  │  │ Playwright  │  │ Tool protocol    │   │
│  │ DB queries  │  │ headless    │  │ Bidirectional    │   │
│  │ Webhooks    │  │ browser     │  │ External servers │   │
│  │ Email       │  │ automation  │  │                  │   │
│  │ Scripts     │  │             │  │                  │   │
│  └──────┬──────┘  └──────┬──────┘  └────────┬─────────┘   │
│         │                │                   │              │
│         └────────────────┼───────────────────┘              │
│                          │                                  │
│                 ┌────────▼────────┐                         │
│                 │ Credential Vault │                         │
│                 │ (NEW)           │                         │
│                 │ OAuth, API keys │                         │
│                 │ Login creds     │                         │
│                 │ Encrypted store │                         │
│                 └─────────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

**Channel 1: API Layer (existing — extend for missions)**

Already implemented in the workflow engine: REST API calls, database queries (PostgreSQL, MySQL, MSSQL, MongoDB), webhooks, email, and sandboxed script execution. For Missions, these step types are reused directly. The Mission Controller invokes them through the existing workflow execution infrastructure.

**What's new for missions:** The Mission Controller can *decide* which APIs to call based on the task at hand, rather than following a pre-defined workflow. For example, during a "Competitor Intelligence" mission, the LLM might decide it needs to call a company registry API it hasn't used before — it looks up available connections, checks permissions, and makes the call.

**Channel 2: Browser Layer (NEW — Playwright)**

Headless browser automation for interacting with websites and web applications that don't have APIs (or whose APIs are insufficient).

**Channel 3: MCP Layer (existing — extend for missions)**

ANTON already functions as both MCP client and server. For Missions, the MCP client capability is particularly valuable — it means ANTON can use any MCP-compatible tool (Slack, Jira, Salesforce, Google Workspace, HubSpot, etc.) without custom integration code. As the MCP ecosystem grows, ANTON's mission capabilities grow automatically.

#### 13.2 Browser Automation Layer (Playwright)

**Why Playwright:** Playwright is the industry-standard Node.js browser automation framework — cross-browser (Chromium, Firefox, WebKit), headless by default, built-in wait/retry logic, network interception, screenshot/PDF capture, and strong TypeScript support. It's what Devin and OpenAI Operator use under the hood for web interactions.

**What ANTON uses it for:**

| Use Case | Example | Mission Type |
|---|---|---|
| Web scraping & monitoring | Track competitor pricing pages, extract product changes | Competitor Intelligence |
| Form submission | File regulatory submissions on government portals | Compliance |
| Social media management | Post content on LinkedIn, schedule tweets | Online Marketing |
| Ad platform management | Create/adjust campaigns on Google Ads, Meta Business | Online Marketing |
| Recruitment platforms | Post job ads on job boards, screen candidates on LinkedIn | Recruitment |
| Travel booking | Search and book flights/hotels on travel sites | Travel Planning |
| Document retrieval | Download regulatory publications from EUR-Lex, EBA, ESMA | Regulatory Monitoring |
| Portal interaction | Check application status on government portals | Compliance |
| Data extraction | Scrape structured data from web tables, dashboards | Research |
| Screenshot evidence | Capture visual proof of web state for audit trails | Any |

**Architecture:**

```typescript
// server/services/browser-automation.ts

interface BrowserAction {
  type: 'navigate' | 'click' | 'fill' | 'select' | 'extract' | 'screenshot' | 
        'wait' | 'scroll' | 'download' | 'evaluate';
  selector?: string;        // CSS or XPath selector
  value?: string;           // For fill/select actions
  url?: string;             // For navigate
  waitFor?: string;         // Wait condition
  extractSchema?: object;   // For structured data extraction
  screenshotPath?: string;  // For screenshots
  script?: string;          // For evaluate (run JS in page)
}

interface BrowserSession {
  id: string;
  mission_id: string;
  task_id: string;
  browser: 'chromium' | 'firefox' | 'webkit';
  headless: boolean;
  pages_visited: string[];
  actions_taken: BrowserAction[];
  screenshots_captured: string[];
  data_extracted: any[];
  created_at: Date;
  closed_at: Date | null;
}

class BrowserAutomationService {
  // Session management
  async createSession(config: BrowserSessionConfig): Promise<BrowserSession>
  async closeSession(sessionId: string): Promise<void>
  
  // Navigation
  async navigate(sessionId: string, url: string, waitUntil?: string): Promise<PageInfo>
  async goBack(sessionId: string): Promise<void>
  
  // Interaction
  async click(sessionId: string, selector: string): Promise<void>
  async fill(sessionId: string, selector: string, value: string): Promise<void>
  async select(sessionId: string, selector: string, value: string): Promise<void>
  async upload(sessionId: string, selector: string, filePath: string): Promise<void>
  
  // Extraction
  async extractText(sessionId: string, selector: string): Promise<string>
  async extractStructured(sessionId: string, schema: ExtractionSchema): Promise<any>
  async extractTable(sessionId: string, tableSelector: string): Promise<any[][]>
  async screenshot(sessionId: string, options?: ScreenshotOptions): Promise<string>  // returns path
  async pdf(sessionId: string, options?: PdfOptions): Promise<string>  // returns path
  
  // Waiting
  async waitForSelector(sessionId: string, selector: string, timeout?: number): Promise<void>
  async waitForNavigation(sessionId: string, timeout?: number): Promise<void>
  async waitForNetworkIdle(sessionId: string, timeout?: number): Promise<void>
  
  // LLM-guided interaction (fallback when service packs fail or don't exist)
  async executeWithLLMGuidance(sessionId: string, objective: string, model: ModelSelection): Promise<BrowserResult>
  
  // Service Pack integration (primary — fast, cheap, reliable)
  async executeServicePackWorkflow(sessionId: string, packId: string, workflowId: string, params: Record<string, string>): Promise<BrowserResult>
  async validatePackSelectors(packId: string, pageId: string): Promise<SelectorHealthReport>
  async proposePackUpdate(packId: string, elementId: string, newSelector: string, screenshot: string, reasoning: string): Promise<void>
}
```

**The key innovation: LLM-guided browser interaction.**

Unlike traditional Playwright scripts where every step is pre-coded, ANTON uses the LLM to *decide* what to do on each page. The flow:

```
1. Navigate to target URL
2. Take screenshot + extract page structure (DOM summary)
3. Send to LLM: "You are on [page]. Your objective is [task]. 
   Here is the page structure. What action should you take next?"
4. LLM returns: { action: "click", selector: "#login-button" }
5. Execute action
6. Repeat from step 2 until objective is met or stuck
```

This means ANTON can navigate unfamiliar websites without pre-built automation scripts. The LLM interprets the page visually (via screenshot) and structurally (via DOM), decides the next action, and executes it. This is the same approach OpenAI Operator uses — but integrated into ANTON's professional governance framework.

**Vision model requirement:** LLM-guided browser interaction works best with vision-capable models (Claude Opus/Sonnet, GPT-4 Turbo, Gemini). For non-vision models (Mistral Large, most Ollama models), ANTON falls back to DOM-only guidance (text description of the page structure without screenshot). This is less reliable but still functional for well-structured pages.

#### 13.3 Service Packs — "Knowledge Packs for the Web"

**The key insight:** LLM-guided Playwright is powerful but slow, expensive, and brittle. Every page load requires a screenshot, an LLM call to interpret it, and a decision cycle. On a familiar service like LinkedIn, this is wasteful — we already *know* how LinkedIn works. The same principle that makes regulatory knowledge packs valuable (pre-structured domain knowledge that loads instantly) applies to web services.

**Service Packs are pre-built, structured descriptions of how a specific website, app, or service works** — its navigation structure, page layouts, form fields, selectors, API endpoints, authentication flow, and common workflows. When a Service Pack is loaded, ANTON knows exactly where to click, what to fill, and how to navigate — no LLM interpretation needed. Playwright becomes the fallback for when things change or when ANTON encounters a page the pack doesn't cover.

**The interaction hierarchy (fast → slow, cheap → expensive):**

```
Priority 1: Service Pack + direct execution
            ↓ Pack exists, selectors valid → Execute immediately
            ↓ Pack exists, selectors broken → Fall through

Priority 2: API connector (if available)
            ↓ Structured API call → Execute via connector
            ↓ No API or API insufficient → Fall through

Priority 3: MCP tool (if available)
            ↓ MCP server for this service → Execute via MCP
            ↓ No MCP server → Fall through

Priority 4: LLM-guided Playwright (fallback)
            ↓ Screenshot + DOM → LLM decides → Execute
            ↓ This is the "figure it out" mode
```

**Service Pack structure (`.anton` package, type: `service_pack`):**

```json
{
  "pack_type": "service_pack",
  "service_id": "linkedin",
  "service_name": "LinkedIn",
  "version": "2.4.0",
  "last_verified": "2026-04-10",
  "author": "ANTON Community / Daniel Bardun",
  "description": "Navigation, posting, messaging, and recruitment flows for LinkedIn",
  
  "service_info": {
    "base_urls": ["https://www.linkedin.com", "https://www.linkedin.com/in/"],
    "auth_type": "oauth2",
    "auth_flow": {
      "login_url": "https://www.linkedin.com/login",
      "username_selector": "#username",
      "password_selector": "#password",
      "submit_selector": "button[type='submit']",
      "success_indicator": ".feed-identity-module",
      "mfa_expected": true,
      "mfa_selector": "#input__phone_verification_pin"
    },
    "rate_limits": {
      "posts_per_day": 3,
      "connection_requests_per_week": 100,
      "messages_per_day": 50
    }
  },

  "pages": {
    "feed": {
      "url_pattern": "https://www.linkedin.com/feed/",
      "elements": {
        "new_post_button": "button.share-box-feed-entry__trigger",
        "post_text_area": ".ql-editor",
        "post_submit": "button.share-actions__primary-action",
        "post_visibility": "button.share-creation-state__share-type"
      }
    },
    "profile": {
      "url_pattern": "https://www.linkedin.com/in/{username}/",
      "elements": {
        "name": "h1.text-heading-xlarge",
        "headline": "div.text-body-medium",
        "connect_button": "button[aria-label*='Connect']",
        "message_button": "button[aria-label*='Message']"
      }
    },
    "job_posting": {
      "url_pattern": "https://www.linkedin.com/talent/post-a-job",
      "elements": {
        "job_title": "input[name='title']",
        "company": "input[name='company']",
        "description": ".ql-editor",
        "post_button": "button.post-job-action"
      }
    },
    "search": {
      "url_pattern": "https://www.linkedin.com/search/results/{type}/",
      "elements": {
        "search_input": "input.search-global-typeahead__input",
        "results_list": ".search-results-container",
        "result_item": ".entity-result",
        "next_page": "button[aria-label='Next']"
      }
    }
  },

  "workflows": {
    "post_content": {
      "description": "Post text content to LinkedIn feed",
      "steps": [
        { "action": "navigate", "url": "https://www.linkedin.com/feed/" },
        { "action": "click", "element": "new_post_button" },
        { "action": "wait", "for": "post_text_area", "timeout": 5000 },
        { "action": "fill", "element": "post_text_area", "value": "${content}" },
        { "action": "click", "element": "post_submit" },
        { "action": "wait", "for_navigation": true },
        { "action": "screenshot", "purpose": "confirmation" }
      ]
    },
    "search_people": {
      "description": "Search for people by keyword",
      "steps": [
        { "action": "navigate", "url": "https://www.linkedin.com/search/results/people/?keywords=${query}" },
        { "action": "wait", "for": "results_list" },
        { "action": "extract", "element": "result_item", "schema": {
          "name": ".entity-result__title-text a",
          "headline": ".entity-result__primary-subtitle",
          "location": ".entity-result__secondary-subtitle"
        }}
      ]
    }
  },

  "known_issues": [
    { "date": "2026-03", "issue": "LinkedIn occasionally serves different DOM for A/B tests on feed page", "workaround": "If new_post_button selector fails, try '.artdeco-card button:first-child'" },
    { "date": "2026-02", "issue": "Rate limiting on connection requests is aggressively enforced", "workaround": "Max 100/week, spread across multiple sessions" }
  ],

  "fallback_hints": {
    "if_selectors_fail": "LinkedIn redesigns frequently. If selectors break, use LLM-guided mode with these hints: the post button is always at the top of the feed, the text editor uses a Quill-based rich text editor, the submit button is blue and on the right.",
    "if_blocked": "LinkedIn may show a CAPTCHA or security check. Pause and escalate to human."
  }
}
```

**How Service Packs integrate with the Mission Controller:**

```
Mission task: "Post weekly compliance update to LinkedIn"
    │
    ├─ Check: Is there a Service Pack for linkedin? → YES
    │
    ├─ Load pack: linkedin v2.4.0
    │
    ├─ Check: Is the "post_content" workflow defined? → YES
    │
    ├─ Execute workflow steps directly (no LLM interpretation needed)
    │   ├─ Navigate to feed ✅
    │   ├─ Click new post button...
    │   │   └─ Selector fails! (LinkedIn redesigned the button)
    │   │
    │   ├─ Check pack "known_issues" → No matching workaround
    │   │
    │   ├─ FALLBACK: Switch to LLM-guided mode
    │   │   ├─ Load pack "fallback_hints" into LLM context
    │   │   ├─ Take screenshot
    │   │   ├─ LLM: "The post button appears to have moved. I can see a 
    │   │   │        'Start a post' element at coordinates (x, y). Clicking."
    │   │   ├─ Continue with LLM guidance for remaining steps
    │   │   └─ Log: "Service Pack selector failed for 'new_post_button'. 
    │   │           LLM fallback succeeded. Pack may need update."
    │   │
    │   └─ Post published ✅
    │
    └─ Report: "Posted to LinkedIn. Note: Service Pack selector for 
               'new_post_button' is outdated — flagged for community update."
```

**Service Pack lifecycle:**

| Stage | Description |
|---|---|
| **Create** | Expert builds pack by mapping a service's pages, selectors, and workflows. Can be done manually or semi-automated (ANTON visits pages, extracts DOM, expert curates). |
| **Test** | Pack is tested against the live service — all selectors verified, all workflows executed in dry-run mode. |
| **Publish** | Pack published as `.anton` package (type: `service_pack`) to community marketplace. |
| **Use** | Mission loads pack, executes workflows directly. Fast, cheap, reliable. |
| **Degrade** | When selectors break (service redesigned), ANTON falls back to LLM-guided mode and flags the pack as needing update. |
| **Update** | Community or author updates the pack with new selectors. Users pull the update. Version bump. |
| **Auto-heal** | Future: when LLM-guided fallback succeeds, ANTON proposes selector updates to the pack automatically — community reviews and merges. |

**Priority Service Packs (ship with Phase 2.5-3):**

| Service | Category | Complexity | Key Workflows |
|---|---|---|---|
| LinkedIn | Social / Recruitment | High | Post content, search people, send messages, post jobs |
| EUR-Lex | Regulatory | Medium | Search legislation, download documents, track publications |
| EBA website | Regulatory | Medium | Monitor consultations, download guidelines |
| Google Ads | Advertising | High | Create campaigns, adjust budgets, view performance reports |
| HubSpot | CRM | Medium | Create contacts, manage deals, send email sequences |
| Bolagsverket | Business registry (SE) | Low | Company lookups, extract registration data |
| Companies House | Business registry (UK) | Low | Company lookups, filing history |
| Google Search | Research | Low | Structured search, extract results |
| Indeed / LinkedIn Jobs | Recruitment | Medium | Post jobs, search candidates |
| Slack (web) | Communication | Low | Post messages (backup when MCP unavailable) |

**Community-driven growth:** Just like regulatory knowledge packs, Service Packs are the perfect marketplace product. A LinkedIn expert creates and maintains the LinkedIn pack. A Google Ads specialist maintains the Ads pack. A Swedish compliance professional maintains the Bolagsverket pack. Contributors earn reputation and potentially revenue. The community keeps packs fresh as services change. ANTON gets more capable with every pack published.

**Self-healing packs (future, v0.9+):** When LLM-guided fallback succeeds after a pack selector fails, ANTON captures the new working selector and proposes a pack update. The proposal includes: the old selector, the new selector, the screenshot showing the element, and the LLM's reasoning. The pack author reviews and approves. Over time, packs partially maintain themselves — the community handles edge cases and major redesigns, but routine selector drift is caught and proposed automatically.

**Relationship to API connectors and MCP:**

Service Packs, API connectors, and MCP tools are not competing approaches — they're complementary layers. The Mission Controller checks all available channels for each service and picks the best one:

| If available... | Use for... | Example |
|---|---|---|
| API connector | Structured operations (create, read, update, delete) | HubSpot: create contact via API |
| MCP server | Tool-based operations via standardised protocol | Slack: post message via MCP |
| Service Pack | Browser-based operations, especially UI-heavy workflows | LinkedIn: post with rich media, navigate profiles |
| LLM-guided Playwright | Unknown services or when all above fail | Random government portal with no API |

A single mission task might use multiple channels: API connector to create a HubSpot contact, Service Pack to post about it on LinkedIn, and MCP to notify the team on Slack.

#### 13.4 Credential Vault

Missions need credentials to log into services, authenticate with APIs, and authorise actions. The Credential Vault provides secure, encrypted storage.

**Stored credential types:**

| Type | Use Case | Storage |
|---|---|---|
| API Key | REST API authentication (Google Ads, HubSpot, etc.) | Encrypted at rest, injected at runtime |
| OAuth 2.0 Token | Social media, Google Workspace, Microsoft 365 | Token + refresh token, auto-refresh |
| Username/Password | Legacy web portals, government sites | Encrypted, used only by browser sessions |
| Client Certificate | mTLS connections to enterprise APIs | Certificate + key, encrypted |
| Cookie Jar | Maintain session state across browser wake/sleep cycles | Encrypted, mission-scoped |

**Security model:**

- All credentials encrypted at rest using AES-256 (or platform keychain where available)
- Credentials are **never** included in LLM prompts — they're injected at the execution layer only
- Each credential has a scope: which missions/templates can use it
- All credential access is logged to the audit trail
- Credential rotation reminders (API keys approaching expiry)
- Master password or hardware key required to unlock vault (not stored by ANTON)
- RBAC-governed: admin creates credentials, analyst uses them within permitted missions

**Database:**

```sql
CREATE TABLE credential_vault (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,                    -- Human-readable name ("LinkedIn OAuth", "Google Ads API Key")
    credential_type TEXT NOT NULL CHECK(credential_type IN (
        'api_key', 'oauth2', 'username_password', 'client_certificate', 'cookie_jar', 'bearer_token'
    )),
    service_name TEXT,                     -- "linkedin", "google_ads", "eur-lex", etc.
    encrypted_data BLOB NOT NULL,          -- AES-256 encrypted credential payload
    encryption_key_id TEXT NOT NULL,       -- Reference to encryption key (user's master key)
    
    -- Scope
    allowed_mission_templates TEXT DEFAULT '["*"]',  -- JSON array of template IDs, or ["*"] for all
    allowed_services TEXT DEFAULT '["*"]',            -- JSON array of service names
    
    -- OAuth specific
    oauth_token_url TEXT,
    oauth_refresh_token_encrypted BLOB,
    oauth_expires_at DATETIME,
    oauth_scopes TEXT,
    
    -- Metadata
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME,
    expires_at DATETIME,
    is_active INTEGER DEFAULT 1,
    
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE credential_access_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    credential_id TEXT NOT NULL,
    mission_id TEXT,
    task_id TEXT,
    access_type TEXT NOT NULL CHECK(access_type IN ('read', 'refresh', 'rotate', 'revoke')),
    service_accessed TEXT,
    success INTEGER DEFAULT 1,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (credential_id) REFERENCES credential_vault(id),
    FOREIGN KEY (mission_id) REFERENCES missions(id)
);
```

#### 13.5 Pre-Built API Connectors

While ANTON can call any REST API via the generic API step type, common services benefit from pre-built connectors with typed schemas, authentication handling, and rate limit awareness.

**Priority connectors (ship with Phase 2-3):**

| Category | Service | Integration Type | Mission Use Cases |
|---|---|---|---|
| **Social Media** | LinkedIn | OAuth 2.0 + API | Post content, manage company page, recruitment |
| | Twitter/X | OAuth 2.0 + API | Post content, monitor mentions |
| **Advertising** | Google Ads | OAuth 2.0 + API | Create campaigns, adjust budgets, track performance |
| | Meta Business | OAuth 2.0 + API | Facebook/Instagram ads management |
| **CRM** | HubSpot | API Key + API | Contact management, deal tracking, email sequences |
| | Salesforce | OAuth 2.0 + MCP | Full CRM operations via MCP connector |
| **Communication** | Slack | OAuth 2.0 + MCP | Post updates, read channels, manage threads |
| | Microsoft Teams | OAuth 2.0 + MCP | Post updates, manage channels |
| | Email (SMTP) | Credentials | Send emails (already exists as workflow step) |
| **Project Mgmt** | Jira | API Token + API | Create issues, track progress, manage sprints |
| | Asana | OAuth 2.0 + MCP | Task management |
| **Regulatory** | EUR-Lex | Public API | Fetch regulation texts, monitor publications |
| | EBA | Web scraping (Playwright) | Monitor consultations, download documents |
| **Business Data** | Company registries | API / Playwright | Bolagsverket (SE), Companies House (UK), etc. |
| | Dow Jones / Roaring | API (partnership) | Risk screening, company intelligence |
| **File Storage** | Google Drive | OAuth 2.0 + MCP | Read/write documents, manage folders |
| | SharePoint | OAuth 2.0 + API | Enterprise document management |
| **Calendar** | Google Calendar | OAuth 2.0 + MCP | Schedule meetings, manage events |
| | Outlook Calendar | OAuth 2.0 + API | Schedule meetings |
| **Payments** | FutureChain | Native integration | Mission financial operations (Phase 4) |

**Connector architecture:** Each connector is a TypeScript module implementing a common interface:

```typescript
interface ServiceConnector {
  id: string;
  name: string;
  category: string;
  authType: 'api_key' | 'oauth2' | 'basic' | 'none';
  
  // Auth
  authenticate(credentialId: string): Promise<AuthSession>
  refreshAuth(session: AuthSession): Promise<AuthSession>
  
  // Discovery
  getAvailableActions(): ServiceAction[]
  getActionSchema(actionId: string): JSONSchema
  
  // Execution
  executeAction(actionId: string, params: Record<string, any>): Promise<ActionResult>
  
  // Rate limiting
  getRateLimits(): RateLimitConfig
  checkRateLimit(): Promise<boolean>
}
```

**MCP-first strategy:** Where an MCP server exists for a service (Slack, Salesforce, Google Calendar, Asana, Gmail), use MCP rather than building a custom connector. MCP connectors are maintained by the community and update independently of ANTON. Custom connectors are built only where MCP coverage doesn't exist.

#### 13.6 Action Governance

Real-world actions have real-world consequences. The Action Layer has its own governance framework on top of the mission's general autonomy controls.

**Action classification:**

| Risk Level | Examples | Governance |
|---|---|---|
| **Read-only** | Web scraping, API data retrieval, screenshot capture | Logged, no approval needed |
| **Low-impact write** | Posting pre-approved content, creating draft documents | Logged, approval at Briefing+ autonomy |
| **High-impact write** | Sending emails to external parties, submitting forms, modifying CRM records | Logged, always requires human approval on first occurrence per service |
| **Financial** | Ad spend, payments, subscription changes | Logged, always requires human approval, subject to financial budget |
| **Irreversible** | Deleting records, submitting regulatory filings, publishing public content | Logged, always requires human approval regardless of autonomy level |

**Action allow-list per mission:** The mission's `data_scope` is extended with an `actions_allowed` field:

```json
{
  "data_scope": {
    "actions_allowed": {
      "browser": {
        "domains_allowed": ["linkedin.com", "eur-lex.europa.eu"],
        "domains_denied": ["*"],
        "can_submit_forms": false,
        "can_authenticate": true
      },
      "api": {
        "services_allowed": ["hubspot", "eur-lex"],
        "write_allowed": false,
        "rate_limit_override": null
      },
      "mcp": {
        "servers_allowed": ["slack-mcp", "google-calendar-mcp"],
        "tools_denied": ["slack:delete_message", "calendar:delete_event"]
      }
    }
  }
}
```

**Screenshot audit trail:** Every browser interaction captures a screenshot before and after each action. These are stored in the mission's audit trail so a human can review exactly what ANTON did on every page. This is critical for compliance-grade auditability.

#### 13.7 The Offline/Air-Gapped Constraint

For missions running with `provider_preference: "ollama"` (air-gapped), the Action Layer is restricted:

- **Browser Layer:** Disabled (no internet access)
- **API Layer:** Limited to local network APIs only (internal databases, on-premise services)
- **MCP Layer:** Limited to local MCP servers only

This constraint is enforced at the infrastructure level, not just configuration — ensuring that air-gapped missions genuinely cannot leak data.

---

---

## PART 2: CLAUDE CODE IMPLEMENTATION BRIEF

---

### Investigation-First Protocol

**CRITICAL:** Before writing any new code, Claude Code must scan the existing codebase for:

1. The existing workflow engine (`WorkflowBuilder.tsx`, `WorkflowMonitor.tsx`, workflow execution engine)
2. The existing scheduling system (`workflow_schedules` table, CRON infrastructure)
3. The Orchestrator pattern and how it manages multi-step LLM interactions
4. The Knowledge Atom extraction pipeline (`knowledge_atoms`, `atom_sources`, `atom_tags`, `atom_relationships` tables)
5. The Apprentice Model tables and progression logic (`apprentice_stages`, `apprentice_history`, `apprentice_confidence`, `override_log`)
6. The Quality Ratchet scoring system
7. The Compliance-as-Code rule execution engine
8. The existing notification/alert systems (deadline alerts, radar alerts)
9. The `.anton` package export/import system
10. The audit logging infrastructure
11. The external data integration framework (`connections` table, REST API step, database query step, MCP client/server)
12. The existing webhook and email step types in the workflow engine
13. Any existing browser automation or Playwright dependencies in `package.json`
14. The existing credential/secrets management (API keys for LLM providers — how are they stored today?)
15. The `unified-llm-client.ts` and `model-adapter.ts` for understanding the provider-agnostic pattern to replicate for service connectors

**Goal:** Extend existing infrastructure wherever possible. Do not duplicate workflow execution, knowledge extraction, quality scoring, or compliance checking. The Mission Controller is an orchestration layer **on top of** these existing systems.

---

### Implementation Order

#### Step 1: Database Schema (New Tables)

Create the following new tables. **Do not modify existing tables** — add foreign key references from new tables to existing ones.

**GROUP: Mission Core (6 tables)**

```sql
-- Table 1: Mission definitions
CREATE TABLE missions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    objective TEXT NOT NULL,
    context TEXT,
    success_criteria TEXT NOT NULL,
    autonomy_level TEXT NOT NULL CHECK(autonomy_level IN ('check_in', 'briefing', 'full_autonomy')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'briefed', 'active', 'paused', 'review', 'completed', 'aborted')),
    priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'critical')),
    
    -- Budget limits
    token_budget_max INTEGER DEFAULT 5000000,
    token_budget_consumed INTEGER DEFAULT 0,
    time_budget_max_seconds INTEGER DEFAULT 604800,  -- 7 days
    time_active_max_seconds INTEGER DEFAULT 86400,    -- 24 hours active
    time_active_consumed_seconds INTEGER DEFAULT 0,
    financial_budget_max REAL DEFAULT 0,
    financial_budget_consumed REAL DEFAULT 0,
    
    -- Data scope (JSON)
    data_scope TEXT DEFAULT '{}',
    notification_preferences TEXT DEFAULT '{}',
    
    -- Model strategy (JSON) — provider preference, fallback, cost optimisation
    model_strategy TEXT DEFAULT '{"planning_model":"auto","execution_model":"auto","utility_model":"auto","provider_preference":"any","fallback_enabled":true,"cost_optimise":false}',
    
    -- Metadata
    template_id TEXT,
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,
    completed_at DATETIME,
    deadline DATETIME,
    
    -- Mission summary (compressed context for wake-up)
    mission_summary TEXT,
    mission_summary_updated_at DATETIME,
    
    FOREIGN KEY (template_id) REFERENCES mission_templates(id)
);

-- Table 2: Task graph nodes
CREATE TABLE mission_tasks (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    parent_task_id TEXT,  -- for sub-tasks
    title TEXT NOT NULL,
    description TEXT,
    task_type TEXT NOT NULL CHECK(task_type IN ('llm', 'research', 'analysis', 'export', 'review', 'notification', 'checkpoint', 'conditional', 'parallel_group', 'browser', 'api_call', 'database_query')),
    status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued', 'active', 'completed', 'failed', 'skipped', 'blocked', 'paused')),
    priority INTEGER DEFAULT 0,
    
    -- Module mapping
    module_id TEXT,
    area_id TEXT,
    module_config TEXT DEFAULT '{}',  -- JSON: module-specific parameters
    
    -- Model used for this task (recorded at execution time)
    provider TEXT,          -- 'anthropic', 'mistral', 'openai', 'gemini', 'ollama'
    model TEXT,             -- e.g. 'claude-opus-4-6', 'mistral-large-2411'
    model_tier TEXT,        -- 'planning', 'execution', 'utility' (which strategy tier was used)
    
    -- Execution details
    estimated_tokens INTEGER,
    actual_tokens_consumed INTEGER DEFAULT 0,
    estimated_duration_seconds INTEGER,
    actual_duration_seconds INTEGER,
    
    -- Results
    output_summary TEXT,
    output_full TEXT,
    quality_score REAL,
    confidence_score REAL,
    atoms_produced INTEGER DEFAULT 0,
    
    -- Error handling
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    last_error TEXT,
    
    -- Ordering
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,
    completed_at DATETIME,
    
    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_task_id) REFERENCES mission_tasks(id)
);

-- Table 3: Task dependencies (DAG edges)
CREATE TABLE mission_task_dependencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    depends_on_task_id TEXT NOT NULL,
    dependency_type TEXT DEFAULT 'blocking' CHECK(dependency_type IN ('blocking', 'informational')),
    
    FOREIGN KEY (task_id) REFERENCES mission_tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (depends_on_task_id) REFERENCES mission_tasks(id) ON DELETE CASCADE,
    UNIQUE(task_id, depends_on_task_id)
);

-- Table 4: Mission activity log
CREATE TABLE mission_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id TEXT NOT NULL,
    task_id TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    activity_type TEXT NOT NULL CHECK(activity_type IN (
        'mission_created', 'mission_started', 'mission_paused', 'mission_resumed',
        'mission_completed', 'mission_aborted',
        'task_started', 'task_completed', 'task_failed', 'task_retried', 'task_skipped',
        'checkpoint_reached', 'checkpoint_approved', 'checkpoint_rejected',
        'knowledge_atom_created', 'quality_score_recorded',
        'compliance_check_passed', 'compliance_violation',
        'budget_warning', 'budget_exceeded',
        'self_correction_attempted', 'escalation_triggered',
        'human_feedback_received', 'decision_made',
        'wake_up', 'sleep', 'context_reconstructed',
        'browser_session_started', 'browser_session_closed', 'browser_action_taken',
        'api_call_made', 'credential_accessed', 'action_approval_requested',
        'action_approval_granted', 'action_approval_denied'
    )),
    description TEXT,
    details TEXT DEFAULT '{}',  -- JSON: activity-specific data
    tokens_consumed INTEGER DEFAULT 0,
    
    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES mission_tasks(id)
);

-- Table 5: Mission decisions (autonomous decision audit trail)
CREATE TABLE mission_decisions (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    task_id TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    decision_type TEXT NOT NULL CHECK(decision_type IN (
        'approach_selection', 'module_selection', 'data_source_selection',
        'quality_tradeoff', 'priority_adjustment', 'scope_adjustment',
        'escalation_decision', 'self_correction', 'task_spawn'
    )),
    description TEXT NOT NULL,
    options_considered TEXT NOT NULL DEFAULT '[]',  -- JSON array
    selected_option TEXT NOT NULL,
    confidence REAL NOT NULL,
    reasoning TEXT,
    overridden_by_human INTEGER DEFAULT 0,
    override_reasoning TEXT,
    compliance_check_passed INTEGER DEFAULT 1,
    
    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES mission_tasks(id)
);

-- Table 6: Mission templates
CREATE TABLE mission_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    pillar TEXT NOT NULL CHECK(pillar IN ('work', 'life', 'school')),
    category TEXT,
    version TEXT DEFAULT '1.0.0',
    author TEXT,
    
    -- Template content (JSON)
    parameters_schema TEXT NOT NULL DEFAULT '[]',     -- JSON: configurable parameters
    task_graph_template TEXT NOT NULL DEFAULT '{}',    -- JSON: template task graph
    default_data_scope TEXT DEFAULT '{}',
    default_budget TEXT DEFAULT '{}',
    default_autonomy_level TEXT DEFAULT 'check_in',
    success_criteria_template TEXT,
    required_modules TEXT DEFAULT '[]',                -- JSON: required module IDs
    
    -- Metrics
    times_used INTEGER DEFAULT 0,
    avg_completion_time_seconds INTEGER,
    avg_quality_score REAL,
    avg_token_consumption INTEGER,
    
    -- Metadata
    is_builtin INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Extend existing tables (add columns, don't modify existing columns):**

```sql
-- Tag knowledge atoms with mission scope
ALTER TABLE knowledge_atoms ADD COLUMN mission_id TEXT;
ALTER TABLE knowledge_atoms ADD COLUMN mission_scope TEXT;

-- Tag apprentice stages for mission-type tracking
-- (New table for mission-type autonomy tracking)
CREATE TABLE mission_type_autonomy (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id TEXT,
    mission_category TEXT,
    current_level TEXT DEFAULT 'check_in' CHECK(current_level IN ('check_in', 'briefing', 'full_autonomy')),
    total_completions INTEGER DEFAULT 0,
    successful_completions INTEGER DEFAULT 0,
    override_rate REAL DEFAULT 1.0,
    avg_quality_score REAL,
    last_promotion_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (template_id) REFERENCES mission_templates(id)
);

CREATE TABLE mission_type_autonomy_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    autonomy_id INTEGER NOT NULL,
    previous_level TEXT NOT NULL,
    new_level TEXT NOT NULL,
    reason TEXT,
    metrics_snapshot TEXT DEFAULT '{}',  -- JSON
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (autonomy_id) REFERENCES mission_type_autonomy(id)
);
```

**Indexes:**

```sql
CREATE INDEX idx_missions_status ON missions(status);
CREATE INDEX idx_missions_created_by ON missions(created_by);
CREATE INDEX idx_mission_tasks_mission_id ON mission_tasks(mission_id);
CREATE INDEX idx_mission_tasks_status ON mission_tasks(status);
CREATE INDEX idx_mission_activity_mission_id ON mission_activity(mission_id);
CREATE INDEX idx_mission_activity_timestamp ON mission_activity(timestamp);
CREATE INDEX idx_mission_decisions_mission_id ON mission_decisions(mission_id);
CREATE INDEX idx_knowledge_atoms_mission_id ON knowledge_atoms(mission_id);
```

**GROUP: Action Layer (4 tables)**

```sql
-- Credential Vault (encrypted credential storage)
CREATE TABLE credential_vault (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    credential_type TEXT NOT NULL CHECK(credential_type IN (
        'api_key', 'oauth2', 'username_password', 'client_certificate', 'cookie_jar', 'bearer_token'
    )),
    service_name TEXT,
    encrypted_data BLOB NOT NULL,
    encryption_key_id TEXT NOT NULL,
    
    -- Scope
    allowed_mission_templates TEXT DEFAULT '["*"]',
    allowed_services TEXT DEFAULT '["*"]',
    
    -- OAuth specific
    oauth_token_url TEXT,
    oauth_refresh_token_encrypted BLOB,
    oauth_expires_at DATETIME,
    oauth_scopes TEXT,
    
    -- Metadata
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME,
    expires_at DATETIME,
    is_active INTEGER DEFAULT 1,
    
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Credential access audit log
CREATE TABLE credential_access_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    credential_id TEXT NOT NULL,
    mission_id TEXT,
    task_id TEXT,
    access_type TEXT NOT NULL CHECK(access_type IN ('read', 'refresh', 'rotate', 'revoke')),
    service_accessed TEXT,
    success INTEGER DEFAULT 1,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (credential_id) REFERENCES credential_vault(id),
    FOREIGN KEY (mission_id) REFERENCES missions(id)
);

-- Browser sessions (Playwright)
CREATE TABLE browser_sessions (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    browser TEXT DEFAULT 'chromium' CHECK(browser IN ('chromium', 'firefox', 'webkit')),
    headless INTEGER DEFAULT 1,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'closed', 'error')),
    
    -- Session data
    pages_visited TEXT DEFAULT '[]',          -- JSON array of URLs
    actions_count INTEGER DEFAULT 0,
    screenshots_captured TEXT DEFAULT '[]',    -- JSON array of file paths
    cookies_snapshot BLOB,                     -- Encrypted cookie jar for session persistence
    
    -- Governance
    domains_allowed TEXT DEFAULT '["*"]',
    forms_submitted INTEGER DEFAULT 0,
    credential_ids_used TEXT DEFAULT '[]',
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME,
    
    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES mission_tasks(id)
);

-- Browser action log (every click, fill, navigate)
CREATE TABLE browser_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    mission_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    action_type TEXT NOT NULL CHECK(action_type IN (
        'navigate', 'click', 'fill', 'select', 'upload', 'download',
        'screenshot', 'extract', 'wait', 'scroll', 'evaluate', 'submit_form'
    )),
    url TEXT,
    selector TEXT,
    value TEXT,                    -- For fill/select (NEVER contains credentials)
    result_summary TEXT,
    screenshot_before TEXT,        -- File path to screenshot before action
    screenshot_after TEXT,         -- File path to screenshot after action
    success INTEGER DEFAULT 1,
    error_message TEXT,
    llm_reasoning TEXT,            -- Why the LLM chose this action (for audit)
    
    FOREIGN KEY (session_id) REFERENCES browser_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (mission_id) REFERENCES missions(id),
    FOREIGN KEY (task_id) REFERENCES mission_tasks(id)
);

CREATE INDEX idx_credential_vault_service ON credential_vault(service_name);
CREATE INDEX idx_credential_access_log_credential ON credential_access_log(credential_id);
CREATE INDEX idx_browser_sessions_mission ON browser_sessions(mission_id);
CREATE INDEX idx_browser_actions_session ON browser_actions(session_id);
CREATE INDEX idx_browser_actions_mission ON browser_actions(mission_id);
```

**GROUP: Service Packs (2 tables)**

```sql
-- Service Pack registry
CREATE TABLE service_packs (
    id TEXT PRIMARY KEY,
    service_id TEXT NOT NULL UNIQUE,       -- "linkedin", "eur-lex", "google-ads"
    service_name TEXT NOT NULL,
    version TEXT DEFAULT '1.0.0',
    author TEXT,
    description TEXT,
    category TEXT,                          -- "social", "regulatory", "advertising", "crm", etc.
    
    -- Pack content (JSON — the full service pack definition)
    service_info TEXT NOT NULL DEFAULT '{}',
    pages TEXT NOT NULL DEFAULT '{}',
    workflows TEXT NOT NULL DEFAULT '{}',
    known_issues TEXT DEFAULT '[]',
    fallback_hints TEXT DEFAULT '{}',
    
    -- Health tracking
    last_verified DATETIME,
    selectors_health TEXT DEFAULT 'healthy' CHECK(selectors_health IN ('healthy', 'degraded', 'broken')),
    fallback_count INTEGER DEFAULT 0,      -- How often LLM fallback was needed
    total_uses INTEGER DEFAULT 0,
    
    -- Source
    is_builtin INTEGER DEFAULT 0,
    anton_package_id TEXT,                  -- If imported from .anton package
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Service Pack selector health log (tracks when selectors break and self-heal proposals)
CREATE TABLE service_pack_health (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pack_id TEXT NOT NULL,
    page_id TEXT,
    element_id TEXT,
    old_selector TEXT,
    proposed_selector TEXT,                 -- From LLM fallback auto-heal
    screenshot_path TEXT,
    llm_reasoning TEXT,
    status TEXT DEFAULT 'detected' CHECK(status IN ('detected', 'proposed', 'accepted', 'rejected')),
    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    
    FOREIGN KEY (pack_id) REFERENCES service_packs(id) ON DELETE CASCADE
);

CREATE INDEX idx_service_packs_service_id ON service_packs(service_id);
CREATE INDEX idx_service_pack_health_pack ON service_pack_health(pack_id);
```

---

#### Step 2: Mission Controller Service

**File:** `server/services/mission-controller.ts`

This is the core new service. It orchestrates mission execution.

**Responsibilities:**

1. **Mission lifecycle management** — create, start, pause, resume, abort, complete
2. **Task decomposition** — take a mission brief, call LLM to generate task graph DAG
3. **Task scheduling** — determine which tasks are ready to execute (all dependencies met)
4. **Task execution** — invoke the appropriate ANTON module for each task via existing infrastructure
5. **Context reconstruction** — rebuild mission context on wake-up
6. **Budget tracking** — monitor token/time/financial consumption, enforce limits
7. **Self-correction loop** — attempt recovery before escalation
8. **Mission summary generation** — compress context at each sleep cycle

**Key methods:**

```typescript
class MissionController {
  // Lifecycle
  async createMission(brief: MissionBrief): Promise<Mission>
  async startMission(missionId: string): Promise<void>
  async pauseMission(missionId: string, reason: string): Promise<void>
  async resumeMission(missionId: string): Promise<void>
  async abortMission(missionId: string, reason: string): Promise<void>
  async completeMission(missionId: string): Promise<MissionResult>
  
  // Task management
  async decomposeObjective(mission: Mission): Promise<TaskGraph>
  async getReadyTasks(missionId: string): Promise<MissionTask[]>
  async executeTask(task: MissionTask, missionContext: MissionContext): Promise<TaskResult>
  async handleTaskFailure(task: MissionTask, error: Error): Promise<FailureResponse>
  async spawnSubTask(parentTask: MissionTask, subTaskDef: TaskDefinition): Promise<MissionTask>
  
  // Context management
  async reconstructContext(missionId: string): Promise<MissionContext>
  async generateMissionSummary(missionId: string): Promise<string>
  async compactMissionHistory(missionId: string): Promise<void>
  
  // Budget management
  async checkBudget(missionId: string): Promise<BudgetStatus>
  async recordTokenUsage(missionId: string, taskId: string, tokens: number): Promise<void>
  async recordFinancialSpend(missionId: string, amount: number, category: string): Promise<SpendResult>
  
  // Autonomy
  async checkAutonomyLevel(missionId: string, action: ProposedAction): Promise<AutonomyDecision>
  async recordDecision(decision: MissionDecision): Promise<void>
  async evaluateMissionTypePromotion(templateId: string): Promise<PromotionResult>
  
  // Self-correction
  async attemptSelfCorrection(task: MissionTask, failure: TaskFailure): Promise<CorrectionResult>
  async escalateToHuman(missionId: string, issue: EscalationIssue): Promise<void>
  
  // Model selection (provider-agnostic)
  async selectModelForTask(task: MissionTask, strategy: ModelStrategy): Promise<ModelSelection>
  async resolveAutoModel(tier: 'planning' | 'execution' | 'utility', strategy: ModelStrategy): Promise<ModelSelection>
  async getProviderFallbackChain(strategy: ModelStrategy): Promise<ProviderConfig[]>
  async checkProviderAvailability(provider: string): Promise<boolean>
}
```

**Integration points with existing services:**

- `unified-llm-client.ts` + `model-adapter.ts` — **ALL LLM calls go through this layer**. The Mission Controller never constructs provider-specific payloads directly
- `getPromptTier()` — auto-detect model capability for prompt style and context reconstruction aggressiveness
- `knowledge-resolver.ts` — for knowledge source access during tasks
- `prompt-builder.ts` — for 7-layer prompt construction per task (provider-agnostic)
- `quality-ratchet.ts` (or equivalent) — for output quality scoring
- `compliance-rules.ts` — for compliance checks on outputs
- `knowledge-atoms.ts` (or equivalent extraction logic) — for atom extraction from task outputs
- Workflow execution engine — for step-type execution (LLM, wait, webhook, etc.)
- `time-intelligence.ts` — for deadline awareness
- `regulatory-radar.ts` — for regulatory trigger detection
- Provider-specific adapters in `adapters/*.ts` — only accessed indirectly through unified client

---

#### Step 3: Mission Scheduler Service

**File:** `server/services/mission-scheduler.ts`

Manages the wake/sleep cycle of missions.

**Responsibilities:**

1. **CRON-based wake-ups** — extend existing CRON infrastructure for mission scheduling
2. **Event-driven wake-ups** — wake mission when trigger conditions are met (e.g., new regulatory radar item, deadline approaching, external webhook)
3. **Mission queue management** — prioritise active missions, prevent resource contention
4. **Sleep cycle** — after completing current task batch, generate summary, sleep until next wake

**Integration:** Build on top of existing `workflow_schedules` infrastructure. Add a new schedule type `mission_wake` alongside existing workflow schedule types.

---

#### Step 4: Backend API Routes

**File:** `server/routes/missions.ts`

| Method | Route | Description |
|---|---|---|
| POST | `/api/missions` | Create a new mission |
| GET | `/api/missions` | List all missions (with filters: status, pillar, category) |
| GET | `/api/missions/:id` | Get mission details including task graph |
| PUT | `/api/missions/:id` | Update mission brief (only in draft/paused state) |
| POST | `/api/missions/:id/start` | Start a mission |
| POST | `/api/missions/:id/pause` | Pause a mission |
| POST | `/api/missions/:id/resume` | Resume a paused mission |
| POST | `/api/missions/:id/abort` | Abort a mission |
| GET | `/api/missions/:id/tasks` | Get task graph with current states |
| GET | `/api/missions/:id/tasks/:taskId` | Get task details with output |
| POST | `/api/missions/:id/tasks/:taskId/approve` | Approve a checkpoint task |
| POST | `/api/missions/:id/tasks/:taskId/reject` | Reject a checkpoint task (with feedback) |
| GET | `/api/missions/:id/activity` | Get activity feed (paginated) |
| GET | `/api/missions/:id/decisions` | Get autonomous decision log |
| GET | `/api/missions/:id/budget` | Get budget consumption details |
| GET | `/api/missions/:id/atoms` | Get knowledge atoms produced by this mission |
| GET | `/api/missions/:id/peek` | Peek at current execution state (live) |
| SSE | `/api/missions/:id/stream` | Server-sent events for real-time dashboard updates |
| GET | `/api/mission-templates` | List available templates |
| GET | `/api/mission-templates/:id` | Get template details |
| POST | `/api/mission-templates` | Create custom template |
| PUT | `/api/mission-templates/:id` | Update template |

---

#### Step 5: Frontend — Mission Pages

**New pages:**

| Page | File | Description |
|---|---|---|
| Missions Overview | `src/pages/MissionsPage.tsx` | List all missions with status badges, progress bars, health indicators. Filter by status/pillar/category. "New Mission" button. |
| Mission Creator | `src/pages/MissionCreatorPage.tsx` | Mission brief form. Template selector. Budget configuration. Data scope configuration. |
| Mission Dashboard | `src/pages/MissionDashboardPage.tsx` | **The hero page.** Live task graph visualisation, activity feed, budget monitor, peek function, notification log, action buttons (pause/resume/abort). SSE-connected for real-time updates. |
| Mission Review | `src/pages/MissionReviewPage.tsx` | Review checkpoint outputs. Approve/reject with feedback. View quality scores and compliance checks. |
| Mission Templates | `src/pages/MissionTemplatesPage.tsx` | Browse built-in and custom templates. Configure parameters. Import templates from `.anton` packages. |

**Updated existing pages:**

| Page | Change |
|---|---|
| Dashboard / Home | Add "Active Missions" widget showing mission count, health status, next checkpoints |
| Navigation | Add "Missions" section in sidebar with badge showing active mission count |
| Knowledge Atoms | Add filter by mission_id to view atoms from specific missions |

---

#### Step 6: Task Decomposition Engine

**File:** `server/services/task-decomposition.ts`

This service takes a mission brief and generates a task DAG using LLM reasoning.

**Prompt architecture:**

```
System: You are ANTON's Mission Planner. Given a mission objective, decompose it into 
a directed acyclic graph of tasks. Each task should map to an ANTON module where possible.

Available modules: [inject from module registry]
Available knowledge sources: [inject from data_scope]

Rules:
1. Tasks must be concrete and executable — not vague ("do research" → "search EUR-Lex for AMLR Article 8-15 requirements")
2. Dependencies must be explicit — no circular references
3. Include human checkpoint tasks at natural review points
4. Estimate token consumption per task
5. Flag tasks that require capabilities not currently available

Output format: JSON task graph (schema provided)
```

**Important:** The decomposition itself should be a logged mission decision, so the human can review the proposed plan before execution begins (in Check-in and Briefing autonomy levels).

---

### Affected Files Summary

**New files (create):**

```
server/services/mission-controller.ts      — Core mission orchestration
server/services/mission-scheduler.ts       — Wake/sleep cycle management
server/services/task-decomposition.ts      — LLM-powered task graph generation
server/services/mission-context.ts         — Context reconstruction & compression (model-aware: adapts to context window size via getPromptTier())
server/routes/missions.ts                  — REST API endpoints
server/routes/mission-templates.ts         — Template management endpoints
src/pages/MissionsPage.tsx                 — Mission list overview
src/pages/MissionCreatorPage.tsx           — Mission brief creation form
src/pages/MissionDashboardPage.tsx         — Live mission monitoring dashboard
src/pages/MissionReviewPage.tsx            — Checkpoint review interface
src/pages/MissionTemplatesPage.tsx         — Template browser
src/components/missions/TaskGraphView.tsx  — Visual DAG component
src/components/missions/ActivityFeed.tsx   — Rolling activity log component
src/components/missions/BudgetMonitor.tsx  — Budget consumption display
src/components/missions/PeekPanel.tsx      — Live execution peek component
src/components/missions/MissionCard.tsx    — Mission summary card for lists
src/components/missions/MissionBriefForm.tsx — Mission creation form

# Action Layer
server/services/browser-automation.ts      — Playwright browser session management, LLM-guided interaction
server/services/credential-vault.ts        — Encrypted credential storage, OAuth token refresh, access logging
server/services/service-connectors.ts      — Connector registry and base interface for external services
server/services/connectors/linkedin.ts     — LinkedIn API connector (OAuth 2.0)
server/services/connectors/hubspot.ts      — HubSpot API connector
server/services/connectors/google-ads.ts   — Google Ads API connector
server/services/connectors/eur-lex.ts      — EUR-Lex public API connector
server/routes/credentials.ts              — Credential vault management API
server/routes/browser.ts                  — Browser session management API (admin/debug)
src/pages/CredentialVaultPage.tsx         — Credential management UI
src/components/missions/BrowserPreview.tsx — Live browser session viewer (peek into Playwright sessions)
src/components/missions/ActionLog.tsx      — Action-level audit trail viewer

# Service Packs
server/services/service-pack-manager.ts    — Load, validate, execute service pack workflows, track health
server/services/service-pack-fallback.ts   — LLM-guided fallback when pack selectors break, auto-heal proposals
server/routes/service-packs.ts             — Service pack CRUD, health status, import from .anton
src/pages/ServicePacksPage.tsx             — Browse, import, test, and monitor service pack health
src/components/missions/ServicePackStatus.tsx — Health indicator (healthy/degraded/broken) per pack
```

**Existing files to extend (do not rewrite — add to):**

```
server/database/schema.ts (or equivalent)  — Add new tables
server/services/knowledge-atoms.ts         — Add mission_id tagging
server/routes/index.ts                     — Register new route modules
src/App.tsx (or router config)             — Add new routes
src/components/navigation/*                — Add Missions nav item
src/pages/DashboardPage.tsx                — Add active missions widget
```

---

### Acceptance Criteria

#### Phase 1 (v0.7.0) — Minimum Viable Mission

- [ ] User can create a mission from the UI with objective, success criteria, and budget
- [ ] ANTON decomposes the objective into a task graph (human can review before start)
- [ ] Mission executes tasks sequentially, invoking existing ANTON modules
- [ ] Task graph visualisation shows real-time state (complete/active/queued)
- [ ] Activity feed shows rolling log of actions
- [ ] Budget tracking shows token consumption vs. limit
- [ ] Mission pauses when budget exceeded or when checkpoint reached
- [ ] Human can approve/reject checkpoint outputs
- [ ] All decisions logged in mission_decisions table
- [ ] Mission summary generated at each pause/sleep for context reconstruction
- [ ] At least 2 working starter templates (AMLR Readiness + Competitor Intelligence)
- [ ] Mission context reconstruction works — mission can be paused and resumed with continuity
- [ ] Quality Ratchet runs on every task output
- [ ] Compliance-as-Code checks run on every task output
- [ ] Knowledge atoms extracted from task outputs are tagged with mission_id
- [ ] Mission runs successfully on Anthropic Claude (Opus or Sonnet)
- [ ] Mission runs successfully on Mistral Large
- [ ] Mission runs successfully on at least one Ollama model (e.g., Mistral 7B)
- [ ] Model selection per task works — planning uses highest available, utility tasks use cheapest
- [ ] Provider fallback: if primary provider fails, mission continues on fallback provider
- [ ] Cost tracking shows per-provider breakdown in Budget Monitor
- [ ] Context reconstruction adapts to model context window size (128K vs 1M)

#### Phase 2 (v0.7.5) — Intelligent Autonomy

- [ ] Failure recovery: transient errors auto-retry, quality failures trigger re-attempt
- [ ] Self-correction loop: ANTON tries alternative approaches before escalating
- [ ] Mission-scoped data isolation: missions cannot access out-of-scope data
- [ ] Notification system: FYI/Review/Urgent tiers with configurable channels
- [ ] Mission type autonomy tracking: earned progression from check_in → briefing → full_autonomy
- [ ] 5 working starter templates
- [ ] Parallel task execution within mission (when dependencies allow)
- [ ] Dynamic sub-task spawning (ANTON can add tasks to the graph during execution)
- [ ] Peek function: inspect live execution without interrupting
- [ ] Mission summary compression efficient enough for <25K tokens on complex missions

#### Phase 2.5 (v0.7.5) — Action Layer

- [ ] Credential Vault: credentials stored encrypted at rest (AES-256)
- [ ] Credential Vault: OAuth 2.0 token storage with automatic refresh
- [ ] Credential Vault: all credential access logged to credential_access_log
- [ ] Credential Vault: credentials are NEVER included in LLM prompts — verified by audit
- [ ] Credential Vault UI: admin can create, view (masked), rotate, and revoke credentials
- [ ] Playwright: headless Chromium browser sessions managed by BrowserAutomationService
- [ ] Playwright: navigate, click, fill, extract, screenshot actions all functional
- [ ] Playwright: every action logged to browser_actions table with before/after screenshots
- [ ] Playwright: LLM-guided interaction works — LLM receives page screenshot + DOM summary and decides next action
- [ ] Playwright: LLM-guided interaction works on both vision models (Claude, GPT-4) and DOM-only fallback (Mistral, Ollama)
- [ ] Playwright: domain allow-list enforced — browser cannot navigate to domains not in actions_allowed
- [ ] Playwright: form submission blocked unless explicitly allowed in data_scope
- [ ] API connectors: base ServiceConnector interface implemented
- [ ] API connectors: at least 3 working connectors (LinkedIn, EUR-Lex, HubSpot)
- [ ] Action governance: read-only actions execute without approval; high-impact writes require human approval
- [ ] Action governance: irreversible actions always require human approval regardless of autonomy level
- [ ] Air-gapped constraint: Ollama-only missions cannot launch browser sessions or call external APIs

#### Phase 2.5 (continued) — Service Packs

- [ ] Service Pack schema validated — packs load, parse, and validate against JSON schema
- [ ] Service Pack workflow execution — pack workflows execute steps directly without LLM interpretation
- [ ] Graceful degradation — when a pack selector fails, ANTON falls to LLM-guided Playwright with pack fallback_hints loaded into context
- [ ] Health tracking — each selector failure increments fallback_count and sets selectors_health to 'degraded'
- [ ] Auto-heal proposal — when LLM fallback finds a working selector, it's recorded in service_pack_health as a proposed update
- [ ] At least 3 working Service Packs shipped (LinkedIn, EUR-Lex, Google Search)
- [ ] Service Packs importable/exportable as `.anton` packages (type: `service_pack`)
- [ ] Service Pack UI — browse installed packs, see health status, test individual workflows
- [ ] Interaction hierarchy works — Mission Controller checks pack → API → MCP → LLM-guided in order

---

### Technical Notes

1. **SQLite vs PostgreSQL:** Phase 1 builds on SQLite (current platform default). The mission tables are designed to be PostgreSQL-compatible for the planned migration. No SQLite-specific features used.

2. **Concurrency:** Only one mission task should execute at a time per ANTON instance (unless parallel task groups are explicitly defined). Use a simple mutex/queue, not complex distributed locking.

3. **Streaming:** The Mission Dashboard uses SSE (Server-Sent Events) for real-time updates — same pattern as existing streaming responses. The `/api/missions/:id/stream` endpoint pushes activity events as they occur.

4. **Token counting:** Use existing token counting infrastructure. If not available, implement using `tiktoken` or Anthropic's token counting API.

5. **LLM choice for missions — model-agnostic strategy:** Missions run through the existing `unified-llm-client.ts` and `model-adapter.ts` infrastructure. The Mission Controller never calls a provider API directly — it always goes through the unified adapter layer.

   **Model selection hierarchy per mission task:**
   
   | Task Type | Recommended Tier | Rationale |
   |---|---|---|
   | Task decomposition (planning) | Highest available (Opus 4.6, Mistral Large, GPT-4) | Planning quality determines mission success |
   | Complex analysis tasks | Highest available | Regulatory interpretation, gap analysis, strategic work |
   | Research / web search | Mid-tier (Sonnet 4.5, Mistral Large, GPT-4 Turbo) | Adequate capability, lower cost |
   | Content generation (drafts) | Mid-tier | Good quality, high volume |
   | Summarisation / extraction | Low-tier (Haiku, Gemini Flash, Ollama) | Simple tasks, maximise budget |
   | Mission summary compression | Mid-tier | Quality matters but runs frequently |
   
   **Configuration:** The mission brief includes a `model_strategy` field:
   ```json
   {
     "model_strategy": {
       "planning_model": "auto",         // "auto" = highest available
       "execution_model": "auto",         // "auto" = user's default model  
       "utility_model": "auto",           // "auto" = cheapest available
       "provider_preference": "any",      // "any" | "anthropic" | "mistral" | "openai" | "ollama"
       "fallback_enabled": true,          // try next provider if primary fails
       "cost_optimise": false             // if true, prefer cheaper models where quality allows
     }
   }
   ```
   
   **`"auto"` resolution:** The Mission Controller calls `getPromptTier()` for the available models and selects the best match for each task type. If the user has configured a provider preference (e.g., `"mistral"` for EU data residency), that constraint is respected.
   
   **Provider fallback:** If the primary provider fails (API down, rate limited), and `fallback_enabled` is true, the Mission Controller tries the next available provider. Fallback order is configurable but defaults to: user's preferred → Anthropic → Mistral → OpenAI → Gemini → Ollama. Each fallback triggers an activity log entry so the user knows which model actually executed the task.
   
   **Mistral-specific considerations:**
   - EU data residency: missions with `provider_preference: "mistral"` guarantee all LLM calls stay within EU infrastructure — valuable for GDPR-sensitive compliance missions
   - Seed parameter: Mistral supports reproducible outputs via seed — the Mission Controller should pass a deterministic seed per task for auditability
   - Context window (128K): smaller than Anthropic's 1M, so mission context reconstruction must be aggressive (see §3.6 model-aware reconstruction)
   
   **Ollama-specific considerations:**
   - Air-gapped missions: missions with `provider_preference: "ollama"` run entirely offline — no data leaves the network. Critical for classified or highly sensitive work
   - Performance: GPU-dependent. The Mission Controller should include model inference time in budget estimates, as Ollama tasks may take significantly longer
   - Context window: varies by model. `mission-context.ts` must query Ollama for the active model's context limit at mission start
   
   **Cost tracking:** Every API call within a mission is logged to the existing `audit_log` with provider, model, tokens, and estimated cost. The Budget Monitor aggregates this per-mission and per-task, enabling cost comparison across providers. Mission templates should include estimated costs per provider so users can make informed model choices.

6. **Testing:** Each Phase should include integration tests that run a simple mission end-to-end (create → decompose → execute 3 tasks → checkpoint → approve → complete). Use a mock LLM provider for deterministic testing.

7. **Playwright dependency:** Install via `pnpm add playwright @playwright/test`. Browser binaries are installed separately via `npx playwright install chromium` (only Chromium needed initially — Firefox and WebKit are optional). Playwright adds ~200MB for the browser binary. For air-gapped deployments, browser binaries can be pre-bundled. **Important:** Playwright runs in the Node.js backend process, not in the frontend — browser sessions are server-side only.

8. **Credential encryption:** Use Node.js built-in `crypto` module with AES-256-GCM for credential encryption. The encryption key is derived from the user's master password via PBKDF2 (100,000 iterations). **Never** store the master password — only the derived key hash for verification. Consider integrating with OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service) for key storage in desktop deployments.

9. **Screenshot storage:** Browser action screenshots are stored in `data/mission-screenshots/{mission_id}/{task_id}/` with filenames like `{action_id}_before.png` and `{action_id}_after.png`. Implement automatic cleanup after mission completion + configurable retention period (default: 30 days). Screenshots are not included in LLM context unless the task specifically requires visual analysis — they are primarily for human audit review.

---

### Key Design Principles (Repeat for Emphasis)

1. **Extend, don't duplicate.** The Mission Controller orchestrates existing ANTON services. It does not re-implement quality scoring, compliance checking, knowledge extraction, or prompt building.

2. **Earned autonomy, not granted autonomy.** Missions start conservative (check_in) and earn the right to more independence through demonstrated performance.

3. **Never push forward on impossible tasks.** If ANTON is stuck, it escalates. The self-correction loop is a best-effort attempt, not infinite retry.

4. **The human is always accountable.** Autonomous does not mean unreviewed. Even at Full Autonomy, the human reviews the final deliverable.

5. **Every decision is logged.** No autonomous decision goes unrecorded. This is both a compliance requirement and a trust-building feature.

6. **Budget hard stops, not budget warnings.** When a budget is exceeded, the mission pauses. It does not continue and apologise later.

7. **Model-agnostic by default, model-aware by design.** Every mission must work on any supported provider. The Mission Controller adapts to model capabilities (context window, tools, thinking) but never depends on a specific provider. `unified-llm-client.ts` is the only way to call an LLM — no provider-specific imports in mission code.

8. **Credentials never touch the LLM.** API keys, passwords, OAuth tokens, and session cookies are injected at the execution layer only. They are never included in prompts, never logged in plain text, never stored in knowledge atoms, and never surfaced in the Mission Dashboard. The LLM decides *what* to do; the execution layer handles *how* to authenticate.

---

**END OF SPECIFICATION**
