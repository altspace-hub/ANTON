import { safeError } from '../lib/error-response.js';
import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { searchCollections, keywordSearch, getChunkContext } from '../services/semantic-search.js';
import { hybridSearch, findSimilar, embedAndStore, searchScopeForRequest } from '../services/hybrid-search.js';
import { getVectorStore } from '../services/vector-store-adapter.js';
import { checkFolderPath } from '../lib/folder-guard.js';
import { ownerFilter, scopesToOwner, type OwnedRequest } from '../middleware/ownership.js';
import { requireAdminOrSolo } from '../middleware/role-guards.js';

/**
 * Owned content types hybridSearch does NOT scope (it scopes session outputs and
 * atoms only), with the SQL that lists which of a set of ids the caller owns.
 *   - 'rag_chunk': collection-RAG chunk vectors, returned to any caller that names
 *     the type — chunk text in content_text. Owner: rag_documents.uploaded_by,
 *     the rule the collection search applies.
 *   - 'checkpoint': checkpoint decisions, returned even to an "all types" search.
 *     Owner: checkpoint_decisions.decided_by, the rule embeddings.ts applies.
 */
const UNSCOPED_OWNED_TYPES: ReadonlyArray<{ type: string; ownedIdsSql: string; ownerColumn: string }> = [
  {
    type: 'rag_chunk',
    ownedIdsSql: 'SELECT c.id FROM rag_chunks c JOIN rag_documents d ON d.id = c.document_id WHERE c.id IN',
    ownerColumn: 'd.uploaded_by',
  },
  { type: 'checkpoint', ownedIdsSql: 'SELECT id FROM checkpoint_decisions WHERE id IN', ownerColumn: 'decided_by' },
];

/**
 * Drop hits of those types that belong to someone else — decided in SQL, like
 * every ownership check. No-op for solo mode and admins (ownerFilter's rule).
 * The real home for this is hybrid-search's filterOwnedByScope; until it covers
 * these types, the /api/search routes filter here.
 */
async function dropForeignOwnedHits<T extends { content_type: string; content_id: string }>(
  db: DatabaseAdapter,
  req: OwnedRequest,
  rows: T[],
): Promise<T[]> {
  let kept = rows;
  for (const { type, ownedIdsSql, ownerColumn } of UNSCOPED_OWNED_TYPES) {
    const scope = ownerFilter(req, ownerColumn);
    const ids = [...new Set(kept.filter((r) => r.content_type === type).map((r) => r.content_id))];
    if (!scope.sql || ids.length === 0) continue;
    const owned = await db.all<{ id: string }>(
      `${ownedIdsSql} (${ids.map(() => '?').join(',')})${scope.sql}`,
      ...ids, ...scope.params,
    );
    const ownedIds = new Set(owned.map((r) => r.id));
    kept = kept.filter((r) => r.content_type !== type || ownedIds.has(r.content_id));
  }
  return kept;
}

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

      // Folder indexes carry no owner: a team-mode non-admin may search only
      // folders the guard lets them read now. An index built over ./uploads
      // before the storage rule (or while solo) still holds every user's files,
      // and naming its path must not reopen it — the rule /rag/search applies.
      const requested: unknown[] = Array.isArray(folderPaths) ? folderPaths : [];
      const readableFolders = requested.filter((p): p is string =>
        typeof p === 'string' && (!scopesToOwner(req) || checkFolderPath(p).ok));

      const results = await dropForeignOwnedHits(db, req, await hybridSearch(db, {
        query,
        contentTypes,
        topK: topK || 10,
        folderPaths: readableFolders,
        minSimilarity,
        // Without this, a keyword is enough to read any colleague's assistant
        // output in team mode — the side door around sessions.ts's own guard.
        scope: searchScopeForRequest(req),
      }));
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
      const results = await dropForeignOwnedHits(db, req,
        await findSimilar(db, { contentType, contentId, topK, sameTypeOnly, scope: searchScopeForRequest(req) }));
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
  // Admin-only in team mode: it upserts by (content_type, content_id), so any
  // caller could overwrite the stored text of a colleague's (or a shared) atom
  // or chunk — text that other users' searches and prompts then receive.
  // Nothing in the UI calls it; the write paths embed on their own.
  router.post('/search/embed', requireAdminOrSolo, async (req, res) => {
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
      const set = await searchCollections(db, {
        query, collections, topK: topK || 10, filters, rerank: rerank ?? false, minSimilarity,
        owner: req,
      });
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
      const results = await keywordSearch(db, query, collections, limit || 10, req);
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
      // Scoped: another user's chunk id answers [] like an unknown one.
      const results = await getChunkContext(db, req.params.chunkId, contextSize, req);
      res.json({ results });
    } catch (error) {
      console.error('Context retrieval error:', error);
      res.status(500).json({ error: safeError(error) });
    }
  });

  return router;
}
