import type { DatabaseAdapter } from '../db/database.js';
import { ilike } from '../db/dialect-helpers.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface WhyChainRow {
  id: string;
  investigation_id: string | null;
  prediction_id: string | null;
  title: string;
  root_cause_type: string | null;
  root_cause_description: string | null;
  impact_assessment: string | null;
  num_levels: number;
  status: string;
  created_at: string;
  completed_at: string | null;
  direction: string;
  root_cause_reached: number;
  chain_data: string;
  root_cause_summary: string | null;
  atoms_created: string;
  correlations_updated: string;
  signal_weights_updated: string;
  blind_spots_identified: string;
  process_improvements: string;
  investigation_tasks_spawned: string;
  systemic_impact: string | null;
  theses_affected: number;
  indexes_affected: number;
}

interface WhyLevelRow {
  id: number;
  chain_id: string;
  level_number: number;
  question: string;
  answer: string;
  evidence_atoms: string;
  atom_created: string | null;
  created_at: string;
  level_type: string;
  atoms_created_at_level: string;
  research_performed: string | null;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export async function createMarketWhyChainsService(db: DatabaseAdapter) {

  // ── Create Chain ───────────────────────────────────────────────────────────

  async function createChain(params: {
    title: string;
    investigationId?: string;
    predictionId?: string;
    direction?: string;
  }) {
    const id = `mwhy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`
      INSERT INTO market_why_chains (id, title, investigation_id, prediction_id, direction)
      VALUES (?, ?, ?, ?, ?)
    `, id, params.title, params.investigationId ?? null,
       params.predictionId ?? null, params.direction ?? 'failure_analysis');
    return id;
  }

  // ── Get Chain ──────────────────────────────────────────────────────────────

  async function getChain(id: string) {
    const chain = await db.get<WhyChainRow>('SELECT * FROM market_why_chains WHERE id = ?', id);
    if (!chain) return null;

    const levels = await db.all<WhyLevelRow>(
      'SELECT * FROM market_why_chain_levels WHERE chain_id = ? ORDER BY level_number', id
    );

    return { ...chain, levels };
  }

  // ── List Chains ────────────────────────────────────────────────────────────

  async function listChains(params: {
    direction?: string;
    status?: string;
    systemicImpact?: string;
    query?: string;
    limit?: number;
    offset?: number;
  }) {
    let where = 'WHERE 1=1';
    const args: unknown[] = [];

    if (params.direction) { where += ' AND direction = ?'; args.push(params.direction); }
    if (params.status) { where += ' AND status = ?'; args.push(params.status); }
    if (params.systemicImpact) { where += ' AND systemic_impact = ?'; args.push(params.systemicImpact); }
    if (params.query) {
      where += ` AND (${ilike(db.dialect, 'title')} OR ${ilike(db.dialect, 'root_cause_summary')})`;
      args.push(`%${params.query}%`, `%${params.query}%`);
    }

    args.push(params.limit ?? 50, params.offset ?? 0);

    return await db.all<WhyChainRow>(
      `SELECT * FROM market_why_chains ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      ...args
    );
  }

  // ── Add Level ──────────────────────────────────────────────────────────────

