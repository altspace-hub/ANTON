/**
 * secure-store.ts — tier-aware KV for the Comm App. Mirrors the Companion
 * App's secure-store.ts so we use the same detection ladder (Capacitor
 * SecureStorage on native, IndexedDB on web, in-memory fallback).
 *
 * Kept as a separate file (not imported from src/app/) so the two apps
 * can diverge — the Comm App uses its own IDB database name to keep
 * stored secrets isolated from the Companion App on the same device.
 */

let tier: 'native' | 'web' | 'memory' | null = null;

async function detect(): Promise<'native' | 'web' | 'memory'> {
  if (tier) return tier;
  try {
    const mod = await import('@aparajita/capacitor-secure-storage');
    await mod.SecureStorage.set('__anton_comm_probe__', '1');
    await mod.SecureStorage.remove('__anton_comm_probe__');
    tier = 'native';
  } catch {
    tier = (typeof window !== 'undefined' && 'indexedDB' in window) ? 'web' : 'memory';
  }
  return tier;
}

const memoryStore = new Map<string, string>();
const DB_NAME = 'anton-comm-secure';
const DB_STORE = 'kv';

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function setSecure(key: string, value: string): Promise<void> {
  const t = await detect();
  if (t === 'native') {
    const mod = await import('@aparajita/capacitor-secure-storage');
    await mod.SecureStorage.set(key, value);
    return;
  }
  if (t === 'web') {
    const db = await idbOpen();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return;
  }
  memoryStore.set(key, value);
}

export async function getSecure(key: string): Promise<string | null> {
  const t = await detect();
  if (t === 'native') {
    try {
      const mod = await import('@aparajita/capacitor-secure-storage');
      return (await mod.SecureStorage.get(key)) as string | null;
    } catch { return null; }
  }
  if (t === 'web') {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(key);
      req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  }
  return memoryStore.get(key) ?? null;
}

export async function removeSecure(key: string): Promise<void> {
  const t = await detect();
  if (t === 'native') {
    try {
      const mod = await import('@aparajita/capacitor-secure-storage');
      await mod.SecureStorage.remove(key);
    } catch { /* fall through */ }
    return;
  }
  if (t === 'web') {
    const db = await idbOpen();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return;
  }
  memoryStore.delete(key);
}
