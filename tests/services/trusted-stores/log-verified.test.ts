/**
 * log-verified.test.ts — the client side of the transparency-log proof.
 *
 * Proves verifyRelayLogProof() is sound: it returns true ONLY when (a) the leaf
 * recomputed from the RESOLVED descriptor matches the proof's leaf, (b) the STH
 * is signed by the operator key we PIN, and (c) the leaf is included in the tree
 * the STH commits to. Uses real Ed25519 (node:crypto) + the production Merkle
 * builder (computeRoot/buildAuditPath) so the synthetic proof is genuine.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';

import { signCanonical } from '../../../server/lib/portal-crypto.js';
import {
  computeRoot, buildAuditPath, leafHashFromEntry, sha256OfCanonical,
} from '../../../server/services/registry-client/log-verifier.js';
import type { SignedTreeHead, TrustBundle } from '../../../server/services/registry-client/types.js';
import { createTrustStore, setTrustStoreForTesting } from '../../../server/services/registry-client/trust-store.js';
import { verifyRelayLogProof } from '../../../server/services/trusted-stores/trusted-seller-service.js';
import type { RelayResolution } from '../../../server/services/trusted-stores/relay-resolve.js';

const OPERATOR_ID = 'ANTON-REG-FUTURECHAIN-V1';

function genOperator(): { spkiHex: string; privPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { spkiHex: Buffer.from(publicKey).toString('hex'), privPem: privateKey as string };
}

function pinOperator(spkiHex: string): void {
  const bundle: TrustBundle = {
    trustStoreVersion: 1,
    registryOperators: [{
      operatorId: OPERATOR_ID, namespaces: ['futurechain'],
      publicKeyHex: spkiHex, publicKeyFingerprint: 'x', bundleDate: '2026-01-01', expiresAt: '2099-01-01',
    }],
  };
  setTrustStoreForTesting(createTrustStore(bundle));
}

/** Build a genuine RelayResolution whose proof verifies: a real tree of `size`
 *  leaves with the target at `leafIndex`, an STH signed by `privPem`. */
function makeResolution(opts: {
  privPem: string; size: number; leafIndex: number;
  descriptor: Record<string, unknown>; signingPubkeyRawHex: string; portalAddress: string;
}): RelayResolution {
  const { privPem, size, leafIndex, descriptor, signingPubkeyRawHex, portalAddress } = opts;
  // The leaf the relay would have hashed — rebuilt the SAME way the client will.
  const targetLeafEntry = {
    schemaVersion: 'leaf-1.0.0' as const,
    logId: String(leafIndex),
    operationType: 'register' as const,
    // Mirror the relay leaf builder EXACTLY: bare name.namespace, lowercased.
    portalAddress: portalAddress.toLowerCase(),
    descriptorHash: sha256OfCanonical(descriptor),
    signingPubkeyHex: signingPubkeyRawHex.toLowerCase(),
  };
  const targetLeaf = leafHashFromEntry(targetLeafEntry);
  // Fill the rest of the tree with arbitrary distinct leaves.
  const leaves = Array.from({ length: size }, (_, i) =>
    i === leafIndex ? targetLeaf : leafHashFromEntry({ filler: i }));
  const root = computeRoot(leaves);
  const auditPath = buildAuditPath(leaves, leafIndex);
  const sth: SignedTreeHead = {
    schemaVersion: 'sth-1.0.0', registryOperator: OPERATOR_ID,
    treeSize: size, merkleRoot: root, timestamp: '2026-06-23T00:00:00.000Z',
  };
  return {
    signingPubkeyRawHex, portalAddress, descriptor,
    leafIndex, inclusionProof: { logId: leafIndex, treeSize: size, leafHash: targetLeaf, auditPath },
    sth, sthSignature: signCanonical(sth, privPem),
  };
}

const RAW_KEY = '6afa2e5f2720f2d209a203f66a933c05f8d8bfef4e349e0328e11ef3543ac078';
const DESCRIPTOR = { portal: { displayTitle: 'Sharks', publicKey: 'whatever' }, capabilities: [{ verb: 'order' }] };

