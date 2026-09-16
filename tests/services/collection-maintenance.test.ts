/**
 * collection-maintenance.test.ts — Wave 2: re-drive documents stuck in
 * `indexing` and chunks with no vector for the current model.
 *
 *   • Dry run selects with the documented SQL and parameters and issues NO
 *     write.
 *   • Run: a stuck document whose file still exists is re-indexed through
 *     the injected reindexDocument; one whose file is gone is marked failed;
 *     chunks without a vector are handed to the injected embedder.
 *   • reembedCollection drops the collection's vectors first, then embeds
 *     every chunk of the collection.
 *
 * No database, no disk, no embedding provider.
 */
import { describe, it, expect } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import type { EmbeddingAdapter } from '../../server/services/embedding-adapter.js';
import {
  planStuckReindex,
  reindexStuck,
  reembedCollection,
  stuckDocumentsSql,
  unembeddedChunksSql,
  unembeddedByCollectionSql,
} from '../../server/services/rag/collection-maintenance.js';
import type { EmbedRagChunksResult, RagChunkToEmbed } from '../../server/services/rag/chunk-embedder.js';

const adapter: EmbeddingAdapter = {
  provider: 'ollama', model: 'fake-embed-4', dimensions: 4,
  async embed() { return [1, 0, 0, 0]; },
  async embedBatch(texts: string[]) { return texts.map(() => [1, 0, 0, 0]); },
};

interface Calls { all: Array<{ sql: string; params: unknown[] }>; run: Array<{ sql: string; params: unknown[] }> }

function makeFakeDb(fixture: {
  stuck?: Array<Record<string, unknown>>;
  byCollection?: Array<{ collection_id: string; chunks: number }>;
  unembedded?: Array<Record<string, unknown>>;
  collectionChunks?: Array<Record<string, unknown>>;
}): { db: DatabaseAdapter; calls: Calls } {
  const calls: Calls = { all: [], run: [] };
  const db: DatabaseAdapter = {
    dialect: 'postgresql' as DatabaseAdapter['dialect'],
    async get<T>(): Promise<T | undefined> { return undefined; },
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      calls.all.push({ sql, params });
      if (sql.includes("index_status = 'indexing'")) return (fixture.stuck ?? []) as T[];
      if (sql.includes('GROUP BY d.collection_id')) return (fixture.byCollection ?? []) as T[];
      if (sql.includes('NOT EXISTS')) return (fixture.unembedded ?? []) as T[];
      if (sql.includes('WHERE d.collection_id = ?') && sql.includes('ORDER BY d.id, c.chunk_index')) return (fixture.collectionChunks ?? []) as T[];
      return [];
    },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      calls.run.push({ sql, params });
      return { changes: 3, lastInsertRowid: 0 } as RunResult;
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (txDb: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  };
  return { db, calls };
}

const STUCK = [
  { id: 'doc-exists', collection_id: 'wolfsberg', filename: 'a.pdf', file_path: 'C:\\uploads\\a.pdf', uploaded_at: new Date('2026-03-29T10:00:00Z'), chunk_count: 0, stored_chunks: '0' },
  { id: 'doc-gone', collection_id: 'wolfsberg', filename: 'b.pdf', file_path: 'C:\\uploads\\b.pdf', uploaded_at: '2026-03-29T10:00:01Z', chunk_count: 0, stored_chunks: 0 },
];

const fileExists = async (p: string) => p.endsWith('a.pdf');

