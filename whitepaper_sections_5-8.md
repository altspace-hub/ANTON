## PART 2: CORE ARCHITECTURE

## 5. How It Works: The Seven-Layer Prompt Builder

The quality of AI output depends on the quality of the prompt. openEXPERT uses a **seven-layer prompt assembly system** that combines general AI capabilities with domain expertise, organizational context, and user preferences.

### Overview

Each layer adds specific knowledge or configuration:

1. **System Foundation** — Core behavioral principles
2. **Area Context** — Domain-specific background
3. **Module Expertise** — Specific task methodology
4. **Persona Injection** (optional) — Expert perspective
5. **Skills Attachment** (optional) — Reusable frameworks
6. **Knowledge Source Integration** — Reference material
7. **Transparency & Reasoning** — How AI thinks

---

### Layer 1: System Foundation

**Purpose:** Establish core behavioral principles for all modules

**Content:**
- Analytical rigor standards
- Professional tone guidelines
- Citation requirements
- Uncertainty acknowledgment protocols
- Output structure expectations

**Implementation:** `server/areas/system-foundation.md`

**Example:**
```markdown
You are ANTON, an AI expert assistant built into openEXPERT. You provide professional-grade analysis across 29 domains.

Core principles:
1. Accuracy over speed — verify before asserting
2. Cite regulatory sources with article numbers
3. Flag assumptions and limitations explicitly
4. Structure outputs for executive readability
5. Maintain professional tone unless user specifies otherwise
```

**Why it matters:** Ensures every module follows organizational quality standards.

---

### Layer 2: Area Context

**Purpose:** Provide domain-specific background for each expert area

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

**Why it matters:** AI needs to "speak the language" of the domain.

---

### Layer 3: Module Expertise

**Purpose:** Define the specific task, expected output structure, and quality criteria

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
Systematically compare an institution's current AML/CFT framework against EU AMLR 2024/1624 requirements, producing a scored gap matrix and prioritized action plan.

## Methodology
1. Extract regulatory requirements from AMLR
2. Map requirements to institution's current controls
3. Score each requirement: Compliant (Green), Partial (Yellow), Gap (Red)
4. Assess materiality and urgency
5. Prioritize remediation based on risk

