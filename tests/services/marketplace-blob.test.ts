/**
 * marketplace-blob.test.ts — Wave 4.9: the marketplace moves REAL bytes.
 *
 *   • publish with the actual bundle Buffer → stored, sha256 verified
 *   • declared hash mismatch → honest 400-shaped error, nothing stored
 *   • >25 MB → honest size-cap error
 *   • download round-trip: getListingBundle returns byte-identical data
 *   • metadata-only listing → found but hasData:false (honest 409 upstream)
 *
 * In-memory fake DatabaseAdapter — no Postgres needed (same pattern as
 * anton-validator-dispatch.test.ts).
 */
import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import { createMarketplaceService, MAX_BUNDLE_BYTES, normalizeSha256 } from '../../server/services/marketplace-service.js';

interface StoredListing {
  id: string;
  bundle_type: string;
  title: string;
  version: string;
  bundle_hash: string;
  bundle_size_bytes: number;
  bundle_data: Buffer | null;
  is_published: number;
}

function makeFakeDb(): { db: DatabaseAdapter; listings: Map<string, StoredListing> } {
  const listings = new Map<string, StoredListing>();
  const db: DatabaseAdapter = {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (sql.includes('FROM marketplace_bundle_listings WHERE id = ?') && sql.includes('bundle_data')) {
        const row = listings.get(String(params[0]));
        if (!row || row.is_published !== 1) return undefined;
        return {
          id: row.id, title: row.title, version: row.version,
          bundle_type: row.bundle_type, bundle_hash: row.bundle_hash,
          bundle_data: row.bundle_data,
        } as T;
      }
      return undefined;
    },
    async all<T>(): Promise<T[]> { return []; },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (sql.includes('INSERT INTO marketplace_bundle_listings')) {
        // column order from the service:
        // id, bundle_type, title, description, author_hash, author_name,
        // version, tags, target_areas, bundle_hash, bundle_size_bytes,
        // bundle_data, bundle_stored_at
        listings.set(String(params[0]), {
          id: String(params[0]),
          bundle_type: String(params[1]),
          title: String(params[2]),
          version: String(params[6]),
          bundle_hash: String(params[9]),
          bundle_size_bytes: Number(params[10]),
          bundle_data: (params[11] as Buffer | null) ?? null,
          is_published: 1,
        });
      }
      return { changes: 1, lastInsertRowid: 0 };
    },
    async exec(): Promise<void> { /* noop */ },
    async transaction<T>(fn: (db: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close(): Promise<void> { /* noop */ },
  };
  return { db, listings };
}

const BUNDLE = Buffer.from('PK-fake-anton-bundle-bytes-for-roundtrip-test');
const BUNDLE_SHA = crypto.createHash('sha256').update(BUNDLE).digest('hex');

function publishParams(overrides: Record<string, unknown> = {}) {
  return {
    bundleType: 'module',
    title: 'Test Bundle',
    description: 'desc',
    authorHash: 'ah_1',
    authorName: 'Tester',
    bundleHash: BUNDLE_SHA,
    bundleData: BUNDLE,
    ...overrides,
  } as Parameters<Awaited<ReturnType<typeof createMarketplaceService>>['publishBundle']>[0];
}

describe('marketplace blob storage (Wave 4.9)', () => {
  it('publish stores the blob and download round-trips byte-identical data', async () => {
    const { db } = makeFakeDb();
    const svc = await createMarketplaceService(db);
    const id = await svc.publishBundle(publishParams());

    const result = await svc.getListingBundle(id);
    expect(result.found).toBe(true);
    if (!result.found || !result.hasData) throw new Error('expected stored bundle data');
    expect(result.listing.data.equals(BUNDLE)).toBe(true);
    // hash round-trip: served bytes hash to the listing's declared hash
    const served = crypto.createHash('sha256').update(result.listing.data).digest('hex');
    expect(served).toBe(normalizeSha256(result.listing.bundle_hash));
  });

  it('accepts a sha256: prefixed declared hash', async () => {
    const { db } = makeFakeDb();
    const svc = await createMarketplaceService(db);
    const id = await svc.publishBundle(publishParams({ bundleHash: `sha256:${BUNDLE_SHA.toUpperCase()}` }));
    const result = await svc.getListingBundle(id);
    expect(result.found && result.hasData).toBe(true);
  });

  it('rejects a publish whose declared hash does not match the bytes', async () => {
    const { db, listings } = makeFakeDb();
    const svc = await createMarketplaceService(db);
    await expect(svc.publishBundle(publishParams({ bundleHash: 'a'.repeat(64) })))
      .rejects.toThrow(/does not match/);
    expect(listings.size).toBe(0); // nothing stored
  });

  it('rejects bundles above the 25 MB cap with an honest error', async () => {
    const { db } = makeFakeDb();
    const svc = await createMarketplaceService(db);
    const big = Buffer.alloc(MAX_BUNDLE_BYTES + 1);
    const bigHash = crypto.createHash('sha256').update(big).digest('hex');
    await expect(svc.publishBundle(publishParams({ bundleData: big, bundleHash: bigHash })))
      .rejects.toThrow(/25 MB/);
  });

  it('metadata-only listings (no file) report hasData:false instead of fake bytes', async () => {
    const { db } = makeFakeDb();
    const svc = await createMarketplaceService(db);
    const id = await svc.publishBundle(publishParams({ bundleData: undefined, bundleSizeBytes: 123 }));
    const result = await svc.getListingBundle(id);
    expect(result.found).toBe(true);
    if (!result.found) throw new Error('unreachable');
    expect(result.hasData).toBe(false);
  });

  it('unknown listing → found:false', async () => {
    const { db } = makeFakeDb();
    const svc = await createMarketplaceService(db);
    const result = await svc.getListingBundle('mpl_nope');
    expect(result.found).toBe(false);
  });
});
