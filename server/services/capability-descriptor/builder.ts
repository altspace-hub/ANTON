/**
 * builder.ts — High-level constructor for a complete capability descriptor.
 *
 * Takes the structured output of the portal walkthrough (Phase 5 — Capabilities)
 * plus the portal's facts and produces:
 *   1. A complete descriptor body validated against the schema.
 *   2. A signed envelope ready to serve at /capabilities (per Cap Schema §13).
 *   3. A flattened capability summary suitable for the registry's
 *      `update_capability_summary` operation (per Registry Protocol §5.3).
 */

import { randomUUID } from 'crypto';

import { publicKeyHexToWire } from '../../lib/portal-crypto.js';
import { descriptorHash } from './hash.js';
import {
  DESCRIPTOR_SCHEMA_VERSION,
  type CapabilityVerb,
  type PORTAL_CATEGORIES,
} from './schema.js';
import { signDescriptor, type SignedDescriptorEnvelope } from './signer.js';
import { validateDescriptor, type ValidationWithWarnings } from './validator.js';
import { getVerbBaseline } from './verbs/index.js';

// ── Input shapes (what the walkthrough produces) ───────────────────────────

export interface PortalFacts {
  name: string;
  namespace: string;
  displayTitle: string;
  category: (typeof PORTAL_CATEGORIES)[number];
  contactHash: string;
  publicKeyHex: string;
  /** Publisher's publicly-reachable HTTPS origin (no trailing slash). Optional but
   *  required for cross-internet visitors (Comm App, remote ANTON) to fetch pages
   *  + invoke capabilities. Joined with `/api/portals/visit/<address>/page` or
   *  `/capabilities/<id>/invoke`. Signed into the descriptor so a relay can't
   *  tamper with it. */
  originEndpoint?: string;
  /** Optional surface block — only set when the portal points at an
   *  externally-hosted HTML site. AAP endpoints stay on ANTON so the
   *  trust chain (Ed25519 signature + transparency log) is preserved. */
  surface?: {
    mode: 'managed' | 'external';
    url?: string;
    verifiedAt?: string;
  };
}

export interface CapabilityDeclaration {
  id: string;
  verb: CapabilityVerb;
  customVerbName?: string;
  title: string;
  description: string;
  aapEndpoint: string;
  /** Override or extend the verb baseline; if omitted, the baseline is used as-is. */
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  paymentCoupling?: Record<string, unknown>;
  slaHints?: Record<string, unknown>;
  availability?: Record<string, unknown>;
  trustRequirements?: Record<string, unknown>;
  tags?: string[];
  examples?: Array<Record<string, unknown>>;
}

export interface BuilderInput {
  portal: PortalFacts;
  identity: Record<string, unknown>;
  capabilities: CapabilityDeclaration[];
  payment?: Record<string, unknown>;
  policies?: Record<string, unknown>;
  availability?: Record<string, unknown>;
  attestations?: Array<Record<string, unknown>>;
  discoveryMetadata?: Record<string, unknown>;
  localizations?: Record<string, Record<string, unknown>>;
  extensions?: Record<string, unknown>;
  /** Validity window in days. Default 365. */
  validityDays?: number;
}

// ── Output ─────────────────────────────────────────────────────────────────

export interface BuiltDescriptor {
  /** The unsigned descriptor body. */
  descriptor: Record<string, unknown>;
  /** SHA-256 hex of canonical descriptor (binds to registry's descriptorHash field). */
  hash: string;
  /** Signed envelope ready to serve at the portal's /capabilities Gateway endpoint. */
  envelope: SignedDescriptorEnvelope;
  /** Flattened summary for Registry Protocol §5.3 update_capability_summary. */
  capabilitySummary: {
    capabilityVerbs: CapabilityVerb[];
    tags: string[];
    serviceAreas: string[];
    languages: string[];
    descriptorHash: string;
  };
  /** Schema validation result (errors should be []; warnings may be non-empty). */
  validation: ValidationWithWarnings;
}

// ── Build ──────────────────────────────────────────────────────────────────

