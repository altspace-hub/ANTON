# ANTON Discover Mode — Feature Specification
## Interaction Mode #8: AI-Guided Discovery & Use Case Identification

*Helping people find where AI creates value in their work — before they ever use a module.*

---

## 1. Why Discover Exists

openEXPERT has 240+ modules across 30 expert areas. That is its strength and, for new users, its challenge. A compliance officer knows they need help with investigations but might not know that ANTON has a SAR Narrative Generator, an Alert Triage Assistant, and a Risk Assessment Framework — and that these can be chained together in a workflow that saves 6 hours per week.

More importantly, many people don't yet know *what* they need AI for. They know their work is painful, slow, or frustrating. They know AI is supposed to help. But they haven't mapped the connection between "my problems" and "what AI can do."

Discover is the bridge. It guides users through structured discovery — understanding their work, identifying pain points, assessing readiness, and producing a concrete, personalized AI adoption plan with specific ANTON modules, workflows, and quick wins.

It is the interactive, AI-powered version of the Whitepaper Annex A workshop kit. Where the annex works with paper and pen in a conference room, Discover works inside ANTON with intelligent follow-up questions, real-time analysis, and immediate actionable recommendations.

**Discover is how openEXPERT demonstrates its own value.** The user uses ANTON to discover how to use ANTON. They experience expert-level structured questioning, intelligent analysis, and professional-grade output — which is exactly what every other module delivers too.

---

## 2. Position in the Platform

### Interaction Mode #8

Discover sits alongside the existing seven interaction modes:

| # | Mode | Purpose | Entry Question |
|---|------|---------|----------------|
| 1 | Standard Module | Deep work with specific module | "I know what I need" |
| 2 | Brief Me | Quick answers | "I have a question" |
| 3 | Guide Me | Module recommendation | "I'm not sure which module" |
| 4 | Batch Create | Volume processing | "I need to do this many times" |
| 5 | Workflow Builder | Multi-step automation | "I need a process" |
| 6 | Collaborative Canvas | Team work | "We need to work on this together" |
| 7 | Review Engine | Critical review | "Check and challenge this" |
| **8** | **Discover** | **Find AI opportunities** | **"Where should I start?"** |

### Relationship to Guide Me

Guide Me helps users who already have a task in mind but don't know which module to use. Discover helps users who don't yet know what tasks AI can help with. Guide Me answers "which module?"; Discover answers "which use cases?" and "where to start?" and "what's my roadmap?"

After completing a Discover session, users are naturally directed to Guide Me or directly to specific modules based on their discovered use cases.

### Navigation

Discover is a top-level navigation item in the sidebar, positioned prominently — above or alongside Brief Me and Guide Me. For new users (first login, no sessions yet), Discover is suggested as the recommended starting point.

**Sidebar position:**
```
📍 Discover          ← New, prominent placement
💬 Brief Me
🧭 Guide Me
📦 Batch Create
⚡ Workflow Builder
🎨 Canvas
🔍 Review Engine
─────────────────
📁 Areas (30)
   └── Modules (240)
```

---

## 3. Discovery Tiers

Discover adapts to the user's context and depth of need. Four tiers serve different audiences and time commitments:

### Tier 1: Discovery Lite
**Time:** 15-30 minutes
**For:** Individuals, solo entrepreneurs, curious first-time users
**Entry:** "I want to explore what AI can do for me"

**Flow:**
1. **Who are you?** (5 min) — Role, industry, organization size, experience with AI. If previous AI experience: "What worked? What didn't?"
2. **What AI can do** (3 min) — Brief, tailored orientation: ANTON explains AI strengths and limits relevant to their role. Calibrated to their experience level — skipped for advanced users.
3. **What fills your day?** (5 min) — Top 5-7 work activities with pain/importance ratings
4. **Where does it hurt?** (5 min) — Top 3 frustrations with specific examples
5. **Quick readiness check** (3 min) — 5 questions on tech, data, and openness
6. **Your AI starter map** (generated) — 3-5 specific module recommendations with reasoning, one suggested quick win, estimated time savings. Includes any non-AI findings ("This sounds like a process problem, not an AI problem — here's what I'd suggest instead").

**Output:** Personal AI Starter Map (1-2 page exportable document)

### Tier 2: Discovery Standard
**Time:** 1-2 hours
**For:** Teams, SMEs, departments starting AI adoption
**Entry:** "We want to find AI opportunities for our team"

**Flow:**
1. Everything from Lite, but deeper with more participants
2. **Workflow walk-through** (20 min) — Guided step-by-step mapping of 1-2 key processes, including the Thinking/Gathering/Formatting time split
3. **Pain quantification** (15 min) — Direct costs, opportunity costs, risk exposure
4. **Opportunity mapping** (15 min) — AI-assisted categorization and prioritization, explicitly separating AI solutions from non-AI findings
5. **Quick win identification** (10 min) — Immediately actionable opportunities with prerequisites identified

**Output:** Team AI Opportunity Report (5-8 page exportable document with priority matrix, use case cards, non-AI findings list, and 30-day action plan)

### Tier 3: Discovery Professional
**Time:** 3-4 hours (can be split across sessions)
**For:** Organizations planning systematic AI adoption
**Entry:** "We need an AI adoption strategy"

**Flow:**
1. Everything from Standard, plus:
2. **Strategic alignment** (15 min) — How does AI adoption connect to organizational priorities?
3. **Multi-process inventory** (30 min) — Map 5-10 key processes across functions
4. **Integration assessment** (20 min) — Systems landscape, data flows, API availability
5. **Governance framework** (20 min) — Compliance, security, policy requirements
6. **Organizational readiness** (15 min) — Skills, culture, leadership alignment, change management
7. **Phased roadmap generation** (AI-generated) — 30/60/90 day plan plus 6-12 month strategic view
8. **Business case builder** (AI-assisted) — ROI calculations for top use cases, including cost-of-inaction framing ("What happens to headcount, risk exposure, and competitive position if nothing changes?")
9. **Stakeholder communication** (AI-generated) — Executive briefing draft and internal communication plan

**Output:** AI Adoption Roadmap (15-25 page comprehensive document with executive summary, executive briefing, use case portfolio, non-AI prerequisite workstreams, phased implementation plan, business case, and governance framework)

### Tier 4: Discovery Expert
**Time:** Full day equivalent (multiple sessions)
**For:** Domain-specific deep dives (FCP, Legal, Healthcare, etc.)
**Entry:** "We need to transform [specific function] with AI"

**Flow:**
1. Everything from Professional, plus:
2. **Domain-specific deep dive** — Draws on area-specific assessment frameworks (the FCP assessment templates are examples of this tier)
3. **Workflow-by-workflow analysis** — Every process in the function mapped, scored, and prioritized
4. **Vendor/solution landscape** — AI-generated overview of relevant tools and approaches
5. **Detailed implementation plan** — Milestones, dependencies, resource requirements
6. **Success metrics framework** — KPIs, baselines, targets, measurement approach
7. **Change management plan** — Stakeholder engagement, training needs, resistance mitigation

**Output:** Function Transformation Plan (30-50+ page detailed document, equivalent to a consulting engagement deliverable, including board-ready executive briefing)

---

## 4. The Discovery Engine — How It Works

### 4.1 Conversation Architecture

Discovery is a **multi-turn guided conversation**, not a form. ANTON asks questions, listens to answers, and adapts follow-up questions based on what it learns. This is critical — the value is in the adaptive intelligence, not in walking through a static checklist.

**Conversation principles:**
- Start broad, go deep based on signals
- Ask one question at a time (avoid overwhelming)
- Reflect back what you hear ("So your biggest challenge is X — let me explore that further")
- Use plain language, not jargon
- Provide examples when asking for information ("For instance, a compliance officer might say 'I spend 2 hours per alert because I have to check 6 different systems'")
- Periodically summarize what you've learned before moving to the next section
- Let the user go off-script — if they want to talk about something specific, follow the thread

**Conversation state management:**

Discovery sessions maintain structured state across turns:

