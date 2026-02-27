## PART 5: AUTOMATION & GOVERNANCE

## 16. Time Intelligence & Regulatory Radar

Time Intelligence helps you **never miss a deadline** and **stay ahead of regulatory changes**.

### The Challenge

Compliance professionals juggle dozens of deadlines:
- Regulatory implementation dates (AMLR go-live: January 2027)
- Consultation periods (EBA RTS comments due: March 15, 2024)
- Internal audit schedules (Q2 AML audit: June 2024)
- Recurring reporting (Annual MLRO report: January 31 every year)
- Project milestones (TM system upgrade: Q3 2024)

**Manual tracking:** Spreadsheets, calendar reminders. Error-prone. No dependency awareness.

**openEXPERT Time Intelligence:** Automated deadline tracking + dependency mapping + regulatory radar.

---

### Component 1: Deadline Tracking

#### Features

**1. Deadline Storage**
- **Table:** `deadlines`
- **Fields:** name, deadline_date, category, priority, status, buffer_days, prep_days, review_days, dependencies

**2. Categories:**
- Regulatory (implementation dates, consultation closures)
- Audit (internal/external audit schedules)
- Reporting (recurring compliance reports)
- Project (implementation milestones)
- Training (mandatory training completion)

**3. Priority Levels:**
- Critical (regulatory breach risk)
- High (audit finding risk)
- Medium (internal milestone)
- Low (aspirational target)

**4. Status Tracking:**
- Upcoming (> 30 days away)
- At Risk (< 30 days, not started)
- In Progress (work underway)
- Overdue (past deadline)
- Completed
- Deferred

---

#### Smart Buffering

**Buffer types:**

**Preparation Days:**
- How many days needed to prepare before deadline?
- Example: AMLR implementation (deadline: Jan 10, 2027) → prep_days: 180 → start work by: July 13, 2026

**Review Days:**
- How many days needed for review/approval before submission?
- Example: EBA consultation response (deadline: Mar 15, 2024) → review_days: 10 → submit for review by: Mar 5, 2024

**Total Buffer:**
- Earliest start date = deadline - prep_days - review_days
- Auto-calculate: "You should start this work by [date]"

---

#### Dependency Mapping

**Dependencies:**
- Task A blocks Task B ("Complete gap analysis before starting policy update")
- Task B cannot start until Task A completes

**Example cascade:**
```
Deadline: AMLR Compliance (Jan 10, 2027)
  ↓ blocks
Task A: AMLR Gap Analysis (complete by: Jul 13, 2026)
  ↓ blocks
Task B: Policy Updates (complete by: Oct 13, 2026)
  ↓ blocks
Task C: Training Delivery (complete by: Dec 13, 2026)
  ↓ blocks
Task D: Control Testing (complete by: Jan 5, 2027)
```

**Auto-calculation:** If Task A delayed by 2 weeks → all downstream tasks shift by 2 weeks → risk alert if final deadline missed

---

#### Recurring Deadlines

**Work rhythms:**
- Annual: "MLRO Report due January 31 every year"
- Quarterly: "Q1 AML stats to board (Apr 30), Q2 (Jul 31), Q3 (Oct 31), Q4 (Jan 31)"
- Monthly: "Transaction monitoring review by 5th of each month"

**Auto-generation:** System creates next occurrence when current one completed

---

#### Dashboard: Deadlines Page

**DeadlinesPage.tsx:**
```
┌────────────────────────────────────────────────────────────┐
│ Deadlines & Time Intelligence                             │
├────────────────────────────────────────────────────────────┤
│ 🚨 At Risk (7)  |  ⏰ Upcoming (12)  |  ✅ Completed (45) │
│                                                            │
│ ── Critical ─────────────────────────────────────────────  │
│                                                            │
│ 🔴 AMLR Implementation                                    │
│    Deadline: Jan 10, 2027 (224 days)                      │
│    Status: At Risk (should have started by Jul 13, 2026)  │
│    Dependencies: 4 tasks blocked                          │
│    [Start Gap Analysis] [View Plan]                       │
│                                                            │
│ 🟡 EBA RTS Consultation Response                          │
│    Deadline: Mar 15, 2024 (12 days)                       │
│    Status: In Progress                                    │
│    Review due: Mar 5, 2024 (2 days) ⚠️                    │
│    [Upload Draft] [Assign Reviewer]                       │
│                                                            │
│ ── High Priority ────────────────────────────────────────  │
│                                                            │
│ 🟢 Q2 AML Audit                                           │
│    Deadline: Jun 30, 2024 (102 days)                      │
│    Status: Upcoming                                       │
│    Prep starts: May 1, 2024 (73 days)                     │
│    [Create Audit Plan]                                    │
│                                                            │
│ [Filter: All | Critical | High | Medium | Low]            │
│ [View: Calendar | List | Gantt]                           │
└────────────────────────────────────────────────────────────┘
```

