// ═══════════════════════════════════════════════════════════
// Market Workflow Orchestrator — Market-specific intelligence
// cycles, rebalance workflows, and prediction validation.
// Wires the computation engine, data service, and LLM into
// multi-step automated workflows.
// ═══════════════════════════════════════════════════════════

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

import type { DatabaseAdapter } from '../db/database.js';
import type { MarketComputationService } from './market-computation-service.js';
import type { MarketDataService } from './market-data-service.js';
import { createMarketInvestigationService } from './market-investigation-service.js';
import { createMarketWhyChainsService } from './market-why-chains-service.js';
import { createMarketIntelligenceService } from './market-intelligence-service.js';
import { createMarketThesisService } from './market-thesis-service.js';
import { createMarketIndexRebalanceService } from './market-index-rebalance-service.js';
import { createMarketFundamentalScoringService } from './market-fundamental-scoring-service.js';
import { createConditionalAccuracyService } from './market-conditional-accuracy-service.js';
import { createMarketPatternService } from './market-pattern-service.js';
import type { TemporalReasoningService } from './temporal-reasoning.js';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { createWhyChainInsightsAggregator } from './market-why-chain-insights.js';

// ── Step Timeout ────────────────────────────────────────────────────────────────

async function withTimeout<T>(promise: Promise<T>, ms: number, stepName: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Step "${stepName}" timed out after ${ms}ms`)), ms)
    ),
  ]);
}

const COMPUTATION_TIMEOUT = 60_000;  // 60s for computation steps
// 300s for LLM/AI steps — generous enough for the sdk:/codex: subscription
// engines, whose runtime spawn adds seconds before the first token and whose
// reasoning models think longer than the old 120s allowed.
const LLM_TIMEOUT = 300_000;
const FETCH_TIMEOUT = 120_000;      // 120s for data fetching (17 sources)

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Types ────────────────────────────────────────────────────────────────────

interface WorkflowRunResult {
  runId: string;
  status: 'completed' | 'failed';
  stepsCompleted: number;
  stepResults: Array<{ step: string; status: string; output?: unknown; error?: string }>;
  error?: string;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export async function createMarketWorkflowOrchestrator(
  db: DatabaseAdapter,
  computationService: MarketComputationService,
  dataService: MarketDataService,
  anthropicApiKey?: string,
  temporalService?: TemporalReasoningService | null,
) {
  // Initialize investigation + why-chains + learning + thesis + rebalance services
  const investigationService = await createMarketInvestigationService(db);
  const whyChainsService = await createMarketWhyChainsService(db);
  const learningService = await createMarketIntelligenceService(db);
  const anthropicClient = anthropicApiKey ? new (await import('@anthropic-ai/sdk')).default({ apiKey: anthropicApiKey }) : undefined;
  const thesisService = await createMarketThesisService(db, anthropicClient);
  const rebalanceService = await createMarketIndexRebalanceService(db);
  const fundamentalScoringService = await createMarketFundamentalScoringService(db);
  const conditionalAccuracyService = await createConditionalAccuracyService(db);
  const patternService = await createMarketPatternService(db);

  // Helper: insert dead letter on permanent step failure
  async function insertDeadLetter(runId: string, stepName: string, error: string, inputData?: unknown): Promise<void> {
    try {
      const id = `mdl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await db.run(`
        INSERT INTO market_workflow_dead_letters (id, run_id, step_name, error, input_data, retry_count)
        VALUES (?, ?, ?, ?, ?, 0)
      `, id, runId, stepName, error, inputData ? JSON.stringify(inputData) : null);
    } catch {
      // dead letters table may not exist yet — non-fatal
    }
  }

  // Helper: read a market prompt file
  function readPrompt(name: string): string {
    try {
      return readFileSync(path.join(__dirname, '..', 'prompts', `${name}.md`), 'utf-8');
    } catch {
      return `You are an expert market analyst. Task: ${name}`;
    }
  }

  // Helper: call LLM (cost-efficient model for headless)
  async function callLLM(
    systemPrompt: string,
    userMessage: string,
    thinking?: string,
    useWebSearch?: boolean,
  ): Promise<string> {
    if (useWebSearch && anthropicApiKey) {
      // Use Claude directly with web search tool for real-time market data
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey: anthropicApiKey });
      const response = await client.messages.create({
        // Direct Anthropic client (web_search tool requires it) — cannot wrap
        // with mapModelToProvider here. Fixed invalid id (was ...-20250514,
        // which the Anthropic API rejects; registry id is ...-20250929).
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }] as unknown as Parameters<typeof client.messages.create>[0]['tools'],
      });
      let text = '';
      for (const block of response.content) {
        if (block.type === 'text') text += block.text;
      }
      return text;
    }
    // Fall back to existing callChat (provider-agnostic; honor the configured
    // markets model — Settings → "Markets AI model", else the utility model)
    const { callChat } = await import('./provider-router.js');
    const { getMarketsModel } = await import('./markets-model-store.js');
    const result = await callChat({
      model: await getMarketsModel(db),
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 4096,
      thinkingLevel: thinking,
    });
    return result.text;
  }

  // Helper: record workflow run. UPSERT on id: callers record the same run
  // twice (start = 'running', end = 'completed'/'failed') — a plain INSERT
  // collided on the PK for the second write and was swallowed, leaving e.g.
  // every weekly-pulse row stuck 'running' forever in the workflows UI.
  async function recordRun(runId: string, workflowId: string, status: string, error?: string): Promise<void> {
    try {
      // completed_at is a TEXT column (SQLite heritage) — NOW() must be cast
      // or the CASE branches mismatch and the whole INSERT errors out.
      await db.run(`
        INSERT INTO workflow_runs (id, workflow_id, trigger_source, status, user_id, error_message)
        VALUES (?, ?, 'market-orchestrator', ?, 'system', ?)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          error_message = EXCLUDED.error_message,
          completed_at = CASE WHEN EXCLUDED.status IN ('completed', 'failed')
                              THEN NOW()::text ELSE workflow_runs.completed_at END
      `, runId, workflowId, status, error ?? null);
    } catch (err) {
      // Non-fatal (the run itself must never die on bookkeeping), but LOUD:
      // this catch silently ate a type-mismatch bug for a full day.
      console.warn(`[orchestrator] recordRun failed for ${runId} (${status}): ${err instanceof Error ? err.message : err}`);
    }
  }

  async function updateRun(runId: string, status: string, error?: string): Promise<void> {
    try {
      await db.run(`
        UPDATE workflow_runs SET status = ?, completed_at = NOW(), error_message = ? WHERE id = ?
      `, status, error ?? null, runId);
    } catch {
      // non-fatal
    }

    // Workflow failure alerting
    if (status === 'failed') {
      console.error(JSON.stringify({
        event: 'workflow_failure',
        runId,
        error: error ?? 'unknown',
        timestamp: new Date().toISOString(),
      }));
      // PG NOTIFY if available (non-fatal)
      if (db.dialect === 'postgresql') {
        try {
          await db.run(`SELECT pg_notify('workflow_failure', $1)`, JSON.stringify({ runId, error: error ?? 'unknown' }));
        } catch { /* non-fatal */ }
      }
    }
  }

  // ── Daily Intelligence Cycle ─────────────────────────────────────────────

  async function runDailyIntelligence(): Promise<WorkflowRunResult> {
    // ── Dedup guard: max 1 successful run per calendar day ─────────────
    // (status='success' is impossible under the workflow_runs CHECK — the
    // guard never fired and dailies could double-run; aligned to 'completed',
    // 'success' kept defensively for any pre-CHECK rows.)
    const lastRun = await db.get<{ started_at: string }>(
      "SELECT started_at FROM workflow_runs WHERE workflow_id = 'wf_markets_daily_intelligence' AND status IN ('completed','success') AND started_at::date = CURRENT_DATE ORDER BY started_at DESC LIMIT 1"
    );
    if (lastRun) {
      console.log(`[daily-intelligence] Already ran successfully today at ${lastRun.started_at} — skipping`);
      return {
        runId: 'skipped', status: 'completed', stepsCompleted: 0,
        stepResults: [{ step: 'Dedup Guard', status: 'skipped', output: { reason: 'Already ran today', lastRun: lastRun.started_at } }],
      };
    }

    const runId = randomUUID();
    const stepResults: WorkflowRunResult['stepResults'] = [];
    let stepsCompleted = 0;

    await recordRun(runId, 'wf_markets_daily_intelligence', 'running');

    try {
      // Step 1: Fetch all data sources
      try {
        const fetchResult = await withTimeout(dataService.fetchAllSources(), FETCH_TIMEOUT, 'Fetch Market Data');
        const totalItems = fetchResult.results.reduce((s, r) => s + r.itemsIngested, 0);
        stepResults.push({ step: 'Fetch Market Data', status: 'success', output: { totalItems, sources: fetchResult.results.length } });
        stepsCompleted++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({ step: 'Fetch Market Data', status: 'error', error: errMsg });
        await insertDeadLetter(runId, 'Fetch Market Data', errMsg);
      }

      // Step 2: Extract atoms from unprocessed news/fundamentals
      try {
        const { createMarketAtomService } = await import('./market-atom-service.js');
        const atomSvc = await createMarketAtomService(db);
        // M7: newest-first + recency floor. FIFO was wrong — old news is the
        // least valuable atom source and burns tokens on stale signal. The
        // triage cron catches items that fall past 14d without extraction.
        // Timestamp sort uses a safe cast (published_at only trusted when
        // ISO-prefixed) so non-ISO feeds fall back to fetched_at instead of
        // sorting lexicographically — see the same pattern in the triage
        // service.
        const unprocessed = await db.all<{ id: string; data_type: string; content: string; title: string | null }>(
          `SELECT id, data_type, content, title FROM market_data_raw
           WHERE is_processed = 0
             AND data_type NOT IN ('price')
             AND fetched_at >= NOW() - INTERVAL '14 days'
           ORDER BY COALESCE(
             CASE WHEN published_at ~ '^\\d{4}-\\d{2}-\\d{2}'
                  THEN published_at::timestamptz
                  ELSE NULL
             END,
             fetched_at
           ) DESC
           LIMIT 40`,
        );
        let atomsCreated = 0;
        for (const row of unprocessed) {
          try {
            const text = row.title ? `${row.title}\n\n${row.content}` : row.content;
            const ids = await atomSvc.extractAtomsFromRawData(row.id, text, row.data_type);
            atomsCreated += ids.length;
            await db.run('UPDATE market_data_raw SET is_processed = 1 WHERE id = ?', row.id);
          } catch {
            await db.run('UPDATE market_data_raw SET is_processed = 1 WHERE id = ?', row.id);
          }
        }
        stepResults.push({ step: 'Extract Atoms', status: 'success', output: { processed: unprocessed.length, atomsCreated } });
        stepsCompleted++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({ step: 'Extract Atoms', status: 'warning', output: { error: errMsg } });
      }

      // Step 3: Refresh correlation map — convert prices to returns, format as entities
      try {
        const corrSymbols = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'JPM', 'KO'];
        const entities: Array<{ id: string; returns: number[] }> = [];
        for (const sym of corrSymbols) {
          const rows = await db.all<{ close: number }>(
            "SELECT close FROM market_historical_prices WHERE symbol = ? ORDER BY price_date DESC LIMIT 60", sym
          );
          if (rows.length >= 10) {
            const prices = rows.map(r => Number(r.close)).reverse();
            // Convert prices to daily returns
            const returns = prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);
            entities.push({ id: sym, returns });
          }
        }
        const result = await withTimeout(
          computationService.runTemplate('correlation_map_refresh', { entities }, 'daily-intelligence'),
          COMPUTATION_TIMEOUT, 'Refresh Correlation Map'
        );
        stepResults.push({ step: 'Refresh Correlation Map', status: result.success ? 'success' : 'warning', output: result.output });
        stepsCompleted++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({ step: 'Refresh Correlation Map', status: 'skipped', error: errMsg });
        await insertDeadLetter(runId, 'Refresh Correlation Map', errMsg);
      }

      // Step 4: Apply atom decay — query active atoms from DB
      try {
        const activeAtoms = await db.all<{ id: string; content: string; confidence: number; created_at: string }>(
          "SELECT id, content, confidence, created_at FROM market_atoms WHERE is_active = 1"
        );
        const atomsForDecay = activeAtoms.map(a => {
          const ageMs = Date.now() - new Date(a.created_at).getTime();
          const ageDays = ageMs / (1000 * 60 * 60 * 24);
          return { id: a.id, content: a.content, confidence: a.confidence, age_days: ageDays };
        });
        const result = await withTimeout(
          computationService.runTemplate('atom_decay_calculator', { atoms: atomsForDecay }, 'daily-intelligence'),
          COMPUTATION_TIMEOUT, 'Atom Decay'
        );
        // Apply decay results back to DB
        if (result.success && result.output && typeof result.output === 'object') {
          const decayOutput = result.output as { atoms?: Array<{ id: string; new_confidence: number; should_deactivate?: boolean }> };
          for (const atom of (decayOutput.atoms ?? [])) {
            if (atom.should_deactivate) {
              await db.run("UPDATE market_atoms SET is_active = 0, confidence = ?, updated_at = NOW() WHERE id = ?", atom.new_confidence, atom.id);
            } else {
              await db.run("UPDATE market_atoms SET confidence = ?, updated_at = NOW() WHERE id = ?", atom.new_confidence, atom.id);
            }
          }
        }
        stepResults.push({ step: 'Atom Decay', status: result.success ? 'success' : 'warning', output: result.output });
        stepsCompleted++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({ step: 'Atom Decay', status: 'skipped', error: errMsg });
        await insertDeadLetter(runId, 'Atom Decay', errMsg);
      }

      // Step 5: Signal scanner (LLM)
      try {
        const prompt = readPrompt('market-signal-scanner');
        const recentAtoms = await db.all<{ content: string; atom_type: string; category: string; sentiment: string; confidence: number }>(
          "SELECT content, atom_type, category, sentiment, confidence FROM market_atoms WHERE is_active = 1 ORDER BY created_at DESC LIMIT 40"
        );
        const context = recentAtoms.map(a => `[${a.atom_type}|${a.category}|${a.sentiment}|conf:${a.confidence}] ${a.content}`).join('\n');
        const llmResult = await withTimeout(
          callLLM(prompt, `Recent market atoms (${recentAtoms.length} signals):\n${context}`, 'think', true),
          LLM_TIMEOUT, 'Signal Scanner'
        );
        stepResults.push({ step: 'Signal Scanner', status: 'success', output: { summary: llmResult.slice(0, 500) } });
        stepsCompleted++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({ step: 'Signal Scanner', status: 'error', error: errMsg });
        await insertDeadLetter(runId, 'Signal Scanner', errMsg);
      }

      // Step 6: Compute indicators in parallel — using real price data
      try {
        // Get SPY prices for broad market indicators
        const spyPrices = await db.all<{ close: number }>(
          "SELECT close FROM market_historical_prices WHERE symbol = 'SPY' ORDER BY price_date DESC LIMIT 60"
        );
        const closePrices = spyPrices.map(p => Number(p.close)).reverse();

        // Get sector ETF prices for rotation analysis
        const sectorETFs = ['XLE', 'XLF', 'XLK', 'XLV', 'XLI'];
        const sectorSeries: Record<string, number[]> = {};
        for (const sym of sectorETFs) {
          const rows = await db.all<{ close: number }>(
            "SELECT close FROM market_historical_prices WHERE symbol = ? ORDER BY price_date DESC LIMIT 30", sym
          );
          if (rows.length > 0) sectorSeries[sym] = rows.map(r => Number(r.close)).reverse();
        }

        const results = await withTimeout(
          Promise.allSettled([
            computationService.runTemplate('moving_averages', { prices: closePrices, windows: [10, 20, 50] }, 'daily-intelligence'),
            computationService.runTemplate('momentum_indicators', { prices: closePrices }, 'daily-intelligence'),
            Object.keys(sectorSeries).length >= 2
              ? computationService.runTemplate('sector_rotation_analysis', { sectors: sectorSeries, window: 20 }, 'daily-intelligence')
              : Promise.resolve({ logId: '', success: true, output: { skipped: 'not enough sector data' }, durationMs: 0 }),
          ]),
          COMPUTATION_TIMEOUT, 'Compute Indicators'
        );
        const templateNames = ['moving_averages', 'momentum_indicators', 'sector_rotation_analysis'];
        const outputs = results.map((r, i) => ({
          template: templateNames[i],
          success: r.status === 'fulfilled' ? (r.value as { success: boolean }).success : false,
          data: r.status === 'fulfilled' ? (r.value as { output?: unknown }).output : undefined,
        }));
        stepResults.push({ step: 'Compute Indicators', status: 'success', output: outputs });
        stepsCompleted++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({ step: 'Compute Indicators', status: 'error', error: errMsg });
        await insertDeadLetter(runId, 'Compute Indicators', errMsg);
      }

      // Step 6.5: Fundamental Scoring
      try {
        const holdingSymbols = await db.all<{ symbol: string }>(
          "SELECT DISTINCT symbol FROM market_index_holdings WHERE removed_at IS NULL"
        );
        const symbols = holdingSymbols.map(h => h.symbol);
        if (symbols.length > 0) {
          const scores = await withTimeout(
            fundamentalScoringService.computeScoresForUniverse(symbols),
            COMPUTATION_TIMEOUT, 'Fundamental Scoring'
          );
          stepResults.push({ step: 'Fundamental Scoring', status: 'success', output: { scored: scores.length } });
          stepsCompleted++;
        } else {
          stepResults.push({ step: 'Fundamental Scoring', status: 'skipped', output: { reason: 'No holdings' } });
        }

        // After computing scores, extract atoms from unprocessed fundamental data
        try {
          const { createMarketAtomService } = await import('./market-atom-service.js');
          const atomSvc = await createMarketAtomService(db);
          const fundamentalRows = await db.all<{ id: string; data_type: string; symbol: string; content: string }>(
            "SELECT id, data_type, symbol, content FROM market_data_raw WHERE is_processed = 0 AND data_type IN ('income_statement', 'ratios', 'key_metrics') LIMIT 15"
          );
          let fundamentalAtoms = 0;
          for (const row of fundamentalRows) {
            try {
              const data = JSON.parse(row.content);
              const atomIds = await atomSvc.extractAtomsFromFundamentals(row.symbol, row.data_type, data);
              fundamentalAtoms += atomIds.length;
              await db.run('UPDATE market_data_raw SET is_processed = 1 WHERE id = ?', row.id);
            } catch { await db.run('UPDATE market_data_raw SET is_processed = 1 WHERE id = ?', row.id); }
          }
          // Update step output to include fundamental atoms
          const existingOutput = stepResults[stepResults.length - 1]?.output as Record<string, unknown> ?? {};
          stepResults[stepResults.length - 1] = {
            ...stepResults[stepResults.length - 1],
            output: { ...existingOutput, fundamentalAtomsCreated: fundamentalAtoms, fundamentalRowsProcessed: fundamentalRows.length },
          };
        } catch (atomErr) {
          console.warn('[market-orchestrator] Fundamental atom extraction warning:', atomErr instanceof Error ? atomErr.message : String(atomErr));
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({ step: 'Fundamental Scoring', status: 'warning', error: errMsg });
      }

      // Step 7: AI macro brief (LLM)
      try {
        const prompt = readPrompt('market-macro-brief');
        const signalSummary = stepResults.find(s => s.step === 'Signal Scanner')?.output;
        const llmResult = await withTimeout(
          callLLM(prompt, `Signal scan results:\n${JSON.stringify(signalSummary).slice(0, 4000)}`, 'think_hard', true),
          LLM_TIMEOUT, 'AI Macro Brief'
        );
        stepResults.push({ step: 'AI Macro Brief', status: 'success', output: { summary: llmResult.slice(0, 500) } });
        stepsCompleted++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({ step: 'AI Macro Brief', status: 'error', error: errMsg });
        await insertDeadLetter(runId, 'AI Macro Brief', errMsg);
      }

      // Step 8: Consul collaboration — gather perspectives from 4 consuls
      try {
        const consulNames = ['contrarian', 'macro-strategist', 'risk-assessor', 'sector-analyst'];
        const signalScanOutput = stepResults.find(s => s.step === 'Signal Scanner')?.output;
        const macroBriefOutput = stepResults.find(s => s.step === 'AI Macro Brief')?.output;

        // Build goals context if temporal service is available
        let goalsContext = '';
        if (temporalService) {
          try {
            goalsContext = await temporalService.buildGoalsValuesLayer('default', 'finance');
          } catch { /* non-fatal — goals context is optional enrichment */ }
        }

        // Include quant indicators in consul context
        const indicatorOutput = stepResults.find(s => s.step === 'Compute Indicators')?.output;
        const correlationOutput = stepResults.find(s => s.step === 'Refresh Correlation Map')?.output;

        const consulContext = JSON.stringify({
          signals: signalScanOutput,
          macroBrief: macroBriefOutput,
          quantIndicators: indicatorOutput,
          correlations: correlationOutput,
          date: new Date().toISOString().slice(0, 10),
          goalsAndValues: goalsContext || undefined,
        }).slice(0, 6000);

        const consulResults: Array<{ consul: string; status: string; summary?: string }> = [];

        for (const consul of consulNames) {
          try {
            const prompt = readPrompt(`market-consul-${consul}`);
            const llmResult = await withTimeout(
              callLLM(prompt, `Provide your perspective on today's market intelligence:\n${consulContext}`, 'think'),
              LLM_TIMEOUT, `Consul: ${consul}`
            );

            // Record consul view as a learning event
            await learningService.recordLearningEvent({
              learningType: 'consul_collaboration',
              description: `[${consul}] ${llmResult.slice(0, 500)}`,
            });

            consulResults.push({ consul, status: 'success', summary: llmResult.slice(0, 300) });
          } catch (consulErr) {
            consulResults.push({ consul, status: 'error', summary: consulErr instanceof Error ? consulErr.message : String(consulErr) });
          }
        }

        // Synthesis step: read synthesis prompt and combine consul views
        try {
          const synthesisPrompt = readPrompt('market-consul-synthesis');
          const consulSummaries = consulResults
            .filter(c => c.status === 'success')
            .map(c => `[${c.consul}]: ${c.summary}`)
            .join('\n\n');

          if (consulSummaries.length > 0) {
            const synthesisResult = await withTimeout(
              callLLM(synthesisPrompt, `Synthesize these consul perspectives:\n${consulSummaries}`, 'think_hard'),
              LLM_TIMEOUT, 'Consul Synthesis'
            );

            await learningService.recordLearningEvent({
              learningType: 'consul_synthesis',
              description: synthesisResult.slice(0, 500),
            });
          }
        } catch {
          // Synthesis is best-effort
        }

        stepResults.push({
          step: 'Consul Collaboration',
          status: consulResults.some(c => c.status === 'success') ? 'success' : 'error',
          output: { consuls: consulResults },
        });
        stepsCompleted++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({ step: 'Consul Collaboration', status: 'error', error: errMsg });
        await insertDeadLetter(runId, 'Consul Collaboration', errMsg);
      }

      // Step 9: Auto-generate theses from consul analysis
      try {
        const signalOutput = stepResults.find(s => s.step === 'Signal Scanner')?.output;
        const consulOutput = stepResults.find(s => s.step === 'Consul Collaboration')?.output as { consuls?: Array<{ consul: string; summary?: string }> } | undefined;
        const consulSummaries = consulOutput?.consuls?.filter(c => c.summary).map(c => `[${c.consul}]: ${c.summary}`).join('\n\n') ?? '';

        // Get recent atoms for context
        const topAtoms = await db.all<{ content: string; atom_type: string; category: string; sentiment: string; confidence: number }>(
          "SELECT content, atom_type, category, sentiment, confidence FROM market_atoms WHERE is_active = 1 AND confidence >= 0.7 ORDER BY created_at DESC LIMIT 20"
        );
        const atomContext = topAtoms.map(a => `[${a.atom_type}|${a.category}|${a.sentiment}|${a.confidence}] ${a.content}`).join('\n');

        // Fetch why-chain insights to avoid repeating past mistakes
        const insightsAggregator = await createWhyChainInsightsAggregator(db);
        const insights = await insightsAggregator.getInsights(30);

        // Inject quant indicators (RSI, MACD, MAs, sector rotation) into thesis context
        const indicatorStep = stepResults.find(s => s.step === 'Compute Indicators')?.output as Array<{ template: string; success: boolean; data?: unknown }> | undefined;
        const quantData = indicatorStep?.filter(o => o.success && o.data).map(o => `[${o.template}]: ${JSON.stringify(o.data).slice(0, 600)}`).join('\n') ?? '';

        // Inject correlation map data
        const correlationStep = stepResults.find(s => s.step === 'Refresh Correlation Map')?.output;
        const corrData = correlationStep ? JSON.stringify(correlationStep).slice(0, 800) : '';

        const thesisPrompt = `You are ANTON's thesis generation engine. Based on the market intelligence below, generate 2-4 investment theses.

CONSUL ANALYSIS:
${consulSummaries.slice(0, 3000)}

SIGNAL SUMMARY:
${JSON.stringify(signalOutput).slice(0, 1500)}
${insights.promptContext}

QUANTITATIVE INDICATORS:
${quantData || 'No quant data available'}

CORRELATION DATA:
${corrData || 'No correlation data available'}

HIGH-CONFIDENCE ATOMS:
${atomContext.slice(0, 2000)}

Return a JSON array of theses. Each thesis must have:
- title (string): concise thesis title
- description (string): 2-3 sentence explanation
- thesis_type (string): "investment" | "macro" | "sector" | "event" | "contrarian"
- confidence (number 0-1): how confident is this thesis
- time_horizon (string): "short" | "medium" | "long"
- success_criteria (string array): what would validate this thesis
- key_assumptions (string array): assumptions this depends on
- risk_factors (string array): what could invalidate this
- target_entities (string array): affected tickers/sectors

Also for each thesis, include a "predictions" array with 1-2 testable predictions:
- title (string): specific prediction
- description (string): what exactly will happen
- prediction_type (string): "directional" | "price_target" | "timing" | "binary"
- target_symbol (string, optional): ticker if applicable
- predicted_outcome (string): the expected outcome
- predicted_direction (string, optional): "up" | "down" | "flat"
- confidence (number 0-1): prediction confidence
- time_horizon_days (number): days until testable
- deadline (string): ISO date YYYY-MM-DD when this should be checked

TIME HORIZON RULES (CRITICAL — we grade every band, so spread deliberately):
- Three bands: TACTICAL = 1-3 days (fast feedback, specific price level or % move),
  SWING = 5-21 days (earnings windows, momentum, mean reversion),
  POSITION = 30-180 days (structural theses: AI capex, rates path, energy transition).
- Across the whole batch aim for at least 2 tactical, at least 3 swing, and 1-2 position predictions.
- For "event" theses: the deadline must match the event date (use earnings dates from context when present).
- Position predictions need concrete, checkable success criteria — not vibes.
- Include a specific price target or percentage move where possible (e.g., "SPY above 550 by date")
- Predictions must be testable with daily price data — vague directional calls are not useful
- Today is ${new Date().toISOString().split('T')[0]}

Return ONLY the JSON array, no other text.`;

        const thesisResult = await withTimeout(
          callLLM('You are an expert market thesis generator. Output only valid JSON.', thesisPrompt, 'think_hard'),
          LLM_TIMEOUT * 2, 'Auto Thesis Generation'
        );

        const cleaned = thesisResult.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
        const generatedTheses = JSON.parse(cleaned) as Array<{
          title: string; description: string; thesis_type?: string;
          confidence?: number; time_horizon?: string;
          success_criteria?: string[]; key_assumptions?: string[]; risk_factors?: string[]; target_entities?: string[];
          predictions?: Array<{
            title: string; description: string; prediction_type?: string;
            target_symbol?: string; predicted_outcome: string; predicted_direction?: string;
            confidence?: number; time_horizon_days?: number; deadline?: string;
            key_assumptions?: string[];
          }>;
        }>;

        const createdTheses: string[] = [];
        const createdPredictions: string[] = [];

        for (const t of generatedTheses.slice(0, 4)) {
          const thesisId = await thesisService.createThesis({
            title: t.title,
            description: t.description,
            thesisType: t.thesis_type ?? 'macro',
            confidence: t.confidence ?? 0.6,
            timeHorizon: t.time_horizon ?? 'medium',
            successCriteria: t.success_criteria,
            keyAssumptions: t.key_assumptions,
            riskFactors: t.risk_factors,
            targetEntities: t.target_entities,
          });
          createdTheses.push(thesisId);

          // Create predictions linked to this thesis
          for (const p of (t.predictions ?? []).slice(0, 2)) {
            // Determine horizon from time_horizon_days
            const horizonDays = p.time_horizon_days ?? 14;
            const horizon = horizonDays <= 7 ? 'this_week'
              : horizonDays <= 30 ? 'this_month'
              : horizonDays <= 365 ? 'this_year'
              : 'this_decade';

            // Step 9b: Cross-metric validation + confidence adjustment
            let effectiveConfidence = p.confidence ?? 0.5;
            let validationFlags: string[] = [];
            try {
              const { createCrossMetricValidator } = await import('./market-cross-metric-validator.js');
              const validator = await createCrossMetricValidator(db);
              const validation = await validator.validatePrediction({
                targetSymbol: p.target_symbol,
                predictedDirection: p.predicted_direction,
                confidence: effectiveConfidence,
                title: p.title,
                description: p.description ?? '',
                predictionType: p.prediction_type,
              });
              effectiveConfidence = validation.adjustedConfidence;
              validationFlags = validation.flags;
              if (validation.flags.length > 0) {
                console.log(`[orchestrator] Prediction "${p.title}" validated: coherence=${validation.coherenceScore.toFixed(2)}, confidence ${(p.confidence ?? 0.5).toFixed(2)}→${effectiveConfidence.toFixed(2)}, flags: ${validation.flags.join('; ')}`);
              }
            } catch { /* non-fatal */ }

            const predId = await thesisService.createPrediction({
              thesisId,
              title: p.title,
              description: p.description,
              predictionType: p.prediction_type ?? 'directional',
              targetSymbol: p.target_symbol,
              predictedOutcome: p.predicted_outcome,
              predictedDirection: p.predicted_direction,
              confidence: effectiveConfidence,
              timeHorizonDays: p.time_horizon_days ?? 14,
              deadline: p.deadline,
              keyAssumptions: [...(p.key_assumptions ?? []), ...(validationFlags.length ? [`[Validation: ${validationFlags.join('; ')}]`] : [])],
              horizon,
            });
            createdPredictions.push(predId);

            // Capture prediction features for conditional accuracy
            try {
              await conditionalAccuracyService.capturePredictionFeatures(predId, {
                signal_type: 'ai',
                sector: p.target_symbol ? 'equity' : 'macro',
                // Do NOT condition on predicted_direction — that is the prediction's OWN
                // output, which makes "conditional accuracy by momentum" tautological
                // (it measures "are up-predictions more accurate than down-predictions")
                // and biases the weight tuner. A genuine momentum feature needs the
                // market's price-derived momentum at prediction time; omit until that exists.
              }, false);
            } catch { /* non-fatal */ }
          }
        }

        stepResults.push({
          step: 'Auto Thesis Generation',
          status: 'success',
          output: { thesesCreated: createdTheses.length, predictionsCreated: createdPredictions.length },
        });
        stepsCompleted++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({ step: 'Auto Thesis Generation', status: 'error', error: errMsg });
        await insertDeadLetter(runId, 'Auto Thesis Generation', errMsg);
      }

      // Step 10: Pattern detection — momentum divergence, correlation breaks, regime changes
      try {
        const patternResult = await withTimeout(
          patternService.runAllDetectors(),
          COMPUTATION_TIMEOUT,
          'Pattern Detection'
        );
        stepResults.push({
          step: 'Pattern Check',
          status: 'success',
          output: {
            patternsDetected: patternResult.patternsDetected,
            patterns: patternResult.patterns.map(p => ({ type: p.type, title: p.title, severity: p.severity, confidence: p.confidence })),
            action: patternResult.patternsDetected > 3 ? 'spawn_investigation' : 'noted',
          },
        });
        stepsCompleted++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({ step: 'Pattern Check', status: 'error', error: errMsg });
        await insertDeadLetter(runId, 'Pattern Check', errMsg);
      }

      // Step 11: Prediction-driven rebalance check
      try {
        const activeIndexes = await db.all<{ id: string; name: string; last_rebalance_at: string | null }>(
          "SELECT id, name, last_rebalance_at FROM market_indexes WHERE status = 'active'"
        );

        const rebalanceActions: Array<{ indexId: string; name: string; triggered: boolean; reason: string }> = [];

        for (const idx of activeIndexes) {
          const { signals, macroAdjustment } = await rebalanceService.computePredictionSignalScores(idx.id);

          // Check trigger conditions
          const strongSignals = signals.filter(s => Math.abs(s.score) > 0.6 && s.confidence > 0.7);
          const needsRebalance = strongSignals.length > 0 || Math.abs(macroAdjustment) > 0.4;

          if (needsRebalance) {
            try {
              await runIndexRebalance(idx.id);
              rebalanceActions.push({ indexId: idx.id, name: idx.name, triggered: true, reason: `${strongSignals.length} strong signals, macro: ${macroAdjustment.toFixed(2)}` });
            } catch (rebalErr) {
              rebalanceActions.push({ indexId: idx.id, name: idx.name, triggered: false, reason: (rebalErr as Error).message });
            }
          } else {
            rebalanceActions.push({ indexId: idx.id, name: idx.name, triggered: false, reason: 'No strong signals' });
          }
        }

        stepResults.push({ step: 'Prediction Rebalance Check', status: 'success', output: { indexes: rebalanceActions } });
        stepsCompleted++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({ step: 'Prediction Rebalance Check', status: 'error', error: errMsg });
      }

      await updateRun(runId, 'completed');
      return { runId, status: 'completed', stepsCompleted, stepResults };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await updateRun(runId, 'failed', message);
      return { runId, status: 'failed', stepsCompleted, stepResults, error: message };
    }
  }

  // ── Index Rebalance Workflow ─────────────────────────────────────────────

  async function runIndexRebalance(indexId: string): Promise<WorkflowRunResult> {
    const runId = randomUUID();
    const stepResults: WorkflowRunResult['stepResults'] = [];
    let stepsCompleted = 0;

    await recordRun(runId, 'wf_markets_index_rebalance', 'running');

    try {
      // Get index info
      const index = await db.get<{ id: string; name: string; universe: string; max_holdings: number; weighting_method: string }>(
        'SELECT * FROM market_indexes WHERE id = ?', indexId
      );
      if (!index) throw new Error(`Index not found: ${indexId}`);

      let holdings: Array<{ symbol: string; weight: number; current_price: number; entry_price: number }> = [];
      let returns: number[] = [];

      // Step 1: Current portfolio metrics
      try {
        holdings = await db.all<{ symbol: string; weight: number; current_price: number; entry_price: number }>(
          'SELECT symbol, weight, current_price, entry_price FROM market_index_holdings WHERE index_id = ? AND removed_at IS NULL', indexId
        );
        returns = holdings.map(h =>
          h.entry_price > 0 ? (h.current_price - h.entry_price) / h.entry_price : 0
        );
        const result = await withTimeout(
          computationService.runTemplate('sharpe_ratio', { returns, risk_free_rate: 0.04, period: 'daily' }, 'rebalance'),
          COMPUTATION_TIMEOUT, 'Current Portfolio Metrics'
        );
        stepResults.push({ step: 'Current Portfolio Metrics', status: 'success', output: result.output });
        stepsCompleted++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({ step: 'Current Portfolio Metrics', status: 'error', error: errMsg });
        await insertDeadLetter(runId, 'Current Portfolio Metrics', errMsg);
      }

      // Step 2: Fetch universe data
      try {
        const fetchResult = await withTimeout(dataService.fetchAllSources(), FETCH_TIMEOUT, 'Fetch Universe Data');
        stepResults.push({ step: 'Fetch Universe Data', status: 'success', output: { sources: fetchResult.results.length } });
        stepsCompleted++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({ step: 'Fetch Universe Data', status: 'error', error: errMsg });
        await insertDeadLetter(runId, 'Fetch Universe Data', errMsg);
      }

      // Step 3: Screening calculations — use actual price data from holdings
      try {
        // Get price history for holdings
        const holdingSymbols = holdings.map(h => h.symbol);
        const priceData = holdingSymbols.length > 0
          ? await db.all<{ symbol: string; close: number }>(
              `SELECT symbol, close FROM market_historical_prices WHERE symbol IN (${holdingSymbols.map(() => '?').join(',')}) ORDER BY symbol, price_date DESC LIMIT ${holdingSymbols.length * 30}`,
              ...holdingSymbols
            )
          : [];
        const avgPrice = priceData.length > 0 ? priceData.reduce((s, p) => s + p.close, 0) / priceData.length : 100;
        const closePrices = priceData.filter(p => p.symbol === (holdingSymbols[0] || 'SPY')).map(p => p.close);

        const results = await withTimeout(
          Promise.allSettled([
            computationService.runTemplate('fundamental_ratios', { price: avgPrice, earnings_per_share: avgPrice * 0.04, book_value_per_share: avgPrice * 0.3 }, 'rebalance'),
            computationService.runTemplate('price_momentum', { prices: closePrices.length > 0 ? closePrices : [100], short_window: 12, long_window: 26, signal_window: 9 }, 'rebalance'),
          ]),
          COMPUTATION_TIMEOUT, 'Screening Calculations'
        );
        stepResults.push({ step: 'Screening Calculations', status: 'success', output: { completed: results.filter(r => r.status === 'fulfilled').length } });
        stepsCompleted++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({ step: 'Screening Calculations', status: 'error', error: errMsg });
        await insertDeadLetter(runId, 'Screening Calculations', errMsg);
      }

      // Step 4: Consul rebalance proposal (LLM)
      try {
        const prompt = readPrompt('market-index-composer');

        // Get current holdings
        const holdings = await db.all<{ symbol: string; weight: number; entry_price: number; current_price: number }>(
          "SELECT symbol, weight, entry_price, current_price FROM market_index_holdings WHERE index_id = ? AND removed_at IS NULL",
          indexId
        );

        // Get 30d price performance for available universe
        const pricePerf = await db.all<{ symbol: string; return_pct: number }>(
          `WITH latest AS (SELECT DISTINCT ON (symbol) symbol, close as lp FROM market_price_normalized ORDER BY symbol, price_date DESC),
                earliest AS (SELECT DISTINCT ON (symbol) symbol, close as ep FROM market_price_normalized ORDER BY symbol, price_date ASC)
           SELECT l.symbol, ROUND(((l.lp - e.ep) / e.ep * 100)::numeric, 2) as return_pct
           FROM latest l JOIN earliest e ON l.symbol = e.symbol ORDER BY return_pct DESC`
        );

        // Get relevant atoms
        const rebalanceAtoms = await db.all<{ content: string; sentiment: string; confidence: number }>(
          "SELECT content, sentiment, confidence FROM market_atoms WHERE is_active = 1 AND category = 'equity' AND confidence >= 0.7 ORDER BY created_at DESC LIMIT 15"
        );

        const context = {
          index: index.name,
          currentHoldings: holdings,
          universePerformance: pricePerf,
          relevantSignals: rebalanceAtoms,
          currentMetrics: stepResults[0]?.output,
          screening: stepResults[2]?.output,
        };
        const llmResult = await withTimeout(
          callLLM(prompt, `Generate rebalance proposal for ${index.name}:\n${JSON.stringify(context).slice(0, 6000)}`, 'think'),
          LLM_TIMEOUT * 3, 'Consul Rebalance Proposal'
        );
        stepResults.push({ step: 'Consul Rebalance Proposal', status: 'success', output: { proposal: llmResult.slice(0, 2000) } });
        stepsCompleted++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({ step: 'Consul Rebalance Proposal', status: 'error', error: errMsg });
        await insertDeadLetter(runId, 'Consul Rebalance Proposal', errMsg);
      }

      // Step 5: Risk validation — use actual portfolio returns and prices
      try {
        // Get NAV history for drawdown analysis
        const navHistory = await db.all<{ nav_value: number }>(
          "SELECT nav_value FROM market_index_nav_history WHERE index_id = ? ORDER BY nav_date DESC LIMIT 60",
          indexId
        );
        const navPrices = navHistory.map(n => Number(n.nav_value)).reverse();
        // Compute daily returns from NAV
        const dailyReturns = navPrices.length > 1
          ? navPrices.slice(1).map((p, i) => (p - navPrices[i]) / navPrices[i])
          : returns; // fall back to holdings-based returns

        const results = await withTimeout(
          Promise.allSettled([
            computationService.runTemplate('var_calculation', {
              returns: dailyReturns.length > 0 ? dailyReturns : [0],
              confidence_level: 0.95, horizon_days: 10, portfolio_value: 100000000,
            }, 'rebalance'),
            computationService.runTemplate('drawdown_analysis', {
              prices: navPrices.length > 0 ? navPrices : [100],
            }, 'rebalance'),
          ]),
          COMPUTATION_TIMEOUT, 'Risk Validation'
        );
        stepResults.push({ step: 'Risk Validation', status: 'success', output: { completed: results.filter(r => r.status === 'fulfilled').length } });
        stepsCompleted++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({ step: 'Risk Validation', status: 'error', error: errMsg });
        await insertDeadLetter(runId, 'Risk Validation', errMsg);
      }

      // Step 6: Return proposal for user review (not auto-executing)
      stepResults.push({
        step: 'Proposal Ready',
        status: 'success',
        output: {
          message: 'Rebalance proposal generated. Review and approve in the UI.',
          proposal: stepResults.find(s => s.step === 'Consul Rebalance Proposal')?.output,
          riskMetrics: stepResults.find(s => s.step === 'Risk Validation')?.output,
        },
      });
      stepsCompleted++;

      // Step 7: Auto-execute rebalance (paper trades)
      try {
        const proposal = stepResults.find(s => s.step === 'Consul Rebalance Proposal')?.output as { proposal?: string } | undefined;
        if (proposal?.proposal) {
          // Parse the consul's proposed changes from the text and apply conviction weights
          const predictionResult = await rebalanceService.computePredictionSignalScores(indexId);
          const convictionProposal = await rebalanceService.generateConvictionRebalanceProposal(indexId);

          if (convictionProposal.changes.filter(c => c.action !== 'hold').length > 0) {
            // Temporal consequence check before execution
            if (temporalService) {
              const changeDescriptions = convictionProposal.changes
                .filter((c: { action: string }) => c.action !== 'hold')
                .map((c: { action: string; symbol: string; proposedWeight: number }) => `${c.action} ${c.symbol} to ${(c.proposedWeight * 100).toFixed(1)}%`)
                .join(', ');

              const temporalCheck = await temporalService.checkTemporalConsequences(
                `Rebalance ${indexId}: ${changeDescriptions}`,
                `Index rebalance with ${convictionProposal.changes.filter((c: { action: string }) => c.action !== 'hold').length} changes`,
                'default', 'finance'
              );

              // Block on hard values violations
              if (temporalCheck.valuesViolations.length > 0) {
                stepResults.push({
                  step: 'Execute Rebalance', status: 'blocked',
                  output: { reason: 'Values constraint violated', violations: temporalCheck.valuesViolations },
                });
                stepsCompleted++;
                // Skip execution — jump to end
                await updateRun(runId, 'completed');
                return { runId, status: 'completed', stepsCompleted, stepResults };
              }

              // Log high-severity conflicts but proceed
              if (temporalCheck.conflicts.some((c: { severity: string }) => c.severity === 'high')) {
                stepResults.push({
                  step: 'Temporal Check', status: 'warning',
                  output: { conflicts: temporalCheck.conflicts, recommendation: temporalCheck.recommendation },
                });
              }
            }

            const execChanges = convictionProposal.changes
              .filter(c => c.action !== 'hold')
              .map(c => ({ symbol: c.symbol, action: c.action, newWeight: c.proposedWeight }));
            await rebalanceService.executeRebalance(indexId, { changes: execChanges });
            stepResults.push({
              step: 'Execute Rebalance', status: 'success',
              output: {
                tradesExecuted: convictionProposal.changes.filter(c => c.action !== 'hold').length,
                predictionSignals: predictionResult.signals.length,
                changes: convictionProposal.changes,
              },
            });
          } else {
            stepResults.push({ step: 'Execute Rebalance', status: 'success', output: { message: 'No actionable changes' } });
          }
          stepsCompleted++;
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({ step: 'Execute Rebalance', status: 'error', error: errMsg });
      }

      await updateRun(runId, 'completed');
      return { runId, status: 'completed', stepsCompleted, stepResults };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await updateRun(runId, 'failed', message);
      return { runId, status: 'failed', stepsCompleted, stepResults, error: message };
    }
  }

  // ── Prediction Validation Workflow ────────────────────────────────────────

  /**
   * Create an investigation + why-chain for each validated prediction whose
   * outcome contradicts its stated confidence.
   *
   * Extracted from runPredictionValidation Step 9 so the daily sweep and the
   * weekly workflow share one implementation — the gate below is subtle enough
   * that a second copy would drift. Pure DB work: both creators are idempotent
   * on their trigger key, so re-running costs a lookup per validated
   * prediction and never a duplicate.
   */
  async function dispatchAnomalyInvestigations(): Promise<{
    dispatched: Array<{ predictionId: string; type: string; investigationId: string; whyChainId: string }>;
  }> {
    const validatedPredictions = await db.all<{
      id: string; confidence: number; was_correct: number;
      brier_score: number | null; prediction_type: string;
    }>(
      "SELECT id, confidence, was_correct, brier_score, prediction_type FROM market_predictions WHERE status = 'validated'"
    );

    const dispatched: Array<{ predictionId: string; type: string; investigationId: string; whyChainId: string }> = [];

        for (const pred of validatedPredictions) {
          const conf = Number(pred.confidence) || 0;
          const brier = pred.brier_score == null ? null : Number(pred.brier_score);

          // The original gates were absolute: conf > 0.7 wrong, or conf < 0.4
          // right. The three-band pulse prompt caps confidence at 0.40-0.75 and
          // steers tactical calls into the LOWER half, so live predictions sit
          // around 0.52-0.60 — neither gate can ever fire, and auto-dispatch
          // went silent without anything reporting a fault.
          //
          // Brier measures the same thing without depending on the generator's
          // range: it is the squared gap between stated confidence and what
          // actually happened. ANOMALY_BRIER is 0.25, the score a pure coin
          // flip stated at 0.50 earns — worse than that means the confidence
          // was actively misleading, which is precisely the "unexplained
          // win/loss" this step exists to investigate. The absolute gates are
          // kept so a future, more confident generator still triggers.
          const ANOMALY_BRIER = 0.25;
          const surprising = brier != null && brier >= ANOMALY_BRIER;
          const highConfWrong = (conf > 0.7 || surprising) && pred.was_correct === 0;
          const lowConfRight = (conf < 0.4 || surprising) && pred.was_correct === 1;

          if (highConfWrong || lowConfRight) {
            const anomalyType = highConfWrong ? 'unexpected_failure' : 'unexpected_success';
            const brierNote = brier == null ? '' : `, brier=${brier.toFixed(2)}`;
            const anomalyLabel = highConfWrong
              ? `Prediction failed against its stated confidence (conf=${conf.toFixed(2)}${brierNote})`
              : `Prediction succeeded against its stated confidence (conf=${conf.toFixed(2)}${brierNote})`;

            // Create investigation
            const invId = await investigationService.createInvestigation({
              triggerType: anomalyType,
              triggerReference: pred.id,
              title: `Auto-investigation: ${anomalyLabel}`,
              question: highConfWrong
                ? `Why did prediction ${pred.id} (type=${pred.prediction_type}, confidence=${conf.toFixed(2)}) fail despite high confidence?`
                : `Why did prediction ${pred.id} (type=${pred.prediction_type}, confidence=${conf.toFixed(2)}) succeed despite low confidence?`,
              assignedConsul: 'risk-assessor',
            });

            // Create why chain linked to prediction and investigation
            const chainId = await whyChainsService.createChain({
              title: `Why-chain: ${anomalyLabel}`,
              investigationId: invId,
              predictionId: pred.id,
              direction: highConfWrong ? 'failure_analysis' : 'success_analysis',
            });

            dispatched.push({ predictionId: pred.id, type: anomalyType, investigationId: invId, whyChainId: chainId });
          }
        }
    return { dispatched };
  }

  /**
   * Daily investigate leg: dispatch anomalies, then work the why-chain queue.
   *
   * Previously both steps lived only inside runPredictionValidation, which runs
   * Saturdays — so a missed Saturday cost a week, and the chain queue drained
   * at 10/run/week. Splitting the cadence lets the free half run every day
   * while the paid half stays opt-in.
   *
   * `allowLLM: false` still dispatches and still reaps stalled chains (both
   * free), and simply leaves fresh chains pending for a run that may spend.
   */
  async function runInvestigationSweep(options?: { allowLLM?: boolean }): Promise<{
    dispatched: number; chainsExecuted: number; chainsReaped: number; llmSkipped: boolean;
  }> {
    const allowLLM = options?.allowLLM !== false;
    let dispatched = 0;
    try {
      dispatched = (await dispatchAnomalyInvestigations()).dispatched.length;
    } catch (err) {
      console.error('[investigation-sweep] dispatch failed:', err instanceof Error ? err.message : err);
    }

    let chainsExecuted = 0;
    let chainsReaped = 0;
    try {
      const { createWhyChainExecutor } = await import('./market-why-chain-executor.js');
      const executor = await createWhyChainExecutor(db);
      if (allowLLM) {
        const r = await executor.executeAllPending();
        chainsExecuted = r.executed;
        chainsReaped = r.reaped;
      } else {
        // Reaping reads levels already on disk — no model call, so it runs
        // regardless of the spending tier.
        const r = await executor.reapStalledChains();
        chainsReaped = r.reaped;
      }
    } catch (err) {
      console.error('[investigation-sweep] why-chain leg failed:', err instanceof Error ? err.message : err);
    }

    return { dispatched, chainsExecuted, chainsReaped, llmSkipped: !allowLLM };
  }

  async function runPredictionValidation(): Promise<WorkflowRunResult> {
    const runId = randomUUID();
    const stepResults: WorkflowRunResult['stepResults'] = [];
    let stepsCompleted = 0;

    await recordRun(runId, 'wf_markets_prediction_validation', 'running');

    try {
      // Step 1: Fetch outcome data
      try {
        const fetchResult = await withTimeout(dataService.fetchAllSources(), FETCH_TIMEOUT, 'Fetch Outcome Data');
        stepResults.push({ step: 'Fetch Outcome Data', status: 'success', output: { sources: fetchResult.results.length } });
        stepsCompleted++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({ step: 'Fetch Outcome Data', status: 'error', error: errMsg });
        await insertDeadLetter(runId, 'Fetch Outcome Data', errMsg);
      }

      // Step 1.5: Auto-verify expired predictions against actual market data
      try {
        const { createPredictionVerifier } = await import('./market-prediction-verifier.js');
        const verifier = await createPredictionVerifier(db);
        const verifyResult = await verifier.runAutoVerification();
        stepResults.push({
          step: 'Auto-Verify Expired Predictions',
          status: 'success',
          output: {
            verified: verifyResult.verified,
            correct: verifyResult.correct,
            incorrect: verifyResult.incorrect,
            unverifiable: verifyResult.unverifiable,
          },
        });
        stepsCompleted++;
      } catch (err) {
        stepResults.push({
          step: 'Auto-Verify Expired Predictions',
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Step 2: Prediction accuracy stats — query validated predictions from DB
      let validatedPredictions: Array<{ id: string; confidence: number; was_correct: number; brier_score: number | null; prediction_type: string }> = [];
      try {
        validatedPredictions = await db.all<{ id: string; confidence: number; was_correct: number; brier_score: number | null; prediction_type: string }>(
          "SELECT id, confidence, was_correct, brier_score, prediction_type FROM market_predictions WHERE status = 'validated'"
        );
        const predictionsForStats = validatedPredictions.map(p => ({
          id: p.id, confidence: p.confidence, was_correct: p.was_correct === 1,
          brier_score: p.brier_score, prediction_type: p.prediction_type,
        }));
        const result = await withTimeout(
          computationService.runTemplate('prediction_accuracy_stats', { predictions: predictionsForStats }, 'prediction-validation'),
          COMPUTATION_TIMEOUT, 'Prediction Accuracy Stats'
        );
        stepResults.push({ step: 'Prediction Accuracy Stats', status: result.success ? 'success' : 'warning', output: result.output });
        stepsCompleted++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({ step: 'Prediction Accuracy Stats', status: 'skipped', error: errMsg });
        await insertDeadLetter(runId, 'Prediction Accuracy Stats', errMsg);
      }

      // Step 3: Confidence calibration — use same validated predictions
      try {
        const predictionsForCalib = validatedPredictions.map(p => ({
          id: p.id, confidence: p.confidence, was_correct: p.was_correct === 1,
        }));
        const result = await withTimeout(
          computationService.runTemplate('confidence_calibration', { predictions: predictionsForCalib, n_bins: 10 }, 'prediction-validation'),
          COMPUTATION_TIMEOUT, 'Confidence Calibration'
        );
        stepResults.push({ step: 'Confidence Calibration', status: result.success ? 'success' : 'warning', output: result.output });
        stepsCompleted++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({ step: 'Confidence Calibration', status: 'skipped', error: errMsg });
        await insertDeadLetter(runId, 'Confidence Calibration', errMsg);
      }

      // Step 4: 5-Whys analysis (LLM)
      try {
        const prompt = readPrompt('market-investigation');
        const accuracyOutput = stepResults.find(s => s.step === 'Prediction Accuracy Stats')?.output;
        const llmResult = await withTimeout(
          callLLM(prompt, `Analyze prediction failures using 5-Whys methodology:\n${JSON.stringify(accuracyOutput).slice(0, 4000)}`, 'think_hard'),
          LLM_TIMEOUT, '5-Whys Analysis'
        );
        stepResults.push({ step: '5-Whys Analysis', status: 'success', output: { analysis: llmResult.slice(0, 500) } });
        stepsCompleted++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({ step: '5-Whys Analysis', status: 'error', error: errMsg });
        await insertDeadLetter(runId, '5-Whys Analysis', errMsg);
      }

      // Step 5: Signal weight optimizer — build per-signal-type outcomes from predictions + linked atoms
      // Now enhanced with why-chain root cause awareness
      try {
        // Get existing signal weights
        const existingWeights = await db.all<{ signal_type: string; weight: number }>(
          "SELECT signal_type, weight FROM market_signal_weights"
        );
        const weightMap = new Map(existingWeights.map(w => [w.signal_type, w.weight]));

        // For each validated prediction, find which atom types (signals) were linked via thesis
        const predWithSignals = await db.all<{
          prediction_id: string; confidence: number; was_correct: number; atom_type: string;
        }>(`
          SELECT mp.id as prediction_id, mp.confidence, mp.was_correct, ma.atom_type
          FROM market_predictions mp
          JOIN market_thesis_atoms mta ON mta.thesis_id = mp.thesis_id
          JOIN market_atoms ma ON ma.id = mta.atom_id
          WHERE mp.status = 'validated' AND mp.was_correct IS NOT NULL
          LIMIT 2000
        `);

        // Group by atom_type → build signal outcomes
        const signalMap = new Map<string, Array<{ predicted: number; actual: number }>>();
        for (const row of predWithSignals) {
          if (!signalMap.has(row.atom_type)) signalMap.set(row.atom_type, []);
          signalMap.get(row.atom_type)!.push({
            predicted: row.confidence,
            actual: row.was_correct === 1 ? 1 : 0,
          });
        }

        // If no thesis-atom links exist, fall back to a simpler per-type grouping
        if (signalMap.size === 0) {
          for (const pred of validatedPredictions) {
            const signalType = pred.prediction_type || 'directional';
            if (!signalMap.has(signalType)) signalMap.set(signalType, []);
            signalMap.get(signalType)!.push({
              predicted: pred.confidence,
              actual: pred.was_correct === 1 ? 1 : 0,
            });
          }
        }

        const signalData = Array.from(signalMap.entries()).map(([signalType, outcomes]) => ({
          signal_type: signalType,
          weight: weightMap.get(signalType) ?? 1.0,
          outcomes,
        }));

        const result = await withTimeout(
          computationService.runTemplate('signal_weight_optimizer', { signals: signalData }, 'prediction-validation'),
          COMPUTATION_TIMEOUT, 'Signal Weight Optimizer'
        );

        // Persist optimized weights back to market_signal_weights table
        if (result.success && result.output) {
          try {
            const output = result.output as { optimized_weights?: Record<string, number> };
            if (output.optimized_weights) {
              for (const [signalType, newWeight] of Object.entries(output.optimized_weights)) {
                await db.run(`
                  INSERT INTO market_signal_weights (signal_type, category, weight, last_calibrated_at, updated_at)
                  VALUES (?, 'general', ?, NOW(), NOW())
                  ON CONFLICT (signal_type, category) DO UPDATE SET
                    weight = EXCLUDED.weight, last_calibrated_at = NOW(), updated_at = NOW()
                `, signalType, newWeight);
              }
            }
          } catch { /* non-fatal — weight persistence is best-effort */ }
        }

        // Apply why-chain root cause adjustments on top of computed weights
        try {
          const insightsAgg = await createWhyChainInsightsAggregator(db);
          const whyInsights = await insightsAgg.getInsights(30);
          for (const adj of whyInsights.signalAdjustments) {
            await db.run(`
              UPDATE market_signal_weights SET weight = GREATEST(0.3, weight * ?)
              WHERE signal_type = ? AND updated_at < NOW() - INTERVAL '1 day'
            `, adj.reliabilityMultiplier, adj.signalType);
          }
          if (whyInsights.signalAdjustments.length > 0) {
            console.log(`[prediction-validation] Applied ${whyInsights.signalAdjustments.length} why-chain signal adjustments`);
          }
        } catch { /* non-fatal */ }

        stepResults.push({ step: 'Signal Weight Optimizer', status: result.success ? 'success' : 'warning', output: result.output });
        stepsCompleted++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({ step: 'Signal Weight Optimizer', status: 'skipped', error: errMsg });
        await insertDeadLetter(runId, 'Signal Weight Optimizer', errMsg);
      }

      // Step 5.5: Apply signal calibration to thesis confidence
      try {
        // Update thesis confidence from validated predictions
        const activeTheses = await db.all<{ id: string }>(
          "SELECT id FROM market_theses WHERE status IN ('active', 'monitoring')"
        );
        let thesesUpdated = 0;
        for (const t of activeTheses) {
          try {
            await thesisService.updateThesisConfidenceFromPredictions(t.id);
            thesesUpdated++;
          } catch { /* skip individual failures */ }
        }
        stepResults.push({ step: 'Signal Calibration', status: 'success', output: { thesesUpdated } });
        stepsCompleted++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({ step: 'Signal Calibration', status: 'error', error: errMsg });
      }

      // Step 5.6: Temporal Learning — create calibration atoms from validated predictions
      if (temporalService) {
        try {
          const validatedPreds = await db.all<{ id: string }>(
            "SELECT id FROM market_predictions WHERE status = 'validated' AND validated_at > NOW() - INTERVAL '7 days'"
          );
          let patternsCreated = 0;
          for (const pred of validatedPreds.slice(0, 20)) {
            const atomId = await temporalService.processTemporalLearning(pred.id);
            if (atomId) patternsCreated++;
          }
          stepResults.push({ step: 'Temporal Learning', status: 'success', output: { patternsCreated } });
          stepsCompleted++;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          stepResults.push({ step: 'Temporal Learning', status: 'error', error: errMsg });
        }
      }

      // Step 5.7: Conditional Accuracy Update
      try {
        const recentValidated = await db.all<{ id: string; was_correct: number; brier_score: number }>(
          "SELECT id, was_correct, brier_score FROM market_predictions WHERE status = 'validated' AND validated_at > NOW() - INTERVAL '7 days'"
        );
        let updated = 0;
        for (const pred of recentValidated) {
          try {
            await conditionalAccuracyService.updateConditionalAccuracy(
              pred.id, pred.was_correct === 1, Number(pred.brier_score) || 0, false
            );
            updated++;
          } catch { /* skip individual failures */ }
        }
        stepResults.push({ step: 'Conditional Accuracy Update', status: 'success', output: { updated } });
        stepsCompleted++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({ step: 'Conditional Accuracy Update', status: 'error', error: errMsg });
      }

      // Step 6: Learning summary (LLM)
      try {
        const prompt = readPrompt('market-prediction-review');
        const allOutputs = stepResults.map(s => ({ step: s.step, status: s.status }));
        const llmResult = await withTimeout(
          callLLM(prompt, `Generate learning summary from prediction validation:\n${JSON.stringify(allOutputs).slice(0, 4000)}`, 'think_hard'),
          LLM_TIMEOUT, 'Learning Summary'
        );
        stepResults.push({ step: 'Learning Summary', status: 'success', output: { summary: llmResult.slice(0, 500) } });
        stepsCompleted++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({ step: 'Learning Summary', status: 'error', error: errMsg });
        await insertDeadLetter(runId, 'Learning Summary', errMsg);
      }

      // Step 7: Atom confidence adjustments — query active atoms with age
      try {
        const activeAtoms = await db.all<{ id: string; content: string; confidence: number; created_at: string }>(
          "SELECT id, content, confidence, created_at FROM market_atoms WHERE is_active = 1"
        );
        const atomsForDecay = activeAtoms.map(a => {
          const ageMs = Date.now() - new Date(a.created_at).getTime();
          const ageDays = ageMs / (1000 * 60 * 60 * 24);
          return { id: a.id, content: a.content, confidence: a.confidence, age_days: ageDays };
        });
        const result = await withTimeout(
          computationService.runTemplate('atom_decay_calculator', { atoms: atomsForDecay }, 'prediction-validation'),
          COMPUTATION_TIMEOUT, 'Atom Confidence Adjustments'
        );
        // Apply decay results back to DB
        if (result.success && result.output && typeof result.output === 'object') {
          const decayOutput = result.output as { atoms?: Array<{ id: string; new_confidence: number; should_deactivate?: boolean }> };
          for (const atom of (decayOutput.atoms ?? [])) {
            if (atom.should_deactivate) {
              await db.run("UPDATE market_atoms SET is_active = 0, confidence = ?, updated_at = NOW() WHERE id = ?", atom.new_confidence, atom.id);
            } else {
              await db.run("UPDATE market_atoms SET confidence = ?, updated_at = NOW() WHERE id = ?", atom.new_confidence, atom.id);
            }
          }
        }
        stepResults.push({ step: 'Atom Confidence Adjustments', status: result.success ? 'success' : 'warning', output: result.output });
        stepsCompleted++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({ step: 'Atom Confidence Adjustments', status: 'skipped', error: errMsg });
        await insertDeadLetter(runId, 'Atom Confidence Adjustments', errMsg);
      }

      // Step 8: Blind spot check
      const blindSpotsFound = stepResults.filter(s => s.status === 'warning' || s.status === 'error').length;
      stepResults.push({
        step: 'Blind Spot Check',
        status: 'success',
        output: {
          blindSpotsFound,
          action: blindSpotsFound > 0 ? 'spawn_investigation' : 'complete',
        },
      });
      stepsCompleted++;

      // Step 9: Auto-dispatch investigations for unexplained wins/losses
      try {
        const { dispatched } = await dispatchAnomalyInvestigations();
        stepResults.push({
          step: 'Auto-Dispatch Investigations',
          status: 'success',
          output: { dispatched: dispatched.length, details: dispatched },
        });
        stepsCompleted++;
      } catch (err) {
        stepResults.push({
          step: 'Auto-Dispatch Investigations',
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Step 10: Execute pending why-chains (AI "5 Whys" root cause analysis)
      try {
        const { createWhyChainExecutor } = await import('./market-why-chain-executor.js');
        const executor = await createWhyChainExecutor(db);
        const whyResult = await executor.executeAllPending();
        stepResults.push({
          step: 'Why-Chain Root Cause Analysis',
          status: 'success',
          output: {
            executed: whyResult.executed,
            rootCausesFound: whyResult.results.filter(r => r.summary.includes('Root cause')).length,
            summaries: whyResult.results.map(r => r.summary),
          },
        });
        stepsCompleted++;
      } catch (err) {
        stepResults.push({
          step: 'Why-Chain Root Cause Analysis',
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }

      await updateRun(runId, 'completed');
      return { runId, status: 'completed', stepsCompleted, stepResults };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await updateRun(runId, 'failed', message);
      return { runId, status: 'failed', stepsCompleted, stepResults, error: message };
    }
  }

  // ── Weekly Pulse: Short-term directional predictions for fast learning ─────

  async function runWeeklyPulse(): Promise<{
    runId: string;
    status: string;
    stepsCompleted: string[];
    stepResults: Record<string, unknown>;
    error?: string;
  }> {
    const runId = `wfrun_pulse_${Date.now()}`;
    const stepsCompleted: string[] = [];
    const stepResults: Record<string, unknown> = {};

    try {
      await recordRun(runId, 'wf_markets_weekly_pulse', 'running');

      // 1. Load the pulse prompt
      const __pulseDir = path.dirname(fileURLToPath(import.meta.url));
      const promptPath = path.join(__pulseDir, '..', 'prompts', 'market-weekly-pulse.md');
      const pulseSystemPrompt = fs.existsSync(promptPath)
        ? fs.readFileSync(promptPath, 'utf-8')
        : 'You are a short-term market pulse analyst. Generate 10-15 directional predictions on liquid ETFs with 7-14 day deadlines. Return a JSON array.';

      stepsCompleted.push('prompt_loaded');

      // 2. Gather context: recent atoms + track record
      const recentAtoms = await db.all(`
        SELECT content, atom_type, category, sentiment, confidence
        FROM market_atoms
        WHERE created_at >= NOW() - INTERVAL '3 days' AND is_active = 1
        ORDER BY importance_score DESC NULLS LAST
        LIMIT 30
      `) as Array<{ content: string; atom_type: string; category: string; sentiment: string; confidence: number }>;

      const trackRecord = await db.all(`
        SELECT LEFT(title, 60) as title, target_symbol, predicted_direction, confidence,
               was_correct, brier_score, actual_outcome
        FROM market_predictions
        WHERE status = 'validated' AND validated_at IS NOT NULL
        ORDER BY validated_at DESC
        LIMIT 20
      `) as Array<Record<string, unknown>>;

      const atomContext = recentAtoms.map(a => `[${a.atom_type}|${a.category}|${a.sentiment}|${a.confidence}] ${a.content}`).join('\n');
      const trackContext = trackRecord.length > 0
        ? `\n\nYOUR TRACK RECORD (last ${trackRecord.length} predictions):\n` +
          trackRecord.map(t => `${t.target_symbol || '?'} ${t.predicted_direction || '?'} conf=${t.confidence} → ${t.was_correct ? 'CORRECT' : 'WRONG'} (brier=${t.brier_score})`).join('\n') +
          `\nOverall accuracy: ${trackRecord.filter(t => t.was_correct).length}/${trackRecord.length} = ${Math.round(trackRecord.filter(t => t.was_correct).length / trackRecord.length * 100)}%`
        : '';

      // Fetch why-chain insights for learning loop
      const insightsAggregator = await createWhyChainInsightsAggregator(db);
      const pulseInsights = await insightsAggregator.getInsights(30);

      // Fetch latest quant indicators for pulse context
      let quantContext = '';
      try {
        const spyPrices = await db.all<{ close: number }>(
          "SELECT close FROM market_historical_prices WHERE symbol = 'SPY' ORDER BY price_date DESC LIMIT 30"
        );
        if (spyPrices.length >= 14) {
          const closes = spyPrices.map(p => Number(p.close)).reverse();
          const momResult = await computationService.runTemplate('momentum_indicators', { prices: closes }, 'weekly-pulse');
          if (momResult.success && momResult.output) {
            const mo = momResult.output as Record<string, unknown>;
            quantContext = `\nQUANTITATIVE INDICATORS (SPY):\n- RSI(14): ${(mo as { rsi?: number }).rsi?.toFixed(1) ?? 'N/A'}\n- MACD: ${JSON.stringify((mo as { macd?: unknown }).macd).slice(0, 200)}\n`;
          }
        }
      } catch { /* non-fatal — quant context is enrichment */ }

      const today = new Date().toISOString().split('T')[0];
      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];

      const userMessage = `Today is ${dayName}, ${today}.

RECENT MARKET INTELLIGENCE (${recentAtoms.length} atoms):
${atomContext.slice(0, 3000)}
${trackContext}
${pulseInsights.promptContext}
${quantContext}

Generate 8-12 directional predictions on liquid ETFs spread across THREE horizon bands (this mix is mandatory):
- 3-4 TACTICAL: time_horizon_days 1-3 (next-session moves, event reactions)
- 4-5 SWING: time_horizon_days 7-21 (earnings windows, rotation, mean reversion)
- 2-3 POSITION: time_horizon_days 30-90 (structural trends: rates path, AI capex, energy cycle)
FEWER predictions with HIGHER conviction. Only predict when evidence is strong.
Today is ${new Date().toISOString().split('T')[0]}.
Include a specific price target or percentage move where possible (e.g., "SPY above 550").

Return ONLY a JSON array.`;

      stepsCompleted.push('context_gathered');

      // 3. Call LLM with web search for real-time data
      const llmResult = await withTimeout(
        callLLM(pulseSystemPrompt, userMessage, 'think', true),
        LLM_TIMEOUT * 2, 'Weekly Pulse Generation'
      );

      stepsCompleted.push('llm_complete');

      // 4. Parse and create predictions
      let cleaned = llmResult.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
      if (cleaned.startsWith('[') && !cleaned.endsWith(']')) {
        const lastBrace = cleaned.lastIndexOf('}');
        if (lastBrace > 0) cleaned = cleaned.slice(0, lastBrace + 1) + ']';
      }

      const predictions = JSON.parse(cleaned) as Array<Record<string, unknown>>;

      // Debug: log first prediction's fields to understand LLM output format
      if (predictions.length > 0) {
        console.log(`[weekly-pulse] Sample prediction fields: ${Object.keys(predictions[0]).join(', ')}`);
        console.log(`[weekly-pulse] Sample:`, JSON.stringify(predictions[0]).slice(0, 300));
      }

      let created = 0;
      let skipped = 0;
      for (const p of predictions) {
        // Flexible field mapping — LLMs return varying field names
        const symbol = (p.target_symbol || p.symbol || p.ticker || '') as string;
        let direction = (p.predicted_direction || p.direction || '') as string;
        const desc = (p.description || p.rationale || p.reasoning || '') as string;
        const title = (p.title || p.name || (symbol && direction ? `${symbol} ${direction} — ${desc.slice(0, 60)}` : '')) as string;
        const conf = Number(p.confidence || 0.55);
        const horizon = Number(p.time_horizon_days || p.horizon_days || p.days || 10);
        const assumptions = Array.isArray(p.key_assumptions) ? p.key_assumptions as string[] : [];

        // Normalize direction values (LLMs may return bullish/bearish/sideways)
        if (['bullish', 'positive', 'higher', 'long'].includes(direction.toLowerCase())) direction = 'up';
        else if (['bearish', 'negative', 'lower', 'short'].includes(direction.toLowerCase())) direction = 'down';
        else if (['sideways', 'range', 'neutral', 'range-bound'].includes(direction.toLowerCase())) direction = 'flat';

        if (!title || !symbol || !direction || direction === 'undefined') {
          skipped++;
          console.log(`[weekly-pulse] Skipped: "${(title || 'untitled').slice(0, 40)}" — symbol=${symbol || 'NONE'} direction=${direction || 'NONE'} | fields: ${Object.keys(p).join(',')}`);
          continue;
        }

        // Bands: tactical 1-3d / swing 5-21d / position 30-90d (pulse caps at 90).
        const horizonDays = Math.max(1, Math.min(90, horizon));
        const deadlineDate = new Date(Date.now() + horizonDays * 86400000).toISOString().split('T')[0];
        const clampedConf = Math.max(0.3, Math.min(0.8, conf));

        try {
          await thesisService.createPrediction({
            title,
            description: desc,
            predictionType: 'directional',
            targetSymbol: symbol,
            predictedOutcome: `${symbol} moves ${direction} within ${horizonDays} days`,
            predictedDirection: direction,
            confidence: clampedConf,
            timeHorizonDays: horizonDays,
            deadline: deadlineDate,
            keyAssumptions: [...assumptions, '[source:weekly_pulse]'],
            horizon: horizonDays <= 7 ? 'this_week' : horizonDays <= 30 ? 'this_month' : 'this_year',
          });
          created++;
        } catch (err) {
          console.warn(`[weekly-pulse] Failed to create prediction "${title}":`, (err as Error).message);
        }
      }

      stepResults.predictions_created = created;
      stepResults.predictions_parsed = predictions.length;
      stepResults.predictions_skipped = skipped;
      // Include sample for debugging
      if (predictions.length > 0 && created === 0) {
        stepResults.debug_sample = predictions[0];
        stepResults.debug_fields = Object.keys(predictions[0]);
      }
      stepsCompleted.push('predictions_created');

      console.log(`[weekly-pulse] Created ${created}/${predictions.length} predictions across tactical/swing/position horizons`);

      await recordRun(runId, 'wf_markets_weekly_pulse', 'completed');
      return { runId, status: 'completed', stepsCompleted, stepResults };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[weekly-pulse] Failed:', message);
      try { await recordRun(runId, 'wf_markets_weekly_pulse', 'failed', message); } catch { /* ignore */ }
      return { runId, status: 'failed', stepsCompleted, stepResults, error: message };
    }
  }

  // ── Mid-flight prediction checkpoints ─────────────────────────────────
  // Checks active predictions daily against current prices.
  // Logs whether the price is moving in the predicted direction.
  // Creates learning atoms from interim observations before deadline.

  async function runPredictionCheckpoints(): Promise<{ checked: number; onTrack: number; offTrack: number; atomsCreated: number }> {
    const activePredictions = await db.all<{
      id: string; title: string; target_symbol: string; predicted_direction: string;
      confidence: number; predicted_value: number | null; created_at: string;
      deadline: string | null; thesis_id: string | null;
    }>(`
      SELECT id, title, target_symbol, predicted_direction, confidence, predicted_value,
             created_at, deadline, thesis_id
      FROM market_predictions
      WHERE status = 'active' AND target_symbol IS NOT NULL AND target_symbol != ''
      ORDER BY created_at DESC LIMIT 50
    `);

    let checked = 0, onTrack = 0, offTrack = 0, atomsCreated = 0;

    for (const pred of activePredictions) {
      try {
        // Get current price and price at prediction creation
        const currentPrice = await db.get<{ close: number }>(
          'SELECT close FROM market_historical_prices WHERE symbol = ? ORDER BY price_date DESC LIMIT 1',
          pred.target_symbol
        );
        const startPrice = await db.get<{ close: number }>(
          'SELECT close FROM market_historical_prices WHERE symbol = ? AND price_date <= ?::date ORDER BY price_date DESC LIMIT 1',
          pred.target_symbol, pred.created_at
        );

        if (!currentPrice || !startPrice) continue;

        const pctChange = ((currentPrice.close - startPrice.close) / startPrice.close) * 100;
        const directionCorrect = (pred.predicted_direction === 'up' && pctChange > 0) ||
                                  (pred.predicted_direction === 'down' && pctChange < 0);

        checked++;
        if (directionCorrect) onTrack++; else offTrack++;

        // Create an interim observation atom (cheap — no LLM call)
        const observation = `[Checkpoint] ${pred.target_symbol} ${pred.predicted_direction}: ${pctChange > 0 ? '+' : ''}${pctChange.toFixed(2)}% since prediction. ${directionCorrect ? 'ON TRACK' : 'OFF TRACK'}. Confidence: ${pred.confidence}`;

        await db.run(`
          INSERT INTO market_prediction_feedback (prediction_id, feedback_type, predicted_value, actual_value,
                                                   accuracy_score, explanation)
          VALUES (?, 'checkpoint', ?, ?, ?, ?)
        `, pred.id, startPrice.close, currentPrice.close,
           directionCorrect ? 0.7 : 0.3,
           `Mid-flight check: ${pctChange > 0 ? '+' : ''}${pctChange.toFixed(2)}% move. ${directionCorrect ? 'Direction correct so far.' : 'Moving against prediction.'}`);

        atomsCreated++;

        // If significantly off track (>3% wrong direction), reduce thesis confidence early
        if (!directionCorrect && Math.abs(pctChange) > 3 && pred.thesis_id) {
          const thesis = await db.get<{ confidence: number }>('SELECT confidence FROM market_theses WHERE id = ?', pred.thesis_id);
          if (thesis) {
            const newConf = Math.max(0.1, thesis.confidence * 0.9); // 10% confidence reduction
            await db.run('UPDATE market_theses SET confidence = ?, updated_at = NOW() WHERE id = ?', newConf, pred.thesis_id);
          }
        }
      } catch { /* skip individual failures */ }
    }

    if (checked > 0) {
      console.log(`[prediction-checkpoints] Checked ${checked}: ${onTrack} on track, ${offTrack} off track, ${atomsCreated} observations logged`);
    }

    return { checked, onTrack, offTrack, atomsCreated };
  }

  return {
    runDailyIntelligence,
    runIndexRebalance,
    runPredictionValidation,
    runInvestigationSweep,
    dispatchAnomalyInvestigations,
    runWeeklyPulse,
    runPredictionCheckpoints,
  };
}

export type MarketWorkflowOrchestrator = Awaited<ReturnType<typeof createMarketWorkflowOrchestrator>>;