```typescript
interface DiscoveryState {
  tier: 'lite' | 'standard' | 'professional' | 'expert';
  phase: 'context' | 'work_mapping' | 'pain_finding' | 'readiness' | 'opportunity_mapping' | 'action_planning';
  
  // Accumulated understanding
  userProfile: {
    role: string;
    industry: string;
    organizationSize: string;
    aiExperience: 'none' | 'basic' | 'intermediate' | 'advanced';
    previousAiAttempts?: string;   // "We tried X and it failed because Y"
    jurisdiction?: string;
    regulatoryContext?: string[];
  };
  
  workActivities: WorkActivity[];
  painPoints: PainPoint[];
  readinessScores: ReadinessScores;
  workflows: WorkflowMap[];
  opportunities: Opportunity[];
  constraints: Constraint[];
  nonAiFindings: NonAiFinding[];  // Problems that need non-AI solutions
  
  // Discovery intelligence
  inferredNeeds: string[];          // What ANTON thinks based on pattern matching
  suggestedModules: ModuleMatch[];  // Matched modules with reasoning
  sectorContext: string;            // Inferred sector-specific considerations
  confidenceLevel: number;         // 0-1 how confident ANTON is in recommendations
  
  // Session management
  completedPhases: string[];
  currentPhaseProgress: number;     // 0-100%
  canGenerateOutput: boolean;       // Enough data for meaningful recommendations
  sessionId: string;
  startedAt: Date;
  lastActiveAt: Date;
  
  // Context window management
  phaseSummaries: PhaseSummary[];   // Progressive summaries for long sessions
  totalTokensUsed: number;
  contextStrategy: 'full' | 'summarized' | 'chunked';
  schemaVersion: number;            // State schema version for migration (default: 1)
}

// Complete sub-type definitions

interface WorkActivity {
  id: string;
  description: string;             // "Reviewing TM alerts and writing investigation notes"
  frequency: string;               // "~30 per day"
  duration: string;                // "2 hours each"
  importance: number;              // 1-5
  painLevel: number;               // 1-5
  systems?: string[];              // Systems involved
  peopleInvolved?: number;
  monthlyHours?: number;           // Calculated total
}

interface PainPoint {
  id: string;
  description: string;             // In the user's own words
  theme: PainTheme;
  impact: 'high' | 'medium' | 'low';
  frequency: 'daily' | 'weekly' | 'monthly' | 'occasional';
  affectedPeople: number;
  timeWastedPerWeek?: number;      // Hours
  annualCost?: number;             // EUR calculated
  opportunityCost?: string;        // Qualitative description
  riskExposure?: string;           // Qualitative description
  rootCause?: string;              // Why does this happen?
  relatedActivities: string[];     // Links to WorkActivity IDs
}

type PainTheme = 
  | 'data_hunting'
  | 'system_friction'
  | 'repetitive_work'
  | 'quality_uncertainty'
  | 'knowledge_gaps'
  | 'communication_burden'
  | 'waiting'
  | 'rework'
  | 'inconsistency'
  | 'other';

interface ReadinessScores {
  technology: number;              // 0-25
  peopleCulture: number;           // 0-25
  governance: number;              // 0-25
  leadership: number;              // 0-25
  total: number;                   // 0-100
  level: 'foundation' | 'developing' | 'prepared' | 'advanced';
  criticalGaps: string[];          // Specific low-scoring areas
}

interface WorkflowMap {
  id: string;
  name: string;
  steps: WorkflowStep[];
  totalTime: number;               // Minutes
  thinkingTime: number;            // Minutes — actual analysis
  gatheringTime: number;           // Minutes — finding/copying data
  formattingTime: number;          // Minutes — writing up results
  frequency: string;
  systemsAccessed: string[];
  painSteps: string[];             // Step IDs with highest pain
  automationPotential: 'high' | 'medium' | 'low';
}

interface WorkflowStep {
  id: string;
  order: number;
  description: string;
  system: string;
  timeMinutes: number;
  painLevel: number;               // 1-5
  failureMode?: string;            // "What can go wrong"
  workaround?: string;             // "What people actually do"
}

interface Opportunity {
  id: string;
  name: string;
  description: string;
  category: OpportunityCategory;
  relatedPainPoints: string[];     // PainPoint IDs
  relatedWorkflows: string[];      // WorkflowMap IDs
  effort: number;                  // 1-5
  impact: number;                  // 1-5
  priorityScore: number;           // Calculated
  quadrant: 'quick_win' | 'strategic' | 'nice_to_have' | 'consider_later';
  estimatedTimeSavings: string;
  estimatedValue: number;          // EUR/year
  matchedModules: ModuleMatch[];
  suggestedWorkflow?: string;      // Workflow builder template suggestion
  prerequisites?: string[];        // What needs to happen first
  isAiSolution: boolean;           // False = non-AI finding. Derivable from category
                                   // (true for genai_*, automation_*, traditional_ml;
                                   //  false for process_redesign, training, data_quality, organizational)
                                   // Stored explicitly for fast filtering in output generation
}

type OpportunityCategory = 
  | 'genai_text'
  | 'genai_data'
  | 'automation_rules'
  | 'automation_integration'
  | 'traditional_ml'
  | 'process_redesign'
  | 'training'
  | 'data_quality'
  | 'organizational';

interface NonAiFinding {
  id: string;
  description: string;
  realSolution: string;            // "Integration project", "Training program", etc.
  aiRole: string;                  // "AI can help after X is done"
  priority: 'high' | 'medium' | 'low';
  isPrerequisiteForAi: boolean;
}

interface Constraint {
  type: 'regulatory' | 'security' | 'budget' | 'organizational' | 'technical';
  description: string;
  impact: string;                  // How it affects recommendations
  mitigation?: string;
}

interface PhaseSummary {
  phase: string;
  summary: string;                 // Compressed representation for context management
  keyFindings: string[];
  tokenCount: number;
  createdAt: Date;
}
```

### 4.1.1 Context Window Management

Professional and Expert tier sessions can span multiple hours and generate substantial conversation history. The Discovery Engine uses a progressive summarization strategy to manage this:

**Strategy: Summarize-and-Carry-Forward**

After each phase completes, ANTON generates a structured summary of that phase's findings and stores it in `phaseSummaries`. For subsequent phases, only the summaries of completed phases are included in context — not the full conversation history. The current phase always has full conversation history available.

```
Phase 1 complete → Generate Phase 1 Summary (~500 tokens)
Phase 2 active  → Context = Phase 1 Summary + Full Phase 2 conversation
Phase 2 complete → Generate Phase 2 Summary (~500 tokens)
Phase 3 active  → Context = Phase 1 Summary + Phase 2 Summary + Full Phase 3 conversation
```

This keeps context window usage roughly constant regardless of total session length. For Expert tier sessions that may span multiple days, the full structured `DiscoveryState` object serves as the persistent context, with phase summaries providing the narrative thread.

**Key detail preservation:** Phase summaries risk losing critical nuance. To mitigate this, each PhaseSummary includes a `keyFindings` array that preserves verbatim user quotes and specific numbers that should survive summarization. Examples of details that must be preserved:
- Specific volume data: "20 alerts per day, 2 hours each"
- Named systems: "We use Actimize for TM and SAS for screening"
- Exact pain quotes: "I literally copy-paste between 8 browser tabs"
- Regulatory context: "We're subject to AMLR and expect AMLA oversight by 2028"
The summarization prompt explicitly instructs: "Preserve all specific numbers, system names, regulatory references, and direct user quotes in keyFindings. The summary should compress narrative, not data."

**Autosave:** Discovery state is saved to the database after every user response (debounced at 2 seconds). If the browser crashes or closes, the session resumes from the last saved state with a brief re-orientation: "Welcome back. We were discussing your workflow pain points. Here's what we've covered so far..."

**Token budget by tier:**
- Lite: ~15k tokens total (fits in single context)
- Standard: ~40k tokens (2-3 phase summarizations)
- Professional: ~80k tokens (full progressive summarization)
- Expert: ~150k+ tokens (progressive summarization + cross-session persistence)

### 4.2 Adaptive Question Engine

The question engine selects questions based on accumulated context. It is not a fixed questionnaire — it is a decision tree that branches based on answers.

#### 4.2.1 Cold Start — Anchoring Questions

The first 2-3 questions must rapidly establish enough context for intelligent branching. These are the anchoring questions — they apply universally regardless of tier:

**Anchor 1 — Role & Context:**
"Let's start with you. What's your role, and what kind of organization do you work in? For example: 'compliance analyst at a mid-size bank' or 'solo marketing consultant' or 'head of operations at a health-tech startup.'"

*Why this works:* A single free-text answer reveals role, seniority, industry, organization size, and often hints at regulatory context. ANTON extracts all five signals from one response.

**Anchor 2 — The Main Thing:**
"In one sentence, what's the single biggest frustration in your work right now?"

*Why this works:* This immediately identifies the emotional center of gravity. It gives ANTON a pain signal strong enough to start matching modules — even if everything else is still unknown. It also establishes that this conversation is about *their* reality, not a generic assessment.

**Anchor 3 — AI History:**
"Have you tried using AI tools for your work before? If so, what happened?"

*Why this works:* The answer determines AI literacy calibration (skip basics for experienced users), surfaces previous failures to avoid repeating (critical for trust), and sets expectations for the conversation. If the answer is "no, never" — ANTON knows to include the AI literacy orientation. If "yes, ChatGPT for drafting emails" — ANTON knows the baseline.

After these three anchors, ANTON has enough signal to branch into sector-specific questioning, calibrate its language, and begin module matching.

#### 4.2.2 Branching Logic

**Example branching logic:**

```
Q: "What industry are you in?"
A: "Financial services — bank"
→ Branch to: regulatory awareness check, FCP-specific pain points, 
   data residency questions, specific module clusters (Area 1: FCP, Area 3: Banking)

A: "Education — university"  
→ Branch to: administrative vs academic pain, student-facing processes,
   research workflow, specific module clusters (Area 20: Academic, Area 23: Education)

A: "I'm a freelance consultant"
→ Branch to: solo workflow, client management, proposal writing, 
   knowledge reuse, specific module clusters (Area 4: Consulting, Area 21: Personal Dev)
```

**The key insight:** The same discovery framework applies universally. The branching creates the sector/size/role customization without needing completely separate assessment tools.

### 4.3 Module Matching Algorithm

As the user provides information, ANTON continuously matches against its module library using a three-stage approach:

**Stage 1: Semantic Signal Extraction**

Rather than keyword matching (which produces shallow results), ANTON uses its LLM to extract semantic signals from user responses:

```typescript
// After each substantive user response, extract:
interface SemanticSignals {
  roleContext: string[];         // Inferred professional context
  taskTypes: string[];           // Types of work described (analysis, reporting, review, etc.)
  painCategories: PainTheme[];   // Classified pain themes
  domainIndicators: string[];    // Industry/domain signals
  complexityLevel: string;       // Simple tasks vs. complex multi-step processes
  volumeIndicators: string[];    // High-volume repetitive vs. occasional complex
  qualityConcerns: string[];     // Accuracy, consistency, compliance, speed
  integrationNeeds: string[];    // System connection requirements
}
```

**Stage 2: Module Scoring**

Each module in the library has metadata (purpose statement, audience tags, area context, use case descriptions). ANTON scores relevance using:

- **Purpose alignment** (0.4 weight) — Does the module's purpose address a described pain point?
- **Audience match** (0.2 weight) — Is this module designed for someone in this role/sector?
- **Complexity fit** (0.2 weight) — Does the module's sophistication match the user's needs and readiness?
- **Integration fit** (0.1 weight) — Does the module work with or without the systems the user has?
- **Quick win potential** (0.1 weight) — Can this deliver value quickly given the user's constraints?

> **Implementation note:** These weights are initial calibration values derived from consulting experience. They should be treated as tunable hyperparameters, adjusted via the feedback loop (Section 4.5) as real-world adoption data accumulates. Early adopter feedback may shift weights significantly — for example, readiness-gated users may need higher weight on complexity fit.

**Stage 3: Confidence Gating**

Module matches below a confidence threshold of 0.6 are not presented. Instead, ANTON asks clarifying questions to improve matching accuracy. This prevents the "spray and pray" problem of recommending everything vaguely relevant.