---

### Component 2: Living Regulatory Radar

**Purpose:** Automatically monitor regulatory publications and surface what matters

#### How It Works

**1. Source Configuration**
- **Table:** `radar_sources`
- **Source types:** RSS feed, Web page scraping, EUR-Lex API, Custom API

**5 Default Sources (seeded):**

| Source | Type | URL | Fetch Interval |
|--------|------|-----|----------------|
| EBA News & Publications | RSS | https://www.eba.europa.eu/news-rss | Every 6 hours |
| ESMA News | Web Scrape | https://www.esma.europa.eu/press-news | Daily |
| FATF Publications | Web Scrape | https://www.fatf-gafi.org/publications/ | Daily |
| EU AML/CFT (EUR-Lex) | EUR-Lex API | EUR-Lex search (AML, CFT, sanctions) | Daily |
| ECB Banking Supervision | RSS | https://www.bankingsupervision.europa.eu/press/rss | Every 6 hours |

**Custom sources:** Users can add their own (national regulators, industry bodies, law firms)

---

**2. Automated Fetching**
- **Scheduler:** Node-cron runs fetch jobs at configured intervals
- **Fetch process:**
  - RSS: Parse XML, extract title, link, publication date
  - Web scrape: Cheerio HTML parsing, extract article links and titles
  - EUR-Lex API: Query by keywords, fetch latest regulations and consultations
  - API: Call custom REST endpoint, parse JSON response

**3. AI-Powered Scoring**

Every fetched item sent to Claude for analysis:

**Prompt:**
```
Analyze this regulatory item for relevance to financial crime prevention and compliance:

Title: "EBA publishes final draft RTS on strong customer authentication under PSD2"
Summary: [fetched summary or first 500 words]
Source: EBA News
Published: 2024-02-15

Rate on three dimensions (0-1 scale):
1. Relevance: How relevant to AML/CFT, sanctions, FCP compliance?
2. Urgency: How soon must action be taken? (consultation deadline, implementation date)
3. Impact: How significant is the change? (minor clarification vs. major new requirement)

Also identify:
- Affected areas (AML, sanctions, KYC, TM, SAR, data protection, etc.)
- Consultation period (if applicable, extract deadline)
- Implementation date (if applicable, extract date)
```

**Claude Response (structured JSON):**
```json
{
  "relevance_score": 0.3,
  "urgency_score": 0.2,
  "impact_score": 0.4,
  "affected_areas": ["payments", "authentication"],
  "consultation_deadline": null,
  "implementation_date": "2025-06-01",
  "summary": "PSD2 RTS on SCA — low relevance to AML (focused on payment authentication, not FCP)"
}
```

**4. Filtering & Lifecycle**

**Relevance threshold:** Only store items with `relevance_score > 0.5` (customizable)

**Item lifecycle:**
- **New:** Just fetched, not reviewed
- **Reviewed:** User opened and read
- **Actioned:** User created task/deadline from item
- **Dismissed:** User marked as not relevant
- **Archived:** Older items auto-archived after 90 days

---

**5. Dashboard Integration**

**Dashboard Widget (RadarWidget.tsx):**
```
┌────────────────────────────────────────────────────────────┐
│ 📡 Regulatory Radar                 [3 High] [View All →] │
├────────────────────────────────────────────────────────────┤
│ 🔴 EBA GL 2024/05: AML Risk Factors (Updated)             │
│    Relevance: 95% · Consultation closes: Mar 20, 2024     │
│    [Read] [Add Deadline] [Dismiss]                        │
│                                                            │
│ 🟡 AMLA Regulation: Final Text Published                  │
│    Relevance: 88% · Implementation: Jul 2027              │
│    [Read] [Add Deadline] [Dismiss]                        │
│                                                            │
│ 🟢 FATF: Revised Guidance on Crypto Assets                │
│    Relevance: 76% · Published: Feb 10, 2024               │
│    [Read] [Add Deadline] [Dismiss]                        │
└────────────────────────────────────────────────────────────┘
```

