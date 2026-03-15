/**
 * Pathfinder Engine — Claude-only search with progressive reasoning
 *
 * Quick mode:  Haiku web_search → Haiku synthesis (think_hard)
 * Thorough:    Haiku web_search → Haiku investigation analysis → Sonnet chairman synthesis
 * Deep:        Haiku web_search → Sonnet IRE multi-phase (analyse → reflect → deepen → synthesise)
 *              with confidence gating (> 0.8) — deeper phases only if needed
 */

import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type Database from 'better-sqlite3';
import Anthropic from '@anthropic-ai/sdk';
import { estimateTokens, estimateCost } from './token-estimator.js';
import { hybridSearch, type HybridSearchResult } from './hybrid-search.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Prompts ────────────────────────────────────────────────────────────────
function loadPrompt(name: string): string {
  try {
    return readFileSync(join(__dirname, '..', 'prompts', `${name}.md`), 'utf-8');
  } catch {
    return '';
  }
}

const SEARCH_PROMPT = loadPrompt('pathfinder-search');
const SYNTHESIS_PROMPT = loadPrompt('pathfinder-synthesis');

// ── Mode-Specific Instructions ────────────────────────────────────────────
const MODE_INSTRUCTIONS: Record<string, string> = {
  knowledge: 'Rank by source authority. Academic and official sources above commentary. Flag if sources disagree.',
  shopping: 'Extract prices where visible. Compare across retailers. Flag suspiciously low prices. Note availability. Include stores near the user\'s city alongside online options.',
  travel: 'Compare transport options by cost and time. Include booking links. Flag visa/entry requirements. Note seasonal relevance.',
  food: 'For recipes: extract cook time, difficulty, servings, dietary info, key ingredients. Prefer tested/reviewed recipes. For restaurants: extract rating, price range, cuisine, distance.',
  fix: 'Prefer step-by-step guides. Note difficulty level and time estimate. Flag outdated guides. Prefer official documentation over rewrites. Note if video tutorial available.',
  news: 'Rank by recency FIRST, then credibility. Classify each source as: News Report, Opinion, Editorial, Analysis, or Press Release. Note the outlet\'s known political positioning. Flag single-source stories.',
  local: 'Rank by proximity. Extract opening hours, rating, address, phone. Flag if currently open/closed. Note price range where applicable.',
};

const MODE_HINTS: Record<string, string> = {
  knowledge: 'Sources ranked by authority and credibility',
  shopping: 'Prices compared. No sponsored results. Ever.',
  travel: 'Routes, costs, and bookings',
  food: 'Recipes ranked by reliability',
  fix: 'Step-by-step solutions, verified and current',
  news: 'Most recent first. Bias shown. Opinion clearly labelled.',
  local: 'Nearest first. Open now highlighted.',
};

// ── Types ──────────────────────────────────────────────────────────────────
export type SearchDepth = 'quick' | 'thorough' | 'deep';
export type SearchMode = 'knowledge' | 'shopping' | 'travel' | 'food' | 'fix' | 'news' | 'local';

export interface ModelResult {
  modelId: string;
  provider: string;
  role: string;
  response: string;
  webSources: WebSource[];
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  status: 'complete' | 'error';
  error?: string;
  confidenceScore?: number; // Deep mode: confidence from reflection phase (0-1)
}

export type SourceType = 'web' | 'local' | 'knowledge_pack' | 'institutional_memory';

export interface WebSource {
  url: string;
  title: string;
  snippet: string;
  modelId: string;
  sourceType: SourceType;
  qualityScore: number;   // 0-1: authority of source
  relevanceScore: number; // 0-1: domain relevance
  consensusScore: number; // 0-1: cross-model agreement
}

export interface SearchContext {
  activeAreaId?: string;
  activeModuleId?: string;
  userProfile?: string;
  userLocation?: string;
}

export interface SearchResult {
  id: string;
  query: string;
  enrichedQuery: string;
  depth: SearchDepth;
  synthesis: string;
  thinking: string;
  preSearchReasoning: string;
  modelResults: ModelResult[];
  webSources: WebSource[];
  localSources: WebSource[];
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  followUpSuggestions: string[];
  context?: SearchContext;
}

export interface SearchCallbacks {
  onSearchStart: (searchId: string, depth: SearchDepth) => void;
  onPreSearchReasoning: (reasoning: string) => void;
  onModelStart: (modelId: string, role: string) => void;
  onModelComplete: (result: ModelResult) => void;
  onSynthesisStart: () => void;
  onTextDelta: (text: string) => void;
  onThinkingDelta: (text: string) => void;
  onSearchComplete: (result: SearchResult) => void;
  onError: (error: string) => void;
}

// ── Model Configurations ───────────────────────────────────────────────────
// Claude-only architecture — all depth modes use Anthropic models

interface DispatchModel {
  modelId: string;
  provider: string;
  role: string;
  envKey: string;
}

const SEARCH_MODEL: DispatchModel = {
  modelId: 'claude-haiku-4-5-20251001',
  provider: 'anthropic',
  role: 'Web Search',
  envKey: 'ANTHROPIC_API_KEY',
};

// Confidence assessment tool for Deep mode reflection phase
const CONFIDENCE_TOOL = {
  name: 'assess_confidence',
  description: 'Record your confidence assessment of the search analysis. Evaluate completeness, accuracy, and identify gaps.',
  input_schema: {
    type: 'object' as const,
    properties: {
      confidence: { type: 'number' as const, description: 'Confidence score from 0.0 to 1.0 — how confident are you that the analysis fully addresses the query?' },
      revision_needed: { type: 'boolean' as const, description: 'Whether deeper analysis is needed to resolve uncertainties' },
      gaps: { type: 'string' as const, description: 'Key uncertainties, missing information, or areas that need resolution' },
    },
    required: ['confidence', 'revision_needed'] as const,
  },
};

