import type { DatabaseAdapter } from '../db/database.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface FundamentalScoreResult {
  symbol: string;
  compositeScore: number;
  components: Record<string, number>;
}

interface FundamentalScoreRow {
  symbol: string;
  composite_score: number;
  score_date: string;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export async function createMarketFundamentalScoringService(db: DatabaseAdapter) {

  /**
   * Compute a composite fundamental score (0-100) for a symbol.
   * Uses income statement ratios and key metrics from market_data_raw or market_historical_fundamentals.
   */
  async function computeFundamentalScore(
    symbol: string,
    asOfDate?: string,
  ): Promise<FundamentalScoreResult | null> {
    // Try market_data_raw first (live data), then market_historical_fundamentals (backtest)
    let ratioData: Record<string, unknown> | null = null;

    const rawRow = await db.get<{ content: string }>(
      "SELECT content FROM market_data_raw WHERE symbol = ? AND data_type = 'ratios' ORDER BY published_at DESC LIMIT 1",
      symbol,
    );
    if (rawRow) {
      const parsed = JSON.parse(rawRow.content);
      ratioData = Array.isArray(parsed) ? parsed[0] : parsed;
    }

    if (!ratioData) {
      const histRow = await db.get<{ data: string }>(
        "SELECT data FROM market_historical_fundamentals WHERE symbol = ? AND data_type = 'ratios' ORDER BY report_date DESC LIMIT 1",
        symbol,
      );
      if (histRow) {
        const parsed = typeof histRow.data === 'string' ? JSON.parse(histRow.data) : histRow.data;
        ratioData = Array.isArray(parsed) ? parsed[0] : parsed;
      }
    }

    if (!ratioData) return null;

    // Extract key ratios
    const pe = Number(ratioData.priceToEarningsRatio ?? ratioData.peRatio ?? 0);
    const roe = Number(ratioData.returnOnEquity ?? 0);
    const grossMargin = Number(ratioData.grossProfitMargin ?? 0);
    const debtEquity = Number(ratioData.debtToEquityRatio ?? ratioData.debtEquityRatio ?? 0);
    const revenueGrowth = Number(ratioData.revenueGrowth ?? ratioData.growthRevenue ?? 0);
    const fcfYield = Number(ratioData.freeCashFlowYield ?? 0);

    // Score each component (0-100 scale, higher is better)
    const peScore = pe > 0 ? Math.max(0, Math.min(100, 100 - (pe - 10) * 2)) : 50;
    const roeScore = Math.max(0, Math.min(100, roe * 300));
    const gmScore = Math.max(0, Math.min(100, grossMargin * 150));
    const deScore = Math.max(0, Math.min(100, 100 - debtEquity * 30));
    const rgScore = Math.max(0, Math.min(100, 50 + revenueGrowth * 200));
    const fcfScore = fcfYield > 0 ? Math.max(0, Math.min(100, fcfYield * 1000)) : 30;

    // Weighted composite
    const composite =
      peScore * 0.20 +
      roeScore * 0.20 +
      gmScore * 0.15 +
      deScore * 0.15 +
      rgScore * 0.15 +
      fcfScore * 0.15;

    // Store
    const scoreDate = asOfDate ?? new Date().toISOString().slice(0, 10);
    await db.run(
      `INSERT INTO market_fundamental_scores
         (symbol, score_date, composite_score, pe_rank, roe_score, gross_margin_score, debt_equity_score, revenue_growth_score, fcf_yield_score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (symbol, score_date) DO UPDATE SET
         composite_score = EXCLUDED.composite_score,
         pe_rank = EXCLUDED.pe_rank,
         roe_score = EXCLUDED.roe_score,
         gross_margin_score = EXCLUDED.gross_margin_score,
         debt_equity_score = EXCLUDED.debt_equity_score,
         revenue_growth_score = EXCLUDED.revenue_growth_score,
         fcf_yield_score = EXCLUDED.fcf_yield_score`,
      symbol, scoreDate, composite, peScore, roeScore, gmScore, deScore, rgScore, fcfScore,
    );

    return {
      symbol,
      compositeScore: composite,
      components: {
        pe: peScore,
        roe: roeScore,
        grossMargin: gmScore,
        debtEquity: deScore,
        revenueGrowth: rgScore,
        fcfYield: fcfScore,
      },
    };
  }

  /**
   * Compute fundamental scores for an entire universe of symbols.
   */
  async function computeScoresForUniverse(
    symbols: string[],
    asOfDate?: string,
  ): Promise<FundamentalScoreResult[]> {
    const results: FundamentalScoreResult[] = [];
    for (const symbol of symbols) {
      const score = await computeFundamentalScore(symbol, asOfDate);
      if (score) results.push(score);
    }
    return results;
  }

  /**
   * Retrieve the most recent fundamental scores for a list of symbols.
   */
  async function getFundamentalScores(symbols: string[]): Promise<FundamentalScoreRow[]> {
    if (symbols.length === 0) return [];
    const placeholders = symbols.map(() => '?').join(',');
    return await db.all<FundamentalScoreRow>(
      `SELECT DISTINCT ON (symbol) symbol, composite_score, score_date
       FROM market_fundamental_scores
       WHERE symbol IN (${placeholders})
       ORDER BY symbol, score_date DESC`,
      ...symbols,
    );
  }

  /**
   * Get full score breakdown for a single symbol (latest record).
   */
  async function getScoreBreakdown(symbol: string) {
    return await db.get<{
      symbol: string;
      score_date: string;
      composite_score: number;
      pe_rank: number;
      roe_score: number;
      gross_margin_score: number;
      debt_equity_score: number;
      revenue_growth_score: number;
      fcf_yield_score: number;
    }>(
      `SELECT symbol, score_date, composite_score, pe_rank, roe_score,
              gross_margin_score, debt_equity_score, revenue_growth_score, fcf_yield_score
       FROM market_fundamental_scores
       WHERE symbol = ?
       ORDER BY score_date DESC LIMIT 1`,
      symbol,
    );
  }

  /**
   * Get score history for a symbol over time.
   */
  async function getScoreHistory(symbol: string, limit = 30) {
    return await db.all<{ score_date: string; composite_score: number }>(
      `SELECT score_date, composite_score
       FROM market_fundamental_scores
       WHERE symbol = ?
       ORDER BY score_date DESC
       LIMIT ?`,
      symbol, limit,
    );
  }

  return {
    computeFundamentalScore,
    computeScoresForUniverse,
    getFundamentalScores,
    getScoreBreakdown,
    getScoreHistory,
  };
}

export type MarketFundamentalScoringService = Awaited<ReturnType<typeof createMarketFundamentalScoringService>>;
