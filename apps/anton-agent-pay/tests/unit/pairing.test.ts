/**
 * pairing.test.ts — code → session token flow, TTLs, revocation.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  PairingStore, PairingError, PAIRING_CODE_LENGTH, PAIRING_CODE_TTL_MS,
  PAIRING_DEFAULT_TTL_MS, PAIRING_MAX_TTL_MS,
} from '../../src/main/pairing.js';

class FakeClock {
  private t = 0;
  now = (): number => this.t;
  advance(ms: number): void { this.t += ms; }
  set(ms: number): void { this.t = ms; }
}

describe('PairingStore', () => {
  let clock: FakeClock;
  let store: PairingStore;

  beforeEach(() => {
    clock = new FakeClock();
    clock.set(1_000_000);
    store = new PairingStore(clock.now);
  });

  // ── Code generation ──────────────────────────────────────────

  it('newCode returns a 6-digit string', () => {
    const code = store.newCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(code.length).toBe(PAIRING_CODE_LENGTH);
  });

  it('newCode replaces any prior pending code', () => {
    const a = store.newCode();
    const b = store.newCode();
    // Old code is no longer the pending one — exercising it via
    // redeemCode below would fail.
    expect(store.peekPendingCode()).toBe(b);
    expect(a).not.toBe(b); // overwhelmingly likely; deterministic enough
  });

  // ── Happy path ───────────────────────────────────────────────

  it('redeemCode issues a bearer that resolves back to the agent', () => {
    const code = store.newCode();
    const { agent, sessionToken } = store.redeemCode({
      name: 'claude-desktop', code,
    });
    expect(agent.name).toBe('claude-desktop');
    expect(agent.id).toMatch(/^a_/);
    expect(sessionToken).toMatch(/^sk_/);
    expect(agent.expiresAt - agent.pairedAt).toBe(PAIRING_DEFAULT_TTL_MS);
    const resolved = store.resolveBearer(sessionToken);
    expect(resolved?.id).toBe(agent.id);
    expect(resolved?.lastUsedAt).toBe(clock.now());
  });

  // ── Failure modes ────────────────────────────────────────────

  it('redeemCode with no pending code throws', () => {
    expect(() => store.redeemCode({ name: 'x', code: '000000' }))
      .toThrow(PairingError);
  });

  it('redeemCode with the wrong code throws and keeps the pending code', () => {
    const right = store.newCode();
    const wrong = String((parseInt(right, 10) + 1) % 1_000_000).padStart(6, '0');
    expect(() => store.redeemCode({ name: 'x', code: wrong }))
      .toThrow(PairingError);
    // Pending code unchanged — the legitimate agent can still pair.
    expect(store.peekPendingCode()).toBe(right);
  });

  it('redeemCode after the code TTL throws and clears the pending code', () => {
    const code = store.newCode();
    clock.advance(PAIRING_CODE_TTL_MS + 1);
    expect(() => store.redeemCode({ name: 'x', code }))
      .toThrow(/expired/);
    expect(store.peekPendingCode()).toBeNull();
  });

  it('redeemCode rejects bad names', () => {
    store.newCode();
    expect(() => store.redeemCode({ name: '', code: store.peekPendingCode()! }))
      .toThrow(PairingError);
    store.newCode();
    expect(() => store.redeemCode({
      name: 'x'.repeat(65), code: store.peekPendingCode()!,
    })).toThrow(PairingError);
  });

  it('a pending code is single-use — subsequent redeem attempts throw', () => {
    const code = store.newCode();
    store.redeemCode({ name: 'first', code });
    expect(() => store.redeemCode({ name: 'second', code }))
      .toThrow(/no pending pairing code/);
  });

  // ── Bearer resolution ────────────────────────────────────────

  it('resolveBearer returns undefined for an unknown bearer', () => {
    expect(store.resolveBearer('sk_unknown')).toBeUndefined();
    expect(store.resolveBearer('')).toBeUndefined();
  });

  it('resolveBearer lazily revokes an expired pairing', () => {
    const code = store.newCode();
    const { sessionToken } = store.redeemCode({
      name: 'x', code, ttlMs: 60 * 1000,
    });
    clock.advance(60 * 1000 + 1);
    expect(store.resolveBearer(sessionToken)).toBeUndefined();
    // List confirms the lazy-revoke also dropped it.
    expect(store.list()).toHaveLength(0);
  });

  it('redeemCode clamps the TTL to [60s, 30d]', () => {
    const c1 = store.newCode();
    const { agent: a1 } = store.redeemCode({ name: 'a', code: c1, ttlMs: 1 });
    expect(a1.expiresAt - a1.pairedAt).toBe(60 * 1000);
    const c2 = store.newCode();
    const { agent: a2 } = store.redeemCode({
      name: 'b', code: c2, ttlMs: 999 * 24 * 3600 * 1000,
    });
    expect(a2.expiresAt - a2.pairedAt).toBe(PAIRING_MAX_TTL_MS);
  });

  // ── Revocation + listing ─────────────────────────────────────

  it('revoke removes the agent + the bearer index', () => {
    const code = store.newCode();
    const { agent, sessionToken } = store.redeemCode({ name: 'x', code });
    expect(store.revoke(agent.id)).toBe(true);
    expect(store.resolveBearer(sessionToken)).toBeUndefined();
    expect(store.list()).toHaveLength(0);
  });

  it('revoke on an unknown agent returns false', () => {
    expect(store.revoke('a_nonexistent')).toBe(false);
  });

  it('list returns all currently-paired agents', () => {
    for (const name of ['a', 'b', 'c']) {
      const code = store.newCode();
      store.redeemCode({ name, code });
    }
    expect(store.list()).toHaveLength(3);
    expect(store.list().map(a => a.name).sort()).toEqual(['a', 'b', 'c']);
  });

  // ── Storage: bearer is not directly retained ─────────────────

  it('the raw session token is NOT stored in the agent record', () => {
    const code = store.newCode();
    const { agent, sessionToken } = store.redeemCode({ name: 'x', code });
    // tokenSha256 is the sha-256 hash, not the bearer itself.
    expect(agent.tokenSha256).not.toBe(sessionToken);
    expect(agent.tokenSha256.length).toBe(64); // sha256-hex
    expect(/^[0-9a-f]+$/.test(agent.tokenSha256)).toBe(true);
  });
});
