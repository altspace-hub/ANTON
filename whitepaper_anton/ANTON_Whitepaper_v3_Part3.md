## PART 3: CORE ARCHITECTURE

*Part 3 opens the hood. Where Part 1 explained the philosophy and Part 2 explained the value, this section explains how ANTON actually works — the technical architecture that makes everything possible. We cover the seven-layer prompt system that gives every module its expertise, the knowledge source system that connects ANTON to your data, the multi-LLM architecture that prevents vendor lock-in, and the database persistence layer that ensures nothing is ever lost.*

*This is the section for technical evaluators, architects, and anyone who wants to understand not just what ANTON does, but how it does it.*

---

## 12. How It Works: The Seven-Layer Prompt Builder

The quality of AI output depends on the quality of the prompt. This is the foundational truth of professional AI work, and it's the reason ANTON exists. Rather than expecting every professional to become a prompt engineer, ANTON uses a **seven-layer prompt assembly system** that combines general AI capabilities with domain expertise, organisational context, and user preferences — automatically, behind the scenes, for every module.

### Overview

Each layer adds specific knowledge or configuration, building from general principles to task-specific expertise:

1. **System Foundation** — Core behavioural principles
2. **Area Context** — Domain-specific background
3. **Module Expertise** — Specific task methodology
4. **Persona Injection** (optional) — Expert perspective
5. **Skills Attachment** (optional) — Reusable frameworks
6. **Knowledge Source Integration** — Reference material
7. **Transparency & Reasoning** — How AI thinks

The result is a comprehensive prompt that can run to tens of thousands of tokens — far more detailed and nuanced than any prompt a human would write for a single session. This is the "professional training" described in Part 1: the structured expertise that transforms a general AI model into a domain-specific professional.

---

### Layer 1: System Foundation

**Purpose:** Establish core behavioural principles that apply to every module, every session, every interaction.

**Content:**
- Analytical rigour standards
- Professional tone guidelines
- Citation requirements
- Uncertainty acknowledgment protocols
- Output structure expectations

**Implementation:** `server/areas/system-foundation.md`

**Example:**
```markdown
You are ANTON, an AI expert assistant built on the openEXPERT platform. You provide professional-grade analysis across 29 domains.

Core principles:
1. Accuracy over speed — verify before asserting
2. Cite regulatory sources with article numbers
3. Flag assumptions and limitations explicitly
4. Structure outputs for executive readability
5. Maintain professional tone unless user specifies otherwise
```

**Why it matters:** This layer ensures every module follows consistent quality standards. Whether you're running an AML gap analysis or a project status report, the foundational principles — accuracy, citations, uncertainty acknowledgment — are always present.

---

### Layer 2: Area Context

**Purpose:** Provide domain-specific background for each expert area. This is what gives ANTON "industry awareness" — the regulatory landscape, key terminology, common methodologies, and stakeholder context that any professional in the field would know.

**Content:**
- Industry standards and frameworks
- Common methodologies
- Regulatory landscape overview
- Key terminology
- Typical stakeholders

**Implementation:** `server/areas/{area-id}/area-context.md` (one per area)

**Example (FCP Area):**
```markdown
Financial Crime Prevention (FCP) covers AML/CFT, sanctions compliance, fraud detection, and KYC/CDD.

Key regulations: EU AML Directive (6AMLD), AMLR 2024/1624, AMLA, Sanctions Regulation 833/2014, EBA Guidelines.

Methodologies: Risk-Based Approach (RBA), Know Your Customer (KYC), Customer Due Diligence (CDD), Enhanced Due Diligence (EDD), Transaction Monitoring (TM), Suspicious Activity Reporting (SAR/STR).

Stakeholders: MLROs, Compliance Officers, Front-line staff, Board Risk Committees, FIUs, Regulators.
```

**Why it matters:** AI needs to "speak the language" of the domain. When a compliance officer asks about customer risk categorisation, ANTON already knows the regulatory context, the standard terminology, and the stakeholder expectations — it doesn't need to be told.

