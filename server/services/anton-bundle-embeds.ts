/**
 * anton-bundle-embeds.ts — where the TEXT of a skill or persona comes from
 * when a module bundle is exported, and what "already installed here" means
 * when one is imported (Wave 6, track G).
 *
 * Skills resolve through skills-manager (built-in + disk packs) and then the
 * `skills` table (installed / imported). Personas resolve through the server
 * persona helper in prompt-builder (`resolvePersonaInstruction`) and then
 * the `personas` table. prompt-builder is imported lazily: it drags the
 * memory/search tree with it, and the bundler must stay cheap to load.
 *
 * Both resolvers take `db: null` for callers with no database (built-in
 * exports from disk) — then only the static sources are consulted.
 */

import type { DatabaseAdapter } from '../db/database.js';
import { getSkillByIdAsync } from './skills-manager.js';
import { EXPERT_ROLES } from '../../src/lib/expert-roles.js';

export interface EmbeddedSkill {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  category?: string;
  tags?: string[];
  prompt: string;
  /** Where the text came from at export time. */
  source: 'builtin' | 'disk' | 'installed';
}

export interface EmbeddedPersona {
  id: string;
  name: string;
  description: string;
  category?: string;
  prompt: string;
  source: 'builtin' | 'installed';
}

interface SkillRow {
  id: string;
  name: string;
  description: string | null;
  version: string | null;
  author: string | null;
  category: string | null;
  prompt: string;
  tags: string | null;
}

interface PersonaRow {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  prompt: string;
}

function parseTags(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : undefined;
  } catch {
    return undefined;
  }
}

/** Installed (imported) skill row, or undefined. Never throws — a missing table reads as "not installed". */
export async function getInstalledSkill(db: DatabaseAdapter | null, id: string): Promise<EmbeddedSkill | undefined> {
  if (!db) return undefined;
  try {
    const row = await db.get<SkillRow>(
      'SELECT id, name, description, version, author, category, prompt, tags FROM skills WHERE id = ? AND is_archived = 0',
      id,
    );
    if (!row || typeof row.prompt !== 'string') return undefined;
    return {
      id: row.id,
      name: row.name || row.id,
      description: row.description ?? '',
      version: row.version ?? '1.0.0',
      author: row.author ?? undefined,
      category: row.category ?? undefined,
      tags: parseTags(row.tags),
      prompt: row.prompt,
      source: 'installed',
    };
  } catch {
    return undefined;
  }
}

/** Installed (imported) persona row, or undefined. */
export async function getInstalledPersona(db: DatabaseAdapter | null, id: string): Promise<EmbeddedPersona | undefined> {
  if (!db) return undefined;
  try {
    const row = await db.get<PersonaRow>(
      'SELECT id, name, description, category, prompt FROM personas WHERE id = ? AND is_archived = 0',
      id,
    );
    if (!row || typeof row.prompt !== 'string') return undefined;
    return {
      id: row.id,
      name: row.name || row.id,
      description: row.description ?? '',
      category: row.category ?? undefined,
      prompt: row.prompt,
      source: 'installed',
    };
  } catch {
    return undefined;
  }
}

/** The static skill (built-in or disk pack) for an id, as an embeddable record. */
export async function getStaticSkill(id: string): Promise<EmbeddedSkill | undefined> {
  const skill = await getSkillByIdAsync(id);
  if (!skill) return undefined;
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    version: skill.version,
    author: skill.author,
    category: skill.category,
    tags: skill.tags,
    prompt: skill.prompt,
    source: skill.source === 'disk' || skill.source === 'installed' ? skill.source : 'builtin',
  };
}

/**
 * The server persona text for an id ('' when unknown) — the same helper the
 * prompt composer uses, so what travels is exactly what the model sees.
 */
export async function resolvePersonaText(id: string): Promise<string> {
  const { resolvePersonaInstruction } = await import('./prompt-builder.js');
  return resolvePersonaInstruction(id);
}

/** The static persona (server map, then the client registry) as an embeddable record. */
export async function getStaticPersona(id: string): Promise<EmbeddedPersona | undefined> {
  const prompt = await resolvePersonaText(id);
  if (!prompt) return undefined;
  const role = EXPERT_ROLES.find((r) => r.id === id);
  return {
    id,
    name: role?.label ?? id,
    description: role?.description ?? '',
    category: role?.category,
    prompt,
    source: 'builtin',
  };
}

/** Static first, then installed — the lookup order the composer would use. */
export async function findSkill(db: DatabaseAdapter | null, id: string): Promise<EmbeddedSkill | undefined> {
  return (await getStaticSkill(id)) ?? (await getInstalledSkill(db, id));
}

export async function findPersona(db: DatabaseAdapter | null, id: string): Promise<EmbeddedPersona | undefined> {
  return (await getStaticPersona(id)) ?? (await getInstalledPersona(db, id));
}

function uniqueIds(ids: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id === 'string' && id.trim() && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Every skill the module references, with text — and the ids nothing here can resolve. */
export async function resolveEmbeddedSkills(
  db: DatabaseAdapter | null,
  ids: readonly unknown[],
): Promise<{ embedded: EmbeddedSkill[]; missing: string[] }> {
  const embedded: EmbeddedSkill[] = [];
  const missing: string[] = [];
  for (const id of uniqueIds(ids)) {
    const skill = await findSkill(db, id);
    if (skill) embedded.push(skill);
    else missing.push(id);
  }
  return { embedded, missing };
}

/** Every persona the module references, with text — and the ids nothing here can resolve. */
export async function resolveEmbeddedPersonas(
  db: DatabaseAdapter | null,
  ids: readonly unknown[],
): Promise<{ embedded: EmbeddedPersona[]; missing: string[] }> {
  const embedded: EmbeddedPersona[] = [];
  const missing: string[] = [];
  for (const id of uniqueIds(ids)) {
    const persona = await findPersona(db, id);
    if (persona) embedded.push(persona);
    else missing.push(id);
  }
  return { embedded, missing };
}
