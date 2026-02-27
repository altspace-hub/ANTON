# Layer 3: Knowledge Graph — Implementation Summary

## Overview

Layer 3 has been successfully implemented for the openEXPERT Cross-Workflow Intelligence system. This layer builds a **knowledge graph** on top of Layer 2's knowledge atoms by resolving entity aliases and creating a navigable relationship graph.

## What Was Built

### 1. Database Schema (server/db/init.ts)

Added three new tables:

#### `entity_nodes`
- Stores canonical entity nodes with metadata
- Fields: id, entity_type, entity_id, canonical_name, first_seen, last_seen, interaction_count, related_areas, metadata
- Unique constraint on (entity_type, entity_id)

#### `entity_relationships`
- Stores relationships between entities
- Fields: id, source_type, source_id, target_type, target_id, relationship_type, strength, observation_count, supporting_atoms
- Tracks co-occurrence patterns from knowledge atoms
- Relationship strength calculated as log(observation_count + 1)

#### `entity_merge_log`
- Audit trail for entity merges (alias resolution)
- Fields: id, entity_type, merged_from, merged_into, merge_reason, merged_at, merged_by

Indexes created for optimal query performance on entity lookups and relationship traversal.

### 2. Backend Service (server/services/knowledge-graph.ts)

Core graph operations service with five main functions:

#### `buildGraph({ minAtomCount, sinceDays })`
- Builds entity nodes from `knowledge_entity_refs`
- Detects co-occurrence relationships between entities
- Calculates relationship strength based on frequency
- Returns: nodesCreated, relationshipsCreated, totalNodes, totalRelationships

#### `getEntityNeighbors(entityType, entityId, depth)`
- Breadth-first traversal to find connected entities
- Returns neighbors at specified depth with path tracking
- Includes relationship metadata (type, strength, observation_count)

#### `getEntitySubgraph(entityType, entityId, maxDepth)`
- Extracts complete subgraph centered on an entity
- Returns { nodes, edges } for visualization
- Recursive traversal with depth limit

#### `mergeEntities({ entityType, fromId, intoId, reason, mergedBy })`
- Merges duplicate entities (alias resolution)
- Updates all references in knowledge_entity_refs
- Creates alias mapping in entity_aliases
- Logs merge in entity_merge_log
- Removes old entity node

#### `getTopEntities(limit)`
- Returns most-referenced entities
- Sorted by interaction_count DESC, last_seen DESC

### 3. API Routes (server/routes/knowledge-graph.ts)

RESTful API endpoints:

- **POST /api/knowledge-graph/build** — Rebuild graph with optional filters
- **GET /api/knowledge-graph/entities** — List top entities (default 20)
- **GET /api/knowledge-graph/entities/:type/:id** — Entity details + neighbors + related atoms
- **GET /api/knowledge-graph/entities/:type/:id/subgraph** — Get subgraph for visualization
- **POST /api/knowledge-graph/entities/merge** — Merge duplicate entities
- **GET /api/knowledge-graph/merge-log** — Recent merge history

All routes integrated into server/index.ts.

### 4. Frontend Components

#### KnowledgeGraphViewer (src/features/intelligence/KnowledgeGraphViewer.tsx)
- Custom D3-based force-directed graph visualization
- Canvas rendering for performance
- Force simulation:
  - Charge force (node repulsion)
  - Link force (edge attraction)
  - Center force (layout centering)
- Interactive features:
  - Zoom (mouse wheel)
  - Pan (drag canvas)
  - Node selection (click nodes)
  - Reset view button
- Visual encoding:
  - Node size = log(interaction_count)
  - Edge thickness = relationship strength
  - Color = entity type
  - Center node highlighted with teal ring
- Legend showing entity type colors

#### KnowledgeGraphPage (src/pages/KnowledgeGraphPage.tsx)
Full-featured graph explorer with three-panel layout:

**Left Panel:**
- Search entities by name or type
- Top 20 entities by interaction count
- Recent merge log (last 10 merges)
- Entity selection triggers graph update

**Center Panel:**
- KnowledgeGraphViewer component
- Depth selector (1-3 hops)
- Zoom controls
- Canvas with force-directed layout

**Right Panel:**
- Selected entity details:
  - Type, interaction count
  - First seen, last seen dates
- Connected entities list:
  - Relationship type
  - Strength score
  - Observation count
- Related knowledge atoms:
  - Atom content (first 5)
  - Category and date

**Top Actions:**
- "Rebuild Graph" button with progress indicator
- Triggers full graph rebuild from knowledge atoms

### 5. Navigation

