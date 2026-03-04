## PART 4: INTELLIGENCE & MEMORY SYSTEMS

*Part 4 covers ANTON's intelligence layer — the systems that transform individual AI sessions into cumulative organisational knowledge. These aren't features you interact with directly (though dashboards surface their outputs). They work in the background, extracting insights from every session, building a knowledge graph of entities and relationships, detecting patterns across your work, and creating an institutional memory that makes every subsequent interaction more informed.*

*This is what makes ANTON fundamentally different from tools that treat every conversation as a clean slate. ANTON remembers. ANTON learns. And ANTON gets better at working with your specific organisation over time.*

---

## 17. Cross-Workflow Intelligence (5-Layer Funnel)

Most AI tools treat every session as isolated. ANTON **learns from all your work** and detects patterns across workflows.

### The Vision

Imagine you've run 50 gap analyses over 6 months across different clients. Each analysis identified gaps, recommended controls, and set priorities. But the insights stayed trapped in individual reports.

**What if the system could:**
- Extract every fact, insight, and recommendation into a searchable knowledge base
- Map all entities mentioned (clients, regulations, controls, risks)
- Detect patterns: "Control X always scores 'green' but Control Y always scores 'red' — why?"
- Alert you: "This client has the same gap as 3 other clients — there's a common industry issue"

**That's Cross-Workflow Intelligence.** It's the difference between a tool that helps you do individual tasks and a platform that builds organisational knowledge.

---

### The 5-Layer Funnel

#### Layer 1: Raw Workflow Outputs

**What:** Every session output stored persistently.

**Capture:** Full Markdown output, module used, timestamp, associated workflow (if part of multi-step process).

**Purpose:** Complete persistent record of all AI-generated work — nothing is ever lost.

---

#### Layer 2: Knowledge Atoms

**What:** Discrete units of knowledge extracted from outputs by AI-powered analysis.

**Examples:**
- **Fact:** "AMLR Article 4 requires risk assessment reviews annually"
- **Insight:** "Control TM-001 flagged false positives in 80% of test cases"
- **Conclusion:** "Client lacks documented risk appetite for sanctions exposure"
- **Recommendation:** "Implement quarterly control effectiveness reviews"
- **Risk:** "Lack of TM tuning may result in regulatory criticism"

**Extraction Method:**
- AI analyses each output, identifies discrete knowledge units
- Each atom categorised (fact, insight, conclusion, recommendation, risk, control, requirement, gap, decision)
- Confidence score (0-1) assigned
- Temporal validity tracked (permanent, date range, superseded)

**Storage:** `knowledge_atoms` table with source linkage via `atom_sources`

---

#### Layer 3: Knowledge Graph

**What:** Map all entities and their relationships across your entire body of work.

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

**Relationship Strength:** 1.0+ = confirmed (mentioned multiple times), 0.5-1.0 = weak/inferred

**Purpose:** Enable graph queries — "Show all controls that mitigate sanctions risks", "Which regulations reference client X?", "What controls are most frequently identified as gaps?"

---

#### Layer 4: Pattern Detection

**What:** Automated detection of cross-workflow patterns using five specialised detectors.

**The Five Detectors:**

| Detector | What It Finds | Example |
|----------|---------------|---------|
| **Temporal Correlation** | Events that co-occur in time | "Every BWRA session followed by TM rule update within 72 hours" |
| **Entity Convergence** | Entities mentioned together frequently | "Client X + Regulation Y + Control Z appear in 8 sessions" |
| **Cascade Detection** | Sequential patterns | "Gap analysis → Policy creation → Training material (in that order)" |
| **Trend Divergence** | Anomalous changes | "Sanctions queries up 300% this month vs. baseline" |
| **Gap Detection** | Missing coverage | "No sessions about crypto asset regulations in 90 days" |

**Severity Levels:** Critical (requires immediate action), Warning (should be addressed), Info (interesting trend), Positive (good practice detected)

**Resolution Workflow:** active → investigating → resolved/dismissed, with resolution notes captured.

---

#### Layer 5: Actionable Intelligence Dashboard

**What:** Surface insights to users through a unified dashboard.

