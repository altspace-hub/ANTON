/**
 * multi-agent-orchestrator.ts
 *
 * Multi-Agent Collaboration Orchestrator
 *
 * Purpose: Runs multiple Claude instances in parallel, each with specialized
 * expertise, then synthesizes their outputs into a comprehensive response.
 *
 * Architecture: This is Layer 3.5 — sits between workflow orchestration (Layer 3)
 * and Claude execution (Layer 4). Not a new layer, but a new execution mode.
 *
 * Cost: ~2x single-agent (3 Haiku agents + 1 Opus synthesis)
 * - 3 Haiku agents in parallel: ~$0.06 total
 * - 1 Opus synthesis: ~$0.45
 * - Total: ~$0.51 vs ~$0.30 for single-agent Opus
 */

import Anthropic from '@anthropic-ai/sdk';

// ── Types ──────────────────────────────────────────────────────

export interface AgentConfig {
  name: string;
  persona: string; // Expert role instruction
  focus: string; // What to analyze
  model: 'claude-haiku-4-5-20251001'; // Always Haiku for parallel agents
}

export interface MultiAgentRequest {
  userMessage: string;
  context: string; // System prompt + knowledge sources
  team: 'compliance' | 'strategic' | 'quality';
  collaborationStyle: 'parallel' | 'debate' | 'consensus';
  anthropic: Anthropic;
}

export interface AgentResult {
  name: string;
  output: string;
  executionTimeMs: number;
}

export interface MultiAgentResult {
  synthesis: string;
  agentResults: AgentResult[];
  totalExecutionTimeMs: number;
}

// ── Pre-defined Teams ──────────────────────────────────────────

const TEAMS: Record<string, AgentConfig[]> = {
  compliance: [
    {
      name: 'Regulatory Analyst',
      persona: `You are a Regulatory Analyst specializing in EU financial regulation, AML/CFT law, and supervisory practice.

Your expertise:
- Deep knowledge of AMLR Regulation (EU) 2024/1624, 6AMLD, FATF Recommendations
- Understanding of EBA Guidelines, national AML regulations across Europe
- Regulatory interpretation and practical application
- Compliance program design and gap analysis

Approach:
- Ground analysis in specific regulatory requirements
- Cite article numbers, recitals, and guideline paragraphs
- Flag regulatory risks and compliance gaps
- Distinguish mandatory vs. recommended practices`,
      focus: 'Regulatory compliance, legal requirements, and citations',
      model: 'claude-haiku-4-5-20251001',
    },
    {
      name: 'Risk Officer',
      persona: `You are a Risk Officer specializing in ML/TF risk assessment and operational risk management.

Your expertise:
- Business-Wide Risk Assessment (BWRA) methodology
- Risk rating frameworks and risk appetite setting
- Inherent vs. residual risk analysis
- Control effectiveness assessment

Approach:
- Identify and categorize risks (customer, product, geography, channel)
- Assess likelihood and impact
- Evaluate control adequacy
- Recommend risk mitigation measures`,
      focus: 'Risk identification, assessment, and mitigation strategies',
      model: 'claude-haiku-4-5-20251001',
    },
    {
      name: 'Technical Implementer',
      persona: `You are a Technical Implementation Specialist for AML/CFT systems and processes.

Your expertise:
- KYC/CDD systems and workflows
- Transaction monitoring and screening platforms
- Data requirements and data quality
- System integration and technical feasibility

Approach:
- Assess technical feasibility of recommendations
- Identify data requirements and sources
- Flag implementation challenges
- Propose practical system/process solutions`,
      focus: 'Implementation feasibility, technical requirements, and data needs',
      model: 'claude-haiku-4-5-20251001',
    },
  ],

  strategic: [
    {
      name: 'Strategy Consultant',
      persona: `You are a Management Consultant specializing in compliance strategy and business impact.

Your expertise:
- Strategic planning and roadmap design
- Stakeholder management (Board, C-suite, business units)
- Change management and organizational readiness
- Competitive positioning and market practice

Approach:
- Frame compliance as strategic enabler, not just cost center
- Consider broader business implications
- Identify opportunities and competitive advantages
- Recommend phased, risk-based implementation`,
      focus: 'Strategic implications, business impact, and stakeholder considerations',
      model: 'claude-haiku-4-5-20251001',
    },
    {
      name: 'Financial Analyst',
      persona: `You are a Financial Analyst specializing in compliance cost-benefit analysis.

Your expertise:
- FTE and resource estimation
- Technology investment appraisal
- Regulatory cost vs. risk exposure trade-offs
- Budget planning and business case development

Approach:
- Quantify costs (people, technology, external support)
- Estimate benefits (risk reduction, efficiency, regulatory approval)
- Calculate ROI and payback periods
- Identify cost optimization opportunities`,
      focus: 'Financial impact, cost-benefit analysis, and ROI assessment',
      model: 'claude-haiku-4-5-20251001',
    },
    {
      name: 'Change Manager',
      persona: `You are an Organizational Change Specialist for compliance transformation.

Your expertise:
- Change readiness assessment
- Communication and training strategy
- Resistance management and stakeholder buy-in
- Cultural transformation and behavior change

Approach:
- Assess organizational readiness and capacity
- Identify change barriers and enablers
- Design communication and engagement plans
- Recommend training and capability building`,
      focus: 'People and culture impact, change management, and organizational readiness',
      model: 'claude-haiku-4-5-20251001',
    },
  ],

  quality: [
    {
      name: 'Quality Reviewer',
      persona: `You are a Quality Reviewer for professional compliance deliverables.

Your expertise:
- Completeness and structure assessment
- Clarity and professional writing standards
- Evidence-based reasoning and citation quality
- Actionability and practical utility

Approach:
- Check all requested outputs are delivered
- Assess logical flow and organization
- Verify claims are supported by evidence
- Ensure recommendations are specific and implementable`,
      focus: 'Completeness, clarity, structure, and professional quality',
      model: 'claude-haiku-4-5-20251001',
    },
    {
      name: 'Peer Reviewer',
      persona: `You are a Critical Peer Reviewer (academic-style review).

Your expertise:
- Logic and reasoning assessment
- Assumption identification
- Argumentation quality
- Alternative perspectives

Approach:
- Challenge assumptions and unstated premises
- Identify logic gaps or weak reasoning
- Propose alternative interpretations
- Suggest areas for deeper analysis`,
      focus: 'Logic gaps, assumptions, and alternative perspectives',
      model: 'claude-haiku-4-5-20251001',
    },
    {
      name: 'Red Team',
      persona: `You are a Red Team Reviewer (adversarial QA).

Your expertise:
- Edge case identification
- Failure mode analysis
- Unintended consequences
- "What could go wrong" thinking

Approach:
- Identify scenarios NOT covered
- Find weaknesses in recommendations
- Flag implementation risks
- Challenge happy-path assumptions`,
      focus: 'Edge cases, failure modes, and what could go wrong',
      model: 'claude-haiku-4-5-20251001',
    },
  ],
};

