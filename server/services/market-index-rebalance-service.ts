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

    if (weightingMethod === 'equal' && holdings.length > 0) {
      const targetWeight = 1.0 / holdings.length;
      const tolerance = 0.02; // 2% drift tolerance

      for (const h of holdings) {
        const diff = Math.abs(h.weight - targetWeight);
        if (diff < tolerance) {
          proposedChanges.push({
            symbol: h.symbol,
            action: 'hold',
            currentWeight: h.weight,
            proposedWeight: targetWeight,
            reason: `Weight ${(h.weight * 100).toFixed(1)}% is within tolerance of target ${(targetWeight * 100).toFixed(1)}%`,
          });
        } else if (h.weight > targetWeight) {
          proposedChanges.push({
            symbol: h.symbol,
            action: 'decrease',
            currentWeight: h.weight,
            proposedWeight: targetWeight,
            reason: `Overweight at ${(h.weight * 100).toFixed(1)}% vs target ${(targetWeight * 100).toFixed(1)}%`,
          });
        } else {
          proposedChanges.push({
            symbol: h.symbol,
            action: 'increase',
            currentWeight: h.weight,
            proposedWeight: targetWeight,
            reason: `Underweight at ${(h.weight * 100).toFixed(1)}% vs target ${(targetWeight * 100).toFixed(1)}%`,
          });
        }
      }
    } else {
      // For non-equal-weight or empty holdings, keep current weights as proposal
      for (const h of holdings) {
        proposedChanges.push({
          symbol: h.symbol,
          action: 'hold',
          currentWeight: h.weight,
          proposedWeight: h.weight,
          reason: 'Maintaining current weight',
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

  return {
    shouldRebalance,
    generateRebalanceProposal,
    evaluateHoldings,
    screenUniverse,
    rankCandidates,
    executeRebalance,
    validatePreviousRebalance,
    runScheduledRebalances,
  };
}

export type MarketIndexRebalanceService = Awaited<ReturnType<typeof createMarketIndexRebalanceService>>;
