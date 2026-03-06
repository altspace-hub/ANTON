# ANTON Strategic Improvements — Claude Code Implementation Spec

**Version:** 1.0
**Date:** March 6, 2026
**Context:** Six improvements identified by mapping OpenAI's Stateful Runtime announcement (Feb 27, 2026) and Nate B. Jones' enterprise-context thesis against ANTON's existing architecture. These features close the gap between what ANTON specifies and what the market is now demanding — making ANTON demonstrably ahead of OpenAI's $50B infrastructure play.

---

## ⚠️ CRITICAL: Investigation-First Protocol

**Before building ANYTHING in this spec, Claude Code MUST:**

1. Run `cat server/src/db/schema.sql` to see what tables actually exist
2. Run `ls server/src/services/` to see what services are implemented
3. Run `ls server/src/routes/` to see what API routes exist
4. Run `ls client/src/pages/` to see what React pages exist
5. Run `grep -r "checkpoint_decisions\|knowledge_atoms\|entity_nodes\|detected_patterns" server/src/` to check if intelligence tables are referenced anywhere

**Known reality (from WHITEPAPER_CORRECTIONS_NEEDED.md):** As of the last audit, only ~12 core tables exist in schema.sql (sessions, messages, registered_folders, module_configs, projects, skills, reviews, user_profiles, custom_modules, community_skills, login_attempts, security_events). The whitepaper describes 82 tables. Many intelligence tables (checkpoint_decisions, knowledge_atoms, entity_nodes, detected_patterns, etc.) may not yet exist.

**This means:** Several improvements in this spec depend on infrastructure that may need to be built first. The build order below accounts for this — start with what can be added to existing tables, then build new tables as needed.

---

## Overview of Six Improvements

| # | Feature | What It Does | Strategic Value |
|---|---------|-------------|-----------------|
| 1 | **Session Resume** | First-class "pick up where you left off" with full context reconstruction | Directly counters OpenAI's "stateful" narrative — we already have it |
| 2 | **Engagement-Scoped Memory** | Memory persisted and scoped to a consulting engagement lifecycle | Professional workflow continuity that generic AI doesn't offer |
| 3 | **Proactive Intelligence** | System monitors patterns and surfaces insights without being asked | Moves ANTON from reactive tool to proactive coworker |
| 4 | **Organisational Context Layer** | Persistent synthesis of organisational state across all data sources | The "enterprise-scale context" that Nate Jones says wins everything |
| 5 | **Organisational Continuity (Key-Person Risk)** | Explicit positioning of institutional memory as org continuity capability | Board-level value proposition for regulated industries |
| 6 | **Orchestration Dashboard ("The Brain")** | UI that positions ANTON as the intelligence layer above the tool stack | Visual proof of the "brain above your SaaS stack" positioning |

---

## Build Order

**Phase 1 — Quick wins on existing infrastructure (1-2 days each):**
1. Session Resume (extends existing sessions/messages tables)
2. Engagement-Scoped Memory (extends existing projects table)

**Phase 2 — Intelligence infrastructure (3-5 days each, may require new tables):**
3. Proactive Intelligence (depends on knowledge_atoms, detected_patterns)
4. Organisational Context Layer (depends on entity_nodes, knowledge graph)

**Phase 3 — Positioning features (2-3 days each):**
5. Organisational Continuity view (depends on checkpoint_decisions)
6. Orchestration Dashboard (new page, aggregates existing data)

---

## IMPROVEMENT 1: Session Resume (First-Class)

### Problem
Users close ANTON, come back days later, and lose context. Current sessions table stores messages but there's no dedicated UX for resuming work with full context awareness. OpenAI's entire stateful runtime pitch is about persistent context — ANTON should make this a visible, branded feature.

### What to Build

#### Database Changes

**Investigate first:** Check if `sessions` table has a `summary` column. If yes, use it. If not, add it.

Add columns to `sessions` table (if not already present):

```sql
ALTER TABLE sessions ADD COLUMN status TEXT DEFAULT 'active' 
  CHECK (status IN ('active', 'paused', 'completed', 'archived'));
ALTER TABLE sessions ADD COLUMN resume_context TEXT;  -- AI-generated context summary for resumption
ALTER TABLE sessions ADD COLUMN last_activity_at TEXT DEFAULT (datetime('now'));
ALTER TABLE sessions ADD COLUMN engagement_id TEXT;  -- FK to engagements (Improvement 2)
```

New table:

