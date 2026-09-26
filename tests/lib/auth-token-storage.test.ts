// @vitest-environment jsdom
/**
 * auth-token-storage.test.ts — where the web client keeps the sign-in token,
 * and what sign-out leaves behind (privacy review M4 / D25, 2026-09-26).
 *
 * On a public demo, storage that keeps a sign-in across browser sessions
 * needs consent, so:
 *   - the token lives in sessionStorage (gone with the tab), never in
 *     localStorage — including a token an earlier visit left there;
 *   - sign-out clears the preference keys the demo stored, in both stores.
 * An ordinary server is unchanged: the token stays in localStorage and
 * sign-out keeps the person's preferences (negative controls).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { useDemoStore } from '../../src/stores/useDemoStore';
import { DEMO_OFF } from '../../src/lib/demo-config';
import { safeStorage, clearPreferenceKeys } from '../../src/lib/safe-storage';

const DEMO_CONFIG = { deploymentMode: 'team', demoMode: true, signupOpen: true, retentionDays: 30, privacyPath: '/privacy' };
const USER = { id: 'u1', username: 'visitor_1', role: 'analyst' };
const calls: string[] = [];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function demo(on: boolean): void {
  useDemoStore.setState({ config: DEMO_OFF, loaded: false });
  if (on) useDemoStore.getState().applyConfig(DEMO_CONFIG);
}

/** Preference keys as the pages leave them, plus a key that is not ours. */
function seedPreferences(): void {
  localStorage.setItem('openexpert-theme', 'dark');
  localStorage.setItem('openexpert-default-model', 'compat:openrouter:z-ai/glm-5.3-flash');
  localStorage.setItem('anton-favorites', '["aml"]');
  localStorage.setItem('recent-commands', '[]');
  localStorage.setItem('dismissed-skills-aml', '1');
  localStorage.setItem('pwa-install-dismissed', '1');
  sessionStorage.setItem('openexpert-model-reco-dismissed', '1');
  localStorage.setItem('someone-elses-key', 'keep');
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  calls.length = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    if (url === '/api/auth/login') return json({ user: USER, token: 'tok-1' });
    if (url === '/api/auth/me') return json(USER);
    if (url === '/api/auth/logout') return json({ ok: true });
    return json({}, 404);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.setState({ user: null, token: null });
  demo(false);
});

describe('on a public demo', () => {
  it('keeps the token in sessionStorage, never in localStorage', async () => {
    demo(true);
    await useAuthStore.getState().login('visitor_1', 'a-long-enough-pass');
    expect(sessionStorage.getItem('openexpert-token')).toBe('tok-1');
    expect(localStorage.getItem('openexpert-token')).toBeNull();
    expect(safeStorage.getItem('openexpert-token')).toBe('tok-1');
    // Only the token moves: other keys are where they always were.
    safeStorage.setItem('openexpert-theme', 'light');
    expect(localStorage.getItem('openexpert-theme')).toBe('light');
  });

  it('moves a token an earlier visit left in localStorage, and signs the tab in with it', async () => {
    localStorage.setItem('openexpert-token', 'tok-old');
    demo(true);
    expect(localStorage.getItem('openexpert-token')).toBeNull();
    expect(sessionStorage.getItem('openexpert-token')).toBe('tok-old');
    await useAuthStore.getState().checkAuth();
    expect(useAuthStore.getState().user?.username).toBe('visitor_1');
    expect(useAuthStore.getState().token).toBe('tok-old');
  });

  it('clears the token and the preference keys at sign-out — and nothing else', async () => {
    demo(true);
    await useAuthStore.getState().login('visitor_1', 'a-long-enough-pass');
    seedPreferences();
    await useAuthStore.getState().logout();
    expect(calls).toContain('/api/auth/logout');
    expect(sessionStorage.getItem('openexpert-token')).toBeNull();
    expect(localStorage.getItem('openexpert-token')).toBeNull();
    for (const key of ['openexpert-theme', 'openexpert-default-model', 'anton-favorites', 'recent-commands', 'dismissed-skills-aml', 'pwa-install-dismissed']) {
      expect(localStorage.getItem(key), key).toBeNull();
    }
    expect(sessionStorage.getItem('openexpert-model-reco-dismissed')).toBeNull();
    expect(localStorage.getItem('someone-elses-key')).toBe('keep');
    expect(useAuthStore.getState().user).toBeNull();
  });
});

describe('on an ordinary server (negative controls)', () => {
  it('keeps the token in localStorage, as before', async () => {
    demo(false);
    await useAuthStore.getState().login('analyst_1', 'a-long-enough-pass');
    expect(localStorage.getItem('openexpert-token')).toBe('tok-1');
    expect(sessionStorage.getItem('openexpert-token')).toBeNull();
  });

  it('leaves the person\'s preferences in place at sign-out', async () => {
    demo(false);
    await useAuthStore.getState().login('analyst_1', 'a-long-enough-pass');
    seedPreferences();
    await useAuthStore.getState().logout();
    expect(localStorage.getItem('openexpert-token')).toBeNull();
    expect(localStorage.getItem('openexpert-theme')).toBe('dark');
    expect(localStorage.getItem('anton-favorites')).toBe('["aml"]');
    expect(sessionStorage.getItem('openexpert-model-reco-dismissed')).toBe('1');
  });

  it('a token in localStorage stays there when the server is not a demo', async () => {
    localStorage.setItem('openexpert-token', 'tok-old');
    demo(false);
    expect(localStorage.getItem('openexpert-token')).toBe('tok-old');
    await useAuthStore.getState().checkAuth();
    expect(useAuthStore.getState().token).toBe('tok-old');
  });
});

describe('clearPreferenceKeys', () => {
  it('removes only the listed prefixes, from both stores, and counts them', () => {
    seedPreferences();
    expect(clearPreferenceKeys()).toBe(7);
    expect(localStorage.length).toBe(1);
    expect(localStorage.getItem('someone-elses-key')).toBe('keep');
    expect(sessionStorage.length).toBe(0);
  });
});
