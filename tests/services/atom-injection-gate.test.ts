/**
 * atom-injection-gate.test.ts — the memory-injection gate (Wave 4 track B).
 *
 * The mode matrix (auto / on / off × thresholds), the counts as PostgreSQL
 * returns them (COUNT(*) is a bigint → string), the 60 s cache and its reset,
 * the setting round-trip, and the rule that a broken read never injects.
 *
 * The fake adapter answers the gate's own statements by identity — a changed
 * statement fails here rather than passing over the wrong table.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import {
  ATOM_INJECTION_GATE_SQL,
  ATOM_INJECTION_MODE_SETTING_KEY,
  ATOM_INJECTION_MIN_MODULE_ATOMS,
  ATOM_INJECTION_MIN_RATINGS,
  getAtomInjectionStatus,
  setAtomInjectionMode,
  resetAtomInjectionGateCache,
  isAtomInjectionMode,
} from '../../server/services/atom-injection-gate.js';

interface FakeOpts {
  mode?: string;
  moduleAtoms?: number | string;
  ratings?: number | string;
}

interface Fake {
  db: DatabaseAdapter;
  settings: Map<string, string>;
  counts: { moduleAtoms: number | string; ratings: number | string };
  reads: () => number;
  /** When set, every read throws. */
  throwReads: { value: boolean };
}

function makeFakeDb(opts: FakeOpts = {}): Fake {
  const settings = new Map<string, string>();
  if (opts.mode !== undefined) settings.set(ATOM_INJECTION_MODE_SETTING_KEY, opts.mode);
  const counts = { moduleAtoms: opts.moduleAtoms ?? 0, ratings: opts.ratings ?? 0 };
  const throwReads = { value: false };
  let reads = 0;
  const db = {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      reads++;
      if (throwReads.value) throw new Error('connection refused');
      if (sql === ATOM_INJECTION_GATE_SQL.mode) {
        const value = settings.get(String(params[0]));
        return value === undefined ? undefined : ({ value } as T);
      }
      if (sql === ATOM_INJECTION_GATE_SQL.moduleAtoms) return { c: counts.moduleAtoms } as T;
      if (sql === ATOM_INJECTION_GATE_SQL.ratings) return { c: counts.ratings } as T;
      throw new Error(`fake db: unexpected get(): ${sql.slice(0, 80)}`);
    },
    async all<T>(): Promise<T[]> { return []; },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (sql === ATOM_INJECTION_GATE_SQL.upsertMode) settings.set(String(params[0]), String(params[1]));
      else throw new Error(`fake db: unexpected run(): ${sql.slice(0, 80)}`);
      return { changes: 1, lastInsertRowid: 0 };
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  } as unknown as DatabaseAdapter;
  return { db, settings, counts, reads: () => reads, throwReads };
}

beforeEach(() => { resetAtomInjectionGateCache(); });

describe('the thresholds and the statements', () => {
  it('are the owner decision: 100 module atoms and 30 ratings', () => {
    expect(ATOM_INJECTION_MIN_MODULE_ATOMS).toBe(100);
    expect(ATOM_INJECTION_MIN_RATINGS).toBe(30);
    expect(ATOM_INJECTION_MODE_SETTING_KEY).toBe('atom_injection_mode');
  });

  it('count module atoms as active, module-sourced, not Coding Studio and not lint; ratings as rated either way', () => {
    expect(ATOM_INJECTION_GATE_SQL.moduleAtoms).toMatch(/FROM knowledge_atoms/);
    expect(ATOM_INJECTION_GATE_SQL.moduleAtoms).toMatch(/is_active = 1/);
    expect(ATOM_INJECTION_GATE_SQL.moduleAtoms).toMatch(/source_module_id IS NOT NULL/);
    expect(ATOM_INJECTION_GATE_SQL.moduleAtoms).toMatch(/coding_project_id IS NULL/);
    expect(ATOM_INJECTION_GATE_SQL.moduleAtoms).toMatch(/atom_origin IS NULL/);
    expect(ATOM_INJECTION_GATE_SQL.ratings).toMatch(/FROM retrieval_feedback WHERE was_relevant IS NOT NULL/);
  });

  it('isAtomInjectionMode accepts exactly the three modes', () => {
    expect(isAtomInjectionMode('auto')).toBe(true);
    expect(isAtomInjectionMode('on')).toBe(true);
    expect(isAtomInjectionMode('off')).toBe(true);
    expect(isAtomInjectionMode('ON')).toBe(false);
    expect(isAtomInjectionMode('')).toBe(false);
    expect(isAtomInjectionMode(undefined)).toBe(false);
    expect(isAtomInjectionMode(true)).toBe(false);
  });
});

