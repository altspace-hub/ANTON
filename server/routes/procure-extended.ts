/**
 * routes/procure-extended.ts — Phase B.2 Procure build-out REST surface.
 *
 * Mounts at /api/procure. Adds:
 *   - GET /procure/vendors          list vendors (filter by category, jurisdiction, sizeBand, minTrust)
 *   - GET /procure/vendors/:id      get one vendor
 *   - GET /procure/vendor-categories list distinct categories
 *   - GET /procure/benchmarks       list benchmarks (filter by category, metric, region)
 *   - GET /procure/rfq-templates    list RFQ templates (filter by category, jurisdiction)
 *   - GET /procure/rfq-templates/:id get one template
 */

import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { createProcureVendorDirectory } from '../services/procure-vendor-directory.js';
import { createProcureBenchmarks } from '../services/procure-benchmarks.js';
import { createProcureRfqTemplates } from '../services/procure-rfq-templates.js';
import { safeError } from '../lib/error-response.js';

export function createProcureExtendedRoutes(db: DatabaseAdapter): Router {
  const router = Router();

  router.get('/vendors', async (req, res) => {
    try {
      const dir = await createProcureVendorDirectory(db);
      const vendors = await dir.listVendors({
        category:     typeof req.query.category     === 'string' ? req.query.category     : undefined,
        jurisdiction: typeof req.query.jurisdiction === 'string' ? req.query.jurisdiction : undefined,
        sizeBand:     req.query.sizeBand as 'startup' | 'sme' | 'mid' | 'enterprise' | undefined,
        minTrust:     req.query.minTrust ? Number(req.query.minTrust) : undefined,
      });
      res.json({ vendors });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/vendors/:id', async (req, res) => {
    try {
      const dir = await createProcureVendorDirectory(db);
      const vendor = await dir.getVendor(req.params.id);
      if (!vendor) { res.status(404).json({ error: 'Vendor not found' }); return; }
      res.json(vendor);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/vendor-categories', async (_req, res) => {
    try {
      const dir = await createProcureVendorDirectory(db);
      res.json({ categories: await dir.listCategories() });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/benchmarks', async (req, res) => {
    try {
      const bm = await createProcureBenchmarks(db);
      const benchmarks = await bm.listBenchmarks({
        category: typeof req.query.category === 'string' ? req.query.category : undefined,
        metric:   typeof req.query.metric   === 'string' ? req.query.metric   : undefined,
        region:   typeof req.query.region   === 'string' ? req.query.region   : undefined,
      });
      res.json({ benchmarks });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/rfq-templates', async (req, res) => {
    try {
      const tpl = await createProcureRfqTemplates(db);
      const templates = await tpl.listTemplates({
        category:     typeof req.query.category     === 'string' ? req.query.category     : undefined,
        jurisdiction: typeof req.query.jurisdiction === 'string' ? req.query.jurisdiction : undefined,
      });
      res.json({ templates });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/rfq-templates/:id', async (req, res) => {
    try {
      const tpl = await createProcureRfqTemplates(db);
      const template = await tpl.getTemplate(req.params.id);
      if (!template) { res.status(404).json({ error: 'Template not found' }); return; }
      res.json(template);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
