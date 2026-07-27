/**
 * session-token.test.ts — the companion session token must never be at rest in
 * plaintext, and must still be there after a reload.
 *
 * Those two pull against each other, which is why the original code kept a
 * plaintext localStorage mirror: `getSessionToken()` is synchronous and called
 * from ~10 places, while the secure store is async. The fix keeps the accessor
 * synchronous and absorbs the async hydration in `ensureSession()`, which
 * `clientFetch` awaits.
 *
 * The tests assert on RAW localStorage and on the secure store, not on the
 * accessor — a round trip through `saveSessionToken`/`getSessionToken` would pass
 * identically while the token was still being written in the clear.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

import {
  getSessionToken, saveSessionToken, clearSession, ensureSession, _resetSessionForTests,
} from '../services/api';
import { getSecure, setSecure } from '../services/secure-store';

const LEGACY = 'anton-companion-session';
const FALLBACK = 'app-session-token';
const KEY_ACTIVE = 'anton-companion-active-instance';
const KEY_LIST = 'anton-companion-instances';

/** Register an instance the way instances.ts stores them. */
function seedInstance(id: string): void {
  localStorage.setItem(KEY_LIST, JSON.stringify([{ id, server_base: 'https://x.test', name: 'X' }]));
  localStorage.setItem(KEY_ACTIVE, id);
}

beforeEach(async () => {
  localStorage.clear();
  _resetSessionForTests();
  // Clear anything a previous case left in the secure store.
  const { removeSecure } = await import('../services/secure-store');
  await removeSecure(FALLBACK);
  await removeSecure('session:inst-1');
});

describe('the token is never at rest in plaintext', () => {
  it('saveSessionToken writes nothing to localStorage', async () => {
    saveSessionToken('tok-abc');
    expect(localStorage.getItem(LEGACY)).toBeNull();
    // ...and nothing anywhere else in localStorage either.
    const values = Object.keys(localStorage).map((k) => localStorage.getItem(k) ?? '');
    expect(values.some((v) => v.includes('tok-abc'))).toBe(false);
  });

  it('persists to the secure store instead, under the ACTIVE instance', async () => {
    seedInstance('inst-1');
    saveSessionToken('tok-inst');
    await new Promise((r) => setTimeout(r, 50));   // durable write is best-effort/async
    expect(await getSecure('session:inst-1')).toBe('tok-inst');
  });

  it('falls back to a dedicated key when no instance exists yet', async () => {
    // WelcomePage's register-simple path saves a token BEFORE any instance record
    // is created. Without this the token would be lost on the next reload and the
    // user would be dropped silently back to Welcome.
    saveSessionToken('tok-preinstance');
    await new Promise((r) => setTimeout(r, 50));
    expect(await getSecure(FALLBACK)).toBe('tok-preinstance');
  });

  it('the accessor stays synchronous for its ~10 call sites', () => {
    saveSessionToken('tok-sync');
    expect(getSessionToken()).toBe('tok-sync');   // no await
  });
});

describe('hydration across a reload', () => {
  it('recovers the token from the secure store when memory is empty', async () => {
    seedInstance('inst-1');
    await setSecure('session:inst-1', 'tok-persisted');
    _resetSessionForTests();                       // simulate a fresh page load

    expect(getSessionToken()).toBeNull();          // nothing in memory yet
    await ensureSession();
    expect(getSessionToken()).toBe('tok-persisted');
  });

  it('recovers from the fallback key when there is no active instance', async () => {
    await setSecure(FALLBACK, 'tok-fallback');
    _resetSessionForTests();
    await ensureSession();
    expect(getSessionToken()).toBe('tok-fallback');
  });

  it('concurrent callers share ONE hydration', async () => {
    seedInstance('inst-1');
    await setSecure('session:inst-1', 'tok-shared');
    _resetSessionForTests();
    await Promise.all([ensureSession(), ensureSession(), ensureSession()]);
    expect(getSessionToken()).toBe('tok-shared');
  });

  it('resolves without throwing when there is nothing to hydrate', async () => {
    _resetSessionForTests();
    await expect(ensureSession()).resolves.toBeUndefined();
    expect(getSessionToken()).toBeNull();
  });
});

