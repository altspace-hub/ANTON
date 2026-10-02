/**
 * document-indexer.ts
 * Orchestrates: extraction → chunking → storage (rag_chunks) → embedding
 * (embeddings table, content_type 'rag_chunk').
 *
 * Wave 2 (2026-09): ChromaDB is gone from this path. rag_chunks is the
 * primary store; the vector index is the `embeddings` table written through
 * rag/chunk-embedder.ts with the platform embedding adapter. A document is
 * 'indexed' once its chunks are stored — that is what makes it keyword-
 * searchable; how many of those chunks also got a vector is reported
 * separately (embeddedCount) and can be topped up later with
 * POST /api/knowledge/reindex-stuck, so an embedding provider that is down
 * never fails an upload.
 *
 * A public demo's visitor gets no vectors at all ({ embed: false }): the demo
 * has no local embedder, and an embedding service would be a recipient of
 * their text that the privacy notice does not name. Their documents are
 * searched by keyword (rag/demo-storage.ts).
 *
 * Deleting a document or a collection removes its files from disk too (inside
 * UPLOAD_DIR/rag-documents only - rag/demo-storage.ts ragUploadDir).
 */

import type { DatabaseAdapter } from '../db/database.js';
import * as path from 'path';
import fs from 'fs-extra';
import { extractTextFromFile } from './text-extractor.js';
import { chunkDocument, type ChunkingOptions } from './chunker.js';
import { createRAGDocument, updateRAGDocument, createRAGChunk, getDocumentChunks } from './collection-manager.js';
import { embedRagChunks, deleteRagChunkEmbeddings, countEmbeddedChunks, deleteCollectionChunkEmbeddings } from './rag/chunk-embedder.js';
import { ragUploadDir, removeFileInside } from './rag/demo-storage.js';
import { safeError } from '../lib/error-response.js';

export interface IndexOptions {
  /** Embed the chunks (default true). False stores them for keyword search only and sends their text nowhere. */
  embed?: boolean;
}

export interface IndexDocumentResult {
  success: boolean;
  documentId?: string;
  chunkCount?: number;
  /** Chunks that received a vector in `embeddings` for the current model. */
  embeddedCount?: number;
  embeddingModel?: string;
  error?: string;
}

interface StoredChunk {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
}

/**
 * Store chunk rows, then embed them. Embedding failure is reported, never
 * thrown: the document is already keyword-searchable.
 */
