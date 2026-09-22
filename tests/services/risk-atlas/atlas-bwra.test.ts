/**
 * atlas-bwra.test.ts — "Generate BWRA" keeps the Atlas's numbers.
 *
 * The rule the Atlas was built on — the calculator owns the numbers — is
 * enforced in code: score tables are rendered from the Atlas, the model writes
 * only narrative, and any narrative that states a different score or count is
 * recorded as a consistency issue. A model that tries to "improve" a score
 * cannot change the tables.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AtlasExportSnapshot } from '../../../server/services/risk-atlas/atlas-export.js';
import type { ThreatPathFull } from '../../../server/services/risk-atlas/types.js';

// ── Fixture: TP-1 outside appetite (5 − 1 = 4), TP-2 within (3 − 2 = 1), TP-3 unscored ──

function path(code: string, over: Partial<ThreatPathFull>): ThreatPathFull {
  return {
    path: { id: `p-${code}`, atlas_id: 'a1', path_code: code, name: `Path ${code}`, description: null, source_pack_path_id: null, fcp_domain: 'amlcft', created_at: '', updated_at: '' } as ThreatPathFull['path'],
    exposures: [{ id: 'e1', atlas_id: 'a1', name: 'Retail onboarding', description: null, category: 'customer', source_pack_exposure_id: null, created_at: '', updated_at: '' }],
    vulnerabilities: [{ id: `v-${code}`, atlas_id: 'a1', vuln_code: `V-${code.slice(3)}`, name: 'Weak eKYC', description: null, severity: 3, source_pack_vuln_id: null, created_at: '', updated_at: '' }],
    inherent: null, controls: [], residual: null, appetite: null,
    ...over,
  };
}

const snap: AtlasExportSnapshot = {
  atlas: { id: 'a1', name: 'Demo CASP', description: null, project_id: null, business_description: 'An EU CASP.', industry_pack_id: 'fcp-casp', status: 'active', mode: 'expert', entity_id: null, owner_user_id: 'u1', created_by: 'u1', org_id: 'o1', last_review_at: null, next_review_due_at: null, created_at: '', updated_at: '' } as AtlasExportSnapshot['atlas'],
  dashboard: { paths_total: 3, paths_by_appetite: { within: 1, boundary: 0, outside: 1, unacceptable: 0 } } as AtlasExportSnapshot['dashboard'],
  paths: [
    path('TP-1', {
      inherent: { id: 'i1', threat_path_id: 'p-TP-1', exposure_score: 4, threat_score: 5, vulnerability_score: 3, inherent_score: 5 } as ThreatPathFull['inherent'],
      controls: [{ id: 'c1', atlas_id: 'a1', control_code: 'C-1', name: 'Chain analytics', description: null, type: 'detect', strength: 'adequate', evidence: 'Vendor SLA + monthly QA', owner_role: 'MLRO', source_pack_control_id: null, created_at: '', updated_at: '' }],
      residual: { id: 'r1', threat_path_id: 'p-TP-1', residual_score: 4, control_quality_rollup: 'adequate', open_vulnerability_notes: null, calculated_at: '' },
      appetite: { id: 'ap1', atlas_id: 'a1', threat_path_id: 'p-TP-1', appetite_position: 'outside', required_action: 'Whitelist wallets',
        // node-postgres returns a DATE column as a Date object (a live run crashed on .slice)
        target_date: new Date('2027-03-31T00:00:00Z') as unknown as string, budget_eur: null, approved_by: null, approved_at: null, created_at: '', updated_at: '' },
    }),
    path('TP-2', {
      inherent: { id: 'i2', threat_path_id: 'p-TP-2', exposure_score: 3, threat_score: 2, vulnerability_score: 3, inherent_score: 3 } as ThreatPathFull['inherent'],
      residual: { id: 'r2', threat_path_id: 'p-TP-2', residual_score: 1, control_quality_rollup: 'strong', open_vulnerability_notes: null, calculated_at: '' },
    }),
    path('TP-3', {}),
  ],
  exported_at: '2026-09-22T10:00:00.000Z',
  exported_by: 'u1',
};

// generate() reads the snapshot through atlas-export; hand it the fixture.
vi.mock('../../../server/services/risk-atlas/atlas-export.js', async (orig) => {
  const actual = await orig<typeof import('../../../server/services/risk-atlas/atlas-export.js')>();
  return { ...actual, createAtlasExport: () => ({ buildSnapshot: async (id: string) => (id === 'a1' ? snap : id === 'empty' ? { ...snap, paths: [] } : null) }) };
});

const bwraMod = await import('../../../server/services/risk-atlas/atlas-bwra.js');
const { renderStageTables, parseNarrative, checkConsistency, assembleDocument, createAtlasBwra, BwraInputError, outsideCount } = bwraMod;

describe('renderStageTables — the numbers come from the Atlas', () => {
  const t = renderStageTables(snap);

  it('Stage 4: inherent is the highest of E, T, V', () => {
    expect(t.stage4).toMatch(/\| TP-1 \| 4 \| 5 \| 3 \| 5 \|/);
    expect(t.stage4).toMatch(/\| TP-3 \| — \| — \| — \| not scored yet \|/);
  });

  it('Stage 6: the subtraction is shown and matches the stored residual', () => {
    expect(t.stage6).toMatch(/\| TP-1 \| 5 \| adequate \| 5 − 1 = 4 \| 4 \|/);
    expect(t.stage6).toMatch(/\| TP-2 \| 3 \| strong \| 3 − 2 = 1 \| 1 \|/);
  });

  it('Stage 7: bands, action, date', () => {
    expect(t.stage7).toMatch(/\| TP-1 \| 4 \| Outside \| Whitelist wallets \| 2027-03-31 \| no \|/);
    expect(t.stage7).toMatch(/\| TP-2 \| 1 \| Within \|/);
  });

  it('Stage 5: evidence recorded is a yes/no fact', () => {
    expect(t.stage5).toMatch(/\| C-1 \| Chain analytics \| detect \| adequate \| yes \| MLRO \|/);
  });

  it('counts paths outside appetite from the Atlas', () => { expect(outsideCount(snap)).toBe(1); });
});

describe('parseNarrative', () => {
  it('maps the fixed headings (case-insensitive, by prefix) and ignores preamble', () => {
    const s = parseNarrative('Preamble\n## Executive Summary\nSum.\n## Stage 4 — Inherent risk\nInh.\n### detail\nmore\n## Annex C — Methodology references\nRefs.');
    expect(s.summary).toBe('Sum.');
    expect(s.stage4).toBe('Inh.\n### detail\nmore');
    expect(s.annexC).toBe('Refs.');
  });
});

describe('checkConsistency', () => {
  it('flags a stated residual that differs from the Atlas, not one that matches', () => {
    const issues = checkConsistency('TP-1 sits at a residual of 3. TP-2 has a residual score of 1.', snap);
    expect(issues).toEqual([expect.objectContaining({ kind: 'residual', path: 'TP-1', stated: 3, atlas: 4 })]);
  });

  it('does not read a band definition in another clause as a path score', () => {
    // From a live draft: the residual 5 defines the band, it is not TP-1's score.
    expect(checkConsistency('Escalate on TP-1); movement of any path into the "unacceptable" band (residual 5) triggers review.', snap)).toEqual([]);
    expect(checkConsistency('TP-1 and TP-2: the latter has a residual of 1.', snap)).toEqual([]);
    // Short enough for the 50-character window: only the clause boundary stops it.
    expect(checkConsistency('TP-1 is watched; the escalation band is residual 5.', snap)).toEqual([]);
  });

  it('flags a wrong inherent score', () => {
    expect(checkConsistency('For TP-2 the inherent risk is 5.', snap)[0]).toMatchObject({ kind: 'inherent', path: 'TP-2', stated: 5, atlas: 3 });
  });

  it('flags a wrong count of paths outside appetite (words or digits), accepts the right one', () => {
    expect(checkConsistency('Two of three paths sit outside appetite.', snap)[0]).toMatchObject({ kind: 'outside_count', stated: 2, atlas: 1 });
    expect(checkConsistency('One path sits outside appetite.', snap)).toEqual([]);
  });

  it('reads the number that governs "outside", not the first number in the sentence', () => {
    // A live run was flagged wrongly on this sentence: seventeen is the total.
    expect(checkConsistency('The Atlas records seventeen paths, including the one outside appetite.', snap)).toEqual([]);
    expect(checkConsistency('One of three scored paths sits outside appetite.', snap)).toEqual([]);
    expect(checkConsistency('Obligations under Art. 10 fall outside this section.', snap)).toEqual([]);
    // From a live draft: a year is not a count of paths.
    expect(checkConsistency('Remediation slips to the 2027 cycle, leaving this path outside appetite.', snap)).toEqual([]);
    expect(checkConsistency('The register has 3 paths, of which two sit outside appetite.', snap)[0]).toMatchObject({ stated: 2, atlas: 1 });
  });
});

describe('assembleDocument', () => {
  it('puts each Atlas table under its stage, says who wrote what, and lists issues', () => {
    const t = renderStageTables(snap);
    const md = assembleDocument(snap, { summary: 'S', stage6: 'R' }, t, [{ kind: 'residual', path: 'TP-1', stated: 3, atlas: 4, excerpt: 'TP-1 residual 3' }], 'abc123def456789');
    // The Atlas table comes first under the stage heading, then the narrative on it.
    expect(md).toContain('## 8. Stage 6 — Residual risk\n\n**From the Risk Atlas**\n\n' + t.stage6 + '\n\nR');
    expect(md).toMatch(/every score in them is computed by fixed rules/);
    expect(md).toMatch(/TP-1 residual: narrative says 3, the Atlas has 4/);
    expect(md).toContain('_Not written in this draft._');
  });
});

describe('generate', () => {
  let runs: Array<{ sql: string; params: unknown[] }>;
  const db = {
    async run(sql: string, ...params: unknown[]) { runs.push({ sql, params }); return { changes: 1, lastInsertRowid: 0 }; },
    async get() { return undefined; },
    async all() { return []; },
  } as unknown as import('../../../server/db/database.js').DatabaseAdapter;
  beforeEach(() => { runs = []; });

  it('sends the module prompt in Atlas mode with the facts, and stores the Atlas tables whatever the model says', async () => {
    const chat = vi.fn(async () => ({
      text: '## Executive summary\nTwo of three paths sit outside appetite.\n## Stage 6 — Residual risk\nTP-1 has a residual of 2 after controls.',
      thinking: '', inputTokens: 1, outputTokens: 1, modelServed: 'claude-opus-5',
    }));
    const doc = await createAtlasBwra(db, { chat }).generate('a1', 'u1');

    const cfg = chat.mock.calls[0][0] as { system: string; messages: Array<{ content: string }>; purpose: string };
    expect(cfg.system).toContain('# Business-Wide Risk Assessment (BWRA)');
    expect(cfg.system).toContain('## Atlas mode — this run');
    expect(cfg.messages[0].content).toContain('| TP-1 | 5 | adequate | 5 − 1 = 4 | 4 |');
    expect(cfg.purpose).toBe('atlas_bwra');

    expect(doc.markdown).toContain('| TP-1 | 5 | adequate | 5 − 1 = 4 | 4 |');
    expect(doc.consistency_issues.map((i) => i.kind).sort()).toEqual(['outside_count', 'residual']);
    expect(runs.some((r) => r.sql.startsWith('INSERT INTO atlas_bwra_documents'))).toBe(true);
    expect(runs.some((r) => r.sql.includes('INSERT INTO atlas_events') && r.params.includes('bwra_generated'))).toBe(true);
  });

  it('refuses an Atlas with no threat paths, and an unknown one, without calling the model', async () => {
    const chat = vi.fn();
    await expect(createAtlasBwra(db, { chat }).generate('empty', 'u1')).rejects.toBeInstanceOf(BwraInputError);
    await expect(createAtlasBwra(db, { chat }).generate('nope', 'u1')).rejects.toThrow(/Atlas not found/);
    expect(chat).not.toHaveBeenCalled();
  });
});

describe('routes', () => {
  it('every BWRA route checks Atlas ownership first', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('server/routes/atlas.ts', 'utf8').replace(/\r\n/g, '\n');
    for (const route of ["router.post('/atlas/:id/bwra'", "router.get('/atlas/:id/bwra/job'", "router.get('/atlas/:id/bwra'", "router.get('/atlas/:id/bwra/:docId'", "router.get('/atlas/:id/bwra/:docId/docx'"]) {
      const at = src.indexOf(route);
      expect(at, route).toBeGreaterThan(-1);
      expect(src.slice(at, at + 400), route).toMatch(/if \(!\(await ensureAtlasAccess\(db, req as AuthedRequest, id, res\)\)\) return;/);
    }
  });
});
