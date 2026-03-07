/**
 * knowledge-pack-service.ts
 *
 * Lifecycle management for Regulatory Knowledge Packs (.anton bundles of type
 * 'regulatory-knowledge-pack'). Handles import, validation, activation,
 * deactivation, and non-destructive uninstall.
 *
 * Pack bundle structure (inside the .anton ZIP):
 *   manifest.json      – metadata (name, version, jurisdiction, regulation_ids, …)
 *   entities.json      – array of EntityDef to upsert into entity_nodes
 *   relationships.json – array of RelationshipDef to upsert into entity_relationships
 *   aliases.json       – array of AliasDef to upsert into entity_aliases
 */

import AdmZip from 'adm-zip';
import crypto from 'crypto';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Bundled packs live two levels up from server/services/ → project root/data/knowledge-packs/
const BUNDLED_PACKS_DIR = path.resolve(__dirname, '../../data/knowledge-packs');

// ── Types ────────────────────────────────────────────────────────────────────

export interface PackManifest {
  name: string;
  display_name: string;
  version: string;
  description?: string;
  author?: string;
  publisher?: string;
  jurisdiction?: string;
  regulatory_area?: string;
  regulation_ids?: string[];
  tier?: 1 | 2 | 3;
  bundle_type: 'regulatory-knowledge-pack';
  // Governance fields (KP-03)
  effective_date?: string;   // ISO date: when the regulatory text takes effect, e.g. '2027-07-10'
  source_url?: string;       // canonical URL of the source regulation, e.g. EUR-Lex permalink
  validated_by?: string;     // name/email of person who verified the pack content
  content_confirmed?: boolean; // submitter confirmed accuracy at time of build
}