- Added `/graph` route to App.tsx (lazy-loaded)
- Added "Knowledge Graph" nav link in Sidebar.tsx
- Icon: Network icon from Lucide
- Positioned after "Knowledge" link in sidebar

## How It Works

### Graph Building Flow

1. User clicks "Rebuild Graph" or workflow extracts entities
2. System queries `knowledge_entity_refs` for all entity mentions
3. Creates entity_nodes for each unique (entity_type, entity_id)
4. Detects co-occurrences: entities mentioned in same knowledge atoms
5. Creates entity_relationships with strength = log(cooccurrence_count + 1)
6. Updates existing relationships (increments observation_count)

### Visualization Flow

1. User selects entity from top entities list
2. Frontend fetches subgraph via `/api/knowledge-graph/entities/:type/:id/subgraph?maxDepth=2`
3. Backend performs recursive traversal with depth limit
4. Returns { nodes[], edges[] }
5. Frontend initializes force-directed layout simulation
6. Renders on canvas with:
   - 300 iterations of physics simulation
   - Node repulsion (charge force)
   - Edge attraction (link force)
   - Center gravity
7. User can zoom, pan, click nodes to explore

### Entity Merging Flow

1. Admin identifies duplicate entities (e.g., "Nordea Bank" vs "Nordea")
2. Calls POST /api/knowledge-graph/entities/merge with { entityType, fromId, intoId, reason }
3. Backend:
   - Updates all knowledge_entity_refs to use canonical ID
   - Creates alias in entity_aliases
   - Logs merge in entity_merge_log
   - Deletes old entity_node
4. Graph automatically reflects merged entity on next rebuild

## Technical Decisions

### Why Custom Canvas Renderer (Not react-force-graph)?

- **Dependency control:** No additional npm package required
- **Performance:** Canvas rendering for large graphs (1000+ nodes)
- **Customization:** Full control over physics, colors, interactions
- **Learning:** Demonstrates D3 force simulation principles

### Relationship Strength Formula

```typescript
strength = Math.log(cooccurrence_count + 1)
```

- Logarithmic scaling prevents a few high-frequency pairs from dominating
- +1 prevents log(0) for single observations
- Strength used for edge thickness in visualization

### Graph Rebuild Strategy

- **Manual trigger:** User initiates rebuild via button
- **Why not automatic?** Large graph builds can be expensive (thousands of entities)
- **Future enhancement:** Incremental updates (add new entities/relationships without full rebuild)

## Database Performance

Indexes created for optimal performance:

- `idx_entity_nodes_type` — Fast entity lookup by type and recent activity
- `idx_entity_relationships_source` — Fast neighbor queries (outgoing edges)
- `idx_entity_relationships_target` — Fast neighbor queries (incoming edges)
- `idx_entity_relationships_type` — Filter by relationship type

Expected performance:
- Entity lookup: O(1) with index
- Neighbor query (depth=1): O(E) where E = edges per node (typically 5-20)
- Subgraph query (depth=2): O(V + E) where V = nodes, E = edges in subgraph (typically 20-100 nodes)

## Entity Types

Currently extracted from knowledge atoms (Layer 2):
- `regulation` — EU regulations, directives, guidelines
- `institution` — Banks, regulators, authorities
- `topic` — AML, sanctions, KYC, etc.
- `person` — Names mentioned in workflows
- `document` — Document references

Colors assigned in `ENTITY_TYPE_COLORS` constant.

## API Response Examples

### Build Graph

**Request:** `POST /api/knowledge-graph/build`
```json
{ "minAtomCount": 1, "sinceDays": 365 }
```

**Response:**
```json
{
  "nodesCreated": 47,
  "relationshipsCreated": 89,
  "totalNodes": 52,
  "totalRelationships": 95
}
```

### Get Entity Details

**Request:** `GET /api/knowledge-graph/entities/regulation/AMLR?depth=1`

**Response:**
```json
{
  "node": {
    "id": "en_regulation_AMLR",
    "entity_type": "regulation",
    "entity_id": "AMLR",
    "canonical_name": "AMLR Regulation 2024/1624",
    "interaction_count": 34,
    "first_seen": "2025-01-15T10:23:00Z",
    "last_seen": "2025-02-19T14:30:00Z"
  },
  "neighbors": [
    {
      "type": "institution",
      "id": "EBA",
      "relationship_type": "mentioned_with",
      "strength": 2.3,
      "observation_count": 9,
      "direction": "outgoing",
      "depth": 1,
      "path": ["regulation:AMLR"]
    }
  ],
  "atoms": [
    {
      "id": "ka_abc123",
      "content": "AMLR Article 8 requires enhanced due diligence for high-risk third countries...",
      "atom_type": "requirement",
      "category": "compliance_gap",
      "created_at": "2025-02-19T14:30:00Z"
    }
  ]
}
```

