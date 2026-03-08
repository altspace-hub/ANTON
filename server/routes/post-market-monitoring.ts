/**
 * post-market-monitoring.ts
 * EUAI-04: Post-market monitoring log for EU AI Act Art. 72 compliance.
 *
 * Records quality ratings, reversals, amendments, complaints, and incidents
 * from deployed AI modules to support ongoing safety and quality monitoring.
 *
 * Endpoints:
 *   POST /api/pmm/events            — record a new event
 *   GET  /api/pmm/events            — list events (filterable, admin can see all)
 *   GET  /api/pmm/summary           — aggregated metrics (event counts by type/module)
 *   GET  /api/pmm/events/:id        — get a single event
 *   PUT  /api/pmm/events/:id/review — admin: mark reviewed
 */

import express from 'express';
import type { Database } from 'better-sqlite3';

const VALID_EVENT_TYPES = ['quality_rating', 'reversal', 'amendment', 'complaint', 'incident'] as const;
const VALID_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

function getUserId(req: unknown): string {
  return (req as { user?: { id?: string } }).user?.id ?? 'default';
}
function getUserRole(req: unknown): string | undefined {
  return (req as { user?: { role?: string } }).user?.role;
}

export function createPostMarketMonitoringRoutes(db: Database) {
  const router = express.Router();

  /** POST /pmm/events — record a new event */
  router.post('/pmm/events', (req, res) => {
    try {
      const userId = getUserId(req);
      const {
        session_id, module_id, event_type, severity,
        quality_score, description, corrective_action, metadata,
      } = req.body as Record<string, unknown>;

      if (!event_type || !VALID_EVENT_TYPES.includes(event_type as typeof VALID_EVENT_TYPES[number])) {
        return res.status(400).json({ error: `event_type must be one of: ${VALID_EVENT_TYPES.join(', ')}` });
      }
      if (!description || typeof description !== 'string' || !(description as string).trim()) {
        return res.status(400).json({ error: 'description is required' });
      }
      if ((description as string).length > 5000) {
        return res.status(400).json({ error: 'description too long (max 5000 chars)' });
      }
      if (severity && !VALID_SEVERITIES.includes(severity as typeof VALID_SEVERITIES[number])) {
        return res.status(400).json({ error: `severity must be one of: ${VALID_SEVERITIES.join(', ')}` });
      }
      if (quality_score !== undefined && quality_score !== null) {
        const qs = Number(quality_score);
        if (isNaN(qs) || qs < 1 || qs > 5) {
          return res.status(400).json({ error: 'quality_score must be 1-5' });
        }
      }

      const result = db.prepare(`
        INSERT INTO post_market_events
          (user_id, session_id, module_id, event_type, severity,
           quality_score, description, corrective_action, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        (session_id as string | null) ?? null,
        (module_id as string | null) ?? null,
        event_type,
        (severity as string | null) ?? null,
        quality_score !== undefined && quality_score !== null ? Number(quality_score) : null,
        (description as string).trim(),
        (corrective_action as string | null)?.trim() ?? null,
        metadata ? JSON.stringify(metadata) : null,
      );

      const event = db.prepare('SELECT * FROM post_market_events WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json({ event });
    } catch (err) {
      console.error('[pmm] POST /pmm/events error:', err);
      res.status(500).json({ error: 'Failed to record event' });
    }
  });

  /** GET /pmm/events — list events */
  router.get('/pmm/events', (req, res) => {
    try {
      const userId = getUserId(req);
      const userRole = getUserRole(req);
      const { event_type, module_id, severity, limit: limitStr, offset: offsetStr } = req.query as Record<string, string | undefined>;

      const limit = Math.min(parseInt(limitStr ?? '50', 10) || 50, 500);
      const offset = parseInt(offsetStr ?? '0', 10) || 0;

      // Admins can see all events; regular users see only their own
      const isAdmin = userRole === 'admin';
      let sql = 'SELECT * FROM post_market_events WHERE 1=1';
      const params: unknown[] = [];

      if (!isAdmin) {
        sql += ' AND user_id = ?';
        params.push(userId);
      }
      if (event_type) { sql += ' AND event_type = ?'; params.push(event_type); }
      if (module_id)  { sql += ' AND module_id = ?';  params.push(module_id); }
      if (severity)   { sql += ' AND severity = ?';   params.push(severity); }

      const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
      const { total } = db.prepare(countSql).get(...params) as { total: number };

      sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const events = db.prepare(sql).all(...params);
      res.json({ events, total, limit, offset });
    } catch (err) {
      console.error('[pmm] GET /pmm/events error:', err);
      res.status(500).json({ error: 'Failed to fetch events' });
    }
  });

  /** GET /pmm/summary — aggregated metrics */
  router.get('/pmm/summary', (req, res) => {
    try {
      const userId = getUserId(req);
      const userRole = getUserRole(req);
      const isAdmin = userRole === 'admin';

      const userFilter = isAdmin ? '' : 'WHERE user_id = ?';
      const params: unknown[] = isAdmin ? [] : [userId];

      const byType = db.prepare(`
        SELECT event_type, COUNT(*) as count
        FROM post_market_events ${userFilter}
        GROUP BY event_type
      `).all(...params);

      const byModule = db.prepare(`
        SELECT module_id, event_type, COUNT(*) as count,
               AVG(CASE WHEN quality_score IS NOT NULL THEN quality_score END) as avg_quality
        FROM post_market_events ${userFilter}
        ${userFilter ? 'AND' : 'WHERE'} module_id IS NOT NULL
        GROUP BY module_id, event_type
        ORDER BY module_id, event_type
      `).all(...(isAdmin ? [] : [userId]));

      const recentIncidents = db.prepare(`
        SELECT * FROM post_market_events
        ${userFilter}
        ${userFilter ? 'AND' : 'WHERE'} (event_type = 'incident' OR severity IN ('high', 'critical'))
        ORDER BY created_at DESC LIMIT 5
      `).all(...(isAdmin ? [] : [userId]));

      res.json({ byType, byModule, recentIncidents });
    } catch (err) {
      console.error('[pmm] GET /pmm/summary error:', err);
      res.status(500).json({ error: 'Failed to fetch summary' });
    }
  });

  /** GET /pmm/events/:id */
  router.get('/pmm/events/:id', (req, res) => {
    try {
      const userId = getUserId(req);
      const userRole = getUserRole(req);
      const isAdmin = userRole === 'admin';
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid event id' });

      const event = isAdmin
        ? db.prepare('SELECT * FROM post_market_events WHERE id = ?').get(id)
        : db.prepare('SELECT * FROM post_market_events WHERE id = ? AND user_id = ?').get(id, userId);

      if (!event) return res.status(404).json({ error: 'Event not found' });
      res.json({ event });
    } catch (err) {
      console.error('[pmm] GET /pmm/events/:id error:', err);
      res.status(500).json({ error: 'Failed to fetch event' });
    }
  });

  /** PUT /pmm/events/:id/review — admin marks as reviewed */
  router.put('/pmm/events/:id/review', (req, res) => {
    try {
      const userRole = getUserRole(req);
      if (userRole !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid event id' });

      const { reviewer_name } = req.body as { reviewer_name?: string };
      if (!reviewer_name?.trim()) return res.status(400).json({ error: 'reviewer_name required' });

      db.prepare(`
        UPDATE post_market_events
        SET reviewed_by = ?, reviewed_at = datetime('now')
        WHERE id = ?
      `).run(reviewer_name.trim(), id);

      const event = db.prepare('SELECT * FROM post_market_events WHERE id = ?').get(id);
      res.json({ event });
    } catch (err) {
      console.error('[pmm] PUT review error:', err);
      res.status(500).json({ error: 'Failed to update review' });
    }
  });

  return router;
}
