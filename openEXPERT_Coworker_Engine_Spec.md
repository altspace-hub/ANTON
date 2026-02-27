# openEXPERT by ANTON — Coworker Engine & Advanced Workflows Specification

## Document Purpose

This specification defines the next evolutionary leap for openEXPERT: from "expert tool" to "AI coworker." It covers three interconnected expansions:

1. **Module Expansion** — New modules across all areas, designed from both consultant-in and business-owner perspectives
2. **Coworker Workflows** — Advanced multi-step workflows that mirror how real people work day-to-day
3. **Integration Framework** — Secure, pre-approved connections to databases, file systems, scripts, APIs, and email

This document is intended for Claude Code implementation. It builds on the existing whitepaper, CLAUDE.md, and current codebase.

---

## 1. The Strategic Shift: Tool → Coworker

### 1.1 Why This Matters

The current openEXPERT architecture treats AI as an expert you consult — you bring a question, you get an answer. That's valuable, but it's still a tool paradigm. The real power — and the real scale — comes from treating AI as a coworker who can execute a string of tasks the way a human would.

Consider how a real FCP investigator works: they get an alert, open the case management system, pull the customer ID, check transaction patterns, review KYC information, assess whether more information is needed, write up findings, and route to second line review. That's 8-10 discrete steps across multiple systems. Today, a human does all of them manually. With Coworker Workflows, ANTON can execute this entire chain — with the human reviewing and approving at key checkpoints.

This is what differentiates openEXPERT from:
- **Harvey / Legora** — Domain-specific but single-turn, no workflow orchestration, no local deployment, no cross-area thinking
- **N8N / Zapier** — Workflow automation but no domain intelligence, no expert personas, no 7-layer knowledge system
- **ChatGPT / Claude direct** — General intelligence but no structure, no security model, no enterprise integration

openEXPERT combines all three: domain expertise + workflow orchestration + secure enterprise integration. That's the moat.

### 1.2 The Coworker Metaphor

A Coworker Workflow is defined as: **a named, saveable, shareable sequence of steps that mirrors how a specific role performs a specific job, with connections to the systems and files that role actually uses.**

Each coworker workflow has:
- A **role identity** (e.g., "FCP Investigator", "Tax Auditor", "Middle Manager")
- A **trigger** (what starts the workflow — manual, scheduled, file arrival, API event)
- A **sequence of steps** (each step is a module execution, script run, file read, API call, or decision gate)
- **Connections** (pre-approved integrations the workflow can use)
- **Checkpoints** (where the human reviews, approves, or redirects)
- **Outputs** (deliverables produced — reports, emails, spreadsheets, notifications)

---

## 2. Integration Framework — The Connection Layer

### 2.1 Design Philosophy: Secure by Default, Capable by Configuration

**Core principle:** ANTON can do nothing by default. Every connection, every file path, every script, every API endpoint must be explicitly configured and approved by an administrator before any workflow can use it. The AI cannot discover or access anything that hasn't been whitelisted.

This is the opposite of how tools like open-source agents work (where the AI has broad system access and decides what to do). In ANTON, the human sets up the sandbox, the AI works within it.

### 2.2 Connection Types

#### 2.2.1 Database Connections (via API/ODBC)

**What:** Read from and write to databases — SQL Server, PostgreSQL, MySQL, Oracle, SQLite, and any ODBC-compatible source.

**Configuration (admin-only):**
```json
{
  "connection_id": "crm_production_readonly",
  "display_name": "CRM Database (Read Only)",
  "type": "database",
  "driver": "postgresql",
  "host": "db.internal.company.com",
  "port": 5432,
  "database": "crm_prod",
  "credentials": "vault://crm-readonly",
  "permissions": ["SELECT"],
  "allowed_tables": ["customers", "transactions", "risk_scores", "kyc_records"],
  "blocked_columns": ["ssn", "password_hash", "internal_notes_confidential"],
  "max_rows_per_query": 10000,
  "query_timeout_seconds": 30,
  "audit_all_queries": true
}
```

**Key security features:**
- Read-only by default; write permissions require separate approval
- Table-level and column-level whitelisting/blacklisting
- Row limits to prevent accidental data dumps
- All queries logged to audit trail
- Credentials stored in vault, never in workflow config
- Connection tested and validated at setup time

**How workflows use it:**
- A step can reference a connection by ID: `"source": "crm_production_readonly"`
- The step specifies what data it needs in natural language or SQL template
- ANTON generates the query, the system validates it against whitelist rules, executes it, returns results
- Results are available as structured data for the next step

#### 2.2.2 File System Access

**What:** Read files from specified directories — both structured (CSV, JSON, XML, database exports, Excel) and unstructured (Word docs, PDFs, emails, text files, images).

**Configuration (admin-only):**
```json
{
  "connection_id": "shared_drive_reports",
  "display_name": "Monthly Reports Folder",
  "type": "filesystem",
  "base_path": "/mnt/shared/finance/monthly-reports",
  "allowed_extensions": [".csv", ".xlsx", ".pdf", ".docx", ".txt", ".json", ".xml"],
  "recursive": true,
  "max_depth": 3,
  "permissions": ["read"],
  "max_file_size_mb": 50,
  "excluded_patterns": ["**/archive/**", "**/.tmp*", "**/confidential/**"]
}
```

**Write access (separate config, separate approval):**
```json
{
  "connection_id": "output_reports",
  "display_name": "Generated Reports Output",
  "type": "filesystem",
  "base_path": "/mnt/shared/finance/generated",
  "permissions": ["read", "write", "create"],
  "allowed_extensions": [".xlsx", ".pdf", ".docx", ".md"],
  "naming_convention": "{date}_{workflow}_{step}.{ext}"
}
```

**How workflows use it:**
- Steps can list files, read specific files, search by name/date/pattern
- Structured files (CSV, Excel, JSON) are parsed into data tables automatically
- Unstructured files (Word, PDF) are extracted to text for analysis
- ANTON can write outputs to approved output directories
- File operations are logged to audit trail

#### 2.2.3 API Connections (REST/GraphQL)

**What:** Call external or internal APIs — CRM systems, case management, Jira, ServiceNow, ERP systems, screening tools, any REST/GraphQL endpoint.

**Configuration (admin-only):**
```json
{
  "connection_id": "jira_project_board",
  "display_name": "Jira — Engineering Board",
  "type": "api",
  "base_url": "https://company.atlassian.net/rest/api/3",
  "auth": {
    "type": "bearer",
    "token_source": "vault://jira-api-token"
  },
  "allowed_endpoints": [
    { "method": "GET", "path": "/search", "description": "Search issues" },
    { "method": "GET", "path": "/issue/{issueId}", "description": "Get issue details" },
    { "method": "POST", "path": "/issue/{issueId}/comment", "description": "Add comment" },
    { "method": "PUT", "path": "/issue/{issueId}/transitions", "description": "Move issue" }
  ],
  "blocked_endpoints": [
    { "method": "DELETE", "path": "/**" }
  ],
  "rate_limit": "60/minute",
  "timeout_seconds": 15
}
```

**Pre-built API templates for common systems:**
- Jira / Azure DevOps / Linear (project management)
- Salesforce / HubSpot / Pipedrive (CRM)
- ServiceNow / Zendesk / Freshdesk (ITSM / support)
- SAP / Oracle ERP (enterprise resource planning)
- Slack / Teams (messaging — send notifications)
- GoAML / screening tools (FCP-specific)
- SCB / Statistics APIs (public data)
- EUR-Lex / regulatory databases (compliance)

#### 2.2.4 Email (Already Implemented — Extend)

**Current state:** Email send capability exists. Extend with:
- Read incoming emails from configured mailbox (IMAP/Exchange)
- Filter by sender, subject, date range
- Parse attachments (use file system handler)
- Send with templates, attachments, CC/BCC
- Log all email actions

