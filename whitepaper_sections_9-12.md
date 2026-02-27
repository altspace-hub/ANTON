## PART 3: INTELLIGENCE & MEMORY SYSTEMS

## 9. Cross-Workflow Intelligence (5-Layer Funnel)

Most AI tools treat every session as isolated. openEXPERT **learns from all your work** and detects patterns across workflows.

### The Vision

Imagine you've run 50 gap analyses over 6 months across different clients. Each analysis identified gaps, recommended controls, and set priorities. But the insights stayed trapped in individual reports.

**What if the system could:**
- Extract every fact, insight, and recommendation into a searchable knowledge base
- Map all entities mentioned (clients, regulations, controls, risks)
- Detect patterns: "Control X always scores 'green' but Control Y always scores 'red' — why?"
- Alert you: "This client has the same gap as 3 other clients — there's a common industry issue"

**That's Cross-Workflow Intelligence.**

---

### The 5-Layer Funnel

#### Layer 1: Raw Workflow Outputs

**What:** Every session output stored in `workflow_outputs` table

**Capture:**
- Full Markdown output
- Module used
- Timestamp
- Associated workflow (if part of multi-step process)

**Purpose:** Persistent record of all AI-generated work

---

#### Layer 2: Knowledge Atoms

**What:** Discrete units of knowledge extracted from outputs

**Examples:**
- **Fact:** "AMLR Article 4 requires risk assessment reviews annually"
- **Insight:** "Control TM-001 flagged false positives in 80% of test cases"
- **Conclusion:** "Client lacks documented risk appetite for sanctions exposure"
- **Recommendation:** "Implement quarterly control effectiveness reviews"
- **Risk:** "Lack of TM tuning may result in regulatory criticism"

**Extraction Method:**
- AI-powered extraction (Claude analyzes output, identifies atoms)
- Each atom categorized (fact, insight, conclusion, recommendation, risk, control, requirement, gap, decision)
- Confidence score (0-1)
- Temporal validity (permanent, date range, superseded)

**Storage:** `knowledge_atoms` table

**Purpose:** Build searchable knowledge base

---

#### Layer 3: Knowledge Graph

**What:** Map all entities and their relationships

**Entities (Nodes):**
- Clients ("Nordea", "SEB", "Handelsbanken")
- Regulations ("AMLR Article 4", "6AMLD Article 8")
- Controls ("TM-001", "KYC-EDD-PEP")
- Risks ("R-003: Sanctions Breach", "R-007: Money Laundering")
- People ("MLRO: Jane Smith", "Board Member: John Doe")
- Systems ("Transaction Monitoring System", "KYC Platform")

**Relationships (Edges):**
- "Control TM-001 **mitigates** Risk R-003"
- "AMLR Article 4 **requires** Control KYC-EDD-PEP"
- "Client Nordea **implements** Control TM-001"
- "Risk R-003 **references** AMLR Article 7"

**Relationship Strength:**
- 1.0+ = Confirmed (mentioned multiple times)
- 0.5-1.0 = Weak/inferred (mentioned once, indirect)

**Storage:**
- `entity_nodes` table (entity_type, entity_id, canonical_name, interaction_count)
- `entity_relationships` table (from_entity, to_entity, relationship_type, strength, observation_count)

**Purpose:** Enable graph queries

**Examples:**
- "Show all controls that mitigate sanctions risks"
- "Which regulations reference client X?"
- "What controls are most frequently identified as gaps?"

---

#### Layer 4: Pattern Detection

**What:** Automated detection of cross-workflow patterns

**Five Detector Types:**

##### 1. Temporal Correlation
**Detects:** Events that co-occur across workflows

**Example:**
- Pattern: "When Control X scores 'red', Control Y also scores 'red' in 85% of cases (12 workflows)"
- Insight: "Controls X and Y may share a root cause issue"
- Action: "Investigate shared dependency (same system? same process?)"

##### 2. Entity Convergence
**Detects:** Same entities appearing together repeatedly

**Example:**
- Pattern: "Entity 'High-Risk Country Z' appears in 80% of STR workflows involving Entity 'Product: Wire Transfers'"
- Insight: "Wire transfers to Country Z are a key ML/TF risk indicator"
- Action: "Consider enhanced monitoring or geo-blocking for Country Z wire transfers"

