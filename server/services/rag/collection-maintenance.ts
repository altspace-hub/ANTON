/**
 * rag/collection-maintenance.ts — repair the collection index without
 * re-uploading anything.
 *
 * Two kinds of damage this fixes (both observed on the reference instance,
 * 2026-09-16: 27 `rag_documents` rows stuck in `indexing` since 2026-03-29
 * with 0 chunks, and 134 indexed chunks with no vector at all):
 *
 *   1. Documents left in `index_status = 'indexing'`. indexDocument() sets the
 *      row to 'indexing' before extraction and to 'indexed' after the chunks
 *      are stored; a crash or restart in between (a batch upload of 27 PDFs
 *      runs them concurrently with Promise.all) leaves the row there forever —
 *      nothing ever re-reads it. Re-drive = reindexDocument() from the file
 *      still on disk; if the file is gone, mark it 'failed' so it stops
 *      looking in progress.
 *
 *   2. Indexed chunks with no `embeddings` row for the CURRENT adapter model
 *      (indexed before the re-base, or embedded while the provider was down).
 *      Re-drive = embedRagChunks() over exactly those chunks.
 *
 * Everything here is opt-in, admin-or-solo, and dry-run capable: the same
 * selection SQL runs in both modes, and `dryRun: true` returns what WOULD be
 * touched without touching it.
 */

import fs from 'fs-extra';
import type { DatabaseAdapter } from '../../db/database.js';
import { getEmbeddingAdapter, type EmbeddingAdapter } from '../embedding-adapter.js';
import { reindexDocument as reindexDocumentImpl, type IndexDocumentResult } from '../document-indexer.js';
import {
  RAG_CHUNK_CONTENT_TYPE,
  deleteCollectionChunkEmbeddings,
  embedRagChunks,
  type EmbedRagChunksResult,
} from './chunk-embedder.js';

export interface StuckDocumentRow {
  id: string;
  collection_id: string;
  filename: string;
  file_path: string;
  uploaded_at: string | Date;
  chunk_count: number | string;
  /** rag_chunks rows actually present (chunk_count is only updated on success). */
  stored_chunks: number | string;
}

export interface UnembeddedChunkRow {
  id: string;
  content: string;
  metadata: string | null;
  document_id: string;
  chunk_index: number;
  collection_id: string;
  filename: string;
}

export interface ReindexStuckOptions {
  /** A document is "stuck" when it has been `indexing` for longer than this. Default 30. */
  olderThanMinutes?: number;
  /** Restrict both passes to one collection. */
  collectionId?: string;
  /** Report only; touch nothing. */
  dryRun?: boolean;
  /** Bound on stuck documents re-driven per call (each one re-extracts a file). Default 50. */
  documentLimit?: number;
  /** Bound on chunks embedded per call. Default 2000. */
  chunkLimit?: number;
}

export interface ReindexStuckPlan {
  embeddingModel: string;
  embeddingProvider: string;
  olderThanMinutes: number;
  stuckDocuments: Array<{
    id: string;
    collectionId: string;
    filename: string;
    uploadedAt: string;
    storedChunks: number;
    fileExists: boolean;
  }>;
  unembeddedChunks: number;
  unembeddedByCollection: Array<{ collectionId: string; chunks: number }>;
}

export interface ReindexStuckResult {
  dryRun: boolean;
  plan: ReindexStuckPlan;
  reindexed: Array<{ id: string; filename: string; chunkCount: number; embeddedCount: number }>;
  markedFailed: Array<{ id: string; filename: string; reason: string }>;
  reindexErrors: Array<{ id: string; filename: string; error: string }>;
  embedding: EmbedRagChunksResult | null;
}

export interface MaintenanceDeps {
  adapter?: EmbeddingAdapter;
  /** Injectable for tests (no disk). */
  fileExists?: (path: string) => Promise<boolean>;
  /** Injectable for tests (no disk, no extraction). */
  reindexDocument?: (db: DatabaseAdapter, documentId: string, collectionId: string) => Promise<IndexDocumentResult>;
  /** Injectable for tests. */
  embedChunks?: typeof embedRagChunks;
}

// ── Selection SQL (exported so the dry run and the report show the same text) ──

