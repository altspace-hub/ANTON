# openEXPERT by ANTON — Implementation Briefs for Transformative Features

## Document Purpose

This document provides focused implementation specifications for the transformative features that need more than what the Addendum provides, but less than the full deep-dive given to Cross-Workflow Intelligence. Each brief includes: the goal, data model, key components, core logic, and integration points.

**Companion documents:**
- `openEXPERT_Coworker_Engine_Spec.md` — Workflows, connections, modules, coworker templates
- `openEXPERT_Transformative_Features_Addendum.md` — Vision and rationale for all 14 features
- `openEXPERT_Cross_Workflow_Intelligence_Spec.md` — Full deep-dive on the knowledge funnel

---

## Brief 1: Institutional Memory at Checkpoints

### Goal

When a user reaches a checkpoint in a workflow, surface relevant past decisions made by their team in similar situations. Not just "here's what happened before" — but "here's what people *decided* and *why*."

### Data Foundation

The `checkpoint_decisions` table is already defined in the Cross-Workflow Intelligence spec. This brief covers how to **use** that data at runtime.

### Core Logic: Similarity Matching

When a checkpoint is reached, find similar past checkpoints. "Similar" means:

```
Similarity score = weighted sum of:
  - Same workflow template (weight: 0.3)
  - Same step index in workflow (weight: 0.2)  
  - Similar input data characteristics (weight: 0.3)
  - Same area + module (weight: 0.2)
```

**For input data similarity:** Use a combination of:
1. **Structural match:** Same data fields present (e.g., both have `risk_score`, `customer_segment`, `alert_type`)
2. **Value range match:** Numeric values in similar ranges (e.g., both have risk_score between 7-9)
3. **Category match:** Categorical values match (e.g., both are `alert_type: "velocity_check"`)
4. **Semantic match (expensive, optional):** AI embedding similarity on the full context — use only when structural matching returns < 5 results

### Implementation

```
Service: InstitutionalMemoryService

Methods:
  findSimilarDecisions(checkpoint_context):
    1. Query checkpoint_decisions for same workflow_id + step_index (fast, exact match)
    2. Score each by input data similarity
    3. Return top 10, sorted by similarity score
    4. Include: decision distribution (e.g., "68% closed, 24% escalated, 8% requested info")
    5. Include: top 3 most recent override reasons (if any)
    
  getDecisionDistribution(workflow_id, step_index, filters?):
    1. Aggregate all decisions for this checkpoint
    2. Group by human_decision value
    3. Calculate percentages
    4. Trend over time (are decisions shifting?)
    
  getOverridePatterns(workflow_id, step_index):
    1. Filter to is_override = true
    2. Group by override_category
    3. Return: category, count, percentage, recent examples
```

### UI Component: CheckpointMemoryPanel

Renders inside the `WorkflowCheckpoint.tsx` component as a collapsible sidebar panel.

```
CheckpointMemoryPanel.tsx
├── DecisionDistributionChart
│   ├── Pie/donut chart showing decision breakdown
│   ├── "In 142 similar cases: 68% closed, 24% escalated, 8% requested info"
│   └── Trend arrow if distribution is shifting
│
├── SimilarDecisionsList
│   ├── Top 5 most similar past decisions
│   ├── Each shows: date, who decided, what they decided, similarity score
│   ├── Expandable: show the input data that was present, reasoning notes
│   └── Click to view full source workflow execution
│
├── OverrideInsights (only if AI made a recommendation)
│   ├── "AI recommended X. Humans agreed Y% of the time."
│   ├── "When humans overrode, the most common reasons were: ..."
│   └── Helps calibrate trust in AI recommendation
│
└── ContributeSection
    ├── After user makes their decision: "Why did you choose this?"
    ├── Free text field (optional but encouraged)
    ├── Dropdown: override reason categories (if overriding AI)
    └── Stored in checkpoint_decisions for future reference
```

### Configuration

```json
{
  "institutional_memory": {
    "enabled": true,
    "min_history_for_display": 10,
    "max_similar_decisions_shown": 5,
    "similarity_threshold": 0.5,
    "use_semantic_matching": false,
    "require_reasoning_on_override": true,
    "require_reasoning_on_all_decisions": false,
    "anonymize_decision_makers": false
  }
}
```

### Integration Points

- **Cross-Workflow Intelligence:** Checkpoint decisions feed into knowledge atoms (already specified)
- **Apprentice Model:** Apprentice mode shows institutional memory more prominently + adds coaching context
- **Quality Ratchet:** Decision consistency becomes a quality metric

---

## Brief 2: Apprentice Model — 4-Stage Learning System

### Goal

Turn every workflow into a training experience with progressive responsibility. Junior staff learn by watching, then doing with guidance, then independently with safety nets, then fully autonomously.

### Data Model

