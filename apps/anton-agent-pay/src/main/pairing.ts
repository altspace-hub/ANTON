/**
 * pairing.ts — 6-digit pairing code + session bearer issuance.
 *
 * Flow (see ANTON_AGENT_PAY_SPEC.md §8):
 *   1. User opens Agent Pay → Settings → Pair an agent.
 *   2. Server generates a 6-digit code, displays in the UI, valid 60 s.
 *   3. Agent POSTs /pair { name, code } within 60 s.
 *   4. Server validates the code, generates a session bearer (256-bit),
 *      stores its SHA-256 hash bound to the pairing name + expiry.
 *   5. Server returns { session_token, expires_at, agent_id }.
 *   6. Agent uses the bearer on every subsequent request.
 *
 * Bearers expire after PAIRING_TTL_MS (default 4 h, configurable per
 * pairing call up to PAIRING_MAX_TTL_MS). A long-pairing (> 30 days)
 * rule lives in the UI layer — the store itself just enforces the
 * TTL it was given.
 *
 * SHA-256-only storage: a memory snapshot of the pairing map does not
 * yield usable bearers, only their hashes. Mirrors the
 * attestation_sessions design in bahnhof/app.py.
 */
import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { PairedAgent } from '../shared/ipc-types.js';

export const PAIRING_CODE_TTL_MS = 60 * 1000;
export const PAIRING_DEFAULT_TTL_MS = 4 * 3600 * 1000;
export const PAIRING_MAX_TTL_MS = 30 * 24 * 3600 * 1000;
export const PAIRING_CODE_LENGTH = 6;

export interface IssuedPairing {
  agent: PairedAgent;
  /** Raw bearer — returned to the agent ONCE here. Not stored in the
   *  server side; only its SHA-256 hash is kept. */
  sessionToken: string;
}

interface PendingPairingCode {
  code: string;
  createdAt: number;
}

export class PairingStore {
  private agents = new Map<string, PairedAgent>(); // id → agent
  private tokenIndex = new Map<string, string>();  // tokenSha256 → agent.id
  /** At most one pending code at a time — pairing flow is user-driven,
   *  not concurrent. Generating a new code invalidates the previous one. */
  private pendingCode: PendingPairingCode | null = null;

  constructor(private readonly nowFn: () => number = Date.now) {}

  /** Generate a fresh 6-digit pairing code shown in the UI. Replaces
   *  any prior pending code. */
  newCode(): string {
    const code = String(randomInt(0, 1_000_000)).padStart(PAIRING_CODE_LENGTH, '0');
    this.pendingCode = { code, createdAt: this.nowFn() };
    return code;
  }

  /** Validate a code-submission from an agent. On success returns the
   *  issued pairing (with the raw bearer); on failure throws. The
   *  pending code is single-use — it's cleared on any decision. */
  redeemCode(args: {
    name: string;
    code: string;
    ttlMs?: number;
  }): IssuedPairing {
    if (typeof args.name !== 'string' || args.name.length === 0
        || args.name.length > 64) {
      this.pendingCode = null;
      throw new PairingError('name must be a non-empty string ≤ 64 chars');
    }
    if (!this.pendingCode) {
      throw new PairingError('no pending pairing code');
    }
    const now = this.nowFn();
    if (now - this.pendingCode.createdAt > PAIRING_CODE_TTL_MS) {
      this.pendingCode = null;
      throw new PairingError('pairing code expired');
    }
    // Constant-time-ish compare of the user-typed code.
    if (!constantTimeEqualStrings(args.code, this.pendingCode.code)) {
      // NB: the pending code stays valid on a wrong-code attempt so
      // the legitimate agent isn't locked out by a single typo, but
      // we limit attempts elsewhere (caller-enforced rate-limit).
      throw new PairingError('pairing code does not match');
    }
    // Code accepted — burn it.
    this.pendingCode = null;

    const sessionToken = 'sk_' + randomBytes(32).toString('base64url');
    const tokenSha256 = sha256Hex(sessionToken);
    const ttl = clampPairingTtl(args.ttlMs);
    const agent: PairedAgent = {
      id: 'a_' + randomBytes(8).toString('base64url'),
      name: args.name,
      tokenSha256,
      pairedAt: now,
      expiresAt: now + ttl,
    };
    this.agents.set(agent.id, agent);
    this.tokenIndex.set(tokenSha256, agent.id);
    return { agent, sessionToken };
  }

  /** Resolve a bearer to its paired agent. Used on every JSON-RPC
   *  request. Returns undefined if the bearer doesn't match a known
   *  pairing OR the pairing has expired. */
  resolveBearer(bearer: string): PairedAgent | undefined {
    if (!bearer || typeof bearer !== 'string') return undefined;
    const sha = sha256Hex(bearer);
    const id = this.tokenIndex.get(sha);
    if (!id) return undefined;
    const agent = this.agents.get(id);
    if (!agent) return undefined;
    if (this.nowFn() >= agent.expiresAt) {
      // Lazy revoke.
      this.agents.delete(id);
      this.tokenIndex.delete(sha);
      return undefined;
    }
    agent.lastUsedAt = this.nowFn();
    return agent;
  }

  /** Revoke a pairing explicitly (Settings → Unpair). Returns true
   *  if the agent existed. */
  revoke(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    this.agents.delete(agentId);
    this.tokenIndex.delete(agent.tokenSha256);
    return true;
  }

  /** List all currently-paired agents (without their bearers — the
   *  raw bearer was returned only at issuance time). */
  list(): PairedAgent[] {
    return Array.from(this.agents.values());
  }

  /** Test helper — peek the pending pairing code without redeeming it. */
  peekPendingCode(): string | null {
    return this.pendingCode?.code ?? null;
  }
}

export class PairingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PairingError';
  }
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function clampPairingTtl(req: number | undefined): number {
  if (req === undefined || !Number.isFinite(req)) return PAIRING_DEFAULT_TTL_MS;
  if (req < 60 * 1000) return 60 * 1000;
  if (req > PAIRING_MAX_TTL_MS) return PAIRING_MAX_TTL_MS;
  return req;
}

/** Constant-time string compare for short codes. Both strings are
 *  hashed first so any length mismatch doesn't leak via timing. */
function constantTimeEqualStrings(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ah = createHash('sha256').update(a).digest();
  const bh = createHash('sha256').update(b).digest();
  let diff = 0;
  for (let i = 0; i < ah.length; i++) diff |= ah[i]! ^ bh[i]!;
  return diff === 0;
}
