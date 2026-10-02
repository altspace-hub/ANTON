/**
 * radar-page-read.test.ts — the radar on a server with no model that can
 * search the web (the OpenRouter-only showcase, 2026-10-02).
 *
 * Before: every source that is not RSS (ESMA, FATF, AMLA, SEC EDGAR, …) threw
 * "Web-search sources need a Claude model" on such a server, and the scoring
 * after a scan did JSON.parse on the raw reply, so a fenced or prose-wrapped
 * GLM answer left the item unscored at 0.5 — and re-scored, and re-billed, on
 * every scan.
 *
 * Now such a source's own page is read (fetchUrl) and the model, with no
 * tools, only points at the publications the page lists: an item is kept when
 * its title is in the page text, its summary is the page's words after the
 * title, its link is the page, and a date only when the text the model copied
 * is on the page. An invented title is dropped. Scores are read tolerantly
 * and clamped to 0-1.
 *
 * Negative controls: with a model that can search, the web-search path runs
 * (tools sent, no page read); a page that cannot be read is an error on the
 * source and no model call is made.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

const chat = vi.hoisted(() => ({ callChat: vi.fn() }));
vi.mock('../../server/services/provider-router.js', () => ({
  callChat: chat.callChat,
  mapModelToProvider: (m: string) => m,
}));
vi.mock('../../server/services/utility-model.js', () => ({
  getRoutedUtilityModel: async () => 'compat:openrouter:z-ai/glm-5.3',
}));
const search = vi.hoisted(() => ({ canSearch: false }));
vi.mock('../../server/services/routed-web-search.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../server/services/routed-web-search.js')>()),
  modelCanWebSearch: () => search.canSearch,
}));
const page = vi.hoisted(() => ({ fetchUrl: vi.fn() }));
vi.mock('../../server/services/url-fetcher.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../server/services/url-fetcher.js')>()),
  fetchUrl: page.fetchUrl,
}));

import {
  createRadarFetcher,
  groundPageItems,
  parseRadarScore,
  PAGE_ITEMS_MAX,
} from '../../server/services/radar-fetcher.js';

const PAGE_URL = 'https://www.esma.europa.eu/press-news/esma-news';
const PAGE_TEXT = `ESMA news

Final Report on Guidelines on MiCA reverse solicitation
Published 12 September 2026. ESMA publishes its final report on the guidelines under MiCA Article 61.

ESMA   consults on   amendments to the   MiFIR transparency regime
Published 3 September 2026. The consultation runs until 30 November.

Speech by the Chair at the  Eurofi forum
`;

const SOURCE = {
  id: 'src_esma', display_name: 'ESMA', url: PAGE_URL, source_type: 'web_page',
  fetch_interval_hours: 24, last_fetched: null, last_fetch_status: null,
  areas: '[]', keywords: '["MiCA"]', is_active: 1, category: 'regulatory',
};

interface Fake { db: DatabaseAdapter; inserted: unknown[][]; statuses: string[]; updates: unknown[][] }

function fakeDb(unscored: unknown[] = []): Fake {
  const inserted: unknown[][] = [];
  const statuses: string[] = [];
  const updates: unknown[][] = [];
  const db = {
    dialect: 'postgresql',
    async get(sql: string) {
      if (sql.includes('FROM radar_sources')) return SOURCE;
      return undefined;
    },
    async all(sql: string) {
      if (sql.includes('ai_scored = 0')) return unscored;
      return [];
    },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (sql.includes('INSERT INTO radar_items')) inserted.push(params);
      if (sql.includes('UPDATE radar_sources')) statuses.push(String(params[1]));
      if (sql.includes('UPDATE radar_items')) updates.push(params);
      return { changes: 1, lastInsertRowid: 0 };
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db as unknown as DatabaseAdapter); },
    async close() { /* noop */ },
  };
  return { db: db as unknown as DatabaseAdapter, inserted, statuses, updates };
}

beforeEach(() => {
  vi.clearAllMocks();
  search.canSearch = false;
  page.fetchUrl.mockResolvedValue({ url: PAGE_URL, finalUrl: PAGE_URL, text: PAGE_TEXT, wordCount: 60, tokenEstimate: 80 });
});

// ── groundPageItems ──────────────────────────────────────────────────────────

