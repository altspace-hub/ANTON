/**
 * chroma-client.ts — OPTIONAL, LEGACY ChromaDB access.
 *
 * Wave 2 (2026-09): ANTON no longer reads or writes collection vectors to
 * ChromaDB. They live in the PostgreSQL `embeddings` table (see
 * rag/chunk-embedder.ts and semantic-search.ts). What is left here:
 *
 *   • A client that is constructed ONLY when `CHROMA_URL` is set to a real
 *     http(s) server URL, and only on first use. Nothing runs at import time.
 *     The previous version built the client at module load from
 *     `CHROMA_PATH=./data/chroma` — a filesystem path handed to an HTTP client
 *     whose `path` option is the server URL — so every call threw and every
 *     query logged a Chroma error before falling back to keyword matching.
 *   • `isChromaAvailable()` for the intelligence health check, and
 *     `deleteCollection()` so an operator who still runs an old Chroma server
 *     gets its stale collection dropped when the ANTON collection is deleted.
 *   • The pure helpers below (adapter embedding function, model-compatibility
 *     check) — kept because they are unit-tested and still describe the
 *     contract any external vector index would have to honour.
 *
 * Without CHROMA_URL every function here is a silent no-op that returns
 * false / empty. The `chromadb` package is imported dynamically so an install
 * without a Chroma server never loads it.
 */

import type { ChromaClient as ChromaClientType, IEmbeddingFunction } from 'chromadb';
import { getEmbeddingAdapter, type EmbeddingAdapter } from './embedding-adapter.js';

// ── Configuration gate ─────────────────────────────────────────────────────

let warnedIgnoredPath = false;

/** The configured Chroma server URL, or null when Chroma is not in use. */
export function chromaUrl(): string | null {
  const raw = (process.env.CHROMA_URL ?? '').trim();
  if (!raw) {
    if (process.env.CHROMA_PATH && !warnedIgnoredPath) {
      warnedIgnoredPath = true;
      console.warn(
        '[chroma-client] CHROMA_PATH is ignored — collection vectors are stored in PostgreSQL (embeddings table). ' +
        'Set CHROMA_URL=http://host:8000 only if you still run a ChromaDB server you want reported in health checks.',
      );
    }
    return null;
  }
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return raw;
  } catch {
    if (!warnedIgnoredPath) {
      warnedIgnoredPath = true;
      console.warn(`[chroma-client] CHROMA_URL is not an http(s) URL and is ignored: ${JSON.stringify(raw)}`);
    }
    return null;
  }
}

export function isChromaConfigured(): boolean {
  return chromaUrl() !== null;
}

let clientPromise: Promise<ChromaClientType | null> | null = null;

/** Lazily construct the client; null when not configured or the package fails to load. */
async function getClient(): Promise<ChromaClientType | null> {
  const url = chromaUrl();
  if (!url) return null;
  if (!clientPromise) {
    clientPromise = (async () => {
      try {
        const mod = await import('chromadb');
        return new mod.ChromaClient({ path: url });
      } catch (err: unknown) {
        console.warn(`[chroma-client] chromadb package unavailable: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    })();
  }
  return clientPromise;
}

// ── Adapter-backed embedding function (pure) ───────────────────────────────

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
 * Pure compatibility check (exported for tests). A collection with no
 * recorded embedding_model is of unknown compatibility and passes.
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

// ── Remaining live surface (gated) ─────────────────────────────────────────

/** True only when CHROMA_URL is set AND the server answers a heartbeat. */
export async function isChromaAvailable(): Promise<boolean> {
  const client = await getClient();
  if (!client) return false;
  try {
    await client.heartbeat();
    return true;
  } catch {
    return false;
  }
}

/** Drop a legacy Chroma collection. No-op (false) when Chroma is not configured. */
export async function deleteCollection(collectionName: string): Promise<boolean> {
  const client = await getClient();
  if (!client) return false;
  try {
    await client.deleteCollection({ name: collectionName });
    return true;
  } catch (error) {
    console.warn(`[chroma-client] could not delete legacy collection ${collectionName}:`, error instanceof Error ? error.message : error);
    return false;
  }
}
