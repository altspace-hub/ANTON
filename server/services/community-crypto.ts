/**
 * community-crypto.ts
 * Utility functions for Community tab E2E identity generation.
 * Uses Web Crypto API compatible patterns for the server side.
 * Note: Actual E2E encryption happens client-side; this generates helper data.
 */

import { createHash, randomBytes } from 'crypto';

/** Generate a canonical ANTON contact hash from a random seed */
export function generateContactHash(): string {
  const raw = randomBytes(16).toString('hex').toUpperCase();
  // Format: ANTON-XXXX-XXXX-XXXX-XXXX
  return `ANTON-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

/** Hash a contact hash for storage/lookup without exposing the original */
export function hashContactId(contactHash: string): string {
  return createHash('sha256').update(contactHash).digest('hex').slice(0, 32);
}

/** Validate ANTON contact hash format */
export function isValidContactHash(hash: string): boolean {
  return /^ANTON-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(hash);
}

/** Generate a conversation ID from two contact hashes (deterministic, symmetric) */
export function getConversationId(hashA: string, hashB: string): string {
  const sorted = [hashA, hashB].sort().join(':');
  return createHash('sha256').update(sorted).digest('hex').slice(0, 32);
}
