import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import type { DatabaseAdapter } from '../db/database.js';

import {
  generateToken, sessionTtlMs, LIVE_ACCOUNT_SQL, sessionEndedOutsideDemo, type AuthUser,
} from '../middleware/auth.js';
import { sendPasswordResetEmail } from '../services/email.js';
import { logSecurityEvent } from '../services/security-logger.js';
import * as oidcClient from 'openid-client';
import { getUserBudgetStatus } from '../services/budget-manager.js';
import { safeError } from '../lib/error-response.js';
import { validate } from '../lib/validate.js';
import { LoginSchema, ForgotPasswordSchema, ResetPasswordSchema, RegisterSchema } from '../lib/schemas.js';
import {
  isDemoMode, demoSignupPolicy, demoAccountTtlDays, demoUserMonthlyTokens,
  demoMaxSignupsPerDay, createDemoSignupLimiter,
} from '../middleware/demo-mode.js';
import {
  readOidcSettings, oidcSettingsProblems, identityFromClaims, tenantAllowed,
  provisionOidcUser, hasSsoIdentity, SsoRefusedError, type OidcSettings,
} from '../services/oidc-sso.js';
import { invitationStillValid } from './project-collaboration.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

// ── Sessions ──────────────────────────────────────────────────────────────────

const isSecureCookie = (): boolean => process.env.NODE_ENV === 'production' || process.env.HTTPS === 'true';

/** A signed-in session: the JWT, its user_sessions row (which logout and a
 *  disabled account end) and the last-login stamp. One lifetime for both,
 *  from JWT_EXPIRY — cut short at notAfter (a demo account's expiry), so no
 *  session outlives its account. */
async function issueSession(db: DatabaseAdapter, user: AuthUser, notAfter?: Date | null): Promise<string> {
  const token = generateToken(user);
  const until = Math.min(Date.now() + sessionTtlMs(), notAfter ? notAfter.getTime() : Infinity);
  const expiresAt = new Date(until).toISOString();
  await db.run('INSERT INTO user_sessions (token, user_id, expires_at) VALUES (?, ?, ?)', token, user.id, expiresAt);
  await db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', user.id);
  return token;
}

/** SEC-05: the session also rides in an httpOnly cookie — downloads, EventSource
 *  and plain links cannot send the Authorization header. */
function setSessionCookie(res: Response, token: string): void {
  res.cookie('openexpert_session', token, {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: 'strict',
    maxAge: sessionTtlMs(),
    path: '/',
  });
}

/** Where a link in an email, or the browser after single sign-on, should go:
 *  APP_PUBLIC_URL (then BASE_URL) when set — never the request's Host header,
 *  which the sender controls. The request is the fallback on a dev machine. */
function publicBaseUrl(req: { protocol: string; get(name: string): string | undefined }): string {
  const configured = (process.env.APP_PUBLIC_URL || process.env.BASE_URL || '').trim().replace(/\/+$/, '');
  return configured || `${req.protocol}://${req.get('host')}`;
}

// ── Enterprise SSO (OpenID Connect) ───────────────────────────────────────────

// Discovery is cached per issuer + client, so a changed .env takes effect.
let oidcConfigCache: { key: string; config: oidcClient.Configuration } | null = null;

async function getOidcConfig(settings: OidcSettings, refresh = false): Promise<oidcClient.Configuration> {
  const key = `${settings.issuerUrl}|${settings.clientId}|${settings.clientSecret ? 'secret' : 'public'}`;
  if (!refresh && oidcConfigCache?.key === key) return oidcConfigCache.config;
  const issuerUrl = new URL(settings.issuerUrl);
  const clientAuth = settings.clientSecret
    ? oidcClient.ClientSecretPost(settings.clientSecret)
    : oidcClient.None();
  // Plain http is refused by openid-client, rightly; allowed for a loopback
  // issuer only, which is a test or a local identity provider, never Entra.
  const loopback = issuerUrl.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(issuerUrl.hostname);
  const config = await oidcClient.discovery(
    issuerUrl, settings.clientId, {}, clientAuth,
    loopback ? { execute: [oidcClient.allowInsecureRequests] } : undefined,
  );
  oidcConfigCache = { key, config };
  return config;
}

/** The Entra error code in an OAuth error description (" AADSTS50105"), or
 *  ''. The description itself can carry directory detail and is not logged. */
function aadstsCode(description: string | undefined): string {
  const m = description ? /AADSTS\d{4,}/.exec(description) : null;
  return m ? ` ${m[0]}` : '';
}

/** The browser's half of the flow: the state it started with, checked on the
 *  way back, so a callback link cannot sign somebody into another person's
 *  account (login CSRF). SameSite=Lax — the callback is a top-level GET
 *  navigation from the identity provider, which Lax cookies accompany. */
const OIDC_STATE_COOKIE = 'anton_oidc_state';
const OIDC_COOKIE_PATH = '/api/auth/oidc';

// In-memory state store — one process. A restart during a sign-in answers
// invalid_state and the person signs in again.
const oidcStateStore = new Map<string, { nonce: string; codeVerifier: string; fromSchool: boolean; createdAt: number }>();
const OIDC_STATE_CAP = 5_000;

// Clean up stale state entries older than 10 minutes
function pruneOidcStates() {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [key, val] of oidcStateStore.entries()) {
    if (val.createdAt < cutoff) oidcStateStore.delete(key);
  }
}

// Short-lived one-time exchange codes for OAuth redirects (C2 fix).
// JWT is never placed in the redirect URL — we store it here and the client
// exchanges the opaque code for the token via GET /api/auth/exchange/:code.
//
// The code is also bound to the browser that finished the sign-in: a random
// binder goes into an httpOnly cookie on that browser and its hash is stored
// with the code. Without it the code was a bearer value for 60 seconds, and a
// colleague lured to /api/auth/exchange/<code> was signed into the account
// that produced it (login CSRF) — the exchange also sets the session cookie.
const authCodeStore = new Map<string, { token: string; expiresAt: number; binderHash: string }>();
const EXCHANGE_BINDER_COOKIE = 'anton_auth_binder';
const EXCHANGE_COOKIE_PATH = '/api/auth/exchange';
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

function createExchangeCode(res: Response, token: string, secure: boolean): string {
  // Prune expired codes first
  const now = Date.now();
  for (const [key, val] of authCodeStore.entries()) {
    if (val.expiresAt < now) authCodeStore.delete(key);
  }
  const code = randomBytes(32).toString('hex');
  const binder = randomBytes(32).toString('hex');
  authCodeStore.set(code, { token, expiresAt: now + 60_000, binderHash: sha256(binder) }); // 60-second TTL
  res.cookie(EXCHANGE_BINDER_COOKIE, binder, {
    httpOnly: true, secure, sameSite: 'lax', maxAge: 60_000, path: EXCHANGE_COOKIE_PATH,
  });
  return code;
}

