/**
 * inventory.ts — stock tracking via an append-only movement log.
 *
 * Design (the user-chosen "full movement log" model):
 *   • The `stock_movements` IndexedDB store is append-only. Every
 *     change — initial count, sale deduction, restock, manual
 *     adjustment, wastage — is one immutable row with a timestamp and
 *     an optional note.
 *   • Current stock for an item = the sum of every movement's `delta`.
 *     There is no mutable "stockQty" field anywhere; the log IS the
 *     stock. This mirrors the receipts/Z-report audit philosophy —
 *     nothing is silently overwritten, drift is always explained.
 *   • Only items with `trackStock = true` are tracked. Service items
 *     (a haircut) never get movements.
 *
 * `delta` sign convention: positive adds stock (restock, initial,
 * positive adjustment), negative removes it (sale, wastage, negative
 * adjustment). A sale of 3 units writes delta = -3.
 */
import {
  openDb, STORE_STOCK_MOVEMENTS, INDEX_STOCK_BY_ITEM, INDEX_STOCK_BY_CREATED,
} from './db';
import { loadItems, type CatalogueItem } from './items';
import type { CartLine } from './cart';

export type MovementKind =
  | 'initial'      // first count when the merchant turns tracking on
  | 'sale'         // automatic deduction when a kvitto is issued
  | 'restock'      // merchant received new stock
  | 'adjustment'   // manual correction (recount, found/lost)
  | 'wastage';     // breakage, spoilage, theft write-off

export interface StockMovement {
  /** Generated unique id (the IDB keyPath). */
  id: string;
  /** CatalogueItem.id this movement applies to. */
  itemId: string;
  /** Item name snapshotted at movement time — so the log stays
   *  readable even if the item is later renamed or deleted. */
  itemName: string;
  kind: MovementKind;
  /** Signed change. + adds stock, − removes it. */
  delta: number;
  /** Optional free-text note (e.g. "Recount after stocktake",
   *  "Dropped a tray"). Sale movements set the kvitto reference. */
  note?: string;
  /** For kind='sale', the kvitto number that caused the deduction. */
  kvittoNumber?: number;
  createdAt: number;
}

const DEFAULT_LOW_STOCK = 5;

function genId(): string {
  const b = new Uint8Array(8);
  globalThis.crypto.getRandomValues(b);
  let hex = '';
  for (const x of b) hex += x.toString(16).padStart(2, '0');
  return hex;
}

/** Append one movement. The store is never updated or deleted from. */
async function append(m: Omit<StockMovement, 'id' | 'createdAt'>): Promise<StockMovement> {
  const row: StockMovement = { ...m, id: genId(), createdAt: Date.now() };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_STOCK_MOVEMENTS, 'readwrite');
    tx.objectStore(STORE_STOCK_MOVEMENTS).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return row;
}

/** Every movement, newest-first. */
export async function listMovements(limit = 1000): Promise<StockMovement[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_STOCK_MOVEMENTS, 'readonly');
    const req = tx.objectStore(STORE_STOCK_MOVEMENTS)
      .index(INDEX_STOCK_BY_CREATED).openCursor(null, 'prev');
    const out: StockMovement[] = [];
    req.onsuccess = () => {
      const cur = req.result;
      if (cur && out.length < limit) { out.push(cur.value as StockMovement); cur.continue(); }
      else resolve(out);
    };
    req.onerror = () => reject(req.error);
  });
}

