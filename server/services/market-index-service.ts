import type { DatabaseAdapter } from '../db/database.js';
import { ilike } from '../db/dialect-helpers.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface IndexRow {
  id: string;
  name: string;
  description: string;
  index_type: string;
  philosophy: string | null;
  status: string;
  universe: string;
  max_holdings: number;
  rebalance_frequency: string;
  weighting_method: string;
  inception_date: string | null;
  last_rebalance_at: string | null;
  total_return: number;
  current_nav: number;
  benchmark_symbol: string | null;
  budget: number | null;
  currency: string | null;
  created_at: string;
  updated_at: string;
}

interface HoldingRow {
  id: number;
  index_id: string;
  symbol: string;
  name: string | null;
  weight: number;
  shares: number;
  entry_price: number | null;
  current_price: number | null;
  unrealized_pnl: number;
  added_at: string;
  removed_at: string | null;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export async function createMarketIndexService(db: DatabaseAdapter) {

  // ── Index CRUD ───────────────────────────────────────────────────────────

  async function createIndex(params: {
    name: string;
    description: string;
    indexType?: string;
    philosophy?: string;
    universe?: string[];
    maxHoldings?: number;
    rebalanceFrequency?: string;
    weightingMethod?: string;
    benchmarkSymbol?: string;
    budget?: number;
    currency?: string;
  }) {
    const id = `midx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`
      INSERT INTO market_indexes (id, name, description, index_type, philosophy, universe,
                                   max_holdings, rebalance_frequency, weighting_method, benchmark_symbol,
                                   budget, currency)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, id, params.name, params.description, params.indexType ?? 'custom',
       params.philosophy ?? null, JSON.stringify(params.universe ?? []),
       params.maxHoldings ?? 20, params.rebalanceFrequency ?? 'monthly',
       params.weightingMethod ?? 'equal', params.benchmarkSymbol ?? null,
       params.budget ?? 100000000, params.currency ?? 'USD');
    return id;
  }

  async function getIndex(id: string) {
    const index = await db.get<IndexRow>('SELECT * FROM market_indexes WHERE id = ?', id);
    if (!index) return null;

    const holdings = await db.all<HoldingRow>(
      'SELECT * FROM market_index_holdings WHERE index_id = ? AND removed_at IS NULL ORDER BY weight DESC', id
    );
    const recentNav = await db.all<{
      nav_date: string; nav_value: number; daily_return: number | null;
    }>(
      'SELECT nav_date, nav_value, daily_return FROM market_index_nav_history WHERE index_id = ? ORDER BY nav_date DESC LIMIT 30', id
    );

    return { ...index, holdings, recentNav };
  }

  async function listIndexes(params: {
    status?: string;
    indexType?: string;
    query?: string;
    limit?: number;
  }) {
    let where = 'WHERE 1=1';
    const args: unknown[] = [];

    if (params.status) { where += ' AND status = ?'; args.push(params.status); }
    if (params.indexType) { where += ' AND index_type = ?'; args.push(params.indexType); }
    if (params.query) {
      where += ` AND (${ilike(db.dialect, 'name')} OR ${ilike(db.dialect, 'description')})`;
      args.push(`%${params.query}%`, `%${params.query}%`);
    }

    args.push(params.limit ?? 50);

    return await db.all<IndexRow>(
      `SELECT * FROM market_indexes ${where} ORDER BY updated_at DESC LIMIT ?`, ...args
    );
  }

  async function updateIndex(id: string, updates: {
    name?: string;
    description?: string;
    status?: string;
    philosophy?: string;
    maxHoldings?: number;
    rebalanceFrequency?: string;
    weightingMethod?: string;
    benchmarkSymbol?: string;
  }) {
    const fields: string[] = [];
    const args: unknown[] = [];

    if (updates.name !== undefined) { fields.push('name = ?'); args.push(updates.name); }
    if (updates.description !== undefined) { fields.push('description = ?'); args.push(updates.description); }
    if (updates.status !== undefined) { fields.push('status = ?'); args.push(updates.status); }
    if (updates.philosophy !== undefined) { fields.push('philosophy = ?'); args.push(updates.philosophy); }
    if (updates.maxHoldings !== undefined) { fields.push('max_holdings = ?'); args.push(updates.maxHoldings); }
    if (updates.rebalanceFrequency !== undefined) { fields.push('rebalance_frequency = ?'); args.push(updates.rebalanceFrequency); }
    if (updates.weightingMethod !== undefined) { fields.push('weighting_method = ?'); args.push(updates.weightingMethod); }
    if (updates.benchmarkSymbol !== undefined) { fields.push('benchmark_symbol = ?'); args.push(updates.benchmarkSymbol); }

    if (fields.length === 0) return;
    fields.push("updated_at = NOW()");
    args.push(id);

    await db.run(`UPDATE market_indexes SET ${fields.join(', ')} WHERE id = ?`, ...args);
  }

  async function deleteIndex(id: string) {
    await db.run('DELETE FROM market_indexes WHERE id = ?', id);
  }

  async function activateIndex(id: string) {
    await db.run(`
      UPDATE market_indexes SET status = 'active', inception_date = NOW(), updated_at = NOW()
      WHERE id = ?
    `, id);
  }

