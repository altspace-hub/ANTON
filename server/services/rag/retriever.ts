/**
 * RAG Retriever -- given a query, returns the top-k most relevant chunks using BM25.
 */

import type { DatabaseAdapter } from '../../db/database.js';
import { bm25Score, tokenise, type BM25Corpus } from './bm25.js';

export interface RetrievedChunk {
  id: string;
  documentName: string;
  folderPath: string;
  chunkIndex: number;
  text: string;
  score: number;
  tokenCount: number;
}

export async function retrieveChunks(
  db: DatabaseAdapter,
  query: string,
  folderPaths: string[],
  topK: number = 10,
  minScore: number = 0.1,
): Promise<RetrievedChunk[]> {
  if (!query.trim() || folderPaths.length === 0) return [];

  const queryTokens = tokenise(query);
  if (queryTokens.length === 0) return [];

  // Get all chunks from the specified folders
  const placeholders = folderPaths.map(() => '?').join(',');
  const chunks = await db.all(
    `SELECT id, folder_path, document_name, chunk_index, chunk_text, token_count
     FROM document_chunks WHERE folder_path IN (${placeholders})`,
    ...folderPaths
  ) as Array<{
    id: string; folder_path: string; document_name: string;
    chunk_index: number; chunk_text: string; token_count: number;
  }>;

  if (chunks.length === 0) return [];

  // Get corpus stats (document frequency per term, for BM25 IDF)
  const queryPlaceholders = queryTokens.map(() => '?').join(',');
  const dfRows = await db.all(
    `SELECT term, COUNT(DISTINCT chunk_id) as df FROM chunk_terms
     WHERE chunk_id IN (SELECT id FROM document_chunks WHERE folder_path IN (${placeholders}))
     AND term IN (${queryPlaceholders})
     GROUP BY term`,
    ...folderPaths, ...queryTokens
  ) as Array<{ term: string; df: number }>;

  const docFrequency: Record<string, number> = {};
  for (const row of dfRows) docFrequency[row.term] = row.df;

  const corpus: BM25Corpus = {
    docCount: chunks.length,
    avgDocLength: chunks.reduce((sum, c) => sum + (c.token_count || 10), 0) / chunks.length,
    docFrequency,
  };

  // Score each chunk
  const scored: RetrievedChunk[] = [];
  for (const chunk of chunks) {
    // Get term frequencies for this chunk
    const tfRows = await db.all(
      `SELECT term, freq FROM chunk_terms WHERE chunk_id = ? AND term IN (${queryPlaceholders})`,
      chunk.id, ...queryTokens
    ) as Array<{ term: string; freq: number }>;

    const termFreqs: Record<string, number> = {};
    for (const row of tfRows) termFreqs[row.term] = row.freq;

    const score = bm25Score(query, termFreqs, chunk.token_count || 10, corpus);
    if (score >= minScore) {
      scored.push({
        id: chunk.id,
        documentName: chunk.document_name,
        folderPath: chunk.folder_path,
        chunkIndex: chunk.chunk_index,
        text: chunk.chunk_text,
        score,
        tokenCount: chunk.token_count,
      });
    }
  }

  // Sort by score descending, return top-k
  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}
