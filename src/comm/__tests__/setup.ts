/**
 * setup.ts — Vitest setup for the Comm App test suite.
 *
 * Each test isolates IDB state via fake-indexeddb so concurrent tests
 * don't leak rows. The global IDBKeyRange shim is also from
 * fake-indexeddb; without it the IDBKeyRange.bound() calls in
 * messages.ts / wassup.ts throw ReferenceError.
 *
 * crypto.subtle is provided by jsdom (Node 22's webcrypto polyfill);
 * but jsdom's getRandomValues + subtle.* are wired up only when the
 * window object exists, which is set by the jsdom environment before
 * setupFiles run.
 */
import 'fake-indexeddb/auto';
import { beforeEach } from 'vitest';

// fake-indexeddb shares one in-memory factory across all tests in a
// file (the `auto` entry point binds it onto globalThis). We don't try
// to delete-database between tests — that's slow and unreliable across
// fake-indexeddb versions — so each test should allocate its own
// threadHash / contactHash / postId namespace to avoid collisions.
//
// localStorage IS wiped because identity + settings live there and
// most tests do want a clean slate per case.
beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
});