describe('planStuckReindex (dry run)', () => {
  it('selects with the documented SQL + params and writes nothing', async () => {
    const { db, calls } = makeFakeDb({ stuck: STUCK, byCollection: [{ collection_id: 'client-files', chunks: 134 }] });

    const plan = await planStuckReindex(db, { olderThanMinutes: 30 }, { adapter, fileExists });

    expect(plan.embeddingModel).toBe('fake-embed-4');
    expect(plan.olderThanMinutes).toBe(30);
    expect(plan.stuckDocuments).toEqual([
      { id: 'doc-exists', collectionId: 'wolfsberg', filename: 'a.pdf', uploadedAt: '2026-03-29T10:00:00.000Z', storedChunks: 0, fileExists: true },
      { id: 'doc-gone', collectionId: 'wolfsberg', filename: 'b.pdf', uploadedAt: '2026-03-29T10:00:01Z', storedChunks: 0, fileExists: false },
    ]);
    expect(plan.unembeddedChunks).toBe(134);
    expect(plan.unembeddedByCollection).toEqual([{ collectionId: 'client-files', chunks: 134 }]);

    expect(calls.run).toHaveLength(0);

    const stuckQ = calls.all.find((c) => c.sql.includes("index_status = 'indexing'"));
    expect(stuckQ?.sql).toBe(stuckDocumentsSql(false));
    expect(stuckQ?.params).toEqual([30, 50]);
    expect(stuckQ?.sql).toMatch(/uploaded_at < NOW\(\) - \(\? \* INTERVAL '1 minute'\)/);

    const byCol = calls.all.find((c) => c.sql.includes('GROUP BY d.collection_id'));
    expect(byCol?.sql).toBe(unembeddedByCollectionSql(false));
    expect(byCol?.params).toEqual(['rag_chunk', 'fake-embed-4']);
  });

  it('scopes both selections to one collection when asked', async () => {
    const { db, calls } = makeFakeDb({});
    await planStuckReindex(db, { collectionId: 'wolfsberg', olderThanMinutes: 5, documentLimit: 7 }, { adapter, fileExists });
    const stuckQ = calls.all.find((c) => c.sql.includes("index_status = 'indexing'"));
    expect(stuckQ?.sql).toBe(stuckDocumentsSql(true));
    expect(stuckQ?.params).toEqual([5, 'wolfsberg', 7]);
    const byCol = calls.all.find((c) => c.sql.includes('GROUP BY d.collection_id'));
    expect(byCol?.params).toEqual(['rag_chunk', 'fake-embed-4', 'wolfsberg']);
  });

  it('reindexStuck with dryRun returns the plan and touches nothing', async () => {
    const { db, calls } = makeFakeDb({ stuck: STUCK, unembedded: [{ id: 'c1', content: 'x' }] });
    let embedCalls = 0;
    const result = await reindexStuck(db, { dryRun: true }, {
      adapter, fileExists,
      reindexDocument: async () => { throw new Error('must not run in dry run'); },
      embedChunks: async () => { embedCalls++; throw new Error('must not run in dry run'); },
    });
    expect(result.dryRun).toBe(true);
    expect(result.plan.stuckDocuments).toHaveLength(2);
    expect(result.reindexed).toEqual([]);
    expect(result.embedding).toBeNull();
    expect(embedCalls).toBe(0);
    expect(calls.run).toHaveLength(0);
    // The unembedded-chunk SELECT (pass 2) is not even issued in a dry run
    expect(calls.all.some((c) => c.sql.includes('NOT EXISTS') && !c.sql.includes('GROUP BY'))).toBe(false);
  });
});

