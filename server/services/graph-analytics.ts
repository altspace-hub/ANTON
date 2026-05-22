/**
 * Graph Analytics Service
 *
 * Provides graph analysis algorithms for the knowledge graph:
 * - Centrality measures (degree, betweenness, closeness, PageRank)
 * - Community detection (label propagation)
 * - Path finding (shortest path, all paths)
 */

import type { DatabaseAdapter } from '../db/database.js';

interface GraphNode {
  type: string;
  id: string;
  key: string;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

export async function createGraphAnalytics(db: DatabaseAdapter) {

  /**
   * Build in-memory graph representation for analysis
   */
  async function buildGraphRepresentation(): Promise<{ nodes: Map<string, GraphNode>; edges: GraphEdge[]; adjacency: Map<string, Set<string>> }> {
    const nodes = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];
    const adjacency = new Map<string, Set<string>>();

    // Load all entity nodes
    const entityNodes = await db.all('SELECT entity_type, entity_id FROM entity_nodes') as Array<{ entity_type: string; entity_id: string }>;
    for (const node of entityNodes) {
      const key = `${node.entity_type}:${node.entity_id}`;
      nodes.set(key, { type: node.entity_type, id: node.entity_id, key });
      adjacency.set(key, new Set());
    }

    // Load all relationships
    const relationships = await db.all('SELECT source_type, source_id, target_type, target_id, strength FROM entity_relationships') as any[];
    for (const rel of relationships) {
      const sourceKey = `${rel.source_type}:${rel.source_id}`;
      const targetKey = `${rel.target_type}:${rel.target_id}`;
      if (nodes.has(sourceKey) && nodes.has(targetKey)) {
        edges.push({ source: sourceKey, target: targetKey, weight: rel.strength || 1 });
        adjacency.get(sourceKey)!.add(targetKey);
        adjacency.get(targetKey)!.add(sourceKey); // Treat as undirected for most algorithms
      }
    }

    return { nodes, edges, adjacency };
  }

  /**
   * Calculate degree centrality (number of connections)
   */
  async function calculateDegreeCentrality(limit = 20): Promise<Array<{ entity_type: string; entity_id: string; degree: number; normalized: number }>> {
    const { nodes, adjacency } = await buildGraphRepresentation();
    const results: Array<{ entity_type: string; entity_id: string; degree: number; normalized: number }> = [];
    const maxDegree = Math.max(...Array.from(adjacency.values()).map(s => s.size), 1);

    for (const [key, neighbors] of adjacency.entries()) {
      const node = nodes.get(key)!;
      results.push({
        entity_type: node.type,
        entity_id: node.id,
        degree: neighbors.size,
        normalized: neighbors.size / maxDegree,
      });
    }

    return results.sort((a, b) => b.degree - a.degree).slice(0, limit);
  }

  /**
   * Calculate betweenness centrality (measure of bridge nodes)
   */
  async function calculateBetweennessCentrality(limit = 20): Promise<Array<{ entity_type: string; entity_id: string; betweenness: number; normalized: number }>> {
    const { nodes, adjacency } = await buildGraphRepresentation();
    const betweenness = new Map<string, number>();

    // Initialize all nodes with 0
    for (const key of nodes.keys()) {
      betweenness.set(key, 0);
    }

    // For each node, run BFS to all other nodes and accumulate shortest path counts
    for (const source of nodes.keys()) {
      const distance = new Map<string, number>();
      const pathCount = new Map<string, number>();
      const predecessors = new Map<string, Set<string>>();
      const queue: string[] = [source];

      distance.set(source, 0);
      pathCount.set(source, 1);

      while (queue.length > 0) {
        const current = queue.shift()!;
        const currentDist = distance.get(current)!;

        for (const neighbor of adjacency.get(current) || []) {
          if (!distance.has(neighbor)) {
            distance.set(neighbor, currentDist + 1);
            queue.push(neighbor);
          }

          if (distance.get(neighbor) === currentDist + 1) {
            pathCount.set(neighbor, (pathCount.get(neighbor) || 0) + pathCount.get(current)!);
            if (!predecessors.has(neighbor)) predecessors.set(neighbor, new Set());
            predecessors.get(neighbor)!.add(current);
          }
        }
      }

      // Accumulate betweenness
      const delta = new Map<string, number>();
      for (const key of nodes.keys()) {
        delta.set(key, 0);
      }

      const orderedNodes = Array.from(distance.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([key]) => key);

      for (const w of orderedNodes) {
        if (w === source) continue;
        for (const v of predecessors.get(w) || []) {
          const factor = (pathCount.get(v)! / pathCount.get(w)!) * (1 + delta.get(w)!);
          delta.set(v, delta.get(v)! + factor);
        }
        if (w !== source) {
          betweenness.set(w, betweenness.get(w)! + delta.get(w)!);
        }
      }
    }

    // Normalize
    const maxBetweenness = Math.max(...Array.from(betweenness.values()), 1);

    const results: Array<{ entity_type: string; entity_id: string; betweenness: number; normalized: number }> = [];
    for (const [key, value] of betweenness.entries()) {
      const node = nodes.get(key)!;
      results.push({
        entity_type: node.type,
        entity_id: node.id,
        betweenness: value,
        normalized: value / maxBetweenness,
      });
    }

    return results.sort((a, b) => b.betweenness - a.betweenness).slice(0, limit);
  }

