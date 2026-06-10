import { Router } from 'express';
import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';
import { getClient } from '../services/claude-client.js';
import { createAtomExtractor } from '../services/atom-extractor.js';
import { createOutputStore } from '../services/output-store.js';

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

  // ── GET /api/knowledge/atoms/:id ─────────────────────────────────────────
  router.get('/knowledge/atoms/:id', async (req, res) => {
    try {
      const atom = (await getExtractor()).getAtomDetail(req.params.id);
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
      const atoms = (await getExtractor()).getAtomsByEntity(type, id);
      const connections = (await getExtractor()).getEntityConnections(type, id);
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
      const distribution = (await getOutputStore()).getDecisionDistribution(req.params.workflowId, stepIndex);
      res.json({ workflow_id: req.params.workflowId, step_index: stepIndex, distribution });
    } catch (err) {
      console.error('[knowledge/decisions/distribution GET]', err);
      res.status(500).json({ error: 'Failed to fetch decision distribution' });
    }
  });

  // ── POST /api/knowledge/outputs ──────────────────────────────────────────
  // Store a workflow step output (called by workflow execution engine)
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

      // Trigger atom extraction asynchronously — does not block the response
      (await getExtractor()).extractAtoms(outputId).catch(e =>
        console.error('[knowledge/outputs] atom extraction failed (non-fatal):', e)
      );

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

      const decisionId = (await getOutputStore()).storeCheckpointDecision({
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