#### 2.2.5 Script Execution (Approved Script Library)

**What:** Run pre-approved scripts as workflow steps — Python, bash/cmd, R, PowerShell. Scripts can perform ML inference, data transformation, statistical analysis, file conversion, system health checks, and anything else that runs locally.

**CRITICAL SECURITY MODEL:** The AI does NOT write scripts on the fly. It selects from a library of pre-approved, pre-reviewed scripts. This is non-negotiable.

**Script Library Configuration:**
```json
{
  "script_id": "ml_anomaly_detection",
  "display_name": "Transaction Anomaly Detection (ML)",
  "description": "Runs isolation forest model on transaction data to flag anomalies",
  "language": "python",
  "path": "/opt/anton/scripts/ml/anomaly_detection.py",
  "parameters": [
    { "name": "input_csv", "type": "file_path", "required": true, "description": "CSV with transaction data" },
    { "name": "threshold", "type": "float", "default": 0.95, "description": "Anomaly threshold (0-1)" },
    { "name": "output_path", "type": "file_path", "required": true, "description": "Where to save results" }
  ],
  "expected_outputs": [
    { "name": "flagged_transactions.csv", "type": "csv" },
    { "name": "model_summary.json", "type": "json" }
  ],
  "max_runtime_seconds": 300,
  "memory_limit_mb": 2048,
  "approved_by": "admin@company.com",
  "approved_date": "2026-02-15",
  "version": "1.2.0",
  "hash": "sha256:abc123...",
  "sandbox": true,
  "network_access": false
}
```

**Script categories to pre-build:**
- **Data Processing:** CSV cleaning, deduplication, merge, pivot, format conversion
- **ML/Analytics:** Anomaly detection, clustering, classification, regression, time series forecasting
- **Statistical:** Descriptive stats, hypothesis testing, correlation analysis, distribution fitting
- **File Conversion:** PDF→text, image→text (OCR), Excel→CSV, XML→JSON
- **System Health:** Ping services, check disk space, verify database connectivity, SSL cert expiry
- **Reporting:** Chart generation (matplotlib/plotly), Excel formatting, PDF report assembly
- **Data Quality:** Null checks, format validation, range checks, referential integrity
- **Text Processing:** NER extraction, sentiment analysis, keyword extraction, document similarity

**How it works in a workflow:**
1. Workflow step specifies: `"action": "run_script", "script_id": "ml_anomaly_detection"`
2. ANTON maps workflow data to script parameters
3. Script executes in sandboxed environment (no network unless explicitly allowed)
4. Script hash is verified before execution (prevents tampering)
5. Output files are captured and made available to next step
6. Execution logged: script ID, parameters, runtime, exit code, output paths

**Adding new scripts:**
- Admin uploads script + metadata JSON
- System validates: runs in sandbox, checks no unauthorized imports, verifies parameter types
- Admin reviews and approves
- Script gets versioned and hashed
- Available to workflows

### 2.3 Connection Manager UI

The Connection Manager is an admin-only interface where connections are:
- Created with guided setup wizards (per type)
- Tested with connectivity checks
- Assigned to users/groups (who can use which connections in their workflows)
- Monitored for usage and errors
- Audited with full query/action logs
- Versioned (connection config changes tracked)

**Location in UI:** Settings → Connections → [Add New | Manage Existing | Audit Log | Script Library]

---

## 3. Advanced Workflow Architecture — Coworker Workflows

### 3.1 Workflow Structure

```
Coworker Workflow
├── Metadata
│   ├── name: "FCP Alert Investigation"
│   ├── role: "FCP Investigator"
│   ├── description: "End-to-end transaction monitoring alert triage"
│   ├── trigger: { type: "manual" | "scheduled" | "webhook" | "file_watch" }
│   ├── estimated_duration: "15-30 minutes"
│   └── tags: ["fcp", "investigations", "transaction-monitoring"]
│
├── Required Connections
│   ├── "case_management_system"
│   ├── "core_banking_readonly"
│   ├── "kyc_system_readonly"
│   └── "email_outbound"
│
├── Input Parameters
│   ├── alert_id: string (required)
│   └── priority_override: enum ["high", "medium", "low"] (optional)
│
├── Steps (ordered sequence)
│   ├── Step 1: { type: "api_call", connection: "case_management_system", ... }
│   ├── Step 2: { type: "module", area: "fcp", module: "transaction_analysis", ... }
│   ├── Step 3: { type: "database_query", connection: "core_banking_readonly", ... }
│   ├── Step 4: { type: "decision_gate", condition: "risk_score > 7", ... }
│   ├── Step 5: { type: "module", area: "fcp", module: "investigation_report", ... }
│   ├── Step 6: { type: "script", script_id: "ml_anomaly_detection", ... }
│   ├── Step 7: { type: "checkpoint", require_human: true, ... }
│   └── Step 8: { type: "email", template: "case_escalation", ... }
│
└── Outputs
    ├── investigation_report.docx
    ├── transaction_analysis.xlsx
    └── escalation_email (sent)
```

### 3.2 Step Types

| Step Type | What It Does | Connection Required |
|-----------|-------------|-------------------|
| `module` | Executes an openEXPERT module with configured inputs | No (uses AI) |
| `api_call` | Calls an external API endpoint | Yes — API connection |
| `database_query` | Reads/writes database | Yes — Database connection |
| `file_read` | Reads file(s) from configured directory | Yes — Filesystem connection |
| `file_write` | Writes output to configured directory | Yes — Filesystem connection (write) |
| `script` | Runs approved script from library | Yes — Script library access |
| `email_send` | Sends email with template/content | Yes — Email connection |
| `email_read` | Reads emails matching criteria | Yes — Email connection |
| `decision_gate` | Conditional branching based on data | No |
| `checkpoint` | Pauses for human review/approval | No |
| `transform` | Data mapping/transformation between steps | No |
| `loop` | Repeat steps for each item in a list | No |
| `parallel` | Run multiple steps simultaneously | No |
| `notification` | Send Slack/Teams/webhook notification | Yes — API connection |
| `wait` | Pause for specified duration or until condition | No |
| `sub_workflow` | Execute another workflow as a step | No |

### 3.3 Data Flow Between Steps

Every step produces output that becomes available to subsequent steps via a **workflow context**:

```
Workflow Context (accumulates through execution)
├── input: { alert_id: "TM-2026-4521", priority: "high" }
├── step_1_output: { customer_id: "C-123456", alert_type: "unusual_pattern", ... }
├── step_2_output: { transactions: [...], patterns: [...], risk_indicators: [...] }
├── step_3_output: { kyc_data: {...}, risk_rating: "medium", last_review: "2025-08-15" }
├── step_4_output: { decision: "escalate", reason: "risk_score_exceeded_threshold" }
└── ...
```

Steps reference previous outputs using path notation:
- `{{step_1.customer_id}}` — direct field reference
- `{{step_2.transactions | count}}` — with transformation
- `{{step_3.kyc_data.beneficial_owners}}` — nested access
- `{{input.alert_id}}` — original input reference

### 3.4 Execution Modes

**Guided Mode (default):**
- Each step executes, then pauses
- User sees: input data, what the step did, output data, AI reasoning
- User can: approve and continue, modify output, skip step, add a step, abort
- Best for: new workflows, complex decisions, training

**Automatic Mode:**
- All steps execute in sequence without pausing
- Stops only at explicit `checkpoint` steps or on error
- Results presented as complete package at end
- Best for: proven workflows, repeatable processes, scheduled runs

**Scheduled Mode:**
- Workflow runs automatically on a schedule (cron-style)
- Always has at least one checkpoint before any destructive/external action
- Results queued for review
- Best for: daily reports, periodic checks, recurring analysis

### 3.5 Error Handling

