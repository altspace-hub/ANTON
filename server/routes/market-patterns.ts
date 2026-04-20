import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { createMarketPatternService } from '../services/market-pattern-service.js';
import { createMarketPatternWeightFeedbackService } from '../services/market-pattern-weight-feedback-service.js';

export async function createMarketPatternsRoutes(db: DatabaseAdapter) {
  const router = Router();
  const patternService = await createMarketPatternService(db);
  const feedbackService = await createMarketPatternWeightFeedbackService(db);

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

  // Pattern → signal-weight feedback (M1).
  // POST to manually flush the pending queue (also runs daily at 03:00 CET).
  router.post('/markets/patterns/apply-feedback', async (req, res) => {
    try {
      const batchLimit = req.body?.batchLimit ? parseInt(String(req.body.batchLimit), 10) : undefined;
      const result = await feedbackService.applyPatternFeedback({ batchLimit });
      res.json(result);
    } catch (err) {
      console.error('[market-patterns] Apply feedback error:', err);
      res.status(500).json({ error: 'Failed to apply pattern feedback' });
    }
  });

  // GET the most recent weight adjustments — read-only audit of what the
  // feedback service actually did. Useful for verifying the closed loop
  // without having to query Postgres by hand.
  router.get('/markets/patterns/weight-adjustments', async (req, res) => {
    try {
      const limit = req.query.limit ? Math.min(500, parseInt(String(req.query.limit), 10)) : 100;
      const rows = await db.all<{
        id: number; pattern_id: string; pattern_type: string;
        signal_type: string; category: string;
        multiplier: number | string; weight_before: number | string; weight_after: number | string;
        rationale: string; applied_at: string;
      }>(
        `SELECT id, pattern_id, pattern_type, signal_type, category,
                multiplier, weight_before, weight_after, rationale, applied_at
         FROM market_signal_weight_adjustments
         ORDER BY applied_at DESC LIMIT ?`,
        limit,
      );
      res.json(rows.map(r => ({
        ...r,
        multiplier: Number(r.multiplier),
        weight_before: Number(r.weight_before),
        weight_after: Number(r.weight_after),
      })));
    } catch (err) {
      console.error('[market-patterns] List adjustments error:', err);
      res.status(500).json({ error: 'Failed to list weight adjustments' });
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