/** Movement history for a single item, newest-first. */
export async function listMovementsForItem(itemId: string): Promise<StockMovement[]> {
  const db = await openDb();
  const rows = await new Promise<StockMovement[]>((resolve, reject) => {
    const tx = db.transaction(STORE_STOCK_MOVEMENTS, 'readonly');
    const req = tx.objectStore(STORE_STOCK_MOVEMENTS)
      .index(INDEX_STOCK_BY_ITEM).getAll(itemId);
    req.onsuccess = () => resolve(req.result as StockMovement[]);
    req.onerror = () => reject(req.error);
  });
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

/** Current stock for one item — the sum of its movement deltas. */
export async function currentStock(itemId: string): Promise<number> {
  const rows = await listMovementsForItem(itemId);
  return rows.reduce((n, m) => n + m.delta, 0);
}

/** Current stock for every tracked item, as a map keyed by itemId.
 *  One pass over the whole movement log — cheaper than N per-item
 *  queries when rendering the inventory list. */
export async function stockLevels(): Promise<Map<string, number>> {
  const all = await listMovements(100_000);
  const m = new Map<string, number>();
  for (const mv of all) m.set(mv.itemId, (m.get(mv.itemId) ?? 0) + mv.delta);
  return m;
}

export interface InventoryRow {
  item: CatalogueItem;
  stock: number;
  lowStockThreshold: number;
  isLow: boolean;
}

/** Join the catalogue's tracked items against their stock levels.
 *  Items with trackStock=false are excluded. */
export async function inventoryRows(): Promise<InventoryRow[]> {
  const [items, levels] = await Promise.all([loadItems(), stockLevels()]);
  const rows: InventoryRow[] = [];
  for (const item of items) {
    if (!item.trackStock) continue;
    const stock = levels.get(item.id) ?? 0;
    const threshold = item.lowStockThreshold ?? DEFAULT_LOW_STOCK;
    rows.push({ item, stock, lowStockThreshold: threshold, isLow: stock <= threshold });
  }
  // Low stock first, then alphabetical.
  rows.sort((a, b) => {
    if (a.isLow !== b.isLow) return a.isLow ? -1 : 1;
    return a.item.name.localeCompare(b.item.name);
  });
  return rows;
}

/** Count of tracked items currently at or below their threshold. */
export async function lowStockCount(): Promise<number> {
  const rows = await inventoryRows();
  return rows.filter((r) => r.isLow).length;
}

// ── Mutations — each appends exactly one movement ────────────────────

/** Set the opening count when the merchant first enables tracking on
 *  an item. Records a single `initial` movement for the whole qty. */
export async function setInitialStock(
  item: CatalogueItem, qty: number, note?: string,
): Promise<StockMovement> {
  return append({
    itemId: item.id, itemName: item.name, kind: 'initial',
    delta: qty, note,
  });
}

/** Restock — merchant received new units. `qty` must be positive. */
export async function restock(
  item: CatalogueItem, qty: number, note?: string,
): Promise<StockMovement> {
  if (qty <= 0) throw new Error('restock: qty must be positive');
  return append({
    itemId: item.id, itemName: item.name, kind: 'restock',
    delta: qty, note,
  });
}

/** Wastage — breakage / spoilage / theft. `qty` is the count lost
 *  (positive); the movement stores it as a negative delta. */
export async function recordWastage(
  item: CatalogueItem, qty: number, note?: string,
): Promise<StockMovement> {
  if (qty <= 0) throw new Error('recordWastage: qty must be positive');
  return append({
    itemId: item.id, itemName: item.name, kind: 'wastage',
    delta: -qty, note,
  });
}

/** Manual adjustment — a recount correction. `delta` is signed:
 *  +N if the merchant found more than the log said, −N if less. */
export async function adjustStock(
  item: CatalogueItem, delta: number, note?: string,
): Promise<StockMovement> {
  if (delta === 0) throw new Error('adjustStock: delta must be non-zero');
  return append({
    itemId: item.id, itemName: item.name, kind: 'adjustment',
    delta, note,
  });
}

/**
 * Deduct stock for a completed sale. Called from the sale flow after
 * a kvitto is persisted. Walks the cart lines, and for every line
 * whose catalogue item has trackStock=true, appends one `sale`
 * movement with a negative delta. Lines for untracked items (or items
 * no longer in the catalogue) are skipped silently — a sale must
 * never fail because of inventory bookkeeping.
 *
 * Idempotency note: the caller is expected to invoke this exactly
 * once per kvitto. It is not self-deduplicating.
 */
export async function deductSale(
  lines: CartLine[],
  kvittoNumber: number,
): Promise<StockMovement[]> {
  const items = await loadItems();
  const byId = new Map(items.map((i) => [i.id, i]));
  const written: StockMovement[] = [];
  for (const line of lines) {
    const item = byId.get(line.itemId);
    if (!item || !item.trackStock) continue;
    if (line.quantity <= 0) continue;
    written.push(await append({
      itemId: item.id,
      itemName: item.name,
      kind: 'sale',
      delta: -line.quantity,
      kvittoNumber,
    }));
  }
  return written;
}

/** Test/dev reset. */
export async function wipeStockMovements(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_STOCK_MOVEMENTS, 'readwrite');
    tx.objectStore(STORE_STOCK_MOVEMENTS).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