// Internal phase result for multi-phase reasoning
interface InternalPhaseResult {
  text: string;
  thinking: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  confidenceScore?: number;
  revisionNeeded?: boolean;
  gaps?: string;
}

export function getAvailableSearchModels(): Array<{ modelId: string; provider: string; role: string; available: boolean }> {
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  return [
    { modelId: 'claude-haiku-4-5-20251001', provider: 'anthropic', role: 'Web Search', available: hasKey },
    { modelId: 'claude-haiku-4-5-20251001', provider: 'anthropic', role: 'Analysis (Quick/Thorough)', available: hasKey },
    { modelId: 'claude-sonnet-4-6', provider: 'anthropic', role: 'Chairman Synthesis', available: hasKey },
  ];
}

// ── Query Enrichment ──────────────────────────────────────────────────────

/**
 * Enrich the user query with domain-specific terms based on active area/module context.
 * E.g. "CDD requirements" + FCP area → "CDD customer due diligence requirements AMLR Article 28"
 */
function enrichQuery(query: string, context?: SearchContext): string {
  if (!context?.activeAreaId) return query;

  // Domain enrichment map — adds regulatory/domain terms based on active area
  const DOMAIN_TERMS: Record<string, string[]> = {
    'fcp': ['AML', 'CFT', 'AMLR', 'AMLA', 'financial crime prevention', 'compliance'],
    'legal': ['legal analysis', 'case law', 'jurisdiction', 'regulatory'],
    'healthcare': ['clinical', 'medical', 'patient safety', 'health regulation'],
    'finance': ['financial regulation', 'MiFID', 'DORA', 'prudential'],
    'pe-vc': ['private equity', 'venture capital', 'deal flow', 'portfolio'],
    'blockchain': ['MiCA', 'CASP', 'crypto-asset', 'DeFi', 'distributed ledger'],
    'education': ['curriculum', 'pedagogy', 'educational'],
    'ngo': ['humanitarian', 'development', 'social impact', 'donor'],
    'creative-production': ['content creation', 'editorial', 'publishing'],
    'data-protection': ['GDPR', 'privacy', 'data processing', 'DPA'],
    'sanctions': ['sanctions screening', 'OFAC', 'EU sanctions', 'SDN'],
    'tax': ['tax compliance', 'transfer pricing', 'tax regulation'],
  };

  const terms = DOMAIN_TERMS[context.activeAreaId];
  if (!terms) return query;

  // Only add terms not already present in the query (case-insensitive)
  const queryLower = query.toLowerCase();
  const additions = terms.filter(t => !queryLower.includes(t.toLowerCase())).slice(0, 3);
  if (additions.length === 0) return query;

  return `${query} (context: ${additions.join(', ')})`;
}

// ── Local Knowledge Search ────────────────────────────────────────────────

/**
 * Search local knowledge sources (knowledge atoms, checkpoints, session outputs)
 * using hybrid BM25+vector search. Returns results as WebSource[] with sourceType='local'.
 */
async function searchLocalKnowledge(
  db: Database.Database,
  query: string,
  topK = 3,
): Promise<WebSource[]> {
  try {
    const results = await hybridSearch(db, {
      query,
      topK: topK + 2, // fetch extra so we can filter
      minSimilarity: 0.5, // higher threshold — only genuinely relevant results
      includeDocumentChunks: true,
    });

    // Keyword overlap filter — discard results that share no significant words with the query
    const queryWords = new Set(
      query.toLowerCase().split(/\W+/).filter(w => w.length > 3)
    );

    return results
      .filter((r: HybridSearchResult) => {
        // Must have a reasonable score
        if ((r.score || 0) < 0.45) return false;
        // Check keyword overlap — at least one significant query word must appear in the content
        const content = ((r.content_text || '') + ' ' + (r.snippet || '')).toLowerCase();
        return [...queryWords].some(w => content.includes(w));
      })
      .slice(0, topK)
      .map((r: HybridSearchResult) => ({
        url: `local://${r.content_type}/${r.content_id}`,
        title: r.snippet?.slice(0, 80) || `${r.content_type}: ${r.content_id.slice(0, 8)}`,
        snippet: (r.content_text || '').slice(0, 300),
        modelId: 'local-knowledge',
        sourceType: 'local' as SourceType,
        qualityScore: 0.8, // Local knowledge is curated — high default quality
        relevanceScore: r.score || 0.5,
        consensusScore: 0, // N/A for local
      }));
  } catch {
    // hybridSearch may fail if embeddings aren't set up — graceful degradation
    return [];
  }
}

// ── Source Quality Assessment ──────────────────────────────────────────────

const AUTHORITATIVE_DOMAINS = [
  'gov', 'europa.eu', 'eur-lex.europa.eu', 'ecb.europa.eu',
  'bis.org', 'fatf-gafi.org', 'fsb.org', 'imf.org', 'worldbank.org',
  'sec.gov', 'fca.org.uk', 'esma.europa.eu', 'eba.europa.eu',
  'oecd.org', 'un.org', 'who.int', 'iso.org',
  '.edu', '.ac.uk', 'arxiv.org', 'scholar.google',
  'nature.com', 'sciencedirect.com', 'springer.com', 'wiley.com',
];

const LOW_QUALITY_DOMAINS = [
  'reddit.com', 'quora.com', 'medium.com', 'blogspot.com',
  'wordpress.com', 'tiktok.com', 'facebook.com', 'twitter.com',
];

/**
 * Score source quality based on URL domain authority.
 * Returns 0-1 where 1 = highest authority.
 */
function assessSourceQuality(url: string): number {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    // Check authoritative domains
    if (AUTHORITATIVE_DOMAINS.some(d => hostname.endsWith(d) || hostname.includes(d))) {
      return 0.9;
    }
    // Check low quality
    if (LOW_QUALITY_DOMAINS.some(d => hostname.includes(d))) {
      return 0.3;
    }
    // News / professional sources
    if (hostname.includes('reuters') || hostname.includes('bloomberg') || hostname.includes('ft.com')) {
      return 0.8;
    }
    // Default: moderate quality
    return 0.6;
  } catch {
    return 0.5;
  }
}

