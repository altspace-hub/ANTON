import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';
import { getClient } from '../services/claude-client.js';
import { createAtomExtractor } from '../services/atom-extractor.js';
import { createOutputStore } from '../services/output-store.js';
import { safeError } from '../lib/error-response.js';
import { requireAuth } from '../middleware/role-guards.js';
import { scopesToOwner } from '../middleware/ownership.js';

// ── Atom lifecycle (Wave 4, 2026-09-17) ─────────────────────────────────────
//
// Until this, nothing could supersede, retire or delete an atom: real client
// and person names sat in knowledge_atoms with no erasure path, and a wrong
// atom kept being injected as evidence. These statements are exported so a
// test can answer them by identity and tests/db/query-column-drift.test.ts
// can run them against a real schema.

/** Longest free-text reason stored in deactivated_reason. */
const REASON_MAX_CHARS = 200;
/** Shortest data-subject query — three characters keeps "AB" from matching half the table. */
export const SUBJECT_QUERY_MIN_CHARS = 3;
/** Rows a subject search returns; the total is counted separately. */
const SUBJECT_SEARCH_LIMIT = 200;

export const ATOM_LIFECYCLE_SQL = {
  /** Params: atom id. The columns an ownership check needs and nothing else. */
  ownerRow: 'SELECT id, owner_user_id, is_active FROM knowledge_atoms WHERE id = ?',
  /** Params: atom id. */
  detail: 'SELECT * FROM knowledge_atoms WHERE id = ?',
  /** Params: superseded_by, atom id. */
  supersede: "UPDATE knowledge_atoms SET superseded_by = ?, is_active = 0, deactivated_at = NOW(), deactivated_reason = 'superseded' WHERE id = ?",
  /** Params: reason, atom id. */
  deactivate: 'UPDATE knowledge_atoms SET is_active = 0, deactivated_at = NOW(), deactivated_reason = ? WHERE id = ?',
  /** Params: atom id. */
  reactivate: 'UPDATE knowledge_atoms SET is_active = 1, deactivated_at = NULL, deactivated_reason = NULL, superseded_by = NULL WHERE id = ?',
  /** The hard-delete cascade, in order. Params for each: atom id (the relationships statement takes it twice). */
  deleteEntityRefs: 'DELETE FROM knowledge_entity_refs WHERE atom_id = ?',
  deleteRelationships: 'DELETE FROM atom_relationships WHERE from_atom_id = ? OR to_atom_id = ?',
  deleteRetrievalFeedback: 'DELETE FROM retrieval_feedback WHERE atom_id = ?',
  deleteEmbeddings: "DELETE FROM embeddings WHERE content_type = 'knowledge_atom' AND content_id = ?",
  clearSupersededBy: 'UPDATE knowledge_atoms SET superseded_by = NULL WHERE superseded_by = ?',
  deleteAtom: 'DELETE FROM knowledge_atoms WHERE id = ?',
  /**
   * The data-subject match: content ILIKE the query, or an entity ref whose
   * name ILIKE the query. `scope` is the owner filter (empty, or an AND on
   * a.owner_user_id) — see subjectScope(). Params: pattern, pattern (+ scope).
   */
  subjectWhere: (scope: string): string =>
    `FROM knowledge_atoms a
     WHERE (a.content ILIKE ? OR EXISTS (SELECT 1 FROM knowledge_entity_refs er WHERE er.atom_id = a.id AND er.entity_name ILIKE ?))${scope}`,
  subjectRows: (scope: string): string =>
    `SELECT a.id, a.content, a.source_module_id, a.created_at, a.is_active, a.owner_user_id
     ${ATOM_LIFECYCLE_SQL.subjectWhere(scope)}
     ORDER BY a.created_at DESC
     LIMIT ${SUBJECT_SEARCH_LIMIT}`,
  subjectCount: (scope: string): string =>
    `SELECT COUNT(*) AS total ${ATOM_LIFECYCLE_SQL.subjectWhere(scope)}`,
  subjectIds: (scope: string): string =>
    `SELECT a.id ${ATOM_LIFECYCLE_SQL.subjectWhere(scope)} ORDER BY a.created_at DESC`,
  /** The fragment subjectScope() appends for a non-admin in team mode. Params: user id. */
  ownerScope: ' AND (a.owner_user_id IS NULL OR a.owner_user_id = ?)',
} as const;

