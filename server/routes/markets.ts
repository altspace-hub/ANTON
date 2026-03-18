import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseAdapter } from '../db/database.js';
import { createMarketDataService } from '../services/market-data-service.js';
import { createMarketAtomService } from '../services/market-atom-service.js';
import Anthropic from '@anthropic-ai/sdk';

// ── Zod Schemas ───────────────────────────────────────────────────────────────

const addToWatchlistSchema = z.object({
  symbol: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  assetType: z.string().max(50).optional(),
  notes: z.string().optional(),
  alertConfig: z.record(z.unknown()).optional(),
});

const updateWatchlistSchema = z.object({
  symbol: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(200).optional(),
  assetType: z.string().max(50).optional(),
  notes: z.string().optional(),
  alertConfig: z.record(z.unknown()).optional(),
  isActive: z.union([z.boolean(), z.number()]).optional(),
});

const createAtomSchema = z.object({
  content: z.string().min(1),
  atomType: z.string().min(1).max(100),
  confidence: z.number().min(0).max(1).optional(),
  category: z.string().max(100).optional(),
  subcategory: z.string().max(100).optional(),
  sentiment: z.string().max(50).optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
});

const extractAtomsSchema = z.object({
  rawDataId: z.string().optional(),
  content: z.string().min(1),
  dataType: z.string().max(100).optional(),
});