```typescript
interface ModuleMatch {
  moduleId: string;
  moduleName: string;
  areaId: string;
  areaName: string;
  matchReason: string;            // Human-readable: "Based on your pain with report writing..."
  estimatedTimeSavings: string;   // "~2 hours per report"
  confidenceScore: number;        // 0-1, only shown if >= 0.6
  prerequisiteModules?: string[]; // If this module works best after another
  workflowSuggestion?: string;    // If multiple modules chain together
  effortToStart: 'immediate' | 'some_setup' | 'significant_setup';
  bestFor: string;                // "This is your strongest quick win" or "Best long-term value"
}
```

**Anti-patterns the matching algorithm avoids:**
- Recommending modules the user's readiness score can't support
- Suggesting advanced features when the user has never used AI
- Overwhelming with 15+ recommendations (max 5 for Lite, 10 for Standard, 15 for Professional)
- Recommending modules that require integrations the user doesn't have

**Zero-match handling:** If no modules cross the 0.6 confidence threshold after the pain-finding phase, ANTON does not fabricate weak matches. Instead:
1. Acknowledge honestly: "Based on what you've described, I don't yet see a strong fit with specific modules. That could mean I need more detail, or it could mean your biggest needs are better served by non-AI solutions."
2. Probe for hidden matches: Ask 2-3 targeted follow-up questions about specific workflow details that often reveal automation potential.
3. If still no matches: Generate a Non-AI Findings report that honestly assesses what the user needs (integration, process redesign, training) and identifies which of those, once addressed, would unlock AI opportunities.

**What counts as "substantive":** Semantic signal extraction triggers after responses that contain work-related content (role descriptions, pain descriptions, volume data, workflow steps, system names). It does NOT trigger after greetings ("hi"), acknowledgments ("ok, got it"), or clarifications ("what do you mean by that?"). The frontend classifies response type by length (>15 words) and content signals (nouns related to work, numbers, system names) before triggering extraction.

### 4.4 AI Literacy Integration

Discovery doesn't just identify opportunities — it builds the user's understanding of what AI can do. This is embedded naturally in the conversation, not as a separate lecture:

**During work mapping:** When a user describes a task, ANTON briefly explains which parts AI handles well ("That data gathering step is a great fit for AI — it's excellent at pulling information from multiple sources and consolidating it. The judgment call at the end? That stays with you.")

**During pain finding:** When a user describes frustration, ANTON classifies whether it's an AI problem, an integration problem, a process problem, or a people problem — and explains the distinction in plain language.

**During opportunity mapping:** ANTON explains the *type* of AI solution and why it fits, building the user's mental model for future decisions.

**Calibration for experience level:** For users who report "none" or "basic" AI experience, ANTON uses more analogies and examples. For advanced users, it skips the basics and focuses on fit assessment.

**Mid-session recalibration:** Users sometimes misreport their AI experience — either overestimating ("I'm advanced" but then asks what a prompt is) or underestimating ("I've never used AI" but describes sophisticated workflows). ANTON monitors for calibration mismatch signals:
- If a self-reported "advanced" user asks basic definitional questions → silently downshift to intermediate language, add more examples
- If a self-reported "none/basic" user uses technical AI terminology naturally → silently upshift, skip orientation content
- Never comment on the mismatch — just adapt. The goal is the user's comfort, not accuracy of self-assessment.

### 4.5 Feedback Loop & Learning

Discovery recommendations improve over time through a structured feedback cycle:

**Post-discovery feedback (30 days):**
- Which recommended modules did you try?
- Which recommendations were most/least useful?
- Did the estimated time savings prove accurate?
- What did we miss?

**Usage tracking (ongoing):**
- Module adoption rate from discovery recommendations
- Time-to-first-use for recommended modules
- Module abandonment rate (started but stopped using)
- Workflow creation rate from discovery suggestions

**Apprentice model integration:**
- Feedback feeds into ANTON's apprentice model for the Discovery area
- Over time, ANTON learns which types of recommendations work best for which user profiles
- Discovery confidence scores are calibrated based on actual adoption outcomes

**What ANTON does NOT do:** It does not share individual discovery data between users. All learning is based on aggregated, anonymized patterns. Each user's specific pain points, workflows, and organizational details remain private to their sessions.

### 4.5.1 Data Retention & Privacy

Discovery sessions capture sensitive organizational information — pain points, system landscapes, process weaknesses, cost structures. Data retention policy:

- **Active sessions:** Retained indefinitely while status is 'active' or 'paused'
- **Completed sessions:** Retained for 24 months from completion date, then automatically purged unless the user opts for longer retention
- **Abandoned sessions:** Purged after 90 days of inactivity
- **Follow-up data:** Retained for the same period as the parent session
- **User right to deletion:** Users can delete any session and all associated data at any time via the API (`DELETE /api/discovery/sessions/:id`). Deletion is permanent and cascading (session → output → follow-ups).
- **GDPR compliance:** Discovery data qualifies as processing of personal data when it includes names, roles, or organizational context. The platform's privacy policy and data processing agreements must cover discovery data. For EU deployments, discovery data must be stored within the EU unless the user explicitly consents otherwise.
- **Air-gapped deployments:** In local/air-gapped mode, all discovery data stays on-premises. No telemetry, no aggregated learning, no benchmark data. The feedback loop and benchmark features are disabled by default in air-gapped mode.

### 4.6 AI-Powered Analysis & Non-AI Finding Identification

At the end of each discovery phase, ANTON performs analysis using its AI engine:

**Pain clustering** — Groups related pain points and identifies root causes ("Your frustrations with data quality, slow investigations, and inconsistent decisions all trace back to fragmented data across multiple systems")

**Opportunity sizing** — Estimates time and cost savings based on reported volumes, frequencies, and pain levels, including opportunity costs and risk exposure ("If your team investigates 50 alerts per day at 2 hours each, and AI-assisted triage can reduce investigation time by 60%, that's 60 hours per day — equivalent to 7.5 FTEs. Beyond the direct savings, your team can redirect that time toward the strategic review backlog you mentioned.")

**Readiness calibration** — Adjusts recommendations based on readiness scores ("Your tech readiness is strong but leadership alignment scored low — we recommend starting with a quick win that produces visible results within 30 days to build executive confidence before requesting larger investment.")

**Non-AI finding identification** — Explicitly surfaces problems that AI cannot solve and recommends the appropriate solution path ("Your biggest pain point — systems not talking to each other — is an integration problem, not an AI problem. I recommend an integration assessment as a parallel workstream. AI can help *after* your systems are connected.")

**Cross-reference intelligence** — Draws on ANTON's knowledge of common patterns across sectors ("Organizations like yours typically find the highest ROI in automating investigation narratives and regulatory reporting — these are high-volume, high-pain, and well-suited to AI assistance")

> **Hallucination risk note:** Opportunity sizing estimates are inherently approximate. ANTON should always present numbers as estimates with explicit ranges ("approximately 40-60 hours per month") rather than false-precision single figures. When the user provides vague volume data ("a lot of alerts"), ANTON should probe for specifics before sizing — or clearly label the estimate as low-confidence. Discovery outputs should include a disclaimer that all financial estimates require validation against actual operational data.

> **Sizing source transparency:** Every estimate in the output should state its basis. Three source types:
> - **User-reported:** "Based on your statement that each alert takes ~2 hours" — directly from user input
> - **Calculated:** "At 20 alerts/day × 2 hours × 220 working days" — arithmetic on user data
> - **Benchmarked:** "Organizations with similar profiles typically see 40-60% reduction" — from cross-reference intelligence or benchmark data
>
> ANTON never presents benchmarked figures as if they were calculated from user data. If no benchmark exists, ANTON says so rather than inventing one.

### 4.7 Language & Localization

Discovery conversations should detect and adapt to the user's language. The Discovery Engine inherits ANTON's existing i18n architecture:

- **Detection:** ANTON detects the user's language from their first response and continues in that language
- **Output generation:** Discovery reports are generated in the detected language
- **Module names:** Module recommendations include localized descriptions where available; fall back to English with a note
- **Discovery Packs:** Community-created packs can include localized question sets; the framework supports language tags per question set
- **Implementation note:** This is not a Phase 1 requirement. MVP launches in English only. Language support follows the platform-wide i18n implementation timeline. However, the Discovery state model and output templates must be i18n-ready from day one (all user-facing strings externalized, no hardcoded English in templates).

---

## 5. Output Specifications

### 5.1 Discovery Lite Output — Personal AI Starter Map

**Format:** 1-2 page structured document
**Export:** Markdown, DOCX, PDF

**Structure:**
```markdown
# Your AI Starter Map
## Prepared by ANTON for [Name], [Role] at [Organization]
## [Date]

### Your Profile
[Brief summary of context, role, industry]

### Your Top Pain Points
1. [Pain point with impact description]
2. [Pain point with impact description]  
3. [Pain point with impact description]

### Recommended Starting Points

#### Quick Win: [Module Name]
Why: [Connection to their specific pain point]
What it does: [Plain language description]
Estimated time savings: [Specific to their situation]
Try it: [Direct link or navigation instruction]

#### Next Steps: [Module Name]
[Same structure]

#### When Ready: [Module Name]  
[Same structure]

### Your Readiness Snapshot
[Visual: simple bar chart or rating summary]

### One Thing to Do This Week
[Single, specific, achievable action]
```

### 5.2 Discovery Standard Output — Team AI Opportunity Report

**Format:** 5-8 page structured document
**Export:** Markdown, DOCX, PDF, PPTX (executive summary version)

**Structure:**
```markdown
# AI Opportunity Report
## [Team/Department] at [Organization]
## [Date] | Discovery Standard Assessment

### Executive Summary
[3-4 paragraph overview: who, what was found, top opportunities, recommended first steps]

### Team Profile & Context
[Industry, size, regulatory environment, AI maturity]

### Work Landscape
[Summary of mapped activities and workflows]
[Key workflow diagram if applicable]

### Pain Point Analysis
[Prioritized pain points with quantified impact]
[Pain theme clusters]
[Total estimated annual cost of addressable pain: X EUR]

### AI Opportunity Portfolio

#### Priority Matrix
[Quadrant visualization: Quick Wins / Strategic / Nice to Have / Consider Later]

#### Use Case Cards (Top 5)
[For each: name, current process, AI solution, benefit estimate, effort estimate, recommended modules]

### Readiness Assessment
[Scores across technology, people, governance dimensions]
[Specific gaps to address]

### 30-Day Action Plan
[Concrete steps with owners and success measures]

### Recommended ANTON Modules
[Matched modules with reasoning, grouped by use case]

### Appendix: Full Discovery Data
[All captured information for reference]
```

