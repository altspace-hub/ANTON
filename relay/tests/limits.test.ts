import { describe, it, expect } from 'vitest';
import { RateLimiter, ipBucket } from '../src/limits.js';

describe('RateLimiter — token bucket basics', () => {
  it('allows up to capacity in one burst', () => {
    let now = 0;
    const r = new RateLimiter({ capacity: 3, refillPerSec: 1 }, () => now);
    expect(r.consume('k')).toBe(true);
    expect(r.consume('k')).toBe(true);
    expect(r.consume('k')).toBe(true);
    expect(r.consume('k')).toBe(false);
  });

  it('refills tokens over time', () => {
    let now = 0;
    const r = new RateLimiter({ capacity: 2, refillPerSec: 1 }, () => now);
    expect(r.consume('k')).toBe(true);
    expect(r.consume('k')).toBe(true);
    expect(r.consume('k')).toBe(false);
    now = 1.0;
    expect(r.consume('k')).toBe(true);   // 1 token refilled
    now = 2.0;
    expect(r.consume('k')).toBe(true);   // 1 more
  });

  it('caps at capacity even after long idle', () => {
    let now = 0;
    const r = new RateLimiter({ capacity: 2, refillPerSec: 1 }, () => now);
    expect(r.consume('k')).toBe(true);
    expect(r.consume('k')).toBe(true);
    now = 1000;
    // Bucket should be back to full (2 tokens), not 1000.
    expect(r.consume('k')).toBe(true);
    expect(r.consume('k')).toBe(true);
    expect(r.consume('k')).toBe(false);
  });

  it('keeps separate state per key', () => {
    let now = 0;
    const r = new RateLimiter({ capacity: 1, refillPerSec: 1 }, () => now);
    expect(r.consume('a')).toBe(true);
    expect(r.consume('b')).toBe(true);
    expect(r.consume('a')).toBe(false);
    expect(r.consume('b')).toBe(false);
  });

  it('rejects malformed config', () => {
    expect(() => new RateLimiter({ capacity: 0, refillPerSec: 1 })).toThrow();
    expect(() => new RateLimiter({ capacity: 1, refillPerSec: -1 })).toThrow();
  });

  it('does not partially consume on rejected request', () => {
    let now = 0;
    const r = new RateLimiter({ capacity: 5, refillPerSec: 0 }, () => now);
    expect(r.consume('k', 3)).toBe(true);    // 5 - 3 = 2 left
    expect(r.consume('k', 5)).toBe(false);   // 2 < 5, rejected
    expect(r.consume('k', 2)).toBe(true);    // 2 still there
    expect(r.consume('k', 1)).toBe(false);
  });
});

describe('RateLimiter — reaping idle buckets', () => {
  it('reaps buckets that have been at full capacity for the idle window', () => {
    let now = 0;
    const r = new RateLimiter({ capacity: 5, refillPerSec: 1 }, () => now);
    r.consume('k');           // creates bucket
    expect(r.size()).toBe(1);
    now = 100;                // long idle, bucket refilled to capacity
    expect(r.reap(60)).toBe(1);
    expect(r.size()).toBe(0);
  });

  it('does not reap buckets still under capacity', () => {
    let now = 0;
    const r = new RateLimiter({ capacity: 5, refillPerSec: 0.01 }, () => now);
    r.consume('k', 5);        // empty the bucket
    now = 50;                 // not enough time to refill (0.01 * 50 = 0.5 tokens)
    expect(r.reap(40)).toBe(0);
    expect(r.size()).toBe(1);
  });
});

// ── ipBucket — per spec §3.10 (Phase 1.8 hardening) ─────────────────

describe('ipBucket — IPv4', () => {
  it('returns the IPv4 address verbatim (full /32 bucket)', () => {
    expect(ipBucket('192.0.2.1')).toBe('192.0.2.1');
    expect(ipBucket('10.5.0.2')).toBe('10.5.0.2');
    expect(ipBucket('192.168.1.134')).toBe('192.168.1.134');
  });
});

