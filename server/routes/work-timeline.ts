/**
 * work-timeline.ts — GET /api/work-timeline
 * (CORE_EXPERIENCE_REVIEW 2026-06, item 4.3 — unified "yesterday" view.)
 *
 * Work fragments across five stores: sessions (module runs, open chat,
 * councils, workflows-as-sessions), engagements (latest iteration =
 * timestamp), workflow_runs (headless/scheduled engine), workflow_executions
 * (interactive engine), discovery_sessions. One UNION ALL — a single round
 * trip — returns type-tagged rows ordered by a common updated_at, paginated
 * with ?before= (exclusive cursor) and filtered with ?types=a,b,c.
 *
 * Row shape: { type, id, title, subtitle, status, cost, updated_at, resumeUrl }
 *
 * Resume-link mapping (computed server-side so the UI never guesses):
 *   session             open-chat/null → /prompt?session=ID
 *                       ai-council     → /council?session=ID
 *                       engagement     → /prompt?session=ID (bridged 4.4 rows
 *                                        are EXCLUDED from this arm — they
 *                                        surface via their engagement instead)
 *                       else           → /module/{module_id}?session=ID
 *   engagement          /engagements/{id}
 *   workflow_run        /workflows?run={id}        (deep-link target for the
 *   workflow_execution  /workflows?execution={id}   4.1 resume view; today the
 *                                                   workflows page ignores the
 *                                                   param — link still lands)
 *   discovery           /discover?session={id}     (DiscoverPage resumes it)
 *
 * Noise control: market-orchestrator cron runs (user_id 'system',
 * trigger_source 'market-orchestrator') are excluded — they are machine
 * heartbeat, not the user's work. Sessions require ≥1 message so empty
 * shells don't clutter the feed. Non-admin users (team mode) see only their
 * own rows; solo mode is admin and sees everything.
 */

import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { safeError } from '../lib/error-response.js';

export const TIMELINE_TYPES = [
  'session',
  'engagement',
  'workflow_run',
  'workflow_execution',
  'discovery',
] as const;

export type TimelineType = (typeof TIMELINE_TYPES)[number];

interface TimelineRow {
  type: TimelineType;
  id: string;
  title: string | null;
  subtitle: string | null;
  status: string | null;
  cost: number | string | null;
  updated_at: string | Date;
  ref: string | null;
}

function resumeUrl(row: TimelineRow): string {
  switch (row.type) {
    case 'session': {
      const moduleId = row.ref;
      if (!moduleId || moduleId === 'open-chat' || moduleId === 'engagement') {
        return `/prompt?session=${row.id}`;
      }
      if (moduleId === 'ai-council') return `/council?session=${row.id}`;
      return `/module/${moduleId}?session=${row.id}`;
    }
    case 'engagement':
      return `/engagements/${row.id}`;
    case 'workflow_run':
      return `/workflows?run=${row.id}`;
    case 'workflow_execution':
      return `/workflows?execution=${row.id}`;
    case 'discovery':
      return `/discover?session=${row.id}`;
  }
}

