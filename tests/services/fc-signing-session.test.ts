/**
 * fc-signing-session.test.ts — the signing-session keystone for ANTON Local
 * desktop payments (Phase 0). Pure in-memory + time-boxed; `now` is injected.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSigningSession,
  getSigningSession,
  assertSigningSession,
  revokeSigningSession,
  activeSigningSessionCount,
  __resetSigningSessions,
  SigningSessionError,
  DEFAULT_SIGNING_TTL_MS,
} from '../../server/services/fc-signing-session';

describe('fc signing session', () => {
  beforeEach(() => __resetSigningSessions());

  it('mints a unique token bound to a wallet + a derived audit actor', () => {
    const a = createSigningSession('w1', { now: 1000 });
    const b = createSigningSession('w1', { now: 1000 });
    expect(a.token).not.toBe(b.token);
    expect(a.token).toMatch(/^[0-9a-f]{64}$/);
    expect(a.walletId).toBe('w1');
    expect(a.actor).toBe(`local-unlock:${a.token.slice(0, 8)}`);
    expect(a.expiresAt).toBe(1000 + DEFAULT_SIGNING_TTL_MS);
  });

  it('resolves a live token and rejects an unknown one', () => {
    const s = createSigningSession('w1', { now: 1000 });
    expect(getSigningSession(s.token, 1000)?.walletId).toBe('w1');
    expect(getSigningSession('nope', 1000)).toBeNull();
    expect(getSigningSession('', 1000)).toBeNull();
  });

  it('expires a token at its TTL and purges it', () => {
    const s = createSigningSession('w1', { ttlMs: 5000, now: 1000 });
    expect(getSigningSession(s.token, 5999)).not.toBeNull();   // still live
    expect(getSigningSession(s.token, 6000)).toBeNull();        // exactly at TTL → gone
    expect(activeSigningSessionCount(6000)).toBe(0);
  });

  it('assertSigningSession enforces token validity AND wallet binding', () => {
    const s = createSigningSession('w1', { now: 1000 });
    expect(assertSigningSession(s.token, 'w1', 1000).actor).toBe(s.actor);
    expect(() => assertSigningSession(s.token, 'w2', 1000)).toThrow(SigningSessionError); // wrong wallet
    expect(() => assertSigningSession('bad', 'w1', 1000)).toThrow(/invalid or expired/);
    expect(() => assertSigningSession(s.token, 'w1', 9_999_999)).toThrow(/invalid or expired/); // expired
  });

  it('revoke ends a session immediately (a "lock" action)', () => {
    const s = createSigningSession('w1', { now: 1000 });
    revokeSigningSession(s.token);
    expect(getSigningSession(s.token, 1000)).toBeNull();
  });

  it('minting purges other expired sessions (no unbounded growth)', () => {
    createSigningSession('w1', { ttlMs: 1000, now: 1000 });   // expires at 2000
    createSigningSession('w2', { ttlMs: 1000, now: 1000 });
    expect(activeSigningSessionCount(1500)).toBe(2);
    createSigningSession('w3', { now: 3000 });                // mint after the first two expired
    expect(activeSigningSessionCount(3000)).toBe(1);          // only w3 remains
  });
});
