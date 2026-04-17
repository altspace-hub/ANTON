# ANTON Missions — Spec Addendum: Scenario Gaps & Autonomous Business Use Cases

**Version:** 1.1.0 (Addendum to ANTON_MISSIONS_SPEC_AND_CLAUDE_CODE_BRIEF.md v1.0.0)  
**Date:** April 15, 2026  
**Author:** Daniel Bardun / Claude (Strategic Partner)  
**Status:** Addendum — Extends the base specification

---

## PART 1: ARCHITECTURAL GAPS IDENTIFIED THROUGH SCENARIO TESTING

Eight mission scenarios were simulated end-to-end against the base specification. The following gaps were identified and require additions to the architecture.

---

### A1. Mission Output Delivery

**Problem:** Missions produce deliverables (DOCX reports, XLSX matrices, PPTX decks), but the spec only describes storing them in the database and notifying the human. There's no mechanism to *deliver* outputs to where the human actually needs them.

**Solution:** Add a `delivery_config` field to the mission brief and a `MissionDeliveryService` that routes completed outputs.

**Delivery channels:**

| Channel | Implementation | Use Case |
|---|---|---|
| In-app notification + download | Native (already partially exists) | Default — user checks Mission Dashboard |
| Email with attachment | SMTP step type (existing) + file attachment | "Email me the report when it's done" |
| Google Drive upload | Google Drive MCP / API | "Put it in our shared compliance folder" |
| SharePoint upload | Microsoft Graph API | Enterprise document management |
| Slack file upload | Slack MCP | "Post it in #compliance-reports" |
| Webhook POST | Existing webhook step type | Custom integration — send to any system |

**Mission brief addition:**

```json
{
  "delivery_config": {
    "channels": [
      { "type": "email", "to": ["compliance-team@advisense.com"], "subject_template": "AMLR Report — ${month}" },
      { "type": "google_drive", "folder_id": "1a2b3c...", "filename_template": "AMLR_Report_${date}.docx" },
      { "type": "slack", "channel": "#compliance-reports", "message": "Monthly AMLR report ready." }
    ],
    "deliver_on": "completion",
    "include_summary": true
  }
}
```

**Database:**

```sql
ALTER TABLE missions ADD COLUMN delivery_config TEXT DEFAULT '{}';

CREATE TABLE mission_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id TEXT NOT NULL,
    channel TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'delivered', 'failed')),
    output_files TEXT DEFAULT '[]',
    delivery_details TEXT DEFAULT '{}',
    delivered_at DATETIME,
    error_message TEXT,
    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE
);
```

---

### A2. Internal Scheduling Queue (One-Off Timed Tasks)

**Problem:** A marketing mission needs to post content on specific future dates ("post article A on April 20, post B on April 27"). CRON handles recurring schedules, but not one-off timed tasks within a mission.

**Solution:** A `mission_scheduled_tasks` table that the Mission Scheduler checks alongside CRON jobs.

```sql
CREATE TABLE mission_scheduled_tasks (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    execute_at DATETIME NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'executing', 'completed', 'failed', 'cancelled')),
    payload TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    executed_at DATETIME,
    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES mission_tasks(id)
);

CREATE INDEX idx_scheduled_tasks_execute ON mission_scheduled_tasks(execute_at, status);
```

The Mission Scheduler polls this table (alongside CRON) and executes tasks when `execute_at <= now() AND status = 'pending'`.

---

### A3. Document Intake Pipeline

**Problem:** Missions that process incoming documents (CVs arriving by email, regulatory publications appearing on a website, invoices from suppliers) need to detect new documents, download them, extract text, and feed them into the mission context.

**Solution:** A `DocumentIntakeService` that bridges MCP/webhook/browser sources with the knowledge source system.