- Each step has configurable error behavior: `retry` (with backoff), `skip` (continue to next), `halt` (stop workflow), `fallback` (run alternative step)
- Connection failures trigger automatic retry with exponential backoff (max 3 attempts)
- Script timeout kills the process and logs the failure
- All errors logged with full context for debugging
- User notified of failures via preferred channel

---

## 4. Coworker Workflow Examples — Detailed Blueprints

These are complete workflow definitions. Each one represents a real job that a real person does today. The goal is that after setup, ANTON can do 70-80% of the work, with the human providing judgment at key decision points.

### 4.1 FCP Investigator — Alert Triage

**Role:** Financial Crime Prevention investigator at a bank
**Trigger:** Manual (investigator picks up alert) or automatic (alert assigned)
**Duration:** 15-30 minutes per alert (vs. 45-90 minutes manual)

```
Step 1: GET ALERT DETAILS
  Type: api_call
  Connection: case_management_system
  Action: Get alert by ID, including rule details, trigger data, initial score
  Output: alert_details (type, score, rule, trigger_time, customer_ref)

Step 2: PULL CUSTOMER PROFILE
  Type: database_query
  Connection: core_banking_readonly
  Action: Get customer demographics, account details, relationship length, products
  Output: customer_profile (name, segment, products, relationship_start, risk_rating)

Step 3: GET TRANSACTION HISTORY
  Type: database_query
  Connection: core_banking_readonly
  Action: Get 12 months transaction history for this customer
  Filter: transactions in/out, by channel, by counterparty
  Output: transaction_history (structured data)

Step 4: RUN PATTERN ANALYSIS
  Type: script
  Script: transaction_pattern_analysis
  Input: transaction_history from step 3
  Output: pattern_report (normal_behavior, deviations, peer_comparison, anomaly_flags)

Step 5: GET KYC INFORMATION
  Type: api_call
  Connection: kyc_system_readonly
  Action: Get current KYC data — BO structure, PEP status, source of wealth, occupation
  Output: kyc_data (all current KYC fields)

Step 6: SCREENING CHECK
  Type: api_call
  Connection: sanctions_screening_tool
  Action: Re-screen customer and key counterparties against current lists
  Output: screening_results (hits, near-matches, cleared)

Step 7: AI ASSESSMENT
  Type: module
  Area: fcp
  Module: investigation_assessment
  Input: All outputs from steps 1-6
  Persona: "Senior FCP Investigator" with regulatory expertise
  Instruction: |
    Assess this alert considering:
    - Does the transaction pattern match the alert rule logic?
    - Are the deviations from normal behavior significant?
    - Does the KYC information explain the activity?
    - Are there adverse screening hits?
    - What is the overall risk assessment?
    - Recommendation: Close (false positive), Request info, Escalate to SAR
    Provide structured assessment with confidence level and reasoning.
  Output: ai_assessment (risk_score, recommendation, reasoning, confidence, key_factors)

Step 8: CHECKPOINT — Human Review
  Type: checkpoint
  Display: Full case summary — alert + customer + transactions + patterns + KYC + AI assessment
  Actions: [Agree with AI, Override recommendation, Add notes, Request more data]
  Required: true (workflow cannot proceed without human decision)

Step 9: GENERATE INVESTIGATION REPORT
  Type: module
  Area: fcp
  Module: investigation_report_generator
  Input: All data + human decision from checkpoint
  Output: investigation_report.docx (formatted per company template)

Step 10: FILE REPORT & ROUTE
  Type: api_call
  Connection: case_management_system
  Action: Attach report, update case status, route to appropriate queue
  Conditional:
    - If "close": mark as false positive, close case
    - If "request_info": route to customer contact queue
    - If "escalate": route to SAR team with priority flag

Step 11: NOTIFICATION
  Type: email_send
  Connection: email_outbound
  Conditional: Only if escalated
  Template: case_escalation
  To: sar_team@company.com
  Content: Summary + link to case
```

### 4.2 Tax Auditor — Receipt Processing & Tax Calculation

**Role:** Accountant or tax preparer handling client tax returns
**Trigger:** Manual (new client engagement) or file_watch (new receipts folder)
**Duration:** 30-60 minutes (vs. 4-8 hours manual)

```
Step 1: SCAN RECEIPTS FOLDER
  Type: file_read
  Connection: client_documents
  Action: List all files in client/{client_id}/receipts/
  Filter: PDF, JPG, PNG, email files
  Output: file_list (paths, types, dates)

Step 2: EXTRACT RECEIPT DATA
  Type: script
  Script: ocr_receipt_extraction
  Input: All receipt files from step 1
  Processing: OCR → structured extraction (vendor, date, amount, category, VAT)
  Output: extracted_receipts.json (array of structured receipt data)

Step 3: CATEGORIZE EXPENSES
  Type: module
  Area: accounting_tax
  Module: expense_categorization
  Input: Extracted receipt data + client's chart of accounts
  Instruction: Categorize each expense per Swedish tax rules (avdragsgill/ej avdragsgill)
  Output: categorized_expenses (with tax deductibility flags)

Step 4: IMPORT BANK STATEMENTS
  Type: file_read
  Connection: client_documents
  Action: Read bank statement files (CSV/PDF)
  Output: bank_transactions

Step 5: RECONCILE
  Type: script
  Script: receipt_bank_reconciliation
  Input: categorized_expenses + bank_transactions
  Output: reconciliation_report (matched, unmatched_receipts, unmatched_bank)

Step 6: CHECKPOINT — Review Reconciliation
  Type: checkpoint
  Display: Reconciliation summary with unmatched items
  Actions: [Approve, Manually match items, Flag for follow-up]

Step 7: CALCULATE TAX
  Type: module
  Area: accounting_tax
  Module: tax_calculation
  Input: Reconciled expenses + income data + applicable tax rates
  Instruction: Calculate preliminary tax, deductions, VAT summary per Swedish Skatteverket rules
  Output: tax_summary (income, deductions, taxable_income, estimated_tax, VAT_summary)

Step 8: GENERATE DELIVERABLES
  Type: module
  Area: accounting_tax
  Module: tax_report_generator
  Parallel outputs:
    - tax_summary.xlsx (detailed spreadsheet with all receipts, categories, calculations)
    - tax_report.docx (narrative report for client)
    - skatteverket_data.xml (if applicable — formatted for digital filing)

Step 9: CHECKPOINT — Final Review
  Type: checkpoint
  Display: All deliverables for accountant review
  Actions: [Approve for client, Revise, Send back for more receipts]

Step 10: SEND TO CLIENT
  Type: email_send
  Connection: email_outbound
  Template: tax_return_ready
  Attachments: [tax_summary.xlsx, tax_report.docx]
```

### 4.3 Middle Manager — Weekly Status Report

**Role:** Team lead or middle manager reporting to upper management
**Trigger:** Scheduled (every Friday at 14:00) or manual
**Duration:** 10-15 minutes (vs. 2-3 hours manual)

```
Step 1: PULL JIRA/AZURE DEVOPS DATA
  Type: api_call
  Connection: jira_project_board
  Action: Get all issues updated this week for team's project(s)
  Filter: assigned to team members, updated since last Monday
  Output: sprint_data (issues completed, in progress, blocked, new)

Step 2: GET TIME TRACKING DATA
  Type: api_call or database_query
  Connection: time_tracking_system
  Action: Get hours logged per team member this week
  Output: time_data (by person, by project, by category)

Step 3: CALCULATE METRICS
  Type: script
  Script: sprint_metrics_calculator
  Input: sprint_data + time_data + historical_data
  Output: metrics (velocity, burn_down, completion_rate, capacity_utilization)
  Charts: velocity_trend.png, burndown.png, team_allocation.png

Step 4: IDENTIFY BLOCKERS & RISKS
  Type: module
  Area: project_management
  Module: risk_assessment
  Input: sprint_data (especially blocked items) + metrics
  Instruction: |
    Identify this week's blockers, assess impact on sprint/project goals,
    and recommend actions. Compare velocity to target.
  Output: risk_assessment (blockers, risks, recommendations)

Step 5: DRAFT WEEKLY REPORT
  Type: module
  Area: communication
  Module: management_report
  Input: All previous outputs
  Persona: "Concise executive communicator"
  Instruction: |
    Create weekly status report for upper management. Include:
    - Executive summary (3 bullets max)
    - Key accomplishments this week
    - Metrics with trend (charts inline)
    - Blockers and actions needed
    - Next week's priorities
    Keep it to one page. Management reads this in 2 minutes.
  Output: weekly_report.docx + weekly_report.pptx (one-slide version)

Step 6: CHECKPOINT — Manager Review
  Type: checkpoint
  Display: Draft report with charts
  Actions: [Approve and send, Edit, Add commentary]

Step 7: DISTRIBUTE
  Type: parallel
  Steps:
    - email_send: To management distribution list
    - notification: Post summary to team Slack channel
    - file_write: Archive to /reports/weekly/{date}/
```

