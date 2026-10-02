import type { DatabaseAdapter } from '../db/database.js';

import Parser from 'rss-parser';
import { createHash } from 'node:crypto';
import { getRoutedUtilityModel } from './utility-model.js';
import { callChat } from './provider-router.js';
import { modelCanWebSearch, webSearchTool } from './routed-web-search.js';
import { fetchUrl } from './url-fetcher.js';
import { extractJsonReply, isJsonObject, hasArrayField } from './coding-workspace.js';
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

/**
 * `_legacyClient` is the Anthropic client index.ts still passes; it is no
 * longer used — the web-search strategy runs through the provider router on
 * the routed utility model. Kept positional so the boot wiring compiles
 * unchanged.
 */
export async function createRadarFetcher(db: DatabaseAdapter, _legacyClient?: unknown) {
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

    // Utility tier, through the router. Only a model that can really search
    // (Anthropic API with a key, or the Claude subscription engine) may run a
    // web search: any other provider would drop the tool and invent "recent
    // publications" from memory. Without one (an OpenRouter-only server) the
    // source's own page is read instead, and only what is on it is kept.
    const model = await getRoutedUtilityModel(db);
    if (!modelCanWebSearch(model)) {
      return fetchPageSource(source, model, itemTypeOptions);
    }

    try {
      const message = await callChat({
        model,
        system: 'You monitor publications for a regulatory and market radar. Use the web_search tool, then answer with a JSON array only.',
        maxTokens: 4096,
        tools: [webSearchTool(5)],
        background: true,
        db,
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

      const responseText = message.text;

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
      console.error(`[radar-fetcher] purpose=radar-web-search failed for source ${source.id}:`, err instanceof Error ? err.message : err);
      return [];
    }
  }

  // ── Page-read strategy (no model that can search) ────────────

  /**
   * Reads the source's page (fetchUrl: the SSRF guard on every hop, a 15 s
   * timeout, a 2 MB cap) and asks the model, with no tools, which publications
   * the text lists. The model only points: an item is kept when its title is in
   * the page text (groundPageItems), its summary is the page's own words after
   * the title, its link is the page, and a date only when the text it copied is
   * on the page. A page that cannot be read is an error on the source.
   */
  async function fetchPageSource(source: RadarSource, model: string, itemTypeOptions: string): Promise<RawItem[]> {
    const page = await fetchUrl(source.url);
    if (page.error || !page.text.trim()) {
      throw new Error(`Could not read the source page (${page.error ?? 'no text'}); there is no model here that can search the web instead`);
    }
    const pageUrl = page.finalUrl ?? source.url;
    const text = page.text.slice(0, PAGE_TEXT_MAX_CHARS);

    const message = await callChat({
      model,
      system: 'You list the publications a web page shows. You use only the page text you are given. Answer with one JSON object only.',
      maxTokens: 2048,
      jsonMode: true,
      background: true,
      purpose: 'radar-page-read',
      db,
      messages: [{
        role: 'user',
        content: `Below is the text of the page "${source.display_name}" (${pageUrl}), read just now.

List the publications, news items or documents this page shows, newest first, at most ${PAGE_ITEMS_MAX}. For each give:
- "title": the title copied exactly as it appears in the text
- "date_text": the item's date copied exactly as the text writes it, or null
- "item_type": one of ${itemTypeOptions}

Use only the text below. Do not add anything that is not in it.
Answer with {"items": [...]}, or {"items": []} when the page lists none.

--- PAGE TEXT ---
${text}
--- END OF PAGE TEXT ---`,
      }],
    });

    const reply = extractJsonReply(message.text, (v) => Array.isArray(v) || hasArrayField('items')(v));
    const list: unknown[] = !reply ? []
      : Array.isArray(reply.value) ? reply.value
      : hasArrayField('items')(reply.value) ? (reply.value as { items: unknown[] }).items
      : [];
    if (!reply) console.error(`[radar-fetcher] purpose=radar-page-read: no items JSON in the reply for source ${source.id}`);

    return groundPageItems(page.text, list, pageUrl).map((item) => {
      const { subcategory, inferredCategory } = classifySubcategory(item.title, item.summary);
      const proposed = item.itemType;
      return {
        external_id: `page:${createHash('sha256').update(item.title.toLowerCase()).digest('hex').slice(0, 40)}`,
        title: item.title,
        summary: item.summary,
        url: item.url,
        published_at: item.publishedAt,
        item_type: proposed && (Object.keys(TYPE_KEYWORDS).includes(proposed) || Object.keys(PEVC_TYPE_KEYWORDS).includes(proposed))
          ? proposed
          : classifyItemType(item.title, item.summary, source.category),
        category: source.category || inferredCategory || 'regulatory',
        subcategory,
      };
    });
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
          jsonMode: true,
          background: true,
          purpose: 'radar-score',
          db,
        });

        // A fenced or prose-wrapped reply used to throw here, leaving the item
        // unscored at 0.5, and re-scored (and re-billed) on every scan.
        const result = parseRadarScore(chatResult.text);
        if (!result) {
          console.error(`[radar-fetcher] purpose=radar-score: no score in the reply for item ${item.id}`);
          continue;
        }

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

  /** Returns false, and schedules nothing, while automation is disabled. */
  function startAutoScan(intervalHours: number): boolean {
    stopAutoScan();
    if (isRadarAutomationDisabled()) {
      console.log('[radar-fetcher] Auto-scan not scheduled: radar automation is disabled (RADAR_AUTOMATION_DISABLED or DEMO_MODE)');
      return false;
    }
    const hours = clampAutoScanIntervalHours(intervalHours);
    autoScanIntervalHours = hours;
    const intervalMs = hours * 3600000;
    autoScanTimer = setInterval(async () => {
      if (isRadarAutomationDisabled()) return;
      try {
        console.log('[radar-fetcher] Running scheduled auto-scan...');
        const result = await scanAllSources();
        console.log(`[radar-fetcher] Auto-scan complete: ${result.newItemsFound} new items from ${result.sourcesScanned} sources`);
      } catch (error) {
        console.error('[radar-fetcher] Auto-scan error:', error);
      }
    }, intervalMs);
    console.log(`[radar-fetcher] Auto-scan scheduled every ${hours}h`);
    return true;
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

// ── Schedule guards ──────────────────────────────────────────────

/** Scheduled scans call the model for every new item, unattended: never more
 *  often than hourly. */
export const MIN_AUTO_SCAN_INTERVAL_HOURS = 1;
/** setInterval's ceiling is about 24.8 days; above it Node fires every 1 ms. */
export const MAX_AUTO_SCAN_INTERVAL_HOURS = 24 * 24;
const DEFAULT_AUTO_SCAN_INTERVAL_HOURS = 24;

/**
 * True when no scheduled radar scan may run: RADAR_AUTOMATION_DISABLED=true,
 * or DEMO_MODE=true (a public demo never spends on background scans). Read at
 * call time, so a scan scheduled at runtime (PUT /api/radar/settings) obeys it
 * as well as the one started at boot. Manual scans are not affected.
 */
export function isRadarAutomationDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const on = (v: string | undefined) => String(v ?? '').trim().toLowerCase() === 'true';
  return on(env.RADAR_AUTOMATION_DISABLED) || on(env.DEMO_MODE);
}

/** The interval a timer may actually use: a number inside the bounds, else the default. */
export function clampAutoScanIntervalHours(hours: number): number {
  if (!Number.isFinite(hours)) return DEFAULT_AUTO_SCAN_INTERVAL_HOURS;
  return Math.min(MAX_AUTO_SCAN_INTERVAL_HOURS, Math.max(MIN_AUTO_SCAN_INTERVAL_HOURS, hours));
}

/**
 * Whether a cron expression fires at most once an hour: its minute field (and
 * seconds field, when node-cron's six-field form is used) must be one fixed
 * number. `* * * * *` would scan every minute.
 */
export function radarCronIsAtMostHourly(expr: string): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5 && fields.length !== 6) return false;
  const fixed = fields.length === 6 ? fields.slice(0, 2) : fields.slice(0, 1);
  return fixed.every((f) => /^\d{1,2}$/.test(f));
}

