# ANTON by openEXPERT — Event-Driven Workflow Triggers: Full Specification & Implementation Guide

> **Audience:** Claude Code  
> **Purpose:** Full briefing on extending ANTON's workflow engine with event-driven triggers — transforming workflows from human-initiated or clock-scheduled processes into reactive systems that respond to external events in real time. This document explains the strategic rationale, the architecture, how it connects to everything that already exists, and concrete guidance on how to implement it well.  
> **First step for Claude Code:** Before writing a single line of code, read this document fully, then explore the codebase to understand what already exists. The workflow engine is already built and running. The connections framework is already built. The MCP integration is already built. Everything in this document extends what is there — it does not replace or duplicate anything.  
> **Competitive context:** This specification was prompted by Cursor's March 2026 launch of "Automations" — event-triggered coding agents that respond to git commits, Slack messages, PagerDuty alerts, and timers. ANTON's workflow engine is architecturally more sophisticated than what Cursor offers (12 step types, expert persona injection, compliance-as-code, governance audit trails). What ANTON currently lacks is the event trigger layer that makes workflows reactive rather than scheduled. This specification closes that gap.

---

## 1. Context: What Already Exists and What This Adds

### What ANTON's Workflow Engine Can Do Today

The workflow engine (`workflow-engine.ts`) is fully operational with the following capabilities:

- **12 step types:** Module Execution (LLM), Wait, Approval (Human Gate), Email, Webhook (outbound API call), Extract, Transform, Conditional (branching/decision gate), Parallel, Loop, Export, Review
- **Visual workflow builder:** `WorkflowBuilder.tsx` — drag-and-connect step blocks with branching paths
- **Workflow monitor:** `WorkflowMonitor.tsx` — real-time step status, timing, logs
- **Scheduling:** `workflow_schedules` table with CRON expressions (e.g., `0 9 * * 1` for every Monday at 9 AM)
- **Execution tracking:** `workflow_definitions`, `workflow_runs`, `workflow_steps` tables
- **Human checkpoints:** Pause workflow, notify assignee, log decision, resume
- **Step assignment:** SLA tracking, overdue detection, parallel reviews with consensus
- **Output piping:** Each step's output available as input to subsequent steps via variable substitution

### What This Specification Adds

Currently, `workflow_definitions.trigger_type` supports two values: `"manual"` and `"scheduled"`. This specification adds **five new trigger types** and the infrastructure to support them:

1. **`"webhook"`** — An inbound HTTP endpoint that external systems can POST to, triggering a workflow
2. **`"git_push"`** — Triggered when a commit is pushed to a monitored repository (via git webhook)
3. **`"slack_event"`** — Triggered by a message or reaction in a configured Slack channel
4. **`"teams_event"`** — Triggered by a message or reaction in a configured Microsoft Teams channel
5. **`"mcp_event"`** — Triggered by an event received through an MCP connection (e.g., PagerDuty, Jira, ServiceNow)

It also adds:

- **An inbound webhook listener service** (`server/services/webhook-listener.ts`) that receives, validates, and routes incoming events
- **Event-to-workflow mapping** — configuration that determines which events trigger which workflows, with filtering and transformation
- **New database tables** for event registration, event logs, and trigger configuration
- **A new Step Type 13: Messaging** — send to Slack or Teams channels (complements the existing Email step type for chat-based notification)
- **Pre-built workflow templates** for common event-driven patterns, especially Continuous Code Review
- **An EventTriggersPage.tsx** for managing trigger configurations through the UI

### What This Specification Does NOT Change

