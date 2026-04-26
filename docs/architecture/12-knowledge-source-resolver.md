# 12-knowledge-source-resolver — Knowledge Source Resolver

**Status of diagram:** Generated 2026-04-26 by Claude Code from commit `0fabf7f` (`openexpert@0.7.5`)
**Subsystem status legend:** ✅ Built · 🟢 Partial · 📋 Spec-only · ❌ Future
**Maintainer note:** Regenerate when a new mode is added (the code shipped Mode 5 RAG after the 4-mode spec — watch for Mode 6), when External Data Integration adds a connector type, or when budget enforcement changes.

The Knowledge Source Resolver is the "killer feature" of ANTON's prompt system. It takes a `KnowledgeSourceConfig` from the user and resolves it into context text + tool configurations + a token estimate. The brief specifies 4 modes; the code now ships **5 modes** (RAG was added).

## Diagram

```mermaid
flowchart TD
  classDef mode fill:#0F766E,stroke:#5EEAD4,color:#F0FDFA
  classDef out fill:#581C87,stroke:#D8B4FE,color:#FAF5FF
  classDef ext fill:#1E3A8A,stroke:#93C5FD,color:#EFF6FF
  classDef partial fill:#7C2D12,stroke:#FDBA74,color:#FFF7ED,stroke-dasharray: 5 3

  Start([resolveKnowledgeSources(config, files, options)])
  Start --> Init["Init result:<br/>systemPromptAdditions=''<br/>contextDocuments=''<br/>tools=[]<br/>tokenEstimate=0<br/>sourceManifest=[]"]

  Init --> M1{config.modes.<br/>claudeKnowledge?.enabled}
  M1 -- yes --> M1Web{webSearchEnabled?}
  M1Web -- yes --> M1Tool["push tool:<br/>{type:'web_search_20250305',<br/>name:'web_search'}"]:::mode
  M1Web -- no  --> M1Desc[append KNOWLEDGE FOCUS<br/>directive]:::mode
  M1Tool --> M1Desc
  M1Desc --> M2
  M1 -- no --> M2

  M2{config.modes.<br/>onlineReference?.enabled}
  M2 -- yes --> M2Loop["For each URL:<br/>fetchUrl() → strip + cap"]:::mode
  M2Loop --> M2Tokens["estimateTokens(text)<br/>add to contextDocuments"]
  M2Tokens --> M3
  M2 -- no --> M3

  M3{config.modes.<br/>localFolder?.enabled}
  M3 -- yes --> M3Scan["scanFolder(path, recursive, ext)<br/>caps: 1000/folder · 5000 total"]:::mode
  M3Scan --> M3Extract["extractTextFromFile() per file<br/>(pdf/docx/doc/txt/md/xlsx/csv/html)"]
  M3Extract --> M3Tokens["estimateTokens; append"]
  M3Tokens --> M4
  M3 -- no --> M4

  M4{config.modes.<br/>combinedMode?.enabled}
  M4 -- yes --> M4Inst["Inject combined-mode<br/>directive (priority + merge):<br/>local-first / claude-first / merged"]:::mode
  M4Inst --> M5
  M4 -- no --> M5

  M5{options.ragMode?.enabled}
  M5 -- yes + useSemanticSearch --> M5Sem["semanticSearch(query, collections,<br/>topK, minScore, rerank)"]:::mode
  M5 -- yes + BM25 --> M5BM["retrieveChunks(query, folderPaths,<br/>topK, minScore)"]:::mode
  M5 -- no --> Budget
  M5Sem --> M5Append[Append top-K chunks<br/>+ source attribution]:::mode
  M5BM --> M5Append
  M5Append --> Budget

  Budget["Token-budget check:<br/>effectiveBudget = options.contextBudget<br/>?? AVAILABLE_CONTEXT_TOKENS (892k)"]:::partial
  Budget --> BudgetTrim{usedTokens > effectiveBudget?}
  BudgetTrim -- yes --> Trim[Trim oldest contextParts;<br/>warn in sourceManifest]:::partial
  BudgetTrim -- no --> Done
  Trim --> Done

  Done([return ResolvedKnowledge:<br/>{ systemPromptAdditions,<br/>contextDocuments, tools,<br/>tokenEstimate, sourceManifest }]):::out

  %% ─── External-data-integration sidebar ───────────────────────────
  subgraph EDI["External Data Integration (parallel path) 🟢"]
    direction TB
    EDIPg["PostgreSQL · MySQL · MSSQL ·<br/>MongoDB · REST · MCP"]:::ext
    EDIConn["connection-manager.ts<br/>+ db-drivers/* + integrations/*"]:::ext
    EDIPg --> EDIConn
    EDIConn --> EDIInject[Inject query results<br/>into Layer 6 context]:::ext
  end

  EDIInject -. "if EDI binding<br/>configured for module" .-> Budget
```

