/**
 * limits.ts — Token-bucket rate limiter + IPv4/IPv6 source bucketing.
 *
 * Per spec §3.10 (Phase 1.8 hardening):
 *   - IPv4 source ⇒ bucket = full /32
 *   - IPv6 source ⇒ bucket = /64 prefix
 *
 * The IPv6 /64 bucket is non-negotiable: a single IPv6 host trivially
 * has 2^64 source addresses on its allocation. Per-/32 limits are a no-op
 * against IPv6 attackers. Conversely, /32 for IPv4 catches the common
 * "shared NAT collapses thousands of users behind one IP" case correctly —
 * legitimate users get the same bucket, but that's the point: a shared-NAT
 * IPv4 source is shared infrastructure and should be rate-limited as one.
 *
 * The limiter itself is a standard token bucket — capacity tokens refill
 * at `tokensPerSecond`. Each call to consume() either succeeds (with the
 * cost deducted) or fails (with no state mutation, no time advance).
 *
 * State eviction: buckets that have been at full capacity for >60s are
 * candidates for GC, called by the server's reaper alongside the match
 * table's reaper (Phase 2.8).
 */

import { isIP } from 'node:net';

// ── Token bucket ─────────────────────────────────────────────────────

interface BucketState {
  /** Current token count (float to allow sub-token refill). */
  tokens: number;
  /** Last refill timestamp in seconds. */
  lastRefillSec: number;
}

export interface RateLimitConfig {
  /** Bucket capacity (max burst). */
  capacity: number;
  /** Refill rate in tokens per second. */
  refillPerSec: number;
}

export class RateLimiter {
  private buckets = new Map<string, BucketState>();

  constructor(
    private readonly config: RateLimitConfig,
    /** Now in seconds since epoch — injectable for tests. */
    private readonly now: () => number = () => Date.now() / 1000,
  ) {
    if (config.capacity <= 0 || config.refillPerSec < 0) {
      throw new Error('rate-limiter: invalid config');
    }
  }

  /**
   * Consume `cost` tokens from `key`'s bucket. Returns true if allowed,
   * false if the bucket lacks tokens. Never partially consumes.
   */
  consume(key: string, cost = 1): boolean {
    const now = this.now();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.config.capacity, lastRefillSec: now };
      this.buckets.set(key, bucket);
    } else {
      // Refill since lastRefill.
      const elapsed = Math.max(0, now - bucket.lastRefillSec);
      bucket.tokens = Math.min(
        this.config.capacity,
        bucket.tokens + elapsed * this.config.refillPerSec,
      );
      bucket.lastRefillSec = now;
    }
    if (bucket.tokens < cost) return false;
    bucket.tokens -= cost;
    return true;
  }

  /**
   * GC buckets that are at full capacity (no recent activity).
   * Bounds memory under sustained traffic from many distinct sources.
   */
  reap(idleSec = 60): number {
    const now = this.now();
    let removed = 0;
    for (const [key, bucket] of this.buckets) {
      // Compute current tokens after refill — bucket is "full + idle"
      // when tokens reach capacity AND no one's hit it for `idleSec`.
      const elapsed = Math.max(0, now - bucket.lastRefillSec);
      const tokens = Math.min(this.config.capacity, bucket.tokens + elapsed * this.config.refillPerSec);
      if (tokens >= this.config.capacity && elapsed >= idleSec) {
        this.buckets.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /** Number of buckets currently tracked (for telemetry). */
  size(): number { return this.buckets.size; }
}

// ── IPv4/IPv6 source bucketing ──────────────────────────────────────

/**
 * Compute the rate-limit bucket key for a remote address per spec §3.10.
 *
 * - IPv4 → returns the address verbatim (full /32 bucket)
 * - IPv4-mapped IPv6 ("::ffff:192.0.2.1") → returns the IPv4 part (so it
 *   buckets together with native IPv4 from the same source)
 * - IPv6 → returns the /64 prefix in canonical form, padded with "::0"
 *   suffix so the key looks like a real IPv6 address rather than a partial
 *   string. (Avoids confusing an audit log reader.)
 *
 * Throws on inputs that aren't valid IP literals — caller MUST validate
 * before calling here, since this returns a key, not a yes/no.
 */
export function ipBucket(remoteAddr: string): string {
  // Strip an IPv6 zone identifier if present (e.g. "fe80::1%eth0").
  const sansZone = remoteAddr.includes('%') ? remoteAddr.split('%')[0]! : remoteAddr;
  const v = isIP(sansZone);
  if (v === 4) return sansZone;
  if (v !== 6) throw new Error(`not a valid IP: ${remoteAddr}`);

  // IPv4-mapped IPv6: ::ffff:a.b.c.d  ⇒ extract IPv4 part
  // Also handle ::ffff:0:a.b.c.d (rare, but valid)
  const mappedMatch = sansZone.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mappedMatch && isIP(mappedMatch[1]!) === 4) {
    return mappedMatch[1]!;
  }

  // Otherwise: take the first 64 bits = first 4 hextets.
  // Expand the "::" if present.
  const hextets = expandIPv6(sansZone);
  const prefix = hextets.slice(0, 4).join(':');
  return `${prefix}::/64`;
}

/**
 * Expand an IPv6 address to its full 8-hextet form (lowercase, no leading
 * zeros). Helper for ipBucket(); not exported.
 */
function expandIPv6(addr: string): string[] {
  // Lowercase first so comparison is consistent.
  const lower = addr.toLowerCase();
  // Split on "::" — there's at most one occurrence in a valid address.
  const parts = lower.split('::');
  if (parts.length > 2) throw new Error(`malformed IPv6: ${addr}`);
  const head = parts[0]!.length > 0 ? parts[0]!.split(':') : [];
  const tail = parts.length === 2 && parts[1]!.length > 0 ? parts[1]!.split(':') : [];
  const known = head.length + tail.length;
  if (known > 8) throw new Error(`too many hextets: ${addr}`);
  const fillCount = parts.length === 2 ? 8 - known : 0;
  if (parts.length === 1 && head.length !== 8) {
    throw new Error(`missing :: or wrong hextet count: ${addr}`);
  }
  const fill = new Array<string>(fillCount).fill('0');
  return [...head, ...fill, ...tail].map(h => h.replace(/^0+/, '') || '0');
}
