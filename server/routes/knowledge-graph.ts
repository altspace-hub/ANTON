import express from 'express';
import type { DatabaseAdapter } from '../db/database.js';

import { createKnowledgeGraph } from '../services/knowledge-graph.js';
import { createGraphAnalytics } from '../services/graph-analytics.js';
import { safeError } from '../lib/error-response.js';
import { requireAdminOrSolo } from '../middleware/role-guards.js';
import { atomOwnerSql, searchScopeForRequest, type SearchScope } from '../services/hybrid-search.js';

/** Narrow `unknown` thrown values to a user-safe error message. */
function errMsg(err: unknown): string {
  // Delegates to the shared safeError — redacts in production.
  return safeError(err);
}

// ── Who may see which entity (team mode) ────────────────────────────────────
//
// entity_nodes and entity_relationships are INSTANCE-WIDE aggregates: buildGraph
// makes a node for every entity any user's atoms mention and an edge for every
// pair two atoms mention together. Their names are the client and person names
// that /knowledge/entities already hides from colleagues, so on a team server a
// non-admin sees an entity only when
//   - it comes from a knowledge pack (source = 'pack') — shared reference
//     material, installed instance-wide by an admin; or
//   - an atom they may read (own + shared, atomOwnerSql) mentions it.
// Edges are shown only between two visible entities, so the graph never names an
// entity the caller could not already look up. What that leaves is aggregate:
// a node's interaction_count and an edge's strength still count every user's
// mentions. Per-user graphs would need per-user entity tables; not done here.
//
// Solo and admins are unscoped (atomOwnerSql returns nothing to filter by), so
// every statement below is exactly what it was for them.

/** The key a node, a neighbour or an analytics row is matched by. */
const entityKey = (type: string, id: string): string => `${type}:${id}`;

/**
 * WHERE fragment (starts with ` AND `, or empty) keeping the entity named by
 * `typeCol` / `idCol` — literals at every call site, never input — to the ones
 * this scope may see. Exported for the Intelligence Dashboard, which lists the
 * same nodes.
 */
export function entityVisibleSql(scope: SearchScope, typeCol: string, idCol: string): { sql: string; params: string[] } {
  const owner = atomOwnerSql(scope, 'ka_vis.owner_user_id');
  if (!owner.sql) return { sql: '', params: [] };
  return {
    sql: ` AND (EXISTS (SELECT 1 FROM entity_nodes en_vis WHERE en_vis.entity_type = ${typeCol} AND en_vis.entity_id = ${idCol} AND en_vis.source = 'pack')`
      + ` OR EXISTS (SELECT 1 FROM knowledge_entity_refs ker_vis JOIN knowledge_atoms ka_vis ON ka_vis.id = ker_vis.atom_id`
      + ` WHERE ker_vis.entity_type = ${typeCol} AND ker_vis.entity_id = ${idCol}${owner.sql}))`,
    params: owner.params,
  };
}

/**
 * Every entity key the scope may see, or null when nothing is filtered. For the
 * results the graph services compute in memory (neighbours, subgraph, analytics),
 * which come back without a join the predicate above could ride on.
 */
async function visibleEntityKeys(db: DatabaseAdapter, scope: SearchScope): Promise<Set<string> | null> {
  const owner = atomOwnerSql(scope, 'ka.owner_user_id');
  if (!owner.sql) return null;
  const rows = await db.all<{ entity_type: string; entity_id: string }>(
    `SELECT entity_type, entity_id FROM entity_nodes WHERE source = 'pack'
     UNION
     SELECT ker.entity_type, ker.entity_id
       FROM knowledge_entity_refs ker
       JOIN knowledge_atoms ka ON ka.id = ker.atom_id
      WHERE 1=1${owner.sql}`,
    ...owner.params,
  );
  return new Set(rows.map((r) => entityKey(r.entity_type, r.entity_id)));
}

/**
 * For a scoped caller the analytics limit applies AFTER filtering: the service
 * ranks every node (it already computes all of them), the route drops the ones
 * the caller may not see, then takes the top `limit`.
 */
const ALL_RANKED = Number.MAX_SAFE_INTEGER;

