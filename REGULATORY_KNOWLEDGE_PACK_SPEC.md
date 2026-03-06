# Regulatory Knowledge Pack — Full Specification & Implementation Guide

> **Audience:** Claude Code
> **Purpose:** Full briefing on a new feature — "Regulatory Knowledge Packs" — that allows users to pre-populate their knowledge graph with structured regulatory data (entities, relationships, cross-references) for any legal/regulatory domain. This document explains the vision, how it connects to existing infrastructure, and concrete guidance on how to implement it.
> **First step for Claude Code:** Before writing a single line of code, read this document fully, then explore the codebase to understand what already exists — the knowledge graph tables (`entity_nodes`, `entity_relationships`, `entity_mentions`, `entity_merge_log`, `entity_aliases`), the `KnowledgeBasePage.tsx` and `KnowledgeGraphPage.tsx` pages, the `.anton` bundle format, the RAG/collections system, and the knowledge source integration (Layer 6 of the prompt builder). Everything built here must integrate into and extend what is already there, not duplicate or diverge from it.

---

## 1. Context: What This Is and Why It Matters

### The Problem

ANTON's knowledge graph is powerful but **emergent** — it grows only through use. When a user runs workflows, entities are extracted, relationships are scored, and the graph gets denser over time. This works brilliantly for teams who have been using the platform for weeks or months.

But on day one, the graph is empty. A new user running an AMLR Gap Analysis gets excellent results from the seven-layer prompt architecture, but the knowledge graph has no pre-existing understanding of how AMLR articles connect to each other, which articles reference which EU directives, how the RTS/ITS hierarchy works under AMLA, or which articles supersede provisions in 4AMLD.

Legal AI platforms like Harvey and Legora solve this by pre-building a structured legal database — every article indexed, every cross-reference mapped, every amendment chain recorded. This gives them day-one citation accuracy and logical reasoning chains.

### The Solution

**Regulatory Knowledge Packs** — curated, pre-built datasets that seed the existing knowledge graph with structured regulatory data. Think of it like this: the knowledge graph infrastructure is already built (5 tables, 11 entity types, 10+ relationship types, merge/alias system, graph visualisation). What's missing is a mechanism to **pre-populate** it from a curated source rather than only through emergent extraction.

A knowledge pack is a `.anton` bundle (new bundle type: `regulatory-knowledge-pack`) containing a JSON file with arrays of entities and relationships. When a user activates a pack, it bulk-inserts into the existing `entity_nodes` and `entity_relationships` tables. The existing `KnowledgeGraphPage.tsx` then visualises all of it — no new visualisation needed.

### Key Design Principles

1. **Extend, don't duplicate.** Everything goes into the existing knowledge graph tables. No parallel data structures.
2. **Pack-seeded and workflow-extracted entities coexist.** Users who activate a pack and then run workflows will see their emergent entities merge naturally with the pack's entities (via the existing alias detection system).
3. **Packs are versioned and updatable.** When regulations change (new RTS published, article amended), the pack gets a new version and the user can update.
4. **Packs are shareable.** They use the `.anton` format and will eventually be tradeable in the marketplace.
5. **Area-aware.** Each pack is associated with one or more expert areas. When activated, the area cards in navigation show a "Knowledge Loaded" indicator.
6. **Non-destructive uninstall.** Removing a pack removes only pack-seeded entities (identified by source tag), not workflow-extracted entities that may reference the same regulations.

---

## 2. What Already Exists — Claude Code Must Scan These First

Before implementing anything, audit these existing components:

### Database Tables (Knowledge Graph — GROUP 6 in schema)

```
entity_nodes          — Entities (clients, regulations, controls, risks, etc.)
entity_relationships  — Edges between entities with relationship types and strength
entity_mentions       — Raw mentions in sessions (with context)
entity_merge_log      — Alias consolidation history
entity_aliases        — Alternative names for entities
```

**Scan for:** Column definitions, data types, foreign keys, indexes, any existing `source` or `origin` fields that could be reused.

### Entity Types (11 types already defined)

`client`, `regulation`, `control`, `risk`, `person`, `system`, `product`, `geography`, `organization`, `process`, `document`

**Scan for:** Where these are defined (likely constants file or schema enum). The `regulation` and `document` types are most relevant for knowledge packs.

### Relationship Types (10+ types already defined)

