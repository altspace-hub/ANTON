/**
 * review-orchestrator.ts
 *
 * Multi-Agent Quality Assurance Orchestrator
 *
 * Purpose: Orchestrates 5 parallel review agents to assess output quality
 * before presenting to user. Each agent scores 0-10 and flags issues.
 *
 * Review Agents:
 * 1. Quality Reviewer - Completeness, structure, clarity
 * 2. Regulatory Reviewer - Regulatory accuracy, citations
 * 3. Technical Reviewer - Technical correctness, feasibility
 * 4. Communications Reviewer - Tone, audience fit, readability
 * 5. Red Team Reviewer - Edge cases, failure modes, risks
 */

import type { DatabaseAdapter } from '../db/database.js';

import type Anthropic from '@anthropic-ai/sdk';
import { getRoutedUtilityModelSync } from './utility-model.js';
import { callChat } from './provider-router.js';

// ── Types ──────────────────────────────────────────────────────

export interface ReviewContext {
  moduleId: string;
  moduleName: string;
  areaId: string;
  outputFormats: string[];
  userMessage: string;
  systemPrompt: string;
  thinkingLevel: string;
  model: string;
}

export interface ReviewFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  message: string;
  location?: string; // Section, paragraph, line reference
  suggestion?: string;
}

export interface ReviewResult {
  agent: string;
  agentDescription: string;
  score: number; // 0-10
  findings: ReviewFinding[];
  suggestions: string[];
  executionTimeMs: number;
}

export interface ReviewEngineOutput {
  overallScore: number; // Weighted average of all agent scores
  reviews: ReviewResult[];
  approved: boolean; // True if no critical/high issues
  humanReviewRequired: boolean; // True if critical findings exist
  summary: string;
  totalExecutionTimeMs: number;
}

// ── Review Orchestrator ────────────────────────────────────────

/**
 * The Anthropic client argument is no longer used — the reviewers run through
 * provider-router on the configured model. Kept so existing callers compile.
 */
export async function createReviewOrchestrator(_anthropic?: Anthropic) {
  /**
   * Run all 5 review agents in parallel on an output
   */
  async function runAllReviewers(
    output: string,
    context: ReviewContext
  ): Promise<ReviewEngineOutput> {
    const startTime = Date.now();

    // Run all reviewers in parallel for speed
    const [quality, regulatory, technical, comms, redTeam] = await Promise.all([
      runQualityReview(output, context),
      runRegulatoryReview(output, context),
      runTechnicalReview(output, context),
      runCommunicationsReview(output, context),
      runRedTeamReview(output, context),
    ]);

    const reviews = [quality, regulatory, technical, comms, redTeam];

    // Calculate weighted overall score
    // Regulatory is most important (0.3), then quality (0.25), technical (0.2), comms (0.15), red team (0.1)
    const weights = {
      quality: 0.25,
      regulatory: 0.3,
      technical: 0.2,
      comms: 0.15,
      redTeam: 0.1,
    };
    const overallScore =
      quality.score * weights.quality +
      regulatory.score * weights.regulatory +
      technical.score * weights.technical +
      comms.score * weights.comms +
      redTeam.score * weights.redTeam;

    // Check for critical/high findings
    const criticalFindings = reviews.flatMap((r) =>
      r.findings.filter((f) => f.severity === 'critical')
    );
    const highFindings = reviews.flatMap((r) => r.findings.filter((f) => f.severity === 'high'));

    const humanReviewRequired = criticalFindings.length > 0;
    const approved = criticalFindings.length === 0 && highFindings.length <= 2;

    // Generate summary
    const summary = generateReviewSummary(reviews, overallScore, criticalFindings, highFindings);

    return {
      overallScore: Math.round(overallScore * 10) / 10,
      reviews,
      approved,
      humanReviewRequired,
      summary,
      totalExecutionTimeMs: Math.max(1, Date.now() - startTime), // Ensure at least 1ms
    };
  }

  return { runAllReviewers };
}

