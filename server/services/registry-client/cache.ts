/**
 * cache.ts — Registry resolution + descriptor cache.
 *
 * Backs onto `portal_resolution_cache` and `portal_descriptor_cache` tables
 * (migration 145). Honours the cache TTLs from Registry Protocol §8.6:
 *
 *   active not-recently-updated: 6h
 *   recently updated:            5min
 *   not found (negative):        5min
 *   revoked:                     24h
 *
 * Descriptor cache TTL defaults to 24h per Capability Schema §14.1 but the
 * portal MAY override via descriptor field.
 */

import type { DatabaseAdapter } from '../../db/database.js';
import type {
  DescriptorCacheEntry,
  ResolutionCacheEntry,
  ResolutionResponse,
} from './types.js';

// ── Cache TTLs (seconds) ───────────────────────────────────────────────────

export const RESOLUTION_TTL_DEFAULT_SECS = 21600; // 6 hours
export const RESOLUTION_TTL_RECENTLY_UPDATED_SECS = 300; // 5 min
export const RESOLUTION_TTL_NEGATIVE_SECS = 300; // 5 min
export const RESOLUTION_TTL_REVOKED_SECS = 86400; // 24 hours

export const DESCRIPTOR_TTL_DEFAULT_SECS = 86400; // 24 hours

// ── Resolution cache ───────────────────────────────────────────────────────

export interface ResolutionCache {
  get(namespace: string, name: string): Promise<ResolutionCacheEntry | null>;
  put(
    namespace: string,
    name: string,
    resolution: ResolutionResponse | null,
    ttlSeconds: number,
  ): Promise<void>;
  invalidate(namespace: string, name: string): Promise<void>;
  /** Delete every expired entry. Call from a periodic job. */
  pruneExpired(): Promise<number>;
}

export function createResolutionCache(db: DatabaseAdapter): ResolutionCache {
  return {
    async get(namespace, name) {
      const key = `${namespace}/${name}`;
      const row = await db.get<{
        cache_key: string;
        namespace: string;
        name: string;
        contact_hash: string | null;
        public_key_wire: string | null;
        display_title: string | null;
        category: string | null;
        capability_summary: Record<string, unknown> | null;
        fetched_at: string;
        expires_at: string;
        is_negative: boolean;
      }>(
        `SELECT * FROM portal_resolution_cache WHERE cache_key = ? AND expires_at > NOW()`,
        key,
      );
      if (!row) return null;
      if (row.is_negative) {
        return {
          resolution: null,
          fetchedAt: new Date(row.fetched_at).toISOString(),
          expiresAt: new Date(row.expires_at).toISOString(),
        };
      }
      const resolution: ResolutionResponse = {
        portalId: '', // resolution responses don't always carry portalId in cache
        name: row.name,
        namespace: row.namespace,
        contactHash: row.contact_hash!,
        publicKey: row.public_key_wire!,
        displayTitle: row.display_title,
        description: null,
        category: row.category,
        publicIndex: false,
        capabilitySummary: row.capability_summary ?? null,
        descriptorHash: null,
        registeredAt: new Date(row.fetched_at).toISOString(),
        lastSeenAt: null,
        revokedAt: null,
      };
      return {
        resolution,
        fetchedAt: new Date(row.fetched_at).toISOString(),
        expiresAt: new Date(row.expires_at).toISOString(),
      };
    },

    async put(namespace, name, resolution, ttlSeconds) {
      const key = `${namespace}/${name}`;
      const expires = new Date(Date.now() + ttlSeconds * 1000).toISOString();
      await db.run(
        `INSERT INTO portal_resolution_cache
           (cache_key, namespace, name, contact_hash, public_key_wire,
            display_title, category, capability_summary,
            fetched_at, expires_at, is_negative)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)
         ON CONFLICT (cache_key) DO UPDATE SET
           contact_hash = EXCLUDED.contact_hash,
           public_key_wire = EXCLUDED.public_key_wire,
           display_title = EXCLUDED.display_title,
           category = EXCLUDED.category,
           capability_summary = EXCLUDED.capability_summary,
           fetched_at = NOW(),
           expires_at = EXCLUDED.expires_at,
           is_negative = EXCLUDED.is_negative`,
        key,
        namespace,
        name,
        resolution?.contactHash ?? null,
        resolution?.publicKey ?? null,
        resolution?.displayTitle ?? null,
        resolution?.category ?? null,
        resolution?.capabilitySummary ? JSON.stringify(resolution.capabilitySummary) : null,
        expires,
        resolution === null,
      );
    },

    async invalidate(namespace, name) {
      const key = `${namespace}/${name}`;
      await db.run(`DELETE FROM portal_resolution_cache WHERE cache_key = ?`, key);
    },

    async pruneExpired() {
      const r = await db.run(`DELETE FROM portal_resolution_cache WHERE expires_at <= NOW()`);
      return r.changes;
    },
  };
}

