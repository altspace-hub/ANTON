/**
 * atoms-round2-team-isolation.test.ts — the atom surfaces round 1 missed
 * (not_to_github/TEAM_ISOLATION_ROUND1_GAPS_2026-09-23.md, "verify:atoms").
 *
 * On a team server a knowledge atom is read by its owner and, when it has no
 * owner, by everyone; a checkpoint decision only by the person who made it.
 * Each of these served every user's rows:
 *
 *   GET  /api/intelligence/summary, /export, /insights, /top-entities
 *   GET  /api/knowledge-graph/entities, /entities/:type/:id (+ /subgraph),
 *        /export, /analytics/degree-centrality, /merge-log
 *   POST /api/knowledge-graph/entities/merge  (no guard — now admin-only)
 *   POST /api/p2p/knowledge-query             (every user's atoms, retired ones too)
 *   GET  /api/knowledge/decisions/:workflowId (+ /distribution)
 *   POST /api/embeddings/search/decisions, /similar (checkpoint rows)
 *   agent-processor buildContext              (every user's atoms into the agent prompt)
 *
 * Against a real PostgreSQL (ANTON_TEST_DATABASE_URL; skips without one). The
 * model is mocked so the prompt it would have received can be read back, and
 * hybridSearch / findSimilar are mocked to return both users' decisions — the
 * route's own filter is what is under test there.
 *
 * Every closed leak has a negative control: the owner, an admin and solo mode
 * still get the row.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';

const H = vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-atoms-round2-team-isolation';
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let tag = '';
  for (let i = 0; i < 10; i++) tag += letters[Math.floor(Math.random() * letters.length)];
  return {
    tag,
    /** Every prompt the mocked model received, in order. */
    prompts: [] as Array<{ system?: string; user: string }>,
    /** What the mocked hybridSearch / findSimilar return (set in beforeAll). */
    searchHits: [] as Array<{ content_type: string; content_id: string }>,
    similarHits: [] as Array<{ content_type: string; content_id: string }>,
  };
});

vi.mock('../../server/services/provider-router.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/provider-router.js')>();
  return {
    ...actual,
    callChat: vi.fn(async (opts: { system?: string; messages: Array<{ content: unknown }> }) => {
      H.prompts.push({ system: opts.system, user: String(opts.messages[opts.messages.length - 1]?.content ?? '') });
      // Supports every atom the insights prompt listed — the ids come back to the caller.
      return {
        text: '[{"type":"pattern","title":"t","description":"d","severity":"info","confidence":0.5,"supporting_atom_indices":[0,1,2,3,4]}]',
        inputTokens: 1, outputTokens: 1, thinking: '',
      };
    }),
    streamChat: vi.fn(),
  };
});
vi.mock('../../server/services/utility-model.js', () => ({ getRoutedUtilityModel: async () => 'sdk:claude-sonnet-5' }));
vi.mock('../../server/services/hybrid-search.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/hybrid-search.js')>();
  const asResult = (h: { content_type: string; content_id: string }, i: number) => ({
    id: `emb-${i}`, content_type: h.content_type, content_id: h.content_id, content_text: `text of ${h.content_id}`,
    score: 1 - i * 0.01, similarity: 0.9, source: 'vector', metadata: {},
  });
  return {
    ...actual,
    hybridSearch: vi.fn(async () => H.searchHits.map(asResult)),
    findSimilar: vi.fn(async () => H.similarHits.map(asResult)),
    embedAndStore: vi.fn(async () => undefined),
  };
});

const DATABASE_URL = resolveTestDatabaseUrl();
const describeOrSkip = DATABASE_URL ? describe : describe.skip;