describe('migrating a device that already has the plaintext mirror', () => {
  it('adopts the legacy value AND deletes it', async () => {
    // The only moment the plaintext copy can be removed from an already-paired
    // device, so it must not be skipped or deferred.
    localStorage.setItem(LEGACY, 'tok-legacy');
    _resetSessionForTests();

    await ensureSession();

    expect(getSessionToken()).toBe('tok-legacy');       // user stays signed in
    expect(localStorage.getItem(LEGACY)).toBeNull();    // and the clear copy is gone
  });

  it('does not lose the session on the NEXT boot — migration must persist, not just adopt', async () => {
    // This test previously hand-called saveSessionToken() between the two boots,
    // supplying a durable write that production never performs — so it passed
    // while the migration was destroying the only copy of the token. An
    // adversarial review caught it. No manual re-save now: boot 2 must recover
    // purely from what the migration itself wrote.
    localStorage.setItem(LEGACY, 'tok-legacy');
    _resetSessionForTests();

    await ensureSession();                       // boot 1: adopt + persist + delete
    expect(getSessionToken()).toBe('tok-legacy');
    expect(localStorage.getItem(LEGACY)).toBeNull();

    _resetSessionForTests();                     // boot 2: memory empty, mirror gone
    await ensureSession();
    expect(getSessionToken()).toBe('tok-legacy');
  });

  it('persists under the ACTIVE instance when there is one', async () => {
    seedInstance('inst-1');
    localStorage.setItem(LEGACY, 'tok-legacy-inst');
    _resetSessionForTests();
    await ensureSession();
    expect(await getSecure('session:inst-1')).toBe('tok-legacy-inst');
  });

  it('keeps the mirror if the durable write fails, rather than destroying the session', async () => {
    // One more run with a plaintext copy is far cheaper than silently losing the
    // user's session. Retried on the next boot.
    const store = await import('../services/secure-store');
    const spy = vi.spyOn(store, 'setSecure').mockRejectedValueOnce(new Error('storage full'));
    localStorage.setItem(LEGACY, 'tok-fragile');
    _resetSessionForTests();

    await ensureSession();

    expect(getSessionToken()).toBe('tok-fragile');           // usable this run
    expect(localStorage.getItem(LEGACY)).toBe('tok-fragile'); // and retried next boot
    spy.mockRestore();
  });
});

describe('cold-start reads that used to work off localStorage', () => {
  it('a caller that gates on the token must hydrate first, not report "not authenticated"', async () => {
    // query.ts read getSessionToken() immediately and bailed with
    // "Not authenticated". That worked while the token sat in localStorage; with
    // in-memory hydration it fails on EVERY cold start for a user who IS
    // authenticated. The contract that makes those call sites safe is: after
    // awaiting ensureSession(), a persisted token is visible synchronously.
    seedInstance('inst-1');
    await setSecure('session:inst-1', 'tok-cold');
    _resetSessionForTests();

    expect(getSessionToken()).toBeNull();   // the trap: reading too early
    await ensureSession();
    expect(getSessionToken()).toBe('tok-cold');
  });

  it('hydration is idempotent once loaded, so repeated gates are cheap', async () => {
    seedInstance('inst-1');
    await setSecure('session:inst-1', 'tok-idem');
    _resetSessionForTests();
    await ensureSession();
    await ensureSession();
    await ensureSession();
    expect(getSessionToken()).toBe('tok-idem');
  });
});

describe('clearSession', () => {
  it('drops the token from memory and from the secure fallback', async () => {
    saveSessionToken('tok-bye');
    await new Promise((r) => setTimeout(r, 50));
    clearSession();
    await new Promise((r) => setTimeout(r, 50));
    expect(getSessionToken()).toBeNull();
    expect(await getSecure(FALLBACK)).toBeNull();
  });

  it('also removes a legacy plaintext mirror if one is still around', async () => {
    localStorage.setItem(LEGACY, 'tok-old');
    clearSession();
    expect(localStorage.getItem(LEGACY)).toBeNull();
  });
});
