// Tests for the atlas-integrity-rules service. The rules are pure
// functions over a hydrated AtlasExportSnapshot, so we drive them by
// stubbing buildSnapshot via vi.mock on createAtlasExport.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AtlasExportSnapshot } from '../../../server/services/risk-atlas/atlas-export.js';
import type { ThreatPathFull, RiskAtlasRow, AtlasDashboard, Score1to5 } from '../../../server/services/risk-atlas/types.js';

vi.mock('../../../server/services/risk-atlas/atlas-export.js', () => ({
  createAtlasExport: vi.fn(),
}));

import { createAtlasExport } from '../../../server/services/risk-atlas/atlas-export.js';
import { createAtlasIntegrityRunner, listIntegrityRules } from '../../../server/services/risk-atlas/atlas-integrity-rules.js';

function fakeAtlas(overrides: Partial<RiskAtlasRow> = {}): RiskAtlasRow {
  return {
    id: 'atlas1', owner_user_id: 'u1', created_by: 'u1', org_id: 'org1',
    project_id: null, entity_id: null, industry_pack_id: null,
    name: 'Atlas 1', description: null, business_description: null,
    status: 'active', mode: 'draft',
    last_review_at: null, next_review_due_at: null,
    created_at: '', updated_at: '',
    ...overrides,
  };
}

function fakeDashboard(atlas: RiskAtlasRow, opts: { next_review_at?: string | null } = {}): AtlasDashboard {
  return {
    atlas, pack: null, paths_total: 0,
    paths_by_appetite: { within: 0, boundary: 0, outside: 0, unacceptable: 0 },
    paths_by_residual: {},
    paths_outside_appetite: [],
    next_review_at: opts.next_review_at ?? null,
    last_event_at: null,
  };
}

function fakePath(opts: {
  id: string;
  residual_score?: Score1to5;
  has_appetite?: boolean;
  has_action?: boolean;
  has_target_date?: boolean;
  has_inherent?: boolean;
  vuln_count?: number;
  control_strength?: 'strong' | 'adequate' | 'weak';
  control_evidence?: string | null;
}): ThreatPathFull {
  return {
    path: { id: opts.id, atlas_id: 'atlas1', path_code: `TP-${opts.id}`, name: `Path ${opts.id}`,
      description: null, fcp_domain: null, source_pack_path_id: null,
      created_at: '', updated_at: '' },
    exposures: [],
    vulnerabilities: Array.from({ length: opts.vuln_count ?? 0 }, (_, i) => ({
      id: `v${i}`, atlas_id: 'atlas1', vuln_code: `V-${i}`, name: `V${i}`,
      description: null, severity: 3 as Score1to5, source_pack_vuln_id: null,
      created_at: '', updated_at: '',
    })),
    inherent: opts.has_inherent === false ? null : opts.residual_score ? {
      id: 'i1', threat_path_id: opts.id,
      exposure_score: 1, threat_score: 1, vulnerability_score: opts.residual_score,
      inherent_score: opts.residual_score, rationale: null, scored_at: '', scored_by: null,
    } : null,
    controls: opts.control_strength ? [{
      id: 'c1', atlas_id: 'atlas1', control_code: 'C-1', name: 'C1',
      description: null, type: 'prevent', strength: opts.control_strength,
      evidence: opts.control_evidence ?? null, owner_role: null,
      source_pack_control_id: null, created_at: '', updated_at: '',
    }] : [],
    residual: opts.residual_score ? {
      id: 'r1', threat_path_id: opts.id,
      residual_score: opts.residual_score, control_quality_rollup: 'absent',
      open_vulnerability_notes: null, calculated_at: '',
    } : null,
    appetite: opts.has_appetite ? {
      id: 'a1', atlas_id: 'atlas1', threat_path_id: opts.id,
      appetite_position: 'outside',
      required_action: opts.has_action ? 'Do the thing' : null,
      target_date: opts.has_target_date ? '2026-12-31' : null,
      budget_eur: null, approved_by: null, approved_at: null,
      created_at: '', updated_at: '',
    } : null,
  };
}

