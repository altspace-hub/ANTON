# ANTON Orchestrator — Reasoning Transparency & Audit Trail Specification

> **Audience:** Claude Code  
> **Purpose:** Ensure that every autonomous decision the Orchestrator makes is traceable, inspectable, and explainable — from signal detection through to final output. This is the "ask your coworker what they've been doing" capability.  
> **Relationship to main spec:** This document supplements `ANTON_ORCHESTRATOR_SPEC.md` Section 6.3 (Audit Trail). It specifies the *how* in detail — what gets captured, where it's stored, how it's presented, and how it integrates with the existing transparency system.  
> **First step for Claude Code:** Read this document fully. Then check how the existing transparency levels (Level 0/1/2), `thinking_content` field, `audit_log` table, and `messages` table work in the current codebase. The Orchestrator's reasoning trail must integrate with — not replace — the existing transparency infrastructure.

---

## 1. The Problem

ANTON already has a strong transparency system for human-initiated sessions. When a user runs a gap analysis at Level 2, the extended thinking is captured, the reasoning chain is visible, and the audit trail links session → messages → thinking → quality scores → export.

But the Orchestrator introduces a new category of work: **ANTON-initiated actions.** Nobody typed a prompt. Nobody selected a module. Nobody clicked "Run." The Orchestrator detected a signal, reasoned about it, generated a proposal, and (at higher trust stages) triggered a workflow chain — all on its own initiative.

If a compliance officer opens their dashboard Monday morning and sees that ANTON ran a gap analysis over the weekend, produced an action plan, assigned tasks to three team members, and set deadlines — the first question is: **"Why did you do all of this? Walk me through your thinking."**

Without a reasoning trail, the answer is "because signals" — which is as useless as a human colleague saying "because I felt like it." With a reasoning trail, the answer becomes a traceable narrative: "Here's the signal I detected, here's how I assessed its urgency, here's why I chose this module, here's how I evaluated the output, here's why I chained it to the next step, and here's the quality assessment at each stage."

This is the traceback. It's what makes the Orchestrator trustworthy rather than merely functional.

---

## 2. The Reasoning Trail Model

Every Orchestrator action produces a **Reasoning Trail** — a structured, timestamped chain of reasoning steps that captures *what* the Orchestrator did, *why* it did it, and *how* it evaluated the results.

### 2.1 Trail Structure

A Reasoning Trail is a linked sequence of **Reasoning Entries**. Each entry captures one decision point in the Orchestrator's thought process.

```typescript
interface ReasoningEntry {
  id: string;
  trail_id: string;                      // Links entries in the same trail
  sequence: number;                      // Order within the trail (1, 2, 3...)
  timestamp: string;                     // When this reasoning step occurred
  
  // What type of reasoning step this is
  entry_type: 
    | 'signal_detection'                 // "I noticed this signal"
    | 'signal_assessment'                // "Here's how I assessed its importance"
    | 'context_gathering'                // "I gathered this additional context"
    | 'proposal_reasoning'               // "Here's why I'm proposing this action"
    | 'module_selection'                 // "Here's why I chose this module/workflow"
    | 'input_configuration'              // "Here's how I configured the inputs"
    | 'execution_decision'               // "Here's why I decided to execute (or escalate)"
    | 'quality_assessment'               // "Here's how I evaluated the output"
    | 'chain_reasoning'                  // "Here's why I'm chaining to the next step"
    | 'escalation_reasoning'             // "Here's why I'm escalating to a human"
    | 'pattern_recognition'              // "I recognised this as a validated pattern"
    | 'pdp_alignment'                    // "This aligns with PDP goal X"
    | 'completion_summary'               // "Here's the overall outcome"
    ;
  
  // The reasoning content
  summary: string;                       // One-line human-readable summary
  reasoning: string;                     // Full reasoning text (the "thinking")
  confidence: number;                    // 0.0-1.0: how confident in this step
  
  // Evidence and references
  evidence: {
    signal_ids?: string[];               // Signals that informed this step
    quality_scores?: object;             // Quality scores referenced
    pattern_ids?: string[];              // Patterns referenced
    pdp_goal_ids?: string[];             // PDP goals this relates to
    institutional_memory_refs?: string[]; // Past decisions referenced
    knowledge_sources?: string[];        // Knowledge sources used
  };
  
  // The LLM reasoning (if this step involved an LLM call)
  thinking_content?: string;             // Extended thinking / chain of thought
  model_used?: string;                   // Which model produced this reasoning
  tokens_used?: number;
  
  // Links
  proposal_id?: string;                  // If this produced a proposal
  execution_id?: string;                 // If this relates to an execution
  workflow_step_id?: string;             // If this relates to a specific workflow step
}

interface ReasoningTrail {
  id: string;
  org_id?: string;
  
  // What triggered this trail
  trigger_type: 'heartbeat' | 'signal' | 'schedule' | 'chain' | 'manual' | 'pdp_goal';
  trigger_id?: string;                   // Heartbeat ID, signal ID, schedule ID, etc.
  
  // Trail metadata
  started_at: string;
  completed_at?: string;
  status: 'in_progress' | 'completed' | 'escalated' | 'failed';
  
  // Summary (generated after trail completes)
  narrative_summary?: string;            // Human-readable story of the full trail
  total_entries: number;
  
  // Links to outcomes
  proposal_ids: string[];                // Proposals generated by this trail
  execution_ids: string[];               // Executions triggered by this trail
  
  entries: ReasoningEntry[];             // The full reasoning chain
}
```

