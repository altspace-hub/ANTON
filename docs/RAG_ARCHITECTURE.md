# RAG Integration Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          USER INTERFACE                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────┐         ┌──────────────────────────────┐   │
│  │   ModulePage       │         │   KnowledgeSourcePanel       │   │
│  │                    │────────▶│                              │   │
│  │  - Gap Analysis    │         │  Mode 1: Claude Knowledge    │   │
│  │  - Doc Creation    │         │  Mode 2: Online Reference    │   │
│  │  - Sanctions, etc. │         │  Mode 3: Local Folders       │   │
│  └────────────────────┘         │  Mode 4: Combined            │   │
│                                  │  ┏━━━━━━━━━━━━━━━━━━━━━━━┓  │   │
│                                  │  ┃ Mode 5a: Folder RAG   ┃  │   │
│                                  │  ┃ Mode 5b: Collection   ┃  │   │
│                                  │  ┃         RAG (NEW)     ┃  │   │
│                                  │  ┗━━━━━━━━━━━━━━━━━━━━━━━┛  │   │
│                                  └──────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │             RAGSearchPanel (NEW)                             │  │
│  │  ┌────────────────────────────────────────────────────────┐  │  │
│  │  │ Collection Selector                                    │  │  │
│  │  │  ☑ 📏 Regulations & Laws (15 docs)                    │  │  │
│  │  │  ☑ 💼 Client Documents (8 docs)                       │  │  │
│  │  │  ☐ 📄 Templates & Examples (12 docs)                  │  │  │
│  │  └────────────────────────────────────────────────────────┘  │  │
│  │  Top-K: [═══════○══] 15 chunks   ☑ Re-rank                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │        ContextBudgetIndicator (NEW)                          │  │
│  │  Context Budget: 45,000 / 128,000 tokens                     │  │
│  │  ████████████░░░░░░░░ 35%                                     │  │
│  │  System: 12,000 │ RAG: 25,000 │ User: 8,000                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ knowledgeSources: {
                                    │   ragSearch: {
                                    │     enabled: true,
                                    │     collections: ["regulations", "client-docs"],
                                    │     topK: 15,
                                    │     rerank: true
                                    │   }
                                    │ }
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          API LAYER                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  POST /api/claude/message                                            │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  routes/claude.ts                                            │  │
│  │                                                              │  │
│  │  1. Extract ragSearch config                                │  │
│  │  2. If enabled && collections.length > 0:                   │  │
│  │     ├─▶ Call semanticSearch(db, query)                      │  │
│  │     ├─▶ Format results as context                           │  │
│  │     ├─▶ Estimate tokens (~4 chars/token)                    │  │
│  │     └─▶ Add to resolved.contextDocuments                    │  │
│  │  3. Call Claude API with combined context                   │  │
│  │  4. Stream response back to client                          │  │
│  │  5. Log to audit_log (includes rag_chunks)                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ semanticSearch({
                                    │   query: userMessage,
                                    │   collections: ["regulations", "client-docs"],
                                    │   topK: 15,
                                    │   rerank: true
                                    │ })
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    SEMANTIC SEARCH SERVICE                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  services/semantic-search.ts                                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  semanticSearch(db, query)                                   │  │
│  │  ┌────────────────────────────────────────────────────────┐  │  │
│  │  │ For each collection:                                   │  │  │
│  │  │   1. Query ChromaDB vector store                      │  │  │
│  │  │   2. Get top-K chunks by cosine similarity            │  │  │
│  │  │   3. Look up metadata from SQLite                     │  │  │
│  │  │   4. Build citation (filename, page)                  │  │  │
│  │  └────────────────────────────────────────────────────────┘  │  │
│  │  ┌────────────────────────────────────────────────────────┐  │  │
│  │  │ If rerank enabled:                                     │  │  │
│  │  │   1. Calculate keyword overlap score                  │  │  │
│  │  │   2. Combine: 70% vector + 30% keyword               │  │  │
│  │  │   3. Re-sort by final score                           │  │  │
│  │  └────────────────────────────────────────────────────────┘  │  │
│  │  Return: SearchResult[] with relevance scores              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ [SearchResult, SearchResult, ...]
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       DATA STORAGE                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────┐         ┌──────────────────────────────┐  │
│  │   SQLite Database   │         │      ChromaDB Vector Store   │  │
│  ├─────────────────────┤         ├──────────────────────────────┤  │
│  │ knowledge_collections│        │  Collection: "regulations"   │  │
│  │ rag_documents       │         │  - Embedding vectors         │  │
│  │ rag_chunks          │────────▶│  - 512-token chunks          │  │
│  │ audit_log           │         │  - Cosine similarity index   │  │
│  │   ├─ rag_chunks (NEW)│        └──────────────────────────────┘  │
│  └─────────────────────┘                                            │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow — End to End

