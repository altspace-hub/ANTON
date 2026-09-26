import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { createInstitutionalMemory } from '../services/institutional-memory.js';
import { ownerFilter } from '../middleware/ownership.js';

/** Rows one history read may return, and the ceiling a caller can ask for. */
const HISTORY_DEFAULT_LIMIT = 20;
const HISTORY_MAX_LIMIT = 200;
/** Similar decisions one call may return. */
const SIMILAR_DEFAULT_LIMIT = 10;
const SIMILAR_MAX_LIMIT = 50;
/** Clusters one call may ask for. */
const CLUSTERS_DEFAULT = 5;
const CLUSTERS_MAX = 20;

/** A positive integer from a query/body value, clamped to `max`; `fallback` when absent or invalid. */
function clampInt(v: unknown, fallback: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
}

// Checkpoint decisions are strictly their decider's (checkpoint_decisions.
// decided_by): a decision's reasoning and context snapshot are that person's.
// Every read below is scoped with ownerFilter(req, 'decided_by') — empty for solo
// and admins, the caller's own decisions for a team-mode non-admin — the rule
// /api/knowledge/decisions and /api/embeddings/search/decisions already apply.
// Until 2026-09-23 this file was their unscoped twin: every user's decisions for
// anyone, an uncapped limit, and a decided_by taken from the request body.
export async function createMemoryRoutes(db: DatabaseAdapter) {
  const router = Router();
  const memory = await createInstitutionalMemory(db);

  // POST /api/memory/checkpoints
  // Save a new checkpoint decision
  router.post('/memory/checkpoints', async (req, res) => {
    try {
      const {
        executionId,
        workflowId,
        stepIndex,
        aiRecommendation,
        aiConfidence,
        humanDecision,
        humanReasoning,
        isOverride,
        overrideCategory,
        contextSnapshot,
      } = req.body;

      // The decider is whoever is signed in — never a name from the body, which
      // let one user plant a decision attributed to a colleague (and, under the
      // strictly-own read rule, into that colleague's decision lists and search).
      // A body `decidedBy` is ignored, so existing clients keep working.
      const decidedBy = req.user?.id;
      if (!decidedBy) return res.status(401).json({ error: 'Authentication required' });

      if (!executionId || !workflowId || stepIndex === undefined || !humanDecision) {
        return res.status(400).json({
          error: 'Missing required fields: executionId, workflowId, stepIndex, humanDecision',
        });
      }

      const id = await memory.saveCheckpointDecision({
        executionId,
        workflowId,
        stepIndex,
        aiRecommendation,
        aiConfidence,
        humanDecision,
        humanReasoning,
        isOverride,
        overrideCategory,
        contextSnapshot,
        decidedBy,
      });

      return res.json({ id, message: 'Checkpoint decision saved successfully' });
    } catch (err) {
      console.error('[memory] saveCheckpointDecision error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to save checkpoint decision.' });
    }
  });

  // PUT /api/memory/checkpoints/:id/feedback
  // Add user feedback (thumbs up/down) to a checkpoint decision
  router.put('/memory/checkpoints/:id/feedback', async (req, res) => {
    try {
      const { id } = req.params;
      const { feedback } = req.body;

      if (feedback !== 1 && feedback !== -1) {
        return res.status(400).json({ error: 'Feedback must be 1 (thumbs up) or -1 (thumbs down)' });
      }

      // Owner check inside the UPDATE, and awaited (it used to be neither): a
      // colleague's decision is the same 404 as one that does not exist.
      const updated = await memory.addFeedback(id, feedback, ownerFilter(req, 'decided_by'));
      if (!updated) return res.status(404).json({ error: 'Checkpoint decision not found' });

      return res.json({ message: 'Feedback recorded successfully' });
    } catch (err) {
      console.error('[memory] addFeedback error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to record feedback.' });
    }
  });

  // GET /api/memory/checkpoints
  // Get checkpoint decision history
  // Query params: ?workflowId=workflow123&stepIndex=0&decidedBy=user123&limit=20
  router.get('/memory/checkpoints', async (req, res) => {
    try {
      const workflowId = req.query.workflowId as string | undefined;
      const stepIndex = req.query.stepIndex ? parseInt(req.query.stepIndex as string, 10) : undefined;
      // decidedBy stays a filter; on a team server it can only narrow the caller's own rows.
      const decidedBy = req.query.decidedBy as string | undefined;
      const limit = clampInt(req.query.limit, HISTORY_DEFAULT_LIMIT, HISTORY_MAX_LIMIT);

      const history = await memory.getCheckpointHistory({
        workflowId,
        stepIndex,
        decidedBy,
        limit,
      }, ownerFilter(req, 'decided_by'));

      return res.json(history);
    } catch (err) {
      console.error('[memory] getCheckpointHistory error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to retrieve checkpoint history.' });
    }
  });

  // POST /api/memory/checkpoints/similar
  // Find semantically similar checkpoint decisions
  // Body: { decisionText, context?, reasoning?, workflowId?, decidedBy?, limit?, minSimilarity? }
  router.post('/memory/checkpoints/similar', async (req, res) => {
    try {
      const {
        decisionText,
        context,
        reasoning,
        workflowId,
        decidedBy,
        limit,
        minSimilarity,
      } = req.body;

      if (!decisionText) {
        return res.status(400).json({ error: 'Missing required field: decisionText' });
      }

      const similar = await memory.getSimilarDecisions({
        decisionText,
        context,
        reasoning,
        workflowId,
        decidedBy,
        limit: clampInt(limit, SIMILAR_DEFAULT_LIMIT, SIMILAR_MAX_LIMIT),
        minSimilarity,
      }, ownerFilter(req, 'decided_by'));

      return res.json({ decisions: similar });
    } catch (err) {
      console.error('[memory] getSimilarDecisions error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to retrieve similar decisions.' });
    }
  });

  // GET /api/memory/clusters
  // Generate decision clusters for pattern analysis
  // Query params: ?workflowId=workflow123&decidedBy=user123&numClusters=5
  router.get('/memory/clusters', async (req, res) => {
    try {
      const workflowId = req.query.workflowId as string | undefined;
      const decidedBy = req.query.decidedBy as string | undefined;
      const numClusters = clampInt(req.query.numClusters, CLUSTERS_DEFAULT, CLUSTERS_MAX);

      const clusters = await memory.generateDecisionClusters({
        workflowId,
        decidedBy,
        numClusters,
      }, ownerFilter(req, 'decided_by'));

      return res.json({ clusters });
    } catch (err) {
      console.error('[memory] generateDecisionClusters error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to generate decision clusters.' });
    }
  });

  // GET /api/memory/insights
  // Get insight summary for checkpoint decisions
  // Query params: ?workflowId=workflow123&decidedBy=user123
  router.get('/memory/insights', async (req, res) => {
    try {
      const workflowId = req.query.workflowId as string | undefined;
      const decidedBy = req.query.decidedBy as string | undefined;

      const insights = await memory.getInsightSummary({
        workflowId,
        decidedBy,
      }, ownerFilter(req, 'decided_by'));

      return res.json(insights);
    } catch (err) {
      console.error('[memory] getInsightSummary error:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to retrieve insights.' });
    }
  });

  return router;
}