### 2.2 Example: Full Reasoning Trail

Here's what a complete trail looks like when the Orchestrator detects a regulatory change and chains through to a team assignment:

```
REASONING TRAIL #RT-2026-0307-001
Trigger: Heartbeat #HB-847 (2026-03-07 09:00)
Status: Completed
Duration: 47 minutes (09:00 – 09:47)

─── Entry 1: Signal Detection ──────────────────────────────────
Time: 09:00:12
Summary: "Detected high-urgency Regulatory Radar item"
Reasoning: "During heartbeat scan of radar_items table, found new item 
  RI-471: 'EBA Final Report on Guidelines for Crypto-Asset CDD' published 
  March 6, 2026. AI-scored urgency: 0.91, relevance: 0.87. This exceeds 
  the alert threshold of 0.7 for both dimensions."
Confidence: 0.95
Evidence: { signal_ids: ["RI-471"] }

─── Entry 2: Signal Assessment ─────────────────────────────────
Time: 09:00:18
Summary: "Assessed as directly relevant to current AMLR programme"
Reasoning: "Cross-referenced RI-471 against active PDP priorities. 
  Priority #1 is 'AMLR implementation support.' The EBA guideline on 
  crypto CDD directly affects AMLR Articles 19 (CDD measures) and 28 
  (enhanced CDD). Knowledge graph shows 12 existing entities related 
  to 'crypto asset' + 'CDD' from prior sessions. Institutional memory 
  shows the last crypto-focused gap analysis was 47 days ago 
  (session S-2026-0119-003). Assessment: high relevance, high urgency, 
  action recommended."
Confidence: 0.88
Evidence: { 
  signal_ids: ["RI-471"], 
  pdp_goal_ids: ["PDP-G1"], 
  institutional_memory_refs: ["S-2026-0119-003"]
}
Thinking content: [Full extended thinking from Opus call — 2,847 tokens]
Model: claude-opus-4-6

─── Entry 3: Context Gathering ─────────────────────────────────
Time: 09:00:34
Summary: "Gathered context from prior crypto CDD work"
Reasoning: "Retrieved 3 related sessions from institutional memory:
  1. S-2026-0119-003: Crypto CDD gap analysis (quality 8.1)
  2. S-2026-0202-007: CDD policy update including crypto provisions (quality 7.8)
  3. S-2025-1115-012: BWRA with crypto risk section (quality 8.4)
  
  Key finding: The last gap analysis (Jan 19) used the draft EBA guideline 
  as a knowledge source. The final guideline published March 6 may contain 
  changes from the draft. A re-run against the final text is warranted."
Confidence: 0.91
Evidence: { 
  institutional_memory_refs: ["S-2026-0119-003", "S-2026-0202-007", "S-2025-1115-012"] 
}

─── Entry 4: Proposal Reasoning ────────────────────────────────
Time: 09:01:02
Summary: "Proposing gap analysis focused on crypto CDD against final EBA text"
Reasoning: "Based on signal assessment (high urgency, high relevance), 
  PDP alignment (Priority #1: AMLR implementation), and context (prior 
  analysis used draft, final now available), I propose:
  
  Action: Run AMLR Gap Analysis module focused on crypto asset CDD
  Why this module: Gap Analysis is our strongest module (8.7 avg quality, 
    Supervised stage in Apprentice Model, 32 prior sessions)
  Knowledge sources: Final EBA guideline (new), AMLR Articles 19+28, 
    prior gap analysis S-2026-0119-003 (for comparison)
  Reviewer: Senior Analyst (based on prior assignment patterns)
  
  Alternative considered: Running a Regulatory Interpretation module first 
  to analyse changes between draft and final. Rejected because the gap 
  analysis module already includes regulatory interpretation as part of 
  its methodology, making a separate step redundant."
Confidence: 0.85
Evidence: { 
  signal_ids: ["RI-471"], 
  pdp_goal_ids: ["PDP-G1"],
  quality_scores: { "amlr-gap-analysis": { avg: 8.7, stage: "supervised" } }
}
Thinking content: [Full extended thinking — 3,214 tokens]
Model: claude-opus-4-6
Proposal: P-2026-0307-001 [GENERATED]

─── Entry 5: Module Selection ──────────────────────────────────
Time: 09:01:15
Summary: "Selected AMLR Gap Analysis with crypto CDD focus"
Reasoning: "Module selection rationale:
  - AMLR Gap Analysis (area: FCP, module: amlr-gap-analysis)
  - Apprentice stage: Supervised (32 sessions, <10% override rate)
  - Average quality: 8.7 (above PDP target of 8.0)
  - Persona: Regulatory Compliance Expert
  - Skills: Regulatory Cross-Reference, Gap Scoring Matrix
  - Thinking level: investigate (per PDP working style: 'thorough over fast')
  - Knowledge sources configured: 3 (final EBA guideline, AMLR text, prior analysis)"
Confidence: 0.92

─── Entry 6: Execution Decision ────────────────────────────────
Time: 09:15:00
Summary: "Human approved proposal P-2026-0307-001"
Reasoning: "Proposal approved by user U-001 (Daniel) at 09:15 with no 
  modifications. Triggering workflow execution via workflow engine."
Confidence: 1.0 (human decision, not AI judgment)
Execution: EX-2026-0307-001 [TRIGGERED]

─── Entry 7: Quality Assessment ────────────────────────────────
Time: 09:38:22
Summary: "Gap analysis completed — quality 8.6, 3 HIGH gaps identified"
Reasoning: "Workflow execution EX-2026-0307-001 completed in 23 minutes.
  Quality Ratchet scores:
  - Completeness: 9.1 (all relevant articles covered)
  - Accuracy: 8.8 (regulatory citations verified)
  - Structure: 8.5 (clear gap matrix with RAG scoring)
  - Actionability: 8.2 (specific remediation recommendations)
  - Citations: 8.7 (final EBA guideline properly referenced)
  - Overall: 8.6
  
  This is within 0.1 points of the module's average (8.7) and above 
  PDP Goal 1 target (8.0). Quality assessment: satisfactory.
  
  Key findings: 3 HIGH gaps identified (crypto CDD data fields, 
  enhanced monitoring triggers, risk variable definitions). These 
  warrant follow-up action."
Confidence: 0.90
Evidence: { 
  quality_scores: { overall: 8.6, completeness: 9.1, accuracy: 8.8 },
  execution_ids: ["EX-2026-0307-001"]
}

─── Entry 8: Chain Reasoning ───────────────────────────────────
Time: 09:38:45
Summary: "3 HIGH gaps warrant action plan — proposing workflow chain"
Reasoning: "The gap analysis output contains 3 HIGH-rated gaps requiring 
  remediation. Pattern analysis shows this organisation has chained 
  'Gap Analysis → Action Plan' 4 times previously, all with quality ≥ 7.5. 
  This matches validated pattern VP-003.
  
  Orchestrator stage: 3 (Supervised)
  Pattern VP-003 status: validated (4 prior approvals, avg quality 8.1)
  Auto-execution eligible: Yes
  
  Decision: Auto-execute Action Plan workflow with gap analysis output 
  as input. Notification sent to dashboard."
Confidence: 0.87
Evidence: { 
  pattern_ids: ["VP-003"],
  execution_ids: ["EX-2026-0307-001"]
}
Thinking content: [Extended thinking — 1,892 tokens]
Model: claude-opus-4-6
Execution: EX-2026-0307-002 [AUTO-TRIGGERED]

─── Entry 9: PDP Alignment ────────────────────────────────────
Time: 09:39:01
Summary: "Actions align with PDP Goals 1 and 2"
Reasoning: "This trail directly supports:
  - PDP Goal 1 (AMLR implementation support) — Primary programme priority
  - PDP Goal 2 (improve response time to regulatory changes) — Signal 
    detected within 24 hours of publication, action initiated same morning
  
  Tracking: PDP goal progress updated."
Evidence: { pdp_goal_ids: ["PDP-G1", "PDP-G2"] }

─── Entry 10: Completion Summary ───────────────────────────────
Time: 09:47:30
Summary: "Chain completed — gap analysis + action plan delivered"
Reasoning: "Full trail summary:
  
  Trigger: EBA crypto CDD guideline detected on Regulatory Radar
  Actions taken: 
    1. Gap analysis executed (quality 8.6, human-approved)
    2. Action plan auto-triggered (pattern VP-003, quality 8.3)
  
  Outputs:
    - Gap analysis report: workspace/outputs/2026-03-07/crypto-cdd-gap-analysis.docx
    - Action plan: workspace/outputs/2026-03-07/crypto-cdd-action-plan.docx
  
  Assignments created: 3 (one per HIGH gap, assigned to compliance team)
  Deadlines set: 30-day remediation window
  
  Total elapsed: 47 minutes
  Total LLM cost: $4.23 (2 Opus calls for reasoning, 2 Opus calls for module execution)
  Human intervention: 1 approval (proposal approval at 09:15)"

NARRATIVE SUMMARY:
"This morning I noticed that the EBA published their final guidelines on 
crypto asset CDD yesterday. Since your #1 priority is AMLR implementation 
and we last analysed crypto CDD requirements 47 days ago against the draft 
guideline, I proposed running a fresh gap analysis against the final text. 
You approved it, and the analysis found 3 significant gaps in your crypto 
CDD framework. Because this matches a pattern we've validated 4 times before, 
I automatically triggered an action plan and assigned remediation tasks to 
your compliance team with a 30-day deadline. Both deliverables are in your 
workspace."
```