/**
 * Calculate consensus score — how many models found this URL.
 */
function calculateConsensus(url: string, allResults: ModelResult[]): number {
  const modelsWithUrl = allResults.filter(r =>
    r.webSources.some(s => s.url === url)
  ).length;
  const totalModels = allResults.filter(r => r.status === 'complete').length;
  return totalModels > 0 ? modelsWithUrl / totalModels : 0;
}

// ── Pre-Search Reasoning ──────────────────────────────────────────────────

/**
 * Generate a pre-search reasoning explanation — tells the user what we're
 * about to search for and how we'll approach it. No API call needed.
 */
function buildPreSearchReasoning(
  query: string,
  enrichedQuery: string,
  depth: SearchDepth,
  searchMode: SearchMode,
  context?: SearchContext,
): string {
  const lines: string[] = [];

  // Step 1: Query analysis
  lines.push(`**Analysing:** "${query}"`);
  if (enrichedQuery !== query) {
    lines.push(`**Enriched to:** "${enrichedQuery}" — added domain context to improve results.`);
  }

  // Step 2: Mode strategy
  const hint = MODE_HINTS[searchMode];
  if (hint && searchMode !== 'knowledge') {
    lines.push(`**Mode:** ${searchMode.charAt(0).toUpperCase() + searchMode.slice(1)} — ${hint}`);
  }

  // Step 3: Search approach
  if (depth === 'quick') {
    lines.push(`**Approach:** Haiku web search → think_hard synthesis. Fast, focused answer.`);
  } else if (depth === 'thorough') {
    lines.push(`**Approach:** Haiku web search → investigation analysis → Sonnet chairman validates and synthesises with reasoning.`);
  } else {
    lines.push(`**Approach:** Haiku web search → Sonnet multi-phase reasoning (analyse → reflect → deepen if needed → synthesise). Confidence-gated for quality.`);
  }

  // Step 4: Context awareness
  if (context?.activeAreaId) {
    lines.push(`**Context:** Results weighted for ${context.activeAreaId} domain expertise.`);
  }
  if (context?.userLocation) {
    lines.push(`**Location:** ${context.userLocation} — proximity and local relevance applied.`);
  }

  return lines.join('\n');
}

// ── Quick Search (Single Model) ────────────────────────────────────────────

async function dispatchSingleModel(
  query: string,
  model: DispatchModel,
  documentContext: string,
  anthropic: Anthropic | null,
  searchMode: SearchMode = 'knowledge',
  userLocation?: string,
): Promise<ModelResult> {
  const start = Date.now();
  try {
    const modeInstruction = MODE_INSTRUCTIONS[searchMode] || '';
    const locationContext = userLocation ? `\n\n## User Location\nThe user is located in ${userLocation}. Use this for proximity-based results, local availability, and regional relevance.` : '';
    if (model.provider === 'anthropic' && anthropic) {
      // Use Claude with web_search tool — NO thinking (mutually exclusive)
      const systemPrompt = [
        SEARCH_PROMPT,
        modeInstruction ? `\n\n## Search Mode: ${searchMode}\n${modeInstruction}` : '',
        locationContext,
        documentContext ? `\n\n## Document Context\n${documentContext}` : '',
      ].filter(Boolean).join('');

      const response = await anthropic.messages.create({
        model: model.modelId,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: query }],
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }] as unknown as Anthropic.Messages.Tool[],
      });

      // Extract text + web sources from response
      let text = '';
      const webSources: WebSource[] = [];
      for (const block of response.content) {
        if (block.type === 'text') {
          text += block.text;
        } else if (block.type === 'tool_use' && 'input' in block) {
          // Web search results come back as tool_result in the response
        }
      }

      // Parse web sources from server_tool_use blocks if present
      for (const block of response.content as unknown as Array<Record<string, unknown>>) {
        if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
          for (const item of block.content as Array<Record<string, unknown>>) {
            if (item.type === 'web_search_result' && typeof item.url === 'string') {
              webSources.push({
                url: item.url,
                title: (item.title as string) || '',
                snippet: (item.snippet as string) || '',
                modelId: model.modelId,
                sourceType: 'web',
                qualityScore: assessSourceQuality(item.url),
                relevanceScore: 0.5, // Will be refined in synthesis
                consensusScore: 0,   // Will be calculated after all models complete
              });
            }
          }
        }
      }

      return {
        modelId: model.modelId,
        provider: model.provider,
        role: model.role,
        response: text,
        webSources,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        durationMs: Date.now() - start,
        status: 'complete',
      };
    } else {
      throw new Error(`Unsupported provider: ${model.provider}. Pathfinder uses Claude-only architecture.`);
    }
  } catch (err) {
    return {
      modelId: model.modelId,
      provider: model.provider,
      role: model.role,
      response: '',
      webSources: [],
      inputTokens: 0,
      outputTokens: 0,
      durationMs: Date.now() - start,
      status: 'error',
      error: String(err),
    };
  }
}

// ── Synthesis ──────────────────────────────────────────────────────────────

