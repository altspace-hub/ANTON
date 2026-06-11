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
 * Canonicalize a relay URL per spec §4.2.1 — the SAME rules the relay
 * applies to its own RELAY_URL (relay/src/canonical-url.ts) and the phone
 * applies to the QR's relay_endpoints (src/app/services/mesh-validate.ts).
 *
 * This MUST run here, because this list feeds three byte-for-byte-sensitive
 * sites:
 *   1. the dialer's HELLO_INSTANCE `relay_url` (the relay rejects the HELLO
 *      with INVALID_PROOF/BAD_HELLO unless it equals the relay's own
 *      canonical URL — relay/src/hello.ts step 3),
 *   2. the Noise prologue (`buildPrologue(relayUrl, …)` — a mismatch makes
 *      Noise msg2 fail to verify),
 *   3. the enrollment QR (so the phone pins the identical string).
 *
 * If the operator's ANTON_MESH_RELAYS (or DB override) carries a trailing
 * slash, an uppercase host, an explicit `:443`, etc., the raw string differs
 * from the relay's canonical form → HELLO is rejected → the instance never
 * registers (relay /healthz shows active_instances: 0 while ws_connections > 0)
 * → phones report "mesh: all relays unreachable" even though the instance's
 * own dialer logged "reachability: CONNECTED" (that fires on WS-open, before
 * the relay's HELLO rejection). Canonicalizing here closes that asymmetry.
 *
 * On any rule violation we fall back to the trimmed input rather than dropping
 * the endpoint — keeping behaviour permissive for ws:// dev relays and odd
 * inputs, while still normalizing the common production cases.
 */
function canonicalizeRelayUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return input;
  }
  // Only normalize the wss/ws schemes the mesh uses; leave anything else as-is.
  if (url.protocol !== 'wss:' && url.protocol !== 'ws:') return input;
  // Reject-by-passthrough: userinfo/query/fragment/path are not part of a
  // canonical relay URL. setRelayEndpoints + mesh-validate already refuse
  // these on the write/pair paths, so here we simply strip what we safely can
  // (path '/' ) and leave anything stranger untouched for the caller's logs.
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    return input;
  }
  if (url.pathname !== '' && url.pathname !== '/') return input;

  let hostname = url.hostname;
  if (hostname === '') return input;
  let isIPv6 = false;
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    hostname = hostname.slice(1, -1);
    isIPv6 = true;
  } else if (hostname.includes(':')) {
    isIPv6 = true;
  }
  // WHATWG URL already ASCII-lowercases domain hosts; lowercase defensively.
  hostname = hostname.toLowerCase();

  const defaultPort = url.protocol === 'ws:' ? '80' : '443';
  const port = url.port === '' || url.port === defaultPort ? '' : `:${url.port}`;
  const hostPart = isIPv6 ? `[${hostname}]` : hostname;
  const scheme = url.protocol.replace(':', '');
  return `${scheme}://${hostPart}${port}`;
}

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
          .filter(u => u.length > 0)
          .map(canonicalizeRelayUrl);
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
      .filter(s => s.length > 0)
      .map(canonicalizeRelayUrl);
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
