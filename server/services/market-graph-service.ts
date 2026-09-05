import type { DatabaseAdapter } from '../db/database.js';
import { ilike } from '../db/dialect-helpers.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface EntityRow {
  id: string;
  name: string;
  entity_type: string;
  symbol: string | null;
  description: string | null;
  metadata: string;
  atom_count: number;
  is_active: number;
  created_at: string;
}

interface EntityRelationshipRow {
  id: number;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string;
  strength: number;
  evidence_atom_count: number;
  metadata: string;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export async function createMarketGraphService(db: DatabaseAdapter) {

  // ── Entity CRUD ──────────────────────────────────────────────────────────

  async function createEntity(params: {
    name: string;
    entityType: string;
    symbol?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }) {
    const id = `ment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`
      INSERT INTO market_entities (id, name, entity_type, symbol, description, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `, id, params.name, params.entityType, params.symbol ?? null,
       params.description ?? null, JSON.stringify(params.metadata ?? {}));
    return id;
  }

  async function getEntity(id: string) {
    const entity = await db.get<EntityRow>('SELECT * FROM market_entities WHERE id = ?', id);
    if (!entity) return null;

    const aliases = await db.all<{ alias: string; alias_type: string }>(
      'SELECT alias, alias_type FROM market_entity_aliases WHERE entity_id = ?', id
    );
    const relationships = await db.all<EntityRelationshipRow & { target_name: string; target_type: string }>(
      `SELECT r.*, e.name as target_name, e.entity_type as target_type
       FROM market_entity_relationships r
       JOIN market_entities e ON r.target_entity_id = e.id
       WHERE r.source_entity_id = ?
       ORDER BY r.strength DESC`, id
    );
    const incomingRelationships = await db.all<EntityRelationshipRow & { source_name: string; source_type: string }>(
      `SELECT r.*, e.name as source_name, e.entity_type as source_type
       FROM market_entity_relationships r
       JOIN market_entities e ON r.source_entity_id = e.id
       WHERE r.target_entity_id = ?
       ORDER BY r.strength DESC`, id
    );

    return { ...entity, aliases, relationships, incomingRelationships };
  }

  async function listEntities(params: {
    entityType?: string;
    query?: string;
    activeOnly?: boolean;
    limit?: number;
    offset?: number;
  }) {
    let where = 'WHERE 1=1';
    const args: unknown[] = [];

    if (params.activeOnly !== false) { where += ' AND is_active = 1'; }
    if (params.entityType) { where += ' AND entity_type = ?'; args.push(params.entityType); }
    if (params.query) {
      where += ` AND (${ilike(db.dialect, 'name')} OR ${ilike(db.dialect, 'symbol')})`;
      args.push(`%${params.query}%`, `%${params.query}%`);
    }

    args.push(params.limit ?? 100, params.offset ?? 0);

    return await db.all<EntityRow>(
      `SELECT * FROM market_entities ${where} ORDER BY atom_count DESC, name LIMIT ? OFFSET ?`,
      ...args
    );
  }

  async function updateEntity(id: string, updates: {
    name?: string;
    description?: string;
    metadata?: Record<string, unknown>;
    isActive?: boolean;
  }) {
    const fields: string[] = [];
    const args: unknown[] = [];

    if (updates.name !== undefined) { fields.push('name = ?'); args.push(updates.name); }
    if (updates.description !== undefined) { fields.push('description = ?'); args.push(updates.description); }
    if (updates.metadata !== undefined) { fields.push('metadata = ?'); args.push(JSON.stringify(updates.metadata)); }
    if (updates.isActive !== undefined) { fields.push('is_active = ?'); args.push(updates.isActive ? 1 : 0); }

    if (fields.length === 0) return;
    fields.push("updated_at = NOW()");
    args.push(id);

    await db.run(`UPDATE market_entities SET ${fields.join(', ')} WHERE id = ?`, ...args);
  }

  async function deleteEntity(id: string) {
    await db.run('DELETE FROM market_entities WHERE id = ?', id);
  }

  // ── Aliases ──────────────────────────────────────────────────────────────

  async function addAlias(entityId: string, alias: string, aliasType = 'name') {
    await db.run('INSERT INTO market_entity_aliases (entity_id, alias, alias_type) VALUES (?, ?, ?)',
                  entityId, alias, aliasType);
  }

  async function resolveAlias(alias: string): Promise<EntityRow | null> {
    const ref = await db.get<{ entity_id: string }>(
      `SELECT entity_id FROM market_entity_aliases WHERE ${ilike(db.dialect, 'alias')}`,
      alias
    );
    if (!ref) {
      // Try direct name/symbol match
      return await db.get<EntityRow>(
        `SELECT * FROM market_entities WHERE ${ilike(db.dialect, 'name')} OR ${ilike(db.dialect, 'symbol')}`,
        alias, alias
      ) ?? null;
    }
    return await db.get<EntityRow>('SELECT * FROM market_entities WHERE id = ?', ref.entity_id) ?? null;
  }

  // ── Relationships ────────────────────────────────────────────────────────

  async function addRelationship(
    sourceEntityId: string,
    targetEntityId: string,
    relationshipType: string,
    strength = 0.5,
    metadata?: Record<string, unknown>,
  ) {
    // Check for existing relationship
    const existing = await db.get<{ id: number; strength: number; evidence_atom_count: number }>(
      `SELECT id, strength, evidence_atom_count FROM market_entity_relationships
       WHERE source_entity_id = ? AND target_entity_id = ? AND relationship_type = ?`,
      sourceEntityId, targetEntityId, relationshipType
    );

    if (existing) {
      // Strengthen existing relationship
      const newStrength = Math.min(1.0, (existing.strength + strength) / 2);
      await db.run(`
        UPDATE market_entity_relationships
        SET strength = ?, evidence_atom_count = evidence_atom_count + 1, updated_at = NOW()
        WHERE id = ?
      `, newStrength, existing.id);
    } else {
      await db.run(`
        INSERT INTO market_entity_relationships (source_entity_id, target_entity_id, relationship_type, strength, evidence_atom_count, metadata)
        VALUES (?, ?, ?, ?, 1, ?)
      `, sourceEntityId, targetEntityId, relationshipType, strength,
         JSON.stringify(metadata ?? {}));
    }
  }

  async function getRelationships(entityId: string) {
    const outgoing = await db.all<EntityRelationshipRow & { target_name: string }>(
      `SELECT r.*, e.name as target_name FROM market_entity_relationships r
       JOIN market_entities e ON r.target_entity_id = e.id
       WHERE r.source_entity_id = ? ORDER BY r.strength DESC`, entityId
    );
    const incoming = await db.all<EntityRelationshipRow & { source_name: string }>(
      `SELECT r.*, e.name as source_name FROM market_entity_relationships r
       JOIN market_entities e ON r.source_entity_id = e.id
       WHERE r.target_entity_id = ? ORDER BY r.strength DESC`, entityId
    );
    return { outgoing, incoming };
  }

  // ── Graph Building ───────────────────────────────────────────────────────
  // Build entity graph from atom entity references

  async function buildGraphFromAtoms() {
    // Extract entities from market atoms
    const atoms = await db.all<{ id: string; entities: string }>(
      "SELECT id, entities FROM market_atoms WHERE is_active = 1 AND entities != '[]'"
    );

    let entitiesCreated = 0;
    let relationshipsCreated = 0;

    for (const atom of atoms) {
      // market_atoms.entities is JSONB (migration 056) — the pg driver hands
      // back an already-parsed array. JSON.parse on it threw for EVERY atom
      // and the catch-continue silently built an empty graph forever.
      let entities: Array<{ type: string; id: string; name?: string }>;
      if (typeof atom.entities === 'string') {
        try { entities = JSON.parse(atom.entities); } catch { continue; }
      } else {
        entities = atom.entities as unknown as Array<{ type: string; id: string; name?: string }>;
      }
      if (!Array.isArray(entities) || entities.length === 0) continue;

      // Ensure all entities exist
      const entityIds: string[] = [];
      for (const ent of entities) {
        const existing = await resolveAlias(ent.name ?? ent.id);
        if (existing) {
          entityIds.push(existing.id);
          // Update atom count
          await db.run('UPDATE market_entities SET atom_count = atom_count + 1 WHERE id = ?', existing.id);
        } else {
          const newId = await createEntity({
            name: ent.name ?? ent.id,
            entityType: ent.type,
            symbol: ent.id,
          });
          entityIds.push(newId);
          entitiesCreated++;
        }
      }

      // Create co-occurrence relationships between entities in the same atom
      for (let i = 0; i < entityIds.length; i++) {
        for (let j = i + 1; j < entityIds.length; j++) {
          await addRelationship(entityIds[i], entityIds[j], 'co_mentioned', 0.3);
          relationshipsCreated++;
        }
      }
    }

    console.log(`[market-graph] Built graph: ${entitiesCreated} entities, ${relationshipsCreated} relationships`);
    return { entitiesCreated, relationshipsCreated };
  }

  // ── Graph Stats ──────────────────────────────────────────────────────────

  async function getGraphStats() {
    const totalEntities = await db.get<{ n: number }>("SELECT COUNT(*) as n FROM market_entities WHERE is_active = 1");
    const totalRelationships = await db.get<{ n: number }>("SELECT COUNT(*) as n FROM market_entity_relationships");
    const byType = await db.all<{ entity_type: string; count: number }>(
      "SELECT entity_type, COUNT(*) as count FROM market_entities WHERE is_active = 1 GROUP BY entity_type ORDER BY count DESC"
    );
    const topEntities = await db.all<{ name: string; entity_type: string; atom_count: number }>(
      "SELECT name, entity_type, atom_count FROM market_entities WHERE is_active = 1 ORDER BY atom_count DESC LIMIT 10"
    );

    return {
      totalEntities: totalEntities?.n ?? 0,
      totalRelationships: totalRelationships?.n ?? 0,
      byType,
      topEntities,
    };
  }

  // ── Full Graph (for visualization) ───────────────────────────────────────

  async function getFullGraph(limit = 100) {
    const nodes = await db.all<EntityRow>(
      'SELECT * FROM market_entities WHERE is_active = 1 ORDER BY atom_count DESC LIMIT ?', limit
    );
    const nodeIds = new Set(nodes.map(n => n.id));

    // Only get edges between visible nodes
    const allEdges = await db.all<EntityRelationshipRow>(
      'SELECT * FROM market_entity_relationships ORDER BY strength DESC'
    );
    const edges = allEdges.filter(e => nodeIds.has(e.source_entity_id) && nodeIds.has(e.target_entity_id));

    return { nodes, edges };
  }

  return {
    // Entities
    createEntity,
    getEntity,
    listEntities,
    updateEntity,
    deleteEntity,
    // Aliases
    addAlias,
    resolveAlias,
    // Relationships
    addRelationship,
    getRelationships,
    // Graph
    buildGraphFromAtoms,
    getGraphStats,
    getFullGraph,
  };
}

export type MarketGraphService = Awaited<ReturnType<typeof createMarketGraphService>>;