/** Equal strings, compared in constant time (an invite code, an OAuth state). */
function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

// ── Google / GitHub state ─────────────────────────────────────────────────────
//
// The state these flows send used to be '' or 'school', so a callback link
// carrying the attacker's own authorisation code signed the victim's browser
// into the attacker's account (login CSRF). Now it is a random nonce, also
// kept in an httpOnly cookie on the browser that started the sign-in, and the
// callback accepts only a state equal to that cookie. SameSite=Lax: the
// callback is a top-level GET navigation from the provider.
const OAUTH_STATE_COOKIE = 'anton_oauth_state';
const OAUTH_COOKIE_PATH = '/api/auth';

function startOAuthState(res: Response, fromSchool: boolean): string {
  const state = `${randomBytes(24).toString('hex')}${fromSchool ? '.school' : ''}`;
  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true, secure: isSecureCookie(), sameSite: 'lax', maxAge: 10 * 60 * 1000, path: OAUTH_COOKIE_PATH,
  });
  return state;
}

/** The callback's state against the cookie. The cookie is cleared either way: a state is used once. */
function checkOAuthState(req: Request, res: Response): { ok: boolean; fromSchool: boolean } {
  const cookie = (req as { cookies?: Record<string, string> }).cookies?.[OAUTH_STATE_COOKIE];
  res.clearCookie(OAUTH_STATE_COOKIE, { path: OAUTH_COOKIE_PATH });
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const ok = !!state && typeof cookie === 'string' && sameSecret(state, cookie);
  return { ok, fromSchool: ok && state.endsWith('.school') };
}

/** Where the provider sends the browser back. The state cookie belongs to this host. */
function oauthCallbackUrl(provider: 'google' | 'github'): string {
  return `${process.env.BASE_URL || 'http://localhost:3001'}/api/auth/${provider}/callback`;
}

/**
 * Started on another host name than the one the provider returns to, the
 * callback would never see the state cookie — so the sign-in starts over on
 * that host (as /auth/oidc/start does). Null when this is the right host.
 *
 * The name is req.hostname: it honours a trusted proxy's X-Forwarded-Host and
 * leaves the port out, as a cookie does. Behind a proxy that passes neither
 * the public Host nor X-Forwarded-Host every request looked like the wrong
 * host, and the browser was sent round in a loop (ERR_TOO_MANY_REDIRECTS). So
 * a restarted request carries ?restarted=1 and is never restarted again: at
 * worst the callback answers invalid_state.
 */
function restartOnCallbackHost(req: Request, provider: 'google' | 'github'): string | null {
  const query = req.query as { from?: string; restarted?: string };
  if (query.restarted !== undefined) return null;
  const callback = new URL(oauthCallbackUrl(provider));
  const host = req.hostname;
  if (!host || host.toLowerCase() === callback.hostname.toLowerCase()) return null;
  const params = new URLSearchParams();
  if (query.from === 'school') params.set('from', 'school');
  params.set('restarted', '1');
  return `${callback.origin}/api/auth/${provider}?${params}`;
}

/** POST /api/auth/demo-signup — username and password as elsewhere (RegisterSchema), plus the invite code. */
const DemoSignupSchema = RegisterSchema.pick({ username: true, password: true }).extend({
  code: z.string().max(200).optional(),
});

/** Names a visitor may not take: they read as the instance speaking. */
const RESERVED_DEMO_USERNAMES = new Set(['admin', 'administrator', 'root', 'solo', 'system', 'anton', 'openexpert', 'support', 'owner']);