```sql
CREATE TABLE session_snapshots (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('auto', 'manual', 'pause')),
  context_summary TEXT NOT NULL,      -- AI-generated summary of where things stand
  key_decisions TEXT,                 -- JSON array of key decisions made so far
  open_questions TEXT,                -- JSON array of unresolved questions
  next_steps TEXT,                    -- JSON array of suggested next actions
  message_count INTEGER NOT NULL,
  token_count_total INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_session_snapshots_session ON session_snapshots(session_id);
```

#### Backend Service: `session-resume.ts`

```typescript
// Location: server/src/services/session-resume.ts

interface SessionSnapshot {
  id: string;
  sessionId: string;
  contextSummary: string;
  keyDecisions: string[];
  openQuestions: string[];
  nextSteps: string[];
  messageCount: number;
  createdAt: string;
}

// Key functions:

// 1. generateResumeContext(sessionId: string): Promise<SessionSnapshot>
//    - Loads last N messages from session
//    - Calls Claude (Haiku for speed) with prompt:
//      "Summarise this work session. Include: (1) What was accomplished,
//       (2) Key decisions made, (3) Open questions remaining,
//       (4) Suggested next steps. Be concise — this is for session resumption."
//    - Stores result in session_snapshots
//    - Returns the snapshot

// 2. getResumeContext(sessionId: string): Promise<SessionSnapshot | null>
//    - Returns most recent snapshot for session
//    - If no snapshot exists, generates one

// 3. autoSnapshot(sessionId: string): Promise<void>
//    - Called automatically when: session idle > 30 min, user navigates away,
//      or every 10 messages
//    - Only creates snapshot if messages changed since last snapshot

// 4. buildResumePrompt(sessionId: string): Promise<string>
//    - Generates a context block to prepend to the next message when resuming:
//      "You are resuming a previous work session. Here is the context: [summary].
//       Key decisions so far: [decisions]. Open questions: [questions].
//       The user is picking up where they left off."
```

#### API Routes: `/api/sessions/:id/resume`

```
GET  /api/sessions/:id/resume     → Get resume context (generate if needed)
POST /api/sessions/:id/snapshot   → Create manual snapshot
PUT  /api/sessions/:id/status     → Update session status (pause/complete/archive)
GET  /api/sessions/resumable      → List sessions with status='active' or 'paused', ordered by last_activity_at
```

#### React Components

**Investigate first:** Check how the current session list/sidebar works. This feature integrates there.

**ResumePanel component** (`client/src/components/ResumePanel.tsx`):
- Shows on session open if session has previous messages and was inactive > 1 hour
- Displays: context summary, key decisions (chips), open questions (list), suggested next steps (actionable buttons)
- Two buttons: "Resume with context" (injects resume prompt) and "Start fresh" (continues without injection)
- Subtle, non-blocking — appears as a collapsible panel at top of chat, not a modal

**Session list enhancement:**
- Sessions with status='paused' show a pause icon and last activity time
- "Resume" button directly on each paused session card
- Sort option: "Recently active" (default), "By engagement", "By area"

---

## IMPROVEMENT 2: Engagement-Scoped Memory

### Problem
Consulting engagements span weeks/months with dozens of ANTON sessions. Currently sessions can be grouped by project, but there's no engagement-level context that persists across sessions and provides continuity for the entire engagement lifecycle.

### What to Build

#### Database Changes

**Investigate first:** Check if `projects` table could serve as the engagement container, or if a separate table is cleaner.

New table:

```sql
CREATE TABLE engagements (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,                 -- "Nordea AMLR Implementation Q1 2026"
  client_name TEXT,                   -- Optional client reference
  description TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  phase TEXT DEFAULT 'kickoff' CHECK (phase IN (
    'proposal', 'kickoff', 'analysis', 'design', 'implementation', 
    'testing', 'delivery', 'closure'
  )),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  target_end_date TEXT,
  completed_at TEXT,
  context_summary TEXT,               -- AI-maintained engagement-level context
  key_findings TEXT,                  -- JSON: accumulated key findings across all sessions
  decisions_log TEXT,                 -- JSON: engagement-level decisions
  stakeholders TEXT,                  -- JSON: key people and roles
  config_defaults TEXT,               -- JSON: default module/model/thinking config for this engagement
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE engagement_sessions (
  engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  session_role TEXT DEFAULT 'work' CHECK (session_role IN (
    'work', 'review', 'planning', 'reporting', 'research'
  )),
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (engagement_id, session_id)
);
CREATE INDEX idx_engagement_sessions_engagement ON engagement_sessions(engagement_id);
CREATE INDEX idx_engagement_sessions_session ON engagement_sessions(session_id);

CREATE TABLE engagement_knowledge (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  knowledge_type TEXT NOT NULL CHECK (knowledge_type IN (
    'finding', 'decision', 'risk', 'action_item', 'stakeholder_note', 
    'regulatory_ref', 'data_point', 'assumption'
  )),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_session_id TEXT,             -- Which session produced this
  source_module_id TEXT,              -- Which module produced this
  status TEXT DEFAULT 'active',
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  tags TEXT,                          -- JSON array of tags
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_engagement_knowledge_engagement ON engagement_knowledge(engagement_id);
CREATE INDEX idx_engagement_knowledge_type ON engagement_knowledge(knowledge_type);
```

