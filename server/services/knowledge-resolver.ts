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
 */

import path from 'path';
import fs from 'fs-extra';
import type Database from 'better-sqlite3';
import { extractTextFromFile } from './text-extractor.js';
import { fetchUrl } from './url-fetcher.js';
import { retrieveChunks } from './rag/retriever.js';
import { semanticSearch } from './semantic-search.js';
import type { KnowledgeSourceConfig, ResolvedKnowledge } from '../../src/lib/types.js';
import { estimateTokens } from './token-estimator.js';

const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt', '.md', '.xlsx', '.csv', '.html'];

// TOKEN-05: Hard caps to prevent accidental indexing of enormous folder trees
const MAX_FILES_PER_FOLDER = 1_000;
const MAX_FILES_TOTAL = 5_000;

// Token budget: leave room for the system prompt + response
const MAX_CONTEXT_TOKENS = Number(process.env.MAX_CONTEXT_TOKENS) || 160_000;
const ESTIMATED_SYSTEM_PROMPT_TOKENS = 8_000;
const AVAILABLE_CONTEXT_TOKENS = MAX_CONTEXT_TOKENS - ESTIMATED_SYSTEM_PROMPT_TOKENS;

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
    db?: Database.Database;
    ragMode?: RagModeConfig;
    userQuery?: string;
    /** Override the default 160k token budget. Set to ~800k when using the 1M context beta. */
    contextBudget?: number;
  },
): Promise<ResolvedKnowledge> {
  const result: ResolvedKnowledge = {
    systemPromptAdditions: '',
    contextDocuments: '',
    tools: [],
    tokenEstimate: 0,
    sourceManifest: [],
  };

  // Use caller-provided budget (e.g. 800k for 1M context beta), else env/default.
  const effectiveBudget = options?.contextBudget ?? AVAILABLE_CONTEXT_TOKENS;

  let usedTokens = 0;
  const contextParts: string[] = [];
  const systemParts: string[] = [];

  // ── MODE 1: Claude's Own Knowledge + Web Search ─────────────────────────────

  if (config.modes.claudeKnowledge?.enabled) {
    if (config.modes.claudeKnowledge.webSearchEnabled) {
      result.tools.push({ type: 'web_search_20250305', name: 'web_search' });
      systemParts.push(
        `## WEB SEARCH ENABLED\nUse the web_search tool to find the latest regulatory publications, guidance, and official sources. Always cite the URL and date of any web-sourced information. Focus on: ${config.modes.claudeKnowledge.description || 'relevant regulatory and compliance sources'}.`
      );
    }
    if (config.modes.claudeKnowledge.description) {
      systemParts.push(
        `## KNOWLEDGE FOCUS\nDirect your expert knowledge and reasoning toward: ${config.modes.claudeKnowledge.description}`
      );
    }
    result.sourceManifest.push('Claude built-in knowledge');
  }

  // ── MODE 2: Online Reference URLs ────────────────────────────────────────────

  if (config.modes.onlineReference?.enabled && config.modes.onlineReference.urls.length > 0) {
    result.sourceManifest.push(`${config.modes.onlineReference.urls.length} online reference(s)`);

    for (const url of config.modes.onlineReference.urls) {
      if (usedTokens >= effectiveBudget) {
        contextParts.push(`\n### ONLINE REFERENCE (SKIPPED — context budget reached): ${url}`);
        continue;
      }

      const fetchResult = await fetchUrl(url, config.modes.onlineReference.fetchDepth || 'full');

      if (fetchResult.error) {
        contextParts.push(
          `\n### ONLINE REFERENCE (FETCH FAILED): ${url}\nError: ${fetchResult.error}\nNote: Use web search or built-in knowledge as a fallback for this source.`
        );
        continue;
      }

      const titleLine = fetchResult.title ? ` — ${fetchResult.title}` : '';
      contextParts.push(
        `\n### ONLINE REFERENCE: ${url}${titleLine}\n${fetchResult.text}`
      );
      usedTokens += fetchResult.tokenEstimate;
    }
  }

  // ── MODE 3: Local Folder(s) ─────────────────────────────────────────────────

  if (config.modes.localFolder?.enabled && config.modes.localFolder.folderPaths.length > 0) {
    const extensions = config.modes.localFolder.fileFilter?.length
      ? config.modes.localFolder.fileFilter
      : SUPPORTED_EXTENSIONS;
    const recursive = config.modes.localFolder.recursive ?? true;
    let totalFilesIndexed = 0;

    for (const folderPath of config.modes.localFolder.folderPaths) {
      if (totalFilesIndexed >= MAX_FILES_TOTAL) {
        contextParts.push(`\n### LOCAL FOLDER (SKIPPED — total file cap of ${MAX_FILES_TOTAL} reached): ${folderPath}`);
        continue;
      }

      const allFilePaths = await scanFolder(folderPath, recursive, extensions);
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
        if (usedTokens >= effectiveBudget) {
          contextParts.push(`\n### LOCAL DOCUMENT (SKIPPED — context budget): ${path.basename(filePath)}`);
          continue;
        }

        const text = await extractTextFromFile(filePath);
        if (!text) continue;

        const tokens = estimateTokens(text);
        contextParts.push(
          `\n### LOCAL DOCUMENT: ${path.basename(filePath)}\nSource folder: ${folderPath}\n\n${text}`
        );
        usedTokens += tokens;
        result.sourceManifest.push(`${path.basename(filePath)} (local)`);
      }
    }
  }

  // ── Uploaded files (always included if present) ───────────────────────────

  if (uploadedFilePaths.length > 0) {
    for (const filePath of uploadedFilePaths) {
      if (usedTokens >= effectiveBudget) {
        console.warn(`[resolver] SKIPPING ${path.basename(filePath)} — budget exhausted (${usedTokens}/${effectiveBudget})`);
        contextParts.push(`\n### UPLOADED FILE (SKIPPED — context budget): ${path.basename(filePath)}`);
        continue;
      }

      const text = await extractTextFromFile(filePath);
      if (!text) continue;

      const tokens = estimateTokens(text);
      contextParts.push(
        `\n### UPLOADED DOCUMENT: ${path.basename(filePath)}\n\n${text}`
      );
      usedTokens += tokens;
      result.sourceManifest.push(`${path.basename(filePath)} (uploaded)`);
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

  // ── MODE 5: RAG Retrieval (Semantic Vector Search or BM25) ──────────────────

  if (options?.ragMode?.enabled && options.db && options.userQuery) {
    const { folderPaths, collections, topK = 10, minScore = 0.1, useSemanticSearch = true, rerank = false } = options.ragMode;

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
        const filtered = searchResults.filter(r => r.relevanceScore >= minScore);

        if (filtered.length > 0) {
          const ragParts: string[] = [];
          ragParts.push('## RETRIEVED KNOWLEDGE');
          ragParts.push('The following passages were retrieved from your knowledge base using semantic search as most relevant to this query.\n');

          for (const result of filtered) {
            const relevancePercent = (result.relevanceScore * 100).toFixed(1);
            ragParts.push(`--- [${result.citation}] (Relevance: ${relevancePercent}%) ---`);
            ragParts.push(result.content);
            ragParts.push('');
            usedTokens += estimateTokens(result.content);

            // Stop if we exceed context budget
            if (usedTokens >= effectiveBudget) break;
          }

          contextParts.unshift(ragParts.join('\n'));
          result.sourceManifest.push(`${filtered.length} semantic search results from ${collections.length} collection(s)`);
        }
      } catch (error) {
        console.error('Semantic search failed, falling back to BM25 if available:', error);
        // Fall through to BM25 fallback below
      }
    }
    // Legacy BM25 retrieval (fallback)
    else if (folderPaths && folderPaths.length > 0) {
      const retrieved = retrieveChunks(options.db, options.userQuery, folderPaths, topK, minScore);
      if (retrieved.length > 0) {
        const ragParts: string[] = [];
        ragParts.push('## RETRIEVED RELEVANT PASSAGES');
        ragParts.push('The following passages were retrieved from your indexed document library as most relevant to this query.\n');
        for (const chunk of retrieved) {
          ragParts.push(`--- [Document: ${chunk.documentName}, Chunk ${chunk.chunkIndex + 1}] ---`);
          ragParts.push(chunk.text);
          ragParts.push('');
          usedTokens += chunk.tokenCount;
        }
        contextParts.unshift(ragParts.join('\n'));
        result.sourceManifest.push(`${retrieved.length} BM25 passages from ${folderPaths.length} indexed folder(s)`);
      }
    }
  }

  // ── Assemble result ───────────────────────────────────────────────────────

  result.systemPromptAdditions = systemParts.filter(Boolean).join('\n\n');
  result.contextDocuments = contextParts.length > 0
    ? `## REFERENCE DOCUMENTS\n${contextParts.join('\n\n---\n')}`
    : '';
  result.tokenEstimate = usedTokens;

  return result;
}
