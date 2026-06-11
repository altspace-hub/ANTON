/**
 * marketplace-service.ts — Bundle marketplace discovery, ratings, and reviews
 *
 * Manages the searchable catalogue of .anton bundles shared by the community.
 * Each listing references a bundle type from the registry and can be rated/reviewed.
 */

import crypto from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';

/**
 * Hard cap on stored bundle blobs (Wave 4.9). Above this the publish fails
 * with an honest error instead of silently truncating or accepting a blob
 * the download path can't reasonably serve.
 */
export const MAX_BUNDLE_BYTES = 25 * 1024 * 1024; // 25 MB

/** Normalize a sha256 representation: strip optional `sha256:` prefix, lowercase. */
export function normalizeSha256(hash: string): string {
  return hash.replace(/^sha256:/i, '').trim().toLowerCase();
}

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
  /** True when the actual bundle bytes are stored and downloadable. */
  has_bundle_data?: boolean;
}

export interface ListingBundleFile {
  id: string;
  title: string;
  version: string;
  bundle_type: string;
  bundle_hash: string;
  data: Buffer;
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

/**
 * Listing projection — every column EXCEPT bundle_data, plus a boolean flag
 * for whether real bytes are stored. Keeps list/detail responses blob-free.
 */
const LISTING_COLUMNS = [
  'id', 'bundle_type', 'title', 'description', 'author_hash', 'author_name',
  'version', 'tags', 'target_areas', 'bundle_hash', 'bundle_size_bytes',
  'is_published', 'avg_rating', 'rating_count', 'download_count',
  'created_at', 'updated_at',
  '(bundle_data IS NOT NULL) AS has_bundle_data',
].join(', ');

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
    // Explicit column list — never pull bundle_data blobs into list queries.
    const listings = await db.all<BundleListing>(
      `SELECT ${LISTING_COLUMNS} FROM marketplace_bundle_listings ${where} ORDER BY avg_rating DESC, download_count DESC LIMIT ? OFFSET ?`,
      ...params
    );

    return { listings, total: total?.count ?? 0 };
  }

  async function getListing(id: string): Promise<{ listing: BundleListing | null; reviews: Review[] }> {
    const listing = await db.get<BundleListing>(`SELECT ${LISTING_COLUMNS} FROM marketplace_bundle_listings WHERE id = ?`, id);
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
    /**
     * The actual .anton bytes (Wave 4.9). When provided, the blob is stored
     * with the listing after a sha256-vs-bundleHash verification; the size
     * cap is enforced with an honest error. Without it, the listing is
     * metadata-only and the download endpoint will refuse honestly.
     */
    bundleData?: Buffer;
  }): Promise<string> {
    let storedData: Buffer | null = null;
    let sizeBytes = params.bundleSizeBytes ?? 0;
    if (params.bundleData) {
      if (params.bundleData.length === 0) {
        throw new Error('Uploaded bundle file is empty');
      }
      if (params.bundleData.length > MAX_BUNDLE_BYTES) {
        throw new Error(
          `Bundle is ${(params.bundleData.length / 1024 / 1024).toFixed(1)} MB — the marketplace stores bundles up to ${MAX_BUNDLE_BYTES / 1024 / 1024} MB`
        );
      }
      const actualHash = crypto.createHash('sha256').update(params.bundleData).digest('hex');
      if (normalizeSha256(params.bundleHash) !== actualHash) {
        throw new Error(
          `bundleHash does not match the uploaded file (declared ${normalizeSha256(params.bundleHash).slice(0, 12)}…, actual ${actualHash.slice(0, 12)}…)`
        );
      }
      storedData = params.bundleData;
      sizeBytes = params.bundleData.length;
    }
    const id = `mpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`
      INSERT INTO marketplace_bundle_listings
        (id, bundle_type, title, description, author_hash, author_name, version, tags, target_areas, bundle_hash, bundle_size_bytes, bundle_data, bundle_stored_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, id, params.bundleType, params.title, params.description,
       params.authorHash, params.authorName, params.version ?? '1.0.0',
       JSON.stringify(params.tags ?? []), JSON.stringify(params.targetAreas ?? []),
       // F4: bundle_hash is stored NORMALIZED (bare lowercase hex, no
       // `sha256:` prefix) — the same form the upload verification compares
       // and the download path emits. Pre-fix rows may still carry a prefix;
       // getListingBundle normalizes at read.
       normalizeSha256(params.bundleHash), sizeBytes, storedData,
       storedData ? new Date().toISOString() : null);
    return id;
  }

  /**
   * Fetch the stored bundle blob for download (Wave 4.9). Returns null when
   * the listing doesn't exist or is unpublished; a listing without stored
   * bytes returns `data: null` inside the result so the route can answer
   * honestly ("metadata-only listing") instead of a generic 404.
   */
  async function getListingBundle(id: string): Promise<
    | { found: false }
    | { found: true; hasData: false; listing: Pick<ListingBundleFile, 'id' | 'title' | 'version' | 'bundle_type' | 'bundle_hash'> }
    | { found: true; hasData: true; listing: ListingBundleFile }
  > {
    const row = await db.get<{
      id: string; title: string; version: string; bundle_type: string;
      bundle_hash: string; bundle_data: Buffer | null;
    }>(
      'SELECT id, title, version, bundle_type, bundle_hash, bundle_data FROM marketplace_bundle_listings WHERE id = ? AND is_published = 1',
      id
    );
    if (!row) return { found: false };
    const meta = {
      id: row.id, title: row.title, version: row.version,
      bundle_type: row.bundle_type,
      // F4: emit bare lowercase hex regardless of how the row was stored —
      // listings published before normalization may carry a `sha256:` prefix.
      bundle_hash: normalizeSha256(row.bundle_hash),
    };
    if (!row.bundle_data || row.bundle_data.length === 0) {
      return { found: true, hasData: false, listing: meta };
    }
    return { found: true, hasData: true, listing: { ...meta, data: Buffer.from(row.bundle_data) } };
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

  return { listBundles, getListing, publishBundle, getListingBundle, submitReview, incrementDownloads, unpublish };
}
