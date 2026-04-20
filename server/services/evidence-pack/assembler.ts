/**
 * assembler.ts — take collected items, dedupe, order, write the pack rows,
 * compute the manifest hash. Produces an `AssembledPack` ready for export.
 *
 * The manifest is the single source of truth that downstream exporters
 * (.anton, PDF, JSONL, HTML) format around. A regulator verifying the pack
 * verifies the manifest hash; the manifest in turn binds every item by hash.
 *
 * Per spec §13.4: identical scope assembled twice must produce the same
 * manifest hash if no underlying data changed. This is what `canonicalise`
 * + sorted key insertion + ISO timestamps everywhere gets us.
 */

import { createHash } from 'node:crypto';

import type { DatabaseAdapter } from '../../db/database.js';
import { childLogger } from '../../lib/logger.js';
import { canonicalise, type CollectedItem, type CollectedItems, type ScopeDefinition } from './collector.js';
import { signManifestHash } from './signer.js';

const log = childLogger('evidence-pack-assembler');

const SCHEMA_VERSION = '1.0';
const ANTON_VERSION = '0.7.5';

export interface PackRow {
  id: string; title: string; purpose: string | null;
  scope_type: string; scope_ref: Record<string, unknown> | null;
  scope_label: string | null;
  created_by: string; created_at: string;
  finalised_at: string | null; status: string;
  hash_manifest: string | null;
  signature: string | null; signer_public_key: string | null;
  item_count: number; size_bytes: number;
  retention_until: string | null; legal_hold: boolean;
  supersedes: string | null;
  compliance_frameworks: string[];
  compliance_gaps: Record<string, { rationale: string; acceptedAt: string; acceptedBy: string }>;
  notes: string | null;
}

export interface ManifestItem {
  order: number;
  type: string;
  id: string;
  table: string;
  hash: string;
  summary: string;
  regulatoryRelevance: string[];
  contentRef: string;        // `items/<type>_<id>.json` — exporter writes this file
}

export interface PackManifest {
  packId: string;
  schemaVersion: string;
  antonVersion: string;
  title: string;
  purpose: string | null;
  scope: { type: string; ref: Record<string, unknown> | null; label: string };
  created: { by: string; at: string };
  complianceFrameworks: string[];
  itemCount: number;
  itemsByType: Record<string, number>;
  manifestHash: string;        // sha256 of canonical(manifest minus this field + signature fields)
  signature: string | null;    // Phase 2: ed25519 over manifestHash
  signerPublicKey: string | null;
  items: ManifestItem[];
}

