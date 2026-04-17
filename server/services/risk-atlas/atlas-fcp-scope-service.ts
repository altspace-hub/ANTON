// ── Atlas FCP Scope Service — Addendum 1 / Phase 1i ────────────────────
//
// Owns three concerns introduced by Addendum 1:
//
//   1. atlas_fcp_scope          — which FCP domains are active for an Atlas
//   2. atlas_cross_domain_path_bundles + members — cross-domain stories
//   3. company-wide appetite consolidation (Stage 7b) — worst-of rollup
//      per FCP domain + overall position, derived deterministically from
//      the per-path appetite statements
//
// Pure data-layer: validation lives in the route layer, prompt logic lives
// in the atlas-company-appetite-consolidator module.

import type { DatabaseAdapter } from '../../db/database.js';
import { appetitePositionFor } from './atlas-residual-calculator.js';
import { createAtlasEventLogger } from './atlas-event-logger.js';
import type {
  AppetitePosition, FcpDomain, Score1to5,
} from './types.js';

export type FcpScopeFlagKey =
  | 'amlcft' | 'sanctions' | 'fraud' | 'abc' | 'market_abuse'
  | 'tax_evasion_facilitation' | 'export_controls' | 'modern_slavery';

export interface AtlasFcpScopeRow {
  atlas_id: string;
  amlcft_active: boolean;
  sanctions_active: boolean;
  fraud_active: boolean;
  abc_active: boolean;
  market_abuse_active: boolean;
  tax_evasion_facilitation_active: boolean;
  export_controls_active: boolean;
  modern_slavery_active: boolean;
  universal_core_active: boolean;
  scope_rationale: string | null;
  assessed_by: string | null;
  last_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AtlasCrossDomainBundleRow {
  id: number;
  atlas_id: string;
  bundle_code: string;
  name: string;
  description: string | null;
  primary_domain: FcpDomain | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AtlasCrossDomainBundleMemberRow {
  bundle_id: number;
  threat_path_id: string;
  role_in_bundle: 'entry' | 'middle' | 'exit' | 'amplifier';
  notes: string | null;
  created_at: string;
}

export interface BundleWithMembers extends AtlasCrossDomainBundleRow {
  members: Array<AtlasCrossDomainBundleMemberRow & { path_code: string; name: string; fcp_domain: FcpDomain | null; residual_score: number | null }>;
}

export interface CompanyAppetiteRollup {
  atlas_id: string;
  overall_position: AppetitePosition | null;
  by_domain: Partial<Record<FcpDomain, AppetitePosition>>;
  by_dimension: { operational: AppetitePosition | null };  // non-FCP
  paths_outside_or_unacceptable: number;
  paths_at_boundary: number;
  paths_within: number;
  paths_unscored: number;
  computed_at: string;
}

const SCOPE_FLAG_TO_FCP_DOMAIN: Record<FcpScopeFlagKey, FcpDomain> = {
  amlcft: 'amlcft',
  sanctions: 'sanctions',
  fraud: 'fraud',
  abc: 'abc',
  market_abuse: 'market_abuse',
  tax_evasion_facilitation: 'tax_evasion_facilitation',
  export_controls: 'export_controls',
  modern_slavery: 'modern_slavery',
};

// ── Worst-of comparator for the company-wide rollup ────────────────────
const POSITION_RANK: Record<AppetitePosition, number> = {
  within: 0, boundary: 1, outside: 2, unacceptable: 3,
};
function worstOf(a: AppetitePosition | null, b: AppetitePosition): AppetitePosition {
  if (!a) return b;
  return POSITION_RANK[b] > POSITION_RANK[a] ? b : a;
}

export function createAtlasFcpScopeService(db: DatabaseAdapter) {
  const events = createAtlasEventLogger(db);

  // ── Scope ────────────────────────────────────────────────────────────

  async function getScope(atlasId: string): Promise<AtlasFcpScopeRow | null> {
    return (await db.get<AtlasFcpScopeRow>(
      `SELECT * FROM atlas_fcp_scope WHERE atlas_id = ?`,
      atlasId,
    )) ?? null;
  }

  async function upsertScope(atlasId: string, scope: Partial<Omit<AtlasFcpScopeRow, 'atlas_id' | 'assessed_by' | 'created_at' | 'updated_at'>>, actorUserId: string): Promise<AtlasFcpScopeRow> {
    // Universal Core is implicitly ON when any FCP domain flag is on.
    // Compute the derived flag here so the route layer doesn't have to.
    // assessed_by is always the current actor — never trusted from the
    // request body so the audit trail can't be spoofed by a malicious
    // (but otherwise authenticated) caller (multi-expert review fix).
    const merged: AtlasFcpScopeRow = {
      atlas_id: atlasId,
      amlcft_active: scope.amlcft_active ?? false,
      sanctions_active: scope.sanctions_active ?? true,
      fraud_active: scope.fraud_active ?? true,
      abc_active: scope.abc_active ?? false,
      market_abuse_active: scope.market_abuse_active ?? false,
      tax_evasion_facilitation_active: scope.tax_evasion_facilitation_active ?? false,
      export_controls_active: scope.export_controls_active ?? false,
      modern_slavery_active: scope.modern_slavery_active ?? false,
      universal_core_active: false,
      scope_rationale: scope.scope_rationale ?? null,
      assessed_by: actorUserId,
      last_reviewed_at: new Date().toISOString(),
      created_at: '', updated_at: '',
    };
    merged.universal_core_active = (
      merged.amlcft_active || merged.sanctions_active || merged.fraud_active || merged.abc_active ||
      merged.market_abuse_active || merged.tax_evasion_facilitation_active || merged.export_controls_active ||
      merged.modern_slavery_active
    );
    const row = await db.get<AtlasFcpScopeRow>(
      `INSERT INTO atlas_fcp_scope (
         atlas_id, amlcft_active, sanctions_active, fraud_active, abc_active,
         market_abuse_active, tax_evasion_facilitation_active, export_controls_active,
         modern_slavery_active, universal_core_active, scope_rationale, assessed_by, last_reviewed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (atlas_id) DO UPDATE SET
         amlcft_active = EXCLUDED.amlcft_active,
         sanctions_active = EXCLUDED.sanctions_active,
         fraud_active = EXCLUDED.fraud_active,
         abc_active = EXCLUDED.abc_active,
         market_abuse_active = EXCLUDED.market_abuse_active,
         tax_evasion_facilitation_active = EXCLUDED.tax_evasion_facilitation_active,
         export_controls_active = EXCLUDED.export_controls_active,
         modern_slavery_active = EXCLUDED.modern_slavery_active,
         universal_core_active = EXCLUDED.universal_core_active,
         scope_rationale = EXCLUDED.scope_rationale,
         assessed_by = EXCLUDED.assessed_by,
         last_reviewed_at = EXCLUDED.last_reviewed_at,
         updated_at = NOW()
       RETURNING *`,
      atlasId, merged.amlcft_active, merged.sanctions_active, merged.fraud_active, merged.abc_active,
      merged.market_abuse_active, merged.tax_evasion_facilitation_active, merged.export_controls_active,
      merged.modern_slavery_active, merged.universal_core_active, merged.scope_rationale, merged.assessed_by, merged.last_reviewed_at,
    );
    if (!row) throw new Error('Failed to upsert FCP scope');
    void events.logEvent({ atlasId, event: 'fcp_scope_updated', userId: actorUserId, details: { scope: row } });
    return row;
  }

  // ── Cross-domain bundles ────────────────────────────────────────────

  type BundleMemberHydrated = AtlasCrossDomainBundleMemberRow & { path_code: string; name: string; fcp_domain: FcpDomain | null; residual_score: number | null };

  async function fetchBundleMembers(bundleIds: number[]): Promise<BundleMemberHydrated[]> {
    if (bundleIds.length === 0) return [];
    const placeholders = bundleIds.map(() => '?').join(',');
    return db.all<BundleMemberHydrated>(
      `SELECT m.bundle_id, m.threat_path_id, m.role_in_bundle, m.notes, m.created_at,
              tp.path_code, tp.name, tp.fcp_domain,
              r.residual_score
         FROM atlas_cross_domain_path_bundle_members m
         JOIN atlas_threat_paths tp ON tp.id = m.threat_path_id
         LEFT JOIN atlas_residual_scores r ON r.threat_path_id = tp.id
         WHERE m.bundle_id IN (${placeholders})`,
      ...bundleIds,
    );
  }

  async function listBundles(atlasId: string): Promise<BundleWithMembers[]> {
    const bundles = await db.all<AtlasCrossDomainBundleRow>(
      `SELECT * FROM atlas_cross_domain_path_bundles WHERE atlas_id = ? ORDER BY created_at`,
      atlasId,
    );
    if (bundles.length === 0) return [];
    const rows = await fetchBundleMembers(bundles.map(b => b.id));
    return bundles.map(b => ({ ...b, members: rows.filter(r => r.bundle_id === b.id) }));
  }

  async function createBundle(atlasId: string, input: { bundle_code: string; name: string; description?: string; primary_domain?: FcpDomain; member_path_ids?: string[] }, actorUserId: string): Promise<BundleWithMembers> {
    const created = await db.get<AtlasCrossDomainBundleRow>(
      `INSERT INTO atlas_cross_domain_path_bundles
         (atlas_id, bundle_code, name, description, primary_domain, created_by)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING *`,
      atlasId, input.bundle_code, input.name, input.description ?? null, input.primary_domain ?? null, actorUserId,
    );
    if (!created) throw new Error('Failed to create cross-domain bundle');
    if (input.member_path_ids?.length) {
      // Tenancy: only insert paths that belong to this Atlas. The parent
      // bundle's atlas_id is enforced by the route's ensureAtlasAccess —
      // but member_path_ids comes from the body and could reference a
      // foreign atlas. Filter at the SQL layer (multi-expert review fix).
      const placeholders = input.member_path_ids.map(() => '?').join(',');
      await db.run(
        `INSERT INTO atlas_cross_domain_path_bundle_members (bundle_id, threat_path_id, role_in_bundle)
         SELECT ?, tp.id, 'middle' FROM atlas_threat_paths tp
          WHERE tp.atlas_id = ? AND tp.id IN (${placeholders})
         ON CONFLICT (bundle_id, threat_path_id) DO NOTHING`,
        created.id, atlasId, ...input.member_path_ids,
      );
    }
    void events.logEvent({ atlasId, event: 'cross_domain_bundle_created', userId: actorUserId, subResourceId: String(created.id), details: { bundle_code: created.bundle_code } });
    // Hydrate this bundle directly — no listBundles round-trip
    const members = await fetchBundleMembers([created.id]);
    return { ...created, members };
  }

  async function addBundleMember(atlasId: string, bundleId: number, threatPathId: string, roleInBundle: AtlasCrossDomainBundleMemberRow['role_in_bundle'], actorUserId: string): Promise<void> {
    // Tenancy: bundle must belong to this Atlas AND path must belong to
    // this Atlas. Single SQL guard prevents cross-tenant attachment.
    const result = await db.run(
      `INSERT INTO atlas_cross_domain_path_bundle_members (bundle_id, threat_path_id, role_in_bundle)
       SELECT b.id, tp.id, ?
         FROM atlas_cross_domain_path_bundles b
         JOIN atlas_threat_paths tp ON tp.atlas_id = b.atlas_id
         WHERE b.id = ? AND b.atlas_id = ? AND tp.id = ?
       ON CONFLICT (bundle_id, threat_path_id) DO UPDATE SET role_in_bundle = EXCLUDED.role_in_bundle`,
      roleInBundle, bundleId, atlasId, threatPathId,
    );
    if ((result?.changes ?? 0) === 0) {
      throw new Error('Bundle or threat path not found in this Atlas');
    }
    void events.logEvent({ atlasId, event: 'cross_domain_bundle_member_added', userId: actorUserId, subResourceId: String(bundleId), details: { threat_path_id: threatPathId, role_in_bundle: roleInBundle } });
  }

  async function removeBundleMember(atlasId: string, bundleId: number, threatPathId: string, actorUserId: string): Promise<void> {
    // Tenancy: only delete if the bundle belongs to this Atlas.
    await db.run(
      `DELETE FROM atlas_cross_domain_path_bundle_members
        WHERE bundle_id = ?
          AND threat_path_id = ?
          AND bundle_id IN (SELECT id FROM atlas_cross_domain_path_bundles WHERE atlas_id = ?)`,
      bundleId, threatPathId, atlasId,
    );
    void events.logEvent({ atlasId, event: 'cross_domain_bundle_member_removed', userId: actorUserId, subResourceId: String(bundleId), details: { threat_path_id: threatPathId } });
  }

  async function deleteBundle(atlasId: string, bundleId: number, actorUserId: string): Promise<void> {
    // Already scoped by atlas_id — no change needed for tenancy.
    await db.run(
      `DELETE FROM atlas_cross_domain_path_bundles WHERE id = ? AND atlas_id = ?`,
      bundleId, atlasId,
    );
    void events.logEvent({ atlasId, event: 'cross_domain_bundle_deleted', userId: actorUserId, subResourceId: String(bundleId) });
  }

  // ── Stage 7b — company-wide appetite rollup ─────────────────────────
  // Deterministic worst-of across all per-path appetites. The LLM may
  // produce narrative around the rollup, but never the numbers — same
  // discipline as Stages 4-6.
  //
  // Single LEFT JOIN — replaces the previous 1+6N round-trips per Atlas
  // (one listThreatPaths + six getThreatPathFull queries per path).
  // Multi-expert review fix.

  async function computeCompanyAppetite(atlasId: string): Promise<CompanyAppetiteRollup> {
    type RollupRow = {
      fcp_domain: FcpDomain | null;
      residual_score: number | null;
      declared_position: AppetitePosition | null;
    };
    const rows = await db.all<RollupRow>(
      `SELECT tp.fcp_domain,
              r.residual_score,
              a.appetite_position AS declared_position
         FROM atlas_threat_paths tp
         LEFT JOIN atlas_residual_scores      r ON r.threat_path_id = tp.id
         LEFT JOIN atlas_appetite_statements  a ON a.threat_path_id = tp.id
         WHERE tp.atlas_id = ?`,
      atlasId,
    );

    const byDomain: Partial<Record<FcpDomain, AppetitePosition>> = {};
    let overall: AppetitePosition | null = null;
    let operational: AppetitePosition | null = null;
    let outside = 0, boundary = 0, within = 0, unscored = 0;

    for (const row of rows) {
      // Prefer declared appetite, fall back to calculated
      let pos: AppetitePosition | null = row.declared_position ?? null;
      if (!pos && row.residual_score) {
        pos = appetitePositionFor(row.residual_score as Score1to5);
      }
      if (!pos) { unscored++; continue; }
      if (pos === 'outside' || pos === 'unacceptable') outside++;
      else if (pos === 'boundary') boundary++;
      else within++;

      overall = worstOf(overall, pos);
      const domain = row.fcp_domain;
      if (domain) byDomain[domain] = worstOf(byDomain[domain] ?? null, pos);
      else operational = worstOf(operational, pos);
    }

    return {
      atlas_id: atlasId,
      overall_position: overall,
      by_domain: byDomain,
      by_dimension: { operational },
      paths_outside_or_unacceptable: outside,
      paths_at_boundary: boundary,
      paths_within: within,
      paths_unscored: unscored,
      computed_at: new Date().toISOString(),
    };
  }

  return {
    getScope, upsertScope,
    listBundles, createBundle, addBundleMember, removeBundleMember, deleteBundle,
    computeCompanyAppetite,
    SCOPE_FLAG_TO_FCP_DOMAIN,
  };
}

export type AtlasFcpScopeService = ReturnType<typeof createAtlasFcpScopeService>;
