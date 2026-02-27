## Section 8: Database & Persistence

### Why SQLite?

openEXPERT uses **SQLite** as its primary database — a surprising choice for a modern AI platform, but a deliberate one.

**The reasoning:**

1. **Local-First Architecture**
   - All your data stays on your machine
   - No cloud dependency
   - Zero network latency for queries
   - Works offline (except for LLM API calls)

2. **Zero Configuration**
   - No database server to install
   - No connection strings to configure
   - No admin passwords to manage
   - Database is just a file: `data/workbench.sqlite`

3. **ACID Guarantees**
   - Full transactional support
   - Data integrity even if process crashes
   - Atomic commits across related tables

4. **Performance at Scale**
   - Handles millions of rows efficiently
   - Write-Ahead Logging (WAL) mode for concurrent reads
   - Optimized indexes on all foreign keys and frequent queries

5. **Portability**
   - Copy the `.sqlite` file → entire database backed up
   - Move between Windows, Mac, Linux seamlessly
   - Inspect with any SQLite browser tool

**When you outgrow SQLite:** If you scale to 100+ concurrent users or multi-GB databases, openEXPERT supports migration to PostgreSQL (cloud-ready, planned Q3 2026).

---

### Database Schema: 82 Tables Across 16 Functional Groups

openEXPERT v2.0 implements a **comprehensive persistence layer** with **82 tables** organized into **16 functional groups**. This supports all transformative features with proper relational integrity.

#### GROUP 1: Core Session & User Management (13 tables)

**Core operations:** Sessions, messages, configurations, projects.

| Table | Purpose |
|-------|---------|
| `sessions` | Session metadata (module, area, config, timestamps) |
| `messages` | Conversation history with token/cost tracking |
| `registered_folders` | Local folder references for knowledge sources |
| `module_configs` | Saved module configurations per user |
| `projects` | Project organization and grouping |
| `project_sessions` | Many-to-many sessions ↔ projects |
| `skills` | Reusable prompt skills library |
| `reviews` | Review engine feedback |
| `user_profiles` | User context and preferences |
| `custom_modules` | User-created modules |
| `community_skills` | Community-submitted skills |
| `community_modules` | Shared custom modules |

**Key table deep dive:**

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL,
  area_id TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  config TEXT NOT NULL DEFAULT '{}',  -- JSON: model, thinking, creativity, outputs
  user_id TEXT DEFAULT 'default',
  project_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  thinking_content TEXT,              -- Extended thinking output (if enabled)
  content_blocks TEXT,                -- JSON array of all content blocks
  token_count INTEGER DEFAULT 0,
  cost REAL DEFAULT 0,
  model_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

#### GROUP 2: Authentication & RBAC (5 tables)

**Role-Based Access Control:** Fully implemented with 3 default roles.

| Table | Purpose |
|-------|---------|
| `users` | User accounts (username, email, password_hash, status) |
| `roles` | Role definitions (admin, analyst, user + custom) |
| `permissions` | Permission definitions (resource + action pairs) |
| `user_roles` | Many-to-many users ↔ roles |
| `role_permissions` | Many-to-many roles ↔ permissions |

**Default Roles:**

| Role | Description | Permissions |
|------|-------------|-------------|
| **admin** | Full system access | All 24 permissions (user management, system config, audit logs) |
| **analyst** | Full feature access | 18 permissions (all modules, workflows, intelligence features) |
| **user** | Standard access | 11 permissions (modules, personal workspace, basic workflows) |

**Permission matrix example:**

```sql
-- Module permissions
module.execute      -- Execute AI modules
module.create       -- Create custom modules
module.update       -- Update custom modules
module.delete       -- Delete custom modules

-- Intelligence permissions
intelligence.read                  -- View intelligence dashboards
intelligence.patterns              -- Access pattern detection
intelligence.knowledge_graph       -- Access knowledge graph

-- Admin permissions
user.admin          -- Manage users
role.admin          -- Manage roles and permissions
budget.admin        -- Manage budgets and limits
audit.read          -- View audit logs
```

---

#### GROUP 3: Security & Audit (4 tables)

**Security monitoring and audit trail.**

| Table | Purpose |
|-------|---------|
| `login_attempts` | Track failed login attempts by username/IP |
| `security_events` | Security incidents (rate limits, unauthorized access, input validation) |
| `audit_log` | Complete audit trail (all CRUD operations with before/after values) |
| `api_requests` | API request logging (endpoint, method, response time, user) |

