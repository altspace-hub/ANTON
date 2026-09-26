import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

import { createInsightsGenerator } from '../services/insights-generator.js';
import { getAtomAbStats, setAtomAbEnabled } from '../services/atom-ab.js';
import { getCodingAtomAbStats } from '../services/coding-atom-stats.js';
import { getCodingAtomAbReport } from '../services/coding-atom-ab-report.js';
import { getAtomInjectionStatus, setAtomInjectionMode, isAtomInjectionMode } from '../services/atom-injection-gate.js';
import { safeError } from '../lib/error-response.js';
import { requireAdminOrSolo } from '../middleware/role-guards.js';
import { atomOwnerSql, searchScopeForRequest } from '../services/hybrid-search.js';
import { entityVisibleSql } from './knowledge-graph.js';

/** Narrow `unknown` thrown values to a user-safe error message. */
function errMsg(err: unknown): string {
  // Delegates to the shared safeError — redacts in production.
  return safeError(err);
}

// ── Whose atoms the dashboard reads (team mode) ─────────────────────────────
//
// Every atom this dashboard lists, counts, exports or hands to the insights
// model follows the rule that decides which atoms reach a person's prompts: in
// team mode a non-admin reads their own atoms and the shared ones (owner NULL),
// via atomOwnerSql(searchScopeForRequest(req)). Before 2026-09-23 the summary,
// the export and the insights served every user's atoms with their content.
// Entity nodes follow the knowledge graph's rule (entityVisibleSql). Solo and
// admins are unscoped, so their statements are exactly what they were.
// detected_patterns is instance-wide and appears here only as two counts.

