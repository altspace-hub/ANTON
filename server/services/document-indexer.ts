/**
 * document-indexer.ts
 * Orchestrates: extraction → chunking → embedding → storage
 */

import type { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import * as path from 'path';
import * as fs from 'fs-extra';
import { extractTextFromFile } from './text-extractor.js';
import { chunkDocument, type ChunkingOptions } from './chunker.js';
import { addToCollection, deleteFromCollection } from './chroma-client.js';
import { createRAGDocument, updateRAGDocument, createRAGChunk, getDocumentChunks } from './collection-manager.js';

export interface IndexDocumentResult {
  success: boolean;
  documentId?: string;
  chunkCount?: number;
  error?: string;
}

/**
 * Index a document: extract text, chunk it, embed chunks, store in ChromaDB and SQLite
 */
export async function indexDocument(
  db: Database,
  filePath: string,
  filename: string,
  collectionId: string,
  uploadedBy: string,
  customMetadata?: Record<string, any>,
  chunkingOptions?: Partial<ChunkingOptions>
): Promise<IndexDocumentResult> {
  const documentId = randomUUID();

  try {
    // 1. Extract text from file
    const extractedText = await extractTextFromFile(filePath);

    if (!extractedText) {
      return { success: false, error: 'Failed to extract text from file' };
    }

    // 2. Get file stats
    const fileStats = await fs.stat(filePath);
    const fileType = path.extname(filename).slice(1).toLowerCase();

    // 3. Create document record in SQLite (status: indexing)
    createRAGDocument(db, {
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
      updateRAGDocument(db, documentId, { index_status: 'failed' });
      return { success: false, error: 'No chunks created from document' };
    }

    // 5. Store chunks in ChromaDB
    const chromaIds = chunks.map((c) => c.id);
    const documents = chunks.map((c) => c.content);
    const metadatas = chunks.map((c) => c.metadata);

    const chromaSuccess = await addToCollection(collectionId, chromaIds, documents, metadatas);

    if (!chromaSuccess) {
      updateRAGDocument(db, documentId, { index_status: 'failed' });
      return { success: false, error: 'Failed to add chunks to ChromaDB' };
    }

    // 6. Store chunk records in SQLite
    for (const chunk of chunks) {
      createRAGChunk(db, {
        document_id: documentId,
        chunk_index: chunk.metadata.chunkIndex,
        content: chunk.content,
        chroma_id: chunk.id,
        metadata: JSON.stringify(chunk.metadata),
      });
    }

    // 7. Update document status to indexed
    updateRAGDocument(db, documentId, {
      chunk_count: chunks.length,
      index_status: 'indexed',
      indexed_at: new Date().toISOString(),
    });

    return { success: true, documentId, chunkCount: chunks.length };
  } catch (error) {
    console.error('[document-indexer] Error indexing document:', error);
    // Mark document as failed
    try {
      updateRAGDocument(db, documentId, { index_status: 'failed' });
    } catch {}
    return { success: false, error: String(error) };
  }
}

/**
 * Re-index a document (delete old chunks, create new ones)
 */
export async function reindexDocument(
  db: Database,
  documentId: string,
  collectionId: string,
  chunkingOptions?: Partial<ChunkingOptions>
): Promise<IndexDocumentResult> {
  try {
    // 1. Get existing document
    const doc = db
      .prepare('SELECT * FROM rag_documents WHERE id = ?')
      .get(documentId) as any;

    if (!doc) {
      return { success: false, error: 'Document not found' };
    }

    // 2. Delete old chunks from ChromaDB
    const oldChunks = getDocumentChunks(db, documentId);
    const oldChromaIds = oldChunks.map((c) => c.chroma_id);

    if (oldChromaIds.length > 0) {
      await deleteFromCollection(collectionId, oldChromaIds);
    }

    // 3. Delete old chunk records from SQLite
    db.prepare('DELETE FROM rag_chunks WHERE document_id = ?').run(documentId);

    // 4. Re-extract and re-chunk
    const extractedText = await extractTextFromFile(doc.file_path);

    if (!extractedText) {
      return { success: false, error: 'Failed to extract text from file' };
    }

    const metadata = JSON.parse(doc.metadata || '{}');
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
      return { success: false, error: 'No chunks created from document' };
    }

    // 5. Store new chunks in ChromaDB
    const chromaIds = chunks.map((c) => c.id);
    const documents = chunks.map((c) => c.content);
    const metadatas = chunks.map((c) => c.metadata);

    const chromaSuccess = await addToCollection(collectionId, chromaIds, documents, metadatas);

    if (!chromaSuccess) {
      return { success: false, error: 'Failed to add chunks to ChromaDB' };
    }

    // 6. Store new chunk records in SQLite
    for (const chunk of chunks) {
      createRAGChunk(db, {
        document_id: documentId,
        chunk_index: chunk.metadata.chunkIndex,
        content: chunk.content,
        chroma_id: chunk.id,
        metadata: JSON.stringify(chunk.metadata),
      });
    }

    // 7. Update document
    updateRAGDocument(db, documentId, {
      chunk_count: chunks.length,
      indexed_at: new Date().toISOString(),
    });

    return { success: true, documentId, chunkCount: chunks.length };
  } catch (error) {
    console.error('[document-indexer] Error reindexing document:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Delete a document and all its chunks
 */
export async function deleteDocument(
  db: Database,
  documentId: string,
  collectionId: string
): Promise<boolean> {
  try {
    // 1. Get chunk IDs from SQLite
    const chunks = getDocumentChunks(db, documentId);
    const chromaIds = chunks.map((c) => c.chroma_id);

    // 2. Delete chunks from ChromaDB
    if (chromaIds.length > 0) {
      await deleteFromCollection(collectionId, chromaIds);
    }

    // 3. Delete document from SQLite (CASCADE will delete chunks)
    db.prepare('DELETE FROM rag_documents WHERE id = ?').run(documentId);

    return true;
  } catch (error) {
    console.error('[document-indexer] Error deleting document:', error);
    return false;
  }
}

/**
 * Get indexing statistics for a collection
 */
export function getCollectionIndexStats(db: Database, collectionId: string): {
  totalDocuments: number;
  indexedDocuments: number;
  failedDocuments: number;
  totalChunks: number;
} {
  const stats = db
    .prepare(
      `
    SELECT
      COUNT(*) as total_documents,
      SUM(CASE WHEN index_status = 'indexed' THEN 1 ELSE 0 END) as indexed_documents,
      SUM(CASE WHEN index_status = 'failed' THEN 1 ELSE 0 END) as failed_documents,
      SUM(chunk_count) as total_chunks
    FROM rag_documents
    WHERE collection_id = ?
  `
    )
    .get(collectionId) as any;

  return {
    totalDocuments: stats.total_documents || 0,
    indexedDocuments: stats.indexed_documents || 0,
    failedDocuments: stats.failed_documents || 0,
    totalChunks: stats.total_chunks || 0,
  };
}