---

## 3. What Gets Captured (By Orchestrator Function)

### 3.1 Heartbeat Reasoning

Every heartbeat cycle produces a trail, even if the conclusion is "nothing needs attention."

**Minimal heartbeat (no action needed):**
```
Trail: 1 entry
Entry 1 (signal_detection): "Scanned 9 signal sources. 0 signals exceed 
  thresholds. Radar: 0 new items. Deadlines: nearest is 23 days away. 
  Quality: stable across all modules. Patterns: no new detections. 
  Workflows: 0 running, 0 failed. Assignments: 0 overdue. 
  Result: HEARTBEAT_OK — no action required."
```

**Active heartbeat (action needed):**
Full trail as shown in the example above — every signal detected, every assessment made, every decision explained.

### 3.2 Proposal Generation Reasoning

Every proposal includes reasoning for:
- Why this signal warrants action (not just that it exists)
- Why this specific module/workflow was chosen (not just "it seemed relevant")
- What alternatives were considered and rejected
- How PDP priorities influenced the decision
- What confidence level applies and why
- What institutional memory or patterns informed the proposal

### 3.3 Execution Monitoring Reasoning

While a workflow executes, the Orchestrator's monitoring captures:
- Quality assessment of each step's output (with reasoning)
- Decision to proceed vs. escalate (with reasoning)
- Chain trigger decisions (why chain to next step, or why not)
- Any mid-execution adjustments (model switch, knowledge source refresh)

