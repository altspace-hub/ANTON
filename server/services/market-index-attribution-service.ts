import type { DatabaseAdapter } from '../db/database.js';
import { dateOffsetLiteral } from '../db/dialect-helpers.js';

// ── Types ────────────────────────────────────────────────────────────────────

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

interface NavRow {
  nav_date: string;
  nav_value: number;
  daily_return: number | null;
  cumulative_return: number | null;
}

interface IndexRow {
  id: string;
  name: string;
  current_nav: number;
  total_return: number;
  inception_date: string | null;
}

interface RebalanceRow {
  id: string;
  reasoning: string | null;
  executed_at: string;
}

export interface PositionContribution {
  symbol: string;
  weight: number;
  contributionToReturn: number;
}

export interface PositionAttribution {
  totalReturn: number;
  contributions: PositionContribution[];
  topContributors: PositionContribution[];
  bottomContributors: PositionContribution[];
}

export interface AtomAttribution {
  atomsInfluencingHoldings: number;
  topAtomTypes: Array<{ type: string; count: number }>;
  atomCoverage: number;
}

export interface ConsulAttribution {
  consulMentions: Record<string, number>;
  dominantConsul: string | null;
  consulAgreementRate: number;
}

export interface SectorAttribution {
  sectors: Array<{ sector: string; weight: number; holdingsCount: number; avgReturn: number }>;
  diversificationScore: number;
}

// ── Period Helpers ────────────────────────────────────────────────────────────

const PERIOD_DAYS: Record<string, number> = {
  '1w': 7,
  '1m': 30,
  '3m': 90,
  '6m': 180,
  '1y': 365,
  'ytd': 365, // approximation, refined below
  'inception': 9999,
};

