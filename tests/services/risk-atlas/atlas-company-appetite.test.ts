/**
 * atlas-company-appetite.test.ts — Stage 7b, the company-wide Risk Appetite
 * Statement (2026-09-23).
 *
 * The consolidator prompt said "the executor calls computeCompanyAppetite and
 * injects the result" and nothing did. Now it runs the way Generate BWRA does:
 * code renders every position, count and outside path from the deterministic
 * rollup; the model writes only narrative; a narrative that states another
 * position or number is recorded, and the Atlas figure stands.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AtlasExportSnapshot } from '../../../server/services/risk-atlas/atlas-export.js';
import type { CompanyAppetiteRollup } from '../../../server/services/risk-atlas/atlas-fcp-scope-service.js';
import type { ThreatPathFull } from '../../../server/services/risk-atlas/types.js';

const mkPath = (code: string, name: string, domain: string | null, residual: number | null, appetite: Partial<NonNullable<ThreatPathFull['appetite']>> | null): ThreatPathFull => ({
  path: { id: code.toLowerCase(), atlas_id: 'a1', path_code: code, name, description: null, source_pack_path_id: null, fcp_domain: domain, created_at: '', updated_at: '' } as ThreatPathFull['path'],
  exposures: [], vulnerabilities: [], controls: [],
  inherent: residual ? { id: `i-${code}`, threat_path_id: code.toLowerCase(), exposure_score: 5, threat_score: 5, vulnerability_score: 5, inherent_score: 5 } as ThreatPathFull['inherent'] : null,
  residual: residual ? { id: `r-${code}`, threat_path_id: code.toLowerCase(), residual_score: residual, control_quality_rollup: 'adequate', open_vulnerability_notes: null, calculated_at: '' } as ThreatPathFull['residual'] : null,
  appetite: appetite ? { id: `ap-${code}`, atlas_id: 'a1', threat_path_id: code.toLowerCase(), required_action: null, target_date: null, budget_eur: null, approved_by: null, approved_at: null, created_at: '', updated_at: '', ...appetite } as ThreatPathFull['appetite'] : null,
});

const snap: AtlasExportSnapshot = {
  atlas: { id: 'a1', name: 'Demo CASP', description: null, business_description: 'An EU CASP.', industry_pack_id: 'fcp-casp', next_review_due_at: null } as AtlasExportSnapshot['atlas'],
  dashboard: { paths_total: 4, paths_by_appetite: { within: 1, boundary: 1, outside: 1, unacceptable: 1 } } as AtlasExportSnapshot['dashboard'],
  paths: [
    mkPath('TP-1', 'Layering', 'amlcft', 4, { appetite_position: 'outside', required_action: 'Replace eKYC vendor', target_date: new Date('2026-12-31T00:00:00Z') as unknown as string, budget_eur: '25000.00' }),
    mkPath('TP-2', 'Sanctions evasion', 'sanctions', 5, null),
    mkPath('TP-3', 'Insider fraud', 'fraud', 2, null),
    mkPath('TP-4', 'Outage', null, 3, null),
  ],
  exported_at: '2026-09-23T10:00:00.000Z',
  exported_by: 'u1',
};
const rollup: CompanyAppetiteRollup = {
  atlas_id: 'a1', overall_position: 'unacceptable',
  by_domain: { amlcft: 'outside', sanctions: 'unacceptable', fraud: 'within' }, by_dimension: { operational: 'boundary' },
  paths_outside_or_unacceptable: 2, paths_at_boundary: 1, paths_within: 1, paths_unscored: 0, computed_at: '',
};
const scope = { atlas_id: 'a1', amlcft_active: true, sanctions_active: true, fraud_active: true, abc_active: true, market_abuse_active: false } as never;
const triggers = [{ id: 't1', atlas_id: 'a1', trigger_event: 'A sanctions hit', required_action: 'Freeze and report', timeline: 'same day', source: 'regulatory' }] as never;

const fcp = { computeCompanyAppetite: vi.fn(async () => rollup), getScope: vi.fn(async () => scope) };
vi.mock('../../../server/services/risk-atlas/atlas-fcp-scope-service.js', () => ({ createAtlasFcpScopeService: () => fcp }));
vi.mock('../../../server/services/risk-atlas/atlas-service.js', () => ({ createAtlasService: () => ({ listTriggers: async () => triggers }) }));
vi.mock('../../../server/services/risk-atlas/atlas-export.js', async (orig) => {
  const actual = await orig<typeof import('../../../server/services/risk-atlas/atlas-export.js')>();
  return { ...actual, createAtlasExport: () => ({ buildSnapshot: async (id: string) => (id === 'a1' ? snap : id === 'empty' ? { ...snap, paths: [] } : null) }) };
});
const events: unknown[] = [];
vi.mock('../../../server/services/risk-atlas/atlas-event-logger.js', () => ({ createAtlasEventLogger: () => ({ logEvent: async (e: unknown) => { events.push(e); } }) }));

const mod = await import('../../../server/services/risk-atlas/atlas-company-appetite.js');
const { renderAppetiteTables, outsidePaths, checkAppetiteConsistency, parseAppetiteNarrative, assembleAppetiteDocument, createAtlasCompanyAppetite, COMPANY_MODE_INSTRUCTION } = mod;

describe('tables — rendered from the Atlas, never by the model', () => {
  const t = renderAppetiteTables(snap, rollup, scope, triggers);

  it('the overall position and the counts come from the rollup', () => {
    expect(t.overall.split('\n')[0]).toBe('**Overall position: Unacceptable** — the worst position of any threat path in the Atlas.');
    expect(t.overall).toContain('| Threat paths | 2 | 1 | 1 | 0 |');
  });

  it('every outside or unacceptable path is in the remediation programme, by name; a missing action says so', () => {
    expect(outsidePaths(snap).map((p) => p.path.path_code)).toEqual(['TP-1', 'TP-2']);
    expect(t.remediation).toContain('| TP-1 | Layering | 4 | Outside appetite | Replace eKYC vendor | 2026-12-31 | 25000 | no |');
    expect(t.remediation).toContain('| TP-2 | Sanctions evasion | 5 | Unacceptable | not recorded | not recorded | not recorded | no |');
    expect(t.remediation).not.toContain('TP-3');
  });

  it('domains show scope, paths and the worst-of position; an out-of-scope domain with no paths is left out', () => {
    expect(t.domains).toContain('| AML/CFT | yes | 1 | Outside appetite |');
    expect(t.domains).toContain('| Anti-bribery and corruption | yes | 0 | — |');
    expect(t.domains).not.toContain('Market abuse');
    expect(t.operational).toContain('| Operational (paths with no FCP domain) | 1 | At boundary |');
  });

  it('the Atlas\'s escalation triggers are listed as recorded', () => {
    expect(t.triggers).toContain('| A sanctions hit | Freeze and report | same day | regulatory |');
  });

  it('an unscored Atlas says so instead of claiming a position', () => {
    const none = renderAppetiteTables(snap, { ...rollup, overall_position: null }, null, []);
    expect(none.overall).toMatch(/^\*\*Overall position: not yet determined\*\*/);
    expect(none.triggers).toBe('_No escalation trigger is recorded in the Atlas._');
  });
});