async function streamSynthesis(
  query: string,
  modelResults: ModelResult[],
  depth: SearchDepth,
  documentContext: string,
  anthropic: Anthropic,
  callbacks: Pick<SearchCallbacks, 'onTextDelta' | 'onThinkingDelta'>,
  signal?: AbortSignal,
  searchMode: SearchMode = 'knowledge',
  userLocation?: string,
): Promise<{ text: string; thinking: string; inputTokens: number; outputTokens: number }> {
  // Build context from all model results
  const modelSections = modelResults
    .filter(r => r.status === 'complete')
    .map(r => `### ${r.role} (${r.modelId})\n${r.response}`)
    .join('\n\n---\n\n');

  const sourceSummary = modelResults
    .flatMap(r => r.webSources)
    .map(s => `- [${s.title}](${s.url})`)
    .join('\n');

  const modeInstruction = MODE_INSTRUCTIONS[searchMode] || '';
  const userMessage = [
    `## User Query\n${query}`,
    `## Search Mode: ${searchMode}\n${modeInstruction}`,
    userLocation ? `## User Location\n${userLocation}` : '',
    documentContext ? `## Document Context\n${documentContext}` : '',
    `## Model Results\n${modelSections}`,
    sourceSummary ? `## Web Sources Found\n${sourceSummary}` : '',
  ].filter(Boolean).join('\n\n');

  // Choose synthesis model + thinking config based on depth
  // Quick: Haiku think_hard | Thorough/Deep: Sonnet with higher budget
  let synthModel: string;
  let thinkingConfig: Record<string, unknown>;

  if (depth === 'quick') {
    synthModel = 'claude-haiku-4-5-20251001';
    thinkingConfig = { thinking: { type: 'enabled', budget_tokens: 10000 } };
  } else {
    // Thorough and Deep both use Sonnet 4.6 with adaptive thinking
    synthModel = 'claude-sonnet-4-6';
    thinkingConfig = { thinking: { type: 'adaptive' }, output_config: { effort: 'high' } };
  }

  const params: Record<string, unknown> = {
    model: synthModel,
    max_tokens: 32768,
    system: SYNTHESIS_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    stream: true,
    ...thinkingConfig,
  };

  let text = '';
  let thinking = '';
  let inputTokens = 0;
  let outputTokens = 0;

  const stream = anthropic.messages.stream(params as Parameters<typeof anthropic.messages.stream>[0]);

  if (signal) {
    signal.addEventListener('abort', () => stream.abort(), { once: true });
  }

  for await (const event of stream) {
    if (event.type === 'content_block_delta') {
      const delta = event.delta as unknown as Record<string, unknown>;
      if (delta.type === 'text_delta' && typeof delta.text === 'string') {
        text += delta.text;
        callbacks.onTextDelta(delta.text);
      } else if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
        thinking += delta.thinking;
        callbacks.onThinkingDelta(delta.thinking);
      }
    } else if (event.type === 'message_delta') {
      const usage = (event as unknown as Record<string, unknown>).usage as Record<string, number> | undefined;
      if (usage) outputTokens = usage.output_tokens || 0;
    } else if (event.type === 'message_start') {
      const msg = (event as unknown as Record<string, unknown>).message as Record<string, unknown> | undefined;
      const usage = msg?.usage as Record<string, number> | undefined;
      if (usage) inputTokens = usage.input_tokens || 0;
    }
  }

  return { text, thinking, inputTokens, outputTokens };
}

// ── Internal Phase Call (for Thorough analysis + Deep IRE) ──────────────────

async function runInternalPhaseCall(
  prompt: string,
  anthropic: Anthropic,
  options: {
    model?: string;
    budgetTokens?: number;
    maxTokens?: number;
    tools?: Array<Record<string, unknown>>;
  } = {},
): Promise<InternalPhaseResult> {
  const start = Date.now();
  const model = options.model || 'claude-sonnet-4-6';
  const maxTokens = options.maxTokens || 16384;

  // Use adaptive thinking for 4.6 models, budget_tokens for older/Haiku
  const is46Model = model.includes('opus') || model.includes('sonnet-4-6');
  const thinkingConfig = is46Model
    ? { thinking: { type: 'adaptive' }, output_config: { effort: 'high' } }
    : { thinking: { type: 'enabled', budget_tokens: options.budgetTokens || 10000 } };

  const params: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    ...thinkingConfig,
    system: SYNTHESIS_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  };
  if (options.tools) params.tools = options.tools;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await anthropic.messages.create(params as any) as any;

  let text = '';
  let thinking = '';
  let confidenceScore: number | undefined;
  let revisionNeeded: boolean | undefined;
  let gaps: string | undefined;

  for (const block of (response.content || []) as Array<Record<string, unknown>>) {
    if (block.type === 'text' && typeof block.text === 'string') {
      text += block.text;
    } else if (block.type === 'thinking' && typeof block.thinking === 'string') {
      thinking += block.thinking;
    } else if (block.type === 'tool_use' && block.name === 'assess_confidence') {
      const input = block.input as Record<string, unknown>;
      if (typeof input.confidence === 'number') confidenceScore = input.confidence;
      if (typeof input.revision_needed === 'boolean') revisionNeeded = input.revision_needed;
      if (typeof input.gaps === 'string') gaps = input.gaps;
    }
  }

  return {
    text,
    thinking,
    inputTokens: response.usage?.input_tokens || 0,
    outputTokens: response.usage?.output_tokens || 0,
    durationMs: Date.now() - start,
    confidenceScore,
    revisionNeeded,
    gaps,
  };
}

// ── Phase Prompt Builders ──────────────────────────────────────────────────

function buildAnalysisPrompt(
  query: string,
  searchResult: ModelResult,
  searchMode: SearchMode,
  userLocation?: string,
  localContext?: string,
): string {
  const modeInstruction = MODE_INSTRUCTIONS[searchMode] || '';
  return [
    `You are analysing web search results for the following query.`,
    `\n## Query\n${query}`,
    modeInstruction ? `\n## Search Mode: ${searchMode}\n${modeInstruction}` : '',
    userLocation ? `\n## User Location\n${userLocation}` : '',
    `\n## Web Search Results\n${searchResult.response}`,
    searchResult.webSources.length > 0
      ? `\n## Sources Found\n${searchResult.webSources.map(s => `- [${s.title}](${s.url})`).join('\n')}`
      : '',
    localContext || '',
    `\n## Task\nProvide a thorough, structured analysis of these search results. Identify key findings, assess source quality, note any contradictions or gaps, and organize the information by relevance. Do NOT provide a final answer — focus on analysis only.`,
  ].filter(Boolean).join('\n');
}

