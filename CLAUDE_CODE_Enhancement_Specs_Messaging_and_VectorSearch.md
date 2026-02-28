# openEXPERT / ANTON — Enhancement Specifications for Claude Code

## Two Enhancement Areas: Messaging Integration & Semantic Search

> **Audience:** Claude Code
> **Purpose:** Investigation-first briefing for two platform enhancements. Each section follows the same pattern: (1) investigate what exists, (2) understand what connects, (3) determine what to build.
> **Critical rule:** Read this entire document before writing a single line of code. Then explore the codebase to validate assumptions. The platform is large (82 tables, 41 routes, 36 pages, 53 services) — rushing into implementation without understanding what already exists will create duplication and inconsistency.

---

# ENHANCEMENT A: Messaging Platform Integration (Slack / Microsoft Teams)

## A.1 Why This Matters

openEXPERT is a full web application with 36 pages. But enterprise users spend 70%+ of their day in Slack or Microsoft Teams. The ability to invoke ANTON from a messaging platform — even in a lightweight way — dramatically lowers the barrier to use.

This is NOT about rebuilding the UI in Slack. It's about creating a thin integration layer that lets users trigger key actions from where they already are, then links them back to the full UI for complex work.

## A.2 Investigation Phase — What to Examine First

Before designing anything, Claude Code must understand what already exists that this integration will connect to:

### Existing infrastructure to investigate:

**1. The API routes layer (`server/routes/`)**
- Examine all 41 route modules. Map out which routes handle:
  - Session creation and execution (`/api/claude/*`, `/api/sessions/*`)
  - Module listing and selection (`/api/modules/*`)
  - Workflow triggering (`/api/workflows/*`)
  - Export generation (`/api/export/*`)
  - Brief Me functionality (zero-config module inference)
  - Quality scores and status (`/api/quality/*`)
- Document the request/response format for each relevant route
- Note: These routes are the foundation. The messaging integration should call these existing routes, not bypass them.

**2. The authentication system (`server/middleware/`)**
- How does JWT auth work? (`auth.ts`, `budget.ts`, `rate-limit.ts`)
- Can API keys be generated for service accounts? Or only username/password JWT?
- Is there a mechanism for webhook authentication (HMAC signature verification)?
- Note: Slack/Teams webhooks need a different auth model than browser JWT. Investigate whether a new "API key" auth path is needed.

**3. The Brief Me interaction mode (`src/pages/BriefMePage.tsx` + backend)**
- This is the closest existing analog to what a messaging bot would do: user sends a question → ANTON infers the right module → returns a response
- How does module inference work? What service handles it?
- What's the input format and response format?
- Can this be invoked programmatically (not just through the React UI)?

**4. The workflow engine (`server/services/workflow-engine.ts`)**
- Can workflows be triggered via API?
- What's the mechanism for external triggers?
- How are workflow status updates communicated?
- Are there webhook/callback mechanisms when workflows complete?

**5. The connections framework (`server/services/connection-manager.ts`)**
- Already supports: databases, APIs, filesystems, email, scripts
- Does it already have a "webhook" or "messaging" adapter?
- What's the adapter interface? Can a new "slack" or "teams" adapter be added?
- How are connections stored, authenticated, and audited?

**6. Email step type in workflows**
- Workflow step type 8 is "Email" — sends notifications via SMTP
- How is this implemented? What service handles it?
- This is architecturally similar to a Slack message. Can the same pattern be extended?

**7. The MCP server (`pnpm run mcp`)**
- Already exposes modules as tools for Claude Desktop
- How is this structured? What pattern does it follow?
- The MCP server is another "external interface" to ANTON — the messaging integration is conceptually similar

**8. Audit logging**
- How are actions logged? (`audit_log`, `connection_audit_log`, `security_events`)
- Every messaging interaction must be logged for compliance
- What's the existing logging interface?

### Output of investigation phase:

Produce a brief document (can be a comment at the top of a new file or in a separate `.md`) with:
- List of relevant routes with their signatures
- Auth model assessment (can we support API keys or need to add them?)
- Brief Me service flow (input → processing → output)
- Workflow trigger mechanism
- Connections framework adapter interface
- Audit logging interface

## A.3 Design Principles

Once investigation is complete, the implementation should follow these principles:

