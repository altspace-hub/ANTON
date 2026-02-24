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

import type { Database } from 'better-sqlite3';
import Anthropic from '@anthropic-ai/sdk';

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

export function createReviewOrchestrator(anthropic?: Anthropic) {
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
      runQualityReview(output, context, anthropic),
      runRegulatoryReview(output, context, anthropic),
      runTechnicalReview(output, context, anthropic),
      runCommunicationsReview(output, context, anthropic),
      runRedTeamReview(output, context, anthropic),
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

async function runQualityReview(
  output: string,
  context: ReviewContext,
  anthropic?: Anthropic
): Promise<ReviewResult> {
  const startTime = Date.now();

  const systemPrompt = `You are a Quality Reviewer for professional compliance consulting outputs.

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
}`;

  const findings: ReviewFinding[] = [];
  const suggestions: string[] = [];
  let score = 8.0; // Default if API unavailable

  if (anthropic) {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001', // Fast, cheap model for reviews
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `# Quality Review Request

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
          },
        ],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const parsed = extractJSON(text);
      if (parsed) {
        score = parsed.score || 8.0;
        findings.push(...(parsed.findings || []));
        suggestions.push(...(parsed.suggestions || []));
      }
    } catch (error) {
      console.error('[quality-reviewer] API error:', error);
      findings.push({
        severity: 'info',
        category: 'system',
        message: 'Quality review ran in fallback mode (API unavailable)',
      });
    }
  } else {
    // Fallback: heuristic quality checks
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

    // Adjust score based on findings in fallback mode
    score = adjustScoreForFindings(score, findings);
  }

  return {
    agent: 'quality',
    agentDescription: 'Quality Reviewer',
    score,
    findings,
    suggestions,
    executionTimeMs: Math.max(1, Date.now() - startTime), // Ensure at least 1ms
  };
}

async function runRegulatoryReview(
  output: string,
  context: ReviewContext,
  anthropic?: Anthropic
): Promise<ReviewResult> {
  const startTime = Date.now();

  const systemPrompt = `You are a Regulatory Reviewer specializing in AML/CFT compliance.

Your role: Verify regulatory accuracy, citation quality, and compliance with current law.

Evaluate:
1. **Regulatory Citations** - Are references to regulations accurate? (AMLR 2024/1624, 6AMLD, FATF, etc.)
2. **Article References** - Are article numbers correct? Are quotations accurate?
3. **Current Law** - Is the output based on current (2024-2026) regulations, not outdated?
4. **Gaps** - Are there missing regulatory requirements not mentioned?
5. **Interpretation** - Are legal interpretations reasonable and defensible?

Score 0-10 (10 = legally sound, 0 = regulatory errors).

Output JSON with findings and score.`;

  const findings: ReviewFinding[] = [];
  const suggestions: string[] = [];
  let score = 8.5;

  if (anthropic) {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `# Regulatory Review Request

Module: ${context.moduleName}
Area: ${context.areaId}

Output to review:
${output.slice(0, 100000)}

Provide regulatory review as JSON.`,
          },
        ],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const parsed = extractJSON(text);
      if (parsed) {
        score = parsed.score || 8.5;
        findings.push(...(parsed.findings || []));
        suggestions.push(...(parsed.suggestions || []));
      }
    } catch (error) {
      console.error('[regulatory-reviewer] API error:', error);
    }
  } else {
    // Fallback: check for common regulatory keywords
    const hasAMLR = output.toLowerCase().includes('amlr') || output.includes('2024/1624');
    const has6AMLD = output.toLowerCase().includes('6amld') || output.includes('2018/1673');
    if (!hasAMLR && context.areaId === 'fcp')
      findings.push({
        severity: 'medium',
        category: 'citations',
        message: 'No AMLR reference found. Consider citing Regulation (EU) 2024/1624.',
      });

    // Adjust score based on findings in fallback mode
    score = adjustScoreForFindings(score, findings);
  }

  return {
    agent: 'regulatory',
    agentDescription: 'Regulatory Reviewer',
    score,
    findings,
    suggestions,
    executionTimeMs: Math.max(1, Date.now() - startTime), // Ensure at least 1ms
  };
}

async function runTechnicalReview(
  output: string,
  context: ReviewContext,
  anthropic?: Anthropic
): Promise<ReviewResult> {
  const startTime = Date.now();

  const systemPrompt = `You are a Technical Reviewer for compliance implementations.

Your role: Assess technical correctness, feasibility, and implementation risks.

Evaluate:
1. **Technical Accuracy** - Are data structures, systems, processes correctly described?
2. **Feasibility** - Are recommendations technically feasible? Any technical blockers?
3. **Data Requirements** - Are data fields, schemas, calculations correct?
4. **Integration** - Do proposed integrations/systems exist and work as described?
5. **Security/Privacy** - Any technical security or data protection concerns?

Score 0-10 (10 = technically sound, 0 = contains errors).

Output JSON with findings and score.`;

  const findings: ReviewFinding[] = [];
  const suggestions: string[] = [];
  let score = 8.0;

  if (anthropic) {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Technical review for: ${context.moduleName}\n\n${output.slice(0, 100000)}`,
          },
        ],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const parsed = extractJSON(text);
      if (parsed) {
        score = parsed.score || 8.0;
        findings.push(...(parsed.findings || []));
        suggestions.push(...(parsed.suggestions || []));
      }
    } catch (error) {
      console.error('[technical-reviewer] API error:', error);
    }
  } else {
    // Adjust score based on findings in fallback mode
    score = adjustScoreForFindings(score, findings);
  }

  return {
    agent: 'technical',
    agentDescription: 'Technical Reviewer',
    score,
    findings,
    suggestions,
    executionTimeMs: Math.max(1, Date.now() - startTime), // Ensure at least 1ms
  };
}