function buildReflectionPrompt(query: string, priorAnalysis: string): string {
  return [
    `You are reviewing a search analysis for the following query.`,
    `\n## Original Query\n${query}`,
    `\n## Prior Analysis\n${priorAnalysis}`,
    `\n## Task\nCritically evaluate the analysis above. Challenge assumptions, identify logical gaps, flag contradictions, and assess completeness. Then use the assess_confidence tool to record your confidence score (0.0-1.0) and whether deeper investigation is needed. If gaps exist, describe them in the 'gaps' field.`,
  ].join('\n');
}

function buildDeepenPrompt(query: string, priorContext: string, gaps: string): string {
  return [
    `You are deepening an analysis to resolve identified uncertainties.`,
    `\n## Original Query\n${query}`,
    `\n## Prior Analysis and Reflection\n${priorContext}`,
    gaps ? `\n## Identified Gaps\n${gaps}` : '',
    `\n## Task\nResolve the uncertainties and gaps identified in the reflection phase. Provide additional analysis, alternative interpretations, and strengthen the conclusions. Focus specifically on the weak points.`,
  ].filter(Boolean).join('\n');
}

// ── Quick search (Haiku web_search → Haiku think_hard synthesis) ────────────

export async function dispatchQuickSearch(
  db: Database.Database,
  query: string,
  userId: string,
  threadId: string | null,
  documentContext: string,
  anthropic: Anthropic,
  callbacks: SearchCallbacks,
  signal?: AbortSignal,
  context?: SearchContext,
  searchMode: SearchMode = 'knowledge',
): Promise<SearchResult> {
  const searchId = randomUUID();
  const startTime = Date.now();
  callbacks.onSearchStart(searchId, 'quick');

  // Enrich query with domain context
  const enrichedQuery = enrichQuery(query, context);

  // Pre-search reasoning — tell the user what we're doing
  const preSearchReasoning = buildPreSearchReasoning(query, enrichedQuery, 'quick', searchMode, context);
  callbacks.onPreSearchReasoning(preSearchReasoning);

  // Step 1: Haiku web search + local knowledge in parallel
  callbacks.onModelStart(SEARCH_MODEL.modelId, 'Web Search');

  const [searchResult, localResults] = await Promise.all([
    dispatchSingleModel(enrichedQuery, SEARCH_MODEL, documentContext, anthropic, searchMode, context?.userLocation),
    searchLocalKnowledge(db, query, 3),
  ]);
  callbacks.onModelComplete(searchResult);

  if (searchResult.status === 'error') {
    callbacks.onError('Search failed. Check your Anthropic API key.');
    throw new Error('Search failed');
  }

  // Step 2: Haiku synthesis with think_hard reasoning
  callbacks.onSynthesisStart();

  const localContext = localResults.length > 0
    ? '\n\n## Local Knowledge Results\n' + localResults.map(l => `### ${l.title}\n${l.snippet}`).join('\n\n')
    : '';

  const synth = await streamSynthesis(
    query, [searchResult], 'quick',
    documentContext + localContext,
    anthropic, callbacks, signal, searchMode, context?.userLocation,
  );

  const allSources = [...searchResult.webSources, ...localResults];
  const totalInput = searchResult.inputTokens + synth.inputTokens;
  const totalOutput = searchResult.outputTokens + synth.outputTokens;
  const costUsd = estimateCost(searchResult.inputTokens, searchResult.outputTokens, SEARCH_MODEL.modelId)
    + estimateCost(synth.inputTokens, synth.outputTokens, 'claude-haiku-4-5-20251001');

  const result: SearchResult = {
    id: searchId,
    query,
    enrichedQuery,
    depth: 'quick',
    synthesis: synth.text,
    thinking: synth.thinking,
    preSearchReasoning,
    modelResults: [searchResult],
    webSources: allSources.filter(s => s.sourceType === 'web'),
    localSources: allSources.filter(s => s.sourceType !== 'web'),
    inputTokens: totalInput,
    outputTokens: totalOutput,
    costUsd,
    durationMs: Date.now() - startTime,
    followUpSuggestions: extractFollowUps(synth.text),
    context,
  };

  // Persist to DB
  persistSearch(db, result, userId, threadId);
  callbacks.onSearchComplete(result);
  return result;
}

// ── Thorough search (Haiku search → Haiku analysis → Sonnet chairman) ──────

