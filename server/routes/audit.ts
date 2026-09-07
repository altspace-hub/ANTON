import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

import { safeError } from '../lib/error-response.js';
import { loadOwnedRow, respondToRowAccessError } from '../lib/owned-row.js';
import { ownerFilter } from '../middleware/ownership.js';
import { requireAdmin, requireAdminOrSolo } from '../middleware/role-guards.js';
import { getAuditLog, getAuditStats } from '../services/auditLogger.js';
import { estimateCost } from '../services/token-estimator.js';

// ============================================================================
// COMPREHENSIVE AUDIT LOG BACKEND
// ============================================================================
// Production-grade audit system for compliance and security tracking
// Supports: filtering, pagination, statistics, export, security events
// ============================================================================
//
// ── Team-mode authorisation (2026-09 cross-tenant audit) ────────────────────
//
// This file registered no guard of any kind — no requireAuth, no requireAdmin, no
// owner predicate — and is mounted bare on '/api' behind only the global
// authMiddleware. Under DEPLOYMENT_MODE=team that meant any authenticated user, role
// 'viewer' included, could list every colleague's runs (module, session, model, cost),
// export the whole trail as CSV, read the security-event and login-attempt tables, and
// DELETE an audit row by id. A log its own subject can delete is not an audit log, and
// that is the sharpest edge in a product whose pitch is audit-defensible work.
//
// The policy now applied, per route rather than with a router.use(): this router is
// mounted at '/api' with no sub-path, so every /api request passes THROUGH it on its
// way to later routers — a router.use() here would silently become a guard on the
// whole API surface.
//
//   • audit_log rows          → ownerFilter(req,'user_id') on lists/stats/export,
//                               loadOwnedRow on the by-id read, an owner predicate
//                               inside the review UPDATE.
//   • deleting audit rows     → requireAdmin, in every mode.
//   • other people's identity (per-user usage breakdown, security_events,
//     login_attempts)         → requireAdminOrSolo.
//
// SOLO IS UNCHANGED. authMiddleware stamps the single operator role:'admin', and
// scopesToOwner() short-circuits outside team mode, so they still see, export and
// prune their entire history — including rows written before user_id was populated.
// Do not remove these guards on the grounds that the audit page works locally: local
// is precisely the mode in which none of them fire.

/**
 * ORDER BY direction, resolved to one of two literals.
 *
 * This used to be `(req.query.sortOrder as 'ASC' | 'DESC') || 'DESC'` — a bare
 * TypeScript cast, which erases at runtime — concatenated into the query beside the
 * whitelisted sort column. The whitelist on the COLUMN made the clause look safe while
 * the DIRECTION carried whatever the caller sent, so `?sortOrder=DESC,(SELECT ...)`
 * planted a subquery inside ORDER BY; the handler then echoed the driver's error
 * verbatim, turning it into a one-value-per-request read oracle over any table.
 *
 * Never widen this to pass the query value through. Anything that is not exactly
 * 'ASC' sorts descending — the caller cannot contribute SQL text either way.
 */
function normalizeSortOrder(raw: unknown): 'ASC' | 'DESC' {
  return typeof raw === 'string' && raw.trim().toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
}

