/**
 * mesh-config-service.ts — single source of truth for the mesh relay list.
 *
 * Track C Slice 2: replaces the bare `process.env.ANTON_MESH_RELAYS` reads
 * scattered across the mesh stack with a service that reads from the DB
 * (`instance_identity.relay_endpoints`) when the operator has set an override,
 * falling back to the env value otherwise.
 *
 * Read path: anywhere that needs the canonical list (mesh bootstrap, the
 * /instance-info endpoint, enrollment QR generation).
 * Write path: the admin endpoint `PUT /api/app/admin/relays` and any future
 * operator UI.
 *
 * The dialer reads this at startup only (Slice 2 leaves runtime hot-reload
 * to a future iteration); changes propagate to phones on next launch via
 * /instance-info, and rotate the dialer's connections on the next server
 * restart. That is acceptable for the Track C goal — the operator pain
 * being avoided is "re-pair the whole fleet", not "restart the server".
 */

import type { DatabaseAdapter } from '../db/database.js';

export interface RelayConfig {
  /** Canonical relay URL list. May be empty when mesh isn't configured at all. */
  endpoints: string[];
  /** Where the value came from — useful for diagnostics + the admin UI. */
  source: 'db' | 'env' | 'none';
}

const ROW_KEY = 'singleton';

/**
 * Read the canonical relay list. DB override wins over env; env is the
 * legacy fallback so existing deployments keep working unchanged.
 */
export async function getRelayEndpoints(db: DatabaseAdapter): Promise<RelayConfig> {
  // DB override?
  let dbList: string[] | null = null;
  try {
    const row = await db.get<{ relay_endpoints: string | string[] | null }>(
      'SELECT relay_endpoints FROM instance_identity WHERE singleton = $1',
      ROW_KEY,
    );
    if (row?.relay_endpoints != null) {
      // node-postgres returns JSONB as a parsed object/array directly;
      // some adapters return the raw string. Handle both.
      const raw = row.relay_endpoints;
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed)) {
        dbList = parsed
          .filter((u): u is string => typeof u === 'string')
          .map(u => u.trim())
          .filter(u => u.length > 0);
      }
    }
  } catch {
    // Migration 207 may not be applied yet on a freshly-cloned dev box —
    // surface as "no override" rather than crashing every read site.
    dbList = null;
  }

  if (dbList && dbList.length > 0) {
    return { endpoints: dbList, source: 'db' };
  }

  const envRaw = (process.env.ANTON_MESH_RELAYS ?? '').trim();
  if (envRaw.length > 0) {
    const envList = envRaw
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    if (envList.length > 0) {
      return { endpoints: envList, source: 'env' };
    }
  }

  return { endpoints: [], source: 'none' };
}

/**
 * Replace the relay list. Pass an empty array to clear the override and
 * fall back to env. Validates that each entry is a wss:// URL (or ws://
 * when ALLOW_PRIVATE_P2P is set, for local dev) before persisting.
 */
export async function setRelayEndpoints(db: DatabaseAdapter, endpoints: string[]): Promise<void> {
  const cleaned = endpoints.map(s => s.trim()).filter(s => s.length > 0);
  for (const url of cleaned) {
    validateRelayUrl(url);
  }
  if (cleaned.length === 0) {
    // Clear → revert to env fallback
    await db.run(
      'UPDATE instance_identity SET relay_endpoints = NULL WHERE singleton = $1',
      ROW_KEY,
    );
    return;
  }
  await db.run(
    'UPDATE instance_identity SET relay_endpoints = $1::jsonb WHERE singleton = $2',
    JSON.stringify(cleaned),
    ROW_KEY,
  );
}

function validateRelayUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid relay URL: ${url}`);
  }
  const allowInsecure = process.env.ALLOW_PRIVATE_P2P === 'true';
  if (parsed.protocol !== 'wss:' && !(allowInsecure && parsed.protocol === 'ws:')) {
    throw new Error(`Relay URL must be wss:// (got ${parsed.protocol} for ${url})`);
  }
  if (!parsed.hostname) {
    throw new Error(`Relay URL missing hostname: ${url}`);
  }
}
