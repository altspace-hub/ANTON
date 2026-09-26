/**
 * rag-team-isolation.test.ts — the folder RAG index and collection retrieval
 * stay per person on a team server (team-server readiness B5).
 *
 * Before:
 *   - GET /api/rag/folders listed every indexed folder on the instance;
 *   - POST /api/rag/search returned chunks from any folder path the body named,
 *     including an index built over ./uploads (every user's files);
 *   - DELETE /api/rag/index let any user remove any index;
 *   - the resolver's RAG mode (collections) returned other users' documents.
 *
 * indexed_folders has no owner column, so for folders "yours" means "a folder
 * the whitelist lets you read" — checkFolderPath(), which in team mode refuses
 * ANTON's own storage. Collection documents do have an owner
 * (rag_documents.uploaded_by). Every refusal has a negative control: the owner,
 * an admin, or solo mode still gets the result.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import os from 'os';
import path from 'path';
import fs from 'fs';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import type { KnowledgeSourceConfig } from '../../src/lib/types.js';

// The retriever is replaced so the test sees exactly which folder paths reach
// document_chunks — that list is what the scoping decides. vi.hoisted: the
// vi.mock factories run before this module's own declarations.
const { retrieveChunks, semanticSearch, ALICE_DOC, BOB_DOC } = vi.hoisted(() => {
  const ALICE_DOC = 'ALICE-COLLECTION-DOC-91ab';
  const BOB_DOC = 'BOB-COLLECTION-DOC-37cd';
  const hit = (documentId: string, content: string, score: number) => ({
    chunkId: `chunk-${documentId}`, documentId, documentName: `${documentId}.pdf`,
    collectionId: 'client-docs', collectionName: 'Client documents', content,
    score, scoreKind: 'cosine_similarity', method: 'vector', relevanceScore: score,
    metadata: { chunkIndex: 0, filename: `${documentId}.pdf`, fileType: 'pdf' }, citation: `${documentId}.pdf`,
  });
  return {
    ALICE_DOC,
    BOB_DOC,
    retrieveChunks: vi.fn(async (_db: unknown, _q: string, folderPaths: string[]) =>
      folderPaths.map((p, i) => ({
        id: `chunk-${i}`, documentName: 'doc.md', folderPath: p, chunkIndex: 0,
        text: `CHUNK-FROM:${p}`, score: 1, tokenCount: 10,
      }))),
    // Collections are shared; the two documents belong to alice and bob.
    semanticSearch: vi.fn(async () => [hit('doc-alice', ALICE_DOC, 0.9), hit('doc-bob', BOB_DOC, 0.8)]),
  };
});
vi.mock('../../server/services/rag/retriever.js', () => ({ retrieveChunks }));
vi.mock('../../server/services/semantic-search.js', () => ({ semanticSearch }));

import { createRagRoutes } from '../../server/routes/rag.js';
import { resolveKnowledgeSources } from '../../server/services/knowledge-resolver.js';

const ENV_KEYS = ['DEPLOYMENT_MODE', 'ALLOWED_FOLDER_PATHS', 'UPLOAD_DIR', 'OUTPUT_DIR', 'WORKSPACES_DIR'] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

let sandbox = '';
let uploads = '';
let shared = '';
let elsewhere = '';

function setMode(mode: 'team' | 'solo') {
  if (mode === 'team') process.env.DEPLOYMENT_MODE = 'team';
  else delete process.env.DEPLOYMENT_MODE;
  // The shipped default (uploads) plus a folder meant to be shared.
  process.env.ALLOWED_FOLDER_PATHS = [uploads, shared].join(',');
  process.env.UPLOAD_DIR = uploads;
  process.env.OUTPUT_DIR = path.join(sandbox, 'store', 'outputs');
  process.env.WORKSPACES_DIR = path.join(sandbox, 'store', 'workspaces');
}

// ── Fake adapter: indexed_folders rows, rag_documents owners, recorded writes ──

const DOC_OWNER: Record<string, string> = { 'doc-alice': 'alice', 'doc-bob': 'bob' };
const runs: string[] = [];
const ownershipSql: string[] = [];

const db = {
  dialect: 'postgresql',
  async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    if (sql.includes('FROM indexed_folders')) {
      return [uploads, shared, elsewhere].map((p) => ({ folder_path: p, document_count: 1, chunk_count: 1, status: 'ready' })) as T[];
    }
    if (sql.startsWith('SELECT id FROM rag_documents WHERE id IN')) {
      ownershipSql.push(sql);
      if (sql.endsWith(' AND 1=0')) return [];  // ownerFilter with no identity
      // Mirrors `id IN (...) AND uploaded_by = ?`: the last param is the owner.
      const scoped = /AND uploaded_by = \?$/.test(sql);
      const ids = (scoped ? params.slice(0, -1) : params) as string[];
      const owner = scoped ? params[params.length - 1] : undefined;
      return ids.filter((id) => !scoped || DOC_OWNER[id] === owner).map((id) => ({ id })) as T[];
    }
    throw new Error(`fake db: unexpected all(): ${sql.slice(0, 80)}`);
  },
  async get<T>(): Promise<T | undefined> { return undefined; },
  async run(sql: string): Promise<RunResult> { runs.push(sql); return { changes: 1, lastInsertRowid: 0 }; },
  async exec() { /* noop */ },
  async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
  async close() { /* noop */ },
} as unknown as DatabaseAdapter;

