import type { DatabaseAdapter } from '../db/database.js';
import type Anthropic from '@anthropic-ai/sdk';
import { callChat } from './provider-router.js';
import { getRoutedUtilityModel } from './utility-model.js';
import { recordParseOutcome } from './parse-telemetry.js';
import { embedAndStore } from './hybrid-search.js';

// ── Taxonomy ────────────────────────────────────────────────────────────────

const ATOM_TYPE_TAXONOMY = `
  observation.finding, observation.measurement, observation.comparison,
  observation.anomaly, observation.correlation,
  decision.approval, decision.rejection, decision.escalation, decision.override, decision.deferral,
  action.creation, action.modification, action.communication, action.assignment,
  risk.identified, risk.assessed, risk.mitigated, risk.accepted, risk.materialized,
  status.system_health, status.project_progress, status.compliance_state, status.performance,
  recommendation.ai_suggestion, recommendation.human_suggestion, recommendation.best_practice
`.trim();

// ── Types ────────────────────────────────────────────────────────────────────

interface RawAtom {
  content: string;
  atom_type: string;
  category: string;
  subcategory?: string;
  sentiment?: string;
  temporal_type?: string;
  entities?: Array<{ type: string; id: string; name?: string }>;
  confidence?: number;
  valid_until?: string | null;
  tags?: string[];
}

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
}

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
  // ── SQL templates (prepared statements replaced by adapter calls) ───────

  const INSERT_ATOM_SQL = `
    INSERT INTO knowledge_atoms
      (id, source_output_id, source_workflow_id, source_execution_id, source_area_id, source_module_id,
       content, atom_type, confidence, category, subcategory, sentiment, temporal_type,
       entities, tags, valid_until, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
  `;

  // ── Extract atoms from a stored workflow output ───────────────────────────

  async function extractAtoms(outputId: string): Promise<void> {
    const output = await db.get('SELECT * FROM workflow_outputs WHERE id = ?', outputId) as WorkflowOutputRow | undefined;
    if (!output) {
      console.warn('[atom-extractor] Output not found:', outputId);
      return;
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
A knowledge atom is a single, discrete, meaningful piece of information.

For each atom, provide JSON with exactly these fields:
- content: The knowledge as one clear sentence (required)
- atom_type: Pick from: ${ATOM_TYPE_TAXONOMY} (required)
- category: observation | decision | action | risk | status | recommendation (required)
- subcategory: more specific label (optional)
- sentiment: positive | negative | neutral | warning | critical (optional)
- confidence: 0.0–1.0 (optional, default 0.8)

Rules:
- Extract 3–8 atoms maximum. Focus on the most important findings only.
- Prioritise: decisions, risks, anomalies, measurements, status changes.
- Skip: boilerplate, procedural steps, routine confirmations.
- Return ONLY a valid JSON array of atom objects — no markdown, no explanation.
- Keep each "content" field under 150 characters.`;

    let rawAtoms: RawAtom[] = [];

    // Provider-routed (review 3.1): the configured utility model on
    // whatever provider is set up — not a hardcoded Anthropic call.
    const model = await getRoutedUtilityModel(db);
    try {
      const chat = await callChat({
        model,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Workflow: ${output.workflow_name}\nStep: ${output.step_name} (type: ${output.step_type})\n\nOutput data:\n${truncated}`,
          },
        ],
        maxTokens: 2048,
        jsonMode: true,
        db,
      });

      const parsed = parseJsonArrayTolerant<RawAtom>(chat.text);
      // Log parse success/failure per model so effectiveness on small
      // models is measurable (fire-and-forget — never breaks the run).
      void recordParseOutcome(db, 'atom-extractor', model, parsed !== null,
        parsed === null ? `unparseable atom array (${chat.text.slice(0, 120)})` : undefined);
      rawAtoms = parsed ?? [];
    } catch (err) {
      console.error('[atom-extractor] LLM call failed for output', outputId, `(model ${model})`, err);
      return;
    }

    // Persist each atom
    let insertedAtomIds: string[] = [];
    try {
      const ids: string[] = [];
      for (const raw of rawAtoms) {
        if (!raw.content || !raw.atom_type || !raw.category) continue;

        const atomId = `atom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

        await db.run(INSERT_ATOM_SQL,
          atomId,
          output.id,
          output.workflow_id,
          output.execution_id,
          output.area_id ?? null,
          output.module_id ?? null,
          raw.content.slice(0, 2000),
          raw.atom_type,
          typeof raw.confidence === 'number' ? raw.confidence : 0.8,
          raw.category,
          raw.subcategory ?? null,
          raw.sentiment ?? null,
          raw.temporal_type ?? null,
          raw.entities ? JSON.stringify(raw.entities) : null,
          raw.tags ? JSON.stringify(raw.tags) : null,
          raw.valid_until ?? null,
        );

        ids.push(atomId);

        // Store individual entity refs for graph traversal
        if (Array.isArray(raw.entities)) {
          for (const ent of raw.entities) {
            if (!ent.type || !ent.id) continue;
            await db.run(`
    INSERT INTO knowledge_entity_refs (atom_id, entity_type, entity_id, entity_name, relationship)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT DO NOTHING
  `,
              atomId,
              ent.type,
              String(ent.id),
              ent.name ?? null,
              null,
            );
          }
        }
      }
      insertedAtomIds = ids;
    } catch (err) {
      console.error('[atom-extractor] DB insert failed for output', outputId, err);
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
        system: 'You analyze relationships between knowledge atoms. Output only valid JSON.',
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 1024,
        jsonMode: true,
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
