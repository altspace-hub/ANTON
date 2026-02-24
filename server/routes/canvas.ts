import { Router } from 'express';
import type Database from 'better-sqlite3';
import { createCollaborativeCanvas } from '../services/collaborative-canvas.js';

export function createCanvasRoutes(db: Database.Database) {
  const router = Router();
  const canvas = createCollaborativeCanvas(db);

  function getUserId(req: Parameters<Parameters<typeof router.get>[1]>[0]): string {
    return (req as unknown as { user?: { id?: string } }).user?.id ?? 'default';
  }

  // GET /api/canvas/my-assignments — assignments for current user
  router.get('/canvas/my-assignments', (req, res) => {
    try {
      canvas.refreshOverdueAssignments();
      const userId = getUserId(req);
      const assignments = canvas.getMyAssignments(userId);
      res.json(assignments);
    } catch (err) {
      console.error('[canvas] my-assignments error:', err);
      res.status(500).json({ error: 'Failed to fetch assignments' });
    }
  });

  // GET /api/canvas/executions/:executionId/assignments — all assignments for an execution
  router.get('/canvas/executions/:executionId/assignments', (req, res) => {
    try {
      const { executionId } = req.params;
      const assignments = canvas.getAssignmentsForExecution(executionId);
      res.json(assignments);
    } catch (err) {
      console.error('[canvas] execution assignments error:', err);
      res.status(500).json({ error: 'Failed to fetch execution assignments' });
    }
  });

  // POST /api/canvas/executions/:executionId/assign — assign a step
  router.post('/canvas/executions/:executionId/assign', (req, res) => {
    try {
      const { executionId } = req.params;
      const assignedBy = getUserId(req);
      const { stepIndex, assignedTo, slaHours, notes, workflowId } = req.body as {
        stepIndex?: number;
        assignedTo?: string;
        slaHours?: number;
        notes?: string;
        workflowId?: string;
      };

      if (stepIndex === undefined || !assignedTo) {
        res.status(400).json({ error: 'stepIndex and assignedTo are required' });
        return;
      }

      // Ensure workflow_executions row exists for this executionId
      const existing = db.prepare('SELECT id FROM workflow_executions WHERE id = ?').get(executionId);
      if (!existing) {
        db.prepare(
          'INSERT INTO workflow_executions (id, workflow_id, workflow_name, status, created_by, user_id) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(executionId, workflowId ?? executionId, '', 'running', assignedBy, assignedBy);
      }

      const result = canvas.assignStep({
        executionId,
        workflowId: workflowId ?? executionId,
        stepIndex,
        assignedTo,
        assignedBy,
        slaHours,
        notes,
      });
      res.status(201).json(result);
    } catch (err) {
      console.error('[canvas] assign error:', err);
      res.status(500).json({ error: 'Failed to assign step' });
    }
  });

  // PUT /api/canvas/assignments/:id/status — update assignment status
  router.put('/canvas/assignments/:id/status', (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body as { status?: string };
      if (!status) {
        res.status(400).json({ error: 'status is required' });
        return;
      }
      canvas.updateAssignmentStatus(id, status);
      res.json({ success: true });
    } catch (err) {
      console.error('[canvas] update status error:', err);
      res.status(500).json({ error: 'Failed to update assignment status' });
    }
  });

  // GET /api/canvas/executions/:executionId/steps/:stepIndex/reviews — get reviews + consensus
  router.get('/canvas/executions/:executionId/steps/:stepIndex/reviews', (req, res) => {
    try {
      const { executionId, stepIndex } = req.params;
      const consensus = canvas.getConsensus(executionId, parseInt(stepIndex, 10));
      res.json(consensus);
    } catch (err) {
      console.error('[canvas] get reviews error:', err);
      res.status(500).json({ error: 'Failed to fetch reviews' });
    }
  });

  // POST /api/canvas/executions/:executionId/steps/:stepIndex/reviewers — add reviewer
  router.post('/canvas/executions/:executionId/steps/:stepIndex/reviewers', (req, res) => {
    try {
      const { executionId, stepIndex } = req.params;
      const assignedBy = getUserId(req);
      const { reviewer, requiredForConsensus, workflowId } = req.body as {
        reviewer?: string;
        requiredForConsensus?: boolean;
        workflowId?: string;
      };

      if (!reviewer) {
        res.status(400).json({ error: 'reviewer is required' });
        return;
      }

      // Ensure workflow_executions row exists
      const existing = db.prepare('SELECT id FROM workflow_executions WHERE id = ?').get(executionId);
      if (!existing) {
        db.prepare(
          'INSERT INTO workflow_executions (id, workflow_id, workflow_name, status, created_by) VALUES (?, ?, ?, ?, ?)'
        ).run(executionId, workflowId ?? executionId, '', 'running', assignedBy);
      }

      const id = canvas.addParallelReviewer({
        executionId,
        stepIndex: parseInt(stepIndex, 10),
        reviewer,
        requiredForConsensus: requiredForConsensus !== false,
      });
      res.status(201).json({ id });
    } catch (err) {
      console.error('[canvas] add reviewer error:', err);
      res.status(500).json({ error: 'Failed to add reviewer' });
    }
  });

  // POST /api/canvas/executions/:executionId/steps/:stepIndex/review — submit review
  router.post('/canvas/executions/:executionId/steps/:stepIndex/review', (req, res) => {
    try {
      const { executionId, stepIndex } = req.params;
      const { reviewer, status, comment } = req.body as {
        reviewer?: string;
        status?: 'approved' | 'rejected' | 'abstained';
        comment?: string;
      };

      if (!reviewer || !status) {
        res.status(400).json({ error: 'reviewer and status are required' });
        return;
      }

      const consensus = canvas.submitReview({
        executionId,
        stepIndex: parseInt(stepIndex, 10),
        reviewer,
        status,
        comment,
      });
      res.json(consensus);
    } catch (err) {
      console.error('[canvas] submit review error:', err);
      res.status(500).json({ error: 'Failed to submit review' });
    }
  });

  // GET /api/canvas/executions/:executionId/comments — get all comments
  router.get('/canvas/executions/:executionId/comments', (req, res) => {
    try {
      const { executionId } = req.params;
      const comments = canvas.getComments(executionId);
      res.json(comments);
    } catch (err) {
      console.error('[canvas] get comments error:', err);
      res.status(500).json({ error: 'Failed to fetch comments' });
    }
  });

  // POST /api/canvas/executions/:executionId/comments — add comment
  router.post('/canvas/executions/:executionId/comments', (req, res) => {
    try {
      const { executionId } = req.params;
      const currentUser = getUserId(req);
      const { stepIndex, content, author, commentType, workflowId } = req.body as {
        stepIndex?: number;
        content?: string;
        author?: string;
        commentType?: 'comment' | 'suggestion' | 'concern' | 'approval';
        workflowId?: string;
      };

      if (!content) {
        res.status(400).json({ error: 'content is required' });
        return;
      }

      // Ensure workflow_executions row exists
      const existing = db.prepare('SELECT id FROM workflow_executions WHERE id = ?').get(executionId);
      if (!existing) {
        db.prepare(
          'INSERT INTO workflow_executions (id, workflow_id, workflow_name, status, created_by) VALUES (?, ?, ?, ?, ?)'
        ).run(executionId, workflowId ?? executionId, '', 'running', currentUser);
      }

      const id = canvas.addComment({
        executionId,
        stepIndex,
        author: author ?? currentUser,
        content,
        commentType,
      });
      res.status(201).json({ id });
    } catch (err) {
      console.error('[canvas] add comment error:', err);
      res.status(500).json({ error: 'Failed to add comment' });
    }
  });

  // PUT /api/canvas/comments/:id/resolve — resolve comment
  router.put('/canvas/comments/:id/resolve', (req, res) => {
    try {
      const { id } = req.params;
      const { resolvedBy } = req.body as { resolvedBy?: string };
      const userId = resolvedBy ?? getUserId(req);
      canvas.resolveComment(id, userId);
      res.json({ success: true });
    } catch (err) {
      console.error('[canvas] resolve comment error:', err);
      res.status(500).json({ error: 'Failed to resolve comment' });
    }
  });

  return router;
}
