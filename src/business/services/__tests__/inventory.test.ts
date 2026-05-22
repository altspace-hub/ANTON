/**
 * inventory.test.ts — the append-only stock-movement log.
 *
 * The audit flagged inventory.ts as money-adjacent with zero
 * coverage. The property that matters: current stock is ALWAYS the
 * sum of the immutable movement deltas — there is no mutable count
 * to drift. These tests lock that, plus the sale-deduction path and
 * the low-stock flagging.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  setInitialStock, restock, recordWastage, adjustStock, deductSale,
  currentStock, stockLevels, listMovements, listMovementsForItem,
  inventoryRows, lowStockCount, wipeStockMovements,
} from '../inventory';
import { addItem, wipeItems, type CatalogueItem } from '../items';

async function trackedItem(name: string, over: Partial<CatalogueItem> = {}): Promise<CatalogueItem> {
  return addItem({
    name, unitPriceSek: 10, vatRate: 12,
    trackStock: true, ...over,
  });
}

beforeEach(async () => {
  await wipeStockMovements();
  await wipeItems();
});

describe('movement log — stock = Σ deltas', () => {
  it('setInitialStock seeds the opening count', async () => {
    const item = await trackedItem('Coffee beans');
    await setInitialStock(item, 50);
    expect(await currentStock(item.id)).toBe(50);
  });

  it('restock adds, wastage and negative adjustment remove', async () => {
    const item = await trackedItem('Oat milk');
    await setInitialStock(item, 20);
    await restock(item, 30);            // +30 → 50
    await recordWastage(item, 4);       // −4  → 46
    await adjustStock(item, -2);        // −2  → 44 (recount correction)
    await adjustStock(item, 6);         // +6  → 50
    expect(await currentStock(item.id)).toBe(50);
  });

  it('rejects a non-positive restock / wastage and a zero adjustment', async () => {
    const item = await trackedItem('Cups');
    await expect(restock(item, 0)).rejects.toThrow();
    await expect(recordWastage(item, -1)).rejects.toThrow();
    await expect(adjustStock(item, 0)).rejects.toThrow();
  });

  it('keeps a per-item history carrying every movement kind + delta', async () => {
    const item = await trackedItem('Syrup');
    await setInitialStock(item, 10);
    await restock(item, 5);
    const hist = await listMovementsForItem(item.id);
    expect(hist).toHaveLength(2);
    // Assert on content, not sub-millisecond sort order: two movements
    // created in the same test tick share a `createdAt`, so "newest
    // first" is genuinely ambiguous between them. Ordering is a
    // display nicety; currentStock (Σ delta) is order-independent.
    const initial = hist.find((m) => m.kind === 'initial');
    const restocked = hist.find((m) => m.kind === 'restock');
    expect(initial?.delta).toBe(10);
    expect(restocked?.delta).toBe(5);
  });

  it('stockLevels sums every tracked item in one pass', async () => {
    const a = await trackedItem('A');
    const b = await trackedItem('B');
    await setInitialStock(a, 7);
    await setInitialStock(b, 3);
    await restock(a, 1);
    const levels = await stockLevels();
    expect(levels.get(a.id)).toBe(8);
    expect(levels.get(b.id)).toBe(3);
  });
});

describe('deductSale — sale flow integration', () => {
  it('deducts only tracked items, by line quantity, tagged with the kvitto', async () => {
    const tracked = await trackedItem('Espresso', { unitPriceSek: 30 });
    const untracked = await addItem({
      name: 'Consultation', unitPriceSek: 500, vatRate: 25, trackStock: false,
    });
    await setInitialStock(tracked, 100);

    const written = await deductSale([
      { itemId: tracked.id,   name: 'Espresso',     unitPriceSek: 30, vatRate: 12, quantity: 3 },
      { itemId: untracked.id, name: 'Consultation', unitPriceSek: 500, vatRate: 25, quantity: 1 },
    ], 4242);

    expect(written).toHaveLength(1);             // only the tracked line
    expect(written[0]!.kind).toBe('sale');
    expect(written[0]!.delta).toBe(-3);
    expect(written[0]!.kvittoNumber).toBe(4242);
    expect(await currentStock(tracked.id)).toBe(97);
    expect(await currentStock(untracked.id)).toBe(0); // never tracked
  });

  it('a sale of an item no longer in the catalogue is skipped, not fatal', async () => {
    const written = await deductSale(
      [{ itemId: 'ghost', name: 'Gone', unitPriceSek: 1, vatRate: 12, quantity: 1 }],
      7,
    );
    expect(written).toHaveLength(0);
  });
});

describe('low-stock flagging', () => {
  it('flags items at or below their threshold and floats them first', async () => {
    const low = await trackedItem('Low', { lowStockThreshold: 5 });
    const ok  = await trackedItem('Plenty', { lowStockThreshold: 5 });
    await setInitialStock(low, 5);   // == threshold → low
    await setInitialStock(ok, 40);

    const rows = await inventoryRows();
    expect(rows).toHaveLength(2);
    expect(rows[0]!.item.id).toBe(low.id);  // low stock sorts first
    expect(rows[0]!.isLow).toBe(true);
    expect(rows[1]!.isLow).toBe(false);
    expect(await lowStockCount()).toBe(1);
  });

  it('excludes untracked items from the inventory view entirely', async () => {
    await addItem({ name: 'Service', unitPriceSek: 100, vatRate: 25, trackStock: false });
    expect(await inventoryRows()).toHaveLength(0);
  });
});

describe('append-only — the log is never rewritten', () => {
  it('every mutation adds a row; nothing updates in place', async () => {
    const item = await trackedItem('Beans');
    await setInitialStock(item, 10);
    await restock(item, 5);
    await recordWastage(item, 2);
    const all = await listMovements();
    expect(all).toHaveLength(3); // initial + restock + wastage, all distinct rows
    expect(new Set(all.map((m) => m.id)).size).toBe(3); // unique ids
  });
});
