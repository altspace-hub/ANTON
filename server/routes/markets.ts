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
  alertConfig: z.record(z.string(), z.unknown()).optional(),
});

const updateWatchlistSchema = z.object({
  symbol: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(200).optional(),
  assetType: z.string().max(50).optional(),
  notes: z.string().optional(),
  alertConfig: z.record(z.string(), z.unknown()).optional(),
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

      // Market benchmarks (SPY, QQQ, DIA) — multi-period performance
      const benchmarkSymbols = ['SPY', 'QQQ', 'DIA'];
      const periods = [
        { key: '1d', interval: '1 day' },
        { key: '1w', interval: '7 days' },
        { key: '1m', interval: '30 days' },
        { key: '1y', interval: '365 days' },
        { key: '5y', interval: '1825 days' },
      ];
      const benchmarks = await db.all<{ symbol: string; price_date: string; close: number }>(
        `SELECT DISTINCT ON (symbol) symbol, price_date, close
         FROM market_price_normalized WHERE symbol IN ('SPY','QQQ','DIA')
         ORDER BY symbol, price_date DESC`
      );
      const marketBenchmarks = [];
      for (const b of benchmarks) {
        const changes: Record<string, number> = {};
        for (const p of periods) {
          const prev = await db.get<{ close: number }>(
            `SELECT close FROM market_price_normalized WHERE symbol = ? AND price_date <= (
              SELECT MAX(price_date) FROM market_price_normalized WHERE symbol = ? AND price_date <= (
                (SELECT MAX(price_date) FROM market_price_normalized WHERE symbol = ?)::date - ?::interval
              )::text
            ) ORDER BY price_date DESC LIMIT 1`,
            b.symbol, b.symbol, b.symbol, p.interval
          );
          changes[p.key] = prev ? Number(((Number(b.close) - Number(prev.close)) / Number(prev.close) * 100).toFixed(2)) : 0;
        }
        marketBenchmarks.push({ symbol: b.symbol, price: Number(b.close), date: b.price_date, changes });
      }

      // ANTON portfolio performance
      const portfolios = await db.all<{ id: string; name: string; current_nav: number; total_return: number; status: string; philosophy: string }>(
        "SELECT id, name, current_nav, total_return, status, philosophy FROM market_indexes WHERE status = 'active' ORDER BY name"
      );

      // Track record summary
      const trackRecord = await db.get<{ total: number; correct: number; accuracy: number; avg_brier: number }>(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN was_correct = 1 THEN 1 ELSE 0 END) as correct,
                CASE WHEN COUNT(*) > 0 THEN ROUND((SUM(CASE WHEN was_correct = 1 THEN 1.0 ELSE 0 END) / COUNT(*) * 100)::numeric, 1) ELSE 0 END as accuracy,
                ROUND(AVG(brier_score)::numeric, 4) as avg_brier
         FROM market_predictions WHERE status = 'validated'`
      );

      // Active intelligence counts
      const activeIntel = await db.get<{ theses: number; predictions: number; nextDeadline: string | null }>(
        `SELECT
          (SELECT COUNT(*) FROM market_theses WHERE status IN ('active', 'monitoring')) as theses,
          (SELECT COUNT(*) FROM market_predictions WHERE status = 'active') as predictions,
          (SELECT MIN(deadline) FROM market_predictions WHERE status = 'active' AND deadline IS NOT NULL) as "nextDeadline"`
      );

      res.json({ stats, recentAtoms, atomsByCategory, rawDataStats, marketBenchmarks, portfolios, trackRecord, activeIntel });
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

  router.get('/markets/watchlist/enriched', async (req, res) => {
    try {
      const items = await dataService.getWatchlist();
      const { createTemporalReasoningService } = await import('../services/temporal-reasoning.js');
      const temporalService = await createTemporalReasoningService(db);
      const userId = (req as any).user?.id || 'default';

      const enriched = [];
      for (const item of items) {
        // Get recent atoms mentioning this symbol
        const atoms = await db.all(
          `SELECT id, content, atom_type, confidence, category, subcategory, sentiment, entities, importance_score
           FROM market_atoms WHERE is_active = 1
           AND (entities::text LIKE ? OR affected_symbols::text LIKE ?)
           AND created_at > NOW() - INTERVAL '7 days'
           ORDER BY importance_score DESC, created_at DESC LIMIT 10`,
          `%${item.symbol}%`, `%${item.symbol}%`
        );

        const { included, excluded, exclusionReasons } = await temporalService.applyValuesFilter(atoms as any[], userId, 'finance');
        const weighted = await temporalService.applyStrategyWeighting(included as any[], userId, 'finance');

        enriched.push({
          ...item,
          atoms: weighted,
          excludedAtoms: excluded,
          exclusionReasons: Object.fromEntries(exclusionReasons),
          atomCount: atoms.length,
          excludedCount: excluded.length,
        });
      }
      res.json(enriched);
    } catch (err) {
      console.error('[markets] Watchlist enriched error:', err);
      res.status(500).json({ error: 'Failed to enrich watchlist' });
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
      await dataService.updateWatchlistItem(req.params.id, {
        notes: parsed.data.notes,
        alertConfig: parsed.data.alertConfig,
        isActive: parsed.data.isActive === undefined ? undefined : Boolean(parsed.data.isActive),
      });
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
      const normalizedTags = typeof tags === 'string'
        ? tags.split(',').map((t) => t.trim()).filter(Boolean)
        : tags;
      const id = await atomService.createAtom({
        content, atomType, confidence, category, subcategory, sentiment, tags: normalizedTags,
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

  // ── Bulk AI Extraction (process ALL unprocessed articles with rate limiting) ──

  router.post('/markets/extract-atoms/bulk', async (req, res) => {
    try {
      const batchSize = Number(req.body?.batchSize) || 20;
      const maxBatches = Number(req.body?.maxBatches) || 50;
      let totalProcessed = 0;
      let totalAtoms = 0;

      for (let batch = 0; batch < maxBatches; batch++) {
        const rows = await db.all(
          "SELECT id, data_type, content, title FROM market_data_raw WHERE is_processed = 0 AND data_type NOT IN ('price') ORDER BY fetched_at ASC LIMIT ?",
          batchSize
        ) as Array<{ id: string; data_type: string; content: string; title: string }>;

        if (rows.length === 0) break;

        for (const row of rows) {
          try {
            const text = row.title ? `${row.title}\n\n${row.content}` : row.content;
            const atomIds = await atomService.extractAtomsFromRawData(row.id, text, row.data_type);
            await db.run('UPDATE market_data_raw SET is_processed = 1 WHERE id = ?', row.id);
            totalAtoms += atomIds.length;
          } catch {
            await db.run('UPDATE market_data_raw SET is_processed = 1 WHERE id = ?', row.id);
          }
          totalProcessed++;
        }

        // Rate limit: 500ms pause between batches
        await new Promise(r => setTimeout(r, 500));
      }

      res.json({ processed: totalProcessed, atomsCreated: totalAtoms });
    } catch (err) {
      console.error('[markets] Bulk extract error:', err);
      res.status(500).json({ error: 'Failed to bulk extract atoms' });
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