// ── Page reading and scoring helpers ─────────────────────────────

/** Page text sent to the model at most (a listing page's items come first). */
export const PAGE_TEXT_MAX_CHARS = 30_000;
/** Items one page read keeps at most. */
export const PAGE_ITEMS_MAX = 20;
/** Characters of page text after a title kept as the item's summary. */
const PAGE_SUMMARY_CHARS = 400;

export interface GroundedPageItem {
  title: string;
  summary: string;
  url: string;
  publishedAt: string | null;
  itemType: string | null;
}

/** Whitespace collapsed and typographic quotes made plain, so a copied title matches the page. */
function flatten(s: string): string {
  return s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\s+/g, ' ').trim();
}

/**
 * The items of a page-read reply that are really on the page. A title must
 * appear in the page text (case and whitespace aside) and be at least 8
 * characters, or the item is dropped: the model points, it does not write. The
 * summary is the page's own text after the title; the link is the page; a date
 * counts only when the text the model copied for it is on the page and reads
 * as a date. Repeats are dropped; at most PAGE_ITEMS_MAX are kept.
 */
export function groundPageItems(pageText: string, reply: unknown[], pageUrl: string): GroundedPageItem[] {
  const flat = flatten(pageText);
  const lower = flat.toLowerCase();
  const seen = new Set<string>();
  const out: GroundedPageItem[] = [];
  for (const entry of reply) {
    if (out.length >= PAGE_ITEMS_MAX) break;
    if (!isJsonObject(entry) || typeof entry.title !== 'string') continue;
    const asked = flatten(entry.title).slice(0, 500);
    const key = asked.toLowerCase();
    if (asked.length < 8 || seen.has(key)) continue;
    const at = lower.indexOf(key);
    if (at < 0) continue;
    seen.add(key);

    // The page's own spelling and the words after it. Lower-casing can change
    // a string's length (rare letters); then the positions do not line up and
    // the model's spelling stands, with no summary.
    const aligned = lower.length === flat.length;
    const title = aligned ? flat.slice(at, at + asked.length) : asked;
    let summary = aligned ? flat.slice(at + title.length, at + title.length + PAGE_SUMMARY_CHARS).trim() : '';
    if (aligned && flat.length > at + title.length + PAGE_SUMMARY_CHARS) {
      const cut = summary.lastIndexOf(' ');
      summary = `${cut > 0 ? summary.slice(0, cut) : summary}…`;
    }

    let publishedAt: string | null = null;
    if (typeof entry.date_text === 'string') {
      const dateText = flatten(entry.date_text);
      const when = new Date(dateText);
      if (dateText.length >= 6 && lower.includes(dateText.toLowerCase()) && Number.isFinite(when.getTime())) {
        publishedAt = when.toISOString();
      }
    }

    out.push({
      title,
      summary,
      url: pageUrl,
      publishedAt,
      itemType: typeof entry.item_type === 'string' ? entry.item_type : null,
    });
  }
  return out;
}

