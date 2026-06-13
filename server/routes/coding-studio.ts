// ── ANTON Studio — Orchestrator + .anton blueprint routes (Studio P5) ──────
//
//   POST /api/coding/studio/:projectId/run          start/resume the orchestrator
//        body: { autonomy?: 'more'|'ask', reviseCap?: number, advance?: boolean }
//        Creates/resumes the coding_studio_runs row and (by default) advances the
//        loop one tick (plan → awaiting_plan checkpoint, or the build loop). The
//        loop runs SERVER-SIDE within the autonomy budget; the panel gates + the
//        revise cap are ALWAYS enforced; a STOP flag halts it.
//
//   POST /api/coding/studio/:projectId/run/approve-plan
//        The plan-approval human checkpoint — moves awaiting_plan → running and
//        advances. (The plan is the ONE checkpoint MORE-autonomy keeps.)
//
//   GET  /api/coding/studio/:projectId/run/status   the live run state (polling)
//
//   POST /api/coding/studio/:projectId/run/stop      the STOP control
//
//   POST /api/coding/studio/:projectId/export        the .anton blueprint (signed)
//
// Ownership mirrors core-team.ts: a coding_project belongs to a `projects` row;
// admins see everything, everyone else only their own. The orchestrator + the
// bundler + signing are INJECTABLE so tests run with no live LLM / exec / DB-create.

import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseAdapter } from '../db/database.js';
import { safeError } from '../lib/error-response.js';
import {
  createStudioOrchestrator,
  clampReviseCap,
  type StudioOrchestrator,
  type OrchestratorDeps,
  type StudioRun,
} from '../services/coding-studio-orchestrator.js';
import { bundleCodingStudioProject } from '../services/anton-bundler.js';
import { signAntonBundle } from '../services/anton-bundle-signing.js';

interface AuthedRequest {
  user?: { id: string; role?: string };
}

export interface CodingStudioRouteDeps {
  /** Test seam — build the orchestrator (inject all its LLM/exec/panel seams). */
  makeOrchestrator?: (db: DatabaseAdapter) => StudioOrchestrator;
  /** Test seam — the orchestrator's own injectable deps (when makeOrchestrator omitted). */
  orchestratorDeps?: OrchestratorDeps;
  /** Test seam — replaces the .anton bundler (no real FS/zip in some tests). */
  bundle?: (db: DatabaseAdapter, projectId: string, opts: { author?: string }) => Promise<Buffer>;
  /** Test seam — replaces signing (default = signAntonBundle, degrades to unsigned). */
  sign?: (db: DatabaseAdapter, buffer: Buffer) => Promise<Buffer>;
}

interface ProjectAccessRow {
  id: string;
  name: string | null;
  owner_user_id: string | null;
}

async function loadOwnedCodingProject(
  db: DatabaseAdapter,
  req: AuthedRequest,
  projectId: string,
  res: import('express').Response,
): Promise<ProjectAccessRow | null> {
  const userId = req.user?.id;
  const userRole = req.user?.role;
  if (!userId) { res.status(401).json({ error: 'Authentication required' }); return null; }
  const row = await db.get<ProjectAccessRow>(
    `SELECT cp.id AS id, cp.name AS name, p.user_id AS owner_user_id
       FROM coding_projects cp
       JOIN projects p ON p.id = cp.project_id
      WHERE cp.id = ?`,
    projectId,
  );
  if (!row) { res.status(404).json({ error: 'Coding project not found' }); return null; }
  if (userRole !== 'admin' && row.owner_user_id && row.owner_user_id !== userId) {
    res.status(404).json({ error: 'Coding project not found' });
    return null;
  }
  return row;
}

function runView(run: StudioRun) {
  return {
    id: run.id,
    status: run.status,
    autonomy: run.autonomy,
    revise_cap: run.reviseCap,
    current_task: run.currentTask,
    stop_requested: run.stopRequested,
    awaiting_gate: run.awaitingGate,
    last_error: run.lastError,
    plan: run.plan,
    step_log: run.stepLog,
  };
}

