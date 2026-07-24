/**
 * secure-store.ts — thin tier-aware KV used by instances.ts and identity.ts.
 *
 * Mirrors identity.ts's three-tier strategy (native / IDB / memory) so any
 * client module can persist a small secret without re-implementing the
 * detection ladder.
 *
 * NOTE — the 'web' tier here stores values in IndexedDB **unwrapped**. The
 * Comm app's secure-store wraps its web tier under a non-extractable
 * WebCrypto key (src/comm/services/secure-store.ts); porting that here is a
 * tracked follow-up. Until then, treat browser-tier secrets as readable by
 * same-origin script.
 */
import { Capacitor } from '@capacitor/core';

export class SecureStoreUnavailableError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'SecureStoreUnavailableError';
  }
}

let tier: 'native' | 'web' | 'memory' | null = null;

async function detect(): Promise<'native' | 'web' | 'memory'> {
  if (tier) return tier;
  // Platform gate FIRST — a successful probe does NOT prove a real Keystore.
  // @aparajita/capacitor-secure-storage registers a WEB implementation whose
  // internalGetItem/internalSetItem are literal localStorage calls, so in a
  // browser (this app is also served as a PWA at /app/) the probe below
  // succeeds and we would mislabel the tier 'native' and hand the device
  // identity key to cleartext localStorage.
  if (!Capacitor.isNativePlatform()) {
    tier = (typeof window !== 'undefined' && 'indexedDB' in window) ? 'web' : 'memory';
    return tier;
  }
  try {
    const mod = await import('@aparajita/capacitor-secure-storage');
    await mod.SecureStorage.set('__anton_secure_probe__', '1');
    await mod.SecureStorage.remove('__anton_secure_probe__');
    tier = 'native';
    return tier;
  } catch (e) {
    // Fail-closed on a real device, matching the Comm/Pay/Business stores.
    throw new SecureStoreUnavailableError(
      'native secure storage is unavailable on this device — refusing to downgrade to a less-secure tier',
      e,
    );
  }
}

const memoryStore = new Map<string, string>();
const DB_NAME = 'anton-companion-secure';
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
    } catch { /* swallow */ }
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