interface AuditFilters {
  sessionId?: string;
  moduleId?: string;
  areaId?: string;
  userId?: string;
  model?: string;
  eventType?: string;
  reviewStatus?: string;
  startDate?: string;
  endDate?: string;
  searchText?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

interface SecurityEvent {
  event_type: string;
  user_id?: string;
  ip_address?: string;
  details?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

interface LoginAttempt {
  username: string;
  user_id?: string;
  ip_address?: string;
  user_agent?: string;
  success: boolean;
  failure_reason?: string;
}

/**
 * Calculate cost from token usage. Delegates to token-estimator (which delegates
 * to model-capabilities.ts — the pricing source of truth) so audit costs never
 * drift from the model registry. Previously a hand-maintained table that was
 * already stale (missing Opus 4.6).
 */
function calculateCost(inputTokens: number, outputTokens: number, model: string): number {
  return estimateCost(inputTokens, outputTokens, model);
}

export async function createAuditRoutes(db: DatabaseAdapter) {
  const router = Router();

  // ============================================================================
  // A. CORE AUDIT ENDPOINTS
  // ============================================================================

  /**
   * GET /api/audit/events - List audit events with comprehensive filtering
   */
  router.get('/audit/events', async (req, res) => {
    try {
      const filters: AuditFilters = {
        sessionId: req.query.sessionId as string,
        moduleId: req.query.moduleId as string,
        areaId: req.query.areaId as string,
        userId: req.query.userId as string,
        model: req.query.model as string,
        reviewStatus: req.query.reviewStatus as string,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        searchText: req.query.searchText as string,
        limit: req.query.limit ? (parseInt(req.query.limit as string, 10) || 50) : 50,
        offset: req.query.offset ? (parseInt(req.query.offset as string, 10) || 0) : 0,
        sortBy: (req.query.sortBy as string) || 'timestamp',
        sortOrder: normalizeSortOrder(req.query.sortOrder),
      };

      let query = 'SELECT * FROM audit_log WHERE 1=1';
      const params: unknown[] = [];

      // Apply filters
      if (filters.sessionId) {
        query += ' AND session_id = ?';
        params.push(filters.sessionId);
      }
      if (filters.moduleId) {
        query += ' AND module_id = ?';
        params.push(filters.moduleId);
      }
      if (filters.areaId) {
        query += ' AND area_id = ?';
        params.push(filters.areaId);
      }
      if (filters.userId) {
        query += ' AND user_id = ?';
        params.push(filters.userId);
      }
      if (filters.model) {
        query += ' AND model = ?';
        params.push(filters.model);
      }
      if (filters.reviewStatus) {
        query += ' AND review_status = ?';
        params.push(filters.reviewStatus);
      }
      if (filters.startDate) {
        query += ' AND timestamp >= ?';
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        query += ' AND timestamp <= ?';
        params.push(filters.endDate);
      }
      if (filters.searchText) {
        query += ' AND (module_id LIKE ? OR model LIKE ? OR session_id LIKE ?)';
        const searchPattern = `%${filters.searchText}%`;
        params.push(searchPattern, searchPattern, searchPattern);
      }

      // Ownership scope LAST among the predicates, so it is appended after — and
      // cannot be undone by — the caller-supplied filters above. `userId` is one of
      // those filters: a non-admin asking for a colleague's id now gets
      // `user_id = <them> AND user_id = <caller>`, i.e. nothing.
      const scope = ownerFilter(req, 'user_id');
      query += scope.sql;
      params.push(...scope.params);

      // Sorting
      const validSortColumns = ['timestamp', 'model', 'module_id', 'estimated_cost_usd', 'input_token_count', 'output_token_count'];
      const sortColumn = validSortColumns.includes(filters.sortBy || '') ? filters.sortBy : 'timestamp';
      // Both halves are literals: sortColumn from the whitelist above, sortOrder from
      // normalizeSortOrder. Neither may become a caller-supplied string again.
      query += ` ORDER BY ${sortColumn} ${filters.sortOrder}`;

      // Pagination
      query += ' LIMIT ? OFFSET ?';
      params.push(filters.limit || 50, filters.offset || 0);

      const events = await db.all(query, ...params);

      res.json(events);
    } catch (error) {
      console.error('[Audit] Error fetching events:', error);
      res.status(500).json({ error: 'Failed to fetch audit events', details: safeError(error) });
    }
  });

  /**
   * GET /api/audit/events/:id - Get specific audit event
   *
   * loadOwnedRow IS the fetch, so there is no unscoped `WHERE id = ?` left in this
   * handler for a later edit to drift back to. It answers 404 — never 403 — for a row
   * belonging to somebody else, so an id cannot be used to confirm that a colleague
   * ran a given session.
   */
  router.get('/audit/events/:id', async (req, res) => {
    try {
      const event = await loadOwnedRow(db, req, {
        table: 'audit_log',
        ownerColumn: 'user_id',
        id: req.params.id,
        notFoundMessage: 'Audit event not found',
      });
      res.json(event);
    } catch (error) {
      // FIRST in the catch: after the generic arm below, the 404 would be answered 500.
      if (respondToRowAccessError(error, res)) return;
      console.error('[Audit] Error fetching event:', error);
      res.status(500).json({ error: 'Failed to fetch audit event', details: safeError(error) });
    }
  });

  /**
   * DELETE /api/audit/events/:id - Delete audit event (admin only)
   *
   * requireAdmin, deliberately NOT an ownership check. Scoping this to the row's owner
   * would license exactly the abuse the audit trail exists to prevent: a user deleting
   * the record of the run they want nobody to see. The comment above this route claimed
   * "admin only" for months while no guard enforced it.
   *
   * Solo is unaffected — authMiddleware stamps the single operator role:'admin', so
   * retention pruning on a laptop still works.
   */
  router.delete('/audit/events/:id', requireAdmin, async (req, res) => {
    try {
      const result = await db.run('DELETE FROM audit_log WHERE id = ?', req.params.id);
      if (result.changes === 0) {
        res.status(404).json({ error: 'Audit event not found' });
        return;
      }
      console.log(`[Audit] Deleted event ${req.params.id}`);
      res.json({ success: true, deleted: req.params.id });
    } catch (error) {
      console.error('[Audit] Error deleting event:', error);
      res.status(500).json({ error: 'Failed to delete audit event', details: safeError(error) });
    }
  });

  // ============================================================================
  // B. LEGACY ENDPOINTS (for backward compatibility)
  // ============================================================================

  /**
   * GET /api/audit - Legacy endpoint (redirects to /audit/events)
   */
  router.get('/audit', async (req, res) => {
    try {
      const filters = {
        sessionId: req.query.sessionId as string,
        moduleId: req.query.moduleId as string,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        limit: req.query.limit ? (parseInt(req.query.limit as string, 10) || 50) : 50,
        offset: req.query.offset ? (parseInt(req.query.offset as string, 10) || 0) : 0,
      };
      // Same scope as /audit/events — this is the endpoint AuditLogPage actually calls,
      // so leaving it unscoped would have made the guard next door decorative.
      const events = await getAuditLog(db, filters, ownerFilter(req, 'user_id'));
      res.json(events);
    } catch (error) {
      console.error('[Audit] Error in legacy endpoint:', error);
      res.status(500).json({ error: 'Failed to fetch audit log', details: safeError(error) });
    }
  });

  /**
   * PATCH /api/audit/:id/review - Update review status
   *
   * Owner-scoped rather than admin-only: marking one's own run reviewed/approved is the
   * normal compliance workflow (AuditLogPage's only write), and requireAdmin here would
   * take that away from every analyst on a team install.
   *
   * The predicate lives INSIDE the UPDATE rather than in a preceding SELECT, so the
   * check and the write cannot drift apart, and 0 rows changed answers the same 404
   * whether the row is missing or somebody else's.
   */
  router.patch('/audit/:id/review', async (req, res) => {
    try {
      const { status } = req.body as { status: string; reviewedBy?: string };

      if (!['draft', 'reviewed', 'approved'].includes(status)) {
        res.status(400).json({ error: 'Invalid status. Must be: draft, reviewed, or approved' });
        return;
      }

      // reviewed_by is stamped from the authenticated caller, not read from the body.
      // It used to take `reviewedBy` verbatim, so a reviewer's name in the compliance
      // trail was whatever the request claimed. No client in the tree sends the field.
      const reviewer = req.user?.id ?? null;

      const scope = ownerFilter(req, 'user_id');
      const result = await db.run(
        `UPDATE audit_log SET review_status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?${scope.sql}`
      , status, reviewer, new Date().toISOString(), req.params.id, ...scope.params);

      if (result.changes === 0) {
        res.status(404).json({ error: 'Audit entry not found' });
        return;
      }

      console.log(`[Audit] Updated review status for ${req.params.id}: ${status}`);
      res.json({ success: true, id: req.params.id, status, reviewedBy: reviewer });
    } catch (error) {
      console.error('[Audit] Error updating review status:', error);
      res.status(500).json({ error: 'Failed to update review status', details: safeError(error) });
    }
  });

  // ============================================================================
  // C. STATISTICS ENDPOINTS
  // ============================================================================

  /**
   * GET /api/audit/stats - Overall statistics
   */
  router.get('/audit/stats', async (req, res) => {
    try {
      // Scoped: unscoped totals told a team-mode viewer the org's whole spend and which
      // modules everyone runs. A non-admin now gets the same headline figures for their
      // own work, which is what the page beside them shows.
      const stats = await getAuditStats(db, ownerFilter(req, 'user_id'));
      res.json(stats);
    } catch (error) {
      console.error('[Audit] Error fetching stats:', error);
      res.status(500).json({ error: 'Failed to fetch statistics', details: safeError(error) });
    }
  });

  /**
   * GET /api/audit/stats/models - Usage breakdown by model
   */
  router.get('/audit/stats/models', async (req, res) => {
    try {
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      let query = `
        SELECT
          model,
          COUNT(*) as calls,
          SUM(input_token_count) as total_input_tokens,
          SUM(output_token_count) as total_output_tokens,
          SUM(estimated_cost_usd) as total_cost,
          AVG(estimated_cost_usd) as avg_cost_per_call
        FROM audit_log
        WHERE 1=1
      `;
      const params: string[] = [];

      if (startDate) {
        query += ' AND timestamp >= ?';
        params.push(startDate);
      }
      if (endDate) {
        query += ' AND timestamp <= ?';
        params.push(endDate);
      }

      const scope = ownerFilter(req, 'user_id');
      query += scope.sql;
      params.push(...scope.params);

      query += ' GROUP BY model ORDER BY calls DESC';

      const modelStats = await db.all(query, ...params);
      res.json(modelStats);
    } catch (error) {
      console.error('[Audit] Error fetching model stats:', error);
      res.status(500).json({ error: 'Failed to fetch model statistics', details: safeError(error) });
    }
  });

  /**
   * GET /api/audit/stats/modules - Usage breakdown by module
   */
  router.get('/audit/stats/modules', async (req, res) => {
    try {
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      let query = `
        SELECT
          module_id,
          COUNT(*) as calls,
          SUM(estimated_cost_usd) as total_cost,
          AVG(input_token_count) as avg_input_tokens,
          AVG(output_token_count) as avg_output_tokens
        FROM audit_log
        WHERE module_id IS NOT NULL
      `;
      const params: string[] = [];

      if (startDate) {
        query += ' AND timestamp >= ?';
        params.push(startDate);
      }
      if (endDate) {
        query += ' AND timestamp <= ?';
        params.push(endDate);
      }

      const scope = ownerFilter(req, 'user_id');
      query += scope.sql;
      params.push(...scope.params);

      query += ' GROUP BY module_id ORDER BY calls DESC';

      const moduleStats = await db.all(query, ...params);
      res.json(moduleStats);
    } catch (error) {
      console.error('[Audit] Error fetching module stats:', error);
      res.status(500).json({ error: 'Failed to fetch module statistics', details: safeError(error) });
    }
  });

  /**
   * GET /api/audit/stats/users - Usage breakdown by user (team mode)
   *
   * This one is about other people by definition — it groups BY user_id — so scoping it
   * to the caller would leave a one-row answer pretending to be a report. Gated instead:
   * "which colleague ran what, and what did it cost" is a management view, and it was
   * readable by any viewer. requireAdminOrSolo keeps the solo operator's own breakdown.
   */
  router.get('/audit/stats/users', requireAdminOrSolo, async (req, res) => {
    try {
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      let query = `
        SELECT
          COALESCE(user_id, 'anonymous') as user_id,
          COUNT(*) as calls,
          SUM(estimated_cost_usd) as total_cost,
          SUM(input_token_count) as total_input_tokens,
          SUM(output_token_count) as total_output_tokens
        FROM audit_log
        WHERE 1=1
      `;
      const params: string[] = [];

      if (startDate) {
        query += ' AND timestamp >= ?';
        params.push(startDate);
      }
      if (endDate) {
        query += ' AND timestamp <= ?';
        params.push(endDate);
      }

      query += ' GROUP BY user_id ORDER BY calls DESC';

      const userStats = await db.all(query, ...params);
      res.json(userStats);
    } catch (error) {
      console.error('[Audit] Error fetching user stats:', error);
      res.status(500).json({ error: 'Failed to fetch user statistics', details: safeError(error) });
    }
  });

  /**
   * GET /api/audit/stats/costs - Cost breakdown and trends
   */
  router.get('/audit/stats/costs', async (req, res) => {
    try {
      const period = (req.query.period as string) || 'daily'; // daily, weekly, monthly

      let dateFormat = 'YYYY-MM-DD';
      if (period === 'weekly') dateFormat = 'IYYY-"W"IW';
      if (period === 'monthly') dateFormat = 'YYYY-MM';

      // dateFormat is one of the three literals above — never the raw `period` value.
      const scope = ownerFilter(req, 'user_id');

      const query = `
        SELECT
          TO_CHAR(timestamp, '${dateFormat}') as period,
          COUNT(*) as calls,
          SUM(estimated_cost_usd) as total_cost,
          SUM(input_token_count) as total_input_tokens,
          SUM(output_token_count) as total_output_tokens
        FROM audit_log
        WHERE timestamp >= CURRENT_DATE - INTERVAL '30 days'${scope.sql}
        GROUP BY period
        ORDER BY period DESC
      `;

      const costTrends = await db.all(query, ...scope.params);

      // Calculate totals
      const totals = await db.get(`
        SELECT
          COUNT(*) as total_calls,
          SUM(estimated_cost_usd) as total_cost,
          AVG(estimated_cost_usd) as avg_cost_per_call,
          SUM(input_token_count) as total_input_tokens,
          SUM(output_token_count) as total_output_tokens
        FROM audit_log
        WHERE timestamp >= CURRENT_DATE - INTERVAL '30 days'${scope.sql}
      `, ...scope.params);

      res.json({ trends: costTrends, totals });
    } catch (error) {
      console.error('[Audit] Error fetching cost stats:', error);
      res.status(500).json({ error: 'Failed to fetch cost statistics', details: safeError(error) });
    }
  });

  // ============================================================================
  // D. EXPORT ENDPOINT
  // ============================================================================

  /**
   * GET /api/audit/export - Export audit trail as CSV
   */
  router.get('/audit/export', async (req, res) => {
    try {
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      let query = 'SELECT * FROM audit_log WHERE 1=1';
      const params: string[] = [];

      if (startDate) {
        query += ' AND timestamp >= ?';
        params.push(startDate);
      }
      if (endDate) {
        query += ' AND timestamp <= ?';
        params.push(endDate);
      }

      // The export is the same SELECT * as /audit/events with no LIMIT. Scoping the
      // list and not this would just move the cross-tenant dump one URL to the right.
      const scope = ownerFilter(req, 'user_id');
      query += scope.sql;
      params.push(...scope.params);

      query += ' ORDER BY timestamp DESC';

      const events = await db.all(query, ...params) as Array<Record<string, unknown>>;

      // CSV headers
      const headers = [
        'Timestamp',
        'Session ID',
        'Module',
        'Area',
        'Model',
        'Provider',
        'Thinking Level',
        'Creativity',
        'Writing Tone',
        'Input Tokens',
        'Output Tokens',
        'Cached Tokens',
        'Estimated Cost (USD)',
        'Response Status',
        'Review Status',
        'Reviewed By',
        'Reviewed At',
      ];

      // CSV rows
      const rows = events.map((e) => [
        e.timestamp,
        e.session_id || '',
        e.module_id || '',
        e.area_id || '',
        e.model || '',
        e.provider || '',
        e.thinking_level || '',
        e.creativity || '',
        e.writing_tone || '',
        e.input_token_count || 0,
        e.output_token_count || 0,
        e.cached_tokens || 0,
        e.estimated_cost_usd || 0,
        e.response_status || '',
        e.review_status || '',
        e.reviewed_by || '',
        e.reviewed_at || '',
      ]);

      // Escape CSV fields (handle quotes and commas)
      const escapeCsvField = (field: unknown): string => {
        const str = String(field);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const csv = [
        headers.join(','),
        ...rows.map((row) => row.map(escapeCsvField).join(',')),
      ].join('\n');

      const filename = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);

      console.log(`[Audit] Exported ${events.length} events to CSV`);
    } catch (error) {
      console.error('[Audit] Error exporting to CSV:', error);
      res.status(500).json({ error: 'Failed to export audit log', details: safeError(error) });
    }
  });

  // ============================================================================
  // E. SECURITY EVENTS
  // ============================================================================

  // The four routes below touch security_events and login_attempts. Neither table has
  // an ownership dimension — the rows are about the instance's security posture, and
  // login_attempts in particular holds usernames, IP addresses and failure reasons for
  // everybody, including failed attempts against accounts the caller does not own. They
  // are gated rather than scoped for that reason. The POST halves are self-report
  // endpoints with caller-chosen user_id/ip_address: unguarded, any user could drown
  // the security log in fabricated events or attribute a login failure to a colleague.
  // ANTON's own code never calls them (routes/auth.ts writes through
  // services/security-logger.ts directly), so gating them breaks no internal path.

  /**
   * GET /api/audit/security - Get security events
   */
  router.get('/audit/security', requireAdminOrSolo, async (req, res) => {
    try {
      const limit = req.query.limit ? (parseInt(req.query.limit as string, 10) || 100) : 100;
      const severity = req.query.severity as string;
      const resolved = req.query.resolved as string;

      let query = 'SELECT * FROM security_events WHERE 1=1';
      const params: unknown[] = [];

      if (severity) {
        query += ' AND severity = ?';
        params.push(severity);
      }

      if (resolved !== undefined) {
        query += ' AND resolved = ?';
        params.push(resolved === 'true' ? 1 : 0);
      }

      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);

      const events = await db.all(query, ...params);
      res.json(events);
    } catch (error) {
      console.error('[Audit] Error fetching security events:', error);
      res.status(500).json({ error: 'Failed to fetch security events', details: safeError(error) });
    }
  });

