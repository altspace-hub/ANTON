/**
 * auth-live-role.test.ts — req.user.role comes from users.role, not from the token.
 *
 * The demotion gap this closes: PATCH /api/admin/users/:id {role:'viewer'} updates the
 * users row but does not touch user_sessions, and the JWT — valid for 7 days — still
 * carried role:'admin'. authMiddleware assigned req.user.role from that payload, so a
 * compromised or departed admin kept admin for up to a week and could simply
 * re-promote themselves. Account DELETION was always immediate (user_sessions cascades
 * on user_id); demotion was the hole.
 *
 * The middleware was already joining users on every request for school_role — whose
 * in-file comment argues at length that a role must not wait for a token to expire —
 * so this reads the security role on that same join. No extra query.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import jwt from 'jsonwebtoken';

const SECRET = 'test-secret-for-auth-live-role';

type AnyFn = (...args: unknown[]) => unknown;

function mockRes() {
  const res: Record<string, unknown> = { statusCode: 0, body: undefined };
  res.status = vi.fn((code: number) => { res.statusCode = code; return res; });
  res.json = vi.fn((body: unknown) => { res.body = body; return res; });
  return res as { statusCode: number; body: unknown; status: AnyFn; json: AnyFn };
}

/** Returns whatever users.role the test wants the database to hold right now. */
function dbWithRole(role: string | null, schoolRole: string | null = null) {
  return {
    get: async () => ({ role, school_role: schoolRole }),
    run: async () => undefined,
  } as never;
}

let createAuthMiddleware: (db: never) => Promise<AnyFn>;

beforeAll(async () => {
  process.env.JWT_SECRET = SECRET;
  delete process.env.DEPLOYMENT_MODE;
  const mod = await import('../../server/middleware/auth.js');
  createAuthMiddleware = mod.createAuthMiddleware as never;
});

/** A request carrying a genuine, unexpired token that claims `role`. */
function reqWithToken(role: string) {
  const token = jwt.sign({ id: 'u-1', username: 'mallory', role }, SECRET, { expiresIn: '7d' });
  return { cookies: { openexpert_session: token }, headers: {} } as {
    cookies: Record<string, string>; headers: Record<string, string>;
    user?: { id: string; role: string };
  };
}

describe('team mode reads the role from the database, not the JWT', () => {
  it('DEMOTION takes effect on the next request, not in seven days', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const middleware = await createAuthMiddleware(dbWithRole('viewer'));
    const req = reqWithToken('admin');           // the token still says admin
    const next = vi.fn();
    await middleware(req, mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.user?.role).toBe('viewer');       // the users row wins
  });

  it('PROMOTION also takes effect immediately — the same property, other direction', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const middleware = await createAuthMiddleware(dbWithRole('admin'));
    const req = reqWithToken('viewer');
    const next = vi.fn();
    await middleware(req, mockRes(), next);
    expect(req.user?.role).toBe('admin');
  });

  it('an unrecognised users.role is floored at viewer, not passed through', async () => {
    // Passing it through would hand it to requireRole, which now fails closed — i.e. a
    // total lockout for what is usually an admin's typo. Flooring keeps the account
    // usable for its own data and gives it no administrative power.
    process.env.DEPLOYMENT_MODE = 'team';
    const middleware = await createAuthMiddleware(dbWithRole('superuser'));
    const req = reqWithToken('admin');
    const next = vi.fn();
    await middleware(req, mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.user?.role).toBe('viewer');
  });

  it('a NULL users.role is floored too', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const middleware = await createAuthMiddleware(dbWithRole(null));
    const req = reqWithToken('admin');
    await middleware(req, mockRes(), vi.fn());
    expect(req.user?.role).toBe('viewer');
  });

  it('still keeps school_role live — the behaviour this join already had', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const middleware = await createAuthMiddleware(dbWithRole('analyst', 'teacher'));
    const req = reqWithToken('analyst');
    await middleware(req, mockRes(), vi.fn());
    expect(req.user?.school_role).toBe('teacher');
  });

  it('a token with no matching session row is still rejected', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const middleware = await createAuthMiddleware({ get: async () => undefined, run: async () => undefined } as never);
    const res = mockRes();
    const next = vi.fn();
    await middleware(reqWithToken('admin'), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});

describe('solo mode is untouched', () => {
  it('stamps the single operator as admin without reading any session', async () => {
    // The solo branch returns before the token path. If a DB role were consulted here,
    // an instance whose users table has no 'solo' row would lock its owner out of their
    // own machine — a worse outcome than the bug being fixed.
    delete process.env.DEPLOYMENT_MODE;
    const middleware = await createAuthMiddleware({
      get: async () => undefined, run: async () => undefined,
    } as never);
    const req = { cookies: {}, headers: {} } as { cookies: object; headers: object; user?: { id: string; role: string } };
    const next = vi.fn();
    await middleware(req, mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toMatchObject({ id: 'solo', role: 'admin' });
  });
});
