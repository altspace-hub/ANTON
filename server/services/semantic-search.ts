/**
 * semantic-search.ts — retrieval over knowledge collections, labelled honestly.
 *
 * Wave 2 (2026-09). Before this file was re-based, every collection query
 * went to ChromaDB through a client that had been handed a filesystem path
 * instead of a server URL, threw, and fell back to substring matching — while
 * the prompt assembled downstream said "retrieved … using semantic search"
 * and printed the match density as "Relevance: N%". Two things change here:
 *
 *   1. THE CONTRACT TELLS THE TRUTH. `searchCollections()` returns a
 *      SearchResultSet whose `method` is what actually ran — 'vector',
 *      'hybrid' or 'keyword' — and whose `scoreKind` says what the number in
 *      `score` measures. Every result carries the same two fields, so a caller
 *      that only keeps the array can still label each passage. A keyword
 *      density is reported as a keyword density; nothing here calls itself
 *      semantic unless a vector was compared.
 *
 *   2. THE VECTORS LIVE IN POSTGRES. Chunk vectors are rows in `embeddings`
 *      (content_type = 'rag_chunk', content_id = rag_chunks.id), written by
 *      rag/chunk-embedder.ts through the platform embedding adapter (local
 *      Ollama by default). The query path joins that table to rag_chunks and
 *      rag_documents, filtered to the selected collections AND to the current
 *      adapter's model + dimension, so a vector from a different model is
 *      never compared — it is counted and reported as stale instead. No
 *      ChromaDB client is constructed anywhere on this path.
 *
 * Ranking: cosine similarity for the vector side, query-term coverage for the
 * keyword side, fused by reciprocal rank (k = 60, the same constant
 * hybrid-search.ts uses for institutional memory) when both contribute.
 *
 * `semanticSearch()` is kept as a thin alias returning the plain array for
 * the two callers not yet reading the set (routes/claude.ts,
 * knowledge-resolver.ts); its name is historical, its results are labelled.
 */

import type { DatabaseAdapter } from '../db/database.js';
import { ownerFilter, type OwnedRequest } from '../middleware/ownership.js';
import {
  cosineSimilarity,
  deserializeVector,
  getEmbeddingAdapter,
  isZeroVector,
  type EmbeddingAdapter,
} from './embedding-adapter.js';
import { RAG_CHUNK_CONTENT_TYPE } from './rag/chunk-embedder.js';

// ── Contract ────────────────────────────────────────────────────────────────

/** What actually ran. */
export type SearchMethod = 'vector' | 'hybrid' | 'keyword';

/** What `score` measures. Present it with this word next to it or not at all. */
export type ScoreKind =
  /** cosine(query vector, chunk vector) in [0, 1] — the only one that is a similarity */
  | 'cosine_similarity'
  /** reciprocal-rank fusion of the vector and keyword lists, scaled so 1.0 = first in both */
  | 'rrf_normalised'
  /** share of the query's content terms that appear in the chunk — not a relevance */
  | 'keyword_density';

export interface SearchQuery {
  query: string;
  /** knowledge_collections.id values to search (all of them, union). */
  collections: string[];
  /** Results to return (default 10). */
  topK?: number;
  /** Equality filters on chunk metadata (e.g. { page: 3 }). */
  filters?: Record<string, unknown>;
  /**
   * Accepted for compatibility; no longer does anything. The old 70/30
   * vector/keyword blend is superseded by rank fusion, which already carries
   * the keyword signal whenever a vector list exists.
   */
  rerank?: boolean;
  /** Floor for the vector side (default 0.3, same as hybrid-search.ts). */
  minSimilarity?: number;
  /**
   * Who is searching — pass the request. Collections are shared (regulations,
   * client-docs …) but every document in one belongs to its uploader
   * (rag_documents.uploaded_by), and search used to return every uploader's
   * chunks to anyone who named the collection. In team mode a non-admin now
   * reads only their own documents; solo and admins read all (ownerFilter).
   * OMITTED in team mode means no identity and matches nothing — fail closed,
   * never "everyone's".
   */
  owner?: OwnedRequest;
}

