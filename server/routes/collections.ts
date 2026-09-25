import { safeError } from '../lib/error-response.js';
import express from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import * as collectionManager from '../services/collection-manager.js';
import { deleteCollection as deleteLegacyChromaCollection, isChromaAvailable, isChromaConfigured } from '../services/chroma-client.js';
import { searchCollections } from '../services/semantic-search.js';
import { getEmbeddingAdapter } from '../services/embedding-adapter.js';
import { countEmbeddedChunks, deleteCollectionChunkEmbeddings } from '../services/rag/chunk-embedder.js';
import { reembedCollection, reindexStuck } from '../services/rag/collection-maintenance.js';
import { requireAdminOrSolo } from '../middleware/role-guards.js';
import { ownerFilter, type OwnedRequest } from '../middleware/ownership.js';

interface CollectionUpdate {
  display_name?: string;
  description?: string;
  icon?: string;
  color?: string;
  watch_directories?: string;
  auto_index?: number;
  metadata_schema?: string;
}

function parseJson(raw: string | null | undefined, fallback: unknown): unknown {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

export async function createCollectionsRoutes(db: DatabaseAdapter) {
  const router = express.Router();

  /**
   * List all collections
   */
  router.get('/collections', async (req, res) => {
    try {
      const collections = await collectionManager.listCollections(db);
      const enriched = [];
      for (const c of collections) {
        enriched.push({
          ...c,
          documentCount: await collectionManager.getCollectionDocumentCount(db, c.id),
          chunkCount: await collectionManager.getCollectionChunkCount(db, c.id),
          watchDirectories: parseJson(c.watch_directories, []),
          metadataSchema: parseJson(c.metadata_schema, {}),
        });
      }
      res.json({ collections: enriched });
    } catch (error) {
      console.error('Error listing collections:', error);
      res.status(500).json({ error: safeError(error) });
    }
  });

  /**
   * Get collection details. `vectorCount` is the number of this collection's
   * chunks that carry a vector for the CURRENT embedding model in the
   * embeddings table (it used to be a Chroma count that was always 0).
   */
  router.get('/collections/:id', async (req, res) => {
    try {
      const collection = await collectionManager.getCollection(db, req.params.id);
      if (!collection) {
        return res.status(404).json({ error: 'Collection not found' });
      }

      const adapter = getEmbeddingAdapter();
      const coverage = await countEmbeddedChunks(db, req.params.id, adapter.model);
      res.json({
        collection: {
          ...collection,
          documentCount: await collectionManager.getCollectionDocumentCount(db, req.params.id),
          chunkCount: await collectionManager.getCollectionChunkCount(db, req.params.id),
          vectorCount: coverage.embedded,
          vectorBackend: 'postgres-embeddings',
          embeddingModel: adapter.model,
          embeddingDimensions: adapter.dimensions,
          staleVectorChunks: coverage.stale,
          watchDirectories: parseJson(collection.watch_directories, []),
          metadataSchema: parseJson(collection.metadata_schema, {}),
        }
      });
    } catch (error) {
      console.error('Error getting collection:', error);
      res.status(500).json({ error: safeError(error) });
    }
  });

  /**
   * Create new collection (any authenticated user can create)
   */
  router.post('/collections', async (req, res) => {
    try {
      const { name, displayName, description, icon, color, watchDirectories, autoIndex, metadataSchema } = req.body as {
        name?: string; displayName?: string; description?: string; icon?: string; color?: string;
        watchDirectories?: unknown; autoIndex?: boolean; metadataSchema?: unknown;
      };
      const userId = req.user?.id || 'system';

      if (!name || !displayName) {
        return res.status(400).json({ error: 'Name and displayName are required' });
      }

      const id = await collectionManager.createCollection(db, {
        name,
        display_name: displayName,
        description: description || '',
        icon: icon || 'FolderOpen',
        color: color || '#2DD4A8',
        watch_directories: JSON.stringify(watchDirectories || []),
        auto_index: autoIndex ? 1 : 0,
        metadata_schema: JSON.stringify(metadataSchema || {}),
        created_by: userId,
      });

      res.json({ success: true, collectionId: id });
    } catch (error) {
      console.error('Error creating collection:', error);
      res.status(500).json({ error: safeError(error) });
    }
  });

  /**
   * Update collection
   */
  router.put('/collections/:id', async (req, res) => {
    try {
      const updates: CollectionUpdate = {};
      const { displayName, description, icon, color, watchDirectories, autoIndex, metadataSchema } = req.body as {
        displayName?: string; description?: string; icon?: string; color?: string;
        watchDirectories?: unknown; autoIndex?: boolean; metadataSchema?: unknown;
      };

      if (displayName !== undefined) updates.display_name = displayName;
      if (description !== undefined) updates.description = description;
      if (icon !== undefined) updates.icon = icon;
      if (color !== undefined) updates.color = color;
      if (watchDirectories !== undefined) updates.watch_directories = JSON.stringify(watchDirectories);
      if (autoIndex !== undefined) updates.auto_index = autoIndex ? 1 : 0;
      if (metadataSchema !== undefined) updates.metadata_schema = JSON.stringify(metadataSchema);

      const success = await collectionManager.updateCollection(db, req.params.id, updates);
      res.json({ success });
    } catch (error) {
      console.error('Error updating collection:', error);
      res.status(500).json({ error: safeError(error) });
    }
  });

  /**
   * Delete collection. Chunk vectors go first — embeddings has no FK to
   * rag_chunks, so the CASCADE from knowledge_collections would leave them
   * orphaned. A legacy Chroma collection is dropped only if CHROMA_URL is set.
   */
  router.delete('/collections/:id', async (req, res) => {
    try {
      // Check if user is admin (or solo mode)
      const userRole = req.user?.role;
      if (userRole !== 'admin') {
        return res.status(403).json({ error: 'Only admins can delete collections' });
      }

      const removedVectors = await deleteCollectionChunkEmbeddings(db, req.params.id);
      if (isChromaConfigured()) {
        await deleteLegacyChromaCollection(req.params.id);
      }

      // Delete metadata (CASCADE will delete documents and chunks)
      await collectionManager.deleteCollectionMetadata(db, req.params.id);

      res.json({ success: true, removedVectors });
    } catch (error) {
      console.error('Error deleting collection:', error);
      res.status(500).json({ error: safeError(error) });
    }
  });

  /**
   * Get documents in a collection. The collection is shared; its documents are
   * not — each belongs to its uploader, so a team-mode non-admin sees only their
   * own (filename, server path, size and metadata of everyone else's otherwise).
   * Same scope as the sibling GET in documents.ts.
   */
  router.get('/collections/:id/documents', async (req, res) => {
    try {
      const documents = await collectionManager.getCollectionDocuments(
        db, req.params.id, ownerFilter(req as OwnedRequest, 'uploaded_by'),
      );
      const enriched = (documents || []).map(doc => ({
        ...doc,
        metadata: parseJson(doc.metadata, {}),
      }));
      res.json({ documents: enriched });
    } catch (error) {
      console.error('Error getting collection documents:', error);
      res.status(500).json({ error: safeError(error) });
    }
  });

  /**
   * Query one collection. The response says which method actually ran
   * (`method`: vector | hybrid | keyword) and what `score` measures
   * (`scoreKind`) — label results from those, never from the URL.
   */
  router.post('/collections/:id/query', async (req, res) => {
    try {
      const { query, limit = 10, filter, minSimilarity } = req.body as {
        query?: string; limit?: number; filter?: Record<string, unknown>; minSimilarity?: number;
      };

      if (!query) {
        return res.status(400).json({ error: 'Query text is required' });
      }

      const set = await searchCollections(db, {
        query,
        collections: [req.params.id],
        topK: limit,
        filters: filter,
        minSimilarity,
        // Only the caller's own documents in team mode (solo/admin: all).
        owner: req as OwnedRequest,
      });

      res.json({
        results: set.results.map((r) => ({
          id: r.chunkId,
          content: r.content,
          metadata: r.metadata,
          citation: r.citation,
          score: r.score,
          scoreKind: r.scoreKind,
          method: r.method,
          similarity: r.similarity,
          vectorRank: r.vectorRank,
          keywordRank: r.keywordRank,
        })),
        method: set.method,
        scoreKind: set.scoreKind,
        methodLabel: set.methodLabel,
        diagnostics: set.diagnostics,
      });
    } catch (error) {
      console.error('Error querying collection:', error);
      res.status(500).json({ error: safeError(error) });
    }
  });

  /**
   * Re-embed a collection with the CURRENT embedding adapter: drops its chunk
   * vectors in the embeddings table and rebuilds them from rag_chunks.
   * Use after switching embedding providers/models. Admin (or solo).
   */
  router.post('/knowledge/reembed', requireAdminOrSolo, async (req, res) => {
    try {
      const { collectionId } = req.body as { collectionId?: string };
      if (!collectionId || typeof collectionId !== 'string') {
        return res.status(400).json({ error: 'collectionId is required' });
      }
      const collection = await collectionManager.getCollection(db, collectionId);
      if (!collection) {
        return res.status(404).json({ error: 'Collection not found' });
      }
      const result = await reembedCollection(db, collectionId);
      res.json({ success: true, ...result });
    } catch (error) {
      console.error('Error re-embedding collection:', error);
      res.status(500).json({ error: safeError(error) });
    }
  });

  /**
   * Re-drive the collection index. Admin (or solo).
   *
   *   Body: {
   *     olderThanMinutes?: number  // a document is "stuck" when it has been
   *                                // `indexing` longer than this (default 30)
   *     collectionId?: string      // restrict to one collection
   *     dryRun?: boolean           // report what would be touched; touch nothing
   *     documentLimit?: number     // stuck documents per call (default 50)
   *     chunkLimit?: number        // chunks embedded per call (default 2000)
   *   }
   *
   * Pass 1 re-indexes stuck documents from the file still on disk (or marks
   * them failed when the file is gone). Pass 2 embeds indexed chunks that have
   * no vector for the current model. See rag/collection-maintenance.ts for the
   * exact selection SQL.
   */
  router.post('/knowledge/reindex-stuck', requireAdminOrSolo, async (req, res) => {
    try {
      const body = (req.body ?? {}) as {
        olderThanMinutes?: unknown; collectionId?: unknown; dryRun?: unknown;
        documentLimit?: unknown; chunkLimit?: unknown;
      };
      const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
      const result = await reindexStuck(db, {
        olderThanMinutes: num(body.olderThanMinutes),
        collectionId: typeof body.collectionId === 'string' && body.collectionId ? body.collectionId : undefined,
        dryRun: body.dryRun === true,
        documentLimit: num(body.documentLimit),
        chunkLimit: num(body.chunkLimit),
      });
      res.json({ success: true, ...result });
    } catch (error) {
      console.error('Error re-driving stuck documents:', error);
      res.status(500).json({ error: safeError(error) });
    }
  });

  /**
   * Collection-RAG health. Vectors are served from PostgreSQL (embeddings
   * table) through the local embedding adapter; keyword retrieval is always
   * available. Chroma is reported only if CHROMA_URL is configured.
   */
  router.get('/collections/health/check', async (_req, res) => {
    try {
      const adapter = getEmbeddingAdapter();
      const coverage = await countEmbeddedChunks(db, null, adapter.model);
      const stuck = await db.get<{ n: number | string }>(
        `SELECT COUNT(*) AS n FROM rag_documents WHERE index_status = 'indexing' AND uploaded_at < NOW() - INTERVAL '30 minutes'`,
      );
      const stuckDocuments = Number(stuck?.n ?? 0);
      const chromaConfigured = isChromaConfigured();
      const chromaReachable = chromaConfigured ? await isChromaAvailable() : false;

      const vectorReady = coverage.embedded > 0;
      const parts: string[] = [];
      parts.push(
        vectorReady
          ? `${coverage.embedded}/${coverage.total} chunks have vectors for ${adapter.provider}/${adapter.model} — hybrid (vector + keyword) retrieval`
          : `0/${coverage.total} chunks have vectors for ${adapter.provider}/${adapter.model} — retrieval is keyword-only until POST /api/knowledge/reindex-stuck runs`,
      );
      if (coverage.stale > 0) parts.push(`${coverage.stale} chunk(s) carry vectors from another model — POST /api/knowledge/reembed`);
      if (stuckDocuments > 0) parts.push(`${stuckDocuments} document(s) stuck in 'indexing' — POST /api/knowledge/reindex-stuck`);

      res.json({
        available: true, // keyword retrieval never depends on a provider
        vectorBackend: 'postgres-embeddings',
        vectorReady,
        embeddingProvider: adapter.provider,
        embeddingModel: adapter.model,
        embeddingDimensions: adapter.dimensions,
        totalChunks: coverage.total,
        embeddedChunks: coverage.embedded,
        staleVectorChunks: coverage.stale,
        stuckDocuments,
        chroma: { configured: chromaConfigured, reachable: chromaReachable },
        message: parts.join('. '),
      });
    } catch (error) {
      res.status(500).json({
        available: false,
        error: safeError(error)
      });
    }
  });

  return router;
}

export default createCollectionsRoutes;