describe('a path declared more leniently than its residual is shown, not hidden', () => {
  // Review 2026-09-23: the rollup counts the declared position, so TP-3 declared
  // "within" at residual 5 left the remediation programme and could make the
  // company look within appetite. The consolidator's rule: flag it, never hide it.
  const lenientSnap: AtlasExportSnapshot = { ...snap, paths: [...snap.paths, mkPath('TP-5', 'Stale acceptance', 'fraud', 5, { appetite_position: 'within', approved_at: '2026-01-01T00:00:00Z' })] };
  const t = renderAppetiteTables(lenientSnap, rollup, scope, triggers);

  it('lists it under accepted exceptions, with its residual band and declared position', () => {
    expect(t.exceptionCount).toBe(1);
    expect(t.exceptions).toContain('| TP-5 | Stale acceptance | 5 | Unacceptable | Within appetite | yes |');
    expect(t.remediation).not.toContain('TP-5');      // counted at its declared position, as the rollup does
  });

  it('says so under the overall position, and puts the table in the remediation section of the document', () => {
    expect(t.overall).toContain('**1 threat path(s) are declared more leniently than their residual** (TP-5)');
    const md = assembleAppetiteDocument(lenientSnap, rollup, {}, t, [], 'abc', {});
    const remediation = md.slice(md.indexOf('## 4. Remediation programme'), md.indexOf('## 5.'));
    expect(remediation).toContain('**Accepted exceptions — declared more leniently than the residual**');
    expect(remediation).toContain('| TP-5 | Stale acceptance |');
  });

  it('an Atlas without such a path says that too', () => {
    expect(renderAppetiteTables(snap, rollup, scope, triggers).exceptions).toBe('_No path is declared more leniently than its residual._');
  });
});