##### 3. Cascade Detection
**Detects:** Sequential patterns (A happens → B happens → C happens)

**Example:**
- Pattern: "When 'Control Review' workflow identifies a gap → 'Policy Update' workflow runs within 30 days → 'Training Delivery' workflow runs within 60 days"
- Insight: "Organization follows a consistent remediation pattern"
- Action: "Automate the cascade with a pre-built workflow template"

##### 4. Trend Divergence
**Detects:** Anomalous changes over time

**Example:**
- Pattern: "Gap analysis scores declining for 3 consecutive quarters (Q1: 8.2, Q2: 7.8, Q3: 7.1)"
- Insight: "Control effectiveness may be degrading"
- Action: "Investigate root cause — resource constraints? Process drift?"

##### 5. Gap Detection
**Detects:** Missing coverage

**Example:**
- Pattern: "40 gap analyses conducted, but only 2 mentioned 'Crypto Asset Risk' despite AMLR requirements"
- Insight: "Potential blind spot in risk assessment process"
- Action: "Update gap analysis templates to include crypto asset section"

**Storage:** `detected_patterns` table

**Severity Levels:**
- **Critical:** Requires immediate action (regulatory risk, control failure)
- **Warning:** Should be addressed (inefficiency, inconsistency)
- **Info:** Informational (interesting trend, no action required)
- **Positive:** Good practice detected (consistent quality, effective process)

**Resolution Workflow:**
- Status: active → investigating → resolved/dismissed
- Resolution notes captured
- Patterns can be dismissed if false positive

---

#### Layer 5: Actionable Intelligence Dashboard

**What:** Surface insights to users

**Widgets:**

**1. Recent Patterns (last 30 days)**
- List of detected patterns with severity badges
- Click to view evidence (which workflows, which entities, metrics)

**2. Entity Activity Heatmap**
- Which entities are mentioned most frequently?
- Trending entities (mentioned more this month vs. last month)

**3. Knowledge Growth Metrics**
- Atoms extracted per day
- Patterns detected per week
- Graph density (node count, edge count)

**4. Insight Alerts**
- Critical patterns requiring attention
- Trend warnings
- Gap notifications

**Example Dashboard View:**
```
┌────────────────────────────────────────────────────────────┐
│ Cross-Workflow Intelligence Dashboard                     │
├────────────────────────────────────────────────────────────┤
│ 📊 Last 30 Days                                           │
│   • 847 knowledge atoms extracted                         │
│   • 12 patterns detected (2 critical, 5 warning, 5 info)  │
│   • 156 entities tracked across 23 workflows              │
├────────────────────────────────────────────────────────────┤
│ 🚨 Critical Patterns                                       │
│   ⚠️ Temporal Correlation: Controls X & Y fail together   │
│       Observed in 8/10 audits → Investigate shared system │
│   ⚠️ Trend Divergence: Quality scores declining           │
│       Q1: 8.2 → Q2: 7.8 → Q3: 7.1 → Review process        │
├────────────────────────────────────────────────────────────┤
│ 📈 Trending Entities                                       │
│   • "AMLR Article 4" ↑ 240% mentions this month           │
│   • "Control TM-001" ↓ 60% mentions (less frequent testing)|
│   • "Client Nordea" ↑ New client, 5 workflows this week   │
├────────────────────────────────────────────────────────────┤
│ 🔍 Knowledge Graph: 3,247 entities, 8,962 relationships   │
│   Top Connected: "AMLR Article 4" (89 relationships)      │
│   Most Active: "Control TM-001" (156 mentions)            │
└────────────────────────────────────────────────────────────┘
```

**Benefit:** Turn isolated analyses into organizational intelligence

---

### Use Cases

#### 1. Quality Assurance
**Scenario:** Audit team wants to ensure consistency across client engagements

**Query:** "Show all gap analyses from last quarter — are we consistently identifying the same regulatory requirements?"

**Insight:** Pattern detection reveals 3 analysts systematically miss AMLR Article 12 (Beneficial Ownership)

