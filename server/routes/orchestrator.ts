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
import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import type AnthropicSDK from '@anthropic-ai/sdk';
import { requireAuth } from '../middleware/auth.js';
import { runHeartbeatCycle, createReasoningTrail, addTrailEntry, completeTrail } from '../services/orchestrator-engine.js';

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

  // ── Phase 2: Approve a proposal (creates orchestrator_execution) ────────────
  router.post('/orchestrator/proposals/:id/approve', requireAuth, (req: Request, res: Response) => {
    try {
      const proposal = db.prepare('SELECT * FROM orchestrator_proposals WHERE id = ?').get(req.params.id) as
        | { id: string; status: string; proposed_action: string; action_type: string; confidence_score: number } | undefined;
      if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

      const stage = db.prepare('SELECT current_stage FROM orchestrator_stage WHERE id = ?').get('default') as
        | { current_stage: number } | undefined;
      if (!stage || stage.current_stage < 2) {
        return res.status(403).json({ error: 'Proposal execution requires Stage 2 (Proposal Manager) or higher' });
      }

      const user = (req as unknown as { user?: { username?: string } }).user?.username ?? 'solo';
      const { workflow_run_id, notes } = req.body as { workflow_run_id?: string; notes?: string };

      // Create a workflow_runs record so execution is tracked in the workflow engine
      const workflowRunId = randomUUID();
      const workflowId = (proposal as Record<string, unknown>).action_type as string || 'orchestrator-action';
      try {
        db.prepare(`
          INSERT INTO workflow_runs (id, workflow_id, trigger_source, status, user_id)
          VALUES (?, ?, 'orchestrator_approval', 'running', ?)
        `).run(workflowRunId, workflowId, user);
      } catch {
        // workflow_runs table may not exist on older DBs — non-fatal
        console.warn('[orchestrator] workflow_runs insert skipped (table may not exist)');
      }

      const executionId = randomUUID();
      db.prepare(`
        INSERT INTO orchestrator_executions
          (id, proposal_id, workflow_run_id, org_id, initiated_by, initiated_at, human_notes)
        VALUES (?, ?, ?, ?, 'human_approved', datetime('now'), ?)
      `).run(executionId, proposal.id, workflow_run_id ?? workflowRunId, null, notes ?? null);

      // Update proposal status to approved
      db.prepare(`
        UPDATE orchestrator_proposals SET
          status = 'approved', decided_at = datetime('now'), decided_by = ?
        WHERE id = ?
      `).run(user, proposal.id);

      // Create reasoning trail for this approval action
      const trailId = createReasoningTrail(db, 'approval');
      addTrailEntry(db, trailId, {
        entry_type: 'execution_decision',
        title: `Proposal approved by ${user}`,
        content: `Human approval received for proposal.\n\nProposed action: ${proposal.proposed_action}\nAction type: ${proposal.action_type}\nConfidence: ${Math.round(proposal.confidence_score * 100)}%\n${notes ? `\nApprover notes: ${notes}` : ''}`,
        confidence: 1.0,
        metadata: { proposal_id: proposal.id, execution_id: executionId, approved_by: user },
      });
      completeTrail(db, trailId, 'completed', 0, { proposal_id: proposal.id, execution_id: executionId });

      const execution = db.prepare('SELECT * FROM orchestrator_executions WHERE id = ?').get(executionId);
      res.status(201).json({ execution, trailId });
    } catch (err) {
      console.error('[orchestrator] approve error:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Phase 2: Reject a proposal ───────────────────────────────────────────
  router.post('/orchestrator/proposals/:id/reject', requireAuth, (req: Request, res: Response) => {
    try {
      const proposal = db.prepare('SELECT * FROM orchestrator_proposals WHERE id = ?').get(req.params.id) as
        | { id: string; status: string } | undefined;
      if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

      const user = (req as unknown as { user?: { username?: string } }).user?.username ?? 'solo';
      const { reason } = req.body as { reason?: string };

      db.prepare(`
        UPDATE orchestrator_proposals SET
          status = 'rejected', human_rating = 'wrong',
          human_feedback = ?, decided_at = datetime('now'), decided_by = ?
        WHERE id = ?
      `).run(reason ?? null, user, proposal.id);

      // Update stage metrics (rejection = negative signal)
      const existing = db.prepare('SELECT human_rating FROM orchestrator_proposals WHERE id = ?').get(proposal.id) as { human_rating: string | null } | undefined;
      if (!existing?.human_rating) {
        db.prepare(`
          UPDATE orchestrator_stage SET
            proposals_rated = proposals_rated + 1,
            proposals_irrelevant_or_wrong = proposals_irrelevant_or_wrong + 1,
            updated_at = datetime('now')
          WHERE id = 'default'
        `).run();
      }

      // Create reasoning trail for rejection
      const trailId = createReasoningTrail(db, 'rejection');
      addTrailEntry(db, trailId, {
        entry_type: 'execution_decision',
        title: `Proposal rejected by ${user}`,
        content: `Proposal rejected.${reason ? `\nReason: ${reason}` : ''}`,
        confidence: 1.0,
        metadata: { proposal_id: proposal.id, rejected_by: user },
      });
      completeTrail(db, trailId, 'completed', 0, { proposal_id: proposal.id });

      res.json({ ok: true, status: 'rejected', trailId });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Phase 2: Modify a proposal (human adjusts scope then approves) ───────
  router.post('/orchestrator/proposals/:id/modify', requireAuth, (req: Request, res: Response) => {
    try {
      const proposal = db.prepare('SELECT * FROM orchestrator_proposals WHERE id = ?').get(req.params.id) as
        | { id: string; status: string; proposed_action: string; action_type: string } | undefined;
      if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

      const stage = db.prepare('SELECT current_stage FROM orchestrator_stage WHERE id = ?').get('default') as
        | { current_stage: number } | undefined;
      if (!stage || stage.current_stage < 2) {
        return res.status(403).json({ error: 'Proposal modification requires Stage 2 or higher' });
      }

      const user = (req as unknown as { user?: { username?: string } }).user?.username ?? 'solo';
      const { modification_notes, modified_action } = req.body as {
        modification_notes?: string;
        modified_action?: string;
      };

      db.prepare(`
        UPDATE orchestrator_proposals SET
          status = 'modified',
          human_feedback = ?,
          proposed_action = COALESCE(?, proposed_action),
          decided_at = datetime('now'),
          decided_by = ?
        WHERE id = ?
      `).run(modification_notes ?? null, modified_action ?? null, user, proposal.id);

      // Stage metric
      db.prepare(`
        UPDATE orchestrator_stage SET
          plans_modified = plans_modified + 1,
          proposals_rated = proposals_rated + 1,
          proposals_good_or_relevant = proposals_good_or_relevant + 1,
          updated_at = datetime('now')
        WHERE id = 'default'
      `).run();

      const trailId = createReasoningTrail(db, 'modification');
      addTrailEntry(db, trailId, {
        entry_type: 'execution_decision',
        title: `Proposal modified by ${user}`,
        content: `Human modified proposal scope before approval.\n${modification_notes ? `Notes: ${modification_notes}` : ''}\n${modified_action ? `New action: ${modified_action}` : ''}`,
        confidence: 1.0,
        metadata: { proposal_id: proposal.id, modified_by: user },
      });
      completeTrail(db, trailId, 'completed', 0, { proposal_id: proposal.id });

      const updated = db.prepare('SELECT * FROM orchestrator_proposals WHERE id = ?').get(proposal.id);
      // Return redirect path so frontend can navigate to WorkflowMonitor with context
      res.json({
        proposal: updated,
        trailId,
        redirect: `/workflow-monitor?orchestrator_proposal=${proposal.id}&action=${encodeURIComponent(proposal.action_type)}`,
      });
    } catch (err) {
      console.error('[orchestrator] modify error:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Executions list ──────────────────────────────────────────────────────
  router.get('/orchestrator/executions', requireAuth, (req: Request, res: Response) => {
    try {
      // Guard: table may not exist on older DBs
      const tableExists = (db.prepare(
        "SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='orchestrator_executions'"
      ).get() as { c: number }).c > 0;
      if (!tableExists) return res.json({ executions: [], total: 0 });

      const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100);
      const offset = parseInt(String(req.query.offset ?? '0'), 10) || 0;

      const executions = db.prepare(`
        SELECT e.*, p.proposed_action, p.action_type, p.signal_source
        FROM orchestrator_executions e
        LEFT JOIN orchestrator_proposals p ON p.id = e.proposal_id
        ORDER BY e.initiated_at DESC
        LIMIT ? OFFSET ?
      `).all(limit, offset);

      const total = (db.prepare('SELECT COUNT(*) as c FROM orchestrator_executions').get() as { c: number }).c;
      res.json({ executions, total, limit, offset });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Single execution detail ──────────────────────────────────────────────
  router.get('/orchestrator/executions/:id', requireAuth, (req: Request, res: Response) => {
    try {
      const execution = db.prepare('SELECT * FROM orchestrator_executions WHERE id = ?').get(req.params.id);
      if (!execution) return res.status(404).json({ error: 'Execution not found' });
      res.json({ execution });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Record execution outcome ─────────────────────────────────────────────
  router.patch('/orchestrator/executions/:id/outcome', requireAuth, (req: Request, res: Response) => {
    try {
      const { outcome, quality_assessment, human_satisfaction, human_notes } = req.body as {
        outcome?: string;
        quality_assessment?: Record<string, unknown>;
        human_satisfaction?: string;
        human_notes?: string;
      };

      const validOutcomes = ['success', 'partial', 'failed', 'escalated', 'cancelled'];
      if (outcome && !validOutcomes.includes(outcome)) {
        return res.status(400).json({ error: `outcome must be one of: ${validOutcomes.join(', ')}` });
      }

      db.prepare(`
        UPDATE orchestrator_executions SET
          outcome = COALESCE(?, outcome),
          quality_assessment = COALESCE(?, quality_assessment),
          human_satisfaction = COALESCE(?, human_satisfaction),
          human_notes = COALESCE(?, human_notes),
          completed_at = CASE WHEN ? IS NOT NULL THEN datetime('now') ELSE completed_at END
        WHERE id = ?
      `).run(
        outcome ?? null,
        quality_assessment ? JSON.stringify(quality_assessment) : null,
        human_satisfaction ?? null,
        human_notes ?? null,
        outcome ?? null,
        req.params.id
      );

      const updated = db.prepare('SELECT * FROM orchestrator_executions WHERE id = ?').get(req.params.id);
      res.json({ execution: updated });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Reasoning trails list ────────────────────────────────────────────────
  router.get('/orchestrator/trails', requireAuth, (req: Request, res: Response) => {
    try {
      const tableExists = (db.prepare(
        "SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='orchestrator_reasoning_trails'"
      ).get() as { c: number }).c > 0;
      if (!tableExists) return res.json({ trails: [], total: 0 });

      const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100);
      const offset = parseInt(String(req.query.offset ?? '0'), 10) || 0;

      const trails = db.prepare(`
        SELECT id, trigger_type, transparency_level, status,
               narrative_summary, total_entries, duration_ms,
               heartbeat_id, briefing_id, proposal_id, execution_id,
               created_at, completed_at
        FROM orchestrator_reasoning_trails
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).all(limit, offset);

      const total = (db.prepare('SELECT COUNT(*) as c FROM orchestrator_reasoning_trails').get() as { c: number }).c;
      res.json({ trails, total, limit, offset });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Single trail with entries ────────────────────────────────────────────
  router.get('/orchestrator/trails/:id', requireAuth, (req: Request, res: Response) => {
    try {
      const trail = db.prepare('SELECT * FROM orchestrator_reasoning_trails WHERE id = ?').get(req.params.id);
      if (!trail) return res.status(404).json({ error: 'Trail not found' });

      const entries = db.prepare(`
        SELECT * FROM orchestrator_reasoning_entries
        WHERE trail_id = ?
        ORDER BY sequence_number ASC
      `).all(req.params.id);

      res.json({ trail, entries });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
