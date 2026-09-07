import { describe, it, expect } from 'vitest';
import {
  planExtractionBatches,
  EXTRACTION_BATCH_CHAR_BUDGET,
  EXTRACTION_BATCH_MAX_ITEMS,
} from '../../../server/services/market-atom-service.js';

/**
 * 2026-08-23: the markets backlog drained at one model call per raw row —
 * 200 rows a weekday against roughly 450 arriving. It never caught up, and
 * the 500-item gate in the schedule then switched news fetching off entirely:
 * the newest news item was 27 hours old with 1,376 rows queued and nothing
 * being fetched, because the gate was doing its job against a drain that
 * could not keep pace.
 *
 * The items are small — news has a 602-character median — so a dozen of them
 * cost less prompt than the 8,000-character budget a single call already
 * allowed. These tests pin the grouping rules that make that safe: batches
 * never mix data types, never exceed either budget, and never drop or
 * reorder an item.
 */

interface Item { id: string; text: string; dataType: string }

const news = (id: string, len = 600): Item => ({ id, text: 'n'.repeat(len), dataType: 'news' });
const ratios = (id: string, len = 13_000): Item => ({ id, text: 'r'.repeat(len), dataType: 'ratios' });

/** Every input item appears exactly once, in its original order. */
function flatIds(batches: Item[][]): string[] {
  return batches.flat().map((i) => i.id);
}

describe('planExtractionBatches', () => {
  it('groups small same-type items up to the item ceiling', () => {
    const items = Array.from({ length: 30 }, (_, i) => news(`n${i}`));
    const batches = planExtractionBatches(items);

    // 600 chars x 12 = 7,200, under the 12,000 budget, so the ITEM cap binds.
    expect(batches[0]).toHaveLength(EXTRACTION_BATCH_MAX_ITEMS);
    expect(batches.every((b) => b.length <= EXTRACTION_BATCH_MAX_ITEMS)).toBe(true);
    expect(flatIds(batches)).toEqual(items.map((i) => i.id));

    // The whole point: far fewer calls than items.
    expect(batches.length).toBe(3);
    expect(batches.length).toBeLessThan(items.length / 5);
  });

  it('lets the character budget bind before the item ceiling on bulky rows', () => {
    const items = [ratios('r0'), ratios('r1'), ratios('r2')];
    const batches = planExtractionBatches(items);

    // 13,000 chars is clamped to the 8,000 per-item ceiling, so two fit in
    // 12,000 only if the budget is ignored — it is not.
    expect(batches).toHaveLength(3);
    expect(batches.every((b) => b.length === 1)).toBe(true);
    expect(flatIds(batches)).toEqual(['r0', 'r1', 'r2']);
  });

  it('never mixes data types in one batch', () => {
    const items = [news('a'), news('b'), ratios('c'), news('d')];
    const batches = planExtractionBatches(items);

    for (const b of batches) {
      expect(new Set(b.map((i) => i.dataType)).size).toBe(1);
    }
    // Order is preserved, so processBacklog's oldest-first drain stays so.
    expect(flatIds(batches)).toEqual(['a', 'b', 'c', 'd']);
    expect(batches.map((b) => b.map((i) => i.id))).toEqual([['a', 'b'], ['c'], ['d']]);
  });

  it('keeps an over-budget item rather than dropping it', () => {
    const huge = { id: 'huge', text: 'x'.repeat(EXTRACTION_BATCH_CHAR_BUDGET * 4), dataType: 'news' };

    // At the default budget a huge item is NOT over budget: its prompt cost is
    // clamped to the 8,000-char per-item ceiling, which leaves room beside it.
    expect(flatIds(planExtractionBatches([huge, news('small')]))).toEqual(['huge', 'small']);
    expect(planExtractionBatches([huge, news('small')])).toHaveLength(1);

    // Genuinely over budget — clamped 8,000 against a 5,000 budget — it takes
    // a batch of its own and the next item still follows.
    const tight = planExtractionBatches([huge, news('small')], 5_000);
    expect(tight.map((b) => b.map((i) => i.id))).toEqual([['huge'], ['small']]);
  });

  it('returns no batches for no items', () => {
    expect(planExtractionBatches([])).toEqual([]);
  });

  it('respects explicitly passed budgets', () => {
    const items = Array.from({ length: 10 }, (_, i) => news(`n${i}`, 100));
    expect(planExtractionBatches(items, 10_000, 3).map((b) => b.length)).toEqual([3, 3, 3, 1]);
    // Character budget of 250 fits two 100-char items, not three.
    expect(planExtractionBatches(items, 250, 99).every((b) => b.length <= 2)).toBe(true);
  });
});