describe('groundPageItems: the model points, the page decides', () => {
  it('keeps a title that is on the page, in the page\'s spelling, with the page\'s words as summary', () => {
    const [item] = groundPageItems(PAGE_TEXT, [
      { title: 'final report on guidelines on MiCA reverse solicitation', date_text: '12 September 2026', item_type: 'guideline' },
    ], PAGE_URL);
    expect(item.title).toBe('Final Report on Guidelines on MiCA reverse solicitation');
    expect(item.summary).toMatch(/^Published 12 September 2026\. ESMA publishes its final report/);
    expect(item.url).toBe(PAGE_URL);
    expect(item.publishedAt).toBe(new Date('12 September 2026').toISOString());
    expect(item.itemType).toBe('guideline');
  });

  it('matches across the page\'s runs of spaces and typographic quotes', () => {
    const items = groundPageItems(PAGE_TEXT, [{ title: 'ESMA consults on amendments to the MiFIR transparency regime' }], PAGE_URL);
    expect(items.map((i) => i.title)).toEqual(['ESMA consults on amendments to the MiFIR transparency regime']);
    const quoted = groundPageItems('The “MiCA white paper” template is out', [{ title: 'The "MiCA white paper" template' }], PAGE_URL);
    expect(quoted).toHaveLength(1);
  });

  it('drops an invented title, a too-short one, a repeat and a non-object', () => {
    const items = groundPageItems(PAGE_TEXT, [
      { title: 'ESMA fines Binance EUR 2 billion' },
      { title: 'ESMA' },
      { title: 'Speech by the Chair at the Eurofi forum' },
      { title: 'speech by the chair at the eurofi forum' },
      'Final Report on Guidelines on MiCA reverse solicitation',
      { title: 42 },
    ], PAGE_URL);
    expect(items.map((i) => i.title)).toEqual(['Speech by the Chair at the Eurofi forum']);
  });

  it('keeps a date only when the copied text is on the page and reads as a date', () => {
    const [notOnPage, unreadable] = groundPageItems(PAGE_TEXT, [
      { title: 'Final Report on Guidelines on MiCA reverse solicitation', date_text: '1 October 2026' },
      { title: 'Speech by the Chair at the Eurofi forum', date_text: 'Published' },
    ], PAGE_URL);
    expect(notOnPage.publishedAt).toBeNull();
    expect(unreadable.publishedAt).toBeNull();
  });

  it(`keeps at most ${PAGE_ITEMS_MAX} items`, () => {
    const text = Array.from({ length: 40 }, (_, i) => `Publication number ${i} of the year`).join('\n');
    const reply = Array.from({ length: 40 }, (_, i) => ({ title: `Publication number ${i} of the year` }));
    expect(groundPageItems(text, reply, PAGE_URL)).toHaveLength(PAGE_ITEMS_MAX);
  });
});

// ── parseRadarScore ──────────────────────────────────────────────────────────

describe('parseRadarScore: GLM\'s replies, read tolerantly', () => {
  it('reads a bare object, a fenced one, and one inside prose or reasoning', () => {
    const json = '{"relevance_score": 0.8, "urgency_score": 0.3, "ai_summary": "A guideline.", "impact_areas": ["AML"]}';
    for (const text of [json, `\`\`\`json\n${json}\n\`\`\``, `Sure. Here it is: ${json} Hope that helps.`, `<think>weighing it</think>\n${json}`]) {
      expect(parseRadarScore(text), text).toEqual({ relevance_score: 0.8, urgency_score: 0.3, ai_summary: 'A guideline.', impact_areas: ['AML'] });
    }
  });

  it('clamps to 0-1, reads numeric strings and a 0-100 scale', () => {
    expect(parseRadarScore('{"relevance_score": "85", "urgency_score": 7}')).toMatchObject({ relevance_score: 0.85, urgency_score: 0.07 });
    expect(parseRadarScore('{"relevance_score": -2, "urgency_score": 400}')).toMatchObject({ relevance_score: 0, urgency_score: 1 });
  });

  it('gives null when there is no relevance score', () => {
    expect(parseRadarScore('I cannot score this item.')).toBeNull();
    expect(parseRadarScore('{"urgency_score": 0.2}')).toBeNull();
    expect(parseRadarScore('{"relevance_score": "high"}')).toBeNull();
  });
});

// ── scanSource ───────────────────────────────────────────────────────────────