---

### Layer 3: Module Expertise

**Purpose:** Define the specific task, expected output structure, and quality criteria. This is the core of ANTON's "professional training" — the layer that transforms a general AI conversation into a structured professional deliverable.

**Content:**
- Task definition and objectives
- Input requirements
- Step-by-step methodology
- Output structure template
- Quality checklist
- Common pitfalls to avoid

**Implementation:** `server/areas/{area-id}/modules/{module-id}/system-prompt.md`

**Example (AMLR Gap Analysis):**
```markdown
# AMLR Gap Analysis Module

## Objective
Systematically compare an institution's current AML/CFT framework against EU AMLR 2024/1624 requirements, producing a scored gap matrix and prioritised action plan.

## Methodology
1. Extract regulatory requirements from AMLR
2. Map requirements to institution's current controls
3. Score each requirement: Compliant (Green), Partial (Yellow), Gap (Red)
4. Assess materiality and urgency
5. Prioritise remediation based on risk

## Output Structure
- Executive Summary (1-2 pages, board-ready)
- Gap Scoring Matrix (tabular, RAG-rated)
- Detailed Findings (per requirement with evidence)
- Prioritised Action Plan (who, what, when, effort)
```

**Why it matters:** This is the "expert training" that teaches AI how professionals actually perform the task — not the textbook version, but the version that experienced practitioners use in real engagements. The methodology, the output structure, the quality criteria — these come from years of professional practice.

---

### Layers 4-7: Configuration & Context

**Layer 4: Persona Injection** — Adds a specific expert perspective. When activated, the AI adopts the analytical approach, priorities, and communication style of the selected persona (e.g., "Senior AML Compliance Officer with 15 years' regulatory experience" or "CISO with financial services background"). This changes not just what the AI says, but how it thinks about the problem.

**Layer 5: Skills Attachment** — Injects reusable analytical frameworks and methodologies. Skills are portable across modules — a "Devil's Advocate" skill works equally well in a gap analysis and a project risk assessment. The skills library contains 50+ pre-built frameworks, and you can create your own.

**Layer 6: Knowledge Source Integration** — Provides reference material through the 4-mode system (see §13). This is where your documents, web search results, database query results, and URL content are assembled and included in the prompt.

**Layer 7: Transparency & Reasoning** — Controls how the AI thinks and how much of that thinking is visible. Maps to the three transparency levels (Level 0: output only, Level 1: show thinking, Level 2: deep trace). Also controls creativity settings and output format preferences.

---

### How Layers Combine

When a user runs a module, all layers are assembled into a single comprehensive prompt:

```
System Prompt:
┌─────────────────────────────────┐
│ Layer 1: System Foundation      │
│ Layer 2: Area Context           │
│ Layer 3: Module Expertise       │
│ Layer 4: Persona (if selected)  │
│ Layer 5: Skills (if attached)   │
│ Layer 6: Knowledge Sources      │
│ Layer 7: Reasoning Config       │
└─────────────────────────────────┘

User Message:
"Please conduct a gap analysis of our AML policy..."
```

**Result:** The AI receives a comprehensive context that combines organisational principles, domain knowledge, task-specific methodology, expert perspective, analytical tools, reference material, and reasoning configuration. This assembled prompt is what makes the difference between "AI helped me write something" and "AI produced a professional deliverable."

**Implementation:** `server/services/prompt-builder.ts` — a single service that orchestrates all seven layers into a unified prompt, handling token counting, priority ordering, and overflow management.

---

## 13. Knowledge Source System (4 Modes)

This is Layer 6 of the prompt builder — where ANTON gets its reference material. The four modes determine how much of the outside world ANTON can see, from isolated (your data stays completely private) to fully integrated (databases, documents, web, and tools all connected).

### Mode 1: AI Knowledge + Web Search