- The existing 12 step types remain exactly as they are
- The existing workflow execution engine remains exactly as it is
- The existing CRON scheduling remains exactly as it is
- The existing WorkflowBuilder, WorkflowMonitor, and WorkflowsPage remain as they are (with additive UI for the new trigger types)
- The existing connections framework remains as it is (the webhook listener uses it, doesn't replace it)

This is an extension layer on top of a working system. The guiding principle is: **event-driven triggers are a new way to START a workflow — everything that happens after the trigger fires uses the existing engine unchanged.**

---

## 2. Strategic Rationale: Why This Matters Now

### The Shift from Prompt-and-Monitor to Reactive Automation

The dominant interaction pattern in AI-assisted work today is "prompt-and-monitor" — a human writes a prompt, waits for output, reviews it, then writes another prompt. ANTON's workflow engine improved on this by allowing multi-step automation with human checkpoints at the right places, but the initiation was still either manual (someone clicks "Run") or clock-based (CRON fires at 9 AM Monday).

Cursor's Automations launch (March 2026) reflects a broader industry shift: the most valuable automation is event-driven. A security review should happen when code changes — not at 9 AM Monday regardless of whether anything changed. An incident response workflow should start when PagerDuty fires — not when someone remembers to check. A compliance check should trigger when a regulatory radar item changes — not on a fixed monthly schedule.

### ANTON's Unique Advantage in This Space

What makes ANTON's event-driven workflows fundamentally different from Cursor's Automations:

1. **Domain expertise in every trigger response.** When a git push triggers a code review in Cursor, it runs a generic AI review. When a git push triggers a code review in ANTON, it runs through the Coding Area's Tier 1 with configurable expert lenses — Security Analyst, Compliance Officer, Solutions Architect, Product Manager — each backed by real domain knowledge from 29 expert areas. A commit to a KYC onboarding service doesn't just get "reviewed for bugs" — it gets reviewed for AMLR Article 4 compliance.

2. **Governance and audit trails.** Every event-triggered workflow execution is logged with the same audit trail as manual and scheduled workflows. The event payload is stored. The trigger mapping is versioned. The compliance-as-code rules apply to event-triggered outputs just as they do to manually triggered ones. This matters enormously in regulated industries.

3. **Human-in-the-loop at the right moments.** Cursor's Automations model keeps humans as recipients of automated output. ANTON's model keeps humans as decision-makers at configured checkpoints. An event-triggered workflow can run three automated steps and then pause for human approval before proceeding — the same checkpoint model that exists today, just triggered by an event instead of a human click.

4. **Cross-domain event correlation.** Because ANTON's workflow engine supports branching, parallel execution, and the knowledge graph, event-triggered workflows can correlate information across domains. A PagerDuty incident can trigger not just a log analysis but also a compliance impact assessment and a client communication draft — all in parallel, all drawing from different expert areas.

---

## 3. Architecture: The Event Trigger Layer

### Overview

The event trigger layer sits between external event sources and the existing workflow execution engine. Its job is simple: receive events, validate them, match them to workflow definitions, transform the event payload into workflow input variables, and call the existing workflow execution engine to start a run.

```
External Event Sources                    ANTON Platform
┌─────────────────────┐                  ┌─────────────────────────────────────┐
│ GitHub/GitLab       │──webhook POST──▶ │                                     │
│ Slack               │──webhook POST──▶ │  Webhook Listener Service           │
│ Microsoft Teams     │──webhook POST──▶ │  (server/services/webhook-listener) │
│ PagerDuty (via MCP) │──MCP event────▶  │                                     │
│ Jira (via MCP)      │──MCP event────▶  │  1. Receive & validate              │
│ Custom HTTP POST    │──webhook POST──▶ │  2. Authenticate (HMAC / token)     │
│ Regulatory Radar    │──internal─────▶  │  3. Match to trigger config         │
│ Compliance Rule     │──internal─────▶  │  4. Transform payload → variables   │
│ ANTON File Watcher  │──internal─────▶  │  5. Call workflow-engine.ts          │
│                     │                  │                                     │
└─────────────────────┘                  └──────────────┬──────────────────────┘
                                                        │
                                                        ▼
                                         ┌─────────────────────────────────────┐
                                         │  Existing Workflow Execution Engine  │
                                         │  (workflow-engine.ts)               │
                                         │                                     │
                                         │  Step 1 → Step 2 → Checkpoint →    │
                                         │  Step 3 → Decision Gate → ...       │
                                         │                                     │
                                         │  All 12 step types, all personas,   │
                                         │  all compliance rules, all audit    │
                                         └─────────────────────────────────────┘
```

### Key Design Decisions

**1. Thin trigger layer, thick execution engine.** The trigger layer does the minimum: receive, validate, match, transform, hand off. All intelligence — expert personas, compliance checking, branching, quality scoring — lives in the existing workflow engine. This means event-triggered workflows are exactly as powerful as manually triggered ones, with zero duplication.

**2. External events enter through a single endpoint.** All webhook-based triggers hit one route: `POST /api/webhooks/inbound/:trigger_id`. The `trigger_id` determines which trigger configuration to use for validation and routing. This keeps the API surface small and the security model consistent.

**3. Internal events use the same pipeline.** When ANTON's own systems generate events — a Regulatory Radar change detection, a Compliance Rule violation, a file change in a watched directory — they call the same trigger matching and workflow execution path. The only difference is that internal events skip HTTP validation (they're already authenticated by being inside the system).

**4. Event payloads are stored for audit and replay.** Every inbound event is logged to `webhook_events` with the full payload, the matched trigger, the workflow run it spawned (if any), and the processing outcome. This supports audit trails, debugging, and event replay for testing.

**5. Rate limiting and deduplication are built in.** External webhooks can fire rapidly (e.g., a burst of git pushes during a rebase). The trigger layer supports configurable rate limiting (max N triggers per time window) and deduplication (ignore events with the same signature within a cooldown period).

---

## 4. Database Schema Additions

These tables extend the existing Group 13 (Workflow Automation) in the database schema. They follow the same conventions: TEXT primary keys, datetime defaults, foreign key references to existing tables.

**Claude Code: read `server/db/schema_enhanced.sql` to see the existing table conventions before implementing these. Match column naming, type conventions, and index patterns exactly.**

### Table: `webhook_triggers`

Stores the configuration for each event trigger — what to listen for, how to validate it, which workflow to run, and how to map the event payload to workflow input variables.

