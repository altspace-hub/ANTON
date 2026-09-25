import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

import * as cron from 'node-cron';
import { createRegulatoryRadar } from '../services/regulatory-radar.js';
import {
  type createRadarFetcher,
  isRadarAutomationDisabled,
  clampAutoScanIntervalHours,
  radarCronIsAtMostHourly,
  MIN_AUTO_SCAN_INTERVAL_HOURS,
  MAX_AUTO_SCAN_INTERVAL_HOURS,
} from '../services/radar-fetcher.js';
import { getRoutedUtilityModel } from '../services/utility-model.js';
import { callChat, mapModelToProvider } from '../services/provider-router.js';
import { requireAdminOrSolo } from '../middleware/role-guards.js';

type RadarFetcher = Awaited<ReturnType<typeof createRadarFetcher>>;

/**
 * The radar is one per instance: its sources, items and schedule are shared by
 * every user. Reading it is open to everyone; anything that changes it or makes
 * it spend (sources, manual items, AI scoring, scans, the auto-scan settings)
 * is admin-only in team mode (requireAdminOrSolo). Triage of an item's status
 * stays open to every user.
 */
export async function createRadarRoutes(db: DatabaseAdapter, fetcher?: RadarFetcher) {
  const router = Router();
  const radar = await createRegulatoryRadar(db);

  // GET /api/radar/summary — dashboard summary
  router.get('/radar/summary', async (_req, res) => {
    try {
      const summary = await radar.getRadarSummary();
      res.json(summary);
    } catch (err) {
      console.error('[radar] summary error:', err);
      res.status(500).json({ error: 'Failed to fetch radar summary' });
    }
  });

  // GET /api/radar/sources — list sources
  router.get('/radar/sources', async (req, res) => {
    try {
      const activeOnly = req.query.activeOnly !== 'false';
      const category = req.query.category as string | undefined;
      const sources = await radar.getSources(activeOnly, category);
      res.json(sources);
    } catch (err) {
      console.error('[radar] sources list error:', err);
      res.status(500).json({ error: 'Failed to fetch sources' });
    }
  });

  // POST /api/radar/sources — create source
  router.post('/radar/sources', requireAdminOrSolo, async (req, res) => {
    try {
      const { displayName, url, sourceType, fetchIntervalHours, areas, keywords, category } = req.body;
      if (!displayName || !url || !sourceType) {
        return res.status(400).json({ error: 'displayName, url, and sourceType are required' });
      }
      const id = await radar.createSource({ displayName, url, sourceType, fetchIntervalHours, areas, keywords, category });
      res.json({ id });
    } catch (err) {
      console.error('[radar] source creation error:', err);
      res.status(500).json({ error: 'Failed to create source' });
    }
  });

  // PUT /api/radar/sources/:id — update source
  router.put('/radar/sources/:id', requireAdminOrSolo, async (req, res) => {
    try {
      const { displayName, url, sourceType, areas, keywords, category, isActive } = req.body;
      await radar.updateSource(String(req.params.id), { displayName, url, sourceType, areas, keywords, category, isActive });
      res.json({ ok: true });
    } catch (err) {
      console.error('[radar] source update error:', err);
      res.status(500).json({ error: 'Failed to update source' });
    }
  });

  // DELETE /api/radar/sources/:id — delete source
  router.delete('/radar/sources/:id', requireAdminOrSolo, async (req, res) => {
    try {
      await radar.deleteSource(String(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      console.error('[radar] source delete error:', err);
      res.status(500).json({ error: 'Failed to delete source' });
    }
  });

  // GET /api/radar/items — list items
  router.get('/radar/items', async (req, res) => {
    try {
      const { status, minRelevance, search, limit, offset, category } = req.query;
      const items = await radar.getItems({
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
  router.post('/radar/items', requireAdminOrSolo, async (req, res) => {
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
  router.put('/radar/items/:id/status', async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      if (!status) {
        return res.status(400).json({ error: 'status is required' });
      }
      const userId = (req as unknown as { user?: { id?: string } }).user?.id ?? 'default';
      await radar.updateItemStatus(id, status, userId);
      res.json({ success: true });
    } catch (err) {
      console.error('[radar] status update error:', err);
      res.status(500).json({ error: 'Failed to update status' });
    }
  });

  // POST /api/radar/items/:id/score — AI score item
  router.post('/radar/items/:id/score', requireAdminOrSolo, async (req, res) => {
    try {
      const id = String(req.params.id);
      const { userAreas = [], userKeywords = [] } = req.body;

      // Fetch the item
      const items = await radar.getItems({ limit: 1, offset: 0 });
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

      const chatResult = await callChat({
        model: await getRoutedUtilityModel(db),
        system: 'You are a regulatory relevance scorer. Return ONLY valid JSON.',
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 1024,
      });

      const responseText = chatResult.text;

      const result = JSON.parse(responseText) as {
        relevance_score: number;
        urgency_score: number;
        ai_summary: string;
        impact_areas: string[];
      };

      // Update item with scores
      await radar.scoreItem(id, result.relevance_score, result.urgency_score, result.ai_summary, result.impact_areas);

      res.json(result);
    } catch (err) {
      console.error('[radar] scoring error:', err);
      res.status(500).json({ error: 'Failed to score item' });
    }
  });

  // ── Scan endpoints ────────────────────────────────────────────

  // POST /api/radar/scan — scan active sources; optional body { category } limits to that category
  router.post('/radar/scan', requireAdminOrSolo, async (req, res) => {
    if (!fetcher) {
      return res.status(503).json({ error: 'Radar fetcher not initialized (missing API key?)' });
    }
    try {
      const category = (req.body as { category?: string } | undefined)?.category || undefined;
      // Return immediately, scan runs in background
      res.json({ started: true, category: category ?? 'all' });
      fetcher.scanAllSources(category).catch((err: unknown) => {
        console.error('[radar] background scan error:', err);
      });
    } catch (err) {
      console.error('[radar] scan error:', err);
      res.status(500).json({ error: 'Scan failed' });
    }
  });

  // POST /api/radar/stop — stop a running scan
  router.post('/radar/stop', requireAdminOrSolo, async (_req, res) => {
    if (!fetcher) {
      return res.status(503).json({ error: 'Radar fetcher not initialized' });
    }
    fetcher.stopScan();
    res.json({ ok: true });
  });

  // POST /api/radar/scan/:sourceId — scan a single source
  router.post('/radar/scan/:sourceId', requireAdminOrSolo, async (req, res) => {
    if (!fetcher) {
      return res.status(503).json({ error: 'Radar fetcher not initialized (missing API key?)' });
    }
    try {
      const result = await fetcher.scanSource(String(req.params.sourceId));
      res.json(result);
    } catch (err) {
      console.error('[radar] single-source scan error:', err);
      res.status(500).json({ error: 'Scan failed' });
    }
  });

  // GET /api/radar/scan-status — last scan info + live progress
  router.get('/radar/scan-status', async (_req, res) => {
    if (!fetcher) {
      return res.json({ scanInProgress: false, lastScanTime: null, lastScanResult: null, currentSource: null, sourcesCompleted: 0, sourcesTotal: 0 });
    }
    res.json(fetcher.getScanStatus());
  });

  // ── Settings endpoints ──────────────────────────────────────

  // GET /api/radar/settings — read auto-scan settings from DB
  router.get('/radar/settings', async (_req, res) => {
    try {
      const rows = await db.all('SELECT key, value FROM radar_settings') as Array<{ key: string; value: string }>;
      const settings: Record<string, string> = {};
      for (const row of rows) settings[row.key] = row.value;
      res.json({
        autoScanEnabled: settings['auto_scan_enabled'] === '1',
        // Clamped as the timer clamps it, so a form that sends the value back
        // is never refused for a figure stored before the bounds existed.
        autoScanIntervalHours: clampAutoScanIntervalHours(parseInt(settings['auto_scan_interval_hours'] || '24', 10)),
        autoScanCron: settings['auto_scan_cron'] || '',
        pevcScoringCriteria: settings['pevc_scoring_criteria'] || '',
        // True while RADAR_AUTOMATION_DISABLED or DEMO_MODE keeps every scheduled scan off.
        automationDisabled: isRadarAutomationDisabled(),
      });
    } catch (err) {
      console.error('[radar] settings read error:', err);
      res.status(500).json({ error: 'Failed to read settings' });
    }
  });

  // PUT /api/radar/settings — update auto-scan settings
  router.put('/radar/settings', requireAdminOrSolo, async (req, res) => {
    try {
      const { autoScanEnabled, autoScanIntervalHours, autoScanCron, pevcScoringCriteria } = req.body as { autoScanEnabled?: boolean; autoScanIntervalHours?: number; autoScanCron?: string; pevcScoringCriteria?: string };

      // Validate everything before writing anything. A scheduled scan calls the
      // model for every new item with nobody watching: at most once an hour.
      if (autoScanIntervalHours !== undefined) {
        const h = Number(autoScanIntervalHours);
        if (!Number.isFinite(h) || h < MIN_AUTO_SCAN_INTERVAL_HOURS || h > MAX_AUTO_SCAN_INTERVAL_HOURS) {
          return res.status(400).json({
            error: `autoScanIntervalHours must be between ${MIN_AUTO_SCAN_INTERVAL_HOURS} and ${MAX_AUTO_SCAN_INTERVAL_HOURS}`,
          });
        }
      }
      if (autoScanCron) {
        if (!cron.validate(autoScanCron)) {
          return res.status(400).json({ error: 'Invalid cron expression' });
        }
        if (!radarCronIsAtMostHourly(autoScanCron)) {
          return res.status(400).json({ error: 'The radar cron schedule may run at most once an hour (use a fixed minute, e.g. "0 */6 * * *")' });
        }
      }

      if (autoScanEnabled !== undefined) {
        await db.run('INSERT INTO radar_settings (key, value, updated_at) VALUES (?, ?, NOW()) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()', 'auto_scan_enabled', autoScanEnabled ? '1' : '0');
      }
      if (autoScanIntervalHours !== undefined) {
        await db.run('INSERT INTO radar_settings (key, value, updated_at) VALUES (?, ?, NOW()) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()', 'auto_scan_interval_hours', String(autoScanIntervalHours));
      }
      if (autoScanCron !== undefined) {
        await db.run('INSERT INTO radar_settings (key, value, updated_at) VALUES (?, ?, NOW()) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()', 'auto_scan_cron', autoScanCron || '');
      }
      if (pevcScoringCriteria !== undefined) {
        await db.run('INSERT INTO radar_settings (key, value, updated_at) VALUES (?, ?, NOW()) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()', 'pevc_scoring_criteria', pevcScoringCriteria.trim());
      }

      // Apply schedule changes to the fetcher. startAutoScan refuses while
      // RADAR_AUTOMATION_DISABLED or DEMO_MODE is set, and says so.
      let autoScanActive = false;
      if (fetcher) {
        const enabled = autoScanEnabled ?? (await db.get("SELECT value FROM radar_settings WHERE key = 'auto_scan_enabled'") as { value: string } | undefined)?.value === '1';
        const hours = autoScanIntervalHours !== undefined
          ? Number(autoScanIntervalHours)
          : parseInt((await db.get("SELECT value FROM radar_settings WHERE key = 'auto_scan_interval_hours'") as { value: string } | undefined)?.value || '24', 10);

        if (enabled) {
          autoScanActive = fetcher.startAutoScan(hours);
        } else {
          fetcher.stopAutoScan();
        }
      }

      res.json({ ok: true, autoScanActive, automationDisabled: isRadarAutomationDisabled() });
    } catch (err) {
      console.error('[radar] settings update error:', err);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  return router;
}