**What:** The AI model's built-in knowledge (training data) plus optional real-time web search.

**When to use:**
- General regulatory knowledge
- Latest publications (EBA consultations, FATF statements)
- Market research, competitive analysis
- Any task where organisational data isn't needed

**Configuration:**
```json
{
  "claudeKnowledge": {
    "enabled": true,
    "webSearchEnabled": true,
    "description": "AMLR Regulation 2024/1624, EBA consultation papers on AMLR"
  }
}
```

**Implementation:**
- Adds `web_search` tool to Claude API request
- AI decides when to search based on query context
- Results appear in streaming response
- Citations automatically included

**Cost:** ~500-2000 additional output tokens per search

---

### Mode 2: Online Reference Links

**What:** Server-side fetching of specific URLs — regulations, guidance documents, web pages.

**When to use:**
- EUR-Lex regulation URLs
- Publicly accessible guidance documents
- Online knowledge bases and regulatory portals

**Configuration:**
```json
{
  "onlineReference": {
    "enabled": true,
    "urls": ["https://eur-lex.europa.eu/eli/reg/2024/1624/oj"],
    "fetchDepth": "full"
  }
}
```

**Implementation:**
- Server fetches URL content (HTML parsing for web pages, pdf-parse for PDFs)
- Extracts and cleans text
- Appends to system prompt with source attribution
- Summary mode (~5k tokens) vs. full text extraction

**Limitations:** Cannot access authenticated content (Google Docs with login, corporate intranets)

---

### Mode 3: Local Folder Integration

**What:** Index local folders, extract text from all documents, include in prompt context.

**When to use:**
- Client engagement folders (policies, procedures, internal documents)
- Downloaded regulations and guidance
- Historical analyses and deliverables

**Configuration:**
```json
{
  "localFolder": {
    "enabled": true,
    "folderPaths": ["/Users/daniel/Advisense/Regulations/AMLR"],
    "recursive": true,
    "fileFilter": [".pdf", ".docx", ".xlsx", ".txt", ".md"]
  }
}
```

**Implementation:**
1. Folder registration (saved to database for persistence)
2. Recursive scanning with file type filtering
3. Text extraction per file type (pdf-parse, mammoth, xlsx libraries)
4. Append to system prompt with file attribution
5. Token counting with 180k limit enforcement

**Security:**
- Path traversal protection
- No folder access outside user-selected paths
- Extracted text not permanently stored (on-demand only)

---

### Mode 4: Combined Mode

**What:** Local documents + AI knowledge + web search + URLs + database connectivity (v3.0) simultaneously.

**When to use:** Gap analyses (compare client docs against regulations), risk assessments with live data, any task requiring multiple data sources.

**Configuration:**
```json
{
  "combinedMode": {
    "enabled": true,
    "priority": "local_first",
    "instructions": "Compare client AML policy against AMLR. Where client is silent, identify the gap."
  }
}
```

**Priority options:**
- `local_first`: Ground in client documents, fill gaps with AI knowledge
- `claude_first`: Start from regulatory requirements, assess client documents
- `merged`: Treat all sources equally, cross-reference

---

### Token Management

**Challenge:** Context window limits (180k tokens for Claude Opus 4.6)

**Solution:**
1. Real-time token counting during knowledge source indexing
2. Warning at 150k tokens (~83%)
3. Hard stop at 180k (prevents API rejection and wasted costs)
4. User can deselect files or switch to summary mode
5. Auto-summarise large files when token budget is tight

**Display:** "Loaded: 87,450 tokens / 180,000 (48%)" — visible in the UI at all times.

---

## 14. Multi-LLM Architecture

ANTON supports **six AI providers** with seamless switching. This is a deliberate design choice: no vendor lock-in, no dependency on any single provider's pricing, availability, or capability decisions.

### Supported Providers

#### 1. Anthropic Claude (Primary)

