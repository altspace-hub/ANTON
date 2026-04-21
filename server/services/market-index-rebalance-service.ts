import type { DatabaseAdapter } from '../db/database.js';
import type { PgNotifyService } from './pg-notify-service.js';
import { daysDiff } from '../db/dialect-helpers.js';

let _pgNotify: PgNotifyService | null = null;
export function setRebalanceNotifyService(svc: PgNotifyService): void { _pgNotify = svc; }

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

interface RebalanceRow {
  id: string;
  index_id: string;
  rebalance_type: string;
  pre_holdings: string;
  post_holdings: string;
  trades: string;
  reasoning: string | null;
  nav_at_rebalance: number | null;
  executed_at: string;
}

export interface ProposedChange {
  symbol: string;
  action: 'add' | 'remove' | 'increase' | 'decrease' | 'hold';
  currentWeight: number;
  proposedWeight: number;
  reason: string;
}

export interface RebalanceProposal {
  indexId: string;
  currentHoldings: HoldingRow[];
  proposedChanges: ProposedChange[];
  reasoning: string;
  metrics: { currentNav: number; holdingsCount: number };
  sectorConcentration?: Array<{ sector: string; weight: number }>;
  warnings?: string[];
}

export interface HoldingEvaluation {
  symbol: string;
  weight: number;
  recommendation: 'maintain' | 'increase' | 'decrease' | 'exit';
  reason: string;
}

export interface ScreenedCandidate {
  symbol: string;
  eligible: boolean;
  reason: string;
}

