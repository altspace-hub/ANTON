/**
 * demo-session-ttl.test.ts — on a public demo (DEMO_MODE=true) a sign-in
 * lasts at most 8 hours, whatever JWT_EXPIRY says (privacy verification
 * 2026-09-26, problem 8). The privacy notice says "8 hours at the latest";
 * before this it held only while the .env set JWT_EXPIRY=8h, and the default
 * is 7 days.
 *
 * sessionTtlMs() is the one lifetime of a sign-in: the JWT's exp
 * (generateToken) and the user_sessions row (routes/auth.ts issueSession) both
 * take it; demo-session-ttl.db.test.ts checks the row through the sign-in
 * route. Negative controls: outside demo mode JWT_EXPIRY and the 7-day default
 * are unchanged, and on a demo a shorter JWT_EXPIRY still applies.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';

vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-demo-session-ttl-0123456789abcdef';
});

import { sessionTtlMs, generateToken, DEMO_MAX_SESSION_TTL_MS } from '../../server/middleware/auth.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const DEMO = { DEMO_MODE: 'true', DEPLOYMENT_MODE: 'team' };

const saved = { demo: process.env.DEMO_MODE, expiry: process.env.JWT_EXPIRY };
afterEach(() => {
  if (saved.demo === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = saved.demo;
  if (saved.expiry === undefined) delete process.env.JWT_EXPIRY; else process.env.JWT_EXPIRY = saved.expiry;
});

describe('sessionTtlMs on a demo', () => {
  it('is 8 hours', () => {
    expect(DEMO_MAX_SESSION_TTL_MS).toBe(8 * HOUR);
  });

  it('caps a longer JWT_EXPIRY, an unset one and an unreadable one at 8 hours', () => {
    expect(sessionTtlMs('7d', DEMO)).toBe(8 * HOUR);
    expect(sessionTtlMs('9h', DEMO)).toBe(8 * HOUR);
    expect(sessionTtlMs(undefined, DEMO)).toBe(8 * HOUR);
    expect(sessionTtlMs('forever', DEMO)).toBe(8 * HOUR);
  });

  it('keeps a JWT_EXPIRY of 8 hours or less', () => {
    expect(sessionTtlMs('8h', DEMO)).toBe(8 * HOUR);
    expect(sessionTtlMs('30m', DEMO)).toBe(30 * 60 * 1000);
    expect(sessionTtlMs('3600', DEMO)).toBe(HOUR);
  });

  it('outside demo mode JWT_EXPIRY and the 7-day default are unchanged (negative control)', () => {
    expect(sessionTtlMs('7d', { DEPLOYMENT_MODE: 'team' })).toBe(7 * DAY);
    expect(sessionTtlMs(undefined, {})).toBe(7 * DAY);
    expect(sessionTtlMs('30d', { DEMO_MODE: 'false' })).toBe(30 * DAY);
  });
});

describe('the JWT a demo issues', () => {
  const user = { id: 'u-ttl', username: 'ttl', role: 'analyst' as const };
  const lifetimeSeconds = (token: string): number => {
    const claims = jwt.decode(token) as { iat: number; exp: number };
    return claims.exp - claims.iat;
  };

  it('expires within 8 hours on a demo, with JWT_EXPIRY=7d', () => {
    process.env.DEMO_MODE = 'true';
    process.env.JWT_EXPIRY = '7d';
    expect(lifetimeSeconds(generateToken(user))).toBe(8 * 60 * 60);
  });

  it('lives JWT_EXPIRY outside demo mode (negative control)', () => {
    delete process.env.DEMO_MODE;
    process.env.JWT_EXPIRY = '7d';
    expect(lifetimeSeconds(generateToken(user))).toBe(7 * 24 * 60 * 60);
  });
});
