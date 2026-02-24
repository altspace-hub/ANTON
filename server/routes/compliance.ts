import express from 'express';
import type { Database } from 'better-sqlite3';
import { createComplianceRulesService } from '../services/compliance-rules.js';

export function createComplianceRoutes(db: Database) {
  const router = express.Router();
  const service = createComplianceRulesService(db);

  // Rule management
  router.get('/compliance/rules', (req, res) => {
    try {
      const { category } = req.query;
      const rules = service.getAllRules(category as string);
      res.json({ success: true, rules });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  router.get('/compliance/rules/:id', (req, res) => {
    try {
      const rule = service.getRule(parseInt(req.params.id));
      if (!rule) {
        return res.status(404).json({ success: false, error: 'Rule not found' });
      }
      res.json({ success: true, rule });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  router.post('/compliance/rules', (req, res) => {
    try {
      const ruleId = service.createRule(req.body);
      res.json({ success: true, ruleId });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  router.put('/compliance/rules/:id', (req, res) => {
    try {
      service.updateRule(parseInt(req.params.id), req.body);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  router.delete('/compliance/rules/:id', (req, res) => {
    try {
      service.deleteRule(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Rule execution
  router.post('/compliance/rules/:id/execute', async (req, res) => {
    try {
      const execution = await service.executeRule(parseInt(req.params.id), req.body.context);
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
  router.get('/compliance/violations', (req, res) => {
    try {
      const filters = {
        status: req.query.status as string,
        severity: req.query.severity as string,
        ruleId: req.query.ruleId ? parseInt(req.query.ruleId as string) : undefined
      };
      const violations = service.getViolations(filters);
      res.json({ success: true, violations });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  router.put('/compliance/violations/:id', (req, res) => {
    try {
      service.updateViolation(parseInt(req.params.id), req.body);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // Dashboard
  router.get('/compliance/dashboard', (req, res) => {
    try {
      const dashboard = service.getComplianceDashboard();
      res.json({ success: true, ...dashboard });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  return router;
}
