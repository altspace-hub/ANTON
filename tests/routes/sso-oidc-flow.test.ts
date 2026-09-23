/**
 * sso-oidc-flow.test.ts — single sign-on end to end, against PostgreSQL and a
 * fake OpenID provider shaped like Microsoft Entra ID.
 *
 * The provider is strict where Entra is strict: it signs RS256 ID tokens
 * (with oid + tid), and it refuses to redeem a code when the redirect_uri or
 * the PKCE verifier differs from the authorisation request. Before
 * 2026-09-23 no SSO sign-in could complete: the callback rebuilt the
 * redirect_uri from the request (without /api), which Entra refuses.
 *
 * Covered: first sign-in makes the account (keyed on oid + tid, role from the
 * directory); a changed email is the same person; a pre-SSO account is linked
 * once by email; a foreign tenant, a callback this browser did not start, a
 * switched-off account and a person without a mapped role are refused; the
 * provider's own refusal is passed on; an SSO account gets no password by
 * email; solo mode has no SSO routes. From the adversarial review: an
 * unverified address never links; removing the mapped role demotes; the
 * one-time code only works in the browser that finished the sign-in; an admin
 * cannot give an SSO account a password (and a refused PATCH changes nothing);
 * a password set behind the directory's back does not sign in.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHash, generateKeyPairSync, sign as rsaSign, randomUUID } from 'node:crypto';
import type { DatabaseAdapter } from '../../server/db/database.js';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

const TENANT = '9f8e7d6c-0000-4000-8000-00000000abcd';
const OTHER_TENANT = '11111111-0000-4000-8000-000000000000';
const CLIENT_ID = 'anton-test-client';
const CLIENT_SECRET = 'anton-test-client-secret';
const RUN = randomUUID().slice(0, 8);
const mail = (name: string): string => `ssotest.${name}.${RUN}@sso-test.invalid`;

// ── The fake identity provider ───────────────────────────────────────────────

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const JWK = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };

const b64url = (input: Buffer | string): string => Buffer.from(input).toString('base64url');
function signIdToken(payload: Record<string, unknown>): string {
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'test-key' }));
  const body = b64url(JSON.stringify(payload));
  return `${head}.${body}.${b64url(rsaSign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey))}`;
}

interface Grant { claims: Record<string, unknown>; challenge: string; nonce: string; redirectUri: string }
const grants = new Map<string, Grant>();
const tokenRequests: URLSearchParams[] = [];
let idpBase = '';
const issuer = (): string => `${idpBase}/${TENANT}/v2.0`;

const idp = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://idp');
  const json = (status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (req.method === 'GET' && url.pathname === `/${TENANT}/v2.0/.well-known/openid-configuration`) {
    json(200, {
      issuer: issuer(),
      authorization_endpoint: `${idpBase}/authorize`,
      token_endpoint: `${idpBase}/token`,
      jwks_uri: `${idpBase}/keys`,
      end_session_endpoint: `${idpBase}/logout`,
      response_types_supported: ['code'],
      subject_types_supported: ['pairwise'],
      id_token_signing_alg_values_supported: ['RS256'],
      token_endpoint_auth_methods_supported: ['client_secret_post'],
      scopes_supported: ['openid', 'profile', 'email'],
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/keys') { json(200, { keys: [JWK] }); return; }
  if (req.method === 'POST' && url.pathname === '/token') {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const p = new URLSearchParams(raw);
      tokenRequests.push(p);
      const grant = grants.get(p.get('code') ?? '');
      const verifier = p.get('code_verifier') ?? '';
      if (!grant
        || p.get('client_id') !== CLIENT_ID || p.get('client_secret') !== CLIENT_SECRET
        || p.get('redirect_uri') !== grant.redirectUri
        || createHash('sha256').update(verifier).digest('base64url') !== grant.challenge) {
        json(400, { error: 'invalid_grant' });
        return;
      }
      grants.delete(p.get('code') ?? '');
      const now = Math.floor(Date.now() / 1000);
      json(200, {
        access_token: 'access-token', token_type: 'Bearer', expires_in: 3600,
        id_token: signIdToken({ iss: issuer(), aud: CLIENT_ID, iat: now, exp: now + 600, nonce: grant.nonce, ...grant.claims }),
      });
    });
    return;
  }
  json(404, { error: 'not found' });
});

// ── ANTON under test ─────────────────────────────────────────────────────────

let db: DatabaseAdapter;
let app: http.Server;
let appBase = '';
const saved: Record<string, string | undefined> = {};
const ENV_KEYS = ['DEPLOYMENT_MODE', 'JWT_SECRET', 'OIDC_ISSUER_URL', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'OIDC_REDIRECT_URI',
  'OIDC_ROLE_MAP', 'OIDC_ALLOWED_TENANT_IDS', 'OIDC_REQUIRE_ROLE', 'OIDC_DEFAULT_ROLE', 'APP_PUBLIC_URL', 'BASE_URL', 'JWT_EXPIRY'];

const listen = (server: http.Server): Promise<string> => new Promise((resolve) => {
  server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`));
});

d('single sign-on (OIDC) end to end', () => {
  beforeAll(async () => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    idpBase = await listen(idp);

    const expressApp = express();
    app = http.createServer(expressApp);
    appBase = await listen(app);

    Object.assign(process.env, {
      DEPLOYMENT_MODE: 'team',
      JWT_SECRET: 'x'.repeat(48),
      OIDC_ISSUER_URL: issuer(),
      OIDC_CLIENT_ID: CLIENT_ID,
      OIDC_CLIENT_SECRET: CLIENT_SECRET,
      OIDC_REDIRECT_URI: `${appBase}/api/auth/oidc/callback`,
      OIDC_ROLE_MAP: 'Anton.Admin=admin,Anton.Analyst=analyst,Anton.Viewer=viewer',
      OIDC_ALLOWED_TENANT_IDS: TENANT,
      JWT_EXPIRY: '8h',
    });
    delete process.env.OIDC_REQUIRE_ROLE;
    delete process.env.APP_PUBLIC_URL;
    delete process.env.BASE_URL;

    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });
    const { createAuthRoutes } = await import('../../server/routes/auth.js');
    const { createAuthMiddleware } = await import('../../server/middleware/auth.js');
    const { createAdminRoutes } = await import('../../server/routes/admin.js');
    // The production server's limiters and CSRF gate are not what this file tests;
    // a generous limiter and a plain cookie reader stand in for them.
    expressApp.use(rateLimit({ windowMs: 60_000, limit: 100_000 }));
    expressApp.use((req, _res, next) => {
      const cookies: Record<string, string> = {};
      for (const part of (req.headers.cookie ?? '').split(';')) {
        const eq = part.indexOf('=');
        if (eq > 0) cookies[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
      }
      (req as { cookies?: Record<string, string> }).cookies = cookies;
      next();
    });
    expressApp.use(express.json());
    expressApp.use('/api', await createAuthRoutes(db));
    expressApp.use('/api', await createAuthMiddleware(db));
    expressApp.get('/api/whoami', (req, res) => { res.json(req.user); });
    expressApp.use('/api', await createAdminRoutes(db));
  });

  afterAll(async () => {
    if (db) {
      await db.run(`DELETE FROM users WHERE email LIKE ? OR username LIKE ?`, `%.${RUN}@sso-test.invalid`, `ssotest.%${RUN}%`);
      await db.run(`DELETE FROM login_attempts WHERE username LIKE ?`, `ssotest.%.${RUN}%`);
      await db.close();
    }
    for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    await new Promise<void>((r) => app?.close(() => r()));
    await new Promise<void>((r) => idp.close(() => r()));
  });

  // ── the browser ────────────────────────────────────────────────────────────

  interface Started { state: string; nonce: string; challenge: string; redirectUri: string; cookie: string }

  async function start(): Promise<Started> {
    const res = await fetch(`${appBase}/api/auth/oidc/start`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get('location') ?? '');
    expect(`${to.origin}${to.pathname}`).toBe(`${idpBase}/authorize`);
    expect(to.searchParams.get('code_challenge_method')).toBe('S256');
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith('anton_oidc_state='))?.split(';')[0] ?? '';
    return {
      state: to.searchParams.get('state') ?? '',
      nonce: to.searchParams.get('nonce') ?? '',
      challenge: to.searchParams.get('code_challenge') ?? '',
      redirectUri: to.searchParams.get('redirect_uri') ?? '',
      cookie,
    };
  }

  /** The person signs in at the provider, which sends them back with a code. */
  function approve(s: Started, claims: Record<string, unknown>): string {
    const code = randomUUID();
    grants.set(code, { claims: { sub: `pairwise-${randomUUID()}`, ...claims }, challenge: s.challenge, nonce: s.nonce, redirectUri: s.redirectUri });
    return code;
  }

  async function callbackWithCookies(query: string, cookie?: string): Promise<{ landing: URL; binder: string }> {
    const res = await fetch(`${appBase}/api/auth/oidc/callback?${query}`, { redirect: 'manual', headers: cookie ? { cookie } : {} });
    expect(res.status).toBe(302);
    const binder = res.headers.getSetCookie().find((c) => c.startsWith('anton_auth_binder='))?.split(';')[0] ?? '';
    return { landing: new URL(res.headers.get('location') ?? '', 'http://landing'), binder };
  }
  async function callback(query: string, cookie?: string): Promise<URL> {
    return (await callbackWithCookies(query, cookie)).landing;
  }

  /** The whole round trip; the session token, or the auth_error. */
  async function signIn(claims: Record<string, unknown>): Promise<{ token?: string; error?: string; sessionCookie?: string }> {
    const s = await start();
    const { landing, binder } = await callbackWithCookies(`code=${approve(s, claims)}&state=${encodeURIComponent(s.state)}`, s.cookie);
    const error = landing.searchParams.get('auth_error');
    if (error) return { error };
    const code = landing.searchParams.get('auth_code');
    const res = await fetch(`${appBase}/api/auth/exchange/${code}`, { headers: { cookie: binder } });
    const body = await res.json() as { token?: string };
    const sessionCookie = res.headers.getSetCookie().find((c) => c.startsWith('openexpert_session='));
    return { token: body.token, sessionCookie };
  }

  const whoami = (token: string) => fetch(`${appBase}/api/whoami`, { headers: { Authorization: `Bearer ${token}` } });
  const person = (name: string, roles: string[] = ['Anton.Analyst'], extra: Record<string, unknown> = {}) => ({
    oid: `oid-${name}-${RUN}`, tid: TENANT, email: mail(name), email_verified: true, name: `SSO ${name}`, roles, ...extra,
  });

  // ── cases ──────────────────────────────────────────────────────────────────

  it('a first sign-in makes the account — keyed on oid + tid, role from the directory, redirect_uri as registered', async () => {
    const r = await signIn(person('ada'));
    expect(r.error).toBeUndefined();
    expect(r.token).toBeTruthy();
    expect(r.sessionCookie).toMatch(/HttpOnly/i);

    const me = await (await whoami(r.token!)).json() as { id: string; username: string; role: string };
    expect(me.role).toBe('analyst');
    expect(me.username).toBe(`ssotest.ada.${RUN}`);

    const identity = await db.get<{ subject: string; tenant_id: string; user_id: string }>(
      'SELECT subject, tenant_id, user_id FROM user_identities WHERE user_id = ?', me.id);
    expect(identity).toMatchObject({ subject: `oid-ada-${RUN}`, tenant_id: TENANT });

    const sent = tokenRequests[tokenRequests.length - 1];
    expect(sent.get('redirect_uri')).toBe(`${appBase}/api/auth/oidc/callback`);
    expect(sent.get('code_verifier')).toBeTruthy();
  });

  it('negative control — the provider does refuse a code redeemed with another redirect_uri', async () => {
    const s = await start();
    const code = approve(s, person('control'));
    const res = await fetch(`${idpBase}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      // What the old callback sent: the path without /api.
      body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
        redirect_uri: `${appBase}/auth/oidc/callback`, code_verifier: 'whatever' }),
    });
    expect(res.status).toBe(400);
  });

  it('the same person with a new email is the same account', async () => {
    const first = await signIn(person('grace'));
    const again = await signIn(person('grace', ['Anton.Analyst'], { email: mail('grace-renamed') }));
    const a = await (await whoami(first.token!)).json() as { id: string };
    const b = await (await whoami(again.token!)).json() as { id: string };
    expect(b.id).toBe(a.id);
    const n = await db.get<{ n: number }>('SELECT COUNT(*)::int AS n FROM user_identities WHERE subject = ?', `oid-grace-${RUN}`);
    expect(n?.n).toBe(1);
  });

  it('a member token without the email claim still signs in', async () => {
    const r = await signIn({ oid: `oid-noemail-${RUN}`, tid: TENANT, preferred_username: mail('noemail'), roles: ['Anton.Viewer'] });
    expect(r.error).toBeUndefined();
    const me = await (await whoami(r.token!)).json() as { role: string };
    expect(me.role).toBe('viewer');
  });

  it('an account made before SSO is linked once by email — a second directory identity is not', async () => {
    const localId = randomUUID();
    await db.run('INSERT INTO users (id, username, email, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?, ?)',
      localId, `ssotest.boss.${RUN}`, mail('boss'), 'x', 'admin', 'Boss');
    const linked = await signIn(person('boss', ['Anton.Admin']));
    expect((await (await whoami(linked.token!)).json() as { id: string; role: string })).toMatchObject({ id: localId, role: 'admin' });
    // From now on the directory is the way in.
    expect((await db.get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', localId))?.password_hash).toBe('');

    const other = await signIn(person('boss', ['Anton.Viewer'], { oid: `oid-impostor-${RUN}` }));
    const otherMe = await (await whoami(other.token!)).json() as { id: string; role: string };
    expect(otherMe.id).not.toBe(localId);
    expect(otherMe.role).toBe('viewer');
  });

  it('a directory outside the allow-list is refused and nothing is made', async () => {
    const r = await signIn(person('foreign', ['Anton.Admin'], { tid: OTHER_TENANT }));
    expect(r.error).toBe('tenant_not_allowed');
    expect(await db.get('SELECT id FROM users WHERE email = ?', mail('foreign'))).toBeUndefined();
  });

  it('a callback this browser did not start is refused before the code is redeemed', async () => {
    const s = await start();
    const code = approve(s, person('csrf'));
    const before = tokenRequests.length;
    expect((await callback(`code=${code}&state=${encodeURIComponent(s.state)}`)).searchParams.get('auth_error')).toBe('invalid_state');
    const other = await start();
    expect((await callback(`code=${code}&state=${encodeURIComponent(s.state)}`, other.cookie)).searchParams.get('auth_error')).toBe('invalid_state');
    expect(tokenRequests.length).toBe(before);
  });

  it("the provider's refusal is passed on (not assigned to the application)", async () => {
    const s = await start();
    const landing = await callback(`error=access_denied&error_description=AADSTS50105&state=${encodeURIComponent(s.state)}`, s.cookie);
    expect(landing.searchParams.get('auth_error')).toBe('sso_denied');
  });

  it('a switched-off account loses its open session and cannot sign in again', async () => {
    const r = await signIn(person('leaver'));
    const me = await (await whoami(r.token!)).json() as { id: string };
    expect((await whoami(r.token!)).status).toBe(200);
    await db.run('UPDATE users SET disabled_at = NOW() WHERE id = ?', me.id);
    expect((await whoami(r.token!)).status).toBe(401);
    expect((await signIn(person('leaver'))).error).toBe('account_disabled');
  });

  it('directory roles are applied at every sign-in', async () => {
    const r1 = await signIn(person('mover', ['Anton.Viewer']));
    expect((await (await whoami(r1.token!)).json() as { role: string }).role).toBe('viewer');
    const r2 = await signIn(person('mover', ['Anton.Admin', 'Anton.Viewer']));
    expect((await (await whoami(r2.token!)).json() as { role: string }).role).toBe('admin');
  });

  it('OIDC_REQUIRE_ROLE refuses a person the directory grants no mapped role', async () => {
    process.env.OIDC_REQUIRE_ROLE = 'true';
    try {
      expect((await signIn(person('norole', ['Something.Else']))).error).toBe('no_role');
      expect(await db.get('SELECT id FROM users WHERE email = ?', mail('norole'))).toBeUndefined();
    } finally {
      delete process.env.OIDC_REQUIRE_ROLE;
    }
  });

  it('an unverified address never links to an existing account', async () => {
    const localId = randomUUID();
    await db.run('INSERT INTO users (id, username, email, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?, ?)',
      localId, `ssotest.unverified.${RUN}`, mail('unverified'), 'x', 'admin', 'Unverified');
    const r = await signIn(person('unverified', ['Anton.Viewer'], { email_verified: false }));
    const me = await (await whoami(r.token!)).json() as { id: string; role: string };
    expect(me.id).not.toBe(localId);
    expect(me.role).toBe('viewer');
  });

  it('removing the mapped role in the directory demotes at the next sign-in', async () => {
    const r1 = await signIn(person('demoted', ['Anton.Admin']));
    expect((await (await whoami(r1.token!)).json() as { role: string }).role).toBe('admin');
    const r2 = await signIn(person('demoted', []));
    expect((await (await whoami(r2.token!)).json() as { role: string }).role).toBe('analyst'); // OIDC_DEFAULT_ROLE
    // The earlier session reads the role live, so it is demoted too.
    expect((await (await whoami(r1.token!)).json() as { role: string }).role).toBe('analyst');
  });

  it('the one-time code only works in the browser that finished the sign-in', async () => {
    const s = await start();
    const { landing, binder } = await callbackWithCookies(`code=${approve(s, person('binder'))}&state=${encodeURIComponent(s.state)}`, s.cookie);
    const code = landing.searchParams.get('auth_code');
    expect(binder).toMatch(/^anton_auth_binder=/);
    // Another browser (no binder) is refused, and the code is spent.
    expect((await fetch(`${appBase}/api/auth/exchange/${code}`)).status).toBe(400);
    expect((await fetch(`${appBase}/api/auth/exchange/${code}`, { headers: { cookie: binder } })).status).toBe(400);
  });

  it('an administrator cannot give an SSO account a password, and a bad request changes nothing', async () => {
    const admin = await signIn(person('chief', ['Anton.Admin']));
    const target = await signIn(person('target', ['Anton.Analyst']));
    const targetId = (await (await whoami(target.token!)).json() as { id: string }).id;
    const patch = (body: unknown) => fetch(`${appBase}/api/admin/users/${targetId}`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    expect((await patch({ password: 'Xyz12345!' })).status).toBe(400);
    expect((await db.get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', targetId))?.password_hash).toBe('');
    // A refused field must not have applied another.
    expect((await patch({ disabled: true, role: 'superuser' })).status).toBe(400);
    expect((await whoami(target.token!)).status).toBe(200);
    // The address is editable (how an admin resolves ambiguous_email).
    expect((await patch({ email: 'not-an-address' })).status).toBe(400);
    expect((await patch({ email: mail('target-new') })).status).toBe(200);
    expect((await db.get<{ email: string }>('SELECT email FROM users WHERE id = ?', targetId))?.email).toBe(mail('target-new'));
  });

  it('an SSO account cannot sign in with a password, even one set behind the directory\'s back', async () => {
    const r = await signIn(person('backdoor'));
    const me = await (await whoami(r.token!)).json() as { id: string; username: string };
    const bcrypt = await import('bcryptjs');
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', await bcrypt.default.hash('Secret123!', 4), me.id);
    const login = await fetch(`${appBase}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: me.username, password: 'Secret123!' }),
    });
    expect(login.status).toBe(401);
  });

  it('an SSO account gets no password by email and cannot use one', async () => {
    const r = await signIn(person('nopass'));
    const me = await (await whoami(r.token!)).json() as { id: string; username: string };
    const forgot = await fetch(`${appBase}/api/auth/forgot-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: mail('nopass') }),
    });
    expect(forgot.status).toBe(200); // same answer as for anyone
    expect(await db.get('SELECT id FROM password_reset_tokens WHERE user_id = ?', me.id)).toBeUndefined();

    const login = await fetch(`${appBase}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: me.username, password: '' }),
    });
    expect(login.status).not.toBe(200);
  });
});

d('single sign-on in solo mode', () => {
  it('has no SSO routes — solo mode has one user and no sign-in', async () => {
    const prev = process.env.DEPLOYMENT_MODE;
    process.env.DEPLOYMENT_MODE = 'solo';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(48);
    try {
      const { createAuthRoutes } = await import('../../server/routes/auth.js');
      const soloApp = express();
      soloApp.use('/api', await createAuthRoutes({} as DatabaseAdapter));
      const server = http.createServer(soloApp);
      const base = await listen(server);
      try {
        expect((await fetch(`${base}/api/auth/oidc/start`, { redirect: 'manual' })).status).toBe(404);
        expect((await fetch(`${base}/api/auth/oidc/callback?state=x`, { redirect: 'manual' })).status).toBe(404);
      } finally {
        await new Promise<void>((r) => server.close(() => r()));
      }
    } finally {
      if (prev === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = prev;
    }
  });
});
