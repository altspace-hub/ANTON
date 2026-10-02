import type { DatabaseAdapter } from '../db/database.js';
import { scopesToOwner, ownerFilter, type OwnedRequest } from '../middleware/ownership.js';
import { isDemoMode } from '../middleware/demo-mode.js';

/** A SQL fragment (beginning with ` AND `, or empty) and its parameters, as ownerFilter returns. */
export interface SqlScope { sql: string; params: string[] }

const NO_SCOPE: SqlScope = { sql: '', params: [] };

/**
 * Which collections a caller may READ (list, open, upload into, search),
 * appended to a WHERE on knowledge_collections. Solo and admins: all.
 *
 * A team-mode non-admin: their own, plus the shared ones — a collection with
 * no creator, the legacy 'system' creator, or one an administrator made.
 * Another member's collection is not theirs to see: its name and description
 * are that person's (the list used to be instance-wide).
 *
 * On a public demo (DEMO_MODE=true) a visitor reads their own collections
 * only. Strangers share the server, and an administrator's collection would
 * hold visitors' documents that its deletion would take with it.
 *
 * No identity in team mode reads nothing.
 */
export function collectionReadScope(req: OwnedRequest, column = 'created_by'): SqlScope {
  if (!scopesToOwner(req)) return NO_SCOPE;
  const userId = req.user?.id;
  if (!userId) return { sql: ' AND 1=0', params: [] };
  if (isDemoMode()) return { sql: ` AND ${column} = ?`, params: [userId] };
  return {
    sql: ` AND (${column} = ? OR ${column} IS NULL OR ${column} = 'system' OR ${column} IN (SELECT u.id FROM users u WHERE u.role = 'admin'))`,
    params: [userId],
  };
}

/**
 * Which collections a caller may CHANGE (rename, re-describe, delete): their
 * own. A shared collection is an administrator's to change. Solo and admins:
 * all.
 */
export function collectionWriteScope(req: OwnedRequest, column = 'created_by'): SqlScope {
  return ownerFilter(req, column);
}

/**
 * One collection, if the caller may act on it: 'not_found' when it does not
 * exist or the caller may not read it (the same answer, so an id is never
 * confirmed), 'read_only' when they may read it but not change it.
 */