/**
 * The document-owner predicate for every query in this file, on `d.uploaded_by`
 * (rag_documents is aliased `d` throughout). Checked in SQL so another user's
 * chunk is never loaded, scored or counted.
 */
function documentOwnerScope(owner: OwnedRequest | undefined): { sql: string; params: string[] } {
  return ownerFilter(owner ?? {}, 'd.uploaded_by');
}

export interface ChunkMetadata {
  chunkIndex: number;
  filename: string;
  fileType: string;
  page?: number;
  section?: string;
  [key: string]: unknown;
}

export interface SearchResult {
  /** rag_chunks.id — also the embeddings.content_id of its vector. */
  chunkId: string;
  documentId: string;
  documentName: string;
  collectionId: string;
  collectionName: string;
  content: string;
  /** 0–1. Meaning given by `scoreKind`. */
  score: number;
  scoreKind: ScoreKind;
  /** The method that produced the set this result belongs to. */
  method: SearchMethod;
  /** Raw cosine similarity when the vector side saw this chunk. */
  similarity?: number;
  /** 1-based position in the vector list, when present there. */
  vectorRank?: number;
  /** 1-based position in the keyword list, when present there. */
  keywordRank?: number;
  /**
   * @deprecated Same number as `score`. Kept for routes/claude.ts and
   * knowledge-resolver.ts until they read `scoreKind`; do not present it as
   * a relevance percentage without checking `scoreKind` first.
   */
  relevanceScore: number;
  metadata: ChunkMetadata;
  /** "filename.pdf, page 5" */
  citation: string;
}

export interface SearchDiagnostics {
  /** Indexed chunks in the selected collections (after metadata filters). */
  chunksConsidered: number;
  /** Of those, chunks with a vector for the current adapter model/dimension. */
  embeddedChunks: number;
  /** Chunks whose only vectors are from a different model (need re-embed). */
  staleVectorChunks: number;
  vectorCandidates: number;
  keywordCandidates: number;
  embeddingProvider: string;
  embeddingModel: string;
  embeddingDimensions: number;
  /** Why the vector side did not contribute, when it did not. */
  reason?: string;
}

export interface SearchResultSet {
  results: SearchResult[];
  method: SearchMethod;
  scoreKind: ScoreKind;
  /** One honest sentence for a prompt or a UI badge. */
  methodLabel: string;
  diagnostics: SearchDiagnostics;
}

export interface SearchDeps {
  /** Injectable for tests; defaults to the configured platform adapter. */
  adapter?: EmbeddingAdapter;
}

/** RRF constant — identical to hybrid-search.ts so fused scores are comparable. */
const RRF_K = 60;

export function scoreKindForMethod(method: SearchMethod): ScoreKind {
  switch (method) {
    case 'vector': return 'cosine_similarity';
    case 'hybrid': return 'rrf_normalised';
    case 'keyword': return 'keyword_density';
  }
}

/** The sentence that goes next to a result set. Never says "semantic" for keyword. */
export function describeMethod(method: SearchMethod, embeddingModel: string): string {
  switch (method) {
    case 'vector':
      return `vector retrieval (${embeddingModel}); score = cosine similarity between the query and the passage`;
    case 'hybrid':
      return `hybrid retrieval — vector (${embeddingModel}, cosine) fused with keyword term-matching by reciprocal rank; score = fused rank, 1.0 = first in both lists`;
    case 'keyword':
      // Deliberately does not contain the word "semantic" even as a negation:
      // a caller that greps a label for that word must never match this one.
      return 'keyword retrieval only (no vector comparison); score = share of the query terms found in the passage — a term-coverage ratio, not a relevance measure';
  }
}

// ── Internal row shapes ─────────────────────────────────────────────────────

interface ChunkRow {
  chunk_id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  metadata: string | null;
  filename: string;
  file_type: string;
  collection_id: string;
  collection_name: string;
}

interface EmbeddingRow {
  content_id: string;
  embedding: string;
}

// ── Main entry ──────────────────────────────────────────────────────────────

