import type { DatabaseAdapter } from '../db/database.js';

import type Anthropic from '@anthropic-ai/sdk';
import Parser from 'rss-parser';
import { getRoutedUtilityModel, getAnthropicUtilityModel } from './utility-model.js';
import { callChat, mapModelToProvider } from './provider-router.js';
import { SUBCATEGORY_KEYWORDS, CATEGORY_SCORE_PROMPTS, type RadarCategory } from './radar-constants.js';

// ── Types ────────────────────────────────────────────────────────

interface RadarSource {
  id: string;
  display_name: string;
  url: string;
  source_type: string;
  fetch_interval_hours: number;
  last_fetched: string | null;
  last_fetch_status: string | null;
  areas: string;
  keywords: string;
  is_active: number;
  category: string;
}

interface RawItem {
  external_id: string;
  title: string;
  summary: string;
  url: string | null;
  published_at: string | null;
  item_type: string;
  category: string;
  subcategory: string | null;
}

interface SourceScanResult {
  sourceId: string;
  sourceName: string;
  newItems: number;
  error?: string;
}

export interface ScanResult {
  sourcesScanned: number;
  newItemsFound: number;
  itemsScored: number;
  errors: Array<{ sourceId: string; error: string }>;
  startedAt: string;
  completedAt: string;
}

// ── Item type classifiers ─────────────────────────────────────────

const TYPE_KEYWORDS: Record<string, string[]> = {
  consultation: ['consultation', 'public comment', 'call for evidence', 'discussion paper', 'call for advice'],
  enforcement: ['fine', 'penalty', 'sanction', 'enforcement', 'breach', 'infringement', 'decision on', 'supervisory measure', 'prohibition'],
  regulation: ['regulation', 'directive', 'delegated act', 'implementing act', 'regulatory technical standard', 'RTS', 'ITS'],
  guideline: ['guideline', 'guidance', 'recommendation', 'best practice', 'opinion'],
  report: ['report', 'annual report', 'assessment', 'review', 'analysis', 'survey', 'study'],
  speech: ['speech', 'keynote', 'remarks', 'address', 'interview'],
};

const PEVC_TYPE_KEYWORDS: Record<string, string[]> = {
  funding_round: ['funding round', 'series a', 'series b', 'series c', 'series d', 'seed round', 'pre-seed', 'raised $', 'raised €', 'raised £', 'raises $', 'raises €', 'venture round', 'capital raise', 'crowdfunding', 'oversubscribed round'],
  exit_event: ['ipo', 'acquisition', 'acqui-hire', 'merger', 'going public', 'spac', 'trade sale', 'secondary sale', 'buyout exit', 'strategic acquisition', 'listed on'],
  patent: ['patent', 'intellectual property', 'ip filing', 'trademark', 'patent granted', 'patent filed'],
  research_paper: ['arxiv', 'preprint', 'peer-reviewed', 'academic paper', 'research paper', 'white paper', 'university research', 'journal of', 'published in'],
  technology: ['artificial intelligence', 'machine learning', 'deep learning', 'blockchain', 'quantum', 'robotics', 'biotech', 'cleantech', 'fintech', 'edtech', 'healthtech', 'proptech', 'saas platform', 'open source'],
  company_signal: ['launches', 'product launch', 'partnership', 'strategic partnership', 'signed contract', 'expands to', 'opens office', 'new customer', 'new hire', 'appoints ceo', 'appoints cto', 'revenue milestone', 'reaches profitability'],
  macro_trend: ['market size', 'industry forecast', 'sector growth', 'market forecast', 'total addressable market', 'gdp impact', 'macroeconomic', 'global market', 'emerging market', 'industry report'],
  sector: ['sector overview', 'vertical', 'industry segment', 'market segment', 'sub-sector'],
};

function classifyItemType(title: string, summary: string, category?: string): string {
  const text = `${title} ${summary}`.toLowerCase();

  // Use PE/VC classification for pe-vc category sources
  if (category === 'pe-vc') {
    for (const [type, keywords] of Object.entries(PEVC_TYPE_KEYWORDS)) {
      if (keywords.some((kw) => text.includes(kw))) return type;
    }
    return 'company_signal'; // default for pe-vc items
  }

  // Standard regulatory classification
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) return type;
  }
  return 'publication';
}

// ── Subcategory classifier ─────────────────────────────────────────

function classifySubcategory(title: string, summary: string): { subcategory: string | null; inferredCategory: RadarCategory | null } {
  const text = `${title} ${summary}`.toLowerCase();
  for (const [subcategory, config] of Object.entries(SUBCATEGORY_KEYWORDS)) {
    if (config.keywords.some((kw) => text.includes(kw))) {
      return { subcategory, inferredCategory: config.category };
    }
  }
  return { subcategory: null, inferredCategory: null };
}

