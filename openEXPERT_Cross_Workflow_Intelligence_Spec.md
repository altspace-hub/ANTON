# openEXPERT by ANTON — Cross-Workflow Intelligence & Knowledge Funnel

## Technical Specification for Claude Code

---

## 1. The Big Picture — How Information Flows

Every workflow step in ANTON already produces output. Right now, that output lives inside its workflow execution context and dies when the workflow completes. The insight is: **that output is organizational intelligence waiting to be connected.**

The architecture has five layers, forming a funnel from raw data to actionable insight:

```
Layer 5: ACTIONABLE INTELLIGENCE
         "Your FCP alert volume correlates with the product 
          change deployed last Tuesday. Consider pausing rollout."
                              ▲
                              │
Layer 4: CROSS-WORKFLOW INSIGHTS
         Pattern detection across all knowledge atoms
         Correlation, anomaly, trend, dependency analysis
                              ▲
                              │
Layer 3: KNOWLEDGE GRAPH
         Entities, relationships, temporal connections
         "Customer segment X" ←→ "Product Y" ←→ "Alert rule Z"
                              ▲
                              │
Layer 2: KNOWLEDGE ATOMS
         Tagged, classified, indexed units of information
         Each has: entity refs, timestamps, area, confidence, source
                              ▲
                              │
Layer 1: RAW WORKFLOW OUTPUTS
         Every step of every workflow produces structured data
         Module outputs, API responses, query results, decisions
```

**The key design principle:** Each layer is independently useful. You don't need Layer 5 working to get value from Layer 2. The system delivers value incrementally as layers are built.

---

## 2. Layer 1 — Raw Workflow Outputs (Already Exists — Extend)

### What We Have

The workflow engine already captures output from each step in the `workflow_executions.context` JSON field. But currently it's ephemeral — used during execution and then archived.

### What We Need to Add

**Persistent Output Store:** After workflow completion, extract and persist all step outputs in a queryable format.

```sql
CREATE TABLE workflow_outputs (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES workflow_executions(id),
  workflow_id TEXT NOT NULL REFERENCES workflows(id),
  step_index INTEGER NOT NULL,
  step_type TEXT NOT NULL,
  area_id TEXT,                    -- Which expert area (if module step)
  module_id TEXT,                  -- Which module (if module step)
  connection_id TEXT,              -- Which connection used (if integration step)
  output_data JSON NOT NULL,       -- The actual output
  output_summary TEXT,             -- AI-generated one-line summary
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT NOT NULL,
  workflow_name TEXT NOT NULL,     -- Denormalized for fast queries
  step_name TEXT NOT NULL          -- Denormalized for fast queries
);

-- Index for fast lookups
CREATE INDEX idx_outputs_area ON workflow_outputs(area_id);
CREATE INDEX idx_outputs_module ON workflow_outputs(module_id);
CREATE INDEX idx_outputs_created ON workflow_outputs(created_at);
CREATE INDEX idx_outputs_workflow ON workflow_outputs(workflow_id);
```

**Checkpoint Decision Store:** Separately capture every human decision at checkpoints — this is the institutional memory foundation.

```sql
CREATE TABLE checkpoint_decisions (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  ai_recommendation TEXT,          -- What the AI suggested
  ai_confidence REAL,              -- AI's confidence (0-1)
  human_decision TEXT NOT NULL,    -- What the human chose
  human_reasoning TEXT,            -- Why (captured at checkpoint)
  is_override BOOLEAN,            -- Did human disagree with AI?
  override_category TEXT,          -- Why they overrode (dropdown + free text)
  context_snapshot JSON,           -- Relevant context at decision time
  decided_by TEXT NOT NULL,
  decided_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_decisions_workflow ON checkpoint_decisions(workflow_id);
CREATE INDEX idx_decisions_override ON checkpoint_decisions(is_override);
CREATE INDEX idx_decisions_date ON checkpoint_decisions(decided_at);
```

### Implementation Notes

- **Post-completion hook:** After every workflow execution completes (or fails), a background job extracts outputs and decisions into these tables
- **Summary generation:** For each output, run a quick AI call: "Summarize this output in one sentence" — stored in `output_summary` for fast scanning
- **Storage budget:** Raw outputs can be large (transaction data, full reports). Consider: store full output for 90 days, then compress to summary + key metrics only. Configurable per organization.

---

## 3. Layer 2 — Knowledge Atoms

### What Is a Knowledge Atom?

A knowledge atom is a **single, tagged, classified unit of information** extracted from a workflow output. It's the bridge between raw data and connected intelligence.

Think of it like this: a workflow output might be a full FCP investigation report. The knowledge atoms extracted from it might be:
- "Customer C-123456 flagged for unusual cross-border transactions"
- "Transaction pattern: sudden increase in outgoing transfers to jurisdiction X"
- "KYC review: customer's stated income inconsistent with transaction volume"
- "Decision: escalated to SAR team"
- "Risk score increased from 5 to 8"

Each of these is a discrete, meaningful piece of information that can be connected to other information from other workflows.

### Data Model

