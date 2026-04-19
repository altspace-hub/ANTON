/**
 * envelope.ts — Registry operation envelope construction + validation.
 *
 * Implements the wire envelope per ANTON_Portals_Registry_Protocol_Reference.md
 * §4. Every registry operation goes through here:
 *
 *   1. buildEnvelope(...)         construct + sign the envelope
 *   2. parseEnvelope(...)         validate shape + signature
 *   3. assertReplayWindow(...)    server-side replay protection
 *
 * Two-signature operations (transfer per §4.4) use buildEnvelopeTwoSig +
 * parseEnvelopeTwoSig.
 *
 * Spec refs:
 *   - ANTON_Portals_Registry_Protocol_Reference.md §4 (envelope), §4.5 (replay)
 *   - investigation/portals-investigation.md §A.6
 */

import { randomBytes } from 'crypto';
import { z } from 'zod';

import {
  base64urlDecode,
  base64urlEncode,
  publicKeyHexToWire,
  signCanonical,
  verifyCanonical,
} from '../../lib/portal-crypto.js';

// ── Constants per Registry Protocol §4 ──────────────────────────────────────

export const SCHEMA_VERSION = 'registry-1.0.0' as const;
export const REGISTRY_OPERATOR_FUTURECHAIN = 'ANTON-REG-FUTURECHAIN-V1' as const;

/** Replay window: reject envelopes older than 5 min or >2 min in the future. */
export const TIMESTAMP_PAST_WINDOW_MS = 5 * 60 * 1000;
export const TIMESTAMP_FUTURE_WINDOW_MS = 2 * 60 * 1000;
/** Nonce uniqueness window per §4.5. */
export const NONCE_WINDOW_MS = 48 * 60 * 60 * 1000;

// ── Operation type union ────────────────────────────────────────────────────

export const OPERATION_TYPES = [
  'register',
  'update_metadata',
  'update_capability_summary',
  'rotate_key',
  'transfer',
  'revoke',
  'heartbeat',
  'reserve_name',
] as const;

export type OperationType = (typeof OPERATION_TYPES)[number];

/** Reserved op types from §5.9 — present only for forward-compat, NOT usable. */
export const RESERVED_OPERATION_TYPES = [
  'rotate_key_via_recovery',
  'declare_recovery_contacts',
  'federate_namespace',
  'attest_portal',
  'create_namespace',
] as const;

// ── Zod schema for envelope shape ───────────────────────────────────────────

const isoTimestamp = z.string().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
  'must be ISO 8601 UTC with millisecond precision (e.g. 2026-09-01T12:34:56.789Z)',
);

const nonceHex = z.string().regex(/^[0-9a-f]{32}$/, 'must be 32 lowercase hex chars (128 bits)');

const contactHash = z.string().regex(
  /^ANTON-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/,
  'must be ANTON-XXXX-XXXX-XXXX-XXXX in Crockford-style charset',
);

const publicKeyWire = z.string().regex(
  /^[A-Za-z0-9_-]{43}$/,
  'must be base64url unpadded SPKI DER (43 chars for 32-byte Ed25519 key + DER prefix = 44 bytes)',
).or(
  // Fallback: 32-byte raw Ed25519 keys after base64url encoding are 43 chars.
  // SPKI-DER-wrapped Ed25519 keys are 44 bytes → 59 chars. Accept both shapes.
  z.string().regex(/^[A-Za-z0-9_-]{59}$/, 'must be base64url unpadded SPKI DER (59 chars for 44-byte SPKI)'),
);

export const ENVELOPE_SCHEMA = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  operation: z.enum(OPERATION_TYPES),
  namespace: z.string().regex(/^[a-z][a-z0-9-]{2,31}$/),
  registryOperator: z.string().min(1),
  timestamp: isoTimestamp,
  nonce: nonceHex,
  actor: z.object({
    contactHash,
    publicKey: publicKeyWire,
  }),
  payload: z.record(z.string(), z.unknown()),
  priorOperationId: z.union([z.number().int().nonnegative(), z.null()]),
});

export type RegistryEnvelope = z.infer<typeof ENVELOPE_SCHEMA>;

export const SIGNED_ENVELOPE_SCHEMA = z.object({
  envelope: ENVELOPE_SCHEMA,
  signature: z.string().regex(/^[A-Za-z0-9_-]+$/),
});

export type SignedEnvelope = z.infer<typeof SIGNED_ENVELOPE_SCHEMA>;

// Two-signature envelopes (transfer per §4.4).
const SIGNATURE_ROLE = z.enum(['current_owner', 'new_owner']);

export const SIGNED_ENVELOPE_TWO_SIG_SCHEMA = z.object({
  envelope: ENVELOPE_SCHEMA,
  signatures: z
    .array(
      z.object({
        role: SIGNATURE_ROLE,
        publicKey: publicKeyWire,
        signature: z.string().regex(/^[A-Za-z0-9_-]+$/),
      }),
    )
    .length(2),
});

export type SignedEnvelopeTwoSig = z.infer<typeof SIGNED_ENVELOPE_TWO_SIG_SCHEMA>;

// ── Envelope construction ───────────────────────────────────────────────────

export interface BuildEnvelopeArgs {
  operation: OperationType;
  namespace: string;
  registryOperator?: string; // defaults to FUTURECHAIN
  actor: {
    contactHash: string;
    publicKeyHex: string; // internal hex storage; converted to wire format here
  };
  payload: Record<string, unknown>;
  priorOperationId: number | null;
  /** Override timestamp for testing. Defaults to NOW. */
  timestamp?: string;
  /** Override nonce for testing. Defaults to 128 bits of randomness. */
  nonce?: string;
}

