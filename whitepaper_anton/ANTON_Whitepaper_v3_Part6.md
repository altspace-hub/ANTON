# PART 6: AUTOMATION & GOVERNANCE

*Professional work is defined not just by the quality of individual outputs, but by the systems that ensure deadlines are met, regulations are tracked, compliance rules are enforced, and teams collaborate effectively. ANTON's automation and governance capabilities transform ad hoc professional workflows into structured, auditable, repeatable processes — the kind of systematic discipline that separates professional-grade operations from good intentions.*

---

## §24. Time Intelligence & Regulatory Radar

Every professional working in a regulated environment knows the feeling: a consultation deadline surfaces unexpectedly, an implementation date approaches faster than anticipated, or a regulatory change slips through the cracks because nobody was watching the right publication feed that week. Time Intelligence is ANTON's answer to the chronic challenge of deadline management and regulatory awareness — not as a simple calendar, but as an intelligent system that understands dependencies, calculates buffer requirements, and actively monitors the regulatory landscape on your behalf.

### The Challenge

Compliance professionals juggle dozens of deadlines simultaneously — regulatory implementation dates (AMLR go-live: January 2027), consultation periods (AMLA RTS comments due), internal audit schedules (Q2 AML audit), recurring reporting obligations (annual MLRO report), and project milestones (TM system upgrade). Manual tracking through spreadsheets and calendar reminders is error-prone, lacks dependency awareness, and provides no early warning when cascading delays threaten final deadlines.

ANTON's Time Intelligence combines automated deadline tracking, dependency mapping, smart buffering, and a living regulatory radar into a single integrated system.

---

### Component 1: Deadline Tracking

**Deadline Storage**

The `deadlines` table stores comprehensive deadline metadata including name, deadline date, category, priority, status, and — critically — buffer calculations: `buffer_days`, `prep_days`, `review_days`, and `dependencies`.

**Categories** cover the full professional landscape: Regulatory (implementation dates, consultation closures), Audit (internal and external schedules), Reporting (recurring compliance reports), Project (implementation milestones), and Training (mandatory completion dates).

**Priority Levels** range from Critical (regulatory breach risk) through High (audit finding risk) and Medium (internal milestone) to Low (aspirational target).

**Status Tracking** follows a clear lifecycle: Upcoming (more than 30 days away), At Risk (less than 30 days and not started), In Progress (work underway), Overdue (past deadline), Completed, or Deferred.

---

#### Smart Buffering

The real value of Time Intelligence lies not in recording deadlines but in working backwards from them. For each deadline, ANTON calculates:

**Preparation Days:** How many days are needed to prepare before the deadline? For example, an AMLR implementation deadline of January 10, 2027 with 180 preparation days means work should begin by July 13, 2026.

**Review Days:** How many days are needed for review and approval before submission? An EBA consultation response with a deadline of March 15 and 10 review days means the draft must be submitted for internal review by March 5.

**Total Buffer:** The earliest start date equals the deadline minus preparation days minus review days. ANTON auto-calculates this and surfaces alerts: "You should start this work by [date]."

---

#### Dependency Mapping

Real-world deadlines rarely exist in isolation. ANTON models task dependencies where one task blocks another, creating cascading timelines:

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

When Task A is delayed by two weeks, all downstream tasks shift automatically — and ANTON triggers a risk alert if the final deadline becomes threatened.

---

#### Recurring Deadlines

Many professional obligations follow predictable rhythms: annual MLRO reports due January 31 every year, quarterly AML statistics to the board, monthly transaction monitoring reviews by the 5th. ANTON supports recurring deadline patterns and auto-generates the next occurrence when the current one is completed.

---

#### Deadlines Dashboard

The DeadlinesPage provides a unified view organised by priority — critical items at the top with dependency counts and action buttons, followed by high-priority items with preparation start dates, then medium and low priorities. Filter controls allow switching between All, Critical, High, Medium, and Low views, with Calendar, List, and Gantt display options.

---

### Component 2: Living Regulatory Radar

While Time Intelligence manages known deadlines, the Regulatory Radar addresses the unknown — monitoring regulatory publications in real-time and surfacing what matters to your work.

#### How It Works

**Source Configuration:** The `radar_sources` table supports multiple feed types: RSS feeds, web page scraping, EUR-Lex API queries, and custom REST APIs. Five default sources are seeded out of the box: EBA News & Publications (RSS, every 6 hours), ESMA News (web scrape, daily), FATF Publications (web scrape, daily), EU AML/CFT via EUR-Lex (API, daily), and ECB Banking Supervision (RSS, every 6 hours). Users can add their own sources — national regulators, industry bodies, law firms — to create jurisdiction-specific monitoring.