**Security event types:**
- `failed_login`, `unauthorized_access`, `budget_exceeded`, `rate_limit`, `suspicious_activity`, `invalid_input`, `ssrf_attempt`, `xss_attempt`, `sql_injection`, `privilege_escalation`

**Audit log captures:**
- User ID, action, resource type, resource ID
- Old value → New value (JSON)
- IP address, user agent, timestamp
- Success/failure + error message

---

#### GROUP 4: Institutional Memory (4 tables)

**Checkpoint decisions and learn from past work.**

| Table | Purpose |
|-------|---------|
| `checkpoint_decisions` | Key decisions (interpretations, judgements, approaches) |
| `decision_history` | Audit trail of decision references and overrides |
| `decision_similarities` | Similarity scores between checkpoint pairs |
| `memory_feedback` | User feedback on memory helpfulness |

**How it works:**

1. **User checkpoints decision:** "This customer is high-risk because..."
2. **System logs:** Decision text + reasoning + confidence
3. **Future sessions:** When similar scenario detected → surface past decision
4. **Override tracking:** If user chooses different approach → log for learning

**Checkpoint types:**
- `interpretation` (regulatory text interpretation)
- `judgement` (risk assessment decisions)
- `approach` (methodology choices)
- `assumption` (underlying assumptions)
- `conclusion` (final determinations)

---

#### GROUP 5: Cross-Workflow Intelligence - Knowledge Atoms (4 tables)

**Layer 2 of the 5-layer intelligence funnel.**

| Table | Purpose |
|-------|---------|
| `knowledge_atoms` | Extracted facts, insights, conclusions |
| `atom_sources` | Source sessions/messages for each atom |
| `atom_tags` | Tags for categorization and search |
| `atom_relationships` | Relationships between atoms (supports, contradicts, extends) |

**Atom types:**
- `fact` — Factual statement (e.g., "AMLR Article 8 requires annual BWRA")
- `insight` — Analytical observation (e.g., "Most banks struggle with cross-border screening")
- `conclusion` — Determined outcome (e.g., "Client lacks adequate TM coverage for PEPs")
- `finding` — Discovery (e.g., "Policy silent on crypto assets")
- `recommendation` — Suggested action (e.g., "Implement enhanced screening for high-risk jurisdictions")
- `definition` — Term explanation
- `relationship` — Connection between concepts

**Extraction process:**
1. Session completes → LLM extracts knowledge atoms
2. Each atom linked to source session + message ID
3. Auto-tagged by entity, topic, regulation
4. Relationships detected (supports, contradicts, extends)

---

#### GROUP 6: Knowledge Graph (5 tables)

**Layer 3 of the 5-layer intelligence funnel.**

| Table | Purpose |
|-------|---------|
| `entity_nodes` | Entities (clients, regulations, controls, risks, people, systems) |
| `entity_relationships` | Edges between entities with relationship types |
| `entity_mentions` | Raw mentions in sessions (with context) |
| `entity_merge_log` | Alias consolidation history |
| `entity_aliases` | Alternative names for entities |

**Entity types (11 types):**
- `client`, `regulation`, `control`, `risk`, `person`, `system`, `product`, `geography`, `organization`, `process`, `document`

**Relationship types (10 types):**
- `mentioned_with`, `precedes`, `caused`, `requires`, `contradicts`, `supports`, `implements`, `reports_to`, `owns`, `part_of`

**Example graph query:**

```sql
-- Find all controls that implement AMLR regulations
SELECT
  e1.name AS control_name,
  e2.name AS regulation_name,
  r.strength,
  r.co_occurrence_count
FROM entity_relationships r
JOIN entity_nodes e1 ON r.from_entity_id = e1.id
JOIN entity_nodes e2 ON r.to_entity_id = e2.id
WHERE e1.entity_type = 'control'
  AND e2.entity_type = 'regulation'
  AND r.relationship_type = 'implements'
ORDER BY r.strength DESC;
```

---

#### GROUP 7: Pattern Detection (5 tables)

**Layer 4 of the 5-layer intelligence funnel.**

| Table | Purpose |
|-------|---------|
| `detected_patterns` | Patterns found by 5 detectors |
| `pattern_history` | Audit trail of pattern lifecycle |
| `detector_configs` | Configuration for each detector |
| `pattern_resolutions` | How patterns were resolved |
| `pattern_alerts` | Alerts sent to users |

**The five detectors:**

