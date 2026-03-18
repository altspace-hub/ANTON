import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseAdapter } from '../db/database.js';
import { createMarketIndexService } from '../services/market-index-service.js';
import { createMarketIndexRebalanceService } from '../services/market-index-rebalance-service.js';
import { createMarketIndexAttributionService } from '../services/market-index-attribution-service.js';
import { createMarketNavEngine } from '../services/market-nav-engine.js';

// ── Zod Schemas ───────────────────────────────────────────────────────────────

const createIndexSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1),
  indexType: z.string().max(100).optional(),
  philosophy: z.string().optional(),
  universe: z.string().max(200).optional(),
  maxHoldings: z.number().int().positive().optional(),
  rebalanceFrequency: z.string().max(50).optional(),
  weightingMethod: z.string().max(100).optional(),
  benchmarkSymbol: z.string().max(50).optional(),
});

const addHoldingSchema = z.object({
  symbol: z.string().min(1).max(50),
  name: z.string().max(200).optional(),
  weight: z.number().min(0).max(1),
  shares: z.number().min(0).optional(),
  entryPrice: z.number().min(0).optional(),
});

const initializeIndexSchema = z.object({
  holdings: z.array(z.object({
    symbol: z.string().min(1).max(50),
    name: z.string().max(200).optional(),
    weight: z.number().min(0).max(1),
    shares: z.number().min(0).optional(),
    entryPrice: z.number().min(0).optional(),
  })).min(1),
});

