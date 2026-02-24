import { Router } from 'express';
import Database from 'better-sqlite3';

export function createAnalyticsRouter(db: Database.Database) {
  const router = Router();

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
  router.get('/overview', (_req, res) => {
    try {
      const sessionRow = db.prepare('SELECT COUNT(*) AS total FROM sessions').get() as { total: number };
      const msgRow = db.prepare('SELECT COUNT(*) AS total FROM messages').get() as { total: number };
      const tokenCostRow = db.prepare(
        'SELECT COALESCE(SUM(token_count), 0) AS totalTokens, COALESCE(SUM(cost), 0) AS totalCost FROM messages'
      ).get() as { totalTokens: number; totalCost: number };
      const moduleRow = db.prepare('SELECT COUNT(DISTINCT module_id) AS unique_modules FROM sessions').get() as {
        unique_modules: number;
      };

      const totalSessions = sessionRow.total;
      const totalMessages = msgRow.total;
      const totalTokens = tokenCostRow.totalTokens;
      const totalCost = tokenCostRow.totalCost;
      const uniqueModules = moduleRow.unique_modules;
      const avgCostPerSession = totalSessions > 0 ? totalCost / totalSessions : 0;

      res.json({ totalSessions, totalMessages, totalTokens, totalCost, uniqueModules, avgCostPerSession });
    } catch (err) {
      console.error('[analytics/overview]', err);
      res.status(500).json({ error: 'Failed to fetch overview' });
    }
  });

  // GET /api/analytics/sessions-over-time?days=30
  router.get('/sessions-over-time', (req, res) => {
    try {
      const days = Math.min(Math.max(parseInt(String(req.query.days || '30'), 10) || 30, 1), 365);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - (days - 1));
      const cutoffStr = cutoff.toISOString().slice(0, 10);

      const rows = db.prepare(
        `SELECT date(created_at) AS date, COUNT(*) AS count
         FROM sessions
         WHERE date(created_at) >= ?
         GROUP BY date(created_at)
         ORDER BY date(created_at) ASC`
      ).all(cutoffStr) as Array<{ date: string; count: number }>;

      const lookup: Record<string, number> = {};
      for (const row of rows) lookup[row.date] = row.count;

      const dateRange = buildDateRange(days);
      const result = dateRange.map((date) => ({ date, count: lookup[date] ?? 0 }));
      res.json(result);
    } catch (err) {
      console.error('[analytics/sessions-over-time]', err);
      res.status(500).json({ error: 'Failed to fetch sessions over time' });
    }
  });

  // GET /api/analytics/module-usage?limit=10
  router.get('/module-usage', (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(String(req.query.limit || '10'), 10) || 10, 1), 50);

      const rows = db.prepare(
        `SELECT s.module_id AS moduleId,
                COUNT(DISTINCT s.id) AS count,
                COALESCE(SUM(m.cost), 0) AS cost
         FROM sessions s
         LEFT JOIN messages m ON m.session_id = s.id
         GROUP BY s.module_id
         ORDER BY count DESC
         LIMIT ?`
      ).all(limit) as Array<{ moduleId: string; count: number; cost: number }>;

      // Humanise the module ID into a label
      function toLabel(id: string): string {
        return id
          .replace(/-/g, ' ')
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
      }

      const result = rows.map((r) => ({
        moduleId: r.moduleId,
        label: toLabel(r.moduleId),
        count: r.count,
        cost: r.cost,
      }));

      res.json(result);
    } catch (err) {
      console.error('[analytics/module-usage]', err);
      res.status(500).json({ error: 'Failed to fetch module usage' });
    }
  });

  // GET /api/analytics/cost-trend?days=30
  router.get('/cost-trend', (req, res) => {
    try {
      const days = Math.min(Math.max(parseInt(String(req.query.days || '30'), 10) || 30, 1), 365);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - (days - 1));
      const cutoffStr = cutoff.toISOString().slice(0, 10);

      const rows = db.prepare(
        `SELECT date(created_at) AS date,
                COALESCE(SUM(cost), 0) AS cost,
                COALESCE(SUM(token_count), 0) AS tokens
         FROM messages
         WHERE date(created_at) >= ?
         GROUP BY date(created_at)
         ORDER BY date(created_at) ASC`
      ).all(cutoffStr) as Array<{ date: string; cost: number; tokens: number }>;

      const lookup: Record<string, { cost: number; tokens: number }> = {};
      for (const row of rows) lookup[row.date] = { cost: row.cost, tokens: row.tokens };

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
  router.post('/budget-cap', (req, res) => {
    try {
      const { cap } = req.body as { cap?: number };
      const value = typeof cap === 'number' && cap >= 0 ? cap : 0;
      db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('monthly_budget_cap', ?)").run(String(value));
      res.json({ success: true, cap: value });
    } catch (err) {
      console.error('[analytics/budget-cap]', err);
      res.status(500).json({ error: 'Failed to save budget cap' });
    }
  });

  // GET /api/analytics/spending — monthly budget cap status
  // Returns { spent: number, cap: number, month: string }
  // cap = 0 means unlimited. spent is the sum of message costs for the current calendar month.
  router.get('/spending', (_req, res) => {
    try {
      const now = new Date();
      const month = now.toISOString().slice(0, 7); // YYYY-MM

      const spentRow = db.prepare(
        `SELECT COALESCE(SUM(cost), 0) as total
         FROM messages
         WHERE strftime('%Y-%m', created_at) = ?`
      ).get(month) as { total: number };

      const spent = spentRow.total ?? 0;

      // Read cap from app_settings, fall back to env var, then 0 (unlimited)
      const settingRow = db.prepare("SELECT value FROM app_settings WHERE key = 'monthly_budget_cap'").get() as { value: string } | undefined;
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