`mentioned_with`, `precedes`, `caused`, `requires`, `contradicts`, `supports`, `implements`, `reports_to`, `owns`, `part_of`

Also used in whitepaper examples: `references`, `supersedes`, `mitigates`, `depends_on`, `conflicts_with`

**Scan for:** Where these are defined. Some of these may need to be added if they don't exist in code yet.

### Existing Pages

```
KnowledgeBasePage.tsx   — Knowledge base management (RAG collections, folder indexing)
KnowledgeGraphPage.tsx  — Interactive graph visualisation (nodes, edges, click to explore)
IntelligenceDashboard.tsx — Analytics view (entity activity, relationship heatmaps)
```

**Scan for:** How KnowledgeBasePage is structured — it likely has tabs or sections. The knowledge pack UI should live here as a new tab/section.

### .anton Bundle Format

**Scan for:** Where the `.anton` format is defined, what the 17 existing bundle types are, how bundles are imported/exported, validation logic. The new `regulatory-knowledge-pack` type must follow the same conventions.

### Routes

```
/api/knowledge/*
/api/knowledge-graph/*
/api/rag/*
/api/collections/*
```

**Scan for:** Existing patterns, middleware, authentication. The new `/api/knowledge-packs/*` routes must follow the same conventions.

### Prompt Builder (Layer 6 — Knowledge Source Integration)

**Scan for:** How `prompt-builder.ts` resolves knowledge sources. When a pack is active, the pack's metadata (which regulations are covered, key relationships) could optionally be injected as context into the prompt — but this is a Phase 2 enhancement, not Phase 1.

---

## 3. Database Changes

### New Table: `knowledge_packs`

This table tracks installed knowledge packs and their activation status.

```sql
CREATE TABLE IF NOT EXISTS knowledge_packs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  
  -- Pack identity
  name TEXT NOT NULL,                    -- e.g. "AMLR 2024/1624 — Full Regulatory Map"
  slug TEXT NOT NULL UNIQUE,             -- e.g. "amlr-2024-1624"
  description TEXT,                      -- Human-readable description
  domain TEXT NOT NULL,                  -- e.g. "AML/CFT", "Data Protection", "Securities"
  
  -- Versioning
  version TEXT NOT NULL,                 -- Semantic version, e.g. "1.0.0"
  published_at TEXT,                     -- ISO date when this version was published
  
  -- Content stats (denormalised for display)
  entity_count INTEGER DEFAULT 0,       -- Number of entities in the pack
  relationship_count INTEGER DEFAULT 0, -- Number of relationships in the pack
  
  -- Area associations (JSON array of area IDs)
  area_ids TEXT DEFAULT '[]',           -- e.g. '["fcp", "legal", "audit"]'
  
  -- Source and authorship
  author TEXT,                           -- e.g. "Advisense FCP Team"
  source_url TEXT,                       -- Link to source regulation or author site
  license TEXT DEFAULT 'CC-BY-4.0',     -- License for the pack content
  
  -- Status
  status TEXT DEFAULT 'available' CHECK(status IN ('available', 'installed', 'active', 'outdated')),
  installed_at TEXT,                     -- ISO timestamp
  activated_at TEXT,                     -- ISO timestamp
  
  -- Metadata
  metadata TEXT DEFAULT '{}',           -- JSON for extensible metadata
  
  -- Standard timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  
  -- User who installed it
  user_id TEXT REFERENCES users(id)
);
```

### Modifications to Existing Tables

**`entity_nodes` — Add source tracking:**

Check if a `source` or `origin` column already exists. If not, add:

```sql
ALTER TABLE entity_nodes ADD COLUMN source TEXT DEFAULT 'workflow';
-- Values: 'workflow' (extracted from workflow output), 'pack:<slug>' (from knowledge pack), 'manual' (user-created)

ALTER TABLE entity_nodes ADD COLUMN pack_id TEXT REFERENCES knowledge_packs(id);
-- NULL for workflow-extracted entities, set for pack-seeded entities
```

**`entity_relationships` — Add source tracking:**

Same pattern:

```sql
ALTER TABLE entity_relationships ADD COLUMN source TEXT DEFAULT 'workflow';
ALTER TABLE entity_relationships ADD COLUMN pack_id TEXT REFERENCES knowledge_packs(id);
```

