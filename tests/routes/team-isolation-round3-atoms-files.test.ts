/**
 * team-isolation-round3-atoms-files.test.ts — round-2 verifier gaps
 * (not_to_github/TEAM_ISOLATION_ROUND2_GAPS_2026-09-23.md, "verify2:atoms-2" and
 * "verify2:files-2").
 *
 * On a team server a document chunk and a checkpoint decision are strictly their
 * owner's (rag_documents.uploaded_by, checkpoint_decisions.decided_by); a knowledge
 * atom is its owner's plus everyone's when shared (owner NULL). Each surface below
 * served other users' rows:
 *
 *   hybrid-search filterOwnedByScope       rag_chunk + checkpoint passed as unowned
 *   POST /api/embeddings/similar           colleagues' chunks / decisions as neighbours
 *   agent-processor buildContext (RAG)     every uploader's chunks in a linked collection
 *   agent-processor processQuery           any conversation id continued, any agent's
 *   GET/POST /api/memory/*                 every user's decisions; decided_by from the body
 *   task-auto-processor (peer tasks)       every user's atoms, retired ones too
 *   beehive selectAtomsForDisclosure       every user's atoms (+ the preview route)
 *   POST /api/p2p/knowledge-query          Coding Studio lessons
 *
 * Against a real PostgreSQL (ANTON_TEST_DATABASE_URL; skips without one). The
 * embedding adapter is mocked to one constant vector under a model name unique to
 * this run, so the VECTOR path returns every seeded row for any query and the
 * owner filter on it is what decides; the model is mocked so the prompt it would
 * have received can be read back.
 *
 * Every closed leak has a negative control: the owner, an admin and solo mode
 * still get the row.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import express, { type Response } from 'express';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';

const H = vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-team-isolation-round3';
  // Letters only, so the token survives the english tsvector parser as one lexeme.
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let tag = '';
  for (let i = 0; i < 10; i++) tag += letters[Math.floor(Math.random() * letters.length)];
  return {
    tag,
    model: `mock-embed-r3-${tag}`,
    /** Every call the mocked model received, in order. */
    calls: [] as Array<{ system: string; messages: Array<{ role: string; content: string }> }>,
  };
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
// institutional-memory embeds decisions through the OpenAI helper; same constant vector.
vi.mock('../../server/services/embeddings.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/embeddings.js')>();
  return {
    ...actual,
    generateEmbedding: async () => [1, 0, 0, 0],
    generateDecisionEmbedding: async () => [1, 0, 0, 0],
  };
});
vi.mock('../../server/services/provider-router.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/provider-router.js')>();
  const record = (opts: { system?: string; messages: Array<{ role: string; content: unknown }> }) => {
    H.calls.push({
      system: opts.system ?? '',
      messages: opts.messages.map((m) => ({ role: m.role, content: String(m.content) })),
    });
    return { text: 'mock answer', thinking: '', inputTokens: 1, outputTokens: 1 };
  };
  return {
    ...actual,
    callChat: vi.fn(async (opts: { system?: string; messages: Array<{ role: string; content: unknown }> }) => record(opts)),
    streamChat: vi.fn(async (opts: { system?: string; messages: Array<{ role: string; content: unknown }> }) => record(opts)),
  };
});
vi.mock('../../server/services/utility-model.js', () => ({ getRoutedUtilityModel: async () => 'sdk:claude-sonnet-5' }));
vi.mock('node-cron', () => ({ validate: () => true, schedule: () => ({ stop: () => undefined }) }));

const DATABASE_URL = resolveTestDatabaseUrl();
const describeOrSkip = DATABASE_URL ? describe : describe.skip;

const TOKEN = `quokka${H.tag}`;
const ALICE = `u-alice-${H.tag}`;
const BOB = `u-bob-${H.tag}`;
const ADMIN = `u-admin-${H.tag}`;

const COLLECTION = `col-${H.tag}`;
const DOC_A = `doc-a-${H.tag}`;
const DOC_B = `doc-b-${H.tag}`;
const DOC_N = `doc-n-${H.tag}`;           // unattributed upload
const CHUNK_A = `chunk-a-${H.tag}`;
const CHUNK_B = `chunk-b-${H.tag}`;
const CHUNK_N = `chunk-n-${H.tag}`;
const CHUNK_TEXT: Record<string, string> = {
  [CHUNK_A]: `${TOKEN} alice-doc: Alice's client contract renews at 4.2m.`,
  [CHUNK_B]: `${TOKEN} bob-doc: Bob's client is under a confidential review.`,
  [CHUNK_N]: `${TOKEN} nobody-doc: an upload written before ownership existed.`,
};