export interface RadarScore {
  relevance_score: number;
  urgency_score: number;
  ai_summary: string;
  impact_areas: string[];
}

/** A 0-1 score from a model value: a number or numeric string; 0-100 read as a percentage; null otherwise. */
function unitScore(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  const scaled = n > 1 && n <= 100 ? n / 100 : n;
  return Math.min(1, Math.max(0, scaled));
}

/**
 * The score in a model reply, or null when it carries none. Read tolerantly
 * (a fence, prose or reasoning around the object: GLM on OpenRouter adds
 * them), with the scores clamped to 0-1 and the text fields cut to size.
 */
export function parseRadarScore(text: string): RadarScore | null {
  const reply = extractJsonReply(text ?? '', (v) => isJsonObject(v) && 'relevance_score' in v);
  if (!reply || !isJsonObject(reply.value)) return null;
  const v = reply.value;
  const relevance = unitScore(v.relevance_score);
  if (relevance === null) return null;
  return {
    relevance_score: relevance,
    urgency_score: unitScore(v.urgency_score) ?? 0.5,
    ai_summary: typeof v.ai_summary === 'string' ? v.ai_summary.trim().slice(0, 1000) : '',
    impact_areas: Array.isArray(v.impact_areas)
      ? v.impact_areas.filter((a): a is string => typeof a === 'string').map((a) => a.slice(0, 100)).slice(0, 10)
      : [],
  };
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
