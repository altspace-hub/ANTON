import express from 'express';
import type { DatabaseAdapter } from '../db/database.js';

import { createKnowledgeGraph } from '../services/knowledge-graph.js';
import { createGraphAnalytics } from '../services/graph-analytics.js';

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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/knowledge-graph/entities — list top entities
  router.get('/knowledge-graph/entities', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const entities = await graphService.getTopEntities(limit);
      res.json(entities);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/knowledge-graph/entities/:type/:id — get entity details + neighbors
  router.get('/knowledge-graph/entities/:type/:id', async (req, res) => {
    try {
      const { type, id } = req.params;
      const depth = parseInt(req.query.depth as string) || 1;

      const node = await db.get('SELECT * FROM entity_nodes WHERE entity_type = ? AND entity_id = ?', type, id);
      if (!node) {
        return res.status(404).json({ error: 'Entity not found' });
      }

      const neighbors = await graphService.getEntityNeighbors(type, id, depth);

      // Get related atoms
      const atoms = await db.all(`
        SELECT ka.id, ka.content, ka.atom_type, ka.category, ka.created_at
        FROM knowledge_atoms ka
        JOIN knowledge_entity_refs ker ON ka.id = ker.atom_id
        WHERE ker.entity_type = ? AND ker.entity_id = ?
        ORDER BY ka.created_at DESC
        LIMIT 20
      `, type, id);

      res.json({ node, neighbors, atoms });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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

      const closure = await graphService.getTransitiveClosure(type, id, relationshipTypes, maxDepth, packId);

      res.json({
        start: { entity_type: type, entity_id: id },
        relationship_types: relationshipTypes,
        max_depth: maxDepth,
        total: closure.length,
        nodes: closure,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/knowledge-graph/entities/:type/:id/subgraph — get subgraph
  router.get('/knowledge-graph/entities/:type/:id/subgraph', async (req, res) => {
    try {
      const { type, id } = req.params;
      const maxDepth = parseInt(req.query.maxDepth as string) || 2;

      const subgraph = await graphService.getEntitySubgraph(type, id, maxDepth);
      res.json(subgraph);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/knowledge-graph/entities/merge — merge entities
  router.post('/knowledge-graph/entities/merge', async (req, res) => {
    try {
      const { entityType, fromId, intoId, reason } = req.body;
      const mergedBy = (req as any).user?.username || 'system';

      if (!entityType || !fromId || !intoId) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      await graphService.mergeEntities({ entityType, fromId, intoId, reason, mergedBy });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/knowledge-graph/merge-log — get recent merge history
  router.get('/knowledge-graph/merge-log', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const log = await db.all(`
        SELECT * FROM entity_merge_log
        ORDER BY merged_at DESC
        LIMIT ?
      `, limit);
      res.json(log);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ===== ANALYTICS ENDPOINTS =====

  // GET /api/knowledge-graph/analytics/stats — get graph statistics
  router.get('/knowledge-graph/analytics/stats', async (req, res) => {
    try {
      const stats = analytics.getGraphStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/knowledge-graph/analytics/degree-centrality — get degree centrality rankings
  router.get('/knowledge-graph/analytics/degree-centrality', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const results = analytics.calculateDegreeCentrality(limit);
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/knowledge-graph/analytics/betweenness-centrality — get betweenness centrality
  router.get('/knowledge-graph/analytics/betweenness-centrality', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const results = analytics.calculateBetweennessCentrality(limit);
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/knowledge-graph/analytics/pagerank — get PageRank rankings
  router.get('/knowledge-graph/analytics/pagerank', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const iterations = parseInt(req.query.iterations as string) || 20;
      const results = analytics.calculatePageRank(iterations, 0.85, limit);
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/knowledge-graph/analytics/communities — detect communities
  router.get('/knowledge-graph/analytics/communities', async (req, res) => {
    try {
      const iterations = parseInt(req.query.iterations as string) || 10;
      const communities = analytics.detectCommunities(iterations);

      // Convert Map to array format
      const result = Array.from(communities.entries()).map(([id, members]) => ({
        id,
        size: members.length,
        members,
      }));

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/knowledge-graph/analytics/shortest-path — find shortest path between two entities
  router.get('/knowledge-graph/analytics/shortest-path', async (req, res) => {
    try {
      const { sourceType, sourceId, targetType, targetId } = req.query;

      if (!sourceType || !sourceId || !targetType || !targetId) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      const path = analytics.findShortestPath(
        sourceType as string,
        sourceId as string,
        targetType as string,
        targetId as string
      );

      if (!path) {
        return res.status(404).json({ error: 'No path found between entities' });
      }

      res.json({ path, length: path.length - 1 });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/knowledge-graph/export — export graph in various formats
  router.get('/knowledge-graph/export', async (req, res) => {
    try {
      const format = (req.query.format as string) || 'json';

      // Get all nodes and relationships

      const relationships = await db.all('SELECT * FROM entity_relationships');

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
    } catch (error: any) {
      console.error('[knowledge-graph/export]', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