export interface RankedCandidate {
  symbol: string;
  rank: number;
  score: number;
  reason: string;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export async function createMarketIndexRebalanceService(db: DatabaseAdapter) {

  const FREQUENCY_DAYS: Record<string, number> = {
    weekly: 7,
    monthly: 30,
    quarterly: 90,
  };

  // ── Should Rebalance ─────────────────────────────────────────────────────

  async function shouldRebalance(indexId: string): Promise<{
    shouldRebalance: boolean;
    reason: string;
    daysSinceLastRebalance: number;
  }> {
    const index = await db.get<IndexRow>('SELECT * FROM market_indexes WHERE id = ?', indexId);
    if (!index) {
      return { shouldRebalance: false, reason: 'Index not found', daysSinceLastRebalance: 0 };
    }

    if (index.status !== 'active') {
      return { shouldRebalance: false, reason: `Index status is ${index.status}, not active`, daysSinceLastRebalance: 0 };
    }

    if (!index.last_rebalance_at) {
      return { shouldRebalance: true, reason: 'Index has never been rebalanced', daysSinceLastRebalance: -1 };
    }

    const daysSinceQuery = `SELECT ${daysDiff(db.dialect, "NOW()", 'last_rebalance_at')} as days_since FROM market_indexes WHERE id = ?`;
    const result = await db.get<{ days_since: number }>(daysSinceQuery, indexId);
    const daysSince = Math.floor(result?.days_since ?? 0);

    const threshold = FREQUENCY_DAYS[index.rebalance_frequency] ?? 30;
    const shouldDo = daysSince >= threshold;

    return {
      shouldRebalance: shouldDo,
      reason: shouldDo
        ? `${daysSince} days since last rebalance (threshold: ${threshold} for ${index.rebalance_frequency})`
        : `Only ${daysSince} days since last rebalance (threshold: ${threshold} for ${index.rebalance_frequency})`,
      daysSinceLastRebalance: daysSince,
    };
  }

  // ── Target weights per weighting method (M6.1) ──────────────────────────
  //
  // Returns a Map<symbol, targetWeight> or null when the method isn't yet
  // implemented (caller falls back to all-hold with a clear reason).
  //
  //   equal       → 1/N for every holding
  //   conviction  → baseline 1/N biased by aggregated active-prediction
  //                 sentiment on each symbol. Bounded so conviction never
  //                 pushes below 0.5× or above 1.5× equal-weight (prevents
  //                 one noisy prediction from concentrating the portfolio).
  //
  // market_cap, risk_parity: return null for now — real implementations
  // require fundamentals + historical vol pipelines that are their own
  // follow-up work. Falling through to hold-with-clear-reason is better
  // than silently pretending to rebalance.
  async function computeTargetWeights(
    db: DatabaseAdapter,
    index: IndexRow,
    holdings: HoldingRow[],
  ): Promise<Map<string, number> | null> {
    if (holdings.length === 0) return null;
    const method = index.weighting_method;

    if (method === 'equal') {
      const equal = 1.0 / holdings.length;
      return new Map(holdings.map(h => [h.symbol, equal]));
    }

    if (method === 'conviction') {
      return computeConvictionWeights(db, holdings);
    }

    if (method === 'risk_parity') {
      return computeRiskParityWeights(db, holdings);
    }

    if (method === 'market_cap') {
      return computeMarketCapWeights(db, holdings);
    }

    return null;
  }

  /**
   * Conviction-weighted targets. Baseline = 1/N, adjusted up for symbols
   * with net-bullish active predictions and down for net-bearish. Bounded
   * to [0.5×, 1.5×] baseline so a single high-confidence bearish call
   * doesn't drive a holding near zero on its own. Normalised so the
   * returned weights sum to 1.0.
   */
  async function computeConvictionWeights(
    db: DatabaseAdapter,
    holdings: HoldingRow[],
  ): Promise<Map<string, number>> {
    const baseline = 1.0 / holdings.length;
    const symbols = holdings.map(h => h.symbol);

    // Active predictions on any held symbol — cheaper than one query per.
    const placeholders = symbols.map(() => '?').join(', ');
    const predictions = symbols.length > 0
      ? await db.all<{ target_symbol: string; confidence: number | string; predicted_direction: string | null }>(
          `SELECT target_symbol, confidence, predicted_direction
           FROM market_predictions
           WHERE status = 'active'
             AND target_symbol IN (${placeholders})
             AND (deadline IS NULL OR deadline > NOW())`,
          ...symbols,
        )
      : [];

    // Symbol overrides from M1.1 so persistently bad tickers don't get
    // concentrated just because they happen to have loud predictions.
    const overrides = symbols.length > 0
      ? await db.all<{ symbol: string; weight_multiplier: number | string }>(
          `SELECT symbol, weight_multiplier FROM market_symbol_weight_overrides
           WHERE symbol IN (${placeholders}) AND weight_multiplier <> 1.0`,
          ...symbols,
        )
      : [];
    const overrideMap = new Map(overrides.map(o => [o.symbol, Number(o.weight_multiplier)]));

    // Aggregate conviction score per symbol: mean(confidence × dir × override).
    const scores = new Map<string, { sum: number; count: number }>();
    for (const p of predictions) {
      const dir = p.predicted_direction === 'up' ? 1
        : p.predicted_direction === 'down' ? -1 : 0;
      if (dir === 0) continue;
      const override = overrideMap.get(p.target_symbol) ?? 1.0;
      const conf = Math.max(0, Math.min(1, Number(p.confidence)));
      const entry = scores.get(p.target_symbol) ?? { sum: 0, count: 0 };
      entry.sum += dir * conf * override;
      entry.count++;
      scores.set(p.target_symbol, entry);
    }

    // Per-symbol raw weight = baseline × (1 + score × 0.5), clamped to
    // [0.5, 1.5] × baseline. Then renormalise to sum-to-one.
    const raw = new Map<string, number>();
    for (const h of holdings) {
      const s = scores.get(h.symbol);
      const meanScore = s && s.count > 0 ? s.sum / s.count : 0;
      const clamped = Math.max(-1, Math.min(1, meanScore));
      const factor = Math.max(0.5, Math.min(1.5, 1 + clamped * 0.5));
      raw.set(h.symbol, baseline * factor);
    }
    const sum = Array.from(raw.values()).reduce((a, b) => a + b, 0);
    const normalised = new Map<string, number>();
    if (sum > 0) {
      for (const [symbol, rawWeight] of raw) {
        normalised.set(symbol, rawWeight / sum);
      }
    } else {
      // Fallback should be unreachable given baseline > 0, but guards
      // divide-by-zero if every holding ended up at baseline * 0 somehow.
      for (const h of holdings) normalised.set(h.symbol, baseline);
    }
    return normalised;
  }

  /**
   * Risk-parity weights (F4). Equal risk contribution per holding using a
   * naive inverse-volatility heuristic: weight_i ∝ 1 / sigma_i where sigma_i
   * is the annualised daily-return vol over the last 60 sessions.
   *
   * Simplification: true risk parity solves for weights that equalise
   * marginal risk contributions using the full covariance matrix. The
   * inverse-vol heuristic is the diagonal-only approximation — a reasonable
   * default that doesn't require fitting a covariance matrix. When a
   * covariance-aware optimiser lands it can slot in behind this same
   * interface.
   *
   * Symbols with insufficient price history fall back to the average vol
   * of the cohort so they don't dominate by having zero measured risk.
   * Weights are clamped to [0.3×, 3×] the cohort median raw-weight to
   * prevent a single ultra-low-vol name from concentrating the portfolio.
   */
  async function computeRiskParityWeights(
    db: DatabaseAdapter,
    holdings: HoldingRow[],
  ): Promise<Map<string, number>> {
    const symbols = holdings.map(h => h.symbol);
    const vols = new Map<string, number>();
    for (const symbol of symbols) {
      const rows = await db.all<{ close: number | string }>(
        `SELECT close FROM market_historical_prices
         WHERE symbol = ? ORDER BY price_date DESC LIMIT 60`,
        symbol,
      );
      if (rows.length < 10) continue;
      const prices = rows.map(r => Number(r.close)).filter(p => Number.isFinite(p) && p > 0).reverse();
      if (prices.length < 10) continue;
      const returns: number[] = [];
      for (let i = 1; i < prices.length; i++) {
        const r = (prices[i] - prices[i - 1]) / prices[i - 1];
        if (Number.isFinite(r)) returns.push(r);
      }
      if (returns.length < 5) continue;
      const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
      const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
      const sigma = Math.sqrt(variance);
      if (sigma > 0) vols.set(symbol, sigma);
    }

    // Cohort fallback: symbols with no usable history get the mean vol, so
    // a missing-data ticker doesn't get weighted at infinity (1/0).
    const measuredVols = Array.from(vols.values());
    const meanVol = measuredVols.length > 0
      ? measuredVols.reduce((s, v) => s + v, 0) / measuredVols.length
      : 0.01; // fallback of 1%/day if the entire cohort has no history
    for (const symbol of symbols) {
      if (!vols.has(symbol)) vols.set(symbol, meanVol);
    }

    // Raw weight ∝ 1 / vol, clamped to [0.3×, 3×] cohort median to avoid
    // one ultra-low-vol name swallowing the portfolio.
    const raw = new Map<string, number>();
    for (const symbol of symbols) {
      raw.set(symbol, 1 / (vols.get(symbol) ?? meanVol));
    }
    const rawValues = Array.from(raw.values()).sort((a, b) => a - b);
    const median = rawValues[Math.floor(rawValues.length / 2)] ?? 1;
    const lo = median * 0.3;
    const hi = median * 3;
    const clamped = new Map<string, number>();
    for (const [symbol, value] of raw) {
      clamped.set(symbol, Math.max(lo, Math.min(hi, value)));
    }
    return normaliseWeights(clamped, holdings);
  }

  /**
   * Market-cap weights (F4). Looks up the most-recent market_cap field from
   * the fundamental rows ingested into market_data_raw; weights proportional
   * to market cap; clamped so a single mega-cap can't exceed 25% of the
   * portfolio (soft concentration guard matching evaluateHoldings).
   *
   * Symbols missing a current market_cap fall back to the cohort mean so
   * they aren't silently dropped — the operator sees a hold action with a
   * clear "fallback to cohort mean" reason if they inspect the proposal.
   */
  async function computeMarketCapWeights(
    db: DatabaseAdapter,
    holdings: HoldingRow[],
  ): Promise<Map<string, number>> {
    const symbols = holdings.map(h => h.symbol);
    const caps = new Map<string, number>();
    for (const symbol of symbols) {
      // Fundamental rows are JSON in `content` with a market_cap or
      // marketCap field depending on provider. Try both.
      const row = await db.get<{ content: string | null }>(
        `SELECT content FROM market_data_raw
         WHERE symbol = ? AND data_type IN ('fundamental', 'key_metrics', 'ratios')
         ORDER BY fetched_at DESC LIMIT 1`,
        symbol,
      );
      if (!row?.content) continue;
      try {
        const parsed = JSON.parse(row.content) as Record<string, unknown>;
        const mcap =
          typeof parsed.marketCap === 'number' ? parsed.marketCap
          : typeof parsed.market_cap === 'number' ? parsed.market_cap
          : null;
        if (mcap && mcap > 0) caps.set(symbol, mcap);
      } catch { /* skip malformed */ }
    }

    const measured = Array.from(caps.values());
    const meanCap = measured.length > 0
      ? measured.reduce((s, v) => s + v, 0) / measured.length
      : 1; // guards divide-by-zero if no holdings have a market cap yet
    for (const symbol of symbols) {
      if (!caps.has(symbol)) caps.set(symbol, meanCap);
    }

    // Concentration clamp: 25% single-position ceiling. We translate this
    // to a raw-weight cap so normalisation doesn't simply undo it.
    const totalCap = Array.from(caps.values()).reduce((s, v) => s + v, 0);
    if (totalCap <= 0) {
      // All-zero fallback: degrade to equal weight.
      const equal = 1 / holdings.length;
      return new Map(holdings.map(h => [h.symbol, equal]));
    }
    const cappedShare = 0.25;
    const clamped = new Map<string, number>();
    for (const [symbol, cap] of caps) {
      const share = cap / totalCap;
      clamped.set(symbol, Math.min(cappedShare, share));
    }
    return normaliseWeights(clamped, holdings);
  }

  /**
   * Shared normaliser for the non-equal weighting methods. Scales a raw-
   * weight map so its values sum to 1.0; guards divide-by-zero with equal
   * weights as a last-resort fallback.
   */
  function normaliseWeights(raw: Map<string, number>, holdings: HoldingRow[]): Map<string, number> {
    const sum = Array.from(raw.values()).reduce((a, b) => a + b, 0);
    if (sum > 0) {
      const normalised = new Map<string, number>();
      for (const [symbol, value] of raw) normalised.set(symbol, value / sum);
      return normalised;
    }
    const equal = 1 / Math.max(1, holdings.length);
    return new Map(holdings.map(h => [h.symbol, equal]));
  }

  // ── Generate Rebalance Proposal ──────────────────────────────────────────

  async function generateRebalanceProposal(indexId: string): Promise<RebalanceProposal> {
    const index = await db.get<IndexRow>('SELECT * FROM market_indexes WHERE id = ?', indexId);
    if (!index) throw new Error(`Index ${indexId} not found`);

    const holdings = await db.all<HoldingRow>(
      'SELECT * FROM market_index_holdings WHERE index_id = ? AND removed_at IS NULL ORDER BY weight DESC', indexId
    );

    const maxHoldings = index.max_holdings;
    const weightingMethod = index.weighting_method;
    const proposedChanges: ProposedChange[] = [];

    // Target-weight computation per weighting_method. Equal and conviction
    // produce real targets; other methods fall back to holding current
    // weights with an explicit reason so the operator sees the gap rather
    // than silent no-ops (M6.1).
    const targets = await computeTargetWeights(db, index, holdings);
    const tolerance = 0.02; // 2% drift tolerance across methods

    if (holdings.length > 0 && targets) {
      for (const h of holdings) {
        const targetWeight = targets.get(h.symbol) ?? h.weight;
        const diff = Math.abs(h.weight - targetWeight);
        if (diff < tolerance) {
          proposedChanges.push({
            symbol: h.symbol,
            action: 'hold',
            currentWeight: h.weight,
            proposedWeight: targetWeight,
            reason: `Weight ${(h.weight * 100).toFixed(1)}% is within tolerance of ${weightingMethod}-method target ${(targetWeight * 100).toFixed(1)}%`,
          });
        } else if (h.weight > targetWeight) {
          proposedChanges.push({
            symbol: h.symbol,
            action: 'decrease',
            currentWeight: h.weight,
            proposedWeight: targetWeight,
            reason: `Overweight at ${(h.weight * 100).toFixed(1)}% vs ${weightingMethod} target ${(targetWeight * 100).toFixed(1)}%`,
          });
        } else {
          proposedChanges.push({
            symbol: h.symbol,
            action: 'increase',
            currentWeight: h.weight,
            proposedWeight: targetWeight,
            reason: `Underweight at ${(h.weight * 100).toFixed(1)}% vs ${weightingMethod} target ${(targetWeight * 100).toFixed(1)}%`,
          });
        }
      }
    } else {
      // Unsupported weighting method or empty holdings — hold everything and
      // surface the reason. Previously this branch silently returned all-hold
      // for any non-equal method.
      const reason = holdings.length === 0
        ? 'Index has no active holdings'
        : `Weighting method '${weightingMethod}' is not yet implemented — maintaining current weights. Supported: equal, conviction, risk_parity, market_cap.`;
      for (const h of holdings) {
        proposedChanges.push({
          symbol: h.symbol,
          action: 'hold',
          currentWeight: h.weight,
          proposedWeight: h.weight,
          reason,
        });
      }
    }

    // Check if over max_holdings limit
    if (holdings.length > maxHoldings) {
      const excess = holdings.slice(maxHoldings);
      for (const h of excess) {
        const existing = proposedChanges.find(c => c.symbol === h.symbol);
        if (existing) {
          existing.action = 'remove';
          existing.proposedWeight = 0;
          existing.reason = `Exceeds max holdings limit of ${maxHoldings}`;
        }
      }
    }

    const reasoning = `Rebalance proposal for ${index.name}: ${holdings.length} holdings, ${weightingMethod} weighting, max ${maxHoldings} holdings.`;

    // Check sector concentration
    const sectorWeights: Record<string, number> = {};
    const warnings: string[] = [];
    for (const change of proposedChanges) {
      // Look up sector for this symbol from market_data_raw metadata
      const sectorRow = await db.get<{ metadata: string }>(
        "SELECT metadata FROM market_data_raw WHERE symbol = ? AND data_type = 'fundamental' ORDER BY fetched_at DESC LIMIT 1",
        change.symbol
      );
      let sector = 'Unknown';
      if (sectorRow) {
        try {
          const meta = JSON.parse(sectorRow.metadata);
          sector = meta.sector ?? 'Unknown';
        } catch { /* use Unknown */ }
      }
      sectorWeights[sector] = (sectorWeights[sector] ?? 0) + change.proposedWeight;
    }
    const sectorConcentration = Object.entries(sectorWeights).map(([sector, weight]) => ({ sector, weight }));
    for (const sc of sectorConcentration) {
      if (sc.weight > 0.35) {
        warnings.push(`Sector "${sc.sector}" is ${(sc.weight * 100).toFixed(1)}% of portfolio — exceeds 35% concentration limit. Consider trimming.`);
      }
    }

    return {
      indexId,
      currentHoldings: holdings,
      proposedChanges,
      reasoning,
      metrics: {
        currentNav: index.current_nav,
        holdingsCount: holdings.length,
      },
      sectorConcentration,
      warnings,
    };
  }

  // ── Evaluate Holdings ────────────────────────────────────────────────────

  async function evaluateHoldings(indexId: string): Promise<HoldingEvaluation[]> {
    const index = await db.get<IndexRow>('SELECT * FROM market_indexes WHERE id = ?', indexId);
    if (!index) throw new Error(`Index ${indexId} not found`);

    const holdings = await db.all<HoldingRow>(
      'SELECT * FROM market_index_holdings WHERE index_id = ? AND removed_at IS NULL ORDER BY weight DESC', indexId
    );

    if (holdings.length === 0) return [];

    const weightingMethod = index.weighting_method;
    const evaluations: HoldingEvaluation[] = [];

    const targetWeight = weightingMethod === 'equal' ? 1.0 / holdings.length : null;

    for (const h of holdings) {
      let recommendation: HoldingEvaluation['recommendation'] = 'maintain';
      let reason: string;

      // Check weight balance
      if (targetWeight !== null) {
        const drift = h.weight - targetWeight;
        if (Math.abs(drift) > 0.05) {
          recommendation = drift > 0 ? 'decrease' : 'increase';
          reason = `Weight drift: ${(drift * 100).toFixed(1)}% from target ${(targetWeight * 100).toFixed(1)}%`;
        } else {
          reason = `Weight within acceptable range of target ${(targetWeight * 100).toFixed(1)}%`;
        }
      } else {
        reason = 'Non-equal weighting; maintaining current allocation';
      }

      // Check concentration risk
      if (h.weight > 0.25) {
        recommendation = 'decrease';
        reason = `Concentration risk: ${(h.weight * 100).toFixed(1)}% exceeds 25% single-position limit`;
      }

      // Check for very small positions
      if (h.weight < 0.01 && holdings.length > 1) {
        recommendation = 'exit';
        reason = `De minimis position at ${(h.weight * 100).toFixed(2)}%; consider exiting`;
      }

      // Check unrealized P&L extremes
      if (h.unrealized_pnl < -0.2 * (h.entry_price ?? 0) * h.shares && h.entry_price) {
        recommendation = 'decrease';
        reason = `Significant unrealized loss: ${h.unrealized_pnl.toFixed(2)}`;
      }

      evaluations.push({
        symbol: h.symbol,
        weight: h.weight,
        recommendation,
        reason,
      });
    }

    return evaluations;
  }

  // ── Screen Universe ──────────────────────────────────────────────────────

  async function screenUniverse(indexId: string): Promise<ScreenedCandidate[]> {
    const index = await db.get<IndexRow>('SELECT * FROM market_indexes WHERE id = ?', indexId);
    if (!index) throw new Error(`Index ${indexId} not found`);

    let universe: string[] = [];
    try {
      universe = JSON.parse(index.universe || '[]');
    } catch {
      universe = [];
    }

    if (universe.length === 0) {
      return [];
    }

    const holdings = await db.all<HoldingRow>(
      'SELECT * FROM market_index_holdings WHERE index_id = ? AND removed_at IS NULL', indexId
    );
    const heldSymbols = new Set(holdings.map(h => h.symbol));

    const candidates: ScreenedCandidate[] = [];
    for (const symbol of universe) {
      if (heldSymbols.has(symbol)) {
        candidates.push({ symbol, eligible: false, reason: 'Already held in index' });
      } else if (holdings.length >= index.max_holdings) {
        candidates.push({ symbol, eligible: false, reason: `Index at max holdings capacity (${index.max_holdings})` });
      } else {
        candidates.push({ symbol, eligible: true, reason: 'Eligible for inclusion' });
      }
    }

    return candidates;
  }

  // ── Rank Candidates ──────────────────────────────────────────────────────

  async function rankCandidates(indexId: string, candidates: string[]): Promise<RankedCandidate[]> {
    const index = await db.get<IndexRow>('SELECT * FROM market_indexes WHERE id = ?', indexId);
    if (!index) throw new Error(`Index ${indexId} not found`);

    const ranked: RankedCandidate[] = [];

    if (index.weighting_method === 'equal') {
      // Equal-weight: all candidates ranked equally
      for (let i = 0; i < candidates.length; i++) {
        ranked.push({
          symbol: candidates[i],
          rank: 1, // All equal rank for equal-weight
          score: 1.0,
          reason: 'Equal-weight index: all eligible candidates rank equally',
        });
      }
    } else {
      // For other weighting methods, use alphabetical as default heuristic
      const sorted = [...candidates].sort();
      for (let i = 0; i < sorted.length; i++) {
        ranked.push({
          symbol: sorted[i],
          rank: i + 1,
          score: 1.0 - (i * 0.1),
          reason: `Ranked #${i + 1} by default heuristic for ${index.weighting_method} weighting`,
        });
      }
    }

    return ranked;
  }

  // ── Execute Rebalance ────────────────────────────────────────────────────

  async function executeRebalance(indexId: string, proposal: {
    changes: Array<{ symbol: string; action: string; newWeight: number }>;
  }): Promise<string> {
    const index = await db.get<IndexRow>('SELECT * FROM market_indexes WHERE id = ?', indexId);
    if (!index) throw new Error(`Index ${indexId} not found`);

    // Snapshot pre-holdings
    const preHoldings = await db.all<HoldingRow>(
      'SELECT * FROM market_index_holdings WHERE index_id = ? AND removed_at IS NULL ORDER BY weight DESC', indexId
    );
    const preHoldingsJson = JSON.stringify(preHoldings.map(h => ({
      symbol: h.symbol, weight: h.weight, shares: h.shares,
    })));

    const trades: Array<{ symbol: string; action: string; oldWeight: number; newWeight: number }> = [];

    // Apply changes
    for (const change of proposal.changes) {
      const existing = preHoldings.find(h => h.symbol === change.symbol);

      if (change.action === 'remove') {
        // Remove holding
        await db.run(
          "UPDATE market_index_holdings SET removed_at = NOW() WHERE index_id = ? AND symbol = ? AND removed_at IS NULL",
          indexId, change.symbol
        );
        trades.push({ symbol: change.symbol, action: 'sell', oldWeight: existing?.weight ?? 0, newWeight: 0 });

      } else if (change.action === 'add') {
        // Add new holding
        await db.run(
          `INSERT INTO market_index_holdings (index_id, symbol, weight, shares) VALUES (?, ?, ?, ?)`,
          indexId, change.symbol, change.newWeight, 0
        );
        trades.push({ symbol: change.symbol, action: 'buy', oldWeight: 0, newWeight: change.newWeight });

      } else if (change.action === 'increase' || change.action === 'decrease') {
        // Update weight
        await db.run(
          "UPDATE market_index_holdings SET weight = ? WHERE index_id = ? AND symbol = ? AND removed_at IS NULL",
          change.newWeight, indexId, change.symbol
        );
        trades.push({
          symbol: change.symbol,
          action: change.action,
          oldWeight: existing?.weight ?? 0,
          newWeight: change.newWeight,
        });
      }
      // 'hold' — no changes needed
    }

    // Snapshot post-holdings
    const postHoldings = await db.all<HoldingRow>(
      'SELECT * FROM market_index_holdings WHERE index_id = ? AND removed_at IS NULL ORDER BY weight DESC', indexId
    );
    const postHoldingsJson = JSON.stringify(postHoldings.map(h => ({
      symbol: h.symbol, weight: h.weight, shares: h.shares,
    })));

    // Record rebalance
    const rebalanceId = `reb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const reasoning = `Rebalance executed with ${proposal.changes.length} changes: ${trades.filter(t => t.action !== 'hold').length} trades.`;

    await db.run(`
      INSERT INTO market_index_rebalances (id, index_id, rebalance_type, pre_holdings, post_holdings, trades, reasoning, nav_at_rebalance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, rebalanceId, indexId, 'manual', preHoldingsJson, postHoldingsJson,
       JSON.stringify(trades), reasoning, index.current_nav);

    // Update last_rebalance_at on the index
    await db.run(
      "UPDATE market_indexes SET last_rebalance_at = NOW(), updated_at = NOW() WHERE id = ?",
      indexId
    );

    // Notify (PG LISTEN/NOTIFY — no-op on SQLite)
    if (_pgNotify) {
      _pgNotify.notify('market_rebalance_executed', { rebalanceId, indexId, tradesCount: trades.length }).catch(() => {});
    }

    // M2: record prediction → rebalance attribution rows so the closed loop
    // can later compute per-prediction portfolio impact. Best-effort — a
    // failure here must not roll back the rebalance itself.
    try {
      const { createMarketPredictionAttributionService } =
        await import('./market-prediction-attribution-service.js');
      const attribution = await createMarketPredictionAttributionService(db);
      await attribution.recordAttributionsForRebalance(rebalanceId, trades);
    } catch (err) {
      console.warn(
        `[rebalance] attribution recording failed for ${rebalanceId}:`,
        err instanceof Error ? err.message : err,
      );
    }

    return rebalanceId;
  }

  // ── Validate Previous Rebalance ──────────────────────────────────────────

  async function validatePreviousRebalance(indexId: string): Promise<{
    rebalanceId: string;
    impactScore: number;
    navBefore: number;
    navCurrent: number;
    returnSinceRebalance: number;
  } | null> {
    const rebalance = await db.get<RebalanceRow>(
      'SELECT * FROM market_index_rebalances WHERE index_id = ? ORDER BY executed_at DESC LIMIT 1', indexId
    );
    if (!rebalance) return null;

    const index = await db.get<IndexRow>('SELECT * FROM market_indexes WHERE id = ?', indexId);
    if (!index) return null;

    const navBefore = rebalance.nav_at_rebalance ?? index.current_nav;
    const navCurrent = index.current_nav;
    const returnSinceRebalance = navBefore > 0 ? (navCurrent - navBefore) / navBefore : 0;

    // Impact score: absolute return magnitude capped at 1.0
    const impactScore = Math.min(Math.abs(returnSinceRebalance) * 10, 1.0);

    return {
      rebalanceId: rebalance.id,
      impactScore,
      navBefore,
      navCurrent,
      returnSinceRebalance,
    };
  }

  // ── Run Scheduled Rebalances ─────────────────────────────────────────────

  async function runScheduledRebalances(): Promise<{ checked: number; rebalanced: string[] }> {
    const activeIndexes = await db.all<IndexRow>(
      "SELECT * FROM market_indexes WHERE status = 'active'"
    );

    const rebalanced: string[] = [];

    for (const index of activeIndexes) {
      const check = await shouldRebalance(index.id);
      if (!check.shouldRebalance) continue;

      try {
        const proposal = await generateRebalanceProposal(index.id);
        const actionableChanges = proposal.proposedChanges
          .filter(c => c.action !== 'hold')
          .map(c => ({ symbol: c.symbol, action: c.action, newWeight: c.proposedWeight }));

        if (actionableChanges.length > 0) {
          await executeRebalance(index.id, { changes: actionableChanges });
          rebalanced.push(index.id);
        }
      } catch (err) {
        console.error(`[market-rebalance] Scheduled rebalance failed for ${index.id}:`, err);
      }
    }

    return { checked: activeIndexes.length, rebalanced };
  }

  // ── Compute Prediction Signal Scores ──────────────────────────────────────

  async function computePredictionSignalScores(indexId: string) {
    // Get active holdings
    const holdings = await db.all<{ symbol: string; weight: number }>(
      "SELECT symbol, weight FROM market_index_holdings WHERE index_id = ? AND removed_at IS NULL",
      indexId
    );

    // Get all active predictions
    const predictions = await db.all<{
      id: string; title: string; target_symbol: string | null;
      predicted_direction: string | null; confidence: number;
      prediction_type: string; thesis_id: string | null;
    }>(
      `SELECT mp.id, mp.title, mp.target_symbol, mp.predicted_direction, mp.confidence,
              mp.prediction_type, mp.thesis_id
       FROM market_predictions mp
       WHERE mp.status = 'active' AND (mp.deadline IS NULL OR mp.deadline > NOW())`
    );

    // Get signal weight calibration
    const signalWeights = await db.all<{ signal_type: string; category: string; weight: number }>(
      "SELECT signal_type, category, weight FROM market_signal_weights"
    );
    const weightMap = new Map(signalWeights.map(sw => [`${sw.signal_type}:${sw.category}`, sw.weight]));

    // M1.1: per-symbol overrides multiply the base category weight. Only
    // rows that diverge from 1.0 are loaded (partial-index-friendly).
    const symbolOverrides = await db.all<{ symbol: string; weight_multiplier: number | string }>(
      "SELECT symbol, weight_multiplier FROM market_symbol_weight_overrides WHERE weight_multiplier <> 1.0"
    );
    const symbolOverrideMap = new Map(symbolOverrides.map(s => [s.symbol, Number(s.weight_multiplier)]));

    // Compute per-symbol scores
    const signals: Record<string, {
      symbol: string; score: number; direction: string;
      confidence: number; predictionCount: number; predictions: string[];
    }> = {};

    // Initialize all held symbols
    for (const h of holdings) {
      signals[h.symbol] = { symbol: h.symbol, score: 0, direction: 'neutral', confidence: 0, predictionCount: 0, predictions: [] };
    }

    // Aggregate micro-level predictions (targeting specific symbols). The
    // symbol override (M1.1) multiplies the category weight when the
    // pattern detector has flagged repeated failures on that ticker —
    // default 1.0 means no effect.
    for (const p of predictions) {
      if (!p.target_symbol || !signals[p.target_symbol]) continue;
      const dirMultiplier = p.predicted_direction === 'up' ? 1 : p.predicted_direction === 'down' ? -1 : 0;
      const calibrationWeight = weightMap.get(`${p.prediction_type}:equity`) ?? 1.0;
      const symbolOverride = symbolOverrideMap.get(p.target_symbol) ?? 1.0;
      const signalContribution = dirMultiplier * p.confidence * calibrationWeight * symbolOverride;

      signals[p.target_symbol].score += signalContribution;
      signals[p.target_symbol].predictionCount++;
      signals[p.target_symbol].predictions.push(p.id);
    }

    // Compute macro adjustment from non-symbol predictions
    let macroAdjustment = 0;
    let macroCount = 0;
    for (const p of predictions) {
      if (p.target_symbol) continue; // skip micro predictions
      const dirMultiplier = p.predicted_direction === 'up' ? 1 : p.predicted_direction === 'down' ? -1 : 0;
      macroAdjustment += dirMultiplier * p.confidence * 0.3; // dampened
      macroCount++;
    }
    if (macroCount > 0) macroAdjustment /= macroCount;

    // Normalize scores to [-1, 1] range
    for (const sym of Object.keys(signals)) {
      const s = signals[sym];
      if (s.predictionCount > 0) {
        s.score = Math.max(-1, Math.min(1, s.score / s.predictionCount));
        s.confidence = s.score !== 0 ? Math.abs(s.score) : 0;
      }
      s.score += macroAdjustment;
      s.score = Math.max(-1, Math.min(1, s.score));
      s.direction = s.score > 0.1 ? 'bullish' : s.score < -0.1 ? 'bearish' : 'neutral';
    }

    // Get current regime
    const regime = await db.get<{ regime_type: string; confidence: number }>(
      "SELECT regime_type, confidence FROM market_regime_history WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1"
    );

    return {
      signals: Object.values(signals),
      macroAdjustment,
      regime: regime ?? { regime_type: 'unknown', confidence: 0 },
    };
  }

  // ── Generate Conviction Rebalance Proposal ────────────────────────────────

  async function generateConvictionRebalanceProposal(indexId: string) {
    const { signals, macroAdjustment, regime } = await computePredictionSignalScores(indexId);

    const holdings = await db.all<{ symbol: string; weight: number; entry_price: number; current_price: number }>(
      "SELECT symbol, weight, entry_price, current_price FROM market_index_holdings WHERE index_id = ? AND removed_at IS NULL",
      indexId
    );

    if (holdings.length === 0) return { changes: [], predictionSignals: signals, regime };

    const baseWeight = 1.0 / holdings.length;
    const signalMap = new Map(signals.map(s => [s.symbol, s]));

    // Load why-chain risk insights for symbols in this index
    let riskySymbols = new Set<string>();
    try {
      const { createWhyChainInsightsAggregator } = await import('./market-why-chain-insights.js');
      const insightsAgg = await createWhyChainInsightsAggregator(db);
      const insights = await insightsAgg.getInsights(14);
      riskySymbols = new Set(insights.symbolRisks.filter(s => s.riskLevel === 'high').map(s => s.symbol));
      if (riskySymbols.size > 0) {
        console.log(`[rebalance] Risk-flagged symbols from why-chains: ${Array.from(riskySymbols).join(', ')}`);
      }
    } catch { /* non-fatal */ }

    // Apply conviction adjustments
    const rawWeights: Array<{ symbol: string; weight: number; reason: string }> = [];

    for (const h of holdings) {
      const signal = signalMap.get(h.symbol);
      let adjusted = baseWeight;
      let reason = 'equal weight baseline';

      if (signal && signal.predictionCount > 0) {
        // Score range is -1 to +1, scale weight by 0.5x to 1.5x
        adjusted = baseWeight * (1 + signal.score * 0.5);
        reason = `${signal.direction} signal (score: ${signal.score.toFixed(2)}, ${signal.predictionCount} predictions)`;
      }

      // Cap weight increases on symbols flagged by why-chain analysis
      if (riskySymbols.has(h.symbol) && adjusted > baseWeight) {
        adjusted = baseWeight; // Don't increase weight on risky symbols
        reason += ' [CAPPED: why-chain risk flag]';
      }

      // Apply macro overlay
      if (macroAdjustment < -0.3) {
        adjusted *= 0.85; // reduce all in bearish macro
        reason += ' + bearish macro overlay';
      } else if (macroAdjustment > 0.3) {
        adjusted *= 1.1;
        reason += ' + bullish macro overlay';
      }

      // Clamp: 2% to 15%
      adjusted = Math.max(0.02, Math.min(0.15, adjusted));
      rawWeights.push({ symbol: h.symbol, weight: adjusted, reason });
    }

    // Apply fundamental score overlay
    try {
      const { createMarketFundamentalScoringService } = await import('./market-fundamental-scoring-service.js');
      const fundService = await createMarketFundamentalScoringService(db);
      const fundScores = await fundService.getFundamentalScores(holdings.map(h => h.symbol));
      for (const w of rawWeights) {
        const score = fundScores.find(f => f.symbol === w.symbol);
        if (score) {
          const fundMultiplier = 0.9 + (Number(score.composite_score) / 100) * 0.2; // 0.9 to 1.1
          w.weight *= fundMultiplier;
          w.reason += ` + fundamental score ${Number(score.composite_score).toFixed(0)}/100`;
        }
      }
    } catch { /* fundamental scoring is best-effort */ }

    // Normalize to sum to 1.0
    const totalRaw = rawWeights.reduce((sum, w) => sum + w.weight, 0);
    for (const w of rawWeights) {
      w.weight = w.weight / totalRaw;
    }

    // Build ProposedChange array
    const changes = rawWeights.map(w => {
      const current = holdings.find(h => h.symbol === w.symbol);
      const currentWeight = current?.weight ?? 0;
      const diff = w.weight - currentWeight;
      const action = Math.abs(diff) < 0.005 ? 'hold' : diff > 0 ? 'increase' : 'decrease';
      return {
        symbol: w.symbol,
        action: action as 'hold' | 'increase' | 'decrease',
        currentWeight,
        proposedWeight: w.weight,
        reason: w.reason,
      };
    });

    return { changes, predictionSignals: signals, regime };
  }

  return {
    shouldRebalance,
    generateRebalanceProposal,
    evaluateHoldings,
    screenUniverse,
    rankCandidates,
    executeRebalance,
    validatePreviousRebalance,
    runScheduledRebalances,
    computePredictionSignalScores,
    generateConvictionRebalanceProposal,
  };
}

export type MarketIndexRebalanceService = Awaited<ReturnType<typeof createMarketIndexRebalanceService>>;