  /**
   * Calculate PageRank (iterative algorithm)
   */
  async function calculatePageRank(iterations = 20, dampingFactor = 0.85, limit = 20): Promise<Array<{ entity_type: string; entity_id: string; pagerank: number }>> {
    const { nodes, adjacency } = await buildGraphRepresentation();
    const nodeCount = nodes.size;
    if (nodeCount === 0) return [];

    const pagerank = new Map<string, number>();
    const newPagerank = new Map<string, number>();

    // Initialize
    for (const key of nodes.keys()) {
      pagerank.set(key, 1 / nodeCount);
    }

    // Iterate
    for (let iter = 0; iter < iterations; iter++) {
      for (const key of nodes.keys()) {
        let sum = 0;
        for (const neighbor of adjacency.get(key) || []) {
          const outDegree = adjacency.get(neighbor)!.size;
          if (outDegree > 0) {
            sum += pagerank.get(neighbor)! / outDegree;
          }
        }
        newPagerank.set(key, (1 - dampingFactor) / nodeCount + dampingFactor * sum);
      }
      for (const [key, value] of newPagerank.entries()) {
        pagerank.set(key, value);
      }
    }

    const results: Array<{ entity_type: string; entity_id: string; pagerank: number }> = [];
    for (const [key, value] of pagerank.entries()) {
      const node = nodes.get(key)!;
      results.push({ entity_type: node.type, entity_id: node.id, pagerank: value });
    }

    return results.sort((a, b) => b.pagerank - a.pagerank).slice(0, limit);
  }

  /**
   * Find shortest path between two entities
   */
  async function findShortestPath(
    sourceType: string,
    sourceId: string,
    targetType: string,
    targetId: string
  ): Promise<Array<{ entity_type: string; entity_id: string }> | null> {
    const { nodes, adjacency } = await buildGraphRepresentation();
    const sourceKey = `${sourceType}:${sourceId}`;
    const targetKey = `${targetType}:${targetId}`;

    if (!nodes.has(sourceKey) || !nodes.has(targetKey)) return null;

    const queue: Array<{ key: string; path: string[] }> = [{ key: sourceKey, path: [sourceKey] }];
    const visited = new Set<string>([sourceKey]);

    while (queue.length > 0) {
      const { key: current, path } = queue.shift()!;

      if (current === targetKey) {
        return path.map(k => {
          const node = nodes.get(k)!;
          return { entity_type: node.type, entity_id: node.id };
        });
      }

      for (const neighbor of adjacency.get(current) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push({ key: neighbor, path: [...path, neighbor] });
        }
      }
    }

    return null; // No path found
  }

  /**
   * Detect communities using label propagation algorithm
   */
  async function detectCommunities(iterations = 10): Promise<Map<number, Array<{ entity_type: string; entity_id: string }>>> {
    const { nodes, adjacency } = await buildGraphRepresentation();
    const labels = new Map<string, number>();
    let labelId = 0;

    // Initialize each node with unique label
    for (const key of nodes.keys()) {
      labels.set(key, labelId++);
    }

    // Iterate label propagation
    for (let iter = 0; iter < iterations; iter++) {
      const nodeKeys = Array.from(nodes.keys());
      // Shuffle for randomness
      for (let i = nodeKeys.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [nodeKeys[i], nodeKeys[j]] = [nodeKeys[j], nodeKeys[i]];
      }

      for (const key of nodeKeys) {
        const neighbors = adjacency.get(key) || new Set();
        if (neighbors.size === 0) continue;

        // Count neighbor labels
        const labelCounts = new Map<number, number>();
        for (const neighbor of neighbors) {
          const label = labels.get(neighbor)!;
          labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
        }

        // Assign most frequent label
        let maxCount = 0;
        let maxLabel = labels.get(key)!;
        for (const [label, count] of labelCounts.entries()) {
          if (count > maxCount) {
            maxCount = count;
            maxLabel = label;
          }
        }
        labels.set(key, maxLabel);
      }
    }

    // Group nodes by community label
    const communities = new Map<number, Array<{ entity_type: string; entity_id: string }>>();
    for (const [key, label] of labels.entries()) {
      if (!communities.has(label)) communities.set(label, []);
      const node = nodes.get(key)!;
      communities.get(label)!.push({ entity_type: node.type, entity_id: node.id });
    }

    // Filter out single-node communities
    for (const [label, members] of communities.entries()) {
      if (members.length < 2) communities.delete(label);
    }

    return communities;
  }

  /**
   * Get graph statistics
   */
  async function getGraphStats() {
    const { nodes, edges } = await buildGraphRepresentation();
    const nodeCount = nodes.size;
    const edgeCount = edges.length;
    const avgDegree = nodeCount > 0 ? (2 * edgeCount) / nodeCount : 0;

    // Count nodes by type
    const nodesByType: Record<string, number> = {};
    for (const node of nodes.values()) {
      nodesByType[node.type] = (nodesByType[node.type] || 0) + 1;
    }

    return {
      nodeCount,
      edgeCount,
      avgDegree,
      nodesByType,
    };
  }

  return {
    calculateDegreeCentrality,
    calculateBetweennessCentrality,
    calculatePageRank,
    findShortestPath,
    detectCommunities,
    getGraphStats,
  };
}

export type GraphAnalytics = ReturnType<typeof createGraphAnalytics>;
