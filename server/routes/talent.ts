/**
 * talent.ts
 * REST API for the Talent Discovery & Recruitment module.
 * Handles campaigns, candidates, assessments, scoring dimensions,
 * communications, interview plans, shortlists, and audit trail.
 * EU AI Act + Pay Transparency Directive compliance enforced.
 */

import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseAdapter } from '../db/database.js';
import { createTalentService } from '../services/talent-service.js';
import { createTalentAIService } from '../services/talent-ai-service.js';
import { safeError } from '../lib/error-response.js';

// ── Zod Schemas ─────────────────────────────────────────────────────────────

const createCampaignSchema = z.object({
  title: z.string().min(1).max(500),
  department: z.string().max(200).optional(),
  hiringManager: z.string().max(200).optional(),
  roleLevel: z.enum(['entry', 'mid', 'senior', 'lead', 'executive']).optional(),
  location: z.string().max(300).optional(),
  remotePolicy: z.enum(['onsite', 'hybrid', 'remote', 'flexible']).optional(),
  salaryRangeMin: z.number().positive().optional(),
  salaryRangeMax: z.number().positive().optional(),
  salaryCurrency: z.string().length(3).optional(),
  salaryPeriod: z.enum(['annual', 'monthly', 'hourly']).optional(),
  headcount: z.number().int().positive().optional(),
});

const updateCampaignSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  department: z.string().max(200).optional(),
  hiring_manager: z.string().max(200).optional(),
  status: z.enum(['discovery', 'ad_live', 'screening', 'shortlist', 'interview', 'offer', 'closed']).optional(),
  role_level: z.enum(['entry', 'mid', 'senior', 'lead', 'executive']).optional(),
  location: z.string().max(300).optional(),
  remote_policy: z.enum(['onsite', 'hybrid', 'remote', 'flexible']).optional(),
  salary_range_min: z.number().positive().optional(),
  salary_range_max: z.number().positive().optional(),
  salary_currency: z.string().length(3).optional(),
  salary_period: z.enum(['annual', 'monthly', 'hourly']).optional(),
  headcount: z.number().int().positive().optional(),
  discovery_document: z.record(z.unknown()).optional(),
  capability_map: z.record(z.unknown()).optional(),
  scoring_framework: z.record(z.unknown()).optional(),
  ad_variants: z.array(z.record(z.unknown())).optional(),
  selected_ad_variant: z.string().optional(),
  ad_content: z.string().optional(),
  ad_questions: z.array(z.record(z.unknown())).optional(),
  wildcard_threshold: z.number().min(0).max(100).optional(),
  shortlist_threshold: z.number().min(0).max(100).optional(),
  decline_threshold: z.number().min(0).max(100).optional(),
});

const addCandidateSchema = z.object({
  name: z.string().min(1).max(300),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  source: z.enum(['direct', 'referral', 'agency', 'internal', 'ad_response', 'other']).optional(),
  cvText: z.string().optional(),
  questionResponses: z.array(z.object({
    questionId: z.string(),
    responseText: z.string(),
  })).optional(),
  isInternal: z.boolean().optional(),
});

const updateCandidateSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  status: z.enum(['new', 'screening', 'assessed', 'followup_sent', 'followup_received',
                   'shortlisted', 'interview', 'offer', 'hired', 'rejected', 'withdrawn']).optional(),
  notes: z.string().optional(),
  question_responses: z.array(z.record(z.unknown())).optional(),
  followup_responses: z.array(z.record(z.unknown())).optional(),
});

const createDimensionSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  weight: z.number().min(0).max(100).optional(),
  category: z.enum(['technical', 'experience', 'education', 'team_complementarity',
                     'problem_solving', 'leadership', 'growth_potential', 'cultural', 'custom']).optional(),
  knockoutMinimum: z.number().int().min(1).max(5).optional(),
  evaluationGuide: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

const updateDimensionSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  weight: z.number().min(0).max(100).optional(),
  category: z.string().optional(),
  knockout_minimum: z.number().int().min(1).max(5).nullable().optional(),
  evaluation_guide: z.string().optional(),
  sort_order: z.number().int().optional(),
});