```sql
CREATE TABLE knowledge_atoms (
  id TEXT PRIMARY KEY,
  
  -- Source tracking
  source_output_id TEXT REFERENCES workflow_outputs(id),
  source_workflow_id TEXT NOT NULL,
  source_execution_id TEXT NOT NULL,
  source_area_id TEXT,
  source_module_id TEXT,
  
  -- Content
  content TEXT NOT NULL,            -- The actual knowledge (natural language)
  atom_type TEXT NOT NULL,          -- See atom type taxonomy below
  confidence REAL DEFAULT 1.0,     -- How confident are we in this (0-1)
  
  -- Classification
  category TEXT NOT NULL,           -- High-level category (see taxonomy)
  subcategory TEXT,                 -- More specific classification
  sentiment TEXT,                   -- 'positive', 'negative', 'neutral', 'warning', 'critical'
  temporal_type TEXT,               -- 'point_in_time', 'trend', 'recurring', 'permanent'
  
  -- Entity references (for knowledge graph)
  entities JSON,                    -- Array of {type, id, name} extracted entities
  
  -- Metadata
  tags JSON,                        -- Flexible tagging
  valid_from DATETIME,              -- When this knowledge became true
  valid_until DATETIME,             -- When it expires/needs review (nullable)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  superseded_by TEXT,               -- If this atom was replaced by newer info
  is_active BOOLEAN DEFAULT true
);

-- Full-text search on content
CREATE VIRTUAL TABLE knowledge_atoms_fts USING fts5(
  id, content, category, subcategory, tags,
  content='knowledge_atoms',
  content_rowid='rowid'
);

-- Entity reference index for graph queries
CREATE TABLE knowledge_entity_refs (
  atom_id TEXT NOT NULL REFERENCES knowledge_atoms(id),
  entity_type TEXT NOT NULL,        -- 'customer', 'product', 'department', 'system', 'regulation', 'person', 'project', 'vendor', etc.
  entity_id TEXT NOT NULL,          -- Identifier within that type
  entity_name TEXT,                 -- Human-readable name
  relationship TEXT,                -- 'subject_of', 'affects', 'depends_on', 'owned_by', etc.
  PRIMARY KEY (atom_id, entity_type, entity_id)
);

CREATE INDEX idx_entity_refs_entity ON knowledge_entity_refs(entity_type, entity_id);
CREATE INDEX idx_entity_refs_atom ON knowledge_entity_refs(atom_id);
CREATE INDEX idx_atoms_category ON knowledge_atoms(category);
CREATE INDEX idx_atoms_type ON knowledge_atoms(atom_type);
CREATE INDEX idx_atoms_active ON knowledge_atoms(is_active, created_at);
```

### Atom Type Taxonomy

```
atom_types:
  observation:        -- Something noticed/identified
    finding           -- "Gap identified in CDD process"
    measurement       -- "Alert volume: 342 this month"
    comparison        -- "Volume up 23% vs last month"
    anomaly           -- "Unusual pattern detected in segment X"
    correlation       -- "Alert spike correlates with product launch"
    
  decision:           -- A choice that was made
    approval          -- "SAR filing approved"
    rejection         -- "Alert closed as false positive"
    escalation        -- "Escalated to senior review"
    override          -- "Human overrode AI recommendation"
    deferral          -- "Decision postponed pending more info"
    
  action:             -- Something that was done
    creation          -- "New policy document created"
    modification      -- "Risk rating updated"
    communication     -- "Regulatory notification sent"
    assignment        -- "Task assigned to team member"
    
  risk:               -- A risk or concern
    identified        -- "New risk: vendor dependency"
    assessed          -- "Risk rated as medium-high"
    mitigated         -- "Control implemented"
    accepted          -- "Risk accepted by management"
    materialized      -- "Risk event occurred"
    
  status:             -- Current state of something
    system_health     -- "Core banking: operational"
    project_progress  -- "Sprint 5: 73% complete"
    compliance_state  -- "AMLR CDD: 85% compliant"
    performance       -- "Alert clearance time: 4.2 hours avg"
    
  recommendation:     -- A suggestion
    ai_suggestion     -- "AI recommends: upgrade TM system"
    human_suggestion  -- "Investigator suggests: deeper BO review"
    best_practice     -- "Industry standard: quarterly KYC refresh"
```

### Atom Extraction Process

**When:** After each workflow output is stored (Layer 1), a background process extracts knowledge atoms.

**How:** AI-powered extraction with structured prompting:

```
System prompt for atom extraction:

You are extracting knowledge atoms from a workflow output.
A knowledge atom is a single, discrete, meaningful piece of information.

For each atom, provide:
- content: The knowledge in one clear sentence
- atom_type: From the taxonomy [provided]
- category/subcategory: Classification
- entities: Any identifiable entities (customers, systems, products, departments, regulations, people, projects, vendors)
- sentiment: positive/negative/neutral/warning/critical
- temporal_type: Is this a point-in-time fact, a trend, something recurring, or permanent?
- confidence: How confident is this information (0-1)?
- valid_until: Does this information expire? When should it be reviewed?

Extract 3-15 atoms per output depending on complexity.
Prioritize: decisions, risks, anomalies, measurements, and status changes.
Skip: routine confirmations, boilerplate, and procedural noise.

Input: [workflow output JSON]
Area context: [which expert area produced this]
```