```
Incoming document detected
  ├─ Source: Gmail MCP (new email with attachment)
  ├─ Source: Webhook (external system posts a document URL)
  ├─ Source: Browser automation (new file on a monitored page)
  └─ Source: Watched local folder (file appears)
        │
        ▼
  DocumentIntakeService
  ├─ Download / extract file
  ├─ Detect type (PDF, DOCX, XLSX, image)
  ├─ Extract text (reuse existing file-processor.ts)
  ├─ Create knowledge atom(s) from extracted content
  ├─ Tag with mission_id and intake metadata
  ├─ Log to mission_activity
  └─ If mission has a task waiting on this intake → unblock it
```

**Database:**

```sql
CREATE TABLE mission_document_intake (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK(source_type IN ('email', 'webhook', 'browser', 'folder', 'api')),
    source_details TEXT DEFAULT '{}',
    filename TEXT,
    file_type TEXT,
    file_size INTEGER,
    extracted_text_preview TEXT,
    atom_ids TEXT DEFAULT '[]',
    status TEXT DEFAULT 'processed' CHECK(status IN ('received', 'processing', 'processed', 'failed')),
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME,
    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE
);
```

---

### A4. Mission-Scoped Structured Storage

**Problem:** Some missions accumulate structured data that doesn't fit the knowledge atom model — candidate rankings in a recruitment mission, product price comparisons in a shopping mission, lead scores in a sales mission. Knowledge atoms are unstructured insights; these need rows and columns.

**Solution:** A lightweight JSON-table store scoped to each mission.

```sql
CREATE TABLE mission_data_tables (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    table_name TEXT NOT NULL,
    schema_definition TEXT NOT NULL,    -- JSON schema for columns
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
    UNIQUE(mission_id, table_name)
);

CREATE TABLE mission_data_rows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_id TEXT NOT NULL,
    row_data TEXT NOT NULL,            -- JSON object matching schema
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (table_id) REFERENCES mission_data_tables(id) ON DELETE CASCADE
);
```

**Example — Recruitment mission:**

```json
// mission_data_tables entry
{
  "table_name": "candidates",
  "schema_definition": {
    "name": "string",
    "email": "string",
    "source": "string",
    "cv_atom_id": "string",
    "technical_score": "number",
    "experience_score": "number",
    "culture_score": "number",
    "overall_rank": "number",
    "status": "string",
    "notes": "string"
  }
}
```

The Mission Dashboard renders these tables in a sortable/filterable view. The LLM can query and update them during task execution.

---

### A5. "Stage and Hold" Browser Transactions

**Problem:** When ANTON books a flight, purchases ad inventory, or submits a regulatory filing, it needs to navigate to the final confirmation screen, present it to the human, and wait for approval before clicking "confirm."

**Solution:** A new Service Pack workflow step type: `stage_for_approval`.

```json
{
  "action": "stage_for_approval",
  "description": "Booking confirmation — ready to pay",
  "capture": {
    "screenshot": true,
    "page_text": true,
    "key_fields": {
      "total_price": "#total-amount",
      "booking_reference": ".confirmation-ref",
      "items": ".booking-summary li"
    }
  },
  "approval_message": "Ready to book: ${key_fields.items}. Total: ${key_fields.total_price}. Approve?",
  "on_approve": { "action": "click", "element": "#confirm-button" },
  "on_reject": { "action": "navigate", "url": "about:blank" },
  "timeout_minutes": 60,
  "on_timeout": "reject"
}
```

The browser session stays alive (with the page open) during the approval window. If the human doesn't respond within the timeout, the transaction is abandoned. This prevents ANTON from holding payment pages open indefinitely.

**Governance:** Any task containing a `stage_for_approval` step is automatically classified as high-impact and requires human approval regardless of mission autonomy level.

---

### A6. Multi-Track Missions (Standing Sub-Missions)

**Problem:** "ANTON as HR department" or "ANTON as business operations" requires multiple independent concurrent workstreams within a single mission — each with its own triggers, task graphs, and checkpoints, but sharing mission context and data scope.

**Solution:** Extend the mission model with **tracks**.