  /**
   * POST /api/audit/security - Log security event
   */
  router.post('/audit/security', requireAdminOrSolo, async (req, res) => {
    try {
      const event = req.body as SecurityEvent;

      if (!event.event_type) {
        res.status(400).json({ error: 'event_type is required' });
        return;
      }

      const result = await db.run(`
        INSERT INTO security_events (event_type, user_id, ip_address, details, severity)
        VALUES (?, ?, ?, ?, ?)
      `, 
        event.event_type,
        event.user_id || null,
        event.ip_address || null,
        event.details || null,
        event.severity || 'medium'
      );

      console.log(`[Audit] Logged security event: ${event.event_type} (severity: ${event.severity})`);
      res.json({ success: true, id: result.lastInsertRowid });
    } catch (error) {
      console.error('[Audit] Error logging security event:', error);
      res.status(500).json({ error: 'Failed to log security event', details: safeError(error) });
    }
  });

  // ============================================================================
  // F. LOGIN ATTEMPTS
  // ============================================================================

  /**
   * GET /api/audit/login-attempts - Get login attempts
   */
  router.get('/audit/login-attempts', requireAdminOrSolo, async (req, res) => {
    try {
      const limit = req.query.limit ? (parseInt(req.query.limit as string, 10) || 100) : 100;
      const username = req.query.username as string;
      const success = req.query.success as string;

      let query = 'SELECT * FROM login_attempts WHERE 1=1';
      const params: unknown[] = [];

      if (username) {
        query += ' AND username = ?';
        params.push(username);
      }

      if (success !== undefined) {
        query += ' AND success = ?';
        params.push(success === 'true' ? 1 : 0);
      }

      query += ' ORDER BY attempted_at DESC LIMIT ?';
      params.push(limit);

      const attempts = await db.all(query, ...params);
      res.json(attempts);
    } catch (error) {
      console.error('[Audit] Error fetching login attempts:', error);
      res.status(500).json({ error: 'Failed to fetch login attempts', details: safeError(error) });
    }
  });

  /**
   * POST /api/audit/login-attempts - Log login attempt
   */
  router.post('/audit/login-attempts', requireAdminOrSolo, async (req, res) => {
    try {
      const attempt = req.body as LoginAttempt;

      if (!attempt.username) {
        res.status(400).json({ error: 'username is required' });
        return;
      }

      const result = await db.run(`
        INSERT INTO login_attempts (username, user_id, ip_address, user_agent, success, failure_reason)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
        attempt.username,
        attempt.user_id || null,
        attempt.ip_address || null,
        attempt.user_agent || null,
        attempt.success ? 1 : 0,
        attempt.failure_reason || null
      );

      const eventType = attempt.success ? 'login_success' : 'login_failure';
      console.log(`[Audit] Logged login attempt: ${attempt.username} - ${eventType}`);

      res.json({ success: true, id: result.lastInsertRowid });
    } catch (error) {
      console.error('[Audit] Error logging login attempt:', error);
      res.status(500).json({ error: 'Failed to log login attempt', details: safeError(error) });
    }
  });

  console.log('[Audit] Comprehensive audit routes initialized');
  return router;
}
