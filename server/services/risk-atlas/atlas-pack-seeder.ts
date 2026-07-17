/**
 * atlas-pack-seeder.ts — seed a new Atlas's causal chain (Stages 1-3) from an
 * industry pack's proposal (2026-07-17).
 *
 * Background: the pack loader's proposeFromPack() returned a full library of
 * exposures / threat-paths / vulnerabilities but had ZERO callers — the 33
 * industry packs were product-dead (RiskAtlasSetupPage only stored the pack id
 * as a label). This wires them in: on create-with-pack, the route hands the
 * proposal to seedAtlasFromProposal, which drives the SAME addExposure /
 * addThreatPath / addVulnerability mutators a user would (so events, atom
 * pushes, and residual recalculation all fire exactly as normal), resolving the
 * pack-internal refs into real atlas sub-resource ids along the way.
 *
 * Kept as a pure function over an injected mutator interface so it is unit-
 * testable without a DB, and so it can never bypass the route's atlas-access
 * check (the caller passes an already-authorised atlasId).
 *
 * Deterministic-core note: seeding only creates Stage 1-3 rows (E/T/V). It does
 * NOT score anything — inherent/residual scores stay unset until the user (or
 * the atlas-* modules) assign them, so the audit-locked calculator is untouched.
 */
import type { Score1to5, FcpDomain, ExposureCategory } from './types.js';

/** The shape proposeFromPack returns (the fields the seeder consumes). */
export interface PackProposal {
  exposures: Array<{ id: string; name: string; description: string; category: ExposureCategory | string }>;
  threatPaths: Array<{
    id: string; code: string; name: string; description: string;
    typical_inherent: Score1to5; fcp_domain?: FcpDomain;
    exposure_refs?: string[]; vulnerability_refs?: string[];
  }>;
  vulnerabilities: Array<{ id: string; code: string; name: string; description: string; typical_severity: Score1to5 }>;
}

/** The subset of the atlas service the seeder needs. Each returns a row with id. */
export interface SeedMutators {
  addExposure(
    atlasId: string,
    input: { name: string; description?: string; category?: string; source_pack_exposure_id?: string },
    actorUserId: string,
  ): Promise<{ id: string }>;
  addThreatPath(
    atlasId: string,
    input: {
      path_code: string; name: string; description?: string;
      fcp_domain?: FcpDomain; source_pack_path_id?: string; exposure_ids?: string[];
    },
    actorUserId: string,
  ): Promise<{ id: string }>;
  addVulnerability(
    atlasId: string,
    input: {
      vuln_code: string; name: string; description?: string;
      severity: Score1to5; source_pack_vuln_id?: string; threat_path_ids?: string[];
    },
    actorUserId: string,
  ): Promise<{ id: string }>;
}

export interface SeedCounts {
  exposures: number;
  threatPaths: number;
  vulnerabilities: number;
}

/**
 * Insert the proposal's exposures → threat-paths → vulnerabilities into `atlasId`,
 * resolving the pack-internal refs (a threat path's exposure_refs, and which
 * paths a vulnerability belongs to via each path's vulnerability_refs) into the
 * newly-created atlas sub-resource ids. Order matters: exposures first (so
 * paths can link them), paths next (so vulns can link them), vulns last.
 */
export async function seedAtlasFromProposal(
  atlasId: string,
  proposal: PackProposal,
  mut: SeedMutators,
  actorUserId: string,
): Promise<SeedCounts> {
  // 1. Exposures — build packExposureId → atlasExposureId.
  const exposureIdMap = new Map<string, string>();
  for (const e of proposal.exposures) {
    const row = await mut.addExposure(
      atlasId,
      { name: e.name, description: e.description, category: e.category, source_pack_exposure_id: e.id },
      actorUserId,
    );
    exposureIdMap.set(e.id, row.id);
  }

  // 2. Threat paths — resolve exposure_refs; build packPathId → atlasPathId.
  const pathIdMap = new Map<string, string>();
  for (const p of proposal.threatPaths) {
    const exposure_ids = (p.exposure_refs ?? [])
      .map((ref) => exposureIdMap.get(ref))
      .filter((x): x is string => !!x);
    const row = await mut.addThreatPath(
      atlasId,
      {
        path_code: p.code, name: p.name, description: p.description,
        ...(p.fcp_domain ? { fcp_domain: p.fcp_domain } : {}),
        source_pack_path_id: p.id,
        ...(exposure_ids.length ? { exposure_ids } : {}),
      },
      actorUserId,
    );
    pathIdMap.set(p.id, row.id);
  }

  // 3. Vulnerabilities — a vuln links to every path whose vulnerability_refs
  //    includes it (the pack expresses the link on the path side).
  let vulnerabilities = 0;
  for (const v of proposal.vulnerabilities) {
    const threat_path_ids = proposal.threatPaths
      .filter((p) => (p.vulnerability_refs ?? []).includes(v.id))
      .map((p) => pathIdMap.get(p.id))
      .filter((x): x is string => !!x);
    await mut.addVulnerability(
      atlasId,
      {
        vuln_code: v.code, name: v.name, description: v.description,
        severity: v.typical_severity, source_pack_vuln_id: v.id,
        ...(threat_path_ids.length ? { threat_path_ids } : {}),
      },
      actorUserId,
    );
    vulnerabilities++;
  }

  return { exposures: exposureIdMap.size, threatPaths: pathIdMap.size, vulnerabilities };
}
