/**
 * enrollment.ts — spec §5.2 pairing flow.
 *
 * Three-step ritual:
 *   1. Fetch enrollment package by token (server endpoints, instance pubkey,
 *      cert fingerprint, intended user binding, TTL nonce).
 *   2. Generate a fresh Ed25519 keypair on this device, sign
 *      `${token}.${nonce}.${publicKey}` with the new privkey, POST it
 *      back to /enrollment/complete.
 *   3. Persist the device certificate + session token + the instance
 *      pinning material as a paired Instance.
 *
 * The QR / deep-link payload is a self-describing URL of the form:
 *   anton://enroll?server=<base>&token=<t>
 * (legacy `anton://join?server=&token=` is also accepted for backwards
 * compatibility — see legacyJoin().)
 */

import { generateAndStoreKeypair, getIdentity, saveIdentityPublic } from './identity';
import { Capacitor } from '@capacitor/core';
import { parsePairingLink, validateServerUrl } from './pairing-url';

// Re-export pure helpers so existing callers keep importing from here.
export { parsePairingLink, validateServerUrl };
export type { ParsedPairingLink } from './pairing-url';

export interface EnrollmentEndpoints {
  lan?: string;
  wan?: string;
  mdns_name?: string;
}

export interface EnrollmentPackage {
  token: string;
  nonce: string;
  instance_pubkey: string;
  instance_cert_fp: string | null;
  endpoints: EnrollmentEndpoints;
  intended_user_id: string | null;
  org_id: string | null;
  intended_role: string | null;
  display_name_hint: string | null;
  language_hint: string | null;
  expires_at: string;
  instance_contact_hash: string | null;
  instance_display_name: string | null;
  /** True when the issuer required an out-of-band confirmation code */
  requires_confirmation_code?: boolean;
  /** Phase 5 mesh fields — present iff the operator chose transport=mesh. */
  transport?: 'public_https' | 'mesh';
  relay_endpoints?: string[];
  instance_ed_pk?: string;        // 64 hex chars
  instance_x_pk?: string;         // 64 hex chars
  binding_sig?: string;           // 128 hex chars
}

export interface EnrollmentResult {
  device_id: string;
  device_certificate: string;
  session_token: string;
  expires_at: string;
  user: { id: string; contact_hash: string; display_name: string | null };
  org: { id: string; name: string; role: string } | null;
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Fetch the enrollment package from a server using a one-time token.
 * The server URL must be HTTPS or a local-dev address (LAN scope).
 */
export async function fetchEnrollment(serverBase: string, token: string): Promise<EnrollmentPackage> {
  validateServerUrl(serverBase);
  // Phase H fix H1 — POST so the token never appears in server / proxy
  // access logs. Falls back to legacy GET for older instances.
  const lookupUrl = `${trimSlash(serverBase)}/api/app/enrollment/lookup`;
  const r1 = await fetch(lookupUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (r1?.ok) return r1.json();
  if (r1 && r1.status !== 404 && r1.status !== 405) {
    const body = await r1.json().catch(() => ({}));
    throw new Error(body.error || `Enrollment fetch failed (${r1.status})`);
  }
  // Legacy GET fallback
  const legacyUrl = `${trimSlash(serverBase)}/api/app/enrollment/${encodeURIComponent(token)}`;
  const r2 = await fetch(legacyUrl, { signal: AbortSignal.timeout(10_000) });
  if (!r2.ok) {
    const body = await r2.json().catch(() => ({}));
    throw new Error(body.error || `Enrollment fetch failed (${r2.status})`);
  }
  return r2.json();
}

/**
 * Complete enrollment — generate keypair, sign payload, post to server,
 * persist credentials. Returns the EnrollmentResult.
 */
export async function completeEnrollment(serverBase: string, pkg: EnrollmentPackage, opts: {
  device_name?: string;
  device_model?: string;
  device_os?: string;
  app_version?: string;
  preferred_language?: string;
  /** Required when pkg.requires_confirmation_code === true */
  confirmation_code?: string;
}): Promise<EnrollmentResult> {
  validateServerUrl(serverBase);
  const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'
  const device_name = opts.device_name ?? defaultDeviceName(platform);
  const device_model = opts.device_model ?? platform;
  const device_os = opts.device_os ?? `${platform} ${navigator.userAgent.slice(0, 64)}`;
  const app_version = opts.app_version ?? '1.0.0';

  // 1. Generate a fresh Ed25519 keypair on this device
  const publicKeyHex = await generateAndStoreKeypair();

  // 2. Sign the proof
  const { signMessage } = await import('./identity');
  const proof = `${pkg.token}.${pkg.nonce}.${publicKeyHex}`;
  const signature = await signMessage(proof);

  // 3. POST the completion
  const url = `${trimSlash(serverBase)}/api/app/enrollment/complete`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: pkg.token, nonce: pkg.nonce,
      device_pubkey: publicKeyHex,
      device_name, device_model, device_os, app_version,
      signature,
      preferred_language: opts.preferred_language,
      confirmation_code: opts.confirmation_code,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Enrollment failed (${res.status})`);
  }
  const result = await res.json() as EnrollmentResult;

  // 4. Persist
  saveIdentityPublic({
    publicKeyHex,
    contactHash: result.user.contact_hash,
    displayName: result.user.display_name ?? '',
    preferredLanguage: opts.preferred_language ?? pkg.language_hint ?? 'en',
  });
  return result;
}

/**
 * Legacy `anton://join?server=&token=` flow — invitation-token path with
 * register-simple + join. Kept so old QR codes keep working until rotated.
 */
export async function legacyJoin(serverBase: string, token: string, displayName: string, language: string): Promise<{
  contactHash: string;
  sessionToken: string;
  org: { id: string; name: string };
}> {
  validateServerUrl(serverBase);
  // Register if no identity exists yet
  let identity = getIdentity();
  let sessionToken: string;
  if (!identity) {
    const regRes = await fetch(`${trimSlash(serverBase)}/api/app/register-simple`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, preferredLanguage: language }),
    });
    if (!regRes.ok) throw new Error((await regRes.json().catch(() => ({}))).error || 'Registration failed');
    const reg = await regRes.json();
    sessionToken = reg.sessionToken;
    saveIdentityPublic({
      publicKeyHex: '',
      contactHash: reg.contactHash,
      displayName,
      preferredLanguage: language,
    });
    identity = getIdentity()!;
  } else {
    // Need a fresh session token via challenge/verify (legacy)
    sessionToken = '';
  }

  const joinRes = await fetch(`${trimSlash(serverBase)}/api/app/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contactHash: identity.contactHash, invitationToken: token }),
  });
  if (!joinRes.ok) throw new Error((await joinRes.json().catch(() => ({}))).error || 'Join failed');
  const join = await joinRes.json();
  return {
    contactHash: identity.contactHash,
    sessionToken,
    org: { id: join.orgId, name: join.orgName },
  };
}

function trimSlash(s: string): string {
  return s.replace(/\/$/, '');
}

function defaultDeviceName(platform: string): string {
  switch (platform) {
    case 'ios':     return 'iPhone';
    case 'android': return 'Android device';
    default:        return 'Browser';
  }
}