**Action:** Update training materials, add Article 12 to gap analysis checklist

---

#### 2. Risk Identification
**Scenario:** MLRO wants to identify emerging ML/TF risks

**Query:** "Which entities are appearing more frequently in STR workflows this quarter vs. last quarter?"

**Insight:** Entity Convergence detector flags "Crypto Exchange X" in 70% of recent STRs (up from 10% last quarter)

**Action:** Initiate targeted review of all transactions involving Crypto Exchange X

---

#### 3. Efficiency Gains
**Scenario:** Consultant wants to reuse past analyses

**Query:** "Have we analyzed DORA compliance for any clients? What were the common gaps?"

**Insight:** Knowledge graph shows 4 previous DORA gap analyses, all identified the same 3 gaps (ICT risk register, incident response SLA, third-party oversight)

**Action:** Create a "DORA Gap Analysis Starter Pack" module pre-configured with common gaps

---

#### 4. Regulatory Intelligence
**Scenario:** Compliance team wants to track regulatory change impact

**Query:** "Which controls are affected by AMLR updates?"

**Insight:** Knowledge graph shows 12 controls linked to "AMLR Article 4" — all require updates

**Action:** Trigger workflow: Control Review → Policy Update → Training Delivery for all 12 controls

---

## 10. Knowledge Graph & Entity Relationships

The knowledge graph is Layer 3 of Cross-Workflow Intelligence. It maps **who, what, and how** across all your work.

### Entity Types

openEXPERT automatically extracts and classifies entities:

| Type | Examples | Purpose |
|------|----------|---------|
| **client** | "Nordea", "SEB", "Handelsbanken" | Track client-specific analyses |
| **regulation** | "AMLR Article 4", "6AMLD Article 8", "GDPR Article 35" | Map regulatory requirements |
| **control** | "TM-001", "KYC-EDD-PEP", "SAR-Filing-Process" | Track control effectiveness |
| **risk** | "R-003: Sanctions Breach", "R-007: ML Risk - Cash Intensive" | Identify risk patterns |
| **person** | "MLRO: Jane Smith", "Board Member: John Doe" | Stakeholder mapping |
| **system** | "Transaction Monitoring System", "KYC Platform" | Technical dependency tracking |
| **product** | "Wire Transfers", "Crypto Custody", "Corporate Cards" | Product risk analysis |
| **geography** | "High-Risk Country Z", "EU Jurisdiction: Sweden" | Geographical risk mapping |

### Entity Extraction

**Process:**
1. AI analyzes every workflow output
2. Identifies mentioned entities
3. Classifies by type
4. Extracts canonical name
5. Stores in `entity_nodes` table
6. Tracks interaction count (how often entity appears)

**Example:**
```
Output: "The client's Transaction Monitoring system (TM-001) failed to detect 3 out of 10 test cases involving wire transfers to High-Risk Country Z, indicating a potential gap in sanctions screening per AMLR Article 7."

Extracted Entities:
- client: "The client" (generic entity)
- control: "TM-001"
- product: "Wire Transfers"
- geography: "High-Risk Country Z"
- regulation: "AMLR Article 7"
- risk: "Sanctions screening gap" (inferred)
```

### Relationship Extraction

**Process:**
1. AI identifies relationships between entities
2. Classifies relationship type
3. Assigns strength (1.0+ = confirmed, 0.5 = weak)
4. Stores in `entity_relationships` table
5. Updates observation count when relationship seen again

**Relationship Types:**

| Type | Meaning | Example |
|------|---------|---------|
| `implements` | Entity A implements Entity B | "Client Nordea **implements** Control TM-001" |
| `mitigates` | Control mitigates Risk | "Control TM-001 **mitigates** Risk R-003" |
| `requires` | Regulation requires Control | "AMLR Article 4 **requires** Control KYC-EDD" |
| `references` | Entity references Entity | "Risk R-003 **references** AMLR Article 7" |
| `conflicts_with` | Inconsistency | "Control TM-002 **conflicts_with** Control TM-001" |
| `depends_on` | Dependency | "Control KYC-Platform **depends_on** System CRM-DB" |
| `supersedes` | Replacement | "AMLR 2024/1624 **supersedes** 4AMLD" |