const createShortlistSchema = z.object({
  name: z.string().max(200).optional(),
  candidateIds: z.array(z.string()).optional(),
  rationale: z.string().optional(),
});

const humanDecisionSchema = z.object({
  candidateId: z.string().optional(),
  contextType: z.enum(['ad_approval', 'framework_adjustment', 'followup_approval',
                        'shortlist_override', 'ranking_override', 'decline_approval',
                        'wildcard_decision', 'bias_override']),
  decision: z.string().min(1),
  reasoning: z.string().optional(),
  previousState: z.record(z.unknown()).optional(),
  newState: z.record(z.unknown()).optional(),
});

// ── Route Factory ───────────────────────────────────────────────────────────

export async function createTalentRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();
  const service = await createTalentService(db);
  const aiService = await createTalentAIService(db);

  // ── Campaigns ──────────────────────────────────────────────────────────

  router.get('/talent/campaigns', async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const offset = req.query.offset ? Number(req.query.offset) : undefined;
      const campaigns = await service.listCampaigns({ status, limit, offset });
      res.json({ success: true, campaigns });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  router.post('/talent/campaigns', async (req, res) => {
    try {
      const parsed = createCampaignSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const id = await service.createCampaign({
        ...parsed.data,
        createdBy: (req as unknown as { user?: { id: string } }).user?.id ?? 'solo',
      });
      res.status(201).json({ success: true, id });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  router.get('/talent/campaigns/:id', async (req, res) => {
    try {
      const campaign = await service.getCampaign(req.params.id);
      if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
      const stats = await service.getCampaignStats(req.params.id);
      res.json({ success: true, campaign, stats });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  router.put('/talent/campaigns/:id', async (req, res) => {
    try {
      const parsed = updateCampaignSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      // EU Pay Transparency: block any status beyond discovery without salary range
      const statusesThatRequireSalary = ['ad_live', 'screening', 'shortlist', 'interview', 'offer'];
      if (parsed.data.status && statusesThatRequireSalary.includes(parsed.data.status)) {
        const campaign = await service.getCampaign(req.params.id);
        const minSalary = parsed.data.salary_range_min ?? campaign?.salary_range_min;
        const maxSalary = parsed.data.salary_range_max ?? campaign?.salary_range_max;
        if (!minSalary || !maxSalary) {
          res.status(400).json({
            error: 'EU Pay Transparency Directive (2023/970) requires salary range before advancing beyond discovery phase',
            compliance: 'EUPT-RECRUIT-001',
          });
          return;
        }
      }
      await service.updateCampaign(req.params.id, parsed.data);
      res.json({ success: true });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  router.delete('/talent/campaigns/:id', async (req, res) => {
    try {
      await service.deleteCampaign(req.params.id);
      res.json({ success: true });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // ── Candidates ─────────────────────────────────────────────────────────

  router.get('/talent/campaigns/:id/candidates', async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const candidates = await service.listCandidates(req.params.id, { status, limit });
      res.json({ success: true, candidates });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  router.post('/talent/campaigns/:id/candidates', async (req, res) => {
    try {
      const parsed = addCandidateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const id = await service.addCandidate({ campaignId: req.params.id, ...parsed.data });
      res.status(201).json({ success: true, id });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  router.get('/talent/candidates/:id', async (req, res) => {
    try {
      const candidate = await service.getCandidate(req.params.id);
      if (!candidate) { res.status(404).json({ error: 'Candidate not found' }); return; }
      const assessments = await service.getAssessments(req.params.id);
      res.json({ success: true, candidate, assessments });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  router.put('/talent/candidates/:id', async (req, res) => {
    try {
      const parsed = updateCandidateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      await service.updateCandidate(req.params.id, parsed.data);
      res.json({ success: true });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // ── Scoring Dimensions ─────────────────────────────────────────────────

  router.get('/talent/campaigns/:id/scoring-dimensions', async (req, res) => {
    try {
      const dimensions = await service.listScoringDimensions(req.params.id);
      res.json({ success: true, dimensions });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  router.post('/talent/campaigns/:id/scoring-dimensions', async (req, res) => {
    try {
      const parsed = createDimensionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const id = await service.createScoringDimension({ campaignId: req.params.id, ...parsed.data });
      res.status(201).json({ success: true, id });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  router.put('/talent/scoring-dimensions/:id', async (req, res) => {
    try {
      const parsed = updateDimensionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      await service.updateScoringDimension(req.params.id, parsed.data);
      res.json({ success: true });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  router.delete('/talent/scoring-dimensions/:id', async (req, res) => {
    try {
      await service.deleteScoringDimension(req.params.id);
      res.json({ success: true });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // ── Communications ─────────────────────────────────────────────────────

  router.get('/talent/campaigns/:id/communications', async (req, res) => {
    try {
      const candidateId = req.query.candidateId as string | undefined;
      const comms = await service.listCommunications(req.params.id, candidateId);
      res.json({ success: true, communications: comms });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // ── Interview Plans ────────────────────────────────────────────────────

  router.get('/talent/campaigns/:id/interview-plans', async (req, res) => {
    try {
      const candidateId = req.query.candidateId as string | undefined;
      const plans = await service.listInterviewPlans(req.params.id, candidateId);
      res.json({ success: true, interviewPlans: plans });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // ── Shortlists ─────────────────────────────────────────────────────────

  router.get('/talent/campaigns/:id/shortlists', async (req, res) => {
    try {
      const shortlists = await service.listShortlists(req.params.id);
      res.json({ success: true, shortlists });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  router.post('/talent/campaigns/:id/shortlists', async (req, res) => {
    try {
      const parsed = createShortlistSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const userId = (req as unknown as { user?: { id: string } }).user?.id ?? 'solo';
      const id = await service.createShortlist({ campaignId: req.params.id, ...parsed.data, createdBy: userId });
      res.status(201).json({ success: true, id });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // ── Follow-up Questions ─────────────────────────────────────────────

  // List follow-up questions for a candidate
  router.get('/talent/candidates/:id/followup-questions', async (req, res) => {
    try {
      const questions = await db.all(
        'SELECT * FROM talent_followup_questions WHERE candidate_id = ? ORDER BY created_at', req.params.id
      );
      res.json({ success: true, questions });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // Create follow-up questions (from assessment uncertainties)
  router.post('/talent/candidates/:id/followup-questions', async (req, res) => {
    try {
      const { questions } = req.body as { questions: Array<{ text: string; rationale?: string; mapsToDimensions?: string[] }> };
      if (!Array.isArray(questions) || questions.length === 0) {
        res.status(400).json({ error: 'questions array required' });
        return;
      }
      const ids: string[] = [];
      for (const q of questions) {
        const id = `tfq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await db.run(`
          INSERT INTO talent_followup_questions (id, candidate_id, question_text, question_rationale, maps_to_dimensions)
          VALUES (?, ?, ?, ?, ?)
        `, id, req.params.id, q.text, q.rationale ?? null, JSON.stringify(q.mapsToDimensions ?? []));
        ids.push(id);
      }
      res.status(201).json({ success: true, ids });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // Approve follow-up question (human checkpoint)
  router.put('/talent/followup-questions/:id/approve', async (req, res) => {
    try {
      const userId = (req as unknown as { user?: { id: string } }).user?.id ?? 'solo';
      const { modifiedText } = req.body as { modifiedText?: string };
      await db.run(`
        UPDATE talent_followup_questions SET status = 'approved', approved_by = ?, approved_at = NOW()
        ${modifiedText ? ', modified_text = ?' : ''}
        WHERE id = ? AND status = 'proposed'
      `, ...(modifiedText ? [userId, modifiedText, req.params.id] : [userId, req.params.id]));
      res.json({ success: true });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // Send approved follow-up questions to candidate
  router.post('/talent/followup-questions/:id/send', async (req, res) => {
    try {
      await db.run(
        "UPDATE talent_followup_questions SET status = 'sent', sent_at = NOW() WHERE id = ? AND status = 'approved'",
        req.params.id
      );
      // Update candidate status
      const fq = await db.get<{ candidate_id: string }>('SELECT candidate_id FROM talent_followup_questions WHERE id = ?', req.params.id);
      if (fq) {
        await service.updateCandidate(fq.candidate_id, { status: 'followup_sent' });
      }
      res.json({ success: true });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // Candidate submits follow-up response
  router.post('/talent/followup-questions/:id/respond', async (req, res) => {
    try {
      const { responseText } = req.body as { responseText: string };
      if (!responseText) { res.status(400).json({ error: 'responseText required' }); return; }
      await db.run(
        "UPDATE talent_followup_questions SET status = 'answered', answered_at = NOW() WHERE id = ? AND status = 'sent'",
        req.params.id
      );
      // Store response in candidate's followup_responses
      const fq = await db.get<{ candidate_id: string; question_text: string }>(
        'SELECT candidate_id, question_text FROM talent_followup_questions WHERE id = ?', req.params.id
      );
      if (fq) {
        const candidate = await service.getCandidate(fq.candidate_id);
        if (candidate) {
          const existing = typeof candidate.followup_responses === 'string'
            ? JSON.parse(candidate.followup_responses) : candidate.followup_responses;
          const responses = Array.isArray(existing) ? existing : [];
          responses.push({ questionId: req.params.id, question: fq.question_text, responseText, answeredAt: new Date().toISOString() });
          await service.updateCandidate(fq.candidate_id, { followup_responses: responses, status: 'followup_received' });
        }
      }
      res.json({ success: true });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // ── Communication Approval ─────────────────────────────────────────

  router.put('/talent/communications/:id/approve', async (req, res) => {
    try {
      const userId = (req as unknown as { user?: { id: string } }).user?.id ?? 'solo';
      await service.updateCommunication(req.params.id, { status: 'approved', approved_by: userId });
      res.json({ success: true });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  router.post('/talent/communications/:id/send', async (req, res) => {
    try {
      await service.updateCommunication(req.params.id, { status: 'sent' });
      // Mark candidate outcome if it's a rejection/offer
      const comm = await db.get<{ candidate_id: string; comm_type: string; body: string }>(
        'SELECT candidate_id, comm_type, body FROM talent_communications WHERE id = ?', req.params.id
      );
      if (comm) {
        if (comm.comm_type === 'rejection') {
          await service.updateCandidate(comm.candidate_id, { status: 'rejected', outcome_message: comm.body });
        } else if (comm.comm_type === 'offer') {
          await service.updateCandidate(comm.candidate_id, { status: 'offer', outcome_message: comm.body });
        }
      }
      res.json({ success: true });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // ── Human Decisions ────────────────────────────────────────────────────

  router.post('/talent/campaigns/:id/decisions', async (req, res) => {
    try {
      const parsed = humanDecisionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const userId = (req as unknown as { user?: { id: string } }).user?.id ?? 'solo';
      const id = await service.recordHumanDecision({
        campaignId: req.params.id,
        ...parsed.data,
        decidedBy: userId,
      });
      res.status(201).json({ success: true, id });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // ── Audit Trail ────────────────────────────────────────────────────────

  router.get('/talent/campaigns/:id/audit-trail', async (req, res) => {
    try {
      const candidateId = req.query.candidateId as string | undefined;
      const action = req.query.action as string | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const trail = await service.getAuditTrail(req.params.id, { candidateId, action, limit });
      res.json({ success: true, auditTrail: trail });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // ── AI-Powered Endpoints ─────────────────────────────────────────────

  // Generate job ad variant
  router.post('/talent/campaigns/:id/generate-ad', async (req, res) => {
    try {
      const variant = (req.body.variant ?? 'complement') as 'mirror' | 'complement' | 'future_proof';
      const result = await aiService.generateAd(req.params.id, variant);
      res.json({ success: true, ...result });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // Generate scoring framework from capability map
  router.post('/talent/campaigns/:id/generate-framework', async (req, res) => {
    try {
      const dimensions = await aiService.generateScoringFramework(req.params.id);
      res.json({ success: true, dimensions });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // Run bias simulation on scoring framework
  router.post('/talent/campaigns/:id/bias-simulation', async (req, res) => {
    try {
      const result = await aiService.runBiasSimulation(req.params.id);
      res.json({ success: true, simulation: result });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // Assess candidate (dual-model: primary + bias audit)
  router.post('/talent/candidates/:id/assess', async (req, res) => {
    try {
      const result = await aiService.assessCandidate(req.params.id);
      res.json({ success: true, ...result });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // Generate interview plan for candidate
  router.post('/talent/campaigns/:campaignId/candidates/:candidateId/interview-plan', async (req, res) => {
    try {
      const planId = await aiService.generateInterviewPlan(req.params.campaignId, req.params.candidateId);
      res.json({ success: true, id: planId });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // Draft communication for candidate
  router.post('/talent/candidates/:id/draft-communication', async (req, res) => {
    try {
      const commType = req.body.commType ?? 'acknowledgement';
      const commId = await aiService.draftCommunication(req.params.id, commType);
      res.json({ success: true, id: commId });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // Generate shortlist rationale
  router.post('/talent/campaigns/:id/shortlist-rationale', async (req, res) => {
    try {
      const candidateIds = req.body.candidateIds as string[];
      if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
        res.status(400).json({ error: 'candidateIds array required' });
        return;
      }
      const rationale = await aiService.generateShortlistRationale(req.params.id, candidateIds);
      res.json({ success: true, rationale });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // ── Internal Mobility — Aspiration Profiles ─────────────────────────

  // Create aspiration profile
  router.post('/talent/aspiration-profiles', async (req, res) => {
    try {
      const { employeeId, currentRole, currentDepartment } = req.body;
      if (!employeeId) { res.status(400).json({ error: 'employeeId required' }); return; }
      const id = `tasp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await db.run(`
        INSERT INTO talent_aspiration_profiles (id, employee_id, employee_current_role, current_department)
        VALUES (?, ?, ?, ?)
      `, id, employeeId, currentRole ?? null, currentDepartment ?? null);
      res.status(201).json({ success: true, id });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // Get own aspiration profile
  router.get('/talent/aspiration-profiles/:id', async (req, res) => {
    try {
      const profile = await db.get('SELECT * FROM talent_aspiration_profiles WHERE id = ?', req.params.id);
      if (!profile) { res.status(404).json({ error: 'Profile not found' }); return; }
      res.json({ success: true, profile });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // Update aspiration profile
  router.put('/talent/aspiration-profiles/:id', async (req, res) => {
    try {
      const allowed = [
        'status', 'onboarding_conversation_completed', 'cv_content',
        'current_skills', 'unused_skills', 'developing_skills', 'role_satisfaction',
        'energisers', 'aspirations', 'career_direction', 'dream_project',
        'working_style_preferences', 'location_preferences', 'change_readiness',
        'profile_visibility', 'employee_current_role', 'current_department',
      ];
      const fields: string[] = [];
      const args: unknown[] = [];
      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          fields.push(`${key} = ?`);
          const val = req.body[key];
          args.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val);
        }
      }
      if (fields.length === 0) { res.json({ success: true }); return; }
      fields.push('updated_at = NOW()');
      args.push(req.params.id);
      await db.run(`UPDATE talent_aspiration_profiles SET ${fields.join(', ')} WHERE id = ?`, ...args);
      res.json({ success: true });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // Hard delete aspiration profile content (GDPR right to delete)
  router.delete('/talent/aspiration-profiles/:id/content', async (req, res) => {
    try {
      await db.run(`
        UPDATE talent_aspiration_profiles SET
          cv_content = NULL, current_skills = '[]', unused_skills = '[]',
          developing_skills = '[]', role_satisfaction = '{}', energisers = '[]',
          aspirations = '{}', career_direction = NULL, dream_project = NULL,
          working_style_preferences = '{}', location_preferences = '{}',
          change_readiness = 'curious', status = 'content_deleted',
          onboarding_conversation_completed = FALSE, updated_at = NOW()
        WHERE id = ?
      `, req.params.id);
      // Hard delete matches and applications
      await db.run('DELETE FROM talent_internal_matches WHERE profile_id = ?', req.params.id);
      await db.run('DELETE FROM talent_internal_applications WHERE aspiration_profile_id = ?', req.params.id);
      res.json({ success: true });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // Internal matches for a campaign
  router.get('/talent/campaigns/:id/internal-matches', async (req, res) => {
    try {
      const matches = await db.all(`
        SELECT m.*, p.employee_id, p.employee_current_role, p.current_department, p.change_readiness
        FROM talent_internal_matches m
        JOIN talent_aspiration_profiles p ON p.id = m.profile_id
        WHERE m.campaign_id = ? AND p.status = 'active'
        ORDER BY m.match_score DESC NULLS LAST
      `, req.params.id);
      res.json({ success: true, matches });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // Express interest in a match
  router.put('/talent/internal-matches/:id/interest', async (req, res) => {
    try {
      await db.run(`
        UPDATE talent_internal_matches SET status = 'interested', expressed_interest_at = NOW(), updated_at = NOW()
        WHERE id = ?
      `, req.params.id);
      res.json({ success: true });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // Withdraw interest
  router.put('/talent/internal-matches/:id/withdraw', async (req, res) => {
    try {
      await db.run(`
        UPDATE talent_internal_matches SET status = 'withdrawn', withdrawn_at = NOW(), updated_at = NOW()
        WHERE id = ?
      `, req.params.id);
      res.json({ success: true });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // ── HR Analytics (aggregate only, min group size 5) ────────────────────

  router.get('/talent/analytics/overview', async (req, res) => {
    try {
      const MIN_GROUP = 5;
      const totalProfiles = await db.get<{ n: number }>(
        "SELECT COUNT(*) as n FROM talent_aspiration_profiles WHERE status = 'active'"
      );
      const readiness = await db.all<{ change_readiness: string; n: number }>(`
        SELECT change_readiness, COUNT(*) as n
        FROM talent_aspiration_profiles WHERE status = 'active'
        GROUP BY change_readiness HAVING COUNT(*) >= ?
      `, MIN_GROUP);
      const departmentActivity = await db.all<{ department: string; n: number; recently_updated: number }>(`
        SELECT current_department as department, COUNT(*) as n,
               COUNT(*) FILTER (WHERE updated_at > NOW() - INTERVAL '30 days') as recently_updated
        FROM talent_aspiration_profiles
        WHERE status = 'active' AND current_department IS NOT NULL
        GROUP BY current_department HAVING COUNT(*) >= ?
        ORDER BY n DESC
      `, MIN_GROUP);
      const totalCampaigns = await db.get<{ n: number }>(
        "SELECT COUNT(*) as n FROM talent_campaigns WHERE status != 'closed'"
      );
      const internalFills = await db.get<{ n: number }>(
        "SELECT COUNT(*) as n FROM talent_candidates WHERE is_internal = TRUE AND status = 'hired'"
      );
      const totalHires = await db.get<{ n: number }>(
        "SELECT COUNT(*) as n FROM talent_candidates WHERE status = 'hired'"
      );

      res.json({
        success: true,
        analytics: {
          totalProfiles: totalProfiles?.n ?? 0,
          changeReadinessDistribution: readiness,
          departmentActivity,
          activeCampaigns: totalCampaigns?.n ?? 0,
          internalFillRate: totalHires?.n
            ? Math.round(((internalFills?.n ?? 0) / totalHires.n) * 100) : 0,
          minGroupSizeEnforced: MIN_GROUP,
        },
      });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // EU AI Act + Pay Transparency compliance check
  router.get('/talent/campaigns/:id/compliance', async (req, res) => {
    try {
      const checks = await aiService.checkCompliance(req.params.id);
      const passed = checks.filter(c => c.status === 'pass').length;
      const failed = checks.filter(c => c.status === 'fail').length;
      res.json({ success: true, checks, summary: { total: checks.length, passed, failed } });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  return router;
}
