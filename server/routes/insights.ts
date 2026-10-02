/**
 * insights.ts
 * API for proactive intelligence insights (Improvement 3).
 */

import { Router, Request, Response } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

import { createProactiveIntelligenceService } from '../services/proactive-intelligence.js';
import { ownerFilter, type OwnedRequest } from '../middleware/ownership.js';
import { searchScopeForRequest } from '../services/hybrid-search.js';

export async function createInsightsRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();
  const intelService = await createProactiveIntelligenceService(db);

  function getUserId(req: Request): string {
    return (req as unknown as { user?: { id?: string } }).user?.id ?? 'default';
  }

  // ── List insights ──────────────────────────────────────────────────────────
  router.get('/insights', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const dismissedQ = String(req.query.dismissed || '');
      const dismissed = dismissedQ === 'true' ? true : dismissedQ === 'false' ? false : undefined;
      const areaId = req.query.area_id ? String(req.query.area_id) : undefined;
      const limit = Math.min(parseInt(String(req.query.limit || '50')), 100);

      const insights = await intelService.listInsights(userId, { dismissed, areaId, limit });
      const unreadCount = await intelService.countUnread(userId);

      res.json({ insights, unread_count: unreadCount });
    } catch (err) {
      console.error('[insights] list error:', err);
      res.status(500).json({ error: 'Failed to list insights' });
    }
  });

  // ── Get unread count (for bell badge) ─────────────────────────────────────
  router.get('/insights/unread-count', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const count = await intelService.countUnread(userId);
      res.json({ count });
    } catch (err) {
      res.status(500).json({ error: 'Failed to get count' });
    }
  });

  // An insight is its user's (user_id). In team mode a non-admin marks and
  // dismisses only their own; the owner check is inside the UPDATE, and a
  // colleague's insight answers the same 404 as a missing one. Until 2026-10-02
  // these took any id, and were not awaited.

  // ── Mark as read ───────────────────────────────────────────────────────────
  router.patch('/insights/:id/read', async (req: Request, res: Response) => {
    try {
      const done = await intelService.markRead(String(req.params.id), ownerFilter(req as unknown as OwnedRequest, 'user_id'));
      if (!done) return res.status(404).json({ error: 'Insight not found' });
      res.json({ read: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to mark as read' });
    }
  });

  // ── Dismiss insight ────────────────────────────────────────────────────────
  router.patch('/insights/:id/dismiss', async (req: Request, res: Response) => {
    try {
      const { action_taken } = (req.body ?? {}) as { action_taken?: unknown };
      const action = typeof action_taken === 'string' ? action_taken.slice(0, 500) : undefined;
      const done = await intelService.dismissInsight(String(req.params.id), action, ownerFilter(req as unknown as OwnedRequest, 'user_id'));
      if (!done) return res.status(404).json({ error: 'Insight not found' });
      res.json({ dismissed: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to dismiss insight' });
    }
  });

  // ── Run insight generation (background job trigger) ────────────────────────
  // Reads only the atoms the caller may read (own + shared in team mode).
  router.post('/insights/generate', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const result = await intelService.runInsightGeneration(userId, searchScopeForRequest(req as unknown as OwnedRequest));
      res.json(result);
    } catch (err) {
      console.error('[insights] generate error:', err);
      res.status(500).json({ error: 'Failed to generate insights' });
    }
  });

  // ── Create insight manually ────────────────────────────────────────────────
  router.post('/insights', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const insight = await intelService.createInsight({ ...req.body, user_id: userId });
      res.status(201).json({ insight });
    } catch (err) {
      console.error('[insights] create error:', err);
      res.status(500).json({ error: 'Failed to create insight' });
    }
  });

  return router;
}