**Important:** These columns must have defaults so existing data is unaffected. All existing entities and relationships get `source = 'workflow'` and `pack_id = NULL`.

### Index Additions

```sql
CREATE INDEX idx_entity_nodes_pack_id ON entity_nodes(pack_id);
CREATE INDEX idx_entity_nodes_source ON entity_nodes(source);
CREATE INDEX idx_entity_relationships_pack_id ON entity_relationships(pack_id);
CREATE INDEX idx_entity_relationships_source ON entity_relationships(source);
CREATE INDEX idx_knowledge_packs_status ON knowledge_packs(status);
CREATE INDEX idx_knowledge_packs_slug ON knowledge_packs(slug);
```

---

## 4. The Knowledge Pack Format (.anton Bundle)

### Bundle Structure

A regulatory knowledge pack is a `.anton` ZIP file (bundle type: `regulatory-knowledge-pack`) with this structure:

```
amlr-2024-1624-v1.0.0.anton
├── manifest.json          -- Pack metadata (same pattern as other .anton bundles)
├── entities.json          -- Array of entity definitions
├── relationships.json     -- Array of relationship definitions
├── aliases.json           -- Array of known aliases for entities
└── README.md              -- Human-readable description of the pack
```

### manifest.json

```json
{
  "bundle_type": "regulatory-knowledge-pack",
  "name": "AMLR 2024/1624 — Full Regulatory Map",
  "slug": "amlr-2024-1624",
  "version": "1.0.0",
  "description": "Complete article-level mapping of EU Anti-Money Laundering Regulation 2024/1624, including internal cross-references, links to predecessor directives (4AMLD, 5AMLD, 6AMLD), AMLA oversight structure, and RTS/ITS hierarchy.",
  "domain": "AML/CFT",
  "area_ids": ["fcp", "legal", "audit"],
  "author": "Advisense FCP Team",
  "source_url": "https://eur-lex.europa.eu/eli/reg/2024/1624/oj",
  "license": "CC-BY-4.0",
  "published_at": "2026-03-01",
  "entity_count": 0,
  "relationship_count": 0,
  "anton_version_min": "1.0.0"
}
```

**Note:** `entity_count` and `relationship_count` are computed during validation and written into the manifest automatically.

### entities.json

```json
[
  {
    "ref_id": "amlr-art-1",
    "entity_type": "regulation",
    "name": "AMLR Article 1 — Subject Matter",
    "canonical_name": "AMLR Article 1",
    "description": "Establishes the subject matter and scope of the regulation, laying down rules for the prevention of money laundering and terrorist financing.",
    "metadata": {
      "regulation": "AMLR 2024/1624",
      "article_number": "1",
      "title": "Subject Matter",
      "chapter": "I — General Provisions",
      "eur_lex_url": "https://eur-lex.europa.eu/eli/reg/2024/1624/oj#art_1"
    }
  },
  {
    "ref_id": "amlr-art-8",
    "entity_type": "regulation",
    "name": "AMLR Article 8 — Business-Wide Risk Assessment",
    "canonical_name": "AMLR Article 8",
    "description": "Requires obliged entities to carry out a business-wide risk assessment identifying and assessing the risks of money laundering and terrorist financing they are exposed to.",
    "metadata": {
      "regulation": "AMLR 2024/1624",
      "article_number": "8",
      "title": "Business-Wide Risk Assessment",
      "chapter": "II — Risk-Based Approach",
      "eur_lex_url": "https://eur-lex.europa.eu/eli/reg/2024/1624/oj#art_8",
      "key_requirements": [
        "Identify and assess ML/TF risks",
        "Consider risk factors in Annexes II and III",
        "Document and keep up to date",
        "Make available to competent authorities"
      ]
    }
  },
  {
    "ref_id": "4amld",
    "entity_type": "regulation",
    "name": "Directive 2015/849 (4th Anti-Money Laundering Directive)",
    "canonical_name": "4AMLD",
    "description": "The Fourth Anti-Money Laundering Directive, predecessor to AMLR. Partially superseded by AMLR 2024/1624.",
    "metadata": {
      "regulation": "Directive 2015/849",
      "eur_lex_url": "https://eur-lex.europa.eu/eli/dir/2015/849/oj",
      "status": "partially_superseded"
    }
  },
  {
    "ref_id": "amla",
    "entity_type": "organization",
    "name": "AMLA — Anti-Money Laundering Authority",
    "canonical_name": "AMLA",
    "description": "The EU Anti-Money Laundering Authority established by Regulation 2024/1620. Headquartered in Frankfurt. Responsible for direct and indirect supervision of obliged entities and coordination of FIUs.",
    "metadata": {
      "regulation": "Regulation 2024/1620",
      "headquarters": "Frankfurt, Germany",
      "operational_from": "2025"
    }
  },
  {
    "ref_id": "process-bwra",
    "entity_type": "process",
    "name": "Business-Wide Risk Assessment Process",
    "canonical_name": "BWRA",
    "description": "The process by which an obliged entity identifies, assesses, and documents risks of money laundering and terrorist financing across its entire business.",
    "metadata": {
      "frequency": "Annual minimum, event-triggered updates",
      "output": "Documented risk assessment report"
    }
  }
]
```