```sql
CREATE TABLE webhook_triggers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  
  -- Trigger type: webhook, git_push, slack_event, teams_event, mcp_event, internal
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'webhook', 'git_push', 'slack_event', 'teams_event', 'mcp_event', 'internal'
  )),
  
  -- Which workflow to execute when this trigger fires
  workflow_id TEXT NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  
  -- Authentication configuration (JSON)
  -- For webhook: { "method": "hmac_sha256", "secret": "encrypted_value" }
  -- For git_push: { "method": "hmac_sha256", "secret": "encrypted_value", "provider": "github|gitlab|bitbucket" }
  -- For slack_event: { "method": "signing_secret", "secret": "encrypted_value" }
  -- For teams_event: { "method": "bearer_token", "token": "encrypted_value" }
  -- For mcp_event: { "mcp_server_id": "...", "event_type": "..." }
  -- For internal: { "source": "regulatory_radar|compliance_rules|file_watcher" }
  auth_config TEXT NOT NULL DEFAULT '{}',
  
  -- Event filtering (JSON) — only trigger if the event matches these conditions
  -- Examples:
  --   git_push: { "branch": "main", "file_patterns": ["src/**/*.ts", "!*.test.ts"] }
  --   slack_event: { "channel": "C1234567", "keywords": ["deploy", "incident"] }
  --   internal: { "radar_item_id": "...", "severity": ["critical", "high"] }
  filter_config TEXT NOT NULL DEFAULT '{}',
  
  -- Payload-to-variable mapping (JSON)
  -- Maps fields from the event payload to workflow input variables
  -- Example for git_push:
  -- {
  --   "commit_sha": "$.after",
  --   "branch": "$.ref",
  --   "author": "$.pusher.name",
  --   "commit_message": "$.head_commit.message",
  --   "changed_files": "$.commits[*].modified[*]",
  --   "repo_url": "$.repository.clone_url"
  -- }
  payload_mapping TEXT NOT NULL DEFAULT '{}',
  
  -- Rate limiting
  rate_limit_max INTEGER DEFAULT 10,            -- Max triggers per window
  rate_limit_window_seconds INTEGER DEFAULT 60,  -- Window size in seconds
  cooldown_seconds INTEGER DEFAULT 0,            -- Deduplication cooldown
  
  -- Status
  is_active INTEGER NOT NULL DEFAULT 1,
  
  -- Ownership and RBAC
  created_by TEXT DEFAULT 'default',
  
  -- Timestamps
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_webhook_triggers_type ON webhook_triggers(trigger_type);
CREATE INDEX idx_webhook_triggers_workflow ON webhook_triggers(workflow_id);
CREATE INDEX idx_webhook_triggers_active ON webhook_triggers(is_active);
```

### Table: `webhook_events`

Logs every inbound event for audit, debugging, and replay. This is the audit trail that makes event-driven workflows governance-compliant.

```sql
CREATE TABLE webhook_events (
  id TEXT PRIMARY KEY,
  trigger_id TEXT REFERENCES webhook_triggers(id) ON DELETE SET NULL,
  
  -- Event metadata
  trigger_type TEXT NOT NULL,
  source_ip TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  -- The raw event payload (JSON, stored for audit and replay)
  raw_payload TEXT NOT NULL,
  
  -- Parsed/transformed variables that were passed to the workflow (JSON)
  mapped_variables TEXT,
  
  -- Processing outcome
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN (
    'received',        -- Event received, not yet processed
    'validated',       -- Authentication passed
    'filtered_out',    -- Authentication passed but filter didn't match
    'rate_limited',    -- Rejected due to rate limiting
    'deduplicated',    -- Rejected as duplicate within cooldown window
    'triggered',       -- Workflow execution started
    'failed',          -- Processing failed (auth failure, workflow error, etc.)
    'replayed'         -- This is a replay of a previous event
  )),
  
  -- If triggered, which workflow run was created
  workflow_run_id TEXT REFERENCES workflow_runs(id) ON DELETE SET NULL,
  
  -- Error details if failed
  error_message TEXT,
  
  -- Processing duration in milliseconds
  processing_ms INTEGER,
  
  -- Deduplication signature (hash of key payload fields for cooldown matching)
  dedup_signature TEXT,
  
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_webhook_events_trigger ON webhook_events(trigger_id);
CREATE INDEX idx_webhook_events_status ON webhook_events(status);
CREATE INDEX idx_webhook_events_received ON webhook_events(received_at);
CREATE INDEX idx_webhook_events_dedup ON webhook_events(dedup_signature, received_at);
CREATE INDEX idx_webhook_events_workflow_run ON webhook_events(workflow_run_id);
```

### Table: `webhook_trigger_metrics`

Aggregated metrics for monitoring trigger health and activity. Updated asynchronously after event processing.

