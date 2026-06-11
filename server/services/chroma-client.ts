/**
 * chroma-client.ts — ChromaDB access for pack/document RAG.
 *
 * Wave 4.12 (CORE_EXPERIENCE_REVIEW_2026-06): embeddings now go through the
 * multi-provider embedding adapter (server/services/embedding-adapter.ts —
 * Ollama nomic-embed-text / OpenAI / Voyage with auto-detection), replacing
 * the hard OPENAI_API_KEY requirement. RAG works on local-only installs.
 *
 * Model compatibility is handled honestly: every collection records the
 * embedding provider/model/dimensions in its Chroma metadata at creation.
 * When the current adapter doesn't match, the collection throws a
 * CollectionEmbeddingMismatchError ("collection needs re-embedding") instead
 * of silently mixing vector spaces; POST /api/knowledge/reembed rebuilds the
 * collection from the chunk text stored in PostgreSQL (rag_chunks is the
 * primary store — Chroma is the derived index).
 */

import { ChromaClient, Collection, type IEmbeddingFunction } from 'chromadb';
import * as path from 'path';
import * as fs from 'fs-extra';
import type { DatabaseAdapter } from '../db/database.js';
import { getEmbeddingAdapter, type EmbeddingAdapter } from './embedding-adapter.js';

const CHROMA_PATH = process.env.CHROMA_PATH || path.join(process.cwd(), 'data', 'chroma');

// Ensure ChromaDB data directory exists
fs.ensureDirSync(CHROMA_PATH);

export const chromaClient = new ChromaClient({ path: CHROMA_PATH });

// ── Adapter-backed embedding function ──────────────────────────────────────

/** Chroma IEmbeddingFunction backed by the platform embedding adapter. */
export function createAdapterEmbeddingFunction(adapter: EmbeddingAdapter = getEmbeddingAdapter()): IEmbeddingFunction {
  return {
    async generate(texts: string[]): Promise<number[][]> {
      return adapter.embedBatch(texts);
    },
  };
}

export class CollectionEmbeddingMismatchError extends Error {
  readonly collectionName: string;
  readonly collectionModel: string;
  readonly adapterModel: string;
  constructor(collectionName: string, collectionModel: string, adapterModel: string) {
    super(
      `Collection "${collectionName}" needs re-embedding: it was embedded with "${collectionModel}" ` +
      `but the current embedding adapter uses "${adapterModel}". ` +
      `Re-embed it via POST /api/knowledge/reembed { "collectionId": "${collectionName}" }.`
    );
    this.name = 'CollectionEmbeddingMismatchError';
    this.collectionName = collectionName;
    this.collectionModel = collectionModel;
    this.adapterModel = adapterModel;
  }
}

/**
 * Pure compatibility check (exported for tests). Collections created before
 * this wave carry no embedding_model metadata — their compatibility is
 * unknown; we log once and proceed (Chroma itself errors on a dimension
 * mismatch), rather than inventing a guess.
 */
export function assertCollectionCompatible(
  collectionName: string,
  collectionMetadata: Record<string, unknown> | undefined,
  adapter: Pick<EmbeddingAdapter, 'model'>,
): void {
  const recorded = collectionMetadata?.embedding_model;
  if (typeof recorded !== 'string' || recorded.length === 0) return; // legacy — unknown
  if (recorded !== adapter.model) {
    throw new CollectionEmbeddingMismatchError(collectionName, recorded, adapter.model);
  }
}

const legacyWarned = new Set<string>();

export interface CollectionMetadata {
  name: string;
  displayName: string;
  description: string;
  documentCount: number;
  chunkCount: number;
  createdAt: string;
  createdBy: string;
  metadata: Record<string, any>; // Custom metadata schema per collection
}

/**
 * Get or create a collection (embedding via the local adapter — no OpenAI
 * key required). Throws CollectionEmbeddingMismatchError when the collection
 * was embedded with a different model than the current adapter.
 */
export async function getOrCreateCollection(collectionName: string): Promise<Collection> {
  const adapter = getEmbeddingAdapter();
  let collection: Collection;
  try {
    collection = await chromaClient.getOrCreateCollection({
      name: collectionName,
      embeddingFunction: createAdapterEmbeddingFunction(adapter),
      metadata: {
        'hnsw:space': 'cosine', // Cosine similarity for semantic search
        embedding_provider: adapter.provider,
        embedding_model: adapter.model,
        embedding_dimensions: adapter.dimensions,
      },
    });
  } catch (error) {
    throw new Error(`Failed to get/create collection ${collectionName}: ${error}`);
  }
  // Metadata only applies at creation — an existing collection keeps its
  // original metadata, which is exactly what makes the mismatch detectable.
  assertCollectionCompatible(collectionName, collection.metadata as Record<string, unknown> | undefined, adapter);
  if (!(collection.metadata as Record<string, unknown> | undefined)?.embedding_model && !legacyWarned.has(collectionName)) {
    legacyWarned.add(collectionName);
    console.warn(
      `[chroma-client] Collection "${collectionName}" predates embedding-model metadata — ` +
      `compatibility with the current adapter (${adapter.model}) is unknown. ` +
      `If queries fail or rank poorly, re-embed via POST /api/knowledge/reembed.`
    );
  }
  return collection;
}