```sql
CREATE TABLE mission_tracks (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    track_type TEXT DEFAULT 'batch' CHECK(track_type IN ('batch', 'recurring', 'interactive', 'event_driven')),
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused', 'completed')),
    trigger_config TEXT DEFAULT '{}',    -- CRON, webhook URL, event type
    hot_context TEXT,                    -- Pre-loaded context for interactive tracks
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE
);

-- Extend mission_tasks to belong to a track
ALTER TABLE mission_tasks ADD COLUMN track_id TEXT;
```

**Track types:**

| Type | Wake Trigger | Response Time | Context | Example |
|---|---|---|---|---|
| `batch` | CRON or manual | Minutes to hours | Full reconstruction | Monthly compliance report |
| `recurring` | CRON | Minutes | Partial reconstruction | Weekly social media posting |
| `event_driven` | Webhook / MCP event | Seconds to minutes | Moderate reconstruction | New job application received |
| `interactive` | Inbound message (Slack/email) | Seconds | Hot context (pre-loaded) | Employee policy question |

---

### A7. Inbound Event Queue

**Problem:** External events (Slack messages, incoming emails, webhook calls, new files) need to trigger mission tracks in near-real-time.

**Solution:** An event queue that the Mission Scheduler monitors continuously (not just on CRON ticks).

```sql
CREATE TABLE mission_event_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id TEXT NOT NULL,
    track_id TEXT,
    event_type TEXT NOT NULL CHECK(event_type IN ('webhook', 'mcp_event', 'email_received', 'file_received', 'slack_message', 'schedule', 'manual')),
    event_payload TEXT NOT NULL DEFAULT '{}',
    priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME,
    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES mission_tracks(id)
);

CREATE INDEX idx_event_queue_status ON mission_event_queue(status, priority, created_at);
```

**Webhook endpoint:** `POST /api/missions/:id/events` — external systems post events here. The Mission Scheduler checks this queue every 5-10 seconds (configurable) for pending events.

---

### A8. Interactive Mode (Hot Context)

**Problem:** Employee asks a policy question via Slack. Full context reconstruction takes 30-60 seconds (load mission summary, atoms, decision log, etc.). That's too slow for interactive use.

**Solution:** Interactive mission tracks maintain a **hot context** — a pre-compiled, compressed context that's always ready to load. Updated after every interaction, not reconstructed from scratch.

The `hot_context` field on `mission_tracks` stores a pre-built prompt prefix (mission role + key knowledge atoms + recent interaction history) that can be injected directly into an LLM call without the full reconstruction protocol. Maximum size: 25K tokens (fits all provider context windows).

**Trade-off:** Hot context may be slightly stale (last updated after previous interaction). For most interactive use cases (policy questions, status checks), this is acceptable. For tasks requiring full mission history, the track escalates to batch mode with full reconstruction.

---

### A9. Web Change Monitor (Snapshot + Diff)

**Problem:** Competitor monitoring, regulatory monitoring, and price tracking missions need to detect what changed on a webpage since the last visit.

**Solution:** Extend the browser automation layer with snapshot storage and diff computation.

```sql
CREATE TABLE web_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id TEXT NOT NULL,
    url TEXT NOT NULL,
    snapshot_type TEXT DEFAULT 'text' CHECK(snapshot_type IN ('text', 'screenshot', 'both')),
    text_content TEXT,
    screenshot_path TEXT,
    content_hash TEXT,           -- SHA-256 of text_content for quick change detection
    captured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE
);

CREATE TABLE web_snapshot_diffs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id_old INTEGER NOT NULL,
    snapshot_id_new INTEGER NOT NULL,
    diff_summary TEXT,           -- LLM-generated summary of what changed
    diff_details TEXT,           -- Structured diff (added/removed/modified sections)
    significance TEXT DEFAULT 'low' CHECK(significance IN ('none', 'low', 'medium', 'high')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (snapshot_id_old) REFERENCES web_snapshots(id),
    FOREIGN KEY (snapshot_id_new) REFERENCES web_snapshots(id)
);

CREATE INDEX idx_snapshots_mission_url ON web_snapshots(mission_id, url);
```

**Workflow:** Visit URL → hash content → compare to previous hash → if different, compute detailed diff → if significant, create knowledge atom and alert.

---