describe('verifyRelayLogProof — the zero-trust-in-relay core', () => {
  let op: { spkiHex: string; privPem: string };
  beforeEach(() => { op = genOperator(); pinOperator(op.spkiHex); });

  it('accepts a genuine proof (leaf recomputed from descriptor, STH by pinned key, included)', () => {
    for (const [size, idx] of [[1, 0], [4, 2], [7, 5], [9, 0], [9, 8]] as const) {
      const relay = makeResolution({ privPem: op.privPem, size, leafIndex: idx, descriptor: DESCRIPTOR, signingPubkeyRawHex: RAW_KEY, portalAddress: 'sharks.global' });
      expect(verifyRelayLogProof(relay), `size=${size} idx=${idx}`).toBe(true);
    }
  });

  it('accepts a portal in the literal `portal` namespace (regression: no .portal stripping)', () => {
    // shop.portal — the relay leaf field is "shop.portal"; the client must NOT
    // strip the trailing ".portal" or the recomputed leaf would be "shop".
    const relay = makeResolution({ privPem: op.privPem, size: 3, leafIndex: 1, descriptor: DESCRIPTOR, signingPubkeyRawHex: RAW_KEY, portalAddress: 'shop.portal' });
    expect(verifyRelayLogProof(relay)).toBe(true);
  });

  it('rejects when the resolved DESCRIPTOR differs (recomputed leaf ≠ proof leaf)', () => {
    const relay = makeResolution({ privPem: op.privPem, size: 4, leafIndex: 1, descriptor: DESCRIPTOR, signingPubkeyRawHex: RAW_KEY, portalAddress: 'sharks.global' });
    relay.descriptor = { ...DESCRIPTOR, capabilities: [{ verb: 'TAMPERED' }] };
    expect(verifyRelayLogProof(relay)).toBe(false);
  });

  it('rejects when the STH is signed by a NON-pinned key (relay impostor)', () => {
    const impostor = genOperator();
    const relay = makeResolution({ privPem: impostor.privPem, size: 4, leafIndex: 1, descriptor: DESCRIPTOR, signingPubkeyRawHex: RAW_KEY, portalAddress: 'sharks.global' });
    expect(verifyRelayLogProof(relay)).toBe(false);
  });

  it('rejects when the operator key is still the PLACEHOLDER (not bootstrapped)', () => {
    setTrustStoreForTesting(createTrustStore({
      trustStoreVersion: 1,
      registryOperators: [{ operatorId: OPERATOR_ID, namespaces: ['futurechain'], publicKeyHex: '__PENDING_FUTURECHAIN_OPERATOR_KEY__', publicKeyFingerprint: '__PENDING_FINGERPRINT__', bundleDate: '2026-01-01', expiresAt: '2099-01-01' }],
    }));
    const relay = makeResolution({ privPem: op.privPem, size: 4, leafIndex: 1, descriptor: DESCRIPTOR, signingPubkeyRawHex: RAW_KEY, portalAddress: 'sharks.global' });
    expect(verifyRelayLogProof(relay)).toBe(false);
  });

  it('rejects a tampered merkle root (leaf not in the committed tree)', () => {
    const relay = makeResolution({ privPem: op.privPem, size: 4, leafIndex: 1, descriptor: DESCRIPTOR, signingPubkeyRawHex: RAW_KEY, portalAddress: 'sharks.global' });
    // Re-sign a STH with a bogus root so the signature is valid but inclusion fails.
    const badSth: SignedTreeHead = { ...relay.sth!, merkleRoot: 'f'.repeat(64) };
    relay.sth = badSth;
    relay.sthSignature = signCanonical(badSth, op.privPem);
    expect(verifyRelayLogProof(relay)).toBe(false);
  });

  it('rejects when the relay swaps the leaf hash (claims a different leaf than the descriptor implies)', () => {
    const relay = makeResolution({ privPem: op.privPem, size: 4, leafIndex: 1, descriptor: DESCRIPTOR, signingPubkeyRawHex: RAW_KEY, portalAddress: 'sharks.global' });
    relay.inclusionProof = { ...relay.inclusionProof!, leafHash: 'a'.repeat(64) };
    expect(verifyRelayLogProof(relay)).toBe(false);
  });

  it('returns false (not throw) when the proof bundle is absent', () => {
    const relay: RelayResolution = { signingPubkeyRawHex: RAW_KEY, portalAddress: 'sharks.global', descriptor: DESCRIPTOR };
    expect(verifyRelayLogProof(relay)).toBe(false);
  });

  it('rejects when the signing key in the resolution differs from the one in the leaf', () => {
    const relay = makeResolution({ privPem: op.privPem, size: 4, leafIndex: 1, descriptor: DESCRIPTOR, signingPubkeyRawHex: RAW_KEY, portalAddress: 'sharks.global' });
    relay.signingPubkeyRawHex = 'b'.repeat(64); // changes the recomputed leaf
    expect(verifyRelayLogProof(relay)).toBe(false);
  });
});