export function createWorkTimelineRoutes(db: DatabaseAdapter): Router {
  const router = Router();

  router.get('/work-timeline', async (req, res) => {
    try {
      const userId = req.user?.id;
      const isAdmin = req.user?.role === 'admin';
      const limit = Math.min(Math.max(parseInt(String(req.query.limit)) || 30, 1), 100);
      // Keyset cursor: "<updated_at ISO>|<id>" so rows that share a boundary
      // timestamp are not dropped between pages. Older single-value cursors
      // (just a timestamp) are still accepted — the id half defaults to the
      // max sentinel so the first page after such a cursor is inclusive-safe.
      const rawBefore = typeof req.query.before === 'string' && req.query.before.trim()
        ? req.query.before.trim() : null;
      let beforeTs: string | null = null;
      let beforeId: string | null = null;
      if (rawBefore) {
        const sep = rawBefore.lastIndexOf('|');
        if (sep > 0) {
          beforeTs = rawBefore.slice(0, sep);
          beforeId = rawBefore.slice(sep + 1);
        } else {
          beforeTs = rawBefore;
          beforeId = null;
        }
      }

      // ?types=session,engagement or repeated ?types[]=…
      const rawTypes = ([] as string[]).concat(
        (req.query.types as string | string[] | undefined) ?? [],
        (req.query['types[]'] as string | string[] | undefined) ?? [],
      );
      const requested = rawTypes
        .flatMap((t) => t.split(','))
        .map((t) => t.trim())
        .filter((t): t is TimelineType => (TIMELINE_TYPES as readonly string[]).includes(t));
      const types: TimelineType[] = requested.length > 0 ? [...new Set(requested)] : [...TIMELINE_TYPES];

      const arms: string[] = [];
      const params: unknown[] = [];

      if (types.includes('session')) {
        // Bridged engagement sessions (module_id 'engagement') are excluded:
        // their engagement row carries them (latest-iteration timestamp), so
        // the feed doesn't show the same execution twice.
        arms.push(`
          SELECT 'session' AS type, s.id AS id, s.title AS title,
                 s.module_id AS subtitle, s.review_status AS status,
                 (SELECT SUM(m.cost) FROM messages m WHERE m.session_id = s.id) AS cost,
                 s.updated_at AS updated_at,
                 s.module_id AS ref
          FROM sessions s
          WHERE s.module_id != 'engagement'
            AND EXISTS (SELECT 1 FROM messages m2 WHERE m2.session_id = s.id)
            ${isAdmin ? '' : 'AND s.user_id = ?'}
        `);
        if (!isAdmin) params.push(userId);
      }

      if (types.includes('engagement')) {
        arms.push(`
          SELECT 'engagement' AS type, e.id, e.title,
                 e.client_name AS subtitle, e.status,
                 -- Real cost: sum the bridged-session message costs across all
                 -- of this engagement's iterations (item 4.4 bridge writes
                 -- messages.cost). No bridged sessions → NULL, honest.
                 (SELECT SUM(m.cost)
                    FROM messages m
                    JOIN engagement_iterations it2 ON it2.session_id = m.session_id
                   WHERE it2.engagement_id = e.id) AS cost,
                 COALESCE(
                   (SELECT MAX(it.created_at) FROM engagement_iterations it WHERE it.engagement_id = e.id),
                   e.updated_at
                 ) AS updated_at,
                 NULL AS ref
          FROM engagements e
          WHERE e.status != 'archived'
            ${isAdmin ? '' : 'AND e.user_id = ?'}
        `);
        if (!isAdmin) params.push(userId);
      }

      if (types.includes('workflow_run')) {
        arms.push(`
          SELECT 'workflow_run' AS type, r.id,
                 COALESCE(wd.name, r.workflow_id) AS title,
                 r.workflow_id AS subtitle, r.status,
                 NULL::double precision AS cost,
                 r.started_at AS updated_at,
                 r.workflow_id AS ref
          FROM workflow_runs r
          LEFT JOIN workflow_definitions wd ON wd.id = r.workflow_id
          WHERE COALESCE(r.trigger_source, '') != 'market-orchestrator'
            AND COALESCE(r.user_id, '') != 'system'
            ${isAdmin ? '' : 'AND r.user_id = ?'}
        `);
        if (!isAdmin) params.push(userId);
      }

      if (types.includes('workflow_execution')) {
        arms.push(`
          SELECT 'workflow_execution' AS type, x.id,
                 COALESCE(NULLIF(x.workflow_name, ''), x.workflow_id) AS title,
                 x.workflow_id AS subtitle, x.status,
                 NULL::double precision AS cost,
                 COALESCE(x.completed_at, x.started_at) AS updated_at,
                 x.workflow_id AS ref
          FROM workflow_executions x
          ${isAdmin ? '' : 'WHERE (x.user_id = ? OR x.created_by = ?)'}
        `);
        if (!isAdmin) params.push(userId, userId);
      }

      if (types.includes('discovery')) {
        // "Resumable" = anything not abandoned; completed sessions resume to
        // their output view (DiscoverPage handles status === 'completed').
        arms.push(`
          SELECT 'discovery' AS type, d.id,
                 COALESCE(
                   (SELECT o.title FROM discovery_outputs o WHERE o.session_id = d.id ORDER BY o.created_at DESC LIMIT 1),
                   'Discovery session'
                 ) AS title,
                 d.tier AS subtitle, d.status,
                 NULL::double precision AS cost,
                 COALESCE(d.completed_at, d.last_active_at, d.started_at) AS updated_at,
                 NULL AS ref
          FROM discovery_sessions d
          WHERE d.status != 'abandoned'
            ${isAdmin ? '' : 'AND d.user_id = ?'}
        `);
        if (!isAdmin) params.push(userId);
      }

      let outerWhere = '';
      if (beforeTs && beforeId !== null) {
        // Strict keyset: (updated_at, id) tuple strictly before the cursor.
        outerWhere = 'WHERE (t.updated_at < ?::timestamptz OR (t.updated_at = ?::timestamptz AND t.id < ?))';
        params.push(beforeTs, beforeTs, beforeId);
      } else if (beforeTs) {
        // Legacy timestamp-only cursor — exclusive on the timestamp.
        outerWhere = 'WHERE t.updated_at < ?::timestamptz';
        params.push(beforeTs);
      }
      params.push(limit);

      const sql = `
        SELECT * FROM (
          ${arms.join('\n UNION ALL \n')}
        ) t
        ${outerWhere}
        ORDER BY t.updated_at DESC, t.id DESC
        LIMIT ?
      `;

      const rows = await db.all(sql, ...params) as TimelineRow[];
      const items = rows.map((r) => ({
        type: r.type,
        id: r.id,
        title: r.title || null,
        subtitle: r.subtitle || null,
        status: r.status || null,
        cost: r.cost === null || r.cost === undefined ? null : Number(r.cost),
        // Normalize to a stable ISO string so the keyset cursor we emit below
        // round-trips byte-for-byte (PG returns timestamptz as a Date object;
        // JSON-serializing it would also give ISO, but the cursor is built in
        // JS — keep both halves identical).
        updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
        resumeUrl: resumeUrl(r),
      }));

      const last = items.length === limit ? items[items.length - 1] : null;
      res.json({
        items,
        // Keyset cursor encodes both halves so the next page resumes exactly
        // after the last row even when timestamps collide.
        nextBefore: last ? `${last.updated_at}|${last.id}` : null,
      });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
