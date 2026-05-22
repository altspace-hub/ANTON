/**
 * items.ts — local catalogue of items the merchant sells.
 *
 * Same surface as the Expo project's items.ts. Stored as a single
 * JSON blob in secure-store — at a few hundred items this is fine.
 * If the catalogue grows past that we'll move it into IndexedDB
 * alongside receipts.
 */
import { getSecure, removeSecure, setSecure } from './secure-store';

const KEY = 'fc.items';

export interface CatalogueItem {
  id: string;
  name: string;
  unitPriceSek: number;
  vatRate: 0 | 6 | 12 | 25;
  category?: string;
  updatedAt: number;
  /** Wave 12 — inventory. Opt-in per item: service-style items
   *  (a haircut, a consultation hour) leave this false; retail stock
   *  items turn it on. When true, the sale flow deducts stock and the
   *  Inventory screen tracks the item. */
  trackStock?: boolean;
  /** Low-stock alert threshold. When current stock drops to or below
   *  this, the item is flagged. Defaults to 5 when trackStock is on
   *  and this is unset. */
  lowStockThreshold?: number;
}

export async function loadItems(): Promise<CatalogueItem[]> {
  const raw = await getSecure(KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as CatalogueItem[]) : [];
  } catch {
    return [];
  }
}

async function saveAll(items: CatalogueItem[]): Promise<void> {
  await setSecure(KEY, JSON.stringify(items));
}

export function generateItemId(): string {
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

export async function addItem(item: Omit<CatalogueItem, 'id' | 'updatedAt'>): Promise<CatalogueItem> {
  const items = await loadItems();
  const created: CatalogueItem = {
    ...item,
    id: generateItemId(),
    updatedAt: Date.now(),
  };
  items.push(created);
  await saveAll(items);
  return created;
}

export async function updateItem(id: string, patch: Partial<Omit<CatalogueItem, 'id'>>): Promise<CatalogueItem | null> {
  const items = await loadItems();
  const idx = items.findIndex((i) => i.id === id);
  if (idx < 0) return null;
  const updated = { ...items[idx]!, ...patch, updatedAt: Date.now() };
  items[idx] = updated;
  await saveAll(items);
  return updated;
}

export async function deleteItem(id: string): Promise<void> {
  const items = await loadItems();
  await saveAll(items.filter((i) => i.id !== id));
}

export async function seedSampleItems(): Promise<CatalogueItem[]> {
  const existing = await loadItems();
  if (existing.length > 0) return existing;
  const samples: CatalogueItem[] = [
    { id: generateItemId(), name: 'Coffee',         unitPriceSek: 35, vatRate: 12, category: 'Drinks',  updatedAt: Date.now() },
    { id: generateItemId(), name: 'Tea',            unitPriceSek: 30, vatRate: 12, category: 'Drinks',  updatedAt: Date.now() },
    { id: generateItemId(), name: 'Cinnamon bun',   unitPriceSek: 35, vatRate: 12, category: 'Pastry',  updatedAt: Date.now() },
    { id: generateItemId(), name: 'Sandwich',       unitPriceSek: 75, vatRate: 12, category: 'Food',    updatedAt: Date.now() },
    { id: generateItemId(), name: 'Beer (large)',   unitPriceSek: 79, vatRate: 25, category: 'Bar',     updatedAt: Date.now() },
    { id: generateItemId(), name: 'House wine',     unitPriceSek: 89, vatRate: 25, category: 'Bar',     updatedAt: Date.now() },
  ];
  await saveAll(samples);
  return samples;
}

/**
 * Load all items from an industry template into the catalogue.
 *
 *   - mode = 'append' keeps existing items and appends the template's.
 *     The merchant can curate from there.
 *   - mode = 'replace' wipes the current catalogue first. Useful when
 *     onboarding for the first time and the merchant hasn't curated yet.
 *
 * Returns the new full catalogue.
 */
export async function loadIndustryTemplate(
  templateId: string,
  mode: 'append' | 'replace',
): Promise<CatalogueItem[]> {
  // Lazy import to avoid pulling the 600-item template blob into the
  // sale-flow bundles. Only `Settings → Items → Templates` triggers this.
  const { getTemplate } = await import('../data/industry-templates');
  const template = getTemplate(templateId);
  if (!template) throw new Error(`loadIndustryTemplate: unknown id "${templateId}"`);
  const existing = mode === 'append' ? await loadItems() : [];
  const now = Date.now();
  const additions: CatalogueItem[] = [];
  for (const segment of template.segments) {
    for (const item of segment.items) {
      additions.push({
        id: generateItemId(),
        name: item.name,
        unitPriceSek: item.priceSek,
        vatRate: item.vatRate,
        category: segment.label,
        updatedAt: now,
      });
    }
  }
  const merged = [...existing, ...additions];
  await saveAll(merged);
  return merged;
}

/** Returns the unique set of category names present in the current
 *  catalogue, in the order they were first added. Used to drive the
 *  segment tab-bar in the Extended-sale screen. */
export async function listCategories(): Promise<string[]> {
  const items = await loadItems();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const i of items) {
    const c = (i.category ?? '').trim();
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

export async function wipeItems(): Promise<void> {
  await removeSecure(KEY);
}
