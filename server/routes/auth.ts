import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID, randomBytes } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';

import { generateToken } from '../middleware/auth.js';
import { sendPasswordResetEmail } from '../services/email.js';
import { logSecurityEvent } from '../services/security-logger.js';
import * as oidcClient from 'openid-client';
import { getUserBudgetStatus } from '../services/budget-manager.js';
import { safeError } from '../lib/error-response.js';
import { validate } from '../lib/validate.js';
import { LoginSchema, ForgotPasswordSchema, ResetPasswordSchema } from '../lib/schemas.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

const OIDC_ISSUER_URL = process.env.OIDC_ISSUER_URL;
const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID;
const OIDC_CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET;
const OIDC_REDIRECT_URI = process.env.OIDC_REDIRECT_URI || 'http://localhost:3001/api/auth/oidc/callback';

// Cache OIDC configuration to avoid re-discovering on every request
let oidcConfig: oidcClient.Configuration | null = null;

async function getOidcConfig(): Promise<oidcClient.Configuration> {
  if (oidcConfig) return oidcConfig;
  if (!OIDC_ISSUER_URL || !OIDC_CLIENT_ID) {
    throw new Error('OIDC not configured — set OIDC_ISSUER_URL and OIDC_CLIENT_ID');
  }
  const issuerUrl = new URL(OIDC_ISSUER_URL);
  const clientAuth = OIDC_CLIENT_SECRET
    ? oidcClient.ClientSecretPost(OIDC_CLIENT_SECRET)
    : oidcClient.None();
  oidcConfig = await oidcClient.discovery(issuerUrl, OIDC_CLIENT_ID, {}, clientAuth);
  return oidcConfig;
}

// In-memory nonce/state store (short-lived — good enough for local single-process deployment)
const oidcStateStore = new Map<string, { nonce: string; createdAt: number }>();

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
const authCodeStore = new Map<string, { token: string; expiresAt: number }>();

