// ── Atlas Importer — the promised "successor handover" (Wave 4.10) ────────
//
// The risk-atlas-export registry entry literally promises "for sharing or
// successor handover", but until this wave no import existed. This module
// recreates a full Atlas (new id, owner = the importer) from the flat JSON
// bundle produced by atlas-export.ts generateAtlasBundle():
//
//   exposures → threat paths → vulnerabilities → controls (+ links) →
//   inherent scores → residual (recomputed deterministically) → appetite
//
// Honesty notes:
//   • The bundle is FLAT JSON (".anton.json"), not a ZIP — the generic
//     dispatching validator (anton-validator.ts) is ZIP-based, so structure
//     is validated here with a strict zod schema instead.
//   • The export flattens controls per path and does NOT carry the
//     control→vulnerability map. Reconstruction links each control to every
//     vulnerability of the paths it appeared on — this preserves the
//     per-path "control touches path" membership exactly, so the worst-of
//     rollup (and therefore the residual) recomputes identically. A path
//     that had controls but no vulnerabilities cannot be reconnected and
//     recomputes as 'absent' — surfaced by the recompute check, not hidden.
//   • Deterministic recomputation check: after import, the residual
//     calculator's output for every path is compared against the bundled
//     scores. Mismatch = the import still succeeds, flagged + logged as an
//     atlas event ('import_recompute_mismatch') — honest, not silent.
//   • Controls are inserted via direct SQL (same statement shape as
//     atlas-service.addControl) to preserve source data exactly — the
//     authoring guard ("strong needs evidence") must not silently rewrite a
//     predecessor's register. Such controls are flagged in warnings instead.

import { z } from 'zod';
import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../../db/database.js';
import { createAtlasService } from './atlas-service.js';
import { createAtlasEventLogger } from './atlas-event-logger.js';
import {
  calculateInherent,
  calculateResidual,
  rollupControlQuality,
} from './atlas-residual-calculator.js';
import type { Score1to5, ControlStrength } from './types.js';

// ── Bundle schema (mirrors atlas-export.ts generateAtlasBundle) ───────────

const score = z.number().int().min(1).max(5);
const fcpDomain = z.enum([
  'amlcft', 'sanctions', 'fraud', 'abc', 'market_abuse',
  'tax_evasion_facilitation', 'export_controls', 'modern_slavery',
]);

const exposureSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  category: z.string().max(80).nullable().optional(),
});

const vulnerabilitySchema = z.object({
  vuln_code: z.string().min(1).max(40),
  name: z.string().min(1).max(200),
  severity: score,
});

const controlSchema = z.object({
  control_code: z.string().min(1).max(40),
  name: z.string().min(1).max(200),
  type: z.enum(['prevent', 'detect', 'respond']),
  strength: z.enum(['strong', 'adequate', 'weak']),
  evidence: z.string().max(4000).nullable().optional(),
  owner_role: z.string().max(200).nullable().optional(),
});

const pathSchema = z.object({
  path_code: z.string().min(1).max(40),
  name: z.string().min(1).max(200),
  description: z.string().max(4000).nullable().optional(),
  fcp_domain: fcpDomain.nullable().optional(),
  exposures: z.array(exposureSchema).max(100).default([]),
  vulnerabilities: z.array(vulnerabilitySchema).max(100).default([]),
  inherent: z.object({
    exposure_score: score,
    threat_score: score,
    vulnerability_score: score,
    inherent_score: score,
    rationale: z.string().max(4000).nullable().optional(),
  }).nullable().optional(),
  controls: z.array(controlSchema).max(200).default([]),
  residual: z.object({
    residual_score: score,
    control_quality_rollup: z.enum(['strong', 'adequate', 'weak', 'absent']),
  }).nullable().optional(),
  appetite: z.object({
    appetite_position: z.enum(['within', 'boundary', 'outside', 'unacceptable']),
    required_action: z.string().max(2000).nullable().optional(),
    target_date: z.string().max(20).nullable().optional(),
    budget_eur: z.number().min(0).nullable().optional(),
  }).nullable().optional(),
});

export const atlasBundleSchema = z.object({
  bundle_type: z.literal('risk-atlas-export'),
  version: z.string().optional(),
  format_version: z.string().optional(),
  created_at: z.string().optional(),
  generator: z.string().optional(),
  exported_at: z.string().optional(),
  exported_by: z.string().nullable().optional(),
  atlas: z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).nullable().optional(),
    business_description: z.string().max(20000).nullable().optional(),
    industry_pack_id: z.string().max(64).nullable().optional(),
    mode: z.enum(['socratic', 'draft', 'expert', 'autonomous']).optional(),
  }),
  paths: z.array(pathSchema).max(500),
});

