# Investigation Findings — Messaging & Vector Search Enhancements
*Generated: 2026-02-27*

---

## Enhancement B: Vector Search — Status Assessment

| COMPONENT | STATUS | NOTES |
|---|---|---|
| RAG service (BM25) | **FUNCTIONAL** | `server/services/rag/` — bm25.ts, chunker.ts, indexer.ts, retriever.ts. Full BM25 (k1=1.5, b=0.75) with Nordic language support. Exposed via `POST /api/rag/search`. Chunks stored in `document_chunks` + `chunk_terms` tables. |
| Chroma integration | **FUNCTIONAL** (requires `OPENAI_API_KEY`) | `server/services/chroma-client.ts` — ChromaDB v1.8.1 with OpenAI embedding function, HNSW cosine, full CRUD. Hard-dependency on OpenAI key; graceful failure if missing. Collections exposed via `/api/collections/*`. |
| BM25 search | **FUNCTIONAL** | Custom JS BM25 implementation (not SQLite FTS5). IDF scoring, term frequency normalisation, tokenisation. Used via `rag/retriever.ts`. |
| Vector embeddings | **FUNCTIONAL** (requires `OPENAI_API_KEY`) | `server/services/embeddings.ts` — OpenAI `text-embedding-3-small` (1536 dims), cosine similarity, batch processing, in-memory cache. Hardcoded to OpenAI — no multi-provider adapter yet. |
| Document chunking | **FUNCTIONAL** | `server/services/rag/chunker.ts` — 1000 char chunks, 200 char overlap, sentence-boundary aware. |
| SQLite FTS5 | **NOT USED** | No FTS5 virtual tables in schema. BM25 is custom-implemented in JS on top of `chunk_terms` table. |
| Unified search API | **PARTIAL** | `server/routes/search.ts` has `/api/search/semantic` + `/api/search/keyword` + `/api/search/hybrid`. BUT: keyword search uses SQLite LIKE (not BM25), and `/api/rag/search` is a separate BM25 endpoint. Two disconnected search systems; no "search all content types" endpoint. |
| Institutional Memory | **SEMANTIC** | `server/services/institutional-memory.ts` — uses `generateDecisionEmbedding()` + `cosineSimilarity()` from embeddings.ts. Stores binary vectors in `checkpoint_decisions.embedding` column. Has clustering via JS k-means-like approach. |
| Knowledge Atom search | **UNKNOWN** | `knowledge_atoms` table exists (confirmed in db list). No dedicated search service found. Likely SQL LIKE or full-text. Needs verification. |
| Entity matching | **PARTIAL** | `entity_nodes`, `entity_aliases` tables exist. `entity_aliases` suggests fuzzy/synonym matching. No semantic matching found. |

### Key gaps vs spec B.6:

1. **No `embedding-adapter.ts`** — embeddings hardcoded to OpenAI. Need multi-provider: OpenAI, Voyage, Ollama.
2. **No `vector-store-adapter.ts`** — vectors split across: ChromaDB (for document collections), binary blobs in `checkpoint_decisions`, no unified interface.
3. **No `embeddings` table** — the spec's proposed cross-content-type vector store doesn't exist. Related: `rag_chunks` table in schema vs `document_chunks` table — may be duplicates.
4. **No `hybrid-search.ts` (unified)** — `semantic-search.ts` (Chroma + SQLite LIKE) and `rag/retriever.ts` (BM25) are two separate systems. Need to merge.
5. **ChromaDB requires a running server** — separate process or Docker, not embedded. For "local-first" simplicity, the SQLite vector store approach (spec B.3) is better default.
6. **No backfill for existing content** — knowledge atoms, module descriptions, session outputs have no embeddings.

### Recommended starting point (spec B.6):

The existing code maps to the spec as follows:
- `embeddings.ts` → becomes the OpenAI implementation inside `embedding-adapter.ts`
- `chroma-client.ts` → becomes the ChromaDB implementation inside `vector-store-adapter.ts`
- `rag/retriever.ts` → becomes the keyword search component of `hybrid-search.ts`
- `semantic-search.ts` → consolidate into `hybrid-search.ts` (currently partially does this)

The `embeddings` table from the spec is the missing piece to unify across content types.

---

## Enhancement A: Messaging Integration — Status Assessment