**Widgets:**
1. **Recent Patterns** — Detected patterns with severity badges, click-through to evidence
2. **Entity Activity Heatmap** — Most frequently mentioned entities, trending entities
3. **Knowledge Growth Metrics** — Atoms extracted per day, patterns per week, graph density
4. **Insight Alerts** — Critical patterns, trend warnings, gap notifications

**Example Dashboard:**
```
┌────────────────────────────────────────────────────────────┐
│ Cross-Workflow Intelligence Dashboard                      │
├────────────────────────────────────────────────────────────┤
│ 📊 Last 30 Days                                            │
│   • 847 knowledge atoms extracted                          │
│   • 12 patterns detected (2 critical, 5 warning, 5 info)  │
│   • 156 entities tracked across 23 workflows               │
├────────────────────────────────────────────────────────────┤
│ 🚨 Critical Patterns                                       │
│   ⚠️ Temporal Correlation: Controls X & Y fail together    │
│       Observed in 8/10 audits → Investigate shared system  │
│   ⚠️ Trend Divergence: Quality scores declining            │
│       Q1: 8.2 → Q2: 7.8 → Q3: 7.1 → Review process       │
├────────────────────────────────────────────────────────────┤
│ 📈 Trending Entities                                       │
│   • "AMLR Article 4" ↑ 240% mentions this month           │
│   • "Control TM-001" ↓ 60% mentions (less frequent testing)│
│   • "Client Nordea" ↑ New client, 5 workflows this week   │
├────────────────────────────────────────────────────────────┤
│ 🔍 Knowledge Graph: 3,247 entities, 8,962 relationships   │
│   Top Connected: "AMLR Article 4" (89 relationships)       │
│   Most Active: "Control TM-001" (156 mentions)             │
└────────────────────────────────────────────────────────────┘
```

---

### Use Cases

**Quality Assurance:** Audit team discovers that 3 analysts systematically miss AMLR Article 12 — pattern detection catches the inconsistency, training materials updated.

**Risk Identification:** MLRO queries "which entities appear more frequently in STR workflows this quarter?" — Entity Convergence flags "Crypto Exchange X" in 70% of recent STRs (up from 10%).

**Efficiency Gains:** Consultant asks "have we analysed DORA compliance before?" — Knowledge graph shows 4 previous analyses, all identifying the same 3 gaps. Creates a "DORA Starter Pack" module.

**Regulatory Intelligence:** Compliance team queries "which controls are affected by AMLR updates?" — Knowledge graph shows 12 controls linked to AMLR Article 4, all requiring updates. Triggers automated remediation workflow.

---

## 18. Knowledge Graph & Entity Relationships

The knowledge graph is Layer 3 of Cross-Workflow Intelligence. It maps **who, what, and how** across all your work.

### Entity Types

ANTON automatically extracts and classifies 11 entity types:

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
| **organization** | "EBA", "FATF", "FIU Sweden" | Institutional relationship mapping |
| **process** | "Customer Onboarding", "SAR Filing" | Process flow analysis |
| **document** | "AML Policy v3.2", "Board Risk Report Q1" | Document lineage tracking |

### Entity Extraction Process

1. AI analyses every workflow output
2. Identifies mentioned entities and classifies by type
3. Extracts canonical name
4. Stores in `entity_nodes` table
5. Tracks interaction count (how often entity appears)
6. Detects aliases ("Nordea", "Nordea Bank Abp", "Nordea Finland") and consolidates

### Relationship Types

| Type | Meaning | Example |
|------|---------|---------|
| `implements` | Entity A implements Entity B | "Client Nordea **implements** Control TM-001" |
| `mitigates` | Control mitigates Risk | "Control TM-001 **mitigates** Risk R-003" |
| `requires` | Regulation requires Control | "AMLR Article 4 **requires** Control KYC-EDD" |
| `references` | Entity references Entity | "Risk R-003 **references** AMLR Article 7" |
| `conflicts_with` | Inconsistency detected | "Control TM-002 **conflicts_with** Control TM-001" |
| `depends_on` | Dependency | "Control KYC-Platform **depends_on** System CRM-DB" |
| `supersedes` | Replacement | "AMLR 2024/1624 **supersedes** 4AMLD" |