// ── Fetcher factory ──────────────────────────────────────────────

export async function createRadarFetcher(db: DatabaseAdapter, anthropic: Anthropic) {
  const rssParser = new Parser({
    timeout: 15000,
    headers: { 'User-Agent': 'ANTON-FCP-Workbench/1.0 (Regulatory Monitor)' },
  });

  // Track scan state
  let scanInProgress = false;
  let scanAborted = false;
  let currentSource: { id: string; name: string } | null = null;
  let sourcesCompleted = 0;
  let sourcesTotal = 0;
  let lastScanTime: string | null = null;
  let lastScanResult: ScanResult | null = null;

  // Auto-scan schedule state
  let autoScanTimer: ReturnType<typeof setInterval> | null = null;
  let autoScanIntervalHours = 0;

  // ── SQL templates (inlined at call sites via adapter) ───────

  const INSERT_ITEM_SQL = `
    INSERT INTO radar_items
      (id, source_id, external_id, title, summary, url, item_type, published_at, relevance_score, category, subcategory)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0.5, ?, ?)
    ON CONFLICT DO NOTHING
  `;

  const UPDATE_SOURCE_STATUS_SQL = `
    UPDATE radar_sources SET last_fetched = ?, last_fetch_status = ? WHERE id = ?
  `;

  const GET_UNSCORED_SQL = `
    SELECT id, title, summary, item_type, url, category FROM radar_items WHERE ai_scored = 0 LIMIT ?
  `;



  // ── RSS strategy ─────────────────────────────────────────────

  async function fetchRSSSource(source: RadarSource): Promise<RawItem[]> {
    const feed = await rssParser.parseURL(source.url);
    const items: RawItem[] = [];

    for (const entry of feed.items ?? []) {
      if (!entry.title) continue;
      const title = entry.title.trim();
      const summary = (entry.contentSnippet || entry.content || entry.summary || '').trim().slice(0, 2000);
      const externalId = entry.guid || entry.link || `${source.id}_${title.slice(0, 80)}`;
      const publishedAt = entry.isoDate || entry.pubDate
        ? new Date(entry.isoDate || entry.pubDate!).toISOString()
        : null;

      const { subcategory, inferredCategory } = classifySubcategory(title, summary);
      items.push({
        external_id: externalId,
        title,
        summary,
        url: entry.link || null,
        published_at: publishedAt,
        item_type: classifyItemType(title, summary, source.category),
        category: source.category || inferredCategory || 'regulatory',
        subcategory,
      });
    }

    return items;
  }

  // ── Claude web search strategy ───────────────────────────────

  async function fetchWebSearchSource(source: RadarSource): Promise<RawItem[]> {
    const keywords = safeJsonParse(source.keywords, []) as string[];
    const areas = safeJsonParse(source.areas, []) as string[];
    const focusDescription = [...keywords, ...areas].filter(Boolean).join(', ') || 'regulatory developments';

    const isPevc = source.category === 'pe-vc';
    const itemTypeOptions = isPevc
      ? '"technology", "sector", "company_signal", "funding_round", "exit_event", "macro_trend", "patent", "research_paper"'
      : '"consultation", "regulation", "guideline", "enforcement", "report", "publication", "speech"';
    const searchInstruction = isPevc
      ? `Find startup/company news, funding rounds, technology breakthroughs, market signals, and investment-relevant items published in the last 30 days.`
      : `Find regulatory publications, consultations, guidelines, and enforcement actions published in the last 30 days.`;

    try {
      const message = await anthropic.messages.create({
        // Anthropic-bound (web_search tool): honours a Claude utility
        // override, falls back to Haiku for non-Claude utility models.
        model: await getAnthropicUtilityModel(db),
        max_tokens: 4096,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }] as unknown as Anthropic.Messages.Tool[],
        messages: [
          {
            role: 'user',
            content: `Search for the latest news and publications from "${source.display_name}" (${source.url}).

Category: ${source.category || 'regulatory'}
Focus areas: ${focusDescription}

${searchInstruction}

For each item found, extract:
- title: the publication/document title
- summary: 1-2 sentence description
- url: direct link to the item
- published_at: ISO 8601 date if available (or null)
- item_type: one of ${itemTypeOptions}

Return ONLY a valid JSON array. No markdown, no explanation. Example:
[{"title":"...","summary":"...","url":"...","published_at":"2026-02-01","item_type":"${isPevc ? 'funding_round' : 'regulation'}"}]

If you find nothing relevant, return: []`,
          },
        ],
      });

      // Extract text from response
      const responseText = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      // Try to parse JSON from the response
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        title: string;
        summary: string;
        url?: string;
        published_at?: string;
        item_type?: string;
      }>;

      return parsed
        .filter((item) => item.title)
        .map((item) => {
          const { subcategory, inferredCategory } = classifySubcategory(item.title, item.summary || '');
          return {
            external_id: item.url || `ws_${source.id}_${item.title.slice(0, 80)}_${Date.now()}`,
            title: item.title.trim(),
            summary: (item.summary || '').trim().slice(0, 2000),
            url: item.url || null,
            published_at: item.published_at ? new Date(item.published_at).toISOString() : null,
            item_type: item.item_type && (
              Object.keys(TYPE_KEYWORDS).includes(item.item_type) ||
              Object.keys(PEVC_TYPE_KEYWORDS).includes(item.item_type)
            )
              ? item.item_type
              : classifyItemType(item.title, item.summary || '', source.category),
            category: source.category || inferredCategory || 'regulatory',
            subcategory,
          };
        });
    } catch (err) {
      console.error(`[radar-fetcher] Claude web search failed for ${source.display_name}:`, err);
      return [];
    }
  }

  // ── Insert items with dedup ──────────────────────────────────

  async function insertItems(sourceId: string, items: RawItem[]): Promise<number> {
    let inserted = 0;
    for (const item of items) {
      const id = `ri_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const result = await db.run(INSERT_ITEM_SQL,
        id,
        sourceId,
        item.external_id,
        item.title,
        item.summary,
        item.url,
        item.item_type,
        item.published_at,
        item.category || 'regulatory',
        item.subcategory || null,
      );
      if (result.changes > 0) inserted++;
    }
    return inserted;
  }

  // ── Score unscored items ─────────────────────────────────────

  async function scoreUnscoredItems(limit = 20): Promise<number> {
    const unscoredItems = await db.all(GET_UNSCORED_SQL, limit) as Array<{
      id: string;
      title: string;
      summary: string | null;
      item_type: string;
      url: string | null;
      category: string;
    }>;

    if (unscoredItems.length === 0) return 0;

    // Read custom PE/VC scoring criteria once (empty string = use built-in default)
    const customCriteriaRow = await db.get(
      "SELECT value FROM radar_settings WHERE key = 'pevc_scoring_criteria'"
    ) as { value: string } | undefined;
    const customPevcCriteria = customCriteriaRow?.value?.trim() || null;

    let scored = 0;
    for (const item of unscoredItems) {
      try {
        const categoryPrompt = (item.category === 'pe-vc' && customPevcCriteria)
          ? customPevcCriteria
          : (CATEGORY_SCORE_PROMPTS[(item.category || 'regulatory') as RadarCategory | 'pe-vc']
              || CATEGORY_SCORE_PROMPTS.regulatory);
        const prompt = `${categoryPrompt}

Title: ${item.title}
Type: ${item.item_type}
Category: ${item.category || 'regulatory'}
Summary: ${item.summary || 'No summary'}

Return ONLY valid JSON (no markdown):
{"relevance_score": <0-1>, "urgency_score": <0-1>, "ai_summary": "<2 sentence summary>", "impact_areas": ["<area1>", "<area2>"]}`;

        const chatResult = await callChat({
          model: await getRoutedUtilityModel(db),
          maxTokens: 512,
          system: 'Score the following radar item. Return only valid JSON, no markdown.',
          messages: [{ role: 'user', content: prompt }],
        });

        const responseText = chatResult.text;

        const result = JSON.parse(responseText) as {
          relevance_score: number;
          urgency_score: number;
          ai_summary: string;
          impact_areas: string[];
        };

        await db.run(`
    UPDATE radar_items
    SET relevance_score = ?, urgency_score = ?, ai_summary = ?, impact_areas = ?, ai_scored = 1
    WHERE id = ?
  `, result.relevance_score,
          result.urgency_score,
          result.ai_summary,
          JSON.stringify(result.impact_areas),
          item.id,);
        scored++;
      } catch (err) {
        console.error(`[radar-fetcher] Scoring failed for item ${item.id}:`, err);
      }
    }

    return scored;
  }

  // ── Scan a single source ─────────────────────────────────────

  async function scanSource(sourceId: string): Promise<SourceScanResult> {
    const source = await db.get('SELECT * FROM radar_sources WHERE id = ?', sourceId) as RadarSource | undefined;

    if (!source) {
      return { sourceId, sourceName: 'Unknown', newItems: 0, error: 'Source not found' };
    }

    try {
      let rawItems: RawItem[];

      if (source.source_type === 'rss') {
        rawItems = await fetchRSSSource(source);
      } else {
        rawItems = await fetchWebSearchSource(source);
      }

      const newItems = await insertItems(source.id, rawItems);
      await db.run(UPDATE_SOURCE_STATUS_SQL,new Date().toISOString(), 'success', source.id);

      return { sourceId: source.id, sourceName: source.display_name, newItems };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await db.run(UPDATE_SOURCE_STATUS_SQL,new Date().toISOString(), `error: ${errorMsg.slice(0, 200)}`, source.id);
      return { sourceId: source.id, sourceName: source.display_name, newItems: 0, error: errorMsg };
    }
  }

  // ── Scan all active sources ──────────────────────────────────

  async function scanAllSources(category?: string): Promise<ScanResult> {
    if (scanInProgress) {
      return {
        sourcesScanned: 0,
        newItemsFound: 0,
        itemsScored: 0,
        errors: [{ sourceId: '', error: 'Scan already in progress' }],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
    }

    scanInProgress = true;
    scanAborted = false;
    currentSource = null;
    sourcesCompleted = 0;
    const startedAt = new Date().toISOString();
    const errors: Array<{ sourceId: string; error: string }> = [];
    let totalNewItems = 0;

    try {
      const activeSources = category
        ? await db.all('SELECT * FROM radar_sources WHERE is_active = 1 AND category = ?', category) as RadarSource[]
        : await db.all('SELECT * FROM radar_sources WHERE is_active = 1') as RadarSource[];

      sourcesTotal = activeSources.length;

      for (const source of activeSources) {
        if (scanAborted) {
          console.log('[radar-fetcher] Scan aborted by user');
          break;
        }

        currentSource = { id: source.id, name: source.display_name };
        const result = await scanSource(source.id);
        totalNewItems += result.newItems;
        if (result.error) {
          errors.push({ sourceId: source.id, error: result.error });
        }
        sourcesCompleted++;
      }

      // Auto-score new items (skip if aborted)
      let itemsScored = 0;
      if (!scanAborted) {
        try {
          currentSource = { id: '__scoring__', name: 'Scoring new items...' };
          itemsScored = await scoreUnscoredItems(30);
        } catch (err) {
          console.error('[radar-fetcher] Auto-scoring error:', err);
        }
      }

      const completedAt = new Date().toISOString();
      lastScanTime = completedAt;
      lastScanResult = {
        sourcesScanned: sourcesCompleted,
        newItemsFound: totalNewItems,
        itemsScored,
        errors,
        startedAt,
        completedAt,
      };

      return lastScanResult;
    } finally {
      scanInProgress = false;
      currentSource = null;
      scanAborted = false;
    }
  }

  function stopScan() {
    if (scanInProgress) {
      scanAborted = true;
      console.log('[radar-fetcher] Scan stop requested');
    }
  }

  // ── Status getters ───────────────────────────────────────────

  function getScanStatus() {
    return {
      scanInProgress,
      lastScanTime,
      lastScanResult,
      currentSource,
      sourcesCompleted,
      sourcesTotal,
    };
  }

  // ── Auto-scan schedule management ──────────────────────────

  async function startAutoScan(intervalHours: number) {
    stopAutoScan();
    autoScanIntervalHours = intervalHours;
    const intervalMs = intervalHours * 3600000;
    autoScanTimer = setInterval(async () => {
      try {
        console.log('[radar-fetcher] Running scheduled auto-scan...');
        const result = await scanAllSources();
        console.log(`[radar-fetcher] Auto-scan complete: ${result.newItemsFound} new items from ${result.sourcesScanned} sources`);
      } catch (error) {
        console.error('[radar-fetcher] Auto-scan error:', error);
      }
    }, intervalMs);
    console.log(`[radar-fetcher] Auto-scan scheduled every ${intervalHours}h`);
  }

  function stopAutoScan() {
    if (autoScanTimer) {
      clearInterval(autoScanTimer);
      autoScanTimer = null;
      console.log('[radar-fetcher] Auto-scan stopped');
    }
    autoScanIntervalHours = 0;
  }

  function getAutoScanConfig() {
    return {
      enabled: autoScanTimer !== null,
      intervalHours: autoScanIntervalHours,
    };
  }

  return { scanAllSources, scanSource, scoreUnscoredItems, getScanStatus, stopScan, startAutoScan, stopAutoScan, getAutoScanConfig };
}

// ── Helpers ──────────────────────────────────────────────────────

function safeJsonParse(value: string | null | undefined, fallback: unknown): unknown {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