**Example Graph:**
```
[Client: Nordea] --implements--> [Control: TM-001]
                                       |
                                       mitigates
                                       |
                                       v
                                  [Risk: R-003]
                                       |
                                       references
                                       |
                                       v
                                [Regulation: AMLR Article 7]
```

### Entity Consolidation (Merge Log)

**Challenge:** Same entity mentioned with different names

**Examples:**
- "Nordea", "Nordea Bank Abp", "Nordea Finland"
- "AMLR Article 4", "Art. 4 AMLR", "Regulation 2024/1624 Article 4"

**Solution:** Entity merge system

1. AI detects aliases
2. Suggests merge (manual or auto)
3. Updates all references to canonical name
4. Logs merge in `entity_merge_log` (audit trail)

**Result:** Clean, deduplicated knowledge graph

### Graph Queries

**Available Queries:**

#### 1. Subgraph Extraction
**Query:** "Show all entities connected to Control TM-001"

**Result:**
```
Control TM-001:
  - implemented_by: Client Nordea, Client SEB
  - mitigates: Risk R-003, Risk R-007
  - required_by: AMLR Article 4, 6AMLD Article 8
  - depends_on: System TM-Platform
```

#### 2. Path Finding
**Query:** "How is Client X connected to Regulation Y?"

**Result:**
```
Path: [Client Nordea] --implements--> [Control TM-001] --required_by--> [AMLR Article 4]
```

#### 3. Entity Importance Ranking
**Query:** "Which entities are most connected?"

**Result:**
```
Top 5 by relationship count:
1. AMLR Article 4 (89 relationships)
2. Control TM-001 (67 relationships)
3. Risk R-003 (45 relationships)
4. Client Nordea (34 relationships)
5. MLRO: Jane Smith (28 relationships)
```

#### 4. Relationship Strength
**Query:** "Which controls have strongest evidence of mitigating risks?"

**Result:**
```
Control-Risk pairs by strength:
1. Control TM-001 mitigates Risk R-003 (strength: 4.8, observed in 12 workflows)
2. Control KYC-EDD mitigates Risk R-007 (strength: 3.2, observed in 8 workflows)
```

### Visualization

**Pages:**
- `KnowledgeGraphPage.tsx` — Interactive graph visualization (nodes, edges, click to explore)
- `IntelligenceDashboard.tsx` — Analytics view (entity activity, relationship heatmaps)

**Features:**
- Force-directed graph layout (entities cluster by relationship density)
- Color-coding by entity type
- Edge thickness represents relationship strength
- Click entity → see all relationships + linked workflows
- Filter by entity type, time range, relationship type

---

## 11. Pattern Detection Engine

Layer 4 of Cross-Workflow Intelligence — automated detection of insights across workflows.

### Architecture

**Components:**
1. **Pattern Detectors** — Algorithms that analyze knowledge graph + atoms
2. **Detector Scheduler** — Runs detectors periodically (configurable interval)
3. **Pattern Storage** — Detected patterns saved to `detected_patterns` table
4. **Alert System** — Critical patterns trigger notifications

---

### The Five Detectors

#### 1. Temporal Correlation Detector

**What it finds:** Events that co-occur across time

**Algorithm:**
```
For each pair of entities (A, B):
  Find all workflows where both A and B appear
  Calculate co-occurrence rate = workflows_with_both / workflows_with_A
  If rate > threshold (e.g., 70%) and sample_size > min (e.g., 5):
    Flag as temporal correlation pattern
```

**Example Output:**
```json
{
  "pattern_type": "temporal_correlation",
  "pattern_name": "Controls TM-001 and KYC-EDD frequently fail together",
  "description": "In 8 out of 10 gap analyses where Control TM-001 scored 'red', Control KYC-EDD also scored 'red' (80% correlation).",
  "severity": "warning",
  "evidence": {
    "entity_A": "Control TM-001",
    "entity_B": "Control KYC-EDD",
    "co_occurrence_rate": 0.80,
    "workflows": ["session-abc", "session-def", ...],
    "time_range": "2024-01-01 to 2024-06-30"
  },
  "actionable_insight": "Investigate shared root cause (same process? same system?). Consider joint remediation plan."
}
```

