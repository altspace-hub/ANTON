// @vitest-environment jsdom
/**
 * default-model-after-reset.test.ts — a browser that has never stored a model
 * must still run modules on the instance default.
 *
 * Found in the 2026-09-22 Work QA: on a fresh browser the config store's
 * reset values were captured once, at import, while localStorage was still
 * empty — so `claude-opus-5` (a bare API id). The boot sync then adopted the
 * server's `sdk:` default, but every module page calls clearSession() →
 * resetConfig() on mount, which put the frozen API id back. Every module run
 * on a new device went to the (unfunded) API key until the tab was reloaded.
 *
 * Also: the sync gave up on any non-OK answer, so a rate-limited boot kept the
 * API id silently. It now retries.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const SDK = 'sdk:claude-opus-5';

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  vi.restoreAllMocks();
});

async function loadStores() {
  const config = await import('../../src/stores/useConfigStore');
  const settings = await import('../../src/stores/useSettingsStore');
  const sync = await import('../../src/lib/default-model-sync');
  return { useConfigStore: config.useConfigStore, useSettingsStore: settings.useSettingsStore, sync: sync.syncDefaultModelFromServer };
}

function answer(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('fresh browser: the instance default survives a module page reset', () => {
  it('resetConfig() after the boot sync keeps the server default, not the import-time fallback', async () => {
    const { useConfigStore, sync } = await loadStores();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(answer(200, { model: SDK, source: 'settings' }));

    await sync();
    expect(useConfigStore.getState().model).toBe(SDK);

    // What ModulePage does on mount (clearSession → resetConfig).
    useConfigStore.getState().resetConfig();
    expect(useConfigStore.getState().model).toBe(SDK);
  });

  it('a default changed in Settings reaches the next reset without a reload', async () => {
    const { useConfigStore, useSettingsStore } = await loadStores();
    useSettingsStore.getState().setDefaultThinking?.('quick');
    localStorage.setItem('openexpert-default-model', SDK);
    useConfigStore.getState().resetConfig();
    expect(useConfigStore.getState().model).toBe(SDK);
  });
});

describe('the boot sync does not give up on a refused answer', () => {
  it('a 429 is retried and the server default is adopted', async () => {
    vi.useFakeTimers();
    try {
      const { useConfigStore, sync } = await loadStores();
      const fetchMock = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(answer(429, { error: 'Too many requests. Please slow down.' }))
        .mockResolvedValue(answer(200, { model: SDK, source: 'settings' }));

      const done = sync();
      await vi.runAllTimersAsync();
      await done;

      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(useConfigStore.getState().model).toBe(SDK);
    } finally {
      vi.useRealTimers();
    }
  });

  it('an env-sourced default is still not adopted (only an owner choice is)', async () => {
    const { useConfigStore, sync } = await loadStores();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(answer(200, { model: SDK, source: 'env' }));
    await sync();
    expect(useConfigStore.getState().model).toBe('claude-opus-5-5'); // the store's own fallback
  });
});