export async function dispatchThoroughSearch(
  db: Database.Database,
  query: string,
  userId: string,
  threadId: string | null,
  documentContext: string,
  anthropic: Anthropic,
  callbacks: SearchCallbacks,
  signal?: AbortSignal,
  context?: SearchContext,
  searchMode: SearchMode = 'knowledge',
): Promise<SearchResult> {
  const searchId = randomUUID();
  const startTime = Date.now();
  callbacks.onSearchStart(searchId, 'thorough');

  const enrichedQuery = enrichQuery(query, context);
  const preSearchReasoning = buildPreSearchReasoning(query, enrichedQuery, 'thorough', searchMode, context);
  callbacks.onPreSearchReasoning(preSearchReasoning);

  // Step 1: Haiku web search + local knowledge
  callbacks.onModelStart(SEARCH_MODEL.modelId, 'Web Search');
  const [searchResult, localResults] = await Promise.all([
    dispatchSingleModel(enrichedQuery, SEARCH_MODEL, documentContext, anthropic, searchMode, context?.userLocation),
    searchLocalKnowledge(db, query, 5),
  ]);
  callbacks.onModelComplete(searchResult);

  if (searchResult.status === 'error') {
    callbacks.onError('Search failed. Check your Anthropic API key.');
    throw new Error('Search failed');
  }

  const localContext = localResults.length > 0
    ? '\n\n## Local Knowledge\n' + localResults.map(l => `### ${l.title}\n${l.snippet}`).join('\n\n')
    : '';

  // Step 2: Haiku investigation analysis (non-streaming)
  callbacks.onModelStart('claude-haiku-4-5-20251001', 'Investigation');
  const analysisPrompt = buildAnalysisPrompt(query, searchResult, searchMode, context?.userLocation, localContext);
  const analysis = await runInternalPhaseCall(analysisPrompt, anthropic, {
    model: 'claude-haiku-4-5-20251001',
    budgetTokens: 10000,
    maxTokens: 16384,
  });
  const analysisResult: ModelResult = {
    modelId: 'claude-haiku-4-5-20251001',
    provider: 'anthropic',
    role: 'Investigation',
    response: analysis.text,
    webSources: [],
    inputTokens: analysis.inputTokens,
    outputTokens: analysis.outputTokens,
    durationMs: analysis.durationMs,
    status: 'complete',
  };
  callbacks.onModelComplete(analysisResult);

  // Step 3: Sonnet chairman synthesis (streaming)
  callbacks.onSynthesisStart();
  const modelResults: ModelResult[] = [searchResult, analysisResult];

  const synth = await streamSynthesis(
    query, modelResults, 'thorough',
    documentContext + localContext,
    anthropic, callbacks, signal, searchMode, context?.userLocation,
  );

  // Assemble results
  const totalInput = searchResult.inputTokens + analysis.inputTokens + synth.inputTokens;
  const totalOutput = searchResult.outputTokens + analysis.outputTokens + synth.outputTokens;
  const costUsd = estimateCost(searchResult.inputTokens, searchResult.outputTokens, SEARCH_MODEL.modelId)
    + estimateCost(analysis.inputTokens, analysis.outputTokens, 'claude-haiku-4-5-20251001')
    + estimateCost(synth.inputTokens, synth.outputTokens, 'claude-sonnet-4-6');

  const result: SearchResult = {
    id: searchId,
    query,
    enrichedQuery,
    depth: 'thorough',
    synthesis: synth.text,
    thinking: synth.thinking,
    preSearchReasoning,
    modelResults,
    webSources: searchResult.webSources,
    localSources: localResults,
    inputTokens: totalInput,
    outputTokens: totalOutput,
    costUsd,
    durationMs: Date.now() - startTime,
    followUpSuggestions: extractFollowUps(synth.text),
    context,
  };

  persistSearch(db, result, userId, threadId);
  callbacks.onSearchComplete(result);
  return result;
}

// ── Deep search (Haiku search → Sonnet IRE with confidence gating) ─────────

export async function dispatchDeepSearch(
  db: Database.Database,
  query: string,
  userId: string,
  threadId: string | null,
  documentContext: string,
  anthropic: Anthropic,
  callbacks: SearchCallbacks,
  signal?: AbortSignal,
  context?: SearchContext,
  searchMode: SearchMode = 'knowledge',
): Promise<SearchResult> {
  const searchId = randomUUID();
  const startTime = Date.now();
  callbacks.onSearchStart(searchId, 'deep');

  const enrichedQuery = enrichQuery(query, context);
  const preSearchReasoning = buildPreSearchReasoning(query, enrichedQuery, 'deep', searchMode, context);
  callbacks.onPreSearchReasoning(preSearchReasoning);

  // Step 1: Haiku web search + local knowledge
  callbacks.onModelStart(SEARCH_MODEL.modelId, 'Web Search');
  const [searchResult, localResults] = await Promise.all([
    dispatchSingleModel(enrichedQuery, SEARCH_MODEL, documentContext, anthropic, searchMode, context?.userLocation),
    searchLocalKnowledge(db, query, 5),
  ]);
  callbacks.onModelComplete(searchResult);

  if (searchResult.status === 'error') {
    callbacks.onError('Search failed. Check your Anthropic API key.');
    throw new Error('Search failed');
  }

  const localContext = localResults.length > 0
    ? '\n\n## Local Knowledge\n' + localResults.map(l => `### ${l.title}\n${l.snippet}`).join('\n\n')
    : '';

  const allModelResults: ModelResult[] = [searchResult];
  const phaseOutputs: string[] = [];

  // Phase 1: Analyse (Sonnet, non-streaming)
  callbacks.onModelStart('claude-sonnet-4-6', 'Analysis');
  const analysisPrompt = buildAnalysisPrompt(query, searchResult, searchMode, context?.userLocation, localContext);
  const analysis = await runInternalPhaseCall(analysisPrompt, anthropic, {
    model: 'claude-sonnet-4-6',
    budgetTokens: 10000,
    maxTokens: 16384,
  });
  phaseOutputs.push(`### ANALYSIS\n${analysis.text}`);
  allModelResults.push({
    modelId: 'claude-sonnet-4-6',
    provider: 'anthropic',
    role: 'Analysis',
    response: analysis.text,
    webSources: [],
    inputTokens: analysis.inputTokens,
    outputTokens: analysis.outputTokens,
    durationMs: analysis.durationMs,
    status: 'complete',
  });
  callbacks.onModelComplete(allModelResults[allModelResults.length - 1]);

  // Phase 2: Reflect (Sonnet, non-streaming, with confidence tool)
  callbacks.onModelStart('claude-sonnet-4-6', 'Reflection');
  const reflectPrompt = buildReflectionPrompt(query, phaseOutputs.join('\n\n'));
  const reflection = await runInternalPhaseCall(reflectPrompt, anthropic, {
    model: 'claude-sonnet-4-6',
    budgetTokens: 10000,
    maxTokens: 16384,
    tools: [CONFIDENCE_TOOL],
  });
  phaseOutputs.push(`### REFLECTION\n${reflection.text}\nConfidence: ${reflection.confidenceScore ?? 'N/A'}`);
  allModelResults.push({
    modelId: 'claude-sonnet-4-6',
    provider: 'anthropic',
    role: 'Reflection',
    response: reflection.text,
    webSources: [],
    inputTokens: reflection.inputTokens,
    outputTokens: reflection.outputTokens,
    durationMs: reflection.durationMs,
    status: 'complete',
    confidenceScore: reflection.confidenceScore,
  });
  callbacks.onModelComplete(allModelResults[allModelResults.length - 1]);

  // Phase 3: Deepen (only if confidence < 0.8)
  const confidence = reflection.confidenceScore ?? 0.5;
  if (confidence < 0.8) {
    callbacks.onModelStart('claude-sonnet-4-6', 'Deepening');
    const deepenPrompt = buildDeepenPrompt(query, phaseOutputs.join('\n\n'), reflection.gaps || '');
    const deepened = await runInternalPhaseCall(deepenPrompt, anthropic, {
      model: 'claude-sonnet-4-6',
      budgetTokens: 10000,
      maxTokens: 16384,
    });
    phaseOutputs.push(`### DEEPENED ANALYSIS\n${deepened.text}`);
    allModelResults.push({
      modelId: 'claude-sonnet-4-6',
      provider: 'anthropic',
      role: 'Deepening',
      response: deepened.text,
      webSources: [],
      inputTokens: deepened.inputTokens,
      outputTokens: deepened.outputTokens,
      durationMs: deepened.durationMs,
      status: 'complete',
    });
    callbacks.onModelComplete(allModelResults[allModelResults.length - 1]);
  }

  // Final: Sonnet synthesis (streaming) with all phase context
  callbacks.onSynthesisStart();

  // Include phase outputs in the synthesis context
  const phaseContext = phaseOutputs.join('\n\n---\n\n');
  const synthModelResults = [{
    ...searchResult,
    response: searchResult.response + '\n\n## Multi-Phase Analysis\n' + phaseContext,
  }];

  const synth = await streamSynthesis(
    query, synthModelResults, 'deep',
    documentContext + localContext,
    anthropic, callbacks, signal, searchMode, context?.userLocation,
  );

  // Assemble results
  const totalInput = allModelResults.reduce((a, r) => a + r.inputTokens, 0) + synth.inputTokens;
  const totalOutput = allModelResults.reduce((a, r) => a + r.outputTokens, 0) + synth.outputTokens;
  const costUsd = allModelResults.reduce((a, r) => a + estimateCost(r.inputTokens, r.outputTokens, r.modelId), 0)
    + estimateCost(synth.inputTokens, synth.outputTokens, 'claude-sonnet-4-6');

  const result: SearchResult = {
    id: searchId,
    query,
    enrichedQuery,
    depth: 'deep',
    synthesis: synth.text,
    thinking: synth.thinking,
    preSearchReasoning,
    modelResults: allModelResults,
    webSources: searchResult.webSources,
    localSources: localResults,
    inputTokens: totalInput,
    outputTokens: totalOutput,
    costUsd,
    durationMs: Date.now() - startTime,
    followUpSuggestions: extractFollowUps(synth.text),
    context,
  };

  persistSearch(db, result, userId, threadId);
  callbacks.onSearchComplete(result);
  return result;
}