export async function createAuthRoutes(db: DatabaseAdapter) {
  const router = Router();
  const IS_TEAM_MODE = process.env.DEPLOYMENT_MODE === 'team';

  // POST /api/auth/login
  router.post('/auth/login', validate(LoginSchema), async (req, res) => {
    if (!IS_TEAM_MODE) {
      res.json({ user: { id: 'solo', username: 'solo', role: 'admin' }, token: 'solo-mode' });
      return;
    }
    const { username, password } = req.body as { username: string; password: string };
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

    // Check for too many recent failed attempts (account lockout)
    const recentFails = await db.get(`
      SELECT COUNT(*) as count FROM login_attempts
      WHERE username = ? AND success = 0 AND attempted_at > NOW() - INTERVAL '15 minutes'
    `, username) as { count: number };

    if (recentFails.count >= 5) {
      logSecurityEvent(db, {
        eventType: 'failed_login',
        userId: username,
        ipAddress,
        details: `Account locked due to ${recentFails.count} failed login attempts`,
        severity: 'high',
      });
      res.status(429).json({ error: 'Account temporarily locked due to too many failed attempts. Try again in 15 minutes.' });
      return;
    }

    const user = await db.get('SELECT * FROM users WHERE username = ?', username) as Record<string, unknown> | undefined;

    if (!user) {
      // Record failed attempt
      await db.run('INSERT INTO login_attempts (username, ip_address, success) VALUES (?, ?, 0)', username, ipAddress);
      logSecurityEvent(db, {
        eventType: 'failed_login',
        ipAddress,
        details: `Login attempt for non-existent user: ${username}`,
        severity: 'medium',
      });
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // An SSO-provisioned account has no password (''), which bcrypt never
    // matches — it signs in through the directory or not at all.
    // And an account with an SSO identity has no password even if one was set
    // before it was linked or through the API: the directory is its only way in.
    const valid = typeof user.password_hash === 'string' && user.password_hash !== ''
      && !(await hasSsoIdentity(db, user.id as string))
      && await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      // Record failed attempt
      await db.run('INSERT INTO login_attempts (username, ip_address, success) VALUES (?, ?, 0)', username, ipAddress);
      logSecurityEvent(db, {
        eventType: 'failed_login',
        userId: user.id as string,
        ipAddress,
        details: `Invalid password for user: ${username}`,
        severity: 'medium',
      });
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // ── Second factor ──────────────────────────────────────────────────────
    //
    // Runs after the password check and BEFORE any token is issued: a factor checked
    // after the session exists is not a factor. Until 2026-09 this was missing
    // entirely — /auth/mfa/* could not even be reached to enrol (see
    // createAuthMfaRoutes), and login never read users.mfa_enabled, so an account that
    // somehow had MFA on still logged in with the password alone.
    //
    // Only accounts that opted in are affected: mfa_enabled defaults to 0 and there was
    // no write path before the enrolment routes were mounted, so no existing row here
    // changes behaviour.
    const mfaOn = user.mfa_enabled === true || Number(user.mfa_enabled) === 1;
    if (mfaOn) {
      const { mfaToken } = req.body as { mfaToken?: string };
      const secret = typeof user.mfa_secret === 'string' ? user.mfa_secret : null;
      const failMfa = async (message: string, detail: string) => {
        // Recorded as a failed attempt so the 5-in-15-minutes lockout above also caps
        // code guessing; otherwise MFA would be the one unthrottled credential.
        await db.run('INSERT INTO login_attempts (username, ip_address, success) VALUES (?, ?, 0)', username, ipAddress);
        logSecurityEvent(db, {
          eventType: 'failed_login', userId: user.id as string, ipAddress,
          details: detail, severity: 'medium',
        });
        res.status(401).json({ error: message, mfaRequired: true });
      };
      if (!secret) {
        // mfa_enabled with no secret cannot be verified. Fail closed: treating it as
        // "no MFA" would make clearing the secret column a bypass.
        await failMfa('MFA is enabled but not fully set up — ask an administrator to reset it', `MFA enabled without a secret for user: ${username}`);
        return;
      }
      if (!mfaToken) {
        await failMfa('MFA code required', `MFA code missing for user: ${username}`);
        return;
      }
      const speakeasy = await import('speakeasy');
      const mfaOk = speakeasy.default.totp.verify({
        secret, encoding: 'base32', token: mfaToken, window: 1, // 30s clock drift
      });
      if (!mfaOk) {
        await failMfa('Invalid MFA code', `Invalid MFA code for user: ${username}`);
        return;
      }
    }

    // A switched-off account: the right password is not enough. Checked after the
    // password, so the answer does not tell a guesser which accounts exist.
    if (user.disabled_at) {
      logSecurityEvent(db, {
        eventType: 'unauthorized_access', userId: user.id as string, ipAddress,
        details: 'Sign-in refused: account disabled', severity: 'medium',
      });
      res.status(403).json({ error: 'This account has been switched off. Ask an administrator.' });
      return;
    }

    // A demo account (migration 289) signs in only while the server is a demo
    // and the account has not expired; its session ends when the account does.
    const demoExpiresAt = user.demo_expires_at ? new Date(user.demo_expires_at as string | Date) : null;
    if (demoExpiresAt && (!isDemoMode() || !(demoExpiresAt.getTime() > Date.now()))) {
      logSecurityEvent(db, {
        eventType: 'unauthorized_access', userId: user.id as string, ipAddress,
        details: isDemoMode() ? 'Sign-in refused: demo account expired' : 'Sign-in refused: demo account outside demo mode',
        severity: 'low',
      });
      res.status(403).json({ error: 'This demo account has expired.' });
      return;
    }

    // Record successful attempt
    await db.run('INSERT INTO login_attempts (username, ip_address, success) VALUES (?, ?, 1)', username, ipAddress);

    const authUser = {
      id: user.id as string,
      username: user.username as string,
      role: user.role as 'admin' | 'analyst' | 'viewer',
      display_name: user.display_name as string | undefined,
    };
    const token = await issueSession(db, authUser, demoExpiresAt);

    // Auto-accept any pending project invitations for this email
    if (typeof user.email === 'string' && user.email) void acceptPendingInvitations(db, user.id as string, user.email);

    setSessionCookie(res, token);

    // Also return token in body for backward compatibility with existing clients
    res.json({ user: authUser, token });
  });

  // POST /api/auth/demo-signup — a visitor makes their own account on a demo
  // server (DEMO_MODE=true, team mode). No email is asked for. The account is
  // an analyst with a small monthly token budget; it expires after
  // DEMO_ACCOUNT_TTL_DAYS, when services/demo-retention.ts deletes it and
  // everything it wrote. Throttled per IP (every attempt counts) and capped
  // per day instance-wide; the invite code is DEMO_SIGNUP_CODE.
  const demoSignupLimiter = createDemoSignupLimiter();
  router.post('/auth/demo-signup', demoSignupLimiter, validate(DemoSignupSchema), async (req, res) => {
    if (!IS_TEAM_MODE || !isDemoMode()) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const { username, password, code } = req.body as z.infer<typeof DemoSignupSchema>;
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const policy = demoSignupPolicy();
    if (!policy.open) {
      res.status(403).json({ error: 'Sign-up is closed on this demo.' });
      return;
    }
    if (policy.code !== null && !sameSecret((code ?? '').trim(), policy.code)) {
      logSecurityEvent(db, {
        eventType: 'failed_login', ipAddress, details: 'Demo sign-up refused: wrong invite code', severity: 'low',
      });
      res.status(403).json({ error: 'That invite code is not valid.' });
      return;
    }
    if (RESERVED_DEMO_USERNAMES.has(username.toLowerCase())) {
      res.status(409).json({ error: 'That username is not available. Choose another.' });
      return;
    }
    try {
      const cap = demoMaxSignupsPerDay();
      if (cap > 0) {
        const today = await db.get<{ n: number | string }>(
          `SELECT COUNT(*) AS n FROM users WHERE demo_expires_at IS NOT NULL AND created_at > NOW() - INTERVAL '1 day'`,
        );
        if (Number(today?.n ?? 0) >= cap) {
          res.status(429).json({ error: 'Today\'s demo sign-ups are full. Please try again tomorrow.' });
          return;
        }
      }
      // Case-insensitively unique: 'Alice' and 'alice' would be two people who look like one.
      const taken = await db.get('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', username);
      if (taken) {
        res.status(409).json({ error: 'That username is taken. Choose another.' });
        return;
      }

      const id = randomUUID();
      const expiresAt = new Date(Date.now() + demoAccountTtlDays() * 24 * 60 * 60 * 1000);
      const hash = await bcrypt.hash(password, 10);
      await db.run(
        `INSERT INTO users (id, username, password_hash, role, display_name, monthly_token_budget, demo_expires_at)
         VALUES (?, ?, ?, 'analyst', ?, ?, ?)`,
        id, username, hash, username, demoUserMonthlyTokens(), expiresAt.toISOString(),
      );
      await db.run('INSERT INTO login_attempts (username, ip_address, success) VALUES (?, ?, 1)', username, ipAddress);
      console.log(`[auth] demo account created: user ${id}`);

      const authUser: AuthUser = { id, username, role: 'analyst', display_name: username };
      const token = await issueSession(db, authUser, expiresAt);
      setSessionCookie(res, token);
      res.status(201).json({ user: authUser, token, expiresAt: expiresAt.toISOString() });
    } catch (err) {
      // Two sign-ups for one name at once: the unique index decides.
      if ((err as { code?: string }).code === '23505') {
        res.status(409).json({ error: 'That username is taken. Choose another.' });
        return;
      }
      res.status(500).json({ error: safeError(err) });
    }
  });

  // POST /api/auth/forgot-password
  router.post('/auth/forgot-password', validate(ForgotPasswordSchema), async (req, res) => {
    const { email } = req.body as { email?: string };
    // Always return 200 for security — don't reveal whether email exists
    if (!email) { res.json({ success: true }); return; }

    try {
      // Look up user by email field
      const user = await db.get('SELECT * FROM users WHERE email = ?', email) as Record<string, unknown> | undefined;
      // No reset link for an account that signs in through SSO or is switched
      // off: a password would be a second way in that skips the directory's
      // MFA and survives offboarding. Same answer either way (no enumeration).
      if (user && !user.disabled_at && !(await hasSsoIdentity(db, user.id as string))) {
        const token = randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
        await db.run('INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)'
        , user.id as string, token, expiresAt);

        // The link's host comes from configuration, not the request: a forged
        // Host header would otherwise mail a victim a link to another server.
        const baseUrl = publicBaseUrl(req);
        try {
          await sendPasswordResetEmail(email, token, baseUrl);
        } catch (emailErr) {
          console.error('[auth] Failed to send password reset email:', emailErr);
        }
      }
    } catch (err) {
      console.error('[auth] forgot-password error:', err);
    }

    res.json({ success: true });
  });

  // POST /api/auth/reset-password
  router.post('/auth/reset-password', validate(ResetPasswordSchema), async (req, res) => {
    const { token, newPassword } = req.body as { token: string; newPassword: string };

    const record = await db.get(`SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0 AND expires_at > NOW()`
    , token) as Record<string, unknown> | undefined;

    if (!record) {
      res.status(400).json({ error: 'Invalid or expired reset token' });
      return;
    }
    // A token issued before the account was linked to SSO (or switched off)
    // must not set a password after it.
    const target = await db.get<{ disabled_at: unknown }>('SELECT disabled_at FROM users WHERE id = ?', record.user_id as string);
    if (!target || target.disabled_at || await hasSsoIdentity(db, record.user_id as string)) {
      res.status(400).json({ error: 'This account signs in with single sign-on — it has no password to reset' });
      return;
    }

    try {
      const hash = await bcrypt.hash(newPassword, 10);
      await db.run('UPDATE users SET password_hash = ? WHERE id = ?', hash, record.user_id as string);
      await db.run('DELETE FROM user_sessions WHERE user_id = ?', record.user_id as string);
      await db.run('UPDATE password_reset_tokens SET used = 1 WHERE id = ?', record.id as number);
      res.json({ success: true });
    } catch (err) {
      console.error('[auth] reset-password error:', err);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  });

  // POST /api/auth/logout
  router.post('/auth/logout', async (req, res) => {
    // SEC-05: Accept cookie token or Authorization header
    const cookieToken = (req as any).cookies?.['openexpert_session'];
    const bearerToken = req.headers.authorization?.slice(7);
    const token = cookieToken || bearerToken;
    if (token) await db.run('DELETE FROM user_sessions WHERE token = ?', token);
    // SEC-05: Clear the session cookie
    res.clearCookie('openexpert_session', { httpOnly: true, secure: isSecureCookie(), sameSite: 'strict', path: '/' });
    res.json({ success: true });
  });

  // GET /api/auth/me
  router.get('/auth/me', async (req, res) => {
    if (!IS_TEAM_MODE) {
      // school_role included so the School sidebar resolves a real role. SchoolLayout,
      // SchoolProfilePage and SchoolSettingsPage all read it off this response and
      // default to 'student' when absent — which is why every teacher nav item was
      // invisible even to an instance admin.
      const soloRow = await db.get<{ school_role: string | null }>(
        'SELECT school_role FROM users WHERE id = ?', 'solo',
      ).catch(() => null);
      res.json({
        id: 'solo', username: 'solo', role: 'admin', display_name: 'Solo User',
        school_role: soloRow?.school_role ?? 'school_admin',
      });
      return;
    }
    const token = req.headers.authorization?.slice(7);
    if (!token) { res.status(401).json({ error: 'Not authenticated' }); return; }
    // The same account rule as the auth middleware: the web client decides
    // "still signed in" from this answer alone.
    const session = await db.get(`SELECT u.id, u.username, u.role, u.display_name, u.school_role, u.demo_expires_at FROM user_sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token = ? AND s.expires_at > NOW() AND ${LIVE_ACCOUNT_SQL}`
    , token) as Record<string, unknown> | undefined;
    if (!session || sessionEndedOutsideDemo(session.demo_expires_at)) { res.status(401).json({ error: 'Session expired' }); return; }
    const me: Record<string, unknown> = { ...session };
    delete me.demo_expires_at;
    res.json(me);
  });

  // GET /api/auth/me/budget — get current user's budget status
  router.get('/auth/me/budget', async (req, res) => {
    if (!IS_TEAM_MODE) {
      res.json({ budget: null }); // No budget in solo mode
      return;
    }
    const token = req.headers.authorization?.slice(7);
    if (!token) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const session = await db.get(
      `SELECT u.id, u.demo_expires_at FROM user_sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token = ? AND s.expires_at > NOW() AND ${LIVE_ACCOUNT_SQL}`
    , token) as { id: string; demo_expires_at: unknown } | undefined;

    if (!session || sessionEndedOutsideDemo(session.demo_expires_at)) { res.status(401).json({ error: 'Session expired' }); return; }

    try {
      const status = await getUserBudgetStatus(db, session.id);
      res.json({ budget: status });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ─── Google OAuth ──────────────────────────────────────────────────────────

  // Google and GitHub sign in anyone with an account there, so a public demo
  // (DEMO_MODE=true) turns both off: visitors sign up with an invite code.

  // GET /api/auth/google — redirect to Google consent screen
  // Optional: ?from=school — causes callback to redirect to /school after auth
  router.get('/auth/google', async (req, res) => {
    if (isDemoMode()) {
      res.status(404).json({ error: 'Not available in this demo' });
      return;
    }
    if (!GOOGLE_CLIENT_ID) {
      res.status(501).json({ error: 'Google OAuth not configured' });
      return;
    }
    const restart = restartOnCallbackHost(req, 'google');
    if (restart) { res.redirect(restart); return; }
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: oauthCallbackUrl('google'),
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account',
      state: startOAuthState(res, (req.query as { from?: string }).from === 'school'),
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  // GET /api/auth/google/callback
  router.get('/auth/google/callback', async (req, res) => {
    if (isDemoMode() || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      res.redirect('/?auth_error=not_configured');
      return;
    }
    const state = checkOAuthState(req, res);
    if (!state.ok) {
      res.redirect('/?auth_error=invalid_state');
      return;
    }
    const { code } = req.query as { code?: string };
    if (!code) {
      res.redirect('/?auth_error=no_code');
      return;
    }
    const redirectBase = state.fromSchool ? '/?from=school&auth_code=' : '/?auth_code=';
    try {
      // Exchange code for tokens
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: oauthCallbackUrl('google'),
          grant_type: 'authorization_code',
        }),
      });
      const tokens = await tokenRes.json() as { access_token: string; id_token: string };

      // Get user info
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const googleUser = await userRes.json() as { email?: string; verified_email?: boolean; name: string; picture?: string };

      // Accounts are matched by email, so only an address Google has verified
      // may sign in: an unverified one could be anybody's, a colleague's included.
      if (!googleUser.email || googleUser.verified_email !== true) {
        res.redirect('/?auth_error=no_email');
        return;
      }

      const token = await sessionForProviderAccount(db, googleUser.email, googleUser.name, 'google');
      res.redirect(`${redirectBase}${createExchangeCode(res, token, isSecureCookie())}`);
    } catch (err) {
      console.error('[auth] Google OAuth error:', err);
      res.redirect('/?auth_error=oauth_failed');
    }
  });

  // ─── GitHub OAuth ──────────────────────────────────────────────────────────

  // GET /api/auth/github — redirect to GitHub
  router.get('/auth/github', async (req, res) => {
    if (isDemoMode()) {
      res.status(404).json({ error: 'Not available in this demo' });
      return;
    }
    if (!GITHUB_CLIENT_ID) {
      res.status(501).json({ error: 'GitHub OAuth not configured' });
      return;
    }
    const restart = restartOnCallbackHost(req, 'github');
    if (restart) { res.redirect(restart); return; }
    const params = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      redirect_uri: oauthCallbackUrl('github'),
      scope: 'user:email',
      state: startOAuthState(res, (req.query as { from?: string }).from === 'school'),
    });
    res.redirect(`https://github.com/login/oauth/authorize?${params}`);
  });

  // GET /api/auth/github/callback
  router.get('/auth/github/callback', async (req, res) => {
    if (isDemoMode() || !GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
      res.redirect('/?auth_error=not_configured');
      return;
    }
    const state = checkOAuthState(req, res);
    if (!state.ok) {
      res.redirect('/?auth_error=invalid_state');
      return;
    }
    const { code } = req.query as { code?: string };
    if (!code) {
      res.redirect('/?auth_error=no_code');
      return;
    }
    try {
      // Exchange code for access token
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: oauthCallbackUrl('github'),
        }),
      });
      const tokenData = await tokenRes.json() as { access_token: string };

      // Get user info
      const userRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/vnd.github+json' },
      });
      const ghUser = await userRes.json() as { login: string; name?: string };

      // Accounts are matched by email, so only an address GitHub has verified
      // may sign in. The profile's public email says nothing about that; the
      // emails list does.
      const emailRes = await fetch('https://api.github.com/user/emails', {
        headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/vnd.github+json' },
      });
      const emails = await emailRes.json() as Array<{ email: string; primary: boolean; verified?: boolean }>;
      const verified = Array.isArray(emails) ? emails.filter((e) => e.verified === true) : [];
      const email = verified.find((e) => e.primary)?.email || verified[0]?.email || null;

      if (!email) {
        res.redirect('/?auth_error=no_email');
        return;
      }

      const token = await sessionForProviderAccount(db, email, ghUser.name || ghUser.login, 'github');
      res.redirect(`${state.fromSchool ? '/?from=school&auth_code=' : '/?auth_code='}${createExchangeCode(res, token, isSecureCookie())}`);
    } catch (err) {
      console.error('[auth] GitHub OAuth error:', err);
      res.redirect('/?auth_error=oauth_failed');
    }
  });

  // ─── Enterprise SSO (OpenID Connect) ───────────────────────────────────────
  // Built and tested for Microsoft Entra ID; any compliant provider works. The
  // decisions (identity, tenant, role, provisioning) live in
  // services/oidc-sso.ts; these routes carry the redirect flow. Team mode only:
  // solo mode has one user and no sign-in, and an SSO flow there would only
  // create rows nobody can use. Set-up for IT: docs/deployment/entra-id-sso.md.

  /** The settings, or an answer already sent: 404 in solo mode, 501 unset. */
  function oidcSettingsOr404(res: Response): OidcSettings | null {
    if (!IS_TEAM_MODE) {
      res.status(404).json({ error: 'Single sign-on is available in team mode (DEPLOYMENT_MODE=team)' });
      return null;
    }
    const settings = readOidcSettings();
    if (!settings) {
      res.status(501).json({ error: 'Single sign-on is not configured — set OIDC_ISSUER_URL and OIDC_CLIENT_ID' });
      return null;
    }
    return settings;
  }

  /** Back to the app with a reason the login page can show. */
  function ssoFailure(res: Response, settings: OidcSettings | null, reason: string): void {
    res.redirect(`${settings?.appBaseUrl ?? ''}/?auth_error=${encodeURIComponent(reason)}`);
  }

  /** Whether the caller is an administrator. This router is mounted before
   *  the auth middleware (sign-in must work without a session), so the session
   *  is read here. Solo mode's one user is the administrator. */
  async function callerIsAdmin(req: { headers: { authorization?: string }; cookies?: Record<string, string> }): Promise<boolean> {
    if (!IS_TEAM_MODE) return true;
    const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined;
    const token = req.cookies?.['openexpert_session'] || bearer;
    if (!token) return false;
    const row = await db.get<{ role: string; demo_expires_at: unknown }>(
      `SELECT u.role, u.demo_expires_at FROM user_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token = ? AND s.expires_at > NOW() AND ${LIVE_ACCOUNT_SQL}`,
      token,
    ).catch(() => undefined);
    return row?.role === 'admin' && !sessionEndedOutsideDemo(row.demo_expires_at);
  }

  // GET /api/auth/oidc/test — for whoever sets SSO up: does discovery work, and
  // what is wrong with the settings. No secret is ever returned. Anyone may ask
  // whether discovery works; the settings summary and ?refresh=1 (a fresh
  // discovery request) are for an administrator — or solo mode, so a
  // configuration can be checked before the instance switches to team mode.
  router.get('/auth/oidc/test', async (req, res) => {
    const settings = readOidcSettings();
    if (!settings) {
      res.status(501).json({ ok: false, error: 'OIDC not configured — set OIDC_ISSUER_URL and OIDC_CLIENT_ID in .env' });
      return;
    }
    const detailed = await callerIsAdmin(req as { headers: { authorization?: string }; cookies?: Record<string, string> });
    if (!detailed) {
      try {
        const config = await getOidcConfig(settings);
        res.json({ ok: oidcSettingsProblems(settings).errors.length === 0, issuer: config.serverMetadata().issuer });
      } catch {
        res.status(502).json({ ok: false, error: 'OIDC discovery failed' });
      }
      return;
    }
    const { errors, warnings } = oidcSettingsProblems(settings);
    const summary = {
      redirectUri: settings.redirectUri,
      tenantRestriction: settings.allowedTenantIds.length > 0 ? `allow-list (${settings.allowedTenantIds.length})` : 'issuer',
      roleMapping: settings.roleMap.size > 0 ? `${settings.roleMap.size} role(s) from the "${settings.roleClaim}" claim` : 'off',
      defaultRole: settings.defaultRole,
      teamMode: IS_TEAM_MODE,
      errors,
      warnings: IS_TEAM_MODE ? warnings : [...warnings, 'DEPLOYMENT_MODE is not team — the sign-in button stays hidden until it is'],
    };
    try {
      const config = await getOidcConfig(settings, (req.query as { refresh?: string }).refresh === '1');
      res.json({ ok: errors.length === 0, issuer: config.serverMetadata().issuer, ...summary });
    } catch (err) {
      res.status(502).json({ ok: false, error: `OIDC discovery failed: ${safeError(err)}`, ...summary });
    }
  });

  // GET /api/auth/oidc/start — to the identity provider's sign-in page.
  // ?from=school returns to School mode afterwards.
  router.get('/auth/oidc/start', async (req, res) => {
    const settings = oidcSettingsOr404(res);
    if (!settings) return;
    const { errors } = oidcSettingsProblems(settings);
    if (errors.length > 0) {
      console.error(`[auth] SSO refused to start — configuration: ${errors.join(' | ')}`);
      ssoFailure(res, settings, 'sso_misconfigured');
      return;
    }
    // The state cookie belongs to the host that sets it, and the provider
    // returns the browser to the redirect URI's host. Started on another name
    // for the same server (the intranet short name, the IP) the callback would
    // never see the cookie, so the sign-in starts over on the registered host.
    const callbackOrigin = new URL(settings.redirectUri);
    if (req.get('host') && req.get('host') !== callbackOrigin.host) {
      const from = (req.query as { from?: string }).from === 'school' ? '?from=school' : '';
      res.redirect(`${callbackOrigin.origin}/api/auth/oidc/start${from}`);
      return;
    }
    try {
      pruneOidcStates();
      const config = await getOidcConfig(settings);
      const state = oidcClient.randomState();
      const nonce = oidcClient.randomNonce();
      // PKCE, which Microsoft recommends for every client, confidential ones
      // included: the code is useless to anyone without this verifier.
      const codeVerifier = oidcClient.randomPKCECodeVerifier();
      const codeChallenge = await oidcClient.calculatePKCECodeChallenge(codeVerifier);
      // Bounded: /start is unauthenticated, and each entry lives ten minutes.
      // Past the cap the oldest sign-in in progress is dropped (it answers
      // invalid_state and is started again) rather than growing without end.
      while (oidcStateStore.size >= OIDC_STATE_CAP) {
        const oldest = oidcStateStore.keys().next().value;
        if (oldest === undefined) break;
        oidcStateStore.delete(oldest);
      }
      oidcStateStore.set(state, {
        nonce, codeVerifier, fromSchool: (req.query as { from?: string }).from === 'school', createdAt: Date.now(),
      });
      res.cookie(OIDC_STATE_COOKIE, state, {
        httpOnly: true, secure: callbackOrigin.protocol === 'https:', sameSite: 'lax', maxAge: 10 * 60 * 1000, path: OIDC_COOKIE_PATH,
      });

      const authUrl = oidcClient.buildAuthorizationUrl(config, {
        redirect_uri: settings.redirectUri,
        scope: 'openid profile email',
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });
      res.redirect(authUrl.href);
    } catch (err) {
      console.error(`[auth] SSO start failed: ${err instanceof Error ? err.message : 'error'}`);
      ssoFailure(res, settings, 'oidc_start_failed');
    }
  });

  // GET /api/auth/oidc/callback — back from the identity provider.
  router.get('/auth/oidc/callback', async (req, res) => {
    const settings = oidcSettingsOr404(res);
    if (!settings) return;
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const refuse = (reason: string, details: string, userId?: string) => {
      // Codes and ids only — never a claim value or a token.
      console.warn(`[auth] SSO sign-in refused (${reason}): ${details}`);
      logSecurityEvent(db, {
        eventType: 'unauthorized_access', userId, ipAddress,
        details: `SSO sign-in refused (${reason}): ${details}`, severity: 'medium',
      });
      ssoFailure(res, settings, reason);
    };

    const query = req.query as { state?: string; error?: string; error_description?: string };
    const state = typeof query.state === 'string' ? query.state : '';
    // The state must be the one this browser started with (cookie) and one this
    // server issued (store). Either missing means the callback link did not come
    // from a sign-in started here.
    const cookieState = (req as { cookies?: Record<string, string> }).cookies?.[OIDC_STATE_COOKIE];
    res.clearCookie(OIDC_STATE_COOKIE, { path: OIDC_COOKIE_PATH });
    const stateEntry = state ? oidcStateStore.get(state) : undefined;
    if (state) oidcStateStore.delete(state);
    if (!state || !stateEntry || cookieState !== state) {
      refuse('invalid_state', !state ? 'no state' : !stateEntry ? 'unknown or expired state' : 'state not issued to this browser');
      return;
    }
    if (typeof query.error === 'string') {
      // e.g. access_denied — Entra's "not assigned to this application" (AADSTS50105).
      // The error code only; the description can carry directory detail.
      refuse('sso_denied', `identity provider answered ${query.error.slice(0, 60)}${aadstsCode(query.error_description)}`);
      return;
    }

    try {
      const config = await getOidcConfig(settings);
      // The token request must carry exactly the redirect_uri the authorisation
      // used (RFC 6749 §4.1.3). Rebuilt from the request it came out without
      // /api (the router is mounted under it) and as http behind a TLS proxy, so
      // Entra refused every code.
      const callbackUrl = new URL(settings.redirectUri);
      callbackUrl.search = new URL(req.originalUrl, 'http://callback.invalid').search;

      const tokens = await oidcClient.authorizationCodeGrant(config, callbackUrl, {
        pkceCodeVerifier: stateEntry.codeVerifier,
        expectedState: state,
        expectedNonce: stateEntry.nonce,
        idTokenExpected: true,
      });
      const claims = tokens.claims();
      if (!claims) { refuse('no_claims', 'no ID token claims'); return; }

      let identity;
      try {
        identity = identityFromClaims(claims as Record<string, unknown>, settings);
      } catch (err) {
        if (err instanceof SsoRefusedError) { refuse(err.reason, err.message); return; }
        throw err;
      }
      if (!tenantAllowed(identity, settings)) {
        refuse('tenant_not_allowed', `directory ${identity.tenantId ?? 'unknown'} is not on OIDC_ALLOWED_TENANT_IDS`);
        return;
      }

      let provisioned;
      try {
        provisioned = await provisionOidcUser(db, identity, settings);
      } catch (err) {
        if (err instanceof SsoRefusedError) { refuse(err.reason, err.message); return; }
        throw err;
      }
      const { user, outcome, roleChangedFrom } = provisioned;
      if (outcome !== 'returning') console.log(`[auth] SSO account ${outcome}: user ${user.id}`);
      if (roleChangedFrom !== undefined) console.log(`[auth] SSO role for user ${user.id}: ${roleChangedFrom} → ${user.role} (from the directory)`);

      await db.run('INSERT INTO login_attempts (username, ip_address, success) VALUES (?, ?, 1)', user.username, ipAddress);
      const token = await issueSession(db, {
        id: user.id, username: user.username, role: user.role, display_name: user.display_name,
      });
      // Invitations are addressed by email, so only a verified address accepts them.
      if (identity.email && identity.emailVerified) void acceptPendingInvitations(db, user.id, identity.email);

      const landing = stateEntry.fromSchool ? '/?from=school&auth_code=' : '/?auth_code=';
      res.redirect(`${settings.appBaseUrl}${landing}${createExchangeCode(res, token, new URL(settings.redirectUri).protocol === 'https:')}`);
    } catch (err) {
      // openid-client's messages can quote token claims, so not the message:
      // the error kind, the OAuth error code and the AADSTS code, which IT can
      // look up (AADSTS7000215 = wrong client secret, and so on).
      const body = err as { name?: string; error?: unknown; error_description?: unknown };
      const oauthError = typeof body.error === 'string' ? ` ${body.error.slice(0, 60)}` : '';
      const detail = `${body.name ?? 'error'}${oauthError}${aadstsCode(typeof body.error_description === 'string' ? body.error_description : undefined)}`;
      refuse('oidc_callback_failed', detail);
    }
  });

  // GET /api/auth/exchange/:code — swap one-time code for JWT (C2 fix)
  // The code is placed in the redirect URL after OAuth; the JWT never touches the URL.
  router.get('/auth/exchange/:code', async (req, res) => {
    const entry = authCodeStore.get(req.params.code);
    const binder = (req as { cookies?: Record<string, string> }).cookies?.[EXCHANGE_BINDER_COOKIE];
    res.clearCookie(EXCHANGE_BINDER_COOKIE, { path: EXCHANGE_COOKIE_PATH });
    if (!entry || entry.expiresAt < Date.now() || !binder || sha256(binder) !== entry.binderHash) {
      authCodeStore.delete(req.params.code);
      res.status(400).json({ error: 'Invalid or expired auth code' });
      return;
    }
    authCodeStore.delete(req.params.code); // one-time use
    // The cookie as well as the body: without it an SSO user's downloads,
    // EventSource streams and plain links answered 401 — password login set it,
    // this path did not.
    setSessionCookie(res, entry.token);
    res.json({ token: entry.token });
  });

  // ── AUTH-03: TOTP / MFA — login-time verification ─────────────────────────
  //
  // Enrolment (enable / confirm / disable) lives in createAuthMfaRoutes below:
  // those read req.user and this router is mounted BEFORE authMiddleware.

  // POST /auth/mfa/verify USED TO LIVE HERE. It is deleted, not moved, and it must not
  // come back in this router.
  //
  // It took { userId, token } with no session, answered `res.json({ verified })`, and
  // nothing else. This router is mounted at index.ts:469, ahead of authMiddleware (556),
  // csrfProtection (565) and userLimiter (568), and the only path-scoped limiters are
  // login / forgot-password / reset-password (291-293) — so the endpoint was
  // unauthenticated, unthrottled and un-CSRF'd. It also wrote no login_attempts row, so
  // the 5-in-15-minutes username lockout that caps code guessing on the login path never
  // saw it. With speakeasy's window:1 accepting three live codes out of 10^6, that is a
  // second factor brute-forceable off-path in minutes, and the winning code replays
  // straight into POST /auth/login, which verifies with identical parameters.
  //
  // The lines were byte-identical on main, where they were harmless: main never mounted
  // createAuthMfaRoutes, so mfa_enabled had no write path and the query below could not
  // match a row. Adding enrolment and login enforcement is what armed it — a dormant
  // endpoint became a live bypass without being edited, which is the failure mode worth
  // remembering here.
  //
  // Deleting it costs nothing: it had no caller in src/, tests/ or any companion app.
  // Login verifies the second factor inline (see the mfaOn block above), which is
  // authenticated by the password check, rate-limited, logged, and answers 401 on a bad
  // code rather than 200. Note that mounting authLimiter on this path would NOT have
  // fixed it: rate-limit.ts sets skipSuccessfulRequests, and a wrong guess returned
  // HTTP 200, so every guess would have been skipped as a success.

  return router;
}

