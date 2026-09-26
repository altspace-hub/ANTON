/**
 * knowledge-atom-read-isolation.test.ts — team-mode audit B6: a knowledge atom
 * is read only by its owner (and admins), plus everyone for SHARED atoms.
 *
 * Injection into prompts already followed "own + shared" (prompt-builder
 * passesStaticRules); every READ surface below served every user's atoms:
 *
 *   GET  /api/knowledge/atoms, /atoms/:id, /atoms/:id/relationships, /entities/:type/:id
 *   POST /api/embeddings/search/atoms          (was INSTANCE_WIDE_SEARCH)
 *   GET  /api/embeddings/feedback/:sessionId   (+ POST /feedback, /feedback/bulk)
 *   GET  /api/orchestrator/atoms
 *   POST /api/search, /api/search/similar      (knowledge_atom was not an owned type)
 *
 * and POST /api/knowledge/atoms saved atoms with no owner — i.e. shared with,
 * and injected into, everyone.
 *
 * Against a real PostgreSQL (ANTON_TEST_DATABASE_URL; skips without one). The
 * embedding adapter is mocked to a constant vector under a model name unique to
 * this run, so the VECTOR path returns all three seeded atoms for any query and
 * the owner filter on it is exercised, not just the keyword SQL.
 *
 * Every closed leak has a negative control: the owner, an admin and solo mode
 * still get the row.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';

const H = vi.hoisted(() => {
  // middleware/auth.ts (imported by the orchestrator routes) throws at import without JWT_SECRET.
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-knowledge-atom-read-isolation';
  // Letters only, so the token survives the english tsvector parser as one lexeme.
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let tag = '';
  for (let i = 0; i < 10; i++) tag += letters[Math.floor(Math.random() * letters.length)];
  return { tag, model: `mock-embed-b6-${tag}` };
});

vi.mock('../../server/services/embedding-adapter.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/embedding-adapter.js')>();
  // Every text embeds to the same unit vector: cosine 1 against every seeded row.
  const embed = async (): Promise<number[]> => [1, 0, 0, 0];
  return {
    ...actual,
    getEmbeddingAdapter: () => ({
      provider: 'openai' as const,
      model: H.model,
      dimensions: 4,
      embed,
      embedBatch: async (texts: string[]) => Promise.all(texts.map(() => embed())),
    }),
  };
});
// Nothing on these paths calls a model; the mocks keep the import graph light.
vi.mock('node-cron', () => ({ validate: () => true, schedule: () => ({ stop: () => undefined }) }));
vi.mock('../../server/services/provider-router.js', () => ({
  callChat: vi.fn(),
  streamChat: vi.fn(),
  mapModelToProvider: (m: string) => m,
  resolveModel: () => 'sdk:claude-sonnet-5',
}));
vi.mock('../../server/services/utility-model.js', () => ({ getRoutedUtilityModel: async () => 'sdk:claude-sonnet-5' }));
vi.mock('../../server/services/sdk-engine-store.js', () => ({ isSdkEngineEnabled: () => false }));

const DATABASE_URL = resolveTestDatabaseUrl();
const describeOrSkip = DATABASE_URL ? describe : describe.skip;

const TOKEN = `zephyr${H.tag}`;
const ALICE = `u-alice-${H.tag}`;
const BOB = `u-bob-${H.tag}`;
const ADMIN = `u-admin-${H.tag}`;
const SESSION_A = `sess-a-${H.tag}`;
const SESSION_B = `sess-b-${H.tag}`;
const ATOM_A = `kna-a-${H.tag}`;   // Alice's
const ATOM_B = `kna-b-${H.tag}`;   // Bob's
const ATOM_S = `kna-s-${H.tag}`;   // shared (owner NULL)
const ORG = `acme-${H.tag}`;
const SECRET_PERSON = `secret-person-${H.tag}`;   // named only in Bob's atom

type Caller = { id: string; role: 'admin' | 'analyst' } | null;

describeOrSkip('knowledge atoms: team-mode read isolation (B6)', () => {
  let db: import('../../server/db/database.js').DatabaseAdapter;
  let hybrid: typeof import('../../server/services/hybrid-search.js');
  let server: Server;
  let base = '';
  let caller: Caller = null;
  const savedMode = process.env.DEPLOYMENT_MODE;
  const createdAtomIds: string[] = [];

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });
    hybrid = await import('../../server/services/hybrid-search.js');
    const { createKnowledgeRoutes } = await import('../../server/routes/knowledge.js');
    const { createEmbeddingRoutes } = await import('../../server/routes/embeddings.js');
    const { createOrchestratorRoutes } = await import('../../server/routes/orchestrator.js');
    const { createSearchRoutes } = await import('../../server/routes/search.js');

    for (const id of [ALICE, BOB]) {
      await db.run(
        `INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, 'test-fixture', 'analyst') ON CONFLICT (id) DO NOTHING`,
        id, id);
    }
    await db.run(`INSERT INTO sessions (id, module_id, title, config, user_id) VALUES (?, 'gap-analysis', 'Alice run', '{}', ?)`, SESSION_A, ALICE);
    await db.run(`INSERT INTO sessions (id, module_id, title, config, user_id) VALUES (?, 'gap-analysis', 'Bob run', '{}', ?)`, SESSION_B, BOB);

    const atoms: Array<[string, string, string | null]> = [
      [ATOM_A, `${TOKEN} alpha: Alice found the onboarding gap at Acme.`, ALICE],
      [ATOM_B, `${TOKEN} bravo: Bob's client Acme is under a confidential review.`, BOB],
      [ATOM_S, `${TOKEN} shared: AMLR applies from July 2027.`, null],
    ];
    for (const [id, content, owner] of atoms) {
      await db.run(
        `INSERT INTO knowledge_atoms (id, source_workflow_id, source_execution_id, source_area_id, source_module_id,
                                      content, atom_type, confidence, category, owner_user_id)
         VALUES (?, 'test-b6', 'test-b6', 'fcp', 'gap-analysis', ?, 'observation.finding', 0.9, 'observation', ?)`,
        id, content, owner);
      await db.run(
        `INSERT INTO embeddings (id, content_type, content_id, content_text, embedding, embedding_model, embedding_dimension, metadata)
         VALUES (?, 'knowledge_atom', ?, ?, '[1,0,0,0]', ?, 4, '{}')`,
        randomUUID(), id, content, H.model);
      await db.run(
        `INSERT INTO knowledge_entity_refs (atom_id, entity_type, entity_id, entity_name) VALUES (?, 'organisation', ?, 'Acme')`,
        id, ORG);
    }
    await db.run(
      `INSERT INTO knowledge_entity_refs (atom_id, entity_type, entity_id, entity_name) VALUES (?, 'person', ?, 'Jane Secret')`,
      ATOM_B, SECRET_PERSON);
    // Alice's atom is linked to Bob's (the detector links across owners) and the shared one to Alice's.
    await db.run(`INSERT INTO atom_relationships (from_atom_id, to_atom_id, relationship_type, strength) VALUES (?, ?, 'related_to', 0.9)`, ATOM_A, ATOM_B);
    await db.run(`INSERT INTO atom_relationships (from_atom_id, to_atom_id, relationship_type, strength) VALUES (?, ?, 'supports', 0.8)`, ATOM_S, ATOM_A);
    await db.run(`INSERT INTO retrieval_feedback (session_id, atom_id, retrieval_method, retrieval_score) VALUES (?, ?, 'hybrid', 0.7)`, SESSION_A, ATOM_A);
    await db.run(`INSERT INTO retrieval_feedback (session_id, atom_id, retrieval_method, retrieval_score) VALUES (?, ?, 'hybrid', 0.6)`, SESSION_B, ATOM_B);

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      if (caller) req.user = { id: caller.id, username: caller.id, role: caller.role };
      next();
    });
    app.use('/api', await createKnowledgeRoutes(db));
    app.use('/api/embeddings', await createEmbeddingRoutes(db));
    app.use('/api', await createOrchestratorRoutes(db, null));
    app.use('/api', await createSearchRoutes(db));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no server address');
    base = `http://127.0.0.1:${addr.port}`;
  }, 60_000);

  afterAll(async () => {
    try {
      const ids = [ATOM_A, ATOM_B, ATOM_S, ...createdAtomIds];
      const ph = ids.map(() => '?').join(',');
      await db.run(`DELETE FROM knowledge_entity_refs WHERE atom_id IN (${ph})`, ...ids);
      await db.run(`DELETE FROM atom_relationships WHERE from_atom_id IN (${ph}) OR to_atom_id IN (${ph})`, ...ids, ...ids);
      await db.run(`DELETE FROM retrieval_feedback WHERE session_id IN (?, ?)`, SESSION_A, SESSION_B);
      await db.run(`DELETE FROM embeddings WHERE embedding_model = ?`, H.model);
      await db.run(`DELETE FROM knowledge_atoms WHERE id IN (${ph})`, ...ids);
      await db.run(`DELETE FROM sessions WHERE id IN (?, ?)`, SESSION_A, SESSION_B);
      await db.run(`DELETE FROM users WHERE id IN (?, ?)`, ALICE, BOB);
    } finally {
      await new Promise<void>((resolve) => { server?.close(() => resolve()); });
      await db?.close();
    }
  });

  beforeEach(() => { process.env.DEPLOYMENT_MODE = 'team'; caller = { id: ALICE, role: 'analyst' }; });
  afterEach(() => {
    if (savedMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = savedMode;
  });

  const as = (id: string, role: 'admin' | 'analyst' = 'analyst') => { caller = { id, role }; };
  const solo = () => { delete process.env.DEPLOYMENT_MODE; caller = { id: 'solo', role: 'admin' }; };

  async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  }
  /** Just this run's seeded atoms, sorted — other rows in the test database are ignored. */
  const ours = (ids: unknown[]): string[] =>
    ids.map(String).filter((id) => [ATOM_A, ATOM_B, ATOM_S].includes(id)).sort();

  // ── GET /api/knowledge/atoms ────────────────────────────────────────────

  describe('GET /api/knowledge/atoms', () => {
    const list = async () =>
      ours(((await call('GET', `/api/knowledge/atoms?q=${TOKEN}`)).json.atoms as Array<{ id: string }>).map((a) => a.id));

    it('a team member lists their own atoms and the shared ones, never a colleague\'s', async () => {
      expect(await list()).toEqual([ATOM_A, ATOM_S].sort());
      as(BOB);
      expect(await list()).toEqual([ATOM_B, ATOM_S].sort());
    });

    it('negative control: an admin and solo mode list every atom', async () => {
      as(ADMIN, 'admin');
      expect(await list()).toEqual([ATOM_A, ATOM_B, ATOM_S].sort());
      solo();
      expect(await list()).toEqual([ATOM_A, ATOM_B, ATOM_S].sort());
    });

    it('the entity filter is scoped too', async () => {
      const r = await call('GET', `/api/knowledge/atoms?entity_type=organisation&entity_id=${ORG}`);
      expect(ours((r.json.atoms as Array<{ id: string }>).map((a) => a.id))).toEqual([ATOM_A, ATOM_S].sort());
    });
  });

  // ── GET /api/knowledge/atoms/:id ────────────────────────────────────────

  describe('GET /api/knowledge/atoms/:id', () => {
    it('a colleague\'s atom is a 404 identical to a missing one', async () => {
      const foreign = await call('GET', `/api/knowledge/atoms/${ATOM_B}`);
      const missing = await call('GET', `/api/knowledge/atoms/kna-missing-${H.tag}`);
      expect(foreign.status).toBe(404);
      expect(foreign.json).toEqual(missing.json);
    });

    it('negative control: own, shared, owner, admin and solo all read it', async () => {
      expect((await call('GET', `/api/knowledge/atoms/${ATOM_A}`)).status).toBe(200);
      expect((await call('GET', `/api/knowledge/atoms/${ATOM_S}`)).status).toBe(200);
      as(BOB);
      const own = await call('GET', `/api/knowledge/atoms/${ATOM_B}`);
      expect(own.status).toBe(200);
      expect(own.json.id).toBe(ATOM_B);
      as(ADMIN, 'admin');
      expect((await call('GET', `/api/knowledge/atoms/${ATOM_B}`)).status).toBe(200);
      solo();
      expect((await call('GET', `/api/knowledge/atoms/${ATOM_B}`)).status).toBe(200);
    });
  });

  // ── relationships + entities ────────────────────────────────────────────

  describe('GET /api/knowledge/atoms/:id/relationships and /entities/:type/:id', () => {
    const related = async (id: string) =>
      ((await call('GET', `/api/knowledge/atoms/${id}/relationships`)).json.relationships as Array<{ related_atom_id: string }>)
        .map((r) => r.related_atom_id).sort();

    it('a related atom owned by a colleague is left out; a colleague\'s seed answers like an unknown one', async () => {
      expect(await related(ATOM_A)).toEqual([ATOM_S]);          // A→B hidden, S→A kept
      const foreign = await call('GET', `/api/knowledge/atoms/${ATOM_B}/relationships`);
      const unknown = await call('GET', `/api/knowledge/atoms/kna-missing-${H.tag}/relationships`);
      expect(foreign.json.relationships).toEqual([]);
      expect(foreign.json.total).toBe(unknown.json.total);
    });

    it('negative control: an admin and solo see both relationships', async () => {
      as(ADMIN, 'admin');
      expect(await related(ATOM_A)).toEqual([ATOM_B, ATOM_S].sort());
      solo();
      expect(await related(ATOM_A)).toEqual([ATOM_B, ATOM_S].sort());
    });

    it('entity atoms and graph neighbours come only from atoms the caller may read', async () => {
      const r = await call('GET', `/api/knowledge/entities/organisation/${ORG}`);
      expect(ours((r.json.atoms as Array<{ id: string }>).map((a) => a.id))).toEqual([ATOM_A, ATOM_S].sort());
      const neighbours = (r.json.connections as Array<{ entity_id: string }>).map((c) => c.entity_id);
      expect(neighbours).not.toContain(SECRET_PERSON);   // named only in Bob's atom

      as(ADMIN, 'admin');   // negative control
      const admin = await call('GET', `/api/knowledge/entities/organisation/${ORG}`);
      expect((admin.json.connections as Array<{ entity_id: string }>).map((c) => c.entity_id)).toContain(SECRET_PERSON);
      expect(ours((admin.json.atoms as Array<{ id: string }>).map((a) => a.id))).toEqual([ATOM_A, ATOM_B, ATOM_S].sort());
    });
  });

  // ── POST /api/knowledge/atoms ───────────────────────────────────────────

  describe('POST /api/knowledge/atoms', () => {
    it('attributes a manual atom to its author, so a colleague cannot read it', async () => {
      const r = await call('POST', '/api/knowledge/atoms', { content: `${TOKEN} manual note by Alice` });
      expect(r.status).toBe(201);
      const id = String(r.json.id);
      createdAtomIds.push(id);
      const row = await db.get<{ owner_user_id: string | null }>('SELECT owner_user_id FROM knowledge_atoms WHERE id = ?', id);
      expect(row?.owner_user_id).toBe(ALICE);
      as(BOB);
      expect((await call('GET', `/api/knowledge/atoms/${id}`)).status).toBe(404);
      as(ALICE);   // negative control: the author reads it
      expect((await call('GET', `/api/knowledge/atoms/${id}`)).status).toBe(200);
    });

    it('solo attributes it to the solo user, and solo still reads it', async () => {
      solo();
      const r = await call('POST', '/api/knowledge/atoms', { content: `${TOKEN} manual note in solo` });
      expect(r.status).toBe(201);
      const id = String(r.json.id);
      createdAtomIds.push(id);
      const row = await db.get<{ owner_user_id: string | null }>('SELECT owner_user_id FROM knowledge_atoms WHERE id = ?', id);
      expect(row?.owner_user_id).toBe('solo');
      expect((await call('GET', `/api/knowledge/atoms/${id}`)).status).toBe(200);
    });

    it('refuses an anonymous save (401) rather than writing a shared atom', async () => {
      caller = null;
      expect((await call('POST', '/api/knowledge/atoms', { content: `${TOKEN} anonymous` })).status).toBe(401);
    });
  });

  // ── POST /api/embeddings/search/atoms ───────────────────────────────────

  describe('POST /api/embeddings/search/atoms', () => {
    const search = async (query: string) =>
      ours(((await call('POST', '/api/embeddings/search/atoms', { query, topK: 50 })).json.results as Array<{ id: string }>).map((r) => r.id));

    it('keyword + vector: a colleague\'s atom never comes back', async () => {
      expect(await search(TOKEN)).toEqual([ATOM_A, ATOM_S].sort());
    });

    it('vector path alone (no keyword match) is scoped too', async () => {
      // The mocked adapter scores every seeded row at cosine 1, so without the
      // owner filter on vector hits Bob's atom would be returned here.
      expect(await search('qqqunmatchedqqq')).toEqual([ATOM_A, ATOM_S].sort());
    });

    it('negative control: owner, admin and solo find every atom they own or may audit', async () => {
      as(BOB);
      expect(await search(TOKEN)).toEqual([ATOM_B, ATOM_S].sort());
      as(ADMIN, 'admin');
      expect(await search(TOKEN)).toEqual([ATOM_A, ATOM_B, ATOM_S].sort());
      solo();
      expect(await search('qqqunmatchedqqq')).toEqual([ATOM_A, ATOM_B, ATOM_S].sort());
    });
  });

  // ── POST /api/search, /api/search/similar ───────────────────────────────

  describe('POST /api/search and /api/search/similar', () => {
    const atomsOf = (json: Record<string, unknown>) =>
      ours((json.results as Array<{ content_type: string; content_id: string }>)
        .filter((r) => r.content_type === 'knowledge_atom').map((r) => r.content_id));

    it('unified search treats knowledge_atom as owned: own + shared only', async () => {
      const r = await call('POST', '/api/search', { query: TOKEN, topK: 50 });
      expect(r.status).toBe(200);
      expect(atomsOf(r.json)).toEqual([ATOM_A, ATOM_S].sort());
    });

    it('findSimilar refuses a colleague\'s atom as the seed and drops it from results', async () => {
      const seed = await call('POST', '/api/search/similar', { contentType: 'knowledge_atom', contentId: ATOM_B, topK: 50 });
      expect(seed.json.results).toEqual([]);
      const own = await call('POST', '/api/search/similar', { contentType: 'knowledge_atom', contentId: ATOM_A, topK: 50 });
      expect(atomsOf(own.json)).toEqual([ATOM_S]);
    });

    it('negative control: an admin and solo get every atom from both', async () => {
      as(ADMIN, 'admin');
      expect(atomsOf((await call('POST', '/api/search', { query: TOKEN, topK: 50 })).json)).toEqual([ATOM_A, ATOM_B, ATOM_S].sort());
      solo();
      expect(atomsOf((await call('POST', '/api/search/similar', { contentType: 'knowledge_atom', contentId: ATOM_A, topK: 50 })).json))
        .toEqual([ATOM_B, ATOM_S].sort());
    });
  });

  // ── the companion app's NO_OWNED_CONTENT scope ──────────────────────────

  describe('hybridSearch with NO_OWNED_CONTENT (companion app)', () => {
    const run = async () => ours((await hybrid.hybridSearch(db, {
      query: TOKEN, topK: 50, includeDocumentChunks: false, scope: hybrid.NO_OWNED_CONTENT,
    })).filter((r) => r.content_type === 'knowledge_atom').map((r) => r.content_id));

    it('team mode: shared atoms only — no user\'s own atoms', async () => {
      expect(await run()).toEqual([ATOM_S]);
    });

    it('negative control: solo is unchanged — every atom, as before', async () => {
      solo();
      expect(await run()).toEqual([ATOM_A, ATOM_B, ATOM_S].sort());
    });
  });

  // ── GET /api/orchestrator/atoms ─────────────────────────────────────────

  describe('GET /api/orchestrator/atoms', () => {
    const recent = async () =>
      ours(((await call('GET', '/api/orchestrator/atoms?days=1&limit=100')).json.atoms as Array<{ id: string }>).map((a) => a.id));

    it('a team member sees their own and shared atoms only', async () => {
      expect(await recent()).toEqual([ATOM_A, ATOM_S].sort());
    });

    it('negative control: an admin and solo see every recent atom', async () => {
      as(ADMIN, 'admin');
      expect(await recent()).toEqual([ATOM_A, ATOM_B, ATOM_S].sort());
      solo();
      expect(await recent()).toEqual([ATOM_A, ATOM_B, ATOM_S].sort());
    });
  });

  // ── retrieval feedback ──────────────────────────────────────────────────

  describe('/api/embeddings/feedback', () => {
    const injected = async (sessionId: string) =>
      ((await call('GET', `/api/embeddings/feedback/${sessionId}`)).json.injectedAtoms as Array<{ atom_id: string }>).map((r) => r.atom_id);
    const rating = async () =>
      (await db.get<{ was_relevant: number | null }>('SELECT was_relevant FROM retrieval_feedback WHERE session_id = ?', SESSION_B))?.was_relevant ?? null;

    it('GET: a colleague\'s session answers like one nobody injected into', async () => {
      expect(await injected(SESSION_B)).toEqual([]);
      expect(await injected(`sess-missing-${H.tag}`)).toEqual([]);
      expect(await injected(SESSION_A)).toEqual([ATOM_A]);
    });

    it('GET negative control: owner, admin and solo see the injected atoms', async () => {
      as(BOB);
      expect(await injected(SESSION_B)).toEqual([ATOM_B]);
      as(ADMIN, 'admin');
      expect(await injected(SESSION_B)).toEqual([ATOM_B]);
      solo();
      expect(await injected(SESSION_B)).toEqual([ATOM_B]);
    });

    it('POST /feedback and /feedback/bulk cannot rate a colleague\'s session; the owner can', async () => {
      await db.run('UPDATE retrieval_feedback SET was_relevant = NULL WHERE session_id = ?', SESSION_B);
      const one = await call('POST', '/api/embeddings/feedback', { atomId: ATOM_B, sessionId: SESSION_B, wasRelevant: false });
      expect(one.status).toBe(404);
      const bulk = await call('POST', '/api/embeddings/feedback/bulk', { sessionId: SESSION_B, wasRelevant: false });
      expect(Number(bulk.json.updated)).toBe(0);
      expect(await rating()).toBeNull();

      as(BOB);   // negative control
      expect((await call('POST', '/api/embeddings/feedback', { atomId: ATOM_B, sessionId: SESSION_B, wasRelevant: true })).status).toBe(200);
      expect(Number(await rating())).toBe(1);
      expect(Number((await call('POST', '/api/embeddings/feedback/bulk', { sessionId: SESSION_B, wasRelevant: false })).json.updated)).toBe(1);
      expect(Number(await rating())).toBe(0);
    });
  });
});
