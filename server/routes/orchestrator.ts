/**
 * orchestrator.ts
 *
 * ANTON Orchestrator — REST API Routes (Phase 1: Observer)
 *
 * Endpoints:
 *   GET  /api/orchestrator/status           — stage, config, last heartbeat
 *   GET  /api/orchestrator/stage            — stage with progression metrics
 *   GET  /api/orchestrator/briefings        — list briefings (paginated)
 *   GET  /api/orchestrator/briefings/:id    — single briefing with proposals
 *   POST /api/orchestrator/briefings/generate — manually trigger a briefing
 *   GET  /api/orchestrator/proposals        — list proposals (filtered)
 *   PATCH /api/orchestrator/proposals/:id  — rate / provide feedback
 *   GET  /api/orchestrator/heartbeats       — heartbeat log
 *   GET  /api/orchestrator/config           — current config
 *   PATCH /api/orchestrator/config          — update config (admin)
 *   POST /api/orchestrator/pause            — pause (admin)
 *   POST /api/orchestrator/resume           — resume (admin)
 */

import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import type AnthropicSDK from '@anthropic-ai/sdk';
import { requireAuth } from '../middleware/auth.js';
import { runHeartbeatCycle } from '../services/orchestrator-engine.js';

export function createOrchestratorRoutes(db: Database.Database, anthropic: AnthropicSDK | null): Router {
  const router = Router();

  // ── Status ─────────────────────────────────────────────────────────────────
  router.get('/orchestrator/status', requireAuth, (_req: Request, res: Response) => {
    try {
      const stage = db.prepare('SELECT * FROM orchestrator_stage WHERE id = ?').get('default');
      const config = db.prepare('SELECT * FROM orchestrator_config WHERE id = ?').get('default');
      const lastHeartbeat = db.prepare(
        'SELECT * FROM orchestrator_heartbeats ORDER BY ran_at DESC LIMIT 1'
      ).get();
      const unreadBriefings = (db.prepare(
        "SELECT COUNT(*) as c FROM orchestrator_briefings WHERE status = 'unread'"
      ).get() as { c: number }).c;

      res.json({
        stage,
        config,
        lastHeartbeat,
        unreadBriefings,
        apiConfigured: !!anthropic,
      });
    } catch (err) {
      console.error('[orchestrator] status error:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Stage ─────────────────────────────────────────────────────────────────
  router.get('/orchestrator/stage', requireAuth, (_req: Request, res: Response) => {
    try {
      const stage = db.prepare('SELECT * FROM orchestrator_stage WHERE id = ?').get('default');
      res.json({ stage });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Briefings list ────────────────────────────────────────────────────────
  router.get('/orchestrator/briefings', requireAuth, (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100);
      const offset = parseInt(String(req.query.offset ?? '0'), 10) || 0;
      const period = req.query.period as string | undefined;
      const status = req.query.status as string | undefined;

      let sql = 'SELECT id, user_id, period, signals_read, proposals_count, status, created_at FROM orchestrator_briefings WHERE 1=1';
      const params: (string | number)[] = [];
      if (period) { sql += ' AND period = ?'; params.push(period); }
      if (status) { sql += ' AND status = ?'; params.push(status); }
      sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const briefings = db.prepare(sql).all(...params);
      const total = (db.prepare('SELECT COUNT(*) as c FROM orchestrator_briefings').get() as { c: number }).c;
      res.json({ briefings, total, limit, offset });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Single briefing with proposals ───────────────────────────────────────
  router.get('/orchestrator/briefings/:id', requireAuth, (req: Request, res: Response) => {
    try {
      const briefing = db.prepare('SELECT * FROM orchestrator_briefings WHERE id = ?').get(req.params.id) as { status: string } | undefined;
      if (!briefing) return res.status(404).json({ error: 'Briefing not found' });

      const proposals = db.prepare(
        'SELECT * FROM orchestrator_proposals WHERE briefing_id = ? ORDER BY urgency_score DESC'
      ).all(req.params.id);

      // Mark as read
      if ((briefing as { status: string }).status === 'unread') {
        db.prepare("UPDATE orchestrator_briefings SET status = 'read' WHERE id = ?").run(req.params.id);
      }

      res.json({ briefing: { ...briefing, status: 'read' }, proposals });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Generate briefing on demand ──────────────────────────────────────────
  router.post('/orchestrator/briefings/generate', requireAuth, async (_req: Request, res: Response) => {
    if (!anthropic) return res.status(503).json({ error: 'Anthropic API not configured' });
    try {
      const result = await runHeartbeatCycle(db, anthropic, 'on_demand', true);
      res.json({ result });
    } catch (err) {
      console.error('[orchestrator] generate briefing error:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Proposals list ────────────────────────────────────────────────────────
  router.get('/orchestrator/proposals', requireAuth, (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);
      const status = req.query.status as string | undefined;
      const source = req.query.source as string | undefined;

      let sql = 'SELECT * FROM orchestrator_proposals WHERE 1=1';
      const params: (string | number)[] = [];
      if (status) { sql += ' AND status = ?'; params.push(status); }
      if (source) { sql += ' AND signal_source = ?'; params.push(source); }
      sql += ' ORDER BY urgency_score DESC, created_at DESC LIMIT ?';
      params.push(limit);

      const proposals = db.prepare(sql).all(...params);
      res.json({ proposals });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Rate / feedback on a proposal ────────────────────────────────────────
  router.patch('/orchestrator/proposals/:id', requireAuth, (req: Request, res: Response) => {
    try {
      const { human_rating, human_feedback } = req.body as {
        human_rating?: string;
        human_feedback?: string;
      };

      const validRatings = ['good_catch', 'relevant', 'low_priority', 'irrelevant', 'wrong'];
      if (human_rating && !validRatings.includes(human_rating)) {
        return res.status(400).json({ error: `human_rating must be one of: ${validRatings.join(', ')}` });
      }

      const proposal = db.prepare('SELECT * FROM orchestrator_proposals WHERE id = ?').get(req.params.id) as
        | { human_rating: string | null; status: string } | undefined;
      if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

      db.prepare(`
        UPDATE orchestrator_proposals SET
          human_rating = COALESCE(?, human_rating),
          human_feedback = COALESCE(?, human_feedback),
          decided_at = COALESCE(decided_at, datetime('now')),
          decided_by = COALESCE(decided_by, 'solo')
        WHERE id = ?
      `).run(human_rating ?? null, human_feedback ?? null, req.params.id);

      // Update stage metrics if this is a new rating
      if (human_rating && !proposal.human_rating) {
        const isPositive = ['good_catch', 'relevant'].includes(human_rating);
        const isNegative = ['irrelevant', 'wrong'].includes(human_rating);
        db.prepare(`
          UPDATE orchestrator_stage SET
            proposals_rated = proposals_rated + 1,
            proposals_good_or_relevant = proposals_good_or_relevant + ?,
            proposals_irrelevant_or_wrong = proposals_irrelevant_or_wrong + ?,
            updated_at = datetime('now')
          WHERE id = 'default'
        `).run(isPositive ? 1 : 0, isNegative ? 1 : 0);
      }

      const updated = db.prepare('SELECT * FROM orchestrator_proposals WHERE id = ?').get(req.params.id);
      res.json({ proposal: updated });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Heartbeat log ─────────────────────────────────────────────────────────
  router.get('/orchestrator/heartbeats', requireAuth, (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);
      const rows = db.prepare(
        'SELECT * FROM orchestrator_heartbeats ORDER BY ran_at DESC LIMIT ?'
      ).all(limit);
      res.json({ heartbeats: rows });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Config ────────────────────────────────────────────────────────────────
  router.get('/orchestrator/config', requireAuth, (_req: Request, res: Response) => {
    try {
      const config = db.prepare('SELECT * FROM orchestrator_config WHERE id = ?').get('default');
      res.json({ config });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.patch('/orchestrator/config', requireAuth, (req: Request, res: Response) => {
    try {
      const allowed = [
        'heartbeat_enabled', 'heartbeat_interval_minutes', 'briefing_schedule', 'briefing_time',
        'radar_urgency_threshold', 'quality_decline_threshold', 'deadline_alert_days',
        'heartbeat_model', 'briefing_model', 'planning_model',
      ];
      const updates: Record<string, unknown> = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
      }
      if (Object.keys(updates).length === 0) return res.json({ ok: true });

      const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      const vals = [...Object.values(updates), new Date().toISOString()];
      db.prepare(`UPDATE orchestrator_config SET ${sets}, updated_at = ? WHERE id = 'default'`).run(...vals);

      const config = db.prepare('SELECT * FROM orchestrator_config WHERE id = ?').get('default');
      res.json({ config });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Kill switch: pause ────────────────────────────────────────────────────
  router.post('/orchestrator/pause', requireAuth, (req: Request, res: Response) => {
    try {
      const user = (req as unknown as { user?: { username?: string } }).user?.username ?? 'solo';
      db.prepare(`
        UPDATE orchestrator_config SET
          orchestrator_paused = 1, paused_at = datetime('now'), paused_by = ?, updated_at = datetime('now')
        WHERE id = 'default'
      `).run(user);
      res.json({ ok: true, paused: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Kill switch: resume ───────────────────────────────────────────────────
  router.post('/orchestrator/resume', requireAuth, (req: Request, res: Response) => {
    try {
      db.prepare(`
        UPDATE orchestrator_config SET
          orchestrator_paused = 0, paused_at = NULL, paused_by = NULL, updated_at = datetime('now')
        WHERE id = 'default'
      `).run();
      res.json({ ok: true, paused: false });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Kill switch: reset to Observer ───────────────────────────────────────
  router.post('/orchestrator/reset', requireAuth, (_req: Request, res: Response) => {
    try {
      const now = new Date().toISOString();
      const existing = db.prepare('SELECT stage_history, current_stage, stage_entered_at FROM orchestrator_stage WHERE id = ?').get('default') as
        | { stage_history: string; current_stage: number; stage_entered_at: string } | undefined;

      const history = JSON.parse(existing?.stage_history || '[]') as unknown[];
      if (existing && existing.current_stage > 1) {
        history.push({
          stage: existing.current_stage,
          entered_at: existing.stage_entered_at,
          exited_at: now,
          reason: 'Manual reset by admin',
        });
      }

      db.prepare(`
        UPDATE orchestrator_stage SET
          current_stage = 1, stage_entered_at = ?, stage_history = ?,
          total_briefings = 0, total_proposals = 0, proposals_rated = 0,
          proposals_good_or_relevant = 0, proposals_irrelevant_or_wrong = 0,
          updated_at = ?
        WHERE id = 'default'
      `).run(now, JSON.stringify(history), now);

      db.prepare(`
        UPDATE orchestrator_config SET orchestrator_paused = 0, updated_at = ?
        WHERE id = 'default'
      `).run(now);

      res.json({ ok: true, stage: 1, reset: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