| Detector | What It Finds | Example |
|----------|---------------|---------|
| **Temporal Correlation** | Events that co-occur in time | "Every BWRA session followed by TM rule update within 72 hours" |
| **Entity Convergence** | Entities mentioned together frequently | "Client X + Regulation Y + Control Z appear in 8 sessions" |
| **Cascade Detection** | Sequential patterns | "Gap analysis → Policy creation → Training material (in that order)" |
| **Trend Divergence** | Anomalous changes | "Sanctions queries up 300% this month vs. baseline" |
| **Gap Detection** | Missing coverage | "No sessions about crypto asset regulations in 90 days" |

**Detector configuration:**

```sql
CREATE TABLE detector_configs (
  id TEXT PRIMARY KEY,
  detector_type TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  sensitivity REAL DEFAULT 0.7,   -- 0.0 - 1.0
  threshold REAL DEFAULT 0.5,     -- Confidence threshold to trigger alert
  lookback_days INTEGER DEFAULT 30,
  config TEXT DEFAULT '{}',       -- Detector-specific params
  last_run_at TEXT,
  next_run_at TEXT
);
```

---

#### GROUP 8: Quality Ratchet (4 tables)

**Never go backwards on quality.**

| Table | Purpose |
|-------|---------|
| `quality_baselines` | Initial quality scores per session |
| `quality_scores` | Quality assessment per message |
| `quality_history` | Evolution of quality over time |
| `quality_alerts` | Alerts when quality drops |

**6-dimensional quality scoring:**

1. **Completeness** (0-100): Coverage of required sections
2. **Accuracy** (0-100): Factual correctness, citation quality
3. **Structure** (0-100): Logical flow, readability, formatting
4. **Actionability** (0-100): Clear recommendations, next steps
5. **Citations** (0-100): Proper regulatory references
6. **Overall** (0-100): Weighted average

**How the ratchet works:**

1. **First output:** Baseline set (e.g., Overall = 85)
2. **Iterate:** User asks for changes
3. **Re-score:** New output scored (e.g., Overall = 82)
4. **Alert:** "⚠️ Quality dropped 3 points (85 → 82). Completeness score decreased."
5. **User decision:** Accept trade-off or regenerate

**Alert types:**
- `below_baseline` — Current score < baseline
- `significant_drop` — Drop of >5 points in any dimension
- `persistent_low` — 3+ consecutive outputs below baseline
- `improvement` — Positive alert when quality increases

---

#### GROUP 9: Apprentice Model (4 tables)

**AI learns by doing, with human oversight.**

| Table | Purpose |
|-------|---------|
| `apprentice_stages` | Current stage per module per user |
| `apprentice_history` | Stage progression audit trail |
| `apprentice_confidence` | AI confidence scores per output |
| `override_log` | When human overrode AI suggestions |

**4-stage progression:**

| Stage | AI Behavior | Human Role | Criteria to Advance |
|-------|-------------|-----------|---------------------|
| **Observer** | Watches only, suggests structure | Does all analysis | 10 sessions completed |
| **Guided** | Drafts outline, flags key areas | Reviews and directs | 15 successful outputs, <20% override rate |
| **Supervised** | Produces full analysis | Spot-checks, approves | 25 successful outputs, <10% override rate |
| **Autonomous** | Works independently | Reviews final output only | 50 successful outputs, <5% override rate |

**Confidence tracking:**

```sql
CREATE TABLE apprentice_confidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  message_id TEXT,
  stage_id INTEGER,
  confidence_score REAL NOT NULL,  -- 0.0 - 1.0
  reasoning TEXT,
  user_feedback TEXT CHECK(user_feedback IN ('accepted', 'rejected', 'modified'))
);
```

**Use case:** AMLR Gap Analysis module
- Starts in Observer (AI suggests "You should review Article 8, 13, 18")
- After 10 gap analyses → Guided (AI drafts gap matrix, human reviews)
- After 25 successful → Supervised (AI produces full report, human spot-checks)
- After 50 successful → Autonomous (AI trusted to produce final output)

---

#### GROUP 10: Time Intelligence (4 tables)

**Deadlines, capacity, estimates.**

| Table | Purpose |
|-------|---------|
| `deadlines` | Regulatory deadlines and project milestones |
| `capacity_log` | Team capacity tracking (planned vs. actual hours) |
| `time_estimates` | Task duration estimates and accuracy tracking |
| `deadline_alerts` | Upcoming deadline notifications |