// ── Individual Review Agents ───────────────────────────────────
//
// Each reviewer runs on the configured model through provider-router. They
// used to run only when an Anthropic client object existed: on a server with
// no Anthropic key (a subscription-only instance, the OpenRouter showcase) the
// route returned placeholder scores (8.0, 8.5, …) that no model had given.
// Now every reviewer calls the model; when the call fails or its reply holds
// no score, the result says so in an info finding and falls back to the
// heuristic checks, instead of passing the placeholder off as a review.

interface ReviewerSpec {
  agent: string;
  agentDescription: string;
  systemPrompt: string;
  userContent: string;
  /** Starting score for the heuristic fallback. */
  fallbackScore: number;
  /** Heuristic checks used when the model gives no usable review. */
  heuristics?: (findings: ReviewFinding[]) => void;
}

function isScore(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 10;
}

async function runReviewer(spec: ReviewerSpec): Promise<ReviewResult> {
  const startTime = Date.now();
  const findings: ReviewFinding[] = [];
  const suggestions: string[] = [];
  let score: number | null = null;
  let fallbackReason = '';

  try {
    const chatResult = await callChat({
      model: getRoutedUtilityModelSync(),
      maxTokens: 2048,
      system: spec.systemPrompt,
      messages: [{ role: 'user', content: spec.userContent }],
    });
    const parsed = extractJSON(chatResult.text) as { score?: unknown; findings?: unknown; suggestions?: unknown } | null;
    if (parsed && isScore(parsed.score)) {
      score = parsed.score;
      if (Array.isArray(parsed.findings)) findings.push(...(parsed.findings as ReviewFinding[]));
      if (Array.isArray(parsed.suggestions)) suggestions.push(...parsed.suggestions.filter((x): x is string => typeof x === 'string'));
    } else {
      fallbackReason = 'the reviewer model did not return a readable score';
    }
  } catch (error) {
    console.error(`[${spec.agent}-reviewer] model call failed:`, error instanceof Error ? error.message : error);
    fallbackReason = 'the reviewer model could not be reached';
  }

  if (score === null) {
    findings.push({
      severity: 'info',
      category: 'system',
      message: `${spec.agentDescription} ran in fallback mode: ${fallbackReason}. The score comes from heuristic checks, not a model review.`,
    });
    spec.heuristics?.(findings);
    score = adjustScoreForFindings(spec.fallbackScore, findings);
  }

  return {
    agent: spec.agent,
    agentDescription: spec.agentDescription,
    score,
    findings,
    suggestions,
    executionTimeMs: Math.max(1, Date.now() - startTime), // Ensure at least 1ms
  };
}

async function runQualityReview(output: string, context: ReviewContext): Promise<ReviewResult> {
  return runReviewer({
    agent: 'quality',
    agentDescription: 'Quality Reviewer',
    fallbackScore: 8.0,
    systemPrompt: `You are a Quality Reviewer for professional compliance consulting outputs.

Your role: Assess completeness, structure, clarity, and professional quality.

Evaluate:
1. **Completeness** - All requested outputs delivered? All sections present?
2. **Structure** - Logical flow, clear headings, proper formatting
3. **Clarity** - Easy to understand, no ambiguity, definitions clear
4. **Evidence** - Claims supported by evidence, sources cited
5. **Actionability** - Recommendations specific and implementable

Score 0-10 (10 = publication-ready, 0 = unusable).

Output JSON:
{
  "score": 8.5,
  "findings": [
    {"severity": "high", "category": "completeness", "message": "Missing risk appetite statement", "suggestion": "Add section 4.3 with risk tolerance levels"},
    {"severity": "medium", "category": "clarity", "message": "Paragraph 2.1 uses undefined acronym", "location": "Section 2.1", "suggestion": "Define 'BWRA' on first use"}
  ],
  "suggestions": ["Add executive summary", "Include visual risk matrix"]
}`,
    userContent: `# Quality Review Request

## Module Context
- Module: ${context.moduleName} (${context.moduleId})
- Area: ${context.areaId}
- Output Formats: ${context.outputFormats.join(', ')}
- Thinking Level: ${context.thinkingLevel}

## User's Request
${context.userMessage}

## Output to Review
${output.slice(0, 100000)} <!-- Truncate to 100k chars for token limits -->

Provide your quality review as JSON.`,
    heuristics: (findings) => {
      if (output.length < 500)
        findings.push({
          severity: 'high',
          category: 'completeness',
          message: 'Output is very short (< 500 chars). May be incomplete.',
        });
      if (!output.includes('#'))
        findings.push({
          severity: 'medium',
          category: 'structure',
          message: 'No markdown headings detected. Add structure.',
        });
      if (output.split('\n').length < 10)
        findings.push({
          severity: 'medium',
          category: 'completeness',
          message: 'Output has fewer than 10 lines. Expand detail.',
        });
    },
  });
}

