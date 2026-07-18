/**
 * verifier-model.test.ts — the double-check (four-eyes) settings store.
 * Proves: OFF + Haiku by default, the toggle and verifier-model persist and read
 * (sync + async), compat: (ApeAPI) ids pass through provider-routing untouched, and
 * clearing the model falls back to the default.
 *
 * provider-router is mocked to an identity mapModelToProvider so routeUtilityModel
 * (reused by verifier-model) is deterministic without a configured provider.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../server/services/provider-router.js', () => ({
  mapModelToProvider: (m: string) => m,
  callChat: vi.fn(),
}));

import {
  DEFAULT_VERIFIER_MODEL,
  initVerifierStore,
  isDoubleCheckEnabled,
  isDoubleCheckEnabledSync,
  getVerifierModel,
  getVerifierModelSync,
  getRoutedVerifierModelSync,
  setDoubleCheckEnabled,
  setVerifierModel,
  resetVerifierStoreForTests,
} from '../../server/services/verifier-model.js';

// Minimal in-memory app_settings fake — only the queries verifier-model issues.
function makeDb() {
  const store = new Map<string, string>();
  return {
    store,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async all(_sql: string, ...params: any[]) {
      return params.filter((k) => store.has(k)).map((k) => ({ key: k, value: store.get(k)! }));
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async run(sql: string, ...params: any[]) {
      if (/^INSERT INTO app_settings/i.test(sql)) store.set(params[0], params[1]);
      else if (/^DELETE FROM app_settings/i.test(sql)) store.delete(params[0]);
      return { changes: 1 };
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FakeDb = ReturnType<typeof makeDb> & any;

describe('verifier-model (double-check settings)', () => {
  beforeEach(() => resetVerifierStoreForTests());

  it('defaults to OFF with the Haiku verifier', async () => {
    const db = makeDb() as FakeDb;
    expect(await isDoubleCheckEnabled(db)).toBe(false);
    expect(await getVerifierModel(db)).toBe(DEFAULT_VERIFIER_MODEL);
    expect(DEFAULT_VERIFIER_MODEL).toBe('claude-haiku-4-5-20251001');
  });

  it('persists and reads the enabled toggle (async + sync)', async () => {
    const db = makeDb() as FakeDb;
    await setDoubleCheckEnabled(db, true);
    expect(await isDoubleCheckEnabled(db)).toBe(true);
    expect(isDoubleCheckEnabledSync()).toBe(true);
    expect(db.store.get('double_check_enabled')).toBe('true');

    await setDoubleCheckEnabled(db, false);
    expect(await isDoubleCheckEnabled(db)).toBe(false);
    expect(db.store.get('double_check_enabled')).toBe('false');
  });

  it('persists a compat: (ApeAPI) verifier and passes it through routing untouched', async () => {
    const db = makeDb() as FakeDb;
    await setVerifierModel(db, 'compat:apeapi:grok-2');
    expect(await getVerifierModel(db)).toBe('compat:apeapi:grok-2');
    expect(getVerifierModelSync()).toBe('compat:apeapi:grok-2');
    // Not a claude- id → returned as-is by routeUtilityModel.
    expect(getRoutedVerifierModelSync()).toBe('compat:apeapi:grok-2');
  });

  it('clearing the verifier model falls back to the default', async () => {
    const db = makeDb() as FakeDb;
    await setVerifierModel(db, 'compat:apeapi:kimi-k2');
    expect(await getVerifierModel(db)).toBe('compat:apeapi:kimi-k2');
    await setVerifierModel(db, null);
    expect(await getVerifierModel(db)).toBe(DEFAULT_VERIFIER_MODEL);
    expect(db.store.has('verifier_model')).toBe(false);
  });

  it('the toggle and the verifier model are independent keys', async () => {
    const db = makeDb() as FakeDb;
    await setDoubleCheckEnabled(db, true);
    await setVerifierModel(db, 'compat:apeapi:glm-4');
    expect(await isDoubleCheckEnabled(db)).toBe(true);
    expect(await getVerifierModel(db)).toBe('compat:apeapi:glm-4');
    // A fresh store primed from the same DB sees both.
    resetVerifierStoreForTests();
    initVerifierStore(db);
    expect(await isDoubleCheckEnabled(db)).toBe(true);
    expect(await getVerifierModel(db)).toBe('compat:apeapi:glm-4');
  });

  it('routes a bare claude- default through the (mocked identity) provider map', async () => {
    const db = makeDb() as FakeDb;
    // No verifier persisted → default Haiku, routed through identity mock.
    expect(await getVerifierModel(db)).toBe('claude-haiku-4-5-20251001');
    expect(getRoutedVerifierModelSync()).toBe('claude-haiku-4-5-20251001');
  });
});