/**
 * Search one or more collections. Always returns a set with `method` and
 * `scoreKind` filled in, including for an empty result.
 */
export async function searchCollections(
  db: DatabaseAdapter,
  query: SearchQuery,
  deps: SearchDeps = {},
): Promise<SearchResultSet> {
  const adapter = deps.adapter ?? getEmbeddingAdapter();
  const topK = Math.max(1, Math.floor(query.topK ?? 10));
  const minSimilarity = typeof query.minSimilarity === 'number' ? query.minSimilarity : 0.3;
  const collections = [...new Set((query.collections ?? []).filter((c) => typeof c === 'string' && c.length > 0))];

  const diagnostics: SearchDiagnostics = {
    chunksConsidered: 0,
    embeddedChunks: 0,
    staleVectorChunks: 0,
    vectorCandidates: 0,
    keywordCandidates: 0,
    embeddingProvider: adapter.provider,
    embeddingModel: adapter.model,
    embeddingDimensions: adapter.dimensions,
  };

  const emptySet = (method: SearchMethod, reason: string): SearchResultSet => ({
    results: [],
    method,
    scoreKind: scoreKindForMethod(method),
    methodLabel: describeMethod(method, adapter.model),
    diagnostics: { ...diagnostics, reason },
  });

  if (collections.length === 0) return emptySet('keyword', 'no collections selected');
  if (!query.query || !query.query.trim()) return emptySet('keyword', 'empty query');

  const scope = documentOwnerScope(query.owner);

  // Chunk text + citation data for the selected collections (indexed only),
  // limited to the documents this caller may read.
  const chunks = applyMetadataFilters(await loadCollectionChunks(db, collections, scope), query.filters);
  diagnostics.chunksConsidered = chunks.length;
  if (chunks.length === 0) return emptySet('keyword', 'no indexed chunks in the selected collection(s)');
  const chunkById = new Map(chunks.map((c) => [c.chunk_id, c]));

  // ── Keyword side: query-term coverage over the loaded chunks ──────────────
  const keywordRanked = rankByKeywordDensity(query.query, chunks).slice(0, topK * 2);
  diagnostics.keywordCandidates = keywordRanked.length;

  // ── Vector side: embeddings rows for THESE chunks, THIS model/dimension ───
  let vectorRanked: Array<{ chunkId: string; similarity: number }> = [];
  const queryVector = await adapter.embed(query.query);
  if (isZeroVector(queryVector)) {
    diagnostics.reason = `query embedding unavailable — ${adapter.provider}/${adapter.model} returned no vector`;
  } else if (queryVector.length !== adapter.dimensions) {
    diagnostics.reason = `query vector has ${queryVector.length} dimensions, adapter declares ${adapter.dimensions} — vector side skipped`;
  } else {
    const placeholders = collections.map(() => '?').join(',');
    const rows = await db.all<EmbeddingRow>(
      `SELECT e.content_id, e.embedding
         FROM embeddings e
         JOIN rag_chunks c ON c.id = e.content_id
         JOIN rag_documents d ON d.id = c.document_id
        WHERE e.content_type = ?
          AND e.embedding_model = ?
          AND e.embedding_dimension = ?
          AND d.index_status = 'indexed'
          AND d.collection_id IN (${placeholders})${scope.sql}`,
      [RAG_CHUNK_CONTENT_TYPE, adapter.model, adapter.dimensions, ...collections, ...scope.params],
    );
    diagnostics.embeddedChunks = rows.length;

    if (rows.length === 0) {
      // Explain the absence: never embedded, or embedded with another model?
      const stale = await db.get<{ n: number | string }>(
        `SELECT COUNT(DISTINCT e.content_id) AS n
           FROM embeddings e
           JOIN rag_chunks c ON c.id = e.content_id
           JOIN rag_documents d ON d.id = c.document_id
          WHERE e.content_type = ?
            AND e.embedding_model <> ?
            AND d.collection_id IN (${placeholders})${scope.sql}`,
        [RAG_CHUNK_CONTENT_TYPE, adapter.model, ...collections, ...scope.params],
      );
      diagnostics.staleVectorChunks = Number(stale?.n ?? 0);
      diagnostics.reason = diagnostics.staleVectorChunks > 0
        ? `chunk vectors exist only for a different embedding model — re-embed via POST /api/knowledge/reembed (current: ${adapter.model}/${adapter.dimensions}d)`
        : `no chunk vectors stored for ${adapter.model}/${adapter.dimensions}d in the selected collection(s) — run POST /api/knowledge/reindex-stuck`;
    } else {
      vectorRanked = rows
        .filter((r) => chunkById.has(r.content_id))
        .map((r) => ({
          chunkId: r.content_id,
          similarity: cosineSimilarity(queryVector, deserializeVector(r.embedding, adapter.dimensions)),
        }))
        .filter((r) => Number.isFinite(r.similarity) && r.similarity >= minSimilarity)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK * 2);
      diagnostics.vectorCandidates = vectorRanked.length;
      if (vectorRanked.length === 0) {
        diagnostics.reason = `no chunk vector reached the similarity floor (${minSimilarity})`;
      }
    }
  }

  // ── Decide the method from what actually contributed ──────────────────────
  let method: SearchMethod;
  if (vectorRanked.length > 0 && keywordRanked.length > 0) method = 'hybrid';
  else if (vectorRanked.length > 0) method = 'vector';
  else method = 'keyword';
  const scoreKind = scoreKindForMethod(method);
  const methodLabel = describeMethod(method, adapter.model);

  // ── Score ─────────────────────────────────────────────────────────────────
  type Scored = { chunkId: string; score: number; similarity?: number; vectorRank?: number; keywordRank?: number };
  let scored: Scored[];

  if (method === 'hybrid') {
    const fused = new Map<string, Scored>();
    vectorRanked.forEach((v, i) => {
      fused.set(v.chunkId, { chunkId: v.chunkId, score: 1 / (RRF_K + i + 1), similarity: v.similarity, vectorRank: i + 1 });
    });
    keywordRanked.forEach((k, i) => {
      const rrf = 1 / (RRF_K + i + 1);
      const existing = fused.get(k.chunkId);
      if (existing) {
        existing.score += rrf;
        existing.keywordRank = i + 1;
      } else {
        fused.set(k.chunkId, { chunkId: k.chunkId, score: rrf, keywordRank: i + 1 });
      }
    });
    // Scale so that first-in-both = 1.0. Two lists contributed, so the ceiling
    // is 2/(k+1); a chunk seen by only one list tops out at 0.5.
    const ceiling = 2 / (RRF_K + 1);
    scored = [...fused.values()].map((s) => ({ ...s, score: clamp01(s.score / ceiling) }));
  } else if (method === 'vector') {
    scored = vectorRanked.map((v, i) => ({ chunkId: v.chunkId, score: clamp01(v.similarity), similarity: v.similarity, vectorRank: i + 1 }));
  } else {
    scored = keywordRanked.map((k, i) => ({ chunkId: k.chunkId, score: clamp01(k.density), keywordRank: i + 1 }));
  }

  scored.sort((a, b) => b.score - a.score);

  const results: SearchResult[] = scored.slice(0, topK).map((s) => {
    const row = chunkById.get(s.chunkId) as ChunkRow; // present by construction
    return toResult(row, { method, scoreKind, score: s.score, similarity: s.similarity, vectorRank: s.vectorRank, keywordRank: s.keywordRank });
  });

  return { results, method, scoreKind, methodLabel, diagnostics };
}