```
┌─────────────┐
│    USER     │
│ "Compare    │
│  client     │
│  policy vs  │
│  AMLR"      │
└──────┬──────┘
       │
       │ 1. User selects:
       │    - Collections: ["regulations", "client-docs"]
       │    - TopK: 15
       │    - Re-rank: true
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│                  FRONTEND (ModulePage)                        │
│  knowledgeSources: {                                          │
│    ragSearch: {                                               │
│      enabled: true,                                           │
│      collections: ["regulations", "client-docs"],             │
│      topK: 15,                                                │
│      rerank: true                                             │
│    }                                                          │
│  }                                                            │
└───────────────────────────────┬──────────────────────────────┘
                                │
                                │ POST /api/claude/message
                                │
                                ▼
┌──────────────────────────────────────────────────────────────┐
│                    BACKEND (routes/claude.ts)                 │
│  1. Extract: ragSearch config                                │
│  2. Call: semanticSearch(db, {                               │
│             query: "Compare client policy vs AMLR",          │
│             collections: ["regulations", "client-docs"],      │
│             topK: 15,                                         │
│             rerank: true                                      │
│           })                                                  │
└───────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────┐
│            SEMANTIC SEARCH (services/semantic-search.ts)      │
│  For "regulations" collection:                                │
│    ├─ Query ChromaDB with embedding                          │
│    ├─ Get 15 chunks (cosine similarity > 0.7)                │
│    └─ Results: [                                              │
│         { content: "AMLR Art. 8...", relevance: 0.92 },      │
│         { content: "AMLR Art. 12...", relevance: 0.87 },     │
│         ...                                                   │
│       ]                                                       │
│                                                               │
│  For "client-docs" collection:                                │
│    ├─ Query ChromaDB                                          │
│    ├─ Get 15 chunks                                           │
│    └─ Results: [                                              │
│         { content: "AML Policy 4.2...", relevance: 0.89 },   │
│         { content: "KYC Procedure...", relevance: 0.82 },    │
│         ...                                                   │
│       ]                                                       │
│                                                               │
│  If rerank: true                                              │
│    ├─ Calculate keyword score for each chunk                  │
│    ├─ Combine: 70% vector + 30% keyword                      │
│    └─ Re-sort by final score                                 │
│                                                               │
│  Return: Top 15 chunks across all collections                │
└───────────────────────────────┬──────────────────────────────┘
                                │
                                │ [15 SearchResults with citations]
                                │
                                ▼
┌──────────────────────────────────────────────────────────────┐
│                CONTEXT ASSEMBLY (routes/claude.ts)            │
│  ragContext = """                                             │
│  ## RETRIEVED KNOWLEDGE FROM KNOWLEDGE BASE                   │
│                                                               │
│  I have retrieved 15 relevant chunks from your knowledge     │
│  base to help answer this question...                        │
│                                                               │
│  ### Source 1: AMLR-2024.pdf, page 12                        │
│  Relevance: 92.3%                                             │
│  Collection: Regulations & Laws                               │
│                                                               │
│  [Chunk content...]                                           │
│  ---                                                          │
│                                                               │
│  ### Source 2: Client-AML-Policy.docx, section 4.2           │
│  Relevance: 89.1%                                             │
│  Collection: Client Documents                                 │
│                                                               │
│  [Chunk content...]                                           │
│  ---                                                          │
│  ...                                                          │
│  """                                                          │
│                                                               │
│  Token estimate: ~25,000 tokens (ragContext.length / 4)      │
└───────────────────────────────┬──────────────────────────────┘
                                │
                                │ Append to system prompt
                                │
                                ▼
┌──────────────────────────────────────────────────────────────┐
│                   CLAUDE API CALL                             │
│  System Prompt:                                               │
│    ├─ Foundation layer (10k tokens)                          │
│    ├─ Module prompt (5k tokens)                              │
│    ├─ Output format instructions (2k tokens)                 │
│    └─ RAG context (25k tokens) ← NEW                         │
│                                                               │
│  User Message: "Compare client policy vs AMLR"               │
│                                                               │
│  Total context: ~42k tokens                                  │
└───────────────────────────────┬──────────────────────────────┘
                                │
                                │ Claude generates response
                                │ using retrieved sources
                                │
                                ▼
┌──────────────────────────────────────────────────────────────┐
│                     CLAUDE RESPONSE                           │
│  "Based on the retrieved documents, here is a comparison:    │
│                                                               │
│  ## Executive Summary                                         │
│  The client's AML policy aligns with AMLR requirements in    │
│  areas X, Y, Z, but has gaps in sections A, B, C...          │
│                                                               │
│  ## Detailed Findings                                         │
│                                                               │
│  ### 1. Customer Due Diligence (Source 1, Source 5)          │
│  AMLR Article 8 requires... The client's policy states...    │
│  Gap: The client policy does not address...                  │
│  ..."                                                         │
└───────────────────────────────┬──────────────────────────────┘
                                │
                                │ Stream response to frontend
                                │
                                ▼
┌──────────────────────────────────────────────────────────────┐
│              FRONTEND (ConversationThread)                    │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Assistant Message                                      │  │
│  │ [Markdown output rendered...]                          │  │
│  │                                                        │  │
│  │ ───────────────────────────────────────────────────── │  │
│  │ 📖 Sources Referenced                                  │  │
│  │ [1] AMLR-2024.pdf, page 12                            │  │
│  │ [2] Client-AML-Policy.docx, section 4.2               │  │
│  │ [3] AMLR-2024.pdf, page 45                            │  │
│  │ [4] KYC-Procedure.docx, section 3.1                   │  │
│  │ [5] FATF-Guidance.pdf, page 18                        │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                                │
                                │ User sees full analysis
                                │ with cited sources
                                │
                                ▼
┌──────────────────────────────────────────────────────────────┐
│                    AUDIT LOG                                  │
│  INSERT INTO audit_log (                                      │
│    session_id, module_id, model, input_tokens, output_tokens,│
│    rag_chunks                                                 │
│  ) VALUES (                                                   │
│    'session-123', 'gap-analysis', 'claude-opus-4-6',         │
│    42000, 8500,                                               │
│    '[                                                         │
│      {"citation":"AMLR-2024.pdf, page 12","relevance":0.92}, │
│      {"citation":"Client-AML-Policy.docx","relevance":0.89}, │
│      ...                                                      │
│    ]'                                                         │
│  )                                                            │
└──────────────────────────────────────────────────────────────┘
```

