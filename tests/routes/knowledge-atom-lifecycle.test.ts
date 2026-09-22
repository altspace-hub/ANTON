/**
 * knowledge-atom-lifecycle.test.ts — an atom can be superseded, retired,
 * restored and erased (Wave 4).
 *
 * Against a fake adapter that answers the route's own statements
 * (ATOM_LIFECYCLE_SQL) by identity — no database:
 *
 *   - PATCH supersede sets superseded_by + is_active=0 + the reason, and
 *     refuses self-supersession and unknown successors;
 *   - deactivate / reactivate write and clear the retirement columns;
 *   - DELETE cascades through entity refs, relationships (both directions),
 *     retrieval feedback and embeddings inside ONE transaction;
 *   - subject-search matches content or an entity name, escapes LIKE
 *     wildcards, and refuses a query under three characters;
 *   - DELETE by-subject dry-runs by default and only deletes on dryRun:false;
 *   - in team mode a non-admin only reaches atoms that are theirs or unowned
 *     (404, never 403); admins and solo are unscoped;
 *   - every mutation is refused without a user (401).
 *
 * The negative control at the end proves the fake is reached.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

vi.mock('../../server/services/claude-client.js', () => ({ getClient: () => undefined }));
vi.mock('../../server/services/provider-router.js', () => ({ callChat: vi.fn(), mapModelToProvider: (m: string) => m }));
vi.mock('../../server/services/utility-model.js', () => ({ getRoutedUtilityModel: async () => 'fake' }));
vi.mock('../../server/services/hybrid-search.js', () => ({ embedAndStore: async () => undefined }));
vi.mock('../../server/services/parse-telemetry.js', () => ({ recordParseOutcome: async () => undefined }));

import { createKnowledgeRoutes, ATOM_LIFECYCLE_SQL, SUBJECT_QUERY_MIN_CHARS } from '../../server/routes/knowledge.js';

interface Atom {
  id: string; content: string; owner_user_id: string | null; is_active: number;
  superseded_by: string | null; deactivated_at: string | null; deactivated_reason: string | null;
  source_module_id: string | null; created_at: string;
}
interface FakeState {
  atoms: Map<string, Atom>;
  entityRefs: Array<{ atom_id: string; entity_name: string }>;
  relationships: Array<{ from_atom_id: string; to_atom_id: string }>;
  feedback: Array<{ atom_id: string }>;
  embeddings: Array<{ content_type: string; content_id: string }>;
  /** Every run() in order: [sql, params, insideTransaction]. */
  runs: Array<[string, unknown[], boolean]>;
  transactions: number;
  lastSubjectSql: string | null;
  lastSubjectParams: unknown[] | null;
}

function atom(id: string, over: Partial<Atom> = {}): Atom {
  return {
    id, content: `Atom ${id}`, owner_user_id: null, is_active: 1, superseded_by: null, deactivated_at: null,
    deactivated_reason: null, source_module_id: 'gap-analysis', created_at: '2026-09-16T10:00:00Z', ...over,
  };
}

function seed(): FakeState {
  return {
    atoms: new Map([
      ['a1', atom('a1', { content: 'Nordea Bank must complete the BWRA before December.', owner_user_id: 'u-1', created_at: '2026-09-16T12:00:00Z' })],
      ['a2', atom('a2', { content: 'The sanctions screening gap from the Q3 audit remains open.', owner_user_id: 'u-2', created_at: '2026-09-16T11:00:00Z' })],
      ['a3', atom('a3', { content: 'The MLRO escalated the finding to the risk committee.', owner_user_id: null, created_at: '2026-09-16T10:00:00Z' })],
      ['a4', atom('a4', { content: 'Budget rose 100% year on year.', owner_user_id: null, created_at: '2026-09-16T09:00:00Z' })],
    ]),
    entityRefs: [
      { atom_id: 'a3', entity_name: 'Nordea Bank' },     // a3 mentions Nordea only through an entity
      { atom_id: 'a1', entity_name: 'AMLR Article 16' },
    ],
    relationships: [
      { from_atom_id: 'a1', to_atom_id: 'a2' },
      { from_atom_id: 'a3', to_atom_id: 'a1' },
      { from_atom_id: 'a2', to_atom_id: 'a3' },
    ],
    feedback: [{ atom_id: 'a1' }, { atom_id: 'a1' }, { atom_id: 'a2' }],
    embeddings: [
      { content_type: 'knowledge_atom', content_id: 'a1' },
      { content_type: 'rag_chunk', content_id: 'a1' },          // same id, different type: must survive
      { content_type: 'knowledge_atom', content_id: 'a2' },
    ],
    runs: [], transactions: 0, lastSubjectSql: null, lastSubjectParams: null,
  };
}