```sql
CREATE TABLE webhook_trigger_metrics (
  trigger_id TEXT PRIMARY KEY REFERENCES webhook_triggers(id) ON DELETE CASCADE,
  
  total_events INTEGER NOT NULL DEFAULT 0,
  total_triggered INTEGER NOT NULL DEFAULT 0,
  total_filtered INTEGER NOT NULL DEFAULT 0,
  total_rate_limited INTEGER NOT NULL DEFAULT 0,
  total_failed INTEGER NOT NULL DEFAULT 0,
  
  last_event_at TEXT,
  last_triggered_at TEXT,
  last_failed_at TEXT,
  
  -- Average processing time in ms (rolling average)
  avg_processing_ms REAL DEFAULT 0,
  
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Update to Existing Table: `workflow_definitions`

The existing `trigger_type` field in `workflow_definitions` needs its CHECK constraint extended (if it has one) to accept the new values. If the field is unconstrained TEXT, no schema change is needed — just ensure the workflow engine's routing logic handles the new types.

**Claude Code: check the actual schema of `workflow_definitions` before modifying. If there's a CHECK constraint, extend it. If there isn't, leave the schema alone and handle it in application logic.**

---

## 5. The Webhook Listener Service

### File: `server/services/webhook-listener.ts`

This is the core new service. It handles inbound event reception, validation, filtering, transformation, and handoff to the workflow engine.

**Claude Code: read `server/services/workflow-engine.ts` and `server/services/connection-manager.ts` carefully before implementing this. Match the service patterns — how errors are handled, how logging works, how database queries are structured, how the service exports its interface.**

### Responsibilities

**1. Event Reception**

The service exposes a single inbound route: `POST /api/webhooks/inbound/:trigger_id`

When a request arrives:
- Look up the `trigger_id` in `webhook_triggers`
- If not found or not active, return 404
- Log the raw event to `webhook_events` with status `received`
- Proceed to validation

For internal events (Regulatory Radar changes, Compliance Rule violations, file system changes), the service exposes an internal function `processInternalEvent(source, payload)` that skips HTTP-specific validation and enters the pipeline at the filtering stage.

**2. Authentication & Validation**

Based on `auth_config.method`:

- **`hmac_sha256`** (GitHub, GitLab, generic webhooks): Compute HMAC-SHA256 of the raw request body using the stored secret. Compare against the signature header (`X-Hub-Signature-256` for GitHub, `X-Gitlab-Token` for GitLab, configurable header for generic). Reject if mismatch.

- **`signing_secret`** (Slack): Follow Slack's signing secret verification protocol — compute signature from timestamp + body, compare against `X-Slack-Signature` header.

- **`bearer_token`** (Teams, generic): Check `Authorization: Bearer <token>` header against stored token.

- **`none`** (internal events, development/testing): No authentication. Only allowed for `trigger_type: "internal"` or when `NODE_ENV=development`.

On validation failure: update event status to `failed`, store error, return 401.
On validation success: update event status to `validated`, proceed to filtering.

**Important security note:** All secrets in `auth_config` must be encrypted at rest using the same encryption used for connection credentials in `connection-manager.ts`. Claude Code should use the existing encryption functions, not create new ones.

**3. Event Filtering**

Based on `filter_config`, check whether the event payload matches the configured conditions. Filters are AND-combined (all must match):

- **`branch`** (git_push): Match against `$.ref` — e.g., only trigger for `refs/heads/main`
- **`file_patterns`** (git_push): Glob match against changed files — e.g., `["src/**/*.ts", "!*.test.ts"]` means "TypeScript files in src, excluding tests"
- **`channel`** (slack_event): Match against the channel ID
- **`keywords`** (slack_event): Check if the message text contains any of the keywords (case-insensitive)
- **`event_type`** (mcp_event): Match against the MCP event type field
- **`severity`** (internal/compliance): Match against severity level
- **`radar_item_id`** (internal/radar): Match against specific radar item

If filters don't match: update event status to `filtered_out`, return 200 (acknowledge receipt but don't trigger).
If filters match: proceed to rate limiting.

**4. Rate Limiting & Deduplication**

Check the trigger's `rate_limit_max` and `rate_limit_window_seconds`:
- Count events with status `triggered` for this `trigger_id` within the window
- If count >= max, update status to `rate_limited`, return 429

Check deduplication:
- Compute a `dedup_signature` from key payload fields (configurable per trigger type — for git_push it's the commit SHA, for slack it's the message timestamp)
- Check if an event with the same signature exists within `cooldown_seconds`
- If duplicate found, update status to `deduplicated`, return 200

If both checks pass: proceed to transformation.

**5. Payload Transformation**

Using the `payload_mapping` configuration, extract values from the raw event payload and map them to workflow input variables. The mapping uses JSONPath expressions:

```json
{
  "commit_sha": "$.after",
  "branch": "$.ref",
  "author": "$.pusher.name",
  "changed_files": "$.commits[*].modified[*]",
  "repo_url": "$.repository.clone_url"
}
```

The result is a flat key-value object that becomes the workflow run's input variables, accessible to all steps via `${trigger.commit_sha}`, `${trigger.branch}`, etc.

Store the mapped variables in `webhook_events.mapped_variables`.

**6. Workflow Execution Handoff**

Call the existing workflow engine's execution function with:
- The `workflow_id` from the trigger configuration
- The mapped variables as the workflow's input context
- A metadata object linking back to the event ID for audit

Update event status to `triggered`, store the `workflow_run_id`.

Return 200 to the caller with `{ "status": "triggered", "workflow_run_id": "..." }`.

### Error Handling

Any failure at any stage:
- Update the event's status to `failed`
- Store the error message
- Log to the application error log
- Return an appropriate HTTP status (401, 429, 500) for external callers
- Never expose internal error details in HTTP responses (log them server-side only)

### Async Processing Option

For events that require heavy processing (large payloads, complex filters), the service should support an async mode:
- Immediately return 200 with `{ "status": "accepted", "event_id": "..." }`
- Process the event asynchronously
- Update `webhook_events` with the outcome

This is important because webhook providers (GitHub, Slack) have timeout expectations — typically 3-5 seconds. If validation + filtering + workflow initiation takes longer, the synchronous response will time out and the provider may retry, causing duplicates.

**Claude Code: implement the synchronous path first. Add async processing (via a simple queue or setImmediate) as a follow-up if testing reveals timeout issues.**

---

## 6. New Step Type 13: Messaging (Slack / Teams)

### Why This Is Needed

The existing Email step type (Step 8) handles notification via email. But modern professional workflows increasingly use Slack and Teams as primary communication channels. Event-driven workflows especially need to post results to chat channels — a code review triggered by a git push should post its findings to the team's Slack channel, not send an email that gets buried.

### How It Works

Step Type 13: Messaging sends a formatted message to a Slack channel or Microsoft Teams channel.

**Configuration:**

```json
{
  "type": "messaging",
  "platform": "slack",               // "slack" or "teams"
  "channel": "#code-reviews",         // Channel name or ID
  "connection_id": "slack_conn_123",  // Reference to connections framework
  "message_template": {
    "title": "Code Review: ${trigger.branch}",
    "body": "${step_3.output.summary}",
    "severity": "${step_3.output.max_severity}",
    "link": "${trigger.repo_url}/commit/${trigger.commit_sha}"
  },
  "format": "structured"             // "plain" or "structured" (uses blocks/cards)
}
```

**For Slack:** Uses the Slack Web API (`chat.postMessage`) via a configured Slack bot connection in the connections framework. Structured format uses Slack Block Kit for rich formatting (headers, sections, dividers, action buttons).

**For Teams:** Uses the Microsoft Teams webhook or Graph API via a configured Teams connection. Structured format uses Adaptive Cards.

**Connection to existing platform:** This step type uses the connections framework (`connection-manager.ts`) for credential management and API access. It does not create a separate Slack/Teams integration — it registers Slack and Teams as connection types in the existing framework, alongside Database, API, Filesystem, Email, and Script.

**Claude Code: check if Slack or Teams connection types already exist in the connections framework. If they do, use them. If they don't, add them following the existing adapter pattern (see how database and API adapters are structured).**

### Slack / Teams as Connection Types

Add to the connections framework:

**Slack Connection:**
- Connection type: `slack`
- Required config: Bot token (encrypted), Default channel (optional)
- Test connection: Call `auth.test` to verify token validity
- Audit logging: Log every message sent (channel, timestamp, trigger context)

**Teams Connection:**
- Connection type: `teams`
- Required config: Webhook URL or Graph API credentials (encrypted), Default channel (optional)
- Test connection: Send a test message to the configured channel
- Audit logging: Same as Slack

---

## 7. Internal Event Sources

Three existing ANTON subsystems should emit events that can trigger workflows. This turns existing monitoring capabilities into proactive automation.

### 7.1 Regulatory Radar → Workflow Trigger

**Current state:** The Regulatory Radar (`server/services/regulatory-radar.ts`) detects changes in tracked regulations and creates alerts in `radar_alerts`. Users see these alerts and manually decide what to do.

**Enhancement:** When a regulatory change is detected, emit an internal event to the webhook listener:

```typescript
webhookListener.processInternalEvent('regulatory_radar', {
  source: 'regulatory_radar',
  radar_item_id: item.id,
  change_type: change.type,       // 'new_publication', 'amendment', 'consultation_closed'
  jurisdiction: item.jurisdiction,
  topic: item.topic,
  severity: change.severity,
  summary: change.summary,
  url: change.url
});
```

**Example workflow:** "When a new EU AML RTS is published, automatically run an impact analysis against our current gap assessment, draft a summary for the compliance team, and post it to the #regulatory-updates Slack channel."

### 7.2 Compliance Rule Violation → Workflow Trigger

**Current state:** Compliance-as-code rules (`server/services/compliance-rules.ts`) detect violations and log them to `rule_violations`. Users see violations on the Compliance Dashboard.

**Enhancement:** When a critical or high-severity violation is detected, emit an internal event:

```typescript
webhookListener.processInternalEvent('compliance_rules', {
  source: 'compliance_rules',
  rule_id: rule.id,
  rule_name: rule.name,
  severity: violation.severity,     // 'critical', 'high', 'medium', 'low'
  session_id: violation.session_id,
  evidence: violation.evidence
});
```

**Example workflow:** "When a critical compliance violation is detected, pause the session output, notify the compliance officer via Slack, create a remediation task, and log the incident for quarterly audit reporting."

### 7.3 File System Watcher → Workflow Trigger

**New capability:** A lightweight file watcher that monitors configured directories for changes.

**Use case:** When a new file is dropped in a shared directory (e.g., a client uploads a document to a shared folder, an export from another system lands in a watched directory), automatically trigger a workflow.

**Implementation:** Use Node.js `fs.watch` or `chokidar` (if already in dependencies) to monitor configured paths. Emit internal events on file creation, modification, or deletion.

```typescript
webhookListener.processInternalEvent('file_watcher', {
  source: 'file_watcher',
  event_type: 'created',          // 'created', 'modified', 'deleted'
  file_path: '/data/incoming/client_report.pdf',
  file_name: 'client_report.pdf',
  file_size: 245678,
  directory: '/data/incoming/'
});
```

**Example workflow:** "When a new PDF is dropped in the `/data/incoming/regulatory/` folder, automatically extract its contents, run a regulatory impact analysis module, and append findings to the current project."

**Claude Code: check if `chokidar` is already in `package.json`. If so, use it. If not, use native `fs.watch` with a debounce wrapper to handle the double-fire issue that `fs.watch` is known for.**

---

## 8. Pre-Built Workflow Templates

These are ready-to-use workflow definitions that ship with ANTON, demonstrating the power of event-driven triggers and giving users a starting point they can customise.

### Template 1: Continuous Code Review (Coding Area Integration)

**Trigger:** `git_push` on configured branches (`main`, `develop`)

**Workflow:**
```
Step 1: [Extract] Parse changed files from git push payload
Step 2: [Module Execution] Run Coding Area Tier 1 - Code Review & Explain
        - Explanation level: Medium
        - Review lenses: Professional Developer + Security Review
        - Input: Changed files from Step 1