### 4.4 Sales Manager — Pipeline & Forecast Review

**Role:** Sales manager reviewing pipeline, wins, and forecasting
**Trigger:** Scheduled (Monday morning) or manual
**Duration:** 15-20 minutes (vs. 3-4 hours manual)

```
Step 1: PULL CRM PIPELINE DATA
  Type: api_call
  Connection: crm_salesforce
  Action: Get all open opportunities, recent wins, recent losses
  Filter: team's opportunities, last 30 days activity
  Output: pipeline_data

Step 2: GET PRODUCT/INVENTORY STATUS
  Type: api_call
  Connection: erp_system
  Action: Check stock levels for key products, pending orders
  Output: inventory_status

Step 3: ANALYZE PIPELINE HEALTH
  Type: module
  Area: sales
  Module: pipeline_analysis
  Input: pipeline_data + historical_win_rates
  Instruction: |
    Analyze pipeline by stage, probability, deal size. Identify:
    - Deals at risk (stalled, aging, decreasing probability)
    - Deals likely to close this quarter
    - Revenue forecast vs. target
    - Coverage ratio
  Output: pipeline_analysis (forecast, at_risk, healthy, coverage)

Step 4: GENERATE LEAD SCORING
  Type: script
  Script: lead_scoring_model
  Input: pipeline_data + customer engagement data
  Output: scored_leads (priority ranked, with engagement signals)

Step 5: COMPETITIVE INTELLIGENCE CHECK
  Type: module
  Area: strategy
  Module: competitive_intelligence
  Input: Lost deals from step 1 + market context
  Instruction: Analyze loss reasons, identify competitive patterns
  Output: competitive_insights

Step 6: PRODUCE SALES REPORT
  Type: module
  Area: sales
  Module: sales_report_generator
  Input: All previous outputs
  Output: sales_report.xlsx (dashboard) + sales_summary.pptx (for team meeting)

Step 7: CHECKPOINT — Review & Distribute
  Actions: [Approve, Edit priorities, Schedule follow-ups]
```

### 4.5 Project Lead — Daily Standup & Sprint Management

**Role:** Scrum master or project lead running agile delivery
**Trigger:** Scheduled (daily 08:30) or manual

```
Step 1: GET OVERNIGHT UPDATES
  Type: api_call
  Connection: jira_board
  Action: Issues updated since last standup, new comments, status changes
  Output: overnight_changes

Step 2: CHECK BUILD/DEPLOY STATUS
  Type: api_call
  Connection: ci_cd_pipeline (GitHub Actions / Jenkins / Azure DevOps)
  Action: Get latest build status, deployment status, test results
  Output: build_status

Step 3: REVIEW PULL REQUESTS
  Type: api_call
  Connection: github_api
  Action: Open PRs, review requests, merge conflicts, aging PRs
  Output: pr_status

Step 4: PREPARE STANDUP SUMMARY
  Type: module
  Area: project_management
  Module: standup_preparation
  Input: overnight_changes + build_status + pr_status
  Instruction: |
    Prepare concise standup summary:
    - What moved since yesterday (per person)
    - What's blocked
    - What needs discussion
    - Sprint burndown status
  Output: standup_summary (structured per team member)

Step 5: IDENTIFY TASK BREAKDOWNS NEEDED
  Type: module
  Area: project_management
  Module: task_decomposition
  Input: New/large stories from sprint backlog
  Instruction: |
    For any story > 8 points without subtasks, suggest breakdown
    from business requirement to technical tasks
  Output: suggested_breakdowns

Step 6: SEND STANDUP PREP
  Type: notification
  Connection: slack_team_channel
  Content: Formatted standup summary with key highlights
```

### 4.6 Customer Support — Ticket Triage & Response

**Role:** Support team lead or first-line support agent
**Trigger:** Scheduled (every 2 hours) or manual

```
Step 1: PULL OPEN TICKETS
  Type: api_call
  Connection: zendesk_api
  Action: Get unresolved tickets, sorted by priority and age
  Output: open_tickets

Step 2: CHECK RELEASE TIMELINE
  Type: api_call
  Connection: jira_board
  Action: Get upcoming releases, known issues, bug fix ETAs
  Output: release_info

Step 3: CHECK KNOWN ISSUES KB
  Type: file_read
  Connection: knowledge_base
  Action: Read current known issues and workarounds
  Output: known_issues

Step 4: CATEGORIZE & PRIORITIZE
  Type: module
  Area: operations
  Module: ticket_triage
  Input: open_tickets + release_info + known_issues
  Instruction: |
    Categorize tickets by: bug, feature request, question, complaint
    Match against known issues
    Prioritize by: SLA breach risk, customer tier, frequency
    Suggest responses for common patterns
  Output: triaged_tickets (with suggested responses, linked known issues, priority order)

Step 5: DRAFT RESPONSES
  Type: loop
  For_each: triaged_tickets where auto_response_possible = true
  Step:
    Type: module
    Area: communication
    Module: customer_response
    Input: ticket details + known issues + release timeline
    Output: draft_response

Step 6: CHECKPOINT — Review Responses
  Display: All draft responses grouped by category
  Actions: [Approve individual, Edit, Escalate, Bulk approve category]

Step 7: SEND RESPONSES
  Type: api_call
  Connection: zendesk_api
  Action: Post approved responses, update ticket status
```

### 4.7 Tech Ops — Morning Health Check

**Role:** System administrator or SRE doing morning checks
**Trigger:** Scheduled (daily 07:00) or manual

```
Step 1: RUN SYSTEM HEALTH SCRIPTS
  Type: script (multiple)
  Scripts:
    - system_health_check (CPU, memory, disk across servers)
    - database_health_check (connection pools, slow queries, replication lag)
    - api_health_check (response times, error rates, uptime)
    - certificate_expiry_check (SSL certs approaching expiry)
  Output: health_data (structured per system)

Step 2: CHECK MONITORING ALERTS
  Type: api_call
  Connection: monitoring_system (Datadog / Grafana / PagerDuty)
  Action: Get alerts fired overnight, current open alerts
  Output: alert_data

Step 3: GET DEPLOYMENT LOG
  Type: api_call
  Connection: ci_cd_pipeline
  Action: What was deployed overnight? Any rollbacks?
  Output: deployment_log

Step 4: AI ASSESSMENT
  Type: module
  Area: cybersecurity
  Module: incident_assessment
  Input: health_data + alert_data + deployment_log
  Instruction: |
    Assess system health across all services. Identify:
    - Critical issues requiring immediate action
    - Warnings trending toward problems
    - Correlation between deployments and issues
    - Priority order for the team's attention today
  Output: health_assessment (critical, warning, info, priorities)

Step 5: GENERATE MORNING REPORT
  Type: module
  Area: communication
  Module: status_report
  Input: health_assessment + health_data
  Output: morning_report (with status dashboard, charts, action items)

Step 6: DISTRIBUTE
  Type: parallel
  Steps:
    - notification: Slack #ops-morning with summary
    - email_send: To on-call team if critical issues
    - file_write: Archive to /ops/daily/{date}.md
```

