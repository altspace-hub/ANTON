/**
 * relay-auth.ts — Security middleware for the relay server
 *
 * Protects relay endpoints with:
 * 1. API key authentication (RELAY_API_KEYS — comma-separated list of valid keys)
 * 2. IP allowlist (RELAY_ALLOWED_IPS — comma-separated, supports CIDR)
 * 3. HMAC request signing (optional — validates request integrity)
 *
 * All three are OFF by default — relay is only accessible locally.
 * Enable by setting environment variables.
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// ── Configuration ────────────────────────────────────────────────────────

/** Comma-separated API keys that are allowed to use this relay */
const RELAY_API_KEYS = (process.env.RELAY_API_KEYS ?? '').split(',').map(k => k.trim()).filter(Boolean);

/** Comma-separated IP addresses/ranges allowed to access this relay */
const RELAY_ALLOWED_IPS = (process.env.RELAY_ALLOWED_IPS ?? '').split(',').map(k => k.trim()).filter(Boolean);

/** Secret for HMAC request signing (optional additional security layer) */
const RELAY_HMAC_SECRET = process.env.RELAY_HMAC_SECRET ?? '';

/** Whether relay is enabled for external access at all */
const RELAY_PUBLIC = process.env.RELAY_PUBLIC === 'true';

// ── Helpers ──────────────────────────────────────────────────────────────

function normalizeIp(ip: string): string {
  // Strip IPv4-mapped IPv6 prefix
  return ip.replace(/^::ffff:/i, '');
}

function ipMatchesAllowlist(clientIp: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true; // No allowlist = allow all (when relay is public)
  const normalized = normalizeIp(clientIp);
  return allowlist.some(allowed => {
    const normalizedAllowed = normalizeIp(allowed);
    // Exact match
    if (normalized === normalizedAllowed) return true;
    // CIDR prefix match (simple: just compare prefix)
    if (normalizedAllowed.includes('/')) {
      const [prefix] = normalizedAllowed.split('/');
      return normalized.startsWith(prefix.replace(/\.\d+$/, ''));
    }
    // Wildcard match (e.g., 192.168.1.*)
    if (normalizedAllowed.includes('*')) {
      const regex = new RegExp('^' + normalizedAllowed.replace(/\./g, '\\.').replace(/\*/g, '\\d+') + '$');
      return regex.test(normalized);
    }
    return false;
  });
}

function verifyHmac(req: Request): boolean {
  if (!RELAY_HMAC_SECRET) return true; // HMAC not configured = skip
  const signature = req.headers['x-relay-signature'] as string | undefined;
  if (!signature) return false;

  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const timestamp = req.headers['x-relay-timestamp'] as string | undefined;
  if (!timestamp) return false;

  // Reject requests older than 5 minutes (prevent replay)
  const age = Date.now() - parseInt(timestamp, 10);
  if (isNaN(age) || Math.abs(age) > 5 * 60 * 1000) return false;

  const expected = crypto
    .createHmac('sha256', RELAY_HMAC_SECRET)
    .update(`${timestamp}.${body}`)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
}

// ── Middleware ────────────────────────────────────────────────────────────

export function relayAuth(req: Request, res: Response, next: NextFunction): void {
  // If relay is not public, only allow localhost
  if (!RELAY_PUBLIC) {
    const clientIp = normalizeIp(req.ip ?? '');
    if (clientIp !== '127.0.0.1' && clientIp !== '::1' && clientIp !== 'localhost') {
      res.status(403).json({ error: 'Relay is not publicly accessible. Set RELAY_PUBLIC=true to enable.' });
      return;
    }
    return next();
  }

  // ── API Key Check ──────────────────────────────────────────────────
  if (RELAY_API_KEYS.length > 0) {
    const apiKey = (req.headers['x-relay-api-key'] ?? req.query.apiKey) as string | undefined;
    if (!apiKey || !RELAY_API_KEYS.includes(apiKey)) {
      res.status(401).json({ error: 'Invalid or missing relay API key' });
      return;
    }
  }

  // ── IP Allowlist ───────────────────────────────────────────────────
  if (RELAY_ALLOWED_IPS.length > 0) {
    const clientIp = req.ip ?? '';
    if (!ipMatchesAllowlist(clientIp, RELAY_ALLOWED_IPS)) {
      res.status(403).json({ error: 'IP not in relay allowlist' });
      return;
    }
  }

  // ── HMAC Signature (optional) ──────────────────────────────────────
  if (RELAY_HMAC_SECRET && req.method !== 'GET') {
    if (!verifyHmac(req)) {
      res.status(401).json({ error: 'Invalid HMAC signature' });
      return;
    }
  }

  next();
}

/**
 * Generate HMAC headers for a relay request (client-side utility).
 */
export function signRelayRequest(body: string, secret: string): { 'x-relay-signature': string; 'x-relay-timestamp': string } {
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  return { 'x-relay-signature': signature, 'x-relay-timestamp': timestamp };
}
