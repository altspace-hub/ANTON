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
import { createMissionState, newTaskId } from '../services/missions/mission-state.js';
import { hasDependencyCycle, validateActionTaskConfig } from '../services/missions/mission-decomposition.js';
import { resolveCallerIdentity, getLocalIdentity, resolveUserId } from '../services/missions/mission-identity.js';
import { seedBuiltinTemplates } from '../services/missions/seed-templates.js';
import { claudeLimiter } from '../middleware/rate-limit.js';
import { safeError } from '../lib/error-response.js';
import type { MissionTask, TaskType } from '../services/missions/types.js';

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

// ── Task editing (Wave-2 2A.5) ─────────────────────────────────────────────
// Tasks may be added/edited only while the plan is still human-owned
// (status draft/briefed). Action types (api_call / browser / database_query)
// are allowed here — this endpoint IS the human approving the action's
// existence; the autonomy gate still governs its execution.

const EDITABLE_TASK_TYPES = [
  'llm', 'research', 'analysis', 'export', 'review', 'notification',
  'checkpoint', 'conditional', 'api_call', 'browser', 'database_query',
] as const;

const taskCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  task_type: z.enum(EDITABLE_TASK_TYPES),
  prompt: z.string().max(16_000).optional(),
  checkpoint_message: z.string().max(4000).optional(),
  module_config: z.record(z.string(), z.unknown()).optional(),
  estimated_tokens: z.number().int().min(0).max(200_000).optional(),
  sort_order: z.number().int().min(0).max(10_000).optional(),
  depends_on: z.array(z.string().min(1)).max(50).optional(),
  requester_hash: z.string().optional(),
}).strict();

const taskPatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).optional(),
  task_type: z.enum(EDITABLE_TASK_TYPES).optional(),
  prompt: z.string().max(16_000).optional(),
  checkpoint_message: z.string().max(4000).optional(),
  module_config: z.record(z.string(), z.unknown()).optional(),
  estimated_tokens: z.number().int().min(0).max(200_000).optional(),
  sort_order: z.number().int().min(0).max(10_000).optional(),
  depends_on: z.array(z.string().min(1)).max(50).optional(),
  requester_hash: z.string().optional(),
}).strict();

