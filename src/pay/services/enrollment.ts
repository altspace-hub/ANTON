/**
 * enrollment.ts — per-install bearer token for the Bahnhof public RPC.
 *
 * Phase F1+F2 (May 20 2026): the static `DEFAULT_API_KEY` baked into
 * `fc-rpc.ts` is gone. Every install now generates a UUID `install_id`
 * on first launch, calls `POST /enroll` on the public hub, and stores
 * the returned 256-bit token in the OS keystore. All subsequent
 * `POST /submit_signed_transaction` calls carry that per-install
 * token in `X-API-Key`.
 *
 * Why this matters
 * ----------------
 * - Decompiling the shipped APK/IPA no longer yields a working token
 *   (the install_id + token are minted at runtime, not bundled).
 * - Operators can revoke a single compromised install
 *   (`bahnhof-admin revoke <install_id>`) without affecting other
 *   users or rebuilding the app.
 * - Per-install attribution: server-side audit log can join requests
 *   to the issuing install.
 *
 * Wire shape
 * ----------
 * Request:
 *   POST {endpoint}/enroll  Content-Type: application/json
 *   {
 *     "install_id":  "<UUID v4>",
 *     "app_version": "0.7.5",          // from package.json
 *     "platform":    "ios" | "android" | "web" | "test",
 *     "fc_address":  "fc_…"            // optional
 *   }
 * Response (201/200):
 *   { "install_token": "<256-bit hex>", "install_id": "...", "issued_at": "..." }
 *
 * The endpoint is open (no auth), rate-limited at the Caddy edge
 * (5 enrollments / hour / IP). Idempotent on `install_id`: a second
 * call with the same id returns the same token; if it was revoked, a
 * fresh token is issued.
 *
 * Test / dev override
 * -------------------
 * If `import.meta.env.VITE_FC_INSTALL_TOKEN` is set (or, in a Node
 * smoke, `process.env.FC_PAY_INSTALL_TOKEN`), it's used directly and
 * `/enroll` is not called. Lets the existing e2e smokes and dev
 * preview run without touching a real server.
 */
import { Capacitor } from '@capacitor/core';
import { getSecure, setSecure } from './secure-store';

const INSTALL_ID_KEY = 'fc.install.id';
const INSTALL_TOKEN_KEY = 'fc.install.token';

let cachedToken: string | null = null;

/** Returns the per-install bearer for this device, enrolling on first
 *  call if necessary. Cached in memory after the first hit. Throws on
 *  network failure during enrollment — caller should surface a clear
 *  "couldn't reach the hub" error to the user. */
export async function getInstallToken(endpoint: string): Promise<string> {
  if (cachedToken) return cachedToken;

  // Build-time / runtime override — preserves the e2e smoke contract
  // and lets the dev preview run against a hand-issued token.
  const override = readEnvOverride();
  if (override) {
    cachedToken = override;
    return override;
  }

  // Storage hit — already enrolled.
  const stored = await getSecure(INSTALL_TOKEN_KEY);
  if (stored) {
    cachedToken = stored;
    return stored;
  }

  // First-launch enrollment.
  const installId = await getOrCreateInstallId();
  const token = await enroll(endpoint, installId);
  await setSecure(INSTALL_TOKEN_KEY, token);
  cachedToken = token;
  return token;
}

/** Wipe the cached install token + persisted copy. Used by the
 *  "reset wallet" flow so the next first-launch enrols fresh. Note
 *  that this does NOT revoke the token on the server side — the
 *  operator's `bahnhof-admin revoke` does that. The install_id stays
 *  to preserve attribution across resets. */
export async function clearInstallToken(): Promise<void> {
  cachedToken = null;
  await setSecure(INSTALL_TOKEN_KEY, '');
}

/** Read the device's stable install_id, creating + persisting a fresh
 *  UUID on the first call. The id survives app restarts but not a full
 *  app uninstall (the OS clears the keystore on uninstall). */