/** Params: olderThanMinutes, [collectionId], limit. */
export function stuckDocumentsSql(withCollection: boolean): string {
  return `SELECT d.id, d.collection_id, d.filename, d.file_path, d.uploaded_at, d.chunk_count,
                 (SELECT COUNT(*) FROM rag_chunks c WHERE c.document_id = d.id) AS stored_chunks
            FROM rag_documents d
           WHERE d.index_status = 'indexing'
             AND d.uploaded_at < NOW() - (? * INTERVAL '1 minute')${withCollection ? '\n             AND d.collection_id = ?' : ''}
           ORDER BY d.uploaded_at ASC
           LIMIT ?`;
}

/** Params: RAG_CHUNK_CONTENT_TYPE, model, [collectionId], limit. */
export function unembeddedChunksSql(withCollection: boolean): string {
  return `SELECT c.id, c.content, c.metadata, c.document_id, c.chunk_index, d.collection_id, d.filename
            FROM rag_chunks c
            JOIN rag_documents d ON d.id = c.document_id
           WHERE d.index_status = 'indexed'
             AND NOT EXISTS (
               SELECT 1 FROM embeddings e
                WHERE e.content_type = ? AND e.content_id = c.id AND e.embedding_model = ?
             )${withCollection ? '\n             AND d.collection_id = ?' : ''}
           ORDER BY d.uploaded_at ASC, c.chunk_index ASC
           LIMIT ?`;
}

/** Params: RAG_CHUNK_CONTENT_TYPE, model, [collectionId]. */
export function unembeddedByCollectionSql(withCollection: boolean): string {
  return `SELECT d.collection_id, COUNT(*) AS chunks
            FROM rag_chunks c
            JOIN rag_documents d ON d.id = c.document_id
           WHERE d.index_status = 'indexed'
             AND NOT EXISTS (
               SELECT 1 FROM embeddings e
                WHERE e.content_type = ? AND e.content_id = c.id AND e.embedding_model = ?
             )${withCollection ? '\n             AND d.collection_id = ?' : ''}
           GROUP BY d.collection_id
           ORDER BY chunks DESC`;
}

// ── Plan ────────────────────────────────────────────────────────────────────

export async function planStuckReindex(
  db: DatabaseAdapter,
  options: ReindexStuckOptions = {},
  deps: MaintenanceDeps = {},
): Promise<ReindexStuckPlan> {
  const adapter = deps.adapter ?? getEmbeddingAdapter();
  const fileExists = deps.fileExists ?? ((p: string) => fs.pathExists(p));
  const olderThanMinutes = Math.max(1, Math.floor(options.olderThanMinutes ?? 30));
  const documentLimit = Math.max(1, Math.floor(options.documentLimit ?? 50));
  const withCollection = typeof options.collectionId === 'string' && options.collectionId.length > 0;
  const collectionParams = withCollection ? [options.collectionId as string] : [];

  const stuck = await db.all<StuckDocumentRow>(
    stuckDocumentsSql(withCollection),
    olderThanMinutes, ...collectionParams, documentLimit,
  );

  const stuckDocuments: ReindexStuckPlan['stuckDocuments'] = [];
  for (const row of stuck) {
    stuckDocuments.push({
      id: row.id,
      collectionId: row.collection_id,
      filename: row.filename,
      uploadedAt: row.uploaded_at instanceof Date ? row.uploaded_at.toISOString() : String(row.uploaded_at),
      storedChunks: Number(row.stored_chunks ?? 0),
      fileExists: typeof row.file_path === 'string' && row.file_path.length > 0 ? await fileExists(row.file_path) : false,
    });
  }

  const byCollection = await db.all<{ collection_id: string; chunks: number | string }>(
    unembeddedByCollectionSql(withCollection),
    RAG_CHUNK_CONTENT_TYPE, adapter.model, ...collectionParams,
  );
  const unembeddedByCollection = byCollection.map((r) => ({ collectionId: r.collection_id, chunks: Number(r.chunks) }));

  return {
    embeddingModel: adapter.model,
    embeddingProvider: adapter.provider,
    olderThanMinutes,
    stuckDocuments,
    unembeddedChunks: unembeddedByCollection.reduce((s, r) => s + r.chunks, 0),
    unembeddedByCollection,
  };
}

// ── Run ─────────────────────────────────────────────────────────────────────