#### Backend Service: `engagement-memory.ts`

```typescript
// Location: server/src/services/engagement-memory.ts

// Key functions:

// 1. createEngagement(data: EngagementCreate): Promise<Engagement>
//    - Creates engagement with name, client, description, config defaults
//    - Optionally links existing sessions

// 2. addSessionToEngagement(engagementId: string, sessionId: string, role: string): Promise<void>
//    - Links session to engagement
//    - Triggers context refresh

// 3. refreshEngagementContext(engagementId: string): Promise<void>
//    - Loads all sessions linked to engagement
//    - Loads all engagement_knowledge entries
//    - Calls Claude (Sonnet for quality/cost balance) with prompt:
//      "You are maintaining the context for a consulting engagement.
//       Here are summaries of all work sessions and accumulated knowledge.
//       Produce an updated engagement context summary that captures:
//       current state, key findings to date, open risks, and next priorities."
//    - Updates engagements.context_summary

// 4. getEngagementContext(engagementId: string): Promise<EngagementContext>
//    - Returns engagement context for injection into new sessions
//    - Includes: summary, key findings, decisions, stakeholders, phase

// 5. extractKnowledge(sessionId: string, engagementId: string): Promise<void>
//    - After session completion, extracts key knowledge items
//    - Uses Claude to identify: findings, decisions, risks, action items
//    - Stores in engagement_knowledge table
//    - Called automatically when session in engagement is paused/completed

// 6. buildEngagementPromptBlock(engagementId: string): Promise<string>
//    - Generates a context block to inject into the 7-layer prompt builder
//    - Sits between Layer 2 (Area Context) and Layer 3 (Module Methodology)
//    - Contains: engagement context, key findings, recent decisions, stakeholder notes
//    - This is the key integration point — engagement context becomes part of every prompt
```

#### API Routes: `/api/engagements`

```
GET    /api/engagements                         → List engagements (with session counts)
POST   /api/engagements                         → Create engagement
GET    /api/engagements/:id                     → Get engagement with context
PUT    /api/engagements/:id                     → Update engagement metadata
PUT    /api/engagements/:id/phase               → Advance engagement phase
POST   /api/engagements/:id/sessions            → Link session to engagement
DELETE /api/engagements/:id/sessions/:sessionId  → Unlink session
GET    /api/engagements/:id/knowledge           → Get engagement knowledge items
POST   /api/engagements/:id/knowledge           → Add knowledge item manually
PUT    /api/engagements/:id/knowledge/:kid      → Update knowledge item
POST   /api/engagements/:id/refresh-context     → Trigger context refresh
GET    /api/engagements/:id/prompt-block         → Get prompt injection block
```

#### React Components

**EngagementsPage** (`client/src/pages/EngagementsPage.tsx`):
- List view of all engagements with status, phase, session count, last activity
- Phase visualisation (the 8 phases as a progress bar)
- Click to open engagement detail

**EngagementDetailPage** (`client/src/pages/EngagementDetailPage.tsx`):
- Header: name, client, phase indicator, dates
- Context summary panel (AI-generated, with "Refresh" button)
- Sessions list (linked sessions with role tags, sortable)
- Knowledge board: Kanban-style columns by type (Findings | Decisions | Risks | Actions)
- Stakeholders list
- "New Session in this Engagement" button (pre-configures engagement context)
- Export: generate engagement report (all knowledge + context → DOCX)

**Session integration:**
- When starting a new session within an engagement, the engagement context block is automatically injected into the prompt
- Session header shows engagement badge with name and phase
- "Add to Engagement" quick action available in any session

#### Prompt Builder Integration

**This is the most important technical integration.** The engagement context must flow into the 7-layer prompt builder.

