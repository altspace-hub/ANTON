/**
 * portal-cache.ts — IndexedDB-backed offline cache for portal data.
 *
 * Phase 5 of the in-app portal viewer plan. Three things get cached:
 *
 *   - `desc:<address>`         → PortalDescriptor (resolved from the relay)
 *   - `pages:<address>`        → PortalPageMeta[] (page list from publisher)
 *   - `page:<address>:<path>`  → PortalPage (HTML body + title)
 *
 * The cache is *network-first, stale-on-failure*: portals.ts always tries
 * the network first, writes successful responses through, and only reads
 * the cache when the network call throws or returns 5xx. This avoids the
 * usual stale-cache footgun (publishers expect their updates to land for
 * visitors immediately) while keeping the app usable in subway tunnels
 * and on the kind of bad airport wifi where the relay times out.
 *
 * Keys are namespaced by kind so a single object store works for all
 * three entry shapes (TypeScript narrows on the kind discriminator).
 *
 * The store has an LRU-like cap (MAX_ENTRIES) enforced lazily after every
 * write, and a TTL (TTL_MS) for stale evictions. Anything older than the
 * TTL is treated as missing even if it's still on disk; a background
 * pass would clean it up, but in practice it's fine to keep — it just
 * never gets returned.
 */
import {
  openDb,
  STORE_PORTAL_CACHE,
  INDEX_PORTAL_BY_CACHED_AT,
} from './db';

/** 14 days — long enough to be useful in a phone-out-of-coverage trip,
 *  short enough that long-stale data eventually evicts. */
const TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** Cap the cache. Eviction is the simplest possible: when the row count
 *  exceeds this, drop the N oldest entries. No LRU tracking — accessing
 *  a cached entry doesn't bump its cachedAt. The point is to bound disk
 *  usage, not optimise hit rate. */
const MAX_ENTRIES = 200;

interface CacheRow<T> {
  key: string;
  value: T;
  /** Unix ms when this entry was written. Used for both TTL eviction
   *  (anything older than TTL_MS is treated as missing) and capacity
   *  eviction (oldest first). */
  cachedAt: number;
}

function descKey(address: string): string { return `desc:${address}`; }
function pagesKey(address: string): string { return `pages:${address}`; }
function pageKey(address: string, path: string): string {
  // Normalise path so '/foo' and 'foo' don't double up.
  const p = path.startsWith('/') ? path : `/${path}`;
  return `page:${address}:${p}`;
}

async function getRow<T>(key: string): Promise<CacheRow<T> | null> {
  try {
    const db = await openDb();
    return await new Promise<CacheRow<T> | null>((resolve) => {
      const tx = db.transaction(STORE_PORTAL_CACHE, 'readonly');
      const req = tx.objectStore(STORE_PORTAL_CACHE).get(key);
      req.onsuccess = () => {
        const row = req.result as CacheRow<T> | undefined;
        if (!row) return resolve(null);
        // TTL guard — expired rows are treated as missing.
        if (Date.now() - row.cachedAt > TTL_MS) return resolve(null);
        resolve(row);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    // openDb can throw if the upgrade is blocked. Cache is best-effort —
    // never let it break the actual page render.
    return null;
  }
}

async function putRow<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_PORTAL_CACHE, 'readwrite');
      const row: CacheRow<T> = { key, value, cachedAt: Date.now() };
      tx.objectStore(STORE_PORTAL_CACHE).put(row);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
    // Lazy capacity eviction. Counting + evicting is cheap on the
    // ~200-row scale we're targeting; doing it after every put keeps
    // the cache from unbounded growth without needing a periodic job.
    await maybeEvict();
  } catch {
    // Ignore — best-effort.
  }
}

async function maybeEvict(): Promise<void> {
  try {
    const db = await openDb();
    const count = await new Promise<number>((resolve) => {
      const tx = db.transaction(STORE_PORTAL_CACHE, 'readonly');
      const req = tx.objectStore(STORE_PORTAL_CACHE).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(0);
    });
    if (count <= MAX_ENTRIES) return;
    const drop = count - MAX_ENTRIES;
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_PORTAL_CACHE, 'readwrite');
      const store = tx.objectStore(STORE_PORTAL_CACHE);
      const idx = store.index(INDEX_PORTAL_BY_CACHED_AT);
      let deleted = 0;
      idx.openCursor().onsuccess = (ev) => {
        const cursor = (ev.target as IDBRequest<IDBCursorWithValue>).result;
        if (!cursor || deleted >= drop) return;
        store.delete(cursor.primaryKey);
        deleted += 1;
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // Ignore.
  }
}

// ── Typed wrappers ────────────────────────────────────────────────────
//
// Imported by portals.ts. Kept simple — value types stay opaque to the
// cache (`unknown`), and callers cast on the way out. The keys are
// namespaced so callers can't accidentally read a page row as a
// descriptor row.

export async function readDescriptor<T>(address: string): Promise<T | null> {
  const row = await getRow<T>(descKey(address));
  return row?.value ?? null;
}

export async function writeDescriptor<T>(address: string, value: T): Promise<void> {
  await putRow(descKey(address), value);
}

export async function readPages<T>(address: string): Promise<T | null> {
  const row = await getRow<T>(pagesKey(address));
  return row?.value ?? null;
}

export async function writePages<T>(address: string, value: T): Promise<void> {
  await putRow(pagesKey(address), value);
}

export async function readPage<T>(address: string, path: string): Promise<T | null> {
  const row = await getRow<T>(pageKey(address, path));
  return row?.value ?? null;
}

export async function writePage<T>(address: string, path: string, value: T): Promise<void> {
  await putRow(pageKey(address, path), value);
}

/** Wipe everything cached for a single portal. Called when the user
 *  explicitly removes a portal from their bookmarks (not used by the
 *  fetch path itself). */
export async function clearPortal(address: string): Promise<void> {
  try {
    const db = await openDb();
    const prefix = `${address}:`;
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_PORTAL_CACHE, 'readwrite');
      const store = tx.objectStore(STORE_PORTAL_CACHE);
      // Walk all keys that start with one of the three namespaces +
      // the address. Three prefixes to match (desc, pages, page).
      store.openCursor().onsuccess = (ev) => {
        const cursor = (ev.target as IDBRequest<IDBCursorWithValue>).result;
        if (!cursor) return;
        const key = cursor.primaryKey as string;
        if (
          key === `desc:${address}` ||
          key === `pages:${address}` ||
          key.startsWith(`page:${prefix}`)
        ) {
          store.delete(cursor.primaryKey);
        }
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // Ignore.
  }
}

/** Visible to tests so they can assert on raw rows. Not for app use. */
export async function _debugCount(): Promise<number> {
  try {
    const db = await openDb();
    return await new Promise<number>((resolve) => {
      const tx = db.transaction(STORE_PORTAL_CACHE, 'readonly');
      const req = tx.objectStore(STORE_PORTAL_CACHE).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}