```sql
-- User skill tracking
CREATE TABLE user_competencies (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,         -- Which workflow type
  area_id TEXT,
  current_stage INTEGER DEFAULT 1,   -- 1=Observer, 2=Guided, 3=Independent, 4=Autonomous
  executions_at_stage INTEGER DEFAULT 0,
  
  -- Performance metrics
  decision_accuracy REAL,            -- Agreement with senior/AI patterns (0-1)
  consistency_score REAL,            -- How consistent are their decisions (0-1)
  speed_percentile REAL,             -- Time to complete vs. peers
  override_quality REAL,             -- When they override AI, are outcomes better?
  
  -- Progression
  promoted_at DATETIME,              -- When they moved to current stage
  promoted_by TEXT,                   -- Who approved promotion (or 'auto')
  promotion_criteria_met JSON,       -- Which criteria triggered promotion
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Stage progression rules
CREATE TABLE stage_progression_rules (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  from_stage INTEGER NOT NULL,
  to_stage INTEGER NOT NULL,
  
  -- Criteria (all must be met)
  min_executions INTEGER DEFAULT 10,
  min_decision_accuracy REAL DEFAULT 0.8,
  min_consistency_score REAL DEFAULT 0.7,
  require_manager_approval BOOLEAN DEFAULT true,
  
  -- Optional criteria
  min_time_at_stage_days INTEGER,
  required_training_modules JSON,    -- Module IDs that must be completed
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Training annotations (coaching notes on specific steps)
CREATE TABLE training_annotations (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  stage INTEGER NOT NULL,             -- Which stage sees this annotation
  annotation_type TEXT NOT NULL,      -- 'explanation', 'warning', 'tip', 'question', 'checklist'
  content TEXT NOT NULL,
  created_by TEXT NOT NULL,           -- Senior who wrote this, or 'system'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### The Four Stages — Implementation Details

**Stage 1: Observer**
```
Workflow execution behavior:
- All steps execute automatically (no human input required)
- Every step shows detailed explanation panel:
  "What's happening: [description]"
  "Why: [reasoning]"
  "What a senior [role] would look for: [coaching notes]"
  "Historical context: [institutional memory summary]"
- At checkpoints: show AI recommendation + institutional memory + explanation
  BUT no decision required — auto-proceeds with AI recommendation
- Observer can ask questions via embedded chat (context-aware)
- All observations logged for training record
```

**Stage 2: Guided Practitioner**
```
Workflow execution behavior:
- Steps execute normally
- At checkpoints: user MUST make a decision
- Before decision: show coaching panel:
  "Based on this data, what would you decide?"
  "AI recommends: [X] because [reasoning]"
  "Historical: In similar cases, seniors chose [Y] [Z]% of the time"
- After decision: if diverges significantly from patterns:
  "Your decision differs from typical — [explanation]. This may be 
   perfectly valid if [conditions]. Consider: [suggestion]."
  User can: confirm their decision, change it, or add reasoning
- Senior reviewer dashboard: async review of all Stage 2 decisions
  Can add comments, flag for discussion, approve, or request redo
```

**Stage 3: Independent with Safety Net**
```
Workflow execution behavior:
- Normal execution with standard checkpoints
- No coaching panels (unless user requests them)
- Background monitoring: system flags decisions that are:
  - Statistically unusual (>2 std dev from team patterns)
  - High risk (based on context: large transaction, senior customer, etc.)
  - Contradictory to recent similar decisions by same user
- Flagged decisions added to review queue (not blocking — async)
- Periodic quality sampling: 1 in N executions selected for senior review
- Graduation metrics tracked automatically
```

**Stage 4: Autonomous**
```
Workflow execution behavior:
- Standard execution, no additional scaffolding
- User's decisions feed into institutional memory at full weight
- User can be assigned as reviewer for Stage 2-3 users
- Quality metrics continue to be tracked
```

### Key Components

```
src/features/apprentice/
├── ApprenticeManager.tsx            — Manage user stage assignments
├── StageProgressionTracker.tsx      — Track metrics, show progress to promotion
├── CoachingPanel.tsx                — Stage 1-2 coaching overlay on checkpoints
├── DivergenceAlert.tsx              — "Your decision differs" component
├── SeniorReviewDashboard.tsx        — Review queue for Stage 2-3 decisions
├── TrainingAnnotationEditor.tsx     — Seniors add coaching notes to workflow steps
├── CompetencyDashboard.tsx          — Manager view: team competency across workflows
└── GraduationCeremony.tsx           — Celebration + notification on stage promotion
```

### Service Layer

```
Service: ApprenticeService

Methods:
  getUserStage(user_id, workflow_id) → stage (1-4)
  
  getCoachingContext(workflow_id, step_index, stage, execution_context):
    - Fetch training annotations for this step + stage
    - Fetch institutional memory for this checkpoint
    - Generate stage-appropriate explanation via AI
    - Return coaching panel content
  
  evaluateDecision(user_id, decision, execution_context):
    - Compare to AI recommendation
    - Compare to institutional memory patterns
    - Calculate divergence score
    - If Stage 2 + high divergence: trigger divergence alert
    - If Stage 3 + flagged: add to review queue
    - Update user competency metrics
  
  checkPromotion(user_id, workflow_id):
    - Load progression rules for current stage → next stage
    - Check all criteria against current metrics
    - If all met + require_manager_approval: create promotion request
    - If all met + auto-promote: promote and notify
    
  getTeamCompetencyMatrix(manager_id):
    - All team members × all workflow types
    - Current stage, progress %, key metrics
    - Highlight: ready for promotion, struggling, excelling