### 5.3 Discovery Professional Output — AI Adoption Roadmap

**Format:** 15-25 page comprehensive document
**Export:** Markdown, DOCX, PDF, PPTX, XLSX (business case financials)

**Structure:** Everything from Standard, plus:
- Multi-process analysis with comparative scoring
- Systems landscape and integration requirements
- Governance framework recommendations
- Phased implementation roadmap (30/60/90 days + 6/12 month)
- Business case with ROI calculations
- Risk assessment and mitigation plan
- Resource requirements and skill gap analysis
- Change management recommendations
- Success metrics framework with baselines and targets

### 5.4 Discovery Expert Output — Function Transformation Plan

**Format:** 30-50+ page detailed document
**Export:** Full suite including XLSX for data-heavy sections

**Structure:** Everything from Professional, plus:
- Domain-specific deep dive (draws on area-specific assessment frameworks)
- Process-by-process analysis with current/future state mapping
- Vendor/solution landscape overview
- Detailed implementation plan with milestones and dependencies
- Technology architecture recommendations
- Training and capability building plan
- Regulatory compliance considerations
- Detailed success metrics with measurement methodology

### 5.5 Output Branding & White-Label Support

For consulting firms and advisory practices using Discovery as a client-facing service:

- **Custom branding:** Output documents can include the consulting firm's logo, colors, and boilerplate. Configured in Team Mode settings — applies automatically to all Discovery outputs.
- **Co-branded outputs:** "Prepared by [Firm Name] using openEXPERT by ANTON" — acknowledges the platform while featuring the consultant's brand.
- **Client-facing language:** Output templates avoid internal ANTON jargon. Instead of "Module ID: fcp_sar_narrative_001", outputs say "AI-Assisted SAR Narrative Drafting (powered by openEXPERT)".
- **Proposal integration:** Discovery Standard and Professional outputs include a section formatted as a proposal appendix — consultants can extract this directly into client proposals.
- **Implementation note:** White-label support is a Team Mode feature. Personal Mode outputs use standard openEXPERT branding.

---

## 6. Domain-Specific Discovery Packs

Discovery Expert tier draws on domain-specific question sets and assessment frameworks. These are not separate products — they are extensions that activate when the Discovery Engine identifies the user's sector.

### 6.1 Financial Crime Prevention (FCP) Discovery Pack

**Activates when:** User identifies as working in compliance, AML, financial crime, or financial services

**Additional question areas:**
- Transaction monitoring assessment (systems, alert volumes, false positive rates, investigation workflows)
- Screening assessment (sanctions, PEP, adverse media; matching logic, review processes)
- Fraud prevention assessment (types managed, detection capabilities, real-time scoring)
- AI orchestration assessment (automation level, manual processes, integration state)
- Regulatory compliance landscape (jurisdictions, upcoming requirements, recent findings)

**Maps to:** The FCP assessment templates (Quick Assessment, TM Detailed, TM Workflow, Screening Workflow, AI Orchestration) that already exist as reference frameworks

**Outputs:** Includes FCP-specific deliverables like:
- Alert workflow optimization recommendations
- False positive reduction strategy
- Investigation automation roadmap
- Regulatory compliance gap map

### 6.2 Legal & Compliance Discovery Pack

**Activates when:** User identifies as legal counsel, compliance officer, or legal services

**Additional question areas:**
- Contract review workflows
- Regulatory change management process
- Policy maintenance and distribution
- Legal research and analysis workflows
- Compliance monitoring and reporting

### 6.3 Consulting & Professional Services Discovery Pack

**Activates when:** User identifies as consultant, advisor, or professional services

**Additional question areas:**
- Engagement lifecycle (sales, delivery, reporting)
- Knowledge management and reuse
- Quality assurance processes
- Team utilization and capacity
- Client deliverable production workflows

### 6.4 Healthcare Discovery Pack

**Activates when:** User identifies as working in healthcare, pharma, or life sciences

**Additional question areas:**
- Clinical documentation workflows
- Regulatory submission processes
- Quality management systems
- Patient communication processes
- Research and data analysis workflows

### 6.5 Education & Academic Discovery Pack

**Activates when:** User identifies as working in education or academic institutions

**Additional question areas:**
- Teaching preparation and course design
- Research workflows (literature review, analysis, writing)
- Administrative burden assessment
- Student services and communication
- Grant and funding application processes

### 6.6 Startup & Entrepreneurship Discovery Pack

**Activates when:** User identifies as founder, startup employee, or entrepreneur

**Additional question areas:**
- Founder time allocation and bottlenecks
- Processes being designed vs. inherited
- Scaling considerations
- Compliance obligations not yet addressed
- Knowledge capture needs

### Creating New Discovery Packs

Discovery Packs follow the standard openEXPERT module extension pattern. The community can create and share domain-specific packs via .anton export format:

```typescript
interface DiscoveryPack {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  
  // Activation
  activationKeywords: string[];    // Triggers this pack
  activationRoles: string[];       // Role matches
  activationIndustries: string[];  // Industry matches
  activationLogic: 'any' | 'all' | 'weighted'; // How activation criteria combine
  // 'any': Pack activates if ANY keyword, role, or industry matches (default, broadest reach)
  // 'all': Pack activates only if at least one match in EACH of keywords, roles, and industries
  // 'weighted': Pack scores activation strength; highest-scoring pack wins when multiple match
  activationThreshold?: number;    // For 'weighted' mode: minimum score to activate (0-1)
  
  // Content
  questionSets: QuestionSet[];     // Domain-specific questions
  painPatterns: PainPattern[];     // Known pain points in this domain
  moduleMatches: DomainModuleMatch[]; // Domain-specific module recommendations
  outputTemplates: OutputTemplate[]; // Sector-specific report sections
  
  // Reference frameworks
  assessmentFrameworks: AssessmentFramework[]; // Detailed assessment templates
  benchmarkData?: BenchmarkData[];  // Industry benchmarks for comparison
  
  // Versioning
  minPlatformVersion: string;       // Minimum openEXPERT version required
  schemaVersion: number;            // Pack schema version for migration
}

// Discovery Pack sub-type definitions

interface QuestionSet {
  id: string;
  phase: string;                    // Which discovery phase this extends
  tier: 'lite' | 'standard' | 'professional' | 'expert'; // Minimum tier
  questions: PackQuestion[];
  language?: string;                // ISO 639-1 code, default 'en'
}

interface PackQuestion {
  id: string;
  text: string;
  context: string;                  // Why this question matters
  exampleAnswer: string;            // Help users understand what to share
  followUpTriggers: FollowUpTrigger[];
  branchingLogic?: string;          // Condition under which to ask this question
}

interface FollowUpTrigger {
  keyword: string;                  // Signal in the answer
  followUpQuestion: string;         // What to ask next
}

interface PainPattern {
  id: string;
  name: string;                     // e.g., "High false positive rate"
  description: string;
  indicators: string[];             // Phrases that signal this pain
  typicalImpact: string;            // "Organizations with this pattern typically waste X hours"
  suggestedModules: string[];       // Module IDs
  isCommon: boolean;                // True = ask proactively, False = only if detected
}

interface DomainModuleMatch {
  painPatternId: string;
  moduleId: string;
  relevanceScore: number;           // 0-1 how strongly this module fits this pain
  reasoning: string;                // Human-readable explanation
  prerequisiteActions?: string[];   // Non-module prerequisites
}

interface OutputTemplate {
  id: string;
  tier: string;
  sectionName: string;              // e.g., "FCP Alert Workflow Analysis"
  templateMarkdown: string;         // Template with {{placeholders}}
  requiredData: string[];           // State fields needed to populate template
}

interface AssessmentFramework {
  id: string;
  name: string;                     // e.g., "Transaction Monitoring Assessment"
  description: string;
  questionSets: string[];           // QuestionSet IDs
  scoringModel?: ScoringModel;
}

interface ScoringModel {
  dimensions: string[];
  maxScore: number;
  interpretationGuide: Record<string, string>; // Score range → meaning
}

interface BenchmarkData {
  metric: string;                   // e.g., "false_positive_rate"
  sectorSegment: string;            // e.g., "tier_2_banks_nordics"
  percentile25: number;
  median: number;
  percentile75: number;
  source: string;
  lastUpdated: string;
}
```

### Pack Schema Versioning

Discovery Packs declare their `schemaVersion`. The platform maintains backward compatibility:

- **Version 1 packs** will always work on the current platform (migration layer translates on import)
- Breaking changes to the pack schema increment the major version and include an automated migration script
- Community contributors receive deprecation notices 90 days before old schema versions lose write-support
- Read-only support for old schema versions is maintained indefinitely

---

## 7. User Interface Design

### 7.0 Error Handling & Graceful Degradation

The Discovery UI must handle failures gracefully — users in the middle of a discovery session should never lose work or hit dead ends.

**Conversation failures:**
- If the LLM produces an off-topic or nonsensical question: Frontend detects anomalous output (no question mark, unrelated to current phase), regenerates with a retry. After 2 retries, falls back to a pre-written phase-appropriate question from the Discovery Guide's question bank.
- If the LLM response is empty or errors: Display "I'm thinking about your answer — give me a moment" with a spinner. Retry up to 3 times with exponential backoff. If all fail: "I'm having trouble processing that. Let me try a different approach..." and offer: continue with a simpler question, save and resume later, or skip to the next phase.

**User input handling:**
- If the user gives an unparseable or empty answer: ANTON asks a clarifying follow-up rather than erroring. "Could you tell me a bit more about that? For example, [relevant example]."
- If the user repeatedly gives one-word answers: ANTON adapts by offering multiple-choice-style options: "Would you say your main challenge is more about: (a) finding data, (b) writing reports, (c) managing volume, or (d) something else?"