**Investigate first:** Find where the prompt builder assembles layers. Look for files like `prompt-builder.ts`, `prompt-assembler.ts`, or similar in services.

Add a new optional layer between Layer 2 and Layer 3:

```
Layer 1: System Foundation
Layer 2: Area Context
Layer 2.5: Engagement Context  ← NEW (injected when session belongs to engagement)
Layer 3: Module Methodology
Layer 4: Expert Persona
...
```

The engagement context block should be structured as:

```
[ENGAGEMENT CONTEXT]
You are working within an active consulting engagement: "{engagement.name}"
Client: {engagement.client_name}
Current phase: {engagement.phase}
Engagement started: {engagement.started_at}

Context summary:
{engagement.context_summary}

Key findings to date:
{formatted list of engagement_knowledge where type='finding'}

Recent decisions:
{formatted list of engagement_knowledge where type='decision'}

Open risks and action items:
{formatted list of engagement_knowledge where type in ('risk', 'action_item')}

Stakeholders:
{engagement.stakeholders}

Use this context to ground your analysis. Reference previous findings where relevant.
Build on — don't repeat — work already done in this engagement.
[/ENGAGEMENT CONTEXT]
```

---

## IMPROVEMENT 3: Proactive Intelligence

### Problem
ANTON's Cross-Workflow Intelligence currently surfaces patterns on the dashboard when you look at it. But a real coworker doesn't wait to be asked — they tap you on the shoulder and say "I noticed something you should know about."

### Prerequisites
This feature depends on knowledge_atoms, detected_patterns, and entity_nodes tables. **Investigate first** whether these exist. If they don't, they need to be created before this feature can work. See the whitepaper schema (Group 5-7) for the full table definitions.

If these tables don't exist yet, create a minimal viable version:

```sql
-- Minimal knowledge atom storage (if not already present)
CREATE TABLE IF NOT EXISTS knowledge_atoms (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  atom_type TEXT NOT NULL CHECK (atom_type IN (
    'fact', 'finding', 'recommendation', 'risk', 'decision', 'metric', 'reference'
  )),
  content TEXT NOT NULL,
  confidence REAL DEFAULT 0.8,
  tags TEXT,                          -- JSON array
  engagement_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_knowledge_atoms_type ON knowledge_atoms(atom_type);
CREATE INDEX idx_knowledge_atoms_session ON knowledge_atoms(session_id);
CREATE INDEX idx_knowledge_atoms_engagement ON knowledge_atoms(engagement_id);

-- Proactive insight queue
CREATE TABLE proactive_insights (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  insight_type TEXT NOT NULL CHECK (insight_type IN (
    'pattern_detected', 'cross_engagement_finding', 'regulatory_alert',
    'quality_trend', 'knowledge_gap', 'action_reminder', 'continuity_risk'
  )),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  evidence TEXT,                      -- JSON: supporting data points
  severity TEXT DEFAULT 'info' CHECK (severity IN ('critical', 'warning', 'info', 'suggestion')),
  source_type TEXT,                   -- What triggered this: 'pattern_engine', 'regulatory_radar', 'quality_ratchet', 'engagement_analysis'
  related_engagement_id TEXT,
  related_session_ids TEXT,           -- JSON array
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'seen', 'acted_on', 'dismissed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  seen_at TEXT,
  acted_at TEXT
);
CREATE INDEX idx_proactive_insights_status ON proactive_insights(status);
CREATE INDEX idx_proactive_insights_severity ON proactive_insights(severity);
CREATE INDEX idx_proactive_insights_type ON proactive_insights(insight_type);
```

#### Backend Service: `proactive-intelligence.ts`