**Models:**
- `claude-opus-4-6` — Most capable. Best for regulatory work, complex analysis, and professional deliverables.
- `claude-sonnet-4-6` — Latest balanced model. Excellent cost/performance ratio for most tasks.
- `claude-sonnet-4-5-20250929` — Proven balanced performance.
- `claude-haiku-4-5-20251001` — Fast and cheap. Ideal for quick questions, formatting tasks, simple lookups.

**Features:**
- Adaptive thinking with `effort` parameter (maps to ANTON's thinking levels)
- Native web search tool
- Prompt caching — 90% cost reduction on repeated context

**Cost (February 2026):**
- Opus: ~$15/M input, ~$75/M output
- Sonnet: ~$3/M input, ~$15/M output
- Haiku: ~$0.25/M input, ~$1.25/M output

---

#### 2. OpenAI GPT

**Models:**
- `gpt-4-turbo` — 128k context, vision support
- `gpt-3.5-turbo` — Fast, cheap, 16k context

**Features:**
- Seed parameter for reproducible outputs
- Function calling

**Cost:** ~$10/M input, ~$30/M output (GPT-4)

---

#### 3. Google Gemini

**Models:** `gemini-2.0-flash`

**Features:**
- Very low cost (ideal for high-volume and batch tasks)
- Large context window
- Fast inference
- Free tier available for evaluation

**Cost:** ~$0.10/M input, ~$0.40/M output

---

#### 4. Mistral

**Models:** `mistral-large-2411`

**Features:**
- EU data residency (Mistral is an EU-based company, subject to EU data protection law)
- Seed parameter for reproducibility
- Attractive option for European organisations with data residency requirements

**Cost:** ~$4/M input, ~$12/M output

---

#### 5. Local Ollama

**Models:** Any Ollama-compatible model (Llama, Mistral, Gemma, Qwen, etc.)

**Features:**
- Runs completely locally — zero API costs
- Complete data privacy — nothing leaves your network
- Offline capability (no internet required after model download)
- New models available immediately as Ollama ecosystem grows

**Requirements:** Ollama installed. GPU recommended (16+ GB VRAM for best performance). CPU-only works but slower.

---

#### 6. MCP Integration

**What:** Model Context Protocol integration for connecting to external tools and data sources.

**As server:** ANTON exposes its 238 modules as MCP tools accessible by Claude Desktop and other MCP clients.

**As client:** ANTON connects to external MCP servers for databases, file systems, APIs, and other tools.

---

### Provider-Agnostic Design

**Unified interface:** The same module configuration, the same 7-layer prompt system, and the same quality framework work identically across all providers. The adapter layer translates ANTON's settings to provider-specific API parameters.

**Example translation:**

| ANTON Setting | Claude Opus 4.6 | GPT/Mistral |
|---------------|-----------------|-------------|
| `thinking: "investigate"` | `effort: "max"` | 32,768 token budget |
| `creativity: "strict"` | Prompt: "Precise, factual..." | Prompt: "Precise, factual..." |

**Result:** Users switch models without reconfiguring modules. A gap analysis module works identically whether powered by Claude Opus, GPT-4, Mistral Large, or a local Ollama model — the professional training, the quality framework, and the governance are provided by ANTON, not by the model.

**Implementation:** `server/services/unified-llm-client.ts` + `model-adapter.ts`

---

### Cost Tracking

Every API call is logged to `audit_log` with:
- Provider (anthropic, openai, google, mistral, ollama)
- Model
- Input/output/cached tokens
- Estimated cost (calculated server-side using current pricing)

**Dashboard:** Monthly usage per provider, cost by user, cost by module, cost trends over time.

---

### Prompt Caching (Claude Only)

**What:** Cache large, repeated system prompts to reduce costs by up to 90%.

**How it works:**
- First request: Full input cost + cache creation (~25% of input cost)
- Subsequent requests within 5 minutes: Cached sections billed at ~10% of normal rate

**Savings example:**
- 80k regulation text in knowledge sources
- Without caching: 5 sessions = 400k tokens × $15/M = $6.00
- With caching: $1.20 + (4 × $0.12) = $1.68
- **72% cost reduction**

This makes a material difference when running multiple analyses against the same regulatory text — a common pattern in professional work where the regulation is constant but the analysis questions vary.

---

## 15. Database & Persistence

### Why SQLite?

ANTON uses **SQLite** as its primary database — a choice that surprises some enterprise architects, but it's deliberate and well-reasoned.

**The reasoning:**

1. **Local-First Architecture** — All your data stays on your machine. No cloud dependency. Zero network latency for queries. Works offline (except for LLM API calls).

2. **Zero Configuration** — No database server to install. No connection strings to configure. No admin passwords to manage. The database is a single file: `data/workbench.sqlite`.

3. **ACID Guarantees** — Full transactional support. Data integrity even if the process crashes. Atomic commits across related tables.

4. **Performance at Scale** — Handles millions of rows efficiently. Write-Ahead Logging (WAL) mode for concurrent reads. Optimised indexes on all foreign keys and frequent query patterns.

5. **Portability** — Copy the `.sqlite` file and your entire database is backed up. Move between Windows, Mac, Linux seamlessly. Inspect with any SQLite browser tool.

**When you outgrow SQLite:** If you scale to 100+ concurrent users or multi-GB databases, ANTON supports migration to PostgreSQL (planned Q3 2026). The schema is designed for portability — the same table structures work in both engines.

---

### Database Schema: 82 Tables Across 16 Functional Groups

ANTON implements a **comprehensive persistence layer** with **82 tables** organised into **16 functional groups**. Every transformative feature has proper database backing — nothing is ephemeral.

#### GROUP 1: Core Session & User Management (13 tables)

**Core operations:** Sessions, messages, configurations, projects.

| Table | Purpose |
|-------|---------|
| `sessions` | Session metadata (module, area, config, timestamps) |
| `messages` | Conversation history with token/cost tracking |
| `registered_folders` | Local folder references for knowledge sources |
| `module_configs` | Saved module configurations per user |
| `projects` | Project organisation and grouping |
| `project_sessions` | Many-to-many sessions ↔ projects |
| `skills` | Reusable prompt skills library |
| `reviews` | Review engine feedback |
| `user_profiles` | User context and preferences |
| `custom_modules` | User-created modules |
| `community_skills` | Community-submitted skills |
| `community_modules` | Shared custom modules |

**Key table structure:**

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

**Permission examples:**
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

**Security monitoring and comprehensive audit trail.**

| Table | Purpose |
|-------|---------|
| `login_attempts` | Track failed login attempts by username/IP |
| `security_events` | Security incidents (rate limits, unauthorised access, input validation) |
| `audit_log` | Complete audit trail (all CRUD operations with before/after values) |
| `api_requests` | API request logging (endpoint, method, response time, user) |

**Security event types:**
`failed_login`, `unauthorized_access`, `budget_exceeded`, `rate_limit`, `suspicious_activity`, `invalid_input`, `ssrf_attempt`, `xss_attempt`, `sql_injection`, `privilege_escalation`

**Audit log captures:**
- User ID, action, resource type, resource ID
- Old value → New value (JSON diff)
- IP address, user agent, timestamp
- Success/failure with error message

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
2. **System logs:** Decision text + reasoning + confidence level
3. **Future sessions:** When similar scenario detected → surface past decision
4. **Override tracking:** If user chooses different approach → logged for learning

**Checkpoint types:** `interpretation` (regulatory text interpretation), `judgement` (risk assessment decisions), `approach` (methodology choices), `assumption` (underlying assumptions), `conclusion` (final determinations)

---

#### GROUP 5: Cross-Workflow Intelligence — Knowledge Atoms (4 tables)

**Layer 2 of the 5-layer intelligence funnel.**

| Table | Purpose |
|-------|---------|
| `knowledge_atoms` | Extracted facts, insights, conclusions |
| `atom_sources` | Source sessions/messages for each atom |
| `atom_tags` | Tags for categorisation and search |
| `atom_relationships` | Relationships between atoms (supports, contradicts, extends) |

**Atom types:** `fact`, `insight`, `conclusion`, `finding`, `recommendation`, `definition`, `relationship`

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

**11 entity types:** `client`, `regulation`, `control`, `risk`, `person`, `system`, `product`, `geography`, `organization`, `process`, `document`

**10 relationship types:** `mentioned_with`, `precedes`, `caused`, `requires`, `contradicts`, `supports`, `implements`, `reports_to`, `owns`, `part_of`

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

**Alert types:** `below_baseline`, `significant_drop` (>5 points), `persistent_low` (3+ consecutive below baseline), `improvement` (positive alert)

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

| Stage | AI Behaviour | Human Role | Criteria to Advance |
|-------|-------------|-----------|---------------------|
| **Observer** | Watches only, suggests structure | Does all analysis | 10 sessions completed |
| **Guided** | Drafts outline, flags key areas | Reviews and directs | 15 successful outputs, <20% override rate |
| **Supervised** | Produces full analysis | Spot-checks, approves | 25 successful outputs, <10% override rate |
| **Autonomous** | Works independently | Reviews final output only | 50 successful outputs, <5% override rate |

**Use case:** AMLR Gap Analysis module
- Starts in Observer (ANTON suggests "You should review Article 8, 13, 18")
- After 10 gap analyses → Guided (ANTON drafts gap matrix, human reviews)
- After 25 successful → Supervised (ANTON produces full report, human spot-checks)
- After 50 successful → Autonomous (ANTON trusted to produce final output)

---

#### GROUP 10: Time Intelligence (4 tables)

| Table | Purpose |
|-------|---------|
| `deadlines` | Regulatory deadlines and project milestones |
| `capacity_log` | Team capacity tracking (planned vs. actual hours) |
| `time_estimates` | Task duration estimates and accuracy tracking |
| `deadline_alerts` | Upcoming deadline notifications |

**Deadline types:** `regulatory`, `consultation`, `implementation`, `project`, `milestone`

**Smart estimates:** The system learns from completed work — "BWRA creation usually takes 8-12 hours" — and uses this to estimate effort for new tasks. Accuracy improves over time as more data accumulates.

---

#### GROUP 11: Regulatory Radar (5 tables)

| Table | Purpose |
|-------|---------|
| `radar_items` | Tracked regulations, consultations, guidelines |
| `radar_subscriptions` | User subscriptions (by jurisdiction, topic, keyword) |
| `regulatory_changes` | Detected changes in tracked items |
| `radar_alerts` | Alerts sent to users |
| `radar_actions` | Actions taken on radar items |

**Workflow:**
1. **User subscribes:** "Alert me to all EU AML regulations"
2. **Radar monitors:** EUR-Lex, EBA website, etc. (via web search + scheduled checks)
3. **Change detected:** AMLR RTS published
4. **Alert sent:** Email or in-app notification
5. **User action:** Create project, set deadline, run impact analysis

---

#### GROUP 12: Compliance-as-Code (4 tables)

| Table | Purpose |
|-------|---------|
| `compliance_rules` | Rule definitions (validation logic, thresholds) |
| `rule_violations` | Detected violations |
| `rule_history` | Rule change audit trail |
| `rule_exemptions` | Approved exemptions from rules |

**8 seeded rules** covering customer due diligence completeness, risk score thresholds, transaction monitoring documentation, sanctions screening timeliness, BWRA geographic coverage, policy version control, citation requirements, and dual approval for high-risk items.

**Violation workflow:**
1. Rule triggered → violation logged with severity and evidence
2. User notified → "⚠️ Compliance rule violated: Risk Score Threshold"
3. User action → fix and regenerate, or request exemption
4. Exemption → approved by admin with reason and expiry date

---

#### GROUP 13: Workflow Automation (4 tables)

| Table | Purpose |
|-------|---------|
| `workflow_definitions` | Workflow templates (trigger, steps, config) |
| `workflow_runs` | Execution instances |
| `workflow_steps` | Individual step execution and results |
| `workflow_schedules` | Scheduled workflow execution |

**12 step types:** LLM (execute module), Wait, Approval (human gate), Email, Webhook (external API), Extract, Transform, Conditional (branching), Parallel, Loop, Export, Review.

**Example workflow:** "Monthly Regulatory Update Report"
```json
{
  "trigger_type": "scheduled",
  "schedule": "0 9 1 * *",
  "steps": [
    { "type": "llm", "module_id": "regulatory-monitor",
      "inputs": { "query": "EU AML developments last 30 days" } },
    { "type": "export", "format": "pdf" },
    { "type": "email", "to": "compliance-team@company.com",
      "subject": "Monthly Regulatory Update", "attach_previous_output": true }
  ]
}
```

---

#### GROUP 14: Output Versioning (2 tables)

| Table | Purpose |
|-------|---------|
| `output_versions` | Every saved version of output |
| `version_diffs` | Computed diffs between versions |

Full version history with side-by-side diff viewer and revert capability. Diffs computed using standard algorithm, stored for fast retrieval.

---

#### GROUP 15: Collaborative Canvas (4 tables)

| Table | Purpose |
|-------|---------|
| `canvas_sessions` | Shared workspaces for collaboration |
| `canvas_participants` | Users in canvas with roles (owner, editor, reviewer, viewer) |
| `canvas_comments` | Comments, suggestions, approvals |
| `canvas_changes` | Audit trail of all changes |

**Canvas types:** `general`, `review`, `brainstorm`, `planning`

**Comment types:** `comment`, `suggestion`, `approval`, `rejection`, `question`

---

#### GROUP 16: Budget & Cost Management (3 tables)

| Table | Purpose |
|-------|---------|
| `budget_limits` | Per-user or per-team spending limits |
| `cost_tracking` | Every API call with token and cost details |
| `usage_alerts` | Budget threshold alerts |

**Alert workflow:** 80% threshold → warning alert → 100% → API calls blocked (configurable) → admin can increase limit or approve override.

---

### Performance Optimisations

**Indexes:** 120+ indexes covering every foreign key, common query patterns, composite columns for frequently joined tables, and timestamp columns for date-range queries.

**WAL Mode:** `PRAGMA journal_mode = WAL;` — concurrent reads while writing, faster commits, better crash recovery.

**Foreign Key Enforcement:** `PRAGMA foreign_keys = ON;` — referential integrity guaranteed, cascading deletes prevent orphaned records.

---

### Backup & Migration

**Backup is trivially simple:**
```bash
# File copy
cp data/workbench.sqlite data/backup_$(date +%Y%m%d).sqlite

# Or SQLite backup API
sqlite3 data/workbench.sqlite ".backup data/backup.sqlite"

# Automated daily backup (cron)
0 2 * * * sqlite3 /path/to/data/workbench.sqlite ".backup /path/to/backups/$(date +\%Y\%m\%d).sqlite"
```

**Restore:** `cp data/backup_20260220.sqlite data/workbench.sqlite`

**Migration to PostgreSQL (planned Q3 2026):** Schema designed for portability. Export schema, convert syntax (automated tool provided), export data, import to PostgreSQL, update `DB_TYPE=postgresql` in `.env`.

---

### Summary

ANTON's database is **comprehensive** (82 tables), **performant** (WAL mode, 120+ indexes), **maintainable** (SQLite simplicity), and **production-ready** (ACID guarantees, foreign key enforcement).

Every transformative feature has proper database backing. Nothing is ephemeral — all knowledge, patterns, quality scores, and decisions persist for long-term learning and compliance audit trails.

---
