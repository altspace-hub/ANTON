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
import type { DatabaseAdapter } from '../db/database.js';

import type AnthropicSDK from '@anthropic-ai/sdk';
import { requireAuth } from '../middleware/auth.js';
import {
  runHeartbeatCycle,
  createReasoningTrail, addTrailEntry, completeTrail,
  ORCHESTRATOR_HARD_LIMITS,
  checkStageDemotion, generateManagementReport,
} from '../services/orchestrator-engine.js';
import {
  getDemoState, activateDemoMode, deactivateDemoMode, advanceSimulationDay,
  getMeridianPersonaContext,
} from '../services/orchestrator-demo.js';

export async function createOrchestratorRoutes(db: DatabaseAdapter, anthropic: AnthropicSDK | null | undefined): Promise<Router> {
  const router = Router();

  // ── Status ─────────────────────────────────────────────────────────────────
  router.get('/orchestrator/status', requireAuth, async (_req: Request, res: Response) => {
    try {
      const stage = await db.get('SELECT * FROM orchestrator_stage WHERE id = ?', 'default');
      const config = await db.get('SELECT * FROM orchestrator_config WHERE id = ?', 'default');
      const lastHeartbeat = await db.get(
        'SELECT * FROM orchestrator_heartbeats ORDER BY ran_at DESC LIMIT 1'
      );
      const unreadBriefings = (await db.get(
        "SELECT COUNT(*) as c FROM orchestrator_briefings WHERE status = 'unread'"
      ) as { c: number }).c;

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
  router.get('/orchestrator/stage', requireAuth, async (_req: Request, res: Response) => {
    try {
      const stage = await db.get('SELECT * FROM orchestrator_stage WHERE id = ?', 'default');
      res.json({ stage });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Briefings list ────────────────────────────────────────────────────────
  router.get('/orchestrator/briefings', requireAuth, async (req: Request, res: Response) => {
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

      const briefings = await db.all(sql, ...params);
      const total = ((await db.get('SELECT COUNT(*) as c FROM orchestrator_briefings')) as { c: number } | undefined)?.c ?? 0;
      res.json({ briefings, total, limit, offset });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Single briefing with proposals ───────────────────────────────────────
  router.get('/orchestrator/briefings/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const briefing = await db.get('SELECT * FROM orchestrator_briefings WHERE id = ?', req.params.id) as { status: string } | undefined;
      if (!briefing) return res.status(404).json({ error: 'Briefing not found' });

      const proposals = await db.all(
        'SELECT * FROM orchestrator_proposals WHERE briefing_id = ? ORDER BY urgency_score DESC'
      , req.params.id);

      // Mark as read
      if ((briefing as { status: string }).status === 'unread') {
        await db.run("UPDATE orchestrator_briefings SET status = 'read' WHERE id = ?", req.params.id);
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
  router.get('/orchestrator/proposals', requireAuth, async (req: Request, res: Response) => {
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

      const proposals = await db.run(sql, ...params);
      res.json({ proposals });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Rate / feedback on a proposal ────────────────────────────────────────
  router.patch('/orchestrator/proposals/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const { human_rating, human_feedback } = req.body as {
        human_rating?: string;
        human_feedback?: string;
      };

      const validRatings = ['good_catch', 'relevant', 'low_priority', 'irrelevant', 'wrong'];
      if (human_rating && !validRatings.includes(human_rating)) {
        return res.status(400).json({ error: `human_rating must be one of: ${validRatings.join(', ')}` });
      }

      const proposal = await db.get('SELECT * FROM orchestrator_proposals WHERE id = ?', req.params.id) as
        | { human_rating: string | null; status: string } | undefined;
      if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

      await db.run(`
        UPDATE orchestrator_proposals SET
          human_rating = COALESCE(?, human_rating),
          human_feedback = COALESCE(?, human_feedback),
          decided_at = COALESCE(decided_at, NOW()),
          decided_by = COALESCE(decided_by, 'solo')
        WHERE id = ?
      `, human_rating ?? null, human_feedback ?? null, req.params.id);

      // Update stage metrics if this is a new rating
      if (human_rating && !proposal.human_rating) {
        const isPositive = ['good_catch', 'relevant'].includes(human_rating);
        const isNegative = ['irrelevant', 'wrong'].includes(human_rating);
        await db.run(`
          UPDATE orchestrator_stage SET
            proposals_rated = proposals_rated + 1,
            proposals_good_or_relevant = proposals_good_or_relevant + ?,
            proposals_irrelevant_or_wrong = proposals_irrelevant_or_wrong + ?,
            updated_at = NOW()
          WHERE id = 'default'
        `, isPositive ? 1 : 0, isNegative ? 1 : 0);
      }

      const updated = await db.get('SELECT * FROM orchestrator_proposals WHERE id = ?', req.params.id);
      res.json({ proposal: updated });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Knowledge atoms (recent, from all sources) ──────────────────────────
  router.get('/orchestrator/atoms', requireAuth, async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? '30'), 10) || 30, 100);
      const days = Math.min(parseInt(String(req.query.days ?? '14'), 10) || 14, 90);
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const atoms = await db.all(`
        SELECT ka.id, ka.content, ka.atom_type, ka.category, ka.confidence,
               ka.subcategory, ka.sentiment, ka.source_workflow_id,
               ka.source_area_id, ka.source_module_id, ka.created_at,
               wo.workflow_name, wo.step_name
        FROM knowledge_atoms ka
        LEFT JOIN workflow_outputs wo ON wo.id = ka.source_output_id
        WHERE ka.is_active = 1 AND ka.created_at >= ?
        ORDER BY ka.created_at DESC
        LIMIT ?
      `, since, limit);

      res.json({ atoms, total: atoms.length, limit, days });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Heartbeat log ─────────────────────────────────────────────────────────
  router.get('/orchestrator/heartbeats', requireAuth, async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);
      const rows = await db.all(
        'SELECT * FROM orchestrator_heartbeats ORDER BY ran_at DESC LIMIT ?'
      , limit);
      res.json({ heartbeats: rows });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Config ────────────────────────────────────────────────────────────────
  router.get('/orchestrator/config', requireAuth, async (_req: Request, res: Response) => {
    try {
      const config = await db.get('SELECT * FROM orchestrator_config WHERE id = ?', 'default');
      res.json({ config });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.patch('/orchestrator/config', requireAuth, async (req: Request, res: Response) => {
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
      await db.run(`UPDATE orchestrator_config SET ${sets}, updated_at = ? WHERE id = 'default'`, ...vals);

      const config = await db.get('SELECT * FROM orchestrator_config WHERE id = ?', 'default');
      res.json({ config });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Kill switch: pause ────────────────────────────────────────────────────
  router.post('/orchestrator/pause', requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as unknown as { user?: { username?: string } }).user?.username ?? 'solo';
      await db.run(`
        UPDATE orchestrator_config SET
          orchestrator_paused = 1, paused_at = NOW(), paused_by = ?, updated_at = NOW()
        WHERE id = 'default'
      `, user);
      res.json({ ok: true, paused: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Kill switch: resume ───────────────────────────────────────────────────
  router.post('/orchestrator/resume', requireAuth, async (req: Request, res: Response) => {
    try {
      await db.run(`
        UPDATE orchestrator_config SET
          orchestrator_paused = 0, paused_at = NULL, paused_by = NULL, updated_at = NOW()
        WHERE id = 'default'
      `);
      res.json({ ok: true, paused: false });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Kill switch: full disable (admin-only, irreversible until restart) ───
  router.post('/orchestrator/disable', requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as unknown as { user?: { username?: string; role?: string } }).user;
      // Require admin role (or solo mode where role is undefined) for full disable
      if (user && user.role && user.role !== 'admin') {
        return res.status(403).json({ error: 'Full disable requires admin role' });
      }
      const by = user?.username ?? 'solo';
      const { reason } = req.body as { reason?: string };

      await db.run(`
        UPDATE orchestrator_config SET
          orchestrator_paused = 1,
          fully_disabled = 1,
          paused_at = NOW(),
          paused_by = ?,
          updated_at = NOW()
        WHERE id = 'default'
      `, by);

      // Log the disable event
      await db.run(`
        INSERT INTO orchestrator_heartbeats (ran_at, trigger_type, action, signals_evaluated, error_message)
        VALUES (NOW(), 'system', 'fully_disabled', 0, ?)
      `, `Orchestrator fully disabled by ${by}. Reason: ${reason ?? 'Not provided'}`);

      console.warn(`[orchestrator] ⛔ FULLY DISABLED by ${by}. Reason: ${reason ?? 'none'}`);
      res.json({ ok: true, fully_disabled: true, disabled_by: by });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Hard limits (read-only — cannot be overridden) ────────────────────────
  router.get('/orchestrator/limits', requireAuth, async (_req: Request, res: Response) => {
    res.json({ limits: ORCHESTRATOR_HARD_LIMITS });
  });

  // ── Kill switch: reset to Observer ───────────────────────────────────────
  router.post('/orchestrator/reset', requireAuth, async (_req: Request, res: Response) => {
    try {
      const now = new Date().toISOString();
      const existing = await db.get('SELECT stage_history, current_stage, stage_entered_at FROM orchestrator_stage WHERE id = ?', 'default') as
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

      await db.run(`
        UPDATE orchestrator_stage SET
          current_stage = 1, stage_entered_at = ?, stage_history = ?,
          total_briefings = 0, total_proposals = 0, proposals_rated = 0,
          proposals_good_or_relevant = 0, proposals_irrelevant_or_wrong = 0,
          updated_at = ?
        WHERE id = 'default'
      `, now, JSON.stringify(history), now);

      await db.run(`
        UPDATE orchestrator_config SET orchestrator_paused = 0, updated_at = ?
        WHERE id = 'default'
      `, now);

      res.json({ ok: true, stage: 1, reset: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Phase 2: Approve a proposal (creates orchestrator_execution) ────────────
  router.post('/orchestrator/proposals/:id/approve', requireAuth, async (req: Request, res: Response) => {
    try {
      const proposal = await db.get('SELECT * FROM orchestrator_proposals WHERE id = ?', req.params.id) as
        | { id: string; status: string; proposed_action: string; action_type: string; confidence_score: number } | undefined;
      if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

      const stage = await db.get('SELECT current_stage FROM orchestrator_stage WHERE id = ?', 'default') as
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
        await db.run(`
          INSERT INTO workflow_runs (id, workflow_id, trigger_source, status, user_id)
          VALUES (?, ?, 'orchestrator_approval', 'running', ?)
        `, workflowRunId, workflowId, user);
      } catch {
        // workflow_runs table may not exist on older DBs — non-fatal
        console.warn('[orchestrator] workflow_runs insert skipped (table may not exist)');
      }

      const executionId = randomUUID();
      await db.run(`
        INSERT INTO orchestrator_executions
          (id, proposal_id, workflow_run_id, org_id, initiated_by, initiated_at, human_notes)
        VALUES (?, ?, ?, ?, 'human_approved', NOW(), ?)
      `, executionId, proposal.id, workflow_run_id ?? workflowRunId, null, notes ?? null);

      // Update proposal status to approved
      await db.run(`
        UPDATE orchestrator_proposals SET
          status = 'approved', decided_at = NOW(), decided_by = ?
        WHERE id = ?
      `, user, proposal.id);

      // Create reasoning trail for this approval action
      const trailId = await createReasoningTrail(db, 'approval');
      addTrailEntry(db, trailId, {
        entry_type: 'execution_decision',
        title: `Proposal approved by ${user}`,
        content: `Human approval received for proposal.\n\nProposed action: ${proposal.proposed_action}\nAction type: ${proposal.action_type}\nConfidence: ${Math.round(proposal.confidence_score * 100)}%\n${notes ? `\nApprover notes: ${notes}` : ''}`,
        confidence: 1.0,
        metadata: { proposal_id: proposal.id, execution_id: executionId, approved_by: user },
      });
      completeTrail(db, trailId, 'completed', 0, { proposal_id: proposal.id, execution_id: executionId });

      const execution = await db.get('SELECT * FROM orchestrator_executions WHERE id = ?', executionId);
      res.status(201).json({ execution, trailId });
    } catch (err) {
      console.error('[orchestrator] approve error:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Phase 2: Reject a proposal ───────────────────────────────────────────
  router.post('/orchestrator/proposals/:id/reject', requireAuth, async (req: Request, res: Response) => {
    try {
      const proposal = await db.get('SELECT * FROM orchestrator_proposals WHERE id = ?', req.params.id) as
        | { id: string; status: string } | undefined;
      if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

      const user = (req as unknown as { user?: { username?: string } }).user?.username ?? 'solo';
      const { reason } = req.body as { reason?: string };

      await db.run(`
        UPDATE orchestrator_proposals SET
          status = 'rejected', human_rating = 'wrong',
          human_feedback = ?, decided_at = NOW(), decided_by = ?
        WHERE id = ?
      `, reason ?? null, user, proposal.id);

      // Update stage metrics (rejection = negative signal)
      const existing = await db.get('SELECT human_rating FROM orchestrator_proposals WHERE id = ?', proposal.id) as { human_rating: string | null } | undefined;
      if (!existing?.human_rating) {
        await db.run(`
          UPDATE orchestrator_stage SET
            proposals_rated = proposals_rated + 1,
            proposals_irrelevant_or_wrong = proposals_irrelevant_or_wrong + 1,
            updated_at = NOW()
          WHERE id = 'default'
        `);
      }

      // Create reasoning trail for rejection
      const trailId = await createReasoningTrail(db, 'rejection');
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
  router.post('/orchestrator/proposals/:id/modify', requireAuth, async (req: Request, res: Response) => {
    try {
      const proposal = await db.get('SELECT * FROM orchestrator_proposals WHERE id = ?', req.params.id) as
        | { id: string; status: string; proposed_action: string; action_type: string } | undefined;
      if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

      const stage = await db.get('SELECT current_stage FROM orchestrator_stage WHERE id = ?', 'default') as
        | { current_stage: number } | undefined;
      if (!stage || stage.current_stage < 2) {
        return res.status(403).json({ error: 'Proposal modification requires Stage 2 or higher' });
      }

      const user = (req as unknown as { user?: { username?: string } }).user?.username ?? 'solo';
      const { modification_notes, modified_action } = req.body as {
        modification_notes?: string;
        modified_action?: string;
      };

      await db.run(`
        UPDATE orchestrator_proposals SET
          status = 'modified',
          human_feedback = ?,
          proposed_action = COALESCE(?, proposed_action),
          decided_at = NOW(),
          decided_by = ?
        WHERE id = ?
      `, modification_notes ?? null, modified_action ?? null, user, proposal.id);

      // Stage metric
      await db.run(`
        UPDATE orchestrator_stage SET
          plans_modified = plans_modified + 1,
          proposals_rated = proposals_rated + 1,
          proposals_good_or_relevant = proposals_good_or_relevant + 1,
          updated_at = NOW()
        WHERE id = 'default'
      `);

      const trailId = await createReasoningTrail(db, 'approval');
      addTrailEntry(db, trailId, {
        entry_type: 'execution_decision',
        title: `Proposal modified by ${user}`,
        content: `Human modified proposal scope before approval.\n${modification_notes ? `Notes: ${modification_notes}` : ''}\n${modified_action ? `New action: ${modified_action}` : ''}`,
        confidence: 1.0,
        metadata: { proposal_id: proposal.id, modified_by: user },
      });
      completeTrail(db, trailId, 'completed', 0, { proposal_id: proposal.id });

      const updated = await db.get('SELECT * FROM orchestrator_proposals WHERE id = ?', proposal.id);

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
  router.get('/orchestrator/executions', requireAuth, async (req: Request, res: Response) => {
    try {
      // Guard: table may not exist on older DBs
      const tableExists = (await db.get(
        "SELECT COUNT(*) as c FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = 'orchestrator_executions'"
      ) as { c: number }).c > 0;
      if (!tableExists) return res.json({ executions: [], total: 0 });

      const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100);
      const offset = parseInt(String(req.query.offset ?? '0'), 10) || 0;

      const executions = await db.all(`
        SELECT e.*, p.proposed_action, p.action_type, p.signal_source
        FROM orchestrator_executions e
        LEFT JOIN orchestrator_proposals p ON p.id = e.proposal_id
        ORDER BY e.initiated_at DESC
        LIMIT ? OFFSET ?
      `, limit, offset);

      const total = ((await db.get('SELECT COUNT(*) as c FROM orchestrator_executions')) as { c: number } | undefined)?.c ?? 0;
      res.json({ executions, total, limit, offset });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Single execution detail ──────────────────────────────────────────────
  router.get('/orchestrator/executions/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const execution = await db.get('SELECT * FROM orchestrator_executions WHERE id = ?', req.params.id);
      if (!execution) return res.status(404).json({ error: 'Execution not found' });
      res.json({ execution });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Record execution outcome ─────────────────────────────────────────────
  router.patch('/orchestrator/executions/:id/outcome', requireAuth, async (req: Request, res: Response) => {
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

      await db.run(`
        UPDATE orchestrator_executions SET
          outcome = COALESCE(?, outcome),
          quality_assessment = COALESCE(?, quality_assessment),
          human_satisfaction = COALESCE(?, human_satisfaction),
          human_notes = COALESCE(?, human_notes),
          completed_at = CASE WHEN ? IS NOT NULL THEN NOW() ELSE completed_at END
        WHERE id = ?
      `, 
        outcome ?? null,
        quality_assessment ? JSON.stringify(quality_assessment) : null,
        human_satisfaction ?? null,
        human_notes ?? null,
        outcome ?? null,
        req.params.id
      );

      const updated = await db.get('SELECT * FROM orchestrator_executions WHERE id = ?', req.params.id);
      res.json({ execution: updated });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Reasoning trails list ────────────────────────────────────────────────
  router.get('/orchestrator/trails', requireAuth, async (req: Request, res: Response) => {
    try {
      const tableExists = (await db.get(
        "SELECT COUNT(*) as c FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = 'orchestrator_reasoning_trails'"
      ) as { c: number }).c > 0;
      if (!tableExists) return res.json({ trails: [], total: 0 });

      const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100);
      const offset = parseInt(String(req.query.offset ?? '0'), 10) || 0;

      const trails = await db.all(`
        SELECT id, trigger_type, transparency_level, status,
               narrative_summary, total_entries, duration_ms,
               heartbeat_id, briefing_id, proposal_id, execution_id,
               created_at, completed_at
        FROM orchestrator_reasoning_trails
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `, limit, offset);

      const total = ((await db.get('SELECT COUNT(*) as c FROM orchestrator_reasoning_trails')) as { c: number } | undefined)?.c ?? 0;
      res.json({ trails, total, limit, offset });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Single trail with entries ────────────────────────────────────────────
  router.get('/orchestrator/trails/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const trail = await db.get('SELECT * FROM orchestrator_reasoning_trails WHERE id = ?', req.params.id);
      if (!trail) return res.status(404).json({ error: 'Trail not found' });

      const limit = Math.min(parseInt(String((req as Request & { query: Record<string, string> }).query.limit ?? '100'), 10) || 100, 200);
      const offset = parseInt(String((req as Request & { query: Record<string, string> }).query.offset ?? '0'), 10) || 0;
      const entries = await db.all(`
        SELECT * FROM orchestrator_reasoning_entries
        WHERE trail_id = ?
        ORDER BY sequence_number ASC
        LIMIT ? OFFSET ?
      `, req.params.id, limit, offset);
      const totalEntries = (await db.get(
        'SELECT COUNT(*) as c FROM orchestrator_reasoning_entries WHERE trail_id = ?'
      , req.params.id) as { c: number }).c;

      res.json({ trail, entries, total_entries: totalEntries, limit, offset });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Management report ─────────────────────────────────────────────────────
  router.get('/orchestrator/report', requireAuth, async (req: Request, res: Response) => {
    if (!anthropic) return res.status(503).json({ error: 'Anthropic API not configured' });
    try {
      const period = (req.query.period as string) === 'month' ? 'month' : 'week';
      const report = await generateManagementReport(db, anthropic, period);
      res.json({ report, period, generated_at: new Date().toISOString() });
    } catch (err) {
      console.error('[orchestrator] report error:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Stage demotion check ───────────────────────────────────────────────────
  router.post('/orchestrator/demotion-check', requireAuth, async (_req: Request, res: Response) => {
    try {
      const result = checkStageDemotion(db);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Stage demotion history ────────────────────────────────────────────────
  router.get('/orchestrator/demotions', requireAuth, async (_req: Request, res: Response) => {
    try {
      const tableExists = (await db.get(
        "SELECT COUNT(*) as c FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = 'orchestrator_stage_demotions'"
      ) as { c: number }).c > 0;
      if (!tableExists) return res.json({ demotions: [] });
      const demotions = await db.all('SELECT * FROM orchestrator_stage_demotions ORDER BY demoted_at DESC LIMIT 20');
      res.json({ demotions });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Patterns: list ───────────────────────────────────────────────────────
  router.get('/orchestrator/patterns', requireAuth, async (_req: Request, res: Response) => {
    try {
      const tableExists = (await db.get(
        "SELECT COUNT(*) as c FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = 'orchestrator_patterns'"
      ) as { c: number }).c > 0;
      if (!tableExists) return res.json({ patterns: [], detections: [] });

      const patterns = await db.all('SELECT * FROM orchestrator_patterns ORDER BY created_at DESC LIMIT 50');

      const detections = await db.all(
        "SELECT * FROM orchestrator_pattern_detections ORDER BY detected_at DESC LIMIT 50"
      );
      res.json({ patterns, detections });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Patterns: toggle auto-execute ────────────────────────────────────────
  router.patch('/orchestrator/patterns/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const { auto_execute } = req.body as { auto_execute?: boolean };

      const stage = await db.get('SELECT current_stage FROM orchestrator_stage WHERE id = ?', 'default') as
        | { current_stage: number } | undefined;

      // Auto-execute requires Stage 3+
      if (auto_execute && (!stage || stage.current_stage < 3)) {
        return res.status(403).json({ error: 'Auto-execution requires Stage 3 (Supervised Orchestrator) or higher' });
      }

      await db.run(`
        UPDATE orchestrator_patterns SET
          auto_execute = ?,
          updated_at = NOW()
        WHERE id = ?
      `, auto_execute ? 1 : 0, req.params.id);

      const updated = await db.get('SELECT * FROM orchestrator_patterns WHERE id = ?', req.params.id);

      if (!updated) return res.status(404).json({ error: 'Pattern not found' });
      res.json({ pattern: updated });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Patterns: run detection now ───────────────────────────────────────────
  router.post('/orchestrator/patterns/detect', requireAuth, async (_req: Request, res: Response) => {
    try {
      const { detectPatterns, recordPatternDetection } = await import('../services/orchestrator-pattern-engine.js');
      const patterns = await detectPatterns(db);
      const recorded: string[] = [];
      for (const p of patterns.slice(0, 5)) {
        const pid = await recordPatternDetection(db, p, null);
        if (pid) recorded.push(pid);
      }
      res.json({ patterns_detected: patterns.length, patterns_recorded: recorded.length, patterns });
    } catch (err) {
      console.error('[orchestrator] pattern detect error:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Demo Mode: get state ─────────────────────────────────────────────────
  router.get('/orchestrator/demo', requireAuth, async (_req: Request, res: Response) => {
    try {
      const state = await getDemoState(db);
      res.json({ demo: state, persona_context: state.mode !== 'off' ? getMeridianPersonaContext() : null });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Demo Mode: activate ──────────────────────────────────────────────────
  router.post('/orchestrator/demo/activate', requireAuth, async (req: Request, res: Response) => {
    try {
      const { mode } = req.body as { mode?: 'demo' | 'simulation' | 'accelerated' };
      const validModes = ['demo', 'simulation', 'accelerated'];
      if (mode && !validModes.includes(mode)) {
        return res.status(400).json({ error: `mode must be one of: ${validModes.join(', ')}` });
      }
      const result = activateDemoMode(db, mode ?? 'demo');
      res.json({ ok: true, ...result, mode: mode ?? 'demo' });
    } catch (err) {
      console.error('[orchestrator] demo activate error:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Demo Mode: deactivate ────────────────────────────────────────────────
  router.post('/orchestrator/demo/deactivate', requireAuth, async (_req: Request, res: Response) => {
    try {
      const result = deactivateDemoMode(db);
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Demo Mode: advance simulation day (Accelerated Mode) ─────────────────
  router.post('/orchestrator/demo/advance', requireAuth, async (_req: Request, res: Response) => {
    try {
      const { day, done } = await advanceSimulationDay(db);
      if (!done && anthropic) {
        // Trigger a heartbeat cycle for the new day's signals
        runHeartbeatCycle(db, anthropic, 'on_demand', false).catch(() => {});
      }
      res.json({ ok: true, day, done });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Stage: manual progression check ─────────────────────────────────────
  router.post('/orchestrator/check-progression', requireAuth, async (_req: Request, res: Response) => {
    try {
      const { checkStageDemotion, checkStageProgression } = require('../services/orchestrator-engine.js');
      const demotion = checkStageDemotion(db);
      if (demotion.demoted) {
        return res.json({ action: 'demoted', ...demotion });
      }
      const progression = checkStageProgression(db);
      if (progression.advanced) {
        return res.json({ action: 'advanced', ...progression });
      }
      // Return current stage + criteria status for UI
      const stage = await db.get('SELECT * FROM orchestrator_stage WHERE id = ?', 'default') as Record<string, unknown> | undefined;
      res.json({ action: 'no_change', stage });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