const TOKEN = `quasar${H.tag}`;
const CAT = `cat${H.tag}`;
const ALICE = `u-alice-${H.tag}`;
const BOB = `u-bob-${H.tag}`;
const ADMIN = `u-admin-${H.tag}`;
const ATOM_A = `kna-a-${H.tag}`;        // Alice's
const ATOM_B = `kna-b-${H.tag}`;        // Bob's
const ATOM_S = `kna-s-${H.tag}`;        // shared (owner NULL)
const ATOM_X = `kna-x-${H.tag}`;        // shared but retired (is_active = 0)
const ATOM_CODE = `kna-code-${H.tag}`;  // a coding project's lesson
const CONTENT: Record<string, string> = {
  [ATOM_A]: `${TOKEN} alice: Alice's client restructures its onboarding.`,
  [ATOM_B]: `${TOKEN} bravo: Bob's client is under a confidential review.`,
  [ATOM_S]: `${TOKEN} shared: AMLR applies from July 2027.`,
  [ATOM_X]: `${TOKEN} retired: this atom was erased by deactivation.`,
  [ATOM_CODE]: `${TOKEN} coding: running the suite fails on the ledger test.`,
};
const PROJECT = `proj-${H.tag}`;
const CODING_PROJECT = `cp-${H.tag}`;
const ENT_ALICE = `alice-client-${H.tag}`;   // named only in Alice's atom
const ENT_SHARED = `shared-org-${H.tag}`;    // named in Alice's AND the shared atom
const ENT_BOB = `bob-person-${H.tag}`;       // named only in Bob's atom
const ENT_PACK = `pack-reg-${H.tag}`;        // a knowledge-pack entity (no atom)
const ENT_M1 = `merge-from-${H.tag}`;
const ENT_M2 = `merge-into-${H.tag}`;
const WORKFLOW = `module:round2-${H.tag}`;
const DEC_A = `dec-a-${H.tag}`;
const DEC_B = `dec-b-${H.tag}`;
const PEER = `peer-${H.tag}`;
const AGENT = `agent-${H.tag}`;
const AGENT_NO_OWNER = `agent-none-${H.tag}`;

type Caller = { id: string; role: 'admin' | 'analyst' };

