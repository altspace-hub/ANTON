/**
 * signer.ts — Sign + verify the capability descriptor envelope.
 *
 * Per Cap Schema §13.2 the served envelope is:
 *   {
 *     descriptor: { ... },
 *     signature: <Ed25519 sig over canonical descriptor, base64url unpadded>,
 *     signatureAlgorithm: 'Ed25519',
 *     signingKeyFingerprint: <SHA-256 hex of portal public key>
 *   }
 *
 * Reuses signCanonical / verifyCanonical from portal-crypto so the wire
 * format matches the registry envelope signing scheme.
 */

import { createHash } from 'crypto';

import {
  publicKeyHexToWire,
  publicKeyWireToHex,
  signCanonical,
  verifyCanonical,
} from '../../lib/portal-crypto.js';

export interface SignedDescriptorEnvelope {
  descriptor: Record<string, unknown>;
  signature: string;
  signatureAlgorithm: 'Ed25519';
  signingKeyFingerprint: string;
}

/** Sign a descriptor with the portal's private key. */
export function signDescriptor(
  descriptor: Record<string, unknown>,
  publicKeyHex: string,
  privateKeyPem: string,
): SignedDescriptorEnvelope {
  return {
    descriptor,
    signature: signCanonical(descriptor, privateKeyPem),
    signatureAlgorithm: 'Ed25519',
    signingKeyFingerprint: keyFingerprint(publicKeyHex),
  };
}

export interface VerifyDescriptorResult {
  valid: boolean;
  reasons: string[];
}

/**
 * Verify a signed descriptor envelope against the portal's expected public key
 * (typically obtained from the registry resolution). Performs:
 *   1. Algorithm check (must be 'Ed25519')
 *   2. Fingerprint match against expected key
 *   3. Signature verification over canonical descriptor
 *   4. (Optional) descriptor.portal.publicKey vs expected publicKey
 *   5. (Optional) descriptor.portal.contactHash vs expected contactHash
 *   6. validFrom/validUntil window check
 *
 * Per Cap Schema §13.3 — visitor's ANTON SHOULD perform all six.
 */
export function verifyDescriptor(
  envelope: SignedDescriptorEnvelope,
  expected: { publicKey: string; contactHash?: string },
  now: Date = new Date(),
): VerifyDescriptorResult {
  const reasons: string[] = [];

  if (envelope.signatureAlgorithm !== 'Ed25519') {
    reasons.push(`Unsupported signature algorithm: ${envelope.signatureAlgorithm}`);
  }

  // Normalise expected key (accept hex or wire).
  const expectedHex = expected.publicKey.length === 88 && /^[0-9a-fA-F]+$/.test(expected.publicKey)
    ? expected.publicKey
    : publicKeyWireToHex(expected.publicKey);

  const expectedFingerprint = keyFingerprint(expectedHex);
  if (envelope.signingKeyFingerprint !== expectedFingerprint) {
    reasons.push('signingKeyFingerprint does not match expected portal key');
  }

  if (!verifyCanonical(envelope.descriptor, envelope.signature, expectedHex)) {
    reasons.push('Descriptor signature did not verify');
  }

  // descriptor.portal cross-check.
  const portal = (envelope.descriptor as { portal?: { publicKey?: string; contactHash?: string } }).portal;
  if (portal) {
    if (portal.publicKey) {
      const claimedWire = portal.publicKey;
      const expectedWire = publicKeyHexToWire(expectedHex);
      if (claimedWire !== expectedWire) {
        reasons.push('descriptor.portal.publicKey does not match registry record');
      }
    }
    if (expected.contactHash && portal.contactHash && portal.contactHash !== expected.contactHash) {
      reasons.push('descriptor.portal.contactHash does not match registry record');
    }
  }

  // Validity window.
  const validFrom = (envelope.descriptor as { validFrom?: string }).validFrom;
  const validUntil = (envelope.descriptor as { validUntil?: string }).validUntil;
  if (validFrom) {
    const ts = Date.parse(validFrom);
    if (!Number.isNaN(ts) && ts > now.getTime() + 5 * 60 * 1000) {
      reasons.push(`descriptor not yet valid (validFrom ${validFrom})`);
    }
  }
  if (validUntil) {
    const ts = Date.parse(validUntil);
    if (!Number.isNaN(ts) && ts < now.getTime()) {
      reasons.push(`descriptor expired (validUntil ${validUntil})`);
    }
  }

  return { valid: reasons.length === 0, reasons };
}

function keyFingerprint(publicKeyHex: string): string {
  return createHash('sha256').update(Buffer.from(publicKeyHex, 'hex')).digest('hex');
}
