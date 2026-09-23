/**
 * atlas-proposals.test.ts — AI suggestions for a Risk Atlas.
 *
 * The seven atlas-* prompts end in a fenced JSON diff that nothing ever read.
 * Now each diff becomes proposals a person accepts or rejects. The guarantees
 * that must hold whatever the model writes:
 *   - it never sets a score the calculator owns (inherent, residual, band);
 *   - it never invents a reference: an unknown TP-/V-/C- code is `unresolved`;
 *   - a change or removal of an existing record (v2, 2026-09-23) shows what it
 *     replaces, is decided on its own — never in bulk — and is refused if the
 *     record has changed since the suggestion was made.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AtlasExportSnapshot } from '../../../server/services/risk-atlas/atlas-export.js';
import type { ThreatPathFull } from '../../../server/services/risk-atlas/types.js';

const exposure = { id: 'ex-1', atlas_id: 'a1', name: 'Retail onboarding', description: null, category: 'customer_segment', source_pack_exposure_id: null, created_at: '', updated_at: '' };
const vuln = { id: 'v-1', atlas_id: 'a1', vuln_code: 'V-1', name: 'Weak eKYC', description: 'Selfie check only', severity: 3, source_pack_vuln_id: null, created_at: '', updated_at: '' };
const control = { id: 'c-1', atlas_id: 'a1', control_code: 'C-1', name: 'Manual review', description: null, type: 'detect', strength: 'adequate', evidence: null, owner_role: null, source_pack_control_id: null, created_at: '', updated_at: '' };
const path = { id: 'tp-1', atlas_id: 'a1', path_code: 'TP-1', name: 'Layering', description: null, source_pack_path_id: null, fcp_domain: 'amlcft', created_at: '', updated_at: '' };
const path2 = { id: 'tp-2', atlas_id: 'a1', path_code: 'TP-2', name: 'Sanctions evasion', description: null, source_pack_path_id: null, fcp_domain: 'sanctions', created_at: '', updated_at: '' };
// Not on any path: invisible in the export snapshot, present in the Atlas.
const looseExposure = { id: 'ex-2', atlas_id: 'a1', name: 'Crypto ATMs', description: null, category: 'channel', source_pack_exposure_id: null, created_at: '', updated_at: '' };

const snap: AtlasExportSnapshot = {
  atlas: { id: 'a1', name: 'Demo', description: null, project_id: null, business_description: 'An EU CASP.', industry_pack_id: 'fcp-casp', status: 'active', mode: 'expert', entity_id: null, owner_user_id: 'u1', created_by: 'u1', org_id: 'o1', last_review_at: null, next_review_due_at: null, created_at: '', updated_at: '' } as AtlasExportSnapshot['atlas'],
  dashboard: { paths_total: 2, paths_by_appetite: { within: 0, boundary: 0, outside: 1, unacceptable: 0 } } as AtlasExportSnapshot['dashboard'],
  paths: [{
    path: path as ThreatPathFull['path'],
    exposures: [exposure],
    vulnerabilities: [vuln],
    inherent: { id: 'i-1', threat_path_id: 'tp-1', exposure_score: 5, threat_score: 4, vulnerability_score: 3, inherent_score: 5 } as ThreatPathFull['inherent'],
    controls: [control as ThreatPathFull['controls'][number]],
    residual: { id: 'r-1', threat_path_id: 'tp-1', residual_score: 4, control_quality_rollup: 'adequate', open_vulnerability_notes: null, calculated_at: '' },
    appetite: null,
  }, {
    path: path2 as ThreatPathFull['path'],
    exposures: [], vulnerabilities: [], inherent: null, controls: [], residual: null,
    appetite: { id: 'ap-2', atlas_id: 'a1', threat_path_id: 'tp-2', appetite_position: 'boundary', required_action: 'Screen daily', target_date: '2026-12-31', budget_eur: '5000.00', approved_by: 'u9', approved_at: '2026-09-01T00:00:00Z', created_at: '', updated_at: '' } as ThreatPathFull['appetite'],
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
  listExposures: vi.fn(async () => [exposure, looseExposure]),
  listThreatPaths: vi.fn(async () => [path, path2]),
  listVulnerabilities: vi.fn(async () => [vuln]),
  listControls: vi.fn(async () => [control]),
  updateExposure: vi.fn(async () => ({ id: 'ex-1' })),
  updateThreatPath: vi.fn(async () => ({ id: 'tp-1' })),
  updateVulnerability: vi.fn(async () => ({ id: 'v-1' })),
  updateControl: vi.fn(async () => ({ id: 'c-1' })),
  removeExposure: vi.fn(async () => undefined),
  removeThreatPath: vi.fn(async () => undefined),
  removeVulnerability: vi.fn(async () => undefined),
  removeControl: vi.fn(async () => undefined),
};
const fcp = {
  listBundles: vi.fn(async () => [{ bundle_code: 'XB-1', name: 'Existing story', members: [{ threat_path_id: 'tp-1' }, { threat_path_id: 'tp-9' }] }]),
  createBundle: vi.fn(async () => ({ id: 7 })),
};
vi.mock('../../../server/services/risk-atlas/atlas-service.js', async (orig) => {
  const actual = await orig<typeof import('../../../server/services/risk-atlas/atlas-service.js')>();
  return { ...actual, createAtlasService: () => service };
});
vi.mock('../../../server/services/risk-atlas/atlas-fcp-scope-service.js', () => ({ createAtlasFcpScopeService: () => fcp }));
vi.mock('../../../server/services/risk-atlas/atlas-export.js', async (orig) => {
  const actual = await orig<typeof import('../../../server/services/risk-atlas/atlas-export.js')>();
  return { ...actual, createAtlasExport: () => ({ buildSnapshot: async (id: string) => (id === 'a1' ? snap : null) }) };
});
vi.mock('../../../server/services/risk-atlas/atlas-pack-loader.js', () => ({
  createAtlasPackLoader: () => ({ getPackContent: async () => ({ exposurePoints: [{ id: 'pk-e1', name: 'Pack exposure' }], threatPaths: [], vulnerabilities: [], controls: [] }) }),
}));

const mod = await import('../../../server/services/risk-atlas/atlas-proposals.js');
const { extractFencedJson, parseDiff, indexAtlas, resolveItem, buildStageFacts, createAtlasProposals, STAGES, isProposalStage, FIELD_RULES, proposalInstruction } = mod;
const { EDITABLE_FIELDS } = await import('../../../server/services/risk-atlas/atlas-service.js');

const inventory = { exposures: [exposure, looseExposure], paths: [path, path2], vulnerabilities: [vuln], controls: [control] } as unknown as Parameters<typeof indexAtlas>[1];
const idx = indexAtlas(snap, inventory);
const fence = (name: string, body: unknown) => `Prose first.\n\n\`\`\`${name}\n${JSON.stringify(body)}\n\`\`\`\n`;
const resolved = (stage: Parameters<typeof parseDiff>[0], diff: unknown) => parseDiff(stage, diff).map((i) => resolveItem(i, idx));

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
    expect(items).toEqual([expect.objectContaining({ kind: 'vulnerability', action: 'add', status: 'pending', rationale: 'Pack benchmark 4' })]);
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

  it('accepts "reason" on an addition, as on an edit', () => {
    // Live run 2026-09-23: v2 asks for a "reason" on edits and removals, and the
    // model put one on every addition too — all three additions failed `.strict()`.
    const [item] = parseDiff('exposures', { additions: [{ name: 'Mobile app onboarding', category: 'channel', reason: 'All customers onboard in the app' }] });
    expect(item).toMatchObject({ status: 'pending', rationale: 'All customers onboard in the app', payload: { name: 'Mobile app onboarding', category: 'channel' } });
  });

  it('a trigger keeps a source the table accepts; any other source is a note', () => {
    const [pack] = parseDiff('appetite', { escalation_triggers: [{ trigger_event: 'Sanctions hit', required_action: 'Freeze', source: 'pack' }] });
    expect(pack).toMatchObject({ status: 'pending', payload: { source: 'pack' }, rationale: null });
    const [free] = parseDiff('appetite', { escalation_triggers: [{ trigger_event: 'Sanctions hit', required_action: 'Freeze', source: 'pack-proposed' }] });
    expect(free.payload.source).toBeUndefined();
    expect(free.rationale).toBe('pack-proposed');
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
});

describe('parseDiff — changes and removals (v2)', () => {
  it('reads an edit and a removal as their own actions, with the reason as rationale', () => {
    const items = parseDiff('exposures', { edits: [{ id: 'ex-1', field: 'description', new_value: 'Online only', reason: 'No branches' }], removals: [{ id: 'ex-1', reason: 'gone' }] });
    expect(items).toEqual([
      expect.objectContaining({ kind: 'exposure', action: 'edit', status: 'pending', rationale: 'No branches', payload: expect.objectContaining({ field: 'description', new_value: 'Online only' }) }),
      expect.objectContaining({ kind: 'exposure', action: 'remove', status: 'pending', rationale: 'gone' }),
    ]);
  });

  it('refuses a field the calculator sets, and names the ones that can change', () => {
    const [item] = parseDiff('controls', { edits: [{ code: 'C-1', field: 'residual_score', new_value: 1 }] });
    expect(item).toMatchObject({ status: 'failed', error: expect.stringMatching(/"residual_score" cannot be changed from a suggestion — the calculator sets it\. Changeable: name, description, type, strength, evidence, owner_role/) });
  });

  it('refuses a code, and a value outside its field\'s rules', () => {
    expect(parseDiff('vulnerabilities', { edits: [{ code: 'V-1', field: 'vuln_code', new_value: 'V-9' }] })[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('"vuln_code" cannot be changed') });
    expect(parseDiff('vulnerabilities', { edits: [{ code: 'V-1', field: 'severity', new_value: 9 }] })[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('new_value') });
    expect(parseDiff('controls', { edits: [{ code: 'C-1', field: 'strength', new_value: 'excellent' }] })[0]).toMatchObject({ status: 'failed' });
  });

  it('stages without edits (4, 7) ignore an edits key rather than invent a target kind', () => {
    expect(parseDiff('inherent', { scores: [], edits: [{ id: 'x', field: 'name', new_value: 'y' }] })).toEqual([]);
  });

  it('the field rules and the service agree on what is editable', () => {
    for (const kind of Object.keys(EDITABLE_FIELDS) as Array<keyof typeof EDITABLE_FIELDS>) {
      expect(Object.keys(FIELD_RULES[kind]).sort()).toEqual([...EDITABLE_FIELDS[kind]].sort());
    }
  });

  it('reads cross-domain bundles from the threat-path diff instead of dropping them', () => {
    const items = parseDiff('threat_paths', { additions: [], cross_domain_bundles: [{ name: 'Mule network', primary_domain: 'amlcft', member_path_codes: ['TP-1', 'TP-2'] }] });
    expect(items).toEqual([expect.objectContaining({ kind: 'bundle', action: 'add', status: 'pending' })]);
  });
});

describe('resolveItem — references come from the Atlas, never invented', () => {
  it('turns a path code into its id', () => {
    const [r] = resolved('inherent', { scores: [{ threat_path_code: 'tp-2', exposure_score: 3, threat_score: 3, vulnerability_score: 3 }] });
    expect(r.status).toBe('pending');
    expect(r.action).toBe('add');
    expect(r.payload).toMatchObject({ threat_path_id: 'tp-2' });
    expect(r.payload.threat_path_code).toBeUndefined();
  });

  it('marks an unknown path unresolved, with the reason', () => {
    const [r] = resolved('inherent', { scores: [{ threat_path_code: 'TP-99', exposure_score: 3, threat_score: 3, vulnerability_score: 3 }] });
    expect(r).toMatchObject({ status: 'unresolved', error: expect.stringContaining('TP-99') });
  });

  it('a control with no resolvable vulnerability is unresolved; a partly-known one keeps the good links and says so', () => {
    const [bad] = resolved('controls', { additions: [{ control_code: 'C-9', name: 'x', type: 'detect', strength: 'weak', vulnerability_links: [{ vulnerability_code: 'V-77', type: 'detect' }] }] });
    expect(bad).toMatchObject({ status: 'unresolved' });
    const [r] = resolved('controls', { additions: [{ control_code: 'C-8', name: 'x', type: 'detect', strength: 'weak', vulnerability_links: [{ vulnerability_code: 'V-1', type: 'detect' }, { vulnerability_code: 'V-77', type: 'detect' }] }] });
    expect(r.status).toBe('pending');
    expect(r.payload.vulnerability_links).toEqual([{ vulnerability_id: 'v-1', type: 'detect' }]);
    expect(r.rationale).toMatch(/Unknown vulnerabilities left off: V-77/);
  });

  it('a threat path keeps known exposures — including ones on no path yet — and notes the unknown ones', () => {
    // Before v2 the index came from the snapshot only, so "Crypto ATMs" (accepted
    // at Stage 1, on no path yet) was dropped as "not in this Atlas".
    const [r] = resolved('threat_paths', { additions: [{ path_code: 'TP-3', name: 'Mules', exposure_names: ['Retail onboarding', 'Crypto ATMs', 'Nope'] }] });
    expect(r.payload.exposure_ids).toEqual(['ex-1', 'ex-2']);
    expect(r.rationale).toMatch(/left off: Nope/);
  });

  it('an addition already in the Atlas is set aside, not duplicated', () => {
    expect(resolved('exposures', { additions: [{ name: 'retail onboarding' }] })[0]).toMatchObject({ status: 'skipped', error: expect.stringContaining('already in the Atlas') });
    expect(resolved('threat_paths', { additions: [{ path_code: 'TP-2', name: 'Other' }] })[0]).toMatchObject({ status: 'skipped' });
    expect(resolved('vulnerabilities', { additions: [{ vuln_code: 'V-1', name: 'x', severity: 2, threat_path_codes: ['TP-1'] }] })[0]).toMatchObject({ status: 'skipped' });
  });
});

describe('resolveItem — changes and removals (v2)', () => {
  it('finds the row by id, by code, or (exposures) by name, and records the value it replaces', () => {
    const [byCode] = resolved('vulnerabilities', { edits: [{ code: 'v-1', field: 'severity', new_value: 4, reason: 'Pack benchmark' }] });
    expect(byCode).toMatchObject({ status: 'pending', action: 'edit', payload: { target_id: 'v-1', target_label: 'V-1 Weak eKYC', field: 'severity', before: 3, new_value: 4 } });
    const [byName] = resolved('exposures', { edits: [{ name: 'Crypto ATMs', field: 'category', new_value: 'product' }] });
    expect(byName.payload).toMatchObject({ target_id: 'ex-2', before: 'channel', new_value: 'product' });
    const [byId] = resolved('controls', { edits: [{ id: 'c-1', field: 'owner_role', new_value: 'MLRO' }] });
    expect(byId.payload).toMatchObject({ target_id: 'c-1', before: null, new_value: 'MLRO' });
  });

  it('an unknown target is unresolved; a change to the value it already has is set aside', () => {
    expect(resolved('vulnerabilities', { edits: [{ code: 'V-42', field: 'severity', new_value: 4 }] })[0]).toMatchObject({ status: 'unresolved', error: expect.stringContaining('V-42') });
    expect(resolved('vulnerabilities', { edits: [{ code: 'V-1', field: 'severity', new_value: 3 }] })[0]).toMatchObject({ status: 'skipped', error: expect.stringContaining('already has this severity') });
  });

  it('a control is rated strong only with recorded evidence', () => {
    expect(resolved('controls', { edits: [{ code: 'C-1', field: 'strength', new_value: 'strong' }] })[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('evidence') });
  });

  it('a removal says what it takes with it', () => {
    const [r] = resolved('vulnerabilities', { removals: [{ code: 'V-1', reason: 'eKYC replaced' }] });
    expect(r).toMatchObject({ status: 'pending', action: 'remove', payload: { target_id: 'v-1', target_label: 'V-1 Weak eKYC' } });
    expect(r.payload.impact).toMatch(/comes off TP-1.*residual of TP-1 is recalculated/);
  });

  it('new scores for an already-scored path are a change, with the scores they replace', () => {
    const [r] = resolved('inherent', { scores: [{ threat_path_code: 'TP-1', exposure_score: 4, threat_score: 4, vulnerability_score: 3 }] });
    expect(r).toMatchObject({ status: 'pending', action: 'edit', payload: { threat_path_id: 'tp-1', before: { exposure_score: 5, threat_score: 4, vulnerability_score: 3 } } });
    expect(resolved('inherent', { scores: [{ threat_path_code: 'TP-1', exposure_score: 5, threat_score: 4, vulnerability_score: 3 }] })[0]).toMatchObject({ status: 'skipped' });
  });

  it('a new statement for a path that has one is a change; what it leaves out keeps its recorded value', () => {
    const [r] = resolved('appetite', { statements: [{ threat_path_code: 'TP-2', appetite_position: 'boundary', required_action: 'Screen in real time' }] });
    expect(r.action).toBe('edit');
    expect(r.payload).toMatchObject({ required_action: 'Screen in real time', target_date: '2026-12-31', budget_eur: 5000 });
    expect(r.payload.before).toMatchObject({ required_action: 'Screen daily', approved: true });
    // Same content (the NUMERIC budget comes back as a string) → nothing to change.
    expect(resolved('appetite', { statements: [{ threat_path_code: 'TP-2', appetite_position: 'boundary', required_action: 'Screen daily', target_date: '2026-12-31', budget_eur: 5000 }] })[0]).toMatchObject({ status: 'skipped' });
  });

  it('a date the change leaves out is written back on the same day, east of UTC too', () => {
    // node-postgres hands a DATE back as local midnight. Before isoDay read the
    // local day, accepting this change on a UTC+2 server moved the target date
    // one day earlier (found live 2026-09-23).
    const saved = process.env.TZ;
    process.env.TZ = 'Europe/Stockholm';
    try {
      const withDate = { ...snap, paths: snap.paths.map((p) => (p.appetite ? { ...p, appetite: { ...p.appetite, target_date: new Date(2026, 11, 31) as unknown as string } } : p)) };
      const [r] = parseDiff('appetite', { statements: [{ threat_path_code: 'TP-2', appetite_position: 'boundary', required_action: 'Screen in real time' }] })
        .map((i) => resolveItem(i, indexAtlas(withDate, inventory)));
      expect(r.payload.target_date).toBe('2026-12-31');
      expect((r.payload.before as Record<string, unknown>).target_date).toBe('2026-12-31');
    } finally {
      if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved;
    }
  });

  it('an appetite for a path with no residual: the recorded position stands, and with none recorded it waits for a score', () => {
    // TP-2 has no residual and a recorded "boundary" statement.
    const [kept] = resolved('appetite', { statements: [{ threat_path_code: 'TP-2', appetite_position: 'within', required_action: 'Screen in real time' }] });
    expect(kept.payload.appetite_position).toBe('boundary');
    expect(kept.rationale).toMatch(/Position kept at "boundary": TP-2 Sanctions evasion has no residual yet \(the model proposed "within"\)/);
    const bare = indexAtlas({ ...snap, paths: [{ ...snap.paths[1], appetite: null }] }, inventory);
    const [waits] = parseDiff('appetite', { statements: [{ threat_path_code: 'TP-2', appetite_position: 'within' }] }).map((i) => resolveItem(i, bare));
    expect(waits).toMatchObject({ status: 'skipped', error: expect.stringContaining('has no residual yet — score it first') });
  });

  it('a name two exposures share cannot pick a row', () => {
    const twin = { ...looseExposure, id: 'ex-3', name: 'Retail onboarding' };
    const twins = indexAtlas(snap, { ...inventory, exposures: [exposure, looseExposure, twin] } as typeof inventory);
    const [r] = parseDiff('exposures', { edits: [{ name: 'Retail onboarding', field: 'category', new_value: 'channel' }] }).map((i) => resolveItem(i, twins));
    expect(r).toMatchObject({ status: 'unresolved', error: expect.stringContaining('More than one exposure is named "Retail onboarding"') });
  });

  it('a strong control without recorded evidence refuses any change until the evidence is recorded', () => {
    const strong = { ...control, strength: 'strong', evidence: null };
    const withStrong = indexAtlas(snap, { ...inventory, controls: [strong] } as typeof inventory);
    const [rename] = parseDiff('controls', { edits: [{ code: 'C-1', field: 'name', new_value: 'Four-eyes review' }] }).map((i) => resolveItem(i, withStrong));
    expect(rename).toMatchObject({ status: 'failed', error: expect.stringContaining('rated strong without recorded evidence') });
    const [lower] = parseDiff('controls', { edits: [{ code: 'C-1', field: 'strength', new_value: 'adequate' }] }).map((i) => resolveItem(i, withStrong));
    expect(lower.status).toBe('pending');
  });

  it('a vulnerability names the unknown path ids it left off', () => {
    const [r] = resolved('vulnerabilities', { additions: [{ vuln_code: 'V-6', name: 'x', severity: 2, threat_path_ids: ['tp-1', 'tp-bogus'] }] });
    expect(r.rationale).toMatch(/Unknown paths left off: tp-bogus/);
    const [none] = resolved('vulnerabilities', { additions: [{ vuln_code: 'V-7', name: 'x', severity: 2, threat_path_ids: ['tp-bogus'] }] });
    expect(none.error).toContain('tp-bogus');
  });

  it('a bundle that repeats an existing one — same paths or same name — is set aside', () => {
    const withBundle = indexAtlas(snap, inventory, [{ bundle_code: 'XB-1', name: 'Mule network', members: [{ threat_path_id: 'tp-1' }, { threat_path_id: 'tp-2' }] }]);
    const run = (b: unknown) => parseDiff('threat_paths', { cross_domain_bundles: [b] }).map((i) => resolveItem(i, withBundle))[0];
    expect(run({ name: 'Another story', member_path_codes: ['TP-2', 'TP-1'] })).toMatchObject({ status: 'skipped', error: expect.stringContaining('XB-1 already groups TP-1, TP-2') });
    expect(run({ name: 'mule network', member_path_codes: ['TP-1', 'TP-2'] })).toMatchObject({ status: 'skipped' });
    expect(buildStageFacts('threat_paths', snap, null, inventory, [{ bundle_code: 'XB-1', name: 'Mule network', members: [{ threat_path_id: 'tp-1' }, { threat_path_id: 'tp-2' }] }])).toContain('- XB-1 mule network · TP-1, TP-2');
  });

  it('a bundle needs two paths already in the Atlas', () => {
    const [ok] = resolved('threat_paths', { cross_domain_bundles: [{ name: 'Mule network', primary_domain: 'amlcft', member_path_codes: ['TP-1', 'TP-2', 'TP-7'] }] });
    expect(ok).toMatchObject({ status: 'pending', payload: { member_path_ids: ['tp-1', 'tp-2'], member_path_codes: ['TP-1', 'TP-2'] } });
    expect(ok.rationale).toMatch(/left out of the bundle: TP-7/);
    const [bad] = resolved('threat_paths', { cross_domain_bundles: [{ name: 'X', member_path_codes: ['TP-1', 'TP-7'] }] });
    expect(bad).toMatchObject({ status: 'unresolved', error: expect.stringContaining('two paths') });
  });
});

describe('appetite — the band follows the residual, not the model', () => {
  it('replaces a position that contradicts the stored residual, and says so', () => {
    const [r] = resolved('appetite', { statements: [{ threat_path_code: 'TP-1', appetite_position: 'within', required_action: 'Nothing to do' }] });
    expect(r.payload.appetite_position).toBe('outside');           // residual 4
    expect(r.rationale).toMatch(/from the Atlas residual 4 \(the model proposed "within"\)/);
  });

  it('leaves a position that agrees', () => {
    const [r] = resolved('appetite', { statements: [{ threat_path_code: 'TP-1', appetite_position: 'outside' }] });
    expect(r.payload.appetite_position).toBe('outside');
    expect(r.rationale).toBeNull();
  });
});

describe('buildStageFacts', () => {
  it('shows every row the Atlas holds, with ids, and the pack catalogue', () => {
    const facts = buildStageFacts('vulnerabilities', snap, { exposurePoints: [{ id: 'pk-e1', name: 'Pack exposure' }], threatPaths: [], vulnerabilities: [], controls: [] }, inventory);
    expect(facts).toContain('- TP-1 [tp-1] Layering · amlcft');
    expect(facts).toContain('- V-1 [v-1] Weak eKYC (severity 3) · on TP-1 — Selfie check only');
    expect(facts).toContain('- C-1 [c-1] Manual review (detect, adequate) · evidence not recorded');
    expect(facts).toContain('- [ex-2] Crypto ATMs · channel · not on a threat path');
    expect(facts).toContain('Pack exposure [pk-e1]');
    expect(facts).toContain('An EU CASP.');
  });
  it('adds the score table for the stages that need it', () => {
    expect(buildStageFacts('inherent', snap, null, inventory)).toContain('| TP-1 | Layering | 5 | 4 | 3 | 5 | adequate | 4 | none | — | — |');
    expect(buildStageFacts('exposures', snap, null, inventory)).not.toContain('| Path | Name |');
  });
  it('tells an editable stage how to propose a change and a removal', () => {
    expect(proposalInstruction('controls')).toMatch(/"field": "<one of: name, description, type, strength, evidence, owner_role>"/);
    expect(proposalInstruction('controls')).toContain('under "removals"');
    expect(proposalInstruction('inherent')).not.toContain('under "removals"');
    expect(proposalInstruction('threat_paths')).toContain('cross_domain_bundles');
  });
});

describe('generate + accept/reject', () => {
  let rows: Map<string, Record<string, unknown>>;
  // What the Atlas holds now — read by the stale-change guard at acceptance.
  let atlasRows: Record<string, Record<string, Record<string, unknown>>>;
  let inherentNow: Record<string, unknown> | undefined;
  let residualNow: Record<string, { residual_score: number }>;
  let appetiteNow: Record<string, Record<string, unknown>>;
  const lc = (s: unknown) => String(s ?? '').trim().toLowerCase();
  const db = {
    async run(sql: string, ...p: unknown[]) {
      if (sql.startsWith('INSERT INTO atlas_proposals ')) {
        rows.set(String(p[0]), { id: p[0], set_id: p[1], atlas_id: p[2], kind: p[3], action: p[4], payload: p[5], rationale: p[6], status: p[7], error: p[8], applied_ref_id: null, decided_by: null, decided_at: null, created_at: '2026-09-22T10:00:00.000Z' });
      } else if (sql.startsWith('UPDATE atlas_proposals SET')) {
        // Every proposal UPDATE ends "WHERE id = ? AND atlas_id = ?[ AND status = 'pending']".
        const row = rows.get(String(p[p.length - 2]));
        if (!row || row.atlas_id !== p[p.length - 1]) return { changes: 0, lastInsertRowid: 0 };
        if (/status = 'pending'\s*$/.test(sql) && row.status !== 'pending') return { changes: 0, lastInsertRowid: 0 };
        const set = /SET status = '(\w+)'/.exec(sql)?.[1];
        if (set) row.status = set;
        if (/applied_ref_id = \?/.test(sql)) row.applied_ref_id = p[0];
        if (/error = \?/.test(sql)) row.error = p[0];
      }
      return { changes: 1, lastInsertRowid: 0 };
    },
    async get(sql: string, ...p: unknown[]) {
      if (sql.includes('FROM atlas_proposals')) { const r = rows.get(String(p[0])); return r && r.atlas_id === p[1] ? r : undefined; }
      if (sql.includes('FROM atlas_inherent_scores')) return inherentNow;
      if (sql.includes('FROM atlas_residual_scores')) return residualNow[String(p[0])];
      if (sql.includes('FROM atlas_appetite_statements')) return appetiteNow[String(p[1])];
      const table = /FROM (atlas_\w+)/.exec(sql)?.[1] ?? '';
      const byText = /LOWER\(TRIM\((\w+)\)\) = \?/.exec(sql);
      if (byText) return Object.values(atlasRows[table] ?? {}).find((r) => lc(r[byText[1]]) === p[1]);
      return atlasRows[table]?.[String(p[0])];
    },
    async all(sql: string, ...p: unknown[]) {
      const own = /^SELECT id FROM (atlas_\w+) WHERE atlas_id = \? AND id IN/.exec(sql);
      if (own) return (p.slice(1) as string[]).filter((id) => atlasRows[own[1]]?.[id]).map((id) => ({ id }));
      return [...rows.values()];
    },
  } as unknown as import('../../../server/db/database.js').DatabaseAdapter;

  beforeEach(() => {
    rows = new Map();
    atlasRows = {
      atlas_vulnerabilities: { 'v-1': { ...vuln } },
      atlas_exposure_points: { 'ex-1': { ...exposure }, 'ex-2': { ...looseExposure } },
      atlas_controls: { 'c-1': { ...control } },
      atlas_threat_paths: { 'tp-1': { ...path }, 'tp-2': { ...path2 } },
    };
    inherentNow = undefined;
    residualNow = { 'tp-1': { residual_score: 4 } };
    appetiteNow = { 'tp-2': { ...snap.paths[1].appetite! } };
    vi.clearAllMocks();
  });
  const chatReturning = (text: string) => vi.fn(async () => ({ text, thinking: '', inputTokens: 1, outputTokens: 1, modelServed: 'claude-opus-5' }));

  it('sends the stage module prompt in proposal mode and stores what came back', async () => {
    const chat = chatReturning(fence('atlas_vulnerabilities_diff', {
      additions: [
        { vuln_code: 'V-2', name: 'No callback verification', severity: 4, threat_path_codes: ['TP-1'], severity_rationale: 'benchmark' },
        { vuln_code: 'V-3', name: 'Ghost path', severity: 2, threat_path_codes: ['TP-42'] },
      ],
      removals: [{ id: 'v-1', reason: 'no longer relevant' }],
    }));
    const { proposals } = await createAtlasProposals(db, { chat }).generate('a1', 'vulnerabilities', 'u1');

    const cfg = chat.mock.calls[0][0] as { system: string; purpose: string; messages: Array<{ content: string }> };
    expect(cfg.system).toContain('## Proposal mode — this run');
    expect(cfg.system).toContain('atlas_vulnerabilities_diff');
    expect(cfg.purpose).toBe('atlas_proposals');
    expect(cfg.messages[0].content).toContain('TP-1 [tp-1] Layering');
    // The facts come from the whole Atlas, not only rows on a path.
    expect(cfg.messages[0].content).toContain('Crypto ATMs');

    expect(proposals.map((p) => [p.action, p.status])).toEqual([['add', 'pending'], ['add', 'unresolved'], ['remove', 'pending']]);
    expect(rows.get(proposals[2].id)).toMatchObject({ action: 'remove' });
  });

  it('resolves against the whole Atlas: an exposure on no path yet is linked, not dropped', async () => {
    const chat = chatReturning(fence('atlas_threat_paths_diff', { additions: [{ path_code: 'TP-3', name: 'ATM cash-out', exposure_names: ['Crypto ATMs'] }] }));
    const { proposals } = await createAtlasProposals(db, { chat }).generate('a1', 'threat_paths', 'u1');
    expect(proposals[0]).toMatchObject({ status: 'pending', payload: { exposure_ids: ['ex-2'] } });
    expect(proposals[0].rationale).toBeNull();
  });

  it('accepting applies through atlas-service and records the new row; rejecting writes nothing', async () => {
    const chat = chatReturning(fence('atlas_vulnerabilities_diff', { additions: [{ vuln_code: 'V-2', name: 'No callback verification', severity: 4, threat_path_codes: ['TP-1'] }] }));
    const p = createAtlasProposals(db, { chat });
    const { proposals } = await p.generate('a1', 'vulnerabilities', 'u1');
    const accepted = await p.accept('a1', proposals[0].id, 'u1');
    if (!accepted.ok) throw new Error(accepted.reason);

    expect(service.addVulnerability).toHaveBeenCalledWith('a1', expect.objectContaining({ vuln_code: 'V-2', severity: 4, threat_path_ids: ['tp-1'] }), 'u1', expect.objectContaining({ source: 'ai_suggestion' }));
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
    const chat = chatReturning(fence('atlas_inherent_scores_diff', { scores: [{ threat_path_code: 'TP-2', exposure_score: 5, threat_score: 4, vulnerability_score: 3, rationale: 'why' }] }));
    const p = createAtlasProposals(db, { chat });
    const { proposals } = await p.generate('a1', 'inherent', 'u1');
    await p.accept('a1', proposals[0].id, 'u1');
    expect(service.scoreInherent).toHaveBeenCalledWith('a1', 'tp-2', { exposure: 5, threat: 4, vulnerability: 3, rationale: 'why' }, 'u1', expect.objectContaining({ source: 'ai_suggestion' }));
  });

  it('scores for a path someone has scored since the suggestion are refused, not written over', async () => {
    const chat = chatReturning(fence('atlas_inherent_scores_diff', { scores: [{ threat_path_code: 'TP-2', exposure_score: 5, threat_score: 4, vulnerability_score: 3 }] }));
    const p = createAtlasProposals(db, { chat });
    const { proposals } = await p.generate('a1', 'inherent', 'u1');
    inherentNow = { exposure_score: 2, threat_score: 2, vulnerability_score: 2 };
    expect(await p.accept('a1', proposals[0].id, 'u1')).toEqual({ ok: false, reason: expect.stringContaining('scored since') });
    expect(service.scoreInherent).not.toHaveBeenCalled();
    expect(rows.get(proposals[0].id)).toMatchObject({ status: 'skipped' });
  });

  it('a control is added with its resolved links, and says where it came from (addControl rescores the paths)', async () => {
    const chat = chatReturning(fence('atlas_controls_diff', { additions: [{ control_code: 'C-2', name: 'Callback check', type: 'prevent', strength: 'strong', evidence: 'Tested Q3', vulnerability_links: [{ vulnerability_code: 'V-1', type: 'prevent' }] }] }));
    const p = createAtlasProposals(db, { chat });
    const { proposals } = await p.generate('a1', 'controls', 'u1');
    await p.accept('a1', proposals[0].id, 'u1');
    expect(service.addControl).toHaveBeenCalledWith('a1', expect.objectContaining({ control_code: 'C-2', vulnerability_links: [{ vulnerability_id: 'v-1', type: 'prevent' }] }), 'u1', expect.objectContaining({ source: 'ai_suggestion' }));
  });

  it('a change is applied through the update call, one field, with where it came from', async () => {
    const chat = chatReturning(fence('atlas_vulnerabilities_diff', { edits: [{ code: 'V-1', field: 'severity', new_value: 4, reason: 'Pack benchmark' }] }));
    const p = createAtlasProposals(db, { chat });
    const { proposals } = await p.generate('a1', 'vulnerabilities', 'u1');
    const res = await p.accept('a1', proposals[0].id, 'u1');
    expect(res).toMatchObject({ ok: true, proposal: { status: 'accepted', applied_ref_id: 'v-1' } });
    expect(service.updateVulnerability).toHaveBeenCalledWith('a1', 'v-1', { severity: 4 }, 'u1', { source: 'ai_suggestion', proposal_id: proposals[0].id, reason: 'Pack benchmark' });
  });

  it('a change whose record has moved on is refused and set aside — the reviewer never saw the new value', async () => {
    const chat = chatReturning(fence('atlas_vulnerabilities_diff', { edits: [{ code: 'V-1', field: 'severity', new_value: 4 }] }));
    const p = createAtlasProposals(db, { chat });
    const { proposals } = await p.generate('a1', 'vulnerabilities', 'u1');
    atlasRows.atlas_vulnerabilities['v-1'].severity = 5;      // someone changed it by hand
    expect(await p.accept('a1', proposals[0].id, 'u1')).toEqual({ ok: false, reason: expect.stringContaining('has changed since this suggestion was made') });
    expect(service.updateVulnerability).not.toHaveBeenCalled();
    expect(rows.get(proposals[0].id)).toMatchObject({ status: 'skipped' });
  });

  it('a removal is applied through the remove call; a row already gone is refused', async () => {
    const chat = chatReturning(fence('atlas_exposure_diff', { removals: [{ id: 'ex-1', reason: 'No retail' }] }));
    const p = createAtlasProposals(db, { chat });
    const { proposals } = await p.generate('a1', 'exposures', 'u1');
    await p.accept('a1', proposals[0].id, 'u1');
    expect(service.removeExposure).toHaveBeenCalledWith('a1', 'ex-1', 'u1', expect.objectContaining({ source: 'ai_suggestion' }));

    const { proposals: again } = await p.generate('a1', 'exposures', 'u1');
    delete atlasRows.atlas_exposure_points['ex-1'];
    expect(await p.accept('a1', again[0].id, 'u1')).toEqual({ ok: false, reason: expect.stringContaining('no longer in the Atlas') });
    expect(service.removeExposure).toHaveBeenCalledTimes(1);
  });

  // ── The stale-change guard, extended after the 2026-09-23 review ─────────

  it('an appetite suggestion is refused when the residual has moved since (the band would be stale)', async () => {
    const chat = chatReturning(fence('atlas_appetite_diff', { statements: [{ threat_path_code: 'TP-1', appetite_position: 'outside', required_action: 'Fix' }] }));
    const p = createAtlasProposals(db, { chat });
    const { proposals } = await p.generate('a1', 'appetite', 'u1');
    residualNow['tp-1'] = { residual_score: 2 };                // a control was added since
    expect(await p.accept('a1', proposals[0].id, 'u1')).toEqual({ ok: false, reason: expect.stringContaining('The residual of TP-1 Layering has changed') });
    expect(service.upsertAppetite).not.toHaveBeenCalled();
  });

  it('an appetite change is refused when the statement was approved (or un-approved) since', async () => {
    const chat = chatReturning(fence('atlas_appetite_diff', { statements: [{ threat_path_code: 'TP-2', appetite_position: 'boundary', required_action: 'Screen in real time' }] }));
    const p = createAtlasProposals(db, { chat });
    const { proposals } = await p.generate('a1', 'appetite', 'u1');
    appetiteNow['tp-2'] = { ...appetiteNow['tp-2'], approved_at: null, approved_by: null };
    expect(await p.accept('a1', proposals[0].id, 'u1')).toEqual({ ok: false, reason: expect.stringContaining('The approval of the appetite statement of TP-2') });
  });

  it('a removal is refused when the row, or what removing it takes with it, has changed since', async () => {
    const chat = chatReturning(fence('atlas_vulnerabilities_diff', { removals: [{ code: 'V-1', reason: 'replaced' }] }));
    const p = createAtlasProposals(db, { chat });
    const first = (await p.generate('a1', 'vulnerabilities', 'u1')).proposals[0];
    atlasRows.atlas_vulnerabilities['v-1'].severity = 5;
    expect(await p.accept('a1', first.id, 'u1')).toEqual({ ok: false, reason: expect.stringContaining('V-1 Weak eKYC has changed since') });

    atlasRows.atlas_vulnerabilities['v-1'].severity = 3;
    const second = (await p.generate('a1', 'vulnerabilities', 'u1')).proposals[0];
    const saved = snap.paths[0].vulnerabilities;
    snap.paths[0].vulnerabilities = [];                        // V-1 taken off TP-1 since
    try {
      expect(await p.accept('a1', second.id, 'u1')).toEqual({ ok: false, reason: expect.stringContaining('What removing V-1 Weak eKYC takes with it has changed') });
    } finally { snap.paths[0].vulnerabilities = saved; }
    expect(service.removeVulnerability).not.toHaveBeenCalled();
  });

  it('an addition is refused when a row it links to has gone, or its code has been taken, since', async () => {
    const chat = chatReturning(fence('atlas_threat_paths_diff', { additions: [{ path_code: 'TP-3', name: 'ATM cash-out', exposure_names: ['Crypto ATMs'] }] }));
    const p = createAtlasProposals(db, { chat });
    const a = (await p.generate('a1', 'threat_paths', 'u1')).proposals[0];
    delete atlasRows.atlas_exposure_points['ex-2'];
    expect(await p.accept('a1', a.id, 'u1')).toEqual({ ok: false, reason: 'An exposure this path links to is no longer in the Atlas — ask again.' });

    const chat2 = chatReturning(fence('atlas_vulnerabilities_diff', { additions: [{ vuln_code: 'V-2', name: 'No callback', severity: 3, threat_path_codes: ['TP-1'] }] }));
    const p2 = createAtlasProposals(db, { chat: chat2 });
    const b = (await p2.generate('a1', 'vulnerabilities', 'u1')).proposals[0];
    atlasRows.atlas_vulnerabilities['v-2'] = { id: 'v-2', atlas_id: 'a1', vuln_code: 'V-2' };
    expect(await p2.accept('a1', b.id, 'u1')).toEqual({ ok: false, reason: 'V-2 has been added since this suggestion was made.' });
    expect(service.addThreatPath).not.toHaveBeenCalled();
    expect(service.addVulnerability).not.toHaveBeenCalled();
  });

  it('two acceptances of the same suggestion at once apply it once', async () => {
    const chat = chatReturning(fence('atlas_exposure_diff', { additions: [{ name: 'Custody' }] }));
    const p = createAtlasProposals(db, { chat });
    const { proposals } = await p.generate('a1', 'exposures', 'u1');
    const results = await Promise.all([p.accept('a1', proposals[0].id, 'u1'), p.accept('a1', proposals[0].id, 'u2')]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, reason: 'This suggestion is already accepted.' });
    expect(service.addExposure).toHaveBeenCalledTimes(1);
  });

  it('changes and removals are never accepted in bulk', async () => {
    const chat = chatReturning(fence('atlas_exposure_diff', {
      additions: [{ name: 'Custody' }],
      edits: [{ id: 'ex-1', field: 'description', new_value: 'Online only' }],
      removals: [{ id: 'ex-1', reason: 'No retail' }],
    }));
    const p = createAtlasProposals(db, { chat });
    const { proposals } = await p.generate('a1', 'exposures', 'u1');
    const results = await Promise.all(proposals.map((x) => p.accept('a1', x.id, 'u1', { bulk: true })));
    expect(results.map((r) => r.ok)).toEqual([true, false, false]);
    expect(results[1]).toEqual({ ok: false, reason: 'Changes and removals are decided one at a time.' });
    expect(service.updateExposure).not.toHaveBeenCalled();
    expect(service.removeExposure).not.toHaveBeenCalled();
  });

  it('a bundle is created with the next free code and the resolved paths', async () => {
    const chat = chatReturning(fence('atlas_threat_paths_diff', { cross_domain_bundles: [{ name: 'Mule network', primary_domain: 'amlcft', member_path_codes: ['TP-1', 'TP-2'] }] }));
    const p = createAtlasProposals(db, { chat });
    const { proposals } = await p.generate('a1', 'threat_paths', 'u1');
    await p.accept('a1', proposals[0].id, 'u1');
    expect(fcp.createBundle).toHaveBeenCalledWith('a1', expect.objectContaining({ bundle_code: 'XB-2', name: 'Mule network', member_path_ids: ['tp-1', 'tp-2'] }), 'u1', expect.objectContaining({ source: 'ai_suggestion' }));
  });

  it('a failure while applying is recorded on the suggestion and raised', async () => {
    service.addVulnerability.mockRejectedValueOnce(new Error('duplicate vuln_code'));
    const chat = chatReturning(fence('atlas_vulnerabilities_diff', { additions: [{ vuln_code: 'V-5', name: 'dup', severity: 2, threat_path_codes: ['TP-1'] }] }));
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

  it('every proposal route checks Atlas ownership first, and bulk accept asks for additions only', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('server/routes/atlas.ts', 'utf8').replace(/\r\n/g, '\n');
    for (const route of ["router.post('/atlas/:id/proposals'", "router.get('/atlas/:id/proposals/job'", "router.get('/atlas/:id/proposals'",
      "router.post('/atlas/:id/proposals/:proposalId/accept'", "router.post('/atlas/:id/proposals/:proposalId/reject'", "router.post('/atlas/:id/proposals/accept'"]) {
      const at = src.indexOf(route);
      expect(at, route).toBeGreaterThan(-1);
      expect(src.slice(at, at + 400), route).toMatch(/if \(!\(await ensureAtlasAccess\(db, req as AuthedRequest, id, res\)\)\) return;/);
    }
    const bulk = src.indexOf("router.post('/atlas/:id/proposals/accept'");
    expect(src.slice(bulk, bulk + 1200)).toContain('proposals_.accept(id, pid, userId, { bulk: true })');
  });
});
