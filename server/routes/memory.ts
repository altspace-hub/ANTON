import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { createInstitutionalMemory } from '../services/institutional-memory.js';

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
        decidedBy,
      } = req.body;

      if (!executionId || !workflowId || stepIndex === undefined || !humanDecision || !decidedBy) {
        return res.status(400).json({
          error: 'Missing required fields: executionId, workflowId, stepIndex, humanDecision, decidedBy',
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
      console.error('[memory] saveCheckpointDecision error:', err);
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

      memory.addFeedback(id, feedback);

      return res.json({ message: 'Feedback recorded successfully' });
    } catch (err) {
      console.error('[memory] addFeedback error:', err);
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
      const decidedBy = req.query.decidedBy as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const history = memory.getCheckpointHistory({
        workflowId,
        stepIndex,
        decidedBy,
        limit,
      });

      return res.json(history);
    } catch (err) {
      console.error('[memory] getCheckpointHistory error:', err);
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
        limit,
        minSimilarity,
      });

      return res.json({ decisions: similar });
    } catch (err) {
      console.error('[memory] getSimilarDecisions error:', err);
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
      const numClusters = req.query.numClusters
        ? parseInt(req.query.numClusters as string, 10)
        : 5;

      const clusters = await memory.generateDecisionClusters({
        workflowId,
        decidedBy,
        numClusters,
      });

      return res.json({ clusters });
    } catch (err) {
      console.error('[memory] generateDecisionClusters error:', err);
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

      const insights = memory.getInsightSummary({
        workflowId,
        decidedBy,
      });

      return res.json(insights);
    } catch (err) {
      console.error('[memory] getInsightSummary error:', err);
      return res.status(500).json({ error: 'Failed to retrieve insights.' });
    }
  });

  return router;
}
