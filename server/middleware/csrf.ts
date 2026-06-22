/**
 * CSRF Protection Middleware (SEC-14)
 *
 * Uses the synchronizer token pattern:
 * 1. Client calls GET /api/csrf-token → receives a random token
 * 2. Client stores token in memory and sends it as X-CSRF-Token header
 * 3. This middleware validates the header on all state-mutating routes
 *
 * Tokens are stored server-side keyed by user ID. In local-first (single-user)
 * mode, the 'default' user key is used. Tokens expire after 24 hours.
 */

import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';

interface TokenEntry {
  token: string;
  expiresAt: number;
}

// In-memory token store — acceptable for local-first deployment
const tokenStore = new Map<string, TokenEntry>();

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getUserKey(req: Request): string {
  return (req as { user?: { id?: string } }).user?.id ?? 'default';
}

/** Generate (or refresh) a CSRF token for the current user. */
export function generateCsrfToken(req: Request): string {
  const key = getUserKey(req);
  const token = randomBytes(32).toString('hex');
  tokenStore.set(key, { token, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

/** Express route handler: GET /api/csrf-token */
export function csrfTokenRoute(req: Request, res: Response): void {
  const token = generateCsrfToken(req);
  res.json({ csrfToken: token });
}

/**
 * Middleware that validates X-CSRF-Token on mutating requests.
 * Skip if:
 *  - Method is safe (GET, HEAD, OPTIONS)
 *  - Path is an auth endpoint (login/register — user not yet identified)
 *  - Path is a public webhook (has its own HMAC validation)
 */
const CSRF_EXEMPT_PREFIXES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/oidc',
  '/api/auth/google',
  '/api/auth/github',
  '/api/auth/exchange',
  '/api/webhooks/',
  '/api/bridge/',
  '/api/p2p/',           // P2P inbound from peer ANTON instances (authenticated by contact list, not CSRF)
  '/api/relay/',          // Relay store-and-forward (encrypted payloads only)
  '/api/app/register',    // Companion app registration (Ed25519 auth, not browser)
  '/api/app/auth/',       // Companion app challenge-response auth
  '/api/app/join',        // Companion app org join
  '/api/agents/public/',   // Public agent storefront (external ANTON queries)
  '/api/portals/visit/',   // Public portal capability invocation (AAP — external ANTON instances / agent gateways POST here; authenticated by the portal protocol + signed descriptor, not a browser session)
];

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Skip safe methods
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // Skip exempt paths
  if (CSRF_EXEMPT_PREFIXES.some(p => req.path.startsWith(p.replace('/api', '')))) {
    return next();
  }

  // OWASP: Origin/Referer-based validation — same-origin requests are safe from CSRF.
  // This covers raw fetch() calls that don't go through fetchWithAuth().
  const origin = (req.headers.origin || req.headers.referer || '') as string;
  if (/^https?:\/\/localhost(:\d+)?(\/|$)/.test(origin)) {
    return next();
  }

  const clientToken = req.headers['x-csrf-token'] as string | undefined;
  if (!clientToken) {
    res.status(403).json({ error: 'CSRF token missing. Call GET /api/csrf-token first.' });
    return;
  }

  const key = getUserKey(req);
  const entry = tokenStore.get(key);

  if (!entry || Date.now() > entry.expiresAt) {
    tokenStore.delete(key);
    res.status(403).json({ error: 'CSRF token expired. Refresh token via GET /api/csrf-token.' });
    return;
  }

  if (entry.token !== clientToken) {
    res.status(403).json({ error: 'CSRF token invalid.' });
    return;
  }

  next();
}

/** Prune expired tokens — call periodically. */
export function pruneExpiredCsrfTokens(): void {
  const now = Date.now();
  for (const [key, entry] of tokenStore.entries()) {
    if (entry.expiresAt < now) tokenStore.delete(key);
  }
}