**Entity Schema Rules:**

- `ref_id` — Unique within the pack. Used to reference entities in relationships.json. Must be URL-safe (lowercase, hyphens, no spaces). This is NOT the database ID — the database generates its own IDs on import.
- `entity_type` — Must be one of the 11 existing types: `client`, `regulation`, `control`, `risk`, `person`, `system`, `product`, `geography`, `organization`, `process`, `document`
- `name` — Full display name including identifiers (e.g., "AMLR Article 8 — Business-Wide Risk Assessment")
- `canonical_name` — Short reference name used for matching and deduplication (e.g., "AMLR Article 8")
- `description` — Human-readable description of the entity
- `metadata` — Extensible JSON object for domain-specific data. No fixed schema — different packs will have different metadata structures.

### relationships.json

```json
[
  {
    "from_ref": "amlr-art-8",
    "to_ref": "process-bwra",
    "relationship_type": "requires",
    "description": "Article 8 requires obliged entities to carry out a business-wide risk assessment.",
    "strength": 5.0,
    "metadata": {
      "paragraph": "8(1)",
      "obligation_level": "mandatory"
    }
  },
  {
    "from_ref": "amlr-art-8",
    "to_ref": "4amld",
    "relationship_type": "supersedes",
    "description": "AMLR Article 8 supersedes and replaces the BWRA provisions in 4AMLD Article 8.",
    "metadata": {
      "superseded_article": "4AMLD Article 8"
    }
  },
  {
    "from_ref": "amlr-art-8",
    "to_ref": "amlr-art-13",
    "relationship_type": "references",
    "description": "Article 8 BWRA must consider risk variables specified in Article 13.",
    "metadata": {
      "cross_reference_type": "internal",
      "paragraph": "8(3)"
    }
  },
  {
    "from_ref": "amla",
    "to_ref": "amlr-art-8",
    "relationship_type": "requires",
    "description": "AMLA may require specific BWRA approaches for directly supervised entities.",
    "metadata": {
      "supervision_type": "direct"
    }
  }
]
```

**Relationship Schema Rules:**

- `from_ref` and `to_ref` — Must match `ref_id` values in entities.json. Validated during import.
- `relationship_type` — Must be one of the defined relationship types (see Section 2). If the existing codebase doesn't have all the types used in packs, the import should add them.
- `strength` — Float 1.0–5.0. Pack relationships default to high strength (4.0–5.0) since they represent verified regulatory connections.
- `description` — Human-readable explanation of the relationship.
- `metadata` — Extensible JSON for domain-specific context.

### aliases.json

```json
[
  {
    "ref_id": "amlr-art-8",
    "aliases": [
      "Art. 8 AMLR",
      "Regulation 2024/1624 Article 8",
      "AMLR Art. 8",
      "Article 8 BWRA"
    ]
  },
  {
    "ref_id": "4amld",
    "aliases": [
      "4th Anti-Money Laundering Directive",
      "Fourth AML Directive",
      "Directive (EU) 2015/849",
      "4AMLD",
      "AMLD4"
    ]
  },
  {
    "ref_id": "amla",
    "aliases": [
      "Anti-Money Laundering Authority",
      "EU AML Authority",
      "AMLA Frankfurt"
    ]
  }
]
```

**Alias Schema Rules:**

- `ref_id` — Must match an entity in entities.json.
- `aliases` — Array of strings. These are loaded into `entity_aliases` on import, enabling the existing merge/deduplication system to match workflow-extracted mentions (e.g., a user writes "Art. 8 AMLR" in a workflow output) to pack-seeded entities.