export async function createMarketIndexesRoutes(db: DatabaseAdapter) {
  const router = Router();
  const indexService = await createMarketIndexService(db);
  const rebalanceService = await createMarketIndexRebalanceService(db);
  const attributionService = await createMarketIndexAttributionService(db);
  const navEngine = await createMarketNavEngine(db);

  // ── Index CRUD ─────────────────────────────────────────────────────────

  router.get('/markets/indexes', async (req, res) => {
    try {
      const indexes = await indexService.listIndexes({
        status: req.query.status as string | undefined,
        indexType: req.query.type as string | undefined,
        query: req.query.q as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
      });
      res.json(indexes);
    } catch (err) {
      console.error('[market-indexes] List error:', err);
      res.status(500).json({ error: 'Failed to list indexes' });
    }
  });

  router.get('/markets/indexes/stats', async (_req, res) => {
    try {
      res.json(await indexService.getIndexStats());
    } catch (err) {
      console.error('[market-indexes] Stats error:', err);
      res.status(500).json({ error: 'Failed to get stats' });
    }
  });

  router.get('/markets/indexes/leaderboard', async (req, res) => {
    try {
      const period = (req.query.period as string) ?? '1m';
      res.json(await indexService.getLeaderboard(period));
    } catch (err) {
      console.error('[market-indexes] Leaderboard error:', err);
      res.status(500).json({ error: 'Failed to get leaderboard' });
    }
  });

  router.get('/markets/indexes/leaderboard/streaks', async (req, res) => {
    try {
      const period = (req.query.period as string) ?? '1m';
      const leaderboard = await indexService.getLeaderboard(period);

      // Calculate winning streaks from NAV history for each index
      const streaks = await Promise.all(leaderboard.map(async (entry) => {
        const navHistory = await indexService.getNavHistory(entry.index_id, 90);
        // NAV history comes in DESC order; reverse for chronological
        const chronological = [...navHistory].reverse();

        let currentStreak = 0;
        let streakDirection: 'winning' | 'losing' | 'none' = 'none';

        // Walk backwards from most recent to count streak
        for (let i = chronological.length - 1; i >= 0; i--) {
          const dailyReturn = chronological[i].daily_return ?? 0;
          if (i === chronological.length - 1) {
            streakDirection = dailyReturn >= 0 ? 'winning' : 'losing';
            currentStreak = 1;
          } else {
            const isPositive = dailyReturn >= 0;
            if ((streakDirection === 'winning' && isPositive) || (streakDirection === 'losing' && !isPositive)) {
              currentStreak++;
            } else {
              break;
            }
          }
        }

        return {
          index_id: entry.index_id,
          index_name: entry.index_name,
          total_return: entry.total_return,
          streak: currentStreak,
          streak_direction: streakDirection,
        };
      }));

      res.json(streaks);
    } catch (err) {
      console.error('[market-indexes] Leaderboard streaks error:', err);
      res.status(500).json({ error: 'Failed to get leaderboard streaks' });
    }
  });

  router.get('/markets/indexes/:id', async (req, res) => {
    try {
      const index = await indexService.getIndex(req.params.id);
      if (!index) return res.status(404).json({ error: 'Index not found' });
      res.json(index);
    } catch (err) {
      console.error('[market-indexes] Get error:', err);
      res.status(500).json({ error: 'Failed to get index' });
    }
  });

  router.post('/markets/indexes', async (req, res) => {
    try {
      const parsed = createIndexSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
      }
      const { name, description, indexType, philosophy, universe, maxHoldings, rebalanceFrequency, weightingMethod, benchmarkSymbol } = parsed.data;
      const id = await indexService.createIndex({ name, description, indexType, philosophy, universe, maxHoldings, rebalanceFrequency, weightingMethod, benchmarkSymbol });
      res.status(201).json({ id });
    } catch (err) {
      console.error('[market-indexes] Create error:', err);
      res.status(500).json({ error: 'Failed to create index' });
    }
  });

  router.put('/markets/indexes/:id', async (req, res) => {
    try {
      await indexService.updateIndex(req.params.id, req.body);
      res.json({ ok: true });
    } catch (err) {
      console.error('[market-indexes] Update error:', err);
      res.status(500).json({ error: 'Failed to update index' });
    }
  });

  router.post('/markets/indexes/:id/activate', async (req, res) => {
    try {
      await indexService.activateIndex(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      console.error('[market-indexes] Activate error:', err);
      res.status(500).json({ error: 'Failed to activate index' });
    }
  });

  router.post('/markets/indexes/:id/initialize', async (req, res) => {
    try {
      const parsed = initializeIndexSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
      }
      const { holdings } = parsed.data;
      const result = await navEngine.initializeIndex(req.params.id, holdings);
      res.json(result);
    } catch (err) {
      console.error('[market-indexes] Initialize error:', err);
      res.status(500).json({ error: 'Failed to initialize index' });
    }
  });

  router.delete('/markets/indexes/:id', async (req, res) => {
    try {
      await indexService.deleteIndex(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      console.error('[market-indexes] Delete error:', err);
      res.status(500).json({ error: 'Failed to delete index' });
    }
  });

  // ── Holdings ───────────────────────────────────────────────────────────

  router.get('/markets/indexes/:id/holdings', async (req, res) => {
    try {
      const holdings = await indexService.getActiveHoldings(req.params.id);
      res.json(holdings);
    } catch (err) {
      console.error('[market-indexes] Holdings error:', err);
      res.status(500).json({ error: 'Failed to get holdings' });
    }
  });

  router.post('/markets/indexes/:id/holdings', async (req, res) => {
    try {
      const parsed = addHoldingSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
      }
      const { symbol, name, weight, shares, entryPrice } = parsed.data;
      await indexService.addHolding(req.params.id, { symbol, name, weight, shares, entryPrice });
      res.status(201).json({ ok: true });
    } catch (err) {
      console.error('[market-indexes] Add holding error:', err);
      res.status(500).json({ error: 'Failed to add holding' });
    }
  });

  router.delete('/markets/indexes/:id/holdings/:symbol', async (req, res) => {
    try {
      await indexService.removeHolding(req.params.id, req.params.symbol);
      res.json({ ok: true });
    } catch (err) {
      console.error('[market-indexes] Remove holding error:', err);
      res.status(500).json({ error: 'Failed to remove holding' });
    }
  });

  // ── NAV History ────────────────────────────────────────────────────────

  router.get('/markets/indexes/:id/nav', async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 365;
      const nav = await indexService.getNavHistory(req.params.id, limit);
      res.json(nav);
    } catch (err) {
      console.error('[market-indexes] NAV error:', err);
      res.status(500).json({ error: 'Failed to get NAV history' });
    }
  });

  // ── Rebalance Engine ──────────────────────────────────────────────────

  router.get('/markets/indexes/:id/rebalances', async (req, res) => {
    try {
      const rebalances = await db.all(
        'SELECT * FROM market_index_rebalances WHERE index_id = ? ORDER BY executed_at DESC',
        req.params.id
      );
      res.json(rebalances);
    } catch (err) {
      console.error('[market-indexes] List rebalances error:', err);
      res.status(500).json({ error: 'Failed to list rebalances' });
    }
  });

  router.post('/markets/indexes/:id/rebalances', async (req, res) => {
    try {
      const indexId = req.params.id;

      // Check if rebalance is needed
      const check = await rebalanceService.shouldRebalance(indexId);

      // Generate proposal regardless (manual trigger)
      const proposal = await rebalanceService.generateRebalanceProposal(indexId);

      // Also evaluate current holdings
      const evaluations = await rebalanceService.evaluateHoldings(indexId);

      // Screen universe for new candidates
      const candidates = await rebalanceService.screenUniverse(indexId);
      const eligibleCandidates = candidates.filter(c => c.eligible);

      // Rank eligible candidates
      let rankedCandidates: Awaited<ReturnType<typeof rebalanceService.rankCandidates>> = [];
      if (eligibleCandidates.length > 0) {
        rankedCandidates = await rebalanceService.rankCandidates(
          indexId,
          eligibleCandidates.map(c => c.symbol)
        );
      }

      // Validate previous rebalance if any
      const previousValidation = await rebalanceService.validatePreviousRebalance(indexId);

      res.json({
        shouldRebalance: check,
        proposal,
        evaluations,
        candidates,
        rankedCandidates,
        previousValidation,
      });
    } catch (err) {
      console.error('[market-indexes] Generate rebalance proposal error:', err);
      res.status(500).json({ error: 'Failed to generate rebalance proposal' });
    }
  });

  router.post('/markets/indexes/:id/rebalances/:rid/execute', async (req, res) => {
    try {
      const { changes } = req.body;
      if (!changes || !Array.isArray(changes)) {
        return res.status(400).json({ error: 'changes array is required' });
      }

      const rebalanceId = await rebalanceService.executeRebalance(req.params.id, { changes });
      res.json({ rebalanceId });
    } catch (err) {
      console.error('[market-indexes] Execute rebalance error:', err);
      res.status(500).json({ error: 'Failed to execute rebalance' });
    }
  });

  router.get('/markets/indexes/:id/rebalances/:rid', async (req, res) => {
    try {
      const rebalance = await db.get(
        'SELECT * FROM market_index_rebalances WHERE id = ? AND index_id = ?',
        req.params.rid, req.params.id
      );
      if (!rebalance) return res.status(404).json({ error: 'Rebalance not found' });
      res.json(rebalance);
    } catch (err) {
      console.error('[market-indexes] Get rebalance error:', err);
      res.status(500).json({ error: 'Failed to get rebalance' });
    }
  });

  // ── Performance & Attribution ────────────────────────────────────────────

  router.get('/markets/indexes/:id/performance', async (req, res) => {
    try {
      const indexId = req.params.id;
      const period = req.query.period as string | undefined;

      const positionAttribution = await attributionService.calculatePositionAttribution(indexId, period);
      const sectorAttribution = await attributionService.calculateSectorAttribution(indexId, period);
      const narrative = await attributionService.generatePerformanceNarrative(indexId, period);

      // Get additional performance stats
      const validation = await rebalanceService.validatePreviousRebalance(indexId);

      res.json({
        positionAttribution,
        sectorAttribution,
        narrative,
        lastRebalanceImpact: validation,
      });
    } catch (err) {
      console.error('[market-indexes] Performance error:', err);
      res.status(500).json({ error: 'Failed to get performance metrics' });
    }
  });

  router.get('/markets/indexes/:id/attribution/positions', async (req, res) => {
    try {
      const period = req.query.period as string | undefined;
      const attribution = await attributionService.calculatePositionAttribution(req.params.id, period);
      res.json(attribution);
    } catch (err) {
      console.error('[market-indexes] Position attribution error:', err);
      res.status(500).json({ error: 'Failed to get position attribution' });
    }
  });

  router.get('/markets/indexes/:id/attribution/atoms', async (req, res) => {
    try {
      const period = req.query.period as string | undefined;
      const attribution = await attributionService.calculateAtomAttribution(req.params.id, period);
      res.json(attribution);
    } catch (err) {
      console.error('[market-indexes] Atom attribution error:', err);
      res.status(500).json({ error: 'Failed to get atom attribution' });
    }
  });

  router.get('/markets/indexes/:id/attribution/consuls', async (req, res) => {
    try {
      const period = req.query.period as string | undefined;
      const attribution = await attributionService.calculateConsulAttribution(req.params.id, period);
      res.json(attribution);
    } catch (err) {
      console.error('[market-indexes] Consul attribution error:', err);
      res.status(500).json({ error: 'Failed to get consul attribution' });
    }
  });

  router.get('/markets/indexes/:id/attribution/sectors', async (req, res) => {
    try {
      const period = req.query.period as string | undefined;
      const attribution = await attributionService.calculateSectorAttribution(req.params.id, period);
      res.json(attribution);
    } catch (err) {
      console.error('[market-indexes] Sector attribution error:', err);
      res.status(500).json({ error: 'Failed to get sector attribution' });
    }
  });

  return router;
}
