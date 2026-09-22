// ── App Enrollment Service — Companion App pairing per spec §5.2 ────────
//
// Replaces the legacy register-simple flow with the spec's enrollment
// package: short-lived token containing instance pubkey, cert fingerprint,
// endpoints, optional pre-bound user identity + role, and a one-time
// nonce. The client signs a completion request with its fresh Ed25519
// keypair; the server issues a device certificate + session token.
//
// Backwards-compatible: register-simple still works for clients that
// can't do Ed25519 (web crypto fallback).

import crypto from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';
import { hashSessionToken } from './identity.js';

// ── Types ────────────────────────────────────────────────────────────────

export interface EnrollmentEndpoints {
  /** Primary LAN URL (mDNS-resolved) */
  lan?: string;
  /** Public WAN URL (e.g. company-hosted) */
  wan?: string;
  /** mDNS service name for direct discovery */
  mdns_name?: string;
}

/**
 * How the Companion App should reach the instance. See docs/ANTON_MESH_SPEC.md.
 *   - 'public_https': direct HTTPS to endpoints.wan / endpoints.lan (current default)
 *   - 'mesh':         Noise-IK over relay (Phase 4+; field accepted earlier for forward-compat)
 *
 * Absent / null is treated as 'public_https' everywhere — existing pairings keep working.
 */
export type TransportKind = 'public_https' | 'mesh';

export interface EnrollmentPackage {
  token: string;
  nonce: string;
  instance_pubkey: string;
  instance_cert_fp: string | null;
  endpoints: EnrollmentEndpoints;
  /** Forward-compat: which transport adapter the device should use. Default 'public_https'. */
  transport?: TransportKind;
  /** Required when transport === 'mesh'. Ranked WSS relay URLs the device tries in order. */
  relay_endpoints?: string[];
  /** Mesh-only (§8): raw 32-byte Ed25519 pubkey hex. Pinned by the phone alongside instance_x_pk. */
  instance_ed_pk?: string;
  /** Mesh-only (§8): raw 32-byte X25519 pubkey hex (= ed_pk_to_curve25519(ed_pk)). */
  instance_x_pk?: string;
  /** Mesh-only (§8.1): 64-byte Ed25519 sig over (BINDING_DOMAIN || ed_pk || x_pk). */
  binding_sig?: string;
  intended_user_id: string | null;
  org_id: string | null;
  intended_role: string | null;
  display_name_hint: string | null;
  language_hint: string | null;
  expires_at: string;
  /** Display-friendly contact hash for the user to confirm */
  instance_contact_hash: string | null;
  instance_display_name: string | null;
  /** True if the issuer required an out-of-band confirmation code to complete */
  requires_confirmation_code: boolean;
}

export interface EnrollmentCompletionInput {
  token: string;
  nonce: string;
  device_pubkey: string;
  device_name: string;
  device_model: string;
  device_os: string;
  app_version: string;
  /** Hex-encoded Ed25519 signature over `${token}.${nonce}.${device_pubkey}` */
  signature: string;
  /** Optional override (e.g. user changed their language during pairing) */
  preferred_language?: string;
  /** Required when the package's requires_confirmation_code is true */
  confirmation_code?: string;
}

export interface EnrollmentCompletionResult {
  device_id: string;
  device_certificate: string;
  session_token: string;
  expires_at: string;
  user: { id: string; contact_hash: string; display_name: string | null };
  org: { id: string; name: string; role: string } | null;
}

