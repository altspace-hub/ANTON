import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { createMarketWhyChainsService } from '../services/market-why-chains-service.js';

export async function createMarketWhyChainsRoutes(db: DatabaseAdapter) {
  const router = Router();
  const whyChainsService = await createMarketWhyChainsService(db);

  // ── Pattern detection (MUST be before /:id) ────────────────────────────

  router.get('/markets/why-chains/patterns', async (_req, res) => {
    try {
      const patterns = await whyChainsService.getPatterns();
      res.json(patterns);
    } catch (err) {
      console.error('[market-why] Patterns error:', err);
      res.status(500).json({ error: 'Failed to get patterns' });
    }
  });

  // ── Aggregate statistics (MUST be before /:id) ─────────────────────────

  router.get('/markets/why-chains/stats', async (_req, res) => {
    try {
      const stats = await whyChainsService.getStats();
      res.json(stats);
    } catch (err) {
      console.error('[market-why] Stats error:', err);
      res.status(500).json({ error: 'Failed to get stats' });
    }
  });

  // ── List chains ────────────────────────────────────────────────────────

  router.get('/markets/why-chains', async (req, res) => {
    try {
      const chains = await whyChainsService.listChains({
        direction: req.query.direction as string | undefined,
        status: req.query.status as string | undefined,
        systemicImpact: req.query.systemicImpact as string | undefined,
        query: req.query.q as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
      });
      res.json(chains);
    } catch (err) {
      console.error('[market-why] List error:', err);
      res.status(500).json({ error: 'Failed to list chains' });
    }
  });

  // ── Get chain with levels ──────────────────────────────────────────────

  router.get('/markets/why-chains/:id', async (req, res) => {
    try {
      const chain = await whyChainsService.getChain(req.params.id);
      if (!chain) return res.status(404).json({ error: 'Chain not found' });
      res.json(chain);
    } catch (err) {
      console.error('[market-why] Get error:', err);
      res.status(500).json({ error: 'Failed to get chain' });
    }
  });

  // ── Create chain ───────────────────────────────────────────────────────

  router.post('/markets/why-chains', async (req, res) => {
    try {
      const { title, investigationId, predictionId, direction } = req.body;
      if (!title) return res.status(400).json({ error: 'title is required' });
      const id = await whyChainsService.createChain({ title, investigationId, predictionId, direction });
      res.status(201).json({ id });
    } catch (err) {
      console.error('[market-why] Create error:', err);
      res.status(500).json({ error: 'Failed to create chain' });
    }
  });

  // ── Add level to chain ─────────────────────────────────────────────────

  router.post('/markets/why-chains/:id/levels', async (req, res) => {
    try {
      const { question, answer, evidenceAtoms, atomCreated, levelType, researchPerformed, atomsCreatedAtLevel } = req.body;
      if (!question || !answer) return res.status(400).json({ error: 'question and answer required' });

      const result = await whyChainsService.addLevel(req.params.id, {
        question, answer, evidenceAtoms, atomCreated, levelType, researchPerformed, atomsCreatedAtLevel,
      });

      if (!result) return res.status(404).json({ error: 'Chain not found' });
      if ('error' in result) return res.status(400).json({ error: result.error });

      res.status(201).json({ levelNumber: result.levelNumber });
    } catch (err) {
      console.error('[market-why] Add level error:', err);
      res.status(500).json({ error: 'Failed to add level' });
    }
  });

  // ── Complete chain with root cause ─────────────────────────────────────

  router.post('/markets/why-chains/:id/complete', async (req, res) => {
    try {
      const {
        rootCauseType, rootCauseDescription, impactAssessment,
        rootCauseSummary, systemicImpact,
        atomsCreated, correlationsUpdated, signalWeightsUpdated,
        blindSpotsIdentified, processImprovements, investigationTasksSpawned,
        thesesAffected, indexesAffected,
      } = req.body;

      await whyChainsService.completeChain(req.params.id, {
        rootCauseType, rootCauseDescription, impactAssessment,
        rootCauseSummary, systemicImpact,
        atomsCreated, correlationsUpdated, signalWeightsUpdated,
        blindSpotsIdentified, processImprovements, investigationTasksSpawned,
        thesesAffected, indexesAffected,
      });

      res.json({ ok: true });
    } catch (err) {
      console.error('[market-why] Complete error:', err);
      res.status(500).json({ error: 'Failed to complete chain' });
    }
  });

  return router;
}
