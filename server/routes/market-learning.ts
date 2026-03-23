import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { createMarketIntelligenceService } from '../services/market-intelligence-service.js';

export async function createMarketLearningRoutes(db: DatabaseAdapter) {
  const router = Router();
  const service = await createMarketIntelligenceService(db);

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
