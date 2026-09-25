/**
 * Hybrid Search Service — unifies BM25 keyword search + vector similarity search.
 *
 * Uses Reciprocal Rank Fusion (RRF) to merge results from both systems.
 * Works across all content types stored in the embeddings table + document_chunks.
 *
 * Content types supported:
 *   'knowledge_atom'    — entries from knowledge_atoms table
 *   'checkpoint'        — entries from checkpoint_decisions table
 *   'session_output'    — entries from messages table (assistant role)
 *   'document_chunk'    — entries from document_chunks table (BM25-indexed folders)
 *   'module'            — module descriptions (embedded at startup)
 */

import type { DatabaseAdapter } from '../db/database.js';
import { scopesToOwner, type OwnedRequest } from '../middleware/ownership.js';
import { isTeamMode } from '../middleware/role-guards.js';

import { getEmbeddingAdapter, isZeroVector } from './embedding-adapter.js';
import { getVectorStore, type VectorSearchResult } from './vector-store-adapter.js';
import { retrieveChunks } from './rag/retriever.js';
import { checkEmbeddingPin, ensureEmbeddingPin } from './embedding-pin.js';

// ── Embedding pin ──────────────────────────────────────────────────────────
//
// The vector store scores only rows the ACTIVE embedding adapter produced:
// `model: adapter.model` becomes `AND embedding_model = ?` in both stores, so
// a row embedded by an earlier provider (another model, or another dimension —
// a model implies its dimension) is never loaded, let alone scored at cosine 0
// against a vector from a different space. Those rows still reach the caller
// through the keyword paths below, and POST /api/embeddings/reembed-mismatched
// brings them over. checkEmbeddingPin logs one warning per process when the
// environment has moved away from the pinned provider (embedding-pin.ts).

// ── Owner scoping ──────────────────────────────────────────────────────────
//
// Search is the one surface that can undo every other ownership guard on the
// instance: routes/sessions.ts refuses another user's session by id, and this
// service used to hand back 4000 characters of the same assistant output to
// anybody who guessed a keyword (2026-09 team-mode audit, "search" finding 2).
// The predicate lives HERE rather than in each route because /api/search,
// /api/embeddings/*, the Pathfinder engine and the companion-app gateway all
// call the same two functions; a per-route filter would have to be written four
// times and forgotten once.
//
// `scope` is a REQUIRED option for exactly that reason. A default would be an
// unscoped default — the very thing being fixed — and TypeScript then lets a new
// call site ship without anyone deciding whose material it may read.
//
// WHAT IS SCOPED, AND WHAT DELIBERATELY IS NOT. Four embedded content types map
// to a row with an owner:
//   - `session_output`: embeddings.content_id is a messages.id, and messages join
//     sessions, which has user_id. Strictly the caller's own.
//   - `knowledge_atom`: knowledge_atoms.owner_user_id (migration 275). An atom can
//     also be SHARED — owner NULL marks pre-275 rows and instance-wide knowledge —
//     so the rule is "own + shared", the one the prompt layer already applies when
//     it injects atoms (see atomOwnerSql below). Before this, a keyword was enough
//     to read a colleague's atoms, which are distilled from their session output.
//   - `rag_chunk`: content_id is a rag_chunks.id and content_text the chunk's text;
//     the chunk's document belongs to its uploader (rag_documents.uploaded_by), the
//     rule the collection search applies. Strictly the caller's own.
//   - `checkpoint`: content_id is a checkpoint_decisions.id, whose decided_by is the
//     deciding user (output-store, institutional-memory). Strictly the caller's own —
//     a decision's reasoning and context are that person's, never shared.
// Those last two used to pass as unowned, so any seed on /api/embeddings/similar,
// a Pathfinder query or the companion app's ask could return a colleague's
// uploaded documents and decisions (2026-09-23 round-2 verification).
// The other embedded content types have no owner dimension in the schema at all —
// knowledge_pack_entity and module rows carry none, and document_chunks are keyed
// by folder_path from the instance-wide indexed_folders list. They are shared
// reference material by design, so this file cannot and does not pretend to
// isolate them. Do not read a scoped hybridSearch as "fully tenant-isolated" — it
// means "no other user's session output, atoms, documents or decisions".

