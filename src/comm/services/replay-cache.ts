/**
 * replay-cache.ts — bounded LRU + TTL cache of `(fromHash, salt|iv)`
 * fingerprints for inbound envelopes.
 *
 * Why: AES-GCM with per-message HKDF salt + fresh IV gives confidentiality
 * + integrity, but NOT replay protection. A relay (or anyone on the wire
 * before TLS terminates) can re-deliver a previously-captured ciphertext
 * and the recipient will accept it again — re-applying reactions, deletes,
 * edits, location updates, etc. Tracking the (salt, iv) tuple per peer
 * blocks the replay because the same tuple cannot legitimately repeat
 * within the cache window (collision space is 224 bits).
 *
 * Default window: 100k entries × 24h, eviction by LRU on insert.
 * In-memory only. After app restart the cache is empty — acceptable
 * because the relay's own mailbox TTL is 7d, so the worst case is the
 * recipient accepts one stale message after restart, but the message
 * still has to be a valid ciphertext from a legitimate sender.
 */

const MAX_ENTRIES = 100_000;
const TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry { ts: number; }

const cache = new Map<string, CacheEntry>();

export class ReplayError extends Error {
  constructor() { super('replay'); this.name = 'ReplayError'; }
}

function evictExpired(now: number): void {
  // Map iteration order is insertion order; oldest are first.
  for (const [k, v] of cache) {
    if (now - v.ts <= TTL_MS) break;
    cache.delete(k);
  }
}

/**
 * Returns true if the fingerprint is novel and was just inserted.
 * Returns false if it was already in the cache (= replay).
 */
export function recordOrReject(fromHash: string, salt: string, iv: string): boolean {
  const key = `${fromHash}|${salt}|${iv}`;
  const now = Date.now();
  const existing = cache.get(key);
  if (existing && now - existing.ts <= TTL_MS) return false;
  if (cache.size >= MAX_ENTRIES) evictExpired(now);
  if (cache.size >= MAX_ENTRIES) {
    // Still full after eviction — drop the oldest insert.
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, { ts: now });
  return true;
}

/** Reset (for tests / sign-out). */
export function clearReplayCache(): void { cache.clear(); }
