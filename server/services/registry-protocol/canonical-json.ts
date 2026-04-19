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
  return canonify(value);
}

/**
 * Canonicalise + UTF-8 encode in one step. Convenience for signing/verifying.
 */
export function canonicalizeBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}
