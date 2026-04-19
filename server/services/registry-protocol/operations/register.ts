/**
 * register.ts — `register` operation per Registry Protocol Reference §5.1.
 *
 * Claims a new name in a namespace. Validates name rules per §3.3, packs the
 * payload (with reservedRecoveryFields per §5.9), constructs + signs the
 * envelope.
 *
 * The actual HTTP submission and registry-side validation live in the
 * registry client (separate file) and registry server (separate repo).
 * This file is pure construction + local validation.
 */

import { z } from 'zod';

import { buildEnvelope, signEnvelope, type SignedEnvelope } from '../envelope.js';

// ── Categories per Capability Schema §10.1 ─────────────────────────────────

export const PORTAL_CATEGORIES = [
  'personal',
  'business',
  'community',
  'commerce',
  'team',
  'creator',
  'bulletin',
  'classroom',
  'teacher',
  'organisation',
  'other',
] as const;

export type PortalCategory = (typeof PORTAL_CATEGORIES)[number];

// ── Name validation per §3.3 ────────────────────────────────────────────────

/** Names: 3-63 chars after NFC; letters + digits + `-` and `.`; not edge dot/dash; no consecutive dots/dashes; lowercased. */
export function validatePortalName(rawName: string): string {
  if (typeof rawName !== 'string') {
    throw new Error('E_NAME_INVALID: name must be a string');
  }
  const name = rawName.normalize('NFC').toLowerCase();
  if (name.length < 3 || name.length > 63) {
    throw new Error('E_NAME_INVALID: name must be 3-63 characters');
  }
  // Allow letters (any Unicode L*), digits 0-9, `-`, `.`. Reject anything else.
  // Note: \p{L} requires the /u flag.
  if (!/^[\p{L}\p{Nd}.\-]+$/u.test(name)) {
    throw new Error('E_NAME_INVALID: name contains disallowed characters');
  }
  if (/^[-.]/.test(name) || /[-.]$/.test(name)) {
    throw new Error('E_NAME_INVALID: name must not start or end with `-` or `.`');
  }
  if (/\.\.|\.-|-\./.test(name)) {
    throw new Error('E_NAME_INVALID: name must not contain consecutive `.` or `.-` or `-.`');
  }
  return name;
}

// ── Payload schema per §5.1 ─────────────────────────────────────────────────

export const REGISTER_PAYLOAD_SCHEMA = z.object({
  name: z.string(),
  initialMetadata: z.object({
    title: z.string().max(200).optional(),
    description: z.string().max(2000).optional(),
    category: z.enum(PORTAL_CATEGORIES),
    publicIndex: z.boolean(),
    capabilitySummary: z.union([z.record(z.string(), z.unknown()), z.null()]),
  }),
  // Reserved per §5.9 — clients always send nulls in v1.0.0; v1.1+ may populate.
  recoveryFieldsReserved: z.object({
    recoveryContacts: z.union([z.array(z.string()), z.null()]),
    recoveryQuorum: z.union([z.number().int().positive(), z.null()]),
  }),
});

export type RegisterPayload = z.infer<typeof REGISTER_PAYLOAD_SCHEMA>;

// ── Builder ────────────────────────────────────────────────────────────────

export interface BuildRegisterArgs {
  name: string;
  namespace: string;
  category: PortalCategory;
  title?: string;
  description?: string;
  publicIndex?: boolean;
  actor: {
    contactHash: string;
    publicKeyHex: string;
  };
  privateKeyPem: string;
}

/**
 * Construct + sign a `register` envelope, ready to POST to the registry's
 * /v1/operations endpoint.
 *
 * `priorOperationId` is hardcoded to `null` per §5.1 — register is always
 * the first operation in a portal's chain.
 */
export function buildRegister(args: BuildRegisterArgs): SignedEnvelope {
  const name = validatePortalName(args.name);

  const payload: RegisterPayload = {
    name,
    initialMetadata: {
      title: args.title,
      description: args.description,
      category: args.category,
      publicIndex: args.publicIndex ?? false,
      capabilitySummary: null, // populated later via update_capability_summary once descriptor exists
    },
    recoveryFieldsReserved: {
      recoveryContacts: null,
      recoveryQuorum: null,
    },
  };

  // Defensive validation before signing.
  REGISTER_PAYLOAD_SCHEMA.parse(payload);

  const envelope = buildEnvelope({
    operation: 'register',
    namespace: args.namespace,
    actor: {
      contactHash: args.actor.contactHash,
      publicKeyHex: args.actor.publicKeyHex,
    },
    payload: payload as unknown as Record<string, unknown>,
    priorOperationId: null,
  });

  return signEnvelope(envelope, args.privateKeyPem);
}
