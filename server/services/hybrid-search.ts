/**
 * Hybrid Search Service — unifies BM25 keyword search + vector similarity search.
 *
 * Uses Reciprocal Rank Fusion (RRF) to merge results from both systems.
 * Works across all content types stored in the embeddings table + document_chunks.
 *
 * Content types supported:
 *   'knowledge_atom'    — entries from knowledge_atoms table
 *   'checkpoint'        — entries from checkpoint_decisions table
 *   'session_output'    — entries from messages table (assistant role)
 *   'document_chunk'    — entries from document_chunks table (BM25-indexed folders)
 *   'module'            — module descriptions (embedded at startup)
 */

import type { DatabaseAdapter } from '../db/database.js';

import { getEmbeddingAdapter, isZeroVector } from './embedding-adapter.js';
import { getVectorStore } from './vector-store-adapter.js';
import { retrieveChunks } from './rag/retriever.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface HybridSearchResult {
  id: string;
  content_type: string;
  content_id: string;
  content_text: string;
  score: number;              // Fused RRF score (higher = more relevant)
  bm25_rank?: number;
  vector_rank?: number;
  similarity?: number;
  snippet: string;
  metadata: Record<string, unknown>;
  source: 'bm25' | 'vector' | 'both';
}

export interface HybridSearchOptions {
  query: string;
  contentTypes?: string[];    // Filter by content type (omit for all types)
  topK?: number;
  minSimilarity?: number;     // For vector results (default: 0.3)
  folderPaths?: string[];     // For document_chunk BM25 search
  includeDocumentChunks?: boolean;
}

// RRF constant (k=60 is standard)
const RRF_K = 60;

// ── Core hybrid search ──────────────────────────────────────────────────────