// ── Follow-up handling ─────────────────────────────────────────────────────

export async function handleFollowUp(
  db: Database.Database,
  searchId: string,
  question: string,
  anthropic: Anthropic,
  callbacks: Pick<SearchCallbacks, 'onTextDelta' | 'onThinkingDelta'>,
  signal?: AbortSignal,
): Promise<{ id: string; answer: string; thinking: string }> {
  const search = db.prepare('SELECT * FROM pathfinder_searches WHERE id = ?').get(searchId) as Record<string, unknown> | undefined;
  if (!search) throw new Error('Search not found');

  const followUpId = randomUUID();
  const context = [
    `## Original Query\n${search.query}`,
    `## Previous Synthesis\n${search.synthesis}`,
    `## Follow-up Question\n${question}`,
  ].join('\n\n');

  let text = '';
  let thinking = '';
  let inputTokens = 0;
  let outputTokens = 0;

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 16384,
    system: SYNTHESIS_PROMPT,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    messages: [{ role: 'user', content: context }],
  });

  if (signal) signal.addEventListener('abort', () => stream.abort(), { once: true });

  for await (const event of stream) {
    if (event.type === 'content_block_delta') {
      const delta = event.delta as unknown as Record<string, unknown>;
      if (delta.type === 'text_delta' && typeof delta.text === 'string') {
        text += delta.text;
        callbacks.onTextDelta(delta.text);
      } else if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
        thinking += delta.thinking;
        callbacks.onThinkingDelta(delta.thinking);
      }
    } else if (event.type === 'message_delta') {
      const usage = (event as unknown as Record<string, unknown>).usage as Record<string, number> | undefined;
      if (usage) outputTokens = usage.output_tokens || 0;
    } else if (event.type === 'message_start') {
      const msg = (event as unknown as Record<string, unknown>).message as Record<string, unknown> | undefined;
      const usage = msg?.usage as Record<string, number> | undefined;
      if (usage) inputTokens = usage.input_tokens || 0;
    }
  }

  db.prepare(
    'INSERT INTO pathfinder_followups (id, search_id, question, answer, thinking, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(followUpId, searchId, question, text, thinking, inputTokens, outputTokens);

  return { id: followUpId, answer: text, thinking };
}

// ── Document context builder ───────────────────────────────────────────────