### 4.8 Online Sales / E-commerce — Product Sourcing & Planning

**Role:** E-commerce manager handling product sourcing and sales channels
**Trigger:** Weekly (Monday) or manual

```
Step 1: ANALYZE SALES DATA
  Type: database_query
  Connection: ecommerce_db
  Action: Sales by product, category, channel for last 30 days
  Output: sales_data

Step 2: CHECK TRENDING PRODUCTS
  Type: module
  Area: strategy
  Module: market_trend_analysis
  Input: Product category + market context
  Instruction: Identify trending products in our category, competitor pricing
  Output: market_trends

Step 3: INVENTORY REVIEW
  Type: api_call
  Connection: inventory_management
  Action: Current stock levels, reorder points, lead times
  Output: inventory_status

Step 4: SUPPLIER EVALUATION
  Type: file_read
  Connection: procurement_docs
  Action: Read RFP responses, supplier pricing sheets
  Output: supplier_data

Step 5: AI PROCUREMENT RECOMMENDATION
  Type: module
  Area: procurement
  Module: vendor_assessment
  Input: market_trends + inventory_status + supplier_data
  Instruction: |
    Recommend: what to order, from whom, how much, projected margin
    Consider: trend momentum, stock velocity, supplier reliability, MOQ
  Output: procurement_plan

Step 6: GENERATE BUSINESS PLAN UPDATE
  Type: module
  Area: strategy
  Module: business_plan_update
  Input: sales_data + procurement_plan + market_trends
  Output: weekly_business_update.xlsx + ordering_document.xlsx

Step 7: CHECKPOINT
  Actions: [Approve orders, Adjust quantities, Review suppliers]
```

---

## 5. Module Expansion — From Both Perspectives

For every area, we need to think about modules from two angles:

**Consultant perspective:** "I've been hired to come in and do X" — these are analytical, advisory, project-based modules. They produce reports, assessments, recommendations, frameworks.

**Business owner/employee perspective:** "I need to do X as part of my daily/weekly job" — these are operational, recurring, productivity modules. They produce reports, summaries, communications, processed data.

### 5.1 Area 1: Financial Crime Prevention (FCP)

**Existing modules:** Gap Analysis, Regulatory Interpretation, Risk Assessment, Transaction Monitoring Review, Sanctions Screening Assessment, KYC/CDD Assessment, SAR Writing, Policy & Procedure Creation

**New modules — Consultant perspective:**
- AMLA Data Point Readiness Assessment — assess ability to report all 250+ data points
- Peer Benchmarking Analysis — compare client's FCP maturity to industry peers
- Technology Selection Support — evaluate TM/screening/case management tools
- Regulatory Examination Preparation — prepare for FI/AMLA examinations
- Outsourcing Risk Assessment — evaluate third-party AML service providers
- Cross-Border Compliance Mapping — map obligations across jurisdictions

**New modules — Employee/operational perspective:**
- Alert Investigation Assistant — guided alert triage (feeds into coworker workflow)
- Daily Screening Results Review — morning check of overnight screening hits
- KYC Refresh Tracker — prioritize upcoming periodic reviews
- STR/SAR Quality Check — review draft SARs before filing
- Training Needs Assessment — identify team knowledge gaps
- MIS/Reporting Dashboard Generator — produce monthly management reports
- Regulatory Change Impact Scanner — flag new guidance affecting operations

### 5.2 Area 2: Legal & Regulatory

**Existing modules:** Regulatory Interpretation, Legal Analysis, Contract Review, Compliance Assessment

**New — Consultant:**
- Regulatory Horizon Scanning — systematic scan of upcoming regulatory changes
- Multi-Jurisdiction Comparison — compare regulatory requirements across countries
- Regulatory Submission Drafting — draft responses to consultations
- Legal Due Diligence Framework — structured legal DD for M&A

**New — Employee/operational:**
- Contract Clause Checker — scan contracts against standard terms
- NDA Generator — generate NDAs from templates with configurable terms
- Board Paper Legal Summary — weekly/monthly regulatory update for board
- GDPR Data Subject Request Handler — process DSARs efficiently
- Regulatory Deadline Tracker — track and notify on compliance deadlines
- Legal Hold Management — track litigation holds and affected documents

### 5.3 Area 3: Audit & Assurance

**Existing modules:** Audit Planning, Risk-Based Audit Approach, Finding & Recommendation Writing, Audit Report Assembly

**New — Consultant:**
- Internal Audit Universe Assessment — map all auditable entities
- Three Lines Model Assessment — evaluate governance structure
- Continuous Auditing Framework Design — design automated audit checks
- Peer Review Assessment — assess audit function against IIA standards

**New — Employee/operational:**
- Audit Workpaper Reviewer — check workpapers for completeness
- Finding Follow-Up Tracker — track remediation of audit findings
- Evidence Request Generator — produce targeted evidence requests
- Audit Committee Pack Generator — assemble quarterly audit committee materials
- Time & Budget Tracker — compare actual vs. planned audit hours
- Issue Rating Calibrator — ensure consistent finding severity ratings

### 5.4 Area 4: Client Engagement & Consulting

**Existing modules:** Proposal Development, Engagement Scoping, Stakeholder Mapping

**New — Consultant:**
- Diagnostic Assessment Builder — create rapid diagnostic tools for new engagements
- Value Tracking Framework — measure and report engagement value delivered
- Knowledge Transfer Plan — structure handover from consultants to client
- Capability Maturity Assessment — assess client capability across dimensions

**New — Employee/operational:**
- Meeting Preparation Brief — research attendees, prepare talking points, agenda
- Follow-Up Email Generator — draft post-meeting follow-ups with action items
- Proposal Pricing Calculator — estimate effort, cost, pricing for proposals
- Client Satisfaction Pulse — prepare quarterly review discussion guides
- CRM Update Summary — generate CRM entry from meeting notes

### 5.5 Area 5: Banking & Financial Services

**Existing modules:** Product Analysis, Regulatory Impact Assessment, Market Entry Assessment

**New — Consultant:**
- Banking License Application Support — structure license applications
- Prudential Requirement Assessment — capital, liquidity, governance requirements
- Digital Banking Readiness — assess readiness for digital transformation
- Payment Services Regulation (PSD3) Gap Analysis

**New — Employee/operational:**
- Daily Risk Limit Monitoring — check portfolio vs. risk limits
- Regulatory Reporting Reconciliation — validate regulatory submissions
- Product Approval Review — assess new product against compliance requirements
- Customer Complaint Root Cause Analyzer — analyze complaint patterns
- Interest Rate Sensitivity Report — generate IRRBB reports

### 5.6 Area 6: Investment & Asset Management

**New — Consultant:**
- Fund Governance Review — assess fund board effectiveness
- ESG Integration Maturity Assessment
- Performance Attribution Deep Dive

**New — Employee/operational:**
- Daily NAV Reconciliation Check
- Investment Committee Paper Generator — from portfolio data to IC presentation
- Client Quarterly Report Generator — personalized portfolio updates
- Mandate Compliance Monitor — check portfolios against mandate constraints
- Research Note Summarizer — distill broker research into action items

### 5.7 Area 7: Insurance

**New — Consultant:**
- Solvency II ORSA Support
- Claims Reserving Methodology Review
- Distribution Channel Compliance Assessment

**New — Employee/operational:**
- Claims Triage Assistant — initial assessment of new claims
- Policy Renewal Processor — prepare renewal documentation
- Underwriting Checklist Generator — risk-appropriate checklists
- Complaint Handler — draft responses to customer complaints
- Regulatory Return Validator — check submissions before filing

### 5.8 Area 8: Risk Management (Enterprise)