---

## 5. API Routes

All routes under `/api/knowledge-packs/`. Follow existing authentication and middleware patterns.

### GET /api/knowledge-packs

List all knowledge packs (available, installed, active).

**Response:**
```json
{
  "packs": [
    {
      "id": "abc123",
      "name": "AMLR 2024/1624 — Full Regulatory Map",
      "slug": "amlr-2024-1624",
      "description": "...",
      "domain": "AML/CFT",
      "version": "1.0.0",
      "entity_count": 187,
      "relationship_count": 643,
      "area_ids": ["fcp", "legal", "audit"],
      "author": "Advisense FCP Team",
      "status": "active",
      "installed_at": "2026-03-01T10:00:00Z",
      "activated_at": "2026-03-01T10:01:00Z"
    }
  ]
}
```

### POST /api/knowledge-packs/import

Import a `.anton` bundle (uploaded as multipart form data or as a file path for bundled packs).

**Process:**
1. Extract `.anton` ZIP
2. Validate manifest.json schema
3. Validate entities.json — check all entity_types are valid, all ref_ids unique
4. Validate relationships.json — check all from_ref/to_ref exist in entities.json, all relationship_types are valid
5. Validate aliases.json — check all ref_ids exist in entities.json
6. Compute entity_count and relationship_count
7. Insert `knowledge_packs` record with status `installed`
8. Return pack metadata

**Does NOT insert entities/relationships yet** — that happens on activation.

**Response:**
```json
{
  "pack": { ... },
  "validation": {
    "valid": true,
    "entity_count": 187,
    "relationship_count": 643,
    "alias_count": 412,
    "warnings": []
  }
}
```

### POST /api/knowledge-packs/:id/activate

Activate an installed pack — bulk-insert entities and relationships into the knowledge graph.

**Process:**
1. Check pack status is `installed` or `active` (re-activation for updates)
2. If re-activating, first run deactivation (remove old pack entities)
3. Read entities.json from stored bundle
4. For each entity:
   a. Check if an entity with the same `canonical_name` already exists (workflow-extracted or from another pack)
   b. If exists: link them via `entity_aliases`, do NOT create duplicate. Log in `entity_merge_log`.
   c. If not exists: insert into `entity_nodes` with `source = 'pack:<slug>'` and `pack_id = <pack_id>`
5. Read relationships.json
6. For each relationship:
   a. Resolve `from_ref` and `to_ref` to actual entity IDs (may be newly inserted or pre-existing merged entities)
   b. Check if relationship already exists (same from/to/type)
   c. If exists: update strength if pack strength is higher. Do NOT create duplicate.
   d. If not exists: insert into `entity_relationships` with `source = 'pack:<slug>'` and `pack_id = <pack_id>`
7. Read aliases.json
8. For each alias set:
   a. Resolve ref_id to actual entity ID
   b. Insert each alias into `entity_aliases` if not already present
9. Update pack status to `active`, set `activated_at`
10. Update entity_count and relationship_count on the pack record

**Response:**
```json
{
  "pack": { ... },
  "result": {
    "entities_created": 172,
    "entities_merged": 15,
    "relationships_created": 628,
    "relationships_updated": 15,
    "aliases_created": 398,
    "aliases_skipped": 14
  }
}
```

### POST /api/knowledge-packs/:id/deactivate

Deactivate a pack — remove pack-seeded entities and relationships, preserve workflow-extracted data.

**Process:**
1. Delete all `entity_relationships` where `pack_id = <pack_id>`
2. Delete all `entity_aliases` that were created during pack activation (need to track these — add `pack_id` to `entity_aliases` if not present)
3. Delete all `entity_nodes` where `pack_id = <pack_id>` AND the entity has no workflow-extracted mentions (check `entity_mentions` table)
4. For entities that DO have workflow mentions: remove `pack_id`, set `source = 'workflow'` (the entity now lives on as workflow-extracted)
5. Update pack status to `installed`, clear `activated_at`

### DELETE /api/knowledge-packs/:id

Fully remove a pack. Must be deactivated first.

**Process:**
1. Check pack status is `installed` (not `active`)
2. Delete the pack record
3. Delete stored `.anton` bundle file

### GET /api/knowledge-packs/:id/entities

List entities in a pack (for preview before activation).

