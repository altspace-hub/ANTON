/**
 * canonical.ts — RFC 8785 (JCS) canonicalisation wrapper.
 *
 * Mirrors server/services/registry-protocol/canonical-json.ts in ANTON
 * Local. Same library (@truestamp/canonify) so signatures round-trip
 * between the publisher (ANTON Local) and the verifier (this relay).
 */
import { canonify } from '@truestamp/canonify';

/**
 * Produce the canonical JSON form of a value per RFC 8785. Throws if
 * the value can't be canonicalised (e.g. contains a function, BigInt,
 * symbol, or circular reference — none of which appear in legitimate
 * descriptor payloads).
 */
export function canonicalize(value: unknown): string {
  const out = canonify(value);
  if (out === undefined) {
    throw new Error('value is not canonicalisable JSON');
  }
  return out;
}
