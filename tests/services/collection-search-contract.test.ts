/**
 * collection-search-contract.test.ts — Wave 2 "RAG labelled honestly".
 *
 * The contract under test: searchCollections() returns, with every result
 * set, the `method` that actually ran ('vector' | 'hybrid' | 'keyword') and a
 * `scoreKind` that says what `score` measures. A keyword density is never
 * presented as a similarity; the label never says "semantic" for keyword.
 *
 * Also: the query path reads chunk vectors from the `embeddings` table
 * filtered to content_type 'rag_chunk', the adapter's model + dimension, and
 * the SELECTED collection ids — proven by a fake db that applies the
 * collection filter from the bound params (so a query that forgot to pass
 * them would return every collection's chunks and fail the assertion).
 *
 * No database, no embedding provider: fake DatabaseAdapter + fake adapter.
 */
import { describe, it, expect } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import type { EmbeddingAdapter } from '../../server/services/embedding-adapter.js';
import {
  searchCollections,
  semanticSearch,
  keywordSearch,
  describeMethod,
  scoreKindForMethod,
} from '../../server/services/semantic-search.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

const DIMS = 4;
const MODEL = 'fake-embed-4';

interface ChunkFixture {
  chunk_id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  metadata: string | null;
  filename: string;
  file_type: string;
  collection_id: string;
  collection_name: string;
}

interface EmbeddingFixture {
  content_type: string;
  content_id: string;
  embedding: number[];
  embedding_model: string;
  embedding_dimension: number;
  collection_id: string;
}

const CHUNKS: ChunkFixture[] = [
  {
    chunk_id: 'c-sanctions', document_id: 'doc-a', chunk_index: 0, metadata: JSON.stringify({ page: 1 }),
    content: 'Sanctions screening thresholds are tuned to 85 percent similarity with transliteration enabled.',
    filename: 'sanctions-policy.pdf', file_type: 'pdf', collection_id: 'col-a', collection_name: 'Collection A',
  },
  {
    chunk_id: 'c-screening', document_id: 'doc-a', chunk_index: 1, metadata: JSON.stringify({ page: 2 }),
    content: 'The screening queue is reviewed daily by the compliance analyst team.',
    filename: 'sanctions-policy.pdf', file_type: 'pdf', collection_id: 'col-a', collection_name: 'Collection A',
  },
  {
    chunk_id: 'c-payroll', document_id: 'doc-b', chunk_index: 0, metadata: null,
    content: 'Payroll records are retained for seven years after employment ends.',
    filename: 'hr-retention.docx', file_type: 'docx', collection_id: 'col-a', collection_name: 'Collection A',
  },
  {
    chunk_id: 'c-other', document_id: 'doc-z', chunk_index: 0, metadata: null,
    content: 'Sanctions screening in the OTHER collection must never appear when col-a alone is selected.',
    filename: 'other.md', file_type: 'md', collection_id: 'col-z', collection_name: 'Collection Z',
  },
];

function embeddingsFor(model = MODEL, dims = DIMS): EmbeddingFixture[] {
  return [
    { content_type: 'rag_chunk', content_id: 'c-sanctions', embedding: [1, 0, 0, 0], embedding_model: model, embedding_dimension: dims, collection_id: 'col-a' },
    { content_type: 'rag_chunk', content_id: 'c-screening', embedding: [0.8, 0.6, 0, 0], embedding_model: model, embedding_dimension: dims, collection_id: 'col-a' },
    { content_type: 'rag_chunk', content_id: 'c-payroll', embedding: [0, 0, 1, 0], embedding_model: model, embedding_dimension: dims, collection_id: 'col-a' },
    { content_type: 'rag_chunk', content_id: 'c-other', embedding: [1, 0, 0, 0], embedding_model: model, embedding_dimension: dims, collection_id: 'col-z' },
  ];
}

/** Adapter that maps a few query strings to known vectors; anything else → zero sentinel. */
function fakeAdapter(vectors: Record<string, number[]>, opts: { model?: string; dims?: number } = {}): EmbeddingAdapter {
  const dims = opts.dims ?? DIMS;
  return {
    provider: 'ollama',
    model: opts.model ?? MODEL,
    dimensions: dims,
    async embed(text: string): Promise<number[]> {
      return vectors[text] ?? new Array(dims).fill(0);
    },
    async embedBatch(texts: string[]): Promise<number[][]> {
      return texts.map((t) => vectors[t] ?? new Array(dims).fill(0));
    },
  };
}

