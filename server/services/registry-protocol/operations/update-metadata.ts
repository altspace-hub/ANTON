/**
 * update-metadata.ts — `update_metadata` operation per Registry Protocol §5.2.
 *
 * Changes mutable metadata (title, description, category, publicIndex) on an
 * existing portal. Only fields present in `changes` are modified; omit a
 * field to leave it unchanged, pass `null` to explicitly clear it.
 *
 * Pure envelope construction + local validation. Submission lives in the
 * registry client.
 */

import { z } from 'zod';

import { buildEnvelope, signEnvelope, type SignedEnvelope } from '../envelope.js';
import { PORTAL_CATEGORIES, type PortalCategory } from './register.js';

// ── Payload schema ─────────────────────────────────────────────────────────

export const UPDATE_METADATA_PAYLOAD_SCHEMA = z.object({
  portalId: z.string().uuid(),
  changes: z
    .object({
      title: z.union([z.string().max(200), z.null()]).optional(),
      description: z.union([z.string().max(2000), z.null()]).optional(),
      category: z.enum(PORTAL_CATEGORIES).optional(),
      publicIndex: z.boolean().optional(),
    })
    .refine((c) => Object.keys(c).length > 0, {
      message: 'changes must include at least one field',
    }),
});

export type UpdateMetadataPayload = z.infer<typeof UPDATE_METADATA_PAYLOAD_SCHEMA>;

// ── Builder ────────────────────────────────────────────────────────────────

export interface BuildUpdateMetadataArgs {
  portalId: string;
  namespace: string;
  changes: {
    title?: string | null;
    description?: string | null;
    category?: PortalCategory;
    publicIndex?: boolean;
  };
  actor: {
    contactHash: string;
    publicKeyHex: string;
  };
  privateKeyPem: string;
  /** Operation id of the latest op on this portal's chain. */
  priorOperationId: number;
}

export function buildUpdateMetadata(args: BuildUpdateMetadataArgs): SignedEnvelope {
  const payload: UpdateMetadataPayload = {
    portalId: args.portalId,
    changes: args.changes,
  };
  UPDATE_METADATA_PAYLOAD_SCHEMA.parse(payload);

  const envelope = buildEnvelope({
    operation: 'update_metadata',
    namespace: args.namespace,
    actor: args.actor,
    payload: payload as unknown as Record<string, unknown>,
    priorOperationId: args.priorOperationId,
  });
  return signEnvelope(envelope, args.privateKeyPem);
}
