# 20b-database-knowledge — Schema: Knowledge

**Status of diagram:** Generated 2026-04-26 by Claude Code from commit `0fabf7f` (`openexpert@0.7.5`)
**Subsystem status legend:** ✅ Built · 🟢 Partial · 📋 Spec-only · ❌ Future
**Maintainer note:** Regenerate when a new knowledge-pack type is added, when atom schemas change, or when pgvector is adopted.

The persistence backing the 4-mode (now 5-mode) Knowledge Source Resolver and ANTON's atom-based learning surface.

## Diagram

```mermaid
erDiagram
  user_profiles ||--o{ registered_folders : owns
  user_profiles ||--o{ knowledge_atoms : owns
  knowledge_atoms ||--o{ atom_provenance : "sourced from"
  regulatory_knowledge_packs ||--o{ knowledge_pack_documents : contains
  hardware_knowledge_packs ||--o{ hkp_components : contains
  hardware_knowledge_packs ||--o{ hkp_claims : asserts
  hardware_knowledge_packs ||--o{ hkp_regional_alternatives : "regional sub"
  capability_cards ||--o{ knowledge_atoms : "may carry"

  registered_folders {
    text id PK
    text user_id FK
    text path "validated against ALLOWED_FOLDER_PATHS"
    bool recursive
    text label
    timestamptz indexed_at
  }

  knowledge_atoms {
    text id PK
    text user_id FK
    text source_type "session·folder·web·partner"
    text body
    json tags
    json entities
    text origin_session_id
    int boost
    bool deprecated
    timestamptz created_at
    tsvector content_fts "FTS5 / Postgres FTS"
  }

  atom_provenance {
    text atom_id FK
    text source "session_id · file_path · url · partner_ref"
    text source_label
    timestamptz captured_at
  }

  regulatory_knowledge_packs {
    text id PK
    text name
    text jurisdiction
    text version
    text framework "AMLR · DORA · ISO27001 · …"
    bool active
    json metadata
    timestamptz imported_at
  }

  knowledge_pack_documents {
    text id PK
    text pack_id FK
    text doc_type "regulation · guidance · case · template"
    text title
    text body
    json citations
  }

  hardware_knowledge_packs {
    text id PK
    text name
    text mcu_family "esp32-wroom-32e · stm32 · …"
    text region "global · eu · africa · …"
    text version
    bool published
    timestamptz created_at
  }

  hkp_components {
    text id PK
    text hkp_id FK
    text component_type
    text part_number
    text vendor
  }

  hkp_claims {
    text id PK
    text hkp_id FK
    text claim_text
    text evidence_url
  }

  hkp_regional_alternatives {
    text id PK
    text hkp_id FK
    text region
    text alternative_part
    text rationale
  }

  capability_cards {
    text id PK
    text agent_id "if attached to agent"
    text title
    text body
    json verbs "AAP capability verbs"
  }
```

## Notes

- **Atoms** are the unit of learned context. Created on every session via `atom-extractor.ts`, boosted/decayed via `atom-boost.ts`, retrieved via `hybrid-search.ts` (BM25 + entity expansion).
- **Regulatory knowledge packs** are bundled under `data/knowledge-packs/` (`.anton` archives) and ingested into `regulatory_knowledge_packs` + `knowledge_pack_documents` on import.
- **HKP** (Hardware Knowledge Pack) is the Hardware Build (Tier-5 Coding) parallel of regulatory packs — components, claims, regional alternatives.
- **Capability cards** carry the AAP capability descriptors that travel with Specialized Agents and Portals.
- **No pgvector**: semantic search is offloaded to Chroma (`server/services/chroma-client.ts`) + Ollama embeddings (`embedding-pipeline.ts`).

## Source-of-truth references

- `server/db/schema.sql:25–31` — `registered_folders`.
- `server/db/migrations-pg/039_knowledge_atoms_fts_pg.sql` — atom FTS.
- `server/db/migrations-pg/098_atom_provenance.sql` — provenance.
- `server/db/migrations-pg/078_knowledge_sharing.sql` — sharing flows.
- `server/db/migrations-pg/133_hardware_build_foundation.sql` — `hardware_knowledge_packs`, `hkp_components`, `hkp_claims`.
- `server/db/migrations-pg/135_esp32_wroom_32e_hkp_seed.sql`, `141_esp32_regional_sourcing_more.sql` — `hkp_regional_alternatives`.
- `server/services/atom-extractor.ts` — atom writer.
- `server/services/atom-boost.ts` — boost / decay / token-budget.
- `server/services/hybrid-search.ts` — atom retrieval.
- `server/services/hkp-service.ts` — HKP service.
- `server/services/knowledge-pack-service.ts` — pack import / activation.

## Related diagrams

- `12-knowledge-source-resolver` — runtime usage of these tables.
- `20e-database-memory-patterns.md` — the learning loop on top of atoms.
- `25-coding-area.md` — Hardware Build (Tier 5) usage of HKPs.
