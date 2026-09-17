/**
 * prompt-builder-atom-layer.test.ts — the read side of memory: inject only
 * when it earns its place (Wave 4 track B).
 *
 * The 09-13 FCP run on this instance received five March/May open-chat
 * boilerplate atoms ("Claude is ready to provide analytical assistance…") at
 * RRF 0.012–0.016, labelled "supporting evidence". Rules locked here:
 *
 *   - the gate decides: auto below the thresholds → the general block is not
 *     built at all (hybridSearch is not even called); the Coding Studio
 *     lessons block is never gated;
 *   - when it applies: no status.* atoms, no atom older than 180 days without
 *     a positive rating, team mode keeps only own + unowned atoms, five at
 *     most, and each injected atom is written to retrieval_feedback with the
 *     message id;
 *   - the block says what it is (memory, not evidence) and tells the model
 *     not to cite it.
 *
 * hybridSearch is mocked the way prompt-builder-scoped-layers.test.ts does it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import type { HybridSearchResult } from '../../server/services/hybrid-search.js';

vi.mock('../../server/services/hybrid-search.js', () => ({
  hybridSearch: vi.fn(),
  embedAndStore: vi.fn(),
  findSimilar: vi.fn(),
  INSTANCE_WIDE_SEARCH: { kind: 'instance' },
  NO_OWNED_CONTENT: { kind: 'none' },
  searchScopeForRequest: vi.fn(() => ({ kind: 'instance' })),
}));

import { hybridSearch } from '../../server/services/hybrid-search.js';
import {
  buildAtomLayer,
  buildAtomLayerDetailed,
  ATOM_LAYER_HEADER,
  ATOM_LAYER_INSTRUCTION,
  ATOM_LAYER_MAX_ATOMS,
} from '../../server/services/prompt-builder.js';
import { ATOM_INJECTION_GATE_SQL, resetAtomInjectionGateCache } from '../../server/services/atom-injection-gate.js';

const hybridSearchMock = vi.mocked(hybridSearch);

const DAY = 86_400_000;
const daysAgo = (n: number): string => new Date(Date.now() - n * DAY).toISOString();

interface AtomRow {
  id: string;
  content: string;
  atom_type: string;
  category: string;
  confidence: number;
  source_area_id: string | null;
  source_module_id: string | null;
  created_at: string;
  superseded_by: string | null;
  coding_project_id: string | null;
  owner_user_id: string | null;
  is_active: number;
}

function atom(id: string, over: Partial<AtomRow> = {}): AtomRow {
  return {
    id, content: `Insight ${id}: obliged entities document the risk assessment.`, atom_type: 'insight', category: 'observation',
    confidence: 0.9, source_area_id: 'fcp', source_module_id: 'amlr-readiness', created_at: daysAgo(10),
    superseded_by: null, coding_project_id: null, owner_user_id: null, is_active: 1, ...over,
  };
}

const hit = (id: string, score = 0.5): HybridSearchResult => ({
  id: `emb-${id}`, content_type: 'knowledge_atom', content_id: id, content_text: `hit ${id}`, score, snippet: '', metadata: {}, source: 'vector',
});

interface FakeOpts {
  mode?: string;
  moduleAtoms?: number;
  ratings?: number;
  atoms?: AtomRow[];
  /** Atom ids that carry a positive rating in retrieval_feedback. */
  positive?: string[];
  /** Rows the SQL fallback returns (the 30-day area query). */
  fallback?: AtomRow[];
  /** Coding Studio lessons for buildProjectLessonsBlock. */
  lessons?: Array<{ content: string; atom_type: string; atom_origin: string | null; confidence: number }>;
  /** Every retrieval_feedback INSERT throws. */
  insertThrows?: boolean;
}

interface Fake {
  db: DatabaseAdapter;
  inserts: Array<{ sql: string; params: unknown[] }>;
  allSql: string[];
  positiveQueries: unknown[][];
}