### Entity Consolidation

**Challenge:** Same entity mentioned with different names across sessions.

**Solution:** AI-powered alias detection with manual merge support. Merge log tracks all consolidations for audit purposes. Users can manually correct or split incorrectly merged entities.

### Graph Queries

The knowledge graph supports SQL-based queries for analysis:

```sql
-- Find all controls that implement AMLR regulations
SELECT e1.name AS control_name, e2.name AS regulation_name,
       r.strength, r.co_occurrence_count
FROM entity_relationships r
JOIN entity_nodes e1 ON r.from_entity_id = e1.id
JOIN entity_nodes e2 ON r.to_entity_id = e2.id
WHERE e1.entity_type = 'control'
  AND e2.entity_type = 'regulation'
  AND r.relationship_type = 'implements'
ORDER BY r.strength DESC;
```

---

## 19. Pattern Detection Engine

The pattern detection engine is Layer 4 of Cross-Workflow Intelligence. It runs five specialised detectors that identify meaningful patterns across your accumulated work — patterns that would be invisible in individual session outputs.

### Detector Configuration

Each detector has configurable parameters:
- **Sensitivity** (0.0-1.0): How aggressively to detect patterns
- **Threshold** (0.0-1.0): Confidence level required to trigger an alert
- **Lookback period**: How far back to search (default 30 days)
- **Schedule**: How often to run detection (manual trigger or automated)

### The Five Detectors — Detailed

**1. Temporal Correlation:** Detects events that co-occur across workflows. Identifies when activities in one domain consistently trigger or accompany activities in another. Example: "When Control X scores 'red', Control Y also scores 'red' in 85% of cases — investigate shared root cause."

**2. Entity Convergence:** Detects entities appearing together repeatedly in ways that suggest meaningful relationships not yet captured in the knowledge graph. Example: "Entity 'High-Risk Country Z' appears in 80% of STR workflows involving 'Wire Transfers' — consider enhanced monitoring."

**3. Cascade Detection:** Detects sequential patterns where one type of work consistently follows another. Example: "Gap analysis → Policy update → Training delivery occurs in that order 90% of the time — automate the cascade."

**4. Trend Divergence:** Detects anomalous changes over time by comparing current metrics against established baselines. Example: "Gap analysis quality scores declining for 3 consecutive quarters — investigate resource constraints or process drift."

**5. Gap Detection:** Detects missing coverage by identifying topics, regulations, or entities that should appear in your work but don't. Example: "40 gap analyses conducted, but only 2 mentioned 'Crypto Asset Risk' despite AMLR requirements — potential blind spot."

### Pattern Lifecycle

1. **Detection** → Pattern logged with evidence, severity, and confidence
2. **Alert** → User notified (in-app, dashboard)
3. **Investigation** → User reviews evidence, marks as investigating
4. **Resolution** → Pattern resolved (action taken) or dismissed (false positive)
5. **Learning** → Dismissed patterns improve future detection sensitivity

---

## 20. Institutional Memory Engine

The Institutional Memory Engine captures every decision you make and learns from it. This is what enables ANTON to build a working relationship with your organisation over time — not just remembering what you've done, but understanding how your team thinks about problems.

### The Problem

You run a gap analysis. ANTON recommends prioritising Control X as "high priority." You disagree based on organisational context and mark it "medium priority."

**Traditional AI tools:** Forget this immediately. Next gap analysis, they recommend the same thing.

**ANTON:** Remembers. Learns. Adapts.

### How It Works

**Step 1: Checkpoint Decisions.** Every workflow can have checkpoint steps where ANTON recommends an action and the human decides. The recommendation, the actual decision, the rationale, and the context are all captured.

**Step 2: Decision Logging.** Each decision is stored with full context — checkpoint type, ANTON's recommendation, human decision, rationale, module, client, regulation, and workflow step.

**Step 3: Similarity Matching.** When you reach a new checkpoint, ANTON searches for similar past decisions using a multi-factor matching algorithm (same module +0.3, same regulation +0.2, same control +0.3, same client +0.1, keyword overlap +0.1). Top 5 most similar past decisions are surfaced.