describe('the narrative is checked against the rollup', () => {
  it('reads a clause about one path or one domain as that, not as the overall position', () => {
    const text = 'The overall position, with TP-1 outside, is unacceptable. The company is within its appetite on fraud.';
    expect(checkAppetiteConsistency(text, snap, rollup, '')).toEqual([]);
  });

  it('flags a different overall position, and a company "within" appetite when it is not', () => {
    const issues = checkAppetiteConsistency('The overall position is within appetite. The company is within its risk appetite.', snap, rollup);
    expect(issues.map((i) => [i.kind, i.stated, i.atlas])).toEqual([['overall_position', 'within', 'unacceptable'], ['overall_position', 'within', 'unacceptable']]);
  });

  it('reads only what is asserted: a negated or conditional claim is not a claim', () => {
    // Live draft 2026-09-23: "Anna Berg cannot sign an attestation that this
    // business operates within its stated appetite" was flagged as saying "within".
    const text = [
      'As Managing Director, Anna Berg cannot sign an attestation that this business operates within its stated appetite.',
      'The overall position is not within appetite.',
      'The board will ask whether the company is within its appetite.',
      'Once the programme is done, the business should be within its appetite.',
    ].join(' ');
    expect(checkAppetiteConsistency(text, snap, rollup, '')).toEqual([]);
    // …while the plain assertion is still caught.
    expect(checkAppetiteConsistency('Today the business operates within its stated appetite.', snap, rollup, '')).toEqual([expect.objectContaining({ kind: 'overall_position', stated: 'within' })]);
  });

  it('accepts statements that agree ("outside" agrees with an unacceptable overall)', () => {
    expect(checkAppetiteConsistency('The overall position is **Unacceptable**. The company is outside its appetite until TP-2 is fixed.', snap, rollup)).toEqual([]);
  });

  it('a dimension\'s own count is not read as the whole Atlas\'s', () => {
    // Live draft 2026-09-23, operational section: "Below those sit five paths
    // outside appetite: …" — the dimension's five, flagged against the total 14.
    const dimension = 'Below those sit five paths outside appetite: payment fraud, supplier failure and three more.';
    expect(checkAppetiteConsistency(`The overall position is unacceptable.\n\n${dimension}`, snap, rollup, 'The overall position is unacceptable.')).toEqual([]);
    // The same sentence in the overall section is a claim about the whole Atlas.
    expect(checkAppetiteConsistency(dimension, snap, rollup, dimension)).toEqual([expect.objectContaining({ kind: 'outside_count', stated: 5, atlas: 2 })]);
  });

  it('a count of paths at a residual is the Atlas\'s count', () => {
    // Live draft 2026-09-23: "five threat paths carry a residual score of 5" when
    // the Atlas had eight. The fixture has one path at residual 5 (TP-2).
    const wrong = 'Three threat paths carry a residual score of 5 with no approved remediation.';
    expect(checkAppetiteConsistency(wrong, snap, rollup, wrong)).toEqual([expect.objectContaining({ kind: 'residual_count', score: 5, stated: 3, atlas: 1 })]);
    const right = 'One threat path carries a residual score of 5.';
    expect(checkAppetiteConsistency(right, snap, rollup, right)).toEqual([]);
    // Outside the overall section it is a part's count, as with the outside count.
    expect(checkAppetiteConsistency(wrong, snap, rollup, '')).toEqual([]);
  });

  it('keeps the BWRA checks: a path residual and the outside count', () => {
    const issues = checkAppetiteConsistency('TP-2 has a residual of 3. Three paths are outside appetite.', snap, rollup);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'residual', path: 'TP-2', stated: 3, atlas: 5 }),
      expect.objectContaining({ kind: 'outside_count', stated: 3, atlas: 2 }),
    ]));
  });
});

describe('parsing and assembly', () => {
  it('recognises the headings the model tends to write, including the module template\'s own', () => {
    const n = parseAppetiteNarrative('## 1. Overall position\nWhy.\n## By FCP domain\nD.\n## By non-FCP dimension\nO.\n## Approved remediation programme\nR.\n## Escalation triggers (company-wide)\nT.');
    expect(n).toEqual({ overall: 'Why.', domains: 'D.', operational: 'O.', remediation: 'R.', triggers: 'T.' });
  });

  it('a heading as asked for wins over a looser match', () => {
    expect(parseAppetiteNarrative('## Remediation programme by domain\nR.\n## By FCP domain\nD.')).toEqual({ remediation: 'R.', domains: 'D.' });
  });

  it('a clean check says what it covered, and what it did not', () => {
    const t = renderAppetiteTables(snap, rollup, scope, triggers);
    const md = assembleAppetiteDocument(snap, rollup, {}, t, [], 'abc', {});
    expect(md).toContain('It does not check domain positions or other wording');
  });

  it('the document opens with the position, keeps the tables, and ends with sign-off and the check', () => {
    const t = renderAppetiteTables(snap, rollup, scope, triggers);
    const md = assembleAppetiteDocument(snap, rollup, { overall: 'Unacceptable: sanctions screening is not in place.' }, t, [], 'abcdef1234567890', { approverName: 'Jane Doe', approverRole: 'Owner', reviewCadence: 'annual' });
    const lines = md.split('\n');
    expect(lines[0]).toBe('# Demo CASP — Company-wide Risk Appetite Statement');
    expect(lines[2]).toMatch(/^\*Draft for approval · generated 2026-09-23 .* snapshot abcdef123456 · review annual\.\*$/);
    expect(lines[4]).toBe('**Overall position: Unacceptable** — the worst position of any threat path in the Atlas.');
    expect(md).toContain('## 4. Remediation programme');
    expect(md).toContain('| TP-2 | Sanctions evasion |');
    expect(md).toContain('_Not written in this draft._');
    expect(md).toContain('Approved by: ___________________________  (Jane Doe, Owner)');
    expect(md).toContain('## Consistency check');
  });

  it('the brief forbids restating tables and inventing actions', () => {
    expect(COMPANY_MODE_INSTRUCTION).toContain('never invent them');
    expect(COMPANY_MODE_INSTRUCTION).toContain('## Overall position\n## By FCP domain\n## By non-FCP dimension\n## Remediation programme\n## Escalation triggers');
  });
});

