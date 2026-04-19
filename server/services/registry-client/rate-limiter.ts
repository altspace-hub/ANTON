/**
 * rate-limiter.ts — Client-side rate-limit tracking.
 *
 * Per Registry Protocol §10. The registry enforces these on its side and
 * returns HTTP 429 with Retry-After. The client's job is:
 *   1. Track our own request rate to fail fast before submitting (saves a
 *      pointless HTTP round-trip).
 *   2. Respect Retry-After when the registry pushes back.
 *
 * In-memory token-bucket per (operation, key). State does NOT survive
 * process restart in v0.7.x — that's acceptable because the registry is
 * authoritative; restarted clients will hit a 429 once and back off.
 */

export interface RateLimitConfig {
  /** Max requests in the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

/** Per-actor limits per Protocol §10.1. */
export const ACTOR_LIMITS: Record<string, { burst?: RateLimitConfig; sustained?: RateLimitConfig }> = {
  register: {
    burst: { limit: 5, windowSeconds: 24 * 3600 },
    sustained: { limit: 20, windowSeconds: 30 * 24 * 3600 },
  },
  update_metadata: {
    burst: { limit: 20, windowSeconds: 24 * 3600 },
  },
  update_capability_summary: {
    burst: { limit: 20, windowSeconds: 24 * 3600 },
  },
  rotate_key: {
    burst: { limit: 3, windowSeconds: 30 * 24 * 3600 },
  },
  transfer: {
    burst: { limit: 3, windowSeconds: 30 * 24 * 3600 },
  },
  heartbeat: {
    burst: { limit: 24, windowSeconds: 24 * 3600 },
  },
};

/** Per-IP limits per Protocol §10.1 (read endpoints). */
export const IP_LIMITS: Record<string, RateLimitConfig> = {
  resolve: { limit: 10000, windowSeconds: 3600 },
  search: { limit: 1000, windowSeconds: 3600 },
  sth: { limit: 1000, windowSeconds: 3600 },
  log: { limit: 500, windowSeconds: 3600 },
  portal: { limit: 5000, windowSeconds: 3600 },
};

interface BucketState {
  /** Window-start timestamps of recent requests, oldest first. */
  events: number[];
}

export interface RateLimiter {
  /**
   * Try to consume one request for (operation, key). Returns:
   *   { allowed: true } if under limit (records the consumption).
   *   { allowed: false, retryAfterMs } if at limit.
   * Pass `key = actor.contactHash` for per-actor or `key = ipAddress` for per-IP.
   * Pass `key = "actor:operation:scopeId"` for per-portal limits.
   */
  checkAndRecord(operation: string, key: string): { allowed: true } | { allowed: false; retryAfterMs: number };
  /** Apply a Retry-After value from a 429 response. Future calls within the cooldown will be denied. */
  applyRetryAfter(operation: string, key: string, retryAfterMs: number): void;
  /** For tests: clear all state. */
  reset(): void;
}

export function createRateLimiter(): RateLimiter {
  const buckets = new Map<string, BucketState>();
  const cooldowns = new Map<string, number>(); // key → epoch ms when allowed again

  function bucketKey(operation: string, key: string, windowSecs: number): string {
    return `${operation}|${key}|${windowSecs}`;
  }

  function cooldownKey(operation: string, key: string): string {
    return `${operation}|${key}`;
  }

  function consume(operation: string, key: string, cfg: RateLimitConfig): { ok: true } | { ok: false; retryAfterMs: number } {
    const bk = bucketKey(operation, key, cfg.windowSeconds);
    const now = Date.now();
    const windowMs = cfg.windowSeconds * 1000;
    const state = buckets.get(bk) ?? { events: [] };
    // Drop events outside the window.
    while (state.events.length > 0 && state.events[0] <= now - windowMs) {
      state.events.shift();
    }
    if (state.events.length >= cfg.limit) {
      const oldestInWindow = state.events[0];
      const retryAfterMs = oldestInWindow + windowMs - now;
      return { ok: false, retryAfterMs: Math.max(0, retryAfterMs) };
    }
    state.events.push(now);
    buckets.set(bk, state);
    return { ok: true };
  }

  return {
    checkAndRecord(operation, key) {
      const ck = cooldownKey(operation, key);
      const cooldownUntil = cooldowns.get(ck);
      if (cooldownUntil && cooldownUntil > Date.now()) {
        return { allowed: false, retryAfterMs: cooldownUntil - Date.now() };
      }
      // Check actor limits if applicable.
      const actorLimits = ACTOR_LIMITS[operation];
      if (actorLimits) {
        for (const cfg of [actorLimits.burst, actorLimits.sustained]) {
          if (!cfg) continue;
          const r = consume(operation, key, cfg);
          if (!r.ok) return { allowed: false, retryAfterMs: r.retryAfterMs };
        }
        return { allowed: true };
      }
      const ipLimit = IP_LIMITS[operation];
      if (ipLimit) {
        const r = consume(operation, key, ipLimit);
        return r.ok ? { allowed: true } : { allowed: false, retryAfterMs: r.retryAfterMs };
      }
      // No declared limit for this operation — allow.
      return { allowed: true };
    },

    applyRetryAfter(operation, key, retryAfterMs) {
      const ck = cooldownKey(operation, key);
      cooldowns.set(ck, Date.now() + retryAfterMs);
    },

    reset() {
      buckets.clear();
      cooldowns.clear();
    },
  };
}
