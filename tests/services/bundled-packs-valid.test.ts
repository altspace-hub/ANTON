/**
 * bundled-packs-valid.test.ts — every knowledge pack shipped in
 * data/knowledge-packs passes the importer's entity-type check.
 *
 * Before 2026-10-02 the importer accepted 16 entity types while the packs
 * used 25: "Install" refused 27 of the 43 bundled packs (duty, directive,
 * article, ...) on every instance, and the co-worker showcase had none of them.
 * The check reads the built .anton bundles, since that is what an install
 * imports; it also checks every alias carries the ref_id the importer needs.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { KNOWLEDGE_PACK_ENTITY_TYPES } from '../../server/services/knowledge-pack-service.js';

const PACKS = path.resolve(__dirname, '../../data/knowledge-packs');

interface Entity { entity_type?: unknown }
interface Alias { ref_id?: unknown }

function entitiesOf(raw: unknown): Entity[] {
  if (Array.isArray(raw)) return raw as Entity[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as { entities?: unknown }).entities)) return (raw as { entities: Entity[] }).entities;
  return [];
}

function aliasesOf(raw: unknown): Alias[] {
  if (Array.isArray(raw)) return raw as Alias[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as { aliases?: unknown }).aliases)) return (raw as { aliases: Alias[] }).aliases;
  return [];
}

/** Every pack folder with a built bundle, and the entities and aliases inside that bundle. */
function bundledPacks(): Array<{ slug: string; entities: Entity[]; aliases: Alias[] }> {
  return fs.readdirSync(PACKS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(PACKS, d.name, `${d.name}.anton`)))
    .map((d) => {
      const zip = new AdmZip(path.join(PACKS, d.name, `${d.name}.anton`));
      const read = (name: string): unknown => {
        const entry = zip.getEntries().find((e) => new RegExp(`(^|/)${name}\\.json$`).test(e.entryName));
        return entry ? JSON.parse(entry.getData().toString('utf8')) : null;
      };
      return { slug: d.name, entities: entitiesOf(read('entities')), aliases: aliasesOf(read('aliases')) };
    });
}

describe('the bundled knowledge packs', () => {
  const packs = bundledPacks();

  it('are found (a broken path would pass every check below)', () => {
    expect(packs.length).toBeGreaterThanOrEqual(40);
    expect(packs.every((p) => p.entities.length > 0)).toBe(true);
  });

  it('use only entity types the importer accepts', () => {
    const refused = packs.flatMap((p) => p.entities
      .map((e) => String(e.entity_type))
      .filter((t) => !KNOWLEDGE_PACK_ENTITY_TYPES.has(t))
      .map((t) => `${p.slug}: ${t}`));
    expect([...new Set(refused)]).toEqual([]);
  });

  it('key every alias by a string ref_id, as the importer requires (uk-fca-aml used canonical_ref)', () => {
    const bad = packs.filter((p) => p.aliases.some((a) => typeof a.ref_id !== 'string')).map((p) => p.slug);
    expect(bad).toEqual([]);
  });

  it('negative control: a type outside the list is refused', () => {
    expect(KNOWLEDGE_PACK_ENTITY_TYPES.has('spaceship')).toBe(false);
  });
});
