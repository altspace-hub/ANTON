/**
 * types.ts — Shared TypeScript types for the registry client.
 *
 * Mirrors the Registry Protocol Reference §8 response shapes and §7
 * transparency-log structures. Used everywhere in the client surface.
 */

import type { OperationType } from '../registry-protocol/envelope.js';

// ── Resolution ──────────────────────────────────────────────────────────────

export interface ResolutionResponse {
  portalId: string;
  name: string;
  namespace: string;
  contactHash: string;
  publicKey: string; // base64url unpadded (wire format)
  displayTitle: string | null;
  description: string | null;
  category: string | null;
  publicIndex: boolean;
  capabilitySummary: Record<string, unknown> | null;
  descriptorHash: string | null;
  registeredAt: string; // ISO 8601
  lastSeenAt: string | null;
  revokedAt: string | null;
}

// ── Operation submission ───────────────────────────────────────────────────

export interface OperationAcceptedResponse {
  portalId: string;
  logId: number;
  appendedAt: string;
}

// ── Transparency log ───────────────────────────────────────────────────────

/** A single log entry per Protocol §7.2. */
export interface LogEntry {
  logId: number;
  appendedAt: string;
  operationType: OperationType;
  signedEnvelope: {
    envelope: Record<string, unknown>;
    signature: string;
    signatures: Array<{ role: string; publicKey: string; signature: string }> | null;
  };
  registrySignature: string;
}

/** Signed Tree Head per Protocol §7.4. */
export interface SignedTreeHead {
  schemaVersion: 'sth-1.0.0';
  registryOperator: string;
  treeSize: number;
  merkleRoot: string; // hex
  timestamp: string;
}

export interface SignedSthEnvelope {
  sth: SignedTreeHead;
  signature: string; // base64url, by registry operator key
}

/** Inclusion proof per Protocol §7.5. */
export interface InclusionProof {
  logId: number;
  treeSize: number;
  leafHash: string; // hex
  auditPath: string[]; // hex
}

/** Consistency proof per Protocol §7.6. */
export interface ConsistencyProof {
  firstSize: number;
  secondSize: number;
  proofPath: string[]; // hex
}

// ── Error envelope per Protocol §8.3 / §8.5 ────────────────────────────────

export interface RegistryErrorBody {
  status: 'error';
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface RegistryOkBody<T> {
  status: 'ok';
  data: T;
}

export type RegistryResponseBody<T> = RegistryOkBody<T> | RegistryErrorBody;

/** Thrown by the transport layer when the registry returns a §8.5 error code. */
export class RegistryError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, httpStatus: number, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
    this.name = 'RegistryError';
  }

  /** True if the caller should retry with backoff. */
  get isRetryable(): boolean {
    return this.httpStatus >= 500 || this.httpStatus === 429;
  }
}

// ── Trust store ────────────────────────────────────────────────────────────

export interface TrustedOperator {
  operatorId: string;
  namespaces: string[];
  publicKeyHex: string; // SPKI DER hex, internal storage form
  publicKeyFingerprint: string; // SHA-256 hex of public key
  bundleDate: string; // ISO date
  expiresAt: string; // ISO date
  /** Set when the key has been rotated; mutual-trust window for the old key. */
  rotatedToOperatorId?: string;
}

export interface TrustBundle {
  trustStoreVersion: number;
  registryOperators: TrustedOperator[];
}

// ── Cache responses ────────────────────────────────────────────────────────

export interface ResolutionCacheEntry {
  resolution: ResolutionResponse | null; // null = negative cache
  fetchedAt: string;
  expiresAt: string;
}

export interface DescriptorCacheEntry {
  descriptor: Record<string, unknown>;
  signature: string;
  signingKeyFingerprint: string;
  descriptorHash: string;
  validFrom: string;
  validUntil: string;
  fetchedAt: string;
}
