/**
 * items.ts — local catalogue of items the merchant sells.
 *
 * Stored as a JSON blob in expo-secure-store. The items aren't
 * sensitive (prices end up on every receipt), but co-locating with
 * the wallet + merchant config keeps the storage story to one
 * primitive. If the catalogue ever grows past a few hundred items
 * we'll switch to expo-sqlite — for v1.0 a small JSON array is fine.
 */
import * as SecureStore from 'expo-secure-store';

const KEY = 'fc.items';

export interface CatalogueItem {
  id: string;
  name: string;
  /** SEK, VAT-included. */
  unitPriceSek: number;
  vatRate: 0 | 6 | 12 | 25;
  /** Optional grouping for display. */
  category?: string;
  /** Unix ms timestamp of last edit. Used to order the list. */
  updatedAt: number;
}

export async function loadItems(): Promise<CatalogueItem[]> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as CatalogueItem[]) : [];
  } catch {
    return [];
  }
}

async function saveAll(items: CatalogueItem[]): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(items));
}

/** Generate a short stable id for a new item. 8 random hex chars. */
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

/** Seed a few example items for first-time dev demos. Returns the
 *  resulting list. Safe to call repeatedly — no-op if items already
 *  exist. */
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

export async function wipeItems(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