---

#### 2. Entity Convergence Detector

**What it finds:** Entities that appear together frequently across workflows

**Algorithm:**
```
For each entity E:
  For each entity type T (e.g., 'risk', 'product', 'geography'):
    Find all entities of type T that appear in workflows mentioning E
    Calculate convergence score = appearances_with_E / total_appearances_of_E
    If score > threshold (e.g., 60%):
      Flag as entity convergence pattern
```

**Example Output:**
```json
{
  "pattern_type": "entity_convergence",
  "pattern_name": "High-Risk Country Z linked to Wire Transfer STRs",
  "description": "Entity 'High-Risk Country Z' appears in 14 out of 18 STR workflows involving 'Product: Wire Transfers' (78% convergence).",
  "severity": "critical",
  "evidence": {
    "primary_entity": "Geography: High-Risk Country Z",
    "converging_entity": "Product: Wire Transfers",
    "convergence_score": 0.78,
    "workflows": ["str-001", "str-005", ...]
  },
  "actionable_insight": "Wire transfers to Country Z are a key ML/TF indicator. Consider enhanced monitoring or geo-blocking."
}
```

---

#### 3. Cascade Detector

**What it finds:** Sequential patterns (A → B → C)

**Algorithm:**
```
For each workflow execution:
  Identify entity mentions in temporal order
  Look for sequences that repeat across multiple workflows
  If sequence appears > threshold (e.g., 3 times):
    Flag as cascade pattern
```

**Example Output:**
```json
{
  "pattern_type": "cascade",
  "pattern_name": "Gap Analysis → Policy Update → Training workflow cascade",
  "description": "When 'Gap Analysis' workflow identifies control gaps, a 'Policy Update' workflow follows within 30 days in 85% of cases, then 'Training Delivery' within 60 days.",
  "severity": "positive",
  "evidence": {
    "sequence": ["Gap Analysis", "Policy Update", "Training Delivery"],
    "occurrences": 12,
    "average_intervals": [28, 55]
  },
  "actionable_insight": "Consistent remediation process detected. Consider creating an automated workflow template chaining these steps."
}
```

---

#### 4. Trend Divergence Detector

**What it finds:** Anomalous changes over time

**Algorithm:**
```
For each metric (e.g., quality scores, gap scores, entity mention count):
  Calculate trend over time (linear regression)
  Detect significant changes (> threshold delta, e.g., 20% decline)
  Flag if trend is negative or unexpected
```

**Example Output:**
```json
{
  "pattern_type": "trend_divergence",
  "pattern_name": "Quality scores declining over 3 quarters",
  "description": "Average quality scores for gap analyses: Q1: 8.2, Q2: 7.8, Q3: 7.1 (13.4% decline).",
  "severity": "warning",
  "evidence": {
    "metric": "quality_score",
    "time_series": [
      {"period": "2024-Q1", "value": 8.2},
      {"period": "2024-Q2", "value": 7.8},
      {"period": "2024-Q3", "value": 7.1}
    ],
    "trend_slope": -0.55,
    "percent_change": -13.4
  },
  "actionable_insight": "Investigate potential causes: resource constraints, process drift, complexity increase?"
}
```

---

#### 5. Gap Detector

**What it finds:** Missing coverage or blind spots

**Algorithm:**
```
Expected coverage = list of required entities (e.g., all AMLR articles)
Actual coverage = entities mentioned in workflows
Missing = expected - actual
If missing.count > threshold:
  Flag as gap detection pattern
```

**Example Output:**
```json
{
  "pattern_type": "gap_detection",
  "pattern_name": "Crypto Asset Risk under-represented in gap analyses",
  "description": "40 gap analyses conducted this year, but only 2 mentioned 'Crypto Asset Risk' despite AMLR requirements.",
  "severity": "warning",
  "evidence": {
    "expected_entity": "Risk: Crypto Asset Exposure",
    "mention_count": 2,
    "total_workflows": 40,
    "coverage_rate": 0.05
  },
  "actionable_insight": "Potential blind spot. Update gap analysis templates to include crypto asset risk assessment section."
}
```

