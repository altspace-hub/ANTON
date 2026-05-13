/**
 * resolve.ts — GET /v1/portals/resolve/:address handler.
 *
 * Exact-name lookup. Returns the canonical portal record (contact hash,
 * signing pubkey, full descriptor) for a given "name.namespace"
 * address. This is the function the Comm App calls when a user types
 * or pastes a portal address directly, bypassing search.
 *
 * Revoked portals return 404 — soft-deleted rows are intentionally
 * unresolvable via this endpoint.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from 'pino';
import type { RegistryDb } from '../db.js';
import { json } from '../routes.js';
import { parseAddress } from '../validate.js';

interface ResolveRow {
  name: string;
  namespace: string;
  contact_hash: string;
  signing_pubkey_hex: string;
  descriptor_json: Record<string, unknown>;
  capability_summary: Record<string, unknown>;
  tier: string;
  approved_at: string;
}

export async function handleResolve(
  _req: IncomingMessage,
  res: ServerResponse,
  db: RegistryDb,
  log: Logger,
  rawAddress: string,
): Promise<void> {
  const decoded = (() => {
    try { return decodeURIComponent(rawAddress); }
    catch { return rawAddress; }
  })();
  const parsed = parseAddress(decoded);
  if (!parsed.ok) {
    json(res, 400, { error: 'invalid_address', message: parsed.error });
    return;
  }

  try {
    const result = await db.query<ResolveRow>(
      `SELECT name, namespace, contact_hash, signing_pubkey_hex,
              descriptor_json, capability_summary, tier, approved_at
       FROM portals
       WHERE name = $1 AND namespace = $2 AND revoked_at IS NULL`,
      [parsed.value.name, parsed.value.namespace],
    );
    const row = result.rows[0];
    if (!row) {
      json(res, 404, { found: false });
      return;
    }
    json(res, 200, {
      found: true,
      portalAddress: `${row.name}.${row.namespace}`,
      contactHash: row.contact_hash,
      signingPubkeyHex: row.signing_pubkey_hex,
      descriptor: row.descriptor_json,
      capabilitySummary: row.capability_summary,
      tier: row.tier,
      approvedAt: row.approved_at,
    });
  } catch (err) {
    log.error({ err: (err as Error).message }, 'resolve query failed');
    json(res, 500, { error: 'internal_error' });
  }
}