### 3.4 Auto-Execution Reasoning

When the Orchestrator auto-executes a validated pattern, it captures:
- Which pattern matched and why
- Comparison to prior successful executions of this pattern
- Any differences from prior executions (different signal, different context)
- Why auto-execution was appropriate (criteria met) vs. escalation

### 3.5 Orchestrator Self-Reflection Reasoning

During PDP reviews and management reports, the Orchestrator's self-assessment reasoning is captured:
- How it evaluated its own performance
- What data it used for self-assessment
- Where it identified blind spots or calibration issues
- What it recommends for improvement

---

## 4. Database Schema

```sql
-- The reasoning trail — one per Orchestrator action sequence
CREATE TABLE orchestrator_reasoning_trails (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  
  -- Trigger
  trigger_type TEXT NOT NULL CHECK(trigger_type IN (
    'heartbeat', 'signal', 'schedule', 'chain', 'manual', 'pdp_goal'
  )),
  trigger_id TEXT,                       -- Heartbeat ID, signal ID, etc.
  
  -- Timing
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  duration_ms INTEGER,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN (
    'in_progress', 'completed', 'escalated', 'failed'
  )),
  
  -- Summary (generated on completion)
  narrative_summary TEXT,                -- Human-readable story
  total_entries INTEGER NOT NULL DEFAULT 0,
  
  -- Links
  proposal_ids TEXT DEFAULT '[]',        -- JSON array
  execution_ids TEXT DEFAULT '[]',       -- JSON array
  
  -- Cost tracking
  total_reasoning_tokens INTEGER DEFAULT 0,
  total_reasoning_cost_usd REAL DEFAULT 0,
  
  -- Workspace file
  trail_file_path TEXT                   -- Path in workspace (orchestrator/trails/)
);

-- Individual reasoning entries — many per trail
CREATE TABLE orchestrator_reasoning_entries (
  id TEXT PRIMARY KEY,
  trail_id TEXT NOT NULL REFERENCES orchestrator_reasoning_trails(id),
  sequence INTEGER NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  
  -- Entry type
  entry_type TEXT NOT NULL CHECK(entry_type IN (
    'signal_detection', 'signal_assessment', 'context_gathering',
    'proposal_reasoning', 'module_selection', 'input_configuration',
    'execution_decision', 'quality_assessment', 'chain_reasoning',
    'escalation_reasoning', 'pattern_recognition', 'pdp_alignment',
    'completion_summary'
  )),
  
  -- Content
  summary TEXT NOT NULL,                 -- One-line summary
  reasoning TEXT NOT NULL,               -- Full reasoning text
  confidence REAL,                       -- 0.0 - 1.0
  
  -- Evidence (JSON)
  evidence TEXT DEFAULT '{}',
  
  -- LLM reasoning (if this entry involved an LLM call)
  thinking_content TEXT,                 -- Extended thinking / chain of thought
  model_used TEXT,
  tokens_used INTEGER,
  cost_usd REAL,
  
  -- Links
  proposal_id TEXT,
  execution_id TEXT,
  workflow_step_id TEXT
);

-- Indexes for common access patterns
CREATE INDEX idx_trails_org ON orchestrator_reasoning_trails(org_id);
CREATE INDEX idx_trails_trigger ON orchestrator_reasoning_trails(trigger_type, trigger_id);
CREATE INDEX idx_trails_status ON orchestrator_reasoning_trails(status);
CREATE INDEX idx_trails_date ON orchestrator_reasoning_trails(started_at);
CREATE INDEX idx_entries_trail ON orchestrator_reasoning_entries(trail_id, sequence);
CREATE INDEX idx_entries_type ON orchestrator_reasoning_entries(entry_type);
CREATE INDEX idx_entries_proposal ON orchestrator_reasoning_entries(proposal_id);
CREATE INDEX idx_entries_execution ON orchestrator_reasoning_entries(execution_id);
```