---

## Component Interaction Diagram

```
┌────────────────────────────────────────────────────────────────────┐
│                         React Components                            │
└────────────────────────────────────────────────────────────────────┘
           │                        │                        │
           │                        │                        │
    ┌──────▼───────┐    ┌──────────▼──────────┐    ┌───────▼────────┐
    │ ModulePage   │    │ KnowledgeSourcePanel │    │ RAGSearchPanel │
    │              │    │                      │    │   (NEW)        │
    │ - Hosts all  │───▶│ - Modes 1-5          │───▶│ - Collections  │
    │   config     │    │ - Integrates RAG     │    │ - TopK slider  │
    │ - Passes to  │    │   search panel       │    │ - Re-rank      │
    │   useClaude  │    │                      │    │                │
    └──────┬───────┘    └──────────────────────┘    └────────────────┘
           │
           │ knowledgeSources prop
           │
    ┌──────▼──────────────────────────────────────────────────────┐
    │                    useClaude Hook                            │
    │  - Calls streamMessage(config)                              │
    │  - Config includes knowledgeSources.ragSearch               │
    └──────┬──────────────────────────────────────────────────────┘
           │
           │ HTTP POST
           │
┌──────────▼─────────────────────────────────────────────────────────┐
│                      Backend API                                    │
└─────────────────────────────────────────────────────────────────────┘
           │
           │
    ┌──────▼───────────┐         ┌────────────────────────────────┐
    │ routes/claude.ts │────────▶│ services/semantic-search.ts    │
    │                  │         │  - semanticSearch(db, query)   │
    │ - Extract RAG    │         │  - Calls ChromaDB              │
    │   config         │         │  - Re-ranks results            │
    │ - Call search    │         │  - Builds citations            │
    │ - Format context │         │                                │
    │ - Call Claude    │         └────────────────────────────────┘
    │ - Log audit      │                       │
    └──────┬───────────┘                       │
           │                                   │
           │                        ┌──────────▼──────────┐
           │                        │   ChromaDB          │
           │                        │  - Vector embeddings│
           │                        │  - Cosine similarity│
           │                        └─────────────────────┘
           │
    ┌──────▼────────────────────────────────────────────────────┐
    │                SQLite Database                             │
    │  - knowledge_collections                                   │
    │  - rag_documents                                           │
    │  - rag_chunks                                              │
    │  - audit_log (rag_chunks column added)                     │
    └────────────────────────────────────────────────────────────┘
```

