import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

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

// Model pricing (per 1M tokens) - Updated Mar 2026 (1M context GA pricing)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'gemini-2.5-flash': { input: 0.30, output: 2.5 },
  'gemini-2.0-flash': { input: 0.10, output: 0.40 },
  'mistral-large-latest': { input: 0.50, output: 1.50 },
  'mistral-medium-latest': { input: 0.40, output: 2.00 },
  'mistral-small-latest': { input: 0.10, output: 0.30 },
  'magistral-medium-latest': { input: 2.00, output: 5.00 },
  'magistral-small-latest': { input: 0.50, output: 1.50 },
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
      const events = await db.all(query, ...params);

      res.json(events);
    } catch (error) {
      console.error('[Audit] Error fetching events:', error);
      res.status(500).json({ error: 'Failed to fetch audit events', details: String(error) });
    }
  });

  /**
   * GET /api/audit/events/:id - Get specific audit event
   */
  router.get('/audit/events/:id', async (req, res) => {
    try {
      const event = await db.get('SELECT * FROM audit_log WHERE id = ?', req.params.id);
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
  router.delete('/audit/events/:id', async (req, res) => {
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
      res.status(500).json({ error: 'Failed to delete audit event', details: String(error) });
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
      const events = await getAuditLog(db, filters);
      res.json(events);
    } catch (error) {
      console.error('[Audit] Error in legacy endpoint:', error);
      res.status(500).json({ error: 'Failed to fetch audit log', details: String(error) });
    }
  });

  /**
   * PATCH /api/audit/:id/review - Update review status
   */
  router.patch('/audit/:id/review', async (req, res) => {
    try {
      const { status, reviewedBy } = req.body as { status: string; reviewedBy?: string };

      if (!['draft', 'reviewed', 'approved'].includes(status)) {
        res.status(400).json({ error: 'Invalid status. Must be: draft, reviewed, or approved' });
        return;
      }

      const result = await db.run(
        'UPDATE audit_log SET review_status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?'
      , status, reviewedBy || null, new Date().toISOString(), req.params.id);

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
  router.get('/audit/stats', async (_req, res) => {
    try {
      const stats = await getAuditStats(db);
      res.json(stats);
    } catch (error) {
      console.error('[Audit] Error fetching stats:', error);
      res.status(500).json({ error: 'Failed to fetch statistics', details: String(error) });
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

      query += ' GROUP BY model ORDER BY calls DESC';

      const modelStats = await db.all(query, ...params);
      res.json(modelStats);
    } catch (error) {
      console.error('[Audit] Error fetching model stats:', error);
      res.status(500).json({ error: 'Failed to fetch model statistics', details: String(error) });
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

      query += ' GROUP BY module_id ORDER BY calls DESC';

      const moduleStats = await db.all(query, ...params);
      res.json(moduleStats);
    } catch (error) {
      console.error('[Audit] Error fetching module stats:', error);
      res.status(500).json({ error: 'Failed to fetch module statistics', details: String(error) });
    }
  });

  /**
   * GET /api/audit/stats/users - Usage breakdown by user (team mode)
   */
  router.get('/audit/stats/users', async (req, res) => {
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
      res.status(500).json({ error: 'Failed to fetch user statistics', details: String(error) });
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

      const query = `
        SELECT
          TO_CHAR(timestamp, '${dateFormat}') as period,
          COUNT(*) as calls,
          SUM(estimated_cost_usd) as total_cost,
          SUM(input_token_count) as total_input_tokens,
          SUM(output_token_count) as total_output_tokens
        FROM audit_log
        WHERE timestamp >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY period
        ORDER BY period DESC
      `;

      const costTrends = await db.all(query);

      // Calculate totals
      const totals = await db.get(`
        SELECT
          COUNT(*) as total_calls,
          SUM(estimated_cost_usd) as total_cost,
          AVG(estimated_cost_usd) as avg_cost_per_call,
          SUM(input_token_count) as total_input_tokens,
          SUM(output_token_count) as total_output_tokens
        FROM audit_log
        WHERE timestamp >= CURRENT_DATE - INTERVAL '30 days'
      `);

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
      res.status(500).json({ error: 'Failed to export audit log', details: String(error) });
    }
  });

  // ============================================================================
  // E. SECURITY EVENTS
  // ============================================================================

  /**
   * GET /api/audit/security - Get security events
   */
  router.get('/audit/security', async (req, res) => {
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
      res.status(500).json({ error: 'Failed to fetch security events', details: String(error) });
    }
  });

  /**
   * POST /api/audit/security - Log security event
   */
  router.post('/audit/security', async (req, res) => {
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
      res.status(500).json({ error: 'Failed to log security event', details: String(error) });
    }
  });

  // ============================================================================
  // F. LOGIN ATTEMPTS
  // ============================================================================

  /**
   * GET /api/audit/login-attempts - Get login attempts
   */
  router.get('/audit/login-attempts', async (req, res) => {
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
      res.status(500).json({ error: 'Failed to fetch login attempts', details: String(error) });
    }
  });

  /**
   * POST /api/audit/login-attempts - Log login attempt
   */
  router.post('/audit/login-attempts', async (req, res) => {
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
      res.status(500).json({ error: 'Failed to log login attempt', details: String(error) });
    }
  });

  console.log('[Audit] Comprehensive audit routes initialized');
  return router;
}
