// ── Beehive — Knowledge Disclosure & Redaction ─────────────────────────────
//
// Decides which knowledge atoms a participant shares into a hive, based on
// their `DisclosurePolicy`. Four levels (`DisclosureLevel`):
//
//   reasoning_only  → no atoms shared
//   atoms_tagged    → atoms with a `shareable` tag
//   atoms_domain    → atoms whose category/tags match the hive question
//   full_context    → most relevant atoms up to max_atoms_shared
//
// Redaction: when `redact_names: true`, entity names are stripped from atom
// content. `excluded_clients` filtering removes any atom whose content
// matches a client name (case-insensitive, fuzzy on hyphens/spaces).
//
// Phase 2 keeps this lightweight: SQL-side filtering, regex redaction. Phase
// 4 will add cross-instance ingestion via AAP.

import type { DatabaseAdapter } from '../../db/database.js';
import type { DisclosurePolicy, SharedAtom } from './types.js';

interface AtomRow {
  id: string;
  content: string;
  atom_type: string;
  confidence: number | string;
  category: string;
  subcategory: string | null;
  tags: string | null;          // JSON-serialized array
  entities: string | null;      // JSON-serialized array of {entity_type, entity_id, entity_name}
  created_at: string;
}

function parseJsonArray<T>(value: string | null): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function asNumber(v: number | string, fallback = 0): number {
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Extracts keywords from the hive question for `atoms_domain` filtering.
 * Stopwords stripped; words shorter than 4 chars dropped.
 */
function extractKeywords(question: string): string[] {
  const STOPWORDS = new Set([
    'about', 'after', 'before', 'being', 'between', 'both', 'could', 'doing',
    'each', 'from', 'have', 'into', 'just', 'more', 'most', 'much', 'must',
    'never', 'often', 'only', 'other', 'should', 'some', 'such', 'than',
    'that', 'their', 'them', 'these', 'they', 'this', 'those', 'were',
    'what', 'when', 'where', 'which', 'while', 'will', 'with', 'would',
    'your', 'yours', 'because',
  ]);
  return Array.from(new Set(
    question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !STOPWORDS.has(w))
  )).slice(0, 12);
}

/**
 * Returns true if the atom mentions any excluded client (case-insensitive,
 * tolerant to hyphens/spaces between words).
 */
function mentionsExcludedClient(content: string, excludedClients: string[]): boolean {
  if (!excludedClients || excludedClients.length === 0) return false;
  const haystack = content.toLowerCase();
  for (const client of excludedClients) {
    const c = client.trim().toLowerCase();
    if (!c) continue;
    // Direct substring match — fast path
    if (haystack.includes(c)) return true;
    // Fuzzy hyphen/space variation: "Bank X" matches "BankX", "Bank-X".
    // Escape regex metachars BEFORE substituting whitespace to defend against
    // ReDoS from malicious / accidentally-regex-like client names.
    const escaped = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = escaped.replace(/[\s-]+/g, '[-\\s]?');
    if (new RegExp(`\\b${pattern}\\b`, 'i').test(content)) return true;
  }
  return false;
}

/**
 * Strips entity names from content. Each entity becomes a placeholder of the
 * same entity_type so context is preserved without leaking names.
 *   "Bank X failed CDD on John Smith" → "[ORGANISATION] failed CDD on [PERSON]"
 */
function redactEntities(content: string, entities: Array<{ entity_type?: string; entity_name?: string }>): string {
  let out = content;
  for (const e of entities) {
    if (!e?.entity_name) continue;
    const placeholder = `[${(e.entity_type || 'ENTITY').toUpperCase()}]`;
    // Word-boundary, case-insensitive, escape regex metachars
    const escaped = e.entity_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), placeholder);
  }
  return out;
}

interface SelectAtomsParams {
  hiveQuestion: string;
  policy: DisclosurePolicy;
  /** Optional: restrict to atoms tagged with one of these source areas (e.g. domain match) */
  scopeAreas?: string[];
}

