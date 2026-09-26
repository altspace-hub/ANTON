/**
 * knowledge-resolver.ts
 * Resolves the KnowledgeSourceConfig into assembled context text and tool
 * configurations. This is the "killer feature" of the Knowledge Source System.
 *
 * Modes:
 *   1. claudeKnowledge — Claude's built-in knowledge + optional web search
 *   2. onlineReference — Fetch URLs, inject text as reference documents
 *   3. localFolder     — Scan folder(s), extract text from all supported files
 *   4. combinedMode    — Instruction layer for multi-source priority/merge
 *   5. ragMode         — BM25 retrieval from pre-indexed folder chunks
 *
 * Packing order and the budget (Wave 2, 2026-09-16 — budget fairness):
 *   The user's own material is packed first, then the references it asked
 *   for, then retrieval:
 *     uploads → project documents → online references → local folders → RAG chunks
 *   (uploads and project documents arrive together in `uploadedFilePaths`,
 *   uploads first — the caller orders them.) Before this, sources were packed
 *   in request order (URLs → folders → uploads), so an early URL could crowd
 *   out the user's own attachment.
 *
 *   Every source is packed WHOLE or SKIPPED WHOLE. A source that would push
 *   the total past the budget is skipped, recorded in `sourceDetails` with a
 *   note starting "skipped — context budget", counted in
 *   `skippedCount` / `skippedTokens`, and the next source is tried — a
 *   smaller one may still fit. The resolver therefore never returns a
 *   `tokenEstimate` above the budget by its own inclusion decision. Every
 *   source is measured (extracted / fetched) even when it ends up skipped,
 *   so the skip carries its real size — that is the visibility the user
 *   needs to decide whether to raise MAX_CONTEXT_TOKENS or trim sources.
 */

import path from 'path';
import crypto from 'crypto';
import fs from 'fs-extra';
import type { DatabaseAdapter } from '../db/database.js';

import { checkFolderPath } from '../lib/folder-guard.js';
import { ownerFilter, scopesToOwner, type OwnedRequest } from '../middleware/ownership.js';
import { extractTextFromFile } from './text-extractor.js';
import { fetchUrl } from './url-fetcher.js';
import { retrieveChunks } from './rag/retriever.js';
import { semanticSearch } from './semantic-search.js';
import type { KnowledgeSourceConfig, ResolvedKnowledge, ResolvedSourceDetail } from '../../src/lib/types.js';
import { estimateTokens } from './token-estimator.js';

/** sha256 (hex) of source content — used to pin sources in run artifacts (item 1.6). */
function contentSha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt', '.md', '.xlsx', '.csv', '.html'];

// TOKEN-05: Hard caps to prevent accidental indexing of enormous folder trees
const MAX_FILES_PER_FOLDER = 1_000;
const MAX_FILES_TOTAL = 5_000;

// Token budget: leave room for the system prompt + response.
// Default 900k for Opus/Sonnet 4.6 (1M context - 100k reserved for output + system prompt).
// Callers SHOULD pass a model-aware options.contextBudget — derive it via
// resolveContextBudget() in context-budget.ts (plan 2.15) so a 32k local
// model is never handed a ~900k prompt. The env default below is only the
// last-resort fallback for callers that don't know their model.
const MAX_CONTEXT_TOKENS = Number(process.env.MAX_CONTEXT_TOKENS) || 900_000;
const ESTIMATED_SYSTEM_PROMPT_TOKENS = 8_000;
const AVAILABLE_CONTEXT_TOKENS = MAX_CONTEXT_TOKENS - ESTIMATED_SYSTEM_PROMPT_TOKENS;

/**
 * The one note every budget skip carries, whatever the source type — the UI
 * matches on the "skipped — context budget" prefix (and claude.ts flags any
 * uploaded_file row with a note as skipped). Same text the uploads path has
 * always used, so existing detection keeps working.
 */
export const BUDGET_SKIP_NOTE = 'skipped — context budget reached';

/** A source that would not fit even into an EMPTY budget — says so, so the
 *  user knows trimming other sources will not help; only a bigger budget or a
 *  smaller document will. Shares the "skipped — context budget" prefix. */
