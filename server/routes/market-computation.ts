import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { createMarketComputationService } from '../services/market-computation-service.js';
import { safeError } from '../lib/error-response.js';

export async function createMarketComputationRoutes(db: DatabaseAdapter) {
  const router = Router();
  const computeService = await createMarketComputationService(db);

  // ── List available templates ───────────────────────────────────────────

  router.get('/markets/compute/templates', async (_req, res) => {
    try {
      const templates = computeService.listTemplates();
      res.json(templates);
    } catch (err) {
      console.error('[market-compute] List templates error:', err);
      res.status(500).json({ error: 'Failed to list templates' });
    }
  });

  // ── Run a computation template ─────────────────────────────────────────

  router.post('/markets/compute/run', async (req, res) => {
    try {
      const { templateName, inputParams, triggeredBy } = req.body;
      if (!templateName) return res.status(400).json({ error: 'templateName is required' });
      if (!inputParams || typeof inputParams !== 'object') {
        return res.status(400).json({ error: 'inputParams object is required' });
      }

      const result = await computeService.runTemplate(templateName, inputParams, triggeredBy);
      res.json(result);
    } catch (err) {
      console.error('[market-compute] Run template error:', err);
      const message = safeError(err);
      res.status(500).json({ error: message });
    }
  });

  // ── Get computation log entry ──────────────────────────────────────────

  router.get('/markets/compute/logs/:id', async (req, res) => {
    try {
      const log = await computeService.getLog(req.params.id);
      if (!log) return res.status(404).json({ error: 'Log entry not found' });
      res.json(log);
    } catch (err) {
      console.error('[market-compute] Get log error:', err);
      res.status(500).json({ error: 'Failed to get log entry' });
    }
  });

  // ── Convert computation log to market atoms ──────────────────────────

  router.post('/markets/compute/logs/:id/to-atoms', async (req, res) => {
    try {
      const atomIds = await computeService.computationToAtoms(req.params.id);
      res.json({ atomIds, count: atomIds.length });
    } catch (err) {
      console.error('[market-computation] To-atoms error:', err);
      res.status(500).json({ error: 'Failed to convert computation to atoms' });
    }
  });

  // ── List recent computation logs ───────────────────────────────────────

  router.get('/markets/compute/logs', async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const logs = await computeService.getRecentLogs(limit);
      res.json(logs);
    } catch (err) {
      console.error('[market-compute] List logs error:', err);
      res.status(500).json({ error: 'Failed to list logs' });
    }
  });

  return router;
}