export interface AssembledPack {
  pack: PackRow;
  manifest: PackManifest;
  collectedItems: CollectedItem[];   // exporters need the raw canonical bodies
  /** Phase 4: per-item redaction status, keyed by `${itemType}:${itemId}`.
   *  Bundler + PDF inspect this to redact bodies on export. Empty object
   *  when no items are redacted. */
  redactions: Record<string, { status: string; reason: string | null }>;
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface AssembleInput {
  packId: string;
  title: string;
  purpose?: string;
  scope: ScopeDefinition;
  scopeLabel: string;
  collected: CollectedItems;
  createdBy: string;
  complianceFrameworks?: string[];
  notes?: string;
  retentionDays?: number;
}

/**
 * Build the manifest, write evidence_pack_items rows, and compute the hash.
 * Caller is responsible for: (1) evidence_packs row already inserted as
 * draft; (2) calling finalisePack() after this returns to flip status to
 * 'finalised'.
 */
export async function assemblePack(db: DatabaseAdapter, input: AssembleInput): Promise<AssembledPack> {
  // 1. Dedupe — an item referenced through multiple paths (a session that
  // feeds both a canvas and a workflow_run) appears once.
  const deduped = dedupe(input.collected.items);

  // 2. Order — chronological within type, then alphabetical by id, then by
  // type itself for stability.
  const ordered = orderItems(deduped);

  // 3. Write evidence_pack_items rows in one transaction. Preserve existing
  // redaction state across re-assembly (Phase 4): if the same (item_type,
  // item_id) appears again, re-apply its prior redaction so re-collecting
  // doesn't silently un-redact items.
  const priorRedactions = await db.all<{ item_type: string; item_id: string; redaction_status: string; redaction_reason: string | null }>(
    `SELECT item_type, item_id, redaction_status, redaction_reason
     FROM evidence_pack_items
     WHERE pack_id = ? AND redaction_status != 'none'`,
    input.packId,
  );
  const redactionMap = new Map<string, { status: string; reason: string | null }>();
  for (const r of priorRedactions) {
    redactionMap.set(`${r.item_type}:${r.item_id}`, { status: r.redaction_status, reason: r.redaction_reason });
  }
  await db.transaction(async (tx) => {
    await tx.run(`DELETE FROM evidence_pack_items WHERE pack_id = ?`, input.packId);
    for (let i = 0; i < ordered.length; i++) {
      const item = ordered[i];
      const prior = redactionMap.get(`${item.itemType}:${item.itemId}`);
      await tx.run(
        `INSERT INTO evidence_pack_items
           (pack_id, item_type, item_table, item_id, item_hash, item_summary,
            item_order, regulatory_relevance, redaction_status, redaction_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?)`,
        input.packId, item.itemType, item.itemTable, item.itemId, item.itemHash,
        item.itemSummary, i, JSON.stringify(item.regulatoryRelevance),
        prior?.status ?? 'none', prior?.reason ?? null,
      );
    }
  });

  // 4. Build the manifest.
  const manifestItems: ManifestItem[] = ordered.map((item, i) => ({
    order: i,
    type: item.itemType,
    id: item.itemId,
    table: item.itemTable,
    hash: item.itemHash,
    summary: item.itemSummary,
    regulatoryRelevance: item.regulatoryRelevance,
    contentRef: `items/${item.itemType}_${safeFilename(item.itemId)}.json`,
  }));

  const itemsByType: Record<string, number> = {};
  for (const it of ordered) itemsByType[it.itemType] = (itemsByType[it.itemType] ?? 0) + 1;

  // We compute the manifest hash over the manifest itself with the hash and
  // signature fields zeroed out — bog-standard self-referencing hash trick.
  const skeleton: PackManifest = {
    packId: input.packId,
    schemaVersion: SCHEMA_VERSION,
    antonVersion: ANTON_VERSION,
    title: input.title,
    purpose: input.purpose ?? null,
    scope: { type: input.scope.type, ref: scopeToJson(input.scope), label: input.scopeLabel },
    created: { by: input.createdBy, at: new Date().toISOString() },
    complianceFrameworks: input.complianceFrameworks ?? ['eu_ai_act', 'amlr'],
    itemCount: ordered.length,
    itemsByType,
    manifestHash: '',
    signature: null,
    signerPublicKey: null,
    items: manifestItems,
  };
  const hashable = { ...skeleton, manifestHash: '', signature: null, signerPublicKey: null, created: { ...skeleton.created, at: '__pinned__' } };
  const manifestHash = 'sha256:' + createHash('sha256').update(canonicalise(hashable)).digest('hex');
  const manifest: PackManifest = { ...skeleton, manifestHash };

  // 5. Update the pack row with item_count + hash_manifest. retention_until
  // computed here so admins can see it on the cover page even before finalise.
  const retentionDays = input.retentionDays ?? 183; // ~6 months, EU AI Act Art 26
  const retentionIso = new Date(Date.now() + retentionDays * 86400000).toISOString();
  await db.run(
    `UPDATE evidence_packs
       SET item_count = ?, hash_manifest = ?, retention_until = ?
     WHERE id = ?`,
    ordered.length, manifestHash, retentionIso, input.packId,
  );

  // Re-read the pack row so callers get the persisted shape.
  const pack = await readPackRow(db, input.packId);
  if (!pack) throw new Error(`Pack ${input.packId} disappeared mid-assembly`);

  log.info({
    packId: input.packId, scopeType: input.scope.type,
    itemCount: ordered.length, manifestHash, itemsByType,
  }, 'pack_assembled');

  // Re-read redactions in case any were already set during prior assemblies
  // — they were preserved in the INSERT above but we now expose them on the
  // returned AssembledPack so exporters can honor them.
  const redactions: Record<string, { status: string; reason: string | null }> = {};
  for (const [k, v] of redactionMap.entries()) redactions[k] = v;

  return { pack, manifest, collectedItems: ordered, redactions };
}

/**
 * Flip the pack from 'draft' to 'finalised'. After finalise the contents are
 * immutable; further /collect calls must create a new pack via supersedes.
 *
 * Phase 2: signs the manifest hash with the instance Ed25519 keypair and
 * persists signature + signer_public_key so a verifier with the bundled
 * pack can verify without platform access.
 */
export async function finalisePack(db: DatabaseAdapter, packId: string): Promise<void> {
  const pack = await readPackRow(db, packId);
  if (!pack) throw new Error(`Pack ${packId} not found`);
  if (pack.status !== 'draft') throw new Error(`Pack ${packId} is ${pack.status}, cannot finalise`);
  if (!pack.hash_manifest) throw new Error(`Pack ${packId} has no manifest hash; run /collect first`);

  const { signature, publicKeyHex } = await signManifestHash(db, pack.hash_manifest);
  await db.run(
    `UPDATE evidence_packs
       SET status = 'finalised', finalised_at = NOW(),
           signature = ?, signer_public_key = ?
     WHERE id = ?`,
    signature, publicKeyHex, packId,
  );
  log.info({ packId, signature: signature.slice(0, 24) + '…' }, 'pack_finalised_signed');
}

export async function readPackRow(db: DatabaseAdapter, packId: string): Promise<PackRow | null> {
  const row = await db.get<{
    id: string; title: string; purpose: string | null;
    scope_type: string; scope_ref: Record<string, unknown> | string | null; scope_label: string | null;
    created_by: string; created_at: string; finalised_at: string | null;
    status: string; hash_manifest: string | null;
    signature: string | null; signer_public_key: string | null;
    item_count: number; size_bytes: number;
    retention_until: string | null; legal_hold: boolean;
    supersedes: string | null;
    compliance_frameworks: string[] | string;
    compliance_gaps: Record<string, { rationale: string; acceptedAt: string; acceptedBy: string }> | string;
    notes: string | null;
  }>(
    `SELECT id, title, purpose, scope_type, scope_ref, scope_label,
            created_by, created_at, finalised_at, status, hash_manifest,
            signature, signer_public_key, item_count, size_bytes,
            retention_until, legal_hold, supersedes, compliance_frameworks,
            compliance_gaps, notes
     FROM evidence_packs WHERE id = ?`, packId,
  );
  if (!row) return null;
  return {
    ...row,
    scope_ref: row.scope_ref === null
      ? null
      : (typeof row.scope_ref === 'string' ? JSON.parse(row.scope_ref) : row.scope_ref),
    compliance_frameworks: typeof row.compliance_frameworks === 'string'
      ? JSON.parse(row.compliance_frameworks)
      : row.compliance_frameworks,
    compliance_gaps: typeof row.compliance_gaps === 'string'
      ? JSON.parse(row.compliance_gaps)
      : (row.compliance_gaps ?? {}),
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function dedupe(items: CollectedItem[]): CollectedItem[] {
  const seen = new Set<string>();
  const out: CollectedItem[] = [];
  for (const it of items) {
    const k = `${it.itemTable}|${it.itemId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

function orderItems(items: CollectedItem[]): CollectedItem[] {
  // type order: project → session → message → audit_log → output_version → other
  const TYPE_ORDER = new Map([
    ['project', 0], ['session', 1], ['message', 2],
    ['audit_log', 3], ['output_version', 4],
  ]);
  return [...items].sort((a, b) => {
    const at = TYPE_ORDER.get(a.itemType) ?? 99;
    const bt = TYPE_ORDER.get(b.itemType) ?? 99;
    if (at !== bt) return at - bt;
    return a.itemId.localeCompare(b.itemId);
  });
}

function scopeToJson(scope: ScopeDefinition): Record<string, unknown> {
  // Strip the discriminator since it's already in scope.type.
  const { type: _type, ...rest } = scope as unknown as Record<string, unknown> & { type: string };
  void _type;
  return rest;
}

function safeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
}

// Re-export for callers that don't want to import from collector.
export { canonicalise } from './collector.js';
