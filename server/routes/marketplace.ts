/**
 * marketplace.ts — Bundle marketplace API routes
 *
 * Discovery, ratings, and reviews for community .anton bundles.
 */

import { safeError } from '../lib/error-response.js';
import { Router } from 'express';
import multer from 'multer';
import type { DatabaseAdapter } from '../db/database.js';
import { createMarketplaceService, MAX_BUNDLE_BYTES } from '../services/marketplace-service.js';

// Multipart upload for the actual .anton bytes (Wave 4.9). Memory storage —
// the blob goes straight into the listing row (BYTEA), no temp files.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BUNDLE_BYTES } });

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

  // POST /marketplace/bundles — Publish a bundle listing.
  // Wave 4.9: accepts multipart/form-data with the actual .anton file in the
  // `file` field (JSON body still accepted for metadata-only listings, which
  // cannot be downloaded). When a file is present, its sha256 must match the
  // declared bundleHash — verified server-side before anything is stored.
  router.post('/marketplace/bundles', upload.single('file'), async (req, res) => {
    try {
      const { bundleType, title, description, authorHash, authorName, version, bundleHash, bundleSizeBytes } = req.body;
      // tags/targetAreas arrive as arrays (JSON body) or JSON strings (multipart fields)
      const parseArr = (v: unknown): string[] | undefined => {
        if (Array.isArray(v)) return v.map(String);
        if (typeof v === 'string' && v.trim().startsWith('[')) {
          try { const a = JSON.parse(v); return Array.isArray(a) ? a.map(String) : undefined; } catch { return undefined; }
        }
        return undefined;
      };
      if (!bundleType || !title || !description || !authorHash || !bundleHash) {
        return res.status(400).json({ error: 'bundleType, title, description, authorHash, and bundleHash are required' });
      }
      const id = await marketplace.publishBundle({
        bundleType, title, description, authorHash, authorName: authorName || 'Anonymous',
        version,
        tags: parseArr(req.body.tags),
        targetAreas: parseArr(req.body.targetAreas),
        bundleHash,
        bundleSizeBytes: bundleSizeBytes ? Number(bundleSizeBytes) : undefined,
        bundleData: req.file?.buffer,
      });
      res.status(201).json({ id, hasBundleData: !!req.file?.buffer });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      // Validation problems (size cap, hash mismatch, empty file) are 400s.
      if (/does not match|MB|empty/.test(msg)) {
        return res.status(400).json({ error: msg });
      }
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

  // POST /marketplace/bundles/:id/download — Return the REAL bundle bytes.
  // Wave 4.9: previously this only incremented a counter; now it streams the
  // stored .anton with the sha256 in headers so the client can verify, and
  // the download count increments only on actual delivery.
  router.post('/marketplace/bundles/:id/download', async (req, res) => {
    try {
      const result = await marketplace.getListingBundle(req.params.id);
      if (!result.found) return res.status(404).json({ error: 'Bundle not found' });
      if (!result.hasData) {
        return res.status(409).json({
          error: 'This listing has no stored bundle file (metadata-only listing, published before blob support). Ask the author to re-publish with the file attached.',
        });
      }
      const { listing } = result;
      const safeName = `${listing.id}.anton`;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      res.setHeader('Content-Length', String(listing.data.length));
      // Client-side verification info: sha256 of the exact bytes served.
      res.setHeader('X-Bundle-Sha256', listing.bundle_hash);
      res.setHeader('X-Bundle-Type', listing.bundle_type);
      res.send(listing.data);
      // Count on actual delivery — after the bytes were handed to the socket.
      await marketplace.incrementDownloads(req.params.id);
    } catch (err) {
      if (!res.headersSent) res.status(500).json({ error: safeError(err) });
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
