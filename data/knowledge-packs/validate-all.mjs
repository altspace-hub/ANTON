#!/usr/bin/env node
/**
 * validate-all.mjs — Integrity checker for all knowledge packs
 * Validates: JSON parseable, entity field completeness, ref_id integrity
 * across relationships and aliases, manifest count accuracy, .anton bundle exists.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const PACKS_DIR = dirname(fileURLToPath(import.meta.url));
const dirs = readdirSync(PACKS_DIR).filter(d => {
  try {
    return statSync(join(PACKS_DIR, d)).isDirectory()
      && existsSync(join(PACKS_DIR, d, 'manifest.json'));
  } catch { return false; }
});

let totalErrors = 0;

for (const slug of dirs.sort()) {
  const dir = join(PACKS_DIR, slug);
  const errors = [];

  let manifest, entities, relationships, aliases;
  const tryParse = (file) => {
    try { return JSON.parse(readFileSync(join(dir, file), 'utf8')); }
    catch (e) { errors.push(file + ' parse error: ' + e.message); return null; }
  };

  manifest     = tryParse('manifest.json');
  entities     = tryParse('entities.json');
  relationships= tryParse('relationships.json');
  aliases      = tryParse('aliases.json');

  if (!entities || !relationships || !aliases || !manifest) {
    console.log('FAIL ' + slug + ':\n     ' + errors.join('\n     '));
    totalErrors++;
    continue;
  }

  // Manifest count accuracy
  if (manifest.entity_count !== entities.length)
    errors.push(`entity_count: manifest says ${manifest.entity_count}, actual ${entities.length}`);
  if (manifest.relationship_count !== relationships.length)
    errors.push(`relationship_count: manifest says ${manifest.relationship_count}, actual ${relationships.length}`);
  if (manifest.alias_entry_count !== aliases.length)
    errors.push(`alias_entry_count: manifest says ${manifest.alias_entry_count}, actual ${aliases.length}`);

  // Build ref set
  const refs = new Set(entities.map(e => e.ref_id));

  // Relationship ref integrity
  for (const r of relationships) {
    if (!refs.has(r.from_ref)) errors.push(`rel from_ref not in entities: "${r.from_ref}"`);
    if (!refs.has(r.to_ref))   errors.push(`rel to_ref not in entities: "${r.to_ref}"`);
    if (typeof r.strength !== 'number' || r.strength < 0 || r.strength > 1)
      errors.push(`rel ${r.from_ref}→${r.to_ref} invalid strength: ${r.strength}`);
  }

  // Alias ref integrity
  for (const a of aliases) {
    if (!refs.has(a.ref_id)) errors.push(`alias ref_id not in entities: "${a.ref_id}"`);
    if (!Array.isArray(a.aliases) || a.aliases.length === 0)
      errors.push(`alias for ${a.ref_id} has empty aliases array`);
  }

  // Entity field completeness
  for (const e of entities) {
    if (!e.ref_id)          errors.push('entity missing ref_id');
    if (!e.entity_type)     errors.push(`entity ${e.ref_id}: missing entity_type`);
    if (!e.entity_id)       errors.push(`entity ${e.ref_id}: missing entity_id`);
    if (!e.canonical_name)  errors.push(`entity ${e.ref_id}: missing canonical_name`);
    if (!e.description || e.description.length < 20)
      errors.push(`entity ${e.ref_id}: description too short or missing`);
  }

  // Duplicate ref_ids
  const seen = new Set();
  for (const e of entities) {
    if (seen.has(e.ref_id)) errors.push(`duplicate ref_id: ${e.ref_id}`);
    seen.add(e.ref_id);
  }

  // .anton bundle exists
  if (!existsSync(join(dir, slug + '.anton')))
    errors.push('missing .anton bundle');

  const status = errors.length === 0 ? 'OK  ' : 'FAIL';
  const counts = `e=${entities.length} r=${relationships.length} a=${aliases.length}`;
  console.log(`${status} ${slug.padEnd(32)} ${counts}${errors.length ? '\n     ↳ ' + errors.join('\n     ↳ ') : ''}`);
  if (errors.length) totalErrors++;
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`${dirs.length} packs validated. ${totalErrors === 0 ? '✓ All clean.' : `${totalErrors} pack(s) have errors.`}`);
if (totalErrors > 0) process.exit(1);