### A10. Multi-Person Checkpoints (Collaborative Canvas Integration)

**Problem:** Regulatory submissions and high-stakes deliverables need sign-off from multiple reviewers (CISO, compliance officer, legal counsel) before the mission can proceed.

**Solution:** A checkpoint task type `parallel_review` that creates a Collaborative Canvas session.

```json
{
  "task_type": "checkpoint",
  "checkpoint_mode": "parallel_review",
  "reviewers": [
    { "role": "technical_reviewer", "assignee": "ciso@company.com" },
    { "role": "compliance_reviewer", "assignee": "compliance@company.com" },
    { "role": "legal_reviewer", "assignee": "legal@company.com" }
  ],
  "consensus_mode": "all_required",
  "sla_hours": 48,
  "output_to_review": ["task_3_1_output", "task_3_2_output"],
  "canvas_type": "review"
}
```

When the mission reaches this checkpoint, the Mission Controller: creates a Canvas session with the specified reviewers, attaches the outputs to review, sends "Review needed" notifications to each reviewer, and blocks until consensus is reached (or SLA expires and escalation triggers).

---

### A11. Template-Driven Document Assembly

**Problem:** Regulatory reports (DORA, AMLR data points, EBA submissions) have mandated formats. ANTON needs to populate structured templates field-by-field, not generate free-form text.

**Solution:** A document template library with field-mapping capability.