**Quality control:**
- Extraction runs as a quick AI call (use Haiku for speed, Sonnet for complex outputs)
- Atoms are initially created with `confidence = 0.8` (AI-extracted, not human-verified)
- When a human reviews or references an atom, confidence increases to `1.0`
- Atoms that contradict newer atoms get `superseded_by` set and `is_active = false`

---

## 4. Layer 3 — Knowledge Graph

### What Is the Knowledge Graph?

The knowledge graph is the **relationship layer** — it connects entities referenced across different knowledge atoms from different workflows, areas, and time periods.

It's not a separate database — it's a **view** built from the entity references in `knowledge_entity_refs`.

### How Entities Connect

When Workflow A (FCP investigation) produces an atom referencing "Customer C-123456" and Workflow B (KYC periodic review) produces another atom referencing the same customer, they're automatically linked through the entity reference table.

**Entity resolution:** Same entity, different references:
- "Customer C-123456" in FCP workflow
- "Account holder 123456" in banking workflow  
- "C. Smith, ID C-123456" in KYC workflow

→ All resolve to the same entity: `{type: "customer", id: "C-123456"}`

**Entity resolution strategy:**
1. **Exact match:** Same entity_type + entity_id → same entity (trivial case)
2. **Alias table:** Configurable alias mappings for known equivalent identifiers

```sql
CREATE TABLE entity_aliases (
  entity_type TEXT NOT NULL,
  primary_id TEXT NOT NULL,        -- Canonical identifier
  alias_id TEXT NOT NULL,          -- Alternative identifier
  alias_source TEXT,               -- Which system uses this alias
  PRIMARY KEY (entity_type, alias_id)
);
```

3. **AI-assisted resolution:** For ambiguous cases, flag for human confirmation: "Is 'the Compliance team' in this FCP workflow the same as 'AML Compliance' in this audit workflow?"

### Graph Queries

The graph enables queries like:

```sql
-- Find all knowledge atoms about a specific customer
SELECT ka.* FROM knowledge_atoms ka
JOIN knowledge_entity_refs ker ON ka.id = ker.atom_id
WHERE ker.entity_type = 'customer' AND ker.entity_id = 'C-123456'
ORDER BY ka.created_at DESC;

-- Find all entities connected to a specific entity (one hop)
SELECT DISTINCT ker2.entity_type, ker2.entity_id, ker2.entity_name
FROM knowledge_entity_refs ker1
JOIN knowledge_entity_refs ker2 ON ker1.atom_id = ker2.atom_id
WHERE ker1.entity_type = 'customer' AND ker1.entity_id = 'C-123456'
AND NOT (ker2.entity_type = 'customer' AND ker2.entity_id = 'C-123456');

-- Find all atoms that reference BOTH a customer AND a product
SELECT ka.* FROM knowledge_atoms ka
JOIN knowledge_entity_refs ker1 ON ka.id = ker1.atom_id
JOIN knowledge_entity_refs ker2 ON ka.id = ker2.atom_id
WHERE ker1.entity_type = 'customer' AND ker1.entity_id = 'C-123456'
AND ker2.entity_type = 'product' AND ker2.entity_id = 'crypto-custody';

-- Timeline: All atoms about an entity, chronologically
SELECT ka.content, ka.atom_type, ka.sentiment, ka.created_at, ka.source_area_id
FROM knowledge_atoms ka
JOIN knowledge_entity_refs ker ON ka.id = ker.atom_id
WHERE ker.entity_type = 'department' AND ker.entity_id = 'engineering'
ORDER BY ka.created_at ASC;
```

### Graph Visualization (UI Component)

A visual graph explorer where users can:
- Start from any entity and see all connected atoms and entities
- Filter by time period, area, atom type, sentiment
- Drill down into the source workflow output
- See temporal evolution (how knowledge about an entity changed over time)
- Highlight anomalies and patterns (from Layer 4)

```
Component: KnowledgeGraphExplorer.tsx
├── GraphCanvas (d3.js or vis.js force-directed graph)
├── EntityDetailPanel (sidebar showing all atoms for selected entity)
├── TimelineView (chronological view of atoms for an entity)
├── FilterBar (time, area, type, sentiment)
└── InsightOverlay (highlights from Layer 4 cross-workflow analysis)
```

---

## 5. Layer 4 — Cross-Workflow Pattern Detection

### This Is Where the Magic Happens

Layer 4 takes the knowledge graph and runs **pattern detection algorithms** to find connections that no individual workflow would surface.

### Pattern Types

#### 5.1 Temporal Correlation

**What:** Two or more metrics from different workflows change at the same time.

**Algorithm:**
1. Identify all measurement-type atoms with numerical values
2. Group by entity and time window (configurable: daily, weekly, monthly)
3. Compute correlation coefficients between time series from different areas
4. Flag correlations above threshold (configurable, default r > 0.7)

