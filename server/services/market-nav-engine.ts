// ═══════════════════════════════════════════════════════════
// Market NAV Engine — Computes daily NAV, returns, and
// leaderboard metrics for ANTON 100 indexes.
// ═══════════════════════════════════════════════════════════

import type { DatabaseAdapter } from '../db/database.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface HoldingRow {
  id: number;
  index_id: string;
  symbol: string;
  weight: number;
  shares: number;
  entry_price: number | null;
  current_price: number | null;
}

interface NavHistoryRow {
  nav_date: string;
  nav_value: number;
  daily_return: number | null;
}

interface IndexRow {
  id: string;
  name: string;
  status: string;
  universe: string;
  budget: number | null;
  currency: string | null;
  current_nav: number;
  total_return: number;
  inception_date: string | null;
  weighting_method: string;
  max_holdings: number;
}

// ── Static FX rates for USD conversion (configurable) ────────────────────────
const FX_RATES_TO_USD: Record<string, number> = {
  USD: 1.0,
  SEK: 0.095,
  EUR: 1.08,
  INR: 0.012,
  JPY: 0.0067,
  GBP: 1.27,
  CHF: 1.13,
  DKK: 0.145,
};

function getApproximateFxRate(currency: string | null): number {
  return FX_RATES_TO_USD[currency ?? 'USD'] ?? 1.0;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export async function createMarketNavEngine(db: DatabaseAdapter) {

  /**
   * Calculate daily NAV for a single index.
   * For each active holding, finds the latest price from market_data_raw,
   * then computes NAV = sum(shares * price) for all holdings.
   */
  async function calculateDailyNav(indexId: string): Promise<{
    nav: number;
    dailyReturn: number | null;
    holdingsUpdated: number;
  }> {
    const holdings = await db.all<HoldingRow>(
      'SELECT * FROM market_index_holdings WHERE index_id = ? AND removed_at IS NULL',
      indexId
    );

    if (holdings.length === 0) {
      return { nav: 0, dailyReturn: null, holdingsUpdated: 0 };
    }

    let totalValue = 0;
    let holdingsUpdated = 0;

    for (const holding of holdings) {
      // Find latest price for this symbol from market_data_raw
      const priceRow = await db.get<{ content: string }>(
        `SELECT content FROM market_data_raw
         WHERE symbol = ? AND data_type = 'price'
         ORDER BY published_at DESC LIMIT 1`,
        holding.symbol
      );

      let price = holding.current_price ?? holding.entry_price ?? 0;
      let adjustedShares = holding.shares;
      let dividendCash = 0;

      // Check for corporate actions (split/dividend) — basic heuristic
      const eventRow = await db.get<{ content: string }>(
        `SELECT content FROM market_data_raw
         WHERE symbol = ? AND data_type = 'event'
         ORDER BY published_at DESC LIMIT 1`,
        holding.symbol
      );
      if (eventRow) {
        try {
          const eventData = JSON.parse(eventRow.content);
          const eventText = JSON.stringify(eventData).toLowerCase();
          if (eventText.includes('split') && eventData.ratio) {
            adjustedShares = holding.shares * Number(eventData.ratio);
          }
          if (eventText.includes('dividend') && eventData.amount) {
            dividendCash = holding.shares * Number(eventData.amount);
          }
        } catch { /* ignore malformed event data */ }
      }

      if (priceRow) {
        try {
          const data = JSON.parse(priceRow.content);
          // Support multiple data formats (FMP, Alpha Vantage, EODHD, Finnhub)
          const newPrice = data.close ?? data.adjusted_close ?? data['4. close'] ?? data.c ?? null;
          if (newPrice && !isNaN(Number(newPrice))) {
            price = Number(newPrice);
            // Update holding's current price
            await db.run(
              'UPDATE market_index_holdings SET current_price = ?, unrealized_pnl = ? WHERE id = ?',
              price,
              holding.entry_price ? (price - holding.entry_price) * holding.shares : 0,
              holding.id
            );
            holdingsUpdated++;
          }
        } catch {
          // Use existing price
        }
      }

      totalValue += adjustedShares * price + dividendCash;
    }

    // Get previous NAV for daily return calculation
    const prevNav = await db.get<NavHistoryRow>(
      'SELECT nav_value FROM market_index_nav_history WHERE index_id = ? ORDER BY nav_date DESC LIMIT 1',
      indexId
    );

    const dailyReturn = prevNav && prevNav.nav_value > 0
      ? (totalValue - prevNav.nav_value) / prevNav.nav_value
      : null;

    // Circuit breaker: check drawdown from peak
    const peakRow = await db.get<{ peak: number }>(
      'SELECT MAX(nav_value) as peak FROM market_index_nav_history WHERE index_id = ?',
      indexId
    );
    const peak = peakRow?.peak ?? totalValue;
    if (peak > 0 && totalValue < peak) {
      const drawdown = (peak - totalValue) / peak;
      if (drawdown > 0.25) {
        console.error(`[nav-engine] CRITICAL: ${indexId} drawdown ${(drawdown * 100).toFixed(1)}% exceeds 25% threshold`);
        await db.run(
          "UPDATE market_indexes SET drawdown_alert = ?, updated_at = NOW() WHERE id = ?",
          `CRITICAL: ${(drawdown * 100).toFixed(1)}% drawdown at ${new Date().toISOString()}`, indexId
        );
      } else if (drawdown > 0.15) {
        console.warn(`[nav-engine] WARNING: ${indexId} drawdown ${(drawdown * 100).toFixed(1)}% exceeds 15% threshold`);
      }
    }

    // Get inception NAV for cumulative return
    const inceptionNav = await db.get<{ nav_value: number }>(
      'SELECT nav_value FROM market_index_nav_history WHERE index_id = ? ORDER BY nav_date ASC LIMIT 1',
      indexId
    );

    const cumulativeReturn = inceptionNav && inceptionNav.nav_value > 0
      ? (totalValue - inceptionNav.nav_value) / inceptionNav.nav_value
      : 0;

    // Record NAV
    const today = new Date().toISOString().split('T')[0];

    // Upsert: delete existing entry for today then insert
    await db.run(
      'DELETE FROM market_index_nav_history WHERE index_id = ? AND nav_date = ?',
      indexId, today
    );

    await db.run(`
      INSERT INTO market_index_nav_history (index_id, nav_date, nav_value, daily_return, cumulative_return)
      VALUES (?, ?, ?, ?, ?)
    `, indexId, today, totalValue, dailyReturn, cumulativeReturn);

    // Update index record
    await db.run(
      "UPDATE market_indexes SET current_nav = ?, total_return = ?, updated_at = NOW() WHERE id = ?",
      totalValue, cumulativeReturn, indexId
    );

    return { nav: totalValue, dailyReturn, holdingsUpdated };
  }

  /**
   * Update NAV for all active indexes.
   */
  async function updateAllActiveIndexes(): Promise<{
    updated: number;
    results: Array<{ indexId: string; nav: number; error?: string }>;
  }> {
    const indexes = await db.all<{ id: string; name: string }>(
      "SELECT id, name FROM market_indexes WHERE status = 'active'"
    );

    const results: Array<{ indexId: string; nav: number; error?: string }> = [];

    for (const idx of indexes) {
      try {
        const result = await calculateDailyNav(idx.id);
        results.push({ indexId: idx.id, nav: result.nav });
        console.log(`[nav-engine] ${idx.name}: NAV=${result.nav.toFixed(2)}, return=${result.dailyReturn !== null ? (result.dailyReturn * 100).toFixed(3) + '%' : 'N/A'}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ indexId: idx.id, nav: 0, error: message });
        console.error(`[nav-engine] ${idx.name} failed: ${message}`);
      }
    }

    return { updated: results.filter(r => !r.error).length, results };
  }

  /**
   * Update leaderboard metrics for all active indexes.
   * Computes returns for multiple periods, Sharpe, max drawdown, volatility.
   */
  async function updateLeaderboard(): Promise<{ updated: number }> {
    const indexes = await db.all<{ id: string; currency: string | null }>(
      "SELECT id, currency FROM market_indexes WHERE status = 'active'"
    );

    const periods = [
      { label: '1w', days: 7 },
      { label: '1m', days: 30 },
      { label: '3m', days: 90 },
      { label: '6m', days: 180 },
      { label: '1y', days: 365 },
    ];

    let updated = 0;

    for (const idx of indexes) {
      // Fetch all NAV history for this index (up to 2 years)
      const navHistory = await db.all<{ nav_date: string; nav_value: number; daily_return: number | null }>(
        'SELECT nav_date, nav_value, daily_return FROM market_index_nav_history WHERE index_id = ? ORDER BY nav_date ASC LIMIT 730',
        idx.id
      );

      if (navHistory.length < 2) continue;

      const latestNav = navHistory[navHistory.length - 1].nav_value;
      const fxRate = getApproximateFxRate(idx.currency);
      const navUsdEquivalent = latestNav * fxRate;
      const dailyReturns = navHistory
        .map(r => r.daily_return)
        .filter((r): r is number => r !== null);

      for (const period of periods) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - period.days);
        const cutoff = cutoffDate.toISOString().split('T')[0];

        const periodNav = navHistory.filter(r => r.nav_date >= cutoff);
        if (periodNav.length < 2) continue;

        const startNav = periodNav[0].nav_value;
        const totalReturn = startNav > 0 ? (latestNav - startNav) / startNav : 0;

        // Annualized return
        const yearsElapsed = period.days / 365;
        const annualizedReturn = startNav > 0 && yearsElapsed > 0
          ? Math.pow(1 + totalReturn, 1 / yearsElapsed) - 1
          : 0;

        // Volatility (annualized std dev of daily returns in period)
        const periodReturns = periodNav
          .map(r => r.daily_return)
          .filter((r): r is number => r !== null);

        let volatility = 0;
        if (periodReturns.length > 1) {
          const mean = periodReturns.reduce((a, b) => a + b, 0) / periodReturns.length;
          const variance = periodReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (periodReturns.length - 1);
          volatility = Math.sqrt(variance) * Math.sqrt(252); // Annualize
        }

        // Sharpe ratio using assumed risk-free rate (US 10Y Treasury ~4%)
        const rf = 0.04;
        const sharpeRatio = volatility > 0 ? (annualizedReturn - rf) / volatility : 0;

        // Max drawdown
        let maxDrawdown = 0;
        let peak = periodNav[0].nav_value;
        for (const row of periodNav) {
          if (row.nav_value > peak) peak = row.nav_value;
          const drawdown = peak > 0 ? (peak - row.nav_value) / peak : 0;
          if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        }

        // Upsert leaderboard
        const existing = await db.get<{ id: number }>(
          'SELECT id FROM market_index_leaderboard WHERE index_id = ? AND period = ?',
          idx.id, period.label
        );

        if (existing) {
          await db.run(`
            UPDATE market_index_leaderboard
            SET total_return = ?, annualized_return = ?, sharpe_ratio = ?,
                max_drawdown = ?, volatility = ?, computed_at = NOW()
            WHERE id = ?
          `, totalReturn, annualizedReturn, sharpeRatio, maxDrawdown, volatility, existing.id);
        } else {
          await db.run(`
            INSERT INTO market_index_leaderboard (index_id, period, total_return, annualized_return, sharpe_ratio, max_drawdown, volatility)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, idx.id, period.label, totalReturn, annualizedReturn, sharpeRatio, maxDrawdown, volatility);
        }
      }

      updated++;
    }

    return { updated };
  }

  /**
   * Initialize an index with holdings.
   * Allocates the budget across selected symbols based on weights and current prices.
   */
  async function initializeIndex(
    indexId: string,
    holdings: Array<{ symbol: string; name?: string; weight: number }>
  ): Promise<{ holdingsCreated: number; initialNav: number }> {
    const index = await db.get<IndexRow>('SELECT * FROM market_indexes WHERE id = ?', indexId);
    if (!index) throw new Error(`Index not found: ${indexId}`);

    const budget = index.budget ?? 100000000;
    let totalNav = 0;
    let holdingsCreated = 0;

    for (const h of holdings) {
      // Look up current price
      const priceRow = await db.get<{ content: string }>(
        `SELECT content FROM market_data_raw
         WHERE symbol = ? AND data_type = 'price'
         ORDER BY published_at DESC LIMIT 1`,
        h.symbol
      );

      let price = 100; // Default placeholder price if no data yet
      if (priceRow) {
        try {
          const data = JSON.parse(priceRow.content);
          const p = data.close ?? data.adjusted_close ?? data['4. close'] ?? data.c;
          if (p && !isNaN(Number(p))) price = Number(p);
        } catch { /* use default */ }
      }

      const allocation = budget * h.weight;
      const shares = price > 0 ? allocation / price : 0;

      await db.run(`
        INSERT INTO market_index_holdings (index_id, symbol, name, weight, shares, entry_price, current_price)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, indexId, h.symbol, h.name ?? null, h.weight, shares, price, price);

      totalNav += shares * price;
      holdingsCreated++;
    }

    // Record initial NAV = 1000 (base value for tracking)
    const today = new Date().toISOString().split('T')[0];
    await db.run(`
      INSERT INTO market_index_nav_history (index_id, nav_date, nav_value, daily_return, cumulative_return)
      VALUES (?, ?, ?, 0, 0)
    `, indexId, today, totalNav);

    // Activate the index
    await db.run(`
      UPDATE market_indexes
      SET status = 'active', inception_date = NOW(), current_nav = ?,
          total_return = 0, updated_at = NOW()
      WHERE id = ?
    `, totalNav, indexId);

    return { holdingsCreated, initialNav: totalNav };
  }

  return {
    calculateDailyNav,
    updateAllActiveIndexes,
    updateLeaderboard,
    initializeIndex,
  };
}

export type MarketNavEngine = Awaited<ReturnType<typeof createMarketNavEngine>>;