```sql
CREATE TABLE document_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    template_type TEXT NOT NULL CHECK(template_type IN ('docx', 'xlsx', 'pdf', 'pptx')),
    category TEXT,                     -- "regulatory", "consulting", "internal"
    regulation TEXT,                   -- "AMLR", "DORA", "MiCA", etc.
    template_file_path TEXT NOT NULL,  -- Path to the template file
    field_schema TEXT NOT NULL DEFAULT '[]',  -- JSON: array of fillable fields with types
    version TEXT DEFAULT '1.0.0',
    is_builtin INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

The Mission Controller can assign a task: "Populate DORA quarterly report template with data from tasks 1-5." The task maps mission data (knowledge atoms, structured storage rows, task outputs) to template fields and produces the filled document.

---

## PART 2: AUTONOMOUS BUSINESS USE CASES ("THE HYPE LAYER")

The AI influencer and indie hacker crowd drives massive visibility. Their dream scenarios aren't always realistic, but the ones ANTON can genuinely deliver become powerful marketing stories. Here's how the most-hyped autonomous business use cases map to the Missions architecture and what we need to support them.

---

### B1. "AI-Powered Content Factory"

**The dream:** "My AI produces 30 blog posts, 90 social posts, and 12 newsletter editions per month. I review the highlights, approve, and it publishes everywhere."

**How ANTON does it:**

Multi-track mission: Track A (blog posts, weekly batch) uses Marketing > Content Writing module, outputs to WordPress via Service Pack or API. Track B (social posts, 3x daily scheduled via internal scheduling queue) creates platform-specific content, posts via LinkedIn/X/Instagram Service Packs. Track C (newsletter, bi-weekly) compiles highlights from published content, generates newsletter, sends via email integration (Mailchimp API connector or direct SMTP).

**New requirement identified:** **Content calendar as structured storage.** The mission needs a `content_calendar` data table tracking: content piece, platform, scheduled date, status (draft/approved/published), performance metrics (impressions, clicks, engagement). This feeds both the scheduling queue and the mission analytics dashboard.

**New requirement:** **Multi-platform content adaptation.** A single content idea needs different versions for LinkedIn (professional tone, 1300 chars), X (punchy, 280 chars), Instagram (visual caption), and blog (long-form, SEO-optimised). The Task Decomposition Engine should generate parallel adaptation tasks from a single content brief. This is a **content variant generator** pattern.

---

### B2. "AI Sales Rep — Outbound Machine"

**The dream:** "My AI finds leads, researches them, writes personalised cold emails, sends them, follows up, books meetings in my calendar."

**How ANTON does it:**

Track A (lead discovery): Uses LinkedIn Service Pack to search for prospects matching criteria. Scrapes company websites for contact info. Uses business registry Service Packs (Companies House, Bolagsverket) for company data. Populates a `leads` data table.

Track B (outreach): For each lead, uses the lead's website + LinkedIn profile to generate a personalised email. Sends via Gmail MCP or SMTP. Logs in `leads` table. Schedules follow-up tasks (internal scheduling queue) — if no reply in 5 days, send follow-up #1; 10 days, follow-up #2.

Track C (meeting booking): When a lead replies positively, ANTON detects it (Gmail MCP event → inbound event queue), analyses the reply, and proposes meeting times (Google Calendar MCP). Sends calendar invite.

**New requirements identified:**

**Email sequence engine.** Multi-step email sequences with conditional logic (if opened but not replied → send version B; if replied → check sentiment → route to booking or to human). This is essentially a lightweight marketing automation system built on the mission scheduling queue.

**Reply detection and sentiment analysis.** The inbound event queue receives new emails. ANTON needs to: match reply to the original outreach (by thread/subject), analyse sentiment (positive/negative/question), and route accordingly. Positive → booking track. Question → answer and continue sequence. Negative → remove from sequence, log.

**CRM-lite in structured storage.** The `leads` data table becomes a mini-CRM: name, company, email, LinkedIn URL, outreach status, email history, sentiment scores, meeting booked (y/n), deal value, notes. This overlaps with the Grow (CRM) pillar planned in the roadmap — the mission structured storage is the seed of that system.

**Anti-spam governance.** ANTON must respect: sending limits (Gmail: 500/day, Google Workspace: 2000/day), CAN-SPAM / GDPR opt-out requirements, cooling periods between contacts, and never sending to the same person from multiple missions. This is a **compliance-as-code rule** specific to outbound communications.

---

### B3. "AI Runs My E-Commerce Store"

**The dream:** "My AI manages my Shopify/Amazon store — optimises listings, adjusts pricing, handles customer questions, manages inventory alerts, runs ad campaigns."

**How ANTON does it:**

Track A (listing optimisation): Periodically reviews product listings using e-commerce Service Pack (Shopify API, Amazon Seller API). Analyses competitor pricing (web snapshots + diff). Suggests title/description improvements using Marketing modules. **Checkpoint for pricing changes above threshold.**

Track B (customer support): Monitors incoming customer messages (Shopify API, Amazon Seller Central). Uses interactive track mode (hot context) to respond quickly. Escalates complex issues to human.

Track C (advertising): Manages Google Ads and Meta campaigns via API connectors. Monitors ROAS (return on ad spend). Adjusts bids and budgets within pre-approved parameters. **Financial governance applies** — budget limits per campaign, per day.

Track D (inventory): Monitors stock levels via API. When inventory drops below threshold, alerts human (or, at higher autonomy, triggers reorder via supplier API/email).

**New requirements identified:**

**E-commerce platform connectors.** Shopify (REST Admin API + GraphQL), Amazon Seller Central (SP-API), WooCommerce (REST API). These are high-value API connectors that should be in the Service Pack roadmap.

**Automated A/B testing framework.** ANTON creates variant A and B of a product title, runs both for a defined period, measures click-through and conversion, and adopts the winner. This is a generic pattern useful across marketing, e-commerce, and content missions. The structured storage tracks variant performance, and the Task Decomposition Engine generates "evaluate A/B test" tasks after the test period.

---

### B4. "AI Financial Analyst / Portfolio Manager"

**The dream:** "My AI monitors my investments, rebalances based on market conditions, and executes trades within my risk parameters."

**How ANTON does it (with heavy governance):**

Track A (market monitoring): Monitors financial news (news Service Packs), market data (financial APIs — Alpha Vantage, Yahoo Finance), and portfolio positions (brokerage API). Stores daily snapshots in structured storage. Detects significant events (large price moves, earnings surprises, sector rotations).

Track B (analysis): When significant events detected, runs Finance > Investment Analysis module with the user's Horizon Radar settings (risk tolerance, time horizon, sector preferences). Produces analysis with recommendations.

Track C (rebalancing): Based on analysis, proposes portfolio adjustments. **Always goes through stage_for_approval** — ANTON prepares the trade order but NEVER executes without explicit human approval.

**Critical governance for this use case:**

This is the highest-risk mission type. Financial trading must be subject to: mandatory human approval for every trade (no autonomy progression to full-auto for trading), pre-defined position limits (max % of portfolio in any single position), daily loss limits (if portfolio drops X%, all trading paused), cool-down periods between trades (prevent churn), and a complete audit trail that satisfies financial regulatory requirements.

**New requirement:** **Financial API connectors.** Alpha Vantage (free market data), Yahoo Finance (via unofficial API), Interactive Brokers (trading API for execution), Nordnet/Avanza (Nordic brokerages — SE market), Revolut/Trading 212 (European retail brokerages). These are Phase 4+ (after FutureChain wallet integration).

---

### B5. "AI Agency — Multiple Client Missions Running in Parallel"

**The dream:** "I run a one-person consultancy but my AI handles 10 clients simultaneously, each with their own workstream."

**How ANTON does it:**

Each client gets a parent mission with mission-scoped data isolation. Within each client mission, multiple tracks handle different deliverables. The user has a **multi-mission dashboard** showing all active missions, their health, upcoming checkpoints, and budget consumption.

ANTON handles the routine work (monitoring, data gathering, draft production). The human focuses on strategic advice, relationship management, and quality review of high-stakes deliverables.

**New requirements identified:**

**Multi-mission overview dashboard.** The current spec describes a per-mission dashboard. But the "AI agency" use case needs a bird's-eye view across all active missions: which ones need attention, which are on track, which are approaching budget limits, which have pending checkpoints. This is the **Mission Control Centre** — a top-level dashboard that aggregates health indicators from all active missions.

**Cross-mission time management.** If the human has 10 active missions with checkpoints, they need visibility into their own review queue — "you have 3 deliverables to review today, estimated 45 minutes." This integrates with Time Intelligence to track not just mission deadlines but the human's review workload.

**Client-scoped reporting.** Each client wants to see what ANTON has done for them — a "client portal" view showing completed deliverables, time spent, atoms accumulated, quality scores. This is the seed of the invoicing system (FutureChain Phase 4).

---

### B6. "AI Property Manager"

**The dream:** "My AI manages my Airbnb listings — dynamic pricing, guest communication, cleaning coordination, review responses."

**How ANTON does it:**

Track A (dynamic pricing): Monitors competitor listings (Airbnb Browser Service Pack), local events calendar, seasonal patterns. Adjusts pricing within pre-approved range via Airbnb API/Browser. Uses structured storage to track occupancy rates, revenue, and pricing history.

Track B (guest communication): Detects new booking inquiries and messages (Airbnb API or email). Interactive track responds quickly with property information, check-in instructions, local recommendations. Escalates unusual requests to human.

Track C (operations): After checkout, sends cleaning request (email/WhatsApp to cleaning team), schedules maintenance if guest reported an issue, generates review response based on guest rating.

**New requirement:** **WhatsApp Business integration** becomes more important here — many property managers coordinate with cleaning staff via WhatsApp groups. This is an Action Layer connector priority.

---

### B7. "AI Trend Scout — Find the Next Opportunity"

**The dream:** "My AI monitors market trends, identifies gaps, and tells me what business to start or what product to launch."

**How ANTON does it:**

Track A (trend monitoring): Uses web change monitor on trend platforms (Google Trends via API, Product Hunt via Browser, Hacker News, Reddit trending). Stores signals in structured storage.

Track B (opportunity analysis): Weekly batch — aggregates trend signals, cross-references with the user's skills and interests (knowledge atoms from past sessions), runs Business > Opportunity Analysis module. Produces a ranked list of opportunities with: market size estimate, competition level, required investment, alignment with user's capabilities.

Track C (deep dives): For top-ranked opportunities, ANTON autonomously researches further — competitor analysis, TAM/SAM/SOM estimation, regulatory requirements, potential customer profiles. Produces a mini business case for human review.

**New requirement:** **Google Trends API integration** (or scraping via Service Pack). Also: Product Hunt, Hacker News, and Reddit APIs should be in the connector priority list for this use case.

---

## PART 3: CONSOLIDATED NEW REQUIREMENTS FOR CLAUDE CODE

### New Database Tables (all addendum items)

```sql
-- A1: Mission output delivery
ALTER TABLE missions ADD COLUMN delivery_config TEXT DEFAULT '{}';
CREATE TABLE mission_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id TEXT NOT NULL,
    channel TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'delivered', 'failed')),
    output_files TEXT DEFAULT '[]',
    delivery_details TEXT DEFAULT '{}',
    delivered_at DATETIME,
    error_message TEXT,
    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE
);