function makeFakeDb(opts: FakeOpts = {}): Fake {
  const atoms = opts.atoms ?? [];
  const positive = new Set(opts.positive ?? []);
  const inserts: Array<{ sql: string; params: unknown[] }> = [];
  const allSql: string[] = [];
  const positiveQueries: unknown[][] = [];
  const db = {
    dialect: 'postgresql',
    async get<T>(sql: string): Promise<T | undefined> {
      if (sql === ATOM_INJECTION_GATE_SQL.mode) return opts.mode === undefined ? undefined : ({ value: opts.mode } as T);
      if (sql === ATOM_INJECTION_GATE_SQL.moduleAtoms) return { c: String(opts.moduleAtoms ?? 0) } as T;
      if (sql === ATOM_INJECTION_GATE_SQL.ratings) return { c: String(opts.ratings ?? 0) } as T;
      throw new Error(`fake db: unexpected get(): ${sql.slice(0, 80)}`);
    },
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      allSql.push(sql);
      if (/FROM knowledge_atoms WHERE id IN/.test(sql)) {
        const ids = new Set(params.map(String));
        return atoms.filter((a) => ids.has(a.id) && a.is_active === 1) as T[];
      }
      if (/FROM retrieval_feedback WHERE was_relevant = 1/.test(sql)) {
        positiveQueries.push(params);
        return params.filter((p) => positive.has(String(p))).map((p) => ({ atom_id: String(p) })) as T[];
      }
      if (/FROM knowledge_atoms ka/.test(sql)) return (opts.fallback ?? []) as T[];
      if (/coding_project_id = \?/.test(sql) && /LIMIT 15/.test(sql)) return (opts.lessons ?? []) as T[];
      throw new Error(`fake db: unexpected all(): ${sql.slice(0, 80)}`);
    },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (/INSERT INTO retrieval_feedback/.test(sql)) {
        if (opts.insertThrows) throw new Error('relation "retrieval_feedback" has no column "message_id"');
        inserts.push({ sql, params });
        return { changes: 1, lastInsertRowid: inserts.length };
      }
      throw new Error(`fake db: unexpected run(): ${sql.slice(0, 80)}`);
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  } as unknown as DatabaseAdapter;
  return { db, inserts, allSql, positiveQueries };
}

const RUN = { areaId: 'fcp', moduleId: 'amlr-readiness', userMessage: 'Assess our AMLR Article 16 readiness', sessionId: 'sess-1', messageId: 'msg-assistant-1' };
const LESSON = { content: 'running `pytest` fails: boom', atom_type: 'test.failed', atom_origin: 'test_failure', confidence: 0.9 };

beforeEach(() => {
  hybridSearchMock.mockReset();
  resetAtomInjectionGateCache();
});

describe('the gate', () => {
  it('auto below the thresholds (this instance: 70 atoms, 0 ratings) → no general block, hybridSearch not called', async () => {
    hybridSearchMock.mockResolvedValue([hit('a1')]);
    const fake = makeFakeDb({ moduleAtoms: 70, ratings: 0, atoms: [atom('a1')] });
    const r = await buildAtomLayerDetailed(fake.db, RUN);
    expect(r.applied).toBe(false);
    expect(r.text).toBe('');
    expect(r.atoms).toEqual([]);
    expect(r.reason).toBe('Collecting: 70 of 100 module atoms, 0 of 30 ratings');
    expect(r.gate.applies).toBe(false);
    expect(r.lessonsChars).toBe(0);
    expect(hybridSearchMock).not.toHaveBeenCalled();
    expect(fake.inserts).toEqual([]);
  });

  it('gated off with a coding project → the lessons block only, never gated', async () => {
    hybridSearchMock.mockResolvedValue([hit('a1')]);
    const fake = makeFakeDb({ moduleAtoms: 0, ratings: 0, atoms: [atom('a1')], lessons: [LESSON] });
    const r = await buildAtomLayerDetailed(fake.db, { ...RUN, codingProjectId: 'projX' });
    expect(r.applied).toBe(false);
    expect(r.text).toContain('## LESSONS FROM THIS PROJECT');
    expect(r.text).toContain('running `pytest` fails');
    expect(r.text).not.toContain(ATOM_LAYER_HEADER);
    expect(r.lessonsChars).toBe(r.text.length);
    expect(hybridSearchMock).not.toHaveBeenCalled();
  });

  it("mode 'off' → nothing even when ready", async () => {
    hybridSearchMock.mockResolvedValue([hit('a1')]);
    const fake = makeFakeDb({ mode: 'off', moduleAtoms: 500, ratings: 100, atoms: [atom('a1')] });
    const r = await buildAtomLayerDetailed(fake.db, RUN);
    expect(r.applied).toBe(false);
    expect(r.reason).toBe('Switched off in Settings');
    expect(hybridSearchMock).not.toHaveBeenCalled();
  });

  it('auto at the thresholds → the general block goes in', async () => {
    hybridSearchMock.mockResolvedValue([hit('a1')]);
    const fake = makeFakeDb({ moduleAtoms: 100, ratings: 30, atoms: [atom('a1')] });
    const r = await buildAtomLayerDetailed(fake.db, RUN);
    expect(r.applied).toBe(true);
    expect(r.atoms.map((a) => a.id)).toEqual(['a1']);
    expect(r.reason).toMatch(/^Ready:/);
  });

  it('bypassGate builds the general block below the thresholds and says so', async () => {
    hybridSearchMock.mockResolvedValue([hit('a1')]);
    const fake = makeFakeDb({ moduleAtoms: 70, ratings: 0, atoms: [atom('a1')] });
    const r = await buildAtomLayerDetailed(fake.db, { ...RUN, bypassGate: true });
    expect(r.applied).toBe(true);
    expect(r.reason).toBe('Gate bypassed by the caller (Collecting: 70 of 100 module atoms, 0 of 30 ratings)');
  });

  it('the thin wrapper buildAtomLayer is gated the same way', async () => {
    hybridSearchMock.mockResolvedValue([hit('a1')]);
    const collecting = makeFakeDb({ moduleAtoms: 70, ratings: 0, atoms: [atom('a1')] });
    expect(await buildAtomLayer(collecting.db, 'fcp', 'amlr-readiness', RUN.userMessage, 'sess-1')).toBe('');
    resetAtomInjectionGateCache();
    const forced = makeFakeDb({ mode: 'on', atoms: [atom('a1')] });
    expect(await buildAtomLayer(forced.db, 'fcp', 'amlr-readiness', RUN.userMessage, 'sess-1')).toContain(ATOM_LAYER_HEADER);
  });
});

