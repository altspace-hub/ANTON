import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { createMarketPatternService } from '../services/market-pattern-service.js';

export async function createMarketPatternsRoutes(db: DatabaseAdapter) {
  const router = Router();
  const patternService = await createMarketPatternService(db);

  router.get('/markets/patterns', async (req, res) => {
    try {
      const patterns = await patternService.listPatterns({
        patternType: req.query.type as string | undefined,
        status: req.query.status as string | undefined,
        severity: req.query.severity as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
      });
      res.json(patterns);
    } catch (err) {
      console.error('[market-patterns] List error:', err);
      res.status(500).json({ error: 'Failed to list patterns' });
    }
  });

  router.post('/markets/patterns/detect', async (_req, res) => {
    try {
      const result = await patternService.runAllDetectors();
      res.json(result);
    } catch (err) {
      console.error('[market-patterns] Detect error:', err);
      res.status(500).json({ error: 'Failed to run pattern detection' });
    }
  });

  router.put('/markets/patterns/:id/status', async (req, res) => {
    try {
      const { status } = req.body;
      if (!status) return res.status(400).json({ error: 'status is required' });
      await patternService.updatePatternStatus(req.params.id, status);
      res.json({ ok: true });
    } catch (err) {
      console.error('[market-patterns] Update status error:', err);
      res.status(500).json({ error: 'Failed to update pattern status' });
    }
  });

  // Regime
  router.get('/markets/regime', async (_req, res) => {
    try {
      const regime = await patternService.getCurrentRegime();
      res.json(regime ?? { regime_type: 'unknown', confidence: 0 });
    } catch (err) {
      console.error('[market-patterns] Get regime error:', err);
      res.status(500).json({ error: 'Failed to get regime' });
    }
  });

  router.post('/markets/regime', async (req, res) => {
    try {
      const { regimeType, confidence, evidence, impactDescription } = req.body;
      if (!regimeType) return res.status(400).json({ error: 'regimeType is required' });
      const id = await patternService.recordRegimeChange({ regimeType, confidence, evidence, impactDescription });
      res.status(201).json({ id });
    } catch (err) {
      console.error('[market-patterns] Record regime error:', err);
      res.status(500).json({ error: 'Failed to record regime change' });
    }
  });

  return router;
}
