/**
 * secure-store.ts — thin tier-aware KV used by instances.ts and identity.ts.
 *
 * Mirrors identity.ts's three-tier strategy (native / IDB / memory) so any
 * client module can persist a small secret without re-implementing the
 * detection ladder.
 *
 * ── The 'web' tier (this app is also served as a PWA at /app/) ──────────────
 *
 * Values are encrypted under a non-extractable AES-GCM key, matching the Comm /
 * Pay / Business stores. This tier previously wrote them to IndexedDB in the
 * clear, which mattered because everything routed through here is a live
 * credential: the Ed25519 DEVICE PRIVATE KEY used to sign enrollment and
 * approval envelopes, per-instance SESSION TOKENS, and DEVICE CERTIFICATES.
 * Anything able to read the origin's IDB — a devtools glance on a shared
 * machine, a profile-sync or backup extension, a stolen browser profile
 * directory — got usable credentials, not just data.
 *
 * What the wrap does and does not buy, stated plainly: the key is generated
 * `extractable: false` and stored as a CryptoKey object (structured clone keeps
 * it non-extractable), so JS can never read its raw bytes and a dump of the IDB
 * file yields ciphertext plus an opaque key handle. Active same-origin XSS can
 * still CALL decrypt — no browser storage defends against that. The win is
 * against offline/at-rest reads, which is the realistic threat for a PWA.
 * Native remains the only tier where a secret is genuinely hard to read back.
 *
 * Migration is EAGER, deliberately unlike Comm's store. Comm returns a legacy
 * plaintext value as-is and rewraps on "the next setSecure" — but
 * `identity-private-key` is written once at pairing and thereafter only read,
 * so for that key the next setSecure never comes and an existing install would
 * stay in the clear forever. Here a legacy value is rewritten through the wrap
 * the first time it is read, so already-paired devices actually get fixed.
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
const WRAP_KEY_ROW = '__wrap_key__';

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Web-tier wrap key ────────────────────────────────────────────────
// The wrap key shares the value store, so the public API must refuse its row
// name: a caller reading it would get a CryptoKey where a string is expected,
// and removeSecure on it would orphan every wrapped value in the store.
function assertUsableKey(key: string): void {
  if (key === WRAP_KEY_ROW) throw new Error(`"${WRAP_KEY_ROW}" is reserved by secure-store`);
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
    /* extractable */ false,
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

function b64ToBytes(s: string): Uint8Array {
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

/** Returns null for anything that isn't a v1 envelope we can open — which is how
 *  a pre-wrap legacy plaintext value is detected. */
async function unwrap(stored: string, key: CryptoKey): Promise<string | null> {
  let env: WrappedEnvelope;
  try { env = JSON.parse(stored) as WrappedEnvelope; } catch { return null; }
  if (!env || env.v !== 1 || typeof env.iv !== 'string' || typeof env.ct !== 'string') return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(env.iv) }, key, b64ToBytes(env.ct),
    );
    return dec.decode(plain);
  } catch {
    return null;
  }
}

async function idbPut(db: IDBDatabase, key: string, value: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Which storage tier this device resolved to. 'native' is the only tier where a
 * stored secret is genuinely hard to read back off-device; callers that need to
 * refuse to arm a sensitive feature in a browser can gate on this.
 */
export async function getStorageTier(): Promise<'native' | 'web' | 'memory'> {
  return detect();
}

export async function setSecure(key: string, value: string): Promise<void> {
  assertUsableKey(key);
  const t = await detect();
  if (t === 'native') {
    const mod = await import('@aparajita/capacitor-secure-storage');
    await mod.SecureStorage.set(key, value);
    return;
  }
  if (t === 'web') {
    const db = await idbOpen();
    const wrapKey = await getOrCreateWrapKey(db);
    await idbPut(db, key, await wrap(value, wrapKey));
    return;
  }
  memoryStore.set(key, value);
}

export async function getSecure(key: string): Promise<string | null> {
  assertUsableKey(key);
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
    // Pre-wrap legacy plaintext. Rewrap it NOW rather than waiting for a future
    // setSecure that, for a write-once key like identity-private-key, never
    // arrives. Best-effort: a failed rewrite must not fail the read, or a paired
    // device could lose access to its own key over a transient IDB error.
    try { await idbPut(db, key, await wrap(stored, wrapKey)); } catch { /* retry next read */ }
    return stored;
  }
  return memoryStore.get(key) ?? null;
}

export async function removeSecure(key: string): Promise<void> {
  assertUsableKey(key);
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