**1. Thin integration, not a parallel UI**
The Slack/Teams bot should be a lightweight gateway that routes requests to existing services. It should NOT contain business logic, module definitions, prompt assembly, or LLM calls. All of that goes through the existing `unified-llm-client.ts` and `prompt-builder.ts` via the standard API routes.

**2. Two-way but asymmetric**
- **Inbound (Slack/Teams → ANTON):** Commands, questions, workflow triggers
- **Outbound (ANTON → Slack/Teams):** Notifications, workflow status, brief results
- Complex outputs (full gap analyses, detailed reports) should link back to the web UI, not be dumped into a Slack channel

**3. Use the connections framework**
Don't build a standalone Slack service. Build it as a new connection type within the existing `connection-manager.ts` framework. This means:
- Connections are stored in the `connections` table
- Credentials are managed through the existing connection UI
- Audit logging happens automatically through `connection_audit_log`
- The admin can approve/revoke connections

**4. Align with workflow step types**
Add a new workflow step type: "Messaging Notification" (similar to step type 8: Email). This lets workflows send Slack/Teams messages at any point. This is potentially more valuable than a command bot.

## A.4 Proposed Capabilities (In Priority Order)

### Priority 1: Outbound Notifications (Workflow → Messaging)
**New workflow step type: "Messaging Notification"**
- When a workflow reaches this step, send a message to a configured Slack channel or Teams channel
- Message content: templated with variable substitution from previous steps
- Include a link back to the openEXPERT session/workflow
- Authentication: Slack webhook URL or Teams incoming webhook URL (simplest integration, no bot needed)

This is the lowest-effort, highest-value integration. No Slack app registration needed — just an incoming webhook URL.

**Implementation approach:**
- New adapter in connections framework: `slack-webhook-adapter.ts`, `teams-webhook-adapter.ts`
- New workflow step type registered in workflow engine
- New connection type in the connections UI: "Slack Webhook" / "Teams Webhook"
- Test: Create a workflow that runs a gap analysis → sends result summary to Slack channel

### Priority 2: Inbound Commands (Messaging → ANTON)
**Slack slash commands / Teams bot commands**
- `/anton brief [question]` — Routes to Brief Me service, returns concise answer in Slack
- `/anton run [module-name]` — Triggers a module execution, returns link to full output in web UI
- `/anton status [workflow-id]` — Returns current workflow status
- `/anton latest [area]` — Returns most recent session in an area

This requires a Slack app or Teams bot registration. More complex than webhooks.

**Implementation approach:**
- New Express route: `/api/integrations/slack/commands` (receives Slack slash command payloads)
- New Express route: `/api/integrations/teams/commands` (receives Teams bot activity)
- HMAC signature verification for Slack (`x-slack-signature` header)
- Map commands to existing service calls (Brief Me service, workflow trigger, session query)
- Response formatting: Slack Block Kit / Teams Adaptive Cards (rich formatting)
- API key auth model (service account that represents the Slack/Teams integration)

### Priority 3: Interactive Notifications
**Slack/Teams messages with action buttons**
- Workflow checkpoint: "Gap analysis complete. [Approve] [Request Changes] [View Full Output]"
- Clicking "Approve" or "Request Changes" routes back to ANTON's checkpoint decision API
- This enables the human-in-the-loop workflow without leaving Slack

**Implementation approach:**
- Slack interactive messages (action buttons with callback URLs)
- Teams Adaptive Card actions
- New route: `/api/integrations/slack/interactions` (handles button clicks)
- Maps to existing checkpoint decision service

## A.5 Technical Considerations

**Slack specifics:**
- Incoming Webhooks: Just a URL, post JSON. Simplest possible integration.
- Slash Commands: Requires Slack app, provides request URL, sends POST with command text
- Interactive Components: Requires interactivity URL, handles button clicks
- Block Kit: Rich message formatting (sections, buttons, fields, images)
- 3-second response timeout: For slow LLM calls, acknowledge immediately → post result later via `response_url`

**Teams specifics:**
- Incoming Webhooks: Similar to Slack, just a URL
- Bot Framework: More complex than Slack, requires Azure Bot registration
- Adaptive Cards: Rich card format (equivalent to Slack Block Kit)
- Proactive messaging: Requires storing `conversationReference` for later messages

**For both:**
- Rate limiting (respect Slack/Teams API limits)
- Error handling (graceful degradation if messaging platform is unreachable)
- Credential storage (webhook URLs, bot tokens stored encrypted in `connections` table)
- Audit trail (every messaging interaction logged)

