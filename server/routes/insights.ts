/**
 * insights.ts
 * API for proactive intelligence insights (Improvement 3).
 */

import { Router, Request, Response } from 'express';
import type Database from 'better-sqlite3';
import { createProactiveIntelligenceService } from '../services/proactive-intelligence.js';

export function createInsightsRoutes(db: Database.Database): Router {
  const router = Router();
  const intelService = createProactiveIntelligenceService(db);

  function getUserId(req: Request): string {
    return (req as unknown as { user?: { id?: string } }).user?.id ?? 'default';
  }

  // ── List insights ──────────────────────────────────────────────────────────
  router.get('/insights', (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const dismissedQ = String(req.query.dismissed || '');
      const dismissed = dismissedQ === 'true' ? true : dismissedQ === 'false' ? false : undefined;
      const areaId = req.query.area_id ? String(req.query.area_id) : undefined;
      const limit = Math.min(parseInt(String(req.query.limit || '50')), 100);

      const insights = intelService.listInsights(userId, { dismissed, areaId, limit });
      const unreadCount = intelService.countUnread(userId);

      res.json({ insights, unread_count: unreadCount });
    } catch (err) {
      console.error('[insights] list error:', err);
      res.status(500).json({ error: 'Failed to list insights' });
    }
  });

  // ── Get unread count (for bell badge) ─────────────────────────────────────
  router.get('/insights/unread-count', (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const count = intelService.countUnread(userId);
      res.json({ count });
    } catch (err) {
      res.status(500).json({ error: 'Failed to get count' });
    }
  });

  // ── Mark as read ───────────────────────────────────────────────────────────
  router.patch('/insights/:id/read', (req: Request, res: Response) => {
    try {
      intelService.markRead(String(req.params.id));
      res.json({ read: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to mark as read' });
    }
  });

  // ── Dismiss insight ────────────────────────────────────────────────────────
  router.patch('/insights/:id/dismiss', (req: Request, res: Response) => {
    try {
      const { action_taken } = req.body as { action_taken?: string };
      intelService.dismissInsight(String(req.params.id), action_taken);
      res.json({ dismissed: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to dismiss insight' });
    }
  });

  // ── Run insight generation (background job trigger) ────────────────────────
  router.post('/insights/generate', (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const result = intelService.runInsightGeneration(userId);
      res.json(result);
    } catch (err) {
      console.error('[insights] generate error:', err);
      res.status(500).json({ error: 'Failed to generate insights' });
    }
  });

  // ── Create insight manually ────────────────────────────────────────────────
  router.post('/insights', (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const insight = intelService.createInsight({ ...req.body, user_id: userId });
      res.status(201).json({ insight });
    } catch (err) {
      console.error('[insights] create error:', err);
      res.status(500).json({ error: 'Failed to create insight' });
    }
  });

  return router;
}