/**
 * Legacy entry: the plain array. Each element still carries `method` and
 * `scoreKind`. Prefer searchCollections() — it also returns the set-level
 * label and diagnostics.
 */
export async function semanticSearch(db: DatabaseAdapter, query: SearchQuery, deps: SearchDeps = {}): Promise<SearchResult[]> {
  return (await searchCollections(db, query, deps)).results;
}

/**
 * Keyword-only retrieval (what the old "fallback" was), now labelled as such.
 * Score = share of the query's content terms present in the chunk.
 */
export async function keywordSearch(
  db: DatabaseAdapter,
  query: string,
  collectionIds: string[],
  limit: number = 10,
  /** Who is searching — same contract as SearchQuery.owner (omitted in team mode = nothing). */
  owner?: OwnedRequest,
): Promise<SearchResult[]> {
  const collections = [...new Set((collectionIds ?? []).filter((c) => typeof c === 'string' && c.length > 0))];
  if (collections.length === 0 || !query?.trim()) return [];
  const chunks = await loadCollectionChunks(db, collections, documentOwnerScope(owner));
  const chunkById = new Map(chunks.map((c) => [c.chunk_id, c]));
  return rankByKeywordDensity(query, chunks)
    .slice(0, Math.max(1, limit))
    .map((k, i) => toResult(chunkById.get(k.chunkId) as ChunkRow, {
      method: 'keyword',
      scoreKind: 'keyword_density',
      score: clamp01(k.density),
      keywordRank: i + 1,
    }));
}

