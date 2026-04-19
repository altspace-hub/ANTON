/**
 * hash.ts — SHA-256 over canonical JSON of a capability descriptor.
 *
 * Per Cap Schema §13.4: this hash is the integrity binding between the
 * registry's `descriptorHash` field (set via `update_capability_summary` per
 * Registry Protocol §5.3) and the descriptor served at the portal's
 * Gateway `/capabilities` endpoint.
 *
 * The hash is over the descriptor body (not the signed envelope).
 */

import { createHash } from 'crypto';

import { canonicalize } from '../registry-protocol/canonical-json.js';

/**
 * Compute the SHA-256 hash (lowercase hex) of the canonical JSON form of the
 * descriptor. Deterministic across implementations that share an RFC 8785
 * canonicaliser.
 */
export function descriptorHash(descriptor: unknown): string {
  return createHash('sha256').update(canonicalize(descriptor)).digest('hex');
}