interface EntityDef {
  ref_id: string;            // stable internal ID used in relationships.json
  entity_type: string;       // e.g. 'regulation', 'obligation', 'concept', 'authority'
  entity_id: string;         // unique within type (e.g. 'AMLR-2024-Art-12')
  canonical_name: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

interface RelationshipDef {
  from_ref: string;          // ref_id from entities.json
  to_ref: string;
  relationship_type: string; // e.g. 'references', 'supersedes', 'implements', 'requires'
  strength?: number;         // 0.0–1.0, default 1.0
  description?: string;      // human-readable explanation of the relationship
  metadata?: Record<string, unknown>; // arbitrary key/value annotations
}

interface AliasDef {
  ref_id: string;
  aliases: string[];         // alternative names / abbreviations
}

export interface KnowledgePack {
  id: string;
  name: string;
  display_name: string;
  version: string;
  description: string | null;
  jurisdiction: string | null;
  regulatory_area: string | null;
  regulation_ids: string[];
  author: string | null;
  publisher: string | null;
  tier: number;
  entity_count: number;
  relationship_count: number;
  alias_count: number;
  status: 'installed' | 'active' | 'deactivated' | 'error';
  manifest: PackManifest;
  file_hash: string | null;
  imported_at: string;
  activated_at: string | null;
  deactivated_at: string | null;
  user_id: string;
  // Governance fields (KP-03)
  effective_date: string | null;
  source_url: string | null;
  validated_by: string | null;
  content_confirmed: boolean;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function rowToPack(row: Record<string, unknown>): KnowledgePack {
  return {
    id: row.id as string,
    name: row.name as string,
    display_name: row.display_name as string,
    version: row.version as string,
    description: row.description as string | null,
    jurisdiction: row.jurisdiction as string | null,
    regulatory_area: row.regulatory_area as string | null,
    regulation_ids: parseJson<string[]>(row.regulation_ids as string, []),
    author: row.author as string | null,
    publisher: row.publisher as string | null,
    tier: (row.tier as number) ?? 2,
    entity_count: (row.entity_count as number) ?? 0,
    relationship_count: (row.relationship_count as number) ?? 0,
    alias_count: (row.alias_count as number) ?? 0,
    status: row.status as KnowledgePack['status'],
    manifest: parseJson<PackManifest>(row.manifest as string, {} as PackManifest),
    file_hash: row.file_hash as string | null,
    imported_at: row.imported_at as string,
    activated_at: row.activated_at as string | null,
    deactivated_at: row.deactivated_at as string | null,
    user_id: row.user_id as string,
    effective_date: (row.effective_date as string | null) ?? null,
    source_url: (row.source_url as string | null) ?? null,
    validated_by: (row.validated_by as string | null) ?? null,
    content_confirmed: !!(row.content_confirmed as number | null),
  };
}

// ── Service factory ──────────────────────────────────────────────────────────

export function createKnowledgePackService(db: Database.Database) {

  // ── List / Get ─────────────────────────────────────────────────────────────

  function listPacks(userId: string): KnowledgePack[] {
    // Excludes the manifest JSON blob from the list query — fetched only via getPack(id)
    const rows = db.prepare(
      `SELECT id, name, display_name, version, description, jurisdiction, regulatory_area,
              regulation_ids, author, publisher, tier, entity_count, relationship_count,
              alias_count, status, '{}' as manifest, file_hash, imported_at, activated_at,
              deactivated_at, user_id
       FROM knowledge_packs WHERE user_id = ? OR user_id = 'system' ORDER BY imported_at DESC`
    ).all(userId) as Record<string, unknown>[];
    return rows.map(rowToPack);
  }

  function getPack(id: string): KnowledgePack | null {
    const row = db.prepare('SELECT * FROM knowledge_packs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? rowToPack(row) : null;
  }

  // ── Import from .anton bundle buffer ──────────────────────────────────────

  const MAX_BUNDLE_BYTES    = 20 * 1024 * 1024; // 20 MB uncompressed total
  const MAX_ENTITIES        = 5_000;
  const MAX_RELATIONSHIPS   = 20_000;
  const MAX_ALIASES         = 10_000;
  const MAX_FIELD_LENGTH    = 2_000;            // canonical_name, description, entity_id

  // Valid entity types — must match the 11 types defined in entity_nodes schema
  const VALID_ENTITY_TYPES = new Set([
    'client', 'regulation', 'control', 'risk', 'person',
    'system', 'product', 'geography', 'organization', 'process',
    'document', 'obligation', 'authority', 'concept', 'threshold', 'institution',
  ]);

  // Valid relationship types (KG-05) — structured semantic vocabulary
  const VALID_RELATIONSHIP_TYPES = new Set([
    'references', 'implements', 'clarifies', 'requires', 'supersedes',
    'related_to', 'part_of', 'derived_from', 'applies_to', 'amends',
    'cross_references', 'enforces', 'defines', 'exempts',
  ]);

  function validateField(value: unknown, fieldName: string): string {
    if (typeof value !== 'string') throw new Error(`Entity field '${fieldName}' must be a string`);
    if (value.length > MAX_FIELD_LENGTH) throw new Error(`Entity field '${fieldName}' exceeds max length (${MAX_FIELD_LENGTH})`);
    return value;
  }

  function importBundle(buffer: Buffer, userId: string): KnowledgePack {
    // 0. Bundle size guard (ZIP bomb: check buffer size before extraction)
    if (buffer.length > MAX_BUNDLE_BYTES) {
      throw new Error(`Bundle exceeds max allowed size (${MAX_BUNDLE_BYTES / 1024 / 1024} MB)`);
    }

    // 1. Hash the bundle for dedup detection
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
    const existing = db.prepare('SELECT id FROM knowledge_packs WHERE file_hash = ?').get(fileHash) as { id: string } | undefined;
    if (existing) {
      throw new Error(`Pack with this file hash is already imported (id: ${existing.id}). Delete it first to re-import.`);
    }

    // 2. Open ZIP and extract required files
    const zip = new AdmZip(buffer);
    const manifestEntry = zip.getEntry('manifest.json');
    if (!manifestEntry) throw new Error('Missing manifest.json in .anton bundle');

    const manifest = JSON.parse(manifestEntry.getData().toString('utf8')) as PackManifest;

    if (manifest.bundle_type !== 'regulatory-knowledge-pack') {
      throw new Error(`Expected bundle_type 'regulatory-knowledge-pack', got '${manifest.bundle_type}'`);
    }
    if (!manifest.name || !manifest.version) {
      throw new Error('manifest.json must include name and version');
    }

    // 3. Parse and validate content files
    const entitiesEntry = zip.getEntry('entities.json');
    const relationshipsEntry = zip.getEntry('relationships.json');
    const aliasesEntry = zip.getEntry('aliases.json');

    const rawEntities: unknown = entitiesEntry
      ? JSON.parse(entitiesEntry.getData().toString('utf8'))
      : [];
    const rawRelationships: unknown = relationshipsEntry
      ? JSON.parse(relationshipsEntry.getData().toString('utf8'))
      : [];
    const rawAliases: unknown = aliasesEntry
      ? JSON.parse(aliasesEntry.getData().toString('utf8'))
      : [];

    if (!Array.isArray(rawEntities)) throw new Error('entities.json must be a JSON array');
    if (!Array.isArray(rawRelationships)) throw new Error('relationships.json must be a JSON array');
    if (!Array.isArray(rawAliases)) throw new Error('aliases.json must be a JSON array');

    if (rawEntities.length > MAX_ENTITIES)
      throw new Error(`Pack contains ${rawEntities.length} entities, max allowed is ${MAX_ENTITIES}`);
    if (rawRelationships.length > MAX_RELATIONSHIPS)
      throw new Error(`Pack contains ${rawRelationships.length} relationships, max allowed is ${MAX_RELATIONSHIPS}`);
    if (rawAliases.length > MAX_ALIASES)
      throw new Error(`Pack contains ${rawAliases.length} alias entries, max allowed is ${MAX_ALIASES}`);

    // Validate entity shape, field lengths, entity_type whitelist, and entity_id uniqueness (KP-01, KG-07)
    let truncatedDescriptionCount = 0;
    const seenEntityKeys = new Set<string>(); // key = entity_type:entity_id — uniqueness check (KP-01)

    const entities: EntityDef[] = rawEntities.map((e: unknown, i: number) => {
      if (typeof e !== 'object' || e === null) throw new Error(`entities[${i}]: must be an object`);
      const obj = e as Record<string, unknown>;
      const entity_type = validateField(obj.entity_type, `entities[${i}].entity_type`);
      if (!VALID_ENTITY_TYPES.has(entity_type)) {
        throw new Error(`entities[${i}].entity_type '${entity_type}' is not a recognised type. Valid types: ${[...VALID_ENTITY_TYPES].join(', ')}`);
      }
      const entity_id = validateField(obj.entity_id, `entities[${i}].entity_id`);
      const uniqueKey = `${entity_type}:${entity_id}`;
      if (seenEntityKeys.has(uniqueKey)) {
        throw new Error(`Duplicate entity (type='${entity_type}', id='${entity_id}') at entities[${i}] — entity_id must be unique within each type`);
      }
      seenEntityKeys.add(uniqueKey);

      let description: string | undefined;
      if (typeof obj.description === 'string') {
        if (obj.description.length > 4_000) {
          truncatedDescriptionCount++;
          console.warn(`[knowledge-pack] entities[${i}] (${entity_id}): description truncated from ${obj.description.length} to 4000 chars`);
        }
        description = obj.description.slice(0, 4_000);
      }

      return {
        ref_id:         validateField(obj.ref_id, `entities[${i}].ref_id`),
        entity_type,
        entity_id,
        canonical_name: validateField(obj.canonical_name, `entities[${i}].canonical_name`),
        description,
        metadata:       typeof obj.metadata === 'object' && obj.metadata !== null ? obj.metadata as Record<string, unknown> : undefined,
      };
    });

    if (truncatedDescriptionCount > 0) {
      console.warn(`[knowledge-pack] ${truncatedDescriptionCount} entity description(s) were truncated to 4000 chars. Consider shortening them in the source pack.`);
    }

    const relationships: RelationshipDef[] = rawRelationships.map((r: unknown, i: number) => {
      if (typeof r !== 'object' || r === null) throw new Error(`relationships[${i}]: must be an object`);
      const obj = r as Record<string, unknown>;
      const relationship_type = validateField(obj.relationship_type, `relationships[${i}].relationship_type`);
      // KG-05: Validate relationship type against the allowed vocabulary
      if (!VALID_RELATIONSHIP_TYPES.has(relationship_type)) {
        console.warn(`[knowledge-pack] relationships[${i}]: unknown relationship_type '${relationship_type}'. Valid types: ${[...VALID_RELATIONSHIP_TYPES].join(', ')}. Proceeding with import.`);
      }
      return {
        from_ref:          validateField(obj.from_ref, `relationships[${i}].from_ref`),
        to_ref:            validateField(obj.to_ref, `relationships[${i}].to_ref`),
        relationship_type,
        strength:          typeof obj.strength === 'number' ? Math.min(1, Math.max(0, obj.strength)) : 1.0,
        description:       typeof obj.description === 'string' ? obj.description.slice(0, 2_000) : undefined,
        metadata:          typeof obj.metadata === 'object' && obj.metadata !== null ? obj.metadata as Record<string, unknown> : undefined,
      };
    });

    const aliases: AliasDef[] = rawAliases.map((a: unknown, i: number) => {
      if (typeof a !== 'object' || a === null) throw new Error(`aliases[${i}]: must be an object`);
      const obj = a as Record<string, unknown>;
      if (!Array.isArray(obj.aliases)) throw new Error(`aliases[${i}].aliases must be an array`);
      return {
        ref_id: validateField(obj.ref_id, `aliases[${i}].ref_id`),
        aliases: (obj.aliases as unknown[]).filter((v) => typeof v === 'string').map((v) => (v as string).slice(0, MAX_FIELD_LENGTH)),
      };
    });

    // 4. Build ref_id → entity_id map; detect duplicate ref_ids (authoring error)
    const refMap = new Map<string, { entity_type: string; entity_id: string }>();
    for (const e of entities) {
      if (refMap.has(e.ref_id)) {
        throw new Error(`Duplicate ref_id '${e.ref_id}' in entities.json — each ref_id must be unique`);
      }
      refMap.set(e.ref_id, { entity_type: e.entity_type, entity_id: e.entity_id });
    }

    const packId = randomUUID();

    // 5. Bulk insert in a transaction
    const importTx = db.transaction(() => {
      // Insert pack record first (no entity counts yet)
      db.prepare(`
        INSERT INTO knowledge_packs
          (id, name, display_name, version, description, jurisdiction, regulatory_area,
           regulation_ids, author, publisher, tier, entity_count, relationship_count,
           alias_count, status, manifest, file_hash, user_id,
           effective_date, source_url, validated_by, content_confirmed)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,0,0,0,'installed',?,?,?,?,?,?,?)
      `).run(
        packId,
        manifest.name,
        manifest.display_name ?? manifest.name,
        manifest.version,
        manifest.description ?? null,
        manifest.jurisdiction ?? null,
        manifest.regulatory_area ?? null,
        JSON.stringify(manifest.regulation_ids ?? []),
        manifest.author ?? null,
        manifest.publisher ?? null,
        manifest.tier ?? 2,
        JSON.stringify(manifest),
        fileHash,
        userId,
        manifest.effective_date ?? null,
        manifest.source_url ?? null,
        manifest.validated_by ?? null,
        manifest.content_confirmed ? 1 : 0,
      );

      // Insert entities (upsert — pack enriches existing nodes if same type+id)
      const upsertNode = db.prepare(`
        INSERT INTO entity_nodes
          (id, entity_type, entity_id, canonical_name, metadata, source, pack_id)
        VALUES (lower(hex(randomblob(8))), ?, ?, ?, ?, 'pack', ?)
        ON CONFLICT(entity_type, entity_id) DO UPDATE SET
          canonical_name = excluded.canonical_name,
          metadata = COALESCE(excluded.metadata, entity_nodes.metadata),
          source = CASE WHEN entity_nodes.source = 'workflow' THEN 'pack' ELSE entity_nodes.source END,
          pack_id = CASE WHEN entity_nodes.pack_id IS NULL THEN excluded.pack_id ELSE entity_nodes.pack_id END
      `);

      let entityCount = 0;
      for (const e of entities) {
        upsertNode.run(
          e.entity_type,
          e.entity_id,
          e.canonical_name,
          e.metadata ? JSON.stringify(e.metadata) : null,
          packId,
        );
        entityCount++;
      }

      // Insert relationships — deduplicate within this pack to avoid multiple rows
      // for the same (from, to, type) tuple (entity_relationships has no UNIQUE constraint).
      // Where duplicates exist, keep the highest strength value.
      const insertRel = db.prepare(`
        INSERT OR IGNORE INTO entity_relationships
          (id, source_type, source_id, target_type, target_id, relationship_type, strength, description, metadata, source, pack_id)
        VALUES (lower(hex(randomblob(8))), ?, ?, ?, ?, ?, ?, ?, ?, 'pack', ?)
      `);

      type RelData = { strength: number; description?: string; metadata?: Record<string, unknown> };
      const seenRels = new Map<string, RelData>(); // key → best entry by strength
      const brokenRefs: string[] = []; // KG-04: track broken refs instead of silently dropping
      for (const r of relationships) {
        const from = refMap.get(r.from_ref);
        const to = refMap.get(r.to_ref);
        if (!from || !to) {
          brokenRefs.push(`${r.from_ref} → ${r.to_ref} (${r.relationship_type})`);
          continue;
        }
        const key = `${from.entity_type}|${from.entity_id}|${to.entity_type}|${to.entity_id}|${r.relationship_type}`;
        const strength = r.strength ?? 1.0;
        const best = seenRels.get(key);
        if (!best || strength > best.strength) {
          seenRels.set(key, { strength, description: r.description, metadata: r.metadata });
        }
      }

      // KG-04: Log broken references (relationships referencing unknown ref_ids)
      if (brokenRefs.length > 0) {
        console.warn(`[knowledge-pack] ${brokenRefs.length} relationship(s) reference unknown ref_ids and were skipped:\n  ${brokenRefs.slice(0, 10).join('\n  ')}${brokenRefs.length > 10 ? `\n  ... and ${brokenRefs.length - 10} more` : ''}`);
      }

      let relCount = 0;
      for (const [key, data] of seenRels) {
        const [sourceType, sourceId, targetType, targetId, relType] = key.split('|');
        insertRel.run(
          sourceType, sourceId, targetType, targetId, relType,
          data.strength,
          data.description ?? null,
          data.metadata ? JSON.stringify(data.metadata) : null,
          packId,
        );
        relCount++;
      }

      // Insert aliases
      const upsertAlias = db.prepare(`
        INSERT OR IGNORE INTO entity_aliases
          (entity_type, primary_id, alias_id, alias_source, pack_id)
        VALUES (?, ?, ?, 'pack', ?)
      `);

      let aliasCount = 0;
      for (const a of aliases) {
        const ref = refMap.get(a.ref_id);
        if (!ref) continue;
        for (const alias of a.aliases) {
          upsertAlias.run(ref.entity_type, ref.entity_id, alias, packId);
          aliasCount++;
        }
      }

      // Update counts
      db.prepare(
        `UPDATE knowledge_packs SET entity_count=?, relationship_count=?, alias_count=? WHERE id=?`
      ).run(entityCount, relCount, aliasCount, packId);
    });

    importTx();

    return getPack(packId)!;
  }

  // ── Activate / Deactivate ──────────────────────────────────────────────────
  // Status tracking only — actual entity data is always present in the DB.
  // Active packs are preferred when the prompt-builder injects entity context.

  function activatePack(id: string): void {
    const pack = getPack(id);
    if (!pack) throw new Error('Pack not found');
    if (pack.status === 'active') return;
    db.prepare(
      `UPDATE knowledge_packs SET status='active', activated_at=datetime('now'), deactivated_at=NULL WHERE id=?`
    ).run(id);
  }

  function deactivatePack(id: string): void {
    const pack = getPack(id);
    if (!pack) throw new Error('Pack not found');
    db.prepare(
      `UPDATE knowledge_packs SET status='deactivated', deactivated_at=datetime('now') WHERE id=?`
    ).run(id);
  }

  // ── Delete (non-destructive for workflow-sourced nodes) ────────────────────
  // Removes pack record and pack-only entities/relationships/aliases.
  // Nodes that were shared (originally workflow-sourced, enriched by pack) are
  // reverted to 'workflow' source rather than deleted.
  // Pack must be deactivated first to prevent removing context mid-session.

  function deletePack(id: string): boolean {
    const pack = getPack(id);
    if (!pack) return false;
    if (pack.status === 'active') {
      throw new Error(`Pack '${pack.display_name}' is currently active. Deactivate it before deleting.`);
    }

    const deleteTx = db.transaction(() => {
      // Revert shared nodes back to workflow source
      db.prepare(
        `UPDATE entity_nodes SET source='workflow', pack_id=NULL WHERE pack_id=?`
      ).run(id);

      // Revert pack-sourced relationships back to workflow source (non-destructive).
      // Deleting would leave dangling edges where both endpoints still exist.
      db.prepare(
        `UPDATE entity_relationships SET source='workflow', pack_id=NULL WHERE pack_id=?`
      ).run(id);

      // Remove pack aliases
      db.prepare(`DELETE FROM entity_aliases WHERE pack_id=?`).run(id);

      // Remove pack record
      db.prepare(`DELETE FROM knowledge_packs WHERE id=?`).run(id);
    });

    deleteTx();
    return true;
  }

  // ── Summary for active packs (for prompt injection) ───────────────────────
  // Returns a brief text summary of installed/active packs for context injection.

  function getActivePacksSummary(): string {
    const rows = db.prepare(
      `SELECT display_name, regulatory_area, regulation_ids, entity_count
       FROM knowledge_packs WHERE status='active' ORDER BY tier ASC, display_name ASC`
    ).all() as Array<{ display_name: string; regulatory_area: string | null; regulation_ids: string; entity_count: number }>;

    if (rows.length === 0) return '';
    const lines = rows.map((r) => {
      const regs = parseJson<string[]>(r.regulation_ids, []).join(', ');
      return `- ${r.display_name} (${r.regulatory_area ?? 'General'}, ${r.entity_count} entities${regs ? `, covers: ${regs}` : ''})`;
    });
    return `## REGULATORY KNOWLEDGE PACKS (ACTIVE)\nThe following structured regulatory knowledge packs are available:\n${lines.join('\n')}`;
  }

  // ── Entity / Relationship preview helpers ─────────────────────────────────

  function getPackEntities(packId: string, limit = 100, offset = 0): Record<string, unknown>[] {
    return db.prepare(
      `SELECT entity_type, entity_id, canonical_name, metadata
       FROM entity_nodes WHERE pack_id=? ORDER BY entity_type, canonical_name LIMIT ? OFFSET ?`
    ).all(packId, limit, offset) as Record<string, unknown>[];
  }

  function getPackRelationships(packId: string, limit = 100, offset = 0): Record<string, unknown>[] {
    return db.prepare(
      `SELECT source_type, source_id, target_type, target_id, relationship_type, strength, description, metadata
       FROM entity_relationships WHERE pack_id=?
       ORDER BY relationship_type, source_id LIMIT ? OFFSET ?`
    ).all(packId, limit, offset) as Record<string, unknown>[];
  }

  // ── Bundled packs (ship with ANTON in data/knowledge-packs/) ──────────────

  interface BundledPackInfo {
    slug: string;
    display_name: string;
    version: string;
    description: string | null;
    regulatory_area: string | null;
    regulation_ids: string[];
    entity_count: number;
    relationship_count: number;
    alias_count: number;
    tier: number;
    installed_pack_id: string | null; // null = not yet imported into DB
    status: 'available' | 'installed' | 'active' | 'deactivated';
  }

  function listBundledPacks(): BundledPackInfo[] {
    if (!fs.existsSync(BUNDLED_PACKS_DIR)) return [];
    const results: BundledPackInfo[] = [];

    const dirs = fs.readdirSync(BUNDLED_PACKS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory());

    for (const dir of dirs) {
      const manifestPath = path.join(BUNDLED_PACKS_DIR, dir.name, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as PackManifest & {
          entity_count?: number; relationship_count?: number; alias_count?: number;
        };
        if (manifest.bundle_type !== 'regulatory-knowledge-pack') continue;

        // Check if this slug is already imported (match by name + version)
        const existing = db.prepare(
          `SELECT id, status FROM knowledge_packs WHERE name=? AND version=? LIMIT 1`
        ).get(manifest.name, manifest.version) as { id: string; status: string } | undefined;

        results.push({
          slug: dir.name,
          display_name: manifest.display_name ?? manifest.name,
          version: manifest.version,
          description: manifest.description ?? null,
          regulatory_area: manifest.regulatory_area ?? null,
          regulation_ids: manifest.regulation_ids ?? [],
          entity_count: manifest.entity_count ?? 0,
          relationship_count: manifest.relationship_count ?? 0,
          alias_count: manifest.alias_count ?? 0,
          tier: manifest.tier ?? 2,
          installed_pack_id: existing?.id ?? null,
          status: existing
            ? (existing.status as BundledPackInfo['status'])
            : 'available',
        });
      } catch {
        // Skip malformed manifests
      }
    }

    return results.sort((a, b) => a.tier - b.tier || a.display_name.localeCompare(b.display_name));
  }

  function installBundledPack(slug: string, userId: string): KnowledgePack {
    const packDir = path.join(BUNDLED_PACKS_DIR, slug);
    if (!fs.existsSync(packDir)) throw new Error(`Bundled pack '${slug}' not found`);

    // Prefer the pre-built .anton file; fall back to building from JSON sources
    const antonFile = path.join(packDir, `${slug}.anton`);
    if (!fs.existsSync(antonFile)) {
      throw new Error(`Bundled pack '${slug}' is missing its .anton file. Run: node data/knowledge-packs/build-pack.mjs ${slug}`);
    }
    const buffer = fs.readFileSync(antonFile);
    return importBundle(buffer, userId);
  }

  return {
    listPacks,
    getPack,
    importBundle,
    activatePack,
    deactivatePack,
    deletePack,
    getActivePacksSummary,
    getPackEntities,
    getPackRelationships,
    listBundledPacks,
    installBundledPack,
  };
}