describeOrSkip('knowledge atoms round 2: team-mode isolation of the remaining surfaces', () => {
  let db: import('../../server/db/database.js').DatabaseAdapter;
  let processor: Awaited<ReturnType<typeof import('../../server/services/agent-processor.js').createAgentProcessor>>;
  let server: Server;
  let base = '';
  let caller: Caller = { id: ALICE, role: 'analyst' };
  const savedMode = process.env.DEPLOYMENT_MODE;

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });

    for (const id of [ALICE, BOB]) {
      await db.run(
        `INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, 'test-fixture', 'analyst') ON CONFLICT (id) DO NOTHING`,
        id, id);
    }
    await db.run(`INSERT INTO projects (id, name, user_id) VALUES (?, 'round2', ?)`, PROJECT, ALICE);
    await db.run(`INSERT INTO coding_projects (id, project_id, name) VALUES (?, ?, 'round2')`, CODING_PROJECT, PROJECT);

    // created_at in the future so these are the newest atoms in the test database
    // and the "recent" lists below cannot be crowded out by other suites' rows.
    const atoms: Array<[string, string | null, number, string | null]> = [
      [ATOM_A, ALICE, 1, null],
      [ATOM_B, BOB, 1, null],
      [ATOM_S, null, 1, null],
      [ATOM_X, null, 0, null],
      [ATOM_CODE, null, 1, CODING_PROJECT],
    ];
    for (const [id, owner, active, codingProject] of atoms) {
      await db.run(
        `INSERT INTO knowledge_atoms (id, source_workflow_id, source_execution_id, source_area_id, source_module_id,
                                      content, atom_type, confidence, category, owner_user_id, is_active,
                                      coding_project_id, created_at)
         VALUES (?, 'test-round2', 'test-round2', 'fcp', 'gap-analysis', ?, 'observation.finding', 0.9, ?, ?, ?, ?,
                 NOW() + INTERVAL '1 day')`,
        id, CONTENT[id], CAT, owner, active, codingProject);
    }
    const refs: Array<[string, string, string, string]> = [
      [ATOM_A, 'organisation', ENT_ALICE, 'Alice Secret Client'],
      [ATOM_A, 'organisation', ENT_SHARED, 'Shared Org'],
      [ATOM_S, 'organisation', ENT_SHARED, 'Shared Org'],
      [ATOM_B, 'person', ENT_BOB, 'Bob Secret Person'],
    ];
    for (const [atom, type, id, name] of refs) {
      await db.run(`INSERT INTO knowledge_entity_refs (atom_id, entity_type, entity_id, entity_name) VALUES (?, ?, ?, ?)`, atom, type, id, name);
    }
    const nodes: Array<[string, string, string, string]> = [
      ['organisation', ENT_ALICE, 'Alice Secret Client', 'workflow'],
      ['organisation', ENT_SHARED, 'Shared Org', 'workflow'],
      ['person', ENT_BOB, 'Bob Secret Person', 'workflow'],
      ['regulation', ENT_PACK, 'AMLR (pack)', 'pack'],
      ['organisation', ENT_M1, 'Merge From', 'workflow'],
      ['organisation', ENT_M2, 'Merge Into', 'workflow'],
    ];
    for (const [type, id, name, source] of nodes) {
      await db.run(
        `INSERT INTO entity_nodes (id, entity_type, entity_id, canonical_name, interaction_count, source) VALUES (?, ?, ?, ?, 1, ?)`,
        `en-${id}`, type, id, name, source);
    }
    await db.run(
      `INSERT INTO entity_relationships (id, source_type, source_id, target_type, target_id, relationship_type, strength)
       VALUES (?, 'organisation', ?, 'organisation', ?, 'mentioned_with', 1.0)`,
      `er-alice-${H.tag}`, ENT_SHARED, ENT_ALICE);
    await db.run(
      `INSERT INTO entity_relationships (id, source_type, source_id, target_type, target_id, relationship_type, strength)
       VALUES (?, 'organisation', ?, 'regulation', ?, 'subject_to', 1.0)`,
      `er-pack-${H.tag}`, ENT_SHARED, ENT_PACK);

    for (const [id, who, decision] of [[DEC_A, ALICE, 'approve'], [DEC_B, BOB, 'reject']] as const) {
      await db.run(
        `INSERT INTO checkpoint_decisions (id, execution_id, workflow_id, step_index, human_decision, human_reasoning, decided_by)
         VALUES (?, 'exec-round2', ?, 0, ?, ?, ?)`,
        id, WORKFLOW, decision, `${who} private reasoning`, who);
    }
    await db.run(
      `INSERT INTO community_connections (id, owner_user_id, contact_hash, public_key, status) VALUES (?, ?, ?, 'pk', 'accepted')`,
      `cc-${H.tag}`, ALICE, PEER);
    for (const [id, owner] of [[AGENT, ALICE], [AGENT_NO_OWNER, null]] as const) {
      await db.run(
        `INSERT INTO agent_profiles (id, name, slug, role_description, system_prompt, status, created_by)
         VALUES (?, 'Round 2 agent', ?, 'test agent', 'You are a test agent.', 'active', ?)`,
        id, id, owner);
    }
    H.searchHits = [{ content_type: 'checkpoint', content_id: DEC_A }, { content_type: 'checkpoint', content_id: DEC_B }];
    H.similarHits = [{ content_type: 'checkpoint', content_id: DEC_B }, { content_type: 'knowledge_atom', content_id: ATOM_S }];

    const { createIntelligenceDashboardRoutes } = await import('../../server/routes/intelligence-dashboard.js');
    const { createKnowledgeGraphRoutes } = await import('../../server/routes/knowledge-graph.js');
    const { createP2PRoutes } = await import('../../server/routes/p2p.js');
    const { createKnowledgeRoutes } = await import('../../server/routes/knowledge.js');
    const { createEmbeddingRoutes } = await import('../../server/routes/embeddings.js');
    const { createAgentProcessor } = await import('../../server/services/agent-processor.js');
    processor = await createAgentProcessor(db);

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { id: caller.id, username: caller.id, role: caller.role }; next(); });
    app.use('/api', await createIntelligenceDashboardRoutes(db));
    app.use('/api', await createKnowledgeGraphRoutes(db));
    app.use('/api', await createP2PRoutes(db));
    app.use('/api', await createKnowledgeRoutes(db));
    app.use('/api/embeddings', await createEmbeddingRoutes(db));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no server address');
    base = `http://127.0.0.1:${addr.port}`;
  }, 60_000);

  afterAll(async () => {
    try {
      const atomIds = [ATOM_A, ATOM_B, ATOM_S, ATOM_X, ATOM_CODE];
      const ph = atomIds.map(() => '?').join(',');
      const entityIds = [ENT_ALICE, ENT_SHARED, ENT_BOB, ENT_PACK, ENT_M1, ENT_M2];
      const eph = entityIds.map(() => '?').join(',');
      await db.run(`DELETE FROM knowledge_entity_refs WHERE atom_id IN (${ph})`, ...atomIds);
      await db.run(`DELETE FROM knowledge_atoms WHERE id IN (${ph})`, ...atomIds);
      await db.run(`DELETE FROM entity_relationships WHERE source_id IN (${eph}) OR target_id IN (${eph})`, ...entityIds, ...entityIds);
      await db.run(`DELETE FROM entity_merge_log WHERE merged_from IN (${eph}) OR merged_into IN (${eph})`, ...entityIds, ...entityIds);
      await db.run(`DELETE FROM entity_aliases WHERE alias_id IN (${eph}) OR primary_id IN (${eph})`, ...entityIds, ...entityIds);
      await db.run(`DELETE FROM entity_nodes WHERE entity_id IN (${eph})`, ...entityIds);
      await db.run(`DELETE FROM checkpoint_decisions WHERE id IN (?, ?)`, DEC_A, DEC_B);
      await db.run(`DELETE FROM community_connections WHERE contact_hash = ?`, PEER);
      await db.run(`DELETE FROM agent_profiles WHERE id IN (?, ?)`, AGENT, AGENT_NO_OWNER);   // conversations cascade
      await db.run(`DELETE FROM coding_projects WHERE id = ?`, CODING_PROJECT);
      await db.run(`DELETE FROM projects WHERE id = ?`, PROJECT);
      await db.run(`DELETE FROM users WHERE id IN (?, ?)`, ALICE, BOB);
    } finally {
      await new Promise<void>((resolve) => { server?.close(() => resolve()); });
      await db?.close();
    }
  });

  beforeEach(() => {
    process.env.DEPLOYMENT_MODE = 'team';
    caller = { id: ALICE, role: 'analyst' };
    H.prompts.length = 0;
  });
  afterEach(() => {
    if (savedMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = savedMode;
  });

  const as = (id: string, role: 'admin' | 'analyst' = 'analyst') => { caller = { id, role }; };
  const solo = () => { delete process.env.DEPLOYMENT_MODE; caller = { id: 'solo', role: 'admin' }; };

  async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: unknown }> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, json: await res.json() as unknown };
  }
  const get = async (path: string): Promise<Record<string, unknown>> => (await call('GET', path)).json as Record<string, unknown>;
  // ATOM_CODE is left out on purpose: it is a shared (owner NULL) coding lesson,
  // there only for the agent test's coding-project rule. Whether listings should
  // show unattributed coding atoms is atomOwnerSql's decision (hybrid-search.ts),
  // which this round does not change — the writers now attribute them instead.
  const OUR_ATOMS = [ATOM_A, ATOM_B, ATOM_S, ATOM_X];
  /** This run's seeded atom ids among `rows`, sorted — other suites' rows are ignored. */
  const ours = (rows: unknown, key = 'id'): string[] =>
    (rows as Array<Record<string, unknown>>).map((r) => String(r[key])).filter((id) => OUR_ATOMS.includes(id)).sort();
  const entityIds = (rows: unknown): string[] =>
    (rows as Array<{ entity_id: string }>).map((r) => r.entity_id)
      .filter((id) => [ENT_ALICE, ENT_SHARED, ENT_BOB, ENT_PACK, ENT_M1, ENT_M2].includes(id)).sort();

  // ── Intelligence dashboard ──────────────────────────────────────────────

  describe('intelligence dashboard', () => {
    it('summary: a team member\'s recent atoms and entities are their own + shared', async () => {
      as(BOB);
      const bob = await get('/api/intelligence/summary');
      expect(ours(bob.recentAtoms)).toEqual([ATOM_B, ATOM_S].sort());
      expect((bob.recentAtoms as Array<{ owner_user_id: string | null }>).every((a) => a.owner_user_id === null || a.owner_user_id === BOB)).toBe(true);
      expect(entityIds(bob.topEntities)).not.toContain(ENT_ALICE);
    });

    it('summary negative control: admin and solo see Alice\'s atom', async () => {
      as(ADMIN, 'admin');
      expect(ours((await get('/api/intelligence/summary')).recentAtoms)).toContain(ATOM_A);
      solo();
      expect(ours((await get('/api/intelligence/summary')).recentAtoms)).toContain(ATOM_A);
    });

    it('export: own + shared atoms for a team member; everything for admin and solo', async () => {
      const exported = async () => ours((await get(`/api/intelligence/export?format=json&category=${CAT}`)).atoms);
      as(BOB);
      expect(await exported()).toEqual([ATOM_B, ATOM_S].sort());
      as(ALICE);
      expect(await exported()).toEqual([ATOM_A, ATOM_S].sort());
      as(ADMIN, 'admin');
      expect(await exported()).toEqual([ATOM_A, ATOM_B, ATOM_S].sort());
      solo();
      expect(await exported()).toEqual([ATOM_A, ATOM_B, ATOM_S].sort());
    });

    it('insights: the model is never shown a colleague\'s atom, and no colleague\'s id comes back', async () => {
      as(BOB);
      const { insights } = await get(`/api/intelligence/insights?category=${CAT}`);
      const prompt = H.prompts.at(-1)!.user;
      expect(prompt).toContain(CONTENT[ATOM_B]);
      expect(prompt).toContain(CONTENT[ATOM_S]);
      expect(prompt).not.toContain(CONTENT[ATOM_A]);
      const supporting = (insights as Array<{ supporting_atoms: string[] }>).flatMap((i) => i.supporting_atoms);
      expect(supporting).not.toContain(ATOM_A);
      expect(supporting).toContain(ATOM_B);
    });

    it('insights negative control: an admin\'s prompt carries every atom', async () => {
      as(ADMIN, 'admin');
      await get(`/api/intelligence/insights?category=${CAT}`);
      expect(H.prompts.at(-1)!.user).toContain(CONTENT[ATOM_A]);
    });

    it('top-entities: entity names come only from atoms the caller may read', async () => {
      const top = async () => (await call('GET', '/api/intelligence/top-entities?limit=100000')).json as Array<{ entity_id: string; atom_count: number | string }>;
      as(BOB);
      const bob = await top();
      expect(entityIds(bob)).toEqual([ENT_BOB, ENT_SHARED].sort());
      expect(Number(bob.find((e) => e.entity_id === ENT_SHARED)!.atom_count)).toBe(1);   // the shared atom only
      as(ADMIN, 'admin');
      const admin = await top();
      expect(entityIds(admin)).toEqual([ENT_ALICE, ENT_BOB, ENT_SHARED].sort());
      expect(Number(admin.find((e) => e.entity_id === ENT_SHARED)!.atom_count)).toBe(2);
    });
  });

  // ── Knowledge graph ─────────────────────────────────────────────────────

  describe('knowledge graph', () => {
    it('entity detail: atoms are own + shared, neighbours exclude entities the caller cannot see', async () => {
      as(BOB);
      const bob = await call('GET', `/api/knowledge-graph/entities/organisation/${ENT_SHARED}`);
      expect(bob.status).toBe(200);
      const body = bob.json as { atoms: unknown; neighbors: Array<{ id: string }> };
      expect(ours(body.atoms)).toEqual([ATOM_S]);
      const neighbours = body.neighbors.map((n) => n.id);
      expect(neighbours).toContain(ENT_PACK);
      expect(neighbours).not.toContain(ENT_ALICE);

      as(ALICE);
      const alice = (await call('GET', `/api/knowledge-graph/entities/organisation/${ENT_SHARED}`)).json as { atoms: unknown; neighbors: Array<{ id: string }> };
      expect(ours(alice.atoms)).toEqual([ATOM_A, ATOM_S].sort());
      expect(alice.neighbors.map((n) => n.id)).toContain(ENT_ALICE);
    });

    it('an entity named only in a colleague\'s atom is a 404, exactly like an unknown one', async () => {
      as(BOB);
      const foreign = await call('GET', `/api/knowledge-graph/entities/organisation/${ENT_ALICE}`);
      const unknown = await call('GET', `/api/knowledge-graph/entities/organisation/no-such-${H.tag}`);
      expect(foreign.status).toBe(404);
      expect(foreign.json).toEqual(unknown.json);
      // Negative controls: the owner, an admin and solo reach it.
      as(ALICE);
      expect((await call('GET', `/api/knowledge-graph/entities/organisation/${ENT_ALICE}`)).status).toBe(200);
      as(ADMIN, 'admin');
      expect((await call('GET', `/api/knowledge-graph/entities/organisation/${ENT_ALICE}`)).status).toBe(200);
      solo();
      expect((await call('GET', `/api/knowledge-graph/entities/organisation/${ENT_ALICE}`)).status).toBe(200);
    });

    it('entity list: visible entities only (pack entities are shared); admin sees all', async () => {
      as(BOB);
      const bob = entityIds((await call('GET', '/api/knowledge-graph/entities?limit=100000')).json);
      expect(bob).toEqual([ENT_BOB, ENT_PACK, ENT_SHARED].sort());
      as(ADMIN, 'admin');
      const admin = entityIds((await call('GET', '/api/knowledge-graph/entities?limit=100000')).json);
      expect(admin).toEqual([ENT_ALICE, ENT_BOB, ENT_M1, ENT_M2, ENT_PACK, ENT_SHARED].sort());
    });

    it('export: visible nodes, and only edges between two visible ends', async () => {
      const edgeIds = (edges: unknown) => (edges as Array<{ id: string }>).map((e) => e.id).filter((id) => id.endsWith(H.tag)).sort();
      as(BOB);
      const exp = (await call('GET', '/api/knowledge-graph/export?format=json')).json as { nodes: unknown; relationships: unknown };
      expect(entityIds(exp.nodes)).toEqual([ENT_BOB, ENT_PACK, ENT_SHARED].sort());
      expect(edgeIds(exp.relationships)).toEqual([`er-pack-${H.tag}`]);

      as(ADMIN, 'admin');
      const adminExp = (await call('GET', '/api/knowledge-graph/export?format=json')).json as { nodes: unknown; relationships: unknown };
      expect(entityIds(adminExp.nodes)).toContain(ENT_ALICE);
      expect(edgeIds(adminExp.relationships)).toEqual([`er-alice-${H.tag}`, `er-pack-${H.tag}`]);
    });

    it('subgraph: a start the caller cannot see is an empty graph; no edge ever reaches Alice\'s entity', async () => {
      // getEntitySubgraph (services/knowledge-graph.ts) does not await its own
      // traversal, so what it returns is whatever finished first — usually an
      // empty graph, which is why this test also passes against the pre-fix
      // route: the path did not leak in practice. The route filter is defence in
      // depth for the day the service awaits its traversal; only the properties
      // that hold whatever the timing are asserted.
      as(BOB);
      const hidden = (await call('GET', `/api/knowledge-graph/entities/organisation/${ENT_ALICE}/subgraph?maxDepth=1`)).json;
      expect(hidden).toEqual({ nodes: [], edges: [] });
      const sub = (await call('GET', `/api/knowledge-graph/entities/organisation/${ENT_SHARED}/subgraph?maxDepth=1`)).json as { edges: Array<{ id: string }> };
      expect(sub.edges.map((e) => e.id)).not.toContain(`er-alice-${H.tag}`);
    });

    it('analytics rankings drop entities the caller cannot see', async () => {
      as(BOB);
      const bob = entityIds((await call('GET', '/api/knowledge-graph/analytics/degree-centrality?limit=100000')).json);
      expect(bob).toContain(ENT_SHARED);
      expect(bob).not.toContain(ENT_ALICE);
      as(ADMIN, 'admin');
      expect(entityIds((await call('GET', '/api/knowledge-graph/analytics/degree-centrality?limit=100000')).json)).toContain(ENT_ALICE);
    });

    it('merge is admin-only on a team server; the merge log shows only visible entities', async () => {
      as(BOB);
      const refused = await call('POST', '/api/knowledge-graph/entities/merge', { entityType: 'organisation', fromId: ENT_M1, intoId: ENT_M2 });
      expect(refused.status).toBe(403);
      expect(await db.get('SELECT 1 AS ok FROM entity_nodes WHERE entity_id = ?', ENT_M1)).toBeTruthy();

      as(ADMIN, 'admin');
      const merged = await call('POST', '/api/knowledge-graph/entities/merge', { entityType: 'organisation', fromId: ENT_M1, intoId: ENT_M2 });
      expect(merged.status).toBe(200);
      expect(await db.get('SELECT 1 AS ok FROM entity_nodes WHERE entity_id = ?', ENT_M1)).toBeUndefined();

      const logged = (rows: unknown) => (rows as Array<{ merged_into: string }>).some((r) => r.merged_into === ENT_M2);
      expect(logged((await call('GET', '/api/knowledge-graph/merge-log?limit=1000')).json)).toBe(true);
      as(BOB);   // ENT_M2 is in no atom Bob can read and is not a pack entity
      expect(logged((await call('GET', '/api/knowledge-graph/merge-log?limit=1000')).json)).toBe(false);
    });
  });

  // ── Peers ───────────────────────────────────────────────────────────────

  describe('POST /api/p2p/knowledge-query', () => {
    const answer = async (): Promise<string[]> => {
      const res = await call('POST', '/api/p2p/knowledge-query', { fromHash: PEER, query: TOKEN, limit: 20 });
      expect(res.status).toBe(200);
      return ((res.json as { knowledgeAtoms: Array<{ content: string }> }).knowledgeAtoms).map((a) => a.content);
    };

    it('team mode: a peer gets shared, active atoms only — nobody\'s own, nothing retired', async () => {
      const contents = await answer();
      expect(contents).toContain(CONTENT[ATOM_S]);
      expect(contents).not.toContain(CONTENT[ATOM_A]);
      expect(contents).not.toContain(CONTENT[ATOM_B]);
      expect(contents).not.toContain(CONTENT[ATOM_X]);
    });

    it('solo: owned atoms are still answered (one human, no owner rule); retired ones are not', async () => {
      solo();
      const contents = await answer();
      expect(contents).toEqual(expect.arrayContaining([CONTENT[ATOM_A], CONTENT[ATOM_B], CONTENT[ATOM_S]]));
      expect(contents).not.toContain(CONTENT[ATOM_X]);
    });
  });

  // ── Checkpoint decisions ────────────────────────────────────────────────

  describe('checkpoint decisions are strictly the decider\'s own', () => {
    const decisionIds = (json: unknown, key: 'decisions' | 'results'): string[] =>
      ((json as Record<string, Array<{ id: string }>>)[key]).map((d) => d.id).sort();

    it('GET /knowledge/decisions/:workflowId and its distribution', async () => {
      const list = async () => decisionIds((await call('GET', `/api/knowledge/decisions/${encodeURIComponent(WORKFLOW)}`)).json, 'decisions');
      const dist = async () => ((await call('GET', `/api/knowledge/decisions/${encodeURIComponent(WORKFLOW)}/0/distribution`)).json as { distribution: Record<string, unknown> }).distribution;
      as(BOB);
      expect(await list()).toEqual([DEC_B]);
      expect(Object.keys(await dist())).toEqual(['reject']);
      as(ALICE);
      expect(await list()).toEqual([DEC_A]);
      as(ADMIN, 'admin');
      expect(await list()).toEqual([DEC_A, DEC_B]);
      expect(Object.keys(await dist()).sort()).toEqual(['approve', 'reject']);
      solo();
      expect(await list()).toEqual([DEC_A, DEC_B]);
    });

    it('POST /embeddings/search/decisions keeps only the caller\'s decisions', async () => {
      const search = async () => decisionIds((await call('POST', '/api/embeddings/search/decisions', { query: 'reasoning' })).json, 'results');
      as(BOB);
      expect(await search()).toEqual([DEC_B]);
      as(ADMIN, 'admin');
      expect(await search()).toEqual([DEC_A, DEC_B]);
      solo();
      expect(await search()).toEqual([DEC_A, DEC_B]);
    });

    it('POST /embeddings/similar: a colleague\'s decision is no seed, and no neighbour', async () => {
      const similar = async (seed: string) => decisionIds((await call('POST', '/api/embeddings/similar', { contentType: 'checkpoint', contentId: seed })).json, 'results');
      as(BOB);
      expect(await similar(DEC_A)).toEqual([]);                       // Alice's decision as the seed
      expect(await similar(DEC_B)).toEqual([ATOM_S, DEC_B].sort());   // own seed; own decision kept as a neighbour
      as(ALICE);
      expect(await similar(DEC_A)).toEqual([ATOM_S]);                 // Bob's decision dropped from the neighbours
      as(ADMIN, 'admin');
      expect(await similar(DEC_A)).toEqual([ATOM_S, DEC_B].sort());
    });
  });

  // ── Agent prompts ───────────────────────────────────────────────────────

  describe('agent-processor: the KNOWLEDGE BASE section', () => {
    const kb = async (agentId: string): Promise<string> => {
      await processor.processQuery(agentId, TOKEN);
      return H.prompts.at(-1)!.system ?? '';
    };

    it('team mode: the agent owner\'s atoms + shared ones, never a colleague\'s, nothing retired, no coding lesson', async () => {
      const system = await kb(AGENT);
      expect(system).toContain(CONTENT[ATOM_A]);          // the owner's
      expect(system).toContain(CONTENT[ATOM_S]);          // shared
      expect(system).not.toContain(CONTENT[ATOM_B]);      // a colleague's
      expect(system).not.toContain(CONTENT[ATOM_X]);      // retired
      expect(system).not.toContain(CONTENT[ATOM_CODE]);   // a coding project's lesson
    });

    it('team mode: an agent with no owner gets the shared atoms only', async () => {
      const system = await kb(AGENT_NO_OWNER);
      expect(system).toContain(CONTENT[ATOM_S]);
      expect(system).not.toContain(CONTENT[ATOM_A]);
      expect(system).not.toContain(CONTENT[ATOM_B]);
    });

    it('solo negative control: every owner\'s atoms still reach the agent', async () => {
      solo();
      const system = await kb(AGENT);
      expect(system).toContain(CONTENT[ATOM_A]);
      expect(system).toContain(CONTENT[ATOM_B]);
      expect(system).toContain(CONTENT[ATOM_S]);
      expect(system).not.toContain(CONTENT[ATOM_X]);
    });
  });
});