  // ── Holdings ─────────────────────────────────────────────────────────────

  async function addHolding(indexId: string, params: {
    symbol: string;
    name?: string;
    weight: number;
    shares?: number;
    entryPrice?: number;
  }) {
    await db.run(`
      INSERT INTO market_index_holdings (index_id, symbol, name, weight, shares, entry_price)
      VALUES (?, ?, ?, ?, ?, ?)
    `, indexId, params.symbol, params.name ?? null, params.weight,
       params.shares ?? 0, params.entryPrice ?? null);
  }

  async function removeHolding(indexId: string, symbol: string) {
    await db.run(
      "UPDATE market_index_holdings SET removed_at = NOW() WHERE index_id = ? AND symbol = ? AND removed_at IS NULL",
      indexId, symbol
    );
  }

  async function getActiveHoldings(indexId: string) {
    return await db.all<HoldingRow>(
      'SELECT * FROM market_index_holdings WHERE index_id = ? AND removed_at IS NULL ORDER BY weight DESC', indexId
    );
  }

  // ── NAV ──────────────────────────────────────────────────────────────────

  async function recordNav(indexId: string, params: {
    navDate: string;
    navValue: number;
    dailyReturn?: number;
    cumulativeReturn?: number;
    benchmarkValue?: number;
  }) {
    await db.run(`
      INSERT INTO market_index_nav_history (index_id, nav_date, nav_value, daily_return, cumulative_return, benchmark_value)
      VALUES (?, ?, ?, ?, ?, ?)
    `, indexId, params.navDate, params.navValue, params.dailyReturn ?? null,
       params.cumulativeReturn ?? null, params.benchmarkValue ?? null);

    await db.run('UPDATE market_indexes SET current_nav = ?, total_return = ?, updated_at = NOW() WHERE id = ?',
                  params.navValue, params.cumulativeReturn ?? 0, indexId);
  }

  async function getNavHistory(indexId: string, limit = 365) {
    return await db.all<{
      nav_date: string; nav_value: number; daily_return: number | null;
      cumulative_return: number | null; benchmark_value: number | null;
    }>(
      'SELECT * FROM market_index_nav_history WHERE index_id = ? ORDER BY nav_date DESC LIMIT ?', indexId, limit
    );
  }

  // ── Leaderboard ──────────────────────────────────────────────────────────

  async function getLeaderboard(period = '1m') {
    // Use materialized view on PostgreSQL for pre-ranked leaderboard
    if (db.dialect === 'postgresql') {
      try {
        const rows = await db.all<{
          index_id: string; total_return: number; annualized_return: number | null;
          sharpe_ratio: number | null; max_drawdown: number | null; rank_position: number | null;
          index_name: string; computed_rank: number;
        }>(
          'SELECT * FROM mv_index_leaderboard_ranked WHERE period = ? ORDER BY computed_rank ASC', period
        );
        if (rows.length > 0) return rows;
      } catch { /* materialized view may not exist yet — fall through */ }
    }

    return await db.all<{
      index_id: string; total_return: number; annualized_return: number | null;
      sharpe_ratio: number | null; max_drawdown: number | null; rank_position: number | null;
    } & { index_name: string }>(
      `SELECT lb.*, mi.name as index_name
       FROM market_index_leaderboard lb
       JOIN market_indexes mi ON lb.index_id = mi.id
       WHERE lb.period = ?
       ORDER BY lb.total_return DESC`, period
    );
  }

  // ── Stats ────────────────────────────────────────────────────────────────

  async function getIndexStats() {
    // Use materialized view on PostgreSQL
    if (db.dialect === 'postgresql') {
      try {
        const mvRows = await db.all<{ index_id: string; name: string; status: string; total_return: number; active_holdings: number }>(
          'SELECT * FROM mv_index_stats'
        );
        if (mvRows.length > 0) {
          const total = mvRows.length;
          const active = mvRows.filter(r => r.status === 'active').length;
          const activeSorted = mvRows.filter(r => r.status === 'active').sort((a, b) => b.total_return - a.total_return);
          const bestPerformer = activeSorted[0] ? { name: activeSorted[0].name, total_return: activeSorted[0].total_return } : undefined;
          return { total, active, bestPerformer };
        }
      } catch { /* materialized view may not exist yet — fall through */ }
    }

    const total = await db.get<{ n: number }>("SELECT COUNT(*) as n FROM market_indexes");
    const active = await db.get<{ n: number }>("SELECT COUNT(*) as n FROM market_indexes WHERE status = 'active'");
    const bestPerformer = await db.get<{ name: string; total_return: number }>(
      "SELECT name, total_return FROM market_indexes WHERE status = 'active' ORDER BY total_return DESC LIMIT 1"
    );
    return {
      total: total?.n ?? 0,
      active: active?.n ?? 0,
      bestPerformer,
    };
  }

  return {
    createIndex,
    getIndex,
    listIndexes,
    updateIndex,
    deleteIndex,
    activateIndex,
    addHolding,
    removeHolding,
    getActiveHoldings,
    recordNav,
    getNavHistory,
    getLeaderboard,
    getIndexStats,
  };
}

export type MarketIndexService = Awaited<ReturnType<typeof createMarketIndexService>>;
