/**
 * rotate-key.ts — `rotate_key` operation per Registry Protocol §5.4.
 *
 * Replaces the actor's public key on a portal. The envelope is signed by the
 * CURRENT (outgoing) key, not the new key — the signature proves the rotator
 * controls the existing registration. Server validates that the new key is
 * distinct from the current one and that newContactHash derives from
 * newPublicKey.
 *
 * For social-recovery rotations the protocol reserves `rotate_key_via_recovery`
 * (v1.1+); this file only handles the self-controlled path.
 */

import { z } from 'zod';

import { buildEnvelope, signEnvelope, type SignedEnvelope } from '../envelope.js';

// ── Payload schema ─────────────────────────────────────────────────────────

export const ROTATE_KEY_REASONS = [
  'scheduled_rotation',
  'suspected_compromise',
  'device_migration',
  'other',
] as const;

export type RotateKeyReason = (typeof ROTATE_KEY_REASONS)[number];

export const ROTATE_KEY_PAYLOAD_SCHEMA = z.object({
  portalId: z.string().uuid(),
  newPublicKey: z.string().regex(/^[A-Za-z0-9_-]{43,59}$/, 'base64url unpadded Ed25519 key'),
  newContactHash: z.string().regex(
    /^ANTON-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/,
    'ANTON-XXXX-XXXX-XXXX-XXXX',
  ),
  reason: z.enum(ROTATE_KEY_REASONS),
});

export type RotateKeyPayload = z.infer<typeof ROTATE_KEY_PAYLOAD_SCHEMA>;

// ── Builder ────────────────────────────────────────────────────────────────

export interface BuildRotateKeyArgs {
  portalId: string;
  namespace: string;
  newPublicKeyWire: string;
  newContactHash: string;
  reason: RotateKeyReason;
  /** Current (outgoing) owner — signs the envelope with the current private key. */
  actor: {
    contactHash: string;
    publicKeyHex: string;
  };
  privateKeyPem: string;
  priorOperationId: number;
}

export function buildRotateKey(args: BuildRotateKeyArgs): SignedEnvelope {
  const payload: RotateKeyPayload = {
    portalId: args.portalId,
    newPublicKey: args.newPublicKeyWire,
    newContactHash: args.newContactHash,
    reason: args.reason,
  };
  ROTATE_KEY_PAYLOAD_SCHEMA.parse(payload);

  const envelope = buildEnvelope({
    operation: 'rotate_key',
    namespace: args.namespace,
    actor: args.actor,
    payload: payload as unknown as Record<string, unknown>,
    priorOperationId: args.priorOperationId,
  });
  return signEnvelope(envelope, args.privateKeyPem);
}