---

## State Flow

```
User Action                    State Update                   Backend Call
────────────────────────────────────────────────────────────────────────────

1. Toggle RAG ON          → ragSearch.enabled = true       → (none)

2. Select collection      → ragSearch.collections.push()  → (none)
   "regulations"

3. Adjust topK to 15      → ragSearch.topK = 15          → (none)

4. Enable re-rank         → ragSearch.rerank = true       → (none)

5. Type message:          → userInput = "Compare..."      → (none)
   "Compare client
    policy vs AMLR"

6. Click "Run"            → isStreaming = true            → POST /api/claude/message
                          → messages.push(userMsg)            {
                                                                 ragSearch: {
                                                                   enabled: true,
                                                                   collections: ["regulations"],
                                                                   topK: 15,
                                                                   rerank: true
                                                                 },
                                                                 userMessage: "Compare..."
                                                               }

7. Backend retrieves      → (streaming starts)            → semanticSearch(db, {
   RAG chunks                                                  query: "Compare...",
                                                                collections: ["regulations"],
                                                                topK: 15,
                                                                rerank: true
                                                              })
                                                           → Returns 15 chunks

8. Backend formats        → (context assembled)           → ragContext = "## RETRIEVED..."
   RAG context                                             → Appends to systemPrompt

9. Backend calls Claude   → (streaming continues)         → Claude API with full context

10. Stream response       → streamingText += delta        → SSE events from backend

11. Extract citations     → citations = extractCitations() → (client-side)

12. Display output        → messages.push(assistantMsg)   → (none)
                          → isStreaming = false

13. Log audit entry       → (background)                  → INSERT INTO audit_log
                                                              (rag_chunks = '[...]')
```

---

## Token Budget Management Flow

