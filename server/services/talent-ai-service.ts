/**
 * talent-ai-service.ts
 *
 * AI-powered operations for the Talent module:
 * - Ad generation from capability maps
 * - Scoring framework generation
 * - Candidate assessment (dual-model: primary + bias auditor)
 * - Wild card detection
 * - Follow-up question generation
 * - Interview plan generation
 * - Communication drafting
 * - Internal mobility matching
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { DatabaseAdapter } from '../db/database.js';
import { callChat, resolveModel } from './provider-router.js';
import { MODEL_REGISTRY } from '../types/modelAdapter.js';
import { createTalentService } from './talent-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readPrompt(name: string): string {
  const promptPath = path.join(__dirname, '..', 'prompts', `${name}.md`);
  return fs.existsSync(promptPath) ? fs.readFileSync(promptPath, 'utf-8') : '';
}

export async function createTalentAIService(db: DatabaseAdapter) {
  const talentService = await createTalentService(db);

  /**
   * Resolve the safe maximum output tokens for the active model.
   * Uses MODEL_REGISTRY to find the model's max, then caps the requested amount.
   * Falls back to 16384 if the model isn't in the registry.
   */
  function safeMaxTokens(requested: number, model?: string): number {
    const resolvedId = resolveModel(model, model ? undefined : 'medium');
    const config = MODEL_REGISTRY[resolvedId];
    const modelMax = config?.maxOutputTokens ?? 16384;
    return Math.min(requested, modelMax);
  }

  /**
   * Call any configured LLM via the provider router.
   * Uses the user's selected model or falls back to the configured default.
   * Supports: Claude, Mistral, OpenAI, Google Gemini, Azure OpenAI, Ollama.
   * Automatically clamps maxTokens to the model's capability.
   */
  async function callLLM(
    systemPrompt: string,
    userMessage: string,
    model?: string,
    maxTokens = 16384
  ): Promise<string> {
    const result = await callChat({
      model,
      tier: model ? undefined : 'medium',
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: safeMaxTokens(maxTokens, model),
      db,
    });
    return result.text;
  }

  function parseJSON(raw: string): unknown {
    let cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
    // Handle truncated JSON — find last complete object/array
    if (cleaned.startsWith('{') && !cleaned.endsWith('}')) {
      const lastBrace = cleaned.lastIndexOf('}');
      if (lastBrace > 0) cleaned = cleaned.slice(0, lastBrace + 1);
    }
    if (cleaned.startsWith('[') && !cleaned.endsWith(']')) {
      const lastBrace = cleaned.lastIndexOf('}');
      if (lastBrace > 0) cleaned = cleaned.slice(0, lastBrace + 1) + ']';
    }
    try {
      return JSON.parse(cleaned);
    } catch (err) {
      console.error('[talent-ai] JSON parse failed. Raw (first 500 chars):', raw.slice(0, 500));
      throw new Error(`Failed to parse LLM response as JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Ad Generation ──────────────────────────────────────────────────────

  async function generateAd(campaignId: string, variant: 'mirror' | 'complement' | 'future_proof'): Promise<{
    adContent: string;
    assessmentFramework: unknown;
    questions: unknown[];
  }> {
    const campaign = await talentService.getCampaign(campaignId);
    if (!campaign) throw new Error('Campaign not found');

    const systemPrompt = readPrompt('talent-ad-generation');
    const capMap = typeof campaign.capability_map === 'string'
      ? campaign.capability_map : JSON.stringify(campaign.capability_map);
    const discovery = typeof campaign.discovery_document === 'string'
      ? campaign.discovery_document : JSON.stringify(campaign.discovery_document);

    const userMessage = `Generate a ${variant.replace('_', '-')} job advertisement variant.

CAMPAIGN: ${campaign.title}
DEPARTMENT: ${campaign.department ?? 'Not specified'}
ROLE LEVEL: ${campaign.role_level ?? 'Not specified'}
LOCATION: ${campaign.location ?? 'Not specified'}
SALARY RANGE: ${campaign.salary_currency} ${campaign.salary_range_min ?? '?'} - ${campaign.salary_range_max ?? '?'} ${campaign.salary_period ?? 'annual'}
HEADCOUNT: ${campaign.headcount}

CAPABILITY MAP:
${capMap}

DISCOVERY DOCUMENT:
${discovery}

Generate the ad as JSON per the output format specification.`;

    const result = await callLLM(systemPrompt, userMessage, undefined, 65536);
    const parsed = parseJSON(result) as Record<string, unknown>;

    await talentService.addAuditEntry({
      campaignId,
      action: 'ad_generated',
      actionDetail: `${variant} ad variant generated`,
      aiModel: 'provider-router',
      euAiActCategory: 'Art. 13 — Transparency',
    });

    return {
      adContent: (parsed.ad_content ?? parsed.content ?? result) as string,
      assessmentFramework: parsed.assessment_framework ?? {},
      questions: (parsed.questions ?? []) as unknown[],
    };
  }

  // ── Scoring Framework Generation ───────────────────────────────────────

  async function generateScoringFramework(campaignId: string): Promise<Array<{
    name: string; weight: number; category: string; description: string;
  }>> {
    const campaign = await talentService.getCampaign(campaignId);
    if (!campaign) throw new Error('Campaign not found');

    const capMap = typeof campaign.capability_map === 'string'
      ? campaign.capability_map : JSON.stringify(campaign.capability_map);

    const result = await callLLM(
      'You are an assessment framework designer. Generate scoring dimensions from a capability map.',
      `Based on this capability map, generate 5-8 scoring dimensions with weights summing to 100%.

CAPABILITY MAP:
${capMap}

ROLE: ${campaign.title}
LEVEL: ${campaign.role_level ?? 'mid'}

Return JSON array: [{ "name": "", "weight": 0, "category": "technical|experience|education|team_complementarity|problem_solving|leadership|growth_potential|cultural", "description": "", "evaluation_guide": "what does 1-5 look like" }]

Return ONLY the JSON array.`,
      undefined, 32768
    );

    const dimensions = parseJSON(result) as Array<{
      name: string; weight: number; category: string; description: string; evaluation_guide?: string;
    }>;

    // Persist dimensions
    for (let i = 0; i < dimensions.length; i++) {
      const d = dimensions[i];
      await talentService.createScoringDimension({
        campaignId,
        name: d.name,
        description: d.description,
        weight: d.weight,
        category: d.category,
        evaluationGuide: d.evaluation_guide,
        sortOrder: i,
      });
    }

    await talentService.addAuditEntry({
      campaignId,
      action: 'framework_generated',
      actionDetail: `${dimensions.length} scoring dimensions generated from capability map`,
      aiModel: 'provider-router',
    });

    return dimensions;
  }

  // ── Candidate Assessment (Dual-Model) ──────────────────────────────────

  async function assessCandidate(candidateId: string): Promise<{
    primaryAssessmentId: string;
    biasAuditId: string;
    compositeScore: number;
    compositePercentage: number;
  }> {
    const candidate = await talentService.getCandidate(candidateId);
    if (!candidate) throw new Error('Candidate not found');

    const campaign = await talentService.getCampaign(candidate.campaign_id);
    if (!campaign) throw new Error('Campaign not found');

    const dimensions = await talentService.listScoringDimensions(candidate.campaign_id);
    if (dimensions.length === 0) throw new Error('No scoring dimensions defined. Create a scoring framework first.');

    const systemPrompt = readPrompt('talent-assessment');
    // The CV lives in cv_text (raw) and/or cv_structured (parsed JSONB, which
    // DEFAULTS to '{}'). Only cv_structured used to be read, so an un-parsed
    // candidate was assessed against an empty '{}' — the LLM never saw the CV.
    // Prefer structured data when it actually holds something, else the raw text.
    const structuredStr = typeof candidate.cv_structured === 'string'
      ? candidate.cv_structured : JSON.stringify(candidate.cv_structured ?? {});
    const structuredTrimmed = (structuredStr ?? '').trim();
    const hasStructured = structuredTrimmed !== '' && structuredTrimmed !== '{}' && structuredTrimmed !== 'null';
    const cvText = (candidate.cv_text ?? '').toString().trim();
    const cvData = hasStructured ? structuredStr : cvText;
    const qResponses = typeof candidate.question_responses === 'string'
      ? candidate.question_responses : JSON.stringify(candidate.question_responses);
    const qTrimmed = (qResponses ?? '').trim();
    const hasResponses = qTrimmed !== '' && qTrimmed !== '[]' && qTrimmed !== 'null';

    if (!cvData.trim() && !hasResponses) {
      throw new Error('Candidate has no CV (cv_text or cv_structured) or question responses to assess — attach a CV first.');
    }
    const capMap = typeof campaign.capability_map === 'string'
      ? campaign.capability_map : JSON.stringify(campaign.capability_map);

    const frameworkText = dimensions.map(d =>
      `- ${d.name} (${d.weight}%, category: ${d.category}${d.knockout_minimum ? `, knockout min: ${d.knockout_minimum}` : ''})`
    ).join('\n');

    // ── Model 1: Primary Assessment (Opus) ───────────────────────────
    const primaryResult = await callLLM(systemPrompt, `
ASSESSMENT FRAMEWORK:
${frameworkText}

TEAM CONTEXT (capability map):
${capMap}

CANDIDATE: ${candidate.name}
CV DATA (${candidate.cv_parse_confidence ?? 'unknown'} confidence):
${cvData}

QUESTION RESPONSES:
${qResponses}

Assess this candidate against the published framework. Return JSON per the output format.`,
      undefined, 65536
    );

    const primaryParsed = parseJSON(primaryResult) as Record<string, unknown>;
    const dimScores = (primaryParsed.dimension_scores ?? []) as Array<Record<string, unknown>>;
    const compositePercentage = Number(primaryParsed.composite_percentage ?? 0);

    const primaryId = await talentService.createAssessment({
      candidateId,
      campaignId: candidate.campaign_id,
      assessorType: 'primary',
      modelUsed: 'provider-router-default',
      dimensionScores: dimScores as unknown as Array<{ dimension: string; score: number; reasoning: string; confidence?: number }>,
      compositeScore: Number(primaryParsed.composite_score ?? 0),
      compositePercentage,
      reasoning: primaryParsed.overall_assessment as string ?? null,
      confidence: Number(primaryParsed.confidence ?? 0.7),
      wildCardFlag: Boolean(primaryParsed.wild_card_flag),
      wildCardReasoning: primaryParsed.wild_card_reasoning as string ?? null,
      wildCardDiscoveryLink: primaryParsed.wild_card_discovery_link as string ?? null,
      uncertainties: (primaryParsed.uncertainties ?? []) as Array<{ dimension: string; description: string; followupRecommended: boolean }>,
      assessmentPhase: 'initial',
    });

    // ── Model 2: Bias Audit (Sonnet) ─────────────────────────────────
    const biasResult = await callLLM(
      `You are a Bias Auditor for an AI recruitment system. Your mandate is to review the primary assessor's scoring for:
1. Proxy discrimination (scoring patterns that correlate with protected characteristics)
2. Framework drift (is scoring following published weights, or has implicit bias crept in?)
3. Consistency (are similar candidates scored similarly?)
4. Language bias (is native-sounding language scored higher than competent non-native?)

Return JSON: { "findings": [{ "type": "proxy|drift|consistency|language", "description": "", "severity": "high|medium|low" }], "framework_aligned": true/false, "deviations": [], "overall_bias_risk": "low|medium|high" }`,
      `Review this primary assessment for bias:

CANDIDATE: ${candidate.name}
PRIMARY ASSESSMENT SCORES:
${JSON.stringify(dimScores, null, 2)}

COMPOSITE: ${compositePercentage}%
REASONING: ${primaryParsed.overall_assessment ?? 'N/A'}

FRAMEWORK WEIGHTS:
${frameworkText}

Check for bias. Return ONLY JSON.`,
      undefined, 32768
    );

    const biasParsed = parseJSON(biasResult) as Record<string, unknown>;

    const biasId = await talentService.createAssessment({
      candidateId,
      campaignId: candidate.campaign_id,
      assessorType: 'bias_auditor',
      modelUsed: 'provider-router-default',
      biasFindings: (biasParsed.findings ?? []) as Array<{ type: string; description: string; severity: string }>,
      frameworkDriftCheck: {
        aligned: Boolean(biasParsed.framework_aligned),
        deviations: (biasParsed.deviations ?? []) as string[],
      },
      assessmentPhase: 'initial',
    });

    // Update candidate composite score and status
    await talentService.updateCandidate(candidateId, {
      composite_score: compositePercentage,
      status: 'assessed',
      is_wildcard: Boolean(primaryParsed.wild_card_flag),
      wildcard_reasoning: primaryParsed.wild_card_reasoning as string ?? null,
    });

    return {
      primaryAssessmentId: primaryId,
      biasAuditId: biasId,
      compositeScore: Number(primaryParsed.composite_score ?? 0),
      compositePercentage,
    };
  }

  // ── Interview Plan Generation ──────────────────────────────────────────

  async function generateInterviewPlan(campaignId: string, candidateId: string): Promise<string> {
    const candidate = await talentService.getCandidate(candidateId);
    if (!candidate) throw new Error('Candidate not found');

    const campaign = await talentService.getCampaign(campaignId);
    if (!campaign) throw new Error('Campaign not found');

    const assessments = await talentService.getAssessments(candidateId);
    const primary = assessments.find(a => a.assessor_type === 'primary');

    const result = await callLLM(
      'You are an interview preparation specialist. Generate targeted interview questions that fill gaps identified in the AI assessment.',
      `Generate an interview plan for this candidate.

ROLE: ${campaign.title} (${campaign.department ?? ''})
CANDIDATE: ${candidate.name}
COMPOSITE SCORE: ${candidate.composite_score ?? 'N/A'}%

ASSESSMENT:
${primary?.reasoning ?? 'No assessment yet'}

DIMENSION SCORES:
${primary ? (typeof primary.dimension_scores === 'string' ? primary.dimension_scores : JSON.stringify(primary.dimension_scores)) : '[]'}

Generate JSON:
{
  "candidate_summary": "3-4 sentence summary of strengths and concerns",
  "focus_areas": ["areas to probe in interview"],
  "questions": [{ "text": "", "dimension": "", "purpose": "what this question tests" }],
  "red_flags_to_probe": "specific things to explore carefully",
  "gap_filling_notes": "where the assessment was uncertain"
}

Return ONLY JSON.`,
      undefined, 32768
    );

    const parsed = parseJSON(result) as Record<string, unknown>;

    const planId = await talentService.createInterviewPlan({
      campaignId,
      candidateId,
      interviewType: 'behavioral',
      focusAreas: (parsed.focus_areas ?? []) as string[],
      questions: (parsed.questions ?? []) as Array<{ text: string; dimension?: string; purpose?: string }>,
      candidateSummary: parsed.candidate_summary as string ?? null,
      gapFillingNotes: parsed.gap_filling_notes as string ?? null,
      redFlagsToProbe: parsed.red_flags_to_probe as string ?? null,
    });

    await talentService.addAuditEntry({
      campaignId,
      candidateId,
      action: 'interview_plan_generated',
      actionDetail: `Interview plan with ${((parsed.questions ?? []) as unknown[]).length} questions`,
      aiModel: 'provider-router',
    });

    return planId;
  }

  // ── Communication Drafting ─────────────────────────────────────────────

  async function draftCommunication(candidateId: string, commType: string): Promise<string> {
    const candidate = await talentService.getCandidate(candidateId);
    if (!candidate) throw new Error('Candidate not found');

    const campaign = await talentService.getCampaign(candidate.campaign_id);
    if (!campaign) throw new Error('Campaign not found');

    const result = await callLLM(
      'You are a professional recruitment communicator. Draft clear, respectful messages that treat candidates as equals.',
      `Draft a "${commType}" communication for this candidate.

ROLE: ${campaign.title}
CANDIDATE: ${candidate.name}
STATUS: ${candidate.status}
SCORE: ${candidate.composite_score ?? 'N/A'}%

Communication types:
- acknowledgement: Thank them for applying, confirm receipt, set timeline expectations
- status_update: Inform of progress, next steps
- followup_invite: Invite to answer follow-up questions (optional, no penalty for skipping)
- interview_invite: Invite to interview with logistics
- rejection: Respectful decline that acknowledges what was strong in their application
- offer: Congratulate and outline next steps
- ai_disclosure: Inform that AI was used in assessment (EU AI Act Art. 13)

Return JSON: { "subject": "", "body": "" }
The body should be professional, warm, and specific to this candidate — not a form letter.
Return ONLY JSON.`,
      undefined, 32768
    );

    const parsed = parseJSON(result) as { subject?: string; body?: string };

    const commId = await talentService.createCommunication({
      candidateId,
      campaignId: candidate.campaign_id,
      commType,
      subject: parsed.subject,
      body: parsed.body,
    });

    return commId;
  }

  // ── Bias Simulation ────────────────────────────────────────────────────

  async function runBiasSimulation(campaignId: string): Promise<unknown> {
    const dimensions = await talentService.listScoringDimensions(campaignId);
    const campaign = await talentService.getCampaign(campaignId);
    if (!campaign) throw new Error('Campaign not found');

    const frameworkText = dimensions.map(d =>
      `- ${d.name}: ${d.weight}% (${d.category})`
    ).join('\n');

    const result = await callLLM(
      'You are a recruitment bias analyst.',
      `Analyze this Assessment Framework for potential adverse impact on diverse candidate pools.

ROLE: ${campaign.title}
FRAMEWORK:
${frameworkText}

For each dimension, identify:
1. Demographics that might be systematically disadvantaged
2. Whether this dimension functions as a proxy for a protected characteristic
3. Suggestions for less biased alternatives

Return JSON: { "findings": [{ "dimension": "", "risk_level": "high|medium|low", "affected_groups": [], "proxy_risk": "", "recommendation": "" }], "overall_risk": "low|medium|high", "summary": "" }
Return ONLY JSON.`,
      undefined, 32768
    );

    const parsed = parseJSON(result);

    await talentService.updateCampaign(campaignId, { bias_simulation_results: parsed });
    await talentService.addAuditEntry({
      campaignId,
      action: 'bias_simulation',
      actionDetail: 'Weight bias simulation completed',
      aiModel: 'provider-router',
      euAiActCategory: 'Art. 9 — Risk management',
    });

    return parsed;
  }

  // ── Shortlist Rationale Generation ─────────────────────────────────────

  async function generateShortlistRationale(campaignId: string, candidateIds: string[]): Promise<string> {
    const candidates = [];
    for (const cid of candidateIds) {
      const c = await talentService.getCandidate(cid);
      if (c) candidates.push(c);
    }

    const campaign = await talentService.getCampaign(campaignId);
    if (!campaign) throw new Error('Campaign not found');

    const result = await callLLM(
      'You are a recruitment decision advisor. Generate clear rationale for shortlist decisions.',
      `Generate a shortlist rationale for these ${candidates.length} candidates.

ROLE: ${campaign.title}
CANDIDATES:
${candidates.map(c => `- ${c.name}: ${c.composite_score ?? 'N/A'}% (${c.status})${c.is_wildcard ? ' [WILD CARD]' : ''}`).join('\n')}

Explain:
1. Why each candidate was included
2. How the group balances different strengths
3. Any gaps the shortlist doesn't cover
4. Wild card justification if applicable

Return a clear text rationale (not JSON).`,
      undefined, 32768
    );

    return result;
  }

  // ── Compliance Check ───────────────────────────────────────────────────

  async function checkCompliance(campaignId: string): Promise<Array<{
    rule: string; status: 'pass' | 'fail' | 'warning'; detail: string;
  }>> {
    const campaign = await talentService.getCampaign(campaignId);
    if (!campaign) return [];

    const checks: Array<{ rule: string; status: 'pass' | 'fail' | 'warning'; detail: string }> = [];

    // EUPT-001: Salary range published before ad
    if (campaign.status !== 'discovery') {
      checks.push({
        rule: 'EUPT-RECRUIT-001',
        status: campaign.salary_range_min && campaign.salary_range_max ? 'pass' : 'fail',
        detail: campaign.salary_range_min
          ? `Salary range: ${campaign.salary_currency} ${campaign.salary_range_min}-${campaign.salary_range_max}`
          : 'Salary range not set — required by EU Pay Transparency Directive',
      });
    }

    // EUAIA-001: Human oversight for rejections
    const rejected = await db.all<{ id: string; name: string }>(
      "SELECT id, name FROM talent_candidates WHERE campaign_id = ? AND status = 'rejected'", campaignId
    );
    for (const c of rejected) {
      const decision = await db.get<{ id: string }>(
        "SELECT id FROM talent_human_decisions WHERE campaign_id = ? AND candidate_id = ? AND context_type = 'decline_approval'",
        campaignId, c.id
      );
      checks.push({
        rule: 'EUAIA-RECRUIT-001',
        status: decision ? 'pass' : 'fail',
        detail: decision
          ? `Rejection of ${c.name} has human oversight record`
          : `Rejection of ${c.name} lacks human decision record — required by EU AI Act Art. 14`,
      });
    }

    // EUAIA-003: AI disclosure sent
    const assessed = await db.all<{ id: string; name: string }>(
      "SELECT id, name FROM talent_candidates WHERE campaign_id = ? AND status NOT IN ('new', 'withdrawn')", campaignId
    );
    for (const c of assessed) {
      const disclosure = await db.get<{ id: string }>(
        "SELECT id FROM talent_communications WHERE candidate_id = ? AND comm_type = 'ai_disclosure'", c.id
      );
      checks.push({
        rule: 'EUAIA-RECRUIT-003',
        status: disclosure ? 'pass' : 'warning',
        detail: disclosure
          ? `AI disclosure sent to ${c.name}`
          : `AI disclosure not yet sent to ${c.name}`,
      });
    }

    // EUAIA-004: Assessment reasoning logged
    const assessments = await talentService.getCampaignAssessments(campaignId);
    const withoutReasoning = assessments.filter(a => a.assessor_type === 'primary' && !a.reasoning);
    checks.push({
      rule: 'EUAIA-RECRUIT-004',
      status: withoutReasoning.length === 0 ? 'pass' : 'warning',
      detail: withoutReasoning.length === 0
        ? 'All assessments have reasoning traces'
        : `${withoutReasoning.length} assessment(s) missing reasoning trace`,
    });

    // EUAIA-002: Bias audit before shortlist
    if (campaign.status === 'shortlist' || campaign.status === 'interview') {
      const biasAudits = assessments.filter(a => a.assessor_type === 'bias_auditor');
      checks.push({
        rule: 'EUAIA-RECRUIT-002',
        status: biasAudits.length > 0 ? 'pass' : 'fail',
        detail: biasAudits.length > 0
          ? `${biasAudits.length} bias audit(s) completed`
          : 'No bias audits performed — required before shortlist finalization',
      });
    }

    return checks;
  }

  return {
    generateAd,
    generateScoringFramework,
    assessCandidate,
    generateInterviewPlan,
    draftCommunication,
    runBiasSimulation,
    generateShortlistRationale,
    checkCompliance,
  };
}

export type TalentAIService = Awaited<ReturnType<typeof createTalentAIService>>;
