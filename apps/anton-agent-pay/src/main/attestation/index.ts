/**
 * attestation/index.ts — top-level desktop-attestation API.
 *
 * Spec: DESKTOP_ATTESTATION_SPEC.md §2 + §4 + §7
 *
 * Two exported functions:
 *
 *   buildAttestationPacket(nonce, deps)
 *     Assembles + Ed25519-signs a DESKTOP_V1 token. Pure-function over
 *     `deps` so tests can inject stubs without touching the filesystem
 *     or shelling out to codesign / powershell.
 *
 *   attestForChainCall(deps)
 *     Wraps the full flow: nonce → /attest call → cached session token.
 *     Returns the session token to attach as `X-Attestation-Token` on
 *     `/submit_signed_transaction`. Re-uses a still-valid cached
 *     session; refreshes on demand.
 *
 * The session cache lives in process memory for the lifetime of the
 * Electron main. A fresh app start re-attests; that's fine — attestation
 * is cheap and the 24-hour TTL is just a server-side guard against
 * stale sessions, not a UX cost.
 */
import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';

import { getCodeSignature, type CodeSignature } from './code-signature.js';
import {
  getInstallIdentity, signWithAttestationKey, type InstallIdentity,
} from './install-keys.js';
import type { StorageBackend } from '../wallet/storage.js';

/** Bahnhof's verified verdict-summary string (e.g.
 *  "DESKTOP|linux|0.0.1|abcdef12"). Returned by /attest. */
export type AttestationVerdict = string;

/** Successfully-attested session token, attached to subsequent chain
 *  calls via the `X-Attestation-Token` header. Plus the verdict the
 *  server returned (for audit logging). */
export interface AttestationSession {
  sessionToken: string;
  /** Epoch millis after which the session expires. Refresh before then. */
  expiresAtMs: number;
  verdict: AttestationVerdict;
}

/** Dependencies injected into the attestation flow. Production wires
 *  these to real implementations in main.ts; tests inject doubles. */
export interface AttestationDeps {
  /** StorageBackend the install identity lives in. */
  storage: StorageBackend;
  /** Bahnhof base URL (e.g. https://rpc.futurechain.eu). */
  endpoint: string;
  /** install bearer issued by /enroll (X-API-Key header). */
  apiKey: string;
  /** Override the fetch impl — tests use this to stub the network. */
  fetch?: typeof fetch;
  /** Override the code-signature provider — tests inject deterministic
   *  values without shelling out to codesign / powershell. */
  codeSignature?: () => CodeSignature;
  /** Override the install-identity provider — tests inject a fixed
   *  install_id + pubkey instead of touching the storage backend. */
  identity?: () => Promise<InstallIdentity>;
  /** Override the signing function — tests sign with a key under their
   *  own control so the verifier can be exercised end-to-end. */
  sign?: (message: Uint8Array) => Promise<Uint8Array>;
  /** Override the nonce generator — tests pin a known nonce. */
  nonce?: () => string;
  /** Override `now` — tests pin ts_ms. */
  now?: () => number;
  /** Per-app version string for the payload. Defaults to
   *  process.env.npm_package_version or "0.0.0" in test envs. */
  appVersion?: string;
}

const SESSION_REFRESH_MARGIN_MS = 5 * 60 * 1000;  // refresh 5 min early

/** Build (and sign) a DESKTOP_V1 attestation token for `nonce`. */
export async function buildAttestationPacket(
  nonce: string, deps: AttestationDeps,
): Promise<{ token: string; payloadBytes: Uint8Array }> {
  const cs = (deps.codeSignature ?? getCodeSignature)();
  const id = await (deps.identity ?? (() => getInstallIdentity(deps.storage)))();
  const now = (deps.now ?? Date.now)();
  const appVersion = deps.appVersion
    ?? process.env.npm_package_version
    ?? process.env.AGENT_PAY_APP_VERSION
    ?? '0.0.0';

  // Build the payload in field-order matching the spec § doc — keeps
  // logs readable. JSON.stringify is deterministic enough for our needs
  // (Bahnhof signs/verifies the raw bytes we send so key ordering only
  // matters for human grep-ability, not for verification).
  const payload = {
    install_id: id.installId,
    platform: process.platform,
    app_version: appVersion,
    code_signature_subject: cs.subject,
    code_signature_thumbprint: cs.thumbprintHex,
    nonce,
    ts_ms: now,
  };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const sign = deps.sign
    ?? ((m: Uint8Array) => signWithAttestationKey(deps.storage, m));
  const sigBytes = await sign(payloadBytes);
  if (sigBytes.length !== 64) {
    throw new Error(
      `buildAttestationPacket: signature must be 64 bytes (got ${sigBytes.length})`,
    );
  }
  const token = `DESKTOP_V1:${b64uNoPad(payloadBytes)}:${b64uNoPad(sigBytes)}`;
  return { token, payloadBytes };
}

let _sessionCache: AttestationSession | null = null;

/** Get a valid attestation session token, attesting if needed. Caches
 *  the result for the session's lifetime minus a safety margin. */
export async function attestForChainCall(
  deps: AttestationDeps,
): Promise<AttestationSession> {
  // Fast-path: cached session still good.
  if (_sessionCache && Date.now() < _sessionCache.expiresAtMs - SESSION_REFRESH_MARGIN_MS) {
    return _sessionCache;
  }
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error(
      'attestForChainCall: no fetch available — pass deps.fetch (Node <18 or restricted env)',
    );
  }
  const nonce = (deps.nonce ?? defaultNonce)();
  const { token } = await buildAttestationPacket(nonce, deps);
  const url = `${deps.endpoint.replace(/\/+$/, '')}/attest`;
  const r = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'X-API-Key': deps.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ play_integrity_token: token, nonce }),
  });
  if (!r.ok) {
    const detail = await safeReadText(r);
    throw new Error(
      `attestForChainCall: /attest returned ${r.status} ${r.statusText} — ${detail}`,
    );
  }
  const body = await r.json() as {
    session_token?: string;
    expires_in?: number;
    issued_at?: string;
    verdict?: string;
  };
  if (!body.session_token || typeof body.expires_in !== 'number') {
    throw new Error(
      `attestForChainCall: /attest response missing session_token or expires_in: ${JSON.stringify(body)}`,
    );
  }
  const session: AttestationSession = {
    sessionToken: body.session_token,
    expiresAtMs: Date.now() + body.expires_in * 1000,
    verdict: body.verdict ?? 'UNKNOWN',
  };
  _sessionCache = session;
  return session;
}

/** Test helper — drop the in-memory session cache. */
export function _resetSessionCache(): void {
  _sessionCache = null;
}

// ── internals ────────────────────────────────────────────────────

function defaultNonce(): string {
  // 16 random bytes hex-encoded → 32 chars, matches Bahnhof's
  // AttestRequest.nonce min_length=16 / max_length=64.
  return randomBytes(16).toString('hex');
}

function b64uNoPad(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function safeReadText(r: Response): Promise<string> {
  try { return await r.text(); } catch { return '<unreadable response body>'; }
}
