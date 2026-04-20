// ── Missions REST API ───────────────────────────────────────────────────────
// Phase 1: lifecycle + decomposition + advance + checkpoint approve/reject +
// templates + activity + decisions + budget.
//
// Identity model: every mutation resolves the local community_identity
// (mirrors BEEHIVE Phase 1). Cross-instance / AAP-signed identity arrives
// in Phase 5.

import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseAdapter } from '../db/database.js';
import { createMissionController } from '../services/missions/mission-controller.js';
import { createMissionState } from '../services/missions/mission-state.js';
import { resolveCallerIdentity, getLocalIdentity, resolveUserId } from '../services/missions/mission-identity.js';
import { seedBuiltinTemplates } from '../services/missions/seed-templates.js';
import { claudeLimiter } from '../middleware/rate-limit.js';
import { safeError } from '../lib/error-response.js';

// ── Validation ─────────────────────────────────────────────────────────────

const dataScopeSchema = z.object({
  modules_allowed: z.array(z.string()).optional(),
  modules_denied: z.array(z.string()).optional(),
  knowledge_sources: z.array(z.string()).optional(),
  atom_read_scopes: z.array(z.string()).optional(),
  atom_write_scope: z.string().optional(),
  inherit_atoms_from_missions: z.array(z.string()).optional(),
  external_services_allowed: z.array(z.string()).optional(),
  external_services_denied: z.array(z.string()).optional(),
}).strict();

const modelStrategySchema = z.object({
  planning_model: z.string().optional(),
  execution_model: z.string().optional(),
  utility_model: z.string().optional(),
  provider_preference: z.enum(['any', 'anthropic', 'mistral', 'openai', 'gemini', 'ollama']).optional(),
  fallback_enabled: z.boolean().optional(),
  cost_optimise: z.boolean().optional(),
}).strict();

const budgetSchema = z.object({
  token_budget_max: z.number().int().min(10_000).max(50_000_000).optional(),
  time_budget_max_seconds: z.number().int().min(60).max(30 * 24 * 60 * 60).optional(),
  time_active_max_seconds: z.number().int().min(60).max(7 * 24 * 60 * 60).optional(),
}).strict();