---

## 5. Transparency Levels for Orchestrator Reasoning

The existing three-level transparency system extends to the Orchestrator:

**Level 0: Outcome Only**

The user sees what the Orchestrator did (proposals, executions, results) but not the reasoning chain. Proposals show the action and confidence score but not the full rationale.

*When to use:* Routine operations where you trust the Orchestrator and just want the results. Similar to trusting a capable colleague's work without reading their notes.

**Level 1: Show Reasoning (Default)**

The user sees the reasoning trail summaries — the one-line summary per entry, the narrative summary, and the evidence references. Enough to understand *why* without reading every detail.

*When to use:* Normal operations. You want to verify the Orchestrator's logic without reading the full chain-of-thought. Like asking a colleague "walk me through your thinking" and getting a concise explanation.

**Level 2: Deep Trace**

The user sees everything — full reasoning text, extended thinking content from LLM calls, all evidence references, token counts, cost per reasoning step, model selections. The complete audit trail suitable for regulatory inspection.

*When to use:* Reviewing auto-executed workflows. Investigating why the Orchestrator made a specific decision. Regulatory or compliance audits. Debugging unexpected behaviour. Like asking a colleague to show you their complete working notes, sources, and decision log.

**Configuration:**

```sql
-- Add to orchestrator_config
ALTER TABLE orchestrator_config ADD COLUMN reasoning_transparency_level INTEGER 
  NOT NULL DEFAULT 1 CHECK(reasoning_transparency_level BETWEEN 0 AND 2);
```