export function buildDescriptor(input: BuilderInput, privateKeyPem: string): BuiltDescriptor {
  const portalAddress = `${input.portal.name}.${input.portal.namespace}.portal`;
  const now = new Date();
  const validityDays = input.validityDays ?? 365;
  const validUntil = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);

  const descriptor: Record<string, unknown> = {
    schemaVersion: DESCRIPTOR_SCHEMA_VERSION,
    descriptorId: randomUUID(),
    issuedAt: now.toISOString(),
    validFrom: now.toISOString(),
    validUntil: validUntil.toISOString(),
    portal: {
      name: portalAddress,
      namespace: input.portal.namespace,
      displayTitle: input.portal.displayTitle,
      category: input.portal.category,
      contactHash: input.portal.contactHash,
      publicKey: publicKeyHexToWire(input.portal.publicKeyHex),
      ...(input.portal.originEndpoint ? { originEndpoint: input.portal.originEndpoint } : {}),
      ...(input.portal.surface ? { surface: input.portal.surface } : {}),
    },
    identity: input.identity,
    capabilities: input.capabilities.map(buildCapability),
  };

  // Optional sections — only emit if provided.
  if (input.payment) descriptor.payment = input.payment;
  if (input.policies) descriptor.policies = input.policies;
  if (input.availability) descriptor.availability = input.availability;
  if (input.attestations && input.attestations.length > 0) descriptor.attestations = input.attestations;
  if (input.discoveryMetadata) descriptor.discoveryMetadata = input.discoveryMetadata;
  if (input.localizations) descriptor.localizations = input.localizations;
  if (input.extensions) descriptor.extensions = input.extensions;

  const validation = validateDescriptor(descriptor);
  if (!validation.valid) {
    throw new Error(
      'buildDescriptor: produced an invalid descriptor: ' +
        validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
    );
  }

  const hash = descriptorHash(descriptor);
  const envelope = signDescriptor(descriptor, input.portal.publicKeyHex, privateKeyPem);

  const capabilitySummary = extractCapabilitySummary(descriptor, hash);

  return { descriptor, hash, envelope, capabilitySummary, validation };
}

// ── Internals ──────────────────────────────────────────────────────────────

function buildCapability(decl: CapabilityDeclaration): Record<string, unknown> {
  const baseline = getVerbBaseline(decl.verb);
  const cap: Record<string, unknown> = {
    id: decl.id,
    verb: decl.verb,
    title: decl.title,
    description: decl.description,
    aapEndpoint: decl.aapEndpoint,
    inputSchema: decl.inputSchema ?? baseline.inputSchema,
    outputSchema: decl.outputSchema ?? baseline.outputSchema,
  };
  if (decl.customVerbName) cap.customVerbName = decl.customVerbName;
  if (decl.paymentCoupling) cap.paymentCoupling = decl.paymentCoupling;
  if (decl.slaHints) cap.slaHints = decl.slaHints;
  if (decl.availability) cap.availability = decl.availability;
  if (decl.trustRequirements) cap.trustRequirements = decl.trustRequirements;
  if (decl.tags) cap.tags = decl.tags;
  if (decl.examples) cap.examples = decl.examples;
  return cap;
}

function extractCapabilitySummary(descriptor: Record<string, unknown>, hash: string) {
  const caps = (descriptor.capabilities as Array<{ verb: CapabilityVerb; tags?: string[] }>) ?? [];
  const dm = (descriptor.discoveryMetadata as { tags?: string[]; serviceAreas?: string[]; languages?: string[] }) ?? {};

  const verbsSet = new Set<CapabilityVerb>();
  for (const c of caps) verbsSet.add(c.verb);

  const tagsSet = new Set<string>(dm.tags ?? []);
  for (const c of caps) for (const t of c.tags ?? []) tagsSet.add(t);

  return {
    capabilityVerbs: [...verbsSet],
    tags: [...tagsSet],
    serviceAreas: dm.serviceAreas ?? [],
    languages: dm.languages ?? [],
    descriptorHash: hash,
  };
}