/** Construct an unsigned envelope. */
export function buildEnvelope(args: BuildEnvelopeArgs): RegistryEnvelope {
  const envelope: RegistryEnvelope = {
    schemaVersion: SCHEMA_VERSION,
    operation: args.operation,
    namespace: args.namespace,
    registryOperator: args.registryOperator ?? REGISTRY_OPERATOR_FUTURECHAIN,
    timestamp: args.timestamp ?? new Date().toISOString(),
    nonce: args.nonce ?? randomBytes(16).toString('hex'),
    actor: {
      contactHash: args.actor.contactHash,
      publicKey: publicKeyHexToWire(args.actor.publicKeyHex),
    },
    payload: args.payload,
    priorOperationId: args.priorOperationId,
  };
  // Defensive validation — surfaces shape bugs before signing.
  ENVELOPE_SCHEMA.parse(envelope);
  return envelope;
}

/** Sign an envelope with the actor's private key. Returns a `SignedEnvelope`. */
export function signEnvelope(envelope: RegistryEnvelope, privateKeyPem: string): SignedEnvelope {
  return {
    envelope,
    signature: signCanonical(envelope, privateKeyPem),
  };
}

/** Sign with two keys for `transfer` operations per §4.4. */
export function signEnvelopeTwoSig(
  envelope: RegistryEnvelope,
  signers: Array<{
    role: 'current_owner' | 'new_owner';
    publicKeyHex: string;
    privateKeyPem: string;
  }>,
): SignedEnvelopeTwoSig {
  if (signers.length !== 2) {
    throw new Error('signEnvelopeTwoSig: exactly two signers required');
  }
  const seenRoles = new Set(signers.map((s) => s.role));
  if (seenRoles.size !== 2) {
    throw new Error('signEnvelopeTwoSig: signers must declare distinct roles');
  }
  return {
    envelope,
    signatures: signers.map((s) => ({
      role: s.role,
      publicKey: publicKeyHexToWire(s.publicKeyHex),
      signature: signCanonical(envelope, s.privateKeyPem),
    })),
  };
}

// ── Envelope parsing + verification ─────────────────────────────────────────

export class EnvelopeError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'EnvelopeError';
  }
}

/**
 * Parse + signature-verify a `SignedEnvelope`. Does NOT enforce replay
 * windows (that requires DB state — see `assertReplayWindow`).
 */
export function parseEnvelope(input: unknown): SignedEnvelope {
  const parsed = SIGNED_ENVELOPE_SCHEMA.safeParse(input);
  if (!parsed.success) {
    throw new EnvelopeError('E_ENVELOPE_MALFORMED', parsed.error.message);
  }
  const { envelope, signature } = parsed.data;
  if (!verifyCanonical(envelope, signature, envelope.actor.publicKey)) {
    throw new EnvelopeError('E_SIGNATURE_INVALID', 'Envelope signature did not verify');
  }
  return parsed.data;
}

/** Same as parseEnvelope but for two-signature operations. */
export function parseEnvelopeTwoSig(input: unknown): SignedEnvelopeTwoSig {
  const parsed = SIGNED_ENVELOPE_TWO_SIG_SCHEMA.safeParse(input);
  if (!parsed.success) {
    throw new EnvelopeError('E_ENVELOPE_MALFORMED', parsed.error.message);
  }
  for (const sig of parsed.data.signatures) {
    if (!verifyCanonical(parsed.data.envelope, sig.signature, sig.publicKey)) {
      throw new EnvelopeError(
        sig.role === 'current_owner' ? 'E_SIGNATURE_INVALID' : 'E_SECOND_SIGNATURE_INVALID',
        `Signature for role '${sig.role}' did not verify`,
      );
    }
  }
  return parsed.data;
}

// ── Replay protection ───────────────────────────────────────────────────────

export interface NonceStore {
  /** Returns true if the nonce was unseen and is now recorded. False if duplicate. */
  recordNonce(actorContactHash: string, nonce: string, operationType: string): Promise<boolean>;
}

/**
 * Server-side check: timestamp window + nonce uniqueness. The chain-continuity
 * check (`priorOperationId`) is per-portal and lives in the operation handler,
 * not here.
 */
export async function assertReplayWindow(
  envelope: RegistryEnvelope,
  store: NonceStore,
  now: Date = new Date(),
): Promise<void> {
  const ts = Date.parse(envelope.timestamp);
  if (Number.isNaN(ts)) {
    throw new EnvelopeError('E_TIMESTAMP_OUT_OF_WINDOW', 'Unparseable timestamp');
  }
  const delta = now.getTime() - ts;
  if (delta > TIMESTAMP_PAST_WINDOW_MS) {
    throw new EnvelopeError('E_TIMESTAMP_OUT_OF_WINDOW', `Timestamp ${delta}ms in the past`);
  }
  if (-delta > TIMESTAMP_FUTURE_WINDOW_MS) {
    throw new EnvelopeError('E_TIMESTAMP_OUT_OF_WINDOW', `Timestamp ${-delta}ms in the future`);
  }
  const fresh = await store.recordNonce(envelope.actor.contactHash, envelope.nonce, envelope.operation);
  if (!fresh) {
    throw new EnvelopeError('E_NONCE_REPLAY', 'Nonce already seen for this actor');
  }
}

// ── Re-exports for convenience ──────────────────────────────────────────────

export { base64urlEncode, base64urlDecode };
