/**
 * revoke.ts — `revoke` operation per Registry Protocol §5.6.
 *
 * Permanently revokes a portal registration. Not reversible. After revocation
 * the name enters a 180-day dormancy before returning to the available pool —
 * this blocks impersonation-chain attacks where an attacker watches for a
 * voluntary revocation then claims the same name.
 *
 * The dormancy clock is enforced server-side; the builder only constructs
 * the signed envelope.
 */

import { z } from 'zod';

import { buildEnvelope, signEnvelope, type SignedEnvelope } from '../envelope.js';

// ── Payload schema ─────────────────────────────────────────────────────────

export const REVOKE_REASONS = ['voluntary', 'key_lost', 'compromise', 'other'] as const;

export type RevokeReason = (typeof REVOKE_REASONS)[number];

export const REVOKE_PAYLOAD_SCHEMA = z.object({
  portalId: z.string().uuid(),
  reason: z.enum(REVOKE_REASONS),
  note: z.string().max(500).optional(),
});

export type RevokePayload = z.infer<typeof REVOKE_PAYLOAD_SCHEMA>;

// ── Builder ────────────────────────────────────────────────────────────────

export interface BuildRevokeArgs {
  portalId: string;
  namespace: string;
  reason: RevokeReason;
  note?: string;
  actor: {
    contactHash: string;
    publicKeyHex: string;
  };
  privateKeyPem: string;
  priorOperationId: number;
}

export function buildRevoke(args: BuildRevokeArgs): SignedEnvelope {
  const payload: RevokePayload = {
    portalId: args.portalId,
    reason: args.reason,
    ...(args.note !== undefined ? { note: args.note } : {}),
  };
  REVOKE_PAYLOAD_SCHEMA.parse(payload);

  const envelope = buildEnvelope({
    operation: 'revoke',
    namespace: args.namespace,
    actor: args.actor,
    payload: payload as unknown as Record<string, unknown>,
    priorOperationId: args.priorOperationId,
  });
  return signEnvelope(envelope, args.privateKeyPem);
}
