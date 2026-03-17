import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

import Anthropic from '@anthropic-ai/sdk';
import { createInsightsGenerator } from '../services/insights-generator.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

export async function createIntelligenceDashboardRoutes(db: DatabaseAdapter) {
  const router = Router();
  const insights = await createInsightsGenerator(db, anthropic);

  // GET /api/intelligence/summary — aggregate stats for dashboard
  router.get('/intelligence/summary', async (req, res) => {
    try {
      const stats = {
        totalAtoms: (await db.get('SELECT COUNT(*) as n FROM knowledge_atoms WHERE is_active = 1') as any).n,
        totalEntities: (await db.get('SELECT COUNT(*) as n FROM entity_nodes') as any).n,
        totalPatterns: (await db.get("SELECT COUNT(*) as n FROM detected_patterns WHERE status = 'active'") as any).n,
        criticalPatterns: (await db.get("SELECT COUNT(*) as n FROM detected_patterns WHERE severity = 'critical' AND status = 'active'") as any).n,
        recentAtoms: await db.all('SELECT * FROM knowledge_atoms WHERE is_active = 1 ORDER BY created_at DESC LIMIT 10'),
        topEntities: await db.all('SELECT * FROM entity_nodes ORDER BY interaction_count DESC LIMIT 10'),
      };
      res.json(stats);
    } catch (error: any) {
      console.error('[intelligence/summary]', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/intelligence/temporal/atoms-per-day
  router.get('/intelligence/temporal/atoms-per-day', async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const results = await db.all(`
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM knowledge_atoms
        WHERE is_active = 1
          AND created_at >= datetime('now', '-' || ? || ' days')
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `, days);
      res.json(results);
    } catch (error: any) {
      console.error('[intelligence/temporal/atoms-per-day]', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/intelligence/temporal/patterns-per-week
  router.get('/intelligence/temporal/patterns-per-week', async (req, res) => {
    try {
      const weeks = parseInt(req.query.weeks as string) || 12;
      const results = await db.all(`
        SELECT strftime('%Y-W%W', first_detected) as week, COUNT(*) as count
        FROM detected_patterns
        WHERE first_detected >= datetime('now', '-' || ? || ' weeks')
        GROUP BY week
        ORDER BY week ASC
      `, weeks);
      res.json(results);
    } catch (error: any) {
      console.error('[intelligence/temporal/patterns-per-week]', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/intelligence/temporal/entity-activity
  router.get('/intelligence/temporal/entity-activity', async (req, res) => {
    try {
      const weeks = parseInt(req.query.weeks as string) || 12;
      const results = await db.all(`
        SELECT strftime('%Y-W%W', created_at) as week, COUNT(DISTINCT entity_type || ':' || entity_id) as entity_count
        FROM knowledge_entity_refs
        JOIN knowledge_atoms ON knowledge_entity_refs.atom_id = knowledge_atoms.id
        WHERE knowledge_atoms.created_at >= datetime('now', '-' || ? || ' weeks')
        GROUP BY week
        ORDER BY week ASC
      `, weeks);
      res.json(results);
    } catch (error: any) {
      console.error('[intelligence/temporal/entity-activity]', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/intelligence/temporal/quality-trend
  router.get('/intelligence/temporal/quality-trend', async (req, res) => {
    try {
      const weeks = parseInt(req.query.weeks as string) || 12;
      // knowledge_atoms has no quality_score column — use confidence as proxy
      const results = await db.all(`
        SELECT strftime('%Y-W%W', created_at) as week, AVG(confidence) as avg_quality
        FROM knowledge_atoms
        WHERE confidence IS NOT NULL
          AND is_active = 1
          AND created_at >= datetime('now', '-' || ? || ' weeks')
        GROUP BY week
        ORDER BY week ASC
      `, weeks);
      res.json(results);
    } catch (error: any) {
      console.error('[intelligence/temporal/quality-trend]', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/intelligence/insights — generate AI insights from atoms
  router.get('/intelligence/insights', async (req, res) => {
    try {
      const timeRange = (req.query.timeRange as string) || 'week';
      const category = req.query.category as string | undefined;
      const areaId = req.query.areaId as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

      const generatedInsights = await insights.generateInsights({
        timeRange: timeRange as any,
        category,
        areaId,
        limit,
      });

      res.json({ insights: generatedInsights });
    } catch (error: any) {
      console.error('[intelligence/insights]', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/intelligence/distribution — atom distribution by category
  router.get('/intelligence/distribution', async (req, res) => {
    try {
      const timeRange = (req.query.timeRange as string) || 'week';
      const distribution = insights.getAtomDistribution({ timeRange: timeRange as any });
      res.json(distribution);
    } catch (error: any) {
      console.error('[intelligence/distribution]', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/intelligence/top-entities — top entities by interaction count
  router.get('/intelligence/top-entities', async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const topEntities = insights.getTopEntities(limit);
      res.json(topEntities);
    } catch (error: any) {
      console.error('[intelligence/top-entities]', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/intelligence/sentiment-trend — sentiment trend over time
  router.get('/intelligence/sentiment-trend', async (req, res) => {
    try {
      const days = req.query.days ? parseInt(req.query.days as string, 10) : 30;
      const trend = insights.getSentimentTrend(days);
      res.json(trend);
    } catch (error: any) {
      console.error('[intelligence/sentiment-trend]', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/intelligence/export — export atoms to CSV/JSON/XLSX
  router.get('/intelligence/export', async (req, res) => {
    try {
      const format = (req.query.format as string) || 'json';
      const timeRange = req.query.timeRange as string | undefined;
      const category = req.query.category as string | undefined;

      // Build query
      let query = 'SELECT * FROM knowledge_atoms WHERE is_active = 1';
      const queryParams: any[] = [];

      if (timeRange) {
        const timeMap = {
          day: '1 day',
          week: '7 days',
          month: '30 days',
          all: '365 days',
        };
        query += ` AND created_at >= datetime('now', '-${timeMap[timeRange as keyof typeof timeMap]}')`;
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
    } catch (error: any) {
      console.error('[intelligence/export]', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