describe('the block, when it applies', () => {
  it('says it is memory and tells the model not to cite it — the old "supporting evidence" wording is gone', async () => {
    hybridSearchMock.mockResolvedValue([hit('a1')]);
    const fake = makeFakeDb({ mode: 'on', atoms: [atom('a1', { source_module_id: 'amlr-readiness', created_at: '2026-09-01T10:00:00Z' })] });
    const r = await buildAtomLayerDetailed(fake.db, RUN);
    expect(ATOM_LAYER_HEADER).toBe('## PRIOR KNOWLEDGE ATOMS (memory from earlier runs — not verified sources)');
    expect(ATOM_LAYER_INSTRUCTION).toBe('Treat these as hints to check, not as evidence. Do not cite them as sources.');
    const lines = r.text.split('\n');
    expect(lines[0]).toBe(ATOM_LAYER_HEADER);
    expect(lines[1]).toBe(ATOM_LAYER_INSTRUCTION);
    expect(r.text).not.toMatch(/supporting evidence/i);
    expect(r.text).toContain('- [observation/insight] Insight a1');
    expect(r.text).toContain('from amlr-readiness, 2026-09-01');
  });

  it('drops status.* atoms (the open-chat boilerplate that reached the 09-13 FCP run)', async () => {
    hybridSearchMock.mockResolvedValue([hit('boiler', 0.9), hit('real', 0.4)]);
    const fake = makeFakeDb({
      mode: 'on',
      atoms: [
        atom('boiler', { atom_type: 'status.ready', content: 'Claude is ready to provide analytical assistance', category: 'status' }),
        atom('real'),
      ],
    });
    const r = await buildAtomLayerDetailed(fake.db, RUN);
    expect(r.atoms.map((a) => a.id)).toEqual(['real']);
    expect(r.text).not.toContain('Claude is ready');
  });

  it('drops an atom older than 180 days unless it has a positive rating — checked in one query over the stale ids only', async () => {
    hybridSearchMock.mockResolvedValue([hit('old-unrated', 0.9), hit('old-rated', 0.8), hit('fresh', 0.7)]);
    const fake = makeFakeDb({
      mode: 'on',
      atoms: [
        atom('old-unrated', { created_at: daysAgo(200) }),
        atom('old-rated', { created_at: daysAgo(400) }),
        atom('fresh', { created_at: daysAgo(179) }),
      ],
      positive: ['old-rated'],
    });
    const r = await buildAtomLayerDetailed(fake.db, RUN);
    expect(r.atoms.map((a) => a.id).sort()).toEqual(['fresh', 'old-rated']);
    expect(fake.positiveQueries).toHaveLength(1);
    expect([...fake.positiveQueries[0]].sort()).toEqual(['old-rated', 'old-unrated']);
  });

  it('does not query ratings at all when nothing is stale', async () => {
    hybridSearchMock.mockResolvedValue([hit('a1')]);
    const fake = makeFakeDb({ mode: 'on', atoms: [atom('a1')] });
    await buildAtomLayerDetailed(fake.db, RUN);
    expect(fake.positiveQueries).toHaveLength(0);
  });

  it('team mode keeps only the user\'s own atoms and unowned ones', async () => {
    hybridSearchMock.mockResolvedValue([hit('mine', 0.9), hit('shared', 0.8), hit('theirs', 0.7)]);
    const rows = [
      atom('mine', { owner_user_id: 'ada' }),
      atom('shared', { owner_user_id: null }),
      atom('theirs', { owner_user_id: 'bob' }),
    ];
    const team = makeFakeDb({ mode: 'on', atoms: rows });
    const r = await buildAtomLayerDetailed(team.db, { ...RUN, teamMode: true, ownerUserId: 'ada' });
    expect(r.atoms.map((a) => a.id).sort()).toEqual(['mine', 'shared']);

    // Solo mode: ownership is not a filter.
    hybridSearchMock.mockResolvedValue([hit('mine', 0.9), hit('shared', 0.8), hit('theirs', 0.7)]);
    resetAtomInjectionGateCache();
    const solo = makeFakeDb({ mode: 'on', atoms: rows });
    const r2 = await buildAtomLayerDetailed(solo.db, { ...RUN, teamMode: false, ownerUserId: 'ada' });
    expect(r2.atoms.map((a) => a.id).sort()).toEqual(['mine', 'shared', 'theirs']);
  });

  it('team mode with no user keeps only unowned atoms', async () => {
    hybridSearchMock.mockResolvedValue([hit('mine', 0.9), hit('shared', 0.8)]);
    const fake = makeFakeDb({ mode: 'on', atoms: [atom('mine', { owner_user_id: 'ada' }), atom('shared')] });
    const r = await buildAtomLayerDetailed(fake.db, { ...RUN, teamMode: true, ownerUserId: null });
    expect(r.atoms.map((a) => a.id)).toEqual(['shared']);
  });

  it('caps at five atoms after boosts and the token budget', async () => {
    const ids = Array.from({ length: 9 }, (_, i) => `a${i}`);
    hybridSearchMock.mockResolvedValue(ids.map((id, i) => hit(id, 0.9 - i * 0.05)));
    const fake = makeFakeDb({ mode: 'on', atoms: ids.map((id) => atom(id)) });
    const r = await buildAtomLayerDetailed(fake.db, RUN);
    expect(ATOM_LAYER_MAX_ATOMS).toBe(5);
    expect(r.atoms).toHaveLength(5);
    expect(r.text.split('\n').filter((l) => l.startsWith('- [')).length).toBe(5);
    expect(fake.inserts).toHaveLength(5);
  });

  it('writes one retrieval_feedback row per injected atom, bound to the answer by message_id', async () => {
    hybridSearchMock.mockResolvedValue([hit('a1', 0.6), hit('a2', 0.5)]);
    const fake = makeFakeDb({ mode: 'on', atoms: [atom('a1'), atom('a2')] });
    const r = await buildAtomLayerDetailed(fake.db, RUN);
    expect(r.applied).toBe(true);
    expect(fake.inserts).toHaveLength(2);
    for (const ins of fake.inserts) {
      expect(ins.sql).toMatch(/INSERT INTO retrieval_feedback \(session_id, atom_id, retrieval_method, retrieval_score, message_id\)/);
      expect(ins.params[0]).toBe('sess-1');
      expect(ins.params[2]).toBe('hybrid');
      expect(typeof ins.params[3]).toBe('number');
      expect(ins.params[4]).toBe('msg-assistant-1');
    }
    expect(fake.inserts.map((i) => i.params[1]).sort()).toEqual(['a1', 'a2']);
  });

  it('writes no feedback rows without a session, and a null message_id without a message', async () => {
    hybridSearchMock.mockResolvedValue([hit('a1')]);
    const noSession = makeFakeDb({ mode: 'on', atoms: [atom('a1')] });
    await buildAtomLayerDetailed(noSession.db, { ...RUN, sessionId: null });
    expect(noSession.inserts).toEqual([]);

    hybridSearchMock.mockResolvedValue([hit('a1')]);
    resetAtomInjectionGateCache();
    const noMessage = makeFakeDb({ mode: 'on', atoms: [atom('a1')] });
    await buildAtomLayerDetailed(noMessage.db, { ...RUN, messageId: undefined });
    expect(noMessage.inserts).toHaveLength(1);
    expect(noMessage.inserts[0].params[4]).toBeNull();
  });

  it('a failed feedback write does not lose the layer', async () => {
    hybridSearchMock.mockResolvedValue([hit('a1')]);
    const fake = makeFakeDb({ mode: 'on', atoms: [atom('a1')], insertThrows: true });
    const r = await buildAtomLayerDetailed(fake.db, RUN);
    expect(r.applied).toBe(true);
    expect(r.text).toContain(ATOM_LAYER_HEADER);
  });

  it('a Coding Studio project\'s atoms never leave that project (kept from the scoped-layers rule)', async () => {
    hybridSearchMock.mockResolvedValue([hit('studio', 0.9), hit('general', 0.5)]);
    const fake = makeFakeDb({ mode: 'on', atoms: [atom('studio', { coding_project_id: 'proj-slugify', atom_type: 'review.flag' }), atom('general')] });
    const r = await buildAtomLayerDetailed(fake.db, RUN);
    expect(r.atoms.map((a) => a.id)).toEqual(['general']);
  });

  it('only active atoms are enriched', async () => {
    hybridSearchMock.mockResolvedValue([hit('a1')]);
    const fake = makeFakeDb({ mode: 'on', atoms: [atom('a1')] });
    await buildAtomLayerDetailed(fake.db, RUN);
    const enrich = fake.allSql.find((s) => /FROM knowledge_atoms WHERE id IN/.test(s));
    expect(enrich).toMatch(/AND is_active = 1/);
    expect(enrich).toMatch(/owner_user_id/);
  });

  it('when everything is filtered out the run says so and falls back to the area query (which finds nothing)', async () => {
    hybridSearchMock.mockResolvedValue([hit('boiler')]);
    const fake = makeFakeDb({ mode: 'on', atoms: [atom('boiler', { atom_type: 'status.ready' })], fallback: [] });
    const r = await buildAtomLayerDetailed(fake.db, RUN);
    expect(r.applied).toBe(false);
    expect(r.text).toBe('');
    expect(r.reason).toBe('No prior atoms passed the relevance rules for this run');
    expect(fake.inserts).toEqual([]);
  });
});