/**
 * Whose material one search may read.
 *
 *   'instance' — no filtering. Solo mode (one human, and rows written before
 *                ownership existed carry a NULL user_id), an admin, or an
 *                internal caller that only ever asks for unowned content types.
 *   'user'     — team-mode principal: only outputs from their own sessions,
 *                chunks of their own documents and their own decisions, and
 *                only their own and shared atoms.
 *   'none'     — team mode with no identity. Matches no owned row — no session
 *                output, document chunk, decision or anyone's own atom; fail
 *                closed. Shared atoms still pass.
 */
export type SearchScope =
  | { kind: 'instance' }
  | { kind: 'user'; userId: string }
  | { kind: 'none' };

/**
 * The explicit "there is nothing to filter by" scope. Named and exported so the
 * call sites that legitimately search instance-wide material are greppable, and
 * so passing it is a visible decision rather than an omitted argument.
 */
export const INSTANCE_WIDE_SEARCH: SearchScope = { kind: 'instance' };

/**
 * For a caller that is authenticated in a DIFFERENT identity namespace than
 * `sessions.user_id` — today that is the companion app, whose `req.appUser` is a
 * `connected_users` row and never a desktop user. Such a caller has a legitimate
 * claim on the instance's shared reference material and no claim at all on anyone's
 * verbatim session output, which is exactly what `'none'` yields: unowned content
 * types pass, `session_output` is dropped on the vector path and never queried on
 * the keyword one, and in team mode only shared atoms (owner NULL) come back — a
 * colleague's atoms are distilled from their session output (see atomOwnerSql) —
 * and no uploaded document's chunks or checkpoint decisions (strictOwnerSql).
 *
 * Named for the same reason as INSTANCE_WIDE_SEARCH — so the decision is greppable,
 * and so nobody reaches for `{ kind: 'user', userId: appUser.id }`, which happens to
 * match nothing today but only because the two id spaces do not collide yet.
 */
export const NO_OWNED_CONTENT: SearchScope = { kind: 'none' };

/**
 * Derive the scope from an authenticated request. Delegates to `scopesToOwner`
 * (middleware/ownership.ts) so solo/admin behaviour has ONE definition — anyone
 * changing that rule must not have to find a second copy here.
 */
export function searchScopeForRequest(req: OwnedRequest): SearchScope {
  if (!scopesToOwner(req)) return INSTANCE_WIDE_SEARCH;
  const userId = req.user?.id;
  return userId ? { kind: 'user', userId } : { kind: 'none' };
}

/**
 * The read rule for knowledge atoms under a scope, as a WHERE fragment on
 * `column` (a literal at every call site, e.g. 'ka.owner_user_id' — never input).
 * The fragment starts with ` AND ` or is empty, like ownerFilter's.
 *
 *   'instance' — every atom.
 *   'user'     — the caller's own atoms and the shared ones (owner NULL).
 *   'none'     — the shared ones only: no identity in this namespace means no
 *                claim on anybody's own atoms, but shared knowledge is exactly
 *                the "instance's reference material" NO_OWNED_CONTENT keeps.
 *
 * "Own + shared" is deliberately the rule prompt-builder applies when it injects
 * atoms into a team-mode run (passesStaticRules, buildAtomLayerFallback): what a
 * person can list and search is what can reach their prompts, and the reverse.
 * The one difference is intended — an admin's listing is unscoped (support and
 * audit access, as everywhere in ownership.ts), while an admin's OWN prompts
 * still receive only their atoms and the shared ones.
 *
 * Solo is never filtered. There is one human, whose atoms carry their id, and the
 * companion app's NO_OWNED_CONTENT search has always read them as the instance's
 * knowledge base; filtering there would empty the phone's sources on a laptop
 * install. Ownership of atoms is a team-mode concept, like every other scope here.
 */
export function atomOwnerSql(scope: SearchScope, column: string): { sql: string; params: string[] } {
  if (scope.kind === 'instance' || !isTeamMode()) return { sql: '', params: [] };
  if (scope.kind === 'none') return { sql: ` AND ${column} IS NULL`, params: [] };
  return { sql: ` AND (${column} IS NULL OR ${column} = ?)`, params: [scope.userId] };
}