**Query params:** `?page=1&limit=50&type=regulation`

### GET /api/knowledge-packs/:id/relationships

List relationships in a pack (for preview before activation).

**Query params:** `?page=1&limit=50&type=requires`

### GET /api/knowledge-packs/bundled

List any packs that ship bundled with ANTON (stored in a `data/knowledge-packs/` directory in the repo). These appear as "available" packs that users can install without uploading a file.

---

## 6. Service Layer

### New Service: `knowledge-pack-service.ts`

**Location:** `server/services/knowledge-pack-service.ts`

**Responsibilities:**
- Parse and validate `.anton` bundles
- Manage pack lifecycle (import → install → activate → deactivate → delete)
- Bulk insert entities/relationships with deduplication
- Track pack-seeded vs workflow-extracted data
- Compute pack statistics

**Key Methods:**

```typescript
class KnowledgePackService {
  // Bundle handling
  async importBundle(filePath: string, userId: string): Promise<PackImportResult>
  async validateBundle(bundlePath: string): Promise<ValidationResult>
  
  // Lifecycle
  async activate(packId: string): Promise<ActivationResult>
  async deactivate(packId: string): Promise<DeactivationResult>
  async delete(packId: string): Promise<void>
  
  // Queries
  async listPacks(userId: string): Promise<KnowledgePack[]>
  async getPackDetails(packId: string): Promise<KnowledgePackDetail>
  async previewEntities(packId: string, filters: EntityFilter): Promise<PaginatedEntities>
  async previewRelationships(packId: string, filters: RelFilter): Promise<PaginatedRelationships>
  
  // Bundled packs
  async listBundledPacks(): Promise<BundledPackInfo[]>
  async installBundled(slug: string, userId: string): Promise<PackImportResult>
  
  // Internal
  private async resolveEntityRef(refId: string, packId: string, refMap: Map<string, string>): Promise<string>
  private async findExistingEntity(canonicalName: string, entityType: string): Promise<string | null>
  private async bulkInsertEntities(entities: PackEntity[], packId: string, slug: string): Promise<BulkInsertResult>
  private async bulkInsertRelationships(rels: PackRelationship[], packId: string, slug: string, refMap: Map<string, string>): Promise<BulkInsertResult>
}
```

**Critical implementation detail — the ref_id to entity_id mapping:**

