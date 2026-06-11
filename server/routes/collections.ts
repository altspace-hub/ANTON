import { safeError } from '../lib/error-response.js';
import express from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import * as collectionManager from '../services/collection-manager.js';
import * as chromaClient from '../services/chroma-client.js';

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
          watchDirectories: JSON.parse(c.watch_directories || '[]'),
          metadataSchema: JSON.parse(c.metadata_schema || '{}'),
        });
      }
      res.json({ collections: enriched });
    } catch (error) {
      console.error('Error listing collections:', error);
      res.status(500).json({ error: safeError(error) });
    }
  });

  /**
   * Get collection details
   */
  router.get('/collections/:id', async (req, res) => {
    try {
      const collection = await collectionManager.getCollection(db, req.params.id);
      if (!collection) {
        return res.status(404).json({ error: 'Collection not found' });
      }

      const stats = await chromaClient.getCollectionStats(req.params.id);
      res.json({
        collection: {
          ...collection,
          documentCount: await collectionManager.getCollectionDocumentCount(db, req.params.id),
          chunkCount: await collectionManager.getCollectionChunkCount(db, req.params.id),
          vectorCount: stats.count,
          watchDirectories: JSON.parse(collection.watch_directories),
          metadataSchema: JSON.parse(collection.metadata_schema),
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
      const { name, displayName, description, icon, color, watchDirectories, autoIndex, metadataSchema } = req.body;
      const userId = (req as any).user?.id || 'system';

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
      const updates: any = {};
      const { displayName, description, icon, color, watchDirectories, autoIndex, metadataSchema } = req.body;

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
   * Delete collection
   */
  router.delete('/collections/:id', async (req, res) => {
    try {
      // Check if user is admin (or solo mode)
      const userRole = (req as any).user?.role;
      if (userRole !== 'admin') {
        return res.status(403).json({ error: 'Only admins can delete collections' });
      }

      // Delete from ChromaDB
      await chromaClient.deleteCollection(req.params.id);

      // Delete metadata from SQLite (CASCADE will delete documents and chunks)
      await collectionManager.deleteCollectionMetadata(db, req.params.id);

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting collection:', error);
      res.status(500).json({ error: safeError(error) });
    }
  });

  /**
   * Get documents in a collection
   */
  router.get('/collections/:id/documents', async (req, res) => {
    try {
      const documents = await collectionManager.getCollectionDocuments(db, req.params.id);
      const enriched = (documents || []).map(doc => ({
        ...doc,
        metadata: JSON.parse(doc.metadata || '{}'),
      }));
      res.json({ documents: enriched });
    } catch (error) {
      console.error('Error getting collection documents:', error);
      res.status(500).json({ error: safeError(error) });
    }
  });

  /**
   * Query collection (semantic search)
   */
  router.post('/collections/:id/query', async (req, res) => {
    try {
      const { query, limit = 10, filter } = req.body;

      if (!query) {
        return res.status(400).json({ error: 'Query text is required' });
      }

      const results = await chromaClient.queryCollection(
        req.params.id,
        query,
        limit,
        filter
      );

      res.json({
        results: results.documents[0].map((doc, i) => ({
          content: doc,
          metadata: results.metadatas[0][i],
          distance: results.distances[0][i],
          id: results.ids[0][i],
        }))
      });
    } catch (error) {
      console.error('Error querying collection:', error);
      res.status(500).json({ error: safeError(error) });
    }
  });

  /**
   * Re-embed a collection with the CURRENT embedding adapter (Wave 4.12).
   * Use after switching embedding providers/models — rebuilds the Chroma
   * index from the chunk text stored in PostgreSQL.
   */
  router.post('/knowledge/reembed', async (req, res) => {
    try {
      const { collectionId } = req.body as { collectionId?: string };
      if (!collectionId || typeof collectionId !== 'string') {
        return res.status(400).json({ error: 'collectionId is required' });
      }
      const collection = await collectionManager.getCollection(db, collectionId);
      if (!collection) {
        return res.status(404).json({ error: 'Collection not found' });
      }
      const result = await chromaClient.reembedCollection(db, collectionId);
      res.json({ success: true, ...result });
    } catch (error) {
      console.error('Error re-embedding collection:', error);
      res.status(500).json({ error: safeError(error) });
    }
  });

  /**
   * Check ChromaDB health. Embeddings go through the local embedding adapter
   * (Ollama / OpenAI / Voyage) — OPENAI_API_KEY is no longer required.
   */
  router.get('/collections/health/check', async (req, res) => {
    try {
      const isAvailable = await chromaClient.isChromaAvailable();
      const adapter = (await import('../services/embedding-adapter.js')).getEmbeddingAdapter();
      res.json({
        available: isAvailable,
        embeddingProvider: adapter.provider,
        embeddingModel: adapter.model,
        message: isAvailable
          ? `ChromaDB is ready (embeddings via ${adapter.provider}/${adapter.model})`
          : 'ChromaDB unavailable — vector search falls back to keyword. Embeddings use the local adapter; no OpenAI key required.'
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