### Get Subgraph

**Request:** `GET /api/knowledge-graph/entities/regulation/AMLR/subgraph?maxDepth=2`

**Response:**
```json
{
  "nodes": [
    { "id": "en_regulation_AMLR", "entity_type": "regulation", "entity_id": "AMLR", "canonical_name": "AMLR Regulation 2024/1624", "interaction_count": 34 },
    { "id": "en_institution_EBA", "entity_type": "institution", "entity_id": "EBA", "canonical_name": "European Banking Authority", "interaction_count": 28 }
  ],
  "edges": [
    {
      "id": "er_12345",
      "source_type": "regulation",
      "source_id": "AMLR",
      "target_type": "institution",
      "target_id": "EBA",
      "relationship_type": "mentioned_with",
      "strength": 2.3,
      "observation_count": 9
    }
  ]
}
```

## Future Enhancements

### Relationship Types
Current: Only "mentioned_with" (co-occurrence)
Future:
- `precedes` — Temporal precedence
- `caused` — Causal relationships
- `requires` — Dependencies
- `contradicts` — Contradictions detected
- `supports` — Supporting relationships

Detected via NLP analysis of knowledge atoms.

### Incremental Updates
- Real-time graph updates when new knowledge atoms created
- Webhook on atom creation → update entity_nodes and relationships
- No full rebuild needed

### Entity Clustering
- Detect communities in the graph
- Group related entities (e.g., "Sanctions cluster", "AMLR cluster")
- Visualize clusters with different colors

### Temporal Graph
- Track entity relationships over time
- Animate graph evolution
- Identify emerging vs. declining relationships

### Graph Analytics
- PageRank: Most central/influential entities
- Shortest path: How are two entities connected?
- Bridge detection: Entities that connect otherwise separate clusters

## Testing Checklist

- [x] Database schema created successfully
- [x] All indexes present
- [x] Build graph endpoint works
- [x] Get entities endpoint works
- [x] Get entity details endpoint works
- [x] Get subgraph endpoint works
- [x] Merge entities endpoint works
- [x] Merge log endpoint works
- [x] Frontend KnowledgeGraphViewer renders
- [x] Force-directed layout simulation runs
- [x] Zoom/pan controls work
- [x] Node selection triggers callback
- [x] KnowledgeGraphPage three-panel layout renders
- [x] Entity search filters list
- [x] Top entities fetch on load
- [x] Selected entity details fetch
- [x] Rebuild graph button works
- [x] Merge log displays
- [x] Navigation link in sidebar
- [x] Route registered in App.tsx
- [x] TypeScript compiles without errors in new files

## Files Created

1. `server/db/init.ts` — Modified (added 3 tables)
2. `server/services/knowledge-graph.ts` — NEW
3. `server/routes/knowledge-graph.ts` — NEW
4. `server/index.ts` — Modified (registered routes)
5. `src/features/intelligence/KnowledgeGraphViewer.tsx` — NEW
6. `src/pages/KnowledgeGraphPage.tsx` — NEW
7. `src/App.tsx` — Modified (added route)
8. `src/components/layout/Sidebar.tsx` — Modified (added nav link)
9. `LAYER_3_IMPLEMENTATION.md` — NEW (this file)

## Integration with Layers 1-2

**Layer 1 (workflow_outputs, checkpoint_decisions):**
- Provides raw workflow data

**Layer 2 (knowledge_atoms, knowledge_entity_refs):**
- Extracts entities from workflow outputs
- Creates entity references linked to atoms

**Layer 3 (entity_nodes, entity_relationships):**
- Resolves entity aliases
- Builds relationship graph from co-occurrence
- Enables graph traversal queries

**Data flow:**
```
Workflow Output (Layer 1)
  → Knowledge Atom + Entity Refs (Layer 2)
    → Entity Node (Layer 3)
      → Entity Relationship (Layer 3, via co-occurrence)
        → Graph Visualization (Frontend)
```

## Summary

Layer 3: Knowledge Graph is **complete and functional**. The system can now:

1. Build a knowledge graph from entity co-occurrence patterns
2. Resolve entity aliases via manual merging
3. Navigate entity relationships via breadth-first search
4. Visualize entity networks with force-directed layout
5. Query entity details, neighbors, and related knowledge atoms
6. Track merge history for audit purposes

The implementation follows the specified architecture, uses SQLite for all storage, and provides a clean REST API with a professional React UI matching the Advisense design system.

**Next:** Layer 4 (Pattern Detection) will build on this graph to detect temporal correlations, entity convergence, cascades, and anomalies.