describe('getAtomInjectionStatus — the mode matrix', () => {
  it('no setting row = auto; a fresh instance is collecting and does not inject', async () => {
    const { db } = makeFakeDb();
    const s = await getAtomInjectionStatus(db);
    expect(s).toEqual({
      mode: 'auto', ready: false, applies: false, moduleAtoms: 0, ratings: 0,
      thresholds: { moduleAtoms: 100, ratings: 30 },
      reason: 'Collecting: 0 of 100 module atoms, 0 of 30 ratings',
    });
  });

  it('this instance on 2026-09-16 (70 module atoms, 0 ratings) is collecting', async () => {
    const { db } = makeFakeDb({ moduleAtoms: 70, ratings: 0 });
    const s = await getAtomInjectionStatus(db);
    expect(s.applies).toBe(false);
    expect(s.ready).toBe(false);
    expect(s.moduleAtoms).toBe(70);
    expect(s.reason).toBe('Collecting: 70 of 100 module atoms, 0 of 30 ratings');
  });

  it('auto with atoms met but ratings short still does not inject', async () => {
    const { db } = makeFakeDb({ moduleAtoms: 250, ratings: 29 });
    const s = await getAtomInjectionStatus(db);
    expect(s.ready).toBe(false);
    expect(s.applies).toBe(false);
    expect(s.reason).toBe('Collecting: 250 of 100 module atoms, 29 of 30 ratings');
  });

  it('auto with ratings met but atoms short does not inject', async () => {
    const { db } = makeFakeDb({ moduleAtoms: 99, ratings: 60 });
    const s = await getAtomInjectionStatus(db);
    expect(s.applies).toBe(false);
  });

  it('auto at exactly both thresholds is ready and injects', async () => {
    const { db } = makeFakeDb({ mode: 'auto', moduleAtoms: 100, ratings: 30 });
    const s = await getAtomInjectionStatus(db);
    expect(s.ready).toBe(true);
    expect(s.applies).toBe(true);
    expect(s.reason).toBe('Ready: 100 module atoms (threshold 100), 30 ratings (threshold 30)');
  });

  it("mode 'on' injects regardless of the counts and says so", async () => {
    const { db } = makeFakeDb({ mode: 'on', moduleAtoms: 0, ratings: 0 });
    const s = await getAtomInjectionStatus(db);
    expect(s.mode).toBe('on');
    expect(s.ready).toBe(false);
    expect(s.applies).toBe(true);
    expect(s.reason).toBe('Forced on in Settings');
  });

  it("mode 'off' never injects, even when ready", async () => {
    const { db } = makeFakeDb({ mode: 'off', moduleAtoms: 500, ratings: 100 });
    const s = await getAtomInjectionStatus(db);
    expect(s.mode).toBe('off');
    expect(s.ready).toBe(true);
    expect(s.applies).toBe(false);
    expect(s.reason).toBe('Switched off in Settings');
  });

  it('an unknown or oddly-cased stored value falls back to auto', async () => {
    for (const raw of ['banana', '', ' ON ', 'Off']) {
      resetAtomInjectionGateCache();
      const { db } = makeFakeDb({ mode: raw, moduleAtoms: 100, ratings: 30 });
      const s = await getAtomInjectionStatus(db);
      // ' ON ' and 'Off' are normalised; 'banana' and '' are not modes.
      const expected = raw.trim().toLowerCase();
      expect(s.mode).toBe(isAtomInjectionMode(expected) ? expected : 'auto');
    }
  });

  it('reads COUNT(*) as PostgreSQL returns it (bigint → string)', async () => {
    const { db } = makeFakeDb({ moduleAtoms: '120', ratings: '31' });
    const s = await getAtomInjectionStatus(db);
    expect(s.moduleAtoms).toBe(120);
    expect(s.ratings).toBe(31);
    expect(s.ready).toBe(true);
    expect(s.applies).toBe(true);
  });
});

