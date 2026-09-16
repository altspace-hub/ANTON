/**
 * rag/chunk-embedder.ts — collection-RAG vectors live in the `embeddings` table.
 *
 * Wave 2 (2026-09, "RAG labelled honestly, then re-based"): the knowledge-
 * collection index used to be written to ChromaDB, which was never reachable
 * (chroma-client.ts handed the HTTP client a filesystem path), so every query
 * silently fell back to keyword matching while the prompt said "semantic".
 * Collection chunks now take the same path the knowledge atoms, modules and
 * pack entities already take: one row per chunk in `embeddings`, embedded
 * through the platform embedding adapter (local Ollama by default), keyed as
 *
 *     content_type = 'rag_chunk'
 *     content_id   = rag_chunks.id
 *
 * `rag_chunks` stays the primary store for text and citation; the embeddings
 * row is the derived index and can always be rebuilt from it.
 *
 * Dimension safety: a vector whose length differs from the adapter's declared
 * dimensions, or the all-zero sentinel every adapter returns on failure, is
 * skipped with a warning and counted — never stored, never thrown. A stored
 * row always carries the model + dimension it was made with, and the query
 * path filters on both, so vectors from a previous model are simply not
 * candidates (and are reported as stale) rather than mixed into one space.
 */

import type { DatabaseAdapter } from '../../db/database.js';
import { getEmbeddingAdapter, isZeroVector, type EmbeddingAdapter } from '../embedding-adapter.js';
import { getVectorStore, type VectorStoreAdapter } from '../vector-store-adapter.js';

/** The `embeddings.content_type` under which collection chunks are stored. */
export const RAG_CHUNK_CONTENT_TYPE = 'rag_chunk';

export interface RagChunkToEmbed {
  /** rag_chunks.id — becomes embeddings.content_id. */
  id: string;
  content: string;
  /** Stored alongside the vector; lets the unified search show where a hit came from. */
  metadata?: Record<string, unknown>;
}

export interface EmbedRagChunksResult {
  embedded: number;
  skipped: number;
  provider: string;
  model: string;
  dimensions: number;
  skippedReasons: {
    empty: number;
    zeroVector: number;
    dimensionMismatch: number;
    storeError: number;
  };
}

export interface EmbedRagChunksDeps {
  /** Injectable for tests; defaults to the configured platform adapter. */
  adapter?: EmbeddingAdapter;
  /** Injectable for tests; defaults to the configured vector store for `db`. */
  store?: VectorStoreAdapter;
  /** Chunks per embedBatch call. Ollama embeds sequentially inside embedBatch anyway. */
  batchSize?: number;
}

/**
 * Embed a set of collection chunks and upsert them into `embeddings`.
 * Never throws for a bad vector — see the header. Throws only if the adapter
 * itself throws (the built-in adapters do not; they return the zero sentinel).
 */