**Insight panel failures:**
- If the Haiku call for real-time insights fails: Panel shows the most recently computed insights with a subtle "Last updated: [time]" indicator. Never show an empty panel.
- If SSE connection drops: Frontend implements automatic reconnection with exponential backoff. During disconnection, a "Reconnecting..." indicator appears on the panel, not the main conversation.

**Network failures:**
- Autosave failure: Queue unsaved state locally (IndexedDB) and retry on reconnection. Show a subtle "Saving..." indicator that turns to "Saved" or "Offline — will save when reconnected."
- Full network loss: Discovery conversation pauses with a clear message. State is preserved locally. On reconnection, state syncs and conversation resumes.
- **IndexedDB storage note:** Lite/Standard session state fits comfortably in IndexedDB (~50KB). Expert tier sessions can reach 1-2MB. Most browsers allow 50MB+ per origin, so this is not a practical limit. However, if IndexedDB is unavailable (private browsing in some browsers), fall back to in-memory state only and warn: "Your session cannot be saved offline in this browser mode. Please ensure network connectivity or switch to a standard browser window."

**Output generation failures:**
- If generation fails mid-way: Offer partial output ("I was able to generate your pain analysis and module matches, but the action plan needs another attempt. Here's what I have so far...")
- If export fails: Offer alternative format. If all formats fail: provide the raw Markdown for copy-paste.

### 7.0.1 Large Output Rendering

Expert tier outputs can exceed 50 pages. The output review interface handles this with:

- **Virtual scrolling:** Only renders visible sections plus a buffer zone. DOM contains ~20 sections at any time regardless of total document length.
- **Section navigation:** A floating table of contents on the output view allows jumping to specific sections. Sections collapse/expand independently.
- **Progressive loading:** Output generates section-by-section with each section visible as soon as it completes. Users don't wait for the full 50-page document to finish generating before reading the first section.
- **Print/export optimization:** Full document renders for export, but the UI view remains virtualized.

### 7.1 Entry Experience

When users click Discover, they see a warm, inviting landing page — not a form. The tone is conversational:

```
┌─────────────────────────────────────────────────┐
│                                                 │
│         🔍  Let's Discover Together             │
│                                                 │
│   ANTON can help you find where AI creates      │
│   the most value in your work. It starts with   │
│   understanding what you do and where it hurts. │
│                                                 │
│   How deep would you like to go?                │
│                                                 │
│   ┌─────────────┐  ┌──────────────┐            │
│   │  🌱 Lite    │  │ 🌿 Standard │            │
│   │  15-30 min  │  │  1-2 hours   │            │
│   │  Personal   │  │  Team        │            │
│   │  starter    │  │  opportunity │            │
│   │  map        │  │  report      │            │
│   └─────────────┘  └──────────────┘            │
│                                                 │
│   ┌──────────────┐  ┌──────────────┐           │
│   │ 🌳 Pro      │  │ 🏔 Expert   │           │
│   │  3-4 hours   │  │  Full day    │           │
│   │  Adoption    │  │  Function    │           │
│   │  roadmap     │  │  transform   │           │
│   └──────────────┘  └──────────────┘           │
│                                                 │
│   Not sure? Start with Lite — you can          │
│   always go deeper later.                       │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 7.2 Conversation Interface

Once a tier is selected, the interface becomes a guided conversation. The left panel shows a progress indicator; the main area is the conversation:

```
┌──────────┬──────────────────────────────────────┐
│ Progress │                                      │
│          │  ANTON:                               │
│ ● Context│  Let's start with you. What's your   │
│ ○ Work   │  role and what kind of organization   │
│ ○ Pain   │  do you work in?                     │
│ ○ Ready  │                                      │
│ ○ Map    │  [User types or selects from          │
│ ○ Plan   │   suggested options]                  │
│          │                                      │
│──────────│  ────────────────────────────────     │
│          │                                      │
│ Phase 1  │  ANTON:                               │
│ of 5     │  Great — a compliance analyst at a    │
│          │  mid-size bank. I have good context   │
│ ~15%     │  for that. Now tell me: what are the  │
│ complete │  3-5 things that take up most of your │
│          │  working week?                        │
│          │                                      │
│          │  [User responds]                      │
│          │                                      │
│          │  ┌──────────────────────────────┐     │
│          │  │ 💬 Type your answer...       │     │
│          │  └──────────────────────────────┘     │
│          │                                      │
│          │  [Save & Continue Later]              │
│          │  [Skip to Next Phase]                 │
└──────────┴──────────────────────────────────────┘
```

### 7.3 Real-Time Insight Panel

As the conversation progresses, a collapsible right panel shows emerging insights:

```
┌─ Emerging Insights ─────────────┐
│                                 │
│ 🎯 Top Pain Theme:             │
│    Data gathering across        │
│    multiple systems             │
│                                 │
│ 💡 Early Module Matches:       │
│    • Alert Triage Assistant     │
│    • SAR Narrative Generator    │
│    • Data Readiness Assessment  │
│                                 │
│ 📊 Estimated Opportunity:      │
│    ~45 hours/month recoverable  │
│                                 │
│ ⚡ Quick Win Spotted:          │
│    SAR narrative automation     │
│    could save 3 hrs/week        │
│                                 │
└─────────────────────────────────┘
```

### 7.4 Output Generation

When enough data is collected (or the user requests output), ANTON generates the discovery document. The generation is transparent:

```
┌──────────────────────────────────────────────┐
│                                              │
│  📄 Generating Your AI Opportunity Report    │
│                                              │
│  ✅ Analyzing pain points...                 │
│  ✅ Matching modules to your needs...        │
│  ✅ Calculating opportunity sizing...        │
│  🔄 Building prioritized roadmap...          │
│  ○  Generating action plan...                │
│  ○  Formatting final document...             │
│                                              │
│  ████████████░░░░░░░░  60%                   │
│                                              │
└──────────────────────────────────────────────┘
```

### 7.5 Output Review & Action

The output is presented in a split view — document on the left, action panel on the right:

```
┌─────────────────────┬────────────────────────┐
│ AI Opportunity      │ Take Action             │
│ Report              │                        │
│                     │ Your Quick Win:         │
│ [Full generated     │ ┌────────────────────┐ │
│  document with      │ │ Try SAR Narrative  │ │
│  scrolling]         │ │ Generator now →     │ │
│                     │ └────────────────────┘ │
│                     │                        │
│                     │ Recommended Next:       │
│                     │ • Alert Triage         │
│                     │ • Risk Assessment      │
│                     │ • Data Quality Check   │
│                     │                        │
│                     │ Export Report:          │
│                     │ [MD] [DOCX] [PDF]      │
│                     │ [PPTX] [XLSX]          │
│                     │                        │
│                     │ Share with Team:        │
│                     │ [Copy Link]            │
│                     │                        │
│                     │ Schedule Follow-up:     │
│                     │ [30 days] [60 days]    │
│                     │                        │
└─────────────────────┴────────────────────────┘
```

---

## 8. Session Continuity & Follow-Up

### 8.1 Save & Resume

Discovery sessions can be saved and resumed. State is persisted in the discovery_sessions table:

```sql
CREATE TABLE discovery_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  tier TEXT NOT NULL,           -- lite, standard, professional, expert
  state JSON NOT NULL,          -- Full DiscoveryState object
  status TEXT DEFAULT 'active', -- active, paused, completed, abandoned
  started_at DATETIME,
  last_active_at DATETIME,
  completed_at DATETIME,
  output_id TEXT,               -- Link to generated output
  autosave_version INTEGER DEFAULT 0, -- Incremented on each autosave
  FOREIGN KEY (user_id) REFERENCES user_profiles(id)
);

CREATE TABLE discovery_outputs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  tier TEXT NOT NULL,
  title TEXT,
  content_md TEXT,              -- Full markdown output
  module_matches JSON,          -- Matched modules with scores
  action_plan JSON,             -- Generated action items
  metrics JSON,                 -- Opportunity sizing data
  non_ai_findings JSON,         -- Problems needing non-AI solutions
  executive_briefing TEXT,      -- 1-paragraph leadership summary
  created_at DATETIME,
  exported_formats JSON,        -- Track which formats were exported
  FOREIGN KEY (session_id) REFERENCES discovery_sessions(id)
);

CREATE TABLE discovery_followups (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  scheduled_date DATE,
  type TEXT,                    -- 30_day, 60_day, 90_day, custom
  status TEXT DEFAULT 'pending', -- pending, completed, skipped
  follow_up_notes TEXT,
  progress_data JSON,           -- What changed since discovery
  modules_tried JSON,           -- Which recommended modules were actually used
  user_feedback JSON,           -- Rating + comments on recommendations
  FOREIGN KEY (session_id) REFERENCES discovery_sessions(id)
);

CREATE INDEX idx_discovery_sessions_user ON discovery_sessions(user_id);
CREATE INDEX idx_discovery_sessions_status ON discovery_sessions(status);
CREATE INDEX idx_discovery_followups_date ON discovery_followups(scheduled_date, status);
```

### 8.1.1 API Endpoint Specification

```typescript
// Discovery session management
POST   /api/discovery/sessions              // Start new session (body: { tier })
GET    /api/discovery/sessions              // List user's sessions
GET    /api/discovery/sessions/:id          // Get session state
PUT    /api/discovery/sessions/:id          // Update session state (autosave)
DELETE /api/discovery/sessions/:id          // Abandon session

// Discovery conversation
POST   /api/discovery/sessions/:id/respond  // Submit user response (SSE stream)
GET    /api/discovery/sessions/:id/insights // Get current real-time insights

// Output generation
POST   /api/discovery/sessions/:id/generate // Generate output document (SSE stream)
GET    /api/discovery/sessions/:id/output   // Get generated output
POST   /api/discovery/sessions/:id/export   // Export to format (body: { format })

// Follow-up
POST   /api/discovery/sessions/:id/followup // Schedule follow-up
PUT    /api/discovery/followups/:id         // Update follow-up with feedback
GET    /api/discovery/followups/pending     // Get pending follow-ups for user