```typescript
// Location: server/src/services/proactive-intelligence.ts

// This service runs periodically (cron-style or on-demand) to detect insights.

// Key functions:

// 1. runProactiveAnalysis(): Promise<ProactiveInsight[]>
//    - Orchestrator that calls all detection functions
//    - Deduplicates against existing insights
//    - Stores new insights in proactive_insights table
//    - Returns newly created insights

// 2. detectCrossEngagementPatterns(): Promise<ProactiveInsight[]>
//    - Queries engagement_knowledge across all active engagements
//    - Looks for: same findings appearing in multiple engagements (industry-wide issue),
//      same risks recurring, same recommendations being made
//    - Example output: "AMLR Article 18 gaps found in 4 of your 6 active engagements — 
//      this appears to be an industry-wide issue. Consider preparing a cross-client briefing."

// 3. detectQualityTrends(): Promise<ProactiveInsight[]>
//    - If quality_baselines table exists, check for declining quality scores
//    - If not, analyse recent sessions for output length/complexity trends
//    - Example: "Quality scores for AML Policy Writer have dropped 15% over the last month.
//      Review recent outputs for calibration issues."

// 4. detectKnowledgeGaps(): Promise<ProactiveInsight[]>
//    - Analyse which modules/areas are being used heavily vs rarely
//    - Cross-reference with engagement needs
//    - Example: "You've run 12 gap analyses but zero Data Readiness Assessments.
//      Based on the AMLR implementation cascade, data readiness is typically the next step."

// 5. detectContinuityRisks(): Promise<ProactiveInsight[]>
//    - Find sessions/engagements that have been inactive for > X days
//    - Find checkpoint decisions where one user consistently overrides
//      (if that user leaves, their judgment patterns need to be captured)
//    - Example: "Engagement 'SEB AMLR Implementation' has been inactive for 14 days.
//      Last phase was 'analysis'. Consider resuming or updating stakeholders."

// 6. checkRegulatoryAlerts(): Promise<ProactiveInsight[]>
//    - If regulatory radar exists, cross-reference new regulatory items
//      against active engagement contexts
//    - Example: "AMLA published RTS on CDD data points yesterday. This directly
//      affects 3 of your active engagements. Shall I run impact assessments?"

// 7. getInsights(filters: InsightFilters): Promise<ProactiveInsight[]>
//    - Retrieve insights with filtering by status, severity, type, engagement
//    - Supports pagination

// 8. updateInsightStatus(id: string, status: string): Promise<void>
//    - Mark as seen, acted_on, or dismissed

// Scheduling:
// - Run on app startup (lightweight check)
// - Run after every session completion
// - Run on configurable interval (default: every 4 hours)
// - Manual trigger from dashboard
```

#### API Routes: `/api/insights`

```
GET  /api/insights                    → Get insights (filter by status, severity, type)
GET  /api/insights/count              → Count new/unseen insights (for badge)
PUT  /api/insights/:id/status         → Update insight status
POST /api/insights/analyse            → Trigger manual analysis run
GET  /api/insights/engagement/:id     → Get insights related to specific engagement
```

#### React Components

**InsightsBell** (`client/src/components/InsightsBell.tsx`):
- Notification bell icon in the top nav bar
- Shows count badge for unseen insights (red for critical/warning, blue for info)
- Click opens dropdown panel with latest insights
- Each insight card: icon (by type), title, severity indicator, timestamp
- Click insight → expands to show description + evidence + action buttons
- Actions: "View related session", "Run suggested module", "Dismiss"

**InsightsFeed** (for Dashboard page):
- Full feed of insights with filtering
- Grouped by date or engagement
- Charts: insight trends over time, by type, by severity

**Proactive prompt injection:**
- When user starts a new session and there are relevant unseen insights, show a subtle banner:
  "ANTON has 2 insights related to this module/area. [View]"
- If an insight has a suggested action (like "run Data Readiness Assessment"), the banner includes a one-click action button

---

## IMPROVEMENT 4: Organisational Context Layer

### Problem
ANTON currently assembles context per-session from knowledge sources. But the OpenAI/Nate Jones thesis is about *persistent, always-on synthesis* — a continuously maintained unified view of the organisation that every module invocation can draw from.

### What to Build

This is the most architecturally significant improvement. It creates a background knowledge synthesis that persists across all sessions and engagements.

#### Database Changes

```sql
CREATE TABLE org_context (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  context_type TEXT NOT NULL CHECK (context_type IN (
    'entity_map',        -- Org chart, systems, relationships
    'regulatory_state',  -- Current regulatory obligations and status
    'capability_map',    -- What the org can/can't do (from gap analyses)
    'risk_landscape',    -- Aggregated risk view
    'knowledge_index',   -- What ANTON knows about this org
    'tool_connections'   -- What external systems are connected
  )),
  title TEXT NOT NULL,
  content TEXT NOT NULL,            -- AI-generated synthesis
  data_sources TEXT,                -- JSON: which sessions/engagements/connections fed this
  confidence REAL DEFAULT 0.7,
  last_refreshed_at TEXT NOT NULL DEFAULT (datetime('now')),
  auto_refresh_interval TEXT DEFAULT '24h',  -- How often to auto-refresh
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_org_context_type ON org_context(context_type);

CREATE TABLE org_context_history (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  org_context_id TEXT NOT NULL REFERENCES org_context(id) ON DELETE CASCADE,
  content TEXT NOT NULL,             -- Previous version of content
  refreshed_at TEXT NOT NULL,
  trigger TEXT,                      -- What caused the refresh: 'auto', 'manual', 'session_complete', 'data_change'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_org_context_history_context ON org_context_history(org_context_id);
```

