import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { createTemporalReasoningService } from '../services/temporal-reasoning.js';
import { safeError } from '../lib/error-response.js';

export async function createTemporalReasoningRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();
  const service = await createTemporalReasoningService(db);

  // ── Goals Profile ──────────────────────────────────────────────────────

  router.get('/goals-profile', async (req, res) => {
    try {
      const userId = (req as any).user?.id || 'default';
      const profile = await service.getGoalsProfile(userId);
      res.json(profile ?? { user_id: userId, today_focus: [], this_week_goals: [], this_month_goals: [], this_year_goals: [], this_decade_vision: '' });
    } catch (err) {
      const message = safeError(err);
      res.status(500).json({ error: message });
    }
  });

  router.put('/goals-profile', async (req, res) => {
    try {
      const userId = (req as any).user?.id || 'default';
      await service.upsertGoalsProfile(userId, req.body);
      const profile = await service.getGoalsProfile(userId);
      res.json(profile);
    } catch (err) {
      const message = safeError(err);
      res.status(500).json({ error: message });
    }
  });

  // ── Domain Strategies ──────────────────────────────────────────────────

  router.get('/domain-strategies', async (req, res) => {
    try {
      const userId = (req as any).user?.id || 'default';
      const strategies = await service.listStrategies(userId);
      res.json(strategies);
    } catch (err) {
      const message = safeError(err);
      res.status(500).json({ error: message });
    }
  });

  router.post('/domain-strategies', async (req, res) => {
    try {
      const userId = (req as any).user?.id || 'default';
      const { domain, strategyType, strategyLabel, parameters, atomWeights } = req.body;
      if (!domain || !strategyType) return res.status(400).json({ error: 'domain and strategyType required' });
      const id = await service.createStrategy(userId, { domain, strategyType, strategyLabel, parameters, atomWeights });
      res.status(201).json({ id });
    } catch (err) {
      const message = safeError(err);
      res.status(500).json({ error: message });
    }
  });

  // ── Values Constraints ─────────────────────────────────────────────────

  router.get('/values-constraints', async (req, res) => {
    try {
      const userId = (req as any).user?.id || 'default';
      const scope = (req.query.scope as string) || 'all';
      const constraints = await service.getValuesConstraints(userId, scope);
      res.json(constraints);
    } catch (err) {
      const message = safeError(err);
      res.status(500).json({ error: message });
    }
  });

  router.post('/values-constraints', async (req, res) => {
    try {
      const userId = (req as any).user?.id || 'default';
      const { name, description, constraintType, scope, value, enforcement } = req.body;
      if (!name || !constraintType || !value) return res.status(400).json({ error: 'name, constraintType, and value required' });
      const id = await service.createValuesConstraint(userId, { name, description, constraintType, scope, value, enforcement });
      res.status(201).json({ id });
    } catch (err) {
      const message = safeError(err);
      res.status(500).json({ error: message });
    }
  });

  router.delete('/values-constraints/:id', async (req, res) => {
    try {
      await service.deleteValuesConstraint(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      const message = safeError(err);
      res.status(500).json({ error: message });
    }
  });

  // ── Conflict Resolution Rules ──────────────────────────────────────────

  router.get('/conflict-rules', async (req, res) => {
    try {
      const userId = (req as any).user?.id || 'default';
      const rules = await service.getConflictRules(userId);
      res.json(rules);
    } catch (err) {
      const message = safeError(err);
      res.status(500).json({ error: message });
    }
  });

  router.put('/conflict-rules/:id', async (req, res) => {
    try {
      const { resolution, customLogic } = req.body;
      if (!resolution) return res.status(400).json({ error: 'resolution required' });
      await service.updateConflictRule(req.params.id, resolution, customLogic);
      res.json({ ok: true });
    } catch (err) {
      const message = safeError(err);
      res.status(500).json({ error: message });
    }
  });

  // ── Temporal Consequence Check (manual) ─────────────────────────────────

  router.post('/temporal-check', async (req, res) => {
    try {
      const userId = (req as any).user?.id || 'default';
      const { action, context, domain } = req.body;
      if (!action) return res.status(400).json({ error: 'action required' });
      const result = await service.checkTemporalConsequences(action, context ?? '', userId, domain ?? 'finance');
      res.json(result);
    } catch (err) {
      const message = safeError(err);
      res.status(500).json({ error: message });
    }
  });

  // ── Temporal Consequence Log ────────────────────────────────────────────

  router.get('/temporal-log', async (req, res) => {
    try {
      const userId = (req as any).user?.id || 'default';
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const logs = await db.all(
        'SELECT * FROM temporal_consequence_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
        userId, limit
      );
      res.json(logs);
    } catch (err) {
      const message = safeError(err);
      res.status(500).json({ error: message });
    }
  });

  // ── Decision Context (full view) ───────────────────────────────────────

  router.get('/decision-context', async (req, res) => {
    try {
      const userId = (req as any).user?.id || 'default';
      const domain = (req.query.domain as string) || 'finance';
      const ctx = await service.getDecisionContext(userId, domain);
      res.json(ctx);
    } catch (err) {
      const message = safeError(err);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