| COMPONENT | STATUS | NOTES |
|---|---|---|
| Connection framework | **FUNCTIONAL** | `server/services/connection-manager.ts` — types: `database`, `api`, `filesystem`, `email`, `script_library`. Full CRUD, encrypted config (credential-vault.ts), approval workflow, `connection_audit_log`. No `messaging` type yet but architecture is perfect for adding it. |
| Email service | **FUNCTIONAL** | `server/services/email.ts` — nodemailer, SMTP + Ethereal fallback. Functions: `sendTaskCompleteEmail`, `sendDeadlineReminderEmail`, `sendProjectInvitationEmail`, `sendPasswordResetEmail`. This is the exact pattern to replicate for Slack/Teams webhooks. |
| Workflow executor | **FUNCTIONAL** | `server/services/workflow-executor.ts` — `HEADLESS_STEP_TYPES` includes `email_send` and `notification`. Adding `messaging_notification` is straightforward. Works for scheduled/headless runs. |
| Auth model | **PARTIAL** | Two paths: (1) Solo mode: no auth, all requests → `{id: 'solo', role: 'admin'}`. (2) Team mode: JWT Bearer token validated against `user_sessions` table. **No API key auth path** — Slack/Teams webhook HMAC verification requires new auth mechanism. |
| Brief Me service | **UNCLEAR** | No `brief*.ts` service file found. BriefMePage.tsx likely calls claude.ts route directly. Needs investigation. Module inference may be keyword-based in prompt-builder.ts. |
| MCP server | **EXISTS** | `server/mcp/mcp-server.ts` + `server/mcp/mcp-tools.ts` — exposes modules as tools for Claude Desktop. Good structural reference for "external interface to ANTON" pattern. |
| Slack SDK | **NOT INSTALLED** | No `@slack/web-api`, `@slack/bolt`, or similar in package.json. Would need to add, or use plain `fetch` for simple webhook POSTs (Priority 1 doesn't need it). |
| Teams SDK | **NOT INSTALLED** | No `botframework-connector` or similar. Plain `fetch` for webhook POSTs is sufficient for Priority 1. |

### Key gaps vs spec A.4:

1. **No webhook auth mechanism** — Slack slash commands use HMAC-SHA256 (`x-slack-signature`). No existing pattern for this in the codebase. Need `crypto.createHmac()` verification.
2. **No API key auth path** — Inbound commands (Priority 2) need a service account concept. Could add an `api_keys` table or reuse the connections framework with a "bot token" config field.
3. **No messaging connection type** — `connection-manager.ts` needs a new type: `messaging`. Simple to add.
4. **No `messaging_notification` workflow step type** — `workflow-executor.ts` handles `email_send`; adding `messaging_notification` follows identical pattern.

### Priority 1 (outbound webhooks) assessment:
**Very low effort.** Needs:
- `server/services/integrations/slack-webhook.ts` — `postMessage(webhookUrl, payload)` using `fetch`
- `server/services/integrations/teams-webhook.ts` — same pattern, different JSON format
- Add `messaging` to `ConnectionType` in `connection-manager.ts`
- Add `messaging_notification` to `HEADLESS_STEP_TYPES` in `workflow-executor.ts`
- New route in `server/routes/integrations.ts` or extend workflows route

No new npm packages required for Priority 1.

---

## Relevant Existing Routes (for messaging integration)

| Route | File | Purpose |
|---|---|---|
| `POST /api/claude/stream` | routes/claude.ts | Main LLM execution (streaming) |
| `GET /api/modules` | routes/commands.ts or modules | List available modules |
| `POST /api/workflows/:id/trigger` | routes/workflows.ts | Trigger a workflow |
| `GET /api/workflows/:id/runs` | routes/workflows.ts | Get workflow run status |
| `POST /api/export/:format` | routes/export.ts | Generate exports |
| `GET /api/quality/sessions/:id` | routes/quality.ts | Quality scores |
| `POST /api/auth/login` | routes/auth.ts | JWT auth (team mode) |

---

## Recommended Implementation Order (per spec priority recommendation)

1. **Enhancement B Phase 1** — `embedding-adapter.ts` (multi-provider) + `embeddings` table migration
2. **Enhancement B Phase 2** — `vector-store-adapter.ts` + `hybrid-search.ts` (unifies BM25 + vector)
3. **Enhancement A Priority 1** — Outbound Slack + Teams webhooks as workflow step type
4. **Enhancement B Phase 3** — Wire semantic search into institutional memory + knowledge atoms
5. **Enhancement A Priority 2** — Inbound slash commands (requires HMAC auth addition)

---

## Files to Create/Modify (Summary)

### Enhancement B:
- **New:** `server/services/embedding-adapter.ts`
- **New:** `server/services/vector-store-adapter.ts`
- **New:** `server/services/vector-stores/sqlite-vector-store.ts`
- **New:** `server/services/vector-stores/chroma-vector-store.ts` (wraps existing chroma-client.ts)
- **New:** `server/services/hybrid-search.ts` (unifies rag/retriever.ts + semantic-search.ts)
- **Modify:** `server/db/schema.sql` — add `embeddings` table
- **Modify:** `server/services/institutional-memory.ts` — use embedding-adapter.ts
- **Modify:** `server/routes/search.ts` — use hybrid-search.ts

### Enhancement A:
- **New:** `server/services/integrations/slack-webhook.ts`
- **New:** `server/services/integrations/teams-webhook.ts`
- **New:** `server/services/integrations/message-formatter.ts`
- **New:** `server/routes/integrations.ts`
- **Modify:** `server/services/connection-manager.ts` — add `messaging` type
- **Modify:** `server/services/workflow-executor.ts` — add `messaging_notification` step type