export function createCodingStudioRoutes(db: DatabaseAdapter, deps: CodingStudioRouteDeps = {}): Router {
  const router = Router();
  const makeOrchestrator = deps.makeOrchestrator
    ?? ((d: DatabaseAdapter) => createStudioOrchestrator(d, deps.orchestratorDeps ?? {}));
  const doBundle = deps.bundle
    ?? ((d: DatabaseAdapter, pid: string, opts: { author?: string }) => bundleCodingStudioProject(d, pid, opts));
  const doSign = deps.sign ?? (async (d: DatabaseAdapter, buffer: Buffer) => (await signAntonBundle(d, buffer)).buffer);

  // ── POST /coding/studio/:projectId/run — start/resume + advance ───────────
  router.post('/coding/studio/:projectId/run', async (req, res) => {
    const params = z.object({ projectId: z.string().min(1) }).safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: 'projectId is required' }); return; }
    const body = z.object({
      autonomy: z.enum(['more', 'ask']).optional(),
      reviseCap: z.number().int().optional(),
      advance: z.boolean().optional(),
    }).safeParse(req.body ?? {});
    if (!body.success) { res.status(400).json({ error: 'invalid body' }); return; }

    try {
      const project = await loadOwnedCodingProject(db, req as AuthedRequest, params.data.projectId, res);
      if (!project) return;

      const orch = makeOrchestrator(db);
      await orch.startOrResume({
        codingProjectId: params.data.projectId,
        autonomy: body.data.autonomy,
        reviseCap: body.data.reviseCap !== undefined ? clampReviseCap(body.data.reviseCap) : undefined,
        createdBy: (req as AuthedRequest).user?.id ?? 'system',
      });

      // Advance the loop one tick by default (the loop self-parks at the
      // plan-approval checkpoint, at a blocking gate, or at done/stopped).
      const run = body.data.advance === false
        ? (await orch.getRun(params.data.projectId))!
        : await orch.advance(params.data.projectId);

      res.json({ success: true, run: runView(run) });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /coding/studio/:projectId/run/approve-plan — the checkpoint ──────
  router.post('/coding/studio/:projectId/run/approve-plan', async (req, res) => {
    const params = z.object({ projectId: z.string().min(1) }).safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: 'projectId is required' }); return; }
    try {
      const project = await loadOwnedCodingProject(db, req as AuthedRequest, params.data.projectId, res);
      if (!project) return;
      const orch = makeOrchestrator(db);
      const existing = await orch.getRun(params.data.projectId);
      if (!existing) { res.status(404).json({ error: 'No studio run — start one first' }); return; }
      // approvePlan flips awaiting_plan → running AND drives the build loop.
      const run = await orch.approvePlan(params.data.projectId);
      res.json({ success: true, run: runView(run) });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /coding/studio/:projectId/run/status — polling ────────────────────
  router.get('/coding/studio/:projectId/run/status', async (req, res) => {
    const params = z.object({ projectId: z.string().min(1) }).safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: 'projectId is required' }); return; }
    try {
      const project = await loadOwnedCodingProject(db, req as AuthedRequest, params.data.projectId, res);
      if (!project) return;
      const orch = makeOrchestrator(db);
      const run = await orch.getRun(params.data.projectId);
      if (!run) { res.json({ success: true, run: null }); return; }
      res.json({ success: true, run: runView(run) });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /coding/studio/:projectId/run/stop — the STOP control ────────────
  router.post('/coding/studio/:projectId/run/stop', async (req, res) => {
    const params = z.object({ projectId: z.string().min(1) }).safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: 'projectId is required' }); return; }
    try {
      const project = await loadOwnedCodingProject(db, req as AuthedRequest, params.data.projectId, res);
      if (!project) return;
      const orch = makeOrchestrator(db);
      const run = await orch.requestStop(params.data.projectId);
      if (!run) { res.status(404).json({ error: 'No studio run to stop' }); return; }
      res.json({ success: true, run: runView(run) });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /coding/studio/:projectId/export — the .anton blueprint ──────────
  router.post('/coding/studio/:projectId/export', async (req, res) => {
    const params = z.object({ projectId: z.string().min(1) }).safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: 'projectId is required' }); return; }
    try {
      const project = await loadOwnedCodingProject(db, req as AuthedRequest, params.data.projectId, res);
      if (!project) return;

      const author = typeof (req.body ?? {}).author === 'string' ? (req.body as { author?: string }).author : undefined;
      let buffer = await doBundle(db, params.data.projectId, { author });
      // Opt-in Ed25519 provenance (Wave 2.4) — on unless sign === false.
      const sign = (req.body ?? {}).sign;
      if (sign !== false && sign !== 'false') {
        buffer = await doSign(db, buffer);
      }

      res.setHeader('Content-Type', 'application/octet-stream');
      const filename = `studio-${(project.name ?? 'project').toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'project'}.anton`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