async function storeAndEmbedChunks(
  db: DatabaseAdapter,
  documentId: string,
  collectionId: string,
  filename: string,
  chunks: ReturnType<typeof chunkDocument>,
  embed = true,
): Promise<{ embeddedCount: number; embeddingModel?: string }> {
  const stored: StoredChunk[] = [];
  for (const chunk of chunks) {
    const id = await createRAGChunk(db, {
      document_id: documentId,
      chunk_index: chunk.metadata.chunkIndex,
      content: chunk.content,
      chroma_id: chunk.id, // legacy column, kept populated for old rows' lookups
      metadata: JSON.stringify(chunk.metadata),
    });
    stored.push({ id, content: chunk.content, metadata: chunk.metadata as Record<string, unknown> });
  }

  if (!embed) return { embeddedCount: 0 };

  try {
    const outcome = await embedRagChunks(
      db,
      stored.map((c) => ({
        id: c.id,
        content: c.content,
        metadata: {
          collection_id: collectionId,
          document_id: documentId,
          chunk_index: c.metadata.chunkIndex,
          filename,
        },
      })),
    );
    if (outcome.skipped > 0) {
      console.warn(
        `[document-indexer] ${documentId}: ${outcome.embedded}/${stored.length} chunks embedded (${outcome.model}); ` +
        `${outcome.skipped} skipped — ${JSON.stringify(outcome.skippedReasons)}`,
      );
    }
    return { embeddedCount: outcome.embedded, embeddingModel: outcome.model };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[document-indexer] embedding failed for ${documentId} — chunks stored, keyword-only until re-embedded: ${msg}`);
    return { embeddedCount: 0 };
  }
}

/**
 * Index a document: extract text, chunk it, store the chunks, embed them.
 */
export async function indexDocument(
  db: DatabaseAdapter,
  filePath: string,
  filename: string,
  collectionId: string,
  uploadedBy: string | null,
  customMetadata?: Record<string, unknown>,
  chunkingOptions?: Partial<ChunkingOptions>,
  options: IndexOptions = {},
): Promise<IndexDocumentResult> {
  let documentId: string | null = null;

  try {
    // 1. Extract text from file
    const extractedText = await extractTextFromFile(filePath);

    if (!extractedText) {
      return { success: false, error: 'Failed to extract text from file' };
    }

    // 2. Get file stats
    const fileStats = await fs.stat(filePath);
    const fileType = path.extname(filename).slice(1).toLowerCase();

    // 3. Create document record (status: indexing)
    documentId = await createRAGDocument(db, {
      collection_id: collectionId,
      filename,
      file_path: filePath,
      file_type: fileType,
      file_size: fileStats.size,
      chunk_count: 0,
      metadata: JSON.stringify(customMetadata || {}),
      uploaded_by: uploadedBy,
      index_status: 'indexing',
    });

    // 4. Chunk the document
    const chunks = chunkDocument(extractedText, documentId, {
      ...chunkingOptions,
      documentMetadata: {
        filename,
        fileType,
        documentId,
        ...customMetadata,
      },
    });

    if (chunks.length === 0) {
      await updateRAGDocument(db, documentId, { index_status: 'failed' });
      return { success: false, error: 'No chunks created from document' };
    }

    // 5. Store chunk rows (primary) + vectors (derived index)
    const { embeddedCount, embeddingModel } = await storeAndEmbedChunks(db, documentId, collectionId, filename, chunks, options.embed !== false);

    // 6. Update document status to indexed
    await updateRAGDocument(db, documentId, {
      chunk_count: chunks.length,
      index_status: 'indexed',
      indexed_at: new Date().toISOString(),
    });

    return { success: true, documentId, chunkCount: chunks.length, embeddedCount, embeddingModel };
  } catch (error) {
    console.error('[document-indexer] Error indexing document:', error instanceof Error ? error.message : 'error');
    // Mark document as failed if we have its id
    if (documentId) {
      try {
        await updateRAGDocument(db, documentId, { index_status: 'failed' });
      } catch { /* best effort */ }
    }
    // The route sends this to the browser: scrubbed in production.
    return { success: false, documentId: documentId ?? undefined, error: safeError(error) };
  }
}

/**
 * Re-index a document (delete old chunks + vectors, create new ones).
 * Also the re-drive for a row stuck in 'indexing' — sets the status itself.
 */
export async function reindexDocument(
  db: DatabaseAdapter,
  documentId: string,
  collectionId: string,
  chunkingOptions?: Partial<ChunkingOptions>,
  options: IndexOptions = {},
): Promise<IndexDocumentResult> {
  try {
    // 1. Get existing document
    const doc = await db.get<{
      id: string; file_path: string; filename: string; file_type: string; metadata: string | null;
    }>('SELECT id, file_path, filename, file_type, metadata FROM rag_documents WHERE id = ?', documentId);

    if (!doc) {
      return { success: false, error: 'Document not found' };
    }

    await updateRAGDocument(db, documentId, { index_status: 'indexing' });

    // 2. Delete old vectors, then old chunk rows
    const oldChunks = await getDocumentChunks(db, documentId);
    if (oldChunks.length > 0) {
      await deleteRagChunkEmbeddings(db, oldChunks.map((c) => c.id));
    }
    await db.run('DELETE FROM rag_chunks WHERE document_id = ?', documentId);

    // 3. Re-extract and re-chunk
    const extractedText = await extractTextFromFile(doc.file_path);

    if (!extractedText) {
      await updateRAGDocument(db, documentId, { index_status: 'failed' });
      return { success: false, error: 'Failed to extract text from file' };
    }

    let metadata: Record<string, unknown> = {};
    try { metadata = doc.metadata ? (JSON.parse(doc.metadata) as Record<string, unknown>) : {}; } catch { metadata = {}; }
    const chunks = chunkDocument(extractedText, documentId, {
      ...chunkingOptions,
      documentMetadata: {
        filename: doc.filename,
        fileType: doc.file_type,
        documentId,
        ...metadata,
      },
    });

    if (chunks.length === 0) {
      await updateRAGDocument(db, documentId, { index_status: 'failed' });
      return { success: false, error: 'No chunks created from document' };
    }

    // 4. Store new chunk rows + vectors
    const { embeddedCount, embeddingModel } = await storeAndEmbedChunks(db, documentId, collectionId, doc.filename, chunks, options.embed !== false);

    // 5. Update document
    await updateRAGDocument(db, documentId, {
      chunk_count: chunks.length,
      index_status: 'indexed',
      indexed_at: new Date().toISOString(),
    });

    return { success: true, documentId, chunkCount: chunks.length, embeddedCount, embeddingModel };
  } catch (error) {
    console.error('[document-indexer] Error reindexing document:', error instanceof Error ? error.message : 'error');
    try {
      await updateRAGDocument(db, documentId, { index_status: 'failed' });
    } catch { /* best effort */ }
    return { success: false, error: safeError(error) };
  }
}

/**
 * Delete a document, its chunks and their vectors, and its file. rag_chunks
 * cascade from rag_documents; embeddings has no FK, so its rows go first.
 * The file goes last, once no row points at it, and only from inside
 * UPLOAD_DIR/rag-documents: a document indexed from elsewhere keeps its file.
 */
export async function deleteDocument(
  db: DatabaseAdapter,
  documentId: string,
  _collectionId: string
): Promise<boolean> {
  try {
    const doc = await db.get<{ file_path: string | null }>('SELECT file_path FROM rag_documents WHERE id = ?', documentId);
    const chunks = await getDocumentChunks(db, documentId);
    if (chunks.length > 0) {
      await deleteRagChunkEmbeddings(db, chunks.map((c) => c.id));
    }
    await db.run('DELETE FROM rag_documents WHERE id = ?', documentId);
    try {
      await removeFileInside(ragUploadDir(), doc?.file_path);
    } catch {
      console.warn('[document-indexer] document deleted; its file could not be removed');
    }
    return true;
  } catch (error) {
    console.error('[document-indexer] Error deleting document:', error instanceof Error ? error.message : 'error');
    return false;
  }
}

/**
 * Delete a whole collection: the chunk vectors (no FK), the collection row
 * (its documents and chunks go by CASCADE), then every document's file inside
 * UPLOAD_DIR/rag-documents. Returns the vectors and files removed.
 */
export async function deleteCollectionWithFiles(
  db: DatabaseAdapter,
  collectionId: string,
): Promise<{ removedVectors: number; removedFiles: number }> {
  const files = await db.all<{ file_path: string | null }>('SELECT file_path FROM rag_documents WHERE collection_id = ?', collectionId);
  const removedVectors = await deleteCollectionChunkEmbeddings(db, collectionId);
  await db.run('DELETE FROM knowledge_collections WHERE id = ?', collectionId);
  const root = ragUploadDir();
  let removedFiles = 0;
  for (const f of files) {
    try {
      if (await removeFileInside(root, f.file_path)) removedFiles++;
    } catch {
      console.warn('[document-indexer] collection deleted; a file could not be removed');
    }
  }
  return { removedVectors, removedFiles };
}

/**
 * Indexing statistics for a collection, including vector coverage for the
 * current embedding model.
 */
export async function getCollectionIndexStats(
  db: DatabaseAdapter,
  collectionId: string,
  /** Owner scope on rag_documents (ownerFilter(req, 'uploaded_by')); the vector coverage is the collection's. */
  scope: { sql: string; params: string[] } = { sql: '', params: [] },
): Promise<{
  totalDocuments: number;
  indexedDocuments: number;
  failedDocuments: number;
  stuckDocuments: number;
  totalChunks: number;
  embeddedChunks: number;
  staleVectorChunks: number;
}> {
  const stats = await db.get<{
    total_documents: number | string;
    indexed_documents: number | string | null;
    failed_documents: number | string | null;
    stuck_documents: number | string | null;
    total_chunks: number | string | null;
  }>(
    `SELECT
       COUNT(*) AS total_documents,
       SUM(CASE WHEN index_status = 'indexed' THEN 1 ELSE 0 END) AS indexed_documents,
       SUM(CASE WHEN index_status = 'failed' THEN 1 ELSE 0 END) AS failed_documents,
       SUM(CASE WHEN index_status = 'indexing' THEN 1 ELSE 0 END) AS stuck_documents,
       SUM(chunk_count) AS total_chunks
     FROM rag_documents
     WHERE collection_id = ?${scope.sql}`,
    [collectionId, ...scope.params],
  );
  const coverage = await countEmbeddedChunks(db, collectionId);

  return {
    totalDocuments: Number(stats?.total_documents ?? 0),
    indexedDocuments: Number(stats?.indexed_documents ?? 0),
    failedDocuments: Number(stats?.failed_documents ?? 0),
    stuckDocuments: Number(stats?.stuck_documents ?? 0),
    totalChunks: Number(stats?.total_chunks ?? 0),
    embeddedChunks: coverage.embedded,
    staleVectorChunks: coverage.stale,
  };
}
