// ── Atlas Service — full CRUD + lifecycle ────────────────────────────────
//
// Single factory exposing everything the REST layer needs:
//   • Atlas CRUD + lifecycle
//   • Stage 1 — exposure points
//   • Stage 2 — threat paths + exposure links
//   • Stage 3 — vulnerabilities + threat-path links
//   • Stage 4 — inherent scoring (deterministic via the calculator)
//   • Stage 5 — controls + control-vulnerability matrix
//   • Stage 6 — residual recalculation (deterministic)
//   • Stage 7 — appetite statements + escalation triggers
//   • Maintenance — review cycles
//   • Read helpers — full hydrated dashboard view
//
// Identity binding: every mutating method takes `actorUserId`. The route
// layer is responsible for resolving this from req.user.id and refusing
// access where the actor doesn't own the atlas (admin override per the
// standard ANTON pattern).

import type { DatabaseAdapter } from '../../db/database.js';
import { randomUUID } from 'crypto';
import { createAtlasEventLogger, type AtlasEventLogger, type AtlasEventType } from './atlas-event-logger.js';
import { createAtlasKnowledgeBridge, type AtlasKnowledgeBridge } from './atlas-knowledge-bridge.js';
import { isoDay } from './atlas-dates.js';
import {
  calculatePathScores,
  calculateInherent,
  calculateResidual,
  rollupControlQuality,
  appetitePositionFor,
} from './atlas-residual-calculator.js';
import type {
  AtlasMode,
  RiskAtlasRow,
  Score1to5,
  ControlStrength,
  ControlType,
  AtlasInherentScoreRow,
  AtlasResidualScoreRow,
  AtlasExposurePointRow,
  AtlasThreatPathRow,
  AtlasVulnerabilityRow,
  AtlasControlRow,
  AtlasAppetiteStatementRow,
  AtlasEscalationTriggerRow,
  AtlasReviewCycleRow,
  ExposureCategory,
  FcpDomain,
  AppetitePosition,
  ReviewActivity,
  ReviewFrequency,
  ThreatPathFull,
  AtlasDashboard,
  AtlasIndustryPackRow,
} from './types.js';

// ── Input types ─────────────────────────────────────────────────────

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

export interface CreateExposureInput {
  name: string;
  description?: string;
  category?: ExposureCategory | string;
  source_pack_exposure_id?: string;
}

export interface CreateThreatPathInput {
  path_code: string;
  name: string;
  description?: string;
  fcp_domain?: FcpDomain | null;
  source_pack_path_id?: string;
  exposure_ids?: string[];     // links created in same call
}

export interface CreateVulnerabilityInput {
  vuln_code: string;
  name: string;
  description?: string;
  severity: Score1to5;
  source_pack_vuln_id?: string;
  threat_path_ids?: string[];  // links created in same call
}

export interface CreateControlInput {
  control_code: string;
  name: string;
  description?: string;
  type: ControlType;
  strength: ControlStrength;
  evidence?: string;
  owner_role?: string;
  source_pack_control_id?: string;
  vulnerability_links?: Array<{ vulnerability_id: string; type: ControlType; notes?: string }>;
}

// Field changes to an existing row (2026-09-23). Codes (TP-1, V-2, C-3) are
// identifiers other rows and documents refer to, so they are not editable here;
// neither are links or scores — scores belong to the calculator.
export interface UpdateExposureInput {
  name?: string;
  description?: string | null;
  category?: ExposureCategory | string | null;
}

export interface UpdateThreatPathInput {
  name?: string;
  description?: string | null;
  fcp_domain?: FcpDomain | null;
}

export interface UpdateVulnerabilityInput {
  name?: string;
  description?: string | null;
  severity?: Score1to5;
}

export interface UpdateControlInput {
  name?: string;
  description?: string | null;
  type?: ControlType;
  strength?: ControlStrength;
  evidence?: string | null;
  owner_role?: string | null;
}

/** Extra audit detail recorded with a change or removal — e.g. the AI suggestion it came from. */
export type ChangeContext = Record<string, unknown>;

export const EDITABLE_FIELDS = {
  exposure: ['name', 'description', 'category'],
  threat_path: ['name', 'description', 'fcp_domain'],
  vulnerability: ['name', 'description', 'severity'],
  control: ['name', 'description', 'type', 'strength', 'evidence', 'owner_role'],
} as const;

export interface UpsertAppetiteInput {
  threat_path_id?: string | null;     // null = company-wide (Stage 7b)
  appetite_position: AppetitePosition;
  required_action?: string;
  target_date?: string | null;
  budget_eur?: number | null;
}

export interface CreateTriggerInput {
  trigger_event: string;
  required_action: string;
  timeline?: string;
  source?: 'user' | 'pack' | 'regulatory';
}

export interface CreateReviewCycleInput {
  activity: ReviewActivity;
  frequency: ReviewFrequency;
  owner_user_id?: string;
  next_due_at?: string;
  deadline_id?: string;
}

/**
 * An appetite statement's target_date as the day it is (YYYY-MM-DD).
 * The PostgreSQL adapter now returns every DATE as that text; this stays so the
 * service does not depend on it (a Date at local midnight printed as the
 * previous day east of UTC, and the path card saved it back a day early).
 */
function withDay<T extends { target_date: string | null } | null | undefined>(row: T): T {
  if (row && row.target_date !== null && row.target_date !== undefined) {
    (row as { target_date: string | null }).target_date = isoDay(row.target_date);
  }
  return row;
}

// ── Service factory ─────────────────────────────────────────────────

