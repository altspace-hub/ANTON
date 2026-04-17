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
// hex). When the env var is missing, fall back to plaintext storage AND
// log a one-time warning.

function getEncryptionKey(): Buffer | null {
  const k = process.env.INSTANCE_KEY_ENCRYPTION_KEY;
  if (!k) return null;
  const buf = Buffer.from(k, 'hex');
  return buf.length === 32 ? buf : null;
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
  const key = getEncryptionKey();
  if (!key) throw new Error('INSTANCE_KEY_ENCRYPTION_KEY missing — cannot decrypt instance privkey');
  // Last 16 bytes are the GCM auth tag
  const tag = encrypted.subarray(encrypted.length - 16);
  const ciphertext = encrypted.subarray(0, encrypted.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return dec.toString('hex');
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
      enc ? null : privkeyHex,         // plaintext only when no key set
      enc?.encrypted ?? null,
      enc?.iv ?? null,
      displayName, contactHash,
    );
    return getOrCreateInstanceIdentity();   // re-read with the new row
  }

  /** Sign a payload with the instance's Ed25519 privkey. */
  async function signWithInstanceKey(payload: string): Promise<string> {
    const id = await getOrCreateInstanceIdentity();
    const privKey = crypto.createPrivateKey({ key: Buffer.from(id.privkey, 'hex'), format: 'der', type: 'pkcs8' });
    const sig = crypto.sign(null, Buffer.from(payload, 'utf8'), privKey);
    return sig.toString('hex');
  }

  /** Verify a payload signature with the device's Ed25519 pubkey. */
  function verifyWithDeviceKey(devicePubkey: string, payload: string, signatureHex: string): boolean {
    try {
      const pubKey = crypto.createPublicKey({ key: Buffer.from(devicePubkey, 'hex'), format: 'der', type: 'spki' });
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

    await db.run(
      `INSERT INTO app_enrollment_tokens
         (token, nonce, instance_pubkey, instance_cert_fp, endpoints,
          intended_user_id, org_id, intended_role,
          display_name_hint, language_hint,
          expires_at, created_by_user_id, confirmation_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      token, nonce, identity.pubkey, identity.cert_fingerprint,
      JSON.stringify(input.endpoints),
      input.intended_user_id ?? null,
      input.org_id ?? null,
      input.intended_role ?? 'member',
      input.display_name_hint ?? null,
      input.language_hint ?? null,
      expiresAt, input.issued_by_user_id, code,
    );

    return {
      token, nonce,
      instance_pubkey: identity.pubkey,
      instance_cert_fp: identity.cert_fingerprint,
      endpoints: input.endpoints,
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
    };
    const row = await db.get<Row>(
      `SELECT token, nonce, instance_pubkey, instance_cert_fp, endpoints,
              intended_user_id, org_id, intended_role,
              display_name_hint, language_hint, expires_at, used_at,
              confirmation_code
         FROM app_enrollment_tokens WHERE token = ?`,
      token,
    );
    if (!row) return null;
    if (row.used_at) return null;
    if (new Date(row.expires_at) < new Date()) return null;
    const identity = await getOrCreateInstanceIdentity();
    return {
      token: row.token,
      nonce: row.nonce,
      instance_pubkey: row.instance_pubkey,
      instance_cert_fp: row.instance_cert_fp,
      endpoints: typeof row.endpoints === 'string' ? JSON.parse(row.endpoints) : (row.endpoints as EnrollmentEndpoints),
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
    await db.run(
      `INSERT INTO app_session_tokens (token, connected_user_id, expires_at)
       VALUES (?, ?, ?)`,
      sessionHash, userId, sessionExpires,
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

  async function revokeDevice(connectedUserId: string, deviceId: string): Promise<void> {
    await db.run(
      `UPDATE app_devices SET revoked_at = NOW()
        WHERE id = ? AND connected_user_id = ? AND revoked_at IS NULL`,
      deviceId, connectedUserId,
    );
    // Also disable any push tokens
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