function createExchangeCode(token: string): string {
  // Prune expired codes first
  const now = Date.now();
  for (const [key, val] of authCodeStore.entries()) {
    if (val.expiresAt < now) authCodeStore.delete(key);
  }
  const code = randomBytes(32).toString('hex');
  authCodeStore.set(code, { token, expiresAt: now + 60_000 }); // 60-second TTL
  return code;
}

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

    const valid = await bcrypt.compare(password, user.password_hash as string);

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

    // Record successful attempt
    await db.run('INSERT INTO login_attempts (username, ip_address, success) VALUES (?, ?, 1)', username, ipAddress);

    const authUser = {
      id: user.id as string,
      username: user.username as string,
      role: user.role as 'admin' | 'analyst' | 'viewer',
      display_name: user.display_name as string | undefined,
    };
    const token = generateToken(authUser);

    // Store session
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await db.run('INSERT INTO user_sessions (token, user_id, expires_at) VALUES (?, ?, ?)', token, user.id as string, expiresAt);
    await db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', user.id as string);

    // Auto-accept any pending project invitations for this email
    acceptPendingInvitations(db, user.id as string, user.email as string);

    // SEC-05: Set token in httpOnly, Secure, SameSite=Strict cookie (7 days)
    const isSecure = process.env.NODE_ENV === 'production' || process.env.HTTPS === 'true';
    res.cookie('openexpert_session', token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
      path: '/',
    });

    // Also return token in body for backward compatibility with existing clients
    res.json({ user: authUser, token });
  });

  // POST /api/auth/forgot-password
  router.post('/auth/forgot-password', validate(ForgotPasswordSchema), async (req, res) => {
    const { email } = req.body as { email?: string };
    // Always return 200 for security — don't reveal whether email exists
    if (!email) { res.json({ success: true }); return; }

    try {
      // Look up user by email field
      const user = await db.get('SELECT * FROM users WHERE email = ?', email) as Record<string, unknown> | undefined;
      if (user) {
        const token = randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
        await db.run('INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)'
        , user.id as string, token, expiresAt);

        const baseUrl = `${req.protocol}://${req.get('host')}`;
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
    res.clearCookie('openexpert_session', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' });
    res.json({ success: true });
  });

  // GET /api/auth/me
  router.get('/auth/me', async (req, res) => {
    if (!IS_TEAM_MODE) {
      res.json({ id: 'solo', username: 'solo', role: 'admin', display_name: 'Solo User' });
      return;
    }
    const token = req.headers.authorization?.slice(7);
    if (!token) { res.status(401).json({ error: 'Not authenticated' }); return; }
    const session = await db.get(`SELECT u.id, u.username, u.role, u.display_name FROM user_sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token = ? AND s.expires_at > NOW()`
    , token) as Record<string, unknown> | undefined;
    if (!session) { res.status(401).json({ error: 'Session expired' }); return; }
    res.json(session);
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
      `SELECT u.id FROM user_sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token = ? AND s.expires_at > NOW()`
    , token) as { id: string } | undefined;

    if (!session) { res.status(401).json({ error: 'Session expired' }); return; }

    try {
      const status = getUserBudgetStatus(db, session.id);
      res.json({ budget: status });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ─── Google OAuth ──────────────────────────────────────────────────────────

  // GET /api/auth/google — redirect to Google consent screen
  // Optional: ?from=school — causes callback to redirect to /school after auth
  router.get('/auth/google', async (req, res) => {
    if (!GOOGLE_CLIENT_ID) {
      res.status(501).json({ error: 'Google OAuth not configured' });
      return;
    }
    const fromParam = (req.query as { from?: string }).from || '';
    const state = fromParam === 'school' ? 'school' : '';
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: `${process.env.BASE_URL || 'http://localhost:3001'}/api/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account',
    });
    if (state) params.set('state', state);
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  // GET /api/auth/google/callback
  router.get('/auth/google/callback', async (req, res) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      res.redirect('/?auth_error=not_configured');
      return;
    }
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code) {
      res.redirect('/?auth_error=no_code');
      return;
    }
    const redirectBase = state === 'school' ? '/?from=school&auth_code=' : '/?auth_code=';
    try {
      // Exchange code for tokens
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: `${process.env.BASE_URL || 'http://localhost:3001'}/api/auth/google/callback`,
          grant_type: 'authorization_code',
        }),
      });
      const tokens = await tokenRes.json() as { access_token: string; id_token: string };

      // Get user info
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const googleUser = await userRes.json() as { email: string; name: string; picture?: string };

      const token = await findOrCreateOAuthUser(db, googleUser.email, googleUser.name, 'google');
      res.redirect(`${redirectBase}${createExchangeCode(token)}`);
    } catch (err) {
      console.error('[auth] Google OAuth error:', err);
      res.redirect('/?auth_error=oauth_failed');
    }
  });

  // ─── GitHub OAuth ──────────────────────────────────────────────────────────

  // GET /api/auth/github — redirect to GitHub
  router.get('/auth/github', async (_req, res) => {
    if (!GITHUB_CLIENT_ID) {
      res.status(501).json({ error: 'GitHub OAuth not configured' });
      return;
    }
    const params = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      redirect_uri: `${process.env.BASE_URL || 'http://localhost:3001'}/api/auth/github/callback`,
      scope: 'user:email',
    });
    res.redirect(`https://github.com/login/oauth/authorize?${params}`);
  });

  // GET /api/auth/github/callback
  router.get('/auth/github/callback', async (req, res) => {
    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
      res.redirect('/?auth_error=not_configured');
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
          redirect_uri: `${process.env.BASE_URL || 'http://localhost:3001'}/api/auth/github/callback`,
        }),
      });
      const tokenData = await tokenRes.json() as { access_token: string };

      // Get user info
      const userRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/vnd.github+json' },
      });
      const ghUser = await userRes.json() as { login: string; name?: string; email: string | null };

      // Get primary email if not public
      let email = ghUser.email;
      if (!email) {
        const emailRes = await fetch('https://api.github.com/user/emails', {
          headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/vnd.github+json' },
        });
        const emails = await emailRes.json() as Array<{ email: string; primary: boolean }>;
        email = emails.find(e => e.primary)?.email || emails[0]?.email || null;
      }

      if (!email) {
        res.redirect('/?auth_error=no_email');
        return;
      }

      const token = await findOrCreateOAuthUser(db, email, ghUser.name || ghUser.login, 'github');
      res.redirect(`/?auth_code=${createExchangeCode(token)}`);
    } catch (err) {
      console.error('[auth] GitHub OAuth error:', err);
      res.redirect('/?auth_error=oauth_failed');
    }
  });

  // ─── Enterprise OIDC SSO ───────────────────────────────────────────────────
  // Supports Azure AD, Okta, Auth0, and any OIDC-compliant identity provider.
  // Configure via: OIDC_ISSUER_URL, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_REDIRECT_URI

  // GET /api/auth/oidc/test — discover OIDC config and return status (no auth required)
  router.get('/auth/oidc/test', async (_req, res) => {
    if (!OIDC_ISSUER_URL || !OIDC_CLIENT_ID) {
      res.status(501).json({ ok: false, error: 'OIDC not configured — set OIDC_ISSUER_URL and OIDC_CLIENT_ID in .env' });
      return;
    }
    try {
      // Reset cached config so we always do a fresh check on the test endpoint
      oidcConfig = null;
      const config = await getOidcConfig();
      const serverMetadata = config.serverMetadata();
      res.json({ ok: true, issuer: serverMetadata.issuer });
    } catch (err) {
      res.status(500).json({ ok: false, error: `OIDC discovery failed: ${safeError(err)}` });
    }
  });

  // GET /api/auth/oidc/start — redirect user to the identity provider login page
  // Optional: ?from=school — encodes 'from' in OIDC state so callback can redirect back
  router.get('/auth/oidc/start', async (req, res) => {
    if (!OIDC_ISSUER_URL || !OIDC_CLIENT_ID) {
      res.status(501).json({ error: 'Enterprise SSO not configured' });
      return;
    }
    try {
      pruneOidcStates();
      const config = await getOidcConfig();
      const fromParam = (req.query as { from?: string }).from || '';
      const stateRandom = oidcClient.randomState();
      // Encode 'from' context in state using a separator that survives URL round-trips
      const state = fromParam === 'school' ? `school:${stateRandom}` : stateRandom;
      const nonce = oidcClient.randomNonce();
      oidcStateStore.set(state, { nonce, createdAt: Date.now() });

      const authUrl = oidcClient.buildAuthorizationUrl(config, {
        redirect_uri: OIDC_REDIRECT_URI,
        scope: 'openid email profile',
        state,
        nonce,
      });

      res.redirect(authUrl.href);
    } catch (err) {
      console.error('[auth] OIDC start error:', err);
      res.redirect('/?auth_error=oidc_start_failed');
    }
  });

  // GET /api/auth/oidc/callback — handle the identity provider callback
  router.get('/auth/oidc/callback', async (req, res) => {
    if (!OIDC_ISSUER_URL || !OIDC_CLIENT_ID) {
      res.redirect('/?auth_error=not_configured');
      return;
    }
    try {
      const config = await getOidcConfig();

      // Reconstruct the full callback URL from the incoming request
      const callbackUrl = new URL(
        req.url,
        `${req.protocol}://${req.get('host')}`
      );

      // Retrieve and validate state
      const state = callbackUrl.searchParams.get('state');
      if (!state) {
        res.redirect('/?auth_error=missing_state');
        return;
      }
      const stateEntry = oidcStateStore.get(state);
      if (!stateEntry) {
        res.redirect('/?auth_error=invalid_state');
        return;
      }
      oidcStateStore.delete(state);

      // Exchange authorization code for tokens and validate ID token
      const tokens = await oidcClient.authorizationCodeGrant(config, callbackUrl, {
        pkceCodeVerifier: undefined,
        expectedState: state,
        expectedNonce: stateEntry.nonce,
        idTokenExpected: true,
      });

      // Extract user identity from ID token claims
      const claims = tokens.claims();
      if (!claims) {
        res.redirect('/?auth_error=no_claims');
        return;
      }

      const email = (claims.email as string | undefined) || '';
      if (!email) {
        res.redirect('/?auth_error=no_email');
        return;
      }
      const name = (claims.name as string | undefined) || (claims.preferred_username as string | undefined) || email.split('@')[0];

      const isFromSchool = state?.startsWith('school:') === true;
      const token = await findOrCreateOAuthUser(db, email, name, 'oidc');
      const redirectBase = isFromSchool ? '/?from=school&auth_code=' : '/?auth_code=';
      res.redirect(`${redirectBase}${createExchangeCode(token)}`);
    } catch (err) {
      console.error('[auth] OIDC callback error:', err);
      res.redirect('/?auth_error=oidc_callback_failed');
    }
  });

  // GET /api/auth/exchange/:code — swap one-time code for JWT (C2 fix)
  // The code is placed in the redirect URL after OAuth; the JWT never touches the URL.
  router.get('/auth/exchange/:code', async (req, res) => {
    const entry = authCodeStore.get(req.params.code);
    if (!entry || entry.expiresAt < Date.now()) {
      authCodeStore.delete(req.params.code);
      res.status(400).json({ error: 'Invalid or expired auth code' });
      return;
    }
    authCodeStore.delete(req.params.code); // one-time use
    res.json({ token: entry.token });
  });

  // ── AUTH-03: TOTP / MFA endpoints ──────────────────────────────────────────

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

  // POST /api/auth/mfa/verify — verify TOTP during login (called after password check)
  router.post('/auth/mfa/verify', async (req, res) => {
    if (!IS_TEAM_MODE) { res.status(400).json({ error: 'MFA is only available in team mode' }); return; }
    const { userId, token: totpToken } = req.body as { userId?: string; token?: string };
    if (!userId || !totpToken) { res.status(400).json({ error: 'userId and token required' }); return; }
    if (!/^\d{6}$/.test(totpToken)) { res.status(400).json({ error: 'Token must be 6 digits' }); return; }

    try {
      const user = await db.get('SELECT mfa_secret FROM users WHERE id = ? AND mfa_enabled = 1', userId) as { mfa_secret: string } | undefined;
      if (!user?.mfa_secret) { res.status(400).json({ error: 'MFA not enabled for this user' }); return; }

      const speakeasy = await import('speakeasy');
      const verified = speakeasy.default.totp.verify({
        secret: user.mfa_secret,
        encoding: 'base32',
        token: totpToken,
        window: 1,
      });

      res.json({ verified });
    } catch (err) {
      console.error('[auth] MFA verify error:', err);
      res.status(500).json({ error: 'MFA verification failed' });
    }
  });

  return router;
}