describe('the SQL fallback (no user message)', () => {
  it('is gated, honest, excludes status.*, caps at five and records sql_fallback feedback', async () => {
    const collecting = makeFakeDb({ moduleAtoms: 70, ratings: 0, fallback: [atom('f1')] });
    const gated = await buildAtomLayerDetailed(collecting.db, { areaId: 'fcp', sessionId: 'sess-1', messageId: 'msg-1' });
    expect(gated.applied).toBe(false);
    expect(collecting.allSql.some((s) => /FROM knowledge_atoms ka/.test(s))).toBe(false);

    resetAtomInjectionGateCache();
    const forced = makeFakeDb({ mode: 'on', fallback: [atom('f1'), atom('f2')] });
    const r = await buildAtomLayerDetailed(forced.db, { areaId: 'fcp', sessionId: 'sess-1', messageId: 'msg-1' });
    expect(hybridSearchMock).not.toHaveBeenCalled();
    expect(r.applied).toBe(true);
    expect(r.atoms.map((a) => a.method)).toEqual(['sql_fallback', 'sql_fallback']);
    expect(r.text.split('\n')[0]).toBe(ATOM_LAYER_HEADER);
    const sql = forced.allSql.find((s) => /FROM knowledge_atoms ka/.test(s)) ?? '';
    expect(sql).toMatch(/ka\.atom_type NOT LIKE 'status\.%'/);
    expect(sql).toMatch(/ka\.coding_project_id IS NULL/);
    expect(sql).toMatch(/LIMIT 5/);
    expect(forced.inserts).toHaveLength(2);
    expect(forced.inserts[0].params[2]).toBe('sql_fallback');
    expect(forced.inserts[0].params[4]).toBe('msg-1');
  });

  it('applies the team-mode ownership rule in SQL', async () => {
    const fake = makeFakeDb({ mode: 'on', fallback: [] });
    await buildAtomLayerDetailed(fake.db, { areaId: 'fcp', teamMode: true, ownerUserId: 'ada' });
    const sql = fake.allSql.find((s) => /FROM knowledge_atoms ka/.test(s)) ?? '';
    expect(sql).toMatch(/\(ka\.owner_user_id = \? OR ka\.owner_user_id IS NULL\)/);
  });

  it('does not run without an area (open chat gets no 30-day dump)', async () => {
    const fake = makeFakeDb({ mode: 'on', fallback: [atom('f1')] });
    const r = await buildAtomLayerDetailed(fake.db, { areaId: null, sessionId: 'sess-1' });
    expect(r.applied).toBe(false);
    expect(r.reason).toBe('No area or message to retrieve prior atoms against');
    expect(fake.allSql.some((s) => /FROM knowledge_atoms ka/.test(s))).toBe(false);
  });
});