function makeFakeDb(state: FakeState): DatabaseAdapter {
  let inTx = false;
  const subjectMatch = (sql: string, params: unknown[]): Atom[] => {
    state.lastSubjectSql = sql;
    state.lastSubjectParams = params;
    // Undo the route's LIKE escaping to get the plain query back.
    const q = String(params[0]).slice(1, -1).replace(/\\([\\%_])/g, '$1').toLowerCase();
    const scoped = sql.includes(ATOM_LIFECYCLE_SQL.ownerScope) ? String(params[2]) : null;
    return [...state.atoms.values()]
      .filter((a) => a.content.toLowerCase().includes(q)
        || state.entityRefs.some((r) => r.atom_id === a.id && r.entity_name.toLowerCase().includes(q)))
      .filter((a) => scoped === null || a.owner_user_id === null || a.owner_user_id === scoped)
      .sort((x, y) => (x.created_at < y.created_at ? 1 : -1));
  };
  const db = {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (sql === ATOM_LIFECYCLE_SQL.ownerRow) {
        const a = state.atoms.get(String(params[0]));
        return a ? ({ id: a.id, owner_user_id: a.owner_user_id, is_active: a.is_active } as T) : undefined;
      }
      if (sql === ATOM_LIFECYCLE_SQL.detail) return state.atoms.get(String(params[0])) as T | undefined;
      if (sql === ATOM_LIFECYCLE_SQL.subjectCount('') || sql === ATOM_LIFECYCLE_SQL.subjectCount(ATOM_LIFECYCLE_SQL.ownerScope)) {
        return { total: String(subjectMatch(sql, params).length) } as T;   // COUNT(*) comes back as text from pg
      }
      throw new Error(`fake db: unexpected get(): ${sql.slice(0, 80)}`);
    },
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      if (sql === ATOM_LIFECYCLE_SQL.subjectRows('') || sql === ATOM_LIFECYCLE_SQL.subjectRows(ATOM_LIFECYCLE_SQL.ownerScope)) {
        return subjectMatch(sql, params).map((a) => ({
          id: a.id, content: a.content, source_module_id: a.source_module_id, created_at: a.created_at,
          is_active: a.is_active, owner_user_id: a.owner_user_id,
        }) as T);
      }
      if (sql === ATOM_LIFECYCLE_SQL.subjectIds('') || sql === ATOM_LIFECYCLE_SQL.subjectIds(ATOM_LIFECYCLE_SQL.ownerScope)) {
        return subjectMatch(sql, params).map((a) => ({ id: a.id }) as T);
      }
      throw new Error(`fake db: unexpected all(): ${sql.slice(0, 80)}`);
    },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      state.runs.push([sql, params, inTx]);
      const id = String(params[params.length - 1]);
      const a = state.atoms.get(id);
      switch (sql) {
        case ATOM_LIFECYCLE_SQL.supersede:
          if (!a) throw new Error('no such atom');
          Object.assign(a, { superseded_by: String(params[0]), is_active: 0, deactivated_at: 'NOW', deactivated_reason: 'superseded' });
          break;
        case ATOM_LIFECYCLE_SQL.deactivate:
          if (!a) throw new Error('no such atom');
          Object.assign(a, { is_active: 0, deactivated_at: 'NOW', deactivated_reason: String(params[0]) });
          break;
        case ATOM_LIFECYCLE_SQL.reactivate:
          if (!a) throw new Error('no such atom');
          Object.assign(a, { is_active: 1, deactivated_at: null, deactivated_reason: null, superseded_by: null });
          break;
        case ATOM_LIFECYCLE_SQL.deleteEntityRefs:
          state.entityRefs = state.entityRefs.filter((r) => r.atom_id !== id); break;
        case ATOM_LIFECYCLE_SQL.deleteRelationships:
          state.relationships = state.relationships.filter((r) => r.from_atom_id !== String(params[0]) && r.to_atom_id !== String(params[1])); break;
        case ATOM_LIFECYCLE_SQL.deleteRetrievalFeedback:
          state.feedback = state.feedback.filter((r) => r.atom_id !== id); break;
        case ATOM_LIFECYCLE_SQL.deleteEmbeddings:
          state.embeddings = state.embeddings.filter((r) => !(r.content_type === 'knowledge_atom' && r.content_id === id)); break;
        case ATOM_LIFECYCLE_SQL.clearSupersededBy:
          for (const x of state.atoms.values()) if (x.superseded_by === id) x.superseded_by = null;
          break;
        case ATOM_LIFECYCLE_SQL.deleteAtom:
          state.atoms.delete(id); break;
        default:
          throw new Error(`fake db: unexpected run(): ${sql.slice(0, 80)}`);
      }
      return { changes: 1, lastInsertRowid: 0 };
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> {
      state.transactions++;
      inTx = true;
      try { return await fn(db); } finally { inTx = false; }
    },
    async close() { /* noop */ },
  } as unknown as DatabaseAdapter;
  return db;
}