// ─── OAuth helper ────────────────────────────────────────────────────────────

async function acceptPendingInvitations(db: DatabaseAdapter, userId: string, email: string) {
  try {
    const pending = await db.get(`
      SELECT * FROM project_invitations
      WHERE email = ? AND status = 'pending' AND expires_at > NOW()
    `, email) as Array<{ id: string; project_id: string; role: string; invited_by: string }>;

    for (const inv of pending) {
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
      console.log(`[auth] Auto-accepted ${pending.length} project invitation(s) for ${email}`);
    }
  } catch (err) {
    console.error('[auth] Error accepting pending invitations:', err);
  }
}

async function findOrCreateOAuthUser(db: DatabaseAdapter, email: string, name: string, _provider: string): Promise<string> {
  let user = await db.get('SELECT * FROM users WHERE email = ?', email) as Record<string, unknown> | undefined;
  let isNewUser = false;

  if (!user) {
    isNewUser = true;
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
  acceptPendingInvitations(db, user.id as string, email);

  const authUser = {
    id: user.id as string,
    username: user.username as string,
    role: user.role as 'admin' | 'analyst' | 'viewer',
    display_name: user.display_name as string | undefined,
  };

  const token = generateToken(authUser);

  // Store session in DB (consistent with existing login route)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await db.run('INSERT INTO user_sessions (token, user_id, expires_at) VALUES (?, ?, ?)', token, authUser.id, expiresAt);
  await db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', authUser.id);

  return token;
}
