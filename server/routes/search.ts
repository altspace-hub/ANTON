import { Router } from 'express';
import Database from 'better-sqlite3';
import { semanticSearch, keywordSearch, getChunkContext, hybridSearch } from '../services/semantic-search.js';

export function createSearchRoutes(db: Database.Database) {
  const router = Router();

  /**
   * POST /api/search/semantic
   * Semantic search across knowledge collections using vector similarity.
   *
   * Body:
   * {
   *   query: string;           // User's search query
   *   collections: string[];   // Collection IDs to search (e.g., ['regulations', 'client-docs'])
   *   topK?: number;           // Number of results (default: 10)
   *   filters?: object;        // ChromaDB metadata filters
   *   rerank?: boolean;        // Enable re-ranking (default: false)
   * }
   *
   * Returns:
   * {
   *   results: SearchResult[];
   *   count: number;
   * }
   */
  router.post('/search/semantic', async (req, res) => {
    try {
      const { query, collections, topK, filters, rerank } = req.body;

      if (!query || !collections || collections.length === 0) {
        return res.status(400).json({ error: 'Query and collections required' });
      }

      const results = await semanticSearch(db, {
        query,
        collections,
        topK: topK || 10,
        filters,
        rerank: rerank ?? false,
      });

      res.json({ results, count: results.length });
    } catch (error) {
      console.error('Semantic search error:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  /**
   * POST /api/search/keyword
   * Keyword-based search using SQLite LIKE patterns (fallback/supplement to semantic search).
   *
   * Body:
   * {
   *   query: string;
   *   collections: string[];
   *   limit?: number;
   * }
   */
  router.post('/search/keyword', async (req, res) => {
    try {
      const { query, collections, limit } = req.body;

      if (!query || !collections || collections.length === 0) {
        return res.status(400).json({ error: 'Query and collections required' });
      }

      const results = keywordSearch(db, query, collections, limit || 10);
      res.json({ results, count: results.length });
    } catch (error) {
      console.error('Keyword search error:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  /**
   * POST /api/search/hybrid
   * Hybrid search combining semantic (vector) and keyword search.
   * Merges results and boosts chunks found in both searches.
   *
   * Body: same as /semantic
   */
  router.post('/search/hybrid', async (req, res) => {
    try {
      const { query, collections, topK, filters, rerank } = req.body;

      if (!query || !collections || collections.length === 0) {
        return res.status(400).json({ error: 'Query and collections required' });
      }

      const results = await hybridSearch(db, {
        query,
        collections,
        topK: topK || 10,
        filters,
        rerank: rerank ?? false,
      });

      res.json({ results, count: results.length });
    } catch (error) {
      console.error('Hybrid search error:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  /**
   * GET /api/search/context/:chunkId
   * Get surrounding chunks for context (e.g., before/after paragraphs).
   *
   * Query params:
   *   contextSize?: number  // Number of chunks before/after (default: 2)
   */
  router.get('/search/context/:chunkId', (req, res) => {
    try {
      const contextSize = parseInt(req.query.contextSize as string) || 2;
      const results = getChunkContext(db, req.params.chunkId, contextSize);
      res.json({ results });
    } catch (error) {
      console.error('Context retrieval error:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  return router;
}
