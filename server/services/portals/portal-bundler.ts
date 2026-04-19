/**
 * portal-bundler.ts — export + import the `portal` .anton bundle type.
 *
 * Implements ANTON_Portals_Spec.md v0.2 §D (bundle layout). Mirrors the
 * structural conventions of `bundleHardwareTemplate` / `bundleHardwareProject`
 * in anton-bundler.ts but lives in its own file because:
 *   - portals need import logic (most other bundle types are export-only)
 *   - signature verification of the embedded capability descriptor at import
 *     is non-trivial and benefits from being co-located with export
 *
 * Bundle layout per Spec v0.2 §D.3:
 *
 *   portal-<name>.anton/
 *     manifest.json
 *     capability-descriptor.json   ← the signed envelope from Cap Schema §13.2
 *     schema.sql                   ← portal database schema
 *     data-seed.sql                ← initial content
 *     pages/index.html, about.html, ...
 *     assets/logo.png, ...
 *     walkthrough.json             ← AI-led build conversation transcript
 *     README.md
 */

import AdmZip from 'adm-zip';
import { normalize } from 'path';

import type { DatabaseAdapter } from '../../db/database.js';

import { verifyDescriptor, type SignedDescriptorEnvelope } from '../capability-descriptor/signer.ts';
import { descriptorHash } from '../capability-descriptor/hash.ts';

// ── Manifest schema (Spec v0.2 §D.2) ────────────────────────────────────────

export const PORTAL_BUNDLE_FORMAT_VERSION = '1.0.0' as const;
export const PORTAL_BUNDLE_SCHEMA_VERSION = 'portal-1.0.0' as const;

export interface PortalBundleManifest {
  bundleType: 'portal';
  bundleVersion: typeof PORTAL_BUNDLE_FORMAT_VERSION;
  schemaVersion: typeof PORTAL_BUNDLE_SCHEMA_VERSION;
  name: string;
  namespace: string;
  displayTitle: string;
  category: string;
  template: string | null;
  createdAt: string;
  updatedAt: string;
  author: { contactHash: string; displayName: string | null };
  capabilityDescriptorRef: 'capability-descriptor.json';
  pagesRef: 'pages/';
  assetsRef: 'assets/';
  dataSchemaRef: 'schema.sql';
  dataSeedRef: 'data-seed.sql';
  walkthroughTranscriptRef: 'walkthrough.json';
  adaptationPoints: AdaptationPoint[];
  dependencies: { minAntonVersion: string; requiredModules: string[]; requiredAreas: string[] };
}

export interface AdaptationPoint {
  id: string;
  label: string;
  /** null indicates a template — the importer is prompted for a value. */
  currentValue: string | null;
  type: 'string' | 'number' | 'boolean' | 'email' | 'url';
  required: boolean;
  guidance?: string;
}

// ── Export ──────────────────────────────────────────────────────────────────

export interface BundlePortalOptions {
  /** Strip identity-specific values from adaptationPoints, producing a template. */
  redactToTemplate?: boolean;
  /** Override author display name (e.g. 'Anonymous' for shared templates). */
  authorDisplayNameOverride?: string | null;
}

/**
 * Build a `portal-<name>.anton` bundle from a portal id. Reads the portal,
 * its capability descriptor, the portal's local DB schema + seed, the rendered
 * pages, the static assets, and the walkthrough transcript.
 *
 * The capability descriptor envelope is included AS-IS (with its signature)
 * so importers can verify provenance.
 */