Step 3: [Decision Gate] If max severity >= "high" → Step 4a; else → Step 4b
Step 4a: [Checkpoint] Notify senior developer for manual review (Slack message + pause)
Step 4b: [Messaging] Post summary to #code-reviews Slack channel
Step 5: [Export] Save review as versioned output in project
```

**Why this matters:** This is the direct competitive response to Cursor's Bugbot/Automations model — but with ANTON's multi-lens expert review instead of generic AI review. A commit to a financial services application gets reviewed not just for bugs but for AMLR compliance, DORA ICT risk requirements, and architectural soundness, all automatically.

### Template 2: Incident Response Pipeline

**Trigger:** `mcp_event` from PagerDuty or `webhook` from monitoring system

**Workflow:**
```
Step 1: [Extract] Parse incident details (severity, service, description)
Step 2: [Module Execution] Run Cybersecurity Area - Incident Analysis
        - Persona: Security Analyst
        - Input: Incident details + relevant service architecture docs
Step 3: [Parallel]
        a: [Module Execution] Run Risk Assessment for business impact
        b: [Script Execution] Query server logs via MCP connection
Step 4: [Transform] Combine analysis + logs into incident brief
Step 5: [Messaging] Post incident brief to #incidents Slack channel
Step 6: [Checkpoint] Incident commander reviews and decides: escalate or resolve
Step 7: [Conditional] If escalate → create tasks + notify management; if resolve → close
```

### Template 3: Regulatory Change Auto-Response

**Trigger:** `internal` from Regulatory Radar (change detected)

**Workflow:**
```
Step 1: [Extract] Parse regulatory change details
Step 2: [Module Execution] Run FCP Area - Regulatory Impact Analysis
        - Input: Change summary + current organisational gap assessment
