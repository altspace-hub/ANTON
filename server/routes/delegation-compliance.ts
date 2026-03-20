import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { createDelegationComplianceService } from '../services/delegation-compliance-service.js';

export async function createDelegationComplianceRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();
  const service = await createDelegationComplianceService(db);

  router.get('/community/delegation/compliance/rules', async (req, res) => {
    try {
      const activeOnly = req.query.active !== 'false';
      const rules = await service.listRules(activeOnly);
      res.json(rules);
    } catch (err) { res.status(500).json({ error: 'Failed to list rules' }); }
  });

  router.post('/community/delegation/compliance/rules', async (req, res) => {
    try {
      const { ruleName, ruleType, condition, action, actionMessage, scopeType, scopeValue, priority } = req.body;
      if (!ruleName || !ruleType || !condition || !action) return res.status(400).json({ error: 'ruleName, ruleType, condition, action required' });
      const id = await service.createRule({ ruleName, ruleType, condition, action, actionMessage, scopeType, scopeValue, priority });
      res.status(201).json({ id });
    } catch (err) { res.status(500).json({ error: 'Failed to create rule' }); }
  });

  router.post('/community/delegation/compliance/rules/:id/toggle', async (req, res) => {
    try {
      await service.toggleRule(req.params.id, req.body.active ?? true);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: 'Failed to toggle rule' }); }
  });

  router.delete('/community/delegation/compliance/rules/:id', async (req, res) => {
    try {
      await service.deleteRule(req.params.id);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: 'Failed to delete rule' }); }
  });

  router.post('/community/delegation/compliance/check', async (req, res) => {
    try {
      const { title, description, contactHash, requiredModules, trustLevel } = req.body;
      if (!title || !description) return res.status(400).json({ error: 'title and description required' });
      const result = await service.evaluateCompliance('outbound', { title, description, contactHash: contactHash ?? '', requiredModules, trustLevel });
      res.json(result);
    } catch (err) { res.status(500).json({ error: 'Failed to check compliance' }); }
  });

  router.get('/community/delegation/compliance/evaluations', async (req, res) => {
    try {
      const taskId = req.query.taskId as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const evals = await service.getEvaluationLog(taskId, limit);
      res.json(evals);
    } catch (err) { res.status(500).json({ error: 'Failed to get evaluations' }); }
  });

  return router;
}