interface AtomOwnerRow { id: string; owner_user_id: string | null; is_active: number }

/** `%` and `_` in a name are letters to the person searching, not wildcards. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * In team mode a non-admin only sees and touches atoms that are theirs or
 * unowned (pre-275 rows have no owner). Solo and admins are unscoped — the
 * same rule as middleware/ownership.ts.
 */
function subjectScope(req: Request): { sql: string; params: string[] } {
  if (!scopesToOwner(req)) return { sql: '', params: [] };
  const userId = req.user?.id;
  if (!userId) return { sql: ' AND 1=0', params: [] };
  return { sql: ATOM_LIFECYCLE_SQL.ownerScope, params: [userId] };
}

function subjectQuery(v: unknown): string | null {
  const q = typeof v === 'string' ? v.trim() : '';
  return q.length >= SUBJECT_QUERY_MIN_CHARS ? q : null;
}

export async function createKnowledgeRoutes(db: DatabaseAdapter) {
  const router = Router();

  // Lazily initialised service instances (shared across requests)
  let extractor: Awaited<ReturnType<typeof createAtomExtractor>> | null = null;
  let outputStore: Awaited<ReturnType<typeof createOutputStore>> | null = null;

  async function getExtractor() {
    if (!extractor) extractor = await createAtomExtractor(db, getClient());
    return extractor;
  }

  async function getOutputStore() {
    if (!outputStore) outputStore = await createOutputStore(db);
    return outputStore;
  }

  /**
   * Load the atom a mutation targets, or answer 404 and return null. A row
   * that exists but belongs to someone else is ALSO a 404 — a 403 would turn
   * an id into an oracle for other tenants' atoms (ownership.ts, property 1).
   */
  async function loadMutableAtom(req: Request, res: Response, id: string): Promise<AtomOwnerRow | null> {
    const atom = await db.get<AtomOwnerRow>(ATOM_LIFECYCLE_SQL.ownerRow, id);
    const foreign = atom !== undefined && scopesToOwner(req)
      && atom.owner_user_id !== null && atom.owner_user_id !== req.user?.id;
    if (!atom || foreign) {
      res.status(404).json({ error: 'Atom not found' });
      return null;
    }
    return atom;
  }

  /** The hard delete, with everything that hangs off the atom. Runs inside the caller's transaction. */
  async function deleteAtomCascade(tx: DatabaseAdapter, id: string): Promise<void> {
    await tx.run(ATOM_LIFECYCLE_SQL.deleteEntityRefs, id);
    await tx.run(ATOM_LIFECYCLE_SQL.deleteRelationships, id, id);
    await tx.run(ATOM_LIFECYCLE_SQL.deleteRetrievalFeedback, id);
    await tx.run(ATOM_LIFECYCLE_SQL.deleteEmbeddings, id);
    await tx.run(ATOM_LIFECYCLE_SQL.clearSupersededBy, id);
    await tx.run(ATOM_LIFECYCLE_SQL.deleteAtom, id);
  }

  // ── GET /api/knowledge/atoms ─────────────────────────────────────────────
  // Query params: q, area, type, entity_type, entity_id, since
  router.get('/knowledge/atoms', async (req, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const area = typeof req.query.area === 'string' ? req.query.area : undefined;
      const type = typeof req.query.type === 'string' ? req.query.type : undefined;
      const entityType = typeof req.query.entity_type === 'string' ? req.query.entity_type : undefined;
      const entityId = typeof req.query.entity_id === 'string' ? req.query.entity_id : undefined;
      const sinceStr = typeof req.query.since === 'string' ? req.query.since : undefined;

      const since = sinceStr ? new Date(sinceStr) : undefined;

      const atoms = await (await getExtractor()).searchAtoms(q, {
        areaId: area,
        atomType: type,
        entityType,
        entityId,
        since,
      });

      res.json({ atoms, total: atoms.length });
    } catch (err) {
      console.error('[knowledge/atoms GET]', err);
      res.status(500).json({ error: 'Failed to search atoms' });
    }
  });

  // ── POST /api/knowledge/atoms — save a manual atom ───────────────────────
  // Used by Pathfinder's Smart Action Bar ("save_knowledge") to persist a
  // finding into the knowledge memory. Follows the synthetic-source pattern
  // from atlas-knowledge-bridge (source_workflow_id is NOT NULL but manual
  // atoms have no workflow, so the origin surface is used as the identifier).
  router.post('/knowledge/atoms', async (req, res) => {
    try {
      const { content, title, sourceUrl, query, searchId } = req.body as {
        content?: string; title?: string; sourceUrl?: string; query?: string; searchId?: string;
      };
      if (!content || typeof content !== 'string' || !content.trim()) {
        res.status(400).json({ error: 'content is required' });
        return;
      }

      const id = `kna_${randomUUID().slice(0, 12)}`;
      const tags = JSON.stringify([
        'pathfinder',
        ...(typeof sourceUrl === 'string' && sourceUrl ? [`source:${sourceUrl.slice(0, 200)}`] : []),
        ...(typeof query === 'string' && query ? [`query:${query.slice(0, 120)}`] : []),
      ]);
      const trimmedTitle = typeof title === 'string' ? title.trim() : '';
      const text = trimmedTitle && !content.trim().startsWith(trimmedTitle)
        ? `${trimmedTitle} — ${content.trim()}`
        : content.trim();

      await db.run(
        `INSERT INTO knowledge_atoms
          (id, source_workflow_id, source_execution_id, source_module_id,
           content, atom_type, confidence, category, tags, created_at)
         VALUES (?, 'pathfinder', ?, 'pathfinder', ?, 'observation.finding', 0.8, 'observation', ?, NOW())`,
        id,
        typeof searchId === 'string' && searchId ? searchId : 'manual',
        text.slice(0, 2000),
        tags,
      );

      res.status(201).json({ id });
    } catch (err) {
      console.error('[knowledge/atoms POST]', err);
      res.status(500).json({ error: 'Failed to save knowledge atom' });
    }
  });

  // ── GET /api/knowledge/atoms/subject-search?q= ───────────────────────────
  // The data-subject lookup: every atom whose content or entity name mentions
  // the query. Registered BEFORE /knowledge/atoms/:id so the literal path is
  // not captured as an id.
  router.get('/knowledge/atoms/subject-search', requireAuth, async (req, res) => {
    try {
      const q = subjectQuery(req.query.q);
      if (!q) {
        res.status(400).json({ error: `q must be at least ${SUBJECT_QUERY_MIN_CHARS} characters` });
        return;
      }
      const pattern = likePattern(q);
      const scope = subjectScope(req);
      const atoms = await db.all<{
        id: string; content: string; source_module_id: string | null; created_at: string;
        is_active: number; owner_user_id: string | null;
      }>(ATOM_LIFECYCLE_SQL.subjectRows(scope.sql), pattern, pattern, ...scope.params);
      const count = await db.get<{ total: number | string }>(ATOM_LIFECYCLE_SQL.subjectCount(scope.sql), pattern, pattern, ...scope.params);
      res.json({ q, atoms, total: Number(count?.total ?? atoms.length) });
    } catch (err) {
      console.error('[knowledge/atoms/subject-search GET]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── DELETE /api/knowledge/atoms/by-subject ───────────────────────────────
  // Erasure for a data subject. dryRun defaults to TRUE: the caller sees the
  // ids and count first and must send dryRun:false to delete. Registered
  // before /knowledge/atoms/:id for the same reason as subject-search.
  router.delete('/knowledge/atoms/by-subject', requireAuth, async (req, res) => {
    try {
      const body = (req.body ?? {}) as { q?: unknown; dryRun?: unknown };
      const q = subjectQuery(body.q);
      if (!q) {
        res.status(400).json({ error: `q must be at least ${SUBJECT_QUERY_MIN_CHARS} characters` });
        return;
      }
      const dryRun = body.dryRun !== false;
      const pattern = likePattern(q);
      const scope = subjectScope(req);
      const rows = await db.all<{ id: string }>(ATOM_LIFECYCLE_SQL.subjectIds(scope.sql), pattern, pattern, ...scope.params);
      const ids = rows.map((r) => r.id);

      if (dryRun) {
        res.json({ dryRun: true, count: ids.length, ids });
        return;
      }

      await db.transaction(async (tx) => {
        for (const id of ids) await deleteAtomCascade(tx, id);
      });
      for (const id of ids) console.log(`[knowledge/atoms] delete ${id} (by-subject)`);
      res.json({ dryRun: false, deleted: ids.length, ids });
    } catch (err) {
      console.error('[knowledge/atoms/by-subject DELETE]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /api/knowledge/atoms/:id ─────────────────────────────────────────
  router.get('/knowledge/atoms/:id', async (req, res) => {
    try {
      const atom = await (await getExtractor()).getAtomDetail(req.params.id);
      if (!atom) {
        res.status(404).json({ error: 'Atom not found' });
        return;
      }
      res.json(atom);
    } catch (err) {
      console.error('[knowledge/atoms/:id GET]', err);
      res.status(500).json({ error: 'Failed to fetch atom' });
    }
  });

  // ── PATCH /api/knowledge/atoms/:id ───────────────────────────────────────
  // { supersededBy?: string; isActive?: boolean }. Superseding retires the
  // atom in favour of another; isActive alone retires or restores it.
  router.patch('/knowledge/atoms/:id', requireAuth, async (req, res) => {
    try {
      const id = String(req.params.id);
      const body = (req.body ?? {}) as { supersededBy?: unknown; isActive?: unknown };
      const supersededBy = typeof body.supersededBy === 'string' && body.supersededBy.trim() ? body.supersededBy.trim() : undefined;
      const isActive = typeof body.isActive === 'boolean' ? body.isActive : undefined;
      if (supersededBy === undefined && isActive === undefined) {
        res.status(400).json({ error: 'Provide supersededBy (atom id) or isActive (boolean)' });
        return;
      }
      if (supersededBy === id) {
        res.status(400).json({ error: 'An atom cannot supersede itself' });
        return;
      }
      if (!(await loadMutableAtom(req, res, id))) return;

      let action: string;
      if (supersededBy !== undefined) {
        const successor = await db.get<AtomOwnerRow>(ATOM_LIFECYCLE_SQL.ownerRow, supersededBy);
        if (!successor) {
          res.status(400).json({ error: 'supersededBy does not name an existing atom' });
          return;
        }
        await db.run(ATOM_LIFECYCLE_SQL.supersede, supersededBy, id);
        action = `supersede by ${supersededBy}`;
      } else if (isActive === false) {
        await db.run(ATOM_LIFECYCLE_SQL.deactivate, 'manual', id);
        action = 'deactivate';
      } else {
        await db.run(ATOM_LIFECYCLE_SQL.reactivate, id);
        action = 'reactivate';
      }
      console.log(`[knowledge/atoms] ${action} ${id}`);
      res.json({ atom: await db.get(ATOM_LIFECYCLE_SQL.detail, id) });
    } catch (err) {
      console.error('[knowledge/atoms/:id PATCH]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /api/knowledge/atoms/:id/deactivate ─────────────────────────────
  router.post('/knowledge/atoms/:id/deactivate', requireAuth, async (req, res) => {
    try {
      const id = String(req.params.id);
      const body = (req.body ?? {}) as { reason?: unknown };
      const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, REASON_MAX_CHARS) : 'manual';
      if (!(await loadMutableAtom(req, res, id))) return;
      await db.run(ATOM_LIFECYCLE_SQL.deactivate, reason, id);
      console.log(`[knowledge/atoms] deactivate ${id}`);
      res.json({ atom: await db.get(ATOM_LIFECYCLE_SQL.detail, id) });
    } catch (err) {
      console.error('[knowledge/atoms/:id/deactivate POST]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /api/knowledge/atoms/:id/reactivate ─────────────────────────────
  router.post('/knowledge/atoms/:id/reactivate', requireAuth, async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await loadMutableAtom(req, res, id))) return;
      await db.run(ATOM_LIFECYCLE_SQL.reactivate, id);
      console.log(`[knowledge/atoms] reactivate ${id}`);
      res.json({ atom: await db.get(ATOM_LIFECYCLE_SQL.detail, id) });
    } catch (err) {
      console.error('[knowledge/atoms/:id/reactivate POST]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── DELETE /api/knowledge/atoms/:id ──────────────────────────────────────
  // Hard delete: the atom, its entity refs, its relationships in both
  // directions, its retrieval feedback and its embedding rows, in one
  // transaction. Erasure, not retirement — use deactivate to keep the record.
  router.delete('/knowledge/atoms/:id', requireAuth, async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!(await loadMutableAtom(req, res, id))) return;
      await db.transaction((tx) => deleteAtomCascade(tx, id));
      console.log(`[knowledge/atoms] delete ${id}`);
      res.json({ deleted: true, id });
    } catch (err) {
      console.error('[knowledge/atoms/:id DELETE]', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /api/knowledge/atoms/:id/relationships ─────────────────────────
  router.get('/knowledge/atoms/:id/relationships', async (req, res) => {
    try {
      const atomId = req.params.id;
      const rows = await db.all(`
        SELECT ar.relationship_type, ar.strength, ar.created_at,
               CASE WHEN ar.from_atom_id = ? THEN ar.to_atom_id ELSE ar.from_atom_id END as related_atom_id,
               CASE WHEN ar.from_atom_id = ? THEN 'outgoing' ELSE 'incoming' END as direction,
               ka.content, ka.atom_type, ka.category, ka.confidence
        FROM atom_relationships ar
        JOIN knowledge_atoms ka ON ka.id = CASE WHEN ar.from_atom_id = ? THEN ar.to_atom_id ELSE ar.from_atom_id END
        WHERE (ar.from_atom_id = ? OR ar.to_atom_id = ?) AND ka.is_active = 1
        ORDER BY ar.strength DESC
      `, atomId, atomId, atomId, atomId, atomId) as Array<{
        relationship_type: string; strength: number; created_at: string;
        related_atom_id: string; direction: string;
        content: string; atom_type: string; category: string; confidence: number;
      }>;

      res.json({ atomId, relationships: rows, total: rows.length });
    } catch (err) {
      console.error('[knowledge/atoms/:id/relationships GET]', err);
      res.status(500).json({ error: 'Failed to fetch atom relationships' });
    }
  });

  // ── GET /api/knowledge/entities/:type/:id ────────────────────────────────
  // Returns all atoms for an entity + its graph connections
  router.get('/knowledge/entities/:type/:id', async (req, res) => {
    try {
      const { type, id } = req.params;
      const atoms = await (await getExtractor()).getAtomsByEntity(type, id);
      const connections = await (await getExtractor()).getEntityConnections(type, id);
      res.json({ entity_type: type, entity_id: id, atoms, connections });
    } catch (err) {
      console.error('[knowledge/entities GET]', err);
      res.status(500).json({ error: 'Failed to fetch entity knowledge' });
    }
  });

  // ── GET /api/knowledge/decisions/:workflowId ─────────────────────────────
  router.get('/knowledge/decisions/:workflowId', async (req, res) => {
    try {
      const limit = Math.min(
        Math.max(parseInt(String(req.query.limit ?? '100'), 10) || 100, 1),
        500
      );
      const decisions = await (await getOutputStore()).getDecisionsForWorkflow(req.params.workflowId, limit);
      res.json({ decisions, total: decisions.length });
    } catch (err) {
      console.error('[knowledge/decisions GET]', err);
      res.status(500).json({ error: 'Failed to fetch decisions' });
    }
  });

  // ── GET /api/knowledge/decisions/:workflowId/:stepIndex/distribution ─────
  router.get('/knowledge/decisions/:workflowId/:stepIndex/distribution', async (req, res) => {
    try {
      const stepIndex = parseInt(req.params.stepIndex, 10);
      if (isNaN(stepIndex)) {
        res.status(400).json({ error: 'Invalid stepIndex' });
        return;
      }
      const distribution = await (await getOutputStore()).getDecisionDistribution(req.params.workflowId, stepIndex);
      res.json({ workflow_id: req.params.workflowId, step_index: stepIndex, distribution });
    } catch (err) {
      console.error('[knowledge/decisions/distribution GET]', err);
      res.status(500).json({ error: 'Failed to fetch decision distribution' });
    }
  });

  // ── POST /api/knowledge/outputs ──────────────────────────────────────────
  // Store a workflow step output (called by workflow execution engine).
  // storeOutput queues the ledgered learning pipeline (summary → atoms) itself;
  // this route used to ALSO call extractAtoms directly, so every output was
  // extracted twice and the second pass raced the first.
  router.post('/knowledge/outputs', async (req, res) => {
    try {
      const {
        executionId, workflowId, stepIndex, stepType,
        areaId, moduleId, connectionId, outputData,
        workflowName, stepName,
      } = req.body as {
        executionId: string; workflowId: string; stepIndex: number; stepType: string;
        areaId?: string; moduleId?: string; connectionId?: string; outputData: unknown;
        workflowName: string; stepName: string;
      };

      if (!executionId || !workflowId || stepIndex === undefined || !stepType || !workflowName || !stepName) {
        res.status(400).json({ error: 'Missing required fields: executionId, workflowId, stepIndex, stepType, workflowName, stepName' });
        return;
      }

      // Resolve user ID from auth context (injected by auth middleware) or fallback
      const userId = (req as unknown as { user?: { id?: string } }).user?.id ?? 'system';

      const outputId = await (await getOutputStore()).storeOutput({
        executionId, workflowId, stepIndex, stepType,
        areaId, moduleId, connectionId, outputData,
        workflowName, stepName, userId,
      });

      res.status(201).json({ id: outputId });
    } catch (err) {
      console.error('[knowledge/outputs POST]', err);
      res.status(500).json({ error: 'Failed to store output' });
    }
  });

  // ── POST /api/knowledge/decisions ────────────────────────────────────────
  // Store a human checkpoint decision
  router.post('/knowledge/decisions', async (req, res) => {
    try {
      const {
        executionId, workflowId, stepIndex,
        aiRecommendation, aiConfidence,
        humanDecision, humanReasoning,
        isOverride, overrideCategory, contextSnapshot,
      } = req.body as {
        executionId: string; workflowId: string; stepIndex: number;
        aiRecommendation?: string; aiConfidence?: number;
        humanDecision: string; humanReasoning?: string;
        isOverride?: boolean; overrideCategory?: string; contextSnapshot?: unknown;
      };

      if (!executionId || !workflowId || stepIndex === undefined || !humanDecision) {
        res.status(400).json({ error: 'Missing required fields: executionId, workflowId, stepIndex, humanDecision' });
        return;
      }

      const userId = (req as unknown as { user?: { id?: string } }).user?.id ?? 'system';

      const decisionId = await (await getOutputStore()).storeCheckpointDecision({
        executionId, workflowId, stepIndex,
        aiRecommendation, aiConfidence,
        humanDecision, humanReasoning,
        isOverride: !!isOverride, overrideCategory, contextSnapshot,
        userId,
      });

      res.status(201).json({ id: decisionId });
    } catch (err) {
      console.error('[knowledge/decisions POST]', err);
      res.status(500).json({ error: 'Failed to store decision' });
    }
  });

  return router;
}