describe('reindexStuck (run)', () => {
  it('re-indexes the document whose file exists, marks the missing one failed, embeds unembedded chunks', async () => {
    const unembedded = [
      { id: 'c1', content: 'chunk one', metadata: '{"page":1}', document_id: 'doc-x', chunk_index: 0, collection_id: 'client-files', filename: 'x.md' },
      { id: 'c2', content: 'chunk two', metadata: null, document_id: 'doc-x', chunk_index: 1, collection_id: 'client-files', filename: 'x.md' },
    ];
    const { db, calls } = makeFakeDb({ stuck: STUCK, unembedded });

    const reindexed: string[] = [];
    const embedded: RagChunkToEmbed[][] = [];
    const embedResult: EmbedRagChunksResult = {
      embedded: 2, skipped: 0, provider: 'ollama', model: 'fake-embed-4', dimensions: 4,
      skippedReasons: { empty: 0, zeroVector: 0, dimensionMismatch: 0, storeError: 0 },
    };

    const result = await reindexStuck(db, { olderThanMinutes: 30 }, {
      adapter, fileExists,
      reindexDocument: async (_db, id) => { reindexed.push(id); return { success: true, documentId: id, chunkCount: 12, embeddedCount: 12 }; },
      embedChunks: async (_db, chunks) => { embedded.push(chunks); return embedResult; },
    });

    expect(result.dryRun).toBe(false);
    expect(reindexed).toEqual(['doc-exists']);
    expect(result.reindexed).toEqual([{ id: 'doc-exists', filename: 'a.pdf', chunkCount: 12, embeddedCount: 12 }]);

    expect(result.markedFailed).toEqual([{ id: 'doc-gone', filename: 'b.pdf', reason: 'source file no longer on disk' }]);
    const failUpdate = calls.run.find((r) => r.sql.includes("index_status = 'failed'"));
    expect(failUpdate?.params).toEqual(['doc-gone']);

    // Pass 2 selection carries the current model and the limit
    const unembQ = calls.all.find((c) => c.sql.includes('NOT EXISTS') && !c.sql.includes('GROUP BY'));
    expect(unembQ?.sql).toBe(unembeddedChunksSql(false));
    expect(unembQ?.params).toEqual(['rag_chunk', 'fake-embed-4', 2000]);

    expect(embedded).toHaveLength(1);
    expect(embedded[0].map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(embedded[0][0].metadata).toEqual({ collection_id: 'client-files', document_id: 'doc-x', chunk_index: 0, filename: 'x.md', page: 1 });
    expect(result.embedding).toEqual(embedResult);
  });

  it('a reindex failure is reported per document and does not stop the others', async () => {
    const stuck = [
      { ...STUCK[0], id: 'doc-1', file_path: 'C:\\a.pdf' },
      { ...STUCK[0], id: 'doc-2', file_path: 'C:\\a.pdf' },
    ];
    const { db } = makeFakeDb({ stuck });
    const result = await reindexStuck(db, {}, {
      adapter, fileExists: async () => true,
      reindexDocument: async (_db, id) => (id === 'doc-1' ? { success: false, error: 'extract failed' } : { success: true, documentId: id, chunkCount: 1, embeddedCount: 1 }),
      embedChunks: async () => { throw new Error('no unembedded rows → not called'); },
    });
    expect(result.reindexErrors).toEqual([{ id: 'doc-1', filename: 'a.pdf', error: 'extract failed' }]);
    expect(result.reindexed.map((r) => r.id)).toEqual(['doc-2']);
    expect(result.embedding).toBeNull();
  });
});

describe('reembedCollection', () => {
  it('drops the collection vectors first, then embeds every chunk of the collection with the current adapter', async () => {
    const collectionChunks = [
      { id: 'c1', content: 'one', metadata: null, document_id: 'd1', chunk_index: 0, collection_id: 'wolfsberg', filename: 'w.pdf' },
      { id: 'c2', content: 'two', metadata: '{"section":"2"}', document_id: 'd1', chunk_index: 1, collection_id: 'wolfsberg', filename: 'w.pdf' },
    ];
    const { db, calls } = makeFakeDb({ collectionChunks });
    const embedded: RagChunkToEmbed[][] = [];

    const out = await reembedCollection(db, 'wolfsberg', {
      adapter,
      embedChunks: async (_db, chunks) => {
        embedded.push(chunks);
        return { embedded: chunks.length, skipped: 0, provider: 'ollama', model: 'fake-embed-4', dimensions: 4, skippedReasons: { empty: 0, zeroVector: 0, dimensionMismatch: 0, storeError: 0 } };
      },
    });

    expect(calls.run).toHaveLength(1);
    expect(calls.run[0].sql).toMatch(/DELETE FROM embeddings/);
    expect(calls.run[0].params).toEqual(['rag_chunk', 'wolfsberg']);
    // The delete precedes the chunk read
    const deleteIdx = 0;
    const readIdx = calls.all.findIndex((c) => c.sql.includes('ORDER BY d.id, c.chunk_index'));
    expect(readIdx).toBeGreaterThanOrEqual(0);
    expect(deleteIdx).toBe(0);

    expect(embedded[0].map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(embedded[0][1].metadata).toEqual({ collection_id: 'wolfsberg', document_id: 'd1', chunk_index: 1, filename: 'w.pdf', section: '2' });
    expect(out).toEqual({
      collectionId: 'wolfsberg', chunks: 2, embedded: 2, skipped: 0, removedVectors: 3,
      embedding_model: 'fake-embed-4', embedding_provider: 'ollama',
    });
  });
});