The transparency level controls what's *displayed*, not what's *captured*. All reasoning is always captured at Level 2 depth. The display level just controls how much is shown in the UI by default. A user can always drill down to deeper levels on any specific trail.

---

## 6. The Trail Viewer UI

### 6.1 Trail Timeline View

```
┌──────────────────────────────────────────────────────────────────┐
│ Reasoning Trail #RT-2026-0307-001                                │
│ Trigger: Heartbeat • Started: 09:00 • Duration: 47 min          │
│ Status: ✅ Completed • Cost: $4.23                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  "This morning I noticed the EBA published their final crypto    │
│   CDD guidelines. I ran a gap analysis and action plan, finding  │
│   3 significant gaps. Remediation tasks are assigned."           │
│                                                                   │
│  ──── Timeline ────────────────────────────────────────────────  │
│                                                                   │
│  09:00  🔍 Signal Detection                          conf: 95%  │
│         Detected high-urgency Regulatory Radar item              │
│         [Expand reasoning ▸]                                     │
│                                                                   │
│  09:00  📊 Signal Assessment                         conf: 88%  │
│         Assessed as directly relevant to AMLR programme          │
│         [Expand reasoning ▸] [View thinking ▸]                   │
│                                                                   │
│  09:00  📚 Context Gathering                         conf: 91%  │
│         Retrieved 3 related prior sessions                       │
│         [Expand reasoning ▸]                                     │
│                                                                   │
│  09:01  💡 Proposal Generated                        conf: 85%  │
│         Gap analysis focused on crypto CDD                       │
│         [Expand reasoning ▸] [View thinking ▸] [View proposal]  │
│                                                                   │
│  09:01  🎯 Module Selected                           conf: 92%  │
│         AMLR Gap Analysis (Supervised, 8.7 avg)                  │
│         [Expand reasoning ▸]                                     │
│                                                                   │
│  09:15  ✅ Human Approved                            conf: 100% │
│         Approved by Daniel, no modifications                     │
│                                                                   │
│  09:38  📈 Quality Assessment                        conf: 90%  │
│         Completed: quality 8.6, 3 HIGH gaps found                │
│         [Expand reasoning ▸] [View output]                       │
│                                                                   │
│  09:38  🔗 Chain Triggered                           conf: 87%  │
│         Auto-executing Action Plan (pattern VP-003)              │
│         [Expand reasoning ▸] [View thinking ▸] [View pattern]   │
│                                                                   │
│  09:39  🎯 PDP Alignment                                        │
│         Supports Goals 1 and 2                                   │
│         [View PDP goals]                                         │
│                                                                   │
│  09:47  ✅ Trail Complete                                        │
│         2 outputs delivered, 3 assignments created               │
│         [View outputs] [View assignments]                        │
│                                                                   │
│  [Export Trail as PDF]  [Export Trail as MD]  [Share]            │
└──────────────────────────────────────────────────────────────────┘
```

### 6.2 Expanded Reasoning View

When clicking [Expand reasoning] on any entry:

```
┌── Entry 4: Proposal Reasoning ──────────────────────────────────┐
│ Confidence: 85% • Model: Opus 4.6 • Tokens: 3,214              │
│                                                                  │
│ REASONING:                                                       │
│ Based on signal assessment (high urgency, high relevance),       │
│ PDP alignment (Priority #1: AMLR implementation), and context    │
│ (prior analysis used draft, final now available), I propose:     │
│                                                                  │
│ Action: Run AMLR Gap Analysis module focused on crypto CDD       │
│ Why this module: Gap Analysis is our strongest module (8.7 avg)  │
│ Knowledge sources: Final EBA guideline, AMLR Articles 19+28     │
│                                                                  │
│ Alternative considered: Running Regulatory Interpretation first  │
│ Rejected because: gap analysis already includes interpretation   │
│                                                                  │
│ EVIDENCE:                                                        │
│ • Signal: RI-471 (EBA crypto CDD guideline)                    │
│ • PDP Goal: #1 — AMLR implementation support                    │
│ • Module stats: 8.7 avg quality, Supervised stage, 32 sessions  │
│                                                                  │
│ [View full extended thinking ▸]  [View proposal ▸]              │
└──────────────────────────────────────────────────────────────────┘
```

