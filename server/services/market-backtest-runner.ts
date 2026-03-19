// ═══════════════════════════════════════════════════════════
// Market Backtest Runner — "Time machine" for historical
// simulation. Downloads price data, replays trading days,
// generates momentum-based predictions, validates them,
// and tracks NAV/Sharpe/drawdown across the run.
// ═══════════════════════════════════════════════════════════

import type { DatabaseAdapter } from '../db/database.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface BacktestConfig {
  name: string;
  startDate: string;        // e.g. '2025-01-02'
  endDate: string;           // e.g. '2025-06-30'
  universe: string[];        // e.g. ['AAPL','MSFT','GOOGL',...]
  initialCapital: number;    // e.g. 100_000_000
  strategy: {
    rebalanceFrequency: 'daily' | 'weekly' | 'monthly';
    maxHoldings: number;
    weightingMethod: 'equal' | 'conviction';
    useAI: boolean;           // use Claude for thesis/prediction generation (slower, costs money)
    thinkingLevel?: string;   // 'quick' for speed, 'think' for realism
  };
}

interface BacktestResult {
  backtestId: string;
  status: 'completed' | 'failed';
  totalDays: number;
  completedDays: number;
  finalNav: number;
  totalReturn: number;
  annualizedReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  totalPredictions: number;
  correctPredictions: number;
  predictionAccuracy: number;
  error?: string;
}

// US market holidays (NYSE closed dates) — approximate for 2024-2026
const US_HOLIDAYS = new Set([
  '2024-01-01', '2024-01-15', '2024-02-19', '2024-03-29', '2024-05-27',
  '2024-06-19', '2024-07-04', '2024-09-02', '2024-11-28', '2024-12-25',
  '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26',
  '2025-06-19', '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25',
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
  '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
]);

function isTradingDay(dateStr: string): boolean {
  const d = new Date(dateStr);
  const dayOfWeek = d.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false; // weekend
  return !US_HOLIDAYS.has(dateStr);
}