/** Keep only the rows whose entity the caller may see; `visible` null = unscoped. */
function onlyVisible<T extends { entity_type: string; entity_id: string }>(rows: T[], visible: Set<string> | null): T[] {
  return visible ? rows.filter((r) => visible.has(entityKey(r.entity_type, r.entity_id))) : rows;
}

export async function createKnowledgeGraphRoutes(db: DatabaseAdapter) {
  const router = express.Router();
  const graphService = await createKnowledgeGraph(db);
  const analytics = await createGraphAnalytics(db);

  // POST /api/knowledge-graph/build — rebuild graph
  router.post('/knowledge-graph/build', async (req, res) => {
    try {
      const { minAtomCount, sinceDays } = req.body;
      const result = await graphService.buildGraph({ minAtomCount, sinceDays });
      res.json(result);
    } catch (error: unknown) {
      res.status(500).json({ error: errMsg(error) });
    }
  });

  // GET /api/knowledge-graph/entities — list top entities
  // Team mode: only the entities this caller may see (see the note at the top).
  router.get('/knowledge-graph/entities', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const visible = entityVisibleSql(searchScopeForRequest(req), 'en.entity_type', 'en.entity_id');
      const entities = visible.sql
        ? await db.all(`
            SELECT en.* FROM entity_nodes en
            WHERE 1=1${visible.sql}
            ORDER BY en.interaction_count DESC, en.last_seen DESC
            LIMIT ?
          `, ...visible.params, limit)
        : await graphService.getTopEntities(limit);
      res.json(entities);
    } catch (error: unknown) {
      res.status(500).json({ error: errMsg(error) });
    }
  });

  // GET /api/knowledge-graph/entities/:type/:id — get entity details + neighbors
  // The unscoped twin of /knowledge/entities/:type/:id until 2026-09-23: it
  // returned the content of every user's atoms that mention the entity. Now the
  // node answers 404 to a caller who may not see it (same answer as a missing
  // one), neighbours are the visible ones, and atoms follow the own + shared rule.
  router.get('/knowledge-graph/entities/:type/:id', async (req, res) => {
    try {
      const { type, id } = req.params;
      const depth = parseInt(req.query.depth as string) || 1;
      const scope = searchScopeForRequest(req);

      const visibleNode = entityVisibleSql(scope, 'en.entity_type', 'en.entity_id');
      const node = await db.get(
        `SELECT en.* FROM entity_nodes en WHERE en.entity_type = ? AND en.entity_id = ?${visibleNode.sql}`,
        type, id, ...visibleNode.params,
      );
      if (!node) {
        return res.status(404).json({ error: 'Entity not found' });
      }

      const visible = await visibleEntityKeys(db, scope);
      const neighbors = (await graphService.getEntityNeighbors(type, id, depth) as Array<{ type: string; id: string; path?: string[] }>)
        .filter((n) => !visible || (visible.has(entityKey(n.type, n.id)) && (n.path ?? []).every((k) => visible.has(k))));

      // Get related atoms — own + shared in team mode, like every atom listing.
      const owner = atomOwnerSql(scope, 'ka.owner_user_id');
      const atoms = await db.all(`
        SELECT ka.id, ka.content, ka.atom_type, ka.category, ka.created_at
        FROM knowledge_atoms ka
        JOIN knowledge_entity_refs ker ON ka.id = ker.atom_id
        WHERE ker.entity_type = ? AND ker.entity_id = ?${owner.sql}
        ORDER BY ka.created_at DESC
        LIMIT 20
      `, type, id, ...owner.params);

      res.json({ node, neighbors, atoms });
    } catch (error: unknown) {
      res.status(500).json({ error: errMsg(error) });
    }
  });

  // GET /api/knowledge-graph/entities/:type/:id/transitive — KG-06 transitive closure
  // ?relationship=requires,implements  &maxDepth=10  &packId=...
  router.get('/knowledge-graph/entities/:type/:id/transitive', async (req, res) => {
    try {
      const { type, id } = req.params;
      const maxDepth = Math.min(parseInt(req.query.maxDepth as string) || 10, 20);
      const packId = req.query.packId as string | undefined;

      const relParam = (req.query.relationship as string) || 'requires';
      const relationshipTypes = relParam
        .split(',')
        .map(r => r.trim())
        .filter(Boolean);

      if (relationshipTypes.length === 0) {
        return res.status(400).json({ error: 'At least one relationship type required (e.g. ?relationship=requires)' });
      }

      let closure = await graphService.getTransitiveClosure(type, id, relationshipTypes, maxDepth, packId);

      // Team mode: a start the caller may not see answers like an unknown one (no
      // nodes), and a reached node counts only if every entity on its path is
      // visible — `path` spells out the intermediate ids. Path elements carry no
      // type, so they are checked against the visible ids of any type.
      const visible = await visibleEntityKeys(db, searchScopeForRequest(req));
      if (visible) {
        const visibleIds = new Set([...visible].map((k) => k.slice(k.indexOf(':') + 1)));
        closure = visible.has(entityKey(type, id))
          ? onlyVisible(closure, visible).filter((n) => n.path.split(' → ').every((p) => visibleIds.has(p)))
          : [];
      }

      res.json({
        start: { entity_type: type, entity_id: id },
        relationship_types: relationshipTypes,
        max_depth: maxDepth,
        total: closure.length,
        nodes: closure,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: errMsg(error) });
    }
  });

  // GET /api/knowledge-graph/entities/:type/:id/subgraph — get subgraph
  router.get('/knowledge-graph/entities/:type/:id/subgraph', async (req, res) => {
    try {
      const { type, id } = req.params;
      const maxDepth = parseInt(req.query.maxDepth as string) || 2;

      const subgraph = await graphService.getEntitySubgraph(type, id, maxDepth);

      // Team mode: visible nodes only, and edges only between two visible ends.
      // A start the caller may not see is an empty graph, as for an unknown id.
      const visible = await visibleEntityKeys(db, searchScopeForRequest(req));
      if (visible) {
        if (!visible.has(entityKey(type, id))) return res.json({ nodes: [], edges: [] });
        // getEntitySubgraph pushes each node lookup's row ARRAY, so a node entry
        // is a list of rows; filter inside it and drop the lists left empty.
        const nodes = (subgraph.nodes as Array<Array<{ entity_type: string; entity_id: string }>>)
          .map((rows) => onlyVisible(rows, visible))
          .filter((rows) => rows.length > 0);
        const edges = (subgraph.edges as Array<{ source_type: string; source_id: string; target_type: string; target_id: string }>)
          .filter((e) => visible.has(entityKey(e.source_type, e.source_id)) && visible.has(entityKey(e.target_type, e.target_id)));
        return res.json({ nodes, edges });
      }
      res.json(subgraph);
    } catch (error: unknown) {
      res.status(500).json({ error: errMsg(error) });
    }
  });

  // POST /api/knowledge-graph/entities/merge — merge entities
  // Admin-only on a team server: a merge deletes a node from the shared graph
  // (pack entities included — the instance-wide reference material the prompt
  // layer reads) and re-points EVERY user's knowledge_entity_refs. It had no
  // guard, so any viewer could rewrite shared knowledge. Solo is unchanged.
  router.post('/knowledge-graph/entities/merge', requireAdminOrSolo, async (req, res) => {
    try {
      const { entityType, fromId, intoId, reason } = req.body;
      const mergedBy = req.user?.username || 'system';

      if (!entityType || !fromId || !intoId) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      await graphService.mergeEntities({ entityType, fromId, intoId, reason, mergedBy });
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: errMsg(error) });
    }
  });

  // GET /api/knowledge-graph/merge-log — get recent merge history
  router.get('/knowledge-graph/merge-log', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      // Team mode: merges into an entity the caller may see (the merged-away id
      // is an alias of it). Other merges name entities from colleagues' atoms.
      const visible = entityVisibleSql(searchScopeForRequest(req), 'eml.entity_type', 'eml.merged_into');
      const log = await db.all(`
        SELECT eml.* FROM entity_merge_log eml
        WHERE 1=1${visible.sql}
        ORDER BY eml.merged_at DESC
        LIMIT ?
      `, ...visible.params, limit);
      res.json(log);
    } catch (error: unknown) {
      res.status(500).json({ error: errMsg(error) });
    }
  });

  // ===== ANALYTICS ENDPOINTS =====

  // GET /api/knowledge-graph/analytics/stats — get graph statistics
  router.get('/knowledge-graph/analytics/stats', async (req, res) => {
    try {
      const stats = await analytics.getGraphStats();
      res.json(stats);
    } catch (error: unknown) {
      res.status(500).json({ error: errMsg(error) });
    }
  });

  // GET /api/knowledge-graph/analytics/degree-centrality — get degree centrality rankings
  router.get('/knowledge-graph/analytics/degree-centrality', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const visible = await visibleEntityKeys(db, searchScopeForRequest(req));
      const results = visible
        ? onlyVisible(await analytics.calculateDegreeCentrality(ALL_RANKED), visible).slice(0, limit)
        : await analytics.calculateDegreeCentrality(limit);
      res.json(results);
    } catch (error: unknown) {
      res.status(500).json({ error: errMsg(error) });
    }
  });

  // GET /api/knowledge-graph/analytics/betweenness-centrality — get betweenness centrality
  router.get('/knowledge-graph/analytics/betweenness-centrality', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const visible = await visibleEntityKeys(db, searchScopeForRequest(req));
      const results = visible
        ? onlyVisible(await analytics.calculateBetweennessCentrality(ALL_RANKED), visible).slice(0, limit)
        : await analytics.calculateBetweennessCentrality(limit);
      res.json(results);
    } catch (error: unknown) {
      res.status(500).json({ error: errMsg(error) });
    }
  });

  // GET /api/knowledge-graph/analytics/pagerank — get PageRank rankings
  router.get('/knowledge-graph/analytics/pagerank', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const iterations = parseInt(req.query.iterations as string) || 20;
      const visible = await visibleEntityKeys(db, searchScopeForRequest(req));
      const results = visible
        ? onlyVisible(await analytics.calculatePageRank(iterations, 0.85, ALL_RANKED), visible).slice(0, limit)
        : await analytics.calculatePageRank(iterations, 0.85, limit);
      res.json(results);
    } catch (error: unknown) {
      res.status(500).json({ error: errMsg(error) });
    }
  });

  // GET /api/knowledge-graph/analytics/communities — detect communities
  router.get('/knowledge-graph/analytics/communities', async (req, res) => {
    try {
      const iterations = parseInt(req.query.iterations as string) || 10;
      const communities = await analytics.detectCommunities(iterations);
      const visible = await visibleEntityKeys(db, searchScopeForRequest(req));

      // Convert Map to array format. Team mode: visible members only, and a
      // community with none left is not listed.
      const result = Array.from(communities.entries())
        .map(([id, members]) => {
          const shown = onlyVisible(members, visible);
          return { id, size: shown.length, members: shown };
        })
        .filter((c) => c.size > 0);

      res.json(result);
    } catch (error: unknown) {
      res.status(500).json({ error: errMsg(error) });
    }
  });

  // GET /api/knowledge-graph/analytics/shortest-path — find shortest path between two entities
  router.get('/knowledge-graph/analytics/shortest-path', async (req, res) => {
    try {
      const { sourceType, sourceId, targetType, targetId } = req.query;

      if (!sourceType || !sourceId || !targetType || !targetId) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      const path = await analytics.findShortestPath(
        sourceType as string,
        sourceId as string,
        targetType as string,
        targetId as string
      );

      // Team mode: a path through (or to) an entity the caller may not see would
      // name it, so it is answered exactly like no path at all.
      const visible = await visibleEntityKeys(db, searchScopeForRequest(req));
      if (!path || onlyVisible(path, visible).length !== path.length) {
        return res.status(404).json({ error: 'No path found between entities' });
      }

      res.json({ path, length: path.length - 1 });
    } catch (error: unknown) {
      res.status(500).json({ error: errMsg(error) });
    }
  });

  // GET /api/knowledge-graph/export — export graph in various formats
  router.get('/knowledge-graph/export', async (req, res) => {
    try {
      const format = (req.query.format as string) || 'json';

      // Get all nodes and relationships — in team mode, the ones this caller may
      // see: visible nodes, and edges whose two ends are both visible.
      const scope = searchScopeForRequest(req);
      const visibleNode = entityVisibleSql(scope, 'en.entity_type', 'en.entity_id');
      const nodes = await db.all(`SELECT en.* FROM entity_nodes en WHERE 1=1${visibleNode.sql}`, ...visibleNode.params);
      const visibleSource = entityVisibleSql(scope, 'er.source_type', 'er.source_id');
      const visibleTarget = entityVisibleSql(scope, 'er.target_type', 'er.target_id');
      const relationships = await db.all(
        `SELECT er.* FROM entity_relationships er WHERE 1=1${visibleSource.sql}${visibleTarget.sql}`,
        ...visibleSource.params, ...visibleTarget.params,
      );

      if (format === 'graphml') {
        // GraphML format
        let graphml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        graphml += '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">\n';
        graphml += '  <key id="entity_type" for="node" attr.name="entity_type" attr.type="string"/>\n';
        graphml += '  <key id="canonical_name" for="node" attr.name="canonical_name" attr.type="string"/>\n';
        graphml += '  <key id="interaction_count" for="node" attr.name="interaction_count" attr.type="int"/>\n';
        graphml += '  <key id="relationship_type" for="edge" attr.name="relationship_type" attr.type="string"/>\n';
        graphml += '  <key id="strength" for="edge" attr.name="strength" attr.type="double"/>\n';
        graphml += '  <graph id="KnowledgeGraph" edgedefault="undirected">\n';

        // Nodes
        for (const node of nodes as any[]) {
          graphml += `    <node id="${node.id}">\n`;
          graphml += `      <data key="entity_type">${node.entity_type}</data>\n`;
          graphml += `      <data key="canonical_name">${node.canonical_name}</data>\n`;
          graphml += `      <data key="interaction_count">${node.interaction_count}</data>\n`;
          graphml += `    </node>\n`;
        }

        // Edges
        for (const rel of relationships as any[]) {
          const sourceId = `en_${rel.source_type}_${rel.source_id}`;
          const targetId = `en_${rel.target_type}_${rel.target_id}`;
          graphml += `    <edge id="${rel.id}" source="${sourceId}" target="${targetId}">\n`;
          graphml += `      <data key="relationship_type">${rel.relationship_type}</data>\n`;
          graphml += `      <data key="strength">${rel.strength}</data>\n`;
          graphml += `    </edge>\n`;
        }

        graphml += '  </graph>\n';
        graphml += '</graphml>';

        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', `attachment; filename="knowledge-graph-${Date.now()}.graphml"`);
        res.send(graphml);

      } else if (format === 'csv-nodes') {
        // CSV export for nodes
        const headers = ['id', 'entity_type', 'entity_id', 'canonical_name', 'interaction_count', 'first_seen', 'last_seen'];
        const csvRows = [headers.join(',')];

        for (const node of nodes as any[]) {
          const row = headers.map(h => {
            const val = node[h];
            if (val === null || val === undefined) return '';
            return `"${String(val).replace(/"/g, '""')}"`;
          });
          csvRows.push(row.join(','));
        }

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="knowledge-graph-nodes-${Date.now()}.csv"`);
        res.send(csvRows.join('\n'));

      } else if (format === 'csv-edges') {
        // CSV export for edges
        const headers = ['id', 'source_type', 'source_id', 'target_type', 'target_id', 'relationship_type', 'strength', 'observation_count'];
        const csvRows = [headers.join(',')];

        for (const rel of relationships as any[]) {
          const row = headers.map(h => {
            const val = rel[h];
            if (val === null || val === undefined) return '';
            return `"${String(val).replace(/"/g, '""')}"`;
          });
          csvRows.push(row.join(','));
        }

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="knowledge-graph-edges-${Date.now()}.csv"`);
        res.send(csvRows.join('\n'));

      } else {
        // JSON export (default)
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="knowledge-graph-${Date.now()}.json"`);
        res.json({
          nodes,
          relationships,
          exported_at: new Date().toISOString(),
          node_count: nodes.length,
          relationship_count: relationships.length,
        });
      }
    } catch (error: unknown) {
      console.error('[knowledge-graph/export]', error);
      res.status(500).json({ error: errMsg(error) });
    }
  });

  return router;
}