async function runRegulatoryReview(output: string, context: ReviewContext): Promise<ReviewResult> {
  return runReviewer({
    agent: 'regulatory',
    agentDescription: 'Regulatory Reviewer',
    fallbackScore: 8.5,
    systemPrompt: `You are a Regulatory Reviewer specializing in AML/CFT compliance.

Your role: Verify regulatory accuracy, citation quality, and compliance with current law.

Evaluate:
1. **Regulatory Citations** - Are references to regulations accurate? (AMLR 2024/1624, 6AMLD, FATF, etc.)
2. **Article References** - Are article numbers correct? Are quotations accurate?
3. **Current Law** - Is the output based on current (2024-2026) regulations, not outdated?
4. **Gaps** - Are there missing regulatory requirements not mentioned?
5. **Interpretation** - Are legal interpretations reasonable and defensible?

Score 0-10 (10 = legally sound, 0 = regulatory errors).

Output JSON with findings and score.`,
    userContent: `# Regulatory Review Request

Module: ${context.moduleName}
Area: ${context.areaId}

Output to review:
${output.slice(0, 100000)}

Provide regulatory review as JSON.`,
    heuristics: (findings) => {
      const hasAMLR = output.toLowerCase().includes('amlr') || output.includes('2024/1624');
      if (!hasAMLR && context.areaId === 'fcp')
        findings.push({
          severity: 'medium',
          category: 'citations',
          message: 'No AMLR reference found. Consider citing Regulation (EU) 2024/1624.',
        });
    },
  });
}

async function runTechnicalReview(output: string, context: ReviewContext): Promise<ReviewResult> {
  return runReviewer({
    agent: 'technical',
    agentDescription: 'Technical Reviewer',
    fallbackScore: 8.0,
    systemPrompt: `You are a Technical Reviewer for compliance implementations.

Your role: Assess technical correctness, feasibility, and implementation risks.

Evaluate:
1. **Technical Accuracy** - Are data structures, systems, processes correctly described?
2. **Feasibility** - Are recommendations technically feasible? Any technical blockers?
3. **Data Requirements** - Are data fields, schemas, calculations correct?
4. **Integration** - Do proposed integrations/systems exist and work as described?
5. **Security/Privacy** - Any technical security or data protection concerns?

Score 0-10 (10 = technically sound, 0 = contains errors).

Output JSON with findings and score.`,
    userContent: `Technical review for: ${context.moduleName}\n\n${output.slice(0, 100000)}`,
  });
}

async function runCommunicationsReview(output: string, context: ReviewContext): Promise<ReviewResult> {
  return runReviewer({
    agent: 'communications',
    agentDescription: 'Communications Reviewer',
    fallbackScore: 7.5,
    systemPrompt: `You are a Communications Reviewer for compliance documents.

Your role: Assess tone, audience fit, readability, and messaging effectiveness.

Evaluate:
1. **Audience Fit** - Appropriate for intended audience? (Board vs. analysts vs. front-line)
2. **Tone** - Professional, authoritative, accessible? Over-complex or too simple?
3. **Readability** - Clear sentences, active voice, defined jargon?
4. **Messaging** - Key points clear? Recommendations unambiguous?
5. **Visual Structure** - Good use of headings, lists, tables, formatting?

Score 0-10 (10 = excellent comms, 0 = unclear/inappropriate).

Output JSON with findings and score.`,
    userContent: `Communications review for: ${context.moduleName}\n\n${output.slice(0, 100000)}`,
  });
}

