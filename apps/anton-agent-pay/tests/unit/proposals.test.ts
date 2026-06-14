/**
 * proposals.test.ts — TTLs, state transitions, reaper.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ProposalStore, ProposalValidationError,
  MIN_PROPOSAL_TTL_MS, MAX_PROPOSAL_TTL_MS, DEFAULT_PROPOSAL_TTL_MS,
} from '../../src/main/proposals.js';

/** Injectable clock so we can advance virtual time deterministically. */
class FakeClock {
  private t = 0;
  now = (): number => this.t;
  advance(ms: number): void { this.t += ms; }
  set(ms: number): void { this.t = ms; }
}

const TO = 'fc_VEH4mJb5P9hKEaWkiuXRG6e6jooCnQZqKs';

describe('ProposalStore', () => {
  let clock: FakeClock;
  let store: ProposalStore;

  beforeEach(() => {
    clock = new FakeClock();
    clock.set(1_000_000); // arbitrary non-zero start
    store = new ProposalStore(clock.now);
  });

  // ── Validation ────────────────────────────────────────────────

  it('rejects a non-fc address', () => {
    expect(() => store.propose('agent', { to: '0xdeadbeef', amountFtc: 1 }))
      .toThrow(ProposalValidationError);
  });
  it('rejects zero / negative / NaN amount', () => {
    expect(() => store.propose('a', { to: TO, amountFtc: 0 }))
      .toThrow(ProposalValidationError);
    expect(() => store.propose('a', { to: TO, amountFtc: -1 }))
      .toThrow(ProposalValidationError);
    expect(() => store.propose('a', { to: TO, amountFtc: NaN }))
      .toThrow(ProposalValidationError);
  });
  it('rejects agentNote > 280 chars', () => {
    expect(() => store.propose('a', {
      to: TO, amountFtc: 1, agentNote: 'x'.repeat(281),
    })).toThrow(ProposalValidationError);
  });

  // ── ID + structure ────────────────────────────────────────────

  it('issues a unique prefixed id per proposal', () => {
    const p1 = store.propose('a', { to: TO, amountFtc: 1 });
    const p2 = store.propose('a', { to: TO, amountFtc: 2 });
    expect(p1.id).toMatch(/^p_/);
    expect(p2.id).toMatch(/^p_/);
    expect(p1.id).not.toBe(p2.id);
  });

  it('records the agent name + timestamps', () => {
    const p = store.propose('claude-desktop', { to: TO, amountFtc: 5 });
    expect(p.agentName).toBe('claude-desktop');
    expect(p.createdAt).toBe(1_000_000);
    expect(p.expiresAt).toBe(1_000_000 + DEFAULT_PROPOSAL_TTL_MS);
    expect(p.state).toBe('pending');
  });

  it('clamps absurd ttlMs values', () => {
    const tooShort = store.propose('a', { to: TO, amountFtc: 1, ttlMs: 1 });
    expect(tooShort.expiresAt - tooShort.createdAt).toBe(MIN_PROPOSAL_TTL_MS);
    const tooLong = store.propose('a', { to: TO, amountFtc: 1, ttlMs: 9_999_999 });
    expect(tooLong.expiresAt - tooLong.createdAt).toBe(MAX_PROPOSAL_TTL_MS);
  });

  // ── State transitions ────────────────────────────────────────

  it('approve flips pending → approved', () => {
    const p = store.propose('a', { to: TO, amountFtc: 1 });
    const got = store.approve(p.id);
    expect(got?.state).toBe('approved');
  });

  it('reject flips pending → rejected with reason', () => {
    const p = store.propose('a', { to: TO, amountFtc: 1 });
    const got = store.reject(p.id, 'user clicked Reject');
    expect(got?.state).toBe('rejected');
    expect(got?.rejectReason).toBe('user clicked Reject');
  });

  it('markSent flips approved → sent with txId', () => {
    const p = store.propose('a', { to: TO, amountFtc: 1 });
    store.approve(p.id);
    const got = store.markSent(p.id, 'tx-abc');
    expect(got?.state).toBe('sent');
    expect(got?.txId).toBe('tx-abc');
  });

  it('markSent on a non-approved proposal is a no-op', () => {
    const p = store.propose('a', { to: TO, amountFtc: 1 });
    const got = store.markSent(p.id, 'tx-xyz');
    expect(got?.state).toBe('pending'); // unchanged
    expect(got?.txId).toBeUndefined();
  });

  it('cancel only flips pending → cancelled', () => {
    const p = store.propose('a', { to: TO, amountFtc: 1 });
    store.approve(p.id);
    const got = store.cancel(p.id);
    expect(got).toBeUndefined(); // approved is not cancellable
    const stillThere = store.get(p.id);
    expect(stillThere?.state).toBe('approved');
  });

  it('approve on an expired proposal flips to expired, not approved', () => {
    const p = store.propose('a', { to: TO, amountFtc: 1, ttlMs: MIN_PROPOSAL_TTL_MS });
    clock.advance(MIN_PROPOSAL_TTL_MS + 1);
    const got = store.approve(p.id);
    expect(got?.state).toBe('expired');
  });

  // ── Lazy expiry ──────────────────────────────────────────────

  it('get auto-expires a pending proposal past its TTL', () => {
    const p = store.propose('a', { to: TO, amountFtc: 1, ttlMs: MIN_PROPOSAL_TTL_MS });
    clock.advance(MIN_PROPOSAL_TTL_MS + 1);
    const got = store.get(p.id);
    expect(got?.state).toBe('expired');
    expect(got?.rejectReason).toBe('expired');
  });

  it('get does not re-expire a sent / rejected / cancelled proposal', () => {
    const p = store.propose('a', { to: TO, amountFtc: 1, ttlMs: MIN_PROPOSAL_TTL_MS });
    store.approve(p.id);
    store.markSent(p.id, 'tx');
    clock.advance(MIN_PROPOSAL_TTL_MS + 1);
    const got = store.get(p.id);
    expect(got?.state).toBe('sent'); // not flipped to expired
  });

  // ── Reaper ───────────────────────────────────────────────────

  it('reap removes terminal proposals older than the cutoff', () => {
    const p1 = store.propose('a', { to: TO, amountFtc: 1 });
    store.reject(p1.id, 'r');
    clock.advance(60 * 60 * 1000);
    const p2 = store.propose('a', { to: TO, amountFtc: 2 });
    store.reject(p2.id, 'r');
    expect(store.size()).toBe(2);
    const n = store.reap(30 * 60 * 1000);
    expect(n).toBe(1); // only p1 is older than 30min
    expect(store.size()).toBe(1);
    expect(store.get(p1.id)).toBeUndefined();
    expect(store.get(p2.id)).toBeDefined();
  });

  it('reap leaves pending proposals alone even when old enough by createdAt', () => {
    // Advance time enough that the proposal's createdAt is "old" by the
    // reaper's cutoff, but NOT past its own TTL — otherwise get()'s
    // lazy expiry would flip it before reap looks at it.
    const p = store.propose('a', { to: TO, amountFtc: 1, ttlMs: MAX_PROPOSAL_TTL_MS });
    clock.advance(MAX_PROPOSAL_TTL_MS - 1);
    const n = store.reap(60 * 1000); // 1-minute cutoff → ttl-1 is way older
    expect(n).toBe(0); // reap touched nothing
    expect(store.get(p.id)?.state).toBe('pending');
  });
});