export async function createIntelligenceDashboardRoutes(db: DatabaseAdapter) {
  const router = Router();
  // Insights run through the provider router (utility tier) — no client here.
  const insights = await createInsightsGenerator(db);

  // GET /api/intelligence/summary — aggregate stats for dashboard
  router.get('/intelligence/summary', async (req, res) => {
    try {
      const scope = searchScopeForRequest(req);
      const owner = atomOwnerSql(scope, 'owner_user_id');
      const entity = entityVisibleSql(scope, 'en.entity_type', 'en.entity_id');
      const stats = {
        totalAtoms: (await db.get(`SELECT COUNT(*) as n FROM knowledge_atoms WHERE is_active = 1${owner.sql}`, ...owner.params) as any).n,
        totalEntities: (await db.get(`SELECT COUNT(*) as n FROM entity_nodes en WHERE 1=1${entity.sql}`, ...entity.params) as any).n,
        totalPatterns: (await db.get("SELECT COUNT(*) as n FROM detected_patterns WHERE status = 'active'") as any).n,
        criticalPatterns: (await db.get("SELECT COUNT(*) as n FROM detected_patterns WHERE severity = 'critical' AND status = 'active'") as any).n,
        recentAtoms: await db.all(`SELECT * FROM knowledge_atoms WHERE is_active = 1${owner.sql} ORDER BY created_at DESC LIMIT 10`, ...owner.params),
        topEntities: await db.all(`SELECT en.* FROM entity_nodes en WHERE 1=1${entity.sql} ORDER BY en.interaction_count DESC LIMIT 10`, ...entity.params),
      };
      res.json(stats);
    } catch (error: unknown) {
      console.error('[intelligence/summary]', error);
      res.status(500).json({ error: errMsg(error) });
    }
  });

  // GET /api/intelligence/atom-ab — Wave 3.4: atom-layer A/B effectiveness.
  // Mean quality score per arm (injected vs holdout) + run counts + an honest
  // insufficient-data state below 30 scored runs per arm.
  router.get('/intelligence/atom-ab', async (_req, res) => {
    try {
      res.json(await getAtomAbStats(db));
    } catch (error: unknown) {
      console.error('[intelligence/atom-ab]', error);
      res.status(500).json({ error: errMsg(error) });
    }
  });

  // GET /api/intelligence/coding-atom-ab — ANTON Studio Phase 4: does the
  // PROJECT-SCOPED coding-atoms loop actually cut revise-rounds? Mean revise-
  // rounds per task (injected vs deterministic 20% holdout) + an honest
  // insufficient-data state below MIN_SCORED_PER_ARM tasks per arm. Measured,
  // not assumed (the Markets lesson).
  router.get('/intelligence/coding-atom-ab', async (_req, res) => {
    try {
      // Back-compat stats (means/delta) PLUS the honest effect-size +
      // significance verdict (coding-atom-ab-report.ts) that supersedes the
      // noise-blind `worksClaimSupported` flag.
      const [stats, report] = await Promise.all([
        getCodingAtomAbStats(db),
        getCodingAtomAbReport(db),
      ]);
      // Override the TOP-LEVEL worksClaimSupported with the honest, noise-aware
      // verdict so an API consumer reading only the legacy flag cannot overclaim
      // on a noise-sized delta. `report` carries the full effect-size detail.
      res.json({ ...stats, worksClaimSupported: report.worksClaimSupported, report });
    } catch (error: unknown) {
      console.error('[intelligence/coding-atom-ab]', error);
      res.status(500).json({ error: errMsg(error) });
    }
  });

  // POST /api/intelligence/atom-ab/toggle — experiment kill switch
  // (app_settings 'atom_ab_experiment'; default ON when atom injection is on).
  router.post('/intelligence/atom-ab/toggle', requireAdminOrSolo, async (req, res) => {
    try {
      const { enabled } = req.body as { enabled?: boolean };
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled (boolean) is required' });
      }
      await setAtomAbEnabled(db, enabled);
      res.json({ ok: true, enabled });
    } catch (error: unknown) {
      console.error('[intelligence/atom-ab/toggle]', error);
      res.status(500).json({ error: errMsg(error) });
    }
  });

  // GET /api/intelligence/atom-injection — Wave 4: the memory-injection gate.
  // Mode (auto / on / off), the two counts against their thresholds, whether
  // the general atom layer currently applies, and the reason in one sentence.
  // Always a fresh read (the dashboard is not the hot path).
  router.get('/intelligence/atom-injection', async (_req, res) => {
    try {
      res.json(await getAtomInjectionStatus(db, { fresh: true }));
    } catch (error: unknown) {
      console.error('[intelligence/atom-injection]', error);
      res.status(500).json({ error: errMsg(error) });
    }
  });

  // POST /api/intelligence/atom-injection/mode — body { mode: 'auto' | 'on' | 'off' }.
  router.post('/intelligence/atom-injection/mode', requireAdminOrSolo, async (req, res) => {
    try {
      const { mode } = (req.body ?? {}) as { mode?: unknown };
      if (!isAtomInjectionMode(mode)) {
        return res.status(400).json({ error: "mode must be 'auto', 'on' or 'off'" });
      }
      await setAtomInjectionMode(db, mode);
      res.json(await getAtomInjectionStatus(db, { fresh: true }));
    } catch (error: unknown) {
      console.error('[intelligence/atom-injection/mode]', error);
      res.status(500).json({ error: errMsg(error) });
    }
  });

  // GET /api/intelligence/temporal/atoms-per-day
  router.get('/intelligence/temporal/atoms-per-day', async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const owner = atomOwnerSql(searchScopeForRequest(req), 'owner_user_id');
      const results = await db.all(`
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM knowledge_atoms
        WHERE is_active = 1
          AND created_at >= ?${owner.sql}
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `, since, ...owner.params);
      res.json(results);
    } catch (error: unknown) {
      console.error('[intelligence/temporal/atoms-per-day]', error);
      res.status(500).json({ error: errMsg(error) });
    }
  });

  // GET /api/intelligence/temporal/patterns-per-week
  router.get('/intelligence/temporal/patterns-per-week', async (req, res) => {
    try {
      const weeks = parseInt(req.query.weeks as string) || 12;
      const since = new Date(Date.now() - weeks * 7 * 86400000).toISOString();
      const results = await db.all(`
        SELECT TO_CHAR(first_detected, 'IYYY-"W"IW') as week, COUNT(*) as count
        FROM detected_patterns
        WHERE first_detected >= ?
        GROUP BY week
        ORDER BY week ASC
      `, since);
      res.json(results);
    } catch (error: unknown) {
      console.error('[intelligence/temporal/patterns-per-week]', error);
      res.status(500).json({ error: errMsg(error) });
    }
  });

  // GET /api/intelligence/temporal/entity-activity
  router.get('/intelligence/temporal/entity-activity', async (req, res) => {
    try {
      const weeks = parseInt(req.query.weeks as string) || 12;
      const since = new Date(Date.now() - weeks * 7 * 86400000).toISOString();
      const owner = atomOwnerSql(searchScopeForRequest(req), 'knowledge_atoms.owner_user_id');
      const results = await db.all(`
        SELECT TO_CHAR(created_at, 'IYYY-"W"IW') as week, COUNT(DISTINCT entity_type || ':' || entity_id) as entity_count
        FROM knowledge_entity_refs
        JOIN knowledge_atoms ON knowledge_entity_refs.atom_id = knowledge_atoms.id
        WHERE knowledge_atoms.created_at >= ?${owner.sql}
        GROUP BY week
        ORDER BY week ASC
      `, since, ...owner.params);
      res.json(results);
    } catch (error: unknown) {
      console.error('[intelligence/temporal/entity-activity]', error);
      res.status(500).json({ error: errMsg(error) });
    }
  });

  // GET /api/intelligence/temporal/quality-trend
  router.get('/intelligence/temporal/quality-trend', async (req, res) => {
    try {
      const weeks = parseInt(req.query.weeks as string) || 12;
      const since = new Date(Date.now() - weeks * 7 * 86400000).toISOString();
      // knowledge_atoms has no quality_score column — use confidence as proxy
      const owner = atomOwnerSql(searchScopeForRequest(req), 'owner_user_id');
      const results = await db.all(`
        SELECT TO_CHAR(created_at, 'IYYY-"W"IW') as week, AVG(confidence) as avg_quality
        FROM knowledge_atoms
        WHERE confidence IS NOT NULL
          AND is_active = 1
          AND created_at >= ?${owner.sql}
        GROUP BY week
        ORDER BY week ASC
      `, since, ...owner.params);
      res.json(results);
    } catch (error: unknown) {
      console.error('[intelligence/temporal/quality-trend]', error);
      res.status(500).json({ error: errMsg(error) });
    }
  });

  // GET /api/intelligence/insights — generate AI insights from atoms
  router.get('/intelligence/insights', async (req, res) => {
    try {
      const timeRange = (req.query.timeRange as string) || 'week';
      const category = req.query.category as string | undefined;
      const areaId = req.query.areaId as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

      // The atoms sent to the model are the caller's own + shared ones: the
      // insights, and the supporting atom ids returned with them, quote them.
      const generatedInsights = await insights.generateInsights({
        timeRange: timeRange as any,
        category,
        areaId,
        limit,
        scope: searchScopeForRequest(req),
      });

      res.json({ insights: generatedInsights });
    } catch (error: unknown) {
      console.error('[intelligence/insights]', error);
      res.status(500).json({ error: errMsg(error) });
    }
  });

  // GET /api/intelligence/distribution — atom distribution by category
  router.get('/intelligence/distribution', async (req, res) => {
    try {
      const timeRange = (req.query.timeRange as string) || 'week';
      const distribution = await insights.getAtomDistribution({
        timeRange: timeRange as 'day' | 'week' | 'month' | 'all',
        scope: searchScopeForRequest(req),
      });
      res.json(distribution);
    } catch (error: unknown) {
      console.error('[intelligence/distribution]', error);
      res.status(500).json({ error: errMsg(error) });
    }
  });

  // GET /api/intelligence/top-entities — top entities by interaction count
  router.get('/intelligence/top-entities', async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const topEntities = await insights.getTopEntities(limit, searchScopeForRequest(req));
      res.json(topEntities);
    } catch (error: unknown) {
      console.error('[intelligence/top-entities]', error);
      res.status(500).json({ error: errMsg(error) });
    }
  });

  // GET /api/intelligence/sentiment-trend — sentiment trend over time
  router.get('/intelligence/sentiment-trend', async (req, res) => {
    try {
      const days = req.query.days ? parseInt(req.query.days as string, 10) : 30;
      const trend = await insights.getSentimentTrend(days, searchScopeForRequest(req));
      res.json(trend);
    } catch (error: unknown) {
      console.error('[intelligence/sentiment-trend]', error);
      res.status(500).json({ error: errMsg(error) });
    }
  });

  // GET /api/intelligence/export — export atoms to CSV/JSON/XLSX
  router.get('/intelligence/export', async (req, res) => {
    try {
      const format = (req.query.format as string) || 'json';
      const timeRange = req.query.timeRange as string | undefined;
      const category = req.query.category as string | undefined;

      // Build query — own + shared atoms in team mode (up to 1000 with content,
      // so this was the widest copy of every user's atoms on the server).
      const owner = atomOwnerSql(searchScopeForRequest(req), 'owner_user_id');
      let query = `SELECT * FROM knowledge_atoms WHERE is_active = 1${owner.sql}`;
      const queryParams: any[] = [...owner.params];

      if (timeRange) {
        const timeMap = {
          day: '1 day',
          week: '7 days',
          month: '30 days',
          all: '365 days',
        };
        query += ` AND created_at >= NOW() - INTERVAL '${timeMap[timeRange as keyof typeof timeMap]}'`;
      }

      if (category) {
        query += ' AND category = ?';
        queryParams.push(category);
      }

      query += ' ORDER BY created_at DESC LIMIT 1000';

      const atoms = await db.all(query, ...queryParams) as any[];

      if (format === 'csv') {
        // CSV export
        const headers = ['id', 'content', 'atom_type', 'category', 'confidence', 'sentiment', 'created_at'];
        const csvRows = [headers.join(',')];

        for (const atom of atoms) {
          const row = headers.map(h => {
            const val = atom[h];
            if (val === null || val === undefined) return '';
            return `"${String(val).replace(/"/g, '""')}"`;
          });
          csvRows.push(row.join(','));
        }

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="atoms-${Date.now()}.csv"`);
        res.send(csvRows.join('\n'));
      } else if (format === 'xlsx') {
        // XLSX export (simplified - would use exceljs in production)
        res.status(501).json({ error: 'XLSX export not yet implemented - use CSV or JSON' });
      } else {
        // JSON export (default)
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="atoms-${Date.now()}.json"`);
        res.json({ atoms, exported_at: new Date().toISOString(), count: atoms.length });
      }
    } catch (error: unknown) {
      console.error('[intelligence/export]', error);
      res.status(500).json({ error: errMsg(error) });
    }
  });

  return router;
}