-- A2: Internal scheduling queue
CREATE TABLE mission_scheduled_tasks (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    execute_at DATETIME NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'executing', 'completed', 'failed', 'cancelled')),
    payload TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    executed_at DATETIME,
    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES mission_tasks(id)
);
CREATE INDEX idx_scheduled_tasks_execute ON mission_scheduled_tasks(execute_at, status);

-- A3: Document intake pipeline
CREATE TABLE mission_document_intake (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK(source_type IN ('email', 'webhook', 'browser', 'folder', 'api')),
    source_details TEXT DEFAULT '{}',
    filename TEXT,
    file_type TEXT,
    file_size INTEGER,
    extracted_text_preview TEXT,
    atom_ids TEXT DEFAULT '[]',
    status TEXT DEFAULT 'processed' CHECK(status IN ('received', 'processing', 'processed', 'failed')),
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME,
    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE
);

-- A4: Mission-scoped structured storage
CREATE TABLE mission_data_tables (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    table_name TEXT NOT NULL,
    schema_definition TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
    UNIQUE(mission_id, table_name)
);
CREATE TABLE mission_data_rows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_id TEXT NOT NULL,
    row_data TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (table_id) REFERENCES mission_data_tables(id) ON DELETE CASCADE
);

-- A6: Multi-track missions
CREATE TABLE mission_tracks (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    track_type TEXT DEFAULT 'batch' CHECK(track_type IN ('batch', 'recurring', 'interactive', 'event_driven')),
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused', 'completed')),
    trigger_config TEXT DEFAULT '{}',
    hot_context TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE
);
ALTER TABLE mission_tasks ADD COLUMN track_id TEXT;