// ── Spend caps (standalone gateway safety) ───────────────────────────────────
describe('ProposalStore spend caps', () => {
  let clock: FakeClock;
  beforeEach(() => { clock = new FakeClock(); clock.set(1_000_000); });

  it('no limits → unchanged (a big payment is allowed)', () => {
    const store = new ProposalStore(clock.now);
    expect(() => store.propose('a', { to: TO, amountFtc: 1_000_000 })).not.toThrow();
  });

  it('per-payment cap rejects an over-cap ask BEFORE any modal', () => {
    const store = new ProposalStore(clock.now, { maxPerPaymentFtc: 100 });
    expect(() => store.propose('a', { to: TO, amountFtc: 100 })).not.toThrow(); // at the cap is ok
    expect(() => store.propose('a', { to: TO, amountFtc: 100.01 }))
      .toThrow(/per-payment cap/);
  });

  it('24h cap counts sent AND in-flight value, releasing on terminal-non-sent + window reset', () => {
    const store = new ProposalStore(clock.now, { maxDailyFtc: 50 });
    // Send 30 FTC.
    const p1 = store.propose('a', { to: TO, amountFtc: 30 });
    store.approve(p1.id); store.markSent(p1.id, 'tx1');
    // 25 more would breach 50 (30 already sent) → rejected.
    expect(() => store.propose('a', { to: TO, amountFtc: 25 })).toThrow(/24h cap/);
    // 20 is fine (30 sent + 20 = 50, at the cap) — left PENDING (in-flight).
    const p2 = store.propose('a', { to: TO, amountFtc: 20 });
    // Now even 1 more breaches: the pending 20 counts as in-flight, so a burst of
    // concurrent proposals can't be approved past the ceiling.
    expect(() => store.propose('a', { to: TO, amountFtc: 1 })).toThrow(/24h cap/);
    // Rejecting the pending one RELEASES its 20.
    store.reject(p2.id, 'operator');
    expect(() => store.propose('a', { to: TO, amountFtc: 20 })).not.toThrow();
    // Advance past 24h → both the earlier send and the now-aged in-flight no
    // longer count → a fresh 50 is fine.
    clock.advance(24 * 60 * 60 * 1000 + 1);
    expect(() => store.propose('a', { to: TO, amountFtc: 50 })).not.toThrow();
  });

  it('cancelled / expired proposals release their in-flight cap value', () => {
    const store = new ProposalStore(clock.now, { maxDailyFtc: 10 });
    const p1 = store.propose('a', { to: TO, amountFtc: 8 }); // pending, 8 in-flight
    expect(() => store.propose('a', { to: TO, amountFtc: 5 })).toThrow(/24h cap/); // 8+5>10
    store.cancel(p1.id); // releases the 8
    expect(() => store.propose('a', { to: TO, amountFtc: 5 })).not.toThrow();
  });
});
