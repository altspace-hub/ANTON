import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

export async function createFCBudgetRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();
  const { createFCBudgetService } = await import('../services/fc-budget-service.js');
  const svc = await createFCBudgetService(db);

  router.get('/futurechain/budget/rules', async (_req, res) => {
    try {
      const rules = await svc.getRules();
      res.json(rules ?? {});
    } catch (err) { res.status(500).json({ error: 'Failed to get budget rules' }); }
  });

  router.put('/futurechain/budget/rules', async (req, res) => {
    try {
      const rules = await svc.updateRules(req.body);
      res.json(rules ?? {});
    } catch (err) { res.status(500).json({ error: 'Failed to update budget rules' }); }
  });

  router.get('/futurechain/budget/state', async (_req, res) => {
    try {
      const state = await svc.getSpendingState();
      res.json(state ?? {});
    } catch (err) { res.status(500).json({ error: 'Failed to get spending state' }); }
  });

  router.get('/futurechain/budget/log', async (req, res) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const log = await svc.getSpendingLog(limit);
      res.json(log);
    } catch (err) { res.status(500).json({ error: 'Failed to get spending log' }); }
  });

  router.post('/futurechain/budget/check', async (req, res) => {
    try {
      const { amount } = req.body;
      if (amount == null || isNaN(Number(amount))) return res.status(400).json({ error: 'amount is required and must be a number' });
      const result = await svc.checkSpending(Number(amount));
      res.json(result);
    } catch (err) { res.status(500).json({ error: 'Failed to check spending' }); }
  });

  return router;
}
