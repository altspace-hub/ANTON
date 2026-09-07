/**
 * auth-mfa.test.ts — MFA can be turned on, and once on it is actually required.
 *
 * Two halves of one dead feature:
 *
 *   1. /auth/mfa/enable|confirm|disable read req.user, but the auth router is mounted
 *      ~90 lines ABOVE authMiddleware in index.ts (login and the OAuth callbacks must
 *      be reachable without a session). So req.user was never set on them and all
 *      three answered 401 to a fully authenticated admin: nobody on any instance could
 *      enrol. They now live in their own router mounted below the middleware.
 *   2. Login never read users.mfa_enabled. Making enrolment reachable without that
 *      would have been the worse outcome of the two — a security control that a user
 *      turns on, sees confirmed, and which does nothing.
 *
 * The mount-order half is asserted against index.ts's source, because that ordering IS
 * the bug: a behavioural test of the router alone passes either way.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { DatabaseAdapter } from '../../server/db/database.js';

const MFA_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';   // base32, test-only
const PASSWORD = 'correct horse';

let createAuthRoutes: typeof import('../../server/routes/auth.js')['createAuthRoutes'];
let createAuthMfaRoutes: typeof import('../../server/routes/auth.js')['createAuthMfaRoutes'];

/** Rows the fake database hands back; mutated per case. */
let user: Record<string, unknown>;
let runs: Array<{ sql: string; params: unknown[] }> = [];

const db = {
  get: async (sql: string) => {
    if (sql.includes('FROM login_attempts')) return { count: 0 };
    if (sql.includes('FROM users WHERE username')) return user;
    if (sql.includes('project_invitations')) return [];
    if (sql.includes('FROM mfa_pending')) return { secret: MFA_SECRET };
    if (sql.includes('FROM users WHERE id')) return user;
    return undefined;
  },
  all: async () => [],
  run: async (sql: string, ...params: unknown[]) => {
    runs.push({ sql, params });
    return { changes: 1, lastInsertRowid: 0 };
  },
  exec: async () => {},
} as unknown as DatabaseAdapter;

let server: import('http').Server;
let base = '';
let originalMode: string | undefined;
/** Whoever authMiddleware would have stamped — undefined means "mounted too early". */
let current: { id: string; username: string; role: string } | undefined;

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-auth-mfa';
  originalMode = process.env.DEPLOYMENT_MODE;
  process.env.DEPLOYMENT_MODE = 'team';
  ({ createAuthRoutes, createAuthMfaRoutes } = await import('../../server/routes/auth.js'));

  const app = express();
  app.use(express.json());
  // Mirrors index.ts: the auth router first, WITHOUT req.user…
  app.use('/api', await createAuthRoutes(db));
  // …then the middleware that stamps it, then the MFA router.
  app.use('/api', (req, _res, next) => {
    if (current) (req as unknown as { user: typeof current }).user = current;
    next();
  });
  app.use('/api', createAuthMfaRoutes(db));

  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('no address');
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE;
  else process.env.DEPLOYMENT_MODE = originalMode;
  await new Promise<void>((resolve) => { server?.close(() => resolve()); });
});

beforeEach(async () => {
  runs = [];
  current = { id: 'u-1', username: 'alice', role: 'analyst' };
  user = {
    id: 'u-1', username: 'alice', role: 'analyst', display_name: 'Alice',
    email: 'alice@example.test',
    password_hash: await bcrypt.hash(PASSWORD, 4),
    mfa_enabled: 0, mfa_secret: null,
  };
});

