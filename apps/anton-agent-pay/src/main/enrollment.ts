/**
 * enrollment.ts — Bahnhof /enroll caller for Anton Agent Pay.
 *
 * Spec: ANTON_AGENT_PAY_SPEC.md §5.3 + DESKTOP_ATTESTATION_SPEC.md §6
 *
 * Flow on first launch (or when the cached install bearer is missing):
 *
 *   1. getInstallIdentity() — reads / generates install_id + Ed25519
 *      attestation keypair (in StorageBackend).
 *   2. POST /enroll with { install_id, app_version, platform="desktop",
 *      attestation_pubkey } — Bahnhof issues a per-install bearer
 *      token, persists the pubkey.
 *   3. Cache the bearer in StorageBackend under `install.bearer.token`.
 *
 * Idempotent: a second /enroll with the same install_id returns the
 * existing bearer (Bahnhof's own idempotency). If the bearer was
 * revoked, Bahnhof issues a new one — we transparently re-cache.
 *
 * Pairs with chain.ts, which uses the cached bearer (and the
 * attestation-session-token from src/main/attestation/) for the
 * `/submit_signed_transaction` path.
 */
import { getInstallIdentity, type InstallIdentity } from './attestation/install-keys.js';
import type { StorageBackend } from './wallet/storage.js';

const KEY_BEARER = 'install.bearer.token';
const KEY_BEARER_ISSUED_AT = 'install.bearer.issued_at';
const KEY_BEARER_ENDPOINT = 'install.bearer.endpoint';

/** Result of a successful enrollment — what the rest of the app needs
 *  to make authenticated calls. */
export interface EnrollmentResult {
  installId: string;
  bearerToken: string;
  /** ISO 8601 from Bahnhof's response. */
  issuedAt: string;
  /** The endpoint the bearer was issued for. Stored so we can detect
   *  endpoint changes (dev ↔ prod swap) and force a re-enroll. */
  endpoint: string;
}

export interface EnrollDeps {
  storage: StorageBackend;
  /** Bahnhof base URL — same form as chain.ts's endpoint (no trailing
   *  slash required, both forms accepted). */
  endpoint: string;
  /** App version sent to Bahnhof as part of /enroll. Defaults to the
   *  package version or 0.0.0. */
  appVersion?: string;
  /** Override fetch for tests. */
  fetch?: typeof fetch;
}

/** Get the install's bearer token, enrolling with Bahnhof on first run.
 *  Idempotent — subsequent calls return the cached bearer until it's
 *  revoked or the endpoint changes. */
export async function ensureEnrolled(deps: EnrollDeps): Promise<EnrollmentResult> {
  const identity = await getInstallIdentity(deps.storage);
  const cached = await _loadCached(deps.storage);
  if (cached && cached.endpoint === _canonical(deps.endpoint)) {
    return { ...cached, installId: identity.installId };
  }
  const fresh = await _enroll(identity, deps);
  await _persistCached(deps.storage, fresh);
  return fresh;
}

/** Test helper — drop the cached bearer so the next ensureEnrolled
 *  re-attempts enrollment. */
export async function _clearCachedBearer(storage: StorageBackend): Promise<void> {
  await storage.remove(KEY_BEARER);
  await storage.remove(KEY_BEARER_ISSUED_AT);
  await storage.remove(KEY_BEARER_ENDPOINT);
}

// ── internals ────────────────────────────────────────────────────

async function _loadCached(storage: StorageBackend): Promise<EnrollmentResult | null> {
  const token = await storage.get(KEY_BEARER);
  const issuedAt = await storage.get(KEY_BEARER_ISSUED_AT);
  const endpoint = await storage.get(KEY_BEARER_ENDPOINT);
  if (!token || !issuedAt || !endpoint) return null;
  return {
    installId: '',  // filled in by caller (we don't re-read install_id here)
    bearerToken: token,
    issuedAt,
    endpoint,
  };
}

async function _persistCached(
  storage: StorageBackend, result: EnrollmentResult,
): Promise<void> {
  await storage.set(KEY_BEARER, result.bearerToken);
  await storage.set(KEY_BEARER_ISSUED_AT, result.issuedAt);
  await storage.set(KEY_BEARER_ENDPOINT, result.endpoint);
}

async function _enroll(
  identity: InstallIdentity, deps: EnrollDeps,
): Promise<EnrollmentResult> {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error(
      'enrollment: no fetch available — pass deps.fetch (Node <18 or restricted env)',
    );
  }
  const endpoint = _canonical(deps.endpoint);
  const appVersion = deps.appVersion
    ?? process.env.npm_package_version
    ?? '0.0.0';
  const body = {
    install_id: identity.installId,
    app_version: appVersion,
    platform: 'desktop',
    attestation_pubkey: identity.pubHex,
  };
  const r = await fetchImpl(`${endpoint}/enroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await safeReadText(r);
    throw new Error(
      `enrollment: /enroll returned ${r.status} ${r.statusText} — ${text}`,
    );
  }
  const resp = await r.json() as {
    install_token?: string;
    install_id?: string;
    issued_at?: string;
  };
  if (!resp.install_token || !resp.install_id || !resp.issued_at) {
    throw new Error(
      `enrollment: /enroll response missing fields: ${JSON.stringify(resp)}`,
    );
  }
  if (resp.install_id !== identity.installId) {
    throw new Error(
      `enrollment: server returned install_id ${resp.install_id} but we sent ${identity.installId}`,
    );
  }
  return {
    installId: identity.installId,
    bearerToken: resp.install_token,
    issuedAt: resp.issued_at,
    endpoint,
  };
}

function _canonical(endpoint: string): string {
  return endpoint.replace(/\/+$/, '');
}

async function safeReadText(r: Response): Promise<string> {
  try { return await r.text(); } catch { return '<unreadable>'; }
}
