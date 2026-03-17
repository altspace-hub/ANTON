import express from 'express';
import type { DatabaseAdapter } from '../db/database.js';

import { createComplianceRulesService } from '../services/compliance-rules.js';

export async function createComplianceRoutes(db: DatabaseAdapter) {
  const router = express.Router();
  const service = await createComplianceRulesService(db);

  // Rule management
  router.get('/compliance/rules', async (req, res) => {
    try {
      const { category } = req.query;
      const rules = await service.getAllRules(category as string);
      res.json({ success: true, rules });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  router.get('/compliance/rules/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid rule id' });
      const rule = await service.getRule(id);
      if (!rule) {
        return res.status(404).json({ success: false, error: 'Rule not found' });
      }
      res.json({ success: true, rule });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  router.post('/compliance/rules', async (req, res) => {
    try {
      const ruleId = await service.createRule(req.body);
      res.json({ success: true, ruleId });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  router.put('/compliance/rules/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid rule id' });
      await service.updateRule(id, req.body);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  router.delete('/compliance/rules/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid rule id' });
      await service.deleteRule(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Rule execution
  router.post('/compliance/rules/:id/execute', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid rule id' });
      const execution = await service.executeRule(id, req.body.context);
      res.json({ success: true, execution });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  router.post('/compliance/rules/execute-all', async (req, res) => {
    try {
      const { context, category } = req.body;
      const executions = await service.executeAllRules(context, category);
      res.json({ success: true, executions });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Violations
  router.get('/compliance/violations', async (req, res) => {
    try {
      const filters = {
        status: req.query.status as string,
        severity: req.query.severity as string,
        ruleId: req.query.ruleId ? (parseInt(req.query.ruleId as string, 10) || undefined) : undefined
      };
      const violations = await service.getViolations(filters);
      res.json({ success: true, violations });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  router.put('/compliance/violations/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid violation id' });
      await service.updateViolation(id, req.body);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Dashboard
  router.get('/compliance/dashboard', async (req, res) => {
    try {
      const dashboard = await service.getComplianceDashboard();
      res.json({ success: true, ...dashboard });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  return router;
}