export type AtlasBundle = z.infer<typeof atlasBundleSchema>;

export function parseAtlasBundle(payload: unknown):
  | { ok: true; bundle: AtlasBundle }
  | { ok: false; errors: string[] } {
  const parsed = atlasBundleSchema.safeParse(payload);
  if (!parsed.success) {
    const errors = parsed.error.issues.slice(0, 20).map(
      i => `${i.path.join('.') || '(root)'}: ${i.message}`
    );
    return { ok: false, errors };
  }
  return { ok: true, bundle: parsed.data };
}

// ── Pure recompute check (golden-testable, no DB) ─────────────────────────

export interface RecomputeMismatch {
  path_code: string;
  field: 'inherent_score' | 'residual_score' | 'control_quality_rollup';
  bundled: string | number | null;
  recomputed: string | number;
}

/**
 * Run the deterministic calculator over the bundle's own data and compare
 * with the scores the bundle claims. A clean export from a healthy Atlas
 * always matches; a hand-edited or version-skewed bundle won't — and the
 * import proceeds WITH the flag rather than pretending.
 */
export function verifyBundleScores(bundle: AtlasBundle): RecomputeMismatch[] {
  const mismatches: RecomputeMismatch[] = [];
  for (const p of bundle.paths) {
    if (!p.inherent) continue;
    const inherent = calculateInherent(
      p.inherent.exposure_score as Score1to5,
      p.inherent.threat_score as Score1to5,
      p.inherent.vulnerability_score as Score1to5,
    );
    if (inherent !== p.inherent.inherent_score) {
      mismatches.push({ path_code: p.path_code, field: 'inherent_score', bundled: p.inherent.inherent_score, recomputed: inherent });
    }
    // Controls reconstruct onto the path's vulnerabilities — a path without
    // vulnerabilities cannot carry control links, so its rollup is 'absent'.
    const strengths: ControlStrength[] = p.vulnerabilities.length > 0
      ? p.controls.map(c => c.strength)
      : [];
    const rollup = rollupControlQuality(strengths);
    const calc = calculateResidual({ inherent_score: inherent, control_quality_rollup: rollup });
    if (p.residual) {
      if (calc.residual_score !== p.residual.residual_score) {
        mismatches.push({ path_code: p.path_code, field: 'residual_score', bundled: p.residual.residual_score, recomputed: calc.residual_score });
      }
      if (rollup !== p.residual.control_quality_rollup) {
        mismatches.push({ path_code: p.path_code, field: 'control_quality_rollup', bundled: p.residual.control_quality_rollup, recomputed: rollup });
      }
    }
  }
  return mismatches;
}

// ── Import ─────────────────────────────────────────────────────────────────

export interface AtlasImportResult {
  atlasId: string;
  atlasName: string;
  stats: { paths: number; exposures: number; vulnerabilities: number; controls: number; inherent_scored: number; appetite_statements: number };
  recompute: { checked: number; matched: number; mismatches: RecomputeMismatch[]; ok: boolean };
  warnings: string[];
}

