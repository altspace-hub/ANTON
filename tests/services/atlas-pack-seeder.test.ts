import { describe, it, expect } from 'vitest';
import { seedAtlasFromProposal, type PackProposal, type SeedMutators } from '../../server/services/risk-atlas/atlas-pack-seeder.js';

/**
 * Unit test for the 2026-07-17 Atlas pack seeder. Pure logic over fake mutators
 * (no DB): the load-bearing behaviour is resolving the pack-internal refs into
 * the newly-created atlas sub-resource ids — a threat path's exposure_refs, and
 * linking each vulnerability to the paths whose vulnerability_refs include it.
 */

interface Call { atlasId: string; input: Record<string, unknown>; }

function fakeMutators() {
  const calls = { exposures: [] as Call[], paths: [] as Call[], vulns: [] as Call[] };
  let n = 0;
  const mut: SeedMutators = {
    async addExposure(atlasId, input) { calls.exposures.push({ atlasId, input }); return { id: `ex_${++n}` }; },
    async addThreatPath(atlasId, input) { calls.paths.push({ atlasId, input }); return { id: `tp_${++n}` }; },
    async addVulnerability(atlasId, input) { calls.vulns.push({ atlasId, input }); return { id: `v_${++n}` }; },
  };
  return { mut, calls };
}

const PROPOSAL: PackProposal = {
  exposures: [
    { id: 'pex1', name: 'Cash intake', description: 'd', category: 'operational' },
    { id: 'pex2', name: 'Onboarding', description: 'd', category: 'customer' },
  ],
  threatPaths: [
    { id: 'ptp1', code: 'TP-1', name: 'Structuring', description: 'd', typical_inherent: 4, fcp_domain: 'amlcft', exposure_refs: ['pex1'], vulnerability_refs: ['pv1', 'pv2'] },
    { id: 'ptp2', code: 'TP-2', name: 'ID fraud', description: 'd', typical_inherent: 3, exposure_refs: ['pex2'], vulnerability_refs: ['pv2'] },
  ],
  vulnerabilities: [
    { id: 'pv1', code: 'V-1', name: 'No CTR', description: 'd', typical_severity: 4 },
    { id: 'pv2', code: 'V-2', name: 'Weak KYC', description: 'd', typical_severity: 5 },
  ],
};

describe('seedAtlasFromProposal', () => {
  it('inserts E → T → V and returns counts', async () => {
    const { mut, calls } = fakeMutators();
    const counts = await seedAtlasFromProposal('atlas1', PROPOSAL, mut, 'user1');
    expect(counts).toEqual({ exposures: 2, threatPaths: 2, vulnerabilities: 2 });
    expect(calls.exposures).toHaveLength(2);
    expect(calls.paths).toHaveLength(2);
    expect(calls.vulns).toHaveLength(2);
    // all writes go to the access-checked atlas
    for (const c of [...calls.exposures, ...calls.paths, ...calls.vulns]) expect(c.atlasId).toBe('atlas1');
  });

  it('resolves a threat path exposure_refs to the new atlas exposure ids', async () => {
    const { mut, calls } = fakeMutators();
    await seedAtlasFromProposal('atlas1', PROPOSAL, mut, 'user1');
    // ex_1 = pex1, ex_2 = pex2 (insertion order). TP-1 refs pex1 → ex_1.
    const tp1 = calls.paths.find((c) => c.input.path_code === 'TP-1')!;
    expect(tp1.input.exposure_ids).toEqual(['ex_1']);
    expect(tp1.input.source_pack_path_id).toBe('ptp1');
    expect(tp1.input.fcp_domain).toBe('amlcft');
    const tp2 = calls.paths.find((c) => c.input.path_code === 'TP-2')!;
    expect(tp2.input.exposure_ids).toEqual(['ex_2']);
  });

  it('links each vulnerability to the paths whose vulnerability_refs include it', async () => {
    const { mut, calls } = fakeMutators();
    await seedAtlasFromProposal('atlas1', PROPOSAL, mut, 'user1');
    // Path ids assigned after 2 exposures: TP-1=tp_3, TP-2=tp_4.
    const v1 = calls.vulns.find((c) => c.input.vuln_code === 'V-1')!;
    expect(v1.input.threat_path_ids).toEqual(['tp_3']);       // only TP-1 refs pv1
    expect(v1.input.severity).toBe(4);
    const v2 = calls.vulns.find((c) => c.input.vuln_code === 'V-2')!;
    expect(v2.input.threat_path_ids).toEqual(['tp_3', 'tp_4']); // both paths ref pv2
  });

  it('handles an empty proposal without error', async () => {
    const { mut } = fakeMutators();
    const counts = await seedAtlasFromProposal('atlas1', { exposures: [], threatPaths: [], vulnerabilities: [] }, mut, 'u');
    expect(counts).toEqual({ exposures: 0, threatPaths: 0, vulnerabilities: 0 });
  });

  it('drops refs that do not resolve (dangling pack ref) rather than throwing', async () => {
    const { mut, calls } = fakeMutators();
    const bad: PackProposal = {
      exposures: [],
      threatPaths: [{ id: 'p', code: 'TP', name: 'n', description: 'd', typical_inherent: 3, exposure_refs: ['missing'], vulnerability_refs: [] }],
      vulnerabilities: [],
    };
    await seedAtlasFromProposal('atlas1', bad, mut, 'u');
    // exposure_ids omitted (no resolvable refs) — no crash.
    expect(calls.paths[0].input.exposure_ids).toBeUndefined();
  });
});
