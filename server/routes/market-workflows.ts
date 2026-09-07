// ═══════════════════════════════════════════════════════════
// Market Workflow Routes — Manual triggers for market
// intelligence cycles, index rebalance, and prediction validation.
// ═══════════════════════════════════════════════════════════

import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { safeError } from '../lib/error-response.js';
import {
  classifyDeadLetter, summariseDeadLetters, allFailureModes,
  type DeadLetterRow,
} from '../services/market-dead-letter-triage.js';
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
      res.status(500).json({ error: safeError(err) });
    }
  });

  // POST /markets/workflows/prediction-checkpoints — Mid-flight prediction checks (no LLM cost)
  router.post('/markets/workflows/prediction-checkpoints', async (_req, res) => {
    try {
      const result = await orchestrator.runPredictionCheckpoints();
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
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
      res.status(500).json({ error: safeError(err) });
    }
  });

  // POST /markets/workflows/prediction-validation — Manual trigger
  router.post('/markets/workflows/prediction-validation', async (_req, res) => {
    try {
      console.log('[market-workflows] Prediction validation triggered manually');
      const result = await orchestrator.runPredictionValidation();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // POST /markets/workflows/weekly-pulse — Manual trigger for short-term predictions
  router.post('/markets/workflows/weekly-pulse', async (_req, res) => {
    try {
      console.log('[market-workflows] Weekly pulse triggered manually');
      const result = await orchestrator.runWeeklyPulse();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
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
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Dead Letter Queue ────────────────────────────────────────────────────

  // GET /markets/workflows/dead-letters — List dead letters, with the status of
  // the run that contained them and a triage summary.
  //
  // The join is the point. Without it the response cannot answer "did the run
  // that contained this failure nonetheless report success?", which is the one
  // question that matters: such a failure is invisible everywhere else in the
  // product — loop health counts the run as a success, the same-day dedup guard
  // treats the day as done, and the scheduler will not retry the slot. That
  // shape hid a thesis-generation crash from March to September.
  //
  // `input_data` is deliberately not selected: all 21 insertDeadLetter call
  // sites pass three arguments, so the column is NULL on every row in existence.
  router.get('/markets/workflows/dead-letters', async (req, res) => {
    try {
      // The whole table is ~200 rows after six months, so the default returns
      // all of it: a page whose job is to show a long-running silent failure
      // must not truncate the history that reveals it.
      const requested = parseInt(req.query.limit as string, 10);
      const limit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 2000) : 1000;
      const deadLetters = await db.all<DeadLetterRow>(
        `SELECT d.id, d.run_id, d.step_name, d.error, d.retry_count, d.created_at,
                r.workflow_id, r.status AS run_status, r.error_message AS run_error_message
           FROM market_workflow_dead_letters d
           LEFT JOIN workflow_runs r ON r.id = d.run_id
          ORDER BY d.created_at DESC
          LIMIT ?`,
        limit
      );
      res.json({
        deadLetters: deadLetters.map((d) => ({ ...d, mode: classifyDeadLetter(d.error) })),
        summary: summariseDeadLetters(deadLetters),
        modes: allFailureModes(),
      });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
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

      // Determine workflow type from the run. Checked BEFORE the counter moves:
      // the increment used to happen first, so a retry the route then refused
      // still recorded an attempt that never occurred.
      const run = await db.get<{ workflow_id: string }>(
        'SELECT workflow_id FROM workflow_runs WHERE id = ?',
        deadLetter.run_id
      );

      if (run?.workflow_id !== 'wf_markets_daily_intelligence'
        && run?.workflow_id !== 'wf_markets_prediction_validation') {
        return res.status(400).json({
          error: 'Cannot auto-retry this workflow type. Use the specific workflow trigger endpoint.',
          deadLetter,
        });
      }

      await db.run(
        'UPDATE market_workflow_dead_letters SET retry_count = retry_count + 1 WHERE id = ?',
        req.params.id
      );

      // This re-runs the WHOLE parent workflow — the step itself cannot be
      // retried independently — and awaits it inline, so the request occupies a
      // connection for as long as the cycle takes (Phase 4 has run for over
      // three hours). It is not wired to any UI for that reason; recovery of a
      // missed or failed cycle is the scheduler's slot catch-up, which is
      // bounded and attempt-capped. Kept for deliberate operator use.
      const retryResult = run.workflow_id === 'wf_markets_daily_intelligence'
        ? await orchestrator.runDailyIntelligence()
        : await orchestrator.runPredictionValidation();

      // The row is NOT deleted. It used to be removed on dispatch — before the
      // outcome was known — which destroyed the only record of the failure even
      // when the "retry" had done nothing at all: runDailyIntelligence short-
      // circuits on a same-day dedup guard and returns runId 'skipped', and the
      // route reported { retried: true } regardless. A queue that exists to make
      // silent failure visible must not delete its own evidence; retry_count
      // carries the fact that an attempt was made.
      const skipped = typeof retryResult === 'object' && retryResult !== null
        && (retryResult as { runId?: string }).runId === 'skipped';

      res.json({
        retried: !skipped,
        skipped,
        reason: skipped ? 'The parent workflow had already completed today, so nothing was re-run.' : undefined,
        deadLetterId: deadLetter.id,
        result: retryResult,
      });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
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