Step 3: [Module Execution] Run Strategy Area - Action Plan Generator
        - Input: Impact analysis from Step 2
Step 4: [Messaging] Post impact summary to #regulatory-updates
Step 5: [Email] Send detailed report to Compliance Director
Step 6: [Export] Save as PDF to regulatory tracking project
```

### Template 4: Compliance Violation Escalation

**Trigger:** `internal` from Compliance-as-Code (critical violation)

**Workflow:**
```
Step 1: [Extract] Parse violation details (rule, severity, session, evidence)
Step 2: [Messaging] Alert #compliance-alerts Slack channel
Step 3: [Checkpoint] Compliance officer reviews: remediate or accept risk
Step 4: [Conditional] If remediate → create remediation task with deadline;
                      If accept risk → log exemption request
Step 5: [Export] Append to quarterly compliance audit log
```

### Template 5: Client Document Intake

**Trigger:** `internal` from File Watcher (new file in intake directory)

**Workflow:**
```
Step 1: [Extract] Parse file metadata (name, type, size)
Step 2: [Module Execution] Run appropriate analysis module based on file type:
        - PDF: Document Review module
        - XLSX: Data Quality Assessment module
        - DOCX: Content Analysis module
Step 3: [Module Execution] Run Compliance Check on extracted content
Step 4: [Messaging] Notify intake team on Slack with summary
Step 5: [Checkpoint] Analyst reviews and assigns to project
```

---

## 9. UI: EventTriggersPage.tsx

A new page in the platform for managing event-driven triggers. This page sits alongside the existing WorkflowsPage and WorkflowBuilder.

### Navigation

Add "Event Triggers" as a sub-navigation item under the existing Workflows section. The navigation flow is:

```
Workflows (existing)
├── All Workflows (WorkflowsPage.tsx — existing)
├── Workflow Builder (WorkflowBuilder.tsx — existing)
├── Workflow Monitor (WorkflowMonitor.tsx — existing)
└── Event Triggers (EventTriggersPage.tsx — NEW)
```

### Page Layout

**Header section:**
- Title: "Event Triggers"
- Subtitle: "Automatically start workflows when external events occur"
- "Create Trigger" button (opens creation flow)
- Stats bar: Active triggers count, Events received (24h), Workflows triggered (24h)

**Trigger list:**
Each trigger shown as a card with:
- Name, description, trigger type icon (git, Slack, Teams, webhook, internal)
- Connected workflow name (clickable link to WorkflowBuilder)
- Status badge: Active / Paused / Error
- Last event received timestamp
- Events (24h) / Triggered (24h) / Filtered (24h) counters
- Actions: Edit, Pause/Resume, View Event Log, Delete

**Event log panel** (opens as side panel or modal when "View Event Log" is clicked):
- Scrollable list of recent events for this trigger
- Each event shows: timestamp, status badge (triggered/filtered/rate_limited/failed), payload preview, workflow run link (if triggered)
- Filter by status
- "Replay" button on individual events (re-processes the event for testing)

### Trigger Creation Flow

A guided multi-step form:

**Step 1: Trigger Type**
Select the event source: Git Push, Slack Message, Teams Message, Webhook (generic), MCP Event, Internal (Regulatory Radar / Compliance Rules / File Watcher)

**Step 2: Connection & Authentication**
Based on trigger type, configure the connection:
- Git Push: Select git provider (GitHub/GitLab/Bitbucket), auto-generate webhook URL and HMAC secret, show instructions for adding the webhook to the repository settings
- Slack: Select or create a Slack connection, configure channel(s) to monitor
- Teams: Select or create a Teams connection, configure channel(s)
- Webhook: Auto-generate webhook URL and secret, show cURL example
- MCP: Select existing MCP connection, configure event type filter
- Internal: Select source system and configure filter

**Step 3: Filters**
Configure event filtering based on trigger type:
- Git Push: Branch filter, file pattern filter (with glob syntax helper)
- Slack/Teams: Channel filter, keyword filter
- Webhook: JSONPath condition builder
- Internal: Severity filter, item filter

**Step 4: Workflow & Mapping**
- Select the workflow to trigger (dropdown of existing workflow definitions)
- Configure payload-to-variable mapping with a visual mapper:
  Left column: Available payload fields (auto-detected from trigger type — e.g., for GitHub: `commit_sha`, `branch`, `author`, `changed_files`, `commit_message`, `repo_url`)
  Right column: Workflow input variables
  Drag or select to connect them

**Step 5: Rate Limiting & Review**
- Configure rate limit (max events per minute/hour)
- Configure deduplication cooldown
- Review summary of the complete trigger configuration
- "Create & Activate" or "Create as Paused" buttons

### WorkflowBuilder Enhancement

The existing WorkflowBuilder should show the trigger type as part of the workflow header:

```
┌────────────────────────────────────────────────────────────┐
│ Workflow: Continuous Code Review                           │
│ Trigger: 🔗 Git Push (main branch)  [Edit Trigger]       │
│          ⏰ Also scheduled: Every Monday 9 AM             │
├────────────────────────────────────────────────────────────┤
│ [START: Git Push Event]                                   │
│    │                                                       │
│    ├──[1. Extract changed files]──────────────────────────│
│    ...                                                     │
```

A workflow can have multiple triggers — both a CRON schedule AND an event trigger. The execution engine doesn't care how the run was initiated.

---

## 10. API Routes

### New Routes

**Inbound webhook endpoint:**
```
POST /api/webhooks/inbound/:trigger_id
```
- Public-facing (no ANTON auth required — authenticated by trigger-specific mechanism)
- Rate limited at the infrastructure level as well as the application level

**Trigger management (RBAC-protected):**
```
GET    /api/triggers              — List all triggers (with metrics)
GET    /api/triggers/:id          — Get trigger details
POST   /api/triggers              — Create new trigger
PUT    /api/triggers/:id          — Update trigger
DELETE /api/triggers/:id          — Delete trigger
PATCH  /api/triggers/:id/status   — Activate/pause trigger
```

**Event log (RBAC-protected):**
```
GET    /api/triggers/:id/events           — List events for trigger (paginated)
GET    /api/triggers/:id/events/:event_id — Get event details
POST   /api/triggers/:id/events/:event_id/replay — Replay an event
```

**Metrics:**
```
GET    /api/triggers/:id/metrics  — Get trigger metrics
GET    /api/triggers/metrics/summary — Aggregate metrics across all triggers
```

**Claude Code: follow the existing route pattern in `server/routes/`. Check how other route files are structured — middleware, error handling, response format — and match them exactly.**

---

## 11. Security Considerations

### Authentication

Every trigger type has a mandatory authentication mechanism. The `auth_config.method: "none"` option is only available for:
- `trigger_type: "internal"` (events from within ANTON)
- `NODE_ENV: "development"` (for testing)

In production, every external trigger MUST have authentication configured. The trigger creation UI should enforce this.

### Secret Management

Webhook secrets, Slack signing secrets, and API tokens must be encrypted at rest. Use the same encryption mechanism as `connection-manager.ts` uses for database credentials. Never log secrets. Never include secrets in API responses. Never include secrets in audit log entries.

**Claude Code: find how `connection-manager.ts` encrypts credentials and use the same approach. Do not implement a separate encryption mechanism.**

### Rate Limiting

Two layers of rate limiting:

1. **Infrastructure level:** The inbound webhook route should have a global rate limit (e.g., 100 requests per minute per IP) to prevent denial-of-service. Use the same rate limiting middleware as other API routes if one exists.

2. **Trigger level:** Each trigger has its own `rate_limit_max` and `rate_limit_window_seconds`. This prevents a single misconfigured or noisy webhook from overwhelming the system.

### Payload Size Limits

Reject inbound payloads larger than 1MB. Most webhook payloads are well under this (GitHub push events are typically 5-50KB), but a malicious sender could attempt to send large payloads to consume memory.

### Input Validation

All JSONPath expressions in `payload_mapping` must be validated before execution. Never use `eval()` or dynamic code execution for payload transformation. Use a dedicated JSONPath library (e.g., `jsonpath-plus` or `jsonpath`) that doesn't execute arbitrary code.

### Audit Trail

Every event is logged to `webhook_events` regardless of outcome. This creates a complete, immutable audit trail of:
- What events were received
- Whether they were authenticated successfully
- Whether they matched filters
- Whether they triggered workflows
- Which workflow runs they created

This is essential for regulated industries where "what triggered this action and when" must be answerable.

---

## 12. Integration with the Coding Area

This section describes how event-driven triggers enhance the Coding Area specification (see `CODING_AREA_SPEC.md`).

### Continuous Code Review Mode

Tier 1 (Code Review & Explain) currently requires a user to paste code or provide a repository path. With event-driven triggers, Tier 1 gains a "Continuous Review" mode:

1. User configures a git webhook trigger pointing to their repository
2. User configures which review lenses to apply automatically (security, compliance, architecture, etc.)
3. On every push to configured branches, ANTON automatically:
   - Fetches the changed files (via the repository connection)
   - Runs the configured review lenses
   - Stores the review as a versioned output
   - Posts a summary to the configured messaging channel
   - Escalates critical findings to a human checkpoint

This is the Continuous Review template from Section 8, but integrated into the Coding Area UI. The `CodingLandingPage.tsx` should have a "Continuous Review" option alongside the existing manual review mode.

### Coding Large — Automated Test Execution

For Coding Large projects (Tier 4), event-driven triggers enable automated test execution on code changes:

- A git push trigger monitors the project repository
- When changes land in the project's codebase, the test suite (defined in the project's release plan) is automatically executed
- Results are posted to the project's communication channel
- If tests fail, a checkpoint is created for the assigned developer

This connects the Coding Area's release management with the workflow engine's event-driven execution — no new infrastructure needed, just a workflow template that combines existing capabilities.

### AI Code Instruction Builder — Event-Driven Validation

The AI Code Instruction Builder (specified in CODING_AREA_SPEC) generates structured prompts for external coding tools like Claude Code and Cursor. With event-driven triggers, the Project Alignment Reviewer can be triggered automatically when a commit appears in the project repository, comparing the implementation against the generated instructions and flagging deviations.

---

## 13. Connection to the .anton Export Format

Event trigger configurations should be exportable as part of workflow bundles in the `.anton` format. When a workflow with event triggers is exported:

- The `workflow_definition` is included as currently specified
- A new `trigger_configs` array is added to the bundle, containing the trigger configurations (with secrets redacted — replaced by placeholder markers)
- On import, ANTON presents the trigger configurations and asks the user to provide their own secrets (webhook secrets, Slack tokens, etc.)

**Bundle type:** No new bundle type needed. Trigger configs are embedded in the existing `workflow` bundle type as an additional field.

**Claude Code: check `anton-bundler.ts` for the workflow bundle type structure and extend it with an optional `trigger_configs` field. Follow the existing bundler pattern exactly.**

---

## 14. Summary of What to Build, in Suggested Order

1. **Codebase audit** — Read and understand before writing anything. Key files: `workflow-engine.ts`, `connection-manager.ts`, `scheduler.ts`, `WorkflowBuilder.tsx`, `WorkflowsPage.tsx`, `WorkflowMonitor.tsx`, `server/db/schema_enhanced.sql` (Group 13 tables), `server/routes/` (route patterns), `anton-bundler.ts`, `compliance-rules.ts`, `regulatory-radar.ts`. Understand how workflow runs are initiated today, how connections store encrypted credentials, how routes are structured.

2. **Database schema additions** — Add `webhook_triggers`, `webhook_events`, `webhook_trigger_metrics` tables following existing conventions. Verify `workflow_definitions.trigger_type` can accept new values.

3. **Webhook listener service** (`server/services/webhook-listener.ts`) — Core event processing pipeline: receive → validate → filter → rate limit → deduplicate → transform → hand off to workflow engine. Start with the synchronous path.

4. **API routes for trigger management** (`server/routes/triggers.ts`) — CRUD for triggers, event log retrieval, replay endpoint. Follow existing route patterns.

5. **Inbound webhook route** (`server/routes/webhooks.ts`) — The public-facing `POST /api/webhooks/inbound/:trigger_id` endpoint. Separate from the RBAC-protected management routes.

6. **Slack and Teams connection adapters** — Add to the existing connections framework. Follow the adapter pattern used for database and API connections.

7. **Step Type 13: Messaging** — Add to the workflow engine's step type handling. Implement Slack and Teams message sending via the connections framework.

8. **Internal event emitters** — Add event emission to `regulatory-radar.ts` and `compliance-rules.ts`. Add file watcher capability (optional — lower priority).

9. **EventTriggersPage.tsx** — Trigger management UI with creation wizard, event log panel, metrics display.

10. **WorkflowBuilder enhancement** — Show trigger type in workflow header, allow multiple triggers per workflow.

11. **Pre-built workflow templates** — Seed the Continuous Code Review, Incident Response, Regulatory Change, Compliance Violation, and Client Document Intake templates.

12. **Coding Area integration** — Add Continuous Review mode to `CodingLandingPage.tsx`, connecting Tier 1 Code Review to git push triggers.

13. **.anton export/import extension** — Add `trigger_configs` to workflow bundle exports, with secret redaction on export and re-entry on import.

14. **Integration testing** — Verify end-to-end: send a simulated GitHub webhook → trigger fires → workflow executes → output is produced → message is sent to Slack → audit trail is complete.

At every step, the guiding question is: **does this extend the existing system cleanly, or does it create a parallel path?** It must extend. The webhook listener calls the workflow engine. The messaging step uses the connections framework. The triggers use the same RBAC as workflows. The audit trail uses the same logging patterns. The exports use the same bundler. There are no standalone subsystems here — only extensions to what already works.

---

## 15. Whitepaper Integration Notes

This capability should be integrated into the whitepaper as an extension of §26 (Workflow Automation & Scheduling). Key points for the whitepaper:

- Position as "Reactive Workflows" — workflows that respond to events in real time, not just on schedules
- Emphasise the governance advantage over Cursor's Automations: every event is logged, every trigger is auditable, compliance rules apply to event-triggered outputs
- Emphasise the domain expertise advantage: event-triggered code reviews use 29 expert areas, not generic AI review
- Use the Continuous Code Review template as the flagship example — it's the most visually compelling and directly competitive with Cursor
- Note that internal event sources (Regulatory Radar, Compliance Rules) create a self-reinforcing system: ANTON's monitoring capabilities automatically feed ANTON's action capabilities

The roadmap section (§44) should be updated to move webhook integrations from Q3-Q4 2026 to Q2 2026, reflecting the competitive urgency.

---

*Written for Claude Code as a comprehensive briefing and implementation guide.*  
*Version 1.0 — March 2026*  
*Author: Daniel Bardun, FutureChain AB / ANTON by openEXPERT*  
*Prompted by: Cursor Automations launch analysis, March 5, 2026*