**Example detection:**
```
CORRELATION DETECTED (r = 0.89, p < 0.01):
├── Source A: FCP workflow → "Alert volume" (weekly)
│   Trend: +45% over last 4 weeks
├── Source B: Product workflow → "Crypto feature adoption" (weekly)
│   Trend: +62% over last 4 weeks
├── Lag: Source B leads Source A by ~1 week
└── Interpretation: "Rising crypto feature adoption may be driving 
    increased FCP alert volume. Consider: adjusting TM rules for 
    crypto transaction patterns to reduce false positives."
```

**Implementation:**

```python
# Script: temporal_correlation_detector.py
# Runs as scheduled background job (e.g., weekly)

import pandas as pd
import numpy as np
from scipy import stats

def detect_temporal_correlations(atoms_df, min_correlation=0.7, min_data_points=4):
    """
    Takes a DataFrame of measurement-type atoms with:
    - entity_id, entity_type
    - value (numeric)
    - created_at (datetime)
    - source_area_id
    
    Returns correlations between time series from DIFFERENT areas.
    """
    # Group by entity + area to create time series
    time_series = {}
    for (entity_id, area_id), group in atoms_df.groupby(['entity_id', 'source_area_id']):
        if len(group) >= min_data_points:
            ts = group.set_index('created_at')['value'].resample('W').mean()
            time_series[(entity_id, area_id)] = ts
    
    # Compare all pairs from DIFFERENT areas
    correlations = []
    keys = list(time_series.keys())
    for i in range(len(keys)):
        for j in range(i+1, len(keys)):
            if keys[i][1] != keys[j][1]:  # Different areas only
                ts_a = time_series[keys[i]]
                ts_b = time_series[keys[j]]
                # Align time indices
                aligned = pd.concat([ts_a, ts_b], axis=1).dropna()
                if len(aligned) >= min_data_points:
                    r, p = stats.pearsonr(aligned.iloc[:,0], aligned.iloc[:,1])
                    if abs(r) >= min_correlation and p < 0.05:
                        correlations.append({
                            'entity_a': keys[i],
                            'entity_b': keys[j],
                            'correlation': r,
                            'p_value': p,
                            'data_points': len(aligned),
                            'lag': detect_lag(aligned)  # Cross-correlation for lag
                        })
    
    return correlations
```

#### 5.2 Entity Convergence

**What:** Multiple independent workflows mention the same entity within a short time window, especially with escalating sentiment.

**Algorithm:**
1. Group atoms by entity_id within a rolling time window (e.g., 7 days)
2. Count distinct source workflows referencing each entity
3. Flag entities referenced by 3+ different workflows within the window
4. Rank by: number of distinct workflows × sentiment severity

**Example detection:**
```
ENTITY CONVERGENCE: "Engineering Department"
Time window: Last 7 days
├── FCP workflow: "System downtime caused 12-hour gap in TM monitoring"
│   Sentiment: critical | Area: FCP
├── HR workflow: "3 resignations submitted in Engineering this month"  
│   Sentiment: warning | Area: HR
├── Project workflow: "Sprint velocity declined 35% — 4 stories carried over"
│   Sentiment: negative | Area: Project Management
├── IT Ops workflow: "Database response time degraded — p99 up 300ms"
│   Sentiment: warning | Area: Cybersecurity
│
└── INSIGHT: "Engineering department showing stress signals across 
    4 independent workflows. The combination of attrition (HR), 
    declining velocity (PM), system performance issues (IT), and 
    operational impact (FCP) suggests a systemic issue that no 
    single function would surface alone. Recommend: leadership 
    intervention, root cause analysis across all four dimensions."
```

#### 5.3 Cascade Detection

**What:** An event in one workflow creates a chain of effects visible in other workflows.

**Algorithm:**
1. Identify significant events (decisions, status changes, anomalies) 
2. For each event, search for related atoms appearing in OTHER workflows within a configurable follow-on window (e.g., 1-30 days after)
3. Score the causal likelihood using: temporal proximity, entity overlap, semantic similarity, and historical pattern matching

**Example detection:**
```
CASCADE DETECTED:
├── Root event: Product workflow (Day 0)
│   "New payment processing feature deployed to production"
│
├── Effect 1: Customer Support workflow (Day 2)
│   "Ticket volume increased 180% — category: payment errors"
│   Link: Same product entity, 2-day lag, high confidence
│
├── Effect 2: FCP workflow (Day 3)  
│   "Unusual transaction pattern alerts spiked in segment 'SME'"
│   Link: Same customer segment, payment-related, 3-day lag
│
├── Effect 3: Finance workflow (Day 7)
│   "Refund volume up 340% — payment processing category"
│   Link: Same product, financial impact, 7-day lag
│
└── INSIGHT: "The payment feature deployment on [date] has cascaded 
    into support, compliance, and financial impacts. Recommend: 
    immediate product review, consider rollback, coordinate response 
    across Support (ticket handling), FCP (alert tuning), and 
    Finance (refund processing)."
```

#### 5.4 Trend Divergence

**What:** An entity's trajectory in one workflow diverges from its trajectory in another workflow — suggesting inconsistency or hidden problems.

