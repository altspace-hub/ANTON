// ── ANTON Studio — Core-Team Panel routes (Studio P2) ──────────────────────
//
//   POST /api/core-team/:projectId/panel  { gate, artifact, mode }
//        Runs the single-model 7-expert panel, persists 7 coding_reviews rows +
//        1 coding_panel_decisions record, returns the CODE-COMPUTED PanelVerdict
//        (panel_verdict / blocking are computed in core-team-panel.ts, never by
//        the LLM). Supports `?stream=1` (or Accept: text/event-stream) for SSE
//        using the same event names the AI-Council deliberation stream emits
//        (model_start / model_complete / deliberation_complete / [DONE]) so the
//        existing council-style UI renders without new event plumbing.
//
//   GET  /api/core-team/:projectId/panel/:gate
//        The persisted decision record + the live blocked status for that gate
//        (the phase-advancement guard's view).
//
// Ownership: a coding_project belongs to a `projects` row (coding_projects
// .project_id). Admins see everything; everyone else only their own projects
// (projects.user_id). No LLM call is made in the GET path.

import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseAdapter } from '../db/database.js';
import { safeError } from '../lib/error-response.js';
import {
  runCoreTeamPanel,
  persistPanelDecision,
  getGateStatus,
  isPanelGate,
  isPanelMode,
  CORE_TEAM_ROLES,
  GATE_MANDATORY_ROLES,
  type RunPanelOptions,
  type RunPanelResult,
  type PanelMode,
} from '../services/core-team-panel.js';

interface AuthedRequest {
  user?: { id: string; role?: string };
}

export interface CoreTeamRouteDeps {
  /** Test seam — replaces the live panel run (so no live LLM in tests). */
  runPanel?: (db: DatabaseAdapter, opts: RunPanelOptions) => Promise<RunPanelResult>;
}

interface ProjectAccessRow {
  id: string;
  owner_user_id: string | null;
}

/**
 * Resolve a coding project the caller is allowed to touch. Admins bypass the
 * ownership clause. Returns null (and writes the response) on 401/404.
 */
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
    `SELECT cp.id AS id, p.user_id AS owner_user_id
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

export function createCoreTeamRoutes(db: DatabaseAdapter, deps: CoreTeamRouteDeps = {}): Router {
  const router = Router();
  const runPanel = deps.runPanel ?? runCoreTeamPanel;

  // ── POST /core-team/:projectId/panel ───────────────────────────────────
  router.post('/core-team/:projectId/panel', async (req, res) => {
    const params = z.object({ projectId: z.string().min(1) }).safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: 'projectId is required' }); return; }
    const projectId = params.data.projectId;

    const body = z.object({
      gate: z.string(),
      artifact: z.string().min(1).max(400_000),
      mode: z.string().optional(),
      expertModel: z.string().max(200).optional(),
    }).safeParse(req.body ?? {});
    if (!body.success) { res.status(400).json({ error: 'gate, artifact are required' }); return; }
    if (!isPanelGate(body.data.gate)) {
      res.status(400).json({ error: 'gate must be one of start|build|testing|finish' });
      return;
    }
    const mode: PanelMode = isPanelMode(body.data.mode) ? body.data.mode : 'fast';
    const wantsStream =
      req.query.stream === '1' ||
      String(req.headers.accept ?? '').includes('text/event-stream');

    let project: ProjectAccessRow | null;
    try {
      project = await loadOwnedCodingProject(db, req as AuthedRequest, projectId, res);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
      return;
    }
    if (!project) return;

    const runOpts: RunPanelOptions = {
      projectId,
      gate: body.data.gate,
      artifact: body.data.artifact,
      mode,
      expertModelOverride: body.data.expertModel ?? null,
    };

    if (!wantsStream) {
      // ── Plain JSON path ──────────────────────────────────────────────
      try {
        const result = await runPanel(db, runOpts);
        const decision = await persistPanelDecision(db, result, projectId);
        res.json({
          success: true,
          gate: decision.gate,
          mode: decision.mode,
          panel_verdict: decision.panel_verdict,
          blocking: decision.blocking,
          model: decision.model,
          chair_model: decision.chair_model,
          verdict: decision.verdict,
          dissentLedger: result.dissentLedger,
        });
      } catch (err) {
        res.status(502).json({ error: safeError(err) });
      }
      return;
    }

    // ── SSE path (council event names) ──────────────────────────────────
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (event: object) => res.write(`data: ${JSON.stringify(event)}\n\n`);

    try {
      send({
        type: 'deliberation_start',
        gate: body.data.gate,
        mode,
        panelists: CORE_TEAM_ROLES.map((r) => ({
          role: r.label,
          mandatory: GATE_MANDATORY_ROLES[body.data.gate as import('../services/core-team-panel.js').PanelGate].includes(r.id),
        })),
      });

      const result = await runPanel(db, runOpts);

      // Emit one council-style model_complete per expert so the existing UI
      // renders the seven voices as they land in the parsed verdict.
      for (const e of result.verdict.experts) {
        send({
          type: 'model_complete',
          model: result.expertModel,
          role: e.roleLabel,
          description: e.verdict,
          responsePreview: (e.rationale ?? e.required_change ?? '').slice(0, 300),
        });
      }

      const decision = await persistPanelDecision(db, result, projectId);

      send({
        type: 'deliberation_complete',
        gate: decision.gate,
        mode: decision.mode,
        panel_verdict: decision.panel_verdict,
        blocking: decision.blocking,
        model: decision.model,
        chair_model: decision.chair_model,
        verdict: decision.verdict,
        dissentLedger: result.dissentLedger,
      });
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err) {
      const message = safeError(err);
      if (!res.headersSent) {
        res.status(502).json({ error: message });
      } else {
        send({ type: 'error', message });
        res.write('data: [DONE]\n\n');
        res.end();
      }
    }
  });

  // ── GET /core-team/:projectId/panel/:gate ───────────────────────────────
  router.get('/core-team/:projectId/panel/:gate', async (req, res) => {
    try {
      const params = z.object({
        projectId: z.string().min(1),
        gate: z.string(),
      }).safeParse(req.params);
      if (!params.success || !isPanelGate(params.data.gate)) {
        res.status(400).json({ error: 'projectId and a valid gate (start|build|testing|finish) are required' });
        return;
      }

      const project = await loadOwnedCodingProject(db, req as AuthedRequest, params.data.projectId, res);
      if (!project) return;

      const status = await getGateStatus(db, params.data.projectId, params.data.gate);

      // Load the full decision record (verdict_json) when one exists.
      let verdict: unknown = null;
      let mode: string | null = null;
      let model: string | null = null;
      let chairModel: string | null = null;
      if (status.decided) {
        const row = await db.get<{
          verdict_json: unknown; mode: string; model: string | null; chair_model: string | null;
        }>(
          `SELECT verdict_json, mode, model, chair_model
             FROM coding_panel_decisions
            WHERE coding_project_id = ? AND gate = ?`,
          params.data.projectId,
          params.data.gate,
        );
        if (row) {
          verdict = typeof row.verdict_json === 'string' ? JSON.parse(row.verdict_json) : row.verdict_json;
          mode = row.mode;
          model = row.model;
          chairModel = row.chair_model;
        }
      }

      res.json({
        success: true,
        gate: status.gate,
        decided: status.decided,
        blocked: status.blocking,
        panel_verdict: status.panel_verdict,
        mode,
        model,
        chair_model: chairModel,
        extracted_at: status.extracted_at,
        verdict,
      });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