**Full Page (RadarPage.tsx):**
- All items with filters (source, area, relevance, date range)
- Search within titles/summaries
- Mark as reviewed/actioned/dismissed
- Bulk actions ("Add all consultations as deadlines")

---

**6. Automatic Deadline Creation**

**One-click deadline creation:**
- User clicks "Add Deadline" on radar item
- Pre-populates deadline form:
  - Name: Item title
  - Deadline: Consultation close or implementation date
  - Category: Regulatory
  - Priority: Based on impact score
  - Prep/review buffers: Suggested based on deadline type

**Example:**
```
Radar Item: "EBA Consultation: RTS on AMLR Article 4"
  Consultation closes: Mar 20, 2024

  → Click "Add Deadline"

Auto-populated deadline:
  Name: "EBA Consultation Response: AMLR Article 4 RTS"
  Deadline: Mar 20, 2024
  Category: Regulatory
  Priority: High
  Prep days: 30 (suggested)
  Review days: 10 (suggested)
  → Earliest start: Feb 9, 2024
```

---

### Use Cases

#### 1. Proactive Compliance
**Scenario:** EBA publishes consultation paper on Friday afternoon

**Without Radar:**
- Compliance officer might miss it (checking EBA website manually)
- Discovers consultation 2 weeks later
- Scrambles to respond before deadline

**With Radar:**
- Radar fetches item Friday evening
- AI scores relevance: 92% (high)
- Appears on Monday dashboard: "🔴 New EBA consultation, closes in 28 days"
- One-click deadline creation
- Start work with full preparation time

---

#### 2. Regulatory Change Tracking
**Scenario:** Compliance team wants to track all AMLR-related developments

**Setup:**
- Configure EUR-Lex source with keyword filter: "AMLR, AMLA, 2024/1624"
- Set relevance threshold: 70%

**Result:**
- Auto-capture: final regulations, RTS, ITS, guidelines, consultations
- Timeline view: see all AMLR developments chronologically
- Export: "All AMLR items Jan-Jun 2024" → compliance committee report

---

#### 3. Multi-Jurisdiction Monitoring
**Scenario:** Bank operates in 5 Nordic countries, must track national regulators

**Setup:**
- Add custom sources:
  - Swedish FSA (Finansinspektionen) — RSS
  - Finnish FSA (FIN-FSA) — Web scrape
  - Norwegian FSA (Finanstilsynet) — RSS
  - Danish FSA (Finanstilsynet) — Web scrape
  - Icelandic FSA (FME) — Web scrape

**Result:**
- Unified regulatory feed across 5 jurisdictions
- AI auto-tags items by country
- Filter: "Show me Swedish-only items"

---

## 17. Compliance-as-Code

Compliance-as-Code turns regulatory requirements into **executable rules** that run automatically.

### The Vision

**Traditional compliance:** Manual checks. Humans review outputs. Inconsistent. Slow.

**Compliance-as-Code:** Automated rule execution. Every session checked against codified rules. Consistent. Fast. Defensible.

---

### How It Works

#### 1. Rule Definition

**Table:** `compliance_rules`

**Rule structure:**
```json
{
  "rule_id": "TOKEN_LIMIT_001",
  "name": "Input Token Limit",
  "description": "Ensure input does not exceed 180k tokens (Claude Opus limit)",
  "category": "operational",
  "severity": "critical",
  "rule_type": "threshold",
  "rule_logic": {
    "field": "input_token_count",
    "operator": "greater_than",
    "threshold": 180000,
    "warning_threshold": 150000
  },
  "auto_remediation": "truncate",
  "is_active": true
}
```

---

#### 2. Rule Types

**A. Threshold Rules**
Compare field value against threshold

**Examples:**
- `TOKEN_LIMIT_001`: input_token_count > 180,000 → FAIL
- `SESSION_LENGTH_001`: output_word_count > 10,000 → WARNING
- `QUALITY_MIN_001`: quality_score < 7.0 → FAIL

**B. Pattern Rules**
Regex matching on text content

**Examples:**
- `CITATION_REQ_001`: If module_category = "regulatory" AND output does NOT match regex `\[AMLR Article \d+\]` → FAIL ("Regulatory analysis must cite AMLR articles")
- `TODO_CHECK_001`: If output matches regex `TODO|FIXME` → FAIL ("No TODO/FIXME allowed in final output")

**C. Composite Rules**
Combine multiple conditions (AND/OR logic)

