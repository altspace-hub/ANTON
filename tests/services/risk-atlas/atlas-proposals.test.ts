/**
 * atlas-proposals.test.ts — AI suggestions for a Risk Atlas.
 *
 * The seven atlas-* prompts end in a fenced JSON diff that nothing ever read.
 * Now each diff becomes proposals a person accepts or rejects. Two guarantees
 * must hold whatever the model writes:
 *   - it never sets a score the calculator owns (inherent, residual);
 *   - it never invents a reference: an unknown TP-/V- code is `unresolved`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AtlasExportSnapshot } from '../../../server/services/risk-atlas/atlas-export.js';
import type { ThreatPathFull } from '../../../server/services/risk-atlas/types.js';

const snap: AtlasExportSnapshot = {
  atlas: { id: 'a1', name: 'Demo', description: null, project_id: null, business_description: 'An EU CASP.', industry_pack_id: 'fcp-casp', status: 'active', mode: 'expert', entity_id: null, owner_user_id: 'u1', created_by: 'u1', org_id: 'o1', last_review_at: null, next_review_due_at: null, created_at: '', updated_at: '' } as AtlasExportSnapshot['atlas'],
  dashboard: { paths_total: 1, paths_by_appetite: { within: 0, boundary: 0, outside: 1, unacceptable: 0 } } as AtlasExportSnapshot['dashboard'],
  paths: [{
    path: { id: 'tp-1', atlas_id: 'a1', path_code: 'TP-1', name: 'Layering', description: null, source_pack_path_id: null, fcp_domain: 'amlcft', created_at: '', updated_at: '' } as ThreatPathFull['path'],
    exposures: [{ id: 'ex-1', atlas_id: 'a1', name: 'Retail onboarding', description: null, category: 'customer_segment', source_pack_exposure_id: null, created_at: '', updated_at: '' }],
    vulnerabilities: [{ id: 'v-1', atlas_id: 'a1', vuln_code: 'V-1', name: 'Weak eKYC', description: null, severity: 3, source_pack_vuln_id: null, created_at: '', updated_at: '' }],
    inherent: { id: 'i-1', threat_path_id: 'tp-1', exposure_score: 5, threat_score: 4, vulnerability_score: 3, inherent_score: 5 } as ThreatPathFull['inherent'],
    controls: [], residual: { id: 'r-1', threat_path_id: 'tp-1', residual_score: 4, control_quality_rollup: 'adequate', open_vulnerability_notes: null, calculated_at: '' }, appetite: null,
  }],
  exported_at: '2026-09-22T10:00:00.000Z',
  exported_by: 'u1',
};

const service = {
  addExposure: vi.fn(async () => ({ id: 'ex-new' })),
  addThreatPath: vi.fn(async () => ({ id: 'tp-new' })),
  addVulnerability: vi.fn(async () => ({ id: 'v-new' })),
  addControl: vi.fn(async () => ({ id: 'c-new' })),
  scoreInherent: vi.fn(async () => ({ inherent: { id: 'i-new' }, residual: { id: 'r-new' } })),
  recalculateResidualForPath: vi.fn(async () => ({ id: 'r-new' })),
  upsertAppetite: vi.fn(async () => ({ id: 'ap-new' })),
  addTrigger: vi.fn(async () => ({ id: 'tr-new' })),
};
vi.mock('../../../server/services/risk-atlas/atlas-service.js', () => ({ createAtlasService: () => service }));
vi.mock('../../../server/services/risk-atlas/atlas-export.js', async (orig) => {
  const actual = await orig<typeof import('../../../server/services/risk-atlas/atlas-export.js')>();
  return { ...actual, createAtlasExport: () => ({ buildSnapshot: async (id: string) => (id === 'a1' ? snap : null) }) };
});
vi.mock('../../../server/services/risk-atlas/atlas-pack-loader.js', () => ({
  createAtlasPackLoader: () => ({ getPackContent: async () => ({ exposurePoints: [{ id: 'pk-e1', name: 'Pack exposure' }], threatPaths: [], vulnerabilities: [], controls: [] }) }),
}));

const mod = await import('../../../server/services/risk-atlas/atlas-proposals.js');
const { extractFencedJson, parseDiff, indexAtlas, resolveItem, buildStageFacts, createAtlasProposals, STAGES, isProposalStage } = mod;

const idx = indexAtlas(snap);
const fence = (name: string, body: unknown) => `Prose first.\n\n\`\`\`${name}\n${JSON.stringify(body)}\n\`\`\`\n`;

describe('extractFencedJson', () => {
  it('takes the last block of the named fence', () => {
    const text = fence('atlas_exposure_diff', { additions: [{ name: 'first' }] }) + fence('atlas_exposure_diff', { additions: [{ name: 'second' }] });
    expect(extractFencedJson(text, 'atlas_exposure_diff')).toEqual({ value: { additions: [{ name: 'second' }] } });
  });
  it('explains a missing block and invalid JSON', () => {
    expect(extractFencedJson('no block here', 'atlas_exposure_diff')).toEqual({ error: expect.stringContaining('no `atlas_exposure_diff` block') });
    expect(extractFencedJson('```atlas_exposure_diff\n{oops\n```', 'atlas_exposure_diff')).toEqual({ error: expect.stringContaining('not valid JSON') });
  });
});

describe('parseDiff — what a stage may propose', () => {
  it('accepts a well-formed addition and keeps its rationale', () => {
    const items = parseDiff('vulnerabilities', { additions: [{ vuln_code: 'V-2', name: 'No callback check', severity: 4, threat_path_codes: ['TP-1'], severity_rationale: 'Pack benchmark 4' }] });
    expect(items).toEqual([expect.objectContaining({ kind: 'vulnerability', status: 'pending', rationale: 'Pack benchmark 4' })]);
  });

  it('refuses a score the calculator owns', () => {
    const inherent = parseDiff('inherent', { scores: [{ threat_path_code: 'TP-1', exposure_score: 4, threat_score: 4, vulnerability_score: 4, inherent_score: 5 }] });
    expect(inherent[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('inherent_score') });
    const appetite = parseDiff('appetite', { statements: [{ threat_path_code: 'TP-1', appetite_position: 'outside', residual_score: 2 }] });
    expect(appetite[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('residual_score') });
  });

  it('refuses out-of-range and malformed values', () => {
    expect(parseDiff('vulnerabilities', { additions: [{ vuln_code: 'V-3', name: 'x', severity: 9 }] })[0]).toMatchObject({ status: 'failed' });
    expect(parseDiff('controls', { additions: [{ control_code: 'C-1', name: 'x', type: 'magic', strength: 'strong' }] })[0]).toMatchObject({ status: 'failed' });
  });

  it('accepts the descriptive keys the stage prompts emit, and keeps them out of the payload', () => {
    // A live run rejected all 14 exposures: every one carried `source` (asked
    // for by the prompt) and `rationale` (asked for by proposal mode).
    const [item] = parseDiff('exposures', { additions: [{ name: 'Custody', category: 'service', source: 'pack-proposed [ex-casp-custody]', rationale: 'Core MiCA service' }] });
    expect(item.status).toBe('pending');
    expect(item.rationale).toBe('Core MiCA service · pack-proposed [ex-casp-custody]');
    expect(item.payload).toEqual({ name: 'Custody', category: 'service' });
  });

  it('never lets a model sign off an appetite statement', () => {
    // The appetite prompt's own shape carries approved_by and override_reason.
    const [item] = parseDiff('appetite', { statements: [{ threat_path_code: 'TP-1', appetite_position: 'outside', required_action: 'Fix', approved_by: null, override_reason: 'board accepted' }] });
    expect(item.status).toBe('pending');
    expect(item.payload.approved_by).toBeUndefined();
    expect(item.rationale).toContain('board accepted');
    // a named approver is refused outright — approval is a person's act
    expect(parseDiff('appetite', { statements: [{ threat_path_code: 'TP-1', appetite_position: 'outside', approved_by: 'the board' }] })[0]).toMatchObject({ status: 'failed' });
  });

  it('sets edits and removals aside instead of dropping them', () => {
    const items = parseDiff('exposures', { additions: [], edits: [{ id: 'ex-1', field: 'description', new_value: 'x' }], removals: [{ id: 'ex-1', reason: 'gone' }] });
    expect(items.map((i) => i.status)).toEqual(['skipped', 'skipped']);
    expect(items[0].error).toMatch(/reviewed by hand/);
  });
});

describe('resolveItem — references come from the Atlas, never invented', () => {
  it('turns a path code into its id', () => {
    const [item] = parseDiff('inherent', { scores: [{ threat_path_code: 'tp-1', exposure_score: 3, threat_score: 3, vulnerability_score: 3 }] });
    const r = resolveItem(item, idx);
    expect(r.status).toBe('pending');
    expect(r.payload).toMatchObject({ threat_path_id: 'tp-1' });
    expect(r.payload.threat_path_code).toBeUndefined();
  });

  it('marks an unknown path unresolved, with the reason', () => {
    const [item] = parseDiff('inherent', { scores: [{ threat_path_code: 'TP-99', exposure_score: 3, threat_score: 3, vulnerability_score: 3 }] });
    expect(resolveItem(item, idx)).toMatchObject({ status: 'unresolved', error: expect.stringContaining('TP-99') });
  });

  it('a control with no resolvable vulnerability is unresolved; a partly-known one keeps the good links and says so', () => {
    const [bad] = parseDiff('controls', { additions: [{ control_code: 'C-9', name: 'x', type: 'detect', strength: 'weak', vulnerability_links: [{ vulnerability_code: 'V-77', type: 'detect' }] }] });
    expect(resolveItem(bad, idx)).toMatchObject({ status: 'unresolved' });
    const [mixed] = parseDiff('controls', { additions: [{ control_code: 'C-8', name: 'x', type: 'detect', strength: 'weak', vulnerability_links: [{ vulnerability_code: 'V-1', type: 'detect' }, { vulnerability_code: 'V-77', type: 'detect' }] }] });
    const r = resolveItem(mixed, idx);
    expect(r.status).toBe('pending');
    expect(r.payload.vulnerability_links).toEqual([{ vulnerability_id: 'v-1', type: 'detect' }]);
    expect(r.rationale).toMatch(/Unknown vulnerabilities left off: V-77/);
  });

  it('a threat path keeps known exposures and notes the unknown ones', () => {
    const [item] = parseDiff('threat_paths', { additions: [{ path_code: 'TP-2', name: 'Mules', exposure_names: ['Retail onboarding', 'Nope'], exposure_ids: ['ex-1'] }] });
    const r = resolveItem(item, idx);
    expect(r.payload.exposure_ids).toEqual(['ex-1']);
    expect(r.rationale).toMatch(/left off: Nope/);
  });
});

describe('appetite — the band follows the residual, not the model', () => {
  it('replaces a position that contradicts the stored residual, and says so', () => {
    const [item] = parseDiff('appetite', { statements: [{ threat_path_code: 'TP-1', appetite_position: 'within', required_action: 'Nothing to do' }] });
    const r = resolveItem(item, idx);
    expect(r.payload.appetite_position).toBe('outside');           // residual 4
    expect(r.rationale).toMatch(/from the Atlas residual 4 \(the model proposed "within"\)/);
  });

  it('leaves a position that agrees', () => {
    const [item] = parseDiff('appetite', { statements: [{ threat_path_code: 'TP-1', appetite_position: 'outside' }] });
    const r = resolveItem(item, idx);
    expect(r.payload.appetite_position).toBe('outside');
    expect(r.rationale).toBeNull();
  });
});

describe('buildStageFacts', () => {
  it('shows what the Atlas already has, with ids, and the pack catalogue', () => {
    const facts = buildStageFacts('vulnerabilities', snap, { exposurePoints: [{ id: 'pk-e1', name: 'Pack exposure' }], threatPaths: [], vulnerabilities: [], controls: [] });
    expect(facts).toContain('TP-1 Layering [tp-1]');
    expect(facts).toContain('V-1 Weak eKYC (severity 3) [v-1]');
    expect(facts).toContain('Pack exposure [pk-e1]');
    expect(facts).toContain('An EU CASP.');
  });
  it('adds the score table for the stages that need it', () => {
    expect(buildStageFacts('inherent', snap, null)).toContain('| TP-1 | Layering | 5 | adequate | 4 | none |');
    expect(buildStageFacts('exposures', snap, null)).not.toContain('| Path | Name |');
  });
});

describe('generate + accept/reject', () => {
  let rows: Map<string, Record<string, unknown>>;
  const db = {
    async run(sql: string, ...p: unknown[]) {
      if (sql.startsWith('INSERT INTO atlas_proposals ')) {
        rows.set(String(p[0]), { id: p[0], set_id: p[1], atlas_id: p[2], kind: p[3], payload: p[4], rationale: p[5], status: p[6], error: p[7], applied_ref_id: null, decided_by: null, decided_at: null, created_at: '2026-09-22T10:00:00.000Z' });
      } else if (sql.startsWith('UPDATE atlas_proposals SET status')) {
        const id = String(p[p.length - 1]);
        const row = rows.get(id)!;
        row.status = /status = 'accepted'/.test(sql) ? 'accepted' : /status = 'rejected'/.test(sql) ? 'rejected' : 'failed';
        if (/applied_ref_id = \?/.test(sql)) row.applied_ref_id = p[0];
        if (/error = \?/.test(sql)) row.error = p[0];
      }
      return { changes: 1, lastInsertRowid: 0 };
    },
    async get(_sql: string, ...p: unknown[]) { const r = rows.get(String(p[0])); return r && r.atlas_id === p[1] ? r : undefined; },
    async all() { return [...rows.values()]; },
  } as unknown as import('../../../server/db/database.js').DatabaseAdapter;

  beforeEach(() => { rows = new Map(); vi.clearAllMocks(); });

  it('sends the stage module prompt in proposal mode and stores what came back', async () => {
    const chat = vi.fn(async () => ({
      text: fence('atlas_vulnerabilities_diff', {
        additions: [
          { vuln_code: 'V-2', name: 'No callback verification', severity: 4, threat_path_codes: ['TP-1'], severity_rationale: 'benchmark' },
          { vuln_code: 'V-3', name: 'Ghost path', severity: 2, threat_path_codes: ['TP-42'] },
        ],
        removals: [{ id: 'v-1', reason: 'no longer relevant' }],
      }),
      thinking: '', inputTokens: 1, outputTokens: 1, modelServed: 'claude-opus-5',
    }));
    const { proposals } = await createAtlasProposals(db, { chat }).generate('a1', 'vulnerabilities', 'u1');

    const cfg = chat.mock.calls[0][0] as { system: string; purpose: string; messages: Array<{ content: string }> };
    expect(cfg.system).toContain('## Proposal mode — this run');
    expect(cfg.system).toContain('atlas_vulnerabilities_diff');
    expect(cfg.purpose).toBe('atlas_proposals');
    expect(cfg.messages[0].content).toContain('TP-1 Layering [tp-1]');

    expect(proposals.map((p) => p.status)).toEqual(['pending', 'unresolved', 'skipped']);
  });

  it('accepting applies through atlas-service and records the new row; rejecting writes nothing', async () => {
    const chat = vi.fn(async () => ({
      text: fence('atlas_vulnerabilities_diff', { additions: [{ vuln_code: 'V-2', name: 'No callback verification', severity: 4, threat_path_codes: ['TP-1'] }] }),
      thinking: '', inputTokens: 1, outputTokens: 1, modelServed: 'm',
    }));
    const p = createAtlasProposals(db, { chat });
    const { proposals } = await p.generate('a1', 'vulnerabilities', 'u1');
    const accepted = await p.accept('a1', proposals[0].id, 'u1');
    if (!accepted.ok) throw new Error(accepted.reason);

    expect(service.addVulnerability).toHaveBeenCalledWith('a1', expect.objectContaining({ vuln_code: 'V-2', severity: 4, threat_path_ids: ['tp-1'] }), 'u1');
    expect(accepted.proposal.status).toBe('accepted');
    expect(accepted.proposal.applied_ref_id).toBe('v-new');
    // Deciding twice is an expected refusal, not an exception.
    expect(await p.accept('a1', proposals[0].id, 'u1')).toEqual({ ok: false, reason: 'This suggestion is already accepted.' });
    expect(await p.reject('a1', 'no-such-id', 'u1')).toEqual({ ok: false, reason: 'Suggestion not found' });

    const { proposals: second } = await p.generate('a1', 'vulnerabilities', 'u1');
    const rejected = await p.reject('a1', second[0].id, 'u1');
    expect(rejected).toMatchObject({ ok: true, proposal: { status: 'rejected' } });
    expect(service.addVulnerability).toHaveBeenCalledTimes(1);
  });

  it('an inherent score goes through scoreInherent — the calculator computes inherent', async () => {
    const chat = vi.fn(async () => ({
      text: fence('atlas_inherent_scores_diff', { scores: [{ threat_path_code: 'TP-1', exposure_score: 5, threat_score: 4, vulnerability_score: 3, rationale: 'why' }] }),
      thinking: '', inputTokens: 1, outputTokens: 1, modelServed: 'm',
    }));
    const p = createAtlasProposals(db, { chat });
    const { proposals } = await p.generate('a1', 'inherent', 'u1');
    await p.accept('a1', proposals[0].id, 'u1');
    expect(service.scoreInherent).toHaveBeenCalledWith('a1', 'tp-1', { exposure: 5, threat: 4, vulnerability: 3, rationale: 'why' }, 'u1');
  });

  it('a control recalculates the residual of every path it touches', async () => {
    const chat = vi.fn(async () => ({
      text: fence('atlas_controls_diff', { additions: [{ control_code: 'C-1', name: 'Callback check', type: 'prevent', strength: 'strong', vulnerability_links: [{ vulnerability_code: 'V-1', type: 'prevent' }] }] }),
      thinking: '', inputTokens: 1, outputTokens: 1, modelServed: 'm',
    }));
    const p = createAtlasProposals(db, { chat });
    const { proposals } = await p.generate('a1', 'controls', 'u1');
    await p.accept('a1', proposals[0].id, 'u1');
    expect(service.addControl).toHaveBeenCalled();
    expect(service.recalculateResidualForPath).toHaveBeenCalledWith('tp-1', 'u1', 'a1');
  });

  it('a failure while applying is recorded on the suggestion and raised', async () => {
    service.addVulnerability.mockRejectedValueOnce(new Error('duplicate vuln_code'));
    const chat = vi.fn(async () => ({
      text: fence('atlas_vulnerabilities_diff', { additions: [{ vuln_code: 'V-1', name: 'dup', severity: 2, threat_path_codes: ['TP-1'] }] }),
      thinking: '', inputTokens: 1, outputTokens: 1, modelServed: 'm',
    }));
    const p = createAtlasProposals(db, { chat });
    const { proposals } = await p.generate('a1', 'vulnerabilities', 'u1');
    await expect(p.accept('a1', proposals[0].id, 'u1')).rejects.toThrow(/duplicate/);
    expect((await p.get('a1', proposals[0].id))).toMatchObject({ status: 'failed', error: expect.stringContaining('duplicate') });
  });

  it('a diff with no fenced block, and an unknown Atlas, are refused before anything is stored', async () => {
    const chat = vi.fn(async () => ({ text: 'I have no suggestions.', thinking: '', inputTokens: 1, outputTokens: 1 }));
    const p = createAtlasProposals(db, { chat });
    await expect(p.generate('a1', 'exposures', 'u1')).rejects.toThrow(/no `atlas_exposure_diff` block/);
    await expect(p.generate('nope', 'exposures', 'u1')).rejects.toThrow(/Atlas not found/);
    expect(rows.size).toBe(0);
  });
});

describe('stages and routes', () => {
  it('isProposalStage accepts only the six stages', () => {
    expect(Object.keys(STAGES)).toEqual(['exposures', 'threat_paths', 'vulnerabilities', 'inherent', 'controls', 'appetite']);
    expect(isProposalStage('controls')).toBe(true);
    expect(isProposalStage('residual')).toBe(false);   // stage 6 is deterministic — nothing to propose
    expect(isProposalStage('__proto__')).toBe(false);
  });

  it('every proposal route checks Atlas ownership first', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('server/routes/atlas.ts', 'utf8').replace(/\r\n/g, '\n');
    for (const route of ["router.post('/atlas/:id/proposals'", "router.get('/atlas/:id/proposals/job'", "router.get('/atlas/:id/proposals'",
      "router.post('/atlas/:id/proposals/:proposalId/accept'", "router.post('/atlas/:id/proposals/:proposalId/reject'", "router.post('/atlas/:id/proposals/accept'"]) {
      const at = src.indexOf(route);
      expect(at, route).toBeGreaterThan(-1);
      expect(src.slice(at, at + 400), route).toMatch(/if \(!\(await ensureAtlasAccess\(db, req as AuthedRequest, id, res\)\)\) return;/);
    }
  });
});