**Example:**
```
TREND DIVERGENCE: "Client Segment: Premium"
├── Sales workflow trend: "Premium client revenue growing 12% QoQ"
│   Direction: positive, sustained
├── Customer Support trend: "Premium client NPS declining from 72 to 58"
│   Direction: negative, accelerating
│
└── INSIGHT: "Premium client segment shows contradictory signals — 
    revenue is growing while satisfaction is declining. This pattern 
    often precedes client churn. The revenue growth may be masking 
    relationship deterioration. Recommend: customer success deep-dive 
    before renewal season."
```

#### 5.5 Gap Detection

**What:** An entity or topic appears heavily in some areas but is absent from areas where it should appear.

**Example:**
```
GAP DETECTED: "AMLR Implementation"
├── Active in: FCP (47 atoms), Legal (23 atoms), Project Management (18 atoms)
├── Expected but absent: HR (0 atoms — no workforce planning for AMLR)
├── Expected but absent: Training (0 atoms — no training content for new requirements)
├── Expected but absent: Data (2 atoms only — minimal data quality assessment)
│
└── INSIGHT: "AMLR implementation is progressing in compliance and 
    legal but appears to lack supporting workstreams in HR (staffing), 
    Training (capability building), and Data (data readiness). These 
    gaps often become critical bottlenecks in months 6-12 of 
    implementation programmes."
```

### Pattern Detection Engine

```python
# Architecture for the pattern detection engine

class PatternDetectionEngine:
    """
    Runs periodically (configurable: daily, weekly, on-demand).
    Analyzes knowledge atoms across all workflows.
    Produces CrossWorkflowInsight objects.
    """
    
    def __init__(self, db_connection, config):
        self.db = db_connection
        self.config = config
        self.detectors = [
            TemporalCorrelationDetector(config),
            EntityConvergenceDetector(config),
            CascadeDetector(config),
            TrendDivergenceDetector(config),
            GapDetector(config),
        ]
    
    def run_detection(self, time_window_days=30):
        """Run all detectors and produce insights."""
        atoms = self.db.get_active_atoms(since_days=time_window_days)
        entities = self.db.get_entity_refs(atom_ids=[a.id for a in atoms])
        
        raw_patterns = []
        for detector in self.detectors:
            patterns = detector.detect(atoms, entities)
            raw_patterns.extend(patterns)
        
        # Deduplicate and rank
        ranked = self.rank_patterns(raw_patterns)
        
        # Generate natural language insights using AI
        insights = self.generate_insights(ranked)
        
        # Store
        for insight in insights:
            self.db.store_insight(insight)
        
        return insights
    
    def rank_patterns(self, patterns):
        """
        Rank by: severity × confidence × novelty
        - severity: how impactful is this pattern?
        - confidence: how strong is the statistical evidence?
        - novelty: has this pattern been surfaced before?
        """
        for pattern in patterns:
            pattern.score = (
                pattern.severity * 
                pattern.confidence * 
                self.novelty_score(pattern)
            )
        return sorted(patterns, key=lambda p: p.score, reverse=True)
    
    def generate_insights(self, patterns):
        """
        For top-N patterns, generate natural language insight
        using AI with full context.
        """
        insights = []
        for pattern in patterns[:self.config.max_insights_per_run]:
            prompt = self.build_insight_prompt(pattern)
            insight_text = self.ai_client.generate(prompt)
            insights.append(CrossWorkflowInsight(
                pattern=pattern,
                insight=insight_text,
                evidence=pattern.source_atoms,
                recommended_actions=self.extract_actions(insight_text),
                severity=pattern.severity,
                confidence=pattern.confidence,
            ))
        return insights
```

### Insight Storage

```sql
CREATE TABLE cross_workflow_insights (
  id TEXT PRIMARY KEY,
  pattern_type TEXT NOT NULL,        -- 'temporal_correlation', 'entity_convergence', etc.
  severity TEXT NOT NULL,            -- 'critical', 'high', 'medium', 'low', 'info'
  confidence REAL NOT NULL,          -- 0-1
  score REAL NOT NULL,               -- Composite ranking score
  
  insight_text TEXT NOT NULL,        -- AI-generated natural language insight
  evidence JSON NOT NULL,            -- Array of atom IDs that support this insight
  recommended_actions JSON,          -- Suggested next steps
  
  -- Entities involved
  primary_entities JSON NOT NULL,    -- Main entities in the pattern
  source_areas JSON NOT NULL,        -- Which areas contributed
  source_workflows JSON NOT NULL,    -- Which workflows contributed
  
  -- Lifecycle
  status TEXT DEFAULT 'new',         -- 'new', 'acknowledged', 'investigating', 'resolved', 'dismissed'
  acknowledged_by TEXT,
  acknowledged_at DATETIME,
  resolution_notes TEXT,
  
  -- Metadata
  detection_run_id TEXT,             -- Which detection run produced this
  supersedes TEXT,                   -- If this updates a previous insight
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME               -- When to auto-archive if not acted on
);

CREATE INDEX idx_insights_status ON cross_workflow_insights(status, severity);
CREATE INDEX idx_insights_score ON cross_workflow_insights(score DESC);
CREATE INDEX idx_insights_created ON cross_workflow_insights(created_at);
```

