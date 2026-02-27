# openEXPERT / ANTON — Post-Anthropic-Cowork Improvements: Claude Code Implementation Brief

> **Audience:** Claude Code  
> **Purpose:** Full implementation guide for 20 improvements that strengthen ANTON's competitive position following Anthropic's Cowork enterprise plugin launch (Feb 24, 2026). Each improvement includes context, what exists today, what to build, where it fits, and exact implementation guidance.  
> **First step for Claude Code:** Read this document fully. Then explore the codebase to understand what already exists. Many of these improvements enhance or repackage existing features — do NOT duplicate. Extend what's there.  
> **Priority order:** Follow the Wave numbering (Wave 1 first, then Wave 2, etc.)  

---

## Context: Why This Matters

On February 24, 2026, Anthropic launched 10 Claude Cowork enterprise plugins (finance ×5, HR, engineering, ops, design, brand voice) with live data partnerships (FactSet, S&P Global, LSEG) and a private enterprise plugin marketplace. Their legal plugin from early February wiped ~$1 trillion from software stocks. They now have 300,000+ business customers and a $380B valuation.

**The strategic response:** Most of what we need already exists in ANTON. The gap is visibility, packaging, and messaging — plus a few genuinely new features. This document covers everything Claude Code needs to implement, in priority order.

**Key principle:** Every change must feel like it belongs in ANTON. Same design language, same quality standards, same integration with existing capabilities. Do not create parallel systems.

---

## WAVE 1: Launch-Critical (Implement First)

These are the highest-priority items. Most enhance or repackage existing features.

---

### 1.1 Trust Score — Rebrand Quality Scoring as the Centrepiece

**What exists today:**
- `quality_scores` table with multi-dimensional scoring
- `server/services/quality-ratchet.ts` — calculates structure, depth, actionability, citations, composite
- `QualityPage.tsx` — shows trends and baselines
- Quality scoring runs automatically on every output

**What to build:**

**A) Trust Score Badge on Every Output**

Find the session output display component (likely in `PromptPage.tsx` or the output rendering component). After every output, display a prominent Trust Score badge:

```
┌─────────────────────────────────────────────────┐
│ 🛡️ Trust Score: 8.5/10                          │
│                                                  │
│ ✅ Methodology: Applied — AMLR Gap Analysis      │
│ ✅ Expert Persona: MLRO with 15yr experience     │
│ ✅ Thinking Level: investigate (deepest)         │
│ ✅ Knowledge Sources: 3 regulatory references    │
│ ✅ Quality Check: Above baseline (7.2)           │
│ ⚠️ Citation Density: Moderate (could improve)   │
│                                                  │
│ [View Full Methodology Trail] [Export Trust Cert] │
└─────────────────────────────────────────────────┘
```

The badge should be collapsible (default: show score + key indicators, expand for full detail). Use existing quality scoring data — no new calculation needed, just new UI presentation.

**B) Trust Score Breakdown Component**

Create `src/components/TrustScoreBadge.tsx`:
- Props: `sessionId`, `qualityScore` object, `sessionConfig` (model, thinking, persona, skills, knowledge sources)
- Displays: composite score, individual dimension scores, which persona/skills/knowledge were used, thinking level, model used
- Collapsible with smooth animation
- Colour-coded: green (8+), amber (6-8), red (<6)

**C) Methodology Trail**

Create `src/components/MethodologyTrail.tsx`:
- Visual breadcrumb showing the seven-layer prompt assembly for this specific output:
  `System Foundation → Area Context (FCP) → Module Expertise (Gap Analysis) → Persona (MLRO) → Skills (Devil's Advocate, RBA) → Knowledge (3 docs) → Reasoning (investigate)`
- Each node is clickable to show what was injected at that layer
- Data source: reconstruct from session config + `prompt-builder.ts` logic

**D) Trust Certificate Export**

Add a new export option alongside existing MD/DOCX/XLSX/PDF/PPTX exports:
- "Export Trust Certificate" button in the export bar
- Generates a one-page PDF (use existing `export-pdf.ts` service) containing:
  - Output title and date
  - Trust Score with breakdown
  - Methodology trail
  - Expert persona and skills used
  - Knowledge sources consulted
  - Quality checks passed/failed
  - Compliance rules evaluated
  - Human checkpoints (if in a workflow)
- This PDF is designed to be attached alongside any deliverable to demonstrate process rigour

**Integration points:**
- `src/pages/PromptPage.tsx` — add TrustScoreBadge after output display
- `src/components/ExportBar.tsx` (or equivalent) — add Trust Certificate export option
- `server/services/export-pdf.ts` — add trust certificate template
- `server/services/quality-ratchet.ts` — ensure scoring data is easily retrievable per session

---

### 1.2 Competitive Positioning — "ANTON vs. The World" Page

**What exists today:** Nothing — this is a new page.

**What to build:**

Create `src/pages/ComparisonPage.tsx` — accessible from the Help/About section or Settings:

Content (hardcoded for now, can be made dynamic later):

**ANTON vs Claude Cowork:**
- Task execution vs professional methodology
- Single model vs 5 providers
- Cloud-dependent vs local-first
- No governance vs full audit trail
- Enterprise pricing vs open source + API costs

**ANTON vs ChatGPT/Copilot:**
- General AI vs 238 trained modules
- No domain expertise vs seven-layer prompt architecture
- No quality scoring vs Trust Score on every output
- No workflow governance vs checkpoint decisions

**ANTON vs Harvey:**
- Legal-only vs 29 professional domains
- Closed source vs MIT open source
- Subscription vs API costs only
- Cloud vs local-first

**ANTON vs Cursor/Coding Tools:**
- Code generation only vs full professional delivery
- No governance vs expert panel review
- No domain context vs 29 areas of expertise

**Format:** Clean comparison cards with "What they do" / "What ANTON does" / "Why it matters" sections. Use the existing design system — consistent with the rest of the platform.

**Add navigation:** Add a link in the sidebar or help menu: "How ANTON Compares" or "Why openEXPERT?"

---

### 1.3 Data Sovereignty Messaging — Visible Throughout the Platform

**What exists today:**
- Local-first architecture is real and working
- Whitepaper documents it
- No in-app visibility of this advantage

**What to build:**

**A) Data Sovereignty Indicator**

Add a small persistent indicator in the app header or footer:
```
🔒 Your data stays on your machine | Running locally
```
Or, if using an API:
```
🔒 Local storage | API calls to: Anthropic Claude (encrypted)
```

This should read from the current LLM configuration to show which provider data is being sent to (or "Fully offline — Ollama" if using local models).

**Implementation:** A small component in the app layout (`src/components/Layout.tsx` or equivalent) that reads from the settings/config to determine current LLM provider and displays accordingly.

**B) Privacy Dashboard Widget**

On the main dashboard or settings page, add a "Data & Privacy" card:
- Where your data is stored: `~/openexpert/data/openexpert.db` (local SQLite)
- Current LLM provider and what data leaves your machine
- Link to each provider's privacy policy
- "For maximum privacy: switch to Ollama (fully offline)" call-to-action

---

### 1.4 Guide Me as Hero Experience

**What exists today:**
- `src/pages/GuideMePage.tsx` — 3-step wizard: "What do you need?" → Output type → Your role
- `src/pages/BriefMePage.tsx` — zero-config, type question → ANTON picks module
- Both functional

**What to build:**

**A) Industry-Specific Entry Paths**

Enhance the Guide Me wizard's first step with role-based quick paths:

```
What brings you here today?

[Banking & Finance]  [Legal & Compliance]  [Consulting]
[HR & People]        [Audit & Assurance]   [Technology]
[Strategy & Ops]     [Startups]            [Other →]
```

Clicking "Banking & Finance" → shows the most relevant modules for that sector with brief descriptions. This is a filter/shortcut, not a new system — it filters the existing 238 modules by area tags.

**B) "Suggested Next Steps" on Every Output**

After every output, ANTON should suggest 2-3 follow-up actions:

```
📋 Suggested next steps:
  1. "Run a detailed policy gap assessment" → [Open Module: Policy Review]
  2. "Create an executive summary for the board" → [Open Module: Board Report]  
  3. "Build a remediation action plan" → [Open Module: Action Plan Builder]
```

**Implementation:** This requires a mapping of module → logical next modules. Create a `module-suggestions.ts` service that, given a completed module ID and its area, returns 2-3 recommended follow-up modules. This can be:
- A hardcoded mapping for the most common professional workflows (start with FCP, Legal, Audit areas)
- A simple rule engine: "If module is in area X and type is 'analysis', suggest area X modules of type 'plan' or 'report'"
- Displayed as a component at the bottom of the output area

**C) "What Can ANTON Do For Me?" Interactive Tour**

Create `src/components/OnboardingTour.tsx`:
- Triggered on first login or via help menu
- 4-5 step walkthrough:
  1. "ANTON covers 29 professional domains with 238 expert modules"
  2. "Every output comes with a Trust Score" 
  3. "Choose your thinking depth: from quick answers to deep investigations"
  4. "Use any AI model — Claude, GPT, Mistral, or run fully offline"
  5. "Your data never leaves your machine"
- Each step highlights the relevant UI element
- Skip button always visible

---

### 1.5 Governance Dashboard — Package Existing Features

**What exists today:**
- `CompliancePage.tsx` — compliance rules and violations
- `QualityPage.tsx` — quality scores and trends
- `IntelligenceDashboard.tsx` — institutional memory, patterns
- `VersionHistoryPage.tsx` — version tracking
- Audit log table with all actions
- All these exist as separate pages

**What to build:**

Create `src/pages/GovernanceDashboard.tsx` — a unified view that pulls from all existing governance features:

```
┌─────────────────────────────────────────────────────────┐
│ 🏛️ Governance Dashboard                                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ This Month's Activity                                    │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│ │ 47       │ │ 8.2      │ │ 3        │ │ 12       │   │
│ │ Outputs  │ │ Avg Trust│ │ Violations│ │Checkpoints│   │
│ │ produced │ │ Score    │ │ resolved │ │ approved │   │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│                                                          │
│ Quality Trend (last 30 days)          [chart]           │
│                                                          │
│ Recent Compliance Activity                               │
│  • CITATION_REQ_001: 2 violations this week (resolved)  │
│  • OUTPUT_QUALITY_001: All outputs passed               │
│  • REVIEW_CYCLE_001: 1 critical output pending review   │
│                                                          │
│ Institutional Memory                                     │
│  • 156 checkpoint decisions recorded                     │
│  • 89% human-AI agreement rate                          │
│  • Top override reason: "Additional context available"  │
│                                                          │
│ [Export Governance Report]                               │
└─────────────────────────────────────────────────────────┘
```

**Implementation:**
- This page aggregates data from existing API routes: `/api/quality/*`, `/api/compliance/*`, `/api/memory/*`, `/api/audit/*`
- No new backend needed — just a new frontend page that calls existing endpoints
- Add "Export Governance Report" that generates a PDF summarising all the above for a given period
- Add to sidebar navigation under a "Governance" section (alongside or replacing individual pages, or as a parent with individual pages as sub-routes)

---

### 1.6 Thinking Transparency — Make the Glass Box Visible

**What exists today:**
- Seven-layer prompt builder (`server/services/prompt-builder.ts`)
- Thinking levels (quick, think, think_hard, investigate)
- Streaming responses with thinking display
- Layer 7: Transparency & Reasoning

**What to build:**

**A) "How ANTON Thought" Collapsible Section**

After each output (below the Trust Score badge), add a collapsible section:

```
🔍 How ANTON reached this conclusion (click to expand)
├── Area Context: Financial Crime Prevention
├── Module: AMLR Gap Analysis (methodology: article-by-article mapping)
├── Expert Persona: Senior MLRO (15 years experience, Nordic banking)
├── Skills Applied: Risk-Based Approach, Devil's Advocate
├── Knowledge Sources: AMLR 2024/1624, EBA RTS on CDD, Client Policy Doc
├── Thinking Level: investigate (deepest analysis, ~$2.50)
└── Model: Claude Opus 4.6
```

**Implementation:** Create `src/components/ThinkingTransparency.tsx`. Data is available from the session configuration — the prompt builder already assembles all seven layers. We just need to expose what was used in a readable format.

**B) "Want ANTON to Go Deeper?" Upgrade Prompt**

If an output was generated at `think` or `think_hard` level, show:
```
💡 This was generated at "think_hard" depth. 
   Want a deeper investigation? [Regenerate at "investigate" level — est. $2.50]
```

This is a simple UI element that, on click, re-runs the same session with upgraded thinking level and preserves the original as a version for comparison.

---

## WAVE 2: First Month Post-Launch

---

### 2.1 Multi-LLM Intelligent Auto-Routing

**What exists today:**
- `server/services/unified-llm-client.ts` + `model-adapter.ts` — full multi-LLM support
- Users manually select model per session
- Cost tracking per provider exists

**What to build:**

**A) Smart Model Routing Service**

Create `server/services/model-router.ts`:

```typescript
interface ModelRecommendation {
  recommended: string;      // e.g., "claude-opus-4-6"
  reason: string;           // "Board-level report requires deepest analysis"
  alternatives: Array<{
    model: string;
    estimatedCost: number;
    qualityEstimate: number; // based on historical module performance
    reason: string;
  }>;
}

function recommendModel(moduleId: string, thinkingLevel: string, outputFormat: string): ModelRecommendation
```

Logic:
- Board reports, regulatory submissions, complex analysis → Opus (highest quality)
- Standard analysis, drafts, internal documents → Sonnet (good balance)
- Quick questions, summaries, translations → Haiku (fast + cheap)
- If user has set budget constraints → factor in cost
- If historical quality data exists for this module+model combination → use it

**B) Auto-Route Toggle in UI**

In the model selector dropdown on `PromptPage.tsx`, add an option:
```
[✨ Auto (ANTON picks best model)]
[Claude Opus 4.6]
[Claude Sonnet 4.5]
[Claude Haiku 4.5]
[GPT-4]
[Mistral Large]
[Ollama (local)]
```

When "Auto" is selected, show: "ANTON recommends: Opus for this module (board report requires deep analysis) — Est. cost: $2.50"

**C) Cost Comparison Widget**

After output generation, show:
```
💰 This output: $1.85 (Opus) | Same output with Sonnet: ~$0.40 | Ollama: $0.00
```

This uses existing cost tracking data. Just display it more prominently.

---

### 2.2 Professional Skill Packs (Extends Existing Module System)