interface FakeDb {
  db: DatabaseAdapter;
  calls: Array<{ kind: 'get' | 'all' | 'run'; sql: string; params: unknown[] }>;
}

/**
 * SQL-routed fake. The collection filter is APPLIED FROM THE PARAMS: the
 * chunk query is given the collection ids as its only params; the embeddings
 * query is given (content_type, model, dims, ...collection ids). When the
 * code under test passes no collection ids, the fake returns every row —
 * which is exactly what the "filtered by collection" test must catch.
 */
function makeFakeDb(chunks: ChunkFixture[], embeddings: EmbeddingFixture[]): FakeDb {
  const calls: FakeDb['calls'] = [];
  const db: DatabaseAdapter = {
    dialect: 'postgresql' as DatabaseAdapter['dialect'],
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      calls.push({ kind: 'get', sql, params });
      if (sql.includes('COUNT(DISTINCT e.content_id)')) {
        // stale-vector probe: (content_type, model, ...collection ids)
        const [ctype, model, ...cols] = params as string[];
        const n = new Set(
          embeddings
            .filter((e) => e.content_type === ctype && e.embedding_model !== model && (cols.length === 0 || cols.includes(e.collection_id)))
            .map((e) => e.content_id),
        ).size;
        return { n } as T;
      }
      return undefined;
    },
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      calls.push({ kind: 'all', sql, params });
      if (sql.includes('FROM embeddings e')) {
        const [ctype, model, dims, ...cols] = params as [string, string, number, ...string[]];
        return embeddings
          .filter((e) => e.content_type === ctype && e.embedding_model === model && e.embedding_dimension === dims)
          .filter((e) => cols.length === 0 || cols.includes(e.collection_id))
          .map((e) => ({ content_id: e.content_id, embedding: JSON.stringify(e.embedding) })) as T[];
      }
      if (sql.includes('FROM rag_chunks c') && sql.includes('knowledge_collections')) {
        const cols = params as string[];
        return chunks.filter((c) => cols.length === 0 || cols.includes(c.collection_id)) as T[];
      }
      return [];
    },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      calls.push({ kind: 'run', sql, params });
      return { changes: 0, lastInsertRowid: 0 } as RunResult;
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (txDb: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  };
  return { db, calls };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('searchCollections — the method is what actually ran', () => {
  it('keyword fallback (no query vector) is labelled keyword, scored as term coverage, never called semantic', async () => {
    const { db } = makeFakeDb(CHUNKS, embeddingsFor());
    const adapter = fakeAdapter({}); // every query → zero vector (provider down)

    const set = await searchCollections(db, { query: 'sanctions screening thresholds', collections: ['col-a'] }, { adapter });

    expect(set.method).toBe('keyword');
    expect(set.scoreKind).toBe('keyword_density');
    expect(set.methodLabel.toLowerCase()).not.toContain('semantic');
    expect(set.methodLabel.toLowerCase()).toContain('keyword');
    expect(set.diagnostics.reason).toMatch(/query embedding unavailable/);
    expect(set.diagnostics.vectorCandidates).toBe(0);

    expect(set.results.length).toBeGreaterThan(0);
    for (const r of set.results) {
      expect(r.method).toBe('keyword');
      expect(r.scoreKind).toBe('keyword_density');
      expect(r.similarity).toBeUndefined();
      expect(r.relevanceScore).toBe(r.score);
    }
    // 3 content terms: sanctions, screening, thresholds → c-sanctions has all 3
    const top = set.results[0];
    expect(top.chunkId).toBe('c-sanctions');
    expect(top.score).toBeCloseTo(1, 6);
    // c-screening has only "screening" → 1/3, and is honestly reported as such
    const second = set.results.find((r) => r.chunkId === 'c-screening');
    expect(second?.score).toBeCloseTo(1 / 3, 6);
  });

  it('no stored chunk vectors → keyword, with a reason pointing at reindex-stuck', async () => {
    const { db } = makeFakeDb(CHUNKS, []); // nothing embedded yet
    const adapter = fakeAdapter({ 'sanctions screening': [1, 0, 0, 0] });

    const set = await searchCollections(db, { query: 'sanctions screening', collections: ['col-a'] }, { adapter });

    expect(set.method).toBe('keyword');
    expect(set.diagnostics.embeddedChunks).toBe(0);
    expect(set.diagnostics.staleVectorChunks).toBe(0);
    expect(set.diagnostics.reason).toMatch(/reindex-stuck/);
  });

  it('vectors from a different model are not compared — reported as stale, reason points at reembed', async () => {
    const { db } = makeFakeDb(CHUNKS, embeddingsFor('old-model-4'));
    const adapter = fakeAdapter({ 'sanctions screening': [1, 0, 0, 0] });

    const set = await searchCollections(db, { query: 'sanctions screening', collections: ['col-a'] }, { adapter });

    expect(set.method).toBe('keyword');
    expect(set.diagnostics.embeddedChunks).toBe(0);
    expect(set.diagnostics.staleVectorChunks).toBe(3);
    expect(set.diagnostics.reason).toMatch(/different embedding model/);
    expect(set.diagnostics.reason).toMatch(/reembed/);
  });

  it('vector-only (query terms absent from every chunk) is labelled vector with cosine scores', async () => {
    const { db } = makeFakeDb(CHUNKS, embeddingsFor());
    const adapter = fakeAdapter({ zebra: [1, 0, 0, 0] });

    const set = await searchCollections(db, { query: 'zebra', collections: ['col-a'] }, { adapter });

    expect(set.method).toBe('vector');
    expect(set.scoreKind).toBe('cosine_similarity');
    expect(set.methodLabel).toContain(MODEL);
    expect(set.diagnostics.keywordCandidates).toBe(0);
    expect(set.diagnostics.embeddedChunks).toBe(3);

    expect(set.results.map((r) => r.chunkId)).toEqual(['c-sanctions', 'c-screening']); // payroll: cosine 0 < floor
    expect(set.results[0].score).toBeCloseTo(1, 6);
    expect(set.results[0].similarity).toBeCloseTo(1, 6);
    expect(set.results[1].score).toBeCloseTo(0.8, 6);
    expect(set.results[1].similarity).toBeCloseTo(0.8, 6);
    expect(set.results[0].vectorRank).toBe(1);
    expect(set.results[0].keywordRank).toBeUndefined();
  });

  it('hybrid (both sides contribute) is labelled hybrid; first-in-both scores 1.0, one-list-only ≤ 0.5', async () => {
    const { db } = makeFakeDb(CHUNKS, embeddingsFor());
    const adapter = fakeAdapter({ 'sanctions screening thresholds': [1, 0, 0, 0] });

    const set = await searchCollections(db, { query: 'sanctions screening thresholds', collections: ['col-a'] }, { adapter });

    expect(set.method).toBe('hybrid');
    expect(set.scoreKind).toBe('rrf_normalised');
    expect(set.methodLabel).toMatch(/hybrid/);
    expect(set.methodLabel).toMatch(/reciprocal rank/);

    const top = set.results[0];
    expect(top.chunkId).toBe('c-sanctions');
    expect(top.score).toBeCloseTo(1, 6);
    expect(top.vectorRank).toBe(1);
    expect(top.keywordRank).toBe(1);
    expect(top.similarity).toBeCloseTo(1, 6);

    // c-screening is 2nd in both lists → (1/62 + 1/62) / (2/61) = 61/62
    const screening = set.results.find((r) => r.chunkId === 'c-screening');
    expect(screening?.score).toBeCloseTo(61 / 62, 6);

    for (const r of set.results) {
      expect(r.method).toBe('hybrid');
      expect(r.scoreKind).toBe('rrf_normalised');
      const inBoth = r.vectorRank !== undefined && r.keywordRank !== undefined;
      if (!inBoth) expect(r.score).toBeLessThanOrEqual(0.5);
    }
  });

  it('the query path is filtered to the selected collections (params carried, other collection excluded)', async () => {
    const { db, calls } = makeFakeDb(CHUNKS, embeddingsFor());
    const adapter = fakeAdapter({ 'sanctions screening': [1, 0, 0, 0] });

    const set = await searchCollections(db, { query: 'sanctions screening', collections: ['col-a'] }, { adapter });

    // c-other matches both the terms and the vector exactly — it must be absent
    expect(set.results.some((r) => r.collectionId === 'col-z')).toBe(false);
    expect(set.results.every((r) => r.collectionId === 'col-a')).toBe(true);

    const chunkQuery = calls.find((c) => c.kind === 'all' && c.sql.includes('FROM rag_chunks c') && c.sql.includes('knowledge_collections'));
    expect(chunkQuery?.params).toEqual(['col-a']);
    expect(chunkQuery?.sql).toMatch(/d\.collection_id IN \(\?\)/);
    expect(chunkQuery?.sql).toMatch(/index_status = 'indexed'/);

    const embQuery = calls.find((c) => c.kind === 'all' && c.sql.includes('FROM embeddings e'));
    expect(embQuery?.params).toEqual(['rag_chunk', MODEL, DIMS, 'col-a']);
    expect(embQuery?.sql).toMatch(/e\.content_type = \?/);
    expect(embQuery?.sql).toMatch(/e\.embedding_model = \?/);
    expect(embQuery?.sql).toMatch(/e\.embedding_dimension = \?/);
    expect(embQuery?.sql).toMatch(/d\.collection_id IN \(\?\)/);

    // Read-only path: no writes
    expect(calls.some((c) => c.kind === 'run')).toBe(false);
  });

  it('two collections → both ids bound, union of their chunks searched', async () => {
    const { db, calls } = makeFakeDb(CHUNKS, embeddingsFor());
    const adapter = fakeAdapter({ 'sanctions screening': [1, 0, 0, 0] });

    const set = await searchCollections(db, { query: 'sanctions screening', collections: ['col-a', 'col-z'] }, { adapter });

    expect(set.results.some((r) => r.collectionId === 'col-z')).toBe(true);
    const embQuery = calls.find((c) => c.kind === 'all' && c.sql.includes('FROM embeddings e'));
    expect(embQuery?.params).toEqual(['rag_chunk', MODEL, DIMS, 'col-a', 'col-z']);
  });

  it('metadata filters narrow the candidate set before ranking', async () => {
    const { db } = makeFakeDb(CHUNKS, embeddingsFor());
    const adapter = fakeAdapter({});

    const set = await searchCollections(db, { query: 'sanctions screening', collections: ['col-a'], filters: { page: 2 } }, { adapter });

    expect(set.results.map((r) => r.chunkId)).toEqual(['c-screening']);
    expect(set.diagnostics.chunksConsidered).toBe(1);
  });

  it('empty inputs still return a labelled set', async () => {
    const { db } = makeFakeDb(CHUNKS, embeddingsFor());
    const adapter = fakeAdapter({});

    const none = await searchCollections(db, { query: 'sanctions', collections: [] }, { adapter });
    expect(none.results).toEqual([]);
    expect(none.method).toBe('keyword');
    expect(none.diagnostics.reason).toMatch(/no collections/);

    const blank = await searchCollections(db, { query: '   ', collections: ['col-a'] }, { adapter });
    expect(blank.results).toEqual([]);
    expect(blank.diagnostics.reason).toMatch(/empty query/);
  });

  it('a query vector of the wrong dimension skips the vector side rather than comparing', async () => {
    const { db } = makeFakeDb(CHUNKS, embeddingsFor());
    const adapter = fakeAdapter({ 'sanctions screening': [1, 0, 0] }); // 3 dims vs adapter's 4

    const set = await searchCollections(db, { query: 'sanctions screening', collections: ['col-a'] }, { adapter });
    expect(set.method).toBe('keyword');
    expect(set.diagnostics.reason).toMatch(/dimensions/);
  });
});