const post = (path: string, body: unknown) => fetch(`${base}/api${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

async function currentTotp(offset = 0): Promise<string> {
  const speakeasy = await import('speakeasy');
  const code = speakeasy.default.totp({ secret: MFA_SECRET, encoding: 'base32' });
  if (offset === 0) return code;
  return String((Number(code) + offset) % 1_000_000).padStart(6, '0');
}

describe('index.ts mounts MFA enrolment below the auth middleware', () => {
  const src = readFileSync(join(process.cwd(), 'server', 'index.ts'), 'utf8');

  it('registers createAuthMfaRoutes AFTER authMiddleware', () => {
    const middleware = src.indexOf("app.use('/api', authMiddleware)");
    const mfa = src.indexOf('createAuthMfaRoutes(db)');
    expect(middleware, 'authMiddleware mount not found').toBeGreaterThan(-1);
    expect(mfa, 'createAuthMfaRoutes mount not found').toBeGreaterThan(-1);
    // If this fails, MFA enrolment 401s for everybody again and nothing else breaks —
    // which is exactly why it went unnoticed the first time.
    expect(mfa).toBeGreaterThan(middleware);
  });

  it('still registers the main auth router BEFORE it — login must stay unauthenticated', () => {
    const middleware = src.indexOf("app.use('/api', authMiddleware)");
    expect(src.indexOf('await createAuthRoutes(db)')).toBeLessThan(middleware);
  });
});

describe('the enrolment routes reach req.user', () => {
  it('the pre-auth router no longer answers /auth/mfa/enable at all', async () => {
    // Proves the routes actually MOVED rather than being duplicated: with no stamped
    // user the request falls through the first router and 401s from the second.
    current = undefined;
    const res = await post('/auth/mfa/enable', {});
    expect(res.status).toBe(401);
  });

  it('enables MFA for an authenticated caller', async () => {
    const res = await post('/auth/mfa/enable', {});
    expect(res.status).toBe(200);
    const body = await res.json() as { secret?: string; qrDataUrl?: string };
    expect(body.secret).toBeTruthy();
    expect(body.qrDataUrl).toMatch(/^data:image\/png/);
    expect(runs.some((r) => r.sql.includes('mfa_pending'))).toBe(true);
  });

  it('confirms with a live code and activates the account', async () => {
    const res = await post('/auth/mfa/confirm', { token: await currentTotp() });
    expect(res.status).toBe(200);
    expect(runs.some((r) => r.sql.includes('UPDATE users SET mfa_enabled = 1'))).toBe(true);
  });

  it('refuses to confirm with a wrong code', async () => {
    const res = await post('/auth/mfa/confirm', { token: await currentTotp(7) });
    expect(res.status).toBe(400);
    expect(runs.some((r) => r.sql.includes('UPDATE users SET mfa_enabled = 1'))).toBe(false);
  });
});

describe('login enforces the second factor', () => {
  const login = (body: Record<string, unknown>) => post('/auth/login', { username: 'alice', password: PASSWORD, ...body });

  it('issues no session when MFA is on and no code is given', async () => {
    user.mfa_enabled = 1; user.mfa_secret = MFA_SECRET;
    const res = await login({});
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ mfaRequired: true });
    expect(runs.some((r) => r.sql.includes('INSERT INTO user_sessions'))).toBe(false);
  });

  it('issues no session for a wrong code, and records a failed attempt', async () => {
    // Recorded so the existing 5-in-15-minutes lockout also caps code guessing.
    user.mfa_enabled = 1; user.mfa_secret = MFA_SECRET;
    const res = await login({ mfaToken: await currentTotp(7) });
    expect(res.status).toBe(401);
    expect(runs.some((r) => r.sql.includes('INSERT INTO user_sessions'))).toBe(false);
    expect(runs.some((r) => r.sql.includes('INSERT INTO login_attempts') && r.params.includes('alice'))).toBe(true);
  });

  it('lets the enrolled user in with a live code', async () => {
    user.mfa_enabled = 1; user.mfa_secret = MFA_SECRET;
    const res = await login({ mfaToken: await currentTotp() });
    expect(res.status).toBe(200);
    expect(runs.some((r) => r.sql.includes('INSERT INTO user_sessions'))).toBe(true);
  });

  it('fails closed when mfa_enabled is set but the secret is missing', async () => {
    // Otherwise clearing one column would be a bypass.
    user.mfa_enabled = 1; user.mfa_secret = null;
    const res = await login({ mfaToken: await currentTotp() });
    expect(res.status).toBe(401);
    expect(runs.some((r) => r.sql.includes('INSERT INTO user_sessions'))).toBe(false);
  });

  it('leaves an account WITHOUT MFA exactly as it was — password alone still works', async () => {
    // The regression that would matter to every existing user on an instance.
    const res = await login({});
    expect(res.status).toBe(200);
    expect(runs.some((r) => r.sql.includes('INSERT INTO user_sessions'))).toBe(true);
  });

  it('rejects a malformed code at the schema, without reaching bcrypt', async () => {
    user.mfa_enabled = 1; user.mfa_secret = MFA_SECRET;
    const res = await login({ mfaToken: 'not-a-code' });
    expect(res.status).toBe(400);
  });
});