/**
 * Same as searchCollections().results. Kept because routes/search.ts exposed
 * it as POST /api/search/hybrid; the fusion now happens inside
 * searchCollections, so the two are one path.
 */
export async function hybridSearch(db: DatabaseAdapter, query: SearchQuery, deps: SearchDeps = {}): Promise<SearchResult[]> {
  return (await searchCollections(db, query, deps)).results;
}

/** A neighbouring chunk returned for context. Not a search hit — carries no score. */
export type ContextChunk = Omit<SearchResult, 'score' | 'scoreKind' | 'method' | 'similarity' | 'vectorRank' | 'keywordRank' | 'relevanceScore'>;

/**
 * Chunks before and after a given chunk in the same document. Accepts the
 * rag_chunks.id (what results now report) or the legacy chroma_id.
 *
 * `owner` scopes the SEED lookup: a chunk of a document the caller may not read
 * answers [] exactly like an unknown id, so ids seen elsewhere (an old search
 * response, a shared transcript) do not open another user's document. The
 * neighbours share the seed's document, so they inherit the check.
 */
export async function getChunkContext(
  db: DatabaseAdapter,
  chunkId: string,
  contextSize: number = 2,
  /** Who is asking — same contract as SearchQuery.owner (omitted in team mode = nothing). */
  owner?: OwnedRequest,
): Promise<ContextChunk[]> {
  const scope = documentOwnerScope(owner);
  const chunk = await db.get<{ document_id: string; chunk_index: number }>(
    `SELECT c.document_id, c.chunk_index
       FROM rag_chunks c
       JOIN rag_documents d ON d.id = c.document_id
      WHERE (c.id = ? OR c.chroma_id = ?)${scope.sql}
      LIMIT 1`,
    [chunkId, chunkId, ...scope.params],
  );
  if (!chunk) return [];

  const size = Math.max(0, Math.floor(contextSize));
  const startIdx = Math.max(0, chunk.chunk_index - size);
  const endIdx = chunk.chunk_index + size;

  const rows = await db.all<ChunkRow>(
    `SELECT c.id AS chunk_id, c.document_id, c.content, c.chunk_index, c.metadata,
            d.filename, d.file_type, d.collection_id, col.display_name AS collection_name
       FROM rag_chunks c
       JOIN rag_documents d ON d.id = c.document_id
       JOIN knowledge_collections col ON col.id = d.collection_id
      WHERE c.document_id = ?
        AND c.chunk_index BETWEEN ? AND ?
      ORDER BY c.chunk_index`,
    chunk.document_id, startIdx, endIdx,
  );

  return rows.map((row) => {
    const metadata = buildMetadata(row);
    return {
      chunkId: row.chunk_id,
      documentId: row.document_id,
      documentName: row.filename,
      collectionId: row.collection_id,
      collectionName: row.collection_name,
      content: row.content,
      metadata,
      citation: buildCitation(row.filename, metadata),
    };
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function loadCollectionChunks(
  db: DatabaseAdapter,
  collections: string[],
  scope: { sql: string; params: string[] },
): Promise<ChunkRow[]> {
  const placeholders = collections.map(() => '?').join(',');
  return db.all<ChunkRow>(
    `SELECT c.id AS chunk_id, c.document_id, c.content, c.chunk_index, c.metadata,
            d.filename, d.file_type, d.collection_id, col.display_name AS collection_name
       FROM rag_chunks c
       JOIN rag_documents d ON d.id = c.document_id
       JOIN knowledge_collections col ON col.id = d.collection_id
      WHERE d.collection_id IN (${placeholders})
        AND d.index_status = 'indexed'${scope.sql}`,
    [...collections, ...scope.params],
  );
}

function applyMetadataFilters(chunks: ChunkRow[], filters: Record<string, unknown> | undefined): ChunkRow[] {
  if (!filters || Object.keys(filters).length === 0) return chunks;
  const entries = Object.entries(filters);
  return chunks.filter((row) => {
    const md = parseMetadata(row.metadata);
    return entries.every(([k, v]) => md[k] === v);
  });
}

// Common English stop words — excluded from keyword scoring
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'with', 'this', 'that', 'from', 'have',
  'will', 'what', 'when', 'how', 'does', 'into', 'your', 'they', 'their', 'should',
  'about', 'need', 'also', 'which', 'been', 'its', 'use', 'can', 'may', 'more',
  'our', 'all', 'one', 'has', 'had', 'was', 'were', 'would', 'could', 'shall',
  'any', 'some', 'each', 'such', 'than', 'then', 'now', 'only', 'just', 'like',
  'who', 'him', 'her', 'his', 'she', 'you', 'did', 'get', 'got', 'let',
]);

/** Deduplicated content terms of a query (≥ 3 chars, no stop words). */
export function queryTerms(query: string): string[] {
  return [...new Set(
    query.toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  )];
}

/**
 * Query-term coverage: matched distinct terms / query terms, in (0, 1].
 * Ranked by matches, ties by chunk order. This is the old "fallback" scorer,
 * unchanged in what it computes — only in what it is called.
 */
function rankByKeywordDensity(query: string, chunks: ChunkRow[]): Array<{ chunkId: string; density: number }> {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];
  return chunks
    .map((row) => {
      const lower = row.content.toLowerCase();
      const matches = terms.filter((t) => lower.includes(t)).length;
      return { chunkId: row.chunk_id, matches };
    })
    .filter((r) => r.matches > 0)
    .sort((a, b) => b.matches - a.matches)
    .map((r) => ({ chunkId: r.chunkId, density: r.matches / terms.length }));
}