export async function reindexStuck(
  db: DatabaseAdapter,
  options: ReindexStuckOptions = {},
  deps: MaintenanceDeps = {},
): Promise<ReindexStuckResult> {
  const adapter = deps.adapter ?? getEmbeddingAdapter();
  const reindex = deps.reindexDocument ?? reindexDocumentImpl;
  const embed = deps.embedChunks ?? embedRagChunks;
  const plan = await planStuckReindex(db, options, { ...deps, adapter });

  const result: ReindexStuckResult = {
    dryRun: options.dryRun === true,
    plan,
    reindexed: [],
    markedFailed: [],
    reindexErrors: [],
    embedding: null,
  };
  if (result.dryRun) return result;

  // Pass 1 — stuck documents. reindexDocument re-extracts, re-chunks, embeds
  // and sets index_status itself; a missing file is marked failed so it no
  // longer masquerades as in-progress.
  for (const doc of plan.stuckDocuments) {
    if (!doc.fileExists) {
      await db.run(`UPDATE rag_documents SET index_status = 'failed' WHERE id = ?`, doc.id);
      result.markedFailed.push({ id: doc.id, filename: doc.filename, reason: 'source file no longer on disk' });
      continue;
    }
    try {
      const r = await reindex(db, doc.id, doc.collectionId);
      if (r.success) {
        result.reindexed.push({
          id: doc.id,
          filename: doc.filename,
          chunkCount: r.chunkCount ?? 0,
          embeddedCount: r.embeddedCount ?? 0,
        });
      } else {
        result.reindexErrors.push({ id: doc.id, filename: doc.filename, error: r.error ?? 'unknown' });
      }
    } catch (err: unknown) {
      result.reindexErrors.push({ id: doc.id, filename: doc.filename, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Pass 2 — chunks with no vector for the current model. Re-selected AFTER
  // pass 1 so freshly re-indexed documents (already embedded) are not done twice.
  const withCollection = typeof options.collectionId === 'string' && options.collectionId.length > 0;
  const collectionParams = withCollection ? [options.collectionId as string] : [];
  const chunkLimit = Math.max(1, Math.floor(options.chunkLimit ?? 2000));
  const rows = await db.all<UnembeddedChunkRow>(
    unembeddedChunksSql(withCollection),
    RAG_CHUNK_CONTENT_TYPE, adapter.model, ...collectionParams, chunkLimit,
  );
  if (rows.length > 0) {
    result.embedding = await embed(
      db,
      rows.map((r) => ({
        id: r.id,
        content: r.content,
        metadata: {
          collection_id: r.collection_id,
          document_id: r.document_id,
          chunk_index: r.chunk_index,
          filename: r.filename,
          ...safeJson(r.metadata),
        },
      })),
      { adapter },
    );
  }

  return result;
}

/**
 * Re-embed one collection with the CURRENT adapter: drop its chunk vectors
 * (all models) and rebuild from the chunk text in rag_chunks. Replaces the
 * Chroma-based rebuild behind POST /api/knowledge/reembed.
 */
export async function reembedCollection(
  db: DatabaseAdapter,
  collectionId: string,
  deps: MaintenanceDeps = {},
): Promise<{
  collectionId: string;
  chunks: number;
  embedded: number;
  skipped: number;
  removedVectors: number;
  embedding_model: string;
  embedding_provider: string;
}> {
  const adapter = deps.adapter ?? getEmbeddingAdapter();
  const embed = deps.embedChunks ?? embedRagChunks;

  const removedVectors = await deleteCollectionChunkEmbeddings(db, collectionId);
  const rows = await db.all<UnembeddedChunkRow>(
    `SELECT c.id, c.content, c.metadata, c.document_id, c.chunk_index, d.collection_id, d.filename
       FROM rag_chunks c
       JOIN rag_documents d ON d.id = c.document_id
      WHERE d.collection_id = ?
      ORDER BY d.id, c.chunk_index`,
    collectionId,
  );
  const outcome = await embed(
    db,
    rows.map((r) => ({
      id: r.id,
      content: r.content,
      metadata: {
        collection_id: r.collection_id,
        document_id: r.document_id,
        chunk_index: r.chunk_index,
        filename: r.filename,
        ...safeJson(r.metadata),
      },
    })),
    { adapter },
  );
  return {
    collectionId,
    chunks: rows.length,
    embedded: outcome.embedded,
    skipped: outcome.skipped,
    removedVectors,
    embedding_model: adapter.model,
    embedding_provider: adapter.provider,
  };
}

function safeJson(s: string | null | undefined): Record<string, unknown> {
  if (!s) return {};
  try {
    const v: unknown = JSON.parse(s);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