## A.6 File Structure Suggestion

```
server/
  services/
    integrations/
      slack-webhook.ts          # Outbound webhook messaging
      slack-commands.ts         # Inbound slash command handling
      slack-interactions.ts     # Interactive message callbacks
      teams-webhook.ts          # Outbound webhook messaging
      teams-bot.ts              # Inbound bot command handling
      message-formatter.ts      # Shared formatting (plain text, Block Kit, Adaptive Cards)
  routes/
    integrations.ts             # /api/integrations/* routes
  adapters/
    messaging-adapter.ts        # Connection framework adapter for messaging
```

## A.7 What NOT to Build

- Don't build a full conversational bot with multi-turn dialogue. That's what the web UI is for.
- Don't send full LLM outputs into Slack/Teams. Send summaries with links.
- Don't bypass the existing auth/RBAC/audit system. Route through it.
- Don't build separate Slack and Teams implementations. Build a messaging abstraction layer and implement both behind it.
- Don't build OAuth flows for Slack/Teams app installation. Start with manual webhook URL configuration. OAuth app distribution can come later.

---

# ENHANCEMENT B: Vector Database & Semantic Search Enhancement

## B.1 Why This Matters

openEXPERT has a sophisticated intelligence stack: knowledge atoms, knowledge graph, pattern detection, institutional memory. But the *retrieval* layer — finding relevant past knowledge when you need it — is the bottleneck. Basic text similarity works for exact matches, but misses conceptual connections.

Semantic search (vector embeddings) lets the system find content that is *conceptually similar* even when the words are different. "Transaction monitoring" should match "payment surveillance." "Customer due diligence" should match "Know Your Customer."

This is critical for: institutional memory retrieval, knowledge atom discovery, RAG-powered module execution, and cross-workflow intelligence.

## B.2 Investigation Phase — What to Examine First

**This is particularly important because the implementation checklist suggests RAG/Chroma/BM25 may already be partially implemented.** Claude Code must assess what actually exists vs. what's scaffolded vs. what's planned.

### Existing infrastructure to investigate:

**1. RAG and search services**
- Find and read: any files matching `*rag*`, `*search*`, `*embed*`, `*vector*`, `*chroma*`, `*bm25*`
- Check `server/services/` for any semantic search service
- Check `server/routes/` — the checklist mentions `/api/rag/*`, `/api/search/*`, `/api/collections/*`
- What's actually functional vs. stubbed out?
- Are there vector embeddings being generated anywhere? With what model?

**2. The Institutional Memory service (`server/services/institutional-memory.ts`)**
- How does similarity matching currently work?
- The whitepaper says "basic algorithm" — what algorithm?
- Is it string similarity? TF-IDF? Something else?
- What's the `decision_similarities` table schema? How are scores calculated?
- Where are the bottlenecks? What queries are slow?

**3. Knowledge Atoms tables and services**
- `knowledge_atoms`, `atom_sources`, `atom_tags`, `atom_relationships`
- How are atoms currently searched? Full-text? SQL LIKE?
- Is there any indexing beyond SQLite's built-in FTS?
- How many atoms does a typical installation accumulate? (Scale question)

**4. Knowledge Graph entity search**
- `entity_nodes`, `entity_relationships`, `entity_mentions`, `entity_aliases`
- How are entities currently matched? Exact string? Fuzzy?
- The entity_aliases table suggests some fuzzy matching — how is it used?

**5. The Knowledge Source system (`server/services/knowledge-source.ts`)**
- Mode 3 (Local Folder) and Mode 4 (Combined) — how is content indexed?
- `folder-indexer.ts`, `file-processor.ts` — what do these produce?
- Are document chunks stored? (`document_chunks`, `chunk_terms` tables exist)
- Is there already a chunking strategy? What chunk size?

**6. SQLite FTS (Full-Text Search)**
- Does the schema use any FTS5 virtual tables?
- SQLite has built-in full-text search — is it being used?
- If so, what's indexed? What's the query interface?

**7. Dependencies in `package.json`**
- Is `chromadb` already a dependency? What version?
- Is any embedding library present? (`@xenova/transformers`, `openai` embeddings, etc.)
- Are there BM25 libraries? (`bm25`, `wink-bm25-text-search`, etc.)

**8. The RAG pages**
- `KnowledgeBasePage.tsx`, `KnowledgeGraphPage.tsx`
- What search UI exists? Can users search across knowledge?
- Is there a unified search bar or is it fragmented?

