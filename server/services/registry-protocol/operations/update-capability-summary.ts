/**
 * update-capability-summary.ts — `update_capability_summary` per §5.3.
 *
 * Refreshes the flattened capability summary used by Pathfinder discovery.
 * Separated from update_metadata because summaries change more often and
 * should not force a re-render of unrelated portal metadata.
 *
 * Validation here is shape-only: canonical-verb enforcement lives in the
 * capability-descriptor validator to avoid coupling this builder to the
 * descriptor package.
 */

import { z } from 'zod';

import { buildEnvelope, signEnvelope, type SignedEnvelope } from '../envelope.js';

// ── Payload schema ─────────────────────────────────────────────────────────

export const UPDATE_CAPABILITY_SUMMARY_PAYLOAD_SCHEMA = z.object({
  portalId: z.string().uuid(),
  capabilitySummary: z.object({
    capabilityVerbs: z.array(z.string().min(1).max(32)).max(32),
    tags: z.array(z.string().min(1).max(64)).max(32).optional().default([]),
    serviceAreas: z.array(z.string().min(1).max(32)).max(32).optional().default([]),
    languages: z.array(z.string().regex(/^[a-z]{2,3}$/, 'ISO 639 language code')).max(16).optional().default([]),
    descriptorHash: z.string().regex(/^[0-9a-f]{64}$/, 'must be SHA-256 hex (64 chars)'),
  }),
});

export type UpdateCapabilitySummaryPayload = z.infer<typeof UPDATE_CAPABILITY_SUMMARY_PAYLOAD_SCHEMA>;

// ── Builder ────────────────────────────────────────────────────────────────

export interface BuildUpdateCapabilitySummaryArgs {
  portalId: string;
  namespace: string;
  capabilitySummary: {
    capabilityVerbs: string[];
    tags?: string[];
    serviceAreas?: string[];
    languages?: string[];
    descriptorHash: string;
  };
  actor: {
    contactHash: string;
    publicKeyHex: string;
  };
  privateKeyPem: string;
  priorOperationId: number;
}

export function buildUpdateCapabilitySummary(args: BuildUpdateCapabilitySummaryArgs): SignedEnvelope {
  const payload: UpdateCapabilitySummaryPayload = {
    portalId: args.portalId,
    capabilitySummary: {
      capabilityVerbs: args.capabilitySummary.capabilityVerbs,
      tags: args.capabilitySummary.tags ?? [],
      serviceAreas: args.capabilitySummary.serviceAreas ?? [],
      languages: args.capabilitySummary.languages ?? [],
      descriptorHash: args.capabilitySummary.descriptorHash.toLowerCase(),
    },
  };
  UPDATE_CAPABILITY_SUMMARY_PAYLOAD_SCHEMA.parse(payload);

  const envelope = buildEnvelope({
    operation: 'update_capability_summary',
    namespace: args.namespace,
    actor: args.actor,
    payload: payload as unknown as Record<string, unknown>,
    priorOperationId: args.priorOperationId,
  });
  return signEnvelope(envelope, args.privateKeyPem);
}