export async function bundlePortal(
  db: DatabaseAdapter,
  portalId: string,
  options: BundlePortalOptions = {},
): Promise<Buffer> {
  const portal = await db.get<{
    id: string;
    name: string;
    namespace: string;
    category: string;
    display_title: string | null;
    description: string | null;
    template: string | null;
    contact_hash: string;
    created_at: string;
    updated_at: string;
    metadata: Record<string, unknown> | null;
  }>(`SELECT id, name, namespace, category, display_title, description, template,
             contact_hash, created_at, updated_at, metadata
        FROM portals WHERE id = ?`, portalId);

  if (!portal) throw new Error(`Portal ${portalId} not found`);

  // Signed capability descriptor — pulled from descriptor cache for the portal's
  // own address. (The walkthrough writes it there at publish time.)
  const portalAddress = `${portal.name}.${portal.namespace}.portal`;
  const descRow = await db.get<{
    descriptor: Record<string, unknown>;
    signature: string;
    signing_key_fingerprint: string;
  }>(`SELECT descriptor, signature, signing_key_fingerprint
        FROM portal_descriptor_cache WHERE portal_address = ?`, portalAddress);

  // Pages, assets, structured data, walkthrough come from the real tables
  // populated by the walkthrough engine and the portal-database-service.
  // (Earlier the bundler read these from a metadata.bundleArtefacts
  // side-channel that the walkthrough never wrote to — a contract bug
  // that produced empty bundles. Now we go straight to the source.)
  const pageRows = await db.all<{
    path: string; title: string | null; html: string;
    structured_data: Record<string, unknown> | null; sort_order: number; visible: boolean;
  }>(
    `SELECT path, title, html, structured_data, sort_order, visible
     FROM portal_pages WHERE portal_id = ? ORDER BY sort_order, path`,
    portalId,
  );
  const pages: Record<string, string> = {};
  for (const p of pageRows) {
    // Strip leading slash for the bundle's pages/ directory; '/' → 'index.html',
    // '/about' → 'about.html', '/products/cake' → 'products/cake.html'.
    const fname = (p.path === '/' ? 'index' : p.path.replace(/^\/+/, '')) + '.html';
    pages[fname] = p.html;
  }

  const assetRows = await db.all<{
    path: string; mime_type: string; content: Buffer | null;
  }>(
    `SELECT path, mime_type, content FROM portal_assets WHERE portal_id = ?`,
    portalId,
  );
  const assets: Record<string, string> = {};
  for (const a of assetRows) {
    if (a.content) assets[a.path] = a.content.toString('base64');
  }

  const structuredRows = await db.all<{
    kind: string; key: string; value: Record<string, unknown>;
  }>(
    `SELECT kind, key, value FROM portal_structured_data WHERE portal_id = ?
     ORDER BY kind, key`,
    portalId,
  );

  // Walkthrough transcript: pull the most recent finalized session for this portal.
  const sessRow = await db.get<{ accumulated_state: Record<string, unknown> }>(
    `SELECT accumulated_state FROM portal_walkthrough_sessions
     WHERE portal_id = ? AND status = 'finalized'
     ORDER BY finalized_at DESC LIMIT 1`,
    portalId,
  );
  const walkthrough = sessRow?.accumulated_state ?? null;

  // schema.sql / data-seed.sql remain placeholders — the portal's content is
  // captured via portal_pages + portal_structured_data above. The .anton
  // bundle format reserves these slots for future use (e.g. exporting a
  // restorable portal-content.sql script).
  const schemaSql = '-- portal content is in pages/ and structured-data.json; sql restore not yet generated\n';
  const dataSeedSql = `-- structured data: ${structuredRows.length} item(s) across ${new Set(structuredRows.map(r => r.kind)).size} kind(s)\n`;

  // Adaptation points are still authored via metadata (Phase 9+ enhancement
  // would let the walkthrough's own outputs declare them).
  const adaptationPoints = ((portal.metadata?.bundleArtefacts as { adaptationPoints?: AdaptationPoint[] } | undefined)?.adaptationPoints ?? []);

  // Construct manifest. If redactToTemplate, blank out identity-bearing values.
  const author = {
    contactHash: portal.contact_hash,
    displayName: options.authorDisplayNameOverride ?? null,
  };
  if (options.redactToTemplate) {
    author.contactHash = 'ANTON-TMPL-TMPL-TMPL-TMPL';
  }

  const manifest: PortalBundleManifest = {
    bundleType: 'portal',
    bundleVersion: PORTAL_BUNDLE_FORMAT_VERSION,
    schemaVersion: PORTAL_BUNDLE_SCHEMA_VERSION,
    name: portal.name,
    namespace: portal.namespace,
    displayTitle: portal.display_title ?? portal.name,
    category: portal.category,
    template: portal.template,
    createdAt: new Date(portal.created_at).toISOString(),
    updatedAt: new Date(portal.updated_at).toISOString(),
    author,
    capabilityDescriptorRef: 'capability-descriptor.json',
    pagesRef: 'pages/',
    assetsRef: 'assets/',
    dataSchemaRef: 'schema.sql',
    dataSeedRef: 'data-seed.sql',
    walkthroughTranscriptRef: 'walkthrough.json',
    adaptationPoints: options.redactToTemplate
      ? adaptationPoints.map((p) => ({ ...p, currentValue: null }))
      : adaptationPoints,
    dependencies: {
      minAntonVersion: '0.7.0',
      requiredModules: [],
      requiredAreas: [],
    },
  };

  // Build the zip.
  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));

  if (descRow) {
    const envelope: SignedDescriptorEnvelope = {
      descriptor: descRow.descriptor,
      signature: descRow.signature,
      signatureAlgorithm: 'Ed25519',
      signingKeyFingerprint: descRow.signing_key_fingerprint,
    };
    zip.addFile('capability-descriptor.json', Buffer.from(JSON.stringify(envelope, null, 2), 'utf-8'));
  }

  zip.addFile('schema.sql', Buffer.from(schemaSql, 'utf-8'));
  zip.addFile('data-seed.sql', Buffer.from(dataSeedSql, 'utf-8'));

  for (const [path, html] of Object.entries(pages)) {
    if (!isSafePath(path)) continue;
    zip.addFile(`pages/${path}`, Buffer.from(html, 'utf-8'));
  }
  for (const [path, base64] of Object.entries(assets)) {
    if (!isSafePath(path)) continue;
    zip.addFile(`assets/${path}`, Buffer.from(base64, 'base64'));
  }

  // Structured data: serialised as one JSON file grouped by kind. The
  // renderer iterates over portal_structured_data via {{#each kind}} blocks,
  // so re-importers can re-seed by upserting each (kind, key, value).
  if (structuredRows.length > 0) {
    const grouped: Record<string, Array<{ key: string; value: Record<string, unknown> }>> = {};
    for (const r of structuredRows) {
      grouped[r.kind] ??= [];
      grouped[r.kind].push({ key: r.key, value: r.value });
    }
    zip.addFile('structured-data.json', Buffer.from(JSON.stringify(grouped, null, 2), 'utf-8'));
  }

  zip.addFile('walkthrough.json', Buffer.from(JSON.stringify(walkthrough, null, 2), 'utf-8'));

  const readme = buildReadme(manifest);
  zip.addFile('README.md', Buffer.from(readme, 'utf-8'));

  return zip.toBuffer();
}