/**
 * MFA enrolment — a SEPARATE router, mounted in index.ts BELOW authMiddleware.
 *
 * These three endpoints read req.user. createAuthRoutes above is mounted ~90 lines
 * ABOVE the middleware that stamps it (index.ts), because /auth/login and the OAuth
 * callbacks have to be reachable with no session — so every call to
 * /auth/mfa/enable|confirm|disable answered 401 "Authentication required" to a fully
 * authenticated admin, and MFA could not be turned on by anybody on any instance.
 *
 * Keep the mount below authMiddleware. Folding these routes back into createAuthRoutes
 * for tidiness silently disables MFA enrolment again, and the symptom (a 401 on a
 * request that carried a valid session) reads like a token bug, not a mount-order bug.
 */
export function createAuthMfaRoutes(db: DatabaseAdapter): Router {
  const router = Router();
  const IS_TEAM_MODE = process.env.DEPLOYMENT_MODE === 'team';

  // POST /api/auth/mfa/enable — generate a TOTP secret and return QR code URL
  router.post('/auth/mfa/enable', async (req, res) => {
    if (!IS_TEAM_MODE) { res.status(400).json({ error: 'MFA is only available in team mode' }); return; }
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Authentication required' }); return; }

    try {
      const speakeasy = await import('speakeasy');
      const qrcode = await import('qrcode');

      const secret = speakeasy.default.generateSecret({
        name: `openEXPERT (${req.user?.username})`,
        issuer: 'openEXPERT',
        length: 32,
      });

      // Store pending secret (not active until confirmed)
      await db.run(`
        INSERT INTO mfa_pending (user_id, secret) VALUES (?, ?)
        ON CONFLICT (user_id) DO UPDATE SET secret = EXCLUDED.secret
      `, userId, secret.base32);

      const otpAuthUrl = secret.otpauth_url!;
      const qrDataUrl = await qrcode.default.toDataURL(otpAuthUrl);

      res.json({ secret: secret.base32, qrDataUrl, otpAuthUrl });
    } catch (err) {
      console.error('[auth] MFA enable error:', err);
      res.status(500).json({ error: 'Failed to generate MFA secret' });
    }
  });

  // POST /api/auth/mfa/confirm — verify TOTP token and activate MFA
  router.post('/auth/mfa/confirm', async (req, res) => {
    if (!IS_TEAM_MODE) { res.status(400).json({ error: 'MFA is only available in team mode' }); return; }
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Authentication required' }); return; }

    const { token: totpToken } = req.body as { token?: string };
    if (!totpToken || typeof totpToken !== 'string' || !/^\d{6}$/.test(totpToken)) {
      res.status(400).json({ error: 'A 6-digit TOTP token is required' });
      return;
    }

    try {
      const pending = await db.get('SELECT secret FROM mfa_pending WHERE user_id = ?', userId) as { secret: string } | undefined;
      if (!pending) { res.status(400).json({ error: 'No pending MFA setup found — call /api/auth/mfa/enable first' }); return; }

      const speakeasy = await import('speakeasy');
      const verified = speakeasy.default.totp.verify({
        secret: pending.secret,
        encoding: 'base32',
        token: totpToken,
        window: 1, // Allow 30s clock drift
      });

      if (!verified) { res.status(400).json({ error: 'Invalid TOTP token — check your authenticator app and try again' }); return; }

      // Activate MFA
      await db.run('UPDATE users SET mfa_enabled = 1, mfa_secret = ? WHERE id = ?', pending.secret, userId);
      await db.run('DELETE FROM mfa_pending WHERE user_id = ?', userId);

      res.json({ success: true, message: 'MFA is now active on your account' });
    } catch (err) {
      console.error('[auth] MFA confirm error:', err);
      res.status(500).json({ error: 'Failed to confirm MFA' });
    }
  });

  // POST /api/auth/mfa/disable — deactivate MFA (requires current TOTP token)
  router.post('/auth/mfa/disable', async (req, res) => {
    if (!IS_TEAM_MODE) { res.status(400).json({ error: 'MFA is only available in team mode' }); return; }
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: 'Authentication required' }); return; }

    const { token: totpToken } = req.body as { token?: string };
    if (!totpToken || typeof totpToken !== 'string' || !/^\d{6}$/.test(totpToken)) {
      res.status(400).json({ error: 'A 6-digit TOTP token is required to disable MFA' });
      return;
    }

    try {
      const user = await db.get('SELECT mfa_enabled, mfa_secret FROM users WHERE id = ?', userId) as { mfa_enabled: number; mfa_secret: string | null } | undefined;
      if (!user?.mfa_enabled || !user.mfa_secret) { res.status(400).json({ error: 'MFA is not enabled on this account' }); return; }

      const speakeasy = await import('speakeasy');
      const verified = speakeasy.default.totp.verify({
        secret: user.mfa_secret,
        encoding: 'base32',
        token: totpToken,
        window: 1,
      });

      if (!verified) { res.status(400).json({ error: 'Invalid TOTP token' }); return; }

      await db.run('UPDATE users SET mfa_enabled = 0, mfa_secret = NULL WHERE id = ?', userId);
      res.json({ success: true, message: 'MFA has been disabled' });
    } catch (err) {
      console.error('[auth] MFA disable error:', err);
      res.status(500).json({ error: 'Failed to disable MFA' });
    }
  });

  return router;
}

