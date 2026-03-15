import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import Anthropic from '@anthropic-ai/sdk';
import { callChat, mapModelToProvider } from './provider-router.js';

// ── Types ────────────────────────────────────────────────────────────────

export type DiscoveryTier = 'lite' | 'standard' | 'professional' | 'expert';
export type DiscoveryPhase = 'context' | 'work_mapping' | 'pain_finding' | 'readiness' | 'opportunity_mapping' | 'action_planning';
export type DiscoveryStatus = 'active' | 'paused' | 'completed' | 'abandoned';

export interface WorkActivity {
  id: string;
  description: string;
  frequency: string;
  duration: string;
  importance: number;  // 1-5
  painLevel: number;   // 1-5
  systems?: string[];
  monthlyHours?: number;
}

export interface PainPoint {
  id: string;
  description: string;
  theme: string;
  impact: 'high' | 'medium' | 'low';
  frequency: 'daily' | 'weekly' | 'monthly' | 'occasional';
  affectedPeople?: number;
  timeWastedPerWeek?: number;
  relatedActivities: string[];
}

export interface ReadinessScores {
  technology: number;    // 0-25
  peopleCulture: number; // 0-25
  governance: number;    // 0-25
  leadership: number;    // 0-25
  total: number;         // 0-100
  level: 'foundation' | 'developing' | 'prepared' | 'advanced';
  criticalGaps: string[];
}

export interface ModuleMatch {
  moduleId: string;
  moduleName: string;
  areaId: string;
  areaName: string;
  matchReason: string;
  estimatedTimeSavings: string;
  confidenceScore: number;
  effortToStart: 'immediate' | 'some_setup' | 'significant_setup';
  bestFor: string;
}

export interface NonAiFinding {
  id: string;
  description: string;
  realSolution: string;
  aiRole: string;
  priority: 'high' | 'medium' | 'low';
  isPrerequisiteForAi: boolean;
}

export interface Opportunity {
  id: string;
  name: string;
  description: string;
  category: string;
  effort: number;        // 1-5
  impact: number;        // 1-5
  priorityScore: number;
  quadrant: 'quick_win' | 'strategic' | 'nice_to_have' | 'consider_later';
  estimatedTimeSavings: string;
  matchedModules: ModuleMatch[];
  isAiSolution: boolean;
}

export interface WorkflowStep {
  id: string;
  order: number;
  description: string;
  system: string;
  timeMinutes: number;
  painLevel: number;
}

export interface WorkflowMap {
  id: string;
  name: string;
  steps: WorkflowStep[];
  totalTime: number;
  thinkingTime: number;
  gatheringTime: number;
  formattingTime: number;
  frequency: string;
  systemsAccessed: string[];
  painSteps: string[];
  automationPotential: 'high' | 'medium' | 'low';
}

export interface PhaseSummary {
  phase: string;
  summary: string;
  keyFindings: string[];
  tokenCount: number;
  createdAt: string;
}

export interface IntegrationAssessment {
  systemName: string;
  systemType: string;
  dataFlows: string[];
  integrationLevel: 'none' | 'manual' | 'batch' | 'real_time';
  aiReadiness: 'ready' | 'needs_work' | 'blocking';
  notes: string;
}

export interface GovernanceItem {
  area: string;
  currentState: string;
  recommendation: string;
  priority: 'high' | 'medium' | 'low';
  effort: string;
}

export interface BusinessCaseItem {
  category: string;
  description: string;
  estimatedAnnualBenefit: number;
  estimatedCost: number;
  roi: number;
  timeToValue: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface DiscoveryPack {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  activationKeywords: string[];
  activationRoles: string[];
  activationIndustries: string[];
  questionSets: Array<{
    id: string;
    phase: string;
    questions: Array<{
      id: string;
      text: string;
      context: string;
      exampleAnswer: string;
    }>;
  }>;
  painPatterns: Array<{
    id: string;
    name: string;
    description: string;
    indicators: string[];
    typicalImpact: string;
    suggestedModules: string[];
  }>;
}

export interface DiscoveryState {
  tier: DiscoveryTier;
  phase: DiscoveryPhase;

  userProfile: {
    role: string;
    industry: string;
    organizationSize: string;
    aiExperience: 'none' | 'basic' | 'intermediate' | 'advanced';
    previousAiAttempts?: string;
    jurisdiction?: string;
  };

  workActivities: WorkActivity[];
  painPoints: PainPoint[];
  workflows: WorkflowMap[];
  readinessScores: ReadinessScores;
  opportunities: Opportunity[];
  nonAiFindings: NonAiFinding[];

  // Phase 3: Professional tier
  integrationAssessment: IntegrationAssessment[];
  governanceItems: GovernanceItem[];
  businessCase: BusinessCaseItem[];
  executiveBriefing: string;

  // Phase 4: Expert tier
  activePack: string | null;
  packData: Record<string, unknown>;

  // Phase 5: Follow-up
  followUpScheduled: boolean;

  inferredNeeds: string[];
  suggestedModules: ModuleMatch[];
  sectorContext: string;
  confidenceLevel: number;

  completedPhases: string[];
  currentPhaseProgress: number;
  canGenerateOutput: boolean;