describe('legacy entry points carry the same labels', () => {
  it('semanticSearch() returns the array whose elements are labelled (relevanceScore alias == score)', async () => {
    const { db } = makeFakeDb(CHUNKS, embeddingsFor());
    // Zero-vector adapter → keyword path. Injected so the test never reaches a real provider.
    const results = await semanticSearch(db, { query: 'sanctions screening thresholds', collections: ['col-a'] }, { adapter: fakeAdapter({}) });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.method).toBe('keyword');
      expect(r.scoreKind).toBe('keyword_density');
      expect(r.relevanceScore).toBe(r.score);
    }
  });

  it('keywordSearch() results are labelled keyword', async () => {
    const { db } = makeFakeDb(CHUNKS, []);
    const results = await keywordSearch(db, 'payroll retained', ['col-a'], 5);
    expect(results.map((r) => r.chunkId)).toEqual(['c-payroll']);
    expect(results[0].method).toBe('keyword');
    expect(results[0].scoreKind).toBe('keyword_density');
    expect(results[0].score).toBeCloseTo(1, 6);
    expect(results[0].citation).toBe('hr-retention.docx');
  });
});

describe('labels', () => {
  it('scoreKindForMethod is total and describeMethod never says semantic for keyword', () => {
    expect(scoreKindForMethod('vector')).toBe('cosine_similarity');
    expect(scoreKindForMethod('hybrid')).toBe('rrf_normalised');
    expect(scoreKindForMethod('keyword')).toBe('keyword_density');
    expect(describeMethod('keyword', 'm').toLowerCase()).not.toContain('semantic');
    expect(describeMethod('keyword', 'm')).toMatch(/not a relevance measure/);
    expect(describeMethod('vector', 'nomic-embed-text')).toContain('nomic-embed-text');
  });
});
