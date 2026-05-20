/**
 * secure-store.ts — tier-aware KV for the Business app.
 *
 * Lifted from src/comm/services/secure-store.ts (battle-tested in the
 * Comm App for 8 months). Only the DB names + probe key differ so the
 * two apps' web-tier fallback stores stay isolated when both run on a
 * desktop browser for dev.
 *
 * Detection ladder:
 *   - 'native' — Capacitor SecureStorage (Android Keystore / iOS Keychain)
 *   - 'web'    — IndexedDB wrapped with non-extractable AES-GCM (XSS can
 *                still call decrypt; raw bytes never leave the SubtleCrypto
 *                handle)
 *   - 'memory' — last-resort in-process Map (DEV ONLY)
 *
 * Fail-closed contract (Phase B2, May 20 2026): on a real device
 * (`Capacitor.isNativePlatform()` is true) the only acceptable tier
 * is 'native'. The plugin throwing on a real device raises
 * SecureStoreUnavailableError instead of silently downgrading.
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
  try {
    const mod = await import('@aparajita/capacitor-secure-storage');
    await mod.SecureStorage.set('__anton_business_probe__', '1');
    await mod.SecureStorage.remove('__anton_business_probe__');
    tier = 'native';
    return tier;
  } catch (e) {
    if (Capacitor.isNativePlatform()) {
      throw new SecureStoreUnavailableError(
        'native secure storage is unavailable on this device — refusing to downgrade to a less-secure tier',
        e,
      );
    }
    tier = (typeof window !== 'undefined' && 'indexedDB' in window) ? 'web' : 'memory';
  }
  return tier;
}

const memoryStore = new Map<string, string>();
const DB_NAME = 'anton-business-secure';
const DB_STORE = 'kv';
const WRAP_KEY_ROW = '__wrap_key__';

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let cachedWrapKey: CryptoKey | null = null;

async function getOrCreateWrapKey(db: IDBDatabase): Promise<CryptoKey> {
  if (cachedWrapKey) return cachedWrapKey;
  const existing = await new Promise<CryptoKey | undefined>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get(WRAP_KEY_ROW);
    req.onsuccess = () => resolve(req.result as CryptoKey | undefined);
    req.onerror = () => reject(req.error);
  });
  if (existing) {
    cachedWrapKey = existing;
    return existing;
  }
  const fresh = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(fresh, WRAP_KEY_ROW);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  cachedWrapKey = fresh;
  return fresh;
}

interface WrappedEnvelope { v: 1; iv: string; ct: string; }

const enc = new TextEncoder();
const dec = new TextDecoder();

function bytesToB64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]!);
  return btoa(s);
}

function b64ToBytes(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function wrap(plaintext: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ctBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  const env: WrappedEnvelope = { v: 1, iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ctBuf)) };
  return JSON.stringify(env);
}

async function unwrap(stored: string, key: CryptoKey): Promise<string | null> {
  let env: WrappedEnvelope;
  try { env = JSON.parse(stored) as WrappedEnvelope; } catch { return null; }
  if (!env || env.v !== 1 || typeof env.iv !== 'string' || typeof env.ct !== 'string') return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(env.iv) },
      key,
      b64ToBytes(env.ct),
    );
    return dec.decode(plain);
  } catch {
    return null;
  }
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
    const wrapKey = await getOrCreateWrapKey(db);
    const wrapped = await wrap(value, wrapKey);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(wrapped, key);
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
    const stored = await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(key);
      req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    if (stored === null) return null;
    const wrapKey = await getOrCreateWrapKey(db);
    const unwrapped = await unwrap(stored, wrapKey);
    if (unwrapped !== null) return unwrapped;
    return stored;
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