// ─── OAuth helper ────────────────────────────────────────────────────────────

async function acceptPendingInvitations(db: DatabaseAdapter, userId: string, email: string) {
  try {
    // db.all: this was db.get, whose single row (or undefined) the loop below
    // could not iterate — the throw was caught, and no invitation was ever
    // accepted at sign-in.
    const pending = await db.all<{ id: string; project_id: string; role: string; invited_by: string | null }>(`
      SELECT * FROM project_invitations
      WHERE LOWER(email) = LOWER(?) AND status = 'pending' AND expires_at > NOW()
    `, email);

    for (const inv of pending) {
      // The same rule as accepting by link: the sender must still be allowed to
      // give this role. Otherwise a member who invited their own address, and
      // was then removed, came straight back in at their next sign-in.
      if (!(await invitationStillValid(db, inv))) {
        await db.run("UPDATE project_invitations SET status = 'revoked' WHERE id = ? AND status = 'pending'", inv.id);
        continue;
      }
      const memberId = randomUUID();
      try {
        await db.run(`
          INSERT INTO project_members (id, project_id, user_id, role, added_by)
          VALUES (?, ?, ?, ?, ?)
        `, memberId, inv.project_id, userId, inv.role, inv.invited_by);
      } catch {
        // Already a member — skip
      }
      await db.run("UPDATE project_invitations SET status = 'accepted' WHERE id = ?", inv.id);
    }

    if (pending.length > 0) {
      console.log(`[auth] Auto-accepted ${pending.length} project invitation(s) for user ${userId}`);
    }
  } catch (err) {
    console.error(`[auth] Error accepting pending invitations for user ${userId}: ${err instanceof Error ? err.message : 'error'}`);
  }
}

