// ── Atlas Service — Phase 1a skeleton ────────────────────────────────────
//
// CRUD + lifecycle factory. Phase 1a ships the foundational create/get/
// list/list-by-user surface so Phase 1d (server services + REST routes)
// has something to plug into. The full per-stage CRUD (exposures, paths,
// vulnerabilities, controls, scores, appetite, triggers, reviews) is added
// in Phase 1d as we wire each Stage UI.
//
// Identity binding: every mutating call takes `actorUserId` and writes it
// to created_by. The route layer is responsible for resolving this from
// `req.user.id` and refusing access where the actor doesn't own the atlas
// (admin override per the standard ANTON pattern).

import type { DatabaseAdapter } from '../../db/database.js';
import { randomUUID } from 'crypto';
import { createAtlasEventLogger, type AtlasEventLogger } from './atlas-event-logger.js';
import {
  calculatePathScores,
  calculateInherent,
  calculateResidual,
  rollupControlQuality,
} from './atlas-residual-calculator.js';
import type {
  AtlasMode,
  RiskAtlasRow,
  Score1to5,
  ControlStrength,
  AtlasInherentScoreRow,
  AtlasResidualScoreRow,
} from './types.js';

export interface CreateAtlasInput {
  name: string;
  description?: string;
  business_description?: string;
  industry_pack_id?: string;
  mode?: AtlasMode;
  entity_id?: string;
  project_id?: string;
}

export interface UpdateAtlasInput {
  name?: string;
  description?: string;
  business_description?: string;
  industry_pack_id?: string;
  mode?: AtlasMode;
  status?: 'draft' | 'active' | 'review' | 'archived';
  next_review_due_at?: string | null;
}