---

## 6. Layer 5 — Actionable Intelligence (The Dashboard)

### Insight Dashboard UI

The Cross-Workflow Intelligence dashboard is where everything comes together. It's the "super-user overview" Daniel described — a single view that shows connected intelligence across all workflows and areas.

```
Component: CrossWorkflowDashboard.tsx
├── InsightFeed
│   ├── Priority-ranked list of active insights
│   ├── Each card shows: pattern type icon, severity badge, 
│   │   insight summary, contributing areas, recommended actions
│   ├── Click to expand: full evidence chain, entity graph, 
│   │   timeline, source workflow links
│   └── Actions: Acknowledge, Investigate, Dismiss, Create workflow
│
├── EntityHeatMap
│   ├── Grid of entities × areas
│   ├── Color intensity = number of atoms (activity level)
│   ├── Red highlights = negative sentiment clusters
│   ├── Click cell = show atoms for that entity × area combination
│   └── Gap detection overlay: gray cells where activity is expected but absent
│
├── TemporalView
│   ├── Timeline showing all insights chronologically
│   ├── Overlay: workflow executions, decisions, events
│   ├── Zoom: day / week / month / quarter
│   ├── Filter by area, entity, severity
│   └── Cascade visualization: root event → downstream effects
│
├── KnowledgeGraphExplorer
│   ├── Interactive force-directed graph
│   ├── Nodes = entities (sized by atom count)
│   ├── Edges = co-occurrence in knowledge atoms
│   ├── Color = area origin (multi-color for cross-area entities)
│   ├── Click node = show all atoms, insights, workflows for entity
│   └── Cluster detection: groups of tightly connected entities
│
├── TrendDashboard
│   ├── Key metrics tracked across workflows
│   ├── Trend lines with divergence alerts
│   ├── Comparison: this period vs. last period vs. target
│   └── Drill-down to source atoms and workflows
│
└── SettingsPanel
    ├── Detection frequency (daily / weekly / on-demand)
    ├── Sensitivity thresholds per pattern type
    ├── Notification preferences (which severities trigger alerts)
    ├── Visibility scope (my workflows / my team / my department / organization)
    └── Data retention settings
```

### Access Levels

The cross-workflow intelligence is scoped by role:

| Role | What They See |
|------|--------------|
| Individual user | Insights from their own workflows only |
| Team lead | Insights from all team members' workflows |
| Department head | Insights from all workflows in their department + cross-department patterns involving their department |
| C-suite / CISO / MLRO | Everything — full organizational cross-workflow intelligence |
| Admin | Everything + configuration + detection engine settings |

### Notification Integration

When a critical or high-severity insight is detected:
1. Dashboard badge updates in real-time
2. Email notification to configured recipients (based on severity + area)
3. Slack/Teams notification (if connection configured)
4. Optionally: auto-create a workflow to investigate the insight

---

## 7. The Information Funnel in Practice — Worked Examples

### Example A: How a Product Change Becomes an FCP Alert

**Day 0:** Product team runs their deployment workflow. Step output: "Version 2.4 deployed — includes instant payment feature for business accounts."

**Layer 1:** Output stored in workflow_outputs.

**Layer 2:** Atom extracted: `{type: "action.creation", content: "Instant payment feature deployed for business accounts", entities: [{type: "product", id: "instant-payments"}, {type: "segment", id: "business-accounts"}]}`

**Day 3:** FCP team runs alert triage workflow. Step output: "Alert volume for business account segment up 67% — rule 'velocity_check' triggered 89 times in 48 hours."

**Layer 2:** Atom extracted: `{type: "observation.anomaly", content: "Alert volume for business accounts up 67% in 48 hours", entities: [{type: "segment", id: "business-accounts"}, {type: "system", id: "tm-velocity-check"}], sentiment: "warning"}`

**Day 5:** Customer support runs ticket triage workflow. Step output: "12 tickets from business account holders reporting duplicate payments."

**Layer 2:** Atom extracted: `{type: "observation.finding", content: "Business account holders reporting duplicate payments — 12 tickets", entities: [{type: "segment", id: "business-accounts"}, {type: "product", id: "instant-payments"}], sentiment: "negative"}`

**Weekly detection run (Day 7):**

**Layer 3 (Knowledge Graph):** Entity "business-accounts" now has atoms from 3 different workflows. Entity "instant-payments" has atoms from 2 workflows.

**Layer 4 (Pattern Detection):**
- **Entity Convergence:** "business-accounts" referenced by 3 workflows within 7 days (threshold: 3). Sentiment trending negative.
- **Cascade Detection:** Product deployment (Day 0) → FCP alerts (Day 3, 3-day lag) → Support tickets (Day 5, 5-day lag). All share entity "business-accounts."
- **Temporal Correlation:** Alert volume increase temporally correlated with product deployment.

