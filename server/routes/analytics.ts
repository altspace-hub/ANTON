import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';


export async function createAnalyticsRouter(db: DatabaseAdapter) {
  const router = Router();

  function getUserId(req: unknown): string {
    return (req as { user?: { id?: string } }).user?.id ?? 'default';
  }

  // Helper: build an array of date strings (YYYY-MM-DD) for the last N days
  function buildDateRange(days: number): string[] {
    const dates: string[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  }

  // GET /api/analytics/overview
  router.get('/overview', async (req, res) => {
    try {
      const userId = getUserId(req);
      const sessionRow = await db.get('SELECT COUNT(*) AS total FROM sessions WHERE user_id = ?', userId) as { total: number };
      const msgRow = await db.get('SELECT COUNT(*) AS total FROM messages m JOIN sessions s ON s.id = m.session_id WHERE s.user_id = ?', userId) as { total: number };
      const tokenCostRow = await db.get(
        'SELECT COALESCE(SUM(m.token_count), 0) AS "totalTokens", COALESCE(SUM(m.cost), 0) AS "totalCost" FROM messages m JOIN sessions s ON s.id = m.session_id WHERE s.user_id = ?'
      , userId) as { totalTokens: number; totalCost: number };
      const moduleRow = await db.get('SELECT COUNT(DISTINCT module_id) AS unique_modules FROM sessions WHERE user_id = ?', userId) as {
        unique_modules: number;
      };

      // PG returns COUNT/SUM as strings (bigint/numeric) — coerce so the JSON
      // contract is numeric (the client formats these with toFixed etc).
      const totalSessions = Number(sessionRow.total);
      const totalMessages = Number(msgRow.total);
      const totalTokens = Number(tokenCostRow.totalTokens);
      const totalCost = Number(tokenCostRow.totalCost);
      const uniqueModules = Number(moduleRow.unique_modules);
      const avgCostPerSession = totalSessions > 0 ? totalCost / totalSessions : 0;

      res.json({ totalSessions, totalMessages, totalTokens, totalCost, uniqueModules, avgCostPerSession });
    } catch (err) {
      console.error('[analytics/overview]', err);
      res.status(500).json({ error: 'Failed to fetch overview' });
    }
  });

  // GET /api/analytics/sessions-over-time?days=30
  router.get('/sessions-over-time', async (req, res) => {
    try {
      const userId = getUserId(req);
      const days = Math.min(Math.max(parseInt(String(req.query.days || '30'), 10) || 30, 1), 365);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - (days - 1));
      const cutoffStr = cutoff.toISOString().slice(0, 10);

      const rows = await db.all(
        `SELECT date(created_at) AS date, COUNT(*) AS count
         FROM sessions
         WHERE date(created_at) >= ? AND user_id = ?
         GROUP BY date(created_at)
         ORDER BY date(created_at) ASC`
      , cutoffStr, userId) as Array<{ date: string; count: number }>;

      const lookup: Record<string, number> = {};
      for (const row of rows) lookup[row.date] = Number(row.count);

      const dateRange = buildDateRange(days);
      const result = dateRange.map((date) => ({ date, count: lookup[date] ?? 0 }));
      res.json(result);
    } catch (err) {
      console.error('[analytics/sessions-over-time]', err);
      res.status(500).json({ error: 'Failed to fetch sessions over time' });
    }
  });

  // GET /api/analytics/module-usage?limit=10
  router.get('/module-usage', async (req, res) => {
    try {
      const userId = getUserId(req);
      const limit = Math.min(Math.max(parseInt(String(req.query.limit || '10'), 10) || 10, 1), 50);

      const rows = await db.all(
        `SELECT s.module_id AS "moduleId",
                COUNT(DISTINCT s.id) AS count,
                COALESCE(SUM(m.cost), 0) AS cost
         FROM sessions s
         LEFT JOIN messages m ON m.session_id = s.id
         WHERE s.user_id = ?
         GROUP BY s.module_id
         ORDER BY count DESC
         LIMIT ?`
      , userId, limit) as Array<{ moduleId: string | null; count: number; cost: number }>;

      // Humanise the module ID into a label. Guards null/empty (a session may have
      // no module_id) so the row renders as "Unknown" rather than throwing a 500.
      function toLabel(id: string | null | undefined): string {
        if (!id) return 'Unknown';
        return id
          .replace(/-/g, ' ')
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
      }

      const result = rows.map((r) => ({
        moduleId: r.moduleId,
        label: toLabel(r.moduleId),
        // PG COUNT/SUM come back as strings — coerce to numbers for the JSON contract.
        count: Number(r.count),
        cost: Number(r.cost),
      }));

      res.json(result);
    } catch (err) {
      console.error('[analytics/module-usage]', err);
      res.status(500).json({ error: 'Failed to fetch module usage' });
    }
  });

  // GET /api/analytics/cost-trend?days=30
  router.get('/cost-trend', async (req, res) => {
    try {
      const userId = getUserId(req);
      const days = Math.min(Math.max(parseInt(String(req.query.days || '30'), 10) || 30, 1), 365);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - (days - 1));
      const cutoffStr = cutoff.toISOString().slice(0, 10);

      const rows = await db.all(
        `SELECT date(m.created_at) AS date,
                COALESCE(SUM(m.cost), 0) AS cost,
                COALESCE(SUM(m.token_count), 0) AS tokens
         FROM messages m
         JOIN sessions s ON s.id = m.session_id
         WHERE date(m.created_at) >= ? AND s.user_id = ?
         GROUP BY date(m.created_at)
         ORDER BY date(m.created_at) ASC`
      , cutoffStr, userId) as Array<{ date: string; cost: number; tokens: number }>;

      const lookup: Record<string, { cost: number; tokens: number }> = {};
      for (const row of rows) lookup[row.date] = { cost: Number(row.cost), tokens: Number(row.tokens) };

      const dateRange = buildDateRange(days);
      const result = dateRange.map((date) => ({
        date,
        cost: lookup[date]?.cost ?? 0,
        tokens: lookup[date]?.tokens ?? 0,
      }));
      res.json(result);
    } catch (err) {
      console.error('[analytics/cost-trend]', err);
      res.status(500).json({ error: 'Failed to fetch cost trend' });
    }
  });

  // POST /api/analytics/budget-cap — update the global monthly budget cap (admin only)
  router.post('/budget-cap', async (req, res) => {
    try {
      const { cap } = req.body as { cap?: number };
      const value = typeof cap === 'number' && cap >= 0 ? cap : 0;
      await db.run("INSERT INTO app_settings (key, value) VALUES ('monthly_budget_cap', ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", String(value));
      res.json({ success: true, cap: value });
    } catch (err) {
      console.error('[analytics/budget-cap]', err);
      res.status(500).json({ error: 'Failed to save budget cap' });
    }
  });

  // GET /api/analytics/spending — monthly budget cap status
  // Returns { spent: number, cap: number, month: string }
  // cap = 0 means unlimited. spent is the sum of message costs for the current calendar month.
  router.get('/spending', async (req, res) => {
    try {
      const userId = getUserId(req);
      const now = new Date();
      const month = now.toISOString().slice(0, 7); // YYYY-MM
      // B1: read from messages.cost — the same source the global budget cap
      // enforcement sums (server/routes/claude.ts) — so the displayed "spent"
      // always matches what the cap actually trips on. messages.cost carries
      // the real cache-adjusted per-call cost; user-role rows have NULL cost
      // and SUM ignores them.
      const spentRow = await db.get<{ total: number }>(
        `SELECT COALESCE(SUM(cost), 0) as total
         FROM messages
         WHERE TO_CHAR(created_at, 'YYYY-MM') = ?`,
        month
      );
      const spent = parseFloat(String(spentRow?.total ?? 0)) || 0;

      // Read cap from app_settings, fall back to env var, then 0 (unlimited)
      const settingRow = await db.get<{ value: string }>(
        `SELECT value FROM app_settings WHERE key = 'monthly_budget_cap'`
      );
      const capFromDb = settingRow ? parseFloat(settingRow.value) : NaN;
      const capFromEnv = parseFloat(process.env.MONTHLY_BUDGET_CAP || '0');
      const cap = !isNaN(capFromDb) ? capFromDb : capFromEnv;

      res.json({ spent, cap, month });
    } catch (err) {
      console.error('[analytics/spending]', err);
      res.status(500).json({ error: 'Failed to fetch spending' });
    }
  });

  return router;
}