During activation, a Map is built: `ref_id → actual entity_id`. This map is essential because:
- Some entities will be newly created (the map stores their new database IDs)
- Some entities will merge with existing ones (the map stores the existing entity's ID)
- Relationships reference entities by ref_id and must be resolved to actual IDs

---

## 7. UI Changes

### 7.1 Knowledge Base Page — New "Regulatory Packs" Tab

**Location:** `KnowledgeBasePage.tsx`

Add a new tab alongside whatever tabs/sections currently exist (RAG collections, folder indexing, etc.).

**Tab content:**

**Header section:**
- Title: "Regulatory Knowledge Packs"
- Subtitle: "Pre-built regulatory maps that seed your knowledge graph with structured legal data, cross-references, and relationship chains."
- "Import Pack" button (opens file picker for `.anton` files)

**Pack cards grid:**

Each pack is displayed as a card showing:
- Pack name (bold, prominent)
- Domain badge (e.g., "AML/CFT", "Data Protection")
- Entity count and relationship count (e.g., "187 entities · 643 relationships")
- Version number
- Author
- Status badge:
  - "Available" (grey) — bundled but not installed
  - "Installed" (blue) — imported but not activated
  - "Active" (green/teal) — entities loaded into knowledge graph
  - "Update Available" (amber) — newer version exists
- Action button:
  - Available → "Install"
  - Installed → "Activate" (primary) / "Preview" / "Remove"
  - Active → "Deactivate" / "View in Graph"

**Preview modal:**

When user clicks "Preview" on an installed pack, show a modal/drawer with:
- Tab 1: Entities — paginated table showing entity type, name, description
- Tab 2: Relationships — paginated table showing from → to, relationship type, description
- Tab 3: Stats — entity type breakdown (pie chart or bar), relationship type breakdown
- "Activate" button at bottom

**Activation confirmation:**

Before activation, show a confirmation dialog:
- "This will add 187 entities and 643 relationships to your knowledge graph."
- "Existing entities with matching names will be linked, not duplicated."
- Checkbox: "I understand this will modify my knowledge graph"
- "Activate" / "Cancel" buttons

### 7.2 Area Cards — "Knowledge Loaded" Indicator

**Location:** Wherever area cards are displayed (likely dashboard or area navigation)

When a pack is active that covers an area, show a small indicator on the area card:
- A small icon (e.g., a book or database icon) in the corner
- Tooltip: "Regulatory knowledge pack active: AMLR 2024/1624"
- If multiple packs cover the same area, show count: "2 packs active"

**Implementation:** Query `knowledge_packs` where `status = 'active'` and `area_ids` contains the current area ID. This can be a lightweight API call cached on the client.

### 7.3 Knowledge Graph Page — Pack Filter

**Location:** `KnowledgeGraphPage.tsx`

Add a filter option to the existing graph visualisation:
- "Source" filter: All / Workflow / Pack: [pack name] / Manual
- When filtering by pack, only show entities and relationships from that pack
- Pack-seeded entities could have a subtle visual distinction (e.g., slightly different node border or a small badge)

### 7.4 Module Page — Knowledge Pack Context Indicator

**Location:** `ModulePage.tsx` (or wherever module configuration happens)

When a user is configuring knowledge sources for a module run, and an active knowledge pack covers the module's area, show an informational note:
- "Regulatory knowledge active: AMLR 2024/1624 (187 entities, 643 relationships). The AI can reference these when analysing your documents."

This is informational only in Phase 1 — the pack data is available in the knowledge graph for cross-workflow intelligence, not directly injected into the prompt (that's Phase 2).

---

## 8. Bundled Packs Directory

### Location: `data/knowledge-packs/`

Store pre-built packs that ship with ANTON. Initially this will be empty or contain a small starter pack, but the directory structure should be ready:

```
data/
  knowledge-packs/
    README.md                    -- Explains the format and how to contribute
    amlr-2024-1624/
      manifest.json
      entities.json
      relationships.json
      aliases.json
      README.md
```

On startup (or on first visit to Knowledge Base page), the system scans this directory and shows any bundled packs as "Available" in the UI.

---

## 9. Pack-to-Prompt Integration (Phase 2 — Document but Do Not Implement)

In Phase 2, active knowledge packs will enhance the prompt builder:

When a module runs in an area covered by an active pack, Layer 6 (Knowledge Source Integration) could optionally include:
- A structured summary of the pack's key entities relevant to the user's query
- Cross-reference chains that the AI should be aware of (e.g., "AMLR Article 8 requires BWRA, references Article 13 risk variables, supersedes 4AMLD Article 8")
- This would be a new knowledge source mode (Mode 5: Knowledge Graph Context) or an enhancement to Mode 4 (Combined)

**Do not implement this in Phase 1.** Document it as a TODO in the code. The current value is in the knowledge graph visualisation, cross-workflow intelligence, and entity deduplication — which all work without prompt injection.

---

## 10. File Storage

### Where to Store Imported Packs

Follow existing patterns for file storage in the codebase. Likely:

```
data/
  knowledge-packs/           -- Bundled packs (ships with repo)
  user-knowledge-packs/      -- User-imported packs (gitignored)
    <pack-id>/
      bundle.anton           -- Original uploaded file
      manifest.json          -- Extracted for quick access
      entities.json          -- Extracted for quick access
      relationships.json     -- Extracted for quick access
      aliases.json           -- Extracted for quick access
```

**Scan for:** How the platform currently handles user-uploaded files (folders, knowledge base documents). Follow that pattern.

---

## 11. Validation Rules

### During Import (strict — reject invalid packs)

1. manifest.json must contain: `bundle_type`, `name`, `slug`, `version`, `domain`, `area_ids`
2. `bundle_type` must be `"regulatory-knowledge-pack"`
3. `slug` must be URL-safe (lowercase alphanumeric + hyphens)
4. entities.json must be a valid JSON array
5. Every entity must have: `ref_id`, `entity_type`, `name`, `canonical_name`
6. All `ref_id` values must be unique within the pack
7. All `entity_type` values must be valid (one of the 11 types)
8. relationships.json must be a valid JSON array
9. Every relationship must have: `from_ref`, `to_ref`, `relationship_type`
10. All `from_ref` and `to_ref` must reference valid `ref_id` values in entities.json
11. All `relationship_type` values must be valid
12. aliases.json must be a valid JSON array (can be empty)
13. Every alias entry must have: `ref_id`, `aliases` (array of strings)
14. All `ref_id` values must reference valid entities

### During Import (warnings — accept but inform)

1. Entities with no relationships (orphan nodes)
2. Relationships where both from/to are the same entity (self-referencing)
3. Very large packs (>10,000 entities) — warn about performance
4. Duplicate canonical names within the pack

---

## 12. Migration Strategy

### Database Migration

Create a migration file following existing patterns:

```
server/db/migrations/XXX_add_knowledge_packs.sql
```

Contents:
1. CREATE TABLE knowledge_packs
2. ALTER TABLE entity_nodes ADD COLUMN source, pack_id
3. ALTER TABLE entity_relationships ADD COLUMN source, pack_id
4. ALTER TABLE entity_aliases ADD COLUMN pack_id (if not present)
5. CREATE indexes
6. UPDATE existing rows: SET source = 'workflow' WHERE source IS NULL

### Backward Compatibility

All changes are additive. No existing functionality is affected:
- Existing entities keep working (source defaults to 'workflow')
- Existing graph queries keep working (no WHERE clause changes needed unless filtering by source)
- Existing pages keep working (new tab is additive)

---

## 13. Testing Guidance

### What to Test

1. **Import validation:** Import a valid pack → success. Import invalid JSON → clear error. Import with bad ref_ids → clear error listing the problems.
2. **Activation:** Activate a pack → entities and relationships appear in knowledge graph. Entity counts match.
3. **Deduplication:** Create a workflow-extracted entity "AMLR Article 8". Activate pack containing "AMLR Article 8". Verify they merge (not duplicate). Verify entity_merge_log entry created.
4. **Deactivation:** Deactivate a pack → pack-only entities removed. Entities with workflow mentions preserved.
5. **Re-activation:** Deactivate then activate again → same result as first activation.
6. **Graph visualisation:** Activate pack → open KnowledgeGraphPage → pack entities visible with relationships.
7. **Area indicator:** Activate pack with area_ids ["fcp"] → FCP area card shows indicator.

### Test Pack

Create a small test pack (5-10 entities, 10-15 relationships) for development and testing. Store in `data/knowledge-packs/test-pack/`.

---

## 14. Success Criteria

Phase 1 is complete when:

1. ✅ User can import a `.anton` knowledge pack via the Knowledge Base page
2. ✅ User can preview pack contents (entities, relationships) before activation
3. ✅ User can activate a pack, seeding the knowledge graph with entities and relationships
4. ✅ Pack-seeded entities are visible in the Knowledge Graph page with proper visualisation
5. ✅ Pack-seeded entities merge correctly with existing workflow-extracted entities (no duplicates)
6. ✅ User can deactivate a pack, cleanly removing pack-only data
7. ✅ Area cards show an indicator when a relevant pack is active
8. ✅ Bundled packs in `data/knowledge-packs/` appear as available for installation
9. ✅ All existing functionality is unaffected (backward compatible)
10. ✅ Validation provides clear, actionable error messages for invalid packs

---

## 15. Scope Boundaries — What NOT to Build

- ❌ Do NOT build pack-to-prompt injection (Phase 2)
- ❌ Do NOT build a pack authoring UI (packs are authored externally and imported)
- ❌ Do NOT build marketplace/sharing features (future roadmap)
- ❌ Do NOT build automatic pack updates from remote sources (future roadmap)
- ❌ Do NOT build pack diff/changelog between versions (future roadmap)
- ❌ Do NOT modify the existing entity extraction from workflows — it should continue working exactly as it does today, just now with the ability to merge against pack-seeded entities

---

## 16. Estimated Scope

Based on existing infrastructure:

- **Database migration:** ~50 lines SQL
- **Service layer:** ~400-600 lines TypeScript
- **API routes:** ~200-300 lines TypeScript
- **UI (Knowledge Base tab):** ~300-500 lines React
- **UI (Area indicator):** ~50-100 lines React
- **UI (Graph filter):** ~50-100 lines React
- **Test pack:** ~100 lines JSON
- **Total new code:** ~1,200-1,700 lines

This is a medium-sized feature that integrates deeply with existing infrastructure. The risk is low because it's additive — no existing code needs to change significantly, just a few columns added to existing tables.
