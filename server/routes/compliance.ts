import { safeError } from '../lib/error-response.js';
import express from 'express';
import type { DatabaseAdapter } from '../db/database.js';

import { loadOwnedRow, respondToRowAccessError } from '../lib/owned-row.js';
import { requireAdminOrSolo, requireAuth } from '../middleware/role-guards.js';
import { createComplianceRulesService, type RuleContext } from '../services/compliance-rules.js';
import {
  isComplianceOnCompletionEnabled,
  setComplianceOnCompletion,
} from '../services/compliance-on-completion.js';

// ── Authorisation (Wave 6 track E) ───────────────────────────────────────────
// This router had no guard at all. Rule definitions are readable by anyone
// signed in; creating / editing / executing rules and reading the instance-wide
// violation list are admin actions in team mode (violations carry fragments of
// other users' outputs — a placeholder match, a redacted secret prefix). The
// per-message view is scoped through the message's session, like the run
// artifact route in routes/claude.ts. Solo is unchanged: authMiddleware stamps
// the operator role:'admin' and requireAdminOrSolo passes everyone.

/** JSON columns come back as text; hand the client objects. */
function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

interface ExecutionRow {
  id: number;
  rule_id: number;
  rule_code: string;
  title: string;
  severity: string;
  category: string;
  result: string;
  findings: unknown;
  auto_remediated: number;
  executed_at: string;
}

interface ViolationRow {
  id: number;
  rule_id: number;
  rule_code: string;
  title: string;
  remediation_steps: unknown;
  execution_id: number;
  severity: string;
  description: string;
  affected_entity: string | null;
  remediation_status: string;
  remediated_at: string | null;
  remediated_by: string | null;
  notes: string | null;
  created_at: string;
}