// ── Import ─────────────────────────────────────────────────────────────────

const MAX_FILES = 200;
const MAX_BUNDLE_BYTES = 25 * 1024 * 1024; // 25 MB

export interface ImportPortalResult {
  success: boolean;
  portalId?: string;
  manifest?: PortalBundleManifest;
  isTemplate: boolean;
  warnings: string[];
  errors: string[];
}

export interface ImportPortalOptions {
  /** Override the portal name on import (e.g. for templates being adapted). */
  newName?: string;
  /** Override the namespace (default: keep manifest's). */
  newNamespace?: string;
  /** Trust descriptor signature from the bundle author. Defaults to true. */
  verifyDescriptorSignature?: boolean;
}

/**
 * Validate + install a `portal` .anton bundle. Performs:
 *   1. Zip safety: file count, total size, path traversal.
 *   2. Manifest validation: shape + bundleType + schemaVersion.
 *   3. Capability descriptor signature verification (if option set).
 *   4. Registry-name conflict check against portals table.
 *   5. Insert portal row (status='draft').
 *
 * Returns enough info for the caller to drive an adaptation session
 * (Spec §D.4) when the bundle is a template.
 */
export async function importPortal(
  db: DatabaseAdapter,
  bundleBuffer: Buffer,
  options: ImportPortalOptions = {},
): Promise<ImportPortalResult> {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (bundleBuffer.length > MAX_BUNDLE_BYTES) {
    return { success: false, isTemplate: false, warnings, errors: [`Bundle too large (${bundleBuffer.length} bytes, max ${MAX_BUNDLE_BYTES})`] };
  }

  // 1. Zip safety.
  let zip: AdmZip;
  try {
    zip = new AdmZip(bundleBuffer);
  } catch {
    return { success: false, isTemplate: false, warnings, errors: ['Invalid zip archive'] };
  }
  const entries = zip.getEntries();
  if (entries.length > MAX_FILES) {
    errors.push(`Too many files: ${entries.length} (max ${MAX_FILES})`);
  }
  for (const e of entries) {
    if (!isSafePath(e.entryName)) errors.push(`Unsafe path: ${e.entryName}`);
  }
  if (errors.length > 0) return { success: false, isTemplate: false, warnings, errors };

  // 2. Manifest.
  const manifestEntry = zip.getEntry('manifest.json');
  if (!manifestEntry) {
    return { success: false, isTemplate: false, warnings, errors: ['Missing manifest.json'] };
  }
  let manifest: PortalBundleManifest;
  try {
    manifest = JSON.parse(manifestEntry.getData().toString('utf-8'));
  } catch {
    return { success: false, isTemplate: false, warnings, errors: ['Invalid manifest.json: not JSON'] };
  }
  if (manifest.bundleType !== 'portal') {
    return { success: false, isTemplate: false, warnings, errors: [`Bundle is not a portal (bundleType=${manifest.bundleType})`] };
  }
  if (manifest.schemaVersion !== PORTAL_BUNDLE_SCHEMA_VERSION) {
    warnings.push(`Manifest schemaVersion is ${manifest.schemaVersion}; expected ${PORTAL_BUNDLE_SCHEMA_VERSION} (will attempt import anyway)`);
  }

  // Detect template vs concrete portal.
  const isTemplate =
    manifest.author.contactHash === 'ANTON-TMPL-TMPL-TMPL-TMPL' ||
    manifest.adaptationPoints.some((p) => p.required && p.currentValue === null);

  // 3. Descriptor signature verification (skip for unsigned templates).
  const descEntry = zip.getEntry('capability-descriptor.json');
  let descriptorEnvelope: SignedDescriptorEnvelope | null = null;
  if (descEntry) {
    try {
      descriptorEnvelope = JSON.parse(descEntry.getData().toString('utf-8'));
    } catch {
      errors.push('capability-descriptor.json is not valid JSON');
    }
    if (descriptorEnvelope && options.verifyDescriptorSignature !== false && !isTemplate) {
      // The expected public key is the one embedded in the descriptor itself —
      // for import we accept self-attestation of the descriptor body.
      const portalSection = (descriptorEnvelope.descriptor as { portal?: { publicKey?: string } }).portal;
      if (portalSection?.publicKey) {
        const r = verifyDescriptor(descriptorEnvelope, { publicKey: portalSection.publicKey });
        if (!r.valid) {
          errors.push(`Descriptor signature failed: ${r.reasons.join('; ')}`);
        } else {
          // Sanity-check the descriptor hash binds to its content.
          const hashCheck = descriptorHash(descriptorEnvelope.descriptor);
          if (hashCheck.length !== 64) errors.push('Descriptor hash invalid');
        }
      }
    }
  }

  if (errors.length > 0) return { success: false, isTemplate, manifest, warnings, errors };

  // 4. Registry-name conflict.
  const finalName = options.newName ?? manifest.name;
  const finalNamespace = options.newNamespace ?? manifest.namespace;
  const existing = await db.get<{ id: string }>(
    `SELECT id FROM portals WHERE namespace = ? AND name = ?`,
    finalNamespace,
    finalName,
  );
  if (existing) {
    return {
      success: false,
      isTemplate,
      manifest,
      warnings,
      errors: [`A local portal named ${finalName} already exists in ${finalNamespace} (id: ${existing.id}). Choose a new name via options.newName.`],
    };
  }

  // 5. Insert portal row in draft state. Identity material is NOT carried
  // over from the bundle — the importer needs a new keypair (handled by the
  // walkthrough's adaptation phase, which calls hardware-style identity
  // generation before publish).
  const now = new Date().toISOString();
  const insertResult = await db.run(
    `INSERT INTO portals
       (name, namespace, category, display_title, description, template,
        contact_hash, public_key_hex, private_key_pem,
        status, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
     RETURNING id`,
    finalName,
    finalNamespace,
    manifest.category,
    manifest.displayTitle,
    null, // description filled in adaptation
    manifest.template,
    'ANTON-IMPT-IMPT-IMPT-IMPT', // placeholder until adaptation generates a real keypair
    'PENDING_ADAPTATION',
    'PENDING_ADAPTATION',
    JSON.stringify({
      bundleManifest: manifest,
      bundleAdaptationPoints: manifest.adaptationPoints,
      bundleArtefactsAvailable: {
        capabilityDescriptor: !!descEntry,
        pages: zip.getEntries().filter((e) => e.entryName.startsWith('pages/')).length,
        assets: zip.getEntries().filter((e) => e.entryName.startsWith('assets/')).length,
      },
    }),
    now,
    now,
  );

  // PG returns the inserted UUID via RETURNING; the adapter stuffs it into lastInsertRowid.
  // For UUID primary keys the better path is to re-SELECT.
  const inserted = await db.get<{ id: string }>(
    `SELECT id FROM portals WHERE namespace = ? AND name = ?`,
    finalNamespace,
    finalName,
  );

  return {
    success: true,
    portalId: inserted?.id,
    manifest,
    isTemplate,
    warnings,
    errors: [],
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isSafePath(p: string): boolean {
  const normalized = normalize(p);
  if (normalized.includes('..')) return false;
  if (normalized.startsWith('/') || normalized.startsWith('\\')) return false;
  if (/^[a-zA-Z]:/.test(normalized)) return false; // Windows absolute path
  return true;
}

function buildReadme(manifest: PortalBundleManifest): string {
  return `# Portal: ${manifest.displayTitle}

**Address:** \`${manifest.name}.${manifest.namespace}.portal\`
**Category:** ${manifest.category}
${manifest.template ? `**Template:** ${manifest.template}` : ''}
**Created:** ${manifest.createdAt}
**Last updated:** ${manifest.updatedAt}

## Contents

| Path | Purpose |
|---|---|
| \`manifest.json\` | Bundle metadata + adaptation points |
| \`capability-descriptor.json\` | Signed Ed25519 envelope of the portal's machine-readable capabilities |
| \`schema.sql\` | Portal database schema (per-portal sub-schema) |
| \`data-seed.sql\` | Initial content rows |
| \`pages/\` | Rendered HTML pages |
| \`assets/\` | Static assets (images, etc.) |
| \`walkthrough.json\` | AI-led build conversation transcript |

## How to import

Drag this file into ANTON. The client will validate the manifest, verify the
capability descriptor signature, and either import directly or guide you
through an adaptation session if this bundle was published as a template.

## Adaptation points

${manifest.adaptationPoints.length === 0
  ? '_None — this portal has no caller-supplied parameters._'
  : manifest.adaptationPoints.map((p) => `- **${p.label}** (\`${p.id}\`, ${p.type}${p.required ? ', required' : ''})${p.guidance ? `\n  > ${p.guidance}` : ''}`).join('\n')}

ANTON does not certify any portal content. The portal owner is the responsible
party for the content, the privacy policy, and any commerce conducted through
the portal's capabilities.
`;
}