## Mode reference

| Mode | Status | Purpose | Source |
|---|---|---|---|
| 1. claudeKnowledge | ✅ | Claude built-in knowledge ± `web_search_20250305` tool | `knowledge-resolver.ts:108–120` |
| 2. onlineReference | ✅ | Fetch URLs server-side, inject as reference docs | `url-fetcher.ts` |
| 3. localFolder | ✅ | Scan registered folders, extract text, inject (caps: 1k/folder, 5k total) | `knowledge-resolver.ts:38–61` + `text-extractor.ts` |
| 4. combinedMode | ✅ | Instruction layer for multi-source priority/merge | inline directive |
| 5. ragMode | ✅ | BM25 retrieval (`hybridSearch`) or Chroma semantic search (`semantic-search.ts`) | `rag/retriever.ts` + `semantic-search.ts` |
| EDI sidebar | 🟢 | External Data Integration (PG/MySQL/MSSQL/Mongo/REST/MCP) — parallel injection path | `connection-manager.ts`, `db-drivers/`, `integrations/` |

## Supported file extensions (Mode 3)

`.pdf · .docx · .doc · .txt · .md · .xlsx · .csv · .html`

## Source-of-truth references

- `server/services/knowledge-resolver.ts:6–12` — 5-mode comment block (Modes 1–5).
- `server/services/knowledge-resolver.ts:14–24` — imports: `text-extractor`, `url-fetcher`, `rag/retriever`, `semantic-search`.
- `server/services/knowledge-resolver.ts:25` — `SUPPORTED_EXTENSIONS` array.
- `server/services/knowledge-resolver.ts:27–29` — `MAX_FILES_PER_FOLDER = 1000`, `MAX_FILES_TOTAL = 5000`.
- `server/services/knowledge-resolver.ts:34–36` — `MAX_CONTEXT_TOKENS`, `ESTIMATED_SYSTEM_PROMPT_TOKENS`, `AVAILABLE_CONTEXT_TOKENS`.
- `server/services/knowledge-resolver.ts:38–61` — `scanFolder` (Mode 3 walker).
- `server/services/knowledge-resolver.ts:63–71` — `RagModeConfig` interface (Mode 5).
- `server/services/knowledge-resolver.ts:77–94` — `resolveKnowledgeSources` signature + return.
- `server/services/knowledge-resolver.ts:108–120` — Mode 1 implementation.
- `server/services/url-fetcher.ts` — Mode 2 fetch + sanitisation.
- `server/services/text-extractor.ts` — Mode 3 file → text dispatch.
- `server/services/rag/retriever.ts` — Mode 5 BM25.
- `server/services/semantic-search.ts` — Mode 5 Chroma.
- `server/services/atom-boost.ts` — `applyAntonBoosts` + `applyTokenBudget` (consumed by Layer 6 atoms).
- `server/services/connection-manager.ts`, `server/services/db-drivers/`, `server/services/integrations/` — EDI path.
- `server/db/schema.sql` — `registered_folders` table for Mode 3.

## Open questions

- **Mode-5 collection routing** — `RagModeConfig` accepts both `folderPaths` (BM25) and `collections` (Chroma); the toggle is `useSemanticSearch`. UI surface for choosing per session not investigated here.
- **EDI activation** — only modules that explicitly bind a connection use the EDI path; no global resolver hook. The dashed edge in the diagram reflects that conditional connection.
- **Combined-mode priority** — `local-first / claude-first / merged` is an instruction directive only; the actual merging happens during Claude's reasoning, not in the resolver code. Worth a deeper look if a strict merge becomes needed.

## Related diagrams

- `10-module-execution-sequence` — where this resolver is invoked.
- `11-seven-layer-prompt-builder` — Layer 6 wraps this resolver's output.
- `13-multi-llm-routing` — provider-specific tool stripping (e.g. web-search tool removed for non-Anthropic).
