import { queryCollection } from './chroma-client.js';
import Database from 'better-sqlite3';

export interface SearchQuery {
  query: string;
  collections: string[]; // Can search across multiple collections
  topK?: number; // Number of results to return (default: 10)
  filters?: Record<string, any>; // Metadata filters
  rerank?: boolean; // Use cross-encoder re-ranking (default: false for speed)
}

export interface SearchResult {
  chunkId: string;
  documentId: string;
  documentName: string;
  collectionId: string;
  collectionName: string;
  content: string;
  relevanceScore: number; // 0-1, higher = more relevant
  metadata: {
    chunkIndex: number;
    filename: string;
    fileType: string;
    page?: number;
    section?: string;
    [key: string]: any;
  };
  citation: string; // "filename.pdf, page 5"
}

/**
 * Semantic search across one or more knowledge collections.
 * Tries ChromaDB vector similarity first; falls back to SQLite keyword search
 * automatically when ChromaDB is unavailable (no OPENAI_API_KEY / no server).
 */
export async function semanticSearch(db: Database.Database, query: SearchQuery): Promise<SearchResult[]> {
  const topK = query.topK || 10;
  const allResults: SearchResult[] = [];

  // Attempt ChromaDB vector search
  for (const collectionId of query.collections) {
    try {
      const results = await queryCollection(collectionId, query.query, topK, query.filters);

      for (let i = 0; i < results.ids[0].length; i++) {
        const chromaId = results.ids[0][i];
        const content = results.documents[0][i];
        const metadata = results.metadatas[0][i] || {};
        const distance = results.distances[0][i];

        const chunk = db
          .prepare('SELECT document_id, chunk_index FROM rag_chunks WHERE chroma_id = ?')
          .get(chromaId) as any;
        if (!chunk) continue;

        const doc = db
          .prepare('SELECT filename, file_type, collection_id FROM rag_documents WHERE id = ?')
          .get(chunk.document_id) as any;
        if (!doc) continue;

        const collection = db
          .prepare('SELECT display_name FROM knowledge_collections WHERE id = ?')
          .get(doc.collection_id) as any;

        allResults.push({
          chunkId: chromaId,
          documentId: chunk.document_id,
          documentName: doc.filename,
          collectionId: doc.collection_id,
          collectionName: collection?.display_name || doc.collection_id,
          content,
          relevanceScore: 1 - distance,
          metadata: {
            chunkIndex: chunk.chunk_index,
            filename: doc.filename,
            fileType: doc.file_type,
            ...metadata,
          },
          citation: buildCitation(doc.filename, metadata),
        });
      }
    } catch (error) {
      console.warn(`[semantic-search] ChromaDB unavailable for collection ${collectionId} — will use keyword fallback`);
    }
  }

  // ChromaDB returned nothing — fall back to SQLite keyword search
  if (allResults.length === 0) {
    console.log('[semantic-search] No vector results — using SQLite keyword search fallback');
    return keywordSearch(db, query.query, query.collections, topK);
  }

  allResults.sort((a, b) => b.relevanceScore - a.relevanceScore);

  if (query.rerank && allResults.length > 0) {
    return rerankResults(query.query, allResults, topK);
  }

  return allResults.slice(0, topK);
}

/**
 * Build a human-readable citation from filename and metadata.
 * Examples: "AMLR-2024.pdf, page 12" or "Policy-v3.docx, section 4.2"
 */
function buildCitation(filename: string, metadata: Record<string, any>): string {
  const parts = [filename];

  if (metadata.page !== undefined && metadata.page !== null) {
    parts.push(`page ${metadata.page}`);
  } else if (metadata.section) {
    parts.push(`section "${metadata.section}"`);
  }

  return parts.join(', ');
}

/**
 * Re-rank results using a simple keyword overlap heuristic.
 * Combines vector similarity (70%) with keyword match score (30%).
 * Can be upgraded to a proper cross-encoder model later for production.
 */
function rerankResults(query: string, results: SearchResult[], topK: number): SearchResult[] {
  const queryWords = query.toLowerCase().split(/\s+/);

  const scored = results.map((result) => {
    const contentWords = result.content.toLowerCase().split(/\s+/);
    const keywordMatches = queryWords.filter((qw) => contentWords.includes(qw)).length;
    const keywordScore = keywordMatches / queryWords.length;

    // Combine vector score (70%) + keyword score (30%)
    const finalScore = result.relevanceScore * 0.7 + keywordScore * 0.3;

    return { ...result, relevanceScore: finalScore };
  });

  scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
  return scored.slice(0, topK);
}

// Common English stop words — excluded from keyword scoring
const STOP_WORDS = new Set([
  'the','and','for','are','but','not','with','this','that','from','have',
  'will','what','when','how','does','into','your','they','their','should',
  'about','need','also','which','been','its','use','can','may','more',
  'our','all','one','has','had','was','were','would','could','shall',
  'any','some','each','such','than','then','now','only','just','like',
  'who','him','her','his','she','him','you','did','get','got','let',
]);