export interface InstanceIdentity {
  pubkey: string;
  privkey: string;
  cert_fingerprint: string | null;
  display_name: string | null;
  contact_hash: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────

const ENROLLMENT_TOKEN_TTL_MS = 60_000;          // spec: ≤60s
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function urlSafe(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function makeContactHash(): string {
  // Spec: ANTON-XXXX-XXXX-XXXX-XXXX (uppercase alphanumeric, four 4-char groups)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // crockford-ish, no I/O/0/1
  const groups: string[] = [];
  for (let g = 0; g < 4; g++) {
    let s = '';
    for (let i = 0; i < 4; i++) s += chars[crypto.randomInt(0, chars.length)];
    groups.push(s);
  }
  return `ANTON-${groups.join('-')}`;
}

/** Six-digit out-of-band confirmation code the admin reads aloud (Phase H fix C2). */
function makeConfirmationCode(): string {
  // 100000–999999 inclusive
  return String(crypto.randomInt(100000, 1_000_000));
}

// ── Privkey encryption at rest (Phase H fix H2) ─────────────────────────
// AES-256-GCM keyed off process.env.INSTANCE_KEY_ENCRYPTION_KEY (32-byte
// hex == 64 hex characters).
//
// There are THREE states here and they must NOT be collapsed into two
// (launch audit 2026-09-06, HIGH):
//   unset            → the documented degraded dev mode: privkey stored
//                      plaintext in instance_identity.privkey + one-time warn.
//   set and valid    → encrypt (normal production behaviour).
//   set but unusable → OPERATOR ERROR. Throw, and never write or read key
//                      material in that state.
//
// Until this fix the third case returned null exactly like the first, so a
// typo, a stray `0x` prefix, a truncated paste or a trailing newline silently
// downgraded the instance's Ed25519 signing identity to PLAINTEXT in Postgres.
// From the outside that is indistinguishable from the encrypted case — phones
// pair normally — and the only signal was one console.warn per process, worded
// identically to the "not set" case. Anyone who can read that single row (a
// pg_dump in a backup bucket, a read replica, a DBA) can then mint device
// certificates and impersonate the instance to every paired phone. A warning
// is not a control; refusing to touch the identity is.
//
// Two things a later reader might otherwise "clean up" — don't:
//  1. The explicit regex. Buffer.from(x, 'hex') TRUNCATES at the first non-hex
//     character rather than throwing, which is exactly what made a malformed
//     key look like an absent one under the old decoded-length check.
//  2. The absence of .trim(). The same env var is decoded independently in
//     server/services/mesh/bootstrap.ts and server/lib/portal-key-cipher.ts,
//     neither of which trims. Accepting a whitespace-padded value HERE only
//     would let this module encrypt material those modules cannot decrypt.
//     A padded value is an operator error and is reported as one.

/** Thrown when INSTANCE_KEY_ENCRYPTION_KEY is present but unusable. A named
 *  type so callers and tests can tell operator misconfiguration apart from a
 *  genuine crypto failure. */
export class InstanceKeyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InstanceKeyConfigError';
  }
}

/** Exactly 32 bytes, hex-encoded. */
const KEY_HEX_RE = /^[0-9a-fA-F]{64}$/;

let loggedKeyConfigError = false;

/**
 * Resolve the at-rest encryption key.
 *   null   → env var absent: degraded plaintext mode (see warnPlaintextOnce)
 *   Buffer → usable 32-byte key
 *   throws → env var present but unusable (operator error, fail closed)
 *
 * Never logs or echoes the value — it IS the key. Only its length is reported,
 * which is what the operator needs to spot a truncated or padded paste.
 */
/**
 * Exported so evidence-pack/signer.ts can share it rather than keeping its own
 * copy. The copy is how this bug survived: signer.ts carried a comment saying it
 * mirrored this function, and mirrored the OLD two-state version, so a malformed
 * key still fell through to writing the Ed25519 private key in plaintext — into
 * the very same instance_identity row. One resolver, one behaviour.
 */
export function getEncryptionKey(): Buffer | null {
  const raw = process.env.INSTANCE_KEY_ENCRYPTION_KEY;
  // Undefined, or `INSTANCE_KEY_ENCRYPTION_KEY=` with nothing after it, means
  // "not configured" — the documented degraded mode, unchanged.
  if (raw === undefined || raw === '') return null;
  if (!KEY_HEX_RE.test(raw)) {
    const detail = /^[0-9a-fA-F]*$/.test(raw)
      ? `${raw.length} characters (expected exactly 64)`
      : `${raw.length} characters, at least one of them not a hex digit`;
    // The throw is the control; this log exists because in production
    // safeError() reduces the HTTP body to "An error occurred", so the server
    // log is the only place an operator can see WHY pairing stopped working.
    if (!loggedKeyConfigError) {
      loggedKeyConfigError = true;
      console.error(
        `[app-enrollment] CONFIG ERROR: INSTANCE_KEY_ENCRYPTION_KEY is set but unusable — ${detail}. `
        + 'Instance-identity operations (pairing, signing) are refused until it is fixed. '
        + 'Generate one with `openssl rand -hex 32`, or unset the variable to accept plaintext storage.',
      );
    }
    throw new InstanceKeyConfigError(
      `INSTANCE_KEY_ENCRYPTION_KEY is set but unusable — ${detail}. `
      + 'Refusing to touch the instance identity: a wrong key must never fall back to '
      + 'storing the Ed25519 private key in plaintext.',
    );
  }
  return Buffer.from(raw, 'hex');
}

