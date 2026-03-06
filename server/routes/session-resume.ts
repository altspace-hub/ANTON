/**
 * session-resume.ts (route)
 * API for session snapshot management (Session Resume feature).
 */

import { Router, Request, Response } from 'express';
import type Database from 'better-sqlite3';
import { createSessionResumeService, type CreateSnapshotInput } from '../services/session-resume.js';

export function createSessionResumeRoutes(db: Database.Database): Router {
  const router = Router();
  const resumeService = createSessionResumeService(db);

  function getUserId(req: Request): string {
    return (req as unknown as { user?: { id?: string } }).user?.id ?? 'default';
  }

  // ── Create snapshot ────────────────────────────────────────────────────────
  router.post('/sessions/:sessionId/snapshots', (req: Request, res: Response) => {
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

      const snapshot = resumeService.createSnapshot(input);
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
  router.get('/sessions/:sessionId/snapshots', (req: Request, res: Response) => {
    try {
      const sessionId = String(req.params.sessionId);
      const limit = Math.min(parseInt(String(req.query.limit || '10')), 50);
      const snapshots = resumeService.listSnapshots(sessionId, limit);
      res.json({ snapshots });
    } catch (err) {
      console.error('[session-resume] list snapshots error:', err);
      res.status(500).json({ error: 'Failed to list snapshots' });
    }
  });

  // ── Get latest snapshot ────────────────────────────────────────────────────
  router.get('/sessions/:sessionId/snapshots/latest', (req: Request, res: Response) => {
    try {
      const sessionId = String(req.params.sessionId);
      const snapshot = resumeService.getLatestSnapshot(sessionId);
      if (!snapshot) return res.status(404).json({ error: 'No snapshots found' });
      res.json({ snapshot });
    } catch (err) {
      console.error('[session-resume] get latest snapshot error:', err);
      res.status(500).json({ error: 'Failed to get snapshot' });
    }
  });

  // ── Get resume context (prompt layer 4a) ───────────────────────────────────
  router.get('/sessions/:sessionId/resume-context', (req: Request, res: Response) => {
    try {
      const sessionId = String(req.params.sessionId);
      const snapshot = resumeService.getLatestSnapshot(sessionId);
      if (!snapshot) return res.json({ context: '' });
      const context = resumeService.buildResumeContext(snapshot);
      res.json({ context, snapshot });
    } catch (err) {
      console.error('[session-resume] get resume context error:', err);
      res.status(500).json({ error: 'Failed to get resume context' });
    }
  });

  // ── Delete snapshot ────────────────────────────────────────────────────────
  router.delete('/sessions/:sessionId/snapshots/:snapshotId', (req: Request, res: Response) => {
    try {
      const deleted = resumeService.deleteSnapshot(String(req.params.snapshotId));
      if (!deleted) return res.status(404).json({ error: 'Snapshot not found' });
      res.json({ deleted: true });
    } catch (err) {
      console.error('[session-resume] delete snapshot error:', err);
      res.status(500).json({ error: 'Failed to delete snapshot' });
    }
  });

  return router;
}
