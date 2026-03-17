import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { semanticSearch, keywordSearch, getChunkContext } from '../services/semantic-search.js';
import { hybridSearch, findSimilar, embedAndStore } from '../services/hybrid-search.js';
import { getVectorStore } from '../services/vector-store-adapter.js';

export async function createSearchRoutes(db: DatabaseAdapter) {
  const router = Router();

  /**
   * POST /api/search
   * Unified hybrid search across all content types (knowledge atoms, document chunks, checkpoints, etc.)
   *
   * Body:
   * {
   *   query: string;
   *   contentTypes?: string[];     // 'knowledge_atom', 'checkpoint', 'document_chunk', 'module', etc.
   *   topK?: number;
   *   folderPaths?: string[];      // For document_chunk BM25 search
   *   minSimilarity?: number;
   * }
   */
  router.post('/search', async (req, res) => {
    try {
      const { query, contentTypes, topK, folderPaths, minSimilarity } = req.body;
      if (!query) return res.status(400).json({ error: 'query is required' });

      const results = await hybridSearch(db, {
        query,
        contentTypes,
        topK: topK || 10,
        folderPaths: folderPaths || [],
        minSimilarity,
      });
      res.json({ results, count: results.length });
    } catch (error) {
      console.error('Hybrid search error:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  /**
   * POST /api/search/similar
   * Find content similar to a known item (by content_type + content_id).
   *
   * Body:
   * {
   *   contentType: string;
   *   contentId: string;
   *   topK?: number;
   *   sameTypeOnly?: boolean;
   * }
   */
  router.post('/search/similar', async (req, res) => {
    try {
      const { contentType, contentId, topK, sameTypeOnly } = req.body;
      if (!contentType || !contentId) {
        return res.status(400).json({ error: 'contentType and contentId are required' });
      }
      const results = await findSimilar(db, { contentType, contentId, topK, sameTypeOnly });
      res.json({ results, count: results.length });
    } catch (error) {
      console.error('Find similar error:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  /**
   * POST /api/search/embed
   * Manually trigger embedding for a content item.
   *
   * Body:
   * {
   *   contentType: string;
   *   contentId: string;
   *   contentText: string;
   *   metadata?: object;
   * }
   */
  router.post('/search/embed', async (req, res) => {
    try {
      const { contentType, contentId, contentText, metadata } = req.body;
      if (!contentType || !contentId || !contentText) {
        return res.status(400).json({ error: 'contentType, contentId, contentText are required' });
      }
      await embedAndStore(db, { contentType, contentId, contentText, metadata });
      res.json({ ok: true });
    } catch (error) {
      console.error('Embed error:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  /**
   * GET /api/search/stats
   * Get counts of embedded content by type.
   */
  router.get('/search/stats', async (_req, res) => {
    try {
      const store = getVectorStore(db);
      const rows = await db.all(
        'SELECT content_type, COUNT(*) as count FROM embeddings GROUP BY content_type ORDER BY count DESC'
      ) as Array<{ content_type: string; count: number }>;
      const total = await store.getCount();
      res.json({ total, byType: rows });
    } catch (error) {
      console.error('Search stats error:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  /**
   * POST /api/search/semantic
   * Semantic search across ChromaDB knowledge collections (legacy — for collection-based search).
   */
  router.post('/search/semantic', async (req, res) => {
    try {
      const { query, collections, topK, filters, rerank } = req.body;
      if (!query || !collections || collections.length === 0) {
        return res.status(400).json({ error: 'Query and collections required' });
      }
      const results = await semanticSearch(db, { query, collections, topK: topK || 10, filters, rerank: rerank ?? false });
      res.json({ results, count: results.length });
    } catch (error) {
      console.error('Semantic search error:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  /**
   * POST /api/search/keyword
   * Keyword search across ChromaDB knowledge collections (legacy).
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
   * Hybrid search across ChromaDB knowledge collections (legacy — use POST /api/search for new code).
   */
  router.post('/search/hybrid', async (req, res) => {
    try {
      const { query, collections, topK, filters, rerank } = req.body;
      if (!query || !collections || collections.length === 0) {
        return res.status(400).json({ error: 'Query and collections required' });
      }
      const { hybridSearch: legacyHybrid } = await import('../services/semantic-search.js');
      const results = await legacyHybrid(db, { query, collections, topK: topK || 10, filters, rerank: rerank ?? false });
      res.json({ results, count: results.length });
    } catch (error) {
      console.error('Hybrid search error:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  /**
   * GET /api/search/context/:chunkId
   * Get surrounding chunks for context (ChromaDB collections).
   */
  router.get('/search/context/:chunkId', async (req, res) => {
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
