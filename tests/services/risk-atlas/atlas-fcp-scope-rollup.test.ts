// Tests for the deterministic worst-of company-wide appetite rollup
// in atlas-fcp-scope-service.computeCompanyAppetite.
//
// The rollup runs as a single LEFT JOIN; we drive it by stubbing
// db.all to return the rows the JOIN would produce.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { appetitePositionFor } from '../../../server/services/risk-atlas/atlas-residual-calculator.js';
import type { AppetitePosition, FcpDomain } from '../../../server/services/risk-atlas/types.js';

vi.mock('../../../server/services/risk-atlas/atlas-event-logger.js', () => ({
  createAtlasEventLogger: vi.fn(() => ({ logEvent: vi.fn() })),
}));

import { createAtlasFcpScopeService } from '../../../server/services/risk-atlas/atlas-fcp-scope-service.js';

interface RollupRow {
  fcp_domain: FcpDomain | null;
  residual_score: number | null;
  declared_position: AppetitePosition | null;
  declared_approved?: boolean;
}

function buildService(rows: RollupRow[]) {
  const db = {
    all: vi.fn(async () => rows),
    get: vi.fn(), run: vi.fn(),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { svc: createAtlasFcpScopeService(db as any), db };
}

describe('computeCompanyAppetite — worst-of-rule rollup', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns null overall when there are no paths', async () => {
    const { svc } = buildService([]);
    const r = await svc.computeCompanyAppetite('atlas1');
    expect(r.overall_position).toBeNull();
    expect(r.paths_outside_or_unacceptable).toBe(0);
    expect(r.paths_at_boundary).toBe(0);
    expect(r.paths_within).toBe(0);
    expect(r.paths_unscored).toBe(0);
  });

  it('counts unscored paths separately', async () => {
    const { svc } = buildService([{ fcp_domain: 'amlcft', residual_score: null, declared_position: null }]);
    const r = await svc.computeCompanyAppetite('atlas1');
    expect(r.paths_unscored).toBe(1);
    expect(r.overall_position).toBeNull();
  });

  it('worst-of: one outside path = company outside', async () => {
    const { svc } = buildService([
      { fcp_domain: 'amlcft',    residual_score: 2, declared_position: 'within' },
      { fcp_domain: 'sanctions', residual_score: 2, declared_position: 'within' },
      { fcp_domain: 'fraud',     residual_score: 4, declared_position: 'outside' },
    ]);
    const r = await svc.computeCompanyAppetite('atlas1');
    expect(r.overall_position).toBe('outside');
    expect(r.paths_outside_or_unacceptable).toBe(1);
    expect(r.paths_within).toBe(2);
  });

  it('worst-of: unacceptable beats outside', async () => {
    const { svc } = buildService([
      { fcp_domain: 'fraud',  residual_score: 4, declared_position: 'outside' },
      { fcp_domain: 'amlcft', residual_score: 5, declared_position: 'unacceptable' },
    ]);
    const r = await svc.computeCompanyAppetite('atlas1');
    expect(r.overall_position).toBe('unacceptable');
  });

  it('per-domain worst-of: AML/CFT and Sanctions independent', async () => {
    const { svc } = buildService([
      { fcp_domain: 'amlcft',    residual_score: 4, declared_position: 'outside' },
      { fcp_domain: 'amlcft',    residual_score: 2, declared_position: 'within' },
      { fcp_domain: 'sanctions', residual_score: 3, declared_position: 'boundary' },
    ]);
    const r = await svc.computeCompanyAppetite('atlas1');
    expect(r.by_domain.amlcft).toBe('outside');
    expect(r.by_domain.sanctions).toBe('boundary');
    expect(r.overall_position).toBe('outside');
  });

  it('non-FCP paths roll up to operational dimension', async () => {
    const { svc } = buildService([
      { fcp_domain: null,     residual_score: 5, declared_position: 'unacceptable' },
      { fcp_domain: 'amlcft', residual_score: 2, declared_position: 'within' },
    ]);
    const r = await svc.computeCompanyAppetite('atlas1');
    expect(r.by_dimension.operational).toBe('unacceptable');
    expect(r.by_domain.amlcft).toBe('within');
    expect(r.overall_position).toBe('unacceptable');
  });

  it('falls back to calculated appetite when no declared appetite present', async () => {
    expect(appetitePositionFor(5)).toBe('unacceptable');
    const { svc } = buildService([
      { fcp_domain: 'fraud', residual_score: 5, declared_position: null },
    ]);
    const r = await svc.computeCompanyAppetite('atlas1');
    expect(r.overall_position).toBe('unacceptable');
  });

  it('a declaration more lenient than the residual counts only once approved (owner decision 2026-09-23)', async () => {
    const unapproved = buildService([{ fcp_domain: 'fraud', residual_score: 5, declared_position: 'outside', declared_approved: false }]);
    expect((await unapproved.svc.computeCompanyAppetite('atlas1')).overall_position).toBe('unacceptable');
    const approved = buildService([{ fcp_domain: 'fraud', residual_score: 5, declared_position: 'outside', declared_approved: true }]);
    expect((await approved.svc.computeCompanyAppetite('atlas1')).overall_position).toBe('outside');
  });

  it('a stricter declaration counts without approval', async () => {
    const { svc } = buildService([{ fcp_domain: 'fraud', residual_score: 2, declared_position: 'outside' }]);
    expect((await svc.computeCompanyAppetite('atlas1')).overall_position).toBe('outside');
  });

  it('reads the approval in the same single query', async () => {
    const { svc, db } = buildService([]);
    await svc.computeCompanyAppetite('atlas1');
    expect(String((db.all.mock.calls[0] as unknown[])[0])).toContain('(a.approved_at IS NOT NULL) AS declared_approved');
  });

  it('runs as a single SQL query — no N+1', async () => {
    const { svc, db } = buildService([]);
    await svc.computeCompanyAppetite('atlas1');
    expect(db.all).toHaveBeenCalledTimes(1);
  });
});
