/**
 * pgvector-store.test.ts — Phase-4 RAG/pgvector merge (PATH B).
 *
 * The real pgvector path needs the Postgres `vector` extension, which isn't
 * present in the node test env, so these tests verify the SQL COMPOSITION and the
 * routing/guard logic against a mock DatabaseAdapter — the load-bearing decisions
 * the adversarial review flagged: zero-vector NaN guard, non-1536 dimension
 * fallback, readiness probe + JS fallback, and ON CONFLICT updating embedding_vec.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PgVectorStore } from '../../../server/services/vector-stores/pgvector-store.js';
import { SQLiteVectorStore } from '../../../server/services/vector-stores/sqlite-vector-store.js';
import { getVectorStore, resetVectorStore } from '../../../server/services/vector-store-adapter.js';
import { isZeroVector } from '../../../server/services/embedding-adapter.js';
import type { DatabaseAdapter } from '../../../server/db/database.js';

interface SqlCall { sql: string; args: unknown[]; }

function makeMockDb(opts?: { dialect?: 'postgresql' | 'sqlite'; probeReady?: boolean }): DatabaseAdapter & { calls: SqlCall[] } {
  const calls: SqlCall[] = [];
  const dialect = opts?.dialect ?? 'postgresql';
  const probeReady = opts?.probeReady ?? true;
  return {
    dialect,
    get: async (sql: string, ...args: unknown[]) => {
      calls.push({ sql, args });
      if (sql.includes('information_schema.columns')) return probeReady ? { ok: 1 } : undefined;
      return undefined;
    },
    all: async (sql: string, ...args: unknown[]) => { calls.push({ sql, args }); return []; },
    run: async (sql: string, ...args: unknown[]) => { calls.push({ sql, args }); return { changes: 1, lastInsertRowid: 0 }; },
    exec: async () => { /* no-op */ },
    calls,
  } as unknown as DatabaseAdapter & { calls: SqlCall[] };
}

const vec1536 = (fill = 0.1) => new Array(1536).fill(fill);
const lastInsert = (db: { calls: SqlCall[] }) => db.calls.filter((c) => c.sql.includes('INSERT INTO embeddings')).at(-1)!;
const lastSelect = (db: { calls: SqlCall[] }) => db.calls.filter((c) => c.sql.includes('FROM embeddings') && !c.sql.includes('INSERT')).at(-1)!;

describe('isZeroVector', () => {
  it('is true for all-zeros and empty, false for any non-zero', () => {
    expect(isZeroVector([0, 0, 0])).toBe(true);
    expect(isZeroVector([])).toBe(true);
    expect(isZeroVector([0, 1, 0])).toBe(false);
    expect(isZeroVector([0.0001])).toBe(false);
  });
});

describe('PgVectorStore.store', () => {
  it('writes embedding_vec via ::vector for a non-zero 1536-dim vector', async () => {
    const db = makeMockDb();
    await new PgVectorStore(db).store({ contentType: 'atom', contentId: 'a1', contentText: 'x', vector: vec1536(0.2), model: 'text-embedding-3-small' });
    const insert = lastInsert(db);
    expect(insert.sql).toContain('embedding_vec');
    expect(insert.sql).toContain('?::vector');
    expect(insert.sql).toContain('embedding_vec = excluded.embedding_vec'); // ON CONFLICT refreshes the vec (no stale neighbour)
    expect(insert.args.some((a) => typeof a === 'string' && a.startsWith('[') && a.endsWith(']'))).toBe(true);
  });

  it('stores NULL embedding_vec for a zero vector (no NaN poisoning)', async () => {
    const db = makeMockDb();
    await new PgVectorStore(db).store({ contentType: 'atom', contentId: 'z', contentText: 'x', vector: new Array(1536).fill(0), model: 'm' });
    const insert = lastInsert(db);
    expect(insert.sql).toContain('embedding_vec');
    expect(insert.sql).not.toContain('?::vector'); // bound as a plain NULL, not a vector literal
  });

  it('stores NULL embedding_vec for a non-1536 dimension (not indexable)', async () => {
    const db = makeMockDb();
    await new PgVectorStore(db).store({ contentType: 'atom', contentId: 'o', contentText: 'x', vector: new Array(768).fill(0.3), model: 'nomic' });
    const insert = lastInsert(db);
    expect(insert.sql).not.toContain('?::vector');
  });

  it('delegates to a TEXT-only write when the column is absent (not provisioned)', async () => {
    const db = makeMockDb({ probeReady: false });
    await new PgVectorStore(db).store({ contentType: 'atom', contentId: 'a', contentText: 'x', vector: vec1536(0.2), model: 'm' });
    const insert = lastInsert(db);
    expect(insert.sql).not.toContain('embedding_vec'); // JS-store SQL path
  });
});

describe('PgVectorStore.search', () => {
  it('uses the pgvector <=> operator for a non-zero 1536-dim query', async () => {
    const db = makeMockDb();
    await new PgVectorStore(db).search({ queryVector: vec1536(0.2), contentTypes: ['atom'], topK: 5 });
    const select = lastSelect(db);
    expect(select.sql).toContain('embedding_vec <=>');
    // dimension is a LITERAL (not a bound param) so the partial HNSW index is usable
    expect(select.sql).toContain('embedding_dimension = 1536');
    expect(select.sql).not.toContain('embedding_dimension = ?');
    expect(select.sql).toContain('content_type IN (?)');
  });

  it('falls back to in-process JS cosine for a non-1536 query (never empty)', async () => {
    const db = makeMockDb();
    await new PgVectorStore(db).search({ queryVector: new Array(768).fill(0.2), topK: 5 });
    const select = lastSelect(db);
    expect(select.sql).toContain('SELECT * FROM embeddings'); // JS store query
    expect(select.sql).not.toContain('<=>');
  });

  it('falls back to JS cosine for a zero query vector', async () => {
    const db = makeMockDb();
    await new PgVectorStore(db).search({ queryVector: new Array(1536).fill(0), topK: 5 });
    const select = lastSelect(db);
    expect(select.sql).not.toContain('<=>');
  });

  it('falls back to JS cosine when the column is absent', async () => {
    const db = makeMockDb({ probeReady: false });
    await new PgVectorStore(db).search({ queryVector: vec1536(0.2), topK: 5 });
    const select = lastSelect(db);
    expect(select.sql).not.toContain('<=>');
  });
});

describe('getVectorStore backend selection', () => {
  const prev = process.env.VECTOR_BACKEND;
  beforeEach(() => resetVectorStore());
  afterEach(() => { if (prev === undefined) delete process.env.VECTOR_BACKEND; else process.env.VECTOR_BACKEND = prev; resetVectorStore(); });

  it('returns PgVectorStore when VECTOR_BACKEND=pgvector on a postgresql connection', () => {
    process.env.VECTOR_BACKEND = 'pgvector';
    expect(getVectorStore(makeMockDb({ dialect: 'postgresql' }))).toBeInstanceOf(PgVectorStore);
  });

  it('returns SQLiteVectorStore by default (env unset)', () => {
    delete process.env.VECTOR_BACKEND;
    expect(getVectorStore(makeMockDb({ dialect: 'postgresql' }))).toBeInstanceOf(SQLiteVectorStore);
  });

  it('falls back to SQLiteVectorStore for pgvector on a non-postgresql dialect', () => {
    process.env.VECTOR_BACKEND = 'pgvector';
    expect(getVectorStore(makeMockDb({ dialect: 'sqlite' }))).toBeInstanceOf(SQLiteVectorStore);
  });
});