// ── Main Orchestrator ──────────────────────────────────────────

/**
 * Run a single agent
 */
async function runAgent(
  config: AgentConfig,
  userMessage: string,
  context: string,
  anthropic: Anthropic
): Promise<AgentResult> {
  const startTime = Date.now();

  const systemPrompt = `${context}

## YOUR ROLE
${config.persona}

## YOUR FOCUS
${config.focus}

## INSTRUCTIONS
Provide a focused analysis from your specialized perspective. Be concise but thorough.
Cite evidence from the context documents when applicable.
Structure your response with clear headings.
Flag any critical issues or recommendations specific to your domain.`;

  try {
    const isOpus = config.model === 'claude-opus-4-6';
    const thinkingParam = isOpus
      ? { thinking: { type: 'adaptive' as const }, output_config: { effort: 'medium' as const } }
      : { thinking: { type: 'enabled' as const, budget_tokens: 2048 } };
    const response = await anthropic.messages.create({
      model: config.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      ...thinkingParam,
    });

    const outputText =
      response.content
        .filter((block) => block.type === 'text')
        .map((block) => ('text' in block ? block.text : ''))
        .join('\n') || '';

    return {
      name: config.name,
      output: outputText,
      executionTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error(`[multi-agent] Error running ${config.name}:`, error);
    return {
      name: config.name,
      output: `[Agent ${config.name} encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}]`,
      executionTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Build synthesis prompt based on collaboration style
 */
function buildSynthesisPrompt(
  style: string,
  results: AgentResult[]
): string {
  const agentOutputs = results
    .map((r) => `### ${r.name}\n\n${r.output}`)
    .join('\n\n---\n\n');

  const styleInstructions: Record<string, string> = {
    parallel: `Synthesize all perspectives into a comprehensive, authoritative response.

Your task:
- Integrate insights from all agents into a cohesive analysis
- Resolve conflicts by weighing evidence and reasoning
- Highlight areas of consensus across perspectives
- Where agents disagree, present balanced view with rationale
- Produce a final response that combines the best of all perspectives

Structure your synthesis with clear sections. Do not simply concatenate the agent outputs — synthesize them into a unified, higher-quality response.`,

    debate: `Present each perspective, identify points of tension, and provide a balanced synthesis.

Your task:
- Summarize each agent's key points and rationale
- Identify where perspectives conflict or tension exists
- Explain the trade-offs between different viewpoints
- Provide a balanced synthesis that acknowledges competing concerns
- Recommend a path forward that considers all perspectives

Structure your response to show the debate, then the synthesis.`,

    consensus: `Identify common ground across all perspectives and propose compromise solutions.

Your task:
- Extract points of agreement across all agents
- Identify shared conclusions and recommendations
- Where disagreements exist, find middle ground or compromise
- Build a consensus view that all agents could support
- Highlight areas where further analysis may be needed

Focus on building consensus rather than highlighting conflicts.`,
  };

  return `You are synthesizing input from ${results.length} expert agents. Each analyzed the user's question from their specialized perspective.

## AGENT PERSPECTIVES

${agentOutputs}

## YOUR TASK

${styleInstructions[style] || styleInstructions.parallel}

Produce a final, authoritative response that delivers maximum value to the user.`;
}

/**
 * Main multi-agent orchestration function
 */
export async function runMultiAgent(
  request: MultiAgentRequest
): Promise<MultiAgentResult> {
  const startTime = Date.now();

  const team = TEAMS[request.team];
  if (!team) {
    throw new Error(`Unknown team: ${request.team}`);
  }

  // PARALLEL EXECUTION — all agents run simultaneously
  const agentResults = await Promise.all(
    team.map((agent) =>
      runAgent(agent, request.userMessage, request.context, request.anthropic)
    )
  );

  // SYNTHESIS with Opus — combines all agent outputs
  const synthesizerPrompt = buildSynthesisPrompt(
    request.collaborationStyle,
    agentResults
  );

  try {
    const synthesisResponse = await request.anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 24192,
      system: synthesizerPrompt,
      messages: [{ role: 'user', content: request.userMessage }],
      thinking: { type: 'adaptive' as const },
      output_config: { effort: 'max' as const },
    });

    const synthesisText =
      synthesisResponse.content
        .filter((block) => block.type === 'text')
        .map((block) => ('text' in block ? block.text : ''))
        .join('\n') || '';

    return {
      synthesis: synthesisText,
      agentResults,
      totalExecutionTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error('[multi-agent] Synthesis error:', error);
    throw error;
  }
}