function parseMetadata(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function buildMetadata(row: ChunkRow): ChunkMetadata {
  return {
    ...parseMetadata(row.metadata),
    chunkIndex: row.chunk_index,
    filename: row.filename,
    fileType: row.file_type,
  };
}

/**
 * Human-readable citation. Examples: "AMLR-2024.pdf, page 12",
 * "Policy-v3.docx, section "4.2"".
 */
function buildCitation(filename: string, metadata: Record<string, unknown>): string {
  const parts = [filename];
  if (metadata.page !== undefined && metadata.page !== null) {
    parts.push(`page ${String(metadata.page)}`);
  } else if (typeof metadata.section === 'string' && metadata.section) {
    parts.push(`section "${metadata.section}"`);
  }
  return parts.join(', ');
}

function toResult(
  row: ChunkRow,
  s: { method: SearchMethod; scoreKind: ScoreKind; score: number; similarity?: number; vectorRank?: number; keywordRank?: number },
): SearchResult {
  const metadata = buildMetadata(row);
  return {
    chunkId: row.chunk_id,
    documentId: row.document_id,
    documentName: row.filename,
    collectionId: row.collection_id,
    collectionName: row.collection_name,
    content: row.content,
    score: s.score,
    scoreKind: s.scoreKind,
    method: s.method,
    ...(s.similarity !== undefined ? { similarity: s.similarity } : {}),
    ...(s.vectorRank !== undefined ? { vectorRank: s.vectorRank } : {}),
    ...(s.keywordRank !== undefined ? { keywordRank: s.keywordRank } : {}),
    relevanceScore: s.score,
    metadata,
    citation: buildCitation(row.filename, metadata),
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
