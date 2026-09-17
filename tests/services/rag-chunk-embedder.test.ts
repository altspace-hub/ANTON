/**
 * rag-chunk-embedder.test.ts — Wave 2: collection chunks are embedded into
 * the `embeddings` table (content_type 'rag_chunk', content_id = chunk id).
 *
 *   • Write path through the REAL SQLiteVectorStore against a fake db: the
 *     INSERT carries content_type 'rag_chunk', the chunk id, the adapter's
 *     model and the vector's dimension.
 *   • Dimension safety: a vector of the wrong length, the zero sentinel and
 *     a misaligned batch are skipped with a warning — never stored, never thrown.
 *   • Delete helpers scope by content_type + ids / collection subquery.
 *
 * No database, no embedding provider.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import type { EmbeddingAdapter } from '../../server/services/embedding-adapter.js';
import { SQLiteVectorStore } from '../../server/services/vector-stores/sqlite-vector-store.js';
import {
  RAG_CHUNK_CONTENT_TYPE,
  embedRagChunks,
  deleteRagChunkEmbeddings,
  deleteCollectionChunkEmbeddings,
} from '../../server/services/rag/chunk-embedder.js';

const DIMS = 4;

function fakeAdapter(vectorFor: (text: string) => number[], model = 'fake-embed-4'): EmbeddingAdapter & { batches: string[][] } {
  const batches: string[][] = [];
  return {
    provider: 'ollama',
    model,
    dimensions: DIMS,
    batches,
    async embed(text: string) { return vectorFor(text); },
    async embedBatch(texts: string[]) { batches.push(texts); return texts.map(vectorFor); },
  };
}

function makeFakeDb(): { db: DatabaseAdapter; runs: Array<{ sql: string; params: unknown[] }> } {
  const runs: Array<{ sql: string; params: unknown[] }> = [];
  const db: DatabaseAdapter = {
    dialect: 'postgresql' as DatabaseAdapter['dialect'],
    async get<T>(): Promise<T | undefined> { return undefined; },
    async all<T>(): Promise<T[]> { return []; },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      runs.push({ sql, params });
      return { changes: params.length > 1 ? params.length - 1 : 1, lastInsertRowid: 0 } as RunResult;
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (txDb: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  };
  return { db, runs };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('embedRagChunks — write path into the embeddings table', () => {
  it('stores one embeddings row per chunk: content_type rag_chunk, content_id = chunk id, model, dimension', async () => {
    const { db, runs } = makeFakeDb();
    const adapter = fakeAdapter((t) => [t.length, 1, 0, 0]);
    const store = new SQLiteVectorStore(db);

    const result = await embedRagChunks(db, [
      { id: 'chunk-1', content: 'first passage', metadata: { collection_id: 'col-a', chunk_index: 0 } },
      { id: 'chunk-2', content: 'second passage, longer', metadata: { collection_id: 'col-a', chunk_index: 1 } },
    ], { adapter, store });

    expect(result).toMatchObject({ embedded: 2, skipped: 0, model: 'fake-embed-4', provider: 'ollama', dimensions: DIMS });
    expect(adapter.batches).toEqual([['first passage', 'second passage, longer']]);

    const inserts = runs.filter((r) => r.sql.includes('INSERT INTO embeddings'));
    expect(inserts).toHaveLength(2);
    // SQLiteVectorStore param order: id, content_type, content_id, content_text, embedding, model, dimension, metadata
    const [, ctype, cid, text, vec, model, dim, meta] = inserts[0].params as [string, string, string, string, string, string, number, string];
    expect(ctype).toBe(RAG_CHUNK_CONTENT_TYPE);
    expect(cid).toBe('chunk-1');
    expect(text).toBe('first passage');
    expect(JSON.parse(vec)).toEqual(['first passage'.length, 1, 0, 0]);
    expect(model).toBe('fake-embed-4');
    expect(dim).toBe(DIMS);
    expect(JSON.parse(meta)).toEqual({ collection_id: 'col-a', chunk_index: 0 });
    expect(inserts[0].sql).toMatch(/ON CONFLICT\(content_type, content_id, embedding_model\)/);
    expect((inserts[1].params as unknown[])[2]).toBe('chunk-2');
  });

  it('skips empty content before batching so vectors stay aligned with chunk ids', async () => {
    const { db, runs } = makeFakeDb();
    const adapter = fakeAdapter((t) => [t.length, 1, 0, 0]);
    const store = new SQLiteVectorStore(db);

    const result = await embedRagChunks(db, [
      { id: 'blank', content: '   ' },
      { id: 'real', content: 'real passage' },
    ], { adapter, store });

    expect(result.embedded).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.skippedReasons.empty).toBe(1);
    expect(adapter.batches).toEqual([['real passage']]);
    const inserts = runs.filter((r) => r.sql.includes('INSERT INTO embeddings'));
    expect(inserts).toHaveLength(1);
    expect((inserts[0].params as unknown[])[2]).toBe('real');
  });

  it('a vector of the wrong dimension is skipped with a warning, never stored, never thrown', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { db, runs } = makeFakeDb();
    // 3-dim vectors from an adapter that declares 4
    const adapter = fakeAdapter(() => [1, 0, 0]);
    const store = new SQLiteVectorStore(db);

    const result = await embedRagChunks(db, [{ id: 'c1', content: 'x' }, { id: 'c2', content: 'y' }], { adapter, store });

    expect(result.embedded).toBe(0);
    expect(result.skippedReasons.dimensionMismatch).toBe(2);
    expect(runs.filter((r) => r.sql.includes('INSERT INTO embeddings'))).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).toMatch(/dimension/);
  });

  it('the zero-vector sentinel (provider down) is skipped, not stored', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { db, runs } = makeFakeDb();
    const adapter = fakeAdapter((t) => (t === 'ok' ? [0, 1, 0, 0] : [0, 0, 0, 0]));
    const store = new SQLiteVectorStore(db);

    const result = await embedRagChunks(db, [{ id: 'dead', content: 'down' }, { id: 'live', content: 'ok' }], { adapter, store });

    expect(result.embedded).toBe(1);
    expect(result.skippedReasons.zeroVector).toBe(1);
    const inserts = runs.filter((r) => r.sql.includes('INSERT INTO embeddings'));
    expect(inserts.map((i) => (i.params as unknown[])[2])).toEqual(['live']);
  });

  it('a misaligned batch (fewer vectors than chunks) is refused whole', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { db, runs } = makeFakeDb();
    const adapter: EmbeddingAdapter = {
      provider: 'openai', model: 'm', dimensions: DIMS,
      async embed() { return [1, 0, 0, 0]; },
      async embedBatch(texts: string[]) { return texts.slice(1).map(() => [1, 0, 0, 0]); }, // drops one
    };
    const store = new SQLiteVectorStore(db);

    const result = await embedRagChunks(db, [{ id: 'a', content: 'a' }, { id: 'b', content: 'b' }], { adapter, store });

    expect(result.embedded).toBe(0);
    expect(result.skipped).toBe(2);
    expect(runs.filter((r) => r.sql.includes('INSERT INTO embeddings'))).toHaveLength(0);
  });

  it('a store error is counted and does not stop the remaining chunks', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { db } = makeFakeDb();
    const adapter = fakeAdapter(() => [1, 0, 0, 0]);
    const stored: string[] = [];
    const store = {
      async store(p: { contentId: string }) { if (p.contentId === 'bad') throw new Error('boom'); stored.push(p.contentId); },
      async search() { return []; },
      async delete() { /* noop */ },
      async getCount() { return 0; },
    };

    const result = await embedRagChunks(db, [{ id: 'bad', content: 'x' }, { id: 'good', content: 'y' }], { adapter, store });
    expect(result.embedded).toBe(1);
    expect(result.skippedReasons.storeError).toBe(1);
    expect(stored).toEqual(['good']);
  });

  it('respects batchSize', async () => {
    const { db } = makeFakeDb();
    const adapter = fakeAdapter(() => [1, 0, 0, 0]);
    const store = new SQLiteVectorStore(db);
    await embedRagChunks(db, [
      { id: '1', content: 'a' }, { id: '2', content: 'b' }, { id: '3', content: 'c' },
    ], { adapter, store, batchSize: 2 });
    expect(adapter.batches).toEqual([['a', 'b'], ['c']]);
  });
});

