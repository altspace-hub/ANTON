import { describe, it, expect, beforeAll, vi } from 'vitest';

/**
 * Regression tests for the 2026-07-17 DEPLOYMENT_MODE split-brain fix.
 *
 * The bug: middleware/auth.ts captured `process.env.DEPLOYMENT_MODE === 'team'` in a
 * module-scope const, which evaluates when the module is imported — BEFORE
 * server/index.ts's module body resolves the deployment mode. Result: an install
 * whose mode was resolved late REPORTED team mode everywhere while the auth
 * middleware silently ran its solo branch (auto-admin, no credential check).
 *
 * The fix: the middleware reads the env lazily on every request. These tests import
 * the module FIRST and flip DEPLOYMENT_MODE AFTERWARD — with the old snapshot
 * behavior they fail; with the lazy read they pass.
 */

type AnyFn = (...args: unknown[]) => unknown;

function mockRes() {
  const res: Record<string, unknown> = {};
  res.statusCode = 0;
  res.body = undefined;
  res.status = vi.fn((code: number) => { res.statusCode = code; return res; });
  res.json = vi.fn((body: unknown) => { res.body = body; return res; });
  return res as { statusCode: number; body: unknown; status: AnyFn; json: AnyFn };
}

const dbStub = {
  get: async () => null,
  run: async () => undefined,
} as never;

let createAuthMiddleware: (db: never) => Promise<AnyFn>;
let requireAdminOrSolo: AnyFn;

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-auth-mode-tests';
  // Simulate the real import order: module loads while the mode is still unset.
  delete process.env.DEPLOYMENT_MODE;
  const mod = await import('../../server/middleware/auth.js');
  createAuthMiddleware = mod.createAuthMiddleware as never;
  requireAdminOrSolo = mod.requireAdminOrSolo as never;
});

describe('auth middleware reads DEPLOYMENT_MODE lazily (split-brain regression)', () => {
  it('enforces team auth even when the mode was set AFTER the module was imported', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const middleware = await createAuthMiddleware(dbStub);
    const req = { cookies: {}, headers: {} };
    const res = mockRes();
    const next = vi.fn();
    await middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('stamps the solo admin user when the mode is solo at request time', async () => {
    process.env.DEPLOYMENT_MODE = 'solo';
    const middleware = await createAuthMiddleware(dbStub);
    const req: { cookies: object; headers: object; user?: { id: string; role: string } } = { cookies: {}, headers: {} };
    const res = mockRes();
    const next = vi.fn();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toMatchObject({ id: 'solo', role: 'admin' });
  });

  it('a mode flip between requests is honored by the SAME middleware instance', async () => {
    const middleware = await createAuthMiddleware(dbStub);

    process.env.DEPLOYMENT_MODE = 'solo';
    const soloReq: { cookies: object; headers: object; user?: unknown } = { cookies: {}, headers: {} };
    const soloRes = mockRes();
    const soloNext = vi.fn();
    await middleware(soloReq, soloRes, soloNext);
    expect(soloNext).toHaveBeenCalledOnce();

    process.env.DEPLOYMENT_MODE = 'team';
    const teamReq = { cookies: {}, headers: {} };
    const teamRes = mockRes();
    const teamNext = vi.fn();
    await middleware(teamReq, teamRes, teamNext);
    expect(teamNext).not.toHaveBeenCalled();
    expect(teamRes.statusCode).toBe(401);
  });
});

describe('requireAdminOrSolo reads DEPLOYMENT_MODE lazily', () => {
  it('blocks non-admins when team mode is set after import', () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const req = { user: { id: 'u1', username: 'viewer', role: 'viewer' } };
    const res = mockRes();
    const next = vi.fn();
    requireAdminOrSolo(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('allows non-admins in solo mode', () => {
    process.env.DEPLOYMENT_MODE = 'solo';
    const req = { user: { id: 'u1', username: 'viewer', role: 'viewer' } };
    const res = mockRes();
    const next = vi.fn();
    requireAdminOrSolo(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
