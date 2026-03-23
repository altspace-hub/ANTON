/**
 * market-business-model-similarity.ts
 * Computes business model similarity between entities for peer validation.
 *
 * Uses fundamental data (sector, margins, revenue model) + atom-derived insights
 * to determine if two companies are truly comparable.
 *
 * Prevents the "UNH→CVS extrapolation" error — where margin pressure at an
 * insurance company was extrapolated to a pharmacy retailer.
 */

import type { DatabaseAdapter } from '../db/database.js';

export interface SimilarityResult {
  similarity: number;   // 0-1, where 1 = identical business model
  dimensions: {
    sector_match: boolean;
    margin_profile_similarity: number;
    revenue_model: string;
    peer_revenue_model: string;
  };
  shouldExtrapolate: boolean;
  confidencePenalty: number;  // 0-0.5, how much to reduce prediction confidence
  reasoning: string;
}

export async function createBusinessModelSimilarity(db: DatabaseAdapter) {

  /**
   * Get fundamental profile for a symbol from available data.
   */
  async function getProfile(symbol: string): Promise<{
    sector: string | null;
    grossMargin: number | null;
    operatingMargin: number | null;
    revenueGrowth: number | null;
    entityType: string | null;
    description: string;
  }> {
    // Get entity info
    const entity = await db.get<{ entity_type: string; name: string }>(
      'SELECT entity_type, name FROM market_entities WHERE symbol = $1', symbol
    );

    // Get fundamental score if available
    const fundamental = await db.get<{
      gross_margin: number; operating_margin: number; revenue_growth: number;
    }>(
      `SELECT gross_margin, operating_margin, revenue_growth
       FROM market_fundamental_scores
       WHERE symbol = $1
       ORDER BY score_date DESC LIMIT 1`,
      symbol
    );

    // Get sector from atoms
    const sectorAtom = await db.get<{ content: string }>(
      `SELECT a.content FROM market_atoms a
       JOIN market_atom_entity_links l ON l.atom_id = a.id
       JOIN market_entities e ON e.id = l.entity_id
       WHERE e.symbol = $1 AND a.category = 'equity'
       AND (a.content ILIKE '%sector%' OR a.content ILIKE '%industry%')
       ORDER BY a.created_at DESC LIMIT 1`,
      symbol
    );

    // Build description from recent atoms
    const descAtoms = await db.all<{ content: string }>(
      `SELECT a.content FROM market_atoms a
       JOIN market_atom_entity_links l ON l.atom_id = a.id
       JOIN market_entities e ON e.id = l.entity_id
       WHERE e.symbol = $1 AND a.atom_type IN ('fact', 'insight')
       ORDER BY a.confidence DESC LIMIT 5`,
      symbol
    );

    return {
      sector: sectorAtom?.content?.match(/sector:?\s*([^,.]+)/i)?.[1]?.trim() || null,
      grossMargin: fundamental?.gross_margin ?? null,
      operatingMargin: fundamental?.operating_margin ?? null,
      revenueGrowth: fundamental?.revenue_growth ?? null,
      entityType: entity?.entity_type || null,
      description: descAtoms.map(a => a.content.slice(0, 100)).join('. '),
    };
  }

  /**
   * Compute similarity between two symbols.
   */
  async function computeSimilarity(symbolA: string, symbolB: string): Promise<SimilarityResult> {
    const profileA = await getProfile(symbolA);
    const profileB = await getProfile(symbolB);

    let totalScore = 0;
    let maxScore = 0;

    // Sector match (40% weight)
    const sectorWeight = 40;
    maxScore += sectorWeight;
    const sectorMatch = profileA.sector && profileB.sector &&
      profileA.sector.toLowerCase() === profileB.sector.toLowerCase();
    if (sectorMatch) totalScore += sectorWeight;
    else if (profileA.sector && profileB.sector) totalScore += 0; // Different sectors = 0
    else totalScore += sectorWeight * 0.3; // Unknown = partial credit

    // Margin profile similarity (30% weight)
    const marginWeight = 30;
    maxScore += marginWeight;
    if (profileA.grossMargin != null && profileB.grossMargin != null) {
      const marginDiff = Math.abs(profileA.grossMargin - profileB.grossMargin);
      const marginSim = Math.max(0, 1 - marginDiff / 50); // 50pp diff = 0 similarity
      totalScore += marginWeight * marginSim;
    } else {
      totalScore += marginWeight * 0.3; // Unknown = partial
    }

    // Entity type match (15% weight)
    const typeWeight = 15;
    maxScore += typeWeight;
    if (profileA.entityType === profileB.entityType) totalScore += typeWeight;
    else totalScore += 0;

    // Revenue growth similarity (15% weight)
    const growthWeight = 15;
    maxScore += growthWeight;
    if (profileA.revenueGrowth != null && profileB.revenueGrowth != null) {
      const growthDiff = Math.abs(profileA.revenueGrowth - profileB.revenueGrowth);
      const growthSim = Math.max(0, 1 - growthDiff / 30); // 30pp diff = 0
      totalScore += growthWeight * growthSim;
    } else {
      totalScore += growthWeight * 0.3;
    }

    const similarity = maxScore > 0 ? totalScore / maxScore : 0.3;

    // Determine if extrapolation is safe
    const shouldExtrapolate = similarity >= 0.6;
    const confidencePenalty = similarity >= 0.8 ? 0 :
                              similarity >= 0.6 ? 0.1 :
                              similarity >= 0.4 ? 0.2 : 0.3;

    const reasoning = similarity >= 0.8
      ? `${symbolA} and ${symbolB} have similar business models (${(similarity * 100).toFixed(0)}% match). Peer extrapolation is reasonable.`
      : similarity >= 0.5
        ? `${symbolA} and ${symbolB} have moderate similarity (${(similarity * 100).toFixed(0)}%). Extrapolation with caution — confidence reduced by ${(confidencePenalty * 100).toFixed(0)}%.`
        : `${symbolA} and ${symbolB} have low business model similarity (${(similarity * 100).toFixed(0)}%). Peer extrapolation is unreliable.`;

    return {
      similarity,
      dimensions: {
        sector_match: !!sectorMatch,
        margin_profile_similarity: profileA.grossMargin != null && profileB.grossMargin != null
          ? Math.max(0, 1 - Math.abs(profileA.grossMargin - profileB.grossMargin) / 50)
          : 0.5,
        revenue_model: profileA.description.slice(0, 80) || 'unknown',
        peer_revenue_model: profileB.description.slice(0, 80) || 'unknown',
      },
      shouldExtrapolate,
      confidencePenalty,
      reasoning,
    };
  }

  /**
   * Find the top N most similar peers for a symbol.
   */
  async function findPeers(symbol: string, topN: number = 5): Promise<Array<{ symbol: string; name: string; similarity: number }>> {
    // Get all entities that are companies
    const candidates = await db.all<{ symbol: string; name: string }>(
      `SELECT symbol, name FROM market_entities
       WHERE entity_type = 'company' AND symbol IS NOT NULL AND symbol != $1
       LIMIT 50`,
      symbol
    );

    const results: Array<{ symbol: string; name: string; similarity: number }> = [];

    for (const cand of candidates) {
      const sim = await computeSimilarity(symbol, cand.symbol);
      results.push({ symbol: cand.symbol, name: cand.name, similarity: sim.similarity });
    }

    return results.sort((a, b) => b.similarity - a.similarity).slice(0, topN);
  }

  return { computeSimilarity, findPeers, getProfile };
}
