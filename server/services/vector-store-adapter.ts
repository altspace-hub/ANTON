/**
 * Vector Store Adapter — unified interface for vector storage backends.
 *
 * Default backend: SQLiteVectorStore (local-first, no extra services needed).
 * Optional backend: ChromaDB (for larger installations).
 *
 * Usage:
 *   const store = getVectorStore(db);
 *   await store.store({ contentType: 'knowledge_atom', contentId: id, contentText: text, vector, model });
 *   const results = await store.search({ queryVector, contentTypes: ['knowledge_atom'], topK: 10 });
 */

import type Database from 'better-sqlite3';
import { SQLiteVectorStore } from './vector-stores/sqlite-vector-store.js';
import type { VectorSearchResult } from './vector-stores/sqlite-vector-store.js';

export type { VectorSearchResult };

export type VectorBackend = 'sqlite' | 'chroma';

export interface VectorStoreAdapter {
  store(params: {
    contentType: string;
    contentId: string;
    contentText: string;
    vector: number[];
    model: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;

  search(params: {
    queryVector: number[];
    topK?: number;
    contentTypes?: string[];
    model?: string;
    minSimilarity?: number;
  }): Promise<VectorSearchResult[]>;

  delete(contentType: string, contentId: string): Promise<void>;
  getCount(contentType?: string): Promise<number>;
}

let _instance: VectorStoreAdapter | null = null;
let _db: Database.Database | null = null;

export function getVectorStore(db: Database.Database): VectorStoreAdapter {
  // Return existing instance if same db
  if (_instance && _db === db) return _instance;
  _db = db;

  // Future: check VECTOR_BACKEND env to support chroma
  _instance = new SQLiteVectorStore(db);
  return _instance;
}

export function resetVectorStore(): void {
  _instance = null;
  _db = null;
}
