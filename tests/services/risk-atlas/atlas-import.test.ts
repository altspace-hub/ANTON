/**
 * atlas-import.test.ts — Wave 4.10: risk-atlas-export import (successor
 * handover) — the PURE parts, golden-data tested against the deterministic
 * residual calculator (no DB):
 *
 *   • parseAtlasBundle: strict zod acceptance of the exact shape
 *     atlas-export.ts generateAtlasBundle() writes; honest rejection
 *     of non-bundles with named paths
 *   • verifyBundleScores: a clean export matches; tampered scores are
 *     detected; the controls-without-vulnerabilities reconstruction gap is
 *     surfaced (rollup recomputes as 'absent'), not hidden
 */
import { describe, it, expect } from 'vitest';
import { parseAtlasBundle, verifyBundleScores, type AtlasBundle } from '../../../server/services/risk-atlas/atlas-importer.js';

/** Golden bundle — mirrors atlas-export.ts output for a 2-path Atlas. */
function goldenBundle(): AtlasBundle {
  return {
    bundle_type: 'risk-atlas-export',
    version: '1.0.0',
    format_version: '1.0.0',
    created_at: '2026-06-01T00:00:00.000Z',
    generator: 'openexpert/0.7.5',
    exported_at: '2026-06-01T00:00:00.000Z',
    exported_by: 'predecessor-mlro',
    atlas: {
      name: 'Bakery Risk Atlas',
      description: 'Local bakery',
      business_description: 'We bake bread.',
      industry_pack_id: 'sme-general',
      mode: 'expert',
    },
    paths: [
      {
        // inherent = max(2,3,4) = 4; one strong control → reduction 2 → residual 2
        path_code: 'TP-01',
        name: 'Cash skimming',
        description: null,
        fcp_domain: 'fraud',
        exposures: [{ name: 'Cash register', description: null, category: 'channel' }],
        vulnerabilities: [{ vuln_code: 'V-01', name: 'No till reconciliation', severity: 4 }],
        inherent: { exposure_score: 2, threat_score: 3, vulnerability_score: 4, inherent_score: 4, rationale: 'cash heavy' },
        controls: [{ control_code: 'C-01', name: 'Daily till count', type: 'detect', strength: 'strong', evidence: 'Signed daily count sheets', owner_role: 'Manager' }],
        residual: { residual_score: 2, control_quality_rollup: 'strong' },
        appetite: { appetite_position: 'within', required_action: null, target_date: null, budget_eur: null },
      },
      {
        // inherent = max(5,2,3) = 5; strong + weak controls → worst-of weak →
        // reduction 0 → residual 5 (unacceptable)
        path_code: 'TP-02',
        name: 'Supplier kickbacks',
        description: 'Procurement abuse',
        fcp_domain: 'abc',
        exposures: [{ name: 'Supplier onboarding', description: null, category: 'process' }],
        vulnerabilities: [{ vuln_code: 'V-02', name: 'Single approver', severity: 3 }],
        inherent: { exposure_score: 5, threat_score: 2, vulnerability_score: 3, inherent_score: 5, rationale: null },
        controls: [
          { control_code: 'C-02', name: 'Dual approval', type: 'prevent', strength: 'strong', evidence: 'ERP workflow log', owner_role: null },
          { control_code: 'C-03', name: 'Annual spot check', type: 'detect', strength: 'weak', evidence: null, owner_role: null },
        ],
        residual: { residual_score: 5, control_quality_rollup: 'weak' },
        appetite: { appetite_position: 'unacceptable', required_action: 'Add rotation policy', target_date: '2026-09-30', budget_eur: 2500 },
      },
    ],
  };
}

describe('parseAtlasBundle (Wave 4.10)', () => {
  it('accepts the exact shape atlas-export writes', () => {
    const result = parseAtlasBundle(goldenBundle());
    expect(result.ok).toBe(true);
  });

  it('rejects a non-bundle with named issues', () => {
    const result = parseAtlasBundle({ bundle_type: 'module', atlas: {}, paths: 'nope' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errors.join(' ')).toMatch(/bundle_type/);
  });

  it('rejects out-of-range scores', () => {
    const bad = goldenBundle() as unknown as Record<string, unknown>;
    (bad.paths as Array<Record<string, unknown>>)[0] = {
      ...(bad.paths as Array<Record<string, unknown>>)[0],
      inherent: { exposure_score: 9, threat_score: 1, vulnerability_score: 1, inherent_score: 9 },
    };
    const result = parseAtlasBundle(bad);
    expect(result.ok).toBe(false);
  });
});

describe('verifyBundleScores — deterministic recompute check (golden data)', () => {
  it('a clean export from a healthy Atlas recomputes identically', () => {
    expect(verifyBundleScores(goldenBundle())).toEqual([]);
  });

  it('detects a tampered residual (bundle claims 2, calculator says 5)', () => {
    const bundle = goldenBundle();
    bundle.paths[1].residual = { residual_score: 2, control_quality_rollup: 'strong' };
    const mismatches = verifyBundleScores(bundle);
    const fields = mismatches.filter(m => m.path_code === 'TP-02').map(m => m.field);
    expect(fields).toContain('residual_score');
    expect(fields).toContain('control_quality_rollup');
    const residualMismatch = mismatches.find(m => m.path_code === 'TP-02' && m.field === 'residual_score');
    expect(residualMismatch?.bundled).toBe(2);
    expect(residualMismatch?.recomputed).toBe(5);
  });

  it('detects an inconsistent inherent score (max rule)', () => {
    const bundle = goldenBundle();
    bundle.paths[0].inherent = { ...bundle.paths[0].inherent!, inherent_score: 3 }; // max(2,3,4)=4, not 3
    const mismatches = verifyBundleScores(bundle);
    expect(mismatches.some(m => m.path_code === 'TP-01' && m.field === 'inherent_score' && m.recomputed === 4)).toBe(true);
  });

  it('surfaces the controls-without-vulnerabilities reconstruction gap honestly', () => {
    const bundle = goldenBundle();
    // A path whose controls cannot be re-linked (no vulnerabilities) recomputes
    // as 'absent' — residual = inherent. The check must SAY so, not hide it.
    bundle.paths[0].vulnerabilities = [];
    const mismatches = verifyBundleScores(bundle);
    expect(mismatches.some(m => m.path_code === 'TP-01' && m.field === 'control_quality_rollup' && m.recomputed === 'absent')).toBe(true);
    expect(mismatches.some(m => m.path_code === 'TP-01' && m.field === 'residual_score' && m.recomputed === 4)).toBe(true);
  });

  it('paths without inherent scores are skipped (nothing to verify)', () => {
    const bundle = goldenBundle();
    bundle.paths[0].inherent = null;
    bundle.paths[0].residual = null;
    expect(verifyBundleScores(bundle).filter(m => m.path_code === 'TP-01')).toEqual([]);
  });
});