function encryptPrivkey(plaintextHex: string): { encrypted: Buffer; iv: Buffer } | null {
  const key = getEncryptionKey();
  if (!key) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(Buffer.from(plaintextHex, 'hex')), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Pack tag at the end so we can store + read as one blob
  return { encrypted: Buffer.concat([enc, tag]), iv };
}

function decryptPrivkey(encrypted: Buffer, iv: Buffer): string {
  // getEncryptionKey() throws on a malformed key — a wrong key must never
  // reach the "no key" branch and be handled like an absent one.
  const key = getEncryptionKey();
  if (!key) throw new Error('INSTANCE_KEY_ENCRYPTION_KEY missing — cannot decrypt instance privkey');
  // Last 16 bytes are the GCM auth tag
  const tag = encrypted.subarray(encrypted.length - 16);
  const ciphertext = encrypted.subarray(0, encrypted.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return dec.toString('hex');
  } catch (err) {
    // GCM tag mismatch. Overwhelmingly this means INSTANCE_KEY_ENCRYPTION_KEY
    // was CHANGED after this row was written. There is no safe fallback: in
    // particular the caller must never end up treating the ciphertext as if it
    // were the plaintext privkey, so we rethrow rather than degrade.
    throw new Error(
      'instance_identity.privkey_encrypted failed to decrypt (AES-GCM authentication failed) — '
      + 'INSTANCE_KEY_ENCRYPTION_KEY does not match the key this row was written with. '
      + 'Restore the original key; losing it means re-pairing every Companion device.',
      { cause: err },
    );
  }
}

let warnedNoEncKey = false;
function warnPlaintextOnce(): void {
  if (warnedNoEncKey) return;
  warnedNoEncKey = true;
  console.warn('[app-enrollment] WARNING: INSTANCE_KEY_ENCRYPTION_KEY is not set — instance Ed25519 privkey is stored in PLAINTEXT. Set the env var to a 32-byte hex string for production.');
}

/** Build the payload the device signs to complete enrollment. */
export function enrollmentSignaturePayload(token: string, nonce: string, devicePubkey: string): string {
  return `${token}.${nonce}.${devicePubkey}`;
}

// ── Service ──────────────────────────────────────────────────────────────

