import Database from 'better-sqlite3';
import Anthropic from '@anthropic-ai/sdk';

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

// ── Factory ─────────────────────────────────────────────────────────────────

export function createAtomExtractor(db: Database.Database, client: Anthropic) {
  // Prepared statements
  const selectOutput = db.prepare<[string], WorkflowOutputRow>(
    'SELECT * FROM workflow_outputs WHERE id = ?'
  );

  const insertAtom = db.prepare(`
    INSERT INTO knowledge_atoms
      (id, source_output_id, source_workflow_id, source_execution_id, source_area_id, source_module_id,
       content, atom_type, confidence, category, subcategory, sentiment, temporal_type,
       entities, tags, valid_until, created_at)
    VALUES
      (@id, @source_output_id, @source_workflow_id, @source_execution_id, @source_area_id, @source_module_id,
       @content, @atom_type, @confidence, @category, @subcategory, @sentiment, @temporal_type,
       @entities, @tags, @valid_until, datetime('now'))
  `);

  const insertEntityRef = db.prepare(`
    INSERT OR IGNORE INTO knowledge_entity_refs (atom_id, entity_type, entity_id, entity_name, relationship)
    VALUES (@atom_id, @entity_type, @entity_id, @entity_name, @relationship)
  `);

  const selectAtomById = db.prepare<[string], KnowledgeAtomRow>(
    'SELECT * FROM knowledge_atoms WHERE id = ?'
  );

  const selectEntityRefsByAtom = db.prepare<[string], EntityRefRow>(
    'SELECT * FROM knowledge_entity_refs WHERE atom_id = ?'
  );

  // ── Extract atoms from a stored workflow output ───────────────────────────

  async function extractAtoms(outputId: string): Promise<void> {
    const output = selectOutput.get(outputId);
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
    const truncated = dataStr.length > 6000 ? dataStr.slice(0, 6000) + '...(truncated)' : dataStr;

    const systemPrompt = `You are extracting knowledge atoms from a workflow output.
A knowledge atom is a single, discrete, meaningful piece of information.

For each atom, provide JSON with exactly these fields:
- content: The knowledge as one clear sentence (required)
- atom_type: Pick from: ${ATOM_TYPE_TAXONOMY} (required)
- category: observation | decision | action | risk | status | recommendation (required)
- subcategory: more specific label (optional)
- sentiment: positive | negative | neutral | warning | critical (optional)
- temporal_type: point_in_time | trend | recurring | permanent (optional)
- entities: array of {type, id, name} — extract: customer, product, department, system, regulation, person, project, vendor (optional)
- confidence: 0.0–1.0 (optional, default 0.8)
- valid_until: ISO 8601 date if this fact expires, null otherwise (optional)

Rules:
- Extract 3–15 atoms depending on content complexity.
- Prioritise: decisions, risks, anomalies, measurements, status changes.
- Skip: boilerplate, procedural steps, routine confirmations.
- Return ONLY a valid JSON array of atom objects — no markdown, no explanation.`;

    let rawAtoms: RawAtom[] = [];

    try {
      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Workflow: ${output.workflow_name}\nStep: ${output.step_name} (type: ${output.step_type})\n\nOutput data:\n${truncated}`,
          },
        ],
      });

      let responseText = '';
      for (const block of message.content) {
        if (block.type === 'text') responseText += block.text;
      }

      // Parse JSON — strip any accidental markdown fencing
      const cleaned = responseText.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
      rawAtoms = JSON.parse(cleaned) as RawAtom[];
      if (!Array.isArray(rawAtoms)) rawAtoms = [];
    } catch (err) {
      console.error('[atom-extractor] Claude call or JSON parse failed for output', outputId, err);
      return;
    }

    // Persist each atom inside a transaction for atomicity
    const insertAll = db.transaction(() => {
      for (const raw of rawAtoms) {
        if (!raw.content || !raw.atom_type || !raw.category) continue;

        const atomId = `atom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

        insertAtom.run({
          id: atomId,
          source_output_id: output.id,
          source_workflow_id: output.workflow_id,
          source_execution_id: output.execution_id,
          source_area_id: output.area_id ?? null,
          source_module_id: output.module_id ?? null,
          content: raw.content.slice(0, 2000),
          atom_type: raw.atom_type,
          confidence: typeof raw.confidence === 'number' ? raw.confidence : 0.8,
          category: raw.category,
          subcategory: raw.subcategory ?? null,
          sentiment: raw.sentiment ?? null,
          temporal_type: raw.temporal_type ?? null,
          entities: raw.entities ? JSON.stringify(raw.entities) : null,
          tags: raw.tags ? JSON.stringify(raw.tags) : null,
          valid_until: raw.valid_until ?? null,
        });

        // Store individual entity refs for graph traversal
        if (Array.isArray(raw.entities)) {
          for (const ent of raw.entities) {
            if (!ent.type || !ent.id) continue;
            insertEntityRef.run({
              atom_id: atomId,
              entity_type: ent.type,
              entity_id: String(ent.id),
              entity_name: ent.name ?? null,
              relationship: null,
            });
          }
        }
      }
    });

    try {
      insertAll();
    } catch (err) {
      console.error('[atom-extractor] DB insert failed for output', outputId, err);
    }
  }

  // ── Search atoms ──────────────────────────────────────────────────────────

  function searchAtoms(
    query: string,
    filters?: {
      areaId?: string;
      atomType?: string;
      entityType?: string;
      entityId?: string;
      since?: Date;
    }
  ): Array<KnowledgeAtomRow & { entity_refs: EntityRefRow[] }> {
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

    const atoms = db.prepare(sql).all(...params) as KnowledgeAtomRow[];

    return atoms.map((atom) => ({
      ...atom,
      entity_refs: selectEntityRefsByAtom.all(atom.id) as EntityRefRow[],
    }));
  }

  // ── Get all atoms for a specific entity ──────────────────────────────────

  function getAtomsByEntity(
    entityType: string,
    entityId: string
  ): Array<KnowledgeAtomRow & { entity_refs: EntityRefRow[] }> {
    const atoms = db.prepare(`
      SELECT DISTINCT a.*
      FROM knowledge_atoms a
      JOIN knowledge_entity_refs er ON er.atom_id = a.id
      WHERE er.entity_type = ? AND er.entity_id = ? AND a.is_active = 1
      ORDER BY a.created_at DESC
    `).all(entityType, entityId) as KnowledgeAtomRow[];

    return atoms.map((atom) => ({
      ...atom,
      entity_refs: selectEntityRefsByAtom.all(atom.id) as EntityRefRow[],
    }));
  }

  // ── Find entities sharing atoms with a given entity (graph neighbors) ────

  function getEntityConnections(
    entityType: string,
    entityId: string
  ): Array<{ entity_type: string; entity_id: string; entity_name: string | null; shared_atom_count: number }> {
    // Find all atoms that mention our entity
    const atomIds = db.prepare(`
      SELECT atom_id FROM knowledge_entity_refs
      WHERE entity_type = ? AND entity_id = ?
    `).all(entityType, entityId).map((r) => (r as { atom_id: string }).atom_id);

    if (atomIds.length === 0) return [];

    // Find other entities that appear in those same atoms
    const placeholders = atomIds.map(() => '?').join(', ');
    const neighbors = db.prepare(`
      SELECT entity_type, entity_id, entity_name,
             COUNT(DISTINCT atom_id) AS shared_atom_count
      FROM knowledge_entity_refs
      WHERE atom_id IN (${placeholders})
        AND NOT (entity_type = ? AND entity_id = ?)
      GROUP BY entity_type, entity_id
      ORDER BY shared_atom_count DESC
      LIMIT 50
    `).all(...atomIds, entityType, entityId) as Array<{
      entity_type: string;
      entity_id: string;
      entity_name: string | null;
      shared_atom_count: number;
    }>;

    return neighbors;
  }

  // ── Get single atom with entity refs ─────────────────────────────────────

  function getAtomDetail(
    atomId: string
  ): (KnowledgeAtomRow & { entity_refs: EntityRefRow[] }) | null {
    const atom = selectAtomById.get(atomId);
    if (!atom) return null;
    return {
      ...atom,
      entity_refs: selectEntityRefsByAtom.all(atomId) as EntityRefRow[],
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