**What exists today:**
- 238 modules across 29 areas
- `.anton` bundle export/import via `anton-bundler.ts`
- Skills library with 50+ pre-built skills
- Persona library with expert personas per area

**What to build:**

**A) Skill Pack Definition**

A Skill Pack is a curated bundle containing:
- Selected modules from one or more areas
- Recommended workflow template connecting those modules
- Persona configurations optimized for the pack's use case
- Skills pre-attached to each module
- Quality baselines specific to the pack
- A "Getting Started" guide

**Data model:** Add a `skill_packs` table:
```sql
CREATE TABLE skill_packs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  target_role TEXT,           -- "MLRO", "Startup CFO", "HR Business Partner"
  target_industry TEXT,       -- "Banking", "Startups", "General"
  modules JSON NOT NULL,      -- array of module IDs included
  workflow_template JSON,     -- optional default workflow connecting the modules
  persona_configs JSON,       -- persona overrides for this pack
  skills_attached JSON,       -- skills pre-attached to each module
  quality_baselines JSON,     -- recommended quality thresholds
  getting_started TEXT,       -- markdown guide
  is_default BOOLEAN DEFAULT 0,  -- shipped with platform
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

**B) Create 5 Default Skill Packs**

Ship these with the platform:

1. **MLRO / Compliance Officer Pack** (Areas 1, 2, 6)
   - Modules: AML Risk Assessment, Gap Analysis, Policy Drafter, STR Template, Board Reporting, Regulatory Change Scanner
   - Workflow: Risk Assessment → Gap Analysis → Remediation Plan → Board Report
   - Persona: Senior MLRO

2. **Startup Founder Pack** (Areas 4, 5, 12, 16, 19)
   - Modules: Business Plan, Financial Model, Investor Deck, Market Analysis, Cap Table, Cash Flow Forecast
   - Workflow: Market Analysis → Business Plan → Financial Model → Investor Deck
   - Persona: Serial Entrepreneur + CFO

3. **HR Business Partner Pack** (Areas 14, 4)
   - Modules: Job Description, Performance Review, Onboarding Plan, Policy Drafter, Compensation Analysis, Training Plan
   - Workflow: Job Description → Onboarding Plan → Training Plan → Performance Review
   - Persona: Senior HR Director

4. **Audit Engagement Pack** (Areas 3, 1, 2)
   - Modules: Audit Planning, Risk Assessment, Control Testing, Finding Report, Management Letter, Follow-Up Tracker
   - Workflow: Planning → Risk Assessment → Testing → Findings → Management Letter
   - Persona: Senior Internal Auditor

5. **Project Delivery Pack** (Areas 11, 12, 13)
   - Modules: Project Charter, Stakeholder Analysis, Risk Register, Status Report, Steering Committee Deck, Lessons Learned
   - Workflow: Charter → Stakeholder Analysis → Risk Register → Status Reports (recurring)
   - Persona: Senior PM

**C) Skill Pack Browser UI**

Create `src/pages/SkillPacksPage.tsx`:
- Grid view of available packs with icons, descriptions, module counts
- Click to view pack details: included modules, workflow template, getting started guide
- "Activate Pack" button — sets up the modules, workflow, and personas in the user's workspace
- "Export Pack" / "Import Pack" using existing `.anton` bundler

**D) Skill Pack in Guide Me**

After the user selects their industry in the enhanced Guide Me (1.4A), offer relevant packs:
```
Based on your role in Banking & Compliance, here's a recommended pack:

🎯 MLRO / Compliance Officer Pack
   6 modules • Pre-built workflow • Optimized for regulatory work
   [Activate Pack] [Browse All Packs]
```

---

### 2.3 Cross-Module Context Persistence (Project Intelligence)

**What exists today:**
- `projects` table — project storage
- Sessions are linked to projects
- Institutional memory captures decisions
- No automatic context carrying between modules within a project

**What to build:**

**A) Project Context Injection**

When a user starts a new session within a project, automatically inject context from previous project sessions:

In `server/services/prompt-builder.ts`, add a new context injection step:
- Before Layer 2 (Area Context), check if session belongs to a project
- If yes, fetch the last 3-5 session summaries from that project
- Inject as additional context: "Previous work in this project: [Gap Analysis completed Feb 20 — identified 12 gaps, top 3 are X, Y, Z] [Policy Draft started Feb 22 — addresses gaps 1, 3, 5]"
- This should be a brief summary, not full outputs — use first ~200 words of each previous output

**B) "Continue from Previous" Button**

On `PromptPage.tsx`, when working within a project, show:
```
📎 Project Context: AMLR Implementation
   Previous outputs: Gap Analysis (8.5), Policy Draft (7.9)
   [Use previous outputs as context for this session]