  async function addLevel(chainId: string, params: {
    question: string;
    answer: string;
    evidenceAtoms?: string[];
    atomCreated?: string;
    levelType?: string;
    researchPerformed?: string;
    atomsCreatedAtLevel?: string[];
  }) {
    const chain = await db.get<{ num_levels: number }>('SELECT num_levels FROM market_why_chains WHERE id = ?', chainId);
    if (!chain) return null;

    const levelNumber = chain.num_levels + 1;
    if (levelNumber > 5) return { error: 'Max 5 levels allowed' };

    await db.run(`
      INSERT INTO market_why_chain_levels (chain_id, level_number, question, answer, evidence_atoms,
                                            atom_created, level_type, atoms_created_at_level, research_performed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, chainId, levelNumber, params.question, params.answer,
       JSON.stringify(params.evidenceAtoms ?? []),
       params.atomCreated ?? null,
       params.levelType ?? 'symptom',
       JSON.stringify(params.atomsCreatedAtLevel ?? []),
       params.researchPerformed ?? null);

    await db.run('UPDATE market_why_chains SET num_levels = ? WHERE id = ?', levelNumber, chainId);

    return { levelNumber };
  }

  // ── Complete Chain ─────────────────────────────────────────────────────────

  async function completeChain(id: string, rootCause: {
    rootCauseType?: string;
    rootCauseDescription?: string;
    impactAssessment?: string;
    rootCauseSummary?: string;
    systemicImpact?: string;
    atomsCreated?: string[];
    correlationsUpdated?: string[];
    signalWeightsUpdated?: string[];
    blindSpotsIdentified?: string[];
    processImprovements?: string[];
    investigationTasksSpawned?: string[];
    thesesAffected?: number;
    indexesAffected?: number;
  }) {
    await db.run(`
      UPDATE market_why_chains SET
        status = 'completed',
        root_cause_reached = 1,
        root_cause_type = ?,
        root_cause_description = ?,
        impact_assessment = ?,
        root_cause_summary = ?,
        systemic_impact = ?,
        atoms_created = ?,
        correlations_updated = ?,
        signal_weights_updated = ?,
        blind_spots_identified = ?,
        process_improvements = ?,
        investigation_tasks_spawned = ?,
        theses_affected = ?,
        indexes_affected = ?,
        completed_at = NOW()
      WHERE id = ?
    `, rootCause.rootCauseType ?? null,
       rootCause.rootCauseDescription ?? null,
       rootCause.impactAssessment ?? null,
       rootCause.rootCauseSummary ?? null,
       rootCause.systemicImpact ?? null,
       JSON.stringify(rootCause.atomsCreated ?? []),
       JSON.stringify(rootCause.correlationsUpdated ?? []),
       JSON.stringify(rootCause.signalWeightsUpdated ?? []),
       JSON.stringify(rootCause.blindSpotsIdentified ?? []),
       JSON.stringify(rootCause.processImprovements ?? []),
       JSON.stringify(rootCause.investigationTasksSpawned ?? []),
       rootCause.thesesAffected ?? 0,
       rootCause.indexesAffected ?? 0,
       id);
  }

  // ── Get Patterns ───────────────────────────────────────────────────────────

  async function getPatterns() {
    const rootCauseTypes = await db.all<{ root_cause_type: string; count: number }>(
      `SELECT root_cause_type, COUNT(*) as count FROM market_why_chains
       WHERE status = 'completed' AND root_cause_type IS NOT NULL
       GROUP BY root_cause_type ORDER BY count DESC`
    );

    const levelDistribution = await db.all<{ num_levels: number; count: number }>(
      `SELECT num_levels, COUNT(*) as count FROM market_why_chains
       WHERE status = 'completed'
       GROUP BY num_levels ORDER BY num_levels`
    );

    const directionAsymmetry = await db.all<{ direction: string; total: number; completed: number; avg_levels: number }>(
      `SELECT direction, COUNT(*) as total,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
              AVG(num_levels) as avg_levels
       FROM market_why_chains
       GROUP BY direction`
    );

    return {
      rootCauseTypes,
      levelDistribution,
      directionAsymmetry,
    };
  }

  // ── Get Stats ──────────────────────────────────────────────────────────────

  async function getStats() {
    const total = await db.get<{ n: number }>('SELECT COUNT(*) as n FROM market_why_chains');
    const completed = await db.get<{ n: number }>("SELECT COUNT(*) as n FROM market_why_chains WHERE status = 'completed'");
    const inProgress = await db.get<{ n: number }>("SELECT COUNT(*) as n FROM market_why_chains WHERE status = 'in_progress'");

    const byDirection = await db.all<{ direction: string; count: number }>(
      'SELECT direction, COUNT(*) as count FROM market_why_chains GROUP BY direction'
    );

    const bySystemicImpact = await db.all<{ systemic_impact: string; count: number }>(
      `SELECT systemic_impact, COUNT(*) as count FROM market_why_chains
       WHERE systemic_impact IS NOT NULL
       GROUP BY systemic_impact ORDER BY count DESC`
    );

    const avgLevels = await db.get<{ avg: number }>(
      "SELECT AVG(num_levels) as avg FROM market_why_chains WHERE status = 'completed'"
    );

    return {
      total: total?.n ?? 0,
      completed: completed?.n ?? 0,
      inProgress: inProgress?.n ?? 0,
      byDirection,
      bySystemicImpact,
      avgLevels: avgLevels?.avg ?? 0,
    };
  }

  return {
    createChain,
    getChain,
    listChains,
    addLevel,
    completeChain,
    getPatterns,
    getStats,
  };
}

export type MarketWhyChainsService = Awaited<ReturnType<typeof createMarketWhyChainsService>>;
