// ═══════════════════════════════════════════════════════════
// Market Workflow Routes — Manual triggers for market
// intelligence cycles, index rebalance, and prediction validation.
// ═══════════════════════════════════════════════════════════

import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { safeError } from '../lib/error-response.js';
import { createMarketWorkflowOrchestrator } from '../services/market-workflow-orchestrator.js';
import { createMarketComputationService } from '../services/market-computation-service.js';
import { createMarketDataService } from '../services/market-data-service.js';

export async function createMarketWorkflowRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();

  const computationService = await createMarketComputationService(db);
  const dataService = await createMarketDataService(db);
  const orchestrator = await createMarketWorkflowOrchestrator(db, computationService, dataService);

  // POST /markets/workflows/daily-intelligence — Manual trigger
  router.post('/markets/workflows/daily-intelligence', async (_req, res) => {
    try {
      console.log('[market-workflows] Daily intelligence triggered manually');
      const result = await orchestrator.runDailyIntelligence();
      res.json(result);
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // POST /markets/workflows/prediction-checkpoints — Mid-flight prediction checks (no LLM cost)
  router.post('/markets/workflows/prediction-checkpoints', async (_req, res) => {
    try {
      const result = await orchestrator.runPredictionCheckpoints();
      res.json({ success: true, ...result });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // POST /markets/workflows/rebalance/:indexId — Trigger rebalance for specific index
  router.post('/markets/workflows/rebalance/:indexId', async (req, res) => {
    try {
      const { indexId } = req.params;
      console.log(`[market-workflows] Rebalance triggered for index ${indexId}`);
      const result = await orchestrator.runIndexRebalance(indexId);
      res.json(result);
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // POST /markets/workflows/prediction-validation — Manual trigger
  router.post('/markets/workflows/prediction-validation', async (_req, res) => {
    try {
      console.log('[market-workflows] Prediction validation triggered manually');
      const result = await orchestrator.runPredictionValidation();
      res.json(result);
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // POST /markets/workflows/weekly-pulse — Manual trigger for short-term predictions
  router.post('/markets/workflows/weekly-pulse', async (_req, res) => {
    try {
      console.log('[market-workflows] Weekly pulse triggered manually');
      const result = await orchestrator.runWeeklyPulse();
      res.json(result);
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // GET /markets/workflows/runs — List recent workflow runs
  router.get('/markets/workflows/runs', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const runs = await db.all<{
        id: string;
        workflow_id: string;
        trigger_source: string;
        status: string;
        started_at: string;
        completed_at: string | null;
        error_message: string | null;
      }>(
        `SELECT id, workflow_id, trigger_source, status, started_at, completed_at, error_message
         FROM workflow_runs
         WHERE trigger_source = 'market-orchestrator'
         ORDER BY started_at DESC LIMIT ?`,
        limit
      );
      res.json({ runs });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // ── Dead Letter Queue ────────────────────────────────────────────────────

  // GET /markets/workflows/dead-letters — List dead letters
  router.get('/markets/workflows/dead-letters', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const deadLetters = await db.all<{
        id: string;
        run_id: string;
        step_name: string;
        error: string | null;
        input_data: string | null;
        retry_count: number;
        created_at: string;
      }>(
        `SELECT id, run_id, step_name, error, input_data, retry_count, created_at
         FROM market_workflow_dead_letters
         ORDER BY created_at DESC LIMIT ?`,
        limit
      );
      res.json({ deadLetters });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // POST /markets/workflows/dead-letters/:id/retry — Retry a dead letter
  router.post('/markets/workflows/dead-letters/:id/retry', async (req, res) => {
    try {
      const deadLetter = await db.get<{
        id: string;
        run_id: string;
        step_name: string;
        error: string | null;
        input_data: string | null;
        retry_count: number;
      }>(
        'SELECT id, run_id, step_name, error, input_data, retry_count FROM market_workflow_dead_letters WHERE id = ?',
        req.params.id
      );

      if (!deadLetter) {
        return res.status(404).json({ error: 'Dead letter not found' });
      }

      // Increment retry count
      await db.run(
        'UPDATE market_workflow_dead_letters SET retry_count = retry_count + 1 WHERE id = ?',
        req.params.id
      );

      // Re-run the parent workflow (the step itself cannot be independently retried)
      // Determine workflow type from the run
      const run = await db.get<{ workflow_id: string }>(
        'SELECT workflow_id FROM workflow_runs WHERE id = ?',
        deadLetter.run_id
      );

      let retryResult: unknown = null;
      if (run?.workflow_id === 'wf_markets_daily_intelligence') {
        retryResult = await orchestrator.runDailyIntelligence();
      } else if (run?.workflow_id === 'wf_markets_prediction_validation') {
        retryResult = await orchestrator.runPredictionValidation();
      } else {
        return res.status(400).json({
          error: 'Cannot auto-retry this workflow type. Use the specific workflow trigger endpoint.',
          deadLetter,
        });
      }

      // Remove dead letter on successful retry dispatch
      await db.run('DELETE FROM market_workflow_dead_letters WHERE id = ?', req.params.id);

      res.json({ retried: true, deadLetterId: deadLetter.id, result: retryResult });
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  // ── Fundamental Analysis ────────────────────────────────────────────────

  // POST /markets/workflows/fundamental-analysis — Batch analysis
  router.post('/markets/workflows/fundamental-analysis', async (_req, res) => {
    try {
      const { createMarketFundamentalAnalysisService } = await import('../services/market-fundamental-analysis-service.js');
      const analysisService = await createMarketFundamentalAnalysisService(db);
      const result = await analysisService.runBatchAnalysis(5);
      res.json(result);
    } catch (err) {
      console.error('[market-workflows] Fundamental analysis error:', err);
      res.status(500).json({ error: 'Failed to run fundamental analysis' });
    }
  });

  // POST /markets/workflows/fundamental-analysis/:symbol — Single symbol analysis
  router.post('/markets/workflows/fundamental-analysis/:symbol', async (req, res) => {
    try {
      const { createMarketFundamentalAnalysisService } = await import('../services/market-fundamental-analysis-service.js');
      const analysisService = await createMarketFundamentalAnalysisService(db);
      const result = await analysisService.analyzeCompany(req.params.symbol);
      if (!result) return res.status(404).json({ error: 'No fundamental data available for this symbol' });
      res.json(result);
    } catch (err) {
      console.error('[market-workflows] Symbol analysis error:', err);
      res.status(500).json({ error: 'Failed to analyze symbol' });
    }
  });

  // GET /markets/analyst-notes — Retrieve analyst notes
  router.get('/markets/analyst-notes', async (req, res) => {
    try {
      const { createMarketFundamentalAnalysisService } = await import('../services/market-fundamental-analysis-service.js');
      const analysisService = await createMarketFundamentalAnalysisService(db);
      const symbol = req.query.symbol as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const notes = await analysisService.getAnalystNotes(symbol, limit);
      res.json(notes);
    } catch (err) {
      res.status(500).json({ error: 'Failed to get analyst notes' });
    }
  });

  return router;
}