/**
 * Keyword search fallback for when ChromaDB / embeddings are unavailable.
 * Extracts meaningful terms from the query, then scores each chunk in the
 * selected collections by how many of those terms appear in the content.
 * Returns topK chunks ranked by match density (matched terms / total terms).
 */
export function keywordSearch(
  db: Database.Database,
  query: string,
  collectionIds: string[],
  limit: number = 10
): SearchResult[] {
  // Deduplicated meaningful keywords from the query
  const queryWords = [...new Set(
    query.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
  )];

  if (queryWords.length === 0) return [];

  // Load all indexed chunks from the selected collections
  const collectionPlaceholders = collectionIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT
      c.chroma_id  AS chunk_id,
      c.document_id,
      c.content,
      c.chunk_index,
      c.metadata,
      d.filename,
      d.file_type,
      d.collection_id,
      col.display_name AS collection_name
    FROM rag_chunks c
    JOIN rag_documents d   ON c.document_id   = d.id
    JOIN knowledge_collections col ON d.collection_id = col.id
    WHERE d.collection_id IN (${collectionPlaceholders})
      AND d.index_status = 'indexed'
  `).all(...collectionIds) as any[];

  // Score each chunk by proportion of query terms it contains
  const scored = rows
    .map((row) => {
      const lower = row.content.toLowerCase();
      const matchCount = queryWords.filter((w) => lower.includes(w)).length;
      return { row, matchCount };
    })
    .filter((r) => r.matchCount > 0)
    .sort((a, b) => b.matchCount - a.matchCount)
    .slice(0, limit);

  return scored.map(({ row, matchCount }) => ({
    chunkId: row.chunk_id,
    documentId: row.document_id,
    documentName: row.filename,
    collectionId: row.collection_id,
    collectionName: row.collection_name,
    content: row.content,
    relevanceScore: matchCount / queryWords.length,
    metadata: {
      chunkIndex: row.chunk_index,
      filename: row.filename,
      fileType: row.file_type,
      ...JSON.parse(row.metadata || '{}'),
    },
    citation: buildCitation(row.filename, JSON.parse(row.metadata || '{}')),
  }));
}

/**
 * Get context around a chunk (surrounding chunks for full context).
 * Returns chunks before and after the specified chunk from the same document.
 *
 * @param chunkId - The target chunk ID
 * @param contextSize - Number of chunks to retrieve before and after (default: 2)
 */
export function getChunkContext(
  db: Database.Database,
  chunkId: string,
  contextSize: number = 2
): SearchResult[] {
  const chunk = db
    .prepare('SELECT document_id, chunk_index FROM rag_chunks WHERE chroma_id = ?')
    .get(chunkId) as any;
  if (!chunk) return [];

  const startIdx = Math.max(0, chunk.chunk_index - contextSize);
  const endIdx = chunk.chunk_index + contextSize;

  const chunks = db
    .prepare(
      `
    SELECT
      c.chroma_id,
      c.document_id,
      c.content,
      c.chunk_index,
      c.metadata,
      d.filename,
      d.file_type,
      d.collection_id,
      col.display_name as collection_name
    FROM rag_chunks c
    JOIN rag_documents d ON c.document_id = d.id
    JOIN knowledge_collections col ON d.collection_id = col.id
    WHERE c.document_id = ?
    AND c.chunk_index BETWEEN ? AND ?
    ORDER BY c.chunk_index
  `
    )
    .all(chunk.document_id, startIdx, endIdx) as any[];

  return chunks.map((c) => ({
    chunkId: c.chroma_id,
    documentId: c.document_id,
    documentName: c.filename,
    collectionId: c.collection_id,
    collectionName: c.collection_name,
    content: c.content,
    relevanceScore: 1.0, // Context chunks are always 100% relevant
    metadata: {
      chunkIndex: c.chunk_index,
      filename: c.filename,
      fileType: c.file_type,
      ...JSON.parse(c.metadata || '{}'),
    },
    citation: buildCitation(c.filename, JSON.parse(c.metadata || '{}')),
  }));
}

/**
 * Hybrid search: combines semantic (vector) and keyword search results.
 * Merges both result sets and re-ranks by relevance score.
 */
export async function hybridSearch(
  db: Database.Database,
  query: SearchQuery
): Promise<SearchResult[]> {
  const topK = query.topK || 10;

  // Run both searches in parallel
  const [semanticResults, keywordResults] = await Promise.all([
    semanticSearch(db, query),
    Promise.resolve(keywordSearch(db, query.query, query.collections, topK)),
  ]);

  // Merge results by chunk ID (avoid duplicates)
  const resultsMap = new Map<string, SearchResult>();
  for (const result of semanticResults) {
    resultsMap.set(result.chunkId, result);
  }
  for (const result of keywordResults) {
    const existing = resultsMap.get(result.chunkId);
    if (existing) {
      // Boost score if found in both searches
      existing.relevanceScore = Math.min(1.0, existing.relevanceScore * 1.2);
    } else {
      resultsMap.set(result.chunkId, result);
    }
  }

  // Sort by relevance and return top K
  const merged = Array.from(resultsMap.values());
  merged.sort((a, b) => b.relevanceScore - a.relevanceScore);
  return merged.slice(0, topK);
}