function getPeriodDays(period?: string): number {
  if (!period) return 30; // default 1 month
  return PERIOD_DAYS[period] ?? 30;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export async function createMarketIndexAttributionService(db: DatabaseAdapter) {

  // ── Position Attribution ─────────────────────────────────────────────────

  async function calculatePositionAttribution(indexId: string, period?: string): Promise<PositionAttribution> {
    const index = await db.get<IndexRow>('SELECT * FROM market_indexes WHERE id = ?', indexId);
    if (!index) throw new Error(`Index ${indexId} not found`);

    const holdings = await db.all<HoldingRow>(
      'SELECT * FROM market_index_holdings WHERE index_id = ? AND removed_at IS NULL ORDER BY weight DESC', indexId
    );

    const days = getPeriodDays(period);
    const navHistory = await db.all<NavRow>(
      `SELECT nav_date, nav_value, daily_return, cumulative_return
       FROM market_index_nav_history
       WHERE index_id = ? AND nav_date >= ${dateOffsetLiteral(db.dialect, days, 'days')}
       ORDER BY nav_date ASC`, indexId
    );

    // Calculate total return from NAV history
    let totalReturn = 0;
    if (navHistory.length >= 2) {
      const firstNav = navHistory[0].nav_value;
      const lastNav = navHistory[navHistory.length - 1].nav_value;
      totalReturn = firstNav > 0 ? (lastNav - firstNav) / firstNav : 0;
    } else {
      totalReturn = index.total_return;
    }

    // Approximate each holding's contribution based on weight * total return
    // In a real system, this would use daily holding-level returns
    const contributions: PositionContribution[] = holdings.map(h => {
      // Use unrealized P&L as a proxy for contribution if available
      let contributionToReturn = 0;
      if (h.entry_price && h.current_price && h.entry_price > 0) {
        const holdingReturn = (h.current_price - h.entry_price) / h.entry_price;
        contributionToReturn = h.weight * holdingReturn;
      } else {
        contributionToReturn = h.weight * totalReturn;
      }
      return {
        symbol: h.symbol,
        weight: h.weight,
        contributionToReturn,
      };
    });

    // Sort for top/bottom contributors
    const sorted = [...contributions].sort((a, b) => b.contributionToReturn - a.contributionToReturn);
    const topContributors = sorted.slice(0, 5);
    const bottomContributors = sorted.slice(-5).reverse();

    return {
      totalReturn,
      contributions,
      topContributors,
      bottomContributors,
    };
  }

  // ── Atom Attribution ─────────────────────────────────────────────────────

  async function calculateAtomAttribution(indexId: string, period?: string): Promise<AtomAttribution> {
    const holdings = await db.all<HoldingRow>(
      'SELECT * FROM market_index_holdings WHERE index_id = ? AND removed_at IS NULL', indexId
    );

    if (holdings.length === 0) {
      return { atomsInfluencingHoldings: 0, topAtomTypes: [], atomCoverage: 0 };
    }

    // Get symbols from holdings
    const symbols = holdings.map(h => h.symbol);

    // Look up theses that target these symbols (via target_entities JSON field)
    // Then find atoms linked to those theses
    let atomCount = 0;
    const atomTypeCounts: Record<string, number> = {};

    for (const symbol of symbols) {
      // Find theses mentioning this symbol
      const theses = await db.all<{ id: string }>(
        "SELECT id FROM market_theses WHERE target_entities LIKE ?",
        `%${symbol}%`
      );

      for (const thesis of theses) {
        const atoms = await db.all<{ atom_id: string; atom_type: string }>(
          `SELECT mta.atom_id, ma.atom_type
           FROM market_thesis_atoms mta
           JOIN market_atoms ma ON mta.atom_id = ma.id
           WHERE mta.thesis_id = ?`,
          thesis.id
        );

        atomCount += atoms.length;
        for (const atom of atoms) {
          atomTypeCounts[atom.atom_type] = (atomTypeCounts[atom.atom_type] ?? 0) + 1;
        }
      }
    }

    const topAtomTypes = Object.entries(atomTypeCounts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Coverage: fraction of holdings that have at least one linked atom/thesis
    let coveredCount = 0;
    for (const symbol of symbols) {
      const hasThesis = await db.get<{ id: string }>(
        "SELECT id FROM market_theses WHERE target_entities LIKE ? LIMIT 1",
        `%${symbol}%`
      );
      if (hasThesis) coveredCount++;
    }

    const atomCoverage = symbols.length > 0 ? coveredCount / symbols.length : 0;

    return {
      atomsInfluencingHoldings: atomCount,
      topAtomTypes,
      atomCoverage,
    };
  }

  // ── Consul Attribution ───────────────────────────────────────────────────

  async function calculateConsulAttribution(indexId: string, period?: string): Promise<ConsulAttribution> {
    const days = getPeriodDays(period);

    // Get rebalances for the index within the period
    const rebalances = await db.all<RebalanceRow>(
      `SELECT id, reasoning, executed_at
       FROM market_index_rebalances
       WHERE index_id = ? AND executed_at >= ${dateOffsetLiteral(db.dialect, days, 'days')}
       ORDER BY executed_at DESC`, indexId
    );

    const consulMentions: Record<string, number> = {};
    const consulKeywords = [
      'momentum', 'value', 'growth', 'contrarian', 'macro',
      'technical', 'fundamental', 'quantitative', 'risk', 'sentiment',
    ];

    for (const reb of rebalances) {
      if (!reb.reasoning) continue;
      const reasoningLower = reb.reasoning.toLowerCase();
      for (const consul of consulKeywords) {
        if (reasoningLower.includes(consul)) {
          consulMentions[consul] = (consulMentions[consul] ?? 0) + 1;
        }
      }
    }

    // Find dominant consul
    let dominantConsul: string | null = null;
    let maxMentions = 0;
    for (const [consul, count] of Object.entries(consulMentions)) {
      if (count > maxMentions) {
        maxMentions = count;
        dominantConsul = consul;
      }
    }

    // Agreement rate: fraction of rebalances that mention more than one consul keyword
    let multiConsulCount = 0;
    for (const reb of rebalances) {
      if (!reb.reasoning) continue;
      const reasoningLower = reb.reasoning.toLowerCase();
      const mentioned = consulKeywords.filter(k => reasoningLower.includes(k));
      if (mentioned.length > 1) multiConsulCount++;
    }
    const consulAgreementRate = rebalances.length > 0 ? multiConsulCount / rebalances.length : 0;

    return {
      consulMentions,
      dominantConsul,
      consulAgreementRate,
    };
  }

  // ── Sector Attribution ───────────────────────────────────────────────────

  async function calculateSectorAttribution(indexId: string, period?: string): Promise<SectorAttribution> {
    const holdings = await db.all<HoldingRow>(
      'SELECT * FROM market_index_holdings WHERE index_id = ? AND removed_at IS NULL ORDER BY weight DESC', indexId
    );

    if (holdings.length === 0) {
      return { sectors: [], diversificationScore: 0 };
    }

    // Try to get sector info from market_entities
    const sectorMap: Record<string, { weight: number; count: number; totalReturn: number }> = {};

    for (const h of holdings) {
      // Look up entity for sector metadata
      const entity = await db.get<{ metadata: string }>(
        'SELECT metadata FROM market_entities WHERE symbol = ? LIMIT 1', h.symbol
      );

      let sector = 'Unknown';
      if (entity?.metadata) {
        try {
          const meta = JSON.parse(entity.metadata);
          sector = meta.sector ?? meta.industry ?? 'Unknown';
        } catch {
          sector = 'Unknown';
        }
      }

      if (!sectorMap[sector]) {
        sectorMap[sector] = { weight: 0, count: 0, totalReturn: 0 };
      }

      sectorMap[sector].weight += h.weight;
      sectorMap[sector].count += 1;

      // Calculate holding return if we have entry/current prices
      if (h.entry_price && h.current_price && h.entry_price > 0) {
        const holdingReturn = (h.current_price - h.entry_price) / h.entry_price;
        sectorMap[sector].totalReturn += holdingReturn;
      }
    }

    const sectors = Object.entries(sectorMap).map(([sector, data]) => ({
      sector,
      weight: data.weight,
      holdingsCount: data.count,
      avgReturn: data.count > 0 ? data.totalReturn / data.count : 0,
    })).sort((a, b) => b.weight - a.weight);

    // Diversification score: 1 - Herfindahl index of sector weights
    const totalWeight = sectors.reduce((sum, s) => sum + s.weight, 0);
    const hhi = sectors.reduce((sum, s) => {
      const share = totalWeight > 0 ? s.weight / totalWeight : 0;
      return sum + share * share;
    }, 0);
    const diversificationScore = Math.max(0, 1 - hhi);

    return {
      sectors,
      diversificationScore,
    };
  }

  // ── Performance Narrative ────────────────────────────────────────────────

  async function generatePerformanceNarrative(indexId: string, period?: string): Promise<string> {
    const index = await db.get<IndexRow & { name: string; status: string }>(
      'SELECT * FROM market_indexes WHERE id = ?', indexId
    );
    if (!index) throw new Error(`Index ${indexId} not found`);

    const positionAttr = await calculatePositionAttribution(indexId, period);
    const sectorAttr = await calculateSectorAttribution(indexId, period);

    const periodLabel = period ?? '1m';
    const lines: string[] = [];

    lines.push(`Performance Summary: ${index.name} (${periodLabel})`);
    lines.push('');
    lines.push(`Current NAV: ${index.current_nav.toFixed(2)}`);
    lines.push(`Total Return: ${(positionAttr.totalReturn * 100).toFixed(2)}%`);
    lines.push('');

    if (positionAttr.topContributors.length > 0) {
      lines.push('Top Contributors:');
      for (const c of positionAttr.topContributors.slice(0, 3)) {
        lines.push(`  ${c.symbol}: ${(c.contributionToReturn * 100).toFixed(2)}% (weight: ${(c.weight * 100).toFixed(1)}%)`);
      }
      lines.push('');
    }

    if (positionAttr.bottomContributors.length > 0) {
      lines.push('Bottom Contributors:');
      for (const c of positionAttr.bottomContributors.slice(0, 3)) {
        lines.push(`  ${c.symbol}: ${(c.contributionToReturn * 100).toFixed(2)}% (weight: ${(c.weight * 100).toFixed(1)}%)`);
      }
      lines.push('');
    }

    if (sectorAttr.sectors.length > 0) {
      lines.push(`Sector Allocation (${sectorAttr.sectors.length} sectors):`);
      for (const s of sectorAttr.sectors.slice(0, 5)) {
        lines.push(`  ${s.sector}: ${(s.weight * 100).toFixed(1)}% (${s.holdingsCount} holdings, avg return ${(s.avgReturn * 100).toFixed(2)}%)`);
      }
      lines.push(`Diversification Score: ${(sectorAttr.diversificationScore * 100).toFixed(1)}%`);
      lines.push('');
    }

    lines.push(`Holdings: ${positionAttr.contributions.length}`);

    return lines.join('\n');
  }

  return {
    calculatePositionAttribution,
    calculateAtomAttribution,
    calculateConsulAttribution,
    calculateSectorAttribution,
    generatePerformanceNarrative,
  };
}

export type MarketIndexAttributionService = Awaited<ReturnType<typeof createMarketIndexAttributionService>>;
