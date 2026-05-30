/**
 * marketplace.ts — Bundle marketplace API routes
 *
 * Discovery, ratings, and reviews for community .anton bundles.
 */

import { safeError } from '../lib/error-response.js';
import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { createMarketplaceService } from '../services/marketplace-service.js';

export async function createMarketplaceRoutes(db: DatabaseAdapter) {
  const router = Router();
  const marketplace = await createMarketplaceService(db);

  // GET /marketplace/bundles — Search and list published bundles
  router.get('/marketplace/bundles', async (req, res) => {
    try {
      const { type, author, minRating, search, page, pageSize } = req.query as Record<string, string>;
      const result = await marketplace.listBundles({
        type, author,
        minRating: minRating ? Number(minRating) : undefined,
        search: search || undefined,
        page: page ? Number(page) : 1,
        pageSize: pageSize ? Number(pageSize) : 20,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /marketplace/bundles/:id — Get bundle detail with reviews
  router.get('/marketplace/bundles/:id', async (req, res) => {
    try {
      const result = await marketplace.getListing(req.params.id);
      if (!result.listing) return res.status(404).json({ error: 'Bundle not found' });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // POST /marketplace/bundles — Publish a bundle listing
  router.post('/marketplace/bundles', async (req, res) => {
    try {
      const { bundleType, title, description, authorHash, authorName, version, tags, targetAreas, bundleHash, bundleSizeBytes } = req.body;
      if (!bundleType || !title || !description || !authorHash || !bundleHash) {
        return res.status(400).json({ error: 'bundleType, title, description, authorHash, and bundleHash are required' });
      }
      const id = await marketplace.publishBundle({
        bundleType, title, description, authorHash, authorName: authorName || 'Anonymous',
        version, tags, targetAreas, bundleHash, bundleSizeBytes,
      });
      res.status(201).json({ id });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // POST /marketplace/bundles/:id/reviews — Submit a review
  router.post('/marketplace/bundles/:id/reviews', async (req, res) => {
    try {
      const { reviewerHash, reviewerName, rating, reviewText } = req.body;
      if (!reviewerHash || !rating || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'reviewerHash and rating (1-5) required' });
      }
      const id = await marketplace.submitReview({
        listingId: req.params.id, reviewerHash, reviewerName: reviewerName || 'Anonymous',
        rating: Number(rating), reviewText,
      });
      res.json({ id });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // POST /marketplace/bundles/:id/download — Increment download count
  router.post('/marketplace/bundles/:id/download', async (req, res) => {
    try {
      await marketplace.incrementDownloads(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // DELETE /marketplace/bundles/:id — Unpublish (author only)
  router.delete('/marketplace/bundles/:id', async (req, res) => {
    try {
      await marketplace.unpublish(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