describe('ipBucket — IPv6 /64 bucketing', () => {
  it('reduces a typical IPv6 to its /64 prefix', () => {
    // Same /64 — both bucket to the same key.
    const a = ipBucket('2001:db8::1');
    const b = ipBucket('2001:db8::2');
    const c = ipBucket('2001:db8::ffff');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('different /64s bucket separately', () => {
    expect(ipBucket('2001:db8:0:1::1')).not.toBe(ipBucket('2001:db8:0:2::1'));
  });

  it('handles fully-expanded IPv6', () => {
    expect(ipBucket('2001:0db8:0000:0000:0000:0000:0000:0001'))
      .toBe(ipBucket('2001:db8::1'));
  });

  it('IPv6 result looks like a /64 prefix string', () => {
    const k = ipBucket('2001:db8::1');
    expect(k).toMatch(/^[0-9a-f:]+\/64$/);
    expect(k).toBe('2001:db8:0:0::/64');
  });

  it('strips the zone identifier', () => {
    expect(ipBucket('fe80::1%eth0')).toBe(ipBucket('fe80::1'));
  });
});

describe('ipBucket — IPv4-mapped IPv6 collapses to IPv4', () => {
  it('::ffff:a.b.c.d buckets to the IPv4 part', () => {
    expect(ipBucket('::ffff:192.0.2.1')).toBe('192.0.2.1');
    expect(ipBucket('::FFFF:10.5.0.2')).toBe('10.5.0.2');
  });

  it('the same machine reaching us via v4 and v4-mapped-v6 buckets identically', () => {
    expect(ipBucket('192.0.2.1')).toBe(ipBucket('::ffff:192.0.2.1'));
  });
});

describe('ipBucket — invalid input', () => {
  it('throws on a non-IP string', () => {
    expect(() => ipBucket('not-an-ip')).toThrow();
    expect(() => ipBucket('')).toThrow();
    expect(() => ipBucket('999.999.999.999')).toThrow();
  });
});

// ── §3.10 attack surfaces ─────────────────────────────────────────

describe('ipBucket + RateLimiter — adversarial scenarios from §3.10', () => {
  it('an IPv6 attacker rotating low 64 bits CANNOT bypass the /64 limit', () => {
    let now = 0;
    const r = new RateLimiter({ capacity: 5, refillPerSec: 0 }, () => now);
    // 10 distinct addresses on the same /64
    const addrs = [];
    for (let i = 1; i <= 10; i++) addrs.push(`2001:db8::${i.toString(16)}`);
    let allowed = 0;
    for (const addr of addrs) {
      if (r.consume(ipBucket(addr))) allowed++;
    }
    expect(allowed).toBe(5);   // exactly the /64 capacity
  });

  it('two distinct /64s have independent capacity (no false-positive)', () => {
    let now = 0;
    const r = new RateLimiter({ capacity: 5, refillPerSec: 0 }, () => now);
    for (let i = 0; i < 5; i++) expect(r.consume(ipBucket('2001:db8:0:1::1'))).toBe(true);
    expect(r.consume(ipBucket('2001:db8:0:1::1'))).toBe(false);
    for (let i = 0; i < 5; i++) expect(r.consume(ipBucket('2001:db8:0:2::1'))).toBe(true);
    expect(r.consume(ipBucket('2001:db8:0:2::1'))).toBe(false);
  });

  it('shared-NAT IPv4 false-positive: many users behind one /32 share the bucket', () => {
    // This is the documented tradeoff — NOT a test that we PREVENT it,
    // but a test that confirms the design behaves as specified. A NAT
    // gateway with thousands of users behind it gets one /32 bucket.
    let now = 0;
    const r = new RateLimiter({ capacity: 5, refillPerSec: 0 }, () => now);
    let allowed = 0;
    for (let i = 0; i < 10; i++) {
      if (r.consume(ipBucket('203.0.113.42'))) allowed++;
    }
    expect(allowed).toBe(5);
  });
});