export function buildDocumentContext(db: Database.Database, documentIds: string[], maxTokens = 30000): string {
  if (!documentIds.length) return '';
  const placeholders = documentIds.map(() => '?').join(',');
  const docs = db.prepare(
    `SELECT filename, extracted_text, token_estimate FROM pathfinder_documents WHERE id IN (${placeholders})`
  ).all(...documentIds) as Array<{ filename: string; extracted_text: string; token_estimate: number }>;

  let budget = maxTokens;
  const sections: string[] = [];
  for (const doc of docs) {
    if (budget <= 0) break;
    const text = doc.extracted_text || '';
    const tokens = doc.token_estimate || estimateTokens(text);
    if (tokens <= budget) {
      sections.push(`### ${doc.filename}\n${text}`);
      budget -= tokens;
    } else {
      // Truncate to fit budget
      const charLimit = Math.floor(budget * 4); // rough chars-per-token
      sections.push(`### ${doc.filename} (truncated)\n${text.slice(0, charLimit)}`);
      budget = 0;
    }
  }
  return sections.join('\n\n');
}

// ── Suggestion engine ──────────────────────────────────────────────────────

export async function generateSuggestions(
  db: Database.Database,
  userId: string,
  anthropic: Anthropic,
): Promise<Array<{ id: string; query: string; context: string }>> {
  // Gather recent context
  const recentSearches = db.prepare(
    'SELECT query FROM pathfinder_searches WHERE user_id = ? ORDER BY created_at DESC LIMIT 5'
  ).all(userId) as Array<{ query: string }>;

  const recentSessions = db.prepare(
    'SELECT title, module_id FROM sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 10'
  ).all(userId) as Array<{ title: string; module_id: string }>;

  if (recentSearches.length === 0 && recentSessions.length === 0) return [];

  const contextText = [
    recentSearches.length ? `Recent searches: ${recentSearches.map(s => s.query).join('; ')}` : '',
    recentSessions.length ? `Recent work sessions: ${recentSessions.map(s => `${s.title} (${s.module_id})`).join('; ')}` : '',
  ].filter(Boolean).join('\n');

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: 'You are a proactive research assistant. Based on the user\'s recent activity, suggest 3-5 search queries they might find valuable. Return JSON array: [{"query": "...", "context": "brief reason"}]. Only return the JSON, nothing else.',
      messages: [{ role: 'user', content: contextText }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const parsed = JSON.parse(text) as Array<{ query: string; context: string }>;

    // Store in DB
    const suggestions: Array<{ id: string; query: string; context: string }> = [];
    const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    for (const s of parsed.slice(0, 5)) {
      const id = randomUUID();
      db.prepare(
        'INSERT INTO pathfinder_suggestions (id, user_id, query, context, expires_at) VALUES (?, ?, ?, ?, ?)'
      ).run(id, userId, s.query, s.context, expiresAt);
      suggestions.push({ id, query: s.query, context: s.context });
    }
    return suggestions;
  } catch {
    return [];
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function persistSearch(db: Database.Database, result: SearchResult, userId: string, threadId: string | null) {
  // Try with new columns first; fall back to original schema if migration 047 hasn't run
  try {
    db.prepare(`
      INSERT INTO pathfinder_searches (id, user_id, thread_id, query, enriched_query, depth, synthesis, thinking, status, model_results, web_sources, input_tokens, output_tokens, cost_usd, duration_ms, active_area_id, active_module_id, context_snapshot, search_mode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'complete', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      result.id, userId, threadId, result.query, result.enrichedQuery, result.depth,
      result.synthesis, result.thinking,
      JSON.stringify(result.modelResults),
      JSON.stringify([...result.webSources, ...result.localSources]),
      result.inputTokens, result.outputTokens, result.costUsd, result.durationMs,
      result.context?.activeAreaId || null,
      result.context?.activeModuleId || null,
      result.context ? JSON.stringify(result.context) : null,
      'knowledge',
    );
  } catch {
    // Fallback: original schema without migration 047 columns
    db.prepare(`
      INSERT INTO pathfinder_searches (id, user_id, thread_id, query, depth, synthesis, thinking, status, model_results, web_sources, input_tokens, output_tokens, cost_usd, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'complete', ?, ?, ?, ?, ?, ?)
    `).run(
      result.id, userId, threadId, result.query, result.depth,
      result.synthesis, result.thinking,
      JSON.stringify(result.modelResults),
      JSON.stringify([...result.webSources, ...result.localSources]),
      result.inputTokens, result.outputTokens, result.costUsd, result.durationMs,
    );
  }

  // Persist individual sources (web + local)
  try {
    const stmt = db.prepare(
      'INSERT INTO pathfinder_sources (id, search_id, url, title, snippet, source_type, model_id, relevance_score, quality_score, consensus_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const allSources = [...result.webSources, ...result.localSources];
    for (let i = 0; i < allSources.length; i++) {
      const src = allSources[i];
      stmt.run(
        randomUUID(), result.id, src.url, src.title, src.snippet,
        src.sourceType, src.modelId, src.relevanceScore,
        src.qualityScore, src.consensusScore,
      );
    }
  } catch {
    // Fallback: original schema without quality_score/consensus_score
    const stmt = db.prepare(
      'INSERT INTO pathfinder_sources (id, search_id, url, title, snippet, source_type, model_id, relevance_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const allSources = [...result.webSources, ...result.localSources];
    for (const src of allSources) {
      stmt.run(randomUUID(), result.id, src.url, src.title, src.snippet, src.sourceType, src.modelId, src.relevanceScore);
    }
  }

  // Update thread timestamp if in a thread
  if (threadId) {
    db.prepare('UPDATE pathfinder_threads SET updated_at = datetime(\'now\') WHERE id = ?').run(threadId);
  }
}

function extractFollowUps(synthesis: string): string[] {
  // Try to extract follow-up suggestions from the synthesis text
  const followUpSection = synthesis.match(/###?\s*Follow[- ]?up.*?\n([\s\S]*?)(?=\n###|$)/i);
  if (!followUpSection) return [];
  const lines = followUpSection[1].split('\n').filter(l => l.trim().startsWith('-') || l.trim().match(/^\d+\./));
  return lines.map(l => l.replace(/^[-\d.)\s]+/, '').trim()).filter(Boolean).slice(0, 3);
}