const WORKFLOW = `module:round3-${H.tag}`;
const DEC_A = [1, 2, 3].map((i) => `dec-a${i}-${H.tag}`);   // Alice's decisions
const DEC_B = [1, 2, 3].map((i) => `dec-b${i}-${H.tag}`);   // Bob's decisions

const SESSION_A = `sess-a-${H.tag}`;
const SESSION_B = `sess-b-${H.tag}`;
const MSG_A = `msg-a-${H.tag}`;
const MSG_B = `msg-b-${H.tag}`;
const MODULE_SEED = `mod-${H.tag}`;      // an unowned embedded row, usable by anyone as a seed

const PROJECT = `proj-${H.tag}`;
const CODING_PROJECT = `cp-${H.tag}`;
const AREA = `area-${H.tag}`;            // the atoms' source area, so full_context can be narrowed to them
const ATOM_A = `kna-a-${H.tag}`;          // Alice's
const ATOM_B = `kna-b-${H.tag}`;          // Bob's
const ATOM_S = `kna-s-${H.tag}`;          // shared (owner NULL)
const ATOM_X = `kna-x-${H.tag}`;          // shared but retired
const ATOM_CODE = `kna-code-${H.tag}`;    // an unattributable Coding Studio lesson (owner NULL)
const ATOM_CONTENT: Record<string, string> = {
  [ATOM_A]: `${TOKEN} alpha: Alice's client restructures its onboarding.`,
  [ATOM_B]: `${TOKEN} bravo: Bob's client faces an enforcement notice.`,
  [ATOM_S]: `${TOKEN} shared: AMLR applies from July 2027.`,
  [ATOM_X]: `${TOKEN} retired: this atom was erased by deactivation.`,
  [ATOM_CODE]: `${TOKEN} coding: the ledger test fails on the release branch.`,
};

const AGENT_A = `agent-a-${H.tag}`;       // Alice's agent, linked to the shared collection
const AGENT_B = `agent-b-${H.tag}`;       // Bob's agent
const AGENT_NONE = `agent-n-${H.tag}`;    // an agent with no owner
const PEER = `peer-${H.tag}`;
const CONNECTION = `cc-${H.tag}`;

type Caller = { id: string; role: 'admin' | 'analyst' };