**New — Consultant:**
- Risk Culture Assessment — survey design and analysis
- Scenario Analysis Workshop Facilitator — prepare and run scenarios
- Risk Appetite Calibration — translate board appetite to operational limits

**New — Employee/operational:**
- Risk Register Updater — periodic risk reassessment workflow
- Incident Report Generator — from event details to structured report
- KRI Dashboard Builder — design and populate key risk indicators
- Risk Committee Pack Generator — assemble quarterly risk reports
- Emerging Risk Scanner — scan for new/changing risks from news and data

### 5.9 Area 9: Cybersecurity & Information Security

**New — Consultant:**
- Zero Trust Architecture Assessment
- Cloud Security Posture Review
- Supply Chain Security Assessment
- Penetration Test Report Writer

**New — Employee/operational:**
- Vulnerability Priority Ranker — CVE triage based on environment context
- Security Incident Report Generator
- Phishing Campaign Analyzer — analyze phishing test results, recommend training
- Access Review Processor — periodic user access certification
- Security Awareness Content Generator — create training materials
- Patch Management Priority Advisor — recommend patch order based on risk

### 5.10 Area 10: Data & Analytics

**New — Consultant:**
- Data Maturity Assessment — assess across data management capabilities
- Data Lineage Mapper — document data flows between systems
- AI Governance Framework Builder — establish responsible AI practices

**New — Employee/operational:**
- Data Quality Report Generator — automated DQ checks on key data sets
- Dashboard Builder — from data to visualization specification
- ETL Job Monitor — morning check on overnight data processing
- Data Dictionary Maintainer — keep metadata current
- Report Automation Converter — turn manual reports into automated specs
- A/B Test Analyzer — statistical analysis of experiment results

### 5.11 Area 11: Project Management & Delivery

**New — Consultant:**
- Programme Health Assessment — assess large programme status
- PMO Setup Framework — establish project management office
- Agile Maturity Assessment — evaluate agile adoption

**New — Employee/operational:**
- Sprint Planning Assistant — backlog grooming, capacity planning, sprint goal
- Daily Standup Prep (feeds into coworker workflow)
- Retrospective Facilitator — prepare retro, capture actions
- Status Report Generator (feeds into coworker workflow)
- Resource Allocation Optimizer — balance team across projects
- Change Request Processor — evaluate impact, prepare CR documentation
- RAID Log Updater — systematic review of risks, assumptions, issues, dependencies

### 5.12 Area 12: Education & Training

**New — Consultant:**
- Training Needs Analysis — assess organizational skill gaps
- Curriculum Design — structured learning programme design
- Assessment Design — create effective evaluation instruments

**New — Employee/operational:**
- Course Content Generator — from learning objectives to course materials
- Quiz & Assessment Builder — generate assessments with answer keys
- Training Record Tracker — who needs what training, when
- Onboarding Programme Builder — role-specific new starter programmes
- Competency Framework Developer — define role competencies and levels
- E-Learning Script Writer — write scripts for training videos/modules

### 5.13 Area 13: Accounting & Tax

**New — Consultant:**
- IFRS Implementation Advisor — new standard implementation guidance
- Transfer Pricing Documentation — prepare TP documentation
- Tax Structuring Analysis — evaluate options within legal boundaries

**New — Employee/operational:**
- Receipt Processor & Categorizer (feeds into coworker workflow)
- VAT Return Preparer — gather data, calculate, validate
- Month-End Checklist Runner — systematic close procedures
- Invoice Processor — extract, validate, post
- Budget vs. Actual Analyzer — variance analysis with commentary
- Expense Report Processor — validate, categorize, approve
- Payroll Reconciliation Checker
- Annual Report Section Drafter — financial statements narrative

### 5.14 Area 14: HR & People

**New — Consultant:**
- Organizational Restructuring Advisor — design new org structures
- Culture Diagnostic — design and analyze culture surveys
- Compensation Benchmarking — market rate analysis

**New — Employee/operational:**
- CV/Resume Screener — initial candidate screening against criteria
- Interview Question Generator — role-specific, competency-based
- Onboarding Checklist Manager — track new hire completion
- Leave & Absence Analyzer — pattern analysis, policy compliance
- Performance Review Summarizer — aggregate 360 feedback into summary
- Employee Engagement Pulse — prepare and analyze quick surveys
- Job Posting Optimizer — improve job ads for clarity and inclusion
- Exit Interview Analyzer — pattern analysis from exit data

### 5.15 Area 15: Branding & Creative

**New — Employee/operational:**
- Social Media Content Calendar — plan and draft posts
- Press Release Drafter — from event/news to formatted release
- Brand Guideline Checker — review content against brand standards
- Campaign Performance Analyzer — analyze marketing campaign metrics
- Competitor Brand Monitor — track competitor messaging changes
- Event Brief Generator — create briefs for events and conferences

### 5.16 Area 16: Software Engineering

**New — Employee/operational:**
- Code Review Checklist — systematic review against standards
- Technical Debt Tracker — log and prioritize tech debt
- Release Notes Generator — from commits/PRs to user-facing notes
- Architecture Decision Record Writer — document ADRs
- API Documentation Generator — from code to API docs
- Bug Report Template Filler — structure bug reports from user descriptions
- Sprint Demo Prep — prepare demo script from completed stories
- Dependency Audit — check for outdated/vulnerable dependencies

### 5.17 Area 17: Strategy & Business Development

**New — Employee/operational:**
- Competitive Win/Loss Analyzer — pattern analysis of deal outcomes
- Market Entry Briefing — research target market quickly
- Board Meeting Prep — compile data into board pack format
- OKR Progress Tracker — assess progress against quarterly objectives
- Partnership Evaluation Scorecard — structured partner assessment
- Business Model Health Check — periodic model validation

### 5.18 Area 18: ESG & Sustainability

**New — Employee/operational:**
- Carbon Footprint Calculator — data collection and calculation workflow
- CSRD Data Collection Orchestrator — gather data across departments
- Sustainability Report Section Drafter
- ESG Rating Questionnaire Filler — pre-fill common rating agency questions
- Supply Chain ESG Screener — assess supplier ESG risk

### 5.19 Area 19: Procurement & Supply Chain

**New — Employee/operational:**
- RFP Generator — create structured RFPs from requirements
- Bid Comparison Matrix — evaluate responses systematically
- Purchase Order Processor — validate, approve, track
- Supplier Performance Scorecard — periodic supplier evaluation
- Contract Renewal Tracker — upcoming renewals with action items
- Cost Savings Tracker — document and report procurement savings

### 5.20 Area 20: Operations & Process Improvement

**New — Employee/operational:**
- Process Documentation Writer — from process description to SOP
- KPI Dashboard Updater — collect data, calculate, visualize
- Continuous Improvement Tracker — log improvements, measure impact
- Incident Report Processor — structured incident documentation
- Capacity Planning Calculator — forecast resource needs
- SLA Monitor — track and report on service level compliance

### 5.21 Area 21: Sales & Customer Success

**New — Employee/operational:**
- Lead Qualification Scorer (feeds into coworker workflow)
- Proposal Generator — from opportunity data to tailored proposal
- Win/Loss Report — post-deal analysis and lessons learned
- Customer Health Score Calculator — aggregate engagement signals
- Renewal Risk Assessor — flag at-risk renewals early
- Upsell Opportunity Identifier — analyze usage for expansion potential
- Sales Call Prep — research prospect, prepare talking points

### 5.22 Area 22: Communication & Stakeholder Management

**New — Employee/operational:**
- Meeting Minutes Generator — from notes to formatted minutes
- Stakeholder Update Email Drafter — tailored updates per audience
- Town Hall Prep — prepare talking points, Q&A anticipation
- Change Communication Planner — multi-channel comm plan for changes
- Investor Update Letter — quarterly investor communication

### 5.23–5.30 Areas 23–30 (Summary — New Operational Modules)

