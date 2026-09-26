/**
 * demo-signup.db.test.ts — strangers make their own accounts on a public demo,
 * and nothing else about sign-in gets looser (public showcase, 2026-09-25).
 *
 * Against the real schema (migration 289 is applied first; it is idempotent):
 *
 *   - POST /api/auth/demo-signup exists only in demo mode; the invite code
 *     (DEMO_SIGNUP_CODE) must match; with no code sign-up is closed unless
 *     DEMO_SIGNUP_OPEN=true; usernames are unique case-insensitively and a
 *     few are reserved; passwords follow the 12-character rule; attempts are
 *     throttled per IP and accounts capped per day. A new account is an
 *     analyst with a token budget and an expiry, signed straight in, and its
 *     session ends no later than the account;
 *   - an expired demo account cannot sign in, nor can any demo account once
 *     the server is no longer a demo — an ordinary account is unaffected;
 *     the same holds for a session the account already has (the auth
 *     middleware and /auth/me), review finding C12;
 *   - Google / GitHub sign-in is off in demo mode, and outside it the flow
 *     now carries a state bound to the browser (login CSRF) and refuses an
 *     email address the provider has not verified; a sign-in begun on
 *     another host name starts over once, never in a loop (finding L8).
 *
 * Skips without a test database (tests/setup/db-guard.ts decides which).
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
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-demo-signup-0123456789abcdef';
  // Read by routes/auth.ts when it loads.
  process.env.GOOGLE_CLIENT_ID = 'test-google-client';
  process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
  process.env.GITHUB_CLIENT_ID = 'test-github-client';
  process.env.GITHUB_CLIENT_SECRET = 'test-github-secret';
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
const MIGRATION = path.resolve(__dirname, '../../server/db/migrations-pg/289_demo_accounts.sql');
const MIGRATION_TERMS = path.resolve(__dirname, '../../server/db/migrations-pg/291_demo_terms_acceptance.sql');
const ORDINARY = `ord_${TAG}`;
const GOOGLE_EMAIL = `g_${TAG}@example.test`;
const GITHUB_EMAIL = `gh_${TAG}@example.test`;

const ENV_KEYS = ['DEMO_MODE', 'DEMO_SIGNUP_CODE', 'DEMO_SIGNUP_OPEN', 'DEMO_ACCOUNT_TTL_DAYS', 'DEMO_USER_MONTHLY_TOKENS', 'DEMO_MAX_SIGNUPS_PER_DAY', 'BASE_URL'];
const savedEnv: Record<string, string | undefined> = {};

let ipSeq = 0;
/** A fresh client address per test, so the per-IP throttle only bites where a test means it to. */
const nextIp = () => `198.51.100.${(++ipSeq % 250) + 1}`;