---

### Detector Configuration

**Configurable per detector:**
- Threshold values (e.g., 70% correlation rate)
- Minimum sample size (e.g., 5 workflows)
- Time window (e.g., last 90 days vs. all time)
- Entity type filters (detect patterns only for specific types)

**Scheduling:**
- Run frequency (daily, weekly, on-demand)
- Auto-run on workflow completion (real-time pattern detection)

---

### Pattern Resolution Workflow

**Lifecycle:**
1. **Detected** — Pattern flagged by detector
2. **Active** — Awaiting review
3. **Investigating** — Analyst reviewing evidence
4. **Resolved** — Action taken
5. **Dismissed** — False positive or not actionable

**Resolution tracking:**
- Assigned to user
- Resolution notes
- Related workflows/actions
- Resolution timestamp

---

### Dashboard Integration

**Pattern alerts:**
- Critical patterns appear on dashboard with red badge
- Click to view full evidence
- Assign to team member
- Mark resolved with notes

**Historical view:**
- All detected patterns (not just active)
- Filter by type, severity, time range
- Pattern recurrence tracking (has this pattern appeared before?)

---

## 12. Institutional Memory Engine

The Institutional Memory Engine captures every decision you make and learns from it.

### The Problem

You run a gap analysis. The AI recommends prioritizing Control X as "high priority." You disagree based on organizational context and mark it "medium priority."

**Traditional AI tools:** Forget this immediately. Next gap analysis, they recommend the same thing.

**openEXPERT:** Remembers. Learns. Adapts.

---

### How It Works

#### Step 1: Checkpoint Decisions

Every workflow can have **checkpoint** steps where AI recommends an action and human decides.

**Example (Gap Analysis):**
```
Checkpoint: Prioritize remediation actions

AI Recommendation:
  - Control TM-001: HIGH (regulatory requirement, current gap)
  - Control KYC-EDD: MEDIUM (partial compliance)
  - Control SAR-Filing: LOW (minor procedural gap)

Human Decision (you):
  - Control TM-001: MEDIUM (regulatory requirement, but we have compensating control TM-002)
  - Control KYC-EDD: HIGH (this is a repeat finding from auditor, must fix)
  - Control SAR-Filing: LOW (agree)

Logged to: checkpoint_decisions table
```

---

#### Step 2: Decision Logging

**Stored data:**
- Checkpoint type (prioritization, risk scoring, control selection, etc.)
- AI recommendation (full context)
- Human decision (actual choice)
- Rationale (user can add notes)
- Context (module, client, regulation, workflow step)

**Table:** `checkpoint_decisions`

---

#### Step 3: Similarity Matching

When you reach a new checkpoint, the system searches for similar past decisions.

**Matching algorithm:**
```
current_checkpoint = "Prioritize Control TM-001 (client: Nordea, regulation: AMLR)"
past_checkpoints = fetch_all_decisions()

For each past_checkpoint:
  similarity_score = 0
  if same_module: similarity_score += 0.3
  if same_regulation: similarity_score += 0.2
  if same_control: similarity_score += 0.3
  if same_client: similarity_score += 0.1
  if keyword_overlap(context): similarity_score += 0.1

Return top 5 most similar past decisions
```

---

#### Step 4: Historical Context Display

**Before** you make a decision, the system shows you:

```
┌────────────────────────────────────────────────────────────┐
│ 📚 Institutional Memory: Similar Past Decisions            │
├────────────────────────────────────────────────────────────┤
│ 3 similar decisions found:                                 │
│                                                            │
│ 1. Gap Analysis for SEB (2024-02-15)                      │
│    AI Recommended: Control TM-001 = HIGH                  │
│    You Decided: MEDIUM                                     │
│    Rationale: "Compensating control TM-002 in place"      │
│    Similarity: 87%                                         │
│                                                            │
│ 2. Gap Analysis for Handelsbanken (2024-01-10)           │
│    AI Recommended: Control TM-001 = HIGH                  │
│    You Decided: MEDIUM                                     │
│    Rationale: "Risk appetite allows medium priority"       │
│    Similarity: 75%                                         │
│                                                            │
│ 3. Gap Analysis for Client X (2023-11-20)                │
│    AI Recommended: Control TM-001 = HIGH                  │
│    You Decided: HIGH                                       │
│    Rationale: "Audit finding, must fix immediately"        │
│    Similarity: 68%                                         │
└────────────────────────────────────────────────────────────┘

Current Recommendation: Control TM-001 = HIGH
Your Decision: [ HIGH | MEDIUM | LOW ]
Rationale: [optional text field]
```