export async function findCollectionFor(
  db: DatabaseAdapter,
  req: OwnedRequest,
  id: string,
  mode: 'read' | 'write',
): Promise<KnowledgeCollection | 'not_found' | 'read_only'> {
  const read = collectionReadScope(req);
  const row = await db.get<KnowledgeCollection>(
    `SELECT * FROM knowledge_collections WHERE id = ?${read.sql}`,
    [id, ...read.params],
  );
  if (!row) return 'not_found';
  if (mode === 'read') return row;
  const write = collectionWriteScope(req);
  if (!write.sql) return row;
  const own = await db.get<{ ok: number }>(
    `SELECT 1 AS ok FROM knowledge_collections WHERE id = ?${write.sql}`,
    [id, ...write.params],
  );
  return own ? row : 'read_only';
}

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
  uploaded_by: string | null;
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
export async function createCollection(
  db: DatabaseAdapter,
  collection: Omit<KnowledgeCollection, 'id' | 'created_at' | 'updated_at'>,
  /** An id chosen by the caller (routes/collections.ts gives a team non-admin a unique one); the name's slug otherwise. */
  opts: { id?: string } = {},
): Promise<string> {
  const id = opts.id ?? collectionSlug(collection.name);

  const result = await db.run(`
    INSERT INTO knowledge_collections (id, name, display_name, description, icon, color, watch_directories, auto_index, metadata_schema, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, id,
    collection.name,
    collection.display_name,
    collection.description,
    collection.icon || 'FolderOpen',
    collection.color || '#2DD4A8',
    collection.watch_directories || '[]',
    collection.auto_index ? 1 : 0,
    collection.metadata_schema || '{}',
    collection.created_by);

  return id;
}

/** The id a collection name maps to: lower-case letters, digits and '-'. Never empty. */
export function collectionSlug(name: string): string {
  const slug = String(name ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 80);
  return /[a-z0-9]/.test(slug) ? slug : 'collection';
}

/**
 * List all collections
 */
export async function listCollections(
  db: DatabaseAdapter,
  /**
   * Owner scope from `ownerFilter(req, 'created_by')`. Omitted means unscoped, which
   * is correct for solo mode and for admins; on a shared instance this list is the
   * enumeration step that makes every other collection route reachable, so a
   * non-admin must only see their own. Same shape as getCollectionDocuments below.
   */
  scope: { sql: string; params: string[] } = { sql: '', params: [] },
): Promise<KnowledgeCollection[]> {
  return await db.all<KnowledgeCollection>(
    `SELECT * FROM knowledge_collections WHERE 1=1${scope.sql} ORDER BY created_at DESC`,
    [...scope.params],
  );
}

/**
 * Get collection by ID
 */
export async function getCollection(db: DatabaseAdapter, id: string): Promise<KnowledgeCollection | null> {
  return (await db.get<KnowledgeCollection>('SELECT * FROM knowledge_collections WHERE id = ?', id)) ?? null;
}

/**
 * Update collection
 */
export async function updateCollection(db: DatabaseAdapter, id: string, updates: Partial<KnowledgeCollection>): Promise<boolean> {
  const fields: string[] = [];
  const values: unknown[] = [];

  Object.entries(updates).forEach(([key, value]) => {
    if (key !== 'id' && key !== 'created_at' && value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  });

  if (fields.length > 0) {
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    await db.run(`UPDATE knowledge_collections SET ${fields.join(', ')} WHERE id = ?`, values);
    return true;
  }
  return false;
}

/**
 * Delete collection metadata
 */
export async function deleteCollectionMetadata(db: DatabaseAdapter, id: string): Promise<boolean> {
  try {
    await db.run('DELETE FROM knowledge_collections WHERE id = ?', id);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get collection document count
 */
export async function getCollectionDocumentCount(
  db: DatabaseAdapter,
  collectionId: string,
  /** Owner scope on rag_documents (ownerFilter(req, 'uploaded_by')): a team non-admin counts only their own documents. */
  scope: SqlScope = NO_SCOPE,
): Promise<number> {
  const result = await db.get<{ count: number | string }>(
    `SELECT COUNT(*) as count FROM rag_documents WHERE collection_id = ?${scope.sql}`,
    [collectionId, ...scope.params],
  );
  return Number(result?.count ?? 0);
}

/**
 * Get collection chunk count
 */
export async function getCollectionChunkCount(
  db: DatabaseAdapter,
  collectionId: string,
  /** Owner scope on rag_documents, as for getCollectionDocumentCount. */
  scope: SqlScope = NO_SCOPE,
): Promise<number> {
  const result = await db.get<{ total: number | string | null }>(
    `SELECT SUM(chunk_count) as total FROM rag_documents WHERE collection_id = ?${scope.sql}`,
    [collectionId, ...scope.params],
  );
  return Number(result?.total ?? 0);
}

/**
 * Create a RAG document record
 */
export async function createRAGDocument(db: DatabaseAdapter, doc: Omit<RAGDocument, 'id' | 'uploaded_at' | 'indexed_at'>): Promise<string> {
  const id = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await db.run(`
    INSERT INTO rag_documents (id, collection_id, filename, file_path, file_type, file_size, chunk_count, metadata, uploaded_by, index_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, 
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
export async function updateRAGDocument(db: DatabaseAdapter, id: string, updates: Partial<RAGDocument>): Promise<boolean> {
  const fields: string[] = [];
  const values: unknown[] = [];

  Object.entries(updates).forEach(([key, value]) => {
    if (key !== 'id' && key !== 'uploaded_at' && value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  });

  if (fields.length > 0) {
    values.push(id);
    await db.run(`UPDATE rag_documents SET ${fields.join(', ')} WHERE id = ?`, values);
    return true;
  }
  return false;
}

/**
 * Get RAG documents for a collection
 */
export async function getCollectionDocuments(
  db: DatabaseAdapter,
  collectionId: string,
  /**
   * Owner scope from `ownerFilter(req, 'uploaded_by')`. Omitted means unscoped, which
   * is correct for solo mode and for admins; on a shared instance a non-admin would
   * otherwise see the filename and size of every other user's uploads in the
   * collection, and could then read each one by id.
   */
  scope: { sql: string; params: string[] } = { sql: '', params: [] },
): Promise<RAGDocument[]> {
  return await db.all<RAGDocument>(
    `SELECT * FROM rag_documents WHERE collection_id = ?${scope.sql} ORDER BY uploaded_at DESC`,
    [collectionId, ...scope.params],
  );
}

/**
 * Create a RAG chunk record
 */
export async function createRAGChunk(db: DatabaseAdapter, chunk: Omit<RAGChunk, 'id' | 'created_at'>): Promise<string> {
  const id = `chunk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await db.run(`
    INSERT INTO rag_chunks (id, document_id, chunk_index, content, chroma_id, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `, 
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
export async function getDocumentChunks(db: DatabaseAdapter, documentId: string): Promise<RAGChunk[]> {
  return await db.all<RAGChunk>('SELECT * FROM rag_chunks WHERE document_id = ? ORDER BY chunk_index ASC', documentId);
}

/**
 * Delete RAG document and all its chunks
 */
export async function deleteRAGDocument(db: DatabaseAdapter, id: string): Promise<boolean> {
  try {
    await db.run('DELETE FROM rag_documents WHERE id = ?', id);
    return true;
  } catch {
    return false;
  }
}