**Example:**
```json
{
  "rule_id": "HIGH_RISK_REVIEW_001",
  "name": "High-Risk Output Requires Review",
  "rule_type": "composite",
  "rule_logic": {
    "operator": "OR",
    "conditions": [
      {"field": "module_category", "operator": "equals", "value": "regulatory_submission"},
      {"field": "quality_score", "operator": "less_than", "value": 7.5},
      {"field": "output_word_count", "operator": "greater_than", "value": 8000}
    ]
  },
  "action": "require_review"
}
```

**D. Lookup Rules**
Whitelist/blacklist validation

**Example:**
```json
{
  "rule_id": "MODEL_WHITELIST_001",
  "name": "Approved Models Only",
  "rule_type": "lookup",
  "rule_logic": {
    "field": "model",
    "operator": "in_list",
    "whitelist": ["claude-opus-4-6", "claude-sonnet-4-5-20250929"]
  },
  "severity": "critical"
}
```

---

#### 3. Rule Execution

**When rules run:**
- **Pre-execution:** Before API call (validate inputs, settings)
- **Post-execution:** After output received (validate quality, content, citations)
- **On export:** Before allowing export (ensure approved outputs only)

**Execution process:**
1. Load active rules for module category
2. Evaluate each rule against session data
3. Log results to `rule_executions` table
4. If violations found → log to `rule_violations` table
5. Apply actions (block, warn, require review, auto-remediate)

---

#### 4. Rule Violations

**Violation tracking:**
- **Table:** `rule_violations`
- **Fields:** rule_id, session_id, violation_details, severity, status, remediation_notes, remediated_at

**Violation lifecycle:**
1. **Open:** Just detected
2. **Remediated:** User fixed (e.g., re-ran with lower token count)
3. **Accepted Risk:** User acknowledges, provides justification
4. **False Positive:** Rule triggered incorrectly, dismissed

---

#### 5. Auto-Remediation

**Some rules can self-fix:**

**Example 1: Token Limit Exceeded**
- Rule: `TOKEN_LIMIT_001` (input > 180k tokens)
- Auto-remediation: "truncate" (summarize large documents to fit limit)
- Action: AI summarizes longest document, re-checks token count

**Example 2: Missing Citations**
- Rule: `CITATION_REQ_001` (no AMLR citations in regulatory analysis)
- Auto-remediation: "insert_placeholders" (add `[CITATION NEEDED]` markers)
- Action: Append note: "⚠️ Citations required. Re-run with web search or upload regulation text."

**Example 3: Output Too Short**
- Rule: `OUTPUT_MIN_LENGTH_001` (output < 500 words for gap analysis)
- Auto-remediation: "extend" (prompt AI to add more detail)
- Action: Auto-follow-up: "Expand findings section with more detail per requirement"

---

### Seeded Rules (8 Default Rules)

#### 1. TOKEN_LIMIT_001
**Category:** Operational
**Severity:** Critical
**Rule:** input_token_count > 180,000 → FAIL
**Warning:** input_token_count > 150,000 → WARNING
**Remediation:** Truncate or summarize large documents

#### 2. OUTPUT_QUALITY_001
**Category:** Quality
**Severity:** High
**Rule:** output matches regex `TODO|FIXME|TBD` → FAIL
**Remediation:** Flag for user review, block export

#### 3. MODEL_WHITELIST_001
**Category:** Governance
**Severity:** Critical
**Rule:** model NOT IN [claude-opus-4-6, claude-sonnet-4-5-20250929] → FAIL
**Rationale:** Only approved models for regulatory work
**Remediation:** Block execution, suggest Opus or Sonnet

#### 4. CITATION_REQ_001
**Category:** Regulatory
**Severity:** High
**Rule:** IF module_category = "regulatory" AND output does NOT match `\[AMLR Article \d+\]|\[6AMLD Article \d+\]` → FAIL
**Remediation:** Warn user, suggest enabling web search or uploading regulation

#### 5. TRANSPARENCY_001
**Category:** Governance
**Severity:** Medium
**Rule:** IF module_category = "regulatory_submission" AND transparency_level < 1 → FAIL
**Rationale:** Regulatory submissions must show thinking (audit trail)
**Remediation:** Auto-set transparency_level = 1

#### 6. DATA_SOURCE_001
**Category:** Quality
**Severity:** High
**Rule:** IF module_category = "gap_analysis" AND knowledge_sources = "none" → FAIL
**Rationale:** Gap analysis requires reference material (regulation text or client docs)
**Remediation:** Prompt user to add knowledge sources

