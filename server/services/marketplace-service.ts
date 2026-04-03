/**
 * marketplace-service.ts — Bundle marketplace discovery, ratings, and reviews
 *
 * Manages the searchable catalogue of .anton bundles shared by the community.
 * Each listing references a bundle type from the registry and can be rated/reviewed.
 */

import type { DatabaseAdapter } from '../db/database.js';

interface BundleListing {
  id: string;
  bundle_type: string;
  title: string;
  description: string;
  author_hash: string;
  author_name: string;
  version: string;
  tags: string[];
  target_areas: string[];
  avg_rating: number;
  rating_count: number;
  download_count: number;
  created_at: string;
}

interface Review {
  id: string;
  listing_id: string;
  reviewer_hash: string;
  reviewer_name: string;
  rating: number;
  review_text: string | null;
  created_at: string;
}

export async function createMarketplaceService(db: DatabaseAdapter) {

  async function listBundles(filters: {
    type?: string;
    tags?: string[];
    author?: string;
    minRating?: number;
    search?: string;
    page?: number;
    pageSize?: number;
  } = {}): Promise<{ listings: BundleListing[]; total: number }> {
    const conditions: string[] = ['is_published = 1'];
    const params: unknown[] = [];

    if (filters.type) {
      conditions.push('bundle_type = ?');
      params.push(filters.type);
    }
    if (filters.author) {
      conditions.push('author_hash = ?');
      params.push(filters.author);
    }
    if (filters.minRating) {
      conditions.push('avg_rating >= ?');
      params.push(filters.minRating);
    }
    if (filters.search) {
      conditions.push("to_tsvector('english', title || ' ' || description) @@ plainto_tsquery('english', ?)");
      params.push(filters.search);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const pageSize = Math.min(filters.pageSize ?? 20, 50);
    const offset = ((filters.page ?? 1) - 1) * pageSize;

    const total = await db.get<{ count: number }>(`SELECT COUNT(*) as count FROM marketplace_bundle_listings ${where}`, ...params);
    params.push(pageSize, offset);
    const listings = await db.all<BundleListing>(
      `SELECT * FROM marketplace_bundle_listings ${where} ORDER BY avg_rating DESC, download_count DESC LIMIT ? OFFSET ?`,
      ...params
    );

    return { listings, total: total?.count ?? 0 };
  }

  async function getListing(id: string): Promise<{ listing: BundleListing | null; reviews: Review[] }> {
    const listing = await db.get<BundleListing>('SELECT * FROM marketplace_bundle_listings WHERE id = ?', id);
    if (!listing) return { listing: null, reviews: [] };
    const reviews = await db.all<Review>(
      'SELECT * FROM marketplace_reviews WHERE listing_id = ? ORDER BY created_at DESC LIMIT 50', id
    );
    return { listing, reviews };
  }

  async function publishBundle(params: {
    bundleType: string;
    title: string;
    description: string;
    authorHash: string;
    authorName: string;
    version?: string;
    tags?: string[];
    targetAreas?: string[];
    bundleHash: string;
    bundleSizeBytes?: number;
  }): Promise<string> {
    const id = `mpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`
      INSERT INTO marketplace_bundle_listings
        (id, bundle_type, title, description, author_hash, author_name, version, tags, target_areas, bundle_hash, bundle_size_bytes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, id, params.bundleType, params.title, params.description,
       params.authorHash, params.authorName, params.version ?? '1.0.0',
       JSON.stringify(params.tags ?? []), JSON.stringify(params.targetAreas ?? []),
       params.bundleHash, params.bundleSizeBytes ?? 0);
    return id;
  }

  async function submitReview(params: {
    listingId: string;
    reviewerHash: string;
    reviewerName: string;
    rating: number;
    reviewText?: string;
  }): Promise<string> {
    const id = `rev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`
      INSERT INTO marketplace_reviews (id, listing_id, reviewer_hash, reviewer_name, rating, review_text)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (listing_id, reviewer_hash) DO UPDATE SET
        rating = EXCLUDED.rating, review_text = EXCLUDED.review_text, created_at = NOW()
    `, id, params.listingId, params.reviewerHash, params.reviewerName,
       params.rating, params.reviewText ?? null);

    // Recalculate average rating
    const stats = await db.get<{ avg: number; cnt: number }>(
      'SELECT AVG(rating) as avg, COUNT(*) as cnt FROM marketplace_reviews WHERE listing_id = ?',
      params.listingId
    );
    if (stats) {
      await db.run(
        'UPDATE marketplace_bundle_listings SET avg_rating = ?, rating_count = ?, updated_at = NOW() WHERE id = ?',
        Math.round(stats.avg * 10) / 10, stats.cnt, params.listingId
      );
    }
    return id;
  }

  async function incrementDownloads(listingId: string): Promise<void> {
    await db.run('UPDATE marketplace_bundle_listings SET download_count = download_count + 1 WHERE id = ?', listingId);
  }

  async function unpublish(listingId: string): Promise<void> {
    await db.run('UPDATE marketplace_bundle_listings SET is_published = 0, updated_at = NOW() WHERE id = ?', listingId);
  }

  return { listBundles, getListing, publishBundle, submitReview, incrementDownloads, unpublish };
}