export function createAtlasService(db: DatabaseAdapter, options?: { eventLogger?: AtlasEventLogger; knowledgeBridge?: AtlasKnowledgeBridge }) {
  const events = options?.eventLogger ?? createAtlasEventLogger(db);
  const bridge = options?.knowledgeBridge ?? createAtlasKnowledgeBridge(db);

  // Helper: best-effort verify that a referenced industry_pack_id exists
  // and is enabled. Throws (caller catches) on bad reference rather than
  // silently writing a dangling pointer.
  async function assertPackExistsIfSet(packId: string | null | undefined): Promise<void> {
    if (!packId) return;
    const row = await db.get<{ id: string }>(
      `SELECT id FROM atlas_industry_packs WHERE id = ? AND is_enabled = TRUE`,
      packId,
    );
    if (!row) throw new Error(`Industry pack not found or disabled: ${packId}`);
  }

  /**
   * Change the given fields of one row in this Atlas and log each change with
   * its old and new value. Fields outside `allowed` are ignored; a field set to
   * the value it already has is not a change. The table and column names come
   * from the constants below, never from input.
   */
  async function updateFields<Row extends { id: string }>(
    spec: { table: string; label: string; event: AtlasEventType; allowed: readonly string[] },
    atlasId: string, rowId: string, changes: Record<string, unknown>, actorUserId: string, context?: ChangeContext,
  ): Promise<{ row: Row; changed: string[] }> {
    const before = await db.get<Row>(`SELECT * FROM ${spec.table} WHERE id = ? AND atlas_id = ?`, rowId, atlasId);
    if (!before) throw new Error(`${spec.label} not found in this atlas`);
    const sets: string[] = [];
    const vals: unknown[] = [];
    const diff: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of spec.allowed) {
      if (changes[key] === undefined) continue;
      const to = changes[key];
      const from = (before as Record<string, unknown>)[key] ?? null;
      if (from === (to ?? null)) continue;
      sets.push(`${key} = ?`);
      vals.push(to);
      diff[key] = { from, to: to ?? null };
    }
    if (sets.length === 0) return { row: before, changed: [] };
    await db.run(
      `UPDATE ${spec.table} SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ? AND atlas_id = ?`,
      ...vals, rowId, atlasId,
    );
    await events.logEvent({
      atlasId, event: spec.event, userId: actorUserId, subResourceId: rowId,
      details: { changes: diff, ...(context ?? {}) },
    });
    const row = await db.get<Row>(`SELECT * FROM ${spec.table} WHERE id = ? AND atlas_id = ?`, rowId, atlasId);
    if (!row) throw new Error(`${spec.label} missing after update`);
    return { row, changed: Object.keys(diff) };
  }

  // ── Atlas CRUD ──────────────────────────────────────────────────

  async function createAtlas(input: CreateAtlasInput, actorUserId: string, orgId = 'default'): Promise<RiskAtlasRow> {
    await assertPackExistsIfSet(input.industry_pack_id);
    const id = `atlas_${randomUUID()}`;
    // Timestamps default to NOW() in the schema — don't pass them so the
    // single source of truth is PG, avoiding JS-vs-DB clock skew.
    await db.run(
      `INSERT INTO risk_atlases
        (id, name, description, project_id, business_description, industry_pack_id,
         status, mode, entity_id, owner_user_id, created_by, org_id)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
      id, input.name, input.description ?? null, input.project_id ?? null,
      input.business_description ?? null, input.industry_pack_id ?? null,
      input.mode ?? 'socratic', input.entity_id ?? null,
      actorUserId, actorUserId, orgId,
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
    if (opts?.userId) { where.push('owner_user_id = ?'); params.push(opts.userId); }
    if (opts?.status) { where.push('status = ?'); params.push(opts.status); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return db.all<RiskAtlasRow>(
      `SELECT * FROM risk_atlases ${whereSql} ORDER BY updated_at DESC`,
      ...params,
    );
  }

  async function updateAtlas(id: string, updates: UpdateAtlasInput, actorUserId: string): Promise<RiskAtlasRow> {
    if (updates.industry_pack_id !== undefined) {
      await assertPackExistsIfSet(updates.industry_pack_id);
    }
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
    } else {
      // Capture non-status changes (rename, pack swap, mode change, …)
      // so the audit trail is complete.
      await events.logEvent({
        atlasId: id, event: 'atlas_updated', userId: actorUserId,
        details: { fields: Object.keys(updates) },
      });
    }
    const updated = await getAtlas(id);
    if (!updated) throw new Error('Atlas vanished after update');
    return updated;
  }

  async function archiveAtlas(id: string, actorUserId: string): Promise<RiskAtlasRow> {
    const result = await updateAtlas(id, { status: 'archived' }, actorUserId);
    await events.logEvent({ atlasId: id, event: 'atlas_archived', userId: actorUserId, details: {} });
    return result;
  }

  // ── Stage 1 — exposure points ───────────────────────────────────

  async function addExposure(atlasId: string, input: CreateExposureInput, actorUserId: string, context?: ChangeContext): Promise<AtlasExposurePointRow> {
    const id = `ex_${randomUUID().slice(0, 12)}`;
    await db.run(
      `INSERT INTO atlas_exposure_points (id, atlas_id, name, description, category, source_pack_exposure_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      id, atlasId, input.name, input.description ?? null, input.category ?? null,
      input.source_pack_exposure_id ?? null,
    );
    await events.logEvent({
      atlasId, event: 'exposure_added', userId: actorUserId, subResourceId: id,
      details: { name: input.name, category: input.category, ...(context ?? {}) },
    });
    const row = await db.get<AtlasExposurePointRow>(`SELECT * FROM atlas_exposure_points WHERE id = ?`, id);
    if (!row) throw new Error('Exposure missing after insert');
    return row;
  }

  async function listExposures(atlasId: string): Promise<AtlasExposurePointRow[]> {
    return db.all<AtlasExposurePointRow>(
      `SELECT * FROM atlas_exposure_points WHERE atlas_id = ? ORDER BY created_at`,
      atlasId,
    );
  }

  async function updateExposure(atlasId: string, exposureId: string, input: UpdateExposureInput, actorUserId: string, context?: ChangeContext): Promise<AtlasExposurePointRow> {
    return (await updateFields<AtlasExposurePointRow>(
      { table: 'atlas_exposure_points', label: 'Exposure', event: 'exposure_updated', allowed: EDITABLE_FIELDS.exposure },
      atlasId, exposureId, input as Record<string, unknown>, actorUserId, context,
    )).row;
  }

  async function removeExposure(atlasId: string, exposureId: string, actorUserId: string, context?: ChangeContext): Promise<void> {
    await assertInAtlas('atlas_exposure_points', 'Exposure', atlasId, [exposureId]);
    await db.run(`DELETE FROM atlas_exposure_points WHERE id = ? AND atlas_id = ?`, exposureId, atlasId);
    await events.logEvent({ atlasId, event: 'exposure_removed', userId: actorUserId, subResourceId: exposureId, details: context });
  }

  // ── Stage 2 — threat paths + exposure links ────────────────────

  async function addThreatPath(atlasId: string, input: CreateThreatPathInput, actorUserId: string, context?: ChangeContext): Promise<AtlasThreatPathRow> {
    // Links only to this Atlas's exposures — checked before anything is written.
    await assertInAtlas('atlas_exposure_points', 'Exposure', atlasId, input.exposure_ids ?? []);
    const id = `tp_${randomUUID().slice(0, 12)}`;
    await db.run(
      `INSERT INTO atlas_threat_paths (id, atlas_id, path_code, name, description, source_pack_path_id, fcp_domain)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id, atlasId, input.path_code, input.name, input.description ?? null,
      input.source_pack_path_id ?? null, input.fcp_domain ?? null,
    );
    if (input.exposure_ids?.length) {
      let order = 0;
      for (const exposureId of input.exposure_ids) {
        await db.run(
          `INSERT INTO atlas_threat_path_exposures (threat_path_id, exposure_point_id, order_in_path)
           VALUES (?, ?, ?) ON CONFLICT DO NOTHING`,
          id, exposureId, order++,
        );
      }
    }
    await events.logEvent({
      atlasId, event: 'path_added', userId: actorUserId, subResourceId: id,
      details: { code: input.path_code, name: input.name, fcp_domain: input.fcp_domain ?? null, ...(context ?? {}) },
    });
    const row = await db.get<AtlasThreatPathRow>(`SELECT * FROM atlas_threat_paths WHERE id = ?`, id);
    if (!row) throw new Error('Threat path missing after insert');
    // Cross-Workflow Intelligence — push as a 'risk' atom (best-effort)
    const atlas = await getAtlas(atlasId);
    if (atlas) await bridge.pushThreatPathAtom(atlas, row, null);
    return row;
  }

  async function listThreatPaths(atlasId: string): Promise<AtlasThreatPathRow[]> {
    return db.all<AtlasThreatPathRow>(
      `SELECT * FROM atlas_threat_paths WHERE atlas_id = ? ORDER BY path_code`,
      atlasId,
    );
  }

  async function updateThreatPath(atlasId: string, threatPathId: string, input: UpdateThreatPathInput, actorUserId: string, context?: ChangeContext): Promise<AtlasThreatPathRow> {
    return (await updateFields<AtlasThreatPathRow>(
      { table: 'atlas_threat_paths', label: 'Threat path', event: 'path_updated', allowed: EDITABLE_FIELDS.threat_path },
      atlasId, threatPathId, input as Record<string, unknown>, actorUserId, context,
    )).row;
  }

  async function removeThreatPath(atlasId: string, threatPathId: string, actorUserId: string, context?: ChangeContext): Promise<void> {
    await assertInAtlas('atlas_threat_paths', 'Threat path', atlasId, [threatPathId]);
    await db.run(`DELETE FROM atlas_threat_paths WHERE id = ? AND atlas_id = ?`, threatPathId, atlasId);
    await events.logEvent({ atlasId, event: 'path_removed', userId: actorUserId, subResourceId: threatPathId, details: context });
  }

  // ── Stage 3 — vulnerabilities + threat-path links ──────────────

  async function addVulnerability(atlasId: string, input: CreateVulnerabilityInput, actorUserId: string, context?: ChangeContext): Promise<AtlasVulnerabilityRow> {
    // Links only to this Atlas's threat paths — checked before anything is written.
    await assertInAtlas('atlas_threat_paths', 'Threat path', atlasId, input.threat_path_ids ?? []);
    const id = `v_${randomUUID().slice(0, 12)}`;
    await db.run(
      `INSERT INTO atlas_vulnerabilities (id, atlas_id, vuln_code, name, description, severity, source_pack_vuln_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id, atlasId, input.vuln_code, input.name, input.description ?? null,
      input.severity, input.source_pack_vuln_id ?? null,
    );
    if (input.threat_path_ids?.length) {
      for (const tpId of input.threat_path_ids) {
        await db.run(
          `INSERT INTO atlas_threat_path_vulnerabilities (threat_path_id, vulnerability_id)
           VALUES (?, ?) ON CONFLICT DO NOTHING`,
          tpId, id,
        );
      }
    }
    await events.logEvent({
      atlasId, event: 'vulnerability_added', userId: actorUserId, subResourceId: id,
      details: { code: input.vuln_code, severity: input.severity, ...(context ?? {}) },
    });
    const row = await db.get<AtlasVulnerabilityRow>(`SELECT * FROM atlas_vulnerabilities WHERE id = ?`, id);
    if (!row) throw new Error('Vulnerability missing after insert');
    const atlas = await getAtlas(atlasId);
    if (atlas) await bridge.pushVulnerabilityFinding(atlas, row);
    return row;
  }

  async function listVulnerabilities(atlasId: string): Promise<AtlasVulnerabilityRow[]> {
    return db.all<AtlasVulnerabilityRow>(
      `SELECT * FROM atlas_vulnerabilities WHERE atlas_id = ? ORDER BY vuln_code`,
      atlasId,
    );
  }

  async function updateVulnerability(atlasId: string, vulnId: string, input: UpdateVulnerabilityInput, actorUserId: string, context?: ChangeContext): Promise<AtlasVulnerabilityRow> {
    // Severity describes the weakness; it does not feed the calculator (the
    // Stage 4 vulnerability score is set per path), so no residual changes here.
    return (await updateFields<AtlasVulnerabilityRow>(
      { table: 'atlas_vulnerabilities', label: 'Vulnerability', event: 'vulnerability_updated', allowed: EDITABLE_FIELDS.vulnerability },
      atlasId, vulnId, input as Record<string, unknown>, actorUserId, context,
    )).row;
  }

  async function removeVulnerability(atlasId: string, vulnId: string, actorUserId: string, context?: ChangeContext): Promise<void> {
    // Removing a vulnerability also removes the control links on it (cascade),
    // so the paths it sat on can lose control cover: their residuals are
    // recalculated, as removeControl does. Collected before the delete.
    await assertInAtlas('atlas_vulnerabilities', 'Vulnerability', atlasId, [vulnId]);
    const tpIds = await affectedPathsForVulns([vulnId]);
    await db.run(`DELETE FROM atlas_vulnerabilities WHERE id = ? AND atlas_id = ?`, vulnId, atlasId);
    await events.logEvent({ atlasId, event: 'vulnerability_removed', userId: actorUserId, subResourceId: vulnId, details: context });
    for (const tpId of tpIds) await recalculateResidualForPath(tpId, actorUserId);
  }

  // ── Stage 4 — inherent scoring (deterministic) ─────────────────

  async function scoreInherent(
    atlasId: string,
    threatPathId: string,
    scores: { exposure: Score1to5; threat: Score1to5; vulnerability: Score1to5; rationale?: string },
    actorUserId: string,
    context?: ChangeContext,
  ): Promise<{ inherent: AtlasInherentScoreRow; residual: AtlasResidualScoreRow | null }> {
    // Tenancy scoping (2026-07-17): the route verifies access to atlasId, so the
    // threat path MUST belong to that atlas — otherwise any authenticated caller
    // could write scores into other users' atlases by guessing tpIds.
    const owned = await db.get<{ id: string }>(
      `SELECT id FROM atlas_threat_paths WHERE id = ? AND atlas_id = ?`, threatPathId, atlasId,
    );
    if (!owned) throw new Error('Threat path not found in this atlas');
    const previous = await db.get<{ exposure_score: number; threat_score: number; vulnerability_score: number; inherent_score: number }>(
      `SELECT exposure_score, threat_score, vulnerability_score, inherent_score FROM atlas_inherent_scores WHERE threat_path_id = ?`, threatPathId,
    );
    const inherent = calculateInherent(scores.exposure, scores.threat, scores.vulnerability);
    const id = `is_${randomUUID().slice(0, 12)}`;
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
        atlasId: path.atlas_id, event: 'inherent_scored', userId: actorUserId, subResourceId: threatPathId,
        details: {
          exposure: scores.exposure, threat: scores.threat, vulnerability: scores.vulnerability, inherent,
          // A rescore replaces audited scores: the ledger keeps what they were.
          ...(previous ? { previous } : {}),
          ...(context ?? {}),
        },
      });
    }
    const inherentRow = await db.get<AtlasInherentScoreRow>(
      `SELECT * FROM atlas_inherent_scores WHERE threat_path_id = ?`, threatPathId,
    );
    if (!inherentRow) throw new Error('Inherent row missing after upsert');
    const residual = await recalculateResidualForPath(threatPathId, actorUserId);
    return { inherent: inherentRow, residual };
  }

  // ── Stage 5 — controls + control-vulnerability matrix ─────────

  async function addControl(atlasId: string, input: CreateControlInput, actorUserId: string, context?: ChangeContext): Promise<AtlasControlRow> {
    if (input.strength === 'strong' && (!input.evidence || input.evidence.trim().length < 5)) {
      throw new Error('Cannot mark control "strong" without specific evidence (min 5 chars)');
    }
    // Covers only this Atlas's vulnerabilities — checked before anything is
    // written. A link to another Atlas's vulnerability would let this control
    // change that Atlas's residuals.
    await assertInAtlas('atlas_vulnerabilities', 'Vulnerability', atlasId, (input.vulnerability_links ?? []).map((l) => l.vulnerability_id));
    const id = `c_${randomUUID().slice(0, 12)}`;
    await db.run(
      `INSERT INTO atlas_controls
        (id, atlas_id, control_code, name, description, type, strength, evidence, owner_role, source_pack_control_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, atlasId, input.control_code, input.name, input.description ?? null,
      input.type, input.strength, input.evidence ?? null,
      input.owner_role ?? null, input.source_pack_control_id ?? null,
    );
    if (input.vulnerability_links?.length) {
      for (const link of input.vulnerability_links) {
        await db.run(
          `INSERT INTO atlas_control_vulnerability_map (control_id, vulnerability_id, type, notes)
           VALUES (?, ?, ?, ?) ON CONFLICT (control_id, vulnerability_id, type) DO NOTHING`,
          id, link.vulnerability_id, link.type, link.notes ?? null,
        );
      }
    }
    await events.logEvent({
      atlasId, event: 'control_added', userId: actorUserId, subResourceId: id,
      details: { code: input.control_code, type: input.type, strength: input.strength, ...(context ?? {}) },
    });
    if (input.vulnerability_links?.length) {
      const tpIds = await affectedPathsForVulns(input.vulnerability_links.map(l => l.vulnerability_id));
      for (const tpId of tpIds) await recalculateResidualForPath(tpId, actorUserId);
    }
    const row = await db.get<AtlasControlRow>(`SELECT * FROM atlas_controls WHERE id = ?`, id);
    if (!row) throw new Error('Control missing after insert');
    const atlas = await getAtlas(atlasId);
    if (atlas) await bridge.pushControlAtom(atlas, row);
    return row;
  }

  async function listControls(atlasId: string): Promise<AtlasControlRow[]> {
    return db.all<AtlasControlRow>(
      `SELECT * FROM atlas_controls WHERE atlas_id = ? ORDER BY control_code`,
      atlasId,
    );
  }

  async function updateControl(atlasId: string, controlId: string, input: UpdateControlInput, actorUserId: string, context?: ChangeContext): Promise<AtlasControlRow> {
    const current = await db.get<AtlasControlRow>(`SELECT * FROM atlas_controls WHERE id = ? AND atlas_id = ?`, controlId, atlasId);
    if (!current) throw new Error('Control not found in this atlas');
    // The same rule as addControl, applied to the row as it would be after the change.
    const strength = input.strength ?? current.strength;
    const evidence = input.evidence !== undefined ? input.evidence : current.evidence;
    if (strength === 'strong' && (!evidence || evidence.trim().length < 5)) {
      throw new Error('Cannot mark control "strong" without specific evidence (min 5 chars)');
    }
    const { row, changed } = await updateFields<AtlasControlRow>(
      { table: 'atlas_controls', label: 'Control', event: 'control_updated', allowed: EDITABLE_FIELDS.control },
      atlasId, controlId, input as Record<string, unknown>, actorUserId, context,
    );
    // Strength feeds the worst-of rollup, so every path the control covers is
    // rescored by the calculator.
    if (changed.includes('strength')) {
      const links = await db.all<{ vulnerability_id: string }>(
        `SELECT DISTINCT vulnerability_id FROM atlas_control_vulnerability_map WHERE control_id = ?`,
        controlId,
      );
      for (const tpId of await affectedPathsForVulns(links.map(l => l.vulnerability_id))) {
        await recalculateResidualForPath(tpId, actorUserId);
      }
    }
    return row;
  }

  async function removeControl(atlasId: string, controlId: string, actorUserId: string, context?: ChangeContext): Promise<void> {
    await assertInAtlas('atlas_controls', 'Control', atlasId, [controlId]);
    const links = await db.all<{ vulnerability_id: string }>(
      `SELECT DISTINCT vulnerability_id FROM atlas_control_vulnerability_map WHERE control_id = ?`,
      controlId,
    );
    const tpIds = await affectedPathsForVulns(links.map(l => l.vulnerability_id));
    await db.run(`DELETE FROM atlas_controls WHERE id = ? AND atlas_id = ?`, controlId, atlasId);
    await events.logEvent({ atlasId, event: 'control_removed', userId: actorUserId, subResourceId: controlId, details: context });
    for (const tpId of tpIds) await recalculateResidualForPath(tpId, actorUserId);
  }

  // ── Stage 6 — residual recalculation (deterministic) ──────────

  async function recalculateResidualForPath(threatPathId: string, actorUserId: string, expectedAtlasId?: string): Promise<AtlasResidualScoreRow | null> {
    // expectedAtlasId is passed by route-level callers (tenancy scoping); internal
    // callers reach here via mutations that already verified atlas ownership.
    if (expectedAtlasId) {
      const owned = await db.get<{ id: string }>(
        `SELECT id FROM atlas_threat_paths WHERE id = ? AND atlas_id = ?`, threatPathId, expectedAtlasId,
      );
      if (!owned) throw new Error('Threat path not found in this atlas');
    }
    const inherent = await db.get<{ inherent_score: Score1to5 }>(
      `SELECT inherent_score FROM atlas_inherent_scores WHERE threat_path_id = ?`,
      threatPathId,
    );
    if (!inherent) return null;
    // Only controls of the path's own Atlas count (links are checked on the way
    // in; this keeps a stray cross-Atlas link from moving a score).
    const controlStrengths = await db.all<{ strength: ControlStrength }>(
      `SELECT DISTINCT c.strength
       FROM atlas_threat_path_vulnerabilities tpv
       JOIN atlas_threat_paths tp ON tp.id = tpv.threat_path_id
       JOIN atlas_control_vulnerability_map cvm ON cvm.vulnerability_id = tpv.vulnerability_id
       JOIN atlas_controls c ON c.id = cvm.control_id AND c.atlas_id = tp.atlas_id
       WHERE tpv.threat_path_id = ?`,
      threatPathId,
    );
    const rollup = rollupControlQuality(controlStrengths.map(r => r.strength));
    const calc = calculateResidual({ inherent_score: inherent.inherent_score, control_quality_rollup: rollup });
    const id = `rs_${randomUUID().slice(0, 12)}`;
    await db.run(
      `INSERT INTO atlas_residual_scores
        (id, threat_path_id, residual_score, control_quality_rollup, open_vulnerability_notes, calculated_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON CONFLICT (threat_path_id) DO UPDATE SET
         residual_score = EXCLUDED.residual_score,
         control_quality_rollup = EXCLUDED.control_quality_rollup,
         open_vulnerability_notes = EXCLUDED.open_vulnerability_notes,
         calculated_at = EXCLUDED.calculated_at`,
      id, threatPathId, calc.residual_score, rollup, calc.rationale,
    );
    const path = await db.get<{ atlas_id: string }>(`SELECT atlas_id FROM atlas_threat_paths WHERE id = ?`, threatPathId);
    if (path) {
      await events.logEvent({
        atlasId: path.atlas_id, event: 'residual_recalculated', userId: actorUserId, subResourceId: threatPathId,
        details: { residual_score: calc.residual_score, rollup, appetite: calc.appetite_position },
      });
    }
    return (await db.get<AtlasResidualScoreRow>(
      `SELECT * FROM atlas_residual_scores WHERE threat_path_id = ?`, threatPathId,
    )) ?? null;
  }

  // ── Stage 7 — appetite + escalation triggers ──────────────────

  async function upsertAppetite(atlasId: string, input: UpsertAppetiteInput, actorUserId: string, context?: ChangeContext): Promise<AtlasAppetiteStatementRow> {
    const id = `app_${randomUUID().slice(0, 12)}`;
    let previous: AtlasAppetiteStatementRow | undefined;
    if (input.threat_path_id) {
      // A statement is on a path of this Atlas. Without the check, one Atlas could
      // attach a statement to another's path, and that Atlas's rollup (which reads
      // statements by path) would count it.
      await assertInAtlas('atlas_threat_paths', 'Threat path', atlasId, [input.threat_path_id]);
      previous = withDay(await db.get<AtlasAppetiteStatementRow>(
        `SELECT * FROM atlas_appetite_statements WHERE atlas_id = ? AND threat_path_id = ?`, atlasId, input.threat_path_id,
      ));
      // Per-path: rely on the partial unique index uq_atlas_appetite_path
      // (added in migration 126). ON CONFLICT serialises concurrent upserts.
      // An approval covers what was approved: when the position, action, date
      // or budget changes, the statement is no longer approved (2026-09-23).
      await db.run(
        `INSERT INTO atlas_appetite_statements
          (id, atlas_id, threat_path_id, appetite_position, required_action, target_date, budget_eur)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (atlas_id, threat_path_id) WHERE threat_path_id IS NOT NULL DO UPDATE SET
           appetite_position = EXCLUDED.appetite_position,
           required_action = EXCLUDED.required_action,
           target_date = EXCLUDED.target_date,
           budget_eur = EXCLUDED.budget_eur,
           approved_by = CASE
             WHEN (atlas_appetite_statements.appetite_position, atlas_appetite_statements.required_action,
                   atlas_appetite_statements.target_date, atlas_appetite_statements.budget_eur)
                  IS NOT DISTINCT FROM
                  (EXCLUDED.appetite_position, EXCLUDED.required_action, EXCLUDED.target_date, EXCLUDED.budget_eur)
             THEN atlas_appetite_statements.approved_by ELSE NULL END,
           approved_at = CASE
             WHEN (atlas_appetite_statements.appetite_position, atlas_appetite_statements.required_action,
                   atlas_appetite_statements.target_date, atlas_appetite_statements.budget_eur)
                  IS NOT DISTINCT FROM
                  (EXCLUDED.appetite_position, EXCLUDED.required_action, EXCLUDED.target_date, EXCLUDED.budget_eur)
             THEN atlas_appetite_statements.approved_at ELSE NULL END,
           updated_at = NOW()`,
        id, atlasId, input.threat_path_id,
        input.appetite_position, input.required_action ?? null,
        input.target_date ?? null, input.budget_eur ?? null,
      );
    } else {
      // Company-wide (Stage 7b) — multiple rows over time are intentional.
      await db.run(
        `INSERT INTO atlas_appetite_statements
          (id, atlas_id, threat_path_id, appetite_position, required_action, target_date, budget_eur)
         VALUES (?, ?, NULL, ?, ?, ?, ?)`,
        id, atlasId,
        input.appetite_position, input.required_action ?? null,
        input.target_date ?? null, input.budget_eur ?? null,
      );
    }
    const row = withDay(await db.get<AtlasAppetiteStatementRow>(
      input.threat_path_id
        ? `SELECT * FROM atlas_appetite_statements WHERE atlas_id = ? AND threat_path_id = ?`
        : `SELECT * FROM atlas_appetite_statements WHERE id = ?`,
      ...(input.threat_path_id ? [atlasId, input.threat_path_id] : [id]),
    ));
    if (!row) throw new Error('Appetite row missing after upsert');
    // The ledger keeps what a statement said before, and says when a change
    // withdrew an approval — the approval itself is gone from the row.
    await events.logEvent({
      atlasId, event: 'appetite_changed', userId: actorUserId,
      subResourceId: input.threat_path_id ?? undefined,
      details: {
        appetite: input.appetite_position,
        ...(previous ? {
          previous: {
            appetite_position: previous.appetite_position, required_action: previous.required_action,
            target_date: previous.target_date, budget_eur: previous.budget_eur,
          },
          ...(previous.approved_at && !row.approved_at ? { approval_withdrawn: { approved_by: previous.approved_by, approved_at: previous.approved_at } } : {}),
        } : {}),
        ...(context ?? {}),
      },
    });
    const atlas = await getAtlas(atlasId);
    if (atlas) await bridge.pushAppetiteRecommendation(atlas, row);
    return row;
  }

  async function approveAppetite(atlasId: string, appetiteId: string, actorUserId: string): Promise<AtlasAppetiteStatementRow> {
    // Tenancy scoping (2026-07-17): approve only within the access-checked atlas.
    await db.run(
      `UPDATE atlas_appetite_statements SET approved_by = ?, approved_at = NOW(), updated_at = NOW() WHERE id = ? AND atlas_id = ?`,
      actorUserId, appetiteId, atlasId,
    );
    const row = withDay(await db.get<AtlasAppetiteStatementRow>(
      `SELECT * FROM atlas_appetite_statements WHERE id = ? AND atlas_id = ?`, appetiteId, atlasId,
    ));
    if (!row) throw new Error('Appetite not found in this atlas');
    await events.logEvent({
      atlasId: row.atlas_id, event: 'appetite_approved', userId: actorUserId, subResourceId: appetiteId,
    });
    return row;
  }

  async function listAppetite(atlasId: string): Promise<AtlasAppetiteStatementRow[]> {
    return (await db.all<AtlasAppetiteStatementRow>(
      `SELECT * FROM atlas_appetite_statements WHERE atlas_id = ? ORDER BY threat_path_id NULLS FIRST`,
      atlasId,
    )).map(withDay);
  }

  async function addTrigger(atlasId: string, input: CreateTriggerInput, actorUserId: string, context?: ChangeContext): Promise<AtlasEscalationTriggerRow> {
    const id = `trg_${randomUUID().slice(0, 12)}`;
    await db.run(
      `INSERT INTO atlas_escalation_triggers (id, atlas_id, trigger_event, required_action, timeline, source)
       VALUES (?, ?, ?, ?, ?, ?)`,
      id, atlasId, input.trigger_event, input.required_action,
      input.timeline ?? null, input.source ?? 'user',
    );
    await events.logEvent({
      atlasId, event: 'trigger_added', userId: actorUserId, subResourceId: id,
      details: { event: input.trigger_event, ...(context ?? {}) },
    });
    const row = await db.get<AtlasEscalationTriggerRow>(`SELECT * FROM atlas_escalation_triggers WHERE id = ?`, id);
    if (!row) throw new Error('Trigger missing after insert');
    return row;
  }

  async function listTriggers(atlasId: string): Promise<AtlasEscalationTriggerRow[]> {
    return db.all<AtlasEscalationTriggerRow>(
      `SELECT * FROM atlas_escalation_triggers WHERE atlas_id = ? ORDER BY created_at`,
      atlasId,
    );
  }

  // ── Maintenance — review cycles ────────────────────────────────

  async function addReviewCycle(atlasId: string, input: CreateReviewCycleInput, actorUserId?: string | null): Promise<AtlasReviewCycleRow> {
    const id = `rc_${randomUUID().slice(0, 12)}`;
    await db.run(
      `INSERT INTO atlas_review_cycles
        (id, atlas_id, activity, frequency, owner_user_id, next_due_at, deadline_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id, atlasId, input.activity, input.frequency,
      input.owner_user_id ?? null, input.next_due_at ?? null, input.deadline_id ?? null,
    );
    await events.logEvent({
      atlasId, event: 'review_cycle_added', userId: actorUserId ?? null, subResourceId: id,
      details: { activity: input.activity, frequency: input.frequency },
    });
    const row = await db.get<AtlasReviewCycleRow>(`SELECT * FROM atlas_review_cycles WHERE id = ?`, id);
    if (!row) throw new Error('Review cycle missing after insert');
    return row;
  }

  async function listReviewCycles(atlasId: string): Promise<AtlasReviewCycleRow[]> {
    return db.all<AtlasReviewCycleRow>(
      `SELECT * FROM atlas_review_cycles WHERE atlas_id = ? ORDER BY next_due_at NULLS LAST`,
      atlasId,
    );
  }

  // ── Read helpers — full hydrated views ─────────────────────────

  async function getThreatPathFull(threatPathId: string, expectedAtlasId?: string): Promise<ThreatPathFull | null> {
    const path = await db.get<AtlasThreatPathRow>(`SELECT * FROM atlas_threat_paths WHERE id = ?`, threatPathId);
    if (!path) return null;
    // Tenancy scoping (2026-07-17): route callers pass the access-checked atlas id
    // so a guessed tpId can't read another user's fully-hydrated path.
    if (expectedAtlasId && path.atlas_id !== expectedAtlasId) return null;
    const exposures = await db.all<AtlasExposurePointRow>(
      `SELECT e.* FROM atlas_exposure_points e
       JOIN atlas_threat_path_exposures tpe ON tpe.exposure_point_id = e.id
       WHERE tpe.threat_path_id = ? ORDER BY tpe.order_in_path`,
      threatPathId,
    );
    const vulnerabilities = await db.all<AtlasVulnerabilityRow>(
      `SELECT v.* FROM atlas_vulnerabilities v
       JOIN atlas_threat_path_vulnerabilities tpv ON tpv.vulnerability_id = v.id
       WHERE tpv.threat_path_id = ? ORDER BY v.vuln_code`,
      threatPathId,
    );
    const inherent = (await db.get<AtlasInherentScoreRow>(
      `SELECT * FROM atlas_inherent_scores WHERE threat_path_id = ?`, threatPathId,
    )) ?? null;
    const controls = await db.all<AtlasControlRow>(
      `SELECT DISTINCT c.* FROM atlas_controls c
       JOIN atlas_control_vulnerability_map cvm ON cvm.control_id = c.id
       JOIN atlas_threat_path_vulnerabilities tpv ON tpv.vulnerability_id = cvm.vulnerability_id
       WHERE tpv.threat_path_id = ? ORDER BY c.control_code`,
      threatPathId,
    );
    const residual = (await db.get<AtlasResidualScoreRow>(
      `SELECT * FROM atlas_residual_scores WHERE threat_path_id = ?`, threatPathId,
    )) ?? null;
    const appetite = withDay(await db.get<AtlasAppetiteStatementRow>(
      `SELECT * FROM atlas_appetite_statements WHERE threat_path_id = ?`, threatPathId,
    )) ?? null;
    return { path, exposures, vulnerabilities, inherent, controls, residual, appetite };
  }

  async function getDashboard(atlasId: string): Promise<AtlasDashboard | null> {
    const atlas = await getAtlas(atlasId);
    if (!atlas) return null;
    const pack = atlas.industry_pack_id
      ? (await db.get<AtlasIndustryPackRow>(
          `SELECT * FROM atlas_industry_packs WHERE id = ?`, atlas.industry_pack_id,
        )) ?? null
      : null;
    const paths = await listThreatPaths(atlasId);
    const pathsTotal = paths.length;
    const byAppetite: Record<AppetitePosition, number> = {
      within: 0, boundary: 0, outside: 0, unacceptable: 0,
    };
    const byResidual: Record<Score1to5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const outsidePathsFull: ThreatPathFull[] = [];
    // Parallel hydration — for 20 paths this turns 20×6=120 sequential
    // queries into 20 concurrent batches of 6. Phase 2 will replace with
    // a single batched snapshot query, but Promise.all is the cheap win.
    const fulls = await Promise.all(paths.map(p => getThreatPathFull(p.id)));
    for (const full of fulls) {
      if (!full) continue;
      const r = full.residual?.residual_score ?? null;
      const ap = r ? appetitePositionFor(r) : null;
      if (ap) byAppetite[ap]++;
      if (r) byResidual[r]++;
      if (ap === 'outside' || ap === 'unacceptable') outsidePathsFull.push(full);
    }
    const lastEvent = await db.get<{ created_at: string }>(
      `SELECT created_at FROM atlas_events WHERE atlas_id = ? ORDER BY created_at DESC LIMIT 1`,
      atlasId,
    );
    return {
      atlas, pack,
      paths_total: pathsTotal,
      paths_by_appetite: byAppetite,
      paths_by_residual: byResidual,
      paths_outside_appetite: outsidePathsFull,
      next_review_at: atlas.next_review_due_at,
      last_event_at: lastEvent?.created_at ?? null,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────

  /**
   * Every id must be a row of this Atlas in `table` (a constant, never input).
   * Checked before a write, so a link or removal can never reach another
   * Atlas's rows and nothing is half-written when an id is wrong.
   */
  async function assertInAtlas(table: string, label: string, atlasId: string, ids: string[]): Promise<void> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return;
    const placeholders = unique.map(() => '?').join(',');
    const found = await db.all<{ id: string }>(
      `SELECT id FROM ${table} WHERE atlas_id = ? AND id IN (${placeholders})`, atlasId, ...unique,
    );
    if (found.length !== unique.length) throw new Error(`${label} not found in this atlas`);
  }

  async function affectedPathsForVulns(vulnerabilityIds: string[]): Promise<string[]> {
    if (vulnerabilityIds.length === 0) return [];
    const placeholders = vulnerabilityIds.map(() => '?').join(',');
    const rows = await db.all<{ threat_path_id: string }>(
      `SELECT DISTINCT threat_path_id FROM atlas_threat_path_vulnerabilities WHERE vulnerability_id IN (${placeholders})`,
      ...vulnerabilityIds,
    );
    return rows.map(r => r.threat_path_id);
  }

  return {
    // Atlas
    createAtlas, getAtlas, listAtlases, updateAtlas, archiveAtlas,
    // Stage 1
    addExposure, listExposures, updateExposure, removeExposure,
    // Stage 2
    addThreatPath, listThreatPaths, updateThreatPath, removeThreatPath,
    // Stage 3
    addVulnerability, listVulnerabilities, updateVulnerability, removeVulnerability,
    // Stage 4
    scoreInherent,
    // Stage 5
    addControl, listControls, updateControl, removeControl,
    // Stage 6
    recalculateResidualForPath,
    // Stage 7
    upsertAppetite, approveAppetite, listAppetite,
    addTrigger, listTriggers,
    // Maintenance
    addReviewCycle, listReviewCycles,
    // Hydrated reads
    getThreatPathFull, getDashboard,
    // Re-exports for tests
    _calculatePathScores: calculatePathScores,
  };
}

export type AtlasService = ReturnType<typeof createAtlasService>;
