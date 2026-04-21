import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { createMarketIntelligenceService } from '../services/market-intelligence-service.js';
import { createMarketPredictionAttributionService } from '../services/market-prediction-attribution-service.js';

export async function createMarketLearningRoutes(db: DatabaseAdapter) {
  const router = Router();
  const service = await createMarketIntelligenceService(db);
  const attribution = await createMarketPredictionAttributionService(db);

  // Calibration
  router.get('/markets/learning/calibration', async (_req, res) => {
    try { res.json(await service.getCalibrationHistory()); }
    catch (err) { console.error('[market-learning] Calibration error:', err); res.status(500).json({ error: 'Failed' }); }
  });

  router.post('/markets/learning/calibration/run', async (_req, res) => {
    try { res.json(await service.runCalibrationCheck()); }
    catch (err) { console.error('[market-learning] Run calibration error:', err); res.status(500).json({ error: 'Failed' }); }
  });

  // Narratives
  router.get('/markets/learning/narratives', async (req, res) => {
    try { res.json(await service.listNarratives(req.query.lifecycle as string | undefined)); }
    catch (err) { console.error('[market-learning] Narratives error:', err); res.status(500).json({ error: 'Failed' }); }
  });

  router.post('/markets/learning/narratives', async (req, res) => {
    try {
      const { title, description, narrativeType, strength, beneficiaryEntities, counterNarrative, supportingAtoms } = req.body;
      if (!title || !description) return res.status(400).json({ error: 'title and description required' });
      const id = await service.createNarrative({ title, description, narrativeType, strength, beneficiaryEntities, counterNarrative, supportingAtoms });
      res.status(201).json({ id });
    } catch (err) { console.error('[market-learning] Create narrative error:', err); res.status(500).json({ error: 'Failed' }); }
  });

  router.put('/markets/learning/narratives/:id/lifecycle', async (req, res) => {
    try {
      const { lifecycle, momentum } = req.body;
      await service.updateNarrativeLifecycle(req.params.id, lifecycle, momentum);
      res.json({ ok: true });
    } catch (err) { console.error('[market-learning] Update narrative error:', err); res.status(500).json({ error: 'Failed' }); }
  });

  // Meta-learning
  router.get('/markets/learning/events', async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      res.json(await service.getLearningEvents(limit));
    } catch (err) { console.error('[market-learning] Events error:', err); res.status(500).json({ error: 'Failed' }); }
  });

  router.get('/markets/learning/stats', async (_req, res) => {
    try { res.json(await service.getLearningStats()); }
    catch (err) { console.error('[market-learning] Stats error:', err); res.status(500).json({ error: 'Failed' }); }
  });

  // Consul performance
  router.get('/markets/learning/consul-performance', async (_req, res) => {
    try { res.json(await service.getConsulPerformance()); }
    catch (err) { console.error('[market-learning] Consul error:', err); res.status(500).json({ error: 'Failed' }); }
  });

  // Backtests
  router.get('/markets/learning/backtests', async (_req, res) => {
    try { res.json(await service.listBacktests()); }
    catch (err) { console.error('[market-learning] Backtests error:', err); res.status(500).json({ error: 'Failed' }); }
  });

  router.post('/markets/learning/backtests', async (req, res) => {
    try {
      const { name, description, strategyConfig, startDate, endDate } = req.body;
      if (!name || !startDate || !endDate) return res.status(400).json({ error: 'name, startDate, endDate required' });
      const id = await service.createBacktest({ name, description, strategyConfig: strategyConfig ?? {}, startDate, endDate });
      res.status(201).json({ id });
    } catch (err) { console.error('[market-learning] Create backtest error:', err); res.status(500).json({ error: 'Failed' }); }
  });

  // ── Prediction attribution (M2) ──────────────────────────────────────────

  // Manual trigger for the PnL compute pass. Daily cron runs at 04:00 CET.
  router.post('/markets/learning/attribution/compute', async (req, res) => {
    try {
      const batchLimit = req.body?.batchLimit ? parseInt(String(req.body.batchLimit), 10) : undefined;
      res.json(await attribution.computeMaturedAttributionPnL({ batchLimit }));
    } catch (err) {
      console.error('[market-learning] Attribution compute error:', err);
      res.status(500).json({ error: 'Failed to compute attribution PnL' });
    }
  });

  // Recent attribution rows for inspection. Defaults to 100, cap 500.
  router.get('/markets/learning/attribution', async (req, res) => {
    try {
      const limit = req.query.limit ? Math.min(500, parseInt(String(req.query.limit), 10)) : 100;
      const predictionId = typeof req.query.prediction_id === 'string' ? req.query.prediction_id : null;
      const where = predictionId ? 'WHERE a.prediction_id = ?' : '';
      const params: unknown[] = predictionId ? [predictionId, limit] : [limit];
      const rows = await db.all<{
        id: number; prediction_id: string; rebalance_id: string;
        signal_score: number | string; weight_change: number | string;
        subsequent_return: number | string | null; attribution_pnl: number | string | null;
        computed_at: string | null; created_at: string;
        target_symbol: string | null; predicted_direction: string | null;
      }>(
        `SELECT a.id, a.prediction_id, a.rebalance_id, a.signal_score, a.weight_change,
                a.subsequent_return, a.attribution_pnl, a.computed_at, a.created_at,
                p.target_symbol, p.predicted_direction
         FROM market_prediction_attribution a
         JOIN market_predictions p ON p.id = a.prediction_id
         ${where}
         ORDER BY a.created_at DESC
         LIMIT ?`,
        ...params,
      );
      res.json(rows.map(r => ({
        ...r,
        signal_score: Number(r.signal_score),
        weight_change: Number(r.weight_change),
        subsequent_return: r.subsequent_return == null ? null : Number(r.subsequent_return),
        attribution_pnl: r.attribution_pnl == null ? null : Number(r.attribution_pnl),
      })));
    } catch (err) {
      console.error('[market-learning] Attribution list error:', err);
      res.status(500).json({ error: 'Failed to list attribution rows' });
    }
  });

  // ── Auto-verify expired predictions ──────────────────────────────────────

  router.post('/markets/predictions/auto-verify', async (_req, res) => {
    try {
      const { createPredictionVerifier } = await import('../services/market-prediction-verifier.js');
      const verifier = await createPredictionVerifier(db);
      const result = await verifier.runAutoVerification();
      res.json(result);
    } catch (err) {
      console.error('[market-learning] Auto-verify error:', err instanceof Error ? err.message : err, err instanceof Error ? err.stack : '');
      res.status(500).json({ error: err instanceof Error ? err.message : 'Verification failed' });
    }
  });

  return router;
}
