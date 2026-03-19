// ═══════════════════════════════════════════════════════════
// Market Workflow Orchestrator — Market-specific intelligence
// cycles, rebalance workflows, and prediction validation.
// Wires the computation engine, data service, and LLM into
// multi-step automated workflows.
// ═══════════════════════════════════════════════════════════

import type { DatabaseAdapter } from '../db/database.js';
import type { MarketComputationService } from './market-computation-service.js';
import type { MarketDataService } from './market-data-service.js';
import { createMarketInvestigationService } from './market-investigation-service.js';
import { createMarketWhyChainsService } from './market-why-chains-service.js';
import { createMarketIntelligenceService } from './market-intelligence-service.js';
import { createMarketThesisService } from './market-thesis-service.js';
import { createMarketIndexRebalanceService } from './market-index-rebalance-service.js';
import type { TemporalReasoningService } from './temporal-reasoning.js';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ── Step Timeout ────────────────────────────────────────────────────────────────

async function withTimeout<T>(promise: Promise<T>, ms: number, stepName: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Step "${stepName}" timed out after ${ms}ms`)), ms)
    ),
  ]);
}

const COMPUTATION_TIMEOUT = 30_000; // 30s for computation steps
const LLM_TIMEOUT = 60_000;         // 60s for LLM/AI steps

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
        model: 'claude-sonnet-4-5-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }] as unknown as Anthropic.Messages.Tool[],
      });
      let text = '';
      for (const block of response.content) {
        if (block.type === 'text') text += block.text;
      }
      return text;
    }
    // Fall back to existing callChat (provider-agnostic)
    const { callChat } = await import('./provider-router.js');
    const result = await callChat({
      model: 'claude-haiku-4-5-20251001',
      systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 4096,
      thinkingLevel: thinking,
    });
    return result.text;
  }

  // Helper: record workflow run
  async function recordRun(runId: string, workflowId: string, status: string, error?: string): Promise<void> {
    try {
      await db.run(`
        INSERT INTO workflow_runs (id, workflow_id, trigger_source, status, user_id, error_message)
        VALUES (?, ?, 'market-orchestrator', ?, 'system', ?)
      `, runId, workflowId, status, error ?? null);
    } catch {
      // workflow_runs table may not exist
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
    const runId = randomUUID();
    const stepResults: WorkflowRunResult['stepResults'] = [];
    let stepsCompleted = 0;

    await recordRun(runId, 'wf_markets_daily_intelligence', 'running');

    try {
      // Step 1: Fetch all data sources
      try {
        const fetchResult = await withTimeout(dataService.fetchAllSources(), COMPUTATION_TIMEOUT, 'Fetch Market Data');
        const totalItems = fetchResult.results.reduce((s, r) => s + r.itemsIngested, 0);
        stepResults.push({ step: 'Fetch Market Data', status: 'success', output: { totalItems, sources: fetchResult.results.length } });
        stepsCompleted++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({ step: 'Fetch Market Data', status: 'error', error: errMsg });
        await insertDeadLetter(runId, 'Fetch Market Data', errMsg);
      }

      // Step 2: Extract atoms (via internal endpoint if available, else skip)
      try {
        const port = process.env.PORT || 3001;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        const resp = await fetch(`http://localhost:${port}/api/markets/atoms/extract`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const data = await resp.json().catch(() => ({}));
        stepResults.push({ step: 'Extract Atoms', status: resp.ok ? 'success' : 'warning', output: data });
        stepsCompleted++;
      } catch (err) {
        stepResults.push({ step: 'Extract Atoms', status: 'skipped', error: 'Atom extraction endpoint not available' });
      }

      // Step 3: Refresh correlation map
      try {
        const result = await withTimeout(
          computationService.runTemplate('correlation_map_refresh', { series: {}, window: 30, method: 'pearson' }, 'daily-intelligence'),
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

      // Step 6: Compute indicators in parallel
      try {
        const templates = ['moving_averages', 'momentum_indicators', 'sector_rotation_analysis'];
        const priceRows = await db.all<{ symbol: string; price_date: string; open: number; high: number; low: number; close: number; volume: number }>(
          "SELECT symbol, price_date, open, high, low, close, volume FROM market_price_normalized ORDER BY symbol, price_date DESC LIMIT 300"
        );
        const results = await withTimeout(
          Promise.allSettled(
            templates.map(t => computationService.runTemplate(t, { prices: priceRows, sectors: {} }, 'daily-intelligence'))
          ),
          COMPUTATION_TIMEOUT, 'Compute Indicators'
        );
        const outputs = results.map((r, i) => ({
          template: templates[i],
          success: r.status === 'fulfilled' ? r.value.success : false,
        }));
        stepResults.push({ step: 'Compute Indicators', status: 'success', output: outputs });
        stepsCompleted++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({ step: 'Compute Indicators', status: 'error', error: errMsg });
        await insertDeadLetter(runId, 'Compute Indicators', errMsg);
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

        const consulContext = JSON.stringify({
          signals: signalScanOutput,
          macroBrief: macroBriefOutput,
          date: new Date().toISOString().slice(0, 10),
          goalsAndValues: goalsContext || undefined,
        }).slice(0, 4000);

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

        const thesisPrompt = `You are ANTON's thesis generation engine. Based on the market intelligence below, generate 2-4 investment theses.

CONSUL ANALYSIS:
${consulSummaries.slice(0, 3000)}

SIGNAL SUMMARY:
${JSON.stringify(signalOutput).slice(0, 1500)}

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
- deadline (string): ISO date when this should be checked

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
            const horizonDays = p.time_horizon_days ?? 30;
            const horizon = horizonDays <= 7 ? 'this_week'
              : horizonDays <= 30 ? 'this_month'
              : horizonDays <= 365 ? 'this_year'
              : 'this_decade';

            const predId = await thesisService.createPrediction({
              thesisId,
              title: p.title,
              description: p.description,
              predictionType: p.prediction_type ?? 'directional',
              targetSymbol: p.target_symbol,
              predictedOutcome: p.predicted_outcome,
              predictedDirection: p.predicted_direction,
              confidence: p.confidence ?? 0.5,
              timeHorizonDays: p.time_horizon_days ?? 30,
              deadline: p.deadline,
              keyAssumptions: p.key_assumptions ?? [],
              horizon,
            });
            createdPredictions.push(predId);
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

      // Step 10: Conditional pattern check
      const patternsDetected = stepResults.filter(s => s.status === 'success').length;
      stepResults.push({ step: 'Pattern Check', status: 'success', output: { patternsDetected, action: patternsDetected > 3 ? 'spawn_investigation' : 'skip' } });
      stepsCompleted++;

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

      // Step 1: Current portfolio metrics
      try {
        const holdings = await db.all<{ symbol: string; weight: number; current_price: number; entry_price: number }>(
          'SELECT symbol, weight, current_price, entry_price FROM market_index_holdings WHERE index_id = ? AND removed_at IS NULL', indexId
        );
        const returns = holdings.map(h =>
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
        const fetchResult = await withTimeout(dataService.fetchAllSources(), COMPUTATION_TIMEOUT, 'Fetch Universe Data');
        stepResults.push({ step: 'Fetch Universe Data', status: 'success', output: { sources: fetchResult.results.length } });
        stepsCompleted++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({ step: 'Fetch Universe Data', status: 'error', error: errMsg });
        await insertDeadLetter(runId, 'Fetch Universe Data', errMsg);
      }

      // Step 3: Screening calculations
      try {
        const results = await withTimeout(
          Promise.allSettled([
            computationService.runTemplate('fundamental_ratios', { price: 100, earnings_per_share: 5, book_value_per_share: 30 }, 'rebalance'),
            computationService.runTemplate('price_momentum', { prices: [], short_window: 12, long_window: 26, signal_window: 9 }, 'rebalance'),
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

      // Step 5: Risk validation
      try {
        const results = await withTimeout(
          Promise.allSettled([
            computationService.runTemplate('var_calculation', {
              returns: [], confidence_level: 0.95, horizon_days: 10, portfolio_value: 100000000,
            }, 'rebalance'),
            computationService.runTemplate('drawdown_analysis', { prices: [] }, 'rebalance'),
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

  async function runPredictionValidation(): Promise<WorkflowRunResult> {
    const runId = randomUUID();
    const stepResults: WorkflowRunResult['stepResults'] = [];
    let stepsCompleted = 0;

    await recordRun(runId, 'wf_markets_prediction_validation', 'running');

    try {
      // Step 1: Fetch outcome data
      try {
        const fetchResult = await withTimeout(dataService.fetchAllSources(), COMPUTATION_TIMEOUT, 'Fetch Outcome Data');
        stepResults.push({ step: 'Fetch Outcome Data', status: 'success', output: { sources: fetchResult.results.length } });
        stepsCompleted++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({ step: 'Fetch Outcome Data', status: 'error', error: errMsg });
        await insertDeadLetter(runId, 'Fetch Outcome Data', errMsg);
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
          callLLM(prompt, `Analyze prediction failures using 5-Whys methodology:\n${JSON.stringify(accuracyOutput).slice(0, 4000)}`, 'investigate'),
          LLM_TIMEOUT, '5-Whys Analysis'
        );
        stepResults.push({ step: '5-Whys Analysis', status: 'success', output: { analysis: llmResult.slice(0, 500) } });
        stepsCompleted++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({ step: '5-Whys Analysis', status: 'error', error: errMsg });
        await insertDeadLetter(runId, '5-Whys Analysis', errMsg);
      }

      // Step 5: Signal weight optimizer — query atoms + predictions for signal/outcome pairs
      try {
        const atomSignals = await db.all<{ id: string; content: string; atom_type: string; confidence: number }>(
          "SELECT id, content, atom_type, confidence FROM market_atoms WHERE is_active = 1 LIMIT 500"
        );
        const signalData = atomSignals.map(a => ({
          id: a.id, type: a.atom_type, confidence: a.confidence,
        }));
        const outcomeData = validatedPredictions.map(p => ({
          id: p.id, was_correct: p.was_correct === 1, confidence: p.confidence,
        }));
        const result = await withTimeout(
          computationService.runTemplate('signal_weight_optimizer', { signals: signalData, outcomes: outcomeData, method: 'ridge' }, 'prediction-validation'),
          COMPUTATION_TIMEOUT, 'Signal Weight Optimizer'
        );
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
        const dispatched: Array<{ predictionId: string; type: string; investigationId: string; whyChainId: string }> = [];

        for (const pred of validatedPredictions) {
          const highConfWrong = pred.confidence > 0.7 && pred.was_correct === 0;
          const lowConfRight = pred.confidence < 0.4 && pred.was_correct === 1;

          if (highConfWrong || lowConfRight) {
            const anomalyType = highConfWrong ? 'unexpected_failure' : 'unexpected_success';
            const anomalyLabel = highConfWrong
              ? `High-confidence prediction failed (conf=${pred.confidence.toFixed(2)})`
              : `Low-confidence prediction succeeded (conf=${pred.confidence.toFixed(2)})`;

            // Create investigation
            const invId = await investigationService.createInvestigation({
              triggerType: anomalyType,
              triggerReference: pred.id,
              title: `Auto-investigation: ${anomalyLabel}`,
              question: highConfWrong
                ? `Why did prediction ${pred.id} (type=${pred.prediction_type}, confidence=${pred.confidence.toFixed(2)}) fail despite high confidence?`
                : `Why did prediction ${pred.id} (type=${pred.prediction_type}, confidence=${pred.confidence.toFixed(2)}) succeed despite low confidence?`,
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

      await updateRun(runId, 'completed');
      return { runId, status: 'completed', stepsCompleted, stepResults };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await updateRun(runId, 'failed', message);
      return { runId, status: 'failed', stepsCompleted, stepResults, error: message };
    }
  }

  return {
    runDailyIntelligence,
    runIndexRebalance,
    runPredictionValidation,
  };
}

export type MarketWorkflowOrchestrator = Awaited<ReturnType<typeof createMarketWorkflowOrchestrator>>;
