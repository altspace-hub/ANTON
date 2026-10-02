import { safeError } from '../lib/error-response.js';
import express from 'express';
import { randomBytes } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';
import * as collectionManager from '../services/collection-manager.js';
import { deleteCollection as deleteLegacyChromaCollection, isChromaAvailable, isChromaConfigured } from '../services/chroma-client.js';
import { searchCollections } from '../services/semantic-search.js';
import { getEmbeddingAdapter } from '../services/embedding-adapter.js';
import { countEmbeddedChunks } from '../services/rag/chunk-embedder.js';
import { reembedCollection, reindexStuck } from '../services/rag/collection-maintenance.js';
import { deleteCollectionWithFiles } from '../services/document-indexer.js';
import { isDemoVisitor, keywordOnlyEmbeddingAdapter, DEMO_MAX_COLLECTIONS } from '../services/rag/demo-storage.js';
import { requireAdminOrSolo } from '../middleware/role-guards.js';
import { ownerFilter, scopesToOwner, type OwnedRequest } from '../middleware/ownership.js';

/*
 * Who sees which collection (2026-10-02). Solo and admins: every collection.
 * A team-mode non-admin: their own, plus the shared ones (no creator, the
 * legacy 'system' creator, or an administrator's) — never another member's.
 * On a public demo a visitor sees their own only. Documents are always the
 * uploader's own (rag_documents.uploaded_by), whatever collection they are in.
 * Changing or deleting a collection is its creator's (or an admin's).
 * collection-manager.ts collectionReadScope / collectionWriteScope decide it,
 * in SQL, before the row is loaded; a collection the caller may not see
 * answers 404 like one that does not exist.
 */

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

/** A field that is absent, or a string no longer than `max` once trimmed. */
function optionalText(value: unknown, max: number): { ok: true; value: string | undefined } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: undefined };
  if (typeof value !== 'string' || value.trim().length > max) return { ok: false };
  return { ok: true, value: value.trim() };
}

const ICON_RE = /^[A-Za-z0-9]{1,40}$/;
const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
/** JSON settings stored on the row are bounded: they are text in a shared database. */
const MAX_SETTINGS_JSON = 10_000;

/** How a collection's documents are searched, for the page to say plainly. */
type SearchMethod = 'keyword' | 'hybrid';