export function createAppEnrollmentService(db: DatabaseAdapter) {

  // ── Instance identity (one row, lazily created) ─────────────────────

  async function getOrCreateInstanceIdentity(): Promise<InstanceIdentity> {
    type Row = { pubkey: string; privkey: string | null; privkey_encrypted: Buffer | null; privkey_iv: Buffer | null; cert_fingerprint: string | null; display_name: string | null; contact_hash: string | null };
    const existing = await db.get<Row>(
      `SELECT pubkey, privkey, privkey_encrypted, privkey_iv, cert_fingerprint, display_name, contact_hash
         FROM instance_identity WHERE singleton = 'singleton'`,
    );
    if (existing) {
      let privkey: string;
      if (existing.privkey_encrypted && existing.privkey_iv) {
        privkey = decryptPrivkey(Buffer.from(existing.privkey_encrypted), Buffer.from(existing.privkey_iv));
      } else if (existing.privkey) {
        // Legacy plaintext — opportunistically migrate to encrypted form
        privkey = existing.privkey;
        const enc = encryptPrivkey(privkey);
        if (enc) {
          await db.run(
            `UPDATE instance_identity SET privkey_encrypted = ?, privkey_iv = ?, privkey = NULL WHERE singleton = 'singleton'`,
            enc.encrypted, enc.iv,
          );
        } else {
          // Reachable ONLY when the env var is genuinely unset — a malformed
          // one throws out of encryptPrivkey rather than leaving the row
          // plaintext and warning about it.
          warnPlaintextOnce();
        }
      } else {
        throw new Error('instance_identity row is corrupt — no privkey material');
      }
      return {
        pubkey: existing.pubkey, privkey,
        cert_fingerprint: existing.cert_fingerprint,
        display_name: existing.display_name,
        contact_hash: existing.contact_hash,
      };
    }

    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const pubkeyHex = publicKey.export({ format: 'der', type: 'spki' }).toString('hex');
    const privkeyHex = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('hex');
    const contactHash = makeContactHash();
    const displayName = process.env.APP_GATEWAY_INSTANCE_NAME || process.env.APP_GATEWAY_MDNS_NAME || 'ANTON';
    const enc = encryptPrivkey(privkeyHex);
    if (!enc) warnPlaintextOnce();

    await db.run(
      `INSERT INTO instance_identity (singleton, pubkey, privkey, privkey_encrypted, privkey_iv, display_name, contact_hash)
       VALUES ('singleton', ?, ?, ?, ?, ?, ?)
       ON CONFLICT (singleton) DO NOTHING`,
      pubkeyHex,
      // Plaintext only when the env var is genuinely UNSET. A set-but-broken
      // key never reaches here: encryptPrivkey() above throws first.
      enc ? null : privkeyHex,
      enc?.encrypted ?? null,
      enc?.iv ?? null,
      displayName, contactHash,
    );
    return getOrCreateInstanceIdentity();   // re-read with the new row
  }

  // ── Mesh-format identity cache (Phase 5.1) ──────────────────────────

  async function loadCachedMeshFields(): Promise<{ ed_pk: string; x_pk: string; binding_sig: string } | null> {
    type Row = { ed25519_pubkey_raw: string | null; x25519_pubkey: string | null; binding_sig: string | null };
    const row = await db.get<Row>(
      `SELECT ed25519_pubkey_raw, x25519_pubkey, binding_sig
         FROM instance_identity WHERE singleton = 'singleton'`,
    );
    if (!row || !row.ed25519_pubkey_raw || !row.x25519_pubkey || !row.binding_sig) return null;
    return { ed_pk: row.ed25519_pubkey_raw, x_pk: row.x25519_pubkey, binding_sig: row.binding_sig };
  }

  async function persistMeshFields(m: import('./mesh/identity.js').MeshIdentity): Promise<void> {
    // Encrypt the X25519 privkey with the same KEK used for Ed25519.
    const enc = encryptPrivkey(m.x25519PrivkeyHex);
    await db.run(
      `UPDATE instance_identity SET
         ed25519_pubkey_raw = ?,
         x25519_pubkey = ?,
         x25519_privkey_encrypted = ?,
         x25519_privkey_iv = ?,
         binding_sig = ?,
         mesh_instance_id = ?
       WHERE singleton = 'singleton'`,
      m.ed25519PubkeyHex,
      m.x25519PubkeyHex,
      enc?.encrypted ?? null,
      enc?.iv ?? null,
      m.bindingSigHex,
      m.instanceIdHex,
    );
  }

  /** Sign a payload with the instance's Ed25519 privkey. */
  async function signWithInstanceKey(payload: string): Promise<string> {
    const id = await getOrCreateInstanceIdentity();
    const privKey = crypto.createPrivateKey({ key: Buffer.from(id.privkey, 'hex'), format: 'der', type: 'pkcs8' });
    const sig = crypto.sign(null, Buffer.from(payload, 'utf8'), privKey);
    return sig.toString('hex');
  }

  /**
   * Verify a payload signature with the device's Ed25519 pubkey.
   * Accepts the device pubkey in either:
   *   - DER SPKI hex (88 chars, 44 bytes — what `crypto.createPublicKey` exports)
   *   - Raw Ed25519 hex (64 chars, 32 bytes — what the Companion App produces
   *     via `@noble/ed25519`'s `getPublicKeyAsync`)
   * For raw input we prepend the fixed DER SPKI prefix for Ed25519
   * (RFC 8410 §4): SEQUENCE { SEQUENCE { OID 1.3.101.112 } BIT STRING }.
   */
  function verifyWithDeviceKey(devicePubkey: string, payload: string, signatureHex: string): boolean {
    try {
      const ED25519_SPKI_PREFIX = '302a300506032b6570032100';
      let derHex: string;
      if (devicePubkey.length === 64) {
        derHex = ED25519_SPKI_PREFIX + devicePubkey;
      } else {
        derHex = devicePubkey;
      }
      const pubKey = crypto.createPublicKey({ key: Buffer.from(derHex, 'hex'), format: 'der', type: 'spki' });
      return crypto.verify(null, Buffer.from(payload, 'utf8'), pubKey, Buffer.from(signatureHex, 'hex'));
    } catch {
      return false;
    }
  }

  // ── Enrollment lifecycle ───────────────────────────────────────────

  /** Admin-initiated: generate an enrollment token + return the full QR payload. */
  async function startEnrollment(input: {
    intended_user_id?: string | null;
    org_id?: string | null;
    intended_role?: string | null;
    display_name_hint?: string | null;
    language_hint?: string | null;
    endpoints: EnrollmentEndpoints;
    /** Optional. When set, baked into the QR so the device knows which
     *  transport adapter to use. Omit ⇒ legacy public_https path. */
    transport?: TransportKind;
    /** Required when transport === 'mesh'. Ignored otherwise. */
    relay_endpoints?: string[];
    issued_by_user_id: string;
    /** Defaults: TRUE when intended_user_id is set (binding intent ⇒ OOB
     *  confirmation), FALSE for self-serve enrollments. */
    require_confirmation_code?: boolean;
  }): Promise<EnrollmentPackage & { confirmation_code: string | null }> {
    const identity = await getOrCreateInstanceIdentity();
    const token = urlSafe(crypto.randomBytes(24));
    const nonce = urlSafe(crypto.randomBytes(16));
    const expiresAt = new Date(Date.now() + ENROLLMENT_TOKEN_TTL_MS).toISOString();
    // Default: require code when binding to a specific user (Phase H fix C2)
    const wantCode = input.require_confirmation_code ?? !!input.intended_user_id;
    const code = wantCode ? makeConfirmationCode() : null;

    // Mesh transport: pull relay endpoints from caller, then mesh-config-service
    // (DB override → env fallback), then fail. Track C Slice 2 routes through
    // the service so admin-flipped relay lists are used by new enrollments
    // without a server restart.
    let relayEndpoints = input.relay_endpoints;
    if (input.transport === 'mesh' && (!relayEndpoints || relayEndpoints.length === 0)) {
      const { getRelayEndpoints } = await import('./mesh-config-service.js');
      const cfg = await getRelayEndpoints(db);
      if (cfg.endpoints.length > 0) relayEndpoints = cfg.endpoints;
    }
    if (input.transport === 'mesh' && (!relayEndpoints || relayEndpoints.length === 0)) {
      throw new Error('mesh transport requires at least one relay endpoint (set ANTON_MESH_RELAYS, configure via PUT /api/admin/app/mesh/relays, or pass relay_endpoints)');
    }
    const relayJson = relayEndpoints && relayEndpoints.length > 0
      ? JSON.stringify(relayEndpoints)
      : null;

    // Mesh transport: derive the (ed_pk, x_pk, binding_sig) triple from the
    // existing Ed25519 identity. Cached on the instance_identity row.
    let meshFields: { ed_pk: string; x_pk: string; binding_sig: string } | null = null;
    if (input.transport === 'mesh') {
      const cached = await loadCachedMeshFields();
      if (cached) {
        meshFields = cached;
      } else {
        const { rawFromDerKeypair, deriveMeshIdentity } = await import('./mesh/identity.js');
        const raw = rawFromDerKeypair(identity.pubkey, identity.privkey);
        const m = deriveMeshIdentity(raw.ed25519PubkeyHex, raw.ed25519PrivkeyHex);
        await persistMeshFields(m);
        meshFields = {
          ed_pk: m.ed25519PubkeyHex,
          x_pk: m.x25519PubkeyHex,
          binding_sig: m.bindingSigHex,
        };
      }
    }

    await db.run(
      `INSERT INTO app_enrollment_tokens
         (token, nonce, instance_pubkey, instance_cert_fp, endpoints,
          intended_user_id, org_id, intended_role,
          display_name_hint, language_hint,
          expires_at, created_by_user_id, confirmation_code,
          transport, relay_endpoints)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      token, nonce, identity.pubkey, identity.cert_fingerprint,
      JSON.stringify(input.endpoints),
      input.intended_user_id ?? null,
      input.org_id ?? null,
      input.intended_role ?? 'member',
      input.display_name_hint ?? null,
      input.language_hint ?? null,
      expiresAt, input.issued_by_user_id, code,
      input.transport ?? null, relayJson,
    );

    return {
      token, nonce,
      instance_pubkey: identity.pubkey,
      instance_cert_fp: identity.cert_fingerprint,
      endpoints: input.endpoints,
      transport: input.transport,
      relay_endpoints: relayEndpoints,
      instance_ed_pk: meshFields?.ed_pk,
      instance_x_pk: meshFields?.x_pk,
      binding_sig: meshFields?.binding_sig,
      intended_user_id: input.intended_user_id ?? null,
      org_id: input.org_id ?? null,
      intended_role: input.intended_role ?? 'member',
      display_name_hint: input.display_name_hint ?? null,
      language_hint: input.language_hint ?? null,
      expires_at: expiresAt,
      instance_contact_hash: identity.contact_hash,
      instance_display_name: identity.display_name,
      requires_confirmation_code: !!code,
      confirmation_code: code,        // returned to admin only — never to the device
    };
  }

  /** Public: fetch enrollment package by token (single-use validity check).
   *  Never returns the confirmation_code itself — only whether one is required. */
  async function getEnrollment(token: string): Promise<EnrollmentPackage | null> {
    type Row = {
      token: string; nonce: string; instance_pubkey: string; instance_cert_fp: string | null;
      endpoints: string | object; intended_user_id: string | null; org_id: string | null;
      intended_role: string | null; display_name_hint: string | null;
      language_hint: string | null; expires_at: string; used_at: string | null;
      confirmation_code: string | null;
      transport: string | null; relay_endpoints: string | null;
    };
    const row = await db.get<Row>(
      `SELECT token, nonce, instance_pubkey, instance_cert_fp, endpoints,
              intended_user_id, org_id, intended_role,
              display_name_hint, language_hint, expires_at, used_at,
              confirmation_code,
              transport, relay_endpoints
         FROM app_enrollment_tokens WHERE token = ?`,
      token,
    );
    if (!row) return null;
    if (row.used_at) return null;
    if (new Date(row.expires_at) < new Date()) return null;
    const identity = await getOrCreateInstanceIdentity();
    // Parse relay_endpoints defensively — bad JSON should not 500 the
    // pairing flow; treat it as "no relays" so the device falls back to
    // public_https. We log nothing because the row is user-influenced.
    let relayEndpoints: string[] | undefined;
    if (row.relay_endpoints) {
      try {
        const parsed = JSON.parse(row.relay_endpoints);
        if (Array.isArray(parsed) && parsed.every(x => typeof x === 'string')) {
          relayEndpoints = parsed;
        }
      } catch { /* ignore — leave undefined */ }
    }
    const transport: TransportKind | undefined =
      row.transport === 'mesh' || row.transport === 'public_https' ? row.transport : undefined;
    // For mesh pairings, surface the cached (ed_pk, x_pk, binding_sig) triple
    // so the phone can pin them at QR-scan time. Skipped for public_https.
    const meshFields = transport === 'mesh' ? await loadCachedMeshFields() : null;

    return {
      token: row.token,
      nonce: row.nonce,
      instance_pubkey: row.instance_pubkey,
      instance_cert_fp: row.instance_cert_fp,
      endpoints: typeof row.endpoints === 'string' ? JSON.parse(row.endpoints) : (row.endpoints as EnrollmentEndpoints),
      transport,
      relay_endpoints: relayEndpoints,
      instance_ed_pk: meshFields?.ed_pk,
      instance_x_pk: meshFields?.x_pk,
      binding_sig: meshFields?.binding_sig,
      intended_user_id: row.intended_user_id,
      org_id: row.org_id,
      intended_role: row.intended_role,
      display_name_hint: row.display_name_hint,
      language_hint: row.language_hint,
      expires_at: row.expires_at,
      instance_contact_hash: identity.contact_hash,
      instance_display_name: identity.display_name,
      requires_confirmation_code: !!row.confirmation_code,
    };
  }

  /** Public: complete enrollment with signed device-pubkey proof. */
  async function completeEnrollment(input: EnrollmentCompletionInput): Promise<EnrollmentCompletionResult> {
    // 1. Look up + validate token
    type Row = {
      id: string; nonce: string; expires_at: string; used_at: string | null;
      intended_user_id: string | null; org_id: string | null; intended_role: string | null;
      display_name_hint: string | null; language_hint: string | null;
      instance_cert_fp: string | null;
      confirmation_code: string | null;
    };
    const row = await db.get<Row>(
      `SELECT id, nonce, expires_at, used_at,
              intended_user_id, org_id, intended_role,
              display_name_hint, language_hint, instance_cert_fp,
              confirmation_code
         FROM app_enrollment_tokens WHERE token = ?`,
      input.token,
    );
    if (!row) throw new Error('Invalid or expired enrollment token');
    if (row.used_at) throw new Error('Invalid or expired enrollment token');
    if (new Date(row.expires_at) < new Date()) throw new Error('Invalid or expired enrollment token');
    if (row.nonce !== input.nonce) throw new Error('Invalid or expired enrollment token');

    // 1b. Confirmation-code gate — Phase H fix C2 (intended_user binding bypass)
    if (row.confirmation_code) {
      const supplied = String(input.confirmation_code ?? '').trim();
      // Constant-time compare against the stored 6-digit code
      const a = Buffer.from(supplied);
      const b = Buffer.from(row.confirmation_code);
      const match = a.length === b.length && crypto.timingSafeEqual(a, b);
      if (!match) throw new Error('Invalid confirmation code');
    }

    // 2. Verify the device signature over (token, nonce, pubkey)
    const payload = enrollmentSignaturePayload(input.token, input.nonce, input.device_pubkey);
    if (!verifyWithDeviceKey(input.device_pubkey, payload, input.signature)) {
      throw new Error('Invalid enrollment signature');
    }

    // 3. Resolve the connected_user — either pre-bound via intended_user_id
    //    or newly created
    let userId: string;
    let contactHash: string;
    let displayName: string | null;
    if (row.intended_user_id) {
      const user = await db.get<{ id: string; contact_hash: string; display_name: string | null; status: string }>(
        `SELECT id, contact_hash, display_name, status FROM connected_users WHERE id = ?`,
        row.intended_user_id,
      );
      if (!user || user.status !== 'active') throw new Error('Bound user is no longer active');
      userId = user.id;
      contactHash = user.contact_hash;
      displayName = user.display_name;
    } else {
      // Self-serve enrollment — create a fresh connected_user
      contactHash = makeContactHash();
      displayName = row.display_name_hint;
      const created = await db.get<{ id: string }>(
        `INSERT INTO connected_users (contact_hash, public_key, display_name, preferred_language)
         VALUES (?, ?, ?, ?)
         RETURNING id`,
        contactHash, input.device_pubkey, displayName,
        input.preferred_language ?? row.language_hint ?? 'en',
      );
      if (!created) throw new Error('Failed to create user during enrollment');
      userId = created.id;
    }

    // 4. Create the device record
    const deviceCert = await issueDeviceCertificate(userId, input.device_pubkey);
    const device = await db.get<{ id: string }>(
      `INSERT INTO app_devices
         (connected_user_id, device_pubkey, device_certificate,
          device_name, device_model, device_os, app_version,
          instance_cert_fingerprint, biometric_required)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)
       ON CONFLICT (connected_user_id, device_pubkey)
         DO UPDATE SET device_certificate = EXCLUDED.device_certificate,
                       device_name = EXCLUDED.device_name,
                       device_model = EXCLUDED.device_model,
                       device_os = EXCLUDED.device_os,
                       app_version = EXCLUDED.app_version,
                       last_seen_at = NOW(),
                       revoked_at = NULL
       RETURNING id`,
      userId, input.device_pubkey, deviceCert,
      input.device_name, input.device_model, input.device_os, input.app_version,
      row.instance_cert_fp,
    );
    if (!device) throw new Error('Failed to register device');

    // 5. Bind to org if pre-specified
    let orgInfo: { id: string; name: string; role: string } | null = null;
    if (row.org_id) {
      await db.run(
        `INSERT INTO connected_user_orgs (connected_user_id, org_id, role)
         VALUES (?, ?, ?)
         ON CONFLICT (connected_user_id, org_id) DO UPDATE SET status = 'active', role = EXCLUDED.role`,
        userId, row.org_id, row.intended_role ?? 'member',
      );
      const org = await db.get<{ id: string; name: string }>(
        `SELECT id, name FROM org_profiles WHERE id = ?`, row.org_id,
      );
      if (org) orgInfo = { id: org.id, name: org.name, role: row.intended_role ?? 'member' };
    }

    // 6. Issue a session token (hashed in DB, plaintext returned)
    const sessionRaw = urlSafe(crypto.randomBytes(32));
    const sessionHash = hashSessionToken(sessionRaw);
    const sessionExpires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    // device_id is what makes revokeDevice() able to end this session later.
    // Without it, unpairing the device left the token valid for its full 30-day
    // TTL (migration 251).
    await db.run(
      `INSERT INTO app_session_tokens (token, connected_user_id, expires_at, device_id)
       VALUES (?, ?, ?, ?)`,
      sessionHash, userId, sessionExpires, device.id,
    );

    // 7. Burn the token
    await db.run(
      `UPDATE app_enrollment_tokens
          SET used_at = NOW(), used_by_device_id = ?
        WHERE id = ?`,
      device.id, row.id,
    );

    return {
      device_id: device.id,
      device_certificate: deviceCert,
      session_token: sessionRaw,
      expires_at: sessionExpires,
      user: { id: userId, contact_hash: contactHash, display_name: displayName },
      org: orgInfo,
    };
  }

  /** Sign a device certificate that the device will present on every connection. */
  async function issueDeviceCertificate(userId: string, devicePubkey: string): Promise<string> {
    const issued = new Date().toISOString();
    const claims = JSON.stringify({
      v: 1, iss: 'anton-instance', sub: userId, pk: devicePubkey, iat: issued,
    });
    const claimsB64 = Buffer.from(claims, 'utf8').toString('base64');
    const sig = await signWithInstanceKey(claimsB64);
    return `${claimsB64}.${sig}`;
  }

  // ── Device management ──────────────────────────────────────────────

  async function listDevices(connectedUserId: string): Promise<Array<{
    id: string; device_name: string | null; device_model: string | null;
    device_os: string | null; app_version: string | null;
    biometric_required: boolean; created_at: string; last_seen_at: string | null;
  }>> {
    return db.all(
      `SELECT id, device_name, device_model, device_os, app_version,
              biometric_required, created_at, last_seen_at
         FROM app_devices
        WHERE connected_user_id = ? AND revoked_at IS NULL
        ORDER BY last_seen_at DESC NULLS LAST, created_at DESC`,
      connectedUserId,
    );
  }

  /**
   * Unpair a device. This is the control an operator reaches for when a phone is
   * lost or stolen or an employee leaves, so it has to actually end access —
   * marking the row revoked is not enough on its own.
   *
   * Ordering matters: kill the live credential FIRST, then mark the device. If
   * the device UPDATE succeeded and the session DELETE then failed, the caller
   * would see an error while the UI's listDevices() (which filters
   * `revoked_at IS NULL`) had already stopped showing the device — the exact
   * state that made this bug invisible. Doing sessions first means a partial
   * failure leaves the device still listed and still revocable.
   */
  async function revokeDevice(connectedUserId: string, deviceId: string): Promise<void> {
    // 1. End every session issued to this device.
    //
    // The `device_id IS NULL` arm covers sessions issued BEFORE migration 251,
    // which carry no device attribution and never can. They are indistinguishable
    // from a session belonging to the device being revoked, so unpairing clears
    // them too. That can sign out another of this user's older devices, which is
    // the correct trade for a revocation control: it fails safe (over-revoking)
    // rather than silently leaving a stolen phone authenticated. The arm becomes
    // a no-op once pre-251 sessions age past their 30-day TTL.
    await db.run(
      `DELETE FROM app_session_tokens
        WHERE connected_user_id = ?
          AND (device_id = ? OR device_id IS NULL)`,
      connectedUserId, deviceId,
    );
    // 2. Mark the device revoked (app-auth + requireApproved both refuse it now).
    await db.run(
      `UPDATE app_devices SET revoked_at = NOW()
        WHERE id = ? AND connected_user_id = ? AND revoked_at IS NULL`,
      deviceId, connectedUserId,
    );
    // 3. Stop pushing to it.
    await db.run(
      `UPDATE app_push_tokens SET enabled = FALSE WHERE device_id = ?`,
      deviceId,
    );
  }

  /** Periodic cleanup — drop expired enrollment tokens + replay nonces. */
  async function pruneExpired(): Promise<{ tokens: number; nonces: number }> {
    const t = await db.run(
      `DELETE FROM app_enrollment_tokens WHERE expires_at < NOW() AND used_at IS NULL`,
    );
    const n = await db.run(
      `DELETE FROM app_signed_envelope_nonces WHERE expires_at < NOW()`,
    );
    return { tokens: t?.changes ?? 0, nonces: n?.changes ?? 0 };
  }

  // ── Signed envelope verification (replay-protected) ────────────────

  /** Verify a signed envelope from a device. Returns the device id on success. */
  async function verifySignedEnvelope(input: {
    device_pubkey: string;
    nonce: string;
    payload: string;
    signature: string;
  }): Promise<{ device_id: string }> {
    // 1. Find the device
    const device = await db.get<{ id: string }>(
      `SELECT id FROM app_devices
        WHERE device_pubkey = ? AND revoked_at IS NULL`,
      input.device_pubkey,
    );
    if (!device) throw new Error('Unknown or revoked device');

    // 2. Verify signature over the payload (which includes the nonce)
    if (!verifyWithDeviceKey(input.device_pubkey, input.payload, input.signature)) {
      throw new Error('Invalid envelope signature');
    }

    // 3. Replay defence — INSERT the nonce; conflict = replay
    try {
      await db.run(
        `INSERT INTO app_signed_envelope_nonces (nonce, device_id, expires_at)
         VALUES (?, ?, NOW() + INTERVAL '24 hours')`,
        input.nonce, device.id,
      );
    } catch {
      throw new Error('Envelope nonce already seen (replay rejected)');
    }

    // 4. Bump last_seen_at
    db.run(`UPDATE app_devices SET last_seen_at = NOW() WHERE id = ?`, device.id).catch(() => {});

    return { device_id: device.id };
  }

  return {
    getOrCreateInstanceIdentity,
    startEnrollment,
    getEnrollment,
    completeEnrollment,
    listDevices,
    revokeDevice,
    pruneExpired,
    verifySignedEnvelope,
    signWithInstanceKey,
  };
}

export type AppEnrollmentService = ReturnType<typeof createAppEnrollmentService>;