**Automated Fetching:** A node-cron scheduler runs fetch jobs at configured intervals. RSS feeds are parsed via XML extraction; web pages are scraped via Cheerio HTML parsing; EUR-Lex items are queried by keyword; and custom APIs return JSON responses.

**AI-Powered Scoring:** Every fetched item is sent to the configured LLM for analysis across three dimensions (0-1 scale): Relevance (how relevant to the user's domain), Urgency (how soon must action be taken), and Impact (how significant is the change). The AI also identifies affected areas, consultation deadlines, and implementation dates.

```json
{
  "relevance_score": 0.3,
  "urgency_score": 0.2,
  "impact_score": 0.4,
  "affected_areas": ["payments", "authentication"],
  "consultation_deadline": null,
  "implementation_date": "2025-06-01",
  "summary": "PSD2 RTS on SCA — low relevance to AML"
}
```

**Filtering & Lifecycle:** Only items exceeding the relevance threshold (default 0.5, customizable) are stored. Items then progress through a lifecycle: New (fetched, not reviewed), Reviewed (user opened), Actioned (user created task or deadline), Dismissed (not relevant), or Archived (auto-archived after 90 days).

**Dashboard Integration:** The RadarWidget surfaces high-priority items directly on the main dashboard with relevance scores, consultation deadlines, and one-click actions: Read, Add Deadline, or Dismiss. The full RadarPage provides comprehensive filtering by source, area, relevance, and date range, with search, bulk actions, and export capabilities.

**Automatic Deadline Creation:** Clicking "Add Deadline" on a radar item pre-populates the deadline form with the item's title, consultation or implementation date, regulatory category, impact-based priority, and suggested preparation and review buffers.

---

### Use Cases

**Proactive Compliance:** An EBA consultation paper published on Friday afternoon is fetched by the Radar that evening, AI-scored at 92% relevance, and appears on Monday's dashboard as a high-priority item with 28 days until the deadline closes. One-click deadline creation ensures full preparation time — instead of the traditional scramble when someone discovers the consultation two weeks late.

**Regulatory Change Tracking:** A compliance team configures EUR-Lex monitoring with keywords "AMLR, AMLA, 2024/1624" and a 70% relevance threshold. The system auto-captures final regulations, RTS, ITS, guidelines, and consultations — providing a chronological timeline view and exportable compliance committee reports.

**Multi-Jurisdiction Monitoring:** A Nordic bank operating across five countries adds custom sources for the Swedish FSA (Finansinspektionen), Finnish FSA (FIN-FSA), Norwegian FSA (Finanstilsynet), Danish FSA (Finanstilsynet), and Icelandic FSA (FME). The result is a unified regulatory feed across all jurisdictions, with AI auto-tagging by country and jurisdiction-specific filtering.

---

## §25. Compliance-as-Code

Traditional compliance relies on manual checks — humans reviewing outputs against internal standards, inconsistently and slowly. Compliance-as-Code represents a fundamental shift: regulatory requirements and internal quality standards become executable rules that run automatically against every ANTON session. The result is consistent enforcement, immediate violation detection, and a defensible audit trail that demonstrates systematic compliance rather than ad hoc checking.

### How It Works

#### Rule Definition

Rules are stored in the `compliance_rules` table with a structured JSON format defining rule identity, category, severity, type, logic, and remediation actions.

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

#### Rule Types

ANTON supports four rule types that cover the spectrum of compliance requirements:

**Threshold Rules** compare field values against defined limits: input token counts exceeding model limits, output word counts exceeding practical bounds, or quality scores falling below acceptable minimums.

**Pattern Rules** use regex matching on text content: verifying that regulatory analyses cite specific articles (`\[AMLR Article \d+\]`), checking that final outputs contain no TODO or FIXME markers, or enforcing firm-specific citation formats.

**Composite Rules** combine multiple conditions with AND/OR logic. For example, a "High-Risk Output Requires Review" rule triggers when the module category equals "regulatory_submission" OR the quality score falls below 7.5 OR the output exceeds 8,000 words — any of these conditions is sufficient to require human review.

**Lookup Rules** validate against whitelists or blacklists. An "Approved Models Only" rule ensures that only whitelisted models (e.g., `claude-opus-4-6`, `claude-sonnet-4-6-20250929`) are used for regulatory work.

#### Rule Execution

Rules execute at three checkpoints: **pre-execution** (before the API call, validating inputs and settings), **post-execution** (after the output is received, validating quality, content, and citations), and **on export** (before allowing export, ensuring only approved outputs leave the platform).

The execution process loads active rules for the relevant module category, evaluates each against session data, logs results to the `rule_executions` table, logs any violations to the `rule_violations` table, and applies enforcement actions (block, warn, require review, or auto-remediate).

#### Violation Lifecycle

Violations progress through a clear lifecycle: Open (just detected), Remediated (user fixed the issue), Accepted Risk (user acknowledges with justification), or False Positive (rule triggered incorrectly, dismissed).

#### Auto-Remediation

Some rules can self-correct. When the token limit is exceeded, the system can auto-truncate by summarising the longest document. When citations are missing in a regulatory analysis, the system appends `[CITATION NEEDED]` markers and prompts the user to add knowledge sources. When output is too short for the module type, the system auto-follows up with a request for expanded detail.

---

### Seeded Rules (8 Default Rules)

ANTON ships with eight pre-configured rules covering operational limits (token ceiling and session length), quality standards (no TODO markers, minimum quality scores), governance requirements (approved models only, transparency level for regulatory submissions), and data integrity (knowledge sources required for gap analyses, review cycles for high-risk outputs).

These defaults represent baseline best practices — organisations can enable, disable, or customise each rule, and create entirely new rules specific to their internal standards.

---

### Custom Rule Creation

Users define custom rules through the same JSON structure. A firm might create `FIRM_CITATION_001` requiring at least three instances of their specific citation format `[AMLR-2024-1624 Article X(Y)]` in all regulatory analyses, or `CLIENT_REVIEW_001` requiring partner sign-off on any deliverable exceeding 5,000 words.

### Compliance Dashboard

The CompliancePage provides a real-time overview: active rules count, execution statistics over 30 days, and open violations. Recent violations appear with their rule, session context, status, and action buttons (View Session, Remediate, Accept Risk). A Rule Performance section shows the most-triggered rules and violation resolution rates, helping organisations fine-tune their rule sets over time.

---

## §26. Workflow Automation & Scheduling

Individual module executions produce valuable outputs. But real professional work involves sequences of related activities — an analysis leads to a review, which triggers a plan, which requires assignments and follow-ups. ANTON's workflow automation transforms these multi-step processes from manual coordination into structured, repeatable, schedulable workflows.

### What Is a Workflow?

A workflow is a sequence of steps that run automatically or semi-automatically, with each step's output available as input to subsequent steps. A typical AMLR implementation workflow might proceed: Gap Analysis (module execution) → Review Gap Analysis (human checkpoint) → Create Action Plan (module execution) → Assign Actions to Team (parallel assignments) → Schedule Follow-Up Review (deadline creation).

---

### Step Types

ANTON supports **12 step types** covering the full range of professional workflow needs:

**1. Module Execution** — Run any ANTON module with configurable inputs, model selection, thinking level, output formats, and knowledge sources. The session result is stored and available to subsequent steps.

**2. Checkpoint (Human Decision)** — Pause the workflow and require human input: "Approve gap analysis before proceeding?" or "Select priority level" or "Enter additional context." The workflow pauses, the assignee is notified, they review the output and make their decision, the decision is logged to institutional memory, and the workflow continues.

**3. API Call** — Call external REST APIs: send outputs to a client portal, fetch client data from a CRM, or create a Jira ticket for a remediation action. Supports full HTTP configuration including method, headers, body templates with variable substitution, and response parsing.

**4. Database Query** — Query internal or external databases using the connections framework. Fetch client lists, retrieve historical scores, or check permissions. Supports parameterized SQL with configurable result handling.

**5. File Read** — Read files from the filesystem: template documents, regulation texts, or CSV data for knowledge source injection.

**6. File Write** — Write files to the filesystem: save outputs as PDF, export to network drives, or create backups.

**7. Script Execution** — Run Python, bash, R, PowerShell, or Node.js scripts with sandboxed execution (configurable memory, runtime, and network limits). Use cases include data transformation, ML model inference, and integration with legacy systems.

**8. Email** — Send email notifications with configurable recipients, subject templates with variables, Markdown or HTML body, and file attachments from previous steps.

**9. Decision Gate (Branching)** — Conditional logic that routes the workflow based on data: "If quality score < 7.5, send for review; else proceed" or "If gap score > 50%, escalate to board; else proceed to remediation."

**10. Transform (Data Manipulation)** — Transform data between steps: extract findings from analysis output, convert tables to CSV, or aggregate scores.

**11. Loop** — Repeat steps for each item in a list: "For each client in list, run gap analysis" or "For each control, generate policy section." Supports configurable aggregation of loop results.

**12. Parallel** — Execute multiple steps simultaneously: "Run gap analysis + risk assessment in parallel" or "Send email to 10 stakeholders simultaneously." Supports configurable synchronization (wait for all or continue after first).

---

### Workflow Builder

The visual WorkflowBuilder interface lets users design workflows by connecting step blocks in sequence, with branching paths for decision gates and parallel execution paths. Each step block displays its type, configuration summary, and connections to upstream outputs.

A typical AMLR Implementation workflow in the builder shows the full sequence from START through Gap Analysis, Checkpoint Review, Decision Gate (approve or loop back), Action Plan Creation, Parallel Assignment of actions, Deadline Creation, and END — with Save, Test Run, Schedule, and Publish controls.

---

### Workflow Scheduling

CRON-based scheduling automates recurring workflows. The `workflow_schedules` table stores CRON expressions (e.g., `0 9 * * 1` for every Monday at 9 AM) with use cases including weekly status reports, monthly compliance checks, and quarterly audit preparation. The WorkflowMonitor dashboard displays all workflows in progress with real-time step status, timing, and logs.

---

## §27. Collaborative Canvas (Multi-Human Workflows)

Professional deliverables rarely emerge from a single person's work. A gap analysis might require an analyst to run the initial analysis, a senior analyst to review findings, legal counsel to verify compliance interpretation, and the MLRO to approve before client submission. The Collaborative Canvas brings this multi-stakeholder process into ANTON as a structured, trackable, auditable workflow.

### How It Works

#### Step Assignment

Workflow steps can be assigned to specific people via the `step_assignments` table, with fields for assignee, assignment date, due date, and status. Assignments progress through a lifecycle: Pending, In Progress, Completed, Overdue, or Reassigned. SLA tracking calculates due dates automatically (step created + SLA hours = due date) with overdue auto-detection and escalation capabilities.

#### Parallel Reviews

When a step requires multiple reviewers, the `parallel_reviews` table tracks each reviewer's status independently: Pending, Approved, Rejected (with comments), or Abstained. Four consensus modes accommodate different governance requirements:

- **All must approve:** Every reviewer must approve before the workflow proceeds
- **Majority:** 51%+ approval is sufficient
- **Any approve:** A single approval unblocks the workflow
- **Advisory only:** Reviews are recorded but don't block progress

#### Canvas Comments

Threaded discussions on outputs enable structured feedback via the `canvas_comments` table. Comment types include general Comments, Suggestions (proposed changes), Concerns (issues to address), and Approvals (explicit sign-offs). Comments can be marked "resolved," and unresolved comments can optionally block final approval.

---

### Example Workflow

**AMLR Gap Analysis — Client Submission:**

**Step 1: Initial Analysis** — Assigned to the analyst with a 3-day SLA. Completed in 2 days.

**Step 2: Parallel Review** — Three reviewers work simultaneously. The Senior Analyst approves ("Findings look solid, minor typos fixed"). Legal Counsel approves with concerns ("GDPR interpretation needs citation, see comment #3"). The MLRO review is pending and 2 days overdue. Consensus mode requires all three, so the workflow is blocked until the MLRO reviews.

**Step 3: Address Feedback** — Reassigned to the original analyst to address legal counsel's citation concern.

**Step 4: Final Approval** — Assigned to the MLRO for final sign-off.

---

### Collaborative Canvas Dashboard

The Canvas interface shows the current workflow status (which step, how many steps remaining), the user's assigned task, draft output for review, other reviewers' statuses and comments, and action controls (Approve, Reject, Add Comment). The comment thread shows all feedback with resolution status.

---

### Use Cases

**Quality Assurance:** A consulting firm standard requires senior review of all regulatory analyses. The workflow auto-assigns to a senior partner, who approves or requests changes with loopback — ensuring no deliverable leaves the firm without sign-off.

**Multi-Stakeholder Approval:** A board report requires parallel sign-off from compliance, legal, and the CFO. All must approve (consensus mode: all_required), with rejection triggering feedback and resubmission.

**Distributed Teams:** A global consulting firm uses asynchronous collaboration — an EU analyst creates a draft in the morning, a US reviewer approves during their business hours, and an APAC reviewer sees the approved version the next day. No bottlenecks, no timezone conflicts.

---

### Integration with Institutional Memory

Every checkpoint decision is logged to institutional memory: what was reviewed, who approved or rejected, their comments and rationale, and any override analysis. This means ANTON's institutional memory learns from team decisions, not just individual ones — building organisational knowledge over time.

---

### Notifications

ANTON sends notifications at key workflow moments: assignment notifications when a step is assigned to someone ("You've been assigned Step 3: Review gap analysis. Due: Feb 22."), overdue reminders when SLAs are breached, and consensus notifications when all reviews are complete and the workflow proceeds.
