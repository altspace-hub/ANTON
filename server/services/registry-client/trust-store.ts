/**
 * trust-store.ts — Bundled trust store of registry operator public keys.
 *
 * Per Registry Protocol Reference §9.2: clients ship with a trust bundle
 * containing the operator identity public keys + claimed namespaces. STH
 * signatures, log entries, and any operator-only operations are verified
 * against this store.
 *
 * v0.7.x BOOTSTRAP NOTE: the FutureChain operator key is set during registry
 * server bootstrap. Before that exists, this file holds a placeholder marked
 * `__PENDING_FUTURECHAIN_OPERATOR_KEY__`. Production builds replace it via
 * the trust-bundle update channel before launch.
 */

import { createHash } from 'crypto';

import type { TrustBundle, TrustedOperator } from './types.js';

// ── Bundled v0.7.x trust store ──────────────────────────────────────────────

/**
 * The operator key for `ANTON-REG-FUTURECHAIN-V1` is a placeholder until the
 * registry server is bootstrapped. STH verification will fail until the real
 * key is installed — surface that as a critical UI warning per Protocol §9.4.
 */
const PLACEHOLDER_FUTURECHAIN_PUBKEY_HEX = '__PENDING_FUTURECHAIN_OPERATOR_KEY__';

const DEFAULT_BUNDLE: TrustBundle = {
  trustStoreVersion: 1,
  registryOperators: [
    {
      operatorId: 'ANTON-REG-FUTURECHAIN-V1',
      namespaces: ['futurechain'],
      publicKeyHex: PLACEHOLDER_FUTURECHAIN_PUBKEY_HEX,
      publicKeyFingerprint: '__PENDING_FINGERPRINT__',
      bundleDate: '2026-04-19',
      expiresAt: '2027-04-19',
    },
  ],
};

// ── Trust-store API ────────────────────────────────────────────────────────

export interface TrustStore {
  /** Returns the trusted operator for a given namespace, or undefined. */
  forNamespace(namespace: string): TrustedOperator | undefined;
  /** Returns the trusted operator by its identity string. */
  forOperatorId(operatorId: string): TrustedOperator | undefined;
  /** Returns true if the bundled key is a known placeholder (not yet bootstrapped). */
  isPlaceholder(operatorId: string): boolean;
  /** Replace the bundle entirely. Used by the trust-bundle update channel. */
  replace(bundle: TrustBundle): void;
  /** Snapshot the current bundle. */
  snapshot(): TrustBundle;
}

class InMemoryTrustStore implements TrustStore {
  private bundle: TrustBundle;

  constructor(initial: TrustBundle = DEFAULT_BUNDLE) {
    this.bundle = structuredClone(initial);
    this.recomputeFingerprints();
  }

  forNamespace(namespace: string): TrustedOperator | undefined {
    return this.bundle.registryOperators.find((op) => op.namespaces.includes(namespace));
  }

  forOperatorId(operatorId: string): TrustedOperator | undefined {
    return this.bundle.registryOperators.find((op) => op.operatorId === operatorId);
  }

  isPlaceholder(operatorId: string): boolean {
    const op = this.forOperatorId(operatorId);
    if (!op) return false;
    return op.publicKeyHex.startsWith('__PENDING_');
  }

  replace(bundle: TrustBundle): void {
    this.bundle = structuredClone(bundle);
    this.recomputeFingerprints();
  }

  snapshot(): TrustBundle {
    return structuredClone(this.bundle);
  }

  private recomputeFingerprints(): void {
    for (const op of this.bundle.registryOperators) {
      if (op.publicKeyHex.startsWith('__PENDING_')) continue;
      op.publicKeyFingerprint = createHash('sha256')
        .update(Buffer.from(op.publicKeyHex, 'hex'))
        .digest('hex');
    }
  }
}

let singleton: TrustStore | null = null;

/** Returns the process-wide trust store, creating it on first call. */
export function getTrustStore(): TrustStore {
  singleton ??= new InMemoryTrustStore();
  return singleton;
}

/** For tests: install a custom trust store. */
export function setTrustStoreForTesting(store: TrustStore): void {
  singleton = store;
}

/** For tests: build a fresh in-memory trust store from a bundle. */
export function createTrustStore(bundle: TrustBundle): TrustStore {
  return new InMemoryTrustStore(bundle);
}