export async function hybridSearch(
  db: DatabaseAdapter,
  options: HybridSearchOptions,
): Promise<HybridSearchResult[]> {
  const {
    query,
    contentTypes,
    topK = 10,
    minSimilarity = 0.3,
    folderPaths = [],
    includeDocumentChunks = true,
  } = options;

  const embeddingAdapter = getEmbeddingAdapter();
  const vectorStore = getVectorStore(db);

  // ── Run searches in parallel ─────────────────────────────────────────────

  const [queryVector, bm25Results] = await Promise.all([
    embeddingAdapter.embed(query),
    // BM25 over indexed folders (document_chunks table)
    (includeDocumentChunks && folderPaths.length > 0)
      ? Promise.resolve(retrieveChunks(db, query, folderPaths, topK * 2))
      : Promise.resolve([]),
  ]);

  // Vector search across embeddings table
  const vectorResults = await vectorStore.search({
    queryVector,
    topK: topK * 2,
    contentTypes,
    minSimilarity,
  });

  // ── BM25 keyword search on knowledge_atoms (SQL LIKE fallback) ───────────
  const keywordAtoms = await searchKnowledgeAtomsKeyword(db, query, topK * 2, contentTypes);

  // ── Keyword search on session outputs (messages table) ───────────────────
  // Wave 3.2: searches assistant messages DIRECTLY so past work is findable
  // even when its embedding failed (no key / Ollama down) or predates the
  // session_output write path. Vector hits on embedded outputs share the
  // same `session_output:<message_id>` key and fuse via RRF below.
  const keywordSessionOutputs = await searchSessionOutputsKeyword(db, query, topK * 2, contentTypes);

  // ── Build ranked lists ───────────────────────────────────────────────────

  // Vector results ranked by similarity (already sorted)
  const vectorRanked = vectorResults.map((r, i) => ({
    key: `${r.content_type}:${r.content_id}`,
    rank: i + 1,
    result: r,
    source: 'vector' as const,
  }));

  // BM25 document chunk results ranked by score
  const bm25Ranked = bm25Results.map((r, i) => ({
    key: `document_chunk:${r.id}`,
    rank: i + 1,
    result: {
      id: r.id,
      content_type: 'document_chunk' as const,
      content_id: r.id,
      content_text: r.text,
      similarity: 0,
      metadata: { documentName: r.documentName, folderPath: r.folderPath, chunkIndex: r.chunkIndex, score: r.score },
    },
    source: 'bm25' as const,
  }));

  // Keyword atom results ranked
  const keywordRanked = keywordAtoms.map((r, i) => ({
    key: `knowledge_atom:${r.id}`,
    rank: i + 1,
    result: {
      id: r.id,
      content_type: 'knowledge_atom' as const,
      content_id: r.id,
      content_text: r.content,
      similarity: 0,
      metadata: { category: r.category, atom_type: r.atom_type, tags: r.tags },
    },
    source: 'bm25' as const,
  }));

  // Keyword session-output results ranked
  const sessionOutputRanked = keywordSessionOutputs.map((r, i) => ({
    key: `session_output:${r.id}`,
    rank: i + 1,
    result: {
      id: r.id,
      content_type: 'session_output' as const,
      content_id: r.id,
      content_text: r.content,
      similarity: 0,
      metadata: {
        session_id: r.session_id,
        title: r.title,
        module_id: r.module_id,
        area_id: r.area_id,
        created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
        keyword_hits: r.hits,
      },
    },
    source: 'bm25' as const,
  }));

  // ── Reciprocal Rank Fusion ───────────────────────────────────────────────
  const rrfScores = new Map<string, {
    score: number;
    bm25_rank?: number;
    vector_rank?: number;
    similarity?: number;
    result: typeof vectorRanked[0]['result'];
    source: 'bm25' | 'vector' | 'both';
  }>();

  // Process vector results
  for (const { key, rank, result } of vectorRanked) {
    const rrf = 1 / (RRF_K + rank);
    rrfScores.set(key, {
      score: rrf,
      vector_rank: rank,
      similarity: result.similarity,
      result,
      source: 'vector',
    });
  }

  // Process BM25 document chunks
  for (const { key, rank, result } of bm25Ranked) {
    const rrf = 1 / (RRF_K + rank);
    const existing = rrfScores.get(key);
    if (existing) {
      existing.score += rrf;
      existing.bm25_rank = rank;
      existing.source = 'both';
    } else {
      rrfScores.set(key, { score: rrf, bm25_rank: rank, result, source: 'bm25' });
    }
  }

  // Process keyword atom results
  for (const { key, rank, result } of keywordRanked) {
    const rrf = 1 / (RRF_K + rank);
    const existing = rrfScores.get(key);
    if (existing) {
      existing.score += rrf;
      existing.bm25_rank = rank;
      existing.source = 'both';
    } else {
      rrfScores.set(key, { score: rrf, bm25_rank: rank, result, source: 'bm25' });
    }
  }

  // Process keyword session-output results
  for (const { key, rank, result } of sessionOutputRanked) {
    const rrf = 1 / (RRF_K + rank);
    const existing = rrfScores.get(key);
    if (existing) {
      existing.score += rrf;
      existing.bm25_rank = rank;
      existing.source = 'both';
    } else {
      rrfScores.set(key, { score: rrf, bm25_rank: rank, result, source: 'bm25' });
    }
  }

  // ── Sort and format ──────────────────────────────────────────────────────
  const sorted = Array.from(rrfScores.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, topK);

  return sorted.map(([, { score, bm25_rank, vector_rank, similarity, result, source }]) => ({
    id: result.id,
    content_type: result.content_type,
    content_id: result.content_id,
    content_text: result.content_text,
    score,
    bm25_rank,
    vector_rank,
    similarity,
    snippet: makeSnippet(result.content_text, query),
    metadata: result.metadata,
    source,
  }));
}

// ── Similarity search (find content similar to a known item) ───────────────

