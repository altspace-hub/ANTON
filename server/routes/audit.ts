import { Router } from 'express';
import type Database from 'better-sqlite3';
import { getAuditLog, getAuditStats } from '../services/auditLogger.js';

// ============================================================================
// COMPREHENSIVE AUDIT LOG BACKEND
// ============================================================================
// Production-grade audit system for compliance and security tracking
// Supports: filtering, pagination, statistics, export, security events
// ============================================================================

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

// Model pricing (per 1M tokens) - Updated Feb 2025
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6': { input: 15, output: 75 },
  'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4 },
  'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
  'claude-3-5-haiku-20241022': { input: 1, output: 5 },
};

/**
 * Calculate cost from token usage
 */
function calculateCost(inputTokens: number, outputTokens: number, model: string): number {
  const pricing = MODEL_PRICING[model] || { input: 3, output: 15 }; // Default to Sonnet pricing
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

export function createAuditRoutes(db: Database.Database) {
  const router = Router();

  // ============================================================================
  // A. CORE AUDIT ENDPOINTS
  // ============================================================================

  /**
   * GET /api/audit/events - List audit events with comprehensive filtering
   */
  router.get('/audit/events', (req, res) => {
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
        sortOrder: (req.query.sortOrder as 'ASC' | 'DESC') || 'DESC',
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

      // Sorting
      const validSortColumns = ['timestamp', 'model', 'module_id', 'estimated_cost_usd', 'input_token_count', 'output_token_count'];
      const sortColumn = validSortColumns.includes(filters.sortBy || '') ? filters.sortBy : 'timestamp';
      query += ` ORDER BY ${sortColumn} ${filters.sortOrder}`;

      // Pagination
      query += ' LIMIT ? OFFSET ?';
      params.push(filters.limit || 50, filters.offset || 0);

      console.log('[Audit] Query:', query, 'Params:', params);
      const events = db.prepare(query).all(...params);

      res.json(events);
    } catch (error) {
      console.error('[Audit] Error fetching events:', error);
      res.status(500).json({ error: 'Failed to fetch audit events', details: String(error) });
    }
  });

  /**
   * GET /api/audit/events/:id - Get specific audit event
   */
  router.get('/audit/events/:id', (req, res) => {
    try {
      const event = db.prepare('SELECT * FROM audit_log WHERE id = ?').get(req.params.id);
      if (!event) {
        res.status(404).json({ error: 'Audit event not found' });
        return;
      }
      res.json(event);
    } catch (error) {
      console.error('[Audit] Error fetching event:', error);
      res.status(500).json({ error: 'Failed to fetch audit event', details: String(error) });
    }
  });

  /**
   * DELETE /api/audit/events/:id - Delete audit event (admin only)
   */
  router.delete('/audit/events/:id', (req, res) => {
    try {
      const result = db.prepare('DELETE FROM audit_log WHERE id = ?').run(req.params.id);
      if (result.changes === 0) {
        res.status(404).json({ error: 'Audit event not found' });
        return;
      }
      console.log(`[Audit] Deleted event ${req.params.id}`);
      res.json({ success: true, deleted: req.params.id });
    } catch (error) {
      console.error('[Audit] Error deleting event:', error);
      res.status(500).json({ error: 'Failed to delete audit event', details: String(error) });
    }
  });

  // ============================================================================
  // B. LEGACY ENDPOINTS (for backward compatibility)
  // ============================================================================

  /**
   * GET /api/audit - Legacy endpoint (redirects to /audit/events)
   */
  router.get('/audit', (req, res) => {
    try {
      const filters = {
        sessionId: req.query.sessionId as string,
        moduleId: req.query.moduleId as string,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        limit: req.query.limit ? (parseInt(req.query.limit as string, 10) || 50) : 50,
        offset: req.query.offset ? (parseInt(req.query.offset as string, 10) || 0) : 0,
      };
      const events = getAuditLog(db, filters);
      res.json(events);
    } catch (error) {
      console.error('[Audit] Error in legacy endpoint:', error);
      res.status(500).json({ error: 'Failed to fetch audit log', details: String(error) });
    }
  });

  /**
   * PATCH /api/audit/:id/review - Update review status
   */
  router.patch('/audit/:id/review', (req, res) => {
    try {
      const { status, reviewedBy } = req.body as { status: string; reviewedBy?: string };

      if (!['draft', 'reviewed', 'approved'].includes(status)) {
        res.status(400).json({ error: 'Invalid status. Must be: draft, reviewed, or approved' });
        return;
      }

      const result = db.prepare(
        'UPDATE audit_log SET review_status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?'
      ).run(status, reviewedBy || null, new Date().toISOString(), req.params.id);

      if (result.changes === 0) {
        res.status(404).json({ error: 'Audit entry not found' });
        return;
      }

      console.log(`[Audit] Updated review status for ${req.params.id}: ${status}`);
      res.json({ success: true, id: req.params.id, status, reviewedBy });
    } catch (error) {
      console.error('[Audit] Error updating review status:', error);
      res.status(500).json({ error: 'Failed to update review status', details: String(error) });
    }
  });

  // ============================================================================
  // C. STATISTICS ENDPOINTS
  // ============================================================================

  /**
   * GET /api/audit/stats - Overall statistics
   */
  router.get('/audit/stats', (_req, res) => {
    try {
      const stats = getAuditStats(db);
      res.json(stats);
    } catch (error) {
      console.error('[Audit] Error fetching stats:', error);
      res.status(500).json({ error: 'Failed to fetch statistics', details: String(error) });
    }
  });

  /**
   * GET /api/audit/stats/models - Usage breakdown by model
   */
  router.get('/audit/stats/models', (req, res) => {
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

      query += ' GROUP BY model ORDER BY calls DESC';

      const modelStats = db.prepare(query).all(...params);
      res.json(modelStats);
    } catch (error) {
      console.error('[Audit] Error fetching model stats:', error);
      res.status(500).json({ error: 'Failed to fetch model statistics', details: String(error) });
    }
  });

  /**
   * GET /api/audit/stats/modules - Usage breakdown by module
   */
  router.get('/audit/stats/modules', (req, res) => {
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

      query += ' GROUP BY module_id ORDER BY calls DESC';

      const moduleStats = db.prepare(query).all(...params);
      res.json(moduleStats);
    } catch (error) {
      console.error('[Audit] Error fetching module stats:', error);
      res.status(500).json({ error: 'Failed to fetch module statistics', details: String(error) });
    }
  });

  /**
   * GET /api/audit/stats/users - Usage breakdown by user (team mode)
   */
  router.get('/audit/stats/users', (req, res) => {
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

      const userStats = db.prepare(query).all(...params);
      res.json(userStats);
    } catch (error) {
      console.error('[Audit] Error fetching user stats:', error);
      res.status(500).json({ error: 'Failed to fetch user statistics', details: String(error) });
    }
  });

  /**
   * GET /api/audit/stats/costs - Cost breakdown and trends
   */
  router.get('/audit/stats/costs', (req, res) => {
    try {
      const period = (req.query.period as string) || 'daily'; // daily, weekly, monthly

      let dateFormat = '%Y-%m-%d';
      if (period === 'weekly') dateFormat = '%Y-W%W';
      if (period === 'monthly') dateFormat = '%Y-%m';

      const query = `
        SELECT
          strftime('${dateFormat}', timestamp) as period,
          COUNT(*) as calls,
          SUM(estimated_cost_usd) as total_cost,
          SUM(input_token_count) as total_input_tokens,
          SUM(output_token_count) as total_output_tokens
        FROM audit_log
        WHERE timestamp >= date('now', '-30 days')
        GROUP BY period
        ORDER BY period DESC
      `;

      const costTrends = db.prepare(query).all();

      // Calculate totals
      const totals = db.prepare(`
        SELECT
          COUNT(*) as total_calls,
          SUM(estimated_cost_usd) as total_cost,
          AVG(estimated_cost_usd) as avg_cost_per_call,
          SUM(input_token_count) as total_input_tokens,
          SUM(output_token_count) as total_output_tokens
        FROM audit_log
        WHERE timestamp >= date('now', '-30 days')
      `).get();

      res.json({ trends: costTrends, totals });
    } catch (error) {
      console.error('[Audit] Error fetching cost stats:', error);
      res.status(500).json({ error: 'Failed to fetch cost statistics', details: String(error) });
    }
  });

  // ============================================================================
  // D. EXPORT ENDPOINT
  // ============================================================================

  /**
   * GET /api/audit/export - Export audit trail as CSV
   */
  router.get('/audit/export', (req, res) => {
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

      query += ' ORDER BY timestamp DESC';

      const events = db.prepare(query).all(...params) as Array<Record<string, unknown>>;

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
      res.status(500).json({ error: 'Failed to export audit log', details: String(error) });
    }
  });

  // ============================================================================
  // E. SECURITY EVENTS
  // ============================================================================

  /**
   * GET /api/audit/security - Get security events
   */
  router.get('/audit/security', (req, res) => {
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

      const events = db.prepare(query).all(...params);
      res.json(events);
    } catch (error) {
      console.error('[Audit] Error fetching security events:', error);
      res.status(500).json({ error: 'Failed to fetch security events', details: String(error) });
    }
  });

  /**
   * POST /api/audit/security - Log security event
   */
  router.post('/audit/security', (req, res) => {
    try {
      const event = req.body as SecurityEvent;

      if (!event.event_type) {
        res.status(400).json({ error: 'event_type is required' });
        return;
      }

      const result = db.prepare(`
        INSERT INTO security_events (event_type, user_id, ip_address, details, severity)
        VALUES (?, ?, ?, ?, ?)
      `).run(
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
      res.status(500).json({ error: 'Failed to log security event', details: String(error) });
    }
  });

  // ============================================================================
  // F. LOGIN ATTEMPTS
  // ============================================================================

  /**
   * GET /api/audit/login-attempts - Get login attempts
   */
  router.get('/audit/login-attempts', (req, res) => {
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

      const attempts = db.prepare(query).all(...params);
      res.json(attempts);
    } catch (error) {
      console.error('[Audit] Error fetching login attempts:', error);
      res.status(500).json({ error: 'Failed to fetch login attempts', details: String(error) });
    }
  });

  /**
   * POST /api/audit/login-attempts - Log login attempt
   */
  router.post('/audit/login-attempts', (req, res) => {
    try {
      const attempt = req.body as LoginAttempt;

      if (!attempt.username) {
        res.status(400).json({ error: 'username is required' });
        return;
      }

      const result = db.prepare(`
        INSERT INTO login_attempts (username, user_id, ip_address, user_agent, success, failure_reason)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
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
      res.status(500).json({ error: 'Failed to log login attempt', details: String(error) });
    }
  });

  console.log('[Audit] Comprehensive audit routes initialized');
  return router;
}