export async function createMarketsRoutes(db: DatabaseAdapter, anthropic?: Anthropic) {
  const router = Router();
  const dataService = await createMarketDataService(db);
  const atomService = await createMarketAtomService(db, anthropic);

  // ── Dashboard Stats ────────────────────────────────────────────────────

  router.get('/markets/dashboard', async (_req, res) => {
    try {
      const stats = await dataService.getDashboardStats();
      const recentAtoms = await atomService.getRecentAtoms(10);
      const atomsByCategory = await atomService.getAtomsByCategory();
      const rawDataStats = await dataService.getRawDataStats();
      res.json({ stats, recentAtoms, atomsByCategory, rawDataStats });
    } catch (err) {
      console.error('[markets] Dashboard error:', err);
      res.status(500).json({ error: 'Failed to load dashboard' });
    }
  });

  // ── Data Sources CRUD ──────────────────────────────────────────────────

  router.get('/markets/sources', async (req, res) => {
    try {
      const activeOnly = req.query.active !== 'false';
      const sources = await dataService.getSources(activeOnly);
      res.json(sources);
    } catch (err) {
      console.error('[markets] List sources error:', err);
      res.status(500).json({ error: 'Failed to list sources' });
    }
  });

  router.get('/markets/sources/:id', async (req, res) => {
    try {
      const source = await dataService.getSource(req.params.id);
      if (!source) return res.status(404).json({ error: 'Source not found' });
      res.json(source);
    } catch (err) {
      console.error('[markets] Get source error:', err);
      res.status(500).json({ error: 'Failed to get source' });
    }
  });

  router.post('/markets/sources', async (req, res) => {
    try {
      const { name, sourceType, provider, config, fetchIntervalHours } = req.body;
      if (!name || !provider) return res.status(400).json({ error: 'name and provider are required' });
      const id = await dataService.createSource({ name, sourceType, provider, config, fetchIntervalHours });
      res.status(201).json({ id });
    } catch (err) {
      console.error('[markets] Create source error:', err);
      res.status(500).json({ error: 'Failed to create source' });
    }
  });

  router.put('/markets/sources/:id', async (req, res) => {
    try {
      await dataService.updateSource(req.params.id, req.body);
      res.json({ ok: true });
    } catch (err) {
      console.error('[markets] Update source error:', err);
      res.status(500).json({ error: 'Failed to update source' });
    }
  });

  router.delete('/markets/sources/:id', async (req, res) => {
    try {
      await dataService.deleteSource(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      console.error('[markets] Delete source error:', err);
      res.status(500).json({ error: 'Failed to delete source' });
    }
  });

  // ── Source Fetch ────────────────────────────────────────────────────────

  router.post('/markets/sources/:id/fetch', async (req, res) => {
    try {
      const result = await dataService.fetchFromSource(req.params.id);
      res.json(result);
    } catch (err) {
      console.error('[markets] Fetch source error:', err);
      res.status(500).json({ error: 'Failed to fetch from source' });
    }
  });

  router.post('/markets/sources/fetch-all', async (_req, res) => {
    try {
      const result = await dataService.fetchAllSources();
      res.json(result);
    } catch (err) {
      console.error('[markets] Fetch all sources error:', err);
      res.status(500).json({ error: 'Failed to fetch from all sources' });
    }
  });

  // ── Watchlist ──────────────────────────────────────────────────────────

  router.get('/markets/watchlist', async (req, res) => {
    try {
      const activeOnly = req.query.active !== 'false';
      const items = await dataService.getWatchlist(activeOnly);
      res.json(items);
    } catch (err) {
      console.error('[markets] List watchlist error:', err);
      res.status(500).json({ error: 'Failed to list watchlist' });
    }
  });

  // Watchlist alerts — must be before /:id routes to avoid matching "alerts" as an ID
  router.get('/markets/watchlist/alerts', async (_req, res) => {
    try {
      const alerts = await dataService.checkWatchlistAlerts();
      res.json(alerts);
    } catch (err) {
      console.error('[markets] Watchlist alerts error:', err);
      res.status(500).json({ error: 'Failed to check watchlist alerts' });
    }
  });

  router.post('/markets/watchlist', async (req, res) => {
    try {
      const parsed = addToWatchlistSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
      }
      const { symbol, name, assetType, notes, alertConfig } = parsed.data;
      const id = await dataService.addToWatchlist({ symbol, name, assetType, notes, alertConfig });
      res.status(201).json({ id });
    } catch (err) {
      console.error('[markets] Add to watchlist error:', err);
      res.status(500).json({ error: 'Failed to add to watchlist' });
    }
  });

  router.put('/markets/watchlist/:id', async (req, res) => {
    try {
      const parsed = updateWatchlistSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
      }
      await dataService.updateWatchlistItem(req.params.id, parsed.data);
      res.json({ ok: true });
    } catch (err) {
      console.error('[markets] Update watchlist error:', err);
      res.status(500).json({ error: 'Failed to update watchlist item' });
    }
  });

  router.delete('/markets/watchlist/:id', async (req, res) => {
    try {
      await dataService.removeFromWatchlist(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      console.error('[markets] Remove from watchlist error:', err);
      res.status(500).json({ error: 'Failed to remove from watchlist' });
    }
  });

  // ── Atoms ──────────────────────────────────────────────────────────────

  router.get('/markets/atoms', async (req, res) => {
    try {
      const atoms = await atomService.searchAtoms({
        query: req.query.q as string | undefined,
        atomType: req.query.type as string | undefined,
        category: req.query.category as string | undefined,
        sentiment: req.query.sentiment as string | undefined,
        minConfidence: req.query.minConfidence ? parseFloat(req.query.minConfidence as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
      });
      res.json(atoms);
    } catch (err) {
      console.error('[markets] Search atoms error:', err);
      res.status(500).json({ error: 'Failed to search atoms' });
    }
  });

  router.get('/markets/atoms/:id', async (req, res) => {
    try {
      const atom = await atomService.getAtom(req.params.id);
      if (!atom) return res.status(404).json({ error: 'Atom not found' });
      res.json(atom);
    } catch (err) {
      console.error('[markets] Get atom error:', err);
      res.status(500).json({ error: 'Failed to get atom' });
    }
  });

  router.post('/markets/atoms', async (req, res) => {
    try {
      const parsed = createAtomSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
      }
      const { content, atomType, confidence, category, subcategory, sentiment, tags } = parsed.data;
      const id = await atomService.createAtom({
        content, atomType, confidence, category, subcategory, sentiment, tags,
        extractionMethod: 'manual',
      });
      res.status(201).json({ id });
    } catch (err) {
      console.error('[markets] Create atom error:', err);
      res.status(500).json({ error: 'Failed to create atom' });
    }
  });

  router.delete('/markets/atoms/:id', async (req, res) => {
    try {
      await atomService.deactivateAtom(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      console.error('[markets] Deactivate atom error:', err);
      res.status(500).json({ error: 'Failed to deactivate atom' });
    }
  });

  // ── Atom Relationships ─────────────────────────────────────────────────

  router.get('/markets/atoms/:id/relationships', async (req, res) => {
    try {
      const rels = await atomService.getRelationships(req.params.id);
      res.json(rels);
    } catch (err) {
      console.error('[markets] Get relationships error:', err);
      res.status(500).json({ error: 'Failed to get relationships' });
    }
  });

  router.post('/markets/atoms/:id/relationships', async (req, res) => {
    try {
      const { targetAtomId, type, strength } = req.body;
      if (!targetAtomId || !type) return res.status(400).json({ error: 'targetAtomId and type are required' });
      await atomService.addRelationship(req.params.id, targetAtomId, type, strength);
      res.status(201).json({ ok: true });
    } catch (err) {
      console.error('[markets] Add relationship error:', err);
      res.status(500).json({ error: 'Failed to add relationship' });
    }
  });

  // ── AI Extraction ──────────────────────────────────────────────────────

  router.post('/markets/extract-atoms', async (req, res) => {
    try {
      const parsed = extractAtomsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
      }
      const { rawDataId, content, dataType } = parsed.data;
      const atomIds = await atomService.extractAtomsFromRawData(rawDataId ?? 'manual', content, dataType ?? 'news');
      res.json({ atomIds, count: atomIds.length });
    } catch (err) {
      console.error('[markets] Extract atoms error:', err);
      res.status(500).json({ error: 'Failed to extract atoms' });
    }
  });

  // ── Batch AI Extraction (process all unprocessed raw data) ─────────────

  router.post('/markets/extract-atoms/batch', async (req, res) => {
    try {
      const limit = Number(req.body?.limit) || 50;
      const rows = await db.all(
        `SELECT id, data_type, content, title FROM market_data_raw WHERE is_processed = 0 AND data_type != 'price' ORDER BY fetched_at ASC LIMIT ?`,
        limit
      ) as Array<{ id: string; data_type: string; content: string; title: string }>;

      let totalAtoms = 0;
      const errors: string[] = [];

      for (const row of rows) {
        try {
          const text = row.title ? `${row.title}\n\n${row.content}` : row.content;
          const atomIds = await atomService.extractAtomsFromRawData(row.id, text, row.data_type);
          await db.run('UPDATE market_data_raw SET is_processed = 1 WHERE id = ?', row.id);
          totalAtoms += atomIds.length;
        } catch (err) {
          errors.push(`${row.id}: ${(err as Error).message}`);
          await db.run('UPDATE market_data_raw SET is_processed = 1 WHERE id = ?', row.id);
        }
      }

      res.json({ processed: rows.length, atomsCreated: totalAtoms, errors: errors.length > 0 ? errors : undefined });
    } catch (err) {
      console.error('[markets] Batch extract error:', err);
      res.status(500).json({ error: 'Failed to batch extract atoms' });
    }
  });

  // ── Atom Decay (manual trigger) ────────────────────────────────────────

  router.post('/markets/atoms/decay', async (_req, res) => {
    try {
      const result = await atomService.applyAtomDecay();
      res.json(result);
    } catch (err) {
      console.error('[markets] Atom decay error:', err);
      res.status(500).json({ error: 'Failed to apply atom decay' });
    }
  });

  // ── Raw Data Stats ─────────────────────────────────────────────────────

  router.get('/markets/raw-data/stats', async (_req, res) => {
    try {
      const stats = await dataService.getRawDataStats();
      res.json(stats);
    } catch (err) {
      console.error('[markets] Raw data stats error:', err);
      res.status(500).json({ error: 'Failed to get raw data stats' });
    }
  });

  return router;
}