async function runRedTeamReview(output: string, context: ReviewContext): Promise<ReviewResult> {
  return runReviewer({
    agent: 'red-team',
    agentDescription: 'Red Team Reviewer',
    fallbackScore: 7.0,
    systemPrompt: `You are a Red Team Reviewer (adversarial QA).

Your role: Find edge cases, failure modes, risks, and what could go wrong.

Evaluate:
1. **Edge Cases** - What scenarios are NOT covered? What breaks the recommendations?
2. **Failure Modes** - What happens if this advice is followed incorrectly?
3. **Unintended Consequences** - Could these recommendations cause problems?
4. **Assumptions** - What unstated assumptions could be wrong?
5. **Risks** - Legal, operational, reputational risks not addressed?

Score 0-10 (10 = robust against edge cases, 0 = many failure modes).

Output JSON with findings (focus on CRITICAL and HIGH severity issues).`,
    userContent: `Red team review for: ${context.moduleName}\n\n${output.slice(0, 100000)}`,
  });
}

// ── Utilities ──────────────────────────────────────────────────

/**
 * Adjust score based on findings in fallback mode
 * Deducts points for each finding based on severity
 */
function adjustScoreForFindings(baseScore: number, findings: ReviewFinding[]): number {
  let adjustedScore = baseScore;

  for (const finding of findings) {
    switch (finding.severity) {
      case 'critical':
        adjustedScore -= 2.0;
        break;
      case 'high':
        adjustedScore -= 1.5;
        break;
      case 'medium':
        adjustedScore -= 1.0;
        break;
      case 'low':
        adjustedScore -= 0.5;
        break;
      case 'info':
        // No deduction for info findings
        break;
    }
  }

  // Ensure score stays in valid range 0-10
  return Math.max(0, Math.min(10, adjustedScore));
}

function extractJSON(text: string): unknown {
  try {
    // Try to find JSON in code blocks first
    const jsonMatch = text.match(/```json\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) return JSON.parse(jsonMatch[1]);

    // Try to parse entire text as JSON
    return JSON.parse(text);
  } catch {
    // Try to find first { ... } block
    const braceMatch = text.match(/(\{[\s\S]*\})/);
    if (braceMatch) {
      try {
        return JSON.parse(braceMatch[1]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function generateReviewSummary(
  reviews: ReviewResult[],
  overallScore: number,
  criticalFindings: ReviewFinding[],
  highFindings: ReviewFinding[]
): string {
  const scoreLabel =
    overallScore >= 9
      ? 'Excellent'
      : overallScore >= 8
        ? 'Very Good'
        : overallScore >= 7
          ? 'Good'
          : overallScore >= 6
            ? 'Acceptable'
            : 'Needs Improvement';

  let summary = `**Overall Quality: ${scoreLabel} (${overallScore}/10)**\n\n`;

  if (criticalFindings.length > 0) {
    summary += `⚠️ **${criticalFindings.length} Critical Issue(s) Found** - Human review required.\n\n`;
  } else if (highFindings.length > 0) {
    summary += `⚡ **${highFindings.length} High Priority Issue(s)** - Review recommended.\n\n`;
  } else {
    summary += `✅ No critical or high-severity issues detected.\n\n`;
  }

  summary += `**Agent Scores:**\n`;
  for (const review of reviews) {
    const emoji =
      review.score >= 9
        ? '🟢'
        : review.score >= 7
          ? '🟡'
          : review.score >= 5
            ? '🟠'
            : '🔴';
    summary += `- ${emoji} ${review.agentDescription}: ${review.score}/10`;
    if (review.findings.length > 0)
      summary += ` (${review.findings.length} finding${review.findings.length > 1 ? 's' : ''})`;
    summary += `\n`;
  }

  return summary;
}
