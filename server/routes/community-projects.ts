import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { createProjectOrchestratorService } from '../services/project-orchestrator-service.js';

export async function createCommunityProjectRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();
  const service = await createProjectOrchestratorService(db);

  router.get('/community/projects', async (_req, res) => {
    try { res.json(await service.listCollaborativeProjects()); }
    catch (err) { res.status(500).json({ error: 'Failed to list projects' }); }
  });

  router.post('/community/projects', async (req, res) => {
    try {
      const { name, goal, description } = req.body;
      if (!name || !goal) return res.status(400).json({ error: 'name and goal required' });
      const id = await service.createCollaborativeProject({ name, goal, description });
      res.status(201).json({ id });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  router.get('/community/projects/:id/dashboard', async (req, res) => {
    try { res.json(await service.getProjectDashboard(req.params.id)); }
    catch (err) { res.status(500).json({ error: 'Failed to get dashboard' }); }
  });

  router.post('/community/projects/:id/plan', async (req, res) => {
    try {
      const { goal, context } = req.body;
      if (!goal) return res.status(400).json({ error: 'goal required' });
      const result = await service.generateProjectPlan(req.params.id, goal, context);
      res.json(result);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  router.post('/community/projects/:id/plan/:planId/approve', async (req, res) => {
    try { await service.approvePlan(req.params.id, req.params.planId); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: 'Failed to approve plan' }); }
  });

  router.get('/community/projects/:id/capability-matches', async (req, res) => {
    try { res.json(await service.matchCapabilities(req.params.id)); }
    catch (err) { res.status(500).json({ error: 'Failed to match capabilities' }); }
  });

  router.post('/community/projects/:id/tasks/:taskId/assign', async (req, res) => {
    try {
      const { type, contactHash, contactName } = req.body;
      await service.assignTask(req.params.id, req.params.taskId, { type, contactHash, contactName });
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  router.post('/community/projects/:id/tasks/:taskId/complete', async (req, res) => {
    try {
      await service.completeTask(req.params.id, req.params.taskId, { content: req.body.content, qualityScore: req.body.qualityScore });
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: 'Failed to complete task' }); }
  });

  router.post('/community/projects/:id/sync', async (req, res) => {
    try { await service.syncTaskStatuses(req.params.id); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: 'Failed to sync' }); }
  });

  router.post('/community/projects/:id/assemble', async (req, res) => {
    try { const result = await service.assembleDeliverables(req.params.id); res.json({ content: result }); }
    catch (err) { res.status(500).json({ error: 'Failed to assemble' }); }
  });

  router.get('/community/projects/:id/activity', async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 30;
      const activity = await db.all('SELECT * FROM community_project_activity WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2', req.params.id, limit);
      res.json(activity);
    } catch (err) { res.status(500).json({ error: 'Failed to get activity' }); }
  });

  return router;
}