#### Backend Service: `org-context.ts`

```typescript
// Location: server/src/services/org-context.ts

// Key functions:

// 1. initOrgContext(): Promise<void>
//    - Creates initial org_context entries for each context_type
//    - Populates from existing data: sessions, engagements, connections
//    - Run once on first setup, then maintained automatically

// 2. refreshContextLayer(contextType: string): Promise<OrgContext>
//    - Gathers all relevant data for the context type
//    - For 'entity_map': scan all engagement stakeholders, client names, 
//      system names mentioned in sessions
//    - For 'regulatory_state': scan all gap analyses, regulatory radar items, 
//      compliance rule results
//    - For 'capability_map': scan all gap analyses for control assessments, 
//      aggregate RAG statuses
//    - For 'risk_landscape': aggregate risk findings from all sessions
//    - Calls Claude to synthesize into a coherent, concise context block
//    - Stores in org_context, archives previous version in org_context_history
//    - Returns updated context

// 3. getOrgContextBlock(): Promise<string>
//    - Assembles ALL org_context entries into a single prompt block
//    - This is injected into the 7-layer prompt builder as an optional
//      enhancement to Layer 2 (Area Context)
//    - Only included when: (a) org context exists and is recent, 
//      (b) the session's module/area is relevant to the context
//    - Format:
//      "[ORGANISATIONAL CONTEXT]
//       Entity landscape: {entity_map summary}
//       Regulatory state: {regulatory_state summary}
//       Known capabilities and gaps: {capability_map summary}
//       Risk landscape: {risk_landscape summary}
//       [/ORGANISATIONAL CONTEXT]"

// 4. refreshAll(): Promise<void>
//    - Refreshes all context types
//    - Called on schedule or manually

// 5. onSessionComplete(sessionId: string): Promise<void>
//    - Hook called when a session is completed/paused
//    - Determines which context types might be affected
//    - Queues targeted refresh (not all types, just relevant ones)

// Scheduling:
// - Full refresh: daily (configurable)
// - Targeted refresh: after relevant session completion
// - Manual trigger from dashboard
```

#### API Routes: `/api/org-context`

```
GET  /api/org-context                → Get all context layers with status
GET  /api/org-context/:type          → Get specific context type
POST /api/org-context/refresh        → Trigger full refresh
POST /api/org-context/:type/refresh  → Trigger specific type refresh
GET  /api/org-context/history/:type  → Get history for context type
GET  /api/org-context/prompt-block   → Get assembled prompt block
```

#### React Component

**OrgContextPanel** (addition to Settings or Dashboard):
- Card per context type showing: title, last refreshed, confidence level, word count
- Expand to see the full synthesised text
- "Refresh" button per type
- History viewer (how context evolved over time)
- Toggle: "Include org context in prompts" (global setting)

---

## IMPROVEMENT 5: Organisational Continuity (Key-Person Risk)

### Problem
The most valuable knowledge in any organisation lives in senior people's heads. When they leave, it's gone. ANTON's Institutional Memory already captures override decisions — but this isn't positioned or surfaced as an organisational continuity feature.

### Prerequisites
Depends on `checkpoint_decisions` table. **Investigate first.**

### What to Build

#### Database Changes

```sql
-- Extend checkpoint_decisions (if it exists) or create it:
CREATE TABLE IF NOT EXISTS checkpoint_decisions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  engagement_id TEXT,
  user_id TEXT NOT NULL DEFAULT 'default',
  checkpoint_type TEXT NOT NULL,       -- 'prioritization', 'risk_scoring', 'control_assessment', 'recommendation_override'
  ai_recommendation TEXT NOT NULL,     -- What AI suggested
  human_decision TEXT NOT NULL,        -- What human chose
  rationale TEXT,                      -- Why human overrode (optional but encouraged)
  module_id TEXT,
  area_id TEXT,
  context TEXT,                        -- JSON: surrounding context (regulation, client, topic)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_checkpoint_user ON checkpoint_decisions(user_id);
CREATE INDEX idx_checkpoint_type ON checkpoint_decisions(checkpoint_type);
CREATE INDEX idx_checkpoint_engagement ON checkpoint_decisions(engagement_id);

-- New: continuity analytics view
CREATE TABLE continuity_profiles (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  profile_type TEXT DEFAULT 'expertise' CHECK (profile_type IN (
    'expertise', 'judgment_pattern', 'override_pattern', 'methodology_preference'
  )),
  domain TEXT,                        -- Area/module this relates to
  description TEXT NOT NULL,          -- AI-generated description of this person's patterns
  evidence_count INTEGER DEFAULT 0,   -- How many decisions support this profile
  confidence REAL DEFAULT 0.5,
  last_updated TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_continuity_profiles_user ON continuity_profiles(user_id);
```