-- A7: Inbound event queue
CREATE TABLE mission_event_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id TEXT NOT NULL,
    track_id TEXT,
    event_type TEXT NOT NULL CHECK(event_type IN ('webhook', 'mcp_event', 'email_received', 'file_received', 'slack_message', 'schedule', 'manual')),
    event_payload TEXT NOT NULL DEFAULT '{}',
    priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME,
    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES mission_tracks(id)
);
CREATE INDEX idx_event_queue_status ON mission_event_queue(status, priority, created_at);

-- A9: Web change monitor
CREATE TABLE web_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id TEXT NOT NULL,
    url TEXT NOT NULL,
    snapshot_type TEXT DEFAULT 'text' CHECK(snapshot_type IN ('text', 'screenshot', 'both')),
    text_content TEXT,
    screenshot_path TEXT,
    content_hash TEXT,
    captured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE
);
CREATE TABLE web_snapshot_diffs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id_old INTEGER NOT NULL,
    snapshot_id_new INTEGER NOT NULL,
    diff_summary TEXT,
    diff_details TEXT,
    significance TEXT DEFAULT 'low' CHECK(significance IN ('none', 'low', 'medium', 'high')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (snapshot_id_old) REFERENCES web_snapshots(id),
    FOREIGN KEY (snapshot_id_new) REFERENCES web_snapshots(id)
);
CREATE INDEX idx_snapshots_mission_url ON web_snapshots(mission_id, url);