// Discovery Packs (marketplace)
GET    /api/discovery/packs                 // List available packs
GET    /api/discovery/packs/:id             // Get pack details
POST   /api/discovery/packs                 // Submit pack (community)
PUT    /api/discovery/packs/:id/review      // Review submitted pack (admin)
```

**SSE connection strategy:** The `/respond` endpoint returns the conversation response as SSE. The insight panel uses a separate lightweight SSE stream from `/insights`. These are **not** multiplexed — they are independent connections because:
- The conversation SSE closes after each response completes; insight SSE stays open during the session
- Insight updates are asynchronous (Haiku call) and should never block the primary conversation
- If the insight SSE fails, the conversation continues unaffected
- Browser limit of 6 concurrent connections per domain is not a concern since Discovery uses only 2

**Rate limiting:**
- `/respond`: Max 30 requests per minute per session (prevents runaway clients; normal pace is ~2-4/minute)
- `/generate`: Max 3 requests per hour per session (output generation is expensive)
- `/export`: Max 10 requests per hour per session
- All limits return HTTP 429 with `Retry-After` header
- Rate limits are per-session, not per-user — a user can have multiple sessions but each is independently limited

**Follow-up tracking — automated vs. manual:** The `modules_tried` field in `discovery_followups` is populated **automatically** by querying the user's module session history against the recommended module IDs from the discovery output. The user is not asked to self-report which modules they tried — the platform already knows. The `user_feedback` field (rating + comments) is the only manual input in the follow-up flow.

### 8.1.2 Real-Time Insight Panel

The insight panel (right sidebar during discovery) updates after each user response via Server-Sent Events (SSE) — the same mechanism ANTON uses for streaming module responses.

**Update triggers:**
- After each substantive user response (not greetings or clarifications)
- After phase transitions
- After module matching confidence crosses 0.6 threshold

**Computation approach:** Insight updates are computed as a lightweight secondary LLM call using Haiku (fast, cheap) that receives the current DiscoveryState and returns:
- Top pain theme label
- Top 3 module matches (if confidence > 0.6)
- Estimated opportunity size
- Any quick wins spotted

This runs asynchronously so it does not slow down the primary conversation flow.

### 8.1.3 Session Recovery

**Autosave:** Every user response triggers a debounced (2-second) PUT to `/api/discovery/sessions/:id` with the current state. The `autosave_version` counter increments.

**Recovery flow:** On page load, the frontend checks for active sessions. If found, presents: "You have an active discovery session (started [date], [tier] tier, [X]% complete). Resume or start fresh?"

**Multi-device:** Sessions are tied to user_id, not browser. A user can start on desktop and resume on mobile.

### 8.2 Follow-Up Intelligence

After a Discovery session, ANTON can prompt follow-up:

- **30-day check-in:** "You identified SAR narrative automation as your quick win 30 days ago. Have you tried the SAR Narrative Generator module? Here's how your team's usage data looks..."
- **Progress tracking:** Compare current module usage against discovery recommendations
- **Discovery evolution:** Suggest upgrading from Lite to Standard, or Standard to Professional, based on adoption progress
- **New opportunity detection:** As ANTON learns from the user's actual work (via cross-workflow intelligence), it can surface new opportunities not identified in the original discovery

### 8.3 Team Discovery Coordination

For Standard tier and above, Discovery supports team participation:

- **Shared sessions:** Multiple team members contribute to the same discovery
- **Perspective capture:** Each participant's pain points and activities are captured separately, then synthesized
- **Role-based views:** The output highlights different recommendations by role
- **Collective prioritization:** Team voting on opportunities (integrate with Collaborative Canvas)

### 8.4 Discovery Cascade — Cross-Organization Propagation

When one team's discovery produces visible results, the platform facilitates spread to adjacent teams:

- **Template sharing:** A completed discovery session can be exported as an anonymized template. The next team starts with organizational context (industry, size, systems landscape) pre-filled, skipping 30% of setup questions.
- **Pattern library:** Cross-team pain points and successful module matches are captured (within the same organization, respecting privacy) as a "discovery pattern." The third team to run discovery already benefits from the organization's accumulated learning.
- **Champion network:** The person who led Discovery for Team A can be invited as a participant (not facilitator) in Team B's discovery — providing cross-pollination without creating dependency.
- **Executive dashboard:** For organizations running 3+ discoveries, a consolidated view shows: total addressable opportunity across teams, common pain themes, module adoption rates, and ROI trajectory. This is the input for board-level AI strategy discussions.
- **Implementation note:** Cascade features depend on Team Mode with organizational hierarchy. Phase 4+ feature, requires user management and org structure in the database.

**Cascade data governance:** Cross-team discovery sharing raises data access questions:
- **Template sharing:** Anonymized templates strip all names, specific numbers, and system names. Only structural context (industry, org size, regulatory environment) is preserved. Template creation requires explicit opt-in from the session owner.
- **Pattern library:** Patterns are abstracted to the level of pain theme + module match, never at the level of specific findings. "Teams in this organization commonly report data hunting as a top pain theme" — never "Team A's investigation process takes 3 hours per alert."
- **Executive dashboard:** Aggregates are visible to users with organizational admin role only. Individual session data is never surfaced in the dashboard — only aggregated totals, averages, and trends.
- **Cross-team participant access:** A champion invited to co-facilitate another team's discovery has participant-level access to that session only, not to the original team's session data.

---

## 9. Integration with Existing Features

### 9.1 Knowledge Source System

Discovery sessions can draw on uploaded documents for context:
- Organization charts, process documents, system landscapes → richer context for recommendations
- Previous assessments, audit reports → identify known gaps
- Strategic plans → align recommendations with organizational direction

### 9.2 Workflow Builder

Discovery outputs can directly generate Workflow Builder templates:
- Top use cases → pre-configured workflow templates
- Module chains → workflow step sequences
- "Try this workflow" → one-click creation from discovery output

### 9.3 Institutional Memory

Discovery findings feed into ANTON's institutional memory:
- Pain points → checkpoint decisions for future reference
- Organizational context → knowledge atoms
- Module effectiveness (post-discovery) → apprentice model feedback

### 9.4 Cross-Workflow Intelligence

Discovery sessions generate knowledge atoms that inform future work:
- "This organization's biggest TM challenge is false positives at 85%" → context for all future FCP module sessions
- "Team has 6 investigators accessing 8 systems per case" → informs integration recommendations
- Patterns across discovery sessions (anonymized) → improve future discovery recommendations

---

## 10. Prompt Architecture for Discovery

Discovery uses a specialized prompt layer within ANTON's 7-layer system:

### Layer 1: System Foundation
Standard ANTON system prompt

### Layer 2: Discovery Area Context
```
You are ANTON's Discovery Guide. Your role is to help users understand 
where AI creates the most value in their work. You do this through 
structured but conversational questioning, active listening, and 
intelligent analysis.

You are not selling AI — you are helping people see their work clearly 
and identifying genuine opportunities. If AI isn't the right solution 
for a pain point, say so. Recommend process redesign, integration, 
or training where those are better answers.

You have access to 240+ expert modules across 30 areas. You match 
user needs to specific modules based on their described work, pain 
points, and context. You size opportunities based on reported volumes, 
frequencies, and time investments.
```

### Layer 3: Tier-Specific Module Expertise
Different for each tier — Lite is conversational and lightweight; Expert draws on full assessment frameworks

### Layer 4: Persona — Discovery Guide Behavioral Specification

```
PERSONA: Discovery Guide

CORE TRAITS:
- Warm and curious, not clinical or mechanical
- Structured in thinking, conversational in delivery
- Practical — every question has a purpose, every insight leads to action
- Honest — willing to say "AI isn't the answer here"
- Adaptive — calibrates language, depth, and pace to the user

BEHAVIORAL RULES:

1. ANCHORING: Start every discovery with the three anchoring questions 
   (role/context, main frustration, AI history). Never skip these.

2. REFLECTION: After every substantive user response, briefly reflect 
   back what you heard before asking the next question:
   "So you're spending about 2 hours per alert mostly on data 
   gathering across 6 systems — that's a significant time sink. 
   Let me ask about..."

3. ONE QUESTION AT A TIME: Never ask compound questions. If you need 
   two pieces of information, ask for one, then the other.

4. EXAMPLES: When asking for information, provide a concrete example 
   from a similar context:
   "For instance, a team lead in compliance might say 'I spend 
   Monday mornings pulling data from three systems into a single 
   spreadsheet for the weekly review.'"

5. PHASE TRANSITIONS: When moving between phases, summarize what 
   you've learned and preview what's next:
   "Great — I now have a clear picture of your main workflows and 
   pain points. Let me summarize what I've heard before we look at 
   your readiness for AI adoption..."

6. CLASSIFICATION: When a user describes a pain point, classify it 
   in plain language:
   "That sounds like a data integration problem — systems not talking 
   to each other. AI can help with analysis once the data flows, but 
   the root issue needs an integration solution."

7. PROBING: When answers are vague, probe gently with specifics:
   Vague: "Reporting takes too long"
   Probe: "Can you walk me through what happens when you create a 
   report? What's the first thing you do?"