export async function importAtlasBundle(
  db: DatabaseAdapter,
  payload: unknown,
  importerUserId: string,
): Promise<AtlasImportResult> {
  const parsed = parseAtlasBundle(payload);
  if (!parsed.ok) {
    throw new Error(`Not a valid risk-atlas-export bundle: ${parsed.errors.join('; ')}`);
  }
  const bundle = parsed.bundle;
  const warnings: string[] = [];
  const events = createAtlasEventLogger(db);
  const service = createAtlasService(db, { eventLogger: events });

  // Import provenance note — travels in the description, visible everywhere.
  const provenanceNote =
    `[Imported ${new Date().toISOString().slice(0, 10)} from a risk-atlas-export bundle` +
    `${bundle.exported_at ? ` exported ${bundle.exported_at.slice(0, 10)}` : ''}` +
    `${bundle.exported_by ? ` by ${bundle.exported_by}` : ''}` +
    `${bundle.generator ? ` (generator ${bundle.generator})` : ''}]`;
  const description = [bundle.atlas.description ?? '', provenanceNote]
    .filter(Boolean).join('\n\n').slice(0, 2000);

  // The source instance's industry pack may not exist here — degrade honestly.
  let atlas;
  try {
    atlas = await service.createAtlas({
      name: bundle.atlas.name,
      description,
      business_description: bundle.atlas.business_description ?? undefined,
      industry_pack_id: bundle.atlas.industry_pack_id ?? undefined,
      mode: bundle.atlas.mode ?? 'socratic',
    }, importerUserId);
  } catch (err) {
    if (bundle.atlas.industry_pack_id && /Industry pack not found/.test(err instanceof Error ? err.message : '')) {
      warnings.push(`Industry pack '${bundle.atlas.industry_pack_id}' is not installed on this instance — imported without a pack reference.`);
      atlas = await service.createAtlas({
        name: bundle.atlas.name,
        description,
        business_description: bundle.atlas.business_description ?? undefined,
        mode: bundle.atlas.mode ?? 'socratic',
      }, importerUserId);
    } else {
      throw err;
    }
  }

  // ── Stage 1 — exposures (deduped across paths by name|category) ─────────
  const exposureIdByKey = new Map<string, string>();
  for (const p of bundle.paths) {
    for (const e of p.exposures) {
      const key = `${e.name}|${e.category ?? ''}`;
      if (exposureIdByKey.has(key)) continue;
      const row = await service.addExposure(atlas.id, {
        name: e.name,
        description: e.description ?? undefined,
        category: e.category ?? undefined,
      }, importerUserId);
      exposureIdByKey.set(key, row.id);
    }
  }

  // ── Stage 2 — threat paths ───────────────────────────────────────────────
  const pathIdByCode = new Map<string, string>();
  for (const p of bundle.paths) {
    const exposureIds = p.exposures
      .map(e => exposureIdByKey.get(`${e.name}|${e.category ?? ''}`))
      .filter((id): id is string => !!id);
    const row = await service.addThreatPath(atlas.id, {
      path_code: p.path_code,
      name: p.name,
      description: p.description ?? undefined,
      fcp_domain: p.fcp_domain ?? null,
      exposure_ids: exposureIds,
    }, importerUserId);
    pathIdByCode.set(p.path_code, row.id);
  }

  // ── Stage 3 — vulnerabilities (deduped by vuln_code, linked to all paths)
  const vulnDefs = new Map<string, { def: AtlasBundle['paths'][number]['vulnerabilities'][number]; pathCodes: string[] }>();
  for (const p of bundle.paths) {
    for (const v of p.vulnerabilities) {
      const entry = vulnDefs.get(v.vuln_code);
      if (entry) entry.pathCodes.push(p.path_code);
      else vulnDefs.set(v.vuln_code, { def: v, pathCodes: [p.path_code] });
    }
  }
  const vulnIdByCode = new Map<string, string>();
  for (const [code, { def, pathCodes }] of vulnDefs) {
    const threatPathIds = pathCodes
      .map(pc => pathIdByCode.get(pc))
      .filter((id): id is string => !!id);
    const row = await service.addVulnerability(atlas.id, {
      vuln_code: code,
      name: def.name,
      severity: def.severity as Score1to5,
      threat_path_ids: threatPathIds,
    }, importerUserId);
    vulnIdByCode.set(code, row.id);
  }

  // ── Stage 5 — controls (deduped by control_code; direct SQL preserves
  //    source data exactly — see header). Linked to every vulnerability of
  //    each path the control appeared on.
  const controlDefs = new Map<string, { def: AtlasBundle['paths'][number]['controls'][number]; vulnCodes: Set<string> }>();
  for (const p of bundle.paths) {
    for (const c of p.controls) {
      const entry = controlDefs.get(c.control_code)
        ?? { def: c, vulnCodes: new Set<string>() };
      for (const v of p.vulnerabilities) entry.vulnCodes.add(v.vuln_code);
      controlDefs.set(c.control_code, entry);
    }
  }
  let controlCount = 0;
  for (const [code, { def, vulnCodes }] of controlDefs) {
    if (def.strength === 'strong' && (!def.evidence || def.evidence.trim().length < 5)) {
      warnings.push(`Control ${code} is 'strong' but carries no evidence in the bundle — imported as-is; the integrity rules will flag it.`);
    }
    const controlId = `c_${randomUUID().slice(0, 12)}`;
    await db.run(
      `INSERT INTO atlas_controls
        (id, atlas_id, control_code, name, description, type, strength, evidence, owner_role, source_pack_control_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      controlId, atlas.id, code, def.name, null,
      def.type, def.strength, def.evidence ?? null, def.owner_role ?? null, null,
    );
    for (const vc of vulnCodes) {
      const vulnId = vulnIdByCode.get(vc);
      if (!vulnId) continue;
      await db.run(
        `INSERT INTO atlas_control_vulnerability_map (control_id, vulnerability_id, type, notes)
         VALUES (?, ?, ?, ?) ON CONFLICT (control_id, vulnerability_id, type) DO NOTHING`,
        controlId, vulnId, def.type, 'reconstructed from risk-atlas-export bundle',
      );
    }
    controlCount++;
  }

  // ── Stage 4 + 6 — inherent scoring (recalculates residual deterministically)
  let inherentScored = 0;
  for (const p of bundle.paths) {
    if (!p.inherent) continue;
    const tpId = pathIdByCode.get(p.path_code);
    if (!tpId) continue;
    await service.scoreInherent(atlas.id, tpId, {
      exposure: p.inherent.exposure_score as Score1to5,
      threat: p.inherent.threat_score as Score1to5,
      vulnerability: p.inherent.vulnerability_score as Score1to5,
      rationale: p.inherent.rationale ?? undefined,
    }, importerUserId);
    inherentScored++;
  }

  // ── Stage 7 — appetite statements ────────────────────────────────────────
  let appetiteCount = 0;
  for (const p of bundle.paths) {
    if (!p.appetite) continue;
    const tpId = pathIdByCode.get(p.path_code);
    if (!tpId) continue;
    await service.upsertAppetite(atlas.id, {
      threat_path_id: tpId,
      appetite_position: p.appetite.appetite_position,
      required_action: p.appetite.required_action ?? undefined,
      target_date: p.appetite.target_date ?? null,
      budget_eur: p.appetite.budget_eur ?? null,
    }, importerUserId);
    appetiteCount++;
  }

  // ── Deterministic recomputation check ────────────────────────────────────
  // Compare the residuals the calculator just produced over the IMPORTED
  // rows against what the bundle claims. Mismatch = warn, import with flag.
  const mismatches: RecomputeMismatch[] = [];
  let checked = 0;
  for (const p of bundle.paths) {
    if (!p.residual) continue;
    const tpId = pathIdByCode.get(p.path_code);
    if (!tpId) continue;
    checked++;
    const stored = await db.get<{ residual_score: number; control_quality_rollup: string }>(
      `SELECT residual_score, control_quality_rollup FROM atlas_residual_scores WHERE threat_path_id = ?`,
      tpId,
    );
    if (!stored) {
      mismatches.push({ path_code: p.path_code, field: 'residual_score', bundled: p.residual.residual_score, recomputed: 0 });
      continue;
    }
    if (Number(stored.residual_score) !== p.residual.residual_score) {
      mismatches.push({ path_code: p.path_code, field: 'residual_score', bundled: p.residual.residual_score, recomputed: Number(stored.residual_score) });
    }
    if (stored.control_quality_rollup !== p.residual.control_quality_rollup) {
      mismatches.push({ path_code: p.path_code, field: 'control_quality_rollup', bundled: p.residual.control_quality_rollup, recomputed: stored.control_quality_rollup });
    }
  }
  const recomputeOk = mismatches.length === 0;
  if (!recomputeOk) {
    warnings.push(
      `Deterministic recomputation differs from the bundled scores on ${mismatches.length} item(s) — the imported Atlas carries the RECOMPUTED values (the calculator is the source of truth); the bundle's claims are recorded in the import event.`
    );
  }

  await events.logEvent({
    atlasId: atlas.id, event: 'atlas_imported', userId: importerUserId,
    details: {
      source_generator: bundle.generator ?? null,
      exported_at: bundle.exported_at ?? null,
      exported_by: bundle.exported_by ?? null,
      paths: bundle.paths.length,
      recompute_ok: recomputeOk,
      recompute_mismatches: mismatches,
    },
  });

  return {
    atlasId: atlas.id,
    atlasName: atlas.name,
    stats: {
      paths: pathIdByCode.size,
      exposures: exposureIdByKey.size,
      vulnerabilities: vulnIdByCode.size,
      controls: controlCount,
      inherent_scored: inherentScored,
      appetite_statements: appetiteCount,
    },
    recompute: { checked, matched: checked - new Set(mismatches.map(m => m.path_code)).size, mismatches, ok: recomputeOk },
    warnings,
  };
}