describe('scanning a web source with no model that can search', () => {
  it('reads the page and stores only the items on it', async () => {
    chat.callChat.mockResolvedValueOnce({
      text: '```json\n{"items": [' +
        '{"title": "Final Report on Guidelines on MiCA reverse solicitation", "date_text": "12 September 2026", "item_type": "guideline"},' +
        '{"title": "ESMA consults on amendments to the MiFIR transparency regime", "date_text": "3 September 2026", "item_type": "consultation"},' +
        '{"title": "ESMA publishes register of 400 new CASPs", "date_text": "1 October 2026", "item_type": "publication"}' +
        ']}\n```',
      inputTokens: 10, outputTokens: 10,
    });
    const fake = fakeDb();
    const fetcher = await createRadarFetcher(fake.db);
    const result = await fetcher.scanSource('src_esma');

    expect(page.fetchUrl).toHaveBeenCalledWith(PAGE_URL);
    const call = chat.callChat.mock.calls[0][0] as { tools?: unknown; jsonMode?: boolean; purpose?: string; messages: Array<{ content: string }> };
    expect(call.tools).toBeUndefined();
    expect(call.jsonMode).toBe(true);
    expect(call.purpose).toBe('radar-page-read');
    expect(call.messages[0].content).toContain('Final Report on Guidelines');

    expect(result).toEqual({ sourceId: 'src_esma', sourceName: 'ESMA', newItems: 2 });
    // INSERT params: id, source_id, external_id, title, summary, url, item_type, published_at, category, subcategory
    const titles = fake.inserted.map((p) => p[3]);
    expect(titles).toEqual([
      'Final Report on Guidelines on MiCA reverse solicitation',
      'ESMA consults on amendments to the MiFIR transparency regime',
    ]);
    for (const p of fake.inserted) {
      expect(p[2]).toMatch(/^page:[0-9a-f]{40}$/);
      expect(p[5]).toBe(PAGE_URL);
    }
    expect(fake.inserted.map((p) => p[6])).toEqual(['guideline', 'consultation']);
    expect(fake.statuses).toEqual(['success']);
  });

  it('a page that cannot be read is an error on the source, with no model call', async () => {
    page.fetchUrl.mockResolvedValueOnce({ url: PAGE_URL, text: '', wordCount: 0, tokenEstimate: 0, error: 'HTTP 403 Forbidden' });
    const fake = fakeDb();
    const fetcher = await createRadarFetcher(fake.db);
    const result = await fetcher.scanSource('src_esma');
    expect(result.error).toMatch(/Could not read the source page \(HTTP 403 Forbidden\)/);
    expect(chat.callChat).not.toHaveBeenCalled();
    expect(fake.inserted).toHaveLength(0);
    expect(fake.statuses[0]).toMatch(/^error: Could not read the source page/);
  });

  it('negative control: with a model that can search, the web search runs and no page is read', async () => {
    search.canSearch = true;
    chat.callChat.mockResolvedValueOnce({ text: '[]', inputTokens: 1, outputTokens: 1 });
    const fake = fakeDb();
    const fetcher = await createRadarFetcher(fake.db);
    await fetcher.scanSource('src_esma');
    expect(page.fetchUrl).not.toHaveBeenCalled();
    const call = chat.callChat.mock.calls[0][0] as { tools?: Array<{ name?: string }> };
    expect(call.tools?.[0]?.name).toBe('web_search');
  });
});

describe('scoring after a scan reads a fenced reply', () => {
  it('scores the item instead of leaving it for the next scan', async () => {
    chat.callChat.mockResolvedValueOnce({
      text: 'Score:\n```json\n{"relevance_score": 0.9, "urgency_score": 0.6, "ai_summary": "Relevant.", "impact_areas": ["MiCA"]}\n```',
      inputTokens: 1, outputTokens: 1,
    });
    const fake = fakeDb([{ id: 'ri_1', title: 't', summary: 's', item_type: 'guideline', url: null, category: 'regulatory' }]);
    const fetcher = await createRadarFetcher(fake.db);
    expect(await fetcher.scoreUnscoredItems(5)).toBe(1);
    expect(fake.updates[0]).toEqual([0.9, 0.6, 'Relevant.', '["MiCA"]', 'ri_1']);
    const call = chat.callChat.mock.calls[0][0] as { jsonMode?: boolean; purpose?: string; background?: boolean };
    expect(call).toMatchObject({ jsonMode: true, purpose: 'radar-score', background: true });
  });

  it('an unreadable reply leaves the item unscored (and does not throw)', async () => {
    chat.callChat.mockResolvedValueOnce({ text: 'No idea.', inputTokens: 1, outputTokens: 1 });
    const fake = fakeDb([{ id: 'ri_1', title: 't', summary: 's', item_type: 'guideline', url: null, category: 'regulatory' }]);
    const fetcher = await createRadarFetcher(fake.db);
    expect(await fetcher.scoreUnscoredItems(5)).toBe(0);
    expect(fake.updates).toHaveLength(0);
  });
});
