/**
 * routes/orchestrator-gate.ts — REST surface for the four-phase trust progression UI.
 *
 * GET  /orchestrator-gate/status          → all eligibility checks (current + targets)
 * POST /orchestrator-gate/apply           → resolve { decision, reason } for an action
 * POST /orchestrator-gate/demote          → trigger a demotion on incident
 *
 * Shipped per ANTON_Improvement_and_Investigation_Brief.md §C.1.
 */

import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import {
  applyOrchestratorAction,
  demoteOnIncident,
  getAllEligibility,
} from '../services/orchestrator-gate.js';
import { ACTION_RISK_REGISTRY } from '../services/action-risk-registry.js';
import { safeError } from '../lib/error-response.js';

export function createOrchestratorGateRoutes(db: DatabaseAdapter): Router {
  const router = Router();

  router.get('/status', async (_req, res) => {
    try {
      const eligibility = await getAllEligibility(db);
      res.json({ ...eligibility, actionRegistry: ACTION_RISK_REGISTRY });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/apply', async (req, res) => {
    try {
      const actionId = String(req.body?.actionId ?? '');
      if (!actionId) {
        res.status(400).json({ error: 'actionId required' });
        return;
      }
      const result = await applyOrchestratorAction(db, actionId);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/demote', async (req, res) => {
    try {
      const reason = String(req.body?.reason ?? '').trim();
      if (!reason) {
        res.status(400).json({ error: 'reason required' });
        return;
      }
      const result = await demoteOnIncident(db, reason);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