function buildRunner(atlas: RiskAtlasRow, paths: ThreatPathFull[], opts: { next_review_at?: string | null } = {}) {
  const snap: AtlasExportSnapshot = {
    atlas, dashboard: fakeDashboard(atlas, opts), paths,
    exported_at: '2026-04-18T10:00:00Z', exported_by: null,
  };
  (createAtlasExport as ReturnType<typeof vi.fn>).mockReturnValue({
    buildSnapshot: vi.fn(async () => snap),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createAtlasIntegrityRunner({} as any);
}

describe('atlas-integrity-rules', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('listIntegrityRules returns the catalogue with severity', () => {
    const rules = listIntegrityRules();
    expect(rules.length).toBeGreaterThanOrEqual(6);
    const codes = rules.map(r => r.code);
    expect(codes).toContain('ATLAS-INT-001');
    expect(codes).toContain('ATLAS-INT-003');
    expect(codes).toContain('ATLAS-INT-006');
    expect(rules.find(r => r.code === 'ATLAS-INT-001')?.severity).toBe('critical');
  });

  it('ATLAS-INT-001: residual ≥ 4 with no appetite → critical', async () => {
    const runner = buildRunner(fakeAtlas(), [
      fakePath({ id: 'p1', residual_score: 4, has_appetite: false }),
    ]);
    const rep = await runner.evaluate('atlas1');
    expect(rep!.findings.find(f => f.rule_code === 'ATLAS-INT-001')).toBeTruthy();
    expect(rep!.counts.critical).toBeGreaterThanOrEqual(1);
  });

  it('ATLAS-INT-001 does NOT fire when residual < 4', async () => {
    const runner = buildRunner(fakeAtlas(), [
      fakePath({ id: 'p1', residual_score: 3, has_appetite: false }),
    ]);
    const rep = await runner.evaluate('atlas1');
    expect(rep!.findings.find(f => f.rule_code === 'ATLAS-INT-001')).toBeUndefined();
  });

  it('ATLAS-INT-002: outside-appetite path missing action / target → high', async () => {
    // residual 4 → outside (per appetitePositionFor); appetite present but no action
    const runner = buildRunner(fakeAtlas(), [
      fakePath({ id: 'p1', residual_score: 4, has_appetite: true, has_action: false, has_target_date: false }),
    ]);
    const rep = await runner.evaluate('atlas1');
    expect(rep!.findings.find(f => f.rule_code === 'ATLAS-INT-002')).toBeTruthy();
  });

  it('ATLAS-INT-002 passes when outside path has action + target', async () => {
    const runner = buildRunner(fakeAtlas(), [
      fakePath({ id: 'p1', residual_score: 4, has_appetite: true, has_action: true, has_target_date: true }),
    ]);
    const rep = await runner.evaluate('atlas1');
    expect(rep!.findings.find(f => f.rule_code === 'ATLAS-INT-002')).toBeUndefined();
  });

  it('ATLAS-INT-003: Strong control without evidence → high', async () => {
    const runner = buildRunner(fakeAtlas(), [
      fakePath({ id: 'p1', residual_score: 2, control_strength: 'strong', control_evidence: '' }),
    ]);
    const rep = await runner.evaluate('atlas1');
    expect(rep!.findings.find(f => f.rule_code === 'ATLAS-INT-003')).toBeTruthy();
  });

  it('ATLAS-INT-003 passes when Strong control has ≥5 char evidence', async () => {
    const runner = buildRunner(fakeAtlas(), [
      fakePath({ id: 'p1', residual_score: 2, control_strength: 'strong', control_evidence: 'See policy POL-2026-001' }),
    ]);
    const rep = await runner.evaluate('atlas1');
    expect(rep!.findings.find(f => f.rule_code === 'ATLAS-INT-003')).toBeUndefined();
  });

  it('ATLAS-INT-004: missing inherent score → medium', async () => {
    const runner = buildRunner(fakeAtlas(), [
      fakePath({ id: 'p1', has_inherent: false }),
    ]);
    const rep = await runner.evaluate('atlas1');
    expect(rep!.findings.find(f => f.rule_code === 'ATLAS-INT-004')).toBeTruthy();
  });

  it('ATLAS-INT-005: vulns present but no controls → medium', async () => {
    const runner = buildRunner(fakeAtlas(), [
      fakePath({ id: 'p1', residual_score: 3, vuln_count: 2 }),
    ]);
    const rep = await runner.evaluate('atlas1');
    expect(rep!.findings.find(f => f.rule_code === 'ATLAS-INT-005')).toBeTruthy();
  });

  it('ATLAS-INT-006: active atlas without review cycle → low', async () => {
    const runner = buildRunner(fakeAtlas({ status: 'active' }), [], { next_review_at: null });
    const rep = await runner.evaluate('atlas1');
    expect(rep!.findings.find(f => f.rule_code === 'ATLAS-INT-006')).toBeTruthy();
  });

  it('ATLAS-INT-006 does NOT fire on non-active atlas', async () => {
    const runner = buildRunner(fakeAtlas({ status: 'draft' }), [], { next_review_at: null });
    const rep = await runner.evaluate('atlas1');
    expect(rep!.findings.find(f => f.rule_code === 'ATLAS-INT-006')).toBeUndefined();
  });

  it('clean Atlas returns zero findings', async () => {
    const runner = buildRunner(fakeAtlas({ status: 'active' }), [
      fakePath({ id: 'p1', residual_score: 2, has_appetite: true, control_strength: 'adequate' }),
    ], { next_review_at: '2027-01-01T00:00:00Z' });
    const rep = await runner.evaluate('atlas1');
    expect(rep!.findings).toHaveLength(0);
    expect(rep!.counts).toEqual({ critical: 0, high: 0, medium: 0, low: 0 });
  });
});
