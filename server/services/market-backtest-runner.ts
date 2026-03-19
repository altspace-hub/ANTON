// Market Backtest Runner — historical simulation with full intelligence pipeline:
// atoms, theses, predictions, validation, signal weight calibration, NAV tracking.
import type { DatabaseAdapter } from '../db/database.js';

interface BacktestConfig {
  name: string; startDate: string; endDate: string;
  universe: string[]; initialCapital: number;
  strategy: {
    rebalanceFrequency: 'daily' | 'weekly' | 'monthly';
    maxHoldings: number; weightingMethod: 'equal' | 'conviction';
    aiMode?: 'fast' | 'standard' | 'full';
    useAI?: boolean; thinkingLevel?: string;
  };
}
interface BacktestResult {
  backtestId: string; status: 'completed' | 'failed';
  totalDays: number; completedDays: number; finalNav: number;
  totalReturn: number; annualizedReturn: number; sharpeRatio: number;
  maxDrawdown: number; totalPredictions: number; correctPredictions: number;
  predictionAccuracy: number; benchmarkReturn: number; benchmarkSharpe: number;
  alpha: number; error?: string;
}
interface PriceAtom {
  content: string; atomType: string; category: string;
  sentiment: string; confidence: number; importance: number; symbol: string;
}

const US_HOLIDAYS = new Set([
  '2024-01-01','2024-01-15','2024-02-19','2024-03-29','2024-05-27','2024-06-19','2024-07-04','2024-09-02','2024-11-28','2024-12-25',
  '2025-01-01','2025-01-20','2025-02-17','2025-04-18','2025-05-26','2025-06-19','2025-07-04','2025-09-01','2025-11-27','2025-12-25',
  '2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25',
]);

function isTradingDay(d: string): boolean {
  const day = new Date(d).getDay();
  return day !== 0 && day !== 6 && !US_HOLIDAYS.has(d);
}
function getTradingDays(start: string, end: string): string[] {
  const days: string[] = [], cur = new Date(start), e = new Date(end);
  while (cur <= e) { const s = cur.toISOString().slice(0, 10); if (isTradingDay(s)) days.push(s); cur.setDate(cur.getDate() + 1); }
  return days;
}
function resolveAiMode(s: BacktestConfig['strategy']): 'fast' | 'standard' | 'full' {
  if (s.aiMode) return s.aiMode;
  return s.useAI ? 'standard' : 'fast';
}

function generatePriceAtoms(universe: string[], priceMap: Map<string, number>, prevPriceMap: Map<string, number>): PriceAtom[] {
  const atoms: PriceAtom[] = [];
  for (const symbol of universe) {
    const price = priceMap.get(symbol), prev = prevPriceMap.get(symbol);
    if (!price || !prev || prev === 0) continue;
    const pct = (price - prev) / prev, abs = Math.abs(pct);
    if (abs < 0.003) continue;
    const sentiment = pct > 0 ? 'bullish' : 'bearish', dir = pct > 0 ? 'up' : 'down';
    let atomType = 'fact', importance = 45, confidence = 0.85;
    if (abs > 0.05) { atomType = 'event'; importance = 80; confidence = 0.95; }
    else if (abs > 0.02) { atomType = 'signal'; importance = 60; confidence = 0.9; }
    atoms.push({ content: `${symbol} ${dir} ${(abs*100).toFixed(1)}% to $${price.toFixed(2)}`, atomType, category: 'equity', sentiment, confidence, importance, symbol });
  }
  return atoms;
}

