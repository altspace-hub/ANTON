// ── ANTON Studio — Kickoff Workshop routes (Studio P1) ─────────────────────
//
//   POST   /api/coding/workshop/sessions            { tier?, mode? }  → new session
//   GET    /api/coding/workshop/sessions            → the caller's sessions
//   GET    /api/coding/workshop/sessions/:id        → one session (state + charter)
//   GET    /api/coding/workshop/sessions/:id/start  → the opening assistant turn
//   POST   /api/coding/workshop/sessions/:id/respond { message } → next turn
//   POST   /api/coding/workshop/sessions/:id/finalize → assemble CHARTER + seed a
//                                                       coding_project; returns
//                                                       { charter, codingProjectId }
//   PATCH  /api/coding/workshop/sessions/:id/status { status }
//   DELETE /api/coding/workshop/sessions/:id
//
// The turn loop runs on resolveCodingModel('orchestrator') = Mistral Large (the
// PM/lead) inside the engine. The route NEVER calls an LLM directly. Finalize
// seeds the Studio project via the engine (a parent `projects` row + a
// `coding_projects` row, mirroring coding-large's POST /coding/projects) — it
// does NOT edit coding-large.ts (P3 owns that file).
//
// Ownership: a workshop session belongs to its creator (user_id). Admins see
// everything; everyone else only their own. Solo mode (no auth) → user_id null,
// visible to all (matches discovery's solo behavior).

import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseAdapter } from '../db/database.js';
import { safeError } from '../lib/error-response.js';
import {
  createCodingWorkshopEngine,
  type WorkshopTier,
  type WorkshopMode,
  type WorkshopStatus,
  type WorkshopEngineDeps,
} from '../services/coding-workshop-engine.js';

interface AuthedRequest {
  user?: { id: string; role?: string };
}

export interface CodingWorkshopRouteDeps extends WorkshopEngineDeps {}

const VALID_TIERS = new Set(['lite', 'standard', 'professional', 'expert']);
const VALID_MODES = new Set(['ask', 'project']);
const VALID_STATUSES = new Set(['active', 'paused', 'completed', 'abandoned']);

export function createCodingWorkshopRoutes(
  db: DatabaseAdapter,
  deps: CodingWorkshopRouteDeps = {},
): Router {
  const router = Router();
  const engine = createCodingWorkshopEngine(db, deps);

  /**
   * Load a workshop session the caller may touch. Admins bypass ownership; a
   * session created in solo mode (user_id null) is visible to all. Writes the
   * 401/404 response and returns null on failure.
   */
  async function loadOwned(
    req: AuthedRequest,
    id: string,
    res: import('express').Response,
  ): Promise<Awaited<ReturnType<typeof engine.getSession>> | null> {
    const session = await engine.getSession(id);
    if (!session) { res.status(404).json({ error: 'Workshop session not found' }); return null; }
    const userId = req.user?.id ?? null;
    const isAdmin = req.user?.role === 'admin';
    if (!isAdmin && session.userId && session.userId !== userId) {
      res.status(404).json({ error: 'Workshop session not found' });
      return null;
    }
    return session;
  }

  // ── POST /coding/workshop/sessions ──────────────────────────────────────
  router.post('/coding/workshop/sessions', async (req, res) => {
    try {
      const body = z.object({
        tier: z.string().optional(),
        mode: z.string().optional(),
      }).safeParse(req.body ?? {});
      const tier: WorkshopTier = body.success && VALID_TIERS.has(body.data.tier ?? '')
        ? (body.data.tier as WorkshopTier) : 'standard';
      const mode: WorkshopMode = body.success && VALID_MODES.has(body.data.mode ?? '')
        ? (body.data.mode as WorkshopMode) : 'project';
      const userId = (req as AuthedRequest).user?.id ?? null;
      const session = await engine.createSession(tier, mode, userId);
      res.json({ id: session.id, state: session.state, tier: session.tier, mode: session.mode });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /coding/workshop/sessions ───────────────────────────────────────
  router.get('/coding/workshop/sessions', async (req, res) => {
    try {
      const userId = (req as AuthedRequest).user?.id ?? null;
      const isAdmin = (req as AuthedRequest).user?.role === 'admin';
      const sessions = await engine.listSessions(isAdmin ? null : userId);
      res.json(sessions);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /coding/workshop/sessions/:id ───────────────────────────────────
  router.get('/coding/workshop/sessions/:id', async (req, res) => {
    try {
      const session = await loadOwned(req as AuthedRequest, req.params.id, res);
      if (!session) return;
      res.json(session);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /coding/workshop/sessions/:id/start ─────────────────────────────
  router.get('/coding/workshop/sessions/:id/start', async (req, res) => {
    try {
      const session = await loadOwned(req as AuthedRequest, req.params.id, res);
      if (!session) return;
      const result = await engine.startConversation(req.params.id);
      res.json(result);
    } catch (err) {
      res.status(502).json({ error: safeError(err) });
    }
  });

  // ── POST /coding/workshop/sessions/:id/respond ──────────────────────────
  router.post('/coding/workshop/sessions/:id/respond', async (req, res) => {
    try {
      const body = z.object({
        message: z.string().min(1).max(20_000),
        attachmentIds: z.array(z.string().max(300)).max(10).optional(),
      }).safeParse(req.body ?? {});
      if (!body.success) { res.status(400).json({ error: 'message is required' }); return; }
      const session = await loadOwned(req as AuthedRequest, req.params.id, res);
      if (!session) return;
      const result = await engine.processUserResponse(req.params.id, body.data.message.trim(), body.data.attachmentIds ?? []);
      res.json(result);
    } catch (err) {
      res.status(502).json({ error: safeError(err) });
    }
  });

  // ── POST /coding/workshop/sessions/:id/finalize ─────────────────────────
  router.post('/coding/workshop/sessions/:id/finalize', async (req, res) => {
    try {
      const session = await loadOwned(req as AuthedRequest, req.params.id, res);
      if (!session) return;
      const userId = (req as AuthedRequest).user?.id ?? null;
      const result = await engine.finalize(req.params.id, userId);
      res.json({
        charter: result.charter,
        codingProjectId: result.codingProjectId,
        projectId: result.projectId,
      });
    } catch (err) {
      // A missing problem statement is a 400 (the caller must keep talking).
      const message = safeError(err);
      const status = /problem statement/i.test(message) ? 400 : 500;
      res.status(status).json({ error: message });
    }
  });

  // ── PATCH /coding/workshop/sessions/:id/status ──────────────────────────
  router.patch('/coding/workshop/sessions/:id/status', async (req, res) => {
    try {
      const body = z.object({ status: z.string() }).safeParse(req.body ?? {});
      if (!body.success || !VALID_STATUSES.has(body.data.status)) {
        res.status(400).json({ error: 'status must be one of active|paused|completed|abandoned' });
        return;
      }
      const session = await loadOwned(req as AuthedRequest, req.params.id, res);
      if (!session) return;
      await engine.updateSessionStatus(req.params.id, body.data.status as WorkshopStatus);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── DELETE /coding/workshop/sessions/:id ────────────────────────────────
  router.delete('/coding/workshop/sessions/:id', async (req, res) => {
    try {
      const session = await loadOwned(req as AuthedRequest, req.params.id, res);
      if (!session) return;
      await engine.deleteSession(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
