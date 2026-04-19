/**
 * portal-capabilities-editor.ts — post-publish capability editing.
 *
 * Owners need to update what their portal does after the initial walkthrough:
 * add a new capability, change a description, fix an aap_endpoint typo. This
 * module re-runs the buildDescriptor pipeline on the existing portal: it pulls
 * the current portal facts + private key, takes the caller's new capability
 * list, and produces a fresh signed descriptor. Everything happens in one
 * transaction so the descriptor cache + portals row + capability_summary
 * stay in sync.
 *
 * Cache invalidation is automatic — the portal_descriptor_cache row is
 * upserted with a new descriptor_hash. Visitors fetching /capabilities get
 * the new descriptor on their next request.
 */

import type { DatabaseAdapter } from '../../db/database.js';
import { childLogger } from '../../lib/logger.js';
import { decryptPortalKey } from '../../lib/portal-key-cipher.js';
import { buildDescriptor, type CapabilityDeclaration } from '../capability-descriptor/builder.js';
import { PORTAL_CATEGORIES } from '../capability-descriptor/schema.js';

const log = childLogger('portal-capabilities-editor');

export interface PortalUpdates {
  displayTitle?: string;
  description?: string;
  publicIndex?: boolean;
}

interface PortalRow {
  id: string; name: string; namespace: string; category: string;
  display_title: string | null; description: string | null;
  contact_hash: string; public_key_hex: string; private_key_pem: string;
  public_index: boolean;
}

interface DescriptorRow { descriptor: Record<string, unknown> | string }

/**
 * Replace this portal's capability declarations and re-sign the descriptor.
 * Throws if the portal doesn't exist or buildDescriptor rejects the input.
 */
export async function rebuildPortalDescriptor(
  db: DatabaseAdapter,
  portalId: string,
  newCapabilities: CapabilityDeclaration[],
  updates: PortalUpdates = {},
): Promise<{ descriptorHash: string; capabilitySummary: Record<string, unknown> }> {
  const portal = await db.get<PortalRow>(
    `SELECT id, name, namespace, category, display_title, description,
            contact_hash, public_key_hex, private_key_pem, public_index
     FROM portals WHERE id = ?`, portalId,
  );
  if (!portal) throw new Error(`Portal ${portalId} not found`);

  // Resolve final field values: caller updates win, otherwise current values.
  const displayTitle = updates.displayTitle ?? portal.display_title ?? portal.name;
  const description = updates.description ?? portal.description;
  const publicIndex = updates.publicIndex ?? portal.public_index;

  // Pull non-capability sections (policies, payment, etc.) from the existing
  // descriptor so we don't lose them on re-derive. The capabilities field is
  // intentionally replaced wholesale.
  const existing = await db.get<DescriptorRow>(
    `SELECT descriptor FROM portal_descriptor_cache
     WHERE portal_address = ?`,
    `${portal.name}.${portal.namespace}.portal`,
  );
  const existingDescriptor = existing
    ? (typeof existing.descriptor === 'string' ? JSON.parse(existing.descriptor) : existing.descriptor)
    : {};

  const built = buildDescriptor({
    portal: {
      name: portal.name,
      namespace: portal.namespace,
      displayTitle,
      category: portal.category as (typeof PORTAL_CATEGORIES)[number],
      contactHash: portal.contact_hash,
      publicKeyHex: portal.public_key_hex,
    },
    identity: (existingDescriptor.identity as Record<string, unknown>) ?? {
      humanContact: { available: true, displayName: displayTitle, languages: ['en'] },
    },
    capabilities: newCapabilities,
    payment: existingDescriptor.payment as Record<string, unknown> | undefined,
    policies: existingDescriptor.policies as Record<string, unknown> | undefined,
    availability: existingDescriptor.availability as Record<string, unknown> | undefined,
    discoveryMetadata: publicIndex
      ? {
          publicIndex: true,
          primaryCategory: portal.category,
          tags: newCapabilities.flatMap((c) => c.tags ?? []),
        }
      : { publicIndex: false },
  }, decryptPortalKey(portal.private_key_pem));

  const portalAddress = `${portal.name}.${portal.namespace}.portal`;

  await db.transaction(async (tx) => {
    // Update portal row with new identity fields + descriptor hash + summary.
    await tx.run(
      `UPDATE portals
         SET display_title = ?, description = ?, public_index = ?,
             descriptor_hash = ?, capability_summary = ?, updated_at = NOW()
       WHERE id = ?`,
      displayTitle, description, publicIndex,
      built.hash, JSON.stringify(built.capabilitySummary), portalId,
    );

    // Replace cached descriptor envelope.
    await tx.run(
      `INSERT INTO portal_descriptor_cache
         (portal_address, descriptor_hash, descriptor, signature, signing_key_fingerprint,
          valid_from, valid_until)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW() + INTERVAL '365 days')
       ON CONFLICT (portal_address) DO UPDATE SET
         descriptor_hash = EXCLUDED.descriptor_hash,
         descriptor = EXCLUDED.descriptor,
         signature = EXCLUDED.signature,
         signing_key_fingerprint = EXCLUDED.signing_key_fingerprint,
         valid_from = EXCLUDED.valid_from,
         valid_until = EXCLUDED.valid_until,
         fetched_at = NOW()`,
      portalAddress, built.hash, JSON.stringify(built.descriptor),
      built.envelope.signature, built.envelope.signingKeyFingerprint,
    );
  });

  log.info({
    portalId, portalAddress, capabilityCount: newCapabilities.length,
    descriptorHash: built.hash, publicIndex,
  }, 'descriptor_rebuilt');

  return {
    descriptorHash: built.hash,
    capabilitySummary: built.capabilitySummary as unknown as Record<string, unknown>,
  };
}

/**
 * Extract editable capability declarations from the cached descriptor. Used
 * by the edit UI to seed the form. Returns [] if no descriptor cached yet.
 */
export async function readCurrentCapabilities(
  db: DatabaseAdapter,
  portalId: string,
): Promise<CapabilityDeclaration[]> {
  const row = await db.get<{ name: string; namespace: string }>(
    `SELECT name, namespace FROM portals WHERE id = ?`, portalId,
  );
  if (!row) return [];
  const portalAddress = `${row.name}.${row.namespace}.portal`;
  const descRow = await db.get<DescriptorRow>(
    `SELECT descriptor FROM portal_descriptor_cache WHERE portal_address = ?`,
    portalAddress,
  );
  if (!descRow) return [];
  const descriptor = typeof descRow.descriptor === 'string'
    ? JSON.parse(descRow.descriptor)
    : descRow.descriptor;
  const caps = (descriptor.capabilities as Array<Record<string, unknown>> | undefined) ?? [];
  return caps.map((c) => ({
    id: c.id as string,
    verb: c.verb as CapabilityDeclaration['verb'],
    customVerbName: c.customVerbName as string | undefined,
    title: c.title as string,
    description: c.description as string,
    aapEndpoint: c.aapEndpoint as string,
    inputSchema: c.inputSchema as Record<string, unknown> | undefined,
    outputSchema: c.outputSchema as Record<string, unknown> | undefined,
    paymentCoupling: c.paymentCoupling as Record<string, unknown> | undefined,
    slaHints: c.slaHints as Record<string, unknown> | undefined,
    availability: c.availability as Record<string, unknown> | undefined,
    trustRequirements: c.trustRequirements as Record<string, unknown> | undefined,
    tags: c.tags as string[] | undefined,
    examples: c.examples as Array<Record<string, unknown>> | undefined,
  }));
}
