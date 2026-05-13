/**
 * jwt.ts — HMAC-SHA256 JWT (HS256) sign + verify for the operator API.
 *
 * Plain hand-rolled JWT, no library dep, ~80 lines. Restricted to HS256
 * so we don't need to handle key-curve negotiation. Operators
 * authenticate against a single shared password
 * (RELAY_OPERATOR_PASSWORD); on success the relay issues a 1-hour token
 * signed with RELAY_OPERATOR_JWT_SECRET.
 *
 * For v0.1 there's no multi-user account table — operators
 * self-declare their identity at login time and that id ends up in the
 * audit trail (portal_submissions.reviewer_id). For Phase E we'll add
 * a real users table; this module's verify() contract won't change.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface OperatorClaims {
  /** Self-declared operator id (e.g. 'op-daniel'). */
  sub: string;
  /** Issued-at, seconds since epoch. */
  iat: number;
  /** Expiry, seconds since epoch. */
  exp: number;
  /** Always 'operator' in v0.1. Reserved for future roles. */
  role: 'operator';
}

/** Issue duration. Short enough that a leaked token has limited blast radius. */
export const DEFAULT_TOKEN_TTL_SEC = 3600;

function b64urlEncodeJson(o: unknown): string {
  return Buffer.from(JSON.stringify(o), 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecodeJson(s: string): unknown {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
}

function b64urlSig(secret: string, signingInput: string): string {
  return createHmac('sha256', secret).update(signingInput).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Build + sign a token. Caller supplies the operator self-declared id. */
export function signOperatorToken(operatorId: string, secret: string, ttlSec = DEFAULT_TOKEN_TTL_SEC): {
  token: string;
  expiresAt: string;
} {
  const now = Math.floor(Date.now() / 1000);
  const claims: OperatorClaims = {
    sub: operatorId,
    iat: now,
    exp: now + ttlSec,
    role: 'operator',
  };
  const header = { alg: 'HS256', typ: 'JWT' };
  const signingInput = `${b64urlEncodeJson(header)}.${b64urlEncodeJson(claims)}`;
  const signature = b64urlSig(secret, signingInput);
  return {
    token: `${signingInput}.${signature}`,
    expiresAt: new Date(claims.exp * 1000).toISOString(),
  };
}

export type VerifyResult =
  | { ok: true; claims: OperatorClaims }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'wrong_role' };

/** Verify + parse a token. Constant-time signature comparison. */
export function verifyOperatorToken(token: string, secret: string, now = Date.now()): VerifyResult {
  if (typeof token !== 'string' || token.length === 0) return { ok: false, reason: 'malformed' };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

  const expected = b64urlSig(secret, `${headerB64}.${payloadB64}`);
  const expBytes = Buffer.from(expected);
  const gotBytes = Buffer.from(sigB64);
  if (expBytes.length !== gotBytes.length) return { ok: false, reason: 'bad_signature' };
  if (!timingSafeEqual(expBytes, gotBytes)) return { ok: false, reason: 'bad_signature' };

  let claims: OperatorClaims;
  try {
    claims = b64urlDecodeJson(payloadB64) as OperatorClaims;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof claims.sub !== 'string' || typeof claims.iat !== 'number'
      || typeof claims.exp !== 'number' || claims.role !== 'operator') {
    return { ok: false, reason: 'malformed' };
  }
  if (claims.exp * 1000 < now) return { ok: false, reason: 'expired' };
  return { ok: true, claims };
}

/** Extract + verify from an Authorization header. Returns null on any failure. */
export function operatorFromAuthHeader(
  authHeader: string | undefined,
  secret: string,
  now = Date.now(),
): OperatorClaims | null {
  if (!authHeader) return null;
  const m = authHeader.match(/^Bearer (.+)$/i);
  if (!m || !m[1]) return null;
  const result = verifyOperatorToken(m[1], secret, now);
  return result.ok ? result.claims : null;
}