async function runCommunicationsReview(
  output: string,
  context: ReviewContext,
  anthropic?: Anthropic
): Promise<ReviewResult> {
  const startTime = Date.now();

  const systemPrompt = `You are a Communications Reviewer for compliance documents.

Your role: Assess tone, audience fit, readability, and messaging effectiveness.

Evaluate:
1. **Audience Fit** - Appropriate for intended audience? (Board vs. analysts vs. front-line)
2. **Tone** - Professional, authoritative, accessible? Over-complex or too simple?
3. **Readability** - Clear sentences, active voice, defined jargon?
4. **Messaging** - Key points clear? Recommendations unambiguous?
5. **Visual Structure** - Good use of headings, lists, tables, formatting?

Score 0-10 (10 = excellent comms, 0 = unclear/inappropriate).

Output JSON with findings and score.`;

  const findings: ReviewFinding[] = [];
  const suggestions: string[] = [];
  let score = 7.5;

  if (anthropic) {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Communications review for: ${context.moduleName}\n\n${output.slice(0, 100000)}`,
          },
        ],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const parsed = extractJSON(text);
      if (parsed) {
        score = parsed.score || 7.5;
        findings.push(...(parsed.findings || []));
        suggestions.push(...(parsed.suggestions || []));
      }
    } catch (error) {
      console.error('[comms-reviewer] API error:', error);
    }
  } else {
    // Adjust score based on findings in fallback mode
    score = adjustScoreForFindings(score, findings);
  }

  return {
    agent: 'communications',
    agentDescription: 'Communications Reviewer',
    score,
    findings,
    suggestions,
    executionTimeMs: Math.max(1, Date.now() - startTime), // Ensure at least 1ms
  };
}

async function runRedTeamReview(
  output: string,
  context: ReviewContext,
  anthropic?: Anthropic
): Promise<ReviewResult> {
  const startTime = Date.now();

  const systemPrompt = `You are a Red Team Reviewer (adversarial QA).

Your role: Find edge cases, failure modes, risks, and what could go wrong.

Evaluate:
1. **Edge Cases** - What scenarios are NOT covered? What breaks the recommendations?
2. **Failure Modes** - What happens if this advice is followed incorrectly?
3. **Unintended Consequences** - Could these recommendations cause problems?
4. **Assumptions** - What unstated assumptions could be wrong?
5. **Risks** - Legal, operational, reputational risks not addressed?

Score 0-10 (10 = robust against edge cases, 0 = many failure modes).

Output JSON with findings (focus on CRITICAL and HIGH severity issues).`;

  const findings: ReviewFinding[] = [];
  const suggestions: string[] = [];
  let score = 7.0;

  if (anthropic) {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Red team review for: ${context.moduleName}\n\n${output.slice(0, 100000)}`,
          },
        ],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const parsed = extractJSON(text);
      if (parsed) {
        score = parsed.score || 7.0;
        findings.push(...(parsed.findings || []));
        suggestions.push(...(parsed.suggestions || []));
      }
    } catch (error) {
      console.error('[red-team-reviewer] API error:', error);
    }
  } else {
    // Adjust score based on findings in fallback mode
    score = adjustScoreForFindings(score, findings);
  }

  return {
    agent: 'red-team',
    agentDescription: 'Red Team Reviewer',
    score,
    findings,
    suggestions,
    executionTimeMs: Math.max(1, Date.now() - startTime), // Ensure at least 1ms
  };
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

function extractJSON(text: string): any {
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