export async function embedRagChunks(
  db: DatabaseAdapter,
  chunks: RagChunkToEmbed[],
  deps: EmbedRagChunksDeps = {},
): Promise<EmbedRagChunksResult> {
  const adapter = deps.adapter ?? getEmbeddingAdapter();
  const store = deps.store ?? getVectorStore(db);
  const batchSize = Math.max(1, deps.batchSize ?? 32);

  const result: EmbedRagChunksResult = {
    embedded: 0,
    skipped: 0,
    provider: adapter.provider,
    model: adapter.model,
    dimensions: adapter.dimensions,
    skippedReasons: { empty: 0, zeroVector: 0, dimensionMismatch: 0, storeError: 0 },
  };

  // Drop empty content BEFORE batching: the OpenAI adapter filters blanks out
  // of its request and returns a shorter array, which would misalign vectors
  // with chunk ids. Aligning here keeps `vectors[i]` ↔ `usable[i]` exact.
  const usable = chunks.filter((c) => typeof c.content === 'string' && c.content.trim().length > 0);
  result.skippedReasons.empty = chunks.length - usable.length;
  result.skipped += result.skippedReasons.empty;

  let warnedDims = false;

  for (let i = 0; i < usable.length; i += batchSize) {
    const batch = usable.slice(i, i + batchSize);
    const vectors = await adapter.embedBatch(batch.map((c) => c.content));

    if (vectors.length !== batch.length) {
      // Alignment lost — refuse the whole batch rather than store a vector
      // under the wrong chunk id.
      console.warn(
        `[chunk-embedder] adapter returned ${vectors.length} vectors for ${batch.length} chunks — batch skipped (alignment)`,
      );
      result.skipped += batch.length;
      result.skippedReasons.dimensionMismatch += batch.length;
      continue;
    }

    for (let j = 0; j < batch.length; j++) {
      const chunk = batch[j];
      const vector = vectors[j];

      if (!Array.isArray(vector) || vector.length !== adapter.dimensions) {
        if (!warnedDims) {
          warnedDims = true;
          console.warn(
            `[chunk-embedder] vector dimension ${Array.isArray(vector) ? vector.length : 'n/a'} ≠ adapter ${adapter.model}/${adapter.dimensions}d — chunk(s) skipped, not stored`,
          );
        }
        result.skipped++;
        result.skippedReasons.dimensionMismatch++;
        continue;
      }
      if (isZeroVector(vector)) {
        // The adapter's failure sentinel (provider down / rate-limited). A zero
        // row is invisible to cosine and poisons a pgvector index (NaN).
        result.skipped++;
        result.skippedReasons.zeroVector++;
        continue;
      }

      try {
        await store.store({
          contentType: RAG_CHUNK_CONTENT_TYPE,
          contentId: chunk.id,
          contentText: chunk.content,
          vector,
          model: adapter.model,
          metadata: chunk.metadata ?? {},
        });
        result.embedded++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[chunk-embedder] store failed for chunk ${chunk.id}: ${msg}`);
        result.skipped++;
        result.skippedReasons.storeError++;
      }
    }
  }

  if (result.skippedReasons.zeroVector > 0) {
    console.warn(
      `[chunk-embedder] ${result.skippedReasons.zeroVector} chunk(s) returned the zero vector from ${adapter.provider}/${adapter.model} — ` +
      'not stored; they remain keyword-searchable. Re-run POST /api/knowledge/reindex-stuck once the embedding provider is up.',
    );
  }

  return result;
}

/** Remove the vectors for specific chunk ids (document delete / reindex). */
export async function deleteRagChunkEmbeddings(db: DatabaseAdapter, chunkIds: string[]): Promise<number> {
  let removed = 0;
  const BATCH = 500;
  for (let i = 0; i < chunkIds.length; i += BATCH) {
    const ids = chunkIds.slice(i, i + BATCH);
    if (ids.length === 0) continue;
    const placeholders = ids.map(() => '?').join(',');
    const res = await db.run(
      `DELETE FROM embeddings WHERE content_type = ? AND content_id IN (${placeholders})`,
      RAG_CHUNK_CONTENT_TYPE, ...ids,
    );
    removed += Number(res.changes ?? 0);
  }
  return removed;
}

/**
 * Remove every chunk vector of a collection. rag_chunks cascade from
 * rag_documents from knowledge_collections, but embeddings has no FK to any
 * of them, so a collection delete must call this first.
 */
export async function deleteCollectionChunkEmbeddings(db: DatabaseAdapter, collectionId: string): Promise<number> {
  const res = await db.run(
    `DELETE FROM embeddings
      WHERE content_type = ?
        AND content_id IN (
          SELECT c.id FROM rag_chunks c
          JOIN rag_documents d ON d.id = c.document_id
          WHERE d.collection_id = ?
        )`,
    RAG_CHUNK_CONTENT_TYPE, collectionId,
  );
  return Number(res.changes ?? 0);
}

/**
 * How many of a collection's chunks carry a vector for the given model
 * (defaults to the current adapter's). Used by the collection detail and
 * health routes so "vectorCount" means rows in this database, not a Chroma
 * count that was always 0.
 */
export async function countEmbeddedChunks(
  db: DatabaseAdapter,
  collectionId: string | null,
  model: string = getEmbeddingAdapter().model,
): Promise<{ total: number; embedded: number; stale: number }> {
  const scope = collectionId ? ' AND d.collection_id = ?' : '';
  const scopeParams = collectionId ? [collectionId] : [];
  // EXISTS rather than LEFT JOIN: a chunk with vectors from two earlier models
  // would otherwise join twice and inflate `total`.
  const row = await db.get<{ total: number | string; embedded: number | string; stale: number | string }>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN EXISTS (
                  SELECT 1 FROM embeddings e
                   WHERE e.content_type = ? AND e.content_id = c.id AND e.embedding_model = ?)
                THEN 1 ELSE 0 END) AS embedded,
            SUM(CASE WHEN EXISTS (
                  SELECT 1 FROM embeddings e
                   WHERE e.content_type = ? AND e.content_id = c.id AND e.embedding_model <> ?)
                THEN 1 ELSE 0 END) AS stale
       FROM rag_chunks c
       JOIN rag_documents d ON d.id = c.document_id
      WHERE d.index_status = 'indexed'${scope}`,
    RAG_CHUNK_CONTENT_TYPE, model, RAG_CHUNK_CONTENT_TYPE, model, ...scopeParams,
  );
  return {
    total: Number(row?.total ?? 0),
    embedded: Number(row?.embedded ?? 0),
    stale: Number(row?.stale ?? 0),
  };
}
