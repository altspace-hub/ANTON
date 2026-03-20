import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { createTaskDelegationService } from '../services/task-delegation-service.js';

export async function createTaskDelegationRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();
  const service = await createTaskDelegationService(db);

  router.get('/community/tasks', async (req, res) => {
    try {
      const tasks = await service.listTasks({
        direction: req.query.direction as string | undefined,
        status: req.query.status as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
      });
      res.json(tasks);
    } catch (err) { res.status(500).json({ error: 'Failed to list tasks' }); }
  });

  router.get('/community/tasks/stats', async (_req, res) => {
    try {
      const stats = await service.getTaskStats();
      res.json(stats);
    } catch (err) { res.status(500).json({ error: 'Failed to get task stats' }); }
  });

  router.get('/community/tasks/:id', async (req, res) => {
    try {
      const result = await service.getTask(req.params.id);
      if (!result.task) return res.status(404).json({ error: 'Task not found' });
      res.json(result);
    } catch (err) { res.status(500).json({ error: 'Failed to get task' }); }
  });

  router.post('/community/tasks', async (req, res) => {
    try {
      const { providerHash, title, description, requiredModules, context, urgency, deadline } = req.body;
      if (!providerHash || !title || !description) return res.status(400).json({ error: 'providerHash, title, description required' });
      const result = await service.createTaskRequest({ providerHash, title, description, requiredModules, context, urgency, deadline });
      res.status(201).json(result);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  router.post('/community/tasks/:id/accept', async (req, res) => {
    try { await service.acceptTask(req.params.id); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: 'Failed to accept task' }); }
  });

  router.post('/community/tasks/:id/decline', async (req, res) => {
    try { await service.declineTask(req.params.id, req.body.reason); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: 'Failed to decline task' }); }
  });

  router.post('/community/tasks/:id/start', async (req, res) => {
    try { await service.startTask(req.params.id); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: 'Failed to start task' }); }
  });

  router.post('/community/tasks/:id/progress', async (req, res) => {
    try { await service.updateProgress(req.params.id, req.body.percent, req.body.currentStep); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: 'Failed to update progress' }); }
  });

  router.post('/community/tasks/:id/clarify', async (req, res) => {
    try { await service.requestClarification(req.params.id, req.body.question); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: 'Failed to request clarification' }); }
  });

  router.post('/community/tasks/:id/respond', async (req, res) => {
    try { await service.respondToClarification(req.params.id, req.body.answer); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: 'Failed to respond' }); }
  });

  router.post('/community/tasks/:id/complete', async (req, res) => {
    try { await service.completeTask(req.params.id, { content: req.body.content, artifacts: req.body.artifacts }); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: 'Failed to complete task' }); }
  });

  router.post('/community/tasks/:id/cancel', async (req, res) => {
    try { await service.cancelTask(req.params.id, req.body.reason); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: 'Failed to cancel task' }); }
  });

  router.post('/community/tasks/:id/rate', async (req, res) => {
    try { await service.rateTask(req.params.id, req.body.qualityScore); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: 'Failed to rate task' }); }
  });

  router.patch('/community/connections/:id/delegation', async (req, res) => {
    try {
      const { trustLevel, policy } = req.body;
      const sets: string[] = [];
      const vals: unknown[] = [];
      if (trustLevel) { sets.push('delegation_trust_level = ?'); vals.push(trustLevel); }
      if (policy) { sets.push('delegation_policy = ?'); vals.push(JSON.stringify(policy)); }
      if (sets.length > 0) { vals.push(req.params.id); await db.run(`UPDATE community_connections SET ${sets.join(', ')} WHERE id = ?`, ...vals); }
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: 'Failed to update delegation settings' }); }
  });

  return router;
}