**Layer 5 (Insight):**
```
CRITICAL INSIGHT: Cross-Functional Product Impact

The instant payment feature deployed on [date] is causing cascade 
effects across three functions:

1. FCP: Alert volume for business accounts increased 67% due to 
   TM velocity checks triggering on the new payment type (likely 
   false positives — the TM rules weren't updated for instant payments)

2. Customer Support: 12 duplicate payment reports from business 
   account holders (possible bug in the instant payment feature)

3. Product: No post-deployment monitoring workflow detected 
   (Gap Detection: product area has no atoms after deployment)

Recommended actions:
→ URGENT: Product team to investigate duplicate payment bug
→ FCP team: Tune velocity_check rule to account for instant 
  payment characteristics — most alerts are likely false positives
→ CS team: Prepare standard response template for affected customers
→ Process improvement: Add post-deployment monitoring step to 
  product deployment workflow

Confidence: HIGH (3 independent data sources, strong temporal correlation)
```

### Example B: Silent Organizational Stress

This example shows how **no single workflow would surface the problem**, but the cross-workflow intelligence does.

**HR workflow (weekly):** Routine processing. Atoms extracted over 3 months:
- "2 resignations in Engineering — January" (status, neutral)
- "3 resignations in Engineering — February" (status, warning)
- "1 open position unfilled for 60+ days" (observation, warning)

**Project Management workflow (weekly):** Sprint reports.
- "Sprint velocity: 45 points (target: 60) — Week 4" (measurement)
- "Sprint velocity: 38 points (target: 60) — Week 8" (measurement, negative)
- "3 stories carried over for third consecutive sprint" (observation, warning)

**IT Ops workflow (daily):** Morning health checks.
- "Deployment frequency: 2/week (was 5/week 3 months ago)" (measurement)
- "Mean time to recovery: 8 hours (was 2 hours 3 months ago)" (measurement, warning)
- "3 P2 incidents unresolved for 5+ days" (status, warning)

**Customer Support workflow (weekly):** Ticket triage.
- "Bug-related tickets from Product X up 140% QoQ" (observation, negative)

**Individual workflows see:** Each function sees their own trend and manages it locally. HR posts job ads. PM adjusts sprint goals. IT Ops escalates incidents. CS handles tickets.

**Cross-workflow intelligence sees:**
```
HIGH INSIGHT: Engineering Department — Systemic Stress Pattern

Four independent workflows show converging negative signals for 
the Engineering department over the past 3 months:

HR: Accelerating attrition (2 → 3 resignations/month) with 
    unfilled positions
PM: Sprint velocity declining steadily (45 → 38, target 60)
IT Ops: Deployment frequency dropped 60%, incident resolution 
    time increased 300%
CS: Bug-related customer complaints up 140%

These signals individually appear manageable. Together, they 
suggest a department under severe stress where:
- Knowledge is leaving (attrition)
- Remaining team is overloaded (declining velocity)
- Quality is dropping (more bugs, slower fixes)
- Customer impact is growing (rising complaints)

This pattern typically escalates unless addressed at the 
systemic level. Individual function-level responses (hiring, 
sprint adjustments, incident management) are necessary but 
insufficient.

Recommended actions:
→ Leadership intervention: cross-functional review of 
  Engineering capacity and morale
→ Immediate: reduce work-in-progress, pause non-critical projects
→ Short-term: accelerate hiring, consider contractors
→ Medium-term: root cause analysis on attrition drivers
→ Track: Set up weekly convergence monitoring for this entity

Contributing workflows: HR-weekly-2026-W04 through W12, 
PM-sprint-5 through PM-sprint-12, OPS-daily-2026-01 through 
OPS-daily-2026-03, CS-weekly-2026-W04 through W12
```

---

## 8. Implementation Plan — Phased Delivery

### Phase A: Foundation (Build with Coworker Engine — Sprint 1-2)

**What to build:**
1. `workflow_outputs` table + post-completion extraction hook
2. `checkpoint_decisions` table + capture at every checkpoint
3. Output summary generation (quick AI call per output)
4. Basic search/browse UI for historical outputs

**Why first:** This is pure data capture. No intelligence yet, but it creates the data foundation everything else needs. Every workflow execution from this point forward contributes to the knowledge base.

### Phase B: Knowledge Atoms (Sprint 3-4)

**What to build:**
1. `knowledge_atoms` table + FTS index
2. `knowledge_entity_refs` table
3. Atom extraction pipeline (AI-powered, runs as background job after output storage)
4. Entity type taxonomy configuration
5. Basic atom browser UI (search, filter, timeline)
6. Entity alias management

**Why second:** Transforms raw outputs into structured, queryable intelligence. Users can now search "show me everything ANTON knows about Customer C-123456" across all workflows.

### Phase C: Knowledge Graph (Sprint 5-6)

**What to build:**
1. Entity resolution service (exact + alias matching)
2. Graph query API (entity detail, connections, timeline)
3. Knowledge Graph Explorer UI component (force-directed graph visualization)
4. Entity detail panel (all atoms for an entity, across all workflows)
5. Entity timeline view

**Why third:** Makes the connections visible. Users can explore how entities relate across areas. This is already valuable without pattern detection — it's the "show me everything connected to X" capability.

### Phase D: Pattern Detection (Sprint 7-9)

