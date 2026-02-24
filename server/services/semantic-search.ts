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
 * Semantic search across one or more knowledge collections using ChromaDB vector similarity.
 * Returns relevant chunks with relevance scores, metadata, and citations.
 */
export async function semanticSearch(db: Database.Database, query: SearchQuery): Promise<SearchResult[]> {
  const topK = query.topK || 10;
  const allResults: SearchResult[] = [];

  // Search each collection
  for (const collectionId of query.collections) {
    try {
      const results = await queryCollection(collectionId, query.query, topK, query.filters);

      // Process results
      for (let i = 0; i < results.ids[0].length; i++) {
        const chromaId = results.ids[0][i];
        const content = results.documents[0][i];
        const metadata = results.metadatas[0][i] || {};
        const distance = results.distances[0][i];

        // Get document info from SQLite
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
          relevanceScore: 1 - distance, // Convert distance to similarity (0-1)
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
      console.error(`Error searching collection ${collectionId}:`, error);
    }
  }

  // Sort by relevance
  allResults.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Re-rank if requested
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

/**
 * Keyword search (fallback when embeddings not available or for exact phrase matching).
 * Uses SQLite full-text search on chunk content.
 */
export function keywordSearch(
  db: Database.Database,
  query: string,
  collectionIds: string[],
  limit: number = 10
): SearchResult[] {
  const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (queryWords.length === 0) return [];

  // Build LIKE pattern for each word
  const pattern = `%${queryWords.join('%')}%`;

  const sql = `
    SELECT
      c.chroma_id as chunk_id,
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
    WHERE d.collection_id IN (${collectionIds.map(() => '?').join(',')})
    AND LOWER(c.content) LIKE ?
    ORDER BY d.uploaded_at DESC
    LIMIT ?
  `;

  const rows = db.prepare(sql).all(...collectionIds, pattern, limit) as any[];

  return rows.map((row) => ({
    chunkId: row.chunk_id,
    documentId: row.document_id,
    documentName: row.filename,
    collectionId: row.collection_id,
    collectionName: row.collection_name,
    content: row.content,
    relevanceScore: 0.5, // Keyword matches get fixed 0.5 score
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