  conversationHistory: Array<{ role: 'assistant' | 'user'; content: string }>;
  phaseSummaries: PhaseSummary[];
  totalTokensUsed: number;
  contextStrategy: 'full' | 'summarized' | 'chunked';
  schemaVersion: number;
}

// ── Phase Configuration ──────────────────────────────────────────────────

const PHASE_CONFIG: Record<DiscoveryTier, DiscoveryPhase[]> = {
  lite: ['context', 'work_mapping', 'pain_finding', 'readiness', 'action_planning'],
  standard: ['context', 'work_mapping', 'pain_finding', 'readiness', 'opportunity_mapping', 'action_planning'],
  professional: ['context', 'work_mapping', 'pain_finding', 'readiness', 'opportunity_mapping', 'action_planning'],
  expert: ['context', 'work_mapping', 'pain_finding', 'readiness', 'opportunity_mapping', 'action_planning'],
};

const PHASE_LABELS: Record<DiscoveryPhase, string> = {
  context: 'Understanding You',
  work_mapping: 'Mapping Your Work',
  pain_finding: 'Finding Pain Points',
  readiness: 'Readiness Check',
  opportunity_mapping: 'Mapping Opportunities',
  action_planning: 'Building Your Plan',
};

// ── Default State Factory ────────────────────────────────────────────────

function createDefaultState(tier: DiscoveryTier): DiscoveryState {
  return {
    tier,
    phase: 'context',
    userProfile: {
      role: '',
      industry: '',
      organizationSize: '',
      aiExperience: 'none',
    },
    workActivities: [],
    painPoints: [],
    workflows: [],
    readinessScores: {
      technology: 0,
      peopleCulture: 0,
      governance: 0,
      leadership: 0,
      total: 0,
      level: 'foundation',
      criticalGaps: [],
    },
    opportunities: [],
    nonAiFindings: [],
    integrationAssessment: [],
    governanceItems: [],
    businessCase: [],
    executiveBriefing: '',
    activePack: null,
    packData: {},
    followUpScheduled: false,
    inferredNeeds: [],
    suggestedModules: [],
    sectorContext: '',
    confidenceLevel: 0,
    completedPhases: [],
    currentPhaseProgress: 0,
    canGenerateOutput: false,
    conversationHistory: [],
    phaseSummaries: [],
    totalTokensUsed: 0,
    contextStrategy: 'full',
    schemaVersion: 1,
  };
}

// ── Discovery Guide System Prompt ────────────────────────────────────────

const DISCOVERY_SYSTEM_PROMPT = `You are ANTON's Discovery Guide. Your role is to help users understand where AI creates the most value in their work through structured but conversational questioning, active listening, and intelligent analysis.

You are not selling AI — you are helping people see their work clearly and identifying genuine opportunities. If AI isn't the right solution for a pain point, say so. Recommend process redesign, integration, or training where those are better answers.

PERSONA: Discovery Guide

CORE TRAITS:
- Warm and curious, not clinical or mechanical
- Structured in thinking, conversational in delivery
- Practical — every question has a purpose, every insight leads to action
- Honest — willing to say "AI isn't the answer here"
- Adaptive — calibrates language, depth, and pace to the user

BEHAVIORAL RULES:

1. REFLECTION: After every substantive user response, briefly reflect back what you heard before asking the next question.

2. ONE QUESTION AT A TIME: Never ask compound questions. Ask one thing, then listen.

3. EXAMPLES: When asking for information, provide a concrete example from a similar context.

4. PHASE TRANSITIONS: When moving between phases, summarize what you've learned and preview what's next.

5. CLASSIFICATION: When a user describes a pain point, classify whether it's an AI problem, integration problem, process problem, or people problem.

6. PROBING: When answers are vague, probe gently with specifics.

7. OFF-SCRIPT: If the user raises something unexpected, follow the thread, capture the information, then gently return.

8. HONESTY: If you don't have enough info for a confident recommendation, say so.

9. GRACEFUL EXIT: If the user wants to stop, respect it immediately. Generate abbreviated output from available data.

10. EMOTIONAL AWARENESS: Discovery can surface frustration when people realize how much time they waste. Acknowledge it positively.

IMPORTANT FORMATTING RULES:
- Keep responses concise — typically 2-4 short paragraphs
- Use plain language, not jargon
- Never use markdown headers in conversation turns (save those for the final report)
- You may use bold for emphasis sparingly
`;

// ── Phase-specific prompts ───────────────────────────────────────────────

function getPhasePrompt(phase: DiscoveryPhase, tier: DiscoveryTier, state: DiscoveryState): string {
  const turnCount = state.conversationHistory.filter(m => m.role === 'user').length;

  switch (phase) {
    case 'context':
      if (turnCount === 0) {
        return `CURRENT PHASE: Understanding You (Phase 1)
This is the very first message. Start the discovery conversation with Anchor Question 1:
"Let's start with you. What's your role, and what kind of organization do you work in? For example: 'compliance analyst at a mid-size bank' or 'solo marketing consultant' or 'head of operations at a health-tech startup.'"
Be warm and welcoming. Keep it brief.`;
      }
      if (turnCount === 1) {
        return `CURRENT PHASE: Understanding You (Phase 1)
The user just told you their role/organization. Extract: role, seniority, industry, org size, regulatory context.
Now ask Anchor Question 2: "In one sentence, what's the single biggest frustration in your work right now?"
Briefly reflect back what you learned from their first answer.`;
      }
      if (turnCount === 2) {
        return `CURRENT PHASE: Understanding You (Phase 1)
The user shared their biggest frustration. This is the emotional center of gravity.
Now ask Anchor Question 3: "Have you tried using AI tools for your work before? If so, what happened?"
Reflect back their frustration empathetically.`;
      }
      return `CURRENT PHASE: Understanding You (Phase 1)
You have the three anchoring answers. Extract AI experience level. If you have enough context, summarize what you've learned and transition to Phase 2 (Work Mapping).
Say something like: "Great — I now have a good picture of your context. Let me understand your day-to-day work better..."
Then ask about their top 3-5 work activities that fill most of their week.

IMPORTANT: When you're ready to transition, include this exact marker on its own line at the END of your message:
[PHASE_COMPLETE:context]`;

    case 'work_mapping':
      if (tier === 'lite') {
        return `CURRENT PHASE: Mapping Your Work (Phase 2)
Keep this phase brief — 2-3 exchanges max. Focus on top 5-7 activities with rough time/pain ratings.

Ask about:
- Their top work activities and how much time each takes
- Which activities are most painful or frustrating
- Which systems/tools they use
- How much time is thinking/analysis vs gathering data vs formatting/reporting

When you've mapped enough activities (at least 3-5), summarize and transition to Phase 3.
Include this marker when ready: [PHASE_COMPLETE:work_mapping]`;
      }
      return `CURRENT PHASE: Mapping Your Work (Phase 2) — Standard+ Depth
Map activities thoroughly. For Standard tier and above, also do a WORKFLOW WALK-THROUGH:

Step 1: Ask about their top 5-7 work activities with time, frequency, systems, and pain ratings.
Step 2: For the 1-2 most painful activities, do a step-by-step workflow walk-through:
  - Walk through the process from start to finish
  - For each step: what system, how long, what's the pain level?
  - Ask: "Of the total time, how much is THINKING (actual analysis), GATHERING (finding/copying data), and FORMATTING (writing up results)?"
  - This Thinking/Gathering/Formatting split is critical — it reveals where AI can help most

Step 3: Summarize findings including:
  - Total hours per week across all activities
  - Which workflows have the highest automation potential
  - Where the Gathering and Formatting time is highest (AI sweet spots)

When you've mapped enough activities (at least 5) AND walked through at least 1 workflow in detail, summarize and transition.
Include this marker when ready: [PHASE_COMPLETE:work_mapping]`;

    case 'pain_finding':
      if (tier === 'lite') {
        return `CURRENT PHASE: Finding Pain Points (Phase 3)
Focus on top 3 pain points with impact classification.

For each pain point, classify it:
- AI problem (text analysis, data consolidation, drafting, pattern detection)
- Integration problem (systems not talking to each other)
- Process problem (inefficient workflow design)
- People problem (skills gap, organizational friction)

IMPORTANT: Be honest about what AI can and cannot solve.

When you have enough pain points mapped (at least 3), summarize and move to Phase 4.
Include this marker: [PHASE_COMPLETE:pain_finding]`;
      }
      return `CURRENT PHASE: Finding Pain Points (Phase 3) — Standard+ Depth with Pain Quantification
Go deeper — quantify time waste, classify root causes, identify patterns.

For EACH pain point:
1. Classify root cause: AI problem, integration problem, process problem, or people problem
2. QUANTIFY the impact:
   - Direct cost: How many hours/week wasted? At what loaded hourly rate? (If unknown, use EUR 75/hour as default)
   - Opportunity cost: What could the team do instead? What's being delayed?
   - Risk exposure: Does this pain create compliance risk, quality risk, or reputational risk?
3. Identify who is affected: How many people? Which roles?
4. Note frequency: daily, weekly, monthly?

After mapping pain points, CLUSTER them by theme:
- "Data hunting" — gathering information from multiple systems
- "Repetitive work" — doing the same thing repeatedly with minor variations
- "Quality uncertainty" — not knowing if output meets standards
- "Knowledge gaps" — not having access to the right expertise
- etc.

Calculate a TOTAL ADDRESSABLE PAIN figure:
"Based on what you've shared, your team is spending approximately X hours per week (Y EUR/year) on addressable pain points."

When you have at least 5 pain points mapped with quantification, summarize and move on.
Include this marker: [PHASE_COMPLETE:pain_finding]`;

    case 'readiness':
      if (tier === 'lite') {
        return `CURRENT PHASE: Readiness Check (Phase 4)
Quick 5-question readiness check across technology, people, governance, leadership.

Ask about:
1. Technology: Do they have the technical infrastructure? Data accessibility?
2. People: Is the team open to AI? Any champions or resistors?
3. Governance: Are there policies about AI use? Compliance requirements?
4. Leadership: Is management supportive? Budget available?
5. Data: Is their data organized? Digital or paper-based?

Based on answers, mentally score each dimension 0-25 (total 0-100).

When done, summarize readiness and transition to action planning.
Include this marker: [PHASE_COMPLETE:readiness]`;
      }
      if (tier === 'professional' || tier === 'expert') {
        return `CURRENT PHASE: Readiness Check (Phase 4) — Professional/Expert Depth

In addition to the standard readiness dimensions, assess:

TECHNOLOGY DEEP DIVE:
- What systems/platforms are currently in use? List them.
- How are they integrated? (manual, batch, real-time, API)
- Data quality: Is data clean, consistent, accessible?
- Infrastructure: Cloud vs on-prem? API capabilities?

INTEGRATION ASSESSMENT:
- For each major system: what data flows in/out?
- Where are the integration gaps? Which are blocking AI adoption?
- What would it take to connect disconnected systems?

GOVERNANCE FRAMEWORK:
- Existing AI policies or guidelines?
- Data privacy and security requirements (GDPR, sector-specific)?
- Model risk management requirements?
- Ethical AI considerations?
- Regulatory requirements around AI use?

PEOPLE & CHANGE:
- AI champions vs skeptics? Key influencers?
- Skills gap assessment: what training is needed?
- Change management capacity: has the org done transformations before?

LEADERSHIP & BUDGET:
- Executive sponsor identified?
- Budget allocated or needs business case?
- Timeline expectations?
- Risk appetite for AI adoption?

Score each dimension 0-25. For Professional, also produce:
- Integration assessment entries for each system mentioned
- Governance recommendations
- Skills gap summary

When done, summarize readiness comprehensively and transition.
Include this marker: [PHASE_COMPLETE:readiness]`;
      }
      return `CURRENT PHASE: Readiness Check (Phase 4)
Detailed readiness assessment.

Ask about:
1. Technology: Do they have the technical infrastructure? Data accessibility?
2. People: Is the team open to AI? Any champions or resistors?
3. Governance: Are there policies about AI use? Compliance requirements?
4. Leadership: Is management supportive? Budget available?
5. Data: Is their data organized? Digital or paper-based?

Based on answers, mentally score each dimension 0-25 (total 0-100).

When done, summarize readiness and transition.
Include this marker: [PHASE_COMPLETE:readiness]`;

    case 'opportunity_mapping':
      return `CURRENT PHASE: Mapping Opportunities (Phase 5)
Based on everything learned, identify and prioritize opportunities using a PRIORITY MATRIX:

QUADRANTS:
- **Quick Wins** (low effort, high impact) — Start here
- **Strategic** (high effort, high impact) — Plan for these
- **Nice-to-Have** (low effort, low impact) — Do when convenient
- **Consider Later** (high effort, low impact) — Deprioritize

For each opportunity:
1. Name and describe it clearly
2. Link to specific pain point(s) it addresses
3. Rate effort (1-5) and impact (1-5)
4. Estimate time savings (hours/week or month)
5. Classify: Is this an AI solution, or a non-AI finding?
6. If AI: which specific ANTON module(s) would help?
7. If non-AI: what's the real solution? (integration, training, process redesign)
8. What prerequisites are needed? (data access, system changes, training)

${tier !== 'lite' ? `IMPORTANT for Standard+ tiers:
- Explicitly separate AI opportunities from non-AI findings
- For non-AI findings, explain what needs to happen BEFORE AI can help
- Identify quick wins that can demonstrate value within 30 days
- Group opportunities by theme or workflow` : ''}

${(tier === 'professional' || tier === 'expert') ? `
PROFESSIONAL/EXPERT ADDITIONS:
- Build a BUSINESS CASE for the top 3-5 opportunities:
  * Estimated annual benefit (hours saved × loaded rate + risk reduction)
  * Implementation cost (licenses, training, integration effort)
  * ROI calculation: (Annual Benefit - Annual Cost) / Annual Cost × 100
  * Time to value: When will the organization see returns?
  * Confidence level: How confident are you in these estimates?
- Generate GOVERNANCE recommendations for AI adoption
- Produce a PHASED ROADMAP: 30-day / 60-day / 90-day / 6-month / 12-month
- Include CHANGE MANAGEMENT considerations
- Identify PREREQUISITES that must be addressed before AI rollout` : ''}

Present the priority matrix to the user and confirm alignment before moving to action planning.
Include this marker when ready: [PHASE_COMPLETE:opportunity_mapping]`;

    case 'action_planning':
      if (tier === 'professional' || tier === 'expert') {
        return `CURRENT PHASE: Building Your Plan (Phase 6) — Professional/Expert Depth

This is the final conversational phase. Based on everything discussed:

1. Present the EXECUTIVE BRIEFING — a 1-paragraph summary suitable for sharing with leadership
2. Review the BUSINESS CASE — confirm ROI calculations and assumptions
3. Walk through the PHASED ROADMAP:
   - 30 days: Quick wins + foundation (specific modules, specific actions)
   - 60 days: Build momentum (additional modules, team training)
   - 90 days: Scale and optimize (full workflow integration)
   - 6 months: Measure and expand (ROI validation, adjacent teams)
   - 12 months: Transformation (full function transformation plan)
4. Discuss GOVERNANCE requirements before rollout
5. Confirm the user is ready for report generation

When the user confirms they're ready for the report, include: [PHASE_COMPLETE:action_planning]`;
      }
      return `CURRENT PHASE: Building Your Plan (Phase 6)
This is the final conversational phase. Based on everything discussed:
1. Confirm the top 3 priorities with the user
2. Suggest a specific first step (the "quick win")
3. Ask if they'd like you to generate the full discovery report

When the user confirms they're ready for the report, include: [PHASE_COMPLETE:action_planning]`;

    default:
      return '';
  }
}

// ── Module Matching ──────────────────────────────────────────────────────
// This is a simplified version for Phase 1 (Lite). AI-powered matching happens
// in the output generation step. This provides structural data for the system prompt.

function getModuleContext(): string {
  return `You have access to openEXPERT's module library with 240+ expert modules across 30 professional areas including:

AREA: Financial Crime Prevention (FCP) — Modules: AMLR Gap Analysis, Document Creation, Sanctions Advisory, Regulatory Monitor, Training Content, Data Management, Risk Assessment, Investigation Support, and many more
AREA: Legal & Compliance — Contract review, regulatory analysis, policy drafting, compliance monitoring
AREA: Audit & Assurance — Internal audit planning, test procedures, findings documentation
AREA: Consulting — Engagement proposals, methodology frameworks, deliverable creation
AREA: Banking — Credit analysis, risk modeling, regulatory reporting
AREA: Risk Management — Risk assessment, control evaluation, incident analysis
AREA: Cyber Security — Threat assessment, policy review, incident response
AREA: ESG & Sustainability — ESG reporting, gap analysis, stakeholder communication
AREA: Investment — Portfolio analysis, due diligence, market research
AREA: Strategy — Business planning, competitive analysis, transformation roadmaps
AREA: Data & Analytics — Data quality assessment, analytics strategy, dashboard design
AREA: Project Management — Project planning, status reporting, resource management
AREA: Startups — Business planning, pitch decks, market validation
AREA: Personal Development — Career planning, skill assessment, learning paths
AREA: Academic — Research methodology, literature review, paper drafting
AREA: Communications & PR — Content strategy, press releases, stakeholder comms
AREA: HR — Job descriptions, performance frameworks, policy development
AREA: Accounting — Tax advisory, financial reporting, audit preparation
AREA: Branding — Brand strategy, visual identity, messaging framework
AREA: Software Engineering — Architecture review, code documentation, technical specs
AREA: Sales — Proposal writing, pipeline analysis, competitive positioning
AREA: Insurance — Risk assessment, claims analysis, policy review
AREA: Real Estate — Market analysis, investment assessment, due diligence
AREA: Personal Finance — Financial planning, investment analysis, tax optimization
AREA: Healthcare — Clinical documentation, compliance, quality management
AREA: Manufacturing — Process optimization, quality control, supply chain
AREA: Public Sector — Policy analysis, grant writing, regulatory compliance
AREA: Consumer Legal — Contract review, dispute resolution, rights analysis
AREA: Education — Curriculum design, assessment creation, learning materials
AREA: Operations — Process improvement, capacity planning, vendor management

When recommending modules, be specific about which area and module type would help, and explain WHY it matches the user's described pain point. Only recommend modules you're confident about (>0.6 confidence). Max 5 recommendations for Lite tier.`;
}

// ── State Extraction Prompt ──────────────────────────────────────────────

function getStateExtractionPrompt(state: DiscoveryState): string {
  return `After generating your conversational response, also produce a JSON state update.
This must be on a SEPARATE line at the very end of your response, prefixed with [STATE_UPDATE]:

Format: [STATE_UPDATE]:{"phase":"current_phase","userProfile":{...},"workActivities":[...],"workflows":[...],"painPoints":[...],"readinessScores":{...},"opportunities":[...],"nonAiFindings":[...],"integrationAssessment":[...],"governanceItems":[...],"businessCase":[...],"executiveBriefing":"...","activePack":"pack_id_or_null","packData":{...},"inferredNeeds":[...],"sectorContext":"...","confidenceLevel":0.X,"currentPhaseProgress":N,"canGenerateOutput":bool}

Only include fields that have changed or been newly discovered. Partial updates are fine.
The currentPhaseProgress should be 0-100 representing how far along the current phase is.
Set canGenerateOutput to true once you have at least: user profile, 3+ work activities, 2+ pain points.

Current accumulated state:
- Role: ${state.userProfile.role || 'unknown'}
- Industry: ${state.userProfile.industry || 'unknown'}
- AI Experience: ${state.userProfile.aiExperience}
- Work Activities: ${state.workActivities.length} mapped
- Workflows: ${state.workflows.length} mapped in detail
- Pain Points: ${state.painPoints.length} identified
- Integration Assessment: ${state.integrationAssessment.length} systems mapped
- Governance Items: ${state.governanceItems.length} recommendations
- Business Case Items: ${state.businessCase.length} items
- Active Pack: ${state.activePack || 'none'}
- Phase: ${state.phase}
- Progress: ${state.currentPhaseProgress}%`;
}

// ── Output Generation Prompt ─────────────────────────────────────────────

function getOutputGenerationPrompt(state: DiscoveryState): string {
  const tier = state.tier;

  if (tier === 'lite') {
    return `Generate a "Personal AI Starter Map" based on the discovery conversation.

USER PROFILE:
${JSON.stringify(state.userProfile, null, 2)}

WORK ACTIVITIES:
${JSON.stringify(state.workActivities, null, 2)}

PAIN POINTS:
${JSON.stringify(state.painPoints, null, 2)}

READINESS:
${JSON.stringify(state.readinessScores, null, 2)}

INFERRED NEEDS:
${JSON.stringify(state.inferredNeeds, null, 2)}

CONVERSATION CONTEXT:
${state.phaseSummaries.map(s => s.summary).join('\n\n')}

${getModuleContext()}

Generate the following Markdown document:

# Your AI Starter Map
## Prepared for [Name/Role] at [Organization]
## [Today's Date]

### Your Profile
[Brief summary of context, role, industry — 2-3 sentences]

### Your Top Pain Points
[Numbered list with impact description for each. Include time estimates where shared.]

### Recommended Starting Points

#### Quick Win: [Most Immediately Actionable Module]
**Why:** [Direct connection to their specific pain point]
**What it does:** [Plain language, 1-2 sentences]
**Estimated time savings:** [Specific to their situation]
**Area:** [Which openEXPERT area this belongs to]

#### Next Step: [Second Priority Module]
[Same structure]

#### When Ready: [Third Priority — may need some setup]
[Same structure]

### Non-AI Findings
[If any pain points are better solved without AI, list them here with recommended approaches]

### Your Readiness Snapshot
- Technology: [Score interpretation]
- People & Culture: [Score interpretation]
- Governance: [Score interpretation]
- Leadership: [Score interpretation]
- Overall: [Level] — [What this means]

### One Thing to Do This Week
[Single, specific, achievable action that starts their AI journey]

---
*Generated by ANTON Discovery | openEXPERT*

IMPORTANT: Also output a JSON block at the end with structured data:
[DISCOVERY_OUTPUT]:{"moduleMatches":[{"moduleId":"...","moduleName":"...","areaId":"...","areaName":"...","matchReason":"...","estimatedTimeSavings":"...","confidenceScore":0.X,"effortToStart":"immediate|some_setup|significant_setup","bestFor":"..."}],"actionPlan":[{"action":"...","owner":"...","timeline":"...","priority":"high|medium|low"}],"metrics":{"totalTimeSavingsPerMonth":"...","topOpportunityValue":"...","readinessScore":N},"nonAiFindings":[{"description":"...","realSolution":"...","priority":"high|medium|low"}]}`;
  }

  if (tier === 'standard') {
    return `Generate a "Team AI Opportunity Report" based on the discovery conversation.

USER PROFILE:
${JSON.stringify(state.userProfile, null, 2)}

WORK ACTIVITIES:
${JSON.stringify(state.workActivities, null, 2)}

WORKFLOWS:
${JSON.stringify(state.workflows, null, 2)}

PAIN POINTS:
${JSON.stringify(state.painPoints, null, 2)}

READINESS:
${JSON.stringify(state.readinessScores, null, 2)}

OPPORTUNITIES:
${JSON.stringify(state.opportunities, null, 2)}

NON-AI FINDINGS:
${JSON.stringify(state.nonAiFindings, null, 2)}

INFERRED NEEDS:
${JSON.stringify(state.inferredNeeds, null, 2)}

CONVERSATION CONTEXT:
${state.phaseSummaries.map(s => s.summary).join('\n\n')}

${getModuleContext()}

Generate the following Markdown document (5-8 pages):

# AI Opportunity Report
## [Team/Department] at [Organization]
## [Today's Date] | Discovery Standard Assessment

### Executive Summary
[3-4 paragraph overview: who, what was found, top opportunities, recommended first steps]

### Team Profile & Context
[Industry, size, regulatory environment, AI maturity level]

### Work Landscape
[Summary of mapped activities and workflows]
[Total hours per week across activities]
[Key finding about Thinking vs Gathering vs Formatting time split]

### Workflow Analysis
[For each mapped workflow: name, steps, time breakdown, pain points, automation potential]

### Pain Point Analysis

#### Prioritized Pain Points
[For each: description, root cause classification, quantified impact, affected people]

#### Pain Theme Clusters
[Group related pain points and identify root causes]

#### Total Addressable Pain
[Total estimated annual cost of addressable pain: X EUR]

### AI Opportunity Portfolio

#### Priority Matrix
| Opportunity | Effort (1-5) | Impact (1-5) | Quadrant | Type |
|---|---|---|---|---|
[Fill with identified opportunities]

#### Use Case Cards (Top 5-10)
[For each: name, current process pain, AI solution, benefit estimate, effort estimate, recommended ANTON modules, prerequisites]

### Non-AI Findings
[Problems that need non-AI solutions: integration, process redesign, training, organizational change]
[For each: what it is, what the real solution is, what AI can do AFTER this is resolved]

### Readiness Assessment
| Dimension | Score (0-25) | Assessment |
|---|---|---|
| Technology | X | [Interpretation] |
| People & Culture | X | [Interpretation] |
| Governance | X | [Interpretation] |
| Leadership | X | [Interpretation] |
| **Total** | **X/100** | **[Level]** |

[Specific gaps to address before or alongside AI adoption]

### 30-Day Action Plan
[Concrete steps numbered 1-5 with owners and success measures]

#### Week 1: Quick Win
[Specific action, specific module, expected result]

#### Week 2-3: Foundation
[Setup actions, team alignment, data access]

#### Week 4: Expand
[Next module to try, team training, measure first results]

### Recommended ANTON Modules
[Matched modules grouped by use case, with reasoning]

---
*Generated by ANTON Discovery | openEXPERT*

IMPORTANT: Also output a JSON block at the end with structured data:
[DISCOVERY_OUTPUT]:{"moduleMatches":[{"moduleId":"...","moduleName":"...","areaId":"...","areaName":"...","matchReason":"...","estimatedTimeSavings":"...","confidenceScore":0.X,"effortToStart":"immediate|some_setup|significant_setup","bestFor":"..."}],"actionPlan":[{"action":"...","owner":"...","timeline":"...","priority":"high|medium|low"}],"metrics":{"totalTimeSavingsPerMonth":"...","totalAddressablePainEUR":"...","topOpportunityValue":"...","readinessScore":${state.readinessScores.total},"workflowsMapped":${state.workflows.length},"painPointsIdentified":${state.painPoints.length}},"nonAiFindings":[{"description":"...","realSolution":"...","priority":"high|medium|low"}]}`;
  }

  if (tier === 'professional') {
    return `Generate an "AI Adoption Roadmap" based on the discovery conversation.

USER PROFILE:
${JSON.stringify(state.userProfile, null, 2)}

WORK ACTIVITIES:
${JSON.stringify(state.workActivities, null, 2)}

WORKFLOWS:
${JSON.stringify(state.workflows, null, 2)}

PAIN POINTS:
${JSON.stringify(state.painPoints, null, 2)}

READINESS:
${JSON.stringify(state.readinessScores, null, 2)}

OPPORTUNITIES:
${JSON.stringify(state.opportunities, null, 2)}

NON-AI FINDINGS:
${JSON.stringify(state.nonAiFindings, null, 2)}

INTEGRATION ASSESSMENT:
${JSON.stringify(state.integrationAssessment, null, 2)}

GOVERNANCE ITEMS:
${JSON.stringify(state.governanceItems, null, 2)}

BUSINESS CASE:
${JSON.stringify(state.businessCase, null, 2)}

INFERRED NEEDS:
${JSON.stringify(state.inferredNeeds, null, 2)}

CONVERSATION CONTEXT:
${state.phaseSummaries.map(s => s.summary).join('\\n\\n')}

${getModuleContext()}

Generate the following Markdown document (15-25 pages):

# AI Adoption Roadmap
## [Organization] — [Department/Function]
## [Today's Date] | Discovery Professional Assessment

### Executive Briefing
[1 paragraph leadership-ready summary: situation, key findings, recommended course of action, expected ROI]

### Executive Summary
[3-5 paragraph overview with key findings, opportunities, and recommended strategy]

### Organizational Profile
[Industry, size, regulatory environment, current technology landscape, AI maturity]

### Current State Assessment

#### Work Landscape
[All mapped activities with hours and pain ratings]
[Key workflows with step-by-step analysis]
[Thinking/Gathering/Formatting time split analysis]

#### Systems Landscape
[All systems identified, their roles, and integration status]
| System | Type | Integration Level | AI Readiness | Notes |
|---|---|---|---|---|
[Fill from integrationAssessment data]

#### Pain Point Analysis
[Prioritized pain points with full quantification]
[Pain theme clusters with root cause analysis]
[Total Addressable Pain: X EUR/year]

### AI Opportunity Portfolio

#### Priority Matrix
| Opportunity | Effort (1-5) | Impact (1-5) | Quadrant | Annual Benefit | ROI |
|---|---|---|---|---|---|
[Fill with opportunities]

#### Detailed Use Cases (Top 10)
[For each: current pain, AI solution, benefit, cost, ROI, recommended modules, prerequisites, timeline]

### Business Case
| Category | Annual Benefit | Implementation Cost | ROI | Time to Value | Confidence |
|---|---|---|---|---|---|
[Fill from businessCase data]

**Total Annual Benefit:** [Sum]
**Total Implementation Cost:** [Sum]
**Overall ROI:** [Calculated]
**Payback Period:** [Calculated]

### Non-AI Findings & Prerequisites
[Problems requiring non-AI solutions]
[Prerequisites that must be addressed before AI rollout]
[Integration work required]

### Readiness Assessment
| Dimension | Score (0-25) | Assessment | Key Actions |
|---|---|---|---|
| Technology | X | [Detail] | [Actions] |
| People & Culture | X | [Detail] | [Actions] |
| Governance | X | [Detail] | [Actions] |
| Leadership | X | [Detail] | [Actions] |
| **Total** | **X/100** | **[Level]** | |

### Governance Recommendations
[AI governance framework suggestions]
[Data privacy and security requirements]
[Model risk management considerations]
[Ethical AI guidelines]

### Implementation Roadmap

#### Phase 1: Quick Wins (Days 1-30)
[Specific modules, specific actions, expected results]

#### Phase 2: Build Momentum (Days 31-60)
[Additional modules, team training, process changes]

#### Phase 3: Scale & Optimize (Days 61-90)
[Full workflow integration, measurement framework]

#### Phase 4: Expand (Months 4-6)
[Adjacent use cases, adjacent teams, ROI validation]

#### Phase 5: Transform (Months 7-12)
[Full function transformation, advanced capabilities]

### Resource Requirements
[FTE requirements, training investment, technology costs]
[Skills gap analysis and development plan]

### Risk Assessment
[Implementation risks and mitigation strategies]
[Change management plan]

### Success Metrics Framework
| Metric | Baseline | 30-Day Target | 90-Day Target | 12-Month Target |
|---|---|---|---|---|
[Fill with measurable metrics]

### Recommended ANTON Modules
[All matched modules with detailed reasoning, grouped by implementation phase]

---
*Generated by ANTON Discovery | openEXPERT*

IMPORTANT: Also output a JSON block at the end:
[DISCOVERY_OUTPUT]:{"moduleMatches":[{"moduleId":"...","moduleName":"...","areaId":"...","areaName":"...","matchReason":"...","estimatedTimeSavings":"...","confidenceScore":0.X,"effortToStart":"immediate|some_setup|significant_setup","bestFor":"..."}],"actionPlan":[{"action":"...","owner":"...","timeline":"...","priority":"high|medium|low","phase":"30_day|60_day|90_day|6_month|12_month"}],"metrics":{"totalTimeSavingsPerMonth":"...","totalAddressablePainEUR":"...","totalAnnualBenefit":"...","totalImplementationCost":"...","overallROI":"...","paybackPeriod":"...","readinessScore":${state.readinessScores.total},"workflowsMapped":${state.workflows.length},"painPointsIdentified":${state.painPoints.length},"systemsMapped":${state.integrationAssessment.length}},"nonAiFindings":[{"description":"...","realSolution":"...","priority":"high|medium|low"}],"executiveBriefing":"...","governanceRecommendations":[{"area":"...","recommendation":"...","priority":"high|medium|low"}],"businessCase":[{"category":"...","annualBenefit":0,"cost":0,"roi":0,"timeToValue":"..."}]}`;
  }

  if (tier === 'expert') {
    // Expert uses Professional template as base, with domain pack enhancements
    const packContext = state.activePack
      ? `\n\nACTIVE DISCOVERY PACK: ${state.activePack}\nPACK DATA: ${JSON.stringify(state.packData, null, 2)}\n\nUse the domain pack's assessment frameworks and pain patterns to enhance the analysis. Include domain-specific sections from the pack's output templates.`
      : '';

    return `Generate a "Function Transformation Plan" based on the discovery conversation.
This is the most comprehensive tier — produce a consulting-grade deliverable (30-50 pages).

${getOutputGenerationPrompt({ ...state, tier: 'professional' }).replace('Generate an "AI Adoption Roadmap"', 'Generate a "Function Transformation Plan"').replace('Discovery Professional Assessment', 'Discovery Expert Assessment').replace('15-25 pages', '30-50 pages')}

ADDITIONAL EXPERT SECTIONS (add these after the Professional template sections):

### Domain-Specific Deep Dive
[Process-by-process analysis with current/future state mapping]
[Domain-specific pain patterns and solutions]
${packContext ? '[Discovery Pack assessment framework results]' : '[General domain analysis based on sector context]'}

### Technology Architecture Recommendations
[Current architecture assessment]
[Target architecture for AI-enabled operations]
[Migration path and technical requirements]

### Training & Capability Building Plan
[Skills assessment by role]
[Training program design]
[Timeline for capability development]

### Detailed Implementation Plan
[Milestones and dependencies]
[Resource allocation by phase]
[Risk mitigation at each stage]

### Regulatory & Compliance Considerations
[Sector-specific regulatory requirements for AI]
[Compliance framework alignment]
[Audit readiness checklist]
${packContext}`;
  }

  // Fallback
  return getOutputGenerationPrompt({ ...state, tier: 'standard' });
}

// ── Insight Generation ───────────────────────────────────────────────────

function getInsightPrompt(state: DiscoveryState): string {
  return `Based on this discovery session state, generate real-time insights.

State: ${JSON.stringify({
    userProfile: state.userProfile,
    workActivities: state.workActivities,
    painPoints: state.painPoints,
    readinessScores: state.readinessScores,
    inferredNeeds: state.inferredNeeds,
    phase: state.phase,
    currentPhaseProgress: state.currentPhaseProgress,
  })}

Return a JSON object:
{
  "topPainTheme": "Brief description of the dominant pain theme",
  "earlyModuleMatches": [{"name": "Module Name", "area": "Area Name", "confidence": 0.X}],
  "estimatedOpportunity": "X hours/month recoverable" or null if not enough data,
  "quickWinSpotted": "Description of quick win" or null,
  "phaseInsight": "Brief insight about current phase progress"
}

Only include earlyModuleMatches with confidence > 0.6. Max 3 matches.
If not enough data for a field, use null.`;
}

// ── Main Engine Class ────────────────────────────────────────────────────

export function createDiscoveryEngine(db: Database.Database, anthropic?: Anthropic) {

  // ── Session CRUD ─────────────────────────────────────────────────────

  function createSession(tier: DiscoveryTier, userId?: string): { id: string; state: DiscoveryState } {
    const id = randomUUID();
    const state = createDefaultState(tier);

    db.prepare(`
      INSERT INTO discovery_sessions (id, user_id, tier, state, status, started_at, last_active_at)
      VALUES (?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
    `).run(id, userId || null, tier, JSON.stringify(state));

    return { id, state };
  }

  function getSession(id: string): { id: string; tier: DiscoveryTier; state: DiscoveryState; status: DiscoveryStatus; output_id: string | null } | null {
    const row = db.prepare('SELECT * FROM discovery_sessions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: row.id as string,
      tier: row.tier as DiscoveryTier,
      state: JSON.parse(row.state as string) as DiscoveryState,
      status: row.status as DiscoveryStatus,
      output_id: row.output_id as string | null,
    };
  }

  function listSessions(userId?: string): Array<{ id: string; tier: string; status: string; started_at: string; last_active_at: string; phase: string; progress: number }> {
    let query = 'SELECT id, tier, status, started_at, last_active_at, state FROM discovery_sessions';
    const args: unknown[] = [];
    if (userId) {
      query += ' WHERE user_id = ?';
      args.push(userId);
    }
    query += ' ORDER BY last_active_at DESC';

    const rows = db.prepare(query).all(...args) as Array<Record<string, unknown>>;
    return rows.map(row => {
      const state = JSON.parse(row.state as string) as DiscoveryState;
      return {
        id: row.id as string,
        tier: row.tier as string,
        status: row.status as string,
        started_at: row.started_at as string,
        last_active_at: row.last_active_at as string,
        phase: state.phase,
        progress: state.currentPhaseProgress,
      };
    });
  }

  function updateSessionState(id: string, state: DiscoveryState): void {
    db.prepare(`
      UPDATE discovery_sessions
      SET state = ?, last_active_at = datetime('now'), autosave_version = autosave_version + 1
      WHERE id = ?
    `).run(JSON.stringify(state), id);
  }

  function updateSessionStatus(id: string, status: DiscoveryStatus): void {
    const extra = status === 'completed' ? ", completed_at = datetime('now')" : '';
    db.prepare(`UPDATE discovery_sessions SET status = ?${extra} WHERE id = ?`).run(status, id);
  }

  function deleteSession(id: string): void {
    db.prepare('DELETE FROM discovery_sessions WHERE id = ?').run(id);
  }

  // ── State Update Parsing ─────────────────────────────────────────────

  function parseStateUpdate(response: string, currentState: DiscoveryState): { cleanResponse: string; updatedState: DiscoveryState } {
    const stateMatch = response.match(/\[STATE_UPDATE\]:(.+)$/m);
    const phaseCompleteMatch = response.match(/\[PHASE_COMPLETE:(\w+)\]/);

    const cleanResponse = response
      .replace(/\[STATE_UPDATE\]:.*$/m, '')
      .replace(/\[PHASE_COMPLETE:\w+\]/g, '')
      .trim();

    const updatedState: DiscoveryState = {
      ...currentState,
      userProfile: { ...currentState.userProfile },
      readinessScores: { ...currentState.readinessScores },
      workActivities: [...currentState.workActivities],
      painPoints: [...currentState.painPoints],
      opportunities: [...currentState.opportunities],
      nonAiFindings: [...currentState.nonAiFindings],
      integrationAssessment: [...currentState.integrationAssessment],
      governanceItems: [...currentState.governanceItems],
      businessCase: [...currentState.businessCase],
      inferredNeeds: [...currentState.inferredNeeds],
      suggestedModules: [...currentState.suggestedModules],
      completedPhases: [...currentState.completedPhases],
      conversationHistory: [...currentState.conversationHistory],
      phaseSummaries: [...currentState.phaseSummaries],
    };

    // Apply state update from AI
    if (stateMatch) {
      try {
        const update = JSON.parse(stateMatch[1]) as Record<string, unknown>;

        if (update.userProfile) {
          updatedState.userProfile = { ...updatedState.userProfile, ...(update.userProfile as Partial<DiscoveryState['userProfile']>) };
        }
        if (update.workActivities && Array.isArray(update.workActivities)) {
          // Merge — add new ones, don't duplicate by description
          const existing = new Set(updatedState.workActivities.map(a => a.description));
          for (const activity of update.workActivities as Partial<WorkActivity>[]) {
            if (activity.description && !existing.has(activity.description)) {
              updatedState.workActivities.push({ id: randomUUID(), description: '', frequency: '', duration: '', importance: 3, painLevel: 3, ...activity });
            }
          }
        }
        if (update.painPoints && Array.isArray(update.painPoints)) {
          const existing = new Set(updatedState.painPoints.map(p => p.description));
          for (const pain of update.painPoints as Partial<PainPoint>[]) {
            if (pain.description && !existing.has(pain.description)) {
              updatedState.painPoints.push({ id: randomUUID(), description: '', theme: '', impact: 'medium', frequency: 'occasional', relatedActivities: [], ...pain });
            }
          }
        }
        if (update.workflows && Array.isArray(update.workflows)) {
          const existing = new Set(updatedState.workflows.map(w => w.name));
          for (const wf of update.workflows as Partial<WorkflowMap>[]) {
            if (wf.name && !existing.has(wf.name)) {
              updatedState.workflows.push({ id: randomUUID(), name: '', steps: [], totalTime: 0, thinkingTime: 0, gatheringTime: 0, formattingTime: 0, frequency: '', systemsAccessed: [], painSteps: [], automationPotential: 'medium', ...wf });
            }
          }
        }
        if (update.opportunities && Array.isArray(update.opportunities)) {
          const existing = new Set(updatedState.opportunities.map(o => o.name));
          for (const opp of update.opportunities as Partial<Opportunity>[]) {
            if (opp.name && !existing.has(opp.name)) {
              updatedState.opportunities.push({ id: randomUUID(), name: '', description: '', category: '', effort: 3, impact: 3, priorityScore: 0, quadrant: 'consider_later', estimatedTimeSavings: '', matchedModules: [], isAiSolution: true, ...opp });
            }
          }
        }
        if (update.nonAiFindings && Array.isArray(update.nonAiFindings)) {
          const existing = new Set(updatedState.nonAiFindings.map(f => f.description));
          for (const finding of update.nonAiFindings as Partial<NonAiFinding>[]) {
            if (finding.description && !existing.has(finding.description)) {
              updatedState.nonAiFindings.push({ id: randomUUID(), description: '', realSolution: '', aiRole: '', priority: 'medium', isPrerequisiteForAi: false, ...finding });
            }
          }
        }
        if (update.integrationAssessment && Array.isArray(update.integrationAssessment)) {
          const existing = new Set(updatedState.integrationAssessment.map(i => i.systemName));
          for (const item of update.integrationAssessment as Partial<IntegrationAssessment>[]) {
            if (item.systemName && !existing.has(item.systemName)) {
              updatedState.integrationAssessment.push({
                systemName: '', systemType: '', dataFlows: [], integrationLevel: 'none',
                aiReadiness: 'needs_work', notes: '', ...item
              });
            }
          }
        }
        if (update.governanceItems && Array.isArray(update.governanceItems)) {
          const existing = new Set(updatedState.governanceItems.map(g => g.area));
          for (const item of update.governanceItems as Partial<GovernanceItem>[]) {
            if (item.area && !existing.has(item.area)) {
              updatedState.governanceItems.push({
                area: '', currentState: '', recommendation: '', priority: 'medium', effort: '', ...item
              });
            }
          }
        }
        if (update.businessCase && Array.isArray(update.businessCase)) {
          const existing = new Set(updatedState.businessCase.map(b => b.category));
          for (const item of update.businessCase as Partial<BusinessCaseItem>[]) {
            if (item.category && !existing.has(item.category)) {
              updatedState.businessCase.push({
                category: '', description: '', estimatedAnnualBenefit: 0, estimatedCost: 0,
                roi: 0, timeToValue: '', confidence: 'medium', ...item
              });
            }
          }
        }
        if (typeof update.executiveBriefing === 'string') updatedState.executiveBriefing = update.executiveBriefing;
        if (typeof update.activePack === 'string') updatedState.activePack = update.activePack;
        if (update.packData && typeof update.packData === 'object') updatedState.packData = { ...updatedState.packData, ...(update.packData as Record<string, unknown>) };
        if (typeof update.followUpScheduled === 'boolean') updatedState.followUpScheduled = update.followUpScheduled;
        if (update.readinessScores) {
          updatedState.readinessScores = { ...updatedState.readinessScores, ...(update.readinessScores as Partial<ReadinessScores>) };
          const rs = updatedState.readinessScores;
          rs.total = rs.technology + rs.peopleCulture + rs.governance + rs.leadership;
          rs.level = rs.total >= 75 ? 'advanced' : rs.total >= 50 ? 'prepared' : rs.total >= 25 ? 'developing' : 'foundation';
        }
        if (update.inferredNeeds && Array.isArray(update.inferredNeeds)) {
          updatedState.inferredNeeds = [...new Set([...updatedState.inferredNeeds, ...(update.inferredNeeds as string[])])];
        }
        if (typeof update.sectorContext === 'string') updatedState.sectorContext = update.sectorContext;
        if (typeof update.confidenceLevel === 'number') updatedState.confidenceLevel = update.confidenceLevel;
        if (typeof update.currentPhaseProgress === 'number') updatedState.currentPhaseProgress = update.currentPhaseProgress;
        if (typeof update.canGenerateOutput === 'boolean') updatedState.canGenerateOutput = update.canGenerateOutput;
      } catch (e) {
        console.error('[discovery] Failed to parse state update:', e);
      }
    }

    // Handle phase transition
    if (phaseCompleteMatch) {
      const completedPhase = phaseCompleteMatch[1] as DiscoveryPhase;
      if (!updatedState.completedPhases.includes(completedPhase)) {
        updatedState.completedPhases.push(completedPhase);
      }

      // Advance to next phase
      const phases = PHASE_CONFIG[updatedState.tier];
      const currentIdx = phases.indexOf(completedPhase);
      if (currentIdx >= 0 && currentIdx < phases.length - 1) {
        updatedState.phase = phases[currentIdx + 1];
        updatedState.currentPhaseProgress = 0;
      }

      // Check if all phases complete
      if (updatedState.completedPhases.length >= phases.length) {
        updatedState.canGenerateOutput = true;
      }
    }

    return { cleanResponse, updatedState };
  }

  // ── Progressive Summarization ────────────────────────────────────────

  function shouldSummarize(state: DiscoveryState): boolean {
    // Summarize when conversation gets long to manage context
    const messageCount = state.conversationHistory.length;
    const unsummarizedMessages = messageCount - (state.phaseSummaries.length * 10); // rough estimate
    return unsummarizedMessages > 20 && state.tier !== 'lite';
  }

  async function createPhaseSummary(state: DiscoveryState, phase: DiscoveryPhase): Promise<PhaseSummary> {
    if (!anthropic) {
      return { phase, summary: `Phase ${phase} completed.`, keyFindings: [], tokenCount: 0, createdAt: new Date().toISOString() };
    }

    // Get messages from this phase
    const phaseMessages = state.conversationHistory.slice(-20); // Last 20 messages as approximation
    const conversationText = phaseMessages.map(m => `${m.role}: ${m.content}`).join('\n\n');

    try {
      const chatResult = await callChat({
        model: mapModelToProvider('claude-haiku-4-5-20251001'),
        maxTokens: 1024,
        system: 'Summarize the following discovery conversation phase. Extract key findings as bullet points. Be concise but comprehensive. Return JSON: {"summary":"...","keyFindings":["..."]}',
        messages: [{ role: 'user', content: `Phase: ${phase}\nTier: ${state.tier}\n\nConversation:\n${conversationText}` }],
      });

      const parsed = JSON.parse(chatResult.text) as { summary: string; keyFindings: string[] };
      return {
        phase,
        summary: parsed.summary,
        keyFindings: parsed.keyFindings || [],
        tokenCount: chatResult.inputTokens || 0,
        createdAt: new Date().toISOString(),
      };
    } catch (e) {
      return { phase, summary: `Phase ${phase} completed.`, keyFindings: [], tokenCount: 0, createdAt: new Date().toISOString() };
    }
  }

  // ── Conversation Turn ────────────────────────────────────────────────

  async function processUserResponse(sessionId: string, userMessage: string): Promise<{ response: string; state: DiscoveryState; phaseChanged: boolean }> {
    const session = getSession(sessionId);
    if (!session) throw new Error('Session not found');
    if (!anthropic) throw new Error('Anthropic client not configured');

    const state = session.state;
    const previousPhase = state.phase;

    // Add user message to history
    state.conversationHistory.push({ role: 'user', content: userMessage });

    // Build messages for Claude
    const phasePrompt = getPhasePrompt(state.phase, state.tier, state);
    const statePrompt = getStateExtractionPrompt(state);
    const moduleContext = getModuleContext();

    const systemPrompt = [
      DISCOVERY_SYSTEM_PROMPT,
      moduleContext,
      phasePrompt,
      statePrompt,
    ].join('\n\n');

    // Build messages — use summaries for long sessions
    let messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    if (state.contextStrategy === 'summarized' && state.phaseSummaries.length > 0) {
      // Inject phase summaries as context before recent conversation
      const summaryContext = state.phaseSummaries.map(s =>
        `[Previous phase "${s.phase}" summary: ${s.summary}. Key findings: ${s.keyFindings.join('; ')}]`
      ).join('\n');

      const recentHistory = state.conversationHistory.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      // Prepend summary as first user message if history doesn't start with one
      if (recentHistory.length > 0 && recentHistory[0].role === 'assistant') {
        messages = [{ role: 'user', content: summaryContext }, ...recentHistory];
      } else {
        // Inject summary into the first user message
        messages = recentHistory.map((m, i) =>
          i === 0 && m.role === 'user'
            ? { ...m, content: `${summaryContext}\n\n${m.content}` }
            : m
        );
      }
    } else {
      messages = state.conversationHistory.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
    }

    const chatResult = await callChat({
      model: mapModelToProvider('claude-sonnet-4-5-20250929'),
      maxTokens: 2048,
      system: systemPrompt,
      messages,
    });

    const assistantText = chatResult.text;

    // Parse state updates and phase transitions from response
    const phaseCompleteMatch = assistantText.match(/\[PHASE_COMPLETE:(\w+)\]/);
    const { cleanResponse, updatedState } = parseStateUpdate(assistantText, state);

    // Progressive summarization — create summary when phase completes
    if (phaseCompleteMatch && (updatedState.tier === 'professional' || updatedState.tier === 'expert')) {
      const completedPhase = phaseCompleteMatch[1] as DiscoveryPhase;
      const summary = await createPhaseSummary(updatedState, completedPhase);
      updatedState.phaseSummaries.push(summary);

      // For very long sessions, trim older conversation history (keep summaries)
      if (shouldSummarize(updatedState)) {
        // Keep last 10 messages + use summaries for earlier context
        const recentMessages = updatedState.conversationHistory.slice(-10);
        updatedState.conversationHistory = recentMessages;
        updatedState.contextStrategy = 'summarized';
      }
    }

    // Add assistant response to history
    updatedState.conversationHistory.push({ role: 'assistant', content: cleanResponse });
    updatedState.totalTokensUsed += (chatResult.inputTokens || 0) + (chatResult.outputTokens || 0);

    // Save
    updateSessionState(sessionId, updatedState);

    return {
      response: cleanResponse,
      state: updatedState,
      phaseChanged: previousPhase !== updatedState.phase,
    };
  }

  // ── Generate Insights ────────────────────────────────────────────────

  async function generateInsights(sessionId: string): Promise<Record<string, unknown>> {
    const session = getSession(sessionId);
    if (!session) throw new Error('Session not found');
    if (!anthropic) return { topPainTheme: null, earlyModuleMatches: [], estimatedOpportunity: null, quickWinSpotted: null, phaseInsight: null };

    try {
      const chatResult = await callChat({
        model: mapModelToProvider('claude-haiku-4-5-20251001'),
        maxTokens: 1024,
        system: 'You are an analytical assistant. Return only valid JSON, no markdown.',
        messages: [{ role: 'user', content: getInsightPrompt(session.state) }],
      });

      return JSON.parse(chatResult.text) as Record<string, unknown>;
    } catch (e) {
      console.error('[discovery] Insight generation failed:', e);
      return { topPainTheme: null, earlyModuleMatches: [], estimatedOpportunity: null, quickWinSpotted: null, phaseInsight: null };
    }
  }

  // ── Generate Output ──────────────────────────────────────────────────

  async function generateOutput(sessionId: string): Promise<{ outputId: string; contentMd: string; moduleMatches: ModuleMatch[]; actionPlan: unknown[]; metrics: unknown; nonAiFindings: NonAiFinding[]; executiveBriefing: string }> {
    const session = getSession(sessionId);
    if (!session) throw new Error('Session not found');
    if (!anthropic) throw new Error('Anthropic client not configured');

    const outputPrompt = getOutputGenerationPrompt(session.state);

    const chatResult = await callChat({
      model: mapModelToProvider('claude-sonnet-4-5-20250929'),
      maxTokens: 8192,
      system: 'You are ANTON, an expert AI advisor generating a professional discovery report. Be specific, actionable, and honest.',
      messages: [{ role: 'user', content: outputPrompt }],
    });

    const fullText = chatResult.text;

    // Parse structured output
    const outputMatch = fullText.match(/\[DISCOVERY_OUTPUT\]:(.+)$/ms);
    const contentMd = fullText.replace(/\[DISCOVERY_OUTPUT\]:.*$/ms, '').trim();

    let moduleMatches: ModuleMatch[] = [];
    let actionPlan: unknown[] = [];
    let metrics: unknown = {};
    let nonAiFindings: NonAiFinding[] = [];
    let executiveBriefing = '';

    if (outputMatch) {
      try {
        const parsed = JSON.parse(outputMatch[1]) as Record<string, unknown>;
        moduleMatches = (parsed.moduleMatches as ModuleMatch[]) || [];
        actionPlan = (parsed.actionPlan as unknown[]) || [];
        metrics = parsed.metrics || {};
        nonAiFindings = (parsed.nonAiFindings as NonAiFinding[]) || [];
        executiveBriefing = (parsed.executiveBriefing as string) || '';
      } catch (e) {
        console.error('[discovery] Failed to parse output JSON:', e);
      }
    }

    // Save output
    const outputId = randomUUID();
    db.prepare(`
      INSERT INTO discovery_outputs (id, session_id, tier, title, content_md, module_matches, action_plan, metrics, non_ai_findings, executive_briefing, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      outputId, sessionId, session.tier,
      `AI ${session.tier === 'lite' ? 'Starter Map' : session.tier === 'standard' ? 'Opportunity Report' : session.tier === 'professional' ? 'Adoption Roadmap' : 'Transformation Plan'}`,
      contentMd, JSON.stringify(moduleMatches), JSON.stringify(actionPlan),
      JSON.stringify(metrics), JSON.stringify(nonAiFindings), executiveBriefing,
    );

    // Link output to session and mark complete
    db.prepare("UPDATE discovery_sessions SET output_id = ?, status = ?, completed_at = datetime('now') WHERE id = ?")
      .run(outputId, 'completed', sessionId);

    return { outputId, contentMd, moduleMatches, actionPlan, metrics, nonAiFindings, executiveBriefing };
  }

  // ── Get Output ───────────────────────────────────────────────────────

  function getOutput(outputId: string) {
    const row = db.prepare('SELECT * FROM discovery_outputs WHERE id = ?').get(outputId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: row.id as string,
      sessionId: row.session_id as string,
      tier: row.tier as string,
      title: row.title as string,
      contentMd: row.content_md as string,
      moduleMatches: JSON.parse((row.module_matches as string) || '[]') as ModuleMatch[],
      actionPlan: JSON.parse((row.action_plan as string) || '[]') as unknown[],
      metrics: JSON.parse((row.metrics as string) || '{}') as unknown,
      nonAiFindings: JSON.parse((row.non_ai_findings as string) || '[]') as NonAiFinding[],
      executiveBriefing: (row.executive_briefing as string) || '',
      createdAt: row.created_at as string,
    };
  }

  function getOutputBySession(sessionId: string) {
    const row = db.prepare('SELECT * FROM discovery_outputs WHERE session_id = ?').get(sessionId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return getOutput(row.id as string);
  }

  // ── Public API ───────────────────────────────────────────────────────

  return {
    createSession,
    getSession,
    listSessions,
    updateSessionState,
    updateSessionStatus,
    deleteSession,
    processUserResponse,
    generateInsights,
    generateOutput,
    getOutput,
    getOutputBySession,
    PHASE_CONFIG,
    PHASE_LABELS,
  };
}

export type DiscoveryEngine = ReturnType<typeof createDiscoveryEngine>;
