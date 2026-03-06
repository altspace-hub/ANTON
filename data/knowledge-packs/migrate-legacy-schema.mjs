#!/usr/bin/env node
/**
 * migrate-legacy-schema.mjs
 *
 * One-time migration for packs built with the old schema:
 *   entity field `type` → `entity_type`   (mapped to valid service types)
 *   entity field `label` → `canonical_name`
 *   entity field `entity_id` added (= ref_id if absent)
 *   relationship `strength` integers 1-10 → floats 0.0-1.0
 *
 * Packs to migrate: crr-crd-mica, dora-nis2, esg-csrd-sfdr, gdpr-ai-act
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const PACKS_DIR = dirname(fileURLToPath(import.meta.url));
const BUILD_SCRIPT = join(PACKS_DIR, 'build-pack.mjs');

// Map old entity type labels → valid service entity types
const TYPE_MAP = {
  'regulation':     'regulation',
  'article':        'obligation',   // articles are essentially obligations
  'concept':        'concept',
  'organisation':   'authority',
  'organization':   'authority',
  'cross_reference':'concept',      // cross-references are conceptual nodes
  'process':        'process',
  'rts':            'obligation',   // RTS/ITS are regulatory obligations
  'its':            'obligation',
  'annex':          'document',
  'standard':       'document',     // ESG standards (ESRS) are documents
  'recommendation': 'obligation',   // FATF Recommendations are obligations
  'guidance':       'document',     // FATF guidance documents
};

const PACKS = ['crr-crd-mica', 'dora-nis2', 'esg-csrd-sfdr', 'gdpr-ai-act', 'fatf-recommendations'];

for (const slug of PACKS) {
  const dir = join(PACKS_DIR, slug);
  console.log(`\nMigrating: ${slug}`);

  // ── Entities ─────────────────────────────────────────────────────
  const entities = JSON.parse(readFileSync(join(dir, 'entities.json'), 'utf8'));
  let entityChanges = 0;

  const migrated = entities.map((e, i) => {
    const out = { ...e };

    // ref_id: keep as-is
    // entity_type: map from old `type` field
    if (!out.entity_type) {
      const rawType = out.type || 'concept';
      out.entity_type = TYPE_MAP[rawType] ?? 'concept';
      delete out.type;
      entityChanges++;
    }
    // entity_id: use ref_id if missing
    if (!out.entity_id) {
      out.entity_id = out.ref_id;
      entityChanges++;
    }
    // canonical_name: map from old `label` field
    if (!out.canonical_name) {
      out.canonical_name = out.label || out.ref_id;
      delete out.label;
      entityChanges++;
    } else if (out.label) {
      delete out.label;
    }
    // Clean up any remaining old fields
    if (out.type) delete out.type;

    return out;
  });

  writeFileSync(join(dir, 'entities.json'), JSON.stringify(migrated, null, 2) + '\n');
  console.log(`  entities.json: ${entities.length} entities, ${entityChanges} field migrations`);

  // ── Relationships ─────────────────────────────────────────────────
  const relationships = JSON.parse(readFileSync(join(dir, 'relationships.json'), 'utf8'));
  let relChanges = 0;

  const migratedRels = relationships.map(r => {
    const out = { ...r };
    // Normalise strength from integer scale (1-10) to float (0.0-1.0)
    if (typeof out.strength === 'number' && out.strength > 1) {
      out.strength = Math.round((out.strength / 10) * 100) / 100;
      relChanges++;
    }
    return out;
  });

  writeFileSync(join(dir, 'relationships.json'), JSON.stringify(migratedRels, null, 2) + '\n');
  console.log(`  relationships.json: ${relationships.length} relationships, ${relChanges} strength normalised`);

  // ── Rebuild .anton bundle ─────────────────────────────────────────
  try {
    const { stdout } = await execFileAsync('node', [BUILD_SCRIPT, slug]);
    process.stdout.write(stdout);
  } catch (err) {
    console.error(`  ERROR rebuilding ${slug}:`, err.message);
  }
}

console.log('\nMigration complete.');