/**
 * The read rule for rows that belong to exactly one person and have no shared arm
 * (a document chunk, a checkpoint decision, a Specialised agent's documents), as a
 * WHERE fragment on `column` — a literal at every call site, never input. Starts
 * with ` AND ` or is empty, like ownerFilter's.
 *
 *   'instance' — every row.
 *   'user'     — the named person's rows only.
 *   'none'     — no row (`AND 1=0`): no identity in this namespace, no claim.
 *
 * Team mode only, like atomOwnerSql: solo has one human, and the companion app's
 * NO_OWNED_CONTENT search has always read these types there — filtering in solo
 * would take the operator's own decisions out of their phone's sources.
 */
export function strictOwnerSql(scope: SearchScope, column: string): { sql: string; params: string[] } {
  if (scope.kind === 'instance' || !isTeamMode()) return { sql: '', params: [] };
  if (scope.kind === 'none') return { sql: ' AND 1=0', params: [] };
  return { sql: ` AND ${column} = ?`, params: [scope.userId] };
}

/**
 * Embedded content types whose rows can belong to a user, each with the SQL that
 * lists which of a set of `content_id`s the scope may read. The prefix ends in
 * `WHERE <id column> IN`; the id list and the owner fragment are appended.
 * session_output keeps its own function (its 'none' rule applies in solo too).
 */
const STRICTLY_OWNED_TYPES: ReadonlyArray<{ type: string; idsInSql: string; ownerColumn: string }> = [
  {
    type: 'rag_chunk',
    idsInSql: 'SELECT c.id FROM rag_chunks c JOIN rag_documents d ON d.id = c.document_id WHERE c.id IN',
    ownerColumn: 'd.uploaded_by',
  },
  { type: 'checkpoint', idsInSql: 'SELECT id FROM checkpoint_decisions WHERE id IN', ownerColumn: 'decided_by' },
];

/** Embedded content types whose rows can belong to a user. See the note above; each has its own rule below. */
const OWNED_CONTENT_TYPES = new Set(['session_output', 'knowledge_atom', ...STRICTLY_OWNED_TYPES.map((t) => t.type)]);

/** Of these message ids, the session outputs the scope may read. */
async function visibleSessionOutputIds(db: DatabaseAdapter, ids: string[], scope: SearchScope): Promise<Set<string>> {
  if (scope.kind === 'instance') return new Set(ids);
  if (ids.length === 0 || scope.kind === 'none') return new Set();
  const placeholders = ids.map(() => '?').join(',');
  // INNER JOIN, not LEFT: a message whose session row is gone, or whose session
  // has a NULL user_id (written before ownership was enforced), is not
  // attributable to this caller and stays hidden in team mode — the same
  // fail-closed choice ownership.ts documents for unattributed rows.
  const rows = await db.all<{ id: string }>(
    `SELECT m.id
       FROM messages m
       JOIN sessions s ON s.id = m.session_id
      WHERE m.id IN (${placeholders}) AND s.user_id = ?`,
    [...ids, scope.userId],
  );
  return new Set(rows.map((r) => r.id));
}

/**
 * Of these atom ids, the ones the scope may read. Checked against knowledge_atoms,
 * not the embedding's metadata: that copy of owner_user_id is written once at embed
 * time and is absent on rows embedded before migration 275. An embedding whose atom
 * row is gone is hidden from a scoped caller — nothing attributes it to anyone.
 */
async function visibleAtomIds(db: DatabaseAdapter, ids: string[], scope: SearchScope): Promise<Set<string>> {
  const owner = atomOwnerSql(scope, 'owner_user_id');
  if (!owner.sql) return new Set(ids);
  if (ids.length === 0) return new Set();
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.all<{ id: string }>(
    `SELECT id FROM knowledge_atoms WHERE id IN (${placeholders})${owner.sql}`,
    [...ids, ...owner.params],
  );
  return new Set(rows.map((r) => r.id));
}

/**
 * Of these ids of one strictly-owned type, the ones the scope may read. Decided in
 * SQL against the owning row, so an embedding whose chunk or decision row is gone
 * is hidden from a scoped caller — nothing attributes it to anyone.
 */