function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === 'string' ? parseInt(raw, 10) : NaN;
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export async function createComplianceRoutes(db: DatabaseAdapter) {
  const router = express.Router();
  const service = await createComplianceRulesService(db);

  // Rule management
  router.get('/compliance/rules', requireAuth, async (req, res) => {
    try {
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      const rules = await service.getAllRules(category);
      res.json({ success: true, rules });
    } catch (error) {
      res.status(500).json({ success: false, error: safeError(error) });
    }
  });

  // ── Completion gate (before /compliance/rules/:id so 'on-completion' is not read as an id) ──

  /** GET /api/compliance/on-completion — is the completion hook on? */
  router.get('/compliance/on-completion', requireAuth, async (_req, res) => {
    try {
      const enabled = await isComplianceOnCompletionEnabled(db);
      res.json({ success: true, enabled });
    } catch (error) {
      res.status(500).json({ success: false, error: safeError(error) });
    }
  });

  /** POST /api/compliance/on-completion { enabled: boolean } — instance-wide, admin in team mode. */
  router.post('/compliance/on-completion', requireAdminOrSolo, async (req, res) => {
    try {
      const enabled: unknown = (req.body as { enabled?: unknown } | undefined)?.enabled;
      if (typeof enabled !== 'boolean') {
        res.status(400).json({ success: false, error: 'enabled must be a boolean' });
        return;
      }
      await setComplianceOnCompletion(db, enabled);
      res.json({ success: true, enabled });
    } catch (error) {
      res.status(500).json({ success: false, error: safeError(error) });
    }
  });

  router.get('/compliance/rules/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid rule id' });
      const rule = await service.getRule(id);
      if (!rule) {
        return res.status(404).json({ success: false, error: 'Rule not found' });
      }
      res.json({ success: true, rule });
    } catch (error) {
      res.status(500).json({ success: false, error: safeError(error) });
    }
  });

  router.post('/compliance/rules', requireAdminOrSolo, async (req, res) => {
    try {
      const ruleId = await service.createRule(req.body);
      res.json({ success: true, ruleId });
    } catch (error) {
      res.status(500).json({ success: false, error: safeError(error) });
    }
  });

  router.put('/compliance/rules/:id', requireAdminOrSolo, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid rule id' });
      await service.updateRule(id, req.body);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: safeError(error) });
    }
  });

  router.delete('/compliance/rules/:id', requireAdminOrSolo, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid rule id' });
      await service.deleteRule(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: safeError(error) });
    }
  });

  // Rule execution
  router.post('/compliance/rules/:id/execute', requireAdminOrSolo, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid rule id' });
      const context = (req.body as { context?: RuleContext } | undefined)?.context ?? {};
      const execution = await service.executeRule(id, context);
      res.json({ success: true, execution });
    } catch (error) {
      res.status(500).json({ success: false, error: safeError(error) });
    }
  });

  router.post('/compliance/rules/execute-all', requireAdminOrSolo, async (req, res) => {
    try {
      const body = (req.body ?? {}) as { context?: RuleContext; category?: string };
      const executions = await service.executeAllRules(body.context ?? {}, body.category);
      res.json({ success: true, executions });
    } catch (error) {
      res.status(500).json({ success: false, error: safeError(error) });
    }
  });

  // Violations
  router.get('/compliance/violations', requireAdminOrSolo, async (req, res) => {
    try {
      const filters = {
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        severity: typeof req.query.severity === 'string' ? req.query.severity : undefined,
        ruleId: typeof req.query.ruleId === 'string' ? (parseInt(req.query.ruleId, 10) || undefined) : undefined,
      };
      const violations = await service.getViolations(filters);
      res.json({ success: true, violations });
    } catch (error) {
      res.status(500).json({ success: false, error: safeError(error) });
    }
  });

  router.put('/compliance/violations/:id', requireAdminOrSolo, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid violation id' });
      await service.updateViolation(id, req.body);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: safeError(error) });
    }
  });

  /**
   * GET /api/compliance/by-message/:messageId — what the Work rules said about one
   * answer. Ownership runs through the message's session (404 on a miss, never
   * 403, so an id cannot confirm another tenant's message exists).
   */
  router.get('/compliance/by-message/:messageId', requireAuth, async (req, res) => {
    try {
      const messageId = String(req.params.messageId);
      const message = await db.get<{ id: string; session_id: string }>(
        'SELECT id, session_id FROM messages WHERE id = ?', messageId,
      );
      if (!message) {
        res.status(404).json({ success: false, error: 'Message not found' });
        return;
      }
      await loadOwnedRow(db, req, {
        table: 'sessions', ownerColumn: 'user_id', id: message.session_id,
        columns: ['id'], notFoundMessage: 'Message not found',
      });

      const executionRows = await db.all<ExecutionRow>(
        `SELECT re.id, re.rule_id, r.rule_code, r.title, r.severity, r.category,
                re.result, re.findings, re.auto_remediated, re.executed_at
           FROM rule_executions re
           JOIN compliance_rules r ON r.id = re.rule_id
          WHERE CASE WHEN re.execution_context LIKE '{%' THEN re.execution_context::jsonb ->> 'messageId' END = ?
          ORDER BY re.executed_at DESC, re.id DESC`,
        messageId,
      );
      const violationRows = await db.all<ViolationRow>(
        `SELECT rv.id, rv.rule_id, r.rule_code, r.title, r.remediation_steps, rv.execution_id,
                rv.severity, rv.description, rv.affected_entity, rv.remediation_status,
                rv.remediated_at, rv.remediated_by, rv.notes, rv.created_at
           FROM rule_violations rv
           JOIN compliance_rules r ON r.id = rv.rule_id
          WHERE rv.affected_entity = ?
          ORDER BY rv.created_at DESC, rv.id DESC`,
        messageId,
      );

      const executions = executionRows.map((row) => ({ ...row, findings: parseJson(row.findings) }));
      const violations = violationRows.map((row) => ({ ...row, remediation_steps: parseJson(row.remediation_steps) }));
      const tally = (result: string) => executions.filter((e) => e.result === result).length;
      res.json({
        success: true,
        messageId,
        sessionId: message.session_id,
        summary: {
          rules: executions.length,
          passed: tally('pass'),
          failed: tally('fail'),
          warnings: tally('warning'),
          errors: tally('error'),
          openViolations: violations.filter((v) => v.remediation_status === 'open').length,
        },
        executions,
        violations,
      });
    } catch (error) {
      if (respondToRowAccessError(error, res)) return;
      res.status(500).json({ success: false, error: safeError(error) });
    }
  });

  /**
   * GET /api/compliance/audit-events — the request audit trail written by
   * middleware/audit-events.ts (every mutating /api call). Instance-wide by
   * nature, so admin in team mode.
   */
  router.get('/compliance/audit-events', requireAdminOrSolo, async (req, res) => {
    try {
      const limit = clampInt(req.query.limit, 100, 1, 500);
      const offset = clampInt(req.query.offset, 0, 0, 1_000_000);
      let sql = 'SELECT * FROM audit_events WHERE 1=1';
      const params: unknown[] = [];
      if (typeof req.query.method === 'string') { sql += ' AND method = ?'; params.push(req.query.method.toUpperCase()); }
      if (typeof req.query.userId === 'string') { sql += ' AND user_id = ?'; params.push(req.query.userId); }
      if (typeof req.query.status === 'string' && /^\d{3}$/.test(req.query.status)) { sql += ' AND status_code = ?'; params.push(Number(req.query.status)); }
      if (typeof req.query.path === 'string') { sql += ' AND path_pattern LIKE ?'; params.push(`${req.query.path}%`); }
      sql += ' ORDER BY occurred_at DESC, id DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      const events = await db.all(sql, ...params);
      res.json({ success: true, events, limit, offset });
    } catch (error) {
      res.status(500).json({ success: false, error: safeError(error) });
    }
  });

  // Dashboard
  router.get('/compliance/dashboard', requireAdminOrSolo, async (_req, res) => {
    try {
      const dashboard = await service.getComplianceDashboard();
      res.json({ success: true, ...dashboard });
    } catch (error) {
      res.status(500).json({ success: false, error: safeError(error) });
    }
  });

  return router;
}