8. CALIBRATION: Adjust language to AI experience level:
   - None/Basic: Use analogies ("Think of AI as a very fast research 
     assistant who can read 1000 pages in a minute")
   - Intermediate: Use capability categories ("This is a good fit for 
     RAG-based document Q&A")
   - Advanced: Use technical specifics ("Your workflow would benefit 
     from a multi-step agent with tool-calling for system integration")

9. OFF-SCRIPT: If the user raises something unexpected, follow the 
   thread. Capture the information even if it doesn't fit the current 
   phase structure. Then gently return:
   "That's really valuable context — I've noted it. Coming back to 
   your main workflows..."

10. HONESTY ABOUT LIMITATIONS: If ANTON doesn't have enough 
    information to make a confident recommendation, say so:
    "Based on what you've shared, I can see strong potential in 
    report automation. I'd need to understand more about your data 
    sources before recommending specific modules — can you tell me..."

11. GRACEFUL EXIT: If the user wants to stop mid-session, respect 
    it immediately. Never guilt-trip or pressure to continue:
    "No problem at all. I've saved everything — you can pick this 
    up anytime. Based on what we've covered so far, here's a quick 
    summary of what I've learned..." [generate abbreviated output 
    from available data, even if incomplete]

12. EMOTIONAL AWARENESS: Discovery can surface frustration when 
    people realize how much time they waste. Acknowledge it:
    "That's a significant amount of time on manual work. The good 
    news is — now that we can see it clearly, we can do something 
    about it." Never dismiss or minimize pain that has been shared.
```

### Layer 5: Skills
Discovery methodology skills: pain point analysis, opportunity sizing, readiness assessment, action planning

### Layer 6: Knowledge Sources
Module library metadata, domain-specific discovery packs, sector benchmarks

### Layer 7: User Context
Accumulated discovery state, user profile, organizational context

### Example Conversation Flow — Discovery Lite

```
ANTON: Let's start with you. What's your role, and what kind of 
       organization do you work in?

USER:  I'm a compliance analyst at a mid-size bank in Sweden.

ANTON: Great — compliance at a Swedish bank. I have good context for 
       that. In one sentence, what's the single biggest frustration 
       in your work right now?

USER:  I spend most of my day copying data between systems to 
       investigate alerts instead of actually analyzing them.

ANTON: That's a very common pain point — data gathering eating into 
       analysis time. Before I dig deeper, have you tried using AI 
       tools for any part of your work before?

USER:  I've tried ChatGPT for some drafting but it doesn't know our 
       regulations or policies.

ANTON: Makes sense — generic AI without your context produces generic 
       results. That's exactly the gap structured AI platforms are 
       designed to close. Now, let me understand your work better. 
       What are the 3-5 things that fill most of your working week?

USER:  Alert investigation, writing SAR narratives, monthly reporting, 
       and answering questions from the business about our policies.

ANTON: Four main areas — investigation, narrative writing, reporting, 
       and policy Q&A. For the alert investigation — roughly how many 
       alerts do you handle per day, and how long does each take?

USER:  About 15-20 alerts. Each one takes anywhere from 30 minutes 
       to 2 hours depending on complexity.

ANTON: So 15-20 alerts at 30-120 minutes each — that's potentially 
       10-40 hours per week on investigation alone. Of that time, 
       how much is actual analysis and judgment versus gathering data 
       from systems?

USER:  Honestly, probably 70% is just finding and copying data. 
       The actual thinking is maybe 30%.

ANTON: That's a significant finding. You're spending roughly 7-28 
       hours per week on data gathering that could potentially be 
       automated, freeing up your expert judgment time. Let me ask 
       about your other pain points...

[continues through remaining phases]
```

---

## 11. Marketplace & Community

### 11.1 Discovery Pack Marketplace

Domain-specific Discovery Packs can be shared via the openEXPERT marketplace:
- Community members create Discovery Packs for their sectors
- Packs include question sets, pain patterns, module matches, and output templates
- Rated and reviewed by the community
- Exported/imported as .anton packages

**Intellectual property & licensing:** All Discovery Packs submitted to the marketplace must be licensed under the same open-source license as the platform (or a compatible license). Contributors retain authorship credit but grant the community perpetual, royalty-free use rights. This means:
- A consultant who creates an FCP Pack based on their methodology can be credited as author, but cannot restrict others from using, modifying, or building on it
- Proprietary methodologies should NOT be submitted to the public marketplace — consultants can create private packs for their team's use only (Team Mode feature)
- The marketplace submission form includes an explicit license acceptance checkbox
- Packs that contain content from third-party copyrighted sources (regulatory text, published frameworks) must comply with applicable copyright law and fair use provisions

### 11.2 Benchmark Data (Future)

With sufficient adoption, anonymized and aggregated discovery data can provide benchmarks:
- "Organizations in your sector typically report 40-60% of investigation time spent on data gathering"
- "Your false positive rate of 92% is above the industry average of 85%"
- "Teams your size typically find their first quick win in report automation"

This requires careful privacy design and explicit opt-in. It is a future feature, not a launch requirement.

---

## 12. Implementation Priorities

### 12.0 Build Responsibility (RACI)

For the current development phase (Daniel + Claude Code as primary implementation team):

| Responsibility | Phase 1-2 | Phase 3-5 | Post-Launch |
|---------------|-----------|-----------|-------------|
| **Architecture decisions** | Daniel (Responsible + Accountable) | Daniel | Daniel + community input |
| **Implementation** | Claude Code (R), Daniel (A) | Claude Code (R), Daniel (A) | Community contributors (R), Daniel (A) |
| **Testing** | Daniel (R+A) | Daniel (R+A), beta testers (Consulted) | Community (R), Daniel (A) |
| **UX/Design review** | Daniel (R+A) | Daniel (R+A) | Community feedback (Informed) |
| **Domain expertise (FCP Pack)** | Daniel (R+A) | Daniel + Advisense team (C) | Domain experts (R), Daniel (A) |
| **Documentation** | Claude Code (R), Daniel (A) | Claude Code (R), Daniel (A) | Community (R), Daniel (A) |

As the community grows, responsibilities shift toward distributed contribution with Daniel maintaining architectural authority and quality standards.

### 12.0.0 Session State Scaling

Discovery state is stored as a JSON blob in the `state` column of `discovery_sessions`. For Lite and Standard tiers, this typically stays under 50KB and works well in SQLite.

Expert tier sessions with 10+ workflow maps, 50+ pain points, and full phase summaries can reach 500KB-2MB. For these cases:

- **Phase 1-3 (SQLite):** Acceptable. Expert sessions are rare in early adoption. JSON compression (zlib) reduces storage by ~60%.
- **Phase 4+ (if needed):** Migrate to normalized storage: separate tables for `discovery_work_activities`, `discovery_pain_points`, `discovery_workflows`, `discovery_opportunities` with foreign key to session. The DiscoveryState interface remains the application-layer model — persistence layer handles serialization/deserialization.
- **Trigger for migration:** When average Expert session state exceeds 1MB or when SQLite query performance degrades below 100ms for state retrieval.

### 12.0.1 Definition of Done — Per Tier

Each tier is "complete" when all of the following are met:

**Discovery Lite — Done when:**
- [ ] User can select Lite tier from landing page
- [ ] Conversation flows through all 5 phases without errors
- [ ] Module matching produces relevant recommendations (validated against 10 test personas)
- [ ] Output generates as exportable Markdown
- [ ] Session save/resume works across page refresh
- [ ] Completion time for test persona: under 25 minutes
- [ ] User satisfaction in testing: >4.0/5.0

**Discovery Standard — Done when:**
- [ ] Everything from Lite, plus:
- [ ] Workflow walk-through produces structured WorkflowMap output
- [ ] Pain quantification calculates direct + opportunity + risk costs
- [ ] Opportunity matrix generates with quadrant classification
- [ ] DOCX and PDF export produce professional-quality documents
- [ ] Team participation: 2+ users can contribute to same session
- [ ] Output includes 30-day action plan with owners

**Discovery Professional — Done when:**
- [ ] Everything from Standard, plus:
- [ ] Multi-process inventory maps 5+ processes in structured format
- [ ] Integration assessment produces systems landscape summary
- [ ] Governance framework generates compliance/security recommendations
- [ ] Business case builder produces ROI calculations
- [ ] PPTX export generates presentation-ready executive summary
- [ ] Progressive summarization keeps sessions within context window

**Discovery Expert — Done when:**
- [ ] Everything from Professional, plus:
- [ ] At least one Discovery Pack (FCP) fully functional
- [ ] Domain-specific questions activate based on sector detection
- [ ] Output quality matches consulting-grade deliverables
- [ ] Pack framework enables community pack creation
- [ ] Cross-session persistence for multi-day discoveries

### 12.0.2 Scope Management — Tier Boundaries

Users will sometimes want Expert-depth answers during a Lite session. The Discovery Engine handles this gracefully:

**Boundary detection:** When a user provides detail that exceeds their tier's depth (e.g., detailed workflow mapping in Lite), ANTON acknowledges the detail, captures what it can within the tier, and offers to go deeper:

*"You've shared detailed workflow information that's really valuable. In this Lite discovery, I'm capturing the headlines to get you started. If you'd like to map this workflow step by step with full pain quantification, I'd recommend upgrading to Standard — we can pick up right where we left off."*

**Upgrade path:** Tier upgrades preserve all existing session data. No rework. The user continues from where they are with deeper questions unlocked.

**Downscale path:** If a user selected Professional but runs out of time after Standard-level completion, ANTON generates the best output possible from what's been captured, noting which sections would benefit from additional depth.

### 12.1 Phase 1 — MVP (Sprint 1-2, ~15 developer-days)
**Depends on:** No dependencies (greenfield)
- Discovery Lite tier fully functional
- Conversational interface with progress tracking
- Module matching algorithm (semantic, Stage 1-2)
- Basic output generation (Markdown export)
- Save & resume capability with autosave
- Navigation integration and new user onboarding prompt
- **Acceptance tests:** 10 persona walk-throughs with quality review

### 12.2 Phase 2 — Team Discovery (Sprint 3-4, ~20 developer-days)
**Depends on:** Phase 1 complete (Lite tier stable, module matching validated)
- Discovery Standard tier
- Workflow walk-through guided conversation
- Pain quantification calculations (direct + opportunity + risk)
- Opportunity matrix generation with quadrant classification
- DOCX and PDF export
- Team participation (multiple contributors)
- Non-AI finding identification and reporting
- **Acceptance tests:** 5 team simulations with cross-role participation

### 12.3 Phase 3 — Enterprise Discovery (Sprint 5-7, ~30 developer-days)
**Depends on:** Phase 2 complete (Standard tier stable, team features working). Note: PPTX export and progressive summarization are independent work streams that can start during Phase 2 if capacity allows.
- Discovery Professional tier
- Integration assessment questions
- Governance framework generation
- Business case builder with ROI calculations
- Executive briefing output format
- PPTX export for executive presentations
- Follow-up scheduling and check-ins
- Progressive summarization for long sessions
- **Acceptance tests:** 3 full Professional sessions with real organizational data

### 12.4 Phase 4 — Domain Expertise (Sprint 8-10, ~25 developer-days)
**Depends on:** Phase 3 complete (Professional tier stable). FCP Pack content creation can start during Phase 2-3 (content is independent of code).
- Discovery Expert tier
- FCP Discovery Pack (based on existing assessment templates)
- Discovery Pack framework for community creation
- Discovery Pack validation pipeline (Section 12.6)
- Workflow Builder integration (discovery → workflow templates)
- Cross-workflow intelligence integration
- **Acceptance tests:** Full FCP discovery validated by FCP domain experts

### 12.5 Phase 5 — Intelligence & Scale (Sprint 11+, ~20 developer-days)
**Depends on:** Phase 4 complete (Expert tier + at least one Pack working). Benchmark data framework requires sufficient user adoption (~50+ completed sessions).
- Additional domain Discovery Packs
- Feedback loop implementation (30-day follow-up cycle)
- Apprentice model integration for discovery improvement
- Benchmark data framework (anonymized, opt-in)
- Advanced module matching (confidence calibration from feedback data)
- Marketplace integration for Discovery Packs
- **Acceptance tests:** Feedback loop produces measurable improvement in match quality

### 12.6 Discovery Pack Validation Pipeline

Community-created Discovery Packs must pass validation before marketplace listing:

**Automated checks:**
- Schema validation: All required fields present with correct types
- Question coverage: Minimum question count per section
- Module references: All referenced moduleIds exist in the platform
- No harmful content: Automated content screening

**Peer review:**
- At least 2 community reviewers test the pack with realistic personas
- Reviewers rate: question quality, recommendation relevance, output usefulness
- Minimum average rating of 3.5/5.0 to publish

**Domain expert review (optional but flagged):**
- Packs for regulated domains (FCP, Healthcare, Legal) are flagged for expert review
- Expert reviewers validate domain accuracy and regulatory alignment

### 12.7 Testing Strategy

**Unit tests:**
- Module matching algorithm: Given specific user profiles, assert expected module rankings
- Pain quantification: Given specific inputs, assert correct cost calculations
- Tier boundary logic: Assert correct behavior when users exceed tier scope

**Integration tests:**
- Full conversation flow: Automated walk-through of each tier with test personas
- Save/resume: Start session, kill process, resume, verify state integrity
- Export pipeline: Generate output, export to each format, verify formatting

**Performance tests (Phase 3+):**
- Concurrent session load: 50 simultaneous Lite sessions, verify response time <3 seconds per turn
- Expert tier state: 2MB DiscoveryState object, verify save/load <500ms
- Output generation: Professional tier output (25 pages), verify generation <60 seconds
- SSE stability: Insight panel connection maintained for 4+ hours without memory leaks

**User acceptance tests:**
- 10 diverse personas (different roles, sectors, sizes, readiness levels)
- Each persona walks through Discovery Lite and rates output quality
- 3 team simulations for Standard tier
- 1 full Professional/Expert session with real organizational context

**Acceptance test persona definitions (Phase 1):**
The 10 test personas must cover the following dimensions to validate matching breadth:

| # | Persona | Sector | Size | AI Experience | Expected Top Module Area |
|---|---------|--------|------|--------------|-------------------------|
| 1 | Compliance analyst | Banking | Large | Basic | FCP (Area 1) |
| 2 | Solo marketing consultant | Consulting | 1 person | Intermediate | Consulting (Area 4) |
| 3 | Head of legal | Insurance | Mid-size | None | Legal (Area 2) |
| 4 | Startup CTO | Tech | Small | Advanced | Software Dev (Area 10) |
| 5 | HR director | Manufacturing | Large | None | HR (Area 12) |
| 6 | Academic researcher | University | Large | Intermediate | Academic (Area 20) |
| 7 | Healthcare administrator | Hospital | Large | Basic | Healthcare (Area 14) |
| 8 | Tax accountant | Accounting firm | Small | None | Tax (Area 5) |
| 9 | Government policy analyst | Public sector | Large | Basic | Public Sector (Area 15) |
| 10 | Freelance writer | Creative | 1 person | Advanced | Creative (Area 22) |

Each walk-through passes if: (a) conversation feels natural and relevant, (b) module matches align with expected area, (c) output is actionable and specific to the persona, (d) completion time <25 minutes.

**Quality metrics monitored in production:**
- Conversation abandonment rate by phase (identifies confusing questions)
- Average confidence score of recommendations (identifies weak matching areas)
- Time-per-phase variance (identifies sections that take too long)
- Follow-up feedback scores (identifies recommendation quality issues)

### 12.7.1 State Migration Strategy

When the DiscoveryState interface changes between versions (new fields, renamed fields, structural changes):

- **Additive changes** (new optional fields): No migration needed. Old sessions missing new fields use default values. This is the preferred change type.
- **Non-breaking changes** (renamed fields, type changes): Migration function runs on session load. Each migration is a versioned function: `migrateV1toV2(state)`, `migrateV2toV3(state)`. Migrations chain: a v1 session loaded on v3 platform runs both migrations in sequence.
- **Breaking changes** (removed fields, structural reorganization): Avoided if possible. If unavoidable, old sessions are read-only (can view output but cannot resume). User is offered "Start fresh with imported context" which creates a new session pre-populated with key findings from the old one.
- **Version tracking:** `DiscoveryState` gains a `schemaVersion: number` field (default 1 for existing sessions). Each migration increments the version.

### 12.8 Mobile & Responsive Considerations

Discovery Lite is the most likely candidate for mobile use (solo users, quick exploration). The UI must work well on screens down to 375px width:

- Progress panel collapses to a top progress bar on mobile
- Insight panel becomes a collapsible bottom sheet
- Conversation is full-width, optimized for thumb typing
- Tier selection cards stack vertically
- Output review uses tab navigation instead of split view
- Export actions collapse into a dropdown menu

Standard and above are primarily desktop experiences but should remain functional on tablet (768px+).

### 12.9 Accessibility

Discovery must be usable by people with disabilities. This is both an ethical requirement and, for public sector and enterprise clients, often a legal one.

- **WCAG 2.1 AA compliance** as the baseline target for the conversation interface and output viewer
- **Keyboard navigation:** All discovery interactions (tier selection, answering questions, navigating output) must be fully keyboard-accessible. No mouse-only interactions.
- **Screen reader compatibility:** Conversation messages, progress indicators, and insight panel updates must be announced to screen readers via ARIA live regions
- **Color contrast:** All text meets 4.5:1 contrast ratio minimum. Pain level indicators (red/yellow/green in the workshop) use shape and label in addition to color
- **Focus management:** When ANTON responds, focus moves to the new message. When phase transitions occur, focus moves to the transition summary.
- **Reduced motion:** Progress animations and insight panel transitions respect `prefers-reduced-motion` media query
- **Implementation note:** Accessibility is a Phase 1 requirement for the conversation interface. Output viewer accessibility follows in Phase 2. Full WCAG audit in Phase 3.

---

## 13. Success Metrics for Discover Mode

### 13.1 Core Metrics

| Metric | Target | How Measured |
|--------|--------|-------------|
| Discovery completion rate | >70% of started sessions | Session status tracking |
| Module trial rate post-discovery | >60% try recommended module within 7 days | Session → module usage tracking |
| User satisfaction with recommendations | >4.0/5.0 | Post-discovery feedback |
| Time to first module use (new users) | <30 min from start of Lite discovery | Session timing |
| Discovery-to-adoption conversion | >40% of discovered opportunities actioned within 90 days | Follow-up tracking |
| Repeat discovery rate | >30% upgrade to deeper tier within 60 days | Tier progression tracking |

### 13.2 Leading Indicators (Phase 1)

Track these from day one — they predict whether core metrics will be met:

| Indicator | Warning Threshold | Action If Breached |
|-----------|------------------|-------------------|
| Phase 1 (context) drop-off rate | >20% abandon before Phase 2 | Review anchoring questions — too many? Too personal? |
| Average questions before first module match | >12 questions with no match at >0.6 confidence | Module metadata may be too sparse; enrich descriptions |
| "Skip to next phase" usage | >30% of sessions skip a phase | That phase's questions may not feel relevant — review |
| Time-per-phase standard deviation | >2x median | Some users are getting stuck — add more examples/prompts |

### 13.3 Consultant & Advisory Metrics (Phase 3+)

If Discovery is used as a consulting service delivery tool:

| Metric | Target | How Measured |
|--------|--------|-------------|
| Discovery-to-engagement conversion | >50% of Standard/Professional discoveries lead to follow-on work | CRM integration or manual tracking |
| Client NPS post-discovery | >50 | Post-engagement survey |
| Time from workshop to deliverable | <3 business days for Standard, <7 for Professional | Output creation timestamp |
| Discovery cascade rate | >25% of organizations run discovery for a second team within 90 days | Session tracking by organization |

---

## 14. Summary

Discover is how openEXPERT meets people where they are. Not everyone knows they need a "SAR Narrative Generator" or a "BWRA Framework Designer." But everyone knows their work has pain points, time wasters, and quality challenges.

Discover translates from the language of work ("I spend 3 hours copying data between systems for every investigation") to the language of solution ("ANTON's Alert Triage Assistant with Data Enrichment workflow can automate 80% of that data gathering, saving your team 45 hours per week").

It is simultaneously:
- **The best onboarding experience** — users discover the platform by using it
- **A sales tool** — for consultants helping clients adopt AI
- **A consulting delivery tool** — advisory firms can run Discovery as a billable engagement, using ANTON to produce client-branded reports that demonstrate immediate value while introducing the platform
- **A strategy tool** — for organizations planning AI transformation
- **A democratization tool** — making AI adoption accessible to anyone, regardless of technical expertise
- **A demonstration of ANTON's value** — the discovery experience itself shows what expert-guided AI feels like
- **A cascade engine** — results from one team's discovery inform and accelerate discovery for adjacent teams, creating organizational momentum

Most importantly, it starts with the work and the people — not the technology. That is what makes it different from every "AI features" page on every SaaS product.

---

*"Every successful AI implementation starts with the problem, not the solution."*

---