let server: Server;
let base = '';

beforeAll(async () => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'anton-rag-team-'));
  uploads = path.join(sandbox, 'store', 'uploads');
  shared = path.join(sandbox, 'shared');
  elsewhere = path.join(sandbox, 'not-whitelisted');
  for (const d of [uploads, shared, elsewhere]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(uploads, 'alice.md'), '# Alice\nprivate\n', 'utf8');

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const id = req.header('x-test-user');
    if (id) req.user = { id, username: id, role: (req.header('x-test-role') ?? 'analyst') as 'admin' | 'analyst' | 'viewer' };
    next();
  });
  app.use('/api', await createRagRoutes(db));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no server address');
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(sandbox, { recursive: true, force: true });
});

beforeEach(() => {
  runs.length = 0;
  ownershipSql.length = 0;
  retrieveChunks.mockClear();
  semanticSearch.mockClear();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

async function call(method: string, route: string, user: string, role: string, body?: unknown) {
  const r = await fetch(`${base}/api${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-test-user': user, 'x-test-role': role },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  return { status: r.status, text, json: (() => { try { return JSON.parse(text) as unknown; } catch { return undefined; } })() };
}

const folderPathsOf = (json: unknown) => (json as Array<{ folder_path: string }>).map((f) => f.folder_path);

// ── GET /rag/folders and /rag/index/status ──────────────────────────────────

describe('listing indexed folders', () => {
  it('team analyst: only folders they may read — not the upload store, not an un-whitelisted path', async () => {
    setMode('team');
    for (const route of ['/rag/folders', '/rag/index/status']) {
      const r = await call('GET', route, 'carol', 'analyst');
      expect(r.status, route).toBe(200);
      expect(folderPathsOf(r.json), route).toEqual([shared]);
    }
  });

  it('negative control — a team admin and a solo user still see every index', async () => {
    setMode('team');
    expect(folderPathsOf((await call('GET', '/rag/folders', 'root', 'admin')).json)).toEqual([uploads, shared, elsewhere]);
    setMode('solo');
    expect(folderPathsOf((await call('GET', '/rag/folders', 'solo', 'admin')).json)).toEqual([uploads, shared, elsewhere]);
  });
});

// ── POST /rag/search ────────────────────────────────────────────────────────

describe('POST /rag/search', () => {
  it('team analyst: an index over the upload store is never searched', async () => {
    setMode('team');
    const r = await call('POST', '/rag/search', 'carol', 'analyst', { query: 'contract', folderPaths: [uploads, shared] });
    expect(r.status).toBe(200);
    expect(retrieveChunks).toHaveBeenCalledTimes(1);
    expect(retrieveChunks.mock.calls[0][2]).toEqual([shared]);
    expect(r.text).not.toContain(`CHUNK-FROM:${uploads}`);
  });

  it('team analyst: naming only a folder they may not read answers like an empty index', async () => {
    setMode('team');
    const r = await call('POST', '/rag/search', 'carol', 'analyst', { query: 'contract', folderPaths: [uploads, elsewhere] });
    expect(r.status).toBe(200);
    expect(r.json).toEqual([]);
    expect(retrieveChunks).not.toHaveBeenCalled();
  });

  it('negative control — a team admin and a solo user search every folder they name', async () => {
    setMode('team');
    await call('POST', '/rag/search', 'root', 'admin', { query: 'contract', folderPaths: [uploads, shared] });
    expect(retrieveChunks.mock.calls[0][2]).toEqual([uploads, shared]);
    setMode('solo');
    const r = await call('POST', '/rag/search', 'solo', 'admin', { query: 'contract', folderPaths: [uploads] });
    expect(retrieveChunks.mock.calls[1][2]).toEqual([uploads]);
    expect(r.text).toContain(`CHUNK-FROM:${uploads.replace(/\\/g, '\\\\')}`);
  });

  it('rejects a non-array folderPaths instead of crashing', async () => {
    setMode('solo');
    const r = await call('POST', '/rag/search', 'solo', 'admin', { query: 'x', folderPaths: shared });
    expect(r.status).toBe(400);
  });
});

// ── DELETE /rag/index ───────────────────────────────────────────────────────

describe('DELETE /rag/index', () => {
  it('team analyst: refused, and nothing is deleted', async () => {
    setMode('team');
    const r = await call('DELETE', '/rag/index', 'carol', 'analyst', { folderPath: shared });
    expect(r.status).toBe(403);
    expect(runs).toEqual([]);
  });

  it('negative control — a team admin and a solo user can still remove an index', async () => {
    setMode('team');
    expect((await call('DELETE', '/rag/index', 'root', 'admin', { folderPath: shared })).status).toBe(200);
    setMode('solo');
    expect((await call('DELETE', '/rag/index', 'solo', 'admin', { folderPath: uploads })).status).toBe(200);
    expect(runs.filter((s) => s.startsWith('DELETE FROM'))).toHaveLength(4);
  });
});

// ── POST /rag/index ─────────────────────────────────────────────────────────

describe('POST /rag/index', () => {
  it('team mode: the upload store cannot be indexed — by an admin either', async () => {
    setMode('team');
    for (const role of ['analyst', 'admin']) {
      const r = await call('POST', '/rag/index', 'carol', role, { folderPath: uploads });
      expect(r.status, role).toBe(403);
    }
    expect(runs).toEqual([]);
  });

  it('negative control — solo mode still indexes uploads', async () => {
    setMode('solo');
    const r = await call('POST', '/rag/index', 'solo', 'admin', { folderPath: uploads });
    expect(r.status).toBe(200);
    expect(runs.some((s) => s.includes('document_chunks'))).toBe(true);
  });
});

// ── The resolver's RAG mode ─────────────────────────────────────────────────

const NO_SOURCES: KnowledgeSourceConfig = {
  modes: {
    claudeKnowledge: { enabled: false, webSearchEnabled: false, description: '' },
    onlineReference: { enabled: false, urls: [], fetchDepth: 'full' },
    localFolder: { enabled: false, folderPaths: [], recursive: true },
    combinedMode: { enabled: false, priority: 'merged' },
  },
};

/** Shaped like the Express request the route passes: `{ user: { id, role } }`. */
type Requester = { user?: { id: string; role: string } };
const as = (id: string, role: string): Requester => ({ user: { id, role } });

async function resolveCollections(requester?: Requester) {
  return resolveKnowledgeSources(NO_SOURCES, [], {
    db,
    userQuery: 'contract terms',
    ragMode: { enabled: true, collections: ['client-docs'], topK: 10, minScore: 0.1 },
    requester,
  });
}

async function resolveFolders(requester?: Requester) {
  return resolveKnowledgeSources(NO_SOURCES, [], {
    db,
    userQuery: 'contract terms',
    ragMode: { enabled: true, folderPaths: [uploads, shared], useSemanticSearch: false, topK: 10, minScore: 0.1 },
    requester,
  });
}

describe('resolveKnowledgeSources — ragMode', () => {
  it('team analyst: only their own collection documents reach the prompt', async () => {
    setMode('team');
    const r = await resolveCollections(as('alice', 'analyst'));
    expect(r.contextDocuments).toContain(ALICE_DOC);
    expect(r.contextDocuments).not.toContain(BOB_DOC);
    expect(ownershipSql[0]).toMatch(/AND uploaded_by = \?$/);
  });

  it('team mode with no identity: no collection document at all (fail closed)', async () => {
    setMode('team');
    const r = await resolveCollections(undefined);
    expect(r.contextDocuments).not.toContain(ALICE_DOC);
    expect(r.contextDocuments).not.toContain(BOB_DOC);
  });

  it('negative control — a team admin and solo mode see every document, with no ownership query', async () => {
    setMode('team');
    const admin = await resolveCollections(as('root', 'admin'));
    expect(admin.contextDocuments).toContain(ALICE_DOC);
    expect(admin.contextDocuments).toContain(BOB_DOC);
    setMode('solo');
    const solo = await resolveCollections(undefined);
    expect(solo.contextDocuments).toContain(ALICE_DOC);
    expect(solo.contextDocuments).toContain(BOB_DOC);
    expect(ownershipSql).toEqual([]);
  });

  it('team analyst: BM25 retrieval skips an index over the upload store', async () => {
    setMode('team');
    await resolveFolders(as('alice', 'analyst'));
    expect(retrieveChunks.mock.calls[0][2]).toEqual([shared]);
  });

  it('negative control — solo BM25 retrieval still reads every folder named', async () => {
    setMode('solo');
    await resolveFolders(undefined);
    expect(retrieveChunks.mock.calls[0][2]).toEqual([uploads, shared]);
  });
});