**Benefit:** You see how you've handled this before. Consistency across engagements.

---

#### Step 5: Override Analysis

**Insight summaries:**
- "You override AI priority recommendations 40% of the time for Control TM-001 (8 out of 20 decisions)"
- "Most common override reason: 'Compensating controls in place'"
- "Override rate for AMLR Article 4 gaps: 60% (higher than average 25%)"

**What this reveals:**
- AI may be missing context (compensating controls not in source docs)
- Organizational risk appetite differs from regulatory-strict interpretation
- Specific controls/regulations trigger consistent adjustments

**Benefit:** Identify where AI needs better prompts or where organizational standards differ from regulatory text

---

#### Step 6: Feedback Loop (Future)

**Planned:**
- Use override patterns to auto-adjust AI recommendations
- "Based on past decisions, Control TM-001 is typically prioritized MEDIUM (not HIGH) when compensating controls exist"
- Adaptive learning without retraining the model

---

### Use Cases

#### 1. Consistency Across Teams
**Scenario:** Consulting firm with 10 analysts doing gap analyses

**Without Institutional Memory:**
- Each analyst makes different priority decisions
- Client A gets Control X marked HIGH, Client B gets same control marked LOW
- Inconsistent quality, hard to defend in audits

**With Institutional Memory:**
- All analysts see how senior partners prioritized similar gaps
- Consistency improves
- New analysts learn from experienced ones

---

#### 2. Regulatory Defense
**Scenario:** Regulator asks "Why did you prioritize Control X as MEDIUM when the regulation says it's mandatory?"

**Without Institutional Memory:**
- Analyst struggles to recall rationale
- Looks like arbitrary decision

**With Institutional Memory:**
- Pull up decision log: "MEDIUM priority because compensating control TM-002 in place per risk-based approach (6AMLD Article 8)"
- Show past decisions with same logic
- Defensible, documented, consistent

---

#### 3. Quality Improvement
**Scenario:** Firm wants to improve AI recommendation accuracy

**Insight from Override Analysis:**
- "AI recommends HIGH priority for controls with regulatory citations 90% of the time"
- "Analysts override to MEDIUM 60% of the time when client has compensating controls"
- "AI doesn't detect compensating controls from uploaded policies"

**Action:**
- Update module prompt: "Check for compensating controls before prioritizing gaps"
- Improve knowledge source extraction (parse policy sections on compensating controls)

**Result:** Override rate drops from 60% to 20% — AI gets better

---

### Dashboard

**Institutional Memory Page:**

```
┌────────────────────────────────────────────────────────────┐
│ Institutional Memory Insights                             │
├────────────────────────────────────────────────────────────┤
│ Total Decisions Logged: 487                               │
│ Average Override Rate: 28%                                │
│                                                            │
│ Top Overridden Recommendations:                           │
│   1. Control TM-001 priority (60% override rate)          │
│   2. AMLR Article 4 gap scoring (45% override rate)       │
│   3. Risk R-003 severity (38% override rate)              │
│                                                            │
│ Most Common Override Reasons:                             │
│   1. "Compensating controls in place" (34%)               │
│   2. "Risk appetite allows lower priority" (22%)          │
│   3. "Already remediated in Q1" (18%)                     │
│                                                            │
│ Decision Trends:                                          │
│   [Chart: Override rate over time — declining from 45% to 20%]
│   → AI recommendations improving!                         │
└────────────────────────────────────────────────────────────┘
```

---

### Privacy & Control

**Data stored locally** — All decision logs in SQLite database on your machine

**No telemetry** — openEXPERT doesn't send decision data to external servers

**Deletion:** Users can delete decision history per client/project (GDPR compliance)

---