describe('delete helpers scope to rag_chunk rows', () => {
  it('deleteRagChunkEmbeddings deletes by content_type + ids', async () => {
    const { db, runs } = makeFakeDb();
    await deleteRagChunkEmbeddings(db, ['c1', 'c2']);
    expect(runs).toHaveLength(1);
    expect(runs[0].sql).toMatch(/DELETE FROM embeddings WHERE content_type = \? AND content_id IN \(\?,\?\)/);
    expect(runs[0].params).toEqual([RAG_CHUNK_CONTENT_TYPE, 'c1', 'c2']);
  });

  it('deleteRagChunkEmbeddings with no ids issues no SQL', async () => {
    const { db, runs } = makeFakeDb();
    await deleteRagChunkEmbeddings(db, []);
    expect(runs).toHaveLength(0);
  });

  it('deleteCollectionChunkEmbeddings scopes through rag_chunks → rag_documents.collection_id', async () => {
    const { db, runs } = makeFakeDb();
    await deleteCollectionChunkEmbeddings(db, 'col-a');
    expect(runs).toHaveLength(1);
    expect(runs[0].sql).toMatch(/DELETE FROM embeddings/);
    expect(runs[0].sql).toMatch(/content_type = \?/);
    expect(runs[0].sql).toMatch(/JOIN rag_documents d ON d\.id = c\.document_id/);
    expect(runs[0].sql).toMatch(/d\.collection_id = \?/);
    expect(runs[0].params).toEqual([RAG_CHUNK_CONTENT_TYPE, 'col-a']);
  });
});
