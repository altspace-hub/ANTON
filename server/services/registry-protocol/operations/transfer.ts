/**
 * transfer.ts — `transfer` operation per Registry Protocol §5.5.
 *
 * Transfers a registration to a new owner. Two-signature envelope per §4.4:
 * both the current owner and the new owner sign the same envelope. The new
 * owner's signature proves they agreed to accept (no passive reassignment).
 *
 * Rate limit: the server rejects transfers within 30 days of the last one
 * to block rapid-transfer attacks — builder doesn't enforce, it's a
 * server-side rule.
 *
 * acceptanceToken is an opaque string the new owner generated; its role is
 * defence-in-depth against signature-replay from older transfer offers.
 */

import { z } from 'zod';

import { buildEnvelope, signEnvelopeTwoSig, type SignedEnvelopeTwoSig } from '../envelope.js';

// ── Payload schema ─────────────────────────────────────────────────────────

export const TRANSFER_PAYLOAD_SCHEMA = z.object({
  portalId: z.string().uuid(),
  newOwner: z.object({
    contactHash: z.string().regex(
      /^ANTON-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/,
      'ANTON-XXXX-XXXX-XXXX-XXXX',
    ),
    publicKey: z.string().regex(/^[A-Za-z0-9_-]{43,59}$/, 'base64url unpadded Ed25519 key'),
  }),
  acceptanceToken: z.string().min(16).max(128),
});

export type TransferPayload = z.infer<typeof TRANSFER_PAYLOAD_SCHEMA>;

// ── Builder ────────────────────────────────────────────────────────────────

export interface BuildTransferArgs {
  portalId: string;
  namespace: string;
  newOwner: {
    contactHash: string;
    publicKeyWire: string;
  };
  acceptanceToken: string;
  currentOwner: {
    contactHash: string;
    publicKeyHex: string;
    privateKeyPem: string;
  };
  newOwnerSigner: {
    publicKeyHex: string;
    privateKeyPem: string;
  };
  priorOperationId: number;
}

export function buildTransfer(args: BuildTransferArgs): SignedEnvelopeTwoSig {
  const payload: TransferPayload = {
    portalId: args.portalId,
    newOwner: {
      contactHash: args.newOwner.contactHash,
      publicKey: args.newOwner.publicKeyWire,
    },
    acceptanceToken: args.acceptanceToken,
  };
  TRANSFER_PAYLOAD_SCHEMA.parse(payload);

  const envelope = buildEnvelope({
    operation: 'transfer',
    namespace: args.namespace,
    actor: {
      contactHash: args.currentOwner.contactHash,
      publicKeyHex: args.currentOwner.publicKeyHex,
    },
    payload: payload as unknown as Record<string, unknown>,
    priorOperationId: args.priorOperationId,
  });

  return signEnvelopeTwoSig(envelope, [
    { role: 'current_owner', publicKeyHex: args.currentOwner.publicKeyHex, privateKeyPem: args.currentOwner.privateKeyPem },
    { role: 'new_owner', publicKeyHex: args.newOwnerSigner.publicKeyHex, privateKeyPem: args.newOwnerSigner.privateKeyPem },
  ]);
}
