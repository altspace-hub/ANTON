/**
 * hkp-service.ts — CRUD over the Hardware Knowledge Pack tables.
 *
 * Backs the four specification-layer tables created by migration 133:
 *   hardware_knowledge_packs
 *   hkp_claims
 *   hkp_components
 *   hkp_regional_alternatives
 *
 * Read-side helpers also pull diagnostic + lifecycle counts so the
 * browser page can render claim/case/event breakdowns in one fetch.
 */

import type { DatabaseAdapter } from '../db/database.js';
import { parseJson, ServiceError, checkSchemaVersion } from '../lib/hardware-helpers.js';

const HKP_SUPPORTED_MAJOR = 1;

// ── Types ─────────────────────────────────────────────────────────────────────

export type ClaimClassification =
  | 'datasheet-verified'
  | 'community-verified'
  | 'physically-verified'
  | 'AI-unverified';

export type PrimarySource =
  | 'sheetsdata-mcp'
  | 'anton-curated'
  | 'community'
  | 'user-generated'
  | 'legacy-identified';

export type CounterfeitRisk = 'low' | 'moderate' | 'high' | 'critical';

export interface HardwareKnowledgePack {
  id: string;
  family_id: string;
  manufacturer: string;
  part_number: string;
  revision: string | null;
  hkp_version: string;
  hkp_schema_version: string;
  installed_at: string;
  primary_source: PrimarySource;
  source_last_refreshed: string | null;
  signed_by: string | null;
  signing_verified: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface HkpClaim {
  id: string;
  hkp_id: string;
  claim_path: string;
  claim_value: string;
  classification: ClaimClassification;
  verified_by: string[];
  verification_count: number;
  evidence_ref: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface HkpComponent {
  id: string;
  hkp_id: string;
  component_type: string;
  name: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface HkpRegionalAlternative {
  id: string;
  hkp_id: string;
  component_id: string | null;
  region: string;
  alternative_part: string;
  distributor: string | null;
  typical_price_local: number | null;
  typical_price_currency: string | null;
  typical_lead_days: number | null;
  counterfeit_risk: CounterfeitRisk | null;
  notes: string | null;
  created_at: string;
}

export interface HkpSummary extends HardwareKnowledgePack {
  claim_count: number;
  component_count: number;
  regional_alternative_count: number;
  classification_breakdown: Record<ClaimClassification, number>;
  diagnostic_case_count: number;
  recent_lifecycle_event_count: number;
}

export interface HkpDetail extends HardwareKnowledgePack {
  claims: HkpClaim[];
  components: HkpComponent[];
  regional_alternatives: HkpRegionalAlternative[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function rowToPack(r: Record<string, unknown>): HardwareKnowledgePack {
  checkSchemaVersion(`HKP ${r.id}`, r.hkp_schema_version as string | null, HKP_SUPPORTED_MAJOR);
  return {
    id: r.id as string,
    family_id: r.family_id as string,
    manufacturer: r.manufacturer as string,
    part_number: r.part_number as string,
    revision: (r.revision as string | null) ?? null,
    hkp_version: r.hkp_version as string,
    hkp_schema_version: r.hkp_schema_version as string,
    installed_at: r.installed_at as string,
    primary_source: r.primary_source as PrimarySource,
    source_last_refreshed: (r.source_last_refreshed as string | null) ?? null,
    signed_by: (r.signed_by as string | null) ?? null,
    signing_verified: Boolean(r.signing_verified),
    metadata: parseJson(r.metadata, {}),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

function rowToClaim(r: Record<string, unknown>): HkpClaim {
  return {
    id: r.id as string,
    hkp_id: r.hkp_id as string,
    claim_path: r.claim_path as string,
    claim_value: r.claim_value as string,
    classification: r.classification as ClaimClassification,
    verified_by: parseJson(r.verified_by, [] as string[]),
    verification_count: Number(r.verification_count ?? 0),
    evidence_ref: (r.evidence_ref as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

function rowToComponent(r: Record<string, unknown>): HkpComponent {
  return {
    id: r.id as string,
    hkp_id: r.hkp_id as string,
    component_type: r.component_type as string,
    name: r.name as string,
    metadata: parseJson(r.metadata, {}),
    created_at: r.created_at as string,
  };
}

function rowToRegionalAlt(r: Record<string, unknown>): HkpRegionalAlternative {
  return {
    id: r.id as string,
    hkp_id: r.hkp_id as string,
    component_id: (r.component_id as string | null) ?? null,
    region: r.region as string,
    alternative_part: r.alternative_part as string,
    distributor: (r.distributor as string | null) ?? null,
    typical_price_local: r.typical_price_local !== null && r.typical_price_local !== undefined
      ? Number(r.typical_price_local) : null,
    typical_price_currency: (r.typical_price_currency as string | null) ?? null,
    typical_lead_days: r.typical_lead_days !== null && r.typical_lead_days !== undefined
      ? Number(r.typical_lead_days) : null,
    counterfeit_risk: (r.counterfeit_risk as CounterfeitRisk | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    created_at: r.created_at as string,
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

export function createHkpService(db: DatabaseAdapter) {

  // ── HKP CRUD ────────────────────────────────────────────────────────────────

  async function listPacks(filters: {
    family_id?: string;
    primary_source?: PrimarySource;
    search?: string;
  } = {}): Promise<HkpSummary[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filters.family_id) {
      where.push('family_id = ?');
      params.push(filters.family_id);
    }
    if (filters.primary_source) {
      where.push('primary_source = ?');
      params.push(filters.primary_source);
    }
    if (filters.search && filters.search.trim()) {
      where.push('(LOWER(part_number) LIKE ? OR LOWER(manufacturer) LIKE ?)');
      const pat = `%${filters.search.trim().toLowerCase()}%`;
      params.push(pat, pat);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = await db.all(
      `SELECT * FROM hardware_knowledge_packs ${whereSql}
       ORDER BY family_id ASC, manufacturer ASC, part_number ASC`,
      ...params,
    );
    const packs = rows.map(rowToPack);
    if (packs.length === 0) return [];

    // Fan-out to one query per child table (NOT one per pack — that would
    // be N+1). Each query is grouped by hkp_id; we merge in JS.
    const ids = packs.map(p => p.id);
    const placeholders = ids.map(() => '?').join(',');
    const [claimRows, compRows, altRows, diagRows, eventRows] = await Promise.all([
      db.all(
        `SELECT hkp_id, classification, COUNT(*)::int AS n
         FROM hkp_claims WHERE hkp_id IN (${placeholders})
         GROUP BY hkp_id, classification`,
        ...ids,
      ) as Promise<Array<{ hkp_id: string; classification: string; n: number | string }>>,
      db.all(
        `SELECT hkp_id, COUNT(*)::int AS n FROM hkp_components
         WHERE hkp_id IN (${placeholders}) GROUP BY hkp_id`,
        ...ids,
      ) as Promise<Array<{ hkp_id: string; n: number | string }>>,
      db.all(
        `SELECT hkp_id, COUNT(*)::int AS n FROM hkp_regional_alternatives
         WHERE hkp_id IN (${placeholders}) GROUP BY hkp_id`,
        ...ids,
      ) as Promise<Array<{ hkp_id: string; n: number | string }>>,
      db.all(
        `SELECT hkp_id, COUNT(*)::int AS n FROM diagnostic_cases
         WHERE hkp_id IN (${placeholders}) GROUP BY hkp_id`,
        ...ids,
      ) as Promise<Array<{ hkp_id: string; n: number | string }>>,
      // Lifecycle events: direct hkp_id OR pattern match. We pull distinct
      // (hkp_id, event_id) pairs touched in the last 90 days, then count
      // per pack in JS.
      db.all(
        `WITH recent AS (
           SELECT event_id, hkp_id, hkp_id_pattern FROM lifecycle_events
           WHERE ingested_at > NOW() - INTERVAL '90 days'
         )
         SELECT p.id AS hkp_id, COUNT(DISTINCT r.event_id)::int AS n
         FROM hardware_knowledge_packs p
         LEFT JOIN recent r ON
           r.hkp_id = p.id
           OR (r.hkp_id_pattern IS NOT NULL AND p.id LIKE REPLACE(r.hkp_id_pattern, '*', '%'))
         WHERE p.id IN (${placeholders})
         GROUP BY p.id`,
        ...ids,
      ) as Promise<Array<{ hkp_id: string; n: number | string }>>,
    ]);

    const compByHkp = new Map(compRows.map(r => [r.hkp_id, Number(r.n)]));
    const altByHkp = new Map(altRows.map(r => [r.hkp_id, Number(r.n)]));
    const diagByHkp = new Map(diagRows.map(r => [r.hkp_id, Number(r.n)]));
    const eventByHkp = new Map(eventRows.map(r => [r.hkp_id, Number(r.n)]));
    const claimsByHkp = new Map<string, Record<ClaimClassification, number>>();
    for (const r of claimRows) {
      if (!claimsByHkp.has(r.hkp_id)) {
        claimsByHkp.set(r.hkp_id, {
          'datasheet-verified': 0, 'community-verified': 0,
          'physically-verified': 0, 'AI-unverified': 0,
        });
      }
      const slot = claimsByHkp.get(r.hkp_id)!;
      const cls = r.classification as ClaimClassification;
      if (cls in slot) slot[cls] = Number(r.n);
    }

    return packs.map(pack => {
      const breakdown = claimsByHkp.get(pack.id) ?? {
        'datasheet-verified': 0, 'community-verified': 0,
        'physically-verified': 0, 'AI-unverified': 0,
      };
      const claimTotal = Object.values(breakdown).reduce((a, b) => a + b, 0);
      return {
        ...pack,
        claim_count: claimTotal,
        component_count: compByHkp.get(pack.id) ?? 0,
        regional_alternative_count: altByHkp.get(pack.id) ?? 0,
        classification_breakdown: breakdown,
        diagnostic_case_count: diagByHkp.get(pack.id) ?? 0,
        recent_lifecycle_event_count: eventByHkp.get(pack.id) ?? 0,
      };
    });
  }

  async function getPack(id: string): Promise<HardwareKnowledgePack | null> {
    const r = await db.get(
      'SELECT * FROM hardware_knowledge_packs WHERE id = ?',
      id,
    );
    return r ? rowToPack(r) : null;
  }

  async function getPackDetail(id: string): Promise<HkpDetail | null> {
    const pack = await getPack(id);
    if (!pack) return null;
    const [claims, components, regionalAlternatives] = await Promise.all([
      listClaims(id),
      listComponents(id),
      listRegionalAlternatives(id),
    ]);
    return { ...pack, claims, components, regional_alternatives: regionalAlternatives };
  }

  async function summarisePack(pack: HardwareKnowledgePack): Promise<HkpSummary> {
    const [claimCounts, compCount, altCount, diagCount, eventCount] = await Promise.all([
      db.all(
        `SELECT classification, COUNT(*) AS n
         FROM hkp_claims WHERE hkp_id = ? GROUP BY classification`,
        pack.id,
      ),
      db.get(
        'SELECT COUNT(*) AS n FROM hkp_components WHERE hkp_id = ?',
        pack.id,
      ),
      db.get(
        'SELECT COUNT(*) AS n FROM hkp_regional_alternatives WHERE hkp_id = ?',
        pack.id,
      ),
      db.get(
        'SELECT COUNT(*) AS n FROM diagnostic_cases WHERE hkp_id = ?',
        pack.id,
      ),
      db.get(
        `SELECT COUNT(*) AS n FROM lifecycle_events
         WHERE (hkp_id = ? OR (hkp_id_pattern IS NOT NULL AND ? LIKE REPLACE(hkp_id_pattern, '*', '%')))
           AND ingested_at > NOW() - INTERVAL '90 days'`,
        pack.id, pack.id,
      ),
    ]);

    const breakdown: Record<ClaimClassification, number> = {
      'datasheet-verified': 0,
      'community-verified': 0,
      'physically-verified': 0,
      'AI-unverified': 0,
    };
    for (const row of claimCounts as Array<{ classification: string; n: string | number }>) {
      const cls = row.classification as ClaimClassification;
      if (cls in breakdown) breakdown[cls] = Number(row.n);
    }

    const claimTotal = Object.values(breakdown).reduce((a, b) => a + b, 0);

    return {
      ...pack,
      claim_count: claimTotal,
      component_count: Number((compCount as { n: string | number } | undefined)?.n ?? 0),
      regional_alternative_count: Number((altCount as { n: string | number } | undefined)?.n ?? 0),
      classification_breakdown: breakdown,
      diagnostic_case_count: Number((diagCount as { n: string | number } | undefined)?.n ?? 0),
      recent_lifecycle_event_count: Number((eventCount as { n: string | number } | undefined)?.n ?? 0),
    };
  }

  async function createPack(input: {
    family_id: string;
    manufacturer: string;
    part_number: string;
    revision?: string | null;
    hkp_version: string;
    primary_source: PrimarySource;
    signed_by?: string | null;
    signing_verified?: boolean;
    metadata?: Record<string, unknown>;
  }): Promise<HardwareKnowledgePack> {
    const result = await db.get(
      `INSERT INTO hardware_knowledge_packs
        (family_id, manufacturer, part_number, revision, hkp_version,
         primary_source, signed_by, signing_verified, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
      input.family_id,
      input.manufacturer,
      input.part_number,
      input.revision ?? null,
      input.hkp_version,
      input.primary_source,
      input.signed_by ?? null,
      input.signing_verified ?? false,
      JSON.stringify(input.metadata ?? {}),
    );
    if (!result) throw new Error('Failed to create HKP');
    return rowToPack(result);
  }

  async function updatePack(id: string, patch: Partial<{
    revision: string | null;
    hkp_version: string;
    primary_source: PrimarySource;
    source_last_refreshed: string | null;
    signed_by: string | null;
    signing_verified: boolean;
    metadata: Record<string, unknown>;
  }>): Promise<HardwareKnowledgePack | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if ('revision' in patch) { sets.push('revision = ?'); params.push(patch.revision ?? null); }
    if ('hkp_version' in patch && patch.hkp_version) { sets.push('hkp_version = ?'); params.push(patch.hkp_version); }
    if ('primary_source' in patch && patch.primary_source) { sets.push('primary_source = ?'); params.push(patch.primary_source); }
    if ('source_last_refreshed' in patch) { sets.push('source_last_refreshed = ?'); params.push(patch.source_last_refreshed ?? null); }
    if ('signed_by' in patch) { sets.push('signed_by = ?'); params.push(patch.signed_by ?? null); }
    if ('signing_verified' in patch) { sets.push('signing_verified = ?'); params.push(patch.signing_verified ?? false); }
    if ('metadata' in patch && patch.metadata) { sets.push('metadata = ?'); params.push(JSON.stringify(patch.metadata)); }
    if (sets.length === 0) return getPack(id);
    sets.push('updated_at = NOW()');
    params.push(id);
    const result = await db.get(
      `UPDATE hardware_knowledge_packs SET ${sets.join(', ')} WHERE id = ? RETURNING *`,
      ...params,
    );
    return result ? rowToPack(result) : null;
  }

  async function deletePack(id: string): Promise<boolean> {
    const r = await db.run('DELETE FROM hardware_knowledge_packs WHERE id = ?', id);
    return r.changes > 0;
  }

  // ── Claims ──────────────────────────────────────────────────────────────────

  async function listClaims(hkpId: string, classification?: ClaimClassification): Promise<HkpClaim[]> {
    const params: unknown[] = [hkpId];
    let extra = '';
    if (classification) { extra = ' AND classification = ?'; params.push(classification); }
    const rows = await db.all(
      `SELECT * FROM hkp_claims WHERE hkp_id = ?${extra} ORDER BY claim_path ASC`,
      ...params,
    );
    return rows.map(rowToClaim);
  }

  async function upsertClaim(input: {
    hkp_id: string;
    claim_path: string;
    claim_value: string;
    classification: ClaimClassification;
    verified_by?: string[];
    evidence_ref?: string | null;
    notes?: string | null;
  }): Promise<HkpClaim> {
    const result = await db.get(
      `INSERT INTO hkp_claims (hkp_id, claim_path, claim_value, classification,
                                verified_by, verification_count, evidence_ref, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (hkp_id, claim_path) DO UPDATE SET
         claim_value = EXCLUDED.claim_value,
         classification = EXCLUDED.classification,
         verified_by = EXCLUDED.verified_by,
         verification_count = EXCLUDED.verification_count,
         evidence_ref = EXCLUDED.evidence_ref,
         notes = EXCLUDED.notes,
         updated_at = NOW()
       RETURNING *`,
      input.hkp_id,
      input.claim_path,
      input.claim_value,
      input.classification,
      JSON.stringify(input.verified_by ?? []),
      (input.verified_by ?? []).length,
      input.evidence_ref ?? null,
      input.notes ?? null,
    );
    if (!result) throw new Error('Failed to upsert claim');
    return rowToClaim(result);
  }

  async function deleteClaim(id: string): Promise<boolean> {
    const r = await db.run('DELETE FROM hkp_claims WHERE id = ?', id);
    return r.changes > 0;
  }

  // ── Components ──────────────────────────────────────────────────────────────

  async function listComponents(hkpId: string, componentType?: string): Promise<HkpComponent[]> {
    const params: unknown[] = [hkpId];
    let extra = '';
    if (componentType) { extra = ' AND component_type = ?'; params.push(componentType); }
    const rows = await db.all(
      `SELECT * FROM hkp_components WHERE hkp_id = ?${extra} ORDER BY component_type ASC, name ASC`,
      ...params,
    );
    return rows.map(rowToComponent);
  }

  async function createComponent(input: {
    hkp_id: string;
    component_type: string;
    name: string;
    metadata?: Record<string, unknown>;
  }): Promise<HkpComponent> {
    const result = await db.get(
      `INSERT INTO hkp_components (hkp_id, component_type, name, metadata)
       VALUES (?, ?, ?, ?) RETURNING *`,
      input.hkp_id,
      input.component_type,
      input.name,
      JSON.stringify(input.metadata ?? {}),
    );
    if (!result) throw new Error('Failed to create component');
    return rowToComponent(result);
  }

  async function deleteComponent(id: string): Promise<boolean> {
    const r = await db.run('DELETE FROM hkp_components WHERE id = ?', id);
    return r.changes > 0;
  }

  // ── Regional alternatives ───────────────────────────────────────────────────

  async function listRegionalAlternatives(hkpId: string, region?: string): Promise<HkpRegionalAlternative[]> {
    const params: unknown[] = [hkpId];
    let extra = '';
    if (region) { extra = ' AND region = ?'; params.push(region); }
    const rows = await db.all(
      `SELECT * FROM hkp_regional_alternatives WHERE hkp_id = ?${extra}
       ORDER BY region ASC, counterfeit_risk ASC NULLS LAST, alternative_part ASC`,
      ...params,
    );
    return rows.map(rowToRegionalAlt);
  }

  async function createRegionalAlternative(input: {
    hkp_id: string;
    component_id?: string | null;
    region: string;
    alternative_part: string;
    distributor?: string | null;
    typical_price_local?: number | null;
    typical_price_currency?: string | null;
    typical_lead_days?: number | null;
    counterfeit_risk?: CounterfeitRisk | null;
    notes?: string | null;
  }): Promise<HkpRegionalAlternative> {
    const result = await db.get(
      `INSERT INTO hkp_regional_alternatives
        (hkp_id, component_id, region, alternative_part, distributor,
         typical_price_local, typical_price_currency, typical_lead_days,
         counterfeit_risk, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      input.hkp_id,
      input.component_id ?? null,
      input.region,
      input.alternative_part,
      input.distributor ?? null,
      input.typical_price_local ?? null,
      input.typical_price_currency ?? null,
      input.typical_lead_days ?? null,
      input.counterfeit_risk ?? null,
      input.notes ?? null,
    );
    if (!result) throw new Error('Failed to create regional alternative');
    return rowToRegionalAlt(result);
  }

  async function deleteRegionalAlternative(id: string): Promise<boolean> {
    const r = await db.run('DELETE FROM hkp_regional_alternatives WHERE id = ?', id);
    return r.changes > 0;
  }

  // ── Lookups for prompt-builder Layer 6 ──────────────────────────────────────

  /**
   * Find the most appropriate HKP for a given (family_id, part_number) pair.
   * Prefers exact part-number match within the family; falls back to any
   * HKP for the family if no exact match exists.
   */
  async function findPackForContext(input: {
    family_id: string;
    part_number?: string | null;
  }): Promise<HardwareKnowledgePack | null> {
    if (input.part_number) {
      const exact = await db.get(
        `SELECT * FROM hardware_knowledge_packs
         WHERE family_id = ? AND LOWER(part_number) = LOWER(?)
         ORDER BY created_at DESC LIMIT 1`,
        input.family_id, input.part_number,
      );
      if (exact) return rowToPack(exact);
    }
    const fallback = await db.get(
      `SELECT * FROM hardware_knowledge_packs
       WHERE family_id = ? ORDER BY created_at DESC LIMIT 1`,
      input.family_id,
    );
    return fallback ? rowToPack(fallback) : null;
  }

  /**
   * Recent lifecycle events touching this HKP (direct or via pattern match).
   * Used by prompt-builder Layer 6 + browser detail page.
   */
  async function listRecentLifecycleEvents(hkpId: string, limitDays = 90, limit = 20): Promise<Array<{
    event_id: string;
    event_type: string;
    title: string;
    severity: string | null;
    cvss_score: number | null;
    published_at: string;
    source: string;
    source_url: string | null;
  }>> {
    const rows = await db.all(
      `SELECT event_id, event_type, title, severity, cvss_score, published_at, source, source_url
       FROM lifecycle_events
       WHERE (hkp_id = ?
              OR (hkp_id_pattern IS NOT NULL AND ? LIKE REPLACE(hkp_id_pattern, '*', '%')))
         AND ingested_at > NOW() - (? || ' days')::INTERVAL
       ORDER BY published_at DESC
       LIMIT ?`,
      hkpId, hkpId, String(limitDays), limit,
    );
    return rows as Array<{
      event_id: string; event_type: string; title: string; severity: string | null;
      cvss_score: number | null; published_at: string; source: string; source_url: string | null;
    }>;
  }

  return {
    // packs
    listPacks,
    getPack,
    getPackDetail,
    summarisePack,
    createPack,
    updatePack,
    deletePack,
    // claims
    listClaims,
    upsertClaim,
    deleteClaim,
    // components
    listComponents,
    createComponent,
    deleteComponent,
    // regional alternatives
    listRegionalAlternatives,
    createRegionalAlternative,
    deleteRegionalAlternative,
    // lookups
    findPackForContext,
    listRecentLifecycleEvents,
  };
}

export type HkpService = ReturnType<typeof createHkpService>;