**What to build:**
1. Detection engine framework (pluggable detector architecture)
2. Temporal Correlation detector
3. Entity Convergence detector
4. Cascade detector
5. Trend Divergence detector
6. Gap detector
7. Insight generation (AI-powered, produces natural language from patterns)
8. `cross_workflow_insights` table
9. Detection scheduler (configurable frequency)
10. Insight notification pipeline

**Why fourth:** This is the intelligence layer. It requires meaningful data volume to work (Phases A-C need to have been running for weeks/months). Build the detectors incrementally — each one is independently valuable.

### Phase E: Dashboard & Actions (Sprint 10-11)

**What to build:**
1. Cross-Workflow Intelligence Dashboard (main view)
2. Insight Feed component
3. Entity Heat Map component
4. Temporal View component
5. Trend Dashboard component
6. Role-based access control for insights
7. Insight lifecycle management (acknowledge, investigate, resolve, dismiss)
8. "Create workflow from insight" action
9. Insight-to-report export

**Why last:** The presentation layer. Everything underneath needs to be working before this makes sense. But once it's there, it's the single most impressive feature in the product.

---

## 9. Performance & Scaling Considerations

### Data Volume Estimates

For a mid-size organization with 50 active ANTON users:
- ~200 workflow executions per week
- ~1,000 outputs stored per week
- ~5,000-10,000 knowledge atoms extracted per week
- ~20,000-50,000 entity references per week
- ~260,000-520,000 knowledge atoms per year

**SQLite can handle this** for single-deployment/local installations. The FTS index on knowledge_atoms keeps search fast. For larger deployments (500+ users), consider PostgreSQL migration (already in the roadmap).

### Detection Engine Performance

- Temporal correlation: O(n²) pairwise comparison of time series. With 50 tracked metrics, ~1,225 pairs. Runs in seconds.
- Entity convergence: Single pass over recent atoms grouped by entity. O(n) where n = atoms in time window. Fast.
- Cascade detection: For each significant event, search for related atoms. O(e × n) where e = events, n = candidate atoms. Use time window + entity filtering to keep n small.
- Full detection run on 1 year of data: estimated <60 seconds on modern hardware.

### Storage

- Knowledge atoms: ~500 bytes average per atom → 260K atoms ≈ 130 MB/year
- Entity refs: ~100 bytes average → 520K refs ≈ 52 MB/year  
- Insights: ~2 KB average, ~50-100 per week → ~10 MB/year
- **Total: ~200 MB/year for a 50-user deployment.** Negligible.

---

## 10. Security & Privacy

### Data Boundaries

- All cross-workflow intelligence stays within the local deployment
- No data leaves the organization's infrastructure
- Entity resolution and pattern detection run entirely locally
- AI calls for atom extraction and insight generation use the same Claude API configuration as the rest of ANTON (can be air-gapped with file-based exchange)

### Access Control

- Knowledge atoms inherit visibility from their source workflow
- Cross-workflow insights are visible based on the most restrictive source
- Example: If an insight combines atoms from an HR workflow (HR team only) and an FCP workflow (compliance team only), the insight is visible only to users with access to BOTH areas
- Configurable override: organization admin can grant cross-functional insight access to specific roles (e.g., CISO, COO, CEO)

### Sensitive Data Handling

- Knowledge atoms never contain raw PII — extraction prompts explicitly exclude personal data
- Entity references use identifiers, not names (Customer C-123456, not "John Smith")
- Insight generation uses anonymized references where possible
- Full audit trail of who viewed which insights and when

---

## 11. How This Connects to Everything Else

### Feeds Into: Institutional Memory (Addendum §1)

Knowledge atoms ARE institutional memory. The checkpoint decisions table IS the decision pattern tracking. Layer 3 (Knowledge Graph) provides the contextual recall. This spec is the technical implementation of the institutional memory concept.

### Feeds Into: Apprentice Model (Addendum §2)

When an apprentice is working through a workflow, the knowledge graph provides context: "Here's what senior colleagues have encountered in similar situations." The institutional memory from checkpoint decisions provides calibration: "68% of investigators close this type of alert as false positive."

### Feeds Into: What-If Simulator (Addendum §3)

The knowledge graph provides the base reality for simulations. "If I close this alert, what's likely to happen?" can be answered by querying historical patterns from the knowledge graph.

### Feeds Into: Quality Ratchet (Addendum §6)

Output quality scores become measurement atoms in the knowledge graph. Quality trends become detectable patterns. Regression detection uses the same temporal analysis engine.

### Feeds Into: Regulatory Radar (Addendum §10)

New regulatory changes become entities in the knowledge graph. Impact assessment uses gap detection to identify which existing compliance rules and workflows are affected.

### Feeds Into: Compliance-as-Code (Addendum §8)

Compliance rules reference entities. Execution results become knowledge atoms. Compliance state is a first-class entity in the knowledge graph, trackable over time and across workflows.

---

*Technical specification for Cross-Workflow Intelligence*
*Created: February 19, 2026*
*Author: Daniel Bardun / Claude*
*Project: openEXPERT by ANTON — FutureChain AB*
*Dependencies: openEXPERT_Coworker_Engine_Spec.md, openEXPERT_Transformative_Features_Addendum.md*