**Step 4: Historical Context Display.** Before you make a decision, you see how you've handled similar situations before — complete with the rationale you provided at the time. This promotes consistency across engagements and helps new team members learn from experienced ones.

**Step 5: Override Analysis.** ANTON tracks override patterns — how often humans disagree with its recommendations, and for which topics. Insights like "You override AI priority recommendations 40% of the time for Control TM-001, most commonly because of compensating controls" reveal where ANTON's prompts need improvement or where organisational risk appetite differs from strict regulatory interpretation.

**Step 6: Feedback Loop (Future).** Use override patterns to auto-adjust ANTON's recommendations — adaptive learning without retraining the model. "Based on past decisions, Control TM-001 is typically prioritised MEDIUM (not HIGH) when compensating controls exist."

### Use Cases

**Consistency Across Teams:** All analysts see how senior partners prioritised similar gaps. New analysts learn from experienced ones. Decision quality converges.

**Regulatory Defence:** When a regulator asks "Why did you prioritise Control X as MEDIUM?", you pull up the decision log — documented rationale, past decisions with same logic, defensible and consistent.

**Quality Improvement:** Override analysis reveals that AI doesn't detect compensating controls from uploaded policies → update module prompt → override rate drops from 60% to 20%.

### Privacy & Control

All decision logs stored locally in SQLite. No telemetry sent externally. Users can delete decision history per client/project for GDPR compliance. Data belongs to you.

---

---

## PART 5: QUALITY & LEARNING

*Part 5 covers the systems that ensure ANTON's output meets professional standards — and improves over time. The Quality Ratchet measures and manages output quality across six dimensions. The Apprentice Model tracks competence development through four stages. And the Output Versioning system ensures you never lose work and can always trace how a deliverable evolved. Together, these systems create the evidence base for trust described in Chapter 4 — concrete, measurable proof that ANTON's work meets your standards.*

---

## 21. Quality Ratchet & Continuous Improvement

The Quality Ratchet ensures that output quality **never regresses** and continuously improves over time.

### The Problem

AI output quality varies. Same module, same inputs, different day — different quality. Without measurement and enforcement, quality is inconsistent and can decline without anyone noticing. And in professional contexts, inconsistent quality is itself a quality problem — clients, regulators, and internal stakeholders expect reliability, not lottery.

### The Solution: Multi-Dimensional Scoring

Every output is automatically scored across **6 dimensions:**

| Dimension | What It Measures | Score Range |
|-----------|-----------------|-------------|
| **Completeness** | Coverage of required sections and topics | 0-100 |
| **Accuracy** | Factual correctness, citation quality | 0-100 |
| **Structure** | Logical flow, readability, formatting | 0-100 |
| **Actionability** | Clear recommendations, concrete next steps | 0-100 |
| **Citations** | Proper regulatory references, source quality | 0-100 |
| **Overall** | Weighted composite score | 0-100 |

### How the Ratchet Works

1. **First output:** Baseline established (e.g., Overall = 85)
2. **User iterates:** "Make this more concise" or "Add more detail on Article 12"
3. **Re-scored:** New version scored (e.g., Overall = 82)
4. **Alert triggered:** "⚠️ Quality dropped 3 points (85 → 82). Completeness decreased."
5. **User decides:** Accept the trade-off (conciseness may cost completeness) or regenerate

### Alert Types

- **`below_baseline`** — Current score below established baseline
- **`significant_drop`** — Drop of >5 points in any dimension
- **`persistent_low`** — 3+ consecutive outputs below baseline
- **`improvement`** — Positive alert when quality increases (reinforcement)

### Quality Over Time

The Quality Ratchet doesn't just measure individual outputs — it tracks trends. You can see:
- Quality scores per module over weeks and months
- Quality comparison across users (are all analysts meeting the same standard?)
- Quality by AI model (does Claude Opus consistently outscore Sonnet for this task?)
- Quality improvement rate (is the system getting better as institutional memory grows?)