```

Clicking this adds the previous outputs as knowledge source context (Mode 1: Direct Text — use existing knowledge source system).

**C) Project Intelligence Dashboard Widget**

On the project page, add a summary widget:
```
Project: AMLR Implementation
├── 5 outputs produced (avg Trust Score: 8.2)
├── Modules used: Gap Analysis, Policy Draft, Risk Assessment
├── Suggested next: Board Report, Training Plan, Control Testing
├── Timeline: 3 deadlines tracked, nearest: March 15
└── [View Full Project Trail]
```

This widget pulls from existing session data, quality scores, and deadline tables.

---

### 2.4 Output Chain Workflows — Analysis → Presentation → Action Plan

**What exists today:**
- Workflow engine with 12 step types
- Export to DOCX, XLSX, PDF, PPTX
- Each step can chain module outputs

**What to build:**

**A) Pre-Built Output Chain Templates**

Create workflow templates that chain modules with automatic output forwarding:

**Chain 1: Analysis → Board Report**
- Step 1: Run analysis module (any area) → produces detailed output
- Step 2: Auto-summarize for executive audience (using strategy/comms module) → produces 2-page summary
- Step 3: Generate PPTX presentation from summary → produces slide deck
- Human checkpoint between each step

**Chain 2: Gap Analysis → Remediation → Tracking**
- Step 1: Gap Analysis module → identifies gaps
- Step 2: Remediation Plan module (receives gaps as input) → produces action plan
- Step 3: Create tracking spreadsheet (XLSX export) → produces tracker with owners and deadlines

**Chain 3: Research → Draft → Review → Publish**
- Step 1: Research/analysis module → produces findings
- Step 2: Document drafting module (receives findings) → produces draft
- Step 3: Expert panel review (Review Engine) → produces review feedback
- Step 4: Revision (re-run draft module with review feedback) → produces final

**Implementation:** These are workflow templates stored in the `workflow_schedules` or a new `workflow_templates` table. Each template pre-configures the workflow builder with the right step types, module selections, and output forwarding rules.

**B) One-Click Chain Actions on Outputs**

After any output, show quick actions:
```
⚡ Quick Actions:
  [📊 Create Presentation] [📋 Create Executive Summary] [📝 Create Action Plan]
```

Each button creates a new session with:
- The current output as knowledge source context
- The appropriate module pre-selected
- The appropriate persona and thinking level pre-set

---

### 2.5 Expert Panel Expansion — Domain-Specific Review Perspectives

**What exists today:**
- `ReviewEnginePage.tsx` with 5 review modes: Devil's Advocate, Systems Thinking, Pragmatist, Optimist, Technical
- Review orchestrator service

**What to build:**

Add domain-specific review perspectives alongside the existing 5:

```typescript
const DOMAIN_REVIEWERS = [
  {
    id: 'regulator',
    name: "Regulator's Eye",
    prompt: "Review this output as if you are a financial supervisor at Finansinspektionen or the EBA. Would this pass regulatory scrutiny? What would you ask follow-up questions about? What's missing from a supervisory perspective?",
    icon: '🏛️',
    applicableAreas: [1, 2, 5, 6, 10] // FCP, Legal, Banking, Risk, Investment
  },
  {
    id: 'board_member',
    name: "Board Member",
    prompt: "Review this as a non-executive board member. Is this clear enough for board-level decision making? Are the strategic implications articulated? What questions would the board ask?",
    icon: '👔',
    applicableAreas: 'all'
  },
  {
    id: 'auditor',
    name: "Internal Auditor",
    prompt: "Review this from an audit perspective. Is the evidence trail sufficient? Are controls adequately documented? Would this survive an audit finding?",
    icon: '🔍',
    applicableAreas: [1, 2, 3, 6, 17] // FCP, Legal, Audit, Risk, Compliance-as-Code
  },
  {
    id: 'client',
    name: "Client Perspective",
    prompt: "Review this as if you are the client receiving this deliverable. Is the value clear? Would you feel this was worth the investment? What would you push back on?",
    icon: '🤝',
    applicableAreas: [4, 11, 12] // Consulting, PM, Strategy
  }
];
```

**Implementation:**
- Extend the review engine's mode selection to include domain reviewers
- Show domain reviewers contextually based on the current area (use `applicableAreas`)
- Display results alongside existing review modes: "Regulator's Eye flagged 2 potential supervisory concerns"

---

### 2.6 Audience Adaptation — "Explain This To My [Stakeholder]"

**What exists today:**
- Persona system with expert personas
- Output format selector (20 formats)
- No one-click audience adaptation

**What to build:**

**A) Audience Adapter Service**

Create `server/services/audience-adapter.ts`:

```typescript
interface AudienceProfile {
  id: string;
  name: string;
  description: string;
  tone: string;
  maxLength: string;
  emphasis: string[];
  format: string;
  systemPrompt: string;
}

