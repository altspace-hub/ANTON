import { ChromaClient, Collection, OpenAIEmbeddingFunction } from 'chromadb';
import * as path from 'path';
import * as fs from 'fs-extra';

const CHROMA_PATH = process.env.CHROMA_PATH || path.join(process.cwd(), 'data', 'chroma');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// Ensure ChromaDB data directory exists
fs.ensureDirSync(CHROMA_PATH);

export const chromaClient = new ChromaClient({ path: CHROMA_PATH });

// OpenAI embedding function - only if API key is available
const embeddingFunction = OPENAI_API_KEY
  ? new OpenAIEmbeddingFunction({
      openai_api_key: OPENAI_API_KEY,
      openai_model: 'text-embedding-3-small', // 1536 dimensions, cheap, fast
    })
  : undefined;

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
 * Get or create a collection
 */
export async function getOrCreateCollection(collectionName: string): Promise<Collection> {
  try {
    if (!embeddingFunction) {
      throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY in .env to enable vector search.');
    }

    return await chromaClient.getOrCreateCollection({
      name: collectionName,
      embeddingFunction,
      metadata: { 'hnsw:space': 'cosine' }, // Cosine similarity for semantic search
    });
  } catch (error) {
    throw new Error(`Failed to get/create collection ${collectionName}: ${error}`);
  }
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
 * Check if ChromaDB is available
 */
export async function isChromaAvailable(): Promise<boolean> {
  try {
    if (!embeddingFunction) return false;
    await chromaClient.heartbeat();
    return true;
  } catch {
    return false;
  }
}
