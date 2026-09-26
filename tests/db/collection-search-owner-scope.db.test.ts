/**
 * collection-search-owner-scope.db.test.ts — collection search returns only the
 * caller's own documents on a team server (round-2 gap "verify:files",
 * collection search / GET /collections/:id/documents / POST /api/search).
 *
 * Collections are shared; each document in one belongs to its uploader
 * (rag_documents.uploaded_by). searchCollections, keywordSearch and
 * getChunkContext never filtered on it, so every collection route — and the
 * chat's knowledgeSources.ragSearch — handed any user every uploader's chunks.
 * POST /api/search leaked the same chunks through its vector leg when asked for
 * contentTypes ['rag_chunk'] (and other users' checkpoint decisions to any
 * search), and read any folder index by path.
 *
 * Seeds one collection holding Alice's, Bob's and an unattributed document, with
 * chunk vectors for a fake 4-d embedding model (the platform adapter is mocked,
 * so no embedding provider is needed), plus a folder index over a stand-in
 * upload store and one over a shared folder. Then, through the production
 * PostgreSQL adapter and the real routes:
 *   - team mode, Alice (analyst): only her own chunks/documents, on every path;
 *     Bob's chunk id answers like an unknown one; the upload-store index is not
 *     searchable by path; /search/embed is refused;
 *   - negative controls: Bob sees his own, a team admin and the solo user see
 *     every document, and Alice still searches the shared folder index.
 *
 * Skips without a test database (tests/setup/db-guard.ts decides which).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseAdapter } from '../../server/db/database.js';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';

const h = vi.hoisted(() => {
  const tag = Math.random().toString(36).slice(2, 10);
  const model = `fake-owner-scope-${tag}`;
  const adapter = {
    provider: 'ollama',
    model,
    dimensions: 4,
    async embed(): Promise<number[]> { return [1, 0, 0, 0]; },
    async embedBatch(texts: string[]): Promise<number[][]> { return texts.map(() => [1, 0, 0, 0]); },
  };
  return { tag, model, adapter };
});

vi.mock('../../server/services/embedding-adapter.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/embedding-adapter.js')>();
  return { ...actual, getEmbeddingAdapter: () => h.adapter };
});

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

interface Caller { id: string; username: string; role: string }
interface ResultRow { documentId?: string; chunkId?: string; content?: string; id?: string; content_type?: string; content_id?: string }

d('collection search — owner scope against the real schema', () => {
  const { tag } = h;
  const alice = `u_cs_alice_${tag}`;
  const bob = `u_cs_bob_${tag}`;
  const ALICE: Caller = { id: alice, username: alice, role: 'analyst' };
  const BOB: Caller = { id: bob, username: bob, role: 'analyst' };
  const ADMIN: Caller = { id: `u_cs_admin_${tag}`, username: 'admin', role: 'admin' };
  const SOLO: Caller = { id: 'solo', username: 'solo', role: 'admin' };

  const col = `col_cs_${tag}`;
  const docA = `doc_cs_a_${tag}`;
  const docB = `doc_cs_b_${tag}`;
  const docN = `doc_cs_n_${tag}`;
  const chunks: Array<{ id: string; doc: string; idx: number; text: string }> = [
    { id: `ch_a0_${tag}`, doc: docA, idx: 0, text: `sanctions screening ALICE-SECRET-${tag} part zero` },
    { id: `ch_a1_${tag}`, doc: docA, idx: 1, text: `sanctions screening ALICE-SECRET-${tag} part one` },
    { id: `ch_a2_${tag}`, doc: docA, idx: 2, text: `sanctions screening ALICE-SECRET-${tag} part two` },
    { id: `ch_b0_${tag}`, doc: docB, idx: 0, text: `sanctions screening BOB-SECRET-${tag} part zero` },
    { id: `ch_b1_${tag}`, doc: docB, idx: 1, text: `sanctions screening BOB-SECRET-${tag} part one` },
    { id: `ch_n0_${tag}`, doc: docN, idx: 0, text: `sanctions screening UNOWNED-${tag} part zero` },
  ];
  const ALICE_MARK = `ALICE-SECRET-${tag}`;
  const BOB_MARK = `BOB-SECRET-${tag}`;
  const UNOWNED_MARK = `UNOWNED-${tag}`;
  const UPLOAD_INDEX_MARK = `UPLOAD-INDEX-${tag}`;
  const SHARED_INDEX_MARK = `SHARED-INDEX-${tag}`;
  const FOLDER_QUERY = 'sanctions screening alpha bravo charlie';

  let db: DatabaseAdapter;
  let server: Server;
  let base = '';
  let current: Caller = ALICE;
  let sandbox = '';
  let uploadsDir = '';
  let sharedDir = '';
  const folderChunkIds: string[] = [];
  const cpA = `cp_cs_a_${tag}`;
  const cpB = `cp_cs_b_${tag}`;

  const ENV_KEYS = ['DEPLOYMENT_MODE', 'UPLOAD_DIR', 'ALLOWED_FOLDER_PATHS'] as const;
  const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

  let search: typeof import('../../server/services/semantic-search.js');

  beforeAll(async () => {
    sandbox = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'anton-cs-owner-')));
    uploadsDir = path.join(sandbox, 'uploads');
    sharedDir = path.join(sandbox, 'shared');
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.mkdirSync(sharedDir, { recursive: true });
    process.env.UPLOAD_DIR = uploadsDir;
    process.env.ALLOWED_FOLDER_PATHS = sharedDir;

    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 3 });
    search = await import('../../server/services/semantic-search.js');

    await db.run(
      "INSERT INTO knowledge_collections (id, name, display_name, created_by) VALUES (?, ?, 'Owner scope test', 'system')",
      col, col,
    );
    for (const [id, owner] of [[docA, alice], [docB, bob], [docN, null]] as const) {
      await db.run(
        `INSERT INTO rag_documents (id, collection_id, filename, file_path, file_type, uploaded_by, index_status)
         VALUES (?, ?, ?, ?, 'md', ?, 'indexed')`,
        id, col, `${id}.md`, path.join(uploadsDir, `${id}.md`), owner,
      );
    }
    for (const c of chunks) {
      await db.run(
        'INSERT INTO rag_chunks (id, document_id, chunk_index, content, chroma_id) VALUES (?, ?, ?, ?, ?)',
        c.id, c.doc, c.idx, c.text, c.id,
      );
      await db.run(
        `INSERT INTO embeddings (id, content_type, content_id, content_text, embedding, embedding_model, embedding_dimension)
         VALUES (?, 'rag_chunk', ?, ?, ?, ?, 4)`,
        `emb_${c.id}`, c.id, c.text, JSON.stringify([1, 0, 0, 0]), h.model,
      );
    }
    // Checkpoint decisions are owned (decided_by) but hybridSearch treats the
    // type as shared; one each for Alice and Bob, with vectors.
    for (const [id, who] of [[cpA, alice], [cpB, bob]] as const) {
      await db.run(
        `INSERT INTO checkpoint_decisions (id, execution_id, workflow_id, step_index, human_decision, decided_by)
         VALUES (?, 'exec-cs', 'wf-cs', 0, 'approve', ?)`,
        id, who,
      );
      await db.run(
        `INSERT INTO embeddings (id, content_type, content_id, content_text, embedding, embedding_model, embedding_dimension)
         VALUES (?, 'checkpoint', ?, ?, ?, ?, 4)`,
        `emb_${id}`, id, `sanctions screening decision ${id}`, JSON.stringify([1, 0, 0, 0]), h.model,
      );
    }
    // Folder indexes: one over the stand-in upload store (built "before the
    // storage rule"), one over a genuinely shared folder.
    for (const [folder, mark] of [[uploadsDir, UPLOAD_INDEX_MARK], [sharedDir, SHARED_INDEX_MARK]] as const) {
      const id = `dc_${mark}`;
      folderChunkIds.push(id);
      await db.run(
        'INSERT INTO document_chunks (id, folder_path, document_name, chunk_index, chunk_text, token_count) VALUES (?, ?, ?, 0, ?, 4)',
        id, folder, 'file.md', `${FOLDER_QUERY} ${mark}`,
      );
      // Five terms at freq 5, not two at 1: retriever.ts computes IDF from
      // COUNT(), which pg returns as a string ('1' + 0.5 === '10.5'), so a small
      // corpus scores under the 0.1 floor otherwise. Out of scope here; reported.
      for (const term of FOLDER_QUERY.split(' ')) {
        await db.run('INSERT INTO chunk_terms (chunk_id, term, freq) VALUES (?, ?, 5)', id, term);
      }
    }

    const { createSearchRoutes } = await import('../../server/routes/search.js');
    const { createCollectionsRoutes } = await import('../../server/routes/collections.js');
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user?: unknown }).user = current;
      next();
    });
    app.use('/api', await createSearchRoutes(db));
    app.use('/api', await createCollectionsRoutes(db));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const addr = server.address();
    if (addr === null || typeof addr === 'string') throw new Error('no addr');
    base = `http://127.0.0.1:${addr.port}`;
  }, 60_000);

  afterEach(() => {
    current = ALICE;
    process.env.DEPLOYMENT_MODE = 'team';
  });

  afterAll(async () => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    if (db) {
      await db.run('DELETE FROM embeddings WHERE embedding_model = ?', h.model).catch(() => {});
      await db.run('DELETE FROM knowledge_collections WHERE id = ?', col).catch(() => {}); // cascades documents + chunks
      for (const id of folderChunkIds) await db.run('DELETE FROM document_chunks WHERE id = ?', id).catch(() => {});
      for (const id of [cpA, cpB]) await db.run('DELETE FROM checkpoint_decisions WHERE id = ?', id).catch(() => {});
      await db.close().catch(() => {});
    }
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  /** Switch the caller for the routes; returns the same identity as a request for the service calls. */
  const as = (who: Caller, mode: 'team' | 'solo' = 'team'): { user: Caller } => {
    current = who;
    process.env.DEPLOYMENT_MODE = mode;
    return { user: who };
  };
  const text = (rows: ResultRow[]): string => rows.map((r) => r.content ?? '').join('\n');
  const post = async (url: string, body: unknown) => {
    const res = await fetch(`${base}/api${url}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() as { results?: ResultRow[]; documents?: Array<{ id: string }> } };
  };
  const get = async (url: string) => {
    const res = await fetch(`${base}/api${url}`);
    return { status: res.status, body: await res.json() as { results?: ResultRow[]; documents?: Array<{ id: string }> } };
  };
  const query = { query: 'sanctions screening', collections: [col], topK: 20 };

  // ── The service ──────────────────────────────────────────────────────────

  describe('searchCollections / keywordSearch / getChunkContext', () => {
    it("team non-admin: only their own document's chunks, on the vector side too", async () => {
      const set = await search.searchCollections(db, { ...query, owner: as(ALICE) });
      expect(set.method).not.toBe('keyword'); // the vector query ran and was scoped
      expect(set.results.map((r) => r.documentId).sort()).toEqual([docA, docA, docA]);
      expect(set.diagnostics.chunksConsidered).toBe(3);
      expect(set.diagnostics.embeddedChunks).toBe(3);
      expect(text(set.results as ResultRow[])).not.toContain(BOB_MARK);
    });

    it('negative control — Bob sees exactly his own', async () => {
      const set = await search.searchCollections(db, { ...query, owner: as(BOB) });
      expect(new Set(set.results.map((r) => r.documentId))).toEqual(new Set([docB]));
    });

    it('negative controls — a team admin and the solo user see every document, unattributed included', async () => {
      for (const who of [{ c: ADMIN, m: 'team' as const }, { c: SOLO, m: 'solo' as const }]) {
        const set = await search.searchCollections(db, { ...query, owner: as(who.c, who.m) });
        expect(new Set(set.results.map((r) => r.documentId))).toEqual(new Set([docA, docB, docN]));
      }
    });

    it('team mode with no identity reads nothing (fail closed)', async () => {
      as(ALICE);
      const set = await search.searchCollections(db, query);
      expect(set.results).toEqual([]);
      expect(await search.keywordSearch(db, query.query, [col], 20)).toEqual([]);
    });

    it('keywordSearch is scoped the same way', async () => {
      const mine = await search.keywordSearch(db, query.query, [col], 20, as(ALICE));
      expect(new Set(mine.map((r) => r.documentId))).toEqual(new Set([docA]));
      const all = await search.keywordSearch(db, query.query, [col], 20, as(SOLO, 'solo'));
      expect(new Set(all.map((r) => r.documentId))).toEqual(new Set([docA, docB, docN]));
    });

    it("getChunkContext: another user's chunk id answers [] like an unknown id; one's own still works", async () => {
      const bobChunk = chunks[3].id;
      expect(await search.getChunkContext(db, bobChunk, 2, as(ALICE))).toEqual([]);
      expect(await search.getChunkContext(db, `no-such-${tag}`, 2, as(ALICE))).toEqual([]);
      const own = await search.getChunkContext(db, chunks[1].id, 2, as(ALICE));
      expect(own.map((c) => c.chunkId)).toEqual([chunks[0].id, chunks[1].id, chunks[2].id]);
      const admin = await search.getChunkContext(db, bobChunk, 2, as(ADMIN));
      expect(admin.map((c) => c.chunkId)).toEqual([chunks[3].id, chunks[4].id]);
    });
  });

  // ── The routes ───────────────────────────────────────────────────────────

  describe('routes', () => {
    it.each(['/search/semantic', '/search/hybrid'])('POST %s returns only the caller\'s own chunks', async (url) => {
      as(ALICE);
      const r = await post(url, query);
      expect(r.status).toBe(200);
      expect(text(r.body.results ?? [])).toContain(ALICE_MARK);
      expect(text(r.body.results ?? [])).not.toContain(BOB_MARK);
      expect(text(r.body.results ?? [])).not.toContain(UNOWNED_MARK);
    });

    it('POST /search/keyword returns only the caller\'s own chunks', async () => {
      as(ALICE);
      const r = await post('/search/keyword', { query: query.query, collections: [col], limit: 20 });
      expect(text(r.body.results ?? [])).toContain(ALICE_MARK);
      expect(text(r.body.results ?? [])).not.toContain(BOB_MARK);
    });

    it('GET /search/context/:chunkId does not open another user\'s document', async () => {
      as(ALICE);
      expect((await get(`/search/context/${chunks[3].id}`)).body.results).toEqual([]);
      expect(((await get(`/search/context/${chunks[0].id}`)).body.results ?? []).length).toBeGreaterThan(0);
    });

    it('POST /collections/:id/query returns only the caller\'s own chunks', async () => {
      as(ALICE);
      const r = await post(`/collections/${col}/query`, { query: query.query, limit: 20 });
      expect(r.status).toBe(200);
      expect(text(r.body.results ?? [])).toContain(ALICE_MARK);
      expect(text(r.body.results ?? [])).not.toContain(BOB_MARK);
    });

    it('GET /collections/:id/documents lists only the caller\'s own documents', async () => {
      as(ALICE);
      expect((await get(`/collections/${col}/documents`)).body.documents?.map((x) => x.id)).toEqual([docA]);
      as(ADMIN);
      expect(new Set((await get(`/collections/${col}/documents`)).body.documents?.map((x) => x.id))).toEqual(new Set([docA, docB, docN]));
      as(SOLO, 'solo');
      expect(new Set((await get(`/collections/${col}/documents`)).body.documents?.map((x) => x.id))).toEqual(new Set([docA, docB, docN]));
    });

    it("POST /search with contentTypes ['rag_chunk'] drops other users' chunks (vector leg)", async () => {
      as(ALICE);
      const mine = await post('/search', { query: query.query, contentTypes: ['rag_chunk'], topK: 20 });
      expect(mine.status).toBe(200);
      const ids = (mine.body.results ?? []).map((r) => r.content_id);
      expect(ids.sort()).toEqual([chunks[0].id, chunks[1].id, chunks[2].id].sort());
      as(ADMIN);
      const all = await post('/search', { query: query.query, contentTypes: ['rag_chunk'], topK: 20 });
      expect((all.body.results ?? []).map((r) => r.content_id)).toEqual(expect.arrayContaining([chunks[3].id, chunks[5].id]));
    });

    it("POST /search and /search/similar drop other users' checkpoint decisions", async () => {
      as(ALICE);
      const mine = await post('/search', { query: query.query, contentTypes: ['checkpoint'], topK: 20 });
      expect((mine.body.results ?? []).map((r) => r.content_id)).toEqual([cpA]);
      const similar = await post('/search/similar', { contentType: 'checkpoint', contentId: cpA, topK: 20 });
      expect((similar.body.results ?? []).map((r) => r.content_id)).not.toContain(cpB);
      as(ADMIN);
      const all = await post('/search', { query: query.query, contentTypes: ['checkpoint'], topK: 20 });
      expect((all.body.results ?? []).map((r) => r.content_id).sort()).toEqual([cpA, cpB].sort());
    });

    it('POST /search does not read a folder index over the upload store for a team non-admin', async () => {
      const body = { query: FOLDER_QUERY, contentTypes: ['document_chunk'], folderPaths: [uploadsDir, sharedDir], topK: 20 };
      as(ALICE);
      const scoped = JSON.stringify((await post('/search', body)).body);
      expect(scoped).not.toContain(UPLOAD_INDEX_MARK);
      // Negative control: the shared folder index is still searchable by the same caller.
      expect(scoped).toContain(SHARED_INDEX_MARK);
      // Negative control: solo mode is unchanged.
      as(SOLO, 'solo');
      expect(JSON.stringify((await post('/search', body)).body)).toContain(UPLOAD_INDEX_MARK);
    });

    it('POST /search/embed is admin-only in team mode', async () => {
      as(ALICE);
      const r = await post('/search/embed', { contentType: 'rag_chunk', contentId: chunks[3].id, contentText: 'planted' });
      expect(r.status).toBe(403);
      const row = await db.get<{ content_text: string }>(
        'SELECT content_text FROM embeddings WHERE content_type = ? AND content_id = ? AND embedding_model = ?',
        'rag_chunk', chunks[3].id, h.model,
      );
      expect(row?.content_text).toBe(chunks[3].text);
      // Negative control: an admin passes the gate (an empty body then fails validation — nothing written).
      as(ADMIN);
      expect((await post('/search/embed', {})).status).toBe(400);
    });
  });
});
