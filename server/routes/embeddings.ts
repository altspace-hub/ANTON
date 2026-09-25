/**
 * Embedding & Memory API Routes — APCI Hybrid Memory Retrieval
 *
 * Dedicated endpoints for ANTON's knowledge memory system:
 *   POST /api/embeddings/search/atoms     — Semantic + keyword search across knowledge atoms
 *   POST /api/embeddings/search/decisions — Search checkpoint decisions
 *   POST /api/embeddings/reindex          — Trigger on-demand re-embedding
 *   GET  /api/embeddings/stats            — Embedding coverage stats
 *   GET  /api/embeddings/config           — Current provider config
 *   GET  /api/embeddings/provider         — Active vs pinned embedding provider + row counts per model/dimension
 *   POST /api/embeddings/reembed-mismatched — Re-embed rows from another provider (admin; dryRun defaults to true)
 *   GET  /api/embeddings/feedback/:sessionId — Retrieval feedback for a session
 */

import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

import { hybridSearch, findSimilar, filterOwnedByScope, searchScopeForRequest, atomOwnerSql } from '../services/hybrid-search.js';
import { getEmbeddingAdapter, isZeroVector } from '../services/embedding-adapter.js';
import { resetVectorStore, getVectorStore } from '../services/vector-store-adapter.js';
import { backfillKnowledgeAtoms, backfillCheckpoints, embedModuleDescriptions } from '../services/embedding-pipeline.js';
import { applyAntonBoosts, applyTokenBudget } from '../services/atom-boost.js';
import {
  checkEmbeddingPin,
  countEmbeddingRowsByModel,
  countMismatchedEmbeddingRows,
  mismatchedGroups,
  repinToActive,
} from '../services/embedding-pin.js';
import { requireAdminOrSolo } from '../middleware/role-guards.js';
import { ownerFilter, type OwnedRequest } from '../middleware/ownership.js';
import { safeError } from '../lib/error-response.js';

/** Rows one reembed-mismatched call may touch, and the hard ceiling a caller can ask for. */
export const REEMBED_DEFAULT_LIMIT = 200;
export const REEMBED_MAX_LIMIT = 1000;
const REEMBED_DEFAULT_BATCH = 25;
const REEMBED_MAX_BATCH = 100;

/** Ceiling for a search's topK from the request body. The scoped searches
 *  over-fetch a multiple of it, so an unbounded value was an unbounded scan. */
const MAX_TOP_K = 100;

function clampInt(v: unknown, fallback: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
}

/**
 * retrieval_feedback rows belong to the session they were injected into, and a
 * session to its user (sessions.user_id). This is a WHERE fragment limiting those
 * rows to the caller's own sessions — the rule routes/sessions.ts applies to the
 * session itself. It is empty for solo and admins (ownerFilter's rule), so their
 * statements are exactly what they were; with no identity it matches nothing.
 * `sessionColumn` must be a literal at the call site.
 */
function ownSessionRowsSql(req: OwnedRequest, sessionColumn: string): { sql: string; params: string[] } {
  const scope = ownerFilter(req, 's.user_id');
  if (!scope.sql) return scope;
  return { sql: ` AND EXISTS (SELECT 1 FROM sessions s WHERE s.id = ${sessionColumn}${scope.sql})`, params: scope.params };
}