#### 7. REVIEW_CYCLE_001
**Category:** Governance
**Severity:** High
**Rule:** IF quality_score < 7.0 OR output_word_count > 8000 → require_review
**Remediation:** Set review_status = "draft", block export until reviewed

#### 8. SESSION_LENGTH_001
**Category:** Operational
**Severity:** Medium
**Rule:** IF output_word_count > 10,000 → WARNING
**Rationale:** Very long outputs may be unfocused
**Remediation:** Suggest breaking into multiple sessions

---

### Dashboard: Compliance Page

**CompliancePage.tsx:**
```
┌────────────────────────────────────────────────────────────┐
│ Compliance-as-Code Dashboard                              │
├────────────────────────────────────────────────────────────┤
│ Active Rules: 8  |  Executions (30d): 487  |  Violations: 12│
│                                                            │
│ ── Recent Violations ──────────────────────────────────────│
│                                                            │
│ 🔴 CITATION_REQ_001: Missing regulatory citations         │
│    Session: AMLR Gap Analysis — Client X                  │
│    Status: Open                                            │
│    Detected: 2 hours ago                                   │
│    [View Session] [Remediate] [Accept Risk]               │
│                                                            │
│ 🟡 QUALITY_MIN_001: Quality score below threshold         │
│    Session: Policy Update — AML Policy v3                 │
│    Status: Remediated (re-ran with `investigate`)         │
│    Detected: Yesterday                                     │
│    [View Session]                                          │
│                                                            │
│ ── Rule Performance ───────────────────────────────────────│
│                                                            │
│ Most Triggered Rules (30 days):                           │
│   1. SESSION_LENGTH_001 (42 warnings)                     │
│   2. CITATION_REQ_001 (8 failures)                        │
│   3. QUALITY_MIN_001 (6 failures)                         │
│                                                            │
│ Violation Resolution:                                     │
│   • Remediated: 67% (8/12)                                │
│   • Accepted Risk: 25% (3/12)                             │
│   • Open: 8% (1/12)                                        │
│                                                            │
│ [Create Custom Rule] [Export Audit Report]                │
└────────────────────────────────────────────────────────────┘
```

---

### Custom Rule Creation

**Users can define their own rules:**

**Example: Firm-Specific Citation Standard**
```json
{
  "rule_id": "FIRM_CITATION_001",
  "name": "Firm Citation Format",
  "description": "All regulatory analyses must use firm's citation format: [REG-ID Article X(Y)]",
  "category": "governance",
  "severity": "medium",
  "rule_type": "pattern",
  "rule_logic": {
    "field": "output_content",
    "regex": "\\[AMLR-2024-1624 Article \\d+\\(\\d+\\)\\]",
    "min_matches": 3
  },
  "action": "warn",
  "is_active": true
}
```

---

## 18. Workflow Automation & Scheduling

Workflows automate multi-step processes and reduce manual work.

### What Is a Workflow?

**A sequence of steps** that run automatically or semi-automatically.

**Example workflow: AMLR Implementation**
```
Step 1: Gap Analysis (module execution)
   ↓
Step 2: Review Gap Analysis (checkpoint — human decision)
   ↓
Step 3: Create Action Plan (module execution)
   ↓
Step 4: Assign Actions to Team (step assignment)
   ↓
Step 5: Schedule Follow-Up Review (deadline creation)
```

---

### Step Types

openEXPERT supports **12 step types:**

#### 1. Module Execution
Run an openEXPERT module (gap analysis, policy creation, etc.)

**Configuration:**
- Module ID
- Input variables (from previous steps)
- Model, thinking, creativity, output formats
- Knowledge sources

**Output:** Session result stored, available to next steps

---

#### 2. Checkpoint (Human Decision)
Pause workflow, ask human to decide

**Use cases:**
- "Approve gap analysis before proceeding to remediation?"
- "Select priority: HIGH, MEDIUM, or LOW?"
- "Enter additional context for policy update"

**Implementation:**
- Workflow pauses
- User notified
- User reviews output, makes decision
- Decision logged (institutional memory)
- Workflow continues with user's choice

---

#### 3. API Call
Call external REST API

**Use cases:**
- Send gap analysis to client portal
- Fetch client data from CRM
- Create Jira ticket for remediation action

**Configuration:**
- URL, method (GET, POST, PUT, DELETE)
- Headers (authorization, content-type)
- Body (JSON template with variable substitution)
- Response parsing (extract fields from response)

---

#### 4. Database Query
Query internal or external database

**Use cases:**
- Fetch client list from client management DB
- Retrieve historical gap analysis scores
- Check user permissions

