import type { Database } from 'better-sqlite3';

export interface KnowledgeCollection {
  id: string;
  name: string; // Collection ID in ChromaDB (lowercase, no spaces)
  display_name: string; // User-friendly name
  description: string;
  icon: string; // Lucide icon name
  color: string; // Hex color for UI
  watch_directories: string; // JSON array of directories to auto-scan
  auto_index: number; // Boolean: auto-index new files in watched dirs
  metadata_schema: string; // JSON: custom metadata fields for this collection
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface RAGDocument {
  id: string;
  collection_id: string;
  filename: string;
  file_path: string;
  file_type: string;
  file_size: number;
  chunk_count: number;
  metadata: string;
  uploaded_by: string;
  uploaded_at: string;
  indexed_at: string | null;
  index_status: 'pending' | 'indexing' | 'indexed' | 'failed';
}

export interface RAGChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  chroma_id: string;
  metadata: string;
  created_at: string;
}

/**
 * Create a new knowledge collection
 */
export function createCollection(db: Database, collection: Omit<KnowledgeCollection, 'id' | 'created_at' | 'updated_at'>): string {
  const id = collection.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');

  const result = db.prepare(`
    INSERT INTO knowledge_collections (id, name, display_name, description, icon, color, watch_directories, auto_index, metadata_schema, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    collection.name,
    collection.display_name,
    collection.description,
    collection.icon || 'FolderOpen',
    collection.color || '#2DD4A8',
    collection.watch_directories || '[]',
    collection.auto_index ? 1 : 0,
    collection.metadata_schema || '{}',
    collection.created_by
  );

  return id;
}

/**
 * List all collections
 */
export function listCollections(db: Database): KnowledgeCollection[] {
  return db.prepare('SELECT * FROM knowledge_collections ORDER BY created_at DESC').all() as KnowledgeCollection[];
}

/**
 * Get collection by ID
 */
export function getCollection(db: Database, id: string): KnowledgeCollection | null {
  return db.prepare('SELECT * FROM knowledge_collections WHERE id = ?').get(id) as KnowledgeCollection | null;
}

/**
 * Update collection
 */
export function updateCollection(db: Database, id: string, updates: Partial<KnowledgeCollection>): boolean {
  const fields: string[] = [];
  const values: any[] = [];

  Object.entries(updates).forEach(([key, value]) => {
    if (key !== 'id' && key !== 'created_at' && value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  });

  if (fields.length > 0) {
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    db.prepare(`UPDATE knowledge_collections SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return true;
  }
  return false;
}

/**
 * Delete collection metadata
 */
export function deleteCollectionMetadata(db: Database, id: string): boolean {
  try {
    db.prepare('DELETE FROM knowledge_collections WHERE id = ?').run(id);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get collection document count
 */
export function getCollectionDocumentCount(db: Database, collectionId: string): number {
  const result = db.prepare('SELECT COUNT(*) as count FROM rag_documents WHERE collection_id = ?').get(collectionId) as { count: number };
  return result.count;
}

/**
 * Get collection chunk count
 */
export function getCollectionChunkCount(db: Database, collectionId: string): number {
  const result = db.prepare(`
    SELECT SUM(chunk_count) as total FROM rag_documents WHERE collection_id = ?
  `).get(collectionId) as { total: number | null };
  return result.total || 0;
}

/**
 * Create a RAG document record
 */
export function createRAGDocument(db: Database, doc: Omit<RAGDocument, 'id' | 'uploaded_at' | 'indexed_at'>): string {
  const id = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  db.prepare(`
    INSERT INTO rag_documents (id, collection_id, filename, file_path, file_type, file_size, chunk_count, metadata, uploaded_by, index_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    doc.collection_id,
    doc.filename,
    doc.file_path,
    doc.file_type,
    doc.file_size,
    doc.chunk_count,
    doc.metadata,
    doc.uploaded_by,
    doc.index_status
  );

  return id;
}

/**
 * Update RAG document
 */
export function updateRAGDocument(db: Database, id: string, updates: Partial<RAGDocument>): boolean {
  const fields: string[] = [];
  const values: any[] = [];

  Object.entries(updates).forEach(([key, value]) => {
    if (key !== 'id' && key !== 'uploaded_at' && value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  });

  if (fields.length > 0) {
    values.push(id);
    db.prepare(`UPDATE rag_documents SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return true;
  }
  return false;
}

/**
 * Get RAG documents for a collection
 */
export function getCollectionDocuments(db: Database, collectionId: string): RAGDocument[] {
  return db.prepare('SELECT * FROM rag_documents WHERE collection_id = ? ORDER BY uploaded_at DESC').all(collectionId) as RAGDocument[];
}

/**
 * Create a RAG chunk record
 */
export function createRAGChunk(db: Database, chunk: Omit<RAGChunk, 'id' | 'created_at'>): string {
  const id = `chunk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  db.prepare(`
    INSERT INTO rag_chunks (id, document_id, chunk_index, content, chroma_id, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    chunk.document_id,
    chunk.chunk_index,
    chunk.content,
    chunk.chroma_id,
    chunk.metadata
  );

  return id;
}

/**
 * Get chunks for a document
 */
export function getDocumentChunks(db: Database, documentId: string): RAGChunk[] {
  return db.prepare('SELECT * FROM rag_chunks WHERE document_id = ? ORDER BY chunk_index ASC').all(documentId) as RAGChunk[];
}

/**
 * Delete RAG document and all its chunks
 */
export function deleteRAGDocument(db: Database, id: string): boolean {
  try {
    db.prepare('DELETE FROM rag_documents WHERE id = ?').run(id);
    return true;
  } catch {
    return false;
  }
}