describeOrSkip('team isolation round 3: owned chunks, decisions, conversations and peer-facing atoms', () => {
  let db: import('../../server/db/database.js').DatabaseAdapter;
  let hybrid: typeof import('../../server/services/hybrid-search.js');
  let processor: Awaited<ReturnType<typeof import('../../server/services/agent-processor.js').createAgentProcessor>>;
  let server: Server;
  let base = '';
  let caller: Caller = { id: BOB, role: 'analyst' };
  let hiveId = '';
  let seededIdentityId: string | null = null;
  /** SQL + params of every db.all the memory routes ran (they get a recording adapter). */
  const memoryReads: Array<{ sql: string; params: unknown[] }> = [];
  const savedMode = process.env.DEPLOYMENT_MODE;

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });
    hybrid = await import('../../server/services/hybrid-search.js');

    for (const id of [ALICE, BOB]) {
      await db.run(
        `INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, 'test-fixture', 'analyst') ON CONFLICT (id) DO NOTHING`,
        id, id);
    }
    const addEmbedding = async (type: string, id: string, text: string) => db.run(
      `INSERT INTO embeddings (id, content_type, content_id, content_text, embedding, embedding_model, embedding_dimension, metadata)
       VALUES (?, ?, ?, ?, '[1,0,0,0]', ?, 4, '{}')`,
      randomUUID(), type, id, text, H.model);

    // A shared collection holding Alice's, Bob's and an unattributed document.
    await db.run(
      "INSERT INTO knowledge_collections (id, name, display_name, created_by) VALUES (?, ?, 'Round 3', 'system')",
      COLLECTION, COLLECTION);
    for (const [doc, chunk, owner] of [[DOC_A, CHUNK_A, ALICE], [DOC_B, CHUNK_B, BOB], [DOC_N, CHUNK_N, null]] as const) {
      await db.run(
        `INSERT INTO rag_documents (id, collection_id, filename, file_path, file_type, uploaded_by, index_status)
         VALUES (?, ?, ?, ?, 'md', ?, 'indexed')`,
        doc, COLLECTION, `${doc}.md`, `/nonexistent/${doc}.md`, owner);
      await db.run(
        'INSERT INTO rag_chunks (id, document_id, chunk_index, content, chroma_id) VALUES (?, ?, 0, ?, ?)',
        chunk, doc, CHUNK_TEXT[chunk], chunk);
      await addEmbedding('rag_chunk', chunk, CHUNK_TEXT[chunk]);
    }

    // Checkpoint decisions: three each, with the legacy embedding column (memory
    // routes) and, for the first of each, a row in the embeddings table (search).
    for (const [ids, who] of [[DEC_A, ALICE], [DEC_B, BOB]] as const) {
      for (const id of ids) {
        await db.run(
          `INSERT INTO checkpoint_decisions (id, execution_id, workflow_id, step_index, human_decision, human_reasoning,
                                             decided_by, embedding, ai_confidence)
           VALUES (?, 'exec-round3', ?, 0, ?, ?, ?, '[1,0,0,0]', 0.8)`,
          id, WORKFLOW, `${who} decision ${id}`, `${who} private reasoning`, who);
      }
      await addEmbedding('checkpoint', ids[0], `Decision: ${who} private reasoning ${TOKEN}`);
    }

    // Session outputs (already owned before this round — a regression control).
    for (const [session, msg, who] of [[SESSION_A, MSG_A, ALICE], [SESSION_B, MSG_B, BOB]] as const) {
      await db.run(`INSERT INTO sessions (id, module_id, title, config, user_id) VALUES (?, 'gap-analysis', 'round3', '{}', ?)`, session, who);
      await db.run(`INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, 'assistant', ?)`, msg, session, `${who} output`);
      await addEmbedding('session_output', msg, `${who} output ${TOKEN}`);
    }
    await addEmbedding('module', MODULE_SEED, `a module description ${TOKEN}`);

    // Atoms, dated ahead so the "recent" reads cannot be crowded out by other suites.
    await db.run(`INSERT INTO projects (id, name, user_id) VALUES (?, 'round3', ?)`, PROJECT, ALICE);
    await db.run(`INSERT INTO coding_projects (id, project_id, name) VALUES (?, ?, 'round3')`, CODING_PROJECT, PROJECT);
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
         VALUES (?, 'test-round3', 'test-round3', ?, 'gap-analysis', ?, 'observation.finding', 0.9, 'observation', ?, ?, ?,
                 NOW() + INTERVAL '1 day')`,
        id, AREA, ATOM_CONTENT[id], owner, active, codingProject);
    }

    for (const [id, owner] of [[AGENT_A, ALICE], [AGENT_B, BOB], [AGENT_NONE, null]] as const) {
      await db.run(
        `INSERT INTO agent_profiles (id, name, slug, role_description, system_prompt, status, created_by,
                                     knowledge_collection_ids, rag_search_enabled)
         VALUES (?, 'Round 3 agent', ?, 'test agent', 'You are a test agent.', 'active', ?, ?::jsonb, TRUE)`,
        id, id, owner, JSON.stringify([COLLECTION]));
    }

    // A peer that may delegate tasks and query knowledge.
    await db.run(
      `INSERT INTO community_connections (id, owner_user_id, contact_hash, public_key, status, delegation_trust_level)
       VALUES (?, ?, ?, 'pk', 'accepted', 'auto')`,
      CONNECTION, ALICE, PEER);
    // The inbound-task path needs the instance's community identity. Use the one
    // this database has; seed one only when there is none, and remove only that.
    const mine = `ci_r3_${H.tag}`;
    await db.run(
      `INSERT INTO community_identity (id, contact_hash, display_name, public_key, user_id)
       VALUES (?, ?, 'round3 identity', 'test-public-key', 'default') ON CONFLICT DO NOTHING`,
      mine, `ANTON-R3-${H.tag}`);
    const identity = await db.get<{ id: string }>("SELECT id FROM community_identity WHERE user_id = 'default'");
    seededIdentityId = identity?.id === mine ? mine : null;

    const { createBeehiveManager } = await import('../../server/services/beehive/beehive-manager.js');
    const hive = await createBeehiveManager(db).createHive(
      { name: 'Round 3 hive', question: TOKEN, type: 'deliberation' },
      `queen-${H.tag}`, 'Queen', { level: 'atoms_domain', max_atoms_shared: 50 },
    );
    hiveId = hive.id;

    const { createAgentProcessor } = await import('../../server/services/agent-processor.js');
    processor = await createAgentProcessor(db);

    // The memory routes get an adapter that records every read, so the limit cap
    // can be checked on the statement itself. Object.create keeps the adapter's
    // own methods and state reachable through the prototype.
    const recording = Object.create(db) as typeof db;
    recording.all = (async (sql: string, ...params: unknown[]) => {
      memoryReads.push({ sql, params });
      return db.all(sql, ...params);
    }) as typeof db.all;

    const { createEmbeddingRoutes } = await import('../../server/routes/embeddings.js');
    const { createMemoryRoutes } = await import('../../server/routes/memory.js');
    const { createP2PRoutes } = await import('../../server/routes/p2p.js');
    const { createBeehiveRoutes } = await import('../../server/routes/beehive.js');
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { id: caller.id, username: caller.id, role: caller.role }; next(); });
    app.use('/api/embeddings', await createEmbeddingRoutes(db));
    app.use('/api', await createMemoryRoutes(recording));
    app.use('/api', await createP2PRoutes(db));
    app.use('/api', createBeehiveRoutes(db));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no server address');
    base = `http://127.0.0.1:${addr.port}`;
  }, 60_000);

  afterAll(async () => {
    try {
      await db.run('DELETE FROM embeddings WHERE embedding_model = ?', H.model);
      await db.run('DELETE FROM knowledge_collections WHERE id = ?', COLLECTION);   // cascades documents + chunks
      await db.run('DELETE FROM checkpoint_decisions WHERE workflow_id = ?', WORKFLOW);
      await db.run('DELETE FROM sessions WHERE id IN (?, ?)', SESSION_A, SESSION_B);   // cascades messages
      await db.run(`DELETE FROM knowledge_atoms WHERE id IN (?, ?, ?, ?, ?)`, ATOM_A, ATOM_B, ATOM_S, ATOM_X, ATOM_CODE);
      await db.run('DELETE FROM coding_projects WHERE id = ?', CODING_PROJECT);
      await db.run('DELETE FROM projects WHERE id = ?', PROJECT);
      await db.run('DELETE FROM agent_profiles WHERE id IN (?, ?, ?)', AGENT_A, AGENT_B, AGENT_NONE);   // conversations cascade
      await db.run(
        'DELETE FROM community_task_messages WHERE task_id IN (SELECT id FROM community_delegated_tasks WHERE requester_hash = ?)', PEER);
      await db.run('DELETE FROM community_delegated_tasks WHERE requester_hash = ?', PEER);
      await db.run('DELETE FROM community_connections WHERE id = ?', CONNECTION);
      if (seededIdentityId) await db.run('DELETE FROM community_identity WHERE id = ?', seededIdentityId);
      if (hiveId) await db.run('DELETE FROM beehive_sessions WHERE id = ?', hiveId);   // participants cascade
      await db.run('DELETE FROM users WHERE id IN (?, ?)', ALICE, BOB);
    } finally {
      await new Promise<void>((resolve) => { server?.close(() => resolve()); });
      await db?.close();
    }
  });

  beforeEach(() => {
    process.env.DEPLOYMENT_MODE = 'team';
    caller = { id: BOB, role: 'analyst' };
    H.calls.length = 0;
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

  const OURS = new Set([CHUNK_A, CHUNK_B, CHUNK_N, ...DEC_A, ...DEC_B, MSG_A, MSG_B, MODULE_SEED]);
  /** This run's seeded ids among `rows`, sorted — other suites' rows are ignored. */
  const ids = (rows: Array<{ id?: string; content_id?: string }>): string[] =>
    rows.map((r) => String(r.content_id ?? r.id)).filter((id) => OURS.has(id)).sort();
  const sorted = (xs: string[]) => [...xs].sort();

  // ── hybrid-search: rag_chunk and checkpoint are owned types ─────────────

  describe('hybrid-search filterOwnedByScope', () => {
    const everything = sorted([CHUNK_A, CHUNK_B, CHUNK_N, DEC_A[0], DEC_B[0], MSG_A, MSG_B, MODULE_SEED]);

    it('POST /embeddings/similar from an unowned seed: a colleague\'s chunks, decisions and outputs are never neighbours', async () => {
      const similar = async () => {
        const res = await call('POST', '/api/embeddings/similar', { contentType: 'module', contentId: MODULE_SEED, topK: 50 });
        expect(res.status).toBe(200);
        return ids((res.json as { results: Array<{ id: string }> }).results);
      };
      as(BOB);
      expect(await similar()).toEqual(sorted([CHUNK_B, DEC_B[0], MSG_B]));
      as(ALICE);
      expect(await similar()).toEqual(sorted([CHUNK_A, DEC_A[0], MSG_A]));
      // Negative controls: an admin and solo see every neighbour, the unattributed upload included.
      as(ADMIN, 'admin');
      expect(await similar()).toEqual(everything.filter((id) => id !== MODULE_SEED));
      solo();
      expect(await similar()).toEqual(everything.filter((id) => id !== MODULE_SEED));
    });

    it('POST /embeddings/similar: a colleague\'s chunk or decision as the seed answers exactly like an unknown id', async () => {
      const seed = async (contentType: string, contentId: string) =>
        (await call('POST', '/api/embeddings/similar', { contentType, contentId, topK: 50 })).json as { results: Array<{ id: string }>; total: number };
      as(BOB);
      const unknown = await seed('rag_chunk', `no-such-${H.tag}`);
      expect(unknown).toEqual({ results: [], total: 0 });
      expect(await seed('rag_chunk', CHUNK_A)).toEqual(unknown);
      expect(await seed('checkpoint', DEC_A[0])).toEqual(unknown);
      expect(await seed('rag_chunk', CHUNK_N)).toEqual(unknown);   // unattributed: nobody's to mine in team mode
      // Negative controls: one's own seed works; solo and an admin may seed from anything.
      expect(ids((await seed('rag_chunk', CHUNK_B)).results)).toEqual(sorted([DEC_B[0], MSG_B, MODULE_SEED]));
      as(ADMIN, 'admin');
      expect(ids((await seed('rag_chunk', CHUNK_A)).results)).toContain(CHUNK_B);
      solo();
      expect(ids((await seed('checkpoint', DEC_A[0])).results)).toContain(DEC_B[0]);
    });

    it('POST /embeddings/search/decisions (real search): only the caller\'s own decisions', async () => {
      const search = async () => ids(((await call('POST', '/api/embeddings/search/decisions', { query: TOKEN, topK: 20 })).json as { results: Array<{ id: string }> }).results);
      as(BOB);
      expect(await search()).toEqual([DEC_B[0]]);
      as(ADMIN, 'admin');
      expect(await search()).toEqual(sorted([DEC_A[0], DEC_B[0]]));
      solo();
      expect(await search()).toEqual(sorted([DEC_A[0], DEC_B[0]]));
    });

    it('an "all types" search (Pathfinder\'s shape) drops a colleague\'s decision; the companion app\'s NO_OWNED_CONTENT drops every decision', async () => {
      const search = async (scope: import('../../server/services/hybrid-search.js').SearchScope) =>
        ids(await hybrid.hybridSearch(db, { query: TOKEN, topK: 50, includeDocumentChunks: false, scope }));
      const bob = await search({ kind: 'user', userId: BOB });
      expect(bob).toContain(DEC_B[0]);
      expect(bob).not.toContain(DEC_A[0]);
      expect(bob).toContain(MODULE_SEED);                         // unowned types still pass
      expect(bob.filter((id) => id.startsWith('chunk-'))).toEqual([]);   // all-types callers never get chunks
      const phone = await search(hybrid.NO_OWNED_CONTENT);
      expect(phone).toEqual([MODULE_SEED]);
      // Negative controls: solo keeps the companion app's decisions, exactly as before.
      solo();
      expect(await search(hybrid.NO_OWNED_CONTENT)).toEqual(sorted([DEC_A[0], DEC_B[0], MODULE_SEED]));
      expect(await search(hybrid.searchScopeForRequest({ user: { id: 'solo', role: 'admin' } }))).toEqual(
        sorted([DEC_A[0], DEC_B[0], MSG_A, MSG_B, MODULE_SEED]));
    });

    it('a search that names rag_chunk returns only the caller\'s own documents\' chunks', async () => {
      const chunks = async (scope: import('../../server/services/hybrid-search.js').SearchScope) =>
        ids(await hybrid.hybridSearch(db, { query: TOKEN, contentTypes: ['rag_chunk'], topK: 50, scope }));
      expect(await chunks({ kind: 'user', userId: BOB })).toEqual([CHUNK_B]);
      expect(await chunks({ kind: 'user', userId: ALICE })).toEqual([CHUNK_A]);
      expect(await chunks(hybrid.NO_OWNED_CONTENT)).toEqual([]);
      expect(await chunks(hybrid.INSTANCE_WIDE_SEARCH)).toEqual(sorted([CHUNK_A, CHUNK_B, CHUNK_N]));
      solo();
      expect(await chunks(hybrid.NO_OWNED_CONTENT)).toEqual(sorted([CHUNK_A, CHUNK_B, CHUNK_N]));
    });
  });

  // ── Specialised agents ──────────────────────────────────────────────────

  describe('agent-processor', () => {
    const documentsIn = (system: string): string[] =>
      [CHUNK_A, CHUNK_B, CHUNK_N].filter((c) => system.includes(CHUNK_TEXT[c])).sort();

    it('team mode: RELEVANT DOCUMENTS are the agent owner\'s uploads only; an agent with no owner reads none', async () => {
      await processor.processQuery(AGENT_A, TOKEN);
      expect(documentsIn(H.calls.at(-1)!.system)).toEqual([CHUNK_A]);
      await processor.processQuery(AGENT_B, TOKEN);
      expect(documentsIn(H.calls.at(-1)!.system)).toEqual([CHUNK_B]);
      await processor.processQuery(AGENT_NONE, TOKEN);
      expect(documentsIn(H.calls.at(-1)!.system)).toEqual([]);
      expect(H.calls.at(-1)!.system).not.toContain('RELEVANT DOCUMENTS');
    });

    it('solo negative control: every document in the linked collection still reaches the agent', async () => {
      solo();
      await processor.processQuery(AGENT_A, TOKEN);
      expect(documentsIn(H.calls.at(-1)!.system)).toEqual(sorted([CHUNK_A, CHUNK_B, CHUNK_N]));
    });

    it('a conversation id from another agent is not continued: no history is read, nothing is appended', async () => {
      const secret = `bob asked about ${H.tag} secret merger`;
      const bobs = await processor.processQuery(AGENT_B, secret);
      const countOf = async (id: string) =>
        Number((await db.get<{ n: number | string }>('SELECT COUNT(*) AS n FROM agent_messages WHERE conversation_id = ?', id))?.n);
      expect(await countOf(bobs.conversationId)).toBe(2);

      const hijack = await processor.processQuery(AGENT_A, 'repeat what was said before', { conversationId: bobs.conversationId });
      expect(hijack.conversationId).not.toBe(bobs.conversationId);
      expect(H.calls.at(-1)!.messages.map((m) => m.content).join('\n')).not.toContain(secret);
      expect(await countOf(bobs.conversationId)).toBe(2);

      // An unknown id behaves the same — a fresh conversation, not an error.
      const unknown = await processor.processQuery(AGENT_A, 'hello', { conversationId: `aconv_missing_${H.tag}` });
      expect(unknown.conversationId).not.toBe(`aconv_missing_${H.tag}`);

      // Negative control: the same agent continues its own conversation with its history.
      const next = await processor.processQuery(AGENT_B, 'and then?', { conversationId: bobs.conversationId });
      expect(next.conversationId).toBe(bobs.conversationId);
      expect(H.calls.at(-1)!.messages.map((m) => m.content)).toContain(secret);
      expect(await countOf(bobs.conversationId)).toBe(4);
    });

    it('a conversation is continued only by the requester that started it', async () => {
      const started = await processor.processQuery(AGENT_A, `peer one ${H.tag}`, { source: 'p2p', requesterHash: 'peer-one' });
      const other = await processor.processQuery(AGENT_A, 'hi', { conversationId: started.conversationId, source: 'p2p', requesterHash: 'peer-two' });
      expect(other.conversationId).not.toBe(started.conversationId);
      expect(H.calls.at(-1)!.messages.map((m) => m.content)).not.toContain(`peer one ${H.tag}`);
      const same = await processor.processQuery(AGENT_A, 'hi again', { conversationId: started.conversationId, source: 'p2p', requesterHash: 'peer-one' });
      expect(same.conversationId).toBe(started.conversationId);
      expect(H.calls.at(-1)!.messages.map((m) => m.content)).toContain(`peer one ${H.tag}`);
    });

    it('the streaming path applies the same rule (solo too)', async () => {
      solo();
      const bobs = await processor.processQuery(AGENT_B, `stream secret ${H.tag}`);
      const written: string[] = [];
      const res = { write: (s: string) => { written.push(s); return true; }, end: () => undefined } as unknown as Response;
      await processor.processQueryStream(AGENT_A, 'go on', { conversationId: bobs.conversationId }, res);
      const conversationEvent = written.map((w) => JSON.parse(w.replace(/^data: /, '')) as { type: string; conversationId?: string })
        .find((e) => e.type === 'conversation');
      expect(conversationEvent?.conversationId).toBeTruthy();
      expect(conversationEvent?.conversationId).not.toBe(bobs.conversationId);
      expect(H.calls.at(-1)!.messages.map((m) => m.content)).not.toContain(`stream secret ${H.tag}`);
    });
  });

  // ── /api/memory ─────────────────────────────────────────────────────────

  describe('/api/memory checkpoint decisions are strictly the decider\'s own', () => {
    const q = `workflowId=${encodeURIComponent(WORKFLOW)}`;
    const historyIds = (json: unknown) =>
      ((json as { recentDecisions: Array<{ id: string }> }).recentDecisions).map((d) => d.id).sort();

    it('GET /memory/checkpoints and /memory/insights', async () => {
      as(BOB);
      const bob = (await call('GET', `/api/memory/checkpoints?${q}`)).json;
      expect(historyIds(bob)).toEqual(sorted(DEC_B));
      expect((await call('GET', `/api/memory/checkpoints?${q}&decidedBy=${ALICE}`)).json).toMatchObject({ totalDecisions: 0 });
      expect((await call('GET', `/api/memory/insights?${q}`)).json).toMatchObject({ totalDecisions: 3 });
      as(ADMIN, 'admin');
      expect(historyIds((await call('GET', `/api/memory/checkpoints?${q}`)).json)).toEqual(sorted([...DEC_A, ...DEC_B]));
      expect((await call('GET', `/api/memory/insights?${q}`)).json).toMatchObject({ totalDecisions: 6 });
      solo();
      expect(historyIds((await call('GET', `/api/memory/checkpoints?${q}`)).json)).toEqual(sorted([...DEC_A, ...DEC_B]));
    });

    it('GET /memory/checkpoints caps the limit', async () => {
      solo();
      memoryReads.length = 0;
      expect((await call('GET', `/api/memory/checkpoints?${q}&limit=100000`)).status).toBe(200);
      expect(memoryReads.at(-1)!.params.at(-1)).toBe(200);
      expect((await call('GET', `/api/memory/checkpoints?${q}&limit=junk`)).status).toBe(200);
      expect(memoryReads.at(-1)!.params.at(-1)).toBe(20);
    });

    it('POST /memory/checkpoints/similar and GET /memory/clusters', async () => {
      const similar = async () => (((await call('POST', '/api/memory/checkpoints/similar', { decisionText: 'x', workflowId: WORKFLOW, limit: 50 })).json as { decisions: Array<{ id: string }> }).decisions).map((d) => d.id).sort();
      const clustered = async () => (((await call('GET', `/api/memory/clusters?${q}`)).json as { clusters: Array<{ decisions: Array<{ id: string }> }> }).clusters)
        .flatMap((c) => c.decisions.map((d) => d.id)).sort();
      as(BOB);
      expect(await similar()).toEqual(sorted(DEC_B));
      expect(await clustered()).toEqual(sorted(DEC_B));
      as(ADMIN, 'admin');
      expect(await similar()).toEqual(sorted([...DEC_A, ...DEC_B]));
      expect(await clustered()).toEqual(sorted([...DEC_A, ...DEC_B]));
    });

    it('PUT /memory/checkpoints/:id/feedback: a colleague\'s decision is a 404 like a missing one and is not changed', async () => {
      const feedbackOf = async (id: string) =>
        (await db.get<{ user_feedback: number | null }>('SELECT user_feedback FROM checkpoint_decisions WHERE id = ?', id))?.user_feedback ?? null;
      as(BOB);
      const foreign = await call('PUT', `/api/memory/checkpoints/${DEC_A[1]}/feedback`, { feedback: -1 });
      const missing = await call('PUT', `/api/memory/checkpoints/no-such-${H.tag}/feedback`, { feedback: -1 });
      expect(foreign.status).toBe(404);
      expect(foreign.json).toEqual(missing.json);
      expect(await feedbackOf(DEC_A[1])).toBeNull();
      // Negative controls: the decider, an admin and solo record feedback.
      expect((await call('PUT', `/api/memory/checkpoints/${DEC_B[1]}/feedback`, { feedback: 1 })).status).toBe(200);
      expect(await feedbackOf(DEC_B[1])).toBe(1);
      as(ADMIN, 'admin');
      expect((await call('PUT', `/api/memory/checkpoints/${DEC_A[1]}/feedback`, { feedback: 1 })).status).toBe(200);
      expect(await feedbackOf(DEC_A[1])).toBe(1);
      solo();
      expect((await call('PUT', `/api/memory/checkpoints/${DEC_A[2]}/feedback`, { feedback: -1 })).status).toBe(200);
      expect(await feedbackOf(DEC_A[2])).toBe(-1);
    });

    it('POST /memory/checkpoints records the signed-in user, never a decidedBy from the body', async () => {
      const save = async () => {
        const res = await call('POST', '/api/memory/checkpoints', {
          executionId: `exec-${H.tag}`, workflowId: WORKFLOW, stepIndex: 1, humanDecision: 'approve', decidedBy: ALICE,
        });
        expect(res.status).toBe(200);
        const id = (res.json as { id: string }).id;
        return (await db.get<{ decided_by: string }>('SELECT decided_by FROM checkpoint_decisions WHERE id = ?', id))?.decided_by;
      };
      as(BOB);
      expect(await save()).toBe(BOB);
      solo();
      expect(await save()).toBe('solo');
    });
  });

  // ── Peer-facing atom surfaces ───────────────────────────────────────────

  describe('atoms that leave the instance', () => {
    const atomsIn = (text: string): string[] =>
      [ATOM_A, ATOM_B, ATOM_S, ATOM_X, ATOM_CODE].filter((a) => text.includes(ATOM_CONTENT[a])).sort();

    /** Run a peer-delegated task through the generic processor; returns the prompt it built. */
    async function delegatedTaskPrompt(): Promise<string> {
      const { createTaskAutoProcessor } = await import('../../server/services/task-auto-processor.js');
      // The processor also asks every connected peer with an endpoint; nothing outside
      // this test may be contacted, so any fetch that is not to this test's server fails.
      const realFetch = globalThis.fetch;
      const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.startsWith(base)) return realFetch(input, init);
        throw new Error('network disabled in this test');
      });
      try {
        const r = await (await createTaskAutoProcessor(db)).processInboundTask(PEER, { taskId: `t-${randomUUID()}`, title: TOKEN, description: '' });
        expect(r.status).toBe('completed');
      } finally {
        spy.mockRestore();
      }
      return H.calls.at(-1)!.messages.map((m) => m.content).join('\n');
    }

    it('peer-delegated task, team mode: LOCAL KNOWLEDGE is shared, active, non-coding atoms only', async () => {
      expect(atomsIn(await delegatedTaskPrompt())).toEqual([ATOM_S]);
    });

    it('peer-delegated task, solo: everyone\'s active atoms, still no retired atom or coding lesson', async () => {
      solo();
      expect(atomsIn(await delegatedTaskPrompt())).toEqual(sorted([ATOM_A, ATOM_B, ATOM_S]));
    });

    it('POST /p2p/knowledge-query never answers with a Coding Studio lesson (team and solo)', async () => {
      const answer = async () => atomsIn(((await call('POST', '/api/p2p/knowledge-query', { fromHash: PEER, query: TOKEN, limit: 20 })).json as
        { knowledgeAtoms: Array<{ content: string }> }).knowledgeAtoms.map((a) => a.content).join('\n'));
      expect(await answer()).toEqual([ATOM_S]);
      solo();
      expect(await answer()).toEqual(sorted([ATOM_A, ATOM_B, ATOM_S]));
    });

    it('beehive: disclosure and its preview are the instance\'s shared atoms only on a team server', async () => {
      const { createBeehiveKnowledge } = await import('../../server/services/beehive/beehive-knowledge.js');
      const knowledge = createBeehiveKnowledge(db);
      for (const level of ['atoms_domain', 'full_context'] as const) {
        const shared = await knowledge.selectAtomsForDisclosure({
          hiveQuestion: TOKEN,   // atoms_domain ANDs its keywords, so the question is the one token
          policy: { level, max_atoms_shared: 500, excluded_clients: [], excluded_tags: [], redact_names: false, require_human_approval: false },
          scopeAreas: level === 'full_context' ? [AREA] : undefined,
        });
        const got = atomsIn(shared.map((a) => a.content).join('\n'));
        expect(got).toContain(ATOM_S);
        expect(got).not.toContain(ATOM_A);
        expect(got).not.toContain(ATOM_B);
        expect(got).not.toContain(ATOM_X);
        expect(got).not.toContain(ATOM_CODE);   // a private codebase's lesson, even unattributed
      }
      const preview = await call('GET', `/api/beehive/hives/${hiveId}/disclosable-atoms?contact_hash=queen-${H.tag}`);
      expect(preview.status).toBe(200);
      const previewed = atomsIn((preview.json as { atoms: Array<{ content: string }> }).atoms.map((a) => a.content).join('\n'));
      expect(previewed).toContain(ATOM_S);
      expect(previewed).not.toContain(ATOM_A);
      expect(previewed).not.toContain(ATOM_B);

      // Negative control: solo discloses every active atom, as before — except a
      // Code Studio lesson, which /p2p/knowledge-query never answers with either.
      solo();
      const soloPreview = await call('GET', `/api/beehive/hives/${hiveId}/disclosable-atoms?contact_hash=queen-${H.tag}`);
      const soloAtoms = atomsIn((soloPreview.json as { atoms: Array<{ content: string }> }).atoms.map((a) => a.content).join('\n'));
      expect(soloAtoms).toEqual(expect.arrayContaining([ATOM_A, ATOM_B, ATOM_S]));
      expect(soloAtoms).not.toContain(ATOM_X);
      expect(soloAtoms).not.toContain(ATOM_CODE);
    });
  });
});