**Configuration:**
- Connection ID (from connections framework)
- SQL query (parameterized)
- Result handling (single row, multiple rows, scalar)

---

#### 5. File Read
Read file from filesystem

**Use cases:**
- Read template document
- Load regulation text for knowledge source
- Import CSV data

---

#### 6. File Write
Write file to filesystem

**Use cases:**
- Save output as PDF
- Export gap analysis to network drive
- Create backup

---

#### 7. Script Execution
Run Python, bash, R, PowerShell, or Node.js script

**Use cases:**
- Data transformation (CSV → JSON)
- ML model inference (predict risk score)
- Integration with legacy systems

**Security:** Sandboxed execution (configurable memory, runtime, network limits)

---

#### 8. Email
Send email notification

**Use cases:**
- Notify MLRO when gap analysis complete
- Send consultation deadline reminder
- Distribute board report

**Configuration:**
- Recipients (to, cc, bcc)
- Subject (template with variables)
- Body (Markdown or HTML)
- Attachments (output files)

---

#### 9. Decision Gate (Branching)
Conditional logic — if X, do Y; else do Z

**Use cases:**
- "If quality score < 7.5, send for review; else proceed"
- "If gap score > 50%, escalate to board; else proceed to remediation"

**Configuration:**
- Condition (field, operator, value)
- True path (steps to execute if condition met)
- False path (steps to execute if condition not met)

---

#### 10. Transform (Data Manipulation)
Transform data between steps

**Use cases:**
- Extract findings from gap analysis output (regex or AI)
- Convert table to CSV
- Aggregate scores

---

#### 11. Loop
Repeat steps for each item in a list

**Use cases:**
- "For each client in list, run gap analysis"
- "For each control, generate policy section"

**Configuration:**
- List source (array variable from previous step)
- Steps to repeat (module execution, API call, etc.)
- Aggregation (combine results)

---

#### 12. Parallel
Execute multiple steps simultaneously

**Use cases:**
- "Run gap analysis + risk assessment in parallel"
- "Send email to 10 stakeholders simultaneously"

**Configuration:**
- Steps to run in parallel
- Synchronization (wait for all, or continue after first)

---

### Workflow Builder

**Visual workflow editor (WorkflowBuilder.tsx):**

```
┌────────────────────────────────────────────────────────────┐
│ Workflow Builder: AMLR Implementation                     │
├────────────────────────────────────────────────────────────┤
│                                                            │
│ [START]                                                    │
│    │                                                       │
│    ├──[1. Gap Analysis]────────────────────────┐          │
│    │   Module: AMLR Gap Analysis               │          │
│    │   Model: claude-opus-4-6                  │          │
│    │   Knowledge: Local folder + web search    │          │
│    └───────────────────────────────────────────┘          │
│    │                                                       │
│    ├──[2. Checkpoint: Review Findings]─────────┐          │
│    │   Decision: Approve / Request Changes     │          │
│    │   Assigned to: ${mlro_email}              │          │
│    └───────────────────────────────────────────┘          │
│    │                                                       │
│    ├──[3. Decision Gate]───────────────────────┐          │
│    │   If: checkpoint_decision = "Approve"     │          │
│    │   Then: Continue                          │          │
│    │   Else: Loop back to Step 1               │          │
│    └───────────────────────────────────────────┘          │
│    │                                                       │
│    ├──[4. Create Action Plan]──────────────────┐          │
│    │   Module: Action Plan Builder             │          │
│    │   Input: ${step1.output.findings}         │          │
│    └───────────────────────────────────────────┘          │
│    │                                                       │
│    ├──[5. Parallel: Assign Actions]────────────┐          │
│    │   For each: ${step4.output.actions}       │          │
│    │   Step: Assign to team member              │          │
│    │         Send email notification            │          │
│    └───────────────────────────────────────────┘          │
│    │                                                       │
│    ├──[6. Create Deadline]─────────────────────┐          │
│    │   Name: "AMLR Remediation Complete"       │          │
│    │   Date: ${step4.output.target_date}       │          │
│    │   Category: Regulatory                     │          │
│    └───────────────────────────────────────────┘          │
│    │                                                       │
│ [END]                                                      │
│                                                            │
│ [Save Workflow] [Test Run] [Schedule] [Publish]           │
└────────────────────────────────────────────────────────────┘
```

---

### Workflow Scheduling

**Cron-based automation:**
- **Table:** `workflow_schedules`
- **CRON expression:** "0 9 * * 1" (every Monday at 9 AM)