const createMissionSchema = z.object({
  title: z.string().min(1).max(200),
  objective: z.string().min(1).max(8000),
  success_criteria: z.string().min(1).max(4000),
  context: z.string().max(8000).optional(),
  autonomy_level: z.enum(['check_in', 'briefing', 'full_autonomy']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  budget: budgetSchema.optional(),
  data_scope: dataScopeSchema.optional(),
  model_strategy: modelStrategySchema.optional(),
  template_id: z.string().optional(),
  template_parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  deadline: z.string().optional(),
  // Identity claim — server validates against community_identity
  created_by_contact_hash: z.string().optional(),
}).strict();

const queenActionSchema = z.object({
  requester_hash: z.string().optional(),
}).strict();

const checkpointSchema = z.object({
  feedback: z.string().max(8000).optional(),
}).strict();

// ── Helpers ────────────────────────────────────────────────────────────────

function sendIdentityError(res: import('express').Response, err: unknown): void {
  const msg = safeError(err);
  if (/not activated/i.test(msg)) { res.status(409).json({ error: msg }); return; }
  if (/does not match/i.test(msg)) { res.status(403).json({ error: msg }); return; }
  res.status(400).json({ error: msg });
}

// ── Route factory ──────────────────────────────────────────────────────────

export function createMissionRoutes(db: DatabaseAdapter): Router {
  const router = Router();
  const controller = createMissionController(db);
  const state = createMissionState(db);

  // Seed built-in templates on first request (idempotent)
  let seedAttempted = false;
  async function ensureSeeded(): Promise<void> {
    if (seedAttempted) return;
    seedAttempted = true;
    try {
      const result = await seedBuiltinTemplates(db);
      if (result.seeded > 0) {
        console.log(`[missions] Seeded ${result.seeded} built-in template(s).`);
      }
    } catch (err) {
      console.error('[missions] Template seeding failed:', err instanceof Error ? err.message : err);
    }
  }

  // GET /api/missions/identity — local identity (for the frontend bootstrap)
  router.get('/missions/identity', async (_req, res) => {
    try {
      const identity = await getLocalIdentity(db);
      res.json({ success: true, identity });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // POST /api/missions — create mission (status='draft')
  router.post('/missions', async (req, res) => {
    try {
      const parsed = createMissionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      try {
        await resolveCallerIdentity(db, parsed.data.created_by_contact_hash);
      } catch (err) { sendIdentityError(res, err); return; }

      const userId = await resolveUserId(db);
      const { created_by_contact_hash: _, template_parameters: __, ...input } = parsed.data;
      const mission = await controller.createMission(input, userId);
      res.status(201).json({ success: true, mission });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // GET /api/missions — list (filter status, createdBy)
  router.get('/missions', async (req, res) => {
    try {
      await ensureSeeded();
      const statusParam = req.query.status as string | undefined;
      const createdBy = req.query.created_by as string | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const status = statusParam
        ? (statusParam.split(',').filter(Boolean) as Array<'draft' | 'briefed' | 'active' | 'paused' | 'review' | 'completed' | 'aborted'>)
        : undefined;
      const missions = await state.listMissions({ status, createdBy, limit });
      res.json({ success: true, missions });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /api/missions/:id — full state (mission + tasks + dependencies + counts)
  router.get('/missions/:id', async (req, res) => {
    try {
      const id = String(req.params.id);
      const mission = await state.getMission(id);
      if (!mission) { res.status(404).json({ error: 'Mission not found' }); return; }
      const [tasks, dependencies, activity_count, decisions_count] = await Promise.all([
        state.listTasks(id),
        state.listDependencies(id),
        state.countActivity(id),
        state.countDecisions(id),
      ]);
      res.json({ success: true, state: { mission, tasks, dependencies, activity_count, decisions_count } });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // POST /api/missions/:id/decompose — generate proposed task graph (LLM-heavy)
  router.post('/missions/:id/decompose', claudeLimiter, async (req, res) => {
    try {
      const id = String(req.params.id);
      const parsed = queenActionSchema.safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      try { await resolveCallerIdentity(db, parsed.data.requester_hash); }
      catch (err) { sendIdentityError(res, err); return; }
      const result = await controller.briefMission(id);
      res.json({ success: true, mission: result.mission, tasks: result.tasks });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // POST /api/missions/:id/approve-plan — briefed → active
  router.post('/missions/:id/approve-plan', async (req, res) => {
    try {
      const id = String(req.params.id);
      const parsed = queenActionSchema.safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      try { await resolveCallerIdentity(db, parsed.data.requester_hash); }
      catch (err) { sendIdentityError(res, err); return; }
      const mission = await controller.approvePlanAndStart(id);
      res.json({ success: true, mission });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // POST /api/missions/:id/advance — execute next ready task (LLM-heavy)
  router.post('/missions/:id/advance', claudeLimiter, async (req, res) => {
    try {
      const id = String(req.params.id);
      const parsed = queenActionSchema.safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      try { await resolveCallerIdentity(db, parsed.data.requester_hash); }
      catch (err) { sendIdentityError(res, err); return; }
      const result = await controller.advance(id);
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // POST /api/missions/:id/pause
  router.post('/missions/:id/pause', async (req, res) => {
    try {
      const id = String(req.params.id);
      const parsed = z.object({ reason: z.string().max(2000).optional(), requester_hash: z.string().optional() }).safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      try { await resolveCallerIdentity(db, parsed.data.requester_hash); }
      catch (err) { sendIdentityError(res, err); return; }
      await controller.pauseMission(id, parsed.data.reason || 'Paused by user');
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // POST /api/missions/:id/resume
  router.post('/missions/:id/resume', async (req, res) => {
    try {
      const id = String(req.params.id);
      const parsed = queenActionSchema.safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      try { await resolveCallerIdentity(db, parsed.data.requester_hash); }
      catch (err) { sendIdentityError(res, err); return; }
      await controller.resumeMission(id);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // POST /api/missions/:id/abort
  router.post('/missions/:id/abort', async (req, res) => {
    try {
      const id = String(req.params.id);
      const parsed = z.object({ reason: z.string().max(2000).optional(), requester_hash: z.string().optional() }).safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      try { await resolveCallerIdentity(db, parsed.data.requester_hash); }
      catch (err) { sendIdentityError(res, err); return; }
      await controller.abortMission(id, parsed.data.reason || 'Aborted by user');
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // GET /api/missions/:id/tasks
  router.get('/missions/:id/tasks', async (req, res) => {
    try {
      const id = String(req.params.id);
      const tasks = await state.listTasks(id);
      res.json({ success: true, tasks });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /api/missions/:id/tasks/:taskId
  router.get('/missions/:id/tasks/:taskId', async (req, res) => {
    try {
      const task = await state.getTask(String(req.params.taskId));
      if (!task || task.mission_id !== String(req.params.id)) { res.status(404).json({ error: 'Task not found' }); return; }
      res.json({ success: true, task });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // POST /api/missions/:id/tasks/:taskId/approve
  // Dual-purpose: approves a checkpoint task OR grants approval for a paused
  // action task (api_call / database_query / browser) that hit the autonomy
  // gate. Dispatch is by task_type — callers don't need to know which.
  router.post('/missions/:id/tasks/:taskId/approve', async (req, res) => {
    try {
      const parsed = checkpointSchema.safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      let identity;
      try { identity = await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      const missionId = String(req.params.id);
      const taskId = String(req.params.taskId);
      const task = await state.getTask(taskId);
      if (!task || task.mission_id !== missionId) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }
      if (task.task_type === 'checkpoint') {
        await controller.approveCheckpoint(missionId, taskId, parsed.data.feedback);
      } else {
        await controller.grantTaskApproval(missionId, taskId, identity.user_id, parsed.data.feedback);
      }
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // POST /api/missions/:id/tasks/:taskId/reject
  // Dual-purpose like /approve: rejects a checkpoint OR an action task that
  // was paused at the autonomy gate. Feedback is required in both cases.
  router.post('/missions/:id/tasks/:taskId/reject', async (req, res) => {
    try {
      const parsed = z.object({ feedback: z.string().min(1).max(8000) }).safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Feedback is required' }); return; }
      try { await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      const missionId = String(req.params.id);
      const taskId = String(req.params.taskId);
      const task = await state.getTask(taskId);
      if (!task || task.mission_id !== missionId) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }
      if (task.task_type === 'checkpoint') {
        await controller.rejectCheckpoint(missionId, taskId, parsed.data.feedback);
      } else {
        await controller.rejectTaskApproval(missionId, taskId, parsed.data.feedback);
      }
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // GET /api/missions/:id/activity?limit=200
  router.get('/missions/:id/activity', async (req, res) => {
    try {
      const id = String(req.params.id);
      const limit = req.query.limit ? Number(req.query.limit) : 200;
      const activity = await state.listActivity(id, Math.max(1, Math.min(limit, 1000)));
      res.json({ success: true, activity });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /api/missions/:id/decisions
  router.get('/missions/:id/decisions', async (req, res) => {
    try {
      const id = String(req.params.id);
      const decisions = await state.listDecisions(id);
      res.json({ success: true, decisions });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /api/missions/:id/budget
  router.get('/missions/:id/budget', async (req, res) => {
    try {
      const id = String(req.params.id);
      const mission = await state.getMission(id);
      if (!mission) { res.status(404).json({ error: 'Mission not found' }); return; }
      const budget = controller.computeBudgetStatus(mission);
      res.json({ success: true, budget });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /api/mission-templates
  router.get('/mission-templates', async (req, res) => {
    try {
      await ensureSeeded();
      const pillar = req.query.pillar as string | undefined;
      const templates = await state.listTemplates({ pillar, activeOnly: true });
      res.json({ success: true, templates });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /api/mission-templates/:id
  router.get('/mission-templates/:id', async (req, res) => {
    try {
      const id = String(req.params.id);
      const template = await state.getTemplate(id);
      if (!template) { res.status(404).json({ error: 'Template not found' }); return; }
      res.json({ success: true, template });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
