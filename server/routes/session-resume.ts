/**
 * session-resume.ts (route)
 * API for session snapshot management (Session Resume feature).
 *
 * ── Ownership lives in router.param, not in the handlers ─────────────────────
 *
 * sessions.ts already scopes `GET /api/sessions/:id` to its owner, but every
 * route here took :sessionId straight to the service. On a
 * DEPLOYMENT_MODE=team instance that made the snapshot endpoints a bypass of
 * that guard: a snapshot carries the conversation summary, key decisions and
 * resume context derived from the session's messages, so
 * `GET /api/sessions/<someone else's id>/snapshots/latest` and
 * `/resume-context` returned exactly the material `GET /api/sessions/:id`
 * refuses.
 *
 * The guard is a `router.param('sessionId', …)` rather than a call at the top
 * of each handler, because the bug was a MISSING call in five places at once.
 * A param gate cannot be forgotten: any route added to this router that names
 * :sessionId is covered the moment it is written. Do not "simplify" it into the
 * handlers.
 *
 * No-op in solo mode and for admins — assertOwned short-circuits there, so the
 * single operator still reaches sessions written before user_id was stamped
 * (coding-scripts.ts still creates some with none).
 */

import { Router, Request, Response, NextFunction } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { assertOwned, type OwnedRequest } from '../middleware/ownership.js';

import { createSessionResumeService, type CreateSnapshotInput } from '../services/session-resume.js';

export async function createSessionResumeRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();
  const resumeService = await createSessionResumeService(db);

  function getUserId(req: Request): string {
    return (req as unknown as { user?: { id?: string } }).user?.id ?? 'default';
  }

  // ── Ownership gate for every :sessionId route in this router ───────────────
  // 404 rather than 403 on a miss, matching sessions.ts: a 403 would confirm the
  // session exists and belongs to somebody else.
  router.param('sessionId', async (req: Request, res: Response, next: NextFunction, sessionId: string) => {
    try {
      const allowed = await assertOwned(db, req as OwnedRequest, res, {
        table: 'sessions', ownerColumn: 'user_id', id: String(sessionId),
        notFoundMessage: 'Session not found',
      });
      if (!allowed) return;   // 401/404 already sent
      next();
    } catch (err) {
      next(err);
    }
  });

  // ── Create snapshot ────────────────────────────────────────────────────────
  router.post('/sessions/:sessionId/snapshots', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const sessionId = String(req.params.sessionId);
      const input: CreateSnapshotInput = {
        session_id: sessionId,
        snapshot_type: req.body.snapshot_type ?? 'manual',
        title: req.body.title,
        summary: req.body.summary,
        key_decisions: req.body.key_decisions,
        open_questions: req.body.open_questions,
        next_steps: req.body.next_steps,
        context_state: req.body.context_state,
        user_id: userId,
      };

      if (!input.summary) {
        return res.status(400).json({ error: 'summary is required' });
      }

      // await: createSnapshot is async, and without this the response body was
      // the serialised Promise — `{}` — and a failed insert became an unhandled
      // rejection instead of the 500 below.
      const snapshot = await resumeService.createSnapshot(input);
      res.status(201).json({ snapshot });
    } catch (err) {
      console.error('[session-resume] create snapshot error:', err);
      res.status(500).json({ error: 'Failed to create snapshot' });
    }
  });

  // ── Auto-generate snapshot ─────────────────────────────────────────────────
  router.post('/sessions/:sessionId/snapshots/auto', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const sessionId = String(req.params.sessionId);
      const snapshot = await resumeService.autoGenerateSnapshot(sessionId, userId);
      res.status(201).json({ snapshot });
    } catch (err) {
      console.error('[session-resume] auto snapshot error:', err);
      res.status(500).json({ error: 'Failed to generate snapshot' });
    }
  });

  // ── List snapshots ─────────────────────────────────────────────────────────
  router.get('/sessions/:sessionId/snapshots', async (req: Request, res: Response) => {
    try {
      const sessionId = String(req.params.sessionId);
      const limit = Math.min(parseInt(String(req.query.limit || '10')), 50);
      // await: see createSnapshot — this returned a Promise, so the endpoint
      // answered `{"snapshots":{}}` for every session it has ever been called on.
      const snapshots = await resumeService.listSnapshots(sessionId, limit);
      res.json({ snapshots });
    } catch (err) {
      console.error('[session-resume] list snapshots error:', err);
      res.status(500).json({ error: 'Failed to list snapshots' });
    }
  });

  // ── Get latest snapshot ────────────────────────────────────────────────────
  router.get('/sessions/:sessionId/snapshots/latest', async (req: Request, res: Response) => {
    try {
      const sessionId = String(req.params.sessionId);
      const snapshot = await resumeService.getLatestSnapshot(sessionId);
      if (!snapshot) return res.status(404).json({ error: 'No snapshots found' });
      res.json({ snapshot });
    } catch (err) {
      console.error('[session-resume] get latest snapshot error:', err);
      res.status(500).json({ error: 'Failed to get snapshot' });
    }
  });

  // ── Get resume context (prompt layer 4a) ───────────────────────────────────
  router.get('/sessions/:sessionId/resume-context', async (req: Request, res: Response) => {
    try {
      const sessionId = String(req.params.sessionId);
      const snapshot = await resumeService.getLatestSnapshot(sessionId);
      if (!snapshot) return res.json({ context: '' });
      const context = resumeService.buildResumeContext(snapshot);
      res.json({ context, snapshot });
    } catch (err) {
      console.error('[session-resume] get resume context error:', err);
      res.status(500).json({ error: 'Failed to get resume context' });
    }
  });

  // ── Delete snapshot ────────────────────────────────────────────────────────
  router.delete('/sessions/:sessionId/snapshots/:snapshotId', async (req: Request, res: Response) => {
    try {
      // The router.param gate proves the caller owns :sessionId. The snapshot id
      // is a separate, independently guessable key, so it must be tied back to
      // that session — otherwise the caller pairs their OWN sessionId (which
      // passes the gate) with someone else's snapshotId and deletes it.
      const deleted = await resumeService.deleteSnapshotForSession(
        String(req.params.snapshotId), String(req.params.sessionId),
      );
      if (!deleted) return res.status(404).json({ error: 'Snapshot not found' });
      res.json({ deleted: true });
    } catch (err) {
      console.error('[session-resume] delete snapshot error:', err);
      res.status(500).json({ error: 'Failed to delete snapshot' });
    }
  });

  return router;
}
