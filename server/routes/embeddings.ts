/**
 * Embedding & Memory API Routes — APCI Hybrid Memory Retrieval
 *
 * Dedicated endpoints for ANTON's knowledge memory system:
 *   POST /api/embeddings/search/atoms     — Semantic + keyword search across knowledge atoms
 *   POST /api/embeddings/search/decisions — Search checkpoint decisions
 *   POST /api/embeddings/reindex          — Trigger on-demand re-embedding
 *   GET  /api/embeddings/stats            — Embedding coverage stats
 *   GET  /api/embeddings/config           — Current provider config
 *   GET  /api/embeddings/feedback/:sessionId — Retrieval feedback for a session
 */

import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

import { hybridSearch, findSimilar } from '../services/hybrid-search.js';
import { getEmbeddingAdapter } from '../services/embedding-adapter.js';
import { backfillKnowledgeAtoms, backfillCheckpoints, embedModuleDescriptions } from '../services/embedding-pipeline.js';
import { applyAntonBoosts, applyTokenBudget } from '../services/atom-boost.js';
import { safeError } from '../lib/error-response.js';

export async function createEmbeddingRoutes(db: DatabaseAdapter) {
  const router = Router();

  // ── POST /search/atoms — Atom-specific hybrid search ─────────────────────

  router.post('/search/atoms', async (req, res) => {
    try {
      const { query, areaId, moduleId, topK = 20, minConfidence = 0, atomTypes } = req.body as {
        query: string;
        areaId?: string;
        moduleId?: string;
        topK?: number;
        minConfidence?: number;
        atomTypes?: string[];
      };

      if (!query) return res.status(400).json({ error: 'query is required' });

      const results = await hybridSearch(db, {
        query,
        contentTypes: ['knowledge_atom'],
        topK: topK * 2, // Over-fetch for post-filtering
        minSimilarity: 0.2,
      });

      // Enrich with authoritative DB metadata
      const atomIds = results.map(r => r.content_id);
      if (atomIds.length === 0) return res.json({ results: [], total: 0 });

      const placeholders = atomIds.map(() => '?').join(',');
      const atomRows = await db.all(`
        SELECT id, content, atom_type, category, confidence, source_area_id,
               source_module_id, created_at, superseded_by, tags
        FROM knowledge_atoms
        WHERE id IN (${placeholders}) AND is_active = 1
      `, ...atomIds) as Array<{
        id: string; content: string; atom_type: string; category: string;
        confidence: number; source_area_id: string | null; source_module_id: string | null;
        created_at: string; superseded_by: string | null; tags: string | null;
      }>;

      const atomMap = new Map(atomRows.map(a => [a.id, a]));

      const enriched = results
        .filter(r => atomMap.has(r.content_id))
        .map(r => {
          const atom = atomMap.get(r.content_id)!;
          return {
            ...r,
            content_text: atom.content,
            metadata: {
              ...r.metadata,
              category: atom.category,
              atom_type: atom.atom_type,
              confidence: atom.confidence,
              source_area_id: atom.source_area_id,
              source_module_id: atom.source_module_id,
              created_at: atom.created_at,
              is_superseded: atom.superseded_by ? 1 : 0,
              tags: atom.tags,
            } as Record<string, unknown>,
          };
        });

      // Apply ANTON boosts
      const boosted = applyAntonBoosts(enriched, { areaId, moduleId }, db);

      // Post-filter by confidence and atom type
      let filtered = boosted;
      if (minConfidence > 0) {
        filtered = filtered.filter(r => {
          const conf = typeof r.metadata.confidence === 'number' ? r.metadata.confidence : 0;
          return conf >= minConfidence;
        });
      }
      if (atomTypes && atomTypes.length > 0) {
        filtered = filtered.filter(r => atomTypes.includes(r.metadata.atom_type as string));
      }

      const final = filtered.slice(0, topK);

      res.json({
        results: final.map(r => ({
          id: r.content_id,
          content: r.content_text,
          score: r.score,
          similarity: r.similarity,
          source: r.source,
          atom_type: r.metadata.atom_type,
          category: r.metadata.category,
          confidence: r.metadata.confidence,
          source_area_id: r.metadata.source_area_id,
          source_module_id: r.metadata.source_module_id,
          created_at: r.metadata.created_at,
          is_superseded: r.metadata.is_superseded,
          tags: r.metadata.tags,
        })),
        total: filtered.length,
        method: 'hybrid',
      });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /search/decisions — Checkpoint decision search ──────────────────

  router.post('/search/decisions', async (req, res) => {
    try {
      const { query, topK = 10 } = req.body as { query: string; topK?: number };
      if (!query) return res.status(400).json({ error: 'query is required' });

      const results = await hybridSearch(db, {
        query,
        contentTypes: ['checkpoint'],
        topK,
        minSimilarity: 0.3,
      });

      res.json({
        results: results.map(r => ({
          id: r.content_id,
          content: r.content_text,
          score: r.score,
          similarity: r.similarity,
          source: r.source,
          metadata: r.metadata,
        })),
        total: results.length,
        method: 'hybrid',
      });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /reindex — Trigger on-demand re-embedding ───────────────────────

  router.post('/reindex', async (_req, res) => {
    try {
      const adapter = getEmbeddingAdapter();

      // Count items needing embedding before starting
      const atomsBefore = (await db.get(
        `SELECT COUNT(*) as c FROM knowledge_atoms WHERE is_active = 1
         AND id NOT IN (SELECT content_id FROM embeddings WHERE content_type = 'knowledge_atom' AND embedding_model = ?)`
      , adapter.model) as { c: number }).c;

      const checkpointsBefore = (await db.get(
        `SELECT COUNT(*) as c FROM checkpoint_decisions
         WHERE id NOT IN (SELECT content_id FROM embeddings WHERE content_type = 'checkpoint' AND embedding_model = ?)`
      , adapter.model) as { c: number }).c;

      // Run backfills (larger batch size for on-demand)
      await embedModuleDescriptions(db);
      await backfillKnowledgeAtoms(db, 200);
      await backfillCheckpoints(db, 200);

      // Count remaining after
      const atomsAfter = (await db.get(
        `SELECT COUNT(*) as c FROM knowledge_atoms WHERE is_active = 1
         AND id NOT IN (SELECT content_id FROM embeddings WHERE content_type = 'knowledge_atom' AND embedding_model = ?)`
      , adapter.model) as { c: number }).c;

      res.json({
        success: true,
        provider: adapter.provider,
        model: adapter.model,
        atomsEmbedded: atomsBefore - atomsAfter,
        atomsRemaining: atomsAfter,
        checkpointsQueued: checkpointsBefore,
      });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /stats — Embedding coverage statistics ───────────────────────────

  router.get('/stats', async (_req, res) => {
    try {
      const adapter = getEmbeddingAdapter();

      const totalAtoms = (await db.get('SELECT COUNT(*) as c FROM knowledge_atoms WHERE is_active = 1') as { c: number }).c;
      const embeddedAtoms = (await db.get(
        `SELECT COUNT(DISTINCT content_id) as c FROM embeddings WHERE content_type = 'knowledge_atom' AND embedding_model = ?`
      , adapter.model) as { c: number }).c;

      const totalCheckpoints = (await db.get('SELECT COUNT(*) as c FROM checkpoint_decisions') as { c: number }).c;
      const embeddedCheckpoints = (await db.get(
        `SELECT COUNT(DISTINCT content_id) as c FROM embeddings WHERE content_type = 'checkpoint' AND embedding_model = ?`
      , adapter.model) as { c: number }).c;

      const totalModules = (await db.get(
        `SELECT COUNT(DISTINCT content_id) as c FROM embeddings WHERE content_type = 'module' AND embedding_model = ?`
      , adapter.model) as { c: number }).c;

      const byType = await db.all(
        `SELECT content_type, COUNT(*) as count FROM embeddings WHERE embedding_model = ? GROUP BY content_type`
      , adapter.model) as Array<{ content_type: string; count: number }>;

      // Feedback stats
      let feedbackTotal = 0;
      let feedbackRelevant = 0;
      try {
        feedbackTotal = ((await db.get('SELECT COUNT(*) as c FROM retrieval_feedback')) as { c: number })?.c ?? 0;
        feedbackRelevant = (await db.get('SELECT COUNT(*) as c FROM retrieval_feedback WHERE was_relevant = 1') as { c: number }).c;
      } catch {
        // retrieval_feedback table may not exist yet
      }

      res.json({
        provider: adapter.provider,
        model: adapter.model,
        dimensions: adapter.dimensions,
        atoms: { total: totalAtoms, embedded: embeddedAtoms, coverage: totalAtoms > 0 ? Math.round((embeddedAtoms / totalAtoms) * 100) : 0 },
        checkpoints: { total: totalCheckpoints, embedded: embeddedCheckpoints, coverage: totalCheckpoints > 0 ? Math.round((embeddedCheckpoints / totalCheckpoints) * 100) : 0 },
        modules: { embedded: totalModules },
        byType,
        feedback: { total: feedbackTotal, relevant: feedbackRelevant },
      });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /config — Current embedding provider configuration ───────────────

  router.get('/config', async (_req, res) => {
    try {
      const adapter = getEmbeddingAdapter();
      res.json({
        provider: adapter.provider,
        model: adapter.model,
        dimensions: adapter.dimensions,
        ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        hasOpenAIKey: !!process.env.OPENAI_API_KEY,
        hasVoyageKey: !!process.env.VOYAGE_API_KEY,
        hasOllamaUrl: !!(process.env.OLLAMA_BASE_URL || process.env.OLLAMA_EMBEDDING_MODEL),
      });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /feedback/:sessionId — Retrieval feedback for a session ──────────

  router.get('/feedback/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const rows = await db.get(`SELECT rf.atom_id, rf.retrieval_method, rf.retrieval_score, rf.injected_at, rf.was_relevant,
                ka.content, ka.atom_type, ka.category, ka.confidence
         FROM retrieval_feedback rf
         LEFT JOIN knowledge_atoms ka ON ka.id = rf.atom_id
         WHERE rf.session_id = ?
         ORDER BY rf.retrieval_score DESC`
      , sessionId) as Array<{
        atom_id: string; retrieval_method: string; retrieval_score: number;
        injected_at: string; was_relevant: number | null;
        content: string; atom_type: string; category: string; confidence: number;
      }>;

      res.json({ sessionId, injectedAtoms: rows, total: rows.length });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /feedback — Record relevance feedback on a retrieved atom ──────

  router.post('/feedback', async (req, res) => {
    try {
      const { atomId, sessionId, wasRelevant } = req.body as {
        atomId: string;
        sessionId: string;
        wasRelevant: boolean;
      };

      if (!atomId || !sessionId || typeof wasRelevant !== 'boolean') {
        return res.status(400).json({ error: 'atomId, sessionId, and wasRelevant (boolean) are required' });
      }



      if (result.changes === 0) {
        return res.status(404).json({ error: 'No matching feedback row found' });
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /similar — Find similar content ────────────────────────────────

  router.post('/similar', async (req, res) => {
    try {
      const { contentType, contentId, topK = 5 } = req.body as {
        contentType: string; contentId: string; topK?: number;
      };
      if (!contentType || !contentId) return res.status(400).json({ error: 'contentType and contentId required' });

      const results = await findSimilar(db, { contentType, contentId, topK });

      res.json({
        results: results.map(r => ({
          id: r.content_id,
          content_type: r.content_type,
          content: r.content_text,
          score: r.score,
          similarity: r.similarity,
          metadata: r.metadata,
        })),
        total: results.length,
      });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