export async function createEmbeddingRoutes(db: DatabaseAdapter) {
  const router = Router();

  // ── POST /search/atoms — Atom-specific hybrid search ─────────────────────

  router.post('/search/atoms', async (req, res) => {
    try {
      const { query, areaId, moduleId, topK: rawTopK, minConfidence = 0, atomTypes } = req.body as {
        query: string;
        areaId?: string;
        moduleId?: string;
        topK?: unknown;
        minConfidence?: number;
        atomTypes?: string[];
      };

      if (!query) return res.status(400).json({ error: 'query is required' });
      const topK = clampInt(rawTopK, 20, MAX_TOP_K);

      // Atoms have an owner (knowledge_atoms.owner_user_id, migration 275): in team
      // mode a non-admin finds their own atoms and the shared ones, the rule the
      // prompt layer injects by. Request-derived scope, not INSTANCE_WIDE_SEARCH —
      // this route used to hand every user's atoms to anyone with a keyword.
      const scope = searchScopeForRequest(req);
      const results = await hybridSearch(db, {
        query,
        contentTypes: ['knowledge_atom'],
        topK: topK * 2, // Over-fetch for post-filtering
        minSimilarity: 0.2,
        scope,
      });

      // Enrich with authoritative DB metadata
      const atomIds = results.map(r => r.content_id);
      if (atomIds.length === 0) return res.json({ results: [], total: 0 });

      // The owner rule again on the enrichment read: the enrichment is what supplies
      // the content returned below, so it must not depend on hybridSearch alone.
      const owner = atomOwnerSql(scope, 'owner_user_id');
      const placeholders = atomIds.map(() => '?').join(',');
      const atomRows = await db.all(`
        SELECT id, content, atom_type, category, confidence, source_area_id,
               source_module_id, created_at, superseded_by, tags
        FROM knowledge_atoms
        WHERE id IN (${placeholders}) AND is_active = 1${owner.sql}
      `, ...atomIds, ...owner.params) as Array<{
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
      const boosted = await applyAntonBoosts(enriched, { areaId, moduleId }, db);

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
      const { query, topK: rawTopK } = req.body as { query: string; topK?: unknown };
      const topK = clampInt(rawTopK, 10, MAX_TOP_K);
      if (!query) return res.status(400).json({ error: 'query is required' });

      // Checkpoint decisions are strictly their decider's (checkpoint_decisions.
      // decided_by — hybrid-search's strictOwnerSql): on a team server a non-admin
      // finds only their own. The search is scoped by the request, over-fetched
      // when scoped so the filter can still fill topK, and the route applies the
      // same rule once more to exactly what it returns (filterOwnedByScope), so
      // its answer never rests on the search service alone. Solo and admins get
      // exactly the old search (instance scope: both steps are no-ops).
      const scope = searchScopeForRequest(req);
      const scoped = scope.kind !== 'instance';
      const hits = await hybridSearch(db, {
        query,
        contentTypes: ['checkpoint'],
        topK: scoped ? topK * 3 : topK,
        minSimilarity: 0.3,
        scope,
      });
      const results = scoped ? (await filterOwnedByScope(db, hits, scope)).slice(0, topK) : hits;

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

  router.post('/reindex', requireAdminOrSolo, async (_req, res) => {
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

  // ── POST /backfill-vec — Enable + populate the pgvector column ────────────
  // Idempotent operator action for VECTOR_BACKEND=pgvector. Ensures the extension
  // + embedding_vec column + HNSW index exist, then copies existing 1536-dim TEXT
  // embeddings into the vector column (a cheap copy — no OpenAI re-spend). Safe to
  // re-run; this is the path to enable pgvector if it was installed AFTER migration
  // 218 ran (when the extension was still absent).
  router.post('/backfill-vec', requireAdminOrSolo, async (_req, res) => {
    try {
      if (db.dialect !== 'postgresql') {
        return res.status(400).json({ error: 'pgvector backfill requires a PostgreSQL connection' });
      }

      // 1. Ensure extension + column + index (idempotent).
      try {
        await db.run('CREATE EXTENSION IF NOT EXISTS vector');
      } catch {
        return res.status(400).json({
          error: 'pgvector extension not available. Install it on the Postgres host ' +
            '(e.g. postgresql-16-pgvector) and ensure the DB role may CREATE EXTENSION.',
        });
      }
      await db.run('ALTER TABLE embeddings ADD COLUMN IF NOT EXISTS embedding_vec vector(1536)');
      // Build the index BEFORE the backfill: the column was just added (all NULL),
      // so the HNSW build is on an empty set — no long lock — and the subsequent
      // backfill UPDATEs populate it incrementally.
      await db.run(
        `CREATE INDEX IF NOT EXISTS idx_embeddings_vec_hnsw
         ON embeddings USING hnsw (embedding_vec vector_cosine_ops)
         WHERE embedding_dimension = 1536`,
      );

      // 2. Copy existing 1536-dim TEXT vectors into embedding_vec, batched via
      //    keyset pagination on id so skipped (degenerate) rows aren't re-scanned.
      const BATCH = 500;
      let lastId = '';
      let migrated = 0;
      let scanned = 0;
      for (;;) {
        const rows = (await db.all(
          `SELECT id, embedding FROM embeddings
           WHERE embedding_dimension = 1536 AND embedding_vec IS NULL AND id > ?
           ORDER BY id LIMIT ?`,
          lastId, BATCH,
        )) as Array<{ id: string; embedding: string }>;
        if (rows.length === 0) break;
        for (const r of rows) {
          lastId = r.id;
          scanned++;
          try {
            const vec = JSON.parse(r.embedding) as number[];
            if (!Array.isArray(vec) || vec.length !== 1536 || isZeroVector(vec)) continue;
            await db.run('UPDATE embeddings SET embedding_vec = ?::vector WHERE id = ?', `[${vec.join(',')}]`, r.id);
            migrated++;
          } catch {
            // Unparseable TEXT embedding — skip; the cursor still advances.
          }
        }
        if (rows.length < BATCH) break;
      }

      // Drop the cached VectorStoreAdapter singleton so the next request re-probes
      // and picks up the now-present column/index without a server restart.
      resetVectorStore();

      res.json({ success: true, scanned, migrated });
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

  // ── GET /provider — Active vs pinned embedding provider ──────────────────
  // The pin (app_settings embedding_provider / embedding_model /
  // embedding_dimension) is what this instance's vectors were produced with;
  // `active` is what the environment resolves to now. `rows` counts the
  // embeddings table per (model, dimension) so a mismatch is visible as data,
  // not just as a flag.

  router.get('/provider', async (_req, res) => {
    try {
      const adapter = getEmbeddingAdapter();
      const status = await checkEmbeddingPin(db, adapter);
      const rows = await countEmbeddingRowsByModel(db);
      const mismatched = mismatchedGroups(rows, status.active);
      res.json({
        active: status.active,
        pinned: status.pinned,
        mismatch: status.mismatch,
        rows,
        totalRows: rows.reduce((n, r) => n + r.count, 0),
        mismatchedRows: mismatched.reduce((n, r) => n + r.count, 0),
        mismatchedGroups: mismatched,
      });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /reembed-mismatched — Re-embed rows from another provider ───────
  // Admin (solo: anyone). Body { dryRun?: boolean (default TRUE), limit?: number
  // (≤ 1000, default 200), batchSize?: number (≤ 100, default 25) }. A dry run
  // only counts. A real run re-embeds up to `limit` rows whose model or
  // dimension differ from the active adapter, in batches, storing each new
  // vector under the active model (a new row — the unique key includes the
  // model) and deleting the old row once the new one is in. A row whose embed
  // fails (zero vector) is left as it was and counted under `failed`. When no
  // mismatched row remains the pin follows the active adapter.

  router.post('/reembed-mismatched', requireAdminOrSolo, async (req, res) => {
    try {
      const body = (req.body ?? {}) as { dryRun?: unknown; limit?: unknown; batchSize?: unknown };
      const dryRun = body.dryRun !== false;
      const limit = clampInt(body.limit, REEMBED_DEFAULT_LIMIT, REEMBED_MAX_LIMIT);
      const batchSize = clampInt(body.batchSize, REEMBED_DEFAULT_BATCH, REEMBED_MAX_BATCH);

      const adapter = getEmbeddingAdapter();
      const status = await checkEmbeddingPin(db, adapter);
      const groups = mismatchedGroups(await countEmbeddingRowsByModel(db), status.active);
      const mismatchedRows = groups.reduce((n, r) => n + r.count, 0);

      if (dryRun) {
        return res.json({
          dryRun: true,
          active: status.active,
          pinned: status.pinned,
          mismatch: status.mismatch,
          mismatchedRows,
          mismatchedGroups: groups,
          wouldReembed: Math.min(limit, mismatchedRows),
          limit,
          batchSize,
        });
      }

      const store = getVectorStore(db);
      const rows = await db.all<{
        id: string; content_type: string; content_id: string; content_text: string;
        embedding_model: string; metadata: string | null;
      }>(
        `SELECT id, content_type, content_id, content_text, embedding_model, metadata
           FROM embeddings
          WHERE embedding_model <> ? OR embedding_dimension <> ?
          ORDER BY id
          LIMIT ?`,
        status.active.model, status.active.dimension, limit,
      );

      let reembedded = 0;
      let failed = 0;
      let skipped = 0;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize).filter((r) => {
          if (r.content_text?.trim()) return true;
          skipped++;
          return false;
        });
        if (batch.length === 0) continue;
        const vectors = await adapter.embedBatch(batch.map((r) => r.content_text));
        for (let j = 0; j < batch.length; j++) {
          const row = batch[j];
          const vector = vectors[j];
          if (!vector || isZeroVector(vector)) { failed++; continue; }
          let metadata: Record<string, unknown> = {};
          try { metadata = JSON.parse(row.metadata || '{}') as Record<string, unknown>; } catch { /* keep {} */ }
          await store.store({
            contentType: row.content_type,
            contentId: row.content_id,
            contentText: row.content_text,
            vector,
            model: adapter.model,
            metadata,
          });
          // The old row only — the new one carries the active model.
          await db.run('DELETE FROM embeddings WHERE id = ? AND embedding_model <> ?', row.id, adapter.model);
          reembedded++;
        }
      }

      const remaining = await countMismatchedEmbeddingRows(db, status.active);
      let repinned = false;
      if (remaining === 0 && (status.mismatch || status.pinned === null)) {
        await repinToActive(db, adapter);
        repinned = true;
      }

      res.json({
        dryRun: false,
        active: status.active,
        scanned: rows.length,
        reembedded,
        failed,
        skipped,
        remaining,
        repinned,
        limit,
        batchSize,
      });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /feedback/:sessionId — Retrieval feedback for a session ──────────
  // Wave 4: `?messageId=` narrows to the atoms injected into ONE answer
  // (retrieval_feedback.message_id, migration 275), so the thumbs under an
  // answer rate what went into that answer and not the whole session.

  router.get('/feedback/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const messageId = typeof req.query.messageId === 'string' && req.query.messageId.trim()
        ? req.query.messageId.trim()
        : null;
      // Finding #3: db.get returns a single row (or undefined), but this endpoint
      // returns a LIST of injected atoms. db.get cast to an array meant injectedAtoms
      // was one object and total was undefined; with no rows, db.get → undefined and
      // `rows.length` threw → 500. db.all returns the array the UI (OutputToolbar /
      // InjectedAtomsPanel) iterates, and [] for an empty session (no 500).
      // Team mode: only the caller's own session. Another user's session answers
      // exactly like one nobody injected into — an empty list — so the id is no
      // oracle. It used to return that session's injected atoms, content included.
      const own = ownSessionRowsSql(req, 'rf.session_id');
      const where = (messageId ? 'WHERE rf.session_id = ? AND rf.message_id = ?' : 'WHERE rf.session_id = ?') + own.sql;
      const params = [...(messageId ? [sessionId, messageId] : [sessionId]), ...own.params];
      const rows = await db.all(`SELECT rf.atom_id, rf.retrieval_method, rf.retrieval_score, rf.injected_at, rf.was_relevant, rf.message_id,
                ka.content, ka.atom_type, ka.category, ka.confidence
         FROM retrieval_feedback rf
         LEFT JOIN knowledge_atoms ka ON ka.id = rf.atom_id
         ${where}
         ORDER BY rf.retrieval_score DESC`
      , ...params) as Array<{
        atom_id: string; retrieval_method: string; retrieval_score: number;
        injected_at: string; was_relevant: number | null; message_id: string | null;
        content: string; atom_type: string; category: string; confidence: number;
      }>;

      res.json({ sessionId, messageId, injectedAtoms: rows, total: rows.length });
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

      // Ratings steer what every later run injects (the atom gate, the stale rule),
      // so only the session's owner may rate its atoms. Someone else's session is
      // the same 404 as a row that does not exist.
      const own = ownSessionRowsSql(req, 'retrieval_feedback.session_id');
      const result = await db.run(
        `UPDATE retrieval_feedback SET was_relevant = ? WHERE atom_id = ? AND session_id = ?${own.sql}`,
        wasRelevant ? 1 : 0, atomId, sessionId, ...own.params
      );

      if (result.changes === 0) {
        return res.status(404).json({ error: 'No matching feedback row found' });
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /feedback/bulk — One-tap rating for ALL injected atoms ─────────
  // Wave 3.3: the OutputToolbar footer's "Prior knowledge used (N) — helpful?"
  // valve. One 👍/👎 rates every atom injected into the session in a single
  // tap (retrieval_feedback rows are session-scoped — they carry no message
  // linkage — so "for that message" resolves to the session's injected set).
  // The InjectedAtomsPanel stays for per-atom rating and can overwrite this.

  router.post('/feedback/bulk', async (req, res) => {
    try {
      const { sessionId, wasRelevant } = req.body as {
        sessionId?: string;
        wasRelevant?: boolean;
      };

      if (!sessionId || typeof wasRelevant !== 'boolean') {
        return res.status(400).json({ error: 'sessionId and wasRelevant (boolean) are required' });
      }

      // Same owner rule as POST /feedback: another user's session updates nothing,
      // exactly like a session with no injected atoms.
      const own = ownSessionRowsSql(req, 'retrieval_feedback.session_id');
      const result = await db.run(
        `UPDATE retrieval_feedback SET was_relevant = ? WHERE session_id = ?${own.sql}`,
        wasRelevant ? 1 : 0, sessionId, ...own.params
      );

      res.json({ success: true, updated: result.changes ?? 0 });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /similar — Find similar content ────────────────────────────────

  router.post('/similar', async (req, res) => {
    try {
      const { contentType, contentId, topK: rawTopK } = req.body as {
        contentType: string; contentId: string; topK?: unknown;
      };
      if (!contentType || !contentId) return res.status(400).json({ error: 'contentType and contentId required' });
      const topK = clampInt(rawTopK, 5, MAX_TOP_K);

      // contentType comes from the request body, so this one can name any owned type
      // (session_output, knowledge_atom, rag_chunk, checkpoint). Request-derived scope,
      // not INSTANCE_WIDE_SEARCH: findSimilar scopes the SEED as well as the results
      // (and over-fetches when scoped), which is what stops a caller pointing at someone
      // else's output, document chunk or decision and mining its neighbours — and any
      // seed at all (a module id, one's own atom) returning a colleague's uploaded
      // document text as a neighbour. The route makes both checks once more on exactly
      // what it answers with, so a foreign seed is the same empty answer as an unknown
      // id whatever the service does. Solo and admins: instance scope, no-ops.
      const scope = searchScopeForRequest(req);
      const seed = [{ content_type: contentType, content_id: contentId }];
      if ((await filterOwnedByScope(db, seed, scope)).length === 0) {
        return res.json({ results: [], total: 0 });
      }
      const results = await filterOwnedByScope(db, await findSimilar(db, { contentType, contentId, topK, scope }), scope);

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