### 6.3 Trail List/Search View

A page listing all reasoning trails with filtering:

```
┌──────────────────────────────────────────────────────────────────┐
│ Orchestrator Reasoning Trails                                    │
│ [Filter: All ▼] [Period: Last 7 days ▼] [Search...]            │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│ Mar 7, 09:00  Heartbeat → Gap Analysis + Action Plan  47 min    │
│               3 HIGH gaps, 3 assignments  ✅ quality 8.6         │
│               [View trail]                                       │
│                                                                   │
│ Mar 7, 08:30  Heartbeat → No action needed           12 sec     │
│               All signals below threshold  ● OK                  │
│               [View trail]                                       │
│                                                                   │
│ Mar 6, 15:20  Quality alert → Investigation          8 min      │
│               Policy Writer quality stable  ✅ false positive     │
│               [View trail]                                       │
│                                                                   │
│ Mar 5, 09:00  Heartbeat → Deadline reminder          3 min      │
│               Q1 BWRA in 14 days  📋 Proposal sent               │
│               [View trail]                                       │
│                                                                   │
│ Showing 4 of 47 trails  [Load more]                              │
└──────────────────────────────────────────────────────────────────┘
```

---

## 7. Workspace Integration

Every completed reasoning trail is saved as a Markdown file in the workspace:

```
~/.anton/orchestrator/trails/
├── 2026-03-07/
│   ├── RT-2026-0307-001-crypto-cdd-gap-chain.md
│   └── RT-2026-0307-002-heartbeat-ok.md
├── 2026-03-06/
│   ├── RT-2026-0306-001-quality-alert-investigation.md
│   └── RT-2026-0306-002-deadline-reminder.md
└── ...
```

The Markdown files contain the full trail in human-readable format — the same content shown in the UI, rendered as a document. These files are:
- Inspectable with any text editor
- Version-controllable with Git
- Searchable with grep
- Exportable as PDF/DOCX via the existing export system
- Available for regulatory audit without needing to access the platform

---

## 8. Integration with Existing Transparency

### 8.1 Module-Level Thinking

When the Orchestrator triggers a module execution (e.g., gap analysis), the module's own thinking content is captured in the existing `messages` table with `thinking_content` as it already works. The reasoning trail's `quality_assessment` entry then *references* that module output and its thinking — it doesn't duplicate it.

```
Reasoning Trail (Orchestrator level):
  Entry 7: quality_assessment → "Output quality 8.6, 3 HIGH gaps"
    ↓ references
  Workflow Execution EX-2026-0307-001:
    Step 1: Module execution (AMLR Gap Analysis)
      ↓ contains
    Messages table: thinking_content, output, quality_scores
```

This creates a two-level transparency system:
- **Orchestrator level:** Why did ANTON decide to run this module? (Reasoning trail)
- **Module level:** How did ANTON perform the analysis? (Existing thinking_content)

Both are traceable, and the UI can navigate between them: from a reasoning trail entry, click "View module output" to see the module's own thinking and results.

### 8.2 Audit Log Integration

Every reasoning trail completion generates an entry in the existing `audit_log` table:

```sql
INSERT INTO audit_log (
  event_type, description, user_id, metadata
) VALUES (
  'orchestrator_trail_completed',
  'Orchestrator completed reasoning trail RT-2026-0307-001: Gap Analysis + Action Plan chain',
  'system',  -- or the org/user context
  '{"trail_id": "RT-2026-0307-001", "trigger": "heartbeat", "proposals": 1, "executions": 2, "quality_avg": 8.45}'
);
```

This means the existing AuditLogPage.tsx already shows Orchestrator activity in the audit stream, with links to the full reasoning trail for details.

---

## 9. Narrative Summary Generation

Every completed trail gets a narrative summary — a plain-language paragraph that tells the story of what happened and why. This is generated by the LLM (Sonnet, to keep costs reasonable) after the trail completes.