const EDITABLE_MISSION_STATUSES = new Set(['draft', 'briefed']);

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
      // template_parameters flows through to the controller, which persists
      // the values into the mission context for deterministic ${param}
      // substitution at decomposition time (Wave-3 3A.1).
      const { created_by_contact_hash: _, ...input } = parsed.data;
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

  // POST /api/missions/:id/advance-batch — run up to N mutually-independent
  // ready tasks in parallel via Promise.allSettled. Designed for
  // parallel_group fan-outs: children become ready simultaneously after
  // their group marker completes, and a single call resolves the whole
  // batch instead of N round-trips. maxParallel body param defaults to 4,
  // capped at 16 inside the controller.
  router.post('/missions/:id/advance-batch', claudeLimiter, async (req, res) => {
    try {
      const id = String(req.params.id);
      const parsed = z.object({
        requester_hash: z.string().optional(),
        maxParallel: z.number().int().min(1).max(16).optional(),
      }).safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      try { await resolveCallerIdentity(db, parsed.data.requester_hash); }
      catch (err) { sendIdentityError(res, err); return; }
      const result = await controller.advanceBatch(id, parsed.data.maxParallel);
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

  // POST /api/missions/:id/tasks — insert a task into a draft/briefed mission
  // (Wave-2 2A.5: lets the human add action tasks the decomposer didn't emit,
  // or paste final content into a send task before approving a checkpoint).
  router.post('/missions/:id/tasks', async (req, res) => {
    try {
      const parsed = taskCreateSchema.safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }); return; }
      try { await resolveCallerIdentity(db, parsed.data.requester_hash); }
      catch (err) { sendIdentityError(res, err); return; }

      const missionId = String(req.params.id);
      const mission = await state.getMission(missionId);
      if (!mission) { res.status(404).json({ error: 'Mission not found' }); return; }
      if (!EDITABLE_MISSION_STATUSES.has(mission.status)) {
        res.status(409).json({ error: `Tasks can only be edited while the mission is draft or briefed (current: '${mission.status}')` });
        return;
      }

      const d = parsed.data;
      const configError = validateActionTaskConfig(d.task_type, d.module_config);
      if (configError) { res.status(400).json({ error: configError }); return; }

      const existing = await state.listTasks(missionId);
      const existingIds = new Set(existing.map(t => t.id));
      const dependsOn = [...new Set(d.depends_on ?? [])];
      const unknownDep = dependsOn.find(dep => !existingIds.has(dep));
      if (unknownDep) { res.status(400).json({ error: `depends_on references unknown task '${unknownDep}'` }); return; }

      const ts = new Date().toISOString();
      const taskId = newTaskId();
      const task: MissionTask = {
        id: taskId,
        mission_id: missionId,
        parent_task_id: null,
        title: d.title.trim(),
        description: d.description?.trim() || null,
        task_type: d.task_type as TaskType,
        status: 'queued',
        priority: 0,
        module_id: null,
        area_id: null,
        // Same convention as persistTaskGraph: prompt + checkpoint_message
        // ride inside module_config.
        module_config: { ...(d.module_config ?? {}), prompt: d.prompt, checkpoint_message: d.checkpoint_message },
        provider: null,
        model: null,
        model_tier: null,
        estimated_tokens: d.estimated_tokens ?? null,
        actual_tokens_consumed: 0,
        estimated_duration_seconds: null,
        actual_duration_seconds: null,
        output_summary: null,
        output_full: null,
        quality_score: null,
        confidence_score: null,
        atoms_produced: 0,
        retry_count: 0,
        max_retries: 3,
        last_error: null,
        sort_order: d.sort_order ?? (existing.length > 0 ? Math.max(...existing.map(t => t.sort_order)) + 1 : 1),
        created_at: ts,
        started_at: null,
        completed_at: null,
      };
      await state.insertTask(task);
      for (const dep of dependsOn) {
        await state.insertDependency(taskId, dep, 'blocking');
      }
      await state.logActivity(missionId, {
        activityType: 'task_added',
        description: `Task added by human: ${task.title} (${task.task_type})`,
        taskId,
      });
      const created = await state.getTask(taskId);
      res.status(201).json({ success: true, task: created });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // PATCH /api/missions/:id/tasks/:taskId — edit a queued task while the
  // mission is draft/briefed. Replacing depends_on re-validates the graph
  // (no unknown references, no self-dependency, no cycles).
  router.patch('/missions/:id/tasks/:taskId', async (req, res) => {
    try {
      const parsed = taskPatchSchema.safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }); return; }
      try { await resolveCallerIdentity(db, parsed.data.requester_hash); }
      catch (err) { sendIdentityError(res, err); return; }

      const missionId = String(req.params.id);
      const taskId = String(req.params.taskId);
      const mission = await state.getMission(missionId);
      if (!mission) { res.status(404).json({ error: 'Mission not found' }); return; }
      if (!EDITABLE_MISSION_STATUSES.has(mission.status)) {
        res.status(409).json({ error: `Tasks can only be edited while the mission is draft or briefed (current: '${mission.status}')` });
        return;
      }
      const task = await state.getTask(taskId);
      if (!task || task.mission_id !== missionId) { res.status(404).json({ error: 'Task not found' }); return; }
      if (task.status !== 'queued') {
        res.status(409).json({ error: `Only queued tasks can be edited (task is '${task.status}')` });
        return;
      }

      const d = parsed.data;
      const nextType = (d.task_type ?? task.task_type) as TaskType;
      const baseConfig = d.module_config ?? task.module_config;
      const nextConfig: Record<string, unknown> = {
        ...baseConfig,
        ...(d.prompt !== undefined ? { prompt: d.prompt } : {}),
        ...(d.checkpoint_message !== undefined ? { checkpoint_message: d.checkpoint_message } : {}),
      };
      const configError = validateActionTaskConfig(nextType, nextConfig);
      if (configError) { res.status(400).json({ error: configError }); return; }

      if (d.depends_on !== undefined) {
        const dependsOn = [...new Set(d.depends_on)];
        if (dependsOn.includes(taskId)) { res.status(400).json({ error: 'A task cannot depend on itself' }); return; }
        const existing = await state.listTasks(missionId);
        const existingIds = new Set(existing.map(t => t.id));
        const unknownDep = dependsOn.find(dep => !existingIds.has(dep));
        if (unknownDep) { res.status(400).json({ error: `depends_on references unknown task '${unknownDep}'` }); return; }
        // Re-validate the whole graph with this task's edges replaced.
        const deps = await state.listDependencies(missionId);
        const proposedEdges = [
          ...deps.filter(e => e.task_id !== taskId).map(e => ({ task_id: e.task_id, depends_on_task_id: e.depends_on_task_id })),
          ...dependsOn.map(dep => ({ task_id: taskId, depends_on_task_id: dep })),
        ];
        if (hasDependencyCycle(proposedEdges)) {
          res.status(400).json({ error: 'depends_on change would create a dependency cycle' });
          return;
        }
        await state.deleteDependenciesFor(taskId);
        for (const dep of dependsOn) {
          await state.insertDependency(taskId, dep, 'blocking');
        }
      }

      await state.updateTaskFields(taskId, {
        ...(d.title !== undefined ? { title: d.title.trim() } : {}),
        ...(d.description !== undefined ? { description: d.description.trim() || null } : {}),
        ...(d.task_type !== undefined ? { task_type: d.task_type } : {}),
        ...(d.module_config !== undefined || d.prompt !== undefined || d.checkpoint_message !== undefined
          ? { module_config: nextConfig } : {}),
        ...(d.estimated_tokens !== undefined ? { estimated_tokens: d.estimated_tokens } : {}),
        ...(d.sort_order !== undefined ? { sort_order: d.sort_order } : {}),
      });
      await state.logActivity(missionId, {
        activityType: 'task_edited',
        description: `Task edited by human: ${d.title?.trim() ?? task.title}`,
        taskId,
      });
      const updated = await state.getTask(taskId);
      res.json({ success: true, task: updated });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
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