const AUDIENCES: AudienceProfile[] = [
  {
    id: 'board',
    name: 'Board / C-Suite',
    description: 'Strategic overview, business impact, resource requirements',
    tone: 'executive, concise, decision-focused',
    maxLength: '2 pages maximum',
    emphasis: ['strategic implications', 'financial impact', 'risk level', 'recommendation'],
    format: 'executive_summary',
    systemPrompt: 'Rewrite this analysis for a board of directors. Focus on strategic implications, financial impact, and clear recommendations. Maximum 2 pages. Use executive language. Remove technical jargon. Lead with the conclusion.'
  },
  {
    id: 'regulator',
    name: 'Regulator / Supervisor',
    description: 'Full technical compliance, article references, evidence trail',
    tone: 'formal, precise, evidence-based',
    maxLength: 'no limit — completeness over brevity',
    emphasis: ['regulatory references', 'compliance evidence', 'methodology', 'control framework'],
    format: 'regulatory_report',
    systemPrompt: 'Rewrite this analysis for a regulatory supervisor. Include specific article references, evidence of compliance methodology, and a structured approach that demonstrates regulatory awareness. Be precise and formal.'
  },
  {
    id: 'team',
    name: 'Project Team',
    description: 'Action items, owners, deadlines, dependencies',
    tone: 'practical, clear, action-oriented',
    maxLength: '1-3 pages with action table',
    emphasis: ['action items', 'responsibilities', 'timelines', 'dependencies'],
    format: 'action_plan',
    systemPrompt: 'Rewrite this analysis as an action plan for the project team. Convert findings into specific action items with suggested owners, priority levels, and timelines. Include a dependency map if relevant.'
  },
  {
    id: 'client',
    name: 'External Client',
    description: 'Professional deliverable with methodology notes',
    tone: 'professional, authoritative, client-facing',
    maxLength: 'appropriate to scope',
    emphasis: ['findings', 'recommendations', 'methodology', 'next steps'],
    format: 'client_deliverable',
    systemPrompt: 'Rewrite this analysis as a professional client deliverable. Include methodology notes, clear findings, prioritized recommendations, and proposed next steps. Maintain a consulting-firm quality standard.'
  }
];
```

**B) Audience Buttons on Every Output**

After every output, show:
```
🎯 Adapt for audience:
  [Board] [Regulator] [Project Team] [Client]
```

Clicking triggers a new LLM call using the audience's system prompt, with the original output as input. The result is saved as a new version (using existing versioning system) tagged with the audience.

**C) Implementation:**
- Add audience buttons to the output display area
- On click: call existing LLM service with the audience's system prompt + original output as context
- Save result as new version with tag `audience: board` (or whatever)
- Display alongside original with tab switching: "Original | Board Version | Team Version"

---

## WAVE 3: Months 2-3 Post-Launch

---

### 3.1 Community Marketplace MVP (Secure, Export/Import Based)

**What exists today:**
- `.anton` bundle format via `anton-bundler.ts`
- `antonImport.ts` / `antonExport.ts` — import/export services
- `custom_modules` and `community_skills` database tables
- No marketplace UI or external connection

**IMPORTANT SECURITY NOTE FROM DANIEL:**
Cybersecurity-conscious users will be wary of direct marketplace connections that can push modules or workflows into their system. The marketplace must be **export/import based** — users download `.anton` files from the website, then manually import them. No auto-install, no background downloads, no direct connection from ANTON to the marketplace.

**What to build:**

**A) Marketplace Placeholder in UI**

Create `src/pages/MarketplacePage.tsx`:

```
┌─────────────────────────────────────────────────────────┐
│ 🏪 ANTON Community Marketplace                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ Browse and share modules, skills, and workflows          │
│ created by the openEXPERT community.                    │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │  🌐 Visit Marketplace                               │ │
│ │                                                      │ │
│ │  Browse community modules, skill packs, and          │ │
│ │  workflow templates at:                              │ │
│ │                                                      │ │
│ │  🔗 www.futurechain.solutions                       │ │
│ │                                                      │ │
│ │  Download .anton files from the marketplace,         │ │
│ │  then import them below.                             │ │
│ │                                                      │ │
│ │  [Open Marketplace ↗]                                │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ ─── Import ──────────────────────────────────────────── │
│                                                          │
│ [📥 Import .anton File]                                  │
│                                                          │
│ Drop an .anton file here or click to browse.             │
│ ANTON will validate the package and show you             │
│ exactly what's included before installing.               │
│                                                          │
│ ─── Export & Share ─────────────────────────────────── │
│                                                          │
│ Share your modules with the community:                   │
│                                                          │
│ [📤 Export Module]  [📤 Export Skill Pack]               │
│ [📤 Export Workflow] [📤 Export Skill]                   │
│                                                          │
│ Export creates an .anton file you can upload to          │
│ the marketplace at www.futurechain.solutions             │
│                                                          │
│ ─── Recently Imported ────────────────────────────────  │
│                                                          │
│ • AMLR Compliance Pack v1.2 (imported Feb 20)           │
│ • GDPR Data Mapping Module (imported Feb 18)            │
│ • Investor Due Diligence Workflow (imported Feb 15)     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**B) Import Validation & Preview**