**Area 23 — Personal Finance:** Budget Tracker, Subscription Auditor, Tax Return Prep Helper
**Area 24 — Real Estate:** Tenant Screening Analyzer, Maintenance Request Prioritizer, Lease Renewal Negotiation Prep
**Area 25 — Healthcare:** Patient Intake Processor, Clinical Documentation Assistant, Compliance Checklist Runner
**Area 26 — Research & Academia:** Literature Review Organizer, Grant Application Drafter, Peer Review Response Writer
**Area 27 — Public Sector:** FOI Request Processor, Policy Impact Assessment, Citizen Communication Drafter
**Area 28 — Entrepreneurship:** Business Plan Validator, Investor Pitch Prep, Cash Flow Forecaster
**Area 29 — Media & Publishing:** Editorial Calendar Manager, Content Performance Analyzer, Fact-Check Assistant
**Area 30 — Philanthropy & NGO:** Grant Report Writer, Impact Measurement Calculator, Donor Communication Drafter

---

## 6. Workflow Templates — Pre-Built Coworkers

Beyond the detailed examples in Section 4, here is the full list of pre-built coworker workflow templates to ship with or shortly after launch. Each is a saveable, customizable template.

### 6.1 Financial Services Workflows
- FCP Alert Investigation (detailed in 4.1)
- KYC Periodic Review Processor
- Sanctions Screening Daily Review
- Regulatory Change Impact Assessment
- STR/SAR Filing Pipeline
- AML Training Completion Tracker
- Risk Committee Reporting Pack
- Client Onboarding Pipeline

### 6.2 Finance & Accounting Workflows
- Tax Receipt Processing & Calculation (detailed in 4.2)
- Month-End Close Processor
- Accounts Payable Pipeline
- Budget Variance Reporting
- Payroll Reconciliation
- Financial Statement Prep
- Audit Preparation Pack

### 6.3 Management & Reporting Workflows
- Weekly Status Report (detailed in 4.3)
- Board Meeting Preparation Pipeline
- OKR/KPI Quarterly Review
- Team Performance Summary
- Budget Review Cycle
- Strategic Initiative Tracker

### 6.4 Sales & Business Development Workflows
- Pipeline Review & Forecast (detailed in 4.4)
- Lead Qualification & Scoring Pipeline
- Proposal Generation Pipeline
- Win/Loss Analysis Cycle
- Customer Health Check Cycle
- Account Planning Pipeline

### 6.5 Technology & Engineering Workflows
- Daily Standup Prep (detailed in 4.5)
- Customer Support Triage (detailed in 4.6)
- Morning Health Check (detailed in 4.7)
- Sprint Planning Pipeline
- Release Management Pipeline
- Incident Response Pipeline
- Security Review Pipeline
- Code Review Pipeline

### 6.6 HR & People Workflows
- Recruitment Pipeline (sourcing → screening → interview → decision)
- Onboarding Pipeline (contracts → setup → training → check-in)
- Performance Review Cycle
- Offboarding Pipeline
- Training Needs → Content → Delivery → Assessment Pipeline

### 6.7 Procurement & Operations Workflows
- E-Commerce Product Sourcing (detailed in 4.8)
- RFP → Evaluation → Selection → Contract Pipeline
- Supplier Performance Review Cycle
- Inventory Reorder Pipeline
- Process Improvement Cycle (identify → analyze → implement → measure)

---

## 7. Implementation Architecture for Claude Code

### 7.1 New Components to Build

```
src/
├── features/
│   ├── connections/
│   │   ├── ConnectionManager.tsx          — Admin UI for managing connections
│   │   ├── ConnectionWizard.tsx           — Guided setup per connection type
│   │   ├── ConnectionTest.tsx             — Connectivity testing UI
│   │   ├── ConnectionAuditLog.tsx         — Query/action audit trail
│   │   └── ScriptLibrary.tsx              — Script management UI
│   │
│   ├── workflows/
│   │   ├── WorkflowBuilder.tsx            — Visual workflow designer (drag & drop)
│   │   ├── WorkflowExecutor.tsx           — Runtime engine
│   │   ├── WorkflowMonitor.tsx            — Real-time execution view
│   │   ├── WorkflowCheckpoint.tsx         — Human review/approval UI
│   │   ├── WorkflowTemplateGallery.tsx    — Browse pre-built workflows
│   │   ├── WorkflowContext.tsx            — Data accumulation between steps
│   │   └── StepTypes/
│   │       ├── ModuleStep.tsx             — Execute openEXPERT module
│   │       ├── ApiCallStep.tsx            — REST/GraphQL call
│   │       ├── DatabaseStep.tsx           — SQL query execution
│   │       ├── FileReadStep.tsx           — File system read
│   │       ├── FileWriteStep.tsx          — File system write
│   │       ├── ScriptStep.tsx             — Approved script execution
│   │       ├── EmailStep.tsx              — Send/read email
│   │       ├── DecisionStep.tsx           — Conditional branching
│   │       ├── CheckpointStep.tsx         — Human gate
│   │       ├── TransformStep.tsx          — Data mapping
│   │       ├── LoopStep.tsx               — Iterate over collection
│   │       ├── ParallelStep.tsx           — Concurrent execution
│   │       ├── NotificationStep.tsx       — Slack/Teams/webhook
│   │       ├── WaitStep.tsx               — Timer/condition wait
│   │       └── SubWorkflowStep.tsx        — Nested workflow
│   │
│   └── coworkers/
│       ├── CoworkerGallery.tsx            — Browse coworker personas
│       ├── CoworkerCustomizer.tsx         — Customize workflow for your environment
│       └── CoworkerDashboard.tsx          — Track running/completed coworker tasks
│
├── server/
│   ├── services/
│   │   ├── connection-manager.ts          — Connection CRUD, testing, validation
│   │   ├── connection-executor.ts         — Execute operations against connections
│   │   ├── workflow-engine.ts             — Core workflow orchestration engine
│   │   ├── workflow-scheduler.ts          — Cron-based scheduling
│   │   ├── script-runner.ts              — Sandboxed script execution
│   │   ├── data-transform.ts             — Between-step data transformation
│   │   └── audit-logger.ts              — Comprehensive audit trail
│   │
│   ├── connections/
│   │   ├── database-adapter.ts           — SQL query builder + execution
│   │   ├── api-adapter.ts               — REST/GraphQL client with whitelist enforcement
│   │   ├── filesystem-adapter.ts         — File read/write with path enforcement
│   │   ├── email-adapter.ts             — IMAP/SMTP with template support
│   │   └── script-adapter.ts            — Process spawning with sandbox
│   │
│   └── middleware/
│       ├── connection-auth.ts            — Verify permissions before execution
│       └── workflow-audit.ts             — Log every workflow action
│
├── config/
│   ├── connections/                      — Connection definition JSON files
│   ├── workflows/                        — Workflow template JSON files
│   ├── scripts/                          — Approved script library
│   │   ├── registry.json               — Script metadata registry
│   │   ├── data-processing/
│   │   ├── ml-analytics/
│   │   ├── file-conversion/
│   │   ├── system-health/
│   │   ├── reporting/
│   │   └── data-quality/
│   └── coworkers/                       — Pre-built coworker workflow templates
│       ├── fcp-investigator.json
│       ├── tax-auditor.json
│       ├── middle-manager.json
│       ├── sales-manager.json
│       ├── project-lead.json
│       ├── customer-support.json
│       ├── tech-ops.json
│       └── ecommerce-manager.json
```

### 7.2 Database Schema Extensions