type User = { id: string; username: string; role: 'admin' | 'analyst' | 'viewer' } | null;

describe('knowledge atom lifecycle routes', () => {
  let server: Server;
  let base: string;
  let state: FakeState;
  let currentUser: User;
  const savedMode = process.env.DEPLOYMENT_MODE;

  beforeAll(async () => {
    state = seed();
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { if (currentUser) req.user = currentUser; next(); });
    app.use('/api', await createKnowledgeRoutes(makeFakeDb(state)));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no server address');
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  });

  beforeEach(() => {
    // Fresh data, same fake (the adapter reads `state` by reference).
    const fresh = seed();
    state.atoms = fresh.atoms;
    state.entityRefs = fresh.entityRefs;
    state.relationships = fresh.relationships;
    state.feedback = fresh.feedback;
    state.embeddings = fresh.embeddings;
    state.runs = [];
    state.transactions = 0;
    state.lastSubjectSql = null;
    state.lastSubjectParams = null;
    currentUser = { id: 'solo', username: 'solo', role: 'admin' };
    delete process.env.DEPLOYMENT_MODE;
  });

  afterEach(() => {
    if (savedMode === undefined) delete process.env.DEPLOYMENT_MODE;
    else process.env.DEPLOYMENT_MODE = savedMode;
  });

  async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
    const res = await fetch(`${base}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  }
  const runsOf = (sql: string) => state.runs.filter((r) => r[0] === sql);

  // ── PATCH ───────────────────────────────────────────────────

  describe('PATCH /knowledge/atoms/:id', () => {
    it('supersede: sets superseded_by, retires the atom with reason "superseded", returns the row', async () => {
      const { status, json } = await call('PATCH', '/knowledge/atoms/a1', { supersededBy: 'a2' });
      expect(status).toBe(200);
      expect(json.atom).toMatchObject({ id: 'a1', superseded_by: 'a2', is_active: 0, deactivated_reason: 'superseded', deactivated_at: 'NOW' });
      expect(runsOf(ATOM_LIFECYCLE_SQL.supersede)).toEqual([[ATOM_LIFECYCLE_SQL.supersede, ['a2', 'a1'], false]]);
      expect(ATOM_LIFECYCLE_SQL.supersede).toMatch(/deactivated_at = NOW\(\)/);
      expect(ATOM_LIFECYCLE_SQL.supersede).toMatch(/deactivated_reason = 'superseded'/);
    });

    it('refuses self-supersession and an unknown successor, writing nothing', async () => {
      expect((await call('PATCH', '/knowledge/atoms/a1', { supersededBy: 'a1' })).status).toBe(400);
      const unknown = await call('PATCH', '/knowledge/atoms/a1', { supersededBy: 'ghost' });
      expect(unknown.status).toBe(400);
      expect(String(unknown.json.error)).toMatch(/supersededBy/);
      expect(state.runs).toEqual([]);
      expect(state.atoms.get('a1')!.is_active).toBe(1);
    });

    it('an empty body is a 400', async () => {
      expect((await call('PATCH', '/knowledge/atoms/a1', {})).status).toBe(400);
      expect(state.runs).toEqual([]);
    });

    it('isActive:false retires (reason "manual"); isActive:true restores', async () => {
      const off = await call('PATCH', '/knowledge/atoms/a1', { isActive: false });
      expect(off.status).toBe(200);
      expect(off.json.atom).toMatchObject({ is_active: 0, deactivated_reason: 'manual' });
      const on = await call('PATCH', '/knowledge/atoms/a1', { isActive: true });
      expect(on.status).toBe(200);
      expect(on.json.atom).toMatchObject({ is_active: 1, deactivated_reason: null, deactivated_at: null, superseded_by: null });
      expect(runsOf(ATOM_LIFECYCLE_SQL.reactivate)).toHaveLength(1);
    });

    it('404 for an atom that does not exist', async () => {
      expect((await call('PATCH', '/knowledge/atoms/ghost', { isActive: false })).status).toBe(404);
    });
  });

  // ── deactivate / reactivate ─────────────────────────────────

  describe('POST /knowledge/atoms/:id/deactivate and /reactivate', () => {
    it('deactivate stores the given reason', async () => {
      const { status, json } = await call('POST', '/knowledge/atoms/a2/deactivate', { reason: 'client relationship ended' });
      expect(status).toBe(200);
      expect(json.atom).toMatchObject({ id: 'a2', is_active: 0, deactivated_reason: 'client relationship ended', deactivated_at: 'NOW' });
      expect(runsOf(ATOM_LIFECYCLE_SQL.deactivate)[0][1]).toEqual(['client relationship ended', 'a2']);
    });

    it('deactivate without a reason records "manual"', async () => {
      const { json } = await call('POST', '/knowledge/atoms/a2/deactivate', {});
      expect(json.atom).toMatchObject({ deactivated_reason: 'manual' });
    });

    it('reactivate clears the retirement columns', async () => {
      await call('POST', '/knowledge/atoms/a2/deactivate', { reason: 'x' });
      const { status, json } = await call('POST', '/knowledge/atoms/a2/reactivate');
      expect(status).toBe(200);
      expect(json.atom).toMatchObject({ is_active: 1, deactivated_at: null, deactivated_reason: null });
    });
  });

  // ── DELETE ──────────────────────────────────────────────────

  describe('DELETE /knowledge/atoms/:id', () => {
    it('cascades through refs, relationships (both directions), feedback and embeddings inside one transaction', async () => {
      const { status, json } = await call('DELETE', '/knowledge/atoms/a1');
      expect(status).toBe(200);
      expect(json).toEqual({ deleted: true, id: 'a1' });

      expect(state.atoms.has('a1')).toBe(false);
      expect(state.atoms.size).toBe(3);
      expect(state.entityRefs).toEqual([{ atom_id: 'a3', entity_name: 'Nordea Bank' }]);
      expect(state.relationships).toEqual([{ from_atom_id: 'a2', to_atom_id: 'a3' }]);       // a1→a2 and a3→a1 both gone
      expect(state.feedback).toEqual([{ atom_id: 'a2' }]);
      expect(state.embeddings).toEqual([
        { content_type: 'rag_chunk', content_id: 'a1' },                                    // other content types untouched
        { content_type: 'knowledge_atom', content_id: 'a2' },
      ]);

      expect(state.transactions).toBe(1);
      const cascade = state.runs.map(([sql]) => sql);
      expect(cascade).toEqual([
        ATOM_LIFECYCLE_SQL.deleteEntityRefs,
        ATOM_LIFECYCLE_SQL.deleteRelationships,
        ATOM_LIFECYCLE_SQL.deleteRetrievalFeedback,
        ATOM_LIFECYCLE_SQL.deleteEmbeddings,
        ATOM_LIFECYCLE_SQL.clearSupersededBy,
        ATOM_LIFECYCLE_SQL.deleteAtom,
      ]);
      expect(state.runs.every(([, , insideTx]) => insideTx)).toBe(true);
      expect(runsOf(ATOM_LIFECYCLE_SQL.deleteRelationships)[0][1]).toEqual(['a1', 'a1']);
      expect(ATOM_LIFECYCLE_SQL.deleteEmbeddings).toMatch(/content_type = 'knowledge_atom' AND content_id = \?/);
    });

    it('an atom another atom was superseded by: the dangling pointer is cleared', async () => {
      await call('PATCH', '/knowledge/atoms/a2', { supersededBy: 'a1' });
      await call('DELETE', '/knowledge/atoms/a1');
      expect(state.atoms.get('a2')!.superseded_by).toBeNull();
    });

    it('404 for an unknown atom, nothing run', async () => {
      expect((await call('DELETE', '/knowledge/atoms/ghost')).status).toBe(404);
      expect(state.runs).toEqual([]);
      expect(state.transactions).toBe(0);
    });
  });

  // ── subject-search ──────────────────────────────────────────

  describe('GET /knowledge/atoms/subject-search', () => {
    it('matches content or an entity name, newest first, with a total', async () => {
      const { status, json } = await call('GET', '/knowledge/atoms/subject-search?q=nordea');
      expect(status).toBe(200);
      expect(json.q).toBe('nordea');
      expect(json.total).toBe(2);
      const atoms = json.atoms as Array<Record<string, unknown>>;
      expect(atoms.map((a) => a.id)).toEqual(['a1', 'a3']);      // a1 by content, a3 by entity name
      expect(Object.keys(atoms[0]).sort()).toEqual(['content', 'created_at', 'id', 'is_active', 'owner_user_id', 'source_module_id']);
      expect(ATOM_LIFECYCLE_SQL.subjectWhere('')).toMatch(/a\.content ILIKE \? OR EXISTS \(SELECT 1 FROM knowledge_entity_refs er WHERE er\.atom_id = a\.id AND er\.entity_name ILIKE \?\)/);
    });

    it('is not captured by the /:id route', async () => {
      const { status, json } = await call('GET', '/knowledge/atoms/subject-search?q=mlro');
      expect(status).toBe(200);
      expect((json.atoms as Array<{ id: string }>).map((a) => a.id)).toEqual(['a3']);
    });

    it('refuses a query under three characters', async () => {
      const { status, json } = await call('GET', '/knowledge/atoms/subject-search?q=ab');
      expect(status).toBe(400);
      expect(String(json.error)).toContain(String(SUBJECT_QUERY_MIN_CHARS));
      expect((await call('GET', '/knowledge/atoms/subject-search')).status).toBe(400);
    });

    it('escapes LIKE wildcards — "100%" is a string, not "100 followed by anything"', async () => {
      const { json } = await call('GET', '/knowledge/atoms/subject-search?q=100%25');
      expect(state.lastSubjectParams![0]).toBe('%100\\%%');
      expect((json.atoms as Array<{ id: string }>).map((a) => a.id)).toEqual(['a4']);
    });
  });

  // ── by-subject ──────────────────────────────────────────────

  describe('DELETE /knowledge/atoms/by-subject', () => {
    it('dry-runs by default: ids and count, nothing deleted', async () => {
      const { status, json } = await call('DELETE', '/knowledge/atoms/by-subject', { q: 'nordea' });
      expect(status).toBe(200);
      expect(json).toEqual({ dryRun: true, count: 2, ids: ['a1', 'a3'] });
      expect(state.atoms.size).toBe(4);
      expect(state.runs).toEqual([]);
      expect(state.transactions).toBe(0);
    });

    it('dryRun must be exactly false to delete — a truthy string still dry-runs', async () => {
      const { json } = await call('DELETE', '/knowledge/atoms/by-subject', { q: 'nordea', dryRun: 'false' });
      expect(json.dryRun).toBe(true);
      expect(state.runs).toEqual([]);
    });

    it('dryRun:false deletes every match with the full cascade in one transaction', async () => {
      const { status, json } = await call('DELETE', '/knowledge/atoms/by-subject', { q: 'nordea', dryRun: false });
      expect(status).toBe(200);
      expect(json).toEqual({ dryRun: false, deleted: 2, ids: ['a1', 'a3'] });
      expect([...state.atoms.keys()]).toEqual(['a2', 'a4']);
      expect(state.entityRefs).toEqual([]);
      expect(state.relationships).toEqual([]);                      // every edge touched a1 or a3
      expect(state.feedback).toEqual([{ atom_id: 'a2' }]);
      expect(state.embeddings).toEqual([
        { content_type: 'rag_chunk', content_id: 'a1' },
        { content_type: 'knowledge_atom', content_id: 'a2' },
      ]);
      expect(state.transactions).toBe(1);
      expect(state.runs).toHaveLength(12);
      expect(state.runs.every(([, , insideTx]) => insideTx)).toBe(true);
    });

    it('refuses a short query', async () => {
      expect((await call('DELETE', '/knowledge/atoms/by-subject', { q: 'no', dryRun: false })).status).toBe(400);
      expect(state.atoms.size).toBe(4);
    });
  });

  // ── team mode ───────────────────────────────────────────────

  describe('team mode ownership', () => {
    beforeEach(() => {
      process.env.DEPLOYMENT_MODE = 'team';
      currentUser = { id: 'u-2', username: 'two', role: 'analyst' };
    });

    it('a non-admin cannot touch another user\'s atom — 404, nothing written', async () => {
      expect((await call('PATCH', '/knowledge/atoms/a1', { isActive: false })).status).toBe(404);
      expect((await call('POST', '/knowledge/atoms/a1/deactivate', {})).status).toBe(404);
      expect((await call('POST', '/knowledge/atoms/a1/reactivate')).status).toBe(404);
      expect((await call('DELETE', '/knowledge/atoms/a1')).status).toBe(404);
      expect(state.runs).toEqual([]);
      expect(state.atoms.get('a1')!.is_active).toBe(1);
    });

    it('a non-admin may touch their own atom and an unowned one', async () => {
      expect((await call('POST', '/knowledge/atoms/a2/deactivate', { reason: 'mine' })).status).toBe(200);
      expect((await call('POST', '/knowledge/atoms/a3/deactivate', { reason: 'unowned' })).status).toBe(200);
      expect(state.atoms.get('a2')!.deactivated_reason).toBe('mine');
      expect(state.atoms.get('a3')!.deactivated_reason).toBe('unowned');
    });

    it('subject-search and by-subject are scoped to own + unowned atoms', async () => {
      const search = await call('GET', '/knowledge/atoms/subject-search?q=the');
      expect((search.json.atoms as Array<{ id: string }>).map((a) => a.id)).toEqual(['a2', 'a3']);   // a1 (u-1) hidden
      expect(search.json.total).toBe(2);
      expect(state.lastSubjectSql).toContain(ATOM_LIFECYCLE_SQL.ownerScope);
      expect(state.lastSubjectParams![2]).toBe('u-2');

      const erase = await call('DELETE', '/knowledge/atoms/by-subject', { q: 'the', dryRun: false });
      expect(erase.json).toEqual({ dryRun: false, deleted: 2, ids: ['a2', 'a3'] });
      expect([...state.atoms.keys()]).toEqual(['a1', 'a4']);
    });

    it('a non-admin cannot supersede their atom WITH another user\'s atom — same answer as an unknown id', async () => {
      // Review of PR #71: the atom being retired was ownership-checked, the atom it
      // was retired IN FAVOUR OF was only checked for existence — so u-2 could link
      // their atom to u-1's, and the differing answers told them u-1's id was real.
      const foreign = await call('PATCH', '/knowledge/atoms/a2', { supersededBy: 'a1' });
      const unknown = await call('PATCH', '/knowledge/atoms/a2', { supersededBy: 'no-such-atom' });
      expect(foreign.status).toBe(400);
      expect(foreign.json).toEqual(unknown.json);   // no existence oracle
      expect(state.runs).toEqual([]);
      expect(state.atoms.get('a2')!.superseded_by).toBeNull();
    });

    it('a non-admin may supersede their atom with their own or an unowned one', async () => {
      expect((await call('PATCH', '/knowledge/atoms/a2', { supersededBy: 'a3' })).status).toBe(200);
      expect(state.atoms.get('a2')!.superseded_by).toBe('a3');
    });

    it('an admin in team mode is unscoped', async () => {
      currentUser = { id: 'admin-1', username: 'admin', role: 'admin' };
      expect((await call('PATCH', '/knowledge/atoms/a1', { isActive: false })).status).toBe(200);
      const search = await call('GET', '/knowledge/atoms/subject-search?q=the');
      expect(search.json.total).toBe(3);
      expect(state.lastSubjectSql).not.toContain(ATOM_LIFECYCLE_SQL.ownerScope);
    });
  });

  it('every mutation requires a user (401)', async () => {
    currentUser = null;
    expect((await call('PATCH', '/knowledge/atoms/a1', { isActive: false })).status).toBe(401);
    expect((await call('POST', '/knowledge/atoms/a1/deactivate', {})).status).toBe(401);
    expect((await call('POST', '/knowledge/atoms/a1/reactivate')).status).toBe(401);
    expect((await call('DELETE', '/knowledge/atoms/a1')).status).toBe(401);
    expect((await call('GET', '/knowledge/atoms/subject-search?q=nordea')).status).toBe(401);
    expect((await call('DELETE', '/knowledge/atoms/by-subject', { q: 'nordea' })).status).toBe(401);
    expect(state.runs).toEqual([]);
  });

  it('negative control: the same deactivate with the atom removed from the fake is a 404', async () => {
    state.atoms.delete('a2');
    expect((await call('POST', '/knowledge/atoms/a2/deactivate', { reason: 'x' })).status).toBe(404);
    expect(state.runs).toEqual([]);
  });
});