**Use cases:**
- **Weekly status report:** Run gap analysis scoring every Monday
- **Monthly compliance check:** Auto-check quality scores on 1st of month
- **Quarterly audit prep:** Generate pre-audit checklist 30 days before Q-end

**Dashboard:**
```
Scheduled Workflows:
  • Weekly AML Stats Report (every Monday 9 AM)
    Last run: Feb 19, 2024 9:00 AM (success)
    Next run: Feb 26, 2024 9:00 AM

  • Monthly Deadline Review (1st of each month)
    Last run: Feb 1, 2024 8:00 AM (success)
    Next run: Mar 1, 2024 8:00 AM
```

---

### Workflow Execution Monitoring

**WorkflowMonitor.tsx:**
```
┌────────────────────────────────────────────────────────────┐
│ Workflow Monitor: AMLR Implementation (Run #47)            │
├────────────────────────────────────────────────────────────┤
│ Status: Running  |  Started: 2024-02-20 10:15  |  Step: 3/6│
│                                                            │
│ ✅ Step 1: Gap Analysis (completed in 2m 34s)             │
│    Output: 4,850 words, quality 8.7                       │
│    [View Output]                                           │
│                                                            │
│ ✅ Step 2: Checkpoint — Review Findings (approved)         │
│    Decision: Approved by jane.smith@advisense.com         │
│    Timestamp: 2024-02-20 10:18                            │
│                                                            │
│ 🔄 Step 3: Create Action Plan (in progress...)            │
│    Status: Waiting for Claude API response                │
│    Elapsed: 45s                                            │
│                                                            │
│ ⏸️ Step 4: Assign Actions (waiting)                        │
│ ⏸️ Step 5: Create Deadline (waiting)                       │
│ ⏸️ Step 6: Send Notification (waiting)                     │
│                                                            │
│ [Pause Workflow] [Cancel] [View Logs]                     │
└────────────────────────────────────────────────────────────┘
```

---

## 19. Collaborative Canvas (Multi-Human Workflows)

Collaborative Canvas enables **team-based workflows** with step assignment, parallel reviews, and consensus tracking.

### The Problem

**Scenario:** Gap analysis requires:
1. Analyst to run analysis
2. Senior analyst to review findings
3. Legal counsel to review compliance interpretation
4. MLRO to approve before client submission

**Traditional approach:** Email chain. Version confusion. No tracking. Slow.

**Collaborative Canvas:** Structured workflow with assigned steps, SLA tracking, parallel reviews, and consensus.

---

### How It Works

#### 1. Step Assignment

**Assign workflow steps to specific people:**
- **Table:** `step_assignments`
- **Fields:** workflow_execution_id, step_number, assigned_to, assigned_at, due_date, status

**Status lifecycle:**
- Pending (not started)
- In Progress (assignee working)
- Completed (done)
- Overdue (past due_date)
- Reassigned (moved to different person)

**SLA Tracking:**
- Each assignment has due_date
- Auto-calculate: step created + SLA hours = due_date
- Overdue auto-detection
- Escalation (future): notify manager if overdue

---

#### 2. Parallel Reviews

**Multiple reviewers on same step:**
- **Table:** `parallel_reviews`
- **Fields:** step_assignment_id, reviewer_email, review_status, consensus_required, comments

**Review status per reviewer:**
- Pending (not reviewed)
- Approved
- Rejected (with comments)
- Abstained (no opinion)

**Consensus modes:**
- **All must approve:** All reviewers must approve before proceeding
- **Majority:** 51%+ approve = proceed
- **Any approve:** At least one approves = proceed
- **Advisory only:** Reviews recorded but don't block workflow

---

#### 3. Canvas Comments

**Threaded discussions on outputs:**
- **Table:** `canvas_comments`
- **Fields:** session_id, step_number, author, comment_type, content, resolved, parent_comment_id

**Comment types:**
- **Comment:** General feedback
- **Suggestion:** Proposed change
- **Concern:** Issue to address
- **Approval:** Explicit sign-off

**Resolution tracking:**
- Comments can be marked "resolved"
- Only unresolved comments block approval (if configured)

---

#### 4. Example Workflow

**Workflow:** AMLR Gap Analysis — Client Submission

**Step 1: Initial Analysis**
- Assigned to: Analyst (jane.analyst@firm.com)
- SLA: 3 days
- Status: Completed (2 days)
- Output: Gap analysis draft