describe('generate', () => {
  const stored: unknown[][] = [];
  const db = { async run(_sql: string, ...p: unknown[]) { stored.push(p); return { changes: 1, lastInsertRowid: 0 }; }, async get() { return undefined; }, async all() { return []; } } as unknown as import('../../../server/db/database.js').DatabaseAdapter;
  beforeEach(() => { stored.length = 0; events.length = 0; });

  it('sends the consolidator prompt in Atlas mode, stores the document with its rollup, and logs the event', async () => {
    const chat = vi.fn(async () => ({
      text: '## Overall position\nThe overall position is within appetite.\n## Remediation programme\nTP-1 and TP-2 need action.',
      thinking: '', inputTokens: 1, outputTokens: 1, modelServed: 'claude-opus-5',
    }));
    const doc = await createAtlasCompanyAppetite(db, { chat }).generate('a1', 'u1', { approverName: 'Jane Doe', reviewCadence: 'annual' });

    const cfg = chat.mock.calls[0][0] as unknown as { system: string; purpose: string; messages: Array<{ content: string }> };
    expect(cfg.system).toContain('# Atlas Stage 7b');          // the module's own prompt
    expect(cfg.system).toContain('## Atlas mode — this run');
    expect(cfg.purpose).toBe('atlas_company_appetite');
    expect(cfg.messages[0].content).toContain('Approver: Jane Doe');
    expect(cfg.messages[0].content).toContain('**Overall position: Unacceptable**');

    expect(doc.overall_position).toBe('unacceptable');
    expect(doc.consistency_issues).toEqual([expect.objectContaining({ kind: 'overall_position', stated: 'within', atlas: 'unacceptable' })]);
    expect(doc.markdown).toContain('**The Atlas figures stand; correct the narrative before sign-off.**');
    expect(stored[0][0]).toBe(doc.id);
    expect(JSON.parse(String(stored[0][5]))).toMatchObject({ overall_position: 'unacceptable', paths_outside_or_unacceptable: 2 });
    expect(events).toEqual([expect.objectContaining({ event: 'company_appetite_generated', subResourceId: doc.id, details: expect.objectContaining({ consistency_issues: 1 }) })]);
  });

  it('refuses an unknown Atlas and one with no paths, before calling the model', async () => {
    const chat = vi.fn();
    const svc = createAtlasCompanyAppetite(db, { chat });
    await expect(svc.generate('nope', 'u1')).rejects.toThrow(/Atlas not found/);
    await expect(svc.generate('empty', 'u1')).rejects.toThrow(/no threat paths/);
    expect(chat).not.toHaveBeenCalled();
    expect(stored).toEqual([]);
  });
});

describe('routes', () => {
  it('every Stage 7b route checks Atlas ownership first', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('server/routes/atlas.ts', 'utf8').replace(/\r\n/g, '\n');
    for (const route of ["router.post('/atlas/:id/company-appetite/statements'", "router.get('/atlas/:id/company-appetite/statements/job'",
      "router.get('/atlas/:id/company-appetite/statements'", "router.get('/atlas/:id/company-appetite/statements/:docId'",
      "router.get('/atlas/:id/company-appetite/statements/:docId/docx'"]) {
      const at = src.indexOf(route);
      expect(at, route).toBeGreaterThan(-1);
      expect(src.slice(at, at + 400), route).toMatch(/if \(!\(await ensureAtlasAccess\(db, req as AuthedRequest, id, res\)\)\) return;/);
    }
    // The job route is declared before /:docId, or "job" would be read as a document id.
    expect(src.indexOf("'/atlas/:id/company-appetite/statements/job'")).toBeLessThan(src.indexOf("'/atlas/:id/company-appetite/statements/:docId'"));
  });
});
