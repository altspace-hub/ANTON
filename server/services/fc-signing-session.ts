/**
 * fc-signing-session.ts — short-lived signing sessions for ANTON Local desktop
 * payments (LOCAL_PAYMENTS_PLAN.md, Phase 0).
 *
 * Model (locked): SERVER-SIDE signing. Private keys stay encrypted in the local
 * Postgres and are only ever decrypted in-process by fc-wallet-service; the
 * browser never holds a key. To submit a payment the desktop UI must first
 * "unlock" a wallet, which mints one of these tokens; payment endpoints then
 * require a live token. This makes spending an EXPLICIT, time-boxed action — a
 * stray localhost script can't silently drain the wallet just because the
 * server can technically decrypt — and it's where an optional wallet PIN/
 * passphrase check plugs in (the endpoint verifies it before minting).
 *
 * In-memory by design: a token is only meaningful for the lifetime of the
 * running server, and losing them on restart just forces a re-unlock (safe).
 * The token also carries the `actor` string threaded into wallet_audit_log so
 * every server-side decrypt/sign is attributable to an unlock event.
 */
import { randomBytes } from 'node:crypto';

export interface SigningSession {
  /** Opaque bearer token the browser presents on payment submit. */
  token: string;
  /** The wallet this session may sign for. */
  walletId: string;
  /** Audit actor (e.g. `local-unlock:<short-token>`), threaded into wallet_audit_log. */
  actor: string;
  createdAt: number;
  expiresAt: number;
}

export const DEFAULT_SIGNING_TTL_MS = 15 * 60 * 1000; // 15 min

const sessions = new Map<string, SigningSession>();

function purgeExpired(now: number): void {
  for (const [token, s] of sessions) {
    if (s.expiresAt <= now) sessions.delete(token);
  }
}

/** Mint a signing session for a wallet. Call AFTER the endpoint has verified
 *  any unlock policy (e.g. a wallet PIN). `now` is injectable for tests. */
export function createSigningSession(
  walletId: string,
  opts: { ttlMs?: number; now?: number } = {},
): SigningSession {
  const now = opts.now ?? Date.now();
  purgeExpired(now);
  const token = randomBytes(32).toString('hex');
  const session: SigningSession = {
    token,
    walletId,
    actor: `local-unlock:${token.slice(0, 8)}`,
    createdAt: now,
    expiresAt: now + (opts.ttlMs ?? DEFAULT_SIGNING_TTL_MS),
  };
  sessions.set(token, session);
  return session;
}

/** Return a live session for this token, or null if absent/expired. */
export function getSigningSession(token: string, now: number = Date.now()): SigningSession | null {
  const s = token ? sessions.get(token) : undefined;
  if (!s) return null;
  if (s.expiresAt <= now) { sessions.delete(token); return null; }
  return s;
}

/**
 * Throwing guard for payment endpoints: the token must be live AND bound to the
 * wallet being spent from. Returns the session (with its audit `actor`).
 */
export function assertSigningSession(
  token: string, walletId: string, now: number = Date.now(),
): SigningSession {
  const s = getSigningSession(token, now);
  if (!s) throw new SigningSessionError('signing session invalid or expired — unlock the wallet again');
  if (s.walletId !== walletId) throw new SigningSessionError('signing session is for a different wallet');
  return s;
}

/** Explicitly end a session (e.g. a "lock" button or after a single payment). */
export function revokeSigningSession(token: string): void {
  sessions.delete(token);
}

/** Diagnostics / tests. */
export function activeSigningSessionCount(now: number = Date.now()): number {
  purgeExpired(now);
  return sessions.size;
}

/** Tests only — wipe all sessions. */
export function __resetSigningSessions(): void {
  sessions.clear();
}

export class SigningSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SigningSessionError';
  }
}
