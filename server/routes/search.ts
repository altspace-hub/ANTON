import { safeError } from '../lib/error-response.js';
import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { searchCollections, keywordSearch, getChunkContext } from '../services/semantic-search.js';
import { hybridSearch, findSimilar, embedAndStore, searchScopeForRequest } from '../services/hybrid-search.js';
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
        // Without this, a keyword is enough to read any colleague's assistant
        // output in team mode — the side door around sessions.ts's own guard.
        scope: searchScopeForRequest(req),
      });
      res.json({ results, count: results.length });
    } catch (error) {
      console.error('Hybrid search error:', error);
      res.status(500).json({ error: safeError(error) });
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
      const results = await findSimilar(db, { contentType, contentId, topK, sameTypeOnly, scope: searchScopeForRequest(req) });
      res.json({ results, count: results.length });
    } catch (error) {
      console.error('Find similar error:', error);
      res.status(500).json({ error: safeError(error) });
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
      res.status(500).json({ error: safeError(error) });
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
      res.status(500).json({ error: safeError(error) });
    }
  });

  /**
   * POST /api/search/semantic  and  POST /api/search/hybrid
   * Retrieval over knowledge collections (rag_chunks + the embeddings table).
   * Both names reach the same path now; the response says which method
   * actually ran (`method`: vector | hybrid | keyword) and what `score`
   * measures (`scoreKind`). "semantic" in the URL is historical — do not
   * label the results from the URL, label them from `method`.
   */
  const collectionSearchHandler = async (req: import('express').Request, res: import('express').Response) => {
    try {
      const { query, collections, topK, filters, rerank, minSimilarity } = req.body as {
        query?: string; collections?: string[]; topK?: number; filters?: Record<string, unknown>;
        rerank?: boolean; minSimilarity?: number;
      };
      if (!query || !collections || collections.length === 0) {
        return res.status(400).json({ error: 'Query and collections required' });
      }
      const set = await searchCollections(db, { query, collections, topK: topK || 10, filters, rerank: rerank ?? false, minSimilarity });
      res.json({
        results: set.results,
        count: set.results.length,
        method: set.method,
        scoreKind: set.scoreKind,
        methodLabel: set.methodLabel,
        diagnostics: set.diagnostics,
      });
    } catch (error) {
      console.error('Collection search error:', error);
      res.status(500).json({ error: safeError(error) });
    }
  };
  router.post('/search/semantic', collectionSearchHandler);
  router.post('/search/hybrid', collectionSearchHandler);

  /**
   * POST /api/search/keyword
   * Keyword-only retrieval over knowledge collections. Labelled as such.
   */
  router.post('/search/keyword', async (req, res) => {
    try {
      const { query, collections, limit } = req.body as { query?: string; collections?: string[]; limit?: number };
      if (!query || !collections || collections.length === 0) {
        return res.status(400).json({ error: 'Query and collections required' });
      }
      const results = await keywordSearch(db, query, collections, limit || 10);
      res.json({ results, count: results.length, method: 'keyword', scoreKind: 'keyword_density' });
    } catch (error) {
      console.error('Keyword search error:', error);
      res.status(500).json({ error: safeError(error) });
    }
  });

  /**
   * GET /api/search/context/:chunkId
   * Surrounding chunks of a collection chunk (by rag_chunks.id or legacy chroma_id).
   */
  router.get('/search/context/:chunkId', async (req, res) => {
    try {
      const contextSize = parseInt(req.query.contextSize as string) || 2;
      // Without the await this serialised a pending Promise as `{}`.
      const results = await getChunkContext(db, req.params.chunkId, contextSize);
      res.json({ results });
    } catch (error) {
      console.error('Context retrieval error:', error);
      res.status(500).json({ error: safeError(error) });
    }
  });

  return router;
}