export function createBeehiveKnowledge(db: DatabaseAdapter) {

  /**
   * Returns the set of atoms that this ANTON would disclose to a hive,
   * after applying the disclosure level + exclusion + redaction rules.
   *
   * In Phase 2 local mode this is read directly from `knowledge_atoms`. In
   * Phase 4 the same shape will be sent over AAP and persisted into the
   * recipient's `beehive_shared_atoms` table.
   */
  async function selectAtomsForDisclosure({ hiveQuestion, policy, scopeAreas }: SelectAtomsParams): Promise<SharedAtom[]> {
    if (policy.level === 'reasoning_only') return [];

    const limit = Math.max(0, Math.min(policy.max_atoms_shared ?? 50, 500));
    if (limit === 0) return [];

    let rows: AtomRow[];

    if (policy.level === 'atoms_tagged') {
      // Filter to atoms whose tags JSON array contains "shareable" (or "beehive")
      rows = await db.all<AtomRow>(
        `SELECT id, content, atom_type, confidence, category, subcategory, tags, entities, created_at
         FROM knowledge_atoms
         WHERE is_active = 1
           AND tags IS NOT NULL
           AND (tags LIKE '%"shareable"%' OR tags LIKE '%"beehive"%')
         ORDER BY confidence DESC, created_at DESC
         LIMIT ?`,
        Math.min(limit * 4, 500),
      );
    } else if (policy.level === 'atoms_domain') {
      const keywords = extractKeywords(hiveQuestion);
      if (keywords.length === 0) {
        rows = [];
      } else {
        // Match atoms whose content/category/subcategory mentions any keyword.
        // Using LIKE with multiple ORs keeps it dialect-portable; FTS would be
        // faster but adds complexity that's wasted at v1 atom volumes.
        const conditions: string[] = [];
        const args: unknown[] = [];
        for (const kw of keywords) {
          conditions.push('(LOWER(content) LIKE ? OR LOWER(category) LIKE ? OR LOWER(COALESCE(subcategory, \'\')) LIKE ? OR LOWER(COALESCE(tags, \'\')) LIKE ?)');
          const pat = `%${kw}%`;
          args.push(pat, pat, pat, pat);
        }
        if (scopeAreas && scopeAreas.length > 0) {
          const placeholders = scopeAreas.map(() => '?').join(', ');
          conditions.push(`source_area_id IN (${placeholders})`);
          args.push(...scopeAreas);
        }
        args.push(Math.min(limit * 4, 500));
        rows = await db.all<AtomRow>(
          `SELECT id, content, atom_type, confidence, category, subcategory, tags, entities, created_at
           FROM knowledge_atoms
           WHERE is_active = 1 AND (${conditions.join(' AND ')})
           ORDER BY confidence DESC, created_at DESC
           LIMIT ?`,
          ...args,
        );
      }
    } else {
      // full_context — most recent + highest confidence, scoped if requested
      const conditions: string[] = ['is_active = 1'];
      const args: unknown[] = [];
      if (scopeAreas && scopeAreas.length > 0) {
        const placeholders = scopeAreas.map(() => '?').join(', ');
        conditions.push(`source_area_id IN (${placeholders})`);
        args.push(...scopeAreas);
      }
      args.push(Math.min(limit * 4, 500));
      rows = await db.all<AtomRow>(
        `SELECT id, content, atom_type, confidence, category, subcategory, tags, entities, created_at
         FROM knowledge_atoms
         WHERE ${conditions.join(' AND ')}
         ORDER BY confidence DESC, created_at DESC
         LIMIT ?`,
        ...args,
      );
    }

    // Apply per-atom filtering: excluded clients, excluded tags, then redaction.
    const out: SharedAtom[] = [];
    for (const row of rows) {
      if (out.length >= limit) break;

      // excluded_clients — drop entirely
      if (mentionsExcludedClient(row.content, policy.excluded_clients ?? [])) continue;

      // excluded_tags — drop if any tag is in the excluded list
      const tags = parseJsonArray<string>(row.tags);
      if ((policy.excluded_tags ?? []).some(t => tags.includes(t))) continue;

      // Entity redaction
      const entities = parseJsonArray<{ entity_type?: string; entity_name?: string }>(row.entities);
      const finalContent = policy.redact_names
        ? redactEntities(row.content, entities)
        : row.content;

      out.push({
        atom_id: row.id,
        atom_type: row.atom_type,
        content: finalContent,
        confidence: asNumber(row.confidence, 0.5),
        domain: row.category,
        redacted: policy.redact_names && entities.length > 0,
      });
    }

    return out;
  }

  /**
   * Persists shared atoms into `beehive_shared_atoms` so the audit trail
   * captures exactly what was disclosed in this hive.
   *
   * Returns the number of rows inserted.
   */
  async function recordSharedAtoms(
    hiveId: string,
    contributionId: string | null,
    sourceAntonHash: string,
    atoms: SharedAtom[],
  ): Promise<number> {
    if (atoms.length === 0) return 0;
    let inserted = 0;
    for (const atom of atoms) {
      await db.run(
        `INSERT INTO beehive_shared_atoms
          (hive_id, contribution_id, source_anton_hash, original_atom_id,
           atom_type, content, confidence, domain, redacted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        hiveId, contributionId, sourceAntonHash, atom.atom_id ?? null,
        atom.atom_type, atom.content, atom.confidence, atom.domain ?? null, atom.redacted,
      );
      inserted++;
    }
    return inserted;
  }

  /**
   * Returns all atoms previously shared into a hive (for the dashboard).
   */
  async function listSharedAtoms(hiveId: string): Promise<SharedAtom[]> {
    interface Row { atom_type: string; content: string; confidence: number | string; domain: string | null; redacted: boolean; original_atom_id: string | null }
    const rows = await db.all<Row>(
      `SELECT atom_type, content, confidence, domain, redacted, original_atom_id
       FROM beehive_shared_atoms WHERE hive_id = ? ORDER BY shared_at DESC`,
      hiveId,
    );
    return rows.map(r => ({
      atom_id: r.original_atom_id ?? undefined,
      atom_type: r.atom_type,
      content: r.content,
      confidence: asNumber(r.confidence, 0),
      domain: r.domain ?? undefined,
      redacted: !!r.redacted,
    }));
  }

  return {
    selectAtomsForDisclosure,
    recordSharedAtoms,
    listSharedAtoms,
    extractKeywords,
    redactEntities,
    mentionsExcludedClient,
  };
}

export type BeehiveKnowledge = ReturnType<typeof createBeehiveKnowledge>;