**Step 2: Parallel Review**
- Reviewer 1: Senior Analyst (john.senior@firm.com)
  - Status: Approved
  - Comment: "Findings look solid, minor typos fixed"
- Reviewer 2: Legal Counsel (lisa.legal@firm.com)
  - Status: Approved with concerns
  - Comment: "GDPR interpretation needs citation, see comment #3"
- Reviewer 3: MLRO (mlro@firm.com)
  - Status: Pending (2 days overdue ⚠️)
- Consensus: All required (blocked until MLRO reviews)

**Step 3: Address Feedback**
- Assigned to: Analyst (reassigned from Step 1)
- Task: Address legal concern, add GDPR citation
- Status: In Progress

**Step 4: Final Approval**
- Assigned to: MLRO
- Task: Final sign-off
- Status: Pending

---

#### 5. Collaborative Canvas Dashboard

**Canvas interface:**
```
┌────────────────────────────────────────────────────────────┐
│ Collaborative Canvas: AMLR Gap Analysis — Nordea          │
├────────────────────────────────────────────────────────────┤
│ Workflow Status: Review (Step 2 of 4)                     │
│ Assigned to: You + 2 reviewers                            │
│ Due: Feb 22, 2024 (in 2 days)                             │
│                                                            │
│ ── Current Step: Parallel Review ──────────────────────────│
│                                                            │
│ Your Task: Review gap analysis findings                   │
│                                                            │
│ [📄 View Draft Output]                                     │
│                                                            │
│ Other Reviewers:                                          │
│   ✅ John Senior — Approved (yesterday)                   │
│       "Findings solid, minor typos fixed"                 │
│                                                            │
│   ⚠️ Lisa Legal — Approved with concerns (yesterday)      │
│       "GDPR interpretation needs citation" [View Comment] │
│                                                            │
│   ⏳ You — Pending                                         │
│       [Approve] [Reject] [Add Comment]                    │
│                                                            │
│ ── Comments (3) ────────────────────────────────────────── │
│                                                            │
│ 💬 Lisa Legal (yesterday):                                │
│    "Section 3.2 mentions GDPR Article 35 but no citation. │
│     Add EUR-Lex link for audit trail."                    │
│    Status: Unresolved                                     │
│    [Reply] [Resolve]                                       │
│                                                            │
│ 💬 John Senior (2 days ago):                              │
│    "Typo on page 4: 'transation' → 'transaction'"        │
│    Status: Resolved ✓                                     │
│                                                            │
│ [Add Comment] [View Full Output] [Download Draft]         │
└────────────────────────────────────────────────────────────┘
```

---

### Use Cases

#### 1. Quality Assurance
**Scenario:** Consulting firm standard — all regulatory analyses require senior review

**Workflow:**
- Analyst runs gap analysis
- Auto-assigned to senior partner for review
- Senior approves or requests changes
- If changes, loops back to analyst
- If approved, proceeds to client submission

**Benefit:** Consistent quality, no deliverable leaves firm without senior sign-off

---

#### 2. Multi-Stakeholder Approval
**Scenario:** Board report requires sign-off from compliance, legal, and CFO

**Workflow:**
- Compliance creates draft
- Parallel review: legal (regulatory accuracy), CFO (financial implications), MLRO (sanctions risks)
- All must approve (consensus mode: all_required)
- If any reject, address feedback and re-submit
- Once all approve, proceed to board

**Benefit:** Structured approvals, clear audit trail

---

#### 3. Distributed Teams
**Scenario:** Global consulting firm, analysts in different time zones

**Workflow:**
- EU analyst creates draft (9 AM CET)
- Assigned to US reviewer for review (10 AM CET = 4 AM EST)
- US reviewer approves asynchronously (10 AM EST = 4 PM CET)
- APAC reviewer sees approved version next morning (9 AM SGT)

**Benefit:** Asynchronous collaboration, no bottlenecks

---

### Notifications

**When assigned:**
- Email: "You've been assigned Step 3: Review gap analysis. Due: Feb 22."
- In-app: Notification badge on WorkflowMonitor

**When overdue:**
- Email: "Reminder: Step 3 review overdue by 1 day."
- Escalation (future): Notify manager after 2 days overdue

**When consensus reached:**
- Email to all: "All reviews complete. Workflow proceeding to Step 4."

---

### Integration with Institutional Memory

**Every checkpoint decision logged:**
- What was reviewed
- Who approved/rejected
- Comments and rationale
- Override analysis (if AI suggested different action)

**Benefit:** Institutional memory learns from team decisions, not just individual decisions

---