export async function findSimilar(
  db: DatabaseAdapter,
  params: {
    contentType: string;
    contentId: string;
    topK?: number;
    sameTypeOnly?: boolean;
  },
): Promise<HybridSearchResult[]> {
  const vectorStore = getVectorStore(db);
  const embeddingAdapter = getEmbeddingAdapter();

  // Get the source item's text from the embeddings table
  const row = await db.get(
    'SELECT content_text FROM embeddings WHERE content_type = ? AND content_id = ? LIMIT 1'
  , params.contentType, params.contentId) as { content_text: string } | undefined;

  if (!row) return [];

  const queryVector = await embeddingAdapter.embed(row.content_text);
  const contentTypes = params.sameTypeOnly ? [params.contentType] : undefined;

  const results = await vectorStore.search({
    queryVector,
    topK: (params.topK ?? 10) + 1, // +1 to exclude self
    contentTypes,
    minSimilarity: 0.4,
  });

  // Exclude self
  const filtered = results.filter(r => !(r.content_type === params.contentType && r.content_id === params.contentId));

  return filtered.slice(0, params.topK ?? 10).map(r => ({
    id: r.id,
    content_type: r.content_type,
    content_id: r.content_id,
    content_text: r.content_text,
    score: r.similarity,
    similarity: r.similarity,
    snippet: makeSnippet(r.content_text, ''),
    metadata: r.metadata,
    source: 'vector' as const,
  }));
}

// ── Store embedding for any content type ──────────────────────────────────

