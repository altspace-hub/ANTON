import { createHash } from 'node:crypto';
import type { DatabaseAdapter } from '../db/database.js';
import type Anthropic from '@anthropic-ai/sdk';
import { callChat } from './provider-router.js';
import { getRoutedUtilityModel } from './utility-model.js';
import { recordParseOutcome } from './parse-telemetry.js';
import { embedAndStore } from './hybrid-search.js';

// ── Taxonomy ────────────────────────────────────────────────────────────────
//
// Wave 4 (2026-09-17): the `status.*` family is gone. On the live database it
// produced boilerplate — "Claude is ready to provide analytical assistance…" —
// that the retrieval layer later injected into prompts as supporting evidence.
// A returned atom that still names a status.* type is discarded (see
// isDroppedAtomType), as is anything that reads as the assistant talking
// about itself (isAssistantChatter).

export const ATOM_TYPE_TAXONOMY = `
  observation.finding, observation.measurement, observation.comparison,
  observation.anomaly, observation.correlation,
  decision.approval, decision.rejection, decision.escalation, decision.override, decision.deferral,
  action.creation, action.modification, action.communication, action.assignment,
  risk.identified, risk.assessed, risk.mitigated, risk.accepted, risk.materialized,
  recommendation.ai_suggestion, recommendation.human_suggestion, recommendation.best_practice
`.trim();

/** The entity kinds an atom may reference; anything else is stored as 'other'. */
export const ENTITY_TYPES = ['organisation', 'person', 'regulation', 'product', 'jurisdiction', 'system', 'other'] as const;
export type EntityType = typeof ENTITY_TYPES[number];