export async function createMarketBacktestRunner(db: DatabaseAdapter) {

  async function downloadHistoricalData(universe: string[], startDate: string, endDate: string): Promise<number> {
    const { createMarketDataService } = await import('./market-data-service.js');
    return await (await createMarketDataService(db)).fetchHistoricalRange(universe, startDate, endDate);
  }

  async function createBacktest(config: BacktestConfig): Promise<string> {
    const id = `bt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tradingDays = getTradingDays(config.startDate, config.endDate);
    await db.run(
      `INSERT INTO market_backtests (id,name,description,strategy_config,start_date,end_date,status,universe,initial_capital,total_trading_days)
       VALUES (?,?,?,?,?,?,'pending',?,?,?)`,
      id, config.name, `Backtest: ${config.universe.length} symbols, ${config.startDate} to ${config.endDate}`,
      JSON.stringify(config.strategy), config.startDate, config.endDate,
      JSON.stringify(config.universe), config.initialCapital, tradingDays.length);
    return id;
  }

  async function generateRuleBasedPredictions(
    backtestId: string, simDate: string, tradingDays: string[], dayNumber: number,
    _universe: string[], recentAtoms: PriceAtom[], signalWeights: Map<string, number>
  ): Promise<{ predictions: number; theses: number }> {
    let predictions = 0, theses = 0;
    const sigs = new Map<string, { bullish: number; bearish: number; count: number }>();
    for (const a of recentAtoms) {
      if (!a.symbol) continue;
      const s = sigs.get(a.symbol) ?? { bullish: 0, bearish: 0, count: 0 };
      const w = signalWeights.get(`${a.atomType}:${a.category}`) ?? 1.0;
      if (a.sentiment === 'bullish') s.bullish += a.confidence * w * (a.importance / 50);
      else if (a.sentiment === 'bearish') s.bearish += a.confidence * w * (a.importance / 50);
      s.count++; sigs.set(a.symbol, s);
    }
    for (const [symbol, s] of sigs) {
      if (s.count < 2) continue;
      const net = (s.bullish - s.bearish) / s.count;
      if (Math.abs(net) < 0.3) continue;
      const dir = net > 0 ? 'up' : 'down', conf = Math.min(0.9, 0.4 + Math.abs(net) * 0.3);
      const deadIdx = Math.min(dayNumber + 4, tradingDays.length - 1);
      const thId = `btth_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await db.run(`INSERT INTO market_backtest_theses (id,backtest_id,sim_date_created,title,thesis_type,confidence,status) VALUES (?,?,?,?,'investment',?,'active')`,
        thId, backtestId, simDate, `${symbol} ${dir} momentum (${s.count} signals)`, conf);
      theses++;
      const pId = `btpr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await db.run(`INSERT INTO market_backtest_predictions (id,backtest_id,sim_date_created,sim_date_deadline,title,prediction_type,target_symbol,predicted_direction,confidence,status,thesis_id,signal_source) VALUES (?,?,?,?,?,'directional',?,?,?,'active',?,'rule')`,
        pId, backtestId, simDate, tradingDays[deadIdx], `${symbol} will go ${dir} in 5 days`, symbol, dir, conf, thId);
      predictions++;
    }
    return { predictions, theses };
  }

  async function generateAIPredictions(
    backtestId: string, simDate: string, tradingDays: string[], dayNumber: number,
    recentAtoms: PriceAtom[], _signalWeights: Map<string, number>,
    aiMode: string
  ): Promise<{ predictions: number; theses: number }> {
    const atomContext = recentAtoms.slice(-30).map(a => `[${a.atomType}|${a.category}|${a.sentiment}|imp:${a.importance}] ${a.content}`).join('\n');

    type GeneratedThesis = { title: string; description?: string; thesis_type?: string; confidence?: number; predictions?: Array<{ title?: string; target_symbol?: string; predicted_direction?: string; confidence?: number; time_horizon_days?: number }> };

    let generated: GeneratedThesis[] | null = null;

    // In full mode, use Claude with web search for historical news context
    if (aiMode === 'full') {
      try {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const response = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2048,
          system: 'You are an investment analyst. Search for what happened in markets on the given date, then generate investment theses with testable predictions. Output only valid JSON.',
          messages: [{ role: 'user', content: `Today is ${simDate}. Search for stock market news and events from this date.

Based on what you find AND these price movements:
${atomContext.slice(0, 2000)}

Generate 2-4 investment theses. Return JSON array: [{"title":"...","description":"...","thesis_type":"investment|macro|sector","confidence":0.5-0.9,"predictions":[{"title":"...","target_symbol":"...","predicted_direction":"up|down","confidence":0.4-0.9,"time_horizon_days":5}]}]
Return ONLY the JSON array.` }],
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }] as unknown as Anthropic.Messages.Tool[],
        });

        let text = '';
        for (const block of response.content) {
          if (block.type === 'text') text += block.text;
        }
        const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
        generated = JSON.parse(cleaned) as GeneratedThesis[];
        // Small delay after web search to avoid rate limiting
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        console.error('[backtest] Web search prediction failed, falling back to standard:', err);
        // Fall through to standard callChat below
      }
    }

    // Standard mode (or full mode fallback)
    if (!generated) {
      const prompt = `Based on these market signals from the last week, generate 2-3 investment theses with testable predictions.\n\nSIGNALS:\n${atomContext.slice(0, 3000)}\n\nReturn JSON array: [{"title":"...","description":"...","thesis_type":"investment|macro|sector","confidence":0.5-0.9,"predictions":[{"title":"...","target_symbol":"...","predicted_direction":"up|down","confidence":0.4-0.9,"time_horizon_days":5}]}]\nReturn ONLY the JSON array.`;
      try {
        const { callChat } = await import('./provider-router.js');
        const result = await callChat({
          model: 'claude-haiku-4-5-20251001',
          system: 'You are an investment analyst generating testable predictions from market signals. Output only valid JSON.',
          messages: [{ role: 'user', content: prompt }], maxTokens: 2048,
        });
        const cleaned = result.text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
        generated = JSON.parse(cleaned) as GeneratedThesis[];
      } catch (err) {
        console.error('[backtest] AI prediction generation failed:', err);
        return { predictions: 0, theses: 0 };
      }
    }

    // Persist theses and predictions
    try {
      let predictions = 0, theses = 0;
      const signalSource = aiMode === 'full' ? 'ai-websearch' : 'ai';
      for (const t of generated.slice(0, aiMode === 'full' ? 4 : 3)) {
        const thId = `btth_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        await db.run(`INSERT INTO market_backtest_theses (id,backtest_id,sim_date_created,title,description,thesis_type,confidence,status) VALUES (?,?,?,?,?,?,?,'active')`,
          thId, backtestId, simDate, t.title, t.description ?? '', t.thesis_type ?? 'investment', t.confidence ?? 0.6);
        theses++;
        for (const p of (t.predictions ?? []).slice(0, 2)) {
          const dIdx = Math.min(dayNumber + (p.time_horizon_days ?? 5) - 1, tradingDays.length - 1);
          const pId = `btpr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          await db.run(`INSERT INTO market_backtest_predictions (id,backtest_id,sim_date_created,sim_date_deadline,title,prediction_type,target_symbol,predicted_direction,confidence,status,thesis_id,signal_source) VALUES (?,?,?,?,?,'directional',?,?,?,'active',?,?)`,
            pId, backtestId, simDate, tradingDays[dIdx], p.title ?? `${p.target_symbol} ${p.predicted_direction}`,
            p.target_symbol ?? null, p.predicted_direction ?? null, p.confidence ?? 0.5, thId, signalSource);
          predictions++;
        }
      }
      return { predictions, theses };
    } catch (err) {
      console.error('[backtest] AI prediction persistence failed:', err);
      return { predictions: 0, theses: 0 };
    }
  }

  async function validatePredictions(backtestId: string, simDate: string, priceMap: Map<string, number>): Promise<{ validated: number; correct: number }> {
    const due = await db.all<{ id: string; target_symbol: string; predicted_direction: string; confidence: number; sim_date_created: string }>(
      `SELECT id,target_symbol,predicted_direction,confidence,sim_date_created FROM market_backtest_predictions WHERE backtest_id=? AND status='active' AND sim_date_deadline<=?`, backtestId, simDate);
    let validated = 0, correct = 0;
    for (const p of due) {
      const actual = priceMap.get(p.target_symbol);
      if (!actual) continue;
      const created = await db.get<{ close: number }>('SELECT close FROM market_historical_prices WHERE symbol=? AND price_date=?', p.target_symbol, p.sim_date_created);
      if (!created) continue;
      const dir = Number(actual) > Number(created.close) ? 'up' : 'down';
      const ok = dir === p.predicted_direction ? 1 : 0;
      await db.run(`UPDATE market_backtest_predictions SET status='validated',actual_value=?,was_correct=?,brier_score=?,validated_at_sim_date=? WHERE id=?`,
        actual, ok, Math.pow(p.confidence - ok, 2), simDate, p.id);
      // Close thesis if all predictions resolved
      const rem = await db.get<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM market_backtest_predictions WHERE thesis_id=(SELECT thesis_id FROM market_backtest_predictions WHERE id=?) AND status='active'`, p.id);
      if (rem && Number(rem.cnt) === 0) await db.run(`UPDATE market_backtest_theses SET status='resolved' WHERE id=(SELECT thesis_id FROM market_backtest_predictions WHERE id=?)`, p.id);
      validated++; if (ok) correct++;
    }
    return { validated, correct };
  }

  async function updateSignalWeights(backtestId: string, simDate: string): Promise<void> {
    const stats = await db.all<{ signal_source: string; total: number; correct: number }>(
      `SELECT signal_source, COUNT(*) as total, SUM(CASE WHEN was_correct=1 THEN 1 ELSE 0 END) as correct FROM market_backtest_predictions WHERE backtest_id=? AND status='validated' AND signal_source IS NOT NULL GROUP BY signal_source`, backtestId);
    for (const r of stats) {
      const acc = Number(r.total) > 0 ? Number(r.correct) / Number(r.total) : 0.5;
      const w = Math.max(0.5, Math.min(2.0, 0.5 + acc * 1.5));
      await db.run(`INSERT INTO market_backtest_signal_weights (backtest_id,signal_type,category,weight,sample_size,accuracy,last_updated_sim_date) VALUES (?,?,'general',?,?,?,?) ON CONFLICT (backtest_id,signal_type,category) DO UPDATE SET weight=EXCLUDED.weight,sample_size=EXCLUDED.sample_size,accuracy=EXCLUDED.accuracy,last_updated_sim_date=EXCLUDED.last_updated_sim_date`,
        backtestId, r.signal_source, w, Number(r.total), acc, simDate);
    }
  }

  async function loadSignalWeights(backtestId: string): Promise<Map<string, number>> {
    const rows = await db.all<{ signal_type: string; category: string; weight: number }>('SELECT signal_type,category,weight FROM market_backtest_signal_weights WHERE backtest_id=?', backtestId);
    const m = new Map<string, number>();
    for (const r of rows) m.set(`${r.signal_type}:${r.category}`, Number(r.weight));
    return m;
  }

  function computeConvictionWeights(
    universe: string[], preds: Array<{ target_symbol: string; predicted_direction: string; confidence: number }>,
    sw: Map<string, number>
  ): Record<string, number> {
    const w: Record<string, number> = {}, base = 1.0 / universe.length;
    for (const s of universe) w[s] = base;
    for (const p of preds) {
      if (!p.target_symbol || !w[p.target_symbol]) continue;
      const adj = p.confidence * (sw.get('rule:general') ?? 1.0) * 0.15;
      w[p.target_symbol] = p.predicted_direction === 'up' ? w[p.target_symbol] + adj : Math.max(0.02, w[p.target_symbol] - adj);
    }
    let tot = Object.values(w).reduce((s, v) => s + v, 0);
    if (tot > 0) { for (const k of Object.keys(w)) w[k] = Math.max(0.02, Math.min(0.15, w[k] / tot)); }
    tot = Object.values(w).reduce((s, v) => s + v, 0);
    if (tot > 0) for (const k of Object.keys(w)) w[k] /= tot;
    return w;
  }

  // ── Main simulation ──────────────────────────────────────────────────────
  async function runBacktest(backtestId: string): Promise<BacktestResult> {
    const bt = await db.get<{ id: string; name: string; start_date: string; end_date: string; strategy_config: string; universe: string; initial_capital: number; total_trading_days: number }>(
      'SELECT * FROM market_backtests WHERE id=?', backtestId);
    if (!bt) throw new Error(`Backtest not found: ${backtestId}`);
    const config: BacktestConfig['strategy'] = JSON.parse(bt.strategy_config);
    const universe: string[] = JSON.parse(bt.universe);
    const tradingDays = getTradingDays(bt.start_date, bt.end_date);
    const aiMode = resolveAiMode(config);
    await db.run("UPDATE market_backtests SET status='running' WHERE id=?", backtestId);

    let nav = bt.initial_capital, peakNav = nav, maxDrawdown = 0, dayNumber = 0;
    let totalPreds = 0, correctPreds = 0, lastRebalanceDay = 0;
    let holdings: Record<string, { shares: number; weight: number; entryPrice: number }> = {};
    const navHistory: Array<{ date: string; nav: number; dailyReturn: number }> = [];
    let prevPriceMap = new Map<string, number>();
    const recentAtoms: PriceAtom[] = [];
    const initW = 1.0 / universe.length;
    // R1: Buy-and-hold benchmark
    let benchmarkHoldings: Record<string, number> = {};
    let benchmarkNav = bt.initial_capital;
    let benchmarkPeakNav = bt.initial_capital;
    const benchmarkNavHistory: Array<{ date: string; nav: number; dailyReturn: number }> = [];
    // R2: Drawdown circuit breaker
    let cashBalance = 0;
    let circuitBreakerLevel: 'none' | 'tier1' | 'tier2' = 'none';

    try {
      for (const simDate of tradingDays) {
        dayNumber++;
        const prevNav = nav;
        // Step 1: Load prices
        const ph = universe.map(() => '?').join(',');
        const prices = await db.all<{ symbol: string; close: number }>(`SELECT symbol,close FROM market_historical_prices WHERE price_date=? AND symbol IN (${ph})`, simDate, ...universe);
        const priceMap = new Map(prices.map(p => [p.symbol, Number(p.close)]));
        if (priceMap.size === 0) continue;
        // Step 2: Init holdings or calc NAV
        if (Object.keys(holdings).length === 0) {
          const per = nav * initW;
          for (const s of universe) { const px = priceMap.get(s); if (px && px > 0) holdings[s] = { shares: per / px, weight: initW, entryPrice: px }; }
          // R1: Initialize benchmark buy-and-hold (equal-weight, never rebalanced)
          const perStock = bt.initial_capital / universe.length;
          for (const symbol of universe) {
            const price = priceMap.get(symbol);
            if (price && price > 0) benchmarkHoldings[symbol] = perStock / price;
          }
        }
        // R2: NAV includes cash from circuit breaker
        nav = cashBalance;
        for (const [s, h] of Object.entries(holdings)) nav += h.shares * (priceMap.get(s) ?? h.entryPrice);
        // Step 3: Generate atoms (rolling 7-day window)
        if (prevPriceMap.size > 0) { recentAtoms.push(...generatePriceAtoms(universe, priceMap, prevPriceMap)); while (recentAtoms.length > 35) recentAtoms.shift(); }
        prevPriceMap = priceMap;
        // Step 4: Generate predictions
        let predsMade = 0, thesesCreated = 0;
        const sw = await loadSignalWeights(backtestId);
        if (dayNumber > 5 && dayNumber % 5 === 1 && recentAtoms.length >= 3) {
          const r = await generateRuleBasedPredictions(backtestId, simDate, tradingDays, dayNumber, universe, recentAtoms, sw);
          predsMade += r.predictions; thesesCreated += r.theses; totalPreds += r.predictions;
        }
        const runAI = (aiMode === 'standard' && dayNumber % 10 === 1 && dayNumber > 5) || (aiMode === 'full' && dayNumber % 5 === 3 && dayNumber > 5);
        if (runAI && recentAtoms.length >= 5) {
          const r = await generateAIPredictions(backtestId, simDate, tradingDays, dayNumber, recentAtoms, sw, aiMode);
          predsMade += r.predictions; thesesCreated += r.theses; totalPreds += r.predictions;
        }
        // Step 5: Validate overdue predictions
        const val = await validatePredictions(backtestId, simDate, priceMap);
        correctPreds += val.correct;
        // Step 6: Calibrate signal weights every 5 days
        if (dayNumber % 5 === 0 && dayNumber > 10) {
          const vc = await db.get<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM market_backtest_predictions WHERE backtest_id=? AND status='validated'`, backtestId);
          if (vc && Number(vc.cnt) >= 5) await updateSignalWeights(backtestId, simDate);
        }
        // Step 7: Track drawdown
        if (nav > peakNav) peakNav = nav;
        const drawdown = peakNav > 0 ? (peakNav - nav) / peakNav : 0;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        const dailyRet = prevNav > 0 ? (nav - prevNav) / prevNav : 0;
        const cumRet = bt.initial_capital > 0 ? (nav - bt.initial_capital) / bt.initial_capital : 0;
        navHistory.push({ date: simDate, nav, dailyReturn: dailyRet });
        // R1: Benchmark NAV (buy-and-hold, no rebalancing)
        const prevBenchmarkNav = benchmarkNav;
        benchmarkNav = 0;
        for (const [sym, shares] of Object.entries(benchmarkHoldings)) {
          benchmarkNav += shares * (priceMap.get(sym) ?? 0);
        }
        if (benchmarkNav > benchmarkPeakNav) benchmarkPeakNav = benchmarkNav;
        const benchmarkDailyReturn = prevBenchmarkNav > 0 ? (benchmarkNav - prevBenchmarkNav) / prevBenchmarkNav : 0;
        benchmarkNavHistory.push({ date: simDate, nav: benchmarkNav, dailyReturn: benchmarkDailyReturn });
        // R2: Circuit breaker check
        const prevLevel = circuitBreakerLevel;
        if (drawdown >= 0.25 && circuitBreakerLevel !== 'tier2') {
          const targetCash = 0.80;
          const sellFraction = targetCash - (cashBalance / (nav > 0 ? nav : 1));
          if (sellFraction > 0) {
            for (const [sym, h] of Object.entries(holdings)) {
              const price = priceMap.get(sym) ?? h.entryPrice;
              const sellShares = h.shares * sellFraction;
              cashBalance += sellShares * price;
              h.shares -= sellShares;
            }
          }
          circuitBreakerLevel = 'tier2';
        } else if (drawdown >= 0.15 && circuitBreakerLevel === 'none') {
          const targetCash = 0.50;
          for (const [sym, h] of Object.entries(holdings)) {
            const price = priceMap.get(sym) ?? h.entryPrice;
            const sellShares = h.shares * targetCash;
            cashBalance += sellShares * price;
            h.shares -= sellShares;
          }
          circuitBreakerLevel = 'tier1';
        } else if (drawdown < 0.10 && circuitBreakerLevel !== 'none') {
          const totalHoldingValue = Object.entries(holdings).reduce((s, [sym, h]) => s + h.shares * (priceMap.get(sym) ?? h.entryPrice), 0);
          const totalValue = totalHoldingValue + cashBalance;
          const weight = 1.0 / Object.keys(holdings).length;
          for (const [sym, h] of Object.entries(holdings)) {
            const price = priceMap.get(sym) ?? h.entryPrice;
            if (price > 0) h.shares = (totalValue * weight) / price;
          }
          cashBalance = 0;
          circuitBreakerLevel = 'none';
        }
        if (prevLevel !== circuitBreakerLevel) {
          console.log(`[backtest] Circuit breaker: ${prevLevel} → ${circuitBreakerLevel} (drawdown: ${(drawdown * 100).toFixed(1)}%)`);
        }
        // Recalculate NAV after circuit breaker adjustments
        nav = cashBalance;
        for (const [s, h] of Object.entries(holdings)) nav += h.shares * (priceMap.get(s) ?? h.entryPrice);
        // Step 8: Rebalance
        let rebalanced = false;
        const shouldReb = config.rebalanceFrequency === 'daily' || (config.rebalanceFrequency === 'weekly' && dayNumber - lastRebalanceDay >= 5) || (config.rebalanceFrequency === 'monthly' && dayNumber - lastRebalanceDay >= 21);
        if (shouldReb && dayNumber > 1) {
          let tw: Record<string, number>;
          if (config.weightingMethod === 'conviction') {
            const ap = await db.all<{ target_symbol: string; predicted_direction: string; confidence: number }>(
              `SELECT target_symbol,predicted_direction,confidence FROM market_backtest_predictions WHERE backtest_id=? AND status='active' AND target_symbol IS NOT NULL`, backtestId);
            tw = computeConvictionWeights(universe, ap, sw);
          } else {
            const avail = universe.filter(s => (priceMap.get(s) ?? 0) > 0);
            const eq = avail.length > 0 ? 1.0 / avail.length : 0;
            tw = {}; for (const s of avail) tw[s] = eq;
          }
          const equityPortion = nav - cashBalance; // Only rebalance the equity portion
          for (const [s, w] of Object.entries(tw)) { const px = priceMap.get(s); if (px && px > 0) holdings[s] = { shares: (equityPortion * w) / px, weight: w, entryPrice: px }; }
          lastRebalanceDay = dayNumber; rebalanced = true;
          nav = cashBalance; for (const [s, h] of Object.entries(holdings)) nav += h.shares * (priceMap.get(s) ?? h.entryPrice);
        }
        // Step 9: Record daily snapshot
        const cashAllocation = cashBalance / (nav > 0 ? nav : 1);
        await db.run(
          `INSERT INTO market_backtest_days (backtest_id,sim_date,day_number,nav,daily_return,cumulative_return,holdings,atoms_created,theses_active,predictions_made,predictions_validated,predictions_correct,rebalance_executed,benchmark_nav,benchmark_daily_return,cash_allocation,circuit_breaker_level) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT (backtest_id,sim_date) DO UPDATE SET nav=EXCLUDED.nav,daily_return=EXCLUDED.daily_return,cumulative_return=EXCLUDED.cumulative_return,holdings=EXCLUDED.holdings,atoms_created=EXCLUDED.atoms_created,theses_active=EXCLUDED.theses_active,predictions_made=EXCLUDED.predictions_made,benchmark_nav=EXCLUDED.benchmark_nav,benchmark_daily_return=EXCLUDED.benchmark_daily_return,cash_allocation=EXCLUDED.cash_allocation,circuit_breaker_level=EXCLUDED.circuit_breaker_level`,
          backtestId, simDate, dayNumber, nav, dailyRet, cumRet,
          JSON.stringify(Object.entries(holdings).map(([s, h]) => ({ symbol: s, ...h }))),
          recentAtoms.length, thesesCreated, predsMade, val.validated, val.correct, rebalanced,
          benchmarkNav, benchmarkDailyReturn, cashAllocation, circuitBreakerLevel);
        // Step 10: Progress
        await db.run("UPDATE market_backtests SET current_sim_date=?,completed_days=? WHERE id=?", simDate, dayNumber, backtestId);
        if (dayNumber % 50 === 0) console.log(`[backtest] ${bt.name}: Day ${dayNumber}/${tradingDays.length}, NAV: ${nav.toFixed(0)}, Return: ${(cumRet*100).toFixed(2)}%, Preds: ${totalPreds}`);
      }
      // Final metrics
      const totRet = bt.initial_capital > 0 ? (nav - bt.initial_capital) / bt.initial_capital : 0;
      const yrs = tradingDays.length / 252;
      const annRet = yrs > 0 ? Math.pow(1 + totRet, 1 / yrs) - 1 : 0;
      const dRets = navHistory.map(n => n.dailyReturn);
      const avg = dRets.reduce((s, r) => s + r, 0) / dRets.length;
      const std = Math.sqrt(dRets.reduce((s, r) => s + Math.pow(r - avg, 2), 0) / dRets.length);
      const sharpe = std > 0 ? (avg / std) * Math.sqrt(252) : 0;
      const predAcc = totalPreds > 0 ? correctPreds / totalPreds : 0;
      // R1: Benchmark final metrics and alpha
      const benchmarkReturn = (benchmarkNav - bt.initial_capital) / bt.initial_capital;
      const benchmarkDailyReturns = benchmarkNavHistory.map(n => n.dailyReturn);
      const benchmarkAvgReturn = benchmarkDailyReturns.length > 0 ? benchmarkDailyReturns.reduce((s, r) => s + r, 0) / benchmarkDailyReturns.length : 0;
      const benchmarkStdReturn = benchmarkDailyReturns.length > 0 ? Math.sqrt(benchmarkDailyReturns.reduce((s, r) => s + Math.pow(r - benchmarkAvgReturn, 2), 0) / benchmarkDailyReturns.length) : 0;
      const benchmarkSharpe = benchmarkStdReturn > 0 ? (benchmarkAvgReturn / benchmarkStdReturn) * Math.sqrt(252) : 0;
      const alpha = totRet - benchmarkReturn;
      await db.run(
        `UPDATE market_backtests SET status='completed',completed_at=NOW(),final_nav=?,total_return=?,annualized_return=?,sharpe_ratio=?,max_drawdown=?,total_predictions=?,correct_predictions=?,prediction_accuracy=?,benchmark_return=?,benchmark_sharpe=?,alpha=?,results=? WHERE id=?`,
        nav, totRet, annRet, sharpe, maxDrawdown, totalPreds, correctPreds, predAcc,
        benchmarkReturn, benchmarkSharpe, alpha,
        JSON.stringify({ navHistory: navHistory.slice(-30), dailyReturns: dRets.slice(-30), benchmarkNavHistory: benchmarkNavHistory.slice(-30) }), backtestId);
      console.log(`[backtest] ${bt.name}: COMPLETED — Return: ${(totRet*100).toFixed(2)}%, Benchmark: ${(benchmarkReturn*100).toFixed(2)}%, Alpha: ${(alpha*100).toFixed(2)}%, Sharpe: ${sharpe.toFixed(2)}, MaxDD: ${(maxDrawdown*100).toFixed(1)}%, Preds: ${correctPreds}/${totalPreds}`);
      return { backtestId, status: 'completed', totalDays: tradingDays.length, completedDays: dayNumber, finalNav: nav, totalReturn: totRet, annualizedReturn: annRet, sharpeRatio: sharpe, maxDrawdown, totalPredictions: totalPreds, correctPredictions: correctPreds, predictionAccuracy: predAcc, benchmarkReturn, benchmarkSharpe, alpha };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db.run("UPDATE market_backtests SET status='failed',error_message=? WHERE id=?", msg, backtestId);
      console.error(`[backtest] ${bt.name}: FAILED —`, msg);
      return { backtestId, status: 'failed', totalDays: tradingDays.length, completedDays: dayNumber, finalNav: nav, totalReturn: 0, annualizedReturn: 0, sharpeRatio: 0, maxDrawdown, totalPredictions: totalPreds, correctPredictions: correctPreds, predictionAccuracy: 0, benchmarkReturn: 0, benchmarkSharpe: 0, alpha: 0, error: msg };
    }
  }

  async function getBacktest(id: string) { return await db.get('SELECT * FROM market_backtests WHERE id=?', id); }
  async function getBacktestDays(id: string, limit = 365) { return await db.all('SELECT * FROM market_backtest_days WHERE backtest_id=? ORDER BY sim_date ASC LIMIT ?', id, limit); }
  async function listBacktests() { return await db.all('SELECT * FROM market_backtests ORDER BY created_at DESC LIMIT 50'); }

  return { downloadHistoricalData, createBacktest, runBacktest, getBacktest, getBacktestDays, listBacktests };
}

export type MarketBacktestRunner = Awaited<ReturnType<typeof createMarketBacktestRunner>>;