export async function getOrCreateInstallId(): Promise<string> {
  const existing = await getSecure(INSTALL_ID_KEY);
  if (existing && /^[0-9a-fA-F-]{32,40}$/.test(existing)) return existing.toLowerCase();
  const fresh = generateUuid();
  await setSecure(INSTALL_ID_KEY, fresh);
  return fresh;
}

/** Wire shape for POST /register_address — a signed registration.
 *
 *  The client signs the canonical message
 *  `"register-address|<install_id>|<fc_address>|<timestamp>"` with
 *  the wallet's Ed25519 private key on-device, and sends the public
 *  key + signature here. The sidecar verifies the public key
 *  derives to the claimed fc_ address AND that the signature is
 *  valid — proving the caller HOLDS the private key, not merely
 *  claims to own the address. The private key itself NEVER crosses
 *  the wire. */
export interface RegisterAddressPayload {
  fc_address: string;
  /** 64-char lowercase hex of the 32-byte Ed25519 public key. */
  public_key: string;
  /** 128-char lowercase hex of the 64-byte Ed25519 signature. */
  signature: string;
  /** Epoch seconds when the signature was produced — must be within
   *  the server's freshness window (5 min) to defeat replay. */
  timestamp: number;
  label?: string;
}

/** POST /register_address with a signed proof-of-control payload.
 *
 *  Idempotent on the server (keyed on install_id × fc_address);
 *  throws on transport / auth / verification failure (the caller
 *  decides whether to swallow or surface). */
export async function registerAddress(
  endpoint: string,
  payload: RegisterAddressPayload,
): Promise<void> {
  const token = await getInstallToken(endpoint);
  const res = await fetch(`${endpoint.replace(/\/$/, '')}/register_address`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': token,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `register_address failed: HTTP ${res.status} ${detail.slice(0, 200)}`,
    );
  }
}


// ── internals ────────────────────────────────────────────────────────

async function enroll(endpoint: string, installId: string): Promise<string> {
  const body = {
    install_id: installId,
    app_version: appVersion(),
    platform: detectPlatform(),
  };
  const res = await fetch(`${endpoint.replace(/\/$/, '')}/enroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`enroll failed: HTTP ${res.status} ${detail.slice(0, 200)}`);
  }
  const parsed = (await res.json()) as { install_token?: string };
  if (!parsed.install_token || typeof parsed.install_token !== 'string') {
    throw new Error('enroll response missing install_token');
  }
  return parsed.install_token;
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback — shouldn't be reached on modern Capacitor or Node 19+,
  // but keeps the module portable. NOT cryptographically random; only
  // used as an opaque id, not as a secret.
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function detectPlatform(): 'ios' | 'android' | 'web' | 'test' {
  try {
    const p = Capacitor.getPlatform();
    if (p === 'ios' || p === 'android') return p;
    if (p === 'web') return 'web';
  } catch { /* fall through */ }
  return 'test';
}

function appVersion(): string {
  // Vite injects this at build time when the consumer defines it; the
  // pay-app's vite.config sets `__APP_VERSION__` from package.json.
  // Fall back to a safe default so this never blocks enrollment.
  try {
    // @ts-expect-error — injected by Vite define
    const v: unknown = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : undefined;
    if (typeof v === 'string' && /^[0-9a-zA-Z.+-]{1,32}$/.test(v)) return v;
  } catch { /* not running under Vite */ }
  return '0.0.0';
}

function readEnvOverride(): string | null {
  // Vite env (browser/Capacitor build)
  try {
    const v: unknown = import.meta.env?.VITE_FC_INSTALL_TOKEN;
    if (typeof v === 'string' && v.length === 64) return v;
  } catch { /* not under Vite */ }
  // Node env (vitest / smoke)
  if (typeof process !== 'undefined' && process.env) {
    const v = process.env['FC_PAY_INSTALL_TOKEN'];
    if (typeof v === 'string' && v.length === 64) return v;
  }
  return null;
}
