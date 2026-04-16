// ── Beehive — Local Identity Resolution ────────────────────────────────────
// Phase 1 runs in local-only mode. The Queen identity must be the locally
// activated community identity, not whatever the client claims. Phase 4 will
// extend this to verify identity via Ed25519 signature on AAP messages.

import type { DatabaseAdapter } from '../../db/database.js';

export interface LocalIdentity {
  contact_hash: string;
  display_name: string;
}

/**
 * Returns the locally activated community identity, or null if community
 * has not been activated yet on this instance.
 */
export async function getLocalIdentity(db: DatabaseAdapter): Promise<LocalIdentity | null> {
  const row = await db.get<LocalIdentity>(
    "SELECT contact_hash, display_name FROM community_identity WHERE user_id = 'default'",
  );
  return row ?? null;
}

/**
 * Resolves the caller's effective identity for a Beehive operation.
 * In Phase 1 this is always the local activated identity; in Phase 4 it
 * will be derived from the verified AAP signature on the inbound message.
 *
 * If `claimed` is supplied, it must match the local identity exactly —
 * otherwise the call is rejected as identity spoofing.
 *
 * Throws an Error with a meaningful message on failure (route handlers
 * convert these to 403/409 responses).
 */
export async function resolveCallerIdentity(
  db: DatabaseAdapter,
  claimed?: string | null,
): Promise<LocalIdentity> {
  const local = await getLocalIdentity(db);
  if (!local) {
    throw new Error('Local community identity not activated. Activate your identity on the Identity page first.');
  }
  if (claimed && claimed !== local.contact_hash) {
    throw new Error('Provided contact hash does not match the locally activated identity.');
  }
  return local;
}
