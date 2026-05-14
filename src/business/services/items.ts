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

export async function wipeItems(): Promise<void> {
  await removeSecure(KEY);
}