**Deadline types:**
- `regulatory` — Official compliance deadlines (e.g., "AMLR implementation: June 10, 2027")
- `consultation` — Comment period end dates
- `implementation` — Internal go-live dates
- `project` — Project milestones
- `milestone` — Key deliverable dates

**Capacity planning:**

```sql
CREATE TABLE capacity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  user_id TEXT,
  team_id TEXT,
  planned_hours REAL DEFAULT 0,
  actual_hours REAL DEFAULT 0,
  utilization_percent REAL DEFAULT 0,  -- actual / planned * 100
  notes TEXT
);
```

**Smart estimates:**
- System learns: "BWRA creation usually takes 8-12 hours"
- User selects module → estimated effort shown
- After completion → actual vs. estimated recorded
- Accuracy improves over time

---

#### GROUP 11: Regulatory Radar (5 tables)

**Living regulatory monitoring.**

| Table | Purpose |
|-------|---------|
| `radar_items` | Tracked regulations, consultations, guidelines |
| `radar_subscriptions` | User subscriptions (by jurisdiction, topic, keyword) |
| `regulatory_changes` | Detected changes in tracked items |
| `radar_alerts` | Alerts sent to users |
| `radar_actions` | Actions taken on radar items |

**Item types:**
- `regulation`, `consultation`, `guideline`, `announcement`, `enforcement`, `case_law`

**Subscription model:**

```sql
CREATE TABLE radar_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  subscription_type TEXT NOT NULL,  -- jurisdiction, topic, source, keyword
  subscription_value TEXT NOT NULL, -- e.g., "EU", "sanctions", "EBA"
  alert_frequency TEXT DEFAULT 'daily', -- real_time, daily, weekly, monthly
  enabled INTEGER DEFAULT 1
);
```

**Change detection:**

```sql
CREATE TABLE regulatory_changes (
  id TEXT PRIMARY KEY,
  radar_item_id TEXT NOT NULL,
  change_type TEXT NOT NULL,  -- new_requirement, amendment, repeal, deadline_change
  previous_text TEXT,
  new_text TEXT,
  impact_assessment TEXT,
  detected_at TEXT NOT NULL
);
```

**Workflow:**

1. **User subscribes:** "Alert me to all EU AML regulations"
2. **Radar monitors:** EUR-Lex, EBA website, etc. (via web search + scheduled checks)
3. **Change detected:** AMLR RTS published
4. **Alert sent:** Email or in-app notification
5. **User action:** Create project, set deadline, run impact analysis

---

#### GROUP 12: Compliance-as-Code (4 tables)

**Machine-readable compliance rules.**

| Table | Purpose |
|-------|---------|
| `compliance_rules` | Rule definitions (validation logic, thresholds) |
| `rule_violations` | Detected violations |
| `rule_history` | Rule change audit trail |
| `rule_exemptions` | Approved exemptions from rules |

**8 seeded rules (examples):**

1. **Customer Due Diligence Completeness** (Error)
   - Check: Output must include customer ID, risk assessment, monitoring plan
   - Regulation: AMLR Article 13

2. **Risk Score Threshold** (Error)
   - Check: Risk scores 0-100 with documented methodology
   - Regulation: AMLR Article 8

3. **Transaction Monitoring Rule Documentation** (Warning)
   - Check: TM rules must have rationale, threshold, calibration, review frequency
   - Regulation: EBA Guidelines

4. **Sanctions Screening Timeliness** (Critical)
   - Check: Screening must be <24 hours old, list version documented
   - Regulation: EU Sanctions

5. **BWRA Geographic Coverage** (Error)
   - Check: All jurisdictions covered
   - Regulation: AMLR Article 8

6. **Policy Version Control** (Warning)
   - Check: Version number, approval date, review date present
   - Regulation: Governance requirement

7. **Citation Requirement** (Warning)
   - Check: Minimum 3 regulatory citations
   - Regulation: Quality standard

8. **Dual Approval - High Risk** (Critical)
   - Check: High-risk customers require 2 approvals
   - Regulation: AMLR Article 18

**Rule logic (JSON):**

```json
{
  "check": "numeric_range",
  "field": "risk_score",
  "min": 0,
  "max": 100,
  "require_methodology": true
}
```

**Violation workflow:**

1. **Rule triggered:** Output violates rule
2. **Violation logged:** Severity, evidence, status
3. **User notified:** "⚠️ Compliance rule violated: Risk Score Threshold"
4. **User action:** Fix and regenerate, or request exemption
5. **Exemption:** Approved by admin with reason and expiry