## Output Structure
- Executive Summary (1-2 pages, board-ready)
- Gap Scoring Matrix (tabular, RAG-rated)
- Detailed Findings (per requirement with evidence)
- Prioritized Action Plan (who, what, when, effort)
```

**Why it matters:** This is the "expert training" that teaches AI how professionals actually perform the task.

---

### Layers 4-7: Configuration & Context

**Layer 4: Persona Injection** — Add specific expert perspective (optional)

**Layer 5: Skills Attachment** — Inject reusable frameworks/methodologies (optional)

**Layer 6: Knowledge Source Integration** — Provide reference documents (4 modes, see Section 6)

**Layer 7: Transparency & Reasoning** — Control thinking depth and creativity (see Section 5.7)

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

**Result:** AI has everything it needs to produce professional-grade output matching organizational standards.

---

## 6. Knowledge Source System (4 Modes)

This is Layer 6 of the prompt builder — where AI gets its reference material.

### Mode 1: Claude's Knowledge + Web Search

**What:** Claude's training data (up to early 2024) + optional real-time web search

**When to use:**
- General regulatory knowledge
- Latest publications (EBA consultations, FATF statements)
- Market research

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
- AI decides when to search based on query
- Results appear in streaming response
- Citations automatically included

**Cost:** ~500-2000 additional output tokens per search

---

### Mode 2: Online Reference Links

**What:** Server-side fetching of specific URLs (regulations, documents, web pages)

**When to use:**
- EUR-Lex regulation URLs
- Publicly accessible guidance documents
- Online knowledge bases

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
- Server fetches URL content
- Extracts text (HTML parsing for web pages, pdf-parse for PDFs)
- Appends to system prompt with source attribution
- Summary mode (5k tokens) vs. full text

**Limitations:** Cannot access authenticated content (Google Docs with login, corporate intranets)

---

### Mode 3: Local Folder Integration

**What:** Index local folders, extract text from all documents, include in context

**When to use:**
- Client engagement folders (policies, procedures)
- Downloaded regulations
- Historical analyses

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
1. Folder registration (saved to database)
2. Recursive scanning
3. Text extraction per file type (pdf-parse, mammoth, xlsx libraries)
4. Append to system prompt
5. Token counting with 180k limit enforcement

**Security:**
- Path traversal protection
- No folder access outside user-selected paths
- Extracted text not stored (on-demand only)

---

### Mode 4: Combined Mode

**What:** Local documents + Claude knowledge + web search simultaneously

**When to use:** Gap analyses (compare client docs against regulations)

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
- `local_first`: Ground in client docs, fill gaps with AI knowledge
- `claude_first`: Start from regulatory requirements, assess client docs
- `merged`: Treat all sources equally, cross-reference

---

### Token Management

**Challenge:** 180k token limit (Claude Opus 4.6)

**Solution:**
1. Real-time token counting during indexing
2. Warning at 150k (~83%)
3. Error at 180k (prevents API rejection)
4. User can deselect files or switch to summary mode
5. Auto-summarize large files if needed

**Display:** "Loaded: 87,450 tokens / 180,000 (48%)"

---

## 7. Multi-LLM Architecture

openEXPERT supports **four AI providers** with seamless switching.

### Supported Providers

#### 1. Anthropic Claude (Primary)

**Models:**
- `claude-opus-4-6` — Most capable, best for regulatory work
- `claude-sonnet-4-5-20250929` — Balanced cost/performance
- `claude-haiku-4-5-20251001` — Fast, cheap, simple tasks

**Features:**
- Adaptive thinking with `effort` parameter
- Native web search tool
- Prompt caching (90% cost reduction on repeated context)

**Cost (Feb 2026):**
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

#### 3. Mistral

**Models:**
- `mistral-large-2411`

**Features:**
- EU data residency (Mistral is EU-based)
- Seed parameter for reproducibility

**Cost:** ~$4/M input, ~$12/M output

---

#### 4. Local Ollama

**Models:** Any Ollama-compatible model (Llama, Mistral, Gemma, etc.)

**Features:**
- Runs locally (no API costs)
- Complete data privacy (nothing leaves network)
- Offline capability

**Requirements:** Ollama installed, GPU recommended (16+ GB VRAM)

---

### Provider-Agnostic Design

**Unified interface:** Same module configuration works across all providers

**Adapter layer:** Translates openEXPERT settings to provider-specific API parameters

**Example:**

| openEXPERT | Claude Opus 4.6 | GPT/Mistral |
|------------|-----------------|-------------|
| `thinking: "investigate"` | `effort: "max"` | 32,768 token budget |
| `creativity: "strict"` | Prompt: "Precise, factual..." | Prompt: "Precise, factual..." |

**Result:** User switches models without reconfiguring modules

---

### Cost Tracking

Every API call logged to `audit_log` with:
- Provider (anthropic, openai, mistral, ollama)
- Model
- Input/output/cached tokens
- Estimated cost (calculated server-side)

**Dashboard:** Monthly usage per provider, cost trends

---

### Prompt Caching (Claude Only)

**What:** Cache large, repeated system prompts to reduce costs ~90%

**How:**
- First request: Full input cost + cache creation (~25% of input)
- Subsequent requests (within 5 minutes): Cached sections billed at ~10%

**Savings example:**
- 80k regulation text in knowledge sources
- Without caching: 5 sessions = 400k tokens * $15/M = $6.00
- With caching: $1.20 + (4 * $0.12) = $1.68
- **72% cost reduction**

---

## 8. Database & Persistence

openEXPERT uses **SQLite** for local persistence. All data stays on your machine.

### Why SQLite?

✅ Local-first (no cloud database)
✅ Zero configuration
✅ ACID compliance
✅ Fast (in-process database)
✅ Portable (single file, easy backup)
✅ Cross-platform

---

### Schema Overview

**80+ tables** organized into functional groups:

#### Core Workflow & Execution (11)
- `sessions`, `messages`, `workflow_executions`, `workflow_outputs`, `checkpoint_decisions`, `versions`, `step_assignments`, `parallel_reviews`, `canvas_comments`, `audit_log`, `reviews`

#### Knowledge Foundation (15)
- `knowledge_atoms`, `knowledge_entity_refs`, `entity_nodes`, `entity_relationships`, `entity_merge_log`, `entity_aliases`, `knowledge_collections`, `rag_documents`, `rag_chunks`, `document_chunks`, `chunk_terms`, `indexed_folders`

#### Transformative Features (25+)
- Apprentice: `apprentice_profiles`, `apprentice_observations`
- Compliance: `compliance_rules`, `rule_executions`, `rule_violations`
- Quality: `quality_scores`, `quality_baselines`
- Time Intelligence: `deadlines`, `work_rhythms`
- Radar: `radar_sources`, `radar_items`
- Pattern Detection: `detected_patterns`, `pattern_detectors_state`
- Connections: `connections`, `scripts`, `connection_audit_log`
- Workflows: `workflow_schedules`

#### Authentication & Security (6)
- `users`, `user_sessions`, `user_monthly_usage`, `password_reset_tokens`, `login_attempts`, `security_events`

#### User Profiles (3)
- `user_profiles`, `session_toggles`, `app_settings`

#### Supplementary (6)
- `projects`, `skills`, `custom_modules`, `community_skills`, `brand_templates`

---

### Key Tables

#### `sessions`
Stores module configuration, timestamps, review status

#### `messages`
Conversation history with thinking content for audit trails

#### `audit_log`
Complete tracking: tokens, costs, provider, model, review status, seed (for reproducibility)

#### `knowledge_atoms`
Discrete knowledge units extracted from workflows (facts, insights, conclusions)

#### `entity_nodes`
Knowledge graph nodes (clients, regulations, controls, risks, people, systems)

#### `entity_relationships`
Knowledge graph edges with relationship types and strength scoring

#### `detected_patterns`
Cross-workflow patterns (temporal correlation, entity convergence, cascades, trends, gaps)

---

### Performance Optimizations

**Indexes:** All common queries indexed (session lookup, audit filtering, knowledge graph traversal)

**WAL Mode:** Enables concurrent reads while writing

**Foreign Keys:** Enforced referential integrity, cascading deletes

---

### Backup

**Manual:**
```bash
cp data/workbench.sqlite data/backup-$(date +%Y%m%d).sqlite
```

**Planned:** Daily automated backups with configurable retention

---

### Cloud Database Option (Future)

For enterprise multi-user (100+ users):

**PostgreSQL adapter** (same schema, different driver)

- Hosted (AWS RDS, Azure, Google Cloud) or on-premise
- Supports 1000+ concurrent users
- Built-in replication and backups

**Trade-off:** Requires server infrastructure, data no longer 100% local

---