describe('the cache', () => {
  it('serves the second call from memory, re-reads on fresh:true, and forgets on reset', async () => {
    const fake = makeFakeDb({ moduleAtoms: 70 });
    await getAtomInjectionStatus(fake.db);
    const afterFirst = fake.reads();
    expect(afterFirst).toBe(3);

    fake.counts.moduleAtoms = 150;
    fake.counts.ratings = 40;
    const cached = await getAtomInjectionStatus(fake.db);
    expect(fake.reads()).toBe(afterFirst);
    expect(cached.moduleAtoms).toBe(70);
    expect(cached.applies).toBe(false);

    const fresh = await getAtomInjectionStatus(fake.db, { fresh: true });
    expect(fake.reads()).toBe(afterFirst + 3);
    expect(fresh.moduleAtoms).toBe(150);
    expect(fresh.applies).toBe(true);

    fake.counts.moduleAtoms = 10;
    resetAtomInjectionGateCache();
    const afterReset = await getAtomInjectionStatus(fake.db);
    expect(fake.reads()).toBe(afterFirst + 6);
    expect(afterReset.moduleAtoms).toBe(10);
  });
});

describe('a broken read', () => {
  it('never injects: applies=false with reason "gate unavailable" — and is not cached', async () => {
    const fake = makeFakeDb({ mode: 'on', moduleAtoms: 500, ratings: 100 });
    fake.throwReads.value = true;
    const broken = await getAtomInjectionStatus(fake.db);
    expect(broken.applies).toBe(false);
    expect(broken.reason).toBe('gate unavailable');
    expect(broken.thresholds).toEqual({ moduleAtoms: 100, ratings: 30 });

    // The database recovers: the next call reads again instead of serving the failure.
    fake.throwReads.value = false;
    const recovered = await getAtomInjectionStatus(fake.db);
    expect(recovered.applies).toBe(true);
    expect(recovered.reason).toBe('Forced on in Settings');
  });
});

describe('setAtomInjectionMode', () => {
  it('upserts the setting and the next status reflects it without waiting for the cache', async () => {
    const fake = makeFakeDb({ moduleAtoms: 0, ratings: 0 });
    expect((await getAtomInjectionStatus(fake.db)).applies).toBe(false);

    await setAtomInjectionMode(fake.db, 'on');
    expect(fake.settings.get(ATOM_INJECTION_MODE_SETTING_KEY)).toBe('on');
    expect((await getAtomInjectionStatus(fake.db)).applies).toBe(true);

    await setAtomInjectionMode(fake.db, 'off');
    expect((await getAtomInjectionStatus(fake.db)).reason).toBe('Switched off in Settings');

    await setAtomInjectionMode(fake.db, 'auto');
    expect((await getAtomInjectionStatus(fake.db)).reason).toBe('Collecting: 0 of 100 module atoms, 0 of 30 ratings');
  });

  it('refuses a value that is not a mode and writes nothing', async () => {
    const fake = makeFakeDb();
    await expect(setAtomInjectionMode(fake.db, 'sometimes' as unknown as 'auto')).rejects.toThrow(/invalid atom injection mode/);
    expect(fake.settings.size).toBe(0);
  });
});