---

#### GROUP 13: Workflow Automation (4 tables)

**Multi-step automated processes.**

| Table | Purpose |
|-------|---------|
| `workflow_definitions` | Workflow templates (trigger, steps, config) |
| `workflow_runs` | Execution instances |
| `workflow_steps` | Individual step execution and results |
| `workflow_schedules` | Scheduled workflow execution |

**12 step types:**

1. **LLM** — Execute module with inputs
2. **Wait** — Pause for duration or until date
3. **Approval** — Human approval gate
4. **Email** — Send email notification
5. **Webhook** — Call external API
6. **Extract** — Extract data from previous output
7. **Transform** — Apply transformation logic
8. **Conditional** — Branch based on condition
9. **Parallel** — Execute multiple steps simultaneously
10. **Loop** — Iterate over list
11. **Export** — Export to file format
12. **Review** — Trigger review engine

**Example workflow:** "Monthly Regulatory Update Report"

```json
{
  "trigger_type": "scheduled",
  "schedule": "0 9 1 * *",  // 9 AM on 1st of month
  "steps": [
    {
      "type": "llm",
      "module_id": "regulatory-monitor",
      "inputs": { "query": "EU AML developments last 30 days" }
    },
    {
      "type": "export",
      "format": "pdf"
    },
    {
      "type": "email",
      "to": "compliance-team@company.com",
      "subject": "Monthly Regulatory Update",
      "attach_previous_output": true
    }
  ]
}
```

---

#### GROUP 14: Output Versioning (2 tables)

**Never lose a version.**

| Table | Purpose |
|-------|---------|
| `output_versions` | Every saved version of output |
| `version_diffs` | Computed diffs between versions |

**How it works:**

1. **Initial output:** Version 1 created
2. **User edits:** "Make this more concise"
3. **New output:** Version 2 created
4. **Diff computed:** Changed sections highlighted
5. **User reviews:** Side-by-side comparison
6. **Revert option:** Can restore any previous version

**Diff format:**
- Markdown with `+ added lines` and `- removed lines`
- Computed using standard diff algorithm
- Stored for fast retrieval

---

#### GROUP 15: Collaborative Canvas (4 tables)

**Multi-human workflows.**

| Table | Purpose |
|-------|---------|
| `canvas_sessions` | Shared workspaces for collaboration |
| `canvas_participants` | Users in canvas with roles |
| `canvas_comments` | Comments, suggestions, approvals |
| `canvas_changes` | Audit trail of all changes |

**Canvas types:**
- `general` — Open collaboration
- `review` — Formal review process
- `brainstorm` — Ideation session
- `planning` — Planning workspace

**Participant roles:**

| Role | Permissions |
|------|-------------|
| **owner** | Full control (edit, invite, delete) |
| **editor** | Edit content, add comments |
| **reviewer** | Comment, approve/reject |
| **viewer** | Read-only access |

**Comment types:**
- `comment` — General comment
- `suggestion` — Suggested change
- `approval` — Approve section
- `rejection` — Reject section
- `question` — Ask question

**Use case:** "Sanctions Policy Review"

1. **Owner creates canvas:** Links draft policy document
2. **Invites reviewers:** Legal, Compliance, Operations (each as reviewer)
3. **Reviewers comment:** "Section 3.2 needs clarification on crypto assets"
4. **Owner edits:** Updates section
5. **Reviewers approve:** All approve → policy final

---

#### GROUP 16: Budget & Cost Management (3 tables)

**Cost control and tracking.**

| Table | Purpose |
|-------|---------|
| `budget_limits` | Per-user or per-team spending limits |
| `cost_tracking` | Every API call with token and cost details |
| `usage_alerts` | Budget threshold alerts |

**Budget limits:**

```sql
CREATE TABLE budget_limits (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE,
  team_id TEXT,
  limit_type TEXT NOT NULL,  -- daily, weekly, monthly, total
  limit_amount REAL NOT NULL,
  current_spend REAL DEFAULT 0,
  alert_threshold REAL DEFAULT 0.8,  -- Alert at 80% of limit
  enabled INTEGER DEFAULT 1
);
```

**Cost tracking:**