export function createAtlasService(db: DatabaseAdapter, options?: { eventLogger?: AtlasEventLogger }) {
  const events = options?.eventLogger ?? createAtlasEventLogger(db);

  // ── Atlas CRUD ─────────────────────────────────────────────────────

  async function createAtlas(input: CreateAtlasInput, actorUserId: string, orgId = 'default'): Promise<RiskAtlasRow> {
    const id = `atlas_${randomUUID()}`;
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO risk_atlases
        (id, name, description, project_id, business_description, industry_pack_id,
         status, mode, entity_id, owner_user_id, created_by, org_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`,
      id, input.name, input.description ?? null, input.project_id ?? null,
      input.business_description ?? null, input.industry_pack_id ?? null,
      input.mode ?? 'socratic', input.entity_id ?? null,
      actorUserId, actorUserId, orgId, now, now,
    );
    await events.logEvent({
      atlasId: id, event: 'atlas_created', userId: actorUserId,
      details: { name: input.name, mode: input.mode ?? 'socratic', industry_pack_id: input.industry_pack_id ?? null },
    });
    const row = await getAtlas(id);
    if (!row) throw new Error('Atlas row missing after insert');
    return row;
  }

  async function getAtlas(id: string): Promise<RiskAtlasRow | null> {
    return (await db.get<RiskAtlasRow>(`SELECT * FROM risk_atlases WHERE id = ?`, id)) ?? null;
  }

  async function listAtlases(opts?: { userId?: string; status?: string }): Promise<RiskAtlasRow[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts?.userId)  { where.push('owner_user_id = ?'); params.push(opts.userId); }
    if (opts?.status)  { where.push('status = ?'); params.push(opts.status); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return db.all<RiskAtlasRow>(
      `SELECT * FROM risk_atlases ${whereSql} ORDER BY updated_at DESC`,
      ...params,
    );
  }

  async function updateAtlas(id: string, updates: UpdateAtlasInput, actorUserId: string): Promise<RiskAtlasRow> {
    const allowed: Array<keyof UpdateAtlasInput> = [
      'name', 'description', 'business_description', 'industry_pack_id',
      'mode', 'status', 'next_review_due_at',
    ];
    const sets: string[] = []; const vals: unknown[] = [];
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        sets.push(`${key} = ?`);
        vals.push(updates[key]);
      }
    }
    if (sets.length === 0) {
      const cur = await getAtlas(id);
      if (!cur) throw new Error(`Atlas not found: ${id}`);
      return cur;
    }
    sets.push('updated_at = NOW()');
    vals.push(id);
    await db.run(`UPDATE risk_atlases SET ${sets.join(', ')} WHERE id = ?`, ...vals);
    if (updates.status) {
      await events.logEvent({
        atlasId: id, event: 'atlas_status_changed', userId: actorUserId,
        details: { new_status: updates.status },
      });
    }
    const updated = await getAtlas(id);
    if (!updated) throw new Error('Atlas vanished after update');
    return updated;
  }

  async function archiveAtlas(id: string, actorUserId: string): Promise<RiskAtlasRow> {
    return updateAtlas(id, { status: 'archived' }, actorUserId);
  }

  // ── Stage 4 + 6 — scoring + residual recalc ────────────────────────

  /**
   * Score a threat path's inherent dimensions and persist the (deterministic)
   * inherent_score. Auto-recalculates residual after.
   */
  async function scoreInherent(
    threatPathId: string,
    scores: { exposure: Score1to5; threat: Score1to5; vulnerability: Score1to5; rationale?: string },
    actorUserId: string,
  ): Promise<{ inherent: AtlasInherentScoreRow; residual: AtlasResidualScoreRow | null }> {
    const inherent = calculateInherent(scores.exposure, scores.threat, scores.vulnerability);
    const id = `is_${randomUUID()}`;

    // Upsert by threat_path_id (UNIQUE constraint)
    await db.run(
      `INSERT INTO atlas_inherent_scores
        (id, threat_path_id, exposure_score, threat_score, vulnerability_score, inherent_score, rationale, scored_at, scored_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)
       ON CONFLICT (threat_path_id) DO UPDATE SET
         exposure_score = EXCLUDED.exposure_score,
         threat_score = EXCLUDED.threat_score,
         vulnerability_score = EXCLUDED.vulnerability_score,
         inherent_score = EXCLUDED.inherent_score,
         rationale = EXCLUDED.rationale,
         scored_at = EXCLUDED.scored_at,
         scored_by = EXCLUDED.scored_by`,
      id, threatPathId, scores.exposure, scores.threat, scores.vulnerability,
      inherent, scores.rationale ?? null, actorUserId,
    );

    const path = await db.get<{ atlas_id: string }>(`SELECT atlas_id FROM atlas_threat_paths WHERE id = ?`, threatPathId);
    if (path) {
      await events.logEvent({
        atlasId: path.atlas_id, event: 'inherent_scored', userId: actorUserId,
        subResourceId: threatPathId,
        details: { exposure: scores.exposure, threat: scores.threat, vulnerability: scores.vulnerability, inherent },
      });
    }

    const inherentRow = await db.get<AtlasInherentScoreRow>(
      `SELECT * FROM atlas_inherent_scores WHERE threat_path_id = ?`,
      threatPathId,
    );
    if (!inherentRow) throw new Error('Inherent row missing after upsert');

    // Cascade: recalc residual for this path now that inherent changed
    const residual = await recalculateResidualForPath(threatPathId, actorUserId);
    return { inherent: inherentRow, residual };
  }

  /**
   * Deterministic recalc of a path's residual. Re-reads inherent + all
   * controls linked via vulnerabilities, computes the rollup, and writes
   * the new residual_scores row.
   */
  async function recalculateResidualForPath(threatPathId: string, actorUserId: string): Promise<AtlasResidualScoreRow | null> {
    const inherent = await db.get<{ inherent_score: Score1to5 }>(
      `SELECT inherent_score FROM atlas_inherent_scores WHERE threat_path_id = ?`,
      threatPathId,
    );
    if (!inherent) return null;            // can't compute residual without inherent

    // Pull all control strengths attached to ANY vulnerability of this path
    const controlStrengths = await db.all<{ strength: ControlStrength }>(
      `SELECT DISTINCT c.strength
       FROM atlas_threat_path_vulnerabilities tpv
       JOIN atlas_control_vulnerability_map cvm ON cvm.vulnerability_id = tpv.vulnerability_id
       JOIN atlas_controls c ON c.id = cvm.control_id
       WHERE tpv.threat_path_id = ?`,
      threatPathId,
    );
    const rollup = rollupControlQuality(controlStrengths.map(r => r.strength));
    const calc = calculateResidual({ inherent_score: inherent.inherent_score, control_quality_rollup: rollup });

    const id = `rs_${randomUUID()}`;
    await db.run(
      `INSERT INTO atlas_residual_scores
        (id, threat_path_id, residual_score, control_quality_rollup, open_vulnerability_notes, calculated_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON CONFLICT (threat_path_id) DO UPDATE SET
         residual_score = EXCLUDED.residual_score,
         control_quality_rollup = EXCLUDED.control_quality_rollup,
         open_vulnerability_notes = EXCLUDED.open_vulnerability_notes,
         calculated_at = EXCLUDED.calculated_at`,
      id, threatPathId, calc.residual_score, rollup,
      calc.rationale, // store rationale for audit even though it's derivable
    );
    const path = await db.get<{ atlas_id: string }>(`SELECT atlas_id FROM atlas_threat_paths WHERE id = ?`, threatPathId);
    if (path) {
      await events.logEvent({
        atlasId: path.atlas_id, event: 'residual_recalculated', userId: actorUserId,
        subResourceId: threatPathId,
        details: { residual_score: calc.residual_score, rollup, appetite: calc.appetite_position },
      });
    }
    return (await db.get<AtlasResidualScoreRow>(
      `SELECT * FROM atlas_residual_scores WHERE threat_path_id = ?`,
      threatPathId,
    )) ?? null;
  }

  return {
    createAtlas,
    getAtlas,
    listAtlases,
    updateAtlas,
    archiveAtlas,
    scoreInherent,
    recalculateResidualForPath,
    // Re-exports for tests
    _calculatePathScores: calculatePathScores,
  };
}

export type AtlasService = ReturnType<typeof createAtlasService>;
