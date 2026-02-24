import Database from 'better-sqlite3';

// Relationship types
export const RELATIONSHIP_TYPES = {
  mentioned_with: 'co-mentioned in same atom',
  precedes: 'temporal precedence',
  caused: 'causal relationship',
  requires: 'dependency',
  contradicts: 'contradiction detected',
  supports: 'supporting relationship',
} as const;

export function createKnowledgeGraph(db: Database.Database) {

  function buildGraph(options?: { minAtomCount?: number; sinceDays?: number }) {
    // Build entity nodes from knowledge_entity_refs
    const sinceDate = options?.sinceDays
      ? new Date(Date.now() - options.sinceDays * 86400000).toISOString()
      : '2020-01-01';

    const entities = db.prepare(`
      SELECT entity_type, entity_id, entity_name, COUNT(*) as ref_count
      FROM knowledge_entity_refs
      JOIN knowledge_atoms ON knowledge_entity_refs.atom_id = knowledge_atoms.id
      WHERE knowledge_atoms.created_at > ?
      GROUP BY entity_type, entity_id
      HAVING ref_count >= ?
    `).all(sinceDate, options?.minAtomCount ?? 1) as any[];

    let nodesCreated = 0;
    for (const e of entities) {
      try {
        db.prepare(`
          INSERT OR REPLACE INTO entity_nodes (id, entity_type, entity_id, canonical_name, interaction_count, last_seen)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(`en_${e.entity_type}_${e.entity_id}`, e.entity_type, e.entity_id, e.entity_name, e.ref_count, new Date().toISOString());
        nodesCreated++;
      } catch (err) {
        // Node might already exist, that's fine
      }
    }

    // Build relationships from co-occurrence
    const cooccurrences = db.prepare(`
      SELECT
        r1.entity_type as source_type, r1.entity_id as source_id, r1.entity_name as source_name,
        r2.entity_type as target_type, r2.entity_id as target_id, r2.entity_name as target_name,
        COUNT(DISTINCT r1.atom_id) as cooccurrence_count
      FROM knowledge_entity_refs r1
      JOIN knowledge_entity_refs r2 ON r1.atom_id = r2.atom_id
      WHERE r1.entity_type != r2.entity_type OR r1.entity_id != r2.entity_id
      GROUP BY r1.entity_type, r1.entity_id, r2.entity_type, r2.entity_id
      HAVING cooccurrence_count >= 2
    `).all() as any[];

    let relationshipsCreated = 0;
    for (const co of cooccurrences) {
      try {
        const existing = db.prepare(`
          SELECT * FROM entity_relationships
          WHERE source_type = ? AND source_id = ? AND target_type = ? AND target_id = ?
        `).get(co.source_type, co.source_id, co.target_type, co.target_id) as any;

        if (existing) {
          db.prepare(`
            UPDATE entity_relationships
            SET observation_count = observation_count + ?, strength = ?, last_observed = ?
            WHERE id = ?
          `).run(co.cooccurrence_count, Math.log(co.cooccurrence_count + 1), new Date().toISOString(), existing.id);
        } else {
          db.prepare(`
            INSERT INTO entity_relationships
              (id, source_type, source_id, target_type, target_id, relationship_type, strength, observation_count)
            VALUES (?, ?, ?, ?, ?, 'mentioned_with', ?, ?)
          `).run(
            `er_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
            co.source_type, co.source_id, co.target_type, co.target_id,
            Math.log(co.cooccurrence_count + 1), co.cooccurrence_count
          );
          relationshipsCreated++;
        }
      } catch (err) {
        // Relationship might already exist
      }
    }

    return { nodesCreated, relationshipsCreated, totalNodes: entities.length, totalRelationships: cooccurrences.length };
  }

  function getEntityNeighbors(entityType: string, entityId: string, depth = 1) {
    const visited = new Set<string>();
    const result: any[] = [];
    const queue: Array<{ type: string; id: string; depth: number; path: string[] }> = [
      { type: entityType, id: entityId, depth: 0, path: [] }
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const key = `${current.type}:${current.id}`;
      if (visited.has(key) || current.depth > depth) continue;
      visited.add(key);

      const neighbors = db.prepare(`
        SELECT
          target_type as type, target_id as id, relationship_type, strength, observation_count,
          'outgoing' as direction
        FROM entity_relationships
        WHERE source_type = ? AND source_id = ?
        UNION
        SELECT
          source_type as type, source_id as id, relationship_type, strength, observation_count,
          'incoming' as direction
        FROM entity_relationships
        WHERE target_type = ? AND target_id = ?
      `).all(current.type, current.id, current.type, current.id) as any[];

      for (const n of neighbors) {
        result.push({
          ...n,
          depth: current.depth + 1,
          path: [...current.path, `${current.type}:${current.id}`],
        });
        if (current.depth < depth) {
          queue.push({ type: n.type, id: n.id, depth: current.depth + 1, path: [...current.path, key] });
        }
      }
    }

    return result;
  }

  function getEntitySubgraph(entityType: string, entityId: string, maxDepth = 2) {
    const nodes: any[] = [];
    const edges: any[] = [];
    const visited = new Set<string>();

    function traverse(type: string, id: string, depth: number) {
      const key = `${type}:${id}`;
      if (visited.has(key) || depth > maxDepth) return;
      visited.add(key);

      const node = db.prepare('SELECT * FROM entity_nodes WHERE entity_type = ? AND entity_id = ?').get(type, id);
      if (node) nodes.push(node);

      const relationships = db.prepare(`
        SELECT * FROM entity_relationships
        WHERE (source_type = ? AND source_id = ?) OR (target_type = ? AND target_id = ?)
      `).all(type, id, type, id) as any[];

      for (const rel of relationships) {
        edges.push(rel);
        const nextType = rel.source_type === type && rel.source_id === id ? rel.target_type : rel.source_type;
        const nextId = rel.source_type === type && rel.source_id === id ? rel.target_id : rel.source_id;
        traverse(nextType, nextId, depth + 1);
      }
    }

    traverse(entityType, entityId, 0);
    return { nodes, edges };
  }

  function mergeEntities(params: {
    entityType: string;
    fromId: string;
    intoId: string;
    reason?: string;
    mergedBy?: string;
  }) {
    // Log merge
    db.prepare(`
      INSERT INTO entity_merge_log (id, entity_type, merged_from, merged_into, merge_reason, merged_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      `em_${Date.now()}`,
      params.entityType, params.fromId, params.intoId,
      params.reason ?? 'manual', params.mergedBy ?? 'system'
    );

    // Update atom refs
    db.prepare(`
      UPDATE knowledge_entity_refs
      SET entity_id = ?
      WHERE entity_type = ? AND entity_id = ?
    `).run(params.intoId, params.entityType, params.fromId);

    // Update entity aliases
    db.prepare(`
      INSERT OR IGNORE INTO entity_aliases (entity_type, primary_id, alias_id, alias_source)
      VALUES (?, ?, ?, 'merge')
    `).run(params.entityType, params.intoId, params.fromId);

    // Remove old node
    db.prepare('DELETE FROM entity_nodes WHERE entity_type = ? AND entity_id = ?').run(params.entityType, params.fromId);
  }

  function getTopEntities(limit = 20) {
    return db.prepare(`
      SELECT * FROM entity_nodes
      ORDER BY interaction_count DESC, last_seen DESC
      LIMIT ?
    `).all(limit);
  }

  return {
    buildGraph, getEntityNeighbors, getEntitySubgraph,
    mergeEntities, getTopEntities,
  };
}