export async function createCollectionsRoutes(db: DatabaseAdapter) {
  const router = express.Router();

  /**
   * The search method this caller's runs get over a collection: keyword for a
   * demo visitor (their text is never embedded), otherwise hybrid when the
   * collection has vectors for the current embedding model, else keyword.
   */
  async function searchMethodFor(req: OwnedRequest, collectionId: string): Promise<SearchMethod> {
    if (isDemoVisitor(req)) return 'keyword';
    try {
      const coverage = await countEmbeddedChunks(db, collectionId, getEmbeddingAdapter().model);
      return coverage.embedded > 0 ? 'hybrid' : 'keyword';
    } catch {
      return 'keyword';
    }
  }

  /**
   * List the collections this caller may read, with counts of the caller's
   * own documents in each (a team non-admin's counts never include anyone
   * else's uploads).
   */
  router.get('/collections', async (req, res) => {
    try {
      const owned = req as OwnedRequest;
      const collections = await collectionManager.listCollections(db, collectionManager.collectionReadScope(owned));
      const docScope = ownerFilter(owned, 'uploaded_by');
      const writeScope = collectionManager.collectionWriteScope(owned);
      const enriched = [];
      for (const c of collections) {
        enriched.push({
          ...c,
          documentCount: await collectionManager.getCollectionDocumentCount(db, c.id, docScope),
          chunkCount: await collectionManager.getCollectionChunkCount(db, c.id, docScope),
          watchDirectories: parseJson(c.watch_directories, []),
          metadataSchema: parseJson(c.metadata_schema, {}),
          searchMethod: await searchMethodFor(owned, c.id),
          // Whether this caller may rename or delete it (their own, or any for an admin).
          canManage: !writeScope.sql || (writeScope.params.length > 0 && c.created_by === writeScope.params[0]),
        });
      }
      res.json({ collections: enriched });
    } catch (error) {
      console.error('Error listing collections:', error instanceof Error ? error.message : 'error');
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
      const owned = req as OwnedRequest;
      const collection = await collectionManager.findCollectionFor(db, owned, req.params.id, 'read');
      if (collection === 'not_found' || collection === 'read_only') {
        return res.status(404).json({ error: 'Collection not found' });
      }

      const docScope = ownerFilter(owned, 'uploaded_by');
      const adapter = getEmbeddingAdapter();
      const coverage = await countEmbeddedChunks(db, req.params.id, adapter.model);
      res.json({
        collection: {
          ...collection,
          documentCount: await collectionManager.getCollectionDocumentCount(db, req.params.id, docScope),
          chunkCount: await collectionManager.getCollectionChunkCount(db, req.params.id, docScope),
          // The collection's vector coverage; a demo visitor's documents have none.
          vectorCount: isDemoVisitor(owned) ? 0 : coverage.embedded,
          vectorBackend: 'postgres-embeddings',
          embeddingModel: adapter.model,
          embeddingDimensions: adapter.dimensions,
          staleVectorChunks: isDemoVisitor(owned) ? 0 : coverage.stale,
          searchMethod: await searchMethodFor(owned, req.params.id),
          watchDirectories: parseJson(collection.watch_directories, []),
          metadataSchema: parseJson(collection.metadata_schema, {}),
        }
      });
    } catch (error) {
      console.error('Error getting collection:', error instanceof Error ? error.message : 'error');
      res.status(500).json({ error: safeError(error) });
    }
  });

  /**
   * Create a collection (any signed-in user). The creator owns it. A team
   * non-admin's collection gets a unique id (its name's slug plus a random
   * suffix): with per-owner collections two people can choose the same name,
   * and the id must not tell one of them that the other did.
   */
  router.post('/collections', async (req, res) => {
    try {
      const owned = req as OwnedRequest;
      const body = (req.body ?? {}) as {
        name?: unknown; displayName?: unknown; description?: unknown; icon?: unknown; color?: unknown;
        watchDirectories?: unknown; autoIndex?: unknown; metadataSchema?: unknown;
      };
      const name = optionalText(body.name, 100);
      const displayName = optionalText(body.displayName, 200);
      const description = optionalText(body.description, 2000);
      if (!name.ok || !displayName.ok || !description.ok || !name.value || !displayName.value) {
        return res.status(400).json({ error: 'Name and displayName are required (100 and 200 characters at most)' });
      }
      if (body.icon !== undefined && (typeof body.icon !== 'string' || !ICON_RE.test(body.icon))) {
        return res.status(400).json({ error: 'icon must be an icon name' });
      }
      if (body.color !== undefined && (typeof body.color !== 'string' || !COLOR_RE.test(body.color))) {
        return res.status(400).json({ error: 'color must be a hex colour such as #2DD4A8' });
      }
      // Watched folders name directories on the server: an administrator's setting.
      const wantsWatch = (Array.isArray(body.watchDirectories) && body.watchDirectories.length > 0) || body.autoIndex === true;
      if (wantsWatch && scopesToOwner(owned)) {
        return res.status(403).json({ error: 'Watched folders are set by an administrator' });
      }
      const watchJson = JSON.stringify(body.watchDirectories ?? []);
      const schemaJson = JSON.stringify(body.metadataSchema ?? {});
      if (watchJson.length > MAX_SETTINGS_JSON || schemaJson.length > MAX_SETTINGS_JSON) {
        return res.status(400).json({ error: 'Collection settings are too large' });
      }

      const userId = req.user?.id || 'system';
      if (isDemoVisitor(owned)) {
        const mine = await db.get<{ n: number | string }>('SELECT COUNT(*) AS n FROM knowledge_collections WHERE created_by = ?', [userId]);
        if (Number(mine?.n ?? 0) >= DEMO_MAX_COLLECTIONS) {
          return res.status(409).json({ error: `This demo account has reached its limit of ${DEMO_MAX_COLLECTIONS} collections. Delete one to make another.` });
        }
      }

      const slug = collectionManager.collectionSlug(name.value);
      const id = await collectionManager.createCollection(db, {
        name: name.value,
        display_name: displayName.value,
        description: description.value ?? '',
        icon: typeof body.icon === 'string' ? body.icon : 'FolderOpen',
        color: typeof body.color === 'string' ? body.color : '#2DD4A8',
        watch_directories: watchJson,
        auto_index: body.autoIndex === true ? 1 : 0,
        metadata_schema: schemaJson,
        created_by: userId,
      }, scopesToOwner(owned) ? { id: `${slug.slice(0, 60)}-${randomBytes(5).toString('hex')}` } : {});

      res.json({ success: true, collectionId: id });
    } catch (error) {
      // An admin or solo user naming a second collection like an existing one.
      if (error instanceof Error && /duplicate key|UNIQUE/i.test(error.message)) {
        return res.status(409).json({ error: 'A collection with this name already exists' });
      }
      console.error('Error creating collection:', error instanceof Error ? error.message : 'error');
      res.status(500).json({ error: safeError(error) });
    }
  });

  /**
   * Update a collection: its creator's, or any for an admin. A shared one the
   * caller can read but not change answers 403; one they cannot see, 404.
   */
  router.put('/collections/:id', async (req, res) => {
    try {
      const owned = req as OwnedRequest;
      const found = await collectionManager.findCollectionFor(db, owned, req.params.id, 'write');
      if (found === 'not_found') return res.status(404).json({ error: 'Collection not found' });
      if (found === 'read_only') return res.status(403).json({ error: 'Only an administrator can change a shared collection' });

      const body = (req.body ?? {}) as {
        displayName?: unknown; description?: unknown; icon?: unknown; color?: unknown;
        watchDirectories?: unknown; autoIndex?: unknown; metadataSchema?: unknown;
      };
      const updates: CollectionUpdate = {};
      const displayName = optionalText(body.displayName, 200);
      const description = optionalText(body.description, 2000);
      if (!displayName.ok || !description.ok || displayName.value === '') {
        return res.status(400).json({ error: 'displayName (200 characters at most) and description (2,000) must be text' });
      }
      if (body.icon !== undefined && (typeof body.icon !== 'string' || !ICON_RE.test(body.icon))) {
        return res.status(400).json({ error: 'icon must be an icon name' });
      }
      if (body.color !== undefined && (typeof body.color !== 'string' || !COLOR_RE.test(body.color))) {
        return res.status(400).json({ error: 'color must be a hex colour such as #2DD4A8' });
      }
      if ((body.watchDirectories !== undefined || body.autoIndex !== undefined) && scopesToOwner(owned)) {
        return res.status(403).json({ error: 'Watched folders are set by an administrator' });
      }

      if (displayName.value !== undefined) updates.display_name = displayName.value;
      if (description.value !== undefined) updates.description = description.value;
      if (typeof body.icon === 'string') updates.icon = body.icon;
      if (typeof body.color === 'string') updates.color = body.color;
      if (body.watchDirectories !== undefined) updates.watch_directories = JSON.stringify(body.watchDirectories);
      if (body.autoIndex !== undefined) updates.auto_index = body.autoIndex ? 1 : 0;
      if (body.metadataSchema !== undefined) updates.metadata_schema = JSON.stringify(body.metadataSchema);
      if ((updates.watch_directories?.length ?? 0) > MAX_SETTINGS_JSON || (updates.metadata_schema?.length ?? 0) > MAX_SETTINGS_JSON) {
        return res.status(400).json({ error: 'Collection settings are too large' });
      }

      const success = await collectionManager.updateCollection(db, req.params.id, updates);
      res.json({ success });
    } catch (error) {
      console.error('Error updating collection:', error instanceof Error ? error.message : 'error');
      res.status(500).json({ error: safeError(error) });
    }
  });

  /**
   * Delete a collection: its creator's, or any for an admin (it was admin-only,
   * so nobody could remove a collection of their own). The chunk vectors go
   * first — embeddings has no FK to rag_chunks — then the row (documents and
   * chunks by CASCADE), then the documents' files on disk. A legacy Chroma
   * collection is dropped only if CHROMA_URL is set.
   */
  router.delete('/collections/:id', async (req, res) => {
    try {
      const owned = req as OwnedRequest;
      const found = await collectionManager.findCollectionFor(db, owned, req.params.id, 'write');
      if (found === 'not_found') return res.status(404).json({ error: 'Collection not found' });
      if (found === 'read_only') return res.status(403).json({ error: 'Only an administrator can delete a shared collection' });

      if (isChromaConfigured()) {
        await deleteLegacyChromaCollection(req.params.id);
      }
      const { removedVectors, removedFiles } = await deleteCollectionWithFiles(db, req.params.id);

      res.json({ success: true, removedVectors, removedFiles });
    } catch (error) {
      console.error('Error deleting collection:', error instanceof Error ? error.message : 'error');
      res.status(500).json({ error: safeError(error) });
    }
  });

  /**
   * Get documents in a collection the caller may read. Each document belongs
   * to its uploader, so a team-mode non-admin sees only their own (filename,
   * size and metadata of everyone else's otherwise). Same scope as the sibling
   * GET in documents.ts. The server path stays on the server for them.
   */
  router.get('/collections/:id/documents', async (req, res) => {
    try {
      const owned = req as OwnedRequest;
      const found = await collectionManager.findCollectionFor(db, owned, req.params.id, 'read');
      if (found === 'not_found' || found === 'read_only') return res.status(404).json({ error: 'Collection not found' });
      const documents = await collectionManager.getCollectionDocuments(
        db, req.params.id, ownerFilter(owned, 'uploaded_by'),
      );
      const hidePath = scopesToOwner(owned);
      const enriched = (documents || []).map(({ file_path, ...doc }) => ({
        ...doc,
        ...(hidePath ? {} : { file_path }),
        metadata: parseJson(doc.metadata, {}),
      }));
      res.json({ documents: enriched });
    } catch (error) {
      console.error('Error getting collection documents:', error instanceof Error ? error.message : 'error');
      res.status(500).json({ error: safeError(error) });
    }
  });

  /**
   * Query one collection. The response says which method actually ran
   * (`method`: vector | hybrid | keyword) and what `score` measures
   * (`scoreKind`) — label results from those, never from the URL. A demo
   * visitor's query is never embedded: keyword only.
   */
  router.post('/collections/:id/query', async (req, res) => {
    try {
      const owned = req as OwnedRequest;
      const { query, limit = 10, filter, minSimilarity } = req.body as {
        query?: string; limit?: number; filter?: Record<string, unknown>; minSimilarity?: number;
      };

      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Query text is required' });
      }
      const found = await collectionManager.findCollectionFor(db, owned, req.params.id, 'read');
      if (found === 'not_found' || found === 'read_only') return res.status(404).json({ error: 'Collection not found' });

      const set = await searchCollections(db, {
        query: query.slice(0, 2000),
        collections: [req.params.id],
        topK: Math.min(50, Math.max(1, Number(limit) || 10)),
        filters: filter,
        minSimilarity,
        // Only the caller's own documents in team mode (solo/admin: all).
        owner: owned,
      }, isDemoVisitor(owned) ? { adapter: keywordOnlyEmbeddingAdapter() } : {});

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
      console.error('Error querying collection:', error instanceof Error ? error.message : 'error');
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
      console.error('Error re-embedding collection:', error instanceof Error ? error.message : 'error');
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
      console.error('Error re-driving stuck documents:', error instanceof Error ? error.message : 'error');
      res.status(500).json({ error: safeError(error) });
    }
  });

  /**
   * Collection-RAG health. Vectors are served from PostgreSQL (embeddings
   * table) through the local embedding adapter; keyword retrieval is always
   * available. Chroma is reported only if CHROMA_URL is configured.
   * Instance-wide counts: admin (or solo).
   */
  router.get('/collections/health/check', requireAdminOrSolo, async (_req, res) => {
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