export async function embedAndStore(
  db: DatabaseAdapter,
  params: {
    contentType: string;
    contentId: string;
    contentText: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  if (!params.contentText?.trim()) return;
  const adapter = getEmbeddingAdapter();
  const store = getVectorStore(db);

  const vector = await adapter.embed(params.contentText);
  if (isZeroVector(vector)) {
    // The embed failed (missing key / rate-limit / empty) and returned the
    // all-zeros sentinel. Don't persist a dead row — it's invisible to cosine
    // search and would poison a pgvector index (NaN distance). A later successful
    // embed (re-index) will store it via the same ON CONFLICT upsert.
    console.warn(`[hybrid-search] Skipping store of zero embedding for ${params.contentType}:${params.contentId}`);
    return;
  }
  await store.store({
    contentType: params.contentType,
    contentId: params.contentId,
    contentText: params.contentText,
    vector,
    model: adapter.model,
    metadata: params.metadata,
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function searchKnowledgeAtomsKeyword(
  db: DatabaseAdapter,
  query: string,
  limit: number,
  contentTypes?: string[],
): Promise<Array<{ id: string; content: string; category: string; atom_type: string; tags: string }>> {
  // Only search knowledge_atoms if that content type is included (or no filter)
  if (contentTypes && !contentTypes.includes('knowledge_atom')) return [];

  const q = query.trim();
  if (!q) return [];

  // KG-03: Use FTS5/tsvector BM25 scoring; fall back to LIKE if FTS not available
  try {
    const words = q.split(/\s+/).filter(w => w.length > 1);
    if (words.length === 0) return [];

    if (db.dialect === 'postgresql') {
      // PostgreSQL: use tsvector + ts_rank
      const tsQuery = words.join(' | ');
      return await db.all(
        `SELECT ka.id, ka.content, ka.category, ka.atom_type, COALESCE(ka.tags, '[]') as tags
         FROM knowledge_atoms ka
         WHERE ka.search_vector @@ plainto_tsquery('english', ?) AND ka.is_active = 1
         ORDER BY ts_rank(ka.search_vector, plainto_tsquery('english', ?)) DESC
         LIMIT ?`,
        tsQuery, tsQuery, limit,
      ) as Array<{ id: string; content: string; category: string; atom_type: string; tags: string }>;
    }

    // SQLite: use FTS5 MATCH
    const ftsQuery = words.map(w => `"${w.replace(/"/g, '').replace(/\*/g, '')}"*`).join(' OR ');
    return await db.all(
      `SELECT ka.id, ka.content, ka.category, ka.atom_type, COALESCE(ka.tags, '[]') as tags
       FROM knowledge_atoms ka
       JOIN knowledge_atoms_fts ON knowledge_atoms_fts.rowid = ka.rowid
       WHERE knowledge_atoms_fts MATCH ? AND ka.is_active = 1
       ORDER BY rank
       LIMIT ?`,
      ftsQuery, limit,
    ) as Array<{ id: string; content: string; category: string; atom_type: string; tags: string }>;
  } catch {
    // FTS not available yet — fall back to LIKE substring search
    const words = q.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (words.length === 0) return [];
    const pattern = `%${words.slice(0, 3).join('%')}%`;
    try {
      return await db.all(
        `SELECT id, content, category, atom_type, COALESCE(tags, '[]') as tags
         FROM knowledge_atoms
         WHERE is_active = 1 AND LOWER(content) LIKE ?
         ORDER BY created_at DESC LIMIT ?`,
        pattern, limit,
      ) as Array<{ id: string; content: string; category: string; atom_type: string; tags: string }>;
    } catch {
      return [];
    }
  }
}

// Stopwords excluded from the session-output keyword match — a paraphrase
// shares CONTENT words with its target, not function words.
const SESSION_OUTPUT_STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'was', 'were', 'with', 'that', 'this', 'these', 'those',
  'what', 'when', 'where', 'which', 'who', 'how', 'why', 'did', 'does', 'have', 'has',
  'had', 'about', 'our', 'your', 'their', 'from', 'into', 'than', 'then', 'them',
  'they', 'will', 'would', 'should', 'could', 'can', 'all', 'any', 'not', 'but',
  'you', 'his', 'her', 'its', 'out', 'per', 'via', 'over', 'under', 'between',
  'conclude', 'concluded', 'conclusion', 'march', 'said', 'tell', 'show', 'find',
]);

interface SessionOutputKeywordRow {
  id: string;
  content: string;
  session_id: string | null;
  title: string | null;
  module_id: string | null;
  area_id: string | null;
  created_at: unknown;
  hits: number;
}

/**
 * Wave 3.2 keyword fallback for 'session_output': rank assistant messages by
 * how many distinct query content-words they contain (ties broken by
 * recency). Searches the messages table directly — independent of whether
 * the output was ever embedded — so "search past work" degrades to keyword
 * instead of degrading to nothing on installs without an embedding provider.
 */
async function searchSessionOutputsKeyword(
  db: DatabaseAdapter,
  query: string,
  limit: number,
  contentTypes?: string[],
): Promise<SessionOutputKeywordRow[]> {
  if (contentTypes && !contentTypes.includes('session_output')) return [];

  const words = [...new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9åäöüéèê]+/i)
      .filter((w) => w.length >= 3 && !SESSION_OUTPUT_STOPWORDS.has(w)),
  )].slice(0, 6);
  if (words.length === 0) return [];

  try {
    const hitExpr = words.map(() => `(CASE WHEN LOWER(m.content) LIKE ? THEN 1 ELSE 0 END)`).join(' + ');
    const whereExpr = words.map(() => `LOWER(m.content) LIKE ?`).join(' OR ');
    const patterns = words.map((w) => `%${w}%`);
    // sessions has no area_id column — area lives in the embedding metadata
    // (vector path) only; the keyword path reports it as NULL.
    const rows = await db.all(
      `SELECT m.id,
              SUBSTRING(m.content FROM 1 FOR 4000) AS content,
              m.session_id, m.created_at,
              s.title, s.module_id, NULL AS area_id,
              (${hitExpr}) AS hits
       FROM messages m
       LEFT JOIN sessions s ON s.id = m.session_id
       WHERE m.role = 'assistant' AND LENGTH(m.content) >= 200 AND (${whereExpr})
       ORDER BY hits DESC, m.created_at DESC
       LIMIT ?`,
      ...patterns, ...patterns, limit,
    ) as SessionOutputKeywordRow[];
    return rows.map((r) => ({ ...r, hits: Number(r.hits) }));
  } catch (err) {
    console.warn('[hybrid-search] session_output keyword search unavailable:', err instanceof Error ? err.message : err);
    return [];
  }
}

function makeSnippet(text: string, query: string): string {
  if (!text) return '';
  const maxLen = 200;
  if (!query) return text.slice(0, maxLen) + (text.length > maxLen ? '…' : '');

  // Find first occurrence of any query word
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const lower = text.toLowerCase();
  let pos = -1;
  for (const word of words) {
    const idx = lower.indexOf(word);
    if (idx !== -1) { pos = idx; break; }
  }

  if (pos === -1) return text.slice(0, maxLen) + (text.length > maxLen ? '…' : '');

  const start = Math.max(0, pos - 50);
  const end = Math.min(text.length, start + maxLen);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}
