/**
 * account-invitations.db.test.ts — an administrator makes an account for an
 * email address, the person chooses their own password from a one-time link
 * and signs in with the address (2026-10-01).
 *
 * Against the real schema (migrations 289, 291 and 292 first; idempotent):
 *
 *   - only an administrator invites; the address is the username, stored
 *     lower case, unique case-insensitively; the account has no password
 *     until the link is used, so it cannot sign in before;
 *   - the link works once, its token is stored only as a hash, a refused
 *     attempt (short password, terms not accepted) leaves it usable;
 *   - on a demo the person confirms 18+ and accepts the current terms, and the
 *     account then lives DEMO_ACCOUNT_TTL_DAYS; an unused invitation lives as
 *     long as its link; outside demo mode none of that applies;
 *   - a new link for an account with a password lets the person choose a new
 *     one: the old password and every old session stop working;
 *   - no link for an account that signs in through SSO;
 *   - no email leaves without SMTP_HOST: the administrator gets the link;
 *   - DEMO_SIGNUP_WITH_EMAIL: sign-up takes an email address as the username,
 *     unique against invited accounts too; the administrator's group link
 *     carries the invite code in the fragment.
 *
 * Skips without a test database (tests/setup/db-guard.ts decides which).
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';
import type { DatabaseAdapter } from '../../server/db/database.js';
import { DEMO_TERMS_VERSION } from '../../server/middleware/demo-mode.js';

const H = vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-invitations-0123456789abcdef';
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let tag = '';
  for (let i = 0; i < 8; i++) tag += letters[Math.floor(Math.random() * letters.length)];
  return { tag };
});

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

const TAG = H.tag;
const PASSWORD = 'a-long-enough-pass';
const MIGRATIONS = ['289_demo_accounts.sql', '291_demo_terms_acceptance.sql', '292_account_invitations.sql']
  .map((f) => path.resolve(__dirname, '../../server/db/migrations-pg', f));
const ADMIN_ID = `adm-${TAG}`;
const ANALYST_ID = `ana-${TAG}`;

const ENV_KEYS = ['DEMO_MODE', 'DEMO_ACCOUNT_TTL_DAYS', 'DEMO_USER_MONTHLY_TOKENS', 'SMTP_HOST', 'APP_PUBLIC_URL', 'BASE_URL', 'DEPLOYMENT_MODE', 'DEMO_SIGNUP_CODE', 'DEMO_SIGNUP_WITH_EMAIL'];
const savedEnv: Record<string, string | undefined> = {};

let ipSeq = 0;
const nextIp = () => `198.51.100.${(++ipSeq % 250) + 1}`;
const email = (name: string) => `${name}_${TAG}@example.test`;

d('accounts made by invitation (routes/admin.ts, routes/auth.ts)', () => {
  let db: DatabaseAdapter;
  let server: Server;
  let base = '';

  beforeAll(async () => {
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    process.env.DEPLOYMENT_MODE = 'team';
    delete process.env.SMTP_HOST;
    process.env.APP_PUBLIC_URL = 'https://demo.example.test';

    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 3 });
    for (const m of MIGRATIONS) await db.exec(fs.readFileSync(m, 'utf8'));
    await db.run(`INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, 'x', 'admin')`, ADMIN_ID, `admin_${TAG}`);
    await db.run(`INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, 'x', 'analyst')`, ANALYST_ID, `analyst_${TAG}`);

    const { createAuthRoutes } = await import('../../server/routes/auth.js');
    const { createAuthMiddleware } = await import('../../server/middleware/auth.js');
    const { createAdminRoutes } = await import('../../server/routes/admin.js');
    const app = express();
    app.set('trust proxy', true);
    app.use(cookieParser());
    app.use(express.json());
    app.use('/api', await createAuthRoutes(db));
    app.get('/api/probe', await createAuthMiddleware(db), (req, res) => { res.json({ id: req.user?.id }); });
    // The admin routes as index.ts mounts them, behind a stand-in for the auth
    // middleware: the x-test-user header says who is calling.
    app.use('/api', (req, _res, next) => {
      const who = req.header('x-test-user');
      if (who === 'admin') req.user = { id: ADMIN_ID, username: `admin_${TAG}`, role: 'admin' };
      if (who === 'analyst') req.user = { id: ANALYST_ID, username: `analyst_${TAG}`, role: 'analyst' };
      next();
    }, await createAdminRoutes(db));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(() => {
    for (const k of ['DEMO_MODE', 'DEMO_ACCOUNT_TTL_DAYS', 'DEMO_USER_MONTHLY_TOKENS', 'DEMO_SIGNUP_CODE', 'DEMO_SIGNUP_WITH_EMAIL']) {
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
      await db.run('DELETE FROM user_identities WHERE user_id IN (SELECT id FROM users WHERE username LIKE ?)', like).catch(() => {});
      await db.run('DELETE FROM security_events WHERE user_id IN (SELECT id FROM users WHERE username LIKE ?)', like).catch(() => {});
      await db.run('DELETE FROM users WHERE username LIKE ? OR email LIKE ?', like, like).catch(() => {});
      await db.close();
    }
    await new Promise<void>((resolve) => { server?.close(() => resolve()); });
  });

  const post = (url: string, body: unknown, who?: 'admin' | 'analyst', bearer?: string) =>
    fetch(`${base}${url}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json', 'x-forwarded-for': nextIp(),
        ...(who ? { 'x-test-user': who } : {}),
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify(body),
    });
  const invite = (body: Record<string, unknown>, who: 'admin' | 'analyst' = 'admin') => post('/api/admin/invitations', body, who);
  const tokenOf = (link: string) => new URL(link).hash.replace(/^#token=/, '');
  const login = (username: string, password = PASSWORD) => post('/api/auth/login', { username, password });
  const accept = (token: string, extra: Record<string, unknown> = {}) =>
    post('/api/auth/invitation/accept', { token, password: PASSWORD, ...extra });
  const terms = { over18: true, acceptTerms: true, termsVersion: DEMO_TERMS_VERSION };
  const row = (username: string) => db.get<{
    id: string; username: string; email: string; role: string; password_hash: string; display_name: string;
    monthly_token_budget: number; demo_expires_at: Date | null; terms_version: string | null;
  }>('SELECT id, username, email, role, password_hash, display_name, monthly_token_budget, demo_expires_at, terms_version FROM users WHERE username = ?', username);

  it('only an administrator invites', async () => {
    const res = await invite({ email: email('nope') }, 'analyst');
    expect(res.status).toBe(403);
    expect(await row(email('nope'))).toBeUndefined();
  });

  it('makes an account with no password for the address, and a link the administrator can pass on', async () => {
    process.env.DEMO_MODE = 'true';
    process.env.DEMO_USER_MONTHLY_TOKENS = '12345';
    const res = await invite({ email: `  ${email('Alice').toUpperCase()} `, displayName: 'Alice Test' });
    expect(res.status).toBe(200);
    const body = await res.json() as { link: string; purpose: string; emailed: boolean; emailProblem: string | null; expiresAt: string };
    expect(body.link).toMatch(/^https:\/\/demo\.example\.test\/welcome#token=[A-Za-z0-9_-]{40,}$/);
    expect(body.purpose).toBe('invite');
    // No SMTP_HOST: nothing is sent, and the administrator is told so.
    expect(body.emailed).toBe(false);
    expect(body.emailProblem).toMatch(/SMTP_HOST/);

    const user = await row(email('alice'));
    expect(user).toMatchObject({ email: email('alice'), role: 'analyst', password_hash: '', display_name: 'Alice Test', monthly_token_budget: 12345 });
    // An unused demo invitation lives as long as its link (7 days).
    const lives = new Date(user!.demo_expires_at!).getTime() - Date.now();
    expect(lives).toBeGreaterThan(6.9 * 86400_000);
    expect(lives).toBeLessThan(7.1 * 86400_000);
    // Only the token's hash is stored.
    const token = tokenOf(body.link);
    const stored = await db.all<{ token_hash: string }>('SELECT token_hash FROM account_invitations WHERE user_id = ?', user!.id);
    expect(stored).toEqual([{ token_hash: createHash('sha256').update(token).digest('hex') }]);
    expect(JSON.stringify(stored)).not.toContain(token);

    // No password yet: the account cannot sign in.
    expect((await login(email('alice'), '')).status).toBe(400);
    expect((await login(email('alice'), 'anything-at-all-123')).status).toBe(401);
  });

  it('refuses a second account for the same address, in any case', async () => {
    const first = await invite({ email: email('bob') });
    expect(first.status).toBe(200);
    const again = await invite({ email: email('BOB') });
    expect(again.status).toBe(409);
    expect((await invite({ email: 'not-an-address' })).status).toBe(400);
    expect((await invite({ email: email('carl'), role: 'admin' })).status).toBe(400);
  });

  it('on a demo: refused attempts leave the link usable; accepted, it signs in, works once and starts the account clock', async () => {
    process.env.DEMO_MODE = 'true';
    process.env.DEMO_ACCOUNT_TTL_DAYS = '30';
    const { link } = await (await invite({ email: email('dora') })).json() as { link: string };
    const token = tokenOf(link);

    const check = await post('/api/auth/invitation/check', { token });
    expect(check.status).toBe(200);
    expect(await check.json()).toMatchObject({ email: email('dora'), purpose: 'invite', termsRequired: true, termsVersion: DEMO_TERMS_VERSION });
    expect((await post('/api/auth/invitation/check', { token: 'x'.repeat(43) })).status).toBe(400);

    // Refusals before the claim: the link still works afterwards.
    expect((await accept(token)).status).toBe(400); // terms not accepted
    expect((await accept(token, { ...terms, termsVersion: '2000-01-01' })).status).toBe(400);
    expect((await accept(token, { ...terms, password: 'short' })).status).toBe(400);
    expect((await post('/api/auth/invitation/check', { token })).status).toBe(200);

    const ok = await accept(token, terms);
    expect(ok.status).toBe(200);
    const signedIn = await ok.json() as { user: { username: string; role: string }; token: string };
    expect(signedIn.user).toMatchObject({ username: email('dora'), role: 'analyst' });
    expect(ok.headers.get('set-cookie')).toMatch(/openexpert_session=/);
    expect((await fetch(`${base}/api/probe`, { headers: { authorization: `Bearer ${signedIn.token}` } })).status).toBe(200);

    const user = await row(email('dora'));
    expect(user!.terms_version).toBe(DEMO_TERMS_VERSION);
    const lives = new Date(user!.demo_expires_at!).getTime() - Date.now();
    expect(lives).toBeGreaterThan(29.9 * 86400_000);
    expect(lives).toBeLessThan(30.1 * 86400_000);

    // Once only.
    expect((await accept(token, terms)).status).toBe(400);
    expect((await post('/api/auth/invitation/check', { token })).status).toBe(400);
    // Signs in with the address, typed in any case.
    expect((await login(email('Dora').toUpperCase())).status).toBe(200);
  });

  it('a new link for an account with a password: the person chooses a new one, old password and sessions stop', async () => {
    process.env.DEMO_MODE = 'true';
    const { link } = await (await invite({ email: email('eve') })).json() as { link: string };
    const first = await (await accept(tokenOf(link), terms)).json() as { token: string };
    const before = await row(email('eve'));

    const res = await post(`/api/admin/users/${before!.id}/sign-in-link`, {}, 'admin');
    expect(res.status).toBe(200);
    const reset = await res.json() as { link: string; purpose: string };
    expect(reset.purpose).toBe('reset');
    // Terms already accepted at this version: not asked again.
    const check = await (await post('/api/auth/invitation/check', { token: tokenOf(reset.link) })).json() as { termsRequired: boolean };
    expect(check.termsRequired).toBe(false);

    const NEW = 'another-long-password';
    expect((await accept(tokenOf(reset.link), { password: NEW })).status).toBe(200);
    expect((await login(email('eve'))).status).toBe(401);
    expect((await login(email('eve'), NEW)).status).toBe(200);
    expect((await fetch(`${base}/api/probe`, { headers: { authorization: `Bearer ${first.token}` } })).status).toBe(401);
    // A reset keeps the account's expiry.
    const after = await row(email('eve'));
    expect(new Date(after!.demo_expires_at!).getTime()).toBe(new Date(before!.demo_expires_at!).getTime());
  });

  it('a newer link closes the older ones once either is used', async () => {
    const { link: one } = await (await invite({ email: email('finn') })).json() as { link: string };
    const id = (await row(email('finn')))!.id;
    const { link: two } = await (await post(`/api/admin/users/${id}/sign-in-link`, {}, 'admin')).json() as { link: string };
    expect((await accept(tokenOf(two))).status).toBe(200);
    expect((await accept(tokenOf(one), { password: 'a-third-long-password' })).status).toBe(400);
  });

  it('outside demo mode: no terms, no expiry', async () => {
    const { link } = await (await invite({ email: email('gus') })).json() as { link: string };
    const user = await row(email('gus'));
    expect(user!.demo_expires_at).toBeNull();
    expect(user!.monthly_token_budget).toBe(0);
    const check = await (await post('/api/auth/invitation/check', { token: tokenOf(link) })).json() as { termsRequired: boolean };
    expect(check.termsRequired).toBe(false);
    expect((await accept(tokenOf(link))).status).toBe(200);
    expect((await row(email('gus')))!.demo_expires_at).toBeNull();
  });

  it('no link for an account that signs in through single sign-on, nor for a switched-off one', async () => {
    await invite({ email: email('hal') });
    const id = (await row(email('hal')))!.id;
    await db.run(
      `INSERT INTO user_identities (id, user_id, provider, issuer, subject) VALUES (?, ?, 'oidc', ?, ?)`,
      `uid-${TAG}`, id, 'https://login.example.test/', `sub-${TAG}`,
    );
    expect((await post(`/api/admin/users/${id}/sign-in-link`, {}, 'admin')).status).toBe(400);
    await db.run('DELETE FROM user_identities WHERE user_id = ?', id);
    await db.run('UPDATE users SET disabled_at = NOW() WHERE id = ?', id);
    expect((await post(`/api/admin/users/${id}/sign-in-link`, {}, 'admin')).status).toBe(400);
  });

  it('a link on a switched-off account does not work', async () => {
    const { link } = await (await invite({ email: email('ida') })).json() as { link: string };
    await db.run('UPDATE users SET disabled_at = NOW() WHERE username = ?', email('ida'));
    expect((await post('/api/auth/invitation/check', { token: tokenOf(link) })).status).toBe(400);
    expect((await accept(tokenOf(link))).status).toBe(400);
  });

  // ── Sign-up with an email address (DEMO_SIGNUP_WITH_EMAIL) ──────────────────

  const signup = (body: Record<string, unknown>) =>
    post('/api/auth/demo-signup', { over18: true, acceptTerms: true, termsVersion: DEMO_TERMS_VERSION, code: `code-${TAG}`, password: PASSWORD, ...body });
  const emailSignupOn = () => {
    process.env.DEMO_MODE = 'true';
    process.env.DEMO_SIGNUP_CODE = `code-${TAG}`;
    process.env.DEMO_SIGNUP_WITH_EMAIL = 'true';
  };

  it('with DEMO_SIGNUP_WITH_EMAIL the address is the username, and it signs in at once', async () => {
    emailSignupOn();
    const res = await signup({ email: `  ${email('Jon').toUpperCase()} ` });
    expect(res.status).toBe(201);
    const user = await row(email('jon'));
    expect(user).toMatchObject({ email: email('jon'), role: 'analyst', display_name: `jon_${TAG}` });
    expect(user!.demo_expires_at).not.toBeNull();
    expect((await login(email('JON'))).status).toBe(200);
  });

  it('refuses a username, a non-address, and an address another account already has', async () => {
    emailSignupOn();
    expect((await signup({ username: `user_${TAG}` })).status).toBe(400);
    expect((await signup({ email: 'not-an-address' })).status).toBe(400);
    await invite({ email: email('kim') });
    const dup = await signup({ email: email('KIM') });
    expect(dup.status).toBe(409);
    expect((await dup.json() as { error: string }).error).toMatch(/already exists/);
  });

  it('negative control: without the switch, sign-up still takes a username and refuses an address', async () => {
    process.env.DEMO_MODE = 'true';
    process.env.DEMO_SIGNUP_CODE = `code-${TAG}`;
    expect((await signup({ email: email('lea') })).status).toBe(400);
    expect((await signup({ username: `lea_${TAG}` })).status).toBe(201);
    expect((await row(`lea_${TAG}`))!.email).toBeNull();
  });

  it('gives the administrator a group link with the invite code in the fragment; nothing outside a demo', async () => {
    emailSignupOn();
    const res = await fetch(`${base}/api/admin/demo-signup-link`, { headers: { 'x-test-user': 'admin' } });
    expect(await res.json()).toEqual({ link: `https://demo.example.test/#signup=code-${TAG}` });
    expect((await fetch(`${base}/api/admin/demo-signup-link`, { headers: { 'x-test-user': 'analyst' } })).status).toBe(403);
    delete process.env.DEMO_MODE;
    expect(await (await fetch(`${base}/api/admin/demo-signup-link`, { headers: { 'x-test-user': 'admin' } })).json()).toEqual({ link: null });
  });
});
