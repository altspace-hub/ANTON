/**
 * atom-injection-gate-demo.test.ts — on the public demo the memory gate is
 * off, whatever Settings holds (privacy review B6 / G6).
 *
 * Shared knowledge atoms can be the owner's own client work. On a demo they
 * must never be sent with a visitor's prompt, and the 'auto' mode would open
 * by itself once 100 module atoms and 30 ratings exist. The counts are still
 * read and shown. Negative control: outside the demo the same settings open
 * the gate as before.
 *
 * A fake adapter answers the gate's own statements (no database).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { DatabaseAdapter } from '../../server/db/database.js';
import {
  ATOM_INJECTION_GATE_SQL,
  ATOM_INJECTION_MODE_SETTING_KEY,
  getAtomInjectionStatus,
  resetAtomInjectionGateCache,
} from '../../server/services/atom-injection-gate.js';
import { buildAtomLayerDetailed } from '../../server/services/prompt-builder.js';

function fakeDb(mode: string, moduleAtoms: number, ratings: number): DatabaseAdapter {
  const db = {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (sql === ATOM_INJECTION_GATE_SQL.mode) return (params[0] === ATOM_INJECTION_MODE_SETTING_KEY ? { value: mode } : undefined) as T | undefined;
      if (sql === ATOM_INJECTION_GATE_SQL.moduleAtoms) return { c: String(moduleAtoms) } as T;
      if (sql === ATOM_INJECTION_GATE_SQL.ratings) return { c: String(ratings) } as T;
      throw new Error(`fake db: unexpected get(): ${sql.slice(0, 80)}`);
    },
    async all<T>(): Promise<T[]> { throw new Error('fake db: no retrieval expected'); },
    async run() { throw new Error('fake db: no write expected'); },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  } as unknown as DatabaseAdapter;
  return db;
}

describe('the memory gate on the public demo', () => {
  const saved = process.env.DEMO_MODE;
  beforeEach(() => { resetAtomInjectionGateCache(); });
  afterEach(() => {
    if (saved === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = saved;
    resetAtomInjectionGateCache();
  });

  it.each(['on', 'auto'])('is off with mode %s in Settings and the thresholds met', async (mode) => {
    process.env.DEMO_MODE = 'true';
    const status = await getAtomInjectionStatus(fakeDb(mode, 500, 90), { fresh: true });
    expect(status).toMatchObject({ mode: 'off', applies: false, ready: true, moduleAtoms: 500, ratings: 90 });
    expect(status.reason).toMatch(/public demo/i);
  });

  it('is off even when an open status is already cached', async () => {
    delete process.env.DEMO_MODE;
    const db = fakeDb('on', 500, 90);
    expect((await getAtomInjectionStatus(db)).applies).toBe(true);
    process.env.DEMO_MODE = 'true';
    expect((await getAtomInjectionStatus(db)).applies).toBe(false);
  });

  it('builds no general atom block for a Work run', async () => {
    process.env.DEMO_MODE = 'true';
    const layer = await buildAtomLayerDetailed(fakeDb('on', 500, 90), { areaId: 'fcp', moduleId: 'alert-investigation', userMessage: 'Review this alert please' });
    expect(layer).toMatchObject({ text: '', atoms: [], applied: false });
    // Closed by the gate, before any retrieval (the fake refuses one).
    expect(layer.reason).toMatch(/public demo/i);
  });

  it.each([
    ['on', 0, 0, true],
    ['auto', 500, 90, true],
    ['auto', 5, 1, false],
  ] as const)('negative control: outside the demo, mode %s with %d atoms and %d ratings applies = %s', async (mode, atoms, ratings, applies) => {
    delete process.env.DEMO_MODE;
    const status = await getAtomInjectionStatus(fakeDb(mode, atoms, ratings), { fresh: true });
    expect(status.mode).toBe(mode);
    expect(status.applies).toBe(applies);
  });
});