```sql
CREATE TABLE cost_tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  session_id TEXT,
  message_id TEXT,
  model_id TEXT NOT NULL,
  provider TEXT NOT NULL,  -- anthropic, openai, google, mistral, ollama
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cached_tokens INTEGER DEFAULT 0,
  cost REAL DEFAULT 0,
  created_at TEXT NOT NULL
);
```

**Alert workflow:**

1. **User hits 80% of monthly budget:** Alert sent
2. **User hits 100%:** Further API calls blocked (configurable)
3. **Admin:** Can increase limit or approve override

**Cost analysis queries:**

```sql
-- Monthly spend by user
SELECT user_id, SUM(cost) AS total_cost, COUNT(*) AS api_calls
FROM cost_tracking
WHERE created_at >= date('now', 'start of month')
GROUP BY user_id
ORDER BY total_cost DESC;

-- Cost by model
SELECT model_id, SUM(cost) AS total_cost,
       SUM(input_tokens + output_tokens) AS total_tokens
FROM cost_tracking
GROUP BY model_id;
```

---

### Performance Optimizations

**Indexes (120+ indexes):**
- Every foreign key has an index
- Common query patterns optimized
- Composite indexes on frequently joined columns
- Timestamp columns indexed for date-range queries

**WAL Mode:**
```sql
PRAGMA journal_mode = WAL;
```
- Concurrent reads while writing
- Faster commits
- Better crash recovery

**Foreign Key Enforcement:**
```sql
PRAGMA foreign_keys = ON;
```
- Referential integrity guaranteed
- Cascading deletes prevent orphaned records

**Query optimization examples:**

```sql
-- Fast session lookup by module (indexed)
SELECT * FROM sessions
WHERE module_id = 'gap-analysis'
ORDER BY updated_at DESC
LIMIT 10;

-- Fast pattern search by type and status (indexed)
SELECT * FROM detected_patterns
WHERE pattern_type = 'temporal_correlation'
  AND status = 'new'
ORDER BY detected_at DESC;

-- Fast knowledge atom search by tag (indexed)
SELECT ka.*
FROM knowledge_atoms ka
JOIN atom_tags at ON ka.id = at.atom_id
WHERE at.tag = 'AMLR'
ORDER BY ka.created_at DESC;
```

---

### Backup & Migration

**Backup (simple file copy):**

```bash
# Backup
cp data/workbench.sqlite data/backup_$(date +%Y%m%d).sqlite

# Or use SQLite backup API
sqlite3 data/workbench.sqlite ".backup data/backup.sqlite"

# Automated daily backup (Linux/Mac cron)
0 2 * * * sqlite3 /path/to/data/workbench.sqlite ".backup /path/to/backups/$(date +\%Y\%m\%d).sqlite"
```

**Restore:**
```bash
cp data/backup_20260220.sqlite data/workbench.sqlite
```

**Migration to PostgreSQL (future):**

When ready to scale:
1. Export schema: `sqlite3 workbench.sqlite .schema > schema.sql`
2. Convert to PostgreSQL syntax (automated tool provided)
3. Export data: CSV or JSON
4. Import to PostgreSQL
5. Update `DB_TYPE=postgresql` in `.env`

---

### Database Statistics Dashboard

Track database health with built-in statistics:

```sql
-- Table sizes
SELECT name, SUM(pgsize) / 1024.0 / 1024.0 AS size_mb
FROM dbstat
GROUP BY name
ORDER BY size_mb DESC;

-- Row counts
SELECT 'sessions' AS table_name, COUNT(*) AS row_count FROM sessions
UNION ALL
SELECT 'messages', COUNT(*) FROM messages
UNION ALL
SELECT 'knowledge_atoms', COUNT(*) FROM knowledge_atoms
-- ... etc
ORDER BY row_count DESC;

-- Largest sessions by message count
SELECT s.id, s.title, COUNT(m.id) AS message_count,
       SUM(m.token_count) AS total_tokens,
       SUM(m.cost) AS total_cost
FROM sessions s
JOIN messages m ON s.id = m.session_id
GROUP BY s.id
ORDER BY message_count DESC
LIMIT 10;
```

---

### Summary

openEXPERT's database is **comprehensive** (82 tables), **performant** (WAL mode, 120+ indexes), **maintainable** (SQLite simplicity), and **production-ready** (ACID guarantees, foreign key enforcement).

Every transformative feature has proper database backing. Nothing is ephemeral — all knowledge, patterns, quality scores, and decisions persist for long-term learning and compliance audit trails.

**Next:** Section 9 explores how these tables power Cross-Workflow Intelligence.