#### Backend Service: `continuity.ts`

```typescript
// Location: server/src/services/continuity.ts

// Key functions:

// 1. buildContinuityProfile(userId: string): Promise<ContinuityProfile[]>
//    - Analyses all checkpoint_decisions for a user
//    - Groups by area/module and checkpoint_type
//    - Calls Claude to identify patterns:
//      "Analyse these override decisions. What are this person's consistent
//       judgment patterns? Where do they consistently disagree with AI?
//       What expertise or contextual knowledge are they applying?"
//    - Stores profiles in continuity_profiles
//    - Example output: "This user consistently upgrades KYC-EDD priority from
//      MEDIUM to HIGH, citing repeat audit findings. Their override pattern
//      suggests deep knowledge of the organisation's audit history and 
//      regulatory relationship that the AI lacks."

// 2. getContinuityReport(userId: string): Promise<ContinuityReport>
//    - Generates a human-readable report of what this person "knows" through
//      their decision patterns
//    - Sections: Expertise areas, Judgment patterns, Override rationale themes,
//      Knowledge that would be lost if this person left
//    - Exportable as DOCX

// 3. getContinuityRiskAssessment(): Promise<ContinuityRisk[]>
//    - Across all users, identifies:
//      - Single-person dependencies (areas where only 1 user has checkpoint decisions)
//      - High-override users (people whose judgment consistently differs from AI — 
//        they carry irreplaceable context)
//      - Knowledge concentration (areas where decisions cluster around few people)
//    - Flags risks and suggests mitigations

// 4. transferKnowledge(fromUserId: string, toUserId: string, domain: string): Promise<void>
//    - Generates a "knowledge transfer brief" from one user's continuity profile
//    - Format: "When [person] handles [domain], they typically [patterns].
//      Key override patterns to be aware of: [list]. 
//      Contextual knowledge they apply: [descriptions]."
//    - This is the "$50B question" — making tacit knowledge explicit and transferable
```

#### API Routes: `/api/continuity`

```
GET  /api/continuity/profiles/:userId       → Get continuity profiles for user
POST /api/continuity/profiles/:userId/build  → Build/refresh profiles
GET  /api/continuity/report/:userId          → Get continuity report
GET  /api/continuity/risk-assessment         → Get org-wide continuity risk assessment
POST /api/continuity/transfer                → Generate knowledge transfer brief
GET  /api/continuity/dashboard               → Aggregated continuity metrics
```

#### React Components

**ContinuityDashboard** (`client/src/pages/ContinuityDashboard.tsx`):
- Heatmap: users × areas showing decision density (who knows what)
- Risk indicators: single-person dependencies highlighted in red
- Per-user cards: name, top expertise areas, override rate, knowledge depth score
- Click user → detailed profile with all patterns and evidence
- Export: "Generate Continuity Report" → DOCX with full analysis
- Knowledge transfer wizard: select source person, target person, domain → generate brief

---

## IMPROVEMENT 6: Orchestration Dashboard ("The Brain")

### Problem
ANTON needs a visual representation of its role as the professional intelligence layer above the organisation's tool stack. This is both a functional dashboard and a positioning statement — when someone opens ANTON, they should immediately see that it's the brain, not just another app.

### What to Build

#### React Page: `OrchestrationDashboard.tsx`

This replaces or supplements the existing dashboard/home page. **Investigate first** what the current dashboard looks like.

**Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│  ANTON — Your AI Coworker                                   │
│  [Insights Bell with count]  [Engagement selector]  [User]  │
├──────────────────────────────┬──────────────────────────────┤
│                              │                              │
│  PROACTIVE INSIGHTS          │  ACTIVE ENGAGEMENTS          │
│  (from Improvement 3)        │  (from Improvement 2)        │
│  Critical/warning cards      │  Cards with phase, activity  │
│  with action buttons         │  "Resume" quick actions      │
│                              │                              │
├──────────────────────────────┼──────────────────────────────┤
│                              │                              │
│  RECENT SESSIONS             │  ORG CONTEXT HEALTH          │
│  Resumable sessions          │  (from Improvement 4)        │
│  with context previews       │  Context freshness meters    │
│  (from Improvement 1)        │  per type, refresh buttons   │
│                              │                              │
├──────────────────────────────┴──────────────────────────────┤
│                                                             │
│  CONNECTED SYSTEMS                                          │
│  Visual: ANTON brain icon in center, connected tools around │
│  Show: databases, APIs, MCP servers, local folders          │
│  Status indicators: connected/disconnected/stale            │
│  (Data from external connections framework)                 │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  INTELLIGENCE SUMMARY                                       │
│  Knowledge atoms: [count]  Patterns: [count]  Decisions: [n]│
│  Continuity score: [health]  Engagement coverage: [%]       │
│  "Your ANTON has learned from X sessions across Y domains"  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

This page tells the story: ANTON is the synthesis layer. It knows your engagements, your patterns, your organisational context, your connected systems, and it has insights for you. It's not waiting for a prompt — it's actively working.

#### No new backend needed
This page aggregates data from all other improvements. API calls:
- `GET /api/insights/count` + `GET /api/insights?status=new&limit=5`
- `GET /api/engagements?status=active`
- `GET /api/sessions/resumable?limit=5`
- `GET /api/org-context`
- `GET /api/continuity/dashboard` (if available)
- Existing connections/stats endpoints

---

## Integration Points Summary

### Prompt Builder Modifications

The 7-layer prompt builder needs two new optional injection points:

```
Layer 1: System Foundation           (unchanged)
Layer 2: Area Context                (unchanged)
  Layer 2a: Org Context Block        ← NEW (from Improvement 4, if enabled)
  Layer 2b: Engagement Context Block ← NEW (from Improvement 2, if session in engagement)
Layer 3: Module Methodology          (unchanged)
Layer 4: Expert Persona              (unchanged)
  Layer 4a: Resume Context Block     ← NEW (from Improvement 1, if resuming session)
Layer 5: Skills Library              (unchanged)
Layer 6: Knowledge Sources           (unchanged)
Layer 7: Transparency                (unchanged)
```

**Investigate:** Find the prompt builder implementation and add these injection points as opt-in layers. Each should check whether its data source exists and is populated before injecting anything — graceful degradation if the features aren't fully set up yet.

### Session Lifecycle Hooks

Several improvements need hooks on session events:

```
onSessionCreate  → Check for engagement context, check for resume context
onSessionPause   → Auto-snapshot (Improvement 1), extract engagement knowledge (Improvement 2)
onSessionComplete → Extract knowledge, refresh org context, run proactive analysis
onCheckpointDecision → Store in checkpoint_decisions, update continuity profiles
```

**Investigate:** Find the session management service and add these hooks. Use an event emitter pattern if one exists, or add one.

---

## Testing Notes

Each improvement should be testable independently:

1. **Session Resume:** Create a session, add messages, close, reopen — verify context reconstructs
2. **Engagement Memory:** Create engagement, link 3 sessions, verify context synthesis
3. **Proactive Intelligence:** Seed knowledge_atoms with overlapping patterns, trigger analysis, verify insights generated
4. **Org Context:** Run several sessions, trigger org context refresh, verify synthesis quality
5. **Continuity:** Create checkpoint_decisions with override patterns, build profile, verify pattern detection
6. **Orchestration Dashboard:** Verify all API calls return data and render correctly

---

## Notes for Claude Code

- **Investigate before building.** Every section starts with "Investigate first" — take that seriously. The codebase may have evolved since the last whitepaper audit.
- **Graceful degradation.** Every new feature should work even if other improvements aren't implemented yet. Session Resume should work without Engagement Memory. Proactive Intelligence should work without Org Context. Nothing should crash if a table doesn't exist.
- **Token efficiency.** Context injection (org context, engagement context, resume context) all add tokens. Include estimated token counts in the prompt builder and warn if total exceeds model context window. Consider using Haiku for background synthesis tasks and reserving Opus for user-facing analysis.
- **Don't break existing functionality.** All existing sessions, messages, modules, and workflows must continue working unchanged. New features are additive only.
- **Style consistency.** Follow existing codebase patterns for: service structure, route definitions, React component patterns, database access. Don't introduce new patterns — match what's there.