When a user imports an `.anton` file, show a detailed preview before installing:

```
📦 Package: AMLR Compliance Pack v1.2
   Author: Advisense Nordic
   
   Contents:
   ├── 6 modules (Gap Analysis, Policy Draft, Risk Assessment, ...)
   ├── 1 workflow template (Gap → Remediation → Report)
   ├── 2 skills (RBA Framework, Article Mapping)
   └── 1 persona (Senior MLRO, Nordic banking)
   
   ⚠️ This will NOT overwrite existing modules.
   ⚠️ No code execution — modules contain prompts only.
   ⚠️ Review contents before activating.
   
   [Preview Module Details] [Import] [Cancel]
```

This uses existing `anton-importer.ts` — just add a preview step before the actual import.

**C) Export Enhancement**

Ensure export includes:
- Package metadata (name, version, author, description, tags)
- Module count and descriptions
- Compatibility info (min platform version)
- SHA256 hash for integrity verification

**D) Navigation**

Add "Marketplace" to the sidebar navigation, positioned near the bottom or in a "Community" section.

---

### 3.2 Proactive Task Suggestion Engine — "ANTON Suggests"

**What exists today:**
- Institutional memory with checkpoint decisions
- Regulatory radar with deadline tracking
- Quality scores with trends
- Pattern detection engine
- All the data needed — just no proactive suggestion layer

**What to build:**

**A) Suggestion Engine Service**

Create `server/services/suggestion-engine.ts`:

Analyses:
1. **Recent outputs** — what modules were used, what areas are active
2. **Quality trends** — any declining scores that suggest re-work needed
3. **Deadline proximity** — upcoming deadlines from `deadlines` table
4. **Radar alerts** — new regulatory items that match user's subscription
5. **Workflow gaps** — incomplete workflows that have pending steps
6. **Module suggestions** — based on completed module → logical next module mapping (from 2.4)

Returns: array of `Suggestion` objects with priority, title, description, action (link to module/workflow/deadline)

**B) Dashboard Widget**

Create `src/components/SuggestionWidget.tsx`:

```
💡 ANTON Suggests (3 items)

🔴 Deadline approaching: EBA consultation response due March 15
   You started a draft 2 weeks ago (Trust Score: 7.2)
   → [Review and finalize draft]

🟠 New regulatory alert: AMLA published RTS on data reporting
   Matched your subscription: "AMLA", "data quality"
   → [Analyse impact with Regulatory Change Scanner]

🟡 Quality improvement: Your CDD Policy draft scored 6.8
   Below your baseline of 7.5 for this module type
   → [Regenerate with deeper thinking level]
```

**C) Integration:** Add widget to the main dashboard (`src/pages/Dashboard.tsx` or equivalent). Run suggestion engine on dashboard load (lightweight queries, no heavy computation).

---

### 3.3 Benchmark Feature — "Compare to Professional Standard"

**What exists today:**
- Quality scoring with baselines per module
- No explicit "what does good look like" reference

**What to build:**

After quality scoring, add a benchmark comparison:

```
📊 Benchmark: How does this compare?

Your output: 8.2/10
├── Structure: 8.5 (✅ Above standard — includes all 12 standard components)
├── Depth: 7.8 (⚠️ Missing: risk quantification, timeline prioritization)  
├── Actionability: 8.0 (✅ Clear recommendations with owners)
├── Citations: 8.5 (✅ 14 regulatory references, properly formatted)
└── Completeness: 8.0 (⚠️ 10 of 12 standard components covered)

Missing components:
  • Resource estimation — [Add with one click]
  • Risk quantification matrix — [Add with one click]
```

**Implementation:**
- Create `server/services/benchmark.ts` that defines "standard components" per module type
- For FCP Gap Analysis: standard components = [executive summary, methodology, regulatory scope, gap inventory, risk rating, remediation priorities, timeline, resource estimate, governance structure, appendices, regulatory references, version history]
- Check output against component list using simple keyword/pattern matching
- Display gaps with one-click actions to add missing components (re-run with specific instructions)

---

## WAVE 4: Months 3-6 Post-Launch

---

### 4.1 ANTON as MCP Server

**What to build:** Expose ANTON's domain expertise as an MCP server that external tools (Cursor, Claude Code, VS Code, Cowork) can connect to.

**Endpoints to expose:**
- `run_module(area, module, input)` — execute any of 238 modules
- `review_output(content, review_modes)` — run expert panel review on external content
- `score_quality(content, module_type)` — get Trust Score for any content
- `suggest_modules(description)` — recommend relevant modules for a task

**This is a Wave 4 item** — design the interface now, implement later. But it's strategically important because it positions ANTON as infrastructure, not just an application.

---

### 4.2 Enhanced Connector Ecosystem

**What to build:** Add pre-configured connector templates for the 10 most common tools used by compliance/consulting teams:

1. Slack (notifications on workflow completion)
2. Microsoft Teams (same)
3. SharePoint / Google Drive (document storage)
4. Jira / Asana (task creation from action plans)
5. EBA RSS feed (regulatory radar auto-import)
6. ESMA publications feed
7. FATF publications feed
8. EUR-Lex API (already partially implemented)
9. Email (SMTP — already implemented)
10. Webhook (generic — for custom integrations)

**Implementation:** These extend the existing `connection-manager.ts` with pre-configured adapter templates. The regulatory feeds (EBA, ESMA, FATF) are already partially in the radar system — formalize them as connectors.

---

## IMPLEMENTATION NOTES FOR CLAUDE CODE

### Before You Start

1. **Read the existing codebase thoroughly.** Key files to understand:
   - `server/services/prompt-builder.ts` — seven-layer prompt assembly
   - `server/services/quality-ratchet.ts` — quality scoring
   - `server/services/unified-llm-client.ts` + `model-adapter.ts` — multi-LLM
   - `server/services/institutional-memory.ts` — memory system
   - `server/services/workflow-engine.ts` — workflow execution
   - `server/services/anton-bundler.ts` — export/import
   - `src/pages/PromptPage.tsx` — main interaction page
   - `src/pages/Dashboard.tsx` (or equivalent) — main dashboard
   - Layout components — sidebar navigation, header

2. **Don't duplicate.** Most Wave 1 items are UI enhancements on existing backend services. Check if the API endpoint already exists before building a new one.

3. **Consistent design language.** Match existing component styling, color palette, spacing, typography. If the platform uses a specific UI library or design tokens, use them.

4. **Progressive implementation.** Build Wave 1 items first. Each should be a self-contained PR that works independently. Don't build Wave 2 dependencies into Wave 1 code.

5. **Test as you go.** Each new component should work with the existing backend. If the backend returns data, the component should display it. If the backend doesn't return data yet, use reasonable fallbacks/empty states.

### File Naming Convention

Follow existing patterns:
- Pages: `src/pages/{FeatureName}Page.tsx`
- Components: `src/components/{ComponentName}.tsx`
- Services: `server/services/{service-name}.ts`
- Routes: `server/routes/{route-name}.ts`

### Navigation Updates

Add to sidebar:
- "Governance" section (or icon) → GovernanceDashboard
- "Skill Packs" → SkillPacksPage
- "Marketplace" → MarketplacePage
- "How ANTON Compares" → ComparisonPage (in help/about section)

### Database Migrations

New tables needed:
- `skill_packs` (Wave 2.2)
- `workflow_templates` (Wave 2.4)
- `suggestions` (Wave 3.2) — optional, can be computed on-the-fly
- `benchmarks` (Wave 3.3) — module component definitions

Follow existing migration patterns in the codebase.

---

## SUMMARY: What Gets Built, In Order

| Wave | Item | Type | New Files |
|------|------|------|-----------|
| 1.1 | Trust Score Badge | UI component | `TrustScoreBadge.tsx`, `MethodologyTrail.tsx` |
| 1.2 | Comparison Page | New page | `ComparisonPage.tsx` |
| 1.3 | Data Sovereignty Indicator | UI component | `PrivacyIndicator.tsx` |
| 1.4 | Guide Me Enhancement | Page enhancement | Modify `GuideMePage.tsx`, `OnboardingTour.tsx`, `module-suggestions.ts` |
| 1.5 | Governance Dashboard | New page | `GovernanceDashboard.tsx` |
| 1.6 | Thinking Transparency | UI component | `ThinkingTransparency.tsx` |
| 2.1 | Model Auto-Routing | Service + UI | `model-router.ts`, modify model selector |
| 2.2 | Skill Packs | Full feature | `SkillPacksPage.tsx`, `skill_packs` table, seed data |
| 2.3 | Cross-Module Context | Service + UI | Modify `prompt-builder.ts`, project context widget |
| 2.4 | Output Chain Workflows | Templates + UI | `workflow_templates` table, chain action buttons |
| 2.5 | Expert Panel Expansion | Enhancement | Modify review engine with domain reviewers |
| 2.6 | Audience Adaptation | Service + UI | `audience-adapter.ts`, audience buttons |
| 3.1 | Marketplace MVP | New page | `MarketplacePage.tsx`, import preview enhancements |
| 3.2 | Proactive Suggestions | Service + widget | `suggestion-engine.ts`, `SuggestionWidget.tsx` |
| 3.3 | Benchmark Feature | Service + UI | `benchmark.ts`, benchmark display component |
| 4.1 | MCP Server | Backend | MCP server implementation (design only for now) |
| 4.2 | Connector Templates | Backend | Pre-configured connector adapter templates |

---

*Implementation brief for Claude Code — openEXPERT / ANTON*  
*Version 1.0 — February 25, 2026*  
*Author: Daniel Bardun, FutureChain AB*