/**
 * Google / GitHub sign-in. These match accounts by email and accept any
 * account on the internet, so they are for a personal instance — a work
 * server leaves GOOGLE_* / GITHUB_* unset and uses single sign-on
 * (docs/deployment/entra-id-sso.md). Even so they never enter an account the
 * directory owns (an OIDC identity) or one that is switched off: a personal
 * Google account with a colleague's address must not become that colleague.
 */
async function sessionForProviderAccount(db: DatabaseAdapter, email: string, name: string, _provider: string): Promise<string> {
  let user = await db.get('SELECT * FROM users WHERE email = ?', email) as Record<string, unknown> | undefined;

  if (user && (user.disabled_at || await hasSsoIdentity(db, user.id as string))) {
    throw new Error('OAuth sign-in refused: the account is switched off or signs in with single sign-on');
  }

  if (!user) {
    // Derive a username from the email local part; make it unique
    const baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_');
    let username = baseUsername;
    let attempt = 0;
    while (await db.get('SELECT id FROM users WHERE username = ?', username)) {
      attempt += 1;
      username = `${baseUsername}_${attempt}`;
    }

    const id = randomUUID();
    await db.run('INSERT INTO users (id, username, email, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?, ?)'
    , id, username, email, '', 'analyst', name || username);
    user = await db.get('SELECT * FROM users WHERE id = ?', id) as Record<string, unknown>;
  }

  // Auto-accept pending project invitations for this email
  void acceptPendingInvitations(db, user.id as string, email);

  return issueSession(db, {
    id: user.id as string,
    username: user.username as string,
    role: user.role as 'admin' | 'analyst' | 'viewer',
    display_name: user.display_name as string | undefined,
  });
}
