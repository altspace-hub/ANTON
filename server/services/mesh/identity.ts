/**
 * identity.ts — derive + cache mesh-format identity fields on the existing
 * instance_identity row.
 *
 * The existing identity stores Ed25519 keys in DER (SPKI public, PKCS8
 * private) for the public_https pairing flow. The mesh spec (§3.2 + §8)
 * needs raw 32-byte keys plus a derived X25519 keypair plus a self-signed
 * binding_sig. These are deterministic from the Ed25519 keypair — caching
 * them on the row avoids re-deriving per QR.
 *
 * All conversions delegate to @noble/curves's audited birational map +
 * @noble/ed25519's signing primitives. Same crypto path the relay uses
 * to verify the values, so by construction the values agree.
 */

import crypto from 'node:crypto';
import { ed25519, edwardsToMontgomeryPriv, edwardsToMontgomeryPub } from '@noble/curves/ed25519';

const BINDING_DOMAIN = new TextEncoder().encode('ANTON-MESH-IDENTITY/v1\n');

/** Raw mesh-format identity. All hex-encoded (lowercase). */
export interface MeshIdentity {
  /** 32-byte Ed25519 public key, hex. */
  ed25519PubkeyHex: string;
  /** 32-byte Ed25519 private key (raw seed), hex. Caller must protect. */
  ed25519PrivkeyHex: string;
  /** 32-byte X25519 public key (= ed25519_pk_to_curve25519(ed_pk)), hex. */
  x25519PubkeyHex: string;
  /** 32-byte X25519 private key (= ed25519_sk_to_curve25519(ed_sk)), hex. */
  x25519PrivkeyHex: string;
  /** 64-byte Ed25519 sig over (BINDING_DOMAIN || ed_pk || x_pk), hex. */
  bindingSigHex: string;
  /** 16-byte sha256(x_pk)[0..16) — the spec-defined instance_id, hex. */
  instanceIdHex: string;
}

/**
 * Convert a node:crypto DER-formatted Ed25519 keypair into raw 32-byte form.
 * The DER SPKI public is 12-byte ASN.1 prefix + 32-byte key; the DER PKCS8
 * private is a longer ASN.1 envelope around the 32-byte seed. We use Node's
 * JWK export, which gives base64url-encoded raw bytes for both halves.
 */
export function rawFromDerKeypair(derPubkeyHex: string, derPrivkeyHex: string): {
  ed25519PubkeyHex: string;
  ed25519PrivkeyHex: string;
} {
  // Parse pub via PublicKey + JWK export.
  const pub = crypto.createPublicKey({
    key: Buffer.from(derPubkeyHex, 'hex'),
    format: 'der',
    type: 'spki',
  });
  const pubJwk = pub.export({ format: 'jwk' }) as { x?: string };
  if (!pubJwk.x) throw new Error('ed25519 pubkey: JWK has no x field');
  const pubRaw = Buffer.from(pubJwk.x, 'base64url');
  if (pubRaw.length !== 32) throw new Error(`ed25519 pubkey raw length ${pubRaw.length}`);

  // Parse priv via PrivateKey + JWK export.
  const priv = crypto.createPrivateKey({
    key: Buffer.from(derPrivkeyHex, 'hex'),
    format: 'der',
    type: 'pkcs8',
  });
  const privJwk = priv.export({ format: 'jwk' }) as { d?: string };
  if (!privJwk.d) throw new Error('ed25519 privkey: JWK has no d field');
  const privRaw = Buffer.from(privJwk.d, 'base64url');
  if (privRaw.length !== 32) throw new Error(`ed25519 privkey raw length ${privRaw.length}`);

  return {
    ed25519PubkeyHex: pubRaw.toString('hex'),
    ed25519PrivkeyHex: privRaw.toString('hex'),
  };
}

/**
 * Derive the full MeshIdentity from a raw Ed25519 keypair. Pure: same input
 * → same output, no side effects.
 */
export function deriveMeshIdentity(ed25519PubkeyHex: string, ed25519PrivkeyHex: string): MeshIdentity {
  const edPub = Buffer.from(ed25519PubkeyHex, 'hex');
  const edPriv = Buffer.from(ed25519PrivkeyHex, 'hex');
  if (edPub.length !== 32) throw new Error(`ed25519 pubkey length ${edPub.length}`);
  if (edPriv.length !== 32) throw new Error(`ed25519 privkey length ${edPriv.length}`);

  // X25519 derivation — birational map for pub, libsodium-equivalent for priv.
  const xPub = edwardsToMontgomeryPub(edPub);
  const xPriv = edwardsToMontgomeryPriv(edPriv);

  // binding_sig = Ed25519(ed_priv) over (BINDING_DOMAIN || ed_pk || x_pk)
  const bindingMsg = new Uint8Array(BINDING_DOMAIN.length + 32 + 32);
  bindingMsg.set(BINDING_DOMAIN, 0);
  bindingMsg.set(edPub, BINDING_DOMAIN.length);
  bindingMsg.set(xPub, BINDING_DOMAIN.length + 32);
  const bindingSig = ed25519.sign(bindingMsg, edPriv);

  // instance_id = sha256(x_pk)[0..16)
  const instanceIdBytes = crypto.createHash('sha256').update(xPub).digest().subarray(0, 16);

  return {
    ed25519PubkeyHex,
    ed25519PrivkeyHex,
    x25519PubkeyHex: Buffer.from(xPub).toString('hex'),
    x25519PrivkeyHex: Buffer.from(xPriv).toString('hex'),
    bindingSigHex: Buffer.from(bindingSig).toString('hex'),
    instanceIdHex: Buffer.from(instanceIdBytes).toString('hex'),
  };
}
