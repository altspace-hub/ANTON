import { Router } from 'express';
import type Database from 'better-sqlite3';
import Anthropic from '@anthropic-ai/sdk';
import * as cron from 'node-cron';
import { createRegulatoryRadar } from '../services/regulatory-radar.js';
import type { createRadarFetcher } from '../services/radar-fetcher.js';

type RadarFetcher = ReturnType<typeof createRadarFetcher>;

export function createRadarRoutes(db: Database.Database, fetcher?: RadarFetcher) {
  const router = Router();
  const radar = createRegulatoryRadar(db);
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // GET /api/radar/summary — dashboard summary
  router.get('/radar/summary', (_req, res) => {
    try {
      const summary = radar.getRadarSummary();
      res.json(summary);
    } catch (err) {
      console.error('[radar] summary error:', err);
      res.status(500).json({ error: 'Failed to fetch radar summary' });
    }
  });

  // GET /api/radar/sources — list sources
  router.get('/radar/sources', (req, res) => {
    try {
      const activeOnly = req.query.activeOnly !== 'false';
      const category = req.query.category as string | undefined;
      const sources = radar.getSources(activeOnly, category);
      res.json(sources);
    } catch (err) {
      console.error('[radar] sources list error:', err);
      res.status(500).json({ error: 'Failed to fetch sources' });
    }
  });

  // POST /api/radar/sources — create source
  router.post('/radar/sources', (req, res) => {
    try {
      const { displayName, url, sourceType, fetchIntervalHours, areas, keywords, category } = req.body;
      if (!displayName || !url || !sourceType) {
        return res.status(400).json({ error: 'displayName, url, and sourceType are required' });
      }
      const id = radar.createSource({ displayName, url, sourceType, fetchIntervalHours, areas, keywords, category });
      res.json({ id });
    } catch (err) {
      console.error('[radar] source creation error:', err);
      res.status(500).json({ error: 'Failed to create source' });
    }
  });

  // PUT /api/radar/sources/:id — update source
  router.put('/radar/sources/:id', (req, res) => {
    try {
      const { displayName, url, sourceType, areas, keywords, category, isActive } = req.body;
      radar.updateSource(req.params.id, { displayName, url, sourceType, areas, keywords, category, isActive });
      res.json({ ok: true });
    } catch (err) {
      console.error('[radar] source update error:', err);
      res.status(500).json({ error: 'Failed to update source' });
    }
  });

  // DELETE /api/radar/sources/:id — delete source
  router.delete('/radar/sources/:id', (req, res) => {
    try {
      radar.deleteSource(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      console.error('[radar] source delete error:', err);
      res.status(500).json({ error: 'Failed to delete source' });
    }
  });

  // GET /api/radar/items — list items
  router.get('/radar/items', (req, res) => {
    try {
      const { status, minRelevance, search, limit, offset, category } = req.query;
      const items = radar.getItems({
        status: status as string | undefined,
        minRelevance: minRelevance ? parseFloat(minRelevance as string) : undefined,
        search: search as string | undefined,
        category: category as string | undefined,
        limit: limit ? parseInt(limit as string, 10) : 50,
        offset: offset ? parseInt(offset as string, 10) : 0,
      });
      res.json(items);
    } catch (err) {
      console.error('[radar] items list error:', err);
      res.status(500).json({ error: 'Failed to fetch items' });
    }
  });

  // POST /api/radar/items — manually ingest item
  router.post('/radar/items', async (req, res) => {
    try {
      const { sourceId, title, summary, url, itemType, publishedAt } = req.body;
      if (!sourceId || !title || !summary) {
        return res.status(400).json({ error: 'sourceId, title, and summary are required' });
      }
      const id = await radar.ingestManualItem({ sourceId, title, summary, url, itemType, publishedAt });
      res.json({ id });
    } catch (err) {
      console.error('[radar] item ingestion error:', err);
      res.status(500).json({ error: 'Failed to ingest item' });
    }
  });

  // PUT /api/radar/items/:id/status — update status
  router.put('/radar/items/:id/status', (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      if (!status) {
        return res.status(400).json({ error: 'status is required' });
      }
      const userId = (req as unknown as { user?: { id?: string } }).user?.id ?? 'default';
      radar.updateItemStatus(id, status, userId);
      res.json({ success: true });
    } catch (err) {
      console.error('[radar] status update error:', err);
      res.status(500).json({ error: 'Failed to update status' });
    }
  });

  // POST /api/radar/items/:id/score — AI score item
  router.post('/radar/items/:id/score', async (req, res) => {
    try {
      const { id } = req.params;
      const { userAreas = [], userKeywords = [] } = req.body;

      // Fetch the item
      const items = radar.getItems({ limit: 1, offset: 0 });
      const item = (items as unknown as Array<{ id: string; title: string; summary: string; full_text?: string }>)
        .find((i) => i.id === id);
      if (!item) {
        return res.status(404).json({ error: 'Item not found' });
      }

      // Call Claude Haiku for scoring
      const prompt = `Score the relevance (0-1) of this regulatory item for a financial services firm working in these areas: ${userAreas.join(', ') || 'general compliance'}.

Item Title: ${item.title}
Summary: ${item.summary || 'No summary'}

Return ONLY valid JSON (no markdown, no extra text):
{
  "relevance_score": <number 0-1>,
  "urgency_score": <number 0-1>,
  "ai_summary": "<2 sentence summary>",
  "impact_areas": ["<area1>", "<area2>"]
}`;

      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const responseText = message.content
        .filter((block) => block.type === 'text')
        .map((block) => (block as { text: string }).text)
        .join('');

      const result = JSON.parse(responseText) as {
        relevance_score: number;
        urgency_score: number;
        ai_summary: string;
        impact_areas: string[];
      };

      // Update item with scores
      radar.scoreItem(id, result.relevance_score, result.urgency_score, result.ai_summary, result.impact_areas);

      res.json(result);
    } catch (err) {
      console.error('[radar] scoring error:', err);
      res.status(500).json({ error: 'Failed to score item' });
    }
  });

  // ── Scan endpoints ────────────────────────────────────────────

  // POST /api/radar/scan — full scan of all active sources
  router.post('/radar/scan', async (_req, res) => {
    if (!fetcher) {
      return res.status(503).json({ error: 'Radar fetcher not initialized (missing API key?)' });
    }
    try {
      // Return immediately, scan runs in background
      res.json({ started: true });
      fetcher.scanAllSources().catch((err: unknown) => {
        console.error('[radar] background scan error:', err);
      });
    } catch (err) {
      console.error('[radar] scan error:', err);
      res.status(500).json({ error: 'Scan failed' });
    }
  });

  // POST /api/radar/stop — stop a running scan
  router.post('/radar/stop', (_req, res) => {
    if (!fetcher) {
      return res.status(503).json({ error: 'Radar fetcher not initialized' });
    }
    fetcher.stopScan();
    res.json({ ok: true });
  });

  // POST /api/radar/scan/:sourceId — scan a single source
  router.post('/radar/scan/:sourceId', async (req, res) => {
    if (!fetcher) {
      return res.status(503).json({ error: 'Radar fetcher not initialized (missing API key?)' });
    }
    try {
      const result = await fetcher.scanSource(req.params.sourceId);
      res.json(result);
    } catch (err) {
      console.error('[radar] single-source scan error:', err);
      res.status(500).json({ error: 'Scan failed' });
    }
  });

  // GET /api/radar/scan-status — last scan info + live progress
  router.get('/radar/scan-status', (_req, res) => {
    if (!fetcher) {
      return res.json({ scanInProgress: false, lastScanTime: null, lastScanResult: null, currentSource: null, sourcesCompleted: 0, sourcesTotal: 0 });
    }
    res.json(fetcher.getScanStatus());
  });

  // ── Settings endpoints ──────────────────────────────────────

  // GET /api/radar/settings — read auto-scan settings from DB
  router.get('/radar/settings', (_req, res) => {
    try {
      const rows = db.prepare('SELECT key, value FROM radar_settings').all() as Array<{ key: string; value: string }>;
      const settings: Record<string, string> = {};
      for (const row of rows) settings[row.key] = row.value;
      res.json({
        autoScanEnabled: settings['auto_scan_enabled'] === '1',
        autoScanIntervalHours: parseInt(settings['auto_scan_interval_hours'] || '24', 10),
        autoScanCron: settings['auto_scan_cron'] || '',
      });
    } catch (err) {
      console.error('[radar] settings read error:', err);
      res.status(500).json({ error: 'Failed to read settings' });
    }
  });

  // PUT /api/radar/settings — update auto-scan settings
  router.put('/radar/settings', (req, res) => {
    try {
      const { autoScanEnabled, autoScanIntervalHours, autoScanCron } = req.body as { autoScanEnabled?: boolean; autoScanIntervalHours?: number; autoScanCron?: string };
      const updateStmt = db.prepare('INSERT OR REPLACE INTO radar_settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))');

      if (autoScanEnabled !== undefined) {
        updateStmt.run('auto_scan_enabled', autoScanEnabled ? '1' : '0');
      }
      if (autoScanIntervalHours !== undefined) {
        updateStmt.run('auto_scan_interval_hours', String(autoScanIntervalHours));
      }
      if (autoScanCron !== undefined) {
        if (autoScanCron && !cron.validate(autoScanCron)) {
          return res.status(400).json({ error: 'Invalid cron expression' });
        }
        updateStmt.run('auto_scan_cron', autoScanCron || '');
      }

      // Apply schedule changes to the fetcher
      if (fetcher) {
        const enabled = autoScanEnabled ?? (db.prepare("SELECT value FROM radar_settings WHERE key = 'auto_scan_enabled'").get() as { value: string } | undefined)?.value === '1';
        const hours = autoScanIntervalHours ?? parseInt((db.prepare("SELECT value FROM radar_settings WHERE key = 'auto_scan_interval_hours'").get() as { value: string } | undefined)?.value || '24', 10);

        if (enabled) {
          fetcher.startAutoScan(hours);
        } else {
          fetcher.stopAutoScan();
        }
      }

      res.json({ ok: true });
    } catch (err) {
      console.error('[radar] settings update error:', err);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  return router;
}