d('demo sign-up and sign-in (routes/auth.ts)', () => {
  let db: DatabaseAdapter;
  let server: Server;
  let base = '';
  const realFetch = globalThis.fetch;
  /** What the fake Google / GitHub answer. */
  const provider = {
    googleUser: { email: GOOGLE_EMAIL, verified_email: false, name: 'G' } as Record<string, unknown>,
    githubEmails: [] as Array<{ email: string; primary: boolean; verified: boolean }>,
  };

  beforeAll(async () => {
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    savedEnv.DEPLOYMENT_MODE = process.env.DEPLOYMENT_MODE;
    savedEnv.DEMO_SIGNUPS_PER_IP_PER_HOUR = process.env.DEMO_SIGNUPS_PER_IP_PER_HOUR;
    process.env.DEPLOYMENT_MODE = 'team';
    process.env.DEMO_SIGNUPS_PER_IP_PER_HOUR = '3';

    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 3 });
    await db.exec(fs.readFileSync(MIGRATION, 'utf8'));
    await db.exec(fs.readFileSync(MIGRATION_TERMS, 'utf8'));
    await db.run(
      `INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, 'analyst')`,
      `u-${ORDINARY}`, ORDINARY, await bcrypt.hash(PASSWORD, 4),
    );

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.startsWith('https://oauth2.googleapis.com/token')) return json({ access_token: 'g-at', id_token: 'x' });
      if (url.startsWith('https://www.googleapis.com/oauth2/v2/userinfo')) return json(provider.googleUser);
      if (url.startsWith('https://github.com/login/oauth/access_token')) return json({ access_token: 'gh-at' });
      if (url === 'https://api.github.com/user') return json({ login: `ghl_${TAG}`, name: 'GH', email: 'public-unverified@example.test' });
      if (url === 'https://api.github.com/user/emails') return json(provider.githubEmails);
      return realFetch(input, init);
    });

    const { createAuthRoutes } = await import('../../server/routes/auth.js');
    const { createAuthMiddleware } = await import('../../server/middleware/auth.js');
    const app = express();
    app.set('trust proxy', true);
    app.use(cookieParser());
    app.use(express.json());
    app.use('/api', await createAuthRoutes(db));
    // Any authenticated route, behind the real auth middleware as in index.ts.
    app.get('/api/probe', await createAuthMiddleware(db), (req, res) => { res.json({ id: req.user?.id }); });
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (k === 'BASE_URL') continue;
      if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k];
    }
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    for (const k of [...ENV_KEYS, 'DEPLOYMENT_MODE', 'DEMO_SIGNUPS_PER_IP_PER_HOUR']) {
      if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k];
    }
    if (db) {
      const like = `%${TAG}%`;
      await db.run('DELETE FROM login_attempts WHERE username LIKE ?', like).catch(() => {});
      await db.run("DELETE FROM security_events WHERE ip_address LIKE '198.51.100.%'").catch(() => {});
      await db.run('DELETE FROM security_events WHERE user_id IN (SELECT id FROM users WHERE username LIKE ? OR email LIKE ?)', like, like).catch(() => {});
      await db.run('DELETE FROM users WHERE username LIKE ? OR email LIKE ?', like, like).catch(() => {});
      // Only there if the reserved-name check failed.
      await db.run("DELETE FROM users WHERE username = 'Admin' AND demo_expires_at IS NOT NULL").catch(() => {});
      await db.close();
    }
    await new Promise<void>((resolve) => { server?.close(() => resolve()); });
  });

  // Every sign-up here ticks both boxes of the current terms (migration 291);
  // demo-signup-terms.db.test.ts covers the refusals.
  const signup = (body: Record<string, unknown>, ip = nextIp()) =>
    fetch(`${base}/api/auth/demo-signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ over18: true, acceptTerms: true, termsVersion: DEMO_TERMS_VERSION, ...body }),
    });
  const login = (username: string, password = PASSWORD) =>
    fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': nextIp() },
      body: JSON.stringify({ username, password }),
    });
  const userRow = (username: string) => db.get<{
    id: string; role: string; email: string | null; monthly_token_budget: number; demo_expires_at: Date | null; password_hash: string;
  }>('SELECT id, role, email, monthly_token_budget, demo_expires_at, password_hash FROM users WHERE username = ?', username);
  const demoOn = (extra: Record<string, string> = {}) => {
    process.env.DEMO_MODE = 'true';
    process.env.DEMO_SIGNUP_CODE = CODE;
    for (const [k, v] of Object.entries(extra)) process.env[k] = v;
  };

  // ── Sign-up ──────────────────────────────────────────────────────────────

  it('does not exist outside demo mode', async () => {
    process.env.DEMO_SIGNUP_CODE = CODE;
    const res = await signup({ code: CODE, username: `off_${TAG}`, password: PASSWORD });
    expect(res.status).toBe(404);
    expect(await userRow(`off_${TAG}`)).toBeUndefined();
  });

  it('refuses a wrong or missing invite code', async () => {
    demoOn();
    expect((await signup({ code: 'nope', username: `bad_${TAG}`, password: PASSWORD })).status).toBe(403);
    expect((await signup({ username: `bad_${TAG}`, password: PASSWORD })).status).toBe(403);
    expect(await userRow(`bad_${TAG}`)).toBeUndefined();
  });

  it('creates an expiring analyst with a budget, signs it in, and ends its session with the account', async () => {
    demoOn({ DEMO_ACCOUNT_TTL_DAYS: '7', DEMO_USER_MONTHLY_TOKENS: '123456' });
    const before = Date.now();
    const res = await signup({ code: ` ${CODE} `, username: `alice_${TAG}`, password: PASSWORD });
    expect(res.status).toBe(201);
    const body = await res.json() as { user: { id: string; role: string }; token: string; expiresAt: string };
    expect(body.user.role).toBe('analyst');
    expect(JSON.stringify(body)).not.toContain(PASSWORD);
    expect(res.headers.get('set-cookie') ?? '').toContain('openexpert_session=');

    const row = await userRow(`alice_${TAG}`);
    expect(row?.role).toBe('analyst');
    expect(row?.email).toBeNull();
    expect(Number(row?.monthly_token_budget)).toBe(123456);
    expect(await bcrypt.compare(PASSWORD, row!.password_hash)).toBe(true);
    const expires = new Date(row!.demo_expires_at!).getTime();
    const week = 7 * 24 * 60 * 60 * 1000;
    expect(expires).toBeGreaterThanOrEqual(before + week - 60_000);
    expect(expires).toBeLessThanOrEqual(Date.now() + week + 60_000);

    const session = await db.get<{ expires_at: Date }>('SELECT expires_at FROM user_sessions WHERE token = ?', body.token);
    expect(new Date(session!.expires_at).getTime()).toBeLessThanOrEqual(expires);
  });

  it('keeps usernames unique regardless of case, and reserves the instance\'s own names', async () => {
    demoOn();
    expect((await signup({ code: CODE, username: `bob_${TAG}`, password: PASSWORD })).status).toBe(201);
    expect((await signup({ code: CODE, username: `BOB_${TAG}`, password: PASSWORD })).status).toBe(409);
    expect((await signup({ code: CODE, username: 'Admin', password: PASSWORD })).status).toBe(409);
    expect((await signup({ code: CODE, username: ORDINARY, password: PASSWORD })).status).toBe(409);
  });

  it('follows the password and username rules used elsewhere', async () => {
    demoOn();
    expect((await signup({ code: CODE, username: `short_${TAG}`, password: 'elevenchars' })).status).toBe(400);
    expect((await signup({ code: CODE, username: `sp ace_${TAG}`, password: PASSWORD })).status).toBe(400);
    expect(await userRow(`short_${TAG}`)).toBeUndefined();
  });

  it('is closed with no code, unless DEMO_SIGNUP_OPEN=true', async () => {
    process.env.DEMO_MODE = 'true';
    expect((await signup({ username: `closed_${TAG}`, password: PASSWORD })).status).toBe(403);
    process.env.DEMO_SIGNUP_OPEN = 'true';
    expect((await signup({ username: `open_${TAG}`, password: PASSWORD })).status).toBe(201);
  });

  it('throttles attempts per IP — failures count too', async () => {
    demoOn();
    const ip = '198.51.100.251';
    for (let i = 0; i < 3; i++) expect((await signup({ code: 'wrong', username: `thr${i}_${TAG}`, password: PASSWORD }, ip)).status).toBe(403);
    const fourth = await signup({ code: CODE, username: `thr_${TAG}`, password: PASSWORD }, ip);
    expect(fourth.status).toBe(429);
    expect(await userRow(`thr_${TAG}`)).toBeUndefined();
    // Another address is not held back.
    expect((await signup({ code: CODE, username: `thr_${TAG}`, password: PASSWORD })).status).toBe(201);
  });

  it('caps new demo accounts per day, instance-wide', async () => {
    // Earlier cases made accounts today, so a cap of 1 is reached. (Other test
    // files may add demo accounts meanwhile; the cap only compares against the
    // count, so neither case depends on the exact number.)
    const today = await db.get<{ n: string | number }>(
      "SELECT COUNT(*) AS n FROM users WHERE demo_expires_at IS NOT NULL AND created_at > NOW() - INTERVAL '1 day'",
    );
    expect(Number(today?.n ?? 0)).toBeGreaterThanOrEqual(1);
    demoOn({ DEMO_MAX_SIGNUPS_PER_DAY: '1' });
    const full = await signup({ code: CODE, username: `cap_${TAG}`, password: PASSWORD });
    expect(full.status).toBe(429);
    expect(await userRow(`cap_${TAG}`)).toBeUndefined();
    process.env.DEMO_MAX_SIGNUPS_PER_DAY = '1000000';
    expect((await signup({ code: CODE, username: `cap_${TAG}`, password: PASSWORD })).status).toBe(201);
  });

  // ── Sign-in ──────────────────────────────────────────────────────────────

  it('signs a demo account in until it expires — its session never outlives it', async () => {
    demoOn();
    expect((await signup({ code: CODE, username: `carol_${TAG}`, password: PASSWORD })).status).toBe(201);
    const ok = await login(`carol_${TAG}`);
    expect(ok.status).toBe(200);
    const { token } = await ok.json() as { token: string };
    const row = await userRow(`carol_${TAG}`);
    const session = await db.get<{ expires_at: Date }>('SELECT expires_at FROM user_sessions WHERE token = ?', token);
    expect(new Date(session!.expires_at).getTime()).toBeLessThanOrEqual(new Date(row!.demo_expires_at!).getTime());

    await db.run("UPDATE users SET demo_expires_at = NOW() - INTERVAL '1 minute' WHERE username = ?", `carol_${TAG}`);
    const expired = await login(`carol_${TAG}`);
    expect(expired.status).toBe(403);
    expect((await expired.json() as { error: string }).error).toMatch(/expired/);
  });

  it('refuses every demo account once the server is no longer a demo — not an ordinary account', async () => {
    demoOn();
    expect((await signup({ code: CODE, username: `dave_${TAG}`, password: PASSWORD })).status).toBe(201);
    delete process.env.DEMO_MODE;
    expect((await login(`dave_${TAG}`)).status).toBe(403);
    expect((await login(ORDINARY)).status).toBe(200);
  });

  // Review finding C12 / L2 (2026-09-25): sign-in refused a demo account
  // outside demo mode, but a session it already held kept working — with no
  // route allowlist, as a full analyst, and no retention to delete it.
  const withToken = (url: string, token: string) => fetch(`${base}${url}`, { headers: { authorization: `Bearer ${token}` } });

  it('ends the sessions a demo account already holds once the server is no longer a demo — not an ordinary account\'s', async () => {
    demoOn();
    const created = await signup({ code: CODE, username: `erin_${TAG}`, password: PASSWORD });
    expect(created.status).toBe(201);
    const { token } = await created.json() as { token: string };
    const { token: ordinaryToken } = await (await login(ORDINARY)).json() as { token: string };

    // In demo mode the session works, so the 401s below are the rule, not a broken token.
    expect((await withToken('/api/probe', token)).status).toBe(200);
    const me = await withToken('/api/auth/me', token);
    expect(me.status).toBe(200);
    expect(await me.json()).not.toHaveProperty('demo_expires_at');

    delete process.env.DEMO_MODE;
    expect((await withToken('/api/probe', token)).status).toBe(401);
    expect((await withToken('/api/auth/me', token)).status).toBe(401);
    expect((await withToken('/api/auth/me/budget', token)).status).toBe(401);
    // Negative control: an ordinary account's session is untouched.
    expect((await withToken('/api/probe', ordinaryToken)).status).toBe(200);
    expect((await withToken('/api/auth/me', ordinaryToken)).status).toBe(200);

    // Back in demo mode, the unexpired account's session is live again.
    demoOn();
    expect((await withToken('/api/probe', token)).status).toBe(200);
  });

  it('/auth/me answers 401 for an expired demo account, like every other route', async () => {
    demoOn();
    const created = await signup({ code: CODE, username: `fred_${TAG}`, password: PASSWORD });
    const { token } = await created.json() as { token: string };
    expect((await withToken('/api/auth/me', token)).status).toBe(200);
    await db.run("UPDATE users SET demo_expires_at = NOW() - INTERVAL '1 minute' WHERE username = ?", `fred_${TAG}`);
    expect((await withToken('/api/probe', token)).status).toBe(401);
    expect((await withToken('/api/auth/me', token)).status).toBe(401);
  });

  // ── Google / GitHub ──────────────────────────────────────────────────────

  it('turns Google and GitHub sign-in off in demo mode', async () => {
    process.env.BASE_URL = base;
    process.env.DEMO_MODE = 'true';
    expect((await fetch(`${base}/api/auth/google`, { redirect: 'manual' })).status).toBe(404);
    expect((await fetch(`${base}/api/auth/github`, { redirect: 'manual' })).status).toBe(404);
    const cb = await fetch(`${base}/api/auth/google/callback?code=x&state=y`, { redirect: 'manual' });
    expect(cb.headers.get('location')).toBe('/?auth_error=not_configured');

    delete process.env.DEMO_MODE;
    const on = await fetch(`${base}/api/auth/google`, { redirect: 'manual' });
    expect(on.status).toBe(302);
    expect(on.headers.get('location')).toMatch(/^https:\/\/accounts\.google\.com\//);
  });

  /** Starts a sign-in; returns the state the provider would echo and the cookie the browser holds. */
  async function start(providerName: 'google' | 'github', query = ''): Promise<{ state: string; cookie: string }> {
    process.env.BASE_URL = base;
    const res = await fetch(`${base}/api/auth/${providerName}${query}`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    const state = new URL(res.headers.get('location')!).searchParams.get('state') ?? '';
    const setCookie = res.headers.get('set-cookie') ?? '';
    const m = /anton_oauth_state=([^;]+)/.exec(setCookie);
    expect(setCookie).toMatch(/HttpOnly/i);
    return { state, cookie: m ? decodeURIComponent(m[1]) : '' };
  }

  it('binds the Google state to the browser: a callback without the matching cookie is refused', async () => {
    const { state, cookie } = await start('google');
    expect(state).toMatch(/^[0-9a-f]{48}$/);
    expect(cookie).toBe(state);

    const noCookie = await fetch(`${base}/api/auth/google/callback?code=c&state=${state}`, { redirect: 'manual' });
    expect(noCookie.headers.get('location')).toBe('/?auth_error=invalid_state');
    const other = await start('google');
    const wrongCookie = await fetch(`${base}/api/auth/google/callback?code=c&state=${state}`, {
      redirect: 'manual', headers: { cookie: `anton_oauth_state=${other.cookie}` },
    });
    expect(wrongCookie.headers.get('location')).toBe('/?auth_error=invalid_state');
  });

  it('refuses an email Google has not verified, and signs in one it has', async () => {
    provider.googleUser = { email: GOOGLE_EMAIL, verified_email: false, name: 'G' };
    let s = await start('google');
    const refused = await fetch(`${base}/api/auth/google/callback?code=c&state=${s.state}`, {
      redirect: 'manual', headers: { cookie: `anton_oauth_state=${s.cookie}` },
    });
    expect(refused.headers.get('location')).toBe('/?auth_error=no_email');
    expect(await db.get('SELECT id FROM users WHERE email = ?', GOOGLE_EMAIL)).toBeUndefined();

    provider.googleUser = { email: GOOGLE_EMAIL, verified_email: true, name: 'G' };
    s = await start('google', '?from=school');
    const ok = await fetch(`${base}/api/auth/google/callback?code=c&state=${s.state}`, {
      redirect: 'manual', headers: { cookie: `anton_oauth_state=${s.cookie}` },
    });
    expect(ok.headers.get('location')).toMatch(/^\/\?from=school&auth_code=[0-9a-f]{64}$/);
    expect(await db.get('SELECT id FROM users WHERE email = ?', GOOGLE_EMAIL)).toBeDefined();
  });

  it('GitHub: signs in with a verified address only, never the profile\'s public one', async () => {
    provider.githubEmails = [{ email: `unverified_${TAG}@example.test`, primary: true, verified: false }];
    let s = await start('github');
    const refused = await fetch(`${base}/api/auth/github/callback?code=c&state=${s.state}`, {
      redirect: 'manual', headers: { cookie: `anton_oauth_state=${s.cookie}` },
    });
    expect(refused.headers.get('location')).toBe('/?auth_error=no_email');

    provider.githubEmails = [
      { email: `unverified_${TAG}@example.test`, primary: true, verified: false },
      { email: GITHUB_EMAIL, primary: false, verified: true },
    ];
    s = await start('github');
    const ok = await fetch(`${base}/api/auth/github/callback?code=c&state=${s.state}`, {
      redirect: 'manual', headers: { cookie: `anton_oauth_state=${s.cookie}` },
    });
    expect(ok.headers.get('location')).toMatch(/^\/\?auth_code=/);
    expect(await db.get('SELECT id FROM users WHERE email = ?', GITHUB_EMAIL)).toBeDefined();
    expect(await db.get('SELECT id FROM users WHERE email = ?', `unverified_${TAG}@example.test`)).toBeUndefined();
    expect(await db.get("SELECT id FROM users WHERE email = 'public-unverified@example.test'")).toBeUndefined();

    const noCookie = await fetch(`${base}/api/auth/github/callback?code=c&state=${s.state}`, { redirect: 'manual' });
    expect(noCookie.headers.get('location')).toBe('/?auth_error=invalid_state');
  });

  it('starts over on the callback host when begun on another name for the server', async () => {
    process.env.BASE_URL = base.replace('127.0.0.1', 'localhost');
    const res = await fetch(`${base}/api/auth/google?from=school`, { redirect: 'manual' });
    expect(res.headers.get('location')).toBe(`${process.env.BASE_URL}/api/auth/google?from=school&restarted=1`);
    expect(res.headers.get('set-cookie') ?? '').not.toContain('anton_oauth_state=');
  });

  // Review finding L8 (2026-09-25): behind a proxy that passes neither the
  // public Host nor X-Forwarded-Host, every request looked like the wrong
  // host and was restarted, for ever (ERR_TOO_MANY_REDIRECTS).
  it('never restarts a sign-in twice: at worst the provider is reached from the wrong host', async () => {
    process.env.BASE_URL = base.replace('127.0.0.1', 'localhost');
    for (const provider of ['google', 'github'] as const) {
      const first = await fetch(`${base}/api/auth/${provider}`, { redirect: 'manual' });
      const restart = new URL(first.headers.get('location')!);
      expect(restart.searchParams.get('restarted')).toBe('1');
      // The proxy hands the restarted request to ANTON with the same wrong Host.
      const second = await fetch(`${base}${restart.pathname}${restart.search}`, { redirect: 'manual' });
      expect(second.status).toBe(302);
      expect(second.headers.get('location')).toMatch(provider === 'google' ? /^https:\/\/accounts\.google\.com\// : /^https:\/\/github\.com\/login\/oauth\/authorize/);
    }
  });

  it('compares the host name, not the port, and honours a trusted X-Forwarded-Host', async () => {
    process.env.BASE_URL = 'http://localhost:8443';
    // nginx's $host drops a non-default port: the public name without it is the right host.
    const viaProxy = await fetch(`${base}/api/auth/google`, { redirect: 'manual', headers: { 'x-forwarded-host': 'localhost' } });
    expect(viaProxy.headers.get('location')).toMatch(/^https:\/\/accounts\.google\.com\//);
    // Negative control: a request that really is on another name still starts over.
    const direct = await fetch(`${base}/api/auth/google`, { redirect: 'manual' });
    expect(direct.headers.get('location')).toBe('http://localhost:8443/api/auth/google?restarted=1');
  });
});