export function budgetTooLargeNote(tokens: number, budget: number): string {
  return `skipped — context budget: this document alone (~${tokens.toLocaleString('en-US')} tokens) exceeds the whole budget (~${budget.toLocaleString('en-US')} tokens)`;
}

async function scanFolder(
  folderPath: string,
  recursive: boolean,
  extensions: string[]
): Promise<string[]> {
  const filePaths: string[] = [];

  async function scan(dir: string) {
    if (!await fs.pathExists(dir)) return;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && recursive) {
        await scan(fullPath);
      } else if (entry.isFile() && extensions.includes(path.extname(entry.name).toLowerCase())) {
        filePaths.push(fullPath);
      }
    }
  }

  await scan(folderPath);
  return filePaths;
}

export interface RagModeConfig {
  enabled: boolean;
  folderPaths?: string[]; // Legacy BM25 mode
  collections?: string[]; // ChromaDB collection IDs for semantic search
  topK: number;
  minScore: number;
  useSemanticSearch?: boolean; // If true, use vector search; otherwise BM25
  rerank?: boolean; // Enable re-ranking for semantic search
}

/**
 * Resolve all knowledge sources into context ready for injection into the
 * system prompt, plus tool configurations for the Anthropic API call.
 */
export async function resolveKnowledgeSources(
  config: KnowledgeSourceConfig,
  uploadedFilePaths: string[] = [],
  options?: {
    db?: DatabaseAdapter;
    ragMode?: RagModeConfig;
    userQuery?: string;
    /** Model-aware token budget (resolveContextBudget in context-budget.ts).
     *  Falls back to the env/900k default when omitted. */
    contextBudget?: number;
    /** Display name per uploaded path — project files carry a random
     *  on-disk name, and the model should see "Engagement letter.pdf (project)". */
    fileLabels?: Record<string, string>;
    /**
     * Who the run is for — scopes RAG retrieval in team mode (their own
     * collection documents, folders they may read). Omitted in team mode means
     * no identity, so retrieval returns nothing: fail closed, never "everyone's".
     * Local folders need no identity: the folder guard refuses shared storage
     * for every caller.
     */
    requester?: OwnedRequest;
  },
): Promise<ResolvedKnowledge> {
  const result: ResolvedKnowledge = {
    systemPromptAdditions: '',
    contextDocuments: '',
    tools: [],
    tokenEstimate: 0,
    sourceManifest: [],
    sourceDetails: [],
    skippedCount: 0,
    skippedTokens: 0,
  };
  const sourceDetails = result.sourceDetails!;
  const resolvedAt = () => new Date().toISOString();

  // Guard: ensure config.modes exists
  if (!config.modes) config.modes = {} as typeof config.modes;

  // Use caller-provided budget (e.g. 800k for 1M context beta), else env/default.
  const effectiveBudget = options?.contextBudget ?? AVAILABLE_CONTEXT_TOKENS;

  // usedTokens counts the extracted source text only (every estimate via
  // estimateTokens — one tokenizer for the whole resolver). The resolver's
  // own headers and separators are a few tokens per source and are covered
  // by the system-prompt reserve that context-budget.ts subtracts.
  let usedTokens = 0;
  let skippedCount = 0;
  let skippedTokens = 0;
  const contextParts: string[] = [];
  const systemParts: string[] = [];

  /**
   * Whole-or-skip: the note when a source of `tokens` cannot be packed on top
   * of what is already used, undefined when it fits. Never includes a source
   * that would cross the budget.
   */
  const budgetSkipNote = (tokens: number): string | undefined => {
    if (tokens > effectiveBudget) return budgetTooLargeNote(tokens, effectiveBudget);
    if (usedTokens + tokens > effectiveBudget) return BUDGET_SKIP_NOTE;
    return undefined;
  };
  const recordSkip = (type: string, tokens: number): void => {
    skippedCount += 1;
    skippedTokens += tokens;
    // Type and sizes only — never the source name (CLAUDE.md: no PII in logs).
    console.warn(`[resolver] skipped ${type} — context budget (${usedTokens}/${effectiveBudget} used, +${tokens} would not fit)`);
  };

  // ── MODE 1: Claude's Own Knowledge + Web Search ─────────────────────────────

  if (config.modes?.claudeKnowledge?.enabled) {
    if (config.modes.claudeKnowledge.webSearchEnabled) {
      result.tools.push({ type: 'web_search_20250305', name: 'web_search' });
      systemParts.push(
        `## WEB SEARCH ENABLED\nUse the web_search tool to find the latest regulatory publications, guidance, and official sources. Always cite the URL and date of any web-sourced information. Focus on: ${config.modes.claudeKnowledge.description || 'relevant regulatory and compliance sources'}.`
      );
      // Tool results happen inside the API call — content not capturable pre-call.
      sourceDetails.push({
        type: 'web_search_tool',
        name: 'Anthropic web_search tool',
        contentHashed: false,
        note: 'results are fetched by the model during the call; not hashable at resolve time',
      });
    }
    if (config.modes.claudeKnowledge.description) {
      systemParts.push(
        `## KNOWLEDGE FOCUS\nDirect your expert knowledge and reasoning toward: ${config.modes.claudeKnowledge.description}`
      );
    }
    result.sourceManifest.push('Claude built-in knowledge');
    sourceDetails.push({
      type: 'builtin',
      name: 'Claude built-in knowledge',
      contentHashed: false,
      note: 'model parametric knowledge — no retrievable content to hash',
    });
  }

  // ── Uploaded files + project documents — the user's own material, packed first ──

  if (uploadedFilePaths.length > 0) {
    for (const filePath of uploadedFilePaths) {
      const label = options?.fileLabels?.[filePath] ?? path.basename(filePath);
      const text = await extractTextFromFile(filePath);
      if (!text) continue;

      const tokens = estimateTokens(text);
      const skipNote = budgetSkipNote(tokens);
      if (skipNote) {
        contextParts.push(`\n### UPLOADED FILE (SKIPPED — context budget): ${label}`);
        sourceDetails.push({ type: 'uploaded_file', name: label, path: filePath, charCount: text.length, contentHashed: false, note: skipNote });
        recordSkip('uploaded_file', tokens);
        continue;
      }

      contextParts.push(
        `\n### UPLOADED DOCUMENT: ${label}\n\n${text}`
      );
      usedTokens += tokens;
      result.sourceManifest.push(`${label} (uploaded)`);
      sourceDetails.push({
        type: 'uploaded_file',
        name: label,
        path: filePath,
        sha256: contentSha256(text),
        charCount: text.length,
        retrievedAt: resolvedAt(),
        contentHashed: true,
      });
    }
  }

  // ── MODE 2: Online Reference URLs ────────────────────────────────────────────

  if (config.modes.onlineReference?.enabled && config.modes.onlineReference.urls.length > 0) {
    result.sourceManifest.push(`${config.modes.onlineReference.urls.length} online reference(s)`);

    for (const url of config.modes.onlineReference.urls) {
      const fetchResult = await fetchUrl(url, config.modes.onlineReference.fetchDepth || 'full');

      if (fetchResult.error) {
        contextParts.push(
          `\n### ONLINE REFERENCE (FETCH FAILED): ${url}\nError: ${fetchResult.error}\nNote: Use web search or built-in knowledge as a fallback for this source.`
        );
        sourceDetails.push({ type: 'url', name: url, url, contentHashed: false, note: `fetch failed: ${fetchResult.error}` });
        continue;
      }

      // The fetcher's own tokenEstimate is a words×1.3 heuristic; the budget
      // is enforced with the resolver's tokenizer so every source is measured
      // the same way.
      const tokens = estimateTokens(fetchResult.text);
      const skipNote = budgetSkipNote(tokens);
      if (skipNote) {
        contextParts.push(`\n### ONLINE REFERENCE (SKIPPED — context budget): ${url}`);
        sourceDetails.push({ type: 'url', name: fetchResult.title || url, url, charCount: fetchResult.text.length, contentHashed: false, note: skipNote });
        recordSkip('url', tokens);
        continue;
      }

      const titleLine = fetchResult.title ? ` — ${fetchResult.title}` : '';
      contextParts.push(
        `\n### ONLINE REFERENCE: ${url}${titleLine}\n${fetchResult.text}`
      );
      usedTokens += tokens;
      sourceDetails.push({
        type: 'url',
        name: fetchResult.title || url,
        url,
        sha256: contentSha256(fetchResult.text),
        charCount: fetchResult.text.length,
        retrievedAt: resolvedAt(),
        contentHashed: true,
      });
    }
  }

  // ── MODE 3: Local Folder(s) ─────────────────────────────────────────────────

  if (config.modes.localFolder?.enabled && config.modes.localFolder.folderPaths.length > 0) {
    // The file filter arrives in the same request body as the folder paths, so it
    // is NOT a trust boundary: an unclamped filter of [''] matches every
    // extensionless file (id_rsa, credentials…) and ['.pem'] would harvest keys.
    // Intersect with SUPPORTED_EXTENSIONS — the caller may narrow, never widen.
    const requestedExtensions = config.modes.localFolder.fileFilter?.length
      ? config.modes.localFolder.fileFilter.map(e => String(e).toLowerCase())
      : SUPPORTED_EXTENSIONS;
    const extensions = requestedExtensions.filter(e => SUPPORTED_EXTENSIONS.includes(e));
    const recursive = config.modes.localFolder.recursive ?? true;
    let totalFilesIndexed = 0;

    for (const folderPath of config.modes.localFolder.folderPaths) {
      if (totalFilesIndexed >= MAX_FILES_TOTAL) {
        contextParts.push(`\n### LOCAL FOLDER (SKIPPED — total file cap of ${MAX_FILES_TOTAL} reached): ${folderPath}`);
        continue;
      }

      // folderPaths comes straight off the POST /api/claude/message body and
      // ends at fs.readdir + extractTextFromFile, i.e. arbitrary host files
      // pasted into the prompt. Same whitelist the folder browser enforces
      // (CLAUDE.md pattern 6); skip the folder rather than failing the whole run
      // so one bad path does not lose the user's other sources.
      // In team mode the guard also refuses ANTON's own upload/output storage
      // (every user's files); no whitelist entry re-opens that, so the hint to
      // widen the whitelist is given only where it would help.
      const guard = checkFolderPath(folderPath);
      if (!guard.ok) {
        const hint = guard.reason === 'team_storage' ? '' : '; add it to ALLOWED_FOLDER_PATHS to use it';
        contextParts.push(`\n### LOCAL FOLDER (REFUSED — ${guard.error}${hint}): ${folderPath}`);
        sourceDetails.push({
          type: 'local_folder',
          name: folderPath,
          path: folderPath,
          contentHashed: false,
          note: `refused — ${guard.error}`,
        });
        continue;
      }

      const allFilePaths = await scanFolder(guard.resolved, recursive, extensions);
      // TOKEN-05: Cap per-folder and apply remaining total budget
      const remainingTotal = MAX_FILES_TOTAL - totalFilesIndexed;
      const filePaths = allFilePaths
        .slice(0, Math.min(MAX_FILES_PER_FOLDER, remainingTotal));

      if (allFilePaths.length > filePaths.length) {
        const skipped = allFilePaths.length - filePaths.length;
        contextParts.push(`\n### NOTE: ${skipped} file(s) in "${path.basename(folderPath)}" were skipped (limit: ${MAX_FILES_PER_FOLDER}/folder, ${MAX_FILES_TOTAL} total).`);
      }
      totalFilesIndexed += filePaths.length;

      for (const filePath of filePaths) {
        const text = await extractTextFromFile(filePath);
        if (!text) continue;

        const tokens = estimateTokens(text);
        const skipNote = budgetSkipNote(tokens);
        if (skipNote) {
          contextParts.push(`\n### LOCAL DOCUMENT (SKIPPED — context budget): ${path.basename(filePath)}`);
          sourceDetails.push({ type: 'local_file', name: path.basename(filePath), path: filePath, charCount: text.length, contentHashed: false, note: skipNote });
          recordSkip('local_file', tokens);
          continue;
        }

        contextParts.push(
          `\n### LOCAL DOCUMENT: ${path.basename(filePath)}\nSource folder: ${folderPath}\n\n${text}`
        );
        usedTokens += tokens;
        result.sourceManifest.push(`${path.basename(filePath)} (local)`);
        sourceDetails.push({
          type: 'local_file',
          name: path.basename(filePath),
          path: filePath,
          sha256: contentSha256(text),
          charCount: text.length,
          retrievedAt: resolvedAt(),
          contentHashed: true,
        });
      }
    }
  }

  // ── MODE 4: Combined Mode Instructions ────────────────────────────────────

  if (config.modes.combinedMode?.enabled) {
    const priorityInstructions: Record<string, string> = {
      local_first:
        'Ground your entire analysis in the local documents first. Use your knowledge and web search only to fill gaps or clarify points not covered by the local documents.',
      claude_first:
        'Begin from the regulatory requirements and best practices from your knowledge and web search. Then assess the local documents against those requirements.',
      merged:
        'Treat all sources equally. Cross-reference and synthesise information from local documents, your knowledge, and web search results. Where sources conflict, flag the discrepancy.',
    };
    const priority = config.modes.combinedMode.priority || 'merged';
    systemParts.push(
      `## COMBINED SOURCE MODE\n${priorityInstructions[priority] || priorityInstructions.merged}` +
      (config.modes.combinedMode.instructions
        ? `\n\nAdditional instructions: ${config.modes.combinedMode.instructions}`
        : '')
    );
  }

  // ── MODE 5: RAG Retrieval (Semantic Vector Search or BM25) — packed last ────

  if (options?.ragMode?.enabled && options.db && options.userQuery) {
    const { collections, topK = 10, minScore = 0.1, useSemanticSearch = true, rerank = false } = options.ragMode;
    const requester: OwnedRequest = options.requester ?? {};
    // Indexed folders carry no owner: a team-mode caller may retrieve only from
    // folders the guard lets them read (an index built before the storage rule
    // may still hold another user's uploads). Solo and admins are not scoped.
    const folderPaths = scopesToOwner(requester)
      ? (options.ragMode.folderPaths ?? []).filter(p => checkFolderPath(p).ok)
      : options.ragMode.folderPaths;

    // Semantic search via ChromaDB (preferred)
    if (useSemanticSearch && collections && collections.length > 0) {
      try {
        const searchResults = await semanticSearch(options.db, {
          query: options.userQuery,
          collections,
          topK,
          rerank,
        });

        // Filter by minimum relevance score
        let filtered = searchResults.filter(r => r.relevanceScore >= minScore);

        // Collections are shared (regulations, client-docs …) but each document
        // belongs to its uploader, and semanticSearch() does not filter by
        // owner. Until it does, keep only the requester's own documents here,
        // decided in SQL (rag_documents.uploaded_by) like every ownership check.
        const scope = ownerFilter(requester, 'uploaded_by');
        if (scope.sql && filtered.length > 0) {
          const docIds = [...new Set(filtered.map(r => r.documentId))];
          const owned = await options.db.all<{ id: string }>(
            `SELECT id FROM rag_documents WHERE id IN (${docIds.map(() => '?').join(',')})${scope.sql}`,
            ...docIds, ...scope.params,
          );
          const ownedIds = new Set(owned.map(r => r.id));
          filtered = filtered.filter(r => ownedIds.has(r.documentId));
        }

        if (filtered.length > 0) {
          // Wave 2: name the method that actually ran (the set's `method`) and
          // what its score means, instead of "semantic search" unconditionally.
          const setMethod = filtered[0]?.method ?? 'keyword';
          const methodWord: Record<string, string> = {
            vector: 'vector similarity',
            hybrid: 'vector similarity fused with keyword matching',
            keyword: 'keyword matching (no vector index was available)',
          };
          const scoreLabel = (r: { score?: number; scoreKind?: string; relevanceScore?: number }): string => {
            const s = typeof r.score === 'number' ? r.score : (r.relevanceScore ?? 0);
            switch (r.scoreKind) {
              case 'cosine_similarity': return `cosine similarity ${(s * 100).toFixed(1)}%`;
              case 'rrf_normalised': return `hybrid rank score ${s.toFixed(2)}`;
              default: return `keyword coverage ${(s * 100).toFixed(0)}%`;
            }
          };
          const ragParts: string[] = [];
          ragParts.push('## RETRIEVED KNOWLEDGE');
          ragParts.push(`The following passages were retrieved from your knowledge base by ${methodWord[setMethod] ?? setMethod} as most relevant to this query.\n`);
          let included = 0;

          for (const result of filtered) {
            const tokens = estimateTokens(result.content);
            const skipNote = budgetSkipNote(tokens);
            if (skipNote) {
              sourceDetails.push({ type: 'rag_chunk', name: result.citation, charCount: result.content.length, contentHashed: false, note: skipNote });
              recordSkip('rag_chunk', tokens);
              continue;
            }

            ragParts.push(`--- [${result.citation}] (${scoreLabel(result)}) ---`);
            ragParts.push(result.content);
            ragParts.push('');
            usedTokens += tokens;
            included += 1;
            sourceDetails.push({
              type: 'rag_chunk',
              name: result.citation,
              sha256: contentSha256(result.content),
              charCount: result.content.length,
              retrievedAt: resolvedAt(),
              contentHashed: true,
            });
          }

          if (included > 0) {
            contextParts.push(ragParts.join('\n'));
            result.sourceManifest.push(`${included} ${setMethod} search results from ${collections.length} collection(s)`);
          }
        }
      } catch (error) {
        console.error('Semantic search failed, falling back to BM25 if available:', error);
        // Fall through to BM25 fallback below
      }
    }
    // Legacy BM25 retrieval (fallback)
    else if (folderPaths && folderPaths.length > 0) {
      const retrieved = await retrieveChunks(options.db, options.userQuery, folderPaths, topK, minScore);
      if (retrieved.length > 0) {
        const ragParts: string[] = [];
        ragParts.push('## RETRIEVED RELEVANT PASSAGES');
        ragParts.push('The following passages were retrieved from your indexed document library as most relevant to this query.\n');
        let included = 0;

        for (const chunk of retrieved) {
          // Measured here, not taken from the index's stored token_count, so
          // the budget sees one tokenizer across every source.
          const tokens = estimateTokens(chunk.text);
          const skipNote = budgetSkipNote(tokens);
          if (skipNote) {
            sourceDetails.push({ type: 'bm25_chunk', name: `${chunk.documentName}#${chunk.chunkIndex + 1}`, charCount: chunk.text.length, contentHashed: false, note: skipNote });
            recordSkip('bm25_chunk', tokens);
            continue;
          }

          ragParts.push(`--- [Document: ${chunk.documentName}, Chunk ${chunk.chunkIndex + 1}] ---`);
          ragParts.push(chunk.text);
          ragParts.push('');
          usedTokens += tokens;
          included += 1;
          sourceDetails.push({
            type: 'bm25_chunk',
            name: `${chunk.documentName}#${chunk.chunkIndex + 1}`,
            sha256: contentSha256(chunk.text),
            charCount: chunk.text.length,
            retrievedAt: resolvedAt(),
            contentHashed: true,
          });
        }

        if (included > 0) {
          contextParts.push(ragParts.join('\n'));
          result.sourceManifest.push(`${included} BM25 passages from ${folderPaths.length} indexed folder(s)`);
        }
      }
    }
  }

  // ── Assemble result ───────────────────────────────────────────────────────

  result.systemPromptAdditions = systemParts.filter(Boolean).join('\n\n');
  result.contextDocuments = contextParts.length > 0
    ? `## REFERENCE DOCUMENTS\n${contextParts.join('\n\n---\n')}`
    : '';
  result.tokenEstimate = usedTokens;
  result.skippedCount = skippedCount;
  result.skippedTokens = skippedTokens;

  return result;
}