```
User configures RAG (topK = 20)
        │
        ▼
┌────────────────────────────────────────┐
│  Estimate tokens:                      │
│  - System prompt: 12,000               │
│  - User message: 8,000                 │
│  - RAG chunks (predicted): 20 × 400    │
│    = ~8,000 tokens                     │
│  ────────────────────────────           │
│  Total predicted: 28,000 tokens        │
└───────────────┬────────────────────────┘
                │
                ▼
┌────────────────────────────────────────┐
│  ContextBudgetIndicator shows:         │
│  28,000 / 128,000 (22%)                │
│  Color: GREEN ✓                        │
└────────────────────────────────────────┘
                │
                │ User increases topK to 50
                ▼
┌────────────────────────────────────────┐
│  Estimate tokens:                      │
│  - System prompt: 12,000               │
│  - User message: 8,000                 │
│  - RAG chunks (predicted): 50 × 400    │
│    = ~20,000 tokens                    │
│  ────────────────────────────           │
│  Total predicted: 40,000 tokens        │
└───────────────┬────────────────────────┘
                │
                ▼
┌────────────────────────────────────────┐
│  ContextBudgetIndicator shows:         │
│  40,000 / 128,000 (31%)                │
│  Color: GREEN ✓                        │
│  Warning: (none)                       │
└────────────────────────────────────────┘
                │
                │ After retrieval (actual tokens)
                ▼
┌────────────────────────────────────────┐
│  Actual tokens:                        │
│  - System prompt: 12,000               │
│  - RAG chunks (actual): 30,000         │
│    (some chunks were longer)           │
│  - User message: 8,000                 │
│  ────────────────────────────           │
│  Total: 50,000 tokens                  │
└───────────────┬────────────────────────┘
                │
                ▼
┌────────────────────────────────────────┐
│  ContextBudgetIndicator updates:       │
│  50,000 / 128,000 (39%)                │
│  Color: GREEN ✓                        │
└────────────────────────────────────────┘
                │
                │ User tries topK = 100
                ▼
┌────────────────────────────────────────┐
│  Predicted tokens: ~52,000             │
│  Actual after retrieval: 125,000       │
│  ────────────────────────────           │
│  98% of context used!                  │
└───────────────┬────────────────────────┘
                │
                ▼
┌────────────────────────────────────────┐
│  ContextBudgetIndicator shows:         │
│  125,000 / 128,000 (98%)               │
│  Color: RED ⚠                          │
│  Warning: "Approaching context limit.  │
│   Consider reducing RAG chunks or      │
│   using a model with larger context."  │
└────────────────────────────────────────┘
```

---

## Error Handling Flow

```
User submits query with RAG enabled
        │
        ▼
┌────────────────────────────────────────┐
│  Backend: Extract ragSearch config     │
│  Validate: collections.length > 0      │
└───────────────┬────────────────────────┘
                │
                ├─── Error: collections empty
                │    └─▶ Skip RAG, continue with regular flow
                │
                ├─── Error: ChromaDB unavailable
                │    └─▶ Log error, skip RAG, continue
                │         (RAG is non-fatal)
                │
                └─── Success ✓
                     │
                     ▼
          ┌────────────────────────────────────┐
          │  semanticSearch(db, query)         │
          │  Try each collection               │
          └───────────────┬────────────────────┘
                          │
                          ├─── Error: Collection not found
                          │    └─▶ Skip collection, try next
                          │
                          ├─── Error: Query failed
                          │    └─▶ Log error, return empty results
                          │
                          └─── Success ✓
                               │
                               ▼
                    ┌──────────────────────────────┐
                    │  Format RAG context          │
                    │  Estimate tokens             │
                    └───────────┬──────────────────┘
                                │
                                ├─── Warning: Token limit exceeded
                                │    └─▶ Truncate context, log warning
                                │
                                └─── Success ✓
                                     │
                                     ▼
                          ┌──────────────────────────┐
                          │  Call Claude API         │
                          │  Stream response         │
                          └──────────────────────────┘
```

---

**Version**: 1.0
**Component**: RAG Integration (Phase 4.8 + 4.9)
**Status**: ✅ Production Ready
