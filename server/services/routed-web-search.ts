/**
 * routed-web-search.ts — web search through the provider router (Wave 6, track I).
 *
 * Radar, the market backtest, the market workflow orchestrator and Pathfinder
 * used to build their own Anthropic client for one reason: the API's
 * server-side `web_search` tool. The router carries that tool now — callChat
 * forwards it to the Anthropic API branch, and the subscription engine grants
 * exactly WebSearch + WebFetch when ANTON's web_search entry is present — so
 * these sites pass `tools: [webSearchTool(n)]` to callChat like any other call.
 *
 * What the router cannot do is search the web on Mistral, OpenAI, Gemini,
 * Ollama or a compat endpoint: their adapters drop the entry, and the model
 * would then answer a "search the web" prompt from memory — fabricated
 * headlines presented as fresh results. `modelCanWebSearch` is the gate every
 * caller checks first, so those installs degrade honestly (skip, or fall back
 * to their non-search path) instead.
 */

import { getProviderFromModelId } from './model-adapter.js';

/** ANTON's web_search tool entry, as the router and both Claude engines understand it. */
export interface WebSearchToolEntry {
  type: 'web_search_20250305';
  name: 'web_search';
  max_uses: number;
  [key: string]: unknown;
}

export function webSearchTool(maxUses = 5): WebSearchToolEntry {
  return { type: 'web_search_20250305', name: 'web_search', max_uses: maxUses };
}

/** The provider a model id dispatches to, or 'unknown' when it cannot be told from the id. */
export function providerOfModel(modelId: string): string {
  try {
    return getProviderFromModelId(modelId);
  } catch {
    return 'unknown';
  }
}

/**
 * True when a call on `modelId` can really search the web: the Anthropic API
 * (with a key) or the Claude subscription engine. Everything else would
 * silently drop the tool.
 */
export function modelCanWebSearch(modelId: string): boolean {
  const provider = providerOfModel(modelId);
  if (provider === 'anthropic_sdk') return true;
  if (provider === 'anthropic') return !!process.env.ANTHROPIC_API_KEY;
  return false;
}

export interface MarkdownLink {
  title: string;
  url: string;
}

/**
 * The http(s) links a search answer cites, in order, de-duplicated by URL.
 * The router returns text only — the API's structured web_search_tool_result
 * blocks do not survive it — so the sources are read back from the markdown
 * links the search prompts require (`[Title](https://…)`), plus bare URLs.
 */
export function extractMarkdownLinks(text: string): MarkdownLink[] {
  const seen = new Set<string>();
  const out: MarkdownLink[] = [];
  const push = (title: string, rawUrl: string) => {
    const url = rawUrl.replace(/[).,;:!?]+$/, '');
    if (!/^https?:\/\//i.test(url) || seen.has(url)) return;
    seen.add(url);
    out.push({ title: title.trim() || url, url });
  };
  const linkRe = /\[([^\]\n]{0,300})\]\((https?:\/\/[^\s)]+)\)/g;
  for (let m = linkRe.exec(text); m !== null; m = linkRe.exec(text)) push(m[1], m[2]);
  const withoutLinks = text.replace(linkRe, ' ');
  const bareRe = /https?:\/\/[^\s<>()\]"']+/g;
  for (let m = bareRe.exec(withoutLinks); m !== null; m = bareRe.exec(withoutLinks)) push('', m[0]);
  return out;
}
