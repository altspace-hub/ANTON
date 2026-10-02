/**
 * demo-knowledge-base.db.test.ts — the Knowledge Base (collections and their
 * documents) is safe for public-demo visitors (2026-10-02).
 *
 * Before: GET /collections listed every collection on the server to every
 * user; PUT /collections/:id changed anyone's collection; a visitor could
 * upload into another visitor's collection, so that visitor's expiry
 * (knowledge_collections ON DELETE CASCADE) took the uploader's documents and
 * left their files on disk; a document's file stayed on disk after DELETE;
 * the uploads were outside the demo quota; and a visitor's text went to
 * whatever embedding service was configured.
 *
 * Now, in team mode on a demo: a visitor sees, opens, changes, searches and
 * uploads into their own collections only (404 for another visitor's, like a
 * missing one); two visitors can use the same name; documents count toward
 * the one upload quota; deleting a document or a collection removes the
 * files; a visitor's documents and queries are never embedded (keyword
 * search); and removeAccountStoredFiles deletes an account's documents,
 * collections and files without touching anyone else's.
 *
 * Off the demo, a team non-admin keeps the shared collections (an admin's or
 * the legacy 'system' ones) but cannot change them, and never sees another
 * member's. Every refusal has its negative control: the owner, an admin, or a
 * server that is not a demo doing the same thing.
 *
 * Against the real schema; skips without a test database.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';
import type { DatabaseAdapter } from '../../server/db/database.js';

// A visitor's chunks must never reach the embedder; an admin's still do. The
// real embedder is replaced by a spy (no vectors are written, no pin is set).
const spies = vi.hoisted(() => ({
  embedChunks: vi.fn(async (_db: unknown, chunks: Array<{ id: string }>) => ({
    embedded: 0, skipped: chunks.length, provider: 'ollama', model: 'fake-embed', dimensions: 4,
    skippedReasons: { empty: 0, zeroVector: chunks.length, dimensionMismatch: 0, storeError: 0 },
  })),
  embedQuery: vi.fn(async () => [0.1, 0.2, 0.3, 0.4]),
}));

vi.mock('../../server/services/rag/chunk-embedder.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/rag/chunk-embedder.js')>();
  return { ...actual, embedRagChunks: spies.embedChunks };
});

vi.mock('../../server/services/embedding-adapter.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/embedding-adapter.js')>();
  const fake = {
    provider: 'ollama' as const,
    model: 'fake-embed',
    dimensions: 4,
    embed: spies.embedQuery,
    embedBatch: async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3, 0.4]),
  };
  return { ...actual, getEmbeddingAdapter: () => fake };
});

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

const TAG = randomUUID().slice(0, 8);
const ALICE = `u-kb-alice-${TAG}`;   // demo visitor
const BOB = `u-kb-bob-${TAG}`;       // another demo visitor
const ROOT = `u-kb-root-${TAG}`;     // instance admin
const ENV_KEYS = ['DEMO_MODE', 'DEPLOYMENT_MODE', 'DEMO_USER_UPLOAD_MB', 'DEMO_USER_UPLOAD_FILES', 'UPLOAD_DIR'] as const;

interface Json { [k: string]: unknown }

d('the Knowledge Base on a public demo', () => {
  let db: DatabaseAdapter;
  let server: Server;
  let base = '';
  let uploadDir = '';
  const saved: Record<string, string | undefined> = {};
  let removeAccountStoredFiles: typeof import('../../server/services/rag/demo-storage.js').removeAccountStoredFiles;

  const ragDir = () => path.join(uploadDir, 'rag-documents');
  const filesOnDisk = () => (fs.existsSync(ragDir()) ? fs.readdirSync(ragDir()).length : 0);

  beforeAll(async () => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anton-kb-uploads-'));
    process.env.UPLOAD_DIR = uploadDir;
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 4 });
    // The admin is an account: a collection an administrator made is a shared one.
    await db.run("INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, 'x', 'admin')", [ROOT, ROOT]);
    const { createCollectionsRoutes } = await import('../../server/routes/collections.js');
    const { createDocumentsRouter } = await import('../../server/routes/documents.js');
    ({ removeAccountStoredFiles } = await import('../../server/services/rag/demo-storage.js'));
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const id = req.header('x-test-user');
      if (id) req.user = { id, username: id, role: (req.header('x-test-role') ?? 'analyst') as 'admin' | 'analyst' | 'viewer' };
      next();
    });
    app.use('/api', await createCollectionsRoutes(db));
    app.use('/api', await createDocumentsRouter(db));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (k === 'UPLOAD_DIR') continue;
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
    spies.embedChunks.mockClear();
    spies.embedQuery.mockClear();
  });

  afterAll(async () => {
    if (db) {
      await db.run("DELETE FROM rag_documents WHERE uploaded_by LIKE ?", [`%-${TAG}`]).catch(() => undefined);
      await db.run("DELETE FROM knowledge_collections WHERE created_by LIKE ? OR id LIKE ?", [`%-${TAG}`, `%${TAG}%`]).catch(() => undefined);
      await db.run('DELETE FROM file_uploads WHERE uploaded_by LIKE ?', [`%-${TAG}`]).catch(() => undefined);
      await db.run('DELETE FROM users WHERE id = ?', [ROOT]).catch(() => undefined);
      await db.close();
    }
    await new Promise<void>((resolve) => { server?.close(() => resolve()); });
    if (saved.UPLOAD_DIR === undefined) delete process.env.UPLOAD_DIR; else process.env.UPLOAD_DIR = saved.UPLOAD_DIR;
    fs.rmSync(uploadDir, { recursive: true, force: true });
  });

  const demo = () => { process.env.DEPLOYMENT_MODE = 'team'; process.env.DEMO_MODE = 'true'; };
  const teamOnly = () => { process.env.DEPLOYMENT_MODE = 'team'; delete process.env.DEMO_MODE; };

  async function call(method: string, url: string, user: string, role = 'analyst', body?: unknown): Promise<{ status: number; body: Json }> {
    const res = await fetch(`${base}/api${url}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-test-user': user, 'x-test-role': role },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: Json = {};
    try { parsed = JSON.parse(text) as Json; } catch { parsed = { raw: text }; }
    return { status: res.status, body: parsed };
  }

  async function createCollection(user: string, name: string, role = 'analyst'): Promise<{ status: number; id: string }> {
    const r = await call('POST', '/collections', user, role, { name: `${name}-${TAG}`, displayName: `${name} ${TAG}` });
    return { status: r.status, id: String(r.body.collectionId ?? '') };
  }

  async function uploadDoc(user: string, collectionId: string, text: string, role = 'analyst', name = 'notes.txt'): Promise<{ status: number; body: Json }> {
    const form = new FormData();
    form.append('collectionId', collectionId);
    form.append('file', new Blob([text], { type: 'text/plain' }), name);
    const res = await fetch(`${base}/api/documents/upload`, { method: 'POST', body: form, headers: { 'x-test-user': user, 'x-test-role': role } });
    return { status: res.status, body: await res.json() as Json };
  }

  const listIds = async (user: string, role = 'analyst') =>
    ((await call('GET', '/collections', user, role)).body.collections as Array<{ id: string }> ?? []).map((c) => c.id);

  const PASSAGE = 'Beneficial ownership registers must be checked against the customer due diligence file. '.repeat(8);

  it('a visitor sees, opens, changes and searches only their own collections — 404 for another visitor', async () => {
    demo();
    const a = await createCollection(ALICE, 'contracts');
    expect(a.status).toBe(200);
    // A random suffix: the id must not tell anyone that another visitor chose the same name.
    expect(a.id).toMatch(new RegExp(`^contracts-${TAG}-[0-9a-f]{10}$`));

    expect(await listIds(ALICE)).toContain(a.id);
    expect(await listIds(BOB)).not.toContain(a.id);
    // Negative control: the admin sees every collection.
    expect(await listIds(ROOT, 'admin')).toContain(a.id);

    for (const [method, url, body] of [
      ['GET', `/collections/${a.id}`, undefined],
      ['PUT', `/collections/${a.id}`, { displayName: 'taken over' }],
      ['GET', `/collections/${a.id}/documents`, undefined],
      ['POST', `/collections/${a.id}/query`, { query: 'beneficial ownership' }],
      ['GET', `/documents/collection/${a.id}`, undefined],
      ['GET', `/documents/collection/${a.id}/stats`, undefined],
      ['DELETE', `/collections/${a.id}`, undefined],
    ] as const) {
      const r = await call(method, url, BOB, 'analyst', body);
      expect({ method, url, status: r.status }).toEqual({ method, url, status: 404 });
    }
    // Nothing Bob tried took effect.
    const row = await db.get<{ display_name: string }>('SELECT display_name FROM knowledge_collections WHERE id = ?', [a.id]);
    expect(row?.display_name).toBe(`contracts ${TAG}`);

    // Negative controls: the owner, then an admin, may change it.
    expect((await call('PUT', `/collections/${a.id}`, ALICE, 'analyst', { displayName: 'Contracts (mine)' })).status).toBe(200);
    expect((await call('GET', `/collections/${a.id}`, ALICE)).body.collection).toMatchObject({ display_name: 'Contracts (mine)', searchMethod: 'keyword' });
    expect((await call('PUT', `/collections/${a.id}`, ROOT, 'admin', { description: 'checked' })).status).toBe(200);
  });

  it('two visitors can name a collection alike — no clash, no 500', async () => {
    demo();
    const a = await createCollection(ALICE, 'samename');
    const b = await createCollection(BOB, 'samename');
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.id).not.toBe(b.id);
    expect(await listIds(BOB)).toContain(b.id);
    expect(await listIds(BOB)).not.toContain(a.id);
  });

  it("a visitor cannot upload into another visitor's collection, and the file does not stay on disk", async () => {
    demo();
    const a = await createCollection(ALICE, 'private');
    const before = filesOnDisk();
    const r = await uploadDoc(BOB, a.id, PASSAGE);
    expect(r.status).toBe(404);
    expect(filesOnDisk()).toBe(before);
    expect(await db.get('SELECT 1 FROM rag_documents WHERE collection_id = ?', [a.id])).toBeUndefined();

    // Negative control: the owner can.
    const own = await uploadDoc(ALICE, a.id, PASSAGE);
    expect(own.status).toBe(200);
    expect(filesOnDisk()).toBe(before + 1);
  });

  it("a visitor's documents and queries are never embedded — an admin's still are", async () => {
    demo();
    const a = await createCollection(ALICE, 'keyword');
    const up = await uploadDoc(ALICE, a.id, PASSAGE);
    expect(up.status).toBe(200);
    expect(Number(up.body.chunkCount)).toBeGreaterThan(0);
    expect(spies.embedChunks).not.toHaveBeenCalled();

    const q = await call('POST', `/collections/${a.id}/query`, ALICE, 'analyst', { query: 'beneficial ownership registers' });
    expect(q.status).toBe(200);
    expect(q.body.method).toBe('keyword');
    expect((q.body.results as unknown[]).length).toBeGreaterThan(0);
    expect(spies.embedQuery).not.toHaveBeenCalled();

    // Negative control: the same from an admin goes to the embedder.
    const r = await createCollection(ROOT, 'adminkb', 'admin');
    expect((await uploadDoc(ROOT, r.id, PASSAGE, 'admin')).status).toBe(200);
    expect(spies.embedChunks).toHaveBeenCalledTimes(1);
    await call('POST', `/collections/${r.id}/query`, ROOT, 'admin', { query: 'beneficial ownership registers' });
    expect(spies.embedQuery).toHaveBeenCalled();
  });

  it("an admin's index maintenance never embeds a visitor's documents on a demo — it does off the demo", async () => {
    demo();
    const { reindexStuck } = await import('../../server/services/rag/collection-maintenance.js');
    const visitorCol = await createCollection(ALICE, 'maint');
    expect((await uploadDoc(ALICE, visitorCol.id, PASSAGE)).status).toBe(200);
    const adminCol = await createCollection(ROOT, 'maintadmin', 'admin');
    expect((await uploadDoc(ROOT, adminCol.id, PASSAGE, 'admin')).status).toBe(200);
    spies.embedChunks.mockClear();

    await reindexStuck(db, { collectionId: visitorCol.id });
    expect(spies.embedChunks).not.toHaveBeenCalled();
    await reindexStuck(db, { collectionId: adminCol.id });
    expect(spies.embedChunks).toHaveBeenCalledTimes(1);

    // Negative control: on a team server that is not a demo the same chunks are embedded.
    teamOnly();
    spies.embedChunks.mockClear();
    await reindexStuck(db, { collectionId: visitorCol.id });
    expect(spies.embedChunks).toHaveBeenCalledTimes(1);
  });

  it('documents count toward the one demo upload quota, run attachments included', async () => {
    demo();
    process.env.DEMO_USER_UPLOAD_FILES = '3';
    const visitor = `u-kb-quota-${TAG}`;
    const c = await createCollection(visitor, 'quota');
    // A run attachment already on record counts (file_uploads).
    await db.run('INSERT INTO file_uploads (id, original_name, extension, size_bytes, uploaded_by) VALUES (?, ?, ?, ?, ?)',
      [`kbq-${TAG}-${randomUUID()}`, 'a.txt', '.txt', 10, visitor]);
    expect((await uploadDoc(visitor, c.id, PASSAGE)).status).toBe(200);
    expect((await uploadDoc(visitor, c.id, PASSAGE)).status).toBe(200);
    const before = filesOnDisk();
    const third = await uploadDoc(visitor, c.id, PASSAGE);
    expect(third.status).toBe(413);
    expect(third.body.code).toBe('UPLOAD_QUOTA');
    expect(String(third.body.error)).toMatch(/upload limit \(.*3 files\)/);
    expect(filesOnDisk()).toBe(before);
    expect(Number((await db.get<{ n: string }>('SELECT COUNT(*) AS n FROM rag_documents WHERE uploaded_by = ?', [visitor]))?.n)).toBe(2);

    // Negative controls: an admin is not limited, nor a team server that is not a demo.
    const r = await createCollection(ROOT, 'quotaadmin', 'admin');
    for (let i = 0; i < 4; i++) expect((await uploadDoc(ROOT, r.id, PASSAGE, 'admin')).status).toBe(200);
    teamOnly();
    expect((await uploadDoc(visitor, c.id, PASSAGE)).status).toBe(200);
  });

  it('deleting a document or a collection removes the files from disk', async () => {
    demo();
    const c = await createCollection(ALICE, 'tidy');
    const one = await uploadDoc(ALICE, c.id, PASSAGE);
    const two = await uploadDoc(ALICE, c.id, PASSAGE);
    const fileOf = async (id: unknown) => (await db.get<{ file_path: string }>('SELECT file_path FROM rag_documents WHERE id = ?', [id]))!.file_path;
    const f1 = await fileOf(one.body.documentId);
    const f2 = await fileOf(two.body.documentId);
    expect(fs.existsSync(f1) && fs.existsSync(f2)).toBe(true);
    // The server path stays on the server for a visitor.
    const listed = (await call('GET', `/documents/collection/${c.id}`, ALICE)).body.documents as Json[];
    expect(listed).toHaveLength(2);
    expect(listed.every((doc) => !('file_path' in doc))).toBe(true);

    // Another visitor cannot delete it (404), and the file stays.
    expect((await call('DELETE', `/documents/${String(one.body.documentId)}`, BOB)).status).toBe(404);
    expect(fs.existsSync(f1)).toBe(true);

    expect((await call('DELETE', `/documents/${String(one.body.documentId)}`, ALICE)).status).toBe(200);
    expect(fs.existsSync(f1)).toBe(false);
    expect(fs.existsSync(f2)).toBe(true);

    const del = await call('DELETE', `/collections/${c.id}`, ALICE);
    expect(del.status).toBe(200);
    expect(del.body.removedFiles).toBe(1);
    expect(fs.existsSync(f2)).toBe(false);
    expect(await db.get('SELECT 1 FROM knowledge_collections WHERE id = ?', [c.id])).toBeUndefined();
  });

  it("deleting an account's stored files takes its own documents and collections — never another visitor's", async () => {
    demo();
    const leaver = `u-kb-leaver-${TAG}`;
    const stayer = `u-kb-stayer-${TAG}`;
    const lc = await createCollection(leaver, 'leaving');
    const sc = await createCollection(stayer, 'staying');
    const ld = await uploadDoc(leaver, lc.id, PASSAGE);
    const sd = await uploadDoc(stayer, sc.id, PASSAGE);
    const pathOf = async (id: unknown) => (await db.get<{ file_path: string }>('SELECT file_path FROM rag_documents WHERE id = ?', [id]))!.file_path;
    const leaverFile = await pathOf(ld.body.documentId);
    const stayerFile = await pathOf(sd.body.documentId);

    const result = await removeAccountStoredFiles(db, leaver);
    expect(result.errors).toEqual([]);
    expect(result.filesRemoved).toBe(1);
    expect(fs.existsSync(leaverFile)).toBe(false);
    expect(await db.get('SELECT 1 FROM rag_documents WHERE uploaded_by = ?', [leaver])).toBeUndefined();
    expect(await db.get('SELECT 1 FROM knowledge_collections WHERE created_by = ?', [leaver])).toBeUndefined();

    // Negative control: the other visitor's document, collection and file are untouched.
    expect(fs.existsSync(stayerFile)).toBe(true);
    expect(await db.get('SELECT 1 FROM rag_documents WHERE id = ?', [sd.body.documentId])).toBeDefined();
    expect(await listIds(stayer)).toContain(sc.id);
  });

  it('off the demo, a team member keeps the shared collections but cannot change them, and never sees a colleague\'s', async () => {
    teamOnly();
    const shared = `shared-${TAG}`;
    await db.run(
      "INSERT INTO knowledge_collections (id, name, display_name, created_by) VALUES (?, ?, 'Shared policies', 'system')",
      [shared, shared],
    );
    const fromAdmin = await createCollection(ROOT, 'adminshared', 'admin');
    const colleague = await createCollection(BOB, 'colleague');

    const seen = await listIds(ALICE);
    expect(seen).toContain(shared);
    expect(seen).toContain(fromAdmin.id);
    expect(seen).not.toContain(colleague.id);

    // Readable, uploadable, not changeable: 403 (it is visible, so 403 discloses nothing).
    expect((await uploadDoc(ALICE, shared, PASSAGE)).status).toBe(200);
    expect((await call('PUT', `/collections/${shared}`, ALICE, 'analyst', { displayName: 'mine now' })).status).toBe(403);
    expect((await call('DELETE', `/collections/${shared}`, ALICE)).status).toBe(403);
    expect((await call('GET', `/collections/${colleague.id}`, ALICE)).status).toBe(404);
    // Watched folders name server directories: an administrator's setting.
    expect((await call('POST', '/collections', ALICE, 'analyst', { name: `w-${TAG}`, displayName: 'w', watchDirectories: ['/etc'] })).status).toBe(403);

    // Negative controls: the admin changes the shared one; the colleague their own.
    expect((await call('PUT', `/collections/${shared}`, ROOT, 'admin', { displayName: 'Shared policies v2' })).status).toBe(200);
    expect((await call('PUT', `/collections/${colleague.id}`, BOB, 'analyst', { displayName: 'still mine' })).status).toBe(200);
  });
});
