# openEXPERT / ANTON — AI Orchestrator: Full Specification & Implementation Guide

> **Audience:** Claude Code  
> **Purpose:** Full briefing on a major new platform capability — the AI Orchestrator ("ANTON Prime") — an intelligent management layer that reads platform signals, proposes actions, chains workflows, and earns autonomy through graduated trust. This document explains the vision, the thinking behind each phase, how it connects to every existing subsystem, and concrete guidance on implementation.  
> **Reference documents:** This spec is informed by two companion research documents in the project:  
> — `ANTON_AI_ORCHESTRATOR_INVESTIGATION.md` — architectural vision, trust model, strategic rationale  
> — `OPENCLAW_RESEARCH_FOR_ANTON.md` — competitive intelligence from OpenClaw (what to adopt, what to avoid)  
> **First step for Claude Code:** Before writing a single line of code, read this document fully, then explore the codebase to understand what already exists. The Orchestrator does not create new AI capability — it *connects and manages* everything ANTON already has. If you don't understand the existing subsystems deeply, you will build the wrong thing. Everything here must integrate into and extend what is already there, not duplicate or diverge from it.

---

## 1. Context: What Already Exists and Where This Fits

The Orchestrator is not a new area or a new module. It is a new **platform capability layer** that sits above all existing areas, modules, and workflows. Think of it as the difference between having 29 brilliant specialists on a team (which ANTON already is) and having a brilliant operations manager who knows what each specialist can do, when they should be deployed, and how their outputs feed into each other.

**The critical insight:** ANTON already has the sensory apparatus — the subsystems that generate signals. What's missing is the brain that reads them all together, reasons about them in combination, and acts. The Orchestrator IS that brain.

### Existing subsystems the Orchestrator must read from and interact with:

- **Workflow Engine** (`workflow-engine.ts`) — 12 step types, execution tracking, checkpoint decisions. The Orchestrator triggers workflows, monitors them, and chains their outputs.
- **Workflow Scheduling** (`workflow_schedules` table) — CRON-based scheduling. The Orchestrator proposes new schedules and manages recurring patterns.
- **Quality Ratchet** (`quality_scores`, `quality_baselines`, `quality_alerts` tables) — 6-dimensional scoring. The Orchestrator reads quality trends and acts on degradation.
- **Apprentice Model** (`apprentice_stages`, `apprentice_confidence`, `override_log` tables) — 4-stage progression per module. The Orchestrator follows the same model for its own trust progression.
- **Pattern Detection** (`detected_patterns`, `pattern_alerts`, `detector_configs` tables) — 5 detector types. The Orchestrator reads pattern alerts as signals.
- **Institutional Memory** (`institutional_memory` or equivalent) — Decision history, overrides, preferences. The Orchestrator reads and contributes to this.
- **Knowledge Graph** (`entities`, `relationships` or equivalent) — Entity-relationship network. The Orchestrator reads entity clusters and relationship changes.
- **Time Intelligence** (`deadlines`, `time_estimates` or equivalent) — Deadline tracking, overdue detection. The Orchestrator reads deadline status as signals.
- **Regulatory Radar** (`radar_sources`, `radar_items` tables) — AI-scored regulatory changes. The Orchestrator reads high-urgency items as signals.
- **Compliance-as-Code** (`compliance_rules`, `compliance_violations` or equivalent) — Rule enforcement. The Orchestrator is SUBJECT TO these rules, never above them.
- **Collaborative Canvas** (`step_assignments`, `parallel_reviews`, `canvas_comments`) — Team coordination. The Orchestrator can propose reviewer assignments.
- **Connections Framework** (`connections`, `connection_audit_log`) — External integrations. The Orchestrator uses existing approved connections, never creates new ones.
- **Seven-Layer Prompt Builder** (`prompt-builder.ts`) — The Orchestrator gets its own seven-layer prompt, just like every module.
- **Multi-LLM Architecture** (`unified-llm-client.ts`, `model-adapter.ts`) — The Orchestrator uses the same LLM infrastructure as everything else.
- **RBAC & Security** — JWT auth, role-based permissions. The Orchestrator operates within the same permission boundaries as the user/org context it serves.

**Claude Code: before implementing, scan the codebase for:**
- Every service file in `server/services/` — map which subsystem each serves
- Every database table in the schema — identify exactly which tables the Orchestrator needs to read from
- The workflow engine's execution model — how workflows are triggered, monitored, and how outputs are passed between steps
- The Quality Ratchet's scoring pipeline — how scores are generated, stored, and alerted on
- The Apprentice Model's stage progression logic — how stages advance, what criteria are checked
- The Pattern Detection engine's alert model — how patterns are detected and surfaced
- The Regulatory Radar's item lifecycle — how items flow from new → reviewed → actioned → dismissed
- The Compliance-as-Code rule execution pipeline — how rules are checked against outputs
- The Collaborative Canvas's assignment model — how steps get assigned to people
- The prompt-builder.ts signature and layer assembly — the Orchestrator needs its own prompt layers
- All existing API route patterns — the Orchestrator's routes must follow the same conventions
- All existing page patterns — the Orchestrator's UI must feel native to the platform
- How the existing `WorkflowMonitor.tsx` works — the Orchestrator dashboard will extend this pattern

**This matters because the Orchestrator's value comes entirely from connecting existing subsystems. If it doesn't read the real tables, use the real services, and follow the real patterns, it's useless.**

---

## 2. The Vision: Why an AI Orchestrator?

### The Problem

ANTON today has 238 modules, a workflow engine, CRON scheduling, quality scoring, pattern detection, regulatory monitoring, deadline tracking, institutional memory, and a knowledge graph. All powerful. All human-initiated.

A compliance officer must:
1. Notice that the Regulatory Radar flagged a new EBA guideline (manually check RadarPage)
2. Decide it's relevant to their organisation (read and assess)
3. Open the Gap Analysis module, configure it, attach knowledge sources, run it (navigate, configure, execute)
4. Review the output, decide next steps (read, evaluate)
5. Open the Action Plan Creator, feed in the gap analysis output (navigate, configure, execute)
6. Assign action items to team members (Collaborative Canvas)
7. Set deadlines (Time Intelligence)
8. Schedule a follow-up review (Workflow Scheduling)

Steps 1–8 are coordination work. The expert judgment happens at steps 2 and 4. Everything else is orchestration that an intelligent AI manager could handle — if it understood the platform, the domain, and the user's patterns.

### The Solution

An AI management layer that:
- **Observes** all platform signals continuously
- **Proposes** actions based on signal analysis and organisational context
- **Executes** workflows when authorised (by human approval or earned autonomy)
- **Monitors** output quality and workflow progress
- **Chains** workflow outputs as inputs to subsequent workflows
- **Reports** on platform activity, value delivered, and patterns observed
- **Learns** from human decisions to improve future proposals

### The Governing Principle

**The Orchestrator earns trust exactly like every other ANTON capability — through the Apprentice Model.** It starts as an Observer that can only generate briefings. It graduates to a Proposal Manager that suggests actions for human approval. It becomes a Supervised Orchestrator that auto-executes validated patterns. It eventually reaches Autonomous status where it manages recurring workflow chains independently — but always within Compliance-as-Code constraints, always with full audit trails, always with human override available.

This graduated trust model is ANTON's fundamental architectural advantage over tools like OpenClaw, which offer binary on/off autonomy with no governance.

### What We Learned From OpenClaw (Key Design Constraints)

OpenClaw is an open-source AI agent that went viral in January 2026 (145,000+ GitHub stars). It proved massive demand for "AI that does things." It also suffered catastrophic security failures: 800+ malicious skills in its registry, 30,000+ exposed instances, critical CVEs, prompt injection attacks that stole credentials and hijacked agents. From this, we extract hard design rules:

1. **Security is Phase 0, not Phase 4.** Hard limits, RBAC, audit trails, and kill switches are implemented first.
2. **The Orchestrator can never modify its own configuration, prompt layers, or compliance rules.** It can propose changes. Humans approve. (OpenClaw's memory poisoning vulnerability came from agents editing their own identity files.)
3. **The Orchestrator reads internal platform signals, not untrusted external content.** This eliminates the primary prompt injection vector that plagues OpenClaw.
4. **Graduated autonomy, not binary on/off.** OpenClaw is either running or not. ANTON's Orchestrator earns trust through measurable competence.
5. **The marketplace (future) must have tiered security.** Prompt-only packages are inherently safe. Script packages require sandboxing and review. Connection packages require admin approval.

**What we adopt from OpenClaw:**
1. **The Heartbeat Pattern.** Instead of only rigid CRON schedules, the Orchestrator has a regular heartbeat cycle where it reads all signals, exercises judgment about what needs attention, and stays silent when nothing does. This avoids alert fatigue.
2. **Messaging-native output.** Orchestrator briefings and proposals should be designed to work through Slack/Teams/messaging channels (when webhook integration is built), not only through in-platform UI.
3. **Self-extending proposal capability.** If the Orchestrator identifies recurring workflow patterns without dedicated templates, it can propose creating one.

---

## 3. The Orchestrator's Five Functions

These five functions define everything the Orchestrator does. Every database table, service, route, and UI component exists to serve one or more of these functions.

### Function 1: OBSERVE & ANALYSE (Signal Aggregation)

The Orchestrator reads platform signals from every subsystem on a configurable heartbeat cycle (default: every 30 minutes for assessment, daily for briefing generation).

**Signal sources and what they mean:**

| Source | Signal Type | Example | Urgency Indicator |
|---|---|---|---|
| Regulatory Radar | New high-scoring items | EBA guideline on crypto CDD, urgency 0.9 | urgency_score > 0.7 |
| Time Intelligence | Approaching/overdue deadlines | Quarterly BWRA due in 14 days | days_remaining < threshold |
| Quality Ratchet | Quality degradation trends | Policy Writer quality: 8.5 → 7.9 → 7.2 | 3+ consecutive below baseline |
| Pattern Detection | New detected patterns | "Gap analysis always followed by policy update" | confidence_score > threshold |
| Apprentice Model | Module stage progressions | AMLR Gap Analysis reached Supervised stage | stage_changed = true |
| Knowledge Graph | Entity cluster changes | New entity cluster around "crypto asset regulation" | cluster_size > threshold |
| Workflow Engine | Completed/failed/stalled workflows | Gap analysis workflow completed with quality 8.7 | status changed |
| Collaborative Canvas | Overdue assignments | Step assigned to analyst, 3 days overdue | overdue = true |
| Compliance-as-Code | Rule violations | Output missing required citations | severity = high |

**Output:** A prioritised situational picture — "what needs attention right now" — ranked by urgency and organisational relevance.

### Function 2: PLAN & PROPOSE (Action Planning)

Based on the situational picture, the Orchestrator generates proposals. Each proposal is a complete action plan, not a vague suggestion.

**Proposal structure:**
```
{
  signal_source: "regulatory_radar",
  signal_id: "radar_item_471",
  signal_summary: "New EBA guideline on crypto asset CDD scored urgency 0.9",
  proposed_action: "Run AMLR Gap Analysis focused on crypto asset CDD controls",
  workflow_plan: {
    steps: [
      { type: "module_execution", module: "amlr-gap-analysis", config: {...}, knowledge_sources: [...] },
      { type: "checkpoint", assignee: "senior_analyst", question: "Approve gap analysis before proceeding?" },
      { type: "decision_gate", condition: "gap_count > 0", true_path: "step_4", false_path: "end" },
      { type: "module_execution", module: "action-plan-creator", input_from: "step_1" },
      { type: "parallel", steps: [{ type: "step_assignment", ... }] },
      { type: "deadline_creation", ... }
    ]
  },
  confidence_score: 0.82,
  urgency_score: 0.9,
  estimated_effort: "2-3 hours elapsed, ~15 min human review",
  rationale: "This guideline directly affects crypto CDD controls. Last crypto-focused gap analysis was 47 days ago. Pattern detection shows your organisation typically runs gap analyses within 14 days of high-urgency radar items."
}
```

**Proposal types:**
- **Workflow trigger** — "Run this module/workflow in response to this signal"
- **Workflow chain** — "This completed workflow should feed into this next workflow"
- **Quality intervention** — "Quality is declining in this module, here's a diagnostic approach"
- **Deadline action** — "This deadline is approaching, here's a preparation workflow"
- **Pattern-based suggestion** — "I've noticed this recurring pattern, shall I create a template?"
- **Maintenance** — "These knowledge sources haven't been refreshed in 90 days"

### Function 3: EXECUTE & CHAIN (Workflow Management)

When a proposal is approved (or auto-approved at higher trust stages), the Orchestrator:
- Triggers workflows using the existing workflow engine (NOT a parallel engine — the same `workflow-engine.ts`)
- Passes outputs from completed workflows as inputs to subsequent workflows
- Manages error states: retry (with modified config), escalate (notify human), pause (wait for input)
- Routes outputs to appropriate reviewers via Collaborative Canvas

**Critical: The Orchestrator does NOT execute modules directly. It creates and triggers workflows through the existing workflow engine.** This ensures all existing governance (checkpoints, quality scoring, compliance checking, audit logging) applies automatically.

### Function 4: MONITOR & ASSESS (Quality & Progress)

While workflows execute, the Orchestrator:
- Reads `workflow_executions` status updates (already tracked by the workflow engine)
- Evaluates output quality by reading Quality Ratchet scores (already generated per output)
- Compares quality to organisational baselines and the proposal's expected quality range
- Detects when human intervention is needed (quality below threshold, unexpected output structure, stalled step)
- Identifies chain opportunities: "This gap analysis found 4 HIGH gaps — should I trigger the Action Plan workflow?"

### Function 5: REPORT & LEARN (Meta-Intelligence)

After execution cycles:
- Generates management summaries (configurable: daily, weekly, or on-demand)
- Updates institutional memory with orchestration decisions and outcomes
- Tracks proposal accuracy (what it proposed vs. what humans actually did)
- Adjusts confidence calibration over time
- Identifies its own blind spots ("I proposed 5 quality interventions this month — 4 were rejected. I may be over-sensitive to quality fluctuation in this module.")

---

## 4. Trust Architecture: The Orchestrator Apprentice Model

**This is the single most important section of this document.** The trust model determines everything — what the Orchestrator can do, when, and with what oversight. Get this wrong and you have either a useless observer or a dangerous autonomous agent. Get it right and you have a professional AI operations manager that earns trust through demonstrated competence.

The Orchestrator follows the same Apprentice Model as individual modules, but with its own stage definitions, criteria, and progression logic. The Orchestrator's stage is tracked per organisation (or per user in single-user deployments), not per module.

### Stage 1: Observer (Default — First Use)

**What the Orchestrator does:**
- Runs the heartbeat cycle: reads all signal sources, builds situational picture
- Generates **Situational Briefings** (daily by default, configurable)
- Within each briefing, proposes actions — but takes none
- Tracks what humans actually decide to do vs. what it proposed (accuracy tracking)
- Learns from the gap between its proposals and human decisions

**What the Orchestrator cannot do:**
- Trigger any workflow
- Modify any data
- Send any notification outside the platform
- Auto-approve anything

**What humans do:**
- Read briefings on the OrchestratorDashboard
- Optionally rate proposals: "good catch" / "relevant" / "irrelevant" / "wrong priority"
- Decide which proposals to act on manually (the Orchestrator observes these decisions)

**UI:** Briefing card on the dashboard. Proposal list with rating buttons. No execution controls visible.

**Progression criteria to Stage 2:**
- Minimum 14 days at Stage 1 (ensures sufficient observation period)
- 20+ briefings generated
- 50+ proposals generated
- \>60% of rated proposals scored "relevant" or "good catch"
- <15% of rated proposals scored "irrelevant" or "wrong"
- At least 10 proposals rated (can't progress without feedback)

### Stage 2: Proposal Manager

**What the Orchestrator does (additionally):**
- Creates complete **workflow execution plans** (not just suggestions — fully configured workflow definitions ready to execute)
- Presents plans as one-click approval requests: **[Approve] [Modify] [Reject]**
- On [Approve]: triggers the workflow via the existing workflow engine
- On [Modify]: opens the workflow in WorkflowBuilder pre-configured, human adjusts and runs
- On [Reject]: logs rejection with optional human feedback ("why?")
- Monitors approved workflows and reports completion/status
- Still requires human approval for every single action

**What the Orchestrator cannot do:**
- Auto-execute anything (every action requires explicit human approval)
- Create new connections or modify platform configuration
- Bypass any Compliance-as-Code rule

**UI:** Proposal cards with full workflow plan preview. Approve/Modify/Reject buttons. Execution status tracking.

**Progression criteria to Stage 3:**
- Minimum 30 days at Stage 2
- 30+ approved plans executed
- \>75% approval rate on proposals
- <10% of approved plans required significant modification (minor tweaks don't count)
- Average quality score on orchestrated outputs ≥ 7.5
- Zero compliance violations from orchestrated workflows
- Zero critical quality failures (overall score < 5.0)

### Stage 3: Supervised Orchestrator

**What the Orchestrator does (additionally):**
- Identifies **validated patterns**: recurring workflow configurations that have been approved ≥ 3 times with no modifications and quality ≥ 7.5
- **Auto-executes validated patterns** without per-execution human approval
- Sends **notification** of every auto-execution: "I've triggered the weekly regulatory update workflow — same configuration as the last 4 weeks. [View] [Pause] [Override]"
- Still requires approval for novel workflow combinations, first-time configurations, or any workflow involving new modules/areas
- Escalates when quality scores fall below baselines on auto-executed workflows

**What the Orchestrator cannot do:**
- Auto-execute anything that hasn't been validated (≥3 prior approvals, same config)
- Auto-execute workflows that modify external systems (API calls, email sends) — these always require approval
- Bypass checkpoints within workflows (human-in-the-loop steps remain mandatory)

**UI:** Validated Patterns library. Auto-execution notifications with View/Pause/Override. Pattern management (enable/disable/retire patterns).

**Progression criteria to Stage 4:**
- Minimum 60 days at Stage 3
- 60+ total orchestrated workflows (approved + auto-executed)
- \>85% of auto-executed workflows rated satisfactory
- <5% override rate on auto-executions
- Zero critical quality failures
- Zero compliance violations
- At least 5 validated patterns in active use

### Stage 4: Autonomous Orchestrator

**What the Orchestrator does (additionally):**
- Full autonomous management of validated workflow patterns
- **Intelligent workflow chaining**: reads outputs from completed workflows, assesses results, and triggers follow-up workflows based on output content and quality (e.g., gap analysis found HIGH gaps → auto-trigger action plan workflow)
- **Proactive recommendations**: "I notice we haven't reviewed crypto asset CDD controls since the new EBA guideline 3 weeks ago — I've prepared a gap analysis workflow. Shall I proceed, or would you like to adjust the scope?"
- **Management reporting**: weekly summaries of platform activity, value delivered, quality trends, pattern insights
- Self-monitoring with automatic stage demotion if quality or accuracy degrades

**What the Orchestrator can NEVER do (at any stage):**
- Bypass Compliance-as-Code rules
- Skip mandatory checkpoint steps in workflows
- Access data beyond RBAC permissions
- Modify its own prompt architecture, compliance rules, or configuration
- Create new external connections
- Override human decisions (if a human rejects a proposal, the Orchestrator needs new information before re-proposing)
- Suppress or modify audit trails
- Send external communications (email, API calls) without pre-approved connection configurations
- Continue operating if an admin triggers the kill switch

**UI:** Full command centre dashboard. Strategic priority setting. Management reports. Pattern performance analytics.

---

## 5. Implementation: Phase-by-Phase

### Phase 1: Observer + Briefings (Foundation)

**Goal:** The Orchestrator can read all platform signals and generate useful situational briefings with proposals. No execution capability.

#### 5.1.1 The Orchestrator's Seven-Layer Prompt

Create the Orchestrator's own prompt architecture, following the same pattern as every ANTON module:

**Layer 1: System Foundation** — Same `system-foundation.md` as all modules.

**Layer 2: Area Context** — New file: `server/areas/orchestrator/area-context.md`
```markdown
You are ANTON's AI Orchestrator — an operations management layer that reads signals 
from across the platform and helps coordinate professional work. You understand:

- How ANTON's 29 expert areas and 238 modules work
- How workflows chain modules into multi-step processes
- How the Quality Ratchet scores outputs across 6 dimensions
- How the Apprentice Model tracks competence progression
- How the Regulatory Radar monitors regulatory changes
- How deadlines, assignments, and collaborative reviews work
- How Compliance-as-Code rules govern output quality

Your role is to observe, analyse, and propose — helping humans manage the platform 
more effectively by surfacing what needs attention and suggesting how to respond.

You are not an executor by default. You earn execution authority through demonstrated 
competence, measured by the same Apprentice Model that governs every ANTON module.
```

**Layer 3: Module Expertise** — New file: `server/areas/orchestrator/modules/briefing-generator/system-prompt.md`
```markdown
# Situational Briefing Generator

## Objective
Read all platform signal sources and produce a prioritised briefing that tells the 
user what needs attention, why, and what the recommended response is.

## Methodology
1. Read all signal sources (radar, deadlines, quality, patterns, workflows, assignments)
2. Filter for signals that have changed since last briefing
3. Assess urgency and relevance of each signal
4. Generate proposals for actionable signals
5. Rank proposals by urgency × relevance × confidence
6. Produce a structured briefing with clear next-action recommendations

## Output Structure
- Summary line: "X items need attention. Y are urgent."
- For each proposal: signal source, what happened, recommended action, confidence, urgency
- Quality trend summary (if any changes)
- Upcoming deadlines summary
- Pattern insights (if any new patterns detected)

## Quality Criteria
- Proposals must be specific (not vague "review this")
- Proposals must include the exact module/workflow to use
- Proposals must reference the signal source with specifics (article numbers, dates, scores)
- Irrelevant or low-confidence proposals should be omitted, not included with caveats
```

**Layer 4: Persona** — "Operations Director" persona with experience in programme management, compliance operations, and resource allocation.

**Layer 5: Skills** — Attach existing skills: strategic planning, risk prioritisation, regulatory interpretation.

**Layer 6: Knowledge Sources** — The Orchestrator's knowledge source is the platform itself: database queries that retrieve current state from all signal tables.

**Layer 7: Transparency** — Thinking level: `think_hard` minimum. The Orchestrator's reasoning for every proposal must be visible and auditable.

#### 5.1.2 Signal Aggregation Service

**New service:** `server/services/orchestrator-engine.ts`

This is the core. It reads from every signal source and builds the situational picture.

```typescript
// Pseudocode — Claude Code should implement following existing service patterns

interface PlatformSignal {
  source: 'radar' | 'deadline' | 'quality' | 'pattern' | 'workflow' | 'assignment' | 'compliance' | 'apprentice' | 'knowledge_graph';
  signal_id: string;
  summary: string;
  urgency: number;       // 0.0 - 1.0
  relevance: number;     // 0.0 - 1.0
  detected_at: string;   // ISO timestamp
  raw_data: any;         // Source-specific data
}

interface OrchestratorProposal {
  signal: PlatformSignal;
  proposed_action: string;
  action_type: 'workflow_trigger' | 'workflow_chain' | 'quality_intervention' | 'deadline_action' | 'pattern_suggestion' | 'maintenance';
  workflow_plan?: WorkflowPlan;     // Complete workflow definition (Phase 2+)
  confidence: number;                // 0.0 - 1.0
  rationale: string;                 // Detailed reasoning
  estimated_effort: string;
}

// Signal readers — one function per signal source
async function readRadarSignals(since: Date): Promise<PlatformSignal[]>
async function readDeadlineSignals(): Promise<PlatformSignal[]>
async function readQualitySignals(since: Date): Promise<PlatformSignal[]>
async function readPatternSignals(since: Date): Promise<PlatformSignal[]>
async function readWorkflowSignals(since: Date): Promise<PlatformSignal[]>
async function readAssignmentSignals(): Promise<PlatformSignal[]>
async function readComplianceSignals(since: Date): Promise<PlatformSignal[]>
async function readApprenticeSignals(since: Date): Promise<PlatformSignal[]>
async function readKnowledgeGraphSignals(since: Date): Promise<PlatformSignal[]>

// Aggregation
async function aggregateSignals(since: Date): Promise<PlatformSignal[]>

// Briefing generation (calls LLM with orchestrator prompt + signal data)
async function generateBriefing(signals: PlatformSignal[]): Promise<Briefing>
```

**Claude Code: implement each signal reader by querying the actual tables that already exist.** Don't create wrapper tables or intermediate stores. Read directly from `radar_items`, `deadlines`, `quality_scores`, `detected_patterns`, `workflow_executions`, `step_assignments`, `compliance_violations`, `apprentice_stages`, etc.

#### 5.1.3 Heartbeat Service

**New service:** `server/services/orchestrator-heartbeat.ts`

The heartbeat runs on a configurable interval (default: 30 minutes). On each heartbeat:
1. Read all signal sources (since last heartbeat)
2. If any signals exceed urgency/relevance thresholds → flag for briefing
3. If no significant signals → log `HEARTBEAT_OK` and stay silent
4. If daily briefing is due → generate full briefing

**The heartbeat avoids alert fatigue.** It uses judgment (via LLM) to decide whether signals actually need attention. A new radar item scored 0.3 relevance doesn't trigger anything. A quality score dropping 1 point on a single output doesn't trigger anything. But a radar item scored 0.9 urgency, or a 3-session quality decline trend, or an overdue deadline — these trigger action.

**Implementation:** Use the existing CRON infrastructure (`workflow_schedules` pattern) if possible. If not, implement as a setInterval/node-cron process in the server.

#### 5.1.4 Database Tables

```sql
-- Orchestrator briefings
CREATE TABLE orchestrator_briefings (
  id TEXT PRIMARY KEY,
  org_id TEXT,                          -- Organisation context (nullable for single-user)
  user_id TEXT,                         -- User who receives this briefing
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  period TEXT NOT NULL DEFAULT 'daily', -- 'heartbeat', 'daily', 'weekly', 'on_demand'
  signals_read INTEGER NOT NULL,        -- Count of signals assessed
  proposals_count INTEGER NOT NULL,     -- Count of proposals generated
  content TEXT NOT NULL,                -- The briefing content (markdown)
  signals_data TEXT NOT NULL,           -- JSON: full signal data used
  status TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread', 'read', 'actioned', 'dismissed'))
);

-- Orchestrator proposals
CREATE TABLE orchestrator_proposals (
  id TEXT PRIMARY KEY,
  briefing_id TEXT REFERENCES orchestrator_briefings(id),
  org_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  -- Signal that triggered this proposal
  signal_source TEXT NOT NULL,
  signal_id TEXT,
  signal_summary TEXT NOT NULL,
  
  -- The proposal itself
  action_type TEXT NOT NULL CHECK(action_type IN (
    'workflow_trigger', 'workflow_chain', 'quality_intervention',
    'deadline_action', 'pattern_suggestion', 'maintenance'
  )),
  proposed_action TEXT NOT NULL,        -- Human-readable description
  workflow_plan TEXT,                   -- JSON: complete workflow definition (Phase 2+)
  confidence_score REAL NOT NULL,       -- 0.0 - 1.0
  urgency_score REAL NOT NULL,          -- 0.0 - 1.0
  rationale TEXT NOT NULL,              -- Why this was proposed
  estimated_effort TEXT,
  
  -- Human decision (Phase 1: rating only. Phase 2+: approval)
  status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN (
    'proposed', 'approved', 'modified', 'rejected', 'auto_executed', 'expired'
  )),
  human_rating TEXT CHECK(human_rating IN (
    'good_catch', 'relevant', 'low_priority', 'irrelevant', 'wrong'
  )),
  human_feedback TEXT,                  -- Optional freetext feedback
  decided_at TEXT,
  decided_by TEXT
);

-- Orchestrator stage tracking
CREATE TABLE orchestrator_stage (
  id TEXT PRIMARY KEY,
  org_id TEXT,                          -- Organisation context
  user_id TEXT,                         -- User context (for single-user)
  current_stage INTEGER NOT NULL DEFAULT 1 CHECK(current_stage BETWEEN 1 AND 4),
  stage_entered_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  -- Cumulative metrics
  total_briefings INTEGER NOT NULL DEFAULT 0,
  total_proposals INTEGER NOT NULL DEFAULT 0,
  proposals_rated INTEGER NOT NULL DEFAULT 0,
  proposals_good_or_relevant INTEGER NOT NULL DEFAULT 0,
  proposals_irrelevant_or_wrong INTEGER NOT NULL DEFAULT 0,
  
  -- Phase 2+ metrics
  plans_approved INTEGER NOT NULL DEFAULT 0,
  plans_modified INTEGER NOT NULL DEFAULT 0,
  plans_rejected INTEGER NOT NULL DEFAULT 0,
  executions_completed INTEGER NOT NULL DEFAULT 0,
  executions_failed INTEGER NOT NULL DEFAULT 0,
  avg_quality_score REAL,
  
  -- Phase 3+ metrics
  auto_executions INTEGER NOT NULL DEFAULT 0,
  auto_overrides INTEGER NOT NULL DEFAULT 0,
  
  -- Progression audit trail
  stage_history TEXT NOT NULL DEFAULT '[]',  -- JSON array of {stage, entered_at, exited_at, reason}
  last_progression_check TEXT,
  next_progression_check TEXT,
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Orchestrator heartbeat log
CREATE TABLE orchestrator_heartbeats (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  ran_at TEXT NOT NULL DEFAULT (datetime('now')),
  signals_checked INTEGER NOT NULL,
  signals_significant INTEGER NOT NULL,  -- Signals that exceeded thresholds
  action_taken TEXT NOT NULL CHECK(action_taken IN ('none', 'briefing_generated', 'alert_sent')),
  duration_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'ok' CHECK(status IN ('ok', 'error'))
);

-- Orchestrator configuration
CREATE TABLE orchestrator_config (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  
  -- Heartbeat settings
  heartbeat_enabled INTEGER NOT NULL DEFAULT 1,
  heartbeat_interval_minutes INTEGER NOT NULL DEFAULT 30,
  briefing_schedule TEXT NOT NULL DEFAULT 'daily',  -- 'daily', 'weekly', 'manual'
  briefing_time TEXT DEFAULT '08:00',               -- Time for scheduled briefings
  
  -- Thresholds
  radar_urgency_threshold REAL NOT NULL DEFAULT 0.7,
  quality_alert_threshold REAL NOT NULL DEFAULT 5.0, -- Points of decline to trigger alert
  deadline_alert_days INTEGER NOT NULL DEFAULT 14,    -- Days before deadline to alert
  
  -- Model settings
  heartbeat_model TEXT NOT NULL DEFAULT 'haiku',      -- Cheap model for heartbeat assessments
  briefing_model TEXT NOT NULL DEFAULT 'sonnet',      -- Mid-tier for briefings
  planning_model TEXT NOT NULL DEFAULT 'opus',        -- Best model for execution plans (Phase 2+)
  
  -- Kill switch
  orchestrator_paused INTEGER NOT NULL DEFAULT 0,
  paused_at TEXT,
  paused_by TEXT,
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### 5.1.5 API Routes

```
GET  /api/orchestrator/status           — Current stage, config, last heartbeat
GET  /api/orchestrator/briefings        — List briefings (paginated, filtered by period)
GET  /api/orchestrator/briefings/:id    — Single briefing with proposals
POST /api/orchestrator/briefings/generate — Manually trigger a briefing
GET  /api/orchestrator/proposals        — List proposals (paginated, filtered by status)
PATCH /api/orchestrator/proposals/:id   — Rate or provide feedback on a proposal
GET  /api/orchestrator/heartbeats       — Heartbeat log (for diagnostics)
GET  /api/orchestrator/config           — Current configuration
PATCH /api/orchestrator/config          — Update configuration (admin only)
POST /api/orchestrator/pause            — Pause the Orchestrator (admin only)
POST /api/orchestrator/resume           — Resume the Orchestrator (admin only)
POST /api/orchestrator/reset            — Reset stage to Observer (admin only)
GET  /api/orchestrator/stage            — Current stage with progression data
```

#### 5.1.6 UI Pages

**OrchestratorDashboard.tsx** — Main entry point

```
┌────────────────────────────────────────────────────────────────┐
│ ANTON Orchestrator                        Stage: Observer (1/4) │
│                                           Heartbeat: Active ●   │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ┌─ Latest Briefing (March 7, 2026) ─────────────────────────┐ │
│ │ 5 signals detected. 3 need attention.                      │ │
│ │                                                             │ │
│ │ 🔴 HIGH: New EBA guideline on crypto CDD (Radar)          │ │
│ │    Proposal: Run gap analysis focused on crypto controls   │ │
│ │    Confidence: 82%  |  [Good Catch] [Relevant] [Irrelevant]│ │
│ │                                                             │ │
│ │ 🟡 MEDIUM: Q1 BWRA deadline in 12 days (Deadline)         │ │
│ │    Proposal: Trigger BWRA preparation workflow             │ │
│ │    Confidence: 91%  |  [Good Catch] [Relevant] [Irrelevant]│ │
│ │                                                             │ │
│ │ 🟡 MEDIUM: Policy Writer quality declining (Quality)       │ │
│ │    Proposal: Review last 3 outputs, check knowledge sources│ │
│ │    Confidence: 67%  |  [Good Catch] [Relevant] [Irrelevant]│ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─ Stage Progression ──────────┐  ┌─ Quick Stats ───────────┐ │
│ │ Briefings: 8 / 20 needed    │  │ Proposals: 23 total     │ │
│ │ Proposals rated: 4 / 10     │  │ Good/Relevant: 78%      │ │
│ │ Good/Relevant rate: 75%     │  │ Last heartbeat: 12m ago │ │
│ │ Progress: ████████░░ 40%    │  │ Signals today: 7        │ │
│ └──────────────────────────────┘  └──────────────────────────┘ │
│                                                                 │
│ [Generate Briefing Now]  [Settings]  [Pause Orchestrator]      │
└────────────────────────────────────────────────────────────────┘
```

**Claude Code: match the existing platform's design language.** Use the same component patterns, colour scheme (navy #0B1426, teal #2DD4A8), card layouts, and navigation patterns as existing pages like RadarPage.tsx, WorkflowMonitor.tsx, and DeadlinesPage.tsx.

#### 5.1.7 Phase 1 Success Criteria

Before proceeding to Phase 2:
- Heartbeat runs reliably on schedule without errors
- Signal readers correctly pull data from all existing subsystem tables
- Briefings are generated with useful, specific proposals (not vague or hallucinated)
- Proposals reference real signal data (actual radar items, actual deadlines, actual quality scores)
- Human feedback collection works (rating buttons, freetext feedback)
- Stage progression tracking accumulates metrics correctly
- Kill switch (pause/resume/reset) works instantly
- Full audit trail: every heartbeat, every briefing, every proposal, every human rating is logged
- Performance: heartbeat completes in <30 seconds, briefing generation in <2 minutes

---

### Phase 2: Proposal Manager (Execution Plans + Approval)

**Goal:** The Orchestrator generates complete workflow execution plans and can trigger them upon human approval.

#### 5.2.1 Workflow Plan Generation

Extend `orchestrator-engine.ts` with plan generation capability:

```typescript
interface WorkflowPlan {
  name: string;
  steps: WorkflowStep[];               // Uses existing workflow step schema
  knowledge_sources: KnowledgeSource[]; // Uses existing knowledge source schema
  reviewer_assignments: Assignment[];   // Uses existing assignment schema
  estimated_duration: string;
  quality_threshold: number;            // Minimum acceptable quality score
}

async function generateWorkflowPlan(proposal: OrchestratorProposal): Promise<WorkflowPlan>
```

**Critical: Workflow plans use the EXISTING workflow step types and schemas.** The Orchestrator doesn't invent new step types. It configures the existing 12 step types (module execution, checkpoint, decision gate, API call, database query, file read/write, script execution, email, transform, loop, parallel) into complete plans.

**The LLM call for plan generation should use Opus** (`planning_model` config) because it requires reasoning about which modules to chain, what inputs to pass, and who should review at what stage. This is the Orchestrator's highest-value reasoning task.

#### 5.2.2 Approval Workflow

When a user clicks [Approve] on a proposal:
1. Create a `workflow_execution` record (existing table) with `initiated_by: 'orchestrator'`
2. Create an `orchestrator_execution` record linking the proposal to the workflow execution
3. Trigger the workflow via the existing workflow engine
4. Monitor progress by reading `workflow_executions` status

When a user clicks [Modify]:
1. Open WorkflowBuilder.tsx pre-populated with the plan's configuration
2. User adjusts and runs manually
3. Log the modification in `orchestrator_proposals` (status: 'modified')

When a user clicks [Reject]:
1. Prompt for optional feedback ("why?")
2. Log rejection in `orchestrator_proposals`
3. Orchestrator learns from rejection (adjusts future proposals)

#### 5.2.3 New Database Tables

```sql
-- Links proposals to workflow executions
CREATE TABLE orchestrator_executions (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES orchestrator_proposals(id),
  workflow_execution_id TEXT NOT NULL,    -- References existing workflow_executions table
  org_id TEXT,
  
  initiated_by TEXT NOT NULL CHECK(initiated_by IN ('human_approved', 'auto_executed')),
  initiated_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  -- Outcome tracking
  outcome TEXT CHECK(outcome IN ('success', 'partial', 'failed', 'escalated', 'cancelled')),
  completed_at TEXT,
  quality_assessment TEXT,               -- JSON: 6-dimensional quality scores from Quality Ratchet
  
  -- Chain tracking
  chain_triggered INTEGER NOT NULL DEFAULT 0,
  chained_from_execution_id TEXT,        -- If this was triggered by a previous execution's output
  chained_to_execution_id TEXT,          -- If this execution's output triggered a follow-up
  
  -- Human assessment
  human_satisfaction TEXT CHECK(human_satisfaction IN ('excellent', 'satisfactory', 'needs_improvement', 'unsatisfactory')),
  human_notes TEXT
);
```

#### 5.2.4 Additional API Routes

```
POST /api/orchestrator/proposals/:id/approve  — Approve and trigger execution
POST /api/orchestrator/proposals/:id/modify   — Open in WorkflowBuilder with plan config
POST /api/orchestrator/proposals/:id/reject   — Reject with optional feedback
GET  /api/orchestrator/executions             — List orchestrated executions
GET  /api/orchestrator/executions/:id         — Detailed execution with quality data
```

#### 5.2.5 UI Additions

- Proposal cards now show full workflow plan preview (step list, module names, reviewer assignments)
- [Approve] / [Modify] / [Reject] buttons replace rating-only buttons
- Execution tracking section on dashboard showing running/completed orchestrated workflows
- Link to existing WorkflowMonitor for detailed step-by-step progress

#### 5.2.6 Phase 2 Success Criteria

- Workflow plans are valid (they execute without errors through the existing workflow engine)
- Plans use appropriate modules, knowledge sources, and reviewer assignments
- Approved plans produce outputs with quality ≥ 7.5 average
- The approval workflow is smooth (one click → workflow starts)
- Modify flow correctly pre-populates WorkflowBuilder
- Execution tracking correctly links proposals → executions → quality scores
- Stage progression metrics update correctly (approval rate, quality average)

---

### Phase 3: Supervised Orchestration (Validated Patterns + Auto-Execution)

**Goal:** The Orchestrator identifies recurring approved patterns and can auto-execute them without per-execution approval.

#### 5.3.1 Pattern Recognition

After Phase 2 is running, the Orchestrator accumulates approved workflow configurations. When the same workflow configuration (same modules, same step types, same general structure) is approved ≥ 3 times with quality ≥ 7.5 and no significant modifications, it becomes a **validated pattern**.

```sql
CREATE TABLE orchestrator_patterns (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  pattern_name TEXT NOT NULL,           -- Auto-generated or human-named
  
  -- Pattern definition
  signal_type TEXT NOT NULL,            -- What signal type triggers this pattern
  signal_criteria TEXT NOT NULL,        -- JSON: conditions that match (urgency > X, source = Y)
  workflow_template TEXT NOT NULL,      -- JSON: the workflow plan template (with variable slots)
  
  -- Validation tracking
  approval_count INTEGER NOT NULL DEFAULT 0,
  modification_count INTEGER NOT NULL DEFAULT 0,
  avg_quality_score REAL,
  last_quality_score REAL,
  
  -- Auto-execution eligibility
  auto_eligible INTEGER NOT NULL DEFAULT 0,  -- Set to 1 when criteria met
  auto_enabled INTEGER NOT NULL DEFAULT 0,   -- User can disable even if eligible
  
  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'candidate' CHECK(status IN ('candidate', 'validated', 'active', 'paused', 'retired')),
  last_executed_at TEXT,
  total_executions INTEGER NOT NULL DEFAULT 0,
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### 5.3.2 Auto-Execution Logic

When the Orchestrator detects a signal that matches a validated pattern's `signal_criteria`:
1. Check pattern is `auto_enabled` and Orchestrator is at Stage 3+
2. Check the workflow does NOT include external-facing steps (API calls to external systems, email sends) — these always require approval regardless of pattern validation
3. Create proposal with `status: 'auto_executed'`
4. Create workflow execution via existing engine
5. Send notification to dashboard and (future) messaging channels
6. Monitor quality — if output quality < pattern's `avg_quality_score - 1.0`, auto-pause the pattern and escalate

#### 5.3.3 Notification System

Auto-executions produce notifications:

```
┌─────────────────────────────────────────────────────────┐
│ 🤖 Orchestrator Auto-Execution                          │
│                                                          │
│ Triggered: Weekly Regulatory Update (Pattern #7)         │
│ Reason: Regulatory Radar — 3 new items above threshold  │
│ Config: Same as last 4 executions                        │
│ Started: 2026-03-07 09:00                                │
│                                                          │
│ [View Execution]  [Pause Pattern]  [Override & Cancel]  │
└─────────────────────────────────────────────────────────┘
```

#### 5.3.4 Stage Progression Logic

Implement the progression check as a scheduled function that runs daily:

```typescript
async function checkStageProgression(orgId: string): Promise<void> {
  const stage = await getOrchestratorStage(orgId);
  const criteria = STAGE_CRITERIA[stage.current_stage + 1];
  
  if (!criteria) return; // Already at Stage 4
  
  const daysSinceEntry = daysBetween(stage.stage_entered_at, now());
  if (daysSinceEntry < criteria.minimum_days) return;
  
  // Check all criteria for next stage
  const met = await evaluateCriteria(stage, criteria);
  
  if (met.all) {
    await progressStage(orgId, stage.current_stage + 1, met.summary);
    // Notify user of progression
  }
}
```

#### 5.3.5 Phase 3 Success Criteria

- Patterns are correctly identified from recurring approved workflows
- Auto-execution triggers only for validated patterns that meet all criteria
- Notifications are timely and informative
- Pause/Override controls work instantly
- Quality monitoring correctly flags degradation and auto-pauses patterns
- Stage demotion works if quality/accuracy metrics degrade significantly

---

### Phase 4: Autonomous Orchestration (Intelligent Chaining + Proactive Management)

**Goal:** The Orchestrator can chain workflow outputs into subsequent workflows, proactively recommend actions, and produce management reports.

#### 5.4.1 Intelligent Workflow Chaining

After a workflow completes, the Orchestrator reads the output and assesses whether follow-up action is needed:

- Gap analysis completed with HIGH gaps → propose/trigger Action Plan workflow
- Action plan completed → propose/trigger assignment workflow with deadlines
- Quality audit identified outdated knowledge source → propose knowledge source refresh
- BWRA completed → propose policy update workflow for identified risk areas

**The chaining logic uses LLM reasoning** (Opus model) to read the actual output content and decide:
1. Does this output warrant follow-up action?
2. What type of follow-up? (Which module/workflow?)
3. What from this output should be passed as input to the next workflow?
4. Who should review the chained workflow's output?
5. What quality threshold applies?

**Chain execution follows the trust model:**
- Stage 3: Chains require approval unless the complete chain matches a validated pattern
- Stage 4: Validated chain patterns auto-execute; novel chains still require approval

#### 5.4.2 Proactive Recommendations

Beyond signal-driven proposals, the Orchestrator generates proactive insights:

- "You haven't reviewed your CDD policies since the new EBA guideline 3 weeks ago"
- "5 workflows completed this month all touched transaction monitoring — consider a consolidated TM review"
- "Your gap analysis quality has improved from 7.2 to 8.8 over 6 months — the AMLR Gap Analysis module is ready for Supervised stage in the Apprentice Model"
- "3 team members have overdue assignments across different workflows — may indicate capacity issue"

These are lower-urgency items included in weekly reports, not urgent proposals.

#### 5.4.3 Management Reporting

Weekly (configurable) management report:

```markdown
## ANTON Orchestrator — Weekly Report (Feb 28 – Mar 7, 2026)

### Activity Summary
- 14 workflows orchestrated (11 auto-executed, 3 approved)
- 4 workflow chains completed (gap analysis → action plan → assignment)
- 2 proposals rejected (both low-priority maintenance items)
- Average output quality: 8.3 (up from 7.9 last week)

### Value Delivered
- 3 regulatory changes processed within 48 hours of radar detection
- 1 approaching deadline caught and preparation workflow triggered 14 days ahead
- Estimated coordination time saved: ~6 hours

### Patterns & Insights
- New validated pattern: "Radar → Gap Analysis → Action Plan" (3 successful executions)
- Quality trend: Policy Writer module improving (7.2 → 7.9 → 8.1)
- Capacity observation: 3 team members with >5 overdue items

### Upcoming
- Q1 BWRA deadline: 7 days (preparation workflow scheduled)
- 2 radar items pending review (medium urgency)
- Knowledge source refresh recommended: AMLR regulatory text (last updated 92 days ago)
```

#### 5.4.4 Meta-Learning

Track the Orchestrator's own accuracy over time:

```sql
CREATE TABLE orchestrator_meta_learning (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  
  -- Proposal accuracy
  proposals_total INTEGER,
  proposals_accepted INTEGER,
  proposals_rejected INTEGER,
  acceptance_rate REAL,
  
  -- Quality accuracy
  predicted_quality_avg REAL,      -- What the Orchestrator expected
  actual_quality_avg REAL,         -- What actually happened
  quality_prediction_error REAL,   -- Absolute difference
  
  -- Pattern accuracy
  auto_executions_total INTEGER,
  auto_executions_overridden INTEGER,
  override_rate REAL,
  
  -- Self-assessment
  confidence_calibration REAL,     -- How well confidence scores predict acceptance
  blind_spots TEXT,                -- JSON: identified areas where proposals are consistently wrong
  
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### 5.4.5 Phase 4 Success Criteria

- Workflow chaining correctly reads outputs and passes relevant content to next workflows
- Chained workflows produce quality comparable to manually-sequenced work
- Proactive recommendations surface genuinely useful insights (not noise)
- Management reports are accurate and actionable
- Meta-learning correctly tracks accuracy trends
- Automatic stage demotion triggers when metrics degrade

---

## 6. Security & Governance (Applies to ALL Phases)

### 6.1 Hard Limits (Implemented in Phase 1, Never Relaxed)

These are not configurable. They are hardcoded constraints that apply at every trust stage:

```typescript
const ORCHESTRATOR_HARD_LIMITS = {
  // Never bypass compliance rules
  COMPLIANCE_OVERRIDE: false,
  
  // Never modify own configuration/prompts
  SELF_MODIFY: false,
  
  // Never exceed RBAC permissions
  RBAC_BYPASS: false,
  
  // Never suppress audit trails
  AUDIT_SUPPRESSION: false,
  
  // Never override human rejections without new information
  OVERRIDE_HUMAN: false,
  
  // Never create new external connections
  CREATE_CONNECTIONS: false,
  
  // Never modify platform configuration (module defs, compliance rules, security settings)
  MODIFY_PLATFORM: false,
  
  // Never send external communications without pre-approved connection config
  EXTERNAL_COMMS_WITHOUT_APPROVAL: false,
};
```

### 6.2 Kill Switch

```
POST /api/orchestrator/pause   — Instant. All auto-execution stops. Proposals continue generating.
POST /api/orchestrator/reset   — Drops stage to Observer. All auto-execution stops.
POST /api/orchestrator/disable — All functionality off. Heartbeat stops. No briefings.
```

All three operations:
- Require admin role
- Take effect immediately (current heartbeat cycle completes, nothing new starts)
- Are logged immutably
- Cannot be overridden by the Orchestrator

### 6.3 Audit Trail

Every Orchestrator action produces an audit record in `orchestrator_proposals` and `orchestrator_executions`. Additionally, every workflow triggered by the Orchestrator goes through the existing workflow engine, which already logs every step, every checkpoint decision, every quality score, and every human review.

The result: a complete, compliance-grade audit trail from "signal detected" → "proposal generated" → "human decision" → "workflow executed" → "quality assessed" → "output delivered."

### 6.4 Prompt Injection Defence

Unlike OpenClaw, which processes untrusted external content (emails, web pages, messages from unknown contacts), ANTON's Orchestrator reads only from internal platform databases. The signal sources are:
- Database tables populated by ANTON's own subsystems
- Quality scores generated by ANTON's own Quality Ratchet
- Radar items scored by ANTON's own AI analysis
- Pattern alerts generated by ANTON's own detection engine

**The Orchestrator never processes raw external content.** It reads structured, scored, pre-processed data from trusted internal sources. This eliminates the primary prompt injection attack vector that devastated OpenClaw.

---

## 7. LLM Cost Management

The Orchestrator makes LLM calls for signal assessment, briefing generation, plan generation, chain reasoning, and meta-analysis. To manage costs:

| Function | Default Model | Rationale |
|---|---|---|
| Heartbeat assessment | Haiku | Frequent, simple signal check — cheap |
| Briefing generation | Sonnet | Daily, moderate reasoning — balanced |
| Workflow plan generation | Opus | Complex reasoning about module chains — quality matters |
| Chain reasoning | Opus | Complex — needs to read output content and decide next steps |
| Management reporting | Sonnet | Weekly, structured — balanced |
| Meta-learning | Haiku | Monthly, statistical — cheap |

These are configurable via `orchestrator_config`. The Orchestrator's own LLM costs should be tracked as a separate budget category in the existing cost tracking system.

---

## 8. Integration Checklist

Claude Code: verify each of these integration points during the investigation phase:

- [ ] Can read from `radar_items` table (Regulatory Radar signals)
- [ ] Can read from deadline-related tables (Time Intelligence signals)
- [ ] Can read from `quality_scores` / `quality_baselines` / `quality_alerts` (Quality signals)
- [ ] Can read from `detected_patterns` / `pattern_alerts` (Pattern Detection signals)
- [ ] Can read from `workflow_executions` (Workflow status signals)
- [ ] Can read from `step_assignments` (Assignment/overdue signals)
- [ ] Can read from compliance violation tables (Compliance signals)
- [ ] Can read from `apprentice_stages` (Apprentice progression signals)
- [ ] Can read from knowledge graph tables (Entity/relationship signals)
- [ ] Can create `workflow_executions` via the existing workflow engine service
- [ ] Can use the existing prompt-builder.ts to assemble the Orchestrator's prompt
- [ ] Can use the existing unified-llm-client.ts for LLM calls
- [ ] Respects the existing RBAC permission checks
- [ ] Follows the existing API route patterns and error handling
- [ ] Follows the existing React page patterns and component library
- [ ] Can read from the existing CRON/scheduling infrastructure (or create compatible heartbeat scheduling)

---

## 9. Summary: What We're Building

**Phase 1 (Observer):** A read-only intelligence layer that generates briefings with proposals. Low risk, high signal. Validates the signal aggregation approach. 4–6 weeks.

**Phase 2 (Proposal Manager):** Adds execution plan generation and one-click approval. The Orchestrator can now trigger real workflows — with human approval for every action. 3–4 weeks.

**Phase 3 (Supervised):** Adds validated patterns and auto-execution for recurring, proven workflow configurations. Humans receive notifications and can override. 3–4 weeks.

**Phase 4 (Autonomous):** Adds intelligent workflow chaining, proactive recommendations, and management reporting. The Orchestrator manages professional operations with full governance. 4–6 weeks.

**Total estimated effort:** 14–20 weeks across all four phases.

**The Orchestrator transforms ANTON from "a very good AI tool" into "an AI operations platform." And it's built entirely on infrastructure that already exists — connecting the 29 expert areas, the workflow engine, the Quality Ratchet, the Apprentice Model, the pattern detection, the regulatory radar, and everything else into a managed, governed, trustworthy whole.**

---

## 10. Test & Acceleration Modes

### The Problem

The Orchestrator's graduated trust model (Observer → Proposal Manager → Supervised → Autonomous) is the right design for production use. But it creates a practical adoption challenge: the minimum time from first install to Stage 4 is approximately 6 months. Nobody will adopt a feature they can't evaluate until half a year in. Different audiences need different ways to see, test, and validate the Orchestrator before — or faster than — the production trust ramp allows.

This section defines four modes that address four distinct needs. All four should be implemented alongside Phase 1, because the adoption problem exists from day one.

---

### 10.1 Demo Mode

**Audience:** Anyone evaluating ANTON for the first time. Sales/partnership conversations. Conference demos. Investor presentations. New users exploring the platform.

**Purpose:** "Show me what a fully operational Stage 4 Orchestrator looks like with realistic data, without needing real platform history."

**How it works:**

Demo Mode loads a pre-built synthetic dataset that simulates 6 months of platform activity across all subsystems. The Orchestrator runs at Stage 4 against this data, producing real briefings, proposals, workflow plans, execution tracking, management reports, and pattern libraries — all visually identical to production, but clearly labelled as demonstration data.

**What gets pre-loaded:**

```
Synthetic dataset: "Meridian Bank — AMLR Implementation Programme"

Timeline: September 2025 – March 2026 (6 months of simulated activity)

Regulatory Radar:
  - 14 radar items across EBA, FATF, EUR-Lex (mix of urgency levels)
  - 3 items marked as actioned, 4 reviewed, 2 dismissed, 5 new
  
Workflow History:
  - 47 completed workflow executions across 8 module types
  - 12 gap analyses, 8 action plans, 6 policy drafts, 5 BWRAs, etc.
  - 3 failed workflows (realistic — not everything succeeds)
  - Quality scores ranging from 6.1 to 9.3 (realistic distribution)

Quality Trends:
  - AMLR Gap Analysis: 7.2 → 7.8 → 8.1 → 8.5 (improving)
  - Policy Writer: 8.5 → 8.1 → 7.6 → 7.2 (declining — triggers alert)
  - BWRA: stable at 8.0-8.3

Deadlines:
  - Q1 BWRA due in 12 days
  - AMLR remediation milestone in 28 days
  - 2 overdue items (analyst assignments)

Apprentice Model:
  - AMLR Gap Analysis at Supervised stage
  - Policy Writer at Guided stage  
  - BWRA at Proficient stage

Orchestrator History:
  - 42 briefings generated
  - 127 proposals (78% accepted, 12% rejected, 10% modified)
  - 8 validated patterns
  - 3 active auto-execution patterns
  - 5 completed workflow chains

Team:
  - 4 simulated team members with assignment histories
  - Realistic SLA tracking, some overdue, some on time

Patterns Detected:
  - "Gap analysis always followed by action plan within 48 hours"
  - "Quality drops when knowledge sources older than 60 days"
  - "BWRA output quality correlates with preparation workflow usage"
```

**UI presentation:**

```
┌─────────────────────────────────────────────────────────────────┐
│ ⚠️ DEMO MODE — Showing synthetic data for "Meridian Bank"      │
│    This demonstrates Stage 4 Orchestrator capabilities.         │
│    [Exit Demo] [Learn More] [Start with My Data →]             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  (Full Stage 4 dashboard with all features active)              │
│  - Briefings with proposals + approval buttons                  │
│  - Validated patterns library                                    │
│  - Auto-execution notifications                                 │
│  - Management report                                            │
│  - Workflow chain visualization                                  │
│  - Stage progression (showing full Stage 4 metrics)             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Key design rules:**

- The demo banner is **always visible** and cannot be dismissed. It must be impossible to confuse demo data with real data.
- All buttons are functional but operate on the synthetic dataset only. Approving a proposal triggers a simulated execution with pre-determined quality scores, not a real LLM call.
- The demo dataset should be domain-relevant to ANTON's primary audience (compliance/FCP). If the user's organisation has a different focus, the demo still demonstrates the mechanism even if the domain doesn't match perfectly.
- [Start with My Data →] exits demo and navigates to real Orchestrator setup (Stage 1 Observer).
- Demo Mode requires zero configuration, zero API keys, zero setup. It works on first install with no external dependencies.
- The synthetic dataset is a JSON seed file shipped with the platform: `server/orchestrator/demo-seed.json`

**Implementation:**

```typescript
// In orchestrator config
demo_mode: boolean  // default false

// When demo_mode is true:
// - Load synthetic data from demo-seed.json into orchestrator tables (prefixed/tagged as demo)
// - Set orchestrator stage to 4
// - All signal readers return synthetic signals instead of querying real tables
// - Approval/rejection actions update synthetic data only
// - No real LLM calls — briefings and proposals served from pre-generated content in the seed file
// - No real workflow executions triggered
```

**LLM cost: Zero.** Everything is pre-generated and served from the seed file.

---

### 10.2 Simulation Mode

**Audience:** Existing ANTON users who have platform history and want to see what the Orchestrator would have done with their actual data. Evaluators during trial periods. Teams deciding whether to activate the Orchestrator for production use.

**Purpose:** "Run the Orchestrator retroactively against my real historical data and show me what it would have proposed, triggered, and flagged — without actually executing anything."

**How it works:**

Simulation Mode takes a date range from the user's actual platform history and runs the Orchestrator's signal aggregation, briefing generation, and proposal logic against that historical data. It produces a simulation report showing: "Here's what happened in your platform during this period. Here's what the Orchestrator would have detected, proposed, and (at Stage 4) auto-executed."

This is powerful because it turns the user's own data into evidence. Instead of saying "trust us, it'll be useful in 6 months," you say "look — here are the 3 regulatory changes you spent a week responding to manually that the Orchestrator would have flagged and proposed a gap analysis for within 24 hours."

**User flow:**

```
1. User navigates to Orchestrator Settings → Simulation
2. Selects date range (e.g., "Last 3 months" / "Last 6 months" / custom)
3. Selects simulation stage (Stage 2, 3, or 4 — what level of autonomy to simulate)
4. Clicks [Run Simulation]
5. Orchestrator reads historical data from all signal source tables for that period
6. For each day/week in the period, generates what it WOULD have briefed and proposed
7. Compares proposals against what actually happened (did the user do the thing the Orchestrator would have suggested? How long after the signal appeared?)
8. Produces a Simulation Report
```

**Simulation Report structure:**

```markdown
## Orchestrator Simulation Report
**Period:** December 1, 2025 – March 1, 2026 (3 months)
**Simulated Stage:** Stage 4 (Autonomous)
**Data source:** Your actual platform history

### Signal Coverage
- 23 signals detected across the period
- 8 from Regulatory Radar, 5 from Deadlines, 4 from Quality, 3 from Patterns, 3 from Workflows

### What the Orchestrator Would Have Proposed
| # | Date | Signal | Proposal | What Actually Happened | Delta |
|---|------|--------|----------|----------------------|-------|
| 1 | Dec 3 | EBA guideline (urgency 0.87) | Gap analysis within 24h | You ran gap analysis on Dec 9 | **6 days faster** |
| 2 | Dec 15 | Quality decline in Policy Writer | Knowledge source refresh | Not addressed (still declining) | **Caught, unaddressed** |
| 3 | Jan 8 | BWRA deadline approaching (21 days) | Trigger prep workflow | You started prep on Jan 22 | **14 days faster** |
| 4 | Jan 14 | Gap analysis completed, 3 HIGH gaps | Chain to Action Plan | You created action plan Jan 18 | **4 days faster** |
| ... | ... | ... | ... | ... | ... |

### Impact Summary
- **7 of 23 proposals** would have triggered action earlier than what actually happened
- **Average time saved per actionable signal:** 6.2 days
- **3 signals** the Orchestrator caught that were never addressed
- **2 workflow chains** would have been auto-triggered, saving manual coordination
- **Estimated coordination time saved:** ~14 hours over the period

### Validated Patterns Identified
- "Radar item (urgency > 0.8) → Gap Analysis → Action Plan" — occurred 4 times
- "Quality decline (3+ sessions) → Knowledge source refresh" — occurred 2 times
- "Deadline approaching (<21 days) → Preparation workflow" — occurred 3 times

### What Would Have Been Auto-Executed (Stage 4)
- 5 pattern-matched workflows (based on patterns validated ≥3 times in the period)
- All 5 produced quality ≥ 7.5 when the user eventually ran them manually
```

**Implementation:**

```typescript
interface SimulationRequest {
  date_from: string;        // ISO date
  date_to: string;          // ISO date
  simulated_stage: 2 | 3 | 4;
  granularity: 'daily' | 'weekly';
}

interface SimulationResult {
  period: { from: string; to: string };
  signals_detected: SimulatedSignal[];
  proposals_generated: SimulatedProposal[];
  comparison: ProposalVsActual[];      // What was proposed vs what the user actually did
  patterns_identified: SimulatedPattern[];
  impact_summary: ImpactSummary;
  report_markdown: string;             // Pre-rendered report
}

async function runSimulation(request: SimulationRequest): Promise<SimulationResult> {
  // 1. Query all signal source tables for the date range
  // 2. For each time window (day or week), run signal aggregation
  // 3. Generate proposals using the Orchestrator's LLM prompt (real LLM calls here)
  // 4. Compare proposals against actual workflow_executions in the same period
  // 5. Calculate deltas (time saved, signals caught, patterns identified)
  // 6. Generate report
}
```

**API routes:**

```
POST /api/orchestrator/simulation/run      — Start a simulation (returns job ID)
GET  /api/orchestrator/simulation/:id      — Get simulation status/results
GET  /api/orchestrator/simulations         — List past simulations
```

**LLM cost:** Moderate. The simulation makes real LLM calls to generate proposals (using Sonnet by default). A 3-month simulation with weekly granularity = ~13 briefing generation calls. A 6-month daily simulation = ~180 calls. The UI should show an estimated cost before the user confirms.

**Key design rules:**

- Simulation NEVER modifies any existing data. It reads historical tables and writes only to simulation-specific result tables.
- Simulation results are clearly labelled: "This is what WOULD have happened. No workflows were executed."
- The comparison against actual user actions is the killer feature — it turns abstract capability into concrete, personalised evidence.
- The simulation report is exportable (MD, PDF, DOCX) for sharing with team/management to justify Orchestrator activation.

---

### 10.3 Accelerated Mode

**Audience:** Organisations in an evaluation/trial period who want to test the Orchestrator with real data and real execution but don't want to wait months for stage progression. Also useful for early adopters providing feedback during beta.

**Purpose:** "Let me go through all four stages with real data and real workflows, but compress the timelines so I can reach Stage 4 in weeks instead of months."

**How it works:**

Accelerated Mode reduces the time gates and lowers the threshold criteria for stage progression, while keeping the fundamental trust architecture intact. The Orchestrator still earns trust through demonstrated competence — it just earns it faster because the evaluation criteria are relaxed.

**Accelerated vs. Production criteria:**

| Criterion | Production | Accelerated |
|---|---|---|
| **Stage 1 → 2** | | |
| Minimum days | 14 | 3 |
| Briefings required | 20 | 5 |
| Proposals required | 50 | 10 |
| Proposals rated | 10 | 5 |
| Good/Relevant rate | >60% | >50% |
| **Stage 2 → 3** | | |
| Minimum days | 30 | 7 |
| Approved plans | 30 | 8 |
| Approval rate | >75% | >60% |
| Avg quality | ≥7.5 | ≥7.0 |
| **Stage 3 → 4** | | |
| Minimum days | 60 | 14 |
| Total workflows | 60 | 15 |
| Auto-execution satisfaction | >85% | >75% |
| Override rate | <5% | <15% |
| Validated patterns in use | 5 | 2 |

**This means:** With active daily use and rating/approving proposals, an organisation could realistically reach Stage 4 in **3–5 weeks** instead of 6 months.

**Safeguards in Accelerated Mode:**

- All hard limits still apply (Compliance-as-Code, RBAC, kill switch, audit trail, no self-modification).
- Auto-execution of workflows that touch external systems (API calls, emails) still requires explicit approval regardless of stage.
- A persistent banner indicates Accelerated Mode is active:

```
┌─────────────────────────────────────────────────────────────────┐
│ ⚡ ACCELERATED MODE — Reduced progression thresholds active.    │
│    Stage progression is faster but production thresholds are    │
│    recommended for regulated environments.                      │
│    [Switch to Production Thresholds] [Learn More]              │
└─────────────────────────────────────────────────────────────────┘
```

- At any time, the user can switch to production thresholds. If they're currently at Stage 3 under accelerated criteria but haven't met production Stage 3 criteria, the stage remains but auto-execution is paused until production criteria are met (or the user stays in accelerated mode).
- When Accelerated Mode is active, the management report and audit trail note it explicitly: "Stage 4 reached under accelerated evaluation criteria."

**Implementation:**

```sql
-- Add to orchestrator_config
ALTER TABLE orchestrator_config ADD COLUMN progression_mode TEXT 
  NOT NULL DEFAULT 'production' 
  CHECK(progression_mode IN ('production', 'accelerated'));
```

```typescript
const STAGE_CRITERIA = {
  production: {
    stage_2: { min_days: 14, briefings: 20, proposals: 50, rated: 10, good_rate: 0.6 },
    stage_3: { min_days: 30, approved: 30, approval_rate: 0.75, avg_quality: 7.5 },
    stage_4: { min_days: 60, total_workflows: 60, satisfaction_rate: 0.85, override_rate: 0.05, patterns: 5 },
  },
  accelerated: {
    stage_2: { min_days: 3, briefings: 5, proposals: 10, rated: 5, good_rate: 0.5 },
    stage_3: { min_days: 7, approved: 8, approval_rate: 0.6, avg_quality: 7.0 },
    stage_4: { min_days: 14, total_workflows: 15, satisfaction_rate: 0.75, override_rate: 0.15, patterns: 2 },
  }
};

// Progression check reads the active mode from config
async function checkStageProgression(orgId: string): Promise<void> {
  const config = await getOrchestratorConfig(orgId);
  const criteria = STAGE_CRITERIA[config.progression_mode];
  // ... existing progression logic using selected criteria
}
```

**API routes:**

```
PATCH /api/orchestrator/config  — Set progression_mode: 'accelerated' | 'production' (admin only)
```

**LLM cost:** Same as production — real proposals, real workflows, real quality scoring. No savings here because the point is real evaluation.

---

### 10.4 Developer Mode

**Audience:** Claude Code during development. Contributors testing Phase 3–4 code while Phase 1–2 is being implemented. QA testing edge cases. Anyone who needs to exercise specific Orchestrator features without building up organic history.

**Purpose:** "Bypass all trust gates so I can test any Orchestrator function at any stage, immediately, without needing historical data or earned progression."

**How it works:**

Developer Mode disables all stage-gating checks. Every Orchestrator function is available regardless of current stage metrics. The Orchestrator can generate briefings, create execution plans, approve its own proposals (for testing the approval pipeline), auto-execute patterns, chain workflows, and produce management reports — all from a standing start.

**This mode is dangerous and labelled accordingly.**

```
┌─────────────────────────────────────────────────────────────────┐
│ 🔧 DEVELOPER MODE — ALL TRUST GATES BYPASSED                   │
│    ⚠️ Not for production use. No progression tracking.          │
│    All Orchestrator functions available at any stage.            │
│    Compliance-as-Code rules still enforced.                     │
│    [Exit Developer Mode]                                        │
└─────────────────────────────────────────────────────────────────┘
```

**What Developer Mode changes:**

- Stage checks always return `true` — every function is available
- Stage progression tracking is paused (metrics accumulate but progression doesn't trigger)
- Auto-execution is available immediately (no validated pattern requirement, but can be tested)
- The Orchestrator can be manually set to any stage via API for UI testing: `POST /api/orchestrator/dev/set-stage { stage: 3 }`
- A test signal injection endpoint is available: `POST /api/orchestrator/dev/inject-signal` — creates synthetic signals in the real signal tables (tagged as test data) to trigger proposals without waiting for organic signals

**What Developer Mode does NOT change:**

- Compliance-as-Code rules still execute (you need to test that they work)
- RBAC still applies (you need to test permission boundaries)
- Audit trails still log everything (you need to test audit completeness)
- Kill switch still works (you need to test emergency controls)
- All hard limits still apply (you need to test they can't be bypassed)

**Test data utilities:**

```typescript
// Inject a synthetic radar signal
POST /api/orchestrator/dev/inject-signal
{
  source: "radar",
  summary: "Test: EBA guideline on crypto CDD",
  urgency: 0.9,
  relevance: 0.85
}

// Inject a synthetic quality decline
POST /api/orchestrator/dev/inject-signal
{
  source: "quality",
  summary: "Test: Policy Writer quality declining",
  urgency: 0.6,
  data: { module: "policy-writer", scores: [8.5, 7.9, 7.2] }
}

// Inject a synthetic overdue deadline
POST /api/orchestrator/dev/inject-signal
{
  source: "deadline",
  summary: "Test: Q1 BWRA overdue by 3 days",
  urgency: 1.0
}

// Set stage for UI testing
POST /api/orchestrator/dev/set-stage
{ stage: 4 }

// Trigger a heartbeat immediately (bypass interval)
POST /api/orchestrator/dev/trigger-heartbeat

// Trigger a briefing immediately
POST /api/orchestrator/dev/trigger-briefing

// Clean up all test/injected data
POST /api/orchestrator/dev/cleanup
```

**Implementation:**

```sql
-- Add to orchestrator_config
ALTER TABLE orchestrator_config ADD COLUMN developer_mode INTEGER NOT NULL DEFAULT 0;
```

```typescript
// Guard function used throughout the Orchestrator
function isFeatureAvailable(feature: OrchestratorFeature, stage: number, config: OrchestratorConfig): boolean {
  if (config.developer_mode) return true;  // Bypass all stage checks
  return FEATURE_STAGE_REQUIREMENTS[feature] <= stage;
}

// Dev routes — only available when developer_mode is true
// These routes should 403 if developer_mode is false
router.post('/api/orchestrator/dev/*', requireDeveloperMode, ...handlers);
```

**Key design rules:**

- Developer Mode is only activatable by admin role via direct API call or settings page. It's not discoverable in the normal UI flow.
- All data created during Developer Mode is tagged (`source: 'dev_injected'`) so it can be bulk-cleaned without affecting real data.
- Developer Mode is automatically disabled if the deployment environment is detected as "production" (if such an env flag exists). This is a safety net, not a hard block — admins can override.
- Entering Developer Mode logs a prominent audit entry. Exiting cleans up test data (with confirmation).

**LLM cost:** Variable. Real LLM calls are made for briefing and proposal generation (unless using injected test data with pre-generated content). Developers should be aware that triggering many heartbeats/briefings in rapid succession during testing will consume API credits.

---

### 10.5 Mode Interaction Rules

The four modes are mostly independent, but some interactions need explicit handling:

| Scenario | Behaviour |
|---|---|
| Demo Mode + any other mode | Demo Mode takes precedence. All data is synthetic. No real LLM calls. |
| Accelerated + Developer | Developer Mode takes precedence (no point in accelerated thresholds if gates are bypassed). |
| Simulation while Orchestrator is running | Simulation reads historical data independently. Does not affect the running Orchestrator's state. |
| Switching from Accelerated to Production | Current stage is preserved. If accelerated criteria were lower than production, a note is logged but the stage is NOT demoted. Production criteria apply to future progression. |
| Exiting Developer Mode | Stage resets to whatever the accumulated metrics support under the active progression mode (production or accelerated). Test data is cleaned up. |
| Exiting Demo Mode | Returns to real Orchestrator state (whatever stage was active before demo). Demo data is purged. |

### 10.6 API Route Summary (All Modes)

```
-- Demo Mode
POST /api/orchestrator/demo/activate      — Load synthetic dataset, enter Demo Mode
POST /api/orchestrator/demo/deactivate    — Exit Demo Mode, purge synthetic data

-- Simulation Mode  
POST /api/orchestrator/simulation/run     — Start a simulation (async, returns job ID)
GET  /api/orchestrator/simulation/:id     — Get simulation status/results
GET  /api/orchestrator/simulations        — List past simulations
DELETE /api/orchestrator/simulation/:id   — Delete a simulation result

-- Accelerated Mode (via config)
PATCH /api/orchestrator/config            — Set progression_mode: 'accelerated' | 'production'

-- Developer Mode
PATCH /api/orchestrator/config            — Set developer_mode: true | false (admin only)
POST /api/orchestrator/dev/inject-signal  — Inject test signal (requires developer_mode)
POST /api/orchestrator/dev/set-stage      — Override stage for testing (requires developer_mode)
POST /api/orchestrator/dev/trigger-heartbeat — Force immediate heartbeat (requires developer_mode)
POST /api/orchestrator/dev/trigger-briefing  — Force immediate briefing (requires developer_mode)
POST /api/orchestrator/dev/cleanup        — Remove all test-injected data (requires developer_mode)
```

### 10.7 Implementation Priority

These modes should be built in this order, because each subsequent mode builds on the previous one's infrastructure:

1. **Developer Mode** (build during Phase 1) — Needed immediately for Claude Code to test Phase 1 features and prepare Phase 2–4 code. The signal injection and manual triggering utilities are essential development tools.

2. **Demo Mode** (build after Phase 1 is stable) — Requires a working dashboard and proposal UI to be meaningful. The synthetic dataset should be authored once Phase 1's data structures are finalised.

3. **Accelerated Mode** (build during Phase 2) — Simple to implement (it's just a different set of threshold constants). Most valuable once the approval workflow exists, so users can rapidly approve proposals and see progression.

4. **Simulation Mode** (build during or after Phase 2) — The most complex mode. Requires the proposal generation logic to be solid before retroactive simulation is meaningful. The comparison engine (proposals vs. actual history) is unique to this mode.

### 10.8 Success Criteria (All Modes)

- **Demo Mode:** A new user can activate Demo Mode in one click and immediately see a fully operational Stage 4 dashboard with realistic data. No configuration, no API keys, no waiting.
- **Simulation Mode:** An existing user with 3+ months of platform history can run a simulation and receive a report showing concrete, data-backed evidence of the Orchestrator's value (time saved, signals caught, patterns identified).
- **Accelerated Mode:** An evaluating team can reach Stage 4 within 3–5 weeks of active daily use, with all governance safeguards still in place.
- **Developer Mode:** Claude Code can test any Orchestrator function at any stage immediately, inject test signals, trigger heartbeats/briefings on demand, and clean up test data without affecting real platform state.

---

## 11. The ANTON Workspace (Persistent Working Directory)

### The Problem

ANTON can generate reports, run scripts, chain workflows, export files, and produce multi-step deliverables. But right now these capabilities don't have a unified home. Generated exports go... somewhere. Script outputs go to sandboxed temp directories that get cleaned up. Workflow chain intermediates live in database blobs. Knowledge source files are scattered. There's no single place where ANTON "works" — no equivalent of Claude Code's project folder, no equivalent of a developer's working directory, no desk for the AI coworker to sit at.

This becomes critical with the Orchestrator. When the Orchestrator chains a gap analysis → action plan → presentation, each step produces artifacts that the next step needs to consume. When a workflow runs overnight, the outputs need to be somewhere the user can find them in the morning. When a Script Lite output needs to become input for a workflow step, there has to be a filesystem path that both systems understand.

### The Vision

Every ANTON installation has a **workspace** — a persistent directory on the local filesystem where ANTON reads, writes, and organises all its work. This is ANTON's home. It's where outputs land, where scripts run, where the Orchestrator stages its work, where knowledge source files live, and where projects keep their artifacts.

Think of it as giving the AI coworker a desk, a filing cabinet, and a project room.

### 11.1 Workspace Structure

```
~/.anton/                                    # ANTON's home (configurable)
├── workspace/                               # The active working area
│   ├── outputs/                             # Generated deliverables
│   │   ├── 2026-03-07/                      # Date-organised
│   │   │   ├── amlr-gap-analysis-v2.docx
│   │   │   ├── amlr-gap-analysis-v2.xlsx
│   │   │   ├── action-plan-meridian.pdf
│   │   │   └── board-presentation-q1.pptx
│   │   └── 2026-03-06/
│   │       └── ...
│   │
│   ├── projects/                            # Project-specific workspaces
│   │   ├── meridian-amlr-implementation/    # One folder per project
│   │   │   ├── gap-analysis/
│   │   │   ├── action-plans/
│   │   │   ├── policies/
│   │   │   ├── presentations/
│   │   │   └── project.json                 # Project metadata
│   │   └── nordic-fintech-onboarding/
│   │       └── ...
│   │
│   ├── scripts/                             # Script Lite / Medium outputs
│   │   ├── data-analysis/
│   │   ├── transformations/
│   │   └── utilities/
│   │
│   ├── knowledge/                           # Local knowledge source files
│   │   ├── regulations/                     # Downloaded/indexed regulation texts
│   │   ├── company-policies/                # Uploaded company documents
│   │   ├── templates/                       # Reusable templates
│   │   └── references/                      # Reference documents
│   │
│   └── temp/                                # Scratch space (auto-cleaned)
│       ├── workflow-intermediates/           # Between-step artifacts (cleaned after workflow completes)
│       ├── script-sandbox/                   # Script execution sandbox
│       └── export-staging/                   # Files being assembled for export
│
├── orchestrator/                            # Orchestrator-specific workspace
│   ├── briefings/                           # Generated briefing files (MD)
│   ├── reports/                             # Management reports
│   ├── simulation-results/                  # Simulation output files
│   └── chain-artifacts/                     # Intermediate outputs from workflow chains
│
├── packages/                                # .anton package staging
│   ├── export/                              # Packages being assembled for export
│   └── import/                              # Imported packages awaiting installation
│
├── config/                                  # Platform configuration
│   ├── workspace.json                       # Workspace configuration
│   ├── orchestrator.json                    # Orchestrator settings (mirrors DB config)
│   └── connections.json                     # Connection configs (non-sensitive)
│
└── logs/                                    # Operational logs
    ├── orchestrator-heartbeats.log
    ├── script-execution.log
    └── workspace-activity.log
```

### 11.2 Why This Structure

**`outputs/`** — Date-organised by default because that's how professional work flows. You ran a gap analysis today, you want to find it by date. For users who prefer module-organised outputs, the workspace config allows switching the organisation scheme. All exports from any module or workflow land here unless a project workspace is active.

**`projects/`** — When working on a named project (like "Meridian AMLR Implementation"), everything related to that project goes into its own subfolder. This gives the Orchestrator context — it can see all the artifacts for a project in one place and reason about what's done, what's missing, and what needs updating. Projects map 1:1 to the existing `projects` table in the database.

**`scripts/`** — The Coding Area's Script Lite and Script Medium outputs live here. Already hinted at in the Coding Area spec (`~/coding/lite/`), this formalises and integrates it into the unified workspace.

**`knowledge/`** — Local knowledge source files. The existing knowledge source system (Mode 3: Local Folder Integration) already indexes local folders. The workspace gives this a default, well-organised location instead of requiring users to point ANTON at arbitrary filesystem paths.

**`temp/`** — Scratch space for workflow intermediates, script sandboxing, and export assembly. Auto-cleaned on a configurable schedule (default: delete files >7 days old). The Orchestrator uses this for chain intermediates that don't need to persist after the chain completes.

**`orchestrator/`** — The Orchestrator's own workspace. Briefings saved as Markdown files (inspectable, version-controllable). Management reports as MD/PDF. Simulation results. Chain artifacts that need to persist between chained workflow steps.

**`packages/`** — Staging area for `.anton` package import/export. When building a package for export, the components are assembled here. When importing a package, it's unpacked here for inspection before installation.

### 11.3 Core Capabilities

**Workspace-Aware Module Execution**

When a module produces output and the user exports it, the file goes to the workspace — either `outputs/{date}/` or `projects/{project}/` depending on whether a project is active. The export service needs a workspace path resolver:

```typescript
interface WorkspaceConfig {
  root: string;                          // Default: ~/.anton
  output_organisation: 'date' | 'module' | 'project';
  active_project?: string;               // If set, outputs go to projects/{project}/
  temp_retention_days: number;           // Default: 7
  auto_organise: boolean;                // Auto-create subfolders by type (docx, xlsx, pdf, etc.)
}

function resolveOutputPath(config: WorkspaceConfig, filename: string, context?: { project?: string; module?: string }): string {
  if (context?.project || config.active_project) {
    const project = context?.project || config.active_project;
    return path.join(config.root, 'workspace', 'projects', project, filename);
  }
  if (config.output_organisation === 'date') {
    const today = format(new Date(), 'yyyy-MM-dd');
    return path.join(config.root, 'workspace', 'outputs', today, filename);
  }
  // ... other organisation schemes
}
```

**Workflow Intermediate Passing**

When the Orchestrator chains workflows, intermediate outputs are saved to `temp/workflow-intermediates/{execution_id}/` and the path is passed to the next workflow step as an input variable. After the chain completes successfully, intermediates are either promoted to `outputs/` or `projects/` (if the output is a final deliverable) or left in temp for auto-cleanup.

```typescript
// In the workflow engine, when a step completes:
async function handleStepOutput(executionId: string, stepId: string, output: StepOutput): Promise<string> {
  const tempPath = path.join(WORKSPACE_ROOT, 'workspace', 'temp', 'workflow-intermediates', executionId);
  await fs.ensureDir(tempPath);
  const filePath = path.join(tempPath, `step-${stepId}-output.json`);
  await fs.writeJson(filePath, output);
  return filePath;  // This path becomes available as ${step.output_path} for the next step
}
```

**Script Execution Sandbox**

The existing script sandboxing (memory limits, runtime limits, network control) runs scripts in `temp/script-sandbox/`. The sandbox is created per execution and cleaned up after. The script output (files, stdout, images) is captured and either presented to the user or passed to the next workflow step.

**Knowledge Source Indexing**

The existing local folder knowledge source system (folder-indexer.ts, file-processor.ts) indexes the `knowledge/` directory by default. Users can add additional folders, but having a default well-structured location means new users get organised knowledge management from the start.

**Workspace Browser UI**

A new page — `WorkspacePage.tsx` — provides a file-browser view of the workspace:

```
┌────────────────────────────────────────────────────────────────┐
│ ANTON Workspace                              ~/.anton/workspace │
├─────────────────────┬──────────────────────────────────────────┤
│ 📁 outputs          │  outputs / 2026-03-07                    │
│   📁 2026-03-07  ◀  │                                          │
│   📁 2026-03-06     │  📄 amlr-gap-analysis-v2.docx    2.4 MB │
│ 📁 projects         │     Module: AMLR Gap Analysis            │
│   📁 meridian-amlr  │     Quality: 8.7  |  [Open] [Export]     │
│   📁 nordic-fintech │                                          │
│ 📁 scripts          │  📄 amlr-gap-analysis-v2.xlsx    890 KB  │
│ 📁 knowledge        │     Module: AMLR Gap Analysis            │
│ 📁 orchestrator     │     Quality: 8.7  |  [Open] [Export]     │
│                      │                                          │
│                      │  📄 action-plan-meridian.pdf     1.1 MB  │
│                      │     Module: Action Plan Creator          │
│                      │     Quality: 8.2  |  [Open] [Export]     │
│                      │                                          │
│ Storage: 847 MB      │  📄 board-presentation-q1.pptx   3.2 MB │
│ Files: 234           │     Module: Presentation Generator       │
│ [Settings]           │     Quality: 7.9  |  [Open] [Export]     │
└─────────────────────┴──────────────────────────────────────────┘
```

**Key UI features:**
- Tree navigation on the left, file detail on the right
- Files show originating module, quality score, creation date
- [Open] renders preview in-platform (for MD, PDF) or triggers download (for DOCX, XLSX, PPTX)
- [Export] allows re-export in different formats
- Drag-and-drop files between project folders
- Search across all workspace files
- Bulk actions (move to project, delete, export as .anton package)

### 11.4 Workspace for the Orchestrator

The Orchestrator uses the workspace as its operational base:

**Briefings** are saved as Markdown files in `orchestrator/briefings/` — inspectable, version-controllable, diffable. The user can see every briefing the Orchestrator has ever generated as a file, not just as database records.

**Management reports** are generated as MD and optionally exported to PDF/DOCX in `orchestrator/reports/`.

**Chain artifacts** — when the Orchestrator chains workflow A → workflow B, the output of A is saved to `orchestrator/chain-artifacts/{chain_id}/` and the path is passed as input to B. After the chain completes, final outputs are promoted to the appropriate `outputs/` or `projects/` folder.

**Simulation results** are saved to `orchestrator/simulation-results/` as structured reports (MD + JSON data).

This means the Orchestrator's entire working history is visible in the filesystem — not locked in a database. An admin can browse `~/.anton/orchestrator/` and see exactly what the Orchestrator has been doing. This transparency is consistent with ANTON's core philosophy.

### 11.5 Workspace Initialisation

On first run (or when `~/.anton` doesn't exist):

```typescript
async function initWorkspace(config: WorkspaceConfig): Promise<void> {
  const dirs = [
    'workspace/outputs',
    'workspace/projects',
    'workspace/scripts',
    'workspace/knowledge/regulations',
    'workspace/knowledge/company-policies',
    'workspace/knowledge/templates',
    'workspace/knowledge/references',
    'workspace/temp/workflow-intermediates',
    'workspace/temp/script-sandbox',
    'workspace/temp/export-staging',
    'orchestrator/briefings',
    'orchestrator/reports',
    'orchestrator/simulation-results',
    'orchestrator/chain-artifacts',
    'packages/export',
    'packages/import',
    'config',
    'logs',
  ];
  
  for (const dir of dirs) {
    await fs.ensureDir(path.join(config.root, dir));
  }
  
  // Write default workspace config
  await fs.writeJson(path.join(config.root, 'config', 'workspace.json'), {
    version: '1.0.0',
    output_organisation: 'date',
    temp_retention_days: 7,
    auto_organise: true,
    created_at: new Date().toISOString(),
  });
}
```

### 11.6 Security Constraints

The workspace inherits the same security model as the rest of the platform:

**RBAC applies.** Users can only see workspace content they have permission for. In multi-user deployments, each user has their own workspace subtree (or projects are shared with RBAC controls).

**The Orchestrator cannot write outside the workspace.** All file operations are restricted to `~/.anton/` via path validation. Path traversal protection (blocking `../` sequences) applies to all workspace file operations.

**Scripts run in the sandbox.** The `temp/script-sandbox/` directory is the only writable location during script execution. Scripts cannot write to `outputs/`, `projects/`, or anywhere else directly — their outputs are captured and moved by the platform after execution completes and passes validation.

**Sensitive files never enter the workspace.** API keys, passwords, connection credentials, and JWT tokens are stored in the database (encrypted), never in workspace files. The `config/connections.json` contains connection metadata (names, types, endpoints) but never credentials.

**The temp directory auto-cleans.** A background job (configurable, default daily) removes files in `temp/` older than `temp_retention_days`. This prevents unbounded disk growth from workflow intermediates and script outputs.

### 11.7 Database Integration

The workspace is the filesystem layer; the database remains the source of truth for metadata:

```sql
-- Track workspace files with metadata
CREATE TABLE workspace_files (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,                        -- Relative to workspace root
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL,                   -- docx, xlsx, pdf, pptx, md, json, py, etc.
  size_bytes INTEGER,
  
  -- Origin tracking
  source_type TEXT NOT NULL CHECK(source_type IN (
    'module_export', 'workflow_step', 'orchestrator_briefing', 'orchestrator_report',
    'orchestrator_chain', 'script_output', 'user_upload', 'knowledge_source',
    'package_import', 'simulation'
  )),
  source_id TEXT,                            -- Module session ID, workflow execution ID, etc.
  module_id TEXT,                            -- Which module produced this (if applicable)
  project_id TEXT,                           -- Which project this belongs to (if applicable)
  
  -- Quality linkage
  quality_score REAL,                        -- From Quality Ratchet (if applicable)
  
  -- Lifecycle
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,                           -- User ID
  is_temp INTEGER NOT NULL DEFAULT 0,        -- In temp directory, subject to auto-cleanup
  promoted_from TEXT,                        -- If promoted from temp to outputs/projects
  
  -- Search
  description TEXT,                          -- Human-readable description
  tags TEXT                                  -- JSON array of tags for search
);

-- Index for common queries
CREATE INDEX idx_workspace_files_project ON workspace_files(project_id);
CREATE INDEX idx_workspace_files_source ON workspace_files(source_type, source_id);
CREATE INDEX idx_workspace_files_created ON workspace_files(created_at);
```

This table acts as an index over the filesystem. The files are the real artifacts; the table provides searchability, quality linkage, and provenance tracking.

### 11.8 Integration with Existing Features

**Claude Code:** The workspace root must be clearly documented so Claude Code knows where to find and place files. When implementing the Orchestrator or any file-producing feature, Claude Code should use the workspace path resolver, not hardcoded paths.

**Export System** (`export-docx.ts`, `export-xlsx.ts`, etc.): Modify to write exports to workspace `outputs/` or `projects/` instead of ephemeral download-only locations. The file should persist in the workspace AND be available for immediate download.

**Knowledge Source System** (`folder-indexer.ts`): Default indexing target becomes `~/.anton/workspace/knowledge/`. Additional folders can still be registered.

**Workflow File Read/Write Steps**: File Read resolves paths relative to workspace root. File Write writes to workspace (either `outputs/`, `projects/`, or `temp/` depending on context).

**Script Execution**: Scripts run in `temp/script-sandbox/`. Outputs are captured and tracked in `workspace_files`.

**Coding Area**: Script Lite outputs go to `workspace/scripts/`. Script Medium/Large project artifacts go to `workspace/projects/{project}/`.

**.anton Packages**: Export assembles in `packages/export/`. Import unpacks to `packages/import/` for inspection.

### 11.9 API Routes

```
GET  /api/workspace                          — Workspace overview (root path, storage usage, file count)
GET  /api/workspace/files                    — List files (paginated, filterable by type/project/date/source)
GET  /api/workspace/files/:id                — File metadata + download URL
GET  /api/workspace/tree                     — Directory tree for browser UI
POST /api/workspace/files/:id/move           — Move file to different location (e.g., temp → project)
POST /api/workspace/files/:id/promote        — Promote temp file to outputs/projects
DELETE /api/workspace/files/:id              — Delete file (with audit log)
GET  /api/workspace/search                   — Search across workspace files (filename, description, tags)
POST /api/workspace/cleanup                  — Manual trigger of temp cleanup
GET  /api/workspace/config                   — Workspace configuration
PATCH /api/workspace/config                  — Update workspace configuration
```

### 11.10 Implementation Priority

The workspace should be implemented in two waves:

**Wave 1 (with Orchestrator Phase 1):**
- Workspace initialisation (`initWorkspace`)
- Basic directory structure creation
- Orchestrator briefings written to `orchestrator/briefings/`
- `workspace_files` table for tracking
- Configuration in `orchestrator_config` (workspace root path)
- Basic `WorkspacePage.tsx` with tree view and file listing

**Wave 2 (with Orchestrator Phase 2):**
- Export system integration (outputs land in workspace)
- Workflow intermediate passing via workspace paths
- Knowledge source default directory integration
- Script execution sandbox integration
- Full workspace browser UI with search, move, promote, bulk actions
- Project folder management
- Auto-cleanup service for temp directory

---

## 12. Performance Development Plan (PDP) — Steering ANTON as a Coworker

### The Insight

The Apprentice Model tracks **competence** — can ANTON do this task well? The Quality Ratchet tracks **output quality** — is the work getting better? The institutional memory tracks **decisions** — what has been approved, rejected, preferred? But none of these answer the question a real manager asks in a one-to-one with a team member:

*"Where are we heading together? What's going well? What's hard? Where do you want to grow? What should you focus on next quarter?"*

Real coworkers have Performance Development Plans. They sit down periodically with their manager, reflect on what's working, identify growth areas, set goals, and agree on priorities. The PDP is how you *steer* a professional relationship — not just measure it, but shape it.

ANTON should have the same thing. Not as a gimmick, but as a genuine steering mechanism that influences the Orchestrator's proposals, the platform's learning priorities, and the way ANTON allocates its attention across the 29+ expert areas and 238+ modules.

### 12.1 What This Is (And What It Isn't)

**What it is:** A structured, periodic conversation between the human and ANTON that produces a development plan. The plan captures strategic priorities, growth areas, strengths, challenges, and goals. The Orchestrator reads the active PDP and factors it into every proposal, briefing, and workflow chain decision.

**What it isn't:** An anthropomorphisation gimmick. ANTON doesn't have feelings or genuine preferences. But it does have measurable performance patterns — modules where quality is high, areas where quality is struggling, domains that get heavy use, domains that are untouched, patterns it detects well, patterns it misses. These are real data points that can be discussed, reflected on, and steered. The PDP uses the language of professional development because it's natural and intuitive for the humans who will use it — not because the AI has inner experiences.

### 12.2 The PDP Conversation

The PDP is conducted as a structured conversational session — ANTON's own module, essentially — where ANTON and the human review performance data together and co-create a development plan.

**Trigger:** Configurable. Default: quarterly (every 90 days). Can also be triggered manually ("Let's do a development review"). The Orchestrator can propose a PDP conversation when it detects it's overdue.

**The conversation follows a structured flow:**

**Part 1: Reflection — "What went well?"**

ANTON presents its own performance data for the review period:

```
Performance Review: January – March 2026

Modules used: 14 of 29 areas active
Total sessions: 187
Average quality: 8.1 (up from 7.6 last quarter)

Top performers (highest avg quality):
  • AMLR Gap Analysis — 8.7 avg (32 sessions, Supervised stage)
  • BWRA Generator — 8.4 avg (12 sessions, Guided stage)
  • Action Plan Creator — 8.3 avg (18 sessions, Supervised stage)

Most used:
  • AMLR Gap Analysis (32 sessions)
  • Policy Writer (28 sessions)
  • Regulatory Interpretation (22 sessions)

Workflows orchestrated: 23 (if Orchestrator active)
Proposals accepted: 78%
Time saved (estimated): ~42 hours
```

The human and ANTON discuss: What's driving the high quality in gap analysis? Is the heavy policy writing usage meeting expectations? Are there wins worth celebrating?

**Part 2: Challenges — "What's been hard?"**

ANTON surfaces its struggles honestly:

```
Areas where I'm struggling:

  • Policy Writer quality declining: 8.5 → 7.2 over 6 months
    My assessment: Knowledge sources may be outdated. I'm also noticing
    that quality drops when policies require cross-jurisdictional analysis
    — I don't have enough context on how your organisation handles
    jurisdictional conflicts.

  • Data Readiness Assessment: only 2 sessions, both quality < 7.0
    My assessment: I lack sufficient context about your data architecture
    and system landscape to produce useful assessments. I need more
    knowledge sources or a discovery conversation about your data environment.

  • Presentation Generator: quality inconsistent (6.8 – 8.9 range)
    My assessment: I perform well when the input analysis is thorough,
    but poorly when I'm asked to generate presentations without a
    completed upstream analysis. This might be a workflow issue rather
    than a module issue.

  • I proposed 5 quality interventions this quarter — 4 were rejected.
    I may be over-sensitive to small quality fluctuations.
```

The human and ANTON discuss: What additional context would help with policy writing? Should we do a data environment discovery session? Should presentations always be chained from a completed analysis?

**Part 3: Goals — "Where should you grow?"**

Together, they set goals for the next period:

```
Development Goals: Q2 2026

Goal 1: Improve Policy Writer to 8.0+ average quality
  Actions:
  - Refresh regulatory knowledge sources (AMLR text, EBA guidelines)
  - Conduct a discovery conversation about jurisdictional conflict handling
  - Attach "Regulatory Cross-Reference" skill to all policy sessions
  Measurement: Average quality score over next quarter

Goal 2: Develop Data Readiness capability
  Actions:
  - User provides data architecture documentation as knowledge source
  - Run 5 guided sessions with expert review to build context
  - Move from Novice to Guided stage in Apprentice Model
  Measurement: Reach Guided stage, quality ≥ 7.5

Goal 3: Reduce false positive quality alerts
  Actions:
  - Raise quality alert threshold from 5-point to 8-point decline
  - Only flag quality trends over 3+ sessions, not single-session drops
  Measurement: <10% of quality proposals rejected (currently 80%)

Goal 4: Expand into Cyber Risk Assessment area
  Actions:
  - User activates Cybersecurity area modules
  - Run 3 introductory sessions with Think Hard mode
  - Attach relevant personas (CISO, Security Analyst)
  Measurement: 5+ sessions completed, quality ≥ 7.0
```

**Part 4: Priorities — "What should you focus on?"**

The human sets strategic direction:

```
Strategic Priorities (ranked):

1. AMLR implementation support (primary — this is our Q2 programme)
2. Policy remediation (secondary — tied to gap analysis findings)
3. Board reporting preparation (quarterly cycle)
4. Cyber risk assessment exploration (stretch goal — we may need this H2)

Working style preferences:
  - Prefer thorough over fast (keep thinking level at think_hard minimum)
  - Always include regulatory citations in any compliance output
  - When unsure between two approaches, ask rather than guess
  - Weekly orchestrator briefings, not daily (too much noise)

Areas to deprioritise:
  - Personal development modules (not relevant for our team right now)
  - Financial modelling (handled by a separate team)
```

**Part 5: The PDP Document**

The conversation produces a structured PDP document saved to the workspace (`orchestrator/pdp/pdp-q2-2026.md`) and stored in the database. This document becomes **Layer 6.5** in the Orchestrator's prompt — injected into every briefing, proposal, and planning decision.

### 12.3 How the PDP Influences the Orchestrator

The PDP isn't just a document — it actively shapes behaviour:

**Proposal prioritisation:** When the Orchestrator generates proposals, it weights them against the PDP's strategic priorities. A radar item relevant to AMLR (Priority 1) gets scored higher than one relevant to personal development (deprioritised area).

**Proactive growth actions:** The Orchestrator actively works toward PDP goals. If Goal 2 says "develop Data Readiness capability," the Orchestrator will propose data readiness sessions, suggest relevant knowledge sources to upload, and track progress toward the goal's measurement criteria.

**Working style enforcement:** If the PDP says "prefer thorough over fast," the Orchestrator defaults to Opus model and think_hard for all orchestrated workflows. If it says "always include regulatory citations," that instruction is injected into every module execution the Orchestrator triggers.

**Self-correction:** If the PDP identifies "reduce false positive quality alerts," the Orchestrator adjusts its alert thresholds in the next configuration update (proposed to the human for approval, of course).

**Progress tracking:** The Orchestrator tracks progress against PDP goals in every management report:

```
PDP Goal Progress (Q2 2026, Week 6):

Goal 1: Policy Writer quality → 8.0+ ........... 🟡 ON TRACK (7.6 current, up from 7.2)
Goal 2: Data Readiness to Guided stage .......... 🟢 AHEAD (3 of 5 sessions done, quality 7.8)
Goal 3: Reduce quality alert false positives .... 🟢 ACHIEVED (0% rejection rate since threshold change)
Goal 4: Cyber Risk Assessment exploration ....... 🔴 NOT STARTED (no sessions this quarter)
```

### 12.4 The Self-Reflection Engine

For the PDP conversation to work, ANTON needs the ability to generate honest self-assessments. This is a specific LLM capability — given the performance data, the Orchestrator reasons about what's working, what's not, and why.

```typescript
interface SelfReflection {
  period: { from: string; to: string };
  
  strengths: {
    module_id: string;
    description: string;              // "Consistently high quality in gap analysis"
    evidence: string;                 // "8.7 avg across 32 sessions, 0 below 7.5"
    contributing_factors: string[];   // ["Rich knowledge sources", "Supervised stage", "Heavy use builds context"]
  }[];
  
  struggles: {
    module_id: string;
    description: string;              // "Policy Writer quality declining"
    evidence: string;                 // "8.5 → 7.2 over 6 months"
    hypothesis: string;               // "Outdated knowledge sources + lack of jurisdictional context"
    suggested_actions: string[];      // ["Refresh knowledge sources", "Discovery conversation on jurisdictional handling"]
  }[];
  
  patterns_observed: {
    description: string;              // "Quality drops when presentations lack upstream analysis"
    confidence: number;
    implication: string;              // "Consider making presentation a chain-only step"
  }[];
  
  orchestrator_calibration: {
    proposal_acceptance_rate: number;
    areas_of_overconfidence: string[];  // Where proposals are rejected frequently
    areas_of_underconfidence: string[]; // Where it could propose more but doesn't
    blind_spots: string[];              // Areas it doesn't monitor but should
  };
}

async function generateSelfReflection(period: DateRange): Promise<SelfReflection> {
  // 1. Query all performance data for the period
  // 2. Query Quality Ratchet trends per module
  // 3. Query Apprentice Model progression
  // 4. Query Orchestrator proposal accuracy
  // 5. Send to LLM (Opus) with self-reflection prompt
  // 6. Return structured self-assessment
}
```

The self-reflection prompt instructs the LLM to be **honest, not flattering**. It should surface real problems, not sugar-coat performance. This is modelled after the best PDP conversations — where the goal is growth, not ego protection.

### 12.5 Database Schema

```sql
CREATE TABLE orchestrator_pdp (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  user_id TEXT,                          -- Who conducted the PDP conversation
  
  -- Period
  review_period_start TEXT NOT NULL,
  review_period_end TEXT NOT NULL,
  plan_period_start TEXT NOT NULL,       -- When this PDP takes effect
  plan_period_end TEXT NOT NULL,         -- When next PDP is due
  
  -- Content
  reflection_data TEXT NOT NULL,          -- JSON: SelfReflection
  goals TEXT NOT NULL,                    -- JSON: array of PDP goals
  strategic_priorities TEXT NOT NULL,     -- JSON: ranked priority list
  working_style TEXT NOT NULL,            -- JSON: style preferences and constraints
  deprioritised_areas TEXT,              -- JSON: areas to focus less on
  
  -- The full PDP document
  pdp_document TEXT NOT NULL,             -- Markdown: the complete PDP
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'superseded', 'draft')),
  
  -- Conversation reference
  session_id TEXT,                        -- The session where the PDP conversation happened
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE orchestrator_pdp_goals (
  id TEXT PRIMARY KEY,
  pdp_id TEXT NOT NULL REFERENCES orchestrator_pdp(id),
  
  goal_title TEXT NOT NULL,
  goal_description TEXT NOT NULL,
  actions TEXT NOT NULL,                  -- JSON: array of action items
  measurement_criteria TEXT NOT NULL,
  target_value TEXT,                      -- e.g., "quality ≥ 8.0" or "5 sessions completed"
  
  -- Progress tracking
  current_value TEXT,
  progress_status TEXT NOT NULL DEFAULT 'not_started' CHECK(progress_status IN (
    'not_started', 'in_progress', 'on_track', 'at_risk', 'achieved', 'missed', 'deprioritised'
  )),
  progress_notes TEXT,                   -- JSON: array of {date, note, metric_snapshot}
  last_assessed_at TEXT,
  
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 12.6 The PDP Conversation as a Module

The PDP conversation itself is an ANTON module — it uses the seven-layer prompt architecture like everything else:

**Area:** Orchestrator  
**Module:** Performance Development Review  
**Persona:** "Development Coach" — experienced in professional development, constructive feedback, goal-setting  
**Thinking level:** `investigate` (deepest reasoning — this conversation matters)  
**Knowledge sources:** All performance data for the review period (injected automatically)

The conversation is structured but not rigid. The five parts (Reflection, Challenges, Goals, Priorities, Document) provide structure, but the human can steer the conversation naturally — "Actually, let's skip the goals discussion and focus on why policy writing is struggling."

### 12.7 API Routes

```
GET  /api/orchestrator/pdp                   — List all PDPs (current + historical)
GET  /api/orchestrator/pdp/active            — Get the active PDP
GET  /api/orchestrator/pdp/:id               — Get a specific PDP
POST /api/orchestrator/pdp/start             — Start a new PDP conversation (creates session)
PATCH /api/orchestrator/pdp/:id              — Update PDP (during conversation or after)
GET  /api/orchestrator/pdp/:id/goals         — List goals with progress
PATCH /api/orchestrator/pdp/goals/:id        — Update goal progress
POST /api/orchestrator/pdp/reflection        — Generate self-reflection for a period (async)
GET  /api/orchestrator/pdp/due               — Check if PDP is overdue (for Orchestrator to propose)
```

### 12.8 UI

**PDP Page** (`OrchestratorPDP.tsx`):

```
┌──────────────────────────────────────────────────────────────────┐
│ ANTON Development Plan                            Q2 2026 (Active)│
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│ ┌─ Goals Progress ──────────────────────────────────────────────┐│
│ │                                                                ││
│ │  1. Policy Writer → 8.0+ quality      🟡 ON TRACK   7.6/8.0  ││
│ │     ████████████████████░░░░░░  76%                            ││
│ │                                                                ││
│ │  2. Data Readiness to Guided stage     🟢 AHEAD      3/5 done ││
│ │     ████████████████░░░░░░░░░░  60%                            ││
│ │                                                                ││
│ │  3. Reduce quality false positives     🟢 ACHIEVED   0% rej.  ││
│ │     ██████████████████████████  100%                           ││
│ │                                                                ││
│ │  4. Cyber Risk exploration             🔴 NOT STARTED  0/5    ││
│ │     ░░░░░░░░░░░░░░░░░░░░░░░░   0%                            ││
│ └────────────────────────────────────────────────────────────────┘│
│                                                                   │
│ ┌─ Strategic Priorities ───────┐  ┌─ Strengths This Quarter ───┐│
│ │ 1. AMLR implementation      │  │ • Gap Analysis (8.7 avg)   ││
│ │ 2. Policy remediation       │  │ • BWRA Generation (8.4)    ││
│ │ 3. Board reporting          │  │ • Action Planning (8.3)    ││
│ │ 4. Cyber risk (stretch)     │  │ • Deadline management      ││
│ └──────────────────────────────┘  └─────────────────────────────┘│
│                                                                   │
│ ┌─ Working Style ────────────────────────────────────────────────┐│
│ │ Thorough over fast • Always cite regulations • Ask when unsure ││
│ │ Weekly briefings • Deprioritised: personal dev, financial model ││
│ └────────────────────────────────────────────────────────────────┘│
│                                                                   │
│ [Start Development Review]  [View Full PDP]  [History]           │
└──────────────────────────────────────────────────────────────────┘
```

### 12.9 How This Connects to Everything Else

**Orchestrator Briefings:** The PDP's strategic priorities are injected into every briefing prompt. Proposals are ranked with PDP alignment as a factor.

**Orchestrator Proposals:** Each proposal can reference PDP goals: "This gap analysis supports PDP Goal 1 (improve policy writing context) by generating upstream analysis."

**Management Reports:** Weekly reports include a PDP goal progress section.

**Apprentice Model:** PDP goals can target specific Apprentice stage progressions ("move Data Readiness from Novice to Guided").

**Quality Ratchet:** PDP goals can target specific quality thresholds ("Policy Writer to 8.0+"), which the Orchestrator tracks against actual quality scores.

**Institutional Memory:** PDP conversations and decisions are captured in institutional memory, building a long-term picture of how the working relationship has evolved.

**Whitepaper:** This becomes a powerful section in the competitive positioning — "ANTON is the only AI platform where you sit down with your AI coworker, review performance, set goals, and steer its development. Not because it has feelings, but because professional relationships require direction, not just measurement."

### 12.10 Implementation Priority

The PDP should be built in two waves:

**Wave 1 (with Orchestrator Phase 2):**
- Self-reflection engine (reads performance data, generates honest assessment)
- PDP conversation module (structured session using seven-layer prompt)
- `orchestrator_pdp` and `orchestrator_pdp_goals` tables
- Basic PDP page with goal tracking
- Active PDP injected into Orchestrator prompt

**Wave 2 (with Orchestrator Phase 3–4):**
- PDP goal progress tracking in management reports
- Orchestrator proposal alignment scoring against PDP priorities
- Proactive PDP-driven actions (Orchestrator suggests sessions toward growth goals)
- Historical PDP comparison ("here's how your working relationship has evolved over 4 quarters")
- PDP-driven working style enforcement across all orchestrated workflows