-- A11: Document templates
CREATE TABLE document_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    template_type TEXT NOT NULL CHECK(template_type IN ('docx', 'xlsx', 'pdf', 'pptx')),
    category TEXT,
    regulation TEXT,
    template_file_path TEXT NOT NULL,
    field_schema TEXT NOT NULL DEFAULT '[]',
    version TEXT DEFAULT '1.0.0',
    is_builtin INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### New Services

```
server/services/mission-delivery.ts         — Output delivery to configured channels
server/services/document-intake.ts          — Incoming document detection, extraction, atom creation
server/services/mission-data-store.ts       — Structured storage (JSON tables) CRUD operations
server/services/web-monitor.ts              — Snapshot capture, hash comparison, diff generation
server/services/email-sequence.ts           — Multi-step email sequences with conditional logic
server/services/content-adapter.ts          — Single content idea → platform-specific variants
```

### New Frontend Components

```
src/pages/MissionControlCentrePage.tsx      — Multi-mission overview dashboard (the "agency view")
src/components/missions/DataTableView.tsx   — Render and interact with mission structured data
src/components/missions/ContentCalendar.tsx — Visual content calendar for marketing missions
src/components/missions/MissionAnalytics.tsx — Business metric charts (engagement, revenue, leads)
src/components/missions/StageApproval.tsx   — Browser transaction approval with screenshot display
```

### New API Routes

```
POST   /api/missions/:id/events              — Inbound event webhook
GET    /api/missions/:id/data/:tableName      — Query mission structured storage
POST   /api/missions/:id/data/:tableName      — Insert row into mission structured storage
GET    /api/missions/:id/snapshots            — List web snapshots for a mission
GET    /api/missions/overview                 — Multi-mission health dashboard data
POST   /api/missions/:id/deliver              — Manually trigger output delivery
```

### Updated Phased Rollout

| Phase | Additions from this Addendum |
|---|---|
| **Phase 1 (v0.7.0)** | Output delivery (in-app + email), structured storage, document templates |
| **Phase 2 (v0.7.5)** | Multi-track missions, inbound event queue, interactive mode (hot context), internal scheduling queue, document intake pipeline |
| **Phase 2.5 (v0.7.5)** | Stage-and-hold transactions, web change monitor |
| **Phase 3 (v0.8.0)** | Multi-person checkpoints (Canvas integration), email sequence engine, content adaptation, Mission Control Centre, mission analytics |
| **Phase 4 (v0.8.5)** | E-commerce connectors (Shopify, Amazon SP-API), financial API connectors, anti-spam compliance rules |
| **Phase 5 (v0.9.0)** | Client entity tracking, SLA integration, cross-mission time management, client portal view |

### Hype-Ready Mission Templates (Add to Template Library)

| Template | Category | Hype Appeal | Real Value |
|---|---|---|---|
| Content Factory | Marketing | "30 posts/month on autopilot" | Consistent content schedule with quality governance |
| Outbound Sales Machine | Sales | "AI finds leads and books meetings" | Personalised outreach with CAN-SPAM compliance |
| E-Commerce Autopilot | Business Ops | "AI runs my store while I sleep" | Listing optimisation, pricing, customer support |
| Competitor War Room | Intelligence | "Know everything your competitors do" | Weekly intelligence with web change detection |
| Regulatory Sentinel | Compliance | "Never miss a regulatory change" | Continuous monitoring with impact assessment |
| Property Manager | Real Estate | "AI handles my Airbnb" | Guest communication, pricing, operations |
| Trend Scout | Strategy | "AI finds my next business idea" | Market opportunity detection and analysis |
| Client Retainer | Consulting | "AI consultant serving 10 clients" | Multi-mission professional service delivery |
| Financial Analyst | Finance | "AI monitors and advises on portfolio" | Market monitoring with governed recommendations |
| HR Department | Operations | "AI handles HR for my 50-person company" | Onboarding, policy Q&A, training coordination |

---

**Total database tables added by this addendum: 12**  
**Total database tables across entire Missions spec: 8 (base) + 4 (Action Layer) + 2 (Service Packs) + 12 (addendum) = 26 new tables**

---

**END OF ADDENDUM**
