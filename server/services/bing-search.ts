/**
 * bing-search.ts — Bing Web Search API v7 client
 *
 * Used to provide web search grounding for Azure OpenAI models,
 * giving them the same live-search capability as Claude's web_search tool.
 *
 * Results are fetched and injected into the system prompt before the
 * LLM call, so the model can synthesize answers from current web sources.
 */

import type { DatabaseAdapter } from '../db/database.js';
import { decrypt } from './credential-vault.js';

const BING_SEARCH_ENDPOINT = 'https://api.bing.microsoft.com/v7.0/search';

// ── Types ──────────────────────────────────────────────────────

export interface BingSearchResult {
  name: string;
  url: string;
  snippet: string;
  dateLastCrawled?: string;
}

export interface BingSearchResponse {
  results: BingSearchResult[];
  query: string;
}

// ── Resolve Bing API key from DB ────────────────────────────────

export async function getBingSearchApiKey(db: DatabaseAdapter): Promise<string | null> {
  try {
    const row = await db.get<{ bing_search_api_key_encrypted: string | null }>(
      "SELECT bing_search_api_key_encrypted FROM azure_openai_config WHERE id = 'default' AND is_active = TRUE"
    );
    if (!row?.bing_search_api_key_encrypted) return null;
    return decrypt(row.bing_search_api_key_encrypted);
  } catch {
    return null;
  }
}

// ── Search ──────────────────────────────────────────────────────

export async function searchBing(
  query: string,
  apiKey: string,
  count: number = 8
): Promise<BingSearchResponse> {
  const url = new URL(BING_SEARCH_ENDPOINT);
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(count));
  url.searchParams.set('mkt', 'en-US');
  url.searchParams.set('safeSearch', 'Moderate');

  const response = await fetch(url.toString(), {
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey,
    },
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Bing Search API error ${response.status}: ${errText}`);
  }

  const data = await response.json() as {
    webPages?: {
      value?: Array<{
        name: string;
        url: string;
        snippet: string;
        dateLastCrawled?: string;
      }>;
    };
  };

  const results: BingSearchResult[] = (data.webPages?.value ?? []).map((r) => ({
    name: r.name,
    url: r.url,
    snippet: r.snippet,
    dateLastCrawled: r.dateLastCrawled,
  }));

  return { results, query };
}

// ── Format results for prompt injection ──────────────────────────

export function formatBingResultsForPrompt(response: BingSearchResponse): string {
  if (response.results.length === 0) {
    return `## WEB SEARCH RESULTS\nNo relevant results found for: "${response.query}"`;
  }

  const formatted = response.results.map((r, i) => {
    const date = r.dateLastCrawled
      ? ` (crawled: ${new Date(r.dateLastCrawled).toISOString().split('T')[0]})`
      : '';
    return `[${i + 1}] ${r.name}${date}\n    URL: ${r.url}\n    ${r.snippet}`;
  }).join('\n\n');

  return `## WEB SEARCH RESULTS\nThe following web search results were retrieved for context. Cite URLs when referencing this information.\n\nQuery: "${response.query}"\n\n${formatted}`;
}

// ── High-level: search and format ─────────────────────────────────

export async function searchAndFormat(
  query: string,
  apiKey: string,
  count?: number
): Promise<string> {
  const response = await searchBing(query, apiKey, count);
  return formatBingResultsForPrompt(response);
}

// ── Extract search query from user message ──────────────────────

/**
 * Extracts a reasonable search query from the user's latest message.
 * Truncates to ~200 chars to stay within Bing query limits.
 */
export function extractSearchQuery(userMessage: string): string {
  // Strip markdown formatting
  let query = userMessage
    .replace(/```[\s\S]*?```/g, '')     // code blocks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/[#*_~`>]/g, '')           // formatting chars
    .replace(/\n+/g, ' ')              // newlines to spaces
    .trim();

  // Truncate
  if (query.length > 200) {
    query = query.substring(0, 200).replace(/\s+\S*$/, '');
  }

  return query || userMessage.substring(0, 200);
}
