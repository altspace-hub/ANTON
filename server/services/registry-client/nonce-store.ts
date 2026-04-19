/**
 * nonce-store.ts — DB-backed implementation of envelope.NonceStore.
 *
 * Records every outbound nonce in `portal_signed_envelope_nonces` so we can
 * detect accidental reuse before submission. The 48-hour cleanup matches
 * Registry Protocol §4.5.
 */

import type { DatabaseAdapter } from '../../db/database.js';
import type { NonceStore } from '../registry-protocol/envelope.js';

export interface DbNonceStore extends NonceStore {
  /** Delete nonces older than 48 hours. Call from a periodic job. */
  cleanupOldNonces(): Promise<number>;
}

export function createDbNonceStore(db: DatabaseAdapter): DbNonceStore {
  return {
    async recordNonce(actorContactHash, nonce, operationType) {
      try {
        const r = await db.run(
          `INSERT INTO portal_signed_envelope_nonces (actor_contact_hash, nonce, operation_type)
           VALUES (?, ?, ?)
           ON CONFLICT (actor_contact_hash, nonce) DO NOTHING`,
          actorContactHash,
          nonce,
          operationType,
        );
        // PG returns rowCount via `changes`. 0 = duplicate.
        return r.changes > 0;
      } catch {
        return false;
      }
    },

    async cleanupOldNonces() {
      const r = await db.run(
        `DELETE FROM portal_signed_envelope_nonces WHERE seen_at < NOW() - INTERVAL '48 hours'`,
      );
      return r.changes;
    },
  };
}
