/**
 * bootstrap.ts — wire the mesh stack into the live Express server.
 *
 * Called once at server boot from server/index.ts. Reads relay URLs from
 * ANTON_MESH_RELAYS, loads the cached mesh fields off instance_identity
 * (computing them on demand if they're missing — same code path the
 * enrollment service uses), then starts a long-lived MeshDialer with
 * bridge hooks that route every inbound RPC into the Express app.
 *
 * No-op when ANTON_MESH_RELAYS is unset — the public_https transport
 * keeps working unchanged.
 *
 * Spec: docs/ANTON_MESH_SPEC.md §1.4 (instance dials all relays in
 * parallel) + §9 (auth chaining).
 */

import crypto from 'node:crypto';
import type { Express } from 'express';
import type { DatabaseAdapter } from '../../db/database.js';
import { MeshDialer } from './dialer.js';
import { buildBridgeHooks } from './bridge.js';
import { rawFromDerKeypair, deriveMeshIdentity, type MeshIdentity } from './identity.js';

let activeDialer: MeshDialer | null = null;

export async function startMeshDialer(db: DatabaseAdapter, app: Express): Promise<void> {
  // Track C Slice 2: source of truth is mesh-config-service (DB override
  // → env fallback). When the operator flips the override via the admin
  // endpoint, the dialer picks it up on the next server restart; phones
  // refresh sooner via /instance-info on next app launch.
  const { getRelayEndpoints } = await import('../mesh-config-service.js');
  const { endpoints: relayUrls, source } = await getRelayEndpoints(db);
  if (relayUrls.length === 0) {
    // Mesh transport not configured — public_https only. Silent no-op.
    return;
  }
  if (source === 'db') {
    console.log(`[mesh] Using ${relayUrls.length} relay(s) from DB override`);
  }

  const mesh = await loadOrComputeMeshIdentity(db);
  if (!mesh) {
    console.warn('[mesh] Could not load instance identity — dialer not started');
    return;
  }

  // Express's app object IS a `(req, res) => void` handler — passing it
  // through to the bridge means every inbound RPC frame gets dispatched
  // through the entire middleware chain (CORS, body-parser, rate limits,
  // auth, etc), exactly as if it had arrived over plain HTTP.
  const bridgeHooks = buildBridgeHooks({
    expressHandler: (req, res) => app(req, res),
    attachPhoneStaticHeader: true,
    requestTimeoutMs: 60_000,
  });

  activeDialer = new MeshDialer({
    relayUrls,
    ed25519: {
      publicKey: hexToBytes(mesh.ed25519PubkeyHex),
      privateKey: hexToBytes(mesh.ed25519PrivkeyHex),
    },
    x25519: {
      publicKey: hexToBytes(mesh.x25519PubkeyHex),
      privateKey: hexToBytes(mesh.x25519PrivkeyHex),
    },
    instanceId: hexToBytes(mesh.instanceIdHex),
    bindingSig: hexToBytes(mesh.bindingSigHex),
    onSessionOpen: bridgeHooks.onSessionOpen,
    onSessionData: bridgeHooks.onSessionData,
    onSessionClose: bridgeHooks.onSessionClose,
    onReachabilityChange: (reachable) => {
      console.log(`[mesh] reachability: ${reachable ? 'CONNECTED' : 'OFFLINE'}`);
    },
  });
  activeDialer.start();

  console.log(`[mesh] Dialer started — relays: ${relayUrls.join(', ')}, instance_id: ${mesh.instanceIdHex.slice(0, 8)}…`);

  // Graceful shutdown — close the dialer when the process exits.
  const stop = (): void => {
    try { activeDialer?.stop(); } catch { /* ignore */ }
    activeDialer = null;
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

// ── Identity load + cache ─────────────────────────────────────────────

interface IdentityRow {
  pubkey: string;                            // DER SPKI Ed25519 pubkey hex
  privkey: string | null;                    // legacy plaintext DER privkey hex
  privkey_encrypted: Buffer | null;
  privkey_iv: Buffer | null;
  ed25519_pubkey_raw: string | null;         // raw 32-byte Ed25519 pubkey hex (cache)
  x25519_pubkey: string | null;              // raw 32-byte X25519 pubkey hex (cache)
  x25519_privkey_encrypted: Buffer | null;
  x25519_privkey_iv: Buffer | null;
  binding_sig: string | null;                // 64-byte hex (cache)
  mesh_instance_id: string | null;           // 16-byte hex (cache)
}

async function loadOrComputeMeshIdentity(db: DatabaseAdapter): Promise<MeshIdentity | null> {
  const row = await db.get<IdentityRow>(
    `SELECT pubkey, privkey, privkey_encrypted, privkey_iv,
            ed25519_pubkey_raw, x25519_pubkey,
            x25519_privkey_encrypted, x25519_privkey_iv,
            binding_sig, mesh_instance_id
       FROM instance_identity WHERE singleton = 'singleton'`,
  );
  if (!row) return null;

  // Decrypt the DER Ed25519 privkey (encrypted-at-rest path is canonical;
  // legacy plaintext column is the fallback).
  const derPrivkeyHex = row.privkey_encrypted && row.privkey_iv
    ? decryptPrivkey(Buffer.from(row.privkey_encrypted), Buffer.from(row.privkey_iv))
    : row.privkey;
  if (!derPrivkeyHex) {
    console.warn('[mesh] instance_identity has no decryptable privkey');
    return null;
  }

  // Convert DER → raw Ed25519 keypair (single source of truth — same
  // helper the enrollment service uses to compute the binding_sig).
  const rawKp = rawFromDerKeypair(row.pubkey, derPrivkeyHex);

  // Cache hit: all four mesh-fields present + X25519 priv decryptable.
  if (
    row.ed25519_pubkey_raw && row.x25519_pubkey && row.binding_sig &&
    row.mesh_instance_id && row.x25519_privkey_encrypted && row.x25519_privkey_iv
  ) {
    const xPrivHex = decryptPrivkey(
      Buffer.from(row.x25519_privkey_encrypted),
      Buffer.from(row.x25519_privkey_iv),
    );
    if (xPrivHex) {
      return {
        ed25519PubkeyHex: row.ed25519_pubkey_raw,
        ed25519PrivkeyHex: rawKp.ed25519PrivkeyHex,
        x25519PubkeyHex: row.x25519_pubkey,
        x25519PrivkeyHex: xPrivHex,
        bindingSigHex: row.binding_sig,
        instanceIdHex: row.mesh_instance_id,
      };
    }
    // Cache present but undecryptable — fall through to recompute.
  }

  // Cache miss — derive + persist.
  const m = deriveMeshIdentity(rawKp.ed25519PubkeyHex, rawKp.ed25519PrivkeyHex);
  await persistMeshFields(db, m);
  return m;
}

async function persistMeshFields(db: DatabaseAdapter, m: MeshIdentity): Promise<void> {
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
    m.ed25519PubkeyHex, m.x25519PubkeyHex,
    enc?.encrypted ?? null, enc?.iv ?? null,
    m.bindingSigHex, m.instanceIdHex,
  );
}

// ── Privkey AES-256-GCM (mirror of app-enrollment-service.ts crypto) ──

function encryptPrivkey(plaintextHex: string): { encrypted: Buffer; iv: Buffer } | null {
  const key = getEncryptionKey();
  if (!key) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(Buffer.from(plaintextHex, 'hex')), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { encrypted: Buffer.concat([enc, tag]), iv };
}

function decryptPrivkey(encrypted: Buffer, iv: Buffer): string | null {
  const key = getEncryptionKey();
  if (!key) return null;
  try {
    const tag = encrypted.subarray(encrypted.length - 16);
    const ct = encrypted.subarray(0, encrypted.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
    return dec.toString('hex');
  } catch {
    return null;
  }
}

function getEncryptionKey(): Buffer | null {
  const k = process.env.INSTANCE_KEY_ENCRYPTION_KEY;
  if (!k) return null;
  const buf = Buffer.from(k, 'hex');
  return buf.length === 32 ? buf : null;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('odd-length hex');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) out[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  return out;
}

/** Test helper — never call from production code paths. */
export function _resetForTests(): void {
  try { activeDialer?.stop(); } catch { /* ignore */ }
  activeDialer = null;
}