// ── Descriptor cache ───────────────────────────────────────────────────────

export interface DescriptorCache {
  get(portalAddress: string): Promise<DescriptorCacheEntry | null>;
  put(
    portalAddress: string,
    entry: Omit<DescriptorCacheEntry, 'fetchedAt'>,
    ttlSeconds?: number,
  ): Promise<void>;
  invalidate(portalAddress: string): Promise<void>;
  pruneExpired(): Promise<number>;
}

export function createDescriptorCache(db: DatabaseAdapter): DescriptorCache {
  return {
    async get(portalAddress) {
      const row = await db.get<{
        descriptor_hash: string;
        descriptor: Record<string, unknown>;
        signature: string;
        signing_key_fingerprint: string;
        valid_from: string;
        valid_until: string;
        fetched_at: string;
      }>(
        `SELECT descriptor_hash, descriptor, signature, signing_key_fingerprint,
                valid_from, valid_until, fetched_at
         FROM portal_descriptor_cache
         WHERE portal_address = ? AND valid_until > NOW()`,
        portalAddress,
      );
      if (!row) return null;
      return {
        descriptorHash: row.descriptor_hash,
        descriptor: row.descriptor,
        signature: row.signature,
        signingKeyFingerprint: row.signing_key_fingerprint,
        validFrom: new Date(row.valid_from).toISOString(),
        validUntil: new Date(row.valid_until).toISOString(),
        fetchedAt: new Date(row.fetched_at).toISOString(),
      };
    },

    async put(portalAddress, entry, ttlSeconds = DESCRIPTOR_TTL_DEFAULT_SECS) {
      await db.run(
        `INSERT INTO portal_descriptor_cache
           (portal_address, descriptor_hash, descriptor, signature,
            signing_key_fingerprint, valid_from, valid_until,
            fetched_at, cache_ttl_seconds)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)
         ON CONFLICT (portal_address) DO UPDATE SET
           descriptor_hash = EXCLUDED.descriptor_hash,
           descriptor = EXCLUDED.descriptor,
           signature = EXCLUDED.signature,
           signing_key_fingerprint = EXCLUDED.signing_key_fingerprint,
           valid_from = EXCLUDED.valid_from,
           valid_until = EXCLUDED.valid_until,
           fetched_at = NOW(),
           cache_ttl_seconds = EXCLUDED.cache_ttl_seconds`,
        portalAddress,
        entry.descriptorHash,
        JSON.stringify(entry.descriptor),
        entry.signature,
        entry.signingKeyFingerprint,
        entry.validFrom,
        entry.validUntil,
        ttlSeconds,
      );
    },

    async invalidate(portalAddress) {
      await db.run(`DELETE FROM portal_descriptor_cache WHERE portal_address = ?`, portalAddress);
    },

    async pruneExpired() {
      const r = await db.run(`DELETE FROM portal_descriptor_cache WHERE valid_until <= NOW()`);
      return r.changes;
    },
  };
}