async function visibleStrictlyOwnedIds(
  db: DatabaseAdapter,
  kind: { idsInSql: string; ownerColumn: string },
  ids: string[],
  scope: SearchScope,
): Promise<Set<string>> {
  const owner = strictOwnerSql(scope, kind.ownerColumn);
  if (!owner.sql) return new Set(ids);
  if (ids.length === 0) return new Set();
  const rows = await db.all<{ id: string }>(
    `${kind.idsInSql} (${ids.map(() => '?').join(',')})${owner.sql}`,
    [...ids, ...owner.params],
  );
  return new Set(rows.map((r) => r.id));
}

/**
 * Drop rows of an owned content type that the scope may not read.
 *
 * Applied to vector-store hits, which come back from the `embeddings` table with
 * no join to the owning tables. The keyword paths push the same predicates into
 * their SQL instead — a row the caller may not see is better never loaded — but
 * the vector store is a shared adapter with its own backends, so post-filtering
 * is the narrow fix here rather than threading ownership through two vector
 * stores. Exported so a route that returns these rows can apply the same rule to
 * exactly what it sends, rather than keeping a second copy of it.
 */
export async function filterOwnedByScope<T extends { content_type: string; content_id: string }>(
  db: DatabaseAdapter,
  rows: T[],
  scope: SearchScope,
): Promise<T[]> {
  if (scope.kind === 'instance') return rows;
  const idsOf = (type: string): string[] =>
    [...new Set(rows.filter((r) => r.content_type === type).map((r) => r.content_id))];
  const visible = new Map<string, Set<string>>([
    ['session_output', await visibleSessionOutputIds(db, idsOf('session_output'), scope)],
    ['knowledge_atom', await visibleAtomIds(db, idsOf('knowledge_atom'), scope)],
  ]);
  for (const kind of STRICTLY_OWNED_TYPES) {
    visible.set(kind.type, await visibleStrictlyOwnedIds(db, kind, idsOf(kind.type), scope));
  }
  return rows.filter((r) => !OWNED_CONTENT_TYPES.has(r.content_type) || (visible.get(r.content_type)?.has(r.content_id) ?? false));
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface HybridSearchResult {
  id: string;
  content_type: string;
  content_id: string;
  content_text: string;
  score: number;              // Fused RRF score (higher = more relevant)
  bm25_rank?: number;
  vector_rank?: number;
  similarity?: number;
  snippet: string;
  metadata: Record<string, unknown>;
  source: 'bm25' | 'vector' | 'both';
}

export interface HybridSearchOptions {
  query: string;
  contentTypes?: string[];    // Filter by content type (omit for all types)
  topK?: number;
  minSimilarity?: number;     // For vector results (default: 0.3)
  folderPaths?: string[];     // For document_chunk BM25 search
  includeDocumentChunks?: boolean;
  /**
   * Whose material this search may read. REQUIRED — see the "Owner scoping"
   * note at the top of this file. Build it with `searchScopeForRequest(req)` on
   * any request-driven path; `INSTANCE_WIDE_SEARCH` only where the caller has
   * established there is no owner to filter by.
   */
  scope: SearchScope;
}

// RRF constant (k=60 is standard)
const RRF_K = 60;

// ── Core hybrid search ──────────────────────────────────────────────────────

export async function hybridSearch(
  db: DatabaseAdapter,
  options: HybridSearchOptions,
): Promise<HybridSearchResult[]> {
  const {
    query,
    contentTypes,
    topK = 10,
    minSimilarity = 0.3,
    folderPaths = [],
    includeDocumentChunks = true,
    scope,
  } = options;

  const embeddingAdapter = getEmbeddingAdapter();
  const vectorStore = getVectorStore(db);

  // ── Run searches in parallel ─────────────────────────────────────────────

  const [queryVector, bm25Results] = await Promise.all([
    embeddingAdapter.embed(query),
    // BM25 over indexed folders (document_chunks table)
    (includeDocumentChunks && folderPaths.length > 0)
      ? Promise.resolve(retrieveChunks(db, query, folderPaths, topK * 2))
      : Promise.resolve([]),
  ]);

  // Vector search across embeddings table. Over-fetch then scope: the store has
  // no owner dimension, so another user's outputs are removed here before they
  // reach RRF, the snippet builder or the caller.
  // Wave 2: collection-RAG chunks now live in this table ('rag_chunk'). They
  // belong to whoever uploaded the document, so a caller that asks for "all
  // types" (Pathfinder, the Companion gateway) must not receive them; only a
  // caller that names the type — the collection search, which scopes by
  // collection — gets them, and on a team server only its own documents'
  // chunks (filterOwnedByScope).
  const excludeRagChunks = !contentTypes;
  // Pin check (warns once on a provider change); a zero query vector means the
  // embed itself failed — nothing can be scored against it, so the vector leg
  // is skipped rather than loading every row to score it 0.
  await checkEmbeddingPin(db, embeddingAdapter);
  const vectorHits: VectorSearchResult[] = isZeroVector(queryVector)
    ? []
    : await vectorStore.search({
        queryVector,
        topK: topK * 2,
        contentTypes,
        model: embeddingAdapter.model,
        minSimilarity,
      });
  const vectorResults: VectorSearchResult[] = (await filterOwnedByScope(db, vectorHits, scope))
    .filter((r) => !excludeRagChunks || r.content_type !== 'rag_chunk');

  // ── BM25 keyword search on knowledge_atoms (SQL LIKE fallback) ───────────
  const keywordAtoms = await searchKnowledgeAtomsKeyword(db, query, topK * 2, contentTypes, scope);

  // ── Keyword search on session outputs (messages table) ───────────────────
  // Wave 3.2: searches assistant messages DIRECTLY so past work is findable
  // even when its embedding failed (no key / Ollama down) or predates the
  // session_output write path. Vector hits on embedded outputs share the
  // same `session_output:<message_id>` key and fuse via RRF below.
  const keywordSessionOutputs = await searchSessionOutputsKeyword(db, query, topK * 2, contentTypes, scope);

  // ── Build ranked lists ───────────────────────────────────────────────────

  // Vector results ranked by similarity (already sorted)
  const vectorRanked = vectorResults.map((r, i) => ({
    key: `${r.content_type}:${r.content_id}`,
    rank: i + 1,
    result: r,
    source: 'vector' as const,
  }));

  // BM25 document chunk results ranked by score
  const bm25Ranked = bm25Results.map((r, i) => ({
    key: `document_chunk:${r.id}`,
    rank: i + 1,
    result: {
      id: r.id,
      content_type: 'document_chunk' as const,
      content_id: r.id,
      content_text: r.text,
      similarity: 0,
      metadata: { documentName: r.documentName, folderPath: r.folderPath, chunkIndex: r.chunkIndex, score: r.score },
    },
    source: 'bm25' as const,
  }));

  // Keyword atom results ranked
  const keywordRanked = keywordAtoms.map((r, i) => ({
    key: `knowledge_atom:${r.id}`,
    rank: i + 1,
    result: {
      id: r.id,
      content_type: 'knowledge_atom' as const,
      content_id: r.id,
      content_text: r.content,
      similarity: 0,
      metadata: { category: r.category, atom_type: r.atom_type, tags: r.tags },
    },
    source: 'bm25' as const,
  }));

  // Keyword session-output results ranked
  const sessionOutputRanked = keywordSessionOutputs.map((r, i) => ({
    key: `session_output:${r.id}`,
    rank: i + 1,
    result: {
      id: r.id,
      content_type: 'session_output' as const,
      content_id: r.id,
      content_text: r.content,
      similarity: 0,
      metadata: {
        session_id: r.session_id,
        title: r.title,
        module_id: r.module_id,
        area_id: r.area_id,
        created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
        keyword_hits: r.hits,
      },
    },
    source: 'bm25' as const,
  }));

  // ── Reciprocal Rank Fusion ───────────────────────────────────────────────
  const rrfScores = new Map<string, {
    score: number;
    bm25_rank?: number;
    vector_rank?: number;
    similarity?: number;
    result: typeof vectorRanked[0]['result'];
    source: 'bm25' | 'vector' | 'both';
  }>();

  // Process vector results
  for (const { key, rank, result } of vectorRanked) {
    const rrf = 1 / (RRF_K + rank);
    rrfScores.set(key, {
      score: rrf,
      vector_rank: rank,
      similarity: result.similarity,
      result,
      source: 'vector',
    });
  }

  // Process BM25 document chunks
  for (const { key, rank, result } of bm25Ranked) {
    const rrf = 1 / (RRF_K + rank);
    const existing = rrfScores.get(key);
    if (existing) {
      existing.score += rrf;
      existing.bm25_rank = rank;
      existing.source = 'both';
    } else {
      rrfScores.set(key, { score: rrf, bm25_rank: rank, result, source: 'bm25' });
    }
  }

  // Process keyword atom results
  for (const { key, rank, result } of keywordRanked) {
    const rrf = 1 / (RRF_K + rank);
    const existing = rrfScores.get(key);
    if (existing) {
      existing.score += rrf;
      existing.bm25_rank = rank;
      existing.source = 'both';
    } else {
      rrfScores.set(key, { score: rrf, bm25_rank: rank, result, source: 'bm25' });
    }
  }

  // Process keyword session-output results
  for (const { key, rank, result } of sessionOutputRanked) {
    const rrf = 1 / (RRF_K + rank);
    const existing = rrfScores.get(key);
    if (existing) {
      existing.score += rrf;
      existing.bm25_rank = rank;
      existing.source = 'both';
    } else {
      rrfScores.set(key, { score: rrf, bm25_rank: rank, result, source: 'bm25' });
    }
  }

  // ── Sort and format ──────────────────────────────────────────────────────
  const sorted = Array.from(rrfScores.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, topK);

  return sorted.map(([, { score, bm25_rank, vector_rank, similarity, result, source }]) => ({
    id: result.id,
    content_type: result.content_type,
    content_id: result.content_id,
    content_text: result.content_text,
    score,
    bm25_rank,
    vector_rank,
    similarity,
    snippet: makeSnippet(result.content_text, query),
    metadata: result.metadata,
    source,
  }));
}

// ── Similarity search (find content similar to a known item) ───────────────

export async function findSimilar(
  db: DatabaseAdapter,
  params: {
    contentType: string;
    contentId: string;
    topK?: number;
    sameTypeOnly?: boolean;
    /** Whose material may be read. Same contract as HybridSearchOptions.scope. */
    scope: SearchScope;
  },
): Promise<HybridSearchResult[]> {
  const vectorStore = getVectorStore(db);
  const embeddingAdapter = getEmbeddingAdapter();

  // The SEED is scoped too, not just the results. contentType/contentId come
  // straight from the request body, so an unscoped seed lets a caller point at
  // another user's session output and mine it indirectly: the neighbours it
  // returns are chosen by that output's own vector.
  const seedVisible = await filterOwnedByScope(
    db, [{ content_type: params.contentType, content_id: params.contentId }], params.scope,
  );
  if (seedVisible.length === 0) return [];

  // Get the source item's text from the embeddings table
  const row = await db.get(
    'SELECT content_text FROM embeddings WHERE content_type = ? AND content_id = ? LIMIT 1'
  , params.contentType, params.contentId) as { content_text: string } | undefined;

  if (!row) return [];

  const queryVector = await embeddingAdapter.embed(row.content_text);
  const contentTypes = params.sameTypeOnly ? [params.contentType] : undefined;

  // Same pin rules as hybridSearch: active-model rows only, nothing on a failed embed.
  await checkEmbeddingPin(db, embeddingAdapter);
  if (isZeroVector(queryVector)) return [];

  // A scoped caller loses the neighbours it may not read AFTER the store ranks
  // them, so it asks for more than it keeps; instance-wide (solo, admin) is
  // exactly the old fetch.
  const wanted = (params.topK ?? 10) + 1; // +1 to exclude self
  const results = await filterOwnedByScope(db, await vectorStore.search({
    queryVector,
    topK: params.scope.kind === 'instance' ? wanted : wanted * 3,
    contentTypes,
    model: embeddingAdapter.model,
    minSimilarity: 0.4,
  }), params.scope);

  // Exclude self
  const filtered = results.filter(r => !(r.content_type === params.contentType && r.content_id === params.contentId));

  return filtered.slice(0, params.topK ?? 10).map(r => ({
    id: r.id,
    content_type: r.content_type,
    content_id: r.content_id,
    content_text: r.content_text,
    score: r.similarity,
    similarity: r.similarity,
    snippet: makeSnippet(r.content_text, ''),
    metadata: r.metadata,
    source: 'vector' as const,
  }));
}

// ── Store embedding for any content type ──────────────────────────────────

export async function embedAndStore(
  db: DatabaseAdapter,
  params: {
    contentType: string;
    contentId: string;
    contentText: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  if (!params.contentText?.trim()) return;
  const adapter = getEmbeddingAdapter();
  const store = getVectorStore(db);

  const vector = await adapter.embed(params.contentText);
  if (isZeroVector(vector)) {
    // The embed failed (missing key / rate-limit / empty) and returned the
    // all-zeros sentinel. Don't persist a dead row — it's invisible to cosine
    // search and would poison a pgvector index (NaN distance). A later successful
    // embed (re-index) will store it via the same ON CONFLICT upsert.
    console.warn(`[hybrid-search] Skipping store of zero embedding for ${params.contentType}:${params.contentId}`);
    return;
  }
  await store.store({
    contentType: params.contentType,
    contentId: params.contentId,
    contentText: params.contentText,
    vector,
    model: adapter.model,
    metadata: params.metadata,
  });
  // The first embedding this instance stores pins its provider; later ones
  // compare against it (embedding-pin.ts). Never throws.
  await ensureEmbeddingPin(db, adapter);
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function searchKnowledgeAtomsKeyword(
  db: DatabaseAdapter,
  query: string,
  limit: number,
  contentTypes: string[] | undefined,
  scope: SearchScope,
): Promise<Array<{ id: string; content: string; category: string; atom_type: string; tags: string }>> {
  // Only search knowledge_atoms if that content type is included (or no filter)
  if (contentTypes && !contentTypes.includes('knowledge_atom')) return [];

  const q = query.trim();
  if (!q) return [];

  // The owner predicate goes into every variant's SQL, as on the session-output
  // path: another user's atom is never loaded, ranked or snippeted.
  const owner = atomOwnerSql(scope, 'ka.owner_user_id');

  // KG-03: Use FTS5/tsvector BM25 scoring; fall back to LIKE if FTS not available
  try {
    const words = q.split(/\s+/).filter(w => w.length > 1);
    if (words.length === 0) return [];

    if (db.dialect === 'postgresql') {
      // PostgreSQL: use tsvector + ts_rank
      const tsQuery = words.join(' | ');
      return await db.all(
        `SELECT ka.id, ka.content, ka.category, ka.atom_type, COALESCE(ka.tags, '[]') as tags
         FROM knowledge_atoms ka
         WHERE ka.search_vector @@ plainto_tsquery('english', ?) AND ka.is_active = 1${owner.sql}
         ORDER BY ts_rank(ka.search_vector, plainto_tsquery('english', ?)) DESC
         LIMIT ?`,
        [tsQuery, ...owner.params, tsQuery, limit],
      ) as Array<{ id: string; content: string; category: string; atom_type: string; tags: string }>;
    }

    // SQLite: use FTS5 MATCH
    const ftsQuery = words.map(w => `"${w.replace(/"/g, '').replace(/\*/g, '')}"*`).join(' OR ');
    return await db.all(
      `SELECT ka.id, ka.content, ka.category, ka.atom_type, COALESCE(ka.tags, '[]') as tags
       FROM knowledge_atoms ka
       JOIN knowledge_atoms_fts ON knowledge_atoms_fts.rowid = ka.rowid
       WHERE knowledge_atoms_fts MATCH ? AND ka.is_active = 1${owner.sql}
       ORDER BY rank
       LIMIT ?`,
      [ftsQuery, ...owner.params, limit],
    ) as Array<{ id: string; content: string; category: string; atom_type: string; tags: string }>;
  } catch {
    // FTS not available yet — fall back to LIKE substring search
    const words = q.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (words.length === 0) return [];
    const pattern = `%${words.slice(0, 3).join('%')}%`;
    try {
      return await db.all(
        `SELECT ka.id, ka.content, ka.category, ka.atom_type, COALESCE(ka.tags, '[]') as tags
         FROM knowledge_atoms ka
         WHERE ka.is_active = 1 AND LOWER(ka.content) LIKE ?${owner.sql}
         ORDER BY ka.created_at DESC LIMIT ?`,
        [pattern, ...owner.params, limit],
      ) as Array<{ id: string; content: string; category: string; atom_type: string; tags: string }>;
    } catch {
      return [];
    }
  }
}

// Stopwords excluded from the session-output keyword match — a paraphrase
// shares CONTENT words with its target, not function words.
const SESSION_OUTPUT_STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'was', 'were', 'with', 'that', 'this', 'these', 'those',
  'what', 'when', 'where', 'which', 'who', 'how', 'why', 'did', 'does', 'have', 'has',
  'had', 'about', 'our', 'your', 'their', 'from', 'into', 'than', 'then', 'them',
  'they', 'will', 'would', 'should', 'could', 'can', 'all', 'any', 'not', 'but',
  'you', 'his', 'her', 'its', 'out', 'per', 'via', 'over', 'under', 'between',
  'conclude', 'concluded', 'conclusion', 'march', 'said', 'tell', 'show', 'find',
]);

interface SessionOutputKeywordRow {
  id: string;
  content: string;
  session_id: string | null;
  title: string | null;
  module_id: string | null;
  area_id: string | null;
  created_at: unknown;
  hits: number;
}

/**
 * Wave 3.2 keyword fallback for 'session_output': rank assistant messages by
 * how many distinct query content-words they contain (ties broken by
 * recency). Searches the messages table directly — independent of whether
 * the output was ever embedded — so "search past work" degrades to keyword
 * instead of degrading to nothing on installs without an embedding provider.
 */
async function searchSessionOutputsKeyword(
  db: DatabaseAdapter,
  query: string,
  limit: number,
  contentTypes: string[] | undefined,
  scope: SearchScope,
): Promise<SessionOutputKeywordRow[]> {
  if (contentTypes && !contentTypes.includes('session_output')) return [];
  // Team mode with no identity: no rows, and no query either.
  if (scope.kind === 'none') return [];

  const words = [...new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9åäöüéèê]+/i)
      .filter((w) => w.length >= 3 && !SESSION_OUTPUT_STOPWORDS.has(w)),
  )].slice(0, 6);
  if (words.length === 0) return [];

  try {
    const hitExpr = words.map(() => `(CASE WHEN LOWER(m.content) LIKE ? THEN 1 ELSE 0 END)`).join(' + ');
    const whereExpr = words.map(() => `LOWER(m.content) LIKE ?`).join(' OR ');
    const patterns = words.map((w) => `%${w}%`);
    // The owner predicate is pushed into SQL rather than applied afterwards so a
    // row the caller may not see is never loaded into memory or logged — the same
    // property assertOwned relies on. `s.user_id = ?` also turns the LEFT JOIN
    // into an effective INNER one for a scoped caller: a message whose session is
    // missing, or whose session predates ownership (NULL user_id), is not
    // attributable to them and stays hidden. Solo and admin keep the LEFT JOIN
    // and see everything, which is why those legacy rows do not vanish from the
    // operator's own machine.
    const ownerSql = scope.kind === 'user' ? ' AND s.user_id = ?' : '';
    const ownerParams = scope.kind === 'user' ? [scope.userId] : [];
    // sessions has no area_id column — area lives in the embedding metadata
    // (vector path) only; the keyword path reports it as NULL.
    const rows = await db.all(
      `SELECT m.id,
              SUBSTRING(m.content FROM 1 FOR 4000) AS content,
              m.session_id, m.created_at,
              s.title, s.module_id, NULL AS area_id,
              (${hitExpr}) AS hits
       FROM messages m
       LEFT JOIN sessions s ON s.id = m.session_id
       WHERE m.role = 'assistant' AND LENGTH(m.content) >= 200 AND (${whereExpr})${ownerSql}
       ORDER BY hits DESC, m.created_at DESC
       LIMIT ?`,
      [...patterns, ...patterns, ...ownerParams, limit],
    ) as SessionOutputKeywordRow[];
    return rows.map((r) => ({ ...r, hits: Number(r.hits) }));
  } catch (err) {
    console.warn('[hybrid-search] session_output keyword search unavailable:', err instanceof Error ? err.message : err);
    return [];
  }
}

function makeSnippet(text: string, query: string): string {
  if (!text) return '';
  const maxLen = 200;
  if (!query) return text.slice(0, maxLen) + (text.length > maxLen ? '…' : '');

  // Find first occurrence of any query word
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const lower = text.toLowerCase();
  let pos = -1;
  for (const word of words) {
    const idx = lower.indexOf(word);
    if (idx !== -1) { pos = idx; break; }
  }

  if (pos === -1) return text.slice(0, maxLen) + (text.length > maxLen ? '…' : '');

  const start = Math.max(0, pos - 50);
  const end = Math.min(text.length, start + maxLen);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}