This data is what transforms "I think ANTON produces good work" into "ANTON's average quality score for AML gap analyses is 91/100 over 47 sessions, with an improving trend of +2.3 points per quarter." The former is an opinion. The latter is evidence for a compliance committee.

### Minimum Thresholds

Organisations can set minimum quality thresholds per module:
- "No output below 80/100 overall for client deliverables"
- "Citations score must be 90+ for regulatory submissions"
- "Actionability must be 85+ for any consulting engagement output"

When an output falls below the threshold, the user is alerted before it can be exported or shared. This is preventive quality management — catching issues before they become problems.

---

## 22. Apprentice Model (4-Stage Learning)

The Apprentice Model tracks ANTON's competence development through four stages — specific to each module and each user's context. This isn't a global setting; it's a personalised trust relationship between you and ANTON for each type of work.

### The Four Stages

| Stage | ANTON's Behaviour | Human Role | Criteria to Advance |
|-------|-------------------|-----------|---------------------|
| **Observer** | Watches, suggests structure | Does all analysis | 10 sessions completed |
| **Guided** | Drafts outline, flags key areas | Reviews and directs | 15 successful outputs, <20% override rate |
| **Supervised** | Produces full analysis | Spot-checks, approves | 25 successful outputs, <10% override rate |
| **Autonomous** | Works independently | Reviews final output only | 50 successful outputs, <5% override rate |

### How Progression Works

Advancement is earned through demonstrated competence in your specific context — not in general, but with your data, your standards, your reviewers.

**Example: AMLR Gap Analysis Module**

- **Month 1 (Observer):** ANTON suggests "You should review Article 8, 13, 18" but the analyst does the analysis. Quality scores establish a baseline.
- **Month 3 (Guided):** After 10 sessions, ANTON drafts the gap matrix. Analyst reviews, adjusts priorities. Override rate is 18% — acceptable for advancement.
- **Month 6 (Supervised):** After 25 successful outputs with override rate below 10%, ANTON produces the full gap analysis report. Analyst spot-checks critical sections.
- **Month 12 (Autonomous):** After 50 successful outputs with override rate below 5%, ANTON works independently. Analyst reviews the final output before delivery.

### Confidence Tracking

Every output includes a confidence score (0.0-1.0) with reasoning. Low-confidence outputs automatically trigger additional review, regardless of the module's overall stage.

### Override Logging

When a human overrides ANTON's suggestion, the override is logged with context. Over time, override patterns reveal where ANTON needs better prompts, where organisational standards differ from ANTON's defaults, and where additional training data would be valuable.

### The Trust Connection

The Apprentice Model is the operational implementation of the trust philosophy described in Chapter 4. Trust isn't a binary setting — it's a spectrum that's earned through demonstrated performance. The four stages provide a structured, measurable path from "new hire" to "trusted colleague," with clear criteria at each step and full audit trail throughout.

---

## 23. Output Versioning & Diff Engine

### The Problem

Professional work is iterative. You don't produce a gap analysis in one pass — you draft, review, refine, review again, refine again. Each iteration needs to be tracked, comparable, and reversible. And when a client asks "what changed between version 2 and version 5?", you need to answer precisely.

### How It Works

1. **Initial output:** Version 1 created automatically
2. **User requests changes:** "Make section 3 more concise" or "Add regulatory citations to each finding"
3. **New output:** Version 2 created, linked to Version 1
4. **Diff computed:** Changed sections highlighted in a standard diff format
5. **User reviews:** Side-by-side comparison shows exactly what changed
6. **Revert option:** Any previous version can be restored with one click

### Diff Format

Diffs use standard markdown format with `+ added lines` and `- removed lines`. They're computed using standard diff algorithms and stored for fast retrieval — you don't have to wait for recomputation.

### Version History Timeline

Every session has a visual timeline showing all versions, with timestamps, the prompt that triggered each change, and quality scores for each version. You can see how quality evolved across iterations — did the changes improve or degrade the output?

### Audit Trail

Version history serves a dual purpose. For the user, it's a productivity feature — track changes, revert mistakes, compare iterations. For the organisation, it's an audit trail — demonstrating that deliverables went through a proper review and refinement process, with each change documented and traceable.

---
