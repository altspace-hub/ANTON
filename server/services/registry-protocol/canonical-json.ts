/**
 * canonical-json.ts — RFC 8785 (JCS) wrapper.
 *
 * Every signed object that crosses the registry wire is canonicalised here
 * before signing or verification. We MUST use the same canonicalisation on
 * both ends for signatures to round-trip.
 *
 * Spec refs:
 *   - ANTON_Portals_Registry_Protocol_Reference.md §6
 *   - ANTON_Portals_Capability_Descriptor_Schema_Reference.md §13.1
 *
 * Library: @truestamp/canonify (vetted RFC 8785 implementation).
 * Do NOT hand-roll canonicalisation — it is a long-standing source of subtle
 * cross-implementation bugs.
 */

import { canonify } from '@truestamp/canonify';

/**
 * Produce the canonical JSON form of a value per RFC 8785.
 * Output is a UTF-8 string with sorted keys, no insignificant whitespace,
 * deterministic number serialisation, and RFC 8259 string escaping.
 */
export function canonicalize(value: unknown): string {
  // canonify returns undefined for values it can't canonicalise (e.g. a bare
  // function or symbol). For our call sites that would be a programmer error
  // — surface it loudly rather than letting an `undefined` leak into
  // signatures / hashes / audit logs.
  const canonical = canonify(value);
  if (canonical === undefined) {
    throw new Error('canonicalize: value is not JSON-canonicalisable (functions, symbols, or cyclic refs?)');
  }
  return canonical;
}

/**
 * Canonicalise + UTF-8 encode in one step. Convenience for signing/verifying.
 */
export function canonicalizeBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}
