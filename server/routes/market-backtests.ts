// ═══════════════════════════════════════════════════════════
// Market Backtest Routes — Create, run, and query historical
// backtests. Downloads price data, simulates day-by-day
// trading, and returns NAV/Sharpe/drawdown results.
// ═══════════════════════════════════════════════════════════

import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { createMarketBacktestRunner } from '../services/market-backtest-runner.js';
import { safeError } from '../lib/error-response.js';

export async function createMarketBacktestRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();
  const runner = await createMarketBacktestRunner(db);

  // GET /markets/backtests — List backtests
  router.get('/markets/backtests', async (_req, res) => {
    try {
      const backtests = await runner.listBacktests();
      res.json(backtests);
    } catch (err) {
      const message = safeError(err);
      res.status(500).json({ error: message });
    }
  });

  // GET /markets/backtests/:id — Get backtest details
  router.get('/markets/backtests/:id', async (req, res) => {
    try {
      const bt = await runner.getBacktest(req.params.id);
      if (!bt) return res.status(404).json({ error: 'Backtest not found' });
      res.json(bt);
    } catch (err) {
      const message = safeError(err);
      res.status(500).json({ error: message });
    }
  });

  // GET /markets/backtests/:id/days — Get backtest daily snapshots
  router.get('/markets/backtests/:id/days', async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 365;
      const days = await runner.getBacktestDays(req.params.id, limit);
      res.json(days);
    } catch (err) {
      const message = safeError(err);
      res.status(500).json({ error: message });
    }
  });

  // POST /markets/backtests — Create and run a backtest
  router.post('/markets/backtests', async (req, res) => {
    try {
      const { name, startDate, endDate, universe, initialCapital, strategy } = req.body;
      if (!name || !startDate || !endDate || !universe?.length) {
        return res.status(400).json({ error: 'Missing required fields: name, startDate, endDate, universe' });
      }

      const backtestId = await runner.createBacktest({
        name, startDate, endDate, universe,
        initialCapital: initialCapital ?? 100_000_000,
        strategy: strategy ?? { rebalanceFrequency: 'weekly', maxHoldings: 20, weightingMethod: 'equal', useAI: false },
      });

      // Download historical data first
      console.log(`[backtest] Downloading historical data for ${universe.length} symbols...`);
      const cached = await runner.downloadHistoricalData(universe, startDate, endDate);
      console.log(`[backtest] Cached ${cached} historical price records`);

      // Run the backtest
      const result = await runner.runBacktest(backtestId);
      res.json(result);
    } catch (err) {
      const message = safeError(err);
      res.status(500).json({ error: message });
    }
  });

  // POST /markets/backtests/download-history — Download historical data only (without running backtest)
  router.post('/markets/backtests/download-history', async (req, res) => {
    try {
      const { symbols, from, to } = req.body;
      if (!symbols?.length || !from || !to) {
        return res.status(400).json({ error: 'Missing required fields: symbols, from, to' });
      }
      const count = await runner.downloadHistoricalData(symbols, from, to);
      res.json({ cached: count });
    } catch (err) {
      const message = safeError(err);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