### Output of investigation phase:

Produce a status assessment:
```
COMPONENT               | STATUS          | NOTES
RAG service             | [functional/stub/missing]  | ...
Chroma integration      | [functional/stub/missing]  | ...
BM25 search             | [functional/stub/missing]  | ...
Vector embeddings       | [functional/stub/missing]  | ...
Document chunking       | [functional/stub/missing]  | ...
SQLite FTS              | [functional/stub/missing]  | ...
Unified search API      | [functional/stub/missing]  | ...
Institutional Memory    | [basic algo/semantic]       | ...
Knowledge Atom search   | [exact/fuzzy/semantic]      | ...
Entity matching         | [exact/fuzzy/semantic]      | ...
```

## B.3 Design Principles

**1. Enhance, don't replace**
Whatever exists that works — keep it. Layer semantic search on top. BM25 + vector search (hybrid retrieval) outperforms either alone.

**2. Embedding model choice matters**
For a local-first platform, consider:
- **Option A: Anthropic Voyage embeddings** (API-based, high quality, costs money per call)
- **Option B: OpenAI `text-embedding-3-small`** (API-based, cheap, good quality)
- **Option C: Local embeddings via `@xenova/transformers`** (runs on user's machine, free, slower, smaller models)
- **Option D: Ollama embeddings** (already a supported provider, can run `nomic-embed-text` or `mxbai-embed-large` locally)

Recommendation: Support multiple, defaulting to the user's configured LLM provider. If they use Claude → Voyage. If they use OpenAI → OpenAI embeddings. If they use Ollama → local embedding model. This aligns with the existing multi-LLM adapter pattern.

**3. Storage: SQLite-first with upgrade path**
For local-first simplicity:
- Store vectors in SQLite using a new `embeddings` table (or use `sqlite-vec` extension if available)
- For users who need scale: support ChromaDB as an optional backend
- The adapter pattern used for LLMs (`model-adapter.ts`) should be replicated for vector storage (`vector-store-adapter.ts`)

For the planned PostgreSQL migration: pgvector is the natural choice and should be in the adapter interface from day one.

**4. Embed at write time, not query time**
When a knowledge atom is created, a session is completed, or a document is indexed — generate and store the embedding immediately. Don't compute embeddings at search time (too slow for real-time queries).

## B.4 What Should Be Embeddable (Content Types)

Each of these content types should have vector embeddings generated and stored:

| Content Type | Source Table | When to Embed | What to Embed |
|---|---|---|---|
| Knowledge atoms | `knowledge_atoms` | On atom creation | `content` field (the extracted fact/insight/conclusion) |
| Checkpoint decisions | `checkpoint_decisions` | On checkpoint | `decision_text` + `reasoning` |
| Session outputs | `messages` (assistant role) | On session complete | Output content (possibly chunked if long) |
| Document chunks | `document_chunks` / `rag_chunks` | On document index | Chunk text |
| Entity descriptions | `entity_nodes` | On entity creation/update | `name` + `description` + key relationship context |
| Module descriptions | Constants / `custom_modules` | On startup / module creation | Module name + description + area context |

## B.5 Search Architecture

### Hybrid retrieval pipeline:

```
User query
    │
    ├──→ [1] BM25 keyword search (fast, exact terms)
    │         Returns: top-N results with BM25 scores
    │
    ├──→ [2] Vector similarity search (semantic meaning)
    │         Embed query → cosine similarity against stored vectors
    │         Returns: top-N results with similarity scores
    │
    └──→ [3] Reciprocal Rank Fusion (RRF)
              Combines BM25 and vector results
              Re-ranks by fused score
              Returns: final top-K results
```

### Integration points (where semantic search improves existing features):

**A. Institutional Memory — Decision Retrieval**
- Current: Basic similarity matching when checkpointing
- Enhanced: Embed the new decision → find semantically similar past decisions → surface with context
- Impact: "This looks similar to a decision you made 3 months ago about PEP screening in high-risk jurisdictions"

**B. Knowledge Source — Document Retrieval (RAG)**
- Current: Full-text search / keyword matching on indexed documents
- Enhanced: Chunk documents → embed chunks → at query time, find relevant chunks → inject into prompt as context
- Impact: Module execution with deep knowledge from uploaded documents, not just keyword matches

**C. Brief Me — Module Selection**
- Current: Module inference (likely keyword-based)
- Enhanced: Embed all module descriptions → when user asks a question, find closest module by meaning
- Impact: "What are the reporting requirements under AMLR?" → correctly routes to FIU Reporting module even without exact keyword match

**D. Knowledge Graph — Entity Discovery**
- Current: Exact/alias matching for entities
- Enhanced: Semantic matching for entity search ("transaction monitoring system" finds entities tagged as "TM platform" or "payment surveillance tool")
- Impact: Better entity deduplication, better cross-reference discovery

**E. Cross-Workflow Intelligence — Pattern Discovery**
- Current: Co-occurrence counting, temporal analysis
- Enhanced: Cluster similar knowledge atoms semantically → find thematic patterns that co-occurrence alone misses
- Impact: "Multiple sessions mention data quality concerns in different contexts — this might be a systemic issue"

## B.6 Implementation Approach

### Phase 1: Foundation (build the embedding pipeline)

**Step 1: Create the embedding adapter**
```
server/services/embedding-adapter.ts
```
- Interface: `embed(text: string): Promise<number[]>` and `embedBatch(texts: string[]): Promise<number[][]>`
- Implementations: `VoyageEmbedder`, `OpenAIEmbedder`, `OllamaEmbedder`
- Selection: Based on user's configured primary LLM provider (settings table)
- Dimension handling: Different models have different dimensions — store dimension alongside vectors

**Step 2: Create the vector store adapter**
```
server/services/vector-store-adapter.ts
```
- Interface: `store(id, vector, metadata)`, `search(vector, topK, filter?)`, `delete(id)`
- Implementation 1: `SQLiteVectorStore` — stores vectors as JSON blobs in an `embeddings` table, computes cosine similarity in-process (works for <100k vectors)
- Implementation 2: `ChromaVectorStore` — delegates to ChromaDB (for users who want scale)
- Implementation 3: (future) `PgVectorStore` — for PostgreSQL deployments

**Step 3: Create the embeddings table**
```sql
CREATE TABLE IF NOT EXISTS embeddings (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,        -- 'knowledge_atom', 'checkpoint', 'session_output', 'document_chunk', 'entity', 'module'
  content_id TEXT NOT NULL,          -- FK to source table
  content_text TEXT NOT NULL,        -- The text that was embedded (for re-embedding if model changes)
  embedding BLOB NOT NULL,           -- The vector (stored as binary float array)
  embedding_model TEXT NOT NULL,     -- Which model generated this
  embedding_dimension INTEGER NOT NULL,
  metadata TEXT,                     -- JSON metadata (area, module, project, tags)
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(content_type, content_id, embedding_model)
);

CREATE INDEX idx_embeddings_content ON embeddings(content_type, content_id);
CREATE INDEX idx_embeddings_model ON embeddings(embedding_model);
```

**Step 4: Embed existing content (backfill)**
- Create a migration script that embeds all existing knowledge atoms, checkpoint decisions, and module descriptions
- Run in background (can be slow, should not block the application)
- Track progress in a `migration_status` table or log

### Phase 2: Search Service (unified search API)

**Step 5: Create the hybrid search service**
```
server/services/hybrid-search.ts
```
- Input: query string, content type filter (optional), top-K
- Process: BM25 search + vector search → RRF merge → return ranked results
- Output: `{ results: [{ id, content_type, content_id, score, snippet, metadata }] }`

**Step 6: Create/enhance the search route**
```
server/routes/search.ts  (may already exist — enhance it)
```
- `POST /api/search` — unified search across all embeddable content
- `POST /api/search/similar` — "find similar to this item" (takes a content_type + content_id, returns similar)
- `POST /api/search/semantic` — pure vector search (for debugging/advanced use)

### Phase 3: Integration (wire into existing features)

**Step 7: Enhance institutional memory**
- Modify `institutional-memory.ts` to use vector similarity instead of (or alongside) basic matching
- When user checkpoints a decision → embed it → search for similar past decisions → surface

**Step 8: Enhance RAG document retrieval**
- Modify the knowledge source resolver to use vector search for Mode 3/4
- When building prompt with local document context → vector search for relevant chunks → inject

**Step 9: Enhance Brief Me module selection**
- Embed all module descriptions on startup
- When user asks a question → embed question → find closest modules → suggest

**Step 10: Add search UI**
- If a unified search component doesn't exist: add a search bar to the dashboard or navigation
- Results should link to source (session, knowledge atom, document, entity)
- Filter by content type, area, date range

## B.7 Performance Considerations

**For SQLite vector store (small-medium installations, <100k vectors):**
- Cosine similarity computed in-process (JavaScript/TypeScript)
- Load vectors into memory on startup for fast search
- Acceptable for single-user or small team installations
- Typical query time: 10-50ms for 50k vectors

**For ChromaDB (large installations, >100k vectors):**
- Runs as a separate process or Docker container
- HNSW index for fast approximate nearest neighbor search
- Handles millions of vectors
- Typical query time: 5-20ms regardless of scale

**Embedding generation costs:**
- Voyage: ~$0.10 per million tokens
- OpenAI text-embedding-3-small: ~$0.02 per million tokens
- Ollama (local): $0 (but slower, ~50-200ms per embedding)
- Typical knowledge atom: ~100 tokens → negligible cost

**Batch embedding is important:**
- When indexing a folder of documents, batch embed all chunks in one API call
- Most embedding APIs support batching (up to 2048 inputs per call for OpenAI)

## B.8 What NOT to Build

- Don't replace SQLite with a vector database for general storage. SQLite remains the primary database. Vector storage is supplementary.
- Don't make ChromaDB a hard dependency. It should be optional for users who want scale. The SQLite vector store should be the default.
- Don't embed everything at query time. Embed at write time, search at query time.
- Don't build a custom embedding model. Use existing providers through the adapter.
- Don't forget to handle embedding model changes — if a user switches from OpenAI to Voyage, existing embeddings are incompatible. Track `embedding_model` per vector and support re-embedding.
- Don't ignore the existing search code. Investigate first, then enhance. There may be more here than expected.

## B.9 File Structure Suggestion

```
server/
  services/
    embedding-adapter.ts            # Multi-provider embedding generation
    vector-store-adapter.ts         # Multi-backend vector storage
    vector-stores/
      sqlite-vector-store.ts        # SQLite-based vector storage (default)
      chroma-vector-store.ts        # ChromaDB backend (optional)
    hybrid-search.ts                # BM25 + vector search fusion
    embedding-pipeline.ts           # Background embedding of new content
  routes/
    search.ts                       # Enhanced /api/search/* routes
  migrations/
    embed-existing-content.ts       # Backfill script for existing data
```

---

# GENERAL NOTES FOR CLAUDE CODE

## Investigation Workflow

For both enhancements, follow this exact workflow:

1. **Read this document fully** (you're doing this now)
2. **Explore the codebase structure:**
   ```bash
   find server/services -type f -name "*.ts" | sort
   find server/routes -type f -name "*.ts" | sort
   find src/pages -type f -name "*.tsx" | sort
   ```
3. **Read the specific files mentioned** in each investigation section
4. **Check `package.json`** for existing dependencies (chromadb, embedding libs, slack/teams SDKs)
5. **Check the database schema** for existing tables (`schema_enhanced.sql` or equivalent)
6. **Produce investigation findings** before writing any implementation code
7. **Propose a plan** based on what actually exists (not what the docs say should exist)
8. **Implement incrementally** — get the simplest version working first, then layer capabilities

## Integration Standards

Both enhancements must follow the existing platform conventions:

- **Adapter pattern:** Multi-provider support via adapters (like `model-adapter.ts`)
- **Database:** New tables in the existing SQLite schema, following naming conventions
- **Routes:** Follow existing Express route patterns (`server/routes/*.ts`)
- **Audit logging:** All actions logged via existing audit service
- **Error handling:** Follow existing error handling patterns
- **TypeScript:** Strict types, no `any` unless unavoidable
- **Configuration:** Settings stored in `app_settings` table or environment variables, configurable through the Settings page

## Priority

If forced to choose between the two enhancements:

**Enhancement B (Semantic Search) is more impactful** — it improves every interaction with the platform by making knowledge retrieval smarter. It's invisible to users but makes everything better.

**Enhancement A (Messaging Integration) is more visible** — it opens a new interaction channel. Start with Priority 1 (outbound webhooks) which is trivially simple and immediately useful.

**Recommended approach:** Start with Enhancement B Phase 1-2 (embedding pipeline + search service), then do Enhancement A Priority 1 (webhook notifications), then return to Enhancement B Phase 3 (integration into existing features), then Enhancement A Priority 2-3 (inbound commands + interactive messages).
