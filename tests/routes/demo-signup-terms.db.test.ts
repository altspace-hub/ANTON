/**
 * demo-signup-terms.db.test.ts — what the public demo's privacy review
 * (2026-09-26) changed in routes/auth.ts:
 *
 *   - G7: a demo sign-up must confirm the visitor is 18 or over and accept
 *     the demo terms of the current DEMO_TERMS_VERSION; each refusal is a
 *     sentence the form can show, and no account is made. The account stores
 *     the version and both times (migration 291);
 *   - D25: on a demo the session cookie is a browser-session cookie (no
 *     Max-Age), for sign-up and sign-in alike; outside demo mode it keeps its
 *     Max-Age (negative control). The server still ends the session at
 *     user_sessions.expires_at;
 *   - M2: a sign-in for a name that does not exist logs a keyed tag of the
 *     typed text, never the text (it may be a password typed in the wrong
 *     field); the lockout event carries the account's id, never the typed
 *     name. An existing account's failed sign-in is logged as before.
 *
 * Against the real schema; migrations 289 and 291 are applied first (both
 * idempotent). Skips without a test database (tests/setup/db-guard.ts).
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';
import type { DatabaseAdapter } from '../../server/db/database.js';
import { DEMO_TERMS_VERSION } from '../../server/middleware/demo-mode.js';

const H = vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-demo-terms-0123456789abcdef01';
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let tag = '';
  for (let i = 0; i < 8; i++) tag += letters[Math.floor(Math.random() * letters.length)];
  return { tag };
});

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

const TAG = H.tag;
const CODE = `invite-${TAG}`;
const PASSWORD = 'a-long-enough-pass';
const MIGRATIONS = ['289_demo_accounts.sql', '291_demo_terms_acceptance.sql']
  .map((f) => path.resolve(__dirname, '../../server/db/migrations-pg', f));
const ORDINARY = `ordt_${TAG}`;
const DECLARED = { over18: true, acceptTerms: true, termsVersion: DEMO_TERMS_VERSION };

const ENV_KEYS = ['DEPLOYMENT_MODE', 'DEMO_MODE', 'DEMO_SIGNUP_CODE', 'DEMO_SIGNUP_OPEN', 'DEMO_MAX_SIGNUPS_PER_DAY', 'DEMO_SIGNUPS_PER_IP_PER_HOUR'];
const savedEnv: Record<string, string | undefined> = {};

// TEST-NET-3, so the other sign-up test file's clean-up (198.51.100.x) never touches these rows.
let ipSeq = 0;
const nextIp = () => `203.0.113.${(++ipSeq % 250) + 1}`;

d('demo sign-up: terms, age, cookie and sign-in logging (routes/auth.ts)', () => {
  let db: DatabaseAdapter;
  let server: Server;
  let base = '';

  beforeAll(async () => {
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    process.env.DEPLOYMENT_MODE = 'team';
    // Read once, when the routes are built.
    process.env.DEMO_SIGNUPS_PER_IP_PER_HOUR = '1000';

    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 3 });
    for (const file of MIGRATIONS) await db.exec(fs.readFileSync(file, 'utf8'));
    await db.run(
      `INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, 'analyst')`,
      `u-${ORDINARY}`, ORDINARY, await bcrypt.hash(PASSWORD, 4),
    );

    const { createAuthRoutes } = await import('../../server/routes/auth.js');
    const app = express();
    app.set('trust proxy', true);
    app.use(cookieParser());
    app.use(express.json());
    app.use('/api', await createAuthRoutes(db));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(() => {
    for (const k of ['DEMO_MODE', 'DEMO_SIGNUP_CODE', 'DEMO_SIGNUP_OPEN', 'DEMO_MAX_SIGNUPS_PER_DAY']) {
      if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k];
    }
  });

  afterAll(async () => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k];
    }
    if (db) {
      const like = `%${TAG}%`;
      await db.run('DELETE FROM login_attempts WHERE username LIKE ?', like).catch(() => {});
      await db.run("DELETE FROM security_events WHERE ip_address LIKE '203.0.113.%'").catch(() => {});
      await db.run('DELETE FROM security_events WHERE user_id IN (SELECT id FROM users WHERE username LIKE ?)', like).catch(() => {});
      await db.run('DELETE FROM user_sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE ?)', like).catch(() => {});
      await db.run('DELETE FROM users WHERE username LIKE ?', like).catch(() => {});
      await db.close();
    }
    await new Promise<void>((resolve) => { server?.close(() => resolve()); });
  });

  const demoOn = () => {
    process.env.DEMO_MODE = 'true';
    process.env.DEMO_SIGNUP_CODE = CODE;
    process.env.DEMO_MAX_SIGNUPS_PER_DAY = '1000000';
  };
  const signup = (body: Record<string, unknown>) =>
    fetch(`${base}/api/auth/demo-signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': nextIp() },
      body: JSON.stringify({ code: CODE, password: PASSWORD, ...body }),
    });
  const login = (username: string, password = PASSWORD, ip = nextIp()) =>
    fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ username, password }),
    });
  const sessionCookie = (res: Response): string => {
    const all = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
    return all.find((c) => c.startsWith('openexpert_session=')) ?? '';
  };
  const eventsFrom = (ip: string) => db.all<{ user_id: string | null; details: string }>(
    'SELECT user_id, details FROM security_events WHERE ip_address = ? ORDER BY created_at, id', ip,
  );

  // ── G7: 18+ and the terms ─────────────────────────────────────────────────

  it('refuses a sign-up without the 18+ tick, without the terms, or on other terms — and makes no account', async () => {
    demoOn();
    const cases: Array<[Record<string, unknown>, RegExp]> = [
      [{ acceptTerms: true, termsVersion: DEMO_TERMS_VERSION }, /18 or over/],
      [{ over18: false, acceptTerms: true, termsVersion: DEMO_TERMS_VERSION }, /18 or over/],
      [{ over18: true, termsVersion: DEMO_TERMS_VERSION }, /accept the demo terms/],
      [{ over18: true, acceptTerms: false, termsVersion: DEMO_TERMS_VERSION }, /accept the demo terms/],
      [{ over18: true, acceptTerms: true }, /terms have changed/],
      [{ over18: true, acceptTerms: true, termsVersion: '2020-01-01' }, /terms have changed/],
    ];
    for (const [i, [declared, message]] of cases.entries()) {
      const username = `noterms${i}_${TAG}`;
      const res = await signup({ username, ...declared });
      expect(res.status, JSON.stringify(declared)).toBe(400);
      expect((await res.json() as { error: string }).error).toMatch(message);
      expect(await db.get('SELECT id FROM users WHERE username = ?', username)).toBeUndefined();
    }
  });

  it('records the terms version, the time of acceptance and the 18+ confirmation on the account', async () => {
    demoOn();
    const before = Date.now();
    const res = await signup({ username: `terms_${TAG}`, ...DECLARED });
    expect(res.status).toBe(201);
    const row = await db.get<{ terms_version: string | null; terms_accepted_at: Date | null; age_confirmed_at: Date | null }>(
      'SELECT terms_version, terms_accepted_at, age_confirmed_at FROM users WHERE username = ?', `terms_${TAG}`,
    );
    expect(row?.terms_version).toBe(DEMO_TERMS_VERSION);
    for (const at of [row?.terms_accepted_at, row?.age_confirmed_at]) {
      expect(at).not.toBeNull();
      const t = new Date(at!).getTime();
      expect(t).toBeGreaterThanOrEqual(before - 60_000);
      expect(t).toBeLessThanOrEqual(Date.now() + 60_000);
    }
    // An ordinary account never went through the demo sign-up.
    const ordinary = await db.get<{ terms_version: string | null }>('SELECT terms_version FROM users WHERE username = ?', ORDINARY);
    expect(ordinary?.terms_version).toBeNull();
  });

  // ── D25: the session cookie ───────────────────────────────────────────────

  it('on a demo, sets a browser-session cookie at sign-up and sign-in; the server still bounds the session', async () => {
    demoOn();
    const created = await signup({ username: `cookie_${TAG}`, ...DECLARED });
    expect(created.status).toBe(201);
    const onSignup = sessionCookie(created);
    expect(onSignup).toContain('openexpert_session=');
    expect(onSignup).toMatch(/HttpOnly/i);
    expect(onSignup).not.toMatch(/Max-Age/i);
    expect(onSignup).not.toMatch(/Expires/i);

    const signedIn = await login(`cookie_${TAG}`);
    expect(signedIn.status).toBe(200);
    const onLogin = sessionCookie(signedIn);
    expect(onLogin).toContain('openexpert_session=');
    expect(onLogin).not.toMatch(/Max-Age/i);
    const { token } = await signedIn.json() as { token: string };
    const session = await db.get<{ expires_at: Date }>('SELECT expires_at FROM user_sessions WHERE user_id = (SELECT id FROM users WHERE username = ?) ORDER BY expires_at DESC LIMIT 1', `cookie_${TAG}`);
    expect(token).toBeTruthy();
    expect(new Date(session!.expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('outside demo mode the cookie keeps its Max-Age (negative control)', async () => {
    delete process.env.DEMO_MODE;
    const res = await login(ORDINARY);
    expect(res.status).toBe(200);
    expect(sessionCookie(res)).toMatch(/Max-Age=\d+/i);
  });

  // ── M2: what a failed sign-in logs ────────────────────────────────────────

  it('logs a tag of a typed name that matches no account, never the text', async () => {
    const typed = `Secret-Pass-${TAG}-typed-here`;
    const ip = nextIp();
    expect((await login(typed, PASSWORD, ip)).status).toBe(401);
    expect((await login(typed, PASSWORD, ip)).status).toBe(401);
    await vi.waitFor(async () => expect(await eventsFrom(ip)).toHaveLength(2));
    const events = await eventsFrom(ip);
    for (const e of events) {
      expect(e.details).not.toContain(typed);
      expect(e.details).not.toContain(TAG);
      expect(e.details).toMatch(/non-existent user \(name tag [0-9a-f]{12}\)/);
      expect(e.user_id).toBeNull();
    }
    // The same name gives the same tag, so repeated attempts still group.
    expect(events[0].details).toBe(events[1].details);
  });

  it('an existing account\'s failed sign-in is logged against its id, as before (control)', async () => {
    const ip = nextIp();
    expect((await login(ORDINARY, 'not-the-password', ip)).status).toBe(401);
    await vi.waitFor(async () => expect(await eventsFrom(ip)).toHaveLength(1));
    const [event] = await eventsFrom(ip);
    expect(event.user_id).toBe(`u-${ORDINARY}`);
    expect(event.details).toBe(`Invalid password for user: ${ORDINARY}`);
  });

  it('the lockout event carries the account\'s id, never the typed name; for no account, neither', async () => {
    const locked = `lock_${TAG}`;
    await db.run(
      `INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, 'analyst')`,
      `u-${locked}`, locked, await bcrypt.hash(PASSWORD, 4),
    );
    const ip = nextIp();
    for (let i = 0; i < 5; i++) expect((await login(locked, 'wrong-password-x', ip)).status).toBe(401);
    expect((await login(locked, PASSWORD, ip)).status).toBe(429);
    await vi.waitFor(async () => expect((await eventsFrom(ip)).some((e) => /locked/i.test(e.details))).toBe(true));
    const lockEvent = (await eventsFrom(ip)).find((e) => /locked/i.test(e.details))!;
    expect(lockEvent.user_id).toBe(`u-${locked}`);

    const ghost = `Ghost-${TAG}-maybe-a-password`;
    const ip2 = nextIp();
    for (let i = 0; i < 5; i++) expect((await login(ghost, PASSWORD, ip2)).status).toBe(401);
    expect((await login(ghost, PASSWORD, ip2)).status).toBe(429);
    await vi.waitFor(async () => expect((await eventsFrom(ip2)).some((e) => /locked/i.test(e.details))).toBe(true));
    const ghostLock = (await eventsFrom(ip2)).find((e) => /locked/i.test(e.details))!;
    expect(ghostLock.user_id).toBeNull();
    expect(ghostLock.details).not.toContain(ghost);
    expect(ghostLock.details).not.toContain(TAG);
  });
});
