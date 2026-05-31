/**
 * PgVector Store — vector similarity backend using the Postgres `pgvector`
 * extension. Opt-in via VECTOR_BACKEND=pgvector (default stays SQLiteVectorStore,
 * the in-process JS cosine store). Fixes the O(n) brute-force-in-Node search of
 * the JS store by pushing the nearest-neighbour search into an HNSW index.
 *
 * Design (PATH B — additive, no ChromaDB change):
 *   - The canonical row still carries the TEXT `embedding` (JSON), so the JS
 *     store stays valid and rollback is just flipping VECTOR_BACKEND back.
 *   - A parallel `embedding_vec vector(1536)` column + HNSW index (migration 218
 *     / POST /embeddings/backfill-vec) holds the indexed copy for the canonical
 *     1536-dim provider (OpenAI text-embedding-3-small).
 *   - Robust degradation: if the column/extension is absent, or the query is a
 *     non-1536 dimension (Ollama 768 / Voyage 512), or the query vector is a
 *     zero/degenerate sentinel, it delegates to the exact JS cosine store — it
 *     never returns empty or NaN-ranked garbage.
 */

import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../../db/database.js';
import { SQLiteVectorStore, type VectorSearchResult } from './sqlite-vector-store.js';
import { isZeroVector, serializeVector } from '../embedding-adapter.js';

/** The single dimension the pgvector column + index are built for (OpenAI). */
const PGVECTOR_DIM = 1536;

/** pgvector text input format: '[0.1,0.2,...]'. */
function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`;
}

interface PgSearchRow {
  id: string;
  content_type: string;
  content_id: string;
  content_text: string;
  metadata: string;
  similarity: number;
}

export class PgVectorStore {
  private fallback: SQLiteVectorStore;
  /** Lazily probed: does the embedding_vec column exist (migration applied)? */
  private ready: boolean | null = null;

  constructor(private db: DatabaseAdapter) {
    this.fallback = new SQLiteVectorStore(db);
  }

  /** One-time check that migration 218 added the embedding_vec column. */
  private async ensureReady(): Promise<boolean> {
    if (this.ready !== null) return this.ready;
    try {
      const row = (await this.db.get(
        `SELECT 1 AS ok FROM information_schema.columns
         WHERE table_name = 'embeddings' AND column_name = 'embedding_vec' LIMIT 1`,
      )) as { ok: number } | undefined;
      this.ready = !!row;
      if (!this.ready) {
        console.warn(
          '[pgvector-store] embedding_vec column absent — pgvector not enabled. ' +
          'Install the pgvector extension, run migration 218 (or POST /api/embeddings/backfill-vec), ' +
          'then restart. Falling back to in-process cosine for now.',
        );
      }
    } catch {
      this.ready = false;
      console.warn('[pgvector-store] readiness probe failed — falling back to in-process cosine.');
    }
    return this.ready;
  }

  async store(params: {
    contentType: string;
    contentId: string;
    contentText: string;
    vector: number[];
    model: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const ready = await this.ensureReady();
    // Column absent → identical TEXT-only write via the JS store.
    if (!ready) return this.fallback.store(params);

    const dims = params.vector.length;
    // Write embedding_vec only for the indexed dimension and non-zero vectors;
    // otherwise store NULL (so a non-1536 / failed vector can't be returned by the
    // pgvector path, and a re-embed with a worse vector overwrites a stale one).
    const useVec = dims === PGVECTOR_DIM && !isZeroVector(params.vector);
    const vecValue = useVec ? toVectorLiteral(params.vector) : null;
    const id = randomUUID();

    await this.db.run(
      `INSERT INTO embeddings
         (id, content_type, content_id, content_text, embedding, embedding_vec, embedding_model, embedding_dimension, metadata, updated_at)
       VALUES (?, ?, ?, ?, ?, ${useVec ? '?::vector' : '?'}, ?, ?, ?, NOW())
       ON CONFLICT(content_type, content_id, embedding_model) DO UPDATE SET
         content_text = excluded.content_text,
         embedding = excluded.embedding,
         embedding_vec = excluded.embedding_vec,
         embedding_dimension = excluded.embedding_dimension,
         updated_at = NOW()`,
      id,
      params.contentType,
      params.contentId,
      params.contentText,
      serializeVector(params.vector),
      vecValue,
      params.model,
      dims,
      JSON.stringify(params.metadata ?? {}),
    );
  }

  async search(params: {
    queryVector: number[];
    topK?: number;
    contentTypes?: string[];
    model?: string;
    minSimilarity?: number;
  }): Promise<VectorSearchResult[]> {
    const ready = await this.ensureReady();
    const { queryVector, topK = 10, contentTypes, model, minSimilarity = 0.3 } = params;
    const dims = queryVector.length;

    // Column absent, non-indexed dimension, or degenerate query → exact JS cosine
    // (never return empty/NaN). The JS store filters to matching-dimension rows.
    if (!ready || dims !== PGVECTOR_DIM || isZeroVector(queryVector)) {
      return this.fallback.search(params);
    }

    const literal = toVectorLiteral(queryVector);
    // embedding_dimension is inlined as a LITERAL (it is an internal constant, not
    // user input — no injection risk) so the planner can match the PARTIAL HNSW
    // index predicate `WHERE embedding_dimension = 1536`. A bound parameter
    // ($N = ?) is not provably equal to the literal under a generic plan, which
    // makes the partial index ineligible and degrades the query to a seq scan.
    let sql =
      `SELECT id, content_type, content_id, content_text, metadata,
              1 - (embedding_vec <=> ?::vector) AS similarity
         FROM embeddings
        WHERE embedding_vec IS NOT NULL AND embedding_dimension = ${PGVECTOR_DIM}`;
    const args: unknown[] = [literal];

    if (contentTypes && contentTypes.length > 0) {
      sql += ` AND content_type IN (${contentTypes.map(() => '?').join(',')})`;
      args.push(...contentTypes);
    }
    if (model) {
      sql += ' AND embedding_model = ?';
      args.push(model);
    }
    // ANN order by cosine distance; over-fetch is unnecessary — index is ordered.
    sql += ' ORDER BY embedding_vec <=> ?::vector LIMIT ?';
    args.push(literal, topK);

    const rows = (await this.db.all(sql, ...args)) as PgSearchRow[];

    return rows
      .filter((r) => r.similarity >= minSimilarity)
      .map((r) => ({
        id: r.id,
        content_type: r.content_type,
        content_id: r.content_id,
        content_text: r.content_text,
        similarity: r.similarity,
        metadata: JSON.parse(r.metadata || '{}') as Record<string, unknown>,
      }));
  }

  async delete(contentType: string, contentId: string): Promise<void> {
    // Dialect-agnostic — identical to the JS store (and drops the vec with the row).
    await this.fallback.delete(contentType, contentId);
  }

  async getCount(contentType?: string): Promise<number> {
    return this.fallback.getCount(contentType);
  }
}