/**
 * List all collections
 */
export async function listCollections(): Promise<string[]> {
  try {
    const collections = await chromaClient.listCollections();
    return collections.map((c: any) => c.name || String(c));
  } catch (error) {
    console.error('Error listing collections:', error);
    return [];
  }
}

/**
 * Delete a collection
 */
export async function deleteCollection(collectionName: string): Promise<boolean> {
  try {
    await chromaClient.deleteCollection({ name: collectionName });
    return true;
  } catch (error) {
    console.error(`Error deleting collection ${collectionName}:`, error);
    return false;
  }
}

/**
 * Add documents to collection
 */
export async function addToCollection(
  collectionName: string,
  ids: string[],
  documents: string[],
  metadatas?: Record<string, any>[]
): Promise<boolean> {
  try {
    const collection = await getOrCreateCollection(collectionName);
    await collection.add({
      ids,
      documents,
      metadatas,
    });
    return true;
  } catch (error) {
    if (error instanceof CollectionEmbeddingMismatchError) throw error;
    console.error(`Error adding to collection ${collectionName}:`, error);
    return false;
  }
}

/**
 * Query collection
 */
export async function queryCollection(
  collectionName: string,
  queryText: string,
  nResults: number = 10,
  whereFilter?: Record<string, any>
): Promise<{
  ids: string[][];
  documents: string[][];
  metadatas: Record<string, any>[][];
  distances: number[][];
}> {
  try {
    const collection = await getOrCreateCollection(collectionName);
    const results = await collection.query({
      queryTexts: [queryText],
      nResults,
      where: whereFilter,
    });
    return results as any;
  } catch (error) {
    if (error instanceof CollectionEmbeddingMismatchError) throw error;
    console.error(`Error querying collection ${collectionName}:`, error);
    return { ids: [[]], documents: [[]], metadatas: [[]], distances: [[]] };
  }
}

/**
 * Get collection stats
 */
export async function getCollectionStats(collectionName: string): Promise<{ count: number }> {
  try {
    const collection = await getOrCreateCollection(collectionName);
    const count = await collection.count();
    return { count };
  } catch (error) {
    return { count: 0 };
  }
}

/**
 * Delete documents from collection
 */
export async function deleteFromCollection(collectionName: string, ids: string[]): Promise<boolean> {
  try {
    const collection = await getOrCreateCollection(collectionName);
    await collection.delete({ ids });
    return true;
  } catch (error) {
    console.error(`Error deleting from collection ${collectionName}:`, error);
    return false;
  }
}

/**
 * Re-embed a collection with the CURRENT embedding adapter (Wave 4.12).
 * Drops the Chroma collection and rebuilds it from the chunk text held in
 * PostgreSQL (rag_chunks via rag_documents) — the primary store. Used when
 * the adapter/model changed and the old vector space is incompatible.
 */
export async function reembedCollection(
  db: DatabaseAdapter,
  collectionId: string,
): Promise<{ collectionId: string; chunks: number; embedding_model: string; embedding_provider: string }> {
  const adapter = getEmbeddingAdapter();
  const chunks = await db.all<{ chroma_id: string; content: string; metadata: string | null }>(
    `SELECT c.chroma_id, c.content, c.metadata
     FROM rag_chunks c
     JOIN rag_documents d ON d.id = c.document_id
     WHERE d.collection_id = ?
     ORDER BY d.id, c.chunk_index`,
    collectionId,
  );

  // Drop the derived index; the PG chunk rows remain untouched.
  await deleteCollection(collectionId);
  const collection = await getOrCreateCollection(collectionId);

  const usable = chunks.filter(c => c.content && c.content.trim());
  const BATCH = 100;
  for (let i = 0; i < usable.length; i += BATCH) {
    const batch = usable.slice(i, i + BATCH);
    await collection.add({
      ids: batch.map(c => c.chroma_id),
      documents: batch.map(c => c.content),
      metadatas: batch.map(c => {
        try { return c.metadata ? JSON.parse(c.metadata) : {}; } catch { return {}; }
      }),
    });
  }

  return {
    collectionId,
    chunks: usable.length,
    embedding_model: adapter.model,
    embedding_provider: adapter.provider,
  };
}

/**
 * Check if ChromaDB is available. The embedder no longer gates this — the
 * adapter always exists (it degrades to zero vectors without credentials);
 * availability is purely the Chroma heartbeat.
 */
export async function isChromaAvailable(): Promise<boolean> {
  try {
    await chromaClient.heartbeat();
    return true;
  } catch {
    return false;
  }
}
