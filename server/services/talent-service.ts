/**
 * talent-service.ts
 *
 * Service layer for the Talent Discovery & Recruitment module.
 * Handles campaigns, candidates, assessments, scoring dimensions,
 * communications, interview plans, shortlists, and audit trail.
 * EU AI Act + Pay Transparency Directive compliance built in.
 */

import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface TalentCampaign {
  id: string;
  title: string;
  department: string | null;
  hiring_manager: string | null;
  status: string;
  role_level: string | null;
  location: string | null;
  remote_policy: string | null;
  salary_range_min: number | null;
  salary_range_max: number | null;
  salary_currency: string;
  salary_period: string;
  headcount: number;
  discovery_document: string;
  capability_map: string;
  scoring_framework: string;
  ad_variants: string;
  selected_ad_variant: string | null;
  ad_content: string | null;
  ad_questions: string;
  bias_simulation_results: string | null;
  wildcard_threshold: number;
  shortlist_threshold: number;
  decline_threshold: number;
  eu_ai_act_log: string;
  created_by: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TalentCandidate {
  id: string;
  campaign_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string;
  cv_text: string | null;
  cv_file_path: string | null;
  cv_structured: string;
  cv_format: string;
  cv_parse_confidence: string | null;
  question_responses: string;
  followup_responses: string;
  status: string;
  composite_score: number | null;
  is_internal: boolean;
  is_wildcard: boolean;
  wildcard_reasoning: string | null;
  dashboard_token: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TalentAssessment {
  id: string;
  candidate_id: string;
  campaign_id: string;
  assessor_type: string;
  model_used: string | null;
  dimension_scores: string;
  composite_score: number | null;
  composite_percentage: number | null;
  reasoning: string | null;
  confidence: number | null;
  wild_card_flag: boolean;
  wild_card_reasoning: string | null;
  bias_findings: string;
  assessment_phase: string;
  assessed_at: string;
  created_at: string;
}

export interface TalentScoringDimension {
  id: string;
  campaign_id: string;
  name: string;
  description: string | null;
  weight: number;
  category: string;
  knockout_minimum: number | null;
  evaluation_guide: string | null;
  sort_order: number;
  created_at: string;
}

export interface TalentAuditEntry {
  id: string;
  campaign_id: string;
  candidate_id: string | null;
  action: string;
  action_detail: string | null;
  actor: string;
  actor_role: string | null;
  ai_model: string | null;
  eu_ai_act_category: string | null;
  metadata: string;
  created_at: string;
}

// ── Service Factory ──────────────────────────────────────────────────────────

export async function createTalentService(db: DatabaseAdapter) {

  // ── Audit helper (used throughout) ──────────────────────────────────────

  async function addAuditEntry(params: {
    campaignId: string;
    candidateId?: string;
    action: string;
    actionDetail?: string;
    actor?: string;
    actorRole?: string;
    aiModel?: string;
    euAiActCategory?: string;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    const id = randomUUID();
    await db.run(`
      INSERT INTO talent_audit_trail (id, campaign_id, candidate_id, action, action_detail,
                                       actor, actor_role, ai_model, eu_ai_act_category, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, id, params.campaignId, params.candidateId ?? null, params.action,
       params.actionDetail ?? null, params.actor ?? 'system', params.actorRole ?? null,
       params.aiModel ?? null, params.euAiActCategory ?? null,
       JSON.stringify(params.metadata ?? {}));
    return id;
  }

  // ── Campaigns ──────────────────────────────────────────────────────────

  async function createCampaign(params: {
    title: string;
    department?: string;
    hiringManager?: string;
    roleLevel?: string;
    location?: string;
    remotePolicy?: string;
    salaryRangeMin?: number;
    salaryRangeMax?: number;
    salaryCurrency?: string;
    salaryPeriod?: string;
    headcount?: number;
    createdBy?: string;
  }): Promise<string> {
    const id = `tc_${Date.now()}_${randomUUID().slice(0, 8)}`;
    await db.run(`
      INSERT INTO talent_campaigns (id, title, department, hiring_manager, role_level,
                                     location, remote_policy, salary_range_min, salary_range_max,
                                     salary_currency, salary_period, headcount, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, id, params.title, params.department ?? null, params.hiringManager ?? null,
       params.roleLevel ?? null, params.location ?? null, params.remotePolicy ?? null,
       params.salaryRangeMin ?? null, params.salaryRangeMax ?? null,
       params.salaryCurrency ?? 'EUR', params.salaryPeriod ?? 'annual',
       params.headcount ?? 1, params.createdBy ?? null);

    await addAuditEntry({
      campaignId: id,
      action: 'campaign_created',
      actionDetail: `Campaign "${params.title}" created`,
      actor: params.createdBy ?? 'system',
    });

    return id;
  }

  async function getCampaign(id: string): Promise<TalentCampaign | null> {
    return await db.get<TalentCampaign>('SELECT * FROM talent_campaigns WHERE id = ?', id) ?? null;
  }

  async function listCampaigns(params?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<TalentCampaign[]> {
    let where = 'WHERE 1=1';
    const args: unknown[] = [];
    if (params?.status) { where += ' AND status = ?'; args.push(params.status); }
    args.push(params?.limit ?? 50, params?.offset ?? 0);
    return await db.all<TalentCampaign>(
      `SELECT * FROM talent_campaigns ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`, ...args
    );
  }

  async function updateCampaign(id: string, updates: Record<string, unknown>): Promise<void> {
    const allowed = [
      'title', 'department', 'hiring_manager', 'status', 'role_level', 'location',
      'remote_policy', 'salary_range_min', 'salary_range_max', 'salary_currency',
      'salary_period', 'headcount', 'discovery_document', 'capability_map',
      'scoring_framework', 'ad_variants', 'selected_ad_variant', 'ad_content',
      'ad_questions', 'bias_simulation_results', 'wildcard_threshold',
      'shortlist_threshold', 'decline_threshold',
    ];
    const fields: string[] = [];
    const args: unknown[] = [];
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        fields.push(`${key} = ?`);
        const val = updates[key];
        args.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val);
      }
    }
    if (fields.length === 0) return;
    fields.push('updated_at = NOW()');
    if (updates.status === 'closed') fields.push('closed_at = NOW()');
    args.push(id);
    await db.run(`UPDATE talent_campaigns SET ${fields.join(', ')} WHERE id = ?`, ...args);
  }

  async function deleteCampaign(id: string): Promise<void> {
    await db.run('DELETE FROM talent_campaigns WHERE id = ?', id);
  }

  // ── Candidates ─────────────────────────────────────────────────────────

  async function addCandidate(params: {
    campaignId: string;
    name: string;
    email?: string;
    phone?: string;
    source?: string;
    cvText?: string;
    cvFilePath?: string;
    cvStructured?: Record<string, unknown>;
    cvFormat?: string;
    cvParseConfidence?: string;
    questionResponses?: Array<{ questionId: string; responseText: string }>;
    isInternal?: boolean;
    aspirationProfileId?: string;
  }): Promise<string> {
    const id = `tcand_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const dashboardToken = randomUUID();
    await db.run(`
      INSERT INTO talent_candidates (id, campaign_id, name, email, phone, source,
                                      cv_text, cv_file_path, cv_structured, cv_format, cv_parse_confidence,
                                      question_responses, is_internal, aspiration_profile_id, dashboard_token)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, id, params.campaignId, params.name, params.email ?? null, params.phone ?? null,
       params.source ?? 'direct', params.cvText ?? null, params.cvFilePath ?? null,
       JSON.stringify(params.cvStructured ?? {}), params.cvFormat ?? 'traditional',
       params.cvParseConfidence ?? null,
       JSON.stringify(params.questionResponses ?? []),
       params.isInternal ?? false, params.aspirationProfileId ?? null, dashboardToken);

    await addAuditEntry({
      campaignId: params.campaignId,
      candidateId: id,
      action: 'candidate_added',
      actionDetail: `Candidate "${params.name}" added (source: ${params.source ?? 'direct'})`,
    });

    return id;
  }

  async function getCandidate(id: string): Promise<TalentCandidate | null> {
    return await db.get<TalentCandidate>('SELECT * FROM talent_candidates WHERE id = ?', id) ?? null;
  }

  async function listCandidates(campaignId: string, params?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<TalentCandidate[]> {
    let where = 'WHERE campaign_id = ?';
    const args: unknown[] = [campaignId];
    if (params?.status) { where += ' AND status = ?'; args.push(params.status); }
    args.push(params?.limit ?? 100, params?.offset ?? 0);
    return await db.all<TalentCandidate>(
      `SELECT * FROM talent_candidates ${where} ORDER BY composite_score DESC NULLS LAST, created_at DESC LIMIT ? OFFSET ?`,
      ...args
    );
  }

  async function updateCandidate(id: string, updates: Record<string, unknown>): Promise<void> {
    const allowed = [
      'name', 'email', 'phone', 'source', 'cv_text', 'cv_file_path', 'cv_structured',
      'cv_format', 'cv_parse_confidence', 'question_responses', 'followup_responses',
      'status', 'composite_score', 'is_wildcard', 'wildcard_reasoning', 'notes',
      'outcome_message',
    ];
    const fields: string[] = [];
    const args: unknown[] = [];
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        fields.push(`${key} = ?`);
        const val = updates[key];
        args.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val);
      }
    }
    if (fields.length === 0) return;
    fields.push('updated_at = NOW()');
    if (updates.status === 'rejected') {
      // outcome_sent_at handled separately when comms are sent
    }
    args.push(id);
    await db.run(`UPDATE talent_candidates SET ${fields.join(', ')} WHERE id = ?`, ...args);
  }

  // ── Assessments ────────────────────────────────────────────────────────

  async function createAssessment(params: {
    candidateId: string;
    campaignId: string;
    assessorType: 'primary' | 'bias_auditor';
    modelUsed?: string;
    dimensionScores?: Array<{ dimension: string; score: number; reasoning: string; confidence?: number }>;
    compositeScore?: number;
    compositePercentage?: number;
    reasoning?: string;
    thinkingTrace?: string;
    confidence?: number;
    wildCardFlag?: boolean;
    wildCardReasoning?: string;
    wildCardDiscoveryLink?: string;
    uncertainties?: Array<{ dimension: string; description: string; followupRecommended: boolean }>;
    biasFindings?: Array<{ type: string; description: string; severity: string }>;
    frameworkDriftCheck?: { aligned: boolean; deviations: string[] };
    assessmentPhase?: string;
    transparencyLevel?: number;
  }): Promise<string> {
    const id = `tassess_${Date.now()}_${randomUUID().slice(0, 8)}`;
    await db.run(`
      INSERT INTO talent_assessments (id, candidate_id, campaign_id, assessor_type, model_used,
                                       dimension_scores, composite_score, composite_percentage,
                                       reasoning, thinking_trace, confidence, wild_card_flag,
                                       wild_card_reasoning, wild_card_discovery_link, uncertainties,
                                       bias_findings, framework_drift_check, assessment_phase, transparency_level)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, id, params.candidateId, params.campaignId, params.assessorType,
       params.modelUsed ?? null,
       JSON.stringify(params.dimensionScores ?? []),
       params.compositeScore ?? null, params.compositePercentage ?? null,
       params.reasoning ?? null, params.thinkingTrace ?? null,
       params.confidence ?? null, params.wildCardFlag ?? false,
       params.wildCardReasoning ?? null, params.wildCardDiscoveryLink ?? null,
       JSON.stringify(params.uncertainties ?? []),
       JSON.stringify(params.biasFindings ?? []),
       params.frameworkDriftCheck ? JSON.stringify(params.frameworkDriftCheck) : null,
       params.assessmentPhase ?? 'initial',
       params.transparencyLevel ?? 1);

    await addAuditEntry({
      campaignId: params.campaignId,
      candidateId: params.candidateId,
      action: `assessment_${params.assessorType}`,
      actionDetail: `${params.assessorType} assessment: score=${params.compositePercentage ?? 'N/A'}%`,
      aiModel: params.modelUsed,
      euAiActCategory: 'Art. 12 — Record-keeping',
    });

    return id;
  }

  async function getAssessments(candidateId: string): Promise<TalentAssessment[]> {
    return await db.all<TalentAssessment>(
      'SELECT * FROM talent_assessments WHERE candidate_id = ? ORDER BY assessed_at DESC', candidateId
    );
  }

  async function getCampaignAssessments(campaignId: string): Promise<TalentAssessment[]> {
    return await db.all<TalentAssessment>(
      'SELECT * FROM talent_assessments WHERE campaign_id = ? ORDER BY composite_percentage DESC NULLS LAST', campaignId
    );
  }

  // ── Scoring Dimensions ─────────────────────────────────────────────────

  async function createScoringDimension(params: {
    campaignId: string;
    name: string;
    description?: string;
    weight?: number;
    category?: string;
    knockoutMinimum?: number;
    evaluationGuide?: string;
    sortOrder?: number;
  }): Promise<string> {
    const id = `tdim_${Date.now()}_${randomUUID().slice(0, 8)}`;
    await db.run(`
      INSERT INTO talent_scoring_dimensions (id, campaign_id, name, description, weight,
                                              category, knockout_minimum, evaluation_guide, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, id, params.campaignId, params.name, params.description ?? null,
       params.weight ?? 1.0, params.category ?? 'custom',
       params.knockoutMinimum ?? null, params.evaluationGuide ?? null,
       params.sortOrder ?? 0);
    return id;
  }

  async function listScoringDimensions(campaignId: string): Promise<TalentScoringDimension[]> {
    return await db.all<TalentScoringDimension>(
      'SELECT * FROM talent_scoring_dimensions WHERE campaign_id = ? ORDER BY sort_order, created_at', campaignId
    );
  }

  async function updateScoringDimension(id: string, updates: Record<string, unknown>): Promise<void> {
    const allowed = ['name', 'description', 'weight', 'category', 'knockout_minimum', 'evaluation_guide', 'sort_order'];
    const fields: string[] = [];
    const args: unknown[] = [];
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        fields.push(`${key} = ?`);
        args.push(updates[key]);
      }
    }
    if (fields.length === 0) return;
    args.push(id);
    await db.run(`UPDATE talent_scoring_dimensions SET ${fields.join(', ')} WHERE id = ?`, ...args);
  }

  async function deleteScoringDimension(id: string): Promise<void> {
    await db.run('DELETE FROM talent_scoring_dimensions WHERE id = ?', id);
  }

  // ── Communications ─────────────────────────────────────────────────────

  async function createCommunication(params: {
    candidateId: string;
    campaignId: string;
    commType: string;
    subject?: string;
    body?: string;
    channel?: string;
  }): Promise<string> {
    const id = `tcomm_${Date.now()}_${randomUUID().slice(0, 8)}`;
    await db.run(`
      INSERT INTO talent_communications (id, candidate_id, campaign_id, comm_type, subject, body, channel)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, id, params.candidateId, params.campaignId, params.commType,
       params.subject ?? null, params.body ?? null, params.channel ?? 'portal');
    return id;
  }

  async function listCommunications(campaignId: string, candidateId?: string): Promise<Array<Record<string, unknown>>> {
    if (candidateId) {
      return await db.all(
        'SELECT * FROM talent_communications WHERE campaign_id = ? AND candidate_id = ? ORDER BY created_at DESC',
        campaignId, candidateId
      );
    }
    return await db.all(
      'SELECT * FROM talent_communications WHERE campaign_id = ? ORDER BY created_at DESC', campaignId
    );
  }

  async function updateCommunication(id: string, updates: { status?: string; body?: string; subject?: string; approved_by?: string }): Promise<void> {
    const fields: string[] = [];
    const args: unknown[] = [];
    if (updates.status) { fields.push('status = ?'); args.push(updates.status); }
    if (updates.body) { fields.push('body = ?'); args.push(updates.body); }
    if (updates.subject) { fields.push('subject = ?'); args.push(updates.subject); }
    if (updates.approved_by) { fields.push('approved_by = ?'); args.push(updates.approved_by); }
    if (updates.status === 'sent') { fields.push('sent_at = NOW()'); }
    if (fields.length === 0) return;
    args.push(id);
    await db.run(`UPDATE talent_communications SET ${fields.join(', ')} WHERE id = ?`, ...args);
  }

  // ── Interview Plans ────────────────────────────────────────────────────

  async function createInterviewPlan(params: {
    campaignId: string;
    candidateId?: string;
    round?: number;
    interviewType?: string;
    focusAreas?: string[];
    questions?: Array<{ text: string; dimension?: string; purpose?: string }>;
    evaluationCriteria?: Array<{ criterion: string; weight?: number }>;
    candidateSummary?: string;
    gapFillingNotes?: string;
    redFlagsToProbe?: string;
    durationMinutes?: number;
  }): Promise<string> {
    const id = `tint_${Date.now()}_${randomUUID().slice(0, 8)}`;
    await db.run(`
      INSERT INTO talent_interview_plans (id, campaign_id, candidate_id, round, interview_type,
                                           focus_areas, questions, evaluation_criteria,
                                           candidate_summary, gap_filling_notes, red_flags_to_probe,
                                           duration_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, id, params.campaignId, params.candidateId ?? null, params.round ?? 1,
       params.interviewType ?? null,
       JSON.stringify(params.focusAreas ?? []),
       JSON.stringify(params.questions ?? []),
       JSON.stringify(params.evaluationCriteria ?? []),
       params.candidateSummary ?? null, params.gapFillingNotes ?? null,
       params.redFlagsToProbe ?? null, params.durationMinutes ?? 60);
    return id;
  }

  async function listInterviewPlans(campaignId: string, candidateId?: string): Promise<Array<Record<string, unknown>>> {
    if (candidateId) {
      return await db.all(
        'SELECT * FROM talent_interview_plans WHERE campaign_id = ? AND candidate_id = ? ORDER BY round, created_at',
        campaignId, candidateId
      );
    }
    return await db.all(
      'SELECT * FROM talent_interview_plans WHERE campaign_id = ? ORDER BY round, created_at', campaignId
    );
  }

  async function updateInterviewPlan(id: string, updates: Record<string, unknown>): Promise<void> {
    const allowed = ['status', 'outcome', 'outcome_notes', 'scheduled_at', 'notes'];
    const fields: string[] = [];
    const args: unknown[] = [];
    for (const key of allowed) {
      if (updates[key] !== undefined) { fields.push(`${key} = ?`); args.push(updates[key]); }
    }
    if (fields.length === 0) return;
    args.push(id);
    await db.run(`UPDATE talent_interview_plans SET ${fields.join(', ')} WHERE id = ?`, ...args);
  }

  // ── Shortlists ─────────────────────────────────────────────────────────

  async function createShortlist(params: {
    campaignId: string;
    name?: string;
    candidateIds?: string[];
    rationale?: string;
    comparativeAnalysis?: Record<string, unknown>;
    createdBy?: string;
  }): Promise<string> {
    const id = `tsl_${Date.now()}_${randomUUID().slice(0, 8)}`;
    // Auto-increment version
    const latest = await db.get<{ max_version: number }>(
      'SELECT COALESCE(MAX(version), 0) as max_version FROM talent_shortlists WHERE campaign_id = ?',
      params.campaignId
    );
    const version = (latest?.max_version ?? 0) + 1;

    await db.run(`
      INSERT INTO talent_shortlists (id, campaign_id, name, version, candidate_ids,
                                      rationale, comparative_analysis, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, id, params.campaignId, params.name ?? 'Primary Shortlist', version,
       JSON.stringify(params.candidateIds ?? []),
       params.rationale ?? null,
       JSON.stringify(params.comparativeAnalysis ?? {}),
       params.createdBy ?? null);

    await addAuditEntry({
      campaignId: params.campaignId,
      action: 'shortlist_created',
      actionDetail: `Shortlist v${version} with ${(params.candidateIds ?? []).length} candidates`,
      actor: params.createdBy ?? 'system',
      euAiActCategory: 'Art. 14 — Human oversight',
    });

    return id;
  }

  async function listShortlists(campaignId: string): Promise<Array<Record<string, unknown>>> {
    return await db.all(
      'SELECT * FROM talent_shortlists WHERE campaign_id = ? ORDER BY version DESC', campaignId
    );
  }

  // ── Human Decisions ────────────────────────────────────────────────────

  async function recordHumanDecision(params: {
    campaignId: string;
    candidateId?: string;
    contextType: string;
    decision: string;
    reasoning?: string;
    previousState?: Record<string, unknown>;
    newState?: Record<string, unknown>;
    decidedBy: string;
  }): Promise<string> {
    const id = randomUUID();
    await db.run(`
      INSERT INTO talent_human_decisions (id, campaign_id, candidate_id, context_type,
                                           decision, reasoning, previous_state, new_state, decided_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, id, params.campaignId, params.candidateId ?? null, params.contextType,
       params.decision, params.reasoning ?? null,
       params.previousState ? JSON.stringify(params.previousState) : null,
       params.newState ? JSON.stringify(params.newState) : null,
       params.decidedBy);

    await addAuditEntry({
      campaignId: params.campaignId,
      candidateId: params.candidateId,
      action: `human_decision_${params.contextType}`,
      actionDetail: params.decision,
      actor: params.decidedBy,
      euAiActCategory: 'Art. 14 — Human oversight',
    });

    return id;
  }

  // ── Audit Trail ────────────────────────────────────────────────────────

  async function getAuditTrail(campaignId: string, params?: {
    candidateId?: string;
    action?: string;
    limit?: number;
  }): Promise<TalentAuditEntry[]> {
    let where = 'WHERE campaign_id = ?';
    const args: unknown[] = [campaignId];
    if (params?.candidateId) { where += ' AND candidate_id = ?'; args.push(params.candidateId); }
    if (params?.action) { where += ' AND action = ?'; args.push(params.action); }
    args.push(params?.limit ?? 100);
    return await db.all<TalentAuditEntry>(
      `SELECT * FROM talent_audit_trail ${where} ORDER BY created_at DESC LIMIT ?`, ...args
    );
  }

  // ── Dashboard Stats ────────────────────────────────────────────────────

  async function getCampaignStats(campaignId: string): Promise<Record<string, unknown>> {
    const candidates = await db.get<{ total: number }>(
      'SELECT COUNT(*) as total FROM talent_candidates WHERE campaign_id = ?', campaignId
    );
    const assessed = await db.get<{ total: number }>(
      "SELECT COUNT(DISTINCT candidate_id) as total FROM talent_assessments WHERE campaign_id = ?", campaignId
    );
    const shortlisted = await db.get<{ total: number }>(
      "SELECT COUNT(*) as total FROM talent_candidates WHERE campaign_id = ? AND status = 'shortlisted'", campaignId
    );
    const avgScore = await db.get<{ avg: number }>(
      'SELECT AVG(composite_score) as avg FROM talent_candidates WHERE campaign_id = ? AND composite_score IS NOT NULL', campaignId
    );
    return {
      totalCandidates: candidates?.total ?? 0,
      assessed: assessed?.total ?? 0,
      shortlisted: shortlisted?.total ?? 0,
      averageScore: avgScore?.avg ? Math.round(avgScore.avg * 100) / 100 : null,
    };
  }

  // ── Return public API ──────────────────────────────────────────────────

  return {
    // Campaigns
    createCampaign, getCampaign, listCampaigns, updateCampaign, deleteCampaign,
    // Candidates
    addCandidate, getCandidate, listCandidates, updateCandidate,
    // Assessments
    createAssessment, getAssessments, getCampaignAssessments,
    // Scoring Dimensions
    createScoringDimension, listScoringDimensions, updateScoringDimension, deleteScoringDimension,
    // Communications
    createCommunication, listCommunications, updateCommunication,
    // Interview Plans
    createInterviewPlan, listInterviewPlans, updateInterviewPlan,
    // Shortlists
    createShortlist, listShortlists,
    // Human Decisions
    recordHumanDecision,
    // Audit
    addAuditEntry, getAuditTrail,
    // Stats
    getCampaignStats,
  };
}

export type TalentService = Awaited<ReturnType<typeof createTalentService>>;