```sql
-- Connections
CREATE TABLE connections (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'database', 'api', 'filesystem', 'email', 'script_library'
  config JSON NOT NULL, -- Type-specific configuration
  credentials_ref TEXT, -- Vault reference, never stored directly
  permissions JSON NOT NULL, -- Allowed operations
  created_by TEXT NOT NULL,
  approved_by TEXT,
  approved_at DATETIME,
  status TEXT DEFAULT 'pending', -- 'pending', 'active', 'disabled', 'error'
  last_tested DATETIME,
  last_test_result TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Approved Scripts
CREATE TABLE scripts (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT,
  language TEXT NOT NULL, -- 'python', 'bash', 'r', 'powershell'
  path TEXT NOT NULL,
  parameters JSON, -- Parameter definitions
  expected_outputs JSON,
  max_runtime_seconds INTEGER DEFAULT 300,
  memory_limit_mb INTEGER DEFAULT 1024,
  sandbox BOOLEAN DEFAULT true,
  network_access BOOLEAN DEFAULT false,
  file_hash TEXT NOT NULL, -- SHA256 for integrity verification
  version TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  approved_at DATETIME NOT NULL,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Workflows
CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  role_identity TEXT, -- The "coworker" this represents
  trigger_config JSON, -- manual, scheduled, webhook, file_watch
  steps JSON NOT NULL, -- Ordered array of step definitions
  required_connections JSON, -- Array of connection IDs needed
  input_parameters JSON, -- Required inputs
  tags JSON,
  template_source TEXT, -- If created from template, which one
  execution_mode TEXT DEFAULT 'guided', -- 'guided', 'automatic', 'scheduled'
  schedule_config JSON, -- If scheduled, the cron expression
  created_by TEXT NOT NULL,
  is_template BOOLEAN DEFAULT false,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Workflow Executions
CREATE TABLE workflow_executions (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id),
  status TEXT NOT NULL, -- 'running', 'paused', 'completed', 'failed', 'cancelled'
  current_step INTEGER,
  context JSON, -- Accumulated data from all completed steps
  input_data JSON,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  error TEXT,
  execution_mode TEXT,
  started_by TEXT NOT NULL
);

-- Workflow Step Executions (for audit trail)
CREATE TABLE workflow_step_executions (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES workflow_executions(id),
  step_index INTEGER NOT NULL,
  step_type TEXT NOT NULL,
  connection_id TEXT,
  input_data JSON,
  output_data JSON,
  status TEXT NOT NULL, -- 'pending', 'running', 'completed', 'failed', 'skipped'
  started_at DATETIME,
  completed_at DATETIME,
  duration_ms INTEGER,
  error TEXT,
  human_decision TEXT, -- If checkpoint, what the human decided
  human_notes TEXT
);

-- Connection Audit Log
CREATE TABLE connection_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id TEXT NOT NULL REFERENCES connections(id),
  workflow_execution_id TEXT,
  action TEXT NOT NULL, -- 'query', 'read', 'write', 'api_call', 'script_run'
  details JSON, -- Query text, file path, endpoint, etc.
  result_summary TEXT, -- Row count, file size, status code, etc.
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  executed_by TEXT NOT NULL
);
```

### 7.3 Security Checklist

- [ ] Connections require admin approval before activation
- [ ] Credentials stored in vault, never in config files or database
- [ ] All connection operations logged to audit trail
- [ ] Database connections enforce table/column whitelists
- [ ] API connections enforce endpoint whitelists
- [ ] File system connections enforce path boundaries (no path traversal)
- [ ] Scripts verified by SHA256 hash before execution
- [ ] Scripts run in sandboxed process (no network unless explicitly allowed)
- [ ] Script output captured to temp directory, not arbitrary filesystem
- [ ] Workflow execution context is isolated per execution
- [ ] No connection config exported in .anton files (security boundary)
- [ ] Rate limiting on all external API calls
- [ ] Timeout enforcement on all operations
- [ ] RBAC: admin manages connections, users use pre-approved connections in workflows
- [ ] Automatic session expiry for database connections

### 7.4 Priority Implementation Order

**Phase 1 — Foundation (Implement first)**
1. Connection data model + admin CRUD UI
2. Workflow data model + basic builder UI
3. Module step type (already partially exists — extend)
4. Checkpoint step type (human-in-the-loop)
5. Workflow executor (guided mode only)

**Phase 2 — Core Integrations**
6. File system adapter (read structured + unstructured)
7. Database adapter (read-only initially)
8. API adapter (with template for Jira as first integration)
9. Email adapter (extend existing)
10. Data flow between steps (context accumulation)

**Phase 3 — Advanced Capabilities**
11. Script runner (with sandbox)
12. Script library management UI
13. Decision gates and conditional branching
14. Loop and parallel step types
15. Automatic execution mode
16. Scheduled execution

**Phase 4 — Coworker Experience**
17. Coworker gallery with pre-built templates
18. Workflow customizer (adapt template to your connections)
19. Coworker dashboard (running/completed/scheduled)
20. Workflow sharing via .anton export
21. Sub-workflow support

### 7.5 Module Registration

All new modules described in Section 5 should follow the existing config-driven pattern:
- `area.json` — area metadata (existing pattern)
- `module.json` — module metadata with guided input questions
- `system-prompt.md` — module-specific system prompt
- `operational` tag — new tag to distinguish operational/daily modules from consultant/project modules

This allows users to filter: "Show me operational modules" vs. "Show me consultant modules" — or browse both.

---

## 8. Competitive Positioning

### Why This Beats the Alternatives

| Capability | openEXPERT | Harvey | Legora | N8N | ChatGPT/Claude |
|-----------|-----------|--------|--------|-----|---------------|
| Domain expertise (30+ areas) | ✅ | Legal only | Legal only | ❌ | Generic |
| 7-layer knowledge system | ✅ | ❌ | ❌ | ❌ | ❌ |
| Workflow orchestration | ✅ | ❌ | ❌ | ✅ | ❌ |
| Secure local deployment | ✅ | ❌ (cloud) | ❌ (cloud) | ✅ | ❌ (cloud) |
| Pre-approved connections | ✅ | N/A | N/A | ❌ (open) | N/A |
| Script execution (sandboxed) | ✅ | ❌ | ❌ | Via code nodes | ❌ |
| Expert personas | ✅ | ❌ | ❌ | ❌ | ❌ |
| Coworker templates | ✅ | ❌ | ❌ | Templates | ❌ |
| Air-gapped deployment | ✅ | ❌ | ❌ | ❌ | ❌ |
| Open source | ✅ | ❌ | ❌ | ✅ | ❌ |
| Multi-LLM support | ✅ | ❌ | ❌ | ✅ | ❌ |
| File-based exchange | ✅ | N/A | N/A | ❌ | N/A |
| Enterprise audit trail | ✅ | Partial | Partial | Partial | ❌ |

**The key insight:** N8N has workflows but no intelligence. Harvey has intelligence but no workflows. openEXPERT has both — plus it runs locally, is open source, and has enterprise-grade security. That's the gap in the market.

---

## 9. Summary — What Claude Code Needs to Build

1. **Connection Framework** — Database, API, filesystem, email, script adapters with admin config UI
2. **Workflow Engine** — Step sequencing, data flow, checkpoints, guided/auto/scheduled modes
3. **Script Library** — Sandboxed execution of pre-approved scripts with hash verification
4. **~150 new modules** across all 30 areas (config-driven, following existing patterns)
5. **8+ pre-built coworker workflow templates** (FCP investigator, tax auditor, etc.)
6. **Workflow Builder UI** — Visual designer for creating custom workflows
7. **Coworker Gallery** — Browse and customize pre-built workflow templates
8. **Audit trail** — Every connection operation, workflow step, and script execution logged

This is the evolution from "expert tool" to "AI coworker platform." The 7-layer knowledge system provides the intelligence. The workflow engine provides the orchestration. The connection framework provides the real-world integration. Together, they create something no competitor currently offers.

---

*Document created: February 19, 2026*
*Author: Daniel Bardun / Claude*
*Project: openEXPERT by ANTON — FutureChain AB*
*Status: Specification for Claude Code implementation*