function getTradingDays(start: string, end: string): string[] {
  const days: string[] = [];
  const current = new Date(start);
  const endDate = new Date(end);
  while (current <= endDate) {
    const dateStr = current.toISOString().slice(0, 10);
    if (isTradingDay(dateStr)) days.push(dateStr);
    current.setDate(current.getDate() + 1);
  }
  return days;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export async function createMarketBacktestRunner(db: DatabaseAdapter) {

  /**
   * Pre-download historical data for the backtest period.
   * Returns number of price records cached.
   */
  async function downloadHistoricalData(
    universe: string[], startDate: string, endDate: string
  ): Promise<number> {
    const { createMarketDataService } = await import('./market-data-service.js');
    const dataService = await createMarketDataService(db);
    return await dataService.fetchHistoricalRange(universe, startDate, endDate);
  }

  /**
   * Create a new backtest session.
   */
  async function createBacktest(config: BacktestConfig): Promise<string> {
    const id = `bt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tradingDays = getTradingDays(config.startDate, config.endDate);

    await db.run(`
      INSERT INTO market_backtests (id, name, description, strategy_config, start_date, end_date,
                                     status, universe, initial_capital, total_trading_days)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `, id, config.name,
       `Backtest: ${config.universe.length} symbols, ${config.startDate} to ${config.endDate}`,
       JSON.stringify(config.strategy),
       config.startDate, config.endDate,
       JSON.stringify(config.universe),
       config.initialCapital,
       tradingDays.length
    );

    return id;
  }

  /**
   * Run the backtest simulation day by day.
   */
  async function runBacktest(backtestId: string): Promise<BacktestResult> {
    // Load config
    const bt = await db.get<{
      id: string; name: string; start_date: string; end_date: string;
      strategy_config: string; universe: string; initial_capital: number;
      total_trading_days: number;
    }>('SELECT * FROM market_backtests WHERE id = ?', backtestId);
    if (!bt) throw new Error(`Backtest not found: ${backtestId}`);

    const config: BacktestConfig['strategy'] = JSON.parse(bt.strategy_config);
    const universe: string[] = JSON.parse(bt.universe);
    const tradingDays = getTradingDays(bt.start_date, bt.end_date);

    await db.run("UPDATE market_backtests SET status = 'running' WHERE id = ?", backtestId);

    // Initialize portfolio
    let nav = bt.initial_capital;
    let peakNav = nav;
    let maxDrawdown = 0;
    let holdings: Record<string, { shares: number; weight: number; entryPrice: number }> = {};
    let dayNumber = 0;
    let totalPredictions = 0;
    let correctPredictions = 0;
    const navHistory: Array<{ date: string; nav: number; dailyReturn: number }> = [];
    let lastRebalanceDay = 0;

    // Initialize equal-weight portfolio on day 1
    const initWeight = 1.0 / universe.length;

    try {
      for (const simDate of tradingDays) {
        dayNumber++;
        const prevNav = nav;

        // 1. Get prices for this day
        const placeholders = universe.map(() => '?').join(',');
        const prices = await db.all<{ symbol: string; close: number }>(
          `SELECT symbol, close FROM market_historical_prices
           WHERE price_date = ? AND symbol IN (${placeholders})`,
          simDate, ...universe
        );
        const priceMap = new Map(prices.map(p => [p.symbol, Number(p.close)]));

        // Skip if no prices available for this day
        if (priceMap.size === 0) continue;

        // 2. Initialize holdings on first day with prices
        if (Object.keys(holdings).length === 0) {
          const perStock = nav * initWeight;
          for (const symbol of universe) {
            const price = priceMap.get(symbol);
            if (price && price > 0) {
              holdings[symbol] = {
                shares: perStock / price,
                weight: initWeight,
                entryPrice: price,
              };
            }
          }
        }

        // 3. Calculate current NAV from holdings
        nav = 0;
        for (const [symbol, holding] of Object.entries(holdings)) {
          const price = priceMap.get(symbol) ?? holding.entryPrice;
          nav += holding.shares * price;
        }

        // 4. Track drawdown
        if (nav > peakNav) peakNav = nav;
        const drawdown = (peakNav - nav) / peakNav;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;

        const dailyReturn = prevNav > 0 ? (nav - prevNav) / prevNav : 0;
        const cumReturn = bt.initial_capital > 0 ? (nav - bt.initial_capital) / bt.initial_capital : 0;

        navHistory.push({ date: simDate, nav, dailyReturn });

        // 5. Generate predictions (using rule-based signals, not AI for speed)
        let predictionsMade = 0;
        let predictionsValidated = 0;
        let predictionsCorrect = 0;

        if (config.useAI && dayNumber % 5 === 1) {
          // Every 5 days, generate a prediction based on momentum
          for (const symbol of universe.slice(0, 5)) {
            const recentPrices = await db.all<{ close: number; price_date: string }>(
              `SELECT close, price_date FROM market_historical_prices
               WHERE symbol = ? AND price_date <= ? ORDER BY price_date DESC LIMIT 10`,
              symbol, simDate
            );
            if (recentPrices.length >= 5) {
              const recent = Number(recentPrices[0].close);
              const fiveDaysAgo = Number(recentPrices[4].close);
              const momentum = (recent - fiveDaysAgo) / fiveDaysAgo;
              const direction = momentum > 0.02 ? 'up' : momentum < -0.02 ? 'down' : null;

              if (direction) {
                const predId = `btp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                const deadlineIdx = Math.min(dayNumber + 4, tradingDays.length - 1);
                const deadline = tradingDays[deadlineIdx] ?? simDate;

                await db.run(`
                  INSERT INTO market_backtest_predictions (id, backtest_id, sim_date_created, sim_date_deadline,
                    title, prediction_type, target_symbol, predicted_direction, confidence, status)
                  VALUES (?, ?, ?, ?, ?, 'directional', ?, ?, ?, 'active')
                `, predId, backtestId, simDate, deadline,
                   `${symbol} will go ${direction} in 5 days (momentum: ${(momentum * 100).toFixed(1)}%)`,
                   symbol, direction, Math.min(0.5 + Math.abs(momentum) * 2, 0.9)
                );
                predictionsMade++;
                totalPredictions++;
              }
            }
          }
        }

        // 6. Validate predictions that reached their deadline
        const duePredictions = await db.all<{
          id: string; target_symbol: string; predicted_direction: string; confidence: number;
        }>(
          `SELECT id, target_symbol, predicted_direction, confidence
           FROM market_backtest_predictions
           WHERE backtest_id = ? AND status = 'active' AND sim_date_deadline <= ?`,
          backtestId, simDate
        );

        for (const pred of duePredictions) {
          const actualPrice = priceMap.get(pred.target_symbol);
          const createdRow = await db.get<{ sim_date_created: string }>(
            'SELECT sim_date_created FROM market_backtest_predictions WHERE id = ?', pred.id
          );
          if (!actualPrice || !createdRow) continue;

          const createdPrice = await db.get<{ close: number }>(
            'SELECT close FROM market_historical_prices WHERE symbol = ? AND price_date = ?',
            pred.target_symbol, createdRow.sim_date_created
          );
          if (!createdPrice) continue;

          const actualDirection = Number(actualPrice) > Number(createdPrice.close) ? 'up' : 'down';
          const wasCorrect = actualDirection === pred.predicted_direction ? 1 : 0;
          const brierScore = Math.pow(pred.confidence - wasCorrect, 2);

          await db.run(`
            UPDATE market_backtest_predictions
            SET status = 'validated', actual_value = ?, was_correct = ?, brier_score = ?, validated_at_sim_date = ?
            WHERE id = ?
          `, actualPrice, wasCorrect, brierScore, simDate, pred.id);

          predictionsValidated++;
          if (wasCorrect) {
            predictionsCorrect++;
            correctPredictions++;
          }
        }

        // 7. Rebalance check
        let rebalanced = false;
        const shouldRebalance =
          (config.rebalanceFrequency === 'daily') ||
          (config.rebalanceFrequency === 'weekly' && dayNumber - lastRebalanceDay >= 5) ||
          (config.rebalanceFrequency === 'monthly' && dayNumber - lastRebalanceDay >= 21);

        if (shouldRebalance && dayNumber > 1) {
          // Simple momentum-based rebalance
          const returns: Array<{ symbol: string; ret: number }> = [];
          for (const symbol of universe) {
            const hist = await db.all<{ close: number }>(
              `SELECT close FROM market_historical_prices
               WHERE symbol = ? AND price_date <= ? ORDER BY price_date DESC LIMIT 20`,
              symbol, simDate
            );
            if (hist.length >= 2) {
              const ret = (Number(hist[0].close) - Number(hist[hist.length - 1].close)) / Number(hist[hist.length - 1].close);
              returns.push({ symbol, ret });
            }
          }

          if (returns.length > 0) {
            // Sort by momentum, overweight winners
            returns.sort((a, b) => b.ret - a.ret);
            const totalRet = returns.reduce((s, r) => s + Math.max(0, r.ret + 0.1), 0);

            for (const r of returns) {
              const newWeight = totalRet > 0
                ? Math.max(0.02, Math.min(0.15, Math.max(0, r.ret + 0.1) / totalRet))
                : 1.0 / returns.length;
              const price = priceMap.get(r.symbol) ?? 0;
              if (price > 0) {
                holdings[r.symbol] = {
                  shares: (nav * newWeight) / price,
                  weight: newWeight,
                  entryPrice: price,
                };
              }
            }
            lastRebalanceDay = dayNumber;
            rebalanced = true;
          }
        }

        // 8. Record daily snapshot
        await db.run(`
          INSERT INTO market_backtest_days (backtest_id, sim_date, day_number, nav, daily_return,
            cumulative_return, holdings, predictions_made, predictions_validated,
            predictions_correct, rebalance_executed)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (backtest_id, sim_date) DO UPDATE SET
            nav = EXCLUDED.nav, daily_return = EXCLUDED.daily_return,
            cumulative_return = EXCLUDED.cumulative_return, holdings = EXCLUDED.holdings
        `, backtestId, simDate, dayNumber, nav, dailyReturn, cumReturn,
           JSON.stringify(Object.entries(holdings).map(([s, h]) => ({ symbol: s, ...h }))),
           predictionsMade, predictionsValidated, predictionsCorrect, rebalanced
        );

        // Update progress
        await db.run(
          "UPDATE market_backtests SET current_sim_date = ?, completed_days = ? WHERE id = ?",
          simDate, dayNumber, backtestId
        );

        // Log progress every 50 days
        if (dayNumber % 50 === 0) {
          console.log(`[backtest] ${bt.name}: Day ${dayNumber}/${tradingDays.length}, NAV: ${nav.toFixed(0)}, Return: ${(cumReturn * 100).toFixed(2)}%`);
        }
      }

      // Compute final metrics
      const totalReturn = bt.initial_capital > 0 ? (nav - bt.initial_capital) / bt.initial_capital : 0;
      const years = tradingDays.length / 252;
      const annualizedReturn = years > 0 ? Math.pow(1 + totalReturn, 1 / years) - 1 : 0;

      // Compute Sharpe ratio (annualized)
      const dailyReturns = navHistory.map(n => n.dailyReturn);
      const avgDailyReturn = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;
      const stdDailyReturn = Math.sqrt(
        dailyReturns.reduce((s, r) => s + Math.pow(r - avgDailyReturn, 2), 0) / dailyReturns.length
      );
      const sharpeRatio = stdDailyReturn > 0 ? (avgDailyReturn / stdDailyReturn) * Math.sqrt(252) : 0;

      const predictionAccuracy = totalPredictions > 0 ? correctPredictions / totalPredictions : 0;

      // Update final results
      await db.run(`
        UPDATE market_backtests SET
          status = 'completed', completed_at = NOW(), final_nav = ?, total_return = ?,
          annualized_return = ?, sharpe_ratio = ?, max_drawdown = ?,
          total_predictions = ?, correct_predictions = ?, prediction_accuracy = ?,
          results = ?
        WHERE id = ?
      `, nav, totalReturn, annualizedReturn, sharpeRatio, maxDrawdown,
         totalPredictions, correctPredictions, predictionAccuracy,
         JSON.stringify({ navHistory: navHistory.slice(-30), dailyReturns: dailyReturns.slice(-30) }),
         backtestId
      );

      console.log(`[backtest] ${bt.name}: COMPLETED — Return: ${(totalReturn * 100).toFixed(2)}%, Sharpe: ${sharpeRatio.toFixed(2)}, MaxDD: ${(maxDrawdown * 100).toFixed(1)}%, Predictions: ${correctPredictions}/${totalPredictions}`);

      return {
        backtestId, status: 'completed', totalDays: tradingDays.length, completedDays: dayNumber,
        finalNav: nav, totalReturn, annualizedReturn, sharpeRatio, maxDrawdown,
        totalPredictions, correctPredictions, predictionAccuracy,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.run("UPDATE market_backtests SET status = 'failed', error_message = ? WHERE id = ?", message, backtestId);
      console.error(`[backtest] ${bt.name}: FAILED —`, message);
      return {
        backtestId, status: 'failed', totalDays: tradingDays.length, completedDays: dayNumber,
        finalNav: nav, totalReturn: 0, annualizedReturn: 0, sharpeRatio: 0, maxDrawdown,
        totalPredictions, correctPredictions, predictionAccuracy: 0, error: message,
      };
    }
  }

  /**
   * Get backtest status and results.
   */
  async function getBacktest(backtestId: string) {
    return await db.get('SELECT * FROM market_backtests WHERE id = ?', backtestId);
  }

  /**
   * Get daily snapshots for a backtest.
   */
  async function getBacktestDays(backtestId: string, limit = 365) {
    return await db.all(
      'SELECT * FROM market_backtest_days WHERE backtest_id = ? ORDER BY sim_date ASC LIMIT ?',
      backtestId, limit
    );
  }

  /**
   * List all backtests.
   */
  async function listBacktests() {
    return await db.all('SELECT * FROM market_backtests ORDER BY created_at DESC LIMIT 50');
  }

  return {
    downloadHistoricalData,
    createBacktest,
    runBacktest,
    getBacktest,
    getBacktestDays,
    listBacktests,
  };
}

export type MarketBacktestRunner = Awaited<ReturnType<typeof createMarketBacktestRunner>>;