```

### For Education Use (Universities / Professional Training)

- Professors create workflows with training scenarios (synthetic data)
- Students assigned at Stage 1, progress through stages during the course
- Assessment based on: decision accuracy, consistency, time to proficiency, quality of reasoning
- Certification: "Completed N workflows at Stage 3+ with Y% accuracy" = verifiable credential
- Configurable: professor can lock at Stage 2 (always guided) for introductory courses

---

## Brief 3: Time Intelligence — Deadline Propagation & Work Rhythm

### Goal

Make ANTON time-aware. Understand deadlines, propagate urgency, detect scheduling conflicts, and help users manage their work rhythm proactively rather than reactively.

### Data Model

```sql
-- Deadlines and milestones
CREATE TABLE deadlines (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATETIME NOT NULL,
  
  -- Source
  source_type TEXT NOT NULL,          -- 'manual', 'workflow', 'regulatory', 'calendar', 'api'
  source_ref TEXT,                    -- Reference to source (workflow_id, regulation article, etc.)
  
  -- Classification
  category TEXT,                      -- 'regulatory', 'client', 'internal', 'project', 'recurring'
  priority TEXT DEFAULT 'medium',     -- 'critical', 'high', 'medium', 'low'
  
  -- Dependencies
  depends_on JSON,                    -- Array of deadline IDs that must complete before this
  blocks JSON,                        -- Array of deadline IDs that depend on this
  
  -- Propagation
  preparation_days INTEGER,           -- How many working days to prepare
  review_days INTEGER,                -- How many working days for review
  buffer_days INTEGER DEFAULT 2,      -- Safety buffer
  earliest_start DATETIME,            -- Calculated: due_date - prep - review - buffer
  
  -- Assignment
  owner_id TEXT,
  team_ids JSON,
  
  -- Status
  status TEXT DEFAULT 'upcoming',     -- 'upcoming', 'in_progress', 'review', 'completed', 'overdue', 'at_risk'
  completed_at DATETIME,
  
  -- Recurrence
  is_recurring BOOLEAN DEFAULT false,
  recurrence_rule TEXT,               -- 'monthly:25', 'quarterly:+45d', 'annually:03-31', etc.
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_deadlines_due ON deadlines(due_date);
CREATE INDEX idx_deadlines_status ON deadlines(status);
CREATE INDEX idx_deadlines_owner ON deadlines(owner_id);

-- Organizational rhythms (learned patterns)
CREATE TABLE work_rhythms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,                  -- 'month_end_close', 'board_meeting_prep', 'quarterly_reporting'
  description TEXT,
  
  -- Pattern
  frequency TEXT NOT NULL,             -- 'weekly', 'monthly', 'quarterly', 'annually'
  anchor_expression TEXT NOT NULL,     -- 'last_working_day', 'second_thursday', 'day:15', 'quarter_end:+45d'
  typical_duration_days INTEGER,
  typical_effort_hours REAL,
  
  -- Detection
  source TEXT,                         -- 'manual', 'detected' (auto-detected from workflow patterns)
  detection_confidence REAL,
  
  -- Connection
  associated_workflows JSON,           -- Workflow IDs typically triggered by this rhythm
  associated_deadlines JSON,           -- Deadline patterns connected to this rhythm
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Capacity tracking
CREATE TABLE user_capacity (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  week_start DATE NOT NULL,
  
  available_hours REAL DEFAULT 40,
  allocated_hours REAL DEFAULT 0,       -- Sum of estimated effort from deadlines + workflows
  actual_hours REAL,                    -- Tracked after the fact
  
  -- Breakdown
  allocations JSON,                    -- Array of {deadline_id, workflow_id, estimated_hours}
  
  UNIQUE(user_id, week_start)
);
```

### Core Logic

**Deadline Propagation Engine:**
```
Service: TimeIntelligenceService

Methods:
  propagateDeadline(deadline):
    1. Calculate earliest_start = due_date - preparation_days - review_days - buffer_days
    2. For each dependency in depends_on:
       - That dependency's due_date must be <= this deadline's earliest_start
       - If not: flag conflict
    3. For each blocked item in blocks:
       - Recalculate their earliest_start based on this deadline
    4. Cascade: any changes trigger re-propagation of dependent deadlines
    
  detectConflicts(user_id, time_range):
    1. Get all deadlines for user in time range
    2. Get estimated effort for each (from associated workflows or manual)
    3. Sum effort per week
    4. Compare to user_capacity
    5. Flag weeks where allocated > available
    6. For conflicting weeks: suggest resolution:
       - "Move [X] earlier to spread load"
       - "Delegate [Y] — it has the lowest priority"
       - "Start [Z] this week instead of next — you have capacity now"
    
  detectRhythms(organization_id):
    1. Analyze workflow execution patterns over last 6+ months
    2. Identify recurring patterns (same workflow type, regular intervals)
    3. Calculate: frequency, typical timing, typical duration
    4. Suggest as detected work_rhythm for admin approval
    5. Once approved: auto-create deadline reminders ahead of each occurrence
    
  getMorningBrief(user_id):
    1. Get today's deadlines (due today, at risk, overdue)
    2. Get this week's capacity vs. allocation
    3. Get active workflows awaiting action
    4. Prioritize: overdue > due today > at risk > due this week > due next week
    5. Include: cross-deadline dependencies ("Finishing X unblocks Y")
    6. Return structured brief for dashboard
```

**Urgency Scoring:**
```
urgency_score = (
  (1 / days_until_due) * 10                    -- Time pressure (exponential as deadline approaches)
  + dependency_chain_length * 2                -- More things blocked = more urgent
  + priority_weight                            -- critical=10, high=7, medium=4, low=1
  + (is_regulatory ? 5 : 0)                   -- Regulatory deadlines get extra weight
  - (buffer_days_remaining * 0.5)             -- Buffer reduces urgency
)
```

### Key Components

```
src/features/time-intelligence/
├── DeadlineManager.tsx              — CRUD for deadlines with dependency graph
├── DeadlineTimeline.tsx             — Visual timeline with Gantt-like view
├── CapacityPlanner.tsx              — Week-by-week capacity vs. allocation
├── ConflictResolver.tsx             — Shows conflicts with resolution suggestions
├── RhythmDetector.tsx               — Review and approve detected patterns
├── MorningBrief.tsx                 — Daily priority dashboard
├── UrgencyRanker.tsx                — Ranked task list by true urgency
└── ContextSwitchOptimizer.tsx       — Groups related tasks for batch processing
```

### Integration Points

- **Workflow triggers:** Deadlines can auto-trigger workflows when earliest_start is reached
- **Cross-Workflow Intelligence:** Deadline patterns become knowledge atoms; missed deadlines become risk atoms
- **Apprentice Model:** Time management becomes a tracked competency
- **Dashboard:** Morning brief is a first-class dashboard component

---

## Brief 4: Collaborative Canvas — Multi-Human Workflows

### Goal

Enable workflows where different steps are assigned to different people, with queuing, handoffs, SLA tracking, and parallel review capabilities.

### Data Model

```sql
-- Workflow step assignments
CREATE TABLE step_assignments (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  
  -- Assignment target (one of these)
  assigned_user_id TEXT,              -- Specific person
  assigned_role TEXT,                 -- Any person with this role can pick it up
  assigned_team_id TEXT,              -- Any person on this team
  
  -- SLA
  sla_hours REAL,                     -- Must complete within N hours of step becoming ready
  escalation_after_hours REAL,        -- Escalate if not picked up within N hours
  escalation_target TEXT,             -- Who to escalate to (user_id or role)
  
  -- Notifications
  notify_on_ready TEXT DEFAULT 'all', -- 'all', 'email', 'slack', 'none'
  notify_template TEXT,               -- Notification template ID
  
  UNIQUE(workflow_id, step_index)
);

-- Active task queue (runtime)
CREATE TABLE task_queue (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES workflow_executions(id),
  workflow_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  
  -- Assignment
  assigned_user_id TEXT,
  assigned_role TEXT,
  assigned_team_id TEXT,
  claimed_by TEXT,                    -- Who picked it up from the queue
  claimed_at DATETIME,
  
  -- Status
  status TEXT DEFAULT 'pending',      -- 'pending', 'claimed', 'in_progress', 'completed', 'escalated', 'reassigned'
  ready_at DATETIME NOT NULL,         -- When this task became available
  
  -- SLA tracking
  sla_deadline DATETIME,
  is_sla_breached BOOLEAN DEFAULT false,
  escalation_deadline DATETIME,
  is_escalated BOOLEAN DEFAULT false,
  
  -- Completion
  completed_at DATETIME,
  completion_data JSON,               -- Decision, notes, output reference
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_queue_status ON task_queue(status, assigned_role);
CREATE INDEX idx_queue_user ON task_queue(claimed_by, status);
CREATE INDEX idx_queue_sla ON task_queue(sla_deadline, is_sla_breached);

-- Parallel review support
CREATE TABLE parallel_reviews (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  
  -- Review configuration
  min_reviewers INTEGER DEFAULT 2,    -- How many must complete
  consensus_required BOOLEAN DEFAULT false,  -- Must all agree?
  
  -- Status
  status TEXT DEFAULT 'open',         -- 'open', 'consensus_reached', 'conflict', 'complete'
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE review_responses (
  id TEXT PRIMARY KEY,
  parallel_review_id TEXT NOT NULL REFERENCES parallel_reviews(id),
  reviewer_id TEXT NOT NULL,
  
  decision TEXT NOT NULL,
  reasoning TEXT,
  reviewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(parallel_review_id, reviewer_id)
);
```

### Core Logic

**Task Routing:**
```
Service: CollaborationService

Methods:
  routeStep(execution_id, step_index):
    1. Look up step_assignments for this workflow + step
    2. If assigned_user_id: create task_queue entry for that user, notify
    3. If assigned_role: create task_queue entry visible to all users with that role
    4. If assigned_team_id: create task_queue entry visible to all team members
    5. Calculate SLA deadline from step_assignments config
    6. Start SLA monitoring timer
    
  claimTask(task_id, user_id):
    1. Verify user has permission (correct role/team)
    2. Set claimed_by, claimed_at, status = 'in_progress'
    3. If role/team assignment: remove from others' queues (or mark claimed)
    4. Return task context (workflow state, step data, institutional memory)
    
  completeTask(task_id, decision_data):
    1. Store completion data
    2. Update task_queue status = 'completed'
    3. Check: is this a parallel review step?
       - Yes: check if min_reviewers met, check consensus
       - If conflict: route to conflict resolution (escalation_target)
    4. If complete: trigger next step in workflow
    5. Log to audit trail
    
  monitorSLAs():
    -- Runs every minute (background job)
    1. Find tasks where NOW > sla_deadline AND status != 'completed'
    2. Mark is_sla_breached = true
    3. Notify task owner + their manager
    4. Find tasks where NOW > escalation_deadline AND status == 'pending'
    5. Route to escalation_target
    6. Mark is_escalated = true
```

**Conflict Resolution for Parallel Reviews:**
```
When parallel reviewers disagree:
1. Show all reviews to a designated resolver (senior role)
2. Resolver sees: each reviewer's decision, reasoning, and the source data
3. Resolver can: pick one reviewer's decision, make a different decision, or send back for re-review
4. Resolution is logged as a special checkpoint_decision (feeds institutional memory)
```

### Key Components

```
src/features/collaboration/
├── TaskQueue.tsx                     — Personal task queue ("My pending tasks")
├── TeamQueue.tsx                     — Team-wide task queue with claim button
├── TaskDetail.tsx                    — Full context view when working a task
├── StepAssignmentEditor.tsx          — Configure who does each step (in workflow builder)
├── SLADashboard.tsx                  — SLA compliance tracking
├── ParallelReviewPanel.tsx           — Side-by-side review comparison
├── ConflictResolution.tsx            — Resolve disagreements between reviewers
├── HandoffSummary.tsx                — Auto-generated context for next person in chain
└── CollaborationTimeline.tsx         — Visual: who did what when in this execution
```

### Handoff Intelligence

When a task moves from Person A to Person B, ANTON generates a handoff summary:

```
Handoff from: [Person A, Role: FCP Investigator]
To: [Person B, Role: Senior FCP Analyst]
Workflow: FCP Alert Investigation — Alert #TM-2026-4521

Summary of what was done:
- Alert details reviewed: velocity_check rule, Customer C-123456
- Transaction analysis completed: 12-month history, 3 anomalous patterns identified
- KYC data reviewed: last update 8 months ago, stated income €45K
- AI assessment: recommends escalation (confidence 0.82)
- First-line decision: ESCALATE — reasoning: "Transaction volume inconsistent 
  with stated income, multiple new counterparties in high-risk jurisdiction"

What needs your attention:
- Validate the escalation decision
- Review the AI assessment against the transaction evidence
- If agreeing to escalate: approve SAR draft in next step

Context from institutional memory:
- Similar alerts (same rule, same segment): 34% escalated at second line
- This customer was previously reviewed 14 months ago (closed, no action)
```

### Integration Points

- **Institutional Memory:** Multi-person decisions create richer decision data (first-line + second-line + MLRO patterns)
- **Apprentice Model:** Stage 2-3 senior review naturally becomes part of collaborative workflows
- **Time Intelligence:** SLA tracking feeds into deadline/capacity planning
- **Cross-Workflow Intelligence:** Handoff patterns become knowledge atoms (bottleneck detection: "Step 8 takes 3x longer than expected because second-line reviewers are overloaded")

---

## Brief 5: Compliance-as-Code — Executable Regulatory Rules

### Goal

Define regulatory requirements as structured, executable rules that can be run against actual data to assess compliance — producing audit-ready evidence.

### Data Model

```sql
-- Regulatory sources
CREATE TABLE regulatory_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,                  -- "AMLR", "DORA", "CSRD", "PSD3"
  full_name TEXT,
  jurisdiction TEXT,                   -- "EU", "SE", "FI", "UK"
  effective_date DATE,
  source_url TEXT,
  version TEXT,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Compliance rules
CREATE TABLE compliance_rules (
  id TEXT PRIMARY KEY,
  
  -- Source reference
  source_id TEXT NOT NULL REFERENCES regulatory_sources(id),
  article_ref TEXT NOT NULL,           -- "Article 19(1)(a)", "Section 4.2.3"
  recital_refs JSON,                   -- Supporting recitals
  
  -- Rule definition
  title TEXT NOT NULL,
  description TEXT NOT NULL,           -- Plain language description
  rule_type TEXT NOT NULL,             -- 'obligation', 'prohibition', 'threshold', 'process', 'data_requirement'
  
  -- Applicability
  applies_to JSON NOT NULL,            -- Who: {"entity_types": ["credit_institution", "payment_institution"]}
  conditions JSON,                     -- When: pre-conditions for rule to apply
  
  -- The executable rule
  checks JSON NOT NULL,                -- Array of check definitions (see below)
  
  -- Evidence requirements
  evidence_requirements JSON,          -- What evidence proves compliance
  
  -- Metadata
  severity TEXT DEFAULT 'mandatory',   -- 'mandatory', 'should', 'may', 'best_practice'
  effective_from DATE,
  effective_until DATE,
  superseded_by TEXT,
  
  -- Lifecycle
  status TEXT DEFAULT 'draft',         -- 'draft', 'review', 'active', 'superseded', 'archived'
  created_by TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at DATETIME,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Check definitions within a rule
-- Stored as JSON in compliance_rules.checks, structured as:
/*
{
  "checks": [
    {
      "check_id": "cdd_threshold_check",
      "description": "Verify CDD is performed for occasional transactions >= 10,000 EUR",
      "check_type": "data_query",       -- 'data_query', 'document_exists', 'process_evidence', 'manual_attestation'
      "query": {
        "connection_ref": "core_banking",
        "logic": "SELECT count(*) FROM transactions t LEFT JOIN cdd_records c ON t.customer_id = c.customer_id WHERE t.amount >= 10000 AND t.relationship_type = 'occasional' AND c.id IS NULL",
        "expected": "result == 0",
        "failure_meaning": "Occasional transactions >= 10,000 EUR found without CDD"
      },
      "remediation_guidance": "Review CDD procedures for occasional transaction threshold monitoring",
      "evidence_output": "List of transactions with/without CDD, completion rate percentage"
    },
    {
      "check_id": "cdd_policy_exists",
      "description": "CDD policy document exists and covers occasional transactions",
      "check_type": "document_exists",
      "query": {
        "connection_ref": "document_management",
        "search": "CDD policy occasional transactions",
        "expected": "result.count > 0 AND result.latest_update < 365 days ago"
      }
    },
    {
      "check_id": "cdd_training_current",
      "description": "Staff training on CDD procedures is current",
      "check_type": "manual_attestation",
      "question": "Has CDD training covering occasional transaction thresholds been delivered to all relevant staff in the last 12 months?",
      "evidence_request": "Training records, attendance lists, completion certificates"
    }
  ]
}
*/

-- Compliance assessment results
CREATE TABLE compliance_assessments (
  id TEXT PRIMARY KEY,
  
  -- Scope
  assessment_name TEXT NOT NULL,
  source_id TEXT,                       -- Assess against specific regulation, or NULL for all
  assessment_date DATE NOT NULL,
  assessed_by TEXT NOT NULL,
  
  -- Results
  total_rules INTEGER,
  compliant_count INTEGER,
  non_compliant_count INTEGER,
  partial_count INTEGER,
  not_assessed_count INTEGER,
  compliance_percentage REAL,
  
  -- Status
  status TEXT DEFAULT 'in_progress',    -- 'in_progress', 'completed', 'reviewed', 'submitted'
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Individual rule results
CREATE TABLE compliance_check_results (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES compliance_assessments(id),
  rule_id TEXT NOT NULL REFERENCES compliance_rules(id),
  check_id TEXT NOT NULL,               -- Which check within the rule
  
  result TEXT NOT NULL,                 -- 'compliant', 'non_compliant', 'partial', 'not_assessed', 'not_applicable'
  evidence JSON,                        -- Collected evidence (query results, documents, attestations)
  notes TEXT,
  
  -- If non-compliant
  gap_description TEXT,
  remediation_plan TEXT,
  remediation_deadline DATE,
  remediation_owner TEXT,
  
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Core Logic

**Rule Execution Engine:**
```
Service: ComplianceRuleEngine

Methods:
  executeAssessment(source_id?, rule_ids?):
    1. Load applicable rules (all for source, or specific rule_ids)
    2. For each rule, for each check:
       a. check_type == 'data_query':
          - Resolve connection_ref to actual connection
          - Execute query via ConnectionExecutor
          - Evaluate result against expected condition
          - Collect evidence (query results, row counts, samples)
       b. check_type == 'document_exists':
          - Search file system or document management via connection
          - Verify document exists, check date, check relevance
       c. check_type == 'process_evidence':
          - Search workflow execution history for relevant process evidence
          - "Has this process been executed? When? Results?"
       d. check_type == 'manual_attestation':
          - Create task in task_queue for human to answer and provide evidence
          - Workflow pauses until human responds
    3. Aggregate results per rule → per assessment
    4. Generate compliance_assessment record
    5. Produce evidence package
    
  generateRulesFromRegulation(regulation_text):
    -- AI-assisted rule generation (produces DRAFT rules for human review)
    1. Parse regulation text into articles/obligations
    2. For each obligation, generate structured rule definition
    3. Mark all as status = 'draft'
    4. Present to compliance expert for review and refinement
    5. Expert adjusts: check logic, applicability, evidence requirements
    6. Once reviewed: status = 'active'
    
  impactAssessment(new_rule_ids):
    -- When new rules are added, assess impact on existing compliance state
    1. For each new rule, identify: which connections are needed, which data
    2. Check if connections exist — flag gaps
    3. Check if similar rules exist — flag overlap/conflict
    4. Estimate effort to achieve compliance (based on check complexity)
    5. Return impact report
    
  trackRemediation():
    -- Monitor progress on non-compliant items
    1. Find all non-compliant check_results with remediation_deadline
    2. Group by: overdue, due this week, due this month, future
    3. Calculate: remediation velocity (items resolved per week)
    4. Project: at current velocity, when will all items be resolved?
    5. Feed into Time Intelligence for deadline management
```

### Key Components

```
src/features/compliance-as-code/
├── RuleEditor.tsx                    — Create/edit compliance rules with structured form
├── RuleLibrary.tsx                   — Browse rules by regulation, category, status
├── AssessmentRunner.tsx              — Execute compliance assessment (real-time progress)
├── AssessmentDashboard.tsx           — Results overview: compliant/non-compliant/partial
├── EvidencePackage.tsx               — View/export collected evidence per rule
├── GapTracker.tsx                    — Track remediation of non-compliant items
├── RuleGenerator.tsx                 — AI-assisted rule creation from regulation text
├── ImpactAnalyzer.tsx                — Assess impact of new/changed rules
└── ComplianceTimeline.tsx            — Historical compliance state over time
```

### Exportable Rule Packages

Compliance rules are exportable as `.anton` packages:
```
compliance-amlr-cdd-v1.anton
├── rules/
│   ├── amlr-art19-occasional-cdd.json
│   ├── amlr-art20-enhanced-cdd.json
│   ├── amlr-art21-simplified-cdd.json
│   └── ...
├── source.json (regulatory source metadata)
├── connection-requirements.json (what connections are needed to run these rules)
└── README.md
```

This is how Advisense can package compliance expertise: "Here's our AMLR CDD compliance-as-code package. Import it into ANTON, connect your systems, and run it." Consulting productized into executable rules.

### Integration Points

- **Coworker Workflows:** Compliance assessment can be a workflow step type
- **Cross-Workflow Intelligence:** Compliance state becomes entities in the knowledge graph; trends tracked over time
- **Regulatory Radar:** New regulatory changes trigger impact assessment against existing rules
- **Institutional Memory:** Past assessment decisions and interpretive choices captured for future reference

---

## Brief 6: Living Regulatory Radar

### Goal

Continuously monitor regulatory sources for changes, classify them, assess impact against the organization's existing compliance setup, and surface actionable alerts.

### Data Model

```sql
-- Monitored regulatory sources
CREATE TABLE radar_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,                  -- "EUR-Lex AMLR", "Finansinspektionen", "EBA Guidelines"
  source_type TEXT NOT NULL,           -- 'rss', 'api', 'web_page', 'file_watch'
  url TEXT,
  check_frequency TEXT DEFAULT 'daily', -- 'hourly', 'daily', 'weekly'
  last_checked DATETIME,
  last_new_item DATETIME,
  connection_id TEXT,                  -- If using API connection
  parser_config JSON,                  -- How to extract items from source
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Detected regulatory changes
CREATE TABLE radar_items (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES radar_sources(id),
  
  -- Content
  title TEXT NOT NULL,
  summary TEXT,                        -- AI-generated summary
  original_url TEXT,
  publication_date DATE,
  full_text_ref TEXT,                  -- File path to downloaded full text
  
  -- Classification (AI-generated, human-reviewable)
  item_type TEXT,                      -- 'new_regulation', 'amendment', 'guidance', 'consultation', 'enforcement_action', 'judgment', 'opinion'
  affected_areas JSON,                 -- Which openEXPERT areas are affected
  affected_regulations JSON,           -- Which existing regulatory_sources are affected
  jurisdiction TEXT,
  urgency TEXT DEFAULT 'normal',       -- 'immediate', 'high', 'normal', 'informational'
  
  -- Impact assessment
  impact_assessment TEXT,              -- AI-generated impact analysis
  affected_rules JSON,                 -- compliance_rules IDs that may need updating
  affected_workflows JSON,             -- workflow IDs that may be impacted
  estimated_effort TEXT,               -- 'minimal', 'moderate', 'significant', 'major'
  
  -- Lifecycle
  status TEXT DEFAULT 'new',           -- 'new', 'reviewed', 'action_required', 'in_progress', 'completed', 'not_applicable'
  reviewed_by TEXT,
  reviewed_at DATETIME,
  action_plan TEXT,
  assigned_to TEXT,
  
  -- Tracking
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

CREATE INDEX idx_radar_status ON radar_items(status, urgency);
CREATE INDEX idx_radar_date ON radar_items(publication_date);
CREATE INDEX idx_radar_source ON radar_items(source_id);
```

### Core Logic

**Monitoring Pipeline:**
```
Service: RegulatoryRadarService

Pipeline (runs on schedule per source):

  Step 1: FETCH
    - Per source_type:
      - RSS: Parse feed, extract new entries since last_checked
      - API: Call endpoint, extract new items
      - Web page: Fetch page, diff against cached version, extract changes
      - File watch: Check directory for new files
    - Store raw items temporarily

  Step 2: DEDUPLICATE
    - Check against existing radar_items by: title similarity, URL, publication_date
    - Skip duplicates

  Step 3: CLASSIFY (AI-powered)
    - For each new item, AI call:
      "Classify this regulatory publication:
       Title: [title]
       Source: [source name]
       Content: [first 2000 chars or summary]
       
       Determine:
       - item_type (new_regulation, amendment, guidance, etc.)
       - affected openEXPERT areas (from list of 30)
       - jurisdiction
       - urgency (immediate if effective date < 90 days, high if < 6 months, etc.)
       - one-paragraph summary"
    - Store classification

  Step 4: IMPACT ASSESSMENT (AI-powered, uses local data)
    - For each new item with urgency >= 'normal':
      a. Load existing compliance_rules for affected regulations
      b. Load recent workflow outputs from affected areas
      c. AI call:
         "This new [item_type] affects [regulation]. 
          Here are the organization's existing compliance rules for this area: [rules]
          
          Assess:
          - Which existing rules need updating? How?
          - Are there new obligations not covered by any existing rule?
          - Which workflows might need modification?
          - Estimated effort to achieve compliance with the change.
          - Recommended timeline and priority."
      d. Store impact assessment, link to affected rules/workflows

  Step 5: NOTIFY
    - Based on urgency:
      - immediate: Push notification + email to compliance lead + dashboard alert
      - high: Email to relevant area leads + dashboard
      - normal: Dashboard only
      - informational: Weekly digest only

  Step 6: GENERATE ACTIONS
    - If impact assessment identifies affected compliance_rules:
      - Auto-create radar action items with links to rules that need review
    - If impact identifies new obligations:
      - Suggest new compliance_rules (draft status) for human review
    - If impact identifies workflow changes:
      - Flag workflows for review with specific change suggestions
```

### Key Components

```
src/features/regulatory-radar/
├── RadarDashboard.tsx                — Main view: new items, impact, actions
├── RadarSourceManager.tsx            — Configure monitored sources
├── RadarItemDetail.tsx               — Full item view with impact assessment
├── RadarTimeline.tsx                 — Chronological view of regulatory changes
├── RadarDigest.tsx                   — Weekly/monthly digest generator
├── ImpactAssessmentPanel.tsx         — Detailed impact view with affected rules/workflows
├── RadarActionTracker.tsx            — Track action items from radar findings
└── RadarSettings.tsx                 — Frequency, notification preferences, area filters
```

### Pre-Configured Source Templates

Ship with templates for common regulatory sources:

```json
{
  "templates": [
    {
      "name": "EUR-Lex — AML/CFT",
      "source_type": "web_page",
      "url": "https://eur-lex.europa.eu/search.html?...",
      "parser": "eurlex_search_results",
      "default_frequency": "daily"
    },
    {
      "name": "Finansinspektionen (Sweden)",
      "source_type": "rss",
      "url": "https://www.fi.se/en/published/...",
      "default_frequency": "daily"
    },
    {
      "name": "EBA Guidelines & Opinions",
      "source_type": "rss",
      "url": "https://www.eba.europa.eu/...",
      "default_frequency": "daily"
    },
    {
      "name": "FATF Publications",
      "source_type": "web_page",
      "url": "https://www.fatf-gafi.org/en/publications.html",
      "default_frequency": "weekly"
    },
    {
      "name": "AMLA Publications",
      "source_type": "web_page",
      "url": "https://www.amla.europa.eu/...",
      "default_frequency": "daily"
    }
  ]
}
```

### Integration Points

- **Compliance-as-Code:** Radar findings trigger impact assessments against existing rules; new obligations generate draft rules
- **Cross-Workflow Intelligence:** Regulatory changes become high-priority knowledge atoms; cascade detection can link regulatory changes to operational impacts
- **Time Intelligence:** Effective dates become deadlines with automatic propagation
- **Coworker Workflows:** "Regulatory Change Response" workflow template triggered by radar findings
- **Institutional Memory:** How the organization responded to past regulatory changes informs future responses

---

## Summary: What Claude Code Now Has

### Complete Specification Package

| Document | What It Covers | Detail Level |
|----------|---------------|-------------|
| **Coworker Engine Spec** | Workflows, connections, modules, 8 coworker templates, 150+ new modules, implementation architecture | Full |
| **Transformative Features Addendum** | Vision and rationale for 14 features, competitive positioning | Strategy + concept |
| **Cross-Workflow Intelligence Spec** | 5-layer knowledge funnel, pattern detection, knowledge graph, worked examples | Full deep-dive |
| **This document (Implementation Briefs)** | Institutional Memory, Apprentice Model, Time Intelligence, Collaborative Canvas, Compliance-as-Code, Regulatory Radar | Implementation-ready briefs |

### Features Covered (and Where)

| Feature | Primary Spec | Status |
|---------|-------------|--------|
| Coworker Workflows | Coworker Engine | Full spec |
| Connection Framework | Coworker Engine | Full spec |
| Script Library | Coworker Engine | Full spec |
| 150+ New Modules | Coworker Engine | Module list + patterns |
| Cross-Workflow Intelligence | Cross-Workflow Intelligence | Full deep-dive |
| Knowledge Graph | Cross-Workflow Intelligence | Full spec |
| Pattern Detection Engine | Cross-Workflow Intelligence | Full spec + algorithms |
| Institutional Memory | This document, Brief 1 | Implementation brief |
| Apprentice Model | This document, Brief 2 | Implementation brief |
| Time Intelligence | This document, Brief 3 | Implementation brief |
| Collaborative Canvas | This document, Brief 4 | Implementation brief |
| Compliance-as-Code | This document, Brief 5 | Implementation brief |
| Regulatory Radar | This document, Brief 6 | Implementation brief |
| Explain-It-Different | Addendum only | Simple enough — no brief needed |
| Output Versioning | Addendum only | Standard pattern — no brief needed |
| Natural Language Commands | Addendum only | AI parsing — no brief needed |
| Quality Ratchet | Addendum only | Scoring + tracking — no brief needed |
| What-If Simulator | Addendum only | Phase 3 visionary — defer |
| Personal Development | Addendum only | Analytics on existing data — defer |

### Suggested Build Order (integrated across all specs)

**Sprint 1-2:** Workflow engine foundation + Connection framework (Coworker Engine)
**Sprint 3-4:** Core integrations (file, database, API, email) + Persistent output store (Cross-Workflow Layer 1)
**Sprint 5-6:** Script runner + Knowledge atom extraction (Cross-Workflow Layer 2) + Output versioning
**Sprint 7-8:** Knowledge graph (Cross-Workflow Layer 3) + Institutional memory at checkpoints (Brief 1)
**Sprint 9-10:** Coworker templates + Explain-It-Different + Collaborative Canvas basics (Brief 4)
**Sprint 11-12:** Pattern detection engine (Cross-Workflow Layer 4) + Time Intelligence (Brief 3)
**Sprint 13-14:** Apprentice Model (Brief 2) + Quality Ratchet + Cross-Workflow Dashboard (Layer 5)
**Sprint 15-16:** Compliance-as-Code (Brief 5) + Regulatory Radar (Brief 6)
**Sprint 17-18:** Natural Language Commands + Advanced collaborative features + Polish
**Sprint 19-20:** What-If Simulator + Personal Development Tracker + Optimization

---

*Implementation Briefs for Transformative Features*
*Created: February 19, 2026*
*Author: Daniel Bardun / Claude*
*Project: openEXPERT by ANTON — FutureChain AB*
*Dependencies: All three previous specification documents*