The narrative summary is designed to answer the question: **"What have you been doing?"**

It should read like a concise status update from a colleague:

> "This morning I noticed that the EBA published their final guidelines on crypto asset CDD yesterday. Since your #1 priority is AMLR implementation and we last analysed crypto CDD requirements 47 days ago against the draft guideline, I proposed running a fresh gap analysis against the final text. You approved it, and the analysis found 3 significant gaps in your crypto CDD framework. Because this matches a pattern we've validated 4 times before, I automatically triggered an action plan and assigned remediation tasks to your compliance team with a 30-day deadline. Both deliverables are in your workspace."

The narrative is shown at the top of the trail in the UI, in the Orchestrator's daily briefing, and in the management report. It's the "elevator pitch" for the trail — with the full reasoning chain available for anyone who wants to dig deeper.

---

## 10. API Routes

```
GET  /api/orchestrator/trails                — List trails (paginated, filterable)
GET  /api/orchestrator/trails/:id            — Full trail with all entries
GET  /api/orchestrator/trails/:id/entries     — Entries for a trail (with pagination)
GET  /api/orchestrator/trails/:id/narrative   — Narrative summary only
GET  /api/orchestrator/trails/:id/export      — Export trail as MD/PDF/DOCX
GET  /api/orchestrator/trails/search          — Search trails by content/date/type
GET  /api/orchestrator/trails/stats           — Trail statistics (count, avg duration, cost)
```

---

## 11. Implementation Notes for Claude Code

### 11.1 When to Create Entries

Every LLM call the Orchestrator makes should produce a reasoning entry. The reasoning is not an afterthought — it's captured as part of the LLM call itself. The Orchestrator's prompt should instruct the model to structure its response as both an action/decision AND a reasoning explanation.

```typescript
// Pattern: every Orchestrator LLM call captures reasoning
async function assessSignal(signal: PlatformSignal, trail: ReasoningTrail): Promise<SignalAssessment> {
  const response = await llmClient.call({
    model: config.heartbeat_model,
    messages: [{ 
      role: 'user', 
      content: `Assess this signal: ${JSON.stringify(signal)}. 
        Respond with both your assessment AND your reasoning.`
    }],
    // Extended thinking is captured automatically by unified-llm-client
  });
  
  // Create reasoning entry
  await createReasoningEntry({
    trail_id: trail.id,
    entry_type: 'signal_assessment',
    summary: response.assessment_summary,
    reasoning: response.reasoning,
    confidence: response.confidence,
    thinking_content: response.thinking, // Extended thinking from Claude
    model_used: config.heartbeat_model,
    tokens_used: response.usage.total_tokens,
    evidence: { signal_ids: [signal.signal_id] },
  });
  
  return response.assessment;
}
```

### 11.2 Trail Lifecycle

```
1. Heartbeat fires (or signal detected, or chain triggered)
   → Create trail record (status: in_progress)
   
2. Each reasoning step
   → Create entry record (sequence increments)
   → Update trail.total_entries
   
3. Trail completes (or fails/escalates)
   → Generate narrative summary (LLM call)
   → Update trail (status, completed_at, duration, narrative)
   → Save trail as MD file in workspace
   → Create audit_log entry
   → Update trail cost totals
```

### 11.3 Performance Considerations

Reasoning capture adds LLM overhead. To manage this:

- Heartbeats that find nothing use Haiku for signal scanning — one cheap call, one minimal entry
- Signal assessment uses the configured heartbeat_model (default Haiku) for initial screening, Opus only for signals that exceed thresholds
- Narrative summary generation uses Sonnet (good enough, much cheaper than Opus)
- Reasoning entries are written asynchronously — they don't block the Orchestrator's main execution flow
- Trail files in the workspace are generated in batch (once per completed trail, not per entry)

### 11.4 Retention

Reasoning trails accumulate. Storage management:

- Trail database records: retained indefinitely (they're the audit trail)
- Trail workspace files: retained per workspace config (default: indefinitely, configurable)
- Thinking content (the long extended thinking blobs): configurable retention. Default: 90 days for full thinking content, summaries retained indefinitely. After 90 days, `thinking_content` fields are set to null but `reasoning` (the structured summary) remains.
- This mirrors how a professional services firm handles working papers: detailed notes kept for the engagement period + retention period, summaries kept permanently.