/** The assistant describing itself is not knowledge about the user's world. */
export const ASSISTANT_CHATTER_RE = /\b(I am|I'm|Claude|the assistant|ready to (help|provide|assist))\b/i;

export function isAssistantChatter(content: string): boolean {
  return ASSISTANT_CHATTER_RE.test(content);
}

export function isDroppedAtomType(atomType: string): boolean {
  return atomType.trim().toLowerCase().startsWith('status.');
}

/**
 * sha256 hex of the lower-cased, trimmed content — the same normalisation
 * migration 275 used to backfill knowledge_atoms.content_hash, so a new atom
 * can be refused against the whole existing table, not just its own module.
 */
export function contentHashOf(content: string): string {
  return createHash('sha256').update(content.trim().toLowerCase(), 'utf8').digest('hex');
}

/** knowledge_entity_refs.entity_id: a slug of the lower-cased name. */
export function entitySlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function normaliseEntityType(type: unknown): EntityType {
  const t = typeof type === 'string' ? type.trim().toLowerCase() : '';
  return (ENTITY_TYPES as readonly string[]).includes(t) ? (t as EntityType) : 'other';
}

// ── Types ────────────────────────────────────────────────────────────────────

interface RawEntity { type?: unknown; name?: unknown; id?: unknown }

interface RawAtom {
  content: string;
  atom_type: string;
  category: string;
  subcategory?: string;
  sentiment?: string;
  temporal_type?: string;
  entities?: RawEntity[];
  confidence?: number;
  valid_until?: string | null;
  tags?: string[];
}

interface NormalisedEntity { type: EntityType; id: string; name: string }

interface KnowledgeAtomRow {
  id: string;
  source_output_id: string | null;
  source_workflow_id: string;
  source_execution_id: string;
  source_area_id: string | null;
  source_module_id: string | null;
  content: string;
  atom_type: string;
  confidence: number;
  category: string;
  subcategory: string | null;
  sentiment: string | null;
  temporal_type: string | null;
  entities: string | null;
  tags: string | null;
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
  superseded_by: string | null;
  is_active: number;
  owner_user_id?: string | null;
  content_hash?: string | null;
}

interface EntityRefRow {
  atom_id: string;
  entity_type: string;
  entity_id: string;
  entity_name: string | null;
  relationship: string | null;
}

interface WorkflowOutputRow {
  id: string;
  execution_id: string;
  workflow_id: string;
  step_index: number;
  step_type: string;
  area_id: string | null;
  module_id: string | null;
  output_data: string;
  workflow_name: string;
  step_name: string;
  created_by: string | null;
}

/** What one extraction did. Callers that ignore it keep working. */
export interface ExtractAtomsResult {
  /** Atoms written to knowledge_atoms. */
  inserted: number;
  /** Atoms refused because an active atom with the same content_hash exists (any module). */
  duplicates: number;
  /** Atoms discarded as status.* boilerplate, assistant chatter or malformed. */
  dropped: number;
  /** knowledge_entity_refs rows written. */
  entities: number;
}

const EMPTY_RESULT: ExtractAtomsResult = { inserted: 0, duplicates: 0, dropped: 0, entities: 0 };

/**
 * The statements, exported so a test can answer them by identity and so
 * tests/db/query-column-drift.test.ts can run them against a real schema.
 */
export const ATOM_EXTRACTOR_SQL = {
  /** Params: output id. */
  output: 'SELECT * FROM workflow_outputs WHERE id = ?',
  /** Params: content_hash. An inactive duplicate does not block — retiring an atom must let a corrected one in. */
  activeDuplicate: 'SELECT id FROM knowledge_atoms WHERE content_hash = ? AND is_active = 1 LIMIT 1',
  /** Params: id, source_output_id, source_workflow_id, source_execution_id, source_area_id, source_module_id,
   *  content, atom_type, confidence, category, subcategory, sentiment, temporal_type, entities, tags,
   *  valid_until, content_hash, owner_user_id. */
  insertAtom: `
    INSERT INTO knowledge_atoms
      (id, source_output_id, source_workflow_id, source_execution_id, source_area_id, source_module_id,
       content, atom_type, confidence, category, subcategory, sentiment, temporal_type,
       entities, tags, valid_until, content_hash, owner_user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
  `,
  /** Params: atom_id, entity_type, entity_id, entity_name, relationship. */
  insertEntityRef: `
    INSERT INTO knowledge_entity_refs (atom_id, entity_type, entity_id, entity_name, relationship)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT DO NOTHING
  `,
} as const;

// ── Tolerant JSON-array parsing ─────────────────────────────────────────────
//
// Small/local models are far less reliable at the "return ONLY a JSON
// array" contract than Haiku: they wrap output in markdown fences, emit
// prose around the JSON, wrap the array in an envelope object (native
// json_object modes force an object root), or truncate mid-array. This
// parser recovers all of those shapes. Returns null only when nothing
// usable could be salvaged — callers log that via parse-telemetry.

export function parseJsonArrayTolerant<T>(text: string): T[] | null {
  const cleaned = text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  const coerce = (v: unknown): T[] | null => {
    if (Array.isArray(v)) return v as T[];
    // Envelope object (e.g. {"atoms": [...]}) — json_object modes force
    // an object root; unwrap the first array-valued property.
    if (v && typeof v === 'object') {
      for (const value of Object.values(v as Record<string, unknown>)) {
        if (Array.isArray(value)) return value as T[];
      }
    }
    return null;
  };

  try {
    const direct = coerce(JSON.parse(cleaned));
    if (direct !== null) return direct;
  } catch { /* fall through to repair */ }

  // Prose around the JSON — try the substring between the first '[' and
  // the last ']'.
  const open = cleaned.indexOf('[');
  const close = cleaned.lastIndexOf(']');
  if (open >= 0 && close > open) {
    try {
      const sliced = coerce(JSON.parse(cleaned.slice(open, close + 1)));
      if (sliced !== null) return sliced;
    } catch { /* fall through */ }
  }

  // Truncated mid-JSON — salvage complete objects by cutting at the last
  // complete array element (closing brace) and re-closing the array.
  const lastBrace = cleaned.lastIndexOf('}');
  if (open >= 0 && lastBrace > open) {
    try {
      const repaired = coerce(JSON.parse(cleaned.slice(open, lastBrace + 1) + ']'));
      if (repaired !== null) return repaired;
    } catch { /* could not salvage */ }
  }

  return null;
}

/** The entities the model returned, normalised and de-duplicated per atom. */
export function normaliseEntities(raw: unknown): NormalisedEntity[] {
  if (!Array.isArray(raw)) return [];
  const out: NormalisedEntity[] = [];
  const seen = new Set<string>();
  for (const ent of raw as RawEntity[]) {
    if (!ent || typeof ent !== 'object') continue;
    const nameSource = typeof ent.name === 'string' && ent.name.trim() ? ent.name
      : typeof ent.id === 'string' && ent.id.trim() ? ent.id
      : null;
    if (!nameSource) continue;
    const name = nameSource.trim().slice(0, 200);
    const id = entitySlug(name);
    if (!id) continue;
    const type = normaliseEntityType(ent.type);
    const key = `${type}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type, id, name });
  }
  return out;
}

// ── Factory ─────────────────────────────────────────────────────────────────

/**
 * Atom extraction + relationship detection now route through the
 * provider mapping (review 3.1) — Ollama/Mistral-only installs learn
 * too. The `_client` parameter is kept for call-site compatibility but
 * is no longer used; all LLM calls go through provider-router.callChat
 * with the configured utility model (Settings → 'utility_model',
 * default Haiku — unchanged behaviour on Anthropic installs).
 */
export async function createAtomExtractor(db: DatabaseAdapter, _client?: Anthropic) {
  // ── Extract atoms from a stored workflow output ───────────────────────────

  /**
   * Learn from one stored output. Throws when the LLM call itself fails
   * (the message is preserved — "SDK engine busy" must reach the sweep so it
   * can stop the pass) or when nothing it tried to write could be written;
   * every caller wraps the call. A parseable-but-empty answer is not a
   * failure: it returns zeros and parse-telemetry records the outcome.
   */
  async function extractAtoms(outputId: string): Promise<ExtractAtomsResult> {
    const output = await db.get(ATOM_EXTRACTOR_SQL.output, outputId) as WorkflowOutputRow | undefined;
    if (!output) {
      console.warn('[atom-extractor] Output not found:', outputId);
      return { ...EMPTY_RESULT };
    }

    let outputData: unknown;
    try {
      outputData = JSON.parse(output.output_data);
    } catch {
      outputData = output.output_data;
    }

    // Truncate to avoid large context window usage (Haiku has 200k but cost matters)
    const dataStr = JSON.stringify(outputData);
    const truncated = dataStr.length > 3000 ? dataStr.slice(0, 3000) + '...(truncated)' : dataStr;

    const systemPrompt = `You are extracting knowledge atoms from a workflow output.
A knowledge atom is a single, discrete, meaningful piece of information about the user's world — a finding, decision, action, risk or recommendation.

For each atom, provide JSON with exactly these fields:
- content: The knowledge as one clear sentence (required)
- atom_type: Pick from: ${ATOM_TYPE_TAXONOMY} (required)
- category: observation | decision | action | risk | recommendation (required)
- subcategory: more specific label (optional)
- sentiment: positive | negative | neutral | warning | critical (optional)
- confidence: 0.0–1.0 (optional, default 0.8)
- entities: array of { "type": organisation | person | regulation | product | jurisdiction | system | other, "name": the entity exactly as written } — every organisation, person, regulation, product, jurisdiction or system the atom is about (required; use [] when there are none)

Rules:
- Extract 3–8 atoms maximum. Focus on the most important findings only.
- Prioritise: decisions, risks, anomalies, measurements, changes of state.
- Skip: boilerplate, procedural steps, routine confirmations, greetings, and anything about the assistant itself (its readiness, capabilities or limitations) — those are not knowledge.
- Return ONLY a valid JSON array of atom objects — no markdown, no explanation.
- Keep each "content" field under 150 characters.`;

    let rawAtoms: RawAtom[] = [];

    // Provider-routed (review 3.1): the configured utility model on
    // whatever provider is set up — not a hardcoded Anthropic call.
    const model = await getRoutedUtilityModel(db);
    try {
      const chat = await callChat({
        model,
        // Learning happens after the answer; it must never hold a subscription
        // slot an interactive run is waiting for.
        background: true,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Workflow: ${output.workflow_name}\nStep: ${output.step_name} (type: ${output.step_type})\n\nOutput data:\n${truncated}`,
          },
        ],
        maxTokens: 2048,
        jsonMode: true,
        purpose: 'atom-extraction',
        db,
      });

      const parsed = parseJsonArrayTolerant<RawAtom>(chat.text);
      // Log parse success/failure per model so effectiveness on small
      // models is measurable (fire-and-forget — never breaks the run).
      void recordParseOutcome(db, 'atom-extractor', model, parsed !== null,
        parsed === null ? `unparseable atom array (${chat.text.slice(0, 120)})` : undefined);
      rawAtoms = parsed ?? [];
    } catch (err) {
      console.error('[atom-extractor] LLM call failed for output', outputId, `(model ${model})`, err instanceof Error ? err.message : err);
      throw err;
    }

    // Persist each atom
    const result: ExtractAtomsResult = { ...EMPTY_RESULT };
    const insertedAtomIds: string[] = [];
    let insertErrors = 0;
    for (const raw of rawAtoms) {
      if (!raw || typeof raw.content !== 'string' || typeof raw.atom_type !== 'string' || typeof raw.category !== 'string') {
        result.dropped++;
        continue;
      }
      const content = raw.content.trim().slice(0, 2000);
      if (!content || isDroppedAtomType(raw.atom_type) || isAssistantChatter(content)) {
        result.dropped++;
        continue;
      }

      const contentHash = contentHashOf(content);
      const entities = normaliseEntities(raw.entities);

      try {
        const duplicate = await db.get(ATOM_EXTRACTOR_SQL.activeDuplicate, contentHash) as { id: string } | undefined;
        if (duplicate) {
          result.duplicates++;
          continue;
        }

        const atomId = `atom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        await db.run(ATOM_EXTRACTOR_SQL.insertAtom,
          atomId,
          output.id,
          output.workflow_id,
          output.execution_id,
          output.area_id ?? null,
          output.module_id ?? null,
          content,
          raw.atom_type,
          typeof raw.confidence === 'number' ? raw.confidence : 0.8,
          raw.category,
          raw.subcategory ?? null,
          raw.sentiment ?? null,
          raw.temporal_type ?? null,
          entities.length > 0 ? JSON.stringify(entities) : null,
          Array.isArray(raw.tags) ? JSON.stringify(raw.tags) : null,
          raw.valid_until ?? null,
          contentHash,
          output.created_by ?? null,
        );
        insertedAtomIds.push(atomId);
        result.inserted++;

        // Entity refs for graph traversal and the data-subject lookup.
        for (const ent of entities) {
          await db.run(ATOM_EXTRACTOR_SQL.insertEntityRef, atomId, ent.type, ent.id, ent.name, null);
          result.entities++;
        }
      } catch (err) {
        insertErrors++;
        console.error('[atom-extractor] DB insert failed for output', outputId, err instanceof Error ? err.message : err);
      }
    }
    if (insertErrors > 0 && result.inserted === 0) {
      throw new Error(`atom insert failed for output ${outputId} (${insertErrors} atom(s))`);
    }

    // Fire-and-forget: embed each atom for semantic search (non-blocking)
    if (insertedAtomIds.length > 0) {
      (async () => {
        for (const atomId of insertedAtomIds) {
          const atom = await db.get('SELECT * FROM knowledge_atoms WHERE id = ?', atomId) as KnowledgeAtomRow | undefined;
          if (!atom) continue;
          await embedAndStore(db, {
            contentType: 'knowledge_atom',
            contentId: atomId,
            contentText: atom.content,
            metadata: {
              category: atom.category,
              atom_type: atom.atom_type,
              source_area_id: atom.source_area_id,
              source_module_id: atom.source_module_id,
              source_workflow_id: atom.source_workflow_id,
              owner_user_id: atom.owner_user_id ?? null,
              confidence: atom.confidence,
              created_at: atom.created_at,
              is_superseded: atom.superseded_by ? 1 : 0,
            },
          }).catch(err => {
            console.warn('[atom-extractor] embed failed for atom', atomId, err instanceof Error ? err.message : err);
          });
        }
      })();
    }

    // Fire-and-forget: detect relationships between new atoms and recent atoms
    if (insertedAtomIds.length > 0) {
      detectRelationships(insertedAtomIds, output.area_id, output.module_id).catch(err => {
        console.warn('[atom-extractor] relationship detection failed (non-fatal):', err instanceof Error ? err.message : err);
      });
    }

    return result;
  }

  // ── Detect relationships between atoms ─────────────────────────────────
  async function detectRelationships(
    newAtomIds: string[],
    areaId: string | null | undefined,
    moduleId: string | null | undefined,
  ): Promise<void> {
    // Fetch new atoms
    const newAtomResults = await Promise.all(
      newAtomIds.map(id => db.get('SELECT * FROM knowledge_atoms WHERE id = ?', id) as Promise<KnowledgeAtomRow | undefined>)
    );
    const newAtoms = newAtomResults.filter((a): a is KnowledgeAtomRow => a !== undefined);
    if (newAtoms.length === 0) return;

    // Fetch recent existing atoms from same area/module (excluding new ones)
    const conditions = ['a.is_active = 1'];
    const params: (string | number)[] = [];
    if (areaId) { conditions.push('a.source_area_id = ?'); params.push(areaId); }
    if (moduleId) { conditions.push('a.source_module_id = ?'); params.push(moduleId); }
    const newIdSet = new Set(newAtomIds);
    const existingAtoms = (await db.all(`
      SELECT * FROM knowledge_atoms a
      WHERE ${conditions.join(' AND ')}
      ORDER BY a.created_at DESC LIMIT 50
    `, ...params) as KnowledgeAtomRow[]).filter(a => !newIdSet.has(a.id));

    if (existingAtoms.length === 0) return;

    const prompt = `You are analyzing relationships between knowledge atoms.

NEW ATOMS:
${newAtoms.map((a, i) => `[N${i}] (${a.atom_type}) ${a.content}`).join('\n')}

EXISTING ATOMS:
${existingAtoms.slice(0, 20).map((a, i) => `[E${i}] (${a.atom_type}) ${a.content}`).join('\n')}

For each meaningful relationship between a new atom and an existing atom, output a JSON array of objects:
- from: "N0" or "N1" etc (new atom index)
- to: "E0" or "E1" etc (existing atom index)
- type: one of "supports", "contradicts", "extends", "requires", "caused_by", "related_to"
- strength: 0.4-1.0

Rules:
- Only include relationships with strength >= 0.4
- Maximum 10 relationships total
- Return ONLY a valid JSON array — no markdown, no explanation
- If no meaningful relationships exist, return []`;

    // Provider-routed (review 3.1) — same utility model as extraction.
    const model = await getRoutedUtilityModel(db);
    try {
      const chat = await callChat({
        model,
        // Learning happens after the answer; it must never hold a subscription
        // slot an interactive run is waiting for.
        background: true,
        system: 'You analyze relationships between knowledge atoms. Output only valid JSON.',
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 1024,
        jsonMode: true,
        purpose: 'atom-extraction',
        db,
      });

      const rels = parseJsonArrayTolerant<{ from: string; to: string; type: string; strength: number }>(chat.text);
      void recordParseOutcome(db, 'relationship-detector', model, rels !== null,
        rels === null ? `unparseable relationship array (${chat.text.slice(0, 120)})` : undefined);
      if (rels === null) return; // unparseable — skip (logged above)

      const validTypes = new Set(['supports', 'contradicts', 'extends', 'requires', 'caused_by', 'related_to']);
      const INSERT_REL_SQL = `INSERT INTO atom_relationships (from_atom_id, to_atom_id, relationship_type, strength)
         VALUES (?, ?, ?, ?)`;

      const toInsert: Array<{ fromId: string; toId: string; type: string; strength: number }> = [];
      for (const rel of rels.slice(0, 10)) {
        if (!rel.from || !rel.to || !rel.type || typeof rel.strength !== 'number') continue;
        if (!validTypes.has(rel.type) || rel.strength < 0.4) continue;

        const fromMatch = rel.from.match(/^N(\d+)$/);
        const toMatch = rel.to.match(/^E(\d+)$/);
        if (!fromMatch || !toMatch) continue;

        const fromAtom = newAtoms[parseInt(fromMatch[1], 10)];
        const toAtom = existingAtoms[parseInt(toMatch[1], 10)];
        if (!fromAtom || !toAtom) continue;

        toInsert.push({
          fromId: fromAtom.id,
          toId: toAtom.id,
          type: rel.type,
          strength: Math.min(1, Math.max(0.4, rel.strength)),
        });
      }

      for (const item of toInsert) {
        await db.run(INSERT_REL_SQL, item.fromId, item.toId, item.type, item.strength);
      }
    } catch (err) {
      console.warn(`[atom-extractor] relationship LLM call failed (model ${model}):`, err instanceof Error ? err.message : err);
    }
  }

  // ── Search atoms ──────────────────────────────────────────────────────────

  async function searchAtoms(
    query: string,
    filters?: {
      areaId?: string;
      atomType?: string;
      entityType?: string;
      entityId?: string;
      since?: Date;
    }
  ): Promise<Array<KnowledgeAtomRow & { entity_refs: EntityRefRow[] }>> {
    const conditions: string[] = ['a.is_active = 1'];
    const params: (string | number)[] = [];

    if (query && query.trim()) {
      conditions.push("a.content LIKE ?");
      params.push(`%${query.trim()}%`);
    }

    if (filters?.areaId) {
      conditions.push("a.source_area_id = ?");
      params.push(filters.areaId);
    }

    if (filters?.atomType) {
      conditions.push("a.atom_type LIKE ?");
      params.push(`${filters.atomType}%`);
    }

    if (filters?.since) {
      conditions.push("a.created_at >= ?");
      params.push(filters.since.toISOString());
    }

    let sql: string;

    if (filters?.entityType || filters?.entityId) {
      // Join to entity refs for entity-filtered search
      const entityConds: string[] = [];
      if (filters.entityType) {
        entityConds.push("er.entity_type = ?");
        params.push(filters.entityType);
      }
      if (filters.entityId) {
        entityConds.push("er.entity_id = ?");
        params.push(filters.entityId);
      }

      sql = `
        SELECT DISTINCT a.*
        FROM knowledge_atoms a
        JOIN knowledge_entity_refs er ON er.atom_id = a.id
        WHERE ${[...conditions, ...entityConds].join(' AND ')}
        ORDER BY a.created_at DESC
        LIMIT 200
      `;
    } else {
      sql = `
        SELECT a.*
        FROM knowledge_atoms a
        WHERE ${conditions.join(' AND ')}
        ORDER BY a.created_at DESC
        LIMIT 200
      `;
    }

    const atoms = await db.all(sql, ...params) as KnowledgeAtomRow[];

    const results: Array<KnowledgeAtomRow & { entity_refs: EntityRefRow[] }> = [];
    for (const atom of atoms) {
      const entity_refs = await db.all('SELECT * FROM knowledge_entity_refs WHERE atom_id = ?', atom.id) as EntityRefRow[];
      results.push({ ...atom, entity_refs });
    }
    return results;
  }

  // ── Get all atoms for a specific entity ──────────────────────────────────

  async function getAtomsByEntity(
    entityType: string,
    entityId: string
  ): Promise<Array<KnowledgeAtomRow & { entity_refs: EntityRefRow[] }>> {
    const atoms = await db.all(`
      SELECT DISTINCT a.*
      FROM knowledge_atoms a
      JOIN knowledge_entity_refs er ON er.atom_id = a.id
      WHERE er.entity_type = ? AND er.entity_id = ? AND a.is_active = 1
      ORDER BY a.created_at DESC
    `, entityType, entityId) as KnowledgeAtomRow[];

    const results: Array<KnowledgeAtomRow & { entity_refs: EntityRefRow[] }> = [];
    for (const atom of atoms) {
      const entity_refs = await db.all('SELECT * FROM knowledge_entity_refs WHERE atom_id = ?', atom.id) as EntityRefRow[];
      results.push({ ...atom, entity_refs });
    }
    return results;
  }

  // ── Find entities sharing atoms with a given entity (graph neighbors) ────

  async function getEntityConnections(
    entityType: string,
    entityId: string
  ): Promise<Array<{ entity_type: string; entity_id: string; entity_name: string | null; shared_atom_count: number }>> {
    // Find all atoms that mention our entity
    const atomIdRows = await db.all(`
      SELECT atom_id FROM knowledge_entity_refs
      WHERE entity_type = ? AND entity_id = ?
    `, entityType, entityId) as Array<{ atom_id: string }>;
    const atomIds = atomIdRows.map((r) => r.atom_id);

    if (atomIds.length === 0) return [];

    // Find other entities that appear in those same atoms
    const placeholders = atomIds.map(() => '?').join(', ');
    const neighbors = await db.all(`
      SELECT entity_type, entity_id, entity_name,
             COUNT(DISTINCT atom_id) AS shared_atom_count
      FROM knowledge_entity_refs
      WHERE atom_id IN (${placeholders})
        AND NOT (entity_type = ? AND entity_id = ?)
      GROUP BY entity_type, entity_id
      ORDER BY shared_atom_count DESC
      LIMIT 50
    `, ...atomIds, entityType, entityId) as Array<{
      entity_type: string;
      entity_id: string;
      entity_name: string | null;
      shared_atom_count: number;
    }>;

    return neighbors;
  }

  // ── Get single atom with entity refs ─────────────────────────────────────

  async function getAtomDetail(
    atomId: string
  ): Promise<(KnowledgeAtomRow & { entity_refs: EntityRefRow[] }) | null> {
    const atom = await db.get('SELECT * FROM knowledge_atoms WHERE id = ?', atomId) as KnowledgeAtomRow | undefined;
    if (!atom) return null;
    const entity_refs = await db.all('SELECT * FROM knowledge_entity_refs WHERE atom_id = ?', atomId) as EntityRefRow[];
    return {
      ...atom,
      entity_refs,
    };
  }

  return {
    extractAtoms,
    searchAtoms,
    getAtomsByEntity,
    getEntityConnections,
    getAtomDetail,
  };
}

export type AtomExtractor = ReturnType<typeof createAtomExtractor>;
